import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../App.js";

vi.mock("../ipc/project.js", () => ({
  selectProjectRoot: vi.fn().mockResolvedValue(null),
  scanProject: vi.fn().mockResolvedValue({ root: "/tmp", scannedAt: "", files: [] }),
}));
vi.mock("../ipc/watcher.js", () => ({
  watchProject: vi.fn().mockResolvedValue(undefined),
  onFileChanged: vi.fn().mockReturnValue(Promise.resolve(() => undefined)),
}));
vi.mock("../ipc/fsio.js", () => ({
  readTextFile: vi.fn(),
  writeTextFileWithConfirmedOverwrite: vi.fn(),
  saveFileAs: vi.fn(),
}));
vi.mock("../ipc/config.js", () => ({
  loadAppConfig: vi.fn().mockResolvedValue({ version: 1, activeProjectId: null, recentProjects: [] }),
  saveAppConfig: vi.fn().mockResolvedValue(undefined),
}));

describe("app nav", () => {
  it("does not render the old sidebar nav buttons at top level", () => {
    render(<App />);
    // Old top-level nav buttons are gone — navigation is inside the ProjectExplorer
    expect(screen.queryByRole("button", { name: "AI Assistant" })).not.toBeInTheDocument();
  });
});
