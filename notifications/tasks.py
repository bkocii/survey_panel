from celery import shared_task
from django.core.mail import send_mass_mail
from users.models import CustomUser
from surveys.models import Survey


# Celery task to send email notifications for a new survey
@shared_task
def send_survey_notification(survey_id):
    survey = Survey.objects.get(id=survey_id)  # Fetch survey by ID
    users = CustomUser.objects.all()  # Get all users
    # Prepare email messages for each user with an email address
    messages = [
        (
            f'New Survey Available: {survey.title}',  # Email subject
            f'Participate in our new survey: {survey.description}\nEarn {survey.points_reward} points!',  # Email body
            'from@example.com',  # Sender email (replace with your email)
            [user.email]  # Recipient email
        )
        for user in users if user.email
    ]
    send_mass_mail(messages, fail_silently=False)  # Send emails in bulk