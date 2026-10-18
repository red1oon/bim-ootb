// W-SYNTH (prompts/DXF2BIM_MODELLER_LANE.md §L13.2). Issue: a drawing set implies parts it does not draw (the floor slab, the roof). A coherent building needs them, but they must be
// recognisably synthetic (derived provenance + yellow defaults), computed only from drawn evidence, and a missing input is a gap, never a guess. Read the log; exit code is not evidence.
const fs = require('fs'), path = require('path');
const I = require('../dxf2bim_import.js'), P = require('../dxf2prep.js'), B = require('../dxf2bodies.js'), ST = require('../dxf2structure.js'), SY = require('../dxf2synth.js'), BL = require('../dxf2bill.js'), ref = require('../synthetic_ref.json'), pack = require('../../viewer/rates/cidb2024_my.json');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const g = (c, v) => c + '\n' + v + '\n';
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const tx = (t, x, y) => g(0, 'TEXT') + g(8, 'Tex') + g(10, x) + g(20, y) + g(30, 0) + g(40, 20) + g(1, t);
const LD = (h, pts) => g(0, 'LEADER') + g(5, h) + g(8, 'Dim') + g(100, 'AcDbLeader') + g(76, pts.length) + pts.map(p => g(10, p[0]) + g(20, p[1]) + g(30, 0)).join('');
const poly = (layer, x0, y0, x1, y1, h) => g(0, 'LWPOLYLINE') + g(5, h) + g(8, layer) + g(90, 4) + g(70, 1) + g(10, x0) + g(20, y0) + g(10, x1) + g(20, y0) + g(10, x1) + g(20, y1) + g(10, x0) + g(20, y1);
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const lbox = (layer, x0, y0, x1, y1) => line(layer, x0, y0, x1, y0) + line(layer, x1, y0, x1, y1) + line(layer, x1, y1, x0, y1) + line(layer, x0, y1, x0, y0);
const hatch = (handle, vs) => g(0, 'HATCH') + g(5, handle) + g(8, 'Wall') + g(100, 'AcDbHatch') + g(10, 0) + g(20, 0) + g(30, 0) + g(2, 'BLOCKS') + g(70, 0) + g(71, 0) + g(91, 1) + g(92, 3) + g(72, 0) + g(73, 1) + g(93, vs.length) + vs.map(v => g(10, v[0]) + g(20, v[1])).join('') + g(97, 0) + g(75, 1) + g(76, 1) + g(98, 0);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
// a 6 m (x) by 4 m (y) shed: grids A=1000 .. B=7000 (x), 1=150 .. 2=4150 (y); columns at the four grid crossings 300 mm square, 0..3 m
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 7000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 4150], ['@LAYER=Col,column']];
const cx = [850, 6850], cy = [0, 4000], cols = []; cx.forEach(x => cy.forEach(y => cols.push([x, y])));
const planDxf = doc(cols.map(([x, y], i) => poly('Col', x, y, x + 300, y + 300, 'C' + i)).join(''), PLAN);
const SOUTH = [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=S'], ['@GRIDH=A', 1000, 0], ['@GRIDH=B', 7000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Col,column']];
const southDxf = doc(lbox('Col', 850, 0, 1150, 3000) + lbox('Col', 6850, 0, 7150, 3000), SOUTH);
const END = (face, name) => [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=' + face], ['@HAXIS=+Y'], ['@UNITS=mm'], ['@NAME=' + name], ['@GRIDH=1', 150, 0], ['@GRIDH=2', 4150, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Wall,panel']];
const LOW = [[150, 0], [4150, 0], [4150, 3000], [150, 3000]], GAB = [[150, 3000], [4150, 3000], [2150, 3500]];
const endBody = poly0 => hatch('H1', LOW) + LD('L1', [[500, 1000], [700, -300], [900, -300]]) + tx('10" Brick Wall', 900, -300) + hatch('H2', GAB) + LD('L2', [[2150, 3200], [2500, 3800], [2800, 3800]]) + tx('5" Brick Wall', 2800, 3800);
const west = doc(endBody(), END('minX', 'W')), east = doc(endBody(), END('maxX', 'E'));
const read = files => I.readSheets(files.map(([n, t]) => ({ name: n, text: t })), { prep: P });
const mesh = e => { let v = 0; e.faces.forEach(([a, b, c]) => { const A = e.vertices[a], Bv = e.vertices[b], C = e.vertices[c]; v += (A[0] * (Bv[1] * C[2] - Bv[2] * C[1]) - A[1] * (Bv[0] * C[2] - Bv[2] * C[0]) + A[2] * (Bv[0] * C[1] - Bv[1] * C[0])) / 6; }); return v; };
const bb = e => [0, 1, 2].map(i => { const a = e.vertices.map(v => v[i]); return [Math.min(...a), Math.max(...a)].map(v => Math.round(v * 1e6) / 1e6); });

