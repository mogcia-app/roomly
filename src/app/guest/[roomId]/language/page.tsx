import { notFound } from "next/navigation";

import { GuestLanguageForm } from "@/components/guest/GuestLanguageForm";
import { GuestShell } from "@/components/guest/GuestShell";
import { type GuestLanguage } from "@/lib/guest-demo";
import { getGuestStayStatusFromStore } from "@/lib/guest-data";
import { getStoredGuestLanguage } from "@/lib/guest-language-cookie";

type GuestLanguagePageProps = {
  params: Promise<{ roomId: string }>;
};

const languages: GuestLanguage[] = ["ja", "en", "zh-CN", "ko"];

export default async function GuestLanguagePage({
  params,
}: GuestLanguagePageProps) {
  const { roomId } = await params;
  const storedLanguage = await getStoredGuestLanguage(roomId);
  const room = await getGuestStayStatusFromStore(roomId, storedLanguage);

  if (!room) {
    notFound();
  }

  return (
    <GuestShell accent>
      <main className="flex flex-1 flex-col">
        <GuestLanguageForm
          roomId={roomId}
          roomLabel={room.roomLabel}
          hotelName={room.hotelName}
          initialLanguage={room.selectedLanguage}
          languages={languages}
        />
      </main>
    </GuestShell>
  );
}
