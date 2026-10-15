from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Group, GroupMember

User = get_user_model()


class GroupMemberSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    user_email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = GroupMember
        fields = ("id", "user", "user_name", "user_email", "created_at")

    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.username


class GroupSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    members = GroupMemberSerializer(source="memberships", many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = ("id", "name", "description", "created_by", "created_by_name",
                  "is_active", "member_count", "members", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_by_name", "created_at", "updated_at")

    def get_member_count(self, obj):
        return obj.memberships.count()

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.get_full_name() or obj.created_by.username
