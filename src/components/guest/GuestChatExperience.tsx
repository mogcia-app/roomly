"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  GUEST_RICH_MENU_ACTION_REQUIREMENTS,
  isGuestRichMenuActionType,
} from "@/lib/guest-contract";
import {
  getGuestUiCopy,
  type GuestLanguage,
  type GuestMessage,
} from "@/lib/guest-demo";
import {
  type GuestRichMenu,
  type GuestRichMenuItem,
} from "@/lib/guest-rich-menu";

type GuestChatExperienceProps = {
  roomId: string;
  roomLabel: string;
  richMenu: GuestRichMenu | null;
  language: GuestLanguage;
  mode: "ai" | "human";
  prompts: string[];
  initialMessages: GuestMessage[];
};

type DisplayMessage = GuestMessage & {
  optimistic?: boolean;
};

type GuestChatComposerProps = {
  roomId: string;
  language: GuestLanguage;
  mode: "ai" | "human";
  richMenu: GuestRichMenu | null;
  prompts: string[];
  onOptimisticSend: (message: DisplayMessage) => void;
};

type StarterActionsProps = {
  roomId: string;
  roomLabel?: string;
  language: GuestLanguage;
  onOptimisticSend: (message: DisplayMessage) => void;
};
let optimisticMessageSequence = 0;

function shouldOfferHumanHandoff(message: GuestMessage) {
  if (message.sender !== "ai" && message.sender !== "system") {
    return false;
  }

  return (
    message.body.includes("フロントへご確認ください") ||
    message.body.includes("フロントへおつなぎ") ||
    message.body.includes("Please check with the front desk") ||
    message.body.includes("请向前台确认") ||
    message.body.includes("프런트로 확인")
  );
}

function getGuestLocale(language: GuestLanguage) {
  if (language === "en") {
    return "en-US";
  }

  if (language === "zh-CN") {
    return "zh-CN";
  }

  if (language === "ko") {
    return "ko-KR";
  }

  return "ja-JP";
}

