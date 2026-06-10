import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import { reports as reportsApi } from "@/lib/api-client";
import type { AgentExecutionLog } from "@/lib/api-client";
import { GitBranch, Terminal, History, Loader2 } from "lucide-react";

export const Route = createFileRoute("/transparency")({
  head: () => ({ meta: [{ title: "AI Transparency — Compliance Intelligence" }] }),
  component: Transparency,
});

const PROMPT_HISTORY = [
  { version: "v2.1", date: "2026-04-12", changes: "Tightened ISO Annex A coverage instructions; added regulatory-precedence rule for conflict resolution." },
  { version: "v2.0", date: "2026-02-03", changes: "Introduced multi-agent collaboration with explicit conflict reasoning output." },
  { version: "v1.2", date: "2025-11-20", changes: "Added evidence-linkage requirement to all factual claims." },
  { version: "v1.0", date: "2025-09-01", changes: "Initial production prompt set." },
];

function Transparency() {
  const reports = useStore((s) => s.reports);
  const loadReports = useStore((s) => s.loadReports);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [logs, setLogs] = useState<AgentExecutionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => { loadReports(); }, [loadReports]);

  // Initialise activeId to first report with any known data
  useEffect(() => {
    if (!activeId && reports.length > 0) setActiveId(reports[0].id);
  }, [reports, activeId]);

  useEffect(() => {
    if (!activeId) return;
    setLogsLoading(true);
    reportsApi.logs(activeId)
      .then((data) => setLogs(data))
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false));
  }, [activeId]);

  const active = reports.find((r) => r.id === activeId);

  return (
    <>
      <PageHeader
        eyebrow="Advanced audit"
        title="AI Transparency"
        description="Inspect agent reasoning, conflict resolutions and prompt versions. Every claim traces back to a prompt, an output and a confidence score."
      />

      <div className="grid grid-cols-12 gap-8">
        <aside className="col-span-12 lg:col-span-3">
          <div className="bg-card border border-border rounded-sm">
            <div className="px-4 py-3 border-b border-border label-eyebrow">Reports</div>
            <ul>
              {reports.length === 0 && (
                <li className="px-4 py-6 text-sm text-muted-foreground">No reports yet. Generate a report from the dashboard.</li>
              )}
              {reports.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setActiveId(r.id)}
                    className={`w-full text-left px-4 py-3 text-sm border-l-2 transition-colors ${activeId === r.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent"}`}>
                    <div className="font-medium truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">{r.type} · {r.status}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="col-span-12 lg:col-span-9 space-y-6">
          {/* Agent execution log */}
          <div className="bg-card border border-border rounded-sm">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-primary" />
              <span className="label-eyebrow">Agent execution log</span>
              {logsLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
              {!logsLoading && <span className="label-eyebrow ml-auto">{logs.length} events</span>}
            </div>
            {!active ? (
              <div className="p-8 text-sm text-muted-foreground">Select a report.</div>
            ) : logsLoading ? (
              <div className="p-8 text-sm text-muted-foreground">Loading logs…</div>
            ) : (
              <div className="divide-y divide-border">
                {logs.length === 0 && (
                  <div className="p-8 text-sm text-muted-foreground">No execution logs for this report.</div>
                )}
                {logs.map((e) => (
                  <details key={e.id} className="group">
                    <summary className="px-5 py-3 cursor-pointer flex items-center justify-between hover:bg-accent/40">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-primary">{e.agent_type}</span>
                        <span className="text-sm">{e.message}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                        {e.duration_ms != null && <span>{e.duration_ms}ms</span>}
                        {e.confidence_score > 0 && <span>conf {(e.confidence_score * 100).toFixed(0)}%</span>}
                        <span className="text-[10px]">{new Date(e.created_at).toLocaleTimeString()}</span>
                      </div>
                    </summary>
                    <div className="px-5 pb-4 pt-1 grid sm:grid-cols-2 gap-4">
                      <div>
                        <div className="label-eyebrow mb-1.5">Prompt</div>
                        <pre className="text-xs bg-paper border border-border rounded-sm p-3 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">{e.prompt_text || "(no prompt recorded)"}</pre>
                      </div>
                      <div>
                        <div className="label-eyebrow mb-1.5">Output</div>
                        <pre className="text-xs bg-paper border border-border rounded-sm p-3 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">{e.output_text || "(no output recorded)"}</pre>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>

          {/* Conflict resolution */}
          <div className="bg-card border border-border rounded-sm">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-primary" />
              <span className="label-eyebrow">Conflict resolution</span>
            </div>
            {active && active.conflicts.length > 0 ? (
              <div className="p-5 space-y-4">
                {active.conflicts.map((c) => (
                  <div key={c.id} className="border border-border rounded-sm p-4 bg-paper">
                    <div className="font-display text-base font-semibold">{c.topic}</div>
                    <div className="grid sm:grid-cols-2 gap-4 mt-3 text-sm">
                      <div>
                        <div className="label-eyebrow mb-1">ISO position</div>
                        <div>{c.isoView}</div>
                      </div>
                      <div>
                        <div className="label-eyebrow mb-1">Alternate position</div>
                        <div>{c.ndpaView}</div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="label-eyebrow mb-1">Final arbitration</div>
                      <div className="text-sm font-medium">{c.resolution}</div>
                      <div className="text-sm text-muted-foreground mt-1">{c.reasoning}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-sm text-muted-foreground">No conflicts recorded for this report.</div>
            )}
          </div>

          {/* Prompt versions */}
          <div className="bg-card border border-border rounded-sm">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-primary" />
              <span className="label-eyebrow">Prompt versions</span>
            </div>
            <ul className="divide-y divide-border">
              {PROMPT_HISTORY.map((p) => (
                <li key={p.version} className="px-5 py-4 flex items-start gap-4">
                  <div className="font-mono text-sm w-16 shrink-0">
                    <div className="text-foreground font-semibold">{p.version}</div>
                    <div className="text-xs text-muted-foreground">{p.date}</div>
                  </div>
                  <div className="text-sm text-muted-foreground flex-1">{p.changes}</div>
                  {active?.promptVersion === p.version && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-primary border border-primary/40 bg-primary/5 px-2 py-0.5 rounded-sm self-center">
                      in use
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}