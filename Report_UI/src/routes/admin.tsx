import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { admin as adminApi, type CreateUserPayload, type CreateUserResponse } from "@/lib/api-client";
import { useStore } from "@/lib/store";
import type { AdminUser } from "@/lib/types";
import { Loader2, Shield, Users, UserPlus, X, Copy, Check, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Compliance Intelligence" }] }),
  component: AdminPage,
});

const ROLE_OPTIONS = [
  { value: "user",        label: "Staff / User" },
  { value: "sub_admin",   label: "Project Manager / HOD" },
  { value: "super_admin", label: "Super Admin" },
] as const;

const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-primary/15 text-primary",
  sub_admin:   "bg-info/15 text-[oklch(0.4_0.12_240)]",
  user:        "bg-muted text-muted-foreground",
};

// ── Create User Modal ────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (result: CreateUserResponse) => void }) {
  const [form, setForm] = useState<CreateUserPayload>({
    username: "", email: "", first_name: "", last_name: "", password: "", role: "user",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof CreateUserPayload) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.username.trim() || !form.email.trim()) { setError("Username and email are required."); return; }
    setSaving(true);
    try {
      const result = await adminApi.createUser({ ...form, password: form.password?.trim() || undefined });
      onCreated(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-sm shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display text-base font-semibold">Create New User</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username *" id="username" value={form.username} onChange={set("username")} autoComplete="off" />
            <Field label="Email *" id="email" type="email" value={form.email} onChange={set("email")} autoComplete="off" />
            <Field label="First Name" id="first_name" value={form.first_name ?? ""} onChange={set("first_name")} />
            <Field label="Last Name" id="last_name" value={form.last_name ?? ""} onChange={set("last_name")} />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</label>
            <select value={form.role} onChange={set("role")}
              className="w-full px-3 py-2 rounded-sm border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Password <span className="normal-case font-normal text-muted-foreground">(leave blank to auto-generate)</span>
            </label>
            <input id="password" type="password" value={form.password ?? ""} onChange={set("password")} autoComplete="new-password"
              placeholder="Minimum 8 characters"
              className="w-full px-3 py-2 rounded-sm border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          {error && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-sm px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-sm disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, id, type = "text", value, onChange, autoComplete, placeholder }:
  { label: string; id: string; type?: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement>; autoComplete?: string; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      <input id={id} type={type} value={value} onChange={onChange} autoComplete={autoComplete} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-sm border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
    </div>
  );
}

// ── Credentials Dialog ───────────────────────────────────────────────────────

function CredentialsDialog({ result, onClose }: { result: CreateUserResponse; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const credential = `Username: ${result.user.username}\nPassword: ${result.generated_password ?? "(set by admin)"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-sm shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display text-base font-semibold">User Created</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Share these credentials with the staff member. The password will not be shown again.</p>

          <div className="bg-muted/50 border border-border rounded-sm p-4 font-mono text-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Username</span>
              <span className="font-medium">{result.user.username}</span>
            </div>
            {result.generated_password && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs uppercase tracking-wider">Password</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{showPwd ? result.generated_password : "••••••••••••"}</span>
                  <button onClick={() => setShowPwd((v) => !v)} className="text-muted-foreground hover:text-foreground">
                    {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Role</span>
              <span className="font-medium capitalize">{result.user.role.replace("_", " ")}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => copy(credential)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-sm hover:bg-accent">
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy credentials"}
            </button>
            <button onClick={onClose}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-sm">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin Page ───────────────────────────────────────────────────────────────

function AdminPage() {
  const currentUser = useStore((s) => s.currentUser);
  const role = currentUser?.role ?? "user";

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [credentials, setCredentials] = useState<CreateUserResponse | null>(null);

  const loadUsers = () => {
    setLoading(true);
    adminApi.listUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const handleRoleChange = async (userId: number, newRole: AdminUser["role"]) => {
    setSaving(userId);
    try {
      const updated = await adminApi.setRole(userId, newRole);
      setUsers((prev) => prev.map((u) => u.id === userId ? updated : u));
    } catch { /* ignore */ } finally { setSaving(null); }
  };

  const handleCreated = (result: CreateUserResponse) => {
    setShowCreate(false);
    setCredentials(result);
    loadUsers();
  };

  if (role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
        <Shield className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">Super Admin access required.</p>
        <Link to="/" className="text-primary text-sm hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="System administration"
        title="Admin Panel"
        description="Manage user roles and create new accounts for staff. Credentials are shared by the admin."
        actions={
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 transition-opacity">
            <UserPlus className="h-4 w-4" />
            Create User
          </button>
        }
      />

      <div className="grid grid-cols-12 gap-8">
        <section className="col-span-12 lg:col-span-9">
          <div className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-display text-base font-semibold">All Users</h2>
              </div>
              <span className="label-eyebrow">{users.length} total</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-6 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">User</th>
                      <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Email</th>
                      <th className="px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Current Role</th>
                      <th className="px-6 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Change Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                        <td className="px-6 py-3">
                          <div className="font-medium">{u.username}</div>
                          {(u.first_name || u.last_name) && (
                            <div className="text-xs text-muted-foreground">{[u.first_name, u.last_name].filter(Boolean).join(" ")}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{u.email || "—"}</td>
                        <td className="px-3 py-3">
                          <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm ${ROLE_BADGE[u.role] || "bg-muted"}`}>
                            {ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right">
                          {u.id === currentUser?.id ? (
                            <span className="text-xs text-muted-foreground italic">You</span>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              {saving === u.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                              <select
                                value={u.role}
                                disabled={saving === u.id}
                                onChange={(e) => handleRoleChange(u.id, e.target.value as AdminUser["role"])}
                                className="text-xs bg-background border border-border rounded-sm px-2 py-1.5 focus:outline-none disabled:opacity-40"
                              >
                                {ROLE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <aside className="col-span-12 lg:col-span-3 space-y-4">
          <div className="bg-card border border-border rounded-sm p-5 space-y-3">
            <div className="label-eyebrow mb-1">Role guide</div>
            {ROLE_OPTIONS.map((opt) => (
              <div key={opt.value} className="space-y-0.5">
                <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm inline-block ${ROLE_BADGE[opt.value]}`}>
                  {opt.label}
                </span>
                <p className="text-[11px] text-muted-foreground">
                  {opt.value === "super_admin" && "Full access to all projects, reports, and user management."}
                  {opt.value === "sub_admin"   && "Can create projects, assign staff, and access project reports."}
                  {opt.value === "user"        && "Can view and create reports assigned to them only."}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
      {credentials && <CredentialsDialog result={credentials} onClose={() => setCredentials(null)} />}
    </>
  );
}
