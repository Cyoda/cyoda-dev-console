# model-editor-mcp

MCP server for a live, browser-rendered Cyoda model editor — workflows AND entities — driven by an AI CLI via `.mcp.json`.

Claude Code spawns it over stdio (see `.mcp.json.example`); it serves the real
`@cyoda/workflow-react` editor plus a read-only entity viewer at a deterministic
`http://127.0.0.1:<port>/` and pushes live updates over SSE. Claude drives all
content (workflows via `create_workflow`/`update_workflow`/`delete_workflow`,
entities via `create_entity`/`update_entity`/`delete_entity`, both
validated); the human arranges the canvas
(drags persist via `POST /layout`) and browses freely — a collapsible sidebar
picker lets you jump between any discovered workflow or entity without asking
Claude. Ask Claude for the URL any time via `connection_info`.

## Operational model (sent as MCP `instructions`)

On the `initialize` handshake the server returns a concise **`instructions`**
block (Claude Code loads it once, ≤ 2 KB, and uses it to decide when to reach
for these tools). It carries the cross-tool guidance below; each tool's own
specifics live in its description, and this README is the exhaustive reference.

- **Prefer element edits.** For a single change use the atomic, fail-closed
  element tools — `update_transition`/`add_transition`/`remove_transition`,
  `add_state`/`remove_state`/`rename_state` — over whole-document
  `update_workflow`. Each validates the whole document and writes nothing on
  error, so there is never a need to stage an invalid intermediate.
- **Order structural edits.** Create a state before adding transitions into it
  (`add_transition` to a missing target is rejected). `rename_state` cascades
  every `next`-ref, `initialState`, lifecycle state-criterion, and the saved
  layout position — use it instead of renaming by hand.
- **Addressing.** A transition is `(workflow, state, name)`; a state is
  `(workflow, code)` — the stable keys.
- **Display & tidy.** `show_workflow`/`show_entity` make the browser show an
  item; `optimize_layout` re-lays-out after structural edits.

## Content ownership

