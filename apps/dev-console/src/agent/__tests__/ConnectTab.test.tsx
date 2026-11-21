import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ConnectTab } from "../ConnectTab.js";
import { AgentContextProvider } from "../AgentContext.js";
import { useProjectStore } from "../../state/projectStore.js";
import type { DevProject } from "@cyoda/workflow-project-model";

vi.mock("../../ipc/agent.js", () => ({
  detectAgents: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));
vi.mock("../../ipc/fsio.js", () => ({
  readTextFile: vi.fn(),
}));

import { detectAgents, writeProjectTextFile } from "../../ipc/agent.js";
import { readTextFile } from "../../ipc/fsio.js";

const project: DevProject = {
  id: "test-id",
  name: "my-project",
  rootPath: "/proj",
  workflowGlobs: ["**/*.json"],
  entityGlobs: ["**/*.json"],
  workflowRoot: null,
  entityRoot: null,
  createdAt: "2026-01-01T00:00:00Z",
  lastOpenedAt: "2026-01-01T00:00:00Z",
};

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

function renderTab(withProject = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (withProject) useProjectStore.setState({ active: project, config: null });
  else useProjectStore.setState({ active: null, config: null });

  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <AgentContextProvider>
          <ConnectTab />
        </AgentContextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("ConnectTab", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", makeStorage());
    vi.clearAllMocks();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows 'Open a project' guard when no project is active", () => {
    renderTab(false);
    expect(screen.getByText(/open a project/i)).toBeInTheDocument();
  });

  it("renders a card for each of the three agents", async () => {
    vi.mocked(detectAgents).mockResolvedValue([
      { id: "claude", installed: false },
      { id: "gemini", installed: false },
      { id: "codex", installed: false },
    ]);
    renderTab();
    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Gemini CLI")).toBeInTheDocument();
    expect(screen.getByText("Codex CLI / app")).toBeInTheDocument();
  });

  it("shows detected version when agent is installed", async () => {
    vi.mocked(detectAgents).mockResolvedValue([
      { id: "claude", installed: true, version: "2.1.163 (Claude Code)" },
      { id: "gemini", installed: false },
      { id: "codex", installed: false },
    ]);
    renderTab();
    expect(await screen.findByText(/Detected — 2\.1\.163/)).toBeInTheDocument();
  });

  it("shows 'Not detected on PATH' when agent is missing", async () => {
    vi.mocked(detectAgents).mockResolvedValue([
      { id: "claude", installed: false },
      { id: "gemini", installed: false },
      { id: "codex", installed: false },
    ]);
    renderTab();
    await waitFor(() => {
      const items = screen.getAllByText("Not detected on PATH");
      expect(items.length).toBe(3);
    });
  });

  it("writes the rule file and shows success status", async () => {
    vi.mocked(detectAgents).mockResolvedValue([{ id: "claude", installed: true }]);
    vi.mocked(readTextFile).mockRejectedValue(new Error("not found")); // file doesn't exist
    vi.mocked(writeProjectTextFile).mockResolvedValue({
      path: "/proj/CLAUDE.md",
      lastModified: "2026-01-01T00:00:00Z",
      sizeBytes: 100,
    });

    renderTab();
    const writeBtn = await screen.findByRole("button", { name: /write claude\.md/i });
    fireEvent.click(writeBtn);

    await waitFor(() =>
      expect(screen.getByText(/Wrote CLAUDE\.md to project root/)).toBeInTheDocument(),
    );
    expect(vi.mocked(writeProjectTextFile)).toHaveBeenCalledOnce();
  });

  it("shows overwrite confirmation when rule file already exists", async () => {
    vi.mocked(detectAgents).mockResolvedValue([{ id: "claude", installed: true }]);
    vi.mocked(readTextFile).mockResolvedValue({
      contents: "# existing",
      lastModified: "",
      path: "/proj/CLAUDE.md",
      sizeBytes: 10,
    });

    renderTab();
    const writeBtn = await screen.findByRole("button", { name: /write claude\.md/i });
    fireEvent.click(writeBtn);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /overwrite claude\.md/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows error status when write fails", async () => {
    vi.mocked(detectAgents).mockResolvedValue([{ id: "claude", installed: true }]);
    vi.mocked(readTextFile).mockRejectedValue(new Error("not found"));
    vi.mocked(writeProjectTextFile).mockRejectedValue(new Error("permission denied"));

    renderTab();
    const writeBtn = await screen.findByRole("button", { name: /write claude\.md/i });
    fireEvent.click(writeBtn);

    await waitFor(() =>
      expect(screen.getByText(/Failed: permission denied/)).toBeInTheDocument(),
    );
  });
});
