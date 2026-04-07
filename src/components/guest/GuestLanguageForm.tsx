"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { getGuestLanguageLabel, type GuestLanguage } from "@/lib/guest-demo";

type GuestLanguageFormProps = {
  debug?: boolean;
  roomId: string;
  roomLabel: string;
  hotelName: string;
  showHotelName?: boolean;
  initialLanguage: GuestLanguage | null;
  languages: GuestLanguage[];
};

export function GuestLanguageForm({
  debug = false,
  roomId,
  roomLabel,
  hotelName,
  showHotelName = false,
  initialLanguage,
  languages,
}: GuestLanguageFormProps) {
  const router = useRouter();
  const [selectedLanguage, setSelectedLanguage] =
    useState<GuestLanguage | null>(initialLanguage);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleContinue() {
    if (!selectedLanguage) {
      return;
    }

    setError(null);

    const response = await fetch(`/api/guest/rooms/${roomId}/language`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        language: selectedLanguage,
      }),
    });

    if (!response.ok) {
      setError("言語設定を保存できませんでした。もう一度お試しください。");
      return;
    }

    startTransition(() => {
      router.push(`/guest/${roomId}/chat${debug ? "?debug=1" : ""}`);
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
          言語を選択してください
        </h1>
        <p className="mx-auto mt-2 max-w-[18rem] text-[13px] font-light leading-6 text-[#8f8078]">
          選択後すぐにフロントとのチャットを開始できます
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between border-b border-[#ebe1dc] pb-5 text-[11px] font-light uppercase tracking-[0.18em] text-[#9a8b83]">
        <span>{roomLabel}</span>
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 bg-[#ad2218]" />
          <span>Guest Access</span>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 text-[10px] font-light uppercase tracking-[0.22em] text-[#9a8b83]">
          Language
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
              言語を選択してください
            </option>
            {languages.map((language) => (
              <option key={language} value={language}>
                {getGuestLanguageLabel(language)}
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
        {isPending ? "保存中..." : "次へ進む"}
      </button>
    </div>
  );
}
