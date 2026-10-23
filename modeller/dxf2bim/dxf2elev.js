// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2elev.js — window heights from marked elevations. Spec: docs/DXF2BIM_SPEC.md §26. Pure functions.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dxf2bim.js'));
  else root.Dxf2Elev = factory(root.Dxf2Bim);
})(typeof self !== 'undefined' ? self : this, function (Bim) {
  'use strict';
  var r6 = Bim.r6;
  function hnum(h) { return parseInt(h, 16); }

  // glazing clusters of one elevation, mapped to plan interval [p0,p1] (m) and z interval [z0,z1] (m). map from Dxf2Marks.align.
  function elevClusters(entities, layerMap, map, snapTol, type) {
    type = type || 'glazing';
    var ke = map.k, items = [];
    entities.forEach(function (e) {
      var rule = Bim.matchRule(e.layer, layerMap.rules);
      if (!rule || rule.type !== type) return;
      var pts = e.type === 'LINE' ? [e.vertices[0], e.vertices[1]] : (e.vertices || []);
      if (!pts.length) return;
      var hs = pts.map(function (q) { return q.x; }), ys = pts.map(function (q) { return q.y; });
      items.push({ h: e.handle, b: [Math.min.apply(null, hs), Math.min.apply(null, ys), Math.max.apply(null, hs), Math.max.apply(null, ys)] });
    });
    items.sort(function (a, b) { return hnum(a.h) - hnum(b.h); });
    var par = items.map(function (_, i) { return i; });
    var find = function (i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    var T = snapTol / ke;
    for (var i = 0; i < items.length; i++) for (var j = i + 1; j < items.length; j++) {
      var a = items[i].b, b = items[j].b;
      if (a[0] <= b[2] + T && b[0] <= a[2] + T && a[1] <= b[3] + T && b[1] <= a[3] + T) par[find(i)] = find(j);
    }
    var g = {};
    items.forEach(function (it, i) { (g[find(i)] = g[find(i)] || []).push(it); });
    var out = Object.keys(g).map(function (k) {
      var c = g[k], h0 = Math.min.apply(null, c.map(function (x) { return x.b[0]; })), h1 = Math.max.apply(null, c.map(function (x) { return x.b[2]; }));
      var y0 = Math.min.apply(null, c.map(function (x) { return x.b[1]; })), y1 = Math.max.apply(null, c.map(function (x) { return x.b[3]; }));
      var p = [map.toPlan(h0), map.toPlan(h1)].sort(function (a, b) { return a - b; });
      return { p0: r6(p[0]), p1: r6(p[1]), z0: r6(map.zOf(y0)), z1: r6(map.zOf(y1)), handles: c.map(function (x) { return x.h; }), n: c.length };
    });
    out.sort(function (a, b) { return a.p0 - b.p0 || a.z0 - b.z0 || hnum(a.handles[0]) - hnum(b.handles[0]); });
    return out;
  }

  function envelope(ops) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ops.forEach(function (o) {
      if (o.op_type !== 'DXF_WALL') return;
      var P = o.params, r = P.rect || [Math.min(P.start[0], P.end[0]) - P.thickness / 2, Math.min(P.start[1], P.end[1]) - P.thickness / 2, Math.max(P.start[0], P.end[0]) + P.thickness / 2, Math.max(P.start[1], P.end[1]) + P.thickness / 2];
      x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[2]); y1 = Math.max(y1, r[3]);
    });
    return isFinite(x0) ? { minX: x0, minY: y0, maxX: x1, maxY: y1 } : null;
  }

  // §D68 / §D74: a face SEES an interval when, along the face, no wall piece of the plan lies nearer that face covering the interval. bb = [x0, y0, x1, y1] of the opening.
  var NEAR = { minX: function (b) { return [b[0], b[2]]; }, maxX: function (b) { return [-b[2], -b[0]]; }, minY: function (b) { return [b[1], b[3]]; }, maxY: function (b) { return [-b[3], -b[1]]; } };
  function planSeer(ops, tol) {
    var WR = ops.filter(function (w) { return w.op_type === 'DXF_WALL'; }).map(function (w) { return wallRect(w.params); });
    return function (f, bb) {
      var n0 = NEAR[f](bb)[0], ax = f === 'minY' || f === 'maxY', a0 = ax ? bb[0] : bb[1], a1 = ax ? bb[2] : bb[3];
      return !WR.some(function (r) { return NEAR[f](r)[1] <= n0 + tol && (ax ? r[0] <= a0 + 1e-6 && r[2] >= a1 - 1e-6 : r[1] <= a0 + 1e-6 && r[3] >= a1 - 1e-6); });
    };
  }

  /**
   * ops: plan run ops (dxf2bim). elevs: [{face, clusters}] (clusters from elevClusters). cfg: {snap_tol, wall.height}. opts: {level, hashHex}.
   * Returns { ops, unmatched_elev } with pending windows replaced by derived ones or dropped with a gap.
   */
  function applyElevations(ops, elevs, cfg, opts) {
    var tol = cfg.snap_tol, level = opts.level || 0, H = cfg.wall.height, env = envelope(ops), out = [], used = {};
    var FACES = { minX: function (b) { return env && b[0] <= env.minX + tol; }, maxX: function (b) { return env && b[2] >= env.maxX - tol; },
                  minY: function (b) { return env && b[1] <= env.minY + tol; }, maxY: function (b) { return env && b[3] >= env.maxY - tol; } };
    var AXIS = { minX: 'Y', maxX: 'Y', minY: 'X', maxY: 'X' };
    function gapOp(w, code, extra) { return { op_type: 'DXF_GAP', params: Object.assign({ run_id: w.params.run_id, handle: w.params.handle, layer: w.params.layer, code: code }, extra || {}), input_guids: [], output_guid: null }; }
    // §D68 (F16): a window off the envelope is seen by a face when, along the face, no wall piece of this plan lies nearer that face covering the window's interval
    var recessedOn = !(typeof process === 'object' && process.env && process.env.DXF_RECESSED_WIN === '0');
    var seer = recessedOn ? planSeer(ops, tol) : null;
    function planSees(f, bb) { return seer(f, bb); }
    function schedOf(o) {   // §F8 D24: a window no elevation shows takes sill + height from its schedule entry (via its plan tag), when the entry states a sill
      var se = opts.schedule && o.params.label !== undefined ? opts.schedule[o.params.label] : null;
      if (!(se && se.class === 'window' && typeof se.sill === 'number' && typeof se.height === 'number')) return null;
      return { op_type: 'DXF_OPENING', params: Object.assign({}, o.params, { sill: se.sill, height: se.height, pending_elevation: false, height_source: 'schedule', schedule_label: o.params.label }), input_guids: [], output_guid: opts.hashHex(o.output_guid + '|sched').slice(0, 32) };
    }
    ops.forEach(function (o) {
      if (!(o.op_type === 'DXF_OPENING' && o.params.kind === 'window' && o.params.pending_elevation)) { out.push(o); return; }
      var bb = o.params.bbox, faces = Object.keys(FACES).filter(function (f) { return FACES[f](bb); });
      var have = faces.filter(function (f) { return elevs.some(function (e) { return e.face === f; }); });
      var rec = [];
      if (recessedOn && !have.length) {
        var runsX = (bb[2] - bb[0]) >= (bb[3] - bb[1]);
        var a0r = runsX ? bb[0] : bb[1], a1r = runsX ? bb[2] : bb[3];
        var twin = ops.some(function (p) { var pb = p.params && p.params.bbox; return p !== o && p.op_type === 'DXF_OPENING' && p.params.kind === 'window' && pb && ((pb[2] - pb[0]) >= (pb[3] - pb[1])) === runsX &&
          Math.abs((runsX ? pb[0] : pb[1]) - a0r) <= 2 * tol && Math.abs((runsX ? pb[2] : pb[3]) - a1r) <= 2 * tol &&
          (runsX ? pb[1] > bb[3] || pb[3] < bb[1] : pb[0] > bb[2] || pb[2] < bb[0]); });   // another window of this plan on the same run in another wall (apart in depth): a cluster could be either's
        if (!twin) rec = Object.keys(FACES).filter(function (f) { return have.indexOf(f) < 0 && (AXIS[f] === 'X') === runsX && elevs.some(function (e) { return e.face === f; }) && planSees(f, bb); });
      }
      if (!have.length && !rec.length) {
        var so = schedOf(o); if (so) { out.push(so); return; }
        out.push(gapOp(o, 'GAP:no_elevation_for_face', { faces: faces })); return;
      }
      var onlyRec = !have.length; have = have.concat(rec);
      var found = [], seen = {};
      have.forEach(function (f) {
        var a0 = AXIS[f] === 'X' ? bb[0] : bb[1], a1 = AXIS[f] === 'X' ? bb[2] : bb[3];
        elevs.forEach(function (e, ei) {
          if (e.face !== f) return;
          e.clusters.forEach(function (c, ci) {
            if (Math.abs(c.p0 - a0) > tol || Math.abs(c.p1 - a1) > tol) return;
            if (c.z0 < level - tol || c.z1 > level + H + tol) return;
            var key = c.z0 + '|' + c.z1; if (seen[key]) return; seen[key] = 1;
            found.push({ c: c, f: f, id: f + ':' + ei + ':' + ci });
          });
        });
      });
      found.sort(function (a, b) { return a.c.z0 - b.c.z0 || a.c.z1 - b.c.z1; });
      if (!found.length && onlyRec) {   // §D68: seen in plan, not shown by the elevation (hidden in 3D): as a window with no face
        var so2 = schedOf(o); if (so2) { out.push(so2); return; }
        out.push(gapOp(o, 'GAP:no_elevation_for_face', { faces: faces })); return;
      }
      if (!found.length) { out.push(gapOp(o, 'GAP:no_elevation_match', { faces: have })); return; }
      found.forEach(function (x, i) {
        used[x.id] = true;
        var xp = { sill: r6(x.c.z0 - level), height: r6(x.c.z1 - x.c.z0), pending_elevation: false, from_elevation: true, face: x.f, elev_members: x.c.handles.slice() };
        if (rec.indexOf(x.f) >= 0) xp.face_recessed = true;
        out.push({ op_type: 'DXF_OPENING', params: Object.assign({}, o.params, xp),
          input_guids: [], output_guid: opts.hashHex(o.output_guid + '|elev|' + i).slice(0, 32) });
      });
    });
    var unmatched = [];
    elevs.forEach(function (e, ei) { e.clusters.forEach(function (c, ci) { if (!used[e.face + ':' + ei + ':' + ci]) unmatched.push({ face: e.face, p0: c.p0, p1: c.p1, z0: c.z0, z1: c.z1, handles: c.handles }); }); });
    return { ops: out, unmatched_elev: unmatched };
  }

  // ---- §28 wall and door heights ----
  var FACE_AXIS = { minX: 'Y', maxX: 'Y', minY: 'X', maxY: 'X' }, OPPOSITE = { minX: 'maxX', maxX: 'minX', minY: 'maxY', maxY: 'minY' };
  function touches(env, f, r, tol) {
    if (!env) return false;
    return f === 'minX' ? r[0] <= env.minX + tol : f === 'maxX' ? r[2] >= env.maxX - tol : f === 'minY' ? r[1] <= env.minY + tol : r[3] >= env.maxY - tol;
  }
  function wallRect(P) { return P.rect || [Math.min(P.start[0], P.end[0]) - P.thickness / 2, Math.min(P.start[1], P.end[1]) - P.thickness / 2, Math.max(P.start[0], P.end[0]) + P.thickness / 2, Math.max(P.start[1], P.end[1]) + P.thickness / 2]; }

  // each closed outline on an `elevwall` layer is its own rect (stacked storey rects touch, so no merging)
  function elevWallRects(entities, layerMap, map) {
    var out = [];
    entities.forEach(function (e) {
      var rule = Bim.matchRule(e.layer, layerMap.rules);
      if (!rule || rule.type !== 'elevwall' || !(e.vertices || []).length) return;
      var hs = e.vertices.map(function (q) { return q.x; }), ys = e.vertices.map(function (q) { return q.y; });
      var p = [map.toPlan(Math.min.apply(null, hs)), map.toPlan(Math.max.apply(null, hs))].sort(function (a, b) { return a - b; });
      out.push({ p0: r6(p[0]), p1: r6(p[1]), z0: r6(map.zOf(Math.min.apply(null, ys))), z1: r6(map.zOf(Math.max.apply(null, ys))), handle: e.handle });
    });
    out.sort(function (a, b) { return a.p0 - b.p0 || a.z0 - b.z0 || hnum(a.handle) - hnum(b.handle); });
    return out;
  }

  /** ops: plan ops with pending walls. elevs: [{face, walls:[rect...]}]. cfg {snap_tol, elev_tol?}. opts {level}. Returns {ops, report}. */
  function applyWallHeights(ops, elevs, cfg, opts) {
    var tol = typeof cfg.elev_tol === 'number' ? cfg.elev_tol : cfg.snap_tol, level = opts.level || 0, env = envelope(ops), out = [], rep = { elevation: 0, config: 0, conflict: 0, none: 0 };
    function gapOp(w, code, extra) { return { op_type: 'DXF_GAP', params: Object.assign({ run_id: w.params.run_id, handle: w.params.handle, layer: w.params.layer, part: w.params.part, code: code }, extra || {}), input_guids: [], output_guid: null }; }
    ops.forEach(function (o) {
      if (!(o.op_type === 'DXF_WALL' && o.params.pending_elevation)) { out.push(o); return; }
      var P = o.params, r = wallRect(P), cands = [];
      elevs.forEach(function (E, ei) {
        var axis = FACE_AXIS[E.face], I = axis === 'X' ? [r[0], r[2]] : [r[1], r[3]];
        var onFace = touches(env, E.face, r, tol), hidden = touches(env, OPPOSITE[E.face], r, tol);
        var ok = function (R) { return Math.abs(R.z0 - level) <= tol; };
        var exact = hidden ? [] : E.walls.filter(function (R) { return ok(R) && Math.abs(R.p0 - I[0]) <= tol && Math.abs(R.p1 - I[1]) <= tol; });
        var pick = exact.length ? exact : (onFace ? E.walls.filter(function (R) { return ok(R) && R.p0 <= I[0] + tol && R.p1 >= I[1] - tol; }) : []);
        pick.forEach(function (R) { cands.push({ z0: R.z0, z1: R.z1, handle: R.handle, face: E.face }); });
      });
      var distinct = [];
      cands.forEach(function (c) { if (!distinct.some(function (d) { return Math.abs(d.z0 - c.z0) <= tol && Math.abs(d.z1 - c.z1) <= tol; })) distinct.push(c); });
      if (distinct.length === 1) {
        rep.elevation++; out.push(Object.assign({}, o, { params: Object.assign({}, P, { base: r6(distinct[0].z0 - level), height: r6(distinct[0].z1 - distinct[0].z0), pending_elevation: false, height_source: 'elevation', elev_members: cands.map(function (c) { return c.handle; }) }) }));
      } else if (distinct.length > 1) {
        rep.conflict++; out.push(gapOp(o, 'GAP:elevation_height_conflict', { candidates: distinct.map(function (d) { return [d.z0, d.z1, d.face]; }) }));
      } else if (P.height_fallback) {
        rep.config++; out.push(Object.assign({}, o, { params: Object.assign({}, P, { base: P.height_fallback.base, height: P.height_fallback.height, pending_elevation: false, height_source: 'config' }) }));
      } else { rep.none++; out.push(gapOp(o, 'GAP:no_elevation_height')); }
    });
    return { ops: out, report: rep };
  }

  /** doors: pending door ops matched to `elevdoor` clusters of the face their host wall touches. elevs: [{face, doors:[cluster...]}] */
  function applyDoorHeights(ops, elevs, cfg, opts) {
    var tol = typeof cfg.elev_tol === 'number' ? cfg.elev_tol : cfg.snap_tol, level = opts.level || 0, W0 = opts.walls0 || ops, env = envelope(W0), out = [], rep = { elevation: 0, config: 0, none: 0 };   // §D74 W0: the plan's walls as read (the height pass swaps a wall no elevation shows for a gap, so its doors lost their host)
    var sched = opts.schedule || null, walls = {}, seer = planSeer(W0, tol); W0.forEach(function (o) { if (o.op_type === 'DXF_WALL') walls[o.output_guid] = o; });
    function gapOp(w, code, extra) { return { op_type: 'DXF_GAP', params: Object.assign({ run_id: w.params.run_id, handle: w.params.handle, layer: w.params.layer, code: code }, extra || {}), input_guids: [], output_guid: null }; }
    ops.forEach(function (o) {
      if (!(o.op_type === 'DXF_OPENING' && (o.params.kind === 'door' || (o.params.kind === 'rect' && o.params.category === 'door')) && o.params.pending_elevation)) { out.push(o); return; }
      var P = o.params, w = walls[P.host_wall], found = null;
      if (w && P.hinge) {
        var W = w.params;
        var H = P.hinge, th0 = P.swing_start_deg * Math.PI / 180, th1 = P.swing_end_deg * Math.PI / 180;
        var Ps = [H[0] + P.width * Math.cos(th0), H[1] + P.width * Math.sin(th0)], Pe = [H[0] + P.width * Math.cos(th1), H[1] + P.width * Math.sin(th1)];
        var wr = wallRect(W), hits = [];
        Object.keys(FACE_AXIS).forEach(function (f) {
          if (!touches(env, f, wr, tol)) return;
          var ax = FACE_AXIS[f] === 'X' ? 0 : 1;
          [Ps, Pe].forEach(function (Q) {
            var i0 = Math.min(H[ax], Q[ax]), i1 = Math.max(H[ax], Q[ax]);
            elevs.forEach(function (E) { if (E.face !== f) return; E.doors.forEach(function (c) {
              if (Math.abs(c.p0 - i0) <= tol && Math.abs(c.p1 - i1) <= tol && Math.abs(c.z0 - level) <= tol) hits.push({ z1: c.z1, z0: c.z0, handles: c.handles, face: f }); }); });
          });
        });
        var bx = P.opening_box, doorBoxOn = !(typeof process === 'object' && process.env && process.env.DXF_DOORBOX === '0'), recDoorOn = !(typeof process === 'object' && process.env && process.env.DXF_RECESSED_DOOR === '0');
        if (!hits.length && doorBoxOn && bx && bx.along) {   // §D74: the elevation draws the element's box with its casing: pair by the drawn casing extent (opening_box), on the touched faces, then on the faces that see it
          var bb = bx.axis === 'x' ? [bx.along[0], bx.band[0], bx.along[1], bx.band[1]] : [bx.band[0], bx.along[0], bx.band[1], bx.along[1]];
          Object.keys(FACE_AXIS).forEach(function (f) {
            var touched = touches(env, f, wr, tol), ax = FACE_AXIS[f] === 'X' ? 'x' : 'y';
            if (!touched && !(recDoorOn && ax === bx.axis && seer(f, bb))) return;
            elevs.forEach(function (E) { if (E.face !== f) return; E.doors.forEach(function (c) {
              if (Math.abs(c.p0 - bx.along[0]) <= tol && Math.abs(c.p1 - bx.along[1]) <= tol && Math.abs(c.z0 - level) <= tol) hits.push({ z1: c.z1, z0: c.z0, handles: c.handles, face: f, recessed: !touched }); }); });
          });
        }
        var seen = {}; hits = hits.filter(function (h) { var k = h.z0 + '|' + h.z1; if (seen[k]) return false; seen[k] = 1; return true; });
        if (hits.length === 1) found = hits[0]; else if (hits.length > 1) { rep.none++; out.push(gapOp(o, 'GAP:elevation_height_conflict', { candidates: hits.map(function (h) { return [h.z0, h.z1, h.face]; }) })); return; }
      }
      if (found) { rep.elevation++; var hfE = typeof opts.schedule_head_frame === 'number' ? opts.schedule_head_frame : 0; out.push(Object.assign({}, o, { params: Object.assign({}, P, { height: r6(found.z1 - found.z0), leaf_height: r6(found.z1 - found.z0 - hfE), head_frame: hfE, pending_elevation: false, height_source: 'elevation', face: found.face, elev_members: found.handles.slice() }, found.recessed ? { face_recessed: true } : {}) })); }
      else if (P.height_fallback !== null && P.height_fallback !== undefined) { rep.config++; out.push(Object.assign({}, o, { params: Object.assign({}, P, { height: P.height_fallback, pending_elevation: false, height_source: 'config' }) })); }
      else if (sched && P.label !== undefined && sched[P.label] && sched[P.label].class === 'door' && typeof sched[P.label].height === 'number') {   // L2.6 C: the door schedule via the door's tag/label
        rep.schedule = (rep.schedule || 0) + 1; var hf = typeof opts.schedule_head_frame === 'number' ? opts.schedule_head_frame : 0;   // L2.7 (2): opening = schedule leaf + the head frame the drawings do not draw (caller's CASING)
        out.push(Object.assign({}, o, { params: Object.assign({}, P, { height: r6(sched[P.label].height + hf), leaf_height: sched[P.label].height, head_frame: hf, pending_elevation: false, height_source: 'schedule', schedule_label: P.label }) }));
      }
      else { rep.none++; out.push(gapOp(o, 'GAP:no_elevation_height')); }
    });
    return { ops: out, report: rep };
  }

  // L2.6 A: wall heights the plan's markings state (@WALLTOP); never a default. desc: the plan's described markings; U: slab underside above (m) for the storey rule.
  // Per-wall (handle:<h>,<z>) wins; the storey rule <level>,slab_above covers the other wall-height gaps of this plan. Only walls whose gap is GAP:no_elevation_height.
  function applyWallTops(opsAfter, opsBefore, desc, level, U, opts) {   // §D54 opts.defaultSlabAbove: the convention as a stated DEFAULT when the plan states no wall top rule
    var per = {}, perBase = {}, storey = (desc.walltop || []).some(function (w) { return Math.abs(w.level - level) <= 1e-9 && w.rule === 'slab_above'; }), pend = {}, out = [], rep = { marking: 0, slab_above: 0, defaulted: 0 };
    var dflt = !storey && !!(opts && opts.defaultSlabAbove);
    (desc.walltop_walls || []).forEach(function (w) { per[w.wall] = w.z; perBase[w.wall] = w.base; });   // §L1.24: base (m, absolute) when the marking states one
    opsBefore.forEach(function (o) { if (o.op_type === 'DXF_WALL') pend[o.params.handle + '|' + o.params.part] = o; });
    opsAfter.forEach(function (o) {
      var w = o.op_type === 'DXF_GAP' && o.params.code === 'GAP:no_elevation_height' ? pend[o.params.handle + '|' + o.params.part] : null;
      if (w && per[w.params.handle] !== undefined) { rep.marking++; out.push(Object.assign({}, w, { params: Object.assign({}, w.params, perBase[w.params.handle] !== undefined ? { base: r6(perBase[w.params.handle] - level), height: r6(per[w.params.handle] - perBase[w.params.handle]), pending_elevation: false, height_source: 'marking' } : { base: 0, height: r6(per[w.params.handle] - level), pending_elevation: false, height_source: 'marking' }) })); return; }
      if (w && storey && typeof U === 'number') { rep.slab_above++; out.push(Object.assign({}, w, { params: Object.assign({}, w.params, { base: 0, height: r6(U - level), pending_elevation: false, height_source: 'slab_above_marking' }) })); return; }
      if (w && dflt && typeof U === 'number' && U > level) { rep.defaulted++; out.push(Object.assign({}, w, { params: Object.assign({}, w.params, { base: 0, height: r6(U - level), pending_elevation: false, height_source: 'slab_above_default' }) })); return; }   // §D54
      out.push(o);
    });
    return { ops: out, report: rep };
  }

  // ---- §36 openings from drawn gaps ----
  function elevMarkOpenings(desc, map) {                        // marked @OPENING rectangles of a described elevation, mapped to plan interval and heights
    return (desc.openings || []).map(function (o, i) {
      var p = [map.toPlan(o.h0), map.toPlan(o.h1)].sort(function (a, b) { return a - b; });
      return { kind: o.kind, p0: r6(p[0]), p1: r6(p[1]), z0: r6(map.zOf(o.y0)), z1: r6(map.zOf(o.y1)), index: i };
    });
  }

  /** candidates: gaps between collinear wall pieces. cfg {snap_tol, opening:{gap_min,gap_max}}, opts {hashHex}. Returns {ops (candidates), n}. */
  function gapOpenings(ops, cfg, opts) {
    var tol = cfg.snap_tol, gmin = cfg.opening.gap_min, gmax = cfg.opening.gap_max, groups = [];
    ops.forEach(function (o) {
      if (o.op_type !== 'DXF_WALL') return;
      var P = o.params, r = wallRect(P), w = r[2] - r[0], h = r[3] - r[1], horiz = w >= h, c0 = horiz ? r[1] : r[0], c1 = horiz ? r[3] : r[2];
      var grp = groups.find(function (g) { return g.horiz === horiz && Math.abs(g.c0 - c0) <= tol && Math.abs(g.c1 - c1) <= tol; });
      if (!grp) { grp = { horiz: horiz, c0: c0, c1: c1, items: [] }; groups.push(grp); }
      grp.items.push({ o: o, a0: horiz ? r[0] : r[1], a1: horiz ? r[2] : r[3] });
    });
    var out = [];
    groups.forEach(function (g) {
      g.items.sort(function (p, q) { return p.a0 - q.a0 || hnum(p.o.params.handle) - hnum(q.o.params.handle); });
      for (var i = 0; i + 1 < g.items.length; i++) {
        var A = g.items[i], B = g.items[i + 1], gap = r6(B.a0 - A.a1);
        if (gap < gmin - tol || gap > gmax + tol) continue;
        var mid = r6((A.a1 + B.a0) / 2), cc = r6((g.c0 + g.c1) / 2);
        out.push({ op_type: 'DXF_OPENING', params: { run_id: A.o.params.run_id, handle: A.o.params.handle, layer: A.o.params.layer, part: 0, kind: 'opening', pending_classification: true, sill: null, height: null,
          axis: g.horiz ? 'X' : 'Y', centre: g.horiz ? [mid, cc] : [cc, mid], width: gap, depth: r6(g.c1 - g.c0), angle_deg: g.horiz ? 0 : 90,
          bbox: g.horiz ? [r6(A.a1), r6(g.c0), r6(B.a0), r6(g.c1)] : [r6(g.c0), r6(A.a1), r6(g.c1), r6(B.a0)], gap_between: [A.o.output_guid, B.o.output_guid], gap_handles: [A.o.params.handle, B.o.params.handle], host_wall: A.o.output_guid },
          input_guids: [], output_guid: opts.hashHex(A.o.output_guid + '|gap|' + B.o.output_guid).slice(0, 32) });
      }
    });
    out.sort(function (p, q) { return p.params.centre[0] - q.params.centre[0] || p.params.centre[1] - q.params.centre[1]; });
    return { ops: out, n: out.length };
  }

  /** ops: wall ops + candidate openings (from gapOpenings, already appended). elevs: [{face, openings:[elevMarkOpenings...]}]. Returns {ops, unmatched_elev}. */
  function classifyOpenings(ops, elevs, cfg, opts) {
    var tol = cfg.snap_tol, ctol = cfg.elev_centre_tol, level = opts.level || 0, env = envelope(ops), out = [], used = {}, walls = {};
    ops.forEach(function (o) { if (o.op_type === 'DXF_WALL') walls[o.output_guid] = o; });
    function gapOp(w, code, extra) { return { op_type: 'DXF_GAP', params: Object.assign({ run_id: w.params.run_id, handle: w.params.handle, layer: w.params.layer, code: code }, extra || {}), input_guids: [], output_guid: null }; }
    ops.forEach(function (o) {
      if (!(o.op_type === 'DXF_OPENING' && o.params.pending_classification)) { out.push(o); return; }
      var P = o.params, wb = walls[P.gap_between[0]], wa = walls[P.gap_between[1]];
      var faces = Object.keys(FACE_AXIS).filter(function (f) { return wb && wa && touches(env, f, wallRect(wb.params), tol) && touches(env, f, wallRect(wa.params), tol); });
      if (!faces.length) { out.push(gapOp(o, 'GAP:no_elevation_match', { reason: 'interior gap (no envelope face)' })); return; }
      var have = faces.filter(function (f) { return elevs.some(function (e) { return e.face === f; }); });
      if (!have.length) { out.push(gapOp(o, 'GAP:no_elevation_for_face', { faces: faces })); return; }
      var found = [];
      have.forEach(function (f) {
        var cx = FACE_AXIS[f] === 'X' ? P.centre[0] : P.centre[1];
        elevs.forEach(function (E, ei) {
          if (E.face !== f) return;
          E.openings.forEach(function (m, mi) {
            if (Math.abs((m.p0 + m.p1) / 2 - cx) > ctol + 1e-9) return;
            if (m.z0 < level - tol || (cfg.storey_height !== undefined && m.z1 > level + cfg.storey_height + tol)) return;
            found.push({ m: m, f: f, id: ei + ':' + mi });
          });
        });
      });
      found.sort(function (a, b) { return a.m.z0 - b.m.z0 || a.m.z1 - b.m.z1; });
      var seen = {}; found = found.filter(function (x) { var k = x.m.z0 + '|' + x.m.z1 + '|' + x.m.kind; if (seen[k]) return false; seen[k] = 1; return true; });
      if (!found.length) { out.push(gapOp(o, 'GAP:no_elevation_match', { faces: have })); return; }
      found.forEach(function (x, i) {
        used[x.id] = true;
        out.push({ op_type: 'DXF_OPENING', params: Object.assign({}, P, { pending_classification: false, category: x.m.kind, sill: r6(x.m.z0 - level), height: r6(x.m.z1 - x.m.z0), height_source: 'marked_elevation', mark_index: x.m.index, face: x.f }),
          input_guids: [], output_guid: opts.hashHex(o.output_guid + '|cls|' + i).slice(0, 32) });
      });
    });
    var unmatched = [];
    elevs.forEach(function (E, ei) { E.openings.forEach(function (m, mi) { if (!used[ei + ':' + mi]) unmatched.push({ face: E.face, kind: m.kind, p0: m.p0, p1: m.p1, z0: m.z0, z1: m.z1, index: m.index }); }); });
    return { ops: out, unmatched_elev: unmatched };
  }

  return { gapOpenings: gapOpenings, classifyOpenings: classifyOpenings, elevMarkOpenings: elevMarkOpenings, elevClusters: elevClusters, applyElevations: applyElevations, envelope: envelope, elevWallRects: elevWallRects, applyWallHeights: applyWallHeights, applyDoorHeights: applyDoorHeights, applyWallTops: applyWallTops };
});
