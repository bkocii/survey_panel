from django.contrib import admin, messages
from ledger.models import PointsLedger
from .models import Prize, PrizeRedemption
from unfold.admin import ModelAdmin
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F
from notifications.models import Notification
from django.urls import reverse
from notifications.tasks import email_redemption_update

User = get_user_model()


@admin.register(Prize)
class PrizeAdmin(ModelAdmin):
    list_display = ("name", "points_cost", "is_active", "stock", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.action(description="Reject selected redemptions (refund points + restore stock)")
def reject_refund_restore(modeladmin, request, queryset):
    allowed_statuses = {"pending", "approved"}

    processed = 0
    skipped = 0

    with transaction.atomic():
        locked_qs = (
            PrizeRedemption.objects
            .select_for_update()
            .select_related("prize", "user")
            .filter(pk__in=queryset.values_list("pk", flat=True))
        )

        for r in locked_qs:
            if r.status not in allowed_statuses:
                skipped += 1
                continue

            # Refund points (DB-level)
            User.objects.filter(pk=r.user_id).update(points=F("points") + r.points_spent)

            # Restore stock if limited (DB-level)
            if r.prize.stock is not None:
                Prize.objects.filter(pk=r.prize_id).update(stock=F("stock") + 1)

            # Mark rejected
            update_data = {"status": "rejected"}

            if not r.admin_note:
                update_data["admin_note"] = f"Rejected by admin {request.user.username}"

            PrizeRedemption.objects.filter(pk=r.pk).update(**update_data)

            Notification.objects.create(
                user_id=r.user_id,
                type="redeem_rejected",
                title=f"Redemption rejected: {r.prize.name}",
                message=f"Request #{r.id} was rejected. Your points were refunded.",
                url=reverse("rewards:my_redemptions"),
            )
            # Email only after commit (prevents “sent but rolled back” + ensures status is updated)
            transaction.on_commit(lambda rid=r.id: email_redemption_update.delay(rid))

            PointsLedger.objects.create(
                user_id=r.user_id,
                amount=+r.points_spent,
                type="redeem_refund",
                redemption_id=r.id,
                note="Admin rejected redemption (refund)",
            )

            processed += 1

    if processed:
        modeladmin.message_user(
            request,
            f"Rejected {processed} redemption(s): refunded points and restored stock where applicable.",
            level=messages.SUCCESS,
        )
    if skipped:
        modeladmin.message_user(
            request,
            f"Skipped {skipped} redemption(s) because they were not pending/approved.",
            level=messages.WARNING,
        )


@admin.register(PrizeRedemption)
class PrizeRedemptionAdmin(ModelAdmin):
    list_display = ("user", "prize", "points_spent", "status", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("user__username", "user__email", "prize__name")
    actions = [reject_refund_restore]
