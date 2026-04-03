import Link from "next/link";
import { notFound } from "next/navigation";

import { GuestShell } from "@/components/guest/GuestShell";
import { resolveGuestAccess } from "@/lib/server/room-token";

type GuestUnavailablePageProps = {
  params: Promise<{ roomId: string }>;
};

export default async function GuestUnavailablePage({
  params,
}: GuestUnavailablePageProps) {
  const { roomId: accessToken } = await params;

  try {
    await resolveGuestAccess(accessToken);
  } catch (error) {
    console.error("[guest/page] failed to resolve unavailable access", {
      tokenPreview: accessToken.slice(0, 24),
      hasRoomQrSigningSecret: Boolean(process.env.ROOM_QR_SIGNING_SECRET?.trim()),
      error,
    });
    notFound();
  }

  return (
    <GuestShell>
      <main className="flex flex-1 flex-col justify-center">
        <section className="rounded-[32px] border border-[#eaded9] bg-white p-6 shadow-[0_20px_80px_rgba(90,59,41,0.1)]">
          <p className="text-xs font-light uppercase tracking-[0.3em] text-[#ad2218]">
            QR Unavailable
          </p>
          <h1 className="mt-3 text-3xl font-light tracking-[-0.03em] text-[#251815]">
            現在このQRは利用できません
          </h1>
          <p className="mt-3 text-sm font-light leading-6 text-[#70574d]">
            この客室に紐づくご滞在情報が見つかりません。フロントへお声がけください。
          </p>

          <div className="mt-5 grid gap-3">
            <Link
              href="/"
              className="flex h-14 items-center justify-center rounded-full bg-[#ad2218] text-base font-light text-white"
            >
              Roomlyトップへ戻る
            </Link>
          </div>
        </section>
      </main>
    </GuestShell>
  );
}
