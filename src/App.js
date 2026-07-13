import "@/App.css";
import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import * as Sentry from "@sentry/react";
import { Loader2 } from "lucide-react";

import AppAccessGuard from "@/components/AppAccessGuard";
import { Button } from "@/components/ui/button";
import Gatekeeper from "@/components/Gatekeeper";
import AppShell from "@/components/layout/AppShell";
import { UserPurchasesProvider } from "@/context/UserPurchasesContext";
import { UserSubscriptionProvider } from "@/context/UserSubscriptionContext";
import { Toaster } from "@/components/ui/sonner";
import Dashboard from "@/pages/Dashboard";
import LandingPage from "@/pages/LandingPage";

// Route-level code splitting (Market Thirteen #6): Landing and Dashboard stay
// in the main bundle (first paint for signed-out and signed-in users); every
// other page loads on navigation. Keeps Recharts, the store, and the mentor
// out of the critical path.
const FocusPage = lazy(() => import("@/pages/FocusPage"));
const HomePage = lazy(() => import("@/pages/HomePage"));
const MentorPage = lazy(() => import("@/pages/MentorPage"));
const NotesPad = lazy(() => import("@/pages/NotesPad"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));
const OnboardingFlow = lazy(() => import("@/pages/OnboardingFlow"));
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage"));
const TermsPage = lazy(() => import("@/pages/TermsPage"));
const SearchPage = lazy(() => import("@/pages/SearchPage"));
const ShifterPage = lazy(() => import("@/pages/ShifterPage"));
const StorePage = lazy(() => import("@/pages/StorePage"));
const SubscribePage = lazy(() => import("@/pages/SubscribePage"));
const StudyPlanner = lazy(() => import("@/pages/StudyPlanner"));
const TaskManager = lazy(() => import("@/pages/TaskManager"));
const UserSettings = lazy(() => import("@/pages/UserSettings"));
const WeeklyReport = lazy(() => import("@/pages/WeeklyReport"));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
    </div>
  );
}

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
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Gatekeeper />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />

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
    </Suspense>
  );
}

function GlobalErrorFallback({ resetError }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          The page hit an unexpected error. Our team has been notified. You can
          try again, or refresh the browser if it keeps happening.
        </p>
        <Button
          onClick={resetError}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          Try again
        </Button>
      </div>
    </div>
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
    // Legal pages stay reachable — they must never depend on auth config.
    return (
      <div className="min-h-screen bg-background text-foreground">
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="*" element={<LandingPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </div>
    );
  }

  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => <GlobalErrorFallback resetError={resetError} />}
    >
      <ClerkProvider publishableKey={clerkPubKey} appearance={clerkAppearance}>
        <div className="min-h-screen bg-background text-foreground">
          <BrowserRouter>
            <AppRoutes withAuthGuard={true} />
          </BrowserRouter>
          <Toaster position="top-center" richColors />
        </div>
      </ClerkProvider>
    </Sentry.ErrorBoundary>
  );
}

export default App;
