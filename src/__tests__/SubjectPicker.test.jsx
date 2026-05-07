import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Stub Radix Popover so portal doesn't break jsdom
jest.mock("@/components/ui/popover", () => {
  const React = require("react");
  const PopoverContext = React.createContext({});
  const Popover = ({ open, onOpenChange, children }) => (
    <PopoverContext.Provider value={{ open, onOpenChange }}>
      {children}
    </PopoverContext.Provider>
  );
  const PopoverTrigger = React.forwardRef(({ asChild, children, ...props }, ref) => {
    const ctx = React.useContext(PopoverContext);
    if (asChild) {
      return React.cloneElement(React.Children.only(children), {
        ...props,
        ref,
        onClick: (...args) => {
          ctx.onOpenChange?.(!ctx.open);
          children.props.onClick?.(...args);
        },
      });
    }
    return (
      <button ref={ref} {...props} onClick={() => ctx.onOpenChange?.(!ctx.open)}>
        {children}
      </button>
    );
  });
  const PopoverContent = ({ children }) => {
    const ctx = React.useContext(PopoverContext);
    return ctx.open ? <div data-testid="popover-content">{children}</div> : null;
  };
  return { Popover, PopoverTrigger, PopoverContent };
});

// Stub Radix Select
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
  const SelectTrigger = ({ children, ...props }) => (
    <button type="button" {...props}>
      {children}
    </button>
  );
  const SelectValue = ({ placeholder }) => <span>{placeholder}</span>;
  const SelectContent = ({ children, onValueChange }) => (
    <div>
      {React.Children.map(children, (child) => {
        if (!child) return null;
        return React.cloneElement(child, { onValueChange });
      })}
    </div>
  );
  const SelectItem = ({ value, children, onValueChange }) => (
    <button
      type="button"
      onClick={() => onValueChange?.(value)}
      data-value={value}
    >
      {children}
    </button>
  );
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

import { SubjectPicker } from "@/components/SubjectPicker";

const SUBJECTS = [
  { id: "sub-1", name: "Biology", color: "#10b981", archived: false },
  { id: "sub-2", name: "Math", color: "#3b82f6", archived: false },
  { id: "sub-3", name: "History", color: "#8b5cf6", archived: true },
];

describe("SubjectPicker", () => {
  it("renders subject options in the select (non-archived only)", () => {
    render(
      <SubjectPicker
        value={null}
        onChange={jest.fn()}
        subjects={SUBJECTS}
        onCreate={jest.fn()}
      />
    );

    expect(screen.getByText("Biology")).toBeInTheDocument();
    expect(screen.getByText("Math")).toBeInTheDocument();
    // Archived subject should not appear
    expect(screen.queryByText("History")).not.toBeInTheDocument();
  });

  it("calls onChange with subject id when an option is selected", async () => {
    const handleChange = jest.fn();
    render(
      <SubjectPicker
        value={null}
        onChange={handleChange}
        subjects={SUBJECTS}
        onCreate={jest.fn()}
      />
    );

    await userEvent.click(screen.getByText("Biology"));
    expect(handleChange).toHaveBeenCalledWith("sub-1");
  });

  it("opens creation popover when '+' button is clicked", async () => {
    render(
      <SubjectPicker
        value={null}
        onChange={jest.fn()}
        subjects={SUBJECTS}
        onCreate={jest.fn()}
      />
    );

    await userEvent.click(screen.getByTestId("subject-create-trigger"));
    expect(screen.getByTestId("popover-content")).toBeInTheDocument();
    expect(screen.getByTestId("subject-name-input")).toBeInTheDocument();
  });

  it("calls onCreate with name and color when form is submitted", async () => {
    const handleCreate = jest.fn().mockResolvedValue(undefined);
    render(
      <SubjectPicker
        value={null}
        onChange={jest.fn()}
        subjects={SUBJECTS}
        onCreate={handleCreate}
      />
    );

    // Open the popover
    await userEvent.click(screen.getByTestId("subject-create-trigger"));
    // Type a subject name
    await userEvent.type(screen.getByTestId("subject-name-input"), "Chemistry");
    // Pick a color
    await userEvent.click(screen.getByTestId("color-swatch-red"));
    // Submit
    await userEvent.click(screen.getByTestId("subject-create-submit"));

    await waitFor(() => {
      expect(handleCreate).toHaveBeenCalledWith("Chemistry", "#ef4444");
    });
  });

  it("does not call onCreate if name is empty", async () => {
    const handleCreate = jest.fn();
    render(
      <SubjectPicker
        value={null}
        onChange={jest.fn()}
        subjects={SUBJECTS}
        onCreate={handleCreate}
      />
    );

    await userEvent.click(screen.getByTestId("subject-create-trigger"));
    // Submit button should be disabled
    const submitBtn = screen.getByTestId("subject-create-submit");
    expect(submitBtn).toBeDisabled();
    expect(handleCreate).not.toHaveBeenCalled();
  });
});
