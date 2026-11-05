// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 — port of scripts/pdf2bim/to_std.py (§23: maps our PDF-*/ELEV-* layers to the importer's STD scheme, writes the roof sheet, adds the typed markings). Pure; UMD: window.Pdf2DxfStd.
// run(markedPlan, elevSheets, R, inferred, doorHeads) -> {sheets:{'plan.dxf','elev_*.dxf','roof.dxf'}, log}
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./py_rt.js')); else root.Pdf2DxfStd = factory(root.Pdf2DxfRt); })(typeof self !== 'undefined' ? self : this, function (RT) {
  'use strict';
  const { I, T: Tp, pyRound, pyRoundInt, hypot, radians } = RT; const S = RT.str;
  const LAY = { 'PDF-WALL': 'A-WALL-FULL', 'PDF-WINDOW': 'A-GLAZ', 'PDF-DOOR-SWING': 'A-DOOR', 'PDF-COLUMN': 'A-COLS', 'PDF-GRID': 'A-GRID', 'PDF-TAG': 'A-ANNO-NOTE', 'PDF-FIXTURE-ARC': 'A-ANNO-NOTE', 'PDF-UNCLASSIFIED': 'A-ANNO-NOTE',
    'ELEV-WALL': 'A-WALL', 'ELEV-GLAZING': 'A-GLAZ', 'ELEV-DOOR': 'A-DOOR', 'ELEV-LEVEL': 'A-ANNO-LEVL', 'ELEV-DIM': 'A-ANNO-DIMS', 'ELEV-GRID': 'A-GRID' };
  function run(plan, elevSheets, R, Iv, doorHeads) {
    const L = []; const pr = s => L.push(s);
    const VAL = k => Iv.values[k].value; const FG = VAL('ffl_above_ground'), BH = VAL('beam_above_ffl'), RH = VAL('ridge_above_beam'); const FLOORZ = +FG / 1000, BEAMZ = (+FG + +BH) / 1000, TOPZ = (+FG + +BH + +RH) / 1000;
    const lastEndsec = d => { let j = -1; for (let k = 0; k < d.length - 1; k++) if (d[k] === 'ENDSEC' && d[k - 1] === '0') j = k; return j; };
    const conv = (src, marks, extra) => {
      const d = src.split('\n'); for (let i = 0; i < d.length - 1; i += 2) if (d[i] === '8' && Object.prototype.hasOwnProperty.call(LAY, d[i + 1])) d[i + 1] = LAY[d[i + 1]];
      const j = lastEndsec(d); let M = [];
      marks.forEach((m, n) => {
        if (Array.isArray(m)) M = M.concat(['0', 'TEXT', '8', 'DXF2BIM-MARK', '10', S(pyRound(m[1], 1)), '20', S(pyRound(m[2], 1)), '30', '0', '40', '150', '1', m[0] + ' @BY=model']);
        else M = M.concat(['0', 'TEXT', '8', 'DXF2BIM-MARK', '10', '-3000', '20', S(I(-2500 - 300 * n)), '30', '0', '40', '150', '1', m + ' @BY=user']);
      });
      return d.slice(0, j - 1).concat(extra || [], M, d.slice(j - 1));
    };
    const gx = R.grid.x, gy = R.grid.y;
    const dim = (p1, p2, anchor, rot, text) => ['0', 'DIMENSION', '8', 'A-ANNO-DIMS', '10', S(anchor[0]), '20', S(anchor[1]), '30', '0', '13', S(p1[0]), '23', S(p1[1]), '33', '0', '14', S(p2[0]), '24', S(p2[1]), '34', '0', '70', '0', '50', S(rot), '1', S(text)];
    let PD = [];
    for (const [a, b, off] of [['A', 'B', 1], ['A', 'C', 2], ['C', 'D', 1], ['D', 'E', 1], ['A', 'E', 3]]) PD = PD.concat(dim([gx.get(a), I(0)], [gx.get(b), I(0)], [(+gx.get(a) + +gx.get(b)) / 2, I(900 + off * 450)], I(0), I(+gx.get(b) - +gx.get(a))));
    for (const [a, b, off] of [['5', '4', 1], ['4', '3', 1], ['5', '3', 2], ['3', '2', 1], ['2', '1', 1], ['5', '1', 3]]) PD = PD.concat(dim([I(0), I(-gy.get(a))], [I(0), I(-gy.get(b))], [I(-900 - off * 450), -(+gy.get(a) + +gy.get(b)) / 2], I(90), I(+gy.get(b) - +gy.get(a))));
    // @TAG marks: family per opening (JSON library_binding); each opening takes the class of its NEAREST plan tag text (D#/W#)
    const pl = plan.split('\n'); const ents = []; let inent = false;
    for (let i = 0; i < pl.length - 1; i += 2) {
      if (pl[i] === '2' && pl[i + 1] === 'ENTITIES') inent = true;
      if (inent && pl[i] === '0' && ['LINE', 'ARC', 'TEXT'].indexOf(pl[i + 1]) >= 0) { const ty = pl[i + 1]; const d = {}; let j = i + 2; while (pl[j] !== '0') { d[pl[j]] = pl[j + 1]; j += 2; } ents.push([ty, d]); }
    }
    const tags = ents.filter(([ty, d]) => ty === 'TEXT' && d['8'] === 'PDF-TAG').map(([, d]) => [parseFloat(d['10']), parseFloat(d['20']), d['1']]);
    const LB = R.library_binding; const TG = []; const SZ = R.schedule_sizes_mm; const WCL = new Map(); for (const k of ['W1', 'W2', 'W3']) WCL.set(+SZ[k][0], k);
    const nearest = (x, y, kinds) => { const c = tags.filter(t => kinds.indexOf(t[2][0]) >= 0); let b = c[0], bd = hypot(b[0] - x, b[1] - y); for (const t of c) { const d = hypot(t[0] - x, t[1] - y); if (d < bd) { bd = d; b = t; } } return b; };
    const wl = ents.filter(([ty, d]) => ty === 'LINE' && d['8'] === 'PDF-WINDOW').map(([, d]) => ['10', '20', '11', '21'].map(k => parseFloat(d[k])));
    for (let q = 0; q < wl.length; q += 4) {
      const g4 = wl.slice(q, q + 4); const xs = [], ys = []; for (const a of g4) { xs.push(a[0], a[2]); ys.push(a[1], a[3]); }
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; const wide = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      let bw = null, bd = null; for (const w of WCL.keys()) { const d = Math.abs(w - wide); if (bd === null || d < bd) { bd = d; bw = w; } }
      const cls_ = WCL.get(bw); const fam = LB[cls_].family; TG.push(['@TAG=window,' + fam, cx, cy]);
    }
    for (const [ty, d] of ents) {
      if (ty === 'ARC' && d['8'] === 'PDF-DOOR-SWING') {
        const r = parseFloat(d['40']); const hx = parseFloat(d['10']), hy = parseFloat(d['20']); const m = radians(parseFloat(d['50']) + RT.pymod(parseFloat(d['51']) - parseFloat(d['50']), 360) / 2);
        const cx = hx + r / 2 * pyRoundInt(Math.sqrt(2) * Math.cos(m)), cy = hy + r / 2 * pyRoundInt(Math.sqrt(2) * Math.sin(m)); const t = nearest(cx, cy, 'D'); const fam = LB[t[2]].family;
        TG.push(['@TAG=door,' + fam, cx, cy]);
        pr(['§PDF S2 door arc r', S(I(pyRoundInt(r))), 'at', S(Tp(I(pyRoundInt(cx)), I(pyRoundInt(cy)))), 'nearest tag', t[2], '->', fam, LB[t[2]].exact ? 'exact' : 'STAND-IN'].join(' '));
      }
    }
    const SCH = ['D1', 'D2', 'D3'].map(k => '@SCHEDULE=' + LB[k].family + ',door,' + RT.dfmt(SZ[k][0]) + ',' + RT.dfmt(SZ[k][1]));
    const OR = R.owner_rulings; const OA = OR._accept; const ACC = []; for (const k of Object.keys(OR)) { if (k.startsWith('_')) continue; for (const c of OR[k]) ACC.push('@ACCEPT=' + c + ',' + OA.who + ',' + OA.date + ',' + OA.reason); }
    const DH_ = doorHeads || []; let HF = [];
    if (DH_.length && DH_.every(d_ => d_.status !== 'DEFAULT' && Math.abs(d_.measured - SZ.D1[1]) <= 15)) HF = ['@HEADFRAME=0'];
    pr('§PDF S3 door heads read ' + S(DH_.map(d_ => Tp(d_.view, d_.measured, d_.status))) + ' schedule ' + S(SZ.D1[1]) + ' -> ' + (HF.length ? S(HF) : 'no mark: the importer adds its head frame'));
    const sheets = {};
    sheets['plan.dxf'] = conv(plan, ['@UNITS=mm', '@SET=STD', '@LEVEL=' + S(FLOORZ)].concat(HF, SCH, ACC, TG), PD).join('\n');
    for (const f of Object.keys(elevSheets).sort()) sheets[f] = conv(elevSheets[f], ['@SET=STD']).join('\n');
    // roof sheet: main gable outline only (porch gable not drawn: yellow)
    const WX = [], WY = []; let _in = false;
    for (let i = 0; i < pl.length - 1; i += 2) {
      if (pl[i] === '2' && pl[i + 1] === 'ENTITIES') _in = true;
      if (_in && pl[i] === '0' && pl[i + 1] === 'LWPOLYLINE') { const g = []; let j = i + 2; while (pl[j] !== '0') { g.push([pl[j], pl[j + 1]]); j += 2; } const dd = {}; for (const [a, b] of g) dd[a] = b; if (dd['8'] === 'PDF-WALL') { for (const [a, b] of g) { if (a === '10') WX.push(parseFloat(b)); if (a === '20') WY.push(parseFloat(b)); } } }
    }
    const pts = [[Math.min(...WX), Math.max(...WY)], [Math.max(...WX), Math.max(...WY)], [Math.max(...WX), Math.min(...WY)], [Math.min(...WX), Math.min(...WY)]];
    let rf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', 'A-ROOF', '90', S(I(pts.length)), '70', '1']; for (const [x, y] of pts) rf.push('10', S(x), '20', S(y)); rf.push('0', 'ENDSEC', '0', 'EOF');
    const mk = ['@UNITS=mm', '@SET=STD', '@VIEW=ROOF', '@NAME=ROOF PLAN', '@LEVEL=' + S(BEAMZ), '@ROOF=' + S(TOPZ)]; for (const k of gx.keys()) mk.push('@GRIDX=' + k);
    let M = [];
    mk.forEach((m, n) => { const gxm = m.startsWith('@GRIDX'); const x = !gxm ? I(-3000) : gx.get(m.split('=')[1]); const y = !gxm ? I(-2500 - 300 * n) : I(600); M = M.concat(['0', 'TEXT', '8', 'DXF2BIM-MARK', '10', S(x), '20', S(y), '30', '0', '40', '150', '1', m + ' @BY=user']); });
    for (const [k, v] of gy) M = M.concat(['0', 'TEXT', '8', 'DXF2BIM-MARK', '10', '-600', '20', S(I(-v)), '30', '0', '40', '150', '1', '@GRIDY=' + k + ' @BY=user']);
    rf = rf.slice(0, -4).concat(M, rf.slice(-4)); sheets['roof.dxf'] = rf.join('\n') + '\n';
    pr(['§PDF S1 wrote plan (+', S(I(Math.floor(PD.length / 21))), 'DIMENSIONs), elevations', S(I(Object.keys(elevSheets).length)), ', roof into typed | roof outline', S(pts.map(q => Tp(...q))), 'LEVEL', S(BEAMZ), 'ROOF', S(TOPZ)].join(' '));
    return { sheets, log: L };
  }
  return { run };
});
