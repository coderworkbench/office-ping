"""Notification delivery service.

Abstracts the transport (WebSocket now, Web Push later) so ping logic
does not know about the wire protocol. The pattern is:

    NotificationService.deliver(ping, delivery_rows)
        -> fans out via each configured notifier.

Each notifier is responsible for its own "best effort" semantics. We mark
PingDelivery.delivered only when a client actually ACKs via WebSocket.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Iterable, List
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone

logger = logging.getLogger(__name__)


def user_group_name(user_id: int) -> str:
    """Channel-layer group name for a user's connected devices."""
    return f"user.{user_id}"


@dataclass
class NotificationEnvelope:
    ping_id: int
    delivery_id: int
    sender_name: str
    message: str
    priority: str
    group_name: str | None
    created_at: str
    # Recipient is in a meeting / do-not-disturb and the ping isn't urgent:
    # the browser files it in the inbox without a pop-up or sound.
    quiet: bool = False
    # Re-alert for an urgent ping still not acknowledged (escalate_urgent).
    reminder: bool = False

    @classmethod
    def for_delivery(cls, d, *, reminder: bool = False) -> "NotificationEnvelope":
        ping = d.ping
        return cls(
            ping_id=ping.id,
            delivery_id=d.id,
            sender_name=ping.sender.get_full_name() or ping.sender.username,
            message=ping.message,
            priority=ping.priority,
            group_name=ping.group.name if ping.group_id else None,
            created_at=ping.created_at.isoformat(),
            quiet=ping.priority != "URGENT" and d.recipient.wants_quiet,
            reminder=reminder,
        )


class WebSocketNotifier:
    """Delivers notifications to a user's connected device(s) via Channels."""

    def send(self, user_id: int, envelope: NotificationEnvelope) -> None:
        layer = get_channel_layer()
        if layer is None:
            logger.warning("No channel layer configured; skipping WS notify")
            return
        try:
            async_to_sync(layer.group_send)(
                user_group_name(user_id),
                {"type": "notification.message", "payload": asdict(envelope)},
            )
        except Exception:
            logger.exception("Failed WS notify to user %s", user_id)


class NotificationService:
    """Composite of configured notifiers.

    Add WebPushNotifier later for Internet / mobile delivery.
    """

    def __init__(self, notifiers: Iterable | None = None) -> None:
        self.notifiers: List = list(notifiers) if notifiers else [WebSocketNotifier()]

    def deliver(self, ping, deliveries, *, reminder: bool = False):
        for d in deliveries:
            d.ping = ping
            envelope = NotificationEnvelope.for_delivery(d, reminder=reminder)
            for n in self.notifiers:
                n.send(d.recipient_id, envelope)

    @staticmethod
    def notify_recipient_handled(user_id: int, ping_id: int) -> None:
        """Tell all of the recipient's open tabs/devices a ping was acknowledged."""
        layer = get_channel_layer()
        if layer is None:
            return
        try:
            async_to_sync(layer.group_send)(
                user_group_name(user_id),
                {"type": "ping.handled", "payload": {"ping_id": ping_id}},
            )
        except Exception:
            logger.exception("Failed WS handled update to user %s", user_id)

    @staticmethod
    def notify_sender_update(ping, kind: str, data: dict) -> None:
        """Push a lightweight status update (delivered/seen/ack) to the sender."""
        layer = get_channel_layer()
        if layer is None:
            return
        try:
            async_to_sync(layer.group_send)(
                user_group_name(ping.sender_id),
                {
                    "type": "ping.status",
                    "payload": {
                        "ping_id": ping.id,
                        "kind": kind,
                        "at": timezone.now().isoformat(),
                        **data,
                    },
                },
            )
        except Exception:
            logger.exception("Failed WS status update to sender %s", ping.sender_id)
