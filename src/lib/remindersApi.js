import { API_BASE_URL, authHeaders, handleResponse } from "@/lib/apiClient";

export async function fetchReminders({ unreadOnly, includeUpcoming, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (unreadOnly) params.set("unread_only", "true");
  if (includeUpcoming) params.set("include_upcoming", "true");
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));

  const qs = params.toString();
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/reminders${qs ? `?${qs}` : ""}`, { headers });
  return handleResponse(response, "Failed to load reminders.");
}

export async function syncReminders() {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/reminders/sync`, {
    method: "POST",
    headers,
  });
  return handleResponse(response, "Failed to refresh reminders.");
}

export async function markReminderRead(reminderId) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(
    `${API_BASE_URL}/api/reminders/${encodeURIComponent(reminderId)}/read`,
    {
      method: "PATCH",
      headers,
    }
  );
  return handleResponse(response, "Failed to update reminder.");
}

export async function markAllRemindersRead() {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/reminders/read-all`, {
    method: "POST",
    headers,
  });
  return handleResponse(response, "Failed to update reminders.");
}

export async function deleteReminder(reminderId) {
  const headers = await authHeaders();
  const response = await fetch(
    `${API_BASE_URL}/api/reminders/${encodeURIComponent(reminderId)}`,
    {
      method: "DELETE",
      headers,
    }
  );
  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || "Failed to delete reminder.");
  }
}
