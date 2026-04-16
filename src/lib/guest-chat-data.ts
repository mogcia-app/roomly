import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import {
  getAdminDb,
  hasFirebaseAdminCredentials,
} from "@/lib/firebase-admin";
import {
  GUEST_DEFAULT_TRANSLATION_MODEL,
  GUEST_FRONT_DESK_LANGUAGE,
  type GuestTranslationState,
} from "@/lib/guest-contract";
import {
  getGuestThread,
  type GuestLanguage,
  type GuestMessage,
  type GuestStayStatus,
} from "@/lib/guest-demo";
import {
  resolveRoomDisplayName,
  resolveRoomNumber,
} from "@/lib/room-display";

type ThreadMode = "ai" | "human";

type FirestoreChatThread = {
  stay_id?: string;
  stayId?: string;
  room_id?: string;
  roomId?: string;
  room_display_name?: string | null;
  roomDisplayName?: string | null;
  room_number?: string | null;
  roomNumber?: string | null;
  hotel_id?: string | null;
  mode?: ThreadMode;
  status?: "new" | "in_progress" | "resolved";
  category?: string | null;
  event_type?: "chat_handoff_requested";
  rich_menu_action_type?: "ai_message" | null;
  rich_menu_label?: string | null;
  guest_language?: string | null;
  pending_handoff_confirmation?: boolean;
  pending_handoff_body?: string | null;
  pending_handoff_category?: string | null;
  last_message_body?: string;
  last_message_at?: unknown;
  last_message_sender?: "guest" | "ai" | "front" | "system";
  unread_count_front?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type ChatThreadCandidate = {
  id: string;
  updatedAt: number;
};

type FirestoreMessage = {
  thread_id?: string;
  threadId?: string;
  stay_id?: string;
  stayId?: string;
  room_id?: string;
  roomId?: string;
  sender?: "guest" | "front" | "ai" | "system";
  body?: string;
  image_url?: string | null;
  image_alt?: string | null;
  original_body?: string;
  original_language?: string | null;
  translated_body_front?: string | null;
  translated_language_front?: string | null;
  translated_body_guest?: string | null;
  translated_language_guest?: string | null;
  translation_state?: GuestTranslationState;
  handoff_confirmation?: boolean;
  read_at_guest?: { toDate?: () => Date } | string | null;
  readAtGuest?: { toDate?: () => Date } | string | null;
  read_at?: { toDate?: () => Date } | string | null;
  readAt?: { toDate?: () => Date } | string | null;
  seen_at_guest?: { toDate?: () => Date } | string | null;
  seenAtGuest?: { toDate?: () => Date } | string | null;
  timestamp?: { toDate?: () => Date } | unknown;
};

type StructuredKnowledge = NonNullable<GuestStayStatus["hearingSheetKnowledge"]>;
type TranslationPayload = {
  body: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  originalBody: string;
  originalLanguage: string | null;
  translatedBodyFront: string | null;
  translatedLanguageFront: string | null;
  translatedBodyGuest: string | null;
  translatedLanguageGuest: string | null;
  translationState: GuestTranslationState;
};

type OpenAiTranslationResponse = {
  translated_text?: string;
};

type ManualTranslations = Partial<Record<GuestLanguage, string>>;

function resolveGuestLanguage(language: GuestLanguage | null | undefined) {
  return language ?? "ja";
}

function toLanguageCode(language: GuestLanguage | null | undefined) {
  if (language === "en") {
    return "en";
  }

  if (language === "zh-CN") {
    return "zh-CN";
  }

  if (language === "zh-TW") {
    return "zh-TW";
  }

  if (language === "ko") {
    return "ko";
  }

  return "ja";
}

function getOpenAiApiKey() {
  const value = process.env.OPENAI_API_KEY?.trim();
  return value && value.length > 0 ? value : null;
}

function getOpenAiTranslationModel() {
  const value = process.env.OPENAI_TRANSLATION_MODEL?.trim();
  return value && value.length > 0 ? value : GUEST_DEFAULT_TRANSLATION_MODEL;
}

async function translateTextWithOpenAi({
  text,
  sourceLanguage,
  targetLanguage,
  protectedTerms,
}: {
  text: string;
  sourceLanguage: string | null;
  targetLanguage: string;
  protectedTerms?: string[];
}) {
  const apiKey = getOpenAiApiKey();

  if (!apiKey || !text.trim()) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getOpenAiTranslationModel(),
      input: [
        {
          role: "developer",
          content:
            "You are a hotel chat translation assistant. Return only JSON that matches the provided schema. Translate faithfully. Do not summarize. Preserve prices, times, room numbers, proper nouns, phone numbers, and operational instructions exactly.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Source language: ${sourceLanguage ?? "auto-detect"}`,
                `Target language: ${targetLanguage}`,
                "Task: translate the following hotel chat message faithfully.",
                protectedTerms && protectedTerms.length > 0
                  ? `Do not translate or alter these terms: ${protectedTerms.join(", ")}`
                  : null,
                "If the source text is already in the target language, return it unchanged.",
                `Text: ${text}`,
              ].filter((line): line is string => Boolean(line)).join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "translation_payload",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              translated_text: {
                type: "string",
              },
            },
            required: ["translated_text"],
          },
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    console.error("[guest/translation] openai response failed", {
      sourceLanguage,
      targetLanguage,
      status: response.status,
    });
    throw new Error(`OPENAI_TRANSLATION_FAILED:${response.status}`);
  }

  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  const outputText =
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text" && typeof item.text === "string")
      ?.text;

  if (!outputText) {
    console.warn("[guest/translation] empty translation output", {
      sourceLanguage,
      targetLanguage,
    });
    return null;
  }

  const parsed = JSON.parse(outputText) as OpenAiTranslationResponse;
  return parsed.translated_text?.trim() || null;
}

async function buildTranslationPayload({
  displayBody,
  originalBody,
  originalLanguage,
  displayLanguage,
  guestLanguage,
  frontLanguage,
  protectedTerms,
  manualTranslations,
}: {
  displayBody: string;
  originalBody?: string;
  originalLanguage?: string | null;
  displayLanguage?: string | null;
  guestLanguage: GuestLanguage | null | undefined;
  frontLanguage?: string | null;
  protectedTerms?: string[];
  manualTranslations?: ManualTranslations;
  }): Promise<TranslationPayload> {
  const resolvedGuestLanguage = toLanguageCode(guestLanguage);
  const resolvedFrontLanguage = frontLanguage ?? GUEST_FRONT_DESK_LANGUAGE;
  const sourceBody = originalBody?.trim() || displayBody;
  const sourceLanguage = originalLanguage ?? resolvedGuestLanguage;
  const resolvedDisplayLanguage = displayLanguage ?? sourceLanguage;
  const shouldDisplayGuestTranslation = resolvedDisplayLanguage === resolvedGuestLanguage;
  const manualGuestTranslation =
    guestLanguage && manualTranslations?.[guestLanguage]?.trim()
      ? manualTranslations[guestLanguage]?.trim() ?? null
      : null;
  const toGuestVisibleBody = (translatedGuestBody: string | null, fallbackBody: string) =>
    shouldDisplayGuestTranslation ? translatedGuestBody ?? fallbackBody : fallbackBody;

  if (!getOpenAiApiKey()) {
    console.warn("[guest/translation] OPENAI_API_KEY missing, using fallback translation");
    const fallbackGuestBody =
      resolvedDisplayLanguage === resolvedGuestLanguage && sourceLanguage === resolvedGuestLanguage
        ? sourceBody
        : displayBody;

    return {
      body: fallbackGuestBody,
      originalBody: sourceBody,
      originalLanguage: sourceLanguage,
      translatedBodyFront: sourceBody,
      translatedLanguageFront: resolvedFrontLanguage,
      translatedBodyGuest: fallbackGuestBody,
      translatedLanguageGuest: resolvedGuestLanguage,
      translationState:
        sourceLanguage === resolvedGuestLanguage && sourceLanguage === resolvedFrontLanguage
          ? "not_required"
          : "fallback",
    };
  }

  try {
    const translatedBodyFront =
      sourceLanguage === resolvedFrontLanguage
        ? sourceBody
        : await translateTextWithOpenAi({
            text: sourceBody,
            sourceLanguage,
            targetLanguage: resolvedFrontLanguage,
            protectedTerms,
          });

    const translatedBodyGuest =
      manualGuestTranslation
        ? manualGuestTranslation
        : resolvedDisplayLanguage === resolvedGuestLanguage
        ? sourceLanguage === resolvedGuestLanguage
          ? sourceBody
          : await translateTextWithOpenAi({
              text: sourceBody,
              sourceLanguage,
              targetLanguage: resolvedGuestLanguage,
              protectedTerms,
            })
        : sourceLanguage === resolvedGuestLanguage
          ? sourceBody
          : await translateTextWithOpenAi({
              text: sourceBody,
              sourceLanguage,
              targetLanguage: resolvedGuestLanguage,
              protectedTerms,
            });

    const guestVisibleBody = toGuestVisibleBody(translatedBodyGuest, displayBody);

    return {
      body: guestVisibleBody,
      originalBody: sourceBody,
      originalLanguage: sourceLanguage,
      translatedBodyFront: translatedBodyFront ?? sourceBody,
      translatedLanguageFront: resolvedFrontLanguage,
      translatedBodyGuest: translatedBodyGuest ?? guestVisibleBody,
      translatedLanguageGuest: resolvedGuestLanguage,
      translationState:
        translatedBodyFront || translatedBodyGuest ? "ready" : "fallback",
    };
  } catch (error) {
    console.error("[guest/translation] falling back", {
      sourceLanguage,
      displayLanguage: resolvedDisplayLanguage,
      targetGuestLanguage: resolvedGuestLanguage,
      targetFrontLanguage: resolvedFrontLanguage,
      error,
    });
    return {
      body: toGuestVisibleBody(displayBody, displayBody),
      originalBody: sourceBody,
      originalLanguage: sourceLanguage,
      translatedBodyFront: sourceBody,
      translatedLanguageFront: resolvedFrontLanguage,
      translatedBodyGuest: toGuestVisibleBody(displayBody, displayBody),
      translatedLanguageGuest: resolvedGuestLanguage,
      translationState: "fallback",
    };
  }

}

