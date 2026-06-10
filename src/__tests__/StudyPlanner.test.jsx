import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ────────────────────────────────────────────────────────────────

const mockFetchBlocks = jest.fn();
const mockCreateBlock = jest.fn();
const mockCreateBlocksBulk = jest.fn();
const mockCompleteBlock = jest.fn();
const mockDeleteBlock = jest.fn();
const mockFetchSuggestions = jest.fn();

jest.mock("@/lib/plannerApi", () => ({
  fetchBlocks: (...args) => mockFetchBlocks(...args),
  createBlock: (...args) => mockCreateBlock(...args),
  createBlocksBulk: (...args) => mockCreateBlocksBulk(...args),
  updateBlock: jest.fn().mockResolvedValue({}),
  completeBlock: (...args) => mockCompleteBlock(...args),
  deleteBlock: (...args) => mockDeleteBlock(...args),
  fetchSuggestions: (...args) => mockFetchSuggestions(...args),
}));

const mockFetchSubjects = jest.fn();

jest.mock("@/lib/tasksApi", () => ({
  fetchSubjects: (...args) => mockFetchSubjects(...args),
  createSubject: jest.fn().mockResolvedValue({}),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock("@/components/ui/select", () => {
  const React = require("react");
  const Select = ({ value, onValueChange, children }) => (
    <div data-testid="select" data-value={value}>
      {React.Children.map(children, (child) => {
        if (!child) return null;
        return React.cloneElement(child, { onValueChange });
      })}
    </div>
  );
  const SelectTrigger = ({ children }) => <button type="button">{children}</button>;
  const SelectValue = ({ placeholder }) => <span>{placeholder}</span>;
  const SelectContent = ({ children }) => <div>{children}</div>;
  const SelectItem = ({ value, children, onValueChange }) => (
    <button type="button" onClick={() => onValueChange?.(value)} data-value={value}>
      {children}
    </button>
  );
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

import StudyPlanner from "@/pages/StudyPlanner";

function blockAt(hoursFromNow, overrides = {}) {
  const start = new Date(Date.now() + hoursFromNow * 3600_000);
  const end = new Date(start.getTime() + 45 * 60000);
  return {
    id: "block-uuid-001",
    title: "Algebra problem set",
    goal: "Finish problems 1-10",
    subject_id: null,
    assignment_id: null,
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    completed: false,
    source: "manual",
    ...overrides,
  };
}

function defaultMocks() {
  mockFetchBlocks.mockResolvedValue({ blocks: [], count: 0 });
  mockFetchSubjects.mockResolvedValue({ subjects: [] });
  mockCreateBlock.mockResolvedValue({ block: blockAt(1) });
  mockCreateBlocksBulk.mockResolvedValue({ blocks: [], count: 1 });
  mockCompleteBlock.mockResolvedValue({ block: blockAt(1, { completed: true }) });
  mockDeleteBlock.mockResolvedValue(undefined);
  mockFetchSuggestions.mockResolvedValue({ suggestions: [], count: 0 });
}

function renderPlanner() {
  return render(
    <MemoryRouter>
      <StudyPlanner />
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("StudyPlanner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    defaultMocks();
  });

  it("renders a seven-day week with empty days", async () => {
    renderPlanner();
    await waitFor(() => {
      expect(screen.getAllByText("Free").length).toBe(7);
    });
    expect(mockFetchBlocks).toHaveBeenCalledWith(
      expect.objectContaining({ start: expect.any(String), end: expect.any(String) })
    );
  });

  it("renders blocks inside the current week", async () => {
    mockFetchBlocks.mockResolvedValue({ blocks: [blockAt(1)], count: 1 });

    renderPlanner();
    await waitFor(() => {
      expect(screen.getByText("Algebra problem set")).toBeInTheDocument();
    });
    expect(screen.getByText("Finish problems 1-10")).toBeInTheDocument();
  });

  it("creates a block from the dialog", async () => {
    renderPlanner();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /new block/i })).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole("button", { name: /new block/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/title/i), "Essay outline");
    await userEvent.click(screen.getByRole("button", { name: /add block/i }));

    await waitFor(() => {
      expect(mockCreateBlock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Essay outline",
          scheduled_start: expect.any(String),
          scheduled_end: expect.any(String),
        })
      );
    });
  });

  it("toggles a block complete", async () => {
    mockFetchBlocks.mockResolvedValue({ blocks: [blockAt(1)], count: 1 });

    renderPlanner();
    await waitFor(() =>
      expect(screen.getByText("Algebra problem set")).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole("button", { name: /mark complete/i }));

    await waitFor(() => {
      expect(mockCompleteBlock).toHaveBeenCalledWith("block-uuid-001", true);
    });
  });

  it("accepts auto-suggestions through the bulk endpoint", async () => {
    const start = new Date(Date.now() + 24 * 3600_000);
    const end = new Date(start.getTime() + 60 * 60000);
    mockFetchSuggestions.mockResolvedValue({
      suggestions: [
        {
          title: "Study: Essay draft",
          goal: "Prepare for due date",
          subject_id: null,
          assignment_id: "assignment-001",
          scheduled_start: start.toISOString(),
          scheduled_end: end.toISOString(),
          source: "auto_suggest",
          priority: "high",
        },
      ],
      count: 1,
    });

    renderPlanner();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /auto-suggest/i })).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole("button", { name: /auto-suggest/i }));

    await waitFor(() => {
      expect(screen.getByText("Study: Essay draft")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /add selected/i }));

    await waitFor(() => {
      expect(mockCreateBlocksBulk).toHaveBeenCalledWith([
        expect.objectContaining({
          title: "Study: Essay draft",
          assignment_id: "assignment-001",
          source: "auto_suggest",
        }),
      ]);
    });
  });
});
