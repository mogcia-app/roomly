const DEFAULT_GUEST_HOTEL_ID =
  process.env.GUEST_HOTEL_ID?.trim() || "7Bg2xD9pcRmXOllPu2US";

export function resolveGuestHotelId(hotelId?: string | null) {
  const normalized = hotelId?.trim();

  if (normalized) {
    return normalized;
  }

  return DEFAULT_GUEST_HOTEL_ID;
}
