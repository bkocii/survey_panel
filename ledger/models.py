from django.conf import settings
from django.db import models


class PointsLedger(models.Model):
    """
    Immutable audit log of all point changes.
    Positive amount = earned, negative amount = spent/refunded reversal depends on type.
    """
    TYPE_CHOICES = [
        ("survey_reward", "Survey reward"),
        ("redeem_spend", "Prize redemption spend"),
        ("redeem_refund", "Prize redemption refund"),
        ("admin_adjust", "Admin adjustment"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="points_ledger")
    amount = models.IntegerField()  # can be + or -
    type = models.CharField(max_length=30, choices=TYPE_CHOICES)

    # Optional links to objects that caused the change
    survey_id = models.IntegerField(null=True, blank=True)
    submission_id = models.IntegerField(null=True, blank=True)
    redemption_id = models.IntegerField(null=True, blank=True)

    note = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} {self.amount} ({self.type})"