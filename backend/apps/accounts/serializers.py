from django.contrib.auth import get_user_model, password_validation
from rest_framework import serializers
from .models import Device

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()
    # {kind, label, text, until, quiet} while a status is set, else null.
    status = serializers.SerializerMethodField()

    def get_status(self, obj):
        return obj.current_status()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "employee_code",
            "department",
            "designation",
            "role",
            "is_active",
            "last_seen_at",
            "is_online",
            "status",
        )
        read_only_fields = ("id", "last_seen_at", "is_online", "full_name", "status")

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_is_online(self, obj):
        from django.utils import timezone
        from datetime import timedelta

        if not obj.last_seen_at:
            return False
        return obj.last_seen_at >= timezone.now() - timedelta(seconds=60)


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "employee_code",
            "department",
            "designation",
            "role",
            "is_active",
            "password",
        )

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField(min_length=8)

    def validate_new_password(self, value):
        password_validation.validate_password(value, user=self.context.get("user"))
        return value


class AdminSetPasswordSerializer(serializers.Serializer):
    """Admin sets a new password for another user (no current password)."""
    new_password = serializers.CharField(min_length=8, write_only=True)

    def validate_new_password(self, value):
        password_validation.validate_password(value, user=self.context.get("user"))
        return value


class StatusSerializer(serializers.Serializer):
    """Set or clear your own status. kind "" means available (clears it)."""

    kind = serializers.ChoiceField(choices=[("", "Available")] + list(User.Status.choices),
                                   allow_blank=True)
    text = serializers.CharField(max_length=80, allow_blank=True, required=False, default="")
    until = serializers.DateTimeField(allow_null=True, required=False, default=None)

    def validate(self, attrs):
        from datetime import timedelta
        from django.utils import timezone
        until = attrs.get("until")
        if attrs["kind"] and until:
            if until <= timezone.now():
                raise serializers.ValidationError({"until": "Pick a time later than now."})
            if until > timezone.now() + timedelta(days=7):
                raise serializers.ValidationError({"until": "A status can last up to 7 days."})
        if not attrs["kind"]:
            attrs.update(text="", until=None)
        return attrs


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = (
            "id",
            "device_id",
            "browser",
            "os",
            "ip_address",
            "user_agent",
            "last_seen_at",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "ip_address", "last_seen_at", "created_at")
