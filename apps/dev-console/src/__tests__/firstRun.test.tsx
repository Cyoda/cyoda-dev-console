import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FirstRun } from "../routes/first-run.js";

// Tauri IPC is not available in test env — mock the IPC module.
vi.mock("../ipc/project.js", () => ({
  selectProjectRoot: vi.fn().mockResolvedValue(null),
}));

// Zustand works fine in test env without a provider.
describe("FirstRun", () => {
  it("renders the title", () => {
    render(<FirstRun onProjectReady={() => undefined} />);
    expect(screen.getByText("Choose your Cyoda project")).toBeInTheDocument();
  });

  it("renders the Select folder button", () => {
    render(<FirstRun onProjectReady={() => undefined} />);
    expect(
      screen.getByRole("button", { name: /select folder/i }),
    ).toBeInTheDocument();
  });
});
