from django.urls import path
from .views import RegisterView, LoginView, MeView, UserListView, UserRoleView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("users/", UserListView.as_view(), name="user-list"),
    path("users/<int:user_id>/role/", UserRoleView.as_view(), name="user-role"),
]
