from django.contrib import admin
from django.contrib.admin.helpers import ACTION_CHECKBOX_NAME
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import Group
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

class CustomUserAdmin(UserAdmin):
    add_form = CustomUserCreationForm
    form = CustomUserChangeForm
    model = CustomUser

    list_display = ('username', 'email', 'is_staff', 'is_active', 'points')
    list_filter = ('is_staff', 'is_active', 'groups')
    search_fields = ('username', 'email')
    ordering = ('username',)

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

    def initiate_add_to_group(self, request, queryset):
        selected = request.POST.getlist(ACTION_CHECKBOX_NAME)
        return redirect(f"add-to-group/?ids={','.join(selected)}")

    initiate_add_to_group.short_description = "Add selected users to a group"

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path("add-to-group/", self.admin_site.admin_view(self.add_to_group_view), name="add-to-group"),
        ]
        return custom_urls + urls

    def add_to_group_view(self, request):
        user_ids = request.GET.get("ids", "").split(",")
        users = CustomUser.objects.filter(id__in=user_ids)

        if request.method == "POST":
            form = GroupSelectForm(request.POST)
            if form.is_valid():
                group = form.cleaned_data["group"]
                added = 0
                for user in users:
                    if not user.groups.filter(id=group.id).exists():
                        user.groups.add(group)
                        added += 1
                self.message_user(request, f"{added} users added to group '{group.name}'.", messages.SUCCESS)
                return redirect("..")
        else:
            form = GroupSelectForm()

        return render(request, "admin/add_to_group.html", {
            "form": form,
            "users": users,
            "title": "Add selected users to a group"
        })


admin.site.register(CustomUser, CustomUserAdmin)


# from django.contrib import admin
# from django.contrib.auth.admin import UserAdmin
# from django.contrib.auth.models import Group
# from .models import CustomUser
# from .forms import CustomUserCreationForm, CustomUserChangeForm
# from django.contrib import messages
# from django import forms
# from django.shortcuts import render
# from django.http import HttpResponseRedirect
# from django.db import transaction
# from django.urls import reverse
# import logging
#
# logger = logging.getLogger(__name__)
#
# class AddToGroupForm(forms.Form):
#     group = forms.ModelChoiceField(
#         queryset=Group.objects.all(),
#         label="Select Group",
#         required=True,
#         help_text="Choose the group to add selected users to."
#     )
#
# class CustomUserAdmin(UserAdmin):
#     add_form = CustomUserCreationForm
#     form = CustomUserChangeForm
#     model = CustomUser
#
#     list_display = ('username', 'email', 'is_staff', 'is_active', 'points')
#     list_filter = ('is_staff', 'is_active', 'groups')
#     search_fields = ('username', 'email')
#     ordering = ('username',)
#
#     fieldsets = (
#         (None, {'fields': ('username', 'email')}),
#         ('Personal Info', {'fields': ('phone_number', 'date_of_birth', 'gender')}),
#         ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
#         ('Points', {'fields': ('points',)}),
#     )
#     add_fieldsets = (
#         (None, {
#             'classes': ('wide',),
#             'fields': ('username', 'email', 'password1', 'password2', 'phone_number', 'date_of_birth', 'gender', 'is_active', 'is_staff', 'groups'),
#         }),
#     )
#
#     actions = ['add_to_group']
#
#     def add_to_group(self, request, queryset):
#         logger.info(f"add_to_group action called with {queryset.count()} users")
#         logger.debug(f"Request method: {request.method}, POST data: {request.POST}")
#         for key, value in request.session.items():
#             print('{} => {}'.format(key, value))
#         print('stupid')
#         # if request.method == "POST":
#         if 'apply' in request.POST:
#             print('apply')
#             logger.info("Processing form submission")
#             form = AddToGroupForm(request.POST)
#             if form.is_valid():
#                 group = form.cleaned_data['group']
#                 user_ids = request.session.get('selected_user_ids', [])
#                 logger.debug(f"User IDs from session: {user_ids}")
#                 users = CustomUser.objects.filter(id__in=user_ids)
#                 count = 0
#                 try:
#                     with transaction.atomic():
#                         for user in users:
#                             user.groups.add(group)
#                             count += 1
#                             logger.info(f"Added user {user.username} to group {group.name}")
#                     request.session.pop('selected_user_ids', None)
#                     self.message_user(
#                         request,
#                         f"Successfully added {count} users to '{group.name}'.",
#                         messages.SUCCESS
#                     )
#                     return HttpResponseRedirect(request.get_full_path())
#                 except Exception as e:
#                     logger.error(f"Error adding users to group: {str(e)}")
#                     self.message_user(
#                         request,
#                         f"Error adding users to group: {str(e)}",
#                         messages.ERROR
#                     )
#             else:
#                 logger.error(f"Form validation failed: {form.errors}")
#         elif 'cancel' in request.POST:
#             logger.info("Cancel button pressed")
#             request.session.pop('selected_user_ids', None)
#             return HttpResponseRedirect(request.get_full_path())
#         else:
#             logger.info("Storing user IDs in session")
#             request.session['selected_user_ids'] = [user.id for user in queryset]
#             form = AddToGroupForm()
#
#         context = {
#             'title': 'Add Users to Group',
#             'subtitle': 'Select a group to assign the users to',
#             'site_title': admin.site.site_title,
#             'site_header': admin.site.site_header,
#             'site_url': admin.site.site_url,
#             'has_permission': admin.site.has_permission(request),
#             'is_popup': '_popup' in request.GET or '_popup' in request.POST,
#             'is_nav_sidebar_enabled': admin.site.enable_nav_sidebar,
#             'available_apps': admin.site.get_app_list(request),
#             'form': form,
#             'users': queryset.values('id', 'username'),
#             'opts': self.model._meta,
#             'action': 'add_to_group',
#             'password_url': reverse('admin:auth_user_password_change', args=(0,)),
#         }
#         logger.info("Rendering add_to_group form")
#         logger.debug(f"Context keys: {context.keys()}")
#         return render(request, 'admin/add_to_group_form.html', context)
#
#     add_to_group.short_description = "Add selected users to a group"
#
# admin.site.register(CustomUser, CustomUserAdmin)