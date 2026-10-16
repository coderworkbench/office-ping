import csv
from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, mixins, status, filters
from rest_framework.decorators import action
from rest_framework.exceptions import Throttled
from rest_framework.throttling import ScopedRateThrottle
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
from apps.common.permissions import IsAdmin
from apps.common.views import awaiting_ack


def _csv_safe(text):
    # Stop spreadsheet apps from running a message as a formula.
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


class PingRateLimited(Throttled):
    extra_detail_singular = "Try again in {wait} second."
    extra_detail_plural = "Try again in {wait} seconds."


_PERIODS = {"s": ("second", 1), "m": ("minute", 60), "h": ("hour", 3600), "d": ("day", 86400)}


def parse_rate(rate):
    """'5/minute' -> (5, 'minute', 60)."""
    num, _, period = (rate or "").partition("/")
    name, seconds = _PERIODS.get(period[:1], (period, 60))
    return int(num), name, seconds


def check_per_recipient_limit(request, recipient, message):
    """Stop one person bombarding another: refuse a repeat of the same message,
    and more than PING_RATE_PER_RECIPIENT direct pings to the same person."""
    limit, period, seconds = parse_rate(settings.PING_RATE_PER_RECIPIENT)
    now = timezone.now()
    recent = list(
        Ping.objects.filter(
            sender=request.user, recipient=recipient,
            created_at__gte=now - timedelta(seconds=seconds),
        ).order_by("-created_at").values_list("created_at", "message")[:limit]
    )
    name = recipient.get_full_name() or recipient.username
    same = next((at for at, text in recent if text == message), None)
    if same:
        reason, since = "duplicate", same
        detail = f"You just sent {name} this same message."
    elif len(recent) >= limit:
        reason, since = "per_recipient_limit", recent[-1][0]
        times = {1: "once", 2: "twice"}.get(limit, f"{limit} times")
        detail = f"You've already pinged {name} {times} in the last {period}."
    else:
        return
    # Log repeated attempts for admins, at most once a period per pair.
    if cache.add(f"ping_blocked:{request.user.id}:{recipient.id}", 1, seconds):
        record_audit(request, "PING_BLOCKED", target=str(recipient.id),
                     metadata={"reason": reason, "recipient": recipient.username})
    wait = seconds - (now - since).total_seconds()
    raise PingRateLimited(wait=max(wait, 1), detail=detail)


class PingThrottleMixin:
    """Rate-limit sending pings (not reading them); HR/admin have their own rate."""

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

    def throttled(self, request, wait):
        num, period, _ = parse_rate(ScopedRateThrottle.THROTTLE_RATES.get(self.throttle_scope))
        noun = "ping" if num == 1 else "pings"
        raise PingRateLimited(wait=wait, detail=f"You can send {num} {noun} a {period}.")


class PingViewSet(PingThrottleMixin, viewsets.ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter, filters.SearchFilter]
    search_fields = ["message", "sender__username", "sender__first_name",
                     "sender__last_name", "recipient__username",
                     "recipient__first_name", "recipient__last_name", "group__name"]
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
        return self._filter(qs).order_by("-created_at")

    def _filter(self, qs):
        """History filters: ?person=<id>&since=&until=<YYYY-MM-DD>&status=
        &priority=&awaiting=1 (plus ?search= from SearchFilter)."""
        p = self.request.query_params
        if p.get("person", "").isdigit():
            pid = int(p["person"])
            qs = qs.filter(Q(sender_id=pid) | Q(recipient_id=pid)
                           | Q(deliveries__recipient_id=pid)).distinct()
        tz = timezone.get_current_timezone()
        for key, lookup, shift in (("since", "created_at__gte", 0),
                                   ("until", "created_at__lt", 1)):
            try:
                day = date.fromisoformat(p.get(key, ""))
            except ValueError:
                continue
            start = datetime.combine(day + timedelta(days=shift), time.min, tzinfo=tz)
            qs = qs.filter(**{lookup: start})
        if p.get("status") in Ping.Status.values:
            qs = qs.filter(status=p["status"])
        if p.get("priority") in Ping.Priority.values:
            qs = qs.filter(priority=p["priority"])
        if p.get("awaiting") in ("1", "true"):
            qs = awaiting_ack(qs)
        return qs

    @action(detail=False, methods=["get"], url_path="export", permission_classes=[IsAdmin])
    def export(self, request):
        """CSV of every ping matching the History filters (admins only)."""
        qs = self.filter_queryset(self.get_queryset())
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        stamp = timezone.localtime().strftime("%Y-%m-%d")
        response["Content-Disposition"] = f'attachment; filename="office-ping-history-{stamp}.csv"'
        response.write("\ufeff")  # so Excel reads the names as UTF-8
        w = csv.writer(response)
        w.writerow(["Sent at", "From", "To", "Group", "Message", "Priority", "Status",
                    "Recipients", "Delivered", "Acknowledged", "Acknowledged at"])
        local = lambda dt: timezone.localtime(dt).strftime("%Y-%m-%d %H:%M:%S") if dt else ""
        rows = 0
        for ping in qs:
            ds = list(ping.deliveries.all())
            w.writerow([
                local(ping.created_at),
                ping.sender.get_full_name() or ping.sender.username,
                (ping.recipient.get_full_name() or ping.recipient.username) if ping.recipient else "",
                ping.group.name if ping.group else "",
                _csv_safe(ping.message),
                ping.priority, ping.status, len(ds),
                sum(1 for d in ds if d.delivered_at),
                sum(1 for d in ds if d.acknowledged_at),
                local(ping.acknowledged_at),
            ])
            rows += 1
        record_audit(request, "PINGS_EXPORTED", metadata={
            "rows": rows, "filters": {k: v for k, v in request.query_params.items()}})
        return response

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("recipient"):
            check_per_recipient_limit(request, serializer.validated_data["recipient"],
                                      serializer.validated_data["message"])
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
        """Acknowledge a ping, optionally with a short reply for the sender:
        {"reply": "On my way"}."""
        try:
            d = PingDelivery.objects.get(ping_id=pk, recipient=request.user)
        except PingDelivery.DoesNotExist:
            return Response({"detail": "No delivery for this user"},
                            status=status.HTTP_404_NOT_FOUND)
        reply = " ".join(str(request.data.get("reply") or "").split())
        if len(reply) > 120:
            return Response({"reply": ["Keep the reply under 120 characters."]},
                            status=status.HTTP_400_BAD_REQUEST)
        if not d.acknowledged_at:
            now = timezone.now()
            d.acknowledged_at = now
            d.is_read = True
            d.status = PingDelivery.Status.ACKNOWLEDGED
            d.reply = reply
            if not d.seen_at:
                d.seen_at = now
            d.save(update_fields=["acknowledged_at", "seen_at", "is_read", "status", "reply"])
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
                {"delivery_id": d.id, "recipient_id": d.recipient_id,
                 "recipient_name": request.user.get_full_name() or request.user.username,
                 "message": ping.message, "reply": reply},
            )
            NotificationService.notify_recipient_handled(d.recipient_id, ping.id)
            record_audit(request, "PING_ACKNOWLEDGED", target=str(ping.id),
                         metadata={"reply": reply} if reply else None)
        return Response(PingSerializer(d.ping).data)


class NotificationCenterViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Per-user notification feed derived from PingDelivery."""

    serializer_class = NotificationFeedSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = PingDelivery.objects.select_related(
            "ping", "ping__sender", "ping__group"
        ).filter(recipient=self.request.user).order_by("-created_at")
        if self.request.query_params.get("unread") in ("1", "true"):
            qs = qs.filter(is_read=False)
        return qs

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
