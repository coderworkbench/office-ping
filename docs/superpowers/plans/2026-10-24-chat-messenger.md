# Chat Messenger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-to-one text chat to Office Ping: a LinkedIn-style dock on desktop, a Messages section on phones, with read receipts, a typing indicator and quiet desktop notifications.

**Architecture:** A new Django app `apps/chat` stores conversations and messages and exposes a REST API under `/api/chat/`. Sending goes over REST; the server pushes `chat.message`, `chat.read` and `chat.typing` events to each member's existing `user.<id>` channel group, which the existing `/ws/notifications/` consumer forwards to the browser. In the browser a small store (`lib/chat.ts`) is fed by `NotificationsRuntime` and read by the dock and the `/messages` page.

**Tech Stack:** Django 5.0, DRF 3.15, Channels 4.1 (Redis layer; in-memory in tests), pytest + pytest-asyncio; Next.js 14.2 App Router, React 18, Tailwind 3 (Sunbeam tokens).

**Spec:** [docs/superpowers/specs/2026-10-24-chat-messenger-design.md](../specs/2026-10-24-chat-messenger-design.md). Read it before starting.

## Global Constraints

- One-to-one chat only. `Conversation.kind` has a single value, `DIRECT`; nothing in this plan builds group chats.
- Message body: plain text, max **4,000** characters after trimming; empty after trimming is rejected.
- Chat list preview: message body truncated to **140** characters.
- Message pages: **30** messages per page.
- Rate limit: DRF scope `chat_send`, default **`30/minute`**, overridable with `CHAT_RATE` in `.env`. Only sending a message is throttled.
- Conversations the caller is not a member of answer **404** on every endpoint.
- Audit: `CHAT_STARTED` once per new conversation, `target` = the other user's username, `metadata = {"conversation_id": id}`. Message text is never written to the audit log or shown in Django admin.
- Chat never opens an in-app pop-up, never plays a sound, never uses `requireInteraction`, and never notifies while the recipient is *In a meeting* or *Do not disturb* (`User.wants_quiet`).
- Typing events: browser sends at most one per conversation every **3 s**; the indicator disappears **5 s** after the last event or when a message arrives.
- Desktop dock only at ≥1024px (`lg`). Up to **2** windows at ≥1280px, **1** below.
- Phone tab bar: Overview, People, Inbox, **Messages**, More. History moves into More.
- Match surrounding code: comment density, naming, Sunbeam Tailwind tokens (`bg-surface`, `text-ink`, `bg-gold-fill`, `text-on-gold`, `bg-live`, …), existing classes (`input`, `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-sm`, `surface`).
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch `feature/chat-messenger`.

### How to run things

The dev container doesn't mount the source, so backend tests run in a throwaway container with `backend/` mounted. From the repo root:

```bash
# all backend tests (or append a test path / -k filter)
docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD/backend:/app" backend pytest -p no:cacheprovider
# a management command, e.g. makemigrations
docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD/backend:/app" backend python manage.py makemigrations chat audit
```

**Known baseline failure:** `tests/test_status_replies_escalation.py::test_escalate_command_runs_once` already fails on `main` ("the connection is closed"). It is unrelated; every other test must pass.

