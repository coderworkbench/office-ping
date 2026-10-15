from django.contrib import admin
from .models import MessageTemplate


@admin.register(MessageTemplate)
class MessageTemplateAdmin(admin.ModelAdmin):
    list_display = ("title", "created_by", "is_active", "updated_at")
    search_fields = ("title", "message")
    list_filter = ("is_active",)
