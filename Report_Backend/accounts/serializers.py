import secrets
import string

from django.contrib.auth.models import User
from rest_framework import serializers
from rest_framework.authtoken.models import Token

from .models import UserProfile

_VALID_ROLES = (UserProfile.SUPER_ADMIN, UserProfile.SUB_ADMIN, UserProfile.USER)


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, required=False, allow_blank=True)
    role = serializers.ChoiceField(
        choices=_VALID_ROLES,
        default=UserProfile.USER,
        required=False,
    )

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "password", "role")
        read_only_fields = ("id",)

    def create(self, validated_data):
        role = validated_data.pop("role", UserProfile.USER)
        raw_password = validated_data.pop("password", None) or _generate_password()
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            password=raw_password,
        )
        Token.objects.create(user=user)
        # Set role on the profile (signal creates the profile if first user)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        # Preserve auto-promoted super_admin on first boot; otherwise apply requested role
        if profile.role != UserProfile.SUPER_ADMIN:
            profile.role = role
            profile.save()
        # Attach generated password so the view can return it once
        user._generated_password = raw_password
        return user


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ("id", "username", "email", "first_name", "last_name", "role")

    def get_role(self, obj):
        try:
            return obj.profile.role
        except Exception:
            return "user"


def _generate_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))
