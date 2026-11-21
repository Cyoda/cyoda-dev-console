/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import { parseImportPayload } from "@cyoda/workflow-core";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import type { SseEvent } from "../sseClient.js";

// End-to-end wiring test: real App → real WorkflowPane → real EditorView →
// real useEditorSession → (stubbed) WorkflowEditor. This is the layer where
// the baseline-drift bug actually manifests, so we drive real SSE `content`
// pushes through the real session and assert the *remount* path keeps
// auto-applying. Only the reactflow canvas is stubbed (happy-dom cannot lay it
// out); everything else is real.
//
// `App` now renders through `WorkflowPane`, which imports `MonacoJsonViewer`
// unconditionally — and `MonacoJsonViewer.tsx` calls `getMonacoRuntime()` at
// MODULE SCOPE on import, so this mock is required even though the JSON tab is
// never selected here (same discipline as App.test.tsx / AppShell.test.tsx).
vi.mock("../monacoRuntime.js", () => ({ getMonacoRuntime: vi.fn() }));

let workflowEditorProps: Record<string, unknown> | null = null;
vi.mock("@cyoda/workflow-react", () => ({
  WorkflowEditor: (props: Record<string, unknown>) => {
    workflowEditorProps = props;
    return null;
  },
}));

let onEventCb: ((e: SseEvent) => void) | null = null;
vi.mock("../sseClient.js", () => ({
  subscribe: (_origin: string, onEvent: (e: SseEvent) => void) => {
    onEventCb = onEvent;
    return vi.fn();
  },
}));

// See EditorView.test.tsx — Node 25's ambient `localStorage` lacks `clear()`.
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

// A valid workflow whose single transition name is `marker` — a swap-detector:
// the stubbed WorkflowEditor's `document` prop reflects whichever content the
// current session mounted with.
function wf(marker: string): string {
  return JSON.stringify({
    importMode: "MERGE",
    workflows: [
      {
        version: "1.3",
        name: "demo",
        initialState: "S",
        active: true,
        states: {
          S: { transitions: [{ name: marker, next: "T", manual: false, disabled: false }] },
          T: { transitions: [] },
        },
      },
    ],
  });
}

function shownMarker(): string | undefined {
  const doc = workflowEditorProps?.document as WorkflowEditorDocument | undefined;
  return doc?.session.workflows[0]?.states.S?.transitions[0]?.name;
}

async function importApp() {
  const mod = await import("../App.js");
  return mod.App;
}

beforeEach(() => {
  workflowEditorProps = null;
  onEventCb = null;
  vi.stubGlobal("localStorage", makeStorage());
  // App now fetches `/api/index` unconditionally on mount (for the sidebar
  // picker) — stub it so that call resolves instead of rejecting; this suite
  // only exercises the SSE-driven content/dirty/banner machinery.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ workflows: [], entities: [] }) })));
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App+EditorView integration — Claude content pushes", () => {
  it("auto-applies TWO consecutive clean pushes (no banner on the second — the applyExternalDocument-drift regression)", async () => {
    const App = await importApp();
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    act(() => { onEventCb?.({ type: "show", workflow: "demo", revision: 1, content: wf("v0"), layout: {} }); });
    expect(shownMarker()).toBe("v0");

    // Push #1: clean viewer → editor remounts on the new content, no banner.
    act(() => { onEventCb?.({ type: "content", workflow: "demo", revision: 2, content: wf("v1") }); });
    expect(shownMarker()).toBe("v1");
    expect(screen.queryByText(/changed on disk/i)).not.toBeInTheDocument();

    // Push #2: the fresh session from push #1 is still clean, so this ALSO
    // auto-applies. (Under applyExternalDocument, baseline drift would have
    // left it dirty and raised the banner here instead.)
    act(() => { onEventCb?.({ type: "content", workflow: "demo", revision: 3, content: wf("v2") }); });
    expect(shownMarker()).toBe("v2");
    expect(screen.queryByText(/changed on disk/i)).not.toBeInTheDocument();
  });

  it("first clean push auto-applies with no banner", async () => {
    const App = await importApp();
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    act(() => { onEventCb?.({ type: "show", workflow: "demo", revision: 1, content: wf("v0"), layout: {} }); });

    act(() => { onEventCb?.({ type: "content", workflow: "demo", revision: 2, content: wf("v1") }); });

    expect(shownMarker()).toBe("v1");
    expect(screen.queryByText(/changed on disk/i)).not.toBeInTheDocument();
  });

  it("shows the banner (does not remount) when a content push arrives while the human has unsaved local edits", async () => {
    const App = await importApp();
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    act(() => { onEventCb?.({ type: "show", workflow: "demo", revision: 1, content: wf("v0"), layout: {} }); });

    // Human edits the graph → session goes dirty (reported up to App).
    const onChange = workflowEditorProps?.onChange as (doc: WorkflowEditorDocument) => void;
    act(() => onChange(parseImportPayload(wf("localEdit")).document!));

    act(() => { onEventCb?.({ type: "content", workflow: "demo", revision: 2, content: wf("v1") }); });

    // Banner shown; the push did NOT clobber the human's local edit.
    expect(screen.getByText(/changed on disk/i)).toBeInTheDocument();
    expect(shownMarker()).toBe("localEdit");
  });
});
