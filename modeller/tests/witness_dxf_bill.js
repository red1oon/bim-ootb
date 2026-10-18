// W-BILL (prompts/DXF2BIM_MODELLER_LANE.md §L13.1). Issue: a best-effort building needs a roughly right cost whose every number is traceable: a quantity FORMULA stated in a JSON reference,
// a rate that comes from the rate pack (never invented), and the share of the cost that rests on assumptions. Read the log; exit code is not evidence.
const fs = require('fs'), path = require('path');
const BL = require('../dxf2bill.js'), ref = require('../synthetic_ref.json'), pack = require('../../viewer/rates/cidb2024_my.json');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const box = (x0, y0, z0, x1, y1, z1) => { const V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  return { vertices: V, faces: [[4, 5, 6], [4, 6, 7], [0, 2, 1], [0, 3, 2], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]] }; };
const body = (id, cls, m, prov, label) => Object.assign({ guid: id, class: cls, kind: cls, prov, ifc: label ? { type_name: label } : null }, m);

// BL1 evaluator
const E = BL.evalFormula;
ok('BL1 the evaluator does arithmetic over named measures: A * (t / t_ref) with A 6, t 0.3, t_ref 0.15 = 12; unary minus and parentheses work', E('A * (t / t_ref)', { A: 6, t: 0.3, t_ref: 0.15 }) === 12 && E('-(2 + 3) * 2', {}) === -10);
const refused = ['process.exit(1)', 'Math.max(1,2)', 'A; 1', 'x = 2', '"a"', 'A.b', 'constructor', '1 / 0', 'A +'].map(s => { try { E(s, { A: 1 }); return s + ' ran'; } catch (e) { return null; } }).filter(Boolean);
ok('BL1b CONTROL no code runs: a function call, a statement, an assignment, a string, a property, an unknown name, a division by zero and a dangling operator are all refused', refused.length === 0, refused.join(' | '));
// BL2 measures
const m = BL.measures(box(0, 0, 0, 3, 0.15, 2));
ok('BL2 measures of a 3 x 0.15 x 2 m prism: V 0.9, A 6 (the big face), t 0.15, L 3, N 1 (exact)', Math.abs(m.V - 0.9) < 1e-12 && Math.abs(m.A - 6) < 1e-12 && Math.abs(m.t - 0.15) < 1e-12 && m.L === 3 && m.N === 1, JSON.stringify(m));
// BL3 wall
const wall = body('w1', 'IfcWall', box(0, 0, 0, 3, 0.15, 2), 'drawn', '5" Brick Wall'), thick = body('w2', 'IfcWall', box(0, 0, 0, 3, 0.30, 2), 'drawn', '10" Brick Wall');
let b = BL.bill([wall, thick], { ref, pack, packName: 'cidb2024_my' });
const w1 = b.lines[0], w2 = b.lines[1], pw = pack.materials.IfcWall;
ok('BL3 a 3 x 2 m wall 0.15 m thick: quantity A = 6 M2, rate and unit from the pack class IfcWall, factor t/t_ref = 1, amount = rate x 6, material from the label (Brick masonry), formula shown', w1.quantity === 6 && w1.unit === 'M2' && w1.rate === pw.rate && w1.factor === 1 && Math.abs(w1.amount - pw.rate * 6) < 1e-9 && w1.material === 'Brick masonry' && w1.formula === 'A' && w1.pack_desc === pw.desc, JSON.stringify(w1).slice(0, 300));
ok('BL3b the same wall 0.30 m thick costs twice per area (factor 2; t_ref 0.15 m read from the pack description "' + pw.desc + '")', w2.factor === 2 && Math.abs(w2.amount - 2 * w1.amount) < 1e-9 && /t_ref = 0.15/.test(w2.factor_formula));
// BL4 no rate
const noRate = { materials: { IfcWall: pw } };
b = BL.bill([body('c1', 'IfcColumn', box(0, 0, 0, 0.3, 0.3, 3), 'drawn')], { ref, pack: noRate });
ok('BL4 CONTROL a class with no pack rate costs 0 and is flagged no_rate (never priced at a guess)', b.lines[0].amount === 0 && b.lines[0].flags.includes('no_rate') && b.flags[0].flag === 'no_rate' && b.totals.amount === 0);
// BL5 unit mismatch
const mis = JSON.parse(JSON.stringify(pack)); mis.materials.IfcRoof.unit = 'EA';
b = BL.bill([body('r1', 'IfcRoof', box(0, 0, 0, 10, 6, 0.0254), 'assumed')], { ref, pack: mis });
ok('BL5 CONTROL a pack unit that disagrees with the formula basis (pack EA vs formula M2) is flagged unit_mismatch and not priced', b.lines[0].flags.includes('unit_mismatch') && b.lines[0].amount === 0);
// BL6 totals by provenance
const mix = [body('a', 'IfcWall', box(0, 0, 0, 3, 0.15, 2), 'drawn'), body('d', 'IfcSlab', box(0, 0, 0, 4, 5, 0.25), 'derived'), body('s', 'IfcRoof', box(0, 0, 0, 10, 6, 0.0254), 'assumed'), body('f', 'IfcFooting', box(0, 0, 0, 1.2, 1.5, 0.3), 'drawn')];
b = BL.bill(mix, { ref, pack });
const sumLines = b.lines.reduce((s, l) => s + l.amount, 0);
ok('BL6 totals equal the sum of lines and split by evidence: drawn + derived + assumed == total; by class shown', Math.abs(b.totals.amount - sumLines) < 1e-4 && Math.abs(b.totals.by_prov.drawn + b.totals.by_prov.derived + b.totals.by_prov.assumed - b.totals.amount) < 1e-4 && b.totals.by_prov.assumed > 0 && b.totals.by_class.IfcSlab > 0, b.log);
ok('BL6b slab thickness factor: a 0.25 m slab against the pack "' + pack.materials.IfcSlab.desc + '" has factor 1; a footing is priced by volume (M3)', b.lines[1].factor === 1 && b.lines[3].unit === 'M3' && Math.abs(b.lines[3].quantity - 1.2 * 1.5 * 0.3) < 1e-9);
// BL7 determinism, BL9 FALSIFIER
ok('BL7 deterministic: the same bodies twice give the same bill', JSON.stringify(BL.bill(mix, { ref, pack })) === JSON.stringify(BL.bill(mix, { ref, pack })));
const bad = JSON.parse(JSON.stringify(ref)); bad.parts.IfcWall.quantity.formula = 'A * A';
ok('BL9 FALSIFIER editing the formula in the JSON reference changes the amount (the reference, not the code, states the quantity)', BL.bill([wall], { ref: bad, pack }).lines[0].amount !== w1.amount);
const evil = JSON.parse(JSON.stringify(ref)); evil.parts.IfcWall.quantity.formula = 'process.exit(1)';
ok('BL9b CONTROL a hostile formula in the reference is refused (throws) and never runs', (() => { try { BL.bill([wall], { ref: evil, pack }); return false; } catch (e) { return /function calls|unexpected|unknown name/.test(e.message); } })());
// every part entry's unit matches the pack's unit for its class (the reference is consistent with the default pack)
const inc = Object.keys(ref.parts).filter(k => { const p = ref.parts[k], pe = pack.materials[p.rate_ref.class]; return !pe || pe.unit !== p.quantity.unit; });
ok('BL10 the reference is consistent with the default pack: every part entry has a pack class and the same unit (' + Object.keys(ref.parts).length + ' entries)', inc.length === 0, inc.join(','));
console.log(fail ? 'FAIL W-BILL ' + fail : 'PASS W-BILL'); process.exit(fail ? 1 : 0);
