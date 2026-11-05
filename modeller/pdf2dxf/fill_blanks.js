// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 — port of scripts/pdf2bim/fill_blanks.py (§35 weak-sighted reader: K, grid dimensions, schedule sizes, §40 drafter's style). Pure; UMD: window.Pdf2DxfFill.
// run(model, R, Tm) -> {rosetta, template, log}. R.grid.x/y are Maps (insertion order). Witness: modeller/tests/witness_pdf2dxf_rules.js
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./py_rt.js'), require('./type_template.js')); else root.Pdf2DxfFill = factory(root.Pdf2DxfRt, root.Pdf2DxfTT); })(typeof self !== 'undefined' ? self : this, function (RT, TT) {
  'use strict';
  const { I, pyRound, pyRoundInt, rnd, hypot, dist, median, mostCommon, inc, fixed } = RT;
  function run(model, R, Tm) {
    const L = []; const lg = (...a) => L.push(['§FILL'].concat(a.map(RT.str)).join(' '));
    const RU = Tm.ruler, S = Tm.sheets; const gx = R.grid.x, gy = R.grid.y; const page = k => model.pages[String(k)];
    const W = TT.words(page(S.plan)); const top = TT.top_row(W, gx), left = TT.left_col(W, gy);
    if (top.size !== gx.size || left.size !== gy.size) { lg('VACUOUS grid labels read x', [...top.keys()].sort(), 'y', [...left.keys()].sort()); const e = new Error('fill_blanks: VACUOUS'); e.log = L; throw e; }
    const sc = []; W.forEach((w, i) => { if (w[0].toLowerCase() === 'scale' && i + 1 < W.length) { const m = /^1:(\d+)$/.exec(W[i + 1][0]); if (m) sc.push(parseInt(m[1], 10)); } });
    let PS; if (sc.length) { const c = new Map(); for (const v of sc) inc(c, v, 1); PS = I(mostCommon(c, 1)[0][0]); } else PS = RU.printed_scale;
    const KP = 25.4 / 72 * PS;
    lg('printed scale 1:' + RT.dfmt(PS) + (sc.length ? '' : ' (template: none printed)') + ' means ' + fixed(KP, 2) + ' mm/pt; labels x ' + top.size + ' y ' + left.size);
    const xs = [...top.values()].map(w => w[1]).sort((a, b) => a - b), ys = [...left.values()].map(w => w[2]).sort((a, b) => a - b); const m = RU.plan_frame_margin_mm / KP;
    // ---- the ruler: closed window modules, 1:5, at the module pitch
    let mods = []; const [ms, ml] = RU.window_module_mm;
    for (const p of page(S.plan).paths) {
      const dd = p.d; if (dd.indexOf('C') >= 0) continue; const M = p.m;
      const n = (dd.match(/-?[\d.]+/g) || []).map(parseFloat); const pts = []; for (let i = 0; i < n.length - 1; i += 2) pts.push([M[0] * n[i] + M[2] * n[i + 1] + M[4], M[1] * n[i] + M[3] * n[i + 1] + M[5]]);
      if (pts.length !== 5 || dist(pts[0], pts[4]) >= 0.05) continue;
      const X = pts.map(q => q[0]), Y = pts.map(q => q[1]); const w = Math.max(...X) - Math.min(...X), h = Math.max(...Y) - Math.min(...Y); const [a_, b_] = [w * KP, h * KP].sort((x, y) => x - y);
      if (Math.min(...xs) - m <= Math.min(...X) && Math.max(...X) <= Math.max(...xs) + m && Math.min(...ys) - m <= Math.min(...Y) && Math.max(...Y) <= Math.max(...ys) + m && Math.abs(a_ - ms) <= 0.25 * ms && Math.abs(b_ - ml) <= 0.25 * ml)
        mods.push([w > h ? 'H' : 'V', pyRound((Math.min(...X) + Math.max(...X)) / 2, 1), pyRound((Math.min(...Y) + Math.max(...Y)) / 2, 1)]);
    }
    { const seen = new Set(); mods = RT.sortedT(mods).filter(q => { const k = q.join('|'); if (seen.has(k)) return false; seen.add(k); return true; }); }
    const pitch = []; const g = new Map();
    for (const [o, x, y] of mods) { const k = o + '|' + pyRoundInt(o === 'H' ? y : x); if (!g.has(k)) g.set(k, []); g.get(k).push(o === 'H' ? x : y); }
    const want = RU.window_module_pitch_mm / KP;
    for (const v of g.values()) { v.sort((a, b) => a - b); for (let i = 0; i + 1 < v.length; i++) { const a = v[i], b = v[i + 1]; if (Math.abs(b - a - want) <= 0.3 * want) pitch.push(b - a); } }
    const unit = RU.grid_module_mm; let K0;
    if (pitch.length) K0 = RU.window_module_pitch_mm / median(pitch); else { K0 = KP; lg('no window modules on this plan: the scale is the printed one, ' + fixed(KP, 2)); }
    const span = Math.max(...xs) - Math.min(...xs); const over = I(pyRoundInt(span * K0 / unit) * unit); const K1 = pyRound(over / span, 2);
    lg('window modules', I(mods.length), 'pitch pairs', I(pitch.length), 'median pitch pt', pitch.length ? pyRound(median(pitch), 2) : null, 'K0', pyRound(K0, 2), 'overall', over, 'K', K1);
    const kb = { nominal: R.sheet.mm_per_pt_fitted, tol_mm: 0.05 }; let K;
    if (Math.abs(K1 - kb.nominal) <= kb.tol_mm) { K = kb.nominal; L.push(['§INFER K READ value', K, 'measured', K1, 'nominal', kb.nominal, 'tol', kb.tol_mm, '| window modules + overall span'].map(RT.str).join(' ')); }
    else { K = K1; L.push(['§INFER K FINDING value', K, 'measured', K1, 'nominal', kb.nominal, 'tol', kb.tol_mm, '| window modules + overall span'].map(RT.str).join(' ')); }
    // ---- the grid: label distance x K, compared with what was expected
    const tol = RU.grid_tol_mm; const ngx = new Map(), ngy = new Map();
    const x0 = Math.min(...[...top.values()].map(w => w[1])), y0 = Math.min(...[...left.values()].map(w => w[2]));
    for (const [k, nom] of gx) ngx.set(k, TT.decide(L, 'grid_x_' + k, (top.get(k)[1] - x0) * K, { nominal: nom, tol_mm: tol }, 'label distance x K', unit).value);
    for (const [k, nom] of gy) ngy.set(k, TT.decide(L, 'grid_y_' + k, (left.get(k)[2] - y0) * K, { nominal: nom, tol_mm: tol }, 'label distance x K', unit).value);
    const ordOf = mp => [...mp].map((e, i) => [e, i]).sort((a, b) => (+a[0][1] - +b[0][1]) || (a[1] - b[1])).map(q => q[0][0]);
    if (ordOf(ngx).join() !== [...gx.keys()].join() || ordOf(ngy).join() !== [...gy.keys()].join()) { lg('WRONG the labels are not in the expected order: x', ngx, 'y', ngy); const e = new Error('fill_blanks: WRONG'); e.log = L; throw e; }
    // ---- the schedule: each SIZE row reads left to right under its REFERENCES row
    const Wp = TT.words(page(S.schedule)); const sizes = {}; const seen = new Set(); const RF = Wp.filter(w => /^[DW]\d$/.test(w[0]));
    const wkey = w => w[0] + '|' + w[1] + '|' + w[2];
    for (const w0 of RF) {
      const refs = RF.filter(w => Math.abs(w[2] - w0[2]) <= 2).sort((a, b) => a[1] - b[1]);
      if (refs.length < 2 || seen.has(wkey(refs[0]))) continue;
      seen.add(wkey(refs[0])); const yr = refs[0][2]; const below = Wp.filter(w => w[0] === 'SIZE' && w[2] > yr).sort((a, b) => a[2] - b[2]);
      if (!below.length) continue;
      const txt = Wp.filter(w => Math.abs(w[2] - below[0][2]) <= 3).sort((a, b) => a[1] - b[1]).map(w => w[0]).join(' ');
      const f = []; { const re = /(\d{3,4})\s*MM\s*X\s*(\d{3,4})\s*MM/gi; let mm; while ((mm = re.exec(txt)) !== null) f.push([mm[1], mm[2]]); }
      if (f.length === refs.length) refs.forEach((r_, i) => { sizes[r_[0]] = [I(parseInt(f[i][0], 10)), I(parseInt(f[i][1], 10))]; });
      else lg('FINDING schedule row', txt.slice(0, 80), 'sizes', I(f.length), 'references', I(refs.length));
    }
    const ns = {}; const SZ = R.schedule_sizes_mm;
    for (const k of Object.keys(SZ).filter(q => /^[DW]\d$/.test(q))) {
      if (!(k in sizes)) { ns[k] = SZ[k]; L.push('§INFER schedule_' + k + ' DEFAULT value ' + RT.str(SZ[k]) + ' measured None nominal ' + RT.str(SZ[k]) + ' tol 0 | not on the sheet'); continue; }
      const st = (+sizes[k][0] === +SZ[k][0] && +sizes[k][1] === +SZ[k][1]) ? 'READ' : 'FINDING'; ns[k] = sizes[k];
      L.push('§INFER schedule_' + k + ' ' + st + ' value ' + RT.str(sizes[k]) + ' measured ' + RT.str(sizes[k]) + ' nominal ' + RT.str(SZ[k]) + ' tol 0 | p' + RT.str(S.schedule) + ' SIZE row');
    }
    // ---- §40: the drafter's style on this sheet, in mm. Later stages use what is read here
    const SS = RU.style_search; const PL = TT.stroked_paths(page(S.plan)); const fm = RU.plan_frame_margin_mm / K;
    const FR = [Math.min(...xs) - fm, Math.max(...xs) + fm, Math.min(...ys) - fm, Math.max(...ys) + fm]; const seg = new Map();
    for (const q of PL) {
      for (let i = 0; i + 1 < q.pts.length; i++) {
        const a_ = q.pts[i], b_ = q.pts[i + 1];
        if (!(FR[0] <= Math.min(a_[0], b_[0]) && Math.max(a_[0], b_[0]) <= FR[1] && FR[2] <= Math.min(a_[1], b_[1]) && Math.max(a_[1], b_[1]) <= FR[3])) continue;
        const o_ = Math.abs(a_[1] - b_[1]) <= 0.05 ? 'H' : (Math.abs(a_[0] - b_[0]) <= 0.05 ? 'V' : null);
        if (o_ && dist(a_, b_) * K >= SS.long_line_mm) {
          const key = o_ + '|' + (+q.pen); if (!seg.has(key)) seg.set(key, { o: o_, pn: +q.pen, L: [] });
          seg.get(key).L.push([pyRound(o_ === 'H' ? a_[1] : a_[0], 2), o_ === 'H' ? Math.min(a_[0], b_[0]) : Math.min(a_[1], b_[1]), o_ === 'H' ? Math.max(a_[0], b_[0]) : Math.max(a_[1], b_[1])]);
        }
      }
    }
    const byp = new Map(); const gaps = new Map();
    for (const { o: o_, pn, L: L0 } of seg.values()) {
      const Ls = RT.sortedT(L0);
      for (let i = 0; i < Ls.length; i++) {
        const u = Ls[i];
        for (let j = i + 1; j < Ls.length; j++) {
          const v = Ls[j]; const gg = (v[0] - u[0]) * K;
          if (gg > SS.wall_pair_mm[1]) break;
          const ov = Math.min(u[2], v[2]) - Math.max(u[1], v[1]); const mid = (u[0] + v[0]) / 2;
          const axes = o_ === 'V' ? [...ngx.values()].map(vv => x0 + vv / K) : [...ngy.values()].map(vv => y0 + vv / K);
          if (gg >= SS.wall_pair_mm[0] && ov * K >= SS.long_line_mm && Math.min(...axes.map(q_ => Math.abs(mid - q_))) * K <= SS.wall_on_axis_mm) {
            inc(byp, pn, ov * K); if (!gaps.has(pn)) gaps.set(pn, new Map()); inc(gaps.get(pn), pyRoundInt(gg / 10) * 10, ov * K);
          }
        }
      }
    }
    if (byp.size) {
      const pw = mostCommon(byp, 1)[0][0]; const tw = I(mostCommon(gaps.get(pw), 1)[0][0]);
      RU.wall_pen_mm = pyRound(pw * K, 2); RU.wall_half_mm = tw / 2; RU.wall_thick_mm = tw;
      const pens = new Map([...byp].map(([k, v]) => [k, I(pyRoundInt(v / 1000))]));
      lg('style: wall pen ' + fixed(pw, 3) + ' pt = ' + fixed(pw * K, 2) + ' mm, thickness ' + RT.str(tw) + ', from ' + RT.dfmt(byp.get(pw) / 1000) + ' m of paired long lines; pens ' + RT.str(pens));
    } else { RU.wall_half_mm = I(50); RU.wall_thick_mm = I(100); lg('FINDING no paired long lines read: the template wall stays'); }
    const cir = [];
    for (const q of PL) if (q.pts.length >= 4 && dist(q.pts[0], q.pts[q.pts.length - 1]) < 0.3 && Math.abs((q.x1 - q.x0) - (q.y1 - q.y0)) < 0.3) cir.push([(q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, (q.x1 - q.x0) / 2]);
    const lw = [...top.values()].concat([...left.values()]);
    const ins = []; for (const c of cir) for (const w of lw) if (hypot(c[0] - w[1], c[1] - w[2]) <= c[2] && SS.bubble_radius_mm[0] <= c[2] * K && c[2] * K <= SS.bubble_radius_mm[1]) ins.push(c[2] * K);
    if (ins.length) { const rb = median(ins); RU.bubble_radius_mm = [I(pyRoundInt(rb * 0.9)), I(pyRoundInt(rb * 1.1))]; lg('style: grid bubble radius ' + fixed(rb, 0) + ' mm from ' + ins.length + ' of them'); }
    else lg('FINDING no circle holds a grid label: the template bubble stays');
    const tv = [...top.values()].map(wkey); const sm = [];
    for (const c of cir) for (const w of W) if (w[0] === 'A' && hypot(c[0] - w[1], c[1] - w[2]) <= c[2] && tv.indexOf(wkey(w)) < 0) sm.push(c[2] * K);
    if (sm.length) { const rm_ = median(sm); RU.section_marker_radius_mm = [I(pyRoundInt(rm_ * 0.9)), I(pyRoundInt(rm_ * 1.1))]; lg('style: section marker radius ' + fixed(rm_, 0) + ' mm from ' + sm.length); }
    const apen = new Map(); const [a0_, a1_] = SS.arc_mm;
    for (const q of PL) {
      if (q.pts.length >= 2 && dist(q.pts[0], q.pts[q.pts.length - 1]) > 3) {
        const w_ = q.x1 - q.x0, h_ = q.y1 - q.y0, r_ = Math.max(w_, h_);
        if (a0_ <= r_ * K && r_ * K <= a1_ && Math.abs(w_ - h_) <= 0.08 * r_ && Math.abs(dist(q.pts[0], q.pts[q.pts.length - 1]) - r_ * Math.sqrt(2)) <= 0.08 * r_ && FR[0] <= q.x0 && q.x1 <= FR[1] && FR[2] <= q.y0 && q.y1 <= FR[3]) inc(apen, +q.pen, 1);
      }
    }
    if (apen.size) { const pd_ = mostCommon(apen, 1)[0][0]; RU.door_arc.pen_mm = [pyRound(pd_ * K * 0.6, 1), pyRound(pd_ * K * 1.4, 1)]; lg('style: door arc pen ' + fixed(pd_, 3) + ' pt from ' + RT.str(new Map([...apen].map(([k, v]) => [k, I(v)])))); }
    const [wch, nm_, nf_] = TT.window_symbols(PL, Tm, K, FR, RU.wall_thick_mm); lg('style: window symbols', I(nm_), 'modules', I(nf_), 'frames ->', I(wch.length), 'chains');
    Tm.door_system.depth_mm = Tm.window_system.depth_mm = RU.wall_thick_mm; // §40: a family is as deep as this drawing's wall
    // ---- the dictionary every later stage reads
    const E = RT.deepcopy(R); E.sheet.mm_per_pt_fitted = K; E.grid.x = ngx; E.grid.y = ngy; E.grid.overall_mm = [I(Math.max(...[...ngx.values()].map(Number))), I(Math.max(...[...ngy.values()].map(Number)))];
    Object.assign(E.schedule_sizes_mm, ns);
    for (const k of Object.keys(ns)) { const v = ns[k]; const lb = E.library_binding[k]; E.library_binding[k] = Object.assign({}, lb, { family: 'LCSSU_' + k + '_' + RT.dfmt(v[0]) + 'x' + RT.dfmt(v[1]) + (+RU.wall_thick_mm === 100 ? '' : 'd' + RT.dfmt(RU.wall_thick_mm)), lib_size: v }); }
    lg('RESULT K', K, 'x', ngx, 'y', ngy, 'wrote rosetta.effective.json');
    return { rosetta: E, template: Tm, log: L };
  }
  return { run };
});
