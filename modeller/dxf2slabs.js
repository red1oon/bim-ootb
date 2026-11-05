// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2slabs.js — ground slabs on the rafts' outlines (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D109 P4). Pure, Node + browser.
// The drawing states a slab's thickness (S.O.G-150mm) but draws no closed floor outline; the raft under it does have one. A level with no closed outline is a gap, never a guessed floor:
// a floor across the footprint would close a double-height hall.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ P: require('./dxf2prep.js'), S: require('./dxf2bim/dxf2shell.js') });
  else root.Dxf2Slabs = factory({ P: root.Dxf2Prep, S: root.Dxf2Shell });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var P = D.P, S = D.S, r6 = function (v) { return Number(Number(v).toFixed(6)); };
  var SOG = /^S\.?O\.?G\.?\s*-?\s*(\d+)\s*mm$/i, TOC = /^TOC:?\s*([+-]\d+\.\d+)\s*m?$/i;
  var clean = function (t) { return String(t).replace(/\\[A-Za-z][^;\\]*;/g, '').replace(/\\P/g, ' ').replace(/[{}]/g, '').trim(); };
  function inRing(x, y, r) { var c = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function mostNamed(c) { var k = Object.keys(c).sort(function (a, b) { return c[b] - c[a] || Number(a) - Number(b); }); return k; }
  function buildSlabs(sheets, bodies, opts) {
    opts = opts || {};
    var els = [], gaps = [], DF = opts.DF, setting = function (q, d) { return DF && DF.has(q) ? DF.get(q) : d; }, report = { levels: 0, built_levels: 0, slabs: 0 }, built = {};
    var rafts = bodies.filter(function (e) { return e.outline; }), plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    var footLevels = {}; rafts.forEach(function (e) { footLevels[e.z1] = 1; });
    var levels = plans.map(function (p) { return p.level; }).filter(function (l, i, a) { return a.indexOf(l) === i && !footLevels[l]; });
    if (setting('slab.ground_on_raft', 'read') === 'read') plans.forEach(function (ps, pi) {
      var k = ps.factor, T = (ps.dxf.entities || []).filter(function (e) { return e.type === 'TEXT' || e.type === 'MTEXT'; }).map(function (e) { var q = e.position || e.startPoint || {}; return { t: clean(e.text), x: q.x * k, y: q.y * k }; });
      rafts.forEach(function (raft, ri) {
        var inside = T.filter(function (q) { return inRing(q.x, q.y, raft.outline); }), cnt = {}, toc = {};
        inside.forEach(function (q) { var m = SOG.exec(q.t); if (m) cnt[m[1]] = (cnt[m[1]] || 0) + 1; var n = TOC.exec(q.t); if (n) { var z = String(Number(n[1])); toc[z] = (toc[z] || 0) + 1; } });
        var v = mostNamed(cnt); if (!v.length) return;
        var t = Number(v[0]) * 0.001, tv = mostNamed(toc), top = tv.length ? Number(tv[0]) : ps.level, pm = S.prismPoly(raft.outline, [], r6(top - t), r6(top)); if (!pm) return;
        built[ps.level] = 1; report.slabs++; if (DF && DF.has('slab.ground_on_raft')) DF.use('slab.ground_on_raft');
        els.push({ guid: 'body-slab-' + pi + '-' + ri, class: 'IfcSlab', storey: 'Level ' + (levels.indexOf(ps.level) + 1), vertices: pm.vertices, faces: pm.faces, handle: raft.handle, layer: raft.layer, sheet: ps.name, kind: 'slab', mark: null, members: [], z0: r6(top - t), z1: r6(top),
          size: { t: { value: t, source: 'label', others: v.slice(1).map(function (q) { return cnt[q] + 'x ' + q + ' mm'; }) }, top: { value: r6(top), source: tv.length ? 'TOC label' : 'plan level' }, outline: { source: 'the raft under it' } }, height_source: tv.length ? 'label' : 'plan', prov: 'derived', ifc: Object.assign(P.ifcType('slab', null, null), { PredefinedType: 'FLOOR' }) });
      });
    });
    levels.forEach(function (l) { report.levels++; if (built[l]) report.built_levels++; else gaps.push({ code: 'GAP:slab_no_outline', kind: 'slab', detail: 'level ' + l + ': no closed floor outline on the sheets; a floor is not guessed' }); });
    return { els: els, gaps: gaps, report: report };
  }
  return { buildSlabs: buildSlabs };
});
