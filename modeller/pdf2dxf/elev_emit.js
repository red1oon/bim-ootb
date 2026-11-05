// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 — port of scripts/pdf2bim/elev_emit.py (§22/§24: the four elevation sheets, openings against the plan, door heads, dimensions, bubbles). Pure; UMD: window.Pdf2DxfElev.
// run(model, R, inferred, planDxf) -> {sheets:{'elev_front.dxf':text,...}, doorHeads:[...], log}. planDxf = the extracted plan text emit_dxf_p1 wrote (not the marked one).
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./py_rt.js'), require('./type_template.js'), require('./infer_type.js')); else root.Pdf2DxfElev = factory(root.Pdf2DxfRt, root.Pdf2DxfTT, root.Pdf2DxfInfer); })(typeof self !== 'undefined' ? self : this, function (RT, TT, IT) {
  'use strict';
  const { I, T: Tp, pyRound, pyRoundInt, hypot, dist, radians } = RT;
  const S = RT.str; const r1 = x => RT.rnd(x, 1); const ri = x => RT.rnd(x);
  function run(model, R, inferred, planDxf) {
    const L = []; const lg = (...a) => L.push(['§PDF'].concat(a.map(RT.str)).join(' '));
    const K = R.sheet.mm_per_pt_fitted; const Iv = inferred;
    const SHC = {}, SH = {}; for (const pg of [Iv.template.sheets.elevations_a, Iv.template.sheets.elevations_b]) { const key = 'p' + RT.str(pg); SHC[key] = IT.load(model.pages[String(pg)]); SH[key] = SHC[key].map(p => p.pts); }
    const GX = R.grid.x, GY = R.grid.y; const WID = GX.get('E'), DEP = GY.get('1');
    const VAL = k => Iv.values[k].value; const BH = VAL('beam_above_ffl'), FG = VAL('ffl_above_ground'), RH = VAL('ridge_above_beam'); const BL = Iv.template.blanks; const [BR] = TT.radii(Iv.template, K);
    const bubbles = (sheet, row) => {
      const WD = TT.words(model.pages[sheet.slice(1)]); const o = new Map();
      for (const { pts, curve } of SHC[sheet]) {
        if (!curve || pts.length < 4 || dist(pts[0], pts[pts.length - 1]) >= 0.3) continue;
        const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); const wd = Math.max(...xs) - Math.min(...xs), ht = Math.max(...ys) - Math.min(...ys); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        if (Math.abs(wd - ht) < 0.3 && BR[0] <= wd / 2 && wd / 2 <= BR[1] && Math.abs(cy - row) <= wd / 2) for (const w of WD) if (hypot(w[1] - cx, w[2] - cy) <= wd / 2) o.set(w[0], [cx, cy, wd / 2]);
      }
      return o;
    };
    const views = {};
    for (const n_ of ['FRONT', 'REAR', 'RIGHT', 'LEFT']) { const v_ = Iv.views[n_]; const x_ = v_.haxis.indexOf('X') >= 0; views[n_] = { sheet: 'p' + RT.str(v_.sheet), ox: v_.ox, beam: v_.beam, label_row: v_.label_row, face: v_.face, haxis: v_.haxis, kind: x_ ? 'x' : 'y', width: x_ ? WID : DEP, axis: x_ ? ['H', I(-GY.get(v_.axis))] : ['V', GX.get(v_.axis)] }; }
    const Hlines = P => { const H = new Map(); for (const p of P) for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1]; if (Math.abs(a[1] - b[1]) < 0.15 && Math.abs(a[0] - b[0]) > 0) RT.inc(H, pyRound((a[1] + b[1]) / 2, 1), Math.abs(a[0] - b[0])); } return [...H].filter(([, l]) => l * K >= Iv.template.ruler.long_line_mm).map(q => q[0]).sort((a, b) => a - b); };
    const DHEADS = [];
    for (const n of Object.keys(views)) {
      const v = views[n]; const P = SH[v.sheet]; const lh = Hlines(P); const ffl = v.beam + BH / K; const hit = lh.filter(y => Math.abs(y - ffl) < 0.3); const gl = lh.filter(y => Math.abs(y - (ffl + FG / K)) < 0.3); v.ffl = ffl;
      lg('W-E1', n, 'beam', v.beam, 'FFL expected', pyRound(ffl, 2), 'found', hit, 'ground expected', pyRound(ffl + FG / K, 2), 'found', gl, (hit.length && gl.length) ? 'PASS' : 'WRONG');
    }
    // ---- plan entities from our own DXF
    const rd = planDxf.split('\n'); const arcs = [], PW = [], PM = []; let ent = false;
    for (let i = 0; i < rd.length - 1; i += 2) {
      if (rd[i] === '2' && rd[i + 1] === 'ENTITIES') ent = true;
      if (ent && rd[i] === '0' && ['ARC', 'LINE', 'LWPOLYLINE'].indexOf(rd[i + 1]) >= 0) {
        const ty = rd[i + 1]; const g = []; let j = i + 2; while (rd[j] !== '0') { g.push([rd[j], rd[j + 1]]); j += 2; }
        const d = {}; for (const [a, b] of g) d[a] = b; const lay = d['8'];
        if (ty === 'ARC' && lay === 'PDF-DOOR-SWING') arcs.push(['10', '20', '40', '50', '51'].map(k => parseFloat(d[k])));
        if (ty === 'LINE' && lay === 'PDF-WINDOW') PM.push(['10', '20', '11', '21'].map(k => parseFloat(d[k])));
        if (ty === 'LWPOLYLINE' && lay === 'PDF-WALL') { const xs = g.filter(q => q[0] === '10').map(q => parseFloat(q[1])), ys = g.filter(q => q[0] === '20').map(q => parseFloat(q[1])); PW.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]); }
      }
    }
    const WH = ('wall_half_mm' in Iv.template.ruler) ? +Iv.template.ruler.wall_half_mm : 50;
    const wallruns = (o, ac) => {
      const iv = PW.filter(r => (((r[3] - r[1]) <= 2 * WH + 10 && Math.abs((r[1] + r[3]) / 2 - ac) <= WH + 10 && o === 'H') || ((r[2] - r[0]) <= 2 * WH + 10 && Math.abs((r[0] + r[2]) / 2 - ac) <= WH + 10 && o === 'V'))).map(r => o === 'H' ? [r[0], r[2]] : [r[1], r[3]]).sort(RT.cmpT);
      const r_ = []; for (const [a, b] of iv) { if (r_.length && a <= r_[r_.length - 1][1] + 1) r_[r_.length - 1][1] = Math.max(r_[r_.length - 1][1], b); else r_.push([a, b]); } return r_;
    };
    const planwin = v => {
      const [o, ac] = v.axis; const ch = new Map();
      for (const [a, b, c, d] of PM) {
        if (o === 'H' && Math.abs(b - d) < 1 && Math.abs((b + d) / 2 - ac) <= 250 && Math.abs(c - a) > 200) ch.set(pyRoundInt((a + c) / 2) + ',' + pyRoundInt(Math.abs(c - a)), [I(pyRoundInt((a + c) / 2)), I(pyRoundInt(Math.abs(c - a)))]);
        if (o === 'V' && Math.abs(a - c) < 1 && Math.abs((a + c) / 2 - ac) <= 250 && Math.abs(d - b) > 200) ch.set(pyRoundInt((b + d) / 2) + ',' + pyRoundInt(Math.abs(d - b)), [I(pyRoundInt((b + d) / 2)), I(pyRoundInt(Math.abs(d - b)))]);
      }
      return [...ch.values()].sort(RT.cmpT);
    };
    const xdraw = (v, pc) => { const h = v.haxis; if (h === '+X') return pc; if (h === '-X') return (RT.isInt(WID) && RT.isInt(pc)) ? I(+WID - +pc) : (+WID - +pc); if (h === '+Y') return (RT.isInt(DEP) && RT.isInt(pc)) ? I(+DEP + +pc) : (+DEP + +pc); return RT.isInt(pc) ? I(-pc) : -pc; };
    const slat_windows = v => {
      const P = SH[v.sheet]; const ax = v.ox, ffl = v.ffl; const y0 = v.beam + 0.5, y1 = ffl - 0.5; const Vs = [];
      for (const p of P) for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1]; if (Math.abs(a[0] - b[0]) < 0.15 && 15 <= Math.abs(a[1] - b[1]) && Math.abs(a[1] - b[1]) <= 65 && y0 <= Math.min(a[1], b[1]) && Math.max(a[1], b[1]) <= y1) Vs.push([a[0], Math.min(a[1], b[1]), Math.max(a[1], b[1])]); }
      Vs.sort(RT.cmpT); let cl = [];
      for (const [x, a0, a1] of Vs) { const l = cl[cl.length - 1]; if (l && x - l.x1 <= 4.5 && Math.abs(a0 - l.y0) <= 1.5 && Math.abs(a1 - l.y1) <= 1.5) { l.x1 = x; l.n += 1; } else cl.push({ x0: x, x1: x, y0: a0, y1: a1, n: 1 }); }
      cl = cl.filter(c => c.n >= 3); const Wn = [];
      for (const c of cl) { if ((c.y1 - c.y0) * K >= 950) Wn.push([c]); else if (Wn.length) Wn[Wn.length - 1].push(c); }
      return Wn.map(g => [ri((g[0].x0 - ax) * K), ri((g[g.length - 1].x1 - ax) * K), ri((ffl - g[0].y1) * K), ri((ffl - g[0].y0) * K)]);
    };
    const SZ = R.schedule_sizes_mm;
    const w3_measure = (v, xc) => {
      const [wd3, ht3] = SZ.W3; const P = SH[v.sheet]; const ax = v.ox, ffl = v.ffl; let best = null;
      for (const p of P) for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1]; if (Math.abs(a[0] - b[0]) < 0.15 && Math.abs(Math.abs(a[1] - b[1]) * K - ht3) <= 30) { const cx = a[0]; if (Math.abs((cx - ax) * K - (xc - wd3 / 2)) <= 40 || Math.abs((cx - ax) * K - (xc + wd3 / 2)) <= 40) best = Tp(ri((ffl - Math.max(a[1], b[1])) * K), ri((ffl - Math.min(a[1], b[1])) * K)); } }
      return best;
    };
    const frame_measure = (v, xc, w) => {
      const P = SH[v.sheet]; const ax = v.ox, ffl = v.ffl; const hit = [];
      for (const p of P) for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1]; if (Math.abs(a[0] - b[0]) < 0.15 && Math.abs(a[1] - b[1]) * K >= 300 && Math.min(a[1], b[1]) >= v.beam - 1 && Math.max(a[1], b[1]) <= ffl + 1 && Math.min(Math.abs((a[0] - ax) * K - (xc - w / 2)), Math.abs((a[0] - ax) * K - (xc + w / 2))) <= 40) hit.push(Tp(ri((ffl - Math.max(a[1], b[1])) * K), ri((ffl - Math.min(a[1], b[1])) * K))); }
      if (!hit.length) return null; let b = hit[0]; for (const h of hit) if (h[1] - h[0] > b[1] - b[0]) b = h; return b;
    };
    const lw = (layer, pts) => ['0', 'LWPOLYLINE', '8', layer, '90', S(I(pts.length)), '70', '1'].concat(...pts.map(([x, y]) => ['10', S(x), '20', S(y)]));
    const tx = (x, y, t, h) => ['0', 'TEXT', '8', 'DXF2BIM-MARK', '10', S(x), '20', S(y), '30', '0', '40', S(h === undefined ? I(150) : h), '1', t];
    const dim = (layer, p1, p2, anchor, rot, text) => ['0', 'DIMENSION', '8', layer, '10', S(anchor[0]), '20', S(anchor[1]), '30', '0', '13', S(p1[0]), '23', S(p1[1]), '33', '0', '14', S(p2[0]), '24', S(p2[1]), '34', '0', '70', '0', '50', S(rot), '1', S(text)];
    const ROOF_TOP = I(+BH + +RH);
    const w3_z = (m, where) => { const o = []; const a = TT.decide(o, 'high_window_sill', m ? m[0] : null, BL.high_window_sill, where); const b = TT.decide(o, 'high_window_head', m ? m[1] : null, BL.high_window_head, where); o.forEach(x => L.push(x)); return [a.value, b.value]; };
    const decideL = (name, mv, bl, where) => { const o = []; const r = TT.decide(o, name, mv, bl, where); o.forEach(x => L.push(x)); return r; };
    const sheets = {};
    for (const n of Object.keys(views)) {
      const v = views[n]; const [o, ac] = v.axis; const pw = planwin(v); let Wd = []; const Dr = [];
      if (v.kind === 'x' && (n === 'FRONT' || n === 'REAR')) {
        Wd = [];
        for (const [x0, x1, s_, h_] of slat_windows(v)) {
          const m = pw.filter(([c, w]) => Math.abs(xdraw(v, c) - (x0 + x1) / 2) <= 60 && Math.abs(w - (x1 - x0)) <= 120);
          if (m.length) { const [c, w] = m[0]; const xc = xdraw(v, c); Wd.push([ri(xc - w / 2), ri(xc + w / 2), s_, h_]); lg('W-E3b', n, 'snapped slat window', Tp(x0, x1), '->', Tp(ri(xc - w / 2), ri(xc + w / 2)), '(plan chain', c, w, ')'); }
          else { Wd.push([x0, x1, s_, h_]); lg('W-E3b', n, 'slat window with NO plan chain (kept as measured)', Tp(x0, x1)); }
        }
        for (const [c, w] of pw) {
          const xc = xdraw(v, c);
          if (!Wd.some(q => Math.abs((q[0] + q[1]) / 2 - xc) <= 60) && +w === +SZ.W3[0]) { const m = w3_measure(v, xc); lg('W-E5', n, 'plan W3 at drawn x', ri(xc), 'vector 500 mm frame edges measured (sill,head):', m); Wd.push([ri(xc - w / 2), ri(xc + w / 2)].concat(w3_z(m, n))); }
          else if (!Wd.some(q => Math.abs((q[0] + q[1]) / 2 - xc) <= 60)) { const m = frame_measure(v, xc, w); lg('W-E3c', n, 'plan window at drawn x', ri(xc), 'width', w, 'frame edges measured (sill,head):', m); if (m) Wd.push([ri(xc - w / 2), ri(xc + w / 2), m[0], m[1]]); }
        }
        const runs = wallruns(o, ac);
        for (const [cx, cy, r, a0, a1] of arcs) {
          if (Math.abs(cy - ac) <= 250) {
            const ends = [a0, a1].map(a => [cx + r * Math.cos(radians(a)), cy + r * Math.sin(radians(a))]); let e = ends[0]; for (const q of ends) if (Math.abs(q[1] - ac) < Math.abs(e[1] - ac)) e = q;
            const lo = Math.min(cx, e[0]), hi = Math.max(cx, e[0]); const mid = (lo + hi) / 2; const inwin = pw.some(([c_, w_]) => c_ - w_ / 2 - 1 <= mid && mid <= +c_ + w_ / 2 + 1);
            if (!runs.some(([a, b]) => a <= mid && mid <= b) && !inwin) Dr.push([xdraw(v, mid), r]);
          }
        }
      } else { // side elevations: plan windows on the wall axis (louvre W3), sill/head from the measured rule
        for (const [c, w] of pw) { const xc = xdraw(v, c); const m = w3_measure(v, xc); lg('W-E5', n, 'plan window width', w, 'at drawn x', ri(xc), 'vector 500 mm frame edges measured (sill,head):', m); Wd.push([ri(xc - w / 2), ri(xc + w / 2)].concat(w3_z(m, n))); }
      }
      lg('W-E2', n, 'windows (x0,x1,sill,head) as drawn', Wd.map(q => Tp(...q)), 'doors (centre,width)', Dr.map(([c, w]) => Tp(ri(c), ri(w))));
      const DH = [];
      for (const [c, wd] of Dr) {
        const doorv = [], doorv2 = [];
        for (const pp of SH[v.sheet]) for (let i = 0; i + 1 < pp.length; i++) {
          const a_ = pp[i], b_ = pp[i + 1]; if (Math.abs(a_[0] - b_[0]) >= 0.05 || Math.abs(a_[1] - b_[1]) * K < 1500) continue;
          const x_ = (a_[0] - v.ox) * K; const za = (v.ffl - a_[1]) * K, zb = (v.ffl - b_[1]) * K; const z0_ = Math.min(za, zb), z1_ = Math.max(za, zb); // sorted pair
          const dm = Math.min(Math.abs(x_ - (c - wd / 2)), Math.abs(x_ - (c + wd / 2)));
          if (Math.abs(z0_) <= 15 && dm <= 100) doorv.push([x_, z1_]); else if (Math.abs(z0_) <= 15 && dm <= 200) doorv2.push([x_, z1_]);
        }
        const tops = doorv.map(q => q[1]); const hd_ = decideL('door_head_above_ffl', tops.length ? Math.max(...tops) : null, BL.door_head_above_ffl, n + ' door at ' + RT.dfmt(ri(c)) + ': outer frame verticals ' + S(tops.map(z => ri(z))));
        let ff = null;
        if (tops.length) { let ob = doorv[0]; for (const q of doorv) if (q[1] > ob[1]) ob = q; const ox_ = ob[0]; const mt = Math.max(...tops); const cand = doorv.concat(doorv2).filter(([x_, z_]) => 20 <= Math.abs(x_ - ox_) && Math.abs(x_ - ox_) <= 100 && z_ < mt - 20).map(([x_]) => Math.abs(x_ - ox_)); ff = cand.length ? Math.min(...cand) : null; }
        decideL('door_frame_face', ff, BL.door_frame_face, n + ' door at ' + RT.dfmt(ri(c)) + ': outer to inner frame vertical');
        const rec = { view: n, centre: ri(c), value: hd_.value, status: hd_.status, measured: hd_.measured }; DH.push(rec); DHEADS.push(rec);
      }
      const width = v.width; const z0 = I(0), z1 = BH, ztop = ROOF_TOP;
      let o_ = ['0', 'SECTION', '2', 'ENTITIES'];
      o_ = o_.concat(lw('ELEV-WALL', [[I(0), z0], [width, z0], [width, z1], [I(0), z1]]));
      for (const [x0, x1, s, h] of Wd) o_ = o_.concat(lw('ELEV-GLAZING', [[x0, s], [x1, s], [x1, h], [x0, h]]));
      Dr.forEach(([c, wd], k) => { const dh_ = DH[k]; o_ = o_.concat(lw('ELEV-DOOR', [[c - wd / 2, I(0)], [c + wd / 2, I(0)], [c + wd / 2, dh_.value], [c - wd / 2, dh_.value]])); });
      for (const z of [I(-FG), I(0), BH, ztop]) o_ = o_.concat(['0', 'LINE', '8', 'ELEV-LEVEL', '10', '-500', '20', S(z), '30', '0', '11', S(I(+width + 500)), '21', S(z), '31', '0']);
      for (const [a, b, t] of [[I(-FG), I(0), FG], [I(0), BH, BH], [BH, ztop, RH]]) o_ = o_.concat(dim('ELEV-DIM', [I(-800), a], [I(-800), b], [I(-1000), (+a + +b) / 2], I(90), t));
      o_ = o_.concat(tx(I(-3000), I(-1000), '@VIEW=ELEV @BY=user'), tx(I(-3000), I(-1300), '@FACE=' + v.face + ' @BY=user'), tx(I(-3000), I(-1600), '@HAXIS=' + v.haxis + ' @BY=user'), tx(I(-3000), I(-1900), '@UNITS=mm @BY=user'));
      const zr = (+FG + +ztop) / 1000; o_ = o_.concat(tx(I(-3000), I(-2200), '@ROOF=' + S(zr) + ' @BY=user'), tx(I(-1500), I(-FG), '@Z=0 @BY=user'), tx(I(-1500), I(0), '@Z=' + S(+FG / 1000) + ' @BY=user'), tx(I(-1500), BH, '@Z=' + S((+FG + +BH) / 1000) + ' @BY=user'), tx(I(-1500), ztop, '@Z=' + S(zr) + ' @BY=user'));
      const GG = v.kind === 'x' ? GX : GY;
      for (const [k, gv] of GG) { const xd = xdraw(v, v.kind === 'x' ? gv : I(-gv)); o_ = o_.concat(tx(xd, I(-600), '@GRIDH=' + k + ' @BY=user')); }
      const BB = bubbles(v.sheet, v.label_row); const res = new Map();
      for (const [k, gv] of GG) {
        if (!BB.has(k)) continue; const xd = xdraw(v, v.kind === 'x' ? gv : I(-gv)); const [cx, cy, r_] = BB.get(k); const zc = pyRound((v.ffl - cy) * K, 1), rm = pyRound(r_ * K, 1); const drawn = (cx - v.ox) * K; res.set(k, pyRound(drawn - (n === 'REAR' ? +gv : +xd), 1));
        o_ = o_.concat(['0', 'LINE', '8', 'ELEV-GRID', '10', S(xd), '20', S(I(-FG)), '30', '0', '11', S(xd), '21', S(zc - rm), '31', '0'], ['0', 'CIRCLE', '8', 'ELEV-GRID', '10', S(xd), '20', S(zc), '30', '0', '40', S(rm)], ['0', 'TEXT', '8', 'ELEV-GRID', '10', S(xd), '20', S(zc), '30', '0', '40', '150', '1', k]);
      }
      lg('W-C3', n, 'bubbles read', I(BB.size), 'of', I(GG.size), 'residual drawn vs dictionary mm', res, (res.size && Math.max(...[...res.values()].map(Math.abs)) <= 30) ? 'PASS' : 'WRONG');
      o_ = o_.concat(['0', 'ENDSEC', '0', 'EOF']); const fn = 'elev_' + n.toLowerCase() + '.dxf'; sheets[fn] = o_.join('\n') + '\n'; lg('W-E4 wrote', fn);
    }
    return { sheets, doorHeads: DHEADS, log: L };
  }
  return { run };
});
