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
  clearThreadQueryOnMount?: boolean;
};

type DisplayMessage = GuestMessage & {
  optimistic?: boolean;
};

type GuestChatComposerProps = {
  roomId: string;
  language: GuestLanguage;
  mode: "ai" | "human";
  richMenu: GuestRichMenu | null;
  onModeChange: (mode: "ai" | "human") => void;
  onMessagesReplace: (messageId: string, messages: DisplayMessage[]) => void;
  onMessagesAppend: (messages: DisplayMessage[]) => void;
  onOptimisticRemove: (messageId: string) => void;
  onOptimisticSend: (message: DisplayMessage) => void;
};

type GuestActionPanelProps = {
  roomId: string;
  roomLabel?: string;
  language: GuestLanguage;
  knowledge?: HearingSheetKnowledge | null;
  richMenu?: GuestRichMenu | null;
  prompts: string[];
  showIntro?: boolean;
  onModeChange: (mode: "ai" | "human") => void;
  onMessagesReplace: (messageId: string, messages: DisplayMessage[]) => void;
  onOptimisticRemove: (messageId: string) => void;
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
    case "ai_message":
      return Boolean(action.messageText || action.messageImageUrl);
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

function renderMessageBody(message: DisplayMessage) {
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
              <div
                key={`${card.title}-${index}`}
                className="rounded-[18px] border border-[#eadfd8] bg-[#fcf8f4] p-3"
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
              </div>
            ))}
          </div>
        ) : (
          <div className="whitespace-pre-line">{formatMessageBody(message.body)}</div>
        )
      ) : null}
    </div>
  );
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

function buildRichMenuGuideText(
  language: GuestLanguage,
  richMenu: GuestRichMenu | null | undefined,
) {
  if (!richMenu) {
    return null;
  }

  if (richMenu.menuGuideText) {
    if (language === "ja") {
      return richMenu.menuGuideText;
    }

    if (language === "en") {
      return "You can also use the quick menu below.";
    }

    if (language === "zh-CN") {
      return "您也可以使用下方快捷菜单。";
    }

    if (language === "zh-TW") {
      return "您也可以使用下方快捷選單。";
    }

    return "아래 퀵 메뉴도 사용할 수 있습니다.";
  }

  const labels = (language === "ja"
    ? richMenu.items
        .map((item) => item.label?.trim())
        .filter((label): label is string => Boolean(label))
        .slice(0, 4)
    : richMenu.items
        .map((item) => {
          const label = item.label?.trim();

          if (!label) {
            return null;
          }

          const normalized = normalizeGuideText(label);

          if (["タクシー予約", "タクシー", "taxi", "taxireservation"].includes(normalized)) {
            return language === "en"
              ? "Taxi"
              : language === "zh-CN"
                ? "出租车"
                : language === "zh-TW"
                  ? "計程車"
                  : "택시";
          }

          if (["hp", "homepage", "website", "公式サイト"].includes(normalized)) {
            return language === "en"
              ? "Website"
              : language === "zh-CN"
                ? "官网"
                : language === "zh-TW"
                  ? "官網"
                  : "웹사이트";
          }

          if (["公式インスタグラム", "インスタグラム", "instagram", "officialinstagram"].includes(normalized)) {
            return "Instagram";
          }

          if (["言語", "language"].includes(normalized)) {
            return language === "en"
              ? "Language"
              : language === "zh-CN"
                ? "语言"
                : language === "zh-TW"
                  ? "語言"
                  : "언어";
          }

          return null;
        })
        .filter((label): label is Exclude<typeof label, null> => label !== null)
        .slice(0, 4));

  if (labels.length === 0) {
    if (language === "en") {
      return "You can also use the quick menu below.";
    }

    if (language === "zh-CN") {
      return "您也可以使用下方快捷菜单。";
    }

    if (language === "zh-TW") {
      return "您也可以使用下方快捷選單。";
    }

    if (language === "ko") {
      return "아래 퀵 메뉴도 사용할 수 있습니다.";
    }

    return null;
  }

  const joined = labels.join(" / ");

  if (language === "en") {
    return `You can also open the quick menu below for ${joined}.`;
  }

  if (language === "zh-CN") {
    return `下方快捷菜单中也可以查看 ${joined}。`;
  }

  if (language === "zh-TW") {
    return `下方快捷選單中也可以查看 ${joined}。`;
  }

  if (language === "ko") {
    return `아래 퀵 메뉴에서도 ${joined} 항목을 열 수 있습니다.`;
  }

  return `下の館内メニューからも ${joined} を開けます。`;
}

function normalizeGuideText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim();
}

