from rest_framework.permissions import BasePermission


def get_role(user):
    """Return the user's role string, or 'user' as fallback."""
    if not user or not user.is_authenticated:
        return None
    try:
        return user.profile.role
    except Exception:
        return "user"


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return get_role(request.user) == "super_admin"


class IsSubAdminOrAbove(BasePermission):
    def has_permission(self, request, view):
        return get_role(request.user) in ("super_admin", "sub_admin")
