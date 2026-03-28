# Roomly Guest Screen Design v1

## Purpose

This document defines the MVP guest experience from QR scan to chat or call. The goal is to make the guest flow implementable without re-deciding the main screen states.

## Design Principles

- The guest should be able to start without app install or account creation.
- The primary experience starts from a fixed room QR code.
- The UI should reduce hesitation for small requests and make urgent contact obvious.
- Call failure should always fall back to chat.
- The guest should always know whether they are talking to AI or a human.

## Entry Flow

```text
Guest scans QR
 -> /guest/[roomId]
 -> server checks active stay by room_id
 -> active stay exists
    -> language selection
    -> guest chat screen
 -> no active stay
    -> post-checkout survey screen
```

## Route Proposal

- `/guest/[roomId]`
- `/guest/[roomId]/language`
- `/guest/[roomId]/chat`
- `/guest/[roomId]/survey`

`/guest/[roomId]` should act as the entry resolver and redirect based on current stay status.

## Core Session Rules

- Guest auth is not required.
- Session validity is determined server-side from `room_id` and the current active stay.
- Selected guest language is stored on the active stay or guest session record.
- If the stay becomes inactive during use, the guest is redirected to the survey screen after the current request is resolved.

## Screen List

### 1. Entry Resolver Screen

Purpose:
Resolve whether the guest should enter the active stay flow or the survey flow.

UI:
- White background
- Centered Roomly logo
- Short loading text such as `Confirming your room...`
- Small fallback message for network retry

States:
- `checking_stay`
- `stay_active`
- `stay_inactive`
- `error`

Actions:
- Auto redirect to language selection or survey
- Retry on network error

### 2. Language Selection Screen

Purpose:
Let the guest choose the interface and translation language once at the beginning.

UI:
- Headline: `Please choose your language`
- Language cards for `Japanese`, `English`, `Chinese (Simplified)`, `Korean`
- Small room context label such as `Room 203`
- Primary CTA after selection: `Continue`
- Secondary helper text: `You can contact the front desk by chat or call`

States:
- `idle`
- `language_selected`
- `saving`
- `save_error`

Actions:
- Select one language
- Save language to current stay/session
- Continue to chat screen

Notes:
- Default selection should not be pre-filled.
- The selected language becomes the default for AI chat and call translation.

### 3. Guest Chat Screen

Purpose:
Serve as the main guest hub for AI support, human handoff, and call entry.

UI structure:
- Header
- Conversation area
- Quick action row
- Message composer

Header elements:
- Roomly logo
- Room number
- Current language chip
- Human availability status

Conversation area:
- AI and human messages in a LINE-like thread
- Distinct label for `AI` and `Front Desk`
- System notices such as `Connecting you to the front desk`
- Sticky bottom scroll behavior

Quick action row:
- `Call`
- `Chat with Front Desk`
- Dynamic quick question chips from hearing sheet categories

Message composer:
- Text input
- Send button
- Optional microphone trigger can be phase 2

States:
- `chat_idle`
- `ai_responding`
- `human_requested`
- `human_connected`
- `call_requesting`
- `call_unavailable`
- `session_expired`

Actions:
- Send message to AI
- Tap dynamic quick question chip
- Request human chat
- Start translated call

Behavior rules:
- AI is the default responder.
- After guest taps `Chat with Front Desk`, new messages route to the human thread.
- Previous AI messages remain visible in the same timeline.
- If human chat is unavailable, show a system message and keep AI available.

### 4. Call Request Sheet / Modal

Purpose:
Reduce accidental call starts and prepare microphone permission.

UI:
- Bottom sheet over chat screen
- Current room number
- Selected language and translation direction summary
- Primary CTA: `Start Call`
- Secondary CTA: `Cancel`
- Permission explanation for microphone access

States:
- `idle`
- `requesting_permission`
- `creating_call`
- `call_queue_waiting`
- `request_failed`

Actions:
- Request microphone permission
- Create call session
- Show fallback to chat if unavailable

Behavior rules:
- If all front staff are busy, show queue state first.
- If queue exceeds threshold, recommend switching to human chat.

### 5. In-Call Screen

Purpose:
Provide a simple, high-confidence translated call experience.

UI:
- Large status block showing one of:
  - `Connecting to front desk`
  - `You are connected`
  - `Translating...`
- Dual language indicator:
  - `You speak: English`
  - `Front desk hears: Japanese`
