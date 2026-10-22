#!/usr/bin/env bash
# ⚠ DO NOT REMOVE — dxf2bim/ copy script (prompts/DXF2BIM_MODELLER_LANE.md §L3.3). Copies the BIMCompiler DXF2BIM reader modules
# VERBATIM from one commit (git show, never the working tree) and rewrites SOURCE.md with the commit + sha256 of each file.
# Usage: modeller/dxf2bim/sync.sh <BIMCompiler repo dir> <commit>. Read SOURCE.md after the run.
set -euo pipefail
# RETIRED 2026-10-23 (owner): bim-ootb is the source of these modules (SOURCE.md). This script copies BIMCompiler -> here and would overwrite newer code.
if [ "${FORCE_OLD_SYNC:-}" != "1" ]; then echo "sync.sh REFUSED: bim-ootb is the source of dxf2bim/ (SOURCE.md); set FORCE_OLD_SYNC=1 only to restore an old copy on purpose" >&2; exit 2; fi
BC="$1"; REV="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"; MOD="$(dirname "$HERE")"
FULL="$(git -C "$BC" rev-parse --short=9 "$REV")"; SUBJ="$(git -C "$BC" log -1 --format=%s "$REV" | cut -c1-90)"
FILES="dxf2bim dxf2elev dxf2marks dxf2mesh dxf2types dxf2shell dxf2shell_config dxf2qualify std2d std2d_geom std2d_dxf std2d_marks std2d_scopes polygon-clipping"
{
  echo "# dxf2bim/ — verbatim copies of the BIMCompiler DXF2BIM reader modules"
  echo
  echo "Copied, never forked (prompts/DXF2BIM_MODELLER_LANE.md §L3, §L3.3). Do not edit here: change BIMCompiler, then run \`modeller/dxf2bim/sync.sh <BIMCompiler> <commit>\`."
  echo
  echo "Commit: \`$FULL\` — $SUBJ"
  echo
  echo "| file | BIMCompiler source | sha256 |"
  echo "|---|---|---|"
  for f in $FILES; do
    git -C "$BC" show "$REV:deploy/dev/$f.js" > "$HERE/$f.js"
    echo "| dxf2bim/$f.js | deploy/dev/$f.js | $(sha256sum "$HERE/$f.js" | cut -c1-64) |"
  done
  git -C "$BC" show "$REV:scripts/ifc_extract_core.js" > "$HERE/ifc_extract_core.js"
  echo "| dxf2bim/ifc_extract_core.js | scripts/ifc_extract_core.js (the Node extractor body; one extractor, two hosts) | $(sha256sum "$HERE/ifc_extract_core.js" | cut -c1-64) |"
  git -C "$BC" show "$REV:deploy/dev/dxf-parser.js" > "$MOD/lib/dxf-parser.js"
  echo "| lib/dxf-parser.js | deploy/dev/dxf-parser.js (gdsestimating/dxf-parser, MIT, minified) | $(sha256sum "$MOD/lib/dxf-parser.js" | cut -c1-64) |"
  echo
  echo "Check: \`git -C <BIMCompiler> show $FULL:deploy/dev/<file> | sha256sum\` equals the column above."
} > "$HERE/SOURCE.md.tmp"
mv "$HERE/SOURCE.md.tmp" "$HERE/SOURCE.md"
echo "synced $FULL: $FILES dxf-parser"
