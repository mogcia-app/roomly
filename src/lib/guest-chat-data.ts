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

type ThreadMode = "ai" | "human";

type FirestoreChatThread = {
  stay_id?: string;
  stayId?: string;
  room_id?: string;
  roomId?: string;
  hotel_id?: string | null;
  mode?: ThreadMode;
  status?: "new" | "in_progress" | "resolved";
  category?: string | null;
  event_type?: "chat_handoff_requested";
  guest_language?: string | null;
  last_message_body?: string;
  last_message_at?: unknown;
  last_message_sender?: "guest" | "ai" | "front" | "system";
  unread_count_front?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type FirestoreMessage = {
  thread_id?: string;
  threadId?: string;
  sender?: "guest" | "front" | "ai" | "system";
  body?: string;
  original_body?: string;
  original_language?: string | null;
  translated_body_front?: string | null;
  translated_language_front?: string | null;
  translated_body_guest?: string | null;
  translated_language_guest?: string | null;
  translation_state?: GuestTranslationState;
  timestamp?: { toDate?: () => Date } | unknown;
};

type StructuredKnowledge = NonNullable<GuestStayStatus["hearingSheetKnowledge"]>;
type TranslationPayload = {
  body: string;
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
}: {
  text: string;
  sourceLanguage: string | null;
  targetLanguage: string;
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
                "If the source text is already in the target language, return it unchanged.",
                `Text: ${text}`,
              ].join("\n"),
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
}: {
  displayBody: string;
  originalBody?: string;
  originalLanguage?: string | null;
  displayLanguage?: string | null;
  guestLanguage: GuestLanguage | null | undefined;
  frontLanguage?: string | null;
  }): Promise<TranslationPayload> {
  const resolvedGuestLanguage = toLanguageCode(guestLanguage);
  const resolvedFrontLanguage = frontLanguage ?? GUEST_FRONT_DESK_LANGUAGE;
  const sourceBody = originalBody?.trim() || displayBody;
  const sourceLanguage = originalLanguage ?? resolvedGuestLanguage;
  const resolvedDisplayLanguage = displayLanguage ?? sourceLanguage;

  if (!getOpenAiApiKey()) {
    console.warn("[guest/translation] OPENAI_API_KEY missing, using fallback translation");
    return {
      body: displayBody,
      originalBody: sourceBody,
      originalLanguage: sourceLanguage,
      translatedBodyFront: sourceBody,
      translatedLanguageFront: resolvedFrontLanguage,
      translatedBodyGuest: displayBody,
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
          });

    const translatedBodyGuest =
      resolvedDisplayLanguage === resolvedGuestLanguage
        ? displayBody
        : sourceLanguage === resolvedGuestLanguage
          ? sourceBody
          : await translateTextWithOpenAi({
              text: sourceBody,
              sourceLanguage,
              targetLanguage: resolvedGuestLanguage,
            });

    return {
      body: displayBody,
      originalBody: sourceBody,
      originalLanguage: sourceLanguage,
      translatedBodyFront: translatedBodyFront ?? sourceBody,
      translatedLanguageFront: resolvedFrontLanguage,
      translatedBodyGuest: translatedBodyGuest ?? displayBody,
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
      body: displayBody,
      originalBody: sourceBody,
      originalLanguage: sourceLanguage,
      translatedBodyFront: sourceBody,
      translatedLanguageFront: resolvedFrontLanguage,
      translatedBodyGuest: displayBody,
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
  if (!message.body || !message.sender) {
    return null;
  }

  const timestamp =
    typeof message.timestamp === "object" &&
    message.timestamp !== null &&
    "toDate" in message.timestamp &&
    typeof message.timestamp.toDate === "function"
      ? message.timestamp.toDate().toISOString()
      : null;

  return {
    id,
    sender: message.sender,
    body: message.body,
    timestamp,
    originalBody: message.original_body ?? null,
    originalLanguage: message.original_language ?? null,
    translatedBodyFront: message.translated_body_front ?? null,
    translatedLanguageFront: message.translated_language_front ?? null,
    translatedBodyGuest: message.translated_body_guest ?? null,
    translatedLanguageGuest: message.translated_language_guest ?? null,
    translationState: message.translation_state ?? "not_required",
  };
}

async function addMessage(
  threadId: string,
  sender: FirestoreMessage["sender"],
  payload: TranslationPayload,
) {
  await getAdminDb().collection("messages").add({
    thread_id: threadId,
    sender,
    body: payload.body,
    original_body: payload.originalBody,
    original_language: payload.originalLanguage,
    translated_body_front: payload.translatedBodyFront,
    translated_language_front: payload.translatedLanguageFront,
    translated_body_guest: payload.translatedBodyGuest,
    translated_language_guest: payload.translatedLanguageGuest,
    translation_state: payload.translationState,
    timestamp: FieldValue.serverTimestamp(),
  } satisfies FirestoreMessage & { timestamp: unknown });
}

async function findThread(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
) {
  const db = getAdminDb();
  const stayKey = stayStatus.stayId ?? stayStatus.roomId;

  const snapshot = await db
    .collection("chat_threads")
    .where("stay_id", "==", stayKey)
    .where("mode", "==", mode)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    return snapshot.docs[0];
  }

  const altSnapshot = await db
    .collection("chat_threads")
    .where("stayId", "==", stayKey)
    .where("mode", "==", mode)
    .limit(1)
    .get();

  if (!altSnapshot.empty) {
    return altSnapshot.docs[0];
  }

  return null;
}

