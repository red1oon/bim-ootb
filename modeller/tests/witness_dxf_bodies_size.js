// W-BODY-SIZE (prompts/DXF2BIM_MODELLER_LANE.md §L10.6). Issue: a body's extent came from the scaled drawing line; the stated number (legend label) must drive it,
// a user number must beat it, and recalculation must be deterministic. Read the log; exit code is not evidence.
const I = require('../dxf2bim_import.js'), B = require('../dxf2bodies.js'), P = require('../dxf2prep.js');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const g = (c, v) => c + '\n' + v + '\n';
const poly = (layer, x0, y0, x1, y1, h) => g(0, 'LWPOLYLINE') + g(5, h) + g(8, layer) + g(90, 4) + g(70, 1) + g(10, x0) + g(20, y0) + g(10, x1) + g(20, y0) + g(10, x1) + g(20, y1) + g(10, x0) + g(20, y1);
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const lbox = (layer, x0, y0, x1, y1) => line(layer, x0, y0, x1, y0) + line(layer, x1, y0, x1, y1) + line(layer, x1, y1, x0, y1) + line(layer, x0, y1, x0, y0);
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const tx = (t, x, y) => g(0, 'TEXT') + g(8, 'Tex') + g(10, x) + g(20, y) + g(30, 0) + g(40, 20) + g(1, t);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 4000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 2150], ['@LAYER=Col,column']];
const ELEV = [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=E'], ['@GRIDH=A', 1000, 0], ['@GRIDH=B', 4000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Col,column']];
const cols = [[850, 1150], [3850, 4150]];   // drawn 300 x 300 mm, centres 1000 / 4000
const planDxf = (extra) => doc(cols.map(([a, b], i) => poly('Col', a, 0, b, 300, 'C' + i)).join('') + (extra || ''), PLAN);
const elevDxf = () => doc(cols.map(([a, b]) => lbox('Col', a, 0, b, 3000)).join(''), ELEV);
const read = files => I.readSheets(files.map(([name, text]) => ({ name, text })), { prep: P });
const run = (files, o) => B.buildBodies(read(files), o);
const ext = e => { const xs = e.vertices.map(v => v[0]), ys = e.vertices.map(v => v[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), (Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2]; };
const labelled = planDxf(tx('C-1 = 350x350', 6000, 900) + tx('C-1', 1000, 600) + tx('C-1', 4000, 600));

let r = run([['plan.dxf', planDxf()], ['south.dxf', elevDxf()]]);
ok('S0 CONTROL no legend: the drawn 300x300 footprint is unchanged (nothing guessed), no size info', r.els.length === 2 && r.els.every(e => Math.abs(ext(e)[0] - 0.3) < 1e-9 && Math.abs(ext(e)[1] - 0.3) < 1e-9 && !e.size) && r.report.size_conflicts.length === 0);
r = run([['plan.dxf', labelled], ['south.dxf', elevDxf()]]);
const c0 = r.els.map(e => ext(e));
ok('S1 legend C-1 = 350x350 + mark C-1 beside each column: both bodies take 0.35 x 0.35 m, centred on the drawn centre (1.0/4.0 m, 0.15 m)', c0.length === 2 && c0.every(c => Math.abs(c[0] - 0.35) < 1e-9 && Math.abs(c[1] - 0.35) < 1e-9) && Math.abs(c0[0][2] - 1) < 1e-9 && Math.abs(c0[1][2] - 4) < 1e-9 && Math.abs(c0[0][3] - 0.15) < 1e-9, JSON.stringify(c0));
ok('S2 the body says why: size.x = drawn 0.3, number 0.35, PAIRED_CONFLICT, source label, ALIGN:floating; one report row per body side (4)', r.els.every(e => e.size && e.size.x.drawn === 0.3 && e.size.x.number === 0.35 && e.size.x.class === 'PAIRED_CONFLICT' && e.size.x.source === 'label' && e.size.x.align === 'ALIGN:floating') && r.report.size_conflicts.length === 4);
const vol = e => { let v = 0; e.faces.forEach(([a, b, c]) => { const A = e.vertices[a], Bv = e.vertices[b], C = e.vertices[c]; v += (A[0] * (Bv[1] * C[2] - Bv[2] * C[1]) - A[1] * (Bv[0] * C[2] - Bv[2] * C[0]) + A[2] * (Bv[0] * C[1] - Bv[1] * C[0])) / 6; }); return v; };
ok('S3 volume == stated 0.35 x 0.35 x 3 m (the mesh follows the number, windings outward)', r.els.every(e => Math.abs(vol(e) - 0.35 * 0.35 * 3) < 1e-9), r.els.map(vol).join());
const elevMatchedStill = r.els.every(e => e.z0 === 0 && e.z1 === 3);
ok('S4 the elevation match still uses the DRAWN footprint (height 0..3 m found, no GAP:body_no_elevation) although the mesh was resized', elevMatchedStill && r.gaps.length === 0);
const guid0 = r.els[0].guid;
const u = run([['plan.dxf', labelled], ['south.dxf', elevDxf()]], { numbers: { [guid0]: { x: 0.4 } } });
const e0 = u.els.find(e => e.guid === guid0), e1 = u.els.find(e => e.guid !== guid0);
ok('S5 a user number (x = 0.4 m) beats the label for that body only: e0 0.40 x 0.35, e1 unchanged 0.35 x 0.35 (an edit recalculates exactly that body)', Math.abs(ext(e0)[0] - 0.4) < 1e-9 && Math.abs(ext(e0)[1] - 0.35) < 1e-9 && Math.abs(ext(e1)[0] - 0.35) < 1e-9 && e0.size.x.source === 'user');
ok('S6 determinism: the same drawing + numbers twice give identical bodies', JSON.stringify(run([['plan.dxf', labelled], ['south.dxf', elevDxf()]], { numbers: { [guid0]: { x: 0.4 } } }).els) === JSON.stringify(u.els));
const far = run([['plan.dxf', planDxf(tx('C-1 = 350x350', 6000, 900) + tx('C-1', 90000, 90000))], ['south.dxf', elevDxf()]]);
ok('S7 CONTROL the only mark is far away: no size is applied (drawn 300x300 kept), the sides are recorded UNPAIRED with no number, nothing guessed', far.els.length === 2 && far.els.every(e => Math.abs(ext(e)[0] - 0.3) < 1e-9 && e.size.x.class === 'UNPAIRED' && e.size.x.number === null) && far.report.size_conflicts.length === 0);
const agree = run([['plan.dxf', planDxf(tx('C-1 = 300x300', 6000, 900) + tx('C-1', 1000, 600) + tx('C-1', 4000, 600))], ['south.dxf', elevDxf()]]);
ok('S8 a label that agrees with the drawing: size recorded as PAIRED_AGREE, extent identical, no report row', agree.els.every(e => e.size && e.size.x.class === 'PAIRED_AGREE' && Math.abs(ext(e)[0] - 0.3) < 1e-9) && agree.report.size_conflicts.length === 0);

// ---- §L10.7 band kinds: the legend row is a CROSS-SECTION (width x depth), never the plan length ----
{
  const PLANB = (extra) => [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 4000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 2150], ['@LAYER=Bm,beam']];
  const ELEVB = [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=E'], ['@GRIDH=A', 1000, 0], ['@GRIDH=B', 4000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Bm,beam']];
  const GAPS = [[0, 850], [1150, 3850], [4150, 6850], [7150, 8000]];
  const beamLines = (y0, y1) => line('Bm', 0, y0, 8000, y0) + GAPS.map(([a, b]) => line('Bm', a, y1, b, y1)).join('');
  const plan = (legend) => doc(beamLines(1000, 1300) + (legend ? tx('B-1 = ' + legend, 9000, 2000) + [500, 2500, 5500, 7500].map(x => tx('B-1', x, 1150)).join('') : ''), PLANB());
  const elev = () => doc(line('Bm', 0, 3300, 8000, 3300) + GAPS.map(([a, b]) => line('Bm', a, 3000, b, 3000)).join(''), ELEVB);
  const rb = (legend, o) => run([['plan.dxf', plan(legend)], ['south.dxf', elev()]], o), xr = e => { const xs = e.vertices.map(v => v[0]); return [Math.min(...xs), Math.max(...xs)].map(v => Math.round(v * 1e6) / 1e6); };
  const zr = e => { const zs = e.vertices.map(v => v[2]); return [Math.min(...zs), Math.max(...zs)].map(v => Math.round(v * 1e6) / 1e6); }, yr = e => { const ys = e.vertices.map(v => v[1]); return [Math.min(...ys), Math.max(...ys)].map(v => Math.round(v * 1e6) / 1e6); };
  const base = rb(null), spans = JSON.stringify(base.els.map(xr));
  let b = rb('300x400');
  ok('BS1 B-1 = 300x400 on a drawn 300 wide x 300 deep beam: depth is the conflict (0.4 in force), width agrees; the soffit stays at 3.0 m, the top grows to 3.4 m (anchor soffit)', b.els.length === 4 && b.els.every(e => zr(e)[0] === 3 && zr(e)[1] === 3.4 && yr(e)[1] - yr(e)[0] > 0.2999 && yr(e)[1] - yr(e)[0] < 0.3001 && e.size.d.class === 'PAIRED_CONFLICT' && e.size.w.class === 'PAIRED_AGREE'), b.els.map(zr).join(' | '));
  ok('BS2 the span LENGTHS never change (the cross-section is not the plan length: the W-CLI C13d regression)', JSON.stringify(b.els.map(xr)) === spans);
  b = rb('400x300');
  ok('BS3 a TIE (square drawn section 300x300 against 400x300): the legend order is the convention, width first -> plan width 0.4, depth agrees (z top stays 3.3)', b.els.every(e => Math.abs(yr(e)[1] - yr(e)[0] - 0.4) < 1e-6 && zr(e)[1] === 3.3));
  b = rb('350x300');
  ok('BS4 a width conflict (350 against the drawn 300) widens the plan band to 0.35 m, centred on the drawn centre line y = 1.15 m; depth agrees', b.els.every(e => Math.abs(yr(e)[1] - yr(e)[0] - 0.35) < 1e-6 && Math.abs((yr(e)[0] + yr(e)[1]) / 2 - 1.15) < 1e-6 && zr(e)[1] === 3.3));
  ok('BS5 CONTROL without a legend row the beams are exactly as drawn (z 3.0..3.3, no size info)', base.els.every(e => zr(e)[0] === 3 && zr(e)[1] === 3.3 && !e.size));
  const g0 = rb('300x400').els[0].guid, ub = rb('300x400', { numbers: { [g0]: { d: 0.45 } } });
  ok('BS6 a user depth (0.45 m) beats the label for that span only; the other spans keep 0.4', ub.els.find(e => e.guid === g0).size.d.source === 'user' && zr(ub.els.find(e => e.guid === g0))[1] === 3.45 && ub.els.filter(e => e.guid !== g0).every(e => zr(e)[1] === 3.4));
  ok('BS7 report.size_conflicts lists each conflicting beam side once (4 spans x depth)', rb('300x400').report.size_conflicts.length === 4 && rb('300x400').report.size_conflicts.every(x => x.axis === 'd' && x.number === 0.4 && x.drawn === 0.3));
}
console.log(fail ? 'FAIL W-BODY-SIZE ' + fail : 'PASS W-BODY-SIZE'); process.exit(fail ? 1 : 0);