let sh = read([['plan.dxf', planDxf], ['south.dxf', southDxf], ['west.dxf', west], ['east.dxf', east]]), j = ST.judge(sh, { I, B }), els = j.gate.R.els;
ok('SY0 the drawn part first: 4 columns + 4 panels (2 lower, 2 gable tops: West and East ends), 0 blocking', els.filter(e => e.kind === 'column').length === 4 && els.filter(e => e.kind === 'panel').length === 4 && j.gate.verdict.blocking.length === 0, j.log);
let r = SY.complete(sh, els, { slabT: 0.25, roofT: 0.0254 });
const slab = r.els.find(e => e.kind === 'slab'), roofs = r.els.filter(e => e.kind === 'roof');
ok('SY1 ground slab: footprint = the outermost grid lines (x 1..7 m, y 0.15..4.15 m), top = the lowest column base (0), 0.25 m thick, IfcSlab/BASESLAB, derived', slab && JSON.stringify(bb(slab)) === JSON.stringify([[1, 7], [0.15, 4.15], [-0.25, 0]]) && slab.class === 'IfcSlab' && slab.prov === 'derived' && slab.ifc.PredefinedType === 'BASESLAB', slab && JSON.stringify(bb(slab)));
ok('SY1b slab volume = 6 x 4 x 0.25 = 6 m3 with outward windings', slab && Math.abs(mesh(slab) - 6) < 1e-9, slab && mesh(slab).toFixed(6));
ok('SY2 gabled roof: two sloping sheets, eave z 3.0 m at y 0.15 and 4.15, ridge z 3.5 m at y 2.15, length = between the two gable planes (x 1 .. 7); IfcRoof, derived', roofs.length === 2 && roofs.every(e => e.class === 'IfcRoof' && e.prov === 'derived') && roofs.every(e => Math.abs(bb(e)[0][0] - 1) < 1e-6 && Math.abs(bb(e)[0][1] - 7) < 1e-6) && Math.abs(Math.max(...roofs.map(e => bb(e)[2][1])) - 3.5) < 1e-6 && Math.abs(Math.max(...roofs.map(e => Math.abs(bb(e)[1][1] - bb(e)[1][0]))) - 2.0) < 0.01, roofs.map(e => JSON.stringify(bb(e))).join(' | '));
const slopeLen = Math.hypot(2, 0.5), want = 6 * slopeLen * 0.0254;
ok('SY3 each roof sheet: volume = length 6 m x slope length ' + slopeLen.toFixed(4) + ' m x 0.0254 m (relative 1e-4: vertex rounding), windings outward; slope ' + roofs[0].size.slope_deg.toFixed(2) + ' deg = atan(0.5 / 2)', roofs.every(e => Math.abs(mesh(e) - want) / want < 1e-4) && Math.abs(roofs[0].size.slope_deg - Math.atan2(0.5, 2) * 180 / Math.PI) < 1e-6, roofs.map(e => mesh(e).toFixed(6)).join());
ok('SY4 yellow defaults listed: slab thickness, slab footprint, roof sheet thickness, roof overhang (0): every synthetic value is a stated assumption', ['synth.slab.thickness', 'synth.slab.footprint', 'synth.roof.sheet_thickness', 'synth.roof.overhang'].every(k => r.defaults.some(d => d.key === k && d.kind === 'default')));
const oh = SY.complete(sh, els, { slabT: 0.25, overhang: 0.5 }).els.filter(e => e.kind === 'roof');
ok('SY5 an overhang the user states (0.5 m) lengthens the roof at both ends (x 0.5 .. 7.5)', oh.length === 2 && oh.every(e => Math.abs(bb(e)[0][0] - 0.5) < 1e-6 && Math.abs(bb(e)[0][1] - 7.5) < 1e-6));
r = SY.complete(sh, els.filter(e => e.kind !== 'panel'), { slabT: 0.25 });
ok('SY6 CONTROL no gable panel: GAP:synth_roof_no_gable, NO roof, the slab is still made', r.els.filter(e => e.kind === 'roof').length === 0 && r.els.some(e => e.kind === 'slab') && r.gaps.some(x => x.code === 'GAP:synth_roof_no_gable'));
r = SY.complete(sh, els.filter(e => e.kind !== 'panel' || /-0-/.test(e.guid)), { slabT: 0.25 });
ok('SY7 CONTROL only one end gable drawn: GAP:synth_roof_one_end (the length is unknown), NO roof', r.els.filter(e => e.kind === 'roof').length === 0 && r.gaps.some(x => x.code === 'GAP:synth_roof_one_end'), JSON.stringify(r.gaps));
r = SY.complete(sh, els.filter(e => e.kind !== 'column'), { slabT: 0.25 });
ok('SY8 CONTROL no drawn column: GAP:synth_slab_no_columns, NO slab (the floor level is unknown), the roof is still made', r.els.filter(e => e.kind === 'slab').length === 0 && r.gaps.some(x => x.code === 'GAP:synth_slab_no_columns') && r.els.filter(e => e.kind === 'roof').length === 2);
ok('SY9 deterministic: the same inputs twice give the same synthetic parts', JSON.stringify(SY.complete(sh, els, { slabT: 0.25 })) === JSON.stringify(SY.complete(sh, els, { slabT: 0.25 })));
// the bill sees the synthetic parts: slab + roof priced by their stated formulas, split under 'derived'
const all = els.concat(SY.complete(sh, els, { slabT: 0.25 }).els), bl = BL.bill(all, { ref, pack });
const sl = bl.lines.find(l => l.class === 'IfcSlab'), rl = bl.lines.filter(l => l.class === 'IfcRoof');
ok('SY10 the bill prices them: slab A = 24 m2 x pack IfcSlab rate x factor t/t_ref (0.25 / 0.25 = 1); roof A = 2 x 6 x slope length m2 x the pack IfcRoof rate; totals show them under derived', sl && Math.abs(sl.quantity - 24) < 1e-6 && sl.factor === 1 && Math.abs(sl.amount - 24 * pack.materials.IfcSlab.rate) < 1e-3 && rl.length === 2 && Math.abs(rl[0].quantity - 6 * slopeLen) < 1e-4 && bl.totals.by_prov.derived > sl.amount, bl.log);
console.log(fail ? 'FAIL W-SYNTH ' + fail : 'PASS W-SYNTH'); process.exit(fail ? 1 : 0);
