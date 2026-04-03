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
  } catch {
    notFound();
  }

  if (!access) {
    notFound();
  }

  const room = await getGuestRoomContextFromStore(access.roomId);

  if (!room) {
    notFound();
  }

  if (room.stayActive) {
    redirect(`/guest/${accessToken}/language`);
  }

  redirect(`/guest/${accessToken}/survey`);
}
