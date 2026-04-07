import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
import { getStoredGuestLanguage } from "@/lib/guest-language-cookie";
import {
  postGuestAiStarterToStore,
  postGuestMessageToStore,
} from "@/lib/guest-chat-data";
import { isGuestLanguage } from "@/lib/guest-demo";
import { resolveGuestAccess } from "@/lib/server/room-token";

export const runtime = "nodejs";

type GuestMessagePayload = {
  body?: string;
  guestLanguage?: string;
  mode?: "ai" | "human";
  kind?: "guest_message" | "ai_starter";
};

export async function POST(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/messages">,
) {
  try {
    const { roomId: accessToken } = await context.params;
    const payload = (await request.json()) as GuestMessagePayload;

    if (!payload.body?.trim()) {
      return Response.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
    }

    const mode = payload.mode === "human" ? "human" : "ai";
    let access;

    try {
      access = await resolveGuestAccess(accessToken);
    } catch {
      return Response.json({ error: "INVALID_ROOM_TOKEN" }, { status: 401 });
    }

    if (!access) {
      return Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }

    const storedLanguage = await getStoredGuestLanguage(access.accessToken);
    const requestedLanguage = isGuestLanguage(payload.guestLanguage)
      ? payload.guestLanguage
      : null;
    const stayStatus = await getGuestActiveStayStatusFromStore(
      access.roomId,
      storedLanguage ?? requestedLanguage,
      access.hotelId,
    );

    if (!stayStatus) {
      return Response.json({ error: "ACTIVE_STAY_NOT_FOUND" }, { status: 409 });
    }

    const result = payload.kind === "ai_starter"
      ? await postGuestAiStarterToStore(stayStatus, payload.body)
      : await postGuestMessageToStore(stayStatus, mode, payload.body);

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ ok: true, threadId: result.threadId });
  } catch (error) {
    console.error("[guest/messages] failed", {
      hasServiceAccountJson: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
      hasAdminProjectId: Boolean(process.env.FIREBASE_ADMIN_PROJECT_ID),
      hasAdminClientEmail: Boolean(process.env.FIREBASE_ADMIN_CLIENT_EMAIL),
      hasAdminPrivateKey: Boolean(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
      error,
    });

    return Response.json({ error: "MESSAGE_POST_FAILED" }, { status: 500 });
  }
}
