from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, mixins, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Ping, PingDelivery
from .serializers import (
    PingCreateSerializer,
    PingSerializer,
    NotificationFeedSerializer,
)
from .services import NotificationService
from apps.audit.utils import record_audit


class PingThrottleMixin:
    """Rate-limit sending pings (not reading them); elevated users get more."""

    throttle_scope = "ping_send"

    def get_throttles(self):
        if self.action != "create":
            return []
        if getattr(self.request, "user", None):
            if self.request.user.is_authenticated and self.request.user.role in (
                "ADMIN",
                "HR",
            ):
                self.throttle_scope = "ping_send_elevated"
            else:
                self.throttle_scope = "ping_send"
        return super().get_throttles()


class PingViewSet(PingThrottleMixin, viewsets.ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter, filters.SearchFilter]
    search_fields = ["message", "sender__username", "recipient__username",
                     "group__name"]
    ordering_fields = ["created_at", "status", "priority"]

    def get_serializer_class(self):
        if self.action == "create":
            return PingCreateSerializer
        return PingSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Ping.objects.select_related(
            "sender", "recipient", "group", "template"
        ).prefetch_related("deliveries__recipient")
        scope = self.request.query_params.get("scope", "all")
        if user.role == "MEMBER":
            # Members see only their own sent and received pings
            qs = qs.filter(sender=user) | qs.filter(recipient=user) | qs.filter(
                deliveries__recipient=user
            )
            qs = qs.distinct()
        if scope == "sent":
            qs = qs.filter(sender=user)
        elif scope == "received":
            qs = qs.filter(deliveries__recipient=user).distinct()
        return qs.order_by("-created_at")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            ping = Ping.objects.create(
                sender=request.user,
                recipient=serializer.validated_data.get("recipient"),
                group=serializer.validated_data.get("group"),
                template=serializer.validated_data.get("template"),
                message=serializer.validated_data["message"],
                priority=serializer.validated_data.get("priority", Ping.Priority.NORMAL),
                status=Ping.Status.SENT,
            )
            recipients = self._resolve_recipients(ping)
            if not recipients:
                # No valid recipients (e.g., empty group); surface a clear error
                transaction.set_rollback(True)
                return Response(
                    {"detail": "No recipients to deliver to."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            deliveries = [
                PingDelivery(ping=ping, recipient_id=uid) for uid in recipients
            ]
            PingDelivery.objects.bulk_create(deliveries)
            # Reload with ids
            deliveries = list(
                PingDelivery.objects.filter(ping=ping).select_related("recipient")
            )

        NotificationService().deliver(ping, deliveries)
        record_audit(
            request,
            "PING_SENT",
            target=str(ping.id),
            metadata={
                "recipients": len(recipients),
                "group_id": ping.group_id,
                "priority": ping.priority,
            },
        )
        return Response(
            PingSerializer(ping).data, status=status.HTTP_201_CREATED
        )

    def _resolve_recipients(self, ping):
        if ping.recipient_id:
            return [ping.recipient_id]
        if ping.group_id:
            return list(
                ping.group.memberships.values_list("user_id", flat=True)
            )
        return []

    @action(detail=True, methods=["post"])
    def seen(self, request, pk=None):
        """Mark this ping as seen for the current user (recipient)."""
        try:
            d = PingDelivery.objects.get(ping_id=pk, recipient=request.user)
        except PingDelivery.DoesNotExist:
            return Response({"detail": "No delivery for this user"},
                            status=status.HTTP_404_NOT_FOUND)
        if not d.seen_at:
            now = timezone.now()
            d.seen_at = now
            d.is_read = True
            d.status = PingDelivery.Status.SEEN
            d.save(update_fields=["seen_at", "is_read", "status"])
            if not d.ping.seen_at:
                d.ping.seen_at = now
                if d.ping.status in (Ping.Status.SENT, Ping.Status.DELIVERED):
                    d.ping.status = Ping.Status.SEEN
                d.ping.save(update_fields=["seen_at", "status"])
            NotificationService.notify_sender_update(
                d.ping, "seen", {"delivery_id": d.id, "recipient_id": d.recipient_id}
            )
        return Response(PingSerializer(d.ping).data)

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        try:
            d = PingDelivery.objects.get(ping_id=pk, recipient=request.user)
        except PingDelivery.DoesNotExist:
            return Response({"detail": "No delivery for this user"},
                            status=status.HTTP_404_NOT_FOUND)
        if not d.acknowledged_at:
            now = timezone.now()
            d.acknowledged_at = now
            d.is_read = True
            d.status = PingDelivery.Status.ACKNOWLEDGED
            if not d.seen_at:
                d.seen_at = now
            d.save(update_fields=["acknowledged_at", "seen_at", "is_read", "status"])
            # Update parent ping — treat all-acked as ACKNOWLEDGED
            ping = d.ping
            if not ping.acknowledged_at:
                remaining = ping.deliveries.filter(acknowledged_at__isnull=True).count()
                if remaining == 0:
                    ping.acknowledged_at = now
                    ping.status = Ping.Status.ACKNOWLEDGED
                    ping.save(update_fields=["acknowledged_at", "status"])
            NotificationService.notify_sender_update(
                ping, "acknowledged",
                {"delivery_id": d.id, "recipient_id": d.recipient_id},
            )
            record_audit(request, "PING_ACKNOWLEDGED", target=str(ping.id))
        return Response(PingSerializer(d.ping).data)


class NotificationCenterViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Per-user notification feed derived from PingDelivery."""

    serializer_class = NotificationFeedSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PingDelivery.objects.select_related(
            "ping", "ping__sender", "ping__group"
        ).filter(recipient=self.request.user).order_by("-created_at")

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        count = PingDelivery.objects.filter(
            recipient=request.user, is_read=False
        ).count()
        return Response({"unread": count})

    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        updated = PingDelivery.objects.filter(
            pk=pk, recipient=request.user
        ).update(is_read=True)
        return Response({"updated": updated})

    @action(detail=False, methods=["post"], url_path="read-all")
    def mark_all_read(self, request):
        updated = PingDelivery.objects.filter(
            recipient=request.user, is_read=False
        ).update(is_read=True)
        return Response({"updated": updated})
