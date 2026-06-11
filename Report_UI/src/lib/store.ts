import { create } from "zustand";
import { persist } from "zustand/middleware";
import { reports as reportsApi } from "./api-client";
import type { ReportDetail, ReportSummary } from "./api-client";
import type {
  Report, ReportType, ServiceType, AgentName, EvidenceFile, QuestionnaireAnswer,
  AgentLogEntry, ReportSection, ConflictRecord, ValidationIssue, ScoreBreakdown,
} from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

interface WizardQuestion {
  question: string;
  clause_ref: string;
  section: string;
  theme: string;
}

const ISO_27001_QUESTIONS: WizardQuestion[] = [
  // §4 Context
  { question: "Has the organization identified and documented internal and external issues relevant to the ISMS?", clause_ref: "4.1", section: "§4 Context", theme: "Context" },
  { question: "Have interested parties and their information security requirements been formally identified?", clause_ref: "4.2", section: "§4 Context", theme: "Context" },
  { question: "Is the ISMS scope formally documented, approved, and available as documented information?", clause_ref: "4.3", section: "§4 Context", theme: "Context" },
  // §5 Leadership
  { question: "Is there demonstrable top management commitment to the ISMS (signed policy, allocated resources, active sponsorship)?", clause_ref: "5.1", section: "§5 Leadership", theme: "Leadership" },
  { question: "Is there a documented information security policy approved by top management and communicated to all personnel?", clause_ref: "5.2", section: "§5 Leadership", theme: "Leadership" },
  { question: "Are information security roles, responsibilities, and authorities clearly defined and communicated?", clause_ref: "5.3", section: "§5 Leadership", theme: "Leadership" },
  // §6 Planning
  { question: "Is a formal risk assessment methodology documented with defined risk acceptance criteria?", clause_ref: "6.1.2", section: "§6 Planning", theme: "Planning" },
  { question: "Has a risk assessment been performed within the last 12 months, with results documented?", clause_ref: "6.1.2", section: "§6 Planning", theme: "Planning" },
  { question: "Is there a risk treatment plan that assigns owners, target dates, and records accepted residual risk?", clause_ref: "6.1.3", section: "§6 Planning", theme: "Planning" },
  { question: "Is the Statement of Applicability (SoA) documented, listing all Annex A controls with inclusion/exclusion justifications?", clause_ref: "6.1.3", section: "§6 Planning", theme: "Planning" },
  { question: "Are measurable information security objectives defined, monitored, and communicated to relevant functions?", clause_ref: "6.2", section: "§6 Planning", theme: "Planning" },
  // §7 Support
  { question: "Are competency requirements for information security roles defined and personnel verified as competent?", clause_ref: "7.2", section: "§7 Support", theme: "Support" },
  { question: "Do all personnel receive regular information security awareness training relevant to their role?", clause_ref: "7.3", section: "§7 Support", theme: "Support" },
  { question: "Is ISMS documentation controlled, version-managed, and protected from unauthorised access?", clause_ref: "7.5", section: "§7 Support", theme: "Support" },
  // §8 Operation
  { question: "Are risk assessments repeated when significant changes occur to systems, processes, or the threat landscape?", clause_ref: "8.2", section: "§8 Operation", theme: "Operation" },
  { question: "Are risk treatment plans actively implemented and their effectiveness monitored?", clause_ref: "8.3", section: "§8 Operation", theme: "Operation" },
  { question: "Are Annex A controls documented in procedures, implemented, and periodically tested for effectiveness?", clause_ref: "8.1", section: "§8 Operation", theme: "Operation" },
  // §9 Performance
  { question: "Are information security metrics collected, analysed, and reported to management at planned intervals?", clause_ref: "9.1", section: "§9 Performance", theme: "Performance" },
  { question: "Are internal ISMS audits conducted at least annually by competent, impartial auditors?", clause_ref: "9.2", section: "§9 Performance", theme: "Performance" },
  { question: "Does management formally review the ISMS at planned intervals with documented outputs?", clause_ref: "9.3", section: "§9 Performance", theme: "Performance" },
  // §10 Improvement
  { question: "Are nonconformities documented, root-cause analysed, corrective actions implemented, and effectiveness verified?", clause_ref: "10.1", section: "§10 Improvement", theme: "Improvement" },
  { question: "Is there an active process for continual improvement of the ISMS suitability, adequacy, and effectiveness?", clause_ref: "10.2", section: "§10 Improvement", theme: "Improvement" },
  // Annex A
  { question: "Are information security policies reviewed at planned intervals or when significant changes occur?", clause_ref: "5.1", section: "Annex A — Organizational", theme: "Organizational" },
  { question: "Are background verification checks performed on candidates prior to employment?", clause_ref: "6.1", section: "Annex A — People", theme: "People" },
  { question: "Are physical security perimeters, entry controls, and clear-desk/clear-screen policies implemented?", clause_ref: "7.1", section: "Annex A — Physical", theme: "Physical" },
  { question: "Is a formal access control policy implemented with least-privilege enforced and privileged accounts controlled?", clause_ref: "5.15", section: "Annex A — Organizational", theme: "Organizational" },
  { question: "Are cryptographic controls applied to protect sensitive data in transit and at rest?", clause_ref: "8.24", section: "Annex A — Technology", theme: "Technology" },
  { question: "Is network segmentation documented and enforced to isolate critical systems?", clause_ref: "8.20", section: "Annex A — Technology", theme: "Technology" },
  { question: "Is there a formal incident management process with defined severity classification and response SLAs?", clause_ref: "5.24", section: "Annex A — Organizational", theme: "Organizational" },
  { question: "Are software vulnerabilities monitored and a patch management process enforced with documented SLAs?", clause_ref: "8.8", section: "Annex A — Technology", theme: "Technology" },
  { question: "Are supplier and third-party information security requirements formally defined, monitored, and reviewed?", clause_ref: "5.19", section: "Annex A — Organizational", theme: "Organizational" },
  { question: "Is there a documented and tested business continuity/availability plan covering critical information systems?", clause_ref: "5.29", section: "Annex A — Organizational", theme: "Organizational" },
];

