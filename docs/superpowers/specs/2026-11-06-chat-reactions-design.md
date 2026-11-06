# Chat emoji and reactions: design

Date: 2026-11-06
Status: approved in brainstorming, awaiting spec review

## Goal

Make one-to-one chat feel like WhatsApp in two ways:

1. An emoji button in the message box that opens a small built-in picker.
2. Emoji reactions on messages: a quick bar of six, plus the picker for
   anything else, one reaction per person per message.

Chat stays the quieter channel: a reaction to your message gives a silent
desktop notification, never a sound, an unread number or a pop-up.

## Decisions

| Topic | Decision |
|---|---|
| Reaction model | WhatsApp-style. One reaction per person per message. Picking another emoji replaces yours; picking your current one removes it. |
| Quick reactions | 👍 ❤️ 😂 😮 😢 🙏, plus ＋ for the full built-in set. |
| Picker | A small built-in set of about 150 emojis in five tabs, in our own code. No library, no search, no skin tones. People can still use Windows+. or a phone keyboard for anything else. |
| Rendering | The device's own emoji font. No images. |
| Storage | A `MessageReaction` table, unique per (message, user). |
| Transport | Set/remove over REST; push to browsers over `/ws/notifications/`. |
| Alerts | Silent desktop notification for a reaction to your own message, under the same rules as message notifications. Removing a reaction never notifies. |
| Unread, order, audit | Reactions don't change unread counts, chat-list order or the audit log. |
| Not in this change | Reactions on pings, several reactions per person, a full emoji library with search, "recently used", reaction lists for group chats. |

## Backend

### Model: `MessageReaction` (`apps/chat`)

- `message`: FK to `Message`, `CASCADE`, `related_name="reactions"`.
- `user`: FK to the user model, `CASCADE`.
- `emoji`: `CharField(max_length=16)`.
- `created_at`: auto.
- Unique together `(message, user)`.

One migration, `0002_messagereaction`.

### Serialization

`message_dict()` gains `reactions: [{user_id, emoji}]`, ordered by
`created_at`. A new message has `reactions: []`. The messages list
(`GET …/messages/`) uses `prefetch_related("reactions")`, so a page costs one
extra query, not one per message.

### REST API

`POST /api/chat/conversations/<id>/react/` with
`{"message_id": <int>, "emoji": "<emoji>" | null}`.

- Sets or replaces the caller's reaction (`update_or_create`), or removes it
  when `emoji` is null. Removing a reaction that doesn't exist is a no-op.
- Response: `{"message_id", "reactions": [{user_id, emoji}]}` (the message's
  reactions after the change), status 200.
- Errors, following the rest of chat:
  - not a member of the conversation: 404;
  - message not in this conversation: 400 `{"message_id": …}`;
  - emoji empty, longer than 16 characters, or containing ASCII letters,
    digits, whitespace or `<>&"'`: 400 `{"emoji": …}`;
  - the other member is deactivated: 403, as for sending.

The server doesn't hold the exact emoji list, because the frontend and
backend are built separately; the check above keeps text and markup out.

### Rate limiting

New scope `chat_react`, `config("CHAT_REACT_RATE", default="60/minute")`,
only on `react`. It doesn't use the `chat_send` budget. The 429 message
follows the existing wording ("You can send 60 reactions a minute.").

## Real-time

New row for the socket table:

| Channel type | Socket message type | Recipients | Payload |
|---|---|---|---|
| `chat.reaction` | `chat_reaction` | both members | `{conversation_id, message_id, user_id, emoji, reactions, reactor_name, message_sender_id, message_preview, quiet}` |

- `emoji` is null when a reaction was removed.
- `reactions` is the message's full list after the change, so clients replace
  rather than patch and can't drift.
- `message_preview` is the message body cut to 80 characters (with "…").
- `quiet` is per recipient (`wants_quiet`), so one `group_send` per member,
  as for `chat.message`.
- `NotificationConsumer` gains a `chat_reaction` handler that forwards the
  payload unchanged.
- Best effort, like the other chat pushes. A browser that was offline gets
  current reactions when it reloads the thread (it already resyncs on
  reconnect).

## Frontend

### `lib/emoji.ts`

- `QUICK_REACTIONS`: the six quick emojis.
- `EMOJI_GROUPS`: `{ id, label, icon, emojis[] }` for Smileys, Gestures,
  Hearts, Work and Celebrate, about 150 emojis in total.

### Chat store (`lib/chat.ts`)

- `ChatMessage` gains `reactions: { user_id: number; emoji: string }[]`.
- `react(conversationId, messageId, emoji | null)`: optimistic update, then
  `POST …/react/`; on success apply the returned list; on failure restore the
  previous list and surface the error (a short line under the message, like
  "Not sent").
