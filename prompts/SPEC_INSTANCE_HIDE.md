# ⚠ DO NOT REMOVE — SPEC: per-instance hide inside a single THREE.InstancedMesh (§I5)
Scope: bim-compiler `prompts/FABLE5_WRAPUP_2026-07-03.md` Item 5 (decision locked by user).
Read the log after every run — exit code is not evidence.

## §I5 — Per-instance hide (extends §POLISH3 §V1 eye-toggle, keyed by §Q2 instanceId identity)

Ground truth measured first (build/probe_inst_rows.log, real ELEC walk on Duplex): walked fixtures
render as `dwDisc` InstancedMesh buckets whose `userData.dwSub[i]` records carry NO guid and have NO
Outliner rows today — §V1 hides whole buckets only ("per-instance hide DEFERRED per §DECISIONS-2").
This spec implements that deferred leg.

### §I5a Identity
The §Q2 contract is the identity: `hit.instanceId i ↔ im.userData.dwSub[i]` (array REFERENCE into
`window.__dwWalks[disc]`). One placement RECORD can be instanced into SEVERAL buckets
(`_renderDiscWalk` renders all/gated/clash overlays from the same record objects) — so the hide map
is keyed by the RECORD (object identity), resolving to every `{im, i}` twin. Outliner row key:
`dwp|<disc>|<idx>` where idx = index into `window.__dwWalks[disc]` (stable across redraws — the
records are the same objects the redraw re-renders).

### §I5b Hide technique (round-trip contract)
Hide = save the exact instance matrix (all 16 floats) on the mesh
(`im.userData.dwHiddenMat: Map(i → float[16])`), then write a ZERO-BASIS matrix (rotation/scale
columns zeroed, translation kept) → the instance rasterises no fragments. Show = restore the saved
16 floats verbatim (`W-E2E-INSTHIDE` asserts byte-equality) and drop the entry.
`im.userData.dwHidden: Set(i)` is the live hidden set. Session LENS like §V1: a re-walk/re-fold that
rebuilds buckets resets it (documented, not persisted).

### §I5b-TWIN The folded authored twin (measured ground truth — build/probe_frontmost.log)
A committed walk placement exists TWICE in the scene: the InstancedMesh marker (dwSub) AND a folded
authored `GEOM_INSERT` mesh `_commitDiscWalk` committed with `parameters._dw` + the SAME xyz (toFixed(4)).
Measured on a real ELEC walk (probe_pixels.log, probe_frontmost.log): the authored twin wins the raycast
at EVERY sampled spot and fully covers the marker — hiding only the instance changes ZERO pixels
(0/12), hiding instance+twin changes them (chBoth=true). The authored `_dw` twins have NO Outliner row
of their own (base categories fold only Walls/Openings), so the dwp row is the ONLY per-fixture row.
⇒ CONTRACT: `setPlacementVisible` hides/({shows}) the placement = every `{im,i}` instance twin
(zero-basis, §I5b) AND every authored `_dw` twin mesh (matched by `_dw.disc` + placement xyz toFixed(4),
via the §V1 `setFeatureVisible` leg). Anything less renders an eye that visibly does nothing.

### §I5b-ASM Assembly buckets (the pure-instanced leg)
`_renderDiscAssembly` buckets (`userData.dwAsm`, dwSub = part records from `window.__dwAssembly[disc]`)
are InstancedMesh-ONLY — never committed, no authored twin (W-E2E-INSTPICK P2b precedent). They get the
same rows (`dwa|<disc>|<idx>`, `n.dwp.asm=true`) and the same per-instance hide; this is where a real
mouse click/hover genuinely reaches the INSTANCE frontmost, so the §I5c pick/hover-exclusion claims are
proven here directly (on the walk side the twin covers the marker at every sampled angle —
probe_inst_frontmost.log: natural frontmost 0/25 across 10 records).

