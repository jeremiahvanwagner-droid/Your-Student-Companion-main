export const ONBOARDING_COMPLETED_KEY = "ysc_onboarding_completed";
export const ONBOARDING_PROFILE_KEY = "ysc_onboarding_profile";

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

function ensureBrowserStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
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

async function authHeaders(requireAuth = true) {
  const token = await getClerkSessionToken();
  if (!token && requireAuth) {
    throw new Error("Authentication required. Please sign in again.");
  }

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function handleApiResponse(response, fallbackMessage) {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: fallbackMessage }));
    throw new Error(payload?.detail || fallbackMessage);
  }

  return response.json();
}

export function isOnboardingComplete() {
  if (!ensureBrowserStorage()) {
    return false;
  }

  return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === "true";
}

export function getOnboardingProfile() {
  if (!ensureBrowserStorage()) {
    return null;
  }

  const raw = localStorage.getItem(ONBOARDING_PROFILE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setOnboardingProfile(profile) {
  if (!ensureBrowserStorage()) {
    return;
  }

  localStorage.setItem(ONBOARDING_PROFILE_KEY, JSON.stringify(profile || {}));
}

export function setOnboardingComplete(completed) {
  if (!ensureBrowserStorage()) {
    return;
  }

  localStorage.setItem(ONBOARDING_COMPLETED_KEY, completed ? "true" : "false");
}

/**
 * Remove both onboarding localStorage keys. Called on sign-out (via Gatekeeper
 * when it sees an unauthenticated session) so that a different user signing in
 * on the same device doesn't inherit the previous user's onboarding state.
 */
export function clearOnboardingLocalState() {
  if (!ensureBrowserStorage()) {
    return;
  }

  localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
  localStorage.removeItem(ONBOARDING_PROFILE_KEY);
}

export async function resolveCurrentAppUser() {
  const headers = await authHeaders();

  const clerkUser = window?.Clerk?.user;
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ||
    clerkUser?.emailAddresses?.[0]?.emailAddress ||
    null;

  const payload = {
    clerk_user_id: clerkUser?.id || undefined,
    email,
    first_name: clerkUser?.firstName || undefined,
    last_name: clerkUser?.lastName || undefined,
  };

  const response = await fetch(`${API_BASE_URL}/api/users/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse(response, "Failed to resolve application user.");
}

export async function fetchMyStudentProfile() {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/users/me/profile`, {
    headers,
  });
  return handleApiResponse(response, "Failed to load student profile.");
}

export async function persistMyStudentProfile(payload) {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/users/me/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload || {}),
  });

  return handleApiResponse(response, "Failed to save student profile.");
}

export async function fetchStudentProfile(userId) {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/users/profile/${encodeURIComponent(userId)}`, {
    headers,
  });
  return handleApiResponse(response, "Failed to load student profile.");
}

export async function persistStudentProfile(userId, payload) {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/users/profile/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload || {}),
  });

  return handleApiResponse(response, "Failed to save student profile.");
}
