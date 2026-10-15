"""WebSocket consumers.

Two logical channels, both namespaced per-user:
  - /ws/notifications/   — pushes new pings; receives client ACKs (delivered)
  - /ws/presence/        — heartbeat + online/away/offline updates

Each authenticated user is placed into a group `user.<id>`; the server sends
to that group so only that user's connected devices receive the payload.
Members cannot subscribe to another user's channel.
"""
from __future__ import annotations

import json
from datetime import timedelta

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

from .services import user_group_name


class _UserScopedMixin:
    """Place connection into `user.<id>` group; reject if unauthenticated."""

    group_name = None

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.user = user
        self.group_name = user_group_name(user.id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self._touch_user()

    async def disconnect(self, code):
        if self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    @database_sync_to_async
    def _touch_user(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        User.objects.filter(pk=self.user.id).update(last_seen_at=timezone.now())


class NotificationConsumer(_UserScopedMixin, AsyncJsonWebsocketConsumer):
    async def connect(self):
        await super().connect()
        if self.channel_name:  # accepted
            # Send any pending (undelivered) notifications on connect
            pending = await self._fetch_pending()
            for item in pending:
                await self.send_json({"type": "notification", "payload": item})

    async def receive_json(self, content, **kwargs):
        """Client ACKs:
          { "type": "ack_delivered", "delivery_id": 123 }
          { "type": "ack_seen", "delivery_id": 123 }
        """
        kind = content.get("type")
        did = content.get("delivery_id")
        if not kind or not did:
            return
        if kind == "ack_delivered":
            await self._mark_delivered(did)
        elif kind == "ack_seen":
            await self._mark_seen(did)

    async def notification_message(self, event):
        """Fan-out from NotificationService."""
        await self.send_json({"type": "notification", "payload": event["payload"]})

    async def ping_status(self, event):
        """Status updates for the sender (delivered/seen/ack)."""
        await self.send_json({"type": "ping_status", "payload": event["payload"]})

    @database_sync_to_async
    def _fetch_pending(self):
        from .models import PingDelivery
        qs = PingDelivery.objects.select_related("ping", "ping__sender",
                                                  "ping__group").filter(
            recipient_id=self.user.id,
            acknowledged_at__isnull=True,
            created_at__gte=timezone.now() - timedelta(days=1),
        ).order_by("created_at")[:50]
        return [
            {
                "ping_id": d.ping_id,
                "delivery_id": d.id,
                "sender_name": d.ping.sender.get_full_name() or d.ping.sender.username,
                "message": d.ping.message,
                "priority": d.ping.priority,
                "group_name": d.ping.group.name if d.ping.group_id else None,
                "created_at": d.ping.created_at.isoformat(),
            }
            for d in qs
        ]

    @database_sync_to_async
    def _mark_delivered(self, delivery_id):
        from .models import PingDelivery, Ping
        from .services import NotificationService
        try:
            d = PingDelivery.objects.select_related("ping").get(
                pk=delivery_id, recipient_id=self.user.id
            )
        except PingDelivery.DoesNotExist:
            return
        now = timezone.now()
        if not d.delivered_at:
            d.delivered_at = now
            d.status = PingDelivery.Status.DELIVERED
            d.save(update_fields=["delivered_at", "status"])
            # Update parent ping status if 1:1 or roll up for group
            ping = d.ping
            if not ping.delivered_at:
                ping.delivered_at = now
                if ping.status == Ping.Status.SENT:
                    ping.status = Ping.Status.DELIVERED
                ping.save(update_fields=["delivered_at", "status"])
            NotificationService.notify_sender_update(
                ping, "delivered", {"delivery_id": d.id, "recipient_id": d.recipient_id}
            )

    @database_sync_to_async
    def _mark_seen(self, delivery_id):
        from .models import PingDelivery, Ping
        from .services import NotificationService
        try:
            d = PingDelivery.objects.select_related("ping").get(
                pk=delivery_id, recipient_id=self.user.id
            )
        except PingDelivery.DoesNotExist:
            return
        now = timezone.now()
        if not d.seen_at:
            d.seen_at = now
            d.is_read = True
            d.status = PingDelivery.Status.SEEN
            d.save(update_fields=["seen_at", "is_read", "status"])
            ping = d.ping
            if not ping.seen_at:
                ping.seen_at = now
                if ping.status in (Ping.Status.SENT, Ping.Status.DELIVERED):
                    ping.status = Ping.Status.SEEN
                ping.save(update_fields=["seen_at", "status"])
            NotificationService.notify_sender_update(
                ping, "seen", {"delivery_id": d.id, "recipient_id": d.recipient_id}
            )


class PresenceConsumer(_UserScopedMixin, AsyncJsonWebsocketConsumer):
    async def receive_json(self, content, **kwargs):
        """Heartbeat message: { "type": "heartbeat" }."""
        if content.get("type") == "heartbeat":
            await self._touch_user()
            await self.send_json({"type": "heartbeat_ack",
                                   "server_time": timezone.now().isoformat()})
