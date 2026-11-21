/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@cyoda/console-design-system";
import type { SseEvent } from "../sseClient.js";

vi.mock("../monacoRuntime.js", () => ({ getMonacoRuntime: vi.fn() }));

let capturedEditorProps: Record<string, unknown> | null = null;
vi.mock("../EditorView.js", () => ({
  EditorView: (props: Record<string, unknown>) => { capturedEditorProps = props; return <div data-testid="graph-pane" />; },
}));

let onEventCb: ((e: SseEvent) => void) | null = null;
vi.mock("../sseClient.js", () => ({
  subscribe: (_origin: string, onEvent: (e: SseEvent) => void) => { onEventCb = onEvent; return vi.fn(); },
}));

const INDEX = {
  workflows: [{ name: "Pledge", path: "models/workflow/Pledge.json" }],
  entities: [{ name: "CollateralAsset", path: "models/schema/CollateralAsset.json" }],
};

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/index") return { ok: true, json: async () => INDEX };
    if (url === "/api/workflow/Pledge") return { ok: true, json: async () => ({ name: "Pledge", path: "x", content: "wf-content", layout: {} }) };
    if (url === "/api/entity/CollateralAsset") return { ok: true, json: async () => ({ name: "CollateralAsset", path: "x", contents: '{"a":1}' }) };
    throw new Error(`unexpected fetch: ${url}`);
  }));
}

async function importApp() {
  const mod = await import("../App.js");
  return mod.App;
}

beforeEach(() => { capturedEditorProps = null; onEventCb = null; vi.resetModules(); stubFetch(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("App shell — picker + navigation", () => {
  it("fetches /api/index on mount and lists workflows/entities in the sidebar", async () => {
    const App = await importApp();
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("Pledge")).toBeInTheDocument());
    expect(screen.getByText("CollateralAsset")).toBeInTheDocument();
  });

  it("clicking a workflow in the sidebar fetches it and shows the Graph pane", async () => {
    const App = await importApp();
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("Pledge")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Pledge"));

    await waitFor(() => expect(capturedEditorProps).toMatchObject({ workflow: "Pledge", content: "wf-content" }));
    expect(screen.getByTestId("graph-pane")).toBeInTheDocument();
  });

  it("clicking an entity in the sidebar fetches it and shows the entity Tree pane", async () => {
    const App = await importApp();
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("CollateralAsset")).toBeInTheDocument());

    fireEvent.click(screen.getByText("CollateralAsset"));

    await waitFor(() => expect(screen.getByPlaceholderText("Search keys and values…")).toBeInTheDocument());
  });

  it("a Claude show push overrides the human's current entity pick — last one wins", async () => {
    const App = await importApp();
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("CollateralAsset")).toBeInTheDocument());
    fireEvent.click(screen.getByText("CollateralAsset"));
    await waitFor(() => expect(screen.getByPlaceholderText("Search keys and values…")).toBeInTheDocument());

    onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "pushed-content", layout: {} });

    await waitFor(() => expect(capturedEditorProps).toMatchObject({ workflow: "Pledge", content: "pushed-content" }));
  });

  it("a Claude show_entity push drives the browser to that entity's Tree view with the pushed contents", async () => {
    const App = await importApp();
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("CollateralAsset")).toBeInTheDocument());

    onEventCb?.({ type: "showEntity", entity: "PushedEntity", revision: 1, contents: '{"pushedKey":"pushedVal"}' });

    // Entity Tree pane is now shown, rendered from the SSE-pushed contents (not a fetch).
    await waitFor(() => expect(screen.getByPlaceholderText("Search keys and values…")).toBeInTheDocument());
    expect(screen.getByText("pushedKey")).toBeInTheDocument();
  });

  it("a Claude show_entity push overrides the human's current workflow view — last one wins", async () => {
    const App = await importApp();
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("Pledge")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Pledge"));
    await waitFor(() => expect(capturedEditorProps).toMatchObject({ workflow: "Pledge", content: "wf-content" }));

    onEventCb?.({ type: "showEntity", entity: "PushedEntity", revision: 1, contents: '{"a":1}' });

    await waitFor(() => expect(screen.getByPlaceholderText("Search keys and values…")).toBeInTheDocument());
    expect(screen.queryByTestId("graph-pane")).not.toBeInTheDocument();
  });

  it("a content push for a workflow the human is NOT currently viewing is ignored", async () => {
    const App = await importApp();
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("CollateralAsset")).toBeInTheDocument());
    fireEvent.click(screen.getByText("CollateralAsset"));
    await waitFor(() => expect(screen.getByPlaceholderText("Search keys and values…")).toBeInTheDocument());

    onEventCb?.({ type: "content", workflow: "Pledge", revision: 1, content: "unrelated" });

    // still on the entity view — no crash, no switch
    expect(screen.getByPlaceholderText("Search keys and values…")).toBeInTheDocument();
  });

  it("the sidebar collapse toggle hides and restores the picker", async () => {
    const App = await importApp();
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("Pledge")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Hide sidebar"));
    expect(screen.queryByText("Pledge")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Show sidebar"));
    await waitFor(() => expect(screen.getByText("Pledge")).toBeInTheDocument());
  });

  it("the filter box narrows the visible workflow/entity list", async () => {
    const App = await importApp();
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText("Pledge")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Filter…"), { target: { value: "Collateral" } });

    expect(screen.queryByText("Pledge")).not.toBeInTheDocument();
    expect(screen.getByText("CollateralAsset")).toBeInTheDocument();
  });
});
