import { isGuestLanguage, type GuestLanguage } from "@/lib/guest-demo";

export type GuestLanguageUpdateResult = {
  ok: boolean;
  guestLanguage: GuestLanguage;
  threadId: string | null;
  updatedMessages: number;
};

export async function updateGuestLanguage(roomId: string, guestLanguage: GuestLanguage) {
  const response = await fetch(`/api/guest/rooms/${roomId}/language`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      language: guestLanguage,
    }),
  });

  const payload = response.ok
    ? await response.json() as {
        language?: string;
        threadId?: string | null;
        updatedMessages?: number;
        thread?: {
          guestLanguage?: string;
          threadId?: string | null;
          updatedMessages?: number;
        };
      }
    : null;
  const resolvedLanguage =
    payload?.thread?.guestLanguage ??
    payload?.language;

  return {
    ok: response.ok && isGuestLanguage(resolvedLanguage),
    guestLanguage: isGuestLanguage(resolvedLanguage) ? resolvedLanguage : guestLanguage,
    threadId: payload?.thread?.threadId ?? payload?.threadId ?? null,
    updatedMessages:
      typeof payload?.thread?.updatedMessages === "number"
        ? payload.thread.updatedMessages
        : typeof payload?.updatedMessages === "number"
          ? payload.updatedMessages
          : 0,
  } satisfies GuestLanguageUpdateResult;
}
