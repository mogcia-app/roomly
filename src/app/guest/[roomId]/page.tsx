import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { GuestShell } from "@/components/guest/GuestShell";
import { getStoredGuestLanguage } from "@/lib/guest-language-cookie";
import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
import { isGuestLanguage, type GuestLanguage } from "@/lib/guest-demo";
import { resolveGuestAccess } from "@/lib/server/room-token";

type GuestEntryPageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ debug?: string; lang?: string }>;
};

function getEntryCopy(language: GuestLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Guest Access",
      title: "Welcome",
      body: "You can message the front desk and start the chat right away in your language.",
      cta: "Start chat",
      changeLanguage: "Change language",
    };
  }

  if (language === "zh-CN") {
    return {
      eyebrow: "住客入口",
      title: "欢迎使用",
      body: "您可以直接使用当前语言查看说明，并马上开始与前台聊天。",
      cta: "开始聊天",
      changeLanguage: "更改语言",
    };
  }

  if (language === "zh-TW") {
    return {
      eyebrow: "住客入口",
      title: "歡迎使用",
      body: "您可以直接以目前語言查看說明，並立即開始與前台聊天。",
      cta: "開始聊天",
      changeLanguage: "更改語言",
    };
  }

  if (language === "ko") {
    return {
      eyebrow: "게스트 입장",
      title: "환영합니다",
      body: "현재 언어로 안내를 확인하고 바로 프런트와 채팅을 시작할 수 있습니다.",
      cta: "채팅 시작",
      changeLanguage: "언어 변경",
    };
  }

  return {
    eyebrow: "Guest Access",
    title: "ようこそ",
    body: "このまま現在の言語で案内を確認し、そのままフロントとのチャットを開始できます。",
    cta: "チャットを始める",
    changeLanguage: "言語を変更",
  };
}

export default async function GuestEntryPage({
  params,
  searchParams,
}: GuestEntryPageProps) {
  const { roomId: accessToken } = await params;
  const { debug, lang } = await searchParams;

  let access;

  try {
    access = await resolveGuestAccess(accessToken);
  } catch (error) {
    console.error("[guest/page] failed to resolve guest entry access", {
      tokenPreview: accessToken.slice(0, 24),
      hasRoomQrSigningSecret: Boolean(process.env.ROOM_QR_SIGNING_SECRET?.trim()),
      error,
    });
    notFound();
  }

  if (!access) {
    notFound();
  }

  const storedLanguage = await getStoredGuestLanguage(access.accessToken);
  const preferredLanguage = isGuestLanguage(lang) ? lang : storedLanguage;
  const stayStatus = await getGuestActiveStayStatusFromStore(
    access.roomId,
    preferredLanguage,
    access.hotelId,
  );

  if (!stayStatus) {
    console.warn("[guest/page] no active stay for guest entry", {
      roomId: access.roomId,
      source: access.source,
      hotelId: access.hotelId,
    });
    redirect(`/guest/${access.accessToken}/unavailable${debug === "1" ? "?debug=1" : ""}`);
  }

  const currentLanguage = preferredLanguage ?? stayStatus.selectedLanguage ?? "ja";
  const copy = getEntryCopy(currentLanguage);
  const debugSuffix = debug === "1" ? "?debug=1" : "";

  return (
    <GuestShell accent>
      <main className="flex flex-1 flex-col justify-center px-5 py-6">
        <section className="rounded-[32px] border border-[#eaded9] bg-[linear-gradient(180deg,#fffdfb_0%,#faf5f1_100%)] p-6 shadow-[0_20px_80px_rgba(90,59,41,0.1)]">
          <p className="text-xs font-light uppercase tracking-[0.3em] text-[#ad2218]">
            {copy.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-light tracking-[-0.03em] text-[#251815]">
            {stayStatus.roomLabel}
          </h1>
          <p className="mt-2 text-lg font-light text-[#5d453d]">
            {copy.title}
          </p>
          <p className="mt-3 text-sm font-light leading-6 text-[#70574d]">
            {copy.body}
          </p>

          <div className="mt-6 grid gap-3">
            <Link
              href={`/guest/${access.accessToken}/chat${debugSuffix}`}
              className="flex h-14 items-center justify-center rounded-full bg-[#ad2218] text-base font-light text-white"
            >
              {copy.cta}
            </Link>
            <Link
              href={`/guest/${access.accessToken}/language${debugSuffix}`}
              className="flex h-12 items-center justify-center rounded-full border border-[#e7ddd8] bg-white text-sm font-light text-[#6f564b]"
            >
              {copy.changeLanguage}
            </Link>
          </div>
        </section>
      </main>
    </GuestShell>
  );
}
