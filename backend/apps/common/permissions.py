"""Role-based permission classes.

Roles come from User.role: ADMIN, HR, MEMBER.
Server never trusts client-supplied role claims.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "ADMIN"
        )


class IsHROrAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("ADMIN", "HR")
        )


class IsSelfOrAdmin(BasePermission):
    """Object-level: only the user themselves or an admin may act."""

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.role == "ADMIN":
            return True
        return getattr(obj, "user_id", None) == request.user.id or obj == request.user


class ReadOnlyOrElevated(BasePermission):
    """Members read, HR/Admin write."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in ("ADMIN", "HR")
