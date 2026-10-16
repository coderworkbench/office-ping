from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        HR = "HR", "HR"
        MEMBER = "MEMBER", "Member"

    employee_code = models.CharField(
        max_length=32, unique=True, null=True, blank=True, db_index=True
    )
    email = models.EmailField(unique=True, db_index=True)
    department = models.CharField(max_length=100, blank=True)
    designation = models.CharField(max_length=100, blank=True)
    role = models.CharField(
        max_length=16, choices=Role.choices, default=Role.MEMBER, db_index=True
    )
    is_active = models.BooleanField(default=True, db_index=True)
    last_seen_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Status(models.TextChoices):
        MEETING = "MEETING", "In a meeting"
        LUNCH = "LUNCH", "Out for lunch"
        AWAY = "AWAY", "Away from desk"
        DND = "DND", "Do not disturb"

    # A status someone sets for themselves; it ends at status_until (or when
    # they clear it). MEETING and DND make non-urgent pings arrive quietly.
    status_kind = models.CharField(max_length=16, choices=Status.choices, blank=True)
    status_text = models.CharField(max_length=80, blank=True)
    status_until = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    class Meta:
        indexes = [
            models.Index(fields=["is_active", "role"]),
            models.Index(fields=["department"]),
        ]

    def __str__(self) -> str:
        return self.get_full_name() or self.username

    QUIET_STATUSES = ("MEETING", "DND")

    def current_status(self):
        """The status in effect now, or None once it has expired or been cleared."""
        if not self.status_kind:
            return None
        if self.status_until and self.status_until <= timezone.now():
            return None
        return {
            "kind": self.status_kind,
            "label": self.Status(self.status_kind).label,
            "text": self.status_text,
            "until": self.status_until.isoformat() if self.status_until else None,
            "quiet": self.status_kind in self.QUIET_STATUSES,
        }

    @property
    def wants_quiet(self) -> bool:
        """Non-urgent pings go to the inbox without a pop-up or sound."""
        s = self.current_status()
        return bool(s and s["quiet"])

    @property
    def is_admin(self) -> bool:
        return self.role == self.Role.ADMIN

    @property
    def is_hr(self) -> bool:
        return self.role == self.Role.HR


class Device(models.Model):
    """A browser/device session for a user. Multiple devices per user allowed."""

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="devices", db_index=True
    )
    device_id = models.CharField(max_length=64, db_index=True)
    browser = models.CharField(max_length=100, blank=True)
    os = models.CharField(max_length=100, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=400, blank=True)
    last_seen_at = models.DateTimeField(auto_now=True, db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("user", "device_id")]
        indexes = [models.Index(fields=["user", "is_active"])]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.device_id}"
