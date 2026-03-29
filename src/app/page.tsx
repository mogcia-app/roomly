import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8efec_0%,#ffffff_40%,#f3efec_100%)] text-[#241714]">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-6">
        <section className="rounded-[32px] border border-[#edd9d5] bg-white px-5 py-7 shadow-[0_18px_80px_rgba(90,59,41,0.1)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#ad2218]">
            Roomly
          </div>

          <h1 className="mt-4 text-3xl font-semibold leading-[1.2] tracking-tight text-[#261915]">
            フロントに
            <br />
            連絡できます
          </h1>

          <p className="mt-3 text-sm leading-7 text-[#72574d]">
            言語を選んで、そのままチャットを開始してください。
          </p>

          <div className="mt-6 grid gap-3">
            <Link
              href="/guest/203/language"
              className="flex h-14 items-center justify-center rounded-full bg-[#ad2218] px-6 text-base font-semibold text-white transition hover:bg-[#941b13]"
            >
              言語選択へ進む
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
