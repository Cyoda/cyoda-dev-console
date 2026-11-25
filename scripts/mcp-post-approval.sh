#!/usr/bin/env bash
# Run by a maintainer AFTER approving a staged @cyoda/model-editor-mcp version on
# npmjs.com (release-mcp.yml only *stages* it — see RELEASE.md). Does the two
# steps CI can no longer do under staged trusted publishing:
#
#   1. Assert the now-live version carries a provenance attestation. npm can
#      exit 0 when provenance was requested but not attached (how 0.2.0 shipped
#      unattested), so this is checked rather than assumed.
#   2. For a stable version, point `next` at it, so `next` is never older than
#      `latest` (0.2.1-rc.1 once outlived 0.3.0). CI can't: the trusted publisher
#      doesn't allow `npm dist-tag`. Uses your own npm login (2FA may prompt).
#
# Usage: scripts/mcp-post-approval.sh [version]   (default: apps/model-editor-mcp/package.json)
set -euo pipefail

pkg="@cyoda/model-editor-mcp"
version="${1:-$(jq -r .version apps/model-editor-mcp/package.json)}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
  || { echo "error: '${version}' is not a SemVer version" >&2; exit 1; }

# The registry takes minutes, not seconds, to expose an approved version (0.3.0
# was invisible for ~5 min). Poll for up to 10 min, bypassing npm's cache.
attempts=30
for i in $(seq 1 "$attempts"); do
  if npm view "${pkg}@${version}" version --prefer-online 2>/dev/null | grep -qx "$version"; then
    break
  fi
  if [[ "$i" -eq "$attempts" ]]; then
    echo "error: ${pkg}@${version} is not live — was the staged version approved?" >&2
    exit 1
  fi
  echo "${version} not visible yet (attempt ${i}/${attempts}) — retrying in 20s"
  sleep 20
done
echo "live: ${pkg}@${version}"

if ! npm view "${pkg}@${version}" dist.attestations.url --prefer-online 2>/dev/null | grep -q .; then
  echo "error: ${pkg}@${version} is live but has no provenance attestation" >&2
  exit 1
fi
echo "provenance-ok: ${version}"

case "$version" in
  *-*) echo "prerelease: staged straight onto 'next'; no dist-tag move needed" ;;
  *)
    if [[ "$(npm view "$pkg" dist-tags.next --prefer-online 2>/dev/null)" == "$version" ]]; then
      echo "'next' already points at ${version}"
    else
      npm dist-tag add "${pkg}@${version}" next
    fi
    ;;
esac
npm dist-tag ls "$pkg"
