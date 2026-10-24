from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.serializers import UserSerializer

User = get_user_model()

MAX_BODY = 4000
PREVIEW = 140
# What a chat shows about the other person.
PERSON_FIELDS = ("id", "full_name", "department", "designation", "is_online",
                 "is_active", "last_seen_at", "status")


def person_dict(user):
    data = UserSerializer(user).data
    return {k: data[k] for k in PERSON_FIELDS}


def message_dict(m):
    return {"id": m.id, "conversation_id": m.conversation_id, "sender_id": m.sender_id,
            "body": m.body, "created_at": m.created_at.isoformat()}


class OpenConversationSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()

    def validate_user_id(self, value):
        if value == self.context["request"].user.id:
            raise serializers.ValidationError("You can't start a chat with yourself.")
        try:
            return User.objects.get(pk=value, is_active=True)
        except User.DoesNotExist:
            raise serializers.ValidationError("That person isn't available.")


class SendMessageSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=MAX_BODY)
    # Echoed back on the socket so the sending tab can swap its "Sending…" bubble.
    client_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")


class ReadSerializer(serializers.Serializer):
    message_id = serializers.IntegerField()


class MuteSerializer(serializers.Serializer):
    muted = serializers.BooleanField()
