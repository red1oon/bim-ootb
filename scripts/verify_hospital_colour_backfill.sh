#!/bin/bash
# W-HOSPITAL-COLOUR-BACKFILL verifier — run by scripts/oci_patch_gate.js with $GATE_DB set to the
# served Hospital_meta.db with buildings/patches/Hospital_meta.db.sql applied. Invariants:
#   1. zero empty material_rgba rows outside the 3 geometry-less ghost classes
#   2. the 233 aggregate ghosts (IfcCurtainWall/IfcStair/IfcRoof) remain EXACTLY empty (nothing invented)
set -e
[ -n "$GATE_DB" ] || { echo "GATE_DB unset"; exit 2; }
empty=$(sqlite3 "$GATE_DB" "SELECT COUNT(*) FROM elements_meta WHERE (material_rgba IS NULL OR material_rgba='') AND ifc_class NOT IN ('IfcCurtainWall','IfcStair','IfcRoof')")
ghosts=$(sqlite3 "$GATE_DB" "SELECT COUNT(*) FROM elements_meta WHERE (material_rgba IS NULL OR material_rgba='') AND ifc_class IN ('IfcCurtainWall','IfcStair','IfcRoof')")
echo "§VERIFY_COLOUR_BACKFILL empty_outside_ghosts=$empty ghosts_empty=$ghosts (expect 0 / 233)"
[ "$empty" = "0" ] && [ "$ghosts" = "233" ]
