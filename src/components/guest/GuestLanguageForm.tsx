"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { isGuestLanguage, type GuestLanguage } from "@/lib/guest-demo";
import { updateGuestLanguage } from "@/lib/guest-language-client";
import type { GuestLanguageOption } from "@/lib/guest-languages";

type GuestLanguageFormProps = {
  debug?: boolean;
  roomId: string;
  roomLabel: string;
  hotelName: string;
  showHotelName?: boolean;
  initialLanguage: GuestLanguage | null;
  fallbackLanguageOptions: GuestLanguageOption[];
};

function getLanguagePageCopy(language: GuestLanguage | null) {
  if (language === "en") {
    return {
      hotelAccess: "Guest Access",
      title: "Please select your language",
      body: "After selecting a language, you can start chatting right away.",
      label: "Language",
      placeholder: "Please select",
      saveError: "Could not save your language setting. Please try again.",
      saving: "Updating language...",
      submit: "Continue",
    };
  }

  if (language === "zh-CN") {
    return {
      hotelAccess: "住客入口",
      title: "请选择语言",
      body: "选择语言后，您可以立即开始聊天。",
      label: "语言",
      placeholder: "请选择",
      saveError: "无法保存语言设置，请重试。",
      saving: "正在更新语言...",
      submit: "继续",
    };
  }

  if (language === "zh-TW") {
    return {
      hotelAccess: "住客入口",
      title: "請選擇語言",
      body: "選擇語言後，您可以立即開始聊天。",
      label: "語言",
      placeholder: "請選擇",
      saveError: "無法儲存語言設定，請再試一次。",
      saving: "正在更新語言...",
      submit: "繼續",
    };
  }

  if (language === "ko") {
    return {
      hotelAccess: "게스트 입장",
      title: "언어를 선택해 주세요",
      body: "언어를 선택하면 바로 채팅을 시작할 수 있습니다.",
      label: "언어",
      placeholder: "선택해 주세요",
      saveError: "언어 설정을 저장하지 못했습니다. 다시 시도해 주세요.",
      saving: "언어를 업데이트하는 중...",
      submit: "계속",
    };
  }

  return {
    hotelAccess: "ゲスト案内",
    title: "言語を選択してください",
    body: "言語を選択すると、すぐにチャットを始められます。",
    label: "言語",
    placeholder: "選択してください",
    saveError: "言語設定を保存できませんでした。もう一度お試しください。",
    saving: "言語を更新中...",
    submit: "次へ進む",
  };
}

export function GuestLanguageForm({
  debug = false,
  roomId,
  roomLabel,
  hotelName,
  showHotelName = false,
  initialLanguage,
  fallbackLanguageOptions,
}: GuestLanguageFormProps) {
  const router = useRouter();
  const copy = getLanguagePageCopy(initialLanguage);
  const [selectedLanguage, setSelectedLanguage] =
    useState<GuestLanguage | null>(initialLanguage);
  const [languageOptions, setLanguageOptions] =
    useState<GuestLanguageOption[]>(fallbackLanguageOptions);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadLanguageOptions() {
      try {
        const response = await fetch("/api/public/guest-languages", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json() as {
          guestLanguages?: Array<{
            value?: string;
            label?: string;
          }>;
        };
        const nextOptions =
          payload.guestLanguages?.flatMap((option) => {
            if (!isGuestLanguage(option.value) || typeof option.label !== "string") {
              return [];
            }

            const label = option.label.trim();

            return label
              ? [{ value: option.value, label }]
              : [];
          }) ?? [];

        if (!cancelled && nextOptions.length > 0) {
          setLanguageOptions(nextOptions);
        }
      } catch {
        return;
      }
    }

    void loadLanguageOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleContinue() {
    if (!selectedLanguage) {
      return;
    }

    setError(null);

    const response = await updateGuestLanguage(roomId, selectedLanguage);

    if (!response.ok) {
      setError(copy.saveError);
      return;
    }

    startTransition(() => {
      const searchParams = new URLSearchParams();

      searchParams.set("lang", response.guestLanguage);
      searchParams.set("languageUpdated", "1");
      searchParams.set("updatedMessages", String(response.updatedMessages));

      if (debug) {
        searchParams.set("debug", "1");
      }

      router.push(`/guest/${roomId}/chat?${searchParams.toString()}`);
      router.refresh();
    });
  }

  return (
    <div className="border border-[#e7ddd8] bg-[#fffaf7] px-6 py-7 shadow-[0_20px_60px_rgba(72,47,35,0.08)]">
      <div className="border-b border-[#ebe1dc] pb-6 text-center">
        {showHotelName ? (
          <p className="mt-4 text-[10px] font-light uppercase tracking-[0.26em] text-[#ad2218]">
            {hotelName}
          </p>
        ) : null}
        <h1 className="mt-3 text-[1.65rem] font-light tracking-[-0.04em] text-[#171a22]">
          {copy.title}
        </h1>
        <p className="mx-auto mt-2 max-w-[18rem] text-[13px] font-light leading-6 text-[#8f8078]">
          {copy.body}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between border-b border-[#ebe1dc] pb-5 text-[11px] font-light uppercase tracking-[0.18em] text-[#9a8b83]">
        <span>{roomLabel}</span>
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 bg-[#ad2218]" />
          <span>{copy.hotelAccess}</span>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 text-[10px] font-light uppercase tracking-[0.22em] text-[#9a8b83]">
          {copy.label}
        </div>
        <div className="relative border border-[#ddd2cc] bg-white p-1.5">
          <select
            id="guest-language"
            value={selectedLanguage ?? ""}
            onChange={(event) => {
              const value = event.target.value as GuestLanguage | "";
              setSelectedLanguage(value === "" ? null : value);
            }}
            className="h-[58px] w-full appearance-none border border-transparent bg-white px-5 pr-14 text-[16px] font-light tracking-[0.01em] text-[#171a22] outline-none transition focus:border-[#e3d7d1]"
          >
            <option value="" disabled>
              {copy.placeholder}
            </option>
            {languageOptions.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center">
            <div className="flex h-8 w-8 items-center justify-center border border-[#ece3de] bg-[#faf5f1]">
              <span className="block h-2.5 w-2.5 rotate-45 border-b border-r border-[#8f8078]" />
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 border border-[#f2d3cd] bg-[#fff7f5] px-4 py-3 text-sm font-light text-[#ad2218]">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleContinue}
        disabled={!selectedLanguage || isPending}
        className={`mt-6 flex h-13 w-full items-center justify-center border text-[15px] font-light tracking-[0.12em] transition ${
          selectedLanguage && !isPending
            ? "border-[#ad2218] bg-[linear-gradient(180deg,#c32a1f_0%,#ad2218_100%)] text-white hover:brightness-[0.98]"
            : "pointer-events-none border-[#e7ddd8] bg-[#eee6e1] text-[#aa9c95]"
        }`}
      >
        {isPending ? copy.saving : copy.submit}
      </button>
    </div>
  );
}
