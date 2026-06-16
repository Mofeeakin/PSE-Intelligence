# PSE Compliance Intelligence — End-to-End Report Generation Guide

**Use this document as your exact fill-in script when running the wizard UI.**
A fictional company — *Nexora Technologies Ltd* — is used throughout so the AI agents have realistic, consistent context to work with.

---

## Pre-flight

| Item | Value |
|---|---|
| App URL | `https://pse-compliance-app.onrender.com` (or `http://localhost:5173`) |
| Login username | `admin` |
| Login password | `Admin@PSE2026` |

Log in, confirm you land on the **System Control** dashboard, then click **New Report** (or navigate to `/wizard`).

---

## Step 1 — Type

### Report Type
Click the card:

> **ISO 27001**
> Information Security Management — Annex A controls.

### Service Type
Click the card:

> **Internal Audit Report**
> Formal audit findings, conformity/non-conformity classification, clause citations.

Click **Continue →**

---

## Step 2 — Basics

| Field | Value to enter |
|---|---|
| **Report title** | `Nexora Technologies Ltd — ISO 27001 Internal Audit Report 2026` |
| **Organization name** | `Nexora Technologies Ltd` |
| **Department** | `Information Security & Compliance` |
| **Report date** | *(auto-filled — do not change)* |

Click **Continue →**

---

## Step 3 — Scope

Paste the following into the scope textarea:

```
In-scope:
- All production cloud infrastructure hosted on AWS (ap-west-1 region), including EC2 instances, RDS databases, S3 buckets, and associated IAM configurations.
- Corporate offices at Lagos HQ and Abuja satellite office, including on-premise servers, workstations, and network equipment.
- Customer-facing web application (app.nexora.io) and internal employee portal.
- Third-party integrations: Salesforce CRM, Paystack payment gateway, and Google Workspace.
- All personnel with access to information assets classified as Confidential or above.
- Information security policies, procedures, and controls documented under the ISMS v3.2 (approved March 2026).

Out-of-scope:
- Subsidiary entities Nexora Logistics Ltd and Nexora Foundation (separate ISMS programmes).
- Third-party systems where Nexora has no administrative control.
- Personal devices not enrolled in the Mobile Device Management (MDM) programme.
```

Click **Continue →**

---

## Step 4 — Evidence

> **This step is optional for the test run.**
> The wizard allows file upload (PDF, DOCX, PNG, LOG, CSV). You can skip it by clicking **Next: Questionnaire →** without uploading anything — the AI will still generate the report using the questionnaire answers and scope alone.

If you want to upload something for a richer test, use any PDF or DOCX (e.g. a blank Word document saved as `nexora_isms_policy.docx`), tag it as **Policy**, and click upload.

Click **Next: Questionnaire →**

---

## Step 5 — Questionnaire

Work through each section. Answers are designed to reflect a *partially mature* ISMS — some controls in place, realistic gaps — so the AI produces meaningful findings rather than a perfect or trivially failing report.

**Instructions:** For each question, click **Yes** or **No**, set the risk slider, and optionally add a note. Collapse each section after completing it.

---

### §4 Context

| Clause | Question (abbreviated) | Answer | Risk | Note |
|---|---|---|---|---|
| 4.1 | Identified internal/external issues relevant to ISMS? | **Yes** | 2 | Documented in ISMS Context Register v2.1 |
| 4.2 | Interested parties and requirements formally identified? | **Yes** | 2 | Stakeholder register reviewed annually |
| 4.3 | ISMS scope formally documented and approved? | **Yes** | 1 | Scope approved by CISO, March 2026 |

---

### §5 Leadership

| Clause | Question (abbreviated) | Answer | Risk | Note |
|---|---|---|---|---|
| 5.1 | Demonstrable top management commitment? | **Yes** | 2 | CEO signed ISMS charter; budget allocated |
| 5.2 | Documented information security policy approved and communicated? | **Yes** | 1 | Policy published on intranet, annual acknowledgement required |
| 5.3 | IS roles, responsibilities, and authorities defined? | **Yes** | 2 | RACI matrix in place; reviewed Q1 2026 |

---

### §6 Planning

| Clause | Question (abbreviated) | Answer | Risk | Note |
|---|---|---|---|---|
| 6.1.2 | Formal risk assessment methodology documented? | **Yes** | 2 | ISO 27005 aligned methodology, approved 2025 |
| 6.1.2 | Risk assessment performed within last 12 months? | **Yes** | 2 | Last assessment: February 2026 |
| 6.1.3 | Risk treatment plan with owners and target dates? | **No** | 4 | Treatment plan exists but several items are overdue; owners not updated since Q3 2025 |
| 6.1.3 | Statement of Applicability documented with justifications? | **Yes** | 2 | SoA v4.0, 114 controls reviewed |
| 6.2 | Measurable IS objectives defined and monitored? | **No** | 3 | Objectives defined but no formal monitoring dashboard; reported ad hoc only |

---

### §7 Support

| Clause | Question (abbreviated) | Answer | Risk | Note |
|---|---|---|---|---|
| 7.2 | Competency requirements defined and verified? | **Yes** | 2 | Job descriptions updated; training records maintained in HR system |
| 7.3 | Regular IS awareness training for all personnel? | **No** | 3 | Last company-wide training was October 2024; new joiner training automated but refreshers lapsed |
| 7.5 | ISMS documentation controlled and version-managed? | **Yes** | 1 | SharePoint document management with version history and access controls |

---

### §8 Operation

