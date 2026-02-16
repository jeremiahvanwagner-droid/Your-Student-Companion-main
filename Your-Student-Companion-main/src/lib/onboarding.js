export const ONBOARDING_COMPLETED_KEY = "ysc_onboarding_completed";
export const ONBOARDING_PROFILE_KEY = "ysc_onboarding_profile";

export function isOnboardingComplete() {
  if (typeof window === "undefined") {
    return false;
  }

  return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === "true";
}

export function getOnboardingProfile() {
  if (typeof window === "undefined") {
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
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(ONBOARDING_PROFILE_KEY, JSON.stringify(profile || {}));
}

export function setOnboardingComplete(completed) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(ONBOARDING_COMPLETED_KEY, completed ? "true" : "false");
}
