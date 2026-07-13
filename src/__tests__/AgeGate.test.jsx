import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AGE_BRACKET, AGE_GATE_METADATA_KEY } from "@/lib/ageGate";

// ── Mocks ────────────────────────────────────────────────────────────────

const mockUseUser = jest.fn();
const mockSignOut = jest.fn();

jest.mock("@clerk/clerk-react", () => ({
  useUser: () => mockUseUser(),
  useClerk: () => ({ signOut: mockSignOut }),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

import AgeGate from "@/components/AgeGate";

// ── Helpers ────────────────────────────────────────────────────────────────

function renderGate() {
  return render(
    <AgeGate>
      <div data-testid="children">Protected content</div>
    </AgeGate>
  );
}

function signedInWith(unsafeMetadata) {
  const update = jest.fn().mockResolvedValue({});
  mockUseUser.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    user: { unsafeMetadata, update },
  });
  return update;
}

async function fillDob({ month, day, year }) {
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Birth month"), month);
  await user.selectOptions(screen.getByLabelText("Birth day"), day);
  await user.selectOptions(screen.getByLabelText("Birth year"), year);
  return user;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("AgeGate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a loading screen while Clerk is loading and hides children", () => {
    mockUseUser.mockReturnValue({ isLoaded: false, isSignedIn: false, user: null });
    renderGate();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
    expect(screen.queryByText(/date of birth/i)).not.toBeInTheDocument();
  });

  it("defers to children (inner guard) when signed out — no age form flash", () => {
    mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: false, user: null });
    renderGate();
    expect(screen.getByTestId("children")).toBeInTheDocument();
    expect(screen.queryByText("What's your date of birth?")).not.toBeInTheDocument();
  });

  it("renders children when the user is already age-verified as an adult", () => {
    signedInWith({ [AGE_GATE_METADATA_KEY]: { bracket: AGE_BRACKET.ADULT_18_PLUS, checkedAt: "x" } });
    renderGate();
    expect(screen.getByTestId("children")).toBeInTheDocument();
    expect(screen.queryByText("What's your date of birth?")).not.toBeInTheDocument();
  });

  it("renders children when the user is a verified minor (>=13)", () => {
    signedInWith({ [AGE_GATE_METADATA_KEY]: { bracket: AGE_BRACKET.MINOR_13_17, checkedAt: "x" } });
    renderGate();
    expect(screen.getByTestId("children")).toBeInTheDocument();
  });

  it("shows the blocked screen for an under-13 user and can sign out", async () => {
    signedInWith({ [AGE_GATE_METADATA_KEY]: { bracket: AGE_BRACKET.UNDER_13, checkedAt: "x" } });
    const user = userEvent.setup();
    renderGate();

    expect(screen.getByText(/not old enough/i)).toBeInTheDocument();
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("shows the DOB form to a signed-in user who hasn't been checked", () => {
    signedInWith({});
    renderGate();
    expect(screen.getByText("What's your date of birth?")).toBeInTheDocument();
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });

  it("persists an adult bracket (and never the raw DOB) on submit", async () => {
    const update = signedInWith({ existingKey: "keep-me" });
    renderGate();

    const user = await fillDob({ month: "June", day: "15", year: "1990" });
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const payload = update.mock.calls[0][0];
    expect(payload.unsafeMetadata.existingKey).toBe("keep-me"); // preserves other metadata
    expect(payload.unsafeMetadata[AGE_GATE_METADATA_KEY].bracket).toBe(AGE_BRACKET.ADULT_18_PLUS);
    // Data minimization: the raw birth date must never be persisted
    expect(JSON.stringify(payload)).not.toContain("1990-06-15");
    expect(payload.unsafeMetadata[AGE_GATE_METADATA_KEY]).not.toHaveProperty("dob");
  });

  it("persists an under-13 bracket on submit (so the block sticks)", async () => {
    const update = signedInWith({});
    renderGate();

    const user = await fillDob({ month: "June", day: "15", year: "2020" });
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0].unsafeMetadata[AGE_GATE_METADATA_KEY].bracket).toBe(
      AGE_BRACKET.UNDER_13
    );
  });

  it("shows an error and does not persist when the date is incomplete", async () => {
    const update = signedInWith({});
    const user = userEvent.setup();
    renderGate();

    // Only month picked; day + year left blank
    await user.selectOptions(screen.getByLabelText("Birth month"), "June");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/valid date of birth/i)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});
