import { markGuestThreadMessagesRead } from "@/lib/guest-chat-data";

export const runtime = "nodejs";

type MarkReadPayload = {
  messageIds?: string[];
};

export async function POST(
  request: Request,
  context: RouteContext<"/api/admin/guest-threads/[threadId]/read">,
) {
  try {
    const { threadId } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as MarkReadPayload;

    if (!threadId?.trim()) {
      return Response.json({ error: "THREAD_ID_REQUIRED" }, { status: 400 });
    }

    const result = await markGuestThreadMessagesRead(
      threadId,
      Array.isArray(payload.messageIds)
        ? payload.messageIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : undefined,
    );

    return Response.json({
      ok: result.ok,
      threadId,
      updatedCount: result.updatedCount,
    });
  } catch (error) {
    console.error("[admin/guest-thread-read] failed", { error });

    return Response.json({ error: "MARK_READ_FAILED" }, { status: 500 });
  }
}
