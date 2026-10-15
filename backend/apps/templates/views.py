from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import MessageTemplate
from .serializers import MessageTemplateSerializer
from apps.common.permissions import IsHROrAdmin
from apps.audit.utils import record_audit


class MessageTemplateViewSet(viewsets.ModelViewSet):
    queryset = MessageTemplate.objects.filter(is_active=True).order_by("title")
    serializer_class = MessageTemplateSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsHROrAdmin()]

    def perform_create(self, serializer):
        t = serializer.save(created_by=self.request.user)
        record_audit(self.request, "TEMPLATE_CREATED", target=str(t.id),
                     metadata={"title": t.title})

    def perform_update(self, serializer):
        t = serializer.save()
        record_audit(self.request, "TEMPLATE_UPDATED", target=str(t.id))

    def perform_destroy(self, instance):
        tid = instance.id
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        record_audit(self.request, "TEMPLATE_DELETED", target=str(tid))
