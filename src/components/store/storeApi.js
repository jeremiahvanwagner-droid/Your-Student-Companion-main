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

export async function fetchDegreePlans() {
  const response = await fetch(`${API_BASE_URL}/api/store/degree-plans`);
  return handleResponse(response, "Failed to load degree plans.");
}

export async function fetchDegreePacks(degreeSlug) {
  const response = await fetch(
    `${API_BASE_URL}/api/store/degree-plans/${encodeURIComponent(degreeSlug)}/packs`
  );
  return handleResponse(response, "Failed to load degree packs.");
}

export async function fetchPack(packId) {
  const response = await fetch(`${API_BASE_URL}/api/store/packs/${encodeURIComponent(packId)}`);
  return handleResponse(response, "Failed to load course pack.");
}

export async function createCheckoutSession(payload) {
  const response = await fetch(`${API_BASE_URL}/api/store/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse(response, "Failed to create checkout session.");
}

export async function fetchUserPurchases(userId) {
  const response = await fetch(
    `${API_BASE_URL}/api/store/user/${encodeURIComponent(userId)}/purchases`
  );
  return handleResponse(response, "Failed to load user purchases.");
}

export function getClerkClientUser() {
  const clerkUser = window?.Clerk?.user;
  if (!clerkUser?.id) {
    return null;
  }

  const email = clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses?.[0]?.emailAddress;

  return {
    id: clerkUser.id,
    email: email || null,
    first_name: clerkUser.firstName || null,
    last_name: clerkUser.lastName || null,
  };
}

export function getGuestUserId() {
  const storageKey = "studentCompanion_guestUserId";
  const existing = localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `guest_${Date.now()}`;

  localStorage.setItem(storageKey, generated);
  return generated;
}

export function getClientUserId() {
  const clerkUser = getClerkClientUser();
  if (clerkUser?.id) {
    return clerkUser.id;
  }

  return getGuestUserId();
}

export async function resolveAppUser(payload) {
  const response = await fetch(`${API_BASE_URL}/api/users/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse(response, "Failed to resolve application user.");
}

export function formatUsd(price) {
  const numeric = Number(price || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(numeric);
}
