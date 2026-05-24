import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("@/pages/LandingPage", () => () => (
  <div data-testid="landing-page">Landing</div>
));

const mockUseAuth = jest.fn();
const mockClearSentryUser = jest.fn();

function loadGatekeeper(envOverrides = {}) {
  jest.resetModules();
  Object.assign(process.env, envOverrides);
  jest.doMock("@clerk/clerk-react", () => ({
    useAuth: mockUseAuth,
    ClerkProvider: ({ children }) => <>{children}</>,
    UserButton: () => <div data-testid="user-button" />,
  }));
  jest.doMock("@/lib/sentry", () => ({
    clearSentryUser: (...args) => mockClearSentryUser(...args),
  }));
  return require("@/components/Gatekeeper").default;
}

describe("Gatekeeper", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockClearSentryUser.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it("shows landing page when Clerk key is missing", () => {
    delete process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const Gatekeeper = loadGatekeeper();
    render(<MemoryRouter><Gatekeeper /></MemoryRouter>);
    expect(screen.getByTestId("landing-page")).toBeInTheDocument();
  });

  it("shows loading state while Clerk is loading", () => {
    mockUseAuth.mockReturnValue({ isLoaded: false, isSignedIn: false });
    const Gatekeeper = loadGatekeeper({ REACT_APP_CLERK_PUBLISHABLE_KEY: "pk_test_fake" });
    render(<MemoryRouter><Gatekeeper /></MemoryRouter>);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows landing page when user is not signed in", () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const Gatekeeper = loadGatekeeper({ REACT_APP_CLERK_PUBLISHABLE_KEY: "pk_test_fake" });
    render(<MemoryRouter><Gatekeeper /></MemoryRouter>);
    expect(screen.getByTestId("landing-page")).toBeInTheDocument();
  });

  // REGRESSION: when Clerk resolves an unauthenticated session (post-sign-out
  // or fresh visit on a shared device), the Gatekeeper must wipe any
  // onboarding state lingering in localStorage. Without this, signing in as
  // a different user inherits the prior user's ysc_onboarding_completed=true
  // and skips the wizard.
  it("clears onboarding localStorage when an unauthenticated session resolves", () => {
    localStorage.setItem("ysc_onboarding_completed", "true");
    localStorage.setItem("ysc_onboarding_profile", JSON.stringify({ grade_level: "Senior" }));

    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const Gatekeeper = loadGatekeeper({ REACT_APP_CLERK_PUBLISHABLE_KEY: "pk_test_fake" });
    render(<MemoryRouter><Gatekeeper /></MemoryRouter>);

    expect(localStorage.getItem("ysc_onboarding_completed")).toBeNull();
    expect(localStorage.getItem("ysc_onboarding_profile")).toBeNull();
  });

  it("does NOT clear localStorage while Clerk is still loading", () => {
    localStorage.setItem("ysc_onboarding_completed", "true");

    mockUseAuth.mockReturnValue({ isLoaded: false, isSignedIn: false });
    const Gatekeeper = loadGatekeeper({ REACT_APP_CLERK_PUBLISHABLE_KEY: "pk_test_fake" });
    render(<MemoryRouter><Gatekeeper /></MemoryRouter>);

    // Cleanup must wait until Clerk has finished loading; otherwise a slow
    // session restore would briefly wipe an authenticated user's state.
    expect(localStorage.getItem("ysc_onboarding_completed")).toBe("true");
  });

  // Sentry user-scope cleanup on sign-out. Without this, a subsequent error
  // on the same device after a different user signs in would still carry the
  // previous user's Clerk id on Sentry events.
  it("clears the Sentry user scope on unauthenticated session resolve", () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const Gatekeeper = loadGatekeeper({ REACT_APP_CLERK_PUBLISHABLE_KEY: "pk_test_fake" });
    render(<MemoryRouter><Gatekeeper /></MemoryRouter>);

    expect(mockClearSentryUser).toHaveBeenCalledTimes(1);
  });

  it("does NOT clear the Sentry user scope while Clerk is still loading", () => {
    mockUseAuth.mockReturnValue({ isLoaded: false, isSignedIn: false });
    const Gatekeeper = loadGatekeeper({ REACT_APP_CLERK_PUBLISHABLE_KEY: "pk_test_fake" });
    render(<MemoryRouter><Gatekeeper /></MemoryRouter>);

    expect(mockClearSentryUser).not.toHaveBeenCalled();
  });

});
