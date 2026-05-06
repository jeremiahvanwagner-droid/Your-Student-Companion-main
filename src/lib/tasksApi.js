const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

function handleResponse(response, fallbackMessage) {
  if (!response.ok) {
    return response
      .json()
      .catch(() => ({ detail: fallbackMessage }))
      .then((payload) => {
        throw new Error(payload?.detail || fallbackMessage);
      });
  }
  return response.json();
}

async function getClerkSessionToken() {
  const session = window?.Clerk?.session;
  if (!session?.getToken) return null;
  try {
    return await session.getToken();
  } catch {
    return null;
  }
}

async function authHeaders(extra = {}) {
  const token = await getClerkSessionToken();
  if (!token) throw new Error("Authentication required. Please sign in again.");
  return { ...extra, Authorization: `Bearer ${token}` };
}

// ── Tasks ────────────────────────────────────────────────────────────────

export async function fetchTasks({ status, priority, subjectId, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);
  if (subjectId) params.set("subject_id", subjectId);
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));

  const qs = params.toString();
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/tasks${qs ? `?${qs}` : ""}`, { headers });
  return handleResponse(response, "Failed to load tasks.");
}

export async function fetchTask(taskId) {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/tasks/${encodeURIComponent(taskId)}`, { headers });
  return handleResponse(response, "Failed to load task.");
}

export async function createTask(data) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse(response, "Failed to create task.");
}

export async function updateTask(taskId, data) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse(response, "Failed to update task.");
}

export async function patchTaskStatus(taskId, status) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/tasks/${encodeURIComponent(taskId)}/status`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status }),
  });
  return handleResponse(response, "Failed to update task status.");
}

export async function deleteTask(taskId) {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
    headers,
  });
  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || "Failed to delete task.");
  }
}

export async function fetchTaskStats() {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/tasks/stats`, { headers });
  return handleResponse(response, "Failed to load task stats.");
}

// ── Subjects ─────────────────────────────────────────────────────────────

export async function fetchSubjects({ includeArchived = false } = {}) {
  const params = new URLSearchParams();
  if (includeArchived) params.set("include_archived", "true");
  const qs = params.toString();
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/subjects${qs ? `?${qs}` : ""}`, { headers });
  return handleResponse(response, "Failed to load subjects.");
}

export async function patchSubject(subjectId, data) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/subjects/${encodeURIComponent(subjectId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse(response, "Failed to update subject.");
}

export async function createSubject(data) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/subjects`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse(response, "Failed to create subject.");
}

export async function deleteSubject(subjectId) {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/subjects/${encodeURIComponent(subjectId)}`, {
    method: "DELETE",
    headers,
  });
  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || "Failed to delete subject.");
  }
}
