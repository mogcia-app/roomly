import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { GuestChatExperience } from "@/components/guest/GuestChatExperience";
import {
  isGuestLanguage,
} from "@/lib/guest-demo";
import { getGuestMessagesFromStore } from "@/lib/guest-chat-data";
import { getGuestStayStatusFromStore } from "@/lib/guest-data";
import { getGuestLanguageCookieName } from "@/lib/guest-language-cookie";
import { getGuestRichMenuByHotelId } from "@/lib/guest-rich-menu";
import { resolveGuestAccess } from "@/lib/server/room-token";

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
  const { roomId: accessToken } = await params;
  const { lang, mode } = await searchParams;

  let access;

  try {
    access = await resolveGuestAccess(accessToken);
  } catch (error) {
    console.error("[guest/page] failed to resolve chat access", {
      tokenPreview: accessToken.slice(0, 24),
      hasRoomQrSigningSecret: Boolean(process.env.ROOM_QR_SIGNING_SECRET?.trim()),
      error,
    });
    notFound();
  }

  if (!access) {
    notFound();
  }

  const cookieStore = await cookies();
  const storedLanguage = cookieStore.get(getGuestLanguageCookieName(access.accessToken))?.value;
  const currentLanguage = isGuestLanguage(lang)
    ? lang
    : isGuestLanguage(storedLanguage)
      ? storedLanguage
      : null;

  if (!currentLanguage) {
    redirect(`/guest/${access.accessToken}/language`);
  }

  const room = await getGuestStayStatusFromStore(
    access.roomId,
    currentLanguage,
    access.hotelId,
  );

  if (!room) {
    console.error("[guest/page] chat stay status not found", {
      roomId: access.roomId,
      source: access.source,
      hotelId: access.hotelId,
      language: currentLanguage,
    });
    notFound();
  }

  const currentMode = mode === "human" ? "human" : "ai";
  const [thread, richMenu] = await Promise.all([
    getGuestMessagesFromStore(room, currentMode),
    getGuestRichMenuByHotelId(room.hotelId),
  ]);

  return (
    <div className="min-h-screen bg-[#f4f5f8]">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-[#f6efe8] shadow-[0_0_0_1px_rgba(0,0,0,0.03)] lg:max-w-none lg:shadow-none">
        <header className="relative overflow-hidden border-b border-[#e3d9d3] bg-[linear-gradient(180deg,#faf6f2_0%,#f1e8e1_100%)] text-[#171a22]">
          <div className="relative px-4 pb-4 pt-3 lg:px-8 lg:pb-5 lg:pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-white shadow-[0_10px_24px_rgba(62,39,28,0.08)] ring-1 ring-[#ebe1dc]">
                  <img
                    src="/icon.png?v=2"
                    alt="Roomly icon"
                    width={28}
                    height={28}
                    className="h-7 w-7 object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-light tracking-[0.04em] text-[#171a22] lg:text-base">
                    Roomly<span className="text-[#ad2218]">.</span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] font-light text-[#8f8078] lg:text-xs">
                    Guest Front Desk Chat
                  </div>
                  {process.env.NODE_ENV === "production" ? (
                    <div className="mt-2 truncate text-[13px] font-light text-[#ad2218] lg:text-sm">
                      {room.hotelName}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0" />
            </div>

          </div>
        </header>

        <GuestChatExperience
          key={`${currentMode}:${thread.at(-1)?.id ?? "empty"}:${thread.length}`}
          roomId={access.accessToken}
          roomLabel={room.roomLabel}
          richMenu={richMenu}
          language={currentLanguage}
          mode={currentMode}
          prompts={room.hearingSheetPrompts}
          initialMessages={thread}
        />
      </main>
    </div>
  );
}
