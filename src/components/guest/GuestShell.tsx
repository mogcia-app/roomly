import type { ReactNode } from "react";

type GuestShellProps = {
  accent?: boolean;
  children: ReactNode;
};

export function GuestShell({ accent = false, children }: GuestShellProps) {
  return (
    <div className="min-h-screen bg-[#f4f5f8] text-[#171a22]">
      <div
        className={`mx-auto flex min-h-screen w-full max-w-md flex-col bg-white px-0 shadow-[0_30px_80px_rgba(32,42,67,0.10)] md:my-6 md:min-h-[calc(100vh-3rem)] ${
          accent ? "rounded-none md:rounded-[24px]" : "rounded-none md:rounded-[38px]"
        }`}
      >
        <div
          className={`px-5 py-4 ${
            accent
              ? "border-b border-[#ebe1dc] bg-white text-[#171a22]"
              : "border-b border-[#eef0f5] bg-white text-[#171a22]"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-[15px] bg-white ring-1 ring-[#eef0f5]">
              <img
                src="/icon.png?v=2"
                alt="Roomly icon"
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
              />
            </div>
            <div>
              <div className="text-sm font-light tracking-[0.04em] text-[#171a22]">Roomly.</div>
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
