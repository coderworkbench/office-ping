from django.contrib.auth import get_user_model, update_session_auth_hash
from rest_framework import viewsets, status, filters, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied

from .models import Device
from .serializers import (
    UserSerializer,
    UserCreateSerializer,
    PasswordChangeSerializer,
    DeviceSerializer,
)
from apps.common.permissions import IsAdmin, IsHROrAdmin
from apps.audit.utils import record_audit

User = get_user_model()


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.filter(is_active=True).order_by("first_name", "last_name")
    serializer_class = UserSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["username", "email", "first_name", "last_name",
                     "employee_code", "department", "designation"]
    ordering_fields = ["first_name", "last_name", "department", "last_seen_at"]

    def get_queryset(self):
        qs = User.objects.order_by("first_name", "last_name")
        user = self.request.user
        if user.is_authenticated and user.role == "MEMBER":
            # Members only see active users; limited fields enforced by serializer
            qs = qs.filter(is_active=True)
        return qs

    def get_serializer_class(self):
        if self.action in ("create",):
            return UserCreateSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve", "me"):
            return [IsAuthenticated()]
        return [IsAdmin()]

    def perform_create(self, serializer):
        user = serializer.save()
        record_audit(self.request, "USER_CREATED", target=str(user.id),
                     metadata={"username": user.username, "role": user.role})

    def perform_update(self, serializer):
        instance = serializer.instance
        # HR cannot change role of admins; only admins can touch admins
        requester = self.request.user
        if instance.role == "ADMIN" and requester.role != "ADMIN":
            raise PermissionDenied("Only an admin can modify an admin user")
        new_role = serializer.validated_data.get("role")
        if new_role and requester.role != "ADMIN":
            raise PermissionDenied("Only admins may change roles")
        user = serializer.save()
        record_audit(self.request, "USER_UPDATED", target=str(user.id))

    def perform_destroy(self, instance):
        # Soft deactivate rather than delete
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        record_audit(self.request, "USER_UPDATED", target=str(instance.id),
                     metadata={"deactivated": True})

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def me(self, request):
        return Response(UserSerializer(request.user).data)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data["current_password"]):
            return Response({"detail": "Current password incorrect"},
                            status=status.HTTP_400_BAD_REQUEST)
        user.set_password(serializer.validated_data["new_password"])
        user.save()
        update_session_auth_hash(request, user)
        record_audit(request, "PASSWORD_CHANGED", target=str(user.id))
        return Response({"detail": "Password updated"})


class DeviceViewSet(mixins.ListModelMixin,
                    mixins.CreateModelMixin,
                    mixins.DestroyModelMixin,
                    viewsets.GenericViewSet):
    serializer_class = DeviceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Device.objects.filter(user=self.request.user).order_by("-last_seen_at")

    def create(self, request, *args, **kwargs):
        """Register or refresh the current browser/device."""
        device_id = request.data.get("device_id") or ""
        if not device_id:
            return Response({"detail": "device_id required"},
                            status=status.HTTP_400_BAD_REQUEST)
        ip = request.META.get("REMOTE_ADDR")
        ua = request.META.get("HTTP_USER_AGENT", "")[:400]
        device, _ = Device.objects.update_or_create(
            user=request.user,
            device_id=device_id,
            defaults={
                "browser": request.data.get("browser", "")[:100],
                "os": request.data.get("os", "")[:100],
                "ip_address": ip,
                "user_agent": ua,
                "is_active": True,
            },
        )
        return Response(DeviceSerializer(device).data, status=status.HTTP_201_CREATED)
