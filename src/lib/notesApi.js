import { API_BASE_URL, authHeaders, handleResponse } from "@/lib/apiClient";

// ── Notes ────────────────────────────────────────────────────────────────

export async function fetchNotes({ q, tag, subjectId, includeArchived, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (tag) params.set("tag", tag);
  if (subjectId) params.set("subject_id", subjectId);
  if (includeArchived) params.set("include_archived", "true");
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));

  const qs = params.toString();
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/notes${qs ? `?${qs}` : ""}`, { headers });
  return handleResponse(response, "Failed to load notes.");
}

export async function createNote(data) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/notes`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse(response, "Failed to create note.");
}

export async function updateNote(noteId, data) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/notes/${encodeURIComponent(noteId)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse(response, "Failed to update note.");
}

export async function deleteNote(noteId) {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
    headers,
  });
  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || "Failed to delete note.");
  }
}

// ── Review cards ─────────────────────────────────────────────────────────

export async function fetchCards({ noteId, dueOnly, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (noteId) params.set("note_id", noteId);
  if (dueOnly) params.set("due_only", "true");
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));

  const qs = params.toString();
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/notes/cards${qs ? `?${qs}` : ""}`, { headers });
  return handleResponse(response, "Failed to load review cards.");
}

export async function createCard(data) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/notes/cards`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse(response, "Failed to create review card.");
}

export async function reviewCard(cardId, rating) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(
    `${API_BASE_URL}/api/notes/cards/${encodeURIComponent(cardId)}/review`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ rating }),
    }
  );
  return handleResponse(response, "Failed to record review.");
}

export async function deleteCard(cardId) {
  const headers = await authHeaders();
  const response = await fetch(
    `${API_BASE_URL}/api/notes/cards/${encodeURIComponent(cardId)}`,
    {
      method: "DELETE",
      headers,
    }
  );
  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || "Failed to delete review card.");
  }
}
