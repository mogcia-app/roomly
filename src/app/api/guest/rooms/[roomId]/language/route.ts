import {
  getStoredGuestLanguage,
  setStoredGuestLanguage,
} from "@/lib/guest-language-cookie";
import {
  isGuestLanguage,
} from "@/lib/guest-demo";
import { getGuestStayStatusFromStore } from "@/lib/guest-data";
import { resolveGuestAccess } from "@/lib/server/room-token";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/language">,
) {
  const { roomId: accessToken } = await context.params;
  const body = (await request.json()) as { language?: string };

  if (!isGuestLanguage(body.language)) {
    return Response.json(
      { error: "INVALID_LANGUAGE" },
      { status: 400 },
    );
  }

  let access;

  try {
    access = await resolveGuestAccess(accessToken);
  } catch {
    return Response.json(
      { error: "INVALID_ROOM_TOKEN" },
      { status: 401 },
    );
  }

  if (!access) {
    return Response.json(
      { error: "ROOM_NOT_FOUND" },
      { status: 404 },
    );
  }

  const currentLanguage = await getStoredGuestLanguage(access.accessToken);
  const stayStatus = await getGuestStayStatusFromStore(
    access.roomId,
    currentLanguage,
    access.hotelId,
  );

  if (!stayStatus) {
    return Response.json(
      { error: "ROOM_NOT_FOUND" },
      { status: 404 },
    );
  }

  await setStoredGuestLanguage(access.accessToken, body.language);

  return Response.json({
    ok: true,
    language: body.language,
  });
}
