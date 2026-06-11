import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { admin as adminApi } from "@/lib/api-client";
import { useStore } from "@/lib/store";
import type { AdminUser } from "@/lib/types";
import { Loader2, Shield, Users, UserPlus, Eye, EyeOff } from "lucide-react";

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

function AdminPage() {
  const currentUser = useStore((s) => s.currentUser);
  const navigate = useNavigate();
  const role = currentUser?.role ?? "user";

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    if (role !== "super_admin") {
      navigate({ to: "/" });
      return;
    }
    adminApi.listUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [role, navigate]);

  const handleRoleChange = async (userId: number, newRole: AdminUser["role"]) => {
    setSaving(userId);
    try {
      const updated = await adminApi.setRole(userId, newRole);
      setUsers((prev) => prev.map((u) => u.id === userId ? updated : u));
    } catch { /* ignore */ } finally { setSaving(null); }
  };

  const handleUserCreated = (newUser: AdminUser) => {
    setUsers((prev) => [...prev, newUser]);
  };

  if (role !== "super_admin") return null;

  return (
    <>
      <PageHeader
        eyebrow="System administration"
        title="Admin Panel"
        description="Manage user roles and system access for all staff. Changes take effect on next login."
      />

      <div className="grid grid-cols-12 gap-8">
        <section className="col-span-12 lg:col-span-9 space-y-6">
          {/* Create User */}
          <CreateUserPanel onCreated={handleUserCreated} />

          {/* User list */}
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
    </>
  );
}

interface CreateUserPayload {
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role: AdminUser["role"];
}

function CreateUserPanel({ onCreated }: { onCreated: (u: AdminUser) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateUserPayload>({
    username: "", first_name: "", last_name: "", email: "",
    password: "", role: "user",
  });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const set = (k: keyof CreateUserPayload) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const result = await adminApi.createUser(form);
      onCreated(result.user);
      setMsg({ type: "ok", text: `User "${result.user.username}" created successfully.` });
      setForm({ username: "", first_name: "", last_name: "", email: "", password: "", role: "user" });
    } catch (err) {
      const text = err instanceof Error ? err.message : "Failed to create user.";
      setMsg({ type: "err", text });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-4 flex items-center justify-between border-b border-border hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-base font-semibold">Create New User</span>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "Collapse" : "Expand"}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-2 gap-4">
          <Field label="Username *" id="cu-username" value={form.username} onChange={set("username")} required autoComplete="off" />
          <Field label="Email" id="cu-email" type="email" value={form.email} onChange={set("email")} autoComplete="off" />
          <Field label="First name" id="cu-first" value={form.first_name} onChange={set("first_name")} autoComplete="off" />
          <Field label="Last name" id="cu-last" value={form.last_name} onChange={set("last_name")} autoComplete="off" />

          <div className="space-y-1 col-span-2 sm:col-span-1">
            <label htmlFor="cu-pw" className="label-eyebrow">Password *</label>
            <div className="relative">
              <input
                id="cu-pw"
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={set("password")}
                className="w-full px-3 py-2 pr-9 text-sm bg-background border border-border rounded-sm focus:outline-none focus:border-primary"
              />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="space-y-1 col-span-2 sm:col-span-1">
            <label htmlFor="cu-role" className="label-eyebrow">Role *</label>
            <select
              id="cu-role"
              value={form.role}
              onChange={set("role")}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-sm focus:outline-none focus:border-primary"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-sm hover:opacity-90 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
              {saving ? "Creating…" : "Create user"}
            </button>
            {msg && (
              <span className={`text-xs ${msg.type === "ok" ? "text-[oklch(0.4_0.12_145)]" : "text-destructive"}`}>
                {msg.text}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label, id, type = "text", value, onChange, required, autoComplete,
}: {
  label: string; id: string; type?: string;
  value: string; onChange: React.ChangeEventHandler<HTMLInputElement>;
  required?: boolean; autoComplete?: string;
}) {
  return (
    <div className="space-y-1 col-span-2 sm:col-span-1">
      <label htmlFor={id} className="label-eyebrow">{label}</label>
      <input
        id={id} type={type} required={required} autoComplete={autoComplete}
        value={value} onChange={onChange}
        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-sm focus:outline-none focus:border-primary"
      />
    </div>
  );
}
