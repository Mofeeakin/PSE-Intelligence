import { Outlet, Link, createRootRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useStore } from "@/lib/store";

// Paths each role is allowed to visit. Sub-paths are covered by startsWith checks.
const ROLE_ALLOWED: Record<string, string[]> = {
  user:        ["/", "/reports", "/wizard", "/processing", "/transparency"],
  sub_admin:   ["/", "/reports", "/wizard", "/processing", "/projects", "/transparency"],
  super_admin: [], // wildcard — all paths allowed
};

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  const authToken = useStore((s) => s.authToken);
  const currentUser = useStore((s) => s.currentUser);
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });

  useEffect(() => {
    const { pathname } = location;
    const isPublic = pathname === "/login";

    if (!authToken) {
      if (!isPublic) navigate({ to: "/login" });
      return;
    }

    if (isPublic) {
      navigate({ to: "/" });
      return;
    }

    const role = currentUser?.role ?? "user";
    if (role === "super_admin") return; // full access

    const allowed = ROLE_ALLOWED[role] ?? ROLE_ALLOWED.user;
    const permitted = allowed.some((prefix) =>
      prefix === "/" ? pathname === "/" : pathname.startsWith(prefix)
    );
    if (!permitted) navigate({ to: "/" });
  }, [authToken, currentUser?.role, location.pathname, navigate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
