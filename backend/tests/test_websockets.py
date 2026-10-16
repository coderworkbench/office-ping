"""WebSocket behaviour, using an in-memory channel layer."""
import pytest
from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from rest_framework.test import APIClient

from apps.notifications.consumers import NotificationConsumer, PresenceConsumer


@pytest.fixture(autouse=True)
def in_memory_channel_layer(settings):
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


async def open_socket(consumer, path, user):
    comm = WebsocketCommunicator(consumer.as_asgi(), path)
    comm.scope["user"] = user
    connected, _ = await comm.connect()
    assert connected
    # connect() keeps running after the accept (it sends pending pings); let it
    # finish so a ping created next isn't also picked up as "pending".
    assert await comm.receive_nothing(timeout=0.3)
    return comm


def api_as(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@sync_to_async
def send_ping(sender, recipient, message="Please come here"):
    r = api_as(sender).post("/api/pings/", {"recipient": recipient.id, "message": message},
                            format="json")
    assert r.status_code == 201, r.data
    return r.data["id"]


@sync_to_async
def acknowledge(user, ping_id):
    r = api_as(user).post(f"/api/pings/{ping_id}/acknowledge/")
    assert r.status_code == 200, r.data


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_presence_socket_survives_incoming_pings(member_a, member_b):
    # Regression: the presence socket joined the user's group, received
    # "notification.message" / "ping.status" events it has no handler for,
    # and crashed (seen 34x/day in production logs), dropping the connection.
    presence_b = await open_socket(PresenceConsumer, "/ws/presence/", member_b)
    presence_a = await open_socket(PresenceConsumer, "/ws/presence/", member_a)
    notif_b = await open_socket(NotificationConsumer, "/ws/notifications/", member_b)

    ping_id = await send_ping(member_a, member_b)
    await notif_b.receive_json_from(timeout=2)
    await notif_b.send_json_to({"type": "ack_delivered", "delivery_id": ping_id})

    for presence in (presence_b, presence_a):
        await presence.send_json_to({"type": "heartbeat"})
        reply = await presence.receive_json_from(timeout=2)
        assert reply["type"] == "heartbeat_ack"

    for comm in (presence_a, presence_b, notif_b):
        await comm.disconnect()


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_acknowledging_clears_the_ping_in_every_open_tab(member_a, member_b):
    tab1 = await open_socket(NotificationConsumer, "/ws/notifications/", member_b)
    tab2 = await open_socket(NotificationConsumer, "/ws/notifications/", member_b)

    ping_id = await send_ping(member_a, member_b)
    for tab in (tab1, tab2):
        msg = await tab.receive_json_from(timeout=2)
        assert msg["type"] == "notification"
        assert msg["payload"]["ping_id"] == ping_id

    await acknowledge(member_b, ping_id)

    for tab in (tab1, tab2):
        msg = await tab.receive_json_from(timeout=2)
        assert msg == {"type": "ping_handled", "payload": {"ping_id": ping_id}}

    for comm in (tab1, tab2):
        await comm.disconnect()


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_ping_handled_is_only_sent_to_the_recipient(member_a, member_b, hr_user):
    other = await open_socket(NotificationConsumer, "/ws/notifications/", hr_user)
    ping_id = await send_ping(member_a, member_b)
    await acknowledge(member_b, ping_id)
    assert await other.receive_nothing(timeout=0.5)
    await other.disconnect()