async function createThread(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
) {
  const threadRef = await getAdminDb().collection("chat_threads").add({
    stay_id: stayStatus.stayId ?? stayStatus.roomId,
    room_id: stayStatus.roomId,
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
) {
  await getAdminDb().collection("chat_threads").doc(threadId).set(
    {
      stay_id: stayStatus.stayId ?? stayStatus.roomId,
      room_id: stayStatus.roomId,
      hotel_id: stayStatus.hotelId ?? null,
      mode: "human" satisfies ThreadMode,
      status: "new" as const,
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

export async function ensureGuestHumanThread(stayStatus: GuestStayStatus) {
  if (!hasFirebaseAdminCredentials()) {
    return "demo-human";
  }

  return ensureThread(stayStatus, "human");
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
      frontDeskFallback: "Please check with the front desk.",
      emergencyFallback: "Emergency contact information is not registered. Please contact the front desk immediately.",
    };
  }

  if (language === "zh-CN") {
    return {
      handoffRequest: "请帮我联系前台。",
      handoffWaiting: "已通知前台，请等待回复。",
      frontDeskFallback: "请向前台确认。",
      emergencyFallback: "未找到已登记的紧急联系方式，请立即联系前台。",
    };
  }

  if (language === "ko") {
    return {
      handoffRequest: "프런트로 연결해 주세요.",
      handoffWaiting: "프런트에 알렸습니다. 답변을 기다려 주세요.",
      frontDeskFallback: "프런트로 확인해 주세요.",
      emergencyFallback: "등록된 긴급 연락처를 찾지 못했습니다. 즉시 프런트로 문의해 주세요.",
    };
  }

  return {
    handoffRequest: "フロント対応をお願いします。",
    handoffWaiting: "フロントへ通知しました。返信をお待ちください。",
    frontDeskFallback: "フロントへご確認ください。",
    emergencyFallback:
      "登録済みの緊急連絡先が見つかりません。すぐにフロントへご確認ください。",
  };
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[\s　。、，,!?？!:\-_/\\()[\]{}"'`]+/g, "");
}

function compactParts(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function takeFormatted(values: string[]) {
  return values.slice(0, 2).join("\n");
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
  return compactParts([
    entry.companyName,
    entry.serviceType,
    entry.phone ? `電話: ${entry.phone}` : null,
    entry.hours ? `対応時間: ${entry.hours}` : null,
    entry.priceNote ? `料金: ${entry.priceNote}` : null,
    entry.note,
  ]).join(" / ");
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

function buildAiReply(stayStatus: GuestStayStatus, body: string) {
  const normalized = body.toLowerCase();
  const knowledge = stayStatus.hearingSheetKnowledge;
  const language = resolveGuestLanguage(stayStatus.selectedLanguage);
  const copy = getLocalizedServerCopy(language);
  const normalizedBody = normalizeText(body);
  const frontDeskFallback = copy.frontDeskFallback;

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
    return emergencyReply || copy.emergencyFallback;
  }

  const faq = findBestFaq(stayStatus, body);
  if (faq?.answer) {
    return faq.answer;
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
      ? wifiEntries.filter((entry) => entry.floor === requestedFloor)
      : [];
    const wifiReply = takeFormatted((floorMatched.length > 0 ? floorMatched : wifiEntries).map(
      (entry) => formatWifiEntry(entry),
    ));
    return wifiReply || frontDeskFallback;
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
    return breakfastReply || frontDeskFallback;
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
    return amenityReply || frontDeskFallback;
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
    return checkoutReply || frontDeskFallback;
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
    return transportReply || frontDeskFallback;
  }

  if (
    body.includes("近く") ||
    body.includes("コンビニ") ||
    body.includes("周辺") ||
    includesAny(normalized, ["nearby", "convenience store", "store"])
  ) {
    const nearbyReply = takeFormatted(
      matchByName(knowledge?.nearbySpots ?? [], body).map((entry) =>
        formatNearbySpotEntry(entry),
      ),
    );
    return nearbyReply || frontDeskFallback;
  }

  if (
    body.includes("駐車場") ||
    includesAny(normalized, ["parking", "car park"])
  ) {
    const parkingReply = takeFormatted(
      (knowledge?.parking ?? []).map((entry) => formatParkingEntry(entry)),
    );
    return parkingReply || frontDeskFallback;
  }

  if (
    body.includes("ルームサービス") ||
    body.includes("食事") ||
    includesAny(normalized, ["room service"])
  ) {
    const roomServiceReply = takeFormatted(
      (knowledge?.roomService ?? []).map((entry) => formatRoomServiceEntry(entry)),
    );
    return roomServiceReply || frontDeskFallback;
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
    return bathReply || frontDeskFallback;
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
    return facilityReply || frontDeskFallback;
  }

  if (normalizedBody.includes("フロント") && (knowledge?.frontDeskHours?.length ?? 0) > 0) {
    return takeFormatted(knowledge?.frontDeskHours ?? []) || frontDeskFallback;
  }

  return frontDeskFallback;
}

export async function getGuestMessagesFromStore(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
) {
  if (!hasFirebaseAdminCredentials()) {
    return buildFallbackMessagesForLanguage(mode, stayStatus.selectedLanguage);
  }

  try {
    const thread = await findThread(stayStatus, mode);

    if (!thread) {
      return buildFallbackMessagesForLanguage(mode, stayStatus.selectedLanguage);
    }

    const messages = await getMessagesByThreadId(thread.id);

    if (messages.length === 0) {
      return buildFallbackMessagesForLanguage(mode, stayStatus.selectedLanguage);
    }

    return messages;
  } catch {
    return buildFallbackMessagesForLanguage(mode, stayStatus.selectedLanguage);
  }
}

export async function requestHumanHandoff(
  stayStatus: GuestStayStatus,
  category?: string,
) {
  if (!hasFirebaseAdminCredentials()) {
    return { ok: true as const, threadId: "demo-human" };
  }

  const language = resolveGuestLanguage(stayStatus.selectedLanguage);
  const copy = getLocalizedServerCopy(language);
  const threadId = await ensureThread(stayStatus, "human");
  const existingMessages = await getMessagesByThreadId(threadId);
  const guestBody = category ?? copy.handoffRequest;
  const guestPayload = await buildTranslationPayload({
    displayBody: guestBody,
    guestLanguage: stayStatus.selectedLanguage,
    frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
  });
  const hasGuestRequest = existingMessages.some(
    (message) =>
      message.sender === "guest" &&
      message.body === guestBody,
  );

  if (!hasGuestRequest) {
    await addMessage(threadId, "guest", guestPayload);
  }

  if (!category) {
    await addMessage(
      threadId,
      "system",
      await buildTranslationPayload({
        displayBody: copy.handoffWaiting,
        guestLanguage: stayStatus.selectedLanguage,
        originalLanguage: GUEST_FRONT_DESK_LANGUAGE,
        displayLanguage: toLanguageCode(stayStatus.selectedLanguage),
        frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
      }),
    );

    await updateHumanThreadMetadata(
      threadId,
      stayStatus,
      copy.handoffWaiting,
      "system",
    );

    return { ok: true as const, threadId };
  }

  await updateHumanThreadMetadata(
    threadId,
    stayStatus,
    guestPayload.translatedBodyFront ?? guestBody,
    "guest",
    category,
  );

  return { ok: true as const, threadId };
}

export async function postGuestMessageToStore(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
  body: string,
) {
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    return { ok: false as const, error: "EMPTY_MESSAGE" };
  }

  if (!hasFirebaseAdminCredentials()) {
    return { ok: true as const, threadId: `demo-${mode}` };
  }

  const language = resolveGuestLanguage(stayStatus.selectedLanguage);
  const copy = getLocalizedServerCopy(language);
  const threadId = await ensureThread(stayStatus, mode);
  const guestPayload = await buildTranslationPayload({
    displayBody: trimmedBody,
    guestLanguage: stayStatus.selectedLanguage,
    frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
  });

  await addMessage(threadId, "guest", guestPayload);

  if (mode === "ai") {
    const aiReply = buildAiReply(stayStatus, trimmedBody);
    await addMessage(
      threadId,
      "ai",
      await buildTranslationPayload({
        displayBody: aiReply,
        guestLanguage: stayStatus.selectedLanguage,
        originalLanguage: GUEST_FRONT_DESK_LANGUAGE,
        displayLanguage: toLanguageCode(stayStatus.selectedLanguage),
        frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
      }),
    );
  }

  if (mode === "human") {
    await addMessage(
      threadId,
      "system",
      await buildTranslationPayload({
        displayBody: copy.handoffWaiting,
        guestLanguage: stayStatus.selectedLanguage,
        originalLanguage: GUEST_FRONT_DESK_LANGUAGE,
        displayLanguage: toLanguageCode(stayStatus.selectedLanguage),
        frontLanguage: GUEST_FRONT_DESK_LANGUAGE,
      }),
    );

    await updateHumanThreadMetadata(
      threadId,
      stayStatus,
      guestPayload.translatedBodyFront ?? trimmedBody,
      "guest",
    );
  }

  return { ok: true as const, threadId };
}
