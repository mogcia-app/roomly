import { getGuestStayStatusFromStore } from "@/lib/guest-data";
import { getStoredGuestLanguage } from "@/lib/guest-language-cookie";
import { startGuestCallSession } from "@/lib/guest-call-data";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/calls">,
) {
  const { roomId } = await context.params;
  const storedLanguage = await getStoredGuestLanguage(roomId);
  const stayStatus = await getGuestStayStatusFromStore(roomId, storedLanguage);

  if (!stayStatus) {
    return Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
  }

  if (!stayStatus.stayActive) {
    return Response.json({ error: "STAY_INACTIVE" }, { status: 409 });
  }

  const result = await startGuestCallSession(stayStatus);

  return Response.json({
    ok: result.ok,
    callId: result.callId,
    threadId: result.threadId,
    status: result.status,
  });
}
