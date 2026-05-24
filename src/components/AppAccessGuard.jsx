import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

import { Button } from "@/components/ui/button";
import {
  fetchMyStudentProfile,
  resolveCurrentAppUser,
  setOnboardingComplete,
} from "@/lib/onboarding";
import { identifySentryUser } from "@/lib/sentry";

/**
 * AppAccessGuard — the gate that sits between Clerk's signed-in state and the
 * application shell. Extracted from App.js so it can be unit-tested directly.
 *
 * Decision flow once Clerk has loaded:
 *
 *   not signed in            -> Navigate to /
 *   signed in, fetch errors  -> ProfileLoadErrorScreen (with Retry)
 *   signed in, no profile    -> Navigate to /app/onboarding
 *   signed in, !onboarded    -> Navigate to /app/onboarding (unless already there)
 *   signed in,  onboarded    -> render children (unless on /app/onboarding,
 *                                in which case Navigate to /app/dashboard)
 *
 * The server's `profile.onboarding_completed` is the single source of truth.
 * Earlier revisions of this component fell back to localStorage on fetch
 * errors, which let stale state from a previous user on the same device pin a
 * brand-new sign-in past onboarding. That fallback is intentionally removed.
 */

export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-12 animate-pulse rounded-2xl bg-accent/20" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export function ProfileLoadErrorScreen({ message, onRetry }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-xl font-semibold text-foreground">We couldn't load your profile</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button
          onClick={onRetry}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}

export default function AppAccessGuard({ children }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const location = useLocation();
  const [onboardingState, setOnboardingState] = useState({
    loading: true,
    completed: false,
    error: null,
  });
  // Bumping this re-runs the load effect on demand from the error screen's
  // Retry button. Cleaner than re-checking pathname or unmounting.
  const [retryCounter, setRetryCounter] = useState(0);

  // Stamp Sentry's user scope with the Clerk user id as soon as auth resolves
  // signed-in. Errors raised later in the session will carry this id, scrubPII
  // strips the email out before transmit.
  useEffect(() => {
    if (isLoaded && isSignedIn && userId) {
      identifySentryUser(userId);
    }
  }, [isLoaded, isSignedIn, userId]);

  useEffect(() => {
    let isMounted = true;

    if (!isLoaded) {
      return () => {
        isMounted = false;
      };
    }

    if (!isSignedIn) {
      if (isMounted) {
        setOnboardingState({
          loading: false,
          completed: false,
          error: null,
        });
      }
      return () => {
        isMounted = false;
      };
    }

    const loadOnboardingStatus = async () => {
      setOnboardingState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        await resolveCurrentAppUser();
        const payload = await fetchMyStudentProfile();
        // Server's onboarding_completed is the source of truth. A missing
        // profile (payload.profile == null) correctly resolves to false here,
        // which routes the user to /app/onboarding below.
        const completed = Boolean(payload?.profile?.onboarding_completed);

        if (!isMounted) {
          return;
        }

        setOnboardingComplete(completed);
        setOnboardingState({ loading: false, completed, error: null });
      } catch (err) {
        if (!isMounted) {
          return;
        }

        // IMPORTANT: do NOT fall back to localStorage's isOnboardingComplete()
        // here. That fallback let stale state from a previous user/session
        // pin a brand-new sign-in past onboarding. Surface a retry screen
        // instead — the server is the source of truth.
        setOnboardingState({
          loading: false,
          completed: false,
          error: err?.message || "Could not load your profile.",
        });
      }
    };

    loadOnboardingStatus();

    return () => {
      isMounted = false;
    };
  }, [isLoaded, isSignedIn, location.pathname, retryCounter]);

  if (!isLoaded || onboardingState.loading) {
    return <LoadingScreen />;
  }

  if (!isSignedIn) {
    return <Navigate to="/" replace />;
  }

  if (onboardingState.error) {
    return (
      <ProfileLoadErrorScreen
        message={onboardingState.error}
        onRetry={() => setRetryCounter((n) => n + 1)}
      />
    );
  }

  const onboardingDone = onboardingState.completed;
  const onOnboardingRoute = location.pathname === "/app/onboarding";

  if (!onboardingDone && !onOnboardingRoute) {
    return <Navigate to="/app/onboarding" replace />;
  }

  if (onboardingDone && onOnboardingRoute) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return children;
}
