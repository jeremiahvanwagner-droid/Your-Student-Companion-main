import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock("@/lib/aiMentorApi", () => ({
  sendMentorChat: jest.fn().mockResolvedValue({ message: "AI response" }),
  persistVoiceTranscript: jest.fn().mockResolvedValue(null),
  postVoiceTranscript: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/components/Store", () => ({
  getUnlockedPacks: jest.fn().mockReturnValue(["nursing"]),
}));

// Mock the scroll area to avoid ref issues
jest.mock("@/components/ui/scroll-area", () => {
  const React = require("react");
  const ScrollArea = React.forwardRef(({ children, className }, ref) => (
    <div ref={ref} className={className} data-testid="scroll-area">
      {children}
    </div>
  ));
  ScrollArea.displayName = "ScrollArea";
  return { ScrollArea };
});

// ── useElevenLabs mock factory ────────────────────────────────────────────

const mockStartSession = jest.fn();
const mockEndSession = jest.fn();
const mockToggleMic = jest.fn();
const mockClearError = jest.fn();

const DEFAULT_HOOK_STATE = {
  startSession: mockStartSession,
  endSession: mockEndSession,
  toggleSession: jest.fn(),
  isSessionActive: false,
  status: "disconnected",
  connectionStatus: "disconnected",
  isSpeaking: false,
  messages: [],
  sendTextMessage: jest.fn(),
  sendUserActivity: jest.fn(),
  setVolume: jest.fn(),
  micMuted: false,
  toggleMic: mockToggleMic,
  conversationId: null,
  errorState: null,
  errorMessage: null,
  error: null,
  clearError: mockClearError,
  isConfigured: true,
  agentId: "test-agent-id",
  canSendFeedback: false,
  sendFeedback: jest.fn(),
};

let mockHookState = { ...DEFAULT_HOOK_STATE };

jest.mock("@/hooks/useElevenLabs", () => ({
  useElevenLabs: () => mockHookState,
}));

import TheMentor from "@/components/TheMentor";

function renderMentor(props = {}) {
  return render(
    <MemoryRouter>
      <TheMentor unlockedPacks={["nursing"]} {...props} />
    </MemoryRouter>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockHookState = { ...DEFAULT_HOOK_STATE };
  mockStartSession.mockResolvedValue("conv-123");
  mockEndSession.mockResolvedValue(undefined);
});

describe("TheMentor", () => {
  it("renders the mentor header and chat input", () => {
    renderMentor();
    expect(screen.getByText("The Mentor")).toBeInTheDocument();
    expect(screen.getByTestId("mentor-input")).toBeInTheDocument();
    expect(screen.getByTestId("mentor-send-button")).toBeInTheDocument();
  });

  it("shows mic permission denied banner with 'Open settings' link", () => {
    mockHookState = {
      ...DEFAULT_HOOK_STATE,
      errorState: "mic_permission_denied",
      errorMessage: "Microphone access was denied.",
    };
    renderMentor();
    expect(screen.getByTestId("error-banner-mic")).toBeInTheDocument();
    expect(screen.getByText(/Open settings/i)).toBeInTheDocument();
  });

  it("shows quota exceeded banner with 'Upgrade plan' button", () => {
    mockHookState = {
      ...DEFAULT_HOOK_STATE,
      errorState: "quota_exceeded",
      errorMessage: "Voice quota exceeded.",
    };
    renderMentor();
    expect(screen.getByTestId("error-banner-quota")).toBeInTheDocument();
    expect(screen.getByText(/Upgrade plan/i)).toBeInTheDocument();
  });

  it("shows retry banner for network_error and retry button calls startSession", async () => {
    mockHookState = {
      ...DEFAULT_HOOK_STATE,
      errorState: "network_error",
      errorMessage: "Voice connection lost.",
    };
    renderMentor();
    const retryBtn = screen.getByTestId("error-retry-btn");
    expect(retryBtn).toBeInTheDocument();

    await userEvent.click(retryBtn);
    expect(mockClearError).toHaveBeenCalled();
    expect(mockStartSession).toHaveBeenCalled();
  });

  it("shows retry banner for agent_timeout", () => {
    mockHookState = {
      ...DEFAULT_HOOK_STATE,
      errorState: "agent_timeout",
      errorMessage: "Voice session timed out.",
    };
    renderMentor();
    const banner = screen.getByTestId("error-banner-retry");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Voice session timed out/i);
  });

  it("shows mute toggle only when session is active", () => {
    // Not active — no mute button
    renderMentor();
    expect(screen.queryByTestId("mic-mute-toggle")).not.toBeInTheDocument();

    // Active — mute button appears
    mockHookState = { ...DEFAULT_HOOK_STATE, isSessionActive: true };
    const { rerender } = render(
      <MemoryRouter>
        <TheMentor unlockedPacks={["nursing"]} />
      </MemoryRouter>
    );
    mockHookState = { ...DEFAULT_HOOK_STATE, isSessionActive: true };
    rerender(
      <MemoryRouter>
        <TheMentor unlockedPacks={["nursing"]} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("mic-mute-toggle")).toBeInTheDocument();
  });

  it("mute toggle calls toggleMic", async () => {
    mockHookState = { ...DEFAULT_HOOK_STATE, isSessionActive: true };
    renderMentor();
    const muteBtn = screen.getByTestId("mic-mute-toggle");
    await userEvent.click(muteBtn);
    expect(mockToggleMic).toHaveBeenCalled();
  });

  it("forwards is_minor=true to the chat API for a minor student", async () => {
    const { sendMentorChat } = require("@/lib/aiMentorApi");
    renderMentor({ isMinor: true });
    await userEvent.type(screen.getByTestId("mentor-input"), "help me study");
    await userEvent.click(screen.getByTestId("mentor-send-button"));
    await waitFor(() => expect(sendMentorChat).toHaveBeenCalled());
    expect(sendMentorChat.mock.calls[0][0]).toMatchObject({ is_minor: true });
  });

  it("defaults is_minor to false when the prop is omitted", async () => {
    const { sendMentorChat } = require("@/lib/aiMentorApi");
    renderMentor();
    await userEvent.type(screen.getByTestId("mentor-input"), "hello");
    await userEvent.click(screen.getByTestId("mentor-send-button"));
    await waitFor(() => expect(sendMentorChat).toHaveBeenCalled());
    expect(sendMentorChat.mock.calls[0][0]).toMatchObject({ is_minor: false });
  });
});
