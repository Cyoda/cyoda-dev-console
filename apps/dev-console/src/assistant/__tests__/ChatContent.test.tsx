import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ChatContent } from "../ChatContent.js";
import type { AssistantChat } from "../useAssistantChat.js";

vi.mock("../AiSetup.js", () => ({
  AiSetup: () => <div data-testid="ai-setup" />,
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

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("ChatContent", () => {
  it("renders AiSetup and the message list", () => {
    const chat = makeChat({
      messages: [
        { id: "1", role: "user", content: "Hello" },
        { id: "2", role: "assistant", content: "Hi there" },
      ],
    });
    wrap(<ChatContent chat={chat} />);
    expect(screen.getByTestId("ai-setup")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there")).toBeInTheDocument();
  });

  it("renders the hint when provided", () => {
    wrap(
      <ChatContent chat={makeChat()} hint={<span data-testid="hint">Open a file</span>} />,
    );
    expect(screen.getByTestId("hint")).toBeInTheDocument();
  });

  it("shows the applied banner with suffix when appliedSuffix is provided", () => {
    const chat = makeChat({ applied: "Applied changes to wf.json." });
    wrap(<ChatContent chat={chat} appliedSuffix="Review the graph." />);
    expect(
      screen.getByText(/Applied changes to wf\.json\. Review the graph\./),
    ).toBeInTheDocument();
  });

  it("shows the applied banner without suffix when appliedSuffix is omitted", () => {
    const chat = makeChat({ applied: "Applied changes to wf.json." });
    wrap(<ChatContent chat={chat} />);
    expect(screen.getByText("Applied changes to wf.json.")).toBeInTheDocument();
  });

  it("shows the error message when chat.error is set", () => {
    const chat = makeChat({ error: "Something went wrong." });
    wrap(<ChatContent chat={chat} />);
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
  });

  it("shows the proposal when chat.proposal is set", () => {
    const chat = makeChat({
      proposal: { current: '{"a":1}', canonical: '{"a":2}' },
    });
    wrap(<ChatContent chat={chat} applyLabel="Apply to editor" />);
    expect(screen.getByRole("button", { name: "Apply to editor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
