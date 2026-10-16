from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Ping(models.Model):
    """A ping is a single logical alert.

    - recipient XOR group (not both)
    - For group pings, a PingDelivery row is created per group member.
    """

    class Priority(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        URGENT = "URGENT", "Urgent"

    class Status(models.TextChoices):
        SENT = "SENT", "Sent"
        DELIVERED = "DELIVERED", "Delivered"
        SEEN = "SEEN", "Seen"
        ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="sent_pings", db_index=True,
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="received_pings", null=True, blank=True, db_index=True,
    )
    group = models.ForeignKey(
        "groups.Group", on_delete=models.SET_NULL,
        related_name="pings", null=True, blank=True, db_index=True,
    )
    template = models.ForeignKey(
        "message_templates.MessageTemplate", on_delete=models.SET_NULL,
        related_name="pings", null=True, blank=True,
    )
    message = models.TextField()
    priority = models.CharField(
        max_length=16, choices=Priority.choices, default=Priority.NORMAL, db_index=True
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.SENT, db_index=True
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    seen_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["sender", "-created_at"]),
            models.Index(fields=["recipient", "-created_at"]),
            models.Index(fields=["group", "-created_at"]),
            models.Index(fields=["status", "-created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=(models.Q(recipient__isnull=False) & models.Q(group__isnull=True))
                | (models.Q(recipient__isnull=True) & models.Q(group__isnull=False)),
                name="ping_recipient_xor_group",
            ),
        ]

    def clean(self):
        if bool(self.recipient_id) == bool(self.group_id):
            raise ValidationError(
                "A ping must target either a recipient or a group, not both/neither."
            )

    def __str__(self) -> str:
        target = self.recipient_id or f"group:{self.group_id}"
        return f"Ping({self.id}) {self.sender_id}->{target}"


class PingDelivery(models.Model):
    """Per-recipient delivery/ack tracking.

    For individual pings we still create one PingDelivery (recipient = Ping.recipient).
    For group pings we create one row per group member at send time.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING"
        DELIVERED = "DELIVERED"
        SEEN = "SEEN"
        ACKNOWLEDGED = "ACKNOWLEDGED"

    ping = models.ForeignKey(Ping, on_delete=models.CASCADE,
                             related_name="deliveries", db_index=True)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="ping_deliveries", db_index=True,
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    is_read = models.BooleanField(default=False, db_index=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    seen_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    # Optional quick reply sent with the acknowledgement ("On my way").
    reply = models.CharField(max_length=120, blank=True)
    # When an unacknowledged urgent ping was re-alerted (see escalate_urgent).
    escalated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        unique_together = [("ping", "recipient")]
        indexes = [
            models.Index(fields=["recipient", "is_read"]),
            models.Index(fields=["recipient", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Delivery({self.ping_id}->{self.recipient_id} {self.status})"
