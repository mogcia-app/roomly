import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { GuestChatExperience } from "@/components/guest/GuestChatExperience";
import {
  isGuestLanguage,
  type GuestLanguage,
} from "@/lib/guest-demo";
import { getGuestThreadStateFromStore } from "@/lib/guest-chat-data";
import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
import { getGuestLanguageCookieName } from "@/lib/guest-language-cookie";
import { getGuestRichMenuByHotelId } from "@/lib/guest-rich-menu";
import { resolveGuestAccess } from "@/lib/server/room-token";

type GuestChatPageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{
    debug?: string;
    lang?: string;
    mode?: string;
    thread?: string;
  }>;
};

function summarizeKnowledgeCounts(
  knowledge: NonNullable<Awaited<ReturnType<typeof getGuestActiveStayStatusFromStore>>>["hearingSheetKnowledge"],
) {
  return {
    frontDeskHours: knowledge?.frontDeskHours.length ?? 0,
    wifi: knowledge?.wifi.length ?? 0,
    breakfast: knowledge?.breakfast.length ?? 0,
    baths: knowledge?.baths.length ?? 0,
    facilities: knowledge?.facilities.length ?? 0,
    facilityLocations: knowledge?.facilityLocations.length ?? 0,
    amenities: knowledge?.amenities.length ?? 0,
    parking: knowledge?.parking.length ?? 0,
    emergency: knowledge?.emergency.length ?? 0,
    faq: knowledge?.faq.length ?? 0,
    checkout: knowledge?.checkout.length ?? 0,
    roomService: knowledge?.roomService.length ?? 0,
    transport: knowledge?.transport.length ?? 0,
    nearbySpots: knowledge?.nearbySpots.length ?? 0,
  };
}

function getLanguageSettingsLabel(language: GuestLanguage) {
  if (language === "en") {
    return "Language";
  }

  if (language === "zh-CN") {
    return "语言";
  }

  if (language === "zh-TW") {
    return "語言";
  }

  if (language === "ko") {
    return "언어";
  }

  return "言語";
}

function getLanguageShortLabel(language: GuestLanguage) {
  if (language === "en") {
    return "En";
  }

  if (language === "zh-CN") {
    return "Zh";
  }

  if (language === "zh-TW") {
    return "Tw";
  }

  if (language === "ko") {
    return "Ko";
  }

  return "Ja";
}

export default async function GuestChatPage({
  params,
  searchParams,
}: GuestChatPageProps) {
  const { roomId: accessToken } = await params;
  const { debug, lang, mode, thread: threadId } = await searchParams;

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
  const sessionLanguage = isGuestLanguage(lang)
    ? lang
    : isGuestLanguage(storedLanguage)
      ? storedLanguage
      : null;

  const room = await getGuestActiveStayStatusFromStore(
    access.roomId,
    sessionLanguage,
    access.hotelId,
  );

  if (!room) {
    console.warn("[guest/page] no active stay for chat page", {
      roomId: access.roomId,
      source: access.source,
      hotelId: access.hotelId,
      language: sessionLanguage,
    });
    redirect(`/guest/${access.accessToken}/unavailable${debug === "1" ? "?debug=1" : ""}`);
  }

  const currentLanguage = sessionLanguage ?? room.selectedLanguage ?? "ja";

  const currentMode = mode === "human" ? "human" : "ai";
  const languageSettingsHref = `/guest/${access.accessToken}/language${debug === "1" ? "?debug=1" : ""}`;
  const debugInfo = debug === "1"
    ? {
        accessSource: access.source,
        accessHotelId: access.hotelId,
        resolvedHotelId: room.hotelId ?? null,
        roomId: room.roomId,
        roomLabel: room.roomLabel,
        stayId: room.stayId ?? null,
        selectedLanguage: room.selectedLanguage ?? null,
        knowledgeCounts: summarizeKnowledgeCounts(room.hearingSheetKnowledge),
      }
    : null;
  const [threadState, richMenu] = await Promise.all([
    getGuestThreadStateFromStore(room, currentMode, threadId ?? null),
    getGuestRichMenuByHotelId(room.hotelId),
  ]);

  return (
    <div className="min-h-screen bg-[#f4f5f8]">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-[#f6efe8] shadow-[0_0_0_1px_rgba(0,0,0,0.03)] lg:max-w-none lg:shadow-none">
        <header className="border-b border-[#eadfd9] bg-[#fbf7f3] text-[#171a22]">
          <div className="px-4 py-3 lg:px-8">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white ring-1 ring-[#efe5de]">
                  <img
                    src="/icon.png?v=2"
                    alt="Roomly icon"
                    width={28}
                    height={28}
                    className="h-7 w-7 object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-light tracking-[0.04em] text-[#171a22]">
                    Roomly<span className="text-[#ad2218]">.</span>
                  </div>
                  {process.env.NODE_ENV === "production" ? (
                    <div className="mt-0.5 truncate text-[12px] font-light text-[#8f8078]">
                      {room.hotelName}
                    </div>
                  ) : null}
                </div>
              </div>
              <Link
                href={languageSettingsHref}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#e4d8d1] bg-white px-3 py-2 text-[12px] font-light text-[#6f564b] transition-colors hover:bg-[#f7f1ec]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="h-4 w-4 text-[#9c7b6d]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 2.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 0 0 0-15Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.9 7.5h14.2M2.9 12.5h14.2M10 2.8c1.9 1.9 3 4.5 3 7.2s-1.1 5.3-3 7.2m0-14.4C8.1 4.7 7 7.3 7 10s1.1 5.3 3 7.2" />
                </svg>
                <span>{getLanguageSettingsLabel(currentLanguage)}</span>
                <span className="text-[#b49a8d]">{getLanguageShortLabel(currentLanguage)}</span>
              </Link>
            </div>
          </div>
        </header>

        <GuestChatExperience
          key={`${currentMode}:${threadState.messages.at(-1)?.id ?? "empty"}:${threadState.messages.length}`}
          roomId={access.accessToken}
          hotelName={room.hotelName}
          roomLabel={room.roomLabel}
          richMenu={richMenu}
          language={currentLanguage}
          mode={currentMode}
          knowledge={room.hearingSheetKnowledge}
          prompts={room.hearingSheetPrompts}
          initialMessages={threadState.messages}
          clearThreadQueryOnMount={Boolean(threadId)}
          debugInfo={debugInfo}
        />
      </main>
    </div>
  );
}