const QUESTIONS: Record<string, WizardQuestion[]> = {
  "ISO 27001": ISO_27001_QUESTIONS,
  "ISO 9001": [
    { question: "Is there a documented quality management policy?", clause_ref: "5.2", section: "§5 Leadership", theme: "Leadership" },
    { question: "Are internal audits scheduled and recorded?", clause_ref: "9.2", section: "§9 Performance", theme: "Performance" },
    { question: "Is corrective action tracked through to closure?", clause_ref: "10.2", section: "§10 Improvement", theme: "Improvement" },
    { question: "Are customer satisfaction metrics captured?", clause_ref: "9.1.2", section: "§9 Performance", theme: "Performance" },
    { question: "Is management review held at planned intervals?", clause_ref: "9.3", section: "§9 Performance", theme: "Performance" },
  ],
  "NDPA": [
    { question: "Is user consent recorded prior to data processing?", clause_ref: "Art.25", section: "Lawful Basis", theme: "Lawful Basis" },
    { question: "Are data subject rights requests handled within 30 days?", clause_ref: "Art.34", section: "Data Subject Rights", theme: "Rights" },
    { question: "Is a Data Protection Officer formally designated?", clause_ref: "Art.30", section: "Governance", theme: "Governance" },
    { question: "Are cross-border data transfers documented?", clause_ref: "Art.43", section: "Transfers", theme: "Transfers" },
    { question: "Is a record of processing activities maintained?", clause_ref: "Art.28", section: "Accountability", theme: "Accountability" },
  ],
  "PCI DSS": [
    { question: "Is cardholder data tokenized at storage?", clause_ref: "Req.3", section: "Data Protection", theme: "Data Protection" },
    { question: "Is the CDE network segmented from corporate networks?", clause_ref: "Req.1", section: "Network Security", theme: "Network" },
    { question: "Are quarterly ASV scans performed?", clause_ref: "Req.11", section: "Vulnerability Management", theme: "Testing" },
    { question: "Is key rotation documented and enforced?", clause_ref: "Req.3.7", section: "Cryptography", theme: "Cryptography" },
    { question: "Are penetration tests conducted annually?", clause_ref: "Req.11.4", section: "Vulnerability Management", theme: "Testing" },
  ],
};

export const QUESTIONS_FOR = (t: string) => QUESTIONS[t] ?? [];

// ─── Backend mapping helpers ────────────────────────────────────────────────

