import { notFound, redirect } from "next/navigation";

import { GuestChatExperience } from "@/components/guest/GuestChatExperience";
import { localizeGuideLabels, resolveGuestConversationView } from "@/lib/guest-chat-data";
import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
import { getGuestRichMenuByHotelId } from "@/lib/guest-rich-menu";
import { resolveGuestAccess } from "@/lib/server/room-token";

type GuestChatPageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{
    debug?: string;
    lang?: string;
    languageUpdated?: string;
    mode?: string;
    thread?: string;
    updatedMessages?: string;
  }>;
};

type GuestThreadMeta = {
  handoffStatus: "none" | "requested" | "accepted" | null;
  unreadCountGuest: number | null;
  unreadCountFront: number | null;
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

export default async function GuestChatPage({
  params,
  searchParams,
}: GuestChatPageProps) {
  const { roomId: accessToken } = await params;
  const {
    debug,
    languageUpdated,
    mode,
    thread: threadId,
    updatedMessages,
  } = await searchParams;

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

  const room = await getGuestActiveStayStatusFromStore(
    access.roomId,
    null,
    access.hotelId,
  );

  if (!room) {
    console.warn("[guest/page] no active stay for chat page", {
      roomId: access.roomId,
      source: access.source,
      hotelId: access.hotelId,
    });
    redirect(`/guest/${access.accessToken}/unavailable${debug === "1" ? "?debug=1" : ""}`);
  }

  const currentLanguage = room.selectedLanguage ?? "ja";
  const debugInfo = debug === "1"
    ? {
        accessSource: access.source,
        accessHotelId: access.hotelId,
        resolvedHotelId: room.hotelId ?? null,
        roomId: room.roomId,
        roomLabel: room.roomLabel,
        stayId: room.stayId ?? null,
        selectedLanguage: room.selectedLanguage ?? null,
        handoffStatus: room.handoffStatus ?? null,
        unreadCountGuest: room.unreadCountGuest ?? null,
        unreadCountFront: room.unreadCountFront ?? null,
        knowledgeCounts: summarizeKnowledgeCounts(room.hearingSheetKnowledge),
      }
    : null;
  const guideLabelSources = [
    ...(room.hearingSheetKnowledge?.faq ?? []).flatMap((entry) =>
      entry.question?.trim() ? [entry.question.trim()] : []
    ),
    ...room.hearingSheetPrompts
      .map((prompt) => prompt.trim())
      .filter((prompt) => prompt.length > 0),
  ];
  const [threadState, richMenu, localizedGuideLabels] = await Promise.all([
    resolveGuestConversationView(room, {
      requestedMode: mode === "human" ? "human" : mode === "ai" ? "ai" : null,
      threadId: threadId ?? null,
    }),
    getGuestRichMenuByHotelId(room.hotelId),
    localizeGuideLabels(guideLabelSources, currentLanguage),
  ]);

  return (
    <div className="h-[100dvh] overflow-hidden bg-[#f4f5f8]">
      <main className="mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-[#f6efe8] shadow-[0_0_0_1px_rgba(0,0,0,0.03)] lg:max-w-none lg:shadow-none">
        <GuestChatExperience
          key={`${threadState.mode}:${threadState.messages.at(-1)?.id ?? "empty"}:${threadState.messages.length}`}
          roomId={access.accessToken}
          hotelName={room.hotelName}
          richMenu={richMenu}
          language={currentLanguage}
          knowledge={room.hearingSheetKnowledge}
          prompts={room.hearingSheetPrompts}
          localizedGuideLabels={localizedGuideLabels}
          initialMessages={threadState.messages}
          initialMode={threadState.mode}
          initialThreadId={threadState.threadId}
          initialThreadMeta={threadState.meta as GuestThreadMeta}
          clearThreadQueryOnMount={Boolean(threadId)}
          languageUpdateNotice={{
            active: languageUpdated === "1",
            updatedMessages: Number.parseInt(updatedMessages ?? "0", 10) || 0,
          }}
          debugInfo={debugInfo}
        />
      </main>
    </div>
  );
}
