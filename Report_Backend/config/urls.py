"""
URL configuration for config project.
"""
from pathlib import Path
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse, HttpResponse


def health_check(request):
    return JsonResponse({"status": "ok"})


def spa_index(request, *args, **kwargs):
    """Serve the Vite SPA index.html for all non-API routes (client-side routing)."""
    spa_path = Path(settings.BASE_DIR) / "spa_dist" / "index.html"
    try:
        return HttpResponse(spa_path.read_text(encoding="utf-8"), content_type="text/html")
    except FileNotFoundError:
        return HttpResponse("SPA not built. Run: bun run build in Report_UI/", status=503)


urlpatterns = [
    path("api/health/", health_check),
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("reports.urls")),
    path("api/", include("exports.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT) + [
    # SPA catch-all — must be LAST; handles all non-API client-side routes
    re_path(r"^(?!api/|admin/|static/|media/).*$", spa_index),
]
