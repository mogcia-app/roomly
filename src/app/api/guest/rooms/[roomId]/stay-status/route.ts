import { getStoredGuestLanguage } from "@/lib/guest-language-cookie";
import { getGuestStayStatusFromStore } from "@/lib/guest-data";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/stay-status">,
) {
  const { roomId } = await context.params;
  const selectedLanguage = await getStoredGuestLanguage(roomId);
  const stayStatus = await getGuestStayStatusFromStore(roomId, selectedLanguage);

  if (!stayStatus) {
    return Response.json(
      { error: "ROOM_NOT_FOUND" },
      { status: 404 },
    );
  }

  return Response.json(stayStatus);
}
