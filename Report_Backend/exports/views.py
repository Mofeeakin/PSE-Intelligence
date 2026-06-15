import json
import logging
import traceback as _traceback
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated

from reports.models import Report
from accounts.permissions import get_role
from .docx_builder import build_docx
from .pdf_builder import build_pdf
from .models import ReportLogo
from .serializers import ReportLogoSerializer

logger = logging.getLogger(__name__)


class QueryParamTokenAuthentication(TokenAuthentication):
    """
    Extends TokenAuthentication to also accept ?token= query param.
    This allows browser-initiated file downloads (<a href>) to authenticate
    without an Authorization header, since browsers can't set headers on
    link-click navigations.
    """
    def authenticate(self, request):
        # Try the standard Authorization header first.
        result = super().authenticate(request)
        if result is not None:
            return result
        # Fall back to ?token= query param.
        token_key = request.query_params.get("token")
        if token_key:
            return self.authenticate_credentials(token_key)
        return None


class ExportView(APIView):
    """
    Supports both Authorization header and ?token= query param so that
    direct download links (window.open / <a href>) work in the browser.

    NOTE: This view returns a binary HttpResponse, not a DRF Response.
    Content negotiation is disabled so that the ?format= query param is
    not intercepted by DRF's URL_FORMAT_OVERRIDE mechanism.
    """
    authentication_classes = [QueryParamTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def perform_content_negotiation(self, request, force=False):
        # Skip DRF renderer selection — we write HttpResponse directly.
        renderers = self.get_renderers()
        return (renderers[0] if renderers else None), "application/octet-stream"

    def get(self, request, pk):
        fmt = request.query_params.get("format", "docx").lower()
        if fmt not in ("docx", "pdf"):
            return Response(
                {"error": "format must be 'docx' or 'pdf'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = get_role(request.user)
        qs = Report.objects.select_related(
            "standard", "compliance_score", "logo"
        ).prefetch_related(
            "sections", "gaps__requirement", "evidence"
        )
        try:
            if role == "super_admin":
                report = qs.get(pk=pk)
            else:
                report = qs.get(pk=pk, user=request.user)
        except Report.DoesNotExist:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        safe_title = "".join(c for c in report.title if c.isalnum() or c in " _-")[:50].strip()
        filename = f"{safe_title}.{fmt}"

        if fmt == "docx":
            try:
                content = build_docx(report)
            except Exception as exc:
                logger.exception("DOCX build failed for report %s", pk)
                return Response(
                    {"error": "DOCX build failed", "detail": str(exc),
                     "traceback": _traceback.format_exc()},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        else:
            content = build_pdf(report)
            content_type = "application/pdf"

        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class ReportLogoView(APIView):
    """Upload, retrieve, or remove a logo associated with a report."""
    parser_classes = [MultiPartParser, FormParser]

    def _get_report(self, request, report_id):
        return get_object_or_404(Report, id=report_id, user=request.user)

    def get(self, request, report_id):
        report = self._get_report(request, report_id)
        logo = getattr(report, "logo", None)
        if not logo:
            return Response({"logo": None})
        return Response(ReportLogoSerializer(logo, context={"request": request}).data)

    def post(self, request, report_id):
        report = self._get_report(request, report_id)
        logo, _ = ReportLogo.objects.get_or_create(report=report)
        if "image" in request.FILES:
            if logo.image:
                logo.image.delete(save=False)
            logo.image = request.FILES["image"]
        logo.placement = request.data.get("placement", logo.placement)
        try:
            logo.width_inches = float(request.data.get("width_inches", logo.width_inches))
        except (TypeError, ValueError):
            pass
        raw_pages = request.data.get("pages")
        if raw_pages is not None:
            try:
                logo.pages = json.loads(raw_pages) if isinstance(raw_pages, str) else list(raw_pages)
            except (ValueError, TypeError):
                logo.pages = []
        logo.save()
        return Response(ReportLogoSerializer(logo, context={"request": request}).data)

    def delete(self, request, report_id):
        report = self._get_report(request, report_id)
        logo = getattr(report, "logo", None)
        if logo:
            logo.image.delete(save=False)
            logo.delete()
        return Response(status=204)
