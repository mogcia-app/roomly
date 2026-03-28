import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import {
  getGuestThread,
  type GuestMessage,
  type GuestStayStatus,
} from "@/lib/guest-demo";

type ThreadMode = "ai" | "human";

type FirestoreChatThread = {
  stay_id?: string;
  stayId?: string;
  room_id?: string;
  roomId?: string;
  mode?: ThreadMode;
  created_at?: unknown;
};

type FirestoreMessage = {
  thread_id?: string;
  threadId?: string;
  sender?: "guest" | "front" | "ai" | "system";
  body?: string;
  timestamp?: { toDate?: () => Date };
};

function hasFirebaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
}

function buildFallbackMessages(mode: ThreadMode) {
  return getGuestThread(mode);
}

function normalizeMessage(
  id: string,
  message: FirestoreMessage,
): GuestMessage | null {
  if (!message.body || !message.sender) {
    return null;
  }

  return {
    id,
    sender: message.sender,
    body: message.body,
    timestamp: message.timestamp?.toDate?.()?.toISOString() ?? null,
  };
}

async function findThread(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
) {
  if (!stayStatus.stayId) {
    return null;
  }

  const threadQuery = query(
    collection(db, "chat_threads"),
    where("stay_id", "==", stayStatus.stayId),
    where("mode", "==", mode),
    limit(1),
  );
  const snapshot = await getDocs(threadQuery);

  if (!snapshot.empty) {
    return snapshot.docs[0];
  }

  const altThreadQuery = query(
    collection(db, "chat_threads"),
    where("stayId", "==", stayStatus.stayId),
    where("mode", "==", mode),
    limit(1),
  );
  const altSnapshot = await getDocs(altThreadQuery);

  if (!altSnapshot.empty) {
    return altSnapshot.docs[0];
  }

  return null;
}

async function createThread(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
) {
  const threadRef = await addDoc(collection(db, "chat_threads"), {
    stay_id: stayStatus.stayId ?? stayStatus.roomId,
    room_id: stayStatus.roomId,
    mode,
    created_at: serverTimestamp(),
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

export async function ensureGuestHumanThread(stayStatus: GuestStayStatus) {
  if (!hasFirebaseConfig()) {
    return "demo-human";
  }

  return ensureThread(stayStatus, "human");
}

async function getMessagesByThreadId(threadId: string) {
  const directMessagesQuery = query(
    collection(db, "messages"),
    where("thread_id", "==", threadId),
    orderBy("timestamp", "asc"),
  );
  const directSnapshot = await getDocs(directMessagesQuery);

  if (!directSnapshot.empty) {
    return directSnapshot.docs
      .map((docSnapshot) =>
        normalizeMessage(docSnapshot.id, docSnapshot.data() as FirestoreMessage),
      )
      .filter((value): value is GuestMessage => value !== null);
  }

  const altMessagesQuery = query(
    collection(db, "messages"),
    where("threadId", "==", threadId),
    orderBy("timestamp", "asc"),
  );
  const altSnapshot = await getDocs(altMessagesQuery);

  return altSnapshot.docs
    .map((docSnapshot) =>
      normalizeMessage(docSnapshot.id, docSnapshot.data() as FirestoreMessage),
    )
    .filter((value): value is GuestMessage => value !== null);
}

function buildKnowledgeReply(values: string[], fallback: string) {
  if (values.length === 0) {
    return fallback;
  }

  return values.slice(0, 2).join(" ");
}

function buildAiReply(stayStatus: GuestStayStatus, body: string) {
  const normalized = body.toLowerCase();
  const knowledge = stayStatus.hearingSheetKnowledge;

  if (normalized.includes("wifi") || body.includes("Wi-Fi")) {
    return buildKnowledgeReply(
      knowledge?.wifi ?? [],
      "Wi-Fi情報は客室案内をご確認ください。見つからない場合はフロントへおつなぎします。",
    );
  }

  if (body.includes("朝食")) {
    return buildKnowledgeReply(
      knowledge?.breakfast ?? [],
      "朝食の時間はホテル案内に沿ってご案内します。必要であればフロントへおつなぎします。",
    );
  }

  if (
    body.includes("タオル") ||
    body.includes("歯ブラシ") ||
    body.includes("アメニティ")
  ) {
    return buildKnowledgeReply(
      knowledge?.amenities ?? [],
      "アメニティに関するご案内です。お届けが必要な場合は「お届け・ご依頼」からフロントへお送りください。",
    );
  }

  if (
    body.includes("館内") ||
    body.includes("部屋") ||
    body.includes("客室") ||
    body.includes("大浴場") ||
    body.includes("駐車場") ||
    body.includes("設備")
  ) {
    return buildKnowledgeReply(
      knowledge?.facilities ?? [],
      "館内やお部屋のご案内をお伝えします。必要な情報が見つからない場合はフロントへおつなぎします。",
    );
  }

  return "内容を確認しました。必要であればフロントへおつなぎします。";
}

export async function getGuestMessagesFromStore(
  stayStatus: GuestStayStatus,
  mode: ThreadMode,
) {
  if (!hasFirebaseConfig()) {
    return buildFallbackMessages(mode);
  }

  try {
    const thread = await findThread(stayStatus, mode);

    if (!thread) {
      return buildFallbackMessages(mode);
    }

    const messages = await getMessagesByThreadId(thread.id);

    if (messages.length === 0) {
      return buildFallbackMessages(mode);
    }

    return messages;
  } catch {
    return buildFallbackMessages(mode);
  }
}

export async function requestHumanHandoff(
  stayStatus: GuestStayStatus,
  category?: string,
) {
  if (!hasFirebaseConfig()) {
    return { ok: true as const, threadId: "demo-human" };
  }

  const threadId = await ensureThread(stayStatus, "human");
  const existingMessages = await getMessagesByThreadId(threadId);
  const noticeBody = category
    ? `フロントへ通知しました。依頼内容: ${category}`
    : "フロントへ通知しました。返信をお待ちください。";
  const hasHandoffNotice = existingMessages.some(
    (message) =>
      message.sender === "system" &&
      message.body === noticeBody,
  );

  if (!hasHandoffNotice) {
    await addDoc(collection(db, "messages"), {
      thread_id: threadId,
      sender: "system",
      body: noticeBody,
      timestamp: serverTimestamp(),
    });
  }

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

  if (!hasFirebaseConfig()) {
    return { ok: true as const, threadId: `demo-${mode}` };
  }

  const threadId = await ensureThread(stayStatus, mode);

  await addDoc(collection(db, "messages"), {
    thread_id: threadId,
    sender: "guest",
    body: trimmedBody,
    timestamp: serverTimestamp(),
  });

  if (mode === "ai") {
    await addDoc(collection(db, "messages"), {
      thread_id: threadId,
      sender: "ai",
      body: buildAiReply(stayStatus, trimmedBody),
      timestamp: serverTimestamp(),
    });
  }

  if (mode === "human") {
    await addDoc(collection(db, "messages"), {
      thread_id: threadId,
      sender: "system",
      body: "フロントに通知しました。返信をお待ちください。",
      timestamp: serverTimestamp(),
    });
  }

  return { ok: true as const, threadId };
}
