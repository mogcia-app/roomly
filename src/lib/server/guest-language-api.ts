import { isGuestLanguage, type GuestLanguage } from "@/lib/guest-demo";
import {
  GUEST_LANGUAGE_OPTIONS,
} from "@/lib/guest-languages";

type RemoteGuestLanguageResponse = {
  guestLanguages?: Array<{
    value?: string;
    label?: string;
  }>;
};

type RemoteGuestLanguageUpdateResponse = {
  thread?: {
    threadId?: string | null;
    stayId?: string | null;
    guestLanguage?: string;
    updatedMessages?: number;
  };
};

function getFrontdeskApiConfig() {
  const baseUrl = process.env.FRONTDESK_API_BASE_URL?.trim();
  const bearerToken = process.env.FRONTDESK_API_BEARER_TOKEN?.trim();

  if (!baseUrl || !bearerToken) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    bearerToken,
  };
}

export async function fetchGuestLanguageOptionsFromApi() {
  const config = getFrontdeskApiConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(`${config.baseUrl}/api/public/guest-languages`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.bearerToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GUEST_LANGUAGE_OPTIONS_FETCH_FAILED:${response.status}`);
  }

  const payload = await response.json() as RemoteGuestLanguageResponse;
  const options =
    payload.guestLanguages?.flatMap((option) => {
      if (!isGuestLanguage(option.value) || typeof option.label !== "string") {
        return [];
      }

      const label = option.label.trim();

      return label
        ? [{ value: option.value, label }]
        : [];
    }) ?? [];

  return options.length > 0 ? options : GUEST_LANGUAGE_OPTIONS;
}

export async function syncGuestLanguageToFrontdeskApi({
  threadId,
  guestLanguage,
  retranslateHistory = true,
}: {
  threadId: string;
  guestLanguage: GuestLanguage;
  retranslateHistory?: boolean;
}) {
  const config = getFrontdeskApiConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(
    `${config.baseUrl}/api/frontdesk/threads/${encodeURIComponent(threadId)}/guest-language`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.bearerToken}`,
      },
      body: JSON.stringify({
        guestLanguage,
        retranslateHistory,
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`GUEST_LANGUAGE_SYNC_FAILED:${response.status}`);
  }

  const payload = await response.json() as RemoteGuestLanguageUpdateResponse;
  const updatedLanguage = payload.thread?.guestLanguage;

  return {
    threadId: payload.thread?.threadId ?? threadId,
    stayId: payload.thread?.stayId ?? null,
    guestLanguage: isGuestLanguage(updatedLanguage) ? updatedLanguage : guestLanguage,
    updatedMessages:
      typeof payload.thread?.updatedMessages === "number"
        ? payload.thread.updatedMessages
        : 0,
  };
}
