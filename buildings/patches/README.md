# buildings/patches/ — Viewer-side self-heal SQL patches

Naming convention: `<file>.sql` patches the shipped resident DB `buildings/<file>`
(e.g. `HHS_Office_Federated_extracted.db.sql` → `HHS_Office_Federated_extracted.db`).
`viewer/scene.js`'s `A._applyPendingPatch()` fetches the matching `.sql` file from
the SAME directory the db itself was fetched from (works for both relative
`buildings/X.db` and absolute OCI/GH-Pages URLs) after every `A.cachedFetch()` —
cache-hit or fresh — and runs it via sql.js `db.run()` before the buffer is handed
to `new SQL.Database(...)`. A 404 (no patch shipped for that file) or a runtime
`exec` failure is swallowed — the resident opens unpatched rather than blocking.

Every script here MUST be **idempotent** (`DELETE`-then-`INSERT`, or `INSERT OR
IGNORE`) — safe to re-run on an already-current DB, so re-applying on every open
costs nothing but a small extra fetch.

This mirrors the Modeller-side convention (`modeller/patches/` +
`str_walker_outliner.js`'s `_applyPendingPatch()`, ported here 1:1) — same
rationale: ship the small `.sql` fix as a normal git commit (no LFS, no binary
push, unaffected by the LFS-bandwidth block in effect until 2026-08-01) and let
the app self-heal a stale shipped `.db` at runtime instead of leaving a witnessed
fix unapplied for live GH-Pages/OCI-served users.

| Patch file | Targets | Fixes |
|---|---|---|
| `HHS_Office_Federated_extracted.db.sql` | `HHS_Office_Federated_extracted.db` | carries the corrected 109-row `spatial_structure` (105 `IfcSpace` + 4 storeys, §DOOR-PARTITION `INTERNAL_DOORPART`) — was a stale 14-row `COMPILED`-only set (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §2b) |
