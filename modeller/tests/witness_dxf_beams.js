// W-BEAMS (prompts/DXF2BIM_MODELLER_LANE.md §L9): beams are drawn as two parallel lines (one long edge, the other in pieces between the columns), not as closed outlines. Each piece between column
// faces is one span body (no bridging); heights come from the elevation band; the user's @EXCLUDE removes what is not a beam (the expansion joint). Each check names the issue it proves.
const I = require('../dxf2bim_import.js'), B = require('../dxf2bodies.js'), P = require('../dxf2prep.js');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const g = (c, v) => c + '\n' + v + '\n';
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const txt = (layer, x, y, t) => g(0, 'TEXT') + g(8, layer) + g(10, x) + g(20, y) + g(30, 0) + g(40, 40) + g(1, t);
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
const PLANM = (extra) => [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 4000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 2150], ['@LAYER=Bm,beam']].concat(extra || []);
const ELEVM = (extra) => [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=E'], ['@GRIDH=A', 1000, 0], ['@GRIDH=B', 4000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Bm,beam']].concat(extra || []);
const GAPS = [[0, 850], [1150, 3850], [4150, 6850], [7150, 8000]];   // the spans between column faces (columns 850..1150, 3850..4150, 6850..7150)
const beamLines = (y0, y1) => line('Bm', 0, y0, 8000, y0) + GAPS.map(([a, b]) => line('Bm', a, y1, b, y1)).join('');       // long edge + the pieces of the other edge
const plan = (extra, marks, body) => doc(beamLines(1000, 1300) + (body || '') + (extra || ''), PLANM(marks));
const elev = (marks) => doc(line('Bm', 0, 3300, 8000, 3300) + GAPS.map(([a, b]) => line('Bm', a, 3000, b, 3000)).join(''), ELEVM(marks));
const run = (files, o) => B.buildBodies(I.readSheets(files.map(([name, text]) => ({ name, text })), { prep: P }), o);
const ex = (x0, x1) => [x0, x1];
let r = run([['plan.dxf', plan()], ['south.dxf', elev()]]);
const beams = r.els.filter(e => e.kind === 'beam'), xr = e => { const xs = e.vertices.map(v => v[0]); return [Math.min(...xs), Math.max(...xs)].map(v => Math.round(v * 1000) / 1000); };
ok('BM1 long edge + 4 pieces -> 4 span beams, each = its piece (0..0.85, 1.15..3.85, 4.15..6.85, 7.15..8.0 m), IfcBeam/BEAM', beams.length === 4 && JSON.stringify(beams.map(xr).sort((a, b) => a[0] - b[0])) === JSON.stringify([[0, 0.85], [1.15, 3.85], [4.15, 6.85], [7.15, 8]]) && beams.every(e => e.class === 'IfcBeam' && e.ifc.PredefinedType === 'BEAM'), JSON.stringify(beams.map(xr)));
ok('BM2 CONTROL the beam is NOT bridged over the columns: no body spans a column gap (max span 2.7 m)', beams.every(e => xr(e)[1] - xr(e)[0] <= 2.8) && beams.length !== 1);
ok('BM5 the elevation band (top line z 3.3 m + soffit pieces z 3.0 m) gives every span z 3.0..3.3 m (height_source elevation, prov drawn)', beams.every(e => Math.abs(e.z0 - 3) < 1e-9 && Math.abs(e.z1 - 3.3) < 1e-9 && e.height_source === 'elevation' && e.prov === 'drawn'), JSON.stringify(beams.map(e => [e.z0, e.z1, e.match])));
// end beam: a vertical pair (x 8300/8600, y 1000..1300); and a pair 600 apart that is not a band
let r3 = run([['plan.dxf', plan(line('Bm', 8300, 1000, 8300, 1300) + line('Bm', 8600, 1000, 8600, 1300))], ['south.dxf', elev()]]);
ok('BM3 a vertical pair (an end beam) is found as one more region (5 regions), left out without a height (no elevation band over its interval) rather than invented', r3.report.kinds.beam.plan_regions === 5 && r3.gaps.some(x => x.code === 'GAP:body_no_elevation' && x.kind === 'beam'), JSON.stringify(r3.report.kinds.beam));
let r4 = run([['plan.dxf', plan(line('Bm', 8300, 1000, 8300, 1300) + line('Bm', 8900, 1000, 8900, 1300))], ['south.dxf', elev()]]);
ok('BM4 CONTROL a parallel pair 600 mm apart (wider than the 0.5 m default) is not a band: still 4 regions', r4.report.kinds.beam.plan_regions === 4, JSON.stringify(r4.report.kinds.beam));
// the expansion joint: a vertical pair 220 apart crossing the beam lines
const JOINT = line('Bm', 5000, 900, 5000, 1500) + line('Bm', 5220, 900, 5220, 1500);
let r6 = run([['plan.dxf', plan(JOINT)], ['south.dxf', elev()]]);
ok('BM7 CONTROL without an exclusion the joint IS a beam region (5 regions) and, being 0.22 m wide inside a 2.7 m band, borrows no height: left out as GAP:body_no_elevation; the module does not decide what a joint is', r6.report.kinds.beam.plan_regions === 5 && r6.gaps.filter(x => x.code === 'GAP:body_no_elevation').length === 1 && r6.els.filter(e => e.kind === 'beam').length === 4, JSON.stringify(r6.report.kinds.beam));
let r5 = run([['plan.dxf', plan(JOINT, [['@EXCLUDE=4950,850,5270,1550']])], ['south.dxf', elev()]]);
ok('BM6 @EXCLUDE over the joint removes exactly that region and counts it: 4 regions, excluded 1, no gap, the 4 spans unchanged', r5.report.kinds.beam.plan_regions === 4 && r5.report.kinds.beam.excluded === 1 && r5.gaps.length === 0 && r5.els.filter(e => e.kind === 'beam').length === 4, JSON.stringify(r5.report.kinds.beam));
// labels
let r8 = run([['plan.dxf', plan(txt('Tex', 100, -300, 'Beam Lay out Plan'))], ['south.dxf', elev()]]);
ok('BM8 a sheet TITLE ("Beam Lay out Plan") never names the beams: no kind-level label, bodies unnamed', r8.report.labels.beam.length === 0 && r8.els.filter(e => e.kind === 'beam').every(e => e.ifc.type_name === null), JSON.stringify(r8.report.labels.beam));
let r9 = run([['plan.dxf', plan(txt('Tex', 2000, 1500, 'B-1') + txt('Tex', 5500, 1500, 'B-2'))], ['south.dxf', elev()]]);
const nm = r9.els.filter(e => e.kind === 'beam').map(e => [xr(e)[0], e.ifc.type_name]).sort((a, b) => a[0] - b[0]);
ok('BM9 the type mark written next to a span names it: the left spans B-1, the right spans B-2 (nearest mark, unambiguous)', nm.length === 4 && nm[0][1] === 'B-1' && nm[1][1] === 'B-1' && nm[2][1] === 'B-2' && nm[3][1] === 'B-2', JSON.stringify(nm));
let r9b = run([['plan.dxf', plan(txt('Tex', 2000, 1500, 'B-1') + txt('Tex', 2010, 1500, 'B-2'))], ['south.dxf', elev()]]);
ok('BM9b CONTROL two DIFFERENT marks equally near name nothing', r9b.els.filter(e => e.kind === 'beam' && e.ifc.type_name).every(e => !['B-1', 'B-2'].includes(e.ifc.type_name) || xr(e)[0] >= 4), JSON.stringify(r9b.els.filter(e => e.kind === 'beam').map(e => [xr(e)[0], e.ifc.type_name])));
let r10 = run([['plan.dxf', plan(line('Bm', 8300, 1000, 8300, 1300) + line('Bm', 8600, 1000, 8600, 1300), [['@BODYZ=beam,3,3.3']])], ['south.dxf', elev()]]);
const stated = r10.els.filter(e => e.height_source === 'stated');
ok('BM10 the end beam without an elevation takes the user-stated range (@BODYZ beam 3..3.3), prov derived; the 4 elevation-backed spans keep the drawn one', stated.length === 1 && stated[0].z0 === 3 && stated[0].prov === 'derived' && r10.els.filter(e => e.height_source === 'elevation').length === 4, JSON.stringify(r10.els.map(e => e.height_source)));
ok('BM11 FALSIFIER: the same plan typed as COLUMN layer gives no band regions (bands are for beam/gradebeam/member only)', (() => { const x = run([['plan.dxf', plan().replace('@LAYER=Bm,beam', '@LAYER=Bm,column')], ['south.dxf', elev().replace('@LAYER=Bm,beam', '@LAYER=Bm,column')]]); return x.els.filter(e => e.kind === 'beam').length === 0 && !(x.report.kinds.beam); })());
ok('BM12 the shed case: ONE elevation layer typed COLUMN (it holds the column faces AND the beam band) still gives the beam spans their height; the plan layer typed beam', (() => { const x = run([['plan.dxf', plan()], ['south.dxf', elev().replace('@LAYER=Bm,beam', '@LAYER=Bm,column')]]); const bs = x.els.filter(e => e.kind === 'beam'); return bs.length === 4 && bs.every(e => Math.abs(e.z0 - 3) < 1e-9 && Math.abs(e.z1 - 3.3) < 1e-9); })());
const jitter = doc(line('Bm', 0, 1000, 8000, 1000) + GAPS.slice().reverse().map(([a, b], i) => line('Bm', a, 1300 + (i % 2 ? 1 : -1) * 3e-11 * (i + 1), b, 1300 - (i % 2 ? 1 : -1) * 2e-11 * (i + 1))).join(''), PLANM());
ok('BM13 FLOAT NOISE: the pieces of one edge carry 1e-11 coordinate noise and arrive in any order (real CAD): still 4 spans (the merge sorted by raw position and swallowed pieces: the shed\'s left block lost all its beams)', run([['plan.dxf', jitter], ['south.dxf', elev()]]).els.filter(e => e.kind === 'beam').length === 4);
const clipped = doc(line('Bm', 0, 1000, 8000, 1000) + [[0, 850], [1150, 2000], [2090, 3850], [4150, 6850], [7150, 8000]].map(([a, b]) => line('Bm', a, 1300, b, 1300)).join(''), PLANM());
const rc = run([['plan.dxf', clipped], ['south.dxf', elev()]]), bcl = rc.els.filter(e => e.kind === 'beam');
ok('BM14 a span drawn in two pieces (a label clips the line) lies WITHIN its bay\'s elevation band: both pieces inherit z 3.0..3.3 (match "within"), nothing bridged', bcl.length === 5 && bcl.filter(e => e.match === 'within').length === 2 && bcl.every(e => Math.abs(e.z0 - 3) < 1e-9 && Math.abs(e.z1 - 3.3) < 1e-9), JSON.stringify(bcl.map(e => [xr(e), e.match])));
const twoBands = doc(line('Bm', 0, 3300, 8000, 3300) + GAPS.map(([a, b]) => line('Bm', a, 3000, b, 3000)).join('') + line('Bm', 1150, 2900, 3850, 2900), ELEVM());
const ra = run([['plan.dxf', plan()], ['south.dxf', twoBands]]);
ok('BM15 CONTROL two different bands over one bay (z 3.0..3.3 and 2.9..3.0 under it) are an AMBIGUOUS height: GAP:body_ambiguous_z for that span, the other 3 spans still built', ra.gaps.some(x => x.code === 'GAP:body_ambiguous_z' && x.kind === 'beam') && ra.els.filter(e => e.kind === 'beam').length === 3, JSON.stringify(ra.gaps.map(x => x.code)));
const longBand = doc(line('Bm', 0, 3300, 8000, 3300) + line('Bm', 0, 3000, 8000, 3000), ELEVM());
const rl = run([['plan.dxf', plan()], ['south.dxf', longBand]]);
ok('BM16 CONTROL the within-rule has a size limit: in ONE 8 m band the two 0.85 m end spans (band > 3.5x) borrow no height (GAP:body_no_elevation, state it with @BODYZ) while the two 2.7 m spans (band <= 3.5x) inherit it', rl.els.filter(e => e.kind === 'beam').length === 2 && rl.gaps.filter(x => x.code === 'GAP:body_no_elevation').length === 2, JSON.stringify(rl.gaps.map(x => x.code)) + ' bodies=' + rl.els.filter(e => e.kind === 'beam').length);
const withTops = doc(line('Bm', 0, 3300, 8000, 3300) + GAPS.map(([a, b]) => line('Bm', a, 3000, b, 3000)).join('') + [[850, 1150], [3850, 4150], [6850, 7150]].map(([a, b]) => line('Bm', a, 3000, b, 3000) + line('Bm', a, 0, a, 3000) + line('Bm', b, 0, b, 3000)).join(''), ELEVM());
const rt = run([['plan.dxf', plan()], ['south.dxf', withTops]]);
ok('BM17 the column tops (y 3.0 m) touch the beam soffit pieces on both sides: the pieces are NOT fused into one line across the column (the 0.85 m end spans still get their band, 4 spans)', rt.els.filter(e => e.kind === 'beam').length === 4, JSON.stringify(rt.gaps.map(x => x.code)));
console.log(fail ? 'W-BEAMS FAIL ' + fail : 'W-BEAMS PASS'); process.exit(fail ? 1 : 0);
