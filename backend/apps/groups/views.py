from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Group, GroupMember
from .serializers import GroupSerializer, GroupMemberSerializer
from apps.common.permissions import IsHROrAdmin
from apps.audit.utils import record_audit


class GroupViewSet(viewsets.ModelViewSet):
    queryset = Group.objects.all().order_by("name")
    serializer_class = GroupSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        if self.action == "create" and settings.ALLOW_MEMBERS_CREATE_GROUPS:
            return [IsAuthenticated()]
        return [IsHROrAdmin()]

    def get_queryset(self):
        qs = Group.objects.prefetch_related("memberships__user").all()
        user = self.request.user
        # Members see only active groups they belong to
        if user.is_authenticated and user.role == "MEMBER":
            qs = qs.filter(is_active=True, memberships__user=user).distinct()
        return qs.order_by("name")

    def perform_create(self, serializer):
        group = serializer.save(created_by=self.request.user)
        record_audit(self.request, "GROUP_CREATED", target=str(group.id),
                     metadata={"name": group.name})

    def perform_update(self, serializer):
        group = serializer.save()
        record_audit(self.request, "GROUP_UPDATED", target=str(group.id))

    def perform_destroy(self, instance):
        gid = instance.id
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        record_audit(self.request, "GROUP_DELETED", target=str(gid))

    @action(detail=True, methods=["get", "post"], url_path="members",
            permission_classes=[IsHROrAdmin])
    def members(self, request, pk=None):
        group = self.get_object()
        if request.method == "GET":
            return Response(GroupMemberSerializer(
                group.memberships.select_related("user"), many=True
            ).data)
        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"detail": "user_id required"},
                            status=status.HTTP_400_BAD_REQUEST)
        gm, created = GroupMember.objects.get_or_create(group=group, user_id=user_id)
        if created:
            record_audit(request, "MEMBER_ADDED_TO_GROUP",
                         target=str(group.id), metadata={"user_id": user_id})
        return Response(GroupMemberSerializer(gm).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=["delete"],
            url_path=r"members/(?P<user_id>\d+)",
            permission_classes=[IsHROrAdmin])
    def remove_member(self, request, pk=None, user_id=None):
        group = self.get_object()
        gm = get_object_or_404(GroupMember, group=group, user_id=user_id)
        gm.delete()
        record_audit(request, "MEMBER_REMOVED_FROM_GROUP",
                     target=str(group.id), metadata={"user_id": int(user_id)})
        return Response(status=status.HTTP_204_NO_CONTENT)
