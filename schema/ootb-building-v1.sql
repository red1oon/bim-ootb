-- ootb-building v1 — target schema for BIM-OOTB building databases.
-- Spec: schema/README.md. Status: PUBLISHED TARGET. Files shipped before v1 ("v0") are NOT in this
-- layout; schema/migrate_v0_to_v1.py converts a copy. Readers MUST ignore unknown tables, unknown
-- columns, and every table whose name starts with x_ (application extensions).
-- Conventions: lengths in metres, IFC world axes with Z up, text UTF-8, BLOBs little-endian.

PRAGMA user_version = 1;

-- ---------------------------------------------------------------- core module
CREATE TABLE project_metadata (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- Required keys: schema_name='ootb-building', schema_version='1', modules (comma list:
-- core,geometry,spatial,4d,qto). Expected when known: building_name, source_file, import_date.

CREATE TABLE elements_meta (
  guid          TEXT PRIMARY KEY,   -- unique element key; may carry a federation prefix
  ifc_guid      TEXT,               -- bare 22-char IFC GlobalId; NULL for rows not from IFC
  ifc_class     TEXT NOT NULL,      -- IFC entity name, e.g. IfcWall
  discipline    TEXT,
  storey        TEXT,               -- name of the containing IfcBuildingStorey
  element_name  TEXT,               -- IfcRoot.Name
  element_type  TEXT,               -- name of the related type object, when known
  material_name TEXT,
  material_rgba TEXT,               -- 'r,g,b,a', each 0..1; NULL when unknown (never '')
  building      TEXT
);

CREATE TABLE element_transforms (
  guid             TEXT PRIMARY KEY REFERENCES elements_meta(guid),
  center_x REAL, center_y REAL, center_z REAL,        -- world position of the centred mesh (m)
  rotation_x REAL, rotation_y REAL, rotation_z REAL,  -- radians; 0 when rotation is baked into vertices
  bbox_x REAL, bbox_y REAL, bbox_z REAL,              -- axis-aligned size (m)
  transform_source TEXT
);

CREATE TABLE element_instances (
  guid          TEXT PRIMARY KEY REFERENCES elements_meta(guid),
  geometry_hash TEXT NOT NULL                          -- key into component_geometries
);

-- ------------------------------------------------------------ geometry module
CREATE TABLE component_geometries (
  geometry_hash TEXT PRIMARY KEY,   -- opaque key; readers must not recompute it
  vertices      BLOB NOT NULL,      -- float32 x,y,z per point, centred on the element
  faces         BLOB NOT NULL,      -- uint32 i,j,k per triangle (indexes into vertices)
  normals       BLOB,               -- float32 x,y,z per point, or NULL
  building      TEXT
);

-- ------------------------------------------------------------- spatial module
CREATE TABLE spatial_structure (
  guid            TEXT PRIMARY KEY,
  type            TEXT NOT NULL,    -- IfcSite | IfcBuilding | IfcBuildingStorey | IfcSpace ...
  name            TEXT,
  parent_guid     TEXT,
  object_type     TEXT,
  predefined_type TEXT,
  center_x REAL, center_y REAL, center_z REAL,
  size_x REAL, size_y REAL, size_z REAL,
  elevation       REAL,             -- storey elevation (m)
  room_guid       TEXT
);

CREATE TABLE rel_contained_in_space (
  element_guid TEXT NOT NULL,
  space_guid   TEXT NOT NULL,
  PRIMARY KEY (element_guid, space_guid)
);

CREATE TABLE rel_aggregates (
  parent_guid TEXT NOT NULL,
  child_guid  TEXT NOT NULL,
  PRIMARY KEY (parent_guid, child_guid)
);

-- ------------------------------------------------------------------ 4D module
CREATE TABLE schedules (
  schedule_id      TEXT PRIMARY KEY,
  name             TEXT,
  status           TEXT,
  created_date     TEXT,            -- ISO 8601
  gen_version      INTEGER,
  display_authored INTEGER
);

CREATE TABLE tasks (
  task_id           TEXT PRIMARY KEY,
  schedule_id       TEXT REFERENCES schedules(schedule_id),
  wbs_parent        TEXT,
  name              TEXT,
  predefined_type   TEXT,
  is_summary        INTEGER,
  schedule_start    TEXT,           -- ISO 8601 date
  schedule_finish   TEXT,           -- ISO 8601 date
  schedule_duration TEXT,           -- as authored (IfcTaskTime style)
  duration_days     REAL,           -- numeric working days, when known
  early_start TEXT, early_finish TEXT, late_start TEXT, late_finish TEXT,
  free_float TEXT, total_float TEXT,
  is_critical       INTEGER,
  resource          TEXT,
  status            TEXT
);

CREATE TABLE task_sequences (
  predecessor_id TEXT NOT NULL,
  successor_id   TEXT NOT NULL,
  sequence_type  TEXT,              -- FINISH_START etc.
  lag_days       REAL DEFAULT 0,
  PRIMARY KEY (predecessor_id, successor_id)
);

CREATE TABLE task_elements (
  task_id TEXT NOT NULL,
  guid    TEXT NOT NULL,
  PRIMARY KEY (task_id, guid)
);

CREATE TABLE calendars (
  name            TEXT,
  recurrence_type TEXT,
  raw             TEXT
);

-- ----------------------------------------------------------------- qto module
CREATE TABLE qto_cache (
  ifc_class TEXT NOT NULL, storey TEXT NOT NULL, discipline TEXT NOT NULL,
  qty REAL NOT NULL, uom TEXT NOT NULL, element_count INTEGER NOT NULL,
  material_cost REAL, labour_cost REAL, equipment_cost REAL,
  rate_template TEXT, computed_at TEXT,
  PRIMARY KEY (ifc_class, storey, discipline, rate_template)
);
