import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader, ScoreBadge, StatusPill } from "@/components/AppShell";
import {
  Plus, FileCheck2, Download, ShieldCheck, Activity, AlertTriangle,
  TrendingUp, FolderOpen, Users, ClipboardCheck, CheckCircle2, Loader2,
  UserPlus, Settings, Database, Cpu, BarChart3, ShieldAlert, KeyRound,
} from "lucide-react";
import {
  projects as projectsApi, reports as reportsApi,
  notifications as notifApi, admin as adminApi,
  type Notification,
} from "@/lib/api-client";
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

  if (role === "super_admin") return <SuperAdminDashboard />;
  if (role === "sub_admin") return <SubAdminDashboard />;
  return <StaffDashboard />;
}

// ── Super Admin Dashboard ─────────────────────────────────────────────────────

function SuperAdminDashboard() {
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
    adminApi.listUsers().then(setAllUsers).catch(() => {});
  }, [loadReports]);

  const pendingReview = reports.filter((r) => r.status === "Pending Review");
  const staffCount = allUsers.filter((u) => u.role === "user").length;
  const pmCount = allUsers.filter((u) => u.role === "sub_admin").length;
  const avg = Math.round(
    reports.filter(r => r.score).reduce((a, r) => a + (r.score?.final ?? 0), 0) /
    Math.max(1, reports.filter(r => r.score).length)
  );

  const handleApprove = async (reportId: string) => {
    setApprovingId(Number(reportId));
    try { await reportsApi.approve(reportId); loadReports(); }
    catch { /* ignore */ } finally { setApprovingId(null); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Super Admin · Full Access"
        title="System Control"
        description="Platform-wide oversight — users, projects, reports, AI pipeline, and approvals."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/admin"
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-sm text-sm font-medium hover:bg-accent transition-colors">
              <Users className="h-4 w-4" /> Manage Users
            </Link>
            <Link to="/projects"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90">
              <FolderOpen className="h-4 w-4" /> Projects
            </Link>
          </div>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <KpiCard icon={<Users className="h-4 w-4" />} label="Total Users" value={String(allUsers.length)} sub={`${pmCount} PM · ${staffCount} staff`} />
        <KpiCard icon={<FolderOpen className="h-4 w-4" />} label="Projects" value={String(projects.length)} sub="Active client projects" />
        <KpiCard icon={<FileCheck2 className="h-4 w-4" />} label="All Reports" value={String(reports.length)} sub="Across all projects" />
        <KpiCard icon={<ClipboardCheck className="h-4 w-4" />} label="Pending Review" value={String(pendingReview.length)} sub="Awaiting approval" accent={pendingReview.length > 0} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Avg Score" value={`${avg || 0}%`} sub="Scored reports" />
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Main column */}
        <section className="col-span-12 lg:col-span-8 space-y-6">

          {/* Quick-access system tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SystemTile icon={<KeyRound className="h-5 w-5" />} label="User Management" to="/admin" />
            <SystemTile icon={<FolderOpen className="h-5 w-5" />} label="All Projects" to="/projects" />
            <SystemTile icon={<Cpu className="h-5 w-5" />} label="AI Transparency" to="/transparency" />
            <SystemTile icon={<BarChart3 className="h-5 w-5" />} label="Reports Archive" onClick={() => navigate({ to: "/" })} />
          </div>

          {/* All Reports */}
          <div className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <h2 className="font-display text-base font-semibold">All Reports</h2>
              <span className="label-eyebrow">{reports.length} total</span>
            </div>
            <ReportsTable reports={reports.slice(0, 8)} onNavigate={navigate} showApprove onApprove={handleApprove} approvingId={approvingId} />
          </div>

          {/* Users quick-list */}
          <div className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <h2 className="font-display text-base font-semibold">Team Members</h2>
              <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                <UserPlus className="h-3.5 w-3.5" /> Manage →
              </Link>
            </div>
            {allUsers.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground text-center">No users yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {allUsers.slice(0, 6).map((u) => (
                  <div key={u.id} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{u.username}</span>
                      <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
                    </div>
                    <RolePill role={u.role} />
                  </div>
                ))}
                {allUsers.length > 6 && (
                  <div className="px-6 py-3 text-xs text-muted-foreground">+{allUsers.length - 6} more — <Link to="/admin" className="text-primary hover:underline">view all</Link></div>
                )}
              </div>
            )}
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

          <ProjectsSummaryCard projects={projects} loading={loadingProjects} />
          <InsightCard />
          <AgentsCard />
        </aside>
      </div>
    </>
  );
}

