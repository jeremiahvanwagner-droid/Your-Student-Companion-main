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

export async function sendMentorChat(payload) {
  const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse(response, "Failed to get AI mentor response.");
}

export async function fetchMentorStatus() {
  const response = await fetch(`${API_BASE_URL}/api/ai/status`);
  return handleResponse(response, "Failed to fetch AI status.");
}
