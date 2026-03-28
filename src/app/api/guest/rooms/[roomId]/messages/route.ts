import { getGuestStayStatusFromStore } from "@/lib/guest-data";
import { getStoredGuestLanguage } from "@/lib/guest-language-cookie";
import { postGuestMessageToStore } from "@/lib/guest-chat-data";

type GuestMessagePayload = {
  body?: string;
  mode?: "ai" | "human";
};

export async function POST(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/messages">,
) {
  const { roomId } = await context.params;
  const payload = (await request.json()) as GuestMessagePayload;

  if (!payload.body?.trim()) {
    return Response.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
  }

  const mode = payload.mode === "human" ? "human" : "ai";
  const storedLanguage = await getStoredGuestLanguage(roomId);
  const stayStatus = await getGuestStayStatusFromStore(roomId, storedLanguage);

  if (!stayStatus) {
    return Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
  }

  if (!stayStatus.stayActive) {
    return Response.json({ error: "STAY_INACTIVE" }, { status: 409 });
  }

  const result = await postGuestMessageToStore(stayStatus, mode, payload.body);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true, threadId: result.threadId });
}