Content is single-writer (Claude) throughout: the workflow graph pane warns on
local edits (Save doesn't persist); the workflow JSON pane and the entity
Tree/JSON panes are genuinely **read-only** Monaco/tree views — there is no
browser content-write path anywhere in this app. Layout drags are the one
thing the human owns directly, persisted to each workflow's `.layout.json`
sidecar.

## Discovery — explicit, narrow locations only, scanned fresh every call

Every content/discovery tool call re-walks the project tree from scratch
(there's no cached index) — skipping `node_modules`, `.git`, `dist`,
`target`, `.model-editor` — and keeps only the files matching
`workflowGlobs`/`entityGlobs` (defaults: `models/workflow/**/*.json`,
`models/schema/**/*.json` — override with `--workflow-globs`/`--entity-globs`
at startup, or mid-session via `configure_project`). Only `connection_info`
and `configure_project` (2 of 24 tools) never discover. A file created,
edited, or renamed on disk is picked up on the very next tool call. An
**entity** is a separate plain-JSON *object* file (never embedded in a
workflow); entity tools are name-based, exactly like the workflow tools
(name = file stem).

Independently of tool calls, a file-watcher observes the `workflowGlobs`-scoped
locations only (never `entityGlobs`) and live-pushes any on-disk change —
workflow content or a `.layout.json` sidecar — to the browser over SSE,
whether or not Claude is the one who made the change (e.g. the human editing
a file outside the app, or a git checkout). An entity edited on disk does
**not** live-push; its content only refreshes on the next tool call that
discovers it.

## Canonicalization — `show_workflow`/`update_workflow`/`create_workflow` vs. raw reads

Three workflow tools round-trip content through the same parse → serialize
pipeline, which **canonicalizes**: `operatorType` is renamed to `operation`,
an empty-string `context` is dropped, and `disabled: false` is injected
wherever absent. That means calling `show_workflow` and then writing the
result back unchanged via `update_workflow` still commits those transforms —
round-tripping is not a no-op. `get_workflow` is the byte-faithful
counterpart: it returns the on-disk bytes with no transformation at all, for
whenever you need to know exactly what's on disk (e.g. before deciding
whether a write would actually change anything). `get_entity`/`show_entity`
are always raw too — entities are plain JSON with no canonical form to
normalize toward.

## Tools

24 tools, grouped below (see `server/manifest.ts`'s `TOOL_MANIFEST` for the
authoritative list + full JSON-Schema input shapes — it's what's actually
advertised to Claude).

Workflows (15):
- `list_workflows()` → `{ workflows: [{ name, path, states, transitions, valid, reason? }] }` — `reason` is present ONLY when `valid` is `false` (the first error-severity diagnostic's message, or a short parse-failure note), so you can learn why a workflow is invalid without a separate `validate_workflow` round-trip
- `show_workflow(name)` — render it in the browser + return the parsed document (**canonicalizes**: parse -> serialize renames `operatorType` -> `operation`, drops empty `context`, injects `disabled:false`)
- `get_workflow(name)` — read the raw on-disk JSON contents, byte-faithfully — no canonicalization (unlike `show_workflow`/`update_workflow`/`create_workflow`)
- `create_workflow(name, content)` — validated write of a brand-new workflow file; rejects an already-existing name, invalid JSON, or a semantically-invalid document (writes nothing on rejection); **canonicalizes** before writing, same pipeline as `update_workflow`
- `update_workflow(name, content)` — validated whole-document write + diff (writes nothing on failure); **canonicalizes** the content before writing, same normalization as `show_workflow`
- `delete_workflow(name)` — deletes the workflow file and its `.layout.json` sidecar, if one exists (best-effort)
- `optimize_layout(name, options?)` — elkjs re-layout, persisted to the workflow's `.layout.json` sidecar (and pushed live to the browser via the file-watcher, not in the tool response). `options.orientation`: `"vertical"` top-to-bottom (default) or `"horizontal"` left-to-right. `options.preset`: `"websiteCompact"` (tight horizontal flow for docs embeds), `"configuratorReadable"` (balanced vertical flow for editors), or `"opsAudit"` (spread layout for ops dashboards). `options.nodeSize`/`options.pinned` override box size / fix specific node coordinates. Returns a lean `{ name, path, ok, nodeCount }` — no positions blob.
- `validate_workflow(name)` — diagnostics, read-only
- `validate_workflows()` — batch form of `validate_workflow`: validates EVERY discovered workflow in one call, `{ workflows: [{ name, valid, diagnostics }] }` (one entry per discovered workflow; an unreadable/unparseable file yields `valid:false` with empty `diagnostics` rather than failing the whole call). Read-only.
- `update_transition(workflow, state, name, patch)` — patch one transition (addressed by the `(workflow, state, name)` tuple). `patch` sets any subset of `{ name, next, manual, disabled, criterion, processors, schedule, annotations }`; provided fields replace (nested values wholesale), omitted are preserved; `patch.name` renames. Writes nothing on validation failure. A rename does not auto-update lifecycle `previousTransition` references — it returns a warning.
- `add_transition(workflow, state, transition)` — append a new transition (`transition` requires `name` + `next` + `manual`). `ALREADY_EXISTS` on a duplicate name in the state.
- `remove_transition(workflow, state, name)` — remove the addressed transition.
- `add_state(workflow, code, state?)` — add a new state (optionally seeded with transitions). `ALREADY_EXISTS` on a duplicate code.
- `remove_state(workflow, code)` — remove a state; rejects if any `next`, the `initialState`, or a lifecycle state-criterion still references it. Also drops its saved layout position.
- `rename_state(workflow, oldCode, newCode)` — rename a state code, cascading every `next`, `initialState`, and lifecycle state-criterion, and migrating its saved layout position.

Element edits are Claude-owned like all content edits; each writes only the content file (plus, for state rename/remove, a best-effort layout-sidecar node migration) and live-pushes to the browser. To clear an optional transition field, use whole-doc `update_workflow`.

Entities (separate plain-JSON object files; name = file stem; render in the
browser as a **JSON tree**, never a diagram) (6):
- `list_entities()` → `{ entities: [{ name, path, lastModified, sizeBytes }] }`
- `get_entity(name)` — read raw JSON contents
- `show_entity(name)` — render it in the browser (Tree/JSON view) + return its raw JSON contents; read-only and never canonicalized, the entity counterpart of `show_workflow`
- `create_entity(name, content)` — rejects if the name already exists
- `update_entity(name, content)` — overwrite an existing entity's whole document
- `delete_entity(name)`

Project configuration (session-only — **never persisted to disk**) (2):
- `configure_project({ name?, workflowGlobs?, entityGlobs? })` — updates the session's discovery globs; on restart the server forgets this and starts back from the `--workflow-globs`/`--entity-globs` CLI defaults (there's no config file to reload from)
- `get_project()` → `{ root, workflowGlobs, entityGlobs, counts: { workflows, entities } }` — also the one place besides `connection_info` that reports the connection URL (under `_connection.url`)

Connection (1):
- `connection_info()` → `{ url, port }` — the browser URL/port for the live editor; call it any time you need the current URL, especially after a server restart (see **Port & token** below)

## Browser navigation

The left sidebar lists discovered Workflows/Entities (filterable; collapsible
to full-width canvas). Clicking an item fetches it directly from the server
(`GET /api/workflow/:name` / `GET /api/entity/:name`, loopback-gated and
name-allowlisted — no new write surface) — this works independently of
Claude. A workflow opens with **Graph | JSON** tabs (JSON is the read-only
Monaco pane, a *separate* pane from the graph's own JSON tab, which stays
read-only-content-with-a-warning as before); an entity opens with **Tree |
JSON** tabs (both read-only). Claude's `show_workflow` always overrides
whatever the human is currently browsing — the visual channel stays one-way
for content, browsable in both directions for navigation.

## Register with Claude Code

**Consumers** — no clone, no build. Add this to `.mcp.json` at your project root
(or run `claude mcp add model-editor -- npx -y @cyoda/model-editor-mcp@0.3.0 --project .`):

```json
{
  "mcpServers": {
    "model-editor": {
      "command": "npx",
      "args": ["-y", "@cyoda/model-editor-mcp@0.3.0", "--project", "."]
    }
  }
}
```

The default discovery globs (see **Discovery model** above) cover the
conventional `models/` layout, so most projects need no glob flags. If your
models live elsewhere, pass `--workflow-globs`/`--entity-globs` — but beware
that clients launching the command through a shell will expand unquoted `**`
patterns into file paths once files match, which crashes startup; prefer
`configure_project` mid-session, or make sure the values stay quoted.

Claude Code starts it over stdio the next time you run it there. Watch stderr for
`model-editor-mcp: http://127.0.0.1:<port>/?token=<hex>` and open that URL to see
the live editor.

**Contributors (monorepo dev)** — run the local build instead of the published
package, using `.mcp.json.example` (which points `node` at `dist/index.js`):

```bash
pnpm --filter @cyoda/model-editor-mcp build
cp apps/model-editor-mcp/.mcp.json.example .mcp.json
```

## Port & token

The **port** is deterministic per project path (an FNV-1a hash of the
absolute project root, mapped into the dynamic/private range) — the same
project always tries to bind the same port, stable across restarts, so it's
bookmarkable. The **token**, in contrast, is a fresh random value generated
every process start and is never persisted — restarting the server always
invalidates the previous token. If you restart the server (or just lose
track of the stderr line), don't reuse an old URL: call `connection_info()`
to get the current `{ url, port }`. This is the recovery path after any
restart. Only `connection_info` and `get_project` ever return the URL in a
tool result — no other tool response carries it.

## Develop
- `pnpm --filter @cyoda/model-editor-mcp build` — compile the server (`dist/`) and the web bundle (`web/dist/`)
- `pnpm --filter @cyoda/model-editor-mcp test` — unit/integration (vitest, node + happy-dom)
- `pnpm --filter @cyoda/model-editor-mcp test:e2e` — headless-chromium render smoke (build first)
