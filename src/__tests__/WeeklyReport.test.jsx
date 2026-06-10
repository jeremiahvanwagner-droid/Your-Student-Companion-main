import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ────────────────────────────────────────────────────────────────

const mockFetchCurrentWeekReport = jest.fn();
const mockGenerateWeeklyReport = jest.fn();
const mockFetchReportHistory = jest.fn();

jest.mock("@/lib/reportsApi", () => ({
  fetchCurrentWeekReport: (...args) => mockFetchCurrentWeekReport(...args),
  generateWeeklyReport: (...args) => mockGenerateWeeklyReport(...args),
  fetchReportHistory: (...args) => mockFetchReportHistory(...args),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Recharts measures DOM size; in jsdom that is always 0×0, so stub it out.
jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div>,
  ComposedChart: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div>{children}</div>,
  Bar: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

import WeeklyReport from "@/pages/WeeklyReport";

const REPORT = {
  week_start: "2026-06-08",
  week_end: "2026-06-14",
  tasks_completed: 4,
  tasks_missed: 1,
  focus_minutes_total: 150,
  top_subject: "Biology",
  blocks_scheduled: 5,
  blocks_completed: 3,
  daily: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-06-${String(8 + i).padStart(2, "0")}`,
    focus_minutes: i * 10,
    tasks_completed: i % 2,
  })),
  next_week: {
    assignments_due: 2,
    top_priorities: [
      {
        id: "task-1",
        title: "History essay",
        priority: "high",
        due_date: "2026-06-16T12:00:00Z",
      },
    ],
  },
};

function defaultMocks() {
  mockFetchCurrentWeekReport.mockResolvedValue({ report: REPORT });
  mockFetchReportHistory.mockResolvedValue({ reports: [] });
  mockGenerateWeeklyReport.mockResolvedValue({ report: { id: "saved" } });
}

function renderReport() {
  return render(
    <MemoryRouter>
      <WeeklyReport />
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("WeeklyReport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    defaultMocks();
  });

  it("renders the four summary metrics", async () => {
    renderReport();

    await waitFor(() => {
      expect(screen.getByText("Tasks Completed")).toBeInTheDocument();
    });
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("Biology")).toBeInTheDocument();
    expect(screen.getByText("Missed")).toBeInTheDocument();
  });

  it("renders next week priorities", async () => {
    renderReport();

    await waitFor(() => {
      expect(screen.getByText("History essay")).toBeInTheDocument();
    });
    expect(screen.getByText(/2 assignments due next week/i)).toBeInTheDocument();
  });

  it("saves a weekly snapshot", async () => {
    renderReport();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save snapshot/i })).toBeEnabled()
    );

    await userEvent.click(screen.getByRole("button", { name: /save snapshot/i }));

    await waitFor(() => {
      expect(mockGenerateWeeklyReport).toHaveBeenCalled();
    });
  });

  it("shows the trend unlock hint with fewer than two snapshots", async () => {
    renderReport();
    await waitFor(() => {
      expect(screen.getByText(/first two saved weeks unlock/i)).toBeInTheDocument();
    });
  });

  it("surfaces load errors", async () => {
    mockFetchCurrentWeekReport.mockRejectedValue(new Error("Backend offline"));

    renderReport();
    await waitFor(() => {
      expect(screen.getByText("Backend offline")).toBeInTheDocument();
    });
  });
});
