from django.contrib import admin
from .models import SupportTicket, TicketMessage
from unfold.admin import ModelAdmin, TabularInline


class TicketMessageInline(TabularInline):
    model = TicketMessage
    extra = 0


@admin.register(SupportTicket)
class SupportTicketAdmin(ModelAdmin):
    list_display = ("id", "user", "subject", "status", "priority", "updated_at")
    list_filter = ("status", "priority", "updated_at")
    search_fields = ("subject", "user__username", "user__email")
    inlines = [TicketMessageInline]


@admin.register(TicketMessage)
class TicketMessageAdmin(ModelAdmin):
    list_display = ("id", "ticket", "sender", "created_at")
    search_fields = ("ticket__subject", "sender__username", "message")