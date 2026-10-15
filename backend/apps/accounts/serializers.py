from django.contrib.auth import get_user_model, password_validation
from rest_framework import serializers
from .models import Device

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()

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
        )
        read_only_fields = ("id", "last_seen_at", "is_online", "full_name")

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
        password_validation.validate_password(value)
        return value


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
