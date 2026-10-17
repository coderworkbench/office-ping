from django.conf import settings
from django.db import models

# How many templates can be quick buttons on the Overview (home) screen.
HOME_TEMPLATES_MAX = 3


class MessageTemplate(models.Model):
    title = models.CharField(max_length=120, db_index=True)
    message = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="created_templates",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    # One of the (at most HOME_TEMPLATES_MAX) quick buttons on the Overview.
    show_on_home = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]

    def __str__(self) -> str:
        return self.title
