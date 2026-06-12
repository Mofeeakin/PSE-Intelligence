from rest_framework import serializers
from .models import Standard, Clause, Requirement, Report, Submission, Evidence, Gap, ValidationResult, ComplianceScore, Project


class StandardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Standard
        fields = ("id", "code", "name")


class RequirementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Requirement
        fields = ("id", "code", "text", "action", "expected_evidence", "tag", "order")


class ClauseSerializer(serializers.ModelSerializer):
    requirements = RequirementSerializer(many=True, read_only=True)

    class Meta:
        model = Clause
        fields = ("id", "code", "title", "description", "order", "requirements")


class EvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Evidence
        fields = ("id", "original_name", "file_size", "type", "uploaded_at")
        read_only_fields = ("id", "uploaded_at")


class SubmissionSerializer(serializers.ModelSerializer):
    requirement_code = serializers.CharField(source="requirement.code", read_only=True)
    requirement_text = serializers.CharField(source="requirement.text", read_only=True)

    class Meta:
        model = Submission
        fields = ("id", "requirement", "requirement_code", "requirement_text", "compliance_status", "comment", "updated_at")
        read_only_fields = ("id", "updated_at")


class GapSerializer(serializers.ModelSerializer):
    requirement_code = serializers.CharField(source="requirement.code", read_only=True)

    class Meta:
        model = Gap
        fields = ("id", "requirement", "requirement_code", "issue", "severity", "created_at")
        read_only_fields = ("id", "created_at")


class ValidationResultSerializer(serializers.ModelSerializer):
    gaps = GapSerializer(source="report.gaps", many=True, read_only=True)

    class Meta:
        model = ValidationResult
        fields = ("id", "is_valid", "created_at", "gaps")
        read_only_fields = ("id", "created_at")


class ComplianceScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComplianceScore
        fields = ("id", "section_score", "evidence_score", "consistency_score", "total_score", "status", "created_at")
        read_only_fields = ("id", "created_at")


class ReportListSerializer(serializers.ModelSerializer):
    standard_code = serializers.CharField(source="standard.code", read_only=True)
    compliance_score = ComplianceScoreSerializer(read_only=True)

    class Meta:
        model = Report
        fields = (
            "id", "title", "organisation", "standard_code", "service_type", "status",
            "current_stage", "progress_pct", "created_at", "updated_at", "compliance_score",
        )
        read_only_fields = fields


class ReportDetailSerializer(serializers.ModelSerializer):
    standard_code = serializers.CharField(source="standard.code", read_only=True)
    evidence = EvidenceSerializer(many=True, read_only=True)
    submissions = SubmissionSerializer(many=True, read_only=True)
    gaps = GapSerializer(many=True, read_only=True)
    validation_result = ValidationResultSerializer(read_only=True)
    compliance_score = ComplianceScoreSerializer(read_only=True)

    class Meta:
        model = Report
        fields = (
            "id", "title", "organisation", "department", "standard_code",
            "scope", "service_type", "status", "current_stage", "progress_pct", "error_message",
            "created_at", "updated_at",
            "evidence", "submissions", "gaps", "validation_result", "compliance_score",
        )
        read_only_fields = fields


class ReportCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=300)
    organisation = serializers.CharField(max_length=200)
    department = serializers.CharField(max_length=200, required=False, default="")
    standard_code = serializers.CharField(max_length=50)
    scope = serializers.CharField(required=False, default="")
    service_type = serializers.ChoiceField(
        choices=["audit_report", "gap_assessment"],
        required=False,
        default="audit_report",
    )
    project_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    assigned_to_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    submissions = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    wizard_answers = serializers.ListField(child=serializers.DictField(), required=False, default=list)


class ReportStatusSerializer(serializers.ModelSerializer):
    latest_log = serializers.SerializerMethodField()

    class Meta:
        model = Report
        fields = ("id", "status", "current_stage", "progress_pct", "error_message", "latest_log")

    def get_latest_log(self, obj):
        from agents.models import AgentExecution
        from agents.serializers import AgentExecutionSerializer
        log = obj.agent_logs.last()
        if log:
            return AgentExecutionSerializer(log).data
        return None


class ProjectSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    member_count    = serializers.SerializerMethodField()
    report_count    = serializers.SerializerMethodField()
    standard_name   = serializers.SerializerMethodField()

    class Meta:
        model  = Project
        fields = [
            "id", "name", "client_name", "client_details", "description",
            "status", "standard", "standard_name", "report_types",
            "created_by", "created_by_name",
            "member_count", "report_count", "created_at", "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]

    def get_created_by_name(self, obj):
        full = obj.created_by.get_full_name()
        return full if full.strip() else obj.created_by.username

    def get_member_count(self, obj):
        return obj.assigned_members.count()

    def get_report_count(self, obj):
        return obj.reports.count()

    def get_standard_name(self, obj):
        return obj.standard.name if obj.standard else None


class ProjectMemberSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    action  = serializers.ChoiceField(choices=["add", "remove"])
