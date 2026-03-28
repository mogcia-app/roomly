"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  arrayUnion,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";

import type { GuestMessage } from "@/lib/guest-demo";
import { db } from "@/lib/firebase";

type GuestChatExperienceProps = {
  roomId: string;
  mode: "ai" | "human";
  callId?: string;
  callState?: "queue" | "active" | "unavailable";
  prompts: string[];
  initialMessages: GuestMessage[];
};

type DisplayMessage = GuestMessage & {
  optimistic?: boolean;
};

type GuestChatComposerProps = {
  roomId: string;
  mode: "ai" | "human";
  prompts: string[];
  onOptimisticSend: (message: DisplayMessage) => void;
};

type StarterActionsProps = {
  roomId: string;
  onOptimisticSend: (message: DisplayMessage) => void;
};

type ChatAssistBarProps = {
  roomId: string;
  mode: "ai" | "human";
  callState?: "queue" | "active" | "unavailable";
  onOptimisticSend: (message: DisplayMessage) => void;
};

type CallStartPayload = {
  callId: string;
  threadId?: string;
  status: "queue" | "active" | "unavailable";
};

type CallSignalingCandidate = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

type CallSignalingDocument = {
  answer_sdp?: RTCSessionDescriptionInit;
  front_ice_candidates?: CallSignalingCandidate[];
  offer_sdp?: RTCSessionDescriptionInit;
  webrtc_status?: "waiting_offer" | "answering" | "connected" | "failed";
};

const requestCategories = [
  "歯ブラシ希望",
  "タオル追加",
  "清掃・片付け",
  "その他の依頼",
] as const;
let optimisticMessageSequence = 0;

function formatDayLabel(timestamp: string | null) {
  if (!timestamp) {
    return "今日";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(timestamp));
}

function formatTimeLabel(timestamp: string | null) {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function senderLabel(sender: GuestMessage["sender"]) {
  if (sender === "ai") {
    return "AI";
  }

  if (sender === "front") {
    return "フロント";
  }

  return "";
}

function shouldShowDateSeparator(
  current: DisplayMessage,
  previous: DisplayMessage | undefined,
) {
  if (!previous) {
    return true;
  }

  return formatDayLabel(current.timestamp) !== formatDayLabel(previous.timestamp);
}

function createOptimisticMessage(
  prefix: string,
  sender: GuestMessage["sender"],
  body: string,
): DisplayMessage {
  optimisticMessageSequence += 1;

  return {
    id: `${prefix}-${optimisticMessageSequence}`,
    sender,
    body,
    timestamp: new Date().toISOString(),
    optimistic: true,
  };
}

function GuestCallWebRTC({
  callId,
}: {
  callId: string;
}) {
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const frontCandidateSetRef = useRef<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const frontCandidateSet = frontCandidateSetRef.current;

    async function setupCall() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const peerConnection = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        localStreamRef.current = stream;
        peerConnectionRef.current = peerConnection;

        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });

        peerConnection.ontrack = (event) => {
          const [remoteStream] = event.streams;

          if (!remoteStream || !remoteAudioRef.current) {
            return;
          }

          remoteAudioRef.current.srcObject = remoteStream;
          void remoteAudioRef.current.play().catch(() => {
            setError("音声再生を開始できませんでした。端末の音声設定をご確認ください。");
          });
        };

        peerConnection.onicecandidate = (event) => {
          if (!event.candidate) {
            return;
          }

          void updateDoc(doc(db, "calls", callId), {
            guest_ice_candidates: arrayUnion(event.candidate.toJSON()),
          }).catch(() => {
            setError("通話接続の候補送信に失敗しました。");
          });
        };

        peerConnection.onconnectionstatechange = () => {
          const connectionState = peerConnection.connectionState;

          if (connectionState === "connected") {
            void updateDoc(doc(db, "calls", callId), {
              webrtc_status: "connected",
            }).catch(() => undefined);
            return;
          }

          if (connectionState === "failed") {
            void updateDoc(doc(db, "calls", callId), {
              webrtc_status: "failed",
            }).catch(() => undefined);
            setError("通話接続に失敗しました。");
          }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        if (isCancelled) {
          return;
        }

        await updateDoc(doc(db, "calls", callId), {
          offer_sdp: {
            type: offer.type,
            sdp: offer.sdp ?? "",
          },
          webrtc_status: "waiting_offer",
        });

        return onSnapshot(doc(db, "calls", callId), async (snapshot) => {
          const data = snapshot.data() as CallSignalingDocument | undefined;

          if (!data || !peerConnectionRef.current) {
            return;
          }

          const activePeerConnection = peerConnectionRef.current;

          if (
            data.answer_sdp &&
            !activePeerConnection.currentRemoteDescription
          ) {
            await activePeerConnection.setRemoteDescription(
              new RTCSessionDescription(data.answer_sdp),
            );
          }

          for (const candidate of data.front_ice_candidates ?? []) {
            const key = JSON.stringify(candidate);

            if (frontCandidateSet.has(key)) {
              continue;
            }

            frontCandidateSet.add(key);
            await activePeerConnection.addIceCandidate(
              new RTCIceCandidate(candidate),
            );
          }
        });
      } catch (caughtError) {
        console.error("[guest/webrtc] failed", caughtError);
        setError("通話の初期化に失敗しました。");

        void updateDoc(doc(db, "calls", callId), {
          webrtc_status: "failed",
        }).catch(() => undefined);
      }
    }

    let unsubscribeSnapshot: (() => void) | undefined;

    void setupCall().then((unsubscribe) => {
      unsubscribeSnapshot = unsubscribe;
    });

    return () => {
      isCancelled = true;
      unsubscribeSnapshot?.();
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      frontCandidateSet.clear();
    };
  }, [callId]);

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      {error ? (
        <div className="mt-3 rounded-[14px] border border-[#f0c8c2] bg-[#fff3ef] px-3 py-2 text-[12px] text-[#8e2219]">
          {error}
        </div>
      ) : null}
    </>
  );
}

