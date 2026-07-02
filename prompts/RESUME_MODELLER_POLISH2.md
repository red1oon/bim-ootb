<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ⚠ DO NOT REMOVE — SPEC: Modeller polish batch 2 (§DECISIONS build: scale-preview parity, instance pick identity, BCF export MVP)

**Scope:** implement the 3 decisions of bim-compiler `prompts/RESUME_MODELLER_COMPETITIVE_POLISH.md §DECISIONS`
(all resolved 2026-07-03, nothing needs a further scope call). Branch `lane/modeller-polish-2` off main `1e5713f`.
**Read the log after every run.** Every claim below closes only on a `§`-tagged witness line. Non-invent:
every design fact below traces to a file:line read on this tree (3 parallel Explore passes, 2026-07-03).

## §Q1 — GEOM_SCALE preview follows LOCAL axes, matching the fold (W-E2E-SCALEROT)

**Bug (measured, POLISH_BATCH §OPEN):** the fold is scale(LOCAL, edge-anchored at local bbox min) → rotate →
translate (`bonsai_library.js:442-455`, `place()` :92-97) — but the scale cube handles (`modeller.html:1230-1237`),
the drag delta (world-plane `d[ax]`, :1460-1470), and `scaleGhostShow` (:1279-1291, group scale + world edge
offset) are all WORLD-aligned. For a rotated insert the preview shows a world-axis stretch while the commit
folds a local-axis stretch. Authored meshes have IDENTITY transform (rotation baked into vertices by `place()`),
so `mesh.quaternion` is useless — net yaw must come from the op-log (`placement.rot` + accumulated GEOM_ROTATE
`drot`, same composition the fold reads at :458).