The frontend has no unit-test runner and no ESLint config (`npm run lint` would start an interactive set-up, so don't run it). Frontend tasks are verified with `npm run typecheck` and `npm run build` (from `frontend/`, after `npm ci` once), and Task 9 checks the behaviour in a real browser.

---

### Task 1: Chat app, models and the `CHAT_STARTED` audit action

**Files:**
- Create: `backend/apps/chat/__init__.py` (empty)
- Create: `backend/apps/chat/apps.py`
- Create: `backend/apps/chat/models.py`
- Create: `backend/apps/chat/admin.py`
- Create: `backend/apps/chat/migrations/__init__.py` (empty)
- Create (generated): `backend/apps/chat/migrations/0001_initial.py`
- Create (generated): `backend/apps/audit/migrations/0003_alter_auditlog_action.py`
- Modify: `backend/config/settings.py` (`INSTALLED_APPS`)
- Modify: `backend/apps/audit/models.py` (`AuditLog.Action`)
- Test: `backend/tests/test_chat_models.py`

**Interfaces:**
- Produces: `Conversation` (`kind`, `direct_key`, `created_at`, `last_message_at`, `Conversation.Kind.DIRECT`, `Conversation.key_for(a_id, b_id) -> str`), `ConversationMember` (`conversation`, `user`, `last_read_message`, `muted`; reverse name `conversation.members`), `Message` (`conversation`, `sender`, `body`, `created_at`; reverse name `conversation.messages`), `AuditLog.Action.CHAT_STARTED`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_chat_models.py`:

```python
import pytest
from django.contrib import admin
from django.db import IntegrityError

from apps.audit.models import AuditLog
from apps.chat.models import Conversation, ConversationMember, Message


def test_direct_key_is_the_same_whichever_way_round():
    assert Conversation.key_for(47, 12) == Conversation.key_for(12, 47) == "12:47"


@pytest.mark.django_db
def test_a_pair_can_only_have_one_direct_conversation():
    Conversation.objects.create(direct_key="1:2")
    with pytest.raises(IntegrityError):
        Conversation.objects.create(direct_key="1:2")


@pytest.mark.django_db
def test_a_person_is_a_member_of_a_conversation_once(member_a):
    conv = Conversation.objects.create(direct_key="1:2")
    ConversationMember.objects.create(conversation=conv, user=member_a)
    with pytest.raises(IntegrityError):
        ConversationMember.objects.create(conversation=conv, user=member_a)


def test_audit_log_knows_chat_started():
    assert AuditLog.Action.CHAT_STARTED == "CHAT_STARTED"


def test_message_admin_never_shows_the_text():
    ma = admin.site._registry[Message]
    for attr in ("list_display", "fields", "search_fields", "readonly_fields"):
        assert "body" not in (getattr(ma, attr) or ())
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD/backend:/app" backend pytest -p no:cacheprovider tests/test_chat_models.py`
Expected: collection error, `ModuleNotFoundError: No module named 'apps.chat'`.

- [ ] **Step 3: Create the app**

`backend/apps/chat/apps.py`:

```python
from django.apps import AppConfig


class ChatConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.chat"
    label = "chat"
```

`backend/apps/chat/models.py`:

```python
from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """A chat between people. Only one-to-one (DIRECT) chats exist for now;
    members live in ConversationMember so group chats can be added later."""

    class Kind(models.TextChoices):
        DIRECT = "DIRECT", "Direct"

    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.DIRECT)
    # "<smaller user id>:<larger user id>", so two people have exactly one chat.
    direct_key = models.CharField(max_length=41, unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Sorts the chat list; null until the first message.
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)

    @staticmethod
    def key_for(a_id: int, b_id: int) -> str:
        lo, hi = sorted((a_id, b_id))
        return f"{lo}:{hi}"

    def __str__(self) -> str:
        return f"Conversation({self.id} {self.direct_key or self.kind})"


class ConversationMember(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE,
                                     related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="chat_memberships")
    # Everything up to and including this message has been read. Drives the
    # unread count and the other person's "Seen".
    last_read_message = models.ForeignKey("Message", on_delete=models.SET_NULL,
                                          null=True, blank=True, related_name="+")
    # No desktop notifications for this chat; the unread count still updates.
    muted = models.BooleanField(default=False)

    class Meta:
        unique_together = [("conversation", "user")]
        indexes = [models.Index(fields=["user", "conversation"])]

    def __str__(self) -> str:
        return f"Member({self.conversation_id}:{self.user_id})"


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE,
                                     related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="chat_messages")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["conversation", "-id"])]

    def __str__(self) -> str:
        return f"Message({self.id} in {self.conversation_id})"
```

`backend/apps/chat/admin.py`:

```python
from django.contrib import admin

from .models import Conversation, ConversationMember, Message


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "kind", "direct_key", "created_at", "last_message_at")


@admin.register(ConversationMember)
class ConversationMemberAdmin(admin.ModelAdmin):
    list_display = ("conversation", "user", "last_read_message", "muted")
    raw_id_fields = ("conversation", "user", "last_read_message")


# Chats are private: admin shows that messages exist, never what they say.
@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "sender", "created_at")
    fields = ("conversation", "sender", "created_at")
    readonly_fields = ("conversation", "sender", "created_at")

    def has_add_permission(self, request):
        return False
```

In `backend/config/settings.py`, add the app after `"apps.notifications",`:

```python
    "apps.notifications",
    "apps.chat",
```

In `backend/apps/audit/models.py`, add after `PINGS_EXPORTED = "PINGS_EXPORTED"`:

```python
        CHAT_STARTED = "CHAT_STARTED"
```

- [ ] **Step 4: Generate the migrations**

Run: `docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD/backend:/app" backend python manage.py makemigrations chat audit`
Expected: creates `apps/chat/migrations/0001_initial.py` and `apps/audit/migrations/0003_alter_auditlog_action.py`. Open both and check they only contain the models above and the new action choice.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD/backend:/app" backend pytest -p no:cacheprovider tests/test_chat_models.py tests/test_migrations.py`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/chat backend/apps/audit backend/config/settings.py backend/tests/test_chat_models.py
git commit -m "Add chat app with conversation, member and message models

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chat REST API and server-side fan-out

**Files:**
- Create: `backend/apps/chat/serializers.py`
- Create: `backend/apps/chat/services.py`
- Create: `backend/apps/chat/broadcast.py`
- Create: `backend/apps/chat/views.py`
- Create: `backend/apps/chat/urls.py`
- Modify: `backend/config/urls.py`
- Modify: `backend/config/settings.py` (`DEFAULT_THROTTLE_RATES`)
- Modify: `.env.example`
- Modify: `docs/architecture.md`
- Test: `backend/tests/test_chat_api.py`

**Interfaces:**
- Consumes: Task 1 models; `apps.accounts.serializers.UserSerializer`; `apps.audit.utils.record_audit(request, action, *, target, metadata)`; `apps.notifications.services.user_group_name(user_id) -> str`; `apps.notifications.views.PingRateLimited`, `parse_rate(rate) -> (num, period_name, seconds)`.
- Produces (Task 3 and the frontend rely on these):
  - `apps.chat.services.peer_ids(conversation_id: int, user_id: int) -> list[int] | None` (None when `user_id` isn't a member).
  - `apps.chat.serializers.message_dict(m) -> {"id", "conversation_id", "sender_id", "body", "created_at"}`.
  - `apps.chat.broadcast._send(user_id, event)`: the single choke point for channel-layer pushes (tests monkeypatch it).
  - Channel events: `{"type": "chat.message", "payload": {"conversation_id", "message": message_dict, "sender_name", "client_id", "quiet"}}` and `{"type": "chat.read", "payload": {"conversation_id", "user_id", "message_id"}}`.
  - REST (JSON shapes in the spec's API table): `GET/POST /api/chat/conversations/`, `GET /api/chat/conversations/<id>/`, `GET/POST /api/chat/conversations/<id>/messages/`, `POST …/<id>/read/` → `{"unread_total"}`, `POST …/<id>/mute/` → `{"muted"}`, `GET /api/chat/unread/` → `{"unread_total"}`.
  - Conversation JSON: `{"id", "other": {"id", "full_name", "department", "designation", "is_online", "is_active", "last_seen_at", "status"}, "last_message": message_dict with body ≤140 chars | null, "last_message_at": iso | null, "unread": int, "muted": bool, "other_last_read_id": int | null}`.
  - Messages page JSON: `{"results": [message_dict, … oldest first], "has_more": bool}`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_chat_api.py`:

```python
import pytest
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.audit.models import AuditLog
from apps.chat import broadcast
from apps.chat.models import Conversation, ConversationMember, Message

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


def say(me, conv_id, body="Hello", **extra):
    r = api_as(me).post(f"{URL}{conv_id}/messages/", {"body": body, **extra}, format="json")
    assert r.status_code == 201, r.data
    return r.data


def listing(user):
    r = api_as(user).get(URL)
    assert r.status_code == 200, r.data
    return {c["id"]: c for c in r.data}, [c["id"] for c in r.data]


# ---------- Opening a chat ----------

@pytest.mark.django_db
def test_opening_a_chat_twice_returns_the_same_conversation(member_a, member_b, pushed):
    first = api_as(member_a).post(URL, {"user_id": member_b.id}, format="json")
    again = api_as(member_b).post(URL, {"user_id": member_a.id}, format="json")
    assert (first.status_code, again.status_code) == (201, 200)
    assert first.data["id"] == again.data["id"]
    assert first.data["other"]["id"] == member_b.id
    assert again.data["other"]["id"] == member_a.id
    assert Conversation.objects.count() == 1


@pytest.mark.django_db
def test_cannot_chat_with_yourself_a_deactivated_or_unknown_person(member_a, member_b):
    c = api_as(member_a)
    assert c.post(URL, {"user_id": member_a.id}, format="json").status_code == 400
    member_b.is_active = False
    member_b.save()
    assert c.post(URL, {"user_id": member_b.id}, format="json").status_code == 400
    assert c.post(URL, {"user_id": 999999}, format="json").status_code == 400


@pytest.mark.django_db
def test_starting_a_chat_is_audited_once_without_any_text(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    open_chat(member_b, member_a)
    say(member_a, cid, "secret plan")
    logs = AuditLog.objects.filter(action="CHAT_STARTED")
    assert logs.count() == 1
    log = logs.get()
    assert (log.actor, log.target, log.metadata) == (member_a, "mem_b", {"conversation_id": cid})
    assert not AuditLog.objects.filter(metadata__icontains="secret plan").exists()


# ---------- Privacy ----------

@pytest.mark.django_db
def test_outsiders_get_404_everywhere(member_a, member_b, hr_user, pushed):
    cid = open_chat(member_a, member_b)
    c = api_as(hr_user)
    assert c.get(f"{URL}{cid}/").status_code == 404
    assert c.get(f"{URL}{cid}/messages/").status_code == 404
    assert c.post(f"{URL}{cid}/messages/", {"body": "hi"}, format="json").status_code == 404
    assert c.post(f"{URL}{cid}/read/", {"message_id": 1}, format="json").status_code == 404
    assert c.post(f"{URL}{cid}/mute/", {"muted": True}, format="json").status_code == 404
    assert c.get(URL).data == []


# ---------- The chat list ----------

@pytest.mark.django_db
def test_list_is_newest_first_with_preview_and_unread(member_a, member_b, hr_user, admin_user, pushed):
    quiet = open_chat(member_a, admin_user)        # no messages: sorts last
    with_b = open_chat(member_a, member_b)
    with_hr = open_chat(member_a, hr_user)
    say(member_b, with_b, "first")
    say(hr_user, with_hr, "x" * 200)

    rows, order = listing(member_a)
    assert order == [with_hr, with_b, quiet]
    assert rows[with_hr]["last_message"]["body"] == "x" * 140
    assert rows[with_b]["other"]["full_name"] == "Mem B"
    assert (rows[with_b]["unread"], rows[with_hr]["unread"], rows[quiet]["unread"]) == (1, 1, 0)
    assert rows[quiet]["last_message"] is None


# ---------- Messages ----------

@pytest.mark.django_db
def test_messages_come_in_pages_of_30_oldest_first(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    Message.objects.bulk_create(
        [Message(conversation_id=cid, sender=member_a, body=f"m{i}") for i in range(35)])
    c = api_as(member_b)

    page = c.get(f"{URL}{cid}/messages/").data
    assert [m["body"] for m in page["results"]] == [f"m{i}" for i in range(5, 35)]
    assert page["has_more"] is True

    older = c.get(f"{URL}{cid}/messages/?before={page['results'][0]['id']}").data
    assert [m["body"] for m in older["results"]] == [f"m{i}" for i in range(5)]
    assert older["has_more"] is False


@pytest.mark.django_db
def test_message_body_is_trimmed_and_checked(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    c = api_as(member_a)
    for bad in ("", "   ", "x" * 4001):
        assert c.post(f"{URL}{cid}/messages/", {"body": bad}, format="json").status_code == 400
    assert say(member_a, cid, "  hi  ")["body"] == "hi"


@pytest.mark.django_db
def test_sending_updates_the_list_and_counts_as_read_for_the_sender(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    m = say(member_a, cid, "Hi")
    mine, _ = listing(member_a)
    theirs, _ = listing(member_b)
    assert mine[cid]["last_message"]["id"] == m["id"]
    assert mine[cid]["last_message_at"] is not None
    assert (mine[cid]["unread"], theirs[cid]["unread"]) == (0, 1)


@pytest.mark.django_db
def test_a_message_is_pushed_to_both_people(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    pushed.clear()
    m = say(member_a, cid, "Hi", client_id="tmp-1")
    assert sorted(uid for uid, _ in pushed) == sorted([member_a.id, member_b.id])
    for _, event in pushed:
        assert event["type"] == "chat.message"
        p = event["payload"]
        assert (p["conversation_id"], p["message"]["id"], p["client_id"], p["sender_name"]) == \
            (cid, m["id"], "tmp-1", "Mem A")


@pytest.mark.django_db
def test_a_recipient_in_do_not_disturb_gets_it_quietly(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    member_b.status_kind = "DND"
    member_b.save()
    pushed.clear()
    say(member_a, cid, "Hi")
    quiet = {uid: event["payload"]["quiet"] for uid, event in pushed}
    assert quiet == {member_a.id: False, member_b.id: True}


@pytest.mark.django_db
def test_cannot_send_to_a_deactivated_person_but_can_still_read(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    say(member_a, cid, "before")
    member_b.is_active = False
    member_b.save()
    c = api_as(member_a)
    assert c.post(f"{URL}{cid}/messages/", {"body": "after"}, format="json").status_code == 403
    assert [m["body"] for m in c.get(f"{URL}{cid}/messages/").data["results"]] == ["before"]


@pytest.mark.django_db
def test_sending_is_rate_limited(member_a, member_b, pushed, monkeypatch):
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "chat_send", "2/minute")
    cid = open_chat(member_a, member_b)
    say(member_a, cid, "one")
    say(member_a, cid, "two")
    r = api_as(member_a).post(f"{URL}{cid}/messages/", {"body": "three"}, format="json")
    assert r.status_code == 429
    assert "You can send 2 messages a minute." in str(r.data["detail"])
    # Reading isn't throttled.
    assert api_as(member_a).get(f"{URL}{cid}/messages/").status_code == 200


# ---------- Reading ----------

@pytest.mark.django_db
def test_read_marker_only_moves_forward_and_tells_both_people(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    m1 = say(member_a, cid, "one")
    m2 = say(member_a, cid, "two")
    c = api_as(member_b)
    pushed.clear()

    r = c.post(f"{URL}{cid}/read/", {"message_id": m2["id"]}, format="json")
    assert r.data == {"unread_total": 0}
    reads = [(uid, e["payload"]) for uid, e in pushed if e["type"] == "chat.read"]
    assert sorted(uid for uid, _ in reads) == sorted([member_a.id, member_b.id])
    assert reads[0][1] == {"conversation_id": cid, "user_id": member_b.id, "message_id": m2["id"]}

    pushed.clear()
    c.post(f"{URL}{cid}/read/", {"message_id": m1["id"]}, format="json")
    assert pushed == []
    member = ConversationMember.objects.get(conversation_id=cid, user=member_b)
    assert member.last_read_message_id == m2["id"]
    assert listing(member_a)[0][cid]["other_last_read_id"] == m2["id"]


@pytest.mark.django_db
def test_read_rejects_a_message_from_another_chat(member_a, member_b, hr_user, pushed):
    with_b = open_chat(member_a, member_b)
    with_hr = open_chat(member_a, hr_user)
    other = say(hr_user, with_hr, "not yours")
    r = api_as(member_b).post(f"{URL}{with_b}/read/", {"message_id": other["id"]}, format="json")
    assert r.status_code == 400


@pytest.mark.django_db
def test_unread_total_counts_messages_from_others(member_a, member_b, hr_user, pushed):
    with_a = open_chat(member_b, member_a)
    with_hr = open_chat(member_b, hr_user)
    say(member_a, with_a, "1")
    say(member_a, with_a, "2")
    say(hr_user, with_hr, "3")
    say(member_b, with_hr, "my own reply doesn't count")
    assert api_as(member_b).get("/api/chat/unread/").data == {"unread_total": 2}
    assert api_as(member_a).get("/api/chat/unread/").data == {"unread_total": 0}
```

Note on the last test: `member_b` replying in `with_hr` moves `member_b`'s read marker to that reply, so hr's "3" counts as read. The expected total is the 2 messages from `member_a`.

Same file, continued:

```python
# ---------- Muting ----------

@pytest.mark.django_db
def test_muting_a_chat(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    r = api_as(member_a).post(f"{URL}{cid}/mute/", {"muted": True}, format="json")
    assert r.data == {"muted": True}
    assert listing(member_a)[0][cid]["muted"] is True
    assert listing(member_b)[0][cid]["muted"] is False
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD/backend:/app" backend pytest -p no:cacheprovider tests/test_chat_api.py`
Expected: FAIL with `ImportError: cannot import name 'broadcast' from 'apps.chat'`.

- [ ] **Step 3: Write the serializers**

`backend/apps/chat/serializers.py`:

```python
from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.serializers import UserSerializer

User = get_user_model()

MAX_BODY = 4000
PREVIEW = 140
# What a chat shows about the other person.
PERSON_FIELDS = ("id", "full_name", "department", "designation", "is_online",
                 "is_active", "last_seen_at", "status")


def person_dict(user):
    data = UserSerializer(user).data
    return {k: data[k] for k in PERSON_FIELDS}


def message_dict(m):
    return {"id": m.id, "conversation_id": m.conversation_id, "sender_id": m.sender_id,
            "body": m.body, "created_at": m.created_at.isoformat()}


class OpenConversationSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()

    def validate_user_id(self, value):
        if value == self.context["request"].user.id:
            raise serializers.ValidationError("You can't start a chat with yourself.")
        try:
            return User.objects.get(pk=value, is_active=True)
        except User.DoesNotExist:
            raise serializers.ValidationError("That person isn't available.")


class SendMessageSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=MAX_BODY)
    # Echoed back on the socket so the sending tab can swap its "Sending…" bubble.
    client_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")


class ReadSerializer(serializers.Serializer):
    message_id = serializers.IntegerField()


class MuteSerializer(serializers.Serializer):
    muted = serializers.BooleanField()
```

- [ ] **Step 4: Write the services**

`backend/apps/chat/services.py`:

```python
"""Chat queries and writes, shared by the REST views and the socket consumer."""
from django.db import transaction
from django.db.models import BigIntegerField, Count, F, IntegerField, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce

from .models import Conversation, ConversationMember, Message
from .serializers import PREVIEW, message_dict, person_dict


def open_direct(me, other):
    """The one conversation between two people, created on first use.
    Returns (conversation, created)."""
    with transaction.atomic():
        conv, created = Conversation.objects.get_or_create(
            direct_key=Conversation.key_for(me.id, other.id),
            defaults={"kind": Conversation.Kind.DIRECT},
        )
        if created:
            ConversationMember.objects.bulk_create([
                ConversationMember(conversation=conv, user=me),
                ConversationMember(conversation=conv, user=other),
            ])
    return conv, created


def _unread(user):
    """Per membership: messages from others after the member's read marker."""
    after_marker = Coalesce(OuterRef("last_read_message_id"), Value(0),
                            output_field=BigIntegerField())
    counts = (Message.objects
              .filter(conversation=OuterRef("conversation"), id__gt=after_marker)
              .exclude(sender_id=user.id)
              .order_by().values("conversation").annotate(n=Count("id")).values("n"))
    return Coalesce(Subquery(counts, output_field=IntegerField()), Value(0),
                    output_field=IntegerField())


def _memberships(user):
    newest = Message.objects.filter(conversation=OuterRef("conversation")).order_by("-id").values("id")[:1]
    return (ConversationMember.objects.filter(user=user)
            .select_related("conversation")
            .annotate(unread=_unread(user), last_id=Subquery(newest)))


def summaries(user, conversation_id=None):
    """The caller's chats for the chat list, most recent activity first."""
    mine = _memberships(user).order_by(
        F("conversation__last_message_at").desc(nulls_last=True), "-conversation_id")
    if conversation_id is not None:
        mine = mine.filter(conversation_id=conversation_id)
    mine = list(mine)
    ids = [m.conversation_id for m in mine]
    others = {o.conversation_id: o for o in ConversationMember.objects
              .filter(conversation_id__in=ids).exclude(user=user).select_related("user")}
    lasts = Message.objects.in_bulk([m.last_id for m in mine if m.last_id])
    rows = []
    for m in mine:
        other = others[m.conversation_id]
        last = lasts.get(m.last_id)
        at = m.conversation.last_message_at
        rows.append({
            "id": m.conversation_id,
            "other": person_dict(other.user),
            "last_message": last and {**message_dict(last), "body": last.body[:PREVIEW]},
            "last_message_at": at and at.isoformat(),
            "unread": m.unread,
            "muted": m.muted,
            "other_last_read_id": other.last_read_message_id,
        })
    return rows


def unread_total(user) -> int:
    return sum(_memberships(user).values_list("unread", flat=True))


def send_message(member, body):
    """Store a message; the sender has read everything up to it."""
    with transaction.atomic():
        msg = Message.objects.create(conversation_id=member.conversation_id,
                                     sender_id=member.user_id, body=body)
        Conversation.objects.filter(pk=member.conversation_id).update(last_message_at=msg.created_at)
        ConversationMember.objects.filter(pk=member.pk).update(last_read_message=msg)
    return msg


def mark_read(member, message_id) -> bool:
    """Move the read marker forward to message_id. True if it moved."""
    return bool(ConversationMember.objects.filter(pk=member.pk).filter(
        Q(last_read_message__isnull=True) | Q(last_read_message_id__lt=message_id)
    ).update(last_read_message_id=message_id))


def peer_ids(conversation_id, user_id):
    """The other members' ids, or None if user_id isn't a member."""
    ids = list(ConversationMember.objects.filter(conversation_id=conversation_id)
               .values_list("user_id", flat=True))
    if user_id not in ids:
        return None
    return [i for i in ids if i != user_id]
```

- [ ] **Step 5: Write the broadcaster**

`backend/apps/chat/broadcast.py`:

```python
"""Push chat events to members' open tabs over /ws/notifications/.

Best effort: the database is the source of truth and browsers resync when
their socket reconnects, so a failed push is logged, never raised.
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from apps.notifications.services import user_group_name
from .models import ConversationMember
from .serializers import message_dict

logger = logging.getLogger(__name__)


def _send(user_id, event):
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(user_group_name(user_id), event)
    except Exception:
        logger.exception("Failed chat push to user %s", user_id)


def message_sent(msg, client_id=""):
    """To every member, including the sender's other tabs and devices."""
    sender = msg.sender
    name = sender.get_full_name() or sender.username
    for m in ConversationMember.objects.filter(conversation_id=msg.conversation_id).select_related("user"):
        _send(m.user_id, {"type": "chat.message", "payload": {
            "conversation_id": msg.conversation_id,
            "message": message_dict(msg),
            "sender_name": name,
            "client_id": client_id,
            # In a meeting / do not disturb: no desktop notification.
            "quiet": m.user.wants_quiet,
        }})


def read(conversation_id, user_id, message_id):
    """The other person sees "Seen"; the reader's other tabs clear the badge."""
    payload = {"conversation_id": conversation_id, "user_id": user_id, "message_id": message_id}
    for uid in ConversationMember.objects.filter(conversation_id=conversation_id).values_list("user_id", flat=True):
        _send(uid, {"type": "chat.read", "payload": payload})
```

- [ ] **Step 6: Write the views and URLs**

`backend/apps/chat/views.py`:

```python
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.audit.utils import record_audit
from apps.notifications.views import PingRateLimited, parse_rate
from . import broadcast, services
from .models import ConversationMember, Message
from .serializers import (MuteSerializer, OpenConversationSerializer, ReadSerializer,
                          SendMessageSerializer, message_dict)

PAGE = 30


class ConversationViewSet(viewsets.ViewSet):
    """The caller's one-to-one chats. A conversation the caller isn't in
    answers 404, so its existence isn't revealed."""

    permission_classes = [IsAuthenticated]
    lookup_value_regex = r"\d+"
    throttle_scope = "chat_send"

    def get_throttles(self):
        # Only sending a message counts against CHAT_RATE.
        if self.action == "messages" and self.request.method == "POST":
            return super().get_throttles()
        return []

    def throttled(self, request, wait):
        num, period, _ = parse_rate(ScopedRateThrottle.THROTTLE_RATES.get(self.throttle_scope))
        noun = "message" if num == 1 else "messages"
        raise PingRateLimited(wait=wait, detail=f"You can send {num} {noun} a {period}.")

    def _member(self, pk):
        try:
            return ConversationMember.objects.get(conversation_id=pk, user=self.request.user)
        except ConversationMember.DoesNotExist:
            raise NotFound()

    def list(self, request):
        return Response(services.summaries(request.user))

    def retrieve(self, request, pk=None):
        rows = services.summaries(request.user, int(pk))
        if not rows:
            raise NotFound()
        return Response(rows[0])

    def create(self, request):
        s = OpenConversationSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        other = s.validated_data["user_id"]
        conv, created = services.open_direct(request.user, other)
        if created:
            record_audit(request, "CHAT_STARTED", target=other.username,
                         metadata={"conversation_id": conv.id})
        return Response(services.summaries(request.user, conv.id)[0],
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"])
    def messages(self, request, pk=None):
        """GET ?before=<message id>: 30 older messages, oldest first."""
        member = self._member(pk)
        if request.method == "POST":
            return self._send(request, member)
        qs = Message.objects.filter(conversation_id=member.conversation_id)
        before = request.query_params.get("before", "")
        if before.isdigit():
            qs = qs.filter(id__lt=int(before))
        page = list(qs.order_by("-id")[:PAGE + 1])
        return Response({"results": [message_dict(m) for m in reversed(page[:PAGE])],
                         "has_more": len(page) > PAGE})

    def _send(self, request, member):
        s = SendMessageSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if ConversationMember.objects.filter(conversation_id=member.conversation_id,
                                             user__is_active=False).exists():
            raise PermissionDenied("This person's account is deactivated.")
        msg = services.send_message(member, s.validated_data["body"])
        broadcast.message_sent(msg, s.validated_data["client_id"])
        return Response(message_dict(msg), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        member = self._member(pk)
        s = ReadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        mid = s.validated_data["message_id"]
        if not Message.objects.filter(pk=mid, conversation_id=member.conversation_id).exists():
            raise ValidationError({"message_id": "That message isn't in this chat."})
        if services.mark_read(member, mid):
            broadcast.read(member.conversation_id, request.user.id, mid)
        return Response({"unread_total": services.unread_total(request.user)})

    @action(detail=True, methods=["post"])
    def mute(self, request, pk=None):
        member = self._member(pk)
        s = MuteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        member.muted = s.validated_data["muted"]
        member.save(update_fields=["muted"])
        return Response({"muted": member.muted})


@api_view(["GET"])
def unread_total(request):
    return Response({"unread_total": services.unread_total(request.user)})
```

`backend/apps/chat/urls.py`:

```python
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ConversationViewSet, unread_total

router = DefaultRouter()
router.register(r"chat/conversations", ConversationViewSet, basename="chat-conversation")

urlpatterns = [
    path("chat/unread/", unread_total),
    path("", include(router.urls)),
]
```

In `backend/config/urls.py`, add after the notifications line:

```python
    path("api/", include("apps.notifications.urls")),
    path("api/", include("apps.chat.urls")),
```

In `backend/config/settings.py`, inside `DEFAULT_THROTTLE_RATES` after `ping_send_elevated`:

```python
        # Chat messages each person may send. Override in .env.
        "chat_send": config("CHAT_RATE", default="30/minute"),
```

In `.env.example`, after the `PING_RATE_PER_RECIPIENT` line:

```
# Chat messages each person may send
CHAT_RATE=30/minute
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD/backend:/app" backend pytest -p no:cacheprovider tests/test_chat_api.py tests/test_chat_models.py`
Expected: all PASS. If `_unread` raises `FieldError: Expression contains mixed types`, check that every `Coalesce` has its `output_field` exactly as written.

- [ ] **Step 8: Document the app**

In `docs/architecture.md`, under `## Apps`, add a line in the same style as the existing ones:

```markdown
- `chat`: one-to-one chat. `Conversation` (one per pair, `direct_key`), `ConversationMember` (read marker, mute) and `Message`. REST under `/api/chat/`; new messages and read receipts are pushed through the same `user.<id>` channel groups as pings (`apps/chat/broadcast.py`). Message text never goes to the audit log or Django admin.
```

Under `## Rate limiting`, add:

```markdown
Chat messages have their own limit, `CHAT_RATE` (default `30/minute`, scope `chat_send`). Only sending counts; reading and marking as read don't.
```

- [ ] **Step 9: Run the whole backend suite**

Run: `docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD/backend:/app" backend pytest -p no:cacheprovider`
Expected: everything passes except the known baseline failure.

- [ ] **Step 10: Commit**

```bash
git add backend/apps/chat backend/config .env.example docs/architecture.md backend/tests/test_chat_api.py
git commit -m "Add chat REST API with read markers, muting and live fan-out

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Chat events on the notifications socket

**Files:**
- Modify: `backend/apps/notifications/consumers.py`
- Modify: `docs/websocket.md`
- Test: `backend/tests/test_chat_websockets.py`

**Interfaces:**
- Consumes: `apps.chat.services.peer_ids`, the `chat.message` / `chat.read` channel events from Task 2, `user_group_name`.
- Produces: browser socket messages `{"type": "chat_message", "payload": …}`, `{"type": "chat_read", "payload": …}`, `{"type": "chat_typing", "payload": {"conversation_id", "user_id"}}`; accepts `{"type": "chat_typing", "conversation_id": <int>}` from the browser.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_chat_websockets.py`:

```python
"""Chat over /ws/notifications/, using an in-memory channel layer."""
import pytest
from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from rest_framework.test import APIClient

from apps.notifications.consumers import NotificationConsumer

URL = "/api/chat/conversations/"


@pytest.fixture(autouse=True)
def in_memory_channel_layer(settings):
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


async def open_socket(user):
    comm = WebsocketCommunicator(NotificationConsumer.as_asgi(), "/ws/notifications/")
    comm.scope["user"] = user
    connected, _ = await comm.connect()
    assert connected
    assert await comm.receive_nothing(timeout=0.3)
    return comm


def api_as(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@sync_to_async
def open_chat(me, other):
    return api_as(me).post(URL, {"user_id": other.id}, format="json").data["id"]


@sync_to_async
def say(me, cid, body, client_id=""):
    r = api_as(me).post(f"{URL}{cid}/messages/", {"body": body, "client_id": client_id},
                        format="json")
    assert r.status_code == 201, r.data
    return r.data


@sync_to_async
def read(me, cid, message_id):
    r = api_as(me).post(f"{URL}{cid}/read/", {"message_id": message_id}, format="json")
    assert r.status_code == 200, r.data


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_a_message_reaches_both_people_live(member_a, member_b):
    cid = await open_chat(member_a, member_b)
    a, b = await open_socket(member_a), await open_socket(member_b)
    m = await say(member_a, cid, "Lunch?", "tmp-1")
    for sock in (a, b):
        msg = await sock.receive_json_from(timeout=2)
        assert msg["type"] == "chat_message"
        assert msg["payload"]["message"]["id"] == m["id"]
        assert msg["payload"]["client_id"] == "tmp-1"
    for sock in (a, b):
        await sock.disconnect()


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_reading_tells_both_people(member_a, member_b):
    cid = await open_chat(member_a, member_b)
    m = await say(member_a, cid, "Lunch?")
    a, b = await open_socket(member_a), await open_socket(member_b)
    await read(member_b, cid, m["id"])
    for sock in (a, b):
        msg = await sock.receive_json_from(timeout=2)
        assert msg == {"type": "chat_read", "payload": {
            "conversation_id": cid, "user_id": member_b.id, "message_id": m["id"]}}
    for sock in (a, b):
        await sock.disconnect()


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_typing_reaches_only_the_other_person(member_a, member_b, hr_user):
    cid = await open_chat(member_a, member_b)
    a, b, outsider = (await open_socket(member_a), await open_socket(member_b),
                      await open_socket(hr_user))
    await a.send_json_to({"type": "chat_typing", "conversation_id": cid})
    assert await b.receive_json_from(timeout=2) == {
        "type": "chat_typing", "payload": {"conversation_id": cid, "user_id": member_a.id}}
    assert await a.receive_nothing(timeout=0.3)
    assert await outsider.receive_nothing(timeout=0.3)
    for sock in (a, b, outsider):
        await sock.disconnect()


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_typing_from_an_outsider_or_with_junk_is_dropped(member_a, member_b, hr_user):
    cid = await open_chat(member_a, member_b)
    b, outsider = await open_socket(member_b), await open_socket(hr_user)
    await outsider.send_json_to({"type": "chat_typing", "conversation_id": cid})
    await outsider.send_json_to({"type": "chat_typing", "conversation_id": "x"})
    await outsider.send_json_to({"type": "chat_typing"})
    assert await b.receive_nothing(timeout=0.5)
    # The outsider's socket still works afterwards.
    m = await say(member_b, cid, "still here")
    assert (await b.receive_json_from(timeout=2))["payload"]["message"]["id"] == m["id"]
    for sock in (b, outsider):
        await sock.disconnect()
```

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD/backend:/app" backend pytest -p no:cacheprovider tests/test_chat_websockets.py`
Expected: FAIL. The first two time out or error with `ValueError: No handler for message type chat.message`; the typing tests time out.

- [ ] **Step 3: Teach the consumer about chat**

In `backend/apps/notifications/consumers.py`, update the module docstring's channel list:

```python
  - /ws/notifications/   — pushes new pings and chat events; receives client
                           ACKs (delivered/seen) and chat typing signals
```

In `NotificationConsumer.connect`, start with a per-connection cache:

```python
    async def connect(self):
        # conversation id → other members' ids (None: not a member), for typing.
        self._chat_peers = {}
        await super().connect()
```

Replace `receive_json` with:

```python
    async def receive_json(self, content, **kwargs):
        """Client messages:
          { "type": "ack_delivered", "delivery_id": 123 }
          { "type": "ack_seen", "delivery_id": 123 }
          { "type": "chat_typing", "conversation_id": 5 }
        """
        kind = content.get("type")
        if kind == "chat_typing":
            await self._chat_typing(content.get("conversation_id"))
            return
        did = content.get("delivery_id")
        if not kind or not did:
            return
        if kind == "ack_delivered":
            await self._mark_delivered(did)
        elif kind == "ack_seen":
            await self._mark_seen(did)
```

After `ping_handled`, add:

```python
    async def chat_message(self, event):
        """A chat message in one of this user's conversations (see apps/chat)."""
        await self.send_json({"type": "chat_message", "payload": event["payload"]})

    async def chat_read(self, event):
        await self.send_json({"type": "chat_read", "payload": event["payload"]})

    async def chat_typing(self, event):
        await self.send_json({"type": "chat_typing", "payload": event["payload"]})

    async def _chat_typing(self, conversation_id):
        """Tell the other member(s) this user is typing. Membership is looked
        up once per conversation per connection; outsiders are ignored."""
        if type(conversation_id) is not int:
            return
        if conversation_id not in self._chat_peers:
            from apps.chat.services import peer_ids
            self._chat_peers[conversation_id] = await database_sync_to_async(peer_ids)(
                conversation_id, self.user.id)
        for uid in self._chat_peers[conversation_id] or []:
            await self.channel_layer.group_send(user_group_name(uid), {
                "type": "chat.typing",
                "payload": {"conversation_id": conversation_id, "user_id": self.user.id},
            })
```

(`type(...) is not int` also rejects `True`/`False`, which `isinstance` would let through.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD/backend:/app" backend pytest -p no:cacheprovider tests/test_chat_websockets.py tests/test_websockets.py`
Expected: all PASS (the existing socket tests too).

- [ ] **Step 5: Document the socket messages**

In `docs/websocket.md`, in the `/ws/notifications/` section after the existing server → client block, add:

````markdown
Chat (see `apps/chat`):

```json
{ "type": "chat_message",
  "payload": {
    "conversation_id": 5, "sender_name": "Mem A", "client_id": "lq3x9a1b2c",
    "quiet": false,
    "message": { "id": 812, "conversation_id": 5, "sender_id": 12,
                 "body": "Lunch?", "created_at": "..." } } }

{ "type": "chat_read",
  "payload": { "conversation_id": 5, "user_id": 47, "message_id": 812 } }

{ "type": "chat_typing", "payload": { "conversation_id": 5, "user_id": 12 } }
```

- `chat_message` goes to both members (the sender's other tabs and devices
  too). `client_id` is whatever the sending tab passed to the REST call, so
  it can replace its "Sending…" bubble. `quiet` is true when that recipient
  is *In a meeting* or *Do not disturb*: no desktop notification.
- `chat_read` goes to both members when someone's read marker moves forward.
- `chat_typing` goes only to the other member.

Client → server, for chat:

```json
{ "type": "chat_typing", "conversation_id": 5 }
```

Sent at most once every 3 seconds while typing. The server checks
membership once per conversation per connection and drops anything else.
Messages themselves are sent over REST (`POST /api/chat/conversations/<id>/messages/`),
never over the socket.
````

- [ ] **Step 6: Commit**

```bash
git add backend/apps/notifications/consumers.py backend/tests/test_chat_websockets.py docs/websocket.md
git commit -m "Forward chat messages, read receipts and typing over the socket

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Browser chat store and live wiring

**Files:**
- Create: `frontend/lib/chat.ts`
- Modify: `frontend/components/NotificationsRuntime.tsx`
- Modify: `frontend/public/sw.js`

**Interfaces:**
- Consumes: the REST API and socket messages from Tasks 2–3; `apiFetch`, `ApiError`, `apiErrorMessage` from `lib/api.ts`; `showNotification`, `closeNotification` from `lib/notify.ts`; `ReconnectingWS.send`.
- Produces (`lib/chat.ts`), used by Tasks 5–8:
  - Types `ChatPerson`, `ChatMessage`, `Conversation`, `Pending`, `Thread`; constant `EMPTY_THREAD`.
  - `useChat(): { me, conversations: Conversation[] | null, threads: Record<number, Thread>, typing: Record<number, number>, unreadTotal: number, focused: number[] }`.
  - Session: `resetChat(me: number | null)`, `setChatSocket(send | null)`, `resyncChat()`.
  - Data: `loadConversations()`, `openChatWith(userId): Promise<number>`, `fetchConversation(id): Promise<boolean>`, `loadThread(id)`, `loadOlder(id)`.
  - Actions: `sendMessage(id, body)`, `retryMessage(id, clientId)`, `discardMessage(id, clientId)`, `markRead(id, messageId)`, `setMuted(id, muted)`, `sendTyping(id)`, `setFocused(id, on)`.
  - Socket inputs: `receiveMessage(m, clientId?)`, `onRead(payload)`, `onTyping(payload)`, `shouldNotify(id): boolean`.
  - Opening from elsewhere: `OPEN_CHAT_EVENT = 'op:open_chat'` (CustomEvent<number> with a conversation id), `startChat(userId, navigate)`.

- [ ] **Step 1: Install frontend dependencies (once)**

Run: `cd frontend && npm ci`
Expected: installs without errors. Then `npm run typecheck` passes on the untouched code.

- [ ] **Step 2: Write the store**

`frontend/lib/chat.ts`:

```ts
'use client';

// Chat state shared by the desktop dock and the /messages page.
// NotificationsRuntime feeds socket events in (receiveMessage, onRead,
// onTyping) and resyncs after every (re)connect; components read the state
// with useChat() and change it only through the functions below.

import { useSyncExternalStore } from 'react';
import { ApiError, apiErrorMessage, apiFetch } from './api';
import type { Status } from './status';

export type ChatPerson = {
  id: number; full_name: string; department: string; designation: string;
  is_online: boolean; is_active: boolean; last_seen_at: string | null; status: Status | null;
};
export type ChatMessage = {
  id: number; conversation_id: number; sender_id: number; body: string; created_at: string;
};
export type Conversation = {
  id: number; other: ChatPerson;
  last_message: ChatMessage | null; last_message_at: string | null;
  unread: number; muted: boolean; other_last_read_id: number | null;
};
/** A message on its way to the server (error null) or one that failed. */
export type Pending = { client_id: string; body: string; error: string | null };
export type Thread = {
  messages: ChatMessage[]; pending: Pending[];
  hasMore: boolean; loaded: boolean; loadingOlder: boolean;
};

type State = {
  me: number | null;
  conversations: Conversation[] | null;   // null until the first load
  threads: Record<number, Thread>;
  typing: Record<number, number>;         // conversation id → when "typing…" ends (ms)
  unreadTotal: number;
  focused: number[];                      // conversations on screen right now
};

const INITIAL: State = { me: null, conversations: null, threads: {}, typing: {}, unreadTotal: 0, focused: [] };
export const EMPTY_THREAD: Thread = { messages: [], pending: [], hasMore: false, loaded: false, loadingOlder: false };
const TYPING_SHOWN_MS = 5000;
const TYPING_EVERY_MS = 3000;

let state: State = INITIAL;
const listeners = new Set<() => void>();
let socketSend: ((msg: object) => void) | null = null;
const readUpTo = new Map<number, number>();
const typingSentAt = new Map<number, number>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

export function useChat(): State {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => state, () => INITIAL);
}

const thread = (id: number) => state.threads[id] || EMPTY_THREAD;
function setThread(id: number, patch: Partial<Thread>) {
  set({ threads: { ...state.threads, [id]: { ...thread(id), ...patch } } });
}
const findConversation = (id: number) => state.conversations?.find(c => c.id === id);

function setConversations(list: Conversation[]) {
  const sorted = [...list].sort((a, b) =>
    (b.last_message_at || '').localeCompare(a.last_message_at || '') || b.id - a.id);
  set({ conversations: sorted, unreadTotal: sorted.reduce((n, c) => n + c.unread, 0) });
}
function patchConversation(id: number, patch: Partial<Conversation>) {
  if (state.conversations) setConversations(state.conversations.map(c => c.id === id ? { ...c, ...patch } : c));
}
function withoutKey<T>(o: Record<number, T>, key: number) {
  const copy = { ...o };
  delete copy[key];
  return copy;
}
function mergeMessages(a: ChatMessage[], b: ChatMessage[]) {
  const byId = new Map<number, ChatMessage>();
  [...a, ...b].forEach(m => byId.set(m.id, m));
  return Array.from(byId.values()).sort((x, y) => x.id - y.id);
}

// ---------- Session (called by NotificationsRuntime) ----------

/** Start over for a signed-in user, or clear everything on sign-out. */
export function resetChat(me: number | null) {
  readUpTo.clear();
  typingSentAt.clear();
  state = { ...INITIAL, me };
  listeners.forEach(l => l());
}

/** How to send on the live socket (null while there is none). */
export function setChatSocket(send: ((msg: object) => void) | null) { socketSend = send; }

/** Fetch the chat list and every open thread again (first connect, reconnect). */
export async function resyncChat() {
  await loadConversations().catch(() => {});
  await Promise.all(Object.keys(state.threads).map(id => loadThread(Number(id)).catch(() => {})));
}

// ---------- Loading ----------

export async function loadConversations() {
  setConversations(await apiFetch<Conversation[]>('/api/chat/conversations/'));
}

/** Open (or create) the chat with a person; returns its id. */
export async function openChatWith(userId: number): Promise<number> {
  const c = await apiFetch<Conversation>('/api/chat/conversations/', {
    method: 'POST', body: JSON.stringify({ user_id: userId }),
  });
  if (state.conversations) setConversations([c, ...state.conversations.filter(x => x.id !== c.id)]);
  else await loadConversations();
  return c.id;
}

/** Add one conversation to the list (e.g. a link to a chat started elsewhere). False if it isn't theirs. */
export async function fetchConversation(id: number): Promise<boolean> {
  try {
    const c = await apiFetch<Conversation>(`/api/chat/conversations/${id}/`);
    setConversations([c, ...(state.conversations || []).filter(x => x.id !== id)]);
    return true;
  } catch { return false; }
}

type Page = { results: ChatMessage[]; has_more: boolean };

/** The newest page of a conversation, merged into what is already loaded. */
export async function loadThread(id: number) {
  const d = await apiFetch<Page>(`/api/chat/conversations/${id}/messages/`);
  const t = thread(id);
  const newest = t.messages[t.messages.length - 1];
  // More than a page arrived while away: start from the new page rather than leave a gap.
  const gap = d.has_more && !!newest && !!d.results.length && d.results[0].id > newest.id;
  setThread(id, {
    messages: gap ? d.results : mergeMessages(t.messages, d.results),
    hasMore: gap || !t.loaded ? d.has_more : t.hasMore,
    loaded: true,
  });
}

export async function loadOlder(id: number) {
  const t = thread(id);
  if (!t.hasMore || t.loadingOlder || !t.messages.length) return;
  setThread(id, { loadingOlder: true });
  try {
    const d = await apiFetch<Page>(`/api/chat/conversations/${id}/messages/?before=${t.messages[0].id}`);
    setThread(id, { messages: mergeMessages(thread(id).messages, d.results), hasMore: d.has_more });
  } finally {
    setThread(id, { loadingOlder: false });
  }
}

// ---------- Sending ----------

export async function sendMessage(id: number, body: string) {
  const text = body.trim();
  if (!text) return;
  const p: Pending = { client_id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), body: text, error: null };
  setThread(id, { pending: [...thread(id).pending, p] });
  await deliver(id, p);
}

async function deliver(id: number, p: Pending) {
  try {
    const m = await apiFetch<ChatMessage>(`/api/chat/conversations/${id}/messages/`, {
      method: 'POST', body: JSON.stringify({ body: p.body, client_id: p.client_id }),
    });
    receiveMessage(m, p.client_id);
  } catch (e) {
    // Rate limit, deactivated account, invalid text: say why. Anything else: just "Not sent".
    const error = e instanceof ApiError && [400, 403, 429].includes(e.status) ? apiErrorMessage(e, 'Not sent') : 'Not sent';
    setThread(id, { pending: thread(id).pending.map(x => x.client_id === p.client_id ? { ...x, error } : x) });
  }
}

export function retryMessage(id: number, clientId: string) {
  const p = thread(id).pending.find(x => x.client_id === clientId);
  if (!p) return;
  const again = { ...p, error: null };
  setThread(id, { pending: thread(id).pending.map(x => x.client_id === clientId ? again : x) });
  deliver(id, again);
}

export function discardMessage(id: number, clientId: string) {
  setThread(id, { pending: thread(id).pending.filter(x => x.client_id !== clientId) });
}

// ---------- Live updates ----------

/** A message from the server: the REST reply to our own send, or a socket push. */
export function receiveMessage(m: ChatMessage, clientId?: string) {
  const id = m.conversation_id;
  const t = state.threads[id];
  if (t) {
    setThread(id, {
      messages: t.loaded ? mergeMessages(t.messages, [m]) : t.messages,
      pending: clientId ? t.pending.filter(p => p.client_id !== clientId) : t.pending,
    });
  }
  const fromOther = m.sender_id !== state.me;
  if (fromOther && state.typing[id]) set({ typing: withoutKey(state.typing, id) });

  const c = findConversation(id);
  if (!c) {
    // A chat someone just started with us: fetch the list to get it.
    if (state.conversations) loadConversations().catch(() => {});
    return;
  }
  if (c.last_message && c.last_message.id >= m.id) return;   // already counted
  const onScreen = state.focused.includes(id) && document.visibilityState === 'visible';
  patchConversation(id, {
    last_message: m, last_message_at: m.created_at,
    unread: fromOther && !onScreen ? c.unread + 1 : c.unread,
  });
  if (fromOther && onScreen) markRead(id, m.id);
}

export function onRead(p: { conversation_id: number; user_id: number; message_id: number }) {
  const c = findConversation(p.conversation_id);
  if (!c) return;
  if (p.user_id === state.me) {
    // Read in another tab or on another device.
    if (!c.last_message || p.message_id >= c.last_message.id) patchConversation(c.id, { unread: 0 });
  } else if ((c.other_last_read_id || 0) < p.message_id) {
    patchConversation(c.id, { other_last_read_id: p.message_id });
  }
}

export function onTyping(p: { conversation_id: number; user_id: number }) {
  if (p.user_id === state.me) return;
  const until = Date.now() + TYPING_SHOWN_MS;
  set({ typing: { ...state.typing, [p.conversation_id]: until } });
  setTimeout(() => {
    if (state.typing[p.conversation_id] === until) set({ typing: withoutKey(state.typing, p.conversation_id) });
  }, TYPING_SHOWN_MS);
}

/** Desktop notification for a new message? Not for muted chats or one already in front of them. */
export function shouldNotify(id: number) {
  if (findConversation(id)?.muted) return false;
  return document.visibilityState !== 'visible' || !state.focused.includes(id);
}

// ---------- Reading, muting, typing, focus ----------

export function markRead(id: number, messageId: number) {
  if ((readUpTo.get(id) || 0) >= messageId) return;
  readUpTo.set(id, messageId);
  patchConversation(id, { unread: 0 });
  apiFetch<{ unread_total: number }>(`/api/chat/conversations/${id}/read/`, {
    method: 'POST', body: JSON.stringify({ message_id: messageId }),
  }).then(r => set({ unreadTotal: r.unread_total }), () => { readUpTo.delete(id); });
}

export async function setMuted(id: number, muted: boolean) {
  patchConversation(id, { muted });
  try {
    await apiFetch(`/api/chat/conversations/${id}/mute/`, { method: 'POST', body: JSON.stringify({ muted }) });
  } catch {
    patchConversation(id, { muted: !muted });
  }
}

export function sendTyping(id: number) {
  const now = Date.now();
  if (now - (typingSentAt.get(id) || 0) < TYPING_EVERY_MS) return;
  typingSentAt.set(id, now);
  socketSend?.({ type: 'chat_typing', conversation_id: id });
}

/** A conversation is on screen (an open dock window, or the /messages pane). */
export function setFocused(id: number, on: boolean) {
  const rest = state.focused.filter(x => x !== id);
  set({ focused: on ? [...rest, id] : rest });
}

// ---------- Opening a chat from elsewhere ----------

/** Window event the desktop dock listens for; detail is a conversation id. */
export const OPEN_CHAT_EVENT = 'op:open_chat';

/** Open the chat with a person: a dock window on a computer, /messages on smaller screens. */
export async function startChat(userId: number, navigate: (url: string) => void) {
  const id = await openChatWith(userId);
  if (window.matchMedia('(min-width: 1024px)').matches && !window.location.pathname.startsWith('/messages')) {
    window.dispatchEvent(new CustomEvent<number>(OPEN_CHAT_EVENT, { detail: id }));
  } else {
    navigate(`/messages?c=${id}`);
  }
}
```

- [ ] **Step 3: Wire it into `NotificationsRuntime`**

In `frontend/components/NotificationsRuntime.tsx`:

1. Imports, add:

```ts
import { useRouter } from 'next/navigation';
import { onRead, onTyping, receiveMessage, resetChat, resyncChat, setChatSocket, shouldNotify } from '../lib/chat';
```

2. Replace the start of the component and the effect's dependency on `user` with the user id, so a status change (which replaces the `user` object) no longer tears down the sockets and the chat state:

```ts
export function NotificationsRuntime() {
  const { user } = useAuth();
  const uid = user?.id;
  const router = useRouter();
  const notifWs = useRef<ReconnectingWS | null>(null);
  const presenceWs = useRef<ReconnectingWS | null>(null);

  useEffect(() => {
    if (!uid) return;
    registerServiceWorker();
```

and at the end of the effect `}, [uid]);`.

3. After `notifWs.current = n; presenceWs.current = p;` add:

```ts
    resetChat(uid);
    setChatSocket(msg => n.send(msg));
```

4. Replace `const offStatus = n.onStatus(setLiveStatus);` with:

```ts
    // Every (re)connect: refetch chats, since messages may have arrived while offline.
    const offStatus = n.onStatus(s => { setLiveStatus(s); if (s === 'open') resyncChat(); });
```

5. In the `onMessage` handler, after the `ping_status` branch, add:

```ts
      } else if (msg.type === 'chat_message') {
        const p = msg.payload;
        receiveMessage(p.message, p.client_id);
        // Quiet by design: no pop-up, no sound, not sticky, one notification per chat.
        if (p.message.sender_id !== uid && !p.quiet && shouldNotify(p.conversation_id)) {
          const body = p.message.body.length > 140 ? p.message.body.slice(0, 139) + '…' : p.message.body;
          await showNotification(p.sender_name, body, {
            tag: `chat-${p.conversation_id}`, url: `/messages?c=${p.conversation_id}`, sticky: false,
          });
        }
      } else if (msg.type === 'chat_read') {
        onRead(msg.payload);
        if (msg.payload.user_id === uid) closeNotification(`chat-${msg.payload.conversation_id}`);
      } else if (msg.type === 'chat_typing') {
        onTyping(msg.payload);
```

6. Open chats from a clicked notification (the service worker posts `open-url`, see Step 4). Before `n.connect();` add:

```ts
    const onSwMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'open-url' && typeof ev.data.url === 'string') router.push(ev.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
```

7. Replace the cleanup with:

```ts
    return () => {
      offStatus(); offMsg(); n.close(); p.close(); setLiveStatus('closed');
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      setChatSocket(null); resetChat(null);
    };
  }, [uid, router]);
```

(`router` from `useRouter` is stable, so listing it doesn't cause reconnects.)

- [ ] **Step 4: Let chat notifications open the chat**

In `frontend/public/sw.js`, in the `notificationclick` handler replace the loop body's `if (u.origin === self.location.origin) { … }` with:

```js
        if (u.origin === self.location.origin) {
          // Chat: open that conversation. Ping: show its pop-up first (the page already has it queued).
          if (url.startsWith('/messages')) w.postMessage({ type: 'open-url', url });
          else w.postMessage({ type: 'focus-ping', ping_id: data.ping_id });
          return w.focus();
        }
```

and update the comment above the loop to: `// Prefer an already-open Office Ping window: bring it to the front.`

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/chat.ts frontend/components/NotificationsRuntime.tsx frontend/public/sw.js
git commit -m "Add browser chat store fed by the notifications socket

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Chat building blocks (list, conversation, new-chat picker)

**Files:**
- Modify: `frontend/components/ui.tsx` (new icons)
- Create: `frontend/lib/useKeyboardInset.ts` (moved out of `MobileHome.tsx`)
- Modify: `frontend/components/MobileHome.tsx` (import the hook instead of defining it)
- Create: `frontend/components/chat/format.tsx`
- Create: `frontend/components/chat/ConversationList.tsx`
- Create: `frontend/components/chat/ConversationView.tsx`
- Create: `frontend/components/chat/NewChat.tsx`

**Interfaces:**
- Consumes: everything in `lib/chat.ts` (Task 4); `Avatar`, `Icon`, `Empty`, `Skeleton` from `components/ui.tsx`; `PersonSelect`, `Person` from `components/PersonSelect.tsx`; `PingDialog`; `describeStatus` from `lib/status.ts`.
- Produces:
  - Icons `chat`, `compose`, `back`, `bellOff`, `x`, `minus` in `Icon`.
  - `useKeyboardInset(): number` from `lib/useKeyboardInset.ts`.
  - `<ConversationList activeId?: number | null onOpen(id) />`.
  - `<ConversationView id variant: 'window' | 'page' onBack? onMinimize? onClose? />`. Registers itself as focused while mounted.
  - `<NewChat onOpened(id) onCancel() />`.
  - `listTime`, `dayLabel`, `clockTime`, `presenceLine`, `linkify` from `format.tsx`.

The spec listed a separate `chat/Avatar.tsx`. The existing `Avatar` in `ui.tsx` already draws initials with a presence dot, so reuse it instead.

- [ ] **Step 1: Add the icons**

In `frontend/components/ui.tsx`, inside `const paths`, after `reply`, add:

```tsx
  chat:    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />,
  compose: <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
  back:    <path d="M15 18l-6-6 6-6" />,
  bellOff: <>
    <path d="M9 17a3 3 0 0 0 6 0" />
    <path d="M18 14.2V11a6 6 0 0 0-9.3-5" />
    <path d="M6 11v3.2a2 2 0 0 1-.6 1.4L4 17h13" />
    <path d="M3 3l18 18" />
  </>,
  x:       <path d="M18 6 6 18M6 6l12 12" />,
  minus:   <path d="M5 12h14" />,
```

(Match the indentation of the existing entries.)

- [ ] **Step 2: Move the keyboard-inset hook so the Messages page can share it**

Create `frontend/lib/useKeyboardInset.ts` with the hook moved verbatim from the bottom of `frontend/components/MobileHome.tsx` (lines 329–343 today), exported:

```ts
'use client';

import { useEffect, useState } from 'react';

/** Height of the on-screen keyboard covering the page (0 when there is none),
 *  so a composer pinned to the bottom can sit just above it. */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(covered > 80 ? Math.round(covered) : 0);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);
  return inset;
}
```

In `MobileHome.tsx`, delete the local `function useKeyboardInset() { … }` (keep any comment that sits above it with the moved code) and add `import { useKeyboardInset } from '../lib/useKeyboardInset';`. Remove `useState`/`useEffect` from its React import only if nothing else in the file uses them.

- [ ] **Step 3: Write the format helpers**

`frontend/components/chat/format.tsx`:

```tsx
import { ReactNode } from 'react';
import { describeStatus } from '../../lib/status';
import type { ChatPerson } from '../../lib/chat';

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Chat list time: "10:42" today, "Mon" within the week, "Oct 21" before that. */
export function listTime(iso: string) {
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return clockTime(iso);
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Divider between days in a conversation. */
export function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

/** The line under a name: their status, else online, else when they were last around. */
export function presenceLine(p: ChatPerson) {
  if (!p.is_active) return 'Account deactivated';
  if (p.status) return describeStatus(p.status, { emoji: true });
  if (p.is_online) return 'Online';
  if (!p.last_seen_at) return 'Offline';
  const mins = Math.round((Date.now() - new Date(p.last_seen_at).getTime()) / 60000);
  if (mins < 60) return `Active ${Math.max(mins, 1)} min ago`;
  if (mins < 24 * 60) return `Active ${Math.round(mins / 60)} h ago`;
  return `Active ${listTime(p.last_seen_at)}`;
}

const LINK = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g;

/** Message text with http(s) links made clickable; everything else stays plain text. */
export function linkify(text: string): ReactNode[] {
  return text.split(LINK).map((part, i) => i % 2 === 1
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all underline">{part}</a>
    : part);
}
```

- [ ] **Step 4: Write the conversation list**

`frontend/components/chat/ConversationList.tsx`:

```tsx
'use client';

// Search box plus the caller's chats, newest first. Shared by the desktop
// dock and the /messages page.

import { useState } from 'react';
import { useChat } from '../../lib/chat';
import { Avatar, Empty, Icon, Skeleton } from '../ui';
import { listTime } from './format';

export function ConversationList({ activeId, onOpen }: {
  activeId?: number | null; onOpen: (id: number) => void;
}) {
  const { conversations, me } = useChat();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = (conversations || []).filter(c => c.other.full_name.toLowerCase().includes(needle));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3 py-2">
        <Icon name="search" size={16}
              className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-ink-3" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search messages…"
               aria-label="Search chats" className="input h-10 pl-9 text-sm" />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!conversations && Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-40" /></div>
          </li>
        ))}
        {conversations && !list.length && (
          <li className="px-3 py-6">
            <Empty icon={<Icon name="chat" size={20} />}
                   title={needle ? 'Nobody matched' : 'No chats yet'}
                   hint={needle ? 'Try a different name.' : 'Start one with the pencil button, or Message on the People page.'} />
          </li>
        )}
        {list.map(c => {
          const unread = c.unread > 0;
          const last = c.last_message;
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onOpen(c.id)} aria-current={activeId === c.id ? 'true' : undefined}
                      className={'flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 ' +
                        (activeId === c.id ? 'bg-gold-soft/60' : '')}>
                <Avatar name={c.other.full_name} size={40} online={c.other.is_online} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={'truncate text-[15px] text-ink ' + (unread ? 'font-bold' : 'font-semibold')}>
                      {c.other.full_name}
                    </span>
                    {c.muted && <Icon name="bellOff" size={14} className="shrink-0 text-ink-3" />}
                    {c.last_message_at && <span className="ml-auto shrink-0 text-xs text-ink-3">{listTime(c.last_message_at)}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={'truncate text-[13px] ' + (unread ? 'font-semibold text-ink' : 'text-ink-2')}>
                      {last ? (last.sender_id === me ? 'You: ' : '') + last.body : (c.other.department || 'Say hello 👋')}
                    </span>
                    {unread && (
                      <span className="ml-auto inline-grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-live px-1 text-[11px] font-bold text-white tabular-nums"
                            aria-label={`${c.unread} unread`}>
                        {c.unread > 99 ? '99+' : c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Write the new-chat picker**

`frontend/components/chat/NewChat.tsx`:

```tsx
'use client';

// "New message": pick a person, then open (or create) the chat with them.

import { useState } from 'react';
import { apiErrorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { openChatWith } from '../../lib/chat';
import { listOf, useApi } from '../../lib/useApi';
import { Person, PersonSelect } from '../PersonSelect';

export function NewChat({ onOpened, onCancel }: { onOpened: (id: number) => void; onCancel: () => void }) {
  const { user } = useAuth();
  const people = listOf<Person>(useApi('/api/users/').data);
  const [error, setError] = useState('');

  async function pick(id: number | '') {
    if (!id) return;
    try { onOpened(await openChatWith(id)); }
    catch (e) { setError(apiErrorMessage(e, "Couldn't open that chat.")); }
  }

  return (
    <div className="border-b border-line px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-bold text-ink">New message</span>
        <button type="button" onClick={onCancel} className="text-sm font-semibold text-brand">Cancel</button>
      </div>
      <PersonSelect people={people} value="" onChange={pick} excludeId={user?.id} autoFocus
                    placeholder="Who do you want to message?" />
      {error && <p role="alert" className="mt-1.5 text-[13px] font-semibold text-rose-deep">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Write the conversation view**

`frontend/components/chat/ConversationView.tsx`:

```tsx
'use client';

// One conversation: header, messages and composer. Used by the desktop dock's
// small windows (variant "window") and the /messages page (variant "page").

import { Fragment, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  EMPTY_THREAD, discardMessage, loadOlder, loadThread, markRead, retryMessage,
  sendMessage, sendTyping, setFocused, setMuted, useChat,
} from '../../lib/chat';
import { PingDialog } from '../PingDialog';
import { Avatar, Icon } from '../ui';
import { clockTime, dayLabel, linkify, presenceLine } from './format';

type IconName = Parameters<typeof Icon>[0]['name'];

export function ConversationView({ id, variant, onBack, onMinimize, onClose }: {
  id: number; variant: 'window' | 'page';
  onBack?: () => void; onMinimize?: () => void; onClose?: () => void;
}) {
  const { conversations, threads, typing, me } = useChat();
  const conv = conversations?.find(c => c.id === id);
  const t = threads[id] || EMPTY_THREAD;
  const isTyping = (typing[id] || 0) > Date.now();
  const [pingOpen, setPingOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const olderFrom = useRef<number | null>(null);   // scrollHeight before older messages were added

  useEffect(() => { if (!t.loaded) loadThread(id).catch(() => {}); }, [id, t.loaded]);
  useEffect(() => { setFocused(id, true); return () => setFocused(id, false); }, [id]);

  // On screen and unread: mark the newest message read (again when the tab comes back).
  const newest = t.messages[t.messages.length - 1];
  const unread = conv?.unread || 0;
  useEffect(() => {
    if (!unread || !newest) return;
    const read = () => { if (document.visibilityState === 'visible') markRead(id, newest.id); };
    read();
    document.addEventListener('visibilitychange', read);
    return () => document.removeEventListener('visibilitychange', read);
  }, [id, unread, newest]);

  // Stay on the newest message unless they scrolled up; keep the view still
  // when older messages are added above.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (olderFrom.current !== null) {
      el.scrollTop += el.scrollHeight - olderFrom.current;
      olderFrom.current = null;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [t.messages, t.pending, isTyping]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (el.scrollTop < 40 && t.hasMore && !t.loadingOlder) {
      olderFrom.current = el.scrollHeight;
      loadOlder(id);
    }
  }

  if (!conv) return <div className="grid flex-1 place-items-center p-6 text-sm text-ink-3">Loading…</div>;

  const other = conv.other;
  const firstName = other.full_name.split(' ')[0];
  const lastMine = [...t.messages].reverse().find(m => m.sender_id === me);
  const seen = !!lastMine && (conv.other_last_read_id || 0) >= lastMine.id && !t.pending.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line px-2">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to chats"
                  className={'grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-inset ' +
                    (variant === 'page' ? 'lg:hidden' : '')}>
            <Icon name="back" size={20} />
          </button>
        )}
        <Avatar name={other.full_name} size={34} online={other.is_online} />
        <div className="min-w-0 flex-1 pl-1">
          <div className="truncate text-[15px] font-bold text-ink">{other.full_name}</div>
          <div className={'truncate text-xs ' + (other.status?.quiet ? 'font-semibold text-rose-deep' : 'text-ink-2')}>
            {presenceLine(other)}
          </div>
        </div>
        {other.is_active && (
          <button type="button" onClick={() => setPingOpen(true)}
                  title="Send a ping: a pop-up they have to acknowledge"
                  className="btn-secondary btn-sm shrink-0 !px-2.5">
            <Icon name="bell" size={14} /> Ping
          </button>
        )}
        <IconButton label={conv.muted ? 'Turn notifications on for this chat' : 'Mute this chat'}
                    icon={conv.muted ? 'bellOff' : 'bell'} onClick={() => setMuted(id, !conv.muted)} />
        {onMinimize && <IconButton label="Minimise" icon="minus" onClick={onMinimize} />}
        {onClose && <IconButton label="Close chat" icon="x" onClick={onClose} />}
      </header>

      <div ref={scroller} onScroll={onScroll} role="log" aria-label={`Conversation with ${other.full_name}`}
           className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        {t.loadingOlder && <p className="py-2 text-center text-xs text-ink-3">Loading earlier messages…</p>}
        {t.loaded && !t.messages.length && !t.pending.length && (
          <p className="py-8 text-center text-sm text-ink-3">No messages yet. Say hello 👋</p>
        )}
        {t.messages.map((m, i) => {
          const prev = t.messages[i - 1];
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          return (
            <Fragment key={m.id}>
              {newDay && <DayDivider label={dayLabel(m.created_at)} />}
              <Bubble mine={m.sender_id === me} time={clockTime(m.created_at)}>{linkify(m.body)}</Bubble>
              {m === lastMine && seen && <p className="mb-1 text-right text-[11px] font-semibold text-ink-3">Seen</p>}
            </Fragment>
          );
        })}
        {t.pending.map(p => (
          <Fragment key={p.client_id}>
            <Bubble mine faded time={p.error ? '' : 'Sending…'}>{linkify(p.body)}</Bubble>
            {p.error && (
              <p className="mb-1 text-right text-[12px] font-semibold text-rose-deep">
                {p.error} · <button type="button" onClick={() => retryMessage(id, p.client_id)} className="underline">Retry</button>
                {' · '}<button type="button" onClick={() => discardMessage(id, p.client_id)} className="underline">Discard</button>
              </p>
            )}
          </Fragment>
        ))}
        {isTyping && <p className="py-1 text-xs italic text-ink-3">{firstName} is typing…</p>}
      </div>

      {other.is_active
        ? <Composer id={id} name={firstName} />
        : <p className="border-t border-line px-4 py-3 text-sm text-ink-3">This person&apos;s account is deactivated.</p>}

      <PingDialog open={pingOpen} recipientId={other.id} recipientName={other.full_name}
                  recipientIsOnline={other.is_online} onClose={() => setPingOpen(false)} onSent={() => {}} />
    </div>
  );
}

function Composer({ id, name }: { id: number; name: string }) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
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

  return (
    <form onSubmit={e => { e.preventDefault(); submit(); }}
          className="flex shrink-0 items-end gap-2 border-t border-line p-2">
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

function Bubble({ mine, time, faded, children }: { mine: boolean; time: string; faded?: boolean; children: ReactNode }) {
  return (
    <div className={'my-1 flex ' + (mine ? 'justify-end' : 'justify-start')}>
      <div className={'max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[14px] leading-snug ' +
        (mine ? 'rounded-br-md bg-gold-fill text-on-gold' : 'rounded-bl-md border border-line bg-surface-2 text-ink') +
        (faded ? ' opacity-60' : '')}>
        {children}
        {time && <span className={'ml-2 inline-block text-[10px] ' + (mine ? 'text-on-gold/70' : 'text-ink-3')}>{time}</span>}
      </div>
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
      <span className="h-px flex-1 bg-line" />{label}<span className="h-px flex-1 bg-line" />
    </div>
  );
}

function IconButton({ label, icon, onClick }: { label: string; icon: IconName; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-inset">
      <Icon name={icon} size={16} />
    </button>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/ui.tsx frontend/lib/useKeyboardInset.ts frontend/components/MobileHome.tsx frontend/components/chat
git commit -m "Add chat list, conversation view and new-chat picker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The `/messages` page and navigation

**Files:**
- Create: `frontend/app/messages/page.tsx`
- Modify: `frontend/components/AppShell.tsx`
- Modify: `frontend/components/Tour.tsx`

**Interfaces:**
- Consumes: `ConversationList`, `ConversationView`, `NewChat` (Task 5); `useChat`, `fetchConversation` (Task 4); `useKeyboardInset`.
- Produces: route `/messages?c=<id>`; nav item `/messages` (tour hook `nav-messages`) with the chat unread badge.

`warm()` in AppShell is not extended for `/messages` (the spec suggested it): chat data comes from the store, which is already loaded at sign-in, not from the `useApi` cache that `warm()` fills.

- [ ] **Step 1: Write the page**

`frontend/app/messages/page.tsx`:

```tsx
'use client';

// Messages: the chat list and one conversation. Two panes from 1024px; on
// phones the list, then the conversation full-screen with a back button.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Guard } from '../../components/Guard';
import { ConversationList } from '../../components/chat/ConversationList';
import { ConversationView } from '../../components/chat/ConversationView';
import { NewChat } from '../../components/chat/NewChat';
import { Icon, PageHeader } from '../../components/ui';
import { fetchConversation, useChat } from '../../lib/chat';
import { useKeyboardInset } from '../../lib/useKeyboardInset';

export default function MessagesPage() {
  return <Guard><Suspense><Inner /></Suspense></Guard>;
}

function Inner() {
  const router = useRouter();
  const wanted = Number(useSearchParams().get('c')) || null;
  const { conversations } = useChat();
  const [newOpen, setNewOpen] = useState(false);
  const inset = useKeyboardInset();
  const known = !!wanted && !!conversations?.some(c => c.id === wanted);
  const active = known ? wanted : null;

  // A link to a chat that isn't in the list yet (just started by the other
  // person) is fetched; one that isn't theirs falls back to the list.
  useEffect(() => {
    if (!wanted || !conversations || known) return;
    fetchConversation(wanted).then(ok => { if (!ok) router.replace('/messages'); });
  }, [wanted, conversations, known, router]);

  const open = (id: number) => { setNewOpen(false); router.push(`/messages?c=${id}`); };

  return (
    <div className="animate-slideIn">
      <div className={active ? 'hidden lg:block' : ''}>
        <PageHeader
          eyebrow="Chat"
          title="Messages"
          lead="Quiet one-to-one chat. When something needs attention now, send a ping instead."
          actions={
            <button type="button" onClick={() => setNewOpen(o => !o)} className="btn-primary btn-sm">
              <Icon name="compose" size={16} /> New message
            </button>
          }
        />
      </div>
      <div className="surface overflow-hidden lg:grid lg:h-[calc(100dvh-15rem)] lg:min-h-[420px] lg:grid-cols-[320px_1fr]">
        <div className={'flex min-h-[60vh] flex-col lg:min-h-0 lg:border-r lg:border-line ' + (active ? 'hidden lg:flex' : '')}>
          {newOpen && <NewChat onOpened={open} onCancel={() => setNewOpen(false)} />}
          <ConversationList activeId={active} onOpen={open} />
        </div>
        {active ? (
          // Phones: full screen over the tab bar, composer above the keyboard.
          <div className="fixed inset-x-0 top-0 z-[70] flex flex-col bg-surface lg:static lg:z-auto lg:min-h-0"
               style={{ bottom: inset, paddingTop: 'env(safe-area-inset-top)',
                        paddingBottom: inset ? 0 : 'env(safe-area-inset-bottom)' }}>
            <ConversationView key={active} id={active} variant="page" onBack={() => router.replace('/messages')} />
          </div>
        ) : (
          <div className="hidden place-items-center p-8 text-center text-sm text-ink-3 lg:grid">
            Pick a chat on the left, or start a new one.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Messages to the navigation**

In `frontend/components/AppShell.tsx`:

1. Import: `import { useChat } from '../lib/chat';`
2. After `const [statusOpen, setStatusOpen] = useState(false);` add:

```ts
  const chatUnread = useChat().unreadTotal;
```

3. In the `Workspace` group, after the Inbox item:

```ts
        { href: '/messages',      label: 'Messages', icon: 'chat',  badge: chatUnread },
```

4. Replace the tab list and its comment:

```ts
  // Bottom tab bar: the four daily destinations + More (§18.2: 3–5 tabs).
  // History lives under More.
  const tabs: NavItem[] = [
    { href: '/dashboard',     label: 'Overview', icon: 'dashboard' },
    { href: '/people',        label: 'People',   icon: 'users' },
    { href: '/notifications', label: 'Inbox',    icon: 'inbox', badge: unread },
    { href: '/messages',      label: 'Messages', icon: 'chat',  badge: chatUnread },
  ];
```

5. In the `<main>` wrapper, change `lg:pb-12` to `lg:pb-24` so the dock bar (Task 7) never covers the end of a page.

- [ ] **Step 3: Update the guided tour**

In `frontend/components/Tour.tsx`, after the `inbox` stop add:

```ts
  { id: 'messages', targets: ['[data-tour="nav-messages"]'],
    title: 'Messages', body: 'Quiet one-to-one chat: no pop-up and no sound, just a red number, so it never interrupts like a ping does.' },
```

and change the `history` stop so it still has a target on phones, where History is now under More:

```ts
  { id: 'history', targets: ['[data-tour="nav-history"]', '[data-tour="nav-more"]'],
    title: 'History', body: 'Check whether your pings were delivered and acknowledged, see replies, and search or filter past pings.',
    phoneBody: 'Under More: check whether your pings were delivered and acknowledged, see replies, and search past pings.' },
```

- [ ] **Step 4: Typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both succeed; the build lists the `/messages` route. A "useSearchParams() should be wrapped in a suspense boundary" error means the `<Suspense>` in Step 1 is missing.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/messages frontend/components/AppShell.tsx frontend/components/Tour.tsx
git commit -m "Add Messages page and put it in the sidebar and phone tab bar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Desktop messaging dock

**Files:**
- Create: `frontend/components/chat/ChatDock.tsx`
- Modify: `frontend/components/AppShell.tsx` (mount it)
- Modify: `frontend/components/SenderToasts.tsx` (move up on desktop)
- Modify: `frontend/components/Tour.tsx` (offer card moves up on desktop)

**Interfaces:**
- Consumes: `ConversationList`, `ConversationView`, `NewChat`; `useChat`, `OPEN_CHAT_EVENT`; `useLiveStatus` from `NotificationsRuntime`.
- Produces: `<ChatDock />`. Listens for `OPEN_CHAT_EVENT` (detail: conversation id).

- [ ] **Step 1: Write the dock**

`frontend/components/chat/ChatDock.tsx`:

```tsx
'use client';

// Desktop messaging dock (≥1024px), LinkedIn-style: a bar in the bottom-right
// corner that opens into the chat list, with small conversation windows to
// its left. Hidden on /messages, which shows the same things full size.

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { OPEN_CHAT_EVENT, useChat } from '../../lib/chat';
import { useLiveStatus } from '../NotificationsRuntime';
import { Avatar, Icon } from '../ui';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import { NewChat } from './NewChat';

type Layout = { expanded: boolean; windows: number[]; minimized: number[] };
const CLOSED: Layout = { expanded: false, windows: [], minimized: [] };
const storageKey = (uid: number) => `op_chat_dock_${uid}`;

function loadLayout(uid: number): Layout {
  try {
    const s = JSON.parse(localStorage.getItem(storageKey(uid)) || 'null');
    if (s && Array.isArray(s.windows) && Array.isArray(s.minimized)) {
      return { expanded: !!s.expanded, windows: s.windows, minimized: s.minimized };
    }
  } catch {}
  return CLOSED;
}

export function ChatDock() {
  const { user } = useAuth();
  const uid = user?.id;
  const pathname = usePathname();
  const live = useLiveStatus() === 'open';
  const { conversations, unreadTotal } = useChat();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  // Remembered per person, so it survives reloads.
  useEffect(() => { if (uid) setLayout(loadLayout(uid)); }, [uid]);
  useEffect(() => {
    if (!uid || !layout) return;
    try { localStorage.setItem(storageKey(uid), JSON.stringify(layout)); } catch {}
  }, [uid, layout]);

  const openWindow = useCallback((id: number) => {
    setNewOpen(false);
    setLayout(l => {
      const cur = l || CLOSED;
      const max = window.innerWidth >= 1280 ? 2 : 1;
      return {
        ...cur,
        windows: [...cur.windows.filter(w => w !== id), id].slice(-max),
        minimized: cur.minimized.filter(w => w !== id),
      };
    });
  }, []);

  // "Message" buttons elsewhere in the app ask for a window.
  useEffect(() => {
    const h = (e: Event) => openWindow((e as CustomEvent<number>).detail);
    window.addEventListener(OPEN_CHAT_EVENT, h);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, h);
  }, [openWindow]);

  if (!user || !layout || pathname?.startsWith('/messages')) return null;

  const closeWindow = (id: number) => setLayout({
    ...layout, windows: layout.windows.filter(w => w !== id), minimized: layout.minimized.filter(w => w !== id),
  });
  const toggleMinimized = (id: number) => setLayout({
    ...layout, minimized: layout.minimized.includes(id) ? layout.minimized.filter(w => w !== id) : [...layout.minimized, id],
  });
  const setExpanded = (expanded: boolean) => setLayout({ ...layout, expanded });
  const windows = (conversations || []).filter(c => layout.windows.includes(c.id))
    .sort((a, b) => layout.windows.indexOf(a.id) - layout.windows.indexOf(b.id));

  return (
    <div className="pointer-events-none fixed bottom-0 right-6 z-[60] hidden items-end gap-3 lg:flex">
      {windows.map(c => layout.minimized.includes(c.id) ? (
        <section key={c.id} aria-label={`Chat with ${c.other.full_name}`}
                 className="pointer-events-auto flex h-12 w-[336px] items-center gap-2 rounded-t-xl border border-b-0 border-line bg-surface px-3 shadow-lg">
          <button type="button" onClick={() => toggleMinimized(c.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Avatar name={c.other.full_name} size={28} online={c.other.is_online} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{c.other.full_name}</span>
            {c.unread > 0 && <Badge n={c.unread} />}
          </button>
          <button type="button" onClick={() => closeWindow(c.id)} aria-label="Close chat" title="Close chat"
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-inset">
            <Icon name="x" size={16} />
          </button>
        </section>
      ) : (
        <section key={c.id} aria-label={`Chat with ${c.other.full_name}`}
                 className="pointer-events-auto flex h-[460px] w-[336px] flex-col overflow-hidden rounded-t-xl border border-b-0 border-line bg-surface shadow-lg">
          <ConversationView id={c.id} variant="window"
                            onMinimize={() => toggleMinimized(c.id)} onClose={() => closeWindow(c.id)} />
        </section>
      ))}

      <section aria-label="Messages"
               className="pointer-events-auto flex w-80 flex-col overflow-hidden rounded-t-xl border border-b-0 border-line bg-surface shadow-lg">
        <div className="flex h-12 shrink-0 items-center gap-1 px-3">
          <button type="button" onClick={() => setExpanded(!layout.expanded)} aria-expanded={layout.expanded}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Avatar name={user.full_name || user.username} size={30} tone="gold" online={live} />
            <span className="text-[15px] font-bold text-ink">Messages</span>
            {unreadTotal > 0 && <Badge n={unreadTotal} />}
          </button>
          <button type="button" title="New message" aria-label="New message"
                  onClick={() => { setNewOpen(true); setExpanded(true); }}
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-inset">
            <Icon name="compose" size={16} />
          </button>
          <button type="button" aria-label={layout.expanded ? 'Collapse messages' : 'Expand messages'}
                  onClick={() => setExpanded(!layout.expanded)}
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-inset">
            <Icon name="chevron" size={16} className={layout.expanded ? 'rotate-90' : '-rotate-90'} />
          </button>
        </div>
        {layout.expanded && (
          <div className="flex h-[min(70vh,560px)] flex-col border-t border-line">
            {newOpen && <NewChat onOpened={openWindow} onCancel={() => setNewOpen(false)} />}
            <ConversationList onOpen={openWindow} />
          </div>
        )}
      </section>
    </div>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-live px-1 text-[11px] font-bold text-white tabular-nums"
          aria-label={`${n} unread`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}
```

- [ ] **Step 2: Mount it and make room for it**

In `frontend/components/AppShell.tsx`, import `import { ChatDock } from './chat/ChatDock';` and render `<ChatDock />` right after `<QuickPing />`.

In `frontend/components/SenderToasts.tsx` (line 47), change `lg:bottom-6` to `lg:bottom-20` so toasts sit above the dock bar.

In `frontend/components/Tour.tsx`, in the "Take the tour" offer card's className, change `lg:bottom-6` to `lg:bottom-20`.

- [ ] **Step 3: Typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/chat/ChatDock.tsx frontend/components/AppShell.tsx frontend/components/SenderToasts.tsx frontend/components/Tour.tsx
git commit -m "Add LinkedIn-style messaging dock on desktop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: "Message" button on the People page

**Files:**
- Modify: `frontend/app/people/page.tsx`

**Interfaces:**
- Consumes: `startChat(userId, navigate)` from `lib/chat.ts`; `apiErrorMessage`.

The spec also mentioned a Message button "in the person picker". `PersonSelect` is a typeahead with no Ping button to sit next to, so that entry point is covered by the ✏️ new-message picker (Task 5) instead.

- [ ] **Step 1: Add the button**

In `frontend/app/people/page.tsx`:

1. Imports: add `import { useRouter } from 'next/navigation';` and `import { startChat } from '../../lib/chat';`, and add `apiErrorMessage` to the existing `../../lib/api` import.
2. In `Inner`, after the existing state hooks:

```ts
  const router = useRouter();

  async function message(p: Person) {
    try { await startChat(p.id, url => router.push(url)); }
    catch (e) { flash(apiErrorMessage(e, `Couldn't open a chat with ${p.full_name}`), false); }
  }
```

3. Between the Nudge and Ping buttons:

```tsx
                  <button
                    onClick={() => message(p)}
                    title="Chat quietly: no pop-up"
                    aria-label={`Message ${p.full_name}`}
                    className="btn-ghost btn-sm !px-2.5 sm:!px-3.5"
                  >
                    <Icon name="chat" size={16} /><span className="hidden sm:inline">Message</span>
                  </button>
```

(Icon-only on phones so three buttons still fit beside a name at 375px.)

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/people/page.tsx
git commit -m "Add Message button to the People page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: User documentation and end-to-end check

**Files:**
- Modify: `frontend/content/manual.json`
- Modify (generated): `docs/user-manual.md`
- Modify: `docs/notifications.md`
- Modify: `README.md`

- [ ] **Step 1: Add the manual section**

In `frontend/content/manual.json`, insert this section into `sections` directly after the section whose `"id"` is the one titled "Receiving a ping" (match its id exactly):

```json
{
  "id": "messages",
  "title": "Messages (chat)",
  "audience": "all",
  "blocks": [
    { "p": "**Messages** is a quiet one-to-one chat for things that don't need an answer this minute. Unlike a ping, a message never pops up in the middle of the screen or plays a sound: you get a red number on **Messages**, and a desktop notification if Office Ping is in the background." },
    { "h3": "Start a chat" },
    { "steps": [
      "On the **People** page, click **Message** next to the person. Or open **Messages**, click **New message** and pick them.",
      "Type your message. On a computer, press **Enter** to send (**Shift + Enter** starts a new line). On a phone, tap the send button.",
      "**Seen** appears under your last message once they've read it, and you see *typing…* while they write back."
    ] },
    { "p": "On a computer, your chats are also in the **Messages** bar in the bottom-right corner of every page. Click it to see them, and click a chat to open it in a small window while you carry on working." },
    { "h3": "When it needs attention now" },
    { "p": "Click **Ping** at the top of a chat to send that person a ping instead. It pops up on their screen until they acknowledge it." },
    { "h3": "Notifications and Do Not Disturb" },
    { "list": [
      "You get a desktop notification for a new message only when that chat isn't already open in front of you.",
      "While your status is **In a meeting** or **Do not disturb**, messages arrive silently, with no notification.",
      "To silence one chat, click the bell at the top of it. The red number still shows."
    ] },
    { "tip": "**Who can read my chats?** In Office Ping, only you and the other person. The audit log records that a chat was started, never what was said. Chat is a work tool, so write as you would in any work message." }
  ]
}
```

Also in `manual.json`:
- In the "Finding your way around" paragraph (`getting-started`), change `(Overview, People, Inbox, History)` to `(Overview, People, Inbox, Messages)` and `including your status, Help,` to `including History, your status, Help,`.
- In the office-stats paragraph, change `(on a phone, at the top of the **History** tab)` to `(on a phone, at the top of **History**, under **More**)`.

- [ ] **Step 2: Regenerate the Markdown manual**

Run: `node scripts/export-manual.mjs`
Expected: `docs/user-manual.md` now has a "Messages (chat)" section and contents entry. Check with `git diff --stat docs/user-manual.md`.

- [ ] **Step 3: Explain chat in the notifications doc**

In `docs/notifications.md`, add before `## Service worker`:

```markdown
## Chat messages

Chat (`apps/chat`) uses the same socket but is deliberately quiet:

| | Ping | Chat message |
|---|---|---|
| In-app | Centre pop-up until acknowledged | None; unread badge on Messages and the dock |
| Sound | Chime (distinct for urgent) | None |
| Desktop notification | Sticky (`requireInteraction`) | Not sticky; one per chat (tag `chat-<id>`), replaced by newer messages |
| In a meeting / DND | Normal pings go quietly to the inbox; urgent still pop up | Never notifies (`quiet` in the payload) |
| Shown when | Always (unless quiet) | Only if the chat isn't on screen in a visible tab, and isn't muted |

Clicking a chat notification opens `/messages?c=<id>` (the service worker
posts `open-url` to an open window). The notification closes on every device
once the chat is read anywhere (`chat_read` for the reader).
```

- [ ] **Step 4: Add chat to the README feature list**

In `README.md`, after the **Delivery and acknowledgement** list, add:

```markdown
**Chat**
- **Messages**: quiet one-to-one chat alongside pings. On a computer, a LinkedIn-style bar in the bottom-right corner opens your chats in small windows; on a phone, Messages has its own tab.
- **Seen and typing…**: read receipts and a typing indicator, live over the same connection as pings.
- **Never noisy**: no pop-up or sound, a desktop notification only when the chat isn't in front of you, nothing while you're in a meeting or on Do Not Disturb, and a per-chat mute. Need attention now? **Ping** from inside the chat.
- **Private**: only the two people can read a chat; the audit log records that a chat started, never its content. `CHAT_RATE` limits messages per minute (default 30).
```

- [ ] **Step 5: Run every automated check**

```bash
docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD/backend:/app" backend pytest -p no:cacheprovider
cd frontend && npm run typecheck && npm run build
```

Expected: backend green except the known baseline failure; typecheck and build succeed.

- [ ] **Step 6: Check it in real browsers**

Build and start the local stack, then seed demo users:

```bash
docker compose up -d --build
make seed
```

Open http://localhost:8080 in two separate browser profiles (or one normal and one private window) signed in as two different demo users, A and B. Check each item and note anything that fails:

1. B's People page → **Message** on A opens a dock window (desktop width); sending "hello" shows *Sending…* then the message.
2. A sees the dock badge go to 1 without reloading; the chat list shows "hello" with a time.
3. A opens the chat: A's badge clears, and B sees **Seen** under "hello".
4. A types: B sees "… is typing…", which disappears ~5 s after A stops or when A's message arrives.
5. With A's tab in the background, B sends a message: A gets one non-sticky desktop notification titled with B's name. Clicking it opens `/messages?c=<id>` in A's window. A second message replaces the notification rather than stacking.
6. A sets status **Do not disturb**: B's next message gives A no notification, but the badge goes up.
7. A mutes the chat (bell in the header): no notification; the badge still goes up. Unmute restores notifications.
8. In B's chat with A, **Ping** opens the ping dialog with A chosen; sending it pops up on A as a normal ping.
9. Open two chats at ≥1280px: two windows; a third replaces the oldest. At 1100px only one window. Minimise and close work. Reload: the dock comes back the same.
10. Long text with a link: wraps, link opens in a new tab. 4,001 characters are refused (box stops at 4,000).
11. Stop the backend (`docker compose stop backend`), send: message shows "Not sent · Retry · Discard". Start it (`docker compose start backend`), click Retry: it sends. Messages sent to you while disconnected appear after the socket reconnects.
12. Phone width (375px, browser device mode): tab bar shows Overview, People, Inbox, Messages, More; History is under More. Messages list → tap a chat → full screen with ←; composer stays above the keyboard; no dock anywhere.
13. Toasts and the "Take the tour" card appear above the dock bar, not behind it.
14. Admin user: Audit log shows one `CHAT_STARTED` per new chat with no message text; Django admin → Messages shows no text.

Fix anything that fails (with a test where the backend is involved), then re-run Step 5.

- [ ] **Step 7: Commit**

```bash
git add frontend/content/manual.json docs/user-manual.md docs/notifications.md README.md
git commit -m "Document chat in the manual, README and notifications guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Deployment to production (`tgf-dev`) is not part of this plan; it happens only when the user asks.
