import {
  endGuestCallSession,
  getGuestCallSession,
} from "@/lib/guest-call-data";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/guest/calls/[callId]">,
) {
  const { callId } = await context.params;
  const session = await getGuestCallSession(callId);

  if (!session) {
    return Response.json({ error: "CALL_NOT_FOUND" }, { status: 404 });
  }

  return Response.json(session);
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/guest/calls/[callId]">,
) {
  const { callId } = await context.params;
  const payload = (await request.json().catch(() => ({}))) as {
    action?: "end";
  };

  if (payload.action !== "end") {
    return Response.json({ error: "INVALID_ACTION" }, { status: 400 });
  }

  const result = await endGuestCallSession(callId);

  return Response.json(result);
}
