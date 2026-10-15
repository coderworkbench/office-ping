from django.contrib import admin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "actor", "action", "target", "ip_address")
    list_filter = ("action",)
    search_fields = ("actor__username", "target", "ip_address")
    readonly_fields = ("actor", "action", "target", "metadata", "ip_address",
                       "timestamp")
