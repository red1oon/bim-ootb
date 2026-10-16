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
-- SOURCE: internal/sources/Ifc2x3_Duplex_Architecture.ifc
-- PROVENANCE: sampled guids hit Ifc2x3_Duplex_MEP.ifc 23/25, with Plumbing/Mechanical/
-- Architecture siblings also represented — this shipped DB is that federation.
-- AGREEMENT: 3 of the 4 files (Architecture, MEP, Plumbing) agree exactly on this lat/long.
-- Ifc2x3_Duplex_Mechanical.ifc alone says 41.87811279 / -87.62979889, about 1 km away.
-- Same resolution as Clinic: the siblings' agreed value, from the architectural master.
-- TRUE NORTH: Ifc2x3_Duplex_Plumbing.ifc carries the same malformed 3-component TrueNorth
-- described above and it is refused; the other three carry none. Honest default.
--
-- ⚠ INSERT OR REPLACE, deliberately: the point is to overwrite an absent or stubbed value. When
-- this building is re-extracted and re-uploaded with the fixed extractor, refresh or delete this
-- file rather than leaving it to re-stamp values from an older source.
CREATE TABLE IF NOT EXISTS project_metadata (key TEXT PRIMARY KEY, value TEXT);
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('true_north_angle','0');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('true_north_source','default_zero');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_latitude','41.87440000');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_longitude','-87.63940000');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_elevation_m','0.0000');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_latlong_source','ifc_site');

-- ============================================================================================
-- Everything below this line predates the §GEOREF block above and is unchanged.
-- ============================================================================================
CREATE TABLE IF NOT EXISTS rel_aggregates (parent_guid TEXT NOT NULL, child_guid TEXT NOT NULL, PRIMARY KEY (parent_guid, child_guid));
-- §NOGEO_COMPOSE (2026-08-09): real IfcRelAggregates parent->child pairs for the Duplex
-- guid-only elements (no own Representation -- IfcCurtainWall/IfcStair/IfcRoof containers
-- whose geometry lives entirely on these children). No computed values here -- the
-- composition itself runs client-side at load time (scene.js composeGhostsFromAggregates,
-- ported from import_worker.js's §4D_NOGEO_COMPOSE) from this relationship data plus the
-- children's OWN already-shipped, already-real element_transforms rows. See
-- prompts/4D_SCHEDULE_PERFECTION.md 2026-08-09 entry.
INSERT OR IGNORE INTO rel_aggregates (parent_guid,child_guid) VALUES ('21ldoMpbP4VfsJ0XGY_34d','3KMJUyUe9DfQ2FOCd5ZoiN');
INSERT OR IGNORE INTO rel_aggregates (parent_guid,child_guid) VALUES ('21ldoMpbP4VfsJ0XGY_34d','01KzA4SPn5IOODwLEb5RNY');
INSERT OR IGNORE INTO rel_aggregates (parent_guid,child_guid) VALUES ('21ldoMpbP4VfsJ0XGY_34d','37Fy90kSD2PvviizyM7EKl');
INSERT OR IGNORE INTO rel_aggregates (parent_guid,child_guid) VALUES ('21ldoMpbP4VfsJ0XGY_34d','21ldoMpbP4VfsJ0XGY_34P');
INSERT OR IGNORE INTO rel_aggregates (parent_guid,child_guid) VALUES ('21ldoMpbP4VfsJ0XGY_34d','21ldoMpbP4VfsJ0XGY_335');
INSERT OR IGNORE INTO rel_aggregates (parent_guid,child_guid) VALUES ('0wkEuT1wr1kOyafLY4v_O1','1oKjKg9PD3fP1iIwXLh3lK');
INSERT OR IGNORE INTO rel_aggregates (parent_guid,child_guid) VALUES ('0wkEuT1wr1kOyafLY4v_O1','1gtrSK5QnDuxDwygd0EDGO');
INSERT OR IGNORE INTO rel_aggregates (parent_guid,child_guid) VALUES ('0wkEuT1wr1kOyafLY4v_O1','34qUFGjJzFKwVWpXe2dTPt');
INSERT OR IGNORE INTO rel_aggregates (parent_guid,child_guid) VALUES ('0wkEuT1wr1kOyafLY4v_O1','0wkEuT1wr1kOyafLY4v_PL');
INSERT OR IGNORE INTO rel_aggregates (parent_guid,child_guid) VALUES ('0wkEuT1wr1kOyafLY4v_O1','0wkEuT1wr1kOyafLY4v_PH');
INSERT OR IGNORE INTO rel_aggregates (parent_guid,child_guid) VALUES ('0jf0rYHfX3RAB3bSIRjmxl','3ThA22djr8AQQ9eQMA5s7I');
