import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { WorkflowAssistantPanel } from "../WorkflowAssistantPanel.js";
import type { AssistantChat } from "../useAssistantChat.js";

// Mock ChatContent so we don't re-test its internals here.
vi.mock("../ChatContent.js", () => ({
  ChatContent: () => <div data-testid="chat-content" />,
}));

function makeChat(overrides: Partial<AssistantChat> = {}): AssistantChat {
  return {
    messages: [],
    input: "",
    setInput: vi.fn(),
    sending: false,
    error: null,
    proposal: null,
    applying: false,
    applied: null,
    hasKey: true,
    canSend: false,
    send: vi.fn(),
    applyProposal: vi.fn(),
    discardProposal: vi.fn(),
    ...overrides,
  };
}

function renderPanel(props: Partial<Parameters<typeof WorkflowAssistantPanel>[0]> = {}) {
  const defaults = {
    chat: makeChat(),
    displayName: "order.json",
    relativePath: "workflows/order.json",
    parseOk: true,
    dirty: false,
    onClose: vi.fn(),
  };
  return render(
    <ThemeProvider>
      <WorkflowAssistantPanel {...defaults} {...props} />
    </ThemeProvider>,
  );
}

describe("WorkflowAssistantPanel", () => {
  it("shows the display name in the header", () => {
    renderPanel({ displayName: "my-workflow.json" });
    expect(screen.getByText("my-workflow.json")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "Close assistant" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the relative path in the context block", () => {
    renderPanel({ relativePath: "workflows/order.json" });
    expect(screen.getByText("workflows/order.json")).toBeInTheDocument();
  });

  it("shows 'Valid workflow' when parseOk is true", () => {
    renderPanel({ parseOk: true });
    expect(screen.getByText("Valid workflow")).toBeInTheDocument();
  });

  it("shows 'No valid workflow open' when parseOk is false", () => {
    renderPanel({ parseOk: false });
    expect(screen.getByText("No valid workflow open")).toBeInTheDocument();
  });

  it("shows '· unsaved changes' when parseOk and dirty are both true", () => {
    renderPanel({ parseOk: true, dirty: true });
    expect(screen.getByText(/unsaved changes/)).toBeInTheDocument();
  });

  it("does not show unsaved changes when dirty is false", () => {
    renderPanel({ parseOk: true, dirty: false });
    expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument();
  });

  it("renders ChatContent", () => {
    renderPanel();
    expect(screen.getByTestId("chat-content")).toBeInTheDocument();
  });

  it("renders the composer textarea", () => {
    renderPanel({ chat: makeChat({ hasKey: true }) });
    expect(
      screen.getByPlaceholderText(/ask about or change this workflow/i),
    ).toBeInTheDocument();
  });

  it("shows 'Add an API key' placeholder when hasKey is false", () => {
    renderPanel({ chat: makeChat({ hasKey: false }) });
    expect(screen.getByPlaceholderText(/add an api key/i)).toBeInTheDocument();
  });
});
