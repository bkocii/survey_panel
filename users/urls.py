
from django.urls import path
from django.contrib.auth import views as auth_views

# URL patterns for the users app
app_name = 'users'  # Namespace for URL names

urlpatterns = [
    # Login view, maps to /users/login/
    path('login/', auth_views.LoginView.as_view(template_name='users/login.html'), name='login'),
    # Logout view, maps to /users/logout/
    path('logout/', auth_views.LogoutView.as_view(next_page='surveys:survey_list'), name='logout'),
]