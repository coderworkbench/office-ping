from rest_framework import viewsets, filters
from .models import AuditLog
from .serializers import AuditLogSerializer
from apps.common.permissions import IsAdmin


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("actor").order_by("-timestamp")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["action", "target", "actor__username", "ip_address"]
    ordering_fields = ["timestamp", "action"]
