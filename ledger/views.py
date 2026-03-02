from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from .models import PointsLedger


@login_required
def points_history(request):
    entries = PointsLedger.objects.filter(user=request.user).order_by("-created_at")[:200]
    balance = request.user.points
    return render(request, "ledger/points_history.html", {"entries": entries, "balance": balance})