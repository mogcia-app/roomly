import type { GuestTranslationState } from "@/lib/guest-contract";

export type GuestLanguage = "ja" | "en" | "zh-CN" | "zh-TW" | "ko";

export type GuestMessage = {
  id: string;
  sender: "guest" | "ai" | "front" | "system";
  body: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  timestamp: string | null;
  readAt?: string | null;
  isRead?: boolean;
  originalBody?: string | null;
  originalLanguage?: string | null;
  translatedBodyFront?: string | null;
  translatedLanguageFront?: string | null;
  translatedBodyGuest?: string | null;
  translatedLanguageGuest?: string | null;
  translationState?: GuestTranslationState;
  handoffConfirmation?: boolean;
};

export type GuestRoomContext = {
  roomId: string;
  roomLabel: string;
  roomDisplayName?: string | null;
  roomNumber?: string | null;
  hotelName: string;
  stayActive: boolean;
  translationEnabled?: boolean;
  hearingSheetPrompts: string[];
  hearingSheetKnowledge?: HearingSheetKnowledge;
  hotelId?: string | null;
  stayId?: string | null;
  roomFloor?: string | null;
};

export type GuestStayStatus = GuestRoomContext & {
  selectedLanguage: GuestLanguage | null;
  unreadCountFront?: number | null;
  unreadCountGuest?: number | null;
  handoffStatus?: "none" | "requested" | "accepted" | null;
};

export type HearingSheetWifiEntry = {
  floor: string | null;
  ssid: string | null;
  password: string | null;
  note: string | null;
  notes?: string[];
};

export type HearingSheetBreakfastEntry = {
  style: string | null;
  hours: string | null;
  location: string | null;
  price: string | null;
  reservationRequired: boolean | null;
  note: string | null;
  notes?: string[];
};

export type HearingSheetBathEntry = {
  name: string | null;
  hours: string | null;
  location: string | null;
  note: string | null;
  notes?: string[];
};

export type HearingSheetFacilityEntry = {
  name: string | null;
  hours: string | null;
  note: string | null;
  notes?: string[];
};

export type HearingSheetFacilityLocationEntry = {
  name: string | null;
  floor: string | null;
  note: string | null;
  notes?: string[];
};

export type HearingSheetAmenityEntry = {
  name: string | null;
  inRoom: boolean | null;
  availableOnRequest: boolean | null;
  requestMethod: string | null;
  price: string | null;
  note: string | null;
  notes?: string[];
};

export type HearingSheetParkingEntry = {
  name: string | null;
  capacity: string | null;
  price: string | null;
  hours: string | null;
  reservationRequired: boolean | null;
  location: string | null;
  note: string | null;
  notes?: string[];
};

export type HearingSheetEmergencyEntry = {
  category: string | null;
  contact: string | null;
  steps: string | null;
  note: string | null;
  notes?: string[];
};

export type HearingSheetFaqEntry = {
  question: string | null;
  answer: string | null;
};

export type HearingSheetCheckoutEntry = {
  time: string | null;
  method: string | null;
  keyReturnLocation: string | null;
  lateCheckoutPolicy: string | null;
  note: string | null;
  notes?: string[];
};

export type HearingSheetRoomServiceEntry = {
  menuName: string | null;
  price: string | null;
  orderMethod: string | null;
  hours: string | null;
  note: string | null;
  notes?: string[];
};

export type HearingSheetTransportEntry = {
  companyName: string | null;
  serviceType: string | null;
  phone: string | null;
  hours: string | null;
  priceNote: string | null;
  note: string | null;
  notes?: string[];
};

export type HearingSheetNearbySpotEntry = {
  name: string | null;
  category: string | null;
  distance: string | null;
  hours: string | null;
  location: string | null;
  note: string | null;
  notes?: string[];
};

