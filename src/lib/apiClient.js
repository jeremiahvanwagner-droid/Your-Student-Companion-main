export const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

export function handleResponse(response, fallbackMessage) {
  if (!response.ok) {
    return response
      .json()
      .catch(() => ({ detail: fallbackMessage }))
      .then((payload) => {
        const detail = payload?.detail;
        const message =
          typeof detail === "string" ? detail : detail?.message || fallbackMessage;
        throw new Error(message);
      });
  }
  if (response.status === 204) return null;
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

export async function authHeaders(extra = {}) {
  const token = await getClerkSessionToken();
  if (!token) throw new Error("Authentication required. Please sign in again.");
  return { ...extra, Authorization: `Bearer ${token}` };
}