function buildFallbackMessagesForLanguage(
  mode: ThreadMode,
  language: GuestLanguage | null | undefined,
) {
  return getGuestThread(mode, resolveGuestLanguage(language));
}

function normalizeMessage(
  id: string,
  message: FirestoreMessage,
): GuestMessage | null {
  if ((!message.body && !message.image_url) || !message.sender) {
    return null;
  }

  const timestamp =
    typeof message.timestamp === "object" &&
    message.timestamp !== null &&
    "toDate" in message.timestamp &&
    typeof message.timestamp.toDate === "function"
      ? message.timestamp.toDate().toISOString()
      : null;

  const readAtSource =
    message.read_at_guest ??
    message.readAtGuest ??
    message.read_at ??
    message.readAt ??
    message.seen_at_guest ??
    message.seenAtGuest ??
    null;

  const readAt =
    typeof readAtSource === "object" &&
    readAtSource !== null &&
    "toDate" in readAtSource &&
    typeof readAtSource.toDate === "function"
      ? readAtSource.toDate().toISOString()
      : typeof readAtSource === "string" && readAtSource.trim()
        ? readAtSource
        : null;
  const guestVisibleBody =
    message.translated_body_guest?.trim() ||
    message.body?.trim() ||
    "";

  return {
    id,
    sender: message.sender,
    body: guestVisibleBody,
    imageUrl: message.image_url ?? null,
    imageAlt: message.image_alt ?? null,
    timestamp,
    readAt,
    isRead: Boolean(readAt),
    originalBody: message.original_body ?? null,
    originalLanguage: message.original_language ?? null,
    translatedBodyFront: message.translated_body_front ?? null,
    translatedLanguageFront: message.translated_language_front ?? null,
    translatedBodyGuest: message.translated_body_guest ?? null,
    translatedLanguageGuest: message.translated_language_guest ?? null,
    translationState: message.translation_state ?? "not_required",
    handoffConfirmation: message.handoff_confirmation === true,
  };
}

function buildRuntimeMessage(
  sender: NonNullable<FirestoreMessage["sender"]>,
  payload: TranslationPayload,
  options?: {
    handoffConfirmation?: boolean;
  },
): GuestMessage {
  return {
    id: `runtime-${sender}-${Math.random().toString(36).slice(2, 10)}`,
    sender,
    body: payload.body,
    imageUrl: payload.imageUrl ?? null,
    imageAlt: payload.imageAlt ?? null,
    timestamp: new Date().toISOString(),
    readAt: null,
    isRead: false,
    originalBody: payload.originalBody,
    originalLanguage: payload.originalLanguage,
    translatedBodyFront: payload.translatedBodyFront,
    translatedLanguageFront: payload.translatedLanguageFront,
    translatedBodyGuest: payload.translatedBodyGuest,
    translatedLanguageGuest: payload.translatedLanguageGuest,
    translationState: payload.translationState,
    handoffConfirmation: options?.handoffConfirmation === true,
  };
}

async function addMessage(
  stayStatus: GuestStayStatus,
  threadId: string,
  sender: FirestoreMessage["sender"],
  payload: TranslationPayload,
  options?: {
    handoffConfirmation?: boolean;
  },
) {
  const messageRef = await getAdminDb().collection("messages").add({
    thread_id: threadId,
    stay_id: stayStatus.stayId ?? stayStatus.roomId,
    room_id: stayStatus.roomId,
    sender,
    body: payload.body,
    image_url: payload.imageUrl ?? null,
    image_alt: payload.imageAlt ?? null,
    original_body: payload.originalBody,
    original_language: payload.originalLanguage,
    translated_body_front: payload.translatedBodyFront,
    translated_language_front: payload.translatedLanguageFront,
    translated_body_guest: payload.translatedBodyGuest,
    translated_language_guest: payload.translatedLanguageGuest,
    translation_state: payload.translationState,
    handoff_confirmation: options?.handoffConfirmation === true,
    timestamp: FieldValue.serverTimestamp(),
  } satisfies FirestoreMessage & { timestamp: unknown });

  return messageRef.id;
}

async function notifyFrontdeskGuestMessage(params: {
  hotelId: string | null | undefined;
  threadId: string;
  messageId: string;
}) {
  const baseUrl = process.env.ROOMLY_CONSOLE_BASE_URL?.trim();
  const token = process.env.FRONTDESK_API_BEARER_TOKEN?.trim();
  const hotelId = params.hotelId?.trim();

  if (!hotelId) {
    console.error("[frontdesk-push] missing hotelId", {
      hotelId: params.hotelId ?? null,
      threadId: params.threadId,
      messageId: params.messageId,
    });
    return;
  }

  if (!baseUrl || !token) {
    console.error("[frontdesk-push] config missing", {
      hotelId,
      threadId: params.threadId,
      messageId: params.messageId,
      hasBaseUrl: Boolean(baseUrl),
      hasToken: Boolean(token),
    });
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/api/public/frontdesk/push-notifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hotelId,
        threadId: params.threadId,
        messageId: params.messageId,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("[frontdesk-push] request failed", {
        hotelId,
        threadId: params.threadId,
        messageId: params.messageId,
        status: response.status,
        error: body,
      });
    }
  } catch (error) {
    console.error("[frontdesk-push] request error", {
      hotelId,
      threadId: params.threadId,
      messageId: params.messageId,
      error,
    });
  }
}

function resolveThreadGuestLanguage(
  thread: FirestoreChatThread | null | undefined,
  stayStatus: GuestStayStatus,
) {
  const threadLanguage = thread?.guest_language;

  if (
    threadLanguage === "ja" ||
    threadLanguage === "en" ||
    threadLanguage === "zh-CN" ||
    threadLanguage === "zh-TW" ||
    threadLanguage === "ko"
  ) {
    return threadLanguage;
  }

  return stayStatus.selectedLanguage ?? "ja";
}

async function findThread(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
) {
  const db = getAdminDb();
  const stayKey = stayStatus.stayId ?? stayStatus.roomId;
  const toUpdatedAt = (value: unknown) =>
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
      ? value.toDate().getTime()
      : 0;
  const pickLatestThread = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
    const candidates = docs.map((docSnapshot) => {
      const data = docSnapshot.data() as FirestoreChatThread;
      return {
        id: docSnapshot.id,
        updatedAt: Math.max(
          toUpdatedAt(data.updated_at),
          toUpdatedAt(data.created_at),
          toUpdatedAt(data.last_message_at),
        ),
      } satisfies ChatThreadCandidate;
    });

    return candidates.sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
  };

  const snapshot = await db
    .collection("chat_threads")
    .where("stay_id", "==", stayKey)
    .where("mode", "==", mode)
    .get();

  if (!snapshot.empty) {
    const latestThread = pickLatestThread(snapshot.docs);

    if (latestThread) {
      return db.collection("chat_threads").doc(latestThread.id).get();
    }
  }

  const altSnapshot = await db
    .collection("chat_threads")
    .where("stayId", "==", stayKey)
    .where("mode", "==", mode)
    .get();

  if (!altSnapshot.empty) {
    const latestThread = pickLatestThread(altSnapshot.docs);

    if (latestThread) {
      return db.collection("chat_threads").doc(latestThread.id).get();
    }
  }

  return null;
}

async function createThread(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
) {
  const roomDisplayName = resolveRoomDisplayName({
    room_id: stayStatus.roomId,
    room_number: stayStatus.roomNumber,
    display_name: stayStatus.roomDisplayName ?? stayStatus.roomLabel,
  });
  const roomNumber = resolveRoomNumber({
    room_id: stayStatus.roomId,
    room_number: stayStatus.roomNumber,
  });
  const threadRef = await getAdminDb().collection("chat_threads").add({
    stay_id: stayStatus.stayId ?? stayStatus.roomId,
    room_id: stayStatus.roomId,
    room_display_name: roomDisplayName,
    room_number: roomNumber,
    hotel_id: stayStatus.hotelId ?? null,
    mode,
    status: mode === "human" ? "new" : "resolved",
    guest_language: stayStatus.selectedLanguage,
    last_message_body: "",
    unread_count_front: 0,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  } satisfies FirestoreChatThread & { created_at: unknown });

  return threadRef.id;
}

async function ensureThread(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
) {
  const existingThread = await findThread(stayStatus, mode);

  if (existingThread) {
    return existingThread.id;
  }

  return createThread(stayStatus, mode);
}

async function updateHumanThreadMetadata(
  threadId: string,
  stayStatus: GuestStayStatus,
  lastMessageBody: string,
  lastMessageSender: "guest" | "ai" | "front" | "system",
  category?: string,
  status?: "new" | "in_progress",
) {
  const roomDisplayName = resolveRoomDisplayName({
    room_id: stayStatus.roomId,
    room_number: stayStatus.roomNumber,
    display_name: stayStatus.roomDisplayName ?? stayStatus.roomLabel,
  });
  const roomNumber = resolveRoomNumber({
    room_id: stayStatus.roomId,
    room_number: stayStatus.roomNumber,
  });
  await getAdminDb().collection("chat_threads").doc(threadId).set(
    {
      stay_id: stayStatus.stayId ?? stayStatus.roomId,
      room_id: stayStatus.roomId,
      room_display_name: roomDisplayName,
      room_number: roomNumber,
      hotel_id: stayStatus.hotelId ?? null,
      mode: "human" satisfies ThreadMode,
      status: status ?? "new",
      category: category ?? null,
      event_type: "chat_handoff_requested" as const,
      guest_language: stayStatus.selectedLanguage,
      last_message_body: lastMessageBody,
      last_message_at: FieldValue.serverTimestamp(),
      last_message_sender: lastMessageSender,
      unread_count_front: FieldValue.increment(1),
      updated_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
    } satisfies FirestoreChatThread & {
      last_message_at: unknown;
      unread_count_front: unknown;
      updated_at: unknown;
      created_at: unknown;
    },
    { merge: true },
  );
}

