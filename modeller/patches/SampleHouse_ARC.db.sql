-- ════════════════════════════════════════════════════════
-- ROOM001: carry spatial_structure into SampleHouse_ARC.db (bim-ootb modeller/)
--
-- Root cause: finalize_all_8.js (6068fab) silently shipped SampleHouse_ARC.db with NO spatial_structure
-- table -- its fresh source (an ephemeral /tmp _all.db merge, never preserved) lacked it. Real
-- ROOM_INJECTION_HYBRID.md Task 2/5/6 room data for this building only exists today on the
-- unmerged bim-ootb branch fable/modeller-lod400-livewire (@790b069) -- this script ports it to
-- any local main checkout without needing a binary DB push (LFS-blocked until 2026-08-01).
--
-- Source: fable/modeller-lod400-livewire modeller/SampleHouse_ARC.db, spatial_structure table, 6 rows
-- Apply:  sqlite3 modeller/SampleHouse_ARC.db < prompts/Modeller/DISC_Walker/embed8_scripts/ROOM001_SampleHouse_spatial_structure_carry.sql
-- Verify: sqlite3 modeller/SampleHouse_ARC.db "SELECT COUNT(*) FROM spatial_structure"  -- expect 6
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS spatial_structure (
    guid TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT,
    parent_guid TEXT,
    object_type TEXT,
    predefined_type TEXT,
    -- IfcSpace footprint AABB (room qualification: habitable area = size_x*size_y, height = size_z).
    -- Spaces are non-geometric in the iterator (no body mesh) but DO carry a Representation solid;
    -- we tessellate it once here for the AABB only. NULL for Building/Storey (no own footprint).
    center_x REAL, center_y REAL, center_z REAL,
    size_x REAL, size_y REAL, size_z REAL
); 

DELETE FROM spatial_structure;

INSERT INTO spatial_structure VALUES('1o0c33arXF9AEePDXPKIta','IfcBuilding','',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO spatial_structure VALUES('1o0c33arXF9AEePDYchjCY','IfcBuildingStorey','Ground Floor','1o0c33arXF9AEePDXPKIta',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO spatial_structure VALUES('1o0c33arXF9AEePDYchj2Z','IfcBuildingStorey','Roof','1o0c33arXF9AEePDXPKIta',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO spatial_structure VALUES('3w0zWKm7n8SB1qbfwUzt0U','IfcSpace','1 - Living room','1o0c33arXF9AEePDYchjCY',NULL,'SPACE',-3.08109849347185527,1.58108233348280524,1.25,9.30750000000000987,5.65500000000002067,2.5);
INSERT INTO spatial_structure VALUES('3w0zWKm7n8SB1qbfwUzt0J','IfcSpace','2 - Bedroom','1o0c33arXF9AEePDYchjCY',NULL,'SPACE',3.89390150652816036,2.67733233348279009,1.25,4.45249999999999879,3.46250000000001012,2.5);
INSERT INTO spatial_structure VALUES('3w0zWKm7n8SB1qbfwUzt0G','IfcSpace','3 - Entrance hall','1o0c33arXF9AEePDYchjCY',NULL,'SPACE',3.89390150652815014,-0.125167666517209064,1.25,4.45249999999999968,1.95249999999999035,2.5);
