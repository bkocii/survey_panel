from django.urls import path
from . import views

app_name = "ledger"

urlpatterns = [
    path("points/", views.points_history, name="points_history"),
]