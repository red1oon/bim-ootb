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

-- ═══ §STOREY_DATUM (2026-08-27, bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.3) ═══
-- Duplex ships with NO spatial_structure table at all, so viewer/schedule_author.js
-- _buildScheduleElements has no declared storey datum and falls back to assigning every
-- storey-less element (86.0% of this building, 1026/1193) to the NEAREST storey by the
-- MEDIAN center-Z of that storey's elements -- the inference §PATHS NOT TO TAKE #7
-- forbids, unbounded, over a pool of raw labels. These 4 rows give it the real datum.
--
-- NOTHING HERE IS COMPUTED. Every value is read verbatim off IfcBuildingStorey in
-- reference/residential/Ifc2x3_Duplex_Federated.ifc (IFC2X3, metres) and is IDENTICAL in
-- Ifc2x3_Duplex_Architecture.ifc and bim-ootb/IFC/Duplex_ARC.ifc -- three independent
-- files, same GlobalIds, same elevations.
--
-- FRAME VERIFIED before shipping, not assumed: the served DB is in the SAME coordinate
-- frame as the IFC (offset 0), confirmed by two independent exact matches against the
-- shipped element geometry -- T/FDN's 5th-percentile base_z is -1.25, exactly the IFC
-- datum, and Roof's median base_z is 6.00, exactly the IFC datum. (Hospital was NOT
-- patched for the same purpose precisely because that check fails there: its source
-- files disagree on units, mm vs ft, and its served DB carries a ~166m site offset that
-- would have to be INFERRED. It stays INCONCLUSIVE until a real re-extraction.)
--
-- ⚠ CORRECTED 2026-08-27 BEFORE FIRST UPLOAD — the block above originally opened with
-- `CREATE TABLE IF NOT EXISTS spatial_structure (... elevation REAL)`. That is green against
-- this machine's LOCAL buildings/Duplex_extracted.db, which has NO spatial_structure table at
-- all — the CREATE fires and the INSERTs land. It is BROKEN against the object OCI actually
-- SERVES, which already HAS a spatial_structure table (8 compiled rows) and no elevation
-- column: the CREATE becomes a no-op and every INSERT below throws
-- `table spatial_structure has no column named elevation`. Because
-- viewer/scene.js _applyPendingPatch SWALLOWS any exec failure and returns the ORIGINAL
-- buffer, that would have silently discarded THIS ENTIRE FILE — including the working
-- §NOGEO_COMPOSE rel_aggregates rows above — while still logging nothing but the same
-- §S18_STOREY_MERGE_FAIL it was written to cure. Caught by scripts/probe_s18_elevation_deploy.js,
-- which runs against the DOWNLOADED SERVED BYTES; it is invisible to any check that reads the
-- local dev DB. Same wrong-DATA-snapshot class scripts/oci_patch_gate.js was built for.
--
-- So this uses the DROP+CREATE convention the other patches in this directory already use
-- (Hospital_meta.db.sql, Terminal_meta.db.sql) — idempotent, schema-independent, safe to
-- re-apply. The 8 existing COMPILED rows are re-inserted verbatim, read straight out of the
-- served object (elevation NULL: they were never extracted, and their center_z is the injected
-- mean-wall-CENTRE-z datum §K.4 flags as 0.64-3.16 m too high — NULL is correct, not a guess).
-- viewer/lib/room_walker.js writeRooms() rewrites every STC_/RM_ row on each load anyway.
DROP TABLE IF EXISTS spatial_structure;
CREATE TABLE spatial_structure (guid TEXT, type TEXT, name TEXT, parent_guid TEXT,
  object_type TEXT, predefined_type TEXT, center_x REAL, center_y REAL, center_z REAL,
  size_x REAL, size_y REAL, size_z REAL, room_guid TEXT, elevation REAL);
INSERT INTO spatial_structure VALUES('STC_Level_1','IfcBuildingStorey','Level 1',NULL,'COMPILED',NULL,NULL,NULL,1.6224438773874128,NULL,NULL,NULL,NULL,NULL);
INSERT INTO spatial_structure VALUES('STC_Roof','IfcBuildingStorey','Roof',NULL,'COMPILED',NULL,NULL,NULL,6.39619200410365706,NULL,NULL,NULL,NULL,NULL);
INSERT INTO spatial_structure VALUES('STC_T/FDN','IfcBuildingStorey','T/FDN',NULL,'COMPILED',NULL,NULL,NULL,-0.634071428571428619,NULL,NULL,NULL,NULL,NULL);
INSERT INTO spatial_structure VALUES('RM_Level_1_1','IfcSpace','≈ Level 1 R1','STC_Level_1','COMPILED','INTERNAL',4.28659244284541962,-13.809027458058491,1.62244387738741258,7.20000000000000017,6.00000000000000177,2.56167744628844706,NULL,NULL);
INSERT INTO spatial_structure VALUES('RM_Level_1_2','IfcSpace','≈ Level 1 R2','STC_Level_1','COMPILED','INTERNAL',4.48659244284541891,-4.00902745805849036,1.62244387738741258,7.19999999999999928,6.0,2.56167744628844706,NULL,NULL);
INSERT INTO spatial_structure VALUES('RM_Roof_1','IfcSpace','≈ Roof R1','STC_Roof','COMPILED','INTERNAL',4.45344109776439012,-8.91126439891143462,6.39619200410365706,7.0,16.0,2.0,NULL,NULL);
INSERT INTO spatial_structure VALUES('RM_T/FDN_1','IfcSpace','≈ T/FDN R1','STC_T/FDN','COMPILED','INTERNAL',4.45344109776439811,-12.7112643989114317,-0.634071428571428619,7.0,8.40000000000000035,2.0,NULL,NULL);
INSERT INTO spatial_structure VALUES('RM_T/FDN_2','IfcSpace','≈ T/FDN R2','STC_T/FDN','COMPILED','INTERNAL',4.45344109776439811,-5.11126439891143125,-0.634071428571428619,7.0,8.40000000000000035,2.0,NULL,NULL);
INSERT OR IGNORE INTO spatial_structure (guid,type,name,parent_guid,elevation) VALUES ('1xS3BCk291UvhgP2dvNsgp','IfcBuildingStorey','T/FDN','1xS3BCk291UvhgP2a6eflK',-1.25);
INSERT OR IGNORE INTO spatial_structure (guid,type,name,parent_guid,elevation) VALUES ('1xS3BCk291UvhgP2dvNMKI','IfcBuildingStorey','Level 1','1xS3BCk291UvhgP2a6eflK',0.0);
INSERT OR IGNORE INTO spatial_structure (guid,type,name,parent_guid,elevation) VALUES ('1xS3BCk291UvhgP2dvNMQJ','IfcBuildingStorey','Level 2','1xS3BCk291UvhgP2a6eflK',3.10000000000038);
INSERT OR IGNORE INTO spatial_structure (guid,type,name,parent_guid,elevation) VALUES ('1xS3BCk291UvhgP2dvNtSE','IfcBuildingStorey','Roof','1xS3BCk291UvhgP2a6eflK',6.00000000000039);
