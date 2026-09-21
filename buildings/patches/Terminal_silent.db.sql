-- ============================================================================================
-- §GEOREF migration — Terminal_silent.db
-- bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §3.3 · MEP_CLASH_REVEAL_MOVIE.md §129.37
-- Mechanism: viewer/scene.js A._applyPendingPatch, <db dir>/patches/<dbFile>.sql.
--
-- NOTHING HERE IS COMPUTED OR ESTIMATED. Values are what DAGCompiler/python/extractIFCtoDB.py
-- `extract_georef` (BIMCompiler#117) returns on the source below — the function was RUN,
-- ifcopenshell 0.8.4, 2026-09-19, and reproduced independently by a second SPF reader.
--
-- SOURCE: internal/UNMERGED/merged_federation.ifc
-- PROVENANCE: GUID match, not filename — Terminal_extracted.db's first elements_meta guids
--   (T0_Terminal_00WQLSz8PF8unm34sbEL…) hit merged_federation.ifc, 19 times, and NO other IFC
--   in internal/UNMERGED. This shipped DB is that federation.
-- AGREEMENT: the file carries EIGHT IfcSite entities. SEVEN give exactly 5.96277289 /
--   100.63712571; one (#1892917) gives 5.96514722 / 100.63759440, about 270 m away. The value
--   written here is the FIRST site, which is the rule the extractor itself applies (it takes the
--   first IfcSite carrying both angles and stops) — and it is also the 7-of-8 value, so the rule
--   and the agreement point at the same number. Recorded because they could have disagreed.
--
-- ⚠ site_elevation_m IS DOUBTFUL AND IS NOT READ BY ANYTHING. The file declares MILLI.METRE and
-- writes RefElevation 3.03512190000002, so the extractor's unit conversion gives 0.0030 m — a site
-- 3 mm above datum, which is not a plausible building. The likelier reading is that the exporter
-- wrote metres into a millimetre file. It is left exactly as the extractor returns it rather than
-- "corrected" to 3.0351 m on a hunch: no consumer reads this key (only viewer/import_db_builder.js
-- writes it), so nothing depends on the answer today, and inventing one would be the Prime
-- Directive's own failure mode. Resolve it from the source, not from plausibility, before any
-- consumer starts reading it.
--
-- Applying this twice changes nothing (INSERT OR REPLACE on a PRIMARY KEY).
-- ============================================================================================
CREATE TABLE IF NOT EXISTS project_metadata (key TEXT PRIMARY KEY, value TEXT);
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('true_north_angle','52.040036');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('true_north_source','ifc_truenorth');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_latitude','5.96277289');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_longitude','100.63712571');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_elevation_m','0.0030');
INSERT OR REPLACE INTO project_metadata (key,value) VALUES ('site_latlong_source','ifc_site');