- `onReaction(payload)`: replace the message's `reactions` if the message is
  loaded; otherwise ignore it.

### `components/chat/EmojiPicker.tsx`

- Tabs along the top, an emoji grid below; each emoji is a button labelled
  with the emoji itself (screen readers speak its name).
- Always a panel just above the message box, full width in a dock window or
  on a phone, 320 px wide on larger screens. One place for both modes, so it
  is never cut off by the top of the message list.
- Escape and a press outside close it.
- Props: `label`, `onPick(emoji)`, `onClose()`, `boundary?` (the element a
  press must land outside of to close it; the composer passes its form so
  the 🙂 button and the text box don't close it).

### Composer

- A 🙂 button to the left of the text box opens the picker in `keepOpen` mode.
- A pick inserts the emoji at the cursor (replacing any selection), moves the
  cursor after it and keeps focus in the text box. It counts as typing.

### Reacting

- Desktop (`pointer: fine`): hovering or focusing a sent bubble shows a small
  react button beside it (on the side away from the screen edge). Clicking it
  opens the quick bar.
- Touch: a long press (500 ms, cancelled by movement) on a bubble opens the
  quick bar; the text-selection menu is suppressed for that press.
- Quick bar: the six emojis plus ＋, above the bubble (below it when there
  is no room at the top of the list). ＋ closes the bar and opens the picker
  above the message box in reaction mode (closes after one pick). Your
  current reaction is highlighted in the bar.
- Reacting needs the other person's account to be active (as for sending),
  so the react controls are hidden for a deactivated person.
- Picking: your current emoji removes it; any other sets or replaces it.
- Pending ("Sending…") and failed bubbles can't be reacted to.

### Showing reactions

- A pill overlapping the bottom edge of the bubble, on the bubble's own side.
- Each distinct emoji once, then the total count when it's above 1.
- Highlighted (brand ring) when it includes your reaction.
- Title / screen-reader text: "You reacted 👍 · Rahul reacted ❤️".
- Clicking the pill removes your reaction if you have one; otherwise it opens
  the quick bar.
- The message list's bottom spacing grows for a bubble with a pill so pills
  never cover the next bubble.

### Notification (`NotificationsRuntime`)

On `chat_reaction`:

1. `onReaction(payload)`.
2. Notify only when all hold: `emoji` is set, `user_id` isn't me,
   `message_sender_id` is me, `!quiet`, `shouldNotify(conversation_id)`
   (not muted, not the chat on screen).
3. `showNotification("<reactor_name> reacted <emoji>", "to: <preview>",
   { tag: "chat-<id>", url: "/messages?c=<id>", sticky: false, silent: true })`.
   Same tag as message notifications, so a chat never stacks notifications.

No sound for reactions.

## Error handling

| Case | Behaviour |
|---|---|
| React request fails (network, 4xx, 429) | Optimistic reaction rolled back; the error text shows under the bubble for a few seconds. |
| Message deleted or chat left between load and react | 400/404 → rolled back with the server's message. |
| Other person deactivated | 403 → rolled back: "This person's account is deactivated." |
| Socket event for a message not loaded | Ignored; the thread shows current reactions when loaded. |
| Two quick reactions from the same person | Last write wins on the server; each socket event carries the full list. |

## Testing

### Backend (pytest)

- Set, replace and remove a reaction; removing a missing reaction is a no-op.
- 404 for a non-member, 400 for a message from another chat, 400 for invalid
  emoji (letters, digits, empty, too long, markup), 403 when the other person
  is deactivated.
- `chat.reaction` sent to both members with the full list, `quiet` per
  recipient, `emoji: null` on removal.
- `GET …/messages/` includes reactions, with a fixed number of queries
  regardless of page size.
- The `chat_react` throttle applies to `react` only and not to sending.
- The consumer forwards `chat_reaction`.

### Frontend

- `tsc --noEmit` and `next build`.
- In a browser on a throwaway docker stack, two users:
  - the emoji button inserts at the cursor;
  - a reaction from one shows live for the other; replacing and removing work;
  - long press on a phone-sized window opens the quick bar;
  - no console errors, no horizontal scroll at 390 px.

## Documentation

- User manual, Messages section: the emoji button, how to react (hover /
  long press), replacing and removing, and the reaction notification rule.
- Tour: the Messages stop mentions emoji and reactions.
- `docs/notifications.md`: a row for reactions.
- `docs/websocket.md`: the `chat_reaction` message.
- Release history: **1.6.0**, "Emoji and reactions in chat".

## Rollout

One migration (`0002_messagereaction`), applied by the backend on start-up
as usual. Branches from `feature/message-sound` (PR #7) because it touches
the same files; the PR targets `main` once #7 is merged.
