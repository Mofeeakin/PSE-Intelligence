"""
end_to_end_test.py — Automated ISO 27001 report generation & export test.

Usage:
    python end_to_end_test.py [--service-type gap_assessment|audit_report]
                              [--base-url http://localhost:8000]
                              [--org acme|sterling]
                              [--rag-check]
                              [--preview]

What this does:
  1. (Optional) RAG diagnostic — queries the retrieval API for 3 sample clauses
  2. Authenticates (creates a test user if needed)
  3. Creates a report with full pre-filled wizard answers — no manual input required
  4. Polls the status endpoint until the pipeline completes
  5. Inspects sections (word count + optional content preview)
  6. Downloads the DOCX export and saves it next to this script

Run the Django dev server first:
    cd Report_Backend
    python manage.py runserver
"""
import sys
import time
import json
import argparse
import urllib.request
import urllib.error
import urllib.parse

# ── CLI args ──────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="E2E test for PSE Compliance report generation.")
parser.add_argument("--service-type", default="gap_assessment",
                    choices=["audit_report", "gap_assessment"],
                    help="Report type to generate (default: gap_assessment)")
parser.add_argument("--base-url", default="http://localhost:8000",
                    help="Backend base URL (default: http://localhost:8000)")
parser.add_argument("--username", default="testuser", help="Test account username")
parser.add_argument("--password", default="testpass123!", help="Test account password")
parser.add_argument("--org", default="acme", choices=["acme", "sterling"],
                    help="Organisation profile to use: acme (default) or sterling (Sterling Bank)")
parser.add_argument("--rag-check", action="store_true",
                    help="Run RAG diagnostic queries before creating the report")
parser.add_argument("--preview", action="store_true",
                    help="Print first 400 chars of each section after generation")
args = parser.parse_args()

BASE = args.base_url.rstrip("/")
SERVICE_TYPE = args.service_type

