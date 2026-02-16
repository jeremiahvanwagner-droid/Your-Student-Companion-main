export const ONBOARDING_COMPLETED_KEY = "ysc_onboarding_completed";
export const ONBOARDING_PROFILE_KEY = "ysc_onboarding_profile";

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

function ensureBrowserStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
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

export async function fetchStudentProfile(userId) {
  const response = await fetch(`${API_BASE_URL}/api/users/profile/${encodeURIComponent(userId)}`);
  return handleApiResponse(response, "Failed to load student profile.");
}

export async function persistStudentProfile(userId, payload) {
  const response = await fetch(`${API_BASE_URL}/api/users/profile/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });

  return handleApiResponse(response, "Failed to save student profile.");
}
