import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ChatBubble, ChatComposer } from "../chatUi.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

// ─── ChatBubble ──────────────────────────────────────────────────────────────

describe("ChatBubble", () => {
  it("renders the message content", () => {
    wrap(<ChatBubble role="user" content="Hello!" />);
    expect(screen.getByText("Hello!")).toBeInTheDocument();
  });

  it("aligns user messages to flex-end (right)", () => {
    wrap(<ChatBubble role="user" content="Hi" />);
    const bubble = screen.getByText("Hi");
    expect(bubble).toHaveStyle({ alignSelf: "flex-end" });
  });

  it("aligns assistant messages to flex-start (left)", () => {
    wrap(<ChatBubble role="assistant" content="Hello there" />);
    const bubble = screen.getByText("Hello there");
    expect(bubble).toHaveStyle({ alignSelf: "flex-start" });
  });
});

// ─── ChatComposer ─────────────────────────────────────────────────────────────

describe("ChatComposer", () => {
  const baseProps = {
    value: "",
    onChange: vi.fn(),
    onSend: vi.fn(),
    sending: false,
    canSend: true,
    placeholder: "Ask something…",
  };

  it("renders the textarea with the given placeholder", () => {
    wrap(<ChatComposer {...baseProps} />);
    expect(screen.getByPlaceholderText("Ask something…")).toBeInTheDocument();
  });

  it("calls onChange when the textarea value changes", () => {
    const onChange = vi.fn();
    wrap(<ChatComposer {...baseProps} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("Ask something…"), {
      target: { value: "hello" },
    });
    expect(onChange).toHaveBeenCalledWith("hello");
  });

  it("calls onSend when the Send button is clicked", () => {
    const onSend = vi.fn();
    wrap(<ChatComposer {...baseProps} onSend={onSend} />);
    fireEvent.click(screen.getByTitle("Send (⌘Enter)"));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("Send button is disabled when canSend is false", () => {
    wrap(<ChatComposer {...baseProps} canSend={false} />);
    expect(screen.getByTitle("Send (⌘Enter)")).toBeDisabled();
  });

  it("calls onSend on ⌘Enter when canSend is true", () => {
    const onSend = vi.fn();
    wrap(<ChatComposer {...baseProps} onSend={onSend} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Ask something…"), {
      key: "Enter",
      metaKey: true,
    });
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("calls onSend on Ctrl+Enter when canSend is true", () => {
    const onSend = vi.fn();
    wrap(<ChatComposer {...baseProps} onSend={onSend} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Ask something…"), {
      key: "Enter",
      ctrlKey: true,
    });
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("does NOT call onSend on ⌘Enter when canSend is false", () => {
    const onSend = vi.fn();
    wrap(<ChatComposer {...baseProps} onSend={onSend} canSend={false} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Ask something…"), {
      key: "Enter",
      metaKey: true,
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows a spinner instead of the send icon while sending", () => {
    wrap(<ChatComposer {...baseProps} sending={true} />);
    const button = screen.getByTitle("Sending…");
    expect(button.querySelector("svg.lucide-loader-circle")).toBeInTheDocument();
  });
});
