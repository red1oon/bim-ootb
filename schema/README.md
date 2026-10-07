# ootb-building v1 — the BIM-OOTB building database schema

This folder publishes the schema that BIM-OOTB building databases will move to. It is a **target**: the
databases shipped today (called **v0** below) were written before it and are not changed by it. Nothing in the
viewer, the Modeller or the readiness toolkit loads this folder.

| File | What it is |
| --- | --- |
| `ootb-building-v1.sql` | The schema as SQLite DDL. Run it on an empty file to get a valid, empty v1 database. |
| `migrate_v0_to_v1.py` | Converts a COPY of a v0 file (or a `_meta.db` + `_geo.db` pair) into a new v1 file. Python 3 standard library only; sources are opened read-only. |
| `README.md` | This specification. |

## 1. What a v1 file is

A v1 file is an SQLite 3 database with `PRAGMA user_version = 1` and these rows in `project_metadata`:

| key | value |
| --- | --- |
| `schema_name` | `ootb-building` |
| `schema_version` | `1` |
| `modules` | comma list of the modules present: `core`, `geometry`, `spatial`, `4d`, `qto` |

Expected when known: `building_name`, `source_file` (the IFC file it came from), `import_date` (ISO 8601).

**Conventions.** Lengths in metres. Coordinates in the IFC model's world axes, Z up. Text is UTF-8. BLOBs are
little-endian. A file may hold `core` only, `geometry` only, or both, so a large model can still be split into a
metadata file and a geometry file.

**Reader rules.** A reader MUST ignore tables and columns it does not know, and every table whose name starts
with `x_` (application extensions, such as saved camera paths). A reader MUST NOT recompute `geometry_hash`.

## 2. Modules

### core
| Table | Key | Purpose |
| --- | --- | --- |
| `project_metadata` | `key` | The keys in section 1, plus any others the producer records. |
| `elements_meta` | `guid` | One row per element: IFC class, discipline, storey, name, type, material, colour, building. |
| `element_transforms` | `guid` | Where the element sits: centre (m), rotation (radians), axis-aligned size (m). |
| `element_instances` | `guid` | Which shared mesh the element uses (`geometry_hash`). |

**Element identity.** `guid` is the unique key. It is the IFC GlobalId, or, in a federated file, a prefix plus
the GlobalId (for example `T0_Terminal_3OCW4O$7PFvhdRJm6DyH7q`). `ifc_guid` always holds the bare 22-character
GlobalId, and is NULL for a row that did not come from IFC (for example a sensor added by the application).
To match a row to its IFC file, use `ifc_guid`.

**Colour.** `material_rgba` is the text `r,g,b,a` with each value from 0 to 1, or NULL. Never an empty string.

### geometry
`component_geometries` holds each distinct mesh once; many elements can share one.

| Column | Layout |
| --- | --- |
| `vertices` | float32 x, y, z per point (12 bytes each), centred on the element: add `element_transforms.center_*` to place it |
| `faces` | uint32 i, j, k per triangle (12 bytes each), indexes into `vertices` |
| `normals` | float32 x, y, z per point, or NULL |

Reading one mesh in JavaScript:
```js
const v = new Float32Array(row.vertices.buffer, row.vertices.byteOffset, row.vertices.byteLength / 4);
const f = new Uint32Array(row.faces.buffer, row.faces.byteOffset, row.faces.byteLength / 4);
```
In Python: `numpy.frombuffer(vertices, '<f4').reshape(-1, 3)` and `numpy.frombuffer(faces, '<u4').reshape(-1, 3)`.

### spatial (optional)
`spatial_structure` (site, building, storey and space tree, with centre, size and storey elevation),
`rel_contained_in_space` (element in space), `rel_aggregates` (parent and child).

### 4d (optional)
`schedules`, `tasks`, `task_sequences`, `task_elements`, `calendars`. `tasks` carries both the authored
schedule (`schedule_start`, `schedule_finish`, `schedule_duration`, `duration_days`) and the critical-path
results (`early_*`, `late_*`, `free_float`, `total_float`, `is_critical`). Dates are ISO 8601.

### qto (optional)
`qto_cache`: quantities and costs grouped by IFC class, storey and discipline.

Column types, keys and comments for every table are in `ootb-building-v1.sql`, which is the normative text.

## 3. Versioning

- Adding a table, a module or a nullable column keeps `user_version = 1`. Readers ignore what they do not know.
- Renaming or removing anything, or changing a type or BLOB layout, raises `user_version`.

## 4. Today's files (v0) and migration

v0 files have no version stamp (`user_version = 0`) and vary by building. A 2026-10-07 survey of 27 shipped
files found 28 table names and three layouts of `elements_meta`. The differences v1 settles:

| v0 | v1 |
| --- | --- |
| `elements_meta` with or without an `id` column | `guid` is the key; `id` is not carried |
| no bare GlobalId column; prefixed `guid` in federated files | new `ifc_guid` column |
| `material_rgba` sometimes `''` | NULL |
| `tasks` in a simple layout (`start_date`, `finish_date`, `duration_days`) or a critical-path layout | one layout holding both |
| `rel_contained_in_space` columns in either order | named columns, order irrelevant |
| `base_geometries` written by the offline extractor | `component_geometries` (what the viewer reads) |
| application tables (`scene_state`, `cinema_path`, `kernel_ops`, BOM tables and others) | carried verbatim as `x_<name>` |

Run the migration on a copy:
```sh
python3 schema/migrate_v0_to_v1.py Hospital_extracted.db -o Hospital.v1.db
python3 schema/migrate_v0_to_v1.py Hospital_meta.db Hospital_geo.db -o Hospital.v1.db
```
It prints one `§SCHEMA_MIGRATE` line per table, showing source rows, rows inserted and rows lost, then a verdict:
`PASS` when no source row was lost, `FAIL` naming what was, or `INCONCLUSIVE` when the source was empty or
unreadable.

## 5. Migration test, 2026-10-07

The migration was run on copies of all 27 v0 files shipped in `buildings/` (22 single files and 5 meta/geo pairs).
Source checksums were identical before and after.

| Result | Files |
| --- | --- |
| PASS, no source row lost | 22 single files and all 5 pairs, up to 125,698 elements (LTU_AHouse) |
| INCONCLUSIVE, 0-byte source | `city_index.db`, `city_index_v2.db`, `Duplex_meta.db`, `SampleCastle_extracted.db` |
| FAIL | none |

`ifc_guid` resolved for every element except the 9 sensor rows in HHS_Office_Federated, which did not come from
IFC. One file's 59,917 `base_geometries` rows moved to `component_geometries` without loss. Many v0 files lack
`source_file` in `project_metadata`; the migration reports that rather than invent it.
