import threading
from django.db import models as db_models
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Report, Standard, Evidence, Submission, Requirement, Project
from .serializers import (
    ReportListSerializer,
    ReportDetailSerializer,
    ReportCreateSerializer,
    ReportStatusSerializer,
    ClauseSerializer,
    ProjectSerializer,
    ProjectMemberSerializer,
)
from agents.serializers import ReportSectionSerializer, AgentExecutionSerializer
from agents.pipeline import ReportPipeline
from accounts.permissions import get_role


class ReportListCreateView(APIView):
    def get(self, request):
        role = get_role(request.user)
        if role == "super_admin":
            reports = Report.objects.select_related("standard", "compliance_score").all()
        elif role == "sub_admin":
            project_ids = Project.objects.filter(
                created_by=request.user
            ).values_list("id", flat=True)
            reports = Report.objects.select_related("standard", "compliance_score").filter(
                db_models.Q(project_id__in=project_ids) | db_models.Q(user=request.user)
            )
        else:
            reports = Report.objects.select_related("standard", "compliance_score").filter(
                db_models.Q(user=request.user) | db_models.Q(assigned_to=request.user)
            )
        return Response(ReportListSerializer(reports.order_by("-created_at"), many=True).data)

    def post(self, request):
        serializer = ReportCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        try:
            standard = Standard.objects.get(code=data["standard_code"])
        except Standard.DoesNotExist:
            return Response(
                {"error": f"Standard '{data['standard_code']}' not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        report = Report.objects.create(
            user=request.user,
            title=data["title"],
            organisation=data["organisation"],
            department=data.get("department", ""),
            standard=standard,
            scope=data.get("scope", ""),
            service_type=data.get("service_type", Report.SERVICE_TYPE_AUDIT),
            wizard_answers=data.get("wizard_answers", []),
            status=Report.STATUS_PROCESSING,
            current_stage="Queued",
            progress_pct=0,
            project_id=data.get("project_id"),
            assigned_to_id=data.get("assigned_to_id"),
        )

        # Persist questionnaire answers as Submissions
        for item in data.get("submissions", []):
            req_id = item.get("requirement_id")
            if req_id:
                try:
                    req = Requirement.objects.get(pk=req_id)
                    Submission.objects.create(
                        report=report,
                        requirement=req,
                        compliance_status=item.get("compliance_status", "non_compliant"),
                        comment=item.get("comment", ""),
                    )
                except Requirement.DoesNotExist:
                    pass

        # Start pipeline in background thread
        pipeline = ReportPipeline()
        thread = threading.Thread(target=pipeline.run, args=[report.id], daemon=True)
        thread.start()

        return Response(
            ReportListSerializer(report).data,
            status=status.HTTP_201_CREATED,
        )


class ReportDetailView(APIView):
    def _get_report(self, request, pk):
        role = get_role(request.user)
        qs = Report.objects.select_related(
            "standard", "compliance_score", "validation_result"
        ).prefetch_related(
            "evidence", "submissions__requirement", "gaps__requirement", "sections", "agent_logs"
        )
        if role == "super_admin":
            return qs.filter(pk=pk).first()
        if role == "sub_admin":
            project_ids = Project.objects.filter(
                created_by=request.user
            ).values_list("id", flat=True)
            return qs.filter(
                pk=pk
            ).filter(
                db_models.Q(project_id__in=project_ids) | db_models.Q(user=request.user)
            ).first()
        return qs.filter(
            pk=pk
        ).filter(
            db_models.Q(user=request.user) | db_models.Q(assigned_to=request.user)
        ).first()

    def get(self, request, pk):
        report = self._get_report(request, pk)
        if not report:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = ReportDetailSerializer(report).data
        # Attach sections and logs
        data["sections"] = ReportSectionSerializer(report.sections.all(), many=True).data
        data["agent_logs"] = AgentExecutionSerializer(report.agent_logs.all(), many=True).data
        return Response(data)

    def delete(self, request, pk):
        report = self._get_report(request, pk)
        if not report:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        report.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReportStatusView(APIView):
    def get(self, request, pk):
        try:
            report = Report.objects.get(pk=pk, user=request.user)
        except Report.DoesNotExist:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ReportStatusSerializer(report).data)


class EvidenceUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        try:
            report = Report.objects.get(pk=pk, user=request.user)
        except Report.DoesNotExist:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        evidence = Evidence.objects.create(
            report=report,
            file=file,
            original_name=file.name,
            file_size=file.size,
            type=request.data.get("type", "other"),
        )
        return Response(
            {"id": evidence.id, "original_name": evidence.original_name, "type": evidence.type},
            status=status.HTTP_201_CREATED,
        )


