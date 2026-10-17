// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2bodies.js — typed bodies from drawn loops (prompts/DXF2BIM_MODELLER_LANE.md §L7.10). Pure, Node + browser.
// The user types layers with a BODY kind (@LAYER=<layer>,column|beam|footing|gradebeam|member|plate). A PLAN region gives the footprint, the ELEVATION
// regions of the same kind whose horizontal interval equals the plan interval give the z range (through the existing MK.align map). Nothing is guessed:
// no elevation counterpart -> GAP:body_no_elevation, different heights -> GAP:body_ambiguous_z; neither makes a body. Output is the importer's `els` form.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ MK: require('./dxf2bim/dxf2marks.js'), S: require('./dxf2bim/dxf2shell.js'), P: require('./dxf2prep.js') });
  else root.Dxf2Bodies = factory({ MK: root.Dxf2Marks, S: root.Dxf2Shell, P: root.Dxf2Prep });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var MK = D.MK, S = D.S, P = D.P;
  var KINDS = ['column', 'beam', 'footing', 'gradebeam', 'member', 'plate'];
  var r6 = function (v) { return Number(Number(v).toFixed(6)); };

  // §L7.13 labels: the drawing's own text that names a kind (exactly one distinct label per kind is applied, as a yellow default)
  var WORD = { column: /\bcolumn\b/i, beam: /\bbeam\b/i, footing: /\bfooting\b/i, gradebeam: /\bgrade\s*beam\b/i, member: /\bmember\b/i, plate: /\bplate\b/i };
  function cleanText(t) {   // strip MTEXT formatting codes: {\fArial|b0;text}, \P, \H1.0x; ...
    return String(t == null ? '' : t).replace(/\\[fFcCHhWwQqTtAa][^;]*;/g, '').replace(/\\[Pp]/g, ' ').replace(/[{}]/g, '').replace(/%%[cC]/g, '\u00d8').replace(/\s+/g, ' ').trim();
  }
  function labelsFor(sheets, kind) {
    var seen = {};
    sheets.forEach(function (sh) { (sh.dxf.entities || []).forEach(function (e) {
      if ((e.type !== 'TEXT' && e.type !== 'MTEXT') || e.layer === 'DXF2BIM-MARK') return;
      var t = cleanText(e.text); if (t && WORD[kind].test(t) && !(kind === 'beam' && WORD.gradebeam.test(t))) seen[t] = 1; }); });
    return Object.keys(seen).sort();
  }
  function bodyLayers(sheet, kind) { return ((sheet.desc && sheet.desc.layers) || []).filter(function (l) { return l.type === kind; }).map(function (l) { return l.layer; }); }

  // axis-aligned rectangular regions on the given layers: closed outlines as drawn, else loops of the loose lines (§L7.9, same tolerance)
  function regions(sheet, layers, tol) {
    var out = [], nonRect = 0, ents = sheet.dxf.entities;
    ents.forEach(function (e) {
      if (!(e.type === 'LWPOLYLINE' && e.shape) || layers.indexOf(e.layer) < 0 || !(e.vertices || []).length) return;
      var xs = e.vertices.map(function (v) { return v.x; }), ys = e.vertices.map(function (v) { return v.y; }),
        x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var rect = e.vertices.length === 4 && e.vertices.every(function (v) { return (Math.abs(v.x - x0) <= tol || Math.abs(v.x - x1) <= tol) && (Math.abs(v.y - y0) <= tol || Math.abs(v.y - y1) <= tol); });
      if (!rect) { nonRect++; return; }
      out.push({ x0: x0, y0: y0, x1: x1, y1: y1, handle: String(e.handle), members: [String(e.handle)], layer: e.layer });
    });
    var sy = P.synthRects(ents, tol, layers);   // layers that already hold closed outlines are skipped inside
    sy.entities.forEach(function (e) {
      var xs = e.vertices.map(function (v) { return v.x; }), ys = e.vertices.map(function (v) { return v.y; });
      out.push({ x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys), handle: e.handle, members: e.members, layer: e.layer });
    });
    return { list: out, nonRect: nonRect + sy.nonRect, mixed: sy.mixed };
  }

  // §L7.10 line pairs: two parallel VERTICAL lines on a typed layer, neighbours, closer than pairMax (drawing units) and drawn over the same height = one region, even with no top or
  // bottom line (CAD elevations draw a column as its two faces). Used only for the elevation side; each is reported as `pair`.
  function pairRegions(sheet, layers, tol, pairMax) {
    var V = [];
    sheet.dxf.entities.forEach(function (e) {
      if (e.type !== 'LINE' || layers.indexOf(e.layer) < 0 || !e.vertices || e.vertices.length < 2) return;
      var a = e.vertices[0], b = e.vertices[1];
      if (Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) > tol) V.push({ x: (a.x + b.x) / 2, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y), handle: String(e.handle), layer: e.layer });
    });
    V.sort(function (p, q) { return p.x - q.x || p.y0 - q.y0; });
    var out = [], used = {};
    for (var i = 0; i < V.length; i++) for (var j = i + 1; j < V.length; j++) {
      var d = V[j].x - V[i].x; if (d > pairMax) break; if (d <= tol) continue;
      if (Math.abs(V[i].y0 - V[j].y0) <= tol && Math.abs(V[i].y1 - V[j].y1) <= tol && !used[i] && !used[j]) {
        var between = V.some(function (q, k) { return k !== i && k !== j && q.x > V[i].x + tol && q.x < V[j].x - tol && q.y1 > V[i].y0 + tol && q.y0 < V[i].y1 - tol; });
        if (between) continue;
        used[i] = used[j] = 1; out.push({ x0: V[i].x, x1: V[j].x, y0: V[i].y0, y1: V[i].y1, handle: V[i].handle + '+' + V[j].handle, members: [V[i].handle, V[j].handle], layer: V[i].layer, pair: true });
        break;
      }
    }
    return out;
  }

  function buildBodies(sheets, opts) {
    opts = opts || {};
    var tolM = opts.tol !== undefined ? opts.tol : 0.003, alignTol = opts.alignTol !== undefined ? opts.alignTol : 0.001;
    var snap = opts.prepChoices && opts.prepChoices['loops.snap_tol'] !== undefined ? Number(opts.prepChoices['loops.snap_tol']) : P.SNAP_TOL_DEFAULT;
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    var elevs = sheets.filter(function (s) { return s.role === 'elev'; });
    var pairMaxM = opts.prepChoices && opts.prepChoices['bodies.pair_max_width'] !== undefined ? Number(opts.prepChoices['bodies.pair_max_width']) : 0.5, DEF = P.Defaults(), pairUsed = false;
    var els = [], gaps = [], report = { kinds: {}, snap_tol: snap, labels: {} }, seen = {}, names = {};
    if (!plans.length) { gaps.push({ code: 'GAP:body_no_plan', detail: 'no storey plan' }); return { els: els, gaps: gaps, report: report }; }
    var maps = elevs.map(function (es) { var al = MK.align(plans[0].desc, es.desc, alignTol); return { sheet: es, map: al.map && al.map.zOf ? al.map : null, why: al.map && al.map.zOf ? null : (al.errors || []).map(function (x) { return x.code; }).join(',') }; });
    maps.forEach(function (m) { if (!m.map) gaps.push({ code: 'GAP:body_elevation_not_aligned', sheet: m.sheet.name, detail: m.why }); });
    // elevation regions per kind, in plan metres / absolute z metres
    function elevRegions(kind) {
      var out = [];
      maps.forEach(function (m) {
        if (!m.map) return;
        var ly = bodyLayers(m.sheet, kind); if (!ly.length) return;
        var r = regions(m.sheet, ly, snap), k = m.map.k;
        var drawn = r.list;   // a line pair that is only the two sides of an already closed region is not a second region
        r.list = drawn.concat(pairRegions(m.sheet, ly, snap, pairMaxM / k).filter(function (pr) { return !drawn.some(function (d) { return Math.abs(d.x0 - pr.x0) <= snap && Math.abs(d.x1 - pr.x1) <= snap && Math.abs(d.y0 - pr.y0) <= snap && Math.abs(d.y1 - pr.y1) <= snap; }); }));
        r.list.forEach(function (g) {
          var h = [m.map.toPlan(g.x0), m.map.toPlan(g.x1)].sort(function (a, b) { return a - b; });
          out.push({ axis: m.map.axis, p0: r6(h[0]), p1: r6(h[1]), z0: r6(m.map.zOf(Math.min(g.y0, g.y1))), z1: r6(m.map.zOf(Math.max(g.y0, g.y1))), sheet: m.sheet.name, handle: g.handle, pair: !!g.pair });

        });
      });
      return out;
    }
    KINDS.forEach(function (kind) {
      var rep = { plan_regions: 0, bodies: 0, gaps: 0, nonRect: 0 }, ER = null;
      var chosenName = opts.prepChoices && opts.prepChoices[kind + '.type_name'];
      var lab = labelsFor(sheets, kind); report.labels[kind] = lab;
      if (lab.length === 1) names[kind] = chosenName !== undefined ? String(chosenName) : lab[0];
      plans.forEach(function (ps, pi) {
        var ly = bodyLayers(ps, kind); if (!ly.length) return;
        if (!ER) ER = elevRegions(kind);
        var r = regions(ps, ly, snap), k = ps.factor;
        rep.nonRect += r.nonRect; rep.plan_regions += r.list.length;
        r.list.forEach(function (g) {
          var x0 = r6(Math.min(g.x0, g.x1) * k), x1 = r6(Math.max(g.x0, g.x1) * k), y0 = r6(Math.min(g.y0, g.y1) * k), y1 = r6(Math.max(g.y0, g.y1) * k);
          var interval = function (e) { var I = e.axis === 'X' ? [x0, x1] : [y0, y1]; return { I: I, dc: Math.abs((e.p0 + e.p1) / 2 - (I[0] + I[1]) / 2), dw: Math.abs((e.p1 - e.p0) - (I[1] - I[0])), w: I[1] - I[0] }; };
          var exact = ER.filter(function (e) { var q = interval(e); return Math.abs(e.p0 - q.I[0]) <= tolM && Math.abs(e.p1 - q.I[1]) <= tolM; }), matchKind = 'interval', cands = exact;
          if (!cands.length) { cands = ER.filter(function (e) { var q = interval(e); return q.dc <= tolM && q.dw <= 0.5 * q.w; }); matchKind = 'centre'; }   // same centre line, a narrower/wider drawn face: reported, never silent
          var distinct = []; cands.forEach(function (c) { if (!distinct.some(function (d) { return Math.abs(d.z0 - c.z0) <= tolM && Math.abs(d.z1 - c.z1) <= tolM; })) distinct.push(c); });
          var base = { kind: kind, sheet: ps.name, handle: g.handle, layer: g.layer };
          if (!distinct.length) { gaps.push(Object.assign({ code: 'GAP:body_no_elevation', detail: 'no ' + kind + ' region of an elevation has this horizontal interval' }, base)); rep.gaps++; return; }
          if (distinct.length > 1) { gaps.push(Object.assign({ code: 'GAP:body_ambiguous_z', detail: distinct.map(function (d) { return d.z0 + '..' + d.z1 + ' (' + d.sheet + ' ' + d.handle + ')'; }).join(' | ') }, base)); rep.gaps++; return; }
          var z = distinct[0], pm = S.prismRect([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [], z.z0, z.z1);
          if (!pm) { gaps.push(Object.assign({ code: 'GAP:body_degenerate', detail: 'z range ' + z.z0 + '..' + z.z1 }, base)); rep.gaps++; return; }
          var guid = 'body-' + kind + '-' + pi + '-' + g.handle;
          if (seen[guid]) throw new Error('Dxf2Bodies: duplicate body id ' + guid);
          seen[guid] = 1;
          var st = plans.filter(function (p) { return p.level <= z.z0 + tolM; }).pop() || plans[0];
          els.push({ guid: guid, class: P.ifcType(kind).ifc_class, storey: 'Level ' + (plans.indexOf(st) + 1), vertices: pm.vertices, faces: pm.faces, handle: g.handle, layer: g.layer, sheet: ps.name,
            kind: kind, prov: 'drawn', ifc: P.ifcType(kind, names[kind] || null, null), members: g.members, z0: z.z0, z1: z.z1, height_source: 'elevation', match: matchKind, width_note: matchKind === 'centre' ? 'footprint from the plan, centre line matched the elevation' : null, elev_handles: cands.map(function (c) { return c.sheet + ':' + c.handle; }) });
          if (cands.some(function (c) { return c.pair; })) pairUsed = true;   // the default row exists only when a body was actually matched through a drawn line pair
          rep.bodies++;
        });
      });
      if (rep.plan_regions || rep.nonRect) report.kinds[kind] = rep;
    });
    if (pairUsed) DEF.assume('bodies.pair_max_width', pairMaxM, 'two parallel vertical lines closer than this are read as the two faces of one body in an elevation (metres); the drawing does not state it', [0.25, 0.5, 1]);
    if (opts.prepChoices && opts.prepChoices['bodies.pair_max_width'] !== undefined) DEF.override('bodies.pair_max_width', pairMaxM);
    KINDS.forEach(function (kind) {
      var used = els.some(function (e) { return e.kind === kind; }), lab = report.labels[kind] || [];
      if (used && lab.length === 1) {
        DEF.assume(kind + '.type_name', lab[0], 'the one label on the drawings that names this kind; the drawing does not link it to a particular body', [lab[0], '']);
        if (opts.prepChoices && opts.prepChoices[kind + '.type_name'] !== undefined) DEF.override(kind + '.type_name', String(opts.prepChoices[kind + '.type_name']));
      }
    });
    report.centre = els.filter(function (e) { return e.match === 'centre'; }).length;
    return { els: els, gaps: gaps, report: report, defaults: DEF.rows() };
  }

  return { buildBodies: buildBodies, KINDS: KINDS };
});
