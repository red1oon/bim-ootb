// W-PAIR (prompts/DXF2BIM_MODELLER_LANE.md §L10). Issue: a drawn length had no stated source; text and line could silently disagree (shed: 410'-0" x5 vs 1,560 in).
// Every length must be paired with a number, the number is the value, a conflict is a visible row, and an edit recalculates deterministically. Read the log; exit code is not evidence.
const fs = require('fs'), path = require('path');
const Pr = require('../dxf2pair.js');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const L = (id, x0, y0, x1, y1, sheet) => ({ id, a: [x0, y0], b: [x1, y1], sheet: sheet || 's' });
const D = (h, x0, y0, x1, y1, measure, text, sheet) => ({ handle: h, p1: [x0, y0], p2: [x1, y1], measure, text, sheet: sheet || 's' });
const one = (lens, dims, o) => Pr.pair(lens, dims, o);

// number grammar
ok('N1 feet-inch grammar: 410\'-0" = 4920 in, 16\' = 192, 8\'-4 1/2" = 100.5, 12" = 12, 1.5" = 1.5, bare 7 = 7 sheet units; MTEXT codes stripped',
  Pr.parseNumber('410\'-0"') === 4920 && Pr.parseNumber('16\'') === 192 && Pr.parseNumber('8\'-4 1/2"') === 100.5 && Pr.parseNumber('12"') === 12 && Pr.parseNumber('1.5"') === 1.5 && Pr.parseNumber('7') === 7 && Pr.parseNumber('\\A1;16\'-4"') === 196);
ok('N2 not a length -> null, never guessed (L/5, ld, Min. 2h, Splice*)', ['L/5', 'ld', '{\\fArial|b0;Min. 2h}', 'Splice*', ''].every(t => Pr.parseNumber(t) === null));
ok('N3 mm sheet: 12" = 304.8 sheet units', Math.abs(Pr.parseNumber('12"', 'mm') - 304.8) < 1e-9);

