"""
Grounding-first prompt templates for ISO 27001 report generation.
Version: v3.0

Architecture:
  - The LLM is a professional technical WRITER, not a free analyst.
  - Wizard answers are FACTS — LLM must not contradict or override them.
  - LLM expands one-liner observations using ISO reference context from RAG.
  - clause_findings_prompt() returns structured JSON (one entry per clause).
  - executive_summary_prompt() and conclusion_prompt() return prose.

Rating determination:
  Rule-based floor is set from (answer + clause_criticality). LLM may
  escalate but must not de-escalate the floor rating.
"""
from __future__ import annotations

PROMPT_VERSION = "v3.0"

# ── Clause criticality map ────────────────────────────────────────────────────
# Certification-critical clauses: a "no" answer → MaNC (audit) / High NI (gap)
CRITICAL_CLAUSES: set[str] = {
    "4.3",    # ISMS scope — fundamental to certification
    "5.1",    # Top management commitment
    "5.2",    # Information security policy
    "6.1.2",  # Risk assessment methodology
    "6.1.3",  # Risk treatment plan + SoA
    "9.1",    # Monitoring and measurement
    "9.2",    # Internal audit programme
    "9.3",    # Management review
    "A.5.3",  # Segregation of duties
    "A.8.2",  # Privileged access management
    "A.8.15", # Logging
    "A.8.25", # Secure development lifecycle
}


def _is_critical(clause_ref: str) -> bool:
    return clause_ref in CRITICAL_CLAUSES


def determine_floor_rating(answer: str, clause_ref: str, service_type: str) -> str:
    """
    Rule-based floor rating from answer + clause criticality.
    The LLM may escalate but must never de-escalate below this floor.

    Audit ratings : A | OBS | MiNC | MaNC
    Gap ratings   : FI | PI | NI
    """
    critical = _is_critical(clause_ref)
    ans = (answer or "no").lower().strip()

    if service_type == "gap_assessment":
        if ans == "yes":
            return "FI"
        if ans == "partial":
            return "PI"
        return "NI"
    else:  # audit_report
        if ans == "yes":
            return "A"
        if ans == "partial":
            return "MiNC" if critical else "OBS"
        # "no"
        return "MaNC" if critical else "MiNC"


# ── Table of Contents per report type ────────────────────────────────────────

TOC_AUDIT = """\
TABLE OF CONTENTS — ISO 27001 COMPLIANCE AUDIT REPORT
1.  Executive Summary
2.  Audit Details
3.  Audit Opinion Rating Legend
4.  Clause Findings (ISO 27001:2022)
    4.1  Clause 4  Context of the Organisation
    4.2  Clause 5  Leadership
    4.3  Clause 6  Planning
    4.4  Clause 7  Support
    4.5  Clause 8  Operation
    4.6  Clause 9  Performance Evaluation
    4.7  Clause 10 Improvement
    4.8  Annex A — Organisational Controls
    4.9  Annex A — People Controls
    4.10 Annex A — Physical Controls
    4.11 Annex A — Technology Controls
5.  Consolidated Findings Summary
6.  Conclusion & Sign-off
"""

TOC_GAP = """\
TABLE OF CONTENTS — ISO 27001 GAP ASSESSMENT REPORT
1.  Executive Summary
2.  Assessment Details
3.  CIRC Opinion Rating Legend
4.  Gap Findings by Clause Group (ISO 27001:2022)
    4.1  Clause 4  Context of the Organisation
    4.2  Clause 5  Leadership
    4.3  Clause 6  Planning
    4.4  Clause 7  Support
    4.5  Clause 8  Operation
    4.6  Clause 9  Performance Evaluation
    4.7  Clause 10 Improvement
    4.8  Annex A — Organisational Controls
    4.9  Annex A — People Controls
    4.10 Annex A — Physical Controls
    4.11 Annex A — Technology Controls
5.  Consolidated Gap Summary
6.  Conclusion & Next Steps
"""


def get_toc(service_type: str) -> str:
    return TOC_GAP if service_type == "gap_assessment" else TOC_AUDIT