### §I5c Unpickable (hover AND click)
THREE's Raycaster does not honour our hidden set by contract (§V1 already learned invisible ≠
unpickable). `pickAt` — the ONE raycast every hover/click/shift-click path uses — filters the sorted
intersection list: a hit on `(im, instanceId)` present in `dwHidden` is SKIPPED, so the ray falls
through to the object behind (or nothing). `window.Bonsai.isInstanceHidden(im, i)` is the predicate.
(The zero-basis matrix also degenerates the triangles, but the explicit filter is the CONTRACT.)

### §I5d Outliner rows (inside the §V4 window)
New REGISTERED category (the outliner's designed extension seam, `addCategory`):
`modeller/dw_instances_outliner.js` — "Walked Fixtures": disc group → ifc_class group → one leaf
per placement (`n.dwp = {disc, idx}`), folded from `window.__dwWalks` each paint. Leaves render
THROUGH the existing `_renderNodes` windowed path (OL_CHUNK=250 per sibling list + "… show N more")
— only the open window's rows materialise eye elements; NOTHING renders all rows. Category hidden
when no walk exists (`hideWhenEmpty` — no dead header). `_hidable` marking honours `n.dwp`;
`_applyHidden` maps a hidden dwp node → `window.Bonsai.setPlacementVisible(disc, idx, false)`
(deterministic reset-then-reapply, unchanged §V1 flow). Group eyes (class/disc) recurse for free.

### §I5e Scene seams (modeller.html)
- `window.Bonsai.setPlacementVisible(disc, idx, vis, asm)` → toggles every `{im,i}` instance twin of
  the record (asm=true resolves idx into `window.__dwAssembly[disc]` instead of `__dwWalks`) AND, for
  walk records, every folded authored `_dw` twin mesh (§I5b-TWIN); returns the total twin count
  (0 = nothing to act on, honest). Logs `§INSTHIDE`.
- `window.Bonsai.isInstanceHidden(im, i)` → pick-filter predicate.
- `window.Bonsai.setAllVisible()` extended: restores every per-instance hide (the §V1 deterministic
  reset leg).
- `window.Bonsai.frameInstanceRow(rowId)` → a dwp row CLICK identifies (production `pickInstance`)
  + frames the instance (same `_frameTo` tail), instead of the stale "no 3D pick" toast.
- Record→refs map cached per `window.__dwInstVer` (bumped by `_renderDiscWalk` /
  `_renderDiscAssembly` / `_clearDiscWalk`).

### §I5f Witness — W-E2E-INSTHIDE (modeller/tests/witness_e2e_instance_hide.js, real chromium)
Real user path: open Duplex → production `discWalk('ELEC')` → real eye-glyph clicks on Outliner rows;
the pure-instanced leg renders assembly parts through the production seam `__dwRender.assembly`
(W-E2E-INSTPICK P2b precedent) and eye-clicks THEIR rows.
Claims (each a § line + maths, readPixels blocks at projected instance positions, fixed camera):
  (a) HIDE-ONE     — eye on one walked-placement row: its pixel block changes (instance zero-basis +
                     authored twin hidden, §I5b-TWIN); a sibling placement's block AND an
                     always-visible keeper's block stay BYTE-IDENTICAL.
  (b) ROUND-TRIP   — eye again: instance matrix byte-equals the pre-hide 16 floats AND the pixel
                     block byte-equals the pre-hide read (twin visible again).
  (c) UNPICKABLE   — on a pure-instanced assembly bucket (instance IS the frontmost hit, measured):
                     pre-hide control = real hover tints the instance + real click identifies it
                     (`__instPickActive` that record); after the row eye, real hover never tints it and
                     a real click never identifies it. Walk leg too: hidden placement's spot never
                     re-identifies its fixture.
  (d) MULTI        — 3 instances hidden in the SAME InstancedMesh: all zero-basis + all excluded
                     from pick; keeper still rendered; show-all restores every matrix + block.
  (e) WINDOWED     — with OL_CHUNK=50: exactly 50 dwp rows rendered for the big class + a
                     "… show more" row; every RENDERED row has a live eye (no full-list render).
Regression gate: witness_e2e_oleye, witness_e2e_olvirt, witness_e2e_instpick, witness_e2e_olfilter
re-run green; logs saved under build/ and READ.
