import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { projects as projectsApi, reports as reportsApi, admin as adminApi } from "@/lib/api-client";
import { useStore } from "@/lib/store";
import type { Project, AdminUser } from "@/lib/types";
import { Plus, Users, FileCheck2, ChevronRight, Loader2, X } from "lucide-react";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "Projects — Compliance Intelligence" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const currentUser = useStore((s) => s.currentUser);
  const role = currentUser?.role ?? "user";
  const navigate = useNavigate();

  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    setLoading(true);
    projectsApi.list()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (role === "user") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center gap-3">
        <p className="text-muted-foreground text-sm">You don't have access to project management.</p>
        <Link to="/" className="text-primary text-sm hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Project management"
        title="Projects"
        description="Organise compliance work by client project. Assign staff and track all associated reports."
        actions={
          (role === "super_admin" || role === "sub_admin") ? (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New Project
            </button>
          ) : undefined
        }
      />

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No projects yet.</p>
          {(role === "sub_admin" || role === "super_admin") && (
            <button onClick={() => setShowCreate(true)} className="mt-3 text-primary text-sm hover:underline">Create your first project</button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((p) => (
            <ProjectCard key={p.id} project={p} onSelect={() => navigate({ to: "/projects/$id", params: { id: String(p.id) } })} />
          ))}
        </div>
      )}
    </>
  );
}

function ProjectCard({ project, onSelect }: { project: Project; onSelect: () => void }) {
  const STATUS_COLOURS: Record<string, string> = {
    active:    "bg-success/15 text-[oklch(0.4_0.12_145)]",
    completed: "bg-info/15 text-[oklch(0.4_0.12_240)]",
    archived:  "bg-muted text-muted-foreground",
  };

  return (
    <div
      onClick={onSelect}
      className="bg-card border border-border rounded-sm p-5 cursor-pointer hover:border-foreground/20 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{project.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{project.client_name}</div>
        </div>
        <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0 ${STATUS_COLOURS[project.status] || "bg-muted"}`}>
          {project.status}
        </span>
      </div>

      {project.description && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{project.description}</p>
      )}

      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {project.member_count} members</span>
        <span className="flex items-center gap-1"><FileCheck2 className="h-3 w-3" /> {project.report_count} reports</span>
        <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
      </div>
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientDetails, setClientDetails] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !clientName.trim()) { setError("Project name and client name are required."); return; }
    setSaving(true);
    try {
      await projectsApi.create({ name: name.trim(), client_name: clientName.trim(), client_details: clientDetails, description });
      onCreated();
    } catch {
      setError("Failed to create project. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-sm shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">New Project</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <Field label="Project Name *" value={name} onChange={setName} placeholder="e.g. ACME Corp ISO 27001 Audit 2026" />
          <Field label="Client Name *" value={clientName} onChange={setClientName} placeholder="e.g. ACME Corporation Ltd" />
          <Field label="Client Details" value={clientDetails} onChange={setClientDetails} placeholder="Contact, address, sector…" multiline />
          <Field label="Description" value={description} onChange={setDescription} placeholder="Scope overview or project notes" multiline />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-sm hover:opacity-90 disabled:opacity-40">
              {saving ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  const cls = "w-full px-3 py-2 text-sm bg-background border border-border rounded-sm focus:outline-none focus:border-primary";
  return (
    <div className="space-y-1">
      <label className="label-eyebrow">{label}</label>
      {multiline
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} className={cls} />
        : <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      }
    </div>
  );
}
