from django.urls import path
from .views import ExportView, ReportLogoView, ProjectLogoView

urlpatterns = [
    path("reports/<int:pk>/export/",               ExportView.as_view(),      name="report-export"),
    path("reports/<int:report_id>/logo/",          ReportLogoView.as_view(),  name="report-logo"),
    path("projects/<int:project_id>/logo/",        ProjectLogoView.as_view(), name="project-logo"),
]
