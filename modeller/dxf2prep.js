// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2prep.js — generic CAD pre-processor (prompts/DXF2BIM_MODELLER_LANE.md §L7). Pure functions, browser + Node.
//   assertUniqueIds   one DXF entity with several loops must not give several bodies one guid
//   lineLoops         closed regions from loose line work (CAD elevations drawn as lines, no closed rectangles)
//   Defaults          every value NOT read from the drawing is a recorded default (yellow in the UI), stated values carry evidence handles
//   ifcType           body kind -> IFC class + PredefinedType (+ type name from the drawing label); unknown kind throws
// Nothing here guesses: a collision or an unknown kind throws, a default is listed, never silent.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Prep = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- §L7.1(a) unique ids ----
  function bodyId(handle, loopIndex, loopCount) { return loopCount > 1 ? handle + '-L' + loopIndex : String(handle); }
  function assertUniqueIds(bodies) {
    var seen = Object.create(null);
    bodies.forEach(function (b) {
      if (seen[b.guid]) throw new Error('Dxf2Prep: duplicate body id ' + b.guid + ' (' + seen[b.guid] + ' and ' + (b.handle || '?') + ')');
      seen[b.guid] = b.handle || '?';
    });
    return bodies.length;
  }

  // ---- §L7.1(b) line loops ----
  // segs: [{a:[x,y], b:[x,y], handle}] ; tol: snap tolerance (drawing units). Returns {loops:[{pts, area, handles}], dropped}
  function lineLoops(segs, tol) {
    tol = tol || 0.01;
    var nodes = [], grid = Object.create(null);
    function node(p) {
      var cx = Math.round(p[0] / tol), cy = Math.round(p[1] / tol);
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var l = grid[(cx + dx) + ',' + (cy + dy)];
        if (l) for (var i = 0; i < l.length; i++) if (Math.hypot(nodes[l[i]][0] - p[0], nodes[l[i]][1] - p[1]) <= tol) return l[i];
      }
      nodes.push([p[0], p[1]]); (grid[cx + ',' + cy] = grid[cx + ',' + cy] || []).push(nodes.length - 1); return nodes.length - 1;
    }
    var S = segs.map(function (s) { return { a: node(s.a), b: node(s.b), h: s.handle }; }).filter(function (s) { return s.a !== s.b; });
    // split every segment at nodes lying on it and at proper crossings (T-junctions, X-crossings)
    function onSeg(p, a, b) {
      var abx = b[0] - a[0], aby = b[1] - a[1], L2 = abx * abx + aby * aby, t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / L2;
      if (t <= 1e-9 || t >= 1 - 1e-9) return null;
      return Math.hypot(a[0] + t * abx - p[0], a[1] + t * aby - p[1]) <= tol ? t : null;
    }
    function cross(s1, s2) {
      var a = nodes[s1.a], b = nodes[s1.b], c = nodes[s2.a], d = nodes[s2.b];
      var r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]], den = r[0] * q[1] - r[1] * q[0];
      if (Math.abs(den) < 1e-12) return null;
      var t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
      return (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) ? [a[0] + t * r[0], a[1] + t * r[1]] : null;
    }
    var out = [];
    S.forEach(function (s, i) {
      var cuts = [];
      nodes.forEach(function (p, k) { if (k !== s.a && k !== s.b) { var t = onSeg(p, nodes[s.a], nodes[s.b]); if (t !== null) cuts.push([t, k]); } });
      S.forEach(function (o, j) { if (j !== i) { var x = cross(s, o); if (x) { var k = node(x), t = onSeg(nodes[k], nodes[s.a], nodes[s.b]); if (t !== null) cuts.push([t, k]); } } });
      cuts.sort(function (p, q) { return p[0] - q[0]; });
      var prev = s.a; cuts.forEach(function (c) { if (c[1] !== prev) { out.push({ a: prev, b: c[1], h: s.h }); prev = c[1]; } });
      if (prev !== s.b) out.push({ a: prev, b: s.b, h: s.h });
    });
    // unique undirected edges, keeping every contributing handle
    var E = Object.create(null);
    out.forEach(function (e) { var k = Math.min(e.a, e.b) + '_' + Math.max(e.a, e.b); (E[k] = E[k] || { a: Math.min(e.a, e.b), b: Math.max(e.a, e.b), hs: [] }).hs.push(e.h); });
    var edges = Object.keys(E).map(function (k) { return E[k]; });
    // half-edge face walk
    var adj = {};
    edges.forEach(function (e, i) { (adj[e.a] = adj[e.a] || []).push({ to: e.b, e: i }); (adj[e.b] = adj[e.b] || []).push({ to: e.a, e: i }); });
    Object.keys(adj).forEach(function (n) { var p = nodes[n]; adj[n].forEach(function (h) { h.ang = Math.atan2(nodes[h.to][1] - p[1], nodes[h.to][0] - p[0]); }); adj[n].sort(function (x, y) { return x.ang - y.ang; }); });
    var used = Object.create(null), loops = [], dropped = 0;
    Object.keys(adj).forEach(function (n0) {
      adj[n0].forEach(function (h0) {
        var key0 = n0 + '>' + h0.to; if (used[key0]) return;
        var path = [], hs = [], from = +n0, h = h0, guard = 0, ok = true;
        while (guard++ < 10000) {
          used[from + '>' + h.to] = 1; path.push(from); hs.push(h.e);
          var at = h.to, list = adj[at], back = -1;
          for (var i = 0; i < list.length; i++) if (list[i].to === from && list[i].e === h.e) { back = i; break; }
          var next = list[(back - 1 + list.length) % list.length];   // next edge clockwise from the one we came on: walks the face on the left
          from = at; h = next;
          if (from === +n0 && h.to === h0.to) break;
          if (used[from + '>' + h.to]) { ok = false; break; }
        }
        if (!ok || guard >= 10000) { dropped++; return; }
        var area = 0; for (var k = 0; k < path.length; k++) { var p = nodes[path[k]], q = nodes[path[(k + 1) % path.length]]; area += p[0] * q[1] - q[0] * p[1]; }
        area /= 2;
        if (area <= tol * tol) return;                       // outer face / sliver: not a region
        var handles = {}; hs.forEach(function (ei) { edges[ei].hs.forEach(function (x) { if (x != null) handles[x] = 1; }); });
        loops.push({ pts: path.map(function (i) { return nodes[i].slice(); }), area: area, handles: Object.keys(handles) });
      });
    });
    return { loops: loops, dropped: dropped };
  }

  // ---- §L7.2 defaults register ----
  function Defaults() {
    var rows = [];
    return {
      stated: function (key, value, evidence) { rows.push({ key: key, value: value, kind: 'stated', evidence: evidence }); },
      assume: function (key, value, why, options) { rows.push({ key: key, value: value, kind: 'default', why: why, evidence: null, options: options || null }); },
      override: function (key, value) { rows.forEach(function (r) { if (r.key === key && r.kind === 'default') { r.value = value; r.kind = 'chosen'; } }); },
      rows: function () { return rows.slice(); },
      defaults: function () { return rows.filter(function (r) { return r.kind === 'default'; }); },
      hasIssues: function () { return rows.some(function (r) { return r.kind === 'default'; }); }
    };
  }

  // ---- §L7.8 prepare: line-work loop detection; every value it applies that nothing states is a Defaults row ----
  var MARK_LAYER = 'DXF2BIM-MARK';
  var TOL_OPTIONS = [0.001, 0.01, 0.1];
  function segmentsOf(entities, byIndex, layers) {   // layers (optional): only entities on these layers   // byIndex: segment.handle = the entity's index (DXF handles are not always present or unique)
    var segs = [];
    (entities || []).forEach(function (e, ei) {
      var hid = byIndex ? ei : e.handle;
      if (layers && layers.indexOf(e.layer) < 0) return;
      if (e.layer === MARK_LAYER) return;
      var v = e.vertices;
      if (e.type === 'LINE' && v && v.length >= 2) segs.push({ a: [v[0].x, v[0].y], b: [v[1].x, v[1].y], handle: hid });
      else if (e.type === 'LWPOLYLINE' && v && v.length >= 2) {
        for (var i = 0; i + 1 < v.length; i++) segs.push({ a: [v[i].x, v[i].y], b: [v[i + 1].x, v[i + 1].y], handle: hid });
        if (e.shape && v.length > 2) segs.push({ a: [v[v.length - 1].x, v[v.length - 1].y], b: [v[0].x, v[0].y], handle: hid });
      }
    });
    return segs;
  }
  function isLineWork(entities) {   // CAD line drawing: loose LINEs, no closed polyline outlines on the non-marking layers
    var lines = 0, closed = 0;
    (entities || []).forEach(function (e) { if (e.layer === MARK_LAYER) return; if (e.type === 'LINE') lines++; else if (e.type === 'LWPOLYLINE' && e.shape) closed++; });
    return lines >= 8 && closed === 0;
  }
  function hasLineWork(entities, layers) {   // >= 4 loose LINEs on a user-typed wall layer that has no closed outline of its own
    var closed = {}, n = {}; (entities || []).forEach(function (e) { if (e.type === 'LWPOLYLINE' && e.shape) closed[e.layer] = 1; else if (e.type === 'LINE') n[e.layer] = (n[e.layer] || 0) + 1; });
    return layers.some(function (l) { return !closed[l] && (n[l] || 0) >= 4; });
  }
  // choices: {key: value} from the user (DxfMetaEditor.defaultChoices()); D: an optional shared Defaults register
  function prepare(entities, choices, D) {
    D = D || Defaults(); choices = choices || {};
    if (!isLineWork(entities)) return { lineWork: false, segments: 0, loops: [], dropped: 0, defaults: D.rows(), tol: null };
    if (!D.rows().some(function (r) { return r.key === 'loops.snap_tol'; })) D.assume('loops.snap_tol', 0.01, 'line ends closer than this are joined into one corner; the drawing does not state a tolerance (drawing units)', TOL_OPTIONS);
    if (choices['loops.snap_tol'] !== undefined) D.override('loops.snap_tol', Number(choices['loops.snap_tol']));
    var tol = D.rows().filter(function (r) { return r.key === 'loops.snap_tol'; })[0].value;
    var segs = segmentsOf(entities), r = lineLoops(segs, tol);
    return { lineWork: true, segments: segs.length, loops: r.loops, dropped: r.dropped, defaults: D.rows(), tol: tol };
  }

  // §L7.9 synthesise closed rectangle outlines from line work: one closed 4-vertex LWPOLYLINE per axis-aligned rectangular loop whose member lines share ONE layer.
  function reduceCollinear(pts, tol) {
    var out = pts.slice(), changed = true;
    while (changed && out.length > 3) { changed = false;
      for (var i = 0; i < out.length; i++) { var a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
        if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) <= tol * Math.hypot(c[0] - a[0], c[1] - a[1])) { out.splice(i, 1); changed = true; break; } } }
    return out;
  }
  function synthRects(entities, tol, layers) {   // layers: the layers the USER typed elevwall/sectwall; a layer that already has a closed outline is not line work and is left alone
    var hasClosed = {}; (entities || []).forEach(function (e) { if (e.type === 'LWPOLYLINE' && e.shape) hasClosed[e.layer] = 1; });
    layers = (layers || []).filter(function (l) { return !hasClosed[l]; });
    var segs = segmentsOf(entities, true, layers), r = lineLoops(segs, tol), made = [], nonRect = 0, mixed = 0, n = 0, consumed = {};
    r.loops.forEach(function (l) {
      var q = reduceCollinear(l.pts, tol);
      var rect = q.length === 4 && q.every(function (p, i) { var o = q[(i + 1) % 4]; return Math.abs(p[0] - o[0]) <= tol || Math.abs(p[1] - o[1]) <= tol; });
      if (!rect) { nonRect++; return; }
      var layers = {}; l.handles.forEach(function (ei) { layers[entities[ei].layer] = 1; });
      var ls = Object.keys(layers); if (ls.length !== 1) { mixed++; return; }
      var xs = q.map(function (p) { return p[0]; }), ys = q.map(function (p) { return p[1]; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      l.handles.forEach(function (ei) { consumed[ei] = 1; });
      made.push({ type: 'LWPOLYLINE', layer: ls[0], handle: 'loop-' + (++n), shape: true, synthetic: true, members: l.handles.map(function (ei) { return entities[ei].handle; }),
        vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
    });
    return { entities: made, consumed: consumed, rects: made.length, nonRect: nonRect, mixed: mixed, loops: r.loops.length, segments: segs.length, dropped: r.dropped };
  }

  // ---- §L7.3 provenance ----
  var PROV = { drawn: 'drawn', derived: 'derived', assumed: 'assumed' };
  var PROV_COLOUR = { assumed: 0xff2d2d };   // red; drawn/derived keep the model colour

  // ---- §L7.4 IFC typing ----
  var KIND = {
    column: ['IfcColumn', 'COLUMN'], footing: ['IfcFooting', 'PAD_FOOTING'], gradebeam: ['IfcBeam', 'BEAM'], beam: ['IfcBeam', 'BEAM'],
    wall: ['IfcWall', 'STANDARD'], supportwall: ['IfcWall', 'STANDARD'], roof: ['IfcRoof', 'GABLE_ROOF'],
    member: ['IfcMember', 'MEMBER'], plate: ['IfcPlate', 'PLATE'], panel: ['IfcWall', 'STANDARD'], chord: ['IfcMember', 'CHORD'], web: ['IfcMember', 'BRACE'], post: ['IfcMember', 'POST'], purlin: ['IfcMember', 'PURLIN'], gusset: ['IfcPlate', 'GUSSET_PLATE'],
    door: ['IfcDoor', 'DOOR'], window: ['IfcWindow', 'WINDOW']
  };
  function ifcType(kind, typeName, material) {
    var k = KIND[kind]; if (!k) throw new Error('Dxf2Prep: no IFC mapping for body kind "' + kind + '"');
    return { ifc_class: k[0], PredefinedType: k[1], type_name: typeName || null, material: material || null };
  }

  return { hasLineWork: hasLineWork, synthRects: synthRects, SNAP_TOL_DEFAULT: 0.01, prepare: prepare, isLineWork: isLineWork, segmentsOf: segmentsOf, bodyId: bodyId, assertUniqueIds: assertUniqueIds, lineLoops: lineLoops, Defaults: Defaults, PROV: PROV, PROV_COLOUR: PROV_COLOUR, ifcType: ifcType, KIND: KIND };
});
