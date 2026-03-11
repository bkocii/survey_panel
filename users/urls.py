
from django.urls import path
from django.contrib.auth import views as auth_views
from . import views

# URL patterns for the users app
app_name = 'users'  # Namespace for URL names

urlpatterns = [
    # Login view, maps to /users/login/
    path('login/', auth_views.LoginView.as_view(template_name='users/login.html', redirect_authenticated_user=True), name='login'),
    # Logout view, maps to /users/logout/
    path('logout/', auth_views.LogoutView.as_view(next_page='surveys:survey_list'), name='logout'),
    # Register view, maps to /users/register/
    path('register/', views.register, name='register'),
    path('verify-email/<uidb64>/<token>/', views.verify_email, name='verify_email'),
    path("profile/edit/", views.edit_profile, name="edit_profile"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path(
        'password-reset/',
        auth_views.PasswordResetView.as_view(
            template_name='users/password_reset_form.html',
            email_template_name='users/password_reset_email.txt',
            subject_template_name='users/password_reset_subject.txt',
            success_url='/users/password-reset/done/'
        ),
        name='password_reset'
    ),
    path(
        'password-reset/done/',
        auth_views.PasswordResetDoneView.as_view(
            template_name='users/password_reset_done.html'
        ),
        name='password_reset_done'
    ),
    path(
        'reset/<uidb64>/<token>/',
        auth_views.PasswordResetConfirmView.as_view(
            template_name='users/password_reset_confirm.html',
            success_url='/users/reset/done/'
        ),
        name='password_reset_confirm'
    ),
    path(
        'reset/done/',
        auth_views.PasswordResetCompleteView.as_view(
            template_name='users/password_reset_complete.html'
        ),
        name='password_reset_complete'
    ),
]