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

// ── Study Sessions ───────────────────────────────────────────────────────

export async function createStudySession(data) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/focus/sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse(response, "Failed to create study session.");
}

export async function completeStudySession(sessionId, data) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/focus/sessions/${encodeURIComponent(sessionId)}/complete`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse(response, "Failed to complete study session.");
}

export async function fetchStudySessions({ limit, offset } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  const qs = params.toString();
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/focus/sessions${qs ? `?${qs}` : ""}`, { headers });
  return handleResponse(response, "Failed to load study sessions.");
}

// ── Focus Logs ───────────────────────────────────────────────────────────

export async function createFocusLog(data) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/focus/logs`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse(response, "Failed to create focus log.");
}

export async function fetchFocusLogs({ limit, offset } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  const qs = params.toString();
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/focus/logs${qs ? `?${qs}` : ""}`, { headers });
  return handleResponse(response, "Failed to load focus logs.");
}

// ── Stats ────────────────────────────────────────────────────────────────

export async function fetchFocusStats() {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/focus/stats`, { headers });
  return handleResponse(response, "Failed to load focus stats.");
}
