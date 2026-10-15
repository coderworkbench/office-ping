from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Ping, PingDelivery
from apps.groups.models import Group
from apps.templates.models import MessageTemplate

User = get_user_model()


class PingCreateSerializer(serializers.ModelSerializer):
    recipient = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), allow_null=True, required=False
    )
    group = serializers.PrimaryKeyRelatedField(
        queryset=Group.objects.filter(is_active=True), allow_null=True, required=False
    )
    template = serializers.PrimaryKeyRelatedField(
        queryset=MessageTemplate.objects.filter(is_active=True),
        allow_null=True, required=False,
    )

    class Meta:
        model = Ping
        fields = ("recipient", "group", "template", "message", "priority")

    def validate(self, attrs):
        recipient = attrs.get("recipient")
        group = attrs.get("group")
        if bool(recipient) == bool(group):
            raise serializers.ValidationError(
                "Specify exactly one of 'recipient' or 'group'."
            )
        message = (attrs.get("message") or "").strip()
        if not message:
            raise serializers.ValidationError({"message": "Message is required."})
        if len(message) > 500:
            raise serializers.ValidationError({"message": "Message too long."})
        attrs["message"] = message
        return attrs


class PingDeliverySerializer(serializers.ModelSerializer):
    recipient_name = serializers.SerializerMethodField()

    class Meta:
        model = PingDelivery
        fields = ("id", "recipient", "recipient_name", "status", "is_read",
                  "delivered_at", "seen_at", "acknowledged_at", "created_at")

    def get_recipient_name(self, obj):
        return obj.recipient.get_full_name() or obj.recipient.username


class PingSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    recipient_name = serializers.SerializerMethodField()
    group_name = serializers.CharField(source="group.name", read_only=True)
    deliveries = PingDeliverySerializer(many=True, read_only=True)
    delivery_summary = serializers.SerializerMethodField()

    class Meta:
        model = Ping
        fields = ("id", "sender", "sender_name", "recipient", "recipient_name",
                  "group", "group_name", "template", "message", "priority", "status",
                  "created_at", "delivered_at", "seen_at", "acknowledged_at",
                  "deliveries", "delivery_summary")
        read_only_fields = fields

    def get_sender_name(self, obj):
        return obj.sender.get_full_name() or obj.sender.username

    def get_recipient_name(self, obj):
        if not obj.recipient:
            return None
        return obj.recipient.get_full_name() or obj.recipient.username

    def get_delivery_summary(self, obj):
        qs = obj.deliveries.all()
        total = qs.count()
        return {
            "total": total,
            "delivered": qs.filter(delivered_at__isnull=False).count(),
            "seen": qs.filter(seen_at__isnull=False).count(),
            "acknowledged": qs.filter(acknowledged_at__isnull=False).count(),
        }


class NotificationFeedSerializer(serializers.ModelSerializer):
    """Notification-center view of a delivery row."""

    ping_id = serializers.IntegerField(source="ping.id", read_only=True)
    message = serializers.CharField(source="ping.message", read_only=True)
    priority = serializers.CharField(source="ping.priority", read_only=True)
    sender_name = serializers.SerializerMethodField()
    group_name = serializers.CharField(source="ping.group.name", read_only=True,
                                        allow_null=True)
    sent_at = serializers.DateTimeField(source="ping.created_at", read_only=True)

    class Meta:
        model = PingDelivery
        fields = ("id", "ping_id", "message", "priority", "sender_name",
                  "group_name", "sent_at", "status", "is_read",
                  "delivered_at", "seen_at", "acknowledged_at")

    def get_sender_name(self, obj):
        return obj.ping.sender.get_full_name() or obj.ping.sender.username