// ── Sub Admin / PM Dashboard ──────────────────────────────────────────────────

function SubAdminDashboard() {
  const reports = useStore((s) => s.reports);
  const loadReports = useStore((s) => s.loadReports);
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  useEffect(() => {
    loadReports();
    projectsApi.list().then(setProjects).catch(() => {}).finally(() => setLoadingProjects(false));
  }, [loadReports]);

  const pendingReview = reports.filter((r) => r.status === "Pending Review");
  const activeReports = reports.filter((r) => !["Completed", "Approved", "Failed"].includes(r.status));

  const handleApprove = async (reportId: string) => {
    setApprovingId(Number(reportId));
    try { await reportsApi.approve(reportId); loadReports(); }
    catch { /* ignore */ } finally { setApprovingId(null); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Project Manager"
        title="Project Overview"
        description="Manage your projects, assign reports to auditors, and review completed work."
        actions={
          <Link to="/projects"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90">
            <Plus className="h-4 w-4" /> New Project
          </Link>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <KpiCard icon={<FolderOpen className="h-4 w-4" />} label="My Projects" value={String(projects.length)} sub="Active client engagements" />
        <KpiCard icon={<Activity className="h-4 w-4" />} label="Active Reports" value={String(activeReports.length)} sub="In progress" />
        <KpiCard icon={<ClipboardCheck className="h-4 w-4" />} label="Pending Review" value={String(pendingReview.length)} sub="Awaiting your approval" accent={pendingReview.length > 0} />
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Main */}
        <section className="col-span-12 lg:col-span-8 space-y-6">
          {/* Projects table */}
          <div className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <h2 className="font-display text-base font-semibold">My Projects</h2>
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
                  <Plus className="h-3.5 w-3.5" /> Create first project
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
                      <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Reports</th>
                      <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Members</th>
                      <th className="px-6 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                        <td className="px-6 py-3">
                          <div className="font-medium">{p.name}</div>
                          <span className={`text-[10px] font-mono uppercase tracking-wider ${p.status === "active" ? "text-[oklch(0.4_0.12_145)]" : "text-muted-foreground"}`}>{p.status}</span>
                        </td>
                        <td className="px-3 py-3 text-sm text-muted-foreground">{p.client_name}</td>
                        <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{p.standard_name ?? "—"}</td>
                        <td className="px-3 py-3 text-sm font-mono">{p.report_count}</td>
                        <td className="px-3 py-3 text-sm font-mono">{p.member_count}</td>
                        <td className="px-6 py-3 text-right">
                          <button onClick={() => navigate({ to: "/projects/$id", params: { id: String(p.id) } })}
                            className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border">
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Reports */}
          <div className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <h2 className="font-display text-base font-semibold">Recent Reports</h2>
              <span className="label-eyebrow">{reports.length} total</span>
            </div>
            <ReportsTable reports={reports.slice(0, 6)} onNavigate={navigate} showApprove onApprove={handleApprove} approvingId={approvingId} />
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
        </aside>
      </div>
    </>
  );
}

// ── Staff / Auditor Dashboard ─────────────────────────────────────────────────

