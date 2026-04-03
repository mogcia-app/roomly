import "server-only";

import crypto from "node:crypto";

import { getAdminDb, hasFirebaseAdminCredentials } from "@/lib/firebase-admin";

type SupportedRoomTokenPayload = {
  v?: unknown;
  hotel_id?: unknown;
  hotelId?: unknown;
  room_id?: unknown;
  roomId?: unknown;
  room_number?: unknown;
  roomNumber?: unknown;
  iat?: unknown;
  exp?: unknown;
};

export type VerifiedRoomToken = {
  v: number;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  iat: number;
  exp: number;
};

export type ResolvedGuestAccess = {
  accessToken: string;
  roomId: string;
  hotelId: string | null;
  source: "token" | "development-room-id";
};

function getRoomQrSigningSecret() {
  const value = process.env.ROOM_QR_SIGNING_SECRET?.trim();

  if (!value) {
    throw new Error("ROOM_QR_SIGNING_SECRET is not configured.");
  }

  return value;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function signPayload(encodedPayload: string) {
  return crypto
    .createHmac("sha256", getRoomQrSigningSecret())
    .update(encodedPayload)
    .digest();
}

function normalizePayload(payload: SupportedRoomTokenPayload): VerifiedRoomToken {
  const hotelId = payload.hotel_id ?? payload.hotelId;
  const roomId = payload.room_id ?? payload.roomId;
  const roomNumber = payload.room_number ?? payload.roomNumber;

  if (payload.v !== 1) {
    throw new Error("Unsupported room token version.");
  }

  if (
    typeof hotelId !== "string" ||
    typeof roomId !== "string" ||
    typeof roomNumber !== "string" ||
    !hotelId ||
    !roomId ||
    !roomNumber
  ) {
    throw new Error("Room token payload is invalid.");
  }

  if (
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp)
  ) {
    throw new Error("Room token timestamps are invalid.");
  }

  const issuedAt = payload.iat;
  const expiresAt = payload.exp;
  const now = Math.floor(Date.now() / 1000);

  if (expiresAt <= now) {
    throw new Error("Room token expired.");
  }

  return {
    v: payload.v,
    hotelId,
    roomId,
    roomNumber,
    iat: issuedAt,
    exp: expiresAt,
  };
}

export function verifySignedRoomToken(token: string) {
  const [encodedPayload, encodedSignature] = token.split(".");

  if (!encodedPayload || !encodedSignature) {
    throw new Error("Room token format is invalid.");
  }

  const expectedSignature = signPayload(encodedPayload);
  const providedSignature = decodeBase64Url(encodedSignature);

  if (
    providedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(providedSignature, expectedSignature)
  ) {
    throw new Error("Room token signature is invalid.");
  }

  const parsed = JSON.parse(
    decodeBase64Url(encodedPayload).toString("utf8"),
  ) as SupportedRoomTokenPayload;

  return normalizePayload(parsed);
}

export async function resolveSignedRoomToken(token: string) {
  if (!hasFirebaseAdminCredentials()) {
    return null;
  }

  const verified = verifySignedRoomToken(token);
  const snapshot = await getAdminDb().collection("rooms").doc(verified.roomId).get();

  if (!snapshot.exists) {
    throw new Error("Room not found.");
  }

  const data = snapshot.data() as {
    hotel_id?: unknown;
    hotelId?: unknown;
    room_number?: unknown;
    roomNumber?: unknown;
  };

  const hotelId = data.hotel_id ?? data.hotelId;
  const roomNumber = data.room_number ?? data.roomNumber;

  if (hotelId !== verified.hotelId) {
    throw new Error("Room hotel mismatch.");
  }

  if (roomNumber !== verified.roomNumber) {
    throw new Error("Room number mismatch.");
  }

  return verified;
}

function canUseDevelopmentRoomId(accessToken: string) {
  return process.env.NODE_ENV === "development" && accessToken.length > 0 && !accessToken.includes(".");
}

export async function resolveGuestAccess(accessToken: string): Promise<ResolvedGuestAccess> {
  const trimmedAccessToken = accessToken.trim();

  if (!trimmedAccessToken) {
    throw new Error("Guest access token is empty.");
  }

  try {
    const verified = await resolveSignedRoomToken(trimmedAccessToken);

    if (verified) {
      return {
        accessToken: trimmedAccessToken,
        roomId: verified.roomId,
        hotelId: verified.hotelId,
        source: "token",
      };
    }
  } catch (error) {
    if (!canUseDevelopmentRoomId(trimmedAccessToken)) {
      throw error;
    }
  }

  if (canUseDevelopmentRoomId(trimmedAccessToken)) {
    return {
      accessToken: trimmedAccessToken,
      roomId: trimmedAccessToken,
      hotelId: null,
      source: "development-room-id",
    };
  }

  throw new Error("Guest access token could not be resolved.");
}
