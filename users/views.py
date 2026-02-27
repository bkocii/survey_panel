from django.shortcuts import render, redirect
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import login
from django import forms
from .models import CustomUser
from .forms import ProfileForm
from django.contrib.auth.decorators import login_required
from django.db import models
from surveys.models import Survey, Submission
from rewards.models import Prize, PrizeRedemption


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
    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)  # Initialize form with POST data
        if form.is_valid():
            user = form.save()  # Save new user
            login(request, user)  # Log in the user automatically
            return redirect('surveys:survey_list')  # Redirect to survey list
    else:
        form = CustomUserCreationForm()  # Initialize empty form
    return render(request, 'users/register.html', {'form': form})  # Render registration template


@login_required
def edit_profile(request):
    """
    Allow users to edit their profile details + upload an avatar.
    """
    if request.method == "POST":
        # request.FILES is required for avatar uploads
        form = ProfileForm(request.POST, request.FILES, instance=request.user)
        if form.is_valid():
            form.save()
            return redirect("users:dashboard")  # later: redirect to dashboard
    else:
        form = ProfileForm(instance=request.user)

    return render(request, "users/edit_profile.html", {"form": form})


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

    stats = {
        "available_count": available_surveys.count(),
        "completed_count": completed_qs.count(),
        "points": user.points,
        "last_submitted_at": completed_qs.first().submitted_at if completed_qs.exists() else None,
    }

    featured_prizes = Prize.objects.filter(is_active=True).order_by("points_cost")[:6]
    recent_redemptions = (
        PrizeRedemption.objects
        .filter(user=user)
        .select_related("prize")
        .order_by("-created_at")[:6]
    )

    return render(request, "users/dashboard.html", {
        "stats": stats,
        "available_surveys": available_surveys[:10],
        "completed_surveys": completed_qs[:10],
        "featured_prizes": featured_prizes,
        "recent_redemptions": recent_redemptions,
    })
