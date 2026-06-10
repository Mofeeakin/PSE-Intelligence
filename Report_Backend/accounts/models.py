from django.contrib.auth.models import User
from django.db import models


class UserProfile(models.Model):
    SUPER_ADMIN = "super_admin"
    SUB_ADMIN   = "sub_admin"
    USER        = "user"
    ROLE_CHOICES = [
        (SUPER_ADMIN, "Super Admin"),
        (SUB_ADMIN,   "Project Manager / HOD"),
        (USER,        "Staff / User"),
    ]

    user       = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    role       = models.CharField(max_length=20, choices=ROLE_CHOICES, default=USER)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_super_admin(self):
        return self.role == self.SUPER_ADMIN

    @property
    def is_sub_admin(self):
        return self.role == self.SUB_ADMIN

    def __str__(self):
        return f"{self.user.username} ({self.role})"
