import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageHeader, StatusPill } from "@/components/AppShell";
import { projects as projectsApi, admin as adminApi, projectLogo as projectLogoApi } from "@/lib/api-client";
import { useStore } from "@/lib/store";
import type { Project, AdminUser, ProjectLogo } from "@/lib/types";
import { ChevronLeft, UserPlus, X, Loader2, Download, Image, Upload } from "lucide-react";
import { reports as reportsApi } from "@/lib/api-client";

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
  const [projectReports, setProjectReports] = useState<Array<{ id: number; title: string; status: string; updated_at: string }>>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addUserId, setAddUserId] = useState<number | "">("");
  const [addingMember, setAddingMember] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      projectsApi.get(id),
      reportsApi.list(),
    ]).then(([proj, allReports]) => {
      setProject(proj as unknown as Project);
      const projId = Number(id);
      setProjectReports(
        (allReports as Array<{ id: number; title: string; status: string; updated_at: string; project?: number }>)
          .filter((r) => r.project === projId)
      );
    }).catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (role === "super_admin") {
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
              <span className="label-eyebrow">{projectReports.length}</span>
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
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                        <td className="px-6 py-3 font-medium">{r.title}</td>
                        <td className="px-3 py-3"><StatusPill status={r.status} /></td>
                        <td className="px-3 py-3 text-xs text-muted-foreground font-mono">{new Date(r.updated_at).toLocaleDateString()}</td>
                        <td className="px-6 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <button onClick={() => navigate({ to: "/reports/$id", params: { id: String(r.id) } })}
                              className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border">View</button>
                            <button onClick={() => navigate({ to: "/reports/$id/export", params: { id: String(r.id) } })}
                              className="px-2.5 py-1.5 text-xs rounded-sm hover:bg-accent border border-transparent hover:border-border inline-flex items-center gap-1">
                              <Download className="h-3 w-3" /> Export
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
        </section>

        {/* Sidebar */}
        <aside className="col-span-12 lg:col-span-4 space-y-4">
          {/* Project info */}
          <div className="bg-card border border-border rounded-sm p-5 space-y-3">
            <div className="label-eyebrow mb-1">Project info</div>
            <Row label="Client" value={project.client_name} />
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

          {/* Members (super_admin can manage) */}
          {role === "super_admin" && (
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

          {/* Project logo (sub_admin and super_admin) */}
          {canManage && <ProjectLogoPanel projectId={id} />}
        </aside>
      </div>
    </>
  );
}

const PLACEMENT_OPTIONS = [
  { value: "cover_only",     label: "Cover page only" },
  { value: "every_page",     label: "Every page" },
  { value: "selected_pages", label: "Selected pages" },
] as const;

function ProjectLogoPanel({ projectId }: { projectId: string }) {
  const [logo, setLogo]           = useState<ProjectLogo | null>(null);
  const [preview, setPreview]     = useState<string | null>(null);
  const [file, setFile]           = useState<File | null>(null);
  const [placement, setPlacement] = useState<ProjectLogo["placement"]>("cover_only");
  const [widthInches, setWidth]   = useState(2.4);
  const [pagesInput, setPages]    = useState("");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg]             = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    projectLogoApi.get(projectId).then((d) => {
      if (d.logo) {
        setLogo(d.logo);
        setPlacement(d.logo.placement);
        setWidth(d.logo.width_inches);
        setPages((d.logo.pages ?? []).join(", "));
        setPreview(d.logo.image_url);
      }
    }).catch(() => {});
  }, [projectId]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    setUploading(true);
    setMsg("");
    try {
      const form = new FormData();
      if (file) form.append("image", file);
      form.append("placement", placement);
      form.append("width_inches", String(widthInches));
      const pages = placement === "selected_pages"
        ? pagesInput.split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n > 0)
        : [];
      form.append("pages", JSON.stringify(pages));
      const updated = await projectLogoApi.upload(projectId, form);
      setLogo(updated);
      setMsg("Project logo saved.");
    } catch {
      setMsg("Failed to save logo.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    try {
      await projectLogoApi.remove(projectId);
      setLogo(null); setPreview(null); setFile(null); setPages(""); setPlacement("cover_only");
    } catch { /* ignore */ }
  };

  return (
    <div className="bg-card border border-border rounded-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="label-eyebrow">Project logo</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Applied to all reports in this project unless overridden per-report.</p>
        </div>
        {logo && (
          <button onClick={handleRemove} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
            <X className="h-3 w-3" /> Remove
          </button>
        )}
      </div>

      <div onClick={() => fileRef.current?.click()}
        className="border border-dashed border-border rounded-sm p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-accent/30 min-h-[90px]">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        {preview
          ? <img src={preview} alt="Logo preview" className="max-h-16 max-w-[160px] object-contain" />
          : <><Image className="h-6 w-6 text-muted-foreground/40" /><p className="text-xs text-muted-foreground">Click to upload</p></>}
      </div>

      <div className="space-y-1.5">
        <label className="label-eyebrow">Placement</label>
        <div className="grid grid-cols-1 gap-1.5">
          {PLACEMENT_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setPlacement(opt.value)}
              className={`text-left px-3 py-2 rounded-sm border text-xs transition-colors ${
                placement === opt.value
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/30"
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {placement === "selected_pages" && (
        <div className="space-y-1">
          <label className="label-eyebrow">Section numbers (comma-separated)</label>
          <input type="text" value={pagesInput} onChange={(e) => setPages(e.target.value)}
            placeholder="e.g. 1, 2, 3"
            className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-sm focus:outline-none focus:border-primary font-mono" />
        </div>
      )}

      <div className="space-y-1">
        <label className="label-eyebrow">Width — {widthInches.toFixed(1)}"</label>
        <input type="range" min={1.0} max={4.0} step={0.1} value={widthInches}
          onChange={(e) => setWidth(parseFloat(e.target.value))}
          className="w-full accent-primary" />
      </div>

      <div className="flex items-center gap-2">
        <button onClick={handleSave} disabled={uploading || (!file && !logo)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-sm hover:opacity-90 disabled:opacity-40">
          <Upload className="h-3 w-3" /> {uploading ? "Saving…" : "Save logo"}
        </button>
        {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
      </div>
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
