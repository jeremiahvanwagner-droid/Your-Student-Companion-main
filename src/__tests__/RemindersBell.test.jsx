import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ────────────────────────────────────────────────────────────────

const mockFetchReminders = jest.fn();
const mockSyncReminders = jest.fn();
const mockMarkReminderRead = jest.fn();
const mockMarkAllRemindersRead = jest.fn();

jest.mock("@/lib/remindersApi", () => ({
  fetchReminders: (...args) => mockFetchReminders(...args),
  syncReminders: (...args) => mockSyncReminders(...args),
  markReminderRead: (...args) => mockMarkReminderRead(...args),
  markAllRemindersRead: (...args) => mockMarkAllRemindersRead(...args),
  deleteReminder: jest.fn().mockResolvedValue(undefined),
}));

// Radix Popover portals poorly in jsdom; render trigger + content inline
jest.mock("@/components/ui/popover", () => ({
  Popover: ({ children }) => <div>{children}</div>,
  PopoverTrigger: ({ children }) => <div>{children}</div>,
  PopoverContent: ({ children }) => <div>{children}</div>,
}));

import RemindersBell from "@/components/RemindersBell";

const REMINDERS = [
  {
    id: "rem-1",
    reminder_type: "due_soon",
    title: "Due soon: Essay",
    message: "This assignment is due within 24 hours.",
    trigger_at: new Date().toISOString(),
    is_read: false,
  },
  {
    id: "rem-2",
    reminder_type: "overdue",
    title: "Overdue: Lab report",
    message: null,
    trigger_at: new Date(Date.now() - 3600_000).toISOString(),
    is_read: true,
  },
];

function defaultMocks() {
  mockSyncReminders.mockResolvedValue({ generated: 0, candidates: 0 });
  mockFetchReminders.mockResolvedValue({ reminders: REMINDERS, count: 2, unread: 1 });
  mockMarkReminderRead.mockResolvedValue({ reminder: { ...REMINDERS[0], is_read: true } });
  mockMarkAllRemindersRead.mockResolvedValue({ ok: true });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("RemindersBell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    defaultMocks();
  });

  it("syncs then lists reminders on mount, showing the unread badge", async () => {
    render(<RemindersBell />);

    await waitFor(() => {
      expect(screen.getByTestId("unread-badge")).toHaveTextContent("1");
    });
    expect(mockSyncReminders).toHaveBeenCalled();
    expect(mockFetchReminders).toHaveBeenCalledWith({ limit: 15 });
    expect(screen.getByText("Due soon: Essay")).toBeInTheDocument();
    expect(screen.getByText("Overdue: Lab report")).toBeInTheDocument();
  });

  it("marks a reminder read on click and decrements the badge", async () => {
    render(<RemindersBell />);
    await waitFor(() => expect(screen.getByText("Due soon: Essay")).toBeInTheDocument());

    await userEvent.click(screen.getByText("Due soon: Essay"));

    await waitFor(() => {
      expect(mockMarkReminderRead).toHaveBeenCalledWith("rem-1");
    });
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });

  it("marks everything read via the header action", async () => {
    render(<RemindersBell />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /mark all read/i })).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole("button", { name: /mark all read/i }));

    await waitFor(() => {
      expect(mockMarkAllRemindersRead).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });

  it("shows the caught-up state when there are no reminders", async () => {
    mockFetchReminders.mockResolvedValue({ reminders: [], count: 0, unread: 0 });

    render(<RemindersBell />);
    await waitFor(() => {
      expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
    });
  });

  it("stays quiet when the API fails", async () => {
    mockSyncReminders.mockRejectedValue(new Error("offline"));
    mockFetchReminders.mockRejectedValue(new Error("offline"));

    render(<RemindersBell />);
    await waitFor(() => expect(mockFetchReminders).toHaveBeenCalled());

    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
  });
});
