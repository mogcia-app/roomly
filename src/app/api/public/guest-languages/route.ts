import { GUEST_LANGUAGE_OPTIONS } from "@/lib/guest-languages";
import { fetchGuestLanguageOptionsFromApi } from "@/lib/server/guest-language-api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const guestLanguages = await fetchGuestLanguageOptionsFromApi();

    if (guestLanguages) {
      return Response.json({ guestLanguages });
    }
  } catch (error) {
    console.warn("[guest/languages] falling back to local options", { error });
  }

  return Response.json({
    guestLanguages: GUEST_LANGUAGE_OPTIONS,
  });
}
