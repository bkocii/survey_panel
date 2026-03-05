from celery import shared_task
from django.core.mail import send_mass_mail, send_mail
from django.contrib.auth.models import Group
from users.models import CustomUser
from surveys.models import Survey
from django.conf import settings
from django.urls import reverse
from surveys.models import Submission
from .models import Notification
from support.models import SupportTicket
from rewards.models import PrizeRedemption


@shared_task
def send_survey_notification(survey_id):
    survey = Survey.objects.get(id=survey_id)

    users = (
        CustomUser.objects.filter(groups__in=survey.groups.all()).distinct()
        if survey.groups.exists()
        else CustomUser.objects.all()
    )

    survey_path = reverse("surveys:survey_start", args=[survey.id])
    survey_url = settings.SITE_URL + survey_path  # for emails

    # 1) In-app notifications (bulk)
    notif_batch = []
    notif_batch_size = 1000

    # 2) Emails (mass mail)
    messages = []
    email_batch_size = 500

    for user in users:
        # In-app notification
        notif_batch.append(Notification(
            user=user,
            type="survey_new",
            title=f"New survey available: {survey.title}",
            message=f"Earn {survey.points_reward} points. {survey.description}",
            url=survey_path,
        ))

        if len(notif_batch) >= notif_batch_size:
            Notification.objects.bulk_create(notif_batch)
            notif_batch = []

        # Email notification (optional: only if email exists, and user preferes)
        prefs = getattr(user, "notification_settings", None)
        email_allowed = (prefs is None) or prefs.email_new_surveys  # default True if missing

        if user.email and email_allowed:
            messages.append((
                f"New Survey Available: {survey.title}",
                f"Participate in our new survey: {survey.description}\n"
                f"Earn {survey.points_reward} points!\n"
                f"Access it here: {survey_url}",
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
            ))

            if len(messages) >= email_batch_size:
                send_mass_mail(messages, fail_silently=False)
                messages = []

    # Flush remaining
    if notif_batch:
        Notification.objects.bulk_create(notif_batch)

    if messages:
        send_mass_mail(messages, fail_silently=False)


@shared_task
def send_survey_reminder(survey_id):
    """
    Remind eligible users who have NOT submitted the survey yet.
    Creates in-app notifications + sends reminder emails.
    """
    survey = Survey.objects.get(id=survey_id)

    eligible_users = (
        CustomUser.objects.filter(groups__in=survey.groups.all()).distinct()
        if survey.groups.exists()
        else CustomUser.objects.all()
    )

    # Exclude users who already submitted
    completed_user_ids = Submission.objects.filter(survey=survey).values_list("user_id", flat=True)
    users = eligible_users.exclude(id__in=completed_user_ids)

    survey_path = reverse("surveys:survey_start", args=[survey.id])
    survey_url = settings.SITE_URL + survey_path

    # In-app notifications
    notif_batch = []
    notif_batch_size = 1000

    # Emails
    messages = []
    email_batch_size = 500

    for user in users:
        notif_batch.append(Notification(
            user=user,
            type="survey_new",  # or add "survey_reminder" if you want a separate type
            title=f"Reminder: {survey.title}",
            message=f"Don’t forget to complete this survey to earn {survey.points_reward} points.",
            url=survey_path,
        ))

        if len(notif_batch) >= notif_batch_size:
            Notification.objects.bulk_create(notif_batch)
            notif_batch = []

        prefs = getattr(user, "notification_settings", None)
        email_allowed = (prefs is None) or prefs.email_survey_reminders  # default True if missing
        if user.email and email_allowed:
            messages.append((
                f"Reminder: Complete {survey.title}",
                f"Hi {user.username},\n\n"
                f"Reminder to complete: {survey.title}\n"
                f"Earn {survey.points_reward} points.\n\n"
                f"Open it here: {survey_url}",
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
            ))

            if len(messages) >= email_batch_size:
                send_mass_mail(messages, fail_silently=False)
                messages = []

    if notif_batch:
        Notification.objects.bulk_create(notif_batch)

    if messages:
        send_mass_mail(messages, fail_silently=False)


@shared_task
def email_ticket_reply(ticket_id: int):
    ticket = SupportTicket.objects.select_related("user").get(pk=ticket_id)
    user = ticket.user

    prefs = getattr(user, "notification_settings", None)
    if prefs and not prefs.email_ticket_replies:
        return "Email disabled"

    if not user.email:
        return "No email"

    # Direct link to the ticket
    ticket_url = settings.SITE_URL + reverse("support:ticket_detail", args=[ticket.id])

    send_mail(
        subject=f"Support replied to your ticket #{ticket.id}",
        message=(
            f"Hi {user.username},\n\n"
            f"Support has replied to your ticket:\n\n"
            f"{ticket.subject}\n\n"
            f"View it here: {ticket_url}\n"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
    return "Sent"


@shared_task
def email_redemption_update(redemption_id: int):
    redemption = PrizeRedemption.objects.select_related("user", "prize").get(pk=redemption_id)
    user = redemption.user

    prefs = getattr(user, "notification_settings", None)
    if prefs and not prefs.email_redemption_updates:
        return "Email disabled"

    if not user.email:
        return "No email"

    # Direct link to the redemption dashboard page
    redemptions_url = settings.SITE_URL + reverse("rewards:my_redemptions")

    status_label = redemption.status.replace("_", " ").title()

    send_mail(
        subject=f"Redemption update: {redemption.prize.name}",
        message=(
            f"Hi {user.username},\n\n"
            f"Your redemption request #{redemption.id} for '{redemption.prize.name}' "
            f"is now: {status_label}.\n\n"
            f"You can review it here:\n"
            f"{redemptions_url}\n\n"
            f"Thank you."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )

    return "Sent"