**Change (preview side ONLY — the fold and `commitScale`'s local-axis op semantics are the contract, untouched):**
1. Helper `netYawDeg(fid)` — recover the insert's net yaw from the active op rows exactly as the fold composes it.
2. `scaleHandle`/`buildMoveGizmo`: scale-cube positions become `Rz(yaw)·dir·(L+0.5)` (move arrows + rotate ring
   stay as today — only the scale cubes rotate). Store the world drag direction on the handle.
3. Scale drag: extent + anchor come from the LOCAL-frame bbox (rotate baked geometry by `Rz(-yaw)`, take AABB —
   edge-anchored scale commutes with translation so this equals the fold's local bbox); drag delta = displacement
   projected onto the handle's world direction; `f = (ext' + delta)/ext'`.
4. `scaleGhostShow(ax, f)`: per-clone `matrixAutoUpdate=false`, matrix
   `M(f) = Rz(yaw)·T(anchor')·S(f)·T(-anchor')·Rz(-yaw)` — by construction identical to the fold's edge-anchored
   local scale. yaw=0 reduces to today's behaviour (byte-identical preview for unrotated inserts).
5. Components with 3-axis `rotX/rotY` placements: compose the same R the fold/`place()` uses; if composition is
   not cleanly recoverable for a case, fall back to today's world preview for that case only (no regression).

**Witness `witness_e2e_scalerot.js` (browser, e2e_harness):** author a box insert, rotate 90° yaw, then
(a) assert the 'x' scale cube's world offset now points along world Y (handle follows local axes);
(b) capture ghost AABB at f=2 BEFORE commit, `commitScale('x',2)`, assert folded mesh AABB == ghost AABB within
1e-3 (**preview==fold, the actual bug**); (c) unrotated control: ghost AABB matches today's behaviour.
**Must stay green:** W-E2E-SCALE 7/7 (unrotated Duplex wall drag), W-E2E-NUMROT 7/7 (scales at rot=0 by design),
W-STRETCH-RIDE (fold-side, untouched).

## §Q2 — instanceId pick identity for walked fixtures (W-E2E-INSTPICK)

**Approved slice (§DECISIONS 2):** instanceId-keyed pick/hover/frame ONLY — NO per-instance Outliner rows, NO
eye-toggle (deferred to virtualization). Facts: walked fixtures render as per-class InstancedMesh buckets
(`modeller.html:2346-2353`, `matN`=full list so `instanceId i ↔ sub[i]`), tagged only `userData.dwDisc`; today
`pickAt` (:768-774) intersects `g.children` non-recursively so dwRoot meshes are NEVER in the pick set; placement
records persist in `window.__dwWalks[disc]` (:2321); router/DB-walked placements carry `guid`, array/density ones
do NOT (`disc_walker.js:273-323` vs :591,616,677); `setColorAt` per-instance tint is proven on these meshes
(`_flashSettleDisc` :2405-2411); `frameFeature` (:740-766) assumes baked-world geometry — an instance needs
Box3 = geometry bbox × `getMatrixAt(instanceId)`.

**Change:**
1. `_renderDiscWalk _mesh()`: stamp `im.userData.dwSub = sub` (array REFERENCE, zero new objects — respects the
   Terminal-scale guard's intent; no eager 35k map).
2. `pickAt`: add `dwRoot.children` to the intersect set; on `hit.object.isInstancedMesh` resolve
   `p = hit.object.userData.dwSub[hit.instanceId]` → return an instance-hit descriptor (no featureId).
3. Click on an instance: status line `disc/ifc_class/storey (+guid when present)` + per-instance `setColorAt`
   tint (cleared on next pick/Esc; restore base colour, coexist with flash/gated/clash buckets by tinting the
   hit bucket only). Read-only identify+frame — instance hits do NOT enter `_selSet` (walked fixtures are not
   editable inserts; editing stays op-log-governed).
4. Hover parity: canvas hover over an instance = same `setColorAt` tint (NOT whole-material `_emis`, which would
   light the entire batch).
5. `frameInstance(im, i)`: Box3 from geometry bbox × instance matrix (× matrixWorld); refactor the camera-lerp
   tail of `frameFeature` into a shared `frameBox(c, diag)`.
6. Outliner dead-click upgrade (`bonsai_outliner.js:355-361`): lazy guid→(im,instanceId) reverse map (built on
   first miss by scanning dwRoot buckets' `dwSub` for `p.guid`); resolvable guid ⇒ `frameInstance` + tint +
   `§OUTLINER instpick` log instead of the toast; guid absent from map (array/density, no guid exists) ⇒ keep
   today's honest toast. Map invalidated on each `_renderDiscWalk`/clear.

**Witness `witness_e2e_instpick.js` (browser):** open a resident building, run a disc walk, then (a) canvas
click at a projected instance centre ⇒ `§PICK inst` log with the CORRECT placement record (assert
ifc_class+xyz match `__dwWalks` — maths, not eyes); (b) `instanceColor` set at that instanceId, cleared on
Esc; (c) guid-bearing walked row click in Outliner ⇒ camera centre lands within diag of the instance
(frameInstance) and NO toast; (d) guid-less row ⇒ toast still fires (regression pin on honest feedback);
(e) ARC row click behaviour unchanged. **Must stay green:** W-E2E-WALK 8/8, walkall_terminal_scale 6/6
(threshold-lowered proxy mode — identity stamping must not add per-frame cost), W-OL-SYNC 6/6.

## §Q3 — BCF 2.1 export-only MVP, real `.bcfzip` (W-BCF-EXPORT) — sequenced after §Q2

**Greenlit shape (§DECISIONS 3):** export ONLY (no import). One new self-contained module `modeller/bcf_export.js`:
- **Zip:** no zip lib exists in-repo (ExcelJS/SheetJS bundle theirs privately) — write a minimal STORE-method
  (no deflate) zip writer + CRC32 table in the module. Verified externally by the witness (`unzip -t`), not
  self-attested.
- **XML:** no XML serializer exists in-repo — template strings with a proper `xmlEsc()` for names/titles.
  Files: `bcf.version` (2.1) + `<TopicGuid>/markup.bcf` (Header/Topic/Title/CreationDate/Author + one Viewpoints
  entry + Components with `IfcGuid`) + `<TopicGuid>/viewpoint.bcfv` (PerspectiveCamera: CameraViewPoint =
  `A.camera.position`, CameraDirection = normalize(`controls.target − position`), CameraUpVector = live
  `camera.up` (scene mixes Y-up/Z-up presets — never assume), FieldOfView = `camera.fov`) +
  `<TopicGuid>/snapshot.png`.
- **Snapshot:** renderer has NO `preserveDrawingBuffer` (:300) — `renderer.render(scene,camera)` then
  `canvas.toDataURL('image/png')` same-tick (proven idiom `viewer/tools.js:354-357`), base64→bytes.
- **GUIDs:** selection fids → `window.__arcGuidByFid[fid]` (ARC bridge, `arc_editable.js:249-256`); §Q2
  instance-hit guid when present; fid with no guid ⇒ omit `IfcGuid` attr (component still listed by
  AuthoringToolId=fid) — non-invent, never synthesize a fake IfcGuid for a real element. Topic GUID =
  `crypto.randomUUID()`. Empty selection ⇒ topic with viewpoint+snapshot, zero Components (valid BCF).
- **UI:** `b-bcf` toolbar button cloning the `b-ifc` pattern (markup :165, handler :1685-1693, enable :2108);
  download `<building>.bcfzip` via the standard Blob/objectURL idiom (`bonsai_ifc.js:99-106`). Expose
  `window.Bonsai.bcf.exportBcf()` returning the bytes (testability seam).

**Witness `witness_e2e_bcf.js` (browser + shell):** author a box, select it, call exportBcf() → save bytes to
scratch → (a) system `unzip -t` exits 0 (independent container proof); (b) extracted markup.bcf contains the
selected element's real IfcGuid + xml-escaped title; (c) viewpoint.bcfv CameraViewPoint equals live
`A.camera.position` within 1e-6 and direction is unit-length toward `controls.target`; (d) snapshot.png begins
with the PNG magic bytes and is >1KB; (e) bcf.version says 2.1. All values read back from the ARTIFACT, not
from the code that wrote it.

## Sequencing + gate
§Q1 → §Q2 → §Q3 (BCF consumes §Q2's guid resolution). Each § lands as its own commit with its witness green +
touched-path regressions listed above. Suite gate before PR: the §FABLE5-NOW batch witnesses (W-OL-SYNC,
W-E2E-NUMROT, W-GESTURE-UNDO, W-GRID-NUMERIC) + W-E2E-{SCALE,ROTATE,MOVE,WALK} + walkall_terminal_scale.
Known-env: `bonsai_*_live.js` harness generation doesn't boot on this machine (pre-existing, identical on
clean main — not a signal); `smoke_strwalk_modeller.js` MODULE_NOT_FOUND (pre-existing).

## Non-goals (unchanged §NEEDS-DESIGN): eye/visibility toggle, filter→scene dimming, per-instance Outliner
rows, collapsed-ancestor auto-expand, virtualization, outline shader, shadows/AO, floating dims, PBR, R/S
shortcut keys, BCF import.