let r = one([L('c1', 0, 0, 12, 0)], [D('d1', 0, 5, 12, 5, 12, '')]);
ok('P1 a dimension on the length\'s end points pairs with it (auto-measured -> PAIRED_AGREE)', r.pairs[0].class === 'PAIRED_AGREE' && r.pairs[0].source === 'dim' && r.pairs[0].number === 12, JSON.stringify(r.pairs[0].candidates));
r = one([L('c1', 0, 0, 12, 0)], [D('d1', 1, 5, 13, 5, 12, '')]);
ok('P2 CONTROL a dimension 1 in off the end points does not pair -> UNPAIRED', r.pairs[0].class === 'UNPAIRED' && r.pairs[0].number === null);
r = one([L('bay', 0, 0, 30, 0)], [D('a', 0, 3, 10, 3, 10, ''), D('b', 10, 3, 20, 3, 10, ''), D('c', 20, 3, 30, 3, 10, '')]);
ok('P3 a chain of 3 collinear dimensions pairs the whole bay (number = sum 30)', r.pairs[0].source === 'chain' && r.pairs[0].number === 30 && r.pairs[0].class === 'PAIRED_AGREE');
r = one([L('x', 0, 0, 50, 0)], [D('d', 0, 4, 50, 4, 50, '12"')]);
ok('P4 override 12" on a 50 in line = PAIRED_CONFLICT, ratio 4.1667, number 12 in force', r.pairs[0].class === 'PAIRED_CONFLICT' && r.pairs[0].number === 12 && r.pairs[0].ratio === 4.1667 && r.rows.length === 1);
const lens5 = [0, 1, 2, 3, 4].map(i => L('L' + i, 0, i * 300, 1560, i * 300)), dims5 = [0, 1, 2, 3, 4].map(i => D('d' + i, 0, i * 300 + 5, 1560, i * 300 + 5, 1560, '410\'-0"'));
r = one(lens5, dims5);
ok('P5 410\'-0" vs 1,560 in x5 = 5 conflicts but exactly ONE yellow row; ratio 0.3171', r.summary.conflict === 5 && r.rows.length === 1 && r.rows[0].ids.length === 5 && Math.abs(r.pairs[0].ratio - 0.3171) < 1e-4, r.log);
ok('P6 auto-measured dimension = PAIRED_AGREE (no row)', one([L('a', 0, 0, 20, 0)], [D('d', 0, 2, 20, 2, 20, '<>')]).rows.length === 0);
r = one([L('a', 0, 0, 20, 0), L('b', 0, 50, 7, 50)], [D('d', 0, 2, 20, 2, 20, '')]);
ok('P7 a length with no dimension/label = UNPAIRED, value = measured as a default number, one yellow row', r.pairs[1].class === 'UNPAIRED' && r.pairs[1].value === 7 && r.pairs[1].value_is_default && r.rows.length === 1);
const t1 = one([L('a', 0, 0, 100, 0)], [D('d', 0, 2, 100, 2, 100, '100"')]), t2 = one([L('a', 0, 0, 100, 0)], [D('d', 0, 2, 100, 2, 100, '60"')]);
ok('P8 FALSIFIER editing the number in the text flips the class (100" agree -> 60" conflict)', t1.pairs[0].class === 'PAIRED_AGREE' && t2.pairs[0].class === 'PAIRED_CONFLICT');
// P10/P11/P12 alignment + recalc
let al = Pr.align(0, 12, 14, true, false);
ok('P10 one side pinned: the free side moves by the number (a stays 0, b = 14), residual 0', al.a === 0 && al.b === 14 && al.code === 'OK');
al = Pr.align(0, 12, 14, true, true);
ok('P11 two pinned sides disagreeing: anchors unmoved, ALIGN:overconstrained, residual -2', al.a === 0 && al.b === 12 && al.code === 'ALIGN:overconstrained' && al.residual === -2);
ok('P11b neither pinned: centre kept, ALIGN:floating', (a => a.a === -1 && a.b === 13 && a.code === 'ALIGN:floating')(Pr.align(0, 12, 14, false, false)));
ok('P12 determinism: the same drawing + numbers twice give identical pairs', JSON.stringify(one(lens5, dims5)) === JSON.stringify(one(lens5, dims5)));
const edit = one([L('a', 0, 0, 100, 0), L('b', 0, 200, 40, 200)], [D('d1', 0, 2, 100, 2, 100, ''), D('d2', 0, 202, 40, 202, 40, '')]), edit2 = one([L('a', 0, 0, 100, 0), L('b', 0, 200, 40, 200)], [D('d1', 0, 2, 100, 2, 100, ''), D('d2', 0, 202, 40, 202, 40, '48"')]);
ok('P10b editing one number changes exactly that length\'s pair', edit.pairs[0].number === edit2.pairs[0].number && edit.pairs[1].number === 40 && edit2.pairs[1].number === 48);
// precedence
const plan = D('p', 0, 3, 50, 3, 50, '50"', 'plan'), det = D('t', 0, 3, 50, 3, 50, '48"', 'detail');
r = one([L('x', 0, 0, 50, 0, 'plan')], [plan, det], { scale: { plan: 0.02, detail: 0.2 } });
ok('P13 detail (larger scale) vs plan number: the detail is in force, the plan stays listed', r.pairs[0].number === 48 && r.pairs[0].rule === 'larger_scale' && r.pairs[0].candidates.length === 2);
r = one([Object.assign(L('x', 0, 0, 50, 0, 'plan'), { user: 49 })], [plan, det], { scale: { plan: 0.02, detail: 0.2 } });
ok('P14 @BY=user beats both', r.pairs[0].number === 49 && r.pairs[0].rule === 'user');
r = one([L('x', 0, 0, 50, 0, 'plan')], [plan, det]);
ok('P15 equal rank (no scale known), both agree within nothing: row open, no winner', r.pairs[0].class === 'OPEN' && r.pairs[0].number === null && r.pairs[0].value === 50 && r.pairs[0].value_is_default);
r = one([L('x', 0, 0, 50, 0, 'plan')], [plan, D('t', 0, 3, 50, 3, 50, '12"', 'detail')], { nts: ['detail'] });
ok('P16 NTS view loses to the scaled sheet and raises no geometry conflict', r.pairs[0].number === 50 && r.pairs[0].class === 'PAIRED_AGREE' && r.rows.length === 0, r.log);
r = one([L('x', 0, 0, 50, 0, 'detail')], [D('t', 0, 3, 50, 3, 50, '12"', 'detail')], { nts: ['detail'] });
ok('P16b the same NTS number alone is NTS_DETAIL, not a conflict', r.pairs[0].class === 'NTS_DETAIL' && r.rows.length === 0);

