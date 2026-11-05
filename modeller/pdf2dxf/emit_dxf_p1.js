// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 — port of scripts/pdf2bim/emit_dxf_p1.py (§20: the plan page -> the extracted plan DXF; walls, window chains, columns, door arcs, tags, bubbles). Pure; UMD: window.Pdf2DxfEmit.
// run(model, R, Tm) -> {dxf, log}. Plain number = Python float, PyInt = Python int (py_rt.js): the DXF text prints them as Python's str() does.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./py_rt.js'), require('./type_template.js')); else root.Pdf2DxfEmit = factory(root.Pdf2DxfRt, root.Pdf2DxfTT); })(typeof self !== 'undefined' ? self : this, function (RT, TT) {
  'use strict';
  const { I, isInt, T: Tp, pyRound, pyRoundInt, rnd, hypot, dist, median, pymod, degrees, radians, cube, pySum } = RT;
  const RE = /[MLC]|-?[\d.]+/g;
  const A = (a, b) => (isInt(a) && isInt(b)) ? I(+a + +b) : (+a + +b); // int + int stays an int
  const pmin = (arr, key) => { let b = arr[0], bk = key ? key(b) : +b; for (let i = 1; i < arr.length; i++) { const k = key ? key(arr[i]) : +arr[i]; if (k < bk) { b = arr[i]; bk = k; } } return b; }; // first extreme, element kept
  const pmax = arr => { let b = arr[0]; for (let i = 1; i < arr.length; i++) if (+arr[i] > +b) b = arr[i]; return b; };
  const bez = (p0, c1, c2, p1, t) => { const u = 1 - t; return [0, 1].map(i => cube(u) * p0[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + cube(t) * p1[i]); };
  const merge = (iv, g) => { g = g === undefined ? 0.02 : g; iv = RT.sortedT(iv); const o = [iv[0].slice()]; for (const [a, b] of iv.slice(1)) { const l = o[o.length - 1]; if (a <= l[1] + g) l[1] = Math.max(l[1], b); else o.push([a, b]); } return o; };
  function run(model, R, Tm) {
    const L = []; const lg = (...a) => L.push(['§PDF'].concat(a.map(RT.str)).join(' '));
    const K = R.sheet.mm_per_pt_fitted; const page = model.pages[String(Tm.sheets.plan)]; const P = [];
    for (const p of page.paths) {
      const M = p.m; const sw = TT.pen(p.sw, M); const tr = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
      const tk = p.d.match(RE) || []; const pts = [], smp = []; let i = 0, c = null;
      while (i < tk.length) {
        if (tk[i] === 'M' || tk[i] === 'L' || tk[i] === 'C') { c = tk[i]; i++; continue; }
        if (c === 'C') { const v = tk.slice(i, i + 6).map(parseFloat); i += 6; const c1 = tr(v[0], v[1]), c2 = tr(v[2], v[3]), e = tr(v[4], v[5]); const s = pts[pts.length - 1]; for (let k = 1; k <= 6; k++) smp.push(bez(s, c1, c2, e, k / 6)); pts.push(e); }
        else { const x = parseFloat(tk[i]), y = parseFloat(tk[i + 1]); i += 2; pts.push(tr(x, y)); smp.push(pts[pts.length - 1]); }
      }
      P.push([sw, pts, smp, p.d.indexOf('C') >= 0]);
    }
    // ---- grid anchors (text layer) + the wall pen's pair centres give the Y bias
    const W = TT.words(page); const [FX0, FX1, FY0, FY1] = TT.plan_frame(W, R, Tm); const IN = (xs, ys) => FX0 <= Math.min(...xs) && Math.max(...xs) <= FX1 && FY0 <= Math.min(...ys) && Math.max(...ys) <= FY1;
    let WH = ('wall_half_mm' in Tm.ruler) ? Tm.ruler.wall_half_mm : I(50); WH = Number.isInteger(+WH) ? I(+WH) : +WH; const PG0 = 2 * WH * 0.7 / K, PG1 = 2 * WH * 1.3 / K; const [BR] = TT.radii(Tm, K); const gx = R.grid.x, gy = R.grid.y;
    let x0 = TT.top_row(W, gx).get('A')[1]; const y5 = TT.left_col(W, gy).get('5')[2];
    const hyS = new Set(); for (const [sw, pts] of P) if (TT.is_wall_pen(sw, Tm, K) && pts.length === 2 && Math.abs(pts[0][1] - pts[1][1]) < 0.25 && Math.abs(pts[0][0] - pts[1][0]) > 30) hyS.add(pyRound((pts[0][1] + pts[1][1]) / 2, 1));
    const hy = [...hyS].sort((a, b) => a - b); const cent = []; for (let i = 0; i + 1 < hy.length; i++) { const a = hy[i], b = hy[i + 1]; if (PG0 <= b - a && b - a <= PG1) cent.push((a + b) / 2); }
    const bias = median(cent.map(c => pmin([...gy.keys()].map(k => c - (y5 + gy.get(k) / K)), v => Math.abs(v))));
    const _c0 = []; for (const [sw, pts, , cv] of P) if (cv && pts.length >= 4 && dist(pts[0], pts[pts.length - 1]) < 0.3) { const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); const r = (Math.max(...xs) - Math.min(...xs)) / 2; if (BR[0] <= r && r <= BR[1]) _c0.push([(Math.min(...xs) + Math.max(...xs)) / 2, r, (Math.min(...ys) + Math.max(...ys)) / 2]); }
    const _wa = TT.top_row(W, gx).get('A'); const _ca = _c0.filter(c => hypot(c[0] - _wa[1], c[2] - _wa[2]) <= c[1]);
    if (_ca.length && Math.abs(_ca[0][0] - x0) > 0.3) { lg('E0 FINDING label A is not centred in its bubble by', pyRound(_ca[0][0] - x0, 2), 'pt: the bubble gives the axis (§40)'); x0 = _ca[0][0]; }
    const y0 = y5 + bias; lg('E0 anchors x0', pyRound(x0, 2), 'y5_label', pyRound(y5, 2), 'Y bias', pyRound(bias, 2), 'pt -> axis5 y', pyRound(y0, 2), 'from', I(cent.length), 'sw3 H pair centres');
    const X = x => pyRound((x - x0) * K, 1), Y = y => pyRound(-(y - y0) * K, 1);
    const E = []; // [layer, type, args]
    // ---- grid
    const xmax = gx.get('E'), ymin = I(-gy.get('1'));
    const circ = []; for (const [sw, pts, , cv] of P) if (cv && pts.length >= 4 && dist(pts[0], pts[pts.length - 1]) < 0.3) { const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys); if (Math.abs(w - h) < 0.3 && BR[0] <= w / 2 && w / 2 <= BR[1]) circ.push([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, w / 2]); }
    const bubble = (label, on_x) => { const want = on_x ? x0 + gx.get(label) / K : y0 + gy.get(label) / K; const c = circ.filter(q => Math.abs((on_x ? q[0] : q[1]) - want) <= 1.5 && W.some(w => w[0] === label && hypot(w[1] - q[0], w[2] - q[1]) <= q[2])); return c.length >= 1 ? pmin(c, q => Math.abs((on_x ? q[0] : q[1]) - want)) : null; };
    let nb = 0; const BUB = new Map();
    for (const k of gx.keys()) { const q = bubble(k, true); if (q) { BUB.set(k, [gx.get(k), Y(q[1]), pyRound(q[2] * K, 1)]); nb++; } }
    for (const k of gy.keys()) { const q = bubble(k, false); if (q) { BUB.set(k, [X(q[0]), I(-gy.get(k)), pyRound(q[2] * K, 1)]); nb++; } }
    lg('W-C3 grid bubbles read', I(nb), 'of', I(gx.size + gy.size), new Map([...BUB].map(([k, v]) => [k, Tp(rnd(v[0]), rnd(v[1]), v[2])])));
    for (const [k, v] of gx) E.push(['PDF-GRID', 'LINE', [v, BUB.has(k) ? BUB.get(k)[1] - BUB.get(k)[2] : I(500), v, A(ymin, I(-500))]]);
    for (const [k, v] of gy) E.push(['PDF-GRID', 'LINE', [BUB.has(k) ? BUB.get(k)[0] + BUB.get(k)[2] : I(-500), I(-v), A(xmax, I(500)), I(-v)]]);
    // ---- window chains (100x500 mm modules at 600 mm pitch): needed first, the walls are CUT at them (standard form: an opening is a GAP in the wall)
    const [wchains] = TT.window_symbols(TT.stroked_paths(page), Tm, K, [FX0, FX1, FY0, FY1], 2 * WH);
    lg('E00 window chains found for wall cutting', I(wchains.length));
    for (const [k, [cx_, cy_, r_]] of BUB) E.push(['PDF-GRID', 'CIRCLE', [cx_, cy_, r_]], ['PDF-GRID', 'TEXT', [cx_, cy_, I(150), k]]);
    // ---- walls: (a) sw3 pairs (b) 100 mm cell runs
    const H = new Map(), V = new Map(); const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    for (const [sw, pts] of P) if (TT.is_wall_pen(sw, Tm, K) && pts.length === 2) {
      const [p, q] = pts;
      if (Math.abs(p[1] - q[1]) <= 0.25 && Math.abs(p[0] - q[0]) > 0.25) push(H, pyRound((p[1] + q[1]) / 2, 1), [Math.min(p[0], q[0]), Math.max(p[0], q[0])]);
      else if (Math.abs(p[0] - q[0]) <= 0.25 && Math.abs(p[1] - q[1]) > 0.25) push(V, pyRound((p[0] + q[0]) / 2, 1), [Math.min(p[1], q[1]), Math.max(p[1], q[1])]);
    }
    const walls = []; // [orient, centre_pt, lo_pt, hi_pt, src]
    for (const [orient, D] of [['H', H], ['V', V]]) {
      const ks = [...D.keys()].sort((a, b) => a - b);
      for (let i = 0; i < ks.length; i++) { const a = ks[i];
        for (let j = i + 1; j < ks.length; j++) { const b = ks[j]; if (b - a > PG1) break; if (b - a < PG0) continue;
          for (const s of merge(D.get(a))) for (const t of merge(D.get(b))) { const lo = Math.max(s[0], t[0]), hi = Math.min(s[1], t[1]); if (hi - lo >= 5) walls.push([orient, (a + b) / 2, lo, hi, 'sw3pair']); } } }
    }
    const n_pair = walls.length; const cells = new Map();
    for (const [sw, pts] of P) if (pts.length === 5 && dist(pts[0], pts[4]) < 0.05) {
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      if (IN(xs, ys) && Math.abs(w * K - 100) <= 12 && Math.abs(h * K - 100) <= 12) cells.set(pyRoundInt((Math.min(...xs) + Math.max(...xs)) / 2 / 0.25) + ',' + pyRoundInt((Math.min(...ys) + Math.max(...ys)) / 2 / 0.25), [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]);
    }
    const C = [...cells.values()]; lg('W-P5b 100 mm cells (deduped by centre)', I(C.length), '(raw count earlier 379+12 incl. nested duplicates)');
    const runs = (C, orient) => {
      const g = new Map(); for (const [x, y] of C) { const k = pyRoundInt((orient === 'H' ? y : x) / 0.4); if (!g.has(k)) g.set(k, []); g.get(k).push(orient === 'H' ? x : y); }
      const out = [];
      for (const [k, v] of g) { v.sort((a, b) => a - b); let cur = [v[0]]; for (const a of v.slice(1)) { if (a - cur[cur.length - 1] <= 3.4) cur.push(a); else { out.push([k * 0.4, cur]); cur = [a]; } } out.push([k * 0.4, cur]); }
      return out.filter(([, v]) => v.length >= 3).map(([c, v]) => [c, v[0] - 1.38, v[v.length - 1] + 1.38, v.length]);
    };
    const rh = runs(C, 'H'), rv = runs(C, 'V'); lg('W-P5b cell runs (>=3 cells) H', I(rh.length), 'V', I(rv.length));
    const AX = new Map(); for (const [k, v] of gx) AX.set('V|' + k, x0 + v / K); for (const [k, v] of gy) AX.set('H|' + k, y0 + v / K);
    const axis = (o, c) => { let bk = null, bp = null, bd = null; for (const [kk, p] of AX) { if (kk[0] !== o) continue; const d = Math.abs(p - c); if (bd === null || d < bd) { bd = d; bk = kk.slice(2); bp = p; } } return [bk, pyRound(c - bp, 2)]; };
    const off_axis = [];
    for (const [o, rr] of [['H', rh], ['V', rv]]) for (const [c, lo, hi, n] of rr) { const [k, d] = axis(o, c); if (Math.abs(d) <= 1.5) walls.push([o, c, lo, hi, 'cells@' + k]); else off_axis.push([o, k, d, I(pyRoundInt((hi - lo) * K)), I(n)]); }
    lg('W-P5b runs on a grid axis (<=1.5pt)', I(walls.length - n_pair), '| off-axis runs (partitions/other)', I(off_axis.length), RT.sortedT(off_axis).slice(0, 12).map(q => Tp(...q)));
    const bymerge = new Map();
    for (const [o, c, lo, hi, src] of walls) { const [k] = axis(o, c); const key = o + '|' + k; if (!bymerge.has(key)) bymerge.set(key, { o, k, iv: [] }); bymerge.get(key).iv.push([lo, hi, src]); }
    const bmSorted = [...bymerge.values()].sort((a, b) => RT.cmpT([a.o, a.k], [b.o, b.k]));
    let nwall = 0, tot = 0;
    for (const { o, k, iv } of bmSorted) {
      const ax = AX.get(o + '|' + k); const cuts = wchains.filter(w => w[0] === o && Math.abs(w[1] - ax) <= 1.6).map(w => [w[2], w[3]]).sort(RT.cmpT); const pieces = [];
      for (const [lo, hi] of merge(iv.map(q => [q[0], q[1]]), 0.8)) {
        let cur = lo;
        for (const [c0, c1] of cuts) { if (c1 <= cur || c0 >= hi) continue; if (c0 > cur) pieces.push([cur, c0]); cur = Math.max(cur, c1); }
        if (hi > cur) pieces.push([cur, hi]);
      }
      for (const [lo, hi] of pieces) {
        const cpt = AX.get(o + '|' + k);
        if (o === 'H') {
          const y = Y(cpt); const vax = [...gx.values()].map(v => x0 + v / K); const gxk = [...gx.keys()];
          const endv = pt => { for (let q = 0; q < gxk.length; q++) { const a = vax[q]; if (Math.abs(pt - a) <= Math.max(2.0, 1.5 * WH / K)) return A(gx.get(gxk[q]), pt > a ? WH : (isInt(WH) ? I(-WH) : -WH)); } return X(pt); };
          const xl = endv(lo), xh = endv(hi); E.push(['PDF-WALL', 'LWPOLYLINE', [[xl, y - WH], [xh, y - WH], [xh, y + WH], [xl, y + WH]]]);
        } else {
          const x = X(cpt); const hax = [...gy.values()].map(v => y0 + v / K); const gyk = [...gy.keys()];
          const endh = pt => { for (let q = 0; q < gyk.length; q++) { const a = hax[q]; if (Math.abs(pt - a) <= Math.max(2.0, 1.5 * WH / K)) return A(I(-gy.get(gyk[q])), pt < a ? WH : (isInt(WH) ? I(-WH) : -WH)); } return Y(pt); };
          const yl = endh(lo), yh = endh(hi); E.push(['PDF-WALL', 'LWPOLYLINE', [[x - WH, yl], [x - WH, yh], [x + WH, yh], [x + WH, yl]]]);
        }
        nwall++; tot += (hi - lo) * K;
      }
    }
    { const srcs = new Map(); for (const w of walls) RT.inc(srcs, w[4].split('@')[0], 1); lg('W-P5b wall runs emitted', I(nwall), 'total centreline length m', pyRound(tot / 1000, 2), 'sources', new Map([...srcs].map(([k, v]) => [k, I(v)]))); }
    // ---- windows: ONE closed rectangle per chain (chain width x wall thickness), standard form; columns (200x300) as before
    let nw = 0, nc = 0;
    for (const [o_, ac, lo, hi] of wchains) {
      const acs = pmin([...AX].filter(([kk]) => kk[0] === o_).map(q => q[1]), p_ => Math.abs(p_ - ac)); let x1, x2, y1, y2;
      if (o_ === 'H') { x1 = X(lo); x2 = X(hi); y1 = Y(acs) + WH; y2 = Y(acs) - WH; } else { x1 = X(acs) - WH; x2 = X(acs) + WH; y1 = Y(lo); y2 = Y(hi); }
      const lay = 'PDF-WINDOW'; E.push([lay, 'LINE', [x1, y1, x2, y1]], [lay, 'LINE', [x2, y1, x2, y2]], [lay, 'LINE', [x2, y2, x1, y2]], [lay, 'LINE', [x1, y2, x1, y1]]); nw++;
    }
    for (const [, pts] of P) if (pts.length === 5 && dist(pts[0], pts[4]) < 0.05) {
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); if (!IN(xs, ys)) continue;
      const nearc = TT.is_column({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }, W, Tm, K);
      if (nearc !== null) {
        const x1 = X(Math.min(...xs)), x2 = X(Math.max(...xs)), y1 = Y(Math.max(...ys)), y2 = Y(Math.min(...ys)); const lay = nearc ? 'PDF-COLUMN' : 'PDF-UNCLASSIFIED'; nc++;
        E.push([lay, 'LWPOLYLINE', [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]]);
        lg(nearc ? 'W-C4 column rect' : 'W-C4 rectangle with no W3 tag, YELLOW, not a column', Tp(x1, y2), Tp(x2, y1), 'centre', Tp(pyRound((x1 + x2) / 2, 1), pyRound((y1 + y2) / 2, 1)));
      }
    }
    lg('E1 window chain rectangles', I(nw), '(from 100x500 modules)', 'column rects (200x300 anywhere in plan, incl. unexplained one)', I(nc));
    // ---- door arcs
    let nd = 0, nfix = 0; const DOORREC = []; const [AS0, AS1] = Tm.ruler.style_search.arc_mm; const SZ = R.schedule_sizes_mm;
    const r1 = x => rnd(x, 1);
    for (const [sw, pts, smp, cv] of P) {
      if (!(cv && pts.length >= 2 && dist(pts[0], pts[pts.length - 1]) > 3)) continue;
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys); const r = Math.max(w, h);
      if (!(IN(xs, ys) && AS0 <= r * K && r * K <= AS1 && Math.abs(w - h) <= 0.08 * r && Math.abs(dist(pts[0], pts[pts.length - 1]) - r * Math.sqrt(2)) <= 0.08 * r)) continue;
      const mnX = Math.min(...xs), mxX = Math.max(...xs), mnY = Math.min(...ys), mxY = Math.max(...ys);
      const cands = [[mnX, mnY], [mnX, mxY], [mxX, mnY], [mxX, mxY]];
      const c = pmin(cands, q => (dist(q, pts[0]) > 0.8 * r && dist(q, pts[pts.length - 1]) > 0.8 * r) ? RT.pstdev(smp.map(s => dist(q, s))) : 9e9);
      const cm = [X(c[0]), Y(c[1])]; let a0 = pymod(degrees(Math.atan2(Y(pts[0][1]) - cm[1], X(pts[0][0]) - cm[0])), 360), a1 = pymod(degrees(Math.atan2(Y(pts[pts.length - 1][1]) - cm[1], X(pts[pts.length - 1][0]) - cm[0])), 360);
      if (Math.abs(pymod(a1 - a0, 360) - 90) > 3) { const t = a0; a0 = a1; a1 = t; }
      const rm = pyRound(r * K, 1);
      let rsch = rm; for (const wv of [SZ.D1[0], SZ.D3[0]]) { if (40 <= +wv - rm && +wv - rm <= 120) { rsch = +wv; break; } }
      const A0 = I(pymod(pyRoundInt(a0 / 90) * 90, 360)), A1 = I(pymod(+A0 + 90, 360)); let [hx0, hy0] = cm; const DA = Tm.ruler.door_arc;
      if (!(DA.radius_mm[0] <= rm && rm <= DA.radius_mm[1] && DA.pen_mm[0] <= sw * K && sw * K <= DA.pen_mm[1])) {
        E.push(['PDF-FIXTURE-ARC', 'ARC', [hx0, hy0, rm, A0, A1]]); nfix++; lg('W-C1 arc r', rm, 'pen mm', pyRound(sw * K, 1), 'at', Tp(...cm), 'is not a door swing: kept on PDF-FIXTURE-ARC, YELLOW (§19), not a door'); continue;
      }
      let rr = null, best = null, hx = hx0, hy = hy0;
      for (const rrv of (rsch !== rm ? [rsch, rm] : [rm])) {
        rr = rrv; hx = hx0; hy = hy0; best = null;
        const WL = []; E.forEach((e, i_) => { if (e[0] === 'PDF-WALL') WL.push([i_, e[2]]); });
        for (const ang of [A0, A1]) {
          const dx = pyRoundInt(Math.cos(radians(+ang))), dy = pyRoundInt(Math.sin(radians(+ang))); const ex = hx + rr * dx, ey = hy + rr * dy;
          for (const [i_, wl] of WL) {
            const xs_ = wl.map(q => q[0]), ys_ = wl.map(q => q[1]); const mnx = pmin(xs_), mny = pmin(ys_), mxx = pmax(xs_), mxy = pmax(ys_); const horiz = (mxx - mnx) > (mxy - mny);
            if (dy === 0 && horiz && +mny - 70 <= hy && hy <= +mxy + 70) {
              const gapd = dx > 0 ? (+mnx - ex) : (ex - +mxx);
              if (-12 <= gapd && gapd <= 130 && (best === null || gapd < best.g)) best = { g: gapd, i: i_, w: [mnx, mny, mxx, mxy], dx, dy, ex, ey, face: pmin([mny, mxy], f_ => Math.abs(f_ - hy)), horiz: true };
            }
            if (dx === 0 && !horiz && +mnx - 70 <= hx && hx <= +mxx + 70) {
              const gapd = dy > 0 ? (+mny - ey) : (ey - +mxy);
              if (-12 <= gapd && gapd <= 130 && (best === null || gapd < best.g)) best = { g: gapd, i: i_, w: [mnx, mny, mxx, mxy], dx, dy, ex, ey, face: pmin([mnx, mxx], f_ => Math.abs(f_ - hx)), horiz: false };
            }
          }
        }
        if (best) break;
      }
      if (best && rr !== rsch) lg('E2r door radius kept as drawn', rr, '(the drawn gap fits only the clear opening; schedule width', rsch, 'would overshoot the wall piece)');
      if (best) {
        const [mnx, mny, mxx, mxy] = best.w; let nh, newp;
        if (best.horiz) { nh = [hx, best.face]; const [nmnx, nmxx] = best.dx > 0 ? [best.ex, mxx] : [mnx, best.ex]; newp = [[nmnx, mny], [nmxx, mny], [nmxx, mxy], [nmnx, mxy]]; }
        else { nh = [best.face, hy]; const [nmny, nmxy] = best.dy > 0 ? [best.ey, mxy] : [mny, best.ey]; newp = [[mnx, nmny], [mxx, nmny], [mxx, nmxy], [mnx, nmxy]]; }
        E[best.i] = ['PDF-WALL', 'LWPOLYLINE', newp.map(q => [r1(q[0]), r1(q[1])])];
        let jamb_done = false;
        const snap = []; E.forEach((e, i_) => { if (e[0] === 'PDF-WALL' && i_ !== best.i) snap.push([i_, e[2]]); });
        for (const [i2, w2] of snap) {
          const xs2 = w2.map(q => q[0]), ys2 = w2.map(q => q[1]); const a2 = pmin(xs2), b2 = pmin(ys2), c2 = pmax(xs2), d2 = pmax(ys2);
          if (best.horiz && Math.abs((+b2 + +d2) / 2 - (+mny + +mxy) / 2) < 1 && (c2 - a2) > (d2 - b2)) {
            const edge = best.dx > 0 ? c2 : a2; const gap_ = best.dx > 0 ? (hx - edge) : (edge - hx);
            if (-12 <= gap_ && gap_ <= 150) { const nn = best.dx > 0 ? [[a2, b2], [hx, b2], [hx, d2], [a2, d2]] : [[hx, b2], [c2, b2], [c2, d2], [hx, d2]]; E[i2] = ['PDF-WALL', 'LWPOLYLINE', nn.map(q => [r1(q[0]), r1(q[1])])]; lg('E2j hinge-side jamb: wall piece extended', pyRound(gap_, 1), 'mm to the hinge'); jamb_done = true; break; }
          }
          if (!best.horiz && Math.abs((+a2 + +c2) / 2 - (+mnx + +mxx) / 2) < 1 && (d2 - b2) > (c2 - a2)) {
            const edge = best.dy > 0 ? d2 : b2; const gap_ = best.dy > 0 ? (hy - edge) : (edge - hy);
            if (-12 <= gap_ && gap_ <= 150) { const nn = best.dy > 0 ? [[a2, b2], [c2, b2], [c2, hy], [a2, hy]] : [[a2, hy], [c2, hy], [c2, d2], [a2, d2]]; E[i2] = ['PDF-WALL', 'LWPOLYLINE', nn.map(q => [r1(q[0]), r1(q[1])])]; lg('E2j hinge-side jamb: wall piece extended', pyRound(gap_, 1), 'mm to the hinge'); jamb_done = true; break; }
          }
        }
        lg('E2s door hinge', Tp(r1(hx), r1(hy)), '->', Tp(r1(nh[0]), r1(nh[1])), '| wall piece edge extended by', pyRound(best.g, 1), 'mm to the closed-leaf end'); hx = nh[0]; hy = nh[1];
        if (!jamb_done) { // hinge side is a perpendicular wall (T junction) <= 150 mm away: a derived pier from that wall face to the hinge, so the gap equals the leaf
          const sn = []; E.forEach((e, i_) => { if (e[0] === 'PDF-WALL') sn.push([i_, e[2]]); });
          for (const [, w3] of sn) {
            const xs3 = w3.map(q => q[0]), ys3 = w3.map(q => q[1]); const a3 = pmin(xs3), b3 = pmin(ys3), c3 = pmax(xs3), d3 = pmax(ys3);
            if (!best.horiz && (c3 - a3) > (d3 - b3) && +a3 - 1 <= +best.w[0] && +best.w[2] <= +c3 + 1) {
              const face = best.dy > 0 ? d3 : b3; const gap3 = best.dy > 0 ? (hy - face) : (face - hy);
              if (0 < gap3 && gap3 <= 150) { const [lo3, hi3] = (+hy <= +face) ? [hy, face] : [face, hy]; E.push(['PDF-WALL', 'LWPOLYLINE', [[best.w[0], lo3], [best.w[2], lo3], [best.w[2], hi3], [best.w[0], hi3]]]); lg('E2k hinge-side pier (T junction) added', pyRound(gap3, 1), 'mm between the wall face and the hinge'); jamb_done = true; break; }
            }
            if (best.horiz && (d3 - b3) > (c3 - a3) && +b3 - 1 <= +best.w[1] && +best.w[3] <= +d3 + 1) {
              const face = best.dx > 0 ? c3 : a3; const gap3 = best.dx > 0 ? (hx - face) : (face - hx);
              if (0 < gap3 && gap3 <= 150) { const [lo3, hi3] = (+hx <= +face) ? [hx, face] : [face, hx]; E.push(['PDF-WALL', 'LWPOLYLINE', [[lo3, best.w[1]], [hi3, best.w[1]], [hi3, best.w[3]], [lo3, best.w[3]]]]); lg('E2k hinge-side pier (T junction) added', pyRound(gap3, 1), 'mm between the wall face and the hinge'); jamb_done = true; break; }
            }
          }
        }
      } else lg('E2s door NOT snapped (no wall piece edge within 130 mm beyond its closed-leaf end)', Tp(r1(hx), r1(hy)), 'r', rr);
      E.push(['PDF-DOOR-SWING', 'ARC', [r1(hx), r1(hy), rr, A0, A1]]); nd++;
      if (best) DOORREC.push([hx, hy, I(best.dx), I(best.dy), best.horiz, best.w]);
    }
    for (let i_ = 0; i_ < DOORREC.length; i_++) for (let j_ = i_ + 1; j_ < DOORREC.length; j_++) {
      const a_ = DOORREC[i_], b_ = DOORREC[j_]; if (a_[4] !== b_[4]) continue;
      if (a_[4]) { // horizontal wall: same hinge y, leaves pointing away from each other, hinges close
        if (Math.abs(a_[1] - b_[1]) <= 1 && +a_[2] === -b_[2] && Math.abs(a_[0] - b_[0]) <= 400 && (a_[0] - b_[0]) * a_[2] > 0) {
          const [lo_, hi_] = (+a_[0] <= +b_[0]) ? [a_[0], b_[0]] : [b_[0], a_[0]]; const t_ = a_[5]; E.push(['PDF-WALL', 'LWPOLYLINE', [[lo_, t_[1]], [hi_, t_[1]], [hi_, t_[3]], [lo_, t_[3]]]]);
          lg('E2p pier between two doors sharing a gap (horizontal wall), x', r1(lo_), '..', r1(hi_), '=', r1(hi_ - lo_), 'mm');
        }
      } else if (Math.abs(a_[0] - b_[0]) <= 1 && +a_[3] === -b_[3] && Math.abs(a_[1] - b_[1]) <= 400 && (a_[1] - b_[1]) * a_[3] > 0) {
        const [lo_, hi_] = (+a_[1] <= +b_[1]) ? [a_[1], b_[1]] : [b_[1], a_[1]]; const t_ = a_[5]; E.push(['PDF-WALL', 'LWPOLYLINE', [[t_[0], lo_], [t_[2], lo_], [t_[2], hi_], [t_[0], hi_]]]);
        lg('E2p pier between two doors sharing a gap (vertical wall), y', r1(lo_), '..', r1(hi_), '=', r1(hi_ - lo_), 'mm');
      }
    }
    lg('E2 door swing arcs emitted', I(nd), '| non-door arcs kept', I(nfix));
    // ---- tags
    let nt = 0; for (const [t, cx, cy] of W) if (/^[DW]\d$/.test(t) && FX0 <= cx && cx <= FX1 && FY0 <= cy && cy <= FY1) { E.push(['PDF-TAG', 'TEXT', [X(cx), Y(cy), I(150), t]]); nt++; }
    lg('E3 tag texts', I(nt));
    // ---- DXF writer (ASCII R12 style) + own round-trip reader
    const Ls = [...new Set(E.map(e => e[0]))].sort();
    const o = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(Ls.length)];
    for (const l of Ls) o.push('0', 'LAYER', '2', l, '70', '0', '62', '7', '6', 'CONTINUOUS');
    o.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
    for (const [lay, ty, a] of E) {
      o.push('0', ty, '8', lay);
      if (ty === 'LINE') o.push('10', a[0], '20', a[1], '30', '0', '11', a[2], '21', a[3], '31', '0');
      else if (ty === 'ARC') o.push('10', a[0], '20', a[1], '30', '0', '40', a[2], '50', a[3], '51', a[4]);
      else if (ty === 'LWPOLYLINE') { o.push('90', I(a.length), '70', I(1)); for (const q of a) o.push('10', q[0], '20', q[1]); }
      else if (ty === 'CIRCLE') o.push('10', a[0], '20', a[1], '30', '0', '40', a[2]);
      else o.push('10', a[0], '20', a[1], '30', '0', '40', a[2], '1', a[3]);
    }
    o.push('0', 'ENDSEC', '0', 'EOF'); const dxf = o.map(RT.str).join('\n') + '\n';
    const rd = dxf.split('\n'); const back = new Map(); let ent = false, ty = null;
    for (let i = 0; i < rd.length - 1; i += 2) {
      const g = rd[i], v = rd[i + 1];
      if (g === '2' && v === 'ENTITIES') ent = true;
      if (ent && g === '0' && ['LINE', 'ARC', 'TEXT', 'LWPOLYLINE', 'CIRCLE'].indexOf(v) >= 0) ty = v;
      if (ent && g === '8') RT.inc(back, v + '\u0000' + ty, 1);
    }
    const want = new Map(); for (const [l, t] of E) RT.inc(want, l + '\u0000' + t, 1);
    const sameMaps = (m1, m2) => m1.size === m2.size && [...m1].every(([k, v]) => m2.get(k) === v);
    const backS = new Map([...back].map(([k, v]) => [k.split('\u0000'), v]).sort((p, q) => RT.cmpT(p[0], q[0])).map(([k, v]) => [Tp(...k), I(v)]));
    { let sw_ = 0; for (const v of want.values()) sw_ += v; let sb_ = 0; for (const v of back.values()) sb_ += v; lg('W-P12 round-trip entities written', I(sw_), 'read back', I(sb_), 'by layer', backS, sameMaps(back, want) ? 'PASS' : 'WRONG'); }
    // ---- W-P13 closure: every gap between consecutive wall runs on one axis should be an opening (door 750/900, window 600/1200/1800, +-60 mm) or a junction (<=100 mm)
    const OW = [600, 750, 900, 1200, 1800]; const unexpl = []; let ng = 0;
    for (const { o: oo, k, iv } of bmSorted) {
      const m = merge(iv.map(q => [q[0], q[1]]), 0.8); const base = oo === 'H' ? x0 : y0;
      lg('W-P13 axis', oo + k, 'runs', I(m.length), 'covered_m', pyRound(pySum(m.map(([a, b]) => b - a)) * K / 1000, 2), 'extent_mm', Tp(I(pyRoundInt((m[0][0] - base) * K)), I(pyRoundInt((m[m.length - 1][1] - base) * K))));
      for (let i = 0; i + 1 < m.length; i++) {
        const b = m[i][1], c = m[i + 1][0]; const g = (c - b) * K; ng++;
        let cls = OW[0], cd = Math.abs(OW[0] - g); for (const wv of OW) { const d = Math.abs(wv - g); if (d < cd) { cd = d; cls = wv; } }
        const ok = Math.abs(cls - g) <= 60 || g <= 100;
        lg('W-P13   gap', I(pyRoundInt(g)), 'mm ->', Math.abs(cls - g) <= 60 ? I(cls) : (g <= 100 ? 'junction' : 'UNEXPLAINED'), ok ? '' : 'YELLOW');
        if (!ok) unexpl.push(Tp(oo + k, I(pyRoundInt(g))));
      }
    }
    lg('W-P13 gaps', I(ng), 'unexplained', I(unexpl.length), unexpl);
    return { dxf, log: L };
  }
  return { run };
});
