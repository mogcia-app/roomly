import { notFound, redirect } from "next/navigation";

import { GuestEmergencyForm } from "@/components/guest/GuestEmergencyForm";
import { GuestShell } from "@/components/guest/GuestShell";
import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
import { resolveGuestAccess } from "@/lib/server/room-token";

type GuestEmergencyPageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ debug?: string }>;
};

export default async function GuestEmergencyPage({
  params,
  searchParams,
}: GuestEmergencyPageProps) {
  const { roomId: accessToken } = await params;
  const { debug } = await searchParams;

  let access;

  try {
    access = await resolveGuestAccess(accessToken);
  } catch (error) {
    console.error("[guest/page] failed to resolve emergency access", {
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
    console.warn("[guest/page] no active stay for emergency page", {
      roomId: access.roomId,
      source: access.source,
      hotelId: access.hotelId,
    });
    redirect(`/guest/${access.accessToken}/unavailable${debug === "1" ? "?debug=1" : ""}`);
  }

  return (
    <GuestShell accent>
      <GuestEmergencyForm
        roomId={access.accessToken}
        roomLabel={room.roomLabel}
        hotelName={room.hotelName}
        initialLanguage={room.selectedLanguage}
      />
    </GuestShell>
  );
}