function _mapStdCode(code: string): ReportType {
  const m: Record<string, ReportType> = {
    ISO27001: "ISO 27001", ISO9001: "ISO 9001", NDPA: "NDPA", PCIDSS: "PCI DSS",
  };
  return m[code] || "ISO 27001";
}

function _mapAgent(t: string): AgentName {
  if (/iso/i.test(t)) return "ISO Agent";
  if (/rag/i.test(t)) return "RAG";
  if (/conflict/i.test(t)) return "Conflict Checker";
  if (/valid/i.test(t)) return "Validator";
  if (/scor/i.test(t)) return "Scorer";
  if (/router/i.test(t)) return "Router";
  return "ISO Agent";
}

function _mapSev(s: string): ValidationIssue["severity"] {
  const u = s.toUpperCase();
  if (u === "HIGH" || u === "CRITICAL") return "gap";
  if (u === "MEDIUM") return "warning";
  return "resolved";
}

function _mapDetail(d: ReportDetail): Report {
  const score: ScoreBreakdown | null = d.compliance_score ? {
    section: Math.round(d.compliance_score.section_score),
    evidence: Math.round(d.compliance_score.evidence_score),
    consistency: Math.round(d.compliance_score.consistency_score),
    final: d.compliance_score.total_score,
    status: d.compliance_score.status,
  } : null;
  return {
    id: String(d.id),
    title: d.title,
    type: _mapStdCode(d.standard.code),
    organization: d.organisation,
    department: d.department || "",
    date: d.created_at,
    scope: d.scope || "",
    evidence: [],
    questionnaire: [],
    sections: (d.sections || [])
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: String(s.id),
        title: s.section_name,
        content: s.content,
        agent: _mapAgent(s.agent_type),
        confidence: s.confidence_score,
        evidenceIds: [],
        order: s.order,
      })),
    agentLog: (d.agent_logs || []).map((l) => ({
      id: String(l.id),
      agent: _mapAgent(l.agent_type),
      message: l.message,
      ts: new Date(l.created_at).getTime(),
      prompt: l.prompt_text ?? undefined,
      output: l.output_text ?? undefined,
      durationMs: l.duration_ms ?? undefined,
      confidence: l.confidence_score,
      promptVersion: "v3.0",
    })),
    conflicts: [],
    validation: (d.gaps || []).map((g) => ({
      id: String(g.id),
      severity: _mapSev(g.severity),
      message: g.description,
    })),
    score,
    status: d.status as Report["status"],
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    promptVersion: "v3.0",
    serviceType: (d.service_type as ServiceType) || "audit_report",
  };
}

function _mapSummary(s: ReportSummary): Report {
  return {
    id: String(s.id),
    title: s.title,
    type: _mapStdCode(s.standard.code),
    organization: s.organisation,
    department: s.department || "",
    date: s.created_at,
    scope: "",
    evidence: [],
    questionnaire: [],
    sections: [],
    agentLog: [],
    conflicts: [],
    validation: [],
    score: null,
    status: s.status as Report["status"],
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    promptVersion: "v3.0",
    serviceType: (s.service_type as ServiceType) || "audit_report",
    assignedToId: s.assigned_to_id ?? null,
    assignedToName: s.assigned_to_name ?? null,
    projectId: s.project_id ?? null,
    projectName: s.project_name ?? null,
    createdByName: s.created_by_name ?? null,
  };
}

interface WizardDraft {
  type: ReportType | null;
  serviceType: ServiceType;
  title: string;
  organization: string;
  department: string;
  scope: string;
  evidence: EvidenceFile[];
  questionnaire: QuestionnaireAnswer[];
}

const emptyDraft = (): WizardDraft => ({
  type: null, serviceType: "audit_report", title: "", organization: "", department: "",
  scope: "", evidence: [], questionnaire: [],
});

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "super_admin" | "sub_admin" | "user";
}