# ── System prompt ─────────────────────────────────────────────────────────────

def get_system_prompt(service_type: str = "audit_report") -> str:
    """Return the grounding-first system prompt for the given service type."""
    toc = get_toc(service_type)
    role = (
        "Senior Information Security Consultant specialising in gap assessments"
        if service_type == "gap_assessment"
        else "Lead Auditor with ISO/IEC 27001:2022 certification expertise"
    )
    report_label = (
        "ISO 27001 gap assessment"
        if service_type == "gap_assessment"
        else "ISO 27001 compliance audit"
    )
    return f"""\
You are a {role}.
You are producing a professional {report_label} report in British English.

FULL REPORT STRUCTURE:
{toc}

YOUR ROLE — PROFESSIONAL TECHNICAL WRITER:
1. Your primary source is the AUDITOR'S WIZARD ANSWERS below — these are FACTS. Do NOT contradict, invent, or override them.
2. Use the ISO REFERENCE CONTEXT supplied to expand the auditor's observations and explain WHY a finding has its assigned rating.
3. Cite ISO/IEC 27001:2022 clauses precisely, e.g. "per ISO/IEC 27001:2022 Clause 6.1.2".
4. Write in formal British English. Use "organisation", "programme", "recognised", not American spellings.
5. Output ONLY the content requested — no preambles, no meta-commentary, no titles unless specified."""


# ── Helper: format wizard answers as a structured block ──────────────────────

def _format_answers_block(answers: list, service_type: str) -> str:
    lines = []
    for a in answers:
        clause = a.get("clause_ref", "?")
        question = a.get("question", "")
        ans = (a.get("answer") or "no").upper()
        comment = (a.get("comment") or "").strip()
        floor = determine_floor_rating(a.get("answer", "no"), clause, service_type)

        lines.append(f"  CLAUSE {clause}")
        lines.append(f"  Question   : {question}")
        lines.append(f"  Answer     : {ans}  |  Floor Rating: {floor}")
        if comment:
            lines.append(f"  Observation: {comment}")
        lines.append("")
    return "\n".join(lines)


# ── Clause findings prompt (per clause group — returns JSON) ──────────────────

