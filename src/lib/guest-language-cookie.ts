import { cookies } from "next/headers";

import { isGuestLanguage, type GuestLanguage } from "@/lib/guest-demo";

export function getGuestLanguageCookieName(roomId: string) {
  return `roomly_guest_lang_${roomId}`;
}

export async function getStoredGuestLanguage(roomId: string) {
  const cookieStore = await cookies();
  const value = cookieStore.get(getGuestLanguageCookieName(roomId))?.value;

  return isGuestLanguage(value) ? value : null;
}

export async function setStoredGuestLanguage(
  roomId: string,
  language: GuestLanguage,
) {
  const cookieStore = await cookies();

  cookieStore.set(getGuestLanguageCookieName(roomId), language, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}
