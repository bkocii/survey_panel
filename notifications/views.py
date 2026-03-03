from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST
from django.http import HttpResponseRedirect

from .models import Notification


@login_required
def notifications_list(request):
    qs = Notification.objects.filter(user=request.user).order_by("-created_at")[:200]
    unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
    return render(request, "notifications/list.html", {"notifications": qs, "unread_count": unread_count})


@login_required
@require_POST
def mark_read(request, pk: int):
    n = get_object_or_404(Notification, pk=pk, user=request.user)
    if not n.is_read:
        n.is_read = True
        n.save(update_fields=["is_read"])
    return redirect("notifications:list")


@login_required
@require_POST
def mark_all_read(request):
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    return redirect("notifications:list")


@login_required
def open_notification(request, pk: int):
    """
    Marks the notification as read and redirects to its target URL.
    """
    n = get_object_or_404(Notification, pk=pk, user=request.user)

    if not n.is_read:
        n.is_read = True
        n.save(update_fields=["is_read"])

    # Safety: only allow internal paths like "/something/"
    target = n.url or ""
    if not target.startswith("/"):
        return redirect("notifications:list")

    return HttpResponseRedirect(target)