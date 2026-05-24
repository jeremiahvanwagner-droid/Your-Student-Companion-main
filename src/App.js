import "@/App.css";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";

import Gatekeeper from "@/components/Gatekeeper";
import AppShell from "@/components/layout/AppShell";
import { UserPurchasesProvider } from "@/context/UserPurchasesContext";
import { UserSubscriptionProvider } from "@/context/UserSubscriptionContext";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  fetchMyStudentProfile,
  resolveCurrentAppUser,
  setOnboardingComplete,
} from "@/lib/onboarding";
import Dashboard from "@/pages/Dashboard";
import FocusPage from "@/pages/FocusPage";
import HomePage from "@/pages/HomePage";
import LandingPage from "@/pages/LandingPage";
import MentorPage from "@/pages/MentorPage";
import NotesPad from "@/pages/NotesPad";
import NotFoundPage from "@/pages/NotFoundPage";
import OnboardingFlow from "@/pages/OnboardingFlow";
import SearchPage from "@/pages/SearchPage";
import ShifterPage from "@/pages/ShifterPage";
import StorePage from "@/pages/StorePage";
import SubscribePage from "@/pages/SubscribePage";
import StudyPlanner from "@/pages/StudyPlanner";
import TaskManager from "@/pages/TaskManager";
import UserSettings from "@/pages/UserSettings";
import WeeklyReport from "@/pages/WeeklyReport";

const clerkPubKey =
  process.env.REACT_APP_CLERK_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const clerkAppearance = {
  baseTheme: undefined,
  variables: {
    colorPrimary: "hsl(166, 100%, 70%)",
    colorBackground: "hsl(217, 64%, 11%)",
    colorText: "hsl(226, 56%, 88%)",
    colorTextSecondary: "hsl(226, 40%, 60%)",
    colorInputBackground: "hsl(217, 55%, 14%)",
    colorInputText: "hsl(226, 56%, 88%)",
    borderRadius: "0.625rem",
    fontFamily: "'IBM Plex Sans', sans-serif",
  },
  elements: {
    card: {
      backgroundColor: "hsl(217, 55%, 14%)",
      border: "1px solid hsl(217, 40%, 22%)",
      boxShadow: "0 4px 20px -4px hsl(217 64% 5% / 0.5)",
    },
    formButtonPrimary: {
      backgroundColor: "hsl(166, 100%, 70%)",
      color: "hsl(217, 64%, 11%)",
      "&:hover": {
        backgroundColor: "hsl(166, 100%, 60%)",
      },
    },
    formFieldInput: {
      backgroundColor: "hsl(217, 55%, 14%)",
      borderColor: "hsl(217, 40%, 22%)",
      color: "hsl(226, 56%, 88%)",
      "&:focus": {
        borderColor: "hsl(166, 100%, 70%)",
      },
    },
    footerActionLink: {
      color: "hsl(166, 100%, 70%)",
    },
    headerTitle: {
      color: "hsl(226, 56%, 88%)",
    },
    headerSubtitle: {
      color: "hsl(226, 40%, 60%)",
    },
    socialButtonsBlockButton: {
      backgroundColor: "hsl(217, 50%, 18%)",
      borderColor: "hsl(217, 40%, 22%)",
      color: "hsl(226, 56%, 88%)",
      "&:hover": {
        backgroundColor: "hsl(217, 45%, 20%)",
      },
    },
    dividerLine: {
      backgroundColor: "hsl(217, 40%, 22%)",
    },
    dividerText: {
      color: "hsl(226, 40%, 60%)",
    },
  },
};

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-12 animate-pulse rounded-2xl bg-accent/20" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function ProfileLoadErrorScreen({ message, onRetry }) {
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

function AppAccessGuard({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();
  const [onboardingState, setOnboardingState] = useState({
    loading: true,
    completed: false,
    error: null,
  });
  // Bumping this re-runs the load effect on demand from the error screen's
  // Retry button. Cleaner than re-checking pathname or unmounting.
  const [retryCounter, setRetryCounter] = useState(0);

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

function AppRoutes({ withAuthGuard }) {
  const shellWithPurchases = (
    <UserSubscriptionProvider>
      <UserPurchasesProvider>
        <AppShell />
      </UserPurchasesProvider>
    </UserSubscriptionProvider>
  );

  const appShellElement = withAuthGuard ? (
    <AppAccessGuard>{shellWithPurchases}</AppAccessGuard>
  ) : (
    shellWithPurchases
  );

  return (
    <Routes>
      <Route path="/" element={<Gatekeeper />} />
      <Route path="/landing" element={<LandingPage />} />

      <Route path="/app" element={appShellElement}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="legacy" element={<HomePage />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="tasks" element={<TaskManager />} />
        <Route path="planner" element={<StudyPlanner />} />
        <Route path="focus" element={<FocusPage />} />
        <Route path="mentor" element={<MentorPage />} />
        <Route path="store" element={<StorePage />} />
        <Route path="store/:degreeSlug" element={<StorePage />} />
        <Route path="subscribe" element={<SubscribePage />} />
        <Route path="notes" element={<NotesPad />} />
        <Route path="progress" element={<WeeklyReport />} />
        <Route path="settings" element={<UserSettings />} />
        <Route path="onboarding" element={<OnboardingFlow />} />

        <Route path="search" element={<SearchPage />} />
        <Route path="shifter" element={<ShifterPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function MissingAuthConfigScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-semibold text-foreground">Sign-in is temporarily unavailable</h1>
        <p className="text-sm text-muted-foreground">
          We can't reach the authentication service right now. Please try again in a few minutes
          or contact support if the problem persists.
        </p>
      </div>
    </div>
  );
}

function App() {
  if (!clerkPubKey) {
    console.warn("[Clerk] No publishable key found. Set REACT_APP_CLERK_PUBLISHABLE_KEY in .env.local");

    // Production: NEVER render the app unguarded. Hard-fail with a user-facing message.
    // The old behavior (running with withAuthGuard={false}) silently exposed every /app/*
    // route to anonymous users and is the root cause of the "auth is broken" walkthrough finding.
    if (process.env.NODE_ENV === "production") {
      return (
        <div className="min-h-screen bg-background text-foreground">
          <MissingAuthConfigScreen />
          <Toaster position="top-center" richColors />
        </div>
      );
    }

    // Development convenience: render the landing page for marketing work without Clerk,
    // but refuse to render any /app/* route — they would also be unguarded.
    return (
      <div className="min-h-screen bg-background text-foreground">
        <BrowserRouter>
          <Routes>
            <Route path="*" element={<LandingPage />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPubKey} appearance={clerkAppearance}>
      <div className="min-h-screen bg-background text-foreground">
        <BrowserRouter>
          <AppRoutes withAuthGuard={true} />
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </div>
    </ClerkProvider>
  );
}

export default App;
