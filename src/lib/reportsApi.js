import { API_BASE_URL, authHeaders, handleResponse } from "@/lib/apiClient";

export async function fetchCurrentWeekReport({ weekStart } = {}) {
  const params = new URLSearchParams();
  if (weekStart) params.set("week_start", weekStart);
  const qs = params.toString();
  const headers = await authHeaders();
  const response = await fetch(
    `${API_BASE_URL}/api/reports/weekly/current${qs ? `?${qs}` : ""}`,
    { headers }
  );
  return handleResponse(response, "Failed to load weekly report.");
}

export async function generateWeeklyReport({ weekStart } = {}) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/reports/weekly/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify(weekStart ? { week_start: weekStart } : {}),
  });
  return handleResponse(response, "Failed to save weekly report.");
}

export async function fetchReportHistory({ limit } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  const headers = await authHeaders();
  const response = await fetch(
    `${API_BASE_URL}/api/reports/weekly/history${qs ? `?${qs}` : ""}`,
    { headers }
  );
  return handleResponse(response, "Failed to load report history.");
}
