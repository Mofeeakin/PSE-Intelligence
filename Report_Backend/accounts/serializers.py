from django.contrib.auth.models import User
from rest_framework import serializers
from rest_framework.authtoken.models import Token


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "password")
        read_only_fields = ("id",)

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            password=validated_data["password"],
        )
        Token.objects.create(user=user)
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
