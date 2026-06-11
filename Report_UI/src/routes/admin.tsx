import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { admin as adminApi } from "@/lib/api-client";
import { useStore } from "@/lib/store";
import type { AdminUser } from "@/lib/types";
import { Loader2, Shield, Users } from "lucide-react";

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
  const role = currentUser?.role ?? "user";

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    adminApi.listUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRoleChange = async (userId: number, newRole: AdminUser["role"]) => {
    setSaving(userId);
    try {
      const updated = await adminApi.setRole(userId, newRole);
      setUsers((prev) => prev.map((u) => u.id === userId ? updated : u));
    } catch { /* ignore */ } finally { setSaving(null); }
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
        description="Manage user roles and system access for all staff. Changes take effect on next login."
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
    </>
  );
}