export type HearingSheetKnowledge = {
  frontDeskHours: string[];
  wifi: HearingSheetWifiEntry[];
  breakfast: HearingSheetBreakfastEntry[];
  baths: HearingSheetBathEntry[];
  facilities: HearingSheetFacilityEntry[];
  facilityLocations: HearingSheetFacilityLocationEntry[];
  amenities: HearingSheetAmenityEntry[];
  parking: HearingSheetParkingEntry[];
  emergency: HearingSheetEmergencyEntry[];
  faq: HearingSheetFaqEntry[];
  checkout: HearingSheetCheckoutEntry[];
  roomService: HearingSheetRoomServiceEntry[];
  transport: HearingSheetTransportEntry[];
  nearbySpots: HearingSheetNearbySpotEntry[];
};

export type GuestUiCopy = {
  todayLabel: string;
  aiLabel: string;
  frontLabel: string;
  sendLabel: string;
  sendingLabel: string;
  readLabel: string;
  messagePlaceholder: string;
  messageSendError: string;
  aiStarterError: string;
  handoffError: string;
  menuUnavailableError: string;
  introMessage: string;
  deliveryTitle: string;
  deliveryDescription: string;
  roomGuideTitle: string;
  roomGuideDescription: string;
  requestPrompt: string;
  humanStarterMessage: string;
  directContactMessage: string;
  confirmYesLabel: string;
  confirmNoLabel: string;
  roomGuideStarterBody: string;
  requestCategories: string[];
};

const roomContexts: Record<string, GuestRoomContext> = {
  "101": {
    roomId: "101",
    roomLabel: "101号室",
    hotelName: "Roomly旅館",
    stayActive: true,
    hearingSheetPrompts: [],
    hearingSheetKnowledge: {
      frontDeskHours: ["フロント対応時間は24時間です。"],
      wifi: [
        {
          floor: "1階",
          ssid: "Roomly-Guest",
          password: "AskFrontDesk",
          note: "パスワードは客室案内にも記載があります。",
        },
      ],
      breakfast: [
        {
          style: null,
          hours: "7:00〜9:00",
          location: "1階レストラン",
          price: null,
          reservationRequired: null,
          note: null,
        },
      ],
      baths: [
        {
          name: "大浴場",
          hours: "16:00〜24:00 / 6:00〜9:00",
          location: "2階",
          note: null,
        },
      ],
      facilities: [
        {
          name: "駐車場",
          hours: null,
          note: "玄関横にあります。",
        },
      ],
      facilityLocations: [],
      amenities: [
        {
          name: "タオル・歯ブラシ",
          inRoom: null,
          availableOnRequest: true,
          requestMethod: "チャットからフロントへ依頼",
          price: null,
          note: null,
        },
      ],
      parking: [],
      emergency: [],
      faq: [],
      checkout: [],
      roomService: [],
      transport: [],
      nearbySpots: [],
    },
    roomFloor: "1階",
  },
  "203": {
    roomId: "203",
    roomLabel: "203号室",
    hotelName: "Roomly旅館",
    stayActive: true,
    hearingSheetPrompts: [],
    hearingSheetKnowledge: {
      frontDeskHours: ["フロント対応時間は24時間です。"],
      wifi: [
        {
          floor: "2階",
          ssid: "Roomly-2F",
          password: "Roomly203",
          note: "客室内の案内カードもご確認ください。",
        },
      ],
      breakfast: [
        {
          style: null,
          hours: "7:30〜9:30",
          location: "1階会場",
          price: null,
          reservationRequired: null,
          note: null,
        },
      ],
      baths: [
        {
          name: "大浴場",
          hours: "16:00〜24:00 / 6:00〜9:00",
          location: null,
          note: null,
        },
      ],
      facilities: [],
      facilityLocations: [],
      amenities: [
        {
          name: "歯ブラシ・タオル",
          inRoom: null,
          availableOnRequest: true,
          requestMethod: "フロントへお届け依頼",
          price: null,
          note: null,
        },
      ],
      parking: [],
      emergency: [],
      faq: [],
      checkout: [],
      roomService: [],
      transport: [],
      nearbySpots: [],
    },
    roomFloor: "2階",
  },
  "999": {
    roomId: "999",
    roomLabel: "999号室",
    hotelName: "Roomly旅館",
    stayActive: false,
    hearingSheetPrompts: [],
    hearingSheetKnowledge: {
      frontDeskHours: [],
      wifi: [],
      breakfast: [],
      baths: [],
      facilities: [],
      facilityLocations: [],
      amenities: [],
      parking: [],
      emergency: [],
      faq: [],
      checkout: [],
      roomService: [],
      transport: [],
      nearbySpots: [],
    },
  },
};

