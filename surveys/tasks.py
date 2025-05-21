from celery import shared_task
from django.core.mail import send_mail
from panel import settings


@shared_task
def send_survey_notification(user_email):
    subject = 'Survey Notification'
    message = f'Hi,\n\nPlease complete your survey.\n\nThank you!'
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.EMAIL_HOST_USER,
        recipient_list=[user_email],
        fail_silently=False,
    )
    return f"Notification sent to {user_email}"


@shared_task
def send_survey_reminder(user_email, survey_title):
    subject = f'Reminder: Complete Your {survey_title} Survey'
    message = f'Hi,\n\nPlease complete the {survey_title} survey.\n\nThank you!'
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.EMAIL_HOST_USER,
        recipient_list=[user_email],
        fail_silently=False,
    )
    return f"Reminder sent to {user_email}"
