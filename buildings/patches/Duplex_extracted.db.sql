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
CREATE TABLE IF NOT EXISTS spatial_structure (guid TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT, parent_guid TEXT, object_type TEXT, predefined_type TEXT, elevation REAL);
INSERT OR IGNORE INTO spatial_structure (guid,type,name,parent_guid,elevation) VALUES ('1xS3BCk291UvhgP2dvNsgp','IfcBuildingStorey','T/FDN','1xS3BCk291UvhgP2a6eflK',-1.25);
INSERT OR IGNORE INTO spatial_structure (guid,type,name,parent_guid,elevation) VALUES ('1xS3BCk291UvhgP2dvNMKI','IfcBuildingStorey','Level 1','1xS3BCk291UvhgP2a6eflK',0.0);
INSERT OR IGNORE INTO spatial_structure (guid,type,name,parent_guid,elevation) VALUES ('1xS3BCk291UvhgP2dvNMQJ','IfcBuildingStorey','Level 2','1xS3BCk291UvhgP2a6eflK',3.10000000000038);
INSERT OR IGNORE INTO spatial_structure (guid,type,name,parent_guid,elevation) VALUES ('1xS3BCk291UvhgP2dvNtSE','IfcBuildingStorey','Roof','1xS3BCk291UvhgP2a6eflK',6.00000000000039);
