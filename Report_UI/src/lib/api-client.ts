/**
 * Typed API client for the Django REST backend.
 * Reads VITE_API_URL from the environment (default: http://localhost:8000).
 * Injects Authorization: Token <key> from localStorage-persisted Zustand store.
 */

import type { Project, AdminUser, ReportLogo } from "./types";

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

function getToken(): string | null {
  try {
    const raw = localStorage.getItem("pse-reports-v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { authToken?: string } };
    return parsed?.state?.authToken ?? null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(token ? { Authorization: `Token ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined ?? {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = (await res.json()) as Record<string, unknown>;
      msg = JSON.stringify(err);
    } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthPayload {
  token: string;
  user: { id: number; username: string; email: string; first_name: string; last_name: string; role: "super_admin" | "sub_admin" | "user" };
}

export interface CreateUserPayload {
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  password?: string;
  role?: "super_admin" | "sub_admin" | "user";
}

export interface CreateUserResponse {
  user: AuthPayload["user"];
  generated_password?: string;
}

export const auth = {
  login: (username: string, password: string) =>
    request<AuthPayload>("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<AuthPayload["user"]>("/api/auth/me/"),
};

// ─── Reports ────────────────────────────────────────────────────────────────

export interface ReportStatus {
  id: number;
  status: string;
  current_stage: string;
  progress_pct: number;
  error_message: string | null;
  latest_log: { agent_type: string; stage: string; message: string } | null;
}

export interface ReportSummary {
  id: number;
  title: string;
  organisation: string;
  department?: string;
  standard: { code: string; name: string };
  service_type?: string;
  status: string;
  progress_pct: number;
  created_at: string;
  updated_at: string;
}

export interface AgentExecutionLog {
  id: number;
  agent_type: string;
  stage: string;
  message: string;
  prompt_text: string | null;
  output_text: string | null;
  confidence_score: number;
  duration_ms: number | null;
  created_at: string;
}

export interface ReportDetail extends ReportSummary {
  department: string;
  scope: string;
  sections: Array<{
    id: number; section_name: string; content: string;
    agent_type: string; confidence_score: number; order: number;
  }>;
  gaps: Array<{
    id: number; severity: string; description: string;
    requirement: { code: string; text: string } | null;
  }>;
  compliance_score: {
    section_score: number; evidence_score: number;
    consistency_score: number; total_score: number; status: string;
  } | null;
  agent_logs?: AgentExecutionLog[];
}

export interface CreateReportPayload {
  title: string;
  organisation: string;
  department?: string;
  standard_code: string;
  scope?: string;
  service_type?: string;
  wizard_answers?: Array<{
    question: string;
    clause_ref: string;
    section: string;
    theme: string;
    answer: "yes" | "no" | null;
    risk: number;
    notes: string;
  }>;
  submissions?: Array<{
    requirement_id: number;
    compliance_status: "compliant" | "partial" | "non_compliant";
    comment?: string;
  }>;
}

export const reports = {
  list: () => request<ReportSummary[]>("/api/reports/"),

  create: (payload: CreateReportPayload) =>
    request<ReportSummary>("/api/reports/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (id: string | number, payload: Partial<CreateReportPayload>) =>
    request<ReportSummary>(`/api/reports/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  get: (id: string | number) => request<ReportDetail>(`/api/reports/${id}/`),

  status: (id: string | number) => request<ReportStatus>(`/api/reports/${id}/status/`),

  delete: (id: string | number) =>
    request<void>(`/api/reports/${id}/`, { method: "DELETE" }),

  validate: (id: string | number) =>
    request<{ detail: string }>(`/api/reports/${id}/validate/`, { method: "POST" }),

  rescore: (id: string | number) =>
    request<Record<string, unknown>>(`/api/reports/${id}/rescore/`, { method: "POST" }),

  generate: (id: string | number) =>
    request<{ detail: string }>(`/api/reports/${id}/generate/`, { method: "POST" }),

  submitReview: (id: string | number) =>
    request<{ detail: string }>(`/api/reports/${id}/submit_review/`, { method: "POST" }),

  approve: (id: string | number) =>
    request<{ detail: string }>(`/api/reports/${id}/approve/`, { method: "POST" }),

  assign: (id: string | number, userId: number) =>
    request<ReportSummary>(`/api/reports/${id}/assign/`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    }),

  exportUrl: (id: string | number, format: "docx" | "pdf") =>
    `${BASE_URL}/api/reports/${id}/export/?format=${format}&token=${getToken() ?? ""}`,

  logs: (id: string | number) =>
    request<AgentExecutionLog[]>(`/api/reports/${id}/logs/`),
};

// ─── Notifications ──────────────────────────────────────────────────────────

export interface Notification {
  id: number;
  message: string;
  report: number | null;
  report_title?: string;
  is_read: boolean;
  created_at: string;
}

export const notifications = {
  list: () => request<Notification[]>("/api/auth/notifications/"),

  markRead: (id: number) =>
    request<Notification>(`/api/auth/notifications/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ is_read: true }),
    }),

  markAllRead: () =>
    request<{ detail: string }>("/api/auth/notifications/", { method: "POST" }),
};

// ─── Projects ───────────────────────────────────────────────────────────────

export interface Standard {
  id: number;
  code: string;
  name: string;
}

export interface CreateProjectPayload {
  name: string;
  client_name: string;
  client_details?: string;
  description?: string;
  status?: "active" | "completed" | "archived";
  standard?: number | null;
  report_types?: string[];
}

export const standards = {
  list: () => request<Standard[]>("/api/standards/"),
};

export const projects = {
  list: () => request<Project[]>("/api/projects/"),

  create: (payload: CreateProjectPayload) =>
    request<Project>("/api/projects/", { method: "POST", body: JSON.stringify(payload) }),

  get: (id: string | number) => request<Project>(`/api/projects/${id}/`),

  update: (id: string | number, payload: Partial<CreateProjectPayload>) =>
    request<Project>(`/api/projects/${id}/`, { method: "PATCH", body: JSON.stringify(payload) }),

  delete: (id: string | number) =>
    request<void>(`/api/projects/${id}/`, { method: "DELETE" }),

  addMember: (id: string | number, userId: number) =>
    request<Project>(`/api/projects/${id}/members/`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, action: "add" }),
    }),

  removeMember: (id: string | number, userId: number) =>
    request<Project>(`/api/projects/${id}/members/`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, action: "remove" }),
    }),
};

// ─── Admin ──────────────────────────────────────────────────────────────────

export const admin = {
  listUsers: () => request<AdminUser[]>("/api/auth/users/"),

  setRole: (userId: number, role: "super_admin" | "sub_admin" | "user") =>
    request<AdminUser>(`/api/auth/users/${userId}/role/`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),

  createUser: (payload: CreateUserPayload) =>
    request<CreateUserResponse>("/api/auth/register/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

// ─── Logo ────────────────────────────────────────────────────────────────────

export const logo = {
  get: (id: string | number) =>
    request<{ logo: ReportLogo | null }>(`/api/reports/${id}/logo/`),

  upload: (id: string | number, form: FormData) =>
    request<ReportLogo>(`/api/reports/${id}/logo/`, { method: "POST", body: form }),

  remove: (id: string | number) =>
    request<void>(`/api/reports/${id}/logo/`, { method: "DELETE" }),
};