const languageLabels: Record<GuestLanguage, string> = {
  ja: "日本語",
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ko: "한국어",
};

const guestUiCopy: Record<GuestLanguage, GuestUiCopy> = {
  ja: {
    todayLabel: "今日",
    aiLabel: "AI",
    frontLabel: "フロント",
    sendLabel: "送信",
    sendingLabel: "送信中...",
    readLabel: "既読",
    messagePlaceholder: "スタッフへ依頼内容を入力",
    messageSendError: "メッセージを送信できませんでした。再度お試しください。",
    aiStarterError: "AIへの問い合わせ開始に失敗しました。再度お試しください。",
    handoffError: "フロントへの通知に失敗しました。再度お試しください。",
    menuUnavailableError: "このメニューは現在ご利用いただけません。フロントへご確認ください。",
    introMessage: "スタッフへのご依頼は、このチャットに入力してください。\n館内案内はヘッダーの「Q&A」から確認できます。",
    deliveryTitle: "お届け・ご依頼",
    deliveryDescription: "アメニティ追加などをフロントへ送ります",
    roomGuideTitle: "館内・お部屋のご案内",
    roomGuideDescription: "まずはAIがその場でご案内します",
    requestPrompt: "ご依頼内容を選んでください",
    humanStarterMessage: "スタッフへのご依頼は、このチャットに入力してください。\n館内案内はヘッダーの「Q&A」から確認できます。",
    directContactMessage: "スタッフへのご依頼は、このチャットに入力してください。\n館内案内はヘッダーの「Q&A」から確認できます。",
    confirmYesLabel: "はい",
    confirmNoLabel: "いいえ",
    roomGuideStarterBody: "館内設備やお部屋の使い方を教えてください。",
    requestCategories: ["歯ブラシ希望", "タオル追加", "清掃・片付け", "その他の依頼"],
  },
  en: {
    todayLabel: "Today",
    aiLabel: "AI",
    frontLabel: "Front Desk",
    sendLabel: "Send",
    sendingLabel: "Sending...",
    readLabel: "Read",
    messagePlaceholder: "Message the staff",
    messageSendError: "Message could not be sent. Please try again.",
    aiStarterError: "Could not start the AI chat. Please try again.",
    handoffError: "Could not notify the front desk. Please try again.",
    menuUnavailableError: "This menu is currently unavailable. Please check with the front desk.",
    introMessage: "Type your request in this chat to contact the staff.\nFor hotel information, use “Q&A” in the header.",
    deliveryTitle: "Delivery / Request",
    deliveryDescription: "Send an amenity request to the front desk.",
    roomGuideTitle: "Room / Facility Guide",
    roomGuideDescription: "The AI can guide you right away.",
    requestPrompt: "Select your request",
    humanStarterMessage: "Type your request in this chat to contact the staff.\nFor hotel information, use “Q&A” in the header.",
    directContactMessage: "Type your request in this chat to contact the staff.\nFor hotel information, use “Q&A” in the header.",
    confirmYesLabel: "Yes",
    confirmNoLabel: "No",
    roomGuideStarterBody: "Please tell me about the room and hotel facilities.",
    requestCategories: ["Toothbrush", "Extra towels", "Cleaning", "Other request"],
  },
  "zh-CN": {
    todayLabel: "今天",
    aiLabel: "AI",
    frontLabel: "前台",
    sendLabel: "发送",
    sendingLabel: "发送中...",
    readLabel: "已读",
    messagePlaceholder: "请输入要发送给工作人员的内容",
    messageSendError: "消息发送失败，请重试。",
    aiStarterError: "无法开始 AI 对话，请重试。",
    handoffError: "无法通知前台，请重试。",
    menuUnavailableError: "该菜单当前不可用。请向前台确认。",
    introMessage: "如需联系工作人员，请直接在此聊天中输入。\n馆内信息请通过顶部的“Q&A”查看。",
    deliveryTitle: "送达 / 请求",
    deliveryDescription: "可向前台发送备品追加等请求。",
    roomGuideTitle: "馆内 / 客房说明",
    roomGuideDescription: "AI 会先为您即时说明。",
    requestPrompt: "请选择请求内容",
    humanStarterMessage: "如需联系工作人员，请直接在此聊天中输入。\n馆内信息请通过顶部的“Q&A”查看。",
    directContactMessage: "如需联系工作人员，请直接在此聊天中输入。\n馆内信息请通过顶部的“Q&A”查看。",
    confirmYesLabel: "是",
    confirmNoLabel: "否",
    roomGuideStarterBody: "请介绍一下馆内设施和客房使用方法。",
    requestCategories: ["牙刷", "加送毛巾", "清扫整理", "其他请求"],
  },
  "zh-TW": {
    todayLabel: "今天",
    aiLabel: "AI",
    frontLabel: "櫃台",
    sendLabel: "發送",
    sendingLabel: "發送中...",
    readLabel: "已讀",
    messagePlaceholder: "請輸入要傳送給工作人員的內容",
    messageSendError: "訊息發送失敗，請再試一次。",
    aiStarterError: "無法開始 AI 對話，請再試一次。",
    handoffError: "無法通知前台，請再試一次。",
    menuUnavailableError: "此選單目前無法使用。請向前台確認。",
    introMessage: "如需聯絡工作人員，請直接在此聊天中輸入。\n館內資訊請透過頂部的「Q&A」查看。",
    deliveryTitle: "送達 / 請求",
    deliveryDescription: "可向前台發送備品追加等請求。",
    roomGuideTitle: "館內 / 客房說明",
    roomGuideDescription: "AI 會先即時為您說明。",
    requestPrompt: "請選擇請求內容",
    humanStarterMessage: "如需聯絡工作人員，請直接在此聊天中輸入。\n館內資訊請透過頂部的「Q&A」查看。",
    directContactMessage: "如需聯絡工作人員，請直接在此聊天中輸入。\n館內資訊請透過頂部的「Q&A」查看。",
    confirmYesLabel: "是",
    confirmNoLabel: "否",
    roomGuideStarterBody: "請介紹一下館內設施和客房使用方式。",
    requestCategories: ["牙刷", "加送毛巾", "清掃整理", "其他請求"],
  },
  ko: {
    todayLabel: "오늘",
    aiLabel: "AI",
    frontLabel: "프런트",
    sendLabel: "전송",
    sendingLabel: "전송 중...",
    readLabel: "읽음",
    messagePlaceholder: "직원에게 보낼 내용을 입력하세요",
    messageSendError: "메시지를 보내지 못했습니다. 다시 시도해 주세요.",
    aiStarterError: "AI 대화를 시작하지 못했습니다. 다시 시도해 주세요.",
    handoffError: "프런트에 알리지 못했습니다. 다시 시도해 주세요.",
    menuUnavailableError: "이 메뉴는 현재 사용할 수 없습니다. 프런트로 확인해 주세요.",
    introMessage: "직원에게 요청할 내용은 이 채팅에 입력해 주세요.\n호텔 안내는 상단의 “Q&A”에서 확인할 수 있습니다.",
    deliveryTitle: "배달 / 요청",
    deliveryDescription: "어메니티 추가 요청 등을 프런트로 보낼 수 있습니다.",
    roomGuideTitle: "객실 / 시설 안내",
    roomGuideDescription: "AI가 먼저 바로 안내해 드립니다.",
    requestPrompt: "요청 내용을 선택해 주세요",
    humanStarterMessage: "직원에게 요청할 내용은 이 채팅에 입력해 주세요.\n호텔 안내는 상단의 “Q&A”에서 확인할 수 있습니다.",
    directContactMessage: "직원에게 요청할 내용은 이 채팅에 입력해 주세요.\n호텔 안내는 상단의 “Q&A”에서 확인할 수 있습니다.",
    confirmYesLabel: "예",
    confirmNoLabel: "아니요",
    roomGuideStarterBody: "객실 사용 방법과 시설 정보를 알려 주세요.",
    requestCategories: ["칫솔", "수건 추가", "청소 / 정리", "기타 요청"],
  },
};

