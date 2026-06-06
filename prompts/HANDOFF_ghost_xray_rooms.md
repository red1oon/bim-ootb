# ⚠ DO NOT REMOVE — Ghost X-Ray + Rooms handoff. Read the log after every run.
# Scope: ghost X-Ray lens = DONE + LIVE on GH. ONE issue left = room compile accuracy.
# Canonical edit dir = bim-ootb/viewer/ (GH Pages). Room formula = bim-compiler/scripts/compile_rooms.py.

## ✅ SHIPPED + LIVE ON GH (verified on the server, 2026-06-06)
GH now == localhost. Live markers: `navigate_find.js?v=28`, `sw CACHE_VERSION v613`, `§NAV_FIND_VERSION v41`.
- **Landing auto-ghost** (PR #164) — `index.html` appends `&ghost=1` on all 3 open-paths (catalog,
  Drop-IFC/import, community), so the shell auto-builds for real users. The engine was always deployed;
  the landing just never passed the flag. (`grep ghost index.html` was empty → that was the whole bug.)
- **Ghost shell MAX-blend** (PR #165 + #166) — `navigate_find.js:865` shell material uses
  `CustomBlending + MaxEquation` (`blendSrc SrcAlpha`, `blendDst One`), `opacity 0.12`, `depthWrite false`,
  `DoubleSide`. Overlapping envelope layers no longer ACCUMULATE → `max(color×0.12, behind)`, so looking
  through N walls reads like 1 → the interior stops "drowning". Bold over the dark scene; fades only vs a
  bright lit-sky (rare, accepted). Cost = free (GPU blend-equation flag, no per-frame JS).
  Black openings = real window/door gaps showing through to the dark scene (envelope excludes them) — kept.
  Fresnel-rim is the pocketed upgrade if dynamic contrast is ever wanted over lit sky.
- **Find panel drag fix** — `measure.js:15` now honours `el._dragStrip` (was hardcoded 30px, ignoring the
  panel's intended 64px grab-zone → felt undraggable).
- **Whole-row focus band** — `navigate_find.js:75` `.find-tree-row.row-focus` now fills the row
  (`background rgba(255,212,0,0.14)`) at every depth incl. leaf, not just the left edge.
- **X-ray restore-on-exit** — `_roomLensReset` (navigate_find.js ~1220) restores Alt+Z x-ray to its
  normal 0.3 when the user had it ON before Find (the room lens used to leave it stuck at 0.12).

## ▶ THE ONE ISSUE LEFT — ROOM COMPILE ACCURACY (formula = bim-compiler/scripts/compile_rooms.py)
Rooms render but the flood-fill mis-classifies some volumes. **NEW symptom (user, 2026-06-06):**
**lift/stair shafts AND the bottom slab void get bundled as rooms.**
- **Lift/stair shafts**: a vertical shaft is wall-enclosed on every storey → the per-storey flood-fill sees
  an enclosed pocket on EACH floor → emits a room per floor at the same XY. Likely fix: detect pockets that
  repeat at the same XY across ≥N storeys (vertical stack) and/or contain IfcTransportElement (lift) /
  IfcStair → drop them as shafts, not rooms.
- **Bottom slab / foundation void**: the lowest level's slab-bounded area registers as one big "room".
  `MAX_AREA_FRAC 0.92` + `MAX_AREA_ABS 150` are meant to drop whole-storey blobs but don't always catch it.

### Prior accuracy findings (agent audit, still open — EXTRACT/COMPILE only, no invent)
- *Wrong place*: a room = the axis-aligned **bbox of a flood-fill component** (compile_rooms.py:102-106).
  L/U pockets → center lands in the notch; open doorways stay open by design → 2 rooms merge → 43 m "rooms".
- *1-2 sides only*: the Room lens renders the **real bounding walls clipped to the cuboid** (max one wall
  per face, `_roomBoundingGuids` navigate_find.js:1134); a face with no real wall nearby stays blank — no
  closed box is ever built.
- **Feasible fixes (data present in *_meta.db): (a)** snap the room bbox/center to the **enclosing wall
  inner-faces** (wall AABBs already loaded in `storey_walls`) → fixes wrong place + trims doorway leakage;
  **(b)** per-face cuboid fallback in `_roomBoundingGuids` when a face has no real wall → fixes 1-2 sides.
- ⚠ The room formula STICKS unless the user gives explicit go (user: "DO NOT DISTURB THE FORMULA" until
  agreed). This section is the spec for that next task.

### More from the audit (verified data + extra defects — saves the next session the dig)
- **No IfcRelSpaceBoundary / adjacency / space-boundary table in ANY `*_meta.db`** (checked all 4) — room
  boundaries MUST be derived from wall geometry; there is nothing to just read. Don't waste time looking.
- **Real per-element mesh polygons DO exist**: `*_geo.db → component_geometries(vertices,faces,normals)`,
  linked by `element_instances.geometry_hash`. Available if face-accurate boundaries are ever needed
  (heavy — only reach for it if the wall-AABB snap below isn't enough).
- **Element→room mis-attribution**: containment is a rectangular bbox test that **breaks on first match**
  (compile_rooms.py:181-183) → an element inside an overlapping/oversized room bbox is wired to the WRONG
  room. Fix alongside the bbox-snap.
- **Duplicate storey labels split the walls** (recount finding): LTU has BOTH `VÅN 1-4` and `VÅNING 1-4`;
  the walls for one physical floor divide across the two strings → the `VÅN*` variants enclose nothing →
  0 rooms there. Normalize/merge storey names before flood-fill. (Same shape: Terminal `GROUND FLOOR LEVEL`
  59 walls→0 vs `Aras Tanah` 316→15.)
- **Area thresholds clip the tails**: `MIN_AREA 4 m²` drops toilets/closets; `MAX_AREA_ABS 150 m²` drops
  halls/lobbies (LTU VÅNING-4 rooms already brush 145-149 m²). Tune if recall matters.
- **3rd fix option — store the true cell outline (most accurate, biggest change)**: the flood component
  already knows its exact occupied cells (compile_rooms.py:94); emit the cell-boundary polygon instead of
  collapsing to a bbox. Needs a geometry column on `spatial_structure` + a polygon-extrude render path
  (today `_drawRoomShell` is hardwired to `BoxGeometry`).

## Probes (leak-safe; ≤1 browser, serviceWorkers:'block')
- `tests/probe_live_ghost.js` — health-probe the LIVE GH url (OCI _prodBase form); checks
  `§NAV_FIND_VERSION`, `§SHELL_GHOST_BUILT`, page errors. `BLD=Terminal|Clinic|Hospital|LTU_AHouse`.
  Always wrap: `timeout --signal=KILL 200 node … ; pkill -9 -f chrome-headless-shell`.
- Real live URL = landing OCI form: `…/viewer/viewer.html?db=<OCI>/o/buildings/<Bld>_extracted.db&ghost=1`
  (the bare `?db=buildings/…` form does NOT resolve on GH — no local buildings/ dir there).
- Localhost: serve bim-ootb root on :8124; use `?db=buildings/<Bld>_extracted.db&ghost=1` (NOT `_meta.db` —
  that breaks the `_extracted.db→_geo.db` substitution and loses geometry).
