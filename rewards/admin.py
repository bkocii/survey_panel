from django.contrib import admin
from .models import Prize, PrizeRedemption
from unfold.admin import ModelAdmin


@admin.register(Prize)
class PrizeAdmin(ModelAdmin):
    list_display = ("name", "points_cost", "is_active", "stock", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(PrizeRedemption)
class PrizeRedemptionAdmin(ModelAdmin):
    list_display = ("user", "prize", "points_spent", "status", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("user__username", "user__email", "prize__name")