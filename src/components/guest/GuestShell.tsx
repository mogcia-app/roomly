import type { ReactNode } from "react";

type GuestShellProps = {
  accent?: boolean;
  children: ReactNode;
};

export function GuestShell({ accent = false, children }: GuestShellProps) {
  return (
    <div className="min-h-screen bg-[#b7d78a] text-[#1f1715]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-[#efeae2] px-0 shadow-[0_0_0_1px_rgba(0,0,0,0.03)]">
        <div
          className={`px-4 py-3 ${
            accent
              ? "bg-[#ad2218] text-white"
              : "border-b border-black/5 bg-[#ffffff] text-[#1c1c1c]"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ad2218] text-sm font-semibold text-white">
              R
            </div>
            <div>
              <div className="text-sm font-semibold">Roomly</div>
              <div className="text-xs text-black/55">
                AI通訳つきホテルチャット
              </div>
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
