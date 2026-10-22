// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2bodies.js — typed bodies from drawn loops (prompts/DXF2BIM_MODELLER_LANE.md §L7.10). Pure, Node + browser.
// The user types layers with a BODY kind (@LAYER=<layer>,column|beam|footing|gradebeam|member|plate). A PLAN region gives the footprint, the ELEVATION
// regions of the same kind whose horizontal interval equals the plan interval give the z range (through the existing MK.align map). Nothing is guessed:
// no elevation counterpart -> GAP:body_no_elevation, different heights -> GAP:body_ambiguous_z; neither makes a body. Output is the importer's `els` form.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ MK: require('./dxf2bim/dxf2marks.js'), S: require('./dxf2bim/dxf2shell.js'), P: require('./dxf2prep.js'), PR: require('./dxf2pair.js') });
  else root.Dxf2Bodies = factory({ MK: root.Dxf2Marks, S: root.Dxf2Shell, P: root.Dxf2Prep, PR: root.Dxf2Pair });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var MK = D.MK, S = D.S, P = D.P, PR = D.PR;
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
      var t = cleanText(e.text); if (!t || /(plan|elevation|section)\s*$/i.test(t)) return;   // a sheet TITLE ("Beam Lay out Plan") never names a kind
      if (WORD[kind].test(t) && !(kind === 'beam' && WORD.gradebeam.test(t))) seen[t] = 1; }); });
    return Object.keys(seen).sort();
  }
  // an ELEVATION layer typed with ANY body kind is body line work (one CAD layer usually holds the column faces AND the beam band); which regions are read from it depends on the PLAN kind being matched
  // (column/footing/plate: closed outlines, loops, vertical face pairs; beam/gradebeam/member: closed outlines + horizontal bands), so the elevation typing only says "this layer is body line work"
  // the FRAME kinds (column, beam, gradebeam, member) share elevation line work; footing and plate use only a layer typed with their OWN kind (a column-typed elevation layer must never give a footing a height by centre line)
  var FRAME = ['column', 'beam', 'gradebeam', 'member'];
  function anyBodyLayers(sheet, kind) { return ((sheet.desc && sheet.desc.layers) || []).filter(function (l) { return l.type === kind || (FRAME.indexOf(kind) >= 0 && FRAME.indexOf(l.type) >= 0); }).map(function (l) { return l.layer; }); }
  function bodyLayers(sheet, kind) { return ((sheet.desc && sheet.desc.layers) || []).filter(function (l) { return l.type === kind; }).map(function (l) { return l.layer; }); }

  // axis-aligned rectangular regions on the given layers: closed outlines as drawn, else loops of the loose lines (§L7.9, same tolerance)
  function regions(sheet, layers, tol, noLoops) {   // noLoops: band kinds read their loose lines as BANDS (§L9), not as the faces the crossing lines happen to enclose
    var out = [], nonRect = 0, ents = sheet.dxf.entities;
    ents.forEach(function (e) {
      if (!(e.type === 'LWPOLYLINE' && e.shape) || layers.indexOf(e.layer) < 0 || !(e.vertices || []).length) return;
      var xs = e.vertices.map(function (v) { return v.x; }), ys = e.vertices.map(function (v) { return v.y; }),
        x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var rect = e.vertices.length === 4 && e.vertices.every(function (v) { return (Math.abs(v.x - x0) <= tol || Math.abs(v.x - x1) <= tol) && (Math.abs(v.y - y0) <= tol || Math.abs(v.y - y1) <= tol); });
      if (!rect) { nonRect++; return; }
      out.push({ x0: x0, y0: y0, x1: x1, y1: y1, handle: String(e.handle), members: [String(e.handle)], layer: e.layer });
    });
    var sy = noLoops ? { entities: [], nonRect: 0, mixed: 0 } : P.synthRects(ents, tol, layers);   // layers that already hold closed outlines are skipped inside
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
      if (Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) > tol) V.push({ x: (a.x + b.x) / 2, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y), handles: [String(e.handle)], layer: e.layer });
    });
    // CAD draws one face as several collinear pieces (split at a datum or a wall): merge touching/overlapping pieces on the same x into one line first
    // CAD coordinates carry float noise (1e-11): sort by the QUANTISED position, then by extent, or pieces of one line interleave and the merge swallows the wrong ones
    var qz = function (c) { return Math.round(c / tol); };
    V.sort(function (p, q) { return qz(p.x) - qz(q.x) || p.y0 - q.y0; });
    var M = [];
    V.forEach(function (v) { var l = M[M.length - 1]; if (l && qz(l.x) === qz(v.x) && v.y0 <= l.y1 + tol) { l.y0 = Math.min(l.y0, v.y0); l.y1 = Math.max(l.y1, v.y1); l.handles = l.handles.concat(v.handles); } else M.push({ x: v.x, y0: v.y0, y1: v.y1, handles: v.handles.slice(), layer: v.layer }); });
    V = M;
    var out = [], used = {};
    for (var i = 0; i < V.length; i++) for (var j = i + 1; j < V.length; j++) {
      var d = V[j].x - V[i].x; if (d > pairMax) break; if (d <= tol) continue;
      // the two faces bound a body only where BOTH exist: the region height is the overlap of their extents (>= 50% of the longer line), so a face drawn longer (down to a footing line) does not stretch the body
      var o0 = Math.max(V[i].y0, V[j].y0), o1 = Math.min(V[i].y1, V[j].y1), longer = Math.max(V[i].y1 - V[i].y0, V[j].y1 - V[j].y0);
      if (!(o1 - o0 > 0) || (o1 - o0) < 0.5 * longer || used[i] || used[j]) continue;
      var between = V.some(function (q, k) { return k !== i && k !== j && q.x > V[i].x + tol && q.x < V[j].x - tol && q.y1 > o0 + tol && q.y0 < o1 - tol; });
      if (between) continue;
      used[i] = used[j] = 1;
      out.push({ x0: V[i].x, x1: V[j].x, y0: o0, y1: o1, handle: V[i].handles[0] + '+' + V[j].handles[0], members: V[i].handles.concat(V[j].handles), layer: V[i].layer, pair: true });
      break;
    }
    return out;
  }

  // §L9 BAND regions (beams, grade beams, members): two neighbouring parallel axis-aligned LINEs closer than widthMax bound a band over the OVERLAP of their extents. One long edge + the PIECES of the
  // other edge give one region per piece (the span between column faces: no bridging); the shorter edge must lie within the longer one (tol) or overlap it by >= 50% of the longer (the column rule).
  // horizontal=true: lines along x (the band spans x, its width is in y); false: lines along y.
  var BAND_KINDS = ['beam', 'gradebeam', 'member'];
  function bandRegions(sheet, layers, tol, widthMax, horizontal) {
    var V = [];
    sheet.dxf.entities.forEach(function (e) {
      if (e.type !== 'LINE' || layers.indexOf(e.layer) < 0 || !e.vertices || e.vertices.length < 2) return;
      var a = e.vertices[0], b = e.vertices[1], along = horizontal ? Math.abs(a.y - b.y) <= tol && Math.abs(a.x - b.x) > tol : Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) > tol;
      if (!along) return;
      V.push(horizontal ? { c: (a.y + b.y) / 2, a0: Math.min(a.x, b.x), a1: Math.max(a.x, b.x), h: String(e.handle) } : { c: (a.x + b.x) / 2, a0: Math.min(a.y, b.y), a1: Math.max(a.y, b.y), h: String(e.handle) });
    });
    var qz = function (c) { return Math.round(c / tol); };   // quantised position: float noise must not reorder the lines
    V.sort(function (p, q) { return qz(p.c) - qz(q.c) || p.a0 - q.a0; });
    // NO merging of touching collinear pieces here (unlike column faces): a column's top line touches the beam soffit pieces on both sides and would fuse them into one line across the column (the beam would be bridged);
    // every drawn line stays itself, a span is the OVERLAP of the long edge with one piece of the other edge
    var M = V.map(function (v) { return { c: v.c, a0: v.a0, a1: v.a1, hs: [v.h] }; });
    var out = [];
    for (var i = 0; i < M.length; i++) for (var j = i + 1; j < M.length; j++) {
      var dd = M[j].c - M[i].c; if (dd > widthMax) break; if (dd <= tol) continue;
      var o0 = Math.max(M[i].a0, M[j].a0), o1 = Math.min(M[i].a1, M[j].a1), L1 = M[i].a1 - M[i].a0, L2 = M[j].a1 - M[j].a0, longer = Math.max(L1, L2), shorter = Math.min(L1, L2);
      if (!(o1 - o0 > tol) || !((o1 - o0) >= shorter - tol || (o1 - o0) >= 0.5 * longer)) continue;
      var between = M.some(function (q, k) { return k !== i && k !== j && q.c > M[i].c + tol && q.c < M[j].c - tol && q.a1 > o0 + tol && q.a0 < o1 - tol; });
      if (between) continue;
      out.push(horizontal ? { x0: o0, x1: o1, y0: M[i].c, y1: M[j].c, handle: M[i].hs[0] + '+' + M[j].hs[0], members: M[i].hs.concat(M[j].hs), layer: sheet.dxf.entities.filter(function (e) { return String(e.handle) === M[i].hs[0]; })[0].layer, band: true, width: dd }
        : { x0: M[i].c, x1: M[j].c, y0: o0, y1: o1, handle: M[i].hs[0] + '+' + M[j].hs[0], members: M[i].hs.concat(M[j].hs), layer: sheet.dxf.entities.filter(function (e) { return String(e.handle) === M[i].hs[0]; })[0].layer, band: true, width: dd });
    }
    return out;
  }
  var sameRegion = function (a, b, tol) { return Math.abs(a.x0 - b.x0) <= tol && Math.abs(a.x1 - b.x1) <= tol && Math.abs(a.y0 - b.y0) <= tol && Math.abs(a.y1 - b.y1) <= tol; };
  // §L9.4 the type mark (B-1, F-2, ...) written next to a band region: the nearest such label within maxD (drawing units); two DIFFERENT marks about equally near name nothing
  function nearMark(sheet, g, maxD) {
    var cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2, c = [];
    sheet.dxf.entities.forEach(function (e) {
      if ((e.type !== 'TEXT' && e.type !== 'MTEXT') || e.layer === 'DXF2BIM-MARK') return;
      var t = cleanText(e.text); if (!/^[A-Z]{1,3}-\d+$/.test(t)) return;
      var p = e.startPoint || e.position || {}; if (typeof p.x !== 'number') return;
      var d = Math.hypot(p.x - cx, p.y - cy); if (d <= maxD) c.push({ t: t, d: d });
    });
    c.sort(function (a, b) { return a.d - b.d; });
    if (!c.length) return null;
    var other = c.filter(function (x) { return x.t !== c[0].t; })[0];
    return other && other.d < 1.25 * c[0].d ? null : c[0].t;
  }

  // §L7.14 the ONE plan-to-plan alignment (bodies here; the Modeller canvas and its Arrange view, D34): the translation (metres) that puts plan ps on the base plan by their
  // shared GRIDX / GRIDY labels; every shared label must agree within alignTol, else ok=false with the reasons
  function planOffset(base, ps, alignTol) {
    var kb = base.factor, k = ps.factor, res = { ok: true, x: 0, y: 0, why: [] };
    [['gridsX', 'x'], ['gridsY', 'y']].forEach(function (a) {
      var Bg = base.desc[a[0]] || {}, Tg = ps.desc[a[0]] || {}, labs = Object.keys(Tg).filter(function (l) { return l in Bg; });
      if (!labs.length) { res.ok = false; res.why.push('no shared ' + a[1].toUpperCase() + ' grid label'); return; }
      var o = labs.map(function (l) { return Bg[l] * kb - Tg[l] * k; }), w = Math.max.apply(null, o.map(function (v) { return Math.abs(v - o[0]); }));
      if (w > alignTol) { res.ok = false; res.why.push(a[1].toUpperCase() + ' grid labels disagree by ' + w.toFixed(4) + ' m'); return; }
      res[a[1]] = o[0];
    });
    return res;
  }

  function buildBodies(sheets, opts) {
    opts = opts || {};
    var tolM = opts.tol !== undefined ? opts.tol : 0.003, alignTol = opts.alignTol !== undefined ? opts.alignTol : 0.001;
    var snap = opts.prepChoices && opts.prepChoices['loops.snap_tol'] !== undefined ? Number(opts.prepChoices['loops.snap_tol']) : P.SNAP_TOL_DEFAULT;
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    var elevs = sheets.filter(function (s) { return s.role === 'elev'; });
    var pairMaxM = opts.prepChoices && opts.prepChoices['bodies.pair_max_width'] !== undefined ? Number(opts.prepChoices['bodies.pair_max_width']) : 0.5, DEF = P.Defaults(), pairUsed = false;
    var levels = plans.map(function (p) { return p.level; }).filter(function (l, i, arr) { return arr.indexOf(l) === i; }).sort(function (x, y) { return x - y; });
    var els = [], gaps = [], report = { kinds: {}, snap_tol: snap, labels: {} }, seen = {}, names = {};
    if (!plans.length) { gaps.push({ code: 'GAP:body_no_plan', detail: 'no storey plan' }); return { els: els, gaps: gaps, report: report }; }
    var maps = elevs.map(function (es) { var al = MK.align(plans[0].desc, es.desc, alignTol); return { sheet: es, map: al.map && al.map.zOf ? al.map : null, why: al.map && al.map.zOf ? null : (al.errors || []).map(function (x) { return x.code; }).join(',') }; });
    // §L7.14 every plan after the base is aligned to it by shared grid labels (translation only); a plan that cannot be aligned contributes nothing, loudly
    function offsetOf(ps) { return planOffset(plans[0], ps, alignTol); }
    var pofs = plans.map(function (ps, pi) { return pi === 0 ? { ok: true, x: 0, y: 0, why: [] } : offsetOf(ps); });
    var seenFp = {};
    // §L7.14 the z range the USER states for a kind (@BODYZ on any sheet); two sheets stating different ranges -> conflict, nothing built for that kind from it
    var stated = {};
    sheets.forEach(function (sh) { ((sh.desc && sh.desc.bodyz) || []).forEach(function (b) { var o = stated[b.kind]; if (!o) stated[b.kind] = { z0: b.z0, z1: b.z1 }; else if (o.z0 !== b.z0 || o.z1 !== b.z1) o.conflict = true; }); });
    maps.forEach(function (m) { if (!m.map) gaps.push({ code: 'GAP:body_elevation_not_aligned', sheet: m.sheet.name, detail: m.why }); });
    // elevation regions per kind, in plan metres / absolute z metres
    function elevRegions(kind) {
      var out = [];
      maps.forEach(function (m) {
        if (!m.map) return;
        var ly = anyBodyLayers(m.sheet, kind); if (!ly.length) return;
        var r = regions(m.sheet, ly, snap, BAND_KINDS.indexOf(kind) >= 0), k = m.map.k;
        var drawn = r.list;   // a line pair that is only the two sides of an already closed region is not a second region
        if (BAND_KINDS.indexOf(kind) >= 0) drawn = drawn.concat(bandRegions(m.sheet, ly, snap, pairMaxM / k, true).filter(function (bd) { return !drawn.some(function (d) { return sameRegion(d, bd, snap); }); }));   // §L9: elevation bands (top line + soffit pieces)
        var pairs = BAND_KINDS.indexOf(kind) >= 0 ? [] : pairRegions(m.sheet, ly, snap, pairMaxM / k);
        r.list = drawn.concat(pairs.filter(function (pr) { return !drawn.some(function (d) { return sameRegion(d, pr, snap); }); }));
        r.list.forEach(function (g) {
          var h = [m.map.toPlan(g.x0), m.map.toPlan(g.x1)].sort(function (a, b) { return a - b; });
          out.push({ axis: m.map.axis, p0: r6(h[0]), p1: r6(h[1]), z0: r6(m.map.zOf(Math.min(g.y0, g.y1))), z1: r6(m.map.zOf(Math.max(g.y0, g.y1))), sheet: m.sheet.name, handle: g.handle, pair: !!g.pair });

        });
      });
      return out;
    }
    // plan regions of a kind on a sheet (drawn regions, band pieces, @EXCLUDE applied), memoised: the size pass and the body pass read the same list
    var prCache = {};
    function planR(ps, ly, kind) {
      var key = ps.name + '|' + kind; if (prCache[key]) return prCache[key];
      var k = ps.factor, r = regions(ps, ly, snap, BAND_KINDS.indexOf(kind) >= 0);
      if (BAND_KINDS.indexOf(kind) >= 0) { const drawn0 = r.list.slice(); [true, false].forEach(function (hz) { bandRegions(ps, ly, snap, pairMaxM / k, hz).forEach(function (bd) { if (!drawn0.some(function (d) { return sameRegion(d, bd, snap); })) r.list.push(bd); }); }); }
      // §L9.3 the user's @EXCLUDE rectangles (drawing units, this sheet): a region wholly inside one is skipped and counted, never silently
      var exr = (ps.desc && ps.desc.excludes) || [], nEx = 0;
      if (exr.length) r.list = r.list.filter(function (g) { var inside = exr.some(function (e) { return Math.min(g.x0, g.x1) >= e[0] - snap && Math.max(g.x0, g.x1) <= e[2] + snap && Math.min(g.y0, g.y1) >= e[1] - snap && Math.max(g.y0, g.y1) <= e[3] + snap; }); if (inside) nEx++; return !inside; });
      return (prCache[key] = { r: r, nEx: nEx });
    }
    // §L10.6 stated sizes: legend rows (set-level) + instance marks (kind-aware) + other sheets' marks by translation vote -> one pair per body side; user numbers (opts.numbers[guid]) win.
    // Returns, per plan index, an array parallel to that plan's region list: {x:{...}, y:{...}} in sheet units, or null when the sheet's unit is not in/mm/m.
    var legend = {}; if (PR) sheets.forEach(function (sh) { var u = unitName(sh.factor); if (u && sh.dxf) Object.assign(legend, PR.legendOf(sh.dxf.entities, u)); });
    function unitName(k) { return Math.abs(k - 0.0254) < 1e-9 ? 'in' : Math.abs(k - 0.001) < 1e-12 ? 'mm' : Math.abs(k - 1) < 1e-12 ? 'm' : null; }
    function sizesForKind(kind) {
      var out = {}; if (!PR || !Object.keys(legend).length || BAND_KINDS.indexOf(kind) >= 0) return out;   // a band kind's legend row is its CROSS-SECTION (B-1 = 12" x 10": width x depth), not its plan length: not applied here (see the lane doc)
      var lab = [], src = null;   // per plan: rects, own labelling
      plans.forEach(function (ps, pi) {
        var ly = bodyLayers(ps, kind), u = unitName(ps.factor); if (!ly.length || !u || !pofs[pi].ok) return;
        var list = planR(ps, ly, kind).r.list, rects = list.map(function (g, i) { return { id: pi + ':' + i, sheet: ps.name, kind: kind, pts: [[g.x0, g.y0], [g.x1, g.y0], [g.x1, g.y1], [g.x0, g.y1]] }; });
        var mk = PR.markPoints(ps.dxf.entities, legend), lr = mk.length ? PR.labelRects(rects, mk, legend) : null;
        lab.push({ pi: pi, ps: ps, u: u, rects: rects, lr: lr });
        if (lr && !src && lr.lengths.some(function (l) { return l.label != null; })) src = { rects: rects, marks: lr.marks };
      });
      lab.forEach(function (L) {
        var lr = L.lr, via = null;
        if (!lr && src) { var inh = PR.inheritLabels(L.rects, src.rects, src.marks, legend, 0.01 / (L.ps.factor || 1)); lr = inh; via = inh.match; }
        if (!lr) return;
        var dims = PR.dimsOf(L.ps.dxf.entities, L.ps.name), res = PR.pair(lr.lengths, dims, { unit: L.u });
        var byId = {}; res.pairs.forEach(function (pp) { byId[pp.id] = pp; });
        out[L.pi] = L.rects.map(function (rc, i) {
          // sides 0 and 2 run along x (first edge), 1 and 3 along y: the pair of opposite sides must agree; the x extent is the pair of side 0
          var px = byId[rc.id + ':0'], py = byId[rc.id + ':1'], px2 = byId[rc.id + ':2'], py2 = byId[rc.id + ':3'];
          return { x: px, y: py, x2: px2, y2: py2, via: via && via.matched ? via.matched[rc.id] || null : null, rows: res.rows };
        });
      });
      return out;
    }
    // the user's numbers: @SIZE=<body id>,<x|y|w|d>,<metres> markings on any sheet, then opts.numbers[guid] (the caller's edits win over the file's)
    var markNums = {}; sheets.forEach(function (sh) { ((sh.desc && sh.desc.sizes) || []).forEach(function (q) { (markNums[q.id] = markNums[q.id] || {})[q.axis] = q.value; }); });
    function userN(guid) { return Object.assign({}, markNums[guid], opts.numbers && opts.numbers[guid]); }
    // the number in force drives the extent (§L10): a user number (opts.numbers[guid] = {x,y} metres) beats a label/dimension number; an axis with no number keeps the drawn extent.
    // Alignment is best effort: centred on the drawn centre (ALIGN:floating), reported on the body. Metres in, metres out.
    var sizeRows = [];
    function sizeOf(si, guid, x0, x1, y0, y1, k) {
      var u = userN(guid), ax = {}, out = { x0: x0, x1: x1, y0: y0, y1: y1, info: null };
      [['x', x0, x1, si && si.x, si && si.x2], ['y', y0, y1, si && si.y, si && si.y2]].forEach(function (a) {
        var drawn = a[2] - a[1], n = null, src = null, cls = null, pair = a[3];
        if (u[a[0]] != null) { n = Number(u[a[0]]); src = 'user'; cls = Math.abs(n - drawn) <= 0.0006 ? 'PAIRED_AGREE' : 'USER'; }
        else if (pair && pair.number != null) { n = pair.number * k; src = pair.source; cls = pair.class; }
        if (n != null && isFinite(n) && n > 0) {
          ax[a[0]] = { drawn: r6(drawn), number: r6(n), class: cls, source: src, rule: pair ? pair.rule : 'user' };
          if (Math.abs(n - drawn) > 1e-9) { var c = (a[1] + a[2]) / 2; if (a[0] === 'x') { out.x0 = r6(c - n / 2); out.x1 = r6(c + n / 2); } else { out.y0 = r6(c - n / 2); out.y1 = r6(c + n / 2); } ax[a[0]].align = 'ALIGN:floating'; }
          if (cls === 'PAIRED_CONFLICT' && src !== 'user') sizeRows.push({ guid: guid, axis: a[0], drawn: r6(drawn), number: r6(n), source: src, ratio: pair.ratio });
        } else if (si && pair) ax[a[0]] = { drawn: r6(drawn), number: null, class: pair.class, source: null };
      });
      if (ax.x || ax.y) out.info = ax;
      return out;
    }
    // §L10.7 a band kind's legend row is its CROSS-SECTION (B-1 = 12" x 10": width x depth). WIDTH is the extent across the span in plan, DEPTH the z extent. The legend gives no order, so the
    // assignment that fits the drawing best is taken. Anchoring (best effort, a yellow default): the plan width is centred on the drawn band; the depth keeps the SOFFIT (z0) because a beam bears
    // on its supports from below, so a deeper beam grows upward. A user number (opts.numbers[guid].w / .d, metres) beats the label.
    function crossSection(kind, mark, guid, x0, x1, y0, y1, z, k) {
      var u = userN(guid), un = unitName(k), nums = mark && legend[mark] && un && PR ? legend[mark].nums.slice(0, 2).map(function (v) { return v * k; }) : null;
      if (!nums && u.w == null && u.d == null) return null;
      var spanX = (x1 - x0) >= (y1 - y0), dW = spanX ? (y1 - y0) : (x1 - x0), dD = z.z1 - z.z0, w = null, d = null, ws = null, ds = null, info = {};
      if (nums) { var keep = Math.abs(dW - nums[0]) + Math.abs(dD - nums[1]), swap = Math.abs(dW - nums[1]) + Math.abs(dD - nums[0]); w = keep <= swap + 1e-9 ? nums[0] : nums[1]; d = keep <= swap + 1e-9 ? nums[1] : nums[0]; ws = ds = 'label'; }
      if (u.w != null) { w = Number(u.w); ws = 'user'; } if (u.d != null) { d = Number(u.d); ds = 'user'; }
      var out = { x0: x0, x1: x1, y0: y0, y1: y1, info: null }, zz = { z0: z.z0, z1: z.z1, sheet: z.sheet, handle: z.handle, pair: z.pair };
      function one(ax, drawn, n, src) {
        if (n == null || !isFinite(n) || n <= 0) return null;
        var pr = src === 'user' ? { class: Math.abs(n - drawn) <= 0.0006 ? 'PAIRED_AGREE' : 'USER', rule: 'user' } : PR.pair([{ id: 'x', a: [0, 0], b: [drawn / k, 0], label: n / k }], [], { unit: un }).pairs[0];
        var cls = pr.class, row = { drawn: r6(drawn), number: r6(n), class: cls, source: src, rule: pr.rule || 'single' };
        if (Math.abs(n - drawn) > 1e-9) row.align = 'ALIGN:floating';
        if (cls === 'PAIRED_CONFLICT' && src !== 'user') sizeRows.push({ guid: guid, axis: ax, drawn: r6(drawn), number: r6(n), source: src, ratio: pr.ratio });
        return row;
      }
      info.w = one('w', dW, w, ws); info.d = one('d', dD, d, ds);
      if (info.w && Math.abs(info.w.number - dW) > 1e-9) { if (spanX) { var cy = (y0 + y1) / 2; out.y0 = r6(cy - w / 2); out.y1 = r6(cy + w / 2); } else { var cx = (x0 + x1) / 2; out.x0 = r6(cx - w / 2); out.x1 = r6(cx + w / 2); } }
      if (info.d && Math.abs(info.d.number - dD) > 1e-9) zz.z1 = r6(z.z0 + d);
      out.info = { w: info.w, d: info.d, anchor: 'soffit' };
      return { sz: out, z: zz };
    }
    KINDS.forEach(function (kind) {
      var rep = { plan_regions: 0, bodies: 0, gaps: 0, nonRect: 0 }, ER = null;
      var chosenName = opts.prepChoices && opts.prepChoices[kind + '.type_name'];
      var lab = labelsFor(sheets, kind); report.labels[kind] = lab;
      var SZ = sizesForKind(kind);
      if (lab.length === 1) names[kind] = chosenName !== undefined ? String(chosenName) : lab[0];
      plans.forEach(function (ps, pi) {
        var ly = bodyLayers(ps, kind); if (!ly.length) return;
        if (!pofs[pi].ok) { gaps.push({ code: 'GAP:body_plan_not_aligned', kind: kind, sheet: ps.name, handle: null, detail: pofs[pi].why.join('; ') + ' (aligned to ' + plans[0].name + ')' }); rep.gaps++; return; }
        if (!ER) ER = elevRegions(kind);
        var pr0 = planR(ps, ly, kind), r = pr0.r, nEx = pr0.nEx, k = ps.factor;
        rep.excluded = (rep.excluded || 0) + nEx;
        rep.nonRect += r.nonRect; rep.plan_regions += r.list.length;
        r.list.forEach(function (g, gi) {
          var x0 = r6(Math.min(g.x0, g.x1) * k + pofs[pi].x), x1 = r6(Math.max(g.x0, g.x1) * k + pofs[pi].x), y0 = r6(Math.min(g.y0, g.y1) * k + pofs[pi].y), y1 = r6(Math.max(g.y0, g.y1) * k + pofs[pi].y);
          var fp = kind + '|' + [x0, y0, x1, y1].map(function (v) { return Math.round(v * 1000); }).join(',');
          if (seenFp[fp]) { rep.dedup = (rep.dedup || 0) + 1; return; }   // the same footprint already came from an earlier plan
          seenFp[fp] = 1;
          var interval = function (e) { var I = e.axis === 'X' ? [x0, x1] : [y0, y1]; return { I: I, dc: Math.abs((e.p0 + e.p1) / 2 - (I[0] + I[1]) / 2), dw: Math.abs((e.p1 - e.p0) - (I[1] - I[0])), w: I[1] - I[0] }; };
          var exact = ER.filter(function (e) { var q = interval(e); return Math.abs(e.p0 - q.I[0]) <= tolM && Math.abs(e.p1 - q.I[1]) <= tolM; }), matchKind = 'interval', cands = exact;
          if (!cands.length) { cands = ER.filter(function (e) { var q = interval(e); return q.dc <= tolM && q.dw <= 0.5 * q.w; }); matchKind = 'centre'; }
          // §L9 a span drawn in pieces (a label clips the line: the shed's 04-05 bay is two 50 in pieces) lies WITHIN the elevation band of its bay: it inherits that band's height (contained, never wider than the band)
          if (!cands.length && BAND_KINDS.indexOf(kind) >= 0) { cands = ER.filter(function (e) { var q = interval(e); return q.I[0] >= e.p0 - tolM && q.I[1] <= e.p1 + tolM && (e.p1 - e.p0) <= 3.5 * q.w; }); matchKind = 'within'; }   // only a band of ABOUT the bay's size (<= 3.5x the piece): a narrow region inside a long band (an end beam inside the plinth line) must not borrow its height   // same centre line, a narrower/wider drawn face: reported, never silent
          var distinct = []; cands.forEach(function (c) { if (!distinct.some(function (d) { return Math.abs(d.z0 - c.z0) <= tolM && Math.abs(d.z1 - c.z1) <= tolM; })) distinct.push(c); });
          var base = { kind: kind, sheet: ps.name, handle: g.handle, layer: g.layer };
          var hsrc = 'elevation', st0 = stated[kind];
          if (!distinct.length && st0 && st0.conflict) { gaps.push(Object.assign({ code: 'GAP:body_stated_z_conflict', detail: 'two sheets state different @BODYZ ranges for ' + kind }, base)); rep.gaps++; return; }
          if (!distinct.length && st0) { distinct = [{ z0: st0.z0, z1: st0.z1 }]; cands = []; matchKind = null; hsrc = 'stated'; }
          if (!distinct.length) { gaps.push(Object.assign({ code: 'GAP:body_no_elevation', detail: 'no ' + kind + ' region of an elevation has this horizontal interval' + ' (state its z range with @BODYZ)' }, base)); rep.gaps++; return; }
          if (distinct.length > 1) { gaps.push(Object.assign({ code: 'GAP:body_ambiguous_z', detail: distinct.map(function (d) { return d.z0 + '..' + d.z1 + ' (' + d.sheet + ' ' + d.handle + ')'; }).join(' | ') }, base)); rep.gaps++; return; }
          var mark = BAND_KINDS.indexOf(kind) >= 0 ? nearMark(ps, g, 5.0 / k) : null;   // §L9.4 per-region type mark (B-1 / B-2)
          var z = distinct[0], guid = 'body-' + kind + '-' + pi + '-' + g.handle, sz = sizeOf(SZ[pi] && SZ[pi][gi], guid, x0, x1, y0, y1, k);
          if (BAND_KINDS.indexOf(kind) >= 0) { var cs = crossSection(kind, mark, guid, x0, x1, y0, y1, z, k); if (cs) { sz = cs.sz; z = cs.z; } }
          var pm = S.prismRect([[sz.x0, sz.y0], [sz.x1, sz.y0], [sz.x1, sz.y1], [sz.x0, sz.y1]], [], z.z0, z.z1);
          if (!pm) { gaps.push(Object.assign({ code: 'GAP:body_degenerate', detail: 'z range ' + z.z0 + '..' + z.z1 }, base)); rep.gaps++; return; }
          if (seen[guid]) throw new Error('Dxf2Bodies: duplicate body id ' + guid);
          seen[guid] = 1;
          var lv = levels.filter(function (l) { return l <= z.z0 + tolM; }).pop(); if (lv === undefined) lv = levels[0];   // several plans of one storey share ONE storey
          els.push({ guid: guid, class: P.ifcType(kind).ifc_class, storey: 'Level ' + (levels.indexOf(lv) + 1), vertices: pm.vertices, faces: pm.faces, handle: g.handle, layer: g.layer, sheet: ps.name,
            kind: kind, size: sz.info, prov: hsrc === 'stated' ? 'derived' : 'drawn', ifc: P.ifcType(kind, mark || names[kind] || null, null), mark: mark, band: !!g.band, width_m: g.width ? r6(g.width * k) : null, members: g.members, z0: z.z0, z1: z.z1, height_source: hsrc, match: matchKind, width_note: matchKind === 'centre' ? 'footprint from the plan, centre line matched the elevation' : null, elev_handles: cands.map(function (c) { return c.sheet + ':' + c.handle; }) });
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
    report.size_conflicts = sizeRows;   // one entry per body side whose stated number replaced the drawn extent (yellow rows in the product)
    report.centre = els.filter(function (e) { return e.match === 'centre'; }).length;
    return { els: els, gaps: gaps, report: report, defaults: DEF.rows() };
  }

  return { buildBodies: buildBodies, planOffset: planOffset, KINDS: KINDS, bandRegions: bandRegions };
});
