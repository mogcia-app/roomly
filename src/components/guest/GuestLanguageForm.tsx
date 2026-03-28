"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  getGuestLanguageLabel,
  type GuestLanguage,
} from "@/lib/guest-demo";

type GuestLanguageFormProps = {
  roomId: string;
  roomLabel: string;
  hotelName: string;
  initialLanguage: GuestLanguage | null;
  languages: GuestLanguage[];
};

export function GuestLanguageForm({
  roomId,
  roomLabel,
  hotelName,
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
      router.push(`/guest/${roomId}/chat`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-[32px] bg-white p-6 shadow-[0_20px_80px_rgba(90,59,41,0.12)]">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#ad2218]">
        {hotelName}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#251815]">
        言語を選択してください
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#70574d]">
        チャットまたは通話でフロントに連絡できます。アプリのインストールは不要です。
      </p>

      <div className="mt-5 flex items-center gap-2 text-sm text-[#7b6359]">
        <div className="rounded-full bg-[#fff3ef] px-3 py-1.5 font-medium text-[#8f5148]">
          {roomLabel}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#ad2218]" />
          <span>客室QRを確認済み</span>
        </div>
      </div>

      <div className="mt-6">
        <label
          htmlFor="guest-language"
          className="mb-2 block pl-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a6157]"
        >
          言語
        </label>
        <div className="relative rounded-[26px] border border-[#eaded9] bg-[#fbf8f6] p-1.5 shadow-[0_8px_24px_rgba(90,59,41,0.04)]">
          <select
            id="guest-language"
            value={selectedLanguage ?? ""}
            onChange={(event) => {
              const value = event.target.value as GuestLanguage | "";
              setSelectedLanguage(value === "" ? null : value);
            }}
            className="h-[58px] w-full appearance-none rounded-[22px] border border-transparent bg-white px-4 pr-12 text-[16px] font-medium text-[#251815] outline-none transition focus:border-[#ead2cc] focus:bg-white"
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
          <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-sm text-[#9a6157]">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#fff3ef]">
              <span className="translate-y-[-1px]">▾</span>
            </div>
          </div>
        </div>
        <p className="mt-2 pl-1 text-sm text-[#7b6359]">
          選択した言語でAI応答と通訳通話を利用します。
        </p>
      </div>

      {error ? (
        <div className="mt-4 rounded-[20px] border border-[#f0c8c2] bg-[#fff3ef] px-4 py-3 text-sm text-[#8e2219]">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleContinue}
        disabled={!selectedLanguage || isPending}
        className={`mt-6 flex h-14 w-full items-center justify-center rounded-full text-base font-semibold transition ${
          selectedLanguage && !isPending
            ? "bg-[#ad2218] text-white hover:bg-[#941b13]"
            : "pointer-events-none bg-[#eaded9] text-[#9c857b]"
        }`}
      >
        {isPending ? "保存中..." : "次へ進む"}
      </button>
    </div>
  );
}
