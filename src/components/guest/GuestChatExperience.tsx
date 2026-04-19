"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  GUEST_RICH_MENU_ACTION_SPECS,
  GUEST_RICH_MENU_ACTION_REQUIREMENTS,
  isGuestRichMenuActionType,
} from "@/lib/guest-contract";
import {
  getGuestUiCopy,
  hasGuestAiGuideContent,
  type HearingSheetKnowledge,
  type GuestLanguage,
  type GuestMessage,
  isGuestLanguage,
} from "@/lib/guest-demo";
import { updateGuestLanguage } from "@/lib/guest-language-client";
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
    handoffStatus?: "none" | "requested" | "accepted" | null;
    unreadCountGuest?: number | null;
    unreadCountFront?: number | null;
    knowledgeCounts: Record<string, number>;
  } | null;
  roomId: string;
  hotelName?: string | null;
  richMenu: GuestRichMenu | null;
  language: GuestLanguage;
  knowledge?: HearingSheetKnowledge | null;
  prompts: string[];
  localizedGuideLabels?: Record<string, string>;
  initialMessages: GuestMessage[];
  initialMode: "ai" | "human";
  initialThreadId: string | null;
  initialThreadMeta: {
    handoffStatus: "none" | "requested" | "accepted" | null;
    unreadCountGuest: number | null;
    unreadCountFront: number | null;
  };
  clearThreadQueryOnMount?: boolean;
  languageUpdateNotice?: {
    active: boolean;
    updatedMessages: number;
  };
};

type DisplayMessage = GuestMessage & {
  optimistic?: boolean;
};

type InteractionState =
  | "message"
  | "rich-menu"
  | "ai-guide"
  | "handoff"
  | "quick-reply"
  | "language"
  | null;

type GuestChatComposerProps = {
  roomId: string;
  language: GuestLanguage;
  richMenu: GuestRichMenu | null;
  interactionState: InteractionState;
  onModeChange: (mode: "ai" | "human") => void;
  onThreadResolved: (threadId: string | null, mode: "ai" | "human") => void;
  onMessagesReplace: (messageId: string, messages: DisplayMessage[]) => void;
  onMessagesAppend: (messages: DisplayMessage[]) => void;
  onOptimisticRemove: (messageId: string) => void;
  onOptimisticSend: (message: DisplayMessage) => void;
  onInteractionStateChange: (state: InteractionState) => void;
};

type GuestQaSheetProps = {
  roomId: string;
  language: GuestLanguage;
  knowledge?: HearingSheetKnowledge | null;
  prompts: string[];
  localizedGuideLabels?: Record<string, string>;
  open: boolean;
  interactionState: InteractionState;
  onClose: () => void;
  onThreadResolved: (threadId: string | null, mode: "ai" | "human") => void;
  onMessagesAppend: (messages: DisplayMessage[]) => void;
  onInteractionStateChange: (state: InteractionState) => void;
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
    case "ai_message":
      return Boolean(action.messageText || action.messageImageUrl);
    case "language":
    case "human_handoff":
      return true;
    default:
      return false;
  }
}

function isTaxiCategoryLabel(value?: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();

  return (
    normalized.includes("タクシ") ||
    normalized.includes("taxi") ||
    normalized.includes("計程車") ||
    normalized.includes("出租车") ||
    normalized.includes("택시")
  );
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

function formatMessageBody(body: string) {
  return body
    .replace(/ご利用日\s*時/g, "ご利用日時")
    .replace(/([^\n])\s*・/g, "$1\n・")
    .replace(/を記載して\s*ください/g, "を記載してください");
}

type GuideCard = {
  title: string;
  subtitle?: string;
  fields: Array<{ label: string; value: string }>;
  notes?: string[];
};

type GuideDetail = {
  title: string;
  fields: Array<{ label: string; value: string }>;
  notes: string[];
};

const GUIDE_CARD_FIELD_LABELS = new Set([
  "電話",
  "対応時間",
  "料金",
  "営業時間",
  "利用時間",
  "場所",
  "方法",
  "依頼方法",
  "注文方法",
  "時間",
  "台数",
  "予約",
  "SSID",
  "PASS",
  "連絡先",
  "手順",
  "鍵の返却",
  "レイトチェックアウト",
  "距離",
]);

function parseGuideCards(body: string): GuideCard[] | null {
  const normalizedBody = formatMessageBody(body);
  const lines = normalizedBody
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0 || (!normalizedBody.includes("\n") && !normalizedBody.includes(" / "))) {
    return null;
  }

  const segments = lines.flatMap((line) =>
    line
      .split(/\s\/\s/)
      .map((segment) => segment.trim())
      .filter(Boolean),
  );

  const cards: GuideCard[] = [];
  let current: GuideCard | null = null;
  let structuredSegmentCount = 0;

  for (const segment of segments) {
    const separatorIndex = segment.indexOf(":");

    if (separatorIndex < 0) {
      if (!current) {
        current = {
          title: segment,
          fields: [],
          notes: [],
        };
        continue;
      }

      if (!current.title) {
        current.title = segment;
        continue;
      }

      if (current.fields.length > 0) {
        cards.push(current);
        current = {
          title: segment,
          fields: [],
          notes: [],
        };
        structuredSegmentCount += 1;
        continue;
      }

      current.notes = [...(current.notes ?? []), segment];
      structuredSegmentCount += 1;
      continue;
    }

    const label = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();
    const isStructuredField = GUIDE_CARD_FIELD_LABELS.has(label) || label.length <= 10;

    if (!isStructuredField) {
      if (!current) {
        current = {
          title: segment,
          fields: [],
          notes: [],
        };
      } else {
        current.notes = [...(current.notes ?? []), segment];
      }
      continue;
    }

    if (!current) {
      current = {
        title: "",
        fields: [],
        notes: [],
      };
    }

    current.fields.push({ label, value });
    structuredSegmentCount += 1;
  }

  if (current) {
    cards.push(current);
  }

  const validCards = cards.filter((card) => card.title && (card.fields.length > 0 || (card.notes?.length ?? 0) > 0));

  return structuredSegmentCount >= 2 && validCards.length > 0 ? validCards : null;
}

function normalizeGuideLookupKey(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[：:]/g, "")
    .trim()
    .toLowerCase();
}

function buildGuideDetail(
  card: GuideCard,
  knowledge?: HearingSheetKnowledge | null,
): GuideDetail | null {
  if (!knowledge) {
    return null;
  }

  const titleKey = normalizeGuideLookupKey(card.title);

  const facilityLocation = knowledge.facilityLocations.find((entry) =>
    normalizeGuideLookupKey(entry.name ?? "") === titleKey,
  );

  if (facilityLocation) {
    return {
      title: facilityLocation.name ?? card.title,
      fields: [
        ...(facilityLocation.floor ? [{ label: "場所", value: facilityLocation.floor }] : []),
      ],
      notes: facilityLocation.notes?.length ? facilityLocation.notes : facilityLocation.note ? [facilityLocation.note] : [],
    };
  }

  const facility = knowledge.facilities.find((entry) =>
    normalizeGuideLookupKey(entry.name ?? "") === titleKey,
  );

  if (facility) {
    return {
      title: facility.name ?? card.title,
      fields: [
        ...(facility.hours ? [{ label: "営業時間", value: facility.hours }] : []),
      ],
      notes: facility.notes?.length ? facility.notes : facility.note ? [facility.note] : [],
    };
  }

  const bath = knowledge.baths.find((entry) =>
    normalizeGuideLookupKey(entry.name ?? "") === titleKey,
  );

  if (bath) {
    return {
      title: bath.name ?? card.title,
      fields: [
        ...(bath.location ? [{ label: "場所", value: bath.location }] : []),
        ...(bath.hours ? [{ label: "営業時間", value: bath.hours }] : []),
      ],
      notes: bath.notes?.length ? bath.notes : bath.note ? [bath.note] : [],
    };
  }

  const amenity = knowledge.amenities.find((entry) =>
    normalizeGuideLookupKey(entry.name ?? "") === titleKey,
  );

  if (amenity) {
    return {
      title: amenity.name ?? card.title,
      fields: [
        ...(amenity.inRoom !== null
          ? [{ label: "客室内", value: amenity.inRoom ? "あり" : "なし" }]
          : []),
        ...(amenity.availableOnRequest !== null
          ? [{ label: "追加対応", value: amenity.availableOnRequest ? "可能" : "不可" }]
          : []),
        ...(amenity.requestMethod ? [{ label: "依頼方法", value: amenity.requestMethod }] : []),
        ...(amenity.price ? [{ label: "料金", value: amenity.price }] : []),
      ],
      notes: amenity.notes?.length ? amenity.notes : amenity.note ? [amenity.note] : [],
    };
  }

  const parking = knowledge.parking.find((entry) =>
    normalizeGuideLookupKey(entry.name ?? "") === titleKey,
  );

  if (parking) {
    return {
      title: parking.name ?? card.title,
      fields: [
        ...(parking.location ? [{ label: "場所", value: parking.location }] : []),
        ...(parking.capacity ? [{ label: "台数", value: parking.capacity }] : []),
        ...(parking.price ? [{ label: "料金", value: parking.price }] : []),
        ...(parking.hours ? [{ label: "利用時間", value: parking.hours }] : []),
        ...(parking.reservationRequired !== null
          ? [{ label: "予約", value: parking.reservationRequired ? "必要" : "不要" }]
          : []),
      ],
      notes: parking.notes?.length ? parking.notes : parking.note ? [parking.note] : [],
    };
  }

  const roomService = knowledge.roomService.find((entry) =>
    normalizeGuideLookupKey(entry.menuName ?? "") === titleKey,
  );

  if (roomService) {
    return {
      title: roomService.menuName ?? card.title,
      fields: [
        ...(roomService.price ? [{ label: "料金", value: roomService.price }] : []),
        ...(roomService.orderMethod ? [{ label: "注文方法", value: roomService.orderMethod }] : []),
        ...(roomService.hours ? [{ label: "対応時間", value: roomService.hours }] : []),
      ],
      notes: roomService.notes?.length ? roomService.notes : roomService.note ? [roomService.note] : [],
    };
  }

  const transport = knowledge.transport.find((entry) =>
    normalizeGuideLookupKey(entry.companyName ?? "") === titleKey,
  );

  if (transport) {
    return {
      title: transport.companyName ?? card.title,
      fields: [
        ...(transport.serviceType ? [{ label: "種別", value: transport.serviceType }] : []),
        ...(transport.phone ? [{ label: "電話", value: transport.phone }] : []),
        ...(transport.hours ? [{ label: "対応時間", value: transport.hours }] : []),
        ...(transport.priceNote ? [{ label: "料金", value: transport.priceNote }] : []),
      ],
      notes: transport.notes?.length ? transport.notes : transport.note ? [transport.note] : [],
    };
  }

  const nearby = knowledge.nearbySpots.find((entry) =>
    normalizeGuideLookupKey(entry.name ?? "") === titleKey,
  );

  if (nearby) {
    return {
      title: nearby.name ?? card.title,
      fields: [
        ...(nearby.category ? [{ label: "カテゴリ", value: nearby.category }] : []),
        ...(nearby.distance ? [{ label: "距離", value: nearby.distance }] : []),
        ...(nearby.hours ? [{ label: "営業時間", value: nearby.hours }] : []),
        ...(nearby.location ? [{ label: "場所", value: nearby.location }] : []),
      ],
      notes: nearby.notes?.length ? nearby.notes : nearby.note ? [nearby.note] : [],
    };
  }

  if (titleKey.includes("チェックアウト") && knowledge.checkout[0]) {
    const checkout = knowledge.checkout[0];

    return {
      title: "チェックアウト",
      fields: [
        ...(checkout.time ? [{ label: "時間", value: checkout.time }] : []),
        ...(checkout.method ? [{ label: "方法", value: checkout.method }] : []),
        ...(checkout.keyReturnLocation ? [{ label: "鍵の返却", value: checkout.keyReturnLocation }] : []),
        ...(checkout.lateCheckoutPolicy ? [{ label: "レイトチェックアウト", value: checkout.lateCheckoutPolicy }] : []),
      ],
      notes: checkout.notes?.length ? checkout.notes : checkout.note ? [checkout.note] : [],
    };
  }

  return null;
}

