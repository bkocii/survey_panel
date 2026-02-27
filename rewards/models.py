from django.conf import settings
from django.db import models


class Prize(models.Model):
    """
    A prize that users can redeem using points.
    Supports optional stock, optional image, and active/inactive state.
    """
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    points_cost = models.PositiveIntegerField()

    image = models.ImageField(upload_to="prizes/", null=True, blank=True)

    is_active = models.BooleanField(default=True)

    # If stock is NULL => unlimited. If set => decremented on successful redemption.
    stock = models.PositiveIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["points_cost", "-created_at"]

    def __str__(self):
        return f"{self.name} ({self.points_cost} pts)"

    @property
    def is_in_stock(self) -> bool:
        """True if unlimited stock or stock > 0."""
        return self.stock is None or self.stock > 0


class PrizeRedemption(models.Model):
    """
    Redemption request created when a user redeems a prize.
    This is the audit trail for points spending and admin fulfillment workflow.
    """
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("fulfilled", "Fulfilled"),
        ("cancelled", "Cancelled"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="redemptions"
    )
    prize = models.ForeignKey(
        Prize, on_delete=models.PROTECT, related_name="redemptions"
    )

    # Store cost at time of redemption (future-proof if prize cost changes)
    points_spent = models.PositiveIntegerField()

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    # Optional user note (e.g., “need size M”, “send voucher by email”)
    user_note = models.CharField(max_length=255, blank=True)

    # Optional admin note (e.g., “fulfilled on date…”)
    admin_note = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} -> {self.prize} ({self.status})"