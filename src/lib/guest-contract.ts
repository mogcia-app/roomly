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

export const GUEST_RICH_MENU_ACTION_REQUIREMENTS: Record<
  GuestRichMenuActionType,
  "url" | "handoffCategory" | "prompt" | null
> = {
  external_link: "url",
  handoff_category: "handoffCategory",
  language: null,
  ai_prompt: "prompt",
  human_handoff: null,
};

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
