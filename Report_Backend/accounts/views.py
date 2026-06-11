from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token

from .models import UserProfile
from .permissions import IsSuperAdmin, get_role
from .serializers import RegisterSerializer, UserSerializer


class AdminCreateUserView(APIView):
    """Super Admin only: create a new user with a specified role."""
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            token = Token.objects.get(user=user)
            return Response(
                {"token": token.key, "user": UserSerializer(user).data},
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    """Invalidate the current session token server-side."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.auth_token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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

