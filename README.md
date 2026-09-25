# Cyoda Dev Console

A monorepo of local, file-based developer tools for building and reviewing Cyoda
**workflow and entity models** — no running Cyoda environment required. Both tools
are built on the `@cyoda/workflow-*` editor and ship as separate artifacts:

- **Dev Console** — a Tauri 2 **desktop app** for inspecting and correcting
  generated workflow JSON during the build phase, with an optional in-app AI
  assistant.
- **`@cyoda/model-editor-mcp`** — a headless **MCP server** that serves the real
  workflow/entity editor to a browser and is driven by an AI CLI (Claude Code,
  etc.) via `.mcp.json`; the agent edits your model files while you watch the
  diagram update live.

## Install

### Dev Console (desktop app)

- **macOS:** `brew install --cask cyoda/cyoda/cyoda-dev-console`
- **Linux:** `curl --proto '=https' --tlsv1.2 -fsSL https://github.com/cyoda/cyoda-dev-console/releases/latest/download/install.sh | sh`
- **Windows:** build from source — see [RELEASE.md](RELEASE.md#build-from-source-on-windows).

Updates ship via Homebrew (macOS) or re-running the Linux installer. In-app
auto-update is intentionally NOT enabled in this release (see
`docs/archive/2026-05-30-specs.md` §5.3).

### model-editor-mcp (for AI CLIs)

No clone or build — add it to `.mcp.json` at your project root (or run
`claude mcp add model-editor -- npx -y @cyoda/model-editor-mcp@0.3.0 --project .`):

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

Models are discovered under `models/workflow/**/*.json` and
`models/schema/**/*.json` by default. Don't pass `--workflow-globs`/
`--entity-globs` here unless you need different locations — shells expand the
`**` patterns into file paths once matching files exist, which crashes the
server at startup (quote the values if you must override).

Full usage and tool reference: [`apps/model-editor-mcp/README.md`](apps/model-editor-mcp/README.md).

---

## Develop

This is a pnpm workspace holding both apps and every shared package.

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | ≥ 22 | both |
| pnpm | ≥ 11 | both |
| Rust (stable) | via [rustup](https://rustup.rs) | Dev Console (compiles a Rust/Tauri backend) |
| Xcode Command Line Tools | macOS only | Dev Console |

Rust is only required for the desktop app; the MCP server is pure Node. The Tauri
CLI ships as the `@tauri-apps/cli` dev dependency, so `pnpm install` provides it —
no separate `cargo install` needed.

The exact pnpm version is pinned in `packageManager`, so with Corepack enabled you
get it automatically. Two things `pnpm-workspace.yaml` enforces on install: package
build scripts run only for packages listed under `allowBuilds`, and
`minimumReleaseAge` keeps any release younger than 14 days out of the lockfile
(`@cyoda/*` is exempt, since adopting our own releases same-day is routine). Coming
from pnpm 9, the first install asks to purge `node_modules` — that's the expected
one-time relayout, not a problem.

### Commands

```bash
pnpm install          # install workspace dependencies

# Build all packages + apps. packages/*/dist is gitignored, so this is required
# before tauri:dev/tauri:build and again after any pull that touches packages/*.
pnpm build

pnpm test             # run all tests
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit across the workspace

# Dev Console (desktop)
pnpm tauri:dev        # hot-reload desktop app
pnpm tauri:build      # production Vite + Tauri bundle

# model-editor-mcp
pnpm --filter @cyoda/model-editor-mcp build      # server bundle + web assets
pnpm --filter @cyoda/model-editor-mcp test       # unit / integration
pnpm --filter @cyoda/model-editor-mcp test:e2e   # headless-Chromium render smoke (build first)
```

### Verify the packaged build locally (before cutting a release)

`pnpm tauri:dev` is **not** representative of what users run. In dev the frontend
is served from the Vite dev server with **no CSP**; the packaged app serves
bundled assets over the `tauri://` protocol with the `tauri.conf.json` CSP
**enforced** (and Tauri auto-injects nonces/hashes into `script-src`/`style-src`).
So production-only breakage — CSP-refused resources (e.g. Monaco's runtime inline
`<style>` tags, whose `'unsafe-inline'` is nullified by Tauri's injected style
nonce unless `dangerousDisableAssetCspModification` opts `style-src` out), plus
asset-path/custom-protocol/worker-loading issues — **cannot appear under
`tauri:dev`**. Validate against the real packaged conditions without consuming a
release:

```bash
cd apps/dev-console
pnpm tauri build --debug --bundles app   # bundled assets + CSP enforced; DevTools ON; no DMG
open "src-tauri/target/debug/bundle/macos/Cyoda Dev Console.app"
```

- `--debug` keeps **DevTools** enabled (right-click → *Inspect Element*) — check the
  Console for `securitypolicyviolation`. A release `tauri build` disables DevTools.
- `--bundles app` leaves the runnable `.app` in `target/debug/bundle/macos/`. A full
  `tauri build` bundles a DMG and **deletes** the `.app` from that folder (it ends up
  inside the DMG), so `open …/bundle/macos/*.app` would fail.
- This faithfully exercises CSP / bundling / workers / protocol, but the `--debug`
  app is **unsigned and not notarized** — Gatekeeper/notarization is verified
  separately at release time (`spctl` on the release DMGs).

## Monorepo structure

```
apps/
  dev-console/            # Tauri 2 desktop app
  model-editor-mcp/       # headless MCP server (published as @cyoda/model-editor-mcp)
packages/
  console-design-system/  # tokens, typography, primitive components
  console-shell/          # desktop app frame, sidebar, header
  entity-model-viewer/    # read-only entity JSON-tree view
  workflow-editor-host/   # hosts @cyoda/workflow-react; synthesizes editor import payloads
  workflow-file-indexer/  # discovers/indexes workflow files on disk
  workflow-project-model/ # project/session model for the Dev Console
  agent-bridge-contract/  # type-only contract for the app↔editor / AI bridge
```

Everything under `packages/` is internal (`private`, unpublished): the desktop
app compiles them in via Tauri/Vite, and the MCP server bundles them into its
published artifact.

### Workflow editor (`@cyoda/workflow-*`)

Both apps consume the workflow editor as **published packages from the public npm
registry** (`@cyoda/workflow-core`, `-react`, `-viewer`, `-monaco`, `-graph`,
`-layout`), pinned to exact versions. No registry auth is required to install. To
upgrade, bump the versions in the consuming manifests — both apps **and** the
internal `workflow-editor-host` / `workflow-file-indexer` (which must move together
to avoid split versions in the MCP bundle) — and run `pnpm install`.

**Local co-development** (editing the lib in `../cyoda-workflow-editor` against
this repo): point the `@cyoda/workflow-*` deps at the sibling checkout via `pnpm`
overrides or `pnpm link`, build the lib there (`pnpm -r build`), then re-install
here. Keep those local edits out of commits — committed manifests must stay on the
published versions so CI (which has no sibling checkout) installs cleanly.

## BYO AI (Dev Console)

The **desktop** Dev Console has an optional in-app AI Assistant, plus tooling to
set up a separate command-line agent. The whole area is **off by default**, gated
by a single feature flag (see `apps/dev-console/.env.example`):

```
VITE_FEATURE_FLAG_AGENT=true
```

With it on, an **AI Assistant** entry appears in the sidebar. Opening it:

- **Set up AI** (always visible): pick a provider (Anthropic / OpenAI / Gemini,
  Anthropic default), confirm the model, and paste your API key. That's the only
  setup needed — no workflow or profile required first.
- **Assistant chat**: ask about Cyoda workflows; with a workflow open in the
  editor, the Assistant can propose a change and apply it through a diff.
- **Advanced: external agents** (collapsed): the optional **Connect** / **Bundle**
  / **Profiles** tools for wiring up an *external* CLI agent (Claude Code, Gemini
  CLI, Codex) outside the app. Most users can ignore this.

To try it locally, set `VITE_FEATURE_FLAG_AGENT=true` in `apps/dev-console/.env`
and run `pnpm tauri:dev`.

**What leaves your machine.** Everything except the Assistant is fully local. The
Assistant sends the selected workflow JSON and your chat messages to your chosen
LLM provider, using your own API key. Keys are held in the app's **session
storage** (origin-scoped, cleared when the window closes) and are sent only to
that provider — never to Cyoda, never written into a task bundle. LLM calls are
proxied through the Rust backend to a fixed provider host allowlist
(`api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`);
there is no arbitrary outbound network access. Applied workflow edits are always
re-validated and re-serialized through `@cyoda/workflow-core` before being written
to disk.

Model presets are pinned to current provider model IDs and may need bumping as
those APIs evolve (see `apps/dev-console/src/assistant/providers/`).

## Docs

- [RELEASE.md](RELEASE.md) — release process for both artifacts (desktop DMG/AppImage
  + the `@cyoda/model-editor-mcp` npm package) and the coordinated release.
- [`docs/`](docs/) — active design records (`docs/superpowers/specs/`,
  `docs/superpowers/plans/`, `docs/decisions/`) and the release-setup runbook
  (`docs/release-infra-runbook.md`); superseded specs live under `docs/archive/`.
- [`apps/model-editor-mcp/README.md`](apps/model-editor-mcp/README.md) — the MCP
  server's tools, operational model, and usage.
