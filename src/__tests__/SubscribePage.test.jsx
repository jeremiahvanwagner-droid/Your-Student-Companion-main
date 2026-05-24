import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockRefresh = jest.fn();
let mockSubscriptionContext = {
  subscription: null,
  loading: false,
  error: null,
  refresh: mockRefresh,
  isActive: false,
  isTrialing: false,
  tier: null,
  degreePlanId: null,
};

jest.mock("@/context/UserSubscriptionContext", () => ({
  useUserSubscriptionContext: () => mockSubscriptionContext,
}));

jest.mock("@/components/subscribe/SubscriptionPlans", () => {
  return function MockSubscriptionPlans() {
    return <div data-testid="subscription-plans">Plans</div>;
  };
});

jest.mock("@/components/subscribe/SubscriptionSuccess", () => {
  return function MockSubscriptionSuccess({ onAcknowledge }) {
    return (
      <div data-testid="subscription-success">
        <button onClick={onAcknowledge}>Acknowledge</button>
      </div>
    );
  };
});

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

import SubscribePage from "@/pages/SubscribePage";
import { toast } from "sonner";

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SubscribePage />
    </MemoryRouter>
  );
}

describe("SubscribePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptionContext = {
      ...mockSubscriptionContext,
      subscription: null,
      isActive: false,
    };
  });

  it("renders SubscriptionPlans by default", () => {
    renderAt("/app/subscribe");
    expect(screen.getByTestId("subscription-plans")).toBeInTheDocument();
    expect(screen.queryByTestId("subscription-success")).not.toBeInTheDocument();
  });

  it("switches to success view and triggers refresh when ?checkout=success", async () => {
    renderAt("/app/subscribe?checkout=success");

    await waitFor(() => {
      expect(screen.getByTestId("subscription-success")).toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Subscription started",
      expect.objectContaining({ description: expect.any(String) })
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("shows toast on ?checkout=cancel and stays on plans", async () => {
    renderAt("/app/subscribe?checkout=cancel");

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(
        "Checkout canceled",
        expect.objectContaining({ description: expect.any(String) })
      );
    });
    expect(screen.getByTestId("subscription-plans")).toBeInTheDocument();
    expect(screen.queryByTestId("subscription-success")).not.toBeInTheDocument();
  });

  it("returns to plans view when SubscriptionSuccess acknowledges", async () => {
    const user = userEvent.setup();
    renderAt("/app/subscribe?checkout=success");

    await waitFor(() => screen.getByTestId("subscription-success"));

    await user.click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() => {
      expect(screen.getByTestId("subscription-plans")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("subscription-success")).not.toBeInTheDocument();
  });
});
