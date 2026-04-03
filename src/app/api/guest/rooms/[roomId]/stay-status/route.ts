import { getStoredGuestLanguage } from "@/lib/guest-language-cookie";
import { getGuestStayStatusFromStore } from "@/lib/guest-data";
import { resolveGuestAccess } from "@/lib/server/room-token";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/stay-status">,
) {
  const { roomId: accessToken } = await context.params;

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

  const selectedLanguage = await getStoredGuestLanguage(access.accessToken);
  const stayStatus = await getGuestStayStatusFromStore(
    access.roomId,
    selectedLanguage,
    access.hotelId,
  );

  if (!stayStatus) {
    return Response.json(
      { error: "ROOM_NOT_FOUND" },
      { status: 404 },
    );
  }

  return Response.json(stayStatus);
}