# ── Helpers ───────────────────────────────────────────────────────────────────
def request(method: str, path: str, data=None, token: str = None) -> dict:
    url = f"{BASE}{path}"
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Token {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        print(f"  HTTP {e.code} at {path}: {body_text[:500]}")
        raise


def download_file(path: str, dest: str, token: str):
    url = f"{BASE}{path}"
    print(f"  Downloading from {url} …")
    req = urllib.request.Request(url, headers={"Authorization": f"Token {token}"})
    with urllib.request.urlopen(req) as resp:
        with open(dest, "wb") as fh:
            fh.write(resp.read())
    print(f"  Saved: {dest}")


def separator(title: str):
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print('─' * 60)


# ── Organisation profiles ─────────────────────────────────────────────────────
ORG_PROFILES = {
    "acme": {
        "organisation": "Acme Financial Services Ltd",
        "department": "Information Security & Technology",
        "scope": (
            "The ISMS scope covers all digital payment processing platforms, associated APIs, "
            "supporting infrastructure (cloud and on-premises), and the teams responsible for their "
            "operation, maintenance, and security within Acme Financial Services Ltd."
        ),
    },
    "sterling": {
        "organisation": "Sterling Bank Plc",
        "department": "Cybersecurity & Technology Risk",
        "scope": (
            "The ISMS scope encompasses Sterling Bank's digital banking channels (mobile and internet "
            "banking), core banking system interfaces, payment gateways, and all supporting IT "
            "infrastructure operated by or on behalf of Sterling Bank Plc within Nigeria and "
            "international correspondent banking environments. In-scope assets include data centres "
            "(primary and DR), cloud-hosted services (AWS / Azure), 3rd-party fintech integrations, "
            "ATM network management systems, and all staff and contractors with privileged access."
        ),
    },
}

ORG = ORG_PROFILES[args.org]

# ── Full pre-filled wizard answers ───────────────────────────────────────────
# 32 clause-mapped questions covering ISO 27001:2022 §4–§10 + Annex A
# Mix of yes/partial/no answers to generate realistic gaps
WIZARD_ANSWERS = [
    # §4 — Context
    {"id": "q4-1", "clause_ref": "4.1", "section": "§4 Context", "theme": "Context",
     "question": "Has the organisation identified relevant internal and external issues affecting the ISMS?",
     "answer": "yes", "comment": "Annual context review conducted; documented in ISMS scope document."},
    {"id": "q4-2", "clause_ref": "4.2", "section": "§4 Context", "theme": "Context",
     "question": "Have interested parties and their requirements been identified and documented?",
     "answer": "partial", "comment": "Regulatory stakeholders identified; customer requirements partially documented."},
    {"id": "q4-3", "clause_ref": "4.3", "section": "§4 Context", "theme": "Context",
     "question": "Is the ISMS scope formally defined, documented, and approved?",
     "answer": "yes", "comment": "Scope covers all digital payment processing systems and supporting infrastructure."},

    # §5 — Leadership
    {"id": "q5-1", "clause_ref": "5.1", "section": "§5 Leadership", "theme": "Leadership",
     "question": "Does top management demonstrate leadership and commitment to the ISMS?",
     "answer": "partial", "comment": "CISO appointed; board-level engagement exists but ISMS reporting frequency is quarterly rather than monthly."},
    {"id": "q5-2", "clause_ref": "5.2", "section": "§5 Leadership", "theme": "Leadership",
     "question": "Is an information security policy established, communicated, and approved by management?",
     "answer": "yes", "comment": "IS Policy v2.1 approved by board December 2024; published on intranet."},
    {"id": "q5-3", "clause_ref": "5.3", "section": "§5 Leadership", "theme": "Leadership",
     "question": "Are information security roles, responsibilities, and authorities assigned and communicated?",
     "answer": "no", "comment": "RACI matrix exists for IT but no formal IS responsibility assignments below CISO level."},

    # §6 — Planning
    {"id": "q6-1", "clause_ref": "6.1.1", "section": "§6 Planning", "theme": "Risk",
     "question": "Has the organisation addressed risks and opportunities when planning for the ISMS?",
     "answer": "partial", "comment": "Risk register exists but has not been reviewed in 14 months."},
    {"id": "q6-2", "clause_ref": "6.1.2", "section": "§6 Planning", "theme": "Risk",
     "question": "Is a formal information security risk assessment process defined and implemented?",
     "answer": "no", "comment": "No documented risk assessment methodology; ad-hoc process only."},
    {"id": "q6-3", "clause_ref": "6.1.3", "section": "§6 Planning", "theme": "Risk",
     "question": "Is a risk treatment plan in place, with Annex A controls selected and documented?",
     "answer": "no", "comment": "Statement of Applicability drafted but risk treatment plan not formally approved."},
    {"id": "q6-4", "clause_ref": "6.2", "section": "§6 Planning", "theme": "Risk",
     "question": "Are information security objectives established and documented at relevant functions?",
     "answer": "partial", "comment": "High-level IS objectives exist; department-level objectives not yet cascaded."},

    # §7 — Support
    {"id": "q7-1", "clause_ref": "7.1", "section": "§7 Support", "theme": "Support",
     "question": "Has the organisation determined and provided necessary resources for the ISMS?",
     "answer": "yes", "comment": "Dedicated security budget allocated; tooling and personnel confirmed for FY2025."},
    {"id": "q7-2", "clause_ref": "7.2", "section": "§7 Support", "theme": "Support",
     "question": "Is the competence of persons doing IS work determined and documented?",
     "answer": "partial", "comment": "IT team competency matrix exists; business unit staff competency not assessed."},
    {"id": "q7-3", "clause_ref": "7.3", "section": "§7 Support", "theme": "Support",
     "question": "Are personnel aware of the IS policy, their contribution, and the implications of non-conformity?",
     "answer": "no", "comment": "Annual awareness training not completed; last training was 22 months ago."},
    {"id": "q7-4", "clause_ref": "7.4", "section": "§7 Support", "theme": "Support",
     "question": "Is an internal and external communication process for the ISMS defined?",
     "answer": "yes", "comment": "Communication plan documented; incident communication procedures operational."},
    {"id": "q7-5", "clause_ref": "7.5", "section": "§7 Support", "theme": "Support",
     "question": "Is documented information required by the standard created, controlled, and maintained?",
     "answer": "partial", "comment": "Core policies documented; control evidence not consistently maintained in central repository."},

    # §8 — Operation
    {"id": "q8-1", "clause_ref": "8.1", "section": "§8 Operation", "theme": "Operations",
     "question": "Are operational processes planned, implemented, and controlled to meet IS requirements?",
     "answer": "yes", "comment": "Change management and incident processes operational; reviewed annually."},
    {"id": "q8-2", "clause_ref": "8.2", "section": "§8 Operation", "theme": "Operations",
     "question": "Is a formal information security risk assessment conducted at planned intervals or when changes occur?",
     "answer": "no", "comment": "Risk assessments are not triggered by significant changes; no scheduled cadence."},
    {"id": "q8-3", "clause_ref": "8.3", "section": "§8 Operation", "theme": "Operations",
     "question": "Is a risk treatment plan implemented and progress tracked?",
     "answer": "no", "comment": "Treatment actions identified but no tracking mechanism or owner assigned."},

    # §9 — Performance Evaluation
    {"id": "q9-1", "clause_ref": "9.1", "section": "§9 Evaluation", "theme": "Monitoring",
     "question": "Is IS performance monitoring and measurement in place with defined metrics?",
     "answer": "partial", "comment": "SIEM in place; IS KPIs defined but not reported to management."},
    {"id": "q9-2", "clause_ref": "9.2", "section": "§9 Evaluation", "theme": "Monitoring",
     "question": "Is an internal audit programme defined and implemented for the ISMS?",
     "answer": "no", "comment": "No internal IS audit conducted in the current audit cycle."},
    {"id": "q9-3", "clause_ref": "9.3", "section": "§9 Evaluation", "theme": "Monitoring",
     "question": "Does management review the ISMS at planned intervals using defined inputs?",
     "answer": "partial", "comment": "One management review conducted this year; frequency target is semi-annual."},

    # §10 — Improvement
    {"id": "q10-1", "clause_ref": "10.1", "section": "§10 Improvement", "theme": "Improvement",
     "question": "Are nonconformities identified, corrective actions raised, and root causes addressed?",
     "answer": "partial", "comment": "Corrective action register exists; root cause analysis not always performed."},
    {"id": "q10-2", "clause_ref": "10.2", "section": "§10 Improvement", "theme": "Improvement",
     "question": "Is continual improvement of ISMS suitability, adequacy, and effectiveness pursued?",
     "answer": "partial", "comment": "Improvement actions identified in management review but formal tracking absent."},

    # Annex A — Selected controls
    {"id": "qA5-1", "clause_ref": "A.5.1", "section": "Annex A — Organisational", "theme": "Policy",
     "question": "Are information security policies defined, approved, and communicated?",
     "answer": "yes", "comment": "Policy suite in place covering acceptable use, access control, BYOD, incident."},
    {"id": "qA5-2", "clause_ref": "A.5.3", "section": "Annex A — Organisational", "theme": "Policy",
     "question": "Is segregation of duties applied for conflicting responsibilities?",
     "answer": "no", "comment": "Single admin accounts used for both privileged access and audit functions."},
    {"id": "qA6-1", "clause_ref": "A.6.1", "section": "Annex A — People", "theme": "HR",
     "question": "Are background verification checks conducted for new employees and contractors?",
     "answer": "yes", "comment": "Pre-employment checks conducted via third-party provider; contractors screened."},
    {"id": "qA7-1", "clause_ref": "A.7.1", "section": "Annex A — Physical", "theme": "Physical",
     "question": "Are physical security perimeters defined and implemented for sensitive areas?",
     "answer": "yes", "comment": "Data centre access requires multi-factor physical authentication; CCTV monitored."},
    {"id": "qA8-1", "clause_ref": "A.8.2", "section": "Annex A — Technology", "theme": "Access",
     "question": "Are privileged access rights managed, restricted, and regularly reviewed?",
     "answer": "partial", "comment": "PAM tool deployed; quarterly review conducted but administrator accounts not fully onboarded."},
    {"id": "qA8-2", "clause_ref": "A.8.7", "section": "Annex A — Technology", "theme": "Malware",
     "question": "Is protection against malware implemented and actively managed?",
     "answer": "yes", "comment": "EDR deployed across all endpoints; signature updates automated; monthly threat review."},
    {"id": "qA8-3", "clause_ref": "A.8.13", "section": "Annex A — Technology", "theme": "Backup",
     "question": "Are information backup procedures implemented and tested?",
     "answer": "partial", "comment": "Daily backups run; recovery tests conducted annually — restoration success rate not tracked."},
    {"id": "qA8-4", "clause_ref": "A.8.15", "section": "Annex A — Technology", "theme": "Logging",
     "question": "Are logs of user activities, exceptions, faults, and security events produced and retained?",
     "answer": "no", "comment": "Application-layer logging inconsistent; no central log management for non-critical systems."},
    {"id": "qA8-5", "clause_ref": "A.8.25", "section": "Annex A — Technology", "theme": "SDLC",
     "question": "Are secure development lifecycle principles applied to software development?",
     "answer": "partial", "comment": "SAST tooling integrated in CI/CD; code review policy exists but not enforced for all repositories."},
]


# ── Step 1: Authenticate ──────────────────────────────────────────────────────
separator("Step 1 — Authentication")
print(f"  Registering / logging in as '{args.username}' …")
try:
    auth = request("POST", "/api/auth/register/", {
        "username": args.username, "password": args.password,
        "email": f"{args.username}@e2e-test.local"
    })
    token = auth["token"]
    print(f"  Registered. Token: {token[:12]}…")
except Exception:
    try:
        auth = request("POST", "/api/auth/login/", {
            "username": args.username, "password": args.password
        })
        token = auth["token"]
        print(f"  Logged in. Token: {token[:12]}…")
    except Exception as e:
        print(f"\n  FATAL: Cannot authenticate. Is the server running at {BASE}?")
        sys.exit(1)


# ── Step 1b (optional): RAG diagnostic ───────────────────────────────────────
if args.rag_check:
    separator("Step 1b — RAG Diagnostic")
    SAMPLE_QUERIES = [
        ("6.1.2", "information security risk assessment process methodology"),
        ("9.2",   "internal audit programme ISMS requirements"),
        ("A.8.15","logging monitoring events retention security"),
    ]
    print("  Running 3 sample retrieval queries against the vector store …\n")
    for clause, query in SAMPLE_QUERIES:
        print(f"  Clause {clause} | Query: \"{query}\"")
        try:
            result = request(
                "POST", "/api/rag/retrieve/",
                {"query": query, "clause_refs": [clause], "standard_ref": "ISO27001", "k": 3},
                token=token,
            )
            chunks = result.get("chunks", [])
            if chunks:
                for i, c in enumerate(chunks, 1):
                    score = c.get("score", 0)
                    source = c.get("metadata", {}).get("clause_ref", "?")
                    snippet = c.get("content", "")[:120].replace("\n", " ")
                    print(f"    [{i}] score={score:.3f}  ref={source}  \"{snippet}…\"")
            else:
                print("    (no chunks returned — check RAG pipeline)")
        except Exception as exc:
            print(f"    WARN: RAG endpoint error — {exc} (endpoint may not be exposed)")
        print()


# ── Step 2: Create report ─────────────────────────────────────────────────────
separator("Step 2 — Create report")
title_suffix = "Gap Assessment" if SERVICE_TYPE == "gap_assessment" else "Internal Audit"
report_payload = {
    "title": f"E2E Test — ISO 27001 {title_suffix} Report [{time.strftime('%Y-%m-%d %H:%M')}]",
    "organisation": ORG["organisation"],
    "department": ORG["department"],
    "standard_code": "ISO27001",
    "scope": ORG["scope"],
    "service_type": SERVICE_TYPE,
    "wizard_answers": WIZARD_ANSWERS,
    "submissions": [],
}

print(f"  Service type : {SERVICE_TYPE}")
print(f"  Wizard answers: {len(WIZARD_ANSWERS)} questions pre-filled")
print(f"  Posting to {BASE}/api/reports/ …")

report = request("POST", "/api/reports/", report_payload, token)
report_id = report["id"]
print(f"  Report created. ID={report_id}, status={report['status']}")


# ── Step 3: Poll until complete ───────────────────────────────────────────────
separator("Step 3 — Polling pipeline progress")
TIMEOUT = 300   # seconds
INTERVAL = 4    # poll every 4 s
elapsed = 0
terminal_statuses = {"Completed", "Failed"}

while elapsed < TIMEOUT:
    status_data = request("GET", f"/api/reports/{report_id}/status/", token=token)
    pct = status_data.get("progress_pct", 0)
    stage = status_data.get("current_stage", "…")
    status = status_data.get("status", "")
    print(f"  [{elapsed:>3}s] {pct:>3}% | {stage:<30} | {status}")

    if status in terminal_statuses:
        break
    time.sleep(INTERVAL)
    elapsed += INTERVAL
else:
    print("\n  TIMEOUT: Pipeline did not complete within 5 minutes.")
    sys.exit(1)

if status == "Failed":
    detail = request("GET", f"/api/reports/{report_id}/", token=token)
    print(f"\n  Pipeline FAILED: {detail.get('error_message', 'unknown error')}")
    sys.exit(1)

print(f"\n  Pipeline completed successfully in ~{elapsed}s")


# ── Step 4: Inspect sections ──────────────────────────────────────────────────
separator("Step 4 — Section summary")
detail = request("GET", f"/api/reports/{report_id}/", token=token)
for sec in detail.get("sections", []):
    content = sec.get("content", "")
    word_count = len(content.split())
    print(f"  [{sec.get('order', '?')}] {sec['section_name']:<30} {word_count:>5} words")
    if args.preview and content:
        is_json_section = content.startswith("__JSON__:")
        if is_json_section:
            try:
                findings = json.loads(content[len("__JSON__:"):])
                print(f"       → JSON table: {len(findings)} finding(s)")
                for f in findings[:2]:
                    print(f"         {f.get('clause_ref','?'):<10} {str(f.get('status') or f.get('circ_rating','?')):<25} {str(f.get('audit_finding') or f.get('current_state',''))[:60]}")
            except Exception:
                print(f"       → (JSON parse error)")
        else:
            preview = content[:400].replace("\n", " ")
            print(f"       → {preview}…")

score_data = detail.get("compliance_score") or {}
print(f"\n  Compliance score : {score_data.get('total_score', 'N/A')}%")
print(f"  Status           : {score_data.get('status', 'N/A')}")

gap_count = len(detail.get("gaps", []))
print(f"  Gaps identified  : {gap_count}")
for gap in detail.get("gaps", [])[:8]:
    req = gap.get("requirement")
    req_code = req.get("code", "?") if isinstance(req, dict) else str(req)
    rating = gap.get("rating", "—")
    severity = gap.get("severity", "?")
    print(f"    [{severity.upper():>6}] {req_code:<10} {rating:<25} {gap['issue'][:60]}")


# ── Step 5: Export DOCX ───────────────────────────────────────────────────────
separator("Step 5 — Export DOCX")
safe_title = f"report_{report_id}_{SERVICE_TYPE}.docx"
download_file(f"/api/reports/{report_id}/export/?format=docx", safe_title, token)

print(f"\n{'═' * 60}")
print(f"  ✓  End-to-end test PASSED")
print(f"  Report ID   : {report_id}")
print(f"  Organisation: {ORG['organisation']}")
print(f"  Service type: {SERVICE_TYPE}")
print(f"  DOCX output : {safe_title}")
print(f"{'═' * 60}\n")
