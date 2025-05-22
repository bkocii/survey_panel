
from django.contrib.auth.models import AbstractUser
from django.db import models


# Custom user model extending Django's AbstractUser for additional fields and custom permissions
class CustomUser(AbstractUser):
    # Points field to track user rewards for completing surveys
    points = models.PositiveIntegerField(default=0)
    # Optional phone number for user contact or notifications
    phone_number = models.CharField(max_length=15, blank=True)
    # Optional date of birth for demographic-based survey targeting
    date_of_birth = models.DateField(null=True, blank=True)
    # Optional gender field for demographic data
    gender = models.CharField(max_length=10, choices=[('M', 'Male'), ('F', 'Female'), ('O', 'Other')], blank=True)
    # Many-to-many field for user groups, with unique related_name to avoid conflicts
    groups = models.ManyToManyField(
        'auth.Group',
        related_name='customuser_groups',  # Unique related_name for reverse access
        blank=True,
        help_text='The groups this user belongs to.',
        verbose_name='groups',
    )
    # Many-to-many field for user-specific permissions, with unique related_name
    user_permissions = models.ManyToManyField(
        'auth.Permission',
        related_name='customuser_permissions',  # Unique related_name for reverse access
        blank=True,
        help_text='Specific permissions for this user.',
        verbose_name='user permissions',
    )

    # Method to add points to a user's balance and save changes
    def add_points(self, amount):
        self.points += amount
        self.save()
