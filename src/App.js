import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";

import AppAccessGuard from "@/components/AppAccessGuard";
import Gatekeeper from "@/components/Gatekeeper";
import AppShell from "@/components/layout/AppShell";
import { UserPurchasesProvider } from "@/context/UserPurchasesContext";
import { UserSubscriptionProvider } from "@/context/UserSubscriptionContext";
import { Toaster } from "@/components/ui/sonner";
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
