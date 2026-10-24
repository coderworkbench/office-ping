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


# ---------- Muting ----------

@pytest.mark.django_db
def test_muting_a_chat(member_a, member_b, pushed):
    cid = open_chat(member_a, member_b)
    r = api_as(member_a).post(f"{URL}{cid}/mute/", {"muted": True}, format="json")
    assert r.data == {"muted": True}
    assert listing(member_a)[0][cid]["muted"] is True
    assert listing(member_b)[0][cid]["muted"] is False
