import type { GuestLanguage } from "@/lib/guest-demo";

export type GuestLanguageOption = {
  value: GuestLanguage;
  label: string;
};

export const GUEST_LANGUAGE_OPTIONS: GuestLanguageOption[] = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "英語" },
  { value: "zh-CN", label: "中国語(簡体)" },
  { value: "zh-TW", label: "中国語(繁体)" },
  { value: "ko", label: "韓国語" },
];