export function hasGuestAiGuideContent(
  knowledge: HearingSheetKnowledge | null | undefined,
  prompts: string[],
) {
  return (
    (knowledge?.frontDeskHours.length ?? 0) > 0 ||
    (knowledge?.wifi.length ?? 0) > 0 ||
    (knowledge?.breakfast.length ?? 0) > 0 ||
    (knowledge?.baths.length ?? 0) > 0 ||
    (knowledge?.facilities.length ?? 0) > 0 ||
    (knowledge?.facilityLocations.length ?? 0) > 0 ||
    (knowledge?.amenities.length ?? 0) > 0 ||
    (knowledge?.parking.length ?? 0) > 0 ||
    (knowledge?.emergency.length ?? 0) > 0 ||
    (knowledge?.faq.length ?? 0) > 0 ||
    (knowledge?.checkout.length ?? 0) > 0 ||
    (knowledge?.roomService.length ?? 0) > 0 ||
    (knowledge?.transport.length ?? 0) > 0 ||
    (knowledge?.nearbySpots.length ?? 0) > 0 ||
    prompts.length > 0
  );
}

export function getGuestRoomContext(roomId: string): GuestRoomContext | null {
  return roomContexts[roomId] ?? null;
}

export function getGuestStayStatus(
  roomId: string,
  selectedLanguage: GuestLanguage | null,
): GuestStayStatus | null {
  const room = getGuestRoomContext(roomId);

  if (!room) {
    return null;
  }

  return {
    ...room,
    selectedLanguage,
  };
}

