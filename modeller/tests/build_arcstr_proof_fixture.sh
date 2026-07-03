#!/usr/bin/env bash
# Rebuild Terminal_arcstr_proof.db — §STR-INTO-ARC fixture: the ARC shell (1557) + 158 STR IfcColumn + 432 STR IfcBeam
# (+geometry), so the modeller lays real ARC meshes, has the columns to walk the STR skeleton onto the emergent grid,
# AND carries real beams = the MEASURED girder cross-section (§8E-1b) + a render-coherence oracle (count/span).
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"; M="$DIR/Terminal_meta.db"; G="$DIR/Terminal_geo.db"; F="$DIR/Terminal_arcstr_proof.db"
[ -f "$M" ] && [ -f "$G" ] || { echo "need $M and $G (LFS)"; exit 1; }
rm -f "$F"
sqlite3 "$F" <<SQL
ATTACH '$M' AS m; ATTACH '$G' AS g;
CREATE TABLE elements_meta AS SELECT * FROM m.elements_meta WHERE 0;
CREATE TABLE element_transforms AS SELECT * FROM m.element_transforms WHERE 0;
CREATE TABLE element_instances AS SELECT * FROM m.element_instances WHERE 0;
CREATE TABLE component_geometries AS SELECT * FROM g.component_geometries WHERE 0;
CREATE TEMP TABLE pick AS
  SELECT guid FROM m.elements_meta WHERE discipline='ARC' AND ifc_class IN
    ('IfcWall','IfcSlab','IfcDoor','IfcWindow','IfcCovering','IfcStairFlight','IfcRailing')
  UNION SELECT guid FROM m.elements_meta WHERE discipline='STR' AND ifc_class IN ('IfcColumn','IfcBeam');
INSERT INTO elements_meta      SELECT * FROM m.elements_meta      WHERE guid IN (SELECT guid FROM pick);
INSERT INTO element_transforms SELECT * FROM m.element_transforms WHERE guid IN (SELECT guid FROM pick);
INSERT INTO element_instances  SELECT * FROM m.element_instances  WHERE guid IN (SELECT guid FROM pick);
INSERT INTO component_geometries SELECT DISTINCT cg.* FROM g.component_geometries cg
  WHERE cg.geometry_hash IN (SELECT i.geometry_hash FROM m.element_instances i WHERE i.guid IN (SELECT guid FROM pick));
SQL
echo "built $F ($(du -h "$F"|cut -f1))"