function GuestChatInput({
  roomId,
  mode,
  prompts,
  onOptimisticSend,
}: GuestChatComposerProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submitMessage(body: string) {
    const trimmed = body.trim();

    if (!trimmed) {
      return;
    }

    onOptimisticSend(createOptimisticMessage("optimistic", "guest", trimmed));
    setError(null);
    setMessage("");

    const response = await fetch(`/api/guest/rooms/${roomId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: trimmed,
        mode,
      }),
    });

    if (!response.ok) {
      setError("メッセージを送信できませんでした。再度お試しください。");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <section className="sticky bottom-0 border-t border-black/5 bg-[#f6f1eb] px-3 py-2 backdrop-blur lg:px-5 lg:py-2">
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1 lg:mb-1.5">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={isPending}
            onClick={() => submitMessage(prompt)}
            className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-[#5d463d] shadow-[0_2px_8px_rgba(72,47,35,0.06)] transition disabled:opacity-60 lg:px-3 lg:py-1 lg:text-[11px]"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="rounded-[26px] bg-white p-2 shadow-[0_4px_18px_rgba(72,47,35,0.08)] lg:rounded-[22px] lg:p-1.5">
        <label htmlFor="guest-message" className="sr-only">
          メッセージ
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="guest-message"
            rows={1}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="メッセージを入力"
            className="min-h-[44px] flex-1 resize-none rounded-[18px] border border-transparent bg-[#f7f7f7] px-4 py-3 text-sm text-[#2d211d] outline-none lg:min-h-[40px] lg:rounded-[16px] lg:px-3.5 lg:py-2.5"
          />
          <button
            type="button"
            disabled={!message.trim() || isPending}
            onClick={() => submitMessage(message)}
            className="flex h-11 min-w-11 items-center justify-center rounded-full bg-[#ad2218] px-4 text-sm font-semibold text-white disabled:opacity-60 lg:h-10 lg:min-w-10 lg:px-3.5 lg:text-[12px]"
          >
            {isPending ? "..." : "送信"}
          </button>
        </div>
        {error ? (
          <div className="mt-2 rounded-[18px] border border-[#f0c8c2] bg-[#fff3ef] px-4 py-3 text-sm text-[#8e2219]">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CallStatusPanel({
  roomId,
  callId,
  callState,
}: {
  roomId: string;
  callId?: string;
  callState: "queue" | "active" | "unavailable";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!callId || (callState !== "queue" && callState !== "active")) {
      return;
    }

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/guest/calls/${callId}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        callId: string;
        status: "queue" | "active" | "unavailable" | "ended";
      };

      if (payload.status === callState) {
        return;
      }

      const params = new URLSearchParams();
      params.set("mode", payload.status === "ended" ? "ai" : "human");

      if (payload.status !== "ended") {
        params.set("callId", payload.callId);
      }

      if (
        payload.status === "queue" ||
        payload.status === "active" ||
        payload.status === "unavailable"
      ) {
        params.set("call", payload.status);
      }

      startTransition(() => {
        router.replace(`/guest/${roomId}/chat?${params.toString()}`);
        router.refresh();
      });
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [callId, callState, roomId, router, startTransition]);

  async function switchToChat() {
    setError(null);

    const response = await fetch(`/api/guest/rooms/${roomId}/handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      setError("チャットへの切替に失敗しました。再度お試しください。");
      return;
    }

    startTransition(() => {
      router.push(`/guest/${roomId}/chat?mode=human`);
    });
  }

  async function retryCall() {
    setError(null);

    const response = await fetch(`/api/guest/rooms/${roomId}/calls`, {
      method: "POST",
    });

    if (!response.ok) {
      setError("通話の呼び出しに失敗しました。再度お試しください。");
      return;
    }

    const payload = (await response.json()) as CallStartPayload;

    startTransition(() => {
      router.push(
        `/guest/${roomId}/chat?mode=human&call=${payload.status}&callId=${payload.callId}`,
      );
      router.refresh();
    });
  }

  function endCall() {
    if (!callId) {
      startTransition(() => {
        router.push(`/guest/${roomId}/chat?mode=ai`);
      });
      return;
    }

    void (async () => {
      await fetch(`/api/guest/calls/${callId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "end" }),
      });

      startTransition(() => {
        router.push(`/guest/${roomId}/chat?mode=ai`);
      });
    })();
  }

  return (
    <div className="mb-4 rounded-[24px] border border-[#e8d7cf] bg-white/92 p-4 shadow-[0_8px_28px_rgba(72,47,35,0.08)]">
      {callState === "queue" ? (
        <>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-[#8e2219]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ad2218] animate-pulse" />
            呼び出し中
          </div>
          <div className="mt-2 text-[18px] font-semibold text-[#251815]">
            フロントを呼び出しています
          </div>
          <div className="mt-1 text-sm leading-6 text-[#6f5850]">
            応答があるまでこのままお待ちください。つながらない場合は、チャットに切り替えてメッセージを送れます。
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                void switchToChat();
              }}
              className="rounded-full bg-[#ad2218] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
            >
              チャットで送る
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={endCall}
              className="rounded-full border border-[#eaded9] px-4 py-2 text-[12px] font-semibold text-[#5d463d] disabled:opacity-60"
            >
              呼び出しを終了
            </button>
          </div>
        </>
      ) : null}

      {callState === "active" ? (
        <>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-[#8e2219]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ad2218] animate-pulse" />
            通訳中...
          </div>
          <div className="mt-2 text-[18px] font-semibold text-[#251815]">
            通話に接続しました
          </div>
          <div className="mt-1 text-sm leading-6 text-[#6f5850]">
            発話後、翻訳音声が再生されるまで2〜4秒ほどかかる場合があります。
          </div>
          {callId ? <GuestCallWebRTC callId={callId} /> : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded-full border border-[#eaded9] px-4 py-2 text-[12px] font-semibold text-[#5d463d]"
            >
              保留
            </button>
            <button
              type="button"
              onClick={endCall}
              className="rounded-full bg-[#ad2218] px-4 py-2 text-[12px] font-semibold text-white"
            >
              終了
            </button>
          </div>
        </>
      ) : null}

      {callState === "unavailable" ? (
        <>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-[#8e2219]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#d39b90]" />
            現在つながりません
          </div>
          <div className="mt-2 text-[18px] font-semibold text-[#251815]">
            いまは通話に出られません
          </div>
          <div className="mt-1 text-sm leading-6 text-[#6f5850]">
            チャットで内容を送ることができます。急ぎでなければ、そのままメッセージをお送りください。
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                void switchToChat();
              }}
              className="rounded-full bg-[#ad2218] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
            >
              チャットに切り替える
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                void retryCall();
              }}
              className="rounded-full border border-[#eaded9] px-4 py-2 text-[12px] font-semibold text-[#5d463d] disabled:opacity-60"
            >
              もう一度呼び出す
            </button>
          </div>
        </>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-[14px] border border-[#f0c8c2] bg-[#fff3ef] px-3 py-2 text-[12px] text-[#8e2219]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function ChatAssistBar({
  roomId,
  mode,
  callState,
  onOptimisticSend,
}: ChatAssistBarProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function connectToFront() {
    setError(null);

    onOptimisticSend({
      id: `handoff-assist-${Date.now()}`,
      sender: "system",
      body: "担当者に接続中です。返信をお待ちください。",
      timestamp: new Date().toISOString(),
      optimistic: true,
    });

    const response = await fetch(`/api/guest/rooms/${roomId}/handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      setError("フロントへの接続に失敗しました。再度お試しください。");
      return;
    }

    startTransition(() => {
      router.push(`/guest/${roomId}/chat?mode=human`);
    });
  }

  async function startCall() {
    setError(null);

    const response = await fetch(`/api/guest/rooms/${roomId}/calls`, {
      method: "POST",
    });

    if (!response.ok) {
      setError("通話の呼び出しに失敗しました。再度お試しください。");
      return;
    }

    const payload = (await response.json()) as CallStartPayload;

    startTransition(() => {
      router.push(
        `/guest/${roomId}/chat?mode=human&call=${payload.status}&callId=${payload.callId}`,
      );
      router.refresh();
    });
  }

  return (
    <div className="border-t border-black/5 bg-[#faf6f2] px-3 py-2 lg:px-5">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          disabled={isPending || mode === "human"}
          onClick={() => {
            void connectToFront();
          }}
          className={`shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold transition ${
            mode === "human"
              ? "bg-[#eadfd8] text-[#8b7369]"
              : "bg-white text-[#5d463d] shadow-[0_2px_10px_rgba(72,47,35,0.08)]"
          } disabled:opacity-60`}
        >
          {mode === "human" ? "フロント対応中" : "フロントにつなぐ"}
        </button>
        {mode === "human" ? (
          <button
            type="button"
            disabled={isPending || callState === "queue" || callState === "active"}
            onClick={() => {
              void startCall();
            }}
            className="shrink-0 rounded-full bg-[#fff3ef] px-3.5 py-2 text-[12px] font-semibold text-[#8e2219] shadow-[0_2px_10px_rgba(72,47,35,0.06)] disabled:opacity-60"
          >
            {callState === "queue" ? "呼び出し中" : callState === "active" ? "通話中" : "通話する"}
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="mt-2 rounded-[14px] border border-[#f0c8c2] bg-[#fff3ef] px-3 py-2 text-[12px] text-[#8e2219]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function StarterActions({
  roomId,
  onOptimisticSend,
}: StarterActionsProps) {
  const router = useRouter();
  const [isRequestOptionsOpen, setIsRequestOptionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function sendAiStarter(body: string) {
    setError(null);

    onOptimisticSend(createOptimisticMessage("starter", "guest", body));

    const response = await fetch(`/api/guest/rooms/${roomId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body,
        mode: "ai",
      }),
    });

    if (!response.ok) {
      setError("AIへの問い合わせ開始に失敗しました。再度お試しください。");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  async function startHumanRequest(category: string) {
    setError(null);
    setIsRequestOptionsOpen(false);

    onOptimisticSend(
      createOptimisticMessage("handoff-category", "guest", category),
    );

    const response = await fetch(`/api/guest/rooms/${roomId}/handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ category }),
    });

    if (!response.ok) {
      setError("フロントへの通知に失敗しました。再度お試しください。");
      return;
    }

    startTransition(() => {
      router.push(`/guest/${roomId}/chat?mode=human`);
    });
  }

  return (
    <div className="mb-4 ml-1 max-w-[82%] lg:max-w-[52%]">
      <div className="mb-1 text-[11px] font-medium text-black/55">AI</div>
      <div className="rounded-[22px] rounded-bl-md bg-white px-4 py-3 text-sm leading-6 text-[#33231e] shadow-[0_6px_20px_rgba(72,47,35,0.06)] lg:rounded-[18px] lg:px-3.5 lg:py-2.5 lg:text-[13px] lg:leading-5">
        ご用件をお聞かせください。内容に合わせてご案内します。
      </div>
      <div className="mt-3 space-y-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setIsRequestOptionsOpen((current) => !current);
          }}
          className="flex w-full items-center gap-3 rounded-[18px] bg-white px-3.5 py-3 text-left shadow-[0_4px_18px_rgba(72,47,35,0.08)] transition disabled:opacity-60"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fff3ef] text-lg">
            🧺
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[#251815]">お届け・ご依頼</div>
            <div className="mt-0.5 text-xs leading-5 text-[#7a6056]">
              アメニティ追加などをフロントへ送ります
            </div>
          </div>
          <div className="text-lg text-[#b2867a]">›</div>
        </button>
        {isRequestOptionsOpen ? (
          <div className="rounded-[18px] bg-[#fff8f6] px-3 py-3 shadow-[0_4px_18px_rgba(72,47,35,0.05)]">
            <div className="mb-2 text-[12px] font-medium text-[#7a554a]">
              ご依頼内容を選んでください
            </div>
            <div className="flex flex-wrap gap-2">
              {requestCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    void startHumanRequest(category);
                  }}
                  className="rounded-full border border-[#eaded9] bg-white px-3 py-1.5 text-[12px] font-medium text-[#7a554a] disabled:opacity-60"
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            void sendAiStarter("館内設備やお部屋の使い方を教えてください。");
          }}
          className="flex w-full items-center gap-3 rounded-[18px] bg-white px-3.5 py-3 text-left shadow-[0_4px_18px_rgba(72,47,35,0.08)] transition disabled:opacity-60"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f5f1ee] text-lg">
            💬
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[#251815]">館内・お部屋のご案内</div>
            <div className="mt-0.5 text-xs leading-5 text-[#7a6056]">
              まずはAIがその場でご案内します
            </div>
          </div>
          <div className="text-lg text-[#b2867a]">›</div>
        </button>
      </div>
      {error ? (
        <div className="mt-2 rounded-[16px] border border-[#f0c8c2] bg-[#fff3ef] px-4 py-3 text-sm text-[#8e2219]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function HumanStarter() {
  return (
    <div className="mb-4 ml-1 max-w-[82%] lg:max-w-[52%]">
      <div className="mb-1 text-[11px] font-medium text-black/55">フロント</div>
      <div className="rounded-[22px] rounded-bl-md bg-white px-4 py-3 text-sm leading-6 text-[#33231e] shadow-[0_6px_20px_rgba(72,47,35,0.06)] lg:rounded-[18px] lg:px-3.5 lg:py-2.5 lg:text-[13px] lg:leading-5">
        担当者に接続中です。内容を確認ししだい返信します。
      </div>
    </div>
  );
}

export function GuestChatExperience({
  roomId,
  mode,
  callId,
  callState,
  prompts,
  initialMessages,
}: GuestChatExperienceProps) {
  const [optimisticMessages, setOptimisticMessages] = useState<DisplayMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const messages = useMemo<DisplayMessage[]>(() => {
    return [...initialMessages, ...optimisticMessages];
  }, [initialMessages, optimisticMessages]);
  const hasGuestMessage = messages.some((message) => message.sender === "guest");
  const hasNonSystemHistory = messages.some(
    (message) => message.sender === "guest" || message.sender === "ai" || message.sender === "front",
  );
  const visibleMessages = useMemo(() => {
    if (!hasGuestMessage && mode === "ai") {
      return messages.filter(
        (message) =>
          !(
            message.sender === "ai" &&
            message.body === "ご用件をお聞かせください。下の候補から選ぶか、そのまま入力してください。"
          ),
      );
    }

    return messages;
  }, [hasGuestMessage, messages, mode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleMessages]);

  return (
    <>
      <section className="flex-1 overflow-y-auto bg-[#e6ddd5] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.32),transparent_20%),linear-gradient(0deg,rgba(255,255,255,0.08),rgba(255,255,255,0.08))] px-3 py-4 lg:px-6 lg:py-3">
        {callState ? <CallStatusPanel roomId={roomId} callId={callId} callState={callState} /> : null}
        {!hasGuestMessage && mode === "ai" ? (
          <StarterActions
            roomId={roomId}
            onOptimisticSend={(message) => {
              setOptimisticMessages((current) => [...current, message]);
            }}
          />
        ) : null}
        {!hasGuestMessage && mode === "human" && !hasNonSystemHistory ? (
          <HumanStarter />
        ) : null}
        <div className="space-y-3 lg:space-y-2.5">
          {visibleMessages.map((message, index) => {
            const isGuest = message.sender === "guest";
            const isSystem = message.sender === "system";
            const previous = visibleMessages[index - 1];

            return (
              <div key={message.id}>
                {shouldShowDateSeparator(message, previous) ? (
                  <div className="mb-3 flex justify-center">
                    <div className="rounded-full bg-white/85 px-3 py-1 text-[11px] font-medium text-[#7a6056]">
                      {formatDayLabel(message.timestamp)}
                    </div>
                  </div>
                ) : null}
                <div className={`flex ${isGuest ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[82%] lg:max-w-[60%]">
                    {!isGuest && !isSystem ? (
                      <div className="mb-1 ml-1 text-[11px] font-medium text-black/55 lg:text-[10px]">
                        {senderLabel(message.sender)}
                      </div>
                    ) : null}
                    <div
                      className={`rounded-[22px] px-4 py-3 text-sm leading-6 shadow-[0_6px_20px_rgba(72,47,35,0.06)] lg:rounded-[18px] lg:px-3.5 lg:py-2.5 lg:text-[13px] lg:leading-5 ${
                        isSystem
                          ? "bg-[#f9efe9] text-[#8e2219]"
                        : isGuest
                            ? "rounded-br-md bg-[#ad2218] text-white"
                            : "rounded-bl-md bg-white text-[#33231e]"
                      }`}
                    >
                      {message.body}
                    </div>
                    <div
                      className={`mt-1 flex text-[11px] lg:text-[10px] ${
                        isGuest ? "justify-end text-[#8a6d63]" : "justify-start text-[#8a6d63]"
                      }`}
                    >
                      <span>{formatTimeLabel(message.timestamp)}</span>
                      {isGuest ? (
                        <span className="ml-2 font-medium">
                          {message.optimistic ? "送信中..." : "既読"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </section>

      <ChatAssistBar
        roomId={roomId}
        mode={mode}
        callState={callState}
        onOptimisticSend={(message) => {
          setOptimisticMessages((current) => [...current, message]);
        }}
      />

      <GuestChatInput
        roomId={roomId}
        mode={mode}
        prompts={prompts}
        onOptimisticSend={(message) => {
          setOptimisticMessages((current) => [...current, message]);
        }}
      />
    </>
  );
}