interface State {
  authToken: string | null;
  currentUser: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;
  reports: Report[];
  draft: WizardDraft;
  setDraft: (patch: Partial<WizardDraft>) => void;
  resetDraft: () => void;
  addEvidence: (files: Omit<EvidenceFile, "id" | "uploadedAt">[]) => void;
  removeEvidence: (id: string) => void;
  setAnswer: (idx: number, patch: Partial<QuestionnaireAnswer>) => void;
  initQuestionnaire: (type: ReportType) => void;
  generate: () => string; // returns id
  appendLog: (id: string, entry: Omit<AgentLogEntry, "id" | "ts">) => void;
  finalize: (id: string, data: {
    sections: ReportSection[]; conflicts: ConflictRecord[];
    validation: ValidationIssue[]; score: ScoreBreakdown;
  }) => void;
  revalidate: (id: string) => void;
  rescore: (id: string) => void;
  getReport: (id: string) => Report | undefined;
  loadReports: () => Promise<void>;
  loadReport: (id: string | number) => Promise<void>;
}



export const useStore = create<State>()(
  persist(
    (set, get) => ({
      reports: [],
      draft: emptyDraft(),
      authToken: null,
      currentUser: null,
      setAuth: (token, user) => set({ authToken: token, currentUser: user }),
      clearAuth: () => set({ authToken: null, currentUser: null }),
      setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
      resetDraft: () => set({ draft: emptyDraft() }),
      addEvidence: (files) => set((s) => ({
        draft: {
          ...s.draft,
          evidence: [
            ...s.draft.evidence,
            ...files.map((f) => ({ ...f, id: uid(), uploadedAt: new Date().toISOString() })),
          ],
        },
      })),
      removeEvidence: (id) => set((s) => ({
        draft: { ...s.draft, evidence: s.draft.evidence.filter((e) => e.id !== id) },
      })),
      initQuestionnaire: (type) => set((s) => ({
        draft: {
          ...s.draft,
          questionnaire: QUESTIONS_FOR(type).map((q) => ({
            question: q.question,
            clause_ref: q.clause_ref,
            section: q.section,
            theme: q.theme,
            answer: null,
            risk: 3,
            notes: "",
          })),
        },
      })),
      setAnswer: (idx, patch) => set((s) => ({
        draft: {
          ...s.draft,
          questionnaire: s.draft.questionnaire.map((a, i) => i === idx ? { ...a, ...patch } : a),
        },
      })),
      generate: () => {
        const d = get().draft;
        const id = `rpt_${uid()}`;
        const now = new Date().toISOString();
        const report: Report = {
          id, title: d.title || "Untitled Report",
          type: d.type || "ISO 27001",
          organization: d.organization, department: d.department,
          date: now, scope: d.scope,
          evidence: d.evidence, questionnaire: d.questionnaire,
          sections: [], agentLog: [], conflicts: [], validation: [],
          score: null, status: "Processing",
          createdAt: now, updatedAt: now, promptVersion: "v2.1",
        };
        set((s) => ({ reports: [report, ...s.reports] }));
        return id;
      },
      appendLog: (id, entry) => set((s) => ({
        reports: s.reports.map((r) => r.id === id ? {
          ...r, agentLog: [...r.agentLog, { ...entry, id: uid(), ts: Date.now() }],
          updatedAt: new Date().toISOString(),
        } : r),
      })),
      finalize: (id, data) => set((s) => ({
        reports: s.reports.map((r) => r.id === id ? {
          ...r, ...data, status: "Completed",
          updatedAt: new Date().toISOString(),
        } : r),
      })),
      revalidate: (id) => {
        if (id.startsWith("rpt_")) return;
        reportsApi.validate(id)
          .then(() => get().loadReport(id))
          .catch(() => {});
      },
      rescore: (id) => {
        if (id.startsWith("rpt_")) return;
        reportsApi.rescore(id)
          .then(() => get().loadReport(id))
          .catch(() => {});
      },
      getReport: (id) => get().reports.find((r) => r.id === id),
      loadReports: async () => {
        try {
          const list = await reportsApi.list();
          const loaded = list.map(_mapSummary);
          const local = get().reports.filter((r) => r.id.startsWith("rpt_"));
          set({ reports: [...loaded, ...local] });
        } catch { /* silent */ }
      },
      loadReport: async (id) => {
        try {
          const d = await reportsApi.get(id);
          const report = _mapDetail(d);
          set((s) => {
            const idx = s.reports.findIndex((r) => r.id === report.id);
            if (idx >= 0) {
              const next = [...s.reports];
              next[idx] = report;
              return { reports: next };
            }
            return { reports: [report, ...s.reports] };
          });
        } catch { /* silent */ }
      },
    }),
    { name: "pse-reports-v1" },
  ),
);