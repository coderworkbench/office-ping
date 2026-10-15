from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    class Action(models.TextChoices):
        LOGIN = "LOGIN"
        LOGOUT = "LOGOUT"
        PASSWORD_CHANGED = "PASSWORD_CHANGED"
        PASSWORD_RESET = "PASSWORD_RESET"
        USER_CREATED = "USER_CREATED"
        USER_UPDATED = "USER_UPDATED"
        GROUP_CREATED = "GROUP_CREATED"
        GROUP_UPDATED = "GROUP_UPDATED"
        GROUP_DELETED = "GROUP_DELETED"
        MEMBER_ADDED_TO_GROUP = "MEMBER_ADDED_TO_GROUP"
        MEMBER_REMOVED_FROM_GROUP = "MEMBER_REMOVED_FROM_GROUP"
        TEMPLATE_CREATED = "TEMPLATE_CREATED"
        TEMPLATE_UPDATED = "TEMPLATE_UPDATED"
        TEMPLATE_DELETED = "TEMPLATE_DELETED"
        PING_SENT = "PING_SENT"
        PING_ACKNOWLEDGED = "PING_ACKNOWLEDGED"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_actions",
    )
    action = models.CharField(max_length=48, choices=Action.choices, db_index=True)
    target = models.CharField(max_length=128, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["action", "timestamp"]),
            models.Index(fields=["actor", "timestamp"]),
        ]

    def __str__(self) -> str:
        return f"{self.timestamp} {self.action} {self.actor_id}"
