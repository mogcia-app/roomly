# Guest Operations

## Environment Variables

Required for production translation:

```bash
OPENAI_API_KEY=...
```

Optional:

```bash
OPENAI_TRANSLATION_MODEL=gpt-4o-mini
```

Firebase admin credentials must also be configured:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON=...
```

or:

```bash
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY=...
```

Fixed env names:

- `OPENAI_API_KEY`
- `OPENAI_TRANSLATION_MODEL`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`

## Guest Rich Menu Rules

- Firestore path is fixed to `guest_rich_menus/{hotelId}`
- Show only when `enabled === true`
- Show only `items[].visible === true`
- Sort by `sortOrder` ascending
- Use `imageUrl` as the background image
- Compute tap areas from `imageWidth` / `imageHeight`
- If the document does not exist, hide the rich menu

## Supported `actionType`

- `external_link`: `url` required
- `handoff_category`: `handoffCategory` required
- `language`: no extra fields
- `ai_prompt`: `prompt` required
- `human_handoff`: no extra fields

## Hearing Sheet Rules

- Source of truth is `hearing_sheets/{hotelId}`
- Missing categories must not crash the bot
- Room-specific data should override hotel-level data when present
- Emergency guidance must use `emergencyEntries` first
- Unknown answers must not be guessed

Supported hearing sheet categories:

- `frontDeskHours`
- `wifiNetworks`
- `breakfastEntries`
- `bathEntries`
- `facilityEntries`
- `facilityLocationEntries`
- `amenityEntries`
- `parkingEntries`
- `emergencyEntries`
- `faqEntries`
- `checkoutEntries`
- `roomServiceEntries`
- `transportEntries`
- `nearbySpotEntries`

## Translation Rules

- `body` is the guest-visible text in the current flow
- `original_body` and `original_language` keep the source
- `translated_body_front` is for front desk viewing
- `translated_body_guest` is for guest viewing
- `translation_state` must be one of:
  - `not_required`
  - `fallback`
  - `ready`

## Fallback Rules

- If `OPENAI_API_KEY` is missing, translation falls back without failing the chat
- If OpenAI translation fails, save the message with `translation_state = "fallback"`
- If rich menu data is invalid or missing, hide the menu
- If hearing sheet data is missing, fall back to front desk guidance
- If a rich menu action is missing required config, show a guest-safe error and log it

## Fixed Guest Copy

The current guest copy is fixed in `src/lib/guest-demo.ts`.

Primary Japanese copy:

- Intro: `ご用件をお聞かせください。内容に合わせてご案内します。`
- Delivery card: `お届け・ご依頼`
- Delivery description: `アメニティ追加などをフロントへ送ります`
- Room guide card: `館内・お部屋のご案内`
- Room guide description: `まずはAIがその場でご案内します`
- Rich menu config error: `このメニューは現在ご利用いただけません。フロントへご確認ください。`
- Unknown answer fallback: `フロントへご確認ください。`

If these strings change, update the guest UI copy and this document together.

## Logs To Monitor

- `[guest/messages] failed`
- `[guest/handoff] failed`
- `[guest/rich-menu] failed`
- `[guest/rich-menu] invalid or disabled rich menu`
- `[guest/rich-menu] unsupported action`
- `[guest/rich-menu] missing action config`
- `[guest/translation] openai response failed`
- `[guest/translation] empty translation output`
- `[guest/translation] OPENAI_API_KEY missing, using fallback translation`
- `[guest/translation] falling back`

## Launch Checklist

- Production env values are set
- `hearing_sheets/{hotelId}` exists for launch hotels
- `guest_rich_menus/{hotelId}` exists for launch hotels or menu is intentionally hidden
- Official site / Instagram / taxi / amenity actions are registered per hotel
- Rich menu image sizes follow one fixed template ratio
