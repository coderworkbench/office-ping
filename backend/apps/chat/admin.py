from django.contrib import admin

from .models import Conversation, ConversationMember, Message


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "kind", "direct_key", "created_at", "last_message_at")


@admin.register(ConversationMember)
class ConversationMemberAdmin(admin.ModelAdmin):
    list_display = ("conversation", "user", "last_read_message", "muted")
    raw_id_fields = ("conversation", "user", "last_read_message")


# Chats are private: admin shows that messages exist, never what they say.
@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "sender", "created_at")
    fields = ("conversation", "sender", "created_at")
    readonly_fields = ("conversation", "sender", "created_at")

    def has_add_permission(self, request):
        return False
