export type GuestLanguage = "ja" | "en" | "zh-CN" | "ko";

export type GuestMessage = {
  id: string;
  sender: "guest" | "ai" | "front" | "system";
  body: string;
  timestamp: string | null;
};

export type GuestRoomContext = {
  roomId: string;
  roomLabel: string;
  hotelName: string;
  stayActive: boolean;
  hearingSheetPrompts: string[];
  hearingSheetKnowledge?: {
    wifi: string[];
    breakfast: string[];
    amenities: string[];
    facilities: string[];
  };
  hotelId?: string | null;
  stayId?: string | null;
};

export type GuestStayStatus = GuestRoomContext & {
  selectedLanguage: GuestLanguage | null;
};

const roomContexts: Record<string, GuestRoomContext> = {
  "101": {
    roomId: "101",
    roomLabel: "101号室",
    hotelName: "Roomly旅館",
    stayActive: true,
    hearingSheetPrompts: [
      "Wi-Fiパスワード",
      "朝食の時間",
      "タオルを追加したい",
      "駐車場の案内",
    ],
    hearingSheetKnowledge: {
      wifi: ["Wi-Fiパスワードは客室案内の館内情報をご確認ください。"],
      breakfast: ["朝食は1階レストランで7:00〜9:00です。"],
      amenities: ["追加のタオルや歯ブラシはチャットからフロントへご依頼いただけます。"],
      facilities: ["駐車場は玄関横にあります。大浴場は2階です。"],
    },
  },
  "203": {
    roomId: "203",
    roomLabel: "203号室",
    hotelName: "Roomly旅館",
    stayActive: true,
    hearingSheetPrompts: [
      "チェックアウト時間",
      "大浴場の営業時間",
      "アメニティについて",
      "深夜の問い合わせ",
    ],
    hearingSheetKnowledge: {
      wifi: ["Wi-Fiのご案内は客室内の案内カードをご確認ください。"],
      breakfast: ["朝食は7:30〜9:30に1階会場でご利用いただけます。"],
      amenities: ["歯ブラシやタオル追加はフロントへお届け依頼を送れます。"],
      facilities: ["大浴場は16:00〜24:00、翌朝は6:00〜9:00です。"],
    },
  },
  "999": {
    roomId: "999",
    roomLabel: "999号室",
    hotelName: "Roomly旅館",
    stayActive: false,
    hearingSheetPrompts: [],
    hearingSheetKnowledge: {
      wifi: [],
      breakfast: [],
      amenities: [],
      facilities: [],
    },
  },
};

const languageLabels: Record<GuestLanguage, string> = {
  ja: "日本語",
  en: "English",
  "zh-CN": "简体中文",
  ko: "한국어",
};

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

export function isGuestLanguage(value: string | undefined): value is GuestLanguage {
  return value === "ja" || value === "en" || value === "zh-CN" || value === "ko";
}

export function getGuestThread(mode: "ai" | "human"): GuestMessage[] {
  const now = new Date();
  const earlier = new Date(now.getTime() - 1000 * 60 * 18).toISOString();

  if (mode === "human") {
    return [
      {
        id: "system-1",
        sender: "system",
        body: "フロントがチャットに参加しました。",
        timestamp: earlier,
      },
      {
        id: "front-1",
        sender: "front",
        body: "フロントです。ご依頼内容を入力してください。",
        timestamp: earlier,
      },
    ];
  }

  return [
    {
      id: "ai-1",
      sender: "ai",
      body: "ご用件をお聞かせください。下の候補から選ぶか、そのまま入力してください。",
      timestamp: earlier,
    },
  ];
}
