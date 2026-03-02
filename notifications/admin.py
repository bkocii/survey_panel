from django.contrib import admin
from unfold.admin import ModelAdmin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(ModelAdmin):
    list_display = ("created_at", "user", "type", "title", "is_read")
    list_filter = ("type", "is_read", "created_at")
    search_fields = ("user__username", "user__email", "title", "message", "url")