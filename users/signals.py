from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import CustomUser, UserNotificationSettings


@receiver(post_save, sender=CustomUser)
def create_notification_settings(sender, instance: CustomUser, created: bool, **kwargs):
    if created:
        UserNotificationSettings.objects.create(user=instance)