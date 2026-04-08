import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("@/pages/LandingPage", () => () => (
  <div data-testid="landing-page">Landing</div>
));

const mockUseAuth = jest.fn();

function loadGatekeeper(envOverrides = {}) {
  jest.resetModules();
  Object.assign(process.env, envOverrides);
  jest.doMock("@clerk/clerk-react", () => ({
    useAuth: mockUseAuth,
    ClerkProvider: ({ children }) => <>{children}</>,
    UserButton: () => <div data-testid="user-button" />,
  }));
  return require("@/components/Gatekeeper").default;
}

describe("Gatekeeper", () => {
  const originalEnv = { ...process.env };

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

});
