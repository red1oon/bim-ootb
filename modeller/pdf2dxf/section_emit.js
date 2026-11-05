// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 — port of scripts/pdf2bim/section_emit.py (§29: the floor build-up read from the two sections on the sections page, the cut from the plan's section markers; writes the importer's SECTION sheet, or nothing). Pure; UMD: window.Pdf2DxfSection.
// run(model, R, inferred) -> {sheet: text|null, log}
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./py_rt.js'), require('./type_template.js')); else root.Pdf2DxfSection = factory(root.Pdf2DxfRt, root.Pdf2DxfTT); })(typeof self !== 'undefined' ? self : this, function (RT, TT) {
  'use strict';
  const { I, T: Tp, pyRound, pyRoundInt, hypot, dist, pySum, fixed } = RT; const S = RT.str;
  function paths(page) { // this stage's parse: every number of d, pairwise (control points included); colour from the stroke
    return page.paths.map(p => {
      const col = p.col !== null && p.col !== undefined ? (p.col.match(/[\d.]+/g) || []).map(parseFloat) : [0, 0, 0]; const M = p.m; const n = (p.d.match(/-?[\d.]+/g) || []).map(parseFloat); const pts = [];
      for (let i = 0; i < n.length - 1; i += 2) pts.push([M[0] * n[i] + M[2] * n[i + 1] + M[4], M[1] * n[i] + M[3] * n[i + 1] + M[5]]);
      return [col, p.d.indexOf('C') >= 0, pts];
    });
  }
  function circles(P, W, rmin, rmax) {
    const o = [];
    for (const [, cv, pts] of P) {
      if (!cv || pts.length < 4 || dist(pts[0], pts[pts.length - 1]) >= 0.3) continue;
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); const r = (Math.max(...xs) - Math.min(...xs)) / 2;
      if (Math.abs((Math.max(...xs) - Math.min(...xs)) - (Math.max(...ys) - Math.min(...ys))) < 0.3 && rmin <= r && r <= rmax) { const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; for (const w of W) if (hypot(w[1] - c[0], w[2] - c[1]) <= r) o.push([w[0], c[0], c[1], r]); }
    }
    return o;
  }
  function run(model, R, Iv) {
    const L = []; const lg = (...a) => L.push(['§PDF'].concat(a.map(RT.str)).join(' ')); const pr = s => L.push(s);
    const FG = Iv.values.ffl_above_ground.value, BH = Iv.values.beam_above_ffl.value; const K = R.sheet.mm_per_pt_fitted; const DEPTH = R.floor_buildup.depth_mm; const TOL = I(10);
    const Sh = Iv.template.sheets; const gx = R.grid.x, gy = R.grid.y;
    const P6 = paths(model.pages[String(Sh.sections)]); const W6 = TT.words(model.pages[String(Sh.sections)]); const [BR, MR] = TT.radii(Iv.template, K); const B6 = circles(P6, W6, BR[0], BR[1]);
    const mkb = has => { const m = new Map(); for (const [k, x, y] of B6) if (has.has(k)) m.set(k, [x, y]); return m; };
    const sections = new Map([['A-A', mkb(gx)], ['B-B', mkb(gy)]]); const res = new Map();
    for (const [name, bub] of sections) {
      if (bub.size < 2) { lg('W-C5', name, 'VACUOUS: grid bubbles read', I(bub.size)); continue; }
      const ys = [...bub.values()].map(v => v[1]), xs = [...bub.values()].map(v => v[0]); const yb = Math.max(...ys); const lv = new Map(), ch = new Map(); const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
      for (const [col, cv, pts] of P6) {
        if (cv) continue; const chromatic = Math.max(...col) - Math.min(...col) > 20;
        for (let i = 0; i + 1 < pts.length; i++) { const p = pts[i], q = pts[i + 1]; if (Math.abs(p[1] - q[1]) < 0.1 && Math.abs(p[0] - q[0]) > 0.3 && yb < p[1] && p[1] < yb + 9300 / K) push(chromatic ? ch : lv, pyRound(p[1], 1), [Math.min(p[0], q[0]), Math.max(p[0], q[0])]); }
      }
      const levels = [...lv].filter(([, s_]) => pySum(s_.map(([a, b]) => b - a)) * K >= 0.5 * (Math.max(...xs) - Math.min(...xs)) * K && Math.min(...s_.map(q => q[0])) < Math.min(...xs) - 10 && Math.max(...s_.map(q => q[1])) > Math.max(...xs) + 10).map(q => q[0]).sort((a, b) => a - b);
      if (ch.size) {
        let ym = null, bn = -1; for (const [y, l] of ch) if (l.length > bn) { bn = l.length; ym = y; } const above = levels.filter(y => y < ym - 0.5);
        if (!above.length) { lg('W-C5', name, 'VACUOUS: no level line above the membrane; rows', levels); continue; }
        const yf = Math.max(...above); const d = (ym - yf) * K; const ok = Math.abs(d - DEPTH) <= TOL;
        const rec = { ok, d, yf, ym, x: [Math.min(...ch.get(ym).map(q => q[0])), Math.max(...ch.get(ym).map(q => q[1]))], bub }; res.set(name, rec);
        lg('W-C5', name, 'FFL level line y', yf, 'membrane y', ym, 'dashes', I(ch.get(ym).length), 'x', pyRound(rec.x[0], 1), pyRound(rec.x[1], 1), 'depth mm', pyRound(d, 1), 'vs drawn', DEPTH, ok ? 'PASS' : 'WRONG');
        pr('§INFER floor_buildup ' + (ok ? 'READ' : 'FINDING') + ' value ' + S(DEPTH) + ' measured ' + fixed(d, 1) + ' nominal ' + S(DEPTH) + ' tol ' + S(TOL) + ' | ' + name + ' membrane');
      } else { // §40: this hand draws no membrane. FFL = the level line that many mm above the next one (the ground); the build-up is the template's, stated
        const cand = []; for (let i = 0; i + 1 < levels.length; i++) if (Math.abs((levels[i + 1] - levels[i]) * K - FG) <= 15) cand.push(levels[i]);
        if (!cand.length) { lg('W-C5', name, 'VACUOUS: no chromatic line and no floor/ground level pair; rows', levels); continue; }
        const yf = cand[cand.length - 1]; res.set(name, { ok: true, d: DEPTH, yf, ym: yf + DEPTH / K, x: [Math.min(...xs), Math.max(...xs)], bub });
        pr('§INFER floor_buildup DEFAULT value ' + S(DEPTH) + ' measured None nominal ' + S(DEPTH) + ' tol ' + S(TOL) + ' | ' + name + ': no membrane drawn, YELLOW'); lg('W-C5', name, 'FFL level line y', yf, 'no membrane drawn: build-up DEFAULT', DEPTH);
      }
    }
    if (res.size < 2 || ![...res.values()].every(v => v.ok)) { lg('W-C5 RESULT no section sheet written: the two sections do not both state the build-up (slab_no_underside stays stated)'); return { sheet: null, log: L }; }
    // the cut: the plan's section marker bubbles (radius below the grid bubbles'), the label on both ends of one horizontal line; anchored as emit_dxf_p1 anchors the plan
    const pg1 = model.pages[String(Sh.plan)]; const P1 = paths(pg1); const W1 = TT.words(pg1); const M1 = circles(P1, W1, MR[0], MR[1]).filter(c => c[0] === 'A');
    const y5 = TT.left_col(W1, gy).get('5')[2]; const cb = circles(P1, W1, BR[0], BR[1]).filter(q => q[0] === '5'); const y0 = cb.length ? cb[0][2] : y5;
    if (M1.length !== 2 || Math.abs(M1[0][2] - M1[1][2]) > 0.1) { lg('W-C5 RESULT no section sheet written: section marker A not found on both ends', M1.map(q => Tp(...q))); return { sheet: null, log: L }; }
    const cut = I(pyRoundInt(-(M1[0][2] - y0) * K)); const A = res.get('A-A'); const xA = A.bub.get('A')[0]; const hmin = pyRound((A.x[0] - xA) * K, 1), hmax = pyRound((A.x[1] - xA) * K, 1);
    lg('W-C5 cut from the plan markers: A at', M1.map(m => Tp(pyRound(m[1], 1), pyRound(m[2], 1))), '-> Y', cut, 'mm | grid residuals mm', new Map([...A.bub].map(([k, v]) => [k, pyRound((v[0] - xA) * K - gx.get(k), 1)])), '| slab h', hmin, hmax);
    const tx = (x, y, t) => ['0', 'TEXT', '8', 'DXF2BIM-MARK', '10', S(x), '20', S(y), '30', '0', '40', '150', '1', t + ' @BY=user'];
    let o = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', 'S-SLAB', '90', '4', '70', '1']; for (const [x, y] of [[hmin, I(-DEPTH)], [hmax, I(-DEPTH)], [hmax, I(0)], [hmin, I(0)]]) o.push('10', S(x), '20', S(y));
    const yc = pyRound((A.yf - A.bub.get('A')[1]) * K, 1); let rbm = -Infinity; for (const [k, , , r] of B6) if (A.bub.has(k) && r > rbm) rbm = r; const rb = pyRound(rbm * K, 1);
    for (const [k] of A.bub) { const h = gx.get(k); o = o.concat(['0', 'LINE', '8', 'A-GRID', '10', S(h), '20', S(I(-DEPTH)), '30', '0', '11', S(h), '21', S(yc - rb), '31', '0', '0', 'CIRCLE', '8', 'A-GRID', '10', S(h), '20', S(yc), '30', '0', '40', S(rb), '0', 'TEXT', '8', 'A-GRID', '10', S(h), '20', S(yc), '30', '0', '40', '150', '1', k]); }
    ['@SET=STD', '@VIEW=SECTION', '@NAME=SECTION A-A', '@UNITS=mm', '@HAXIS=+X', '@CUT=Y,' + RT.dfmt(cut)].forEach((m, n) => { o = o.concat(tx(I(-3000), I(-1000 - 300 * n), m)); });
    for (const [k, v] of gx) o = o.concat(tx(v, I(-600), '@GRIDH=' + k));
    const zb = (+FG - +DEPTH) / 1000; for (const [z, y] of [[zb ? zb : I(0), I(-DEPTH)], [+FG / 1000, I(0)], [(+FG + +BH) / 1000, BH]]) o = o.concat(tx(I(-1500), y, '@Z=' + S(z)));
    o = o.concat(['0', 'ENDSEC', '0', 'EOF']);
    lg('W-C5 RESULT wrote section_aa.dxf S-SLAB top z', +FG / 1000, 'bottom z', zb, '(floor build-up, YELLOW: dictionary floor_buildup)');
    return { sheet: o.join('\n') + '\n', log: L };
  }
  return { run };
});
