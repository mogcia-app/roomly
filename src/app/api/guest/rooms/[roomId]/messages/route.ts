import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
import {
  postGuestAiMessageToStore,
  postGuestAiStarterToStore,
  postGuestMessageToStore,
  resolveGuestConversationView,
} from "@/lib/guest-chat-data";
import { resolveGuestAccess } from "@/lib/server/room-token";

export const runtime = "nodejs";

type ManualTranslationsPayload = Partial<Record<"ja" | "en" | "zh-CN" | "zh-TW" | "ko", string>>;

type GuestMessagePayload = {
  body?: string;
  guestLanguage?: string;
  imageAlt?: string;
  imageUrl?: string;
  category?: string;
  mode?: "ai" | "human";
  kind?: "guest_message" | "ai_starter" | "ai_message";
  protectedTerms?: string[];
  translations?: ManualTranslationsPayload;
};

export async function GET(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/messages">,
) {
  try {
    const { roomId: accessToken } = await context.params;
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") === "human" ? "human" : "ai";
    const threadId = searchParams.get("thread");
    let access;

    try {
      access = await resolveGuestAccess(accessToken);
    } catch (error) {
      console.error("[guest/messages:get] invalid room token", {
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

    const threadState = await resolveGuestConversationView(stayStatus, {
      requestedMode: mode,
      threadId: threadId?.trim() ? threadId : null,
    });

    return Response.json({
      ok: true,
      mode: threadState.mode,
      threadId: threadState.threadId,
      messages: threadState.messages,
      meta: threadState.meta,
    });
  } catch (error) {
    console.error("[guest/messages:get] failed", { error });

    return Response.json({ error: "MESSAGE_FETCH_FAILED" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/messages">,
) {
  try {
    const { roomId: accessToken } = await context.params;
    const payload = (await request.json()) as GuestMessagePayload;

    if (!payload.body?.trim() && !payload.imageUrl?.trim()) {
      return Response.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
    }

    const mode = payload.mode === "human" ? "human" : "ai";
    let access;

    try {
      access = await resolveGuestAccess(accessToken);
    } catch (error) {
      console.error("[guest/messages] invalid room token", {
        tokenPreview: accessToken.slice(0, 24),
        error,
      });
      return Response.json({ error: "INVALID_ROOM_TOKEN" }, { status: 401 });
    }

    if (!access) {
      return Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }

    const protectedTerms = Array.isArray(payload.protectedTerms)
      ? payload.protectedTerms.filter((term): term is string => typeof term === "string" && term.trim().length > 0)
      : undefined;
    const stayStatus = await getGuestActiveStayStatusFromStore(
      access.roomId,
      null,
      access.hotelId,
    );

    if (!stayStatus) {
      return Response.json({ error: "ACTIVE_STAY_NOT_FOUND" }, { status: 409 });
    }

    const result = payload.kind === "ai_starter"
      ? await postGuestAiStarterToStore(stayStatus, payload.body ?? "", {
          protectedTerms,
          translations: payload.translations,
        })
      : payload.kind === "ai_message"
        ? await postGuestAiMessageToStore(
            stayStatus,
            payload.body,
            payload.imageUrl,
            payload.imageAlt,
            payload.category,
            {
              protectedTerms,
              translations: payload.translations,
            },
          )
        : await postGuestMessageToStore(stayStatus, mode, payload.body ?? "", {
            category: payload.category ?? null,
          });

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({
      ok: true,
      threadId: result.threadId,
      mode: "resolvedMode" in result ? result.resolvedMode : mode,
      messages: "messages" in result ? result.messages : [],
    });
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
