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
