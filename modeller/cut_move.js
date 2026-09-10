// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// cut_move.js — §CUT-MOVE (prompts/SPEC_GEOM_CUT_MOVE.md — Witness: W-CUT-MOVE / W-E2E-CUT-MOVE): the ONE definition
// of what a `GEOM_CUT_MOVE {cutId, parent, dx, dy, dz}` row MEANS, shared by the worker fold (bonsai_kernel_worker.js
// buildSolids), the IFC export (bonsai_ifc.js), the along-host slide (bonsai_itemdrag.js) and the grid ANCHOR path
// (bonsai_gridmove.js) — the bonsai_roommove.js pattern ("the production fold and the pure-node witnesses share exactly
// ONE definition of what the op means"). Nothing here touches occt or the DOM; every number is read from op rows and
// measured AABBs.
//
// THE OP: a signed GEOM_CUT row's `void` is hashed and can never be edited. GEOM_CUT_MOVE is a pure FOLD OVERRIDE (like
// GEOM_MOVE on an insert, bonsai_kernel.js foldChainToScene's summed `moveBy`): the fold pre-scans the active rows,
// sums the shifts per cutId, and subtracts the cut's void at `void + Σshift` AT THE CUT'S OWN LOG POSITION. The row is
// a no-op at its own position. A row naming a cut that is not an active GEOM_CUT in the same fold is IGNORED (tolerant,
// the worker's GEOM_MOVE-on-a-missing-parent rule) — never a throw, never a guess.
//
// THE FRAME (spec §3): the void is authored in world coordinates at the cut's log position; ops AFTER the cut that
// transform the host map it (TRANSLATE shifts; a GRID SCALE maps x → f·x + min·(1−f) + t about the host's CURRENT min;
// GEOM_ROTATE spins). Per axis the void's OFFSET from the host min, u = x − min, obeys u' = f·u under SCALE and is
// invariant under TRANSLATE, so with F = Π f_i over the post-cut SCALE commands on that axis:
//   slide  — a door slid by world t needs the hole moved by world t ⇒ authored shift s = t / F
//   anchor — a new SCALE (f, t) moves the hole's current world centre q by Δ = (q − min)(f − 1) + t (the fold's own
//            proportional shift); holding it ⇒ s = −Δ / (f · F). The width residual (f − 1)·F·w is REPORTED, not
//            corrected (a void RESIZE is step 2, spec preamble).
// A post-cut GEOM_ROTATE / GEOM_ARRAY on the host, or an obliquely-yawed SCALE (the worker's §SCALE-YAW-GUARD path),
// means the authored axis is no longer a world axis ⇒ ok:false — the consumer REFUSES (never approximates).
//
// TRIPLE-EXPORT: CommonJS (node witnesses), `self` (the module Web Worker imports this file; the main thread's
// <script> sees self === window). In the worker the file is evaluated as an ES module — no `require`, no `this`.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CutMove = factory();
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';
  var TAG = '§CUT-MOVE';
  var AX = { x: 0, y: 1, z: 2 };
  var OVERLAP_EPS = 1e-6;     // m — bonsai_itemdrag.js's own flush-contact rule (0 overlap = adjacency, not a hit)
  var HALF_PI = Math.PI / 2;
  var YAW_TOL = 0.01;         // rad — bonsai_kernel_worker.js §SCALE-YAW-GUARD / GRID_ROTATION_GUARD.md §1

  function params(op) { var P = op && op.parameters; return typeof P === 'string' ? JSON.parse(P) : (P || {}); }
  function parentOf(op, P) { return P && P.parent != null ? P.parent : op.parent; }
  function same(a, b) { return a != null && b != null && String(a) === String(b); }

  // voidBox({c1,c2}) → [xmin,xmax,ymin,ymax,zmin,zmax] (the _gateBoxes / boxByFid layout). Corner order is free.
  function voidBox(v) {
    var a = v.c1, b = v.c2;
    return [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[2], b[2])];
  }
  function overlaps(a, b) {
    return (Math.min(a[1], b[1]) - Math.max(a[0], b[0])) > OVERLAP_EPS &&
           (Math.min(a[3], b[3]) - Math.max(a[2], b[2])) > OVERLAP_EPS &&
           (Math.min(a[5], b[5]) - Math.max(a[4], b[4])) > OVERLAP_EPS;
  }
  // shiftVoid({c1,c2}, [dx,dy,dz]) → a NEW {c1,c2}; the input is untouched (the signed row is never rewritten).
  function shiftVoid(v, s) {
    var d = s || [0, 0, 0];
    return { c1: [v.c1[0] + (d[0] || 0), v.c1[1] + (d[1] || 0), v.c1[2] + (d[2] || 0)],
             c2: [v.c2[0] + (d[0] || 0), v.c2[1] + (d[1] || 0), v.c2[2] + (d[2] || 0)] };
  }

  // netShifts(ops) → { byCut: {cutId: [dx,dy,dz]}, sig } over the ACTIVE rows of one fold. Only cutIds that are an
  // active GEOM_CUT in the same list count; `sig` is a deterministic, order-independent signature of the non-zero
  // shifts ('' when none) — the cache-key suffix (spec §2 CACHE).
  function netShifts(ops) {
    var cuts = {}, byCut = {}, i, op, P, id;
    for (i = 0; i < (ops || []).length; i++) { op = ops[i]; if (op && op.op_type === 'GEOM_CUT') cuts[String(op.id)] = 1; }
    for (i = 0; i < (ops || []).length; i++) {
      op = ops[i]; if (!op || op.op_type !== 'GEOM_CUT_MOVE') continue;
      P = params(op); id = P.cutId != null ? String(P.cutId) : null;
      if (id == null || !cuts[id]) continue;                                      // tolerant: names no active cut → ignored
      var s = byCut[id] || (byCut[id] = [0, 0, 0]);
      s[0] += +P.dx || 0; s[1] += +P.dy || 0; s[2] += +P.dz || 0;
    }
    var keys = Object.keys(byCut).filter(function (k) { var s = byCut[k]; return s[0] !== 0 || s[1] !== 0 || s[2] !== 0; })
      .sort(function (a, b) { return (+a) - (+b); });
    var sig = keys.map(function (k) { var s = byCut[k]; return k + ':' + s[0] + ',' + s[1] + ',' + s[2]; }).join(';');
    return { byCut: byCut, sig: sig };
  }
  function keySuffix(sig) { return sig ? '|cm:' + sig : ''; }

  // cutsOver(ops, hostFid, box) → every ACTIVE GEOM_CUT {parent: host} whose (net-shifted) void overlaps `box` — the
  // "a REAL carved void tied to THIS filling" rule bonsai_itemdrag.js bakedVoidFor introduced, now over the CURRENT
  // void (prior cut-moves applied) so a hole that was already slid is still found under its door.
  function cutsOver(ops, hostFid, box) {
    var net = netShifts(ops), out = [];
    for (var i = 0; i < (ops || []).length; i++) {
      var op = ops[i]; if (!op || op.op_type !== 'GEOM_CUT') continue;
      var P = params(op);
      if (!same(parentOf(op, P), hostFid) || !P.void || !P.void.c1 || !P.void.c2) continue;
      if (overlaps(voidBox(shiftVoid(P.void, net.byCut[String(op.id)])), box)) out.push(op);
    }
    return out;
  }

  // frameScale(ops, cutOp, axis) → { ok, f:F, tPost, reason }. Walks the ACTIVE rows AFTER the cut that transform its
  // host on `axis` (0|1|2), mirroring bonsai_kernel_worker.js's own branches: GRID TRANSLATE / GEOM_MOVE / ROOM_MOVE
  // shift (tPost); GRID SCALE multiplies F and shifts by translateDelta (a TILTED scale is the worker's refuse-no-op ⇒
  // no effect; an OBLIQUE yaw is the worker's rotate→scale→rotate-back path ⇒ ok:false); GEOM_SCALE is the worker's
  // tolerant no-op on a B-rep solid ⇒ no effect; GEOM_ROTATE / GEOM_ARRAY ⇒ ok:false.
  function frameScale(ops, cutOp, axis) {
    var k = typeof axis === 'string' ? AX[axis] : axis, host = parentOf(cutOp, params(cutOp));
    var F = 1, tPost = 0, name = 'xyz'[k];
    for (var i = 0; i < (ops || []).length; i++) {
      var op = ops[i]; if (!op || !(op.id > cutOp.id)) continue;
      var P = params(op);
      if (op.op_type === 'GEOM_GRID_MOVE') {
        var cmds = P.commands || [];
        for (var j = 0; j < cmds.length; j++) {
          var c = cmds[j]; if (!c || !same(c.featureId, host) || c.axis !== name) continue;
          if (c.action === 'TRANSLATE') { tPost += +c.delta || 0; continue; }
          var tiltX = typeof c.tiltXRad === 'number' && isFinite(c.tiltXRad) ? Math.abs(c.tiltXRad) : 0;
          var tiltY = typeof c.tiltYRad === 'number' && isFinite(c.tiltYRad) ? Math.abs(c.tiltYRad) : 0;
          if (tiltX > YAW_TOL || tiltY > YAW_TOL) continue;                     // worker: refused no-op
          var oblique = typeof c.yawRad === 'number' && isFinite(c.yawRad) && Math.abs(c.yawRad - Math.round(c.yawRad / HALF_PI) * HALF_PI) > YAW_TOL;
          if (oblique && (c.axis === 'x' || c.axis === 'y')) return { ok: false, f: F, tPost: tPost, reason: 'oblique-yaw-scale-after-cut (GEOM_GRID_MOVE #' + op.id + ')' };
          F *= c.newScale != null ? c.newScale : 1; tPost += +c.translateDelta || 0;
        }
      } else if (op.op_type === 'GEOM_MOVE') {
        if (same(parentOf(op, P), host)) tPost += +(k === 0 ? P.dx : k === 1 ? P.dy : P.dz) || 0;
      } else if (op.op_type === 'GEOM_ROOM_MOVE') {
        var mem = P.members || [];
        for (var m = 0; m < mem.length; m++) if (mem[m] && same(mem[m].featureId, host)) { tPost += +(k === 0 ? P.dx : k === 1 ? P.dy : P.dz) || 0; break; }
      } else if (op.op_type === 'GEOM_ROTATE') {
        if (same(parentOf(op, P), host)) return { ok: false, f: F, tPost: tPost, reason: 'rotated-after-cut (GEOM_ROTATE #' + op.id + ') — the authored axis is no longer a world axis' };
      } else if (op.op_type === 'GEOM_ARRAY') {
        if (same(parentOf(op, P), host)) return { ok: false, f: F, tPost: tPost, reason: 'arrayed-after-cut (GEOM_ARRAY #' + op.id + ') — the host was replaced by clones' };
      }
    }
    return { ok: true, f: F, tPost: tPost, reason: null };
  }

  // slideShift(t, F) → the authored-frame shift that moves the hole by world t.
  function slideShift(t, F) { return (+t || 0) / (F || 1); }

  // anchorShift({ cutOp, ops, hostBox, axis, f, translateDelta, minShift }) → { ok, s, q, delta, residual, F, w, reason }
  //   hostBox = the host's measured PRE-DRAG AABB (boxByFid layout); f/translateDelta = the SCALE command about to
  //   fold; minShift = Σ TRANSLATE deltas on this axis that precede the SCALE in the same gesture (usually 0).
  function anchorShift(a) {
    var k = typeof a.axis === 'string' ? AX[a.axis] : a.axis;
    var fr = frameScale(a.ops, a.cutOp, k);
    if (!fr.ok) return { ok: false, reason: fr.reason, F: fr.f };
    var net = netShifts(a.ops), P = params(a.cutOp);
    var vb = voidBox(shiftVoid(P.void, net.byCut[String(a.cutOp.id)]));
    var vc = (vb[2 * k] + vb[2 * k + 1]) / 2, w = vb[2 * k + 1] - vb[2 * k];
    var minNow = a.hostBox[2 * k] + (+a.minShift || 0), minCut = a.hostBox[2 * k] - fr.tPost;
    var f = a.f != null ? a.f : 1, t = +a.translateDelta || 0;
    var q = minNow + fr.f * (vc - minCut);                                     // the hole's CURRENT world centre
    var delta = (q - minNow) * (f - 1) + t;                                    // the fold's proportional shift of it
    var s = -delta / (f * fr.f);
    return { ok: true, s: s, q: q, delta: delta, residual: (f - 1) * fr.f * w, F: fr.f, w: w, reason: null };
  }

  return { TAG: TAG, AX: AX, OVERLAP_EPS: OVERLAP_EPS, voidBox: voidBox, shiftVoid: shiftVoid, netShifts: netShifts,
    keySuffix: keySuffix, cutsOver: cutsOver, frameScale: frameScale, slideShift: slideShift, anchorShift: anchorShift };
});
