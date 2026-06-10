import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import { reports as reportsApi, ApiError } from "@/lib/api-client";
import type { ReportType, ServiceType, EvidenceFile } from "@/lib/types";
import { ArrowRight, ArrowLeft, Upload, X, FileText, ShieldCheck, BookOpen, CreditCard, Lock, Sparkles, ClipboardList, Search } from "lucide-react";

export const Route = createFileRoute("/wizard")({
  head: () => ({ meta: [{ title: "New Report — Compliance Intelligence" }] }),
  component: Wizard,
});

const STEPS = ["Type", "Basics", "Scope", "Evidence", "Questionnaire"] as const;

const TYPE_META: Record<ReportType, { icon: React.ComponentType<{className?: string}>; desc: string }> = {
  "ISO 27001": { icon: ShieldCheck, desc: "Information Security Management — Annex A controls." },
  "ISO 9001": { icon: BookOpen, desc: "Quality Management Systems — process and continuous improvement." },
  "NDPA": { icon: Lock, desc: "Nigeria Data Protection Act — privacy & lawful basis." },
  "PCI DSS": { icon: CreditCard, desc: "Payment Card Industry Data Security Standard — cardholder data." },
};

const SERVICE_TYPE_META: Record<ServiceType, { icon: React.ComponentType<{className?: string}>; label: string; desc: string }> = {
  audit_report: {
    icon: ClipboardList,
    label: "Internal Audit Report",
    desc: "Formal audit findings, conformity/non-conformity classification, clause citations.",
  },
  gap_assessment: {
    icon: Search,
    label: "Gap Assessment Report",
    desc: "Advisory assessment identifying current-state vs. required-state deltas, with remediation roadmap.",
  },
};

function Wizard() {
  const navigate = useNavigate();
  const { draft, setDraft, resetDraft, addEvidence, removeEvidence, initQuestionnaire, setAnswer, generate } = useStore();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    // start fresh if user lands cold
    if (!draft.type && step !== 0) setStep(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        title: draft.title || "Untitled Report",
        organisation: draft.organization,
        department: draft.department,
        standard_code: "ISO27001",
        scope: draft.scope,
        service_type: draft.serviceType,
        submissions: [],
        wizard_answers: draft.questionnaire,
      };
      const created = await reportsApi.create(payload);
      // Keep a local shadow record for the UI (status will be polled)
      generate();
      resetDraft();
      navigate({ to: "/processing/$id", params: { id: String(created.id) } });
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Failed to submit. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={`Step ${step + 1} of ${STEPS.length}`}
        title="New compliance report"
        description="A guided intelligence pipeline. Each step feeds the agent router and downstream RAG, validation, and scoring services."
      />

      <Stepper step={step} />

      <div className="mt-10 grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-8">
          {step === 0 && (
            <Section title="Select report type" hint="Determines which specialized agents are routed.">
              <div className="grid sm:grid-cols-2 gap-4">
                {(Object.keys(TYPE_META) as ReportType[]).map((t) => {
                  const Icon = TYPE_META[t].icon;
                  const selected = draft.type === t;
                  return (
                    <button
                      key={t}
                      onClick={() => { setDraft({ type: t }); initQuestionnaire(t); }}
                      className={`text-left p-5 border rounded-sm transition-all ${selected ? "border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary)]" : "border-border hover:border-foreground/30 bg-card"}`}
                    >
                      <Icon className={`h-5 w-5 mb-3 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="font-display text-lg font-semibold">{t}</div>
                      <div className="text-sm text-muted-foreground mt-1">{TYPE_META[t].desc}</div>
                    </button>
                  );
                })}
              </div>

              {draft.type && (
                <div className="mt-8">
                  <div className="label-eyebrow mb-3">Service type</div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {(Object.keys(SERVICE_TYPE_META) as ServiceType[]).map((st) => {
                      const Icon = SERVICE_TYPE_META[st].icon;
                      const selected = draft.serviceType === st;
                      return (
                        <button
                          key={st}
                          onClick={() => setDraft({ serviceType: st })}
                          className={`text-left p-4 border rounded-sm transition-all ${selected ? "border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary)]" : "border-border hover:border-foreground/30 bg-card"}`}
                        >
                          <Icon className={`h-5 w-5 mb-2 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                          <div className="font-semibold text-sm">{SERVICE_TYPE_META[st].label}</div>
                          <div className="text-xs text-muted-foreground mt-1">{SERVICE_TYPE_META[st].desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </Section>
          )}

          {step === 1 && (
            <Section title="Basic information" hint="Identifies the report and its owning department.">
              <div className="grid grid-cols-2 gap-5">
                <Field label="Report title" full>
                  <input value={draft.title} onChange={(e) => setDraft({ title: e.target.value })} className={inputCls} placeholder="e.g. Acme Ltd — ISO 27001 Annual Review" />
                </Field>
                <Field label="Organization name">
                  <input value={draft.organization} onChange={(e) => setDraft({ organization: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Department">
                  <input value={draft.department} onChange={(e) => setDraft({ department: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Report date" full>
                  <input readOnly value={new Date().toLocaleDateString()} className={`${inputCls} bg-muted/50 text-muted-foreground font-mono`} />
                </Field>
              </div>
            </Section>
          )}

          {step === 2 && (
            <Section title="Scope definition" hint="Define systems, processes and boundaries to be assessed.">
              <textarea
                rows={8}
                value={draft.scope}
                onChange={(e) => setDraft({ scope: e.target.value })}
                className={`${inputCls} resize-none`}
                placeholder="In-scope: All production systems, cloud infrastructure, applications, and supporting processes… Out-of-scope: third-party systems outside organisational control…"
              />
              <div className="text-xs text-muted-foreground mt-2 font-mono">{draft.scope.length} chars</div>
            </Section>
          )}

          {step === 3 && (
            <EvidenceStep
              evidence={draft.evidence}
              onAdd={addEvidence}
              onRemove={removeEvidence}
            />
          )}

          {step === 4 && (
            <Section title="Compliance questionnaire" hint={`${draft.questionnaire.length} clause-mapped questions for ${draft.type}. Answers feed the ISO agent and RAG retrieval pipeline.`}>
              <QuestionnaireBySection questionnaire={draft.questionnaire} setAnswer={setAnswer} />
            </Section>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button onClick={prev} disabled={step === 0}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={next} disabled={!canAdvance(step, draft)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 disabled:opacity-40">
                {step === 3 ? "Next: Questionnaire" : "Continue"} <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex flex-col items-end gap-2">
                {submitError && (
                  <p className="text-xs text-destructive">{submitError}</p>
                )}
                <button onClick={submit} disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 disabled:opacity-60">
                  <Sparkles className="h-4 w-4" /> {submitting ? "Submitting…" : "Generate Report"}
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="col-span-12 lg:col-span-4">
          <DraftSummary />
        </aside>
      </div>
    </>
  );
}

const inputCls = "w-full bg-card border border-input rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring";

function QuestionnaireBySection({
  questionnaire,
  setAnswer,
}: {
  questionnaire: ReturnType<typeof useStore.getState>["draft"]["questionnaire"];
  setAnswer: (idx: number, patch: Partial<ReturnType<typeof useStore.getState>["draft"]["questionnaire"][0]>) => void;
}) {
  // Group questions by their section label
  const sections = questionnaire.reduce<Record<string, { indices: number[] }>>((acc, q, i) => {
    const s = q.section || "General";
    if (!acc[s]) acc[s] = { indices: [] };
    acc[s].indices.push(i);
    return acc;
  }, {});

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (s: string) => setCollapsed((c) => ({ ...c, [s]: !c[s] }));

  return (
    <div className="space-y-4">
      {Object.entries(sections).map(([sectionName, { indices }]) => {
        const answered = indices.filter((i) => questionnaire[i].answer !== null).length;
        const isCollapsed = collapsed[sectionName] ?? false;
        return (
          <div key={sectionName} className="border border-border rounded-sm overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(sectionName)}
              className="w-full flex items-center justify-between px-5 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="font-display font-semibold text-sm">{sectionName}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {answered}/{indices.length} answered
                </span>
              </div>
              <span className="text-muted-foreground text-xs">{isCollapsed ? "▶" : "▼"}</span>
            </button>
            {!isCollapsed && (
              <div className="divide-y divide-border">
                {indices.map((globalIdx) => {
                  const q = questionnaire[globalIdx];
                  return (
                    <div key={globalIdx} className="px-5 py-4 bg-card">
                      <div className="flex items-start gap-3">
                        <span className="font-mono text-[10px] text-muted-foreground mt-1 shrink-0 bg-muted px-1.5 py-0.5 rounded">{q.clause_ref}</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium leading-snug">{q.question}</div>
                          <div className="mt-3 flex items-center gap-2">
                            <Toggle active={q.answer === "yes"} onClick={() => setAnswer(globalIdx, { answer: "yes" })}>Yes</Toggle>
                            <Toggle active={q.answer === "no"} onClick={() => setAnswer(globalIdx, { answer: "no" })}>No</Toggle>
                            {q.answer === "no" && (
                              <span className="ml-1 text-[10px] font-mono text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">gap flagged</span>
                            )}
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-4">
                            <div>
                              <div className="label-eyebrow mb-1.5">Risk level — {q.risk}</div>
                              <input type="range" min={1} max={5} value={q.risk}
                                onChange={(e) => setAnswer(globalIdx, { risk: Number(e.target.value) })}
                                className="w-full accent-[var(--primary)]" />
                            </div>
                            <div>
                              <div className="label-eyebrow mb-1.5">Notes</div>
                              <input value={q.notes} onChange={(e) => setAnswer(globalIdx, { notes: e.target.value })}
                                className={`${inputCls} py-1.5 text-sm`} placeholder="Optional context" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function canAdvance(step: number, draft: ReturnType<typeof useStore.getState>["draft"]): boolean {
  if (step === 0) return !!draft.type;
  if (step === 1) return !!draft.title.trim() && !!draft.organization.trim();
  if (step === 2) return draft.scope.trim().length > 10;
  return true;
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={s} className="flex items-center gap-2 flex-1">
            <div className={`flex items-center gap-2 ${active ? "text-foreground" : done ? "text-foreground/70" : "text-muted-foreground"}`}>
              <span className={`h-6 w-6 grid place-items-center rounded-full font-mono text-[11px] ${active ? "bg-primary text-primary-foreground" : done ? "bg-foreground/80 text-background" : "bg-muted border border-border"}`}>
                {i + 1}
              </span>
              <span className="text-sm font-medium">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px ${done ? "bg-foreground/40" : "bg-border"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      {hint && <p className="text-muted-foreground mt-1">{hint}</p>}
      <div className="rule-line my-5" />
      {children}
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <div className="label-eyebrow mb-1.5">{label}</div>
      {children}
    </label>
  );
}

function Toggle({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-1.5 text-sm rounded-sm border transition-colors ${active ? "bg-foreground text-background border-foreground" : "bg-card border-border hover:border-foreground/40"}`}>
      {children}
    </button>
  );
}

function EvidenceStep({ evidence, onAdd, onRemove }: {
  evidence: EvidenceFile[];
  onAdd: (files: Omit<EvidenceFile, "id" | "uploadedAt">[]) => void;
  onRemove: (id: string) => void;
}) {
  const [tag, setTag] = useState<EvidenceFile["tag"]>("Policy");
  const [drag, setDrag] = useState(false);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).map((f) => ({ name: f.name, size: f.size, tag }));
    onAdd(next);
  }, [tag, onAdd]);

  return (
    <Section title="Evidence upload" hint="Files are indexed by RAG and linked to claims in the generated report.">
      <div className="flex items-center gap-2 mb-3">
        <span className="label-eyebrow">Tag for next upload</span>
        <div className="flex flex-wrap gap-1">
          {(["Policy", "Audit", "Logs", "Screenshot", "Certification"] as const).map((t) => (
            <button key={t} onClick={() => setTag(t)}
              className={`px-2.5 py-1 text-xs rounded-sm border ${tag === t ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground/40"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
        className={`block border-2 border-dashed rounded-sm p-10 text-center cursor-pointer transition-colors ${drag ? "border-primary bg-primary/5" : "border-border bg-paper hover:border-foreground/30"}`}
      >
        <input type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
        <div className="mt-3 font-medium">Drop files or click to upload</div>
        <div className="text-xs text-muted-foreground mt-1 font-mono">PDF · DOCX · PNG · LOG · CSV — up to 25MB each</div>
      </label>

      {evidence.length > 0 && (
        <ul className="mt-5 space-y-2">
          {evidence.map((e) => (
            <li key={e.id} className="flex items-center justify-between bg-card border border-border rounded-sm px-4 py-2.5">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{e.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{(e.size / 1024).toFixed(1)} KB · {e.tag}</div>
                </div>
              </div>
              <button onClick={() => onRemove(e.id)} className="text-muted-foreground hover:text-destructive p-1">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function DraftSummary() {
  const draft = useStore((s) => s.draft);
  return (
    <div className="bg-card border border-border rounded-sm p-5 sticky top-24">
      <div className="label-eyebrow mb-3">Draft summary</div>
      <dl className="space-y-3 text-sm">
        <SumRow k="Type" v={draft.type ?? "—"} mono />
        <SumRow k="Title" v={draft.title || "—"} />
        <SumRow k="Organization" v={draft.organization || "—"} />
        <SumRow k="Department" v={draft.department || "—"} />
        <SumRow k="Scope" v={draft.scope ? `${draft.scope.slice(0, 60)}${draft.scope.length > 60 ? "…" : ""}` : "—"} />
        <SumRow k="Evidence" v={`${draft.evidence.length} file${draft.evidence.length === 1 ? "" : "s"}`} mono />
        <SumRow k="Questions" v={`${draft.questionnaire.filter(q=>q.answer).length} / ${draft.questionnaire.length}`} mono />
      </dl>
      <div className="rule-line my-5" />
      <div className="text-xs text-muted-foreground">
        On submit, the report is routed through 6 stages: Router → RAG Retrieval → ISO Agent → Conflict Check → Validation → Scoring.
      </div>
    </div>
  );
}

function SumRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={`text-right ${mono ? "font-mono text-xs" : ""}`}>{v}</dd>
    </div>
  );
}