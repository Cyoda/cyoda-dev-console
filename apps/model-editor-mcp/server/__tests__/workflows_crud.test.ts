import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseImportPayload, serializeImportPayload, validateAll } from "@cyoda/workflow-core";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import type { ToolContext } from "../context.js";
import { createToolContext } from "../context.js";
import { createWorkflowTool, deleteWorkflowTool } from "../tools/workflows_crud.js";
import { listWorkflowsTool } from "../tools/list.js";

const PLEDGE = JSON.stringify({
  importMode: "MERGE",
  workflows: [{ version: "1.3", name: "Pledge", initialState: "none", active: true,
    states: { none: { transitions: [{ name: "create", next: "created", manual: false, disabled: false }] }, created: { transitions: [] } } }],
});

/** Schema-valid but semantically invalid: `create` targets a state that does not exist. */
const DANGLING = JSON.stringify({
  importMode: "MERGE",
  workflows: [{ version: "1.3", name: "Pledge", initialState: "none", active: true,
    states: { none: { transitions: [{ name: "create", next: "ghost", manual: false, disabled: false }] } } }],
});

function entry(over: Partial<WorkflowFileIndexEntry> = {}): WorkflowFileIndexEntry {
  return { path: "/r/Pledge.json", relativePath: "Pledge.json", status: "valid-workflow", workflows: [{ name: "Pledge" }], lastModified: "t", sizeBytes: 1, ...over };
}

/** In-memory fake ToolContext — mirrors `tools.test.ts`/`entities.test.ts`'s `ctx()`, for
 *  unit-level assertions where we need precise write/deleteFile call counts. */
function ctx(entries: WorkflowFileIndexEntry[], files: Record<string, string> = {}, over: Partial<ToolContext> = {}): ToolContext {
  const writes: Record<string, string> = {};
  const deleted = new Set<string>();
  return {
    root: "/r",
    workflowGlobs: ["models/workflow/**/*.json"],
    entityGlobs: [],
    connectionUrl: "http://127.0.0.1:50000",
    read: vi.fn(async (rel: string) => {
      if (deleted.has(rel)) throw new Error(`not found: ${rel}`);
      const c = writes[rel] ?? files[rel];
      if (c === undefined) throw new Error(`not found: ${rel}`);
      return { contents: c, lastModified: "t", sizeBytes: c.length };
    }),
    write: vi.fn(async (rel: string, contents: string) => { writes[rel] = contents; deleted.delete(rel); return { path: `/r/${rel}`, lastModified: "t", sizeBytes: contents.length }; }),
    deleteFile: vi.fn(async (rel: string) => { deleted.add(rel); }),
    discover: vi.fn(async () => entries),
    discoverEntities: vi.fn(async () => []),
    setGlobs: vi.fn(),
    parseImport: parseImportPayload,
    serializeImport: serializeImportPayload,
    validate: validateAll,
    ...over,
  };
}

