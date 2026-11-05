// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2doortags.js — doors from their tag, the schedule row and the swing arc (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D109 P6). Pure, Node + browser.
// The row states width and height; the arc states where the hinge is and which way the leaf closes. A leaf is generated from those, tagged so. No row or no arc = a gap, never a box. Frames are not built.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ P: require('./dxf2prep.js'), BM: require('./dxf2beams.js') });
  else root.Dxf2DoorTags = factory({ P: root.Dxf2Prep, BM: root.Dxf2Beams });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var P = D.P, clean = D.BM.parts.clean, r6 = function (v) { return Number(Number(v).toFixed(6)); };
  var TAG = /^[A-Z0-9]+-\d+(?:-[A-Z])?$/, HEAD = /^DOOR NO\.?$/i, NUM = /^\d{3,4}$/, DOORLY = /DOOR/i, NOTLEAF = /IDEN|HDLN|FRAM/i;
  var textsOf = function (s) { return (s.dxf.entities || []).filter(function (e) { return e.type === 'TEXT' || e.type === 'MTEXT'; }).map(function (e) { var q = e.position || e.startPoint || {}; return { t: clean(e.text), x: q.x, y: q.y, layer: e.layer, handle: String(e.handle) }; }); };
  // a row's number is what stands under the DOOR NO. header (a finish code has the same form); the row height comes from that column's own spacing
  function scheduleRows(sheets) {
    var rows = {};
    sheets.forEach(function (sh) {
      if (sh.role !== 'drawing') return;
      var T = textsOf(sh), heads = T.filter(function (q) { return HEAD.test(q.t); }).sort(function (a, b) { return a.x - b.x; }), tags = T.filter(function (q) { return TAG.test(q.t); }); if (!heads.length) return;
      heads.forEach(function (h, i) {
        var right = heads[i + 1] ? heads[i + 1].x : Infinity, below = tags.filter(function (q) { return q.y < h.y && q.x >= h.x - (right === Infinity ? Infinity : 0) && q.x < right; }); if (!below.length) return;
        var x0 = below.reduce(function (m, q) { return Math.abs(q.x - h.x) < Math.abs(m - h.x) ? q.x : m; }, below[0].x), col = tags.filter(function (q) { return q.x === x0 || Math.round(q.x) === Math.round(x0); }).sort(function (a, b) { return b.y - a.y; });
        var pitch = col.slice(1).map(function (q, n) { return col[n].y - q.y; }).filter(function (g) { return g > 0; }).sort(function (a, b) { return a - b; })[0], tolY = pitch ? pitch / 2 : h.y - col[0].y;
        col.forEach(function (tag) {
          var nums = T.filter(function (q) { return Math.abs(q.y - tag.y) < tolY && q.x > tag.x && q.x < right && NUM.test(q.t); }).sort(function (a, b) { return a.x - b.x; }).map(function (q) { return Number(q.t); });
          if (nums.length >= 2) rows[tag.t] = { w: nums[0], h: nums[1], sheet: sh.name };
        });
      });
    });
    return rows;
  }
  function buildDoors(sheets, opts) {
    opts = opts || {};
    var els = [], gaps = [], report = { labels: 0, rows: 0, built_tags: 0, leaves: 0, no_row: 0, no_swing: 0, frames_not_built: 0 }, DF = opts.DF, setting = function (k, d) { return DF && DF.has(k) ? DF.get(k) : d; };
    var reachM = Number(setting('door.tag_reach', 3)); if (!(reachM > 0)) return { els: els, gaps: gaps, report: report };
    var rTol = Number((DF && DF.meta('door.tag_reach') || {}).radius_tol_m || 0), thick = Number(setting('door.thickness', 0.04)), rows = scheduleRows(sheets); report.rows = Object.keys(rows).length;
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; }), levels = plans.map(function (p) { return p.level; }).filter(function (l, i, a) { return a.indexOf(l) === i; });
    plans.forEach(function (ps, pi) {
      var ly = ((ps.desc && ps.desc.layers) || []).filter(function (l) { return l.type === 'doortag'; }).map(function (l) { return l.layer; }); if (!ly.length) return;
      var k = ps.factor, reach = reachM / k, used = {};
      var arcs = (ps.dxf.entities || []).filter(function (e) { return e.type === 'ARC' && DOORLY.test(e.layer) && !NOTLEAF.test(e.layer); }), lines = (ps.dxf.entities || []).filter(function (e) { return e.type === 'LINE' && DOORLY.test(e.layer) && !NOTLEAF.test(e.layer); });
      textsOf(ps).filter(function (q) { return ly.indexOf(q.layer) >= 0 && TAG.test(q.t); }).forEach(function (lab) {
        report.labels++;
        var row = rows[lab.t]; if (!row) { report.no_row++; gaps.push({ code: 'GAP:door_tag_no_row', kind: 'door', sheet: ps.name, handle: lab.handle, detail: lab.t + ': no row in a door schedule' }); return; }
        var near = arcs.filter(function (a) { return !used[a.handle] && Math.hypot(a.center.x - lab.x, a.center.y - lab.y) <= reach; }).sort(function (a, b) { return Math.hypot(a.center.x - lab.x, a.center.y - lab.y) - Math.hypot(b.center.x - lab.x, b.center.y - lab.y); });
        var wM = row.w * 0.001, fit = function (r) { return near.filter(function (a) { return Math.abs(a.radius * k - r) <= rTol; }); }, one = fit(wM), two = fit(wM / 2), pick = one.length ? [one[0]] : two.length >= 2 ? two.slice(0, 2) : null, leafW = one.length ? wM : wM / 2;
        if (!pick) { report.no_swing++; gaps.push({ code: 'GAP:door_tag_no_swing', kind: 'door', sheet: ps.name, handle: lab.handle, detail: lab.t + ': no swing arc of ' + row.w + ' mm or two of half that within ' + reachM + ' m' }); return; }
        report.built_tags++; report.frames_not_built++;
        pick.forEach(function (a, ai) {
          used[a.handle] = 1;
          var end = function (ang) { return { x: a.center.x + a.radius * Math.cos(ang), y: a.center.y + a.radius * Math.sin(ang) }; }, e0 = end(a.startAngle), e1 = end(a.endAngle);
          var hasLeaf = function (q) { return lines.some(function (l) { var p = l.vertices[0], o = l.vertices[1], at = function (v, w) { return Math.hypot(v.x - w.x, v.y - w.y); }, tol = rTol / k; return (at(p, a.center) <= tol && at(o, q) <= tol) || (at(o, a.center) <= tol && at(p, q) <= tol); }); };
          var closed = hasLeaf(e0) && !hasLeaf(e1) ? a.endAngle : a.startAngle, ux = Math.cos(closed), uy = Math.sin(closed), nx = -uy, ny = ux, hx = a.center.x * k, hy = a.center.y * k;
          var ring = [[hx, hy], [hx + ux * leafW, hy + uy * leafW], [hx + ux * leafW + nx * thick, hy + uy * leafW + ny * thick], [hx + nx * thick, hy + ny * thick]].map(function (c) { return [r6(c[0]), r6(c[1])]; });
          var z0 = ps.level, z1 = r6(ps.level + row.h * 0.001), mesh = P.Solid.box(ring.map(function (c) { return [c[0], c[1], z0]; }).concat(ring.map(function (c) { return [c[0], c[1], z1]; })));
          if (DF) { if (DF.has('door.tag_reach')) DF.use('door.tag_reach'); if (DF.has('door.thickness')) DF.use('door.thickness'); }
          report.leaves++;
          els.push({ guid: 'body-doortag-' + pi + '-' + lab.handle + '-' + ai, class: 'IfcDoor', storey: 'Level ' + (levels.indexOf(ps.level) + 1), vertices: mesh.vertices, faces: mesh.faces, handle: lab.handle, layer: lab.layer, sheet: ps.name, kind: 'door', mark: lab.t, members: [String(a.handle)], z0: z0, z1: z1,
            size: { w: { value: r6(leafW), source: 'schedule' + (pick.length > 1 ? ' (half of a pair)' : '') }, h: { value: row.h * 0.001, source: 'schedule' }, t: { value: thick, source: 'default' }, swing_radius: r6(a.radius * k) }, height_source: 'schedule', prov: 'generated', ifc: P.ifcType('doortag', lab.t, null) });
        });
      });
    });
    return { els: els, gaps: gaps, report: report };
  }
  return { buildDoors: buildDoors, scheduleRows: scheduleRows };
});
