import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "@cyoda/console-design-system";
import { BundleTab } from "../BundleTab.js";
import { AgentContextProvider } from "../AgentContext.js";
import { useProjectStore } from "../../state/projectStore.js";
import type { DevProject } from "@cyoda/workflow-project-model";

vi.mock("../../ipc/agent.js", () => ({
  readCyodaProfileConfig: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));
vi.mock("../../ipc/fsio.js", () => ({
  readTextFile: vi.fn(),
}));
vi.mock("../../ipc/shell.js", () => ({
  revealInFinder: vi.fn().mockResolvedValue(undefined),
  openInIde: vi.fn().mockResolvedValue(undefined),
}));

import { readCyodaProfileConfig, writeProjectTextFile } from "../../ipc/agent.js";

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
          <BundleTab />
        </AgentContextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("BundleTab", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", makeStorage());
    vi.clearAllMocks();
    vi.mocked(readCyodaProfileConfig).mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows 'Open a project' guard when no project is active", () => {
    renderTab(false);
    expect(screen.getByText(/open a project/i)).toBeInTheDocument();
  });

  it("renders the Task bundle panel with controls", async () => {
    renderTab();
    expect(await screen.findByText("Task bundle")).toBeInTheDocument();
    expect(screen.getByText("Agent target")).toBeInTheDocument();
    expect(screen.getByText("Cyoda profile")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /write bundle/i })).toBeInTheDocument();
  });

  it("workflow and entity checkboxes are disabled when nothing is selected", async () => {
    renderTab();
    await screen.findByText("Task bundle");
    const checkboxes = screen.getAllByRole("checkbox");
    // Both disabled because no workflow/entity is selected in context
    checkboxes.forEach((cb) => expect(cb).toBeDisabled());
  });

  it("writes bundle files and shows success panel", async () => {
    vi.mocked(writeProjectTextFile).mockResolvedValue({
      path: "/proj/cyoda-agent-task/CLAUDE.md",
      lastModified: "2026-01-01T00:00:00Z",
      sizeBytes: 100,
    });

    renderTab();
    const writeBtn = await screen.findByRole("button", { name: /write bundle/i });
    fireEvent.click(writeBtn);

    await waitFor(() =>
      expect(screen.getByText("Bundle written")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Reveal in Finder" })).toBeInTheDocument();
    expect(vi.mocked(writeProjectTextFile).mock.calls.length).toBeGreaterThan(0);
  });

  it("shows error message when bundle write fails", async () => {
    vi.mocked(writeProjectTextFile).mockRejectedValue(new Error("disk full"));

    renderTab();
    const writeBtn = await screen.findByRole("button", { name: /write bundle/i });
    fireEvent.click(writeBtn);

    await waitFor(() =>
      expect(screen.getByText(/Failed: disk full/)).toBeInTheDocument(),
    );
  });

  it("brief textarea is present and accepts input", async () => {
    renderTab();
    const textarea = await screen.findByPlaceholderText(/describe what you want/i);
    expect(textarea).toBeInTheDocument();
    fireEvent.change(textarea, { target: { value: "add a refund state" } });
    expect(textarea).toHaveValue("add a refund state");
  });
});
