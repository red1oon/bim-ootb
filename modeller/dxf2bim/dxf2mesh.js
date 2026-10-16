// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2mesh.js — deterministic triangle mesh + multi-storey assembly from dxf2bim ops. Spec: docs/DXF2BIM_SPEC.md §13.
// Pure functions; no DOM, no Modeller wiring. Walls = boxes split around openings (no boolean); slabs = ear-clipped prisms.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dxf2bim.js'));
  else root.Dxf2Mesh = factory(root.Dxf2Bim);
})(typeof self !== 'undefined' ? self : this, function (Dxf2Bim) {
  'use strict';
  var r6 = Dxf2Bim.r6, EPS = 1e-6;
  function hnum(h) { return parseInt(h, 16); }
  function rv(v) { return [r6(v[0]), r6(v[1]), r6(v[2])]; }

  // ---- box in a wall frame: origin a, unit u along wall, n = left normal, thickness t, s in [s0,s1], z in [z0,z1] ----
  function box(a, u, t, s0, s1, z0, z1) {
    var n = [-u[1], u[0]], h = t / 2;
    function P(s, side, z) { return rv([a[0] + u[0] * s + n[0] * side, a[1] + u[1] * s + n[1] * side, z]); }
    var V = [P(s0, -h, z0), P(s1, -h, z0), P(s1, h, z0), P(s0, h, z0), P(s0, -h, z1), P(s1, -h, z1), P(s1, h, z1), P(s0, h, z1)];
    var F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]];
    return { vertices: V, faces: F };
  }

  // ---- polygon helpers ----
  function signedArea(p) { var a = 0; for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
  function segInt(p1, p2, p3, p4) {
    function o(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    var d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
    return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
  }
  function isSimple(p) {
    var n = p.length;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segInt(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return false;
    }
    return true;
  }
  function inTri(p, a, b, c) {
    function s(p1, p2, p3) { return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]); }
    var d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
    var neg = d1 < -EPS || d2 < -EPS || d3 < -EPS, pos = d1 > EPS || d2 > EPS || d3 > EPS;
    return !(neg && pos);
  }
  function earClip(p) {                                   // p is CCW; returns triangles as index triples or null
    var idx = p.map(function (_, i) { return i; }), tris = [], guard = 0;
    while (idx.length > 3 && guard++ < 10000) {
      var cut = -1;
      for (var k = 0; k < idx.length; k++) {
        var a = p[idx[(k + idx.length - 1) % idx.length]], b = p[idx[k]], c = p[idx[(k + 1) % idx.length]];
        var cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (cr <= EPS) continue;
        var ok = true;
        for (var m = 0; m < idx.length; m++) {
          var q = idx[m];
          if (q === idx[(k + idx.length - 1) % idx.length] || q === idx[k] || q === idx[(k + 1) % idx.length]) continue;
          if (inTri(p[q], a, b, c)) { ok = false; break; }
        }
        if (ok) { cut = k; break; }
      }
      if (cut < 0) return null;
      tris.push([idx[(cut + idx.length - 1) % idx.length], idx[cut], idx[(cut + 1) % idx.length]]);
      idx.splice(cut, 1);
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    return tris;
  }
  function prism(outline, top, thickness) {               // returns mesh or null
    var p = outline.map(function (q) { return [q[0], q[1]]; });
    if (p.length < 3 || !isSimple(p)) return null;
    if (signedArea(p) < 0) p.reverse();
    var tris = earClip(p); if (!tris) return null;
    var n = p.length, V = [], F = [];
    p.forEach(function (q) { V.push(rv([q[0], q[1], top])); });
    p.forEach(function (q) { V.push(rv([q[0], q[1], top - thickness])); });
    tris.forEach(function (t) { F.push([t[0], t[1], t[2]]); F.push([n + t[0], n + t[2], n + t[1]]); });
    for (var i = 0; i < n; i++) { var j = (i + 1) % n; F.push([i, n + j, j]); F.push([i, n + i, n + j]); }
    return { vertices: V, faces: F };
  }

  // ---- checks computed from the triangles ----
  function volume(m) {
    var v = 0;
    m.faces.forEach(function (f) {
      var a = m.vertices[f[0]], b = m.vertices[f[1]], c = m.vertices[f[2]];
      v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    });
    return v;
  }
  function watertight(m) {
    var cnt = {};
    m.faces.forEach(function (f) { for (var i = 0; i < 3; i++) { var k = f[i] + '>' + f[(i + 1) % 3]; cnt[k] = (cnt[k] || 0) + 1; } });
    return Object.keys(cnt).every(function (k) { var p = k.split('>'); return cnt[k] === 1 && cnt[p[1] + '>' + p[0]] === 1; });
  }

  // ---- ops -> mesh ----
  function meshFromOps(ops, opts) {
    var level = opts.level || 0, hashHex = opts.hashHex, els = [], gaps = [], notes = [], snapTol = typeof opts.snapTol === 'number' ? opts.snapTol : null;
    function gap(code, o, extra) { gaps.push(Object.assign({ code: code, handle: o.params.handle, layer: o.params.layer }, extra || {})); }
    var walls = ops.filter(function (o) { return o.op_type === 'DXF_WALL'; });
    var openings = ops.filter(function (o) { return o.op_type === 'DXF_OPENING'; });
    ops.filter(function (o) { return o.op_type === 'DXF_COMPONENT'; }).forEach(function (o) { gap('GAP:no_geometry', o, { block: o.params.block }); });

    walls.forEach(function (w) {
      if (w.params.height === null || w.params.height === undefined) { gap('GAP:no_height', w, { kind: 'wall' }); return; }
      if (w.params.outline) {                                   // BASIC_SHAPES_SPEC §2.1 F9: polygon wall = prism of its drawn outline; no cut here
        var pm = prism(w.params.outline, level + w.params.base + w.params.height, w.params.height);
        if (!pm) { gap('GAP:bad_outline', w); return; }
        openings.filter(function (o) { return o.params.host_wall === w.output_guid; }).forEach(function (o) { gap('GAP:opening_in_polygon_wall', o, { wall: w.params.handle }); });
        els.push({ guid: hashHex(w.output_guid + '|0').slice(0, 32), class: 'IfcWall', handle: w.params.handle, layer: w.params.layer, piece: 0, vertices: pm.vertices, faces: pm.faces });
        return;
      }
      var P = w.params, a = P.start, dx = P.end[0] - a[0], dy = P.end[1] - a[1], L = Math.hypot(dx, dy), u = [dx / L, dy / L];
      var zb = level + P.base, zt = zb + P.height, t = P.thickness, wallAng = Math.atan2(u[1], u[0]);
      var mine = openings.filter(function (o) { return o.params.host_wall === w.output_guid; });
      var cuts = [];
      mine.forEach(function (o) {
        var q = o.params, s0, s1, z0, z1;
        if ((q.kind === 'window' || q.kind === 'opening') && (q.sill === null || q.sill === undefined)) { gap('GAP:no_height', o, { wall: w.params.handle }); return; }
        if (q.kind === 'door' && (q.height === null || q.height === undefined)) { gap('GAP:no_height', o, { wall: w.params.handle }); return; }
        if (q.kind === 'door') {
          var H = q.hinge, th0 = q.swing_start_deg * Math.PI / 180, th1 = q.swing_end_deg * Math.PI / 180;
          var Ps = [H[0] + q.width * Math.cos(th0), H[1] + q.width * Math.sin(th0)], Pe = [H[0] + q.width * Math.cos(th1), H[1] + q.width * Math.sin(th1)];
          var perp = function (p) { return Math.abs((p[0] - a[0]) * -u[1] + (p[1] - a[1]) * u[0]); };
          var J = perp(Pe) < perp(Ps) - EPS ? Pe : Ps;
          var sH = (H[0] - a[0]) * u[0] + (H[1] - a[1]) * u[1], sJ = (J[0] - a[0]) * u[0] + (J[1] - a[1]) * u[1];
          s0 = r6(Math.min(sH, sJ)); s1 = r6(Math.max(sH, sJ)); z0 = level; z1 = level + q.height;
        } else {
          var sc = (q.centre[0] - a[0]) * u[0] + (q.centre[1] - a[1]) * u[1], d = q.angle_deg * Math.PI / 180 - wallAng;
          var half = q.width / 2 * Math.abs(Math.cos(d)) + q.depth / 2 * Math.abs(Math.sin(d));
          s0 = r6(sc - half); s1 = r6(sc + half); z0 = level + q.sill; z1 = z0 + q.height;
        }
        if (snapTol !== null && (s1 <= snapTol || s0 >= L - snapTol) && !(s0 < -EPS && s1 > EPS) && !(s0 < L - EPS && s1 > L + EPS) && s1 - s0 > EPS &&
            !(s0 >= -EPS && s1 <= L + EPS)) {
          notes.push({ code: 'NOTE:opening_in_drawn_gap', handle: o.params.handle, layer: o.params.layer, wall: w.params.handle, s: [s0, s1] }); return;
        }
        if (s0 < -EPS || s1 > L + EPS || z0 < zb - EPS || z1 > zt + EPS) { gap('GAP:opening_outside_wall', o, { wall: w.params.handle, s: [s0, s1], z: [r6(z0), r6(z1)] }); return; }
        cuts.push({ o: o, s0: Math.max(0, s0), s1: Math.min(L, s1), z0: Math.max(zb, z0), z1: Math.min(zt, z1) });
      });
      cuts.sort(function (p, q) { return p.s0 - q.s0 || hnum(p.o.params.handle) - hnum(q.o.params.handle); });
      var okCuts = [], cursor = 0, pieces = [];
      cuts.forEach(function (c) {
        if (c.s0 < cursor - EPS) { gap('GAP:opening_overlap', c.o, { wall: w.params.handle }); return; }
        okCuts.push(c);
        if (c.s0 > cursor + EPS) pieces.push([cursor, c.s0, zb, zt]);
        if (c.z0 > zb + EPS) pieces.push([c.s0, c.s1, zb, c.z0]);
        if (c.z1 < zt - EPS) pieces.push([c.s0, c.s1, c.z1, zt]);
        cursor = c.s1;
      });
      if (cursor < L - EPS) pieces.push([cursor, L, zb, zt]);
      pieces.forEach(function (pc, i) {
        var m = box(a, u, t, pc[0], pc[1], pc[2], pc[3]);
        els.push({ guid: hashHex(w.output_guid + '|' + i).slice(0, 32), class: 'IfcWall', handle: P.handle, layer: P.layer, piece: i, vertices: m.vertices, faces: m.faces });
      });
    });

    ops.filter(function (o) { return o.op_type === 'DXF_SLAB'; }).forEach(function (s) {
      var m = prism(s.params.outline, level + s.params.level, s.params.thickness);
      if (!m) { gap('GAP:bad_outline', s); return; }
      els.push({ guid: s.output_guid, class: 'IfcSlab', handle: s.params.handle, layer: s.params.layer, piece: 0, vertices: m.vertices, faces: m.faces });
    });
    if (openings.length) gaps.push({ code: 'GAP:no_fill_geometry', count: openings.length });
    els.forEach(function (e) { e.volume = r6(volume(e)); e.watertight = watertight(e); });
    return { elements: els, gaps: gaps, notes: notes };
  }

  // ---- OBJ export / parse ----
  function f6(x) { var s = x.toFixed(6); return s === '-0.000000' ? '0.000000' : s; }
  function toObj(els) {
    var out = [], off = 0;
    els.forEach(function (e) {
      out.push('o ' + e.class + '_' + e.guid.slice(0, 8));
      e.vertices.forEach(function (v) { out.push('v ' + f6(v[0]) + ' ' + f6(v[1]) + ' ' + f6(v[2])); });
      e.faces.forEach(function (f) { out.push('f ' + (f[0] + 1 + off) + ' ' + (f[1] + 1 + off) + ' ' + (f[2] + 1 + off)); });
      off += e.vertices.length;
    });
    return out.join('\n') + '\n';
  }
  function parseObj(text) {
    var V = [], F = [];
    text.split('\n').forEach(function (l) {
      var p = l.split(' ');
      if (p[0] === 'v') V.push([+p[1], +p[2], +p[3]]); else if (p[0] === 'f') F.push([p[1] - 1, p[2] - 1, p[3] - 1]);
    });
    return { vertices: V, faces: F };
  }

  // ---- assembly of storeys ----
  function assemble(manifest, files, layerMap, config, deps) {
    if (!(typeof config.align_tol === 'number')) throw new Error('assemble: config.align_tol required (metres)');
    var hashHex = deps.hashHex, storeys = [], elements = [], gaps = [], warnings = [], ref = null;
    manifest.storeys.forEach(function (st) {
      if (!(st.file in files)) throw new Error('assemble: file missing for storey ' + st.name);
      var run = Dxf2Bim.run(files[st.file], layerMap, config, deps);
      var mesh = meshFromOps(run.ops, { level: st.level, hashHex: hashHex, snapTol: config.snap_tol });
      var ext = run.report.extent_m;
      if (ext) {
        var c = [(ext.min[0] + ext.max[0]) / 2, (ext.min[1] + ext.max[1]) / 2];
        if (!ref) ref = { name: st.name, c: c };
        else if (Math.abs(c[0] - ref.c[0]) > config.align_tol || Math.abs(c[1] - ref.c[1]) > config.align_tol)
          warnings.push('WARN:storey_extent_mismatch ' + st.name + ' vs ' + ref.name + ' centre offset [' + r6(c[0] - ref.c[0]) + ',' + r6(c[1] - ref.c[1]) + '] m');
      }
      storeys.push({ name: st.name, level: st.level, run_id: run.run_id, extent_m: ext, counts: run.report.counts, mesh_gaps: mesh.gaps.length });
      mesh.gaps.forEach(function (g) { gaps.push(Object.assign({ storey: st.name }, g)); });
      mesh.elements.forEach(function (e) { elements.push(Object.assign({}, e, { storey: st.name, _src: e.guid, guid: '' })); });
      run.report.warnings.forEach(function (w) { warnings.push(st.name + ': ' + w); });
    });
    var runId = hashHex(Dxf2Bim.canon({ manifest: manifest, storey_runs: storeys.map(function (s) { return s.run_id; }), align_tol: config.align_tol }));
    elements.forEach(function (e) { e.guid = hashHex(runId + '|' + e.storey + '|' + e._src).slice(0, 32); delete e._src; });
    return { run_id: runId, storeys: storeys, elements: elements, gaps: gaps, warnings: warnings };
  }

  return { meshFromOps: meshFromOps, assemble: assemble, toObj: toObj, parseObj: parseObj, volume: volume, watertight: watertight, box: box, prism: prism };
});
