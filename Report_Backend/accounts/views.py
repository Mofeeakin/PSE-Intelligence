from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token

from .models import UserProfile, Notification
from .permissions import get_role
from .serializers import RegisterSerializer, UserSerializer


class RegisterView(APIView):
    """Super Admin only: create a new user account with an assigned role."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if get_role(request.user) != "super_admin":
            return Response(
                {"detail": "Only Super Admins can create user accounts."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            generated = getattr(user, "_generated_password", None)
            response_data = {"user": UserSerializer(user).data}
            if generated:
                response_data["generated_password"] = generated
            return Response(response_data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        if not username or not password:
            return Response(
                {"error": "username and password are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = authenticate(username=username, password=password)
        if not user:
            return Response(
                {"error": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserListView(APIView):
    """Super Admin only: list all users with their roles."""

    def get(self, request):
        if get_role(request.user) != "super_admin":
            return Response(status=status.HTTP_403_FORBIDDEN)
        users = User.objects.select_related("profile").all().order_by("username")
        return Response(UserSerializer(users, many=True).data)


class UserRoleView(APIView):
    """Super Admin only: change a user's role."""

    def patch(self, request, user_id):
        if get_role(request.user) != "super_admin":
            return Response(status=status.HTTP_403_FORBIDDEN)
        target = get_object_or_404(User, pk=user_id)
        role = request.data.get("role")
        if role not in (UserProfile.SUPER_ADMIN, UserProfile.SUB_ADMIN, UserProfile.USER):
            return Response({"detail": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)
        profile, _ = UserProfile.objects.get_or_create(user=target)
        profile.role = role
        profile.save()
        return Response(UserSerializer(target).data)


# ── Notification Views ────────────────────────────────────────────────────────

class NotificationSerializer:
    """Minimal inline serialiser to avoid a separate serializers file entry."""
    @staticmethod
    def serialize(notif):
        return {
            "id": notif.id,
            "message": notif.message,
            "report": notif.report_id,
            "report_title": notif.report.title if notif.report else None,
            "is_read": notif.is_read,
            "created_at": notif.created_at.isoformat(),
        }


class NotificationListView(APIView):
    """List the current user's notifications; supports ?unread=true filter."""

    def get(self, request):
        qs = Notification.objects.filter(user=request.user).select_related("report")
        if request.query_params.get("unread") == "true":
            qs = qs.filter(is_read=False)
        return Response([NotificationSerializer.serialize(n) for n in qs[:50]])

    def post(self, request):
        """Mark all notifications as read."""
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({"detail": "All notifications marked as read."})


class NotificationDetailView(APIView):
    """PATCH a single notification to mark it read."""

    def patch(self, request, pk):
        notif = get_object_or_404(Notification, pk=pk, user=request.user)
        notif.is_read = request.data.get("is_read", True)
        notif.save()
        return Response(NotificationSerializer.serialize(notif))

