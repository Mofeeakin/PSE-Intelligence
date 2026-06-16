"""
ReportPipeline — 6-stage processing pipeline run in a background thread.

Stages:
  1. Router        — selects the correct agent
  2. RAG           — placeholder (logs context retrieval)
  3. ISO Agent     — generates all report sections via LLM
  4. Conflict Check — single-agent, logs "no conflicts"
  5. Validation    — ValidationService (rule-based gap detection)
  6. Scoring       — ScoringService (weighted formula)
"""
import logging
from reports.models import Report, Submission, Requirement
from reports.services.validation import ValidationService
from reports.services.scoring import ScoringService
from agents.models import AgentExecution, ReportSection
from agents.iso27001_agent import ISO27001Agent
from agents.rag.retriever import retrieve, format_context
from agents import prompts as P
from agents.providers import get_provider

logger = logging.getLogger(__name__)

# Tag prefix for the gap-assessment "Summary of Findings" structured JSON
# content, mirroring the JSON_PREFIX convention already used by
# iso27001_agent.py / docx_builder.py for per-clause findings.
SUMMARY_PREFIX = "__SUMMARY__:"

STAGES = [
    ("Router", "Routing report to specialised agents based on standard type."),
    ("RAG", "Retrieving relevant knowledge context and evidence references."),
    ("ISO27001Agent", "ISO 27001 Agent generating compliance report sections."),
    ("ConflictChecker", "Checking for inter-agent conflicts. (Single-agent: none detected.)"),
    ("Validator", "Running rule-based validation and gap detection."),
    ("Scorer", "Computing weighted compliance score."),
]

STAGE_PROGRESS = [15, 30, 65, 72, 85, 100]


def _log(report: Report, agent_type: str, stage: str, message: str, **kwargs):
    AgentExecution.objects.create(
        report=report,
        agent_type=agent_type,
        stage=stage,
        message=message,
        **kwargs,
    )


