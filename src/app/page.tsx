import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
import type { GuestLanguage } from "@/lib/guest-demo";
import { resolveGuestAccess } from "@/lib/server/room-token";

type HomePageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const { token } = await searchParams;
  const trimmedToken = token?.replace(/\s+/g, "").trim();
  let startHref = "/guest/203/language";
  let language: GuestLanguage = "ja";

  if (trimmedToken) {
    let access;

    try {
      access = await resolveGuestAccess(trimmedToken);
    } catch (error) {
      console.error("[guest/page] failed to resolve access token on home", {
        tokenPreview: trimmedToken.slice(0, 24),
        hasRoomQrSigningSecret: Boolean(process.env.ROOM_QR_SIGNING_SECRET?.trim()),
        error,
      });
      notFound();
    }

    const stayStatus = await getGuestActiveStayStatusFromStore(
      access.roomId,
      null,
      access.hotelId,
    );

    if (stayStatus?.selectedLanguage) {
      language = stayStatus.selectedLanguage;
    }

    const nextSearchParams = new URLSearchParams();
    nextSearchParams.set("lang", language);
    startHref = `/guest/${encodeURIComponent(access.accessToken)}?${nextSearchParams.toString()}`;
  }

  const copy = getHomeCopy(language);

  return (
    <div className="min-h-svh bg-[#f5efe8] text-[#2d211d] supports-[min-height:100dvh]:min-h-dvh">
      <main className="relative mx-auto flex min-h-svh w-full max-w-md items-center overflow-hidden px-5 py-6 supports-[min-height:100dvh]:min-h-dvh">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 top-8 h-40 rounded-full bg-[#ad2218]/10 blur-3xl"
        />
        <section className="relative w-full overflow-hidden rounded-[38px] border border-[#e8dbd0] bg-[linear-gradient(180deg,#fbf7f2_0%,#f5efe8_100%)] px-7 pb-8 pt-6 shadow-[0_28px_80px_rgba(92,52,36,0.12)]">
          <div className="relative flex min-h-[calc(100svh-8.5rem)] flex-col justify-between py-8 supports-[min-height:100dvh]:min-h-[calc(100dvh-8.5rem)]">
            <div className="pt-6 text-center">
              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[30px] bg-white/85 shadow-[0_18px_45px_rgba(173,34,24,0.08)] ring-1 ring-[#ead9ce] backdrop-blur-sm">
                <Image
                  src="/icon1.png"
                  alt="Roomly icon"
                  width={88}
                  height={88}
                  className="h-[88px] w-[88px] object-contain"
                />
              </div>

              <div className="mt-8 text-[2.35rem] font-light tracking-[0.04em] text-[#2d211d]">
                <span>Roomly</span>
                <span className="text-[#ad2218]">.</span>
              </div>
              <p className="mt-3 text-[13px] font-light leading-6 text-[#8f7567] sm:text-[14px]">
                {copy.tagline}
              </p>

              <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-[#e6d5ca] bg-white/70 px-4 py-2 text-[11px] tracking-[0.18em] text-[#ad2218] uppercase">
                {copy.badge}
              </div>

              <h1 className="mt-7 text-[1.6rem] font-light leading-[1.22] tracking-[-0.03em] text-[#2d211d]">
                {copy.titleLine1}
                <br />
                {copy.titleLine2}
              </h1>

              <div className="mx-auto mt-5 max-w-[18rem] rounded-[22px] border border-[#eadccf] bg-white px-5 py-4 text-[14px] leading-7 text-[#7e6558]">
                {copy.bodyLine1}
                <br />
                {copy.bodyLine2}
              </div>
            </div>

            <div className="space-y-4 pt-10">
              <Link
                href={startHref}
                className="flex h-14 items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#c83024_0%,#ad2218_100%)] text-[15px] font-light tracking-[0.16em] text-white transition hover:translate-y-[-1px] hover:brightness-[1.01]"
              >
                {copy.cta}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function getHomeCopy(language: GuestLanguage) {
  if (language === "en") {
    return {
      tagline: "For guests and staff, a more comfortable stay",
      badge: "Smart Guest Support",
      titleLine1: "Connect to the front desk",
      titleLine2: "directly from your room",
      bodyLine1: "Make requests by chat, with translation support",
      bodyLine2: "for smoother communication during your stay",
      cta: "START",
    };
  }

  if (language === "zh-CN") {
    return {
      tagline: "让住客与酒店员工都更舒适",
      badge: "Smart Guest Support",
      titleLine1: "可直接从客房",
      titleLine2: "联系前台",
      bodyLine1: "通过聊天提出需求，翻译辅助沟通",
      bodyLine2: "让入住期间交流更加自然",
      cta: "开始",
    };
  }

  if (language === "zh-TW") {
    return {
      tagline: "讓住客與飯店人員都更舒適",
      badge: "Smart Guest Support",
      titleLine1: "可直接從客房",
      titleLine2: "聯繫櫃台",
      bodyLine1: "透過聊天提出需求，翻譯協助溝通",
      bodyLine2: "讓住宿期間交流更自然",
      cta: "開始",
    };
  }

  if (language === "ko") {
    return {
      tagline: "투숙객과 직원 모두에게 더 편안한 숙박",
      badge: "Smart Guest Support",
      titleLine1: "객실에서 바로",
      titleLine2: "프런트와 연결됩니다",
      bodyLine1: "채팅으로 요청하고 번역으로 지원받아",
      bodyLine2: "숙박 중 소통을 더 자연스럽게",
      cta: "시작",
    };
  }

  return {
    tagline: "-泊まる人も、迎える人も、もっと心地よく-",
    badge: "Smart Guest Support",
    titleLine1: "客室からそのまま",
    titleLine2: "フロントにつながる",
    bodyLine1: "チャットで依頼 翻訳でサポート",
    bodyLine2: "滞在中のやり取りをもっと自然に",
    cta: "START",
  };
}
