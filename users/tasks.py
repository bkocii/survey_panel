from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

User = get_user_model()


@shared_task
def send_verification_email(user_id: int):
    user = User.objects.get(pk=user_id)

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)

    verify_path = reverse("users:verify_email", args=[uid, token])
    verify_url = settings.SITE_URL + verify_path

    send_mail(
        subject="Verify your email address",
        message=(
            f"Hi {user.username},\n\n"
            f"Please verify your email address by clicking the link below:\n\n"
            f"{verify_url}\n\n"
            f"If you did not create this account, you can ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )

    return "Verification email sent"