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
  if (!session?.getToken) {
    return null;
  }

  try {
    return await session.getToken();
  } catch {
    return null;
  }
}

async function withAuthHeaders(baseHeaders = {}) {
  const token = await getClerkSessionToken();
  if (!token) {
    throw new Error("Authentication required. Please sign in again.");
  }

  return {
    ...baseHeaders,
    Authorization: `Bearer ${token}`,
  };
}

export async function createSubscriptionCheckoutSession(payload) {
  const headers = await withAuthHeaders({ "Content-Type": "application/json" });

  const response = await fetch(`${API_BASE_URL}/api/store/subscriptions/checkout`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  return handleResponse(response, "Failed to create subscription checkout session.");
}

export async function fetchMySubscription() {
  const headers = await withAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/store/subscriptions/me`, {
    headers,
  });

  return handleResponse(response, "Failed to load subscription.");
}

export async function createBillingPortalSession({ return_url }) {
  const headers = await withAuthHeaders({ "Content-Type": "application/json" });

  const response = await fetch(`${API_BASE_URL}/api/store/subscriptions/portal`, {
    method: "POST",
    headers,
    body: JSON.stringify({ return_url }),
  });

  return handleResponse(response, "Failed to open billing portal.");
}
