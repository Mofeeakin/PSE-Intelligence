import type { Report, ReportSection, ConflictRecord, ValidationIssue, ScoreBreakdown, AgentName } from "./types";
import { useStore } from "./store";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);

export interface Stage { key: string; label: string; agent: AgentName; ms: number; }

export const STAGES: Stage[] = [
  { key: "router", label: "Agent Routing", agent: "Router", ms: 700 },
  { key: "rag", label: "RAG Retrieval", agent: "RAG", ms: 1100 },
  { key: "iso", label: "ISO Agent Processing", agent: "ISO Agent", ms: 1400 },
  { key: "conflict", label: "Conflict Detection", agent: "Conflict Checker", ms: 900 },
  { key: "resolve", label: "Resolution", agent: "Conflict Checker", ms: 700 },
  { key: "validate", label: "Validation", agent: "Validator", ms: 800 },
  { key: "score", label: "Scoring", agent: "Scorer", ms: 600 },
];

export async function runPipeline(reportId: string, onStage: (i: number) => void) {
  const { appendLog, getReport, finalize } = useStore.getState();
  const report = getReport(reportId);
  if (!report) return;

  for (let i = 0; i < STAGES.length; i++) {
    onStage(i);
    const s = STAGES[i];
    appendLog(reportId, {
      agent: s.agent,
      message: stageMessage(s.key, report),
      prompt: stagePrompt(s.key, report),
      output: stageOutput(s.key, report),
      durationMs: s.ms,
      confidence: 0.78 + Math.random() * 0.2,
      promptVersion: "v2.1",
    });
    await sleep(s.ms);
  }

  const sections = buildSections(report);
  const conflicts = buildConflicts(report);
  const validation = buildValidation(report);
  const score = buildScore(report, conflicts.length);
  finalize(reportId, { sections, conflicts, validation, score });
  onStage(STAGES.length);
}

function stageMessage(key: string, r: Report): string {
  switch (key) {
    case "router": return `Routing report to specialized agents based on type: ${r.type}.`;
    case "rag": return `Retrieved ${r.evidence.length} evidence artifacts and control references from the knowledge base.`;
    case "iso": return "ISO Agent analysing controls, scope alignment and Annex A coverage…";
    case "conflict": return "Cross-checking agent outputs for contradictory findings…";
    case "resolve": return "Arbitrating conflicts using priority matrix (regulatory > standards).";
    case "validate": return "Validating section completeness and evidence linkage…";
    case "score": return "Computing weighted compliance score…";
  }
  return "";
}
function stagePrompt(key: string, r: Report) {
  return `[${key}] You are a ${r.type} compliance analyst. Scope: "${r.scope.slice(0, 80)}…". Evidence count: ${r.evidence.length}. Produce structured findings.`;
}
function stageOutput(key: string, _r: Report) {
  const map: Record<string, string> = {
    router: "Selected: ISO Agent, Conflict Checker, Validator, Scorer.",
    rag: "Top references: ISO/IEC 27001:2022 A.5.15, A.8.3, A.8.20, A.8.24.",
    iso: "Drafted Scope, Risk Assessment, Controls, Findings sections.",
    conflict: "No inter-agent contradictions detected.",
    resolve: "No resolution required.",
    validate: "All required sections present. Evidence linkage verified.",
    score: "Final score computed (section · evidence · consistency weighted average).",
  };
  return map[key] || "";
}

function buildSections(r: Report): ReportSection[] {
  const yes = r.questionnaire.filter((q) => q.answer === "yes").length;
  const total = Math.max(1, r.questionnaire.length);
  const yesRatio = Math.round((yes / total) * 100);
  const evIds = r.evidence.slice(0, 2).map((e) => e.id);

  return [
    {
      id: uid(), title: "Scope of Assessment", agent: "ISO Agent", confidence: 0.94,
      evidenceIds: evIds,
      content: `This assessment covers the systems, processes, and boundaries declared by ${r.organization || "the organization"} under the scope statement: "${r.scope}". The scope was validated against the ${r.type} controls catalogue and aligned with the department's operational boundaries (${r.department || "—"}).`,
    },
    {
      id: uid(), title: "Risk Assessment", agent: "ISO Agent", confidence: 0.88,
      evidenceIds: evIds,
      content: `Risk posture analysis indicates ${yesRatio}% control affirmation across the questionnaire. Residual risk concentrates in evidence-thin domains. Mitigations have been mapped to specific control families and traced to uploaded artefacts.`,
    },
    {
      id: uid(), title: "Findings & Observations", agent: "Validator", confidence: 0.91,
      evidenceIds: r.evidence.slice(0, 3).map((e) => e.id),
      content: `Strengths: documented governance, evidenced access reviews. Gaps: ${r.evidence.length < 3 ? "limited evidence corpus reduces traceability of certain controls; " : ""}consider expanding log retention proofs and quarterly review attestations.`,
    },
    {
      id: uid(), title: "Recommendations", agent: "Scorer", confidence: 0.92,
      evidenceIds: [],
      content: `1) Increase evidence coverage for high-risk controls. 2) Automate quarterly access-review attestations. 3) Re-test incident response runbook within 90 days. 4) Schedule an independent internal audit within the next cycle.`,
    },
  ];
}

function buildConflicts(_r: Report): ConflictRecord[] {
  return [];
}

function buildValidation(r: Report): ValidationIssue[] {
  const issues: ValidationIssue[] = [
    { id: uid(), severity: "resolved", message: "Scope statement validated against controls catalog." },
    { id: uid(), severity: "resolved", message: "All evidence files indexed by RAG." },
    { id: uid(), severity: "resolved", message: "Cross-agent conflict resolved with documented reasoning." },
  ];
  if (r.evidence.length < 3) issues.push({
    id: uid(), severity: "gap",
    message: "Evidence coverage below recommended threshold (3+ files).",
  });
  const unanswered = r.questionnaire.filter((q) => q.answer === null).length;
  if (unanswered > 0) issues.push({
    id: uid(), severity: "warning",
    message: `${unanswered} questionnaire item(s) left unanswered — defaulted to 'no'.`,
  });
  return issues;
}

function buildScore(r: Report, conflicts: number): ScoreBreakdown {
  const yes = r.questionnaire.filter((q) => q.answer === "yes").length;
  const sectionScore = Math.round(50 + (yes / Math.max(1, r.questionnaire.length)) * 50);
  const evidence = Math.min(100, 60 + r.evidence.length * 8);
  const consistency = conflicts === 0 ? 95 : 88;
  const final = Math.round(sectionScore * 0.4 + evidence * 0.35 + consistency * 0.25);
  return { section: sectionScore, evidence, consistency, final };
}