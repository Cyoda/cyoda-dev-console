# Cyoda Dev Console — Release Setup Runbook (hand-off)

**Audience:** the engineer completing first-release setup. Self-contained — every step is actionable from a fresh checkout; nothing assumes resources that already exist on another person's machine.

**Decision in effect:** macOS is **signed + notarized** with an Apple Developer ID (a GUI `.app` in a Homebrew cask is otherwise Gatekeeper-blocked on launch). The `APPLE_*` credentials are stored as **GitHub org-level secrets** so the same cert serves cyoda-dev-console now and cyoda-go later.

---

## 0. Current state (what's already done)

- The release tooling is merged to the `staging` branch of `Cyoda/cyoda-dev-console` (the default branch). The repo lives under the **`Cyoda`** org.
- `release.yml` is implemented and **build-validated on real runners** via build-only `workflow_dispatch` rehearsals: macOS x64/arm64 compile + bundle the `.app`, Linux x64/arm64 build the AppImage, Windows builds nsis/msi, and the publish-path jobs correctly skip on dispatch.
- **✅ SHIPPED — v0.1.0 released 2026-07-13.** The full runbook below was executed: `APPLE_*` org secrets, the `Cyoda/homebrew-cyoda` tap, the `cyoda-release-bot` App, SHA-pinned actions, and the first tagged release (`v0.1.0`). The GitHub Release carries the 2 DMGs + 2 AppImages + `SHA256SUMS` + `install.sh` + icon, and `Casks/cyoda-dev-console.rb` was committed to the tap by `cyoda-release-bot` with matching per-arch SHAs. DMGs verify `Notarized Developer ID`.
- **Three workflow requirements surfaced only on the first *real* tag** (the build-only `workflow_dispatch` rehearsal can't exercise them, because it never uploads or publishes). All are now fixed in `release.yml`; keep them in mind for cyoda-go (§7):
  1. **`GITHUB_TOKEN` must be in the `env` of every uploading `tauri-action` step** (the ones with `releaseId`) — else the upload fails `GITHUB_TOKEN is required` (#49).
  2. **The asset-rename input is `releaseAssetNamePattern`, not `assetNamePattern`** — and its `[arch]` placeholder yields tauri's native token (`x64` for the intel DMG), so the DMG arch is driven from a matrix `arch` field to get the `x86_64` the cask/`publish-cask` expect; Linux keeps `[arch]` (→ `amd64`/`aarch64`, what `install.sh` wants) (#50).
  3. **tauri notarizes + staples only the `.app`, not the DMG.** A separate `notarytool submit` + `stapler staple` step notarizes the distributed disk image, so `publish-cask`'s `stapler validate` passes and direct DMG downloads are Gatekeeper-clean (#51).

## Prerequisites / access you need

- **Apple Developer Program** membership for the org, and an **Account Holder or Admin** role on that team (only those roles can create a *Developer ID Application* certificate).
- A **Mac** with Xcode (or at least Keychain Access) — used once to create and export the certificate. This is the colleague's own Mac; nothing is reused from anyone else.
- **GitHub org owner/admin** on `Cyoda` (to set org secrets/variables, create the tap repo, and install the GitHub App).
- `gh` CLI authenticated as that admin: `gh auth login` then `gh auth status`.
- `git` and a clone of `Cyoda/cyoda-dev-console`.

---

## 1. Apple Developer ID credentials → six org-level secrets

This produces the six `APPLE_*` values the macOS jobs consume, stored as **org secrets** scoped to the relevant repos.

### 1.1 Confirm the Apple Developer Program membership
At [developer.apple.com](https://developer.apple.com) → **Membership**, note the **Team ID** (10 chars, e.g. `ABCDE12345`). This is `APPLE_TEAM_ID`.

### 1.2 Create a Developer ID Application certificate
On the Mac, **Xcode → Settings → Accounts →** select the team **→ Manage Certificates → "+" → Developer ID Application**.
(Must be *Developer ID Application* — not "Apple Distribution" / "Mac App Distribution", which are App-Store-only and will not pass Gatekeeper for a direct download.)

### 1.3 Export the certificate as `.p12`
**Keychain Access →** find the new `Developer ID Application: <Org> (TEAMID)` entry (with its private key) **→ right-click → Export** → save `DeveloperID.p12` → set an export password. That password is **`APPLE_CERTIFICATE_PASSWORD`**.

### 1.4 Base64-encode the certificate
```bash
base64 -i DeveloperID.p12 -o DeveloperID.p12.b64   # macOS base64 syntax
# the contents of DeveloperID.p12.b64 is APPLE_CERTIFICATE
```

### 1.5 Read the signing identity string
```bash
security find-identity -v -p codesigning
# → "Developer ID Application: Cyoda Ltd (ABCDE12345)"
```
That full quoted string is **`APPLE_SIGNING_IDENTITY`** (must match exactly, including the `(TEAMID)`).

### 1.6 Create an app-specific password for notarization
At [appleid.apple.com](https://appleid.apple.com) → **Sign-In and Security → App-Specific Passwords →** generate one labelled `cyoda-dev-console-ci`. The generated value is **`APPLE_PASSWORD`** (this is *not* the Apple ID login password). The Apple ID email itself is **`APPLE_ID`**.

### 1.7 Store all six as org-level secrets
Scope them to the repos that need them (dev-console now; add cyoda-go when its notarization work happens). Run from any directory:

```bash
ORG=Cyoda
REPOS="cyoda-dev-console"          # later: "cyoda-dev-console,cyoda-go"

gh secret set APPLE_CERTIFICATE          --org "$ORG" --visibility selected --repos "$REPOS" < DeveloperID.p12.b64
gh secret set APPLE_CERTIFICATE_PASSWORD --org "$ORG" --visibility selected --repos "$REPOS"   # paste when prompted
gh secret set APPLE_SIGNING_IDENTITY     --org "$ORG" --visibility selected --repos "$REPOS"   # the full "Developer ID Application: …" string
gh secret set APPLE_ID                   --org "$ORG" --visibility selected --repos "$REPOS"   # Apple ID email
gh secret set APPLE_PASSWORD             --org "$ORG" --visibility selected --repos "$REPOS"   # app-specific password
gh secret set APPLE_TEAM_ID              --org "$ORG" --visibility selected --repos "$REPOS"   # 10-char Team ID
```

Then **delete the local cert files** — they should not linger:
```bash
rm -f DeveloperID.p12 DeveloperID.p12.b64
```

> The workflow reads these as `secrets.APPLE_*`; org secrets and repo secrets both resolve through `secrets.` identically.

---

## 2. Create the consolidated Homebrew tap

`Cyoda/homebrew-cyoda` is the new strategic tap that **replaces** the existing `Cyoda/homebrew-cyoda-go`. Create it fresh now (for cyoda-dev-console); the old `homebrew-cyoda-go` stays in place until cyoda-go is migrated in a later session (§7). Create an empty repo — the cask is **generated by CI**, do not hand-write it.

```bash
gh repo create Cyoda/homebrew-cyoda --public \
  --description "Homebrew tap for Cyoda (formulae + casks)"
```

Seed a README so the tap page is meaningful (the `Casks/` directory is created automatically on the first release push):

```bash
tmp="$(mktemp -d)"; git clone https://github.com/Cyoda/homebrew-cyoda "$tmp"
cat > "$tmp/README.md" <<'MD'
# homebrew-cyoda

Homebrew tap for Cyoda.

- Desktop apps (casks):
  ```sh
  brew install --cask cyoda/cyoda/cyoda-dev-console
  ```
- CLI (formula, migration pending): `cyoda-go`.

Layout: `Formula/` (CLI formulae) · `Casks/` (desktop apps). Cask/formula files
are published automatically by each product's release pipeline.
MD
( cd "$tmp" && git add README.md && git commit -m "chore: tap README" && git push )
rm -rf "$tmp"
```

Target layout once both products publish:
```
Formula/cyoda.rb            # cyoda-go (added later, separate session)
Casks/cyoda-dev-console.rb  # auto-committed by this repo's release.yml
README.md
```

> The install command `brew install --cask cyoda/cyoda/cyoda-dev-console` is not a typo: it is `<org>/<tap-suffix>/<cask>` — the tap `Cyoda/homebrew-cyoda` shortens to `cyoda/cyoda`, and `cyoda-dev-console` is the cask token.

---

## 3. Create the release-bot GitHub App

The cask is committed to the tap by a short-lived token minted from a GitHub App, not a personal token. Create a **new** strategic app named **`cyoda-release-bot`** for the consolidated tap. (There is an existing `cyoda-go-release-bot` app used by cyoda-go for the old `homebrew-cyoda-go` tap — leave it alone; it stays until cyoda-go migrates to the new app in §7.)

### 3.1 Create the app
`Cyoda` org → **Settings → Developer settings → GitHub Apps → New GitHub App**:
- **Name:** `cyoda-release-bot` (must be globally unique across all GitHub Apps; if taken, add a short suffix and use that name everywhere below).
- **Homepage URL:** `https://github.com/Cyoda` (any valid URL).
- **Webhook:** uncheck **Active** (no webhook needed).
- **Repository permissions → Contents: Read and write** — this is the only permission required.
- **Where can this app be installed?:** **Only on this account.**
- Click **Create**, then note the numeric **App ID** at the top, and **Generate a private key** — download the `.pem`.

### 3.2 Install it on the tap
On the app's page → **Install App** → install on the `Cyoda` account, **Only select repositories → `homebrew-cyoda`** (the tap from §2), with Contents: Read and write. Do **not** install org-wide. (The workflow mints the token with `owner: cyoda`, `repositories: homebrew-cyoda`.)

### 3.3 Store the token credentials
The App ID is not sensitive (a **variable**); the key is a **secret**. Org-level so cyoda-go can share them after its migration:

```bash
ORG=Cyoda
REPOS="cyoda-dev-console"          # later: "cyoda-dev-console,cyoda-go"

gh variable set HOMEBREW_TAP_APP_ID --org "$ORG" --visibility selected --repos "$REPOS" --body "<APP_ID_NUMBER>"
gh secret   set HOMEBREW_TAP_APP_KEY --org "$ORG" --visibility selected --repos "$REPOS" < app-private-key.pem
rm -f app-private-key.pem
```

---

## 4. Harden the workflow: pin sensitive actions to commit SHAs

> **Done for v0.1.0** (#48). Recorded here for future re-pinning when the actions are bumped.

Pin to immutable SHAs the action that **mints the tap token** (`actions/create-github-app-token`, used by `publish-cask`) and, as defense-in-depth, `actions/github-script` (used by `create-release`). The remaining build actions can stay on major tags; Dependabot keeps them current. Do this as a PR to `staging`.

Note the majors actually in the workflow are **`create-github-app-token@v3`** and **`github-script@v9`** (newer than the `v1`/`v7` an earlier draft of this runbook named) — resolve the SHA for whichever major is currently in `release.yml`:

```bash
git clone https://github.com/Cyoda/cyoda-dev-console && cd cyoda-dev-console
git checkout -b chore/pin-privileged-actions

# Resolve current SHAs (match the major already used in release.yml):
gh api repos/actions/create-github-app-token/git/ref/tags/v3 --jq .object.sha
gh api repos/actions/github-script/git/ref/tags/v9        --jq .object.sha
```

In `.github/workflows/release.yml`, change:
- `uses: actions/create-github-app-token@v3` → `uses: actions/create-github-app-token@<sha>  # v3`
- `uses: actions/github-script@v9` → `uses: actions/github-script@<sha>  # v9`

Then:
```bash
# (install actionlint if needed: `brew install actionlint`)
actionlint .github/workflows/release.yml
git commit -am "chore(release): pin privileged actions to SHAs"
git push -u origin chore/pin-privileged-actions
gh pr create --base staging --fill && gh pr merge --merge --delete-branch
```

---

## 5. First release — validate, then ship

Each step builds on the last. Stop and fix if any stage is not green.

### 5.1 Re-run the build-only rehearsal (surfaces signing-credential errors)
With the `APPLE_*` secrets in place, a dispatch run drives the macOS **signing/notarization code path** during the bundle step, so an invalid cert, wrong identity, or bad app-specific password fails the build here — a cheap credential smoke-test that consumes no version. **What it does *not* do:** a dispatch run uploads nothing, so there is no artifact to validate, and a green run is *not* proof of a valid notarization ticket. The first **verifiable** notarization checks are the `-rc` DMG (`spctl`, §5.3) and the fail-closed `xcrun stapler validate` inside `publish-cask` (§5.4).

```bash
gh workflow run Release --ref staging
gh run watch "$(gh run list --workflow Release --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId')"
```
**Expect:** all five build legs green — macOS x2 (now through signing), Linux x2, Windows. Publish-path jobs skip (dispatch never publishes).

### 5.2 Bump the version to match the tag
The `guard` job requires the tag base to equal `tauri.conf.json` `.version` (currently `0.1.0`; the tag may add `-rc.N`). For a `0.2.0` release, bump it via a normal PR to `staging`:
```bash
git checkout -b release/v0.2.0
# edit apps/dev-console/src-tauri/tauri.conf.json -> "version": "0.2.0"
git commit -am "chore(release): bump version to 0.2.0"
git push -u origin release/v0.2.0
gh pr create --base staging --fill && gh pr merge --merge --delete-branch
git checkout staging && git pull
```

### 5.3 Cut a release-candidate tag (validates the publish path, tap untouched)
A `-rc` tag builds, signs, notarizes, **uploads** the DMGs + AppImages, writes `SHA256SUMS`, attaches `install.sh` (the `checksums` job attaches the repo's `scripts/install.sh` as a release asset), and un-drafts — but **skips the cask** (prerelease). This is the safe rehearsal of everything except the tap commit. Tag from the merged `staging`:

```bash
git tag v0.2.0-rc.1 && git push origin v0.2.0-rc.1
# watch the run, then verify the artifacts:
```
- **macOS notarization** — download a DMG from the pre-release, **mount it**, copy `Cyoda Dev Console.app` out (it's inside the DMG, not a separate asset), then:
  `spctl --assess --type execute --verbose /path/to/Cyoda\ Dev\ Console.app` → `source=Notarized Developer ID`.
- **Linux installer** — note `latest` does **not** resolve to a prerelease, so use the explicit `-rc` tag URL. `VERSION` is read by the script, so it goes before `sh`:
  ```bash
  curl --proto '=https' --tlsv1.2 -fsSL \
    https://github.com/Cyoda/cyoda-dev-console/releases/download/v0.2.0-rc.1/install.sh | sh
  ```
  Confirm it installs, creates a menu entry, and a re-run upgrades cleanly.

> Note: the **cask publish job runs only on a non-prerelease tag**, so the tap commit itself is first exercised in 5.4. Its logic (`scripts/render-cask.sh`) is unit-tested, the job is the last in the graph, and a failure there does not affect the already-published DMGs/AppImages — it can be re-run after a fix without re-releasing.

### 5.4 Cut the real tag (full release + cask to the tap)
```bash
git tag v0.2.0 && git push origin v0.2.0
```
This runs the whole pipeline including `publish-cask`, which validates notarization, regenerates `Casks/cyoda-dev-console.rb`, and commits it to `Cyoda/homebrew-cyoda` as `cyoda-release-bot`.

---

## 6. Post-release verification checklist

- [ ] GitHub Release `v0.2.0` carries: 2 DMGs, 2 AppImages, `SHA256SUMS`, `install.sh`, `cyoda-dev-console.png`, and **no** `.deb`/`.rpm`/`.app` (the `checksums` job asserts this and exactly 2+2 assets).
- [ ] `Casks/cyoda-dev-console.rb` was committed to the tap by `cyoda-release-bot <noreply@cyoda.com>` with correct per-arch SHAs.
- [ ] On a clean Mac: `brew install --cask cyoda/cyoda/cyoda-dev-console` installs, the app launches with **no Gatekeeper warning**, `spctl --assess` reports Notarized.
- [ ] On Linux (both arches if available): AppImage launches; `install.sh` round-trips (install → menu entry → re-run upgrades → tampered file fails checksum).
- [ ] Windows: build-from-source per `RELEASE.md` produces a launchable app (no published artifact expected).

---

## 7. cyoda-go — high-level outline only (separate session)

To be worked out later, **after** the `APPLE_*` org secrets exist (§1) so the same Developer ID cert is reused at no extra Apple cost. Rough plan, no details here:

1. **Tap consolidation:** retarget cyoda-go's GoReleaser `brews:` from `homebrew-cyoda-go` → `Cyoda/homebrew-cyoda` writing into `Formula/`; dual-publish to the old tap for ≥1 cycle; update its README/install docs to `cyoda/cyoda`. (Track as a coordination issue on `Cyoda/cyoda-go`.) Retire `homebrew-cyoda-go` once migrated.
2. **Switch to the new bot:** point cyoda-go at the new **`cyoda-release-bot`** app (install it on `homebrew-cyoda` if not already) and the org `HOMEBREW_TAP_APP_ID`/`HOMEBREW_TAP_APP_KEY` credentials, replacing its current `cyoda-go-release-bot` app. Retire `cyoda-go-release-bot` once cyoda-go no longer publishes to the old tap.
3. **Optional macOS notarization (removes the one-time "Open Anyway" on its CLI):** add a GoReleaser `notarize` step using the shared Developer ID cert (or App Store Connect API key) so the cross-compiled darwin binaries are signed + notarized. Free fallback if not notarizing: have the darwin leg ad-hoc-sign (build on a macOS runner, or sign in a post-build hook) to stop Apple Silicon refusing an unsigned binary.
   - **Lesson from dev-console (§0):** notarize + **staple the artifact you actually distribute** (the archive/binary users download), not just an inner payload — Gatekeeper's offline first-open check reads the ticket on the downloaded file. dev-console had to add an explicit `notarytool submit` + `stapler staple` on the DMG because tauri stapled only the inner `.app`.

Everything in §7 is a **cyoda-go-repo change**, out of scope for this runbook.
