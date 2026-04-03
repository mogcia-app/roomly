import Link from "next/link";
import { notFound } from "next/navigation";

import { GuestShell } from "@/components/guest/GuestShell";
import { getGuestRoomContextFromStore } from "@/lib/guest-data";
import { resolveGuestAccess } from "@/lib/server/room-token";

type GuestSurveyPageProps = {
  params: Promise<{ roomId: string }>;
};

export default async function GuestSurveyPage({ params }: GuestSurveyPageProps) {
  const { roomId: accessToken } = await params;

  let access;

  try {
    access = await resolveGuestAccess(accessToken);
  } catch {
    notFound();
  }

  if (!access) {
    notFound();
  }

  const room = await getGuestRoomContextFromStore(access.roomId);

  if (!room) {
    notFound();
  }

  return (
    <GuestShell>
      <main className="flex flex-1 flex-col justify-center">
        <section className="rounded-[32px] border border-[#eaded9] bg-white p-6 shadow-[0_20px_80px_rgba(90,59,41,0.1)]">
          <p className="text-xs font-light uppercase tracking-[0.3em] text-[#ad2218]">
            ご宿泊ありがとうございました
          </p>
          <h1 className="mt-3 text-3xl font-light tracking-[-0.03em] text-[#251815]">
            ご感想をお聞かせください
          </h1>
          <p className="mt-3 text-sm font-light leading-6 text-[#70574d]">
            この客室は現在ご滞在中ではありません。チェックアウト後のアンケートにご協力ください。
          </p>

          <div className="mt-6 flex gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-full border border-[#eaded9] text-lg font-light text-[#7d6158] transition hover:border-[#ad2218] hover:text-[#ad2218]"
              >
                {value}
              </button>
            ))}
          </div>

          <textarea
            rows={4}
            placeholder="ご意見・ご感想（任意）"
            className="mt-5 w-full rounded-[24px] border border-[#eaded9] px-4 py-3 text-sm font-light text-[#2d211d] outline-none"
          />

          <div className="mt-5 grid gap-3">
            <button
              type="button"
              className="flex h-14 items-center justify-center rounded-full bg-[#ad2218] text-base font-light text-white"
            >
              送信する
            </button>
            <Link
              href="/"
              className="flex h-14 items-center justify-center rounded-full border border-[#eaded9] text-base font-light text-[#4d3730]"
            >
              Roomlyトップへ戻る
            </Link>
          </div>
        </section>
      </main>
    </GuestShell>
  );
}
