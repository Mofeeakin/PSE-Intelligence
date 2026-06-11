export type ReportType = "ISO 27001" | "ISO 9001" | "NDPA" | "PCI DSS";
export type ServiceType = "audit_report" | "gap_assessment";
export type ReportStatus = "Draft" | "Processing" | "Validation" | "Scored" | "Completed" | "Failed";
export type AgentName = "Router" | "RAG" | "ISO Agent" | "Conflict Checker" | "Validator" | "Scorer";

export interface EvidenceFile {
  id: string;
  name: string;
  size: number;
  tag: "Policy" | "Audit" | "Logs" | "Screenshot" | "Certification";
  uploadedAt: string;
}

export interface QuestionnaireAnswer {
  question: string;
  clause_ref: string;
  section: string;  // e.g. "Clause 4 Context", "Clause 6 Planning"
  theme: string;    // e.g. "Context", "Planning"
  answer: "yes" | "no" | null;
  risk: number;
  notes: string;
}

export interface ReportSection {
  id: string;
  title: string;
  content: string;
  agent: AgentName;
  confidence: number;
  evidenceIds: string[];
  order?: number;
}

export interface AgentLogEntry {
  id: string;
  agent: AgentName;
  message: string;
  ts: number;
  prompt?: string;
  output?: string;
  durationMs?: number;
  confidence?: number;
  promptVersion?: string;
}

export interface ConflictRecord {
  id: string;
  topic: string;
  isoView: string;
  ndpaView: string;
  resolution: string;
  reasoning: string;
}

export interface ValidationIssue {
  id: string;
  severity: "missing" | "gap" | "warning" | "resolved";
  message: string;
}

export interface ScoreBreakdown {
  section: number;
  evidence: number;
  consistency: number;
  final: number;
  status?: string;
}

export interface Report {
  id: string;
  title: string;
  type: ReportType;
  organization: string;
  department: string;
  date: string;
  scope: string;
  evidence: EvidenceFile[];
  questionnaire: QuestionnaireAnswer[];
  sections: ReportSection[];
  agentLog: AgentLogEntry[];
  conflicts: ConflictRecord[];
  validation: ValidationIssue[];
  score: ScoreBreakdown | null;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  promptVersion: string;
  serviceType?: ServiceType;
  // Assignment & project fields (from API)
  assignedToId?: number | null;
  assignedToName?: string | null;
  projectId?: number | null;
  projectName?: string | null;
  createdByName?: string | null;
}

export interface Project {
  id: number;
  name: string;
  client_name: string;
  client_details: string;
  description: string;
  status: "active" | "completed" | "archived";
  standard: number | null;
  created_by: number;
  created_by_name: string;
  member_count: number;
  report_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "super_admin" | "sub_admin" | "user";
}

export interface ReportLogo {
  id: number;
  placement: "cover_only" | "every_page" | "selected_pages";
  pages: number[];
  width_inches: number;
  image_url: string | null;
  created_at: string;
}

export type ProjectLogo = ReportLogo;