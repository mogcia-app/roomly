import { postFrontdeskMessageToStore } from "@/lib/guest-chat-data";

export const runtime = "nodejs";

type ManualTranslationsPayload = Partial<Record<"ja" | "en" | "zh-CN" | "zh-TW" | "ko", string>>;

type FrontdeskReplyPayload = {
  body?: string;
  imageUrl?: string;
  imageAlt?: string;
  translations?: ManualTranslationsPayload;
};

function isAuthorized(request: Request) {
  const expectedToken = process.env.FRONTDESK_API_BEARER_TOKEN?.trim();

  if (!expectedToken) {
    console.error("[admin/frontdesk-message] FRONTDESK_API_BEARER_TOKEN missing");
    return { ok: false as const, status: 500, error: "AUTH_CONFIG_MISSING" };
  }

  const authorization = request.headers.get("authorization")?.trim();

  if (authorization !== `Bearer ${expectedToken}`) {
    return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  }

  return { ok: true as const };
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/admin/guest-threads/[threadId]/messages">,
) {
  const auth = isAuthorized(request);

  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { threadId } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as FrontdeskReplyPayload;

    if (!threadId?.trim()) {
      return Response.json({ error: "THREAD_ID_REQUIRED" }, { status: 400 });
    }

    if (!payload.body?.trim() && !payload.imageUrl?.trim()) {
      return Response.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
    }

    const result = await postFrontdeskMessageToStore(threadId, payload.body ?? "", {
      imageUrl: payload.imageUrl?.trim() || null,
      imageAlt: payload.imageAlt?.trim() || null,
      manualTranslations: payload.translations,
    });

    if (!result.ok) {
      const status =
        result.error === "THREAD_NOT_FOUND" ? 404 :
        result.error === "THREAD_ROOM_NOT_FOUND" ? 409 :
        400;

      return Response.json({ error: result.error }, { status });
    }

    return Response.json({
      ok: true,
      threadId: result.threadId,
      messageId: result.messageId ?? null,
      message: result.message,
    });
  } catch (error) {
    console.error("[admin/frontdesk-message] failed", { error });
    return Response.json({ error: "FRONTDESK_MESSAGE_FAILED" }, { status: 500 });
  }
}
