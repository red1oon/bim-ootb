// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 — port of scripts/pdf2bim/roof_emit.py (§32: the roof and the porch read from the roof plan (footprints), the front elevation and a section (heights), written into the typed sheets). Pure; UMD: window.Pdf2DxfRoof.
// run(model, R, inferred, sheets, sectionLog) -> {sheets (plan.dxf and roof.dxf extended), log}. sheets = the typed sheets so far; sectionLog = section_emit's log lines (the B-B level line is re-read from them).
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./py_rt.js'), require('./type_template.js')); else root.Pdf2DxfRoof = factory(root.Pdf2DxfRt, root.Pdf2DxfTT); })(typeof self !== 'undefined' ? self : this, function (RT, TT) {
  'use strict';
  const { I, T: Tp, pyRound, pyRoundInt, hypot, dist, degrees, radians } = RT; const S = RT.str;
  function load(page) { // every number of d, pairwise (control points included): [hasC, pts]
    return page.paths.map(p => { const M = p.m; const n = (p.d.match(/-?[\d.]+/g) || []).map(parseFloat); const pts = []; for (let i = 0; i < n.length - 1; i += 2) pts.push([M[0] * n[i] + M[2] * n[i + 1] + M[4], M[1] * n[i] + M[3] * n[i + 1] + M[5]]); return [p.d.indexOf('C') >= 0, pts]; });
  }
  function* segs(P) { for (const [c, pts] of P) if (!c) for (let i = 0; i + 1 < pts.length; i++) yield [pts[i], pts[i + 1]]; }
  function run(model, R, Iv, sheets0, sectionLog) {
    const L = []; const lg = (...a) => L.push(['§ROOF'].concat(a.map(RT.str)).join(' '));
    const sheets = Object.assign({}, sheets0); const VAL = k => Iv.values[k].value; const PR = Iv.template.preset.roof; const FR = Iv.views[PR.porch_on_face];
    const BH = VAL('beam_above_ffl'), FG = VAL('ffl_above_ground'), RH = VAL('ridge_above_beam'), STEP = VAL('porch_step_below_ffl'); const K = R.sheet.mm_per_pt_fitted; const gx = R.grid.x, gy = R.grid.y;
    const PITCH = Iv.values.roof_pitch_deg.value; const tan = Math.tan(radians(+PITCH)); const [BR0, BR1] = Iv.template.ruler.bubble_radius_mm.map(v => v / K); const Sh = Iv.template.sheets;
    const tail_insert = (text, lines) => { const d = text.split('\n'); let j = -1; for (let k = 0; k < d.length - 1; k++) if (d[k] === 'ENDSEC' && d[k - 1] === '0') j = k; return d.slice(0, j - 1).concat(lines, d.slice(j - 1)).join('\n'); };
    // ---- p3: footprints
    const pg3 = model.pages[String(Sh.roof)]; const P3 = load(pg3); const W3 = TT.words(pg3); const B3 = new Map(); const labels = new Set([...gx.keys(), ...gy.keys()]);
    for (const [c, pts] of P3) if (c && pts.length >= 4 && dist(pts[0], pts[pts.length - 1]) < 0.3) {
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); const r = (Math.max(...xs) - Math.min(...xs)) / 2;
      if (BR0 <= r && r <= BR1 && Math.abs((Math.max(...xs) - Math.min(...xs)) - (Math.max(...ys) - Math.min(...ys))) < 0.4) { const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; for (const w of W3) if (labels.has(w[0]) && hypot(w[1] - cx, w[2] - cy) <= r) B3.set(w[0], [cx, cy]); }
    }
    const xA = B3.get('A')[0], y5 = B3.get('5')[1]; const X = x => (x - xA) * K, Y = y => (y - y5) * K; const g1 = +gy.get('1'), g2 = +gy.get('2'), gE = +gx.get('E');
    const Hc = new Map();
    for (const [a, b] of segs(P3)) if (Math.abs(a[1] - b[1]) < 0.1 && Math.abs(a[0] - b[0]) > 40 && Y(a[1]) > g2 + 800 && Y(a[1]) < g1 + 800 && 0 < X(Math.min(a[0], b[0])) && X(Math.max(a[0], b[0])) < gE) RT.inc(Hc, pyRoundInt(X(Math.min(a[0], b[0])) / 5) * 5 + ',' + pyRoundInt(X(Math.max(a[0], b[0])) / 5) * 5, 1);
    const EAVE = VAL('eaves_from_axis'); lg('main eaves from the axes', EAVE, Iv.values.eaves_from_axis.status, 'measured', Iv.values.eaves_from_axis.measured);
    const T2 = RT.mostCommon(Hc, 2).map(([k, v]) => [k.split(',').map(Number), v]); const nr = T2.map(q => I(q[1])); const px0 = Math.min(...T2.map(q => q[0][0])), px1 = Math.max(...T2.map(q => q[0][1])); const pc = (px0 + px1) / 2;
    const fr = []; for (const [a, b] of segs(P3)) if (Math.abs(a[0] - b[0]) < 0.1 && Math.abs(X(a[0]) - px0) <= 40 && Y(Math.max(a[1], b[1])) > g1 && Y(Math.max(a[1], b[1])) < g1 + 1500 && Math.abs(a[1] - b[1]) > 6) fr.push(pyRoundInt(Y(Math.max(a[1], b[1]))));
    const front = Math.max(...fr);
    lg('porch roof footprint from p3: ribs x', I(px0), I(px1), 'n', nr, 'ridge x', pc, 'front y', I(front));
    // ---- p4: heights (the porch's face: its beam line is BH above FFL, §22, W-E1)
    const P4 = load(model.pages[String(Sh.elevations_a)]); const ox = FR.ox, beam = FR.beam; const XF = x => (x - ox) * K, ZF = y => (beam - y) * K + BH; const sl = [];
    for (const [a, b] of segs(P4)) {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      if (hypot(dx, dy) > 20 && Math.abs(dx) > 2 && Math.abs(dy) > 2 && FR.label_row < a[1] && a[1] < FR.ground_line && FR.label_row < b[1] && b[1] < FR.ground_line) {
        const q = [[XF(a[0]), ZF(a[1])], [XF(b[0]), ZF(b[1])]].sort((s, t) => -s[1] - -t[1]); sl.push([q[0][1], q[0][0], q[1][0], q[1][1], degrees(Math.atan2(Math.abs(dy), Math.abs(dx)))]);
      }
    }
    if (!sl.length) { lg('VACUOUS: no sloped line on the front elevation'); return { sheets, log: L }; }
    let ap = sl[0]; for (const q of sl) if (RT.cmpT(q, ap) > 0) ap = q;
    const apex = pyRoundInt(ap[0]); const widthP4 = 2 * Math.abs(ap[2] - ap[1]);
    lg('porch apex from p4: z above FFL', I(apex), 'slope deg', pyRound(ap[4], 1), 'gable x', I(pyRoundInt(ap[1] - Math.abs(ap[2] - ap[1]))), I(pyRoundInt(ap[1] + Math.abs(ap[2] - ap[1]))), 'eave z', I(pyRoundInt(ap[3])));
    const HH = new Map();
    for (const [a, b] of segs(P4)) if (Math.abs(a[1] - b[1]) < 0.1 && Math.abs(a[0] - b[0]) > 30 && FR.label_row < a[1] && a[1] < FR.ground_line + 1) {
      const k = pyRoundInt(ZF(a[1]) / 5) * 5; if (!HH.has(k)) HH.set(k, [1e9, -1e9]); const e = HH.get(k); e[0] = Math.min(e[0], XF(Math.min(a[0], b[0]))); e[1] = Math.max(e[1], XF(Math.max(a[0], b[0])));
    }
    let flk = null, fd = null; for (const k of HH.keys()) { const d = Math.abs(k + +STEP); if (fd === null || d < fd) { fd = d; flk = k; } }
    const fl = Math.abs(flk + +STEP) <= 5 ? HH.get(flk) : null; lg('porch floor line p4: z', I(-STEP), 'x', fl ? fl.map(v => I(pyRoundInt(v))) : null);
    lg('FINDING porch width: p3', I(px1 - px0), 'p4', I(pyRoundInt(widthP4)), 'difference', I(pyRoundInt(widthP4 - (px1 - px0))), '(p3 used: the plan gives footprints)');
    const rz = +gy.get(PR.main_ridge_axis); const meet = rz + (+BH + +RH - apex) / tan; const val = [];
    for (const [a, b] of segs(P3)) if (Math.abs(Math.abs(a[0] - b[0]) - Math.abs(a[1] - b[1])) <= 2 && hypot(a[0] - b[0], a[1] - b[1]) * K > 800 && Math.min(Math.abs(X(a[0]) - pc), Math.abs(X(b[0]) - pc)) <= 40) val.push(Y(Math.min(a[1], b[1])));
    if (val.length) { const mv = Math.min(...val); lg('FINDING valley join on the porch ridge: rule y', I(pyRoundInt(meet)), 'p3 drawn y', I(pyRoundInt(mv)), 'difference', I(pyRoundInt(mv - meet)), '(the height is not adjusted to fit)'); } else lg('VACUOUS no valley line read on the plan');
    // ---- p6 B-B: how far the porch floor runs
    const pg6 = model.pages[String(Sh.sections)]; const P6 = load(pg6); const W6 = TT.words(pg6); const mm = /W-C5 B-B FFL level line y ([\d.]+)/.exec((sectionLog || []).join('\n')); const yf = mm ? parseFloat(mm[1]) : null; const xb = [];
    for (const [c, pts] of P6) if (c && pts.length >= 4 && dist(pts[0], pts[pts.length - 1]) < 0.3) {
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); const r = (Math.max(...xs) - Math.min(...xs)) / 2;
      if (BR0 <= r && r <= BR1) { const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; for (const w of W6) if (w[0] === '5' && hypot(w[1] - cx, w[2] - cy) <= r) xb.push(cx); }
    }
    const ends = []; for (const [a, b] of segs(P6)) if (yf && xb.length && Math.abs(a[1] - b[1]) < 0.1 && Math.abs(a[0] - b[0]) > 6 && Math.abs((yf - a[1]) * K + +STEP) <= 8) ends.push((Math.min(a[0], b[0]) - xb[0]) * K, (Math.max(a[0], b[0]) - xb[0]) * K);
    const pend = ends.length ? pyRoundInt(Math.max(...ends)) : null; lg('porch floor line p6 B-B: south end y', pend === null ? null : I(pend), 'from', I(Math.floor(ends.length / 2)), 'segments');
    let pf; if (!(fl && pend)) { lg('VACUOUS: the porch floor is not stated on both sheets: not written'); pf = null; } else pf = [pyRoundInt(fl[0]), pyRoundInt(fl[1]), pend];
    // ---- write: roof sheet
    const lwp = (lay, pts, extra) => ['0', 'LWPOLYLINE', '8', lay, '90', S(I(pts.length)), '70', '1'].concat(extra || [], ...pts.map(([x, y]) => ['10', S(x), '20', S(y)]));
    const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const line = (lay, a, b, z) => ['0', 'LINE', '8', lay, '10', S(a[0]), '20', S(a[1]), '30', S(z), '11', S(b[0]), '21', S(b[1]), '31', S(z)];
    const mk = (t, x, y) => ['0', 'TEXT', '8', 'DXF2BIM-MARK', '10', S(x), '20', S(y), '30', '0', '40', '150', '1', t + ' @BY=model'];
    const Wd = gx.get('E'), Sg = gy.get('2'); const ridgeZ = I(+FG + +BH + +RH), pz = I(apex + +FG); const ni = x => I(-x); const ai = (a, b) => I(+a + +b);
    let roof = lwp('A-ROOF-GABLE', rect(ni(EAVE), ni(ai(Sg, EAVE)), ai(Wd, EAVE), EAVE)).concat(line('A-ROOF-RIDGE', [ni(EAVE), I(-rz)], [ai(Wd, EAVE), I(-rz)], ridgeZ));
    roof = roof.concat(lwp('A-ROOF-GABLE', rect(pc - (px1 - px0) / 2, I(-front), pc + (px1 - px0) / 2, I(-rz))), line('A-ROOF-RIDGE', [pc, I(-front)], [pc, I(-rz)], pz), mk('@PITCH=' + S(PITCH), I(-3000), I(-6000)));
    // gable ends the elevations draw closed above the beam: walls rising to the roof. Thickness = the plan's walls. The porch one stands on the column line, between the columns' outer faces read from the plan sheet (§15)
    const d_ = sheets['plan.dxf'].split('\n'); const colx = [];
    for (let i_ = 0; i_ < d_.length - 1; i_++) if (d_[i_] === '0' && d_[i_ + 1] === 'LWPOLYLINE' && d_[i_ + 2] === '8' && d_[i_ + 3] === 'A-COLS') { let j_ = i_ + 2; while (d_[j_] !== '0') { if (d_[j_] === '10') colx.push(parseFloat(d_[j_ + 1])); j_ += 2; } }
    if (!colx.length) { lg('VACUOUS no A-COLS on the plan: the porch gable wall has no width'); const e = new Error('roof_emit: VACUOUS'); e.log = L; throw e; }
    const TW = VAL('wall_thickness'); const HW = I(Math.floor(+TW / 2)); const TW2 = +TW / 2;
    roof = roof.concat(lwp('A-WALL-GABLE', rect(-+TW / 2, -(+Sg + TW2), TW2, TW2)), lwp('A-WALL-GABLE', rect(+Wd - TW2, -(+Sg + TW2), +Wd + TW2, TW2)), lwp('A-WALL-GABLE', rect(Math.min(...colx), -+gy.get('1') - TW2, Math.max(...colx), -+gy.get('1') + TW2)));
    sheets['roof.dxf'] = tail_insert(sheets['roof.dxf'], roof);
    lg('roof.dxf: gables 2, ridge z', ridgeZ, pz, 'pitch', PITCH);
    // ---- write: plan: floor pieces (the main slab keeps its ring and its section thickness; the porch states its own), columns
    let p = []; const D = R.floor_buildup.depth_mm; const xs0 = HW, xs1 = ai(Wd, I(-HW)), ys0 = I(-(+Sg - +HW)), ys1 = I(-HW);
    if (pf) p = p.concat(lwp('A-FLOR-OTLN', rect(xs0, ys0, xs1, ys1), ['38', S(FG), '39', S(D)]), lwp('A-FLOR-OTLN', rect(I(pf[0]), I(-pf[2]), I(pf[1]), I(-(+Sg + +HW))), ['38', S(I(+FG - +STEP)), '39', S(D)]));
    p = p.concat(mk('@BODYZ=column,' + S((+FG - +STEP) / 1000) + ',' + S((+FG + +BH) / 1000), I(-3000), I(-6300)));
    sheets['plan.dxf'] = tail_insert(sheets['plan.dxf'], p);
    lg('plan.dxf: floor pieces', I(pf ? 2 : 0), 'porch', pf ? Tp(I(pf[0]), I(pf[1]), I(pf[2])) : null, 'columns z', (+FG - +STEP) / 1000, (+FG + +BH) / 1000);
    return { sheets, log: L };
  }
  return { run };
});
