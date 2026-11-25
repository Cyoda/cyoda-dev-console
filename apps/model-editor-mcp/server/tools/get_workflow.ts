import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { getWorkflowInput } from "../schemas.js";
import { findByName } from "../discovery.js";

/**
 * `get_workflow(name)` — read a single workflow's RAW on-disk file contents. Deliberately does
 * NOT call `ctx.parseImport`/`ctx.serializeImport`: `show_workflow` (and the write side of
 * `update_workflow`) round-trip through that pipeline, which CANONICALIZES the document —
 * e.g. renaming `operatorType` -> `operation`, dropping empty-string `context`, injecting
 * `disabled: false` where absent, and the cyoda-go 0.9 fix-ups (full list: README.md
 * § Canonicalization, and `show_workflow`'s manifest description). That means
 * `show_workflow` -> `update_workflow` silently commits those transforms even when the human
 * never touched the field. `get_workflow` is the byte-faithful counterpart — mirrors `get_entity`
 * for entities, giving workflows the same pure/raw read entities already had.
 *
 * Field name note: unlike `get_entity` (which returns the raw text under `contents`, plural),
 * this returns it under `content` (singular) — a deliberate difference, chosen to match
 * `show_workflow`'s key so a caller can diff the raw (`get_workflow`) and canonical
 * (`show_workflow`) forms of the SAME workflow under the identical field name.
 */
export async function getWorkflowTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = getWorkflowInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { name } = input.data;

  const entry = findByName(await ctx.discover(), name);
  if (!entry) throw err("NOT_FOUND", `no workflow named "${name}"`);

  const { contents, lastModified } = await ctx.read(entry.relativePath);
  return ok({ name, path: entry.relativePath, content: contents, lastModified });
}
