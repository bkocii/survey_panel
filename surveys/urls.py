
from django.urls import path
from . import views

# URL patterns for the surveys app
app_name = 'surveys'  # Namespace for URL names to avoid conflicts

urlpatterns = [
    # URL for the survey list view, maps to /surveys/
    path('', views.survey_list, name='survey_list'),
    # URL for the survey detail view, maps to /surveys/<survey_id>/
    # path('<int:survey_id>/', views.survey_detail, name='survey_detail'),
    path('<int:survey_id>/question/', views.survey_question, name='survey_start'),
    path('<int:survey_id>/question/<int:question_id>/', views.survey_question, name='survey_question'),
    path('<int:survey_id>/submit/', views.survey_submit, name='survey_submit'),
    path('<int:survey_id>/already-submitted/', views.already_submitted, name='already_submitted'),

]
