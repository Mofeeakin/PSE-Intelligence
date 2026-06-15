import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, StatusPill } from "@/components/AppShell";
import { projects as projectsApi, admin as adminApi, reports as reportsApi } from "@/lib/api-client";
import type { ReportSummary } from "@/lib/api-client";
import { useStore } from "@/lib/store";
import type { Project, AdminUser } from "@/lib/types";
import { ChevronLeft, UserPlus, X, Loader2, Download, Plus } from "lucide-react";

export const Route = createFileRoute("/projects/$id")({
  head: () => ({ meta: [{ title: "Project Detail — Compliance Intelligence" }] }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const currentUser = useStore((s) => s.currentUser);
  const role = currentUser?.role ?? "user";

  const [project, setProject] = useState<Project | null>(null);
  const [projectReports, setProjectReports] = useState<ReportSummary[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addUserId, setAddUserId] = useState<number | "">("");
  const [addingMember, setAddingMember] = useState(false);
  const [assigningReportId, setAssigningReportId] = useState<number | null>(null);
  const [assignUserId, setAssignUserId] = useState<number | "">("");
  const [assigning, setAssigning] = useState(false);

  const load = () => {
    setLoading(true);
    const projId = Number(id);
    Promise.all([
      projectsApi.get(id),
      reportsApi.list(),
    ]).then(([proj, allReports]) => {
      setProject(proj as unknown as Project);
      setProjectReports(
        (allReports as ReportSummary[]).filter((r) => r.project === projId)
      );
    }).catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (role === "super_admin" || role === "sub_admin") {
      adminApi.listUsers().then(setAllUsers).catch(() => {});
    }
  }, [id, role]);

  const handleAddMember = async () => {
    if (!addUserId) return;
    setAddingMember(true);
    try {
      const updated = await projectsApi.addMember(id, Number(addUserId)) as unknown as Project;
      setProject(updated);
      setAddUserId("");
      setShowAddMember(false);
    } catch { /* ignore */ } finally { setAddingMember(false); }
  };

  const handleRemoveMember = async (userId: number) => {
    try {
      const updated = await projectsApi.removeMember(id, userId) as unknown as Project;
      setProject(updated);
    } catch { /* ignore */ }
  };

  const handleStatusChange = async (newStatus: "active" | "completed" | "archived") => {
    try {
      const updated = await projectsApi.update(id, { status: newStatus }) as unknown as Project;
      setProject(updated);
    } catch { /* ignore */ }
  };

  const handleAssignReport = async () => {
    if (!assigningReportId || !assignUserId) return;
    setAssigning(true);
    try {
      await reportsApi.assign(assigningReportId, Number(assignUserId));
      setAssigningReportId(null);
      setAssignUserId("");
    } catch { /* ignore */ } finally { setAssigning(false); }
  };

  if (loading) return (
    <div className="flex items-center gap-2 justify-center py-20 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
  if (!project) return <div className="py-20 text-center text-muted-foreground">Project not found.</div>;

  const canManage = role === "super_admin" || role === "sub_admin";

  return (
    <>
      <PageHeader
        eyebrow={project.client_name}
        title={project.name}
        description={project.description || project.client_details || ""}
        actions={
          <Link to="/projects" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> All Projects
          </Link>
        }
      />

      <div className="grid grid-cols-12 gap-8">
        {/* Reports column */}
        <section className="col-span-12 lg:col-span-8 space-y-4">
          <div className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <h2 className="font-display text-base font-semibold">Reports</h2>
              <div className="flex items-center gap-3">
                <span className="label-eyebrow">{projectReports.length}</span>
                <button
                  onClick={() => navigate({ to: "/wizard", search: { draft: undefined, project: id } })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-sm hover:opacity-90 transition-opacity"
                >
                  <Plus className="h-3 w-3" /> New Report
                </button>
              </div>
            </div>
            {projectReports.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground text-center">No reports in this project yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-6 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Title</th>
                      <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Updated</th>
                      <th className="px-6 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectReports.map((r) => (
                      <>
                        <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                          <td className="px-6 py-3 font-medium">{r.title}</td>
                          <td className="px-3 py-3"><StatusPill status={r.status} /></td>
                          <td className="px-3 py-3 text-xs text-muted-foreground font-mono">{new Date(r.updated_at).toLocaleDateString()}</td>
                          <td className="px-6 py-3 text-right">
                            <div className="inline-flex gap-1">
                              <button onClick={() => navigate({ to: "/reports/$id", params: { id: String(r.id) } })}
                                className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border">View</button>
                              {canManage && (
                                <button
                                  onClick={() => setAssigningReportId(assigningReportId === r.id ? null : r.id)}
                                  className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border inline-flex items-center gap-1">
                                  Assign
                                </button>
                              )}
                              <button onClick={() => navigate({ to: "/reports/$id/export", params: { id: String(r.id) } })}
                                className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border inline-flex items-center gap-1">
                                <Download className="h-3 w-3" /> Export
                              </button>
                            </div>
                          </td>
                        </tr>
                        {assigningReportId === r.id && (
                          <tr key={`assign-${r.id}`} className="border-b border-border bg-accent/20">
                            <td colSpan={4} className="px-6 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground shrink-0">Assign to:</span>
                                <select
                                  value={assignUserId}
                                  onChange={(e) => setAssignUserId(Number(e.target.value) || "")}
                                  className="flex-1 text-sm bg-background border border-border rounded-sm px-2 py-1 focus:outline-none"
                                >
                                  <option value="">Select staff member…</option>
                                  {allUsers.map((u) => (
                                    <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                                  ))}
                                </select>
                                <button onClick={handleAssignReport} disabled={!assignUserId || assigning}
                                  className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-sm disabled:opacity-40">
                                  {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Assign"}
                                </button>
                                <button onClick={() => { setAssigningReportId(null); setAssignUserId(""); }}
                                  className="p-1 text-muted-foreground hover:text-foreground">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Sidebar */}
        <aside className="col-span-12 lg:col-span-4 space-y-4">
          {/* Project info */}
          <div className="bg-card border border-border rounded-sm p-5 space-y-3">
            <div className="label-eyebrow mb-1">Project info</div>
            <Row label="Client" value={project.client_name} />
            <Row label="Standard" value={project.standard_name ?? "—"} />
            {project.report_types?.length > 0 && (
              <Row label="Report types" value={project.report_types.map((t) => t === "audit_report" ? "Audit" : "Gap Assessment").join(", ")} />
            )}
            <Row label="Created by" value={project.created_by_name ?? "—"} />
            <Row label="Reports" value={String(project.report_count)} />
            <Row label="Members" value={String(project.member_count)} />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              {canManage ? (
                <select
                  value={project.status}
                  onChange={(e) => handleStatusChange(e.target.value as "active" | "completed" | "archived")}
                  className="text-xs font-mono bg-background border border-border rounded-sm px-2 py-1 focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              ) : (
                <span className="text-sm font-medium capitalize">{project.status}</span>
              )}
            </div>
          </div>

          {/* Members (super_admin and sub_admin can manage) */}
          {(role === "super_admin" || role === "sub_admin") && (
            <div className="bg-card border border-border rounded-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="label-eyebrow">Members</div>
                <button onClick={() => setShowAddMember((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <UserPlus className="h-3.5 w-3.5" /> Add
                </button>
              </div>

              {showAddMember && (
                <div className="flex gap-2">
                  <select
                    value={addUserId}
                    onChange={(e) => setAddUserId(Number(e.target.value) || "")}
                    className="flex-1 text-sm bg-background border border-border rounded-sm px-2 py-1.5 focus:outline-none"
                  >
                    <option value="">Select user…</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                    ))}
                  </select>
                  <button onClick={handleAddMember} disabled={!addUserId || addingMember}
                    className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-sm disabled:opacity-40">
                    {addingMember ? "…" : "Add"}
                  </button>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {project.member_count === 0 ? "No members assigned." : `${project.member_count} member(s) assigned.`}
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
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
