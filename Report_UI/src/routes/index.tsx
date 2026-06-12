import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader, ScoreBadge, StatusPill } from "@/components/AppShell";
import {
  Plus, FileCheck2, Download, ShieldCheck, Activity, AlertTriangle,
  TrendingUp, FolderOpen, Users, ClipboardCheck, CheckCircle2, Loader2,
} from "lucide-react";
import { projects as projectsApi, reports as reportsApi, notifications as notifApi, admin as adminApi, type Notification } from "@/lib/api-client";
import type { Project, AdminUser } from "@/lib/types";

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
  const currentUser = useStore((s) => s.currentUser);
  const role = currentUser?.role ?? "user";

  if (role === "super_admin" || role === "sub_admin") return <AdminDashboard role={role} />;
  return <StaffDashboard />;
}

// ── Admin / Sub Admin Dashboard ──────────────────────────────────────────────

function AdminDashboard({ role }: { role: string }) {
  const reports = useStore((s) => s.reports);
  const loadReports = useStore((s) => s.loadReports);
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  useEffect(() => {
    loadReports();
    projectsApi.list().then(setProjects).catch(() => {}).finally(() => setLoadingProjects(false));
    if (role === "super_admin") adminApi.listUsers().then(setAllUsers).catch(() => {});
  }, [loadReports, role]);

  const avg = Math.round(
    reports.filter(r => r.score).reduce((a, r) => a + (r.score?.final ?? 0), 0) /
    Math.max(1, reports.filter(r => r.score).length)
  );

  const pendingReview = reports.filter((r) => r.status === "Pending Review");
  const staffCount = allUsers.filter((u) => u.role === "user").length;

  const handleApprove = async (reportId: string) => {
    setApprovingId(Number(reportId));
    try {
      await reportsApi.approve(reportId);
      loadReports();
    } catch { /* ignore */ } finally { setApprovingId(null); }
  };

  return (
    <>
      <PageHeader
        eyebrow="System overview"
        title="Admin Dashboard"
        description="Manage projects, assign reports to staff, and oversee all compliance work."
        actions={
          <Link to="/projects"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity">
            <FolderOpen className="h-4 w-4" /> Manage Projects
          </Link>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard icon={<FolderOpen className="h-4 w-4" />} label="Total Projects" value={String(projects.length)} sub="All projects" />
        <KpiCard icon={<FileCheck2 className="h-4 w-4" />} label="Active Reports" value={String(reports.filter(r => !["Completed","Approved"].includes(r.status)).length)} sub="In progress" />
        {role === "super_admin" && (
          <KpiCard icon={<Users className="h-4 w-4" />} label="Staff Members" value={String(staffCount)} sub="Active users" />
        )}
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Avg Score" value={`${avg || 0}%`} sub="Scored reports" />
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Projects table */}
        <section className="col-span-12 lg:col-span-8 space-y-6">
          <div className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <h2 className="font-display text-base font-semibold">Projects</h2>
              <Link to="/projects" className="text-xs text-primary hover:underline">View all →</Link>
            </div>
            {loadingProjects ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : projects.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-muted-foreground mb-3">No projects yet.</p>
                <Link to="/projects"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-sm">
                  <Plus className="h-3.5 w-3.5" /> Create a project
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-6 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Project</th>
                      <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Client</th>
                      <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Standard</th>
                      <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Reports</th>
                      <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Members</th>
                      <th className="px-6 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.slice(0, 8).map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                        <td className="px-6 py-3">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.created_by_name}</div>
                        </td>
                        <td className="px-3 py-3 text-sm text-muted-foreground">{p.client_name}</td>
                        <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{p.standard_name ?? "—"}</td>
                        <td className="px-3 py-3">
                          <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm inline-block
                            ${p.status === "active" ? "bg-success/15 text-[oklch(0.4_0.12_145)]" :
                              p.status === "completed" ? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground/60"}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm font-mono">{p.report_count}</td>
                        <td className="px-3 py-3 text-sm font-mono">{p.member_count}</td>
                        <td className="px-6 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <button onClick={() => navigate({ to: "/projects/$id", params: { id: String(p.id) } })}
                              className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border">
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* All Reports table */}
          <div className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <h2 className="font-display text-base font-semibold">Recent Reports</h2>
              <span className="label-eyebrow">{reports.length} total</span>
            </div>
            <ReportsTable reports={reports.slice(0, 6)} onNavigate={navigate} />
          </div>
        </section>

        {/* Sidebar */}
        <aside className="col-span-12 lg:col-span-4 space-y-6">
          {/* Pending Review */}
          <div className="bg-card border border-border rounded-sm">
            <div className="px-5 py-4 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-[oklch(0.45_0.13_70)]" />
                <span className="label-eyebrow">Pending Review</span>
              </div>
              {pendingReview.length > 0 && (
                <span className="text-[10px] font-mono bg-warning/15 text-[oklch(0.45_0.13_70)] px-1.5 py-0.5 rounded-sm">
                  {pendingReview.length}
                </span>
              )}
            </div>
            {pendingReview.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted-foreground">No reports awaiting review.</p>
            ) : (
              <ul className="divide-y divide-border">
                {pendingReview.map((r) => (
                  <li key={r.id} className="px-5 py-3">
                    <p className="text-sm font-medium leading-snug">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.organization}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => navigate({ to: "/reports/$id", params: { id: r.id } })}
                        className="px-2 py-1 text-xs rounded-sm hover:bg-accent border border-border">View</button>
                      <button
                        disabled={approvingId === Number(r.id)}
                        onClick={() => handleApprove(r.id)}
                        className="px-2 py-1 text-xs rounded-sm bg-success/15 text-[oklch(0.4_0.12_145)] hover:bg-success/25 border border-transparent disabled:opacity-50 inline-flex items-center gap-1">
                        {approvingId === Number(r.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Approve
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <InsightCard />
          <AgentsCard />
        </aside>
      </div>
    </>
  );
}

// ── Staff Dashboard ───────────────────────────────────────────────────────────

function StaffDashboard() {
  const reports = useStore((s) => s.reports);
  const loadReports = useStore((s) => s.loadReports);
  const revalidate = useStore((s) => s.revalidate);
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadReports();
    notifApi.list().then((all) => setNotifs(all.filter((n) => !n.is_read))).catch(() => {});
  }, [loadReports]);

  const drafts = reports.filter((r) => r.status === "Draft");
  const inProgress = reports.filter((r) => ["Processing", "Validation", "Scored"].includes(r.status));
  const pendingReview = reports.filter((r) => r.status === "Pending Review");

  const visibleNotifs = notifs.filter((n) => !dismissedIds.has(n.id));

  const dismiss = (id: number) => {
    notifApi.markRead(id).catch(() => {});
    setDismissedIds((prev) => new Set([...prev, id]));
  };

  return (
    <>
      <PageHeader
        eyebrow="My workspace"
        title="My Tasks"
        description="Reports assigned to you, your drafts, and current processing status."
        actions={
          <Link to="/wizard" search={{ draft: undefined }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> New Report
          </Link>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard icon={<FileCheck2 className="h-4 w-4" />} label="Assigned Reports" value={String(reports.length)} sub="Yours + assigned" />
        <KpiCard icon={<Activity className="h-4 w-4" />} label="In Progress" value={String(inProgress.length + drafts.length)} sub="Draft or processing" />
        <KpiCard icon={<ClipboardCheck className="h-4 w-4" />} label="Pending Review" value={String(pendingReview.length)} sub="Awaiting admin" />
      </div>

      {/* Notification banners */}
      {visibleNotifs.length > 0 && (
        <div className="mb-6 space-y-2">
          {visibleNotifs.slice(0, 3).map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-3 bg-primary/5 border border-primary/20 rounded-sm px-4 py-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-sm">{n.message}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {n.report && (
                  <button onClick={() => navigate({ to: "/reports/$id", params: { id: String(n.report) } })}
                    className="text-xs text-primary hover:underline">Open</button>
                )}
                <button onClick={() => dismiss(n.id)} className="text-muted-foreground hover:text-foreground text-xs">Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reports table */}
      <div className="bg-card border border-border rounded-sm">
        <div className="px-6 py-4 flex items-center justify-between border-b border-border">
          <h2 className="font-display text-base font-semibold">My Reports</h2>
          <span className="label-eyebrow">{reports.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-6 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Report</th>
                <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Score</th>
                <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Updated</th>
                <th className="px-6 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">No reports yet. Create your first report above.</td></tr>
              )}
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{r.organization} · {r.department}</div>
                  </td>
                  <td className="px-3 py-4 text-muted-foreground font-mono text-xs">
                    <div>{r.type}</div>
                    {r.serviceType && <div className="text-[10px] uppercase tracking-wider mt-0.5 opacity-70">{r.serviceType === "gap_assessment" ? "Gap" : "Audit"}</div>}
                  </td>
                  <td className="px-3 py-4"><StatusPill status={r.status} /></td>
                  <td className="px-3 py-4">{r.score ? <ScoreBadge value={r.score.final} /> : <span className="text-muted-foreground text-xs font-mono">—</span>}</td>
                  <td className="px-3 py-4 text-muted-foreground text-xs font-mono">{new Date(r.updatedAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-1 flex-wrap justify-end">
                      {r.status === "Draft" ? (
                        <button onClick={() => navigate({ to: "/wizard", search: { draft: r.id } })}
                          className="px-2.5 py-1.5 text-xs rounded-sm bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20">
                          Resume Draft
                        </button>
                      ) : (
                        <button onClick={() => navigate({ to: "/reports/$id", params: { id: r.id } })}
                          className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border">
                          View
                        </button>
                      )}
                      {r.status === "Completed" && (
                        <button onClick={async () => { await reportsApi.submitReview(r.id); loadReports(); }}
                          className="px-2.5 py-1.5 text-xs rounded-sm bg-warning/10 text-[oklch(0.45_0.13_70)] border border-warning/20 hover:bg-warning/20">
                          Submit for Review
                        </button>
                      )}
                      {["Completed", "Approved"].includes(r.status) && (
                        <button onClick={() => navigate({ to: "/reports/$id/export", params: { id: r.id } })}
                          className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border inline-flex items-center gap-1">
                          <Download className="h-3 w-3" /> Export
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ReportsTable({ reports, onNavigate }: { reports: import("@/lib/types").Report[], onNavigate: ReturnType<typeof useNavigate> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-6 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Report</th>
            <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Status</th>
            <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Score</th>
            <th className="px-6 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {reports.length === 0 && (
            <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-foreground">No reports yet.</td></tr>
          )}
          {reports.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
              <td className="px-6 py-3">
                <div className="font-medium">{r.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{r.organization}</div>
              </td>
              <td className="px-3 py-3"><StatusPill status={r.status} /></td>
              <td className="px-3 py-3">{r.score ? <ScoreBadge value={r.score.final} /> : <span className="text-muted-foreground text-xs font-mono">—</span>}</td>
              <td className="px-6 py-3 text-right">
                <div className="inline-flex gap-1">
                  <button onClick={() => onNavigate({ to: "/reports/$id", params: { id: r.id } })}
                    className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border">View</button>
                  <button onClick={() => onNavigate({ to: "/reports/$id/export", params: { id: r.id } })}
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

function InsightCard() {
  const reports = useStore((s) => s.reports);
  const avg = Math.round(
    reports.filter(r => r.score).reduce((a, r) => a + (r.score?.final ?? 0), 0) /
    Math.max(1, reports.filter(r => r.score).length)
  );
  const conflicts = reports.reduce((a, r) => a + r.conflicts.length, 0);
  const gaps = reports.reduce((a, r) => a + r.validation.filter(v => v.severity === "gap").length, 0);
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="label-eyebrow mb-3">System Insights</div>
      <div className="space-y-3">
        <Row label="Average score" value={`${avg || 0}%`} />
        <Row label="Open gaps" value={gaps > 0 ? String(gaps) : "—"} />
        <Row label="Resolved conflicts" value={conflicts > 0 ? String(conflicts) : "—"} />
      </div>
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
              <span className={`h-1.5 w-1.5 rounded-full ${a.status === "ready" ? "bg-[oklch(0.5_0.12_145)]" : "bg-muted-foreground/50"}`} />
              {a.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
