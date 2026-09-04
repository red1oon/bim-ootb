# HHS_Office_Federated — IFC / extracted-DB analysis

Sits next to the DB it describes (`HHS_Office_Federated_extracted.db`, the file the LIVE Viewer
fetches for HHS). **Findings are recorded here whether positive or negative** — a ruled-out cause is
as expensive to re-derive as a confirmed one. Add a dated section; do not rewrite earlier ones.

Source IFCs: `bim-compiler internal/UNMERGED/opensourceBIM_HHS_Office_{architect,construction,MEP}.ifc`
(federated). Live URL: `https://red1oon.github.io/bim-ootb/buildings/HHS_Office_Federated_extracted.db`.
Runtime patch: `buildings/patches/HHS_Office_Federated_extracted.db.sql`.

---

## 2026-09-04 — "missing front / right-side ground-floor wall"

> **USER:** *"Even in HHS Office, it is missing a wall slab on its right side, ground floor."*
> … *"HHS missing front ground floor wall"*.
> Reported against the live site, `§BUILD_VERSION v1141`, a plain load (no bake, no Time Machine).

### ⛳ THE FINDING (positive) — every curtain-wall panel carries `storey = 'Unknown'`

HHS's front glazing is `IfcCurtainWall`. Three facts, all measured:

1. The **33 `IfcCurtainWall` rows have no geometry of their own** — 0 `element_instances` (the same
   shape as Hospital's 178, `PHOTOREAL_STILL_RENDER.md` §BME.3). **22 of the 33 are on Level 1.**
2. Their glass **is** their children: 2,096 rows via `rel_aggregates` —
   **1,450 `IfcMember` + 629 `IfcPlate` + 17 `IfcDoor`** — and all 2,096 are present in the live
   extracted DB *with* geometry. Nothing is lost.
3. **All 2,096 of those children have `elements_meta.storey = 'Unknown'`.** Not some — all.

Extraction assigns storey from spatial containment, and curtain-wall panels are *aggregated under
the curtain wall*, not *contained in the storey*; only the parent gets a storey. So the storey never
reaches the panel.

**Why that reads as a missing wall.** `viewer/panels.js:700`:

```js
A._storeyVisible = function(s) {
  var f = A.activeStoreyFilter;
  if (f === null || f === undefined) return true;     // plain load — everything visible
  if (Array.isArray(f)) return f.indexOf(s) >= 0;      // exact match
  return s === f;
};
```

Exact match. Filter to **Level 1** and every one of the 2,096 panels fails it, while the 44
correctly-tagged `IfcWallStandardCase` on Level 1 stay. The ground floor keeps its solid walls and
loses its entire glazed front. With **no** filter active they are all visible — which is exactly why
every pose-independent instrument below passed.

**Fix, when picked up — THE RULE ALREADY EXISTS AND IS ALREADY VALIDATED ON THIS BUILDING. Do not
invent a new one, and do not special-case `IfcCurtainWall` or a storey name.**

`bim-compiler scripts/compile_rooms.py` carries **`§STOREY-Z`** (`storey_z_anchors` +
`_assign_by_z`), and its own docstring is this exact case, in these words:

> *"the anchor used to reassign 'Unknown'-storey wall-like elements + doors to their actual floor
> (HHS: all 716 vertical curtain children carry storey 'Unknown'; their z clusters match Level 1/2/3
> exactly)"*

It takes the per-storey mean `center_z` of the walls that DO carry a storey, and assigns each
`Unknown` element to the nearest anchor — no constant, no class list, deterministic tie-break.
**Its only defect is scope: it computes the storey in memory for the room raster and never writes it
back to `elements_meta.storey`, so the Viewer still reads `Unknown`.** The fix is to persist what
that rule already decides.

Two rules, in this order — the first is exact, the second is the existing fallback:
1. **Aggregate inheritance (IFC-semantic, exact).** A part joined by `IfcRelAggregates` inherits its
   whole's `IfcRelContainedInSpatialStructure`; that is the schema's own rule, so a panel takes its
   curtain wall's storey. Generic — nothing in it names a class or a building.
2. **`§STOREY-Z` (geometric fallback)** for anything with no aggregate parent.

Ship it as a data patch, not a binary DB commit: `buildings/patches/*.sql` + the viewer's
`_applyPendingPatch` (CLAUDE.md "DB CHANGES = MIGRATION SCRIPT + SELF-HEAL LOADER"). ⚠
`rel_aggregates` exists in `HHS_Office_Federated_silent.db` but **not** in
`HHS_Office_Federated_extracted.db` — the runtime patch already adds 2,120 `rel_aggregates` rows, so
the parentage IS available live; check what the patch has landed before writing the fix.

**Do NOT "fix" it by making `_storeyVisible` treat `'Unknown'` as always-visible.** That is the
hard-coded version, and it is wrong: it would show every other floor's untagged element whenever a
storey filter is on.

### ✅ FIXED IN EXTRACTION — 2026-09-04, bim-compiler `f72563c6a`, `§STOREY_AGGREGATE_INHERIT`
`tools/extract.py` `get_storey_for_element()` now walks up `IfcRelAggregates` when containment is
silent, recursively, depth-capped at 8 against a malformed cyclic aggregate. Rule 1 above,
implemented; `§STOREY-Z` untouched as the geometric fallback. **Re-extract to pick it up** — this
DB was built before the fix.

MEASURED old rule vs new on the real source IFCs (`/tmp/verify_storey.py`, no DB rebuild needed):

| source IFC | parent | children | `Unknown` → named | resulting storeys |
|---|---|---|---|---|
| `opensourceBIM_HHS_Office_architect.ifc` | `IfcCurtainWall` | 2,096 | **2,096** | **Level 1 = 1,893** · Level 2 = 149 · Level 3 = 54 |
| `opensourceBIM_HHS_Office_construction.ifc` | `IfcStair` | 24 | **24** | Level 1 = 13 · Level 2 = 11 |

The **1,893 Level 1** panels are the reported ground-floor front wall. Hospital's 9,457 aggregated
children (178 CurtainWall + 31 Stair + 24 Roof) are fixed by the same pass.

**Confirming a re-import** — one query, not a look:
```sql
-- must be 0 after re-extraction; it was 2,120 before
SELECT COUNT(*) FROM elements_meta m JOIN rel_aggregates r ON r.child_guid = m.guid
WHERE m.storey IS NULL OR m.storey = 'Unknown';
```

**USER, 2026-09-04, on why it looked like a translation loss:** *"I ran an open IFCs for HHS and
found out indeed it has that missing wall. But in all bake movie it appears. Thus indeed we broke
something in translating that element."* — half right, and the half matters: the **geometry**
translated correctly (which is exactly why it draws in every bake — a bake applies no storey
filter); only the **storey tag** was lost.

### ❌ RULED OUT, with the number that rules it out (do not re-derive)

| candidate | verdict | evidence |
|---|---|---|
| the `§DLOD_TM_OWNERSHIP` defect (bim-ootb #1660) | **OUT** | no Time Machine ran in the user's session — no `§TIME_MACHINE`, no `§DLOD_DISABLE reason=time-machine`; and v1141 already contains that fix |
| element lost in streaming | **OUT** | user's own `§CONTRACT_CHECK batch=3677 instanced=3162 merged=0 guidMap=6839 streamed=6839 orphans=0` |
| a batched slot left invisible at load | **OUT** | `witness_dlod_cull_soundness.js` §DCS_BM: **3,704 slots, invisibleAtLoad=0** |
| stale BatchedMesh bounds → wrongly culled | **OUT** | `witness_bm_bounds_cull.js`, 36-pose ring: `§BM_BOUNDS_STALE bm=97 geoms=3704 stale=0 worstM=0`; `WRONGLY_CULLED` 0–2 per pose (frustum-edge slivers), `wronglyDrawn=0` |
| geometry missing from the DB | **OUT** | every `IfcWallStandardCase` 148 / `IfcSlab` 83 / `IfcWall` 12 / `IfcCovering` 43 resolves its `geometry_hash`; **0** unresolved |
| lost during extraction | **OUT** | source IFC vs DB: `IfcWallStandardCase` 112+36=**148 vs 148** · `IfcWall` 0+12=**12 vs 12** · `IfcSlab` 75+8=**83 vs 83** · `IfcCurtainWall` 33+0=**33 vs 33** |
| degenerate or misplaced wall/slab | **OUT** | none with zero extent, none >200 m off; Level 1 carries 75 of them, z −0.1…3.6 |
| the runtime DB patch | **OUT** | it writes only `spatial_structure` (109), `rel_aggregates` (2,120), `storey_walkable_raster` (4) — **no geometry, no transforms** |
| `#1631 §DUCT_SILHOUETTE` (the only recent change that rewrites vertex data) | **OUT** | A/B on the same load with refinement forced off — **identical** integrity: `geometries=3369 NaN=0 zeroTri=0 badIndex=4 badSphere=0` both ways. Nothing to revert |
| `dlod.js`'s bbox fallback (`m.bx \|\| 0.3`) | **OUT** | `element_transforms.bbox_*` is populated for all 286 wall/slab rows, 0 null, `IfcWallStandardCase` avg 3.61 m |

### 🟡 Other real defects found on the way (neither is the wall)

1. **`§DLOD_CULL_SOUNDNESS` — dlod's cull sphere does not contain what it draws, 357 / 3,135
   instances.** `dlod.js:75-81` takes centre = the instance matrix *translation* and
   radius = `sqrt(bx²+by²+bz²)*0.5` from `element_transforms.bbox_*` — neither derived from the
   geometry actually drawn there. Centre offsets to **0.56 m**, worst overrun **0.55 m**
   (`IfcBuildingElementProxy`, sphere 1.09 m vs 1.64 m needed); `IfcDoor` 87 of 91 outside.
   Can clip an element at the frustum edge; far too small to delete a wall, and 139 of the 148
   `IfcWallStandardCase` are batched where dlod never runs. Witness: bim-ootb PR #1668.
2. **Two geometries whose index buffer references vertices that do not exist** — present with
   silhouette refinement off, so this is data, not code:
   - `771efc5271499502` — 474 vertices, index count 2,748, **max index 29,804** → 6
     `IfcBuildingElementProxy` *"CCTV Camera (Paxton10 Mini Bullet, CORE series)"*, Levels 1/2/3.
   - `8be27af97ecbf86e` — 24 vertices, index count 120, **max index 26,000** → 1
     `IfcEnergyConversionDevice` *"Photovoltaic Module (NBS generic)"*, Roof Level.

   **USER, 2026-09-04:** *"The HHS Human Asset add on is souce of the CCTVs, thus it is just
   generated data and not mandatory. Later we shall deal with injected data to remain as such
   option."* — so this is **injected/generated data**, parked deliberately, not a model defect. Keep
   injected data distinguishable from extracted data when that lane is picked up.

### Reference counts (this DB, 2026-09-04)

`elements_meta` 6,880 · `element_instances` 6,839 · unresolved geometry hashes 0 ·
elements with no geometry: 33 `IfcCurtainWall` + 8 `IfcStair` (aggregate containers — their
children carry the geometry: 2,096 and 24 respectively, all present).
Scene split at load: 3,704 BatchedMesh slots + 3,135 InstancedMesh instances.
Walls/slabs per storey: Level 1 = 75, Level 2 = 99, Level 3 = 58, Roof = 7, Unknown = 4.

### Instruments used (re-run these, do not invent new ones)

```
node viewer/tests/witness_dlod_cull_soundness.js         # BLD=HHS_Office_Federated_extracted
BLD=HHS_Office_Federated_extracted POSES=<ring.json> FRAMES=0..35 \
  node viewer/tests/witness_bm_bounds_cull.js
```
Both take `ROOT` (checkout to serve) and `BLD_DIR`. Logs: `/tmp/dcs_hhs2.log`, `/tmp/bmc_hhs.log`.
Full trace: bim-compiler `prompts/PHOTOREAL_STILL_RENDER.md` §BME.12 and §BME.13.