function formatIntroRoomLabel(roomLabel: string, language: GuestLanguage) {
  return language === "ja" ? `${roomLabel}様` : roomLabel;
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

function getLocalizedGuidePrompt(
  language: GuestLanguage,
  key: AiGuideOption["key"],
  bathName?: string,
) : string {
  if (language === "en") {
    const prompts: Record<AiGuideOption["key"], string> = {
      wifi: "Please tell me about Wi-Fi.",
      breakfast: "Please tell me about breakfast.",
      bath: bathName ? `Please tell me about ${bathName}.` : "Please tell me about the bath.",
      facility: "Please tell me about the hotel facilities.",
      amenity: "Please tell me about the amenities.",
      parking: "Please tell me about parking.",
      checkout: "Please tell me about checkout.",
      emergency: "Please tell me about emergency information.",
      roomService: "Please tell me about room service.",
      transport: "Please tell me about transportation.",
      nearby: "Please tell me about nearby spots.",
      frontDesk: "Please tell me the front desk hours.",
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
  const coveredPromptPrefixes = new Set<string>();

  if (knowledge?.wifi.length) {
    options.push({
      key: "wifi",
      label: getAiGuideLabel(language, "wifi"),
      prompt: getLocalizedGuidePrompt(language, "wifi"),
    });
    coveredPromptPrefixes.add("wi-fi");
    coveredPromptPrefixes.add("wifi");
  }

  if (knowledge?.breakfast.length) {
    options.push({
      key: "breakfast",
      label: getAiGuideLabel(language, "breakfast"),
      prompt: getLocalizedGuidePrompt(language, "breakfast"),
    });
    coveredPromptPrefixes.add("朝食");
  }

  if (knowledge?.baths.length) {
    const bathName = knowledge.baths[0]?.name ?? "大浴場";
    options.push({
      key: "bath",
      label: getAiGuideLabel(language, "bath"),
      prompt: getLocalizedGuidePrompt(language, "bath", language === "ja" ? bathName : undefined),
    });
    coveredPromptPrefixes.add("大浴場");
    coveredPromptPrefixes.add(normalizeGuideText(bathName));
  }

  if ((knowledge?.facilities.length ?? 0) > 0 || (knowledge?.facilityLocations.length ?? 0) > 0) {
    options.push({
      key: "facility",
      label: getAiGuideLabel(language, "facility"),
      prompt: getLocalizedGuidePrompt(language, "facility"),
    });
    coveredPromptPrefixes.add("館内施設");
  }

  if (knowledge?.amenities.length) {
    options.push({
      key: "amenity",
      label: getAiGuideLabel(language, "amenity"),
      prompt: getLocalizedGuidePrompt(language, "amenity"),
    });
    coveredPromptPrefixes.add("アメニティ");
  }

  if (knowledge?.parking.length) {
    options.push({
      key: "parking",
      label: getAiGuideLabel(language, "parking"),
      prompt: getLocalizedGuidePrompt(language, "parking"),
    });
    coveredPromptPrefixes.add("駐車場");
  }

  if (knowledge?.checkout.length) {
    options.push({
      key: "checkout",
      label: getAiGuideLabel(language, "checkout"),
      prompt: getLocalizedGuidePrompt(language, "checkout"),
    });
    coveredPromptPrefixes.add("チェックアウト");
  }

  if (knowledge?.emergency.length) {
    options.push({
      key: "emergency",
      label: getAiGuideLabel(language, "emergency"),
      prompt: getLocalizedGuidePrompt(language, "emergency"),
    });
  }

  if (knowledge?.roomService.length) {
    options.push({
      key: "roomService",
      label: getAiGuideLabel(language, "roomService"),
      prompt: getLocalizedGuidePrompt(language, "roomService"),
    });
  }

  if (knowledge?.transport.length) {
    options.push({
      key: "transport",
      label: getAiGuideLabel(language, "transport"),
      prompt: getLocalizedGuidePrompt(language, "transport"),
    });
    coveredPromptPrefixes.add("交通");
    coveredPromptPrefixes.add("交通案内");
  }

  if (knowledge?.nearbySpots.length) {
    options.push({
      key: "nearby",
      label: getAiGuideLabel(language, "nearby"),
      prompt: getLocalizedGuidePrompt(language, "nearby"),
    });
    coveredPromptPrefixes.add("周辺");
    coveredPromptPrefixes.add("周辺案内");
  }

  if (knowledge?.frontDeskHours.length) {
    options.push({
      key: "frontDesk",
      label: getAiGuideLabel(language, "frontDesk"),
      prompt: getLocalizedGuidePrompt(language, "frontDesk"),
    });
    coveredPromptPrefixes.add("フロント");
    coveredPromptPrefixes.add("フロント対応");
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
        label: localizeSupplementalPrompt(language, prompt),
        prompt: localizeSupplementalPrompt(language, prompt),
      })),
  ];
}

