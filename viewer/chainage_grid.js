// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// chainage_grid.js — §CHAINAGE_GRID (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §CHAINAGE_GRID).
// Implementing CIVIL_HIGHWAY_JELAPANG.md §CHAINAGE_GRID — Witness: viewer/tests/witness_chainage_grid.js
// The model's chainage markers are 3D text with no name / pset / text literal: every solid is one glyph piece. The reader
// clusters the pieces into labels, finds each label's text axis, splits characters and matches each one against the
// browser's own sans-serif glyphs (IoU). NO model names here: the marker discipline comes from std_values.json `_chainage_map`.
// Pure core (node + browser; templates are injected) + browser glue (setupChainageGrid).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ChainageGrid = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var CELL_W = 40, CELL_H = 40, CAP_PX = 32, BASE_ROW = 36;   // raster cell: cap height 32 px, baseline row 36
  var SPACE_MIN = 0.2;   // smallest gap (x cap height) that MAY be a word space; the grammar decides (see readLabel)
  var NUM_SET = '0123456789.+', PRE_SET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  // ── geometry helpers ────────────────────────────────────────────────────────────────────────────────────────────
  // glyph: {guid, cx, cy, cz, v: Float32Array local xyz, f: Uint32Array}. Plan points = IFC x,y (+ centre).
  function planPts(g) {
    var out = new Float64Array(g.v.length / 3 * 2);
    for (var i = 0, k = 0; i < g.v.length; i += 3) { out[k++] = g.v[i] + g.cx; out[k++] = g.v[i + 1] + g.cy; }
    return out;
  }
  function bboxOf(P) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (var i = 0; i < P.length; i += 2) { if (P[i] < b.x0) b.x0 = P[i]; if (P[i] > b.x1) b.x1 = P[i]; if (P[i + 1] < b.y0) b.y0 = P[i + 1]; if (P[i + 1] > b.y1) b.y1 = P[i + 1]; }
    return b;
  }

  // 1. single-link clustering: link two pieces when their plan boxes are closer than linkK x the larger piece's diagonal
  function cluster(items, linkK) {
    var n = items.length, par = []; for (var i = 0; i < n; i++) par.push(i);
    function f(i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }
    for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) {
      var A = items[a].bb, B = items[b].bb;
      var gx = Math.max(0, Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1)), gy = Math.max(0, Math.max(A.y0, B.y0) - Math.min(A.y1, B.y1));
      if (Math.hypot(gx, gy) < linkK * Math.max(items[a].diag, items[b].diag)) par[f(a)] = f(b);
    }
    var m = {}; for (var j = 0; j < n; j++) { var r = f(j); (m[r] || (m[r] = [])).push(items[j]); }
    return Object.keys(m).map(function (k) { return m[k]; });
  }

  // text direction = the angle at which the label's points are THINNEST across (minimum-height bounding strip). Vertex-count
  // weighting (PCA) tilts it on curved glyphs (measured: "J2B" read ~40° off), the strip height does not. 1° scan, 0.1° refine.
  function textAngle(pts) {
    function h(a) { var c = Math.cos(a), s = Math.sin(a), lo = Infinity, hi = -Infinity; for (var i = 0; i < pts.length; i += 2) { var w = -pts[i] * s + pts[i + 1] * c; if (w < lo) lo = w; if (w > hi) hi = w; } return hi - lo; }
    var best = 0, bh = Infinity, d;
    for (d = 0; d < 180; d++) { var v = h(d * Math.PI / 180); if (v < bh) { bh = v; best = d; } }
    var b2 = best; for (d = best - 1; d <= best + 1; d += 0.1) { var v2 = h(d * Math.PI / 180); if (v2 < bh) { bh = v2; b2 = d; } }
    return b2 * Math.PI / 180;
  }

  // rasterise triangles given in cell pixel coords into a CELL_W x CELL_H mask (pixel-centre inside test)
  function fillTri(mask, ax, ay, bx, by, cx, cy) {
    var x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(CELL_W - 1, Math.ceil(Math.max(ax, bx, cx)));
    var y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(CELL_H - 1, Math.ceil(Math.max(ay, by, cy)));
    var d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (Math.abs(d) < 1e-12) return;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var px = x + 0.5, py = y + 0.5;
      var w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / d, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / d, w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) mask[y * CELL_W + x] = 1;
    }
  }
  function iou(a, b) { var i = 0, u = 0; for (var k = 0; k < a.length; k++) { if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; } return u ? i / u : 0; }

  // read one label in one orientation (theta = text direction). Returns {text, score, chars}
  function readLabel(pieces, theta, tpl) {
    var c = Math.cos(theta), s = Math.sin(theta);
    // per piece: u (along text) / w (up) of every vertex
    var P = pieces.map(function (p) {
      var uv = new Float64Array(p.pts.length), u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
      for (var i = 0; i < p.pts.length; i += 2) { var u = p.pts[i] * c + p.pts[i + 1] * s, w = -p.pts[i] * s + p.pts[i + 1] * c; uv[i] = u; uv[i + 1] = w; if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < w0) w0 = w; if (w > w1) w1 = w; }
      return { g: p.g, uv: uv, u0: u0, u1: u1, w0: w0, w1: w1 };
    }).sort(function (a, b) { return a.u0 - b.u0; });
    // characters = pieces whose u-spans overlap by > 30 % of the narrower one
    var chars = [];
    P.forEach(function (p) {
      var last = chars[chars.length - 1];
      if (last) { var ov = Math.min(last.u1, p.u1) - Math.max(last.u0, p.u0); if (ov > 0.3 * Math.min(last.u1 - last.u0, p.u1 - p.u0)) { last.p.push(p); last.u0 = Math.min(last.u0, p.u0); last.u1 = Math.max(last.u1, p.u1); last.w0 = Math.min(last.w0, p.w0); last.w1 = Math.max(last.w1, p.w1); return; } }
      chars.push({ p: [p], u0: p.u0, u1: p.u1, w0: p.w0, w1: p.w1 });
    });
    var base = Infinity, cap = 0; chars.forEach(function (ch) { base = Math.min(base, ch.w0); });
    chars.forEach(function (ch) { cap = Math.max(cap, ch.w1 - base); });
    if (!(cap > 0)) return null;
    var sc = CAP_PX / cap;
    // one mask per character, matched ONCE against both alphabets
    var M = chars.map(function (ch) {
      var mask = new Uint8Array(CELL_W * CELL_H), um = (ch.u0 + ch.u1) / 2;
      ch.p.forEach(function (p) {
        var f = p.g.f;
        var X = function (k) { return CELL_W / 2 + (p.uv[2 * k] - um) * sc; }, Y = function (k) { return BASE_ROW - (p.uv[2 * k + 1] - base) * sc; };
        for (var t = 0; t < f.length; t += 3) fillTri(mask, X(f[t]), Y(f[t]), X(f[t + 1]), Y(f[t + 1]), X(f[t + 2]), Y(f[t + 2]));
      });
      function match(set) {
        var best = null, second = 0;
        for (var q = 0; q < set.length; q++) { var t2 = tpl[set[q]]; if (!t2) continue; var v = 0; for (var tq = 0; tq < t2.length; tq++) v = Math.max(v, iou(mask, t2[tq])); if (!best || v > best.v) { second = best ? best.v : 0; best = { c: set[q], v: v }; } else if (v > second) second = v; }
        return best ? { c: best.c, v: best.v, margin: best.v - second } : { c: '?', v: 0, margin: 0 };
      }
      return { num: match(NUM_SET), pre: match(PRE_SET), guids: ch.p.map(function (p) { return p.g.guid; }), mask: api.debug ? mask : undefined };
    });
    // word split by GRAMMAR, not a fixed gap: candidates = no prefix, or a prefix ending at any gap > SPACE_MIN x cap; the prefix
    // must start with a letter and the number must parse. Highest summed IoU wins. (A fixed gap split "1 300": the '1' glyph is
    // narrow inside a wide advance, so its gap looks like a space.)
    var cand = [chars.length];
    for (var i = 1; i < chars.length; i++) if (chars[i].u0 - chars[i - 1].u1 > SPACE_MIN * cap) cand.push(i);
    var pick = null;
    cand.forEach(function (k) {
      var nPre = k === chars.length ? 0 : k, text = '', tot = 0, out = [];
      for (var j = 0; j < chars.length; j++) {
        var r = j < nPre ? M[j].pre : M[j].num;
        if (j === nPre && nPre) text += ' ';
        text += r.c; tot += r.v; out.push({ c: r.c, iou: r.v, margin: r.margin, guids: M[j].guids, mask: M[j].mask });
      }
      var ok = !!parseLabel(text) && (!nPre || /^[A-Z]/.test(text));
      if (!pick || (ok && !pick.ok) || (ok === pick.ok && tot > pick.total)) pick = { text: text, score: tot / chars.length, total: tot, chars: out, ok: ok };
    });
    return pick;
  }

  // value of the number token: metres, or k+mmm
  function parseLabel(text) {
    var m = /^(?:(\S+) )?([0-9.+]+)$/.exec(text); if (!m) return null;
    var num = m[2], v;
    if (/^\d+\+\d+(\.\d+)?$/.test(num)) { var pr = num.split('+'); v = +pr[0] * 1000 + +pr[1]; }
    else if (/^\d+(\.\d+)?$/.test(num)) v = +num; else return null;
    if (/^0\d/.test(num)) return null;   // a printed station never has a leading zero: "006" is "900" upside down
    return { alignment: m[1] || '', value: v };
  }

  // ── the reader ──────────────────────────────────────────────────────────────────────────────────────────────────
  function readMarkers(glyphs, tpl, opts) {
    var log = (opts && opts.log) || function () {}, linkK = (opts && opts.linkK) || 0.9;
    if (!glyphs.length) { log('§CHAINAGE_READ VACUOUS no marker solids in this model — 0 judged (not a pass)'); return { vacuous: true, labels: [] }; }
    var items = glyphs.map(function (g) { var P = planPts(g), bb = bboxOf(P); return { g: g, pts: P, bb: bb, diag: Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0) }; });
    var groups = cluster(items, linkK), labels = [];
    groups.forEach(function (pc) {
      var all = []; pc.forEach(function (p) { for (var i = 0; i < p.pts.length; i++) all.push(p.pts[i]); });
      var th = textAngle(all), best = null;
      [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].forEach(function (d) { var r = readLabel(pc, th + d, tpl); if (r && (!best || (r.ok && !best.ok) || (r.ok === best.ok && r.total > best.total))) { best = r; best.theta = th + d; } });
      var cx = 0, cy = 0, cz = 0; pc.forEach(function (p) { cx += p.g.cx; cy += p.g.cy; cz += p.g.cz; }); cx /= pc.length; cy /= pc.length; cz /= pc.length;
      var pv = best ? parseLabel(best.text) : null;
      labels.push({ text: best ? best.text : '', score: best ? best.score : 0, chars: best ? best.chars : [], theta: best ? best.theta : 0, x: cx, y: cy, z: cz,
        pieces: pc.length, guids: pc.map(function (p) { return p.g.guid; }), alignment: pv ? pv.alignment : null, value: pv ? pv.value : null });
    });
    labels.sort(function (a, b) { return (a.alignment || '').localeCompare(b.alignment || '') || (a.value - b.value); });
    labels.forEach(function (l) {
      var minI = Math.min.apply(null, l.chars.map(function (c) { return c.iou; }).concat([1])), minM = Math.min.apply(null, l.chars.map(function (c) { return c.margin; }).concat([1]));
      log('§CHAINAGE_LABEL text="' + l.text + '" align=' + (l.alignment || 'MAIN') + ' value=' + l.value + ' pieces=' + l.pieces + ' chars=' + l.chars.length + ' meanIoU=' + l.score.toFixed(3) + ' minIoU=' + minI.toFixed(3) + ' minMargin=' + minM.toFixed(3) + ' at=(' + l.x.toFixed(1) + ',' + l.y.toFixed(1) + ')');
    });
    var bad = labels.filter(function (l) { return l.value == null; });
    log('§CHAINAGE_READ solids=' + glyphs.length + ' labels=' + labels.length + ' parsed=' + (labels.length - bad.length) + ' unparsed=' + bad.length + ' alignments=' + JSON.stringify(alignCounts(labels)));
    return { vacuous: false, labels: labels };
  }
  function alignCounts(labels) { var o = {}; labels.forEach(function (l) { if (l.value == null) return; var k = l.alignment || 'MAIN'; o[k] = (o[k] || 0) + 1; }); return o; }

  // ── anchoring onto the drive route (three coords: x, z plan) ───────────────────────────────────────────────────
  function routeCum(r) { var c = [0]; for (var i = 1; i < r.length; i++) c.push(c[i - 1] + Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z)); return c; }
  function project(route, cum, x, z) {
    var best = null;
    for (var i = 1; i < route.length; i++) {
      var ax = route[i - 1].x, az = route[i - 1].z, dx = route[i].x - ax, dz = route[i].z - az, L2 = dx * dx + dz * dz;
      var u = L2 > 1e-12 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0, d = Math.hypot(x - ax - u * dx, z - az - u * dz);
      if (!best || d < best.lateral) best = { s: cum[i - 1] + u * (cum[i] - cum[i - 1]), lateral: d };
    }
    return best;
  }
  // anchors: mainline labels -> {s (route), ch (printed)}. Monotone check + per-interval drift.
  function anchor(labels, route, toThree, opts) {
    var log = (opts && opts.log) || function () {}, okM = (opts && opts.driftOkM != null) ? opts.driftOkM : 5;
    var cum = routeCum(route), L = cum[cum.length - 1];
    // station point = where the label's TEXT LINE crosses the route. Measured: the labels stand 36-113 m beside the road with their
    // text running square to it (CAD station-label convention), so the nearest-point drop lands up to ~20 m off and clamps the
    // first labels onto the route start. Fallback (no crossing within axis_max_m): nearest point, flagged.
    var axMax = (opts && opts.axisMaxM) || 300;
    function cross(l) {
      var p = toThree(l.x, l.y, l.z), dx = Math.cos(l.theta), dz = -Math.sin(l.theta), best = null;   // IFC (x,y) dir -> three (x,-y)
      for (var i = 1; i < route.length; i++) {
        var ax = route[i - 1].x, az = route[i - 1].z, ex = route[i].x - ax, ez = route[i].z - az, den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-12) continue;
        var t = ((ax - p.x) * ez - (az - p.z) * ex) / den, u = ((ax - p.x) * dz - (az - p.z) * dx) / den;
        if (u < 0 || u > 1 || Math.abs(t) > axMax) continue;
        if (!best || Math.abs(t) < Math.abs(best.t)) best = { t: t, s: cum[i - 1] + u * (cum[i] - cum[i - 1]) };
      }
      if (best) return { s: best.s, lateral: Math.abs(best.t), how: 'axis' };
      var pj = project(route, cum, p.x, p.z); return { s: pj.s, lateral: pj.lateral, how: 'nearest' };
    }
    var main = labels.filter(function (l) { return l.value != null && !l.alignment; }).map(function (l) {
      var c = cross(l); return { label: l, s: c.s, lateral: c.lateral, how: c.how, ch: l.value };
    }).sort(function (a, b) { return a.s - b.s; });
    main.forEach(function (a) { log('§CHAINAGE_STATION ch=' + a.ch + ' s=' + a.s.toFixed(1) + ' offset=' + a.lateral.toFixed(1) + ' via=' + a.how); });
    // a label off the route's ends (crossing at s=0 / s=L by the fallback) is not an anchor: it would pin two stations to one point
    var offEnd = main.filter(function (a) { return a.how === 'nearest' && (a.s < 1e-6 || a.s > L - 1e-6); });
    if (offEnd.length) { log('§CHAINAGE_OFF_END ' + offEnd.map(function (a) { return a.ch; }).join(',') + ' — beyond the drive route, listed but not anchors'); main = main.filter(function (a) { return offEnd.indexOf(a) < 0; }); }
    var dir = main.length >= 2 && main[main.length - 1].ch < main[0].ch ? -1 : 1, mono = true;
    for (var i = 1; i < main.length; i++) if ((main[i].ch - main[i - 1].ch) * dir <= 0) mono = false;
    var iv = [];
    for (var j = 1; j < main.length; j++) {
      var routeM = main[j].s - main[j - 1].s, step = Math.abs(main[j].ch - main[j - 1].ch), dr = routeM - step;
      iv.push({ from: main[j - 1].ch, to: main[j].ch, routeM: routeM, stepM: step, drift: dr, verdict: Math.abs(dr) <= okM ? 'OK' : 'DRIFT' });
    }
    iv.forEach(function (q) { log('§CHAINAGE_INTERVAL ' + q.from + '->' + q.to + ' step=' + q.stepM + ' route=' + q.routeM.toFixed(1) + ' drift=' + q.drift.toFixed(1) + ' ' + q.verdict); });
    log('§CHAINAGE_ANCHOR main=' + main.length + ' routeLen=' + L.toFixed(1) + ' dir=' + dir + ' monotone=' + mono + ' maxLateral=' + (main.length ? Math.max.apply(null, main.map(function (a) { return a.lateral; })).toFixed(1) : 'NA') +
      ' drift OK=' + iv.filter(function (q) { return q.verdict === 'OK'; }).length + ' DRIFT=' + iv.filter(function (q) { return q.verdict === 'DRIFT'; }).length + ' okM=' + okM);
    var A = { anchors: main, intervals: iv, dir: dir, monotone: mono, routeLen: L };
    // real chainage at a route s: piecewise linear between anchors, slope +-1 beyond the ends
    A.realAt = function (s) {
      if (!main.length) return null; if (main.length === 1) return main[0].ch + dir * (s - main[0].s);
      if (s <= main[0].s) return main[0].ch + dir * (s - main[0].s);
      for (var k = 1; k < main.length; k++) if (s <= main[k].s) { var a = main[k - 1], b = main[k], u = (b.s - a.s) > 1e-9 ? (s - a.s) / (b.s - a.s) : 0; return a.ch + u * (b.ch - a.ch); }
      var e = main[main.length - 1]; return e.ch + dir * (s - e.s);
    };
    A.routeSOf = function (ch) {
      if (!main.length) return null; if (main.length === 1) return main[0].s + dir * (ch - main[0].ch);
      var f = main[0], l = main[main.length - 1];
      if ((ch - f.ch) * dir <= 0) return f.s + dir * (ch - f.ch);
      for (var k = 1; k < main.length; k++) { var a = main[k - 1], b = main[k]; if ((ch - b.ch) * dir <= 0) { var u = (b.ch - a.ch) ? (ch - a.ch) / (b.ch - a.ch) : 0; return a.s + u * (b.s - a.s); } }
      return l.s + dir * (ch - l.ch);
    };
    return A;
  }
  function fmt(ch) { if (ch == null || !isFinite(ch)) return '—'; var r = Math.round(ch), k = Math.floor(Math.abs(r) / 1000), m = Math.abs(r) % 1000; return (r < 0 ? '-' : '') + k + '+' + ('00' + m).slice(-3); }

  // ── templates from the browser's own sans-serif (Arial → Liberation Sans on Linux): same cell convention as readLabel ──
  // Several sans faces, each rendered on its own (a CSS family list would only ever use the first one found): the model's
  // text face is not named anywhere, and faces differ on glyphs like '1' (footed in DejaVu, plain in Arial/Liberation).
  var FONTS = ['Arial', '"Liberation Sans"', 'Helvetica', '"Nimbus Sans"', 'FreeSans', '"DejaVu Sans"', '"Noto Sans"', 'sans-serif'];
  function canvasTemplates(doc) {
    var cv = doc.createElement('canvas'); cv.width = 200; cv.height = 200; var cx = cv.getContext('2d', { willReadFrequently: true });
    var FONT = FONTS[0];
    function ink(ch, fs) {
      cx.clearRect(0, 0, 200, 200); cx.fillStyle = '#000'; cx.font = fs + 'px ' + FONT; cx.textBaseline = 'alphabetic'; cx.fillText(ch, 40, 150);
      var d = cx.getImageData(0, 0, 200, 200).data, b = { x0: 1e9, x1: -1, y0: 1e9, y1: -1 };
      for (var y = 0; y < 200; y++) for (var x = 0; x < 200; x++) if (d[(y * 200 + x) * 4 + 3] > 127) { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
      return { d: d, b: b };
    }
    var set = (NUM_SET + PRE_SET).split('').filter(function (c, i, a) { return a.indexOf(c) === i; }), out = {}, faces = 0;
    FONTS.forEach(function (f) {
      FONT = f; var h = ink('H', 100), fs = 100 * CAP_PX / (h.b.y1 - h.b.y0 + 1); faces++;
      set.forEach(function (ch) {
        var r = ink(ch, fs), m = new Uint8Array(CELL_W * CELL_H); if (r.b.x1 < 0) return;
        var mid = (r.b.x0 + r.b.x1 + 1) / 2;
        for (var y = 0; y < CELL_H; y++) for (var x = 0; x < CELL_W; x++) {
          var sx = Math.floor(mid - CELL_W / 2 + x), sy = 150 - BASE_ROW + y;
          if (sx >= 0 && sx < 200 && sy >= 0 && sy < 200 && r.d[(sy * 200 + sx) * 4 + 3] > 127) m[y * CELL_W + x] = 1;
        }
        var L = out[ch] || (out[ch] = []);
        if (!L.some(function (q) { for (var k = 0; k < q.length; k++) if (q[k] !== m[k]) return false; return true; })) L.push(m);   // same face twice (fallback) = one template
      });
    });
    out._faces = faces;
    return out;
  }

  // ── browser glue ────────────────────────────────────────────────────────────────────────────────────────────────
  function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var ACCENT = '#4fc3f7', DRIFT_COL = '#ffaa33', OK_COL = '#44cc44';
  function setupChainageGrid(A) {
    var _tpl = null, _cache = null, _grp = null, _strip = null, _chip = null, _on = false, _std = null, _off = [];
    function objQuery(q, params) { var st = A.db.prepare(q), out = []; try { if (params && params.length) st.bind(params); while (st.step()) out.push(st.getAsObject()); } finally { st.free(); } return out; }
    function f32(u8) { return new Float32Array(u8.slice().buffer); }
    function u32(u8) { return new Uint32Array(u8.slice().buffer); }
    function civil() { return !!(A.db && A.isCivilModel && A.isCivilModel()); }

    // read once per db: markers + anchors on the drive route
    function read(std) {
      if (_cache && _cache.db === A.db) return _cache;
      var map = std && std._chainage_map, log = console.log;
      if (!civil()) { log('§CHAINAGE_READ VACUOUS not a civil model — chainage is civil-only'); return null; }
      if (!map || !map.discipline) { log('§CHAINAGE_READ NO_DATA std_values.json has no _chainage_map — nothing read'); return null; }
      var t0 = performance.now();
      var rows = objQuery('SELECT t.guid AS guid, t.center_x AS cx, t.center_y AS cy, t.center_z AS cz, g.vertices AS v, g.faces AS f FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid JOIN element_instances i ON i.guid = m.guid JOIN component_geometries g ON g.geometry_hash = i.geometry_hash WHERE m.discipline = ?', [map.discipline]);
      var gl = rows.filter(function (r) { return r.v && r.f; }).map(function (r) { return { guid: r.guid, cx: r.cx, cy: r.cy, cz: r.cz, v: f32(r.v), f: u32(r.f) }; });
      if (A._chainageDropGuid) gl = gl.filter(function (g) { return g.guid !== A._chainageDropGuid; });   // witness RED control only
      if (!_tpl) _tpl = canvasTemplates(document);
      var res = readMarkers(gl, _tpl, { log: log });
      var route = A.civilDriveRoute ? A.civilDriveRoute() : null, anc = null;
      if (!res.vacuous && route && route.length >= 2) anc = anchor(res.labels, route, function (x, y, z) { return A.ifc2three(x, y, z); }, { log: log, driftOkM: map.drift_ok_m });
      else if (!res.vacuous) log('§CHAINAGE_ANCHOR NO_ROUTE no drive route — markers listed, nothing anchored');
      _cache = { db: A.db, map: map, res: res, anc: anc, route: route, ms: performance.now() - t0, faces: _tpl._faces };
      log('§CHAINAGE_READ_DONE ms=' + _cache.ms.toFixed(0) + ' templateFaces=' + _tpl._faces);
      return _cache;
    }

    // zone of a route s (on-route speed zones, when the Speed section has derived them)
    function zoneAt(s) { var R = A._speedZones; if (!R || !R.zones) return null; var t = R.zones.filter(function (q) { return !q.offRoute; }); return t.filter(function (q) { return s >= q.s0 - 1e-9 && s < q.s1 - 1e-9; })[0] || null; }
    function colourAt(s) { var z = zoneAt(s); return (z && z.speed != null && window.SpeedZones && _std) ? window.SpeedZones.colourFor(_std, z.speed) : ACCENT; }
    // road top at route s from the 1 m profile. Where no ROAD surface lies under the route (measured: CH 0+600–0+840 on
    // CivilWorksPath, 240 m) the height is interpolated between the nearest road samples on each side, and counted.
    var _interp = 0;
    function roadY(P, s, fallback) {
      if (!P || !P.road) return fallback;
      var n = P.n, i = Math.max(0, Math.min(n - 1, Math.round(s / P.ds))), v = P.road[i];
      if (v === v) return v;
      var a = i, b = i; while (a >= 0 && !(P.road[a] === P.road[a])) a--; while (b < n && !(P.road[b] === P.road[b])) b++;
      _interp++;
      if (a >= 0 && b < n) return P.road[a] + (P.road[b] - P.road[a]) * (i - a) / (b - a);
      if (a >= 0) return P.road[a]; if (b < n) return P.road[b]; _interp--; return fallback;
    }
    function noRoadSpans(P) { var out = [], st = -1; for (var i = 0; i <= P.n; i++) { var hole = i < P.n && !(P.road[i] === P.road[i]); if (hole && st < 0) st = i; if (!hole && st >= 0) { if (i - st >= 20) out.push([st * P.ds, i * P.ds]); st = -1; } } return out; }

    function tagTexture(main, sub, col) {
      var cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; var c = cv.getContext('2d');
      c.fillStyle = 'rgba(12,18,26,0.88)'; c.strokeStyle = col; c.lineWidth = 8;
      c.beginPath(); if (c.roundRect) c.roundRect(6, 6, 500, 116, 40); else c.rect(6, 6, 500, 116); c.fill(); c.stroke();
      c.fillStyle = col; c.beginPath(); c.arc(64, 64, 18, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold 60px Arial, sans-serif'; c.textBaseline = 'middle'; c.fillText(main, 100, 66);
      if (sub) { c.fillStyle = '#9ad'; c.font = 'bold 30px Arial, sans-serif'; c.textAlign = 'right'; c.fillText(sub, 486, 34); }
      var t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
    }

    // ribbon + ticks (one mesh), pins (one LineSegments), tags (sprites)
    function draw(C, P) {
      _interp = 0; var route = C.route, anc = C.anc, map = C.map, L = anc.routeLen, minor = map.minor_m || 20, major = map.major_m || 100;
      var pos = [], col = [], tmp = new THREE.Color(), LIFT = 0.12, verts = 0;
      function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, hex) { tmp.set(hex); [ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz].forEach(function (v) { pos.push(v); }); for (var k = 0; k < 6; k++) col.push(tmp.r, tmp.g, tmp.b); }
      // centreline ribbon, 2 m steps, 0.5 m wide
      for (var s = 0; s < L; s += 2) {
        var a = A.civilRouteAt(s), b = A.civilRouteAt(Math.min(L, s + 2)); if (!a || !b) continue;
        var ya = roadY(P, s, null), yb = roadY(P, s + 2, null); if (ya == null || yb == null) continue;
        var nx = a.tz, nz = -a.tx, w = 0.25, h = colourAt(s + 1);
        quad(a.x + nx * w, ya + LIFT, a.z + nz * w, b.x + nx * w, yb + LIFT, b.z + nz * w, b.x - nx * w, yb + LIFT, b.z - nz * w, a.x - nx * w, ya + LIFT, a.z - nz * w, h);
      }
      // ticks at printed-chainage multiples of `minor` that fall on the route
      var c0 = Math.min(anc.realAt(0), anc.realAt(L)), c1 = Math.max(anc.realAt(0), anc.realAt(L)), nMin = 0, nMaj = 0, ticks = [], skipped = [];
      for (var ch = Math.ceil(c0 / minor) * minor; ch <= c1 + 1e-6; ch += minor) {
        var sr = anc.routeSOf(ch); if (sr == null || sr < 0 || sr > L) { skipped.push({ ch: ch, s: sr, why: 'off-route' }); continue; }
        var p = A.civilRouteAt(sr), y = roadY(P, sr, null); if (!p || y == null) { skipped.push({ ch: ch, s: sr, why: 'no-road' }); continue; }
        var isMaj = Math.abs(ch / major - Math.round(ch / major)) < 1e-6, half = isMaj ? 6 : 2, th = isMaj ? 0.35 : 0.15, nx2 = p.tz, nz2 = -p.tx, hx = isMaj ? '#ffffff' : colourAt(sr);
        quad(p.x - nx2 * half - p.tx * th, y + LIFT + 0.02, p.z - nz2 * half - p.tz * th, p.x + nx2 * half - p.tx * th, y + LIFT + 0.02, p.z + nz2 * half - p.tz * th,
          p.x + nx2 * half + p.tx * th, y + LIFT + 0.02, p.z + nz2 * half + p.tz * th, p.x - nx2 * half + p.tx * th, y + LIFT + 0.02, p.z - nz2 * half + p.tz * th, hx);
        if (isMaj) nMaj++; else nMin++;
        ticks.push({ ch: ch, s: sr, major: isMaj });
      }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      var mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide, fog: false });
      var mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 5; mesh.userData.chainage = 'ribbon'; _grp.add(mesh); verts += pos.length / 3;
      // tags: mainline at the station point on the route; arms at their own marker (no centreline for arms in the model)
      var pins = [], tags = [];
      C.res.labels.forEach(function (l) {
        if (l.value == null) return;
        var at, colr = ACCENT, sr2 = null;
        if (!l.alignment) { sr2 = anc.routeSOf(l.value); var q = sr2 != null && sr2 >= 0 && sr2 <= L ? A.civilRouteAt(sr2) : null; if (q) { at = { x: q.x, y: roadY(P, sr2, q.y), z: q.z }; colr = colourAt(sr2); } }
        if (!at) { var w3 = A.ifc2three(l.x, l.y, l.z); at = { x: w3.x, y: w3.y, z: w3.z }; colr = '#b388ff'; }
        var text = 'CH ' + fmt(l.value), sub = l.alignment || null;
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(text, sub, colr), depthTest: false, transparent: true, fog: false }));
        sp.scale.set(16, 4, 1); sp.position.set(at.x, at.y + 8, at.z); sp.renderOrder = 7; sp.userData.chainage = 'tag'; _grp.add(sp);
        pins.push(at.x, at.y + LIFT, at.z, at.x, at.y + 6, at.z);
        tags.push({ text: text, alignment: l.alignment || 'MAIN', value: l.value, s: sr2, x: at.x, y: at.y + 8, z: at.z, label: l.text });
      });
      var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pins, 3));
      var pl = new THREE.LineSegments(pg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false, fog: false })); pl.renderOrder = 6; pl.userData.chainage = 'pins'; _grp.add(pl);
      verts += pins.length / 3 + tags.length * 4;
      A.chainage.state = { tags: tags, ticks: ticks, skipped: skipped, minor: nMin, major: nMaj, verts: verts, objects: _grp.children.length, range: [c0, c1] };
      console.log('§CHAINAGE_GRID_DRAW ticks minor=' + nMin + ' major=' + nMaj + ' skipped=' + skipped.length + (skipped.length ? '[' + skipped.map(function (k) { return k.ch + ':' + k.why; }).join(',') + ']' : '') + ' tags=' + tags.length + ' range=' + c0.toFixed(1) + '..' + c1.toFixed(1) + ' objects=' + _grp.children.length + ' verts=' + verts +
        ' heapMB=' + (performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) : 'NA') + ' heightInterpolated=' + _interp + ' noRoadSpans=' + JSON.stringify(P ? noRoadSpans(P).map(function (q) { return fmt(anc.realAt(q[0])) + '..' + fmt(anc.realAt(q[1])); }) : []) + ' zones=' + (A._speedZones && A._speedZones.zones ? 'speed' : 'accent'));
    }

    // ── hover chip: camera ray → horizontal plane at road height (2 passes) → nearest route point ──
    var _ray = null, _hoverPending = null;
    function hoverAt(clientX, clientY) {
      var C = _cache, P = A.civilProfile ? A.civilProfile() : null; if (!C || !C.anc || !A.camera) return null;
      var r = A.renderer.domElement.getBoundingClientRect(), ndc = new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      if (!_ray) _ray = new THREE.Raycaster(); _ray.setFromCamera(ndc, A.camera);
      var o = _ray.ray.origin, d = _ray.ray.direction, cum = routeCum(C.route), y0 = P ? roadY(P, P.len / 2, A.camera.position.y - 20) : A.camera.position.y - 20, hit = null;
      for (var pass = 0; pass < 3; pass++) {
        if (Math.abs(d.y) < 1e-6) return null; var t = (y0 - o.y) / d.y; if (t <= 0) return null;
        var x = o.x + d.x * t, z = o.z + d.z * t, pj = project(C.route, cum, x, z); hit = { x: x, z: z, s: pj.s, lateral: pj.lateral };
        var y1 = roadY(P, pj.s, y0); if (Math.abs(y1 - y0) < 0.05) break; y0 = y1;
      }
      if (!hit) return null;
      var ch = C.anc.realAt(hit.s), z2 = zoneAt(hit.s), i = P ? Math.max(0, Math.min(P.n - 1, Math.round(hit.s / P.ds))) : -1;
      var road = P && P.road[i] === P.road[i] ? P.road[i] + A.modelOffset.z : null, gr = P && P.ground[i] === P.ground[i] ? P.ground[i] + A.modelOffset.z : null;
      return { s: hit.s, ch: ch, lateral: hit.lateral, zone: z2 ? z2.id : null, speed: z2 ? z2.speed : null, road: road, ground: gr, x: hit.x, z: hit.z };
    }
    function onMove(ev) {
      if (!_on) return; _hoverPending = ev;
      requestAnimationFrame(function () {
        var e = _hoverPending; if (!e) return; _hoverPending = null;
        var h = hoverAt(e.clientX, e.clientY);
        if (!h || h.lateral > 25) { _chip.style.display = 'none'; return; }
        var parts = ['CH ' + fmt(h.ch)]; if (h.zone) parts.push(h.zone + ' ' + h.speed + ' km/h'); if (h.road != null) parts.push('road ' + h.road.toFixed(1)); if (h.ground != null) parts.push('ground ' + h.ground.toFixed(1));
        _chip.innerHTML = '<b style="color:#fff">' + esc(parts[0]) + '</b>' + (parts.length > 1 ? ' <span style="color:#9ad">· ' + esc(parts.slice(1).join(' · ')) + '</span>' : '');
        _chip.style.left = (e.clientX + 14) + 'px'; _chip.style.top = (e.clientY + 14) + 'px'; _chip.style.display = '';
        _chip.style.borderColor = colourAt(h.s);
        A.chainage.lastHover = h;
      });
    }

    // ── bottom strip: whole road as one bar; zones, stations, signs, camera cursor; drag = fly ──
    function stripX(cv, s, L) { return 12 + (cv.width / (window.devicePixelRatio || 1) - 24) * (s / L); }
    function stripS(cv, x, L) { var w = cv.getBoundingClientRect().width - 24; return Math.max(0, Math.min(L, (x - 12) / w * L)); }
    function drawStrip() {
      if (!_strip || !_cache || !_cache.anc) return;
      var cv = _strip.querySelector('canvas'), dpr = window.devicePixelRatio || 1, W = cv.getBoundingClientRect().width, H = 40;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      var c = cv.getContext('2d'), anc = _cache.anc, L = anc.routeLen; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      var R = A._speedZones, zones = R && R.zones ? R.zones.filter(function (q) { return !q.offRoute; }) : [];
      if (zones.length) zones.forEach(function (q) { c.fillStyle = window.SpeedZones && _std ? window.SpeedZones.colourFor(_std, q.speed) : ACCENT; c.fillRect(stripX(cv, q.s0, L), 16, Math.max(1, stripX(cv, q.s1, L) - stripX(cv, q.s0, L)), 8); });
      else { c.fillStyle = ACCENT; c.fillRect(12, 16, W - 24, 8); }
      c.font = '10px Arial, sans-serif'; c.textAlign = 'center'; var lastX = -1e9, major = _cache.map.major_m || 100;
      (A.chainage.state ? A.chainage.state.ticks : []).forEach(function (t) {
        var x = stripX(cv, t.s, L); c.fillStyle = t.major ? '#fff' : 'rgba(255,255,255,0.35)'; c.fillRect(x - 0.5, t.major ? 10 : 13, 1, t.major ? 20 : 14);
        if (t.major && x - lastX > 46) { c.fillStyle = '#ccc'; c.fillText(fmt(t.ch), x, 39); lastX = x; }
      });
      if (R && R.signRows) R.signRows.forEach(function (sg) { if (sg.s == null) return; c.fillStyle = sg.isSpeedSign ? '#ff5252' : 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(stripX(cv, sg.s, L), 6, sg.isSpeedSign ? 3 : 1.6, 0, Math.PI * 2); c.fill(); });
      // cursor = camera position on the route
      var tg = A.camera ? A.camera.position : null;   // where you ARE (a strip click puts the camera at that s)
      if (tg) { var pj = project(_cache.route, routeCum(_cache.route), tg.x, tg.z), x2 = stripX(cv, pj.s, L); c.fillStyle = '#ffeb3b'; c.beginPath(); c.moveTo(x2, 26); c.lineTo(x2 - 6, 34); c.lineTo(x2 + 6, 34); c.fill();
        _strip.querySelector('.cg-now').textContent = 'CH ' + fmt(anc.realAt(pj.s)); A.chainage.cursorS = pj.s; }
    }
    var _stripTimer = null, _drag = false;
    function stripGo(ev) {
      var cv = _strip.querySelector('canvas'), r = cv.getBoundingClientRect(), s = stripS(cv, ev.clientX - r.left, _cache.anc.routeLen);
      var p = A.civilGotoChainage(s); console.log('§CHAINAGE_STRIP_GO s=' + s.toFixed(1) + ' ch=' + _cache.anc.realAt(s).toFixed(1) + (p ? ' cam=(' + p.x.toFixed(1) + ',' + p.z.toFixed(1) + ')' : ' noRoute'));
      drawStrip(); return s;
    }
    function buildStrip() {
      _strip = document.createElement('div'); _strip.id = 'chainage-strip';
      _strip.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);width:min(900px,calc(100vw - 32px));z-index:1100;background:rgba(12,18,26,0.86);border:1px solid rgba(79,195,247,0.45);border-radius:10px;padding:4px 8px 2px;font:12px Arial,sans-serif;color:#ccc;user-select:none;touch-action:none';
      _strip.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><span style="color:#4fc3f7;font-weight:700">Chainage</span><span class="cg-now" style="color:#fff;font-weight:700"></span><span style="color:#888">drag to fly</span></div><canvas style="width:100%;height:40px;display:block;cursor:ew-resize"></canvas>';
      document.body.appendChild(_strip);
      var cv = _strip.querySelector('canvas');
      cv.addEventListener('pointerdown', function (e) { _drag = true; try { cv.setPointerCapture(e.pointerId); } catch (x) {} stripGo(e); });
      cv.addEventListener('pointermove', function (e) { if (_drag) stripGo(e); });
      cv.addEventListener('pointerup', function () { _drag = false; });
      _stripTimer = setInterval(drawStrip, 250);
    }

    function show(std) {
      _std = std || _std;
      var C = read(_std); if (!C || !C.anc) { console.log('§CHAINAGE_GRID_DRAW VACUOUS ' + (!C ? 'nothing read' : 'no drive route') + ' — nothing drawn'); return Promise.resolve(null); }
      hide('redraw', true);
      return (A.civilProfilePrepare ? A.civilProfilePrepare() : Promise.resolve(null)).then(function (P) {
        _grp = new THREE.Group(); _grp.name = 'chainage-grid'; A.scene.add(_grp);
        draw(C, P);
        _chip = document.createElement('div'); _chip.id = 'chainage-chip';
        _chip.style.cssText = 'position:fixed;z-index:1102;pointer-events:none;display:none;background:rgba(12,18,26,0.9);border:1px solid ' + ACCENT + ';border-radius:14px;padding:3px 10px;font:12px Arial,sans-serif;color:#ccc;white-space:nowrap';
        document.body.appendChild(_chip);
        A.renderer.domElement.addEventListener('pointermove', onMove); _off.push(function () { A.renderer.domElement.removeEventListener('pointermove', onMove); });
        buildStrip(); _on = true; drawStrip(); if (A.markDirty) A.markDirty();
        return A.chainage.state;
      });
    }
    function hide(why, quiet) {
      var n = 0;
      if (_grp) { _grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); n = _grp.children.length; A.scene.remove(_grp); _grp = null; }
      _off.forEach(function (f) { f(); }); _off = [];
      if (_stripTimer) clearInterval(_stripTimer); _stripTimer = null;
      if (_strip) { _strip.remove(); _strip = null; } if (_chip) { _chip.remove(); _chip = null; }
      var was = _on; _on = false; if (A.markDirty) A.markDirty();
      if (!quiet && was) console.log('§CHAINAGE_GRID_OFF via=' + (why || 'api') + ' removed=' + n + ' left=' + A.scene.children.filter(function (o) { return o.name === 'chainage-grid'; }).length);
      return n;
    }

    // ── panel section (inside Road standards) ──
    function mount(std, host, card) {
      _std = std; var C = read(std), sec = document.createElement('div'); sec.className = 'cg-section'; sec.style.cssText = 'margin-top:10px;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px';
      if (!C || C.res.vacuous) { sec.innerHTML = '<div class="cg-title" style="color:#4fc3f7;font-weight:700;font-size:16px">Chainage</div><div style="color:#888">No chainage markers in this model.</div>'; host.appendChild(sec); return null; }
      var labs = C.res.labels.filter(function (l) { return l.value != null; }), main = labs.filter(function (l) { return !l.alignment; }), arms = {};
      labs.filter(function (l) { return l.alignment; }).forEach(function (l) { (arms[l.alignment] || (arms[l.alignment] = [])).push(l); });
      var iv = C.anc ? C.anc.intervals : [], nDr = iv.filter(function (q) { return q.verdict === 'DRIFT'; }).length, P0 = A.civilProfile ? A.civilProfile() : null;
      var kv = function (k, v, c) { return '<div class="cg-kv" style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:1px 0"><span style="color:#888">' + k + '</span><span style="text-align:right' + (c ? ';color:' + c : '') + '">' + v + '</span></div>'; };
      var h = '<div class="cg-title" style="color:#4fc3f7;font-weight:700;font-size:16px;margin-bottom:4px">Chainage</div>' +
        kv('Source', 'from model markers') + kv('Mainline', main.length ? main.length + ' stations · ' + fmt(main[0].value) + '–' + fmt(main[main.length - 1].value) : '—') +
        kv('Arms', Object.keys(arms).length ? Object.keys(arms).map(function (k) { return k + ' ×' + arms[k].length; }).join(' · ') : '—') +
        kv('Route check', C.anc ? (nDr ? nDr + ' DRIFT · ' : '') + (iv.length - nDr) + ' OK' : 'no route', nDr ? DRIFT_COL : OK_COL) +
        '<details class="cg-why" style="margin:2px 0"><summary style="cursor:pointer;font-size:12px;color:#9ad">Why / sources</summary><div style="font-size:12px;color:#aaa">The model\'s ' + esc(C.map.discipline) + ' elements are 3D text with no name or property: ' + C.res.labels.reduce(function (a, l) { return a + l.pieces; }, 0) + ' glyph solids, read here into ' + C.res.labels.length + ' labels by matching each character against standard sans-serif glyphs (lowest match ' + Math.min.apply(null, C.res.labels.map(function (l) { return Math.min.apply(null, l.chars.map(function (c) { return c.iou; })); })).toFixed(2) + '). Mainline stations are anchored on the drive route; chainage between them is interpolated. Route check = route length between two markers vs their printed step (OK within ' + C.map.drift_ok_m + ' m). Arms have no centreline in the model: markers only.</div></details>' +
        '<label style="display:flex;gap:6px;align-items:center;margin:4px 0;cursor:pointer"><input type="checkbox" class="cg-toggle"> <span>Show on road</span></label>';
      if (iv.length) h += '<details class="cg-ivs"' + (nDr ? ' open' : '') + '><summary style="cursor:pointer;font-weight:600;font-size:12px;color:' + (nDr ? DRIFT_COL : OK_COL) + ';margin:4px 0 2px">Route vs markers (' + iv.length + ')</summary>' +
        iv.slice().sort(function (a, b) { return Math.abs(b.drift) - Math.abs(a.drift); }).map(function (q) { return '<div class="cg-iv" style="font-size:11px;padding:1px 6px;border-left:3px solid ' + (q.verdict === 'OK' ? OK_COL : DRIFT_COL) + ';margin:1px 0">' + fmt(q.from) + '→' + fmt(q.to) + ' · route ' + q.routeM.toFixed(1) + ' m · ' + (q.drift >= 0 ? '+' : '') + q.drift.toFixed(1) + ' m ' + q.verdict + '</div>'; }).join('') + '</details>';
      h += '<details class="cg-st" open><summary style="cursor:pointer;font-weight:600;font-size:12px;color:#ddd;margin:4px 0 2px">Stations (' + main.length + ')</summary><div style="max-height:180px;overflow-y:auto">' +
        main.map(function (l, i) {
          var sr = C.anc ? C.anc.routeSOf(l.value) : null, ix = P0 && sr != null ? Math.max(0, Math.min(P0.n - 1, Math.round(sr / P0.ds))) : -1;
          var rz = ix >= 0 && P0.road[ix] === P0.road[ix] ? (P0.road[ix] + A.modelOffset.z).toFixed(1) : '—', gz = ix >= 0 && P0.ground[ix] === P0.ground[ix] ? (P0.ground[ix] + A.modelOffset.z).toFixed(1) : '—';
          var ns = A._speedZones && A._speedZones.signRows && sr != null ? A._speedZones.signRows.filter(function (g) { return Math.abs(g.s - sr) <= 50; }).length : null;
          return '<div class="cg-row" data-i="' + i + '" style="display:flex;justify-content:space-between;gap:6px;margin:1px 0;padding:2px 6px;border-left:3px solid ' + (sr != null ? colourAt(sr) : ACCENT) + ';background:rgba(255,255,255,0.03);cursor:pointer;font-size:12px"><b style="color:#fff">CH ' + fmt(l.value) + '</b><span style="color:#aaa">road ' + rz + ' · ground ' + gz + (ns != null ? ' · ' + ns + ' signs' : '') + '</span></div>';
        }).join('') + '</div></details>';
      Object.keys(arms).forEach(function (k) {
        h += '<details class="cg-arm"><summary style="cursor:pointer;font-size:12px;color:#b388ff;margin:2px 0">' + esc(k) + ' (' + arms[k].length + ')</summary>' + arms[k].map(function (l) { return '<div class="cg-arow" data-guid="' + esc(l.guids[0]) + '" style="margin:1px 0 1px 10px;padding:2px 6px;border-left:3px solid #b388ff;cursor:pointer;font-size:12px">' + esc(k) + ' CH ' + fmt(l.value) + '</div>'; }).join('') + '</details>';
      });
      sec.innerHTML = h; host.appendChild(sec);
      sec.querySelector('.cg-toggle').addEventListener('change', function (e) { if (e.target.checked) show(std); else hide('toggle'); });
      sec.addEventListener('click', function (ev) {
        var r = ev.target.closest && ev.target.closest('.cg-row'), a = ev.target.closest && ev.target.closest('.cg-arow');
        if (r) { var l = main[+r.getAttribute('data-i')], sr = C.anc ? C.anc.routeSOf(l.value) : null; if (sr != null) A.civilGotoChainage(sr); console.log('§CHAINAGE_ROW_CLICK ch=' + l.value + ' s=' + (sr != null ? sr.toFixed(1) : 'NA')); }
        if (a) { var g = a.getAttribute('data-guid'); if (A.focusElement) A.focusElement(g); else if (A.zoomToGuid) A.zoomToGuid(g); console.log('§CHAINAGE_ARM_CLICK guid=' + g); }
      });
      console.log('§CHAINAGE_PANEL main=' + main.length + ' arms=' + JSON.stringify(Object.keys(arms).map(function (k) { return k + ':' + arms[k].length; })) + ' intervals=' + iv.length + ' drift=' + nDr);
      return C;
    }

    // ── §CHAINAGE_EVERYWHERE: ONE owner for chainage TEXT. Every readout (speed zones, Long/Cross, Alt+C cards, film status row)
    //    calls these; the maths stays in route s. Anchored → "CH 1+152"; not (yet) read / no markers → today's "1152 m (inferred)".
    A.civilChainLabel = function (s) {
      if (s == null || !isFinite(s)) return '\u2014';
      return _cache && _cache.anc && _cache.db === A.db ? 'CH ' + fmt(_cache.anc.realAt(s)) : Math.round(s) + ' m (inferred)';
    };
    A.civilChainRange = function (s0, s1) {
      if (_cache && _cache.anc && _cache.db === A.db) return 'CH ' + fmt(_cache.anc.realAt(s0)) + '\u2013' + fmt(_cache.anc.realAt(s1));
      return Math.round(s0) + '\u2013' + Math.round(s1) + ' m (inferred)';
    };
    A.civilChainReal = function () { return !!(_cache && _cache.anc && _cache.db === A.db); };
    // read once after a civil model has loaded (no panel needed); 2 s poll, stops once read or not civil
    var _autoBusy = false, _autoDb = null;
    function autoRead() {
      if (_autoBusy || _autoDb === A.db || (_cache && _cache.db === A.db) || !A.db || A.streaming || !civil() || !(A.civilDriveRoute && A.civilDriveRoute())) return;
      _autoBusy = true; _autoDb = A.db;   // one attempt per model (a model without markers must not re-read every 2 s)
      var ld = (typeof window.loadJsonWithOverrides === 'function') ? window.loadJsonWithOverrides('std_values.json?v=3', 'json_std_values') : fetch('std_values.json?v=3').then(function (r) { return r.json(); });
      ld.then(function (std) { var t0 = performance.now(); _std = _std || std; read(std); console.log('§CHAINAGE_AUTO_READ ms=' + (performance.now() - t0).toFixed(0) + ' anchored=' + A.civilChainReal()); if (A.markDirty) A.markDirty(); })
        .catch(function (e) { console.warn('§CHAINAGE_AUTO_READ failed: ' + e.message); }).then(function () { _autoBusy = false; });
    }
    setInterval(autoRead, 2000);

    A.chainage = { read: read, show: show, hide: hide, mount: mount, hoverAt: hoverAt, drawStrip: drawStrip, active: function () { return _on; },
      realAt: function (s) { return _cache && _cache.anc ? _cache.anc.realAt(s) : null; }, routeSOf: function (ch) { return _cache && _cache.anc ? _cache.anc.routeSOf(ch) : null; },
      reset: function () { hide('reset', true); _cache = null; }, state: null };
  }

  var api = { readMarkers: readMarkers, canvasTemplates: canvasTemplates, setupChainageGrid: setupChainageGrid, readLabel: readLabel, parseLabel: parseLabel, anchor: anchor, project: project, routeCum: routeCum, fmt: fmt,
    CELL_W: CELL_W, CELL_H: CELL_H, CAP_PX: CAP_PX, BASE_ROW: BASE_ROW, NUM_SET: NUM_SET, PRE_SET: PRE_SET };
  if (typeof window !== 'undefined') { window.ChainageGrid = api; window.setupChainageGrid = setupChainageGrid; }
  return api;
});
