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
