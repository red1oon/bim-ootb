#!/usr/bin/env bash
# Build Terminal_plates_proof.db — §8E-2a fixture: the 33,324 IfcPlate space-frame as TRANSFORMS ONLY (centres+bbox,
# NO geometry). This is the ORACLE cloud the tessellation walker measures (unit/domain/density) + grades count against.
# We deliberately carry NO component_geometries: the canopy is rendered GENERATIVELY (unit boxes), never the verbatim
# 33K meshes (that is the DEFERRED 261MB range-stream). Small + focused.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"; M="$DIR/Terminal_meta.db"; F="$DIR/Terminal_plates_proof.db"
[ -f "$M" ] || { echo "need $M (LFS)"; exit 1; }
rm -f "$F"
sqlite3 "$F" <<SQL
ATTACH '$M' AS m;
CREATE TABLE elements_meta AS SELECT * FROM m.elements_meta WHERE 0;
CREATE TABLE element_transforms AS SELECT * FROM m.element_transforms WHERE 0;
INSERT INTO elements_meta      SELECT * FROM m.elements_meta      WHERE ifc_class='IfcPlate';
INSERT INTO element_transforms SELECT t.* FROM m.element_transforms t
  WHERE t.guid IN (SELECT guid FROM m.elements_meta WHERE ifc_class='IfcPlate');
SQL
echo "built $F ($(du -h "$F"|cut -f1)) plates=$(sqlite3 "$F" 'SELECT count(*) FROM elements_meta')"
