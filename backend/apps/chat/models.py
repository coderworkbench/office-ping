from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """A chat between people. Only one-to-one (DIRECT) chats exist for now;
    members live in ConversationMember so group chats can be added later."""

    class Kind(models.TextChoices):
        DIRECT = "DIRECT", "Direct"

    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.DIRECT)
    # "<smaller user id>:<larger user id>", so two people have exactly one chat.
    direct_key = models.CharField(max_length=41, unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Sorts the chat list; null until the first message.
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)

    @staticmethod
    def key_for(a_id: int, b_id: int) -> str:
        lo, hi = sorted((a_id, b_id))
        return f"{lo}:{hi}"

    def __str__(self) -> str:
        return f"Conversation({self.id} {self.direct_key or self.kind})"


class ConversationMember(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE,
                                     related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="chat_memberships")
    # Everything up to and including this message has been read. Drives the
    # unread count and the other person's "Seen".
    last_read_message = models.ForeignKey("Message", on_delete=models.SET_NULL,
                                          null=True, blank=True, related_name="+")
    # No desktop notifications for this chat; the unread count still updates.
    muted = models.BooleanField(default=False)

    class Meta:
        unique_together = [("conversation", "user")]
        indexes = [models.Index(fields=["user", "conversation"])]

    def __str__(self) -> str:
        return f"Member({self.conversation_id}:{self.user_id})"


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE,
                                     related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="chat_messages")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["conversation", "-id"])]

    def __str__(self) -> str:
        return f"Message({self.id} in {self.conversation_id})"