async function updateAiThreadMetadata(
  threadId: string,
  stayStatus: GuestStayStatus,
  lastMessageBody: string,
  lastMessageSender: "guest" | "ai" | "front" | "system",
  options?: {
    category?: string | null;
    richMenuActionType?: "ai_message" | null;
    richMenuLabel?: string | null;
    pendingHandoffConfirmation?: boolean;
    pendingHandoffBody?: string | null;
    pendingHandoffCategory?: string | null;
  },
) {
  const roomDisplayName = resolveRoomDisplayName({
    room_id: stayStatus.roomId,
    room_number: stayStatus.roomNumber,
    display_name: stayStatus.roomDisplayName ?? stayStatus.roomLabel,
  });
  const roomNumber = resolveRoomNumber({
    room_id: stayStatus.roomId,
    room_number: stayStatus.roomNumber,
  });

  await getAdminDb().collection("chat_threads").doc(threadId).set(
    {
      stay_id: stayStatus.stayId ?? stayStatus.roomId,
      room_id: stayStatus.roomId,
      room_display_name: roomDisplayName,
      room_number: roomNumber,
      hotel_id: stayStatus.hotelId ?? null,
      mode: "ai" satisfies ThreadMode,
      status: "resolved" as const,
      category: options?.category ?? null,
      rich_menu_action_type: options?.richMenuActionType ?? null,
      rich_menu_label: options?.richMenuLabel ?? null,
      guest_language: stayStatus.selectedLanguage,
      pending_handoff_confirmation: options?.pendingHandoffConfirmation ?? false,
      pending_handoff_body: options?.pendingHandoffBody ?? null,
      pending_handoff_category: options?.pendingHandoffCategory ?? null,
      last_message_body: lastMessageBody,
      last_message_at: FieldValue.serverTimestamp(),
      last_message_sender: lastMessageSender,
      updated_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
    } satisfies FirestoreChatThread & {
      last_message_at: unknown;
      updated_at: unknown;
      created_at: unknown;
    },
    { merge: true },
  );
}

async function handoffGuestReplyFromAiMessage(
  stayStatus: GuestStayStatus,
  body: string,
  guestPayload: TranslationPayload,
  category?: string | null,
) {
  const language = resolveGuestLanguage(stayStatus.selectedLanguage);
  const copy = getLocalizedServerCopy(language);
  const threadId = await ensureThread(stayStatus, "human");
  const existingHumanThread = await getAdminDb().collection("chat_threads").doc(threadId).get();
  const existingHumanThreadData = existingHumanThread.data() as FirestoreChatThread | undefined;
  const waitingPayload = await buildTranslationPayload({
    displayBody: copy.handoffWaiting,
    guestLanguage: resolveThreadGuestLanguage(existingHumanThreadData, stayStatus),
    originalLanguage: GUEST_FRONT_DESK_LANGUAGE,
    displayLanguage: toLanguageCode(resolveThreadGuestLanguage(existingHumanThreadData, stayStatus)),
    frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
  });

  const guestMessageId = await addMessage(stayStatus, threadId, "guest", guestPayload);
  await addMessage(
    stayStatus,
    threadId,
    "system",
    waitingPayload,
  );

  await updateHumanThreadMetadata(
    threadId,
    stayStatus,
    guestPayload.translatedBodyFront ?? body,
    "guest",
    category ?? undefined,
    existingHumanThreadData?.status === "in_progress" ? "in_progress" : "new",
  );
  await notifyFrontdeskGuestMessage({
    hotelId: stayStatus.hotelId,
    threadId,
    messageId: guestMessageId,
  });

  return {
    ok: true as const,
    threadId,
    messages: [
      buildRuntimeMessage("guest", guestPayload),
      buildRuntimeMessage("system", waitingPayload),
    ],
    resolvedMode: "human" as const,
  };
}

async function mirrorAiMessageToHumanThread(
  stayStatus: GuestStayStatus,
  payload: TranslationPayload,
  lastMessageBody: string,
  options?: {
    category?: string | null;
    status?: "new" | "in_progress";
    handoffConfirmation?: boolean;
  },
) {
  const threadId = await ensureThread(stayStatus, "human");
  const existingHumanThread = await getAdminDb().collection("chat_threads").doc(threadId).get();
  const existingHumanThreadData = existingHumanThread.data() as FirestoreChatThread | undefined;

  await addMessage(
    stayStatus,
    threadId,
    "ai",
    payload,
    {
      handoffConfirmation: options?.handoffConfirmation === true,
    },
  );

  await updateHumanThreadMetadata(
    threadId,
    stayStatus,
    payload.translatedBodyFront ?? lastMessageBody,
    "ai",
    options?.category ?? existingHumanThreadData?.category ?? undefined,
    options?.status ?? (existingHumanThreadData?.status === "in_progress" ? "in_progress" : "new"),
  );

  return threadId;
}

export async function ensureGuestHumanThread(stayStatus: GuestStayStatus) {
  if (!hasFirebaseAdminCredentials()) {
    return "demo-human";
  }

  return ensureThread(stayStatus, "human");
}

export async function updateGuestThreadLanguage(
  stayStatus: GuestStayStatus,
  language: GuestLanguage,
) {
  if (!hasFirebaseAdminCredentials()) {
    return { updated: false as const, threadId: null, mode: null };
  }

  const humanThread = await findThread(stayStatus, "human");

  if (humanThread) {
    await getAdminDb().collection("chat_threads").doc(humanThread.id).set(
      {
        guest_language: language,
        updated_at: FieldValue.serverTimestamp(),
      } satisfies Pick<FirestoreChatThread, "guest_language" | "updated_at"> & {
        updated_at: unknown;
      },
      { merge: true },
    );

    return { updated: true as const, threadId: humanThread.id, mode: "human" as const };
  }

  const aiThread = await findThread(stayStatus, "ai");

  if (aiThread) {
    await getAdminDb().collection("chat_threads").doc(aiThread.id).set(
      {
        guest_language: language,
        updated_at: FieldValue.serverTimestamp(),
      } satisfies Pick<FirestoreChatThread, "guest_language" | "updated_at"> & {
        updated_at: unknown;
      },
      { merge: true },
    );

    return { updated: true as const, threadId: aiThread.id, mode: "ai" as const };
  }

  return { updated: false as const, threadId: null, mode: null };
}

async function getMessagesByThreadId(threadId: string) {
  const db = getAdminDb();
  const directSnapshot = await db
    .collection("messages")
    .where("thread_id", "==", threadId)
    .orderBy("timestamp", "asc")
    .get();

  if (!directSnapshot.empty) {
    return directSnapshot.docs
      .map((docSnapshot) =>
        normalizeMessage(docSnapshot.id, docSnapshot.data() as FirestoreMessage),
      )
      .filter((value): value is GuestMessage => value !== null);
  }

  const altSnapshot = await db
    .collection("messages")
    .where("threadId", "==", threadId)
    .orderBy("timestamp", "asc")
    .get();

  return altSnapshot.docs
    .map((docSnapshot) =>
      normalizeMessage(docSnapshot.id, docSnapshot.data() as FirestoreMessage),
    )
    .filter((value): value is GuestMessage => value !== null);
}

