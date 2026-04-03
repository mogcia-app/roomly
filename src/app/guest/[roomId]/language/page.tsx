import { notFound, redirect } from "next/navigation";

import { GuestLanguageForm } from "@/components/guest/GuestLanguageForm";
import { GuestShell } from "@/components/guest/GuestShell";
import { type GuestLanguage } from "@/lib/guest-demo";
import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
import { getStoredGuestLanguage } from "@/lib/guest-language-cookie";
import { resolveGuestAccess } from "@/lib/server/room-token";

type GuestLanguagePageProps = {
  params: Promise<{ roomId: string }>;
};

const languages: GuestLanguage[] = ["ja", "en", "zh-CN", "ko"];

export default async function GuestLanguagePage({
  params,
}: GuestLanguagePageProps) {
  const { roomId: accessToken } = await params;

  let access;

  try {
    access = await resolveGuestAccess(accessToken);
  } catch (error) {
    console.error("[guest/page] failed to resolve language access", {
      tokenPreview: accessToken.slice(0, 24),
      hasRoomQrSigningSecret: Boolean(process.env.ROOM_QR_SIGNING_SECRET?.trim()),
      error,
    });
    notFound();
  }

  if (!access) {
    notFound();
  }

  const storedLanguage = await getStoredGuestLanguage(access.accessToken);
  const room = await getGuestActiveStayStatusFromStore(
    access.roomId,
    storedLanguage,
    access.hotelId,
  );

  if (!room) {
    console.warn("[guest/page] no active stay for language page", {
      roomId: access.roomId,
      source: access.source,
      hotelId: access.hotelId,
    });
    redirect(`/guest/${access.accessToken}/unavailable`);
  }

  return (
    <GuestShell accent>
      <main className="flex flex-1 flex-col px-5 py-6">
        <GuestLanguageForm
          roomId={access.accessToken}
          roomLabel={room.roomLabel}
          hotelName={room.hotelName}
          showHotelName={process.env.NODE_ENV === "production"}
          initialLanguage={room.selectedLanguage}
          languages={languages}
        />
      </main>
    </GuestShell>
  );
}
