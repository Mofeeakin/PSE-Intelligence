"""
ISO 27001 Agent — per-clause-group LLM pipeline (Option A architecture).

Each wizard answer group (§4 Context, §5 Leadership, …, Annex A) gets its own
LLM call with:
  1. The auditor's actual wizard answers for that group (ground truth).
  2. Hybrid RAG context (BM25 + vector) scoped to the clause refs in that group.
  3. A structured JSON output schema — one finding per clause.

The executive summary is generated LAST, after all clause findings are assembled,
so it can accurately reflect what was found.
"""
import json
import logging
import time
from reports.models import Report
from agents.models import ReportSection, AgentExecution
from agents.providers import get_provider
from agents import prompts as P
from agents.rag.retriever import retrieve_hybrid, retrieve, format_context, retrieve_for_clause

logger = logging.getLogger(__name__)

JSON_PREFIX = "__JSON__:"


def _parse_findings_json(raw: str) -> tuple[list, str]:
    """
    Parse the LLM's JSON array response.
    Returns (parsed_list, tagged_content_string).
    If parsing fails, returns ([], raw_text) so the section still saves.
    """
    text = raw.strip()
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1 and end > start:
        candidate = text[start: end + 1]
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, list):
                return parsed, f"{JSON_PREFIX}{candidate}"
        except json.JSONDecodeError as exc:
            logger.warning("ISO27001Agent: JSON parse failed (%s) — storing raw text.", exc)
    return [], text


def _preliminary_score(wizard_answers: list) -> float:
    """Quick estimate of compliance score from wizard answers (before formal scoring)."""
    if not wizard_answers:
        return 0.0
    total = len(wizard_answers)
    points = sum(
        100 if a.get("answer") == "yes" else
        50  if a.get("answer") == "partial" else
        0
        for a in wizard_answers
    )
    return round(points / total, 1)


class ISO27001Agent:
    AGENT_TYPE = "ISO27001Agent"

    def run(self, report: Report):
        """Generate all report sections using per-clause-group LLM calls."""
        provider = get_provider()
        wizard_answers = list(getattr(report, "wizard_answers", []) or [])
        subs = list(report.submissions.select_related("requirement").all())
        service_type = getattr(report, "service_type", "audit_report") or "audit_report"
        system_prompt = P.get_system_prompt(service_type)
        prelim_score = _preliminary_score(wizard_answers)

        # Clear previous sections
        report.sections.all().delete()

        # ── Group wizard answers by their 'section' field ────────────────
        section_order: list[str] = []
        section_groups: dict[str, list] = {}
        for answer in wizard_answers:
            sec = answer.get("section") or "General"
            if sec not in section_groups:
                section_groups[sec] = []
                section_order.append(sec)
            section_groups[sec].append(answer)

        all_parsed_findings: list[dict] = []  # accumulated for executive summary

        # ── Scope section (order=0) ──────────────────────────────────────
        scope_context = self._scope_rag_context(report)
        scope_msg = P.scope_prompt(report, subs, report.evidence.count(), scope_context, service_type)
        scope_content = provider.generate([
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": scope_msg},
        ])
        ReportSection.objects.create(
            report=report,
            section_name="Scope",
            content=scope_content,
            agent_type=self.AGENT_TYPE,
            confidence_score=0.88,
            evidence_refs=[],
            order=0,
        )
        self._log_exec(report, "Scope", scope_msg, scope_content, 0)

        # ── Per-clause-group findings (order=2 … N+1) ───────────────────
        findings_order_start = 2
        for idx, section_name in enumerate(section_order):
            answers = section_groups[section_name]
            if not answers:
                continue

            clause_refs = [a.get("clause_ref") for a in answers if a.get("clause_ref")]
            obs_text = " ".join(
                a.get("comment", "") for a in answers if a.get("comment")
            )
            query = f"{section_name} ISO 27001 compliance findings: {obs_text[:400]}"

            # Hybrid RAG: ISO 27001 primary + ISO 27002 supplement
            rag_chunks = retrieve_hybrid(
                query, clause_refs=clause_refs, k=5, standard_ref="ISO 27001:2022"
            )
            if len(rag_chunks) < 3:
                extra = retrieve_hybrid(
                    query, clause_refs=clause_refs, k=3, standard_ref="ISO 27002:2022"
                )
                rag_chunks += extra
            # Also pull exact clause matches for depth
            exact_chunks = retrieve_for_clause(clause_refs, k=2) if clause_refs else []
            all_rag = {c.chunk_id: c for c in rag_chunks + exact_chunks}
            rag_context = format_context(list(all_rag.values()), max_chars=3000)

            user_prompt = P.clause_findings_prompt(
                section_name, answers, rag_context, service_type
            )

            start_t = time.time()
            raw_content = provider.generate([
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ])
            elapsed_ms = int((time.time() - start_t) * 1000)

            parsed, tagged_content = _parse_findings_json(raw_content)
            all_parsed_findings.extend(parsed)

            ReportSection.objects.create(
                report=report,
                section_name=section_name,
                content=tagged_content,
                agent_type=self.AGENT_TYPE,
                confidence_score=0.92,
                evidence_refs=[],
                order=findings_order_start + idx,
            )
            AgentExecution.objects.create(
                report=report,
                agent_type=self.AGENT_TYPE,
                stage=f"Generate: {section_name}",
                message=(
                    f"Generated {len(parsed)} finding(s) for {section_name} "
                    f"({len(answers)} clauses, {len(rag_chunks)} RAG chunks)."
                ),
                input_payload={
                    "section": section_name,
                    "clause_refs": clause_refs,
                    "rag_chars": len(rag_context),
                },
                prompt_used=user_prompt,
                raw_output=raw_content,
                execution_time_ms=elapsed_ms,
                confidence_score=0.92,
                prompt_version=P.PROMPT_VERSION,
            )

        # ── Executive Summary (order=1) — generated after all findings ──
        exec_prompt = P.executive_summary_prompt(
            report, all_parsed_findings, prelim_score, service_type
        )
        exec_content = provider.generate([
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": exec_prompt},
        ])
        ReportSection.objects.create(
            report=report,
            section_name="Executive Summary",
            content=exec_content,
            agent_type=self.AGENT_TYPE,
            confidence_score=0.90,
            evidence_refs=[],
            order=1,
        )
        self._log_exec(report, "Executive Summary", exec_prompt, exec_content, 0)

        # ── Conclusion placeholder (overwritten by pipeline Stage 7) ────
        # Store order and parsed findings on the report object for the pipeline.
        conclusion_order = findings_order_start + len(section_order)
        report._conclusion_order = conclusion_order
        report._all_parsed_findings = all_parsed_findings

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _scope_rag_context(self, report: Report) -> str:
        query = (
            f"ISMS scope definition {report.organisation} "
            f"ISO 27001 clause 4.3 applicability boundary exclusions {report.scope or ''}"
        )
        chunks = retrieve_hybrid(query, clause_refs=["4", "4.1", "4.2", "4.3"], k=4, standard_ref="ISO 27001:2022")
        return format_context(chunks, max_chars=2000)

    @staticmethod
    def _log_exec(report: Report, section: str, prompt: str, output: str, elapsed_ms: int):
        AgentExecution.objects.create(
            report=report,
            agent_type=ISO27001Agent.AGENT_TYPE,
            stage=f"Generate: {section}",
            message=f"ISO27001Agent generated '{section}' section.",
            input_payload={"section": section},
            prompt_used=prompt,
            raw_output=output,
            execution_time_ms=elapsed_ms,
            confidence_score=0.88,
            prompt_version=P.PROMPT_VERSION,
        )
