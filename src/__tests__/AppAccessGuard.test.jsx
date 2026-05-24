import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ────────────────────────────────────────────────────────────────

const mockUseAuth = jest.fn();
const mockLocation = { pathname: "/app/dashboard" };

jest.mock("@clerk/clerk-react", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  Navigate: ({ to }) => <div data-testid="navigate" data-to={to} />,
  useLocation: () => mockLocation,
}));

const mockResolveCurrentAppUser = jest.fn();
const mockFetchMyStudentProfile = jest.fn();
const mockSetOnboardingComplete = jest.fn();

jest.mock("@/lib/onboarding", () => ({
  // Keep the localStorage key constants importable in case tests need them
  ONBOARDING_COMPLETED_KEY: "ysc_onboarding_completed",
  ONBOARDING_PROFILE_KEY: "ysc_onboarding_profile",
  resolveCurrentAppUser: (...args) => mockResolveCurrentAppUser(...args),
  fetchMyStudentProfile: (...args) => mockFetchMyStudentProfile(...args),
  setOnboardingComplete: (...args) => mockSetOnboardingComplete(...args),
  // isOnboardingComplete intentionally NOT exported here — if AppAccessGuard
  // ever re-introduces a localStorage fallback, the import will fail and
  // these tests will catch it.
}));

import AppAccessGuard from "@/components/AppAccessGuard";

// ── Helpers ──────────────────────────────────────────────────────────────

function renderGuard() {
  return render(
    <MemoryRouter>
      <AppAccessGuard>
        <div data-testid="children">Protected content</div>
      </AppAccessGuard>
    </MemoryRouter>
  );
}

function setPathname(pathname) {
  mockLocation.pathname = pathname;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("AppAccessGuard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPathname("/app/dashboard");
    localStorage.clear();
    mockResolveCurrentAppUser.mockResolvedValue({});
  });

  it("shows the loading screen while Clerk is still loading", () => {
    mockUseAuth.mockReturnValue({ isLoaded: false, isSignedIn: false });
    renderGuard();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });

  it("redirects to / when the user is not signed in", async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    renderGuard();

    await waitFor(() =>
      expect(screen.getByTestId("navigate")).toHaveAttribute("data-to", "/")
    );
    expect(mockResolveCurrentAppUser).not.toHaveBeenCalled();
  });

  it("renders children when signed in, profile loaded, and onboarded", async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockFetchMyStudentProfile.mockResolvedValue({
      profile: { onboarding_completed: true },
    });
    renderGuard();

    await waitFor(() => expect(screen.getByTestId("children")).toBeInTheDocument());
    expect(mockSetOnboardingComplete).toHaveBeenCalledWith(true);
  });

  it("redirects /app/onboarding -> /app/dashboard when already onboarded", async () => {
    setPathname("/app/onboarding");
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockFetchMyStudentProfile.mockResolvedValue({
      profile: { onboarding_completed: true },
    });
    renderGuard();

    await waitFor(() =>
      expect(screen.getByTestId("navigate")).toHaveAttribute("data-to", "/app/dashboard")
    );
  });

  it("redirects to /app/onboarding when profile says onboarding is not complete", async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockFetchMyStudentProfile.mockResolvedValue({
      profile: { onboarding_completed: false },
    });
    renderGuard();

    await waitFor(() =>
      expect(screen.getByTestId("navigate")).toHaveAttribute("data-to", "/app/onboarding")
    );
  });

  it("redirects to /app/onboarding when the user has no profile yet (new user)", async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockFetchMyStudentProfile.mockResolvedValue({ profile: null });
    renderGuard();

    await waitFor(() =>
      expect(screen.getByTestId("navigate")).toHaveAttribute("data-to", "/app/onboarding")
    );
  });

  it("shows the retry screen when the profile fetch throws", async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockFetchMyStudentProfile.mockRejectedValue(new Error("backend exploded"));
    renderGuard();

    await waitFor(() =>
      expect(screen.getByText("We couldn't load your profile")).toBeInTheDocument()
    );
    expect(screen.getByText("backend exploded")).toBeInTheDocument();
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });

  it("Try Again button triggers a fresh fetch", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockFetchMyStudentProfile.mockRejectedValue(new Error("transient"));
    renderGuard();

    await waitFor(() => expect(screen.getByText(/try again/i)).toBeInTheDocument());
    expect(mockFetchMyStudentProfile).toHaveBeenCalledTimes(1);

    // Next call will succeed
    mockFetchMyStudentProfile.mockResolvedValue({
      profile: { onboarding_completed: true },
    });

    await user.click(screen.getByText(/try again/i));

    await waitFor(() => expect(screen.getByTestId("children")).toBeInTheDocument());
    expect(mockFetchMyStudentProfile).toHaveBeenCalledTimes(2);
  });

  // REGRESSION: the original bug class. Previously, if the profile fetch
  // threw, the guard fell back to localStorage's ysc_onboarding_completed.
  // A stale "true" left over from a different user would then pin a brand-
  // new signed-in user past the onboarding wizard. This test ensures that
  // even with stale localStorage set, a fetch error surfaces the retry
  // screen rather than silently granting access.
  it("stale localStorage does NOT grant access when the profile fetch fails", async () => {
    localStorage.setItem("ysc_onboarding_completed", "true");
    localStorage.setItem("ysc_onboarding_profile", JSON.stringify({ grade_level: "Senior" }));

    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockFetchMyStudentProfile.mockRejectedValue(new Error("server unreachable"));
    renderGuard();

    await waitFor(() =>
      expect(screen.getByText("We couldn't load your profile")).toBeInTheDocument()
    );
    // Children must NOT render — that would be the regression
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
    // And the guard must NOT redirect anywhere on the "happy" rails
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });
});
