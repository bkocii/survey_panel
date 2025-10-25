from django.contrib import admin
from django.contrib.admin.helpers import ACTION_CHECKBOX_NAME
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import Group
from unfold.admin import ModelAdmin
from .models import CustomUser
from .forms import CustomUserCreationForm, CustomUserChangeForm
from django.contrib import messages
from django import forms
from django.shortcuts import render, redirect
from django.http import HttpResponseRedirect
from django.db import transaction
from django.urls import reverse
import logging
from django.urls import path

logger = logging.getLogger(__name__)


class GroupSelectForm(forms.Form):
    group = forms.ModelChoiceField(
        queryset=Group.objects.all(),
        required=True,
        label="Select group to add users to"
    )


class CustomUserAdmin(UserAdmin, ModelAdmin):
    add_form = CustomUserCreationForm
    form = CustomUserChangeForm
    model = CustomUser

    list_display = ('username', 'email', 'is_staff', 'is_active', 'points')
    list_filter = ('is_staff', 'is_active', 'groups')
    search_fields = ('username', 'email')
    ordering = ('username',)
    # list_per_page = 100

    fieldsets = (
        (None, {'fields': ('username', 'email')}),
        ('Personal Info', {'fields': ('phone_number', 'date_of_birth', 'gender')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Points', {'fields': ('points',)}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'password1', 'password2', 'phone_number', 'date_of_birth', 'gender', 'is_active', 'is_staff', 'groups'),
        }),
    )

    actions = ["initiate_add_to_group"]
    actions_on_top = True
    actions_on_bottom = True

    # This method is triggered when the admin selects the action from the dropdown
    def initiate_add_to_group(self, request, queryset):
        # Get selected user IDs from POST (standard admin mechanism)
        selected = request.POST.getlist(ACTION_CHECKBOX_NAME)

        # Redirect to custom view with selected user IDs passed as GET params
        return redirect(f"add-to-group/?ids={','.join(selected)}")

    initiate_add_to_group.short_description = "Add selected users to a group"

    # Add custom URL for the intermediate view (form to pick a group)
    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "add-to-group/",
                self.admin_site.admin_view(self.add_to_group_view),
                name="add-to-group"
            ),
        ]
        return custom_urls + urls

    # Custom view that handles the group selection and assignment
    def add_to_group_view(self, request):
        user_ids = request.GET.get("ids", "").split(",")
        users = CustomUser.objects.filter(id__in=user_ids)

        if request.method == "POST":
            form = GroupSelectForm(request.POST)
            if form.is_valid():
                group = form.cleaned_data["group"]

                # Optimization: only add users who are not already in the group
                user_ids_not_in_group = users.exclude(groups=group).values_list("id", flat=True)

                # Many-to-many bulk add (add group to each user)
                CustomUser.objects.filter(id__in=user_ids_not_in_group).update()
                group.customuser_groups.add(*user_ids_not_in_group)

                count = len(user_ids_not_in_group)

                self.message_user(
                    request,
                    f"{count} users added to group '{group.name}'.",
                    messages.SUCCESS
                )
                return redirect("..")
        else:
            form = GroupSelectForm()

        # Render the form with the list of selected users
        return render(request, "admin/add_to_group.html", {
            "form": form,
            "users": users,
            "title": "Add selected users to a group"
        })


admin.site.register(CustomUser, CustomUserAdmin)

