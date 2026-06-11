import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, ChevronDown, ScrollText, LogOut } from "lucide-react";
import { useStore } from "@/lib/store";
import { auth } from "@/lib/api-client";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  sub_admin: "Project Manager",
  user: "Staff",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const currentUser = useStore((s) => s.currentUser);
  const clearAuth = useStore((s) => s.clearAuth);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const role = currentUser?.role ?? "user";

  const NAV = [
    { to: "/", label: "Dashboard" },
    ...(role === "sub_admin" || role === "super_admin"
      ? [{ to: "/projects", label: "Projects" }]
      : []),
    ...(role === "super_admin"
      ? [{ to: "/admin", label: "Admin" }]
      : []),
    { to: "/transparency", label: "AI Transparency" },
  ];

  const initials = currentUser?.username
    ? currentUser.username.slice(0, 2).toUpperCase()
    : "??";

  const logout = () => {
    auth.logout().catch(() => {}).finally(() => {
      clearAuth();
      navigate({ to: "/login" });
    });
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-paper/60 backdrop-blur supports-[backdrop-filter]:bg-paper/70 sticky top-0 z-30">
        <div className="mx-auto max-w-[1400px] px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-sm bg-primary text-primary-foreground grid place-items-center">
              <ScrollText className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-[17px] font-semibold tracking-tight">Compliance Intelligence System</div>
              <div className="label-eyebrow">PSE · Audit Edition</div>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => {
              const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`px-3 py-2 text-sm rounded-sm transition-colors ${
                    active ? "text-foreground bg-accent" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
            <button className="ml-2 relative p-2 rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
            </button>
            <div className="relative ml-1">
              <button
                onClick={() => setAvatarOpen((o) => !o)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent"
              >
                <div className="h-7 w-7 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-semibold">{initials}</div>
                {currentUser?.username && <span className="text-sm font-medium hidden sm:block">{currentUser.username}</span>}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {avatarOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-sm shadow-md z-50">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs text-muted-foreground">{currentUser?.email}</p>
                    <p className="text-xs font-medium text-primary mt-0.5">
                      {ROLE_LABELS[role] ?? role}
                    </p>
                  </div>
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-8 py-10">{children}</main>
      <footer className="mx-auto max-w-[1400px] px-8 pb-10">
        <div className="rule-line mb-4" />
        <div className="flex justify-between text-xs text-muted-foreground font-mono">
          <span>PSE/CIS · v2.1 · Audit-grade output</span>
          <span>© {new Date().getFullYear()} Compliance Intelligence</span>
        </div>
      </footer>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Draft: "bg-muted text-muted-foreground",
    Processing: "bg-warning/15 text-[oklch(0.45_0.13_70)]",
    Validation: "bg-info/15 text-[oklch(0.4_0.12_240)]",
    Scored: "bg-info/15 text-[oklch(0.4_0.12_240)]",
    Completed: "bg-success/15 text-[oklch(0.4_0.12_145)]",
    Failed: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] font-mono uppercase tracking-wider ${map[status] || "bg-muted"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

export function ScoreBadge({ value }: { value: number }) {
  const tone =
    value >= 85 ? "text-[oklch(0.4_0.12_145)] border-[oklch(0.4_0.12_145)]/40" :
    value >= 70 ? "text-[oklch(0.45_0.13_70)] border-[oklch(0.45_0.13_70)]/40" :
    "text-destructive border-destructive/40";
  return (
    <span className={`inline-flex items-baseline gap-1 px-2 py-0.5 rounded-sm border font-mono text-xs ${tone}`}>
      <span className="font-semibold">{value}</span>
      <span className="opacity-60">%</span>
    </span>
  );
}

export function PageHeader({
  eyebrow, title, description, actions,
}: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-end justify-between gap-6">
        <div>
          {eyebrow && <div className="label-eyebrow mb-2">{eyebrow}</div>}
          <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-2 text-muted-foreground max-w-2xl">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="rule-line mt-6" />
    </div>
  );
}