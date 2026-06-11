import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { PageHeader, ScoreBadge, StatusPill } from "@/components/AppShell";
import {
  Plus, FileCheck2, Download, ShieldCheck, Activity, AlertTriangle,
  TrendingUp, Briefcase, User, ClipboardList,
} from "lucide-react";
import type { Report } from "@/lib/types";

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
  const reports   = useStore((s) => s.reports);
  const user      = useStore((s) => s.currentUser);
  const loadReports = useStore((s) => s.loadReports);
  const navigate  = useNavigate();

  useEffect(() => { loadReports(); }, [loadReports]);

  const role = user?.role ?? "user";

  if (role === "user") return <UserDashboard reports={reports} navigate={navigate} />;
  if (role === "sub_admin") return <SubAdminDashboard reports={reports} navigate={navigate} />;
  return <SuperAdminDashboard reports={reports} navigate={navigate} />;
}

// ─── User / Staff Dashboard ──────────────────────────────────────────────────

function UserDashboard({ reports, navigate }: { reports: Report[]; navigate: ReturnType<typeof useNavigate> }) {
  const user = useStore((s) => s.currentUser);
  const userId = user?.id;

  const assigned = reports.filter((r) => r.assignedToId === userId);
  const myOwn    = reports.filter((r) => r.assignedToId !== userId);

  return (
    <>
      <PageHeader
        eyebrow="My workspace"
        title="Dashboard"
        description="View your assigned tasks and create compliance reports."
        actions={
          <Link to="/wizard"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Create New Report
          </Link>
        }
      />

      <div className="grid grid-cols-12 gap-8">
        <section className="col-span-12 lg:col-span-8 space-y-6">

          {/* Assigned tasks */}
          <div className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                <h2 className="font-display text-base font-semibold">Assigned to me</h2>
              </div>
              <span className="label-eyebrow">{assigned.length} task{assigned.length !== 1 ? "s" : ""}</span>
            </div>
            {assigned.length === 0 ? (
              <div className="px-6 py-8 text-sm text-muted-foreground text-center">
                No reports assigned to you yet. Your manager will assign tasks from the project page.
              </div>
            ) : (
              <ReportTable reports={assigned} navigate={navigate} showProject />
            )}
          </div>

          {/* My created reports */}
          <div className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-display text-base font-semibold">My reports</h2>
              </div>
              <span className="label-eyebrow">{myOwn.length} total</span>
            </div>
            {myOwn.length === 0 ? (
              <div className="px-6 py-8 text-sm text-muted-foreground text-center">
                No reports created yet.{" "}
                <Link to="/wizard" className="underline">Create your first report →</Link>
              </div>
            ) : (
              <ReportTable reports={myOwn} navigate={navigate} />
            )}
          </div>

        </section>
        <aside className="col-span-12 lg:col-span-4 space-y-6">
          <InsightCard title="My summary" reports={[...assigned, ...myOwn]} />
          <AgentsCard />
        </aside>
      </div>
    </>
  );
}

// ─── Sub Admin / Project Manager Dashboard ──────────────────────────────────

function SubAdminDashboard({ reports, navigate }: { reports: Report[]; navigate: ReturnType<typeof useNavigate> }) {
  // Group reports by project
  const byProject: Record<string, { name: string; items: Report[] }> = {};
  const noProject: Report[] = [];

  for (const r of reports) {
    if (r.projectId) {
      const key = String(r.projectId);
      if (!byProject[key]) byProject[key] = { name: r.projectName || `Project ${r.projectId}`, items: [] };
      byProject[key].items.push(r);
    } else {
      noProject.push(r);
    }
  }

  const projectEntries = Object.entries(byProject);

  return (
    <>
      <PageHeader
        eyebrow="Project manager workspace"
        title="Dashboard"
        description="Manage your projects, assign reports to team members, and track compliance progress."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/projects"
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-sm text-sm font-medium hover:bg-accent">
              <Briefcase className="h-4 w-4" /> Projects
            </Link>
            <Link to="/wizard"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90">
              <Plus className="h-4 w-4" /> New Report
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-8">
        <section className="col-span-12 lg:col-span-8 space-y-6">

          {projectEntries.map(([projectId, { name, items }]) => (
            <div key={projectId} className="bg-card border border-border rounded-sm">
              <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <Link to="/projects/$id" params={{ id: projectId }}
                    className="font-display text-base font-semibold hover:underline">{name}</Link>
                </div>
                <span className="label-eyebrow">{items.length} report{items.length !== 1 ? "s" : ""}</span>
              </div>
              <ReportTable reports={items} navigate={navigate} showAssignee />
            </div>
          ))}

          {noProject.length > 0 && (
            <div className="bg-card border border-border rounded-sm">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="font-display text-base font-semibold text-muted-foreground">Unassigned to project</h2>
              </div>
              <ReportTable reports={noProject} navigate={navigate} />
            </div>
          )}

          {projectEntries.length === 0 && noProject.length === 0 && (
            <div className="bg-card border border-border rounded-sm px-6 py-10 text-center text-muted-foreground text-sm">
              No reports yet.{" "}
              <Link to="/projects" className="underline">Create a project</Link> then generate reports.
            </div>
          )}

        </section>
        <aside className="col-span-12 lg:col-span-4 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard icon={<Briefcase className="h-4 w-4" />} label="Projects" value={String(projectEntries.length)} sub="active" />
            <KpiCard icon={<FileCheck2 className="h-4 w-4" />} label="Reports" value={String(reports.length)} sub="total" />
          </div>
          <InsightCard title="Portfolio summary" reports={reports} />
          <AgentsCard />
        </aside>
      </div>
    </>
  );
}

