import { type ManualTranslations, requestHumanHandoff } from "@/lib/guest-chat-data";
import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
import { resolveGuestAccess } from "@/lib/server/room-token";

export const runtime = "nodejs";

type HandoffPayload = {
  category?: string;
  prompt?: string;
  translations?: ManualTranslations;
};

export async function POST(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/handoff">,
) {
  try {
    const { roomId: accessToken } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as HandoffPayload;
    let access;

    try {
      access = await resolveGuestAccess(accessToken);
    } catch (error) {
      console.error("[guest/handoff] invalid room token", {
        tokenPreview: accessToken.slice(0, 24),
        error,
      });
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

    const result = await requestHumanHandoff(stayStatus, {
      category: payload.category,
      initialPrompt: payload.prompt ?? null,
      promptTranslations: payload.translations,
      forceNewThread: Boolean(payload.prompt?.trim()),
    });

    return Response.json({
      ok: result.ok,
      threadId: result.threadId,
      mode: result.resolvedMode,
      messages: result.messages,
    });
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
