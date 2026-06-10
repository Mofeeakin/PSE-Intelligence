import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { PageHeader, ScoreBadge, StatusPill } from "@/components/AppShell";
import { Plus, FileCheck2, Download, ShieldCheck, Activity, AlertTriangle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Compliance Intelligence" },
      { name: "description", content: "Control center for compliance reports, validation, and AI agent activity." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const reports = useStore((s) => s.reports);
  const loadReports = useStore((s) => s.loadReports);
  const revalidate = useStore((s) => s.revalidate);
  const navigate = useNavigate();

  useEffect(() => { loadReports(); }, [loadReports]);

  const avg = reports.filter(r => r.score).reduce((a, r) => a + (r.score?.final ?? 0), 0) /
    Math.max(1, reports.filter(r => r.score).length);

  return (
    <>
      <PageHeader
        eyebrow="Report control center"
        title="Compliance Intelligence"
        description="Generate, validate and score audit-ready compliance reports with multi-agent reasoning and full evidence traceability."
        actions={
          <Link
            to="/wizard"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Create New Report
          </Link>
        }
      />

      <div className="grid grid-cols-12 gap-8">
        {/* Main */}
        <section className="col-span-12 lg:col-span-8 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Avg. compliance score" value={`${Math.round(avg) || 0}%`} sub="Across scored reports" />
            <KpiCard icon={<FileCheck2 className="h-4 w-4" />} label="Reports" value={String(reports.length)} sub={`${reports.filter(r=>r.status==="Completed").length} completed`} />
            <KpiCard icon={<ShieldCheck className="h-4 w-4" />} label="Active agents" value="7" sub="ISO · RAG · Conflict · Validator · Scorer" />
          </div>

          <div className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <h2 className="font-display text-lg font-semibold">Reports</h2>
              <span className="label-eyebrow">{reports.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-6 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Report</th>
                    <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Type</th>
                    <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Score</th>
                    <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Updated</th>
                    <th className="px-6 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{r.organization} · {r.department}</div>
                      </td>
                      <td className="px-3 py-4 text-muted-foreground font-mono text-xs">
                        <div>{r.type}</div>
                        {r.serviceType && <div className="text-[10px] uppercase tracking-wider mt-0.5 opacity-70">{r.serviceType === 'gap_assessment' ? 'Gap' : 'Audit'}</div>}
                      </td>
                      <td className="px-3 py-4"><StatusPill status={r.status} /></td>
                      <td className="px-3 py-4">{r.score ? <ScoreBadge value={r.score.final} /> : <span className="text-muted-foreground text-xs font-mono">—</span>}</td>
                      <td className="px-3 py-4 text-muted-foreground text-xs font-mono">{new Date(r.updatedAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => navigate({ to: "/reports/$id", params: { id: r.id } })}
                            className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border">View</button>
                          <button onClick={() => { revalidate(r.id); }}
                            className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border">Validate</button>
                          <button onClick={() => navigate({ to: "/reports/$id/export", params: { id: r.id } })}
                            className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border inline-flex items-center gap-1">
                            <Download className="h-3 w-3" />Export
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Sidebar insights */}
        <aside className="col-span-12 lg:col-span-4 space-y-6">
          <InsightCard title="System insights" />
          <AgentsCard />
          <RecentErrorsCard />
        </aside>
      </div>
    </>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="label-eyebrow">{label}</span></div>
      <div className="mt-3 font-display text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function InsightCard({ title }: { title: string }) {
  const reports = useStore((s) => s.reports);
  const avg = Math.round(
    reports.filter(r => r.score).reduce((a, r) => a + (r.score?.final ?? 0), 0) /
    Math.max(1, reports.filter(r => r.score).length)
  );
  const conflicts = reports.reduce((a, r) => a + r.conflicts.length, 0);
  const gaps = reports.reduce((a, r) => a + r.validation.filter(v => v.severity === "gap").length, 0);
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="label-eyebrow mb-3">{title}</div>
      <div className="space-y-3">
        <Row label="Average score" value={`${avg || 0}%`} />
        <Row label="Open gaps" value={gaps > 0 ? String(gaps) : "—"} />
        <Row label="Resolved conflicts" value={conflicts > 0 ? String(conflicts) : "—"} />
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? "font-mono" : "font-medium"}`}>{value}</span>
    </div>
  );
}

function AgentsCard() {
  const agents = [
    { name: "Router", status: "idle" },
    { name: "RAG", status: "idle" },
    { name: "ISO Agent", status: "ready" },
    { name: "Conflict Checker", status: "idle" },
    { name: "Validator", status: "ready" },
    { name: "Scorer", status: "ready" },
  ];
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-3.5 w-3.5 text-primary" />
        <span className="label-eyebrow">Agent status</span>
      </div>
      <ul className="space-y-2">
        {agents.map((a) => (
          <li key={a.name} className="flex items-center justify-between text-sm">
            <span>{a.name}</span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${a.status==="ready"?"bg-[oklch(0.5_0.12_145)]":"bg-muted-foreground/50"}`} />
              {a.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentErrorsCard() {
  const reports = useStore((s) => s.reports);
  const events = reports
    .filter((r) => r.status === "Failed" || (r.validationIssues && r.validationIssues.length > 0))
    .slice(0, 5)
    .flatMap((r) =>
      r.validationIssues?.slice(0, 2).map((v) => `${v.message} — ${r.title.slice(0, 24)}`) ?? []
    );
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-3.5 w-3.5 text-[oklch(0.45_0.13_70)]" />
        <span className="label-eyebrow">Recent validation events</span>
      </div>
      {events.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {events.map((m, i) => <li key={i} className="text-muted-foreground">· {m}</li>)}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No validation events yet.</p>
      )}
    </div>
  );
}
