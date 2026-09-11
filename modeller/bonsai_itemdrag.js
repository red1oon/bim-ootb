/**
 * BIM OOTB — Free single-item interactive drag (Feature B of ROOM_MOVE_AND_ITEM_DRAG_SPEC.md).
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// bonsai_itemdrag.js — Implementing prompts/Modeller/ROOM_MOVE_AND_ITEM_DRAG_SPEC.md §3 (Feature B) —
// Witness: W-ITEM-DRAG-GATE.
//
// Drag ONE non-structural leaf element. The load-bearing rule of this whole file (spec §1 item 5 / §3.2 / §3.4):
//
//   REFUSE, DON'T FABRICATE.
//
// The session is gated UP FRONT by real_placement_resolver.js's `resolveRealPlacement()`. On NO MATCH that gate
// THROWS a `WalkerGapError` and this module lets it PROPAGATE — the drag never starts and the item never moves.
// There is deliberately NO catch-and-substitute of the element's own AABB, of a catalog box, or of any constant
// as a stand-in validation box: that silent substitution is, verbatim from the gate's own header, "the exact
// violation this gate exists to make structurally hard to reintroduce". This is knowingly STRICTER than
// pascalorg's `{valid:false}`-and-retry, and it is NOT to be softened (spec §4 non-goal).
//
// Q5 — RESOLVED AGAINST THE LIVE CODE, and the answer is "refuse" for every element in the log today:
//   • What the walkers pass: routewalker.js:1177 calls `resolveRealPlacement({discipline, category: product,
//     ifc_class, productHint: product})` where `product` is an `ad_space_type_mep_bom.mep_product_id` value
//     ('TOILET','SINK','OUTLET','SWITCH','LIGHT','SPRINKLER',…) — routewalker.js:1151.
//   • What survives into the op-log: NOTHING of that identity. `bonsai_oplog.js` `commit()` persists exactly
//     `{op_type, params: op.parameters}` (bonsai_oplog.js:322) — the product identity rides on the SIDECAR
//     fields `_rw` (modeller.html:3104) / `_dw` (modeller.html:4325), which are properties of the JS op object
//     and are never written to `kernel_ops`. A committed fixture's `parameters` are `{hash, placement, lod,
//     color}`; an ARC-seeded element's are `{bbox, color, provenance, ifc_class, opacity, …}`
//     (arc_editable.js:275). Neither carries a product id or alias key.
//   • What we deliberately DO NOT do: derive a hint from `parameters.hash`. modeller.html's `FIX_HASH`
//     (modeller.html:3076-3078) is NOT invertible — it is many-to-one (`OUTLET` and `OUTLET_GFCI` both map to
//     `ROLE__OUTLET`) and non-uniform (`CEILING_FAN`→`ROLE__FAN`, `SUPPLY_DIFFUSER`→`ROLE__DIFFUSER`), and
//     `hashFor()` falls back to "any catalog box of the right ifc_class" anyway, so the committed hash is not
//     even reliably a role hash. Inverting it would be INVENTING an equivalence. Likewise we do not parse
//     `elements_meta.name` — the resolver's own header rules out fuzzy/semantic matching.
//   ⇒ Consequence, and it is the spec's own anticipated outcome: with today's substrate an item drag on a
//     log-sourced element REFUSES at `beginItemDragSession`. A caller that genuinely HOLDS the product id at
//     drag time (e.g. a catalog-drop flow that still has it in hand) may pass `opts.productHint` and the drag
//     proceeds on REAL dims. Nothing is ever derived, defaulted, or guessed.
//
// §SLIDE — the along-host OPENING SLIDE (spec §3.1: "A FILLING (door/window) may be dragged … but its motion is
// constrained along its real host wall (Q5 scopes v1)"; Q5's last clause asks "whether filling-drag (along-host
// slide) is in or out of v1 scope" — resolved IN here). Witness: W-E2E-OPENING-SLIDE (witness_e2e_opening_slide.js).
//   S1 SESSION — a dragged fid that a REAL rel_fills_host row names as `filling_guid` (through the §ARC-1 bridge,
//      first host that resolves to a scene feature — stretchRide's own "first host wins") starts a SLIDE session
//      instead of the resolver-gated fixture session above. This is NOT the catch-and-substitute §3.2 forbids: the
//      resolver is never consulted for a filling because there is nothing for it to look up — REAL_PRODUCT_DIM keys
//      MEP product ids (TOILET/SINK/…, real_placement_resolver.js:43-62) and carries no door/window row, while BOTH
//      inputs a slide needs are recovered rows: the host is the edge's `host_guid` (provenance ifc:recovered, never
//      proximity) and the dims are the filling's OWN measured pre-drag AABB — the very boxByFid snapshot
//      sdg_cascade.js stretchRide already rides on (extent never changes in a slide; a rigid translate needs no
//      catalog). Refusals (session → null, logged `§ITEMDRAG §SLIDE REFUSED`): host not WALL-class; host obliquely
//      yawed/tilted per GridKinematics' OWN _isObliqueYaw/_hasTilt (an oblique host's AABB long edge is not its
//      plane — the same §ROTATION-GUARD gridmove applies); host body not a plain axis-aligned box — for a
//      GEOM_INSERT per Bonsai._insertCutBox's OWN vertex test (a real LOD-300 wall mesh carries its door holes BAKED
//      IN — no op can translate them; measured 2026-09-10: EVERY real SampleHouse host refuses here, honestly), for
//      a GEOM_EXTRUDE_POLY per plainExtrudeProfile() below (a 4-point axis-aligned rectangle; its holes are GEOM_CUT
//      ops, caught next — mirrors bonsai_kernel.js canCut's "a non-insert solid is already worker-native B-rep");
//      host class KNOWN and not WALL (an unrecorded class = freshly-sketched content stays eligible, the SAME rule
//      bonsai_gridmove.js elementData applies); SdgGate unavailable (cannot gate honestly). An ACTIVE GEOM_CUT whose
//      `parent` IS the host and whose void box overlaps the filling's pre-drag box (a REAL carved void tied to this
//      filling) NO LONGER refuses — §CUT-MOVE (prompts/SPEC_GEOM_CUT_MOVE.md §4): the session records every such cut
//      and the slide commits one GEOM_CUT_MOVE rider per cut (S5), so the hole travels with the door. It still refuses
//      when cut_move.js or the full active op list is unavailable, or the host was rotated/arrayed after the cut
//      (cut_move.js frameScale: no honest authored→world frame) — never a guessed frame.
//   S2 CONSTRAINT — 1-DOF, OWNED BY THE ENGINE (prompts/SPEC_DAGEVU_SLIDE.md §2-3): dagevu_engine.js
//      HostFillEdge.constrain(candidate − preCentre, {boxByFid}) is the ONE place the along-host projection + bounds
//      live — axis = the host AABB's LONG plan axis (the complement of the thin axis resolveHost's wall branch snaps
//      along); the orthogonal coordinate and z are HELD at their pre-drag values (the filling↔host face offset stays
//      invariant, exactly as stretchRide holds it). Bounds are delta-honest: the filling (∪ its seeded
//      IfcOpeningElement) may slide until flush with either wall end (± FIT_TOL = HOST_TOL); an as-extracted overhang
//      is never pushed further out, and never "fixed". Beyond the ends the engine returns null (never a clamp);
//      snappedPos = the constrained point — a derivation from the real host (spec §3.3), never a nudge away from a
//      conflict. The engine is a HARD dependency of the slide: absent ⇒ REFUSE (the free-drag path is untouched).
//   S3 GATE — per frame AND at drop: SdgGate.evaluate(preBoxes, shiftedBoxes, moved, rel) — the codebase's own
//      RED/ORANGE conformity logic, reused unmodified. Any RED (clash / door-out / door-crush) ⇒ valid:false with
//      the offending fids; ORANGE is soft (reported, never blocks). Delta-honest by construction: a pre-existing
//      as-extracted overlap never blocks a slide. Measured on real Duplex: a curtain-window raw bbox covers a door,
//      two corner walls and the coverings — the ABSOLUTE overlap test the fixture path uses (overlaps() below) would
//      refuse every real filling at t=0, so it is not the honest rule for moving an EXISTING element.
//   S4 OP SHAPE — GEOM_MOVE {parent: fillingFid, dx,dy,dz} (the existing row shape). When the row's `opening_guid`
//      resolves to a seeded IfcOpeningElement (a VISIBLE raw-bbox insert on this substrate — the representational
//      void), ONE rider GEOM_MOVE {parent: openingFid, same delta, induced:'fills-opening'} rides with it, committed
//      together through oplog.commitGesture (one gesture = one Ctrl+Z, §P8 — the exact pattern gridmove.commit uses
//      for stretch riders). No opening seeded ⇒ the single commit() path, unchanged.
//   S5 BUILT 2026-09-11 — GEOM_CUT_MOVE {cutId, parent, dx,dy,dz, induced:'fills-opening'} (prompts/SPEC_GEOM_CUT_MOVE.md):
//      the worker fold shifts the cut's void BEFORE subtracting; the slide's world delta rides in the cut's AUTHORED
//      frame (cut_move.js slideShift = t / F, F = the host's post-cut SCALE product). One rider per overlapping cut,
//      same gesture group as S4. Holes BAKED into extracted LOD-300 meshes stay refused (the plain-box rule above).
//
// DUAL-EXPORT (window + node) like sdg_cascade.js / real_placement_resolver.js so the witness runs pure-node.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BonsaiItemDrag = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var TAG = '§ITEMDRAG';

  // Same literal list bonsai_gridmove.js declares (bonsai_gridmove.js:64-65). Copied, not imported, so this
  // module stays pure/node-witnessable and the grid adapter is never modified by this feature.
  var STRUCTURAL_CLASSES = ['IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcFooting', 'IfcColumn', 'IfcBeam',
    'IfcRailing', 'IfcStairFlight', 'IfcRoof'];

  // requires_host (a REAL `ad_product_dim` column value — 'WALL'/'FLOOR'/'CEILING', see
  // real_placement_resolver.js:43-62) → the IFC classes that can physically BE that host. A DISCLOSED mapping
  // over class names that already exist literally in STRUCTURAL_CLASSES above; no new class name is introduced.
  // Note IfcSlab appears under both FLOOR and CEILING on purpose: which one a given slab IS is decided
  // GEOMETRICALLY below (top face under the item vs underside above it), never by its name.
  var HOST_CLASSES = {
    WALL: ['IfcWall', 'IfcWallStandardCase'],
    FLOOR: ['IfcSlab', 'IfcFooting'],
    CEILING: ['IfcSlab', 'IfcRoof']
  };
  var HOST_TOL = 0.05;      // m — the SAME tolerance sdg_gate.js's own withinXY oracle uses (see
                            // witness_stretch_ride.js:61-64, which replicates it verbatim).
  var OVERLAP_EPS = 1e-6;   // m — flush face CONTACT (0 overlap) is adjacency, not a clash: cross_edges.js's
                            // faceTouch treats a 0-overlap face as a TOUCH, and modeller.html's `_gateRel`
                            // (modeller.html:2503-2510) declares abuts/hosted-by EXPECTED contact, never a clash.

  function box(cx, cy, cz, w, d, h) {
    return [cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, cz - h / 2, cz + h / 2];
  }
  function overlaps(a, b) {
    return (Math.min(a[1], b[1]) - Math.max(a[0], b[0])) > OVERLAP_EPS &&
           (Math.min(a[3], b[3]) - Math.max(a[2], b[2])) > OVERLAP_EPS &&
           (Math.min(a[5], b[5]) - Math.max(a[4], b[4])) > OVERLAP_EPS;
  }
  function planOverlaps(a, b, tol) {
    tol = tol || 0;
    return (Math.min(a[1], b[1]) - Math.max(a[0], b[0])) > -tol &&
           (Math.min(a[3], b[3]) - Math.max(a[2], b[2])) > -tol;
  }

  // Soft dependencies resolved LAZILY at call time (cross_edges.js:52 documents why a load-time capture would
  // freeze a null): the caller's ctx value first, then the page global, then a node require for the witnesses.
  function _dep(ctxVal, winKey, file) {
    if (ctxVal) return ctxVal;
    if (typeof window !== 'undefined' && window[winKey]) return window[winKey];
    if (typeof require === 'function') { try { return require(file); } catch (e) { } }
    return null;
  }

  // ── §3.1 ELIGIBILITY ────────────────────────────────────────────────────────────────────────────────
  // A HOST (anything appearing as `host_guid` in the REAL rel_fills_host edges) is EXCLUDED — walls move via
  // gridmove or Feature A. A structural class is excluded. A FILLING may be dragged (sdg_cascade.js's own
  // directional rule says it never drags its host) — its motion is the constrained along-host slide (§SLIDE in
  // this file's header), never a free 3D drag: beginItemDragSession routes a real filling to beginSlideSession.
  function eligibility(ctx) {
    var fid = ctx.fid, guidByFid = ctx.guidByFid || {}, cls = (ctx.classByFid || {})[fid];
    var structural = ctx.structuralClasses || STRUCTURAL_CLASSES;
    if (cls != null && structural.indexOf(cls) !== -1)
      return { ok: false, reason: 'structural-class:' + cls };
    var g = guidByFid[fid];
    if (g != null && Array.isArray(ctx.fills)) {
      for (var i = 0; i < ctx.fills.length; i++) if (ctx.fills[i] && ctx.fills[i].host_guid === g)
        return { ok: false, reason: 'is-a-host (rel_fills_host host_guid) — hosts move via gridmove or GEOM_ROOM_MOVE' };
    }
    return { ok: true };
  }

  // ── §3.2 SESSION START — THE GATE, UP FRONT ─────────────────────────────────────────────────────────
  // ctx: { fid, insertParams, boxByFid, classByFid, guidByFid, fills, resolver, discipline?, productHint? }
  // MATCH  → returns the session holding the REAL {width,depth,height,anchor{requires_host,conn_points},
  //          matchedProductId,source} and the pre-drag box, and the drag begins.
  // NO MATCH → the resolver's WalkerGapError PROPAGATES (uncaught here, by design). The caller must log it and
  //          count the drag refused; the item does not move.
  function beginItemDragSession(ctx) {
    ctx = ctx || {};
    var fid = ctx.fid;
    var el = eligibility(ctx);
    if (!el.ok) {
      console.error(TAG + ' REFUSED fid=' + fid + ' — ' + el.reason + ' (spec §3.1)');
      return null;
    }
    var boxByFid = ctx.boxByFid || {};
    var pre = boxByFid[fid];
    if (!pre) {
      console.error(TAG + ' REFUSED fid=' + fid + ' — no pre-drag AABB in the session snapshot (nothing honest to snap back to)');
      return null;
    }
    // §SLIDE S1: a real FILLING takes the constrained slide session — the resolver is not consulted for it.
    var fe = fillingEdge(ctx, fid);
    if (fe) {
      if (fe.hostFid == null) {
        console.error(TAG + ' §SLIDE REFUSED fid=' + fid + ' — rel_fills_host names this filling but its host_guid resolves to no scene feature (no honest host to slide along; mirrors stretchRide "no fid → no ride")');
        return null;
      }
      return beginSlideSession(ctx, fe, pre);
    }
    var params = ctx.insertParams || {};
    var resolver = ctx.resolver ||
      (typeof window !== 'undefined' && window.RealPlacementResolver) || null;
    if (!resolver || !resolver.resolveRealPlacement)
      throw new Error(TAG + ' RealPlacementResolver not loaded — cannot gate the drag; refusing rather than proceeding ungated');
    // productHint: ONLY what the caller genuinely holds. Never derived from params.hash / elements_meta.name
    // (see the Q5 block in this file's header). Absent ⇒ the resolver throws ⇒ the drag refuses. That is the
    // designed outcome, not a gap to paper over.
    var real = resolver.resolveRealPlacement({
      discipline: ctx.discipline || null,
      category: ctx.productHint || null,
      ifc_class: params.ifc_class || null,
      productHint: ctx.productHint || null
    });
    var session = {
      fid: fid, real: real, preBox: pre.slice(),
      preCentre: [(pre[0] + pre[1]) / 2, (pre[2] + pre[3]) / 2, (pre[4] + pre[5]) / 2],
      // §SCALE_CHECK_FIX-style session cache: every OTHER element's pre-drag AABB, built ONCE. The dragged fid
      // is excluded here so the per-frame collision test never has to re-filter it.
      gateBoxes: (function () { var o = {}; Object.keys(boxByFid).forEach(function (k) { if (String(k) !== String(fid)) o[k] = boxByFid[k]; }); return o; })(),
      classByFid: ctx.classByFid || {}
    };
    console.log(TAG + ' §SESSION begin fid=' + fid + ' product=' + real.matchedProductId +
      ' dims(w,d,h)=' + real.width + ',' + real.depth + ',' + real.height +
      ' requires_host=' + real.anchor.requires_host + ' source=' + real.source);
    return session;
  }

  // ── §SLIDE S1 — the FILLING's real edge and the constrained session ─────────────────────────────────
  // fillingEdge(ctx, fid) → null (not a filling), or {edge, hostFid, openingFid} — hostFid null when rows exist
  // but no host_guid resolves through the bridge. fidByGuid is the caller's (window.__arcFidByGuid) or the exact
  // inverse of guidByFid (the §ARC-1 bridge is 1:1 — arc_editable.js buildBridge writes both from ONE list).
  function fillingEdge(ctx, fid) {
    var g = (ctx.guidByFid || {})[fid];
    if (g == null || !Array.isArray(ctx.fills)) return null;
    var fbg = ctx.fidByGuid;
    if (!fbg) { fbg = {}; Object.keys(ctx.guidByFid).forEach(function (k) { fbg[ctx.guidByFid[k]] = isNaN(+k) ? k : +k; }); }
    var saw = null;
    for (var i = 0; i < ctx.fills.length; i++) {
      var e = ctx.fills[i];
      if (!e || e.filling_guid !== g) continue;
      saw = e;
      var h = fbg[e.host_guid];
      if (h == null) continue;                                  // first host that IS a scene feature wins (stretchRide)
      var o = e.opening_guid != null ? fbg[e.opening_guid] : null;
      return { edge: e, hostFid: h, openingFid: o != null ? o : null };
    }
    return saw ? { edge: saw, hostFid: null, openingFid: null } : null;
  }
  // The host's in-plan pose from its committed GEOM_INSERT placement — the SAME read bonsai_gridmove.js
  // _buildInsertMaps does (`.rot` is DEGREES at this boundary → radians; rotX/rotY already radians).
  function hostPose(pl) {
    if (!pl) return { yawRad: undefined, tiltX: undefined, tiltY: undefined };
    return { yawRad: typeof pl.rot === 'number' ? pl.rot * Math.PI / 180 : undefined,
             tiltX: typeof pl.rotX === 'number' ? pl.rotX : undefined, tiltY: typeof pl.rotY === 'number' ? pl.rotY : undefined };
  }
  // An ACTIVE GEOM_CUT {parent: host, void:{c1,c2}} (modeller.html bCut's own row shape) whose void box overlaps
  // the filling's pre-drag box = a REAL carved void tied to THIS filling. Returns the cut's op id, else null.
  function bakedVoidFor(cutOps, hostFid, box) {
    for (var i = 0; i < cutOps.length; i++) {
      var c = cutOps[i], P = c.parameters || c.params || {};
      if (P.parent == null || String(P.parent) !== String(hostFid) || !P.void || !P.void.c1 || !P.void.c2) continue;
      var a = P.void.c1, b = P.void.c2;
      var vb = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[2], b[2])];
      if (overlaps(vb, box)) return c.id;
    }
    return null;
  }
  // plainExtrudeProfile(points) → true iff a GEOM_EXTRUDE_POLY profile is a 4-point AXIS-ALIGNED rectangle with real
  // extent on both axes — the sketched-wall body whose AABB long axis IS its run (an L-shaped or oblique profile has
  // an AABB the door could slide into thin air along). Reads the op's own parameters; derives nothing.
  function plainExtrudeProfile(points) {
    if (!Array.isArray(points) || points.length !== 4) return false;
    var EPS = 1e-9, xs = [], ys = [];
    for (var i = 0; i < 4; i++) {
      var a = points[i], b = points[(i + 1) % 4];
      if (!a || !b || a.length < 2 || b.length < 2) return false;
      var dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
      if (!((dx <= EPS && dy > EPS) || (dy <= EPS && dx > EPS))) return false;   // every edge axis-parallel and non-degenerate
      xs.push(a[0]); ys.push(a[1]);
    }
    return (Math.max.apply(null, xs) - Math.min.apply(null, xs)) > EPS && (Math.max.apply(null, ys) - Math.min.apply(null, ys)) > EPS;
  }
  // Fallback gate relation derived from the SAME fills rows when the caller passes no `rel` — the fills half of
  // modeller.html's _gateRel (host↔filling = expected contact, hostOf drives door-out); abuts need the derived
  // edge set the page holds, so a caller that has it passes rel:_gateRel() (the browser layer below does).
  function relFromFills(ctx, fbg) {
    var relSet = {}, hostOf = {};
    (ctx.fills || []).forEach(function (e) {
      var h = fbg[e.host_guid], f = fbg[e.filling_guid];
      if (h == null || f == null) return;
      relSet[Math.min(+h, +f) + '|' + Math.max(+h, +f)] = 1; hostOf[f] = h;
    });
    return { related: function (a, b) { return !!relSet[Math.min(+a, +b) + '|' + Math.max(+a, +b)]; }, hostOf: hostOf, abuts: [] };
  }
  function beginSlideSession(ctx, fe, fb) {
    var fid = ctx.fid, boxByFid = ctx.boxByFid || {}, hb = boxByFid[fe.hostFid];
    var refuse = function (why) { console.error(TAG + ' §SLIDE REFUSED fid=' + fid + ' host=' + fe.hostFid + ' — ' + why); return null; };
    if (!hb) return refuse('host has no pre-drag AABB in the session snapshot');
    var hcls = (ctx.classByFid || {})[fe.hostFid];
    if (hcls != null && HOST_CLASSES.WALL.indexOf(hcls) === -1) return refuse('host class ' + hcls + ' is not a WALL (HOST_CLASSES.WALL) — only the wall-face slide is defined');   // unrecorded class (sketched) stays eligible, as in gridmove
    var GK = _dep(ctx.kinematics, 'GridKinematics', './grid_kinematics.js');
    if (!GK || !GK._isObliqueYaw || !GK._hasTilt) return refuse('GridKinematics yaw guard unavailable — cannot verify the host plane is AABB-representable');
    var pose = hostPose((ctx.placementByFid || {})[fe.hostFid]);
    if (GK._isObliqueYaw(pose.yawRad) || GK._hasTilt(pose.tiltX, pose.tiltY))
      return refuse('host is obliquely yawed / tilted (§ROTATION-GUARD, yaw=' + pose.yawRad + ') — its AABB long edge is not its plane; refusing rather than sliding along an unreal axis');
    if (typeof ctx.plainBoxOf !== 'function') return refuse('no plainBoxOf oracle supplied — cannot verify the host body carries no baked opening');
    if (!ctx.plainBoxOf(fe.hostFid)) return refuse('host body is not a plain axis-aligned box (Bonsai._insertCutBox rule) — a real blob may carry a baked opening no op can translate; refusing rather than leaving a hole behind');
    if (!Array.isArray(ctx.cutOps)) return refuse('no cutOps (active GEOM_CUT rows) supplied — cannot verify whether a carved void is tied to this filling');
    // §CUT-MOVE (prompts/SPEC_GEOM_CUT_MOVE.md §4): a REAL carved void over the filling used to REFUSE here ("no op
    // exists to translate a committed void"). It now RIDES — every overlapping active GEOM_CUT (cut_move.js cutsOver,
    // over the CURRENT net-shifted voids) is recorded and resolveDrop emits one GEOM_CUT_MOVE per cut. Its frame
    // factor F needs the host's post-cut transform history (frameScale over the FULL active op list) — refuse without.
    var CM = _dep(ctx.cutMove, 'CutMove', './cut_move.js');
    if (!CM) {
      var legacyCutId = bakedVoidFor(ctx.cutOps, fe.hostFid, fb);
      if (legacyCutId != null) return refuse('a REAL carved void (GEOM_CUT #' + legacyCutId + ', parent=host) coincides with this filling and cut_move.js is unavailable — no honest way to carry the hole; refusing rather than leaving it behind');
    }
    var cutRows = CM ? CM.cutsOver(ctx.cutOps, fe.hostFid, fb) : [];
    if (cutRows.length && !Array.isArray(ctx.geomOps)) return refuse('a REAL carved void (GEOM_CUT #' + cutRows[0].id + ', parent=host) coincides with this filling but no geomOps (full active op list) was supplied — cannot derive the cut\'s frame (post-cut host transforms); refusing rather than assuming F=1');
    var gate = _dep(ctx.gate, 'SdgGate', './sdg_gate.js');
    if (!gate || !gate.evaluate) return refuse('SdgGate unavailable — cannot gate the slide honestly');
    // S2 axis + bounds — the engine's HostFillEdge.constrain (SPEC_DAGEVU_SLIDE.md §3). Probe at t=0 (always
    // admissible by construction) for axis/tMin/tMax; per-frame calls go through canSlideTo below.
    var DE = _dep(ctx.dagevu, 'DagevuEngine', './dagevu_engine.js');
    if (!DE || !DE.HostFillEdge) return refuse('DagevuEngine unavailable — the slide constraint is HostFillEdge.constrain; nothing local to fall back on');
    var ob = fe.openingFid != null ? boxByFid[fe.openingFid] : null;
    var e = fe.edge;
    var edge = new DE.HostFillEdge({ hostFid: fe.hostFid, fillingFid: fid, hostGuid: e.host_guid, fillingGuid: e.filling_guid,
      openingGuid: e.opening_guid, openingFid: ob ? fe.openingFid : null, provenance: e.provenance,
      cascade: _dep(ctx.cascade, 'SdgCascade', './sdg_cascade.js') });
    var probe = edge.constrain([0, 0, 0], { boxByFid: boxByFid });
    if (!probe) return refuse('engine refused the pre-drag pose itself (' + JSON.stringify(edge.refusal) + ')');
    var axis = probe.axis === 'x' ? 0 : 1, tMin = probe.tMin, tMax = probe.tMax;
    var cuts = [];                                                    // §CUT-MOVE: [{cutId, parent, F}] per carved void
    for (var ci = 0; ci < cutRows.length; ci++) {
      var fr = CM.frameScale(ctx.geomOps, cutRows[ci], axis);
      if (!fr.ok) return refuse('carved void GEOM_CUT #' + cutRows[ci].id + ' cannot follow the slide — ' + fr.reason + '; refusing rather than leaving the hole behind');
      cuts.push({ cutId: cutRows[ci].id, parent: fe.hostFid, F: fr.f });
    }
    var moved = [fid]; if (ob) moved.push(fe.openingFid);
    // S3 gate inputs: every mesh box EXCEPT invisible ride anchors (modeller.html _gateBoxes excludes them too).
    var anc = ctx.anchorFids || null, before = {};
    Object.keys(boxByFid).forEach(function (k) { if (anc && (anc.has(+k) || anc.has(k))) return; before[k] = boxByFid[k]; });
    var fbg = ctx.fidByGuid; if (!fbg) { fbg = {}; Object.keys(ctx.guidByFid || {}).forEach(function (k) { fbg[ctx.guidByFid[k]] = isNaN(+k) ? k : +k; }); }
    var session = {
      fid: fid, preBox: fb.slice(), preCentre: [(fb[0] + fb[1]) / 2, (fb[2] + fb[3]) / 2, (fb[4] + fb[5]) / 2],
      real: { width: fb[1] - fb[0], depth: fb[3] - fb[2], height: fb[5] - fb[4], anchor: { requires_host: 'WALL', conn_points: [] },
        matchedProductId: 'FILLING:' + (e.filling_class || (ctx.classByFid || {})[fid] || '?'),
        source: 'rel_fills_host:' + e.opening_guid + ' (filling ' + e.filling_guid + ' → host ' + e.host_guid + '); dims = own measured pre-drag AABB' },
      gateBoxes: (function () { var o = {}; Object.keys(boxByFid).forEach(function (k) { if (String(k) !== String(fid)) o[k] = boxByFid[k]; }); return o; })(),
      classByFid: ctx.classByFid || {},
      slide: { hostFid: fe.hostFid, openingFid: ob ? fe.openingFid : null, axis: axis, tMin: tMin, tMax: tMax, moved: moved,
        before: before, gate: gate, rel: ctx.rel || relFromFills(ctx, fbg), hostBox: hb.slice(),
        edge: edge, boxByFid: boxByFid,                               // §DAGEVU: the engine edge + its pre-drag boxes (per-frame constrain input)
        cuts: cuts }                                                  // §CUT-MOVE: carved voids that ride (GEOM_CUT_MOVE riders)
    };
    console.log(TAG + ' §SESSION begin fid=' + fid + ' product=' + session.real.matchedProductId +
      ' dims(w,d,h)=' + session.real.width.toFixed(3) + ',' + session.real.depth.toFixed(3) + ',' + session.real.height.toFixed(3) +
      ' requires_host=WALL source=' + session.real.source);
    console.log(TAG + ' §SLIDE host=' + fe.hostFid + ' axis=' + 'xy'[axis] + ' t∈[' + tMin.toFixed(3) + ',' + tMax.toFixed(3) + ']' +
      ' opening=' + (ob ? fe.openingFid + ' (rides, induced=fills-opening)' : 'none seeded') +
      ' §CUT-MOVE cuts=' + (cuts.length ? cuts.map(function (c) { return '#' + c.cutId + '(F=' + c.F + ')'; }).join(',') + ' (ride, GEOM_CUT_MOVE induced=fills-opening)' : 'none') +
      ' constraint=DagevuEngine.HostFillEdge.constrain gate=SdgGate.evaluate (delta-honest)');
    return session;
  }
  // ── §SLIDE S2/S3 — the per-frame constraint + gate ──────────────────────────────────────────────────
  function canSlideTo(session, x, y, z) {
    var a = session.slide, c = session.preCentre;
    // §DAGEVU: the engine projects + bounds (SPEC_DAGEVU_SLIDE.md §2); null = beyond the wall's ends, never clamped.
    var r = a.edge.constrain([x - c[0], y - c[1], z - c[2]], { boxByFid: a.boxByFid });
    if (!r) { var rf = a.edge.refusal || {}; return { valid: false, conflictIds: [], reason: 'off-host-extent', t: rf.t, hostFid: String(a.hostFid), refusal: rf }; }
    var t = r.t, d = r.delta;
    var after = {};
    Object.keys(a.before).forEach(function (k) { after[k] = a.before[k]; });
    a.moved.forEach(function (f) { var b = a.before[f]; if (b) after[f] = [b[0] + d[0], b[1] + d[0], b[2] + d[1], b[3] + d[1], b[4] + d[2], b[5] + d[2]]; });
    var res = a.gate.evaluate(a.before, after, a.moved, a.rel, {});
    if (res.red.length) {
      var ids = [], kinds = {};
      res.red.forEach(function (r) {
        kinds[r.kind] = 1;
        var other = a.moved.some(function (m) { return +m === +r.a; }) ? r.b : r.a;
        if (ids.indexOf(String(other)) === -1) ids.push(String(other));
      });
      return { valid: false, conflictIds: ids, reason: 'gate-red:' + Object.keys(kinds).join('+'), t: t, hostFid: String(a.hostFid), gate: res };
    }
    return { valid: true, conflictIds: [], snappedPos: [c[0] + d[0], c[1] + d[1], c[2] + d[2]], hostFid: String(a.hostFid),
      reason: 'ok', t: t, delta: d, moved: a.moved.slice(), gate: res, dimLabel: r.dimLabel, gapLo: r.gapLo, gapHi: r.gapHi };
  }

  // ── §3.3 PER-FRAME VALIDATION CONTRACT ──────────────────────────────────────────────────────────────
  // canDropAt(session, x, y, z) -> { valid, conflictIds, snappedPos?, reason }
  // PURE. Session-cached inputs only. Validity is decided AT THE CANDIDATE; `snappedPos` is returned ONLY when
  // derived from a REAL host surface (flush-to-face), and NEVER as a nudge away from a conflict. Unlike
  // pascalorg's `adjustedY` we never return a corrected position that converts an invalid drop into a valid one.
  function canDropAt(session, x, y, z) {
    if (!session) return { valid: false, conflictIds: [], reason: 'no-session' };
    if (session.slide) return canSlideTo(session, x, y, z);        // §SLIDE: 1-DOF along the real host, SdgGate-checked
    var r = session.real, need = r.anchor && r.anchor.requires_host;
    var cand = box(x, y, z, r.width, r.depth, r.height);

    // The HOST is resolved FIRST because the collision test needs to know which box to exclude — but the two
    // failures are REPORTED in the spec §3.3 order (collision, then host), and a collision always carries its
    // offending fids, so a refusal never hides which real elements were in the way.
    var host = need ? resolveHost(session, cand, need) : { fid: null, snapped: null };

    // COLLISION — the item's REAL resolved dims at the candidate vs the session's box snapshot. The RESOLVED
    // HOST is excluded (and only it): a wall-hung sink necessarily contacts its own host, and modeller.html's
    // `_gateRel` (modeller.html:2503-2510) already declares hosted-by contact EXPECTED, never a clash.
    var conflictIds = [];
    Object.keys(session.gateBoxes).forEach(function (k) {
      if (host.fid != null && String(k) === String(host.fid)) return;
      if (overlaps(cand, session.gateBoxes[k])) conflictIds.push(k);
    });
    if (conflictIds.length) return { valid: false, conflictIds: conflictIds, reason: 'collision' };

    // HOST CONSTRAINT — a real host of the REQUIRED kind must exist at the candidate position.
    if (need && !host.fid) return { valid: false, conflictIds: [], reason: 'no-host:' + need };

    return { valid: true, conflictIds: [], snappedPos: host.snapped, hostFid: host.fid, reason: 'ok' };
  }

  // Resolve a REAL host surface of the required kind under the candidate. Every branch reads only measured
  // AABBs + the real committed ifc_class — no invented surfaces, no "nearest anything" fallback.
  function resolveHost(session, cand, need) {
    var classes = HOST_CLASSES[need];
    if (!classes) return { fid: null, snapped: null };      // an unknown requires_host value → no host, refuse
    var cx = (cand[0] + cand[1]) / 2, cy = (cand[2] + cand[3]) / 2, cz = (cand[4] + cand[5]) / 2;
    var w = cand[1] - cand[0], d = cand[3] - cand[2], h = cand[5] - cand[4];
    var best = null;
    Object.keys(session.gateBoxes).forEach(function (k) {
      var cls = session.classByFid[k];
      if (cls == null || classes.indexOf(cls) === -1) return;
      var b = session.gateBoxes[k];
      if (need === 'WALL') {
        // A WALL host: the candidate centre sits within the wall's own plan footprint (± tol) and the two
        // overlap in Z. Flush-to-face snap along the wall's THIN plan axis — a derivation from the real face.
        if (cx < b[0] - HOST_TOL || cx > b[1] + HOST_TOL || cy < b[2] - HOST_TOL || cy > b[3] + HOST_TOL) return;
        if ((Math.min(cand[5], b[5]) - Math.max(cand[4], b[4])) <= 0) return;
        var ex = b[1] - b[0], ey = b[3] - b[2];
        var snapped = ex <= ey
          ? [(Math.abs(cx - b[0]) <= Math.abs(cx - b[1]) ? b[0] - d / 2 : b[1] + d / 2), cy, cz]
          : [cx, (Math.abs(cy - b[2]) <= Math.abs(cy - b[3]) ? b[2] - d / 2 : b[3] + d / 2), cz];
        if (!best) best = { fid: k, snapped: snapped };
      } else if (need === 'FLOOR') {
        // A FLOOR host: a slab/footing that plan-overlaps the candidate and whose TOP face is at or below the
        // candidate's underside (± tol). Snap = seat flush on that real top face. Highest such top wins.
        if (!planOverlaps(cand, b, HOST_TOL)) return;
        if (cand[4] < b[5] - HOST_TOL) return;
        if (!best || b[5] > best._top) best = { fid: k, snapped: [cx, cy, b[5] + h / 2], _top: b[5] };
      } else {
        // A CEILING host: a slab/roof that plan-overlaps and whose UNDERSIDE is at or above the candidate's
        // top (± tol). Snap = hang flush from that real underside. Lowest such underside wins.
        if (!planOverlaps(cand, b, HOST_TOL)) return;
        if (cand[5] > b[4] + HOST_TOL) return;
        if (!best || b[4] < best._under) best = { fid: k, snapped: [cx, cy, b[4] - h / 2], _under: b[4] };
      }
    });
    return best ? { fid: best.fid, snapped: best.snapped } : { fid: null, snapped: null };
  }

  // ── §3.4 DROP BEHAVIOR ──────────────────────────────────────────────────────────────────────────────
  // Resolve the drop into the delta to commit — or into a REFUSAL. PURE (the commit itself is browser-side).
  //   valid:true  → ONE existing-shape op {op_type:'GEOM_MOVE', parameters:{parent:fid, dx,dy,dz}}. The
  //                 committed position is the SNAPPED one when the host produced one (binding a VALID drop to
  //                 its real host face), else the candidate itself. No new op type — the GEOM_MOVE fold branch
  //                 already exists (bonsai_kernel.js:238-247 host side, bonsai_kernel_worker.js:461 worker side).
  //   valid:false → NO COMMIT. The item stays at its pre-drag position (the session cache holds it). Never
  //                 place-then-flag, never auto-relocate to the nearest free spot.
  function resolveDrop(session, x, y, z) {
    var v = canDropAt(session, x, y, z);
    if (!v.valid) return { committed: false, op: null, verdict: v };
    var p = v.snappedPos || [x, y, z], c = session.preCentre;
    var op = { op_type: 'GEOM_MOVE', parameters: { parent: session.fid, dx: p[0] - c[0], dy: p[1] - c[1], dz: p[2] - c[2] } };
    // §SLIDE S4: the seeded opening element rides by the IDENTICAL delta — one induced GEOM_MOVE per rider, the
    // row shape gridmove.commit's stretch riders already use, tagged induced:'fills-opening' (its real edge).
    var riders = session.slide ? session.slide.moved.filter(function (f) { return String(f) !== String(session.fid); }).map(function (f) {
      return { op_type: 'GEOM_MOVE', parameters: { parent: f, dx: op.parameters.dx, dy: op.parameters.dy, dz: op.parameters.dz, induced: 'fills-opening' } };
    }) : [];
    // §CUT-MOVE S5: every carved void tied to the filling rides by the SAME world delta, expressed in the cut's
    // AUTHORED frame on the slide axis (cut_move.js slideShift = t / F; the other components are 0 by construction) —
    // one GEOM_CUT_MOVE rider per cut, in the same gesture group (one Ctrl+Z reverts door + hole together).
    if (session.slide && session.slide.cuts && session.slide.cuts.length) {
      var CMd = _dep(null, 'CutMove', './cut_move.js');
      session.slide.cuts.forEach(function (cu) {
        var d = [op.parameters.dx, op.parameters.dy, op.parameters.dz];
        d[session.slide.axis] = CMd.slideShift(d[session.slide.axis], cu.F);
        riders.push({ op_type: 'GEOM_CUT_MOVE', parameters: { cutId: cu.cutId, parent: cu.parent, dx: d[0], dy: d[1], dz: d[2], induced: 'fills-opening' } });
      });
    }
    return { committed: true, verdict: v, op: op, riders: riders };
  }

  var API = {
    STRUCTURAL_CLASSES: STRUCTURAL_CLASSES, HOST_CLASSES: HOST_CLASSES, HOST_TOL: HOST_TOL,
    eligibility: eligibility, beginItemDragSession: beginItemDragSession,
    canDropAt: canDropAt, resolveHost: resolveHost, resolveDrop: resolveDrop,
    fillingEdge: fillingEdge, bakedVoidFor: bakedVoidFor, canSlideTo: canSlideTo, plainExtrudeProfile: plainExtrudeProfile
  };

  // ── BROWSER lifecycle — mirrors bonsai_gridmove.js in STRUCTURE (session cache at grab, one shared
  //    preview/commit pipeline, caches dropped at end).
  if (typeof window !== 'undefined') {
    var ID = {
      _session: null,

      _buildBoxByFid: function () {
        var g = window.Bonsai && window.Bonsai.group && window.Bonsai.group(), out = {};
        if (!g) return out;
        g.children.forEach(function (m) {
          if (m.isMesh && m.userData && m.userData.featureId != null) {
            m.geometry.computeBoundingBox(); var b = m.geometry.boundingBox;
            out[m.userData.featureId] = [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z];
          }
        });
        return out;
      },
      // One pass over the committed GEOM_INSERT rows → ifc_class AND placement per fid (§SLIDE needs the host's
      // pose for the yaw guard — same query, same parse, mirrors bonsai_gridmove.js _buildInsertMaps).
      _buildInsertMaps: function () {
        var out = { classByFid: {}, placementByFid: {} }, O = window.Bonsai && window.Bonsai.oplog;
        if (!O || !O.db) return out;
        try {
          var r = O.db.exec("SELECT id, parameters FROM kernel_ops WHERE op_type='GEOM_INSERT'");
          if (r.length) r[0].values.forEach(function (v) {
            try { var p = JSON.parse(v[1]); if (p && p.ifc_class) out.classByFid[v[0]] = p.ifc_class; if (p && p.placement) out.placementByFid[v[0]] = p.placement; } catch (e) { }
          });
        } catch (e) { }
        return out;
      },
      _buildClassByFid: function () { return this._buildInsertMaps().classByFid; },
      // §SLIDE S1 inputs, read from the LIVE op-log (active rows only — _geomOps filters undone=0):
      //   _cutOps    → every active GEOM_CUT row (the baked-void check needs their {parent, void}).
      //   _plainBoxOf → is this fid's insert a plain axis-aligned box? Asks the PRODUCTION cut gate itself
      //                (bonsai_kernel.js _insertCutBox — the same function bCut/canCut use), never a re-derived test.
      _cutOps: function () {
        var O = window.Bonsai && window.Bonsai.oplog;
        try { return (O && O._geomOps) ? O._geomOps().filter(function (o) { return o.op_type === 'GEOM_CUT'; }) : []; } catch (e) { return []; }
      },
      //   _geomOps   → EVERY active GEOM row (§CUT-MOVE frameScale walks the host's post-cut transforms in it).
      _geomOps: function () {
        var O = window.Bonsai && window.Bonsai.oplog;
        try { return (O && O._geomOps) ? O._geomOps() : []; } catch (e) { return []; }
      },
      _plainBoxOf: function (fid) {
        var O = window.Bonsai && window.Bonsai.oplog, K = window.Bonsai;
        if (!O || !O._geomOps || !K || !K._insertCutBox) return null;
        var op = O._geomOps().filter(function (o) { return String(o.id) === String(fid); })[0];
        if (!op) return null;
        if (op.op_type === 'GEOM_INSERT') { try { return !!K._insertCutBox(op); } catch (e) { return false; } }
        if (op.op_type === 'GEOM_EXTRUDE_POLY') { var P = op.parameters || {}; return plainExtrudeProfile(P.profile && P.profile.points); }
        return false;                                              // any other body → unknown → refuse
      },
      _insertParams: function (fid) {
        var O = window.Bonsai && window.Bonsai.oplog;
        if (!O || !O.db) return {};
        try {
          var r = O.db.exec("SELECT parameters FROM kernel_ops WHERE id=" + (+fid) + " AND op_type='GEOM_INSERT'");
          if (r.length && r[0].values.length) return JSON.parse(r[0].values[0][0]);
        } catch (e) { }
        return {};
      },

      // Grab. THROWS WalkerGapError on no product match — the caller logs it (the resolver already
      // console.error'd) and counts the drag refused. Nothing is substituted.
      beginItemDragSession: function (fid, opts) {
        opts = opts || {};
        var maps = this._buildInsertMaps(), self = this;
        this._session = beginItemDragSession({
          fid: fid,
          insertParams: this._insertParams(fid),
          boxByFid: this._buildBoxByFid(),
          classByFid: maps.classByFid,
          guidByFid: window.__arcGuidByFid || {},
          fills: (window.swXEdges && window.swXEdges.fills) || null,
          resolver: window.RealPlacementResolver,
          discipline: opts.discipline || null,
          productHint: opts.productHint || null,
          // §SLIDE S1 — the bridge's own inverse, the host pose, the live cut rows, the production box gate, the
          // page's gate relation (hosted-by + abuts, anchors excluded) and the anchor set _gateBoxes excludes.
          fidByGuid: window.__arcFidByGuid || null,
          placementByFid: maps.placementByFid,
          cutOps: this._cutOps(),
          geomOps: this._geomOps(),                              // §CUT-MOVE: the full active log for frameScale
          plainBoxOf: function (f) { return self._plainBoxOf(f); },
          rel: (typeof window.__gateRel === 'function') ? window.__gateRel() : null,
          anchorFids: window.__arcAnchorFids || null
        });
        return this._session;
      },
      // Per-frame preview — the SAME function commit() calls, so tint and commit can never disagree.
      canDropAt: function (x, y, z) { return canDropAt(this._session, x, y, z); },

      commit: async function (x, y, z) {
        var s = this._session;
        if (!s) { console.error(TAG + ' commit with no active session — refused'); return { committed: false }; }
        var d = resolveDrop(s, x, y, z);
        if (!d.committed) {
          console.error(TAG + ' REFUSED drop fid=' + s.fid + ' reason=' + d.verdict.reason +
            (d.verdict.conflictIds.length ? ' conflicts=[' + d.verdict.conflictIds.join(',') + ']' : '') +
            ' — NO COMMIT, item stays at its pre-drag position (never auto-relocated). Spec §3.4');
          return { committed: false, verdict: d.verdict };
        }
        var P = d.op.parameters, riders = d.riders || [], res;
        if (riders.length) {
          // §SLIDE S4: filling + its opening rider = ONE user gesture → one signed gesture group (bonsai_oplog.js
          // commitGesture, the path gridmove.commit takes for stretch riders) so a single Ctrl+Z reverts both.
          if (!window.Bonsai.oplog.commitGesture) throw new Error(TAG + ' commitGesture unavailable — refusing to move the filling without its opening rider');
          res = await window.Bonsai.oplog.commitGesture([{ op_type: d.op.op_type, params: P }].concat(
            riders.map(function (r) { return { op_type: r.op_type, params: r.parameters }; })));
        } else {
          res = await window.Bonsai.oplog.commit({ op_type: d.op.op_type, parameters: P }, {});
        }
        // §CUT-MOVE: a GEOM_CUT_MOVE rider moves a VOID, not an element — it is NOT in the gate's changed set.
        var mvRiders = riders.filter(function (r) { return r.op_type === 'GEOM_MOVE'; });
        var cutRiders = riders.filter(function (r) { return r.op_type === 'GEOM_CUT_MOVE'; });
        var moved = [s.fid].concat(mvRiders.map(function (r) { return r.parameters.parent; }));
        console.log(TAG + ' commit fid=' + s.fid + ' Δ(' + P.dx.toFixed(3) + ',' + P.dy.toFixed(3) + ',' + P.dz.toFixed(3) + ')' +
          ' host=' + d.verdict.hostFid +
          (s.slide ? (' §SLIDE axis=' + 'xy'[s.slide.axis] + ' t=' + d.verdict.t.toFixed(3) +
            (mvRiders.length ? ' rider=' + mvRiders.map(function (r) { return r.parameters.parent; }).join(',') + ' induced=fills-opening' : ' rider=none') +
            (cutRiders.length ? ' §CUT-MOVE cut=' + cutRiders.map(function (r) { var q = r.parameters; return '#' + q.cutId + ' d=(' + q.dx.toFixed(3) + ',' + q.dy.toFixed(3) + ',' + q.dz.toFixed(3) + ')'; }).join(',') : '') +
            (riders.length ? ' §GESTURE gid=' + res.gid : '') +
            ' orange=' + ((d.verdict.gate && d.verdict.gate.orange) ? d.verdict.gate.orange.length : 0))
            : (d.verdict.snappedPos ? ' snapped-to-real-host-face' : '')) +
          ' verify=' + res.verify);
        return Object.assign({ committed: true, verdict: d.verdict, moved: moved }, res);
      },

      endDragSession: function () {
        if (this._session) console.log(TAG + ' §SESSION end — gate/box caches cleared');
        this._session = null;
      }
    };
    Object.keys(API).forEach(function (k) { if (ID[k] === undefined) ID[k] = API[k]; });
    window.Bonsai = window.Bonsai || {};
    window.Bonsai.itemdrag = ID;
    console.log(TAG + ' module loaded');
  }

  return API;
});
