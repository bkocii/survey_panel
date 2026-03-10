from .models import Notification


def notifications_panel(request):
    """
    Adds notification badge count + latest notifications to templates.
    Safe to use on any page; returns empty data when not authenticated.
    """
    if not request.user.is_authenticated:
        return {}

    unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
    latest_notifications = (
        Notification.objects
        .filter(user=request.user)
        .only("id", "title", "is_read", "created_at", "url")
        .order_by("-created_at")[:6]
    )

    return {
        "unread_count": unread_count,
        "latest_notifications": latest_notifications,
    }