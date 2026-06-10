from django.db import models
from pgvector.django import VectorField
from reports.models import Report


class RAGDocument(models.Model):
    """Tracks a source document that has been ingested into the vector store."""

    DOC_TYPE_STANDARD = "standard"
    DOC_TYPE_AUDIT = "audit_report"
    DOC_TYPE_GAP = "gap_assessment"
    DOC_TYPE_TEMPLATE = "template"
    DOC_TYPE_SOA = "soa"
    DOC_TYPE_CHOICES = [
        (DOC_TYPE_STANDARD, "ISO/IEC Standard"),
        (DOC_TYPE_AUDIT, "Audit Report"),
        (DOC_TYPE_GAP, "Gap Assessment Report"),
        (DOC_TYPE_TEMPLATE, "Template"),
        (DOC_TYPE_SOA, "Statement of Applicability"),
    ]

    name = models.CharField(max_length=255)
    doc_type = models.CharField(max_length=30, choices=DOC_TYPE_CHOICES, default=DOC_TYPE_STANDARD)
    # e.g. "ISO 27001:2022", "ISO 27002:2022"
    standard_ref = models.CharField(max_length=100, blank=True)
    file_path = models.CharField(max_length=500)
    total_chunks = models.PositiveIntegerField(default=0)
    total_pages = models.PositiveIntegerField(default=0)
    ingested_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.doc_type})"


class RAGChunk(models.Model):
    """
    A single text chunk from a source document, stored with its 384-dim embedding.

    Clause metadata follows ISO numbering conventions:
      - ISO 27001: clause_ref = "4.1", "6.1.2", "Annex A"
      - ISO 27002: clause_ref = "5.15", "7.2", etc.
    Theme follows 27002 section labels or 27001 clause groupings.
    """

    document = models.ForeignKey(RAGDocument, on_delete=models.CASCADE, related_name="chunks")
    chunk_index = models.PositiveIntegerField()

    # Raw text content of this chunk
    content = models.TextField()

    # Structured metadata for filtering
    clause_ref = models.CharField(max_length=30, blank=True, db_index=True)
    section_title = models.CharField(max_length=255, blank=True)
    # Theme values: Organizational | People | Physical | Technology |
    #               Context | Leadership | Planning | Support | Operation | Performance | Improvement
    theme = models.CharField(max_length=50, blank=True, db_index=True)
    page_start = models.PositiveSmallIntegerField(default=0)
    page_end = models.PositiveSmallIntegerField(default=0)

    # 384-dim embedding from all-MiniLM-L6-v2
    embedding = VectorField(dimensions=384, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["document", "chunk_index"]
        indexes = [
            models.Index(fields=["document", "chunk_index"]),
            models.Index(fields=["theme"]),
            models.Index(fields=["clause_ref"]),
        ]

    def __str__(self):
        return f"{self.document.name} § {self.clause_ref} [{self.chunk_index}]"


class ReportSection(models.Model):
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="sections")
    section_name = models.CharField(max_length=100)
    content = models.TextField()
    agent_type = models.CharField(max_length=50, default="ISO27001Agent")
    confidence_score = models.FloatField(default=0.0)
    evidence_refs = models.JSONField(default=list)
    order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.report} / {self.section_name}"


class AgentExecution(models.Model):
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="agent_logs")
    agent_type = models.CharField(max_length=50)
    stage = models.CharField(max_length=100, blank=True)
    message = models.TextField(blank=True)
    input_payload = models.JSONField(default=dict)
    prompt_used = models.TextField(blank=True)
    raw_output = models.TextField(blank=True)
    execution_time_ms = models.PositiveIntegerField(default=0)
    confidence_score = models.FloatField(default=0.0)
    prompt_version = models.CharField(max_length=20, default="v1.0")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.agent_type} @ {self.report} — {self.created_at}"
