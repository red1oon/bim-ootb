// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2section.js — bodies from a typed SECTION sheet, repeated along the building (prompts/DXF2BIM_MODELLER_LANE.md §L14). Pure, Node + browser.
// A truss drawn once in a section is a drawn fact at the cut and an assumption everywhere else. The user types the section's layers: `bar` (each LINE is a member axis),
// `plate` (each closed outline is a plate in the section plane), `member` (each outline is a run along the building, e.g. a purlin). The cut (`@CUT`) says where the drawn
// section sits; copies repeat at a spacing (default: the column pitch, a yellow default) over the grid extent. The copy AT the cut is `derived`, the others `assumed` (red).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ DF: require('./dxf2defaults.js'), MK: require('./dxf2bim/dxf2marks.js'), PR: require('./dxf2pair.js'), H: require('./dxf2hatch.js'), M: require('./dxf2bim/dxf2mesh.js'), P: require('./dxf2prep.js') });
  else root.Dxf2Section = factory({ DF: root.Dxf2Defaults, MK: root.Dxf2Marks, PR: root.Dxf2Pair, H: root.Dxf2Hatch, M: root.Dxf2Mesh, P: root.Dxf2Prep });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var DFM = D.DF, MK = D.MK, PR = D.PR, H = D.H, M = D.M, P = D.P, r6 = function (v) { return Number(Number(v).toFixed(6)); };
  var NOT_SECTION = /\b(beam|column|wall|footing|slab|grade|roof|sheet)\b/i;   // a label that names another element ("Beam-1 (12\"x10\")", "12\"x12\" Column") is not a member size
  var SIZE_RE = /(\d+(?:\.\d+)?)\s*"\s*x\s*(\d+(?:\.\d+)?)\s*"/i, PLATE_RE = /(\d+\/\d+|\d+(?:\.\d+)?)\s*(")?\s*thick(?:ness)?\s*plate/i;
  function clean(t) { return String(t == null ? '' : t).replace(/\\[fFcCHhWwQqTtAa][^;]*;/g, '').replace(/\\[Pp]/g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim(); }
  function unitName(k) { return Math.abs(k - 0.0254) < 1e-9 ? 'in' : Math.abs(k - 0.001) < 1e-12 ? 'mm' : Math.abs(k - 1) < 1e-12 ? 'm' : null; }
  function vol(m) { var v = 0; m.faces.forEach(function (f) { var a = m.vertices[f[0]], b = m.vertices[f[1]], c = m.vertices[f[2]]; v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; }); return v; }
  function outward(m) { if (vol(m) < 0) m.faces = m.faces.map(function (f) { return [f[0], f[2], f[1]]; }); return m; }
  var BOX = [[4, 5, 6], [4, 6, 7], [0, 2, 1], [0, 3, 2], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  function segDist(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }

  function buildSections(sheets, opts) {
    opts = opts || {}; var els = [], gaps = [], DEF = P.Defaults(), own = !opts.DF, DF = opts.DF || DFM.create(opts.ref, sheets, opts.choices), report = { sheets: {} };
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    var secs = sheets.filter(function (s) { return s.role === 'section' && ((s.desc && s.desc.layers) || []).some(function (l) { return ['bar', 'plate', 'member'].indexOf(l.type) >= 0; }); });
    if (!secs.length) return { els: els, gaps: gaps, defaults: [], report: report };
    if (!plans.length) { gaps.push({ code: 'GAP:section_no_plan', detail: 'a plan with a grid is needed' }); return { els: els, gaps: gaps, defaults: [], report: report }; }
    var markNums = {}; sheets.forEach(function (sh) { ((sh.desc && sh.desc.sizes) || []).forEach(function (q) { (markNums[q.id] = markNums[q.id] || {})[q.axis] = q.value; }); });
    var userN = function (id) { return Object.assign({}, markNums[id], opts.numbers && opts.numbers[id]); };
    var pl = plans[0], spacingUsed = false, sizeDefaulted = 0, plateT = false;
    secs.forEach(function (ss, si) {
      var rep = report.sheets[ss.name] = { bars: 0, plates: 0, runs: 0, stations: 0, left_out: 0 }, un = unitName(ss.factor), k = ss.factor;
      var al = MK.align(pl.desc, ss.desc, opts.alignTol !== undefined ? opts.alignTol : 0.001);
      if (!(al.map && al.map.zOf)) { gaps.push({ code: 'GAP:section_not_aligned', sheet: ss.name, detail: (al.errors || []).map(function (x) { return x.code; }).join(',') }); return; }
      var map = al.map, cut = String(ss.desc.cut || '').split(','), cutAxis = cut[0], cutM = Number(cut[1]) * k;
      if (!un || (cutAxis !== 'X' && cutAxis !== 'Y') || !isFinite(cutM)) { gaps.push({ code: 'GAP:section_cut', sheet: ss.name, detail: 'the cut ' + ss.desc.cut + ' or the unit is not usable' }); return; }
      var grids = cutAxis === 'X' ? pl.desc.gridsX : pl.desc.gridsY, gv = Object.keys(grids || {}).map(function (l) { return grids[l] * pl.factor; }).sort(function (a, b) { return a - b; });
      if (gv.length < 2) { gaps.push({ code: 'GAP:section_no_grid', sheet: ss.name, detail: 'the base plan needs grid lines along ' + cutAxis }); return; }
      var pitch = Infinity; for (var gi = 1; gi < gv.length; gi++) if (gv[gi] - gv[gi - 1] > 1e-6 && gv[gi] - gv[gi - 1] < pitch) pitch = gv[gi] - gv[gi - 1];
      var uS = userN('section-spacing'), spacing;
      if (uS.x > 0) spacing = Number(uS.x);
      else { var sv = String(DF.use('section.spacing')), mm = /^\s*(\d+(?:\.\d+)?)\s*x\s*column pitch\s*$/i.exec(sv); spacing = /^\s*column pitch\s*$/i.test(sv) ? pitch : mm ? Number(mm[1]) * pitch : (isFinite(Number(sv)) && Number(sv) > 0 ? Number(sv) : pitch); }
      spacingUsed = true;
      var stations = [], s0 = cutM - Math.floor((cutM - gv[0] + 1e-6) / spacing) * spacing;
      for (var st = s0; st <= gv[gv.length - 1] + 1e-6; st += spacing) stations.push(r6(st));
      var atCut = function (s) { return Math.abs(s - cutM) < 1e-4; };
      rep.stations = stations.length; rep.spacing = r6(spacing);
      var W = function (u, v, n) { return cutAxis === 'X' ? [n, u, v] : [u, n, v]; };
      // labels: member sizes (AxB) and the plate thickness; leaders: tip -> the label whose text the far end touches (nearest within 1 m)
      var texts = ss.dxf.entities.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== 'DXF2BIM-MARK'; }), leaders = ss.text ? H.parseLeaders(ss.text) : [], sizeLab = [], plateLab = [];
      texts.forEach(function (e) {
        var t = clean(e.text), p = e.startPoint || e.position || {}; if (typeof p.x !== 'number') return;
        var m1 = NOT_SECTION.test(t) ? null : SIZE_RE.exec(t), m2 = PLATE_RE.exec(t);
        if (m1) sizeLab.push({ text: t, size_m: 0, at: [p.x, p.y], tips: [] });
        if (m2) { var q = m2[1].indexOf('/') > 0 ? Number(m2[1].split('/')[0]) / Number(m2[1].split('/')[1]) : Number(m2[1]); plateLab.push({ text: t, t_m: q * (m2[2] ? 0.0254 : (un === 'in' ? 0.0254 : un === 'mm' ? 0.001 : 1)) }); }   // a quote mark means inches whatever the sheet unit
      });
      // unit: the size numbers are inches by their quote marks, whatever the sheet unit
      sizeLab.forEach(function (l) { var m = SIZE_RE.exec(l.text); l.size_m = Math.max(Number(m[1]), Number(m[2])) * 0.0254; });
      leaders.forEach(function (ld) { var en = ld.pts[ld.pts.length - 1], best = null, bd = 1.0 / k; sizeLab.forEach(function (c) { var d = Math.hypot(en[0] - c.at[0], en[1] - c.at[1]); if (d <= bd) { bd = d; best = c; } }); if (best) best.tips.push(ld.pts[0]); });
      var layers = function (kind) { return ss.desc.layers.filter(function (l) { return l.type === kind; }).map(function (l) { return l.layer; }); };
      var bars = ss.dxf.entities.filter(function (e) { return e.type === 'LINE' && layers('bar').indexOf(e.layer) >= 0 && e.vertices && e.vertices.length >= 2; });
      var minLen = 0.15 / k;   // shorter than 150 mm is a symbol mark, not a member (yellow default)
      var resolved = [], cand = [];
      bars.forEach(function (e) {
        var a = [e.vertices[0].x, e.vertices[0].y], b = [e.vertices[1].x, e.vertices[1].y]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < minLen) return;
        var id = 'body-bar-' + si + '-' + e.handle, tips = []; sizeLab.forEach(function (l) { l.tips.forEach(function (t) { if (segDist(t, a, b) <= 0.1 / k) tips.push(l); }); });
        var dist = []; tips.forEach(function (l) { if (!dist.some(function (d) { return Math.abs(d.size_m - l.size_m) < 1e-9; })) dist.push(l); });
        var u = userN(id), s = null, src = null;
        if (u.w > 0) { s = Number(u.w); src = 'user'; } else if (dist.length === 1) { s = dist[0].size_m; src = 'label'; } else if (dist.length > 1) { gaps.push({ code: 'GAP:bar_label_ambiguous', sheet: ss.name, kind: 'bar', handle: e.handle, detail: dist.map(function (d) { return d.text; }).join(' | ') }); rep.left_out++; return; }
        cand.push({ e: e, id: id, a: a, b: b, s: s, src: src, label: dist[0] ? dist[0].text : null }); if (s) resolved.push(s);
      });
      var freq = {}; resolved.forEach(function (v) { freq[r6(v)] = (freq[r6(v)] || 0) + 1; });
      var modal = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a] || Number(a) - Number(b); })[0];
      cand.forEach(function (c) {
        var s = c.s, src = c.src;
        if (s == null) { if (modal !== undefined) { s = Number(modal); src = 'default'; sizeDefaulted++; } else { gaps.push({ code: 'GAP:bar_no_size', sheet: ss.name, kind: 'bar', handle: c.e.handle, detail: 'no label points at this bar and none is stated (@SIZE=' + c.id + ',w,<m>)' }); rep.left_out++; return; } }
        var A = [map.toPlan(c.a[0]), map.zOf(c.a[1])], B = [map.toPlan(c.b[0]), map.zOf(c.b[1])], L = Math.hypot(B[0] - A[0], B[1] - A[1]), qu = -(B[1] - A[1]) / L, qv = (B[0] - A[0]) / L, h = s / 2;
        stations.forEach(function (n, ni) {
          var V = []; [A, B].forEach(function (p) { [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { V.push(W(p[0] + qu * h * c[0], p[1] + qv * h * c[0], n + h * c[1])); }); });
          var m = outward({ vertices: V.map(function (q) { return [r6(q[0]), r6(q[1]), r6(q[2])]; }), faces: BOX });
          var prov = atCut(n) ? 'derived' : 'assumed';
          els.push({ guid: c.id + '-S' + ni, class: P.ifcType('bar').ifc_class, storey: 'Level 1', vertices: m.vertices, faces: m.faces, handle: c.e.handle + '-S' + ni, layer: c.e.layer, sheet: ss.name, kind: 'bar', prov: prov,
            ifc: P.ifcType('bar', c.label || 'Section member', null), mark: null, z0: r6(Math.min(A[1], B[1]) - h), z1: r6(Math.max(A[1], B[1]) + h), height_source: 'section', size: { w: { number: r6(s), source: src }, station: n }, members: [c.e.handle] }); rep.bars++;
        });
      });
      // plates: closed outlines in the section plane, thickness from the sheet's one "Thickness Plate" label (a yellow default: the label does not point into the plate) or the user
      var pls = ss.dxf.entities.filter(function (e) { return e.type === 'LWPOLYLINE' && e.shape && (layers('plate').indexOf(e.layer) >= 0 || layers('bar').indexOf(e.layer) >= 0) && e.vertices && e.vertices.length >= 3; });   // a `bar` layer is the truss layer: its closed outlines are the gusset plates
      pls.forEach(function (e) {
        var id = 'body-plate-' + si + '-' + e.handle, u = userN(id), t = null, src = null;
        if (u.w > 0) { t = Number(u.w); src = 'user'; } else if (plateLab.length === 1) { t = plateLab[0].t_m; src = 'label'; plateT = true; }
        if (t == null) { gaps.push({ code: 'GAP:plate_no_thickness', sheet: ss.name, kind: 'plate', handle: e.handle, detail: (plateLab.length > 1 ? plateLab.length + ' thickness labels' : 'no thickness label') + ' (state it: @SIZE=' + id + ',w,<m>)' }); rep.left_out++; return; }
        var poly = e.vertices.map(function (v) { return [map.toPlan(v.x), map.zOf(v.y)]; }), pm = M.prism(poly, t / 2, t);   // prism over (u, v) with its thickness along n, centred on n = 0
        if (!pm) { gaps.push({ code: 'GAP:plate_degenerate', sheet: ss.name, kind: 'plate', handle: e.handle, detail: 'the outline could not be triangulated' }); rep.left_out++; return; }
        stations.forEach(function (n, ni) {
          var m = outward({ vertices: pm.vertices.map(function (q) { var w = W(q[0], q[1], n + q[2]); return [r6(w[0]), r6(w[1]), r6(w[2])]; }), faces: pm.faces.map(function (f) { return f.slice(); }) });
          els.push({ guid: id + '-S' + ni, class: P.ifcType('plate').ifc_class, storey: 'Level 1', vertices: m.vertices, faces: m.faces, handle: e.handle + '-S' + ni, layer: e.layer, sheet: ss.name, kind: 'plate', prov: atCut(n) ? 'derived' : 'assumed',
            ifc: P.ifcType('plate', plateLab[0] ? plateLab[0].text : 'Plate', null), mark: null, z0: r6(Math.min.apply(null, poly.map(function (q) { return q[1]; }))), z1: r6(Math.max.apply(null, poly.map(function (q) { return q[1]; }))), height_source: 'section', size: { t: { number: r6(t), source: src }, station: n }, members: [e.handle] }); rep.plates++;
        });
      });
      // runs (purlins): each outline on a `member` layer is a profile whose bounding rectangle runs from the first to the last station
      var runs = ss.dxf.entities.filter(function (e) { return (e.type === 'LWPOLYLINE') && (layers('member').indexOf(e.layer) >= 0 || (!e.shape && layers('bar').indexOf(e.layer) >= 0)) && e.vertices && e.vertices.length >= 3; });   // ... and its open outlines the purlin angle symbols
      runs.forEach(function (e) {
        var pts = e.vertices.map(function (v) { return [map.toPlan(v.x), map.zOf(v.y)]; }), u0 = Math.min.apply(null, pts.map(function (q) { return q[0]; })), u1 = Math.max.apply(null, pts.map(function (q) { return q[0]; })), v0 = Math.min.apply(null, pts.map(function (q) { return q[1]; })), v1 = Math.max.apply(null, pts.map(function (q) { return q[1]; })), n0 = stations[0], n1 = stations[stations.length - 1];
        var V = [[u0, v0, n0], [u1, v0, n0], [u1, v1, n0], [u0, v1, n0], [u0, v0, n1], [u1, v0, n1], [u1, v1, n1], [u0, v1, n1]].map(function (q) { var w = W(q[0], q[1], q[2]); return [r6(w[0]), r6(w[1]), r6(w[2])]; });
        var m = outward({ vertices: V, faces: BOX });
        els.push({ guid: 'body-run-' + si + '-' + e.handle, class: P.ifcType('member').ifc_class, storey: 'Level 1', vertices: m.vertices, faces: m.faces, handle: e.handle, layer: e.layer, sheet: ss.name, kind: 'member', prov: 'derived',
          ifc: P.ifcType('member', 'Section run', null), mark: null, z0: r6(v0), z1: r6(v1), height_source: 'section', size: { run: [r6(n0), r6(n1)] }, members: [e.handle] }); rep.runs++;
      });
    });
    if (sizeDefaulted) DEF.assume('section.bar.size', String(sizeDefaulted) + ' bars', sizeDefaulted + ' bars have no label pointing at them: they take the most common labelled size (square envelope)', ['most common labelled size']);
    if (plateT) DEF.assume('section.plate.thickness', 'the sheet\'s thickness-plate label', 'the plate thickness label does not point into a plate; its value is applied to every plate of the section', ['label value']);
    return { els: els, gaps: gaps, defaults: DEF.rows().concat(own ? DF.rows() : []), report: report };
  }
  return { buildSections: buildSections, SIZE_RE: SIZE_RE };
});
