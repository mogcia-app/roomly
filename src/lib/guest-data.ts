import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import {
  getGuestRoomContext,
  getGuestStayStatus,
  isGuestLanguage,
  type GuestLanguage,
  type GuestRoomContext,
  type GuestStayStatus,
} from "@/lib/guest-demo";

type FirestoreRoom = {
  hotel_id?: string;
  hotelId?: string;
  room_number?: string | number;
  roomNumber?: string | number;
  floor?: string | number;
  room_id?: string;
  roomId?: string;
};

type FirestoreHotel = {
  name?: string;
};

type FirestoreStay = {
  is_active?: boolean;
  isActive?: boolean;
  language?: string;
  hotel_id?: string;
  hotelId?: string;
};

type FirestoreHearingSheet = {
  categories?: Record<string, unknown>;
};

type HearingSheetKnowledge = {
  wifi: string[];
  breakfast: string[];
  amenities: string[];
  facilities: string[];
};

function hasFirebaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
}

function toRoomLabel(roomId: string, roomData?: FirestoreRoom) {
  const roomNumber = roomData?.room_number ?? roomData?.roomNumber ?? roomId;
  return `${roomNumber}号室`;
}

function toHotelId(roomData?: FirestoreRoom) {
  return roomData?.hotel_id ?? roomData?.hotelId ?? null;
}

function extractPromptStrings(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractPromptStrings(entry));
  }

  if (typeof value === "object") {
    return Object.values(value).flatMap((entry) => extractPromptStrings(entry));
  }

  return [];
}

function getPromptCandidates(sheet: FirestoreHearingSheet | null) {
  if (!sheet?.categories) {
    return [];
  }

  return Array.from(
    new Set(
      extractPromptStrings(sheet.categories)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ).slice(0, 6);
}

function createEmptyKnowledge(): HearingSheetKnowledge {
  return {
    wifi: [],
    breakfast: [],
    amenities: [],
    facilities: [],
  };
}

function pushKnowledgeValue(target: string[], value: string) {
  const trimmed = value.trim();

  if (!trimmed || target.includes(trimmed)) {
    return;
  }

  target.push(trimmed);
}

function matchKnowledgeCategory(path: string, value: string) {
  const normalizedPath = path.toLowerCase();
  const normalizedValue = value.toLowerCase();

  if (
    normalizedPath.includes("wifi") ||
    normalizedPath.includes("wi-fi") ||
    normalizedValue.includes("wifi") ||
    normalizedValue.includes("wi-fi") ||
    value.includes("Wi-Fi") ||
    value.includes("無線LAN")
  ) {
    return "wifi" as const;
  }

  if (
    normalizedPath.includes("breakfast") ||
    value.includes("朝食") ||
    value.includes("レストラン")
  ) {
    return "breakfast" as const;
  }

  if (
    normalizedPath.includes("amenity") ||
    value.includes("アメニティ") ||
    value.includes("歯ブラシ") ||
    value.includes("タオル") ||
    value.includes("浴衣") ||
    value.includes("シャンプー")
  ) {
    return "amenities" as const;
  }

  if (
    normalizedPath.includes("facility") ||
    normalizedPath.includes("room") ||
    value.includes("大浴場") ||
    value.includes("温泉") ||
    value.includes("ランドリー") ||
    value.includes("自販機") ||
    value.includes("駐車場") ||
    value.includes("館内") ||
    value.includes("お部屋") ||
    value.includes("客室")
  ) {
    return "facilities" as const;
  }

  return null;
}

function collectKnowledgeEntries(
  value: unknown,
  path: string[],
  knowledge: HearingSheetKnowledge,
) {
  if (typeof value === "string") {
    const matchedCategory = matchKnowledgeCategory(path.join("."), value);

    if (matchedCategory) {
      pushKnowledgeValue(knowledge[matchedCategory], value);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      collectKnowledgeEntries(entry, path, knowledge);
    });
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nestedValue]) => {
      collectKnowledgeEntries(nestedValue, [...path, key], knowledge);
    });
  }
}

function getKnowledgeCandidates(sheet: FirestoreHearingSheet | null) {
  const knowledge = createEmptyKnowledge();

  if (!sheet?.categories) {
    return knowledge;
  }

  collectKnowledgeEntries(sheet.categories, ["categories"], knowledge);

  return {
    wifi: knowledge.wifi.slice(0, 4),
    breakfast: knowledge.breakfast.slice(0, 4),
    amenities: knowledge.amenities.slice(0, 4),
    facilities: knowledge.facilities.slice(0, 4),
  };
}

async function findRoomByRoomId(roomId: string) {
  const directSnapshot = await getDoc(doc(db, "rooms", roomId));

  if (directSnapshot.exists()) {
    return {
      id: directSnapshot.id,
      data: directSnapshot.data() as FirestoreRoom,
    };
  }

  const roomsRef = collection(db, "rooms");

  for (const fieldName of ["room_id", "roomId", "room_number", "roomNumber"]) {
    const roomQuery = query(roomsRef, where(fieldName, "==", roomId), limit(1));
    const roomSnapshot = await getDocs(roomQuery);

    if (!roomSnapshot.empty) {
      const [match] = roomSnapshot.docs;
      return {
        id: match.id,
        data: match.data() as FirestoreRoom,
      };
    }
  }

  return null;
}

