import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ---------- mocks ----------
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

jest.mock("@/context/UserPurchasesContext", () => ({
  useUserPurchasesContext: () => ({
    identityLoading: false,
    identityError: null,
  }),
}));

jest.mock("@/lib/onboarding", () => ({
  fetchMyStudentProfile: jest.fn().mockRejectedValue(new Error("skip")),
  getOnboardingProfile: jest.fn().mockReturnValue(null),
  persistMyStudentProfile: jest.fn().mockResolvedValue({}),
  setOnboardingComplete: jest.fn(),
  setOnboardingProfile: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

import OnboardingFlow from "@/pages/OnboardingFlow";
import { persistMyStudentProfile, setOnboardingComplete } from "@/lib/onboarding";

function renderOnboarding() {
  return render(
    <MemoryRouter>
      <OnboardingFlow />
    </MemoryRouter>
  );
}

describe("OnboardingFlow", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders step 1 with Grade Level input", () => {
    renderOnboarding();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(screen.getByLabelText(/grade level/i)).toBeInTheDocument();
  });

  it("disables Back button on the first step", () => {
    renderOnboarding();
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled();
  });

  it("advances to step 2 when grade level is filled", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.type(screen.getByLabelText(/grade level/i), "10th Grade");
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
    expect(screen.getByLabelText(/main subjects/i)).toBeInTheDocument();
  });

  it("navigates back from step 2 to step 1", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.type(screen.getByLabelText(/grade level/i), "Freshman");
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
  });

  it("completes full onboarding flow and navigates to dashboard", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    // Step 1 – grade level
    await user.type(screen.getByLabelText(/grade level/i), "Sophomore");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 2 – subjects
    await user.type(screen.getByLabelText(/main subjects/i), "Math, Physics");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 3 – weekly goal (pre-filled with 10; just advance)
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 4 – study preferences (optional; just advance)
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 5 – timezone (pre-filled); click Finish
    expect(screen.getByText("Step 5 of 5")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /finish/i }));

    expect(persistMyStudentProfile).toHaveBeenCalledTimes(1);
    expect(setOnboardingComplete).toHaveBeenCalledWith(true);
    expect(mockNavigate).toHaveBeenCalledWith("/app/dashboard", { replace: true });
  });
});
