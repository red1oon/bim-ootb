// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 — port of scripts/pdf2bim/type_template.py (§33 ruler template: the fill rule and what several stages share). Pure; no fs. UMD: window.Pdf2DxfTT.
// A page is model.pages[n] = {paths:[{d,m,sw,col}], words:[[text,xMin,yMin,xMax,yMax]]} as dump_sheet_model.py writes it.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./py_rt.js')); else root.Pdf2DxfTT = factory(root.Pdf2DxfRt); })(typeof self !== 'undefined' ? self : this, function (RT) {
  'use strict';
  const { I, rnd, pyRound, hypot, dist, T: Tp } = RT;
  const RE_TOK = /[MLCZ]|-?[\d.]+/g;
  function decide(L, name, measured, blank, where, module) {
    // §33 fill rule. Within tolerance = READ, the nominal; outside = FINDING, the measured value (the sheet wins); nothing measured = DEFAULT, the nominal, stated.
    const n = blank.nominal, tol = blank.tol_mm; let rec;
    if (measured === null || measured === undefined) rec = { value: n, status: 'DEFAULT', measured: null };
    else if (Math.abs(measured - n) <= tol) rec = { value: n, status: 'READ', measured: rnd(measured, 1) };
    else {
      const mod = module || blank.module_mm;
      rec = { value: mod ? I(RT.pyRoundInt(measured / mod) * mod) : rnd(measured), status: 'FINDING', measured: rnd(measured, 1) };
    }
    L.push(RT.str('§INFER') + ' ' + [name, rec.status, 'value', rec.value, 'measured', rec.measured, 'nominal', n, 'tol', tol, '|', where].map(RT.str).join(' '));
    return rec;
  }
  function radii(Tm, K) {
    const b = Tm.ruler.bubble_radius_mm, s = Tm.ruler.section_marker_radius_mm;
    return [[b[0] / K, b[1] / K], [s[0] / K, s[1] / K]];
  }
  function words(page) { return page.words.map(w => [w[0], (w[1] + w[3]) / 2, (w[2] + w[4]) / 2]); }
  function _line(W, labels, ax) {
    // the words on one line of the sheet holding the most distinct labels (ties: nearest the page's edge)
    let best = null;
    for (const w of W) {
      if (!labels.has(w[0])) continue;
      const g = W.filter(q => labels.has(q[0]) && Math.abs(q[ax] - w[ax]) <= 2); const n = new Set(g.map(q => q[0])).size;
      if (best === null || n > best[0] || (n === best[0] && w[ax] < best[1])) best = [n, w[ax], g];
    }
    const o = new Map(); if (best === null) return o;
    const srt = best[2].map((q, i) => [q, i]).sort((a, b) => (Math.abs(b[0][ax] - best[1]) - Math.abs(a[0][ax] - best[1])) || (a[1] - b[1]));
    for (const [q] of srt) o.set(q[0], q);
    return o;
  }
  const top_row = (W, gx) => _line(W, new Set(gx.keys()), 2);
  const left_col = (W, gy) => _line(W, new Set(gy.keys()), 1);
  function plan_frame(W, R, Tm) {
    const K = R.sheet.mm_per_pt_fitted; const gx = R.grid.x, gy = R.grid.y; const m = Tm.ruler.plan_frame_margin_mm / K;
    const xs = [...top_row(W, gx).values()].map(w => w[1]), ys = [...left_col(W, gy).values()].map(w => w[2]);
    return [Math.min(...xs) - m, Math.max(...xs) + m, Math.min(...ys) - m, Math.max(...ys) + m];
  }
  const is_wall_pen = (p, Tm, K) => Math.abs(p * K - Tm.ruler.wall_pen_mm) <= 1.5;
  const pen = (sw, M) => pyRound(sw * hypot(M[0], M[1]), 3);
  // ---- room tags (§36)
  function stroked_paths(page) {
    const o = [];
    for (const p of page.paths) {
      const M = p.m; const tk = p.d.match(RE_TOK) || []; const pts = []; let i = 0, c = null;
      while (i < tk.length) {
        if ('MLCZ'.indexOf(tk[i]) >= 0 && tk[i].length === 1) { c = tk[i]; i++; continue; }
        const n = c === 'C' ? 3 : 1; const x = parseFloat(tk[i + 2 * n - 2]), y = parseFloat(tk[i + 2 * n - 1]); i += 2 * n; pts.push([M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]);
      }
      if (pts.length) { const X = pts.map(q => q[0]), Y = pts.map(q => q[1]); o.push({ pts, pen: p.sw !== null && p.sw !== undefined ? pen(p.sw, M) : I(1), x0: Math.min(...X), x1: Math.max(...X), y0: Math.min(...Y), y1: Math.max(...Y) }); }
    }
    return o;
  }
  function room_tags(P, Tm, K, frame) {
    const RTg = Tm.ruler.room_tag; const [bw, bh] = RTg.box_mm; const tol = RTg.box_tol, hair = RTg.hair_pen_mm_max; const o = [];
    for (const b of P) {
      if (b.pts.length !== 5 || dist(b.pts[0], b.pts[4]) >= 0.05 || b.pen * K > hair) continue;
      if (Math.abs((b.x1 - b.x0) * K - bw) > tol * bw || Math.abs((b.y1 - b.y0) * K - bh) > tol * bh) continue;
      if (frame && !(frame[0] <= b.x0 && b.x1 <= frame[1] && frame[2] <= b.y0 && b.y1 <= frame[3])) continue;
      const d = P.filter(q => q.pts.length === 2 && q.pen * K <= hair && q.x1 - q.x0 < 0.02 && b.x0 < q.x0 && q.x0 < b.x1 && q.y0 <= b.y0 + 0.5 && q.y1 >= b.y1 - 0.5);
      o.push({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, xm: d.length ? d[0].x0 : null });
    }
    return o.sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
  }
  function cell_ink(P, cell, Tm, K, step) {
    step = step === undefined ? 0.06 : step; const [a, b_, c, d] = cell; const [lo, hi] = Tm.ruler.room_tag.ink_pen_mm; const o = [];
    for (const p of P) {
      if (!(lo <= p.pen * K && p.pen * K <= hi) || p.x1 < a || p.x0 > b_ || p.y1 < c || p.y0 > d) continue;
      for (let k = 0; k + 1 < p.pts.length; k++) {
        const u = p.pts[k], v = p.pts[k + 1]; const n = Math.max(1, Math.trunc(dist(u, v) / step));
        for (let i = 0; i <= n; i++) { const x = u[0] + (v[0] - u[0]) * i / n, y = u[1] + (v[1] - u[1]) * i / n; if (a <= x && x <= b_ && c <= y && y <= d) o.push([(x - a) * K, (y - c) * K]); }
      }
    }
    return o;
  }
  function plan_origin(model, R, Tm) { const W = words(model.pages[String(Tm.sheets.plan)]); return [top_row(W, R.grid.x).get('A')[1], left_col(W, R.grid.y).get('5')[2]]; }
  function room_extent(r, R) {
    const gx = R.grid.x, gy = R.grid.y;
    return [('x' in r) ? [gx.get(r.x[0]), gx.get(r.x[1])] : null, [gy.get(r.y[0]), gy.get(r.y[1])]];
  }
  function assign_tags(B, R, xa, y5, K) {
    const o = new Map(R.rooms.map(r => [r.name, []])); const stray = [];
    for (const b of B) {
      const cx = ((b.x0 + b.x1) / 2 - xa) * K, cy = ((b.y0 + b.y1) / 2 - y5) * K; b.cx = cx; b.cy = cy; const hit = [];
      for (const r of R.rooms) { const [ex, ey] = room_extent(r, R); if ((ex === null || (ex[0] <= cx && cx <= ex[1])) && ey[0] <= cy && cy <= ey[1]) hit.push(r.name); }
      if (hit.length) for (const n of hit) o.get(n).push(b); else stray.push(b);
    }
    return [o, stray];
  }
  const area_cell = b => [b.xm, b.x1, b.y0, (b.y0 + b.y1) / 2];
  function load_glyphs(Tm, glyphs, drop) {
    const g = typeof glyphs === 'string' ? RT.parseJSON(glyphs) : glyphs; const out = new Map();
    for (const c of Object.keys(g.samples)) out.set(c, g.samples[c].filter(s => s.tag !== drop).map(s => s.pts.map(p => [+p[0], +p[1]])));
    return out;
  }
  function porch_width(emitLines) {
    const txt = emitLines.join('\n'); const re = /W-C4 column rect .*? centre \((-?[\d.]+), -?[\d.]+\)/g; const c = []; let m;
    while ((m = re.exec(txt)) !== null) c.push(parseFloat(m[1]));
    return c.length === 2 ? Math.abs(c[1] - c[0]) : null;
  }
  // ---- a drafter's style (§40)
  function closed_rects(P, frame) { return P.filter(q => q.pts.length === 5 && dist(q.pts[0], q.pts[4]) < 0.05 && (!frame || (frame[0] <= q.x0 && q.x1 <= frame[1] && frame[2] <= q.y0 && q.y1 <= frame[3]))); }
  function window_symbols(P, Tm, K, frame, wall) {
    const [ms, ml] = Tm.ruler.window_module_mm; const pitch = Tm.ruler.window_module_pitch_mm; let mods = []; let frames = []; const seen = new Set();
    for (const q of closed_rects(P, frame)) {
      const w = (q.x1 - q.x0) * K, h = (q.y1 - q.y0) * K; const [a, b] = [w, h].sort((x, y) => x - y); const o = w > h ? 'H' : 'V';
      const c = [o, pyRound((q.x0 + q.x1) / 2, 1), pyRound((q.y0 + q.y1) / 2, 1), RT.pyRoundInt(Math.max(w, h))]; const key = c.join('|');
      if (seen.has(key)) continue; seen.add(key);
      if (Math.abs(a - ms) <= 15 && Math.abs(b - ml) <= 25) mods.push(c);
      else if (Math.abs(a - wall) <= 0.15 * wall && 300 <= b && b <= 3500) frames.push(c);
    }
    if (mods.length) frames = [];
    const nm = mods.length, nf = frames.length; const out = []; const sm = RT.sortedT(mods), sf = RT.sortedT(frames);
    for (const o_ of ['H', 'V']) {
      const g = new Map();
      for (const [oo, x, y] of sm) if (oo === o_) { const k = RT.pyRoundInt(o_ === 'H' ? y : x); if (!g.has(k)) g.set(k, []); g.get(k).push([o_ === 'H' ? x : y, o_ === 'H' ? y : x]); }
      for (const v of g.values()) {
        v.sort(RT.cmpT); let cur = [v[0]];
        for (const a of v.slice(1)) {
          if (Math.abs((a[0] - cur[cur.length - 1][0]) * K - pitch) <= 0.1 * pitch) cur.push(a);
          else { out.push([o_, cur[0][1], cur[0][0] - pitch / 2 / K, cur[cur.length - 1][0] + pitch / 2 / K]); cur = [a]; }
        }
        out.push([o_, cur[0][1], cur[0][0] - pitch / 2 / K, cur[cur.length - 1][0] + pitch / 2 / K]);
      }
      for (const [oo, x, y, L] of sf) if (oo === o_) out.push([o_, o_ === 'H' ? y : x, (o_ === 'H' ? x : y) - L / 2 / K, (o_ === 'H' ? x : y) + L / 2 / K]);
    }
    return [out, nm, nf];
  }
  function is_column(q, W, Tm, K) {
    const R_ = Tm.ruler; const [a, b] = [(q.x1 - q.x0) * K, (q.y1 - q.y0) * K].sort((x, y) => x - y); const c = R_.column_mm;
    if (!(c.short[0] <= a && a <= c.short[1] && c.long[0] <= b && b <= c.long[1])) return null;
    const tagged = W.some(w => R_.column_tags.indexOf(w[0]) >= 0 && hypot(w[1] - (q.x0 + q.x1) / 2, w[2] - (q.y0 + q.y1) / 2) <= 720 / K);
    return tagged ? true : ((260 <= b && b <= 340) ? false : null);
  }
  return { decide, radii, words, top_row, left_col, plan_frame, is_wall_pen, pen, stroked_paths, room_tags, cell_ink, plan_origin, room_extent, assign_tags, area_cell, load_glyphs, porch_width, closed_rects, window_symbols, is_column, RE_TOK };
});
