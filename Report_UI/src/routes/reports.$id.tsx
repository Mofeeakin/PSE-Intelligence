import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/reports/$id")({
  component: () => <Outlet />,
});
