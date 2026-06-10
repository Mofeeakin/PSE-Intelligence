from django.urls import path
from .views import ExportView, ReportLogoView

urlpatterns = [
    path("reports/<int:pk>/export/", ExportView.as_view(), name="report-export"),
    path("reports/<int:report_id>/logo/", ReportLogoView.as_view(), name="report-logo"),
]