export function getGuestLanguageLabel(language: GuestLanguage): string {
  return languageLabels[language];
}

export function getGuestUiCopy(language: GuestLanguage): GuestUiCopy {
  return guestUiCopy[language];
}

export function isGuestLanguage(value: string | undefined): value is GuestLanguage {
  return value === "ja" || value === "en" || value === "zh-CN" || value === "zh-TW" || value === "ko";
}

export function getGuestThread(
  mode: "ai" | "human",
  language: GuestLanguage = "ja",
): GuestMessage[] {
  const now = new Date();
  const earlier = new Date(now.getTime() - 1000 * 60 * 18).toISOString();
  const ui = getGuestUiCopy(language);

  if (mode === "human") {
    return [
      {
        id: "system-1",
        sender: "system",
        body:
          language === "en"
            ? "The front desk has joined the chat."
            : language === "zh-CN"
              ? "前台已加入聊天。"
              : language === "zh-TW"
                ? "櫃台已加入聊天。"
              : language === "ko"
                ? "프런트가 채팅에 참여했습니다."
                : "フロントがチャットに参加しました。",
        timestamp: earlier,
      },
      {
        id: "front-1",
        sender: "front",
        body:
          language === "en"
            ? "Front desk here. Please type your request."
            : language === "zh-CN"
              ? "这里是前台。请输入您的需求。"
              : language === "zh-TW"
                ? "這裡是櫃台。請輸入您的需求。"
              : language === "ko"
                ? "프런트입니다. 요청 내용을 입력해 주세요."
                : "フロントです。ご依頼内容を入力してください。",
        timestamp: earlier,
      },
    ];
  }

  return [
    {
      id: "ai-1",
      sender: "ai",
      body: ui.introMessage,
      timestamp: earlier,
    },
  ];
}