describe("createWorkflowTool", () => {
  it("rejects invalid JSON without writing", async () => {
    const c = ctx([]);
    await expect(createWorkflowTool({ name: "Pledge", content: "{bad" }, c)).rejects.toMatchObject({
      isError: true, content: [{ type: "text", text: expect.stringContaining("INVALID_JSON") }],
    });
    expect(c.write).not.toHaveBeenCalled();
  });

  it("rejects an already-existing name (ALREADY_EXISTS) without writing", async () => {
    const c = ctx([entry()]);
    await expect(createWorkflowTool({ name: "Pledge", content: PLEDGE }, c)).rejects.toMatchObject({
      isError: true, content: [{ type: "text", text: expect.stringContaining("ALREADY_EXISTS") }],
    });
    expect(c.write).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED (no write) for a semantically-invalid (dangling target) workflow", async () => {
    const c = ctx([]);
    const r = await createWorkflowTool({ name: "Pledge", content: DANGLING }, c);
    expect(r.isError).toBe(true);
    expect((r.structuredContent as { code: string }).code).toBe("VALIDATION_FAILED");
    expect(c.write).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_FAILED (no write) for a retired schema tag — cyoda-go refuses it on import, and a NEW file has no reason to carry one", async () => {
    const c = ctx([]);
    const r = await createWorkflowTool({ name: "Pledge", content: PLEDGE.replace('"1.3"', '"1.0"') }, c);
    expect(r.isError).toBe(true);
    const sc = r.structuredContent as { code: string; diagnostics: { code: string; severity: string }[] };
    expect(sc.code).toBe("VALIDATION_FAILED");
    expect(sc.diagnostics).toContainEqual(
      expect.objectContaining({ code: "workflow-schema-version-outdated", severity: "error" }),
    );
    expect(c.write).not.toHaveBeenCalled();
  });

  it("accepts the lowest still-supported schema tag", async () => {
    const c = ctx([]);
    const r = await createWorkflowTool({ name: "Pledge", content: PLEDGE.replace('"1.3"', '"1.1"') }, c);
    expect(r.isError).toBeFalsy();
    expect(c.write).toHaveBeenCalledTimes(1);
  });

  it("writes the CANONICAL serialized document (not the raw import-payload) at a path derived from workflowGlobs", async () => {
    const c = ctx([]);
    const r = await createWorkflowTool({ name: "Pledge", content: PLEDGE }, c);
    expect(r.isError).toBeFalsy();
    const out = JSON.parse(r.content[0]!.text);
    expect(out).toMatchObject({ ok: true, name: "Pledge", path: "models/workflow/Pledge.json" });
    expect(c.write).toHaveBeenCalledTimes(1);
    const written = (c.write as unknown as { mock: { calls: [string, string][] } }).mock.calls[0]![1];
    const parsed = parseImportPayload(PLEDGE);
    expect(written).toBe(serializeImportPayload(parsed.document!)); // exactly what update_workflow would write
  });

  it("rejects (ALREADY_EXISTS) without writing when a non-workflow-shaped file already occupies the resolved target path — discovery excludes json-not-workflow status, so findByName alone would miss this and silently overwrite", async () => {
    const c = ctx([], { "models/workflow/Pledge.json": JSON.stringify({ note: "x" }) });
    await expect(createWorkflowTool({ name: "Pledge", content: PLEDGE }, c)).rejects.toMatchObject({
      isError: true, content: [{ type: "text", text: expect.stringContaining("ALREADY_EXISTS") }],
    });
    expect(c.write).not.toHaveBeenCalled();
  });
});

describe("deleteWorkflowTool", () => {
  it("throws NOT_FOUND without deleting when the workflow does not exist", async () => {
    const c = ctx([]);
    await expect(deleteWorkflowTool({ name: "Nope" }, c)).rejects.toMatchObject({
      isError: true, content: [{ type: "text", text: expect.stringContaining("NOT_FOUND") }],
    });
    expect(c.deleteFile).not.toHaveBeenCalled();
  });

  it("deletes an existing workflow and its layout sidecar", async () => {
    const c = ctx([entry()], { "Pledge.json": PLEDGE, "Pledge.layout.json": "{}" });
    const r = await deleteWorkflowTool({ name: "Pledge" }, c);
    expect(JSON.parse(r.content[0]!.text)).toEqual({ ok: true, name: "Pledge" });
    expect(c.deleteFile).toHaveBeenCalledWith("Pledge.json");
    expect(c.deleteFile).toHaveBeenCalledWith("Pledge.layout.json");
    expect(c.deleteFile).toHaveBeenCalledTimes(2);
  });

  it("deletes the workflow but does not attempt the sidecar when none exists (best-effort)", async () => {
    const c = ctx([entry()], { "Pledge.json": PLEDGE }); // no Pledge.layout.json
    const r = await deleteWorkflowTool({ name: "Pledge" }, c);
    expect(JSON.parse(r.content[0]!.text)).toEqual({ ok: true, name: "Pledge" });
    expect(c.deleteFile).toHaveBeenCalledWith("Pledge.json");
    expect(c.deleteFile).toHaveBeenCalledTimes(1);
  });
});

