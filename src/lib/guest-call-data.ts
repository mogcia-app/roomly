import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase-admin";
import type { GuestStayStatus } from "@/lib/guest-demo";

export type GuestCallState = "queue" | "active" | "unavailable" | "ended";
type CallDirection = "guest_to_front" | "front_to_guest";
type CallInitiator = "guest" | "front";

type FirestoreCall = {
  stay_id?: string;
  stayId?: string;
  room_id?: string;
  roomId?: string;
  room_number?: string;
  roomNumber?: string;
  hotel_id?: string | null;
  hotelId?: string | null;
  thread_id?: string;
  threadId?: string;
  guest_lang?: string | null;
  guestLang?: string | null;
  status?: GuestCallState;
  direction?: CallDirection;
  initiated_by?: CallInitiator;
  translated?: boolean;
  created_at?: { toDate?: () => Date };
  createdAt?: { toDate?: () => Date };
  updated_at?: { toDate?: () => Date };
  updatedAt?: { toDate?: () => Date };
  timed_out_at?: { toDate?: () => Date };
  timedOutAt?: { toDate?: () => Date };
};

const CALL_TIMEOUT_MS = 30_000;
const CALL_STARTED_MESSAGE =
  "ゲストが通話を開始しました。フロントの応答をお待ちください。";
const CALL_UNAVAILABLE_MESSAGE =
  "通話を試みましたが応答がありませんでした。引き続きチャットでご案内します。";

function hasFirebaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
}

function getCallCreatedAt(call: FirestoreCall) {
  return call.created_at?.toDate?.() ?? call.createdAt?.toDate?.() ?? new Date();
}

function getCallStatus(call: FirestoreCall): GuestCallState {
  return call.status === "active" ||
    call.status === "queue" ||
    call.status === "unavailable" ||
    call.status === "ended"
    ? call.status
    : "queue";
}

function getCallThreadId(call: FirestoreCall) {
  return call.thread_id ?? call.threadId ?? null;
}

function getRoomNumber(stayStatus: GuestStayStatus) {
  return stayStatus.roomLabel.replace(/号室$/, "").trim() || stayStatus.roomId;
}

function getStayKey(stayStatus: GuestStayStatus) {
  return stayStatus.stayId ?? stayStatus.roomId;
}

async function markCallUnavailable(callId: string) {
  const db = getAdminDb();
  const callRef = db.collection("calls").doc(callId);
  const snapshot = await callRef.get();

  if (!snapshot.exists) {
    return;
  }

  const call = snapshot.data() as FirestoreCall;

  if (getCallStatus(call) !== "queue") {
    return;
  }

  await callRef.update({
    status: "unavailable",
    timed_out_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  const threadId = getCallThreadId(call);

  if (!threadId) {
    return;
  }

  await db.runTransaction(async (transaction) => {
    const existingNoticeSnapshot = await transaction.get(
      db
        .collection("messages")
        .where("thread_id", "==", threadId)
        .where("sender", "==", "system")
        .where("body", "==", CALL_UNAVAILABLE_MESSAGE)
        .limit(1),
    );

    if (!existingNoticeSnapshot.empty) {
      return;
    }

    const messageRef = db.collection("messages").doc();
    transaction.set(messageRef, {
      thread_id: threadId,
      sender: "system",
      body: CALL_UNAVAILABLE_MESSAGE,
      timestamp: FieldValue.serverTimestamp(),
    });
  });
}

export async function startGuestCallSession(stayStatus: GuestStayStatus) {
  if (!hasFirebaseConfig()) {
    return {
      ok: true as const,
      callId: `demo-call-${stayStatus.roomId}`,
      threadId: "demo-human",
      status: "queue" as GuestCallState,
    };
  }

  const db = getAdminDb();
  const result = await db.runTransaction(async (transaction) => {
    const stayKey = getStayKey(stayStatus);
    const directThreadSnapshot = await transaction.get(
      db
        .collection("chat_threads")
        .where("stay_id", "==", stayKey)
        .where("mode", "==", "human")
        .limit(1),
    );
    const altThreadSnapshot = directThreadSnapshot.empty
      ? await transaction.get(
          db
            .collection("chat_threads")
            .where("stayId", "==", stayKey)
            .where("mode", "==", "human")
            .limit(1),
        )
      : null;
    const existingThreadDoc = directThreadSnapshot.docs[0] ?? altThreadSnapshot?.docs[0] ?? null;
    const threadRef = existingThreadDoc?.ref ?? db.collection("chat_threads").doc();
    const threadId = threadRef.id;

    if (!existingThreadDoc) {
      transaction.set(threadRef, {
        stay_id: stayKey,
        room_id: stayStatus.roomId,
        mode: "human",
        created_at: FieldValue.serverTimestamp(),
      });
    }

    const existingCallSnapshot = await transaction.get(
      db
        .collection("calls")
        .where("thread_id", "==", threadId)
        .where("direction", "==", "guest_to_front")
        .where("status", "in", ["queue", "active"])
        .limit(1),
    );

    if (!existingCallSnapshot.empty) {
      const existingCall = existingCallSnapshot.docs[0];
      const existingData = existingCall.data() as FirestoreCall;

      return {
        callId: existingCall.id,
        threadId,
        status: getCallStatus(existingData),
      };
    }

    const callRef = db.collection("calls").doc();
    const messageRef = db.collection("messages").doc();

    transaction.set(callRef, {
      stay_id: stayKey,
      room_id: stayStatus.roomId,
      room_number: getRoomNumber(stayStatus),
      hotel_id: stayStatus.hotelId ?? null,
      guest_lang: stayStatus.selectedLanguage,
      thread_id: threadId,
      translated: true,
      status: "queue" satisfies GuestCallState,
      initiated_by: "guest" satisfies CallInitiator,
      direction: "guest_to_front" satisfies CallDirection,
      requested_by_staff_uid: null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    transaction.set(messageRef, {
      thread_id: threadId,
      sender: "system",
      body: CALL_STARTED_MESSAGE,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      callId: callRef.id,
      threadId,
      status: "queue" as GuestCallState,
    };
  });

  return {
    ok: true as const,
    callId: result.callId,
    threadId: result.threadId,
    status: result.status,
  };
}

export async function getGuestCallSession(callId: string) {
  if (!hasFirebaseConfig()) {
    return {
      callId,
      status: "queue" as GuestCallState,
      timedOut: false,
    };
  }

  const snapshot = await getAdminDb().collection("calls").doc(callId).get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as FirestoreCall;
  const status = getCallStatus(data);

  if (status === "queue") {
    const createdAt = getCallCreatedAt(data);

    if (Date.now() - createdAt.getTime() >= CALL_TIMEOUT_MS) {
      await markCallUnavailable(callId);

      return {
        callId,
        status: "unavailable" as GuestCallState,
        timedOut: true,
      };
    }
  }

  return {
    callId,
    status,
    timedOut: false,
  };
}

export async function endGuestCallSession(callId: string) {
  if (!hasFirebaseConfig()) {
    return { ok: true as const };
  }

  await getAdminDb().collection("calls").doc(callId).update({
    status: "ended",
    updated_at: FieldValue.serverTimestamp(),
  });

  return { ok: true as const };
}