def clause_findings_prompt(
    section_name: str,
    answers: list,
    rag_context: str,
    service_type: str = "audit_report",
) -> str:
    """
    Per-clause-group prompt. LLM must return a JSON array — one entry per clause.
    Each entry is grounded in the auditor's wizard answer and expanded via RAG.
    """
    is_gap = service_type == "gap_assessment"
    answers_block = _format_answers_block(answers, service_type)

    rag_block = ""
    if rag_context:
        rag_block = f"""
ISO REFERENCE CONTEXT (use this to support and explain findings):
----------------------------------------------------------------------
{rag_context}
----------------------------------------------------------------------
"""

    if is_gap:
        schema = """\
{
  "clause_ref": "e.g. 6.1.2",
  "control_name": "Short control / requirement name",
  "current_state": "2-3 sentences describing what was observed, based on the auditor's observation",
  "required_state": "What ISO/IEC 27001:2022 requires for this clause (cite the clause)",
  "gap_delta": "The specific difference between current and required state",
  "circ_rating": "Fully Implemented | Partially Implemented | Not Implemented | Not Applicable",
  "priority": "High | Medium | Low",
  "recommendation": "2-3 specific, actionable recommendations citing the relevant ISO clause"
}"""
        rating_rules = """\
CIRC RATING RULES (honour the floor rating — may escalate, never de-escalate):
  Floor FI  → "Fully Implemented"     (answer was YES)
  Floor PI  → "Partially Implemented" (answer was PARTIAL)
  Floor NI  → "Not Implemented"       (answer was NO)

PRIORITY RULES:
  NI on critical clause (4.3, 5.2, 6.1.2, 6.1.3, 9.2, 9.3, A.8.2, A.8.15) → High
  NI on non-critical clause → Medium
  PI on critical clause → Medium; PI on other → Low
  FI → Low"""
    else:
        schema = """\
{
  "clause_ref": "e.g. 6.1.2",
  "requirement_summary": "Short description of the ISO 27001:2022 requirement for this clause",
  "status": "A | OFI | OBS | MiNC | MaNC",
  "user_observation": "The auditor's exact observation — replicate faithfully",
  "audit_finding": "Professional 3-5 sentence expansion citing the ISO clause and using the reference context to explain risk/impact",
  "evidence_reviewed": "What evidence was cited or what absence of evidence was noted",
  "recommendation": "2-3 specific, actionable recommendations citing the relevant ISO clause"
}"""
        rating_rules = """\
AUDIT OPINION RATING RULES (honour the floor rating — may escalate, never de-escalate):
  Floor A    → A     — Agreed / Conformity       (answer was YES)
  Floor OBS  → OBS   — Observation               (answer was PARTIAL, non-critical clause)
  Floor MiNC → MiNC  — Minor Non-Conformity      (answer was PARTIAL on critical, or NO on non-critical)
  Floor MaNC → MaNC  — Major Non-Conformity      (answer was NO on critical clause)

STATUS DEFINITIONS:
  A    = Control fully conformant; no findings raised.
  OFI  = Opportunity for Improvement — good practice not adopted; not a non-conformity.
  OBS  = Observation — noteworthy; corrective action recommended but not formally required.
  MiNC = Minor Non-Conformity — partial gap; corrective action required within agreed timeframe.
  MaNC = Major Non-Conformity — significant gap; certification at risk; immediate action required."""

    return f"""\
You are generating the "{section_name}" section of the report.

AUDITOR'S WIZARD ANSWERS FOR THIS CLAUSE GROUP:
{answers_block}{rag_block}
{rating_rules}

TASK:
For EACH clause listed above, produce one finding entry following this EXACT JSON schema:
{schema}

RULES:
- "user_observation" (or "current_state") must faithfully reflect the auditor's exact words.
- "audit_finding" (or "gap_delta") must expand using the ISO reference context and explain risk/impact.
- Ratings must respect the floor — never downgrade MaNC to MiNC, or MiNC to OBS.
- Return a valid JSON ARRAY with exactly one object per clause.
- Start your response with [ and end with ]. No text outside the JSON array."""


# ── Executive Summary prompt (generated LAST, after all clause findings) ──────

def executive_summary_prompt(
    report,
    all_findings: list,
    prelim_score: float,
    service_type: str = "audit_report",
) -> str:
    """
    Generated after all clause-group findings are assembled.
    `all_findings` is a flat list of finding dicts from all clause groups.
    """
    is_gap = service_type == "gap_assessment"

    status_counts: dict[str, int] = {}
    critical_items: list[str] = []
    for finding in all_findings:
        if is_gap:
            st = finding.get("circ_rating", "Unknown")
            if finding.get("priority") == "High":
                critical_items.append(
                    f"- Clause {finding.get('clause_ref', '?')}: {(finding.get('gap_delta') or '')[:120]}"
                )
        else:
            st = finding.get("status", "Unknown")
            if st in ("MaNC", "MiNC"):
                critical_items.append(
                    f"- Clause {finding.get('clause_ref', '?')} [{st}]: {(finding.get('audit_finding') or '')[:120]}"
                )
        status_counts[st] = status_counts.get(st, 0) + 1

    status_str = ", ".join(f"{k}: {v}" for k, v in sorted(status_counts.items()))
    findings_summary = "\n".join(critical_items[:12]) or "No critical findings identified."
    doc_label = "gap assessment" if is_gap else "compliance audit"
    next_step = (
        "Establish a remediation roadmap and re-assess prior to the formal certification audit."
        if is_gap
        else "Address identified non-conformities and schedule a follow-up internal audit."
    )

    return f"""\
Write the EXECUTIVE SUMMARY section of this ISO 27001 {doc_label} report.
Target length: 400-550 words. Write as formal prose — no bullet points in the body.

REPORT DATA:
Organisation       : {report.organisation}
Department         : {report.department or "Enterprise-wide"}
ISMS Scope         : {report.scope or "Not formally declared"}
Standard           : ISO/IEC 27001:2022
Report Type        : {doc_label.title()}
Indicative Score   : {prelim_score:.1f}%
Findings Breakdown : {status_str or "See detailed sections"}

KEY FINDINGS REQUIRING ATTENTION:
{findings_summary}

STRUCTURE YOUR SUMMARY:
1. Purpose and scope of this {doc_label} (1 paragraph).
2. Overall {'compliance posture and certification readiness' if not is_gap else 'gap posture and certification readiness'} of {report.organisation} (1 paragraph).
3. Key themes from the critical findings above — reference specific clauses (1-2 paragraphs).
4. Overall conclusion statement (1 sentence, decisive).
5. Recommended immediate next steps: {next_step} (1 paragraph).

Write in formal British English addressed to the Managing Director / Board of Directors."""


