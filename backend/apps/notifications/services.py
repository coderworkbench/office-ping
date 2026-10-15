"""Notification delivery service.

Abstracts the transport (WebSocket now, Web Push later) so ping logic
does not know about the wire protocol. The pattern is:

    NotificationService.deliver(ping, delivery_rows)
        -> fans out via each configured notifier.

Each notifier is responsible for its own "best effort" semantics. We mark
PingDelivery.delivered only when a client actually ACKs via WebSocket.
"""
from __future__ import annotations

from dataclasses import dataclass
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
                {
                    "type": "notification.message",
                    "payload": {
                        "ping_id": envelope.ping_id,
                        "delivery_id": envelope.delivery_id,
                        "sender_name": envelope.sender_name,
                        "message": envelope.message,
                        "priority": envelope.priority,
                        "group_name": envelope.group_name,
                        "created_at": envelope.created_at,
                    },
                },
            )
        except Exception:
            logger.exception("Failed WS notify to user %s", user_id)


class NotificationService:
    """Composite of configured notifiers.

    Add WebPushNotifier later for Internet / mobile delivery.
    """

    def __init__(self, notifiers: Iterable | None = None) -> None:
        self.notifiers: List = list(notifiers) if notifiers else [WebSocketNotifier()]

    def deliver(self, ping, deliveries):
        envelopes = []
        for d in deliveries:
            envelopes.append(
                (
                    d.recipient_id,
                    NotificationEnvelope(
                        ping_id=ping.id,
                        delivery_id=d.id,
                        sender_name=ping.sender.get_full_name() or ping.sender.username,
                        message=ping.message,
                        priority=ping.priority,
                        group_name=ping.group.name if ping.group_id else None,
                        created_at=ping.created_at.isoformat(),
                    ),
                )
            )
        for user_id, envelope in envelopes:
            for n in self.notifiers:
                n.send(user_id, envelope)

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
