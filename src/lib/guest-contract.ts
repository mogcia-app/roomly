import type { GuestLanguage } from "@/lib/guest-demo";

export const GUEST_HEARING_SHEETS_COLLECTION = "hearing_sheets";
export const GUEST_RICH_MENUS_COLLECTION = "guest_rich_menus";

export const GUEST_FRONT_DESK_LANGUAGE = "ja" as const;
export const GUEST_DEFAULT_TRANSLATION_MODEL = "gpt-4o-mini" as const;

export const GUEST_TRANSLATION_STATES = [
  "not_required",
  "fallback",
  "ready",
] as const;

export type GuestTranslationState =
  (typeof GUEST_TRANSLATION_STATES)[number];

export const GUEST_RICH_MENU_ACTION_TYPES = [
  "external_link",
  "handoff_category",
  "language",
  "ai_prompt",
  "human_handoff",
] as const;

export type GuestRichMenuActionType =
  (typeof GUEST_RICH_MENU_ACTION_TYPES)[number];

export type GuestRichMenuActionField =
  | "url"
  | "handoffCategory"
  | "prompt"
  | "languageCode";

export type GuestRichMenuActionSpec = {
  requiredField: GuestRichMenuActionField | null;
  opensExternalUrl: boolean;
  navigationTarget: "none" | "chat_ai" | "chat_human" | "language";
  composerBehavior: "none" | "auto_send";
  description: string;
};

export const GUEST_RICH_MENU_ACTION_SPECS: Record<
  GuestRichMenuActionType,
  GuestRichMenuActionSpec
> = {
  external_link: {
    requiredField: "url",
    opensExternalUrl: true,
    navigationTarget: "none",
    composerBehavior: "none",
    description: "Open the configured external URL in a new tab.",
  },
  handoff_category: {
    requiredField: "handoffCategory",
    opensExternalUrl: false,
    navigationTarget: "chat_human",
    composerBehavior: "none",
    description:
      "Start the human handoff flow with the configured category and move to human chat.",
  },
  language: {
    requiredField: null,
    opensExternalUrl: false,
    navigationTarget: "language",
    composerBehavior: "none",
    description:
      "Open the language selector, or switch directly when languageCode is provided.",
  },
  ai_prompt: {
    requiredField: "prompt",
    opensExternalUrl: false,
    navigationTarget: "chat_ai",
    composerBehavior: "none",
    description:
      "Start the AI conversation with the configured prompt as an AI message.",
  },
  human_handoff: {
    requiredField: null,
    opensExternalUrl: false,
    navigationTarget: "chat_human",
    composerBehavior: "none",
    description:
      "Start the human handoff flow immediately and move to human chat.",
  },
};

export const GUEST_RICH_MENU_ACTION_REQUIREMENTS: Record<
  GuestRichMenuActionType,
  GuestRichMenuActionField | null
> = Object.fromEntries(
  Object.entries(GUEST_RICH_MENU_ACTION_SPECS).map(([actionType, spec]) => [
    actionType,
    spec.requiredField,
  ]),
) as Record<GuestRichMenuActionType, GuestRichMenuActionField | null>;

export function isGuestRichMenuActionLanguageCode(
  value: unknown,
): value is GuestLanguage {
  return value === "ja" || value === "en" || value === "zh-CN" || value === "ko";
}

export const GUEST_FIREBASE_ADMIN_ENV_KEYS = [
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
] as const;

export const GUEST_OPENAI_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_TRANSLATION_MODEL",
] as const;

export function isGuestRichMenuActionType(
  value: unknown,
): value is GuestRichMenuActionType {
  return GUEST_RICH_MENU_ACTION_TYPES.includes(
    value as GuestRichMenuActionType,
  );
}