function GuestChatInput({
  roomId,
  language,
  mode,
  richMenu,
  onModeChange,
  onMessagesReplace,
  onMessagesAppend,
  onOptimisticRemove,
  onOptimisticSend,
}: GuestChatComposerProps) {
  const router = useRouter();
  const ui = getGuestUiCopy(language);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRichMenuOpen, setIsRichMenuOpen] = useState(false);
  const submitLockRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isPending || isSubmitting;

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

  async function postHumanHandoff(category?: string) {
    const response = await fetch(`/api/guest/rooms/${roomId}/handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(category ? { category } : {}),
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

    if (!trimmed || submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);

    const optimisticMessage = createOptimisticMessage("optimistic", "guest", trimmed);
    onOptimisticSend(optimisticMessage);
    setError(null);
    setMessage("");

    try {
      const response = await postGuestMessage(trimmed, mode);

      if (!response.ok) {
        onOptimisticRemove(optimisticMessage.id);
        setError(ui.messageSendError);
        return;
      }

      onModeChange(response.mode);
      onMessagesReplace(
        optimisticMessage.id,
        response.messages.map((message) => ({ ...message, optimistic: false })),
      );
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function submitRichMenuAction(action: GuestRichMenuItem) {
    if (submitLockRef.current) {
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
        const optimisticMessage =
          language === "ja"
            ? createOptimisticMessage("rich-prompt", "ai", action.prompt)
            : null;

        if (optimisticMessage) {
          onOptimisticSend(optimisticMessage);
        }

        const response = await fetch(`/api/guest/rooms/${roomId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body: action.prompt,
            mode: "ai",
            kind: "ai_starter",
            protectedTerms: mergedProtectedTerms,
            translations: action.translations,
          }),
        }).then(async (response) => {
          const payload = response.ok
            ? await response.json() as { threadId?: string; messages?: GuestMessage[] }
            : null;

          return {
            ok: response.ok,
            threadId: payload?.threadId ?? null,
            messages: (payload?.messages ?? []) as GuestMessage[],
          };
        });

        if (!response.ok) {
          if (optimisticMessage) {
            onOptimisticRemove(optimisticMessage.id);
          }
          setError(ui.messageSendError);
          return;
        }

        onModeChange("ai");
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

      if (action.actionType === "ai_message" && (action.messageText || action.messageImageUrl)) {
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

        onModeChange("ai");
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
        const optimisticMessage = createOptimisticMessage(
          "handoff-category",
          "guest",
          action.handoffCategory,
        );
        onOptimisticSend(optimisticMessage);

        const response = await postHumanHandoff(action.handoffCategory);

        if (!response.ok) {
          onOptimisticRemove(optimisticMessage.id);
          setError(ui.handoffError);
          return;
        }

        onModeChange(response.mode);
        onMessagesReplace(
          optimisticMessage.id,
          response.messages.map((message) => ({ ...message, optimistic: false })),
        );
        return;
      }

      if (action.actionType === "human_handoff") {
        const response = await postHumanHandoff();

        if (!response.ok) {
          setError(ui.handoffError);
          return;
        }

        onModeChange(response.mode);
        onMessagesAppend(response.messages.map((message) => ({ ...message, optimistic: false })));
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
      }
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
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
                disabled={isBusy}
                className="h-10 flex-1 resize-none bg-white px-3 py-2 text-sm leading-5 text-[#5f463d] outline-none"
              />
            </div>
            <button
              type="button"
              disabled={!message.trim() || isBusy}
              onClick={() => submitMessage(message)}
              className="flex h-10 min-w-[56px] items-center justify-center border border-[#981d15] bg-[#ad2218] px-4 text-sm font-light text-white disabled:opacity-60 lg:h-10 lg:min-w-[56px] lg:px-4 lg:text-[12px]"
            >
              {isBusy ? "..." : ui.sendLabel}
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
  richMenu,
  prompts,
  showIntro = false,
  onModeChange,
  onMessagesReplace,
  onOptimisticRemove,
  onOptimisticSend,
}: GuestActionPanelProps) {
  const ui = getGuestUiCopy(language);
  const actionCopy = getGuestActionCopy(language);
  const aiGuideOptions = buildAiGuideOptions(language, knowledge, prompts);
  const richMenuGuideText = buildRichMenuGuideText(language, richMenu);
  const [isRequestOptionsOpen, setIsRequestOptionsOpen] = useState(false);
  const [isAiOptionsOpen, setIsAiOptionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isBusy = isPending || isSubmitting;

  async function submitAiPrompt(body: string) {
    if (submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setError(null);

    const optimisticMessage = createOptimisticMessage("starter", "guest", body);
    onOptimisticSend(optimisticMessage);

    try {
      const rawResponse = await fetch(`/api/guest/rooms/${roomId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body,
          mode: "ai",
        }),
      });

      if (!rawResponse.ok) {
        onOptimisticRemove(optimisticMessage.id);
        setError(ui.aiStarterError);
        return;
      }

      const response = await rawResponse.json() as { messages?: GuestMessage[] };
      startTransition(() => {
        onModeChange("ai");
      });
      onMessagesReplace(
        optimisticMessage.id,
        (response.messages ?? []).map((message) => ({ ...message, optimistic: false })),
      );
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function startHumanRequest(category: string) {
    if (submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setError(null);
    setIsRequestOptionsOpen(false);

    const optimisticMessage = createOptimisticMessage("handoff-category", "guest", category);
    onOptimisticSend(optimisticMessage);

    try {
      const rawResponse = await fetch(`/api/guest/rooms/${roomId}/handoff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ category }),
      });

      if (!rawResponse.ok) {
        onOptimisticRemove(optimisticMessage.id);
        setError(ui.handoffError);
        return;
      }

      const response = await rawResponse.json() as { messages?: GuestMessage[] };
      startTransition(() => {
        onModeChange("human");
      });
      onMessagesReplace(
        optimisticMessage.id,
        (response.messages ?? []).map((message) => ({ ...message, optimistic: false })),
      );
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
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
            {showIntro && roomLabel ? `${formatIntroRoomLabel(roomLabel, language)}\n` : ""}
            {showIntro ? ui.introMessage : actionCopy.helperBody}
          </div>
          {richMenuGuideText ? (
            <div className="mt-3 rounded-[16px] border border-[#ebe1dc] bg-[#f7f1ec] px-3 py-2 text-[12px] font-light leading-5 text-[#7a6056]">
              {richMenuGuideText}
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isBusy}
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
              disabled={isBusy}
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
                      disabled={isBusy}
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
                    disabled={isBusy}
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
  clearThreadQueryOnMount = false,
}: GuestChatExperienceProps) {
  const ui = getGuestUiCopy(language);
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<"ai" | "human">(mode);
  const [chatMessages, setChatMessages] = useState<DisplayMessage[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const removeOptimisticMessage = (messageId: string) => {
    setChatMessages((current) => current.filter((message) => message.id !== messageId));
  };
  const messages = chatMessages;
  const hasGuestMessage = messages.some((message) => message.sender === "guest");
  const hasNonSystemHistory = messages.some(
    (message) => message.sender === "guest" || message.sender === "ai" || message.sender === "front",
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
    if (!clearThreadQueryOnMount) {
      return;
    }

    router.replace(`/guest/${roomId}/chat?mode=${activeMode}`, { scroll: false });
  }, [activeMode, clearThreadQueryOnMount, roomId, router]);

  const appendMessages = (newMessages: DisplayMessage[]) => {
    if (newMessages.length === 0) {
      return;
    }

    setChatMessages((current) => [...current, ...newMessages]);
  };

  const replaceOptimisticMessage = (messageId: string, newMessages: DisplayMessage[]) => {
    setChatMessages((current) => [
      ...current.filter((message) => message.id !== messageId),
      ...newMessages,
    ]);
  };

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
        {!hasGuestMessage && activeMode === "ai" ? (
          <GuestActionPanel
            roomId={roomId}
            roomLabel={roomLabel}
            language={language}
            knowledge={knowledge}
            richMenu={richMenu}
            prompts={prompts}
            showIntro
            onModeChange={setActiveMode}
            onMessagesReplace={replaceOptimisticMessage}
            onOptimisticRemove={removeOptimisticMessage}
            onOptimisticSend={(message) => {
              setChatMessages((current) => [...current, message]);
            }}
          />
        ) : null}
        {!hasGuestMessage && activeMode === "human" && !hasNonSystemHistory ? (
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
                        {renderMessageBody(message)}
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
                        {renderMessageBody(message)}
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
                          {renderMessageBody(message)}
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
          {activeMode === "ai" && hasGuestMessage ? (
            <GuestActionPanel
              roomId={roomId}
              roomLabel={roomLabel}
              language={language}
              knowledge={knowledge}
              richMenu={richMenu}
              prompts={prompts}
              showIntro
              onModeChange={setActiveMode}
              onMessagesReplace={replaceOptimisticMessage}
              onOptimisticRemove={removeOptimisticMessage}
              onOptimisticSend={(message) => {
                setChatMessages((current) => [...current, message]);
              }}
            />
          ) : null}
          <div ref={bottomRef} />
        </div>
      </section>

      <GuestChatInput
        roomId={roomId}
        language={language}
        mode={activeMode}
        richMenu={richMenu}
        onModeChange={setActiveMode}
        onMessagesReplace={replaceOptimisticMessage}
        onMessagesAppend={appendMessages}
        onOptimisticRemove={removeOptimisticMessage}
        onOptimisticSend={(message) => {
          setChatMessages((current) => [...current, message]);
        }}
      />
    </>
  );
}
