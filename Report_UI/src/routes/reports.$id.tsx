import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, ScoreBadge, StatusPill } from "@/components/AppShell";
import { FindingsTable } from "@/components/FindingsTable";
import { useStore } from "@/lib/store";
import { AlertTriangle, CheckCircle2, FileText, RefreshCw, Download, ChevronRight, Sparkles, ShieldAlert, Loader2 } from "lucide-react";

export const Route = createFileRoute("/reports/$id")({
  head: () => ({ meta: [{ title: "Report — Compliance Intelligence" }] }),
  component: Viewer,
});

function Viewer() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const report = useStore((s) => s.reports.find((r) => r.id === id));
  const loadReport = useStore((s) => s.loadReport);
  const revalidate = useStore((s) => s.revalidate);
  const rescore = useStore((s) => s.rescore);
  const [fetching, setFetching] = useState(!report);

  useEffect(() => {
    setFetching(true);
    loadReport(id).finally(() => setFetching(false));
  }, [id, loadReport]);

  if (fetching && !report) {
    return (
      <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Loading report…</span>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="py-20 text-center">
        <div className="font-display text-3xl">Report not found</div>
        <Link to="/" className="text-primary underline mt-3 inline-block">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`${report.type} · ${report.organization}`}
        title={report.title}
        description={report.scope}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={report.status} />
            {report.serviceType && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground border border-border px-2 py-0.5 rounded-sm">
                {report.serviceType === "gap_assessment" ? "Gap Assessment" : "Audit Report"}
              </span>
            )}
            {report.score && <ScoreBadge value={report.score.final} />}
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-8">
        <section className="col-span-12 lg:col-span-8 space-y-6">
          {/* Conflicts banner */}
          {report.conflicts.length > 0 && (
            <div className="border border-[oklch(0.45_0.13_70)]/40 bg-[oklch(0.95_0.05_70)]/40 rounded-sm p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-4 w-4 text-[oklch(0.45_0.13_70)] mt-0.5" />
                <div className="flex-1">
                  <div className="font-display text-base font-semibold">Multi-agent conflict resolved</div>
                  {report.conflicts.map((c) => (
                    <details key={c.id} className="mt-3 group">
                      <summary className="cursor-pointer text-sm flex items-center gap-1.5">
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                        {c.topic}
                      </summary>
                      <div className="mt-3 space-y-2 pl-5 text-sm">
                        <div><span className="label-eyebrow">ISO view</span><div>{c.isoView}</div></div>
                        <div><span className="label-eyebrow">Alternate view</span><div>{c.ndpaView}</div></div>
                        <div><span className="label-eyebrow">Resolution</span><div className="font-medium">{c.resolution}</div></div>
                        <div><span className="label-eyebrow">Reasoning</span><div className="text-muted-foreground">{c.reasoning}</div></div>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sections */}
          {report.sections.length === 0 ? (
            <div className="bg-card border border-border rounded-sm p-10 text-center">
              <Sparkles className="h-5 w-5 mx-auto text-muted-foreground" />
              <div className="mt-3 font-display text-xl">No sections yet</div>
              <p className="text-muted-foreground mt-1 text-sm">This report hasn't been processed by the agent pipeline yet.</p>
              <button onClick={() => navigate({ to: "/processing/$id", params: { id: report.id } })}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-sm text-sm">
                Run pipeline
              </button>
            </div>
          ) : (
            report.sections.map((s) => (
              <article key={s.id} className="bg-card border border-border rounded-sm">
                <header className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-xl font-semibold">{s.title}</h3>
                    <div className="mt-1 flex items-center gap-3 text-xs">
                      <span className="font-mono uppercase tracking-wider text-primary">{s.agent}</span>
                      <span className="text-muted-foreground font-mono">conf {(s.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </header>
                <div className="px-6 py-5">
                  <FindingsTable content={s.content} serviceType={report.serviceType} />
                  {s.evidenceIds.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="label-eyebrow mb-2">Evidence references</div>
                      <div className="flex flex-wrap gap-2">
                        {s.evidenceIds.map((eid) => {
                          const ev = report.evidence.find((e) => e.id === eid);
                          return (
                            <span key={eid} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-paper border border-border rounded-sm">
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <span className="font-mono">{ev?.name ?? eid}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
        </section>

        {/* Right rail */}
        <aside className="col-span-12 lg:col-span-4 space-y-6">
          {report.score && (
            <div className="bg-card border border-border rounded-sm p-5">
              <div className="label-eyebrow mb-3">Compliance score</div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <div className="font-display text-5xl font-semibold">{report.score.final.toFixed(1)}</div>
                <div className="text-muted-foreground">/ 100</div>
                {report.score.status && (
                  <span className="font-mono text-[11px] uppercase tracking-wider text-primary border border-primary/40 bg-primary/5 px-2 py-0.5 rounded-sm">
                    {report.score.status}
                  </span>
                )}
              </div>
              <div className="mt-5 space-y-3">
                <ScoreRow label="Section" v={report.score.section} />
                <ScoreRow label="Evidence" v={report.score.evidence} />
                <ScoreRow label="Consistency" v={report.score.consistency} />
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-sm p-5">
            <div className="label-eyebrow mb-3">
              Gaps &amp; Findings
              {report.validation.filter(v => v.severity === "gap").length > 0 && (
                <span className="ml-2 font-mono text-destructive">
                  {report.validation.filter(v => v.severity === "gap").length} high
                </span>
              )}
            </div>
            <ul className="space-y-2.5 text-sm">
              {report.validation.length === 0 && <li className="text-muted-foreground text-sm">No validation results yet.</li>}
              {report.validation.map((v) => (
                <li key={v.id} className="flex items-start gap-2">
                  {v.severity === "resolved" ? (
                    <CheckCircle2 className="h-4 w-4 text-[oklch(0.5_0.12_145)] mt-0.5" />
                  ) : v.severity === "warning" ? (
                    <AlertTriangle className="h-4 w-4 text-[oklch(0.45_0.13_70)] mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                  )}
                  <span className="leading-snug">{v.message}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-card border border-border rounded-sm p-5">
            <div className="label-eyebrow mb-3">Actions</div>
            <div className="space-y-2">
              <button onClick={() => revalidate(report.id)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm border border-border rounded-sm hover:bg-accent">
                <RefreshCw className="h-3.5 w-3.5" /> Re-Validate
              </button>
              <button onClick={() => rescore(report.id)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm border border-border rounded-sm hover:bg-accent">
                <RefreshCw className="h-3.5 w-3.5" /> Re-Score
              </button>
              <Link to="/reports/$id/export" params={{ id: report.id }}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-sm hover:opacity-90">
                <Download className="h-3.5 w-3.5" /> Export Report
              </Link>
              <Link to="/transparency"
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm border border-border rounded-sm hover:bg-accent">
                AI Transparency
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function ScoreRow({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{v}%</span>
      </div>
      <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-foreground/80" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}