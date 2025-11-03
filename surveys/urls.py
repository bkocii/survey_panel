from django.contrib import admin
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
    path('api/question-data/<int:question_id>/', views.get_question_data, name="question_data_api",),
    path("admin/surveys/question-lookup/", admin.site.admin_view(views.question_lookup), name="admin_question_lookup"),
    path('api/question-preview/<int:question_id>/', views.get_question_preview_html, name='question_preview_html'),
    path("api/question-fragment/<int:pk>/", views.question_fragment, name="question_fragment"),
    path("<int:survey_id>/preview/", views.survey_preview, name="survey_preview"),
    path("admin/surveys/<int:survey_id>/reorder/", views.reorder_questions, name="surveys_reorder"),
    path('api/set-routing/', views.set_routing, name='surveys_set_routing'),

]
