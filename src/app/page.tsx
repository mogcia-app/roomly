import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

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
    <div className="min-h-screen bg-[#f5efe8] text-[#2d211d]">
      <main className="relative mx-auto flex min-h-screen w-full max-w-md items-center overflow-hidden px-5 py-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 top-8 h-40 rounded-full bg-[#ad2218]/10 blur-3xl"
        />
        <section className="relative w-full overflow-hidden rounded-[38px] border border-[#e8dbd0] bg-[linear-gradient(180deg,#fbf7f2_0%,#f5efe8_100%)] px-7 pb-8 pt-6 shadow-[0_28px_80px_rgba(92,52,36,0.12)]">
          <div className="relative flex min-h-[calc(100vh-8.5rem)] flex-col justify-between py-8">
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
              <p className="mt-3 text-[15px] font-light leading-7 text-[#8f7567]">
                -泊まる人も、迎える人も、もっと心地よく-
              </p>

              <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-[#e6d5ca] bg-white/70 px-4 py-2 text-[11px] tracking-[0.18em] text-[#ad2218] uppercase">
                Smart Guest Support
              </div>

              <h1 className="mt-7 text-[1.6rem] font-light leading-[1.22] tracking-[-0.03em] text-[#2d211d]">
                客室からそのまま
                <br />
                フロントにつながる
              </h1>

              <div className="mx-auto mt-5 max-w-[18rem] rounded-[22px] border border-[#eadccf] bg-white px-5 py-4 text-[14px] leading-7 text-[#7e6558]">
                チャットで依頼 翻訳でサポート
                <br />
                滞在中のやり取りをもっと自然に
              </div>
            </div>

            <div className="space-y-4 pt-10">
              <Link
                href={startHref}
                className="flex h-14 items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#c83024_0%,#ad2218_100%)] text-[15px] font-light tracking-[0.16em] text-white transition hover:translate-y-[-1px] hover:brightness-[1.01]"
              >
                START
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