function getLocalizedServerCopy(language: GuestLanguage) {
  if (language === "en") {
    return {
      handoffRequest: "Please connect me to the front desk.",
      handoffWaiting: "The front desk has been notified. Please wait for a reply.",
      emergencyWaiting: "Emergency alert sent to the front desk. Please move to a safe place and wait for assistance.",
      handoffConfirmationPrompt: "I can't confirm this with AI alone. Would you like me to forward this message to the front desk?",
      handoffConfirmationDeclined: "Understood. If you need anything else, please send another message.",
      taxiHandoffPrompt: "Taxi request received. Please send the date and time, destination, and any notes for the front desk.",
      frontDeskFallback: "The AI cannot confirm this. Please use \"Delivery / Request\" below to send it to the front desk or switch to staff support.",
      handoffGuidance: "If you want the front desk to check this, use \"Delivery / Request\" below to send your request. Staff support can take over from there.",
      emergencyFallback: "Emergency contact information is not registered. Please contact the front desk immediately.",
    };
  }

  if (language === "zh-CN") {
    return {
      handoffRequest: "请帮我联系前台。",
      handoffWaiting: "已通知前台，请等待回复。",
      emergencyWaiting: "已向前台发送紧急通知。请优先确保安全，并在安全地点等待协助。",
      handoffConfirmationPrompt: "这项内容仅靠 AI 无法确认。要我将这条消息转给前台吗？",
      handoffConfirmationDeclined: "好的。如还有其他问题，请继续发送消息。",
      taxiHandoffPrompt: "已收到叫车需求。请发送乘车日期时间、目的地，以及需要注意的事项，前台会跟进。",
      frontDeskFallback: "此内容 AI 无法确认。请使用下方的“送达 / 请求”发送给前台，或切换为人工处理。",
      handoffGuidance: "如果您想让前台帮您确认，请使用下方的“送达 / 请求”发送需求，之后可切换为人工处理。",
      emergencyFallback: "未找到已登记的紧急联系方式，请立即联系前台。",
    };
  }

  if (language === "zh-TW") {
    return {
      handoffRequest: "請幫我聯繫櫃台。",
      handoffWaiting: "已通知櫃台，請等待回覆。",
      emergencyWaiting: "已向櫃台發送緊急通知。請優先確保安全，並在安全地點等待協助。",
      handoffConfirmationPrompt: "這項內容僅靠 AI 無法確認。要我將這則訊息轉給櫃台嗎？",
      handoffConfirmationDeclined: "好的。如果還有其他問題，請再傳送訊息。",
      taxiHandoffPrompt: "已收到叫車需求。請傳送搭乘日期時間、目的地，以及需要注意的事項，櫃台會協助處理。",
      frontDeskFallback: "此內容 AI 無法確認。請使用下方的「送達 / 請求」發送給櫃台，或切換為人工處理。",
      handoffGuidance: "如果您想請櫃台幫您確認，請使用下方的「送達 / 請求」送出需求，之後可切換為人工處理。",
      emergencyFallback: "未找到已登記的緊急聯絡方式，請立即聯絡櫃台。",
    };
  }

  if (language === "ko") {
    return {
      handoffRequest: "프런트로 연결해 주세요.",
      handoffWaiting: "프런트에 알렸습니다. 답변을 기다려 주세요.",
      emergencyWaiting: "긴급 상황을 프런트에 전달했습니다. 안전을 먼저 확보하고 안전한 장소에서 도움을 기다려 주세요.",
      handoffConfirmationPrompt: "이 내용은 AI만으로 확인할 수 없습니다. 이 메시지를 프런트로 전달할까요?",
      handoffConfirmationDeclined: "알겠습니다. 다른 문의가 있으면 다시 메시지를 보내 주세요.",
      taxiHandoffPrompt: "택시 요청을 접수했습니다. 이용 일시, 목적지, 전달 사항을 보내 주시면 프런트가 확인합니다.",
      frontDeskFallback: "이 내용은 AI가 확인할 수 없습니다. 아래의 \"배달 / 요청\"으로 프런트에 보내거나 직원 대응으로 전환해 주세요.",
      handoffGuidance: "프런트에 확인을 맡기려면 아래의 \"배달 / 요청\"으로 내용을 보내 주세요. 이후 직원 대응으로 이어갈 수 있습니다.",
      emergencyFallback: "등록된 긴급 연락처를 찾지 못했습니다. 즉시 프런트로 문의해 주세요.",
    };
  }

  return {
    handoffRequest: "フロント対応をお願いします。",
    handoffWaiting: "フロントへ通知しました。返信をお待ちください。",
    emergencyWaiting: "緊急連絡をフロントへ通知しました。安全を確保した場所でお待ちください。",
    handoffConfirmationPrompt: "この内容をフロントへおつなぎしてもいいですか？",
    handoffConfirmationDeclined: "承知しました。ほかにご質問があればそのままお送りください。",
    taxiHandoffPrompt: "タクシー手配を承りました。フロントへ送るため、以下をご記入ください。\n・ご利用日時\n・行き先\n・注意事項",
    frontDeskFallback: "この内容はAIでは確認できません。下の「お届け・ご依頼」からフロントへ送るか、有人対応へ切り替えてください。",
    handoffGuidance: "フロントに確認したい場合は、下の「お届け・ご依頼」から内容を送ってください。必要ならそのままスタッフ対応へつなげられます。",
    emergencyFallback:
      "登録済みの緊急連絡先が見つかりません。すぐにフロントへご確認ください。",
  };
}

function isGuestAffirmative(body: string) {
  const normalized = normalizeText(body);
  return [
    "はい",
    "お願いします",
    "おねがいします",
    "ok",
    "okay",
    "yes",
    "y",
    "sure",
    "お願いします。",
    "はい。",
  ].some((entry) => normalized === normalizeText(entry));
}

function isGuestNegative(body: string) {
  const normalized = normalizeText(body);
  return [
    "いいえ",
    "不要です",
    "大丈夫です",
    "結構です",
    "no",
    "n",
    "cancel",
  ].some((entry) => normalized === normalizeText(entry));
}

function isTaxiHandoffCategory(category: string) {
  const normalized = normalizeText(category);

  return (
    normalized.includes("タクシ") ||
    normalized.includes("taxi") ||
    normalized.includes("計程車") ||
    normalized.includes("出租车") ||
    normalized.includes("택시")
  );
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[\s　。、，,!?？!:\-_/\\()[\]{}"'`]+/g, "");
}

function isFrontDeskHandoffIntent(body: string, normalizedBody: string) {
  const asksToContactFrontDesk =
    body.includes("確認") ||
    body.includes("連絡") ||
    body.includes("聞いて") ||
    body.includes("問い合わせ") ||
    body.includes("つないで") ||
    body.includes("繋いで") ||
    body.includes("代わりに") ||
    body.includes("帮我") ||
    body.includes("聯繫") ||
    body.includes("联系") ||
    body.includes("确认") ||
    body.includes("確認") ||
    body.includes("연락") ||
    body.includes("확인") ||
    body.includes("연결");

  const mentionsFrontDesk =
    normalizedBody.includes("フロント") ||
    normalizedBody.includes("前台") ||
    normalizedBody.includes("staff") ||
    normalizedBody.includes("frontdesk") ||
    normalizedBody.includes("スタッフ") ||
    normalizedBody.includes("직원") ||
    normalizedBody.includes("프런트");

  return asksToContactFrontDesk && mentionsFrontDesk;
}

function isLuggageStorageIntent(body: string, normalizedBody: string) {
  const mentionsLuggage =
    body.includes("荷物") ||
    body.includes("手荷物") ||
    body.includes("スーツケース") ||
    body.includes("キャリーケース") ||
    body.includes("짐") ||
    body.includes("수하물") ||
    body.includes("行李") ||
    body.includes("行李箱") ||
    includesAny(normalizedBody, ["luggage", "baggage", "suitcase", "bags", "bag"]);

  const mentionsStorageOrTiming =
    body.includes("預か") ||
    body.includes("保管") ||
    body.includes("チェックイン前") ||
    body.includes("チェックインまで") ||
    body.includes("存放") ||
    body.includes("寄存") ||
    body.includes("보관") ||
    includesAny(normalizedBody, [
      "storemyluggage",
      "storeluggage",
      "luggagestorage",
      "bagstorage",
      "keepmyluggage",
      "holdmyluggage",
      "holdourluggage",
      "leaveourbags",
      "leaveourluggage",
      "beforecheckin",
      "untilcheckin",
      "beforecheckintime",
    ]);

  return mentionsLuggage && mentionsStorageOrTiming;
}

function isMaintenanceIssueIntent(body: string, normalizedBody: string) {
  const mentionsEquipment =
    body.includes("エアコン") ||
    body.includes("空調") ||
    body.includes("冷房") ||
    body.includes("暖房") ||
    body.includes("クーラー") ||
    body.includes("air conditioner") ||
    body.includes("aircon") ||
    body.includes("ac ") ||
    body.includes(" a/c") ||
    body.includes("냉방") ||
    body.includes("난방") ||
    body.includes("空调") ||
    body.includes("冷氣") ||
    includesAny(normalizedBody, ["airconditioner", "aircon"]);

  const mentionsIssueOrCheck =
    body.includes("調子が悪") ||
    body.includes("壊") ||
    body.includes("故障") ||
    body.includes("効かない") ||
    body.includes("動かない") ||
    body.includes("見て") ||
    body.includes("確認して") ||
    body.includes("確認いただ") ||
    body.includes("check it") ||
    body.includes("isn't working") ||
    body.includes("is not working") ||
    body.includes("not working properly") ||
    body.includes("broken") ||
    body.includes("issue") ||
    body.includes("problem") ||
    body.includes("malfunction") ||
    body.includes("고장") ||
    body.includes("안 돼") ||
    body.includes("不工作") ||
    body.includes("坏了") ||
    body.includes("故障") ||
    includesAny(normalizedBody, [
      "workingproperly",
      "isntworking",
      "notworking",
      "pleasecheck",
      "checkit",
      "broken",
      "problem",
      "malfunction",
    ]);

  return mentionsEquipment && mentionsIssueOrCheck;
}

function buildCharacterNgrams(value: string, size = 2) {
  const normalized = normalizeText(value);

  if (normalized.length < size) {
    return normalized ? [normalized] : [];
  }

  const ngrams: string[] = [];

  for (let index = 0; index <= normalized.length - size; index += 1) {
    ngrams.push(normalized.slice(index, index + size));
  }

  return ngrams;
}

const KNOWLEDGE_MATCH_STOPWORDS = new Set([
  "ご利用",
  "利用",
  "日時",
  "時間",
  "時刻",
  "日付",
  "場所",
  "行き先",
  "注意事項",
  "注意",
  "内容",
  "希望",
  "必要事項",
  "記載",
  "ください",
  "案内",
  "確認",
  "方法",
  "where",
  "what",
  "when",
  "time",
  "date",
  "place",
  "location",
  "details",
  "note",
  "notes",
  "please",
  "info",
  "information",
  "位置",
  "地点",
  "时间",
  "日期",
  "事项",
  "內容",
  "内容",
  "時間",
  "日期",
  "事項",
  "내용",
  "시간",
  "장소",
  "위치",
  "사항",
]);

function extractSearchTokens(value: string) {
  const tokens = value.match(/[A-Za-z0-9]{2,}|[\u3040-\u30ff\u3400-\u9fff]{2,}/g) ?? [];
  return [
    ...new Set(
      tokens
        .map((token) => normalizeText(token))
        .filter((token) => Boolean(token) && !KNOWLEDGE_MATCH_STOPWORDS.has(token)),
    ),
  ];
}

function compactParts(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function compactLines(values: Array<string | null | undefined>) {
  return compactParts(values).join("\n");
}

function takeFormatted(values: string[]) {
  return values.slice(0, 2).join("\n");
}

function summarizeKnowledgeAvailability(knowledge: GuestStayStatus["hearingSheetKnowledge"]) {
  if (!knowledge) {
    return null;
  }

  return {
    frontDeskHours: knowledge.frontDeskHours.length,
    wifi: knowledge.wifi.length,
    breakfast: knowledge.breakfast.length,
    baths: knowledge.baths.length,
    facilities: knowledge.facilities.length,
    facilityLocations: knowledge.facilityLocations.length,
    amenities: knowledge.amenities.length,
    parking: knowledge.parking.length,
    emergency: knowledge.emergency.length,
    faq: knowledge.faq.length,
    checkout: knowledge.checkout.length,
    roomService: knowledge.roomService.length,
    transport: knowledge.transport.length,
    nearbySpots: knowledge.nearbySpots.length,
  };
}

function formatBoolean(value: boolean | null, truthy: string, falsy: string) {
  if (value === true) {
    return truthy;
  }

  if (value === false) {
    return falsy;
  }

  return null;
}

function extractFloorFromQuestion(body: string) {
  const japaneseMatch = body.match(/([0-9]+)\s*階/);

  if (japaneseMatch?.[1]) {
    return `${japaneseMatch[1]}階`;
  }

  const englishMatch = body.toLowerCase().match(/floor\s*([0-9]+)/);
  return englishMatch?.[1] ? `${englishMatch[1]}階` : null;
}

function extractFloorNumber(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const match =
    normalized.match(/([0-9]+)\s*階/) ??
    normalized.match(/([0-9]+)\s*f\b/) ??
    normalized.match(/\bf\s*([0-9]+)\b/) ??
    normalized.match(/\bfloor\s*([0-9]+)\b/) ??
    normalized.match(/^([0-9]+)$/);

  return match?.[1] ?? null;
}

function isSameFloor(left: string | null | undefined, right: string | null | undefined) {
  const leftFloor = extractFloorNumber(left);
  const rightFloor = extractFloorNumber(right);

  if (!leftFloor || !rightFloor) {
    return false;
  }

  return leftFloor === rightFloor;
}

function scoreFaq(question: string, candidate: string) {
  const normalizedQuestion = normalizeText(question);
  const normalizedCandidate = normalizeText(candidate);

  if (!normalizedQuestion || !normalizedCandidate) {
    return 0;
  }

  if (
    normalizedQuestion.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedQuestion)
  ) {
    return Math.min(normalizedQuestion.length, normalizedCandidate.length) + 10;
  }

  let score = 0;

  for (const token of candidate.match(/[A-Za-z]{3,}|[\u3040-\u30ff\u3400-\u9fff]{2,}/g) ?? []) {
    if (normalizedQuestion.includes(normalizeText(token))) {
      score += token.length;
    }
  }

  return score;
}

function scoreKnowledgeMatch(question: string, candidate: string) {
  const normalizedQuestion = normalizeText(question);
  const normalizedCandidate = normalizeText(candidate);

  if (!normalizedQuestion || !normalizedCandidate) {
    return 0;
  }

  if (
    normalizedQuestion.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedQuestion)
  ) {
    return Math.min(normalizedQuestion.length, normalizedCandidate.length) + 12;
  }

  let score = 0;
  const questionTokens = extractSearchTokens(question);
  const candidateTokens = new Set(extractSearchTokens(candidate));
  let matchedTokenCount = 0;

  for (const token of questionTokens) {
    if (candidateTokens.has(token)) {
      matchedTokenCount += 1;
      score += Math.max(2, token.length);
    }
  }

  if (matchedTokenCount === 0) {
    return 0;
  }

  const questionNgrams = buildCharacterNgrams(question);
  const candidateNgrams = new Set(buildCharacterNgrams(candidate));

  for (const ngram of questionNgrams) {
    if (candidateNgrams.has(ngram)) {
      score += 1;
    }
  }

  return score;
}

