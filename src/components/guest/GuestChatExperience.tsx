"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  GUEST_RICH_MENU_ACTION_SPECS,
  GUEST_RICH_MENU_ACTION_REQUIREMENTS,
  isGuestRichMenuActionType,
} from "@/lib/guest-contract";
import {
  getGuestUiCopy,
  type HearingSheetKnowledge,
  type GuestLanguage,
  type GuestMessage,
} from "@/lib/guest-demo";
import {
  type GuestRichMenu,
  type GuestRichMenuItem,
} from "@/lib/guest-rich-menu";

type GuestChatExperienceProps = {
  debugInfo?: {
    accessSource: "token" | "development-room-id";
    accessHotelId: string | null;
    resolvedHotelId: string | null;
    roomId: string;
    roomLabel: string;
    stayId: string | null;
    selectedLanguage: GuestLanguage | null;
    knowledgeCounts: Record<string, number>;
  } | null;
  roomId: string;
  hotelName?: string | null;
  roomLabel: string;
  richMenu: GuestRichMenu | null;
  language: GuestLanguage;
  mode: "ai" | "human";
  knowledge?: HearingSheetKnowledge | null;
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
  onOptimisticSend: (message: DisplayMessage) => void;
};

type GuestActionPanelProps = {
  roomId: string;
  roomLabel?: string;
  language: GuestLanguage;
  knowledge?: HearingSheetKnowledge | null;
  prompts: string[];
  showIntro?: boolean;
  onOptimisticSend: (message: DisplayMessage) => void;
};
let optimisticMessageSequence = 0;

function hasRequiredRichMenuField(action: GuestRichMenuItem) {
  switch (action.actionType) {
    case "external_link":
      return Boolean(action.url);
    case "handoff_category":
      return Boolean(action.handoffCategory);
    case "ai_prompt":
      return Boolean(action.prompt);
    case "language":
    case "human_handoff":
      return true;
    default:
      return false;
  }
}

