# Hotel-Side Active Stay Implementation Guide

## Goal

Implement the hotel-side flow so fixed room QR codes remain valid only while a room has an active stay.

Guest-side behavior is already aligned to this model:

- Fixed QR resolves to a `roomId`
- Guest flow requires an active stay for that room
- Chat is separated by `stayId`
- If no active stay exists, guest sees an unavailable page

This document covers only the hotel-side work required to support that behavior.

## Core Rule

Do not manage QR validity directly.

Manage `stays` instead.

- Each room QR is fixed
- A room is usable only when that room has exactly one active stay
- Guest chat is scoped to that stay

## Required Data Model

### `rooms`

Use the existing room master as the fixed source of truth for QR-to-room resolution.

Required fields:

- `hotel_id` or `hotelId`: string
- `room_number` or `roomNumber`: string
- `floor`: string or number

Recommended fields:

- `enabled`: boolean
- `label`: string

### `stays`

Add or standardize a `stays` collection.

Required fields:

- `hotel_id` or `hotelId`: string
- `room_id` or `roomId`: string
- `is_active` or `isActive`: boolean
- `status`: `"active" | "checked_out" | "cancelled"`
- `check_in_at` or `checkInAt`: timestamp
- `check_out_at` or `checkOutAt`: timestamp or null
- `created_at` or `createdAt`: timestamp
- `updated_at` or `updatedAt`: timestamp

Recommended fields:

- `guest_name` or `guestName`: string
- `guest_count` or `guestCount`: number
- `reservation_id` or `reservationId`: string
- `checked_in_by` or `checkedInBy`: string
- `checked_out_by` or `checkedOutBy`: string
- `notes`: string

## Data Integrity Rules

Enforce these rules in hotel-side code and UI.

### One active stay per room

For a given `roomId`, active stays must be `0` or `1`.

If multiple active stays exist for one room:

- treat it as an operational error
- do not silently pick one in hotel UI
- show a warning state such as `要確認`
- log the room and conflicting stay ids

### Checkout closes guest access

When checkout completes:

- set `isActive=false`
- set `status="checked_out"`
- set `checkOutAt`

After that, fixed room QR must no longer allow guest chat entry.

## Hotel-Side Features To Implement

Implement these in the admin or hotel operations side.

### 1. Room Status List

Add a room list view that shows current stay state per room.

Per row:

- room number
- current status: `空室`, `滞在中`, `要確認`
- active stay id if present
- check-in time if present
- guest count if present
- action buttons

Required actions:

- `チェックイン`
- `チェックアウト`
- `チャットを見る`

### 2. Check-In Action

Create a stay for the selected room.

Behavior:

1. Verify no active stay exists for the room
2. Create a new stay document
3. Set `isActive=true`
4. Set `status="active"`
5. Set `checkInAt`

Minimal input:

- room
- guest count

Optional input:

- guest name
- reservation id
- notes

### 3. Check-Out Action

Close the active stay for the selected room.

Behavior:

1. Find the room's active stay
2. If none exists, show an error
3. Update the stay:
   - `isActive=false`
   - `status="checked_out"`
   - `checkOutAt=server timestamp`
   - `updatedAt=server timestamp`

### 4. Front Desk Chat Entry

When hotel staff opens guest chat from the admin side, load chat threads by `stayId`, not by `roomId`.

Required behavior:

- show only threads linked to the active stay
- when a new stay starts, old chats must not appear in the active guest workflow

## API Requirements

If hotel-side APIs do not exist yet, implement these.

### `POST /api/admin/stays/check-in`

Purpose:

- create an active stay for a room

Request body:

```json
{
  "roomId": "s70kLeEd60diWbUr7wi0",
  "guestCount": 2,
  "guestName": "Optional",
  "reservationId": "Optional"
}
```

Response:

- `200` with created stay
- `409` if active stay already exists for the room

### `POST /api/admin/stays/check-out`

Purpose:

- close the active stay for a room

Request body:

```json
{
  "roomId": "s70kLeEd60diWbUr7wi0"
}
```

Response:

- `200` with updated stay
- `404` if no active stay exists

### `GET /api/admin/rooms/status`

Purpose:

- return room list with computed current state

Returned state per room:

- `vacant`
- `occupied`
- `conflict`

`conflict` means multiple active stays exist.

## Query Rules

Use these queries consistently.

### Find active stay for a room

Accepted fields for compatibility:

- `room_id`
- `roomId`
- `is_active`
- `isActive`

Expected logic:

1. Query by room field
2. Filter active field to `true`
3. If 0 results: room is vacant
4. If 1 result: room is occupied
5. If 2+ results: conflict

## Chat Data Requirements

Hotel-side chat views and APIs must treat `stayId` as the primary grouping key.

Required behavior:

- thread creation writes `stay_id` or `stayId`
- thread lookup uses `stayId`
- message screens are filtered by the thread linked to the active stay

Avoid:

- loading guest threads by `roomId` only
- reusing old stay threads when a new stay starts

## Survey Handling

Do not use the room QR flow for survey routing.

Survey should be separate from guest chat.

Recommended options:

- separate survey URL
- checkout confirmation screen link
- message sent after checkout

## Logging Requirements

Add explicit logs for hotel-side operational failures.

Required cases:

- active stay already exists during check-in
- no active stay found during check-out
- multiple active stays found for one room
- chat opened without active stay

Log payload should include:

- `roomId`
- `hotelId`
- `stayId` if available
- operator/admin user id if available

## Acceptance Criteria

The hotel-side implementation is complete when all of the following are true.

1. Staff can create an active stay for a room at check-in.
2. Staff can close the active stay for a room at check-out.
3. At most one active stay exists per room in normal operation.
4. Guest QR works only while an active stay exists.
5. Guest chat opened during one stay does not mix with the next stay.
6. Hotel-side chat views load current guest threads by `stayId`.
7. Rooms with active stay conflicts are visible and actionable in admin UI.

## Recommended Rollout Order

1. Standardize `stays` schema
2. Implement room status list
3. Implement check-in API and UI
4. Implement check-out API and UI
5. Update hotel-side chat lookup to use `stayId`
6. Add conflict logging and admin warning states

## Non-Goals

These are not required for the first version.

- QR reissuance UI
- expiring QR tokens per stay
- PMS integration
- per-guest session splitting within one stay

Those can be added later if needed.
