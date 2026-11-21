import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@cyoda/console-design-system";
import { queryClient } from "../state/queryClient.js";

vi.mock("../ipc/fsio.js", () => ({
  // Reject layout file reads — WorkflowRoute .catch(() => {}) handles this gracefully.
  readTextFile: vi.fn().mockRejectedValue(new Error("not found")),
  writeTextFileWithConfirmedOverwrite: vi.fn(),
  saveFileAs: vi.fn(),
}));
vi.mock("../ipc/watcher.js", () => ({
  onFileChanged: vi.fn().mockReturnValue(Promise.resolve(() => undefined)),
}));
vi.mock("../state/projectStore.js", () => ({
  useProjectStore: vi.fn().mockReturnValue("proj-1"),
}));
vi.mock("../monacoRuntime.js", () => ({ getMonacoRuntime: vi.fn().mockReturnValue(null) }));

const FIXTURE = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    { version: "1.3", name: "demo", initialState: "S", active: true, states: { S: { transitions: [] } } },
  ],
});

async function renderRoute() {
  const { WorkflowRoute } = await import("../routes/workflow.js");
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <WorkflowRoute
          filePath="/tmp/w.json"
          relativePath="workflows/w.json"
          displayName="demo"
          initialContents={FIXTURE}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("WorkflowRoute AI drawer", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it("hides the AI affordance when the agent flag is off", async () => {
    vi.stubEnv("VITE_FEATURE_FLAG_AGENT", "false");
    await renderRoute();
    expect(screen.queryByRole("button", { name: "AI" })).not.toBeInTheDocument();
  });

  it("toggles the assistant drawer scoped to the open file when the flag is on", async () => {
    vi.stubEnv("VITE_FEATURE_FLAG_AGENT", "true");
    await renderRoute();

    // Closed: only the file breadcrumb references the path; no drawer header yet.
    expect(screen.queryByText(/AI Assistant ·/)).not.toBeInTheDocument();
    expect(screen.getAllByText("workflows/w.json")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    // Open: drawer header is scoped to the file, which now also appears in the drawer context.
    expect(screen.getByText(/AI Assistant ·/)).toBeInTheDocument();
    expect(screen.getAllByText("workflows/w.json")).toHaveLength(2);
  });
});
