import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { DevProject } from "@cyoda/workflow-project-model";
import { ThemeProvider } from "@cyoda/console-design-system";
import { AssistantTab } from "../AssistantTab.js";
import { AgentContextProvider } from "../AgentContext.js";
import { useProjectStore } from "../../state/projectStore.js";
import { useAssistantConfig } from "../../assistant/keyStore.js";
import { useAssistantChat } from "../../assistant/useAssistantChat.js";

vi.mock("../../assistant/useAssistantChat.js", () => ({
  useAssistantChat: vi.fn(),
}));

const defaultChat = {
  messages: [], input: "", setInput: vi.fn(), sending: false,
  error: null, proposal: null, applying: false, applied: null,
  hasKey: false, canSend: false, send: vi.fn(), applyProposal: vi.fn(),
  discardProposal: vi.fn(),
};

beforeEach(() => {
  vi.mocked(useAssistantChat).mockReturnValue(defaultChat);
});

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

const project: DevProject = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "proj",
  rootPath: "/proj",
  workflowGlobs: ["**/*.json"],
  entityGlobs: ["**/*.json"],
  workflowRoot: null,
  entityRoot: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: "2026-01-01T00:00:00.000Z",
};

describe("AssistantTab with no workflow selected", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", makeStorage());
    useAssistantConfig.setState({ provider: "anthropic", model: "claude-sonnet-4-6", keys: {} });
    useProjectStore.setState({ active: project, config: null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders the setup panel + chat even without a selected workflow", () => {
    render(
      <ThemeProvider>
        <AgentContextProvider>
          <AssistantTab />
        </AgentContextProvider>
      </ThemeProvider>,
    );
    // Key setup is reachable (the original bug: it was gated behind selecting a workflow).
    expect(screen.getByPlaceholderText(/paste key/i)).toBeInTheDocument();
    // The no-workflow hint, not a hard "No workflow selected" block.
    expect(screen.getByText(/propose & apply edits/i)).toBeInTheDocument();
    expect(screen.queryByText("No workflow selected")).not.toBeInTheDocument();
  });
});

describe("AssistantTab — stale-proposal guard", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", makeStorage());
    useAssistantConfig.setState({ provider: "anthropic", model: "claude-sonnet-4-6", keys: {} });
    useProjectStore.setState({ active: project, config: null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("calls discardProposal when workflowPath changes", () => {
    const discardProposal = vi.fn();
    vi.mocked(useAssistantChat).mockReturnValue({ ...defaultChat, discardProposal });

    const { rerender } = render(
      <ThemeProvider>
        <AgentContextProvider selectedWorkflowPath="/proj/wf-a.json">
          <AssistantTab />
        </AgentContextProvider>
      </ThemeProvider>,
    );

    expect(discardProposal).not.toHaveBeenCalled();

    rerender(
      <ThemeProvider>
        <AgentContextProvider selectedWorkflowPath="/proj/wf-b.json">
          <AssistantTab />
        </AgentContextProvider>
      </ThemeProvider>,
    );

    expect(discardProposal).toHaveBeenCalledTimes(1);
  });
});
