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
  var THROUGH_TOL = 0.05;     // m — SPEC_GEOM_CUT_RESIZE.md §3 anchorShift.through: the void overhangs the host
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

  // applyOverrides({c1,c2}, ov) → a NEW {c1,c2}; `ov` = one netOverrides byCut entry ({s,f}) or undefined ⇒ a copy.
  // SPEC_GEOM_CUT_RESIZE.md §2 FOLD ORDER: centre' = centre + Σshift; half' = half ⊙ Πfactor; c1' = centre' − half';
  // c2' = centre' + half' — the resize is about the void's OWN (already-shifted) centre, so shift and resize commute.
  function applyOverrides(v, ov) {
    if (!ov) return { c1: v.c1.slice(), c2: v.c2.slice() };
    var s = ov.s || [0, 0, 0], f = ov.f || [1, 1, 1], c1 = v.c1, c2 = v.c2, out1 = [0, 0, 0], out2 = [0, 0, 0];
    for (var k = 0; k < 3; k++) {
      var centre = (c1[k] + c2[k]) / 2 + (s[k] || 0);
      var half = Math.abs(c2[k] - c1[k]) / 2 * (f[k] != null ? f[k] : 1);
      var sign = c2[k] >= c1[k] ? 1 : -1;
      out1[k] = centre - sign * half; out2[k] = centre + sign * half;
    }
    return { c1: out1, c2: out2 };
  }

  // netOverrides(ops) → { byCut: {cutId: {s:[dx,dy,dz], f:[fx,fy,fz]}}, sig } over the ACTIVE rows of one fold. Same
  // walk as netShifts — sums GEOM_CUT_MOVE into s, multiplies GEOM_CUT_RESIZE into f (start [1,1,1]); only cutIds
  // that are an active GEOM_CUT in the same list count. A GEOM_CUT_RESIZE row with any factor ≤0 or non-finite is
  // IGNORED WHOLE (tolerant, like a cut-move naming a non-active cut) and logged. `sig` is a deterministic,
  // order-independent signature ('' when none) — the cache-key suffix (spec §2 CACHE); an entry whose resize is
  // still identity (f=[1,1,1]) prints the OLD shift-only shape so step 1's cache keys/signatures stay byte-identical
  // when no resize is in play; a resize (alone or with a shift) appends `*fx,fy,fz`.
  function netOverrides(ops) {
    var cuts = {}, byCut = {}, i, op, P, id;
    for (i = 0; i < (ops || []).length; i++) { op = ops[i]; if (op && op.op_type === 'GEOM_CUT') cuts[String(op.id)] = 1; }
    for (i = 0; i < (ops || []).length; i++) {
      op = ops[i]; if (!op) continue;
      if (op.op_type === 'GEOM_CUT_MOVE') {
        P = params(op); id = P.cutId != null ? String(P.cutId) : null;
        if (id == null || !cuts[id]) continue;                                    // tolerant: names no active cut → ignored
        var ov = byCut[id] || (byCut[id] = { s: [0, 0, 0], f: [1, 1, 1] });
        ov.s[0] += +P.dx || 0; ov.s[1] += +P.dy || 0; ov.s[2] += +P.dz || 0;
      } else if (op.op_type === 'GEOM_CUT_RESIZE') {
        P = params(op); id = P.cutId != null ? String(P.cutId) : null;
        if (id == null || !cuts[id]) continue;
        var fx = P.fx != null ? +P.fx : 1, fy = P.fy != null ? +P.fy : 1, fz = P.fz != null ? +P.fz : 1;
        var bad = function (v) { return !(v > 0) || !isFinite(v); };
        if (bad(fx) || bad(fy) || bad(fz)) { console.log(TAG + ' ignored GEOM_CUT_RESIZE #' + op.id + ': non-positive factor'); continue; }
        var ovr = byCut[id] || (byCut[id] = { s: [0, 0, 0], f: [1, 1, 1] });
        ovr.f[0] *= fx; ovr.f[1] *= fy; ovr.f[2] *= fz;
      }
    }
    var keys = Object.keys(byCut).filter(function (k) { var o = byCut[k]; return o.s[0] !== 0 || o.s[1] !== 0 || o.s[2] !== 0 || o.f[0] !== 1 || o.f[1] !== 1 || o.f[2] !== 1; })
      .sort(function (a, b) { return (+a) - (+b); });
    var sig = keys.map(function (k) {
      var o = byCut[k], out = k + ':' + o.s[0] + ',' + o.s[1] + ',' + o.s[2];
      if (o.f[0] !== 1 || o.f[1] !== 1 || o.f[2] !== 1) out += '*' + o.f[0] + ',' + o.f[1] + ',' + o.f[2];
      return out;
    }).join(';');
    return { byCut: byCut, sig: sig };
  }
  // netShifts(ops) → { byCut: {cutId: [dx,dy,dz]}, sig } — a thin backwards-compatible wrapper over netOverrides
  // (step 1's shape; bonsai_ifc keeps calling this) so callers unaware of resize see byte-identical output.
  function netShifts(ops) {
    var ov = netOverrides(ops), byCut = {};
    Object.keys(ov.byCut).forEach(function (k) { var s = ov.byCut[k].s; if (s[0] !== 0 || s[1] !== 0 || s[2] !== 0) byCut[k] = s; });
    return { byCut: byCut, sig: ov.sig };
  }
  function keySuffix(sig) { return sig ? '|cm:' + sig : ''; }

  // cutsOver(ops, hostFid, box) → every ACTIVE GEOM_CUT {parent: host} whose (net-overridden) void overlaps `box` —
  // the "a REAL carved void tied to THIS filling" rule bonsai_itemdrag.js bakedVoidFor introduced, now over the
  // CURRENT void (prior cut-moves/resizes applied) so a hole that was already slid/resized is still found under its door.
  function cutsOver(ops, hostFid, box) {
    var net = netOverrides(ops), out = [];
    for (var i = 0; i < (ops || []).length; i++) {
      var op = ops[i]; if (!op || op.op_type !== 'GEOM_CUT') continue;
      var P = params(op);
      if (!same(parentOf(op, P), hostFid) || !P.void || !P.void.c1 || !P.void.c2) continue;
      if (overlaps(voidBox(applyOverrides(P.void, net.byCut[String(op.id)])), box)) out.push(op);
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

  // §CUT-FRAME-ROTATE (prompts/SPEC_CUT_FRAME_ROTATE.md — cut-move step 3): hostFrame(ops, cutOp, hostBoxNow) →
  // { ok, M:{perm,a,b}, boxAtCut, reason }. M is the affine map authored→world composed from the ACTIVE post-cut ops
  // that transform the host, in log order: world_k = a_k · authored_{perm[k]} + b_k. With only TRANSLATE / SCALE /
  // a 90°-multiple ROTATE this map is "axis-aligned affine" (§1). TRANSLATE and SCALE are the SAME self-referential-
  // anchor transforms frameScale already walked (a SCALE anchors at its OWN current min, so the min's own trajectory
  // is purely additive translateDelta regardless of intervening scale factors — this is WHY frameScale never needed
  // to measure the host box). A 90°-multiple ROTATE has the identical property (it spins about its OWN current bbox
  // centre), so a BACKWARD replay from the measured `hostBoxNow` — undoing each post-cut op in reverse — recovers
  // `boxAtCut` (the host's box AT THE CUT's own moment) exactly, then a FORWARD replay from boxAtCut composes M
  // (tracking the box forward too, since SCALE's m_k and ROTATE's centre c are read off the box AT THAT MOMENT).
  var ROT_HALF_PI = Math.PI / 2;
  function mapPoint(M, p) { return [M.a[0] * p[M.perm[0]] + M.b[0], M.a[1] * p[M.perm[1]] + M.b[1], M.a[2] * p[M.perm[2]] + M.b[2]]; }
  // mapBox: authored box corners → world box (min/max per world axis; a_k may be negative under a rotation flip).
  function mapBox(M, box) {
    var c1 = [box[0], box[2], box[4]], c2 = [box[1], box[3], box[5]], w1 = mapPoint(M, c1), w2 = mapPoint(M, c2);
    return [Math.min(w1[0], w2[0]), Math.max(w1[0], w2[0]), Math.min(w1[1], w2[1]), Math.max(w1[1], w2[1]), Math.min(w1[2], w2[2]), Math.max(w1[2], w2[2])];
  }
  // swapXYAboutCentre: the box-shape effect of a 90° OR 270° rotation about the box's OWN centre (x/y half-extents
  // swap, centre invariant); self-inverse (applying it twice restores the original box) — used both forward and
  // backward for odd n. A 180° rotation about its own centre leaves the box shape unchanged (only M's sign/b flip).
  function swapXYAboutCentre(box) {
    var cx = (box[0] + box[1]) / 2, cy = (box[2] + box[3]) / 2, hx = (box[1] - box[0]) / 2, hy = (box[3] - box[2]) / 2;
    return [cx - hy, cx + hy, cy - hx, cy + hx, box[4], box[5]];
  }
  // applyRotateToM: compose a n·90° rotation (about the CURRENT box centre cx,cy) onto M — spec §1's three explicit
  // cases (n≡1 given verbatim; n≡2/n≡3 derived the same way — substitute world_x/world_y into the point-rotation law).
  function applyRotateToM(M, n, cx, cy) {
    var perm = M.perm, a = M.a, b = M.b;
    if (n === 1) { M.perm = [perm[1], perm[0], perm[2]]; M.a = [-a[1], a[0], a[2]]; M.b = [cx + cy - b[1], cy - cx + b[0], b[2]]; }
    else if (n === 2) { M.a = [-a[0], -a[1], a[2]]; M.b = [2 * cx - b[0], 2 * cy - b[1], b[2]]; }
    else if (n === 3) { M.perm = [perm[1], perm[0], perm[2]]; M.a = [a[1], -a[0], a[2]]; M.b = [cx - cy + b[1], cx + cy - b[0], b[2]]; }
  }
  function hostFrame(ops, cutOp, hostBoxNow) {
    var host = parentOf(cutOp, params(cutOp)), events = [], i;
    for (i = 0; i < (ops || []).length; i++) {
      var op = ops[i]; if (!op || !(op.id > cutOp.id)) continue;
      var P = params(op);
      if (op.op_type === 'GEOM_GRID_MOVE') {
        var cmds = P.commands || [];
        for (var j = 0; j < cmds.length; j++) {
          var c = cmds[j]; if (!c || !same(c.featureId, host)) continue;
          var k = AX[c.axis]; if (k == null) continue;
          if (c.action === 'TRANSLATE') { var d0 = [0, 0, 0]; d0[k] = +c.delta || 0; events.push({ type: 't', d: d0 }); continue; }
          var tiltX = typeof c.tiltXRad === 'number' && isFinite(c.tiltXRad) ? Math.abs(c.tiltXRad) : 0;
          var tiltY = typeof c.tiltYRad === 'number' && isFinite(c.tiltYRad) ? Math.abs(c.tiltYRad) : 0;
          if (tiltX > YAW_TOL || tiltY > YAW_TOL) continue;                     // worker: refused no-op
          var oblique = typeof c.yawRad === 'number' && isFinite(c.yawRad) && Math.abs(c.yawRad - Math.round(c.yawRad / HALF_PI) * HALF_PI) > YAW_TOL;
          if (oblique && (c.axis === 'x' || c.axis === 'y')) return { ok: false, reason: 'oblique-yaw-scale-after-cut (GEOM_GRID_MOVE #' + op.id + ')' };
          events.push({ type: 's', axis: k, f: c.newScale != null ? c.newScale : 1, t: +c.translateDelta || 0 });
        }
      } else if (op.op_type === 'GEOM_MOVE') {
        if (same(parentOf(op, P), host)) events.push({ type: 't', d: [+P.dx || 0, +P.dy || 0, +P.dz || 0] });
      } else if (op.op_type === 'GEOM_ROOM_MOVE') {
        var mem = P.members || []; for (var m = 0; m < mem.length; m++) if (mem[m] && same(mem[m].featureId, host)) { events.push({ type: 't', d: [+P.dx || 0, +P.dy || 0, +P.dz || 0] }); break; }
      } else if (op.op_type === 'GEOM_ROTATE') {
        if (!same(parentOf(op, P), host)) continue;
        var deg = P.drot != null ? P.drot : (P.deg || 0), theta = deg * Math.PI / 180, nExact = theta / ROT_HALF_PI, n = Math.round(nExact);
        if (Math.abs(theta - n * ROT_HALF_PI) > YAW_TOL) return { ok: false, reason: 'oblique-rotate-after-cut (GEOM_ROTATE #' + op.id + ') — the authored axis is no longer a world axis' };
        n = ((n % 4) + 4) % 4; if (n !== 0) events.push({ type: 'r', n: n });
      } else if (op.op_type === 'GEOM_ARRAY') {
        if (same(parentOf(op, P), host)) return { ok: false, reason: 'arrayed-after-cut (GEOM_ARRAY #' + op.id + ') — the host was replaced by clones' };
      }
    }
    // BACKWARD replay: hostBoxNow → boxAtCut, undoing each event in reverse.
    var box = hostBoxNow.slice();
    for (i = events.length - 1; i >= 0; i--) {
      var ev = events[i];
      if (ev.type === 't') { for (var kk = 0; kk < 3; kk++) { box[2 * kk] -= ev.d[kk] || 0; box[2 * kk + 1] -= ev.d[kk] || 0; } }
      else if (ev.type === 's') { var kx = ev.axis, minAfter = box[2 * kx], maxAfter = box[2 * kx + 1], minBefore = minAfter - ev.t, width = (maxAfter - minAfter) / (ev.f || 1); box[2 * kx] = minBefore; box[2 * kx + 1] = minBefore + width; }
      else if (ev.type === 'r' && (ev.n === 1 || ev.n === 3)) { box = swapXYAboutCentre(box); }
    }
    var boxAtCut = box;
    // FORWARD replay: compose M from boxAtCut, tracking the box forward for each SCALE's m_k / ROTATE's centre c.
    var M = { perm: [0, 1, 2], a: [1, 1, 1], b: [0, 0, 0] }, curBox = boxAtCut.slice();
    for (i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === 't') { for (var kt = 0; kt < 3; kt++) { M.b[kt] += e.d[kt] || 0; curBox[2 * kt] += e.d[kt] || 0; curBox[2 * kt + 1] += e.d[kt] || 0; } }
      else if (e.type === 's') {
        var ks = e.axis, mk = curBox[2 * ks], fk = e.f, tk = e.t;
        M.a[ks] *= fk; M.b[ks] = fk * M.b[ks] + mk * (1 - fk) + tk;
        var newMin = mk + tk, widthBefore = curBox[2 * ks + 1] - curBox[2 * ks];
        curBox[2 * ks] = newMin; curBox[2 * ks + 1] = newMin + fk * widthBefore;
      } else if (e.type === 'r') {
        var cx = (curBox[0] + curBox[1]) / 2, cy = (curBox[2] + curBox[3]) / 2;
        applyRotateToM(M, e.n, cx, cy);
        if (e.n === 1 || e.n === 3) curBox = swapXYAboutCentre(curBox);
      }
    }
    var check = mapBox(M, boxAtCut), TOL9 = 1e-9;
    for (i = 0; i < 6; i++) if (Math.abs(check[i] - hostBoxNow[i]) > TOL9) return { ok: false, reason: 'frame-replay-mismatch (axis ' + (i >> 1) + ')' };
    return { ok: true, M: M, boxAtCut: boxAtCut, reason: null };
  }
  // slideShiftM(d, M) → the authored-frame shift vector that moves the hole by WORLD delta d (the frame-general form
  // of slideShift; d is nonzero only on the slide's own world axis by construction, but this composes any 3-vector).
  function slideShiftM(d, M) {
    var s = [0, 0, 0];
    for (var k = 0; k < 3; k++) s[M.perm[k]] = (d[k] || 0) / (M.a[k] || 1);
    return s;
  }

  // anchorShift({ cutOp, ops, hostBox, axis, f, translateDelta, minShift }) → { ok, s, q, delta, residual, F, w, g,
  //   through, authoredAxis, reason }. hostBox = the host's measured PRE-DRAG AABB; f/translateDelta = the SCALE
  //   command about to fold; minShift = Σ TRANSLATE deltas on this axis preceding the SCALE in the same gesture.
  // Internally calls hostFrame (§CUT-FRAME-ROTATE) instead of frameScale, so a host rotated by a 90°-multiple after
  // its cut is handled too; for an unrotated host (M identity-perm, a=F) every number is BYTE-IDENTICAL to step 1/2.
  // `authoredAxis` = M.perm[axis] — the AUTHORED axis `s`/`g` land on (a caller placing them into a per-axis vector
  // MUST index by this, not by the world `axis` passed in, once a rotation can permute the frame).
  // §CUT-RESIZE: g = 1/f cancels THIS fold's own proportional widening (f·(F·w·g) = F·w, independent of sign/perm);
  // through = the void OVERHANGS the host on WORLD axis `axis` (mapped through M, compared with hostBox) — a
  // through-axis (the bCut's thickness axis) gets NO resize (shrinking it by 1/f could stop it cutting through).
  function anchorShift(a) {
    var k = typeof a.axis === 'string' ? AX[a.axis] : a.axis;
    var hf = hostFrame(a.ops, a.cutOp, a.hostBox);
    if (!hf.ok) return { ok: false, reason: hf.reason, F: null };
    var M = hf.M, pk = M.perm[k], ak = M.a[k];
    var net = netOverrides(a.ops), P = params(a.cutOp);
    var vb = voidBox(applyOverrides(P.void, net.byCut[String(a.cutOp.id)]));
    var vCentre = [(vb[0] + vb[1]) / 2, (vb[2] + vb[3]) / 2, (vb[4] + vb[5]) / 2];
    var w = vb[2 * pk + 1] - vb[2 * pk];                                       // authored-axis width on the pre-image axis
    var q = mapPoint(M, vCentre)[k];                                          // the hole's CURRENT world centre on axis k
    var minNow = a.hostBox[2 * k] + (+a.minShift || 0);
    var f = a.f != null ? a.f : 1, t = +a.translateDelta || 0;
    var delta = (q - minNow) * (f - 1) + t;                                    // the fold's proportional shift of it
    var s = -delta / (f * ak);
    var Fmag = Math.abs(ak);
    var wvb = mapBox(M, vb);                                                   // the void box mapped into WORLD
    var through = wvb[2 * k] < a.hostBox[2 * k] - THROUGH_TOL || wvb[2 * k + 1] > a.hostBox[2 * k + 1] + THROUGH_TOL;
    return { ok: true, s: s, q: q, delta: delta, residual: (f - 1) * Fmag * w, F: Fmag, w: w, g: 1 / f, through: through, authoredAxis: pk, reason: null };
  }

  return { TAG: TAG, AX: AX, OVERLAP_EPS: OVERLAP_EPS, THROUGH_TOL: THROUGH_TOL, voidBox: voidBox, shiftVoid: shiftVoid,
    applyOverrides: applyOverrides, netShifts: netShifts, netOverrides: netOverrides, keySuffix: keySuffix,
    cutsOver: cutsOver, frameScale: frameScale, slideShift: slideShift, hostFrame: hostFrame, mapPoint: mapPoint,
    mapBox: mapBox, slideShiftM: slideShiftM, anchorShift: anchorShift };
});
