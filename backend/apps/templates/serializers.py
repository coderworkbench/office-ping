from rest_framework import serializers
from .models import MessageTemplate


class MessageTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageTemplate
        fields = ("id", "title", "message", "created_by", "is_active",
                  "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")
