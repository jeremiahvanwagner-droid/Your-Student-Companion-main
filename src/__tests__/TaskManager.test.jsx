import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ────────────────────────────────────────────────────────────────

const mockFetchTasks = jest.fn();
const mockCreateTask = jest.fn();
const mockPatchTaskStatus = jest.fn();
const mockDeleteTask = jest.fn();
const mockFetchSubjects = jest.fn();
const mockCreateSubject = jest.fn();

jest.mock("@/lib/tasksApi", () => ({
  fetchTasks: (...args) => mockFetchTasks(...args),
  createTask: (...args) => mockCreateTask(...args),
  updateTask: jest.fn().mockResolvedValue({}),
  patchTaskStatus: (...args) => mockPatchTaskStatus(...args),
  deleteTask: (...args) => mockDeleteTask(...args),
  fetchSubjects: (...args) => mockFetchSubjects(...args),
  createSubject: (...args) => mockCreateSubject(...args),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Radix Select doesn't render portals well in jsdom — use a simple stub
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

import TaskManager from "@/pages/TaskManager";

const TASK = {
  id: "task-uuid-001",
  user_id: "user-001",
  title: "Read Chapter 5",
  description: "Intro psychology chapter",
  priority: "medium",
  status: "not_started",
  due_date: null,
  subject_id: null,
  estimated_minutes: null,
  created_at: new Date().toISOString(),
};

function defaultMocks() {
  mockFetchTasks.mockResolvedValue({ tasks: [], count: 0 });
  mockFetchSubjects.mockResolvedValue({ subjects: [] });
  mockCreateTask.mockResolvedValue({ task: TASK });
  mockPatchTaskStatus.mockResolvedValue({ task: { ...TASK, status: "in_progress" } });
  mockDeleteTask.mockResolvedValue(undefined);
}

function renderTaskManager() {
  return render(
    <MemoryRouter>
      <TaskManager />
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("TaskManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    defaultMocks();
  });

  it("renders the board with four status columns after loading", async () => {
    renderTaskManager();
    // The Kanban grid only renders once loading resolves
    await waitFor(() => expect(screen.getByText("Not Started")).toBeInTheDocument());
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("create: opens dialog, fills title, submits and triggers createTask", async () => {
    mockFetchTasks
      .mockResolvedValueOnce({ tasks: [], count: 0 }) // initial load
      .mockResolvedValue({ tasks: [TASK], count: 1 }); // after create

    renderTaskManager();
    await waitFor(() => expect(screen.getByRole("button", { name: /new task/i })).toBeInTheDocument());

    // Open the New Task dialog
    await userEvent.click(screen.getByRole("button", { name: /new task/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Fill in the title
    const titleInput = screen.getByLabelText(/title/i);
    await userEvent.type(titleInput, "Read Chapter 5");

    // Submit
    await userEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Read Chapter 5" })
      );
    });

    // Board should show the task after reload
    await waitFor(() => {
      expect(screen.getByText("Read Chapter 5")).toBeInTheDocument();
    });
  });

  it("list: renders fetched tasks on the board", async () => {
    mockFetchTasks.mockResolvedValue({ tasks: [TASK], count: 1 });

    renderTaskManager();

    await waitFor(() => {
      expect(screen.getByText("Read Chapter 5")).toBeInTheDocument();
    });

    // Badge counts: Not Started column should show 1
    const notStartedLabel = screen.getByText("Not Started");
    const columnHeader = notStartedLabel.closest("div");
    const badge = within(columnHeader).getByText("1");
    expect(badge).toBeInTheDocument();
  });

  it("complete: advance button calls patchTaskStatus with next status", async () => {
    mockFetchTasks.mockResolvedValue({ tasks: [TASK], count: 1 });

    renderTaskManager();
    await waitFor(() => expect(screen.getByText("Read Chapter 5")).toBeInTheDocument());

    const advanceBtn = screen.getByRole("button", { name: /in progress/i });
    await userEvent.click(advanceBtn);

    await waitFor(() => {
      expect(mockPatchTaskStatus).toHaveBeenCalledWith(TASK.id, "in_progress");
    });
  });

  it("overdue: tasks with past due dates in active statuses show overdue indicator", async () => {
    const overdueTask = { ...TASK, due_date: "2020-01-01", status: "not_started" };
    mockFetchTasks.mockResolvedValue({ tasks: [overdueTask], count: 1 });

    renderTaskManager();
    await waitFor(() => expect(screen.getByText("Read Chapter 5")).toBeInTheDocument());

    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });
});
