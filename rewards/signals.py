from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.urls import reverse
from notifications.models import Notification
from .models import PrizeRedemption
from notifications.tasks import email_redemption_update
from django.db import transaction


@receiver(pre_save, sender=PrizeRedemption)
def cache_old_status(sender, instance: PrizeRedemption, **kwargs):
    if not instance.pk:
        instance._old_status = None
        return
    try:
        old = PrizeRedemption.objects.get(pk=instance.pk)
        instance._old_status = old.status
    except PrizeRedemption.DoesNotExist:
        instance._old_status = None


@receiver(post_save, sender=PrizeRedemption)
def notify_redemption_status(sender, instance: PrizeRedemption, created: bool, **kwargs):
    # We only notify on status changes after creation
    if created:
        return

    old_status = getattr(instance, "_old_status", None)
    new_status = instance.status
    if not old_status or old_status == new_status:
        return

    # Map statuses to notification type
    status_map = {
        "approved": "redeem_approved",
        "rejected": "redeem_rejected",
        "fulfilled": "redeem_fulfilled",
    }
    if new_status not in status_map:
        return

    Notification.objects.create(
        user=instance.user,
        type=status_map[new_status],
        title=f"Redemption {new_status}: {instance.prize.name}",
        message=f"Request #{instance.id} is now {new_status}.",
        url=reverse("rewards:my_redemptions"),
    )
    transaction.on_commit(lambda rid=instance.id: email_redemption_update.delay(rid))
