import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUseAuth = jest.fn();

jest.mock("@clerk/clerk-react", () => ({
  useAuth: () => mockUseAuth(),
}));

import NotFoundPage from "@/pages/NotFoundPage";

function renderAt(pathname) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <NotFoundPage />
    </MemoryRouter>
  );
}

describe("NotFoundPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the 404 heading and the unknown pathname", () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false });
    renderAt("/this/route/does/not/exist");

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByText("/this/route/does/not/exist")).toBeInTheDocument();
  });

  it("offers Dashboard CTA when the user is signed in", () => {
    mockUseAuth.mockReturnValue({ isSignedIn: true });
    renderAt("/app/unknown");

    expect(screen.getByRole("link", { name: /go to dashboard/i })).toHaveAttribute(
      "href",
      "/app/dashboard"
    );
    // The "Back to Home" CTA should NOT appear in the signed-in branch
    expect(screen.queryByRole("link", { name: /back to home/i })).not.toBeInTheDocument();
  });

  it("offers Back to Home CTA when the user is signed out", () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false });
    renderAt("/some/path");

    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: /go to dashboard/i })).not.toBeInTheDocument();
  });

  it("always renders the Landing Page secondary link", () => {
    mockUseAuth.mockReturnValue({ isSignedIn: true });
    renderAt("/x");

    expect(screen.getByRole("link", { name: /landing page/i })).toHaveAttribute("href", "/");
  });
});
