from django.db.models.signals import post_save
from django.dispatch import receiver
from django.urls import reverse
from django.db import transaction
from notifications.models import Notification
from .models import TicketMessage
from notifications.tasks import email_ticket_reply


@receiver(post_save, sender=TicketMessage)
def notify_ticket_reply(sender, instance: TicketMessage, created: bool, **kwargs):
    if not created:
        return

    # Only notify user when sender is staff/admin
    if not instance.sender.is_staff:
        return

    ticket = instance.ticket
    user = ticket.user

    Notification.objects.create(
        user=user,
        type="ticket_reply",
        title=f"Support replied: Ticket #{ticket.id}",
        message=instance.message[:300],
        url=reverse("support:ticket_detail", args=[ticket.id]),
    )
    transaction.on_commit(lambda tid=ticket.id: email_ticket_reply.delay(tid))
