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

Each of the 6 synthetic-room buildings' patch also carries a **§7 ROOM
WELL-FORMEDNESS overlay** appended after its carry-forward (ported from
bim-compiler `ROOM009-014_*_wellformed.sql`, `ROOM_INJECTION_HYBRID.md` §7) —
a full room recompile with the corridor/wall-crossing fix and `SUSPECT_OPEN`/
`SUSPECT_NO_DOOR` review rows. The overlay's own `DELETE` (by `STC_%`/`RM_%`
guid pattern) makes it safe to apply after the carry-forward regardless of
starting state, so the combined per-building script stays idempotent end to
end. Real `IfcSpace` buildings (Duplex/SampleHouse) are untouched by §7 —
that work only applies to `compile_rooms.py`-synthetic data.

| Patch file | Targets | Fixes |
|---|---|---|
| `SampleHouse_ARC.db.sql` | `SampleHouse_ARC.db` | carries `spatial_structure` (6 rows) |
| `HHS_ARC.db.sql` | `HHS_ARC.db` | carries + §7 recompiles `spatial_structure` (36 rows, 33 IfcSpace incl. 2 SUSPECT) |
| `Clinic_ARC.db.sql` | `Clinic_ARC.db` | carries + §7 recompiles `spatial_structure` (212 rows, 209 IfcSpace incl. 26 SUSPECT) |
| `Garage_ARC.db.sql` | `Garage_ARC.db` | carries + §7 recompiles `spatial_structure` (6 rows, 5 IfcSpace incl. 3 SUSPECT) |
| `Hospital_ARC.db.sql` | `Hospital_ARC.db` | carries + §7 recompiles `spatial_structure` (220 rows, 213 IfcSpace incl. 66 SUSPECT) |
| `SampleCastle_ARC.db.sql` | `SampleCastle_ARC.db` | carries + §7 recompiles `spatial_structure` (55 rows, 51 IfcSpace incl. 9 SUSPECT) |
| `Terminal_ARC.db.sql` | `Terminal_ARC.db` | §7 recompiles the shipped 43-row synthetic set → `spatial_structure` (59 rows, 53 IfcSpace incl. 10 SUSPECT) |
| `Duplex_ARC.db.sql` | `Duplex_ARC.db` | strips the non-habitable Roof space (26→25 rows) |
| `mesh.db.sql` | `mesh.db` | carries 26 §LIVEWIRE device-mesh rows into `component_geometries` |

Every building now ships a patch — there is no current "no patch needed"
example on this checkout (Terminal's pre-§7 43-row set now needs one too).
