import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { AiSetup } from "../AiSetup.js";
import { useAssistantConfig } from "../keyStore.js";

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

function renderSetup() {
  return render(
    <ThemeProvider>
      <AiSetup />
    </ThemeProvider>,
  );
}

describe("AiSetup", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
    useAssistantConfig.setState({ provider: "anthropic", model: "claude-sonnet-4-6", keys: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the API key field with no project or workflow context", () => {
    renderSetup();
    expect(screen.getByText("Set up AI")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/paste key/i)).toBeInTheDocument();
  });

  it("stays expanded while typing the key (does not collapse mid-entry)", () => {
    renderSetup();
    fireEvent.change(screen.getByPlaceholderText(/paste key/i), { target: { value: "sk-ant-123" } });
    expect(screen.getByPlaceholderText(/paste key/i)).toBeInTheDocument();
    expect(useAssistantConfig.getState().keys.anthropic).toBe("sk-ant-123");
  });

  it("collapses to a summary when a key already exists; Change re-expands", () => {
    useAssistantConfig.setState({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      keys: { anthropic: "sk-existing" },
    });
    renderSetup();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/paste key/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByPlaceholderText(/paste key/i)).toBeInTheDocument();
  });
});