function getGuestLocale(language: GuestLanguage) {
  if (language === "en") {
    return "en-US";
  }

  if (language === "zh-CN") {
    return "zh-CN";
  }

  if (language === "zh-TW") {
    return "zh-TW";
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

function senderLabel(sender: GuestMessage["sender"], hotelName?: string | null) {
  if ((sender === "ai" || sender === "front") && hotelName?.trim()) {
    return hotelName.trim();
  }

  return "";
}

function senderAvatar(sender: GuestMessage["sender"], language: GuestLanguage) {
  if (sender === "front") {
      return {
        kind: "text" as const,
        label:
          language === "en"
            ? "F"
            : language === "zh-CN" || language === "zh-TW"
              ? "前"
              : language === "ko"
                ? "프"
                : "フ",
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

function getGuestActionCopy(language: GuestLanguage) {
  if (language === "en") {
    return {
      helperBody: "Choose how you want to continue.",
      aiPrompt: "What would you like help with? Choose from the topics the hotel has registered.",
      aiEmpty: "No AI guide topics are registered yet. Please type your question or contact the front desk.",
    };
  }

  if (language === "zh-CN") {
    return {
      helperBody: "请选择您想继续的方式。",
      aiPrompt: "请问您想了解什么？以下仅显示酒店已登记的说明内容。",
      aiEmpty: "当前没有已登记的 AI 说明项目。请直接输入问题，或联系前台。",
    };
  }

  if (language === "zh-TW") {
    return {
      helperBody: "請選擇您想繼續的方式。",
      aiPrompt: "請問您想了解什麼？以下僅顯示飯店已登記的說明內容。",
      aiEmpty: "目前沒有已登記的 AI 說明項目。請直接輸入問題，或聯絡前台。",
    };
  }

  if (language === "ko") {
    return {
      helperBody: "원하시는 진행 방법을 선택해 주세요.",
      aiPrompt: "무엇이 궁금하신가요? 아래에는 호텔에 등록된 안내 항목만 표시됩니다.",
      aiEmpty: "등록된 AI 안내 항목이 없습니다. 직접 질문하시거나 프런트에 문의해 주세요.",
    };
  }

  return {
    helperBody: "ご希望の方法を選んでください。",
    aiPrompt: "何についてお困りですか？下にはホテルに登録されている案内項目だけを表示しています。",
    aiEmpty: "AIで案内できる登録項目がまだありません。直接入力するか、フロントへご依頼ください。",
  };
}

type AiGuideOption = {
  key: string;
  label: string;
  prompt: string;
};

function getAiGuideLabel(language: GuestLanguage, key: AiGuideOption["key"]) {
  const labels: Record<AiGuideOption["key"], Record<GuestLanguage, string>> = {
    wifi: { ja: "Wi-Fi", en: "Wi-Fi", "zh-CN": "Wi-Fi", "zh-TW": "Wi-Fi", ko: "Wi-Fi" },
    breakfast: { ja: "朝食", en: "Breakfast", "zh-CN": "早餐", "zh-TW": "早餐", ko: "조식" },
    bath: { ja: "大浴場", en: "Bath", "zh-CN": "浴场", "zh-TW": "浴場", ko: "대욕장" },
    facility: { ja: "館内施設", en: "Facilities", "zh-CN": "馆内设施", "zh-TW": "館內設施", ko: "시설" },
    amenity: { ja: "アメニティ", en: "Amenities", "zh-CN": "备品", "zh-TW": "備品", ko: "어메니티" },
    parking: { ja: "駐車場", en: "Parking", "zh-CN": "停车场", "zh-TW": "停車場", ko: "주차장" },
    checkout: { ja: "チェックアウト", en: "Checkout", "zh-CN": "退房", "zh-TW": "退房", ko: "체크아웃" },
    emergency: { ja: "緊急時", en: "Emergency", "zh-CN": "紧急情况", "zh-TW": "緊急情況", ko: "긴급" },
    roomService: { ja: "ルームサービス", en: "Room service", "zh-CN": "客房服务", "zh-TW": "客房服務", ko: "룸서비스" },
    transport: { ja: "交通案内", en: "Transport", "zh-CN": "交通", "zh-TW": "交通", ko: "교통" },
    nearby: { ja: "周辺案内", en: "Nearby spots", "zh-CN": "周边信息", "zh-TW": "周邊資訊", ko: "주변 안내" },
    frontDesk: { ja: "フロント対応", en: "Front desk", "zh-CN": "前台", "zh-TW": "前台", ko: "프런트" },
  };

  return labels[key][language];
}

function buildAiGuideOptions(
  language: GuestLanguage,
  knowledge: HearingSheetKnowledge | null | undefined,
  prompts: string[],
) {
  const options: AiGuideOption[] = [];

  if (knowledge?.wifi.length) {
    options.push({ key: "wifi", label: getAiGuideLabel(language, "wifi"), prompt: "Wi-Fiについて教えてください。" });
  }

  if (knowledge?.breakfast.length) {
    options.push({ key: "breakfast", label: getAiGuideLabel(language, "breakfast"), prompt: "朝食について教えてください。" });
  }

  if (knowledge?.baths.length) {
    options.push({
      key: "bath",
      label: getAiGuideLabel(language, "bath"),
      prompt: `${knowledge.baths[0]?.name ?? "大浴場"}について教えてください。`,
    });
  }

  if ((knowledge?.facilities.length ?? 0) > 0 || (knowledge?.facilityLocations.length ?? 0) > 0) {
    options.push({ key: "facility", label: getAiGuideLabel(language, "facility"), prompt: "館内施設について教えてください。" });
  }

  if (knowledge?.amenities.length) {
    options.push({ key: "amenity", label: getAiGuideLabel(language, "amenity"), prompt: "アメニティについて教えてください。" });
  }

  if (knowledge?.parking.length) {
    options.push({ key: "parking", label: getAiGuideLabel(language, "parking"), prompt: "駐車場について教えてください。" });
  }

  if (knowledge?.checkout.length) {
    options.push({ key: "checkout", label: getAiGuideLabel(language, "checkout"), prompt: "チェックアウトについて教えてください。" });
  }

  if (knowledge?.emergency.length) {
    options.push({ key: "emergency", label: getAiGuideLabel(language, "emergency"), prompt: "緊急時の案内を教えてください。" });
  }

  if (knowledge?.roomService.length) {
    options.push({ key: "roomService", label: getAiGuideLabel(language, "roomService"), prompt: "ルームサービスについて教えてください。" });
  }

  if (knowledge?.transport.length) {
    options.push({ key: "transport", label: getAiGuideLabel(language, "transport"), prompt: "交通案内を教えてください。" });
  }

  if (knowledge?.nearbySpots.length) {
    options.push({ key: "nearby", label: getAiGuideLabel(language, "nearby"), prompt: "周辺案内を教えてください。" });
  }

  if (knowledge?.frontDeskHours.length) {
    options.push({ key: "frontDesk", label: getAiGuideLabel(language, "frontDesk"), prompt: "フロントの対応時間を教えてください。" });
  }

  const existingPrompts = new Set(options.map((option) => option.prompt));

  return [
    ...options,
    ...prompts
      .filter((prompt) => !existingPrompts.has(prompt))
      .map((prompt) => ({
        key: `prompt:${prompt}`,
        label: prompt,
        prompt,
      })),
  ];
}

function GuestChatInput({
  roomId,
  language,
  mode,
  richMenu,
  onOptimisticSend,
}: GuestChatComposerProps) {
  const router = useRouter();
  const ui = getGuestUiCopy(language);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRichMenuOpen, setIsRichMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function postGuestMessage(body: string, nextMode: "ai" | "human") {
    return fetch(`/api/guest/rooms/${roomId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body,
        mode: nextMode,
      }),
    });
  }

  async function postAiStarterMessage(body: string) {
    const response = await fetch(`/api/guest/rooms/${roomId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body,
        mode: "ai",
        kind: "ai_starter",
      }),
    });

    const payload = response.ok
      ? await response.json() as { threadId?: string }
      : null;

    return {
      ok: response.ok,
      threadId: payload?.threadId ?? null,
    };
  }

  async function postHumanHandoff(category?: string) {
    return fetch(`/api/guest/rooms/${roomId}/handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(category ? { category } : {}),
    });
  }

  async function switchLanguage(languageCode: string) {
    return fetch(`/api/guest/rooms/${roomId}/language`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        language: languageCode,
      }),
    });
  }

  async function submitMessage(body: string) {
    const trimmed = body.trim();

    if (!trimmed) {
      return;
    }

    onOptimisticSend(createOptimisticMessage("optimistic", "guest", trimmed));
    setError(null);
    setMessage("");

    const response = await postGuestMessage(trimmed, mode);

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

    const actionSpec = GUEST_RICH_MENU_ACTION_SPECS[action.actionType];

    const requiredField = GUEST_RICH_MENU_ACTION_REQUIREMENTS[action.actionType];

    if (requiredField && !hasRequiredRichMenuField(action)) {
      console.warn("[guest/rich-menu] missing action config", {
        roomId,
        actionId: action.id,
        actionType: action.actionType,
        requiredField,
      });
      setError(ui.menuUnavailableError);
      return;
    }

    if (actionSpec.opensExternalUrl && action.actionType === "external_link" && action.url) {
      window.open(action.url, "_blank", "noopener,noreferrer");
      return;
    }

    if (action.actionType === "ai_prompt" && action.prompt) {
      onOptimisticSend(createOptimisticMessage("rich-prompt", "ai", action.prompt));

      const response = await postAiStarterMessage(action.prompt);

      if (!response.ok) {
        setError(ui.messageSendError);
        return;
      }

      startTransition(() => {
        if (mode !== "ai") {
          router.push(
            `/guest/${roomId}/chat?mode=ai${response.threadId ? `&thread=${encodeURIComponent(response.threadId)}` : ""}`,
          );
        } else {
          router.push(
            `/guest/${roomId}/chat?mode=ai${response.threadId ? `&thread=${encodeURIComponent(response.threadId)}` : ""}`,
          );
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

      const response = await postHumanHandoff(action.handoffCategory);

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
      const response = await postHumanHandoff();

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
      if (action.languageCode) {
        const languageCode = action.languageCode;
        const response = await switchLanguage(languageCode);

        if (!response.ok) {
          setError(ui.menuUnavailableError);
          return;
        }

        startTransition(() => {
          router.push(`/guest/${roomId}/chat?lang=${encodeURIComponent(languageCode)}`);
        });
        return;
      }

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

function GuestActionPanel({
  roomId,
  roomLabel,
  language,
  knowledge,
  prompts,
  showIntro = false,
  onOptimisticSend,
}: GuestActionPanelProps) {
  const router = useRouter();
  const ui = getGuestUiCopy(language);
  const actionCopy = getGuestActionCopy(language);
  const aiGuideOptions = buildAiGuideOptions(language, knowledge, prompts);
  const [isRequestOptionsOpen, setIsRequestOptionsOpen] = useState(false);
  const [isAiOptionsOpen, setIsAiOptionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submitAiPrompt(body: string) {
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
            {showIntro && roomLabel ? `${roomLabel}様\n` : ""}
            {showIntro ? ui.introMessage : actionCopy.helperBody}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setIsRequestOptionsOpen((current) => !current);
                setIsAiOptionsOpen(false);
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
                setIsAiOptionsOpen((current) => !current);
                setIsRequestOptionsOpen(false);
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
          {isAiOptionsOpen ? (
            <div className="mt-2 rounded-[18px] border border-[#ebe1dc] bg-[#fffaf7] px-3 py-3">
              <div className="mb-2 text-[12px] font-light leading-5 text-[#7a554a]">
                {aiGuideOptions.length > 0 ? actionCopy.aiPrompt : actionCopy.aiEmpty}
              </div>
              {aiGuideOptions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {aiGuideOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        void submitAiPrompt(option.prompt);
                        setIsAiOptionsOpen(false);
                      }}
                      className="rounded-full border border-[#e7ddd8] bg-white px-3 py-1.5 text-[12px] font-light text-[#7a554a] disabled:opacity-60"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
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

export function GuestChatExperience({
  debugInfo,
  roomId,
  hotelName,
  roomLabel,
  richMenu,
  language,
  mode,
  knowledge,
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleMessages]);

  return (
    <>
      <section className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f6efe8_0%,#efe5dc_100%)] px-3 py-4 lg:px-8 lg:py-6">
        {debugInfo ? (
          <div className="mb-4 rounded-[18px] border border-[#d9cdc7] bg-[#fffaf7] px-4 py-3 text-[12px] leading-5 text-[#6a544b]">
            <div className="font-medium text-[#8b4c43]">Debug</div>
            <div>access source: {debugInfo.accessSource}</div>
            <div>token hotelId: {debugInfo.accessHotelId ?? "(null)"}</div>
            <div>resolved hotelId: {debugInfo.resolvedHotelId ?? "(null)"}</div>
            <div>room: {debugInfo.roomId} / {debugInfo.roomLabel}</div>
            <div>stayId: {debugInfo.stayId ?? "(null)"}</div>
            <div>language: {debugInfo.selectedLanguage ?? "(null)"}</div>
            <div className="mt-1 break-words">
              knowledge: {Object.entries(debugInfo.knowledgeCounts).map(([key, value]) => (
                `${key}=${value}`
              )).join(", ")}
            </div>
          </div>
        ) : null}
        {!hasGuestMessage && mode === "ai" ? (
          <GuestActionPanel
            roomId={roomId}
            roomLabel={roomLabel}
            language={language}
            knowledge={knowledge}
            prompts={prompts}
            showIntro
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
                    <div className="rounded-full border border-[#eadfd8] bg-[#f7f1ec] px-3 py-1 text-[11px] font-light tracking-[0.02em] text-[#8c7a71]">
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
                          {senderLabel(message.sender, hotelName)}
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
          {mode === "ai" && hasGuestMessage ? (
            <GuestActionPanel
              roomId={roomId}
              language={language}
              knowledge={knowledge}
              prompts={prompts}
              onOptimisticSend={(message) => {
                setOptimisticMessages((current) => [...current, message]);
              }}
            />
          ) : null}
          <div ref={bottomRef} />
        </div>
      </section>

      <GuestChatInput
        roomId={roomId}
        language={language}
        mode={mode}
        richMenu={richMenu}
        onOptimisticSend={(message) => {
          setOptimisticMessages((current) => [...current, message]);
        }}
      />
    </>
  );
}