function formatWifiEntry(entry: StructuredKnowledge["wifi"][number]) {
  return compactParts([
    entry.floor ? `${entry.floor}` : null,
    entry.ssid ? `SSID: ${entry.ssid}` : null,
    entry.password ? `PASS: ${entry.password}` : null,
    entry.note,
  ]).join(" / ");
}

function formatBreakfastEntry(entry: StructuredKnowledge["breakfast"][number]) {
  return compactParts([
    entry.style,
    entry.hours ? `営業時間: ${entry.hours}` : null,
    entry.location ? `場所: ${entry.location}` : null,
    entry.price ? `料金: ${entry.price}` : null,
    formatBoolean(entry.reservationRequired, "予約: 必要", "予約: 不要"),
    entry.note,
  ]).join(" / ");
}

function formatBathEntry(entry: StructuredKnowledge["baths"][number]) {
  return compactParts([
    entry.name,
    entry.hours ? `営業時間: ${entry.hours}` : null,
    entry.location ? `場所: ${entry.location}` : null,
    entry.note,
  ]).join(" / ");
}

function formatFacilityEntry(entry: StructuredKnowledge["facilities"][number]) {
  return compactParts([
    entry.name,
    entry.hours ? `営業時間: ${entry.hours}` : null,
    entry.note,
  ]).join(" / ");
}

function formatFacilityLocationEntry(entry: StructuredKnowledge["facilityLocations"][number]) {
  return compactParts([
    entry.name,
    entry.floor ? `場所: ${entry.floor}` : null,
    entry.note,
  ]).join(" / ");
}

function formatAmenityEntry(entry: StructuredKnowledge["amenities"][number]) {
  return compactParts([
    entry.name,
    formatBoolean(entry.inRoom, "客室内にあります", "客室内にはありません"),
    formatBoolean(
      entry.availableOnRequest,
      "追加対応: 可能",
      "追加対応: 不可",
    ),
    entry.requestMethod ? `依頼方法: ${entry.requestMethod}` : null,
    entry.price ? `料金: ${entry.price}` : null,
    entry.note,
  ]).join(" / ");
}

function formatParkingEntry(entry: StructuredKnowledge["parking"][number]) {
  return compactParts([
    entry.name,
    entry.location ? `場所: ${entry.location}` : null,
    entry.capacity ? `台数: ${entry.capacity}` : null,
    entry.price ? `料金: ${entry.price}` : null,
    entry.hours ? `利用時間: ${entry.hours}` : null,
    formatBoolean(entry.reservationRequired, "予約: 必要", "予約: 不要"),
    entry.note,
  ]).join(" / ");
}

function formatEmergencyEntry(entry: StructuredKnowledge["emergency"][number]) {
  return compactParts([
    entry.category,
    entry.contact ? `連絡先: ${entry.contact}` : null,
    entry.steps ? `手順: ${entry.steps}` : null,
    entry.note,
  ]).join(" / ");
}

function formatCheckoutEntry(entry: StructuredKnowledge["checkout"][number]) {
  return compactParts([
    entry.time ? `時間: ${entry.time}` : null,
    entry.method ? `方法: ${entry.method}` : null,
    entry.keyReturnLocation ? `鍵の返却: ${entry.keyReturnLocation}` : null,
    entry.lateCheckoutPolicy ? `レイトチェックアウト: ${entry.lateCheckoutPolicy}` : null,
    entry.note,
  ]).join(" / ");
}

function formatRoomServiceEntry(entry: StructuredKnowledge["roomService"][number]) {
  return compactParts([
    entry.menuName,
    entry.price ? `料金: ${entry.price}` : null,
    entry.orderMethod ? `注文方法: ${entry.orderMethod}` : null,
    entry.hours ? `対応時間: ${entry.hours}` : null,
    entry.note,
  ]).join(" / ");
}

function formatTransportEntry(entry: StructuredKnowledge["transport"][number]) {
  return compactLines([
    compactParts([entry.companyName, entry.serviceType]).join(" / "),
    entry.phone ? `電話: ${entry.phone}` : null,
    entry.hours ? `対応時間: ${entry.hours}` : null,
    entry.priceNote ? `料金: ${entry.priceNote}` : null,
    entry.note,
  ]);
}

function formatNearbySpotEntry(entry: StructuredKnowledge["nearbySpots"][number]) {
  return compactParts([
    entry.name,
    entry.category,
    entry.distance ? `距離: ${entry.distance}` : null,
    entry.hours ? `営業時間: ${entry.hours}` : null,
    entry.location ? `場所: ${entry.location}` : null,
    entry.note,
  ]).join(" / ");
}

function matchByName<T extends { name?: string | null }>(entries: T[], body: string) {
  const normalizedBody = normalizeText(body);
  const matched = entries.filter((entry) => {
    const name = entry.name ? normalizeText(entry.name) : "";
    return name.length > 0 && normalizedBody.includes(name);
  });

  return matched.length > 0 ? matched : entries;
}

