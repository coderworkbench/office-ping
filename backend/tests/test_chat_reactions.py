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
