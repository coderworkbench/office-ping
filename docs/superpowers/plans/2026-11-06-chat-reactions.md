# Chat Emoji and Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An emoji button in the chat composer and WhatsApp-style emoji reactions on chat messages, with live updates and a silent notification.

**Architecture:** A `MessageReaction` table (one row per person per message) in `apps/chat`, set or removed through `POST /api/chat/conversations/<id>/react/`, pushed to both members as a `chat_reaction` event on `/ws/notifications/`. The browser chat store (`lib/chat.ts`) applies reactions optimistically; `ConversationView` shows a quick bar, a pill under each bubble, and a built-in emoji picker above the message box.

**Tech Stack:** Django 5.2 + DRF + Channels (backend, pytest), Next.js 15 App Router + React 19 + Tailwind (frontend, no unit-test runner: `tsc`, `next build` and a browser check).

**Spec:** `docs/superpowers/specs/2026-11-06-chat-reactions-design.md`

## Global Constraints

- Branch: `feature/chat-reactions` (stacked on `feature/message-sound`, PR #8).
- One reaction per person per message; picking your current emoji removes it.
- Quick reactions, in this order: 👍 ❤️ 😂 😮 😢 🙏
- Built-in emoji set only (about 150, five tabs). No new npm or pip dependency.
- Emoji validation on the server: 1–16 characters, none of ASCII letters, digits, whitespace or `<>&"'`.
- Rate limit scope `chat_react`, `CHAT_REACT_RATE`, default `60/minute`; message sending keeps `chat_send`.
- Reaction notification: silent, `tag: chat-<conversation id>`, only for reactions to your own messages, never on removal, same `quiet` / `shouldNotify` rules as messages. No sound.
- Reactions never change unread counts, chat order or the audit log, and the Django admin doesn't show them.
- UI copy is American English, short and plain, like the rest of the app.
- Comments match the surrounding code: a short "why" line where it helps, no narration.

### How to run things

Backend tests run in a container built from the backend image with the source mounted, against the dev stack's Postgres (it must be running: `docker compose up -d postgres redis`):

```bash
docker build -q -t office-ping-backend:test backend
docker run --rm --user "$(id -u):$(id -g)" --network office-ping_default --env-file .env \
  -e POSTGRES_HOST=postgres -e REDIS_URL=redis://redis:6379/0 \
  -v "$PWD/backend:/app" office-ping-backend:test pytest tests/test_chat_reactions.py -q
```

Call this `BT <args>` below (replace `pytest tests/test_chat_reactions.py -q` with the command given).

Frontend checks, from `frontend/`:

```bash
npx --no-install tsc --noEmit
NEXT_TELEMETRY_DISABLED=1 npm run build
git checkout -- next-env.d.ts   # the build rewrites it; don't commit that
```

## File map

| File | Change |
|---|---|
| `backend/apps/chat/models.py` | `MessageReaction` model |
| `backend/apps/chat/migrations/0002_messagereaction.py` | generated |
| `backend/apps/chat/serializers.py` | `reaction_list()`, `message_dict(m, reactions=None)`, `ReactSerializer` |
| `backend/apps/chat/services.py` | `set_reaction()` |
| `backend/apps/chat/views.py` | prefetch reactions in `messages`; `react` action; throttle scope per action; shared deactivated check |
| `backend/apps/chat/broadcast.py` | `reacted()` |
| `backend/apps/notifications/consumers.py` | `chat_reaction` handler |
| `backend/config/settings.py`, `.env.example` | `chat_react` rate |
| `backend/tests/test_chat_reactions.py` | new |
| `backend/tests/test_chat_websockets.py` | one live test |
| `frontend/lib/emoji.ts` | new: quick reactions and the built-in set |
| `frontend/lib/chat.ts` | `Reaction` type, `reactions` on messages, `reactionError` on threads, `react()`, `onReaction()` |
| `frontend/components/ui.tsx` | `smile` icon |
| `frontend/components/chat/EmojiPicker.tsx` | new: picker panel and `useDismiss` |
| `frontend/components/chat/Reactions.tsx` | new: `ReactButton`, `ReactionBar`, `ReactionPill`, `useLongPress` |
| `frontend/components/chat/ConversationView.tsx` | composer emoji button, picker state, reactions on bubbles |
| `frontend/components/NotificationsRuntime.tsx` | handle `chat_reaction` |
| `frontend/content/manual.json`, `docs/user-manual.md` (generated) | Messages section |
| `frontend/components/Tour.tsx` | Messages stop |
| `docs/notifications.md`, `docs/websocket.md` | reactions |
| `frontend/content/releases.json`, `CHANGELOG.md` (generated), `frontend/package.json` | 1.6.0 |

---

### Task 1: Reaction model, and reactions on loaded messages

**Files:**
- Modify: `backend/apps/chat/models.py`
- Create: `backend/apps/chat/migrations/0002_messagereaction.py` (generated)
- Modify: `backend/apps/chat/serializers.py`
- Modify: `backend/apps/chat/views.py` (the `messages` GET)
- Test: `backend/tests/test_chat_reactions.py` (new)

**Interfaces:**
- Produces: `MessageReaction(message, user, emoji, created_at)`, `related_name="reactions"` on `Message`; `reaction_list(message) -> list[{"user_id": int, "emoji": str}]` (uses `message.reactions.all()`, so prefetch it); `message_dict(m, reactions=None)` now always has `"reactions"` (`[]` when not given).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_chat_reactions.py`:

```python
"""Emoji reactions on chat messages."""
import pytest
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.chat import broadcast
from apps.chat.models import MessageReaction

URL = "/api/chat/conversations/"


def api_as(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def pushed(monkeypatch):
    """Every channel-layer event the chat app sends, as (user_id, event)."""
    calls = []
    monkeypatch.setattr(broadcast, "_send", lambda uid, event: calls.append((uid, event)))
    return calls


def open_chat(me, other):
    r = api_as(me).post(URL, {"user_id": other.id}, format="json")
    assert r.status_code in (200, 201), r.data
    return r.data["id"]


def say(me, cid, body="Hello"):
    r = api_as(me).post(f"{URL}{cid}/messages/", {"body": body}, format="json")
    assert r.status_code == 201, r.data
    return r.data


def reactions_on(me, cid):
    r = api_as(me).get(f"{URL}{cid}/messages/")
    assert r.status_code == 200, r.data
    return {m["id"]: m["reactions"] for m in r.data["results"]}


# ---------- Storage and loading ----------

@pytest.mark.django_db
def test_messages_list_their_reactions_in_order(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    first = say(member_a, cid, "one")
    second = say(member_a, cid, "two")
    assert first["reactions"] == []
    MessageReaction.objects.create(message_id=first["id"], user=member_b, emoji="👍")
    MessageReaction.objects.create(message_id=first["id"], user=member_a, emoji="❤️")
    assert reactions_on(member_a, cid) == {
        first["id"]: [{"user_id": member_b.id, "emoji": "👍"}, {"user_id": member_a.id, "emoji": "❤️"}],
        second["id"]: [],
    }


@pytest.mark.django_db
def test_one_reaction_per_person_per_message(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    m = say(member_a, cid)
    MessageReaction.objects.create(message_id=m["id"], user=member_b, emoji="👍")
    with pytest.raises(IntegrityError), transaction.atomic():
        MessageReaction.objects.create(message_id=m["id"], user=member_b, emoji="❤️")


@pytest.mark.django_db
def test_loading_messages_costs_the_same_queries_however_many_have_reactions(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)

    def queries():
        c = api_as(member_a)
        with CaptureQueriesContext(connection) as ctx:
            assert c.get(f"{URL}{cid}/messages/").status_code == 200
        return len(ctx)

    m = say(member_a, cid, "first")
    MessageReaction.objects.create(message_id=m["id"], user=member_b, emoji="👍")
    few = queries()
    for i in range(10):
        m = say(member_a, cid, f"more {i}")
        MessageReaction.objects.create(message_id=m["id"], user=member_b, emoji="😂")
    assert queries() == few
```

- [ ] **Step 2: Run them to see them fail**

Run: `BT pytest tests/test_chat_reactions.py -q`
Expected: collection error, `ImportError: cannot import name 'MessageReaction'`.

- [ ] **Step 3: Add the model**

Append to `backend/apps/chat/models.py`:

```python


class MessageReaction(models.Model):
    """One emoji per person per message, as in WhatsApp: a new pick replaces it."""

    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="reactions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="chat_reactions")
    emoji = models.CharField(max_length=16)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("message", "user")]

    def __str__(self) -> str:
        return f"Reaction({self.emoji} on {self.message_id} by {self.user_id})"
```

- [ ] **Step 4: Generate the migration**

Run: `BT python manage.py makemigrations chat -n messagereaction`
Expected: `Migrations for 'chat': apps/chat/migrations/0002_messagereaction.py + Create model MessageReaction`.

- [ ] **Step 5: Serialize reactions**

In `backend/apps/chat/serializers.py`, replace `message_dict` with:

```python
def reaction_list(m):
    """A message's reactions, oldest first. Prefetch `reactions` when listing many."""
    rows = sorted(m.reactions.all(), key=lambda r: (r.created_at, r.id))
    return [{"user_id": r.user_id, "emoji": r.emoji} for r in rows]


def message_dict(m, reactions=None):
    return {"id": m.id, "conversation_id": m.conversation_id, "sender_id": m.sender_id,
            "body": m.body, "created_at": m.created_at.isoformat(),
            # A new message, or a chat-list preview, has none to show.
            "reactions": reactions if reactions is not None else []}
```

- [ ] **Step 6: Include them when loading messages**

In `backend/apps/chat/views.py`:
- add `reaction_list` to the `.serializers` import list (keep it alphabetical: `..., SendMessageSerializer, message_dict, reaction_list)`);
- in `messages`, change the GET part to prefetch and pass the reactions:

```python
        qs = Message.objects.filter(conversation_id=member.conversation_id).prefetch_related("reactions")
        before = request.query_params.get("before", "")
        if before.isascii() and before.isdigit():
            qs = qs.filter(id__lt=int(before))
        page = list(qs.order_by("-id")[:PAGE + 1])
        return Response({"results": [message_dict(m, reaction_list(m)) for m in reversed(page[:PAGE])],
                         "has_more": len(page) > PAGE})
```

- [ ] **Step 7: Run the tests**

Run: `BT pytest tests/test_chat_reactions.py tests/test_chat_api.py tests/test_migrations.py -q`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/chat/models.py backend/apps/chat/migrations/0002_messagereaction.py \
        backend/apps/chat/serializers.py backend/apps/chat/views.py backend/tests/test_chat_reactions.py
git commit -m "Store chat reactions and include them when loading messages"
```

---

### Task 2: React endpoint, rate limit and live push

**Files:**
- Modify: `backend/apps/chat/serializers.py` (`ReactSerializer`)
- Modify: `backend/apps/chat/services.py` (`set_reaction`)
- Modify: `backend/apps/chat/broadcast.py` (`reacted`)
- Modify: `backend/apps/chat/views.py` (`react`, throttles, deactivated check)
- Modify: `backend/apps/notifications/consumers.py` (`chat_reaction`)
- Modify: `backend/config/settings.py`, `.env.example`
- Test: `backend/tests/test_chat_reactions.py`, `backend/tests/test_chat_websockets.py`

**Interfaces:**
- Consumes: `MessageReaction`, `reaction_list`, `message_dict` from Task 1.
- Produces: `POST /api/chat/conversations/<id>/react/` `{message_id, emoji|null}` → 200 `{message_id, reactions}`; socket message `{"type": "chat_reaction", "payload": {conversation_id, message_id, user_id, emoji, reactions, reactor_name, message_sender_id, message_preview, quiet}}`.

- [ ] **Step 1: Write the failing API tests**

Append to `backend/tests/test_chat_reactions.py`:

```python


def react(me, cid, message_id, emoji):
    return api_as(me).post(f"{URL}{cid}/react/", {"message_id": message_id, "emoji": emoji}, format="json")


# ---------- Reacting ----------

@pytest.mark.django_db
def test_react_sets_replaces_and_removes(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    m = say(member_a, cid, "Report done?")
    r = react(member_b, cid, m["id"], "👍")
    assert r.status_code == 200, r.data
    assert r.data == {"message_id": m["id"], "reactions": [{"user_id": member_b.id, "emoji": "👍"}]}
    assert react(member_b, cid, m["id"], "❤️").data["reactions"] == [{"user_id": member_b.id, "emoji": "❤️"}]
    react(member_a, cid, m["id"], "🙏")
    r = react(member_b, cid, m["id"], None)
    assert r.data["reactions"] == [{"user_id": member_a.id, "emoji": "🙏"}]
    # Removing a reaction that isn't there is fine.
    assert react(member_b, cid, m["id"], None).status_code == 200
    assert MessageReaction.objects.count() == 1


@pytest.mark.django_db
def test_reacting_changes_no_unread_count_or_chat_order(member_a, member_b, hr_user, pushed):
    cid = open_chat(member_a, member_b)
    m = say(member_b, cid, "older chat")
    newer = open_chat(member_a, hr_user)
    say(hr_user, newer, "newer chat")
    react(member_b, cid, m["id"], "👍")
    r = api_as(member_a).get(URL)
    assert [c["id"] for c in r.data] == [newer, cid]
    assert {c["id"]: c["unread"] for c in r.data} == {newer: 1, cid: 1}


@pytest.mark.django_db
def test_react_refuses_outsiders_and_messages_from_other_chats(member_a, member_b, hr_user, pushed):
    cid = open_chat(member_a, member_b)
    other = open_chat(member_a, hr_user)
    m = say(member_a, cid)
    elsewhere = say(member_a, other)
    assert react(hr_user, cid, m["id"], "👍").status_code == 404
    r = react(member_b, cid, elsewhere["id"], "👍")
    assert r.status_code == 400 and "message_id" in r.data
    assert react(member_b, cid, 999999, "👍").status_code == 400
    r = api_as(member_b).post(f"{URL}{cid}/react/", {"message_id": m["id"]}, format="json")
    assert r.status_code == 400 and "emoji" in r.data


@pytest.mark.django_db
@pytest.mark.parametrize("emoji", ["", "ok", "1", "👍 ", "<b>", "&", "\"", "👍" * 17])
def test_react_takes_only_a_short_emoji(member_a, member_b, pushed, emoji):
    cid = open_chat(member_a, member_b)
    m = say(member_a, cid)
    r = react(member_b, cid, m["id"], emoji)
    assert r.status_code == 400 and "emoji" in r.data
    assert not MessageReaction.objects.exists()


@pytest.mark.django_db
def test_cannot_react_when_the_other_person_is_deactivated(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    m = say(member_b, cid)
    member_b.is_active = False
    member_b.save()
    assert react(member_a, cid, m["id"], "👍").status_code == 403


@pytest.mark.django_db
def test_a_reaction_is_pushed_to_both_people(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    m = say(member_a, cid, "Can you send the report?")
    member_a.status_kind = "DND"
    member_a.save()
    pushed.clear()
    react(member_b, cid, m["id"], "👍")
    assert sorted(uid for uid, _ in pushed) == sorted([member_a.id, member_b.id])
    for uid, event in pushed:
        assert event["type"] == "chat.reaction"
        assert event["payload"] == {
            "conversation_id": cid, "message_id": m["id"], "user_id": member_b.id, "emoji": "👍",
            "reactions": [{"user_id": member_b.id, "emoji": "👍"}], "reactor_name": "Mem B",
            "message_sender_id": member_a.id, "message_preview": "Can you send the report?",
            "quiet": uid == member_a.id,
        }
    pushed.clear()
    react(member_b, cid, m["id"], None)
    assert [(e["payload"]["emoji"], e["payload"]["reactions"]) for _, e in pushed] == [(None, [])] * 2


@pytest.mark.django_db
def test_the_pushed_preview_is_cut_to_80_characters(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    m = say(member_a, cid, "x" * 200)
    pushed.clear()
    react(member_b, cid, m["id"], "👍")
    assert pushed[0][1]["payload"]["message_preview"] == "x" * 79 + "…"


@pytest.mark.django_db
def test_reacting_has_its_own_rate_limit(member_a, member_b, pushed, monkeypatch):
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "chat_react", "2/minute")
    cid = open_chat(member_a, member_b)
    m = say(member_a, cid)
    assert react(member_b, cid, m["id"], "👍").status_code == 200
    assert react(member_b, cid, m["id"], "❤️").status_code == 200
    r = react(member_b, cid, m["id"], "😂")
    assert r.status_code == 429
    assert "You can send 2 reactions a minute." in str(r.data["detail"])
    # Sending messages has its own budget.
    say(member_b, cid, "still here")
```

- [ ] **Step 2: Write the failing socket test**

In `backend/tests/test_chat_websockets.py`, add after `read()`:

```python
@sync_to_async
def react(me, cid, message_id, emoji):
    r = api_as(me).post(f"{URL}{cid}/react/", {"message_id": message_id, "emoji": emoji},
                        format="json")
    assert r.status_code == 200, r.data
```

and after `test_reading_tells_both_people`:

```python
@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_a_reaction_reaches_both_people_live(member_a, member_b):
    cid = await open_chat(member_a, member_b)
    m = await say(member_a, cid, "Lunch?")
    a, b = await open_socket(member_a), await open_socket(member_b)
    await react(member_b, cid, m["id"], "👍")
    for sock in (a, b):
        msg = await sock.receive_json_from(timeout=2)
        assert msg["type"] == "chat_reaction"
        assert msg["payload"]["reactions"] == [{"user_id": member_b.id, "emoji": "👍"}]
    for sock in (a, b):
        await sock.disconnect()
```

- [ ] **Step 3: Run them to see them fail**

Run: `BT pytest tests/test_chat_reactions.py tests/test_chat_websockets.py -q`
Expected: the new tests fail with 404 (no `react/` route); Task 1's tests still pass.

- [ ] **Step 4: Validate the request**

In `backend/apps/chat/serializers.py`, add `import re` at the top, then after `MuteSerializer`:

```python
# The emoji set lives in the frontend; here we only keep text and markup out.
NOT_EMOJI = re.compile(r"""[A-Za-z0-9\s<>&"']""")


class ReactSerializer(serializers.Serializer):
    message_id = serializers.IntegerField()
    # null removes the caller's reaction.
    emoji = serializers.CharField(max_length=16, allow_null=True, trim_whitespace=False)

    def validate_emoji(self, value):
        if value is not None and NOT_EMOJI.search(value):
            raise serializers.ValidationError("Pick an emoji.")
        return value
```

- [ ] **Step 5: Store it**

In `backend/apps/chat/services.py`:
- change the imports to `from django.db import IntegrityError, transaction` and `from .models import Conversation, ConversationMember, Message, MessageReaction`, and add `reaction_list` to the `.serializers` import;
- append:

```python


def set_reaction(member, message, emoji):
    """Set or replace the member's reaction on a message, or remove it
    (emoji None). Returns the message's reactions afterwards."""
    mine = MessageReaction.objects.filter(message=message, user_id=member.user_id)
    if emoji is None:
        mine.delete()
    else:
        try:
            with transaction.atomic():
                MessageReaction.objects.update_or_create(
                    message=message, user_id=member.user_id, defaults={"emoji": emoji})
        except IntegrityError:  # the same person reacting twice at once
            mine.update(emoji=emoji)
    return reaction_list(message)
```

(`reaction_list` reads `message.reactions.all()` fresh, because `message` was loaded without a prefetch.)

- [ ] **Step 6: Push it**

In `backend/apps/chat/broadcast.py`, append:

```python


def reacted(msg, reactor, emoji, reactions):
    """Both members see the change; the author may get a quiet notification."""
    name = reactor.get_full_name() or reactor.username
    preview = msg.body if len(msg.body) <= 80 else msg.body[:79] + "…"
    for m in ConversationMember.objects.filter(conversation_id=msg.conversation_id).select_related("user"):
        _send(m.user_id, {"type": "chat.reaction", "payload": {
            "conversation_id": msg.conversation_id,
            "message_id": msg.id,
            "user_id": reactor.id,
            "emoji": emoji,
            "reactions": reactions,
            "reactor_name": name,
            "message_sender_id": msg.sender_id,
            "message_preview": preview,
            "quiet": m.user.wants_quiet,
        }})
```

In `backend/apps/notifications/consumers.py`, after `chat_typing`:

```python
    async def chat_reaction(self, event):
        await self.send_json({"type": "chat_reaction", "payload": event["payload"]})
```

- [ ] **Step 7: The endpoint, its rate limit and the shared deactivated check**

In `backend/config/settings.py`, inside `DEFAULT_THROTTLE_RATES` after `chat_send`:

```python
        # Chat reactions, counted apart from messages.
        "chat_react": config("CHAT_REACT_RATE", default="60/minute"),
```

In `.env.example`, after the `CHAT_RATE=30/minute` line:

```
# Chat reactions each person may add or change.
CHAT_REACT_RATE=60/minute
```

(Look at the lines around `CHAT_RATE` first and match their comment style.)

In `backend/apps/chat/views.py`:
- add `ReactSerializer` to the `.serializers` import;
- replace `get_throttles` and `throttled` with:

```python
    def get_throttles(self):
        # Only sending (CHAT_RATE) and reacting (CHAT_REACT_RATE) are limited.
        if self.action == "messages" and self.request.method == "POST":
            self.throttle_scope = "chat_send"
        elif self.action == "react":
            self.throttle_scope = "chat_react"
        else:
            return []
        return super().get_throttles()

    def throttled(self, request, wait):
        num, period, _ = parse_rate(ScopedRateThrottle.THROTTLE_RATES.get(self.throttle_scope))
        word = "reaction" if self.throttle_scope == "chat_react" else "message"
        noun = word if num == 1 else word + "s"
        raise PingRateLimited(wait=wait, detail=f"You can send {num} {noun} a {period}.")
```

- after `_member`, add:

```python
    def _refuse_if_deactivated(self, member):
        if ConversationMember.objects.filter(conversation_id=member.conversation_id,
                                             user__is_active=False).exists():
            raise PermissionDenied("This person's account is deactivated.")
```

- in `_send`, replace the three-line deactivated check with `self._refuse_if_deactivated(member)`;
- after `read`, add:

```python
    @action(detail=True, methods=["post"])
    def react(self, request, pk=None):
        member = self._member(pk)
        s = ReactSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        msg = (Message.objects.filter(pk=s.validated_data["message_id"],
                                      conversation_id=member.conversation_id).first())
        if msg is None:
            raise ValidationError({"message_id": "That message isn't in this chat."})
        self._refuse_if_deactivated(member)
        emoji = s.validated_data["emoji"]
        reactions = services.set_reaction(member, msg, emoji)
        broadcast.reacted(msg, request.user, emoji, reactions)
        return Response({"message_id": msg.id, "reactions": reactions})
```

- [ ] **Step 8: Run the tests**

Run: `BT pytest tests/test_chat_reactions.py tests/test_chat_websockets.py tests/test_chat_api.py -q`
Expected: all pass.

- [ ] **Step 9: Run the whole backend suite**

Run: `BT pytest -q`
Expected: everything passes except `tests/test_status_replies_escalation.py::test_escalate_command_runs_once`, which already fails on `main` (closed DB connection inside the command; unrelated).

- [ ] **Step 10: Commit**

```bash
git add backend/apps/chat backend/apps/notifications/consumers.py backend/config/settings.py \
        .env.example backend/tests/test_chat_reactions.py backend/tests/test_chat_websockets.py
git commit -m "Add the chat react endpoint, its rate limit and the chat_reaction push"
```

---

### Task 3: Emoji data and reactions in the chat store

**Files:**
- Create: `frontend/lib/emoji.ts`
- Modify: `frontend/lib/chat.ts`
- Modify: `frontend/components/ui.tsx` (`smile` icon)

**Interfaces:**
- Consumes: the API and socket payloads from Task 2.
- Produces:
  - `QUICK_REACTIONS: string[]`, `EMOJI_GROUPS: EmojiGroup[]`, `type EmojiGroup = { id: string; label: string; icon: string; emojis: string[] }` from `lib/emoji.ts`;
  - from `lib/chat.ts`: `type Reaction = { user_id: number; emoji: string }`; `ChatMessage.reactions: Reaction[]`; `Thread.reactionError: { messageId: number; text: string } | null`; `react(conversationId: number, messageId: number, emoji: string | null): Promise<void>`; `onReaction(p: { conversation_id: number; message_id: number; reactions: Reaction[] }): void`;
  - `Icon name="smile"`.

- [ ] **Step 1: The emoji set**

Create `frontend/lib/emoji.ts`:

```ts
// Emoji for chat: the quick reactions and the picker's built-in set.
// The device's own emoji font draws them; no images are downloaded.

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export type EmojiGroup = { id: string; label: string; icon: string; emojis: string[] };

const set = (s: string) => s.split(' ');

export const EMOJI_GROUPS: EmojiGroup[] = [
  { id: 'smileys', label: 'Smileys', icon: '😀', emojis: set(
    '😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 🙃 😉 😍 🥰 😘 😋 😎 🤩 🥳 😏 🤔 🤨 😐 😑 😶 🙄 😬 😌 😴 🤒 😷 🤧 😮 😯 😲 😳 🥺 😢 😭 😤 😡 🤯 😱 🤗 🤭') },
  { id: 'gestures', label: 'Gestures', icon: '👍', emojis: set(
    '👍 👎 👌 ✌️ 🤞 🤝 🙏 👏 🙌 👋 🤙 💪 👉 👈 👆 👇 ✋ 🖐️ ✊ 👊 ✍️ 🙋 🙆 🙅 🤷 🤦') },
  { id: 'hearts', label: 'Hearts and symbols', icon: '❤️', emojis: set(
    '❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 💕 💖 💯 ✨ ⭐ 🌟 🔥 ⚡ ✅ ❌ ❗ ❓') },
  { id: 'work', label: 'Work', icon: '💼', emojis: set(
    '📅 📆 ⏰ ⏳ 📌 📎 📝 📄 📊 📈 📉 💼 📁 📋 🖨️ 💻 🖥️ 📱 ☎️ 📞 📧 ✉️ 🔒 🔑 💡 🔧 🚗 🏢 ☕ 🍵 🍽️') },
  { id: 'celebrate', label: 'Celebrate', icon: '🎉', emojis: set(
    '🎉 🎊 🎂 🍰 🎁 🎈 🏆 🥇 🎯 🚀 🌸 🌺 🌞 🌈 🍕 🍔 🍩 🍫 🍿 🥤 🎶 🎵') },
];
```

- [ ] **Step 2: The `smile` icon**

In `frontend/components/ui.tsx`, inside `const paths`, after the `chat:` entry, add:

```tsx
  smile:  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    <path d="M9 9.5h.01M15 9.5h.01" />
  </>,
```

- [ ] **Step 3: Types in the store**

In `frontend/lib/chat.ts`:
- update the header comment's list of socket feeds to `(receiveMessage, onRead, onTyping, onReaction)`;
- replace the `ChatMessage` type and add `Reaction` above it:

```ts
export type Reaction = { user_id: number; emoji: string };
export type ChatMessage = {
  id: number; conversation_id: number; sender_id: number; body: string; created_at: string;
  reactions: Reaction[];
};
```

- replace `Thread` and `EMPTY_THREAD`:

```ts
export type Thread = {
  messages: ChatMessage[]; pending: Pending[];
  hasMore: boolean; loaded: boolean; loadingOlder: boolean;
  /** Why the last reaction didn't stick; shown under that message for a few seconds. */
  reactionError: { messageId: number; text: string } | null;
};
```

```ts
export const EMPTY_THREAD: Thread = {
  messages: [], pending: [], hasMore: false, loaded: false, loadingOlder: false, reactionError: null,
};
```

- [ ] **Step 4: `react()` and `onReaction()`**

In `frontend/lib/chat.ts`, after `onTyping`, add:

```ts
function setReactions(id: number, messageId: number, reactions: Reaction[]) {
  const t = state.threads[id];
  if (!t || !t.messages.some(m => m.id === messageId)) return;
  setThread(id, { messages: t.messages.map(m => m.id === messageId ? { ...m, reactions } : m) });
}

/** Someone (maybe us, on another device) reacted: the payload has the full list. */
export function onReaction(p: { conversation_id: number; message_id: number; reactions: Reaction[] }) {
  setReactions(p.conversation_id, p.message_id, p.reactions);
}

/** Set, replace or (emoji null) remove our reaction. Shown at once; undone if the server says no. */
export async function react(id: number, messageId: number, emoji: string | null) {
  const me = state.me;
  const before = thread(id).messages.find(m => m.id === messageId)?.reactions;
  if (me === null || !before) return;
  const others = before.filter(r => r.user_id !== me);
  setReactions(id, messageId, emoji ? [...others, { user_id: me, emoji }] : others);
  const s = session;
  try {
    const r = await apiFetch<{ message_id: number; reactions: Reaction[] }>(`/api/chat/conversations/${id}/react/`, {
      method: 'POST', body: JSON.stringify({ message_id: messageId, emoji }),
    });
    if (s === session) setReactions(id, messageId, r.reactions);
  } catch (e) {
    if (s !== session) return;
    setReactions(id, messageId, before);
    const text = e instanceof ApiError && [400, 403, 404, 429].includes(e.status)
      ? apiErrorMessage(e, "Couldn't react") : "Couldn't react";
    setThread(id, { reactionError: { messageId, text } });
    setTimeout(() => {
      if (thread(id).reactionError?.messageId === messageId) setThread(id, { reactionError: null });
    }, 4000);
  }
}
```

- [ ] **Step 5: Typecheck**

Run (in `frontend/`): `npx --no-install tsc --noEmit`
Expected: no errors. (If something builds a `ChatMessage` without `reactions`, add `reactions: []` there.)

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/emoji.ts frontend/lib/chat.ts frontend/components/ui.tsx
git commit -m "Add the emoji set and reactions to the chat store"
```

---

### Task 4: Emoji picker and the composer's emoji button

**Files:**
- Create: `frontend/components/chat/EmojiPicker.tsx`
- Modify: `frontend/components/chat/ConversationView.tsx` (Composer, picker state)

**Interfaces:**
- Consumes: `EMOJI_GROUPS` (Task 3), `Icon name="smile"` (Task 3), `react` (Task 3).
- Produces: `EmojiPicker({ label, onPick, onClose, boundary? })`, `useDismiss(ref, onClose)`; in `ConversationView.tsx`, `type Picker = null | 'compose' | { react: number }` and `Composer` props `{ id, name, picker, setPicker, onReactPick }`.

- [ ] **Step 1: The picker**

Create `frontend/components/chat/EmojiPicker.tsx`:

```tsx
'use client';

// The built-in emoji set in tabs, as a panel above the message box. The
// composer keeps it open for several picks; a reaction closes it after one.

import { RefObject, useEffect, useRef, useState } from 'react';
import { EMOJI_GROUPS } from '../../lib/emoji';

export function EmojiPicker({ label, onPick, onClose, boundary }: {
  label: string; onPick: (emoji: string) => void; onClose: () => void;
  /** A press outside this element closes the picker (default: the picker itself). */
  boundary?: RefObject<HTMLElement | null>;
}) {
  const [tab, setTab] = useState(EMOJI_GROUPS[0].id);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(boundary || box, onClose);
  const group = EMOJI_GROUPS.find(g => g.id === tab) || EMOJI_GROUPS[0];
  return (
    <div ref={box} role="dialog" aria-label={label}
         className="absolute inset-x-2 bottom-full z-20 mb-2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg sm:right-auto sm:w-[320px]">
      <div role="tablist" aria-label="Emoji groups" className="flex border-b border-line">
        {EMOJI_GROUPS.map(g => (
          <button key={g.id} type="button" role="tab" aria-selected={g.id === tab}
                  aria-label={g.label} title={g.label} onClick={() => setTab(g.id)}
                  className={'grid h-10 flex-1 place-items-center text-lg ' +
                    (g.id === tab ? 'border-b-2 border-brand bg-inset' : 'opacity-70 hover:opacity-100')}>
            {g.icon}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={group.label}
           className="grid max-h-[200px] grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain p-2">
        {group.emojis.map(e => (
          <button key={e} type="button" aria-label={e} onClick={() => onPick(e)}
                  className="grid h-9 place-items-center rounded-lg text-xl hover:bg-inset">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Close on Escape or on a press outside `ref`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [ref]);
}
```

- [ ] **Step 2: Picker state in `ConversationView`**

In `frontend/components/chat/ConversationView.tsx`:
- add `react,` to the `../../lib/chat` import (keep it alphabetical) and `import { EmojiPicker } from './EmojiPicker';`;
- under `type IconName`, add:

```ts
/** What the emoji panel above the message box is doing, if open. */
type Picker = null | 'compose' | { react: number };
```

- in `ConversationView`, after `const [pingOpen, setPingOpen] = useState(false);`, add:

```ts
  const [picker, setPicker] = useState<Picker>(null);
```

- add right after the existing `useEffect(() => { setFocused(id, true); ...` line:

```ts
  useEffect(() => { setPicker(null); }, [id]);
```

- after the `seen` constant (before `return`), add:

```ts
  const myEmoji = (messageId: number) =>
    t.messages.find(m => m.id === messageId)?.reactions.find(r => r.user_id === me)?.emoji ?? null;
  /** Your current emoji again removes it; any other sets or replaces it. */
  const pickReaction = (messageId: number, emoji: string) =>
    react(id, messageId, myEmoji(messageId) === emoji ? null : emoji);
```

- change the composer line to:

```tsx
        ? <Composer id={id} name={firstName} picker={picker} setPicker={setPicker} onReactPick={pickReaction} />
```

- [ ] **Step 3: The composer**

Replace the `Composer` function with:

```tsx
function Composer({ id, name, picker, setPicker, onReactPick }: {
  id: number; name: string; picker: Picker; setPicker: (p: Picker) => void;
  onReactPick: (messageId: number, emoji: string) => void;
}) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  // With a mouse, Enter sends and the box takes focus on open. On touch
  // screens Enter is a new line (Send is the button) and the keyboard
  // doesn't pop up uninvited.
  const [finePointer, setFinePointer] = useState(false);
  useEffect(() => { setFinePointer(window.matchMedia('(pointer: fine)').matches); }, []);
  useEffect(() => { if (finePointer) box.current?.focus({ preventScroll: true }); }, [id, finePointer]);

  // Grow with the text up to five lines, then scroll.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 5 * 22 + 18) + 'px';
  }, [text]);

  function submit() {
    if (!text.trim()) return;
    sendMessage(id, text);
    setText('');
  }

  /** Put the emoji where the cursor is (over any selection) and keep typing after it. */
  function insert(emoji: string) {
    const el = box.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    if (next.length > 4000) return;
    setText(next);
    sendTyping(id);
    requestAnimationFrame(() => {
      if (!el) return;
      // On a phone, focusing would bring the keyboard up over the picker.
      if (finePointer) el.focus({ preventScroll: true });
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  const reacting = picker && picker !== 'compose' ? picker.react : null;

  return (
    <form ref={form} onSubmit={e => { e.preventDefault(); submit(); }}
          className="relative flex shrink-0 items-end gap-1.5 border-t border-line p-2">
      {picker === 'compose' && (
        <EmojiPicker label="Emoji" boundary={form} onPick={insert}
                     onClose={() => { setPicker(null); if (finePointer) box.current?.focus({ preventScroll: true }); }} />
      )}
      {reacting !== null && (
        <EmojiPicker label="React with an emoji" onClose={() => setPicker(null)}
                     onPick={e => { onReactPick(reacting, e); setPicker(null); }} />
      )}
      <button type="button" onClick={() => setPicker(picker === 'compose' ? null : 'compose')}
              aria-label="Emoji" aria-expanded={picker === 'compose'} title="Emoji"
              className={'grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-inset ' +
                (picker === 'compose' ? 'bg-inset text-brand' : 'text-ink-2')}>
        <Icon name="smile" size={20} />
      </button>
      <textarea ref={box} rows={1} value={text} maxLength={4000}
                onChange={e => { setText(e.target.value); if (e.target.value.trim()) sendTyping(id); }}
                onKeyDown={e => {
                  if (finePointer && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={`Message ${name}…`} aria-label={`Message ${name}`}
                className="input min-h-[40px] flex-1 resize-none py-2 text-[15px] leading-[22px]" />
      <button type="submit" disabled={!text.trim()} aria-label="Send"
              className="btn-primary grid h-10 w-10 shrink-0 place-items-center !p-0">
        <Icon name="send" size={18} />
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Typecheck and build**

Run (in `frontend/`): `npx --no-install tsc --noEmit && NEXT_TELEMETRY_DISABLED=1 npm run build; git checkout -- next-env.d.ts`
Expected: no type errors, `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/chat/EmojiPicker.tsx frontend/components/chat/ConversationView.tsx
git commit -m "Add an emoji picker to the chat message box"
```

---

### Task 5: Reacting to messages and showing reactions

**Files:**
- Create: `frontend/components/chat/Reactions.tsx`
- Modify: `frontend/components/chat/ConversationView.tsx` (message rows, `Bubble`)

**Interfaces:**
- Consumes: `QUICK_REACTIONS` (Task 3), `Reaction` (Task 3), `useDismiss` (Task 4), `Picker` / `setPicker` / `pickReaction` / `myEmoji` (Task 4).
- Produces: `ReactButton({ onClick })`, `ReactionBar({ mine, current, onPick, onMore, onClose })`, `ReactionPill({ reactions, me, otherName, mine, onClick })`, `useLongPress(onLongPress: (key: number) => void) => (key: number) => handlers`.

- [ ] **Step 1: The reaction pieces**

Create `frontend/components/chat/Reactions.tsx`:

```tsx
'use client';

// WhatsApp-style reactions: a react button beside a bubble (mouse), a long
// press on it (touch), a quick bar of six plus ＋, and a pill under the bubble.

import { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useLayoutEffect, useRef, useState } from 'react';
import type { Reaction } from '../../lib/chat';
import { QUICK_REACTIONS } from '../../lib/emoji';
import { Icon } from '../ui';
import { useDismiss } from './EmojiPicker';

/** Shown beside a bubble on hover or keyboard focus; touch uses a long press instead. */
export function ReactButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="React" title="React"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 opacity-0 transition-opacity hover:bg-inset hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:hidden">
      <Icon name="smile" size={16} />
    </button>
  );
}

export function ReactionBar({ mine, current, onPick, onMore, onClose }: {
  mine: boolean; current: string | null;
  onPick: (emoji: string) => void; onMore: () => void; onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(false);
  useDismiss(box, onClose);
  // No room above the bubble at the top of the list: open below it instead.
  useLayoutEffect(() => {
    const el = box.current;
    const list = el?.closest('[role="log"]');
    if (el && list && el.getBoundingClientRect().top < list.getBoundingClientRect().top) setBelow(true);
  }, []);
  return (
    <div ref={box} role="toolbar" aria-label="React"
         className={'absolute z-20 flex items-center gap-0.5 rounded-full border border-line bg-surface p-1 shadow-lg ' +
           (below ? 'top-full mt-1 ' : 'bottom-full mb-1 ') + (mine ? 'right-0' : 'left-0')}>
      {QUICK_REACTIONS.map(e => (
        <button key={e} type="button" aria-label={e} aria-pressed={current === e} onClick={() => onPick(e)}
                className={'grid h-9 w-9 place-items-center rounded-full text-xl transition-transform hover:scale-125 ' +
                  (current === e ? 'bg-brand-soft' : '')}>
          {e}
        </button>
      ))}
      <button type="button" aria-label="More emoji" title="More emoji" onClick={onMore}
              className="grid h-9 w-9 place-items-center rounded-full text-lg font-bold text-ink-2 hover:bg-inset">
        ＋
      </button>
    </div>
  );
}

/** Each emoji once, then a count when there's more than one reaction. */
export function ReactionPill({ reactions, me, otherName, mine, onClick }: {
  reactions: Reaction[]; me: number | null; otherName: string; mine: boolean; onClick: () => void;
}) {
  const emojis = Array.from(new Set(reactions.map(r => r.emoji)));
  const includesMine = reactions.some(r => r.user_id === me);
  const who = reactions.map(r => `${r.user_id === me ? 'You' : otherName} reacted ${r.emoji}`).join(' · ');
  return (
    <button type="button" onClick={onClick} title={who}
            aria-label={who + (includesMine ? '. Remove your reaction.' : '')}
            className={'absolute -bottom-3.5 flex h-6 items-center gap-0.5 rounded-full border bg-surface px-1.5 text-[13px] leading-none text-ink shadow-sm ' +
              (mine ? 'right-2 ' : 'left-2 ') + (includesMine ? 'border-brand ring-1 ring-brand/30' : 'border-line')}>
      {emojis.map(e => <span key={e}>{e}</span>)}
      {reactions.length > 1 && <span className="ml-0.5 text-[11px] font-semibold text-ink-2">{reactions.length}</span>}
    </button>
  );
}

/** Half a second on a touch screen without moving: `onLongPress(key)`. */
export function useLongPress(onLongPress: (key: number) => void) {
  const timer = useRef<number | null>(null);
  const from = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    from.current = null;
  };
  return (key: number) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse') return;
      fired.current = false;
      from.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        onLongPress(key);
      }, 500);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const f = from.current;
      if (f && Math.hypot(e.clientX - f.x, e.clientY - f.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    // The long press opened our bar: no browser menu on top of it.
    onContextMenu: (e: ReactMouseEvent) => { if (fired.current) e.preventDefault(); },
  });
}
```

- [ ] **Step 2: A `Bubble` that can carry them**

In `frontend/components/chat/ConversationView.tsx`:
- add `HTMLAttributes,` to the `react` import and `import { ReactButton, ReactionBar, ReactionPill, useLongPress } from './Reactions';`;
- replace `Bubble` with:

```tsx
function Bubble({ mine, time, faded, children, pill, side, overlay, press }: {
  mine: boolean; time: string; faded?: boolean; children: ReactNode;
  /** Reactions, hanging off the bubble's bottom edge. */
  pill?: ReactNode;
  /** The react button beside the bubble. */
  side?: ReactNode;
  /** The quick reaction bar, above (or below) the bubble. */
  overlay?: ReactNode;
  press?: HTMLAttributes<HTMLDivElement>;
}) {
  return (
    <div className={'group relative my-1 flex items-center gap-1 ' + (mine ? 'flex-row-reverse' : '')}>
      <div {...press}
           className={'relative max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[14px] leading-snug ' +
             (mine ? 'rounded-br-md bg-gold-fill text-on-gold' : 'rounded-bl-md border border-line bg-surface-2 text-ink') +
             (faded ? ' opacity-60' : '') + (pill ? ' mb-4' : '') +
             (press ? ' [-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none' : '')}>
        {children}
        {time && <span className={'ml-2 inline-block text-[10px] ' + (mine ? 'text-on-gold/70' : 'text-ink-3')}>{time}</span>}
        {pill}
      </div>
      {side}
      {overlay}
    </div>
  );
}
```

- [ ] **Step 3: Message rows**

In `ConversationView`:
- after `const [picker, setPicker] = useState<Picker>(null);`, add:

```ts
  const [bar, setBar] = useState<number | null>(null);   // message whose quick bar is open
  const longPress = useLongPress(setBar);
```

- extend the reset-on-chat-change effect to `useEffect(() => { setPicker(null); setBar(null); }, [id]);`
- after `pickReaction`, add:

```ts
  const canReact = other.is_active;
```

- replace the `t.messages.map(...)` block with:

```tsx
        {t.messages.map((m, i) => {
          const prev = t.messages[i - 1];
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          const mine = m.sender_id === me;
          const current = myEmoji(m.id);
          const error = t.reactionError?.messageId === m.id ? t.reactionError.text : null;
          return (
            <Fragment key={m.id}>
              {newDay && <DayDivider label={dayLabel(m.created_at)} />}
              <Bubble mine={mine} time={clockTime(m.created_at)}
                      press={canReact ? longPress(m.id) : undefined}
                      side={canReact ? <ReactButton onClick={() => setBar(m.id)} /> : null}
                      overlay={bar === m.id ? (
                        <ReactionBar mine={mine} current={current} onClose={() => setBar(null)}
                                     onPick={e => { pickReaction(m.id, e); setBar(null); }}
                                     onMore={() => { setBar(null); setPicker({ react: m.id }); }} />
                      ) : null}
                      pill={m.reactions.length ? (
                        <ReactionPill reactions={m.reactions} me={me} otherName={firstName} mine={mine}
                                      onClick={() => current ? react(id, m.id, null) : canReact && setBar(m.id)} />
                      ) : null}>
                {linkify(m.body)}
              </Bubble>
              {error && <p className={'mb-1 text-[12px] font-semibold text-rose-deep ' + (mine ? 'text-right' : '')}>{error}</p>}
              {m === lastMine && seen && <p className="mb-1 text-right text-[11px] font-semibold text-ink-3">Seen</p>}
            </Fragment>
          );
        })}
```

(Pending bubbles keep using `Bubble` without `press`, `side`, `overlay` or `pill`, so they can't be reacted to.)

- [ ] **Step 4: Typecheck and build**

Run (in `frontend/`): `npx --no-install tsc --noEmit && NEXT_TELEMETRY_DISABLED=1 npm run build; git checkout -- next-env.d.ts`
Expected: no type errors, `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/chat/Reactions.tsx frontend/components/chat/ConversationView.tsx
git commit -m "React to chat messages with a quick bar, long press and reaction pills"
```

---

### Task 6: Notification, docs, release 1.6.0 and an end-to-end check

**Files:**
- Modify: `frontend/components/NotificationsRuntime.tsx`
- Modify: `frontend/content/manual.json`, `frontend/components/Tour.tsx`, `docs/notifications.md`, `docs/websocket.md`
- Modify: `frontend/content/releases.json`, `frontend/package.json`
- Generated: `docs/user-manual.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `onReaction` (Task 3), `shouldNotify`, `showNotification` (existing), the `chat_reaction` payload (Task 2).

- [ ] **Step 1: The notification**

In `frontend/components/NotificationsRuntime.tsx`:
- add `onReaction` to the `../lib/chat` import (alphabetical);
- after the `chat_message` branch, before `} else if (msg.type === 'chat_read') {`, add:

```tsx
      } else if (msg.type === 'chat_reaction') {
        const p = msg.payload;
        onReaction(p);
        // Only reactions to our own messages, never removals; silent, one per chat.
        if (p.emoji && p.user_id !== uid && p.message_sender_id === uid && !p.quiet && shouldNotify(p.conversation_id)) {
          await showNotification(`${p.reactor_name} reacted ${p.emoji}`, `to: ${p.message_preview}`, {
            tag: `chat-${p.conversation_id}`, url: `/messages?c=${p.conversation_id}`, sticky: false, silent: true,
          });
        }
```

- [ ] **Step 2: Typecheck**

Run (in `frontend/`): `npx --no-install tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: User manual**

In `frontend/content/manual.json`, section `"id": "messages"`:
- in the `"Start a chat"` steps, after the step that starts `"Type your message."`, add the step:
  `"For an emoji, click the 🙂 next to the message box and pick one; it goes where your cursor is. (You can also use **Windows + .** or your phone's keyboard.)"`
- after that `steps` block (before the paragraph about the **Messages** bar), add:

```json
        {
          "h3": "React to a message"
        },
        {
          "list": [
            "On a computer, point at a message and click the 🙂 beside it. On a phone, press and hold the message.",
            "Pick 👍 ❤️ 😂 😮 😢 🙏, or **＋** for more. Your reaction shows under the message for both of you.",
            "Each person has one reaction per message: pick another to change it, or the same one (or the reaction under the message) to remove it."
          ]
        },
```

- in the `"Notifications and Do Not Disturb"` list, after the first item, add:
  `"When someone reacts to one of your messages you get a quiet desktop notification (no sound), with the same rules."`

Then from the repo root run `node scripts/export-manual.mjs`.
Expected: `Wrote docs/user-manual.md` and `Wrote CHANGELOG.md`.

- [ ] **Step 4: Tour and developer docs**

In `frontend/components/Tour.tsx`, the Messages stop's `body` becomes:
`'One-to-one chat with emoji and reactions: a short soft sound and a red number, but no pop-up, so it never interrupts like a ping does.'`

In `docs/notifications.md`, in the ping/chat table after the `| Sound |` row, add:

```
| Reactions | — | Silent desktop notification for a reaction to your own message (`chat_reaction`), same rules as messages; removals never notify |
```

In `docs/websocket.md`:
- in the server → client JSON block, after the `chat_typing` line, add:

```json
{ "type": "chat_reaction",
  "payload": { "conversation_id": 5, "message_id": 812, "user_id": 47, "emoji": "👍",
               "reactions": [{ "user_id": 47, "emoji": "👍" }], "reactor_name": "Rahul S",
               "message_sender_id": 12, "message_preview": "Can you send the report?", "quiet": false } }
```

- after the `chat_typing goes only to the other member.` bullet, add:

```
- `chat_reaction` goes to both members when someone sets, changes or removes
  a reaction (`emoji` is null on removal). `reactions` is the message's full
  list afterwards, so clients replace rather than patch. Reactions are set
  over REST (`POST /api/chat/conversations/<id>/react/`).
```

- [ ] **Step 5: Release 1.6.0**

In `frontend/content/releases.json`, add at the top of `releases` (use the day it goes live as `date`; it must not be earlier than 1.5.0's):

```json
    {
      "version": "1.6.0",
      "date": "2026-11-06",
      "title": "Emoji and reactions in chat",
      "changes": [
        { "kind": "new", "text": "An emoji button next to the message box, with about 150 emojis in five tabs." },
        { "kind": "new", "text": "React to a message with 👍 ❤️ 😂 😮 😢 🙏 or **＋** for more: point at it on a computer, or press and hold on a phone. One reaction each; pick again to change or remove it." },
        { "kind": "new", "text": "A quiet desktop notification when someone reacts to your message, unless that chat is open, muted, or you're *In a meeting* or on *Do not disturb*." }
      ]
    },
```

In `frontend/package.json`, set `"version": "1.6.0"`. Run `node scripts/export-manual.mjs` again.
Expected: both files written, no validation error.

- [ ] **Step 6: Build**

Run (in `frontend/`): `npx --no-install tsc --noEmit && NEXT_TELEMETRY_DISABLED=1 npm run build; git checkout -- next-env.d.ts`
Expected: `✓ Compiled successfully`.

- [ ] **Step 7: End-to-end check in a browser**

Bring up a throwaway copy of the stack on port 8099 (the dev stack on 8080 stays untouched):

```bash
printf 'services:\n  nginx:\n    ports: !override\n      - "8099:80"\n' > /tmp/compose.smoke.yml
docker compose -p opdeps -f docker-compose.yml -f /tmp/compose.smoke.yml up -d --build
docker compose -p opdeps exec -T backend python manage.py seed_demo   # password ChangeMe123!
```

With two browser sessions (`mangesh` and `rahul`), check:
1. In a chat, the 🙂 button opens the picker; clicking two emojis inserts both at the cursor; Escape closes it.
2. Hovering one of rahul's messages as mangesh shows the react button; 👍 shows a pill under the message, live in rahul's window too.
3. Picking ❤️ replaces it; picking ❤️ again (or clicking the pill) removes it, in both windows.
4. ＋ opens the picker above the message box in reaction mode; one pick reacts and closes it.
5. At 390 px wide (phone), a long press on a message opens the quick bar; no horizontal scroll.
6. No console errors.

Then tear it down: `docker compose -p opdeps down -v --rmi local`.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/NotificationsRuntime.tsx frontend/components/Tour.tsx frontend/content \
        frontend/package.json docs/notifications.md docs/websocket.md docs/user-manual.md CHANGELOG.md
git commit -m "Notify about reactions, document emoji and reactions, release 1.6.0"
```
