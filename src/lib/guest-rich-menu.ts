import "server-only";

import {
  getAdminDb,
  hasFirebaseAdminCredentials,
} from "@/lib/firebase-admin";
import {
  GUEST_RICH_MENU_ACTION_REQUIREMENTS,
  GUEST_RICH_MENUS_COLLECTION,
  isGuestRichMenuActionLanguageCode,
  isGuestRichMenuActionType,
  type GuestRichMenuActionType,
} from "@/lib/guest-contract";
import type { GuestLanguage } from "@/lib/guest-demo";

type GuestRichMenuTranslations = Partial<Record<GuestLanguage, string>>;

export type GuestRichMenuItem = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  actionType: GuestRichMenuActionType;
  visible: boolean;
  sortOrder: number;
  url?: string;
  prompt?: string;
  messageText?: string;
  messageImageUrl?: string;
  messageImageAlt?: string;
  handoffCategory?: string;
  languageCode?: GuestLanguage;
  protectedTerms?: string[];
  translations?: GuestRichMenuTranslations;
};

export type GuestRichMenu = {
  enabled: boolean;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  menuGuideText?: string;
  translationProtectedTerms?: string[];
  items: GuestRichMenuItem[];
};

type FirestoreGuestRichMenuItem = {
  id?: unknown;
  label?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  actionType?: unknown;
  visible?: unknown;
  sortOrder?: unknown;
  url?: unknown;
  prompt?: unknown;
  messageText?: unknown;
  messageImageUrl?: unknown;
  messageImageAlt?: unknown;
  handoffCategory?: unknown;
  languageCode?: unknown;
  protectedTerms?: unknown;
  translations?: unknown;
};

type FirestoreGuestRichMenu = {
  enabled?: unknown;
  imageUrl?: unknown;
  imageWidth?: unknown;
  imageHeight?: unknown;
  menuGuideText?: unknown;
  translationProtectedTerms?: unknown;
  items?: unknown;
};

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function readTranslations(value: unknown): GuestRichMenuTranslations | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).flatMap(([language, text]) => {
    if (
      (language === "ja" || language === "en" || language === "zh-CN" || language === "zh-TW" || language === "ko") &&
      readString(text)
    ) {
      return [[language, readString(text)] as const];
    }

    return [];
  });

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as GuestRichMenuTranslations;
}

function normalizeItem(value: unknown): GuestRichMenuItem | null {
  const item = value as FirestoreGuestRichMenuItem;
  const id = readString(item.id);
  const label = readString(item.label);
  const x = readNumber(item.x);
  const y = readNumber(item.y);
  const width = readNumber(item.width);
  const height = readNumber(item.height);
  const sortOrder = readNumber(item.sortOrder);

  if (
    !id ||
    !label ||
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    sortOrder === null ||
    !isGuestRichMenuActionType(item.actionType)
  ) {
    return null;
  }

  const requiredField = GUEST_RICH_MENU_ACTION_REQUIREMENTS[item.actionType];

  if (requiredField && !readString(item[requiredField])) {
    return null;
  }

  if (
    item.actionType === "ai_message" &&
    !readString(item.messageText) &&
    !readString(item.messageImageUrl)
  ) {
    return null;
  }

  return {
    id,
    label,
    x,
    y,
    width,
    height,
    actionType: item.actionType,
    visible: item.visible !== false,
    sortOrder,
    url: readString(item.url) ?? undefined,
    prompt: readString(item.prompt) ?? undefined,
    messageText: readString(item.messageText) ?? undefined,
    messageImageUrl: readString(item.messageImageUrl) ?? undefined,
    messageImageAlt: readString(item.messageImageAlt) ?? undefined,
    handoffCategory: readString(item.handoffCategory) ?? undefined,
    languageCode: isGuestRichMenuActionLanguageCode(item.languageCode)
      ? item.languageCode
      : undefined,
    protectedTerms: readStringArray(item.protectedTerms),
    translations: readTranslations(item.translations),
  };
}

function normalizeGuestRichMenu(value: FirestoreGuestRichMenu | null): GuestRichMenu | null {
  if (!value || value.enabled !== true) {
    return null;
  }

  const imageUrl = readString(value.imageUrl);
  const imageWidth = readNumber(value.imageWidth);
  const imageHeight = readNumber(value.imageHeight);
  const rawItems = Array.isArray(value.items) ? value.items : [];

  if (!imageUrl || imageWidth === null || imageHeight === null) {
    return null;
  }

  const items = rawItems
    .map((item) => normalizeItem(item))
    .filter((item): item is GuestRichMenuItem => item !== null)
    .filter((item) => item.visible)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (items.length === 0) {
    return null;
  }

  return {
    enabled: true,
    imageUrl,
    imageWidth,
    imageHeight,
    menuGuideText: readString(value.menuGuideText) ?? undefined,
    translationProtectedTerms: readStringArray(value.translationProtectedTerms),
    items,
  };
}

export async function getGuestRichMenuByHotelId(hotelId: string | null | undefined) {
  if (!hotelId || !hasFirebaseAdminCredentials()) {
    return null;
  }

  try {
    const snapshot = await getAdminDb()
      .collection(GUEST_RICH_MENUS_COLLECTION)
      .doc(hotelId)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const richMenu = normalizeGuestRichMenu(snapshot.data() as FirestoreGuestRichMenu);

    if (!richMenu) {
      console.warn("[guest/rich-menu] invalid or disabled rich menu", {
        hotelId,
      });
    }

    return richMenu;
  } catch (error) {
    console.error("[guest/rich-menu] failed", {
      hotelId,
      error,
    });
    return null;
  }
}
