import { requestHumanHandoff } from "@/lib/guest-chat-data";
import { getGuestStayStatusFromStore } from "@/lib/guest-data";
import { getStoredGuestLanguage } from "@/lib/guest-language-cookie";

type HandoffPayload = {
  category?: string;
};

export async function POST(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/handoff">,
) {
  const { roomId } = await context.params;
  const payload = (await request.json().catch(() => ({}))) as HandoffPayload;
  const storedLanguage = await getStoredGuestLanguage(roomId);
  const stayStatus = await getGuestStayStatusFromStore(roomId, storedLanguage);

  if (!stayStatus) {
    return Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
  }

  if (!stayStatus.stayActive) {
    return Response.json({ error: "STAY_INACTIVE" }, { status: 409 });
  }

  const result = await requestHumanHandoff(stayStatus, payload.category);

  return Response.json({ ok: result.ok, threadId: result.threadId });
}
