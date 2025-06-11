
from celery import shared_task
from django.core.mail import send_mass_mail
from django.contrib.auth.models import Group
from users.models import CustomUser
from surveys.models import Survey
from django.conf import settings
from django.urls import reverse

# Celery task to send email notifications for a new survey to users in assigned groups
@shared_task
def send_survey_notification(survey_id):
    survey = Survey.objects.get(id=survey_id)  # Fetch survey by ID
    # Get users in the survey's groups (or all users if no groups specified)
    users = CustomUser.objects.filter(groups__in=survey.groups.all()).distinct() if survey.groups.exists() else CustomUser.objects.all()
    # Prepare email messages in batches
    messages = []
    for user in users:
        if user.email:  # Only include users with email addresses
            survey_url = settings.SITE_URL + reverse('surveys:survey_start', args=[survey.id])  # Generate survey URL
            messages.append((
                f'New Survey Available: {survey.title}',  # Email subject
                f'Participate in our new survey: {survey.description}\n'
                f'Earn {survey.points_reward} points!\n'
                f'Access it here: {survey_url}',  # Include survey link
                settings.DEFAULT_FROM_EMAIL,  # Sender email
                [user.email]  # Recipient email
            ))
        # Send emails in batches of 500 to optimize performance
        if len(messages) >= 500:
            send_mass_mail(messages, fail_silently=False)
            messages = []
    # Send any remaining emails
    if messages:
        send_mass_mail(messages, fail_silently=False)
