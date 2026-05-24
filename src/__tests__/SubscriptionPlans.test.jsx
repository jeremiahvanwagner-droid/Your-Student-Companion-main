import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ---------- mocks ----------
let mockSubscriptionContext = {
  subscription: null,
  loading: false,
  error: null,
  refresh: jest.fn(),
  isActive: false,
  isTrialing: false,
  tier: null,
  degreePlanId: null,
};

let mockPurchasesContext = {
  userId: "test-user-id",
  purchases: [],
  loading: false,
  error: null,
  refresh: jest.fn(),
  isPackUnlocked: () => false,
  unlockedPackIds: new Set(),
  unlockedPackNames: [],
  identityLoading: false,
  identityError: null,
};

jest.mock("@/context/UserSubscriptionContext", () => ({
  useUserSubscriptionContext: () => mockSubscriptionContext,
}));

jest.mock("@/context/UserPurchasesContext", () => ({
  useUserPurchasesContext: () => mockPurchasesContext,
}));

jest.mock("@/components/store/storeApi", () => ({
  fetchDegreePlans: jest.fn(),
  formatUsd: (value) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
      Number(value || 0)
    ),
}));

jest.mock("@/components/store/subscriptionApi", () => ({
  createSubscriptionCheckoutSession: jest.fn(),
  createBillingPortalSession: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Stub Radix Select so jsdom doesn't choke on portal/pointer events
jest.mock("@/components/ui/select", () => {
  const React = require("react");
  const Select = ({ value, onValueChange, children }) => (
    <select
      data-testid="degree-select"
      value={value || ""}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="">Select a degree</option>
      {React.Children.toArray(children)
        .flatMap((child) => (child?.props?.children ? React.Children.toArray(child.props.children) : []))
        .filter((c) => c?.props?.value !== undefined)
        .map((item) => (
          <option key={item.props.value} value={item.props.value}>
            {item.props.children}
          </option>
        ))}
    </select>
  );
  return {
    Select,
    SelectContent: ({ children }) => <>{children}</>,
    SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
    SelectTrigger: ({ children }) => <>{children}</>,
    SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
    SelectGroup: ({ children }) => <>{children}</>,
  };
});

import SubscriptionPlans from "@/components/subscribe/SubscriptionPlans";
import { fetchDegreePlans } from "@/components/store/storeApi";
import { createSubscriptionCheckoutSession } from "@/components/store/subscriptionApi";
import { toast } from "sonner";

function renderPlans() {
  return render(
    <MemoryRouter>
      <SubscriptionPlans />
    </MemoryRouter>
  );
}

describe("SubscriptionPlans", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptionContext = {
      ...mockSubscriptionContext,
      subscription: null,
      isActive: false,
      isTrialing: false,
    };
    mockPurchasesContext = { ...mockPurchasesContext, purchases: [] };
    fetchDegreePlans.mockResolvedValue({
      degree_plans: [
        { id: 1, name: "Nursing", slug: "nursing" },
        { id: 2, name: "Computer Science", slug: "cs" },
      ],
    });
  });

  it("renders both tier cards", async () => {
    renderPlans();
    await waitFor(() => {
      expect(screen.getByText("Degree Bundle")).toBeInTheDocument();
      expect(screen.getByText("All-Access")).toBeInTheDocument();
    });
  });

  it("toggles between monthly and annual pricing", async () => {
    const user = userEvent.setup();
    renderPlans();

    await waitFor(() => screen.getByText("Degree Bundle"));

    // Monthly defaults
    expect(screen.getByText("$7.99")).toBeInTheDocument();
    expect(screen.getByText("$14.99")).toBeInTheDocument();

    // Switch to annual
    const annualToggle = screen.getByRole("button", { name: /Annual/ });
    await user.click(annualToggle);

    expect(screen.getByText("$79.99")).toBeInTheDocument();
    expect(screen.getByText("$149.99")).toBeInTheDocument();
  });

  it("blocks Degree Bundle checkout when no degree is picked", async () => {
    renderPlans();

    await waitFor(() => screen.getByText("Degree Bundle"));
    // Wait for the Degree Bundle button to exit its "Starting..." loading state
    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /Start 14-day free trial/i });
      expect(buttons).toHaveLength(2);
    });

    const trialButtons = screen.getAllByRole("button", { name: /Start 14-day free trial/i });
    // trialButtons[0] is Degree Bundle (rendered first)
    expect(trialButtons[0]).toBeDisabled();
    expect(createSubscriptionCheckoutSession).not.toHaveBeenCalled();
  });

  it("calls checkout for All-Access without a degree picker", async () => {
    const user = userEvent.setup();
    createSubscriptionCheckoutSession.mockResolvedValue({
      checkout_url: "https://stripe.example/cs_test_xyz",
    });

    const originalLocation = window.location;
    delete window.location;
    window.location = {
      ...originalLocation,
      href: "",
      origin: "http://localhost:3000",
      pathname: "/app/subscribe",
    };

    renderPlans();
    await waitFor(() => screen.getByText("All-Access"));
    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /Start 14-day free trial/i });
      expect(buttons).toHaveLength(2);
    });

    const trialButtons = screen.getAllByRole("button", { name: /Start 14-day free trial/i });
    // All-Access is the second card
    await user.click(trialButtons[1]);

    await waitFor(() => {
      expect(createSubscriptionCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: "all_access",
          cadence: "monthly",
          degree_plan_id: null,
        })
      );
    });

    expect(window.location.href).toBe("https://stripe.example/cs_test_xyz");

    window.location = originalLocation;
  });

  it("shows the CurrentSubscriptionBanner when subscription is active", async () => {
    mockSubscriptionContext = {
      ...mockSubscriptionContext,
      subscription: {
        tier: "degree_bundle",
        plan_type: "degree_bundle_monthly",
        status: "trialing",
        trial_end: "2026-06-06T00:00:00+00:00",
      },
      isActive: true,
      isTrialing: true,
      tier: "degree_bundle",
    };

    renderPlans();

    await waitFor(() => {
      expect(screen.getByText(/You're on the Degree Bundle/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Manage subscription/i })).toBeInTheDocument();
  });

  it("renders the lifetime-access notice when user has any lifetime purchase", async () => {
    mockPurchasesContext = {
      ...mockPurchasesContext,
      purchases: [{ id: 1, lifetime_access: true, status: "completed" }],
    };

    renderPlans();

    await waitFor(() => {
      expect(screen.getByText(/Your existing packs are yours forever/i)).toBeInTheDocument();
    });
  });
});
