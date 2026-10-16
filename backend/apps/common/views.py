from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsHROrAdmin
from apps.groups.models import Group
from apps.notifications.models import Ping

User = get_user_model()

# A ping counts as "awaiting acknowledgement" for this long; the dashboard
# card and the History "Awaiting ack" filter share this definition.
AWAITING_ACK_WINDOW = timedelta(days=1)


def start_of_today():
    """Local (TIME_ZONE) midnight, so "today" matches the office's day."""
    return timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)


def awaiting_ack(qs):
    return qs.filter(acknowledged_at__isnull=True,
                     created_at__gte=timezone.now() - AWAITING_ACK_WINDOW)


class DashboardView(APIView):
    permission_classes = [IsHROrAdmin]

    def get(self, request):
        now = timezone.now()
        # Counts are about your teammates, matching the People page: you
        # aren't included.
        teammates = User.objects.filter(is_active=True).exclude(pk=request.user.pk)
        total = teammates.count()
        online = teammates.filter(last_seen_at__gte=now - timedelta(seconds=60)).count()
        return Response(
            {
                "total_employees": total,
                "online_employees": online,
                "offline_employees": total - online,
                "total_groups": Group.objects.filter(is_active=True).count(),
                # Whole office, every sender.
                "pings_today": Ping.objects.filter(created_at__gte=start_of_today()).count(),
                "pending_acknowledgements": awaiting_ack(Ping.objects.all()).count(),
                "recent_pings": [
                    {
                        "id": p.id,
                        "sender": p.sender.get_full_name() or p.sender.username,
                        "recipient": (
                            (p.recipient.get_full_name() or p.recipient.username)
                            if p.recipient else None
                        ),
                        "group": p.group.name if p.group else None,
                        "message": p.message,
                        "priority": p.priority,
                        "status": p.status,
                        "created_at": p.created_at.isoformat(),
                    }
                    for p in Ping.objects.select_related(
                        "sender", "recipient", "group"
                    ).order_by("-created_at")[:30]
                ],
            }
        )