class RevalidateView(APIView):
    def post(self, request, pk):
        try:
            report = Report.objects.get(pk=pk, user=request.user)
        except Report.DoesNotExist:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        from reports.services.validation import ValidationService
        ValidationService().run(report)
        return Response({"detail": "Revalidation complete."})


class RescoreView(APIView):
    def post(self, request, pk):
        try:
            report = Report.objects.get(pk=pk, user=request.user)
        except Report.DoesNotExist:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        from reports.services.scoring import ScoringService
        score = ScoringService().run(report)
        from reports.serializers import ComplianceScoreSerializer
        return Response(ComplianceScoreSerializer(score).data)


class ClauseListView(APIView):
    def get(self, request):
        standard_code = request.query_params.get("standard", "ISO27001")
        try:
            standard = Standard.objects.get(code=standard_code)
        except Standard.DoesNotExist:
            return Response({"error": "Standard not found."}, status=status.HTTP_404_NOT_FOUND)
        clauses = standard.clauses.prefetch_related("requirements").all()
        return Response(ClauseSerializer(clauses, many=True).data)


class AgentLogsView(APIView):
    def get(self, request, pk):
        try:
            report = Report.objects.get(pk=pk, user=request.user)
        except Report.DoesNotExist:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        logs = report.agent_logs.all()
        return Response(AgentExecutionSerializer(logs, many=True).data)


class ReportAssignView(APIView):
    """PATCH /api/reports/:id/assign/ — Sub Admin or Super Admin assigns a report to a user.
    The target user must be a member of the report's project (if the report has one)."""

    def patch(self, request, pk):
        role = get_role(request.user)
        if role not in ("super_admin", "sub_admin"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        # Sub Admin can only assign reports in projects they created
        if role == "sub_admin":
            project_ids = Project.objects.filter(
                created_by=request.user
            ).values_list("id", flat=True)
            try:
                report = Report.objects.get(
                    db_models.Q(pk=pk),
                    db_models.Q(user=request.user) | db_models.Q(project_id__in=project_ids),
                )
            except Report.DoesNotExist:
                return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            report = get_object_or_404(Report, pk=pk)

        assigned_to_id = request.data.get("assigned_to_id")
        if assigned_to_id is None:
            # Unassign
            report.assigned_to = None
            report.save(update_fields=["assigned_to"])
            return Response(ReportListSerializer(report).data)

        try:
            target_user = User.objects.get(pk=assigned_to_id)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_400_BAD_REQUEST)

        # If the report belongs to a project, the target user must be a project member
        if report.project_id:
            project = report.project
            if not project.assigned_members.filter(pk=target_user.pk).exists():
                return Response(
                    {"error": "User is not a member of this project. Add them to the project first."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        report.assigned_to = target_user
        report.save(update_fields=["assigned_to"])
        return Response(ReportListSerializer(report).data)


# ── Project Views ──────────────────────────────────────────────────────────────

class ProjectListCreateView(APIView):
    def get(self, request):
        role = get_role(request.user)
        if role == "super_admin":
            qs = Project.objects.all()
        elif role == "sub_admin":
            qs = Project.objects.filter(created_by=request.user)
        else:
            qs = Project.objects.filter(assigned_members=request.user)
        return Response(ProjectSerializer(qs.order_by("-created_at"), many=True).data)

    def post(self, request):
        if get_role(request.user) not in ("super_admin", "sub_admin"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        s = ProjectSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save(created_by=request.user)
        return Response(s.data, status=status.HTTP_201_CREATED)


class ProjectDetailView(APIView):
    def _get_project(self, request, pk):
        role = get_role(request.user)
        if role == "super_admin":
            return get_object_or_404(Project, pk=pk)
        if role == "sub_admin":
            return get_object_or_404(Project, pk=pk, created_by=request.user)
        return get_object_or_404(Project, pk=pk, assigned_members=request.user)

    def get(self, request, pk):
        return Response(ProjectSerializer(self._get_project(request, pk)).data)

    def patch(self, request, pk):
        project = self._get_project(request, pk)
        s = ProjectSerializer(project, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, pk):
        if get_role(request.user) not in ("super_admin", "sub_admin"):
            return Response(status=status.HTTP_403_FORBIDDEN)
        project = self._get_project(request, pk)
        project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectMembersView(APIView):
    def post(self, request, pk):
        if get_role(request.user) not in ("super_admin", "sub_admin"):
            return Response(status=status.HTTP_403_FORBIDDEN)
        project = get_object_or_404(Project, pk=pk)
        s = ProjectMemberSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = get_object_or_404(User, pk=s.validated_data["user_id"])
        if s.validated_data["action"] == "add":
            project.assigned_members.add(user)
        else:
            project.assigned_members.remove(user)
        return Response(ProjectSerializer(project).data)
