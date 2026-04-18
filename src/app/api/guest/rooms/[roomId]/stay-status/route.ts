import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
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

  const stayStatus = await getGuestActiveStayStatusFromStore(
    access.roomId,
    null,
    access.hotelId,
  );

  if (!stayStatus) {
    return Response.json(
      { error: "ACTIVE_STAY_NOT_FOUND" },
      { status: 409 },
    );
  }

  return Response.json({
    ...stayStatus,
    available: true,
    guestLanguage: stayStatus.selectedLanguage ?? "ja",
    translationEnabled: stayStatus.translationEnabled ?? (stayStatus.selectedLanguage !== "ja"),
    room: {
      roomId: stayStatus.roomId,
      roomNumber: stayStatus.roomNumber ?? null,
      displayName: stayStatus.roomDisplayName ?? stayStatus.roomLabel,
    },
  });
}
