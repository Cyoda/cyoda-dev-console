/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";

// Both `WorkflowPane` and `EntityPane` import `MonacoJsonViewer`, which calls
// `getMonacoRuntime()` at MODULE SCOPE — mock it the same way the other shell tests do
// (App.test.tsx, AppShell.test.tsx) so real monaco-editor never loads under happy-dom.
vi.mock("../monacoRuntime.js", () => ({ getMonacoRuntime: vi.fn() }));

// `WorkflowPane` defaults to its "graph" tab, which mounts `EditorView` — pulling in the
// real `@cyoda/workflow-editor-host` -> `@cyoda/workflow-react` `WorkflowEditor` -> reactflow,
// which cannot render/lay out under happy-dom (see EditorView.test.tsx's own note on this).
// Stubbed here for the same reason App.test.tsx/AppShell.test.tsx stub it — this test only
// cares about the chip rendering in the pane's header row, not the graph canvas itself.
vi.mock("../EditorView.js", () => ({ EditorView: () => <div data-testid="graph-pane" /> }));

const CHIP_TEXT = /Claude owns content/i;

describe("ReadOnlyChip — quiet read-only indicator (spec: \"a quiet chip, not a banner\")", () => {
  it("renders in WorkflowPane's header, not as an alert/banner", async () => {
    const { WorkflowPane } = await import("../WorkflowPane.js");
    render(
      <ThemeProvider>
        <WorkflowPane
          token="tok" origin="origin-a" workflow="Pledge" content="{}" layout={{}}
          layoutRev={0} contentRev={0} externalContent={null}
          onDismissExternal={() => {}} onDirtyChange={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText(CHIP_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders in EntityPane's header, not as an alert/banner", async () => {
    const { EntityPane } = await import("../EntityPane.js");
    render(
      <ThemeProvider>
        <EntityPane contents={JSON.stringify({ a: 1 })} />
      </ThemeProvider>,
    );
    expect(screen.getByText(CHIP_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
