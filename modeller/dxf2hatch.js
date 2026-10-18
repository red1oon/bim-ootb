// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2hatch.js — HATCH boundary loops from ASCII DXF text (prompts/DXF2BIM_MODELLER_LANE.md §L11). Pure, Node + browser.
// dxf-parser has no HATCH: hatches (brick walls, section fills, arrow heads) were invisible to the reader. This reads them straight from the text.
//   parseHatches(text) -> { hatches: [{ handle, layer, pattern, solid, loops: [{ pts, closed, external, edges, arc }] }], gaps: [{ code, handle, detail }] }
// Polyline paths keep their vertices (bulge arcs are flattened); edge paths (line / arc / ellipse / spline) are chained end to end. Nothing is dropped silently:
// a loop that cannot be closed or an edge type that is not supported is a gap with the hatch handle.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Hatch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var ARC_STEP = Math.PI / 18;   // flattened arcs: 10 degrees per chord

  function pairs(text) {
    var L = String(text).split(/\r?\n/), out = [];
    for (var i = 0; i + 1 < L.length; i += 2) out.push([L[i].trim(), L[i + 1].trim()]);
    return out;
  }
  function arcPts(cx, cy, r, a0, a1, ccw) {   // degrees, as DXF stores them; the arc runs from a0 to a1 counter-clockwise when ccw, else clockwise
    var s = a0 * Math.PI / 180, e = a1 * Math.PI / 180, pts = [];
    if (ccw) { while (e <= s) e += 2 * Math.PI; } else { while (e >= s) e -= 2 * Math.PI; }
    var n = Math.max(2, Math.ceil(Math.abs(e - s) / ARC_STEP));
    for (var i = 0; i <= n; i++) { var a = s + (e - s) * i / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return pts;
  }
  function bulgePts(a, b, bulge) {   // the arc between two polyline vertices with a bulge = tan(included angle / 4); positive bulge runs counter-clockwise from a to b
    var th = 4 * Math.atan(bulge), dx = b[0] - a[0], dy = b[1] - a[1], c = Math.hypot(dx, dy); if (!c) return [];
    var r = c / (2 * Math.sin(Math.abs(th) / 2)), d = Math.sqrt(Math.max(0, r * r - c * c / 4)) * (Math.abs(th) > Math.PI ? -1 : 1) * (bulge > 0 ? 1 : -1);
    var cx = (a[0] + b[0]) / 2 - dy / c * d, cy = (a[1] + b[1]) / 2 + dx / c * d, a0 = Math.atan2(a[1] - cy, a[0] - cx), n = Math.max(2, Math.ceil(Math.abs(th) / ARC_STEP)), out = [];
    for (var i = 1; i < n; i++) { var ang = a0 + th * i / n; out.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]); }
    return out;
  }
  function chain(edges, tol) {   // edges: [{pts:[...]}] in drawing order; each may run either way: join end to end
    if (!edges.length) return null;
    var out = edges[0].pts.slice(), used = [true];
    for (var k = 1; k < edges.length; k++) {
      var best = -1, rev = false, bd = Infinity, end = out[out.length - 1];
      edges.forEach(function (e, i) { if (used[i]) return; var d0 = Math.hypot(e.pts[0][0] - end[0], e.pts[0][1] - end[1]), d1 = Math.hypot(e.pts[e.pts.length - 1][0] - end[0], e.pts[e.pts.length - 1][1] - end[1]); if (d0 < bd) { bd = d0; best = i; rev = false; } if (d1 < bd) { bd = d1; best = i; rev = true; } });
      if (best < 0 || bd > tol) return { pts: out, closed: false, broken: true };
      used[best] = true; var p = edges[best].pts.slice(); if (rev) p.reverse(); out = out.concat(p.slice(1));
    }
    var f = out[0], l = out[out.length - 1], closed = Math.hypot(f[0] - l[0], f[1] - l[1]) <= tol;
    if (closed && out.length > 1) out.pop();
    return { pts: out, closed: closed, broken: !closed };
  }

  function parseHatches(text, opts) {
    opts = opts || {}; var tol = opts.tol !== undefined ? opts.tol : 1e-3, P = pairs(text), hatches = [], gaps = [], i = 0, n = P.length;
    var inEnt = false;
    for (; i < n; i++) { if (P[i][0] === '2' && P[i][1] === 'ENTITIES' && i && P[i - 1][0] === '0' && P[i - 1][1] === 'SECTION') { inEnt = true; i++; break; } }
    if (!inEnt) { i = 0; }
    for (; i < n; i++) {
      if (P[i][0] === '0' && P[i][1] === 'ENDSEC' && inEnt) break;
      if (!(P[i][0] === '0' && P[i][1] === 'HATCH')) continue;
      var h = { handle: null, layer: null, pattern: null, solid: null, loops: [] }, j = i + 1;
      for (; j < n && !(P[j][0] === '0'); j++) {
        var c = P[j][0], v = P[j][1];
        if (c === '5' && h.handle === null) h.handle = v; else if (c === '8') h.layer = v; else if (c === '2' && h.pattern === null) h.pattern = v; else if (c === '70' && h.solid === null) h.solid = Number(v);
        else if (c === '91') {   // boundary paths follow
          var np = Number(v); j++;
          for (var pi = 0; pi < np && j < n; pi++) {
            while (j < n && P[j][0] !== '92') j++;
            var flag = Number(P[j][1]); j++;
            var loop = { pts: [], closed: false, external: !!(flag & 1), edges: 0, arc: false };
            if (flag & 2) {   // polyline path: 72 hasBulge, 73 closed, 93 count, then 10/20(/42) per vertex
              var hasB = 0, closed = 0, cnt = 0; while (j < n && P[j][0] !== '93') { if (P[j][0] === '72') hasB = Number(P[j][1]); if (P[j][0] === '73') closed = Number(P[j][1]); j++; }
              cnt = Number(P[j][1]); j++; var vs = [];
              for (var q = 0; q < cnt && j < n; q++) { var x = Number(P[j][1]), y = Number(P[j + 1][1]); j += 2; var b = 0; if (hasB && P[j] && P[j][0] === '42') { b = Number(P[j][1]); j++; } vs.push({ p: [x, y], b: b }); }
              vs.forEach(function (vv, k) { loop.pts.push(vv.p); var nx = vs[(k + 1) % vs.length]; if (vv.b && (closed || k + 1 < vs.length)) { bulgePts(vv.p, nx.p, vv.b).forEach(function (bp) { loop.pts.push(bp); loop.arc = true; }); } });
              loop.closed = !!closed; loop.edges = cnt;
            } else {   // edge path: 93 edge count, per edge 72 type
              while (j < n && P[j][0] !== '93') j++;
              var ne = Number(P[j][1]); j++; var edges = [], unsupported = null;
              for (var e = 0; e < ne && j < n; e++) {
                while (j < n && P[j][0] !== '72') j++;
                var et = Number(P[j][1]); j++; var g = {};
                while (j < n && !['72', '97', '92', '75', '91'].includes(P[j][0])) { g[P[j][0]] = g[P[j][0]] || []; g[P[j][0]].push(Number(P[j][1])); j++; }
                if (et === 1) edges.push({ pts: [[g['10'][0], g['20'][0]], [g['11'][0], g['21'][0]]] });
                else if (et === 2) { edges.push({ pts: arcPts(g['10'][0], g['20'][0], g['40'][0], g['50'][0], g['51'][0], g['73'] ? g['73'][0] === 1 : true) }); loop.arc = true; }
                else { unsupported = et === 3 ? 'ellipse' : et === 4 ? 'spline' : 'edge type ' + et; }
              }
              if (unsupported) { gaps.push({ code: 'GAP:hatch_edge_unsupported', handle: h.handle, detail: unsupported + ' edge in a boundary path' }); loop = null; }
              else { var ch = chain(edges, tol); if (!ch) { gaps.push({ code: 'GAP:hatch_empty_path', handle: h.handle, detail: 'no edges' }); loop = null; } else { loop.pts = ch.pts; loop.closed = ch.closed; loop.edges = ne; if (ch.broken) gaps.push({ code: 'GAP:hatch_loop_open', handle: h.handle, detail: 'edges do not close within ' + tol }); } }
            }
            if (loop) h.loops.push(loop);
            j--;
          }
        }
      }
      hatches.push(h); i = j - 1;
    }
    return { hatches: hatches, gaps: gaps };
  }
  function area(pts) { var a = 0; for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  return { parseHatches: parseHatches, area: area };
});
