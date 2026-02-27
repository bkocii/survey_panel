
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