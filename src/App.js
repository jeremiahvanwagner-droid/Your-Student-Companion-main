import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";

import Gatekeeper from "@/components/Gatekeeper";
import AppShell from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { isOnboardingComplete } from "@/lib/onboarding";
import Dashboard from "@/pages/Dashboard";
import FocusPage from "@/pages/FocusPage";
import HomePage from "@/pages/HomePage";
import LandingPage from "@/pages/LandingPage";
import MentorPage from "@/pages/MentorPage";
import NotesPad from "@/pages/NotesPad";
import OnboardingFlow from "@/pages/OnboardingFlow";
import SearchPage from "@/pages/SearchPage";
import ShifterPage from "@/pages/ShifterPage";
import StorePage from "@/pages/StorePage";
import StudyPlanner from "@/pages/StudyPlanner";
import TaskManager from "@/pages/TaskManager";
import UserSettings from "@/pages/UserSettings";
import WeeklyReport from "@/pages/WeeklyReport";

const clerkPubKey = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

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

function AppAccessGuard({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return <LoadingScreen />;
  }

  if (!isSignedIn) {
    return <Navigate to="/" replace />;
  }

  const onboardingDone = isOnboardingComplete();
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
  const appShellElement = withAuthGuard ? (
    <AppAccessGuard>
      <AppShell />
    </AppAccessGuard>
  ) : (
    <AppShell />
  );

  return (
    <Routes>
      <Route path="/" element={<Gatekeeper />} />
      <Route path="/landing" element={<LandingPage />} />

      <Route path="/app/legacy" element={<HomePage />} />

      <Route path="/app" element={appShellElement}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="tasks" element={<TaskManager />} />
        <Route path="planner" element={<StudyPlanner />} />
        <Route path="focus" element={<FocusPage />} />
        <Route path="mentor" element={<MentorPage />} />
        <Route path="store" element={<StorePage />} />
        <Route path="store/:degreeSlug" element={<StorePage />} />
        <Route path="notes" element={<NotesPad />} />
        <Route path="progress" element={<WeeklyReport />} />
        <Route path="settings" element={<UserSettings />} />
        <Route path="onboarding" element={<OnboardingFlow />} />

        <Route path="search" element={<SearchPage />} />
        <Route path="shifter" element={<ShifterPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  if (!clerkPubKey) {
    console.warn("[Clerk] No publishable key found. Set REACT_APP_CLERK_PUBLISHABLE_KEY in .env");

    return (
      <div className="min-h-screen bg-background text-foreground">
        <BrowserRouter>
          <AppRoutes withAuthGuard={false} />
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
