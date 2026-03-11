from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import login
from django import forms
from .models import CustomUser
from django.contrib.auth.decorators import login_required
from django.db import models
from surveys.models import Survey, Submission
from rewards.models import Prize, PrizeRedemption
from notifications.models import Notification
from .forms import NotificationSettingsForm, CustomUserChangeForm, ProfileForm
from .models import UserNotificationSettings
from ledger.models import PointsLedger
from django.db.models import Sum
from django.contrib import messages
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from .tasks import send_verification_email


# Custom form for user registration, including CustomUser fields
class CustomUserCreationForm(UserCreationForm):
    phone_number = forms.CharField(max_length=15, required=False, help_text="Optional phone number for notifications.")
    date_of_birth = forms.DateField(required=False, help_text="Optional date of birth for demographic targeting.")
    gender = forms.ChoiceField(choices=[('', 'Select Gender'), ('M', 'Male'), ('F', 'Female'), ('O', 'Other')], required=False, help_text="Optional gender for demographic targeting.")

    class Meta:
        model = CustomUser
        fields = ('username', 'email', 'password1', 'password2', 'phone_number', 'date_of_birth', 'gender')


# View to handle user registration
def register(request):
    if request.user.is_authenticated:
        return redirect("users:dashboard")

    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            user = form.save(commit=False)
            user.is_active = False
            user.email_verified = False
            user.save()

            send_verification_email.delay(user.id)

            messages.success(
                request,
                "Account created. Please check your email and verify your address before logging in."
            )
            return redirect("users:login")
    else:
        form = CustomUserCreationForm()

    return render(request, 'users/register.html', {'form': form})


@login_required
def edit_profile(request):
    user = request.user

    # Ensure settings exist
    settings_obj, _ = UserNotificationSettings.objects.get_or_create(user=user)

    if request.method == "POST":
        user_form = ProfileForm(request.POST, request.FILES, instance=user)
        notif_form = NotificationSettingsForm(request.POST, instance=settings_obj)

        if user_form.is_valid() and notif_form.is_valid():
            user_form.save()
            notif_form.save()
            messages.success(request, "Profile updated successfully.")
            return redirect("users:dashboard")
    else:
        user_form = ProfileForm(instance=user)
        notif_form = NotificationSettingsForm(instance=settings_obj)

    return render(request, "users/edit_profile.html", {
        "user_form": user_form,
        "notif_form": notif_form,
    })


@login_required
def dashboard(request):
    """
    Admin-like user dashboard:
    - shows stats (available/completed/points)
    - lists available surveys (startable)
    - lists completed surveys (read-only)
    - shows featured prizes + latest redemptions
    """
    user = request.user

    completed_qs = (
        Submission.objects
        .filter(user=user)
        .select_related("survey")
        .order_by("-submitted_at")
    )
    completed_ids = completed_qs.values_list("survey_id", flat=True)

    available_surveys = (
        Survey.objects
        .filter(is_active=True)
        .filter(models.Q(groups__in=user.groups.all()) | models.Q(groups__isnull=True))
        .exclude(id__in=completed_ids)
        .distinct()
        .order_by("-created_at")
    )

    last_submission = completed_qs.first()
    stats = {
        "available_count": available_surveys.count(),
        "completed_count": completed_qs.count(),
        "points": user.points,
        "last_submitted_at": last_submission.submitted_at if last_submission else None,
    }

    recent_redemptions = (
        PrizeRedemption.objects
        .filter(user=user)
        .select_related("prize")
        .order_by("-created_at")[:3]
    )

    # Points summary (type-based)
    earned_total = (
                       PointsLedger.objects
                       .filter(user=user, type="survey_reward")
                       .aggregate(total=Sum("amount"))["total"]
                   ) or 0

    gross_spent_total = (
                            PointsLedger.objects
                            .filter(user=user, type="redeem_spend")
                            .aggregate(total=Sum("amount"))["total"]
                        ) or 0

    refund_total = (
                       PointsLedger.objects
                       .filter(user=user, type="redeem_refund")
                       .aggregate(total=Sum("amount"))["total"]
                   ) or 0

    # Net spent = spent - refunded
    spent_total = abs(gross_spent_total) - refund_total
    if spent_total < 0:
        spent_total = 0

    return render(request, "users/dashboard.html", {
        "stats": stats,
        "available_surveys": available_surveys[:3],
        "completed_surveys": completed_qs[:3],
        "recent_redemptions": recent_redemptions,
        "earned_total": earned_total,
        "spent_total": abs(spent_total),  # show as positive number
        "balance": request.user.points,
    })


def verify_email(request, uidb64, token):
    from django.contrib.auth import get_user_model
    User = get_user_model()

    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None

    if user is not None and default_token_generator.check_token(user, token):
        user.email_verified = True
        user.is_active = True
        user.save(update_fields=["email_verified", "is_active"])

        messages.success(request, "Your email has been verified. You can now log in.")
        return redirect("users:login")

    messages.error(request, "Verification link is invalid or has expired.")
    return redirect("users:register")


def home(request):
    """
    Public landing page for the survey panel.
    """
    return render(request, "users/home.html")
