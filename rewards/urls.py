from django.urls import path
from . import views

app_name = "rewards"

urlpatterns = [
    path("prizes/", views.prize_list, name="prize_list"),
    path("prizes/<int:pk>/", views.prize_detail, name="prize_detail"),
    path("prizes/<int:pk>/redeem/", views.redeem_prize, name="redeem_prize"),
    path("my-redemptions/", views.my_redemptions, name="my_redemptions"),
    path("my-redemptions/<int:pk>/cancel/", views.cancel_redemption, name="cancel_redemption"),
]