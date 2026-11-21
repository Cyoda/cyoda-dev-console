import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { AgentContextProvider } from "../agent/AgentContext.js";
import { useProjectStore } from "../state/projectStore.js";
import type { DevProject } from "@cyoda/workflow-project-model";

// Mock all child tabs so AgentPanel tests stay focused on layout/navigation.
vi.mock("../agent/AssistantTab.js", () => ({ AssistantTab: () => <div data-testid="assistant-tab" /> }));
vi.mock("../agent/ConnectTab.js", () => ({ ConnectTab: () => <div data-testid="connect-tab" /> }));
vi.mock("../agent/BundleTab.js", () => ({ BundleTab: () => <div data-testid="bundle-tab" /> }));
vi.mock("../agent/ProfilesTab.js", () => ({ ProfilesTab: () => <div data-testid="profiles-tab" /> }));

const project: DevProject = {
  id: "p1", name: "proj", rootPath: "/proj",
  workflowGlobs: ["**/*.json"], entityGlobs: ["**/*.json"],
  workflowRoot: null, entityRoot: null,
  createdAt: "2026-01-01T00:00:00Z", lastOpenedAt: "2026-01-01T00:00:00Z",
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

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useProjectStore.setState({ active: project, config: null });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <AgentContextProvider>
          {ui}
        </AgentContextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

// AgentRoute depends on VITE_FEATURE_FLAG_AGENT at module load time —
// use dynamic import with resetModules so the env stub is picked up.
describe("AgentRoute — feature flag", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", makeStorage());
    vi.resetModules();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("shows 404 when the feature flag is off", async () => {
    vi.stubEnv("VITE_FEATURE_FLAG_AGENT", "false");
    const { AgentRoute } = await import("../routes/agent.js");
    render(<ThemeProvider><AgentRoute /></ThemeProvider>);
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders the panel when the feature flag is on", async () => {
    vi.stubEnv("VITE_FEATURE_FLAG_AGENT", "true");
    const { AgentRoute } = await import("../routes/agent.js");
    wrap(<AgentRoute />);
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
  });
});

// AgentPanel is exported flag-independently — import it statically.
import { AgentPanel } from "../routes/agent.js";

describe("AgentPanel", () => {
  beforeEach(() => vi.stubGlobal("sessionStorage", makeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("renders the AI Assistant heading and AssistantTab", () => {
    wrap(<AgentPanel />);
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-tab")).toBeInTheDocument();
  });

  it("Advanced section is collapsed by default", () => {
    wrap(<AgentPanel />);
    expect(screen.queryByTestId("connect-tab")).not.toBeInTheDocument();
  });

  it("clicking Advanced expands the section and shows Connect tab", () => {
    wrap(<AgentPanel />);
    fireEvent.click(screen.getByText(/Advanced: external agents/));
    expect(screen.getByTestId("connect-tab")).toBeInTheDocument();
  });

  it("switching to Bundle tab shows BundleTab", () => {
    wrap(<AgentPanel />);
    fireEvent.click(screen.getByText(/Advanced: external agents/));
    fireEvent.click(screen.getByRole("tab", { name: "Bundle" }));
    expect(screen.getByTestId("bundle-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("connect-tab")).not.toBeInTheDocument();
  });

  it("switching to Profiles tab shows ProfilesTab", () => {
    wrap(<AgentPanel />);
    fireEvent.click(screen.getByText(/Advanced: external agents/));
    fireEvent.click(screen.getByRole("tab", { name: "Profiles" }));
    expect(screen.getByTestId("profiles-tab")).toBeInTheDocument();
  });
});
