// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2panels.js — wall panels from ELEVATION hatch loops (prompts/DXF2BIM_MODELLER_LANE.md §L11.2). Pure, Node + browser.
// The user types a hatch layer of an elevation as `panel` (@LAYER=<layer>,panel). Every closed loop of those hatches is a face polygon (along the face, z through the aligned map);
// the body is that polygon extruded by a THICKNESS, centred on the face plane. Nothing is invented:
//   thickness  user @SIZE=<panel id>,w,<m>  >  a thickness label (`10" Brick Wall`) whose LEADER TIP lies inside the panel  >  the label of a panel of the same sheet whose z range overlaps
//              (yellow default, listed)  >  else GAP:panel_no_thickness and no body
//   plane      the outermost grid line on the face's side of the base plan, walls centred on it (yellow default: the drawing does not say flush or centred)
//   holes      a loop inside another loop of its hatch would be a hole: not supported yet -> GAP:panel_hole_unsupported (no body invented)
// The mesh is the existing ear-clipped prism (dxf2mesh), axes permuted onto the face; winding is checked by volume.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ MK: require('./dxf2bim/dxf2marks.js'), PR: require('./dxf2pair.js'), H: require('./dxf2hatch.js'), M: require('./dxf2bim/dxf2mesh.js'), P: require('./dxf2prep.js') });
  else root.Dxf2Panels = factory({ MK: root.Dxf2Marks, PR: root.Dxf2Pair, H: root.Dxf2Hatch, M: root.Dxf2Mesh, P: root.Dxf2Prep });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var MK = D.MK, PR = D.PR, H = D.H, M = D.M, P = D.P;
  var r6 = function (v) { return Number(Number(v).toFixed(6)); };
  var FACE = { minX: { axis: 'Y', coord: 'X', pick: 'min' }, maxX: { axis: 'Y', coord: 'X', pick: 'max' }, minY: { axis: 'X', coord: 'Y', pick: 'min' }, maxY: { axis: 'X', coord: 'Y', pick: 'max' } };
  var NET_RE = /zigzag|mesh|net\b|wire/i;
  var LABEL = /^([^A-Za-z]+?)\s*(?:[A-Za-z]+\s+)?wall\b/i;   // "10\" Brick Wall", "5\" Support Wall, H-24\"": a thickness, one descriptor word, "wall"

  function clean(t) { return String(t == null ? '' : t).replace(/\\[fFcCHhWwQqTtAa][^;]*;/g, '').replace(/\\[Pp]/g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim(); }
  function unitName(k) { return Math.abs(k - 0.0254) < 1e-9 ? 'in' : Math.abs(k - 0.001) < 1e-12 ? 'mm' : Math.abs(k - 1) < 1e-12 ? 'm' : null; }
  function dropCollinear(pts) {
    var out = pts.slice(), ch = true;
    while (ch && out.length > 3) { ch = false; for (var i = 0; i < out.length; i++) { var a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length], cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); if (Math.abs(cr) < 1e-9 * Math.max(1, Math.abs(b[0]), Math.abs(b[1]))) { out.splice(i, 1); ch = true; break; } } }
    return out;
  }
  function volume(m) {
    var v = 0; m.faces.forEach(function (f) { var a = m.vertices[f[0]], b = m.vertices[f[1]], c = m.vertices[f[2]]; v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; });
    return v;
  }

  // sheets: readSheets output (role 'elev' sheets carry .hatches from the importer, .text); opts: { numbers, prepChoices }
  function buildPanels(sheets, opts) {
    opts = opts || {}; var els = [], gaps = [], DEF = P.Defaults(), report = { sheets: {}, panels: 0 };
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    var markNums = {}; sheets.forEach(function (sh) { ((sh.desc && sh.desc.sizes) || []).forEach(function (q) { (markNums[q.id] = markNums[q.id] || {})[q.axis] = q.value; }); });
    var userN = function (id) { return Object.assign({}, markNums[id], opts.numbers && opts.numbers[id]); };
    var elevs = sheets.filter(function (s) { return s.role === 'elev' && ((s.desc && s.desc.layers) || []).some(function (l) { return l.type === 'panel' || l.type === 'fan' || l.type === 'net'; }); });
    if (!elevs.length) return { els: els, gaps: gaps, defaults: [], report: report };
    if (!plans.length) { gaps.push({ code: 'GAP:panel_no_plan', detail: 'a plan is needed for the grid' }); return { els: els, gaps: gaps, defaults: [], report: report }; }
    var planUsed = false, tUsed = false, inherited = [], fansUsed = false, netsUsed = false;
    elevs.forEach(function (es, ei) {
      var rep = report.sheets[es.name] = { hatches: 0, loops: 0, panels: 0, left_out: 0 };
      var F = FACE[es.face]; if (!F) { gaps.push({ code: 'GAP:panel_face', sheet: es.name, detail: 'elevation face ' + es.face + ' is not minX/maxX/minY/maxY' }); return; }
      var al = MK.align(plans[0].desc, es.desc, opts.alignTol !== undefined ? opts.alignTol : 0.001);
      if (!(al.map && al.map.zOf)) { gaps.push({ code: 'GAP:panel_elevation_not_aligned', sheet: es.name, detail: (al.errors || []).map(function (x) { return x.code; }).join(',') }); return; }
      var map = al.map, k = es.factor, un = unitName(k);
      if (map.axis !== F.axis) { gaps.push({ code: 'GAP:panel_axis', sheet: es.name, detail: 'face ' + es.face + ' runs along ' + F.axis + ' but the horizontal axis is ' + map.axis }); return; }
      var gr = F.coord === 'X' ? plans[0].desc.gridsX : plans[0].desc.gridsY, gv = Object.keys(gr || {}).map(function (l) { return gr[l] * plans[0].factor; });
      if (!gv.length) { gaps.push({ code: 'GAP:panel_no_grid', sheet: es.name, detail: 'the base plan has no grid on ' + F.coord }); return; }
      var plane = F.pick === 'min' ? Math.min.apply(null, gv) : Math.max.apply(null, gv); planUsed = true;
      var layers = es.desc.layers.filter(function (l) { return l.type === 'panel'; }).map(function (l) { return l.layer; });
      var hs = (es.hatches && es.hatches.hatches) || []; (es.hatches && es.hatches.gaps || []).forEach(function (g) { gaps.push(Object.assign({ sheet: es.name }, g)); });
      // loops of the typed layers, in drawing units, with their polygons in plan metres / absolute z
      var loops = [];
      hs.filter(function (h) { return layers.indexOf(h.layer) >= 0; }).forEach(function (h) {
        rep.hatches++;
        var closed = h.loops.filter(function (l) { return l.closed; });
        h.loops.filter(function (l) { return !l.closed; }).forEach(function () { rep.left_out++; });
        closed.forEach(function (l, li) {
          rep.loops++;
          var inner = closed.some(function (o, oi) { return oi !== li && Math.abs(H.area(o.pts)) > Math.abs(H.area(l.pts)) && H.inPoly(l.pts[0], o.pts); });
          loops.push({ h: h, li: li, n: closed.length, pts: l.pts, hole: inner, id: 'body-panel-' + ei + '-' + h.handle + (closed.length > 1 ? '-L' + li : '') });
        });
      });
      // thickness labels with a leader whose label end sits at the text: tip -> the label's thickness
      var unit = un, labs = [];
      if (unit && es.text) {
        var leaders = H.parseLeaders(es.text), texts = es.dxf.entities.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== 'DXF2BIM-MARK'; });
        var cands = [];
        texts.forEach(function (e) {
          var t = clean(e.text), m = LABEL.exec(t); if (!m) return;
          var num = PR.parseNumber(m[1].trim(), unit); if (num == null) return;
          var p = e.startPoint || e.position || {}; if (typeof p.x !== 'number') return;
          cands.push({ text: t, thickness_m: num * k, at: [p.x, p.y], tips: [] });
        });
        // each leader belongs to the NEAREST thickness label (its far end is drawn next to the text: 21 in off on the shed), within 1 m; a leader with no label in reach is not a thickness leader
        leaders.forEach(function (ld) {
          var en = ld.pts[ld.pts.length - 1], best = null, bd = 1.0 / k;
          cands.forEach(function (c) { var d = Math.hypot(en[0] - c.at[0], en[1] - c.at[1]); if (d <= bd) { bd = d; best = c; } });
          if (best) best.tips.push(ld.pts[0]);
        });
        labs = cands;
      }
      loops.forEach(function (lp) {
        var base = { kind: 'panel', sheet: es.name, handle: lp.h.handle, layer: lp.h.layer };
        if (lp.hole) { gaps.push(Object.assign({ code: 'GAP:panel_hole_unsupported', detail: 'a loop inside another loop of the same hatch (a hole) is not extruded yet' }, base)); rep.left_out++; return; }
        var poly = dropCollinear(lp.pts).map(function (q) { return [map.toPlan(q[0]), map.zOf(q[1])]; });
        var zs = poly.map(function (q) { return q[1]; }), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
        var mine = labs.filter(function (lb) { return lb.tips.some(function (t) { return H.inPoly(t, lp.pts); }); });
        lp.z0 = z0; lp.z1 = z1; lp.label = mine.length === 1 ? mine[0] : null; lp.poly = poly; lp.base = base; lp.ambiguous = mine.length > 1;
      });
      loops.filter(function (lp) { return lp.poly; }).forEach(function (lp) {
        var u = userN(lp.id), t = null, src = null, text = lp.label ? lp.label.text : null;
        if (u.w != null && isFinite(Number(u.w)) && Number(u.w) > 0) { t = Number(u.w); src = 'user'; }
        else if (lp.label) { t = lp.label.thickness_m; src = 'label'; }
        else if (!lp.ambiguous) {
          var cand = loops.filter(function (o) { return o.poly && o.label && Math.min(o.z1, lp.z1) - Math.max(o.z0, lp.z0) >= 0.5 * Math.min(o.z1 - o.z0, lp.z1 - lp.z0); });
          var dist = []; cand.forEach(function (o) { if (!dist.some(function (d) { return Math.abs(d.t - o.label.thickness_m) < 1e-9; })) dist.push({ t: o.label.thickness_m, text: o.label.text }); });
          if (dist.length === 1) { t = dist[0].t; src = 'inherited'; text = dist[0].text; inherited.push(lp.id); tUsed = true; }
          else if (dist.length > 1) { gaps.push(Object.assign({ code: 'GAP:panel_thickness_ambiguous', detail: dist.map(function (d) { return d.text; }).join(' | ') + ' both reach this height band' }, lp.base)); rep.left_out++; return; }
        } else { gaps.push(Object.assign({ code: 'GAP:panel_label_ambiguous', detail: 'two thickness labels point into this panel' }, lp.base)); rep.left_out++; return; }
        if (t == null) { gaps.push(Object.assign({ code: 'GAP:panel_no_thickness', detail: 'no thickness label points into this panel and none overlaps it in height (state it: @SIZE=' + lp.id + ',w,<m>)' }, lp.base)); rep.left_out++; return; }
        // §L10 the number rule on the label: a stated height in the same label ("5\" Support Wall, H-24\"") against the drawn panel height; a conflict is surfaced (advisory), the drawn geometry stands
        var hm = lp.label && /\bH\s*-\s*(\d+(?:\.\d+)?)\s*"/i.exec(lp.label.text);
        if (hm) { var hs = Number(hm[1]) * 0.0254, hd = lp.z1 - lp.z0, rel = Math.abs(hd - hs) / hs; if (rel > 0.06) gaps.push(Object.assign({ code: 'GAP:panel_label_height', detail: 'the label "' + lp.label.text + '" states a height of ' + r6(hs) + ' m; the drawn panel is ' + r6(hd) + ' m high (ratio ' + r6(hd / hs) + '): the drawing is built, the number is for you to resolve' }, lp.base)); }
        // mesh: the prism extrudes the (along, z) polygon over the plane coordinate; permute onto the face
        var m = M.prism(lp.poly, plane + t / 2, t);
        if (!m) { gaps.push(Object.assign({ code: 'GAP:panel_degenerate', detail: 'the outline could not be triangulated' }, lp.base)); rep.left_out++; return; }
        var V, Fc;
        if (F.coord === 'X') { V = m.vertices.map(function (q) { return [r6(q[2]), r6(q[0]), r6(q[1])]; }); Fc = m.faces; }                // (u, v, w) -> (X=w, Y=u, Z=v): even permutation
        else { V = m.vertices.map(function (q) { return [r6(q[0]), r6(q[2]), r6(q[1])]; }); Fc = m.faces.map(function (f) { return [f[0], f[2], f[1]]; }); }   // (X=u, Y=w, Z=v): odd, flip the winding
        var el = { vertices: V, faces: Fc };
        if (volume(el) < 0) { el.faces = el.faces.map(function (f) { return [f[0], f[2], f[1]]; }); }
        els.push({ guid: lp.id, class: P.ifcType('panel').ifc_class, storey: 'Level 1', vertices: el.vertices, faces: el.faces, handle: lp.h.handle + (lp.n > 1 ? '-L' + lp.li : ''), layer: lp.h.layer, sheet: es.name,
          kind: 'panel', prov: src === 'inherited' ? 'derived' : 'drawn', ifc: P.ifcType('panel', text, null), mark: null, z0: r6(lp.z0), z1: r6(lp.z1), height_source: 'elevation',
          size: { t: { number: r6(t), source: src, text: text }, plane: r6(plane), pattern: lp.h.pattern }, members: [lp.h.handle] });
        rep.panels++; report.panels++;
      });
      // §L11.4 nets: the mesh-pattern hatches (ZIGZAG, MESH, NET, WIRE) of a layer typed `net`: a thin cladding sheet over the opening above a low panel (a farm's ventilation net). The pattern is the evidence of
      // kind; the thickness is not drawn (yellow default 5 mm; @SIZE w states it). Two hatch objects with the same boundary (the drawing stores the zigzag twice) are ONE net.
      var netL = es.desc.layers.filter(function (l) { return l.type === 'net'; }).map(function (l) { return l.layer; });
      if (netL.length) {
        var seenNet = {};
        hs.filter(function (h) { return netL.indexOf(h.layer) >= 0 && NET_RE.test(h.pattern || ''); }).forEach(function (h) {
          h.loops.filter(function (l) { return l.closed; }).forEach(function (l, li, all) {
            var key = l.pts.map(function (q) { return Math.round(q[0] * 1000) + ',' + Math.round(q[1] * 1000); }).sort().join(';'); if (seenNet[key]) { report.nets_dup = (report.nets_dup || 0) + 1; return; } seenNet[key] = 1;
            var id = 'body-net-' + ei + '-' + h.handle + (all.length > 1 ? '-L' + li : ''), u = userN(id), t = u.w > 0 ? Number(u.w) : (opts.netT > 0 ? opts.netT : 0.005), poly = dropCollinear(l.pts).map(function (q) { return [map.toPlan(q[0]), map.zOf(q[1])]; });
            var m = M.prism(poly, plane + t / 2, t); if (!m) { gaps.push({ code: 'GAP:net_degenerate', sheet: es.name, kind: 'net', handle: h.handle, detail: 'the outline could not be triangulated' }); return; }
            var V3, F3;
            if (F.coord === 'X') { V3 = m.vertices.map(function (q2) { return [r6(q2[2]), r6(q2[0]), r6(q2[1])]; }); F3 = m.faces; }
            else { V3 = m.vertices.map(function (q2) { return [r6(q2[0]), r6(q2[2]), r6(q2[1])]; }); F3 = m.faces.map(function (f) { return [f[0], f[2], f[1]]; }); }
            var nm = { vertices: V3, faces: F3 }; if (volume(nm) < 0) nm.faces = nm.faces.map(function (f) { return [f[0], f[2], f[1]]; });
            var zz = poly.map(function (q) { return q[1]; });
            els.push({ guid: id, class: P.ifcType('net').ifc_class, storey: 'Level 1', vertices: nm.vertices, faces: nm.faces, handle: h.handle + (all.length > 1 ? '-L' + li : ''), layer: h.layer, sheet: es.name, kind: 'net', prov: 'derived',
              ifc: P.ifcType('net', 'Netting', null), mark: null, z0: r6(Math.min.apply(null, zz)), z1: r6(Math.max.apply(null, zz)), height_source: 'elevation', size: { t: { number: r6(t), source: u.w > 0 ? 'user' : 'default' }, plane: r6(plane), pattern: h.pattern }, members: [h.handle] });
            report.nets = (report.nets || 0) + 1; netsUsed = true;
          });
        });
      }
      // §L11.3 fans: concentric CIRCLEs of a layer typed `fan` on this elevation (the outer circle is the housing, the inner the hub): a disc of that diameter on the wall plane, depth a yellow default
      var fanL = es.desc.layers.filter(function (l) { return l.type === 'fan'; }).map(function (l) { return l.layer; });
      if (fanL.length && un) {
        var groups = [];
        es.dxf.entities.forEach(function (c) {
          if (c.type !== 'CIRCLE' || fanL.indexOf(c.layer) < 0 || !c.center || !(c.radius > 0)) return;
          var g = groups.filter(function (q) { return Math.hypot(q.cx - c.center.x, q.cy - c.center.y) <= 0.001 / k; })[0];
          if (!g) groups.push({ cx: c.center.x, cy: c.center.y, r: c.radius, h: c.handle, n: 1 }); else { g.n++; if (c.radius > g.r) { g.r = c.radius; g.h = c.handle; } }
        });
        groups.forEach(function (g) {
          var id = 'body-fan-' + ei + '-' + g.h, u = userN(id), depth = u.w > 0 ? Number(u.w) : (opts.fanDepth > 0 ? opts.fanDepth : 0.3), R = g.r * k, cu = map.toPlan(g.cx), cv = map.zOf(g.cy), poly = [];
          for (var q = 0; q < 24; q++) poly.push([cu + R * Math.cos(2 * Math.PI * q / 24), cv + R * Math.sin(2 * Math.PI * q / 24)]);
          var m = M.prism(poly, plane + depth / 2, depth); if (!m) { gaps.push({ code: 'GAP:fan_degenerate', sheet: es.name, kind: 'fan', handle: g.h, detail: 'the circle could not be extruded' }); return; }
          var V2, F2;
          if (F.coord === 'X') { V2 = m.vertices.map(function (q2) { return [r6(q2[2]), r6(q2[0]), r6(q2[1])]; }); F2 = m.faces; }
          else { V2 = m.vertices.map(function (q2) { return [r6(q2[0]), r6(q2[2]), r6(q2[1])]; }); F2 = m.faces.map(function (f) { return [f[0], f[2], f[1]]; }); }
          var fm = { vertices: V2, faces: F2 }; if (volume(fm) < 0) fm.faces = fm.faces.map(function (f) { return [f[0], f[2], f[1]]; });
          els.push({ guid: id, class: P.ifcType('fan').ifc_class, storey: 'Level 1', vertices: fm.vertices, faces: fm.faces, handle: g.h, layer: es.desc.layers.filter(function (l) { return l.type === 'fan'; })[0].layer, sheet: es.name, kind: 'fan', prov: 'derived',
            ifc: P.ifcType('fan', 'Axial fan', null), mark: null, z0: r6(cv - R), z1: r6(cv + R), height_source: 'elevation', size: { d: { number: r6(2 * R), source: 'drawn' }, depth: { number: r6(depth), source: u.w > 0 ? 'user' : 'default' }, plane: r6(plane), rings: g.n }, members: [g.h] });
          report.fans = (report.fans || 0) + 1; fansUsed = true;
        });
      }
    });
    if (planUsed) DEF.assume('panel.plane', 'end grid line, centred', 'a wall panel is drawn on the elevation, which does not say whether it is flush with the grid line or centred on it; the outermost grid line on the face\'s side is used and the thickness is centred on it', ['end grid line, centred']);
    if (tUsed) DEF.assume('panel.thickness_inherited', String(inherited.length), 'panels with no thickness label of their own take the label of the panel that overlaps them in height on the same elevation (' + inherited.length + ' panels)', [String(inherited.length)]);
    if (netsUsed) DEF.assume('net.thickness', String(opts.netT > 0 ? opts.netT : 0.005), 'the netting thickness is not drawn; the area (the hatch boundary) is. Cost is by area', ['0.002', '0.005', '0.01']);
    if (fansUsed) DEF.assume('fan.depth', String(opts.fanDepth > 0 ? opts.fanDepth : 0.3), 'the fan housing depth is not drawn; the diameter is (the outer circle). Position: centred on the wall plane', ['0.2', '0.3', '0.4']);
    return { els: els, gaps: gaps, defaults: DEF.rows(), report: report };
  }
  return { buildPanels: buildPanels, LABEL: LABEL };
});
