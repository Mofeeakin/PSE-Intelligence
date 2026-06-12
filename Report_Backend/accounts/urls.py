from django.urls import path
from .views import (
    RegisterView, LoginView, MeView, UserListView, UserRoleView,
    NotificationListView, NotificationDetailView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("users/", UserListView.as_view(), name="user-list"),
    path("users/<int:user_id>/role/", UserRoleView.as_view(), name="user-role"),
    path("notifications/", NotificationListView.as_view(), name="notification-list"),
    path("notifications/<int:pk>/", NotificationDetailView.as_view(), name="notification-detail"),
]
