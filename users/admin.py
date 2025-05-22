
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser


# Custom admin configuration for CustomUser model
@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    # Fields to display in the admin list view
    list_display = ('username', 'email', 'points', 'phone_number', 'date_of_birth', 'gender', 'is_staff')
    # Fields to filter by in the admin interface
    list_filter = ('is_staff', 'is_active', 'gender', 'groups')
    # Fields to search by in the admin interface
    search_fields = ('username', 'email', 'phone_number')
    # Fields to display in the admin detail view
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal Info', {'fields': ('first_name', 'last_name', 'email', 'phone_number', 'date_of_birth', 'gender')}),
        ('Points', {'fields': ('points',)}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
    )
    # Fields for adding a new user
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'password1', 'password2', 'points', 'phone_number', 'date_of_birth', 'gender'),
        }),
    )
    # Enable sorting by these fields
    ordering = ('username',)