| Clause | Question (abbreviated) | Answer | Risk | Note |
|---|---|---|---|---|
| 8.2 | Risk assessments repeated on significant change? | **No** | 4 | No formal change-triggered risk review process; last two infrastructure migrations were not assessed |
| 8.3 | Risk treatment plans actively implemented and monitored? | **No** | 4 | 11 of 34 treatment actions remain open past due date |
| 8.1 | Annex A controls documented, implemented, and tested? | **Yes** | 3 | Controls documented; testing conducted for 80% of applicable controls |

---

### §9 Performance

| Clause | Question (abbreviated) | Answer | Risk | Note |
|---|---|---|---|---|
| 9.1 | IS metrics collected and reported to management? | **No** | 3 | Metrics collected informally; no structured dashboard or formal report to board |
| 9.2 | Internal ISMS audits conducted at least annually? | **Yes** | 1 | Last internal audit: January 2026, conducted by external consultant |
| 9.3 | Management review held at planned intervals? | **Yes** | 2 | Annual management review held February 2026; minutes documented |

---

### §10 Improvement

| Clause | Question (abbreviated) | Answer | Risk | Note |
|---|---|---|---|---|
| 10.1 | Nonconformities documented, root-caused, and corrective actions verified? | **No** | 3 | NCR register exists but 6 items have no root-cause analysis recorded |
| 10.2 | Active continual improvement process for ISMS? | **Yes** | 2 | Improvement register maintained; reviewed quarterly by CISO |

---

### Annex A — Organizational

| Clause | Question (abbreviated) | Answer | Risk | Note |
|---|---|---|---|---|
| 5.1 | IS policies reviewed at planned intervals? | **Yes** | 1 | Annual review cycle in place |
| 5.15 | Formal access control policy with least-privilege enforced? | **No** | 5 | Access control policy exists but privileged account review not performed in 18 months; several ex-employee accounts found active |
| 5.24 | Formal incident management process with SLAs? | **Yes** | 2 | IR playbook v2.3 in place; P1 SLA: 4-hour response |
| 5.19 | Supplier IS requirements formally defined and monitored? | **No** | 4 | Supplier register exists; only 3 of 11 critical suppliers have active IS assessments |
| 5.29 | Documented and tested business continuity plan? | **No** | 4 | BCP documented but last test was March 2024; annual test requirement not met |

---

### Annex A — People

| Clause | Question (abbreviated) | Answer | Risk | Note |
|---|---|---|---|---|
| 6.1 | Background checks performed pre-employment? | **Yes** | 2 | DBS and reference checks completed for all permanent staff; contract staff process under review |

---

### Annex A — Physical

| Clause | Question (abbreviated) | Answer | Risk | Note |
|---|---|---|---|---|
| 7.1 | Physical security perimeters, entry controls, clear-desk enforced? | **Yes** | 2 | Badge access at HQ; clean-desk policy in acceptable use policy |

---

### Annex A — Technology

| Clause | Question (abbreviated) | Answer | Risk | Note |
|---|---|---|---|---|
| 8.24 | Cryptographic controls for data in transit and at rest? | **Yes** | 2 | TLS 1.3 in transit; AES-256 at rest for all classified data |
| 8.20 | Network segmentation documented and enforced? | **Yes** | 3 | Segmentation in place; last review Q4 2025 — some legacy subnets not yet migrated |
| 8.8 | Vulnerability monitoring and patch management with SLAs? | **No** | 4 | Nessus scans run monthly but patch SLAs are not formally documented; critical patch backlog exists |

---

## Final Step — Generate

After completing all questionnaire sections, click:

> **Generate Report** ✦

The wizard will POST to `/api/reports/` then redirect you to the processing screen (`/processing/{id}`). The AI pipeline runs in the following order:

```
Router → RAG Retrieval → ISO Agent → Conflict Checker → Validator → Scorer
```

Expected duration: **2–5 minutes** depending on LLM provider and server load.

---

## What to Expect

### Processing screen
Watch the live log stream. You should see stage transitions:

```
[Router]          Routing request → ISO 27001 Audit pipeline
[RAG]             Retrieved 24 relevant chunks from knowledge base
[ISO Agent]       Drafting executive summary, findings, conclusions…
[Conflict Checker] Checking cross-clause consistency…
[Validator]       Flagging gaps and missing evidence…
[Scorer]          Computing compliance score…
```

### Report viewer (`/reports/{id}`)
Once status reaches **Completed**:

- Compliance score visible (expect **55–70%** given the deliberate gaps above)
- Sections: Executive Summary, Audit Criteria, Methodology, Findings by clause, Conclusions, Recommendations
- No `§` symbols — all rendered as "Clause X.X"
- **Submit for Review** button visible (staff workflow)
- **Export** button → download DOCX or PDF

### DOCX quality checks
Open the exported `.docx` in Microsoft Word:

1. Press **F9** to update fields → TOC rebuilds with real page numbers
2. Check TOC matches actual headings 1:1
3. Search (`Ctrl+F`) for `§` → should find zero results
4. If a logo was uploaded via the Logo Settings panel, verify it appears on the configured pages

---

## Approximate Answers Summary

| Category | Yes | No | Gap items |
|---|---|---|---|
| §4–§5 Core ISMS | 6 | 0 | None |
| §6–§8 Planning & Operation | 5 | 5 | Risk treatment, change assessment, monitoring |
| §9–§10 Performance & Improvement | 3 | 2 | NCR root-cause, metrics dashboard |
| Annex A Controls | 6 | 5 | Access control, BCP test, patch SLAs, supplier review |
| **Total** | **20** | **12** | **12 gaps flagged** |

---

## Credentials Summary

| Account | Username | Password | Role |
|---|---|---|---|
| Super Admin | `admin` | `Admin@PSE2026` | Full access |

To create a Consultant account for testing the auditor workflow, go to **Users & Roles → + Create User**, set role to **Consultant**, and log in with the generated credentials.
