import { notFound, redirect } from "next/navigation";

import { getGuestRoomContextFromStore } from "@/lib/guest-data";
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

  const room = await getGuestRoomContextFromStore(access.roomId);

  if (!room) {
    console.error("[guest/page] room context not found", {
      roomId: access.roomId,
      source: access.source,
      hotelId: access.hotelId,
    });
    notFound();
  }

  redirect(`/guest/${access.accessToken}/language`);
}
