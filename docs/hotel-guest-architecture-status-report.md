# Hotel/Guest Architecture Status Report

## Summary

guest 側の実装を、hotel 側で合意した以下の前提に寄せる対応を進めました。

- 正本は `stays / chat_threads / messages`
- guest 側の `cookie / query / local state` は表示補助のみ
- 言語の第一正本は `stays.guest_language`
- handoff 状態の正本は `chat_threads.handoff_status`
- 未読の正本は `chat_threads.unread_count_front / unread_count_guest`
- 通知は `message 保存 -> thread 更新 -> unread 更新 -> handoff 更新 -> notification dispatch` の順

## Confirmed Decisions From Hotel Side

hotel 側から以下の方針で確定回答を受領しています。

- `stays.guest_language` を言語の本採用フィールドとする
- `chat_threads.handoff_status` を handoff 状態の本採用フィールドとする
- `chat_threads.unread_count_front / unread_count_guest` を未読の本採用フィールドとする
- front 返信・人手対応開始時の handoff は `accepted`
- 通知順序は `message 保存 -> thread 更新 -> unread 更新 -> handoff 更新 -> notification dispatch` で固定
- `event_type` は後方互換用に残すが、新規判定の主軸には使わない
- 未読減算は
  - front 側: 会話オープン時
  - guest 側: 会話閲覧時

このため、guest 側も今後は上記を前提にロジックを固定してよい状態です。

## Reflected On Guest Side

### 1. Language Resolution

guest 側の画面・API で、言語判定に `cookie` や `lang query` を使うのをやめ、`stays` 由来の値を優先する形へ変更しました。

対象:

- `guest/[roomId]`
- `guest/[roomId]/chat`
- `guest/[roomId]/language`
- `api/guest/rooms/[roomId]/stay-status`
- `api/guest/rooms/[roomId]/messages`
- `api/guest/rooms/[roomId]/handoff`

補足:

- `cookie` は言語変更直後の表示補助としてのみ残しています
- 新規の判定ロジックでは `stays.guest_language` を優先しています

### 2. Stay Language Update

guest 側の言語変更 API で、thread のみではなく active stay にも言語を書き戻すように変更しました。

現在の更新対象:

- `stays.guest_language`
- `stays.guestLanguage` (互換用)
- `chat_threads.guest_language` (互換コピー)

## 3. Thread Metadata Alignment

`chat_threads` の更新時に、hotel 側の判定前提に合わせて以下を反映するように変更しました。

- `handoff_status`
- `unread_count_front`
- `unread_count_guest`
- `last_message_sender`
- `last_message_body`

現在の扱い:

- human thread への guest 投稿時: `handoff_status = requested`
- front 返信時: `unread_count_guest` を増加
- human thread に front が入った時: `handoff_status = accepted`
- `event_type` は後方互換用として残すが、新規判定は `handoff_status` 優先

## 4. Notification Ordering

frontdesk push 通知は、`chat_threads` 更新後にのみ呼ぶように修正済みです。

意図:

- `roomly-console` 側が `chat_threads.unread_count_front` と `last_message_sender` を見て push 判定するため
- `thread` 更新前の通知 API 呼び出しを避けるため

## 5. Guest UI Display Changes

guest chat UI は `messages` だけでなく `chat_threads` のメタ情報も受け取るように変更しました。

反映済み表示:

- `handoff_status = requested / accepted` に応じた状態バナー
- `unread_count_guest` に基づく未読バッジ

補足:

- handoff 中は starter 表示も direct-contact 寄りに調整しています

## Backward Compatibility

読み取り時は当面以下の混在に対応しています。

- snake_case / camelCase 混在
- `chat_threads.handoff_status` がない場合は `event_type` を補助的に参照
- `chat_threads.guest_language` は互換コピーとして扱う

## Current Validation

guest 側変更については以下を確認済みです。

- `eslint`
- `next build`

build は通過しています。

## Remaining Work

今回の対応で「正本に寄せる土台」は入っていますが、以下は引き続き整理対象です。

### 1. Handoff/UI Complete Alignment

- guest UI の handoff 表示をさらに `chat_threads.handoff_status` 基準へ統一
- `pending_handoff_*` 系との責務整理

### 2. Unread Lifecycle

- `unread_count_guest` の減算を guest 会話閲覧時に揃える実装
- `unread_count_front` の減算を front 会話オープン時に揃える実装
- `messages.read_* / seen_*` を補助扱いに寄せる整理

### 3. Thread Grouping

- `1 stay = 1 conversation group` 前提での guest 側 mode/thread 取り扱い簡素化
- AI/human の切り替えを UI 上どう見せるかの最終整理

### 4. Schema Cleanup

- 互換用フィールドをいつまで残すか
- `guest_language` / `guestLanguage` など重複フィールドの整理時期

## Next Implementation Focus

確定方針を受けて、guest 側の次の実装優先順位は以下です。

1. `event_type` 依存の判定を整理し、`handoff_status` 優先へ完全移行
2. guest 会話閲覧時の `unread_count_guest` 減算実装
3. front 返信時の `handoff_status = accepted` 前提で UI 表示を最終調整
4. `messages.read_* / seen_*` を未読主判定から外し、補助扱いへ縮退
