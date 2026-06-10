import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ────────────────────────────────────────────────────────────────

const mockFetchNotes = jest.fn();
const mockCreateNote = jest.fn();
const mockUpdateNote = jest.fn();
const mockDeleteNote = jest.fn();
const mockFetchCards = jest.fn();
const mockCreateCard = jest.fn();
const mockReviewCard = jest.fn();
const mockDeleteCard = jest.fn();

jest.mock("@/lib/notesApi", () => ({
  fetchNotes: (...args) => mockFetchNotes(...args),
  createNote: (...args) => mockCreateNote(...args),
  updateNote: (...args) => mockUpdateNote(...args),
  deleteNote: (...args) => mockDeleteNote(...args),
  fetchCards: (...args) => mockFetchCards(...args),
  createCard: (...args) => mockCreateCard(...args),
  reviewCard: (...args) => mockReviewCard(...args),
  deleteCard: (...args) => mockDeleteCard(...args),
}));

const mockFetchSubjects = jest.fn();

jest.mock("@/lib/tasksApi", () => ({
  fetchSubjects: (...args) => mockFetchSubjects(...args),
  createSubject: jest.fn().mockResolvedValue({}),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Radix portals are unfriendly to jsdom; flatten Tabs + Select
jest.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }) => <div>{children}</div>,
  TabsList: ({ children }) => <div>{children}</div>,
  TabsTrigger: ({ children }) => <button type="button">{children}</button>,
  TabsContent: ({ children }) => <div>{children}</div>,
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

import NotesPad from "@/pages/NotesPad";

const NOTE = {
  id: "note-uuid-001",
  user_id: "user-001",
  title: "Photosynthesis overview",
  content: "Light reactions happen in the thylakoid.",
  tags: ["biology", "unit-2"],
  is_archived: false,
  subject_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const DUE_CARD = {
  id: "card-uuid-001",
  front_text: "What organelle runs photosynthesis?",
  back_text: "The chloroplast.",
  review_count: 1,
  next_review_at: null,
};

function defaultMocks() {
  mockFetchNotes.mockResolvedValue({ notes: [], count: 0 });
  mockFetchCards.mockResolvedValue({ cards: [], count: 0 });
  mockFetchSubjects.mockResolvedValue({ subjects: [] });
  mockCreateNote.mockResolvedValue({ note: NOTE });
  mockUpdateNote.mockResolvedValue({ note: NOTE });
  mockReviewCard.mockResolvedValue({ card: DUE_CARD });
  mockCreateCard.mockResolvedValue({ card: DUE_CARD });
}

function renderNotesPad() {
  return render(
    <MemoryRouter>
      <NotesPad />
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("NotesPad", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    defaultMocks();
  });

  it("renders fetched notes with their tags", async () => {
    mockFetchNotes.mockResolvedValue({ notes: [NOTE], count: 1 });

    renderNotesPad();

    await waitFor(() => {
      expect(screen.getByText("Photosynthesis overview")).toBeInTheDocument();
    });
    expect(screen.getAllByText("biology").length).toBeGreaterThan(0);
  });

  it("shows the empty state when there are no notes", async () => {
    renderNotesPad();
    await waitFor(() => {
      expect(screen.getByText(/no notes yet/i)).toBeInTheDocument();
    });
  });

  it("creates a note with parsed tags", async () => {
    renderNotesPad();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /new note/i })).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole("button", { name: /new note/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/title/i), "Mitosis stages");
    await userEvent.type(screen.getByLabelText(/tags/i), "Biology, Unit-3");
    await userEvent.click(screen.getByRole("button", { name: /create note/i }));

    await waitFor(() => {
      expect(mockCreateNote).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Mitosis stages",
          tags: ["biology", "unit-3"],
        })
      );
    });
  });

  it("searches notes through the API after debounce", async () => {
    renderNotesPad();
    await waitFor(() => expect(mockFetchNotes).toHaveBeenCalled());

    await userEvent.type(
      screen.getByPlaceholderText(/search notes/i),
      "photo"
    );

    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledWith(
        expect.objectContaining({ q: "photo" })
      );
    });
  });

  it("runs a review: show answer then rate good", async () => {
    mockFetchCards.mockImplementation(({ dueOnly } = {}) =>
      Promise.resolve({ cards: [DUE_CARD], count: 1 })
    );

    renderNotesPad();

    await waitFor(() => {
      expect(screen.getByText(/review 1 of 1/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /show answer/i }));
    // back_text also renders in the "All cards" list below the review panel
    expect(screen.getAllByText("The chloroplast.").length).toBeGreaterThan(1);

    await userEvent.click(screen.getByRole("button", { name: /^good$/i }));

    await waitFor(() => {
      expect(mockReviewCard).toHaveBeenCalledWith(DUE_CARD.id, "good");
    });
  });

  it("archives a note from its card action", async () => {
    mockFetchNotes.mockResolvedValue({ notes: [NOTE], count: 1 });

    renderNotesPad();
    await waitFor(() =>
      expect(screen.getByText("Photosynthesis overview")).toBeInTheDocument()
    );

    // The archive button is the icon-only ghost button between "Make card" and delete
    const noteCard = screen.getByText("Photosynthesis overview").closest(".cursor-pointer");
    const buttons = noteCard.querySelectorAll("button");
    // buttons: [Make card, archive, delete]
    await userEvent.click(buttons[1]);

    await waitFor(() => {
      expect(mockUpdateNote).toHaveBeenCalledWith(NOTE.id, { is_archived: true });
    });
  });
});
