import { notFound, redirect } from "next/navigation";

import { getGuestRoomContextFromStore } from "@/lib/guest-data";

type GuestEntryPageProps = {
  params: Promise<{ roomId: string }>;
};

export default async function GuestEntryPage({ params }: GuestEntryPageProps) {
  const { roomId } = await params;
  const room = await getGuestRoomContextFromStore(roomId);

  if (!room) {
    notFound();
  }

  if (room.stayActive) {
    redirect(`/guest/${roomId}/language`);
  }

  redirect(`/guest/${roomId}/survey`);
}