# ── Scope prompt (prose) ──────────────────────────────────────────────────────

def scope_prompt(
    report,
    submissions,
    evidence_count: int,
    rag_context: str = "",
    service_type: str = "audit_report",
) -> str:
    doc_label = "gap assessment" if service_type == "gap_assessment" else "compliance audit"
    rag_block = (
        f"\nISO REFERENCE CONTEXT:\n{'─' * 60}\n{rag_context}\n{'─' * 60}\n"
        if rag_context
        else ""
    )
    return f"""\
Write the SCOPE section of this ISO 27001 {doc_label} report.
Target length: 250-400 words.
{rag_block}
Organisation    : {report.organisation}
Department      : {report.department or "Enterprise-wide"}
Declared ISMS Scope: {report.scope or "Not formally declared by the organisation"}
Standard        : ISO/IEC 27001:2022
Clauses Assessed: {len(submissions)}

Describe the ISMS boundary, what is in scope, what is excluded, and why.
Reference ISO/IEC 27001:2022 Clause 4.3 (Determining the scope of the ISMS).
Write as formal prose — no bullet points."""


# ── Conclusion prompt (prose) ─────────────────────────────────────────────────

def conclusion_prompt(
    report,
    score,
    all_parsed_findings: list,
    service_type: str = "audit_report",
) -> str:
    """
    Generate the Conclusion section AFTER scoring is complete so the real
    score is embedded.  all_parsed_findings is the full list of clause-level
    dicts accumulated during ISO agent processing.
    """
    score_val = round(score.total_score, 1) if score else 0.0
    status    = score.status if score else "PENDING"
    is_gap    = service_type == "gap_assessment"
    doc_label = "gap assessment" if is_gap else "compliance audit"
    org       = report.organisation or "the organisation"
    dept      = report.department or ""

    # ── Build a concise findings digest ──────────────────────────────────
    rating_key = "circ_rating" if is_gap else "status"
    non_compliant_ratings = (
        {"Not Implemented", "NI"} if is_gap
        else {"MaNC", "MiNC", "Major Non-Conformity", "Minor Non-Conformity"}
    )
    major_key = {"NI", "Not Implemented", "MaNC", "Major Non-Conformity"}
    minor_key = {"PI", "Partially Implemented", "MiNC", "Minor Non-Conformity"}

    major_findings, minor_findings, compliant_clauses = [], [], []
    for f in (all_parsed_findings or []):
        r = (f.get(rating_key) or "").strip()
        clause = f.get("clause_ref", "?")
        if r in major_key:
            desc = (f.get("gap_delta") or f.get("audit_finding") or "")[:120]
            major_findings.append(f"  • {clause}: {desc}")
        elif r in minor_key:
            desc = (f.get("gap_delta") or f.get("audit_finding") or "")[:100]
            minor_findings.append(f"  • {clause}: {desc}")
        else:
            compliant_clauses.append(clause)

    findings_block = ""
    if major_findings:
        label = "Not Implemented" if is_gap else "Major Non-Conformities (MaNC)"
        findings_block += f"\n{label}:\n" + "\n".join(major_findings[:6])
    if minor_findings:
        label = "Partially Implemented" if is_gap else "Minor Non-Conformities / Observations (MiNC/OBS)"
        findings_block += f"\n\n{label}:\n" + "\n".join(minor_findings[:6])
    if compliant_clauses:
        findings_block += f"\n\nCompliant / Fully Implemented: {', '.join(compliant_clauses[:10])}"
    if not findings_block:
        findings_block = "  (No detailed findings available — write based on the score.)"

    # ── Certification / verdict language ─────────────────────────────────
    if is_gap:
        if score_val >= 75:
            verdict = f"{org} is assessed as READY for ISO/IEC 27001:2022 certification with minor remediation required prior to the Stage 1 audit."
            next_step = "Proceed to address the identified gaps and schedule a formal Stage 1 readiness assessment with an accredited certification body."
        elif score_val >= 50:
            verdict = f"{org} is assessed as PARTIALLY READY. Significant gaps exist that must be addressed before a Stage 1 audit can be recommended."
            next_step = "Prioritise remediation of the Not Implemented items, particularly in planning (Clause 6) and performance evaluation (Clause 9), within a 90-day window."
        else:
            verdict = f"{org} is assessed as NOT READY for ISO/IEC 27001:2022 certification. Fundamental ISMS elements are absent."
            next_step = "Establish the core ISMS foundations (scope, risk assessment methodology, policy framework, and internal audit programme) before re-assessment."
    else:
        n_major = len(major_findings)
        if n_major == 0 and score_val >= 80:
            verdict = f"It is the audit team's opinion that {org}'s ISMS demonstrates substantial conformance with ISO/IEC 27001:2022."
            next_step = "Address the minor non-conformities and observations raised in this report within the agreed timescales and present evidence of closure at the next management review."
        elif n_major <= 2:
            verdict = f"It is the audit team's opinion that {org}'s ISMS is NON-CONFORMANT with ISO/IEC 27001:2022, with {n_major} major non-conformit{'y' if n_major == 1 else 'ies'} requiring immediate corrective action."
            next_step = "Root cause analysis and corrective action plans for each major non-conformity must be submitted within 30 days. A follow-up audit will be required to verify closure before certification can be recommended."
        else:
            verdict = f"It is the audit team's opinion that {org}'s ISMS demonstrates significant non-conformance with ISO/IEC 27001:2022. Certification cannot be recommended at this stage."
            next_step = "A comprehensive corrective action programme must be established. A full re-audit is recommended once remediation has been completed and verified internally."

    scope_summary = (report.scope or "the declared ISMS boundary")[:300]

    return f"""\
Write the CONCLUSION AND NEXT STEPS section of this ISO 27001 {doc_label} report.
Target: 280–380 words. Use formal British English.

CONTEXT (facts — do not contradict):
  Organisation  : {org}{f" — {dept}" if dept else ""}
  ISMS Scope    : {scope_summary}
  Report Type   : {doc_label.title()}
  Compliance Score: {score_val:.1f}%  |  Status: {status}
  Verdict       : {verdict}
  Recommended Next Step: {next_step}

FINDINGS DIGEST:
{findings_block}

WRITE THE FOLLOWING STRUCTURE (in order, as continuous prose paragraphs — no bullet lists):
1. OVERALL VERDICT PARAGRAPH — State the verdict clearly. Quote the compliance score.
   Reference the ISMS scope.
2. KEY STRENGTHS — Identify 2–3 areas of genuine strength drawn from the compliant/FI clauses above.
3. PRIORITY REMEDIATION AREAS — Discuss the top 2–3 major findings and why they are critical
   for {'certification readiness' if is_gap else 'ISMS integrity'}. Cite ISO clauses.
4. NEXT STEPS — State the recommended next steps concisely (use the recommended next step above).
   Reference continual improvement per ISO/IEC 27001:2022 Clause 10.2.
5. SIGN-OFF LINE — End with a one-sentence professional sign-off by PSE Consulting.

Output pure prose. No headers, no bullet points. No score tables."""