// P9 real shed (local material; SKIP when absent): closed rectangles on structural layers, every side paired or listed
const SH = process.env.SHED_SHEETS || path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets/');
if (!fs.existsSync(path.join(SH, '0_FLOOR_PLAN.dxf'))) console.log('SKIP P9: local shed sheets not present');
else {
  const P = require('../lib/dxf-parser.js'), Dp = P.default || P, lens = [], dims = [];
  fs.readdirSync(SH).filter(f => /^[0-9].*\.dxf$/.test(f) && !/^1_/.test(f)).sort().forEach(f => {
    const d = new (Dp.DxfParser || Dp)().parseSync(fs.readFileSync(path.join(SH, f), 'utf8'));
    dims.push(...Pr.dimsOf(d.entities, f));
    d.entities.forEach(e => { if (e.type === 'LWPOLYLINE' && e.shape && e.vertices && e.vertices.length === 4 && ['Col', 'Fo', 'Slab', 'Wall'].includes(e.layer))
      for (let i = 0; i < 4; i++) { const a = e.vertices[i], b = e.vertices[(i + 1) % 4]; lens.push({ id: f + ':' + e.handle + ':' + i, a: [a.x, a.y], b: [b.x, b.y], sheet: f }); } });
  });
  const R = Pr.pair(lens, dims, { unit: 'in' }), s = R.summary;
  console.log(R.log + '  dims=' + dims.length + ' rows=' + R.rows.length);
  const bySheet = {}; R.pairs.forEach(p => { const b = bySheet[p.sheet] = bySheet[p.sheet] || {}; b[p.class] = (b[p.class] || 0) + 1; }); console.log(JSON.stringify(bySheet));
  ok('P9 real shed: every side of every closed structural rectangle is in the report (agree+rounded+conflict+unpaired+nts+open == lengths)', s.agree + s.rounded + s.conflict + s.unpaired + s.nts + s.open === lens.length && lens.length > 0, 'lengths=' + lens.length);
  // P9b: the dimensions on the shed state PITCHES (centre to centre), not member sizes: pair consecutive column/footing centres in a row with them
  const pitch = []; ['0_FLOOR_PLAN.dxf', '4_FOUNDATION_LAYOUT.dxf'].forEach(f => {
    const d = new (Dp.DxfParser || Dp)().parseSync(fs.readFileSync(path.join(SH, f), 'utf8')), rows = {};
    d.entities.forEach(e => { if (e.type === 'LWPOLYLINE' && e.shape && e.vertices.length === 4 && ['Col', 'Fo'].includes(e.layer)) { const xs = e.vertices.map(v => v.x), ys = e.vertices.map(v => v.y), c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], k = e.layer + Math.round(c[1]); (rows[k] = rows[k] || []).push(c); } });
    Object.keys(rows).forEach(k => { const r = rows[k].sort((a, b) => a[0] - b[0]); for (let i = 0; i + 1 < r.length; i++) pitch.push({ id: f + ':' + k + ':' + i, a: r[i], b: r[i + 1], sheet: f }); });
  });
  const RP = Pr.pair(pitch, dims, { unit: 'in' }); console.log('pitch ' + RP.log + ' rows=' + RP.rows.length);
  ok('P9b real shed: consecutive column/footing centre pitches reach their dimension chains (some paired, none silently dropped)', RP.summary.lengths === pitch.length && pitch.length > 0 && RP.summary.agree + RP.summary.rounded + RP.summary.conflict > 0, 'paired=' + (RP.summary.agree + RP.summary.rounded + RP.summary.conflict) + ' of ' + pitch.length);
}
console.log(fail ? 'FAIL W-PAIR ' + fail : 'PASS W-PAIR'); process.exit(fail ? 1 : 0);
