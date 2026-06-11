from django.urls import path
from .views import AdminCreateUserView, LoginView, LogoutView, MeView, UserListView, UserRoleView

urlpatterns = [
    path("register/", AdminCreateUserView.as_view(), name="auth-register"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("users/", UserListView.as_view(), name="user-list"),
    path("users/<int:user_id>/role/", UserRoleView.as_view(), name="user-role"),
]
