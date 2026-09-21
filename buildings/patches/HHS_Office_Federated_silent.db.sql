-- ============================================================================================
-- §GEOREF migration — HHS_Office_Federated_silent.db
-- bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §3.3 · MEP_CLASH_REVEAL_MOVIE.md §129.37
-- Mechanism: CLAUDE.md "DB CHANGES = MIGRATION SCRIPT + SELF-HEAL LOADER" — viewer/scene.js
-- A._applyPendingPatch fetches <db dir>/patches/<dbFile>.sql on every load. No loader change is
-- needed; the file being here IS the wiring.
--
-- WHY THIS FILE EXISTS: the georef work of 2026-09-18 (bim-ootb#1751/#1752) patched the
-- *_extracted.db family only, and those patches were written to viewer/buildings/patches/.
-- The FILM bakes do not read either: cli_silent_bake.js serves the repo ROOT, so a bake of
-- buildings/HHS_Office_Federated_silent.db looks for buildings/patches/HHS_Office_Federated_silent.db.sql,
-- which did not exist. MEASURED 2026-09-19 on a full 821-frame HHS bake with --sun-compass:
-- project_metadata holds building_name and import_date and nothing else, so the compass had no
-- site to stand on and drew nothing, in silence.
--
-- NOTHING HERE IS COMPUTED OR ESTIMATED. Every value is what DAGCompiler/python/extractIFCtoDB.py
-- `extract_georef` (BIMCompiler#117, branch feat/georef-sunpath) returns when run on the source
-- IFCs named below — the function was run, not read: ifcopenshell 0.8.4, 2026-09-19. The same
-- values were reproduced independently by a second, from-scratch SPF reader before being written.
--
-- SOURCE: internal/UNMERGED/opensourceBIM_HHS_Office_architect.ifc and its five siblings
-- PROVENANCE: GUID match, not filename — elements_meta guids from this DB carry the
--   T0_HHS_Office_Federated_ prefix and the federation is that six-file set.
-- AGREEMENT: UNANIMOUS. All SIX discipline files (architect, architect2, construction,
--   construction2, MEP, MEP2) carry the SAME IfcSite 48.13300000 / 11.58300000 — no ruling was
--   needed here, unlike Hospital's three-way disagreement.
--
-- ⚠ true_north_angle 0 IS A DEFAULT, NOT AN EXTRACTED VALUE. None of the six files carries a
-- TrueNorth direction at all, so `true_north_source` says `default_zero` rather than
-- `ifc_truenorth`. That distinction is the whole point of the source key: a reader must be able
-- to tell "the model says north is north" from "nobody said". Do not tidy this to ifc_truenorth.
--
-- Applying this twice changes nothing (INSERT OR REPLACE on a PRIMARY KEY).
-- ============================================================================================
CREATE TABLE IF NOT EXISTS project_metadata (key TEXT PRIMARY KEY, value TEXT);
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('true_north_angle','0');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('true_north_source','default_zero');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_latitude','48.13300000');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_longitude','11.58300000');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_elevation_m','0.0000');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_latlong_source','ifc_site');
