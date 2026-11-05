// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 — port of scripts/pdf2bim/infer_type.py (§33: fills the type template's blanks from the sheets; orientation presumed). Pure; UMD: window.Pdf2DxfInfer.
// run(model, R, Tm) -> {inferred:{type_name,template,views,values}, log}
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./py_rt.js'), require('./type_template.js')); else root.Pdf2DxfInfer = factory(root.Pdf2DxfRt, root.Pdf2DxfTT); })(typeof self !== 'undefined' ? self : this, function (RT, TT) {
  'use strict';
  const { I, pyRound, pyRoundInt, hypot, dist, median, degrees } = RT;
  const RE = /[MLC]|-?[\d.]+/g;
  function load(page) { // this stage's own parse of d: no Z, the end point of a curve is the pair at +4
    const o = [];
    for (const p of page.paths) {
      const M = p.m; const tk = p.d.match(RE) || []; const pts = []; let i = 0, c = null;
      while (i < tk.length) {
        if ((tk[i] === 'M' || tk[i] === 'L' || tk[i] === 'C')) { c = tk[i]; i++; continue; }
        const n = c === 'C' ? 3 : 1; const x = parseFloat(tk[i + 2 * (n - 1)]), y = parseFloat(tk[i + 2 * (n - 1) + 1]); i += 2 * n; pts.push([M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]);
      }
      o.push({ pts, curve: p.d.indexOf('C') >= 0, pen: (p.sw !== null && p.sw !== undefined) ? TT.pen(p.sw, M) : null });
    }
    return o;
  }
  function* segs(P, straight) { straight = straight === undefined ? true : straight; for (const p of P) { if (straight && p.curve) continue; for (let i = 0; i + 1 < p.pts.length; i++) yield [p.pts[i], p.pts[i + 1]]; } }
  function circles(P, W, labels, BR) { // grid bubbles: a stroked circle holding a grid label in the text layer -> [word, centre, r]
    const o = [];
    for (const p of P) {
      const pts = p.pts; if (!p.curve || pts.length < 4 || dist(pts[0], pts[pts.length - 1]) >= 0.3) continue;
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); const wd = Math.max(...xs) - Math.min(...xs), ht = Math.max(...ys) - Math.min(...ys);
      if (Math.abs(wd - ht) < 0.4 && BR[0] <= wd / 2 && wd / 2 <= BR[1]) {
        const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
        for (const w of W) if (labels.has(w[0]) && hypot(w[1] - c[0], w[2] - c[1]) <= wd / 2) o.push([w, c, wd / 2]);
      }
    }
    return o;
  }
  function run(model, R, Tm) {
    const L = []; const lg = (...a) => L.push(['§INFER'].concat(a.map(RT.str)).join(' '));
    const K = R.sheet.mm_per_pt_fitted; const gx = R.grid.x, gy = R.grid.y; const B = Tm.blanks; const [BR] = TT.radii(Tm, K); const V = {}; const page = k => model.pages[String(k)];
    lg('type', Tm.type_name, '| orientation presumed, structure preset: only the blanks are read');
    const S = Tm.sheets; const views = {}; for (const k of Object.keys(Tm.views)) if (!k.startsWith('_')) views[k] = Object.assign({}, Tm.views[k]);
    const PG = {}; const dB = [], dG = []; const LS = {}; const SSE = Tm.ruler.style_search; const labelsAll = new Set([...gx.keys(), ...gy.keys()]);
    const sheetsUsed = [...new Set(Object.values(views).map(v => +v.sheet))].sort((a, b) => a - b);
    for (const sh of sheetsUsed) {
      const P = PG[sh] = load(page(sh)); const W = TT.words(page(sh)); const H = new Map();
      for (const p of P) for (let i = 0; i + 1 < p.pts.length; i++) { const a = p.pts[i], b = p.pts[i + 1]; if (Math.abs(a[1] - b[1]) < 0.15 && Math.abs(a[0] - b[0]) > 0) RT.inc(H, pyRound((a[1] + b[1]) / 2, 1), Math.abs(a[0] - b[0])); }
      const Ls = [...H].filter(([y, l]) => l * K >= Tm.ruler.long_line_mm).map(q => q[0]).sort((a, b) => a - b);
      const nb = B.beam_above_ffl.nominal, ng = B.ffl_above_ground.nominal; const cand = [];
      LS[sh] = Ls; const VT = []; for (const p of P) for (let i = 0; i + 1 < p.pts.length; i++) { const a = p.pts[i], b = p.pts[i + 1]; if (Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) * K >= 1500) VT.push([Math.min(a[1], b[1]), Math.max(a[1], b[1])]); }
      for (const y of Ls) for (const f of Ls) for (const g of Ls) {
        const d1 = (f - y) * K, d2 = (g - f) * K;
        if (SSE.elevation_beam_mm[0] <= d1 && d1 <= SSE.elevation_beam_mm[1] && SSE.elevation_ffl_mm[0] <= d2 && d2 <= SSE.elevation_ffl_mm[1])
          cand.push([[VT.some(([tp, bt]) => Math.abs(tp - y) <= 0.3 && Math.abs(bt - g) <= 0.5) ? 0 : 1, (Math.abs(d1 - nb) <= 0.2 * nb && Math.abs(d2 - ng) <= 0.2 * ng) ? 0 : 1, Math.abs(d1 - nb) + Math.abs(d2 - ng)], y, f, g]);
      }
      const cc = (a, b) => RT.cmpT(a[0], b[0]) || RT.cmpT(a.slice(1), b.slice(1));
      const here = Object.keys(views).filter(k => +views[k].sheet === sh); const got = [];
      for (const c of cand.slice().sort(cc)) { if (got.every(q => Math.abs(c[1] - q[1]) > Math.abs(c[3] - c[1]))) got.push(c); if (got.length === here.length) break; }
      if (got.length !== here.length) { lg('VACUOUS sheet', I(sh), 'views wanted', I(here.length), 'line triples found', I(got.length)); const e = new Error('infer_type: VACUOUS'); e.log = L; throw e; }
      got.sort((a, b) => a[1] - b[1]); const rows = { upper: got[0], lower: got[got.length - 1] };
      const B6 = circles(P, W, labelsAll, BR);
      for (const k of here) {
        const v = views[k]; const c = rows[v.row]; v.beam = c[1]; v.floor_line = c[2]; v.ground_line = c[3]; dB.push((c[2] - c[1]) * K); dG.push((c[3] - c[2]) * K);
        const labs = v.haxis.indexOf('X') >= 0 ? gx : gy; const above = B6.filter(q => labs.has(q[0][0]) && q[1][1] < c[1]); const row = Math.max(...above.map(q => q[1][1]));
        const inrow = above.filter(q => Math.abs(q[1][1] - row) <= q[2]); let first = inrow[0]; for (const q of inrow) if (q[0][1] < first[0][1]) first = q;
        v.ox = pyRound(Math.abs(first[0][1] - first[1][0]) <= 0.3 ? first[0][1] : first[1][0], 1); v.label_row = pyRound(row, 2); v.labels_read = I(inrow.length);
        lg('view', k, 'p' + RT.str(I(sh)), v.row, 'beam', v.beam, 'floor', v.floor_line, 'ground', v.ground_line, 'first label', first[0][0], 'ox', v.ox, 'labels', I(inrow.length), 'of', I(labs.size));
      }
    }
    const logD = (name, m, bl, where, mod) => { const out = []; const r = TT.decide(out, name, m, bl, where, mod); L.push(out[0]); return r; };
    V.beam_above_ffl = logD('beam_above_ffl', median(dB), B.beam_above_ffl, dB.length + ' views');
    for (const k of Object.keys(views)) { // §39: once the sheets have said otherwise, each view's beam is its long line at the sheets' spacing
      const v = views[k]; const want = v.floor_line - median(dB) / K; let near = null, nd = null; for (const y of LS[+v.sheet]) { const d = Math.abs(y - want); if (nd === null || d < nd) { nd = d; near = y; } }
      if (Math.abs(near - want) * K <= B.beam_above_ffl.tol_mm && near !== v.beam) { lg('view', k, "beam re-read at the sheets' spacing", v.beam, '->', near); v.beam = near; }
    }
    V.ffl_above_ground = logD('ffl_above_ground', median(dG), B.ffl_above_ground, dG.length + ' views');
    // ---- side elevations: the top of the highest straight line at the roof's pitch
    const PA = [];
    for (const k of Object.keys(views)) {
      const v = views[k]; if (v.haxis.indexOf('Y') < 0) continue;
      for (const [a, b] of segs(PG[+v.sheet])) if (hypot(a[0] - b[0], a[1] - b[1]) * K > 1000 && Math.abs(a[0] - b[0]) > 2 && Math.abs(a[1] - b[1]) > 2 && v.label_row < Math.min(a[1], b[1]) && Math.max(a[1], b[1]) < v.ground_line) PA.push(degrees(Math.atan2(Math.abs(a[1] - b[1]), Math.abs(a[0] - b[0]))));
    }
    V.roof_pitch_deg = logD('roof_pitch_deg', PA.length ? pyRound(median(PA), 1) : null, B.roof_pitch_deg, PA.length + ' sloped lines on the side views', 1);
    const pitch = V.roof_pitch_deg.value; const tops = [];
    for (const k of Object.keys(views)) {
      const v = views[k]; if (v.haxis.indexOf('Y') < 0) continue; const t = [];
      for (const [a, b] of segs(PG[+v.sheet])) if (hypot(a[0] - b[0], a[1] - b[1]) > 20 && Math.abs(a[0] - b[0]) > 2 && Math.abs(a[1] - b[1]) > 2 && Math.abs(degrees(Math.atan2(Math.abs(a[1] - b[1]), Math.abs(a[0] - b[0]))) - pitch) <= 1 && v.label_row < Math.min(a[1], b[1]) && Math.max(a[1], b[1]) < v.ground_line) t.push(v.beam - Math.min(a[1], b[1]));
      if (t.length) tops.push(Math.max(...t) * K);
    }
    V.ridge_above_beam = logD('ridge_above_beam', tops.length ? median(tops) : null, B.ridge_above_beam, tops.length + ' side views');
    // ---- roof plan: the sheet ribs stop at the eaves; between the two rib groups lies the ridge
    const P3 = load(page(S.roof)); const W3 = TT.words(page(S.roof)); const B3 = new Map(); for (const q of circles(P3, W3, labelsAll, BR)) B3.set(q[0][0], q[1]); let ey = null, ridge = null;
    if (B3.has('A') && B3.has('5')) {
      const xA = B3.get('A')[0], y5 = B3.get('5')[1]; const Yr = y => (y - y5) * K; const RV = new Map();
      for (const [a, b] of segs(P3)) if (Math.abs(a[0] - b[0]) < 0.1 && Math.abs(a[1] - b[1]) > 40) RT.inc(RV, pyRoundInt(Yr(Math.min(a[1], b[1])) / 5) * 5 + ',' + pyRoundInt(Yr(Math.max(a[1], b[1])) / 5) * 5, 1);
      const mc = RT.mostCommon(RV).map(([k]) => k.split(',').map(Number)); const g2 = +gy.get('2'), g5 = +gy.get('5');
      const nn = mc.filter(k => k[0] < 0 && k[1] < g2), ss = mc.filter(k => g5 < k[0] && k[0] < g2 && k[1] > g2);
      if (nn.length && ss.length) { ey = (-nn[0][0] + ss[0][1] - g2) / 2; ridge = (nn[0][1] + ss[0][0]) / 2; lg('roof ribs: north end', I(-nn[0][0]), 'south end', I(ss[0][1] - g2), 'ridge between', I(nn[0][1]), I(ss[0][0])); }
      void xA;
    }
    if (ey === null && B3.has('A') && B3.has('5')) { // §40: no ribs in this hand: the outline's north edge
      const y5 = B3.get('5')[1]; const Yr = y => (y - y5) * K; const no = [];
      for (const [a, b] of segs(P3)) if (Math.abs(a[1] - b[1]) < 0.1 && Math.abs(a[0] - b[0]) * K > gx.get('E') / 2 && Yr(a[1]) < 0) no.push(-Yr(a[1]));
      if (no.length) { const okk = no.filter(v_ => v_ <= 1500); ey = okk.length ? Math.max(...okk) : null; lg('roof outline: north edge', ey); }
    }
    V.eaves_from_axis = logD('eaves_from_axis', ey, B.eaves_from_axis, 'p' + RT.str(S.roof) + ' ribs or outline');
    const ax = Tm.preset.roof.main_ridge_axis;
    lg('main ridge presumed on axis', ax, 'at', gy.get(ax), '| ribs put it at', ridge, (ridge !== null && Math.abs(ridge - gy.get(ax)) > 25) ? 'FINDING: not on the presumed axis' : '');
    // ---- plan: the wall pen's paired lines
    const P1 = load(page(S.plan)); const HL = new Map(), VL = new Map(); const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    for (const p of P1) {
      if (p.pen === null || !TT.is_wall_pen(p.pen, Tm, K)) continue;
      for (let i = 0; i + 1 < p.pts.length; i++) {
        const a = p.pts[i], b = p.pts[i + 1];
        if (Math.abs(a[1] - b[1]) <= 0.25 && Math.abs(a[0] - b[0]) > 0.25) push(HL, pyRound((a[1] + b[1]) / 2, 1), [Math.min(a[0], b[0]), Math.max(a[0], b[0])]);
        else if (Math.abs(a[0] - b[0]) <= 0.25 && Math.abs(a[1] - b[1]) > 0.25) push(VL, pyRound((a[0] + b[0]) / 2, 1), [Math.min(a[1], b[1]), Math.max(a[1], b[1])]);
      }
    }
    const nt = ('wall_thick_mm' in Tm.ruler) ? Tm.ruler.wall_thick_mm : B.wall_thickness.nominal; const gaps = [];
    for (const L_ of [HL, VL]) {
      const ks = [...L_.keys()].sort((a, b) => a - b);
      for (let i = 0; i < ks.length; i++) {
        const a = ks[i];
        for (let j = i + 1; j < ks.length; j++) {
          const b = ks[j]; const g = (b - a) * K; if (g > 1.3 * nt) break;
          if (g >= 0.7 * nt && L_.get(a).some(s => L_.get(b).some(t => Math.min(s[1], t[1]) - Math.max(s[0], t[0]) >= 5))) gaps.push(g);
        }
      }
    }
    V.wall_thickness = logD('wall_thickness', gaps.length ? median(gaps) : null, B.wall_thickness, gaps.length + ' paired lines');
    // ---- front elevation: the porch floor line sits between the floor line and the ground line
    const porch = Object.keys(views).filter(k => k === Tm.preset.roof.porch_on_face)[0]; const v = views[porch]; const HH = new Map();
    for (const [a, b] of segs(PG[+v.sheet])) if (Math.abs(a[1] - b[1]) < 0.1 && Math.abs(a[0] - b[0]) > 30 && v.floor_line < a[1] && a[1] < v.ground_line) {
      const k = pyRoundInt((v.floor_line - a[1]) * K / 5) * 5; if (!HH.has(k)) HH.set(k, [1e9, -1e9]); const e = HH.get(k); e[0] = Math.min(e[0], a[0], b[0]); e[1] = Math.max(e[1], a[0], b[0]);
    }
    const cn = [...HH.keys()].filter(k => Math.abs(-k - V.ffl_above_ground.value) > B.ffl_above_ground.tol_mm); let st = null;
    if (cn.length) { let bk = null, bd = null; for (const k of cn) { const d = Math.abs(-k - B.porch_step_below_ffl.nominal); if (bd === null || d < bd) { bd = d; bk = k; } } st = I(-bk); }
    V.porch_step_below_ffl = logD('porch_step_below_ffl', st, B.porch_step_below_ffl, porch + ' lines between floor and ground ' + RT.str([...HH.keys()].sort((a, b) => a - b).map(I)));
    const st_ = {}; for (const k of Object.keys(V)) st_[k] = V[k].status;
    lg('RESULT', st_, 'wrote inferred.json');
    return { inferred: { type_name: Tm.type_name, template: Tm, views, values: V }, log: L };
  }
  return { run, load, segs, circles };
});
