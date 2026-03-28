import { requestHumanHandoff } from "@/lib/guest-chat-data";
import { getGuestStayStatusFromStore } from "@/lib/guest-data";
import { getStoredGuestLanguage } from "@/lib/guest-language-cookie";

export const runtime = "nodejs";

type HandoffPayload = {
  category?: string;
};

export async function POST(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/handoff">,
) {
  try {
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
  } catch (error) {
    console.error("[guest/handoff] failed", {
      hasServiceAccountJson: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
      hasAdminProjectId: Boolean(process.env.FIREBASE_ADMIN_PROJECT_ID),
      hasAdminClientEmail: Boolean(process.env.FIREBASE_ADMIN_CLIENT_EMAIL),
      hasAdminPrivateKey: Boolean(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
      error,
    });

    return Response.json({ error: "HANDOFF_FAILED" }, { status: 500 });
  }
}