async function findHotelName(hotelId: string | null) {
  if (!hotelId) {
    return "Roomly旅館";
  }

  const hotelSnapshot = await getDoc(doc(db, "hotels", hotelId));

  if (!hotelSnapshot.exists()) {
    return "Roomly旅館";
  }

  return ((hotelSnapshot.data() as FirestoreHotel).name ?? "Roomly旅館").trim();
}

async function findActiveStayByRoomId(roomId: string) {
  const staysRef = collection(db, "stays");

  for (const roomFieldName of ["room_id", "roomId"]) {
    for (const activeFieldName of ["is_active", "isActive"]) {
      const stayQuery = query(
        staysRef,
        where(roomFieldName, "==", roomId),
        where(activeFieldName, "==", true),
        limit(1),
      );
      const staySnapshot = await getDocs(stayQuery);

      if (!staySnapshot.empty) {
        const [match] = staySnapshot.docs;
        return {
          id: match.id,
          data: match.data() as FirestoreStay,
        };
      }
    }
  }

  return null;
}

async function findHearingSheetByHotelId(hotelId: string | null) {
  if (!hotelId) {
    return null;
  }

  const directSnapshot = await getDoc(doc(db, "hearing_sheets", hotelId));

  if (directSnapshot.exists()) {
    return directSnapshot.data() as FirestoreHearingSheet;
  }

  const hearingSheetQuery = query(
    collection(db, "hearing_sheets"),
    where("hotel_id", "==", hotelId),
    limit(1),
  );
  const hearingSheetSnapshot = await getDocs(hearingSheetQuery);

  if (hearingSheetSnapshot.empty) {
    return null;
  }

  return hearingSheetSnapshot.docs[0].data() as FirestoreHearingSheet;
}

function buildFallbackStayStatus(
  roomId: string,
  selectedLanguage: GuestLanguage | null,
) {
  return getGuestStayStatus(roomId, selectedLanguage);
}

export async function getGuestRoomContextFromStore(
  roomId: string,
): Promise<GuestRoomContext | null> {
  const stayStatus = await getGuestStayStatusFromStore(roomId, null);

  if (!stayStatus) {
    return null;
  }

  return {
    roomId: stayStatus.roomId,
    roomLabel: stayStatus.roomLabel,
    hotelName: stayStatus.hotelName,
    stayActive: stayStatus.stayActive,
    hearingSheetPrompts: stayStatus.hearingSheetPrompts,
    hearingSheetKnowledge: stayStatus.hearingSheetKnowledge,
  };
}

export async function getGuestStayStatusFromStore(
  roomId: string,
  selectedLanguage: GuestLanguage | null,
): Promise<GuestStayStatus | null> {
  if (!hasFirebaseConfig()) {
    return buildFallbackStayStatus(roomId, selectedLanguage);
  }

  try {
    const roomRecord = await findRoomByRoomId(roomId);

    if (!roomRecord) {
      return buildFallbackStayStatus(roomId, selectedLanguage);
    }

    const hotelId = toHotelId(roomRecord.data);
    const [hotelName, activeStay, hearingSheet] = await Promise.all([
      findHotelName(hotelId),
      findActiveStayByRoomId(roomId),
      findHearingSheetByHotelId(hotelId),
    ]);

    const stayLanguage = isGuestLanguage(activeStay?.data.language)
      ? activeStay.data.language
      : null;
    const prompts = getPromptCandidates(hearingSheet);
    const knowledge = getKnowledgeCandidates(hearingSheet);
    const fallbackRoom = getGuestRoomContext(roomId);

    return {
      roomId,
      roomLabel: toRoomLabel(roomId, roomRecord.data),
      hotelName,
      stayActive: Boolean(activeStay),
      hotelId,
      stayId: activeStay?.id ?? null,
      hearingSheetPrompts:
        prompts.length > 0
          ? prompts
          : fallbackRoom?.hearingSheetPrompts ?? [],
      hearingSheetKnowledge: {
        wifi:
          knowledge.wifi.length > 0
            ? knowledge.wifi
            : fallbackRoom?.hearingSheetKnowledge?.wifi ?? [],
        breakfast:
          knowledge.breakfast.length > 0
            ? knowledge.breakfast
            : fallbackRoom?.hearingSheetKnowledge?.breakfast ?? [],
        amenities:
          knowledge.amenities.length > 0
            ? knowledge.amenities
            : fallbackRoom?.hearingSheetKnowledge?.amenities ?? [],
        facilities:
          knowledge.facilities.length > 0
            ? knowledge.facilities
            : fallbackRoom?.hearingSheetKnowledge?.facilities ?? [],
      },
      selectedLanguage: stayLanguage ?? selectedLanguage,
    };
  } catch {
    return buildFallbackStayStatus(roomId, selectedLanguage);
  }
}
