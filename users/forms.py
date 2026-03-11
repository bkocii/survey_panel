from .models import UserNotificationSettings
from django import forms
from django.contrib.auth.forms import UserCreationForm, UserChangeForm
from .models import CustomUser


# Form for creating new users in admin or registration
class CustomUserCreationForm(UserCreationForm):
    phone_number = forms.CharField(max_length=15, required=False, help_text="Optional phone number for notifications.")
    date_of_birth = forms.DateField(required=False, help_text="Optional date of birth for demographic targeting.")
    gender = forms.ChoiceField(choices=[('', 'Select Gender'), ('M', 'Male'), ('F', 'Female'), ('O', 'Other')], required=False, help_text="Optional gender for demographic targeting.")

    class Meta:
        model = CustomUser
        fields = ('username', 'email', 'password1', 'password2', 'phone_number', 'date_of_birth', 'gender')

    def clean_email(self):
        email = self.cleaned_data.get("email", "").strip()
        if email and CustomUser.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("An account with this email already exists.")
        return email


# Form for editing existing users in admin
class CustomUserChangeForm(UserChangeForm):
    class Meta:
        model = CustomUser
        fields = ('username', 'email', 'phone_number', 'date_of_birth', 'gender', 'is_active', 'is_staff', 'groups')


class ProfileForm(forms.ModelForm):
    """
    User-facing profile form.
    Includes avatar upload + basic demographic fields.
    """
    class Meta:
        model = CustomUser
        fields = [
            "first_name",
            "last_name",
            "email",
            "phone_number",
            "date_of_birth",
            "gender",
            "avatar",
        ]

        widgets = {
            "date_of_birth": forms.DateInput(attrs={"type": "date"}),
        }


class NotificationSettingsForm(forms.ModelForm):
    class Meta:
        model = UserNotificationSettings
        fields = (
            "email_new_surveys",
            "email_survey_reminders",
            "email_ticket_replies",
            "email_redemption_updates",
        )
