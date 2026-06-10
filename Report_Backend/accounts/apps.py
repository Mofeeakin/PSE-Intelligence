from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "accounts"

    def ready(self):
        from django.db.models.signals import post_save
        from django.contrib.auth.models import User
        from .models import UserProfile

        def create_profile(sender, instance, created, **kwargs):
            if not created:
                return
            is_first = not User.objects.exclude(pk=instance.pk).exists()
            role = UserProfile.SUPER_ADMIN if is_first else UserProfile.USER
            UserProfile.objects.get_or_create(user=instance, defaults={"role": role})

        post_save.connect(create_profile, sender=User)
