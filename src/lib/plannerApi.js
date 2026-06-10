import { API_BASE_URL, authHeaders, handleResponse } from "@/lib/apiClient";

export async function fetchBlocks({ start, end, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));

  const qs = params.toString();
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/planner/blocks${qs ? `?${qs}` : ""}`, { headers });
  return handleResponse(response, "Failed to load planner blocks.");
}

export async function createBlock(data) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/planner/blocks`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse(response, "Failed to create study block.");
}

export async function createBlocksBulk(blocks) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/planner/blocks/bulk`, {
    method: "POST",
    headers,
    body: JSON.stringify({ blocks }),
  });
  return handleResponse(response, "Failed to add study blocks.");
}

export async function updateBlock(blockId, data) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(
    `${API_BASE_URL}/api/planner/blocks/${encodeURIComponent(blockId)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    }
  );
  return handleResponse(response, "Failed to update study block.");
}

export async function completeBlock(blockId, completed) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(
    `${API_BASE_URL}/api/planner/blocks/${encodeURIComponent(blockId)}/complete`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ completed }),
    }
  );
  return handleResponse(response, "Failed to update study block.");
}

export async function deleteBlock(blockId) {
  const headers = await authHeaders();
  const response = await fetch(
    `${API_BASE_URL}/api/planner/blocks/${encodeURIComponent(blockId)}`,
    {
      method: "DELETE",
      headers,
    }
  );
  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || "Failed to delete study block.");
  }
}

export async function fetchSuggestions() {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/planner/suggest`, { headers });
  return handleResponse(response, "Failed to load suggestions.");
}
