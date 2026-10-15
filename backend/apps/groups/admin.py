from django.contrib import admin
from .models import Group, GroupMember


class GroupMemberInline(admin.TabularInline):
    model = GroupMember
    extra = 0


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ("name", "created_by", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)
    inlines = [GroupMemberInline]
