import {
  getStoredGuestLanguage,
  setStoredGuestLanguage,
} from "@/lib/guest-language-cookie";
import {
  isGuestLanguage,
} from "@/lib/guest-demo";
import { getGuestStayStatusFromStore } from "@/lib/guest-data";

export async function POST(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/language">,
) {
  const { roomId } = await context.params;
  const body = (await request.json()) as { language?: string };

  if (!isGuestLanguage(body.language)) {
    return Response.json(
      { error: "INVALID_LANGUAGE" },
      { status: 400 },
    );
  }

  const currentLanguage = await getStoredGuestLanguage(roomId);
  const stayStatus = await getGuestStayStatusFromStore(roomId, currentLanguage);

  if (!stayStatus) {
    return Response.json(
      { error: "ROOM_NOT_FOUND" },
      { status: 404 },
    );
  }

  if (!stayStatus.stayActive) {
    return Response.json(
      { error: "STAY_INACTIVE" },
      { status: 409 },
    );
  }

  await setStoredGuestLanguage(roomId, body.language);

  return Response.json({
    ok: true,
    roomId,
    language: body.language,
  });
}
