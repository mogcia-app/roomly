"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { GuestLanguage } from "@/lib/guest-demo";

type GuestEmergencyFormProps = {
  roomId: string;
  roomLabel: string;
  hotelName: string;
  initialLanguage: GuestLanguage | null;
};

function getEmergencyPageCopy(language: GuestLanguage | null) {
  if (language === "en") {
    return {
      title: "Emergency contact",
      body: "Describe what happened. This message will be sent directly to the front desk with translation for staff.",
      placeholder: "Example: I feel very sick and cannot stand up. Please come to room 203.",
      submit: "Send urgently",
      sending: "Sending...",
      back: "Back to chat",
      categoryLabel: "Type",
      error: "Emergency message could not be sent. Please try again.",
      categories: [
        { value: "emergency_medical", label: "Medical" },
        { value: "emergency_fire", label: "Fire / Accident" },
        { value: "emergency_safety", label: "Safety" },
        { value: "emergency_other", label: "Other" },
      ],
    };
  }

  if (language === "zh-CN") {
    return {
      title: "紧急联系",
      body: "请写下发生了什么。消息会直接发送给前台，并附带给工作人员的翻译。",
      placeholder: "例如：我身体很不舒服，站不起来。请到203房间来。",
      submit: "紧急发送",
      sending: "发送中...",
      back: "返回聊天",
      categoryLabel: "类型",
      error: "无法发送紧急消息，请重试。",
      categories: [
        { value: "emergency_medical", label: "身体不适" },
        { value: "emergency_fire", label: "火灾 / 事故" },
        { value: "emergency_safety", label: "安全问题" },
        { value: "emergency_other", label: "其他" },
      ],
    };
  }

  if (language === "zh-TW") {
    return {
      title: "緊急聯絡",
      body: "請寫下發生了什麼。訊息會直接傳送到前台，並附上給工作人員的翻譯。",
      placeholder: "例如：我身體很不舒服，站不起來。請到203房間來。",
      submit: "緊急送出",
      sending: "傳送中...",
      back: "返回聊天",
      categoryLabel: "類型",
      error: "無法送出緊急訊息，請再試一次。",
      categories: [
        { value: "emergency_medical", label: "身體不適" },
        { value: "emergency_fire", label: "火災 / 事故" },
        { value: "emergency_safety", label: "安全問題" },
        { value: "emergency_other", label: "其他" },
      ],
    };
  }

  if (language === "ko") {
    return {
      title: "긴급 연락",
      body: "무슨 일이 있었는지 적어 주세요. 이 내용은 직원이 읽을 수 있도록 번역과 함께 프런트에 바로 전달됩니다.",
      placeholder: "예: 몸이 너무 아프고 일어설 수 없습니다. 203호로 와 주세요.",
      submit: "긴급 전송",
      sending: "전송 중...",
      back: "채팅으로 돌아가기",
      categoryLabel: "유형",
      error: "긴급 메시지를 보내지 못했습니다. 다시 시도해 주세요.",
      categories: [
        { value: "emergency_medical", label: "건강 이상" },
        { value: "emergency_fire", label: "화재 / 사고" },
        { value: "emergency_safety", label: "안전 문제" },
        { value: "emergency_other", label: "기타" },
      ],
    };
  }

  return {
    title: "緊急連絡",
    body: "何が起きたかを書いて送信してください。スタッフ向け翻訳付きで、そのままフロントへ届きます。",
    placeholder: "例: 気分が悪くて立てません。203号室に来てください。",
    submit: "緊急送信",
    sending: "送信中...",
    back: "チャットへ戻る",
    categoryLabel: "内容",
    error: "緊急メッセージを送信できませんでした。再度お試しください。",
    categories: [
      { value: "emergency_medical", label: "体調不良" },
      { value: "emergency_fire", label: "火災・事故" },
      { value: "emergency_safety", label: "安全トラブル" },
      { value: "emergency_other", label: "その他" },
    ],
  };
}

export function GuestEmergencyForm({
  roomId,
  roomLabel,
  hotelName,
  initialLanguage,
}: GuestEmergencyFormProps) {
  const router = useRouter();
  const copy = getEmergencyPageCopy(initialLanguage);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(copy.categories[0]?.value ?? "emergency_other");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit() {
    const trimmed = message.trim();

    if (!trimmed || isPending) {
      return;
    }

    setError(null);

    try {
      const response = await fetch(`/api/guest/rooms/${roomId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: trimmed,
          mode: "human",
          category,
        }),
      });

      if (!response.ok) {
        setError(copy.error);
        return;
      }

      startTransition(() => {
        router.push(`/guest/${roomId}/chat?mode=human`);
        router.refresh();
      });
    } catch {
      setError(copy.error);
    }
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      <div className="border border-[#f0d7d3] bg-[#fff7f5] px-6 py-7 shadow-[0_20px_60px_rgba(108,26,26,0.10)]">
        <div className="border-b border-[#f0d7d3] pb-6 text-center">
          <p className="text-[10px] font-light uppercase tracking-[0.26em] text-[#ad2218]">
            {hotelName}
          </p>
          <h1 className="mt-3 text-[1.65rem] font-light tracking-[-0.04em] text-[#171a22]">
            {copy.title}
          </h1>
          <p className="mx-auto mt-2 max-w-[18rem] text-[13px] font-light leading-6 text-[#8f8078]">
            {copy.body}
          </p>
        </div>

        <div className="mt-5 flex items-center justify-between border-b border-[#f0d7d3] pb-5 text-[11px] font-light uppercase tracking-[0.18em] text-[#9a8b83]">
          <span>{roomLabel}</span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 bg-[#ad2218]" />
            <span>Emergency</span>
          </span>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-[10px] font-light uppercase tracking-[0.22em] text-[#9a8b83]">
            {copy.categoryLabel}
          </div>
          <div className="flex flex-wrap gap-2">
            {copy.categories.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setCategory(entry.value)}
                className={`rounded-full border px-3.5 py-2 text-[12px] font-light ${
                  category === entry.value
                    ? "border-[#ad2218] bg-[#ad2218] text-white"
                    : "border-[#e7ddd8] bg-white text-[#7a554a]"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <textarea
            rows={6}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={copy.placeholder}
            className="w-full rounded-[24px] border border-[#ead6d2] bg-white px-4 py-3 text-base font-light leading-6 text-[#2d211d] outline-none"
          />
        </div>

        {error ? (
          <div className="mt-4 border border-[#f2d3cd] bg-white px-4 py-3 text-sm font-light text-[#ad2218]">
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            disabled={!message.trim() || isPending}
            onClick={() => {
              void handleSubmit();
            }}
            className="flex h-14 items-center justify-center border border-[#981d15] bg-[#ad2218] text-base font-light text-white disabled:opacity-60"
          >
            {isPending ? copy.sending : copy.submit}
          </button>
          <button
            type="button"
            onClick={() => {
              router.push(`/guest/${roomId}/chat`);
            }}
            className="flex h-14 items-center justify-center border border-[#eaded9] text-base font-light text-[#4d3730]"
          >
            {copy.back}
          </button>
        </div>
      </div>
    </div>
  );
}
