import { markThreadMessagesReadByGuest } from "@/lib/guest-chat-data";
import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
import { resolveGuestAccess } from "@/lib/server/room-token";

export const runtime = "nodejs";

type MarkGuestReadPayload = {
  threadId?: string;
  messageIds?: string[];
};

export async function POST(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/read">,
) {
  try {
    const { roomId: accessToken } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as MarkGuestReadPayload;

    let access;

    try {
      access = await resolveGuestAccess(accessToken);
    } catch {
      return Response.json({ error: "INVALID_ROOM_TOKEN" }, { status: 401 });
    }

    if (!access) {
      return Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }

    const stayStatus = await getGuestActiveStayStatusFromStore(
      access.roomId,
      null,
      access.hotelId,
    );

    if (!stayStatus) {
      return Response.json({ error: "ACTIVE_STAY_NOT_FOUND" }, { status: 409 });
    }

    if (!payload.threadId?.trim()) {
      return Response.json({ error: "THREAD_ID_REQUIRED" }, { status: 400 });
    }

    const result = await markThreadMessagesReadByGuest(
      payload.threadId,
      Array.isArray(payload.messageIds)
        ? payload.messageIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : undefined,
    );

    return Response.json({
      ok: result.ok,
      threadId: payload.threadId,
      updatedCount: result.updatedCount,
    });
  } catch (error) {
    console.error("[guest/thread-read] failed", { error });
    return Response.json({ error: "MARK_READ_FAILED" }, { status: 500 });
  }
}
