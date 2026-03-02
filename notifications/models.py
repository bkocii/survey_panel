from django.conf import settings
from django.db import models


class Notification(models.Model):
    TYPE_CHOICES = [
        ("survey_new", "New survey"),
        ("ticket_reply", "Ticket reply"),
        ("redeem_approved", "Redemption approved"),
        ("redeem_rejected", "Redemption rejected"),
        ("redeem_fulfilled", "Redemption fulfilled"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=30, choices=TYPE_CHOICES)

    title = models.CharField(max_length=160)
    message = models.TextField(blank=True)

    # Store an internal path like "/support/tickets/12/" or "/surveys/5/question/"
    url = models.CharField(max_length=255, blank=True)

    is_read = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} - {self.type} - {self.title}"