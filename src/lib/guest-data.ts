import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import {
  getAdminDb,
  hasFirebaseAdminCredentials,
} from "@/lib/firebase-admin";
import { GUEST_HEARING_SHEETS_COLLECTION } from "@/lib/guest-contract";
import {
  getGuestRoomContext,
  getGuestStayStatus,
  isGuestLanguage,
  type HearingSheetAmenityEntry,
  type HearingSheetBathEntry,
  type HearingSheetBreakfastEntry,
  type HearingSheetCheckoutEntry,
  type HearingSheetEmergencyEntry,
  type HearingSheetFacilityEntry,
  type HearingSheetFacilityLocationEntry,
  type HearingSheetFaqEntry,
  type HearingSheetKnowledge,
  type HearingSheetNearbySpotEntry,
  type HearingSheetParkingEntry,
  type HearingSheetRoomServiceEntry,
  type HearingSheetTransportEntry,
  type HearingSheetWifiEntry,
  type GuestLanguage,
  type GuestRoomContext,
  type GuestStayStatus,
} from "@/lib/guest-demo";
import { resolveGuestHotelId } from "@/lib/guest-hotel-id";
import {
  formatRoomLabel,
  resolveRoomDisplayName,
  resolveRoomNumber,
} from "@/lib/room-display";

type FirestoreRoom = {
  hotel_id?: string;
  hotelId?: string;
  room_number?: string | number;
  roomNumber?: string | number;
  floor?: string | number;
  room_id?: string;
  roomId?: string;
  [key: string]: unknown;
};

type FirestoreHotel = {
  name?: string;
};

type FirestoreStay = {
  is_active?: boolean;
  isActive?: boolean;
  status?: string;
  language?: string;
  guest_language?: string;
  guestLanguage?: string;
  selected_language?: string;
  selectedLanguage?: string;
  preferred_language?: string;
  preferredLanguage?: string;
  guest_locale?: string;
  guestLocale?: string;
  locale?: string;
  translation_enabled?: boolean;
  translationEnabled?: boolean;
  hotel_id?: string;
  hotelId?: string;
};

type FirestoreHearingSheet = {
  categories?: Record<string, unknown>;
  [key: string]: unknown;
};

function toRoomLabel(roomId: string, roomData?: FirestoreRoom) {
  const roomNumber = resolveRoomNumber(roomData);
  const displayName = resolveRoomDisplayName(roomData);
  return formatRoomLabel({
    displayName,
    roomNumber,
    roomId,
  });
}

function toHotelId(roomData?: FirestoreRoom) {
  return roomData?.hotel_id ?? roomData?.hotelId ?? null;
}

