// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2doors.js — door leaves from plan swing symbols (prompts/DXF2BIM_MODELLER_LANE.md §L16). Pure, Node + browser.
// The user types the PLAN layer that holds the door symbols `doorswing`. A door is drawn as a quarter-circle ARC (the swing) whose centre is the hinge and whose radius is the leaf width, plus the
// OPEN leaf as a line (often two parallel lines = the leaf thickness) from the hinge to the arc's far end. The CLOSED leaf is the other end of the arc: from the hinge, that way, one radius long.
// Drawn: position, width, hinge side, (often) leaf thickness. Not drawn: height (and the door's thickness when the leaf is one line): yellow defaults. A swing with no drawn open leaf is left out and
// listed (GAP:door_closed_unknown): which end of the arc is the closed leaf cannot be told.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ P: require('./dxf2prep.js') });
  else root.Dxf2Doors = factory({ P: root.Dxf2Prep });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var P = D.P, r6 = function (v) { return Number(Number(v).toFixed(6)); };
  var BOX = [[4, 5, 6], [4, 6, 7], [0, 2, 1], [0, 3, 2], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  function vol(m) { var v = 0; m.faces.forEach(function (f) { var a = m.vertices[f[0]], b = m.vertices[f[1]], c = m.vertices[f[2]]; v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; }); return v; }

  // sheets: readSheets output; bodies: the els already built (their lowest column base gives the floor); opts: { numbers, doorH, doorT, floorZ }
  function buildDoors(sheets, bodies, opts) {
    opts = opts || {}; var els = [], gaps = [], DEF = P.Defaults(), hUsed = false, tUsed = false;
    var markNums = {}; sheets.forEach(function (sh) { ((sh.desc && sh.desc.sizes) || []).forEach(function (q) { (markNums[q.id] = markNums[q.id] || {})[q.axis] = q.value; }); });
    var userN = function (id) { return Object.assign({}, markNums[id], opts.numbers && opts.numbers[id]); };
    var plans = sheets.filter(function (s) { return s.role === 'plan' && ((s.desc && s.desc.layers) || []).some(function (l) { return l.type === 'doorswing'; }); });
    if (!plans.length) return { els: els, gaps: gaps, defaults: [] };
    var cols = (bodies || []).filter(function (b) { return b.kind === 'column'; }), floorZ = opts.floorZ !== undefined ? opts.floorZ : (cols.length ? Math.min.apply(null, cols.map(function (b) { return b.z0; })) : 0);
    plans.forEach(function (ps, pi) {
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
        if (t == null) { t = opts.doorT > 0 ? opts.doorT : 0.04; tsrc = 'default'; tUsed = true; }
        var H = u.d > 0 ? Number(u.d) : (opts.doorH > 0 ? opts.doorH : 2.1), hsrc = u.d > 0 ? 'user' : 'default'; if (hsrc === 'default') hUsed = true;
        var hx = c.x * k, hy = c.y * k, w = R * k, nx = -uy, ny = ux, z0 = floorZ, z1 = floorZ + H, hh = t / 2;
        var V = [[hx + nx * hh, hy + ny * hh, z0], [hx + ux * w + nx * hh, hy + uy * w + ny * hh, z0], [hx + ux * w - nx * hh, hy + uy * w - ny * hh, z0], [hx - nx * hh, hy - ny * hh, z0],
          [hx + nx * hh, hy + ny * hh, z1], [hx + ux * w + nx * hh, hy + uy * w + ny * hh, z1], [hx + ux * w - nx * hh, hy + uy * w - ny * hh, z1], [hx - nx * hh, hy - ny * hh, z1]].map(function (q) { return [r6(q[0]), r6(q[1]), r6(q[2])]; });
        var m = { vertices: V, faces: BOX.map(function (f) { return f.slice(); }) }; if (vol(m) < 0) m.faces = m.faces.map(function (f) { return [f[0], f[2], f[1]]; });
        els.push({ guid: id, class: P.ifcType('doorswing').ifc_class, storey: 'Level 1', vertices: m.vertices, faces: m.faces, handle: a.handle, layer: a.layer, sheet: ps.name, kind: 'doorswing', prov: 'derived',
          ifc: P.ifcType('doorswing', 'Door ' + r6(w) + ' m', null), mark: null, z0: r6(z0), z1: r6(z1), height_source: 'default', size: { w: { number: r6(w), source: 'drawn' }, t: { number: r6(t), source: tsrc }, d: { number: r6(H), source: hsrc } }, members: [a.handle] });
      });
    });
    if (hUsed) DEF.assume('door.height', String(opts.doorH > 0 ? opts.doorH : 2.1), 'no door height is drawn; the width (the swing radius), the position and the hinge side are', ['2.0', '2.1', '2.4']);
    if (tUsed) DEF.assume('door.thickness', String(opts.doorT > 0 ? opts.doorT : 0.04), 'some door leaves are drawn as a single line (no thickness); those take this default (the double-line leaves state theirs)', ['0.04', '0.05']);
    return { els: els, gaps: gaps, defaults: DEF.rows() };
  }
  return { buildDoors: buildDoors };
});