function formatDayLabel(timestamp: string | null, language: GuestLanguage) {
  if (!timestamp) {
    return getGuestUiCopy(language).todayLabel;
  }

  return new Intl.DateTimeFormat(getGuestLocale(language), {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(timestamp));
}

function formatTimeLabel(timestamp: string | null, language: GuestLanguage) {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat(getGuestLocale(language), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(timestamp));
}

function senderLabel(sender: GuestMessage["sender"], language: GuestLanguage) {
  const ui = getGuestUiCopy(language);

  if (sender === "ai") {
    return ui.aiLabel;
  }

  if (sender === "front") {
    return ui.frontLabel;
  }

  return "";
}

function senderAvatar(sender: GuestMessage["sender"], language: GuestLanguage) {
  if (sender === "front") {
      return {
        kind: "text" as const,
        label:
          language === "en" ? "F" : language === "zh-CN" ? "前" : language === "ko" ? "프" : "フ",
      className: "bg-white text-[#6f564b]",
    };
  }

  if (sender === "ai") {
    return {
      kind: "image" as const,
      label: "AI",
      className: "bg-white text-[#6f564b]",
    };
  }

  return {
    kind: "text" as const,
    label: "案",
    className: "bg-white text-[#6f564b]",
  };
}

function shouldShowDateSeparator(
  current: DisplayMessage,
  previous: DisplayMessage | undefined,
  language: GuestLanguage,
) {
  if (!previous) {
    return true;
  }

  return (
    formatDayLabel(current.timestamp, language) !==
    formatDayLabel(previous.timestamp, language)
  );
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
  language,
  mode,
  richMenu,
  prompts,
  onOptimisticSend,
}: GuestChatComposerProps) {
  const router = useRouter();
  const ui = getGuestUiCopy(language);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRichMenuOpen, setIsRichMenuOpen] = useState(false);
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
      setError(ui.messageSendError);
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  async function submitRichMenuAction(action: GuestRichMenuItem) {
    setError(null);

    if (!isGuestRichMenuActionType(action.actionType)) {
      console.warn("[guest/rich-menu] unsupported action", {
        roomId,
        actionId: action.id,
        actionType: action.actionType,
      });
      setError(ui.menuUnavailableError);
      return;
    }

    const requiredField = GUEST_RICH_MENU_ACTION_REQUIREMENTS[action.actionType];

    if (requiredField && !action[requiredField]) {
      console.warn("[guest/rich-menu] missing action config", {
        roomId,
        actionId: action.id,
        actionType: action.actionType,
        requiredField,
      });
      setError(ui.menuUnavailableError);
      return;
    }

    if (action.actionType === "external_link" && action.url) {
      window.open(action.url, "_blank", "noopener,noreferrer");
      return;
    }

    if (action.actionType === "ai_prompt" && action.prompt) {
      onOptimisticSend(createOptimisticMessage("rich-prompt", "guest", action.prompt));

      const response = await fetch(`/api/guest/rooms/${roomId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: action.prompt,
          mode: "ai",
        }),
      });

      if (!response.ok) {
        setError(ui.messageSendError);
        return;
      }

      startTransition(() => {
        if (mode !== "ai") {
          router.push(`/guest/${roomId}/chat?mode=ai`);
        } else {
          router.refresh();
        }
      });
      return;
    }

    if (
      action.actionType === "handoff_category" &&
      action.handoffCategory
    ) {
      onOptimisticSend(
        createOptimisticMessage("handoff-category", "guest", action.handoffCategory),
      );

      const response = await fetch(`/api/guest/rooms/${roomId}/handoff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ category: action.handoffCategory }),
      });

      if (!response.ok) {
        setError(ui.handoffError);
        return;
      }

      startTransition(() => {
        router.push(`/guest/${roomId}/chat?mode=human`);
      });
      return;
    }

    if (action.actionType === "human_handoff") {
      const response = await fetch(`/api/guest/rooms/${roomId}/handoff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        setError(ui.handoffError);
        return;
      }

      startTransition(() => {
        router.push(`/guest/${roomId}/chat?mode=human`);
      });
      return;
    }

    if (action.actionType === "language") {
      startTransition(() => {
        router.push(`/guest/${roomId}/language`);
      });
      return;
    }

    return;
  }

  return (
    <section className="sticky bottom-0 z-20 bg-transparent px-0 pb-0">
      {richMenu ? (
        <div
          className={`grid overflow-hidden transition-[grid-template-rows,opacity,transform] duration-300 ease-out ${
            isRichMenuOpen
              ? "mb-3 grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0">
            <div className="border border-[#d9cdc7] bg-[#ede3db] p-3">
              <div
                className="relative mx-auto w-full overflow-hidden border border-[#e7ddd8] bg-white"
                style={{
                  aspectRatio: `${richMenu.imageWidth} / ${richMenu.imageHeight}`,
                }}
              >
                <img
                  src={richMenu.imageUrl}
                  alt="Guest rich menu"
                  className="h-full w-full object-cover"
                />
                {richMenu.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isPending}
                    aria-label={item.label}
                    title={item.label}
                    onClick={() => {
                      void submitRichMenuAction(item);
                    }}
                    className="absolute bg-transparent"
                    style={{
                      left: `${(item.x / richMenu.imageWidth) * 100}%`,
                      top: `${(item.y / richMenu.imageHeight) * 100}%`,
                      width: `${(item.width / richMenu.imageWidth) * 100}%`,
                      height: `${(item.height / richMenu.imageHeight) * 100}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {prompts.length > 0 ? (
        <div className="mb-2 flex gap-2 overflow-x-auto px-3 pb-1 lg:mb-2 lg:px-8">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isPending}
              onClick={() => submitMessage(prompt)}
              className="shrink-0 rounded-full border border-[#e7ddd8] bg-white px-3 py-1.5 text-[12px] font-light text-[#7a6056] shadow-[0_4px_14px_rgba(72,47,35,0.04)] transition disabled:opacity-60 lg:px-3 lg:py-1 lg:text-[11px]"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      <div className="border-t border-[#e7ddd8] bg-white">
        <div className="flex items-center gap-2 px-3 pb-2 pt-2 lg:px-8">
        <button
          type="button"
          aria-expanded={isRichMenuOpen}
          aria-label="Open quick menu"
          disabled={!richMenu}
          onClick={() => {
            setIsRichMenuOpen((current) => !current);
          }}
          className={`flex h-10 w-10 shrink-0 items-center justify-center border transition lg:h-10 lg:w-10 ${
            !richMenu
              ? "border-[#ebe1dc] bg-[#f2ece7] text-[#b3a49c]"
              : isRichMenuOpen
              ? "border-[#dcc7bf] bg-[#f7e7e1] text-[#8b4c43]"
              : "border-[#e7ddd8] bg-[#faf5f1] text-[#8f8078]"
          }`}
        >
          <span
            className={`block text-lg leading-none transition-transform duration-300 ${
              isRichMenuOpen ? "rotate-90" : "rotate-0"
            }`}
          >
            ›
          </span>
        </button>

        <div className="flex-1">
          <label htmlFor="guest-message" className="sr-only">
            メッセージ
          </label>
          <div className="flex items-center gap-2 p-2">
            <div className="flex h-10 flex-1 items-center border border-[#e7ddd8] bg-white">
              <textarea
                id="guest-message"
                rows={1}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={ui.messagePlaceholder}
                className="h-10 flex-1 resize-none bg-white px-3 py-2 text-sm leading-5 text-[#5f463d] outline-none"
              />
            </div>
            <button
              type="button"
              disabled={!message.trim() || isPending}
              onClick={() => submitMessage(message)}
              className="flex h-10 min-w-[56px] items-center justify-center border border-[#981d15] bg-[#ad2218] px-4 text-sm font-light text-white disabled:opacity-60 lg:h-10 lg:min-w-[56px] lg:px-4 lg:text-[12px]"
            >
              {isPending ? "..." : ui.sendLabel}
            </button>
          </div>
          {error ? (
            <div className="mt-2 rounded-[18px] border border-[#f2d3cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#ad2218]">
              {error}
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </section>
  );
}

function StarterActions({
  roomId,
  roomLabel,
  language,
  onOptimisticSend,
}: StarterActionsProps) {
  const router = useRouter();
  const ui = getGuestUiCopy(language);
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
      setError(ui.aiStarterError);
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
      setError(ui.handoffError);
      return;
    }

    startTransition(() => {
      router.push(`/guest/${roomId}/chat?mode=human`);
    });
  }

  return (
    <div className="mb-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-[12px] font-light text-[#6f564b] shadow-[0_8px_20px_rgba(72,47,35,0.06)]">
          <img
            src="/icon1.png"
            alt="AI assistant icon"
            width={32}
            height={32}
            className="h-6 w-6 object-cover"
          />
        </div>
        <div className="max-w-[82%] rounded-[24px] rounded-bl-md bg-white px-4 py-3 text-sm leading-6 text-[#33231e] shadow-[0_10px_24px_rgba(72,47,35,0.05)] lg:max-w-[48%] xl:max-w-[42%]">
          <div className="whitespace-pre-line">
            {roomLabel ? `${roomLabel}様\n` : ""}
            {ui.introMessage}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setIsRequestOptionsOpen((current) => !current);
              }}
              className="flex w-full items-start rounded-[18px] border border-[#e7ddd8] bg-white px-3.5 py-3 text-left transition disabled:opacity-60"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-light text-[#251815]">{ui.deliveryTitle}</div>
                <div className="mt-0.5 text-xs leading-5 text-[#7a6056]">
                  {ui.deliveryDescription}
                </div>
              </div>
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                void sendAiStarter(ui.roomGuideStarterBody);
              }}
              className="flex w-full items-start rounded-[18px] border border-[#e7ddd8] bg-[#fffaf7] px-3.5 py-3 text-left transition disabled:opacity-60"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-light text-[#251815]">{ui.roomGuideTitle}</div>
                <div className="mt-0.5 text-xs leading-5 text-[#7a6056]">
                  {ui.roomGuideDescription}
                </div>
              </div>
            </button>
          </div>
          {isRequestOptionsOpen ? (
            <div className="mt-2 rounded-[18px] border border-[#ebe1dc] bg-[#fffaf7] px-3 py-3">
              <div className="mb-2 text-[12px] font-light text-[#7a554a]">
                {ui.requestPrompt}
              </div>
              <div className="flex flex-wrap gap-2">
                {ui.requestCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      void startHumanRequest(category);
                    }}
                    className="rounded-full border border-[#e7ddd8] bg-white px-3 py-1.5 text-[12px] font-light text-[#7a554a] disabled:opacity-60"
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {error ? (
        <div className="mt-2 ml-[52px] rounded-[16px] border border-[#f2d3cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#ad2218]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function HumanStarter({ language }: { language: GuestLanguage }) {
  const ui = getGuestUiCopy(language);

  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[12px] font-light text-[#6f564b] shadow-[0_8px_20px_rgba(72,47,35,0.06)]">
        {senderAvatar("front", language).label}
      </div>
      <div className="max-w-[82%] rounded-[24px] rounded-bl-md bg-white px-4 py-3 text-sm leading-6 text-[#33231e] shadow-[0_10px_24px_rgba(72,47,35,0.05)] lg:max-w-[48%] xl:max-w-[42%]">
        {ui.humanStarterMessage}
      </div>
    </div>
  );
}

function HumanHandoffCta({
  roomId,
  language,
  onOptimisticSend,
}: StarterActionsProps) {
  const router = useRouter();
  const ui = getGuestUiCopy(language);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function requestHandoff() {
    setError(null);
    const requestLabel =
      language === "en"
        ? "Please connect me to the front desk."
        : language === "zh-CN"
          ? "请帮我联系前台。"
          : language === "ko"
            ? "프런트로 연결해 주세요."
            : "フロント対応をお願いします。";

    onOptimisticSend(
      createOptimisticMessage("handoff-request", "guest", requestLabel),
    );

    const response = await fetch(`/api/guest/rooms/${roomId}/handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      setError(ui.handoffError);
      return;
    }

    startTransition(() => {
      router.push(`/guest/${roomId}/chat?mode=human`);
    });
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          void requestHandoff();
        }}
        className="w-full rounded-[18px] border border-[#e7ddd8] bg-white px-4 py-3 text-sm font-light text-[#7a554a] shadow-[0_8px_20px_rgba(72,47,35,0.04)] transition hover:bg-[#fffaf7] disabled:opacity-60"
      >
        {language === "en"
          ? "Ask the front desk"
          : language === "zh-CN"
            ? "联系前台"
            : language === "ko"
              ? "프런트에 문의"
              : "フロントに聞く"}
      </button>
      {error ? (
        <div className="mt-2 rounded-[16px] border border-[#f2d3cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#ad2218]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function GuestChatExperience({
  roomId,
  roomLabel,
  richMenu,
  language,
  mode,
  prompts,
  initialMessages,
}: GuestChatExperienceProps) {
  const ui = getGuestUiCopy(language);
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
            message.id === "ai-1"
          ),
      );
    }

    return messages;
  }, [hasGuestMessage, messages, mode]);
  const latestAssistMessage = [...visibleMessages]
    .reverse()
    .find((message) => message.sender === "ai" || message.sender === "system");
  const showHumanHandoffCta =
    mode === "ai" && latestAssistMessage ? shouldOfferHumanHandoff(latestAssistMessage) : false;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleMessages]);

  return (
    <>
      <section className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f6efe8_0%,#efe5dc_100%)] px-3 py-4 lg:px-8 lg:py-6">
        {!hasGuestMessage && mode === "ai" ? (
          <StarterActions
            roomId={roomId}
            roomLabel={roomLabel}
            language={language}
            onOptimisticSend={(message) => {
              setOptimisticMessages((current) => [...current, message]);
            }}
          />
        ) : null}
        {!hasGuestMessage && mode === "human" && !hasNonSystemHistory ? (
          <HumanStarter language={language} />
        ) : null}
        <div className="space-y-3 lg:space-y-2.5">
          {visibleMessages.map((message, index) => {
            const isGuest = message.sender === "guest";
            const isSystem = message.sender === "system";
            const previous = visibleMessages[index - 1];

            return (
              <div key={message.id}>
                {shouldShowDateSeparator(message, previous, language) ? (
                  <div className="mb-3 flex justify-center">
                    <div className="rounded-full bg-[#d8dee9] px-3 py-1 text-[11px] font-light text-[#56657f]">
                      {formatDayLabel(message.timestamp, language)}
                    </div>
                  </div>
                ) : null}
                <div className={`flex ${isGuest ? "justify-end" : "justify-start"}`}>
                  {isGuest ? (
                    <div className="max-w-[86%] lg:max-w-[48%] xl:max-w-[42%]">
                      <div className="rounded-[24px] rounded-br-md bg-[#06c755] px-4 py-3 text-sm leading-6 text-white shadow-[0_14px_28px_rgba(6,199,85,0.18)] lg:rounded-[20px] lg:px-3.5 lg:py-2.5 lg:text-[13px] lg:leading-5">
                        {message.body}
                      </div>
                      <div className="mt-1 flex justify-end text-[11px] text-[#8b776e] lg:text-[10px]">
                        <span>{formatTimeLabel(message.timestamp, language)}</span>
                        <span className="ml-2 font-light">
                          {message.optimistic ? ui.sendingLabel : ui.readLabel}
                        </span>
                      </div>
                    </div>
                  ) : isSystem ? (
                    <div className="max-w-[88%] lg:max-w-[52%] xl:max-w-[46%]">
                      <div className="rounded-[24px] bg-white px-4 py-3 text-sm leading-6 text-[#8d4d47] shadow-[0_10px_24px_rgba(72,47,35,0.05)] lg:rounded-[20px] lg:px-3.5 lg:py-2.5 lg:text-[13px] lg:leading-5">
                        {message.body}
                      </div>
                      <div className="mt-1 flex justify-start text-[11px] text-[#8b776e] lg:text-[10px]">
                        <span>{formatTimeLabel(message.timestamp, language)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-light shadow-[0_8px_20px_rgba(25,46,89,0.10)] ${senderAvatar(message.sender, language).className}`}
                      >
                        {senderAvatar(message.sender, language).kind === "image" ? (
                          <img
                            src="/icon1.png"
                            alt="AI assistant icon"
                            width={32}
                            height={32}
                            className="h-6 w-6 object-cover"
                          />
                        ) : (
                          senderAvatar(message.sender, language).label
                        )}
                      </div>
                      <div className="max-w-[88%] lg:max-w-[52%] xl:max-w-[46%]">
                        <div className="mb-1 ml-1 text-[11px] font-light text-[#8b776e] lg:text-[10px]">
                          {senderLabel(message.sender, language)}
                        </div>
                        <div className="rounded-[24px] rounded-bl-md bg-white px-4 py-3 text-sm leading-6 text-[#33231e] shadow-[0_14px_28px_rgba(72,47,35,0.05)] lg:rounded-[20px] lg:px-3.5 lg:py-2.5 lg:text-[13px] lg:leading-5">
                          {message.body}
                        </div>
                        <div className="mt-1 flex justify-start text-[11px] text-[#8b776e] lg:text-[10px]">
                          <span>{formatTimeLabel(message.timestamp, language)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </section>

      {showHumanHandoffCta ? (
        <div className="border-t border-[#e7ddd8] bg-[linear-gradient(180deg,#fffdfb_0%,#faf5f1_100%)] px-3 pt-3 lg:px-8">
          <HumanHandoffCta
            roomId={roomId}
            language={language}
            onOptimisticSend={(message) => {
              setOptimisticMessages((current) => [...current, message]);
            }}
          />
        </div>
      ) : null}

      <GuestChatInput
        roomId={roomId}
        language={language}
        mode={mode}
        richMenu={richMenu}
        prompts={prompts}
        onOptimisticSend={(message) => {
          setOptimisticMessages((current) => [...current, message]);
        }}
      />
    </>
  );
}
