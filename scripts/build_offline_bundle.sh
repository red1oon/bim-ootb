#!/usr/bin/env bash
# Implementing docs/internal/BIM_OOTB_ASSESSMENT_2026-08-06.md §0 "offline variant" plan.
#
# Packages the core app (viewer + ERP kernel + shared libs) as a zip a user can unzip and run
# with zero network — IFC upload, viewing, BOM/cost/schedule and the ERP fold are all client-side
# already (sql.js + web-ifc run in-browser), so this needs no new engine work, only packaging.
#
# EXCLUDED on purpose: modeller/ (LFS-heavy, ~246MB) and buildings/ (~74MB) — the 30 preloaded
# showcase buildings are fetched from OCI object storage at runtime (viewer/config.js), not bundled
# in this repo, so they are NOT available offline via this zip regardless of what's included here.
# A user's own uploaded IFC works fully offline; the showcase buildings do not. Say so in the
# launcher README rather than silently shipping a "complete" bundle that isn't.
#
# Not minified (unlike the live Pages deploy) — ships the same readable source the repo keeps,
# consistent with deploy-pages.yml's own "repo source in git is never changed" ethos.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/bim-ootb-offline.zip}"
STAGE="$(mktemp -d)"
BUNDLE="$STAGE/bim-ootb"
mkdir -p "$BUNDLE"

# Core runtime set — everything index.html/viewer.html/erp.html actually load.
cp "$ROOT/index.html" "$ROOT/index2.html" "$ROOT/manifest.json" "$BUNDLE/"
cp -R "$ROOT/viewer" "$ROOT/erp" "$ROOT/common" "$ROOT/assets" "$BUNDLE/"

# Dev-only fixtures inside erp/ that aren't loaded at runtime — trim, don't guess further than this.
rm -rf "$BUNDLE/erp/tests" "$BUNDLE/viewer/tests"

# Launcher — service workers and ES modules refuse to run from file://, so this is not optional.
cat > "$BUNDLE/start-offline.sh" <<'EOF'
#!/usr/bin/env bash
# Serves this folder on localhost so the browser treats it as a real origin (file:// blocks
# ES-module imports and service-worker registration — this is a hard browser restriction,
# not a BIM OOTB limitation).
cd "$(dirname "${BASH_SOURCE[0]}")"
PORT="${1:-8080}"
echo "BIM OOTB (offline) — open http://localhost:$PORT in your browser. Ctrl+C to stop."
if command -v python3 >/dev/null 2>&1; then exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then exec python -m SimpleHTTPServer "$PORT"
elif command -v npx >/dev/null 2>&1; then exec npx --yes http-server -p "$PORT"
else echo "No python3/python/npx found — install one, or run any static file server against this folder on any port."; exit 1
fi
EOF
chmod +x "$BUNDLE/start-offline.sh"

cat > "$BUNDLE/start-offline.bat" <<'EOF'
@echo off
cd /d "%~dp0"
echo BIM OOTB (offline) - open http://localhost:8080 in your browser. Ctrl+C to stop.
where python >nul 2>nul && (python -m http.server 8080) || (echo Install Python 3, or run any static file server against this folder.)
EOF

cat > "$BUNDLE/OFFLINE_README.md" <<'EOF'
# BIM OOTB — offline bundle

Run: `./start-offline.sh` (Mac/Linux) or double-click `start-offline.bat` (Windows), then open
http://localhost:8080 — do NOT open index.html directly by double-click; browsers block the ES
modules and service worker this app needs when loaded from a `file://` path, so it needs a local
server, not a network connection. This one-line server is not optional and is not a workaround —
any static file server (`npx serve`, VS Code Live Server, etc.) works the same way.

**What works with zero network, ever:** open an IFC file you already have — parsing (web-ifc),
the BOM/cost/schedule compute, and the ERP kernel fold all run in-browser (sql.js WASM). Nothing
about that path calls out.

**What needs network the first time:** the 30 preloaded showcase buildings (Hospital, LTU_AHouse,
Duplex, ...) are fetched from Oracle Cloud object storage on first open — they are not bundled in
this zip. Once you've opened one while online, the PWA service worker caches it for offline reuse
on that device; a building you've never opened stays unavailable offline.

Full source, the Modeller (DAGeVu), and the complete building library: https://github.com/red1oon/bim-ootb
Live version, always current: https://red1oon.github.io/bim-ootb/
EOF

( cd "$STAGE" && zip -rq "$OUT" bim-ootb )
rm -rf "$STAGE"
SIZE=$(du -h "$OUT" | cut -f1)
echo "§OFFLINE_BUNDLE out=$OUT size=$SIZE"
