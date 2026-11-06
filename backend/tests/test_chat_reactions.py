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
