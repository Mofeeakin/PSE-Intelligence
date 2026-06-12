import os
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from accounts.models import UserProfile


# Hardcoded fallback credentials — always work even without env vars
_DEFAULT_USERNAME = "admin"
_DEFAULT_PASSWORD = "Admin@PSE2026"
_DEFAULT_EMAIL = "admin@pse.com"


class Command(BaseCommand):
    help = "Ensure the super-admin account exists and password is current."

    def handle(self, *args, **kwargs):
        username = os.environ.get("DJANGO_SUPERUSER_USERNAME", _DEFAULT_USERNAME)
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD", _DEFAULT_PASSWORD)
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", _DEFAULT_EMAIL)

        user, created = User.objects.get_or_create(
            username=username,
            defaults={"email": email, "is_staff": True, "is_superuser": True},
        )

        # Always sync password so env-var changes take effect on redeploy
        user.set_password(password)
        user.is_staff = True
        user.is_superuser = True
        user.save()

        # Ensure super_admin role on profile
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if profile.role != UserProfile.SUPER_ADMIN:
            profile.role = UserProfile.SUPER_ADMIN
            profile.save()

        action = "created" if created else "verified"
        self.stdout.write(self.style.SUCCESS(
            f"Super-admin {action}: {username} / {email}"
        ))