function findBestFaq(stayStatus: GuestStayStatus, body: string) {
  const entries = stayStatus.hearingSheetKnowledge?.faq ?? [];
  let bestScore = 0;
  let bestEntry: (typeof entries)[number] | null = null;

  for (const entry of entries) {
    if (!entry.question || !entry.answer) {
      continue;
    }

    const score = scoreFaq(body, entry.question);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  return bestScore >= 4 ? bestEntry : null;
}

function findBestKnowledgeReply(stayStatus: GuestStayStatus, body: string) {
  const knowledge = stayStatus.hearingSheetKnowledge;

  if (!knowledge) {
    return null;
  }

  const candidates = [
    ...knowledge.wifi.map((entry) => ({
      reply: formatWifiEntry(entry),
      searchText: compactParts([
        "wifi wi-fi wireless 無線lan internet password ssid パスワード ネット",
        entry.floor,
        entry.ssid,
        entry.password,
        entry.note,
      ]).join(" "),
    })),
    ...knowledge.breakfast.map((entry) => ({
      reply: formatBreakfastEntry(entry),
      searchText: compactParts([
        "breakfast 朝食 レストラン ビュッフェ buffet",
        entry.style,
        entry.hours,
        entry.location,
        entry.price,
        entry.note,
      ]).join(" "),
    })),
    ...knowledge.baths.map((entry) => ({
      reply: formatBathEntry(entry),
      searchText: compactParts([
        "bath spa onsen お風呂 温泉 大浴場",
        entry.name,
        entry.hours,
        entry.location,
        entry.note,
      ]).join(" "),
    })),
    ...knowledge.facilities.map((entry) => ({
      reply: formatFacilityEntry(entry),
      searchText: compactParts([
        "facility facilities 館内 設備 施設",
        entry.name,
        entry.hours,
        entry.note,
      ]).join(" "),
    })),
    ...knowledge.facilityLocations.map((entry) => ({
      reply: formatFacilityLocationEntry(entry),
      searchText: compactParts([
        "location floor 場所 どこ 何階",
        entry.name,
        entry.floor,
        entry.note,
      ]).join(" "),
    })),
    ...knowledge.amenities.map((entry) => ({
      reply: formatAmenityEntry(entry),
      searchText: compactParts([
        "amenity amenities towel toothbrush brush タオル 歯ブラシ アメニティ",
        entry.name,
        entry.requestMethod,
        entry.price,
        entry.note,
      ]).join(" "),
    })),
    ...knowledge.parking.map((entry) => ({
      reply: formatParkingEntry(entry),
      searchText: compactParts([
        "parking car park 駐車場 車",
        entry.name,
        entry.location,
        entry.capacity,
        entry.price,
        entry.hours,
        entry.note,
      ]).join(" "),
    })),
    ...knowledge.emergency.map((entry) => ({
      reply: formatEmergencyEntry(entry),
      searchText: compactParts([
        "emergency fire ambulance hospital 医療 火事 救急 病院 緊急",
        entry.category,
        entry.contact,
        entry.steps,
        entry.note,
      ]).join(" "),
    })),
    ...knowledge.checkout.map((entry) => ({
      reply: formatCheckoutEntry(entry),
      searchText: compactParts([
        "checkout check-out late checkout key return チェックアウト 鍵 返却",
        entry.time,
        entry.method,
        entry.keyReturnLocation,
        entry.lateCheckoutPolicy,
        entry.note,
      ]).join(" "),
    })),
    ...knowledge.roomService.map((entry) => ({
      reply: formatRoomServiceEntry(entry),
      searchText: compactParts([
        "room service food meal ルームサービス 食事",
        entry.menuName,
        entry.orderMethod,
        entry.hours,
        entry.price,
        entry.note,
      ]).join(" "),
    })),
    ...knowledge.transport.map((entry) => ({
      reply: formatTransportEntry(entry),
      searchText: compactParts([
        "transport taxi pickup bus train タクシー 送迎 交通",
        entry.companyName,
        entry.serviceType,
        entry.phone,
        entry.hours,
        entry.priceNote,
        entry.note,
      ]).join(" "),
    })),
    ...knowledge.nearbySpots.map((entry) => ({
      reply: formatNearbySpotEntry(entry),
      searchText: compactParts([
        "nearby around store convenience station 周辺 近く コンビニ 駅",
        entry.name,
        entry.category,
        entry.distance,
        entry.hours,
        entry.location,
        entry.note,
      ]).join(" "),
    })),
    ...knowledge.frontDeskHours.map((entry) => ({
      reply: entry,
      searchText: `front desk フロント 営業時間 対応時間 ${entry}`,
    })),
    ...knowledge.faq.flatMap((entry) => (
      entry.answer
        ? [{
            reply: entry.answer,
            searchText: compactParts([entry.question, entry.answer]).join(" "),
          }]
        : []
    )),
  ].filter((candidate) => candidate.reply.trim().length > 0);

  let bestCandidate: (typeof candidates)[number] | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = scoreKnowledgeMatch(body, candidate.searchText);

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestScore >= 3 ? bestCandidate?.reply ?? null : null;
}

function buildAiReply(stayStatus: GuestStayStatus, body: string) {
  const normalized = body.toLowerCase();
  const knowledge = stayStatus.hearingSheetKnowledge;
  const language = resolveGuestLanguage(stayStatus.selectedLanguage);
  const copy = getLocalizedServerCopy(language);
  const normalizedBody = normalizeText(body);
  const frontDeskFallback = copy.frontDeskFallback;
  const toReply = (reply: string) => ({
    body: reply,
    needsHandoffConfirmation: false,
    pendingHandoffBody: null,
  });

  const isEmergency =
    includesAny(normalized, ["fire", "ambulance", "accident", "emergency"]) ||
    body.includes("火事") ||
    body.includes("救急") ||
    body.includes("事故") ||
    body.includes("病院") ||
    body.includes("体調") ||
    body.includes("医療") ||
    body.includes("急病") ||
    body.includes("긴급") ||
    body.includes("화재") ||
    body.includes("事故") ||
    body.includes("医疗") ||
    body.includes("火灾");

  if (isEmergency) {
    const emergencyReply = takeFormatted(
      (knowledge?.emergency ?? []).map((entry) => formatEmergencyEntry(entry)),
    );
    return toReply(emergencyReply || copy.emergencyFallback);
  }

  const faq = findBestFaq(stayStatus, body);
  if (faq?.answer) {
    return toReply(faq.answer);
  }

  if (isFrontDeskHandoffIntent(body, normalizedBody)) {
    return toReply(copy.handoffGuidance);
  }

  if (
    includesAny(normalized, ["wifi", "wi-fi", "wireless"]) ||
    body.includes("Wi-Fi") ||
    body.includes("無線LAN") ||
    body.includes("无线") ||
    body.includes("와이파이")
  ) {
    const requestedFloor = extractFloorFromQuestion(body) ?? stayStatus.roomFloor ?? null;
    const wifiEntries = knowledge?.wifi ?? [];
    const floorMatched = requestedFloor
      ? wifiEntries.filter((entry) => isSameFloor(entry.floor, requestedFloor))
      : [];
    const wifiReply = takeFormatted((floorMatched.length > 0 ? floorMatched : wifiEntries).map(
      (entry) => formatWifiEntry(entry),
    ));
    return toReply(wifiReply || frontDeskFallback);
  }

  if (
    body.includes("朝食") ||
    body.includes("早餐") ||
    body.includes("조식") ||
    includesAny(normalized, ["breakfast"])
  ) {
    const breakfastReply = takeFormatted(
      (knowledge?.breakfast ?? []).map((entry) => formatBreakfastEntry(entry)),
    );
    return toReply(breakfastReply || frontDeskFallback);
  }

  if (
    body.includes("タオル") ||
    body.includes("歯ブラシ") ||
    body.includes("アメニティ") ||
    body.includes("牙刷") ||
    body.includes("毛巾") ||
    body.includes("칫솔") ||
    body.includes("수건") ||
    includesAny(normalized, ["amenity", "toothbrush", "towel"])
  ) {
    const amenities = matchByName(knowledge?.amenities ?? [], body);
    const amenityReply = takeFormatted(amenities.map((entry) => formatAmenityEntry(entry)));
    return toReply(amenityReply || frontDeskFallback);
  }

  if (
    body.includes("チェックアウト") ||
    body.includes("鍵") ||
    body.includes("返却") ||
    includesAny(normalized, ["checkout", "check-out", "key return", "late checkout"])
  ) {
    const checkoutReply = takeFormatted(
      (knowledge?.checkout ?? []).map((entry) => formatCheckoutEntry(entry)),
    );
    return toReply(checkoutReply || frontDeskFallback);
  }

  if (
    body.includes("タクシー") ||
    body.includes("送迎") ||
    body.includes("交通") ||
    includesAny(normalized, ["taxi", "transport", "pickup"])
  ) {
    const transportReply = takeFormatted(
      (knowledge?.transport ?? []).map((entry) => formatTransportEntry(entry)),
    );
    return toReply(transportReply || frontDeskFallback);
  }

  if (
    body.includes("近く") ||
    body.includes("コンビニ") ||
    body.includes("周辺") ||
    includesAny(normalized, ["nearby", "convenience store"])
  ) {
    const nearbyReply = takeFormatted(
      matchByName(knowledge?.nearbySpots ?? [], body).map((entry) =>
        formatNearbySpotEntry(entry),
      ),
    );
    return toReply(nearbyReply || frontDeskFallback);
  }

  if (
    body.includes("駐車場") ||
    includesAny(normalized, ["parking", "car park"])
  ) {
    const parkingReply = takeFormatted(
      (knowledge?.parking ?? []).map((entry) => formatParkingEntry(entry)),
    );
    return toReply(parkingReply || frontDeskFallback);
  }

  if (
    body.includes("ルームサービス") ||
    body.includes("食事") ||
    includesAny(normalized, ["room service"])
  ) {
    const roomServiceReply = takeFormatted(
      (knowledge?.roomService ?? []).map((entry) => formatRoomServiceEntry(entry)),
    );
    return toReply(roomServiceReply || frontDeskFallback);
  }

  if (
    body.includes("温泉") ||
    body.includes("大浴場") ||
    body.includes("お風呂") ||
    includesAny(normalized, ["bath", "spa", "onsen"])
  ) {
    const bathReply = takeFormatted(
      (knowledge?.baths ?? []).map((entry) => formatBathEntry(entry)),
    );
    return toReply(bathReply || frontDeskFallback);
  }

  if (
    body.includes("館内") ||
    body.includes("部屋") ||
    body.includes("客室") ||
    body.includes("大浴場") ||
    body.includes("駐車場") ||
    body.includes("設備") ||
    body.includes("馆内") ||
    body.includes("客房") ||
    body.includes("设施") ||
    body.includes("주차장") ||
    body.includes("객실") ||
    body.includes("시설") ||
    includesAny(normalized, ["room", "facility", "facilities", "parking", "bath", "ice", "laundry"])
  ) {
    const facilityReply = takeFormatted([
      ...matchByName(knowledge?.facilityLocations ?? [], body).map((entry) =>
        formatFacilityLocationEntry(entry),
      ),
      ...matchByName(knowledge?.facilities ?? [], body).map((entry) =>
        formatFacilityEntry(entry),
      ),
    ]);
    return toReply(facilityReply || frontDeskFallback);
  }

  if (normalizedBody.includes("フロント") && (knowledge?.frontDeskHours?.length ?? 0) > 0) {
    return toReply(takeFormatted(knowledge?.frontDeskHours ?? []) || frontDeskFallback);
  }

  const bestKnowledgeReply = findBestKnowledgeReply(stayStatus, body);
  if (bestKnowledgeReply) {
    console.info("[guest/ai] matched knowledge reply", {
      roomId: stayStatus.roomId,
      hotelId: stayStatus.hotelId ?? null,
      body,
      knowledgeCounts: summarizeKnowledgeAvailability(knowledge),
      replyPreview: bestKnowledgeReply.slice(0, 120),
    });
    return toReply(bestKnowledgeReply);
  }

  console.warn("[guest/ai] falling back to front desk", {
    roomId: stayStatus.roomId,
    hotelId: stayStatus.hotelId ?? null,
    body,
    knowledgeCounts: summarizeKnowledgeAvailability(knowledge),
  });

  return {
    body: copy.handoffConfirmationPrompt,
    needsHandoffConfirmation: true,
    pendingHandoffBody: body,
  };
}

async function clearAiPendingHandoff(threadId: string) {
  await getAdminDb().collection("chat_threads").doc(threadId).set(
    {
      pending_handoff_confirmation: false,
      pending_handoff_body: null,
      pending_handoff_category: null,
      updated_at: FieldValue.serverTimestamp(),
    } satisfies Pick<
      FirestoreChatThread,
      "pending_handoff_confirmation" | "pending_handoff_body" | "pending_handoff_category" | "updated_at"
    > & { updated_at: unknown },
    { merge: true },
  );
}

export async function getGuestMessagesFromStore(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
  threadId?: string | null,
) {
  const fallbackMessages = buildFallbackMessagesForLanguage(mode, stayStatus.selectedLanguage);

  if (!threadId || !hasFirebaseAdminCredentials()) {
    return fallbackMessages;
  }

  try {
    const messages = await getMessagesByThreadId(threadId);
    return messages.length > 0 ? messages : fallbackMessages;
  } catch (error) {
    console.error("[guest/messages:get-store] failed; using fallback messages", {
      roomId: stayStatus.roomId,
      hotelId: stayStatus.hotelId ?? null,
      mode,
      threadId,
      error,
    });
    return fallbackMessages;
  }
}

export async function getGuestThreadStateFromStore(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
  threadId?: string | null,
) {
  const fallbackMessages = buildFallbackMessagesForLanguage(mode, stayStatus.selectedLanguage);

  if (!hasFirebaseAdminCredentials()) {
    return {
      threadId: threadId ?? `demo-${mode}`,
      messages: fallbackMessages,
    };
  }

  try {
    const resolvedThreadId =
      threadId ??
      (await findThread(stayStatus, mode))?.id ??
      null;

    if (!resolvedThreadId) {
      return {
        threadId: null,
        messages: fallbackMessages,
      };
    }

    const messages = await getMessagesByThreadId(resolvedThreadId);

    return {
      threadId: resolvedThreadId,
      messages: messages.length > 0 ? messages : fallbackMessages,
    };
  } catch (error) {
    console.error("[guest/thread-state] failed; using fallback thread state", {
      roomId: stayStatus.roomId,
      hotelId: stayStatus.hotelId ?? null,
      mode,
      threadId: threadId ?? null,
      error,
    });
    return {
      threadId: threadId ?? null,
      messages: fallbackMessages,
    };
  }
}

export async function markGuestThreadMessagesRead(
  threadId: string,
  messageIds?: string[],
) {
  if (!hasFirebaseAdminCredentials()) {
    return { ok: true as const, updatedCount: 0 };
  }

  const db = getAdminDb();
  const directSnapshot = await db
    .collection("messages")
    .where("thread_id", "==", threadId)
    .get();

  const snapshot = directSnapshot.empty
    ? await db
        .collection("messages")
        .where("threadId", "==", threadId)
        .get()
    : directSnapshot;

  const targetIds = messageIds?.length ? new Set(messageIds) : null;
  const docsToUpdate = snapshot.docs.filter((docSnapshot) => {
    const data = docSnapshot.data() as FirestoreMessage;
    const alreadyRead =
      data.read_at_guest ??
      data.readAtGuest ??
      data.read_at ??
      data.readAt ??
      data.seen_at_guest ??
      data.seenAtGuest;

    if (data.sender !== "guest" || alreadyRead) {
      return false;
    }

    if (targetIds && !targetIds.has(docSnapshot.id)) {
      return false;
    }

    return true;
  });

  if (docsToUpdate.length === 0) {
    return { ok: true as const, updatedCount: 0 };
  }

  const batch = db.batch();

  for (const docSnapshot of docsToUpdate) {
    batch.set(
      docSnapshot.ref,
      {
        read_at_guest: FieldValue.serverTimestamp(),
      } as { read_at_guest: unknown },
      { merge: true },
    );
  }

  await batch.commit();

  return {
    ok: true as const,
    updatedCount: docsToUpdate.length,
  };
}

export async function requestHumanHandoff(
  stayStatus: GuestStayStatus,
  category?: string,
) {
  if (!hasFirebaseAdminCredentials()) {
    return {
      ok: true as const,
      threadId: "demo-human",
      messages: buildFallbackMessagesForLanguage("human", stayStatus.selectedLanguage),
      resolvedMode: "human" as const,
    };
  }

  const language = resolveGuestLanguage(stayStatus.selectedLanguage);
  const copy = getLocalizedServerCopy(language);
  const threadId = await ensureThread(stayStatus, "human");
  const existingHumanThread = await getAdminDb().collection("chat_threads").doc(threadId).get();
  const existingHumanThreadData = existingHumanThread.data() as FirestoreChatThread | undefined;
  const resolvedGuestLanguage = resolveThreadGuestLanguage(existingHumanThreadData, stayStatus);
  const existingMessages = await getMessagesByThreadId(threadId);
  const guestBody = category ?? copy.handoffRequest;
  const guestPayload = await buildTranslationPayload({
    displayBody: guestBody,
    guestLanguage: resolvedGuestLanguage,
    frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
  });
  const hasGuestRequest = existingMessages.some(
    (message) =>
      message.sender === "guest" &&
      message.body === guestBody,
  );

  if (!hasGuestRequest) {
    await addMessage(stayStatus, threadId, "guest", guestPayload);
  }

  const responseMessages: GuestMessage[] = hasGuestRequest
    ? []
    : [buildRuntimeMessage("guest", guestPayload)];

  if (!category) {
    const waitingPayload = await buildTranslationPayload({
      displayBody: copy.handoffWaiting,
      guestLanguage: resolveThreadGuestLanguage(existingMessages.length > 0 ? existingHumanThreadData : undefined, stayStatus),
      originalLanguage: GUEST_FRONT_DESK_LANGUAGE,
      displayLanguage: toLanguageCode(resolveThreadGuestLanguage(existingMessages.length > 0 ? existingHumanThreadData : undefined, stayStatus)),
      frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
    });

    await addMessage(
      stayStatus,
      threadId,
      "system",
      waitingPayload,
    );

    await updateHumanThreadMetadata(
      threadId,
      stayStatus,
      copy.handoffWaiting,
      "system",
      undefined,
      existingHumanThreadData?.status === "in_progress" ? "in_progress" : "new",
    );

    return {
      ok: true as const,
      threadId,
      messages: [...responseMessages, buildRuntimeMessage("system", waitingPayload)],
      resolvedMode: "human" as const,
    };
  }

  await updateHumanThreadMetadata(
    threadId,
    stayStatus,
    guestPayload.translatedBodyFront ?? guestBody,
    "guest",
    category,
    existingHumanThreadData?.status === "in_progress" ? "in_progress" : "new",
  );

  if (category && isTaxiHandoffCategory(category)) {
    const taxiPromptBody = copy.taxiHandoffPrompt;
    const hasTaxiPrompt = existingMessages.some(
      (message) => message.sender === "system" && message.body === taxiPromptBody,
    );

    if (!hasTaxiPrompt) {
      const taxiPromptPayload = await buildTranslationPayload({
        displayBody: taxiPromptBody,
        guestLanguage: resolvedGuestLanguage,
        originalLanguage: GUEST_FRONT_DESK_LANGUAGE,
        displayLanguage: toLanguageCode(resolvedGuestLanguage),
        frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
      });

      await addMessage(
        stayStatus,
        threadId,
        "system",
        taxiPromptPayload,
      );

      responseMessages.push(buildRuntimeMessage("system", taxiPromptPayload));
    }
  }

  return {
    ok: true as const,
    threadId,
    messages: responseMessages,
    resolvedMode: "human" as const,
  };
}

export async function postGuestMessageToStore(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
  body: string,
  options?: {
    category?: string | null;
  },
) {
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    return { ok: false as const, error: "EMPTY_MESSAGE" };
  }

  if (!hasFirebaseAdminCredentials()) {
    return {
      ok: true as const,
      threadId: `demo-${mode}`,
      messages: [],
      resolvedMode: mode,
    };
  }

  const language = resolveGuestLanguage(stayStatus.selectedLanguage);
  const copy = getLocalizedServerCopy(language);
  const existingThread =
    mode === "human" || mode === "ai"
      ? await findThread(stayStatus, mode)
      : null;
  const existingThreadData = existingThread?.data() as FirestoreChatThread | undefined;
  const resolvedGuestLanguage = resolveThreadGuestLanguage(existingThreadData, stayStatus);
  const guestPayload = await buildTranslationPayload({
    displayBody: trimmedBody,
    guestLanguage: resolvedGuestLanguage,
    frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
  });

  if (mode === "ai") {
    const existingAiThread = existingThread;
    const aiThreadData = existingThreadData;
    const normalizedBody = normalizeText(trimmedBody);

    if (isLuggageStorageIntent(trimmedBody, normalizedBody)) {
      return handoffGuestReplyFromAiMessage(
        stayStatus,
        trimmedBody,
        guestPayload,
        aiThreadData?.category ?? aiThreadData?.rich_menu_label ?? null,
      );
    }

    if (isMaintenanceIssueIntent(trimmedBody, normalizedBody)) {
      return handoffGuestReplyFromAiMessage(
        stayStatus,
        trimmedBody,
        guestPayload,
        aiThreadData?.category ?? aiThreadData?.rich_menu_label ?? null,
      );
    }

    if (
      existingAiThread &&
      aiThreadData?.pending_handoff_confirmation &&
      aiThreadData.pending_handoff_body
    ) {
      if (isGuestAffirmative(trimmedBody)) {
        await clearAiPendingHandoff(existingAiThread.id);
        const pendingGuestPayload = await buildTranslationPayload({
          displayBody: aiThreadData.pending_handoff_body,
          guestLanguage: resolvedGuestLanguage,
          frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
        });

        return handoffGuestReplyFromAiMessage(
          stayStatus,
          aiThreadData.pending_handoff_body,
          pendingGuestPayload,
          aiThreadData.pending_handoff_category ?? aiThreadData.category ?? null,
        );
      }

      if (isGuestNegative(trimmedBody)) {
        const threadId = existingAiThread.id;
        const guestMessageId = await addMessage(stayStatus, threadId, "guest", guestPayload);

        const declinedPayload = await buildTranslationPayload({
          displayBody: copy.handoffConfirmationDeclined,
          guestLanguage: stayStatus.selectedLanguage,
          originalLanguage: GUEST_FRONT_DESK_LANGUAGE,
          displayLanguage: toLanguageCode(stayStatus.selectedLanguage),
          frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
        });

        await addMessage(stayStatus, threadId, "ai", declinedPayload);
        await updateAiThreadMetadata(
          threadId,
          stayStatus,
          copy.handoffConfirmationDeclined,
          "ai",
        );
        await notifyFrontdeskGuestMessage({
          hotelId: stayStatus.hotelId,
          threadId,
          messageId: guestMessageId,
        });

        return {
          ok: true as const,
          threadId,
          messages: [
            buildRuntimeMessage("guest", guestPayload),
            buildRuntimeMessage("ai", declinedPayload),
          ],
          resolvedMode: "ai" as const,
        };
      }

      await clearAiPendingHandoff(existingAiThread.id);
    }

    if (existingAiThread && aiThreadData?.rich_menu_action_type === "ai_message") {
      const aiMessages = await getMessagesByThreadId(existingAiThread.id);
      const hasGuestOrFrontReply = aiMessages.some(
        (message) => message.sender === "guest" || message.sender === "front",
      );

      if (!hasGuestOrFrontReply) {
        return handoffGuestReplyFromAiMessage(
          stayStatus,
          trimmedBody,
          guestPayload,
          aiThreadData.category ?? aiThreadData.rich_menu_label ?? null,
        );
      }
    }
  }

  const threadId = existingThread?.id ?? await createThread(stayStatus, mode);
  const guestMessageId = await addMessage(stayStatus, threadId, "guest", guestPayload);
  const responseMessages: GuestMessage[] = [buildRuntimeMessage("guest", guestPayload)];

  if (mode === "ai") {
    const aiReply = buildAiReply(stayStatus, trimmedBody);
    const aiPayload = await buildTranslationPayload({
      displayBody: aiReply.body,
      guestLanguage: stayStatus.selectedLanguage,
      originalLanguage: GUEST_FRONT_DESK_LANGUAGE,
      displayLanguage: toLanguageCode(stayStatus.selectedLanguage),
      frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
    });

    await addMessage(
      stayStatus,
      threadId,
      "ai",
      aiPayload,
      {
        handoffConfirmation: aiReply.needsHandoffConfirmation,
      },
    );

    await updateAiThreadMetadata(threadId, stayStatus, aiReply.body, "ai", {
      pendingHandoffConfirmation: aiReply.needsHandoffConfirmation,
      pendingHandoffBody: aiReply.needsHandoffConfirmation
        ? aiReply.pendingHandoffBody ?? trimmedBody
        : null,
      pendingHandoffCategory: aiReply.needsHandoffConfirmation
        ? options?.category ?? existingThreadData?.category ?? null
        : null,
    });
    await mirrorAiMessageToHumanThread(
      stayStatus,
      aiPayload,
      aiReply.body,
      {
        category: options?.category ?? existingThreadData?.category ?? null,
        handoffConfirmation: aiReply.needsHandoffConfirmation,
      },
    );
    responseMessages.push(
      buildRuntimeMessage("ai", aiPayload, {
        handoffConfirmation: aiReply.needsHandoffConfirmation,
      }),
    );
    await notifyFrontdeskGuestMessage({
      hotelId: stayStatus.hotelId,
      threadId,
      messageId: guestMessageId,
    });
  }

  if (mode === "human") {
    const waitingBody = options?.category?.startsWith("emergency_")
      ? copy.emergencyWaiting
      : copy.handoffWaiting;
    const waitingPayload = await buildTranslationPayload({
      displayBody: waitingBody,
      guestLanguage: resolvedGuestLanguage,
      originalLanguage: GUEST_FRONT_DESK_LANGUAGE,
      displayLanguage: toLanguageCode(stayStatus.selectedLanguage),
      frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
    });

    await addMessage(
      stayStatus,
      threadId,
      "system",
      waitingPayload,
    );

    await updateHumanThreadMetadata(
      threadId,
      stayStatus,
      guestPayload.translatedBodyFront ?? trimmedBody,
      "guest",
      options?.category ?? undefined,
      existingThreadData?.status === "in_progress" ? "in_progress" : "new",
    );
    await notifyFrontdeskGuestMessage({
      hotelId: stayStatus.hotelId,
      threadId,
      messageId: guestMessageId,
    });
    responseMessages.push(buildRuntimeMessage("system", waitingPayload));
  }

  return { ok: true as const, threadId, messages: responseMessages, resolvedMode: mode };
}

