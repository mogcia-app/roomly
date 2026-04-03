import { notFound, redirect } from "next/navigation";

import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
import { resolveGuestAccess } from "@/lib/server/room-token";

type GuestEntryPageProps = {
  params: Promise<{ roomId: string }>;
};

export default async function GuestEntryPage({ params }: GuestEntryPageProps) {
  const { roomId: accessToken } = await params;

  let access;

  try {
    access = await resolveGuestAccess(accessToken);
  } catch (error) {
    console.error("[guest/page] failed to resolve guest entry access", {
      tokenPreview: accessToken.slice(0, 24),
      hasRoomQrSigningSecret: Boolean(process.env.ROOM_QR_SIGNING_SECRET?.trim()),
      error,
    });
    notFound();
  }

  if (!access) {
    notFound();
  }

  const stayStatus = await getGuestActiveStayStatusFromStore(access.roomId, null, access.hotelId);

  if (!stayStatus) {
    console.warn("[guest/page] no active stay for guest entry", {
      roomId: access.roomId,
      source: access.source,
      hotelId: access.hotelId,
    });
    redirect(`/guest/${access.accessToken}/unavailable`);
  }

  redirect(`/guest/${access.accessToken}/language`);
}
