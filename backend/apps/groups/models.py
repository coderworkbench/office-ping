from django.conf import settings
from django.db import models


class Group(models.Model):
    name = models.CharField(max_length=120, unique=True, db_index=True)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="created_groups",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="GroupMember",
        related_name="ping_groups",
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class GroupMember(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="group_memberships"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("group", "user")]
        indexes = [models.Index(fields=["group", "user"])]
