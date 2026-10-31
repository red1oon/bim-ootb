// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2analytical.js — a STARTING analytical model from the converted set (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D103, W-ANALYTICAL): nodes, member centrelines, sections, materials,
// supports and a self-weight load case, as STAAD.Pro text (toStaad) and an open JSON (toJSON, format dxf2bim-analytical/1). Not a design: the engineer reviews supports, releases,
// sections and loads. Pure, Node + browser. Every number comes from a body, a registry row (analytical.*, load.*) or LoadSummary (the one section reader); nothing is guessed:
// what the drawing does not say is a finding or a leftOut, never filled. Log §ANALYTICAL.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Analytical = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* ZQ: heights are compared to 0.1 mm (the .std's own precision) so float noise from an IFC round trip cannot reorder members */
  var TAG = '§ANALYTICAL', FORMAT = 'dxf2bim-analytical/1', ORDER = { IfcColumn: 0, IfcBeam: 1, IfcMember: 2 }, ZQ = 1E4, JQ = 1E4, E_STEEL_KNM2 = 2.0E8;   /* 200 GPa, stated in the §D103 spec */
  var LEFT = { IfcPlate: 'gusset: a connection, not a member', IfcWall: 'non-structural brick panel: a load, not applied in v1', IfcRoof: 'roof sheet: a load, not applied in v1',
    IfcFan: 'equipment: a load, not applied in v1', IfcDoor: 'opening: a load, not a member', IfcCovering: 'covering: a load, not applied in v1', IfcFooting: 'becomes a support (see supports)' };

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
  function mean(P) { var s = [0, 0, 0]; P.forEach(function (p) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }); return [s[0] / P.length, s[1] / P.length, s[2] / P.length]; }
  function numOf(v) { return v && typeof v === 'object' ? Number(v.number) : Number(v); }
  function extent(P, u) { var lo = Infinity, hi = -Infinity; P.forEach(function (p) { var d = dot(p, u); if (d < lo) lo = d; if (d > hi) hi = d; }); return hi - lo; }
  // the long axis of a prism: power iteration on the vertex covariance (deterministic start); the two end centres are the means of the vertices on either side of the mid projection
  function axisOf(P) {
    var c = mean(P), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    P.forEach(function (p) { var d = sub(p, c); for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; });
    var u = [1, 1, 1];
    for (var k = 0, ITER = 60; k < ITER; k++) { var w = [0, 1, 2].map(function (i) { return C[i][0] * u[0] + C[i][1] * u[1] + C[i][2] * u[2]; }), n = Math.hypot(w[0], w[1], w[2]); if (!(n > 0)) break; u = [w[0] / n, w[1] / n, w[2] / n]; }
    var pr = P.map(function (p) { return dot(sub(p, c), u); }), lo = Math.min.apply(null, pr), hi = Math.max.apply(null, pr), mid = (lo + hi) / 2;
    var A = P.filter(function (p, i) { return pr[i] <= mid; }), B = P.filter(function (p, i) { return pr[i] > mid; });
    return { a: mean(A), b: mean(B), u: u };
  }
  // an angle's second moments about its own centroidal axes, parallel to the legs: two rectangles (leg a x t, then (b - t) x t); n angles = n x one (the gap between a pair is not drawn)
  function angleProps(A) {
    var a = A.a, b = A.b, t = A.t, a1 = a * t, a2 = (b - t) * t, ar = a1 + a2, yb = (a1 * t / 2 + a2 * (t + b) / 2) / ar, xb = (a1 * a / 2 + a2 * t / 2) / ar;
    var iz = a * Math.pow(t, 3) / 12 + a1 * Math.pow(t / 2 - yb, 2) + t * Math.pow(b - t, 3) / 12 + a2 * Math.pow((t + b) / 2 - yb, 2);
    var iy = t * Math.pow(a, 3) / 12 + a1 * Math.pow(a / 2 - xb, 2) + (b - t) * Math.pow(t, 3) / 12 + a2 * Math.pow(t / 2 - xb, 2);
    return { AX: A.n * ar, IY: A.n * iy, IZ: A.n * iz, formula: 'area = n t (a + b - t); I about each centroidal axis = sum of the two leg rectangles (b h^3 / 12 + A d^2), n x one angle, product of inertia ignored; a, b, t from the label' };
  }
  function fx(v, dp) { var s = Number(v).toFixed(dp); return /^-0\.0*$/.test(s) ? s.slice(1) : s; }
  function ex(v) { return Number(v).toExponential(5).replace('e', 'E'); }
  function ranges(ids) {   // 1 2 3 5 -> "1 TO 3 5"
    var out = [], i = 0; ids = ids.slice().sort(function (p, q) { return p - q; });
    while (i < ids.length) { var j = i; while (j + 1 < ids.length && ids[j + 1] === ids[j] + 1) j++; out.push(j - i >= 2 ? ids[i] + ' TO ' + ids[j] : ids.slice(i, j + 1).join(' ')); i = j + 1; }
    return out.join(' ');
  }
  function wrap(head, body, tail) {   // a data line; STAAD continues a line that ends with a hyphen
    var lines = [], cur = head, first = true, width = 66;
    body.split(' ').forEach(function (w) { var sep = cur === '' ? '' : ' '; if (!first && (cur + sep + w).length > width) { lines.push(cur + ' -'); cur = w; } else { cur += sep + w; first = false; } });
    lines.push(cur + (tail ? ' ' + tail : '')); return lines;
  }
  function comment(s) {   // '* ' lines of at most 78 characters (STAAD's default input width is 79)
    var lines = [], cur = '*', max = 78;
    String(s).split(' ').forEach(function (w) { if (cur.length > 3 && (cur + ' ' + w).length > max) { lines.push(cur); cur = '*   ' + w; } else cur += (cur === '*' ? ' ' : ' ') + w; });
    lines.push(cur); return lines;
  }

  // els: the converted bodies (R.els: class, kind, guid, sheet, handle, z0, z1, vertices, size, ifc{type_name, props}). o: { values (the registry table key -> value), sources, LS (LoadSummary) }
  function build(els, o) {
    o = o || {}; var V = o.values || {}, LS = o.LS, log = [];
    var snap = Number(V['analytical.node_snap']), supType = String(V['analytical.support'] == null ? '' : V['analytical.support']).toUpperCase();
    var res = { format: FORMAT, nodes: [], members: [], supports: [], sections: {}, materials: {}, leftOut: [], findings: [], assumptions: [], refused: null, params: { node_snap_m: snap, support: supType }, log: log };
    if (!(snap > 0) || (supType !== 'FIXED' && supType !== 'PINNED')) { res.refused = 'registry rows analytical.node_snap / analytical.support missing or invalid'; log.push(TAG + ' refused ' + res.refused); return res; }
    if (!LS) throw new Error('Dxf2Analytical.build needs o.LS (LoadSummary): the one section reader');
    var ls = LS.compute(els, { values: V, sources: o.sources || {} }), lsBy = {}; ls.rows.forEach(function (r) { lsBy[r.guid] = r; });
    var rc = Number(V['load.unit_weight.concrete']) + 0.63 * Number(V['load.rc_steel_percent']), steel = Number(V['load.unit_weight.steel']);
    var sorted = (els || []).slice().sort(function (p, q) { var a = ORDER[p['class']], b = ORDER[q['class']]; a = a === undefined ? 9 : a; b = b === undefined ? 9 : b; return a - b || (Math.round(p.z0 * ZQ) - Math.round(q.z0 * ZQ)) || (p.guid < q.guid ? -1 : p.guid > q.guid ? 1 : 0); });
    var cand = [], baseZ = Infinity;
    (els || []).forEach(function (e) { if (e['class'] === 'IfcColumn' && e.z0 < baseZ) baseZ = e.z0; });
    sorted.forEach(function (e) {
      var c = e['class'], src = { guid: e.guid, class: c, kind: e.kind || null, sheet: e.sheet || null, handle: e.handle || null };
      if (ORDER[c] === undefined) {
        var why = LEFT[c] || 'not a structural member in v1';
        if (c === 'IfcSlab') why = e.z0 <= baseZ ? 'slab on grade: bears on the ground' : 'slab: a load, not applied in v1';
        res.leftOut.push(Object.assign({ reason: why }, src)); return;
      }
      var P = e.vertices || [], row = lsBy[e.guid] || {}, props = (e.ifc && e.ifc.props) || {}, A, B, sec = null, mat = null, why2 = null;
      if (P.length < 4) { res.leftOut.push(Object.assign({ reason: 'no geometry' }, src)); return; }
      if (c === 'IfcColumn') {
        var xy = mean(P), sx = e.size && e.size.x !== undefined ? numOf(e.size.x) : NaN, sy = e.size && e.size.y !== undefined ? numOf(e.size.y) : NaN, bx = extent(P, [1, 0, 0]), by = extent(P, [0, 1, 0]);
        A = [xy[0], xy[1], e.z0]; B = [xy[0], xy[1], e.z1];
        sec = { kind: 'rect', YD: isFinite(sy) ? sy : by, ZD: isFinite(sx) ? sx : bx, from: isFinite(sx) && isFinite(sy) ? 'the body\'s stated size' : 'the body\'s box', assumed: false };
      } else {
        var ax = axisOf(P); A = ax.a; B = ax.b;
        if (c === 'IfcBeam') {
          var h = Math.hypot(ax.u[0], ax.u[1]), pw = h > 0 ? [-ax.u[1] / h, ax.u[0] / h, 0] : [1, 0, 0], sw = e.size && e.size.w !== undefined ? numOf(e.size.w) : NaN, sd = e.size && e.size.d !== undefined ? numOf(e.size.d) : NaN;
          sec = { kind: 'rect', YD: isFinite(sd) ? sd : e.z1 - e.z0, ZD: isFinite(sw) ? sw : extent(P, pw), from: isFinite(sw) && isFinite(sd) ? 'the body\'s stated size' : 'the body\'s box (width across the axis, depth = height)', assumed: false };
        } else if (row.section) {
          sec = { kind: 'angle', A: row.section, label: row.assumed ? row.sectionFrom : (e.ifc && e.ifc.type_name) || '', from: row.assumed ? 'assumed: ' + row.sectionFrom : 'the member\'s label', assumed: !!row.assumed };
        } else why2 = 'no section drawn, none assumed (' + (row.missing || 'section size not drawn') + ')';
      }
      if (why2) { res.leftOut.push(Object.assign({ reason: why2 }, src)); res.findings.push({ code: 'no_section', message: c + ' ' + src.sheet + ' ' + src.handle + ': ' + why2 + '; left out, not given a section', guid: e.guid, sheet: src.sheet, handle: src.handle }); return; }
      var matName = String((e.ifc && e.ifc.material) || ''), steelLike = c === 'IfcMember' || /steel/i.test(matName);
      if (steelLike) {
        mat = { key: 'STEEL', E: E_STEEL_KNM2, density: steel, cite: 'steel E 200 GPa (§D103); density = registry load.unit_weight.steel' };
        if (c !== 'IfcMember' && sec.kind === 'rect') res.findings.push({ code: 'box_section_steel', message: c + ' ' + src.sheet + ' ' + src.handle + ' is steel (' + matName + ') but its section is the geometry\'s box, not a rolled profile: the engineer sets the profile', guid: e.guid, sheet: src.sheet, handle: src.handle });
      } else if (matName !== '' && !/concrete/i.test(matName)) {
        res.findings.push({ code: 'material_unknown', message: c + ' ' + src.sheet + ' ' + src.handle + ': material "' + matName + '" is neither concrete nor steel, so no elastic modulus is given (the engineer states it)', guid: e.guid, sheet: src.sheet, handle: src.handle });
      } else {
        var fc = Number(props.Note_fc_MPa);
        if (isFinite(fc) && fc > 0) mat = { key: 'CONC_fc' + fc, E: 4700 * Math.sqrt(fc) * 1000, density: rc, fc: fc, cite: 'E = 4700 sqrt(f\'c) MPa, f\'c ' + fc + ' MPa from the drawing\'s note ' + (props.NoteSource_fc_MPa || '') + ' (ACI 318-19 §19.2.2.1); density = registry load.unit_weight.concrete + 0.63 x load.rc_steel_percent (BNBC 2012 Table 2.2.1 note, as the Load Summary)' };
        else res.findings.push({ code: 'fc_missing', message: c + ' ' + src.sheet + ' ' + src.handle + ': no f\'c stated on the drawing, so no elastic modulus is given (the engineer states it)', guid: e.guid, sheet: src.sheet, handle: src.handle });
      }
      cand.push({ el: e, src: src, A: A, B: B, sec: sec, mat: mat, len0: dist(A, B) });
    });
    if (!cand.length) { res.refused = 'no structural member (column, beam or member with a section) in the set'; log.push(TAG + ' refused ' + res.refused); return res; }

    // nodes: ends in priority order (columns, beams, members); an end joins the first node within the snap, else it is a new node anchored at that end
    var nodes = [];
    function nodeFor(p) { for (var i = 0; i < nodes.length; i++) if (dist(nodes[i].p, p) <= snap) return nodes[i]; var n = { id: nodes.length + 1, p: p.slice(), ends: [] }; nodes.push(n); return n; }
    var shifts = [];
    cand.forEach(function (m) { m.n1 = nodeFor(m.A); m.n2 = nodeFor(m.B); shifts.push(dist(m.A, m.n1.p), dist(m.B, m.n2.p)); });
    var live = cand.filter(function (m) {
      if (m.n1 !== m.n2) return true;
      res.leftOut.push(Object.assign({ reason: 'shorter than the snap: both ends are one joint' }, m.src)); res.findings.push({ code: 'short_member', message: m.src.class + ' ' + m.src.sheet + ' ' + m.src.handle + ' is ' + fx(m.len0, 4) + ' m long, under the snap ' + snap + ' m: left out', guid: m.src.guid, sheet: m.src.sheet, handle: m.src.handle }); return false;
    });
    cand.forEach(function (m) { if (m.n1 !== m.n2 && m.len0 < snap) res.findings.push({ code: 'short_member', message: m.src.class + ' ' + m.src.sheet + ' ' + m.src.handle + ' is ' + fx(m.len0, 4) + ' m long, under the snap ' + snap + ' m (kept: its ends are two joints)', guid: m.src.guid, sheet: m.src.sheet, handle: m.src.handle }); });
    function deg() { nodes.forEach(function (n) { n.deg = 0; }); live.forEach(function (m) { m.n1.deg++; m.n2.deg++; }); }
    deg();

    // supports: a column's lowest end, plan centre inside a footing, the footing's top at or under it. The vertical gap is reported, not closed.
    var feet = (els || []).filter(function (e) { return e['class'] === 'IfcFooting' && e.vertices && e.vertices.length; }).map(function (e) {
      var X = e.vertices.map(function (v) { return v[0]; }), Y = e.vertices.map(function (v) { return v[1]; });
      return { guid: e.guid, sheet: e.sheet, handle: e.handle, x0: Math.min.apply(null, X), x1: Math.max.apply(null, X), y0: Math.min.apply(null, Y), y1: Math.max.apply(null, Y), top: e.z1 }; });
    var topOfCol = {}, botOfCol = {}; live.forEach(function (m) { if (m.src.class === 'IfcColumn') { topOfCol[m.n2.id] = true; botOfCol[m.n1.id] = true; } });
    var supNodes = {};
    nodes.forEach(function (n) {
      if (!botOfCol[n.id] || topOfCol[n.id]) return;
      var best = null; feet.forEach(function (f) { if (n.p[0] >= f.x0 && n.p[0] <= f.x1 && n.p[1] >= f.y0 && n.p[1] <= f.y1 && f.top <= n.p[2] + snap && (!best || f.top > best.top)) best = f; });
      if (best) { supNodes[n.id] = true; res.supports.push({ node: n.id, type: supType, footing: best.guid, footingSheet: best.sheet, footingHandle: best.handle, footingTop: best.top, gap: Math.max(0, n.p[2] - best.top) }); }
    });
    var gaps = res.supports.map(function (s) { return s.gap; }).filter(function (g) { return g > snap; });
    if (gaps.length) res.findings.push({ code: 'support_gap', message: gaps.length + ' of ' + res.supports.length + ' column bases sit ' + fx(Math.min.apply(null, gaps), 4) + ' to ' + fx(Math.max.apply(null, gaps), 4) + ' m above their footing top: the pedestal between is not drawn, so the support is placed at the column base', n: gaps.length });

    // a free end that lands on another member's span (within the snap, clear of that member's ends) is a joint there: the other member is split at the foot, the end moves onto it
    var splits = 0;
    nodes.forEach(function (n) {
      if (n.deg !== 1 || supNodes[n.id]) return;
      var best = null;
      live.forEach(function (m) {
        if (m.n1 === n || m.n2 === n) return;
        var d = sub(m.n2.p, m.n1.p), L2 = dot(d, d); if (!(L2 > 0)) return;
        var t = dot(sub(n.p, m.n1.p), d) / L2; if (!(t > 0 && t < 1)) return;
        var foot = [m.n1.p[0] + t * d[0], m.n1.p[1] + t * d[1], m.n1.p[2] + t * d[2]], dd = dist(foot, n.p);
        if (dd > snap || dist(foot, m.n1.p) <= snap || dist(foot, m.n2.p) <= snap) return;
        if (!best || dd < best.dd) best = { m: m, t: t, foot: foot, dd: dd };
      });
      if (best) { shifts.push(best.dd); n.p = best.foot; (best.m.cuts = best.m.cuts || []).push({ t: best.t, node: n }); splits++; }
    });
    // build the member list: a cut member becomes consecutive pieces
    var members = [];
    live.forEach(function (m) {
      var chain = [m.n1].concat((m.cuts || []).slice().sort(function (p, q) { return p.t - q.t; }).map(function (c) { return c.node; }), [m.n2]);
      for (var i = 0; i + 1 < chain.length; i++) members.push({ id: 0, n1: chain[i], n2: chain[i + 1], m: m, piece: chain.length > 2 ? i + 1 : 0 });
    });
    members.forEach(function (q, i) { q.id = i + 1; });
    nodes.forEach(function (n) { n.deg = 0; }); members.forEach(function (q) { q.n1.deg++; q.n2.deg++; });

    // sections and materials, keyed by what they hold
    var secKey = {}, matUsed = {}, secN = 0;
    members.forEach(function (q) {
      var s = q.m.sec, key = s.kind === 'rect' ? 'RECT ' + fx(s.YD, 4) + 'x' + fx(s.ZD, 4) : 'ANGLE ' + s.A.n + 'x' + fx(s.A.a * 1000, 2) + 'x' + fx(s.A.b * 1000, 2) + 'x' + fx(s.A.t * 1000, 2);
      if (!secKey[key]) { secN++; var P2 = s.kind === 'angle' ? angleProps(s.A) : null;
        secKey[key] = res.sections[key] = s.kind === 'rect' ? { key: key, kind: 'rect', YD: s.YD, ZD: s.ZD, AX: s.YD * s.ZD, from: s.from, assumed: false, members: 0 }
          : { key: key, kind: 'angle', label: s.label, AX: P2.AX, IY: P2.IY, IZ: P2.IZ, formula: P2.formula, from: s.from, assumed: s.assumed, members: 0 }; }
      secKey[key].members++; q.sec = key; if (q.m.mat) { res.materials[q.m.mat.key] = res.materials[q.m.mat.key] || { key: q.m.mat.key, E: q.m.mat.E, density: q.m.mat.density, fc: q.m.mat.fc || null, cite: q.m.mat.cite }; q.mat = q.m.mat.key; }
    });
    Object.keys(res.sections).forEach(function (k) { if (res.sections[k].assumed) res.findings.push({ code: 'assumed_section', message: 'section ' + k + ' (' + res.sections[k].members + ' members) is assumed: ' + res.sections[k].from, section: k, n: res.sections[k].members }); });
    var dangling = [];
    nodes.forEach(function (n) { if (n.deg === 1 && !supNodes[n.id]) members.forEach(function (q) { if (q.n1 === n || q.n2 === n) dangling.push({ node: n.id, member: q.id, class: q.m.src.class, sheet: q.m.src.sheet, handle: q.m.src.handle, end: q.n1 === n ? 'start' : 'end', x: n.p[0], y: n.p[1], z: n.p[2] }); }); });
    if (dangling.length) res.findings.push({ code: 'dangling_end', message: dangling.length + ' member ends are joined to nothing and are not a support (listed in dangling)', n: dangling.length });

    var mxs0 = shifts.length ? Math.max.apply(null, shifts) : 0, mxs = mxs0;
    res.nodes = nodes.map(function (n) { return { id: n.id, x: n.p[0], y: n.p[1], z: n.p[2] }; });
    res.members = members.map(function (q) { return { id: q.id, n1: q.n1.id, n2: q.n2.id, class: q.m.src.class, guid: q.m.src.guid, sheet: q.m.src.sheet, handle: q.m.src.handle, piece: q.piece, section: q.sec, material: q.mat || null, length: dist(q.n1.p, q.n2.p), axisLength: q.m.len0 }; });
    res.dangling = dangling; res.splits = splits; res.maxShift = mxs0;
    res.assumptions = ['joints: member ends closer than ' + snap + ' m are one joint (registry analytical.node_snap); a free end within that distance of another member\'s span splits it there',
      'beams and members run centroid axis to centroid axis (beam at its box mid-height); columns at their plan centre',
      'supports: ' + supType + ' where a column base is over a footing (registry analytical.support): the engineer confirms',
      'one load case DEAD = SELFWEIGHT Z -1 (sections x density); walls, roof sheet, fans, doors, netting are NOT applied; no live, wind or seismic load',
      'member releases, local axes (BETA), Poisson\'s ratio, torsion constants and design parameters are not stated by the drawings and are left to the engineer'];
    var by = {}; res.members.forEach(function (q) { by[q.class] = (by[q.class] || 0) + 1; });
    var lby = {}; res.leftOut.forEach(function (q) { lby[q.class] = (lby[q.class] || 0) + 1; });
    log.push(TAG + ' members=' + res.members.length + ' byClass=' + JSON.stringify(by) + ' joints=' + res.nodes.length + ' supports=' + res.supports.length + ' (' + supType + ') dangling_ends=' + dangling.length + ' splits=' + splits +
      ' sections=' + Object.keys(res.sections).length + ' assumed_sections=' + Object.keys(res.sections).filter(function (k) { return res.sections[k].assumed; }).length + ' materials=' + Object.keys(res.materials).length +
      ' leftOut=' + res.leftOut.length + ' ' + JSON.stringify(lby) + ' snap_m=' + snap + ' max_end_shift_m=' + fx(mxs, 4));
    res.findings.forEach(function (f) { log.push(TAG + '_FINDING ' + f.code + ' ' + f.message); });
    return res;
  }

  function toStaad(M) {
    if (!M || M.refused) throw new Error('toStaad: no model (' + (M && M.refused) + ')');
    var L = [], c = function (s) { comment(s).forEach(function (x) { L.push(x); }); };
    L.push('STAAD SPACE DXF2BIM ANALYTICAL MODEL');
    c('Generated from the 2D drawings by DXF2BIM (' + M.format + '). A STARTING model, NOT a design.');
    c('The engineer reviews the supports, member releases, sections and loads before any analysis.');
    c('Assumptions (every one):'); M.assumptions.forEach(function (a) { c('  - ' + a); });
    c('Findings (' + M.findings.length + '):'); M.findings.forEach(function (f) { c('  - ' + f.code + ': ' + f.message); });
    c('Left out of the member list: ' + M.leftOut.length + ' bodies (listed with reasons in analytical.json).');
    L.push('SET Z UP', 'UNIT METER KN', 'JOINT COORDINATES');
    M.nodes.forEach(function (n) { L.push(n.id + ' ' + fx(n.x, 4) + ' ' + fx(n.y, 4) + ' ' + fx(n.z, 4) + ';'); });
    L.push('MEMBER INCIDENCES'); M.members.forEach(function (q) { L.push(q.id + ' ' + q.n1 + ' ' + q.n2 + ';'); });
    var mats = Object.keys(M.materials).sort();
    if (mats.length) { L.push('DEFINE MATERIAL START'); mats.forEach(function (k) { var m = M.materials[k]; c(m.cite); L.push('ISOTROPIC ' + k.replace(/[^A-Za-z0-9_]/g, '_'), 'E ' + ex(m.E), 'DENSITY ' + fx(m.density, 4)); }); L.push('END DEFINE MATERIAL'); }
    L.push('MEMBER PROPERTY');
    Object.keys(M.sections).sort().forEach(function (k) {
      var s = M.sections[k], ids = M.members.filter(function (q) { return q.section === k; }).map(function (q) { return q.id; });
      c(k + ' (' + s.members + ' members): ' + s.from); if (s.formula) c(s.label + ': ' + s.formula);
      wrap('', ranges(ids), s.kind === 'rect' ? 'PRIS YD ' + fx(s.YD, 4) + ' ZD ' + fx(s.ZD, 4) : 'PRIS AX ' + ex(s.AX) + ' IY ' + ex(s.IY) + ' IZ ' + ex(s.IZ)).forEach(function (x) { L.push(x); });
    });
    if (mats.length) { L.push('CONSTANTS'); mats.forEach(function (k) { var ids = M.members.filter(function (q) { return q.material === k; }).map(function (q) { return q.id; });
      if (ids.length) wrap('MATERIAL ' + k.replace(/[^A-Za-z0-9_]/g, '_') + ' MEMB', ranges(ids), '').forEach(function (x) { L.push(x.replace(/ $/, '')); }); }); }
    L.push('SUPPORTS');
    ['FIXED', 'PINNED'].forEach(function (t) { var ids = M.supports.filter(function (s) { return s.type === t; }).map(function (s) { return s.node; }); if (ids.length) wrap('', ranges(ids), t).forEach(function (x) { L.push(x); }); });
    L.push('LOAD 1 LOADTYPE Dead TITLE DEAD', 'SELFWEIGHT Z -1', 'FINISH');
    return L.join('\n') + '\n';
  }
  function toJSON(M) {
    if (!M || M.refused) throw new Error('toJSON: no model (' + (M && M.refused) + ')');
    return JSON.stringify({ format: M.format, units: { length: 'm', force: 'kN', up: 'Z' }, params: M.params, assumptions: M.assumptions, nodes: M.nodes, members: M.members, supports: M.supports,
      sections: M.sections, materials: M.materials, loads: [{ case: 'DEAD', selfweight: { z: -1 } }], dangling: M.dangling, leftOut: M.leftOut, findings: M.findings }, function (k, v) { return typeof v === 'number' ? Math.round(v * JQ) / JQ : v; }, 1) + '\n';   /* numbers to 0.1 mm, the .std precision: the IFC's Float32 store carries 1e-7 noise */
  }

  // ---- the IFC side (§D105): what the shared extractor (ifc_extract_core.js) wrote -> the neutral element list `build` takes. Reads only the extractor's own tables; nothing is invented. ----
  // q(sql) -> array of rows (RegReport.fromModel's q). elements_meta (class, Name, material), element_transforms (centre: the vertices are stored centred on it), element_instances ->
  // component_geometries (Float32 x,y,z, one triple per triangle corner: deduplicated here), element_dxf2bim (the Dxf2Bim_Evidence pset: Kind, Source*, Note_*, SourceGuid, Size_*).
  var SIZE_KEYS = ['x', 'y', 'w', 'd', 't', 'slope_deg'];
  function fromDb(q) {
    var ev = {};
    try { q('SELECT guid, name, value FROM element_dxf2bim').forEach(function (r) { (ev[r[0]] = ev[r[0]] || {})[r[1]] = r[2]; }); } catch (e) { /* an IFC without the evidence pset has no such table */ }
    var rows = q('SELECT m.guid, m.ifc_class, m.element_name, m.material_name, m.storey, t.center_x, t.center_y, t.center_z, g.vertices FROM elements_meta m LEFT JOIN element_transforms t ON t.guid = m.guid ' +
      'LEFT JOIN element_instances i ON i.guid = m.guid LEFT JOIN component_geometries g ON g.geometry_hash = i.geometry_hash ORDER BY m.guid');
    return rows.map(function (r) {
      var props = ev[r[0]] || {}, V = [], z0 = 0, z1 = 0;
      if (r[8] && r[5] !== null) {
        var u8 = r[8], f = new Float32Array(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)), seen = {};
        for (var i = 0; i + 2 < f.length; i += 3) { var k = f[i] + ',' + f[i + 1] + ',' + f[i + 2]; if (!seen[k]) { seen[k] = 1; V.push([f[i] + r[5], f[i + 1] + r[6], f[i + 2] + r[7]]); } }
        z0 = Math.min.apply(null, V.map(function (v) { return v[2]; })); z1 = Math.max.apply(null, V.map(function (v) { return v[2]; }));
      }
      if (props.Z0 !== undefined && props.Z1 !== undefined) { z0 = Number(props.Z0); z1 = Number(props.Z1); }   /* the writer's stated base / top (Z0, Z1); else the vertex extent above */
      var size = null; SIZE_KEYS.forEach(function (k) { if (props['Size_' + k] !== undefined) { size = size || {}; size[k] = { number: Number(props['Size_' + k]) }; } });
      var pr = {}; Object.keys(props).forEach(function (k) { pr[k] = props[k]; });
      return { guid: props.SourceGuid || r[0], ifcGuid: r[0], 'class': r[1], kind: props.Kind || null, storey: r[4], z0: z0, z1: z1, vertices: V, size: size,
        sheet: props.SourceSheet || '(ifc)', handle: props.SourceHandle || r[0], ifc: { type_name: r[2], material: r[3] || '', props: pr } };
    });
  }
  // the whole route, one function for the CLI and the page: IFC bytes -> extractor -> fromDb -> build. e: { ifcBytes, WebIFC, ifcApi (initialised), SQL, Core, LS, values, sources, log }
  async function fromIfc(e) {
    var db = new e.SQL.Database(), els;
    try {
      await e.Core.extractToDb({ WebIFC: e.WebIFC, ifcApi: e.ifcApi, ifcData: e.ifcBytes, db: e.Core.sqljsDb(db), Buf: e.Core.browserBuf, buildingName: 'MODEL', sourceName: 'model.ifc', log: function () {} });
      els = fromDb(function (sql) { var r = db.exec(sql); return r.length ? r[0].values : []; });
    } finally { db.close(); }
    var m = build(els, { values: e.values, sources: e.sources, LS: e.LS });
    m.elements = els;   /* the neutral list the builder read: a witness re-builds from it */
    m.input = { elements: els.length, withGeometry: els.filter(function (x) { return x.vertices.length; }).length, evidence: els.filter(function (x) { return x.ifc.props.SourceHandle !== undefined; }).length };
    m.log.unshift(TAG + ' input ifc elements=' + m.input.elements + ' withGeometry=' + m.input.withGeometry + ' withEvidence=' + m.input.evidence);
    return m;
  }
  return { build: build, fromDb: fromDb, fromIfc: fromIfc, toStaad: toStaad, toJSON: toJSON, FORMAT: FORMAT, axisOf: axisOf, angleProps: angleProps };
});
