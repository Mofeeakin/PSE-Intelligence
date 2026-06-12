import threading
from django.db import models as db_models
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Report, Standard, Evidence, Submission, Requirement, Project
from accounts.models import Notification
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

        generate_now = data.get("generate", True)
        report = Report.objects.create(
            user=request.user,
            title=data["title"],
            organisation=data["organisation"],
            department=data.get("department", ""),
            standard=standard,
            scope=data.get("scope", ""),
            service_type=data.get("service_type", Report.SERVICE_TYPE_AUDIT),
            wizard_answers=data.get("wizard_answers", []),
            status=Report.STATUS_PROCESSING if generate_now else Report.STATUS_DRAFT,
            current_stage="Queued" if generate_now else "",
            progress_pct=0,
            project_id=data.get("project_id"),
            assigned_to_id=data.get("assigned_to_id"),
        )

        # Notify the assigned user
        if report.assigned_to and report.assigned_to != request.user:
            Notification.objects.create(
                user=report.assigned_to,
                report=report,
                message=f"You have been assigned a new report: \"{report.title}\"",
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

        if generate_now:
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

    def patch(self, request, pk):
        """Update draft report fields without triggering generation."""
        report = self._get_report(request, pk)
        if not report:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        allowed = {"title", "organisation", "department", "scope", "wizard_answers", "service_type", "project_id", "assigned_to_id"}
        for field in allowed & set(request.data.keys()):
            setattr(report, field, request.data[field])
        report.save()
        return Response(ReportListSerializer(report).data)

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


class StandardListView(APIView):
    """Return all available standards."""

    def get(self, request):
        from .serializers import StandardSerializer
        standards = Standard.objects.all().order_by("name")
        return Response(StandardSerializer(standards, many=True).data)


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


# ── Report Workflow Views ──────────────────────────────────────────────────────

class ReportGenerateView(APIView):
    """Trigger AI generation for a Draft report."""

    def post(self, request, pk):
        report = get_object_or_404(Report, pk=pk)
        role = get_role(request.user)
        if report.user != request.user and report.assigned_to != request.user and role not in ("super_admin", "sub_admin"):
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if report.status not in (Report.STATUS_DRAFT, Report.STATUS_FAILED):
            return Response({"detail": f"Cannot generate from status '{report.status}'."}, status=status.HTTP_400_BAD_REQUEST)
        report.status = Report.STATUS_PROCESSING
        report.current_stage = "Queued"
        report.progress_pct = 0
        report.error_message = ""
        report.save()
        pipeline = ReportPipeline()
        thread = threading.Thread(target=pipeline.run, args=[report.id], daemon=True)
        thread.start()
        return Response({"detail": "Generation started."})


class ReportSubmitReviewView(APIView):
    """Staff submits a completed report for admin review."""

    def post(self, request, pk):
        report = get_object_or_404(Report, pk=pk)
        if report.user != request.user and report.assigned_to != request.user:
            return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if report.status != Report.STATUS_COMPLETED:
            return Response({"detail": "Only Completed reports can be submitted for review."}, status=status.HTTP_400_BAD_REQUEST)
        report.status = Report.STATUS_PENDING_REVIEW
        report.save()
        # Notify all super admins and the project creator (sub_admin)
        from accounts.models import UserProfile
        admins = User.objects.filter(profile__role__in=("super_admin", "sub_admin")).distinct()
        for admin_user in admins:
            Notification.objects.create(
                user=admin_user,
                report=report,
                message=f"Report \"{report.title}\" has been submitted for review by {request.user.username}.",
            )
        return Response({"detail": "Report submitted for review."})


class ReportApproveView(APIView):
    """Super Admin or Sub Admin approves a pending-review report."""

    def post(self, request, pk):
        if get_role(request.user) not in ("super_admin", "sub_admin"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        report = get_object_or_404(Report, pk=pk)
        if report.status != Report.STATUS_PENDING_REVIEW:
            return Response({"detail": "Only Pending Review reports can be approved."}, status=status.HTTP_400_BAD_REQUEST)
        report.status = Report.STATUS_APPROVED
        report.save()
        Notification.objects.create(
            user=report.user,
            report=report,
            message=f"Your report \"{report.title}\" has been approved and is ready for export.",
        )
        if report.assigned_to and report.assigned_to != report.user:
            Notification.objects.create(
                user=report.assigned_to,
                report=report,
                message=f"Report \"{report.title}\" has been approved and is ready for export.",
            )
        return Response({"detail": "Report approved."})


class ReportAssignView(APIView):
    """Sub Admin or Super Admin assigns a report to a staff member."""

    def post(self, request, pk):
        if get_role(request.user) not in ("super_admin", "sub_admin"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        report = get_object_or_404(Report, pk=pk)
        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        assignee = get_object_or_404(User, pk=user_id)
        report.assigned_to = assignee
        report.save()
        Notification.objects.create(
            user=assignee,
            report=report,
            message=f"You have been assigned to report: \"{report.title}\"",
        )
        return Response(ReportListSerializer(report).data)