function toRoomFloor(roomData?: FirestoreRoom) {
  const floor = roomData?.floor;

  if (typeof floor === "number") {
    return `${floor}階`;
  }

  if (typeof floor === "string" && floor.trim()) {
    return floor.trim();
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function summarizeTopLevelKeys(value: unknown) {
  const record = asRecord(value);

  if (!record) {
    return [];
  }

  return Object.keys(record).sort();
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "yes", "y", "required", "必要", "要", "あり", "有"].includes(normalized)) {
      return true;
    }

    if (["false", "no", "n", "not_required", "不要", "なし", "無"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function resolveStayLanguage(stay: FirestoreStay | null | undefined) {
  const language =
    stay?.guest_language ??
    stay?.guestLanguage ??
    stay?.selectedLanguage ??
    stay?.selected_language ??
    stay?.preferredLanguage ??
    stay?.preferred_language ??
    stay?.guestLocale ??
    stay?.guest_locale ??
    stay?.locale ??
    stay?.language;

  return isGuestLanguage(language) ? language : null;
}

function resolveTranslationEnabled(
  stay: FirestoreStay | null | undefined,
  language: GuestLanguage | null,
) {
  const explicit =
    readBoolean(stay?.translationEnabled) ??
    readBoolean(stay?.translation_enabled);

  if (explicit !== null) {
    return explicit;
  }

  return language !== "ja";
}

function toEntryArray(value: unknown, expectedKeys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => toEntryArray(entry, expectedKeys));
  }

  const record = asRecord(value);

  if (!record) {
    const text = readString(value);
    return text ? [{ note: text }] : [];
  }

  if (expectedKeys.some((key) => key in record)) {
    return [record];
  }

  return Object.values(record).flatMap((entry) => toEntryArray(entry, expectedKeys));
}

function getSheetValue(
  source: FirestoreHearingSheet | FirestoreRoom | null | undefined,
  fieldNames: string | string[],
) {
  if (!source) {
    return null;
  }

  const names = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
  const categories = asRecord(source.categories);
  const operations = asRecord((source as FirestoreHearingSheet).operations);
  const readPath = (root: Record<string, unknown> | null | undefined, path: string) => {
    if (!root) {
      return undefined;
    }

    const segments = path.split(".");
    let current: unknown = root;

    for (const segment of segments) {
      const record = asRecord(current);

      if (!record || !(segment in record)) {
        return undefined;
      }

      current = record[segment];
    }

    return current;
  };

  for (const fieldName of names) {
    const value =
      readPath(source, fieldName) ??
      readPath(categories, fieldName) ??
      readPath(operations, fieldName);

    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}

function createEmptyKnowledge(): HearingSheetKnowledge {
  return {
    frontDeskHours: [],
    wifi: [],
    breakfast: [],
    baths: [],
    facilities: [],
    facilityLocations: [],
    amenities: [],
    parking: [],
    emergency: [],
    faq: [],
    checkout: [],
    roomService: [],
    transport: [],
    nearbySpots: [],
  };
}

function summarizeKnowledgeCounts(knowledge: HearingSheetKnowledge) {
  return {
    frontDeskHours: knowledge.frontDeskHours.length,
    wifi: knowledge.wifi.length,
    breakfast: knowledge.breakfast.length,
    baths: knowledge.baths.length,
    facilities: knowledge.facilities.length,
    facilityLocations: knowledge.facilityLocations.length,
    amenities: knowledge.amenities.length,
    parking: knowledge.parking.length,
    emergency: knowledge.emergency.length,
    faq: knowledge.faq.length,
    checkout: knowledge.checkout.length,
    roomService: knowledge.roomService.length,
    transport: knowledge.transport.length,
    nearbySpots: knowledge.nearbySpots.length,
  };
}

function dedupeEntries<T>(entries: T[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = JSON.stringify(entry);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function mergeKnowledge(
  primary: HearingSheetKnowledge,
  secondary: HearingSheetKnowledge,
): HearingSheetKnowledge {
  return {
    frontDeskHours: dedupeEntries([...primary.frontDeskHours, ...secondary.frontDeskHours]),
    wifi: dedupeEntries([...primary.wifi, ...secondary.wifi]),
    breakfast: dedupeEntries([...primary.breakfast, ...secondary.breakfast]),
    baths: dedupeEntries([...primary.baths, ...secondary.baths]),
    facilities: dedupeEntries([...primary.facilities, ...secondary.facilities]),
    facilityLocations: dedupeEntries([
      ...primary.facilityLocations,
      ...secondary.facilityLocations,
    ]),
    amenities: dedupeEntries([...primary.amenities, ...secondary.amenities]),
    parking: dedupeEntries([...primary.parking, ...secondary.parking]),
    emergency: dedupeEntries([...primary.emergency, ...secondary.emergency]),
    faq: dedupeEntries([...primary.faq, ...secondary.faq]),
    checkout: dedupeEntries([...primary.checkout, ...secondary.checkout]),
    roomService: dedupeEntries([...primary.roomService, ...secondary.roomService]),
    transport: dedupeEntries([...primary.transport, ...secondary.transport]),
    nearbySpots: dedupeEntries([...primary.nearbySpots, ...secondary.nearbySpots]),
  };
}

function parseFrontDeskHours(value: unknown) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(readString).filter((entry): entry is string => entry !== null);
  }

  const record = asRecord(value);
  if (record) {
    return Object.values(record)
      .map(readString)
      .filter((entry): entry is string => entry !== null);
  }

  const text = readString(value);
  return text ? [text] : [];
}

function parseWifiNetworks(value: unknown): HearingSheetWifiEntry[] {
  return toEntryArray(value, ["floor", "ssid", "password", "note"]).map((entry) => ({
    floor: readString(entry.floor),
    ssid: readString(entry.ssid),
    password: readString(entry.password),
    note: readString(entry.note),
  }));
}

function parseBreakfastEntries(value: unknown): HearingSheetBreakfastEntry[] {
  return toEntryArray(value, [
    "style",
    "hours",
    "location",
    "price",
    "reservationRequired",
    "reservation_required",
    "note",
  ]).map((entry) => ({
    style: readString(entry.style),
    hours: readString(entry.hours),
    location: readString(entry.location),
    price: readString(entry.price),
    reservationRequired: readBoolean(
      entry.reservationRequired ?? entry.reservation_required,
    ),
    note: readString(entry.note),
  }));
}

function parseBathEntries(value: unknown): HearingSheetBathEntry[] {
  return toEntryArray(value, ["name", "hours", "location", "note"]).map((entry) => ({
    name: readString(entry.name),
    hours: readString(entry.hours),
    location: readString(entry.location),
    note: readString(entry.note),
  }));
}

function parseFacilityEntries(value: unknown): HearingSheetFacilityEntry[] {
  return toEntryArray(value, ["name", "hours", "note"]).map((entry) => ({
    name: readString(entry.name),
    hours: readString(entry.hours),
    note: readString(entry.note),
  }));
}

function parseFacilityLocationEntries(
  value: unknown,
): HearingSheetFacilityLocationEntry[] {
  return toEntryArray(value, ["name", "floor", "note"]).map((entry) => ({
    name: readString(entry.name),
    floor: readString(entry.floor),
    note: readString(entry.note),
  }));
}

function parseAmenityEntries(value: unknown): HearingSheetAmenityEntry[] {
  return toEntryArray(value, [
    "name",
    "inRoom",
    "in_room",
    "availableOnRequest",
    "available_on_request",
    "requestMethod",
    "request_method",
    "price",
    "note",
  ]).map((entry) => ({
    name: readString(entry.name),
    inRoom: readBoolean(entry.inRoom ?? entry.in_room),
    availableOnRequest: readBoolean(
      entry.availableOnRequest ?? entry.available_on_request,
    ),
    requestMethod: readString(entry.requestMethod ?? entry.request_method),
    price: readString(entry.price),
    note: readString(entry.note),
  }));
}

function parseParkingEntries(value: unknown): HearingSheetParkingEntry[] {
  return toEntryArray(value, [
    "name",
    "capacity",
    "price",
    "hours",
    "reservationRequired",
    "reservation_required",
    "location",
    "note",
  ]).map((entry) => ({
    name: readString(entry.name),
    capacity: readString(entry.capacity),
    price: readString(entry.price),
    hours: readString(entry.hours),
    reservationRequired: readBoolean(
      entry.reservationRequired ?? entry.reservation_required,
    ),
    location: readString(entry.location),
    note: readString(entry.note),
  }));
}

function parseEmergencyEntries(value: unknown): HearingSheetEmergencyEntry[] {
  return toEntryArray(value, ["category", "contact", "steps", "note"]).map((entry) => ({
    category: readString(entry.category),
    contact: readString(entry.contact),
    steps: readString(entry.steps),
    note: readString(entry.note),
  }));
}

function parseFaqEntries(value: unknown): HearingSheetFaqEntry[] {
  return toEntryArray(value, ["question", "answer"]).map((entry) => ({
    question: readString(entry.question),
    answer: readString(entry.answer),
  }));
}

function parseCheckoutEntries(value: unknown): HearingSheetCheckoutEntry[] {
  return toEntryArray(value, [
    "time",
    "method",
    "keyReturnLocation",
    "key_return_location",
    "lateCheckoutPolicy",
    "late_checkout_policy",
    "note",
  ]).map((entry) => ({
    time: readString(entry.time),
    method: readString(entry.method),
    keyReturnLocation: readString(
      entry.keyReturnLocation ?? entry.key_return_location,
    ),
    lateCheckoutPolicy: readString(
      entry.lateCheckoutPolicy ?? entry.late_checkout_policy,
    ),
    note: readString(entry.note),
  }));
}

function parseRoomServiceEntries(value: unknown): HearingSheetRoomServiceEntry[] {
  return toEntryArray(value, [
    "menuName",
    "menu_name",
    "price",
    "orderMethod",
    "order_method",
    "hours",
    "note",
  ]).map((entry) => ({
    menuName: readString(entry.menuName ?? entry.menu_name),
    price: readString(entry.price),
    orderMethod: readString(entry.orderMethod ?? entry.order_method),
    hours: readString(entry.hours),
    note: readString(entry.note),
  }));
}

function parseTransportEntries(value: unknown): HearingSheetTransportEntry[] {
  return toEntryArray(value, [
    "companyName",
    "company_name",
    "serviceType",
    "service_type",
    "phone",
    "hours",
    "priceNote",
    "price_note",
    "note",
  ]).map((entry) => ({
    companyName: readString(entry.companyName ?? entry.company_name),
    serviceType: readString(entry.serviceType ?? entry.service_type),
    phone: readString(entry.phone),
    hours: readString(entry.hours),
    priceNote: readString(entry.priceNote ?? entry.price_note),
    note: readString(entry.note),
  }));
}

function parseNearbySpotEntries(value: unknown): HearingSheetNearbySpotEntry[] {
  return toEntryArray(value, [
    "name",
    "category",
    "distance",
    "hours",
    "location",
    "note",
  ]).map((entry) => ({
    name: readString(entry.name),
    category: readString(entry.category),
    distance: readString(entry.distance),
    hours: readString(entry.hours),
    location: readString(entry.location),
    note: readString(entry.note),
  }));
}

function parseKnowledgeFromSource(
  source: FirestoreHearingSheet | FirestoreRoom | null,
): HearingSheetKnowledge {
  return {
    frontDeskHours: parseFrontDeskHours(getSheetValue(source, [
      "frontDeskHours",
      "front_desk_hours",
      "frontDesk",
      "front_desk",
    ])),
    wifi: parseWifiNetworks(getSheetValue(source, [
      "wifiNetworks",
      "wifi_networks",
      "wifi",
    ])),
    breakfast: parseBreakfastEntries(getSheetValue(source, [
      "breakfastEntries",
      "breakfast_entries",
      "breakfast",
      "facilities.breakfastEntries",
      "facilities.breakfast_entries",
    ])),
    baths: parseBathEntries(getSheetValue(source, [
      "bathEntries",
      "bath_entries",
      "baths",
      "bath",
      "facilities.bathEntries",
      "facilities.bath_entries",
    ])),
    facilities: parseFacilityEntries(getSheetValue(source, [
      "facilityEntries",
      "facility_entries",
      "facilities",
      "facilities.entries",
    ])),
    facilityLocations: parseFacilityLocationEntries(
      getSheetValue(source, [
        "facilityLocationEntries",
        "facility_location_entries",
        "facilityLocations",
        "facility_locations",
        "facilities.locationEntries",
        "facilities.location_entries",
      ]),
    ),
    amenities: parseAmenityEntries(getSheetValue(source, [
      "amenityEntries",
      "amenity_entries",
      "amenities",
    ])),
    parking: parseParkingEntries(getSheetValue(source, [
      "parkingEntries",
      "parking_entries",
      "parking",
    ])),
    emergency: parseEmergencyEntries(getSheetValue(source, [
      "emergencyEntries",
      "emergency_entries",
      "emergency",
    ])),
    faq: parseFaqEntries(getSheetValue(source, [
      "faqEntries",
      "faq_entries",
      "faq",
    ])),
    checkout: parseCheckoutEntries(getSheetValue(source, [
      "checkoutEntries",
      "checkout_entries",
      "checkout",
    ])),
    roomService: parseRoomServiceEntries(getSheetValue(source, [
      "roomServiceEntries",
      "room_service_entries",
      "roomService",
      "room_service",
    ])),
    transport: parseTransportEntries(getSheetValue(source, [
      "transportEntries",
      "transport_entries",
      "transport",
    ])),
    nearbySpots: parseNearbySpotEntries(getSheetValue(source, [
      "nearbySpotEntries",
      "nearby_spot_entries",
      "nearbySpots",
      "nearby_spots",
    ])),
  };
}

function buildPromptCandidates(knowledge: HearingSheetKnowledge) {
  const prompts = [
    knowledge.breakfast[0]?.hours
      ? `朝食: ${knowledge.breakfast[0].hours}${
          knowledge.breakfast[0].location ? ` ${knowledge.breakfast[0].location}` : ""
        }`
      : null,
    knowledge.baths[0]?.location
      ? `${knowledge.baths[0].name ?? "大浴場"}: ${knowledge.baths[0].location}`
      : null,
    knowledge.checkout[0]?.time ? `チェックアウト: ${knowledge.checkout[0].time}` : null,
    knowledge.parking[0]?.location
      ? `駐車場: ${knowledge.parking[0].location}`
      : null,
    knowledge.nearbySpots[0]?.name ? `周辺: ${knowledge.nearbySpots[0].name}` : null,
  ];

  return prompts.filter((entry): entry is string => entry !== null);
}

async function findRoomByRoomId(roomId: string) {
  const db = getAdminDb();
  const directSnapshot = await db.collection("rooms").doc(roomId).get();

  if (directSnapshot.exists) {
    return {
      id: directSnapshot.id,
      data: directSnapshot.data() as FirestoreRoom,
    };
  }

  for (const fieldName of ["room_id", "roomId", "room_number", "roomNumber"]) {
    const roomSnapshot = await db
      .collection("rooms")
      .where(fieldName, "==", roomId)
      .limit(1)
      .get();

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

  const hotelSnapshot = await getAdminDb().collection("hotels").doc(hotelId).get();

  if (!hotelSnapshot.exists) {
    return "Roomly旅館";
  }

  return ((hotelSnapshot.data() as FirestoreHotel).name ?? "Roomly旅館").trim();
}

async function findActiveStayByRoomId(roomId: string) {
  const db = getAdminDb();

  for (const roomFieldName of ["room_id", "roomId"]) {
    for (const activeFieldName of ["is_active", "isActive"]) {
      const staySnapshot = await db
        .collection("stays")
        .where(roomFieldName, "==", roomId)
        .where(activeFieldName, "==", true)
        .limit(1)
        .get();

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

  const db = getAdminDb();
  const directSnapshot = await db
    .collection(GUEST_HEARING_SHEETS_COLLECTION)
    .doc(hotelId)
    .get();

  if (directSnapshot.exists) {
    return directSnapshot.data() as FirestoreHearingSheet;
  }

  const hearingSheetSnapshot = await db
    .collection(GUEST_HEARING_SHEETS_COLLECTION)
    .where("hotel_id", "==", hotelId)
    .limit(1)
    .get();

  if (hearingSheetSnapshot.empty) {
    return null;
  }

  return hearingSheetSnapshot.docs[0].data() as FirestoreHearingSheet;
}

function buildFallbackStayStatus(
  roomId: string,
  selectedLanguage: GuestLanguage | null,
) {
  const fallbackStatus = getGuestStayStatus(roomId, selectedLanguage);

  if (!fallbackStatus) {
    return null;
  }

  return {
    ...fallbackStatus,
    hotelId: resolveGuestHotelId(fallbackStatus.hotelId),
    translationEnabled: fallbackStatus.selectedLanguage !== "ja",
  };
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
    roomDisplayName: stayStatus.roomDisplayName,
    roomNumber: stayStatus.roomNumber,
    hotelName: stayStatus.hotelName,
    stayActive: stayStatus.stayActive,
    translationEnabled: stayStatus.translationEnabled,
    hearingSheetPrompts: stayStatus.hearingSheetPrompts,
    hearingSheetKnowledge: stayStatus.hearingSheetKnowledge,
    roomFloor: stayStatus.roomFloor,
  };
}

export async function getGuestStayStatusFromStore(
  roomId: string,
  selectedLanguage: GuestLanguage | null,
  hotelIdHint?: string | null,
): Promise<GuestStayStatus | null> {
  if (!hasFirebaseAdminCredentials()) {
    const fallback = buildFallbackStayStatus(roomId, selectedLanguage);

    if (!fallback) {
      console.error("[guest/data] missing firebase admin credentials for non-demo room", {
        roomId,
        hotelIdHint,
        hasServiceAccountJson: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
        hasAdminProjectId: Boolean(process.env.FIREBASE_ADMIN_PROJECT_ID),
        hasAdminClientEmail: Boolean(process.env.FIREBASE_ADMIN_CLIENT_EMAIL),
        hasAdminPrivateKey: Boolean(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
      });
    }

    return fallback;
  }

  try {
    const roomRecord = await findRoomByRoomId(roomId);

    if (!roomRecord) {
      console.error("[guest/data] room not found in firestore", {
        roomId,
        hotelIdHint,
      });
      return buildFallbackStayStatus(roomId, selectedLanguage);
    }

    const hotelId = resolveGuestHotelId(hotelIdHint ?? toHotelId(roomRecord.data));
    const [hotelName, activeStay, hearingSheet] = await Promise.all([
      findHotelName(hotelId),
      findActiveStayByRoomId(roomId),
      findHearingSheetByHotelId(hotelId),
    ]);

    const stayLanguage = resolveStayLanguage(activeStay?.data);
    const hotelKnowledge = parseKnowledgeFromSource(hearingSheet);
    const roomKnowledge = parseKnowledgeFromSource(roomRecord.data);
    const knowledge = mergeKnowledge(roomKnowledge, hotelKnowledge);
    const fallbackRoom = getGuestRoomContext(roomId);
    const fallbackKnowledge = fallbackRoom?.hearingSheetKnowledge ?? createEmptyKnowledge();
    const mergedKnowledge = mergeKnowledge(knowledge, fallbackKnowledge);
    const prompts = buildPromptCandidates(mergedKnowledge);
    const roomNumber = resolveRoomNumber(roomRecord.data);
    const roomDisplayName = resolveRoomDisplayName(roomRecord.data);

    console.info("[guest/data] resolved stay status", {
      roomId,
      hotelId,
      hotelIdHint,
      stayId: activeStay?.id ?? null,
      stayActive: Boolean(activeStay),
      selectedLanguage,
      stayLanguage,
      roomRecordFound: true,
      hearingSheetFound: Boolean(hearingSheet),
      roomRecordKeys: summarizeTopLevelKeys(roomRecord.data),
      hearingSheetKeys: summarizeTopLevelKeys(hearingSheet),
      roomKnowledgeCounts: summarizeKnowledgeCounts(roomKnowledge),
      hotelKnowledgeCounts: summarizeKnowledgeCounts(hotelKnowledge),
      mergedKnowledgeCounts: summarizeKnowledgeCounts(mergedKnowledge),
    });

    return {
      roomId,
      roomLabel: toRoomLabel(roomId, roomRecord.data),
      roomDisplayName,
      roomNumber,
      hotelName,
      stayActive: Boolean(activeStay),
      hotelId,
      stayId: activeStay?.id ?? null,
      translationEnabled: resolveTranslationEnabled(activeStay?.data, stayLanguage ?? selectedLanguage ?? "ja"),
      hearingSheetPrompts: prompts.length > 0 ? prompts : fallbackRoom?.hearingSheetPrompts ?? [],
      hearingSheetKnowledge: mergedKnowledge,
      roomFloor: toRoomFloor(roomRecord.data) ?? fallbackRoom?.roomFloor ?? null,
      selectedLanguage: stayLanguage ?? selectedLanguage,
      handoffStatus: null,
      unreadCountFront: null,
      unreadCountGuest: null,
    };
  } catch (error) {
    console.error("[guest/data] failed to resolve stay status", {
      roomId,
      hotelIdHint,
      error,
    });
    return buildFallbackStayStatus(roomId, selectedLanguage);
  }
}

export async function getGuestActiveStayStatusFromStore(
  roomId: string,
  selectedLanguage: GuestLanguage | null,
  hotelIdHint?: string | null,
): Promise<GuestStayStatus | null> {
  const stayStatus = await getGuestStayStatusFromStore(roomId, selectedLanguage, hotelIdHint);

  if (!stayStatus) {
    return null;
  }

  if (!stayStatus.stayActive || !stayStatus.stayId) {
    console.warn("[guest/data] active stay not found", {
      roomId,
      hotelIdHint,
      stayActive: stayStatus.stayActive,
      stayId: stayStatus.stayId ?? null,
    });
    return null;
  }

  return stayStatus;
}

export async function updateActiveStayLanguageInStore(
  roomId: string,
  language: GuestLanguage,
) {
  if (!hasFirebaseAdminCredentials()) {
    return { ok: false as const, stayId: null };
  }

  const activeStay = await findActiveStayByRoomId(roomId);

  if (!activeStay) {
    return { ok: false as const, stayId: null };
  }

  await getAdminDb().collection("stays").doc(activeStay.id).set(
    {
      guest_language: language,
      guestLanguage: language,
      updated_at: FieldValue.serverTimestamp(),
    } satisfies Pick<FirestoreStay, "guest_language" | "guestLanguage"> & {
      updated_at: unknown;
    },
    { merge: true },
  );

  return { ok: true as const, stayId: activeStay.id };
}
