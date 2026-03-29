"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { GuestMessage } from "@/lib/guest-demo";

type GuestChatExperienceProps = {
  roomId: string;
  mode: "ai" | "human";
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
  onOptimisticSend: (message: DisplayMessage) => void;
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

function ChatAssistBar({
  roomId,
  mode,
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
