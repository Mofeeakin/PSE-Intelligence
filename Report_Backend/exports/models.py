from django.db import models
from reports.models import Report


class ExportFile(models.Model):
    FORMAT_DOCX = "docx"
    FORMAT_PDF = "pdf"
    FORMAT_CHOICES = [
        (FORMAT_DOCX, "DOCX"),
        (FORMAT_PDF, "PDF"),
    ]

    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="exports")
    format = models.CharField(max_length=10, choices=FORMAT_CHOICES)
    file = models.FileField(upload_to="exports/%Y/%m/")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.report} — {self.format.upper()}"


class ReportLogo(models.Model):
    PLACEMENT_COVER     = "cover_only"
    PLACEMENT_EVERY     = "every_page"
    PLACEMENT_SELECTED  = "selected_pages"
    PLACEMENT_CHOICES   = [
        (PLACEMENT_COVER,    "Cover Page Only"),
        (PLACEMENT_EVERY,    "Every Page (Page Header)"),
        (PLACEMENT_SELECTED, "Selected Pages"),
    ]

    report       = models.OneToOneField(Report, on_delete=models.CASCADE, related_name="logo")
    image        = models.ImageField(upload_to="logos/%Y/%m/")
    placement    = models.CharField(max_length=20, choices=PLACEMENT_CHOICES, default=PLACEMENT_COVER)
    pages        = models.JSONField(default=list, blank=True)  # 1-indexed section positions for selected_pages
    width_inches = models.FloatField(default=2.4)
    created_at   = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Logo for {self.report} ({self.placement})"
