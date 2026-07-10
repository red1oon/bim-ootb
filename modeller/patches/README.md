# modeller/patches/ — self-heal SQL patches

Naming convention: `<file>.sql` patches the resident DB `modeller/<file>` (e.g.
`SampleHouse_ARC.db.sql` → `SampleHouse_ARC.db`, `mesh.db.sql` → `mesh.db`).
`str_walker_outliner.js`'s `_applyPendingPatch()` fetches the matching `.sql`
file after every resident/geoDb open (cache-hit or fresh fetch) and runs it
via sql.js `db.run()` before the DB is used. A 404 (no patch shipped for
that file) or a runtime `exec` failure is swallowed — the resident opens
unpatched rather than blocking.

Every script here is **idempotent** (`INSERT OR IGNORE`, or a `DELETE`
that's a no-op once already applied) — safe to re-run on an already-current
DB, so re-applying on every open costs nothing but a small extra fetch.

Ported from bim-compiler (`migration/MDB001_livewire_device_meshes.sql` +
`prompts/Modeller/DISC_Walker/embed8_scripts/ROOM001-007_*.sql`,
ROOM_INJECTION_HYBRID.md Task 4 follow-up) — see those files' own header
comments for provenance/root-cause detail on each patch. This directory is
the "wire the app to self-heal" half of that follow-up: the SQL scripts
already closed main's data gap for anyone who manually applied them via
`sqlite3`; this loader makes it automatic for a live GH-Pages/OCI-served
user, without ever pushing the multi-MB binary DBs (still LFS-blocked
until 2026-08-01).

| Patch file | Targets | Fixes |
|---|---|---|
| `SampleHouse_ARC.db.sql` | `SampleHouse_ARC.db` | carries `spatial_structure` (6 rows) |
| `HHS_ARC.db.sql` | `HHS_ARC.db` | carries `spatial_structure` (109 rows) |
| `Clinic_ARC.db.sql` | `Clinic_ARC.db` | carries `spatial_structure` (200 rows) |
| `Garage_ARC.db.sql` | `Garage_ARC.db` | carries `spatial_structure` (6 rows) |
| `Hospital_ARC.db.sql` | `Hospital_ARC.db` | carries `spatial_structure` (208 rows) |
| `SampleCastle_ARC.db.sql` | `SampleCastle_ARC.db` | carries `spatial_structure` (55 rows) |
| `Duplex_ARC.db.sql` | `Duplex_ARC.db` | strips the non-habitable Roof space (26→25 rows) |
| `mesh.db.sql` | `mesh.db` | carries 26 §LIVEWIRE device-mesh rows into `component_geometries` |

Terminal needs no patch (`Terminal_ARC.db` already byte-identical to source).
