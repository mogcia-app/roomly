import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { GuestChatExperience } from "@/components/guest/GuestChatExperience";
import {
  getGuestLanguageLabel,
  isGuestLanguage,
} from "@/lib/guest-demo";
import { getGuestMessagesFromStore } from "@/lib/guest-chat-data";
import { getGuestStayStatusFromStore } from "@/lib/guest-data";
import { getGuestLanguageCookieName } from "@/lib/guest-language-cookie";

type GuestChatPageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{
    lang?: string;
    mode?: string;
  }>;
};

export default async function GuestChatPage({
  params,
  searchParams,
}: GuestChatPageProps) {
  const { roomId } = await params;
  const { lang, mode } = await searchParams;

  const cookieStore = await cookies();
  const storedLanguage = cookieStore.get(getGuestLanguageCookieName(roomId))?.value;
  const currentLanguage = isGuestLanguage(lang)
    ? lang
    : isGuestLanguage(storedLanguage)
      ? storedLanguage
      : null;

  if (!currentLanguage) {
    redirect(`/guest/${roomId}/language`);
  }

  const room = await getGuestStayStatusFromStore(roomId, currentLanguage);

  if (!room) {
    notFound();
  }

  if (!room.stayActive) {
    redirect(`/guest/${roomId}/survey`);
  }

  const currentMode = mode === "human" ? "human" : "ai";
  const thread = await getGuestMessagesFromStore(room, currentMode);

  return (
    <div className="min-h-screen bg-[#f3efec]">
      <main className="flex min-h-screen w-full flex-col bg-[#efeae2]">
        <header className="border-b border-black/5 bg-white">
          <div className="flex items-center justify-between px-4 py-3 lg:px-6 lg:py-2.5">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-[#1c1c1c] lg:text-[14px]">
                Roomly
              </div>
              <div className="mt-0.5 truncate text-[11px] text-black/45 lg:text-[10px]">
                {room.roomLabel} ・ {getGuestLanguageLabel(currentLanguage)}
              </div>
            </div>
            <Link
              href={`/guest/${roomId}/language`}
              className="shrink-0 rounded-full border border-[#eaded9] px-3 py-1.5 text-[12px] font-medium text-[#5d463d]"
            >
              言語変更
            </Link>
          </div>
        </header>

        <GuestChatExperience
          key={`${currentMode}:${thread.at(-1)?.id ?? "empty"}:${thread.length}`}
          roomId={roomId}
          mode={currentMode}
          prompts={room.hearingSheetPrompts}
          initialMessages={thread}
        />
      </main>
    </div>
  );
}
