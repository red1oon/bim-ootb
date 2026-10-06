/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * cpe_load_path.js — §129.1 LOAD PATH (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §129.1,
 * implementation notes §129.4 v2-v8). A geological section through the structure, one stack lit
 * hop by hop, held at topout. Non-invent: the support relation is SupportSweep's own
 * (support_sweep.js), the seq/phase classification is ScheduleAuthor's own (schedule_author.js /
 * rates.js), the restore hand-back is the storey-reveal leg's own (A._applyDiscVisibility +
 * window.__forceFull), the solid overlay is navigate_find.js's own overlay-mesh idiom
 * (_buildShapeMeshes). Nothing here re-derives any of those four.
 *
 * v2: PICK/hop-counting restricted to load-bearing classes with a labelled storey; non-structural
 * elements are walked THROUGH but not counted; the chain must terminate on a footing/pile or a
 * §GROUND_CONNECTED member.
 * v4: isolation is by MATERIAL (ghost the rest, uniformly, no per-container exemption); the chain
 * is drawn as standalone clone meshes (navigate_find.js's own `_buildShapeMeshes` technique) — solid
 * no longer depends on which shared container a hop happens to live in.
 * v5-v7: a camera CUT to a fitted pose (fit-to-target lift, then a witness-projection bisection) —
 * WITHDRAWN in v8.
 * v8 (2026-09-15, red1 sighting v7 + two amendments — see §129.4): the camera cut is GONE. The film's
 * own camera HOLDS exactly where it is (frozen at arm, re-asserted through the hold, never touched at
 * restore — the same v3/v4 mechanism, brought back). PICK is plain max-load-bearing-depth again (no
 * in-shot filter); instead the HOLD POINT itself is SEARCHED forward from topout for the first tNorm
 * where the whole building is ≥80% in frame (`_searchHoldPoint`, sampling the film's own
 * `plan.poseAt()` — no render). CUT returns in a narrower form: ONE clip plane, facing the camera,
 * placed just in front of the chain's own nearest face, applied ONLY to this beat's own ghost
 * material clones (never `A.sectionPlane`/the renderer's shared clipping array) — the rest of the
 * building beyond the plane stays ghosted and visible, proving v1's "everything hidden" defect is
 * gone (`beyondVisible>0`). FRAMING settled on PASS iff at least one hop intersects the frame.
 * Load-path (+ ledger + cost odometer) now gate under `--measure`, not a separate flag.
 *
 * ONE PURE BUILD, PER-FRAME APPLY, PER-FRAME 2D COMPOSITE, ONE DISPOSE — the same four-hook shape
 * cpe_flythru_cues.js already uses (A.flythruCuesBuild/ApplyVisual/CompositeOntoCanvas/Dispose), so
 * cinema_maxq.js's bake loop wires this exactly like its neighbours, not a fifth pattern.
 *
 * Witness lines: §LOADPATH_BUILD, §LOADPATH_SHOT, §LOADPATH_PICK, §LOADPATH_CHAIN,
 * §LOADPATH_VISIBLE, §LOADPATH_FRAMING, §LOADPATH_HOLD, §LOADPATH_RESTORE, §LOADPATH_WINDOW_SHIFT.
 * Control taps: window.__lpBreakSupport (CHAIN must FAIL), window.__lpSkipRestore (RESTORE must
 * FAIL), window.__lpHideRest (VISIBLE must FAIL), window.__lpFrameOff (FRAMING must FAIL),
 * window.__lpClipAll (VISIBLE must FAIL — post-v8b-hardening, the clip plane is pushed behind
 * every real ghost candidate on purpose, so `beyondVisible` correctly reads 0; the FAIL shows up as
 * `clipped`/`nearSideClipped` at their max instead, the same "everything hidden" degenerate state
 * this control exists to catch — this line only names which field used to carry it, not which does now).
 * No pixel evidence — every claim is a printed value, never a frame judgement.
 */
function setupCpeLoadPath(A) {
  'use strict';
  // <split-driver> (readUnsplit() in viewer/tests/_split_families.js rebuilds the original body here)
  // Body split move-only into lp_chain.js, lp_geom_pick.js, lp_build.js, lp_backdrop_diag.js, lp_apply_restore.js, lp_hud.js (loaded before this file) by scripts/split_closure.js
  // (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md). Each part is a generator: phase 1 (to its `yield`) hoists its
  // functions/vars and publishes shared names on LPS; phase 2 runs its original statements, parts in original order.
  var R = (typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts || {};
  var ORDER = ["chain","geom_pick","build","backdrop_diag","apply_restore","hud"];
  var missing = ORDER.filter(function (n) { return typeof R[n] !== 'function'; });
  if (missing.length) { console.warn('§SPLIT_PART_MISSING cpe_load_path ' + missing.join(',')); return; }
  var LPS = {};
  var parts = ORDER.map(function (n) { return R[n](LPS, A); });
  parts.forEach(function (p) { p.next(); });   // phase 1
  for (var j = 0; j < parts.length; j++) { var r2 = parts[j].next();   // phase 2
    if (r2 && r2.value && r2.value.__splitReturn) return r2.value.value; }   // an early `return` in the original stops the whole setup
  // </split-driver>
}
if (typeof window !== 'undefined') window.setupCpeLoadPath = setupCpeLoadPath;
if (typeof module !== 'undefined' && module.exports) module.exports = setupCpeLoadPath;