export async function postGuestAiStarterToStore(
  stayStatus: GuestStayStatus,
  body: string,
  options?: {
    protectedTerms?: string[];
    translations?: ManualTranslations;
  },
) {
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    return { ok: false as const, error: "EMPTY_MESSAGE" };
  }

  if (!hasFirebaseAdminCredentials()) {
    return {
      ok: true as const,
      threadId: "demo-ai",
      messages: [],
      resolvedMode: "ai" as const,
    };
  }

  const threadId = await createThread(stayStatus, "ai");
  const aiPayload = await buildTranslationPayload({
    displayBody: trimmedBody,
    guestLanguage: stayStatus.selectedLanguage,
    originalLanguage: GUEST_FRONT_DESK_LANGUAGE,
    displayLanguage: toLanguageCode(stayStatus.selectedLanguage),
    frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
    protectedTerms: options?.protectedTerms,
    manualTranslations: options?.translations,
  });

  await addMessage(
    stayStatus,
    threadId,
    "ai",
    aiPayload,
  );

  await updateAiThreadMetadata(threadId, stayStatus, trimmedBody, "ai");
  await mirrorAiMessageToHumanThread(stayStatus, aiPayload, trimmedBody);

  return {
    ok: true as const,
    threadId,
    messages: [buildRuntimeMessage("ai", aiPayload)],
    resolvedMode: "ai" as const,
  };
}

