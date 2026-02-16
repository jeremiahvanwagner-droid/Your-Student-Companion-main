import { useAuth } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

import { isOnboardingComplete } from "@/lib/onboarding";
import LandingPage from "@/pages/LandingPage";

const isClerkConfigured = Boolean(process.env.REACT_APP_CLERK_PUBLISHABLE_KEY);

function GatekeeperContent() {
  const { isSignedIn, isLoaded } = useAuth();

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

  const onboardingDone = isOnboardingComplete();
  return <Navigate to={onboardingDone ? "/app/dashboard" : "/app/onboarding"} replace />;
}

export default function Gatekeeper() {
  if (!isClerkConfigured) {
    return <LandingPage />;
  }

  return <GatekeeperContent />;
}
