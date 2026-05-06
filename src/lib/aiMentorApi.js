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

export async function sendMentorChat(payload) {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  return handleResponse(response, "Failed to get AI mentor response.");
}

export async function fetchMentorStatus() {
  const response = await fetch(`${API_BASE_URL}/api/ai/status`);
  return handleResponse(response, "Failed to fetch AI status.");
}

export async function persistVoiceTranscript({ messages, conversationId }) {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(`${API_BASE_URL}/api/ai/voice/transcript`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages, conversation_id: conversationId }),
    });
    return handleResponse(response, "Failed to save voice transcript.");
  } catch {
    // Best-effort — do not surface errors to the user
    return null;
  }
}
