from django.contrib import admin
from .models import Ping, PingDelivery


class PingDeliveryInline(admin.TabularInline):
    model = PingDelivery
    readonly_fields = ("recipient", "status", "is_read", "delivered_at",
                       "seen_at", "acknowledged_at", "created_at")
    extra = 0


@admin.register(Ping)
class PingAdmin(admin.ModelAdmin):
    list_display = ("id", "sender", "recipient", "group", "priority",
                    "status", "created_at")
    list_filter = ("priority", "status")
    search_fields = ("message", "sender__username", "recipient__username",
                     "group__name")
    inlines = [PingDeliveryInline]
    readonly_fields = ("created_at", "delivered_at", "seen_at", "acknowledged_at")


@admin.register(PingDelivery)
class PingDeliveryAdmin(admin.ModelAdmin):
    list_display = ("ping", "recipient", "status", "is_read", "created_at")
    list_filter = ("status", "is_read")
