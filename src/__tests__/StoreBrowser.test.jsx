import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ---------- mocks ----------
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

const mockRefreshPurchases = jest.fn();
jest.mock("@/context/UserPurchasesContext", () => ({
  useUserPurchasesContext: () => ({
    userId: "test-user-id",
    loading: false,
    error: null,
    refresh: mockRefreshPurchases,
    isPackUnlocked: jest.fn().mockReturnValue(false),
    unlockedPackIds: new Set(),
  }),
}));

jest.mock("@/components/store/storeApi", () => ({
  fetchDegreePlans: jest.fn(),
  fetchDegreePacks: jest.fn(),
  fetchPack: jest.fn(),
  createCheckoutSession: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Stub child components to isolate StoreBrowser logic
jest.mock("@/components/store/DegreeSelector", () => {
  return function MockDegreeSelector({ degreePlans, loading, onSelect }) {
    if (loading) return <div data-testid="degree-loading">Loading...</div>;
    return (
      <div data-testid="degree-selector">
        {degreePlans.map((plan) => (
          <button key={plan.slug} data-testid={`degree-${plan.slug}`} onClick={() => onSelect(plan)}>
            {plan.name}
          </button>
        ))}
      </div>
    );
  };
});

jest.mock("@/components/store/LevelSelector", () => {
  return function MockLevelSelector({ packs, onBack, onSelect }) {
    return (
      <div data-testid="level-selector">
        <button data-testid="level-back" onClick={onBack}>Back</button>
        {packs.map((pack) => (
          <button key={pack.id} data-testid={`pack-${pack.id}`} onClick={() => onSelect(pack)}>
            {pack.name}
          </button>
        ))}
      </div>
    );
  };
});

jest.mock("@/components/store/PackDetail", () => {
  return function MockPackDetail({ pack, onBack, onCheckout, checkoutLoading }) {
    return (
      <div data-testid="pack-detail">
        <span data-testid="pack-name">{pack.name}</span>
        <button data-testid="pack-back" onClick={onBack}>Back</button>
        <button data-testid="pack-checkout" disabled={checkoutLoading} onClick={() => onCheckout(pack)}>
          {checkoutLoading ? "Processing..." : "Buy"}
        </button>
      </div>
    );
  };
});

jest.mock("@/components/store/PurchaseSuccess", () => {
  return function MockPurchaseSuccess({ onContinue }) {
    return (
      <div data-testid="purchase-success">
        <button onClick={onContinue}>Continue</button>
      </div>
    );
  };
});

import StoreBrowser from "@/components/store/StoreBrowser";
import {
  fetchDegreePlans,
  fetchDegreePacks,
  fetchPack,
  createCheckoutSession,
} from "@/components/store/storeApi";
import { toast } from "sonner";

function renderStore() {
  return render(
    <MemoryRouter initialEntries={["/app/store"]}>
      <StoreBrowser />
    </MemoryRouter>
  );
}

describe("StoreBrowser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchDegreePlans.mockResolvedValue({
      degree_plans: [
        { slug: "nursing", name: "Nursing" },
        { slug: "cs", name: "Computer Science" },
      ],
    });
    fetchDegreePacks.mockResolvedValue({
      degree_plan: { slug: "nursing", name: "Nursing" },
      packs: [
        { id: "pack-1", name: "Fundamentals" },
        { id: "pack-2", name: "Advanced" },
      ],
    });
    fetchPack.mockResolvedValue({ id: "pack-1", name: "Fundamentals", price: 19.99 });
  });

  it("loads and displays degree plans", async () => {
    renderStore();
    expect(screen.getByTestId("degree-loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("degree-selector")).toBeInTheDocument();
    });
    expect(screen.getByText("Nursing")).toBeInTheDocument();
    expect(screen.getByText("Computer Science")).toBeInTheDocument();
  });

  it("shows packs when a degree is selected", async () => {
    const user = userEvent.setup();
    renderStore();

    await waitFor(() => screen.getByTestId("degree-selector"));
    await user.click(screen.getByTestId("degree-nursing"));

    await waitFor(() => {
      expect(screen.getByTestId("level-selector")).toBeInTheDocument();
    });
    expect(screen.getByText("Fundamentals")).toBeInTheDocument();
  });

  it("shows pack detail when a pack is selected", async () => {
    const user = userEvent.setup();
    renderStore();

    await waitFor(() => screen.getByTestId("degree-selector"));
    await user.click(screen.getByTestId("degree-nursing"));

    await waitFor(() => screen.getByTestId("level-selector"));
    await user.click(screen.getByTestId("pack-pack-1"));

    await waitFor(() => {
      expect(screen.getByTestId("pack-detail")).toBeInTheDocument();
    });
    expect(screen.getByTestId("pack-name")).toHaveTextContent("Fundamentals");
  });

  it("redirects to Stripe on checkout", async () => {
    const user = userEvent.setup();
    createCheckoutSession.mockResolvedValue({ checkout_url: "https://checkout.stripe.com/test" });

    // mock window.location.href assignment
    const originalLocation = window.location;
    delete window.location;
    window.location = { ...originalLocation, href: "", origin: "http://localhost:3000", pathname: "/app/store" };

    renderStore();

    await waitFor(() => screen.getByTestId("degree-selector"));
    await user.click(screen.getByTestId("degree-nursing"));
    await waitFor(() => screen.getByTestId("level-selector"));
    await user.click(screen.getByTestId("pack-pack-1"));
    await waitFor(() => screen.getByTestId("pack-detail"));

    await user.click(screen.getByTestId("pack-checkout"));

    await waitFor(() => {
      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "test-user-id",
          course_pack_id: "pack-1",
        })
      );
    });

    expect(window.location.href).toBe("https://checkout.stripe.com/test");

    // restore
    window.location = originalLocation;
  });

  it("shows error toast when checkout fails", async () => {
    const user = userEvent.setup();
    createCheckoutSession.mockRejectedValue(new Error("Payment gateway down"));

    renderStore();

    await waitFor(() => screen.getByTestId("degree-selector"));
    await user.click(screen.getByTestId("degree-nursing"));
    await waitFor(() => screen.getByTestId("level-selector"));
    await user.click(screen.getByTestId("pack-pack-1"));
    await waitFor(() => screen.getByTestId("pack-detail"));

    await user.click(screen.getByTestId("pack-checkout"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Checkout failed", {
        description: "Payment gateway down",
      });
    });
  });

  it("navigates back from level selector to degree selector", async () => {
    const user = userEvent.setup();
    renderStore();

    await waitFor(() => screen.getByTestId("degree-selector"));
    await user.click(screen.getByTestId("degree-nursing"));
    await waitFor(() => screen.getByTestId("level-selector"));

    await user.click(screen.getByTestId("level-back"));

    await waitFor(() => {
      expect(screen.getByTestId("degree-selector")).toBeInTheDocument();
    });
  });
});