class ReportPipeline:
    def run(self, report_id: int):
        try:
            report = Report.objects.select_related("standard", "compliance_score").get(pk=report_id)
        except Report.DoesNotExist:
            logger.error("ReportPipeline: Report %s not found.", report_id)
            return

        try:
            self._run_stages(report)
        except Exception as exc:
            logger.exception("ReportPipeline failed for report %s: %s", report_id, exc)
            report.status = Report.STATUS_FAILED
            report.error_message = str(exc)
            report.current_stage = "Failed"
            report.save(update_fields=["status", "error_message", "current_stage", "updated_at"])

    def _run_stages(self, report: Report):
        # ── Stage 0: Data Hydration ────────────────────────────────────────
        self._set_stage(report, "Data Hydration", 8, Report.STATUS_PROCESSING)
        hydrated = self._hydrate_submissions_from_wizard(report)
        _log(
            report,
            "Hydrator",
            "Data Hydration",
            f"Hydrated {hydrated} wizard answer(s) into Submission records.",
        )

        # ── Stage 1: Router ────────────────────────────────────────────────
        self._set_stage(report, "Agent Routing", STAGE_PROGRESS[0], Report.STATUS_PROCESSING)
        _log(
            report,
            "Router",
            "Agent Routing",
            f"Standard '{report.standard.code}' — routing to ISO27001Agent.",
        )

        # ── Stage 2: RAG retrieval ─────────────────────────────────────────
        self._set_stage(report, "RAG Retrieval", STAGE_PROGRESS[1])
        evidence_count = report.evidence.count()
        rag_query = self._build_rag_query(report)
        rag_chunks = retrieve(rag_query, k=8, standard_ref="ISO 27001:2022")
        if len(rag_chunks) < 4:
            rag_chunks += retrieve(rag_query, k=6, standard_ref="ISO 27002:2022")
        rag_context = format_context(rag_chunks, max_chars=4200)

        report.rag_context = rag_context
        report.save(update_fields=["rag_context", "updated_at"])

        _log(
            report,
            "RAG",
            "RAG Retrieval",
            f"Retrieved {len(rag_chunks)} RAG chunk(s) + {evidence_count} evidence artifact(s).",
            input_payload={"query": rag_query},
            raw_output=rag_context[:3000],
            confidence_score=0.86,
            prompt_version="rag-v1",
        )

        # ── Stage 3: ISO 27001 Agent ───────────────────────────────────────
        self._set_stage(report, "ISO Agent Processing", STAGE_PROGRESS[2])
        agent = ISO27001Agent()
        agent.run(report)
        _log(
            report,
            "ISO27001Agent",
            "ISO Agent Processing",
            "ISO 27001 Agent completed section generation.",
        )

        # ── Stage 4: Conflict Check ────────────────────────────────────────
        self._set_stage(report, "Conflict Detection", STAGE_PROGRESS[3])
        _log(
            report,
            "ConflictChecker",
            "Conflict Detection",
            "Single-agent mode: no inter-agent conflicts detected.",
        )

        # ── Stage 5: Validation ────────────────────────────────────────────
        self._set_stage(report, "Validation", STAGE_PROGRESS[4], Report.STATUS_VALIDATION)
        ValidationService().run(report)
        _log(
            report,
            "Validator",
            "Validation",
            f"Validation complete. Gaps found: {report.gaps.count()}.",
        )

        # ── Stage 6: Scoring ───────────────────────────────────────────────
        self._set_stage(report, "Scoring", STAGE_PROGRESS[5], Report.STATUS_SCORED)
        score = ScoringService().run(report)
        _log(
            report,
            "Scorer",
            "Scoring",
            f"Compliance score: {score.total_score:.1f}% — {score.status}.",
        )

        # ── Stage 7: Conclusion (generated after scoring) ─────────────────
        self._set_stage(report, "Generating Conclusion", 95, Report.STATUS_SCORED)
        self._generate_conclusion(report, score)

        # ── Done ───────────────────────────────────────────────────────────
        report.status = Report.STATUS_COMPLETED
        report.current_stage = "Completed"
        report.progress_pct = 100
        report.save(update_fields=["status", "current_stage", "progress_pct", "updated_at"])

    @staticmethod
    def _generate_conclusion(report: Report, score):
        """
        Generate the closing section using the REAL compliance score.
        Called AFTER ScoringService so score.total_score is accurate.
        Reuses all_parsed_findings stashed on the report object by ISO27001Agent.

        Audit reports: unchanged — a single prose "Conclusion" section.
        Gap assessments: a structured "Summary of Findings" section (Sterling
        template equivalent — Overall Outcome / Key Strengths / Main Gaps /
        Conclusion), replacing the audit-style single-paragraph Conclusion.
        """
        all_parsed_findings = getattr(report, "_all_parsed_findings", [])
        conclusion_order    = getattr(report, "_conclusion_order", 13)
        service_type        = getattr(report, "service_type", "audit_report") or "audit_report"
        system_prompt       = P.get_system_prompt(service_type)
        provider            = get_provider()

        if service_type == "gap_assessment":
            summary_prompt  = P.summary_of_findings_prompt(report, score, all_parsed_findings)
            raw_content     = provider.generate([
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": summary_prompt},
            ])

            # Best-effort JSON validation; store raw text untagged if it fails
            # so docx_builder's fallback prose renderer still has something
            # sensible to show rather than crashing the export.
            text = raw_content.strip()
            start, end = text.find("{"), text.rfind("}")
            if start != -1 and end != -1 and end > start:
                tagged_content = f"{SUMMARY_PREFIX}{text[start:end + 1]}"
            else:
                tagged_content = text

            report.sections.filter(section_name="Summary of Findings").delete()
            report.sections.filter(section_name="Conclusion").delete()

            ReportSection.objects.create(
                report=report,
                section_name="Summary of Findings",
                content=tagged_content,
                agent_type="ISO27001Agent",
                confidence_score=0.92,
                evidence_refs=[],
                order=conclusion_order,
            )
            _log(
                report,
                "ISO27001Agent",
                "Summary of Findings",
                f"Summary of Findings generated post-scoring (score={score.total_score:.1f}%, status={score.status}).",
            )
            return

        conc_prompt  = P.conclusion_prompt(report, score, all_parsed_findings, service_type)
        conc_content = provider.generate([
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": conc_prompt},
        ])

        # Delete any stale Conclusion section the agent may have left
        report.sections.filter(section_name="Conclusion").delete()

        ReportSection.objects.create(
            report=report,
            section_name="Conclusion",
            content=conc_content,
            agent_type="ISO27001Agent",
            confidence_score=0.92,
            evidence_refs=[],
            order=conclusion_order,
        )
        _log(
            report,
            "ISO27001Agent",
            "Conclusion",
            f"Conclusion generated post-scoring (score={score.total_score:.1f}%, status={score.status}).",
        )

    @staticmethod
    def _hydrate_submissions_from_wizard(report: Report) -> int:
        """
        Convert wizard_answers JSON into Submission rows so that ValidationService
        and the ISO Agent can work with real assessment data.

        Mapping:
          answer "yes"     → compliance_status = compliant
          answer "partial" → compliance_status = partial
          answer "no"      → compliance_status = non_compliant
        """
        wizard_answers = getattr(report, "wizard_answers", []) or []
        if not wizard_answers:
            return 0

        # Clear any stale submissions before re-hydrating
        report.submissions.all().delete()

        status_map = {
            "yes":     Submission.COMPLIANCE_COMPLIANT,
            "partial": Submission.COMPLIANCE_PARTIAL,
            "no":      Submission.COMPLIANCE_NON_COMPLIANT,
        }

        created = 0
        for item in wizard_answers:
            clause_ref = (item.get("clause_ref") or "").strip()
            if not clause_ref:
                continue

            # Look up Requirement by code (exact, then case-insensitive)
            req = Requirement.objects.filter(code=clause_ref).first()
            if req is None:
                req = Requirement.objects.filter(code__iexact=clause_ref).first()
            if req is None:
                logger.debug("Hydration: no Requirement found for clause_ref=%s — skipping.", clause_ref)
                continue

            answer_str = str(item.get("answer", "no")).lower().strip()
            comp_status = status_map.get(answer_str, Submission.COMPLIANCE_NON_COMPLIANT)

            Submission.objects.create(
                report=report,
                requirement=req,
                compliance_status=comp_status,
                comment=item.get("comment", ""),
            )
            created += 1

        return created

    @staticmethod
    def _build_rag_query(report: Report) -> str:
        """Build a retrieval query from the report context, wizard answers, and observed gaps."""
        gaps = list(report.gaps.select_related("requirement").all()[:20])
        gap_text = "; ".join(
            f"{g.requirement.code}: {g.issue}" for g in gaps
        ) or "No explicit gaps provided yet"

        # Summarise wizard answers: include 'no' answers as control gaps
        wizard_answers = getattr(report, "wizard_answers", []) or []
        wizard_summary = ""
        if wizard_answers:
            no_answers = [
                f"{a.get('clause_ref', '?')}: {a.get('question', '')[:80]}"
                for a in wizard_answers
                if a.get("answer") == "no"
            ]
            if no_answers:
                wizard_summary = " User-reported control weaknesses: " + "; ".join(no_answers[:8]) + "."

        return (
            f"ISO 27001 compliance audit guidance for organisation {report.organisation}. "
            f"Department: {report.department or 'General'}. "
            f"Scope statement: {report.scope or 'Not specified'}. "
            f"Known gaps: {gap_text}.{wizard_summary} "
            "Return clauses and controls relevant to scope definition, risk assessment, "
            "findings, non-conformities, remediation recommendations, and audit conclusion."
        )

    @staticmethod
    def _set_stage(report: Report, stage: str, progress: int, status: str = None):
        update_fields = ["current_stage", "progress_pct", "updated_at"]
        report.current_stage = stage
        report.progress_pct = progress
        if status:
            report.status = status
            update_fields.append("status")
        report.save(update_fields=update_fields)
