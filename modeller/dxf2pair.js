// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2pair.js — pair every drawn length with a stated number (prompts/DXF2BIM_MODELLER_LANE.md §L10). Pure functions, browser + Node.
//   parseNumber   dimension/label text -> a length in sheet units, or null (never guessed)
//   dimsOf        parsed DIMENSION entities -> {handle,p1,p2,measure,text,sheet}
//   pair          lengths x dims (+labels, user marks) -> one pair per length, with class, number in force, precedence, yellow rows
//   align         best-effort side alignment for an edited number (anchored sides stay, residual reported)
// The number is the value: the drawn line is evidence. A conflict is a visible row, never a silent choice.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Pair = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var IN = { in: 1, mm: 25.4, m: 0.0254 };   // sheet units per inch

  function clean(t) { return String(t == null ? '' : t).replace(/\\[A-Za-z]\d*(\.\d+)?[^;\\]*;/g, '').replace(/\{\\f[^;}]*;/g, '').replace(/[{}]/g, '').replace(/\\P/g, ' ').trim(); }
  // Feet-inch grammar: 410'-0" | 16' | 8'-4 1/2" | 12" | 1.5" | 3/4" ; bare number = sheet units. Anything else (L/5, 2h, ld, Splice*) -> null.
  function parseNumber(text, unit) {
    var k = IN[unit || 'in']; if (!k) throw new Error('Dxf2Pair: unknown unit ' + unit);
    var t = clean(text).replace(/\s+/g, ' ');
    if (t === '' || t === '<>') return null;
    var m = /^(?:(\d+(?:\.\d+)?)')?\s*-?\s*(?:(\d+(?:\.\d+)?)?(?:\s*(\d+)\/(\d+))?")?$/.exec(t);
    if (m && (m[1] || m[2] || m[3])) {
      var inch = (m[1] ? parseFloat(m[1]) * 12 : 0) + (m[2] ? parseFloat(m[2]) : 0) + (m[3] ? parseInt(m[3], 10) / parseInt(m[4], 10) : 0);
      return inch * k;
    }
    if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
    return null;
  }

  function dimsOf(entities, sheet) {
    return (entities || []).filter(function (e) { return e.type === 'DIMENSION' && e.linearOrAngularPoint1 && e.linearOrAngularPoint2; }).map(function (e) {
      return { handle: e.handle, sheet: sheet, p1: [e.linearOrAngularPoint1.x, e.linearOrAngularPoint1.y], p2: [e.linearOrAngularPoint2.x, e.linearOrAngularPoint2.y], measure: e.actualMeasurement, text: e.text };
    });
  }

  function hyp(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  // the axis a dimension measures along: from its stored measurement (not from the unreliable angle field)
  function dimAxis(d) {
    var dx = Math.abs(d.p2[0] - d.p1[0]), dy = Math.abs(d.p2[1] - d.p1[1]), m = d.measure, tol = Math.max(1e-6, 1e-4 * Math.max(dx, dy, 1));
    if (m != null && Math.abs(m - dx) <= tol * 10 && dx >= dy) return 'X';
    if (m != null && Math.abs(m - dy) <= tol * 10 && dy > dx) return 'Y';
    if (m != null && Math.abs(m - dx) <= 1e-3 * Math.max(1, m)) return 'X';
    if (m != null && Math.abs(m - dy) <= 1e-3 * Math.max(1, m)) return 'Y';
    return 'D';
  }
  function span(d, ax) { return ax === 'X' ? [d.p1[0], d.p2[0]] : [d.p1[1], d.p2[1]]; }

  // tolerance defaults (yellow in the product): end-point match 0.5 in; AGREE max(0.6 in,1%); ROUNDED 6%
  function defaults(unit) { var k = IN[unit || 'in']; return { match: 0.5 * k, agreeAbs: 0.6 * k, agreeRel: 0.01, roundRel: 0.06 }; }

  function classify(measured, number, T) {
    var d = Math.abs(measured - number);
    if (d <= Math.max(T.agreeAbs, T.agreeRel * number)) return 'PAIRED_AGREE';
    if (d <= T.roundRel * number) return 'PAIRED_ROUNDED';
    return 'PAIRED_CONFLICT';
  }

  // length: {id, a:[x,y], b:[x,y], sheet, label?:number, user?:number}  dims: dimsOf(...)  opts: {unit, scale:{sheet:n}, nts:[sheet], tol}
  function pair(lengths, dims, opts) {
    opts = opts || {}; var unit = opts.unit || 'in', T = Object.assign(defaults(unit), opts.tol || {}), scale = opts.scale || {}, nts = {};
    (opts.nts || []).forEach(function (s) { nts[s] = 1; });
    var pre = (dims || []).map(function (d) {
      var ax = dimAxis(d), num = (d.text === '' || d.text == null || d.text === '<>') ? d.measure : parseNumber(d.text, unit);
      return { d: d, ax: ax, num: num, auto: (d.text === '' || d.text == null || d.text === '<>'), raw: d.text };
    });
    var pairs = [], rows = [];
    lengths.forEach(function (L) {
      var measured = hyp(L.a, L.b), cands = [];
      var dx = Math.abs(L.b[0] - L.a[0]), dy = Math.abs(L.b[1] - L.a[1]), lax = dx >= dy * 20 ? 'X' : dy >= dx * 20 ? 'Y' : 'D';
      function add(c) { c.measuredSelf = c.number == null ? null : classify(measured, c.number, T); cands.push(c); }
      if (L.user != null) add({ source: 'user', number: L.user, sheet: L.sheet });
      if (L.label != null) add({ source: 'label', number: L.label, sheet: L.sheet });
      var same = pre.filter(function (p) { return !L.sheet || p.d.sheet === L.sheet || true; });
      // direct dimension: both definition points on the length's end points (either order), or, for an axis-aligned length, the same span along the axis
      same.forEach(function (p) {
        var hit = false;
        if (lax === 'D' || p.ax === 'D') hit = (hyp(p.d.p1, L.a) <= T.match && hyp(p.d.p2, L.b) <= T.match) || (hyp(p.d.p1, L.b) <= T.match && hyp(p.d.p2, L.a) <= T.match);
        else if (p.ax === lax) { var s = span(p.d, lax), l = lax === 'X' ? [L.a[0], L.b[0]] : [L.a[1], L.b[1]];
          hit = (Math.abs(s[0] - l[0]) <= T.match && Math.abs(s[1] - l[1]) <= T.match) || (Math.abs(s[0] - l[1]) <= T.match && Math.abs(s[1] - l[0]) <= T.match); }
        if (hit && p.num != null) add({ source: 'dim', handle: p.d.handle, number: p.num, auto: p.auto, sheet: p.d.sheet, override: !p.auto });
        else if (hit && p.num == null) cands.push({ source: 'dim', handle: p.d.handle, number: null, text: p.raw, sheet: p.d.sheet, unparsed: true });
      });
      // chain: collinear dimensions on the same axis whose spans join end to end from one end of the length to the other
      if (lax !== 'D') {
        var l0 = lax === 'X' ? L.a[0] : L.a[1], l1 = lax === 'X' ? L.b[0] : L.b[1], lo = Math.min(l0, l1), hi = Math.max(l0, l1), sm = same.filter(function (p) { return p.ax === lax && p.num != null; })
          .map(function (p) { var s = span(p.d, lax); return { p: p, lo: Math.min(s[0], s[1]), hi: Math.max(s[0], s[1]) }; }).filter(function (q) { return q.lo >= lo - T.match && q.hi <= hi + T.match && (q.hi - q.lo) < (hi - lo) - T.match; }).sort(function (x, y) { return x.lo - y.lo || x.hi - y.hi; });
        var chain = [], cur = lo, guard = 0;
        while (cur < hi - T.match && guard++ < 1000) { var nx = sm.filter(function (q) { return Math.abs(q.lo - cur) <= T.match; }).sort(function (x, y) { return y.hi - x.hi; })[0]; if (!nx) break; chain.push(nx); cur = nx.hi; }
        if (chain.length > 1 && Math.abs(cur - hi) <= T.match) add({ source: 'chain', handles: chain.map(function (q) { return q.p.d.handle; }), number: chain.reduce(function (s, q) { return s + q.p.num; }, 0), sheet: chain[0].p.d.sheet, override: chain.some(function (q) { return !q.p.auto; }) });
      }
      var allUsable = cands.filter(function (c) { return c.number != null; });
      var usable = allUsable.filter(function (c) { return !nts[c.sheet]; }); if (!usable.length) usable = allUsable;   // NTS numbers only count when nothing scaled states the length
      // distinct numbers (tolerance = AGREE)
      var distinct = []; usable.forEach(function (c) { if (!distinct.some(function (n) { return Math.abs(n - c.number) <= Math.max(T.agreeAbs, T.agreeRel * c.number); })) distinct.push(c.number); });
      var inForce = null, rule = null, open = false, dropped = [];
      if (usable.length === 0) { rule = 'unpaired'; }
      else if (distinct.length === 1) { inForce = usable[0]; rule = 'single'; }
      else {
        var cu = usable.filter(function (c) { return c.source === 'user'; });
        var scaled = usable.filter(function (c) { return !nts[c.sheet]; });
        if (cu.length) { inForce = cu[0]; rule = 'user'; }
        else {
          var known = scaled.filter(function (c) { return scale[c.sheet] != null; }).sort(function (x, y) { return scale[y.sheet] - scale[x.sheet]; });   // opts.scale[sheet] = drawing scale as a ratio (1:50 = 0.02, 1:5 = 0.2): the LARGER ratio is the more specific sheet
          if (known.length > 1 && scale[known[0].sheet] !== scale[known[1].sheet] && !(distinct.length === 1)) { inForce = known[0]; rule = 'larger_scale'; }
          else {
            var good = scaled.filter(function (c) { return c.measuredSelf === 'PAIRED_AGREE' || c.measuredSelf === 'PAIRED_ROUNDED'; });
            var bad = scaled.filter(function (c) { return good.indexOf(c) < 0; });
            var gd = []; good.forEach(function (c) { if (!gd.some(function (n) { return Math.abs(n - c.number) <= Math.max(T.agreeAbs, T.agreeRel * c.number); })) gd.push(c.number); });
            if (good.length && bad.length && gd.length === 1 && (good.some(function (c) { return c.source === 'chain' || c.source === 'label' || c.auto; }))) { inForce = good[0]; rule = 'agrees_with_own_measure'; }
            else { open = true; rule = 'open'; }
          }
        }
      }
      var number = inForce ? inForce.number : null, cls;
      if (usable.length === 0) cls = 'UNPAIRED';
      else if (inForce && nts[inForce.sheet]) cls = 'NTS_DETAIL';
      else if (inForce) cls = classify(measured, number, T);
      else cls = 'OPEN';
      var p = { id: L.id, sheet: L.sheet, measured: measured, number: number, class: cls, rule: rule, source: inForce ? inForce.source : null, candidates: cands.map(function (c) { return { source: c.source, number: c.number, sheet: c.sheet, handle: c.handle, handles: c.handles, text: c.text }; }),
        value: number != null ? number : measured, value_is_default: number == null, ratio: number ? +(measured / number).toFixed(4) : null, open: open };
      pairs.push(p);
    });
    // yellow rows: one per distinct (number, class) conflict / open / unpaired kind; repeats collapse
    var seen = {};
    pairs.forEach(function (p) {
      if (p.class === 'PAIRED_CONFLICT' || p.class === 'OPEN' || p.class === 'UNPAIRED') {
        var key = p.class + '|' + (p.number == null ? 'x' : p.number.toFixed(2)) + '|' + (p.class === 'UNPAIRED' ? p.id : p.measured.toFixed(1));
        if (!seen[key]) { seen[key] = { class: p.class, number: p.number, measured: p.measured, ratio: p.ratio, rule: p.rule, ids: [], sheets: {} }; rows.push(seen[key]); }
        seen[key].ids.push(p.id); seen[key].sheets[p.sheet || '?'] = 1;
      }
    });
    rows.forEach(function (r) { r.sheets = Object.keys(r.sheets); });
    var sum = { lengths: pairs.length, agree: 0, rounded: 0, conflict: 0, unpaired: 0, nts: 0, open: 0 };
    pairs.forEach(function (p) { if (p.class === 'PAIRED_AGREE') sum.agree++; else if (p.class === 'PAIRED_ROUNDED') sum.rounded++; else if (p.class === 'PAIRED_CONFLICT') sum.conflict++; else if (p.class === 'UNPAIRED') sum.unpaired++; else if (p.class === 'NTS_DETAIL') sum.nts++; else sum.open++; });
    return { pairs: pairs, rows: rows, summary: sum, log: '§PAIR lengths=' + sum.lengths + ' agree=' + sum.agree + ' rounded=' + sum.rounded + ' conflict=' + sum.conflict + ' unpaired=' + sum.unpaired + ' nts=' + sum.nts + ' open=' + sum.open };
  }


  // ---- label source (§L10 slice 2): legend "C-1 = 12"x12"" + instance marks "C-1" near each body ----
  var MARK = /^[A-Z]{1,3}-?\d+$/;
  // drafting convention for a mark's prefix (a YELLOW default in the product, overridable): GB before B, longest prefix wins
  var MARK_KIND = { GB: 'gradebeam', C: 'column', F: 'footing', B: 'beam', W: 'window', D: 'door' };
  function kindOfMark(m, table) { var t = table || MARK_KIND, pre = /^[A-Z]+/.exec(m)[0]; while (pre) { if (t[pre]) return t[pre]; pre = pre.slice(0, -1); } return null; }
  var LEG = /^([A-Z]{1,3}-?\d+)\s*=\s*(.+)$/;
  function legendOf(entities, unit) {   // -> { mark: { nums:[sizes in sheet units], text } }; "x", "X" or the multiplication sign separates
    var out = {};
    (entities || []).forEach(function (e) {
      if (e.type !== 'TEXT' && e.type !== 'MTEXT') return;
      var m = LEG.exec(clean(e.text)); if (!m) return;
      var parts = m[2].split(/\s*[xX×]\s*/).map(function (t) { return parseNumber(t, unit); });
      if (parts.length >= 2 && parts.every(function (v) { return v != null; })) out[m[1]] = { nums: parts, text: clean(e.text) };
    });
    return out;
  }
  function markPoints(entities, legend) {   // instance marks: text that is exactly a legend mark
    var pts = [];
    (entities || []).forEach(function (e) {
      if (e.type !== 'TEXT' && e.type !== 'MTEXT') return;
      var t = clean(e.text); if (!MARK.test(t) || !legend[t]) return;
      var p = e.startPoint || e.position || e.anchorPoint; if (p) pts.push({ mark: t, p: [p.x, p.y] });
    });
    return pts;
  }
  // rects: [{id, sheet, pts:[[x,y]x4]}]; each gets the unambiguous nearest instance mark within radius; its legend sizes label the 4 sides (larger number <-> longer side pair)
  function labelRects(rects, marks, legend, opts) {
    opts = opts || {}; var out = [], notes = [];
    // default search radius: half the pitch to the nearest same-kind neighbour (a mark cannot belong to a body closer to another), never less than 3x the body
    var cen = function (r) { var xs = r.pts.map(function (q) { return q[0]; }), ys = r.pts.map(function (q) { return q[1]; }); return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2]; };
    var cs = rects.map(cen);
    rects.forEach(function (r, ri) {
      var nn = Infinity; rects.forEach(function (o, oi) { if (oi !== ri && (o.kind || '') === (r.kind || '')) { var dd = hyp(cs[ri], cs[oi]); if (dd > 0 && dd < nn) nn = dd; } });
      var xs = r.pts.map(function (q) { return q[0]; }), ys = r.pts.map(function (q) { return q[1]; }), c = [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2];
      var ext = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys)), rad = opts.radius || Math.max(ext * 3, nn === Infinity ? 0 : nn / 2, 1);
      var near = marks.filter(function (m) { var k = kindOfMark(m.mark, opts.markKind); return !r.kind || !k || k === r.kind; }).map(function (m) { return { m: m, d: hyp(c, m.p) }; }).filter(function (x) { return x.d <= rad; }).sort(function (a, b) { return a.d - b.d; });
      var mark = null, why = null;
      if (!near.length) why = 'no_mark_in_range';
      else if (near.length > 1 && near[1].m.mark !== near[0].m.mark && near[1].d < near[0].d * 1.5) why = 'ambiguous_mark:' + near[0].m.mark + '/' + near[1].m.mark;
      else mark = near[0].m.mark;
      var sides = [0, 1, 2, 3].map(function (i) { return { a: r.pts[i], b: r.pts[(i + 1) % 4] }; }), lab = [null, null, null, null];
      if (mark) {
        var n = legend[mark].nums.slice(0, 2), l0 = hyp(sides[0].a, sides[0].b), l1 = hyp(sides[1].a, sides[1].b);
        var keep = Math.abs(l0 - n[0]) + Math.abs(l1 - n[1]), swap = Math.abs(l0 - n[1]) + Math.abs(l1 - n[0]);   // the legend does not say which number is which side: take the assignment that fits the drawing best (reported as the pair's measured vs number)
        var a0 = keep <= swap + 1e-9 ? n[0] : n[1], a1 = keep <= swap + 1e-9 ? n[1] : n[0];
        lab[0] = lab[2] = a0; lab[1] = lab[3] = a1;
      } else notes.push({ id: r.id, code: 'GAP:label_' + why });
      sides.forEach(function (sd, i) { out.push({ id: r.id + ':' + i, a: sd.a, b: sd.b, sheet: r.sheet, label: lab[i], mark: mark }); });
    });
    var byRect = {}; out.forEach(function (l) { byRect[l.id.replace(/:\d$/, '')] = l.mark; });
    return { lengths: out, notes: notes, marks: byRect };
  }
  function centreOf(r) { var xs = r.pts.map(function (q) { return q[0]; }), ys = r.pts.map(function (q) { return q[1]; }); return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2]; }
  // Two sheets draw the same members at different origins (one model space, several frames). Best-effort translation: vote over all centre differences of equal kind, keep the winner
  // when it explains at least half of the smaller set; every other member is reported unmatched. Deterministic (ties: lexicographically smallest translation).
  function matchByTranslation(targets, sources, tol) {
    tol = tol == null ? 1 : tol; var votes = {};
    targets.forEach(function (t, ti) { var ct = centreOf(t); sources.forEach(function (s2) { if ((t.kind || '') !== (s2.kind || '')) return; var cs = centreOf(s2), dx = cs[0] - ct[0], dy = cs[1] - ct[1], k = Math.round(dx / tol) + ',' + Math.round(dy / tol); (votes[k] = votes[k] || { n: 0, dx: dx, dy: dy }).n++; }); });
    var best = null; Object.keys(votes).sort().forEach(function (k) { if (!best || votes[k].n > best.n) best = votes[k]; });
    if (!best) return { matched: {}, votes: 0, dx: 0, dy: 0, ok: false };
    var matched = {}, used = {};
    targets.forEach(function (t) { var ct = centreOf(t), hit = null, hd = Infinity;
      sources.forEach(function (s2, si) { if ((t.kind || '') !== (s2.kind || '') || used[si]) return; var cs = centreOf(s2), d = Math.hypot(cs[0] - ct[0] - best.dx, cs[1] - ct[1] - best.dy); if (d <= tol * 1.5 && d < hd) { hd = d; hit = si; } });
      if (hit != null) { used[hit] = 1; matched[t.id] = sources[hit].id; } });
    var n = Object.keys(matched).length, ok = n >= 0.5 * Math.min(targets.length, sources.length) && n > 0;
    return { matched: ok ? matched : {}, votes: n, dx: best.dx, dy: best.dy, ok: ok };
  }
  // targets that have no instance mark inherit the mark of the matched source member (another sheet); the labelled lengths say so (via)
  function inheritLabels(targets, sources, sourceMarks, legend, tol) {
    var m = matchByTranslation(targets, sources, tol), out = [], notes = [];
    targets.forEach(function (t) {
      var mark = m.matched[t.id] ? sourceMarks[m.matched[t.id]] : null;
      if (!mark) { notes.push({ id: t.id, code: m.ok ? 'GAP:label_no_match' : 'GAP:label_sheets_not_alignable' }); }
      var one = labelRects([t], mark ? [{ mark: mark, p: centreOf(t) }] : [], legend, { radius: 1 });
      one.lengths.forEach(function (l) { l.via = mark ? m.matched[t.id] : null; out.push(l); });
    });
    return { lengths: out, notes: notes, match: m };
  }

  // ---- dimension audit (§L10.8): every typed override against the dimension's OWN measured length ----
  // dims: dimsOf(...). Auto-measured dimensions agree by construction and are only counted. An override that parses as a length is classed AGREE / ROUNDED / CONFLICT (ratio = measured / stated);
  // one that does not parse (L/5, "ld", notes) is NOT_A_LENGTH, never guessed. Repeats collapse to one row per (text, measured). NTS sheets (opts.nts) are listed but not called conflicts.
  function auditDims(dims, opts) {
    opts = opts || {}; var unit = opts.unit || 'in', T = Object.assign(defaults(unit), opts.tol || {}), nts = {}, byKey = {}, rows = [], c = { auto: 0, agree: 0, rounded: 0, conflict: 0, not_a_length: 0, nts: 0 };
    (opts.nts || []).forEach(function (sn) { nts[sn] = 1; });
    (dims || []).forEach(function (d) {
      var t = d.text; if (t === '' || t == null || t === '<>') { c.auto++; return; }
      var n = parseNumber(t, unit), meas = d.measure, cls;
      if (n == null) cls = 'NOT_A_LENGTH'; else if (meas == null) cls = 'NO_MEASURE'; else cls = classify(meas, n, T);
      if (nts[d.sheet]) { c.nts++; cls = 'NTS_DETAIL'; }
      else if (cls === 'PAIRED_AGREE') c.agree++; else if (cls === 'PAIRED_ROUNDED') c.rounded++; else if (cls === 'PAIRED_CONFLICT') c.conflict++; else c.not_a_length++;
      if (cls === 'PAIRED_AGREE') return;
      var key = cls + '|' + clean(t) + '|' + (meas == null ? '' : meas.toFixed(1));
      if (!byKey[key]) { byKey[key] = { class: cls, text: clean(t), stated: n, measured: meas, ratio: n && meas ? +(meas / n).toFixed(4) : null, handles: [], sheets: {} }; rows.push(byKey[key]); }
      byKey[key].handles.push(d.handle); byKey[key].sheets[d.sheet || '?'] = 1;
    });
    rows.forEach(function (r) { r.sheets = Object.keys(r.sheets); });
    return { rows: rows, counts: c, log: '§DIMAUDIT auto=' + c.auto + ' agree=' + c.agree + ' rounded=' + c.rounded + ' conflict=' + c.conflict + ' not_a_length=' + c.not_a_length + ' nts=' + c.nts + ' rows=' + rows.length };
  }

  // Best-effort side alignment (§L10 4a). a,b = end points along 1D axis coordinates; pinA/pinB = the side is fixed by grid/datum/neighbour.
  function align(a, b, number, pinA, pinB, tol) {
    tol = tol == null ? 1e-9 : tol; var dir = b >= a ? 1 : -1, len = Math.abs(b - a), res = len - number;
    if (pinA && pinB) return { a: a, b: b, residual: res, code: Math.abs(res) <= tol ? 'OK' : 'ALIGN:overconstrained' };
    if (pinA) return { a: a, b: a + dir * number, residual: 0, code: 'OK' };
    if (pinB) return { a: b - dir * number, b: b, residual: 0, code: 'OK' };
    var c = (a + b) / 2; return { a: c - dir * number / 2, b: c + dir * number / 2, residual: 0, code: 'ALIGN:floating' };
  }
  return { auditDims: auditDims, matchByTranslation: matchByTranslation, inheritLabels: inheritLabels, legendOf: legendOf, markPoints: markPoints, labelRects: labelRects, parseNumber: parseNumber, dimsOf: dimsOf, pair: pair, align: align, defaults: defaults };
});
