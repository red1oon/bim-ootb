-- ============================================================================================
-- §GEOREF migration — Hospital_silent.db
-- bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §3.3 · MEP_CLASH_REVEAL_MOVIE.md §129.37
-- Mechanism: viewer/scene.js A._applyPendingPatch, <db dir>/patches/<dbFile>.sql. Same reason
-- this file exists as HHS_Office_Federated_silent.db.sql beside it: the 2026-09-18 georef work
-- patched *_extracted.db under viewer/buildings/patches/, and a film bake reads neither.
--
-- VALUES ARE THE SAME ONES ALREADY SHIPPED for Hospital_extracted.db (that patch, 2026-09-18,
-- carries them verbatim) — re-derived here by RUNNING DAGCompiler/python/extractIFCtoDB.py
-- `extract_georef` (BIMCompiler#117) on the source file, ifcopenshell 0.8.4, 2026-09-19, and
-- confirmed byte-identical to the shipped extracted-DB patch. Nothing was re-decided.
--
-- SOURCE: internal/UNMERGED/Hospital_IFC2x3_ARC.ifc (its IFC4 twin is byte-identical on all four
--   georef values, checked the same day).
--
-- ⚠ THIS CARRIES A HUMAN RULING, NOT AN EXTRACTION CONSENSUS. Hospital's 14 discipline files give
-- THREE different site coordinates:
--     ARC              42.35842896 / -71.05977631   (this file)
--     STR/ELE/FIRE/PLB/SPR  42.21300000 / -71.03300000   (~16 km away, a 10-of-14 majority)
--     MECH             43.12213135 / -77.63016510   (Rochester NY, ~500 km away)
-- RULING, red1, 2026-09-18: ARC is the authoritative source of record; the others are the errors.
-- No majority vote, no closest-to-the-others heuristic, nothing automatic. Reverting the ruling is
-- one commit, and this is the single place it shows.
--
-- ⚠ FIRST NON-ZERO true_north_angle IN THE FLEET (5.000000, really authored). viewer/sitecam.js:81
-- and viewer/walk.js:275 have applied a real rotation to a permanently-zero input since they
-- shipped; on this building they now rotate by 5 degrees. A regression of this value back to '0'
-- is not a cosmetic diff, it is the original defect returning.
--
-- Applying this twice changes nothing (INSERT OR REPLACE on a PRIMARY KEY).
-- ============================================================================================
CREATE TABLE IF NOT EXISTS project_metadata (key TEXT PRIMARY KEY, value TEXT);
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('true_north_angle','5.000000');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('true_north_source','ifc_truenorth');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_latitude','42.35842896');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_longitude','-71.05977631');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_elevation_m','165.8112');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_latlong_source','ifc_site');
