// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2shell.js — basic shapes from dxf2bim/dxf2elev ops: floor slabs, roof, openings bridged in drawn wall gaps, door/window fills from the
// LOD400 component library (no fallback). Spec: docs/DXF2BIM_BASIC_SHAPES_SPEC.md. Pure functions; no DOM, no DB access (rows are passed in).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dxf2bim.js'));
  else root.Dxf2Shell = factory(root.Dxf2Bim);
})(typeof self !== 'undefined' ? self : this, function (Dxf2Bim) {
  'use strict';
  var r6 = Dxf2Bim.r6, EPS = 1e-9;
  function hnum(h) { return parseInt(h, 16); }
  function walls(ops) { return ops.filter(function (o) { return o.op_type === 'DXF_WALL'; }); }
  function isH(P) { return Math.abs(P.end[1] - P.start[1]) <= EPS; }                    // axis along x

  // ---- §3 SH-M rectilinear prism with holes: one closed outward mesh, or null ----
  function rectilinear(p) { return p.every(function (q, i) { var n = p[(i + 1) % p.length]; return Math.abs(q[0] - n[0]) <= EPS || Math.abs(q[1] - n[1]) <= EPS; }); }
  function inPoly(pt, p) {
    var c = false;
    for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > pt[1]) !== (p[j][1] > pt[1]) && pt[0] < (p[j][0] - p[i][0]) * (pt[1] - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    }
    return c;
  }
  function uniq(v) { var s = v.slice().sort(function (a, b) { return a - b; }), o = []; s.forEach(function (x) { if (!o.length || x - o[o.length - 1] > EPS) o.push(x); }); return o; }
  function prismRect(outline, holes, z0, z1) {
    holes = holes || [];
    var all = [outline].concat(holes);
    if (all.some(function (p) { return p.length < 4 || !rectilinear(p); }) || !(z1 > z0)) return null;
    var X = uniq([].concat.apply([], all.map(function (p) { return p.map(function (q) { return r6(q[0]); }); })));
    var Y = uniq([].concat.apply([], all.map(function (p) { return p.map(function (q) { return r6(q[1]); }); })));
    var nx = X.length - 1, ny = Y.length - 1, solid = [];
    for (var j = 0; j < ny; j++) { solid.push([]); for (var i = 0; i < nx; i++) {
      var c = [(X[i] + X[i + 1]) / 2, (Y[j] + Y[j + 1]) / 2];
      solid[j].push(inPoly(c, outline) && !holes.some(function (h) { return inPoly(c, h); }));
    } }
    var V = [], F = [], idx = {};
    function vid(i, j, top) { var k = i + ',' + j + ',' + (top ? 1 : 0); if (!(k in idx)) { idx[k] = V.length; V.push([X[i], Y[j], top ? r6(z1) : r6(z0)]); } return idx[k]; }
    function S(i, j) { return i >= 0 && j >= 0 && i < nx && j < ny && solid[j][i]; }
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
      if (!solid[j][i]) continue;
      var a = [i, j], b = [i + 1, j], c = [i + 1, j + 1], d = [i, j + 1];
      F.push([vid(a[0], a[1], 1), vid(b[0], b[1], 1), vid(c[0], c[1], 1)], [vid(a[0], a[1], 1), vid(c[0], c[1], 1), vid(d[0], d[1], 1)]);     // top, normal +z
      F.push([vid(a[0], a[1], 0), vid(c[0], c[1], 0), vid(b[0], b[1], 0)], [vid(a[0], a[1], 0), vid(d[0], d[1], 0), vid(c[0], c[1], 0)]);     // bottom, normal -z
      // sides: edge p->q with outward normal to the right of p->q when walking CCW around the cell
      [[a, b, S(i, j - 1)], [b, c, S(i + 1, j)], [c, d, S(i, j + 1)], [d, a, S(i - 1, j)]].forEach(function (e) {
        if (e[2]) return;
        var p = e[0], q = e[1];
        F.push([vid(p[0], p[1], 0), vid(q[0], q[1], 0), vid(q[0], q[1], 1)], [vid(p[0], p[1], 0), vid(q[0], q[1], 1), vid(p[0], p[1], 1)]);
      });
    }
    if (!F.length) return null;
    return { vertices: V, faces: F };
  }

  // ---- §4.1 S-O inner ring of the exterior walls (rectangular envelope only) ----
  function envelope(ws) {
    var r = ws.map(function (o) { return o.params.rect; });
    return [Math.min.apply(null, r.map(function (q) { return q[0]; })), Math.min.apply(null, r.map(function (q) { return q[1]; })),
      Math.max.apply(null, r.map(function (q) { return q[2]; })), Math.max.apply(null, r.map(function (q) { return q[3]; }))];
  }
  function innerRing(ops, cfg) {
    var tol = cfg.snap_tol, ws = walls(ops).filter(function (o) { return o.params.rect && !o.params.infill; }), gaps = [];
    if (!ws.length) return { outline: null, gaps: [{ code: 'GAP:slab_no_exterior_wall', face: 'all' }] };
    var E = envelope(ws), lines = {}, members = [];
    // face: [index of E coordinate, along-axis is x?, index of the rect side opposite the face]
    var FACES = { minX: [0, false, 2], maxX: [2, false, 0], minY: [1, true, 3], maxY: [3, true, 1] };
    Object.keys(FACES).forEach(function (f) {
      var F = FACES[f], vals = [];
      ws.forEach(function (o) {
        var r = o.params.rect, w = r[2] - r[0], h = r[3] - r[1];
        if (Math.abs(r[F[0]] - E[F[0]]) > tol) return;                                   // does not touch the face plane
        if (Math.abs(w - h) <= tol) return;                                                // squares / corner triangles: no direction
        if ((w > h) !== F[1]) return;                                                      // long axis not parallel to the face
        vals.push({ v: r[F[2]], h: o.params.handle });
      });
      if (!vals.length) { gaps.push({ code: 'GAP:slab_no_exterior_wall', face: f }); return; }
      var d = uniq(vals.map(function (x) { return x.v; })), spread = d[d.length - 1] - d[0];
      if (spread > tol) { gaps.push({ code: 'GAP:slab_inner_face_conflict', face: f, values: d }); return; }
      lines[f] = r6(d[0]); vals.forEach(function (x) { members.push(x.h); });
    });
    if (gaps.length) return { outline: null, gaps: gaps, envelope: E };
    var x0 = lines.minX, x1 = lines.maxX, y0 = lines.minY, y1 = lines.maxY;
    return { outline: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], envelope: E, gaps: [], members: uniq(members.map(hnum)).map(function (n) { return n.toString(16).toUpperCase(); }) };
  }

  // ---- §4.2 S-Z top / underside from elevation-derived wall heights ----
  function exteriorElev(ops, cfg) {
    var tol = cfg.snap_tol, ws = walls(ops).filter(function (o) { return o.params.rect && !o.params.infill; }), E = envelope(ws);
    return ws.filter(function (o) { var r = o.params.rect; return o.params.height_source === 'elevation' && (Math.abs(r[0] - E[0]) <= tol || Math.abs(r[1] - E[1]) <= tol || Math.abs(r[2] - E[2]) <= tol || Math.abs(r[3] - E[3]) <= tol); });
  }
  function agree(list, tol) { var d = uniq(list.map(function (x) { return r6(x.z); })); return { ok: d.length && d[d.length - 1] - d[0] <= tol, values: d, z: d[0] }; }
  function slabZ(upper, lower, cfg) {
    var tol = typeof cfg.elev_tol === 'number' ? cfg.elev_tol : cfg.snap_tol, gaps = [];
    var tops = exteriorElev(upper.ops, cfg).map(function (o) { return { z: upper.level + o.params.base, h: o.params.handle }; });
    if (!tops.length) return { top: null, bottom: null, thickness: null, gaps: [{ code: 'GAP:slab_no_top' }] };
    var T = agree(tops, tol);
    if (!T.ok) return { top: null, bottom: null, thickness: null, gaps: [{ code: 'GAP:slab_top_conflict', values: T.values }] };
    var top = r6(T.z), res = { top: top, bottom: null, thickness: null, gaps: gaps, top_from: tops.map(function (x) { return x.h; }) };
    if (!lower) { gaps.push({ code: 'GAP:slab_no_underside', reason: 'no storey below in the set' }); return res; }
    var unders = walls(lower.ops).filter(function (o) { return o.params.height_source === 'elevation' && !o.params.infill; })
      .map(function (o) { return { z: lower.level + o.params.base + o.params.height, h: o.params.handle }; })
      .filter(function (x) { return x.z < top - tol; });
    if (!unders.length) { gaps.push({ code: 'GAP:slab_no_underside', reason: 'no lower elevation-seen wall ends below the top' }); return res; }
    var U = agree(unders, tol);
    if (!U.ok) { gaps.push({ code: 'GAP:slab_underside_conflict', values: U.values }); return res; }
    var bottom = r6(U.z);
    if (!(top - bottom > tol)) { gaps.push({ code: 'GAP:slab_bad_thickness', top: top, bottom: bottom }); return res; }
    res.bottom = bottom; res.thickness = r6(top - bottom); res.underside_from = unders.map(function (x) { return x.h; });
    return res;
  }

  // ---- §5.2 roof bottom / top ----
  function levelLinesZ(entities, layerMap, map) {                // z of drawn horizontal lines on layers typed 'levelline' (via the @Z calibration)
    var out = [];
    (entities || []).forEach(function (e) {
      var rule = Dxf2Bim.matchRule(e.layer, layerMap.rules); if (!rule || rule.type !== 'levelline' || e.type !== 'LINE') return;
      var a = e.vertices[0], b = e.vertices[1]; if (Math.abs(a.y - b.y) > 1e-9) return;
      out.push({ z: r6(map.zOf(a.y)), handle: e.handle });
    });
    return out;
  }
  function roofZ(top, elevs, cfg) {
    var tol = typeof cfg.elev_tol === 'number' ? cfg.elev_tol : cfg.snap_tol, gaps = [];
    var ext = exteriorElev(top.ops, cfg).map(function (o) { return { z: top.level + o.params.base + o.params.height, h: o.params.handle }; });
    var res = { bottom: null, top: null, thickness: null, gaps: gaps };
    if (!ext.length) gaps.push({ code: 'GAP:roof_no_bottom' });
    else { var B = agree(ext, tol); if (!B.ok) gaps.push({ code: 'GAP:roof_bottom_conflict', values: B.values }); else { res.bottom = r6(B.z); res.bottom_from = ext.map(function (x) { return x.h; }); } }
    var marks = elevs.filter(function (e) { return typeof e.roof === 'number'; });
    if (!marks.length) gaps.push({ code: 'GAP:roof_no_top' });
    else {
      var T = agree(marks.map(function (e) { return { z: e.roof }; }), tol);
      if (!T.ok) gaps.push({ code: 'GAP:roof_top_conflict', values: T.values });
      else {
        var notDrawn = marks.filter(function (e) { return !(e.lines || []).some(function (l) { return Math.abs(l.z - e.roof) <= tol; }); });
        if (notDrawn.length) gaps.push({ code: 'GAP:roof_top_not_drawn', views: notDrawn.map(function (e) { return e.name; }) });
        else { res.top = r6(T.z); res.top_from = marks.map(function (e) { return e.name + ':' + (e.lines.filter(function (l) { return Math.abs(l.z - e.roof) <= tol; })[0].handle); }); }
      }
    }
    if (res.top !== null && res.bottom !== null) { if (res.top - res.bottom > tol) res.thickness = r6(res.top - res.bottom); else gaps.push({ code: 'GAP:roof_bad_thickness', top: res.top, bottom: res.bottom }); }
    return res;
  }

  // ---- §5.1 / §5.4 roof plan: outline check and holes ----
  function closedRects(entities, layerMap, type, K) {
    var out = [];
    (entities || []).forEach(function (e) {
      var rule = Dxf2Bim.matchRule(e.layer, layerMap.rules); if (!rule || rule.type !== type) return;
      if (!((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.shape)) return;
      var p = e.vertices.map(function (q) { return [r6(q.x * K), r6(q.y * K)]; });
      var xs = p.map(function (q) { return q[0]; }), ys = p.map(function (q) { return q[1]; });
      var r = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
      var isRect = p.every(function (q) { return (Math.abs(q[0] - r[0]) <= EPS || Math.abs(q[0] - r[2]) <= EPS) && (Math.abs(q[1] - r[1]) <= EPS || Math.abs(q[1] - r[3]) <= EPS); });
      out.push({ handle: e.handle, rect: r, isRect: isRect });
    });
    return out.sort(function (a, b) { return hnum(a.handle) - hnum(b.handle); });
  }
  function roofPlan(entities, layerMap, K, topEnvelope, outline, cfg) {
    var tol = cfg.snap_tol, gaps = [], roofs = closedRects(entities, layerMap, 'roof', K);
    if (!outline || !topEnvelope) return { ok: false, holes: [], gaps: [{ code: 'GAP:roof_no_outline', reason: 'top storey has no inner-face ring' }] };
    if (roofs.length !== 1) return { ok: false, holes: [], gaps: [{ code: 'GAP:roof_outline_mismatch', reason: 'roof plan must hold exactly one closed roof outline', found: roofs.length }] };
    var R = roofs[0].rect, E = topEnvelope;
    if (!roofs[0].isRect || R.some(function (v, i) { return Math.abs(v - E[i]) > tol; })) return { ok: false, holes: [], gaps: [{ code: 'GAP:roof_outline_mismatch', roof: R, envelope: E }] };
    var holes = [];
    closedRects(entities, layerMap, 'glazing', K).forEach(function (g) {
      if (!g.isRect) { gaps.push({ code: 'GAP:roof_hole_not_rect', handle: g.handle }); return; }
      var r = g.rect, o = outline;
      var x0 = o[0][0], y0 = o[0][1], x1 = o[2][0], y1 = o[2][1];
      if (!(r[0] > x0 + tol && r[1] > y0 + tol && r[2] < x1 - tol && r[3] < y1 - tol)) { gaps.push({ code: 'GAP:roof_hole_outside', handle: g.handle, rect: r }); return; }
      holes.push({ handle: g.handle, rect: r, ring: [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]] });
    });
    return { ok: true, roof_handle: roofs[0].handle, holes: holes, gaps: gaps };
  }

  // ---- §2.3 W-H3 slab-above convention for walls the elevations do not show ----
  function applySlabAbove(opsAfter, opsBefore, U, level) {
    var pend = {}, out = [], n = 0;
    walls(opsBefore).forEach(function (o) { pend[o.params.handle + '|' + o.params.part] = o; });
    opsAfter.forEach(function (o) {
      if (o.op_type === 'DXF_GAP' && o.params.code === 'GAP:no_elevation_height' && typeof U === 'number') {
        var w = pend[o.params.handle + '|' + o.params.part];
        if (w) { n++; out.push(Object.assign({}, w, { params: Object.assign({}, w.params, { base: 0, height: r6(U - level), pending_elevation: false, height_source: 'slab_above' }) })); return; }
      }
      out.push(o);
    });
    return { ops: out, n: n };
  }

  // ---- §6 OP-1b door strip: the swing end point that lies on a wall strip's axis line through the hinge (closed leaf along the wall) ----
  function doorStrip(door, ws, tol) {
    var q = door.params, Hh = q.hinge, hits = [];
    [q.swing_start_deg, q.swing_end_deg].forEach(function (a) {
      var E = [Hh[0] + q.width * Math.cos(a * Math.PI / 180), Hh[1] + q.width * Math.sin(a * Math.PI / 180)];
      var ai = Math.abs(E[1] - Hh[1]) <= tol ? 0 : Math.abs(E[0] - Hh[0]) <= tol ? 1 : -1; if (ai < 0) return;
      var ci = 1 - ai, strip = ws.filter(function (w) { var r = w.params.rect, hz = (r[2] - r[0]) > (r[3] - r[1]) + tol; return (ai === 0 ? hz : !hz && (r[3] - r[1]) > (r[2] - r[0]) + tol) && Math.abs((r[ci] + r[ci + 2]) / 2 - Hh[ci]) <= tol; });
      if (strip.length) hits.push({ ai: ai, ci: ci, J: [r6(E[0]), r6(E[1])], cr: [strip[0].params.rect[ci], strip[0].params.rect[ci + 2]], strip: strip });
    });
    if (hits.length !== 1) return { gap: hits.length ? 'GAP:door_host_ambiguous' : 'GAP:door_no_strip' };
    return hits[0];
  }

  // ---- §6 openings in drawn gaps: infill around the void ----
  function bridgeOpenings(ops, cfg, opts) {
    var tol = cfg.snap_tol, ztol = typeof cfg.elev_tol === 'number' ? cfg.elev_tol : tol, level = opts.level, hashHex = opts.hashHex;
    var ws = walls(ops).filter(function (o) { return o.params.rect && !o.params.infill && typeof o.params.height === 'number'; });
    var gaps = [], notes = [], infill = [], voids = [], groups = {};
    function note(code, o, extra) { gaps.push(Object.assign({ code: code, handle: o.params.handle, kind: o.params.kind }, extra || {})); }
    var opens = ops.filter(function (o) { return o.op_type === 'DXF_OPENING' && (o.params.kind === 'window' || o.params.kind === 'door'); })
      .slice().sort(function (a, b) { return hnum(a.params.handle) - hnum(b.params.handle) || (a.params.sill || 0) - (b.params.sill || 0); });
    opens.forEach(function (o) {
      var q = o.params;
      var z0, z1;
      if (q.kind === 'window') { if (typeof q.sill !== 'number' || typeof q.height !== 'number') { note('GAP:no_height', o); return; } z0 = level + q.sill; z1 = z0 + q.height; }
      else { if (typeof q.height !== 'number') { note('GAP:no_height', o); return; } z0 = level; z1 = level + q.height; }
      var ai, ci, cr, c;
      if (q.kind === 'window') {                                                                 // window: its own drawn box gives axis and strip (a square corner host has no direction)
        var hz = (q.bbox[2] - q.bbox[0]) >= (q.bbox[3] - q.bbox[1]); ai = hz ? 0 : 1; ci = 1 - ai; cr = [q.bbox[ci], q.bbox[ci + 2]]; c = (q.bbox[ai] + q.bbox[ai + 2]) / 2;
      } else {                                                                                   // door: OP-1b, the strip the closed leaf lies in (not the nearest piece to the hinge)
        var dsx = doorStrip(o, ws, tol); if (dsx.gap) { note(dsx.gap, o); return; }
        ai = dsx.ai; ci = dsx.ci; cr = dsx.cr; c = (q.hinge[ai] + dsx.J[ai]) / 2;
      }
      var strip = ws.filter(function (w) { var r = w.params.rect; return Math.abs(r[ci] - cr[0]) <= tol && Math.abs(r[ci + 2] - cr[1]) <= tol; })
        .sort(function (a, b) { return a.params.rect[ai] - b.params.rect[ai] || hnum(a.params.handle) - hnum(b.params.handle); });
      if (strip.some(function (w) { var r = w.params.rect; return r[ai] < c - tol && r[ai + 2] > c + tol; })) { note('GAP:opening_inside_piece', o, { c: r6(c) }); return; }
      var A = null, B = null;
      strip.forEach(function (w) { var r = w.params.rect; if (r[ai + 2] <= c + tol && (!A || r[ai + 2] > A.params.rect[ai + 2])) A = w; if (r[ai] >= c - tol && (!B || r[ai] < B.params.rect[ai])) B = w; });
      if (!A || !B) { note('GAP:opening_gap_unbounded', o, { c: r6(c), before: A && A.params.handle, after: B && B.params.handle }); return; }
      var key = A.output_guid + '|' + B.output_guid;
      (groups[key] = groups[key] || { A: A, B: B, ai: ai, ci: ci, cr: cr, s0: A.params.rect[ai + 2], s1: B.params.rect[ai], items: [] }).items.push({ o: o, z0: r6(z0), z1: r6(z1), c: r6(c) });
    });
    var used = {};
    Object.keys(groups).sort().forEach(function (key) {
      var g = groups[key], A = g.A, B = g.B, zbA = level + A.params.base, ztA = zbA + A.params.height, zbB = level + B.params.base, ztB = zbB + B.params.height;
      g.items.forEach(function (it) { used[it.o.output_guid] = 1; });
      if (Math.abs(zbA - zbB) > ztol || Math.abs(ztA - ztB) > ztol) { g.items.forEach(function (it) { note('GAP:gap_height_conflict', it.o, { a: [r6(zbA), r6(ztA)], b: [r6(zbB), r6(ztB)] }); }); return; }
      var zb = r6(Math.min(zbA, zbB)), zt = r6(Math.max(ztA, ztB));
      var bad = g.items.filter(function (it) { return it.z0 < zb - ztol || it.z1 > zt + ztol; });
      if (bad.length) { bad.forEach(function (it) { note('GAP:opening_outside_wall', it.o, { z: [it.z0, it.z1], wall: [zb, zt] }); }); return; }
      var iv = g.items.map(function (it) { return [Math.max(zb, it.z0), Math.min(zt, it.z1)]; }).sort(function (p, q) { return p[0] - q[0]; });
      var rest = [], cur = zb;
      iv.forEach(function (x) { if (x[0] > cur + 1e-6) rest.push([cur, x[0]]); cur = Math.max(cur, x[1]); });
      if (zt > cur + 1e-6) rest.push([cur, zt]);
      var t = r6(g.cr[1] - g.cr[0]), cc = r6((g.cr[0] + g.cr[1]) / 2), s0 = r6(g.s0), s1 = r6(g.s1);
      voids.push({ s: [s0, s1], axis: g.ai === 0 ? 'x' : 'y', cross: [g.cr[0], g.cr[1]], z: iv.map(function (x) { return [r6(x[0]), r6(x[1])]; }), openings: g.items.map(function (it) { return it.o.params.handle; }), centre_xy: g.ai === 0 ? [r6((s0 + s1) / 2), cc] : [cc, r6((s0 + s1) / 2)], keyOf: g.items.map(function (it) { return it.o.output_guid; }) });
      rest.forEach(function (z, i) {
        var rect = g.ai === 0 ? [s0, r6(g.cr[0]), s1, r6(g.cr[1])] : [r6(g.cr[0]), s0, r6(g.cr[1]), s1];
        infill.push({ op_type: 'DXF_WALL', input_guids: [A.output_guid, B.output_guid], output_guid: hashHex(key + '|infill|' + i).slice(0, 32), params: {
          run_id: A.params.run_id, handle: A.params.handle, layer: A.params.layer, part: 'infill' + i, infill: true, infill_of: [A.params.handle, B.params.handle], openings: g.items.map(function (it) { return it.o.params.handle; }),
          start: g.ai === 0 ? [s0, cc] : [cc, s0], end: g.ai === 0 ? [s1, cc] : [cc, s1], length: r6(s1 - s0), thickness: t, rect: rect, footprint: true,
          base: r6(z[0] - level), height: r6(z[1] - z[0]), height_source: 'opening_bridge' } });
      });
    });
    // NOTE: drawn gaps in a strip that hold no opening (OP-5)
    var seenStrip = {};
    ws.forEach(function (w) {
      var hz = isH(w.params), ci = hz ? 1 : 0, ai = hz ? 0 : 1, r = w.params.rect, k = ai + ':' + r6(r[ci]) + ':' + r6(r[ci + 2]);
      if (seenStrip[k]) return; seenStrip[k] = 1;
      var strip = ws.filter(function (x) { var q = x.params.rect; return Math.abs(q[ci] - r[ci]) <= tol && Math.abs(q[ci + 2] - r[ci + 2]) <= tol; }).sort(function (a, b) { return a.params.rect[ai] - b.params.rect[ai]; });
      var endP = strip[0];                                                                     // piece reaching farthest so far (mitre bboxes overlap)
      for (var i = 1; i < strip.length; i++) {
        var a = endP.params.rect[ai + 2], b = strip[i].params.rect[ai];
        if (b - a > tol) {
          var k2 = endP.output_guid + '|' + strip[i].output_guid;
          if (!groups[k2]) notes.push({ code: 'NOTE:gap_without_opening', axis: ai === 0 ? 'x' : 'y', cross: [r[ci], r[ci + 2]], s: [r6(a), r6(b)], between: [endP.params.handle, strip[i].params.handle] });
        }
        if (strip[i].params.rect[ai + 2] > endP.params.rect[ai + 2]) endP = strip[i];
      }
    });
    return { infill: infill, voids: voids, gaps: gaps, notes: notes };
  }

  // ---- §6.1 door swing from the drawn arc: side it opens toward, and which jamb carries the hinge ----
  function doorSwing(door, ws, tol) {
    var q = door.params, st = doorStrip(door, ws, tol); if (st.gap) return { gap: st.gap };
    var ai = st.ai, ci = st.ci, J = st.J, Hh = q.hinge;
    var a0 = q.swing_start_deg, a1 = q.swing_end_deg; if (a1 < a0) a1 += 360;
    var mid = (a0 + a1) / 2 * Math.PI / 180, d = [Math.cos(mid), Math.sin(mid)], side = d[ci] > 0 ? '+' : '-';
    return { opens_to: side + (ci === 0 ? 'x' : 'y'), hinge_jamb: (Hh[ai] < J[ai] ? '-' : '+') + (ai === 0 ? 'x' : 'y'), hinge: Hh, closed_end: J, axis: ai === 0 ? 'x' : 'y', strip: st.strip.map(function (w) { return w.params.handle; }) };
  }

  // ---- §7 fills from the LOD400 library ----
  function pairKey(s) { var m = /(\d{3,4})\D{0,12}?[x×]\s*(\d{3,4})/.exec(s || ''); return m ? +m[1] + 'x' + +m[2] : null; }
  function familyToRef(fam, geoms) {
    var key = pairKey(fam.description), m = /(\d{3,4})\D{0,12}?[x×]\s*(\d{3,4})/.exec(fam.description || ''), token = m ? fam.description.slice(0, m.index).trim() : '';
    if (!key) return { gap: 'GAP:no_lod400_geometry', reason: 'no size pair in the family description' };
    var refs = uniqStr(geoms.filter(function (g) { return g.ifc_class === fam.ifc_class && pairKey(g.element_ref) === key; }).map(function (g) { return g.element_ref; }));
    var tok = refs.filter(function (r) { return r.split(':')[0] === token; });
    if (tok.length) refs = tok;
    if (!refs.length) return { gap: 'GAP:no_lod400_geometry', key: key, token: token };
    if (refs.length > 1) return { gap: 'GAP:lod400_ambiguous', key: key, token: token, candidates: refs };
    return { ref: refs[0], key: key, token: token };
  }
  function uniqStr(a) { var o = []; a.slice().sort().forEach(function (x) { if (o[o.length - 1] !== x) o.push(x); }); return o; }
  function placeFills(ops, lib, opts) {
    var level = opts.level, hashHex = opts.hashHex, gaps = [], els = [], hard = [], voidOf = opts.voidOf || {};
    var fams = {}; lib.families.forEach(function (f) { fams[f.family_id] = f; });
    ops.filter(function (o) { return o.op_type === 'DXF_OPENING' && (o.params.kind === 'window' || o.params.kind === 'door'); }).forEach(function (o) {
      var q = o.params, tid = q.type && q.type.type_id;
      function g(code, extra) { var x = Object.assign({ code: code, handle: q.handle, kind: q.kind, type_id: tid || null }, extra || {}); gaps.push(x); if (/lod400|no_lod400/.test(code)) hard.push(x); }
      if (!tid) { g('GAP:fill_unbound'); return; }
      var fam = fams[tid]; if (!fam) { g('GAP:no_lod400_geometry', { reason: 'bound id not in library families' }); return; }
      var m = familyToRef(fam, lib.geoms); if (m.gap) { g(m.gap, m); return; }
      var alongX = q.kind === 'window' ? (q.bbox[2] - q.bbox[0]) >= (q.bbox[3] - q.bbox[1]) : (voidOf[o.output_guid] ? voidOf[o.output_guid].axis === 'x' : null);
      if (alongX === null) { g('GAP:fill_no_void', { reason: 'door not matched to a drawn gap' }); return; }
      var cands = lib.geoms.filter(function (x) { return x.element_ref === m.ref && x.ifc_class === fam.ifc_class; })
        .filter(function (x) { var dx = x.bbox.max[0] - x.bbox.min[0], dy = x.bbox.max[1] - x.bbox.min[1]; return alongX ? dx >= dy : dy >= dx; })
        .sort(function (a, b) { return a.geometry_hash < b.geometry_hash ? -1 : a.geometry_hash > b.geometry_hash ? 1 : 0; });
      if (!cands.length) { g('GAP:lod400_orientation', { element_ref: m.ref, along: alongX ? 'x' : 'y' }); return; }
      var G = cands[0];
      if (G.faces.length <= 12) { g('GAP:lod400_envelope', { element_ref: m.ref, geometry_hash: G.geometry_hash, triangles: G.faces.length }); return; }
      var sill = q.kind === 'window' ? q.sill : 0;
      if (typeof sill !== 'number' || typeof q.height !== 'number') { g('GAP:no_height'); return; }
      var cx, cy;
      if (q.kind === 'window') { cx = (q.bbox[0] + q.bbox[2]) / 2; cy = (q.bbox[1] + q.bbox[3]) / 2; }
      else { cx = voidOf[o.output_guid].centre_xy[0]; cy = voidOf[o.output_guid].centre_xy[1]; }
      var cz = level + sill + q.height / 2, lc = [(G.bbox.min[0] + G.bbox.max[0]) / 2, (G.bbox.min[1] + G.bbox.max[1]) / 2, (G.bbox.min[2] + G.bbox.max[2]) / 2];
      var V = G.vertices.map(function (v) { return [r6(v[0] - lc[0] + cx), r6(v[1] - lc[1] + cy), r6(v[2] - lc[2] + cz)]; });
      var gw = alongX ? G.bbox.max[0] - G.bbox.min[0] : G.bbox.max[1] - G.bbox.min[1], gh = G.bbox.max[2] - G.bbox.min[2];
      var mw = q.kind === 'window' ? Math.max(q.bbox[2] - q.bbox[0], q.bbox[3] - q.bbox[1]) : q.width;
      var dw = r6(gw - mw), dh = r6(gh - q.height);
      if (typeof opts.size_tol === 'number' && (Math.abs(dw) > opts.size_tol || Math.abs(dh) > opts.size_tol)) g('GAP:fill_size_mismatch', { delta_w: dw, delta_h: dh, element_ref: m.ref });
      els.push({ guid: hashHex(o.output_guid + '|fill|' + G.geometry_hash).slice(0, 32), class: q.kind === 'door' ? 'IfcDoor' : 'IfcWindow', handle: q.handle, layer: q.layer, piece: 0,
        family_id: tid, element_ref: m.ref, geometry_hash: G.geometry_hash, centre: [r6(cx), r6(cy), r6(cz)], size_delta: [dw, dh], vertices: V, faces: G.faces.map(function (f) { return f.slice(); }) });
    });
    if (hard.length) {
      var err = new Error('LOD400 HARD FAIL (no fallback): ' + hard.map(function (x) { return x.code + ' ' + x.kind + ' ' + x.handle + ' ' + x.type_id; }).join('; '));
      err.gaps = gaps; err.hard = hard; throw err;
    }
    return { elements: els, gaps: gaps };
  }

  return { prismRect: prismRect, innerRing: innerRing, envelope: envelope, slabZ: slabZ, roofZ: roofZ, levelLinesZ: levelLinesZ, roofPlan: roofPlan, closedRects: closedRects,
    applySlabAbove: applySlabAbove, bridgeOpenings: bridgeOpenings, doorSwing: doorSwing, doorStrip: doorStrip, placeFills: placeFills, familyToRef: familyToRef, pairKey: pairKey };
});
