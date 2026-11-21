import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ProfilesTab } from "../ProfilesTab.js";
import { readCyodaProfileConfig } from "../../ipc/agent.js";

vi.mock("../../ipc/agent.js", () => ({
  readCyodaProfileConfig: vi.fn(),
}));

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ProfilesTab />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("ProfilesTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the empty state when no config exists", async () => {
    vi.mocked(readCyodaProfileConfig).mockResolvedValue(null);
    renderTab();
    expect(await screen.findByText("No Cyoda profiles found")).toBeInTheDocument();
  });

  it("renders a row per profile with env and token status", async () => {
    vi.mocked(readCyodaProfileConfig).mockResolvedValue({
      active: "default",
      profiles: {
        default: { endpoint: "http://localhost:8080", env: "development", token: "" },
        prod: { endpoint: "https://x.cyoda.net", env: "production", token: "a.b.c" },
      },
    });
    renderTab();
    await waitFor(() => expect(screen.getByText("default")).toBeInTheDocument());
    expect(screen.getByText("prod")).toBeInTheDocument();
    expect(screen.getByText("development")).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
    // empty token => missing
    expect(screen.getByText("missing")).toBeInTheDocument();
  });
});
