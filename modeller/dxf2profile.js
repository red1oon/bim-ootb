// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2profile.js — parametric profile meshes from what the drawing states (prompts/DXF2BIM_FOUNDATION_LANE.md §D67.1). Pure, Node + browser, no library.
// angleOf(label): one equal-leg angle read from a section label (`1.5"x1.5"x1/4" Angle`, `L38.1x38.1x6.35`), or the reason it is not read. lMesh(): that angle as a prism between two
// end sections. axialFan(): a propeller fan from its drawn rings (housing outer radius, hub radius) plus two stated defaults (blades, housing wall). Nothing here is imported or invented.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dxf2prep.js'));
  else root.Dxf2Profile = factory(root.Dxf2Prep);
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';
  var IN = 0.0254, EPS = 1e-6, S = P.Solid, r6 = function (v) { return Number(Number(v).toFixed(6)); };
  var frac = function (s) { var m = /^(\d+)\/(\d+)$/.exec(s); return m ? Number(m[1]) / Number(m[2]) : Number(s); };
  var INCH = /^(\d+(?:\.\d+)?)\s*"\s*x\s*(\d+(?:\.\d+)?)\s*"\s*x\s*(\d+\/\d+|\d+(?:\.\d+)?)\s*"\s*(angle)?$/i, METRIC = /^L\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*mm)?$/i;
  // one equal-leg angle: { ok:true, b, t } in metres, or { ok:false, reason }
  function angleOf(label) {
    var t = String(label == null ? '' : label).trim(), b, d, th, m;
    if (!t) return { ok: false, reason: 'no label states a profile' };
    if (/^2\s*-\s*/.test(t)) return { ok: false, reason: 'a back-to-back pair: its arrangement and gap are not stated' };
    if ((m = INCH.exec(t))) { if (!m[4]) return { ok: false, reason: 'the family is not stated (no "Angle"): a flat bar and a tube carry the same three numbers' }; b = frac(m[1]) * IN; d = frac(m[2]) * IN; th = frac(m[3]) * IN; }
    else if ((m = METRIC.exec(t))) { b = Number(m[1]) / 1000; d = Number(m[2]) / 1000; th = Number(m[3]) / 1000; }
    else return { ok: false, reason: 'no angle profile in the label' };
    if (Math.abs(b - d) > EPS) return { ok: false, reason: 'unequal legs: the drawn square would change' };
    if (!(th > 0 && th < b)) return { ok: false, reason: 'the thickness is not under the leg' };
    return { ok: true, b: r6(b), t: r6(th) };
  }
  // the L polygon in (x, y) metres, centred on the b x b square; heel 'lower' = the corner at (-b/2, -b/2), 'upper' = (-b/2, +b/2)
  function lPolygon(b, t, heel) {
    var sy = heel === 'upper' ? -1 : 1, h = b / 2, cx = -h, cy = -sy * h;
    return [[cx, cy], [cx + b, cy], [cx + b, cy + sy * t], [cx + t, cy + sy * t], [cx + t, cy + sy * b], [cx, cy + sy * b]];
  }
  // a prism between two end sections: P0, P1 = the polygon's points (3D) at the two ends, same order; caps + sides, oriented outward by the signed volume
  function prismBetween(P0, P1) {
    var n = P0.length, V = P0.concat(P1), F = [], i, j;
    for (i = 1; i < n - 1; i++) { F.push([0, i + 1, i]); F.push([n, n + i, n + i + 1]); }
    for (i = 0; i < n; i++) { j = (i + 1) % n; F.push([i, j, n + j]); F.push([i, n + j, n + i]); }
    return S.outward({ vertices: V.map(function (q) { return [r6(q[0]), r6(q[1]), r6(q[2])]; }), faces: F });
  }
  function ring(n, r, w) { var o = []; for (var k = 0; k < n; k++) o.push([r * Math.cos(2 * Math.PI * k / n), r * Math.sin(2 * Math.PI * k / n), w]); return o; }
  function tube(N, ro, ri, depth) {
    var V = ring(N, ro, 0).concat(ring(N, ro, depth), ring(N, ri, 0), ring(N, ri, depth)), F = [], k, k1;
    for (k = 0; k < N; k++) { k1 = (k + 1) % N;
      F.push([k, k1, N + k1], [k, N + k1, N + k]);                                             // outer wall
      F.push([2 * N + k, 3 * N + k1, 2 * N + k1], [2 * N + k, 3 * N + k, 3 * N + k1]);         // inner wall
      F.push([N + k, N + k1, 3 * N + k1], [N + k, 3 * N + k1, 3 * N + k]);                     // front annulus
      F.push([k, 2 * N + k1, k1], [k, 2 * N + k, 2 * N + k1]); }                               // back annulus
    return S.outward({ vertices: V, faces: F });
  }
  function disc(N, r, depth) {
    var V = ring(N, r, 0).concat(ring(N, r, depth), [[0, 0, 0], [0, 0, depth]]), F = [], k, k1, c0 = 2 * N, c1 = 2 * N + 1;
    for (k = 0; k < N; k++) { k1 = (k + 1) % N; F.push([k, k1, N + k1], [k, N + k1, N + k], [c0, k1, k], [c1, N + k, N + k1]); }
    return S.outward({ vertices: V, faces: F });
  }
  function blade(theta, r1, r2, w, depth) {
    var d = [Math.cos(theta), Math.sin(theta)], t = [-Math.sin(theta), Math.cos(theta)], c = function (rr, tt, ww) { return [rr * d[0] + tt * t[0], rr * d[1] + tt * t[1], ww]; };
    return S.box([c(r1, -w / 2, 0), c(r2, -w / 2, 0), c(r2, w / 2, 0), c(r1, w / 2, 0), c(r1, -w / 2, depth), c(r2, -w / 2, depth), c(r2, w / 2, depth), c(r1, w / 2, depth)]);
  }
  // a propeller fan about (0, 0), depth along z from 0: housing tube (outer R, wall), hub disc (radius rHub, the drawn inner ring), `blades` radial paddles hub -> housing. Returns { solids:[{vertices,faces,part}], ... } or null when the rings do not fit.
  function axialFan(R, rHub, depth, blades, wall) {
    var ri = R - wall; if (!(R > 0 && depth > 0 && wall > 0 && rHub > 0 && rHub < ri - 1e-6 && blades >= 1)) return null;
    var out = [{ part: 'housing', mesh: tube(24, R, ri, depth) }, { part: 'hub', mesh: disc(24, rHub, depth) }];
    for (var b = 0; b < blades; b++) out.push({ part: 'blade', mesh: blade(2 * Math.PI * b / blades, rHub, ri, wall, depth) });
    var V = [], F = [];
    out.forEach(function (s) { var o = V.length; s.mesh.vertices.forEach(function (q) { V.push([r6(q[0]), r6(q[1]), r6(q[2])]); }); s.mesh.faces.forEach(function (f) { F.push([f[0] + o, f[1] + o, f[2] + o]); }); });
    return { vertices: V, faces: F, solids: out.map(function (s) { return { part: s.part, vertices: s.mesh.vertices, faces: s.mesh.faces }; }) };
  }
  // closed-surface check: every undirected edge in exactly two triangles, opposite directions
  function watertight(m) {
    var e = {}, ok = true; m.faces.forEach(function (f) { for (var i = 0; i < 3; i++) { var a = f[i], b = f[(i + 1) % 3], k = a < b ? a + '_' + b : b + '_' + a; (e[k] = e[k] || []).push(a < b ? 1 : -1); } });
    Object.keys(e).forEach(function (k) { if (e[k].length !== 2 || e[k][0] + e[k][1] !== 0) ok = false; }); return ok;
  }
  return { EPS: EPS, angleOf: angleOf, lPolygon: lPolygon, prismBetween: prismBetween, axialFan: axialFan, watertight: watertight, areaL: function (b, t) { return t * (2 * b - t); } };
});
