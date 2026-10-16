"""Re-alert urgent pings nobody has acknowledged.

After URGENT_ESCALATE_AFTER_MINUTES, each unacknowledged urgent delivery is
escalated once: the recipient's pop-up opens again marked as a reminder, and
the sender is told who hasn't responded. Run by `manage.py escalate_urgent`.
"""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditLog
from .models import Ping, PingDelivery
from .services import NotificationService


def escalate_due(now=None) -> int:
    minutes = settings.URGENT_ESCALATE_AFTER_MINUTES
    if minutes <= 0:
        return 0
    now = now or timezone.now()
    with transaction.atomic():
        due = list(
            PingDelivery.objects.select_for_update(skip_locked=True, of=("self",))
            .select_related("ping", "ping__sender", "ping__group", "recipient")
            .filter(
                ping__priority=Ping.Priority.URGENT,
                acknowledged_at__isnull=True,
                escalated_at__isnull=True,
                created_at__lte=now - timedelta(minutes=minutes),
                created_at__gte=now - timedelta(days=1),
            )
            .order_by("created_at")[:200]
        )
        for d in due:
            d.escalated_at = now
            d.save(update_fields=["escalated_at"])

    for d in due:
        ping = d.ping
        NotificationService().deliver(ping, [d], reminder=True)
        NotificationService.notify_sender_update(ping, "unacknowledged", {
            "delivery_id": d.id,
            "recipient_id": d.recipient_id,
            "recipient_name": d.recipient.get_full_name() or d.recipient.username,
            "message": ping.message,
            "minutes": minutes,
        })
        AuditLog.objects.create(
            action="PING_ESCALATED", target=str(ping.id),
            metadata={"recipient": d.recipient.username, "after_minutes": minutes},
        )
    return len(due)