function renderMessageBody(
  message: DisplayMessage,
  knowledge?: HearingSheetKnowledge | null,
  onGuideDetailOpen?: (detail: GuideDetail) => void,
) {
  const guideCards = message.body ? parseGuideCards(message.body) : null;

  return (
    <div className="space-y-3">
      {message.imageUrl ? (
        <img
          src={message.imageUrl}
          alt={message.imageAlt ?? ""}
          className="w-full rounded-[18px] object-cover"
        />
      ) : null}
      {message.body ? (
        guideCards ? (
          <div className="space-y-3">
            {guideCards.map((card, index) => (
              <button
                key={`${card.title}-${index}`}
                type="button"
                onClick={() => {
                  const detail = buildGuideDetail(card, knowledge);

                  if (detail && onGuideDetailOpen) {
                    onGuideDetailOpen(detail);
                  }
                }}
                className={`w-full rounded-[18px] border border-[#eadfd8] bg-[#fcf8f4] p-3 text-left ${
                  buildGuideDetail(card, knowledge) ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <div className="flex items-start justify-between gap-3 border-b border-[#efe4dd] pb-2">
                  <div>
                    <div className="text-[14px] font-medium text-[#33231e]">{card.title}</div>
                    {card.subtitle ? (
                      <div className="mt-0.5 text-[12px] text-[#8b776e]">{card.subtitle}</div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {card.fields.map((field) => (
                    <div
                      key={`${card.title}-${field.label}`}
                      className="grid grid-cols-[72px_1fr] gap-3 text-[13px] leading-5"
                    >
                      <div className="text-[#8b776e]">{field.label}</div>
                      <div className="text-[#33231e]">{field.value}</div>
                    </div>
                  ))}
                  {card.notes?.map((note) => (
                    <div key={`${card.title}-${note}`} className="text-[13px] leading-5 text-[#5f463d]">
                      {note}
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="whitespace-pre-line">{formatMessageBody(message.body)}</div>
        )
      ) : null}
    </div>
  );
}

function GuideDetailSheet({
  detail,
  onClose,
}: {
  detail: GuideDetail | null;
  onClose: () => void;
}) {
  if (!detail) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(35,24,18,0.26)]">
      <div
        className="absolute inset-0"
        role="button"
        aria-label="Close detail"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            onClose();
          }
        }}
      />
      <div className="relative w-full max-w-md rounded-t-[28px] border border-[#eadfd8] bg-[#fffaf7] px-4 pb-6 pt-4 shadow-[0_-18px_48px_rgba(72,47,35,0.18)] lg:max-w-none lg:px-8">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#e2d4cc]" />
        <div className="flex items-start justify-between gap-4">
          <div className="text-[18px] font-medium text-[#251815]">{detail.title}</div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e4d8d1] bg-white text-[#7a6056]"
          >
            ×
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {detail.fields.map((field) => (
            <div
              key={`${detail.title}-${field.label}`}
              className="grid grid-cols-[88px_1fr] gap-3 rounded-[16px] border border-[#eadfd8] bg-white px-4 py-3 text-[14px] leading-6"
            >
              <div className="text-[#8b776e]">{field.label}</div>
              <div className="text-[#33231e]">{field.value}</div>
            </div>
          ))}
          {detail.notes.map((note) => (
            <div
              key={`${detail.title}-${note}`}
              className="rounded-[16px] border border-[#eadfd8] bg-white px-4 py-3 text-[14px] leading-6 text-[#5f463d] whitespace-pre-line"
            >
              {note}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getTranslationFallbackLabel(language: GuestLanguage) {
  if (language === "en") {
    return "Translation pending. Showing the original message.";
  }

  if (language === "zh-CN") {
    return "翻译处理中，当前显示原文。";
  }

  if (language === "zh-TW") {
    return "翻譯處理中，目前顯示原文。";
  }

  if (language === "ko") {
    return "번역을 준비 중입니다. 현재는 원문을 표시합니다.";
  }

  return "翻訳確認中のため、現在は原文を表示しています。";
}

function getLanguageUpdateNotice(
  language: GuestLanguage,
  updatedMessages: number,
) {
  if (language === "en") {
    return updatedMessages > 0
      ? `Language updated. Refreshed ${updatedMessages} message(s).`
      : "Language updated.";
  }

  if (language === "zh-CN") {
    return updatedMessages > 0
      ? `语言已更新，已刷新 ${updatedMessages} 条消息。`
      : "语言已更新。";
  }

  if (language === "zh-TW") {
    return updatedMessages > 0
      ? `語言已更新，已刷新 ${updatedMessages} 則訊息。`
      : "語言已更新。";
  }

  if (language === "ko") {
    return updatedMessages > 0
      ? `언어를 변경했고 메시지 ${updatedMessages}건을 새로 반영했습니다.`
      : "언어를 변경했습니다.";
  }

  return updatedMessages > 0
    ? `言語を更新しました。${updatedMessages}件のメッセージを再反映しました。`
    : "言語を更新しました。";
}

function getHandoffStatusNotice(
  language: GuestLanguage,
  handoffStatus: "none" | "requested" | "accepted" | null,
) {
  if (handoffStatus === "accepted") {
    if (language === "en") {
      return "The front desk has joined this conversation.";
    }

    if (language === "zh-CN") {
      return "前台已加入此对话。";
    }

    if (language === "zh-TW") {
      return "櫃台已加入此對話。";
    }

    if (language === "ko") {
      return "프런트가 이 대화에 참여했습니다.";
    }

    return "フロントがこの会話に参加しました。";
  }

  if (language === "en") {
    return "The front desk has been notified. Replies will appear on this screen. Please keep this page open and wait here.";
  }

  if (language === "zh-CN") {
    return "已通知前台。回复将显示在此画面上。请不要关闭此页面，并在此等候。";
  }

  if (language === "zh-TW") {
    return "已通知櫃台。回覆會顯示在此畫面上。請不要關閉此頁面，並在此等候。";
  }

  if (language === "ko") {
    return "프런트에 알렸습니다. 답변은 이 화면에 표시됩니다. 화면을 닫지 말고 이 상태로 기다려 주세요.";
  }

  return "フロントに通知しました。返信はこの画面に表示されます。画面を閉じず、このままお待ちください。";
}

function getBusyNotice(language: GuestLanguage, interactionState: InteractionState) {
  if (!interactionState) {
    return null;
  }

  if (language === "en") {
    switch (interactionState) {
      case "message":
      case "quick-reply":
        return "Sending your message. Please wait a moment before tapping anything else.";
      case "rich-menu":
        return "Processing your selection. Please wait before tapping another menu.";
      case "ai-guide":
        return "Loading the guide reply. Please wait a moment.";
      case "handoff":
        return "Contacting the front desk. Please wait on this screen.";
      case "language":
        return "Updating the language. Please wait a moment.";
      default:
        return "Processing your request. Please wait a moment.";
    }
  }

  if (language === "zh-CN") {
    switch (interactionState) {
      case "message":
      case "quick-reply":
        return "正在发送消息。请稍候，不要重复点击其他按钮。";
      case "rich-menu":
        return "正在处理所选菜单。请稍候。";
      case "ai-guide":
        return "正在获取指南内容，请稍候。";
      case "handoff":
        return "正在通知前台。请停留在此画面稍候。";
      case "language":
        return "正在切换语言，请稍候。";
      default:
        return "正在处理中，请稍候。";
    }
  }

  if (language === "zh-TW") {
    switch (interactionState) {
      case "message":
      case "quick-reply":
        return "正在傳送訊息。請稍候，不要重複點擊其他按鈕。";
      case "rich-menu":
        return "正在處理所選選單，請稍候。";
      case "ai-guide":
        return "正在取得指南內容，請稍候。";
      case "handoff":
        return "正在通知櫃台。請停留在此畫面稍候。";
      case "language":
        return "正在切換語言，請稍候。";
      default:
        return "正在處理中，請稍候。";
    }
  }

  if (language === "ko") {
    switch (interactionState) {
      case "message":
      case "quick-reply":
        return "메시지를 보내는 중입니다. 다른 버튼은 잠시만 기다려 주세요.";
      case "rich-menu":
        return "선택한 메뉴를 처리하는 중입니다. 잠시만 기다려 주세요.";
      case "ai-guide":
        return "안내 답변을 불러오는 중입니다. 잠시만 기다려 주세요.";
      case "handoff":
        return "프런트에 전달하는 중입니다. 이 화면에서 잠시만 기다려 주세요.";
      case "language":
        return "언어를 변경하는 중입니다. 잠시만 기다려 주세요.";
      default:
        return "처리 중입니다. 잠시만 기다려 주세요.";
    }
  }

  switch (interactionState) {
    case "message":
    case "quick-reply":
      return "メッセージを送信しています。ほかのボタンは少し待ってください。";
    case "rich-menu":
      return "選択したメニューを処理しています。少しお待ちください。";
    case "ai-guide":
      return "案内を確認しています。少しお待ちください。";
    case "handoff":
      return "フロントへ連絡しています。このまま少しお待ちください。";
    case "language":
      return "言語を切り替えています。少しお待ちください。";
    default:
      return "処理中です。少しお待ちください。";
  }
}

function getBusyLabel(language: GuestLanguage, interactionState: InteractionState) {
  if (!interactionState) {
    return null;
  }

  if (language === "en") {
    return interactionState === "message" || interactionState === "quick-reply"
      ? "Sending..."
      : "Processing...";
  }

  if (language === "zh-CN") {
    return interactionState === "message" || interactionState === "quick-reply"
      ? "发送中..."
      : "处理中...";
  }

  if (language === "zh-TW") {
    return interactionState === "message" || interactionState === "quick-reply"
      ? "傳送中..."
      : "處理中...";
  }

  if (language === "ko") {
    return interactionState === "message" || interactionState === "quick-reply"
      ? "전송 중..."
      : "처리 중...";
  }

  return interactionState === "message" || interactionState === "quick-reply"
    ? "送信中..."
    : "処理中...";
}

function InlineSpinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

function areMessagesEquivalent(left: DisplayMessage[], right: DisplayMessage[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((message, index) => {
    const candidate = right[index];

    return (
      message.id === candidate?.id &&
      message.sender === candidate.sender &&
      message.body === candidate.body &&
      message.timestamp === candidate.timestamp &&
      message.readAt === candidate.readAt &&
      message.imageUrl === candidate.imageUrl &&
      message.imageAlt === candidate.imageAlt &&
      message.translationState === candidate.translationState &&
      message.handoffConfirmation === candidate.handoffConfirmation
    );
  });
}

function mergeDisplayMessages(left: DisplayMessage[], right: DisplayMessage[]) {
  const merged = [...left];
  const seenIds = new Set(left.map((message) => message.id));

  for (const message of right) {
    if (seenIds.has(message.id)) {
      continue;
    }

    merged.push(message);
    seenIds.add(message.id);
  }

  return merged.sort((first, second) => {
    const firstTime = first.timestamp ? Date.parse(first.timestamp) : 0;
    const secondTime = second.timestamp ? Date.parse(second.timestamp) : 0;

    return firstTime - secondTime;
  });
}

function findActiveHandoffConfirmationMessageId(messages: DisplayMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (!message.handoffConfirmation) {
      continue;
    }

    const hasLaterGuestReply = messages
      .slice(index + 1)
      .some((entry) => entry.sender === "guest");

    if (!hasLaterGuestReply) {
      return message.id;
    }
  }

  return null;
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
            : language === "zh-CN"
              ? "前"
              : language === "zh-TW"
                ? "櫃"
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

function createOptimisticRichMessage(
  prefix: string,
  sender: GuestMessage["sender"],
  body: string,
  imageUrl?: string,
  imageAlt?: string,
): DisplayMessage {
  optimisticMessageSequence += 1;

  return {
    id: `${prefix}-${optimisticMessageSequence}`,
    sender,
    body,
    imageUrl: imageUrl ?? null,
    imageAlt: imageAlt ?? null,
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

function normalizeGuideText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim();
}

function getLanguageSettingsLabel(language: GuestLanguage) {
  if (language === "en") {
    return "Language";
  }

  if (language === "zh-CN") {
    return "语言";
  }

  if (language === "zh-TW") {
    return "語言";
  }

  if (language === "ko") {
    return "언어";
  }

  return "言語";
}

function getQaLabel(language: GuestLanguage) {
  if (language === "en") {
    return "Q&A";
  }

  if (language === "zh-CN") {
    return "问答";
  }

  if (language === "zh-TW") {
    return "問答";
  }

  if (language === "ko") {
    return "Q&A";
  }

  return "Q&A";
}

function getQaHelperText(language: GuestLanguage) {
  if (language === "en") {
    return "For hotel information only";
  }

  if (language === "zh-CN") {
    return "仅限酒店信息";
  }

  if (language === "zh-TW") {
    return "僅限飯店資訊";
  }

  if (language === "ko") {
    return "호텔 안내 전용";
  }

  return "館内案内のみ";
}

function getEmergencyLabel(language: GuestLanguage) {
  if (language === "en") {
    return "Emergency";
  }
  if (language === "zh-CN") {
    return "紧急";
  }
  if (language === "zh-TW") {
    return "緊急";
  }
  if (language === "ko") {
    return "긴급";
  }
  return "緊急";
}

function getEmergencyModalCopy(language: GuestLanguage) {
  if (language === "en") {
    return {
      title: "Emergency contact",
      body: "Describe what happened. This message will be sent directly to the front desk with translation for staff.",
      placeholder: "Example: I feel very sick and cannot stand up. Please come to room 203.",
      sendLabel: "Send urgently",
      sendingLabel: "Sending...",
      closeLabel: "Close emergency dialog",
      categoryLabel: "Type",
      error: "Emergency message could not be sent. Please try again.",
      categories: [
        { value: "emergency_medical", label: "Medical" },
        { value: "emergency_fire", label: "Fire / Accident" },
        { value: "emergency_safety", label: "Safety" },
        { value: "emergency_other", label: "Other" },
      ],
    };
  }
  if (language === "zh-CN") {
    return {
      title: "紧急联系",
      body: "请写下发生了什么。消息会直接发送给前台，并附带给工作人员的翻译。",
      placeholder: "例如：我身体很不舒服，站不起来。请到203房间来。",
      sendLabel: "紧急发送",
      sendingLabel: "发送中...",
      closeLabel: "关闭紧急对话框",
      categoryLabel: "类型",
      error: "无法发送紧急消息，请重试。",
      categories: [
        { value: "emergency_medical", label: "身体不适" },
        { value: "emergency_fire", label: "火灾 / 事故" },
        { value: "emergency_safety", label: "安全问题" },
        { value: "emergency_other", label: "其他" },
      ],
    };
  }
  if (language === "zh-TW") {
    return {
      title: "緊急聯絡",
      body: "請寫下發生了什麼。訊息會直接傳送到前台，並附上給工作人員的翻譯。",
      placeholder: "例如：我身體很不舒服，站不起來。請到203房間來。",
      sendLabel: "緊急送出",
      sendingLabel: "傳送中...",
      closeLabel: "關閉緊急對話框",
      categoryLabel: "類型",
      error: "無法送出緊急訊息，請再試一次。",
      categories: [
        { value: "emergency_medical", label: "身體不適" },
        { value: "emergency_fire", label: "火災 / 事故" },
        { value: "emergency_safety", label: "安全問題" },
        { value: "emergency_other", label: "其他" },
      ],
    };
  }
  if (language === "ko") {
    return {
      title: "긴급 연락",
      body: "무슨 일이 있었는지 적어 주세요. 이 내용은 직원이 읽을 수 있도록 번역과 함께 프런트에 바로 전달됩니다.",
      placeholder: "예: 몸이 너무 아프고 일어설 수 없습니다. 203호로 와 주세요.",
      sendLabel: "긴급 전송",
      sendingLabel: "전송 중...",
      closeLabel: "긴급 창 닫기",
      categoryLabel: "유형",
      error: "긴급 메시지를 보내지 못했습니다. 다시 시도해 주세요.",
      categories: [
        { value: "emergency_medical", label: "건강 이상" },
        { value: "emergency_fire", label: "화재 / 사고" },
        { value: "emergency_safety", label: "안전 문제" },
        { value: "emergency_other", label: "기타" },
      ],
    };
  }
  return {
    title: "緊急連絡",
    body: "何が起きたかを書いて送信してください。スタッフ向け翻訳付きで、そのままフロントへ届きます。",
    placeholder: "例: 気分が悪くて立てません。203号室に来てください。",
    sendLabel: "緊急送信",
    sendingLabel: "送信中...",
    closeLabel: "緊急モーダルを閉じる",
    categoryLabel: "内容",
    error: "緊急メッセージを送信できませんでした。再度お試しください。",
    categories: [
      { value: "emergency_medical", label: "体調不良" },
      { value: "emergency_fire", label: "火災・事故" },
      { value: "emergency_safety", label: "安全トラブル" },
      { value: "emergency_other", label: "その他" },
    ],
  };
}

function localizeSupplementalValue(language: GuestLanguage, value: string) {
  if (language === "ja") {
    return value;
  }

  return value
    .replace(
      /レストラン/g,
      language === "en"
        ? "Restaurant"
        : language === "ko"
          ? "레스토랑"
          : language === "zh-TW"
            ? "餐廳"
            : "餐厅",
    )
    .replace(
      /別館/g,
      language === "en"
        ? "Annex "
        : language === "ko"
          ? "별관 "
          : language === "zh-TW"
            ? "別館"
            : "别馆",
    )
    .replace(
      /本館/g,
      language === "en"
        ? "Main building "
        : language === "ko"
          ? "본관 "
          : language === "zh-TW"
            ? "本館"
            : "本馆",
    );
}

function localizeSupplementalPrompt(language: GuestLanguage, prompt: string) {
  if (language === "ja") {
    return prompt;
  }

  const normalized = normalizeGuideText(prompt);

  const sentenceTranslations: Array<{
    match: (value: string) => boolean;
    values: Record<Exclude<GuestLanguage, "ja">, string>;
  }> = [
    {
      match: (value) =>
        value.includes("チェックイン前に荷物を預けられますか") ||
        (value.includes("荷物") && value.includes("預")),
      values: {
        en: "Can I leave my luggage before check-in?",
        ko: "체크인 전에 짐을 맡길 수 있나요?",
        "zh-CN": "入住前可以寄存行李吗？",
        "zh-TW": "入住前可以寄放行李嗎？",
      },
    },
    {
      match: (value) => value.includes("ランドリー") || value.includes("コインランドリー"),
      values: {
        en: "Is there a laundry room?",
        ko: "세탁실이 있나요?",
        "zh-CN": "有洗衣房吗？",
        "zh-TW": "有洗衣房嗎？",
      },
    },
    {
      match: (value) => value.includes("加湿器"),
      values: {
        en: "Can I borrow a humidifier?",
        ko: "가습기를 빌릴 수 있나요?",
        "zh-CN": "可以借加湿器吗？",
        "zh-TW": "可以借加濕器嗎？",
      },
    },
    {
      match: (value) => value.includes("門限"),
      values: {
        en: "Is there a curfew?",
        ko: "통금 시간이 있나요?",
        "zh-CN": "有门禁时间吗？",
        "zh-TW": "有門禁時間嗎？",
      },
    },
    {
      match: (value) => value.includes("近くにコンビニ"),
      values: {
        en: "Is there a convenience store nearby?",
        ko: "근처에 편의점이 있나요?",
        "zh-CN": "附近有便利店吗？",
        "zh-TW": "附近有便利商店嗎？",
      },
    },
    {
      match: (value) => value.includes("キャンセル") && value.includes("いつまで"),
      values: {
        en: "Until when can I cancel?",
        ko: "취소는 언제까지 가능한가요?",
        "zh-CN": "最晚可以在什么时候取消？",
        "zh-TW": "最晚可以在什麼時候取消？",
      },
    },
  ];

  const matchedSentence = sentenceTranslations.find((entry) => entry.match(normalized));

  if (matchedSentence) {
    return matchedSentence.values[language];
  }

  const separatorIndex = prompt.indexOf(":");

  if (separatorIndex < 0) {
    return prompt;
  }

  const prefix = prompt.slice(0, separatorIndex).trim();
  const suffix = localizeSupplementalValue(language, prompt.slice(separatorIndex + 1).trim());

  const translatedPrefix =
    prefix === "朝食"
      ? language === "en"
        ? "Breakfast"
        : language === "zh-CN"
          ? "早餐"
          : language === "zh-TW"
            ? "早餐"
            : "조식"
      : prefix === "大浴場"
        ? language === "en"
          ? "Bath"
          : language === "zh-CN"
            ? "浴场"
            : language === "zh-TW"
              ? "浴場"
              : "대욕장"
        : prefix === "チェックアウト"
          ? language === "en"
            ? "Checkout"
            : language === "zh-CN"
              ? "退房"
              : language === "zh-TW"
                ? "退房"
                : "체크아웃"
          : prefix === "駐車場"
            ? language === "en"
              ? "Parking"
              : language === "zh-CN"
                ? "停车场"
                : language === "zh-TW"
                  ? "停車場"
                  : "주차장"
            : prefix === "周辺"
              ? language === "en"
                ? "Nearby"
                : language === "zh-CN"
                  ? "周边"
                  : language === "zh-TW"
                    ? "周邊"
                    : "주변"
              : prefix;

  return `${translatedPrefix}: ${suffix}`;
}

function inferGuidePromptKey(prompt: string): AiGuideOption["key"] | null {
  const normalized = normalizeGuideText(prompt);

  if (!normalized) {
    return null;
  }

  if (
    normalized.includes("wifi") ||
    normalized.includes("wi-fi") ||
    normalized.includes("無線lan") ||
    normalized.includes("ワイファイ")
  ) {
    return "wifi";
  }

  if (normalized.includes("朝食") || normalized.includes("breakfast")) {
    return "breakfast";
  }

  if (
    normalized.includes("大浴場") ||
    normalized.includes("浴場") ||
    normalized.includes("温泉") ||
    normalized.includes("bath")
  ) {
    return "bath";
  }

  if (normalized.includes("館内施設") || normalized.includes("facility")) {
    return "facility";
  }

  if (normalized.includes("アメニティ") || normalized.includes("amenity")) {
    return "amenity";
  }

  if (normalized.includes("駐車場") || normalized.includes("parking")) {
    return "parking";
  }

  if (
    normalized.includes("チェックアウト") ||
    normalized.includes("check-out") ||
    normalized.includes("checkout")
  ) {
    return "checkout";
  }

  if (normalized.includes("緊急") || normalized.includes("emergency")) {
    return "emergency";
  }

  if (normalized.includes("ルームサービス") || normalized.includes("roomservice")) {
    return "roomService";
  }

  if (normalized.includes("交通") || normalized.includes("transport")) {
    return "transport";
  }

  if (
    normalized.includes("周辺") ||
    normalized.includes("nearby") ||
    normalized.includes("コンビニ")
  ) {
    return "nearby";
  }

  if (
    normalized.includes("フロント") ||
    normalized.includes("frontdesk") ||
    normalized.includes("荷物") ||
    normalized.includes("預")
  ) {
    return "frontDesk";
  }

  return null;
}

function getLocalizedGuidePrompt(
  language: GuestLanguage,
  key: AiGuideOption["key"],
  bathName?: string,
) : string {
  if (language === "en") {
    const prompts: Record<AiGuideOption["key"], string> = {
      wifi: "Can you tell me about the Wi-Fi?",
      breakfast: "Can you tell me about breakfast?",
      bath: bathName ? `Can you tell me about ${bathName}?` : "Can you tell me about the bath?",
      facility: "Can you tell me about the hotel facilities?",
      amenity: "Can you tell me about the amenities?",
      parking: "Can you tell me about parking?",
      checkout: "Can you tell me about checkout?",
      emergency: "Can you tell me about emergency information?",
      roomService: "Can you tell me about room service?",
      transport: "Can you tell me about transportation?",
      nearby: "Can you tell me about nearby spots?",
      frontDesk: "Can you tell me the front desk hours?",
    };

    return prompts[key];
  }

  if (language === "zh-CN") {
    const prompts: Record<AiGuideOption["key"], string> = {
      wifi: "请告诉我 Wi-Fi 信息。",
      breakfast: "请告诉我早餐信息。",
      bath: bathName ? `请告诉我关于${bathName}的信息。` : "请告诉我浴场信息。",
      facility: "请告诉我馆内设施信息。",
      amenity: "请告诉我备品信息。",
      parking: "请告诉我停车场信息。",
      checkout: "请告诉我退房信息。",
      emergency: "请告诉我紧急情况说明。",
      roomService: "请告诉我客房服务信息。",
      transport: "请告诉我交通信息。",
      nearby: "请告诉我周边信息。",
      frontDesk: "请告诉我前台服务时间。",
    };

    return prompts[key];
  }

  if (language === "zh-TW") {
    const prompts: Record<AiGuideOption["key"], string> = {
      wifi: "請告訴我 Wi-Fi 資訊。",
      breakfast: "請告訴我早餐資訊。",
      bath: bathName ? `請告訴我關於${bathName}的資訊。` : "請告訴我浴場資訊。",
      facility: "請告訴我館內設施資訊。",
      amenity: "請告訴我備品資訊。",
      parking: "請告訴我停車場資訊。",
      checkout: "請告訴我退房資訊。",
      emergency: "請告訴我緊急情況說明。",
      roomService: "請告訴我客房服務資訊。",
      transport: "請告訴我交通資訊。",
      nearby: "請告訴我周邊資訊。",
      frontDesk: "請告訴我前台服務時間。",
    };

    return prompts[key];
  }

  if (language === "ko") {
    const prompts: Record<AiGuideOption["key"], string> = {
      wifi: "Wi-Fi 정보를 알려 주세요.",
      breakfast: "조식 정보를 알려 주세요.",
      bath: bathName ? `${bathName} 정보를 알려 주세요.` : "대욕장 정보를 알려 주세요.",
      facility: "시설 정보를 알려 주세요.",
      amenity: "어메니티 정보를 알려 주세요.",
      parking: "주차장 정보를 알려 주세요.",
      checkout: "체크아웃 정보를 알려 주세요.",
      emergency: "긴급 상황 안내를 알려 주세요.",
      roomService: "룸서비스 정보를 알려 주세요.",
      transport: "교통 안내를 알려 주세요.",
      nearby: "주변 안내를 알려 주세요.",
      frontDesk: "프런트 운영 시간을 알려 주세요.",
    };

    return prompts[key];
  }

  const prompts: Record<AiGuideOption["key"], string> = {
    wifi: "Wi-Fiについて教えてください。",
    breakfast: "朝食について教えてください。",
    bath: bathName ? `${bathName}について教えてください。` : "大浴場について教えてください。",
    facility: "館内施設について教えてください。",
    amenity: "アメニティについて教えてください。",
    parking: "駐車場について教えてください。",
    checkout: "チェックアウトについて教えてください。",
    emergency: "緊急時の案内を教えてください。",
    roomService: "ルームサービスについて教えてください。",
    transport: "交通案内を教えてください。",
    nearby: "周辺案内を教えてください。",
    frontDesk: "フロントの対応時間を教えてください。",
  };

  return prompts[key];
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
    checkout: { ja: "チェックアウト", en: "Checkout", "zh-CN": "退房", "zh-TW": "退房資訊", ko: "체크아웃" },
    emergency: { ja: "緊急時", en: "Emergency", "zh-CN": "紧急情况", "zh-TW": "緊急情況", ko: "긴급" },
    roomService: { ja: "ルームサービス", en: "Room service", "zh-CN": "客房服务", "zh-TW": "客房服務", ko: "룸서비스" },
    transport: { ja: "交通案内", en: "Transport", "zh-CN": "交通", "zh-TW": "交通資訊", ko: "교통" },
    nearby: { ja: "周辺案内", en: "Nearby spots", "zh-CN": "周边信息", "zh-TW": "周邊資訊", ko: "주변 안내" },
    frontDesk: { ja: "フロント対応", en: "Front desk", "zh-CN": "前台", "zh-TW": "櫃台", ko: "프런트" },
  };

  return labels[key][language];
}

function buildAiGuideOptions(
  language: GuestLanguage,
  knowledge: HearingSheetKnowledge | null | undefined,
  prompts: string[],
  localizedGuideLabels?: Record<string, string>,
) {
  const options: AiGuideOption[] = [];
  const coveredPromptPrefixes = new Set<string>();
  const seenLabels = new Set<string>();

  const pushOption = (option: AiGuideOption) => {
    if (seenLabels.has(option.label)) {
      return;
    }

    options.push(option);
    seenLabels.add(option.label);
  };

  if (knowledge?.wifi.length) {
    pushOption({
      key: "wifi",
      label: getAiGuideLabel(language, "wifi"),
      prompt: getLocalizedGuidePrompt("ja", "wifi"),
    });
    coveredPromptPrefixes.add("wi-fi");
    coveredPromptPrefixes.add("wifi");
  }

  if (knowledge?.breakfast.length) {
    pushOption({
      key: "breakfast",
      label: getAiGuideLabel(language, "breakfast"),
      prompt: getLocalizedGuidePrompt("ja", "breakfast"),
    });
    coveredPromptPrefixes.add("朝食");
  }

  if (knowledge?.baths.length) {
    const bathName = knowledge.baths[0]?.name ?? "大浴場";
    pushOption({
      key: "bath",
      label: getAiGuideLabel(language, "bath"),
      prompt: getLocalizedGuidePrompt("ja", "bath", bathName),
    });
    coveredPromptPrefixes.add("大浴場");
    coveredPromptPrefixes.add(normalizeGuideText(bathName));
  }

  if ((knowledge?.facilities.length ?? 0) > 0 || (knowledge?.facilityLocations.length ?? 0) > 0) {
    pushOption({
      key: "facility",
      label: getAiGuideLabel(language, "facility"),
      prompt: getLocalizedGuidePrompt("ja", "facility"),
    });
    coveredPromptPrefixes.add("館内施設");
  }

  if (knowledge?.amenities.length) {
    pushOption({
      key: "amenity",
      label: getAiGuideLabel(language, "amenity"),
      prompt: getLocalizedGuidePrompt("ja", "amenity"),
    });
    coveredPromptPrefixes.add("アメニティ");
  }

  if (knowledge?.parking.length) {
    pushOption({
      key: "parking",
      label: getAiGuideLabel(language, "parking"),
      prompt: getLocalizedGuidePrompt("ja", "parking"),
    });
    coveredPromptPrefixes.add("駐車場");
  }

  if (knowledge?.checkout.length) {
    pushOption({
      key: "checkout",
      label: getAiGuideLabel(language, "checkout"),
      prompt: getLocalizedGuidePrompt("ja", "checkout"),
    });
    coveredPromptPrefixes.add("チェックアウト");
  }

  if (knowledge?.emergency.length) {
    pushOption({
      key: "emergency",
      label: getAiGuideLabel(language, "emergency"),
      prompt: getLocalizedGuidePrompt("ja", "emergency"),
    });
  }

  if (knowledge?.roomService.length) {
    pushOption({
      key: "roomService",
      label: getAiGuideLabel(language, "roomService"),
      prompt: getLocalizedGuidePrompt("ja", "roomService"),
    });
  }

  if (knowledge?.transport.length) {
    pushOption({
      key: "transport",
      label: getAiGuideLabel(language, "transport"),
      prompt: getLocalizedGuidePrompt("ja", "transport"),
    });
    coveredPromptPrefixes.add("交通");
    coveredPromptPrefixes.add("交通案内");
  }

  if (knowledge?.nearbySpots.length) {
    pushOption({
      key: "nearby",
      label: getAiGuideLabel(language, "nearby"),
      prompt: getLocalizedGuidePrompt("ja", "nearby"),
    });
    coveredPromptPrefixes.add("周辺");
    coveredPromptPrefixes.add("周辺案内");
  }

  if (knowledge?.frontDeskHours.length) {
    pushOption({
      key: "frontDesk",
      label: getAiGuideLabel(language, "frontDesk"),
      prompt: getLocalizedGuidePrompt("ja", "frontDesk"),
    });
    coveredPromptPrefixes.add("フロント");
    coveredPromptPrefixes.add("フロント対応");
  }

  if (knowledge?.faq.length) {
    for (const question of knowledge.faq
      .map((entry) => entry.question?.trim() ?? "")
      .filter((value) => value.length > 0)) {
      const inferredKey = inferGuidePromptKey(question);

      if (inferredKey && options.some((option) => option.key === inferredKey)) {
        continue;
      }

      pushOption({
        key: `faq:${question}`,
        label: inferredKey
          ? getLocalizedGuidePrompt(language, inferredKey)
          : localizedGuideLabels?.[question] ?? localizeSupplementalPrompt(language, question),
        prompt: question,
      });
    }
  }

  const existingPrompts = new Set(options.map((option) => option.prompt));

  return [
    ...options,
    ...prompts
      .filter((prompt) => {
        if (existingPrompts.has(prompt)) {
          return false;
        }

        const normalizedPrompt = normalizeGuideText(prompt);

        return ![...coveredPromptPrefixes].some((prefix) => {
          const normalizedPrefix = normalizeGuideText(prefix);
          return normalizedPrefix.length > 0 && normalizedPrompt.startsWith(normalizedPrefix);
        });
      })
      .map((prompt) => ({
        key: `prompt:${prompt}`,
        label: localizedGuideLabels?.[prompt] ?? localizeSupplementalPrompt(language, prompt),
        prompt,
      }))
      .filter((option) => !seenLabels.has(option.label)),
  ];
}

function GuestChatInput({
  roomId,
  language,
  richMenu,
  interactionState,
  onModeChange,
  onThreadResolved,
  onMessagesReplace,
  onMessagesAppend,
  onOptimisticRemove,
  onOptimisticSend,
  onInteractionStateChange,
}: GuestChatComposerProps) {
  const router = useRouter();
  const ui = getGuestUiCopy(language);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRichMenuOpen, setIsRichMenuOpen] = useState(false);
  const submitLockRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const viewportBaseHeightRef = useRef(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = interactionState !== null || isPending || isSubmitting;
  const busyNotice = getBusyNotice(language, interactionState);
  const busyLabel = getBusyLabel(language, interactionState);
  const isIosSafari =
    typeof window !== "undefined" &&
    /iP(hone|ad|od)/.test(window.navigator.userAgent) &&
    /Safari/.test(window.navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS/.test(window.navigator.userAgent);
  const safariAccessoryInset = isIosSafari && isComposerFocused && keyboardInset > 0 ? 52 : 0;

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const handleFocus = () => {
      setIsComposerFocused(true);
      window.setTimeout(() => {
        textarea.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      }, 120);
    };

    const handleBlur = () => {
      setIsComposerFocused(false);
    };

    textarea.addEventListener("focus", handleFocus);
    textarea.addEventListener("blur", handleBlur);

    return () => {
      textarea.removeEventListener("focus", handleFocus);
      textarea.removeEventListener("blur", handleBlur);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;
    viewportBaseHeightRef.current = Math.max(window.innerHeight, viewport.height);

    const updateKeyboardInset = () => {
      const baseHeight = viewportBaseHeightRef.current || Math.max(window.innerHeight, viewport.height);
      const viewportLoss = baseHeight - viewport.height - viewport.offsetTop;
      const nextInset = Math.max(
        0,
        viewportLoss,
      );

      if (!isComposerFocused && nextInset === 0) {
        viewportBaseHeightRef.current = Math.max(window.innerHeight, viewport.height);
      }

      setKeyboardInset(nextInset);
    };

    updateKeyboardInset();

    viewport.addEventListener("resize", updateKeyboardInset);
    viewport.addEventListener("scroll", updateKeyboardInset);
    window.addEventListener("orientationchange", updateKeyboardInset);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset);
      viewport.removeEventListener("scroll", updateKeyboardInset);
      window.removeEventListener("orientationchange", updateKeyboardInset);
    };
  }, [isComposerFocused]);

  async function postGuestMessage(body: string, nextMode: "ai" | "human") {
    const response = await fetch(`/api/guest/rooms/${roomId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body,
        mode: nextMode,
      }),
    });

    const payload = response.ok
      ? await response.json() as {
          threadId?: string;
          mode?: "ai" | "human";
          messages?: GuestMessage[];
        }
      : null;

    return {
      ok: response.ok,
      threadId: payload?.threadId ?? null,
      mode: payload?.mode ?? nextMode,
      messages: (payload?.messages ?? []) as GuestMessage[],
    };
  }

  async function postAiDisplayMessage(
    body?: string,
    imageUrl?: string,
    imageAlt?: string,
    category?: string,
    protectedTerms?: string[],
    translations?: GuestRichMenuItem["translations"],
  ) {
    const response = await fetch(`/api/guest/rooms/${roomId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body,
        imageUrl,
        imageAlt,
        category,
        mode: "ai",
        kind: "ai_message",
        protectedTerms,
        translations,
      }),
    });

    const payload = response.ok
      ? await response.json() as { threadId?: string; messages?: GuestMessage[] }
      : null;

    return {
      ok: response.ok,
      threadId: payload?.threadId ?? null,
      messages: (payload?.messages ?? []) as GuestMessage[],
    };
  }

  async function postHumanHandoff(options?: {
    category?: string;
    prompt?: string;
    translations?: GuestRichMenuItem["translations"];
  }) {
    const response = await fetch(`/api/guest/rooms/${roomId}/handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category: options?.category,
        prompt: options?.prompt,
        translations: options?.translations,
      }),
    });

    const payload = response.ok
      ? await response.json() as { threadId?: string; mode?: "ai" | "human"; messages?: GuestMessage[] }
      : null;

    return {
      ok: response.ok,
      threadId: payload?.threadId ?? null,
      mode: payload?.mode ?? "human",
      messages: (payload?.messages ?? []) as GuestMessage[],
    };
  }

  async function switchLanguage(languageCode: string) {
    if (!isGuestLanguage(languageCode)) {
      return {
        ok: false,
        guestLanguage: language,
        threadId: null,
        updatedMessages: 0,
      };
    }

    return updateGuestLanguage(roomId, languageCode);
  }

  async function submitMessage(body: string) {
    const trimmed = body.trim();

    if (!trimmed || submitLockRef.current || interactionState) {
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    onInteractionStateChange("message");

    const optimisticMessage = createOptimisticMessage("optimistic", "guest", trimmed);
    onOptimisticSend(optimisticMessage);
    setError(null);
    setMessage("");

    try {
      const response = await postGuestMessage(trimmed, "human");

      if (!response.ok) {
        onOptimisticRemove(optimisticMessage.id);
        setError(ui.messageSendError);
        return;
      }

      onModeChange("human");
      onThreadResolved(response.threadId, response.mode);
      onMessagesReplace(
        optimisticMessage.id,
        response.messages.map((message) => ({ ...message, optimistic: false })),
      );
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
      onInteractionStateChange(null);
    }
  }

  async function submitRichMenuAction(action: GuestRichMenuItem) {
    if (submitLockRef.current || interactionState) {
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      const mergedProtectedTerms = [
        ...(richMenu?.translationProtectedTerms ?? []),
        ...(action.protectedTerms ?? []),
      ];

      if (!isGuestRichMenuActionType(action.actionType)) {
        console.warn("[guest/rich-menu] unsupported action", {
          roomId,
          actionId: action.id,
          actionType: action.actionType,
        });
        setError(ui.messageSendError);
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
        onInteractionStateChange("handoff");
        const response = await postHumanHandoff({
          category: action.label,
          prompt: action.prompt,
          translations: action.translations,
        });

        if (!response.ok) {
          setError(ui.messageSendError);
          return;
        }

        onModeChange("human");
        onThreadResolved(response.threadId, response.mode);
        onMessagesAppend(response.messages.map((message) => ({ ...message, optimistic: false })));
        return;
      }

      if (action.actionType === "ai_message" && (action.messageText || action.messageImageUrl)) {
        onInteractionStateChange("rich-menu");
        const optimisticMessage =
          language === "ja"
            ? createOptimisticRichMessage(
                "rich-ai-message",
                "ai",
                action.messageText ?? "",
                action.messageImageUrl,
                action.messageImageAlt,
              )
            : null;

        if (optimisticMessage) {
          onOptimisticSend(optimisticMessage);
        }

        const response = await postAiDisplayMessage(
          action.messageText,
          action.messageImageUrl,
          action.messageImageAlt,
          action.label,
          mergedProtectedTerms,
          action.translations,
        );

        if (!response.ok) {
          if (optimisticMessage) {
            onOptimisticRemove(optimisticMessage.id);
          }
          setError(ui.messageSendError);
          return;
        }

        onThreadResolved(response.threadId, "ai");
        if (optimisticMessage) {
          onMessagesReplace(
            optimisticMessage.id,
            response.messages.map((message) => ({ ...message, optimistic: false })),
          );
        } else {
          onMessagesAppend(response.messages.map((message) => ({ ...message, optimistic: false })));
        }
        return;
      }

      if (
        action.actionType === "handoff_category" &&
        action.handoffCategory
      ) {
        onInteractionStateChange("handoff");
        const shouldEchoGuestMessage = !isTaxiCategoryLabel(action.handoffCategory);
        const optimisticMessage = shouldEchoGuestMessage
          ? createOptimisticMessage(
              "handoff-category",
              "guest",
              action.handoffCategory,
            )
          : null;

        if (optimisticMessage) {
          onOptimisticSend(optimisticMessage);
        }

        const response = await postHumanHandoff({ category: action.handoffCategory });

        if (!response.ok) {
          if (optimisticMessage) {
            onOptimisticRemove(optimisticMessage.id);
          }
          setError(ui.handoffError);
          return;
        }

        onModeChange(response.mode);
        onThreadResolved(response.threadId, response.mode);
        if (optimisticMessage) {
          onMessagesReplace(
            optimisticMessage.id,
            response.messages.map((message) => ({ ...message, optimistic: false })),
          );
        } else {
          onMessagesAppend(response.messages.map((message) => ({ ...message, optimistic: false })));
        }
        return;
      }

      if (action.actionType === "human_handoff") {
        onInteractionStateChange("handoff");
        const response = await postHumanHandoff();

        if (!response.ok) {
          setError(ui.handoffError);
          return;
        }

        onModeChange(response.mode);
        onThreadResolved(response.threadId, response.mode);
        onMessagesAppend(response.messages.map((message) => ({ ...message, optimistic: false })));
        return;
      }

        if (action.actionType === "language") {
          if (action.languageCode) {
            onInteractionStateChange("language");
            const languageCode = action.languageCode;
            const response = await switchLanguage(languageCode);

            if (!response.ok) {
              setError(ui.menuUnavailableError);
              return;
            }

            startTransition(() => {
              const searchParams = new URLSearchParams();

              searchParams.set("lang", response.guestLanguage);
              searchParams.set("languageUpdated", "1");
              searchParams.set("updatedMessages", String(response.updatedMessages));
              router.push(`/guest/${roomId}/chat?${searchParams.toString()}`);
            });
            return;
          }

        onInteractionStateChange("language");
        startTransition(() => {
          router.push(`/guest/${roomId}/language`);
        });
      }
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
      onInteractionStateChange(null);
    }
  }

  return (
    <section className="z-20 min-h-0 bg-transparent px-0 pb-0">
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
                    disabled={isBusy}
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
                {interactionState === "rich-menu" || interactionState === "handoff" || interactionState === "language" ? (
                  <div className="pointer-events-none absolute inset-x-3 top-3 rounded-full bg-[rgba(37,24,21,0.72)] px-3 py-2 text-center text-[11px] font-light text-white backdrop-blur-sm">
                    <span className="inline-flex items-center gap-2">
                      <InlineSpinner />
                      {busyNotice}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className="border-t border-[#e7ddd8] bg-white"
        style={{
          paddingBottom:
            `calc(max(env(safe-area-inset-bottom), 0px) + ${keyboardInset + safariAccessoryInset}px)`,
        }}
      >
        <div className="flex items-end gap-2 px-3 pb-2 pt-2 lg:px-8">
        <button
          type="button"
          aria-expanded={isRichMenuOpen}
          aria-label="Open quick menu"
          disabled={!richMenu || isBusy}
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

        <div className="min-w-0 flex-1">
          <label htmlFor="guest-message" className="sr-only">
            メッセージ
          </label>
          <div className="flex items-end gap-2 p-2">
            <div className="flex min-h-[40px] flex-1 items-end border border-[#e7ddd8] bg-white">
              <textarea
                ref={textareaRef}
                id="guest-message"
                rows={1}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={ui.messagePlaceholder}
                enterKeyHint="send"
                autoCapitalize="sentences"
                autoCorrect="on"
                disabled={isBusy}
                className="h-10 flex-1 resize-none bg-white px-3 py-2 text-base leading-6 text-[#5f463d] outline-none lg:text-sm lg:leading-5"
              />
            </div>
            <button
              type="button"
              disabled={!message.trim() || isBusy}
              onClick={() => submitMessage(message)}
              className="flex h-10 min-w-[88px] items-center justify-center gap-2 border border-[#981d15] bg-[#ad2218] px-4 text-sm font-light text-white disabled:opacity-60 lg:h-10 lg:min-w-[88px] lg:px-4 lg:text-[12px]"
            >
              {interactionState ? (
                <>
                  <InlineSpinner />
                  <span>{busyLabel ?? ui.sendingLabel}</span>
                </>
              ) : (
                ui.sendLabel
              )}
            </button>
          </div>
          {busyNotice ? (
            <div className="mt-1 flex items-center gap-2 px-2 text-[11px] text-[#8b776e]">
              <InlineSpinner />
              <span>{busyNotice}</span>
            </div>
          ) : null}
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

function GuestQaSheet({
  roomId,
  language,
  knowledge,
  prompts,
  localizedGuideLabels,
  open,
  interactionState,
  onClose,
  onThreadResolved,
  onMessagesAppend,
  onInteractionStateChange,
}: GuestQaSheetProps) {
  const ui = getGuestUiCopy(language);
  const actionCopy = getGuestActionCopy(language);
  const aiGuideOptions = buildAiGuideOptions(language, knowledge, prompts, localizedGuideLabels);
  const [error, setError] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingOptionKey, setPendingOptionKey] = useState<string | null>(null);
  const isBusy = isSubmitting || interactionState !== null;

  async function submitAiPrompt(body: string) {
    if (submitLockRef.current || interactionState) {
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setError(null);
    onInteractionStateChange("ai-guide");

    try {
      const rawResponse = await fetch(`/api/guest/rooms/${roomId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body,
          kind: "ai_starter",
        }),
      });

      if (!rawResponse.ok) {
        setError(ui.aiStarterError);
        return;
      }

      const response = await rawResponse.json() as {
        threadId?: string | null;
        mode?: "ai" | "human";
        messages?: GuestMessage[];
      };
      onThreadResolved(response.threadId ?? null, response.mode ?? "ai");
      onMessagesAppend(
        (response.messages ?? []).map((message) => ({ ...message, optimistic: false })),
      );
      onClose();
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
      setPendingOptionKey(null);
      onInteractionStateChange(null);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(35,24,18,0.26)]">
      <div
        className="absolute inset-0"
        role="button"
        aria-label="Close Q&A"
        tabIndex={0}
        onClick={() => {
          if (!interactionState) {
            onClose();
          }
        }}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !interactionState) {
            onClose();
          }
        }}
      />
      <div className="relative w-full max-w-md rounded-t-[28px] border border-[#eadfd8] bg-[#fffaf7] px-4 pb-6 pt-4 shadow-[0_-18px_48px_rgba(72,47,35,0.18)] lg:max-w-none lg:px-8">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#e2d4cc]" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[16px] font-light text-[#251815]">{getQaLabel(language)}</div>
            <div className="mt-1 text-[12px] leading-5 text-[#7a6056]">
              {aiGuideOptions.length > 0 ? actionCopy.aiPrompt : actionCopy.aiEmpty}
            </div>
          </div>
          <button
            type="button"
            disabled={interactionState !== null}
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e4d8d1] bg-white text-[#7a6056] disabled:opacity-50"
          >
            ×
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {aiGuideOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={isBusy}
              onClick={() => {
                setPendingOptionKey(option.key);
                void submitAiPrompt(option.prompt);
              }}
              className="rounded-full border border-[#e7ddd8] bg-white px-3.5 py-2 text-[12px] font-light text-[#7a554a] disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                {pendingOptionKey === option.key ? <InlineSpinner /> : null}
                <span>{option.label}</span>
              </span>
            </button>
          ))}
        </div>
        {interactionState ? (
          <div className="mt-4 rounded-[16px] border border-[#eadfd8] bg-white px-4 py-3 text-[12px] leading-5 text-[#7a6056]">
            <span className="inline-flex items-center gap-2">
              <InlineSpinner />
              {getBusyNotice(language, interactionState)}
            </span>
          </div>
        ) : null}
        {!aiGuideOptions.length ? (
          <div className="mt-4 rounded-[18px] border border-[#ebe1dc] bg-white px-4 py-3 text-[12px] leading-5 text-[#7a6056]">
            {getQaHelperText(language)}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-[16px] border border-[#f2d3cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#ad2218]">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HumanStarter({
  language,
  directContactOnly = false,
}: {
  language: GuestLanguage;
  directContactOnly?: boolean;
}) {
  const ui = getGuestUiCopy(language);

  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[12px] font-light text-[#6f564b] shadow-[0_8px_20px_rgba(72,47,35,0.06)]">
        {senderAvatar("front", language).label}
      </div>
      <div className="max-w-[82%] rounded-[24px] rounded-bl-md bg-white px-4 py-3 text-sm leading-6 text-[#33231e] shadow-[0_10px_24px_rgba(72,47,35,0.05)] lg:max-w-[48%] xl:max-w-[42%]">
        {directContactOnly ? ui.directContactMessage : ui.humanStarterMessage}
      </div>
    </div>
  );
}

export function GuestChatExperience({
  debugInfo,
  roomId,
  hotelName,
  richMenu,
  language,
  knowledge,
  prompts,
  localizedGuideLabels,
  initialMessages,
  initialMode,
  initialThreadId,
  initialThreadMeta,
  clearThreadQueryOnMount = false,
  languageUpdateNotice,
}: GuestChatExperienceProps) {
  const ui = getGuestUiCopy(language);
  const router = useRouter();
  const hasAiGuideContent = hasGuestAiGuideContent(knowledge, prompts);
  const [activeMode, setActiveMode] = useState<"ai" | "human">(initialMode);
  const [chatMessages, setChatMessages] = useState<DisplayMessage[]>(initialMessages);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(initialThreadId);
  const [threadMeta, setThreadMeta] = useState(initialThreadMeta);
  const [isQuickReplySubmitting, setIsQuickReplySubmitting] = useState(false);
  const [isQaOpen, setIsQaOpen] = useState(false);
  const [selectedGuideDetail, setSelectedGuideDetail] = useState<GuideDetail | null>(null);
  const [interactionState, setInteractionState] = useState<InteractionState>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const activeModeRef = useRef<"ai" | "human">(initialMode);
  const currentThreadIdRef = useRef<string | null>(initialThreadId);

  const removeOptimisticMessage = (messageId: string) => {
    setChatMessages((current) => current.filter((message) => message.id !== messageId));
  };
  const messages = chatMessages;
  const hasGuestMessage = messages.some((message) => message.sender === "guest");
  const hasNonSystemHistory = messages.some(
    (message) => message.sender === "guest" || message.sender === "ai" || message.sender === "front",
  );
  const activeHandoffConfirmationMessageId = useMemo(
    () => findActiveHandoffConfirmationMessageId(messages),
    [messages],
  );
  const visibleMessages = useMemo(() => {
    if (!hasGuestMessage && activeMode === "ai") {
      return messages.filter(
        (message) =>
          !(
            message.sender === "ai" &&
            message.id === "ai-1"
          ),
      );
    }

    return messages;
  }, [activeMode, hasGuestMessage, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleMessages]);

  useEffect(() => {
    setActiveMode(initialMode);
    setCurrentThreadId(initialThreadId);
    setThreadMeta(initialThreadMeta);
  }, [initialMode, initialThreadId, initialThreadMeta, roomId]);

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  useEffect(() => {
    currentThreadIdRef.current = currentThreadId;
  }, [currentThreadId]);

  useEffect(() => {
    if (!clearThreadQueryOnMount) {
      return;
    }

    router.replace(`/guest/${roomId}/chat?mode=${activeMode}`, { scroll: false });
  }, [activeMode, clearThreadQueryOnMount, roomId, router]);

  const refreshMessages = useEffectEvent(async () => {
    try {
      const requestedMode = activeModeRef.current;
      const requestedThreadId = currentThreadIdRef.current;
      const searchParams = new URLSearchParams({ mode: requestedMode });

      if (requestedThreadId) {
        searchParams.set("thread", requestedThreadId);
      }

      const response = await fetch(`/api/guest/rooms/${roomId}/messages?${searchParams.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json() as {
        mode?: "ai" | "human";
        threadId?: string | null;
        messages?: GuestMessage[];
        meta?: {
          handoffStatus?: "none" | "requested" | "accepted" | null;
          unreadCountGuest?: number | null;
          unreadCountFront?: number | null;
        };
      };
      const fetchedMessages = (payload.messages ?? []).map((message) => ({
        ...message,
        optimistic: false,
      }));

      if (
        activeModeRef.current !== requestedMode ||
        currentThreadIdRef.current !== requestedThreadId
      ) {
        return;
      }

      setActiveMode(payload.mode ?? requestedMode);
      setCurrentThreadId(payload.threadId ?? null);
      setThreadMeta({
        handoffStatus: payload.meta?.handoffStatus ?? null,
        unreadCountGuest:
          typeof payload.meta?.unreadCountGuest === "number" ? payload.meta.unreadCountGuest : null,
        unreadCountFront:
          typeof payload.meta?.unreadCountFront === "number" ? payload.meta.unreadCountFront : null,
      });

      setChatMessages((current) => {
        const optimisticMessages = current.filter((message) => message.optimistic);
        const persistedMessages = current.filter((message) => !message.optimistic);
        const mergedMessages = mergeDisplayMessages(persistedMessages, fetchedMessages);

        if (areMessagesEquivalent(persistedMessages, mergedMessages)) {
          return current;
        }

        return mergeDisplayMessages(mergedMessages, optimisticMessages);
      });
    } catch {
      return;
    }
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshMessages();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshMessages();
      }
    };

    const handleFocus = () => {
      void refreshMessages();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const markThreadReadByGuest = useEffectEvent(async () => {
    if (!currentThreadId || !threadMeta.unreadCountGuest || threadMeta.unreadCountGuest <= 0) {
      return;
    }

    try {
      const response = await fetch(`/api/guest/rooms/${roomId}/read`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId: currentThreadId,
        }),
      });

      if (!response.ok) {
        return;
      }

      setThreadMeta((current) => ({
        ...current,
        unreadCountGuest: 0,
      }));
    } catch {
      return;
    }
  });

  useEffect(() => {
    if (document.visibilityState !== "visible") {
      return;
    }

    void markThreadReadByGuest();
  }, [currentThreadId, threadMeta.unreadCountGuest]);

  const appendMessages = (newMessages: DisplayMessage[]) => {
    if (newMessages.length === 0) {
      return;
    }

    setChatMessages((current) => mergeDisplayMessages(current, newMessages));
  };

  const replaceOptimisticMessage = (messageId: string, newMessages: DisplayMessage[]) => {
    setChatMessages((current) =>
      mergeDisplayMessages(
        current.filter((message) => message.id !== messageId),
        newMessages,
      ),
    );
  };

  const submitConfirmationReply = async (body: string) => {
    if (isQuickReplySubmitting || interactionState) {
      return;
    }

    const trimmed = body.trim();

    if (!trimmed) {
      return;
    }

    const optimisticMessage = createOptimisticMessage("quick-reply", "guest", trimmed);
    setIsQuickReplySubmitting(true);
    setInteractionState("quick-reply");
    setChatMessages((current) => [...current, optimisticMessage]);

    try {
      const response = await fetch(`/api/guest/rooms/${roomId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: trimmed,
          mode: "ai",
        }),
      });

      const payload = response.ok
        ? await response.json() as {
            threadId?: string | null;
            mode?: "ai" | "human";
            messages?: GuestMessage[];
          }
        : null;

      if (!response.ok) {
        removeOptimisticMessage(optimisticMessage.id);
        return;
      }

      setCurrentThreadId(payload?.threadId ?? currentThreadId);
      setActiveMode(payload?.mode ?? activeMode);
      setThreadMeta((current) => ({
        ...current,
        handoffStatus: payload?.mode === "human" ? "requested" : current.handoffStatus,
      }));
      replaceOptimisticMessage(
        optimisticMessage.id,
        (payload?.messages ?? []).map((message) => ({ ...message, optimistic: false })),
      );
    } finally {
      setIsQuickReplySubmitting(false);
      setInteractionState(null);
    }
  };

  const handoffStatus = threadMeta.handoffStatus ?? null;
  const unreadGuestReplies = threadMeta.unreadCountGuest ?? 0;
  const showHandoffBanner = handoffStatus === "requested" || handoffStatus === "accepted";

  return (
    <div className="grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
      <header className="z-20 border-b border-[#eadfd9] bg-[#fbf7f3] text-[#171a22]">
        <div className="px-4 py-3 lg:px-8">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-light tracking-[0.03em] text-[#6f564b] lg:text-[14px]">
                {hotelName}
              </div>
            </div>
            <button
              type="button"
              disabled={interactionState !== null}
              onClick={() => {
                setIsQaOpen(true);
              }}
              className="inline-flex min-w-[72px] shrink-0 items-center justify-center rounded-full border border-[#e4d8d1] bg-white px-3 py-1.5 text-[11px] font-light text-[#6f564b] disabled:opacity-50"
            >
              {getQaLabel(language)}
            </button>
            <button
              type="button"
              onClick={() => {
                router.push(`/guest/${roomId}/emergency`);
              }}
              className="inline-flex min-w-[72px] shrink-0 items-center justify-center rounded-full border border-[#e7b8b1] bg-[#fff1ef] px-3 py-1.5 text-[11px] font-medium text-[#a02a22]"
            >
              {getEmergencyLabel(language)}
            </button>
            <button
              type="button"
              aria-label={getLanguageSettingsLabel(language)}
              disabled={interactionState !== null}
              onClick={() => {
                router.push(`/guest/${roomId}/language`);
              }}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e4d8d1] bg-white text-[#6f564b] transition-colors hover:bg-[#f7f1ec] disabled:opacity-50"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="h-3.5 w-3.5 text-[#9c7b6d]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 2.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 0 0 0-15Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.9 7.5h14.2M2.9 12.5h14.2M10 2.8c1.9 1.9 3 4.5 3 7.2s-1.1 5.3-3 7.2m0-14.4C8.1 4.7 7 7.3 7 10s1.1 5.3 3 7.2" />
              </svg>
            </button>
            {unreadGuestReplies > 0 ? (
              <div className="inline-flex min-w-[32px] shrink-0 items-center justify-center rounded-full border border-[#e7b8b1] bg-[#ad2218] px-2 py-1 text-[11px] font-medium text-white">
                {unreadGuestReplies}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="min-h-0 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,#f6efe8_0%,#efe5dc_100%)] px-3 py-4 [scrollbar-gutter:stable] [webkit-overflow-scrolling:touch] lg:px-8 lg:py-6">
        {showHandoffBanner ? (
          <div className="mb-4 rounded-[18px] border border-[#eadfd8] bg-[#fffaf7] px-4 py-3 text-[12px] leading-5 text-[#7a6056]">
            {getHandoffStatusNotice(language, handoffStatus)}
          </div>
        ) : null}
        {languageUpdateNotice?.active ? (
          <div className="mb-4 rounded-[18px] border border-[#eadfd8] bg-[#fffaf7] px-4 py-3 text-[12px] leading-5 text-[#7a6056]">
            {getLanguageUpdateNotice(language, languageUpdateNotice.updatedMessages)}
          </div>
        ) : null}
        {debugInfo ? (
          <div className="mb-4 rounded-[18px] border border-[#d9cdc7] bg-[#fffaf7] px-4 py-3 text-[12px] leading-5 text-[#6a544b]">
            <div className="font-medium text-[#8b4c43]">Debug</div>
            <div>access source: {debugInfo.accessSource}</div>
            <div>token hotelId: {debugInfo.accessHotelId ?? "(null)"}</div>
            <div>resolved hotelId: {debugInfo.resolvedHotelId ?? "(null)"}</div>
            <div>room: {debugInfo.roomId} / {debugInfo.roomLabel}</div>
            <div>stayId: {debugInfo.stayId ?? "(null)"}</div>
            <div>language: {debugInfo.selectedLanguage ?? "(null)"}</div>
            <div>handoff: {debugInfo.handoffStatus ?? "(null)"}</div>
            <div>unread guest: {debugInfo.unreadCountGuest ?? "(null)"}</div>
            <div>unread front: {debugInfo.unreadCountFront ?? "(null)"}</div>
            <div className="mt-1 break-words">
              knowledge: {Object.entries(debugInfo.knowledgeCounts).map(([key, value]) => (
                `${key}=${value}`
              )).join(", ")}
            </div>
          </div>
        ) : null}
        {!hasGuestMessage && !hasNonSystemHistory ? (
          <HumanStarter
            language={language}
            directContactOnly={!hasAiGuideContent || showHandoffBanner}
          />
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
                        {renderMessageBody(message, knowledge, setSelectedGuideDetail)}
                      </div>
                      <div className="mt-1 flex justify-end text-[11px] text-[#8b776e] lg:text-[10px]">
                        <span>{formatTimeLabel(message.timestamp, language)}</span>
                        {message.optimistic ? (
                          <span className="ml-2 font-light">{ui.sendingLabel}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : isSystem ? (
                    <div className="max-w-[88%] lg:max-w-[52%] xl:max-w-[46%]">
                      <div className="rounded-[24px] bg-white px-4 py-3 text-sm leading-6 text-[#8d4d47] shadow-[0_10px_24px_rgba(72,47,35,0.05)] lg:rounded-[20px] lg:px-3.5 lg:py-2.5 lg:text-[13px] lg:leading-5">
                        {renderMessageBody(message, knowledge, setSelectedGuideDetail)}
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
                          {renderMessageBody(message, knowledge, setSelectedGuideDetail)}
                          {message.sender !== "guest" && message.translationState === "fallback" ? (
                            <div className="mt-3 rounded-[14px] border border-[#eadfd8] bg-[#f8f2ee] px-3 py-2 text-[12px] font-light leading-5 text-[#8b776e]">
                              {getTranslationFallbackLabel(language)}
                            </div>
                          ) : null}
                          {message.sender === "ai" &&
                          message.handoffConfirmation &&
                          activeHandoffConfirmationMessageId === message.id ? (
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                disabled={message.optimistic || isQuickReplySubmitting}
                                onClick={() => {
                                  void submitConfirmationReply(ui.confirmYesLabel);
                                }}
                                className="rounded-full border border-[#981d15] bg-[#ad2218] px-3 py-1.5 text-[12px] font-light text-white disabled:opacity-60"
                              >
                                {ui.confirmYesLabel}
                              </button>
                              <button
                                type="button"
                                disabled={message.optimistic || isQuickReplySubmitting}
                                onClick={() => {
                                  void submitConfirmationReply(ui.confirmNoLabel);
                                }}
                                className="rounded-full border border-[#e7ddd8] bg-[#faf5f1] px-3 py-1.5 text-[12px] font-light text-[#7a554a] disabled:opacity-60"
                              >
                                {ui.confirmNoLabel}
                              </button>
                            </div>
                          ) : null}
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

      <GuestChatInput
        roomId={roomId}
        language={language}
        richMenu={richMenu}
        interactionState={interactionState}
        onModeChange={setActiveMode}
        onThreadResolved={(threadId, mode) => {
          setCurrentThreadId(threadId);
          setActiveMode(mode);
          if (mode === "human") {
            setThreadMeta((current) => ({
              ...current,
              handoffStatus: current.handoffStatus ?? "requested",
            }));
          }
        }}
        onMessagesReplace={replaceOptimisticMessage}
        onMessagesAppend={appendMessages}
        onOptimisticRemove={removeOptimisticMessage}
        onOptimisticSend={(message) => {
          setChatMessages((current) => [...current, message]);
        }}
        onInteractionStateChange={setInteractionState}
      />
      <GuestQaSheet
        roomId={roomId}
        language={language}
        knowledge={knowledge}
        prompts={prompts}
        localizedGuideLabels={localizedGuideLabels}
        open={isQaOpen}
        interactionState={interactionState}
        onClose={() => {
          setIsQaOpen(false);
        }}
        onThreadResolved={(threadId, mode) => {
          setCurrentThreadId(threadId);
          setActiveMode(mode);
        }}
        onMessagesAppend={appendMessages}
        onInteractionStateChange={setInteractionState}
      />
      <GuideDetailSheet
        detail={selectedGuideDetail}
        onClose={() => {
          setSelectedGuideDetail(null);
        }}
      />
    </div>
  );
}
