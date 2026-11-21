import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import { WorkflowEditor } from "@cyoda/workflow-react";
import { WorkflowEditorHostPanel } from "../WorkflowEditorHostPanel.js";
import type { EditorSession } from "../useEditorSession.js";

// The editor (and its reactflow CSS) is never rendered on the parse-failure
// path under test; stub it so the heavy dependency doesn't load in jsdom. A
// `vi.fn` (not a bare `() => null`) so the JSON-editor-gating tests below can
// read the props it was rendered with.
vi.mock("@cyoda/workflow-react", () => ({ WorkflowEditor: vi.fn(() => null) }));

function makeSession(overrides: Partial<EditorSession>): EditorSession {
  return {
    document: null,
    issues: [],
    parseOk: false,
    dirty: false,
    saving: false,
    saveError: null,
    rawContent: "",
    setDocument: vi.fn(),
    applyExternalDocument: vi.fn(),
    externalRevision: 0,
    canUndoAi: false,
    undoAiApply: vi.fn(),
    save: vi.fn(),
    revert: vi.fn(),
    layoutKey: "p:/tmp/wf.json",
    ...overrides,
  } as unknown as EditorSession;
}

function wrap(session: EditorSession) {
  return render(
    <ThemeProvider>
      <WorkflowEditorHostPanel session={session} />
    </ThemeProvider>,
  );
}

describe("WorkflowEditorHostPanel — parse failure", () => {
  it("shows the parse-error view when the document cannot be parsed", () => {
    wrap(
      makeSession({
        rawContent: "{}",
        issues: [{ severity: "error", code: "schema-invalid_type", message: "Required", detail: { path: ["workflows", 0, "initialState"] } }],
      }),
    );
    expect(screen.getByText(/Workflow JSON could not be parsed/)).toBeInTheDocument();
  });
});

describe("WorkflowEditorHostPanel — editor JSON-tab gating", () => {
  // The editor's built-in JSON tab is only usable when a Monaco runtime is
  // supplied via `jsonEditorConfig.monaco`. Enabling the tab without one leaves
  // a JSON button that throws "Monaco runtime not configured" on click. So the
  // panel must only enable it when a config is actually provided (dev-console
  // passes one → editable JSON tab; the read-only MCP viewer passes none → no
  // built-in tab, its read-only JSON lives in a separate pane).
  beforeEach(() => vi.mocked(WorkflowEditor).mockClear());

  function renderValid(jsonEditorConfig?: unknown, enableJsonEditor?: boolean) {
    render(
      <ThemeProvider>
        <WorkflowEditorHostPanel
          session={makeSession({ parseOk: true, document: {} as unknown as WorkflowEditorDocument })}
          jsonEditorConfig={jsonEditorConfig as never}
          enableJsonEditor={enableJsonEditor as never}
        />
      </ThemeProvider>,
    );
    return vi.mocked(WorkflowEditor).mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
  }

  it("does NOT enable the editor's built-in JSON tab when no jsonEditorConfig is provided", () => {
    const props = renderValid(undefined);
    expect(props?.enableJsonEditor).toBe(false);
  });

  it("enables the editor's built-in JSON tab by default when a jsonEditorConfig is provided", () => {
    const config = { monaco: {} };
    const props = renderValid(config);
    expect(props?.enableJsonEditor).toBe(true);
    expect(props?.jsonEditor).toEqual(config);
  });

  it("passes the runtime for the inspector but keeps the editable tab off when enableJsonEditor={false}", () => {
    // The read-only MCP shell case: supply a Monaco runtime (so the inspector's
    // annotations/criteria render in Monaco) but disable the editable full-document tab.
    const config = { monaco: {} };
    const props = renderValid(config, false);
    expect(props?.enableJsonEditor).toBe(false);
    expect(props?.jsonEditor).toEqual(config);
  });
});
