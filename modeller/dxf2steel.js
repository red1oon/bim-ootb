// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2steel.js — steel members: a section label + the one line it names, the true profile swept along it (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D109 P5). Pure, Node + browser.
// A label that states its sizes (L100x100x8, BU-500x300x50x25, RB70) needs nothing else. A UB names a designation: its web and flange come from a yellow table that is not the drawing. Unknown section or no line = a gap, never a box.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ P: require('./dxf2prep.js'), S: require('./dxf2bim/dxf2shell.js'), BM: require('./dxf2beams.js') });
  else root.Dxf2Steel = factory({ P: root.Dxf2Prep, S: root.Dxf2Shell, BM: root.Dxf2Beams });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var P = D.P, S = D.S, H = D.BM.parts, r6 = function (v) { return Number(Number(v).toFixed(6)); };
  var UB = /^(U[BC]\d+[xX]\d+[xX]\d+)$/, ANGLE = /^L(\d+(?:\.\d+)?)[xX](\d+(?:\.\d+)?)[xX](\d+(?:\.\d+)?)$/, ROD = /^RB(\d+)$/, BU = /^BU-(\d+(?:\.\d+)?)[xX](\d+(?:\.\d+)?)[xX](\d+(?:\.\d+)?)[xX](\d+(?:\.\d+)?)$/;
  var TOS = /^TOS\b[^+-]*([+-]\d+\.\d+)/i, MEMBER = /BEAM|BRCG|BRAC/i, BRACE = /BRCG|BRAC/i, ANY = /^(?:U[BC]\d|L\d+[xX]\d|RB\d+$|BU-\d)/;
  function iProfile(h, b, tw, tf) { var x = b / 2, w = tw / 2; return [[-x, 0], [x, 0], [x, -tf], [w, -tf], [w, tf - h], [x, tf - h], [x, -h], [-x, -h], [-x, tf - h], [-w, tf - h], [-w, -tf], [-x, -tf]]; }
  function profileOf(t, table) {   // metres; y = 0 at the member's top, x centred on its line
    var m;
    if ((m = BU.exec(t))) { var q = m.slice(1).map(Number), h = q[0], b = q[1], tf = q[2], tw = q[3]; return { ring: iProfile(h, b, tw, tf), name: t, sizes: { h: h, b: b, tf: tf, tw: tw }, cls: 'IfcBeam', source: 'label' }; }
    if ((m = ANGLE.exec(t))) { var a = Number(m[1]), c = Number(m[2]), e = Number(m[3]); return { ring: [[-c / 2, 0], [c / 2, 0], [c / 2, -e], [e - c / 2, -e], [e - c / 2, -a], [-c / 2, -a]], name: t, sizes: { h: a, b: c, t: e }, cls: 'IfcMember', source: 'label', angle: true }; }
    if ((m = ROD.exec(t))) { var d = Number(m[1]), r = d / 2, ring = Array.apply(null, Array(16)).map(function (_, i) { var w = i * Math.PI / 8; return [r * Math.cos(w), r * Math.sin(w) - r]; }); return { ring: ring, name: t, sizes: { d: d }, cls: 'IfcMember', source: 'label' }; }
    if ((m = UB.exec(t))) { var row = table && table[m[1]]; if (!row) return { unknown: true }; return { ring: iProfile(row.h, row.b, row.tw, row.tf), name: t, sizes: row, cls: 'IfcBeam', source: 'table' }; }
    return null;
  }
  function buildSteel(sheets, opts) {
    opts = opts || {};
    var els = [], gaps = [], report = { labels: 0, built: 0, same_line: 0, no_line: 0, unknown: 0 }, DF = opts.DF, setting = function (k, d) { return DF && DF.has(k) ? DF.get(k) : d; };
    var reachM = Number(setting('steel.label_reach', 1.5)), tolM = Number(setting('beam.edge_tol', 0.006)); if (!(reachM > 0)) return { els: els, gaps: gaps, report: report };
    var minLine = Number((DF && DF.meta('steel.label_reach') || {}).min_line_m || 0);
    var table = setting('steel.section_table', 'standard') === 'standard' && DF && DF.meta('steel.section_table') ? DF.meta('steel.section_table').table_mm : null;
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; }), levels = plans.map(function (p) { return p.level; }).filter(function (l, i, a) { return a.indexOf(l) === i; });
    plans.forEach(function (ps, pi) {
      var ly = ((ps.desc && ps.desc.layers) || []).filter(function (l) { return l.type === 'beamlabel'; }).map(function (l) { return l.layer; }); if (!ly.length) return;
      var k = ps.factor, reach = reachM / k, tol = tolM / k, segs = H.segments(ps).filter(function (s) { return MEMBER.test(s.layer); }), seen = {};
      var texts = (ps.dxf.entities || []).filter(function (e) { return e.type === 'TEXT' || e.type === 'MTEXT'; }).map(function (e) { var q = e.position || e.startPoint || {}; return { t: H.clean(e.text).replace(/^-\s*/, ''), x: q.x, y: q.y, layer: e.layer, handle: String(e.handle) }; });
      var tosAll = texts.map(function (q) { var m = TOS.exec(q.t); return m ? { z: Number(m[1]), x: q.x, y: q.y } : null; }).filter(Boolean);
      texts.filter(function (q) { return ly.indexOf(q.layer) >= 0 && ANY.test(q.t); }).forEach(function (lab) {
        report.labels++;
        var pf = profileOf(lab.t, table);
        if (!pf) { report.unknown++; gaps.push({ code: 'GAP:steel_section_unknown', kind: 'steel', sheet: ps.name, handle: lab.handle, detail: lab.t + ': not a section this reader knows' }); return; }
        if (pf.unknown) { report.unknown++; gaps.push({ code: 'GAP:steel_section_unknown', kind: 'steel', sheet: ps.name, handle: lab.handle, detail: lab.t + ': the sheets do not give its web and flange, and it is not in steel.section_table in force' }); return; }
        var c = segs.filter(function (s) { return s.l * k >= minLine && H.distTo(s, lab.x, lab.y) <= reach; }).map(function (s) { return { s: s, d: H.distTo(s, lab.x, lab.y), b: BRACE.test(s.layer) ? 1 : 0 }; }).sort(function (a, b) { return pf.angle ? (b.b - a.b) || (a.d - b.d) : (a.b - b.b) || (a.d - b.d); })[0];
        if (!c) { report.no_line++; gaps.push({ code: 'GAP:steel_label_no_line', kind: 'steel', sheet: ps.name, handle: lab.handle, detail: lab.t + ': no member line within ' + reachM + ' m' }); return; }
        var s = c.s, run = H.runOf(s, segs, tol, tol), ux = s.ux, uy = s.uy, nx = -uy, ny = ux, x0 = s.a.x + run.s0 * ux, y0 = s.a.y + run.s0 * uy, len = (run.s1 - run.s0) * k;
        var key = lab.t + '|' + run.members.slice().sort().join(','); if (seen[key]) { report.same_line++; return; } seen[key] = 1;
        var cl = { a: { x: x0, y: y0 }, ux: ux, uy: uy, l: run.s1 - run.s0 }, tos = tosAll.map(function (q) { return { z: q.z, d: H.distTo(cl, q.x, q.y) }; }).filter(function (q) { return q.d <= reach; }).sort(function (a, b) { return a.d - b.d; })[0], top = tos ? tos.z : ps.level;
        var pm = S.prismPoly(pf.ring.map(function (q) { return [q[0] * 0.001, q[1] * 0.001]; }), [], 0, r6(len)); if (!pm) { report.unknown++; return; }
        // the prism's x, y, z = across the member, up, along it: right-handed, so its faces stay outward
        var ox = x0 * k, oy = y0 * k, V = pm.vertices.map(function (v) { return [r6(ox + nx * v[0] + ux * v[2]), r6(oy + ny * v[0] + uy * v[2]), r6(top + v[1])]; }), zs = V.map(function (v) { return v[2]; }), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs), lv = levels.filter(function (l) { return l <= z1; }).pop(); if (lv === undefined) lv = levels[0];
        if (DF) { if (DF.has('steel.label_reach')) DF.use('steel.label_reach'); if (pf.source === 'table' && DF.has('steel.section_table')) DF.use('steel.section_table'); }
        report.built++;
        els.push({ guid: 'body-steel-' + pi + '-' + lab.handle, class: pf.cls, storey: 'Level ' + (levels.indexOf(lv) + 1), vertices: V, faces: pm.faces, handle: lab.handle, layer: lab.layer, sheet: ps.name, kind: 'steel', mark: lab.t, members: run.members, z0: z0, z1: z1,
          size: { profile: { value: lab.t, sizes: pf.sizes, source: pf.source }, length: { value: r6(len), source: 'drawn' }, top: { value: top, source: tos ? 'TOS label' : 'plan level' }, line_layer: s.layer }, height_source: tos ? 'label' : 'plan', prov: 'derived', ifc: Object.assign(P.ifcType(pf.cls === 'IfcBeam' ? 'beam' : 'member', lab.t, null), {}) });
      });
    });
    return { els: els, gaps: gaps, report: report };
  }
  return { buildSteel: buildSteel };
});
