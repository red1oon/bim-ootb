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

  // ── §3.1 ELIGIBILITY ────────────────────────────────────────────────────────────────────────────────
  // A HOST (anything appearing as `host_guid` in the REAL rel_fills_host edges) is EXCLUDED — walls move via
  // gridmove or Feature A. A structural class is excluded. A FILLING may be dragged (sdg_cascade.js's own
  // directional rule says it never drags its host) — Q5 note: filling-drag is IN scope only insofar as the
  // gate lets it start; there is no separate along-host slide constraint in v1 (spec §3.1 defers it to Q5,
  // and the §3.3 host constraint already binds a WALL-hosted item to a real wall face).
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

  // ── §3.3 PER-FRAME VALIDATION CONTRACT ──────────────────────────────────────────────────────────────
  // canDropAt(session, x, y, z) -> { valid, conflictIds, snappedPos?, reason }
  // PURE. Session-cached inputs only. Validity is decided AT THE CANDIDATE; `snappedPos` is returned ONLY when
  // derived from a REAL host surface (flush-to-face), and NEVER as a nudge away from a conflict. Unlike
  // pascalorg's `adjustedY` we never return a corrected position that converts an invalid drop into a valid one.
  function canDropAt(session, x, y, z) {
    if (!session) return { valid: false, conflictIds: [], reason: 'no-session' };
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
    return {
      committed: true, verdict: v,
      op: { op_type: 'GEOM_MOVE', parameters: { parent: session.fid, dx: p[0] - c[0], dy: p[1] - c[1], dz: p[2] - c[2] } }
    };
  }

  var API = {
    STRUCTURAL_CLASSES: STRUCTURAL_CLASSES, HOST_CLASSES: HOST_CLASSES, HOST_TOL: HOST_TOL,
    eligibility: eligibility, beginItemDragSession: beginItemDragSession,
    canDropAt: canDropAt, resolveHost: resolveHost, resolveDrop: resolveDrop
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
      _buildClassByFid: function () {
        var out = {}, O = window.Bonsai && window.Bonsai.oplog;
        if (!O || !O.db) return out;
        try {
          var r = O.db.exec("SELECT id, parameters FROM kernel_ops WHERE op_type='GEOM_INSERT'");
          if (r.length) r[0].values.forEach(function (v) {
            try { var p = JSON.parse(v[1]); if (p && p.ifc_class) out[v[0]] = p.ifc_class; } catch (e) { }
          });
        } catch (e) { }
        return out;
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
        this._session = beginItemDragSession({
          fid: fid,
          insertParams: this._insertParams(fid),
          boxByFid: this._buildBoxByFid(),
          classByFid: this._buildClassByFid(),
          guidByFid: window.__arcGuidByFid || {},
          fills: (window.swXEdges && window.swXEdges.fills) || null,
          resolver: window.RealPlacementResolver,
          discipline: opts.discipline || null,
          productHint: opts.productHint || null
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
        var P = d.op.parameters;
        var res = await window.Bonsai.oplog.commit({ op_type: d.op.op_type, parameters: P }, {});
        console.log(TAG + ' commit fid=' + s.fid + ' Δ(' + P.dx.toFixed(3) + ',' + P.dy.toFixed(3) + ',' + P.dz.toFixed(3) + ')' +
          ' host=' + d.verdict.hostFid + (d.verdict.snappedPos ? ' snapped-to-real-host-face' : '') +
          ' verify=' + res.verify);
        return Object.assign({ committed: true, verdict: d.verdict }, res);
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
