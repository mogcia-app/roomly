type RoomDisplaySource = {
  display_name?: unknown;
  displayName?: unknown;
  label?: unknown;
  room_number?: unknown;
  roomNumber?: unknown;
  room_id?: unknown;
  roomId?: unknown;
};

type ThreadDisplaySource = {
  room_display_name?: unknown;
  roomDisplayName?: unknown;
  room_number?: unknown;
  roomNumber?: unknown;
  room_id?: unknown;
  roomId?: unknown;
};

function readDisplayString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

export function resolveRoomId(
  room?: RoomDisplaySource | null,
  thread?: ThreadDisplaySource | null,
) {
  return readDisplayString(
    room?.room_id ??
    room?.roomId ??
    thread?.room_id ??
    thread?.roomId,
  );
}

export function resolveRoomNumber(
  room?: RoomDisplaySource | null,
  thread?: ThreadDisplaySource | null,
) {
  return readDisplayString(
    room?.room_number ??
    room?.roomNumber ??
    thread?.room_number ??
    thread?.roomNumber,
  );
}

export function resolveRoomDisplayName(
  room?: RoomDisplaySource | null,
  thread?: ThreadDisplaySource | null,
) {
  return readDisplayString(
    room?.display_name ??
    room?.displayName ??
    room?.label ??
    thread?.room_display_name ??
    thread?.roomDisplayName ??
    thread?.room_number ??
    thread?.roomNumber ??
    room?.room_number ??
    room?.roomNumber ??
    room?.room_id ??
    room?.roomId ??
    thread?.room_id ??
    thread?.roomId,
  );
}

export function formatRoomLabel({
  displayName,
  roomNumber,
  roomId,
}: {
  displayName?: string | null;
  roomNumber?: string | null;
  roomId?: string | null;
}) {
  if (displayName && displayName !== roomNumber && displayName !== roomId) {
    return displayName;
  }

  if (roomNumber) {
    return `${roomNumber}号室`;
  }

  return roomId ?? "";
}
