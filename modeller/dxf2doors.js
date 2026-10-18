// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2doors.js — door leaves from plan swing symbols (prompts/DXF2BIM_MODELLER_LANE.md §L16). Pure, Node + browser.
// The user types the PLAN layer that holds the door symbols `doorswing`. A door is drawn as a quarter-circle ARC (the swing) whose centre is the hinge and whose radius is the leaf width, plus the
// OPEN leaf as a line (often two parallel lines = the leaf thickness) from the hinge to the arc's far end. The CLOSED leaf is the other end of the arc: from the hinge, that way, one radius long.
// Drawn: position, width, hinge side, (often) leaf thickness. Not drawn: height (and the door's thickness when the leaf is one line): yellow defaults. A swing with no drawn open leaf is left out and
// listed (GAP:door_closed_unknown): which end of the arc is the closed leaf cannot be told.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ P: require('./dxf2prep.js'), DF: require('./dxf2defaults.js'), MK: require('./dxf2bim/dxf2marks.js') });
  else root.Dxf2Doors = factory({ P: root.Dxf2Prep, DF: root.Dxf2Defaults, MK: root.Dxf2Marks });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var P = D.P, DFM = D.DF, MK = D.MK, r6 = function (v) { return Number(Number(v).toFixed(6)); };

  // §L25 door frames drawn on an ELEVATION: the closed/loose line work of a layer typed `elevdoor` is clustered (touching boxes), mapped through the aligned grids to a plan interval [p0,p1] (m, along the face)
  // and a z interval (m). The drawing then states the door height; the default is used only when no frame matches.
  function elevFrames(sheets, plan, gaps) {
    var out = [];
    sheets.filter(function (s) { return s.role === 'elev' && ((s.desc && s.desc.layers) || []).some(function (l) { return l.type === 'elevdoor'; }); }).forEach(function (es) {
      var al = MK.align(plan.desc, es.desc, 0.001);
      if (!(al.map && al.map.zOf)) { gaps.push({ code: 'GAP:door_elevation_not_aligned', sheet: es.name, detail: (al.errors || []).map(function (x) { return x.code; }).join(',') }); return; }
      var map = al.map, layers = es.desc.layers.filter(function (l) { return l.type === 'elevdoor'; }).map(function (l) { return l.layer; }), items = [];
      es.dxf.entities.forEach(function (e) { if (layers.indexOf(e.layer) < 0 || !(e.vertices || []).length) return; var pts = e.type === 'LINE' ? e.vertices.slice(0, 2) : e.vertices;
        var hs = pts.map(function (q) { return q.x; }), ys = pts.map(function (q) { return q.y; }); items.push([Math.min.apply(null, hs), Math.min.apply(null, ys), Math.max.apply(null, hs), Math.max.apply(null, ys), e.handle]); });
      var T = 0.02 / es.factor, par = items.map(function (_, i) { return i; }), find = function (i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
      for (var i = 0; i < items.length; i++) for (var j = i + 1; j < items.length; j++) { var a = items[i], b = items[j]; if (a[0] <= b[2] + T && b[0] <= a[2] + T && a[1] <= b[3] + T && b[1] <= a[3] + T) par[find(i)] = find(j); }
      var g = {}; items.forEach(function (it, i) { (g[find(i)] = g[find(i)] || []).push(it); });
      Object.keys(g).forEach(function (kk) { var c = g[kk], h0 = Math.min.apply(null, c.map(function (x) { return x[0]; })), h1 = Math.max.apply(null, c.map(function (x) { return x[2]; })), y0 = Math.min.apply(null, c.map(function (x) { return x[1]; })), y1 = Math.max.apply(null, c.map(function (x) { return x[3]; }));
        var pp = [map.toPlan(h0), map.toPlan(h1)].sort(function (x, y) { return x - y; });
        out.push({ face: es.face, axis: map.axis, p0: r6(pp[0]), p1: r6(pp[1]), z0: r6(map.zOf(y0)), z1: r6(map.zOf(y1)), sheet: es.name, handles: c.map(function (x) { return x[4]; }) }); });
    });
    return out;
  }

  // sheets: readSheets output; bodies: the els already built (their lowest column base gives the floor); opts: { numbers, doorH, doorT, floorZ }
  function buildDoors(sheets, bodies, opts) {
    opts = opts || {}; var els = [], gaps = [], own = !opts.DF, DF = opts.DF || DFM.create(opts.ref, sheets, opts.choices);
    var markNums = {}; sheets.forEach(function (sh) { ((sh.desc && sh.desc.sizes) || []).forEach(function (q) { (markNums[q.id] = markNums[q.id] || {})[q.axis] = q.value; }); });
    var userN = function (id) { return Object.assign({}, markNums[id], opts.numbers && opts.numbers[id]); };
    var plans = sheets.filter(function (s) { return s.role === 'plan' && ((s.desc && s.desc.layers) || []).some(function (l) { return l.type === 'doorswing'; }); });
    if (!plans.length) return { els: els, gaps: gaps, defaults: [] };
    var cols = (bodies || []).filter(function (b) { return b.kind === 'column'; }), floorZ = opts.floorZ !== undefined ? opts.floorZ : (cols.length ? Math.min.apply(null, cols.map(function (b) { return b.z0; })) : 0);
    var allCols = cols, env = allCols.length && allCols.every(function (b) { return b.vertices; }) ? allCols.reduce(function (e, b) { (b.vertices || []).forEach(function (v) { e[0] = Math.min(e[0], v[0]); e[1] = Math.min(e[1], v[1]); e[2] = Math.max(e[2], v[0]); e[3] = Math.max(e[3], v[1]); }); return e; }, [Infinity, Infinity, -Infinity, -Infinity]) : null;
    plans.forEach(function (ps, pi) {
      var frames = elevFrames(sheets, ps, gaps);
      var k = ps.factor, layers = ps.desc.layers.filter(function (l) { return l.type === 'doorswing'; }).map(function (l) { return l.layer; });
      var arcs = ps.dxf.entities.filter(function (e) { return e.type === 'ARC' && layers.indexOf(e.layer) >= 0 && e.center && e.radius > 0; });
      var lines = ps.dxf.entities.filter(function (e) { return e.type === 'LINE' && layers.indexOf(e.layer) >= 0 && e.vertices && e.vertices.length >= 2; });
      arcs.forEach(function (a) {
        var c = a.center, R = a.radius, sw = (((a.endAngle - a.startAngle) * 180 / Math.PI) % 360 + 360) % 360, id = 'body-door-' + pi + '-' + a.handle, base = { kind: 'doorswing', sheet: ps.name, handle: a.handle, layer: a.layer };
        if (sw < 60 || sw > 190) return;                                                                              // not a swing (a full circle, a short arc)
        // the open leaf: line(s) from the hinge to a point R away; the far end identifies WHICH end of the arc is the open position
        var leaf = lines.map(function (l) { var p = l.vertices, h = [0, 1].filter(function (i) { return Math.hypot(p[i].x - c.x, p[i].y - c.y) <= 0.05 * R + 2; })[0];
          // (the leaf line starts at the hinge; a leaf drawn as two lines starts 1-2 units either side)
          if (h === undefined) return null; var o = p[1 - h]; return Math.abs(Math.hypot(o.x - c.x, o.y - c.y) - R) <= 0.06 * R ? { far: o, l: l } : null; }).filter(Boolean);
        if (!leaf.length) { gaps.push(Object.assign({ code: 'GAP:door_closed_unknown', detail: 'a ' + r6(R * k) + ' m swing with no drawn open leaf: which end of the arc is the closed leaf cannot be told' }, base)); return; }
        var e0 = [c.x + R * Math.cos(a.startAngle), c.y + R * Math.sin(a.startAngle)], e1 = [c.x + R * Math.cos(a.endAngle), c.y + R * Math.sin(a.endAngle)], far = leaf[0].far;
        var openIs0 = Math.hypot(far.x - e0[0], far.y - e0[1]) < Math.hypot(far.x - e1[0], far.y - e1[1]), closed = openIs0 ? e1 : e0, dx = closed[0] - c.x, dy = closed[1] - c.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
        // leaf thickness: two parallel leaf lines are the two faces (drawn); else the default
        var t = null, tsrc = null, u = userN(id);
        if (u.w > 0) { t = Number(u.w); tsrc = 'user'; }
        else if (leaf.length === 2) { var a0 = leaf[0].l.vertices, a1 = leaf[1].l.vertices, sp = Math.abs((a1[0].x - a0[0].x) * ux + (a1[0].y - a0[0].y) * uy);   /* the open leaf's two faces are apart ALONG the closed-leaf direction */ if (sp > 1e-6 && sp < 0.2 * R) { t = sp * k; tsrc = 'drawn'; } }
        if (t == null) { t = DF.use('door.thickness'); tsrc = DF.source('door.thickness'); }
        var hx = c.x * k, hy = c.y * k, w = R * k, nx = -uy, ny = ux, hh = t / 2, H, hsrc, z0 = floorZ, hseen = 'default';
        // the drawn door height: an elevation frame over this leaf's interval along the wall run, on the face nearest to the door (the building envelope = the drawn columns)
        var runX = Math.abs(ux) >= Math.abs(uy), ra = runX ? 0 : 1, i0 = Math.min(ra ? hy : hx, ra ? hy + uy * w : hx + ux * w), i1 = Math.max(ra ? hy : hx, ra ? hy + uy * w : hx + ux * w), perp = runX ? hy : hx, cand = [];
        frames.forEach(function (f) { if (f.axis !== (runX ? 'X' : 'Y')) return; var ov = Math.min(i1, f.p1) - Math.max(i0, f.p0); if (ov >= 0.8 * (i1 - i0)) cand.push(f); });
        if (cand.length > 1 && env) { var pl = function (f) { var side = f.face === 'minY' ? env[1] : f.face === 'maxY' ? env[3] : f.face === 'minX' ? env[0] : env[2]; return Math.abs(perp - side); }, dm = Math.min.apply(null, cand.map(pl)); cand = cand.filter(function (f) { return pl(f) - dm < 1e-6; }); }
        var hit = cand.length ? cand.filter(function (f) { return Math.abs(f.z1 - f.z0 - (cand[0].z1 - cand[0].z0)) < 1e-6 && Math.abs(f.z0 - cand[0].z0) < 1e-6; }) : [];
        if (u.d > 0) { H = Number(u.d); hsrc = 'user'; }
        else if (cand.length && hit.length === cand.length) { H = cand[0].z1 - cand[0].z0; z0 = cand[0].z0; hsrc = 'drawn'; hseen = 'elevation'; }
        else { if (cand.length) gaps.push(Object.assign({ code: 'GAP:door_height_conflict', detail: 'elevation frames disagree on this door: ' + cand.map(function (f) { return f.sheet + ' ' + r6(f.z0) + '..' + r6(f.z1); }).join('; ') }, base)); H = DF.use('door.height'); hsrc = DF.source('door.height'); }
        var z1 = z0 + H;
        var V = [[hx + nx * hh, hy + ny * hh, z0], [hx + ux * w + nx * hh, hy + uy * w + ny * hh, z0], [hx + ux * w - nx * hh, hy + uy * w - ny * hh, z0], [hx - nx * hh, hy - ny * hh, z0],
          [hx + nx * hh, hy + ny * hh, z1], [hx + ux * w + nx * hh, hy + uy * w + ny * hh, z1], [hx + ux * w - nx * hh, hy + uy * w - ny * hh, z1], [hx - nx * hh, hy - ny * hh, z1]].map(function (q) { return [r6(q[0]), r6(q[1]), r6(q[2])]; });
        var m = P.Solid.box(V);
        els.push({ guid: id, class: P.ifcType('doorswing').ifc_class, storey: 'Level 1', vertices: m.vertices, faces: m.faces, handle: a.handle, layer: a.layer, sheet: ps.name, kind: 'doorswing', prov: 'derived',
          ifc: P.ifcType('doorswing', 'Door ' + r6(w) + ' m', null), mark: null, z0: r6(z0), z1: r6(z1), height_source: hseen, size: { w: { number: r6(w), source: 'drawn' }, t: { number: r6(t), source: tsrc }, d: { number: r6(H), source: hsrc } }, members: [a.handle] });
      });
    });
    return { els: els, gaps: gaps, defaults: own ? DF.rows() : [] };
  }
  return { buildDoors: buildDoors };
});