- Live transcript preview area
- Emergency highlight banner when urgent keywords are detected
- Bottom controls:
  - `Mute`
  - `Hold` or disabled for guest if not supported in MVP
  - `End Call`
  - `Switch to Chat`

States:
- `connecting`
- `connected_listening`
- `translating_guest_to_front`
- `translating_front_to_guest`
- `reconnecting`
- `ended`
- `failed`

Actions:
- End call
- Switch to chat
- Retry after failure

Behavior rules:
- Only translated audio is played back.
- Original audio should not be played to the other side.
- If translation pipeline is delayed, show `Translating...`
- If WebRTC fails, end the call cleanly and append a system message in chat.

### 6. Post-Checkout Survey Screen

Purpose:
Collect feedback when no active stay exists for the room.

UI:
- Thank you message
- Rating selector from 1 to 5
- Optional comment textarea
- Primary CTA: `Submit`
- Review redirect CTA after submit

States:
- `idle`
- `submitting`
- `submitted`
- `submit_error`

Actions:
- Submit survey
- Continue to external review links

## Primary User Flows

### Flow A: Simple AI Resolution

```text
QR scan
 -> stay active
 -> language selection
 -> chat screen
 -> guest taps quick chip or types question
 -> AI responds in selected language
 -> resolved
```

### Flow B: Human Chat Escalation

```text
chat screen
 -> guest taps Chat with Front Desk
 -> system posts connecting notice
 -> front receives notification
 -> human joins thread
 -> same chat timeline continues
```

### Flow C: Translated Call

```text
chat screen
 -> guest taps Call
 -> call request sheet
 -> microphone permission granted
 -> front receives call
 -> call connected
 -> translated conversation
 -> call ends
 -> summary notice appended to chat
```

### Flow D: Call Failure to Chat Fallback

```text
guest starts call
 -> front unavailable or connection fails
 -> system shows failure reason
 -> CTA to send message to front
 -> human chat thread opens
```

### Flow E: No Active Stay

```text
QR scan
 -> no active stay
 -> survey screen
```

## State Transition Model

```text
entry_checking
 -> language_selection
 -> guest_chat_ai
 -> guest_chat_human
 -> call_request
 -> in_call
 -> guest_chat_human

entry_checking
 -> survey
```

Detailed transitions:

- `entry_checking -> language_selection`
- `entry_checking -> survey`
- `language_selection -> guest_chat_ai`
- `guest_chat_ai -> guest_chat_human`
- `guest_chat_ai -> call_request`
- `call_request -> in_call`
- `call_request -> guest_chat_human`
- `in_call -> guest_chat_human`
- `in_call -> guest_chat_ai`
- `any_active_state -> survey` when stay expires and no active request remains

## Required Backend Dependencies

- `GET /api/guest/rooms/[roomId]/stay-status`
  - returns active stay status and room context
- `POST /api/guest/rooms/[roomId]/language`
  - stores selected guest language
- `POST /api/guest/chat`
  - creates or resumes AI thread
- `POST /api/guest/chat/handoff`
  - requests human takeover
- `POST /api/guest/calls`
  - creates call session
- `POST /api/guest/surveys`
  - stores survey response

API shapes can change, but these interaction boundaries need to exist.

## Firestore / Realtime Data Needed for UI

- Active stay by `room_id`
- Chat thread for current `stay_id`
- Messages list ordered by timestamp
- Human handoff status
- Call queue status
- Call session status
- Emergency flag status

## Events to Track

- `guest_qr_opened`
- `guest_language_selected`
- `guest_ai_message_sent`
- `guest_quick_chip_selected`
- `guest_human_chat_requested`
- `guest_call_requested`
- `guest_call_connected`
- `guest_call_failed`
- `guest_survey_submitted`

## MVP UI Content Rules

- Use short sentences with high readability for non-native speakers.
- Always show one primary action at a time when the system is waiting.
- Distinguish AI responses from human responses with label and color treatment.
- Use the accent color `#ad2218` for primary actions, urgent states, and connection banners.
- Keep the background primarily `#ffffff`.

## Open Decisions

- Whether guest language should be saved per stay or per browser session
- Whether call transcript preview is visible to the guest in MVP
- Whether guest can return from human chat mode to AI mode manually
- Whether survey should allow skip and direct exit without submit

## Recommended Next Step

After this document, define:

1. Guest screen wireframes
2. Front desk screen states that pair with guest call and chat events
3. API contract draft for stay check, chat handoff, and call session creation
