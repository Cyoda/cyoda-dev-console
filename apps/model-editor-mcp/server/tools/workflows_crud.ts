import { ok, err, validationFailed } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { createWorkflowInput, deleteWorkflowInput } from "../schemas.js";
import { findByName, resolveWorkflowCreatePath } from "../discovery.js";

/**
 * `create_workflow(name, content)` — mirrors `update_workflow`'s parse -> validate ->
 * serialize -> write pipeline, NOT `create_entity`'s verbatim write: `content` is a full
 * import-payload (`{importMode, workflows:[...]}`), and what actually lands on disk is the
 * CANONICAL `serializeImport` form — the exact shape `update_workflow` writes and
 * `show_workflow`/`get_workflow` read back. Writing `content` verbatim would desync the
 * on-disk format from every other tool's canonicalization contract.
 *
 * Rejects (writing NOTHING) on: an already-existing name (`ALREADY_EXISTS`, checked via
 * `findByName` BEFORE any parse/write — mirrors `create_entity`'s existence-before-mutation
 * ordering); a file already occupying the resolved target path even under a DIFFERENT/no
 * discoverable name (`ALREADY_EXISTS`, probed via `ctx.read` on the resolved path immediately
 * before `ctx.write` — `findByName` alone can't catch this because discovery excludes
 * `json-not-workflow`-status files, which are otherwise invisible but very much on disk);
 * invalid JSON (`INVALID_JSON`); or a semantically-invalid document (`VALIDATION_FAILED`,
 * identical envelope shape to `update_workflow`'s).
 */
/** Core's diagnostic for a workflow `version` tag below the target server's supported range. */
const RETIRED_SCHEMA_TAG = "workflow-schema-version-outdated";

export async function createWorkflowTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = createWorkflowInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { name, content } = input.data;

  try { JSON.parse(content); } catch { throw err("INVALID_JSON", `content for "${name}" is not valid JSON`); }

  const discovered = await ctx.discover();
  const existing = findByName(discovered, name);
  if (existing) throw err("ALREADY_EXISTS", `a workflow named "${name}" already exists at "${existing.relativePath}"`);

  // `parseImportPayload` already runs `validateSemantics` into `parsed.issues` — source every
  // diagnostic from here alone, same rule `update_workflow` follows (see its comment).
  const parsed = ctx.parseImport(content);
  // A retired schema tag is only a warning in core (an existing file must still open so it can
  // be fixed), but cyoda-go refuses it on import and a NEW file has no reason to carry one —
  // so create_workflow blocks on it, surfaced as an error so the agent sees why.
  const issues = parsed.issues.map((i) =>
    i.code === RETIRED_SCHEMA_TAG ? { ...i, severity: "error" as const } : i,
  );
  if (!parsed.document || issues.some((i) => i.severity === "error")) {
    return validationFailed(issues);
  }

  const canonical = ctx.serializeImport(parsed.document);
  // Reuse `discovered` (already fetched for the existence check above) rather than discovering
  // again — it's also what tells the resolver where the existing workflows actually live.
  const path = resolveWorkflowCreatePath(ctx.workflowGlobs, name, discovered);

  // `findByName` only sees discovery's workflow-status subset (excludes `json-not-workflow`),
  // so a plain-JSON file sitting at the resolved target path can be entirely invisible to it —
  // probe the target path directly so we never silently overwrite it.
  let occupied = true;
  try { await ctx.read(path); } catch { occupied = false; }
  if (occupied) throw err("ALREADY_EXISTS", `a file already exists at "${path}"`);

  await ctx.write(path, canonical);
  return ok({ name, path, ok: true, diagnostics: parsed.issues });
}

/**
 * `delete_workflow(name)` — delete an existing workflow file plus its `.layout.json` sidecar
 * (best-effort). Existence is resolved via `findByName` BEFORE any path use / mutation — do
 * NOT rely on `ctx.deleteFile` to surface a missing file as `NOT_FOUND`: it throws
 * `ConfinementError` on a nonexistent path, not an ENOENT-shaped error (see `files.ts`'s
 * `rmConfined`). The sidecar is probed for existence via `ctx.read` (never `findByName` —
 * discovery deliberately never lists `.layout.json` sidecars) and only deleted if that read
 * succeeds.
 */
export async function deleteWorkflowTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = deleteWorkflowInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { name } = input.data;

  const entry = findByName(await ctx.discover(), name);
  if (!entry) throw err("NOT_FOUND", `no workflow named "${name}"`);

  await ctx.deleteFile(entry.relativePath);

  const sidecarRel = entry.relativePath.replace(/\.json$/, ".layout.json");
  try {
    await ctx.read(sidecarRel);
    await ctx.deleteFile(sidecarRel);
  } catch {
    // no sidecar (or unreadable) — best-effort, nothing to delete
  }

  return ok({ ok: true, name });
}
