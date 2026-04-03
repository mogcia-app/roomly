import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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

    startHref = `/guest/${encodeURIComponent(access.accessToken)}`;
  }

  return (
    <div className="min-h-screen bg-[#f4f5f8] text-[#171a22]">
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-5 py-6">
        <section className="w-full rounded-[38px] bg-white px-7 pb-8 pt-6 shadow-[0_30px_80px_rgba(32,42,67,0.10)]">
          <div className="flex min-h-[calc(100vh-8.5rem)] flex-col justify-between py-8">
            <div className="pt-6 text-center">
              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[30px] bg-white ring-1 ring-[#eef0f5]">
                <img
                  src="/icon1.png?v=2"
                  alt="Roomly icon"
                  width={88}
                  height={88}
                  className="h-[88px] w-[88px] object-contain"
                />
              </div>

              <div className="mt-8 text-[2.35rem] font-light tracking-[0.04em] text-[#171a22]">
                <span>Roomly</span>
                <span className="text-[#ad2218]">.</span>
              </div>
              <p className="mt-3 text-[15px] font-light leading-7 text-[#8b92a3]">
                Better way to reach your front desk
              </p>

              <h1 className="mt-12 text-[1.85rem] font-light leading-[1.18] tracking-[-0.04em] text-[#171a22]">
                客室からそのまま
                <br />
                フロントにつながる
              </h1>
            </div>

            <div className="space-y-4 pt-10">
              <Link
                href={startHref}
                className="flex h-14 items-center justify-center rounded-none bg-[linear-gradient(180deg,#c32a1f_0%,#ad2218_100%)] text-[15px] font-light tracking-[0.16em] text-white transition hover:brightness-[0.98]"
              >
                START
              </Link>
              <div className="px-5 py-4 text-center text-[13px] font-light leading-6 text-[#8b92a3]">
                アプリ不要
                <br />
                客室QRを読み込むだけで
                <br />
                そのままフロントとのチャットを開始できます
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
