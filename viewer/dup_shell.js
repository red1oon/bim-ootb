// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dup_shell.js — §DUP_SHELL: two elements of one class and one material occupying one place fight on screen; show one.
// Spec: bim-compiler prompts/MODELLER_MASTER.md §G4 SPEC. Witness: viewer/tests/witness_dup_shell.js. Display only: nothing here writes a DB.
// The axis-aligned box only FINDS candidates. On a rotated plan two parallel diagonal members share an AABB, so the verdict is the
// box overlap in a frame fitted to each mesh. A pair that cannot be judged (no mesh, an instance rotation) is logged and never hidden.
(function (root) {
  'use strict';
  var IOU = 0.9, CELL = 3.0;   // IOU: the threshold the pair census was stated at. CELL: search grid only, cannot change a verdict.

  function _iou(a, b) {
    var ix = Math.min(a[1], b[1]) - Math.max(a[0], b[0]), iy = Math.min(a[3], b[3]) - Math.max(a[2], b[2]), iz = Math.min(a[5], b[5]) - Math.max(a[4], b[4]);
    if (ix <= 0 || iy <= 0 || iz <= 0) return 0;
    var vi = ix * iy * iz, u = (a[1] - a[0]) * (a[3] - a[2]) * (a[5] - a[4]) + (b[1] - b[0]) * (b[3] - b[2]) * (b[5] - b[4]) - vi;
    return u > 0 ? vi / u : 0;
  }
  // The principal axes of a vertex cloud: Jacobi on the 3x3 covariance. Pure, no allocation beyond the small arrays.
  function _axes(p) {
    var n = p.length / 3, m = [0, 0, 0], C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], i, j, k;
    for (i = 0; i < n; i++) for (j = 0; j < 3; j++) m[j] += p[3 * i + j] / n;
    for (i = 0; i < n; i++) for (j = 0; j < 3; j++) for (k = 0; k < 3; k++) C[j][k] += (p[3 * i + j] - m[j]) * (p[3 * i + k] - m[k]);
    var V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (var sweep = 0; sweep < 12; sweep++) {
      for (j = 0; j < 2; j++) for (k = j + 1; k < 3; k++) {
        if (Math.abs(C[j][k]) < 1e-12) continue;
        var th = 0.5 * Math.atan2(2 * C[j][k], C[k][k] - C[j][j]), c = Math.cos(th), s = Math.sin(th), q;
        for (q = 0; q < 3; q++) { var a1 = C[q][j], a2 = C[q][k]; C[q][j] = c * a1 - s * a2; C[q][k] = s * a1 + c * a2; }
        for (q = 0; q < 3; q++) { var b1 = C[j][q], b2 = C[k][q]; C[j][q] = c * b1 - s * b2; C[k][q] = s * b1 + c * b2; }
        for (q = 0; q < 3; q++) { var v1 = V[q][j], v2 = V[q][k]; V[q][j] = c * v1 - s * v2; V[q][k] = s * v1 + c * v2; }
      }
    }
    return V;
  }
  function _extent(p, V) {
    var b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (var i = 0; i < p.length; i += 3) for (var a = 0; a < 3; a++) {
      var t = p[i] * V[0][a] + p[i + 1] * V[1][a] + p[i + 2] * V[2][a];
      if (t < b[2 * a]) b[2 * a] = t;
      if (t > b[2 * a + 1]) b[2 * a + 1] = t;
    }
    return b;
  }
  // Mesh vertices placed in the world: the local cloud re-centred on its own box, then on the element's centre.
  function _world(v, cx, cy, cz) {
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], i, a;
    for (i = 0; i < v.length; i += 3) for (a = 0; a < 3; a++) { if (v[i + a] < lo[a]) lo[a] = v[i + a]; if (v[i + a] > hi[a]) hi[a] = v[i + a]; }
    var o = new Float64Array(v.length), m = [cx - (lo[0] + hi[0]) / 2, cy - (lo[1] + hi[1]) / 2, cz - (lo[2] + hi[2]) / 2];
    for (i = 0; i < v.length; i += 3) for (a = 0; a < 3; a++) o[i + a] = v[i + a] + m[a];
    return o;
  }
  /** The real overlap of two placed vertex clouds: box IoU in each one's fitted frame, the smaller of the two. */
  function meshIou(wa, wb) {
    var Va = _axes(wa), Vb = _axes(wb);
    return Math.min(_iou(_extent(wa, Va), _extent(wb, Va)), _iou(_extent(wa, Vb), _extent(wb, Vb)));
  }

  /**
   * Find the duplicate shells among stream rows.
   * @param {Array[]} rows stream rows, the streaming.js column order: 0 guid, 1 hash, 3 discipline, 4-6 centre, 7-9 rotation, 11 class, 13-15 bbox, 16 material.
   * @param {?function(string):?Float32Array} vertsOf a mesh by hash, or null when none is at hand (every candidate is then unjudged).
   * @returns {{hidden:Object, pairs:Object[], ms:number, meshesRead:number, candidates:number}} hidden is a guid set; pairs carry their verdict.
   */
  function find(rows, vertsOf) {
    var t0 = Date.now(), B = [], cell = {}, i, j;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r[13] == null || r[14] == null || r[15] == null || !(r[13] > 0 && r[14] > 0 && r[15] > 0)) continue;
      var b = [r[4] - r[13] / 2, r[4] + r[13] / 2, r[5] - r[14] / 2, r[5] + r[14] / 2, r[6] - r[15] / 2, r[6] + r[15] / 2];
      var k = B.length; B.push({ r: r, b: b, order: i });
      for (var cx = Math.floor(b[0] / CELL); cx <= Math.floor(b[1] / CELL); cx++) for (var cy = Math.floor(b[2] / CELL); cy <= Math.floor(b[3] / CELL); cy++) {
        var key = cx + ',' + cy; (cell[key] || (cell[key] = [])).push(k);
      }
    }
    var seen = {}, cands = [];
    Object.keys(cell).forEach(function (key) {
      var L = cell[key];
      for (var x = 0; x < L.length; x++) for (var y = x + 1; y < L.length; y++) {
        var a = L[x] < L[y] ? L[x] : L[y], c = L[x] < L[y] ? L[y] : L[x], pk = a + '_' + c;
        if (seen[pk] || B[a].r[11] !== B[c].r[11]) continue;   // different class: never one element
        seen[pk] = 1;
        var iou = _iou(B[a].b, B[c].b);
        if (iou > IOU) cands.push({ a: a, c: c, aabb: iou });
      }
    });
    var mesh = {}, meshesRead = 0;
    function worldOf(e) {
      var r = e.r;
      if (r[7] || r[8] || r[9]) return null;                   // an instance rotation: this placement is not judged here
      var v = mesh[r[1]];
      if (v === undefined) {
        try { v = vertsOf ? vertsOf(r[1]) : null; } catch (e) { v = null; }   // no mesh reachable: unjudged, never a reason to break the load
        if (v && !v.length) v = null;
        mesh[r[1]] = v || null; if (v) meshesRead++;
      }
      return v ? _world(v, r[4], r[5], r[6]) : null;
    }
    var hidden = {}, pairs = [];
    cands.sort(function (p, q) { return p.a - q.a || p.c - q.c; }).forEach(function (p) {
      var A = B[p.a], C = B[p.c], wa = worldOf(A), wc = worldOf(C), rec = { kept: A.r[0], hidden: C.r[0], cls: A.r[11], aabb: +p.aabb.toFixed(3) };
      if (!wa || !wc) { rec.verdict = 'unjudged'; pairs.push(rec); return; }
      var m = meshIou(wa, wc); rec.iou = +m.toFixed(3);
      if (m <= IOU) rec.verdict = 'different-shape';
      else if ((A.r[16] || '') !== (C.r[16] || '')) rec.verdict = 'different-material';
      else if ((A.r[3] || '') !== (C.r[3] || '')) rec.verdict = 'different-discipline';   // a discipline toggle must not take away the only visible copy
      else if (hidden[A.r[0]]) { rec.verdict = 'chain'; hidden[C.r[0]] = 1; }   // the earlier one is itself hidden: the first of the chain stays
      else { rec.verdict = 'hidden'; hidden[C.r[0]] = 1; }
      pairs.push(rec);
    });
    return { hidden: hidden, pairs: pairs, ms: Date.now() - t0, meshesRead: meshesRead, candidates: cands.length };
  }

  /** Log the result and return rows without the hidden elements. */
  function filterRows(rows, vertsOf, label) {
    var out = find(rows, vertsOf), n = Object.keys(out.hidden).length, by = {};
    out.pairs.forEach(function (p) { by[p.verdict] = (by[p.verdict] || 0) + 1; });
    console.log('§DUP_SHELL building=' + (label || '?') + ' candidates=' + out.candidates + ' hidden=' + n + ' verdicts=' + JSON.stringify(by) + ' of=' + rows.length + ' ms=' + out.ms + ' meshesRead=' + out.meshesRead + (rows.length ? '' : ' VACUOUS'));
    out.pairs.forEach(function (p) { console.log('§DUP_SHELL_PAIR kept=' + p.kept + ' hidden=' + p.hidden + ' cls=' + p.cls + ' aabb=' + p.aabb + ' iou=' + (p.iou == null ? 'n/a' : p.iou) + ' verdict=' + p.verdict); });
    return n ? rows.filter(function (r) { return !out.hidden[r[0]]; }) : rows;
  }

  var API = { find: find, filterRows: filterRows, meshIou: meshIou };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.DupShell = API;
})(typeof window !== 'undefined' ? window : this);
