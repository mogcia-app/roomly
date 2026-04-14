import {
  getStoredGuestLanguage,
  setStoredGuestLanguage,
} from "@/lib/guest-language-cookie";
import {
  isGuestLanguage,
} from "@/lib/guest-demo";
import { updateGuestThreadLanguage } from "@/lib/guest-chat-data";
import { getGuestActiveStayStatusFromStore } from "@/lib/guest-data";
import { syncGuestLanguageToFrontdeskApi } from "@/lib/server/guest-language-api";
import { resolveGuestAccess } from "@/lib/server/room-token";

export const runtime = "nodejs";

async function handleGuestLanguageUpdate(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/language">,
) {
  const { roomId: accessToken } = await context.params;
  const body = (await request.json()) as { language?: string };

  if (!isGuestLanguage(body.language)) {
    return Response.json(
      { error: "INVALID_LANGUAGE" },
      { status: 400 },
    );
  }

  let access;

  try {
    access = await resolveGuestAccess(accessToken);
  } catch {
    return Response.json(
      { error: "INVALID_ROOM_TOKEN" },
      { status: 401 },
    );
  }

  if (!access) {
    return Response.json(
      { error: "ROOM_NOT_FOUND" },
      { status: 404 },
    );
  }

  const currentLanguage = await getStoredGuestLanguage(access.accessToken);
  const stayStatus = await getGuestActiveStayStatusFromStore(
    access.roomId,
    currentLanguage,
    access.hotelId,
  );

  if (!stayStatus) {
    return Response.json(
      { error: "ACTIVE_STAY_NOT_FOUND" },
      { status: 409 },
    );
  }

  await setStoredGuestLanguage(access.accessToken, body.language);
  const threadUpdate = await updateGuestThreadLanguage(stayStatus, body.language);
  let syncedThreadId = threadUpdate.threadId;
  let syncedStayId = stayStatus.stayId ?? null;
  let updatedMessages = 0;

  if (threadUpdate.threadId) {
    try {
      const syncResult = await syncGuestLanguageToFrontdeskApi({
        threadId: threadUpdate.threadId,
        guestLanguage: body.language,
        retranslateHistory: true,
      });

      if (syncResult) {
        syncedThreadId = syncResult.threadId;
        syncedStayId = syncResult.stayId;
        updatedMessages = syncResult.updatedMessages;
      }
    } catch (error) {
      console.warn("[guest/language] frontdesk sync failed; using local update only", {
        threadId: threadUpdate.threadId,
        language: body.language,
        error,
      });
    }
  }

  return Response.json({
    ok: true,
    language: body.language,
    threadUpdated: threadUpdate.updated,
    threadId: syncedThreadId,
    threadMode: threadUpdate.mode,
    updatedMessages,
    thread: {
      threadId: syncedThreadId,
      stayId: syncedStayId,
      guestLanguage: body.language,
      updatedMessages,
    },
  });
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/language">,
) {
  return handleGuestLanguageUpdate(request, context);
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/guest/rooms/[roomId]/language">,
) {
  return handleGuestLanguageUpdate(request, context);
}