// ─── Super Admin Dashboard ───────────────────────────────────────────────────

function SuperAdminDashboard({ reports, navigate }: { reports: Report[]; navigate: ReturnType<typeof useNavigate> }) {
  const revalidate = useStore((s) => s.revalidate);
  const avg = reports.filter(r => r.score).reduce((a, r) => a + (r.score?.final ?? 0), 0) /
    Math.max(1, reports.filter(r => r.score).length);

  return (
    <>
      <PageHeader
        eyebrow="Report control center"
        title="Compliance Intelligence"
        description="Generate, validate and score audit-ready compliance reports with multi-agent reasoning and full evidence traceability."
        actions={
          <Link to="/wizard"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Create New Report
          </Link>
        }
      />

      <div className="grid grid-cols-12 gap-8">
        <section className="col-span-12 lg:col-span-8 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Avg. compliance" value={`${Math.round(avg) || 0}%`} sub="Across all reports" />
            <KpiCard icon={<FileCheck2 className="h-4 w-4" />} label="Reports" value={String(reports.length)} sub={`${reports.filter(r=>r.status==="Completed").length} completed`} />
            <KpiCard icon={<ShieldCheck className="h-4 w-4" />} label="Active agents" value="7" sub="ISO · RAG · Conflict · Validator · Scorer" />
          </div>

          <div className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <h2 className="font-display text-lg font-semibold">All Reports</h2>
              <span className="label-eyebrow">{reports.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-6 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-left">Report</th>
                    <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-left">Assigned</th>
                    <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-left">Status</th>
                    <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-left">Score</th>
                    <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-left">Updated</th>
                    <th className="px-6 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {r.organization}{r.projectName ? ` · ${r.projectName}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-xs text-muted-foreground">
                        {r.assignedToName
                          ? <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{r.assignedToName}</span>
                          : <span className="opacity-40">—</span>}
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

        <aside className="col-span-12 lg:col-span-4 space-y-6">
          <InsightCard title="System insights" reports={reports} />
          <AgentsCard />
          <RecentErrorsCard />
        </aside>
      </div>
    </>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function ReportTable({
  reports, navigate, showAssignee = false, showProject = false,
}: {
  reports: Report[];
  navigate: ReturnType<typeof useNavigate>;
  showAssignee?: boolean;
  showProject?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-6 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-left">Report</th>
            {showProject && <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-left">Project</th>}
            {showAssignee && <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-left">Assignee</th>}
            <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-left">Status</th>
            <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-left">Score</th>
            <th className="px-6 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
              <td className="px-6 py-4">
                <div className="font-medium">{r.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{r.organization}</div>
              </td>
              {showProject && (
                <td className="px-3 py-4 text-xs text-muted-foreground">
                  {r.projectName || <span className="opacity-40">—</span>}
                </td>
              )}
              {showAssignee && (
                <td className="px-3 py-4 text-xs text-muted-foreground">
                  {r.assignedToName
                    ? <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{r.assignedToName}</span>
                    : <span className="opacity-40">Unassigned</span>}
                </td>
              )}
              <td className="px-3 py-4"><StatusPill status={r.status} /></td>
              <td className="px-3 py-4">{r.score ? <ScoreBadge value={r.score.final} /> : <span className="text-muted-foreground text-xs font-mono">—</span>}</td>
              <td className="px-6 py-4 text-right">
                <div className="inline-flex items-center gap-1">
                  <button onClick={() => navigate({ to: "/reports/$id", params: { id: r.id } })}
                    className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border">View</button>
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

function InsightCard({ title, reports }: { title: string; reports: Report[] }) {
  const avg = Math.round(
    reports.filter(r => r.score).reduce((a, r) => a + (r.score?.final ?? 0), 0) /
    Math.max(1, reports.filter(r => r.score).length)
  );
  const gaps = reports.reduce((a, r) => a + r.validation.filter(v => v.severity === "gap").length, 0);
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="label-eyebrow mb-3">{title}</div>
      <div className="space-y-3">
        <Row label="Average score" value={`${avg || 0}%`} />
        <Row label="Open gaps" value={gaps > 0 ? String(gaps) : "—"} />
        <Row label="Completed" value={String(reports.filter(r => r.status === "Completed").length)} />
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
  const failed = reports.filter((r) => r.status === "Failed").slice(0, 5);
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-3.5 w-3.5 text-[oklch(0.45_0.13_70)]" />
        <span className="label-eyebrow">Recent validation events</span>
      </div>
      {failed.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {failed.map((r) => <li key={r.id} className="text-muted-foreground">· {r.title.slice(0, 40)}</li>)}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No failed reports.</p>
      )}
    </div>
  );
}
