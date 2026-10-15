from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Device


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "email", "first_name", "last_name", "role",
                    "department", "is_active", "last_seen_at")
    list_filter = ("role", "is_active", "department")
    search_fields = ("username", "email", "employee_code", "first_name",
                     "last_name", "department")
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Office Ping", {"fields": ("employee_code", "department", "designation",
                                     "role", "last_seen_at")}),
    )


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("user", "device_id", "browser", "os", "ip_address",
                    "is_active", "last_seen_at")
    list_filter = ("is_active", "browser")
    search_fields = ("user__username", "device_id", "ip_address")