export async function postGuestAiMessageToStore(
  stayStatus: GuestStayStatus,
  body?: string,
  imageUrl?: string,
  imageAlt?: string,
  category?: string,
  options?: {
    protectedTerms?: string[];
    translations?: ManualTranslations;
  },
) {
  const trimmedBody = body?.trim() ?? "";
  const trimmedImageUrl = imageUrl?.trim() ?? "";
  const trimmedImageAlt = imageAlt?.trim() ?? "";

  if (!trimmedBody && !trimmedImageUrl) {
    return { ok: false as const, error: "EMPTY_AI_MESSAGE" };
  }

  if (!hasFirebaseAdminCredentials()) {
    return {
      ok: true as const,
      threadId: "demo-ai",
      messages: [],
      resolvedMode: "ai" as const,
    };
  }

  const threadId = await ensureThread(stayStatus, "ai");
  const aiPayload = await buildTranslationPayload({
    displayBody: trimmedBody,
    guestLanguage: stayStatus.selectedLanguage,
    originalLanguage: GUEST_FRONT_DESK_LANGUAGE,
    displayLanguage: toLanguageCode(stayStatus.selectedLanguage),
    frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
    protectedTerms: options?.protectedTerms,
    manualTranslations: options?.translations,
  });

  aiPayload.imageUrl = trimmedImageUrl || null;
  aiPayload.imageAlt = trimmedImageAlt || null;

  await addMessage(
    stayStatus,
    threadId,
    "ai",
    aiPayload,
  );

  await updateAiThreadMetadata(
    threadId,
    stayStatus,
    trimmedBody || trimmedImageAlt || "AI message",
    "ai",
    {
      category: category ?? null,
      richMenuActionType: "ai_message",
      richMenuLabel: category ?? null,
    },
  );
  await mirrorAiMessageToHumanThread(
    stayStatus,
    aiPayload,
    trimmedBody || trimmedImageAlt || "AI message",
    {
      category: category ?? null,
    },
  );

  return {
    ok: true as const,
    threadId,
    messages: [buildRuntimeMessage("ai", aiPayload)],
    resolvedMode: "ai" as const,
  };
}
