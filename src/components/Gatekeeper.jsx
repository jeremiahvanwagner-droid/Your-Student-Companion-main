import { useAuth } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

import LandingPage from "@/pages/LandingPage";
import { clearOnboardingLocalState } from "@/lib/onboarding";

const isClerkConfigured = Boolean(
  process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

function GatekeeperContent() {
  const { isSignedIn, isLoaded } = useAuth();

  // Whenever the Gatekeeper resolves an unauthenticated session, wipe any
  // onboarding state lingering in localStorage from a previous user on the
  // same device. Without this, signing in as a different account would
  // inherit the prior user's `ysc_onboarding_completed=true` and skip the
  // wizard. Inlined here (not in useEffect) on purpose: removeItem is
  // idempotent, and useEffect creates a React-instance issue with the
  // test harness's module-reset trick.
  if (isLoaded && !isSignedIn) {
    clearOnboardingLocalState();
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-accent/20">
            <div className="h-8 w-8 animate-ping rounded-xl bg-accent/40" />
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <LandingPage />;
  }

  return <Navigate to="/app" replace />;
}

export default function Gatekeeper() {
  if (!isClerkConfigured) {
    return <LandingPage />;
  }

  return <GatekeeperContent />;
}
