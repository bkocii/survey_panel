
from django.shortcuts import render, redirect
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import login
from django import forms
from .models import CustomUser

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