import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { PageHeader } from "@/components/AppShell";
import { reports as reportsApi } from "@/lib/api-client";
import type { ReportStatus } from "@/lib/api-client";
import { Check, Loader2, ArrowRight } from "lucide-react";

const STAGES = [
  { key: "hydrate",  label: "Hydrating from Wizard",  agent: "Pipeline" },
  { key: "router",   label: "Agent Routing",          agent: "Router" },
  { key: "rag",      label: "RAG Retrieval",           agent: "RAG" },
  { key: "iso",      label: "ISO Agent Processing",   agent: "ISO Agent" },
  { key: "conflict", label: "Conflict Detection",     agent: "Conflict Checker" },
  { key: "validate", label: "Validation",             agent: "Validator" },
  { key: "score",    label: "Scoring",                agent: "Scorer" },
  { key: "conclude", label: "Generating Conclusion",  agent: "ISO Agent" },
];

export const Route = createFileRoute("/processing/$id")({
  head: () => ({ meta: [{ title: "Processing — Compliance Intelligence" }] }),
  component: Processing,
});

const TERMINAL_STATUSES = new Set(["Completed", "Failed"]);
const POLL_MS = 2000;

function stageIdxFromPct(pct: number): number {
  // Map progress_pct to a stage index for visual display
  const idx = Math.round((pct / 100) * STAGES.length);
  return Math.min(idx, STAGES.length);
}

function Processing() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<ReportStatus | null>(null);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [logs, setLogs] = useState<Array<{ id: number; ts: number; agent: string; message: string }>>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const s = await reportsApi.status(id);
        if (cancelled) return;
        setStatus(s);

        if (s.latest_log) {
          setLogs((prev) => {
            const last = prev[prev.length - 1];
            if (last?.message === s.latest_log!.message) return prev;
            return [...prev, { id: Date.now(), ts: Date.now(), agent: s.latest_log!.agent_type, message: s.latest_log!.message }];
          });
        }

        if (TERMINAL_STATUSES.has(s.status)) {
          if (pollRef.current) clearInterval(pollRef.current);
          if (s.status === "Failed") setFailed(true);
          setDone(true);
        }
      } catch {
        // Network error — keep polling
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  const pct = status?.progress_pct ?? 0;
  const stageIdx = stageIdxFromPct(pct);
  const currentStageLabel = status?.current_stage ?? STAGES[Math.min(stageIdx, STAGES.length - 1)]?.label ?? "Initialising";

  return (
    <>
      <PageHeader
        eyebrow="Live agent execution"
        title="Processing report"
        description={`Report #${id}`}
        actions={done ? (
          <button onClick={() => navigate({ to: "/reports/$id", params: { id } })}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90">
            View Report <ArrowRight className="h-4 w-4" />
          </button>
        ) : failed ? (
          <span className="text-sm text-destructive">Pipeline failed — check logs</span>
        ) : (
          <span className="font-mono text-xs text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> {pct}% · {currentStageLabel}
          </span>
        )}
      />

      <div className="grid grid-cols-12 gap-8">
        {/* Timeline */}
        <section className="col-span-12 lg:col-span-5">
          <div className="bg-card border border-border rounded-sm p-6">
            <div className="label-eyebrow mb-4">Pipeline stages</div>
            <ol className="relative space-y-5">
              <span className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
              {STAGES.map((s, i) => {
                const stageDone = i < stageIdx;
                const active = i === stageIdx && !done;
                return (
                  <li key={s.key} className="relative pl-8">
                    <span className={`absolute left-0 top-0.5 h-[22px] w-[22px] rounded-full grid place-items-center border ${
                      stageDone ? "bg-foreground border-foreground text-background" :
                      active ? "bg-primary border-primary text-primary-foreground" :
                      "bg-card border-border text-muted-foreground"
                    }`}>
                      {stageDone ? <Check className="h-3 w-3" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-[10px] font-mono">{i+1}</span>}
                    </span>
                    <div className={`font-medium ${active ? "text-foreground" : stageDone ? "text-foreground/80" : "text-muted-foreground"}`}>
                      {s.label}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{s.agent}</div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Live feed */}
        <section className="col-span-12 lg:col-span-7">
          <div className="bg-card border border-border rounded-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="label-eyebrow">Agent activity</div>
              <div className="font-mono text-xs text-muted-foreground">{logs.length} events</div>
            </div>
            <div className="max-h-[480px] overflow-y-auto divide-y divide-border">
              {logs.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">Awaiting first agent…</div>
              )}
              {[...logs].reverse().map((e) => (
                <div key={e.id} className="px-5 py-3 hover:bg-accent/40">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-primary">{e.agent}</span>
                        <span className="text-xs text-muted-foreground font-mono">· {new Date(e.ts).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-sm mt-1">{e.message}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-border bg-paper">
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}