describe("create_workflow + delete_workflow, end-to-end against real fs + discovery", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mem-wfcrud-"));
    await mkdir(join(root, "models/workflow"), { recursive: true });
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("create_workflow, then list_workflows shows it (proves the canonical on-disk format is discoverable)", async () => {
    const realCtx = createToolContext({ root, workflowGlobs: ["models/workflow/**/*.json"], entityGlobs: [], connectionUrl: "http://x" });
    const created = await createWorkflowTool({ name: "Pledge", content: PLEDGE }, realCtx);
    expect(created.isError).toBeFalsy();

    const onDisk = await readFile(join(root, "models/workflow/Pledge.json"), "utf8");
    const parsed = parseImportPayload(PLEDGE);
    expect(onDisk).toBe(serializeImportPayload(parsed.document!)); // canonical, not verbatim `content`

    const listed = await listWorkflowsTool({}, realCtx);
    const out = JSON.parse(listed.content[0]!.text) as { workflows: Array<{ name: string; path: string; valid: boolean }> };
    expect(out.workflows).toContainEqual(expect.objectContaining({ name: "Pledge", path: "models/workflow/Pledge.json", valid: true }));
  });

  it("creates the new workflow NEXT TO the existing ones in a nested directory a ** glob spans, not at the glob's literal prefix (models/workflow/v1/Bar.json, not models/workflow/Bar.json)", async () => {
    await mkdir(join(root, "models/workflow/v1"), { recursive: true });
    const foo = JSON.stringify({
      importMode: "MERGE",
      workflows: [{ version: "1.3", name: "Foo", initialState: "none", active: true,
        states: { none: { transitions: [{ name: "create", next: "created", manual: false, disabled: false }] }, created: { transitions: [] } } }],
    });
    await writeFile(join(root, "models/workflow/v1/Foo.json"), foo);

    const realCtx = createToolContext({ root, workflowGlobs: ["models/workflow/**/*.json"], entityGlobs: [], connectionUrl: "http://x" });
    const created = await createWorkflowTool({ name: "Pledge", content: PLEDGE }, realCtx);
    expect(created.isError).toBeFalsy();
    const out = JSON.parse(created.content[0]!.text);
    expect(out).toMatchObject({ ok: true, name: "Pledge", path: "models/workflow/v1/Pledge.json" });

    const onDisk = await readFile(join(root, "models/workflow/v1/Pledge.json"), "utf8");
    const parsed = parseImportPayload(PLEDGE);
    expect(onDisk).toBe(serializeImportPayload(parsed.document!));
  });

  it("does NOT overwrite an existing non-workflow-shaped file at the resolved target path, even though real discovery genuinely does not surface it (path-collision guard, not just a findByName gap)", async () => {
    const realCtx = createToolContext({ root, workflowGlobs: ["models/workflow/**/*.json"], entityGlobs: [], connectionUrl: "http://x" });
    const original = JSON.stringify({ note: "x" });
    await writeFile(join(root, "models/workflow/Pledge.json"), original);

    // Sanity: this file is genuinely invisible to discovery (json-not-workflow status, excluded
    // from WORKFLOW_STATUSES) — proves the bug isn't reachable via findByName alone.
    const discovered = await realCtx.discover();
    expect(discovered.find((e) => e.relativePath === "models/workflow/Pledge.json")).toBeUndefined();

    await expect(createWorkflowTool({ name: "Pledge", content: PLEDGE }, realCtx)).rejects.toMatchObject({
      isError: true, content: [{ type: "text", text: expect.stringContaining("ALREADY_EXISTS") }],
    });

    const onDisk = await readFile(join(root, "models/workflow/Pledge.json"), "utf8");
    expect(onDisk).toBe(original); // untouched — NOT silently overwritten
  });

  it("delete_workflow removes the file (gone from list_workflows) and its layout sidecar", async () => {
    const realCtx = createToolContext({ root, workflowGlobs: ["models/workflow/**/*.json"], entityGlobs: [], connectionUrl: "http://x" });
    await writeFile(join(root, "models/workflow/Pledge.json"), PLEDGE);
    await writeFile(join(root, "models/workflow/Pledge.layout.json"), JSON.stringify({ Pledge: { collapsedStates: [] } }));

    const deleted = await deleteWorkflowTool({ name: "Pledge" }, realCtx);
    expect(JSON.parse(deleted.content[0]!.text)).toEqual({ ok: true, name: "Pledge" });

    const listed = await listWorkflowsTool({}, realCtx);
    const out = JSON.parse(listed.content[0]!.text) as { workflows: Array<{ name: string }> };
    expect(out.workflows.map((w) => w.name)).not.toContain("Pledge");

    await expect(readFile(join(root, "models/workflow/Pledge.json"), "utf8")).rejects.toThrow();
    await expect(readFile(join(root, "models/workflow/Pledge.layout.json"), "utf8")).rejects.toThrow();
  });
});
