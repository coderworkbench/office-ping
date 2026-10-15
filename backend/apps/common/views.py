from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsHROrAdmin
from apps.groups.models import Group
from apps.notifications.models import Ping

User = get_user_model()


class DashboardView(APIView):
    permission_classes = [IsHROrAdmin]

    def get(self, request):
        now = timezone.now()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        online_cutoff = now - timedelta(seconds=60)
        online_qs = User.objects.filter(
            is_active=True, last_seen_at__gte=online_cutoff
        )
        pings_today = Ping.objects.filter(created_at__gte=start_of_day)
        pending_acks = Ping.objects.filter(
            acknowledged_at__isnull=True,
            created_at__gte=now - timedelta(days=1),
        )
        return Response(
            {
                "total_employees": User.objects.filter(is_active=True).count(),
                "online_employees": online_qs.count(),
                "offline_employees": User.objects.filter(is_active=True).count()
                - online_qs.count(),
                "total_groups": Group.objects.filter(is_active=True).count(),
                "pings_today": pings_today.count(),
                "pending_acknowledgements": pending_acks.count(),
                "recent_pings": [
                    {
                        "id": p.id,
                        "sender": p.sender.get_full_name() or p.sender.username,
                        "recipient": (
                            p.recipient.get_full_name() if p.recipient else None
                        ),
                        "group": p.group.name if p.group else None,
                        "message": p.message,
                        "status": p.status,
                        "created_at": p.created_at.isoformat(),
                    }
                    for p in Ping.objects.select_related(
                        "sender", "recipient", "group"
                    ).order_by("-created_at")[:10]
                ],
            }
        )
