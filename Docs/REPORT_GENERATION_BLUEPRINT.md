# PSE Compliance Report Generation — Complete Replication Blueprint

> **Purpose:** This document is the definitive technical and architectural guideline for the PSE  
> Report Generation system. It is written so that the same workflow can be replicated verbatim  
> in another compliance domain (e.g. Synot Pharma / ISO 9001, GMP, 21 CFR Part 11, etc.)  
> without losing any of the design intent, quality safeguards, or grounding principles.

---

## Table of Contents

1. [Philosophy & Design Principles](#1-philosophy--design-principles)
2. [System Architecture at a Glance](#2-system-architecture-at-a-glance)
3. [Key Players — Every Component Explained](#3-key-players--every-component-explained)
4. [The Complete Pipeline — Stage by Stage](#4-the-complete-pipeline--stage-by-stage)
5. [The RAG Pipeline — How Knowledge Grounds the Report](#5-the-rag-pipeline--how-knowledge-grounds-the-report)
6. [LLM Prompting Strategy — The Grounding-First Contract](#6-llm-prompting-strategy--the-grounding-first-contract)
7. [Validation & Scoring — Deterministic Quality Gates](#7-validation--scoring--deterministic-quality-gates)
8. [Export Layer — From JSON to Branded DOCX](#8-export-layer--from-json-to-branded-docx)
9. [Data Models — The Full Schema](#9-data-models--the-full-schema)
10. [Infrastructure & Configuration](#10-infrastructure--configuration)
11. [Replication Checklist for Synot Pharma](#11-replication-checklist-for-synot-pharma)
12. [Frequently Asked Questions](#12-frequently-asked-questions)

---

## 1. Philosophy & Design Principles

Before touching any code, understand the **three non-negotiable principles** behind why this system produces high-quality reports that clients trust:

### Principle 1 — The LLM is a Writer, Not a Decision-Maker
The LLM (DeepSeek / OpenAI / Anthropic) never decides whether an organisation is compliant.  
**Human auditors decide.** The wizard answers they fill in (Yes / Partial / No + free-text observations) are the ground truth. The LLM's sole job is to take those facts and expand them into professional, ISO-cited prose. It cannot contradict an auditor's answer, only elaborate on it.

### Principle 2 — The Floor Rating is Inviolable
Every clause finding has a *floor rating* computed deterministically from two inputs:
- The auditor's binary answer (Yes → compliant, Partial → minor, No → non-conformant)
- Whether the clause is certification-critical (e.g. §4.3 Scope, §6.1.2 Risk Assessment)

The LLM may **escalate** a rating (e.g. raise Observation to Minor NC if context warrants), but it is explicitly **forbidden to de-escalate**. This prevents the LLM from "softening" bad news.

### Principle 3 — RAG is a Reference Library, Not an Oracle
The Retrieval-Augmented Generation (RAG) layer provides the LLM with relevant excerpts from the actual ISO standard text. This makes findings ISO-accurate and clause-citable. Without RAG the LLM generates generic text; with RAG it explains *why* a finding matters and *what the standard demands*.

---

## 2. System Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────────┐
│                         REPORT_UI (React / Vite)                     │
│  Wizard Form → clause-by-clause Q&A with Yes/Partial/No + comments  │
└────────────────────────────┬─────────────────────────────────────────┘
                             │  POST /api/reports/   (JSON payload)
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     REPORT_BACKEND (Django REST)                     │
│                                                                      │
│  ReportListCreateView → creates Report row + spawns background       │
│                          thread running ReportPipeline.run()         │
│                                                                      │
│  ┌─────────────────── ReportPipeline ──────────────────────────┐    │
│  │  Stage 0  Data Hydration       wizard_answers → Submissions  │    │
│  │  Stage 1  Router               selects ISO27001Agent         │    │
│  │  Stage 2  RAG Retrieval        Hybrid vector + BM25 search   │    │
│  │  Stage 3  ISO27001Agent        per-clause LLM section calls  │    │
│  │  Stage 4  Conflict Check       single-agent: noop            │    │
│  │  Stage 5  Validation           rule-based gap detection       │    │
│  │  Stage 6  Scoring              weighted formula → % score    │    │
│  │  Stage 7  Conclusion           LLM conclusion post-scoring   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  PostgreSQL + pgvector   ←→   RAGDocument + RAGChunk tables         │
│  ONNX MiniLM embedder          384-dim cosine similarity search     │
│                                                                      │
│  ExportView  →  DOCX / PDF builder  →  branded file download        │
└──────────────────────────────────────────────────────────────────────┘
```

**Tech Stack:**
| Layer | Technology |
|---|---|
| Backend | Django 4.x + Django REST Framework |
| Database | PostgreSQL 15+ with `pgvector` extension |
| Embedding model | `all-MiniLM-L6-v2` (ONNX, 384 dimensions, CPU) |
| LLM | DeepSeek-Chat (primary), OpenAI GPT-4o, Anthropic Claude (switchable) |
| Export | `python-docx` for DOCX, `weasyprint` for PDF |
| Frontend | React + Vite + TanStack Router |
| Container | Docker + Docker Compose |

---

## 3. Key Players — Every Component Explained

### 3.1 `ReportPipeline` — The Conductor
**File:** `agents/pipeline.py`

The `ReportPipeline` is the **orchestrator**. It runs entirely in a background thread so the API response returns immediately (202 Accepted) and the UI polls for progress.

It is the only component that has visibility of *all* stages. It:
- Sets the `report.current_stage` and `report.progress_pct` fields after every stage so the UI can show a live progress bar
- Writes `AgentExecution` log rows after every stage (audit trail)
- Handles all exceptions and sets `report.status = FAILED` gracefully
- Triggers the Conclusion section **after** scoring, so the score can be quoted accurately in the conclusion prose

Progress milestones: `8% → 15% → 30% → 65% → 72% → 85% → 95% → 100%`

---

### 3.2 `ISO27001Agent` — The Writer
**File:** `agents/iso27001_agent.py`

This agent is the heart of section generation. It does **not** make a single monolithic "write the whole report" LLM call. Instead it makes **one targeted LLM call per clause group**:

| Clause Group | Example Clauses | LLM Call? |
|---|---|---|
| Scope (prose) | §4.3 scope statement | Yes |
| §4 Context of the Organisation | 4.1, 4.2, 4.3, 4.4 | Yes |
| §5 Leadership | 5.1, 5.2, 5.3 | Yes |
| §6 Planning | 6.1.1, 6.1.2, 6.1.3, 6.2 | Yes |
| §7 Support | 7.1–7.5 | Yes |
| §8 Operation | 8.1, 8.2, 8.3 | Yes |
| §9 Performance Evaluation | 9.1, 9.2, 9.3 | Yes |
| §10 Improvement | 10.1, 10.2 | Yes |
| Annex A — Organisational Controls | A.5.x | Yes |
| Annex A — People Controls | A.6.x | Yes |
| Annex A — Physical Controls | A.7.x | Yes |
| Annex A — Technology Controls | A.8.x | Yes |
| Executive Summary | Whole report | Yes (last) |
| Conclusion | Whole report | Yes (post-scoring) |

Why per-clause-group? Because:
- Each call gets only the RAG context relevant to *that group*'s clauses — no noise
- Token limits are respected (3000-char RAG + wizard answers fits in one context window)
- Failures in one group do not break others
- Sections can be regenerated individually

**Critical detail:** The agent groups wizard answers by their `section` field, which must match the clause group names above. The order the sections appear in the wizard determines the order in the final report.

---

### 3.3 `ReportPipeline._hydrate_submissions_from_wizard` — Data Hydration
**File:** `agents/pipeline.py`

This is **Stage 0** and is the most underappreciated component.

The front-end sends a `wizard_answers` JSON array. Each element is:
```json
{
  "clause_ref": "6.1.2",
  "section": "§6 Planning",
  "question": "Has a formal risk assessment methodology been defined?",
  "answer": "partial",
  "comment": "Risk register exists but is not reviewed regularly."
}
```

The hydrator converts these into `Submission` database rows, mapping:
- `"yes"` → `compliance_status = "compliant"`
- `"partial"` → `compliance_status = "partial"`
- `"no"` → `compliance_status = "non_compliant"`

This is important because `ValidationService` and `ScoringService` operate on `Submission` rows, not on the raw `wizard_answers` JSON. The hydration step bridges the two.

---

### 3.4 `get_provider()` / LLM Providers — The LLM Abstraction
**File:** `agents/providers.py`

A simple protocol-based abstraction. The `LLM_PROVIDER` environment variable switches between:

| Value | Class | Notes |
|---|---|---|
| `deepseek` | `DeepSeekProvider` | OpenAI-compatible API, `deepseek-chat`, temp=0.45, max_tokens=4000 |
| `openai` | `OpenAIProvider` | GPT-4o, temp=0.3, max_tokens=1500 |
| `anthropic` | `AnthropicProvider` | Claude 3.5 Sonnet, temp=0.2, max_tokens=4096 |
| `mock` | `MockProvider` | Deterministic placeholder — no API key needed for dev/testing |

**Why DeepSeek is the primary:** It consistently produces the most structured JSON output for clause findings (critical for the DOCX builder), handles longer contexts than GPT-4o, and costs ~20× less per token.

**Critical fix for DeepSeek:** The `openai` 1.50 + `httpx` 0.28 combination raises a `proxies` kwarg TypeError unless you pass `http_client=httpx.Client()` explicitly. This is already applied in `DeepSeekProvider.__init__`.

---

### 3.5 `prompts.py` — The Grounding-First Prompt Templates
**File:** `agents/prompts.py` (v3.0)

This is the most important file in the system for **quality control**. It contains:
- `get_system_prompt()` — the role definition and hard writing rules
- `determine_floor_rating()` — rule-based rating computation (no LLM involved)
- `CRITICAL_CLAUSES` set — 12 clauses where a "no" answer forces the highest severity
- `clause_findings_prompt()` — structured JSON-output prompt per clause group
- `executive_summary_prompt()` — synthesises all findings into the summary
- `scope_prompt()` — prose section for ISMS boundary description
- `conclusion_prompt()` — post-scoring verdict generation with certification language

---

### 3.6 `RAG Retriever + Embedder + Ingestor` — The Knowledge Layer
**Files:** `agents/rag/retriever.py`, `agents/rag/embedder.py`, `agents/rag/ingestor.py`

See Section 5 for the full breakdown.

---

### 3.7 `ValidationService` — The Rule Engine
**File:** `reports/services/validation.py`

Three deterministic rules (no LLM):
1. Mandatory requirement + zero evidence attached → HIGH gap
2. Mandatory requirement + compliance status ≠ compliant → HIGH gap
3. Partial compliance + no comment → MEDIUM gap

Produces `Gap` rows that feed into scoring and appear in the "Consolidated Findings" table in the DOCX.

---

### 3.8 `ScoringService` — The Weighted Formula
**File:** `reports/services/scoring.py`

```
section_score    = 100 − (high_gaps × 10),  clamped 0–100
evidence_score   = 100 − (total_gaps × 8),  clamped 0–100
consistency_score = 95 (no gaps) | 88 (has gaps)

total = section_score×0.40 + evidence_score×0.35 + consistency_score×0.25

APPROVED          ≥ 85%
APPROVED_WITH_GAPS  60–84%
FAILED            < 60%
```

The score is computed **before** the Conclusion is generated, so the conclusion prose can quote the real percentage.

---

### 3.9 `docx_builder.py` — The Export Engine
**File:** `exports/docx_builder.py`

Converts the database-stored `ReportSection` rows into a fully branded DOCX file. It:
- Detects sections with `JSON_PREFIX = "__JSON__:"` and renders them as colour-coded tables
- Applies the PSE corporate colour scheme (navy/blue headings, green/amber/red status cells)
- Adds Cover Page, Document Information table, Table of Contents, Score Summary
- Handles two completely different layouts for Audit Report vs Gap Assessment

---

### 3.10 `colour_map.py` — The Colour Intelligence
**File:** `exports/colour_map.py`

Maps LLM-returned short codes (e.g. `MaNC`, `FI`, `PI`) to display strings and hex colours. Acts as a translation layer between what the LLM writes and what the DOCX builder renders.

---

## 4. The Complete Pipeline — Stage by Stage

```
POST /api/reports/  ─── creates Report row ─── spawns thread
                                                      │
                                                      ▼
                                          ┌─── Stage 0 (8%) ────────────┐
                                          │  Data Hydration             │
                                          │  wizard_answers JSON        │
                                          │  → Submission ORM rows      │
                                          └────────────┬────────────────┘
                                                       │
                                                       ▼
                                          ┌─── Stage 1 (15%) ───────────┐
                                          │  Router                     │
                                          │  standard.code → Agent      │
                                          │  "ISO27001" → ISO27001Agent │
                                          └────────────┬────────────────┘
                                                       │
                                                       ▼
                                          ┌─── Stage 2 (30%) ───────────┐
                                          │  RAG Retrieval              │
                                          │  Build query from report    │
                                          │  context + "no" answers     │
                                          │  retrieve() k=8 ISO27001    │
                                          │  + k=6 ISO27002 supplement  │
                                          │  format_context() → string  │
                                          │  Saved to report.rag_context│
                                          └────────────┬────────────────┘
                                                       │
                                                       ▼
                                          ┌─── Stage 3 (65%) ───────────┐
                                          │  ISO27001Agent              │
                                          │  For EACH clause group:     │
                                          │    1. retrieve_hybrid()     │
                                          │       (BM25 + vector)       │
                                          │    2. retrieve_for_clause() │
                                          │       (exact clause match)  │
                                          │    3. clause_findings_prompt│
                                          │    4. LLM call              │
                                          │    5. Parse JSON response   │
                                          │    6. Save ReportSection    │
                                          │  Then: scope + exec summary │
                                          └────────────┬────────────────┘
                                                       │
                                                       ▼
                                          ┌─── Stage 4 (72%) ───────────┐
                                          │  Conflict Check             │
                                          │  (noop in single-agent)     │
                                          └────────────┬────────────────┘
                                                       │
                                                       ▼
                                          ┌─── Stage 5 (85%) ───────────┐
                                          │  ValidationService          │
                                          │  3 deterministic rules      │
                                          │  → Gap rows                 │
                                          └────────────┬────────────────┘
                                                       │
                                                       ▼
                                          ┌─── Stage 6 (100%) ──────────┐
                                          │  ScoringService             │
                                          │  weighted formula           │
                                          │  → ComplianceScore row      │
                                          └────────────┬────────────────┘
                                                       │
                                                       ▼
                                          ┌─── Stage 7 (95→100%) ───────┐
                                          │  Conclusion Generation      │
                                          │  Real score → LLM prompt    │
                                          │  conclusion_prompt()        │
                                          │  → ReportSection "Conclusion│
                                          └────────────┬────────────────┘
                                                       │
                                                       ▼
                                             report.status = COMPLETED
```

**Important ordering note:** The Executive Summary is generated at the *end* of Stage 3 (after all clause-group findings are accumulated), and the Conclusion is generated at Stage 7 (after scoring). This ensures:
- The Executive Summary references real finding counts and specific clause issues
- The Conclusion quotes the exact compliance percentage from `ScoringService`

---

## 5. The RAG Pipeline — How Knowledge Grounds the Report

The RAG (Retrieval-Augmented Generation) pipeline is what makes this system's reports accurate rather than hallucinated. Here is how it works end to end.

### 5.1 Document Ingestion (One-Time Setup)

```
PDF Documents → pdfplumber → raw text → clean boilerplate
                                              │
                                    ISO-aware chunker
                                    (split on clause headers)
                                              │
                                    Chunk metadata extracted:
                                    - clause_ref (e.g. "6.1.2")
                                    - section_title
                                    - theme (Planning, Leadership…)
                                    - page_start, page_end
                                              │
                                    ONNX MiniLM embedder
                                    embed_one(chunk_text)
                                    → 384-dim float32 vector
                                              │
                                    RAGChunk saved to PostgreSQL
                                    with pgvector embedding column
```

**Documents ingested:**
- `ISO 27001:2022` (requirements standard) — splits on numbered clauses 4–10 and Annex A
- `ISO 27002:2022` (controls guidance, 164 pages) — splits on control headers 5.x–8.x
- SOA (Statement of Applicability) — `doc_type="soa"` for `retrieve_soa_control()`

**Chunking parameters:**
- `MIN_CHARS = 150` — chunks shorter than this are merged with the previous
- `MAX_CHARS = 1200` — chunks longer than this are split with 120-char overlap
- Boilerplate lines (copyright notices, licence headers) are stripped before chunking

### 5.2 Hybrid Retrieval (Per Clause Group, Every Report)

The ISO27001Agent uses **three retrieval functions** per clause group:

```python
# 1. Hybrid search (BM25 + vector, merged via RRF K=60)
rag_chunks = retrieve_hybrid(query, clause_refs=clause_refs, k=5, standard_ref="ISO 27001:2022")

# 2. Supplement with ISO 27002 if fewer than 3 chunks returned
if len(rag_chunks) < 3:
    extra = retrieve_hybrid(query, clause_refs=clause_refs, k=3, standard_ref="ISO 27002:2022")
    rag_chunks += extra

# 3. Exact clause reference match (similarity=1.0, guarantees relevant guidance)
exact_chunks = retrieve_for_clause(clause_refs, k=2)

# Deduplicate by chunk_id, format into a single context string (max 3000 chars)
all_rag = {c.chunk_id: c for c in rag_chunks + exact_chunks}
rag_context = format_context(list(all_rag.values()), max_chars=3000)
```

**Reciprocal Rank Fusion (RRF):** The hybrid retriever merges BM25 keyword scores and cosine vector scores using the formula `RRF_score = 1 / (K + rank)` for each result, then re-ranks. K=60 balances the two signals. This outperforms either method alone, especially for ISO clause numbers (exact BM25 match) and conceptual queries (semantic vector match).

### 5.3 How RAG Context Enters the Prompt

The `format_context()` function formats retrieved chunks as:
```
[1] ISO 27001:2022 § 6.1.2 — Risk assessment methodology
    The organisation shall define and apply an information security risk assessment
    process that: a) establishes and maintains information security risk criteria…
    (similarity: 0.94)

[2] ISO 27002:2022 § 5.7 — Threat intelligence
    ...
```

This structured block is inserted between the wizard answers and the rating rules in the `clause_findings_prompt`. The LLM is instructed to *"use the ISO reference context to expand findings and explain WHY a finding has its rating"*.

### 5.4 Stage-Level RAG (Global Context)

In addition to per-clause-group retrieval, Stage 2 of the pipeline runs a **global RAG query** across the whole report:

```python
rag_query = (
    f"ISO 27001 compliance audit for {report.organisation}. "
    f"Known gaps: {gap_text}. "
    f"User-reported weaknesses: {wizard_summary}."
)
rag_chunks = retrieve(rag_query, k=8, standard_ref="ISO 27001:2022")
```

This global context (`report.rag_context`) is saved on the Report row and available to any component that needs it.

---

## 6. LLM Prompting Strategy — The Grounding-First Contract

### 6.1 System Prompt

Every LLM call uses the same system prompt structure (from `get_system_prompt()`):

```
You are a [role].
You are producing a professional [report type] in British English.

FULL REPORT STRUCTURE:
[Table of Contents]

YOUR ROLE — PROFESSIONAL TECHNICAL WRITER:
1. Primary source = WIZARD ANSWERS (FACTS). Do NOT contradict or override.
2. Use ISO REFERENCE CONTEXT to expand and explain WHY findings have their rating.
3. Cite ISO/IEC 27001:2022 clauses precisely (e.g. "per ISO/IEC 27001:2022 §6.1.2").
4. Write in formal British English.
5. Output ONLY the content requested — no preambles, no meta-commentary.
```

Two roles exist:
- Audit: `"Lead Auditor with ISO/IEC 27001:2022 certification expertise"`
- Gap: `"Senior Information Security Consultant specialising in gap assessments"`

### 6.2 Clause Findings Prompt — Structured JSON Output

For every clause group, the LLM is asked to return a **JSON array** with one object per clause. The schema differs by report type:

**Audit Report schema:**
```json
{
  "clause_ref": "6.1.2",
  "requirement_summary": "Risk assessment methodology",
  "status": "MiNC",
  "user_observation": "Exact auditor observation from wizard",
  "audit_finding": "3-5 professional sentences citing ISO and explaining risk/impact",
  "evidence_reviewed": "What was or was not evidenced",
  "recommendation": "2-3 actionable recommendations with ISO clause citation"
}
```

**Gap Assessment schema:**
```json
{
  "clause_ref": "6.1.2",
  "control_name": "Risk assessment methodology",
  "current_state": "What was observed",
  "required_state": "What ISO 27001:2022 requires",
  "gap_delta": "The specific difference",
  "circ_rating": "Partially Implemented",
  "priority": "High",
  "recommendation": "2-3 actionable recommendations"
}
```

The response always begins with `[` and ends with `]`. If JSON parsing fails, the raw text is still saved (graceful degradation) and the DOCX builder falls back to prose rendering.

### 6.3 Floor Rating Enforcement

This is the critical quality safeguard in `determine_floor_rating()`:

```python
CRITICAL_CLAUSES = {
    "4.3",    # ISMS scope
    "5.1",    # Top management commitment
    "5.2",    # Information security policy
    "6.1.2",  # Risk assessment
    "6.1.3",  # Risk treatment + SoA
    "9.1",    # Monitoring
    "9.2",    # Internal audit
    "9.3",    # Management review
    "A.5.3",  # Segregation of duties
    "A.8.2",  # Privileged access
    "A.8.15", # Logging
    "A.8.25", # Secure development lifecycle
}

# For audit reports:
answer="no" + critical clause → floor = "MaNC" (Major Non-Conformity)
answer="no" + non-critical    → floor = "MiNC" (Minor Non-Conformity)
answer="partial" + critical   → floor = "MiNC"
answer="partial" + non-critical → floor = "OBS" (Observation)
answer="yes" → floor = "A" (Agreed / Conformity)
```

The floor is injected into the prompt alongside each clause's wizard answer:
```
CLAUSE 6.1.2
Question   : Has a formal risk assessment methodology been defined?
Answer     : PARTIAL  |  Floor Rating: MiNC
Observation: Risk register exists but is not reviewed regularly.
```

The prompt then contains the rule: *"Honour the floor rating — may escalate, never de-escalate."*

### 6.4 Executive Summary — Synthesised Last

The executive summary is generated **after all clause groups**, so it can reference:
- Real finding counts per rating type (`MaNC: 2, MiNC: 5, OBS: 3`)
- The top critical findings by clause ref and finding text
- A preliminary score estimate

### 6.5 Conclusion — Generated After Scoring

The conclusion is the final LLM call, made after `ScoringService` completes. The `conclusion_prompt()` function:
1. Builds a verdict string from the real score (e.g. *"APPROVED_WITH_GAPS — 72.4%"*)
2. Categorises all parsed findings into major, minor, and compliant buckets
3. Selects appropriate certification language based on score thresholds (≥75%, ≥50%, <50%)
4. Instructs the LLM to write pure flowing prose in a specific 5-paragraph structure

---

## 7. Validation & Scoring — Deterministic Quality Gates

These two services run **without any LLM** and provide objective, repeatable results.

### 7.1 Validation Rules

| Rule | Trigger | Severity | Gap Message |
|---|---|---|---|
| 1 | Mandatory requirement + zero evidence files | HIGH | "No evidence uploaded for mandatory requirement {code}" |
| 2 | Mandatory requirement + status ≠ compliant | HIGH | "{code} is marked Partial/Non-Compliant — must be Compliant" |
| 3 | Partial compliance + no comment | MEDIUM | "{code} is partially compliant but no comment provided" |

Each gap gets a `rating` value (e.g. `"major_nc"`, `"not_implemented"`) via `infer_rating()`.

### 7.2 Score Formula

| Component | Weight | Formula |
|---|---|---|
| `section_score` | 40% | `max(0, 100 − high_gaps × 10)` |
| `evidence_score` | 35% | `max(0, 100 − total_gaps × 8)` |
| `consistency_score` | 25% | `95` if no gaps, else `88` |

**Status thresholds:**
- `APPROVED` → ≥ 85%
- `APPROVED_WITH_GAPS` → 60–84%
- `FAILED` → < 60%

### 7.3 Why Separate Scoring from LLM Output?

The LLM generates **narrative**. The score is a **number** that must be reliable, auditable, and deterministic. Mixing them would mean the score changes every time the report regenerates — unacceptable for a compliance document. The rule-based score is always reproducible from the same input data.

---

## 8. Export Layer — From JSON to Branded DOCX

### 8.1 The JSON_PREFIX Convention

When the ISO Agent stores a clause-group section, it prefixes the content with `__JSON__:` followed by the raw JSON array:

```
__JSON__:[{"clause_ref":"6.1.2","status":"MiNC","audit_finding":"..."}]
```

The DOCX builder detects this prefix and renders the JSON as a structured table. Sections without the prefix (Scope, Executive Summary, Conclusion) are rendered as prose paragraphs.

### 8.2 Audit Report DOCX Structure

1. **Cover Page** — PSE logo, report type badge, title, organisation name, metadata
2. **Document Information Table** — reference number, version, date, author, classification
3. **Table of Contents** (auto-generated headings)
4. **1.0 Executive Summary** — prose
5. **2.0 Audit Details** — criteria, objectives, method, scope, findings definition, opinion rating legend
6. **3.0–N.0 Clause Findings** — one table per clause group with colour-coded status cells
7. **Consolidated Findings Summary** — all gaps in one table
8. **Audit Conclusions and Recommendation** — prose + sign-off

### 8.3 Gap Assessment DOCX Structure

1. **Cover Page**
2. **Document Information Table**
3. **Score Summary** (score gauge + status)
4. **CIRC Rating Legend** (Fully/Partially/Not Implemented colour table)
5. **Scope** — prose
6. **Executive Summary** — prose
7. **Gap Findings by Clause Group** — tables with green/amber/red CIRC cells
8. **Gap / Non-Conformity Register** — consolidated table
9. **Conclusion & Next Steps** — prose

### 8.4 Colour Scheme

| Status | Background | Text |
|---|---|---|
| Conformity / Fully Implemented | `#C6EFD3` (light green) | `#276749` (dark green) |
| Observation / Partially Implemented | `#FFEEBA` (amber) | `#975A16` (dark amber) |
| Minor NC / Partially Implemented | `#FFEEBA` (amber) | `#975A16` (dark amber) |
| Major NC / Not Implemented | `#FCDEDE` (light red) | `#9B2C2C` (dark red) |
| PSE corporate heading colour | `#002DA8` | White |
| Dark navy table headers | `#1E3A5F` | White |

---

## 9. Data Models — The Full Schema

### 9.1 Core Report Models (`reports/models.py`)

```
Standard ─────────────────────── (code, name)
    │
    ├── Clause ─────────────── (code, title, description, order)
    │       │
    │       └── Requirement ── (code, text, action, expected_evidence, tag, order)
    │
    └── Report ─────────────── (title, organisation, department, scope,
                                 service_type, wizard_answers JSON,
                                 status, current_stage, progress_pct,
                                 rag_context, error_message)
            │
            ├── Submission ──── (requirement FK, compliance_status, comment)
            ├── Evidence ─────── (file, original_name, file_type)
            ├── Gap ─────────── (requirement FK, issue, severity, rating)
            ├── ValidationResult (is_valid)
            └── ComplianceScore  (section_score, evidence_score,
                                   consistency_score, total_score, status)
```

### 9.2 Agent Models (`agents/models.py`)

```
RAGDocument ────────── (name, doc_type, standard_ref, file_path, total_chunks)
    │
    └── RAGChunk ────── (content, clause_ref, section_title, theme,
                          page_start, page_end, embedding VectorField(384))

ReportSection ───────── (report FK, section_name, content, agent_type,
                          confidence_score, evidence_refs JSON, order)

AgentExecution ──────── (report FK, agent_type, stage, message,
                          input_payload JSON, raw_output, confidence_score,
                          prompt_version)
```

### 9.3 Key Design Decision — `wizard_answers` as JSON

The `Report.wizard_answers` field stores the complete auditor Q&A as a JSON array on the Report row. This means:
- No separate "question" table needed
- The questions can differ per report / per standard
- Hydration converts them into `Submission` rows at pipeline start
- The raw JSON is always available for the LLM prompts

---

## 10. Infrastructure & Configuration

### 10.1 Environment Variables

Two `.env` files are used:

**`/Report_Generation/.env`** (Docker Compose level):
```
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
SECRET_KEY=...
DB_NAME=pse_compliance
DB_USER=postgres
DB_PASSWORD=...
DB_HOST=db
DB_PORT=5432
```

**`/Report_Backend/.env`** (Django app level, same keys):
```
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
SECRET_KEY=...
```

### 10.2 Django Apps

| App | Responsibility |
|---|---|
| `accounts` | User auth (Token auth via DRF) |
| `reports` | Report, Submission, Evidence, Gap, Score, ValidationResult models + views |
| `agents` | RAGDocument, RAGChunk, ReportSection, AgentExecution models + pipeline + ISO agent |
| `exports` | DOCX builder, PDF builder, colour map, export views |

### 10.3 Database Setup

```bash
# Enable pgvector extension (run once)
python manage.py migrate  # runs 0002_enable_pgvector migration

# Load ISO 27001 requirements fixture
python manage.py loaddata reports/fixtures/iso27001.json

# Ingest source PDFs into the vector store
python manage.py ingest_rag --path /path/to/ISO_27001_2022.pdf --standard "ISO 27001:2022"
python manage.py ingest_rag --path /path/to/ISO_27002_2022.pdf --standard "ISO 27002:2022"
```

### 10.4 ONNX Model Setup

```bash
# Download model (dev only — Docker bakes it in)
python scripts/download_models.py

# Model location
Report_Backend/models/minilm/
    tokenizer.json
    tokenizer_config.json
    onnx/
        model.onnx
```

The embedder is a **singleton loaded lazily** on first use — no model loading overhead during startup.

### 10.5 Docker Compose

```yaml
services:
  db:       PostgreSQL 15 + pgvector
  backend:  Django (gunicorn) — waits for db via entrypoint healthcheck
  frontend: Vite dev / nginx prod
```

---

## 11. Replication Checklist for Synot Pharma

To replicate this system for a pharmaceutical compliance standard (e.g. GMP, ISO 9001:2015, 21 CFR Part 11, ICH Q10), follow these steps precisely. Steps marked **[ADAPT]** require domain-specific changes; steps marked **[COPY]** can be reused verbatim.

### Phase 1 — Domain Model Setup [ADAPT]

- [ ] Define the target standard (e.g. `ISO 9001:2015` or `GMP Annex 11`)
- [ ] Create a `Standard` row: `{ code: "ISO9001", name: "ISO 9001:2015 Quality Management" }`
- [ ] Create `Clause` rows for each section (e.g. §4 Context, §5 Leadership, §6 Planning…)
- [ ] Create `Requirement` rows for each sub-clause with `tag="mandatory"` for certification-critical ones
- [ ] Generate a fixture JSON: `python scripts/generate_iso27001_fixture.py` (adapt the script for your standard)
- [ ] Define the `wizard_answers` question set — one question per Requirement, grouped by section

### Phase 2 — RAG Document Ingestion [ADAPT]

- [ ] Obtain the PDF(s) of the target standard (and any companion guidance docs)
- [ ] Identify the document's structure (numbered clauses? Control IDs? Section headers?)
- [ ] Adapt `agents/rag/ingestor.py`:
  - Add a new `CLAUSE_RE` regex matching the document's heading pattern
  - Add a `THEME_MAP` dictionary mapping section numbers to meaningful theme names
  - Add a `_split_on_standard_X_pattern()` function (copy from the ISO 27001 version)
- [ ] Run the ingestor: `python manage.py ingest_rag --path /path/to/standard.pdf --standard "ISO 9001:2015"`
- [ ] Verify chunks: `RAGChunk.objects.filter(document__standard_ref="ISO 9001:2015").count()` should be > 100

### Phase 3 — Prompts Adaptation [ADAPT]

In `agents/prompts.py`:

- [ ] Define `CRITICAL_CLAUSES` for the new standard — which clauses, if failed, would block certification? (e.g. §8.3 Design, §9.3 Management Review in ISO 9001)
- [ ] Update `determine_floor_rating()` if the rating scale differs:
  - ISO 9001 audit: typically `C` (Conformity), `OFI`, `NC` (Non-Conformity) — only two levels vs four in ISO 27001
  - GMP: typically `Critical`, `Major`, `Minor`
- [ ] Update `TOC_AUDIT` and `TOC_GAP` with the new standard's section names
- [ ] Update `get_system_prompt()` with the new role (e.g. *"Lead Quality Auditor with ISO 9001:2015 certification expertise"*)
- [ ] Update all prompt text: replace "ISO/IEC 27001:2022" references with the new standard code
- [ ] Update `clause_findings_prompt()` schema fields for the new domain (e.g. pharmaceutical quality uses "CAPA" instead of "risk treatment")
- [ ] Update verdict language in `conclusion_prompt()` to match pharmaceutical certification terminology

### Phase 4 — Agent Adaptation [ADAPT]

In `agents/iso27001_agent.py` (rename to e.g. `iso9001_agent.py`):

- [ ] Rename the class to `ISO9001Agent`
- [ ] Update `AGENT_TYPE = "ISO9001Agent"`
- [ ] The per-clause-group loop is fully generic — it reads sections from `wizard_answers`. No changes needed to the loop structure itself.
- [ ] Update log messages to reference the new standard

In `agents/pipeline.py`:

- [ ] Add routing logic: `if report.standard.code == "ISO9001": agent = ISO9001Agent()`
- [ ] Optionally add the new agent to the `STAGES` list description

### Phase 5 — Colour Map Adaptation [ADAPT if new rating scale]

In `exports/colour_map.py`:

- [ ] Add new `*_RATING_COLOURS` dictionary for the pharmaceutical rating scale
- [ ] Add entries to `_LLM_*_STATUS_MAP` for any new LLM short codes
- [ ] Update `infer_rating()` to handle the new service type

### Phase 6 — DOCX Builder Adaptation [ADAPT layout if needed]

In `exports/docx_builder.py`:

- [ ] The `JSON_PREFIX` detection and table rendering is fully generic — [COPY]
- [ ] The cover page, doc info table, and colour scheme are fully generic — [COPY]
- [ ] Add a new layout branch for the new standard's report structure if it differs significantly
- [ ] Update section heading names (e.g. "Gap Assessment" → "Readiness Assessment" for pharma)

### Phase 7 — Wizard Questions [ADAPT]

The front-end wizard in `Report_UI/src/routes/` needs a new question set. Format:
```json
[
  {
    "clause_ref": "8.3.1",
    "section": "§8 Operation",
    "question": "Has a formal design and development planning procedure been established?",
    "answer": null,
    "comment": ""
  }
]
```
The wizard is the only user-facing change. Everything else is backend.

### Phase 8 — Fixture and Seed Data [ADAPT]

- [ ] Generate fixture: adapt `scripts/generate_iso27001_fixture.py` for ISO 9001 clause/requirement structure
- [ ] Load fixture: `python manage.py loaddata reports/fixtures/iso9001.json`
- [ ] Test with mock provider first: `LLM_PROVIDER=mock python manage.py test`

### Phase 9 — End-to-End Test [COPY + ADAPT test data]

Adapt `end_to_end_test.py`:
- [ ] Change `--service-type` options to match new report types
- [ ] Create a sample `wizard_answers` payload using the new clause refs
- [ ] Run: `python end_to_end_test.py --service-type readiness_assessment --preview`

---

## 12. Frequently Asked Questions

**Q: Why is the Executive Summary generated after clause findings, not before?**  
A: Because the executive summary references actual finding counts (e.g. "2 Major Non-Conformities were identified"). If generated first, these numbers would be invented. By running it last, the LLM receives a structured digest of all real findings.

**Q: Why is the Conclusion the very last thing generated, after scoring?**  
A: The conclusion quotes the compliance percentage (e.g. "72.4% — APPROVED_WITH_GAPS"). If generated before scoring, the LLM would have to estimate the score, introducing inaccuracy. Post-scoring, the exact number is injected into the prompt as a verified fact.

**Q: What happens if the LLM returns invalid JSON for a clause group?**  
A: `_parse_findings_json()` catches the parse failure, logs a warning, and stores the raw text with an empty parsed list. The section still saves to the database. The DOCX builder falls back to prose rendering. The pipeline continues without interruption.

**Q: What if pgvector is unavailable?**  
A: `VECTOR_STORE_AVAILABLE` is flipped to `False` and `retrieve()` returns `[]`. The pipeline continues with zero RAG context — the LLM generates ungrounded prose. Quality degrades but the report still completes.

**Q: Can the system handle multiple standards simultaneously?**  
A: Yes. The `Report.standard` FK drives routing. Adding a new standard means adding: a `Standard` row, its fixtures, a new agent class, and routing logic in the pipeline. All other infrastructure (RAG, scoring, DOCX) is reused.

**Q: Why use ONNX for the embedding model instead of sentence-transformers?**  
A: ONNX + the HuggingFace `tokenizers` library (Rust-based) has zero PyTorch dependency. This reduces the Docker image by ~2GB and cold-start time by ~8 seconds. The same `all-MiniLM-L6-v2` model, same 384-dim output, but much lighter runtime.

**Q: How do I add a new LLM provider?**  
A: Create a class in `providers.py` with a `generate(messages: list[dict]) -> str` method, add a branch in `get_provider()`, and set `LLM_PROVIDER=yourprovider` in `.env`. No other changes needed.

**Q: What is the `service_type` field for?**  
A: It controls which flavour of report is generated. `audit_report` uses audit terminology (MaNC, MiNC, OBS, A), colour-codes, and DOCX structure. `gap_assessment` uses CIRC ratings (FI, PI, NI) and a different structure. All prompts, colour maps, and DOCX layout branch on this single field.

---

*Document authored by PSE Consulting — Internal Reference — May 2026*  
*Intended audience: Development team replicating the Report Generation architecture for Synot Pharma.*
