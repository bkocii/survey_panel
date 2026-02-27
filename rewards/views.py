from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.contrib.auth import get_user_model
from django.db.models import F
from django.shortcuts import get_object_or_404, redirect, render

from .models import Prize, PrizeRedemption


@login_required
def prize_list(request):
    """
    Show all active prizes in a card grid.
    """
    prizes = Prize.objects.filter(is_active=True).order_by("points_cost", "name")
    return render(request, "rewards/prize_list.html", {"prizes": prizes})


@login_required
def prize_detail(request, pk: int):
    """
    Prize detail page (bigger image + description + redeem button).
    """
    prize = get_object_or_404(Prize, pk=pk, is_active=True)
    return render(request, "rewards/prize_detail.html", {"prize": prize})


@login_required
def my_redemptions(request):
    """
    Show the logged-in user's redemption history (read-only list).
    """
    redemptions = (
        PrizeRedemption.objects
        .filter(user=request.user)
        .select_related("prize")
        .order_by("-created_at")
    )
    return render(request, "rewards/my_redemptions.html", {"redemptions": redemptions})


@login_required
def cancel_redemption(request, pk: int):
    """
    Allow user to cancel ONLY their own PENDING redemption.
    If cancelled, points are refunded and stock is restored (if limited).
    """
    if request.method != "POST":
        return redirect("rewards:my_redemptions")

    User = get_user_model()

    with transaction.atomic():
        redemption = (
            PrizeRedemption.objects
            .select_for_update()
            .select_related("prize")
            .get(pk=pk, user=request.user)
        )

        if redemption.status != "pending":
            messages.error(request, "Only pending redemptions can be cancelled.")
            return redirect("rewards:my_redemptions")

        # lock user row
        user_locked = User.objects.select_for_update().get(pk=request.user.pk)

        # refund points
        user_locked.points = F("points") + redemption.points_spent
        user_locked.save(update_fields=["points"])

        # restore stock if limited
        prize = redemption.prize
        if prize.stock is not None:
            prize.stock = F("stock") + 1
            prize.save(update_fields=["stock"])

        redemption.status = "cancelled"
        redemption.save(update_fields=["status"])

    messages.success(request, "Redemption cancelled and points refunded.")
    return redirect("rewards:my_redemptions")


User = get_user_model()


@login_required
def redeem_prize(request, pk: int):
    """
    Redeem flow:
    - must be POST
    - user must have enough points
    - prize must be in stock
    - deduct points + decrement stock (if limited) atomically
    - create PrizeRedemption record
    """
    if request.method != "POST":
        return redirect("rewards:prize_detail", pk=pk)

    user = request.user

    with transaction.atomic():
        # Lock prize row to avoid overselling stock
        prize = Prize.objects.select_for_update().get(pk=pk, is_active=True)

        if not prize.is_in_stock:
            messages.error(request, "This prize is out of stock.")
            return redirect("rewards:prize_detail", pk=pk)

        # Lock the real user model row (not SimpleLazyObject)
        user_locked = User.objects.select_for_update().get(pk=user.pk)

        if user_locked.points < prize.points_cost:
            messages.error(request, "You do not have enough points to redeem this prize.")
            return redirect("rewards:prize_detail", pk=pk)

        # Deduct points atomically
        user_locked.points = F("points") - prize.points_cost
        user_locked.save(update_fields=["points"])

        # Stock handling (after locking prize)
        if prize.stock is not None:
            if prize.stock <= 0:
                messages.error(request, "This prize is out of stock.")
                return redirect("rewards:prize_detail", pk=pk)

            prize.stock = F("stock") - 1
            prize.save(update_fields=["stock"])

        # Create redemption record
        PrizeRedemption.objects.create(
            user=user_locked,
            prize=prize,
            points_spent=prize.points_cost,
            status="pending",
        )

    messages.success(request, "Redemption created! Status: Pending.")
    return redirect("rewards:prize_list")