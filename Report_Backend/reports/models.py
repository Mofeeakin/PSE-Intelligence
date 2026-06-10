from django.db import models
from django.contrib.auth.models import User


class Standard(models.Model):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)

    def __str__(self):
        return self.code


class Clause(models.Model):
    standard = models.ForeignKey(Standard, on_delete=models.CASCADE, related_name="clauses")
    code = models.CharField(max_length=20)
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]
        unique_together = ("standard", "code")

    def __str__(self):
        return f"{self.code} — {self.title}"


class Requirement(models.Model):
    TAG_MANDATORY = "mandatory"
    TAG_RECOMMENDED = "recommended"
    TAG_OPTIONAL = "optional"
    TAG_CHOICES = [
        (TAG_MANDATORY, "Mandatory"),
        (TAG_RECOMMENDED, "Recommended"),
        (TAG_OPTIONAL, "Optional"),
    ]

    clause = models.ForeignKey(Clause, on_delete=models.CASCADE, related_name="requirements")
    code = models.CharField(max_length=30)
    text = models.TextField()
    action = models.TextField(blank=True)
    expected_evidence = models.TextField(blank=True)
    tag = models.CharField(max_length=20, choices=TAG_CHOICES, default=TAG_MANDATORY)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]
        unique_together = ("clause", "code")

    def __str__(self):
        return f"{self.code} — {self.text[:60]}"


class Report(models.Model):
    STATUS_DRAFT = "Draft"
    STATUS_PROCESSING = "Processing"
    STATUS_VALIDATION = "Validation"
    STATUS_SCORED = "Scored"
    STATUS_COMPLETED = "Completed"
    STATUS_FAILED = "Failed"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_PROCESSING, "Processing"),
        (STATUS_VALIDATION, "Validation"),
        (STATUS_SCORED, "Scored"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_FAILED, "Failed"),
    ]

    SERVICE_TYPE_AUDIT = "audit_report"
    SERVICE_TYPE_GAP = "gap_assessment"
    SERVICE_TYPE_CHOICES = [
        (SERVICE_TYPE_AUDIT, "Internal Audit Report"),
        (SERVICE_TYPE_GAP, "Gap Assessment Report"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reports")
    project = models.ForeignKey(
        "Project", on_delete=models.SET_NULL, null=True, blank=True, related_name="reports"
    )
    assigned_to = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_reports"
    )
    title = models.CharField(max_length=300)
    organisation = models.CharField(max_length=200)
    department = models.CharField(max_length=200, blank=True)
    standard = models.ForeignKey(Standard, on_delete=models.PROTECT, related_name="reports")
    scope = models.TextField(blank=True)
    service_type = models.CharField(
        max_length=20,
        choices=SERVICE_TYPE_CHOICES,
        default=SERVICE_TYPE_AUDIT,
    )
    wizard_answers = models.JSONField(default=list, blank=True)  # structured clause-driven Q&A
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    current_stage = models.CharField(max_length=100, blank=True)
    progress_pct = models.PositiveSmallIntegerField(default=0)
    error_message = models.TextField(blank=True)
    # Cached retrieval context used by the ISO agent for section generation.
    rag_context = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.status})"


class Submission(models.Model):
    STATUS_NOT_STARTED = "not_started"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_COMPLETE = "complete"

    COMPLIANCE_COMPLIANT = "compliant"
    COMPLIANCE_PARTIAL = "partial"
    COMPLIANCE_NON_COMPLIANT = "non_compliant"
    COMPLIANCE_CHOICES = [
        (COMPLIANCE_COMPLIANT, "Compliant"),
        (COMPLIANCE_PARTIAL, "Partial"),
        (COMPLIANCE_NON_COMPLIANT, "Non-Compliant"),
    ]

    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="submissions")
    requirement = models.ForeignKey(Requirement, on_delete=models.PROTECT)
    compliance_status = models.CharField(
        max_length=20, choices=COMPLIANCE_CHOICES, default=COMPLIANCE_NON_COMPLIANT
    )
    comment = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("report", "requirement")

    def __str__(self):
        return f"{self.report} / {self.requirement.code} = {self.compliance_status}"


class Evidence(models.Model):
    TYPE_POLICY = "policy"
    TYPE_LOG = "log"
    TYPE_CERTIFICATE = "certificate"
    TYPE_REPORT = "report"
    TYPE_OTHER = "other"
    TYPE_CHOICES = [
        (TYPE_POLICY, "Policy"),
        (TYPE_LOG, "Log"),
        (TYPE_CERTIFICATE, "Certificate"),
        (TYPE_REPORT, "Report"),
        (TYPE_OTHER, "Other"),
    ]

    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="evidence")
    file = models.FileField(upload_to="evidence/%Y/%m/")
    original_name = models.CharField(max_length=300)
    file_size = models.PositiveBigIntegerField(default=0)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_OTHER)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.original_name} ({self.type})"


class Gap(models.Model):
    SEVERITY_LOW = "low"
    SEVERITY_MEDIUM = "medium"
    SEVERITY_HIGH = "high"
    SEVERITY_CHOICES = [
        (SEVERITY_LOW, "Low"),
        (SEVERITY_MEDIUM, "Medium"),
        (SEVERITY_HIGH, "High"),
    ]

    # ── Audit report ratings ──────────────────────────────────────────────
    RATING_CONFORMITY = "conformity"
    RATING_OBSERVATION = "observation"
    RATING_MINOR_NC = "minor_nc"
    RATING_MAJOR_NC = "major_nc"
    # ── Gap assessment (CIRC) ratings ─────────────────────────────────────
    RATING_FULLY_IMPL = "fully_implemented"
    RATING_PARTIAL_IMPL = "partially_implemented"
    RATING_NOT_IMPL = "not_implemented"
    RATING_NOT_APPLICABLE = "not_applicable"

    RATING_CHOICES = [
        (RATING_CONFORMITY, "Conformity"),
        (RATING_OBSERVATION, "Observation"),
        (RATING_MINOR_NC, "Minor Non-Conformity"),
        (RATING_MAJOR_NC, "Major Non-Conformity"),
        (RATING_FULLY_IMPL, "Fully Implemented"),
        (RATING_PARTIAL_IMPL, "Partially Implemented"),
        (RATING_NOT_IMPL, "Not Implemented"),
        (RATING_NOT_APPLICABLE, "Not Applicable"),
    ]

    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="gaps")
    requirement = models.ForeignKey(Requirement, on_delete=models.PROTECT)
    issue = models.TextField()
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default=SEVERITY_MEDIUM)
    rating = models.CharField(max_length=30, choices=RATING_CHOICES, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.severity.upper()}: {self.issue[:80]}"


class ValidationResult(models.Model):
    report = models.OneToOneField(Report, on_delete=models.CASCADE, related_name="validation_result")
    is_valid = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Validation for {self.report} — {'PASS' if self.is_valid else 'FAIL'}"


class ComplianceScore(models.Model):
    STATUS_APPROVED = "APPROVED"
    STATUS_APPROVED_WITH_GAPS = "APPROVED_WITH_GAPS"
    STATUS_FAILED = "FAILED"
    STATUS_CHOICES = [
        (STATUS_APPROVED, "Approved"),
        (STATUS_APPROVED_WITH_GAPS, "Approved With Gaps"),
        (STATUS_FAILED, "Failed"),
    ]

    report = models.OneToOneField(Report, on_delete=models.CASCADE, related_name="compliance_score")
    section_score = models.FloatField(default=0)
    evidence_score = models.FloatField(default=0)
    consistency_score = models.FloatField(default=0)
    total_score = models.FloatField(default=0)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_FAILED)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.report} — {self.total_score:.1f}% ({self.status})"


class Project(models.Model):
    STATUS_ACTIVE    = "active"
    STATUS_COMPLETED = "completed"
    STATUS_ARCHIVED  = "archived"
    STATUS_CHOICES   = [
        (STATUS_ACTIVE,    "Active"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_ARCHIVED,  "Archived"),
    ]

    name             = models.CharField(max_length=300)
    client_name      = models.CharField(max_length=200)
    client_details   = models.TextField(blank=True)
    description      = models.TextField(blank=True)
    standard         = models.ForeignKey(Standard, on_delete=models.SET_NULL, null=True, blank=True)
    created_by       = models.ForeignKey(User, on_delete=models.CASCADE, related_name="created_projects")
    assigned_members = models.ManyToManyField(User, related_name="member_projects", blank=True)
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.client_name})"