function StaffDashboard() {
  const reports = useStore((s) => s.reports);
  const loadReports = useStore((s) => s.loadReports);
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
        eyebrow="Auditor workspace"
        title="My Tasks"
        description="Reports assigned to you, your drafts, and submission status."
        actions={
          <Link to="/wizard" search={{ draft: undefined, project: undefined }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> New Report
          </Link>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard icon={<FileCheck2 className="h-4 w-4" />} label="Assigned Reports" value={String(reports.length)} sub="Yours + assigned" />
        <KpiCard icon={<Activity className="h-4 w-4" />} label="In Progress" value={String(inProgress.length + drafts.length)} sub="Draft or processing" />
        <KpiCard icon={<ClipboardCheck className="h-4 w-4" />} label="Pending Review" value={String(pendingReview.length)} sub="Submitted, awaiting PM" />
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
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">No reports yet. Start by creating a new report above.</td></tr>
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
                        <button onClick={() => navigate({ to: "/wizard", search: { draft: r.id, project: undefined } })}
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

function ReportsTable({
  reports, onNavigate, showApprove, onApprove, approvingId,
}: {
  reports: import("@/lib/types").Report[];
  onNavigate: ReturnType<typeof useNavigate>;
  showApprove?: boolean;
  onApprove?: (id: string) => void;
  approvingId?: number | null;
}) {
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
                  {showApprove && r.status === "Pending Review" && onApprove && (
                    <button
                      disabled={approvingId === Number(r.id)}
                      onClick={() => onApprove(r.id)}
                      className="px-2.5 py-1.5 text-xs rounded-sm bg-success/15 text-[oklch(0.4_0.12_145)] hover:bg-success/25 border border-transparent disabled:opacity-50 inline-flex items-center gap-1">
                      {approvingId === Number(r.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Approve
                    </button>
                  )}
                  {["Completed", "Approved"].includes(r.status) && (
                    <button onClick={() => onNavigate({ to: "/reports/$id/export", params: { id: r.id } })}
                      className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border inline-flex items-center gap-1">
                      <Download className="h-3 w-3" />Export
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`border rounded-sm p-5 ${accent ? "bg-warning/5 border-warning/30" : "bg-card border-border"}`}>
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="label-eyebrow">{label}</span></div>
      <div className={`mt-3 font-display text-3xl font-semibold tracking-tight ${accent ? "text-[oklch(0.45_0.13_70)]" : ""}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function SystemTile({ icon, label, to, onClick }: { icon: React.ReactNode; label: string; to?: string; onClick?: () => void }) {
  const cls = "flex flex-col items-center justify-center gap-2 p-4 bg-card border border-border rounded-sm hover:border-foreground/20 hover:bg-accent/40 transition-all cursor-pointer text-center group";
  const inner = (
    <>
      <div className="text-muted-foreground group-hover:text-foreground transition-colors">{icon}</div>
      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
    </>
  );
  if (to) return <Link to={to as "/admin"} className={cls}>{inner}</Link>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
}

function RolePill({ role }: { role: string }) {
  const map: Record<string, string> = {
    super_admin: "bg-primary/10 text-primary",
    sub_admin: "bg-info/15 text-[oklch(0.4_0.12_240)]",
    user: "bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = { super_admin: "Super Admin", sub_admin: "PM", user: "Staff" };
  return (
    <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm ${map[role] ?? "bg-muted"}`}>
      {label[role] ?? role}
    </span>
  );
}

function ProjectsSummaryCard({ projects, loading }: { projects: Project[]; loading: boolean }) {
  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="label-eyebrow">Projects at a glance</div>
        <Link to="/projects" className="text-xs text-primary hover:underline">All →</Link>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      ) : (
        <ul className="space-y-2">
          {projects.slice(0, 4).map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <span className="text-sm truncate max-w-[60%]">{p.name}</span>
              <span className="text-xs font-mono text-muted-foreground">{p.report_count} reports</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InsightCard() {
  const reports = useStore((s) => s.reports);
  const avg = Math.round(
    reports.filter(r => r.score).reduce((a, r) => a + (r.score?.final ?? 0), 0) /
    Math.max(1, reports.filter(r => r.score).length)
  );
  const gaps = reports.reduce((a, r) => a + r.validation.filter(v => v.severity === "gap").length, 0);
  const conflicts = reports.reduce((a, r) => a + r.conflicts.length, 0);
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
