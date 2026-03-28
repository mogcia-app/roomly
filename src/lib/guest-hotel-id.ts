const DEFAULT_GUEST_HOTEL_ID =
  process.env.GUEST_HOTEL_ID?.trim() || "hotel_demo_001";

export function resolveGuestHotelId(hotelId?: string | null) {
  const normalized = hotelId?.trim();

  if (normalized) {
    return normalized;
  }

  return DEFAULT_GUEST_HOTEL_ID;
}
