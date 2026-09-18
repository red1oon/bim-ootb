-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT
-- §GEOREF self-heal — bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §3.3.
-- Witness: W-GEOREF-EXTRACT (bim-compiler scripts/witness_georef_extract.py) for the extraction,
-- W-SUN-COMPASS (viewer/tests/witness_sun_compass.js) for what reads these rows.
--
-- WHY THIS FILE EXISTS: every shipped *_extracted.db predates the georef fix. Checked directly on
-- 2026-09-18: Hospital_extracted.db's project_metadata holds building_name and import_date and
-- NOTHING ELSE — no true_north_angle row at all. Meanwhile viewer/sitecam.js:81 and
-- viewer/walk.js:275 have been applying a real rotation to `window._trueNorthAngle` on every
-- site-camera open and every walk-mode GPS fix, and it has been 0 on every building, always.
-- Re-extracting and re-uploading the binary is the permanent fix; this is the rows reaching a live
-- user today, through the mechanism this project already uses for exactly this
-- (CLAUDE.md "DB CHANGES = MIGRATION SCRIPT + SELF-HEAL LOADER", viewer/scene.js
-- A._applyPendingPatch). No loader change is needed — the file being here IS the wiring.
--
-- NOTHING HERE IS COMPUTED OR ESTIMATED. Every value is what
-- DAGCompiler/python/extractIFCtoDB.py `extract_georef` returns when run on the source IFC named
-- below, and the provenance of that pairing was verified by GUID match, not by filename.
--
-- SOURCE: internal/sources/Ifc4_SampleHouse.ifc
-- PROVENANCE: 30/30 randomly sampled elements_meta.guid values from the shipped DB are present
-- verbatim in this IFC. Single-file model, so there are no sibling files to disagree with it.
--
-- ⚠ INSERT OR REPLACE, deliberately: the point is to overwrite an absent or stubbed value. When
-- this building is re-extracted and re-uploaded with the fixed extractor, refresh or delete this
-- file rather than leaving it to re-stamp values from an older source.
CREATE TABLE IF NOT EXISTS project_metadata (key TEXT PRIMARY KEY, value TEXT);
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('true_north_angle','0.000000');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('true_north_source','ifc_truenorth');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_latitude','51.50015259');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_longitude','-0.12623620');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_elevation_m','0.0000');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_latlong_source','ifc_site');
