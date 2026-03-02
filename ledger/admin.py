from django.contrib import admin
from .models import PointsLedger
from unfold.admin import ModelAdmin


@admin.register(PointsLedger)
class PointsLedgerAdmin(ModelAdmin):
    list_display = ("created_at", "user", "amount", "type", "survey_id", "submission_id", "redemption_id")
    list_filter = ("type", "created_at")
    search_fields = ("user__username", "user__email", "note")
