import { describe, it, expect, vi } from "vitest";
import { getDialect, LATEST_CYODA_VERSION, parseImportPayload, serializeImportPayload, validateAll } from "@cyoda/workflow-core";
import { TOOL_MANIFEST } from "../manifest.js";
import { makeDispatcher } from "../dispatch.js";
import type { ToolHandler } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { listWorkflowsTool } from "../tools/list.js";
import { validateWorkflowsTool } from "../tools/validate.js";
import { connectionInfoTool } from "../tools/connection_info.js";
import { listEntitiesTool, getEntityTool, createEntityTool, updateEntityTool, deleteEntityTool } from "../tools/entities.js";
import { getProjectTool, configureProjectTool } from "../tools/project.js";

const EXPECTED = [
  "list_workflows", "show_workflow", "get_workflow", "create_workflow", "update_workflow", "delete_workflow",
  "update_transition", "add_transition", "remove_transition",
  "add_state", "remove_state", "rename_state",
  "optimize_layout", "validate_workflow", "validate_workflows", "connection_info",
  "list_entities", "get_entity", "show_entity", "create_entity", "update_entity", "delete_entity",
  "configure_project", "get_project",
];

describe("TOOL_MANIFEST", () => {
  it("advertises exactly the full-editor-expansion tool surface, once each", () => {
    const names = TOOL_MANIFEST.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length); // no duplicates
    expect([...names].sort()).toEqual([...EXPECTED].sort());
  });
  it("create_workflow states the current schema tag and the accepted range, both derived from the dialect", () => {
    const dialect = getDialect(LATEST_CYODA_VERSION);
    const desc = TOOL_MANIFEST.find((t) => t.name === "create_workflow")!.description;
    expect(desc).toContain(`version: "${dialect.schemaVersionTag}"`);
    for (const r of dialect.acceptedSchemaVersions ?? []) {
      expect(desc).toContain(`${r.major}.${r.minMinor}–${r.major}.${r.maxMinor}`);
    }
  });
  it("every entry has a non-empty description and a JSON-Schema object inputSchema", () => {
    for (const entry of TOOL_MANIFEST) {
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.inputSchema).toMatchObject({ type: "object" });
    }
  });
});

/** A ToolContext backed by an in-memory file map + a fixed set of discovered entities/workflows,
 *  mirroring the fakes in `entities.test.ts`/`project.test.ts`/`tools.test.ts` — reused here to
 *  build the SAME `tools` map `index.ts`'s `main()` wires up, so this test exercises the real
 *  registration (name -> handler closure -> real tool function) through the real dispatcher,
 *  not just the tool functions directly. */
function ctx(over: Partial<ToolContext> = {}): ToolContext {
  const writes: Record<string, string> = {};
  const deleted = new Set<string>();
  const files: Record<string, string> = { "models/schema/Foo.json": '{"a":1}' };
  return {
    root: "/r",
    workflowGlobs: ["models/workflow/**/*.json"],
    entityGlobs: ["models/schema/**/*.json"],
    connectionUrl: "http://127.0.0.1:50000",
    read: vi.fn(async (rel: string) => {
      if (deleted.has(rel)) throw new Error(`not found: ${rel}`);
      const c = writes[rel] ?? files[rel];
      if (c === undefined) throw new Error(`not found: ${rel}`);
      return { contents: c, lastModified: "t", sizeBytes: c.length };
    }),
    write: vi.fn(async (rel: string, contents: string) => { writes[rel] = contents; deleted.delete(rel); return { path: `/r/${rel}`, lastModified: "t", sizeBytes: contents.length }; }),
    deleteFile: vi.fn(async (rel: string) => { deleted.add(rel); }),
    discover: vi.fn(async () => []),
    discoverEntities: vi.fn(async () => [{ relativePath: "models/schema/Foo.json", name: "Foo", lastModified: "t", sizeBytes: 1 }]),
    setGlobs: vi.fn(),
    parseImport: parseImportPayload,
    serializeImport: serializeImportPayload,
    validate: validateAll,
    ...over,
  };
}

describe("dispatcher wiring (Task 18)", () => {
  const c = ctx();
  // The SAME shape as index.ts's `main()` `tools` map — one closure per manifest entry, all
  // bound to the same fake `ToolContext` above.
  const tools: Record<string, ToolHandler> = {
    list_workflows: (a) => listWorkflowsTool(a, c),
    validate_workflows: (a) => validateWorkflowsTool(a, c),
    connection_info: (a) => connectionInfoTool(a, c),
    list_entities: (a) => listEntitiesTool(a, c),
    get_entity: (a) => getEntityTool(a, c),
    create_entity: (a) => createEntityTool(a, c),
    update_entity: (a) => updateEntityTool(a, c),
    delete_entity: (a) => deleteEntityTool(a, c),
    configure_project: (a) => configureProjectTool(a, c),
    get_project: (a) => getProjectTool(a, c),
  };
  const dispatch = makeDispatcher(tools);

  it.each([
    ["list_workflows", {}],
    ["validate_workflows", {}],
    ["list_entities", {}],
    ["get_entity", { name: "Foo" }],
    ["create_entity", { name: "Bar", content: "{}" }],
    ["update_entity", { name: "Foo", content: "{}" }],
    ["delete_entity", { name: "Foo" }],
    ["configure_project", { entityGlobs: ["models/schema/**/*.json"] }],
    ["get_project", {}],
  ])("dispatches %s end-to-end with a valid arg", async (name, args) => {
    const r = await dispatch(name, args);
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toBeDefined();
  });

  it("rejects an extra/unknown key through the dispatcher (INVALID_ARGS, not a crash)", async () => {
    const r = await dispatch("get_entity", { name: "Foo", bogus: 1 });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("INVALID_ARGS");
  });

  it("rejects an unregistered tool name through the dispatcher (UNKNOWN_TOOL)", async () => {
    const r = await dispatch("no_such_tool", {});
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("UNKNOWN_TOOL");
  });
});
