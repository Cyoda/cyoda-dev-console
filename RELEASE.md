# Release Process

Cyoda Dev Console ships as: a notarized macOS DMG (installed via the Homebrew cask in `cyoda/homebrew-cyoda`), a Linux AppImage (GitHub Releases + `curl|sh` installer), and build-from-source on Windows. One tagged workflow produces everything.

## How a release flows

1. Bump `version` in `apps/dev-console/src-tauri/tauri.conf.json` (SemVer) and commit.
2. Push a tag `vX.Y.Z` (or `vX.Y.Z-rc.N` to rehearse without touching Homebrew).
3. `release.yml` runs: `guard` (tag must equal the config version) → `create-release` (one draft) → build macOS ×2 (signed+notarized DMG), Linux ×2 (AppImage), Windows (compile gate, no upload) → `checksums` (SHA256SUMS + installer + icon, then un-draft) → `publish-cask` (validate notarization, regenerate the cask, commit it to the tap as `cyoda-release-bot`). Prerelease tags skip `publish-cask`.

## Rehearsing without cutting a release

Trigger the workflow manually (build-only, nothing published, no version consumed):

```bash
gh workflow run Release --ref <your-branch>
```

## Prerequisites (one-time)

- **Apple:** Developer ID Application cert + app-specific password. Repo secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.
- **Homebrew tap:** see `docs/release-infra-runbook.md` (create `cyoda/homebrew-cyoda`, install the release-bot App, set `vars.HOMEBREW_TAP_APP_ID` + `secrets.HOMEBREW_TAP_APP_KEY`).

## Install (end users)

- **macOS:** `brew install --cask cyoda/cyoda/cyoda-dev-console`
- **Linux:** `curl --proto '=https' --tlsv1.2 -fsSL https://github.com/cyoda/cyoda-dev-console/releases/latest/download/install.sh | sh`
  (or download the `.AppImage` from the Releases page; `chmod +x` and run.)
- **Windows:** build from source (below).

## Build from source on Windows

No prebuilt Windows binaries are published. Requirements: [Rust](https://rustup.rs) (the repo pins the toolchain via `rust-toolchain.toml`), Node 22, pnpm 11, and the **MSVC C++ Build Tools** (Visual Studio "Desktop development with C++").

```powershell
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm --filter dev-console tauri:build
```

The bundle lands under `apps/dev-console/src-tauri/target/release/bundle/`. The resulting installer/exe is **unsigned**, so Windows SmartScreen shows an "unknown publisher" warning — choose **More info → Run anyway**.

## Post-release verification

- macOS: `brew install --cask cyoda/cyoda/cyoda-dev-console` on a clean account; app launches with no Gatekeeper warning; `spctl --assess --type execute --verbose "Cyoda Dev Console.app"` → "source=Notarized Developer ID".
- Linux (both arches): installer round-trip — install → menu entry appears → re-run upgrades cleanly → a tampered file fails the checksum and aborts.
- Cask commit landed in the tap with author `cyoda-release-bot` and correct per-arch SHAs; a prerelease tag did **not** touch the tap.

## No in-app auto-update

Updates are delivered via `brew upgrade` (macOS) or re-running the Linux installer. See `docs/archive/2026-05-30-specs.md` §5.3.

---

## model-editor-mcp (npm)

The `@cyoda/model-editor-mcp` MCP server ships to public npm independently of the
desktop app, on its own `mcp-v*` tags via `.github/workflows/release-mcp.yml`.

### How an MCP release flows
1. Bump `version` in `apps/model-editor-mcp/package.json` (SemVer; a prerelease
   carries the suffix literally, e.g. `0.1.0-rc.1`), commit.
   For a **stable** release, also bump the pinned `@cyoda/model-editor-mcp@X.Y.Z`
   in the `.mcp.json` examples in `README.md` and `apps/model-editor-mcp/README.md`
   (`grep -rn 'model-editor-mcp@' README.md apps/model-editor-mcp/README.md`);
   prereleases don't touch the READMEs.
2. Push a tag `mcp-vX.Y.Z` (or `mcp-vX.Y.Z-rc.N`).
3. `release-mcp.yml` runs: `guard` (tag == package.json version, suffix included)
   → build workspace deps → esbuild-bundle the server + Vite-build `web/dist`
   → `pnpm publish` with provenance. A stable version publishes to the `latest`
   dist-tag; a prerelease publishes to `next`.

### Dist-tags
`latest` is the newest stable release. `next` is the newest release of any kind,
so it is **never older than `latest`**: a prerelease moves only `next`, and a
stable release moves `latest` **and** `next` (the workflow's "Point `next` at the
new stable version" step). `npx @cyoda/model-editor-mcp@next` is therefore always
the most recent build, never a superseded rc.

### Rehearsing without publishing
Trigger it manually (**Actions → Release MCP → Run workflow**) on any branch: it
builds and runs `scripts/check-mcp-pack.sh` (pack + shape assertions) and
**publishes nothing, consumes no version**. This is the primary gate — npm
versions are immutable.

### Prerequisites (one-time)
- **`NPM_TOKEN`** repo secret: a granular npm access token with **read+write on the
  `@cyoda` scope** (scope-level so the first publish can create the package). If
  npm rejects the very first publish of the brand-new name, use a classic
  Automation token for that one publish, then switch back. Provenance additionally
  requires this repo stay **public**.

### First release
The **first-ever** publish must be a stable `0.1.0` (not an rc), so a `latest`
dist-tag exists — otherwise a bare `npx @cyoda/model-editor-mcp` has nothing to
resolve. Use rc→`next` only for later versions.

### Bad-publish recovery
npm versions can't be overwritten and `unpublish` is restricted (72h window;
blocked once anything depends on it). Recover with
`npm deprecate @cyoda/model-editor-mcp@x.y.z "reason"` **plus a patch release** —
never rely on unpublish.

## Coordinated release (desktop + MCP together)

A "release" is an event, not one trigger. To cut both artifacts:
1. Bump `apps/dev-console/src-tauri/tauri.conf.json` `.version` **and**
   `apps/model-editor-mcp/package.json` `.version` (independent SemVers), commit.
2. Push both tags: `git push origin vX.Y.Z mcp-vA.B.C`.
3. `release.yml` and `release-mcp.yml` run independently and in parallel; neither
   gates the other. A failure in one does not roll back the other — re-run the
   failed side (the two are not a single transaction). The desktop half needs the
   Apple secrets provisioned (see Prerequisites above); the MCP half does not.
