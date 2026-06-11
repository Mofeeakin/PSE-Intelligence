from django.contrib.auth.models import User
from rest_framework import serializers
from rest_framework.authtoken.models import Token

from .models import UserProfile


VALID_ROLES = (UserProfile.SUPER_ADMIN, UserProfile.SUB_ADMIN, UserProfile.USER)


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=VALID_ROLES, default=UserProfile.USER, required=False)

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "password", "role")
        read_only_fields = ("id",)

    def create(self, validated_data):
        role = validated_data.pop("role", UserProfile.USER)
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            password=validated_data["password"],
        )
        Token.objects.create(user=user)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = role
        profile.save()
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
