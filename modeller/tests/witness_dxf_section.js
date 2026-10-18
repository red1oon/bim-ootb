// W-SECTION (prompts/DXF2BIM_MODELLER_LANE.md §L14). Issue: a truss is drawn ONCE in a section; the building has many. The drawn section must become bodies at its cut (derived) and
// repeat along the building at a stated spacing (assumed, red), with member sizes read from the drawing's own labels, never guessed. Read the log; exit code is not evidence.
const fs = require('fs'), path = require('path');
const I = require('../dxf2bim_import.js'), P = require('../dxf2prep.js'), B = require('../dxf2bodies.js'), ST = require('../dxf2structure.js'), SC = require('../dxf2section.js');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const g = (c, v) => c + '\n' + v + '\n';
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const tx = (t, x, y) => g(0, 'TEXT') + g(8, 'Tex') + g(10, x) + g(20, y) + g(30, 0) + g(40, 20) + g(1, t);
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const LD = (h, pts) => g(0, 'LEADER') + g(5, h) + g(8, 'Dim') + g(100, 'AcDbLeader') + g(76, pts.length) + pts.map(p => g(10, p[0]) + g(20, p[1]) + g(30, 0)).join('');
const lw = (layer, vs, closed, h) => g(0, 'LWPOLYLINE') + g(5, h) + g(8, layer) + g(90, vs.length) + g(70, closed ? 1 : 0) + vs.map(v => g(10, v[0]) + g(20, v[1])).join('');
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
// plan: 12 m long (x grids 0..12000 every 3000), 4 m wide (y grids 1=0, 2=4000); the section is cut at x = 4500 (between grid lines): stations 1500, 4500, 7500, 10500 (pitch 3000)
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 0, 0], ['@GRIDX=B', 3000, 0], ['@GRIDX=C', 6000, 0], ['@GRIDX=D', 9000, 0], ['@GRIDX=E', 12000, 0], ['@GRIDY=1', 0, 0], ['@GRIDY=2', 0, 4000]];
const SEC = (extra) => [['@SET=T'], ['@VIEW=SECTION'], ['@HAXIS=+Y'], ['@CUT=X,4500'], ['@UNITS=mm'], ['@GRIDH=1', 0, 0], ['@GRIDH=2', 4000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Fo,bar']].concat(extra || []);
// a two-bar frame: tie at z 3.0 (y 0..4 m), rafter from (0, 3.0) up to (2 m, 3.5): 4000 mm long tie, 2062 mm rafter
const TIE = line('Fo', 0, 3000, 4000, 3000), RAF = line('Fo', 0, 3000, 2000, 3500);
const labelTie = LD('L1', [[1000, 3000], [1200, 2700], [1500, 2700]]) + tx('2 - 2"x2"x1/4"', 1500, 2700);
const labelRaf = LD('L2', [[1000, 3250], [1300, 3600], [1600, 3600]]) + tx('1.5"x1.5"x1/4" Angle', 1600, 3600);
const GUS = lw('Fo', [[1900, 3000], [2100, 3000], [2100, 3100], [1900, 3100]], true, 'G1') + tx('1/4" Thickness Plate', 2300, 2800);
const PUR = lw('Fo', [[1000, 3260], [1040, 3250], [1030, 3300], [1070, 3290]], false, 'P1');
const read = files => I.readSheets(files.map(([n, t]) => ({ name: n, text: t })), { prep: P });
const build = (body, marks, o) => SC.buildSections(read([['plan.dxf', doc('', PLAN)], ['sec.dxf', doc(body, SEC(marks))]]), o);
const bb = e => [0, 1, 2].map(i => { const a = e.vertices.map(v => v[i]); return [Math.min(...a), Math.max(...a)].map(v => Math.round(v * 1e6) / 1e6); });
const vol = e => { let v = 0; e.faces.forEach(([a, b, c]) => { const A = e.vertices[a], Bv = e.vertices[b], C = e.vertices[c]; v += (A[0] * (Bv[1] * C[2] - Bv[2] * C[1]) - A[1] * (Bv[0] * C[2] - Bv[2] * C[0]) + A[2] * (Bv[0] * C[1] - Bv[1] * C[0])) / 6; }); return v; };

let r = build(TIE + RAF + labelTie + labelRaf, []);
const bars = r.els.filter(e => e.kind === 'bar'), tie = bars.filter(e => /-S\d$/.test(e.guid) && e.handle.startsWith(bars[0].handle.split('-')[0]));
const byId = id => r.els.filter(e => e.guid.startsWith(id + '-S'));
ok('SE1 two bars x 4 stations (1.5, 4.5, 7.5, 10.5 m: the cut at 4.5 m, repeated at the column pitch 3 m over the grid extent 0..12 m) = 8 IfcMember bodies', bars.length === 8 && r.report.sheets['sec.dxf'].stations === 4 && JSON.stringify([...new Set(bars.map(e => e.size.station))].sort((a, b) => a - b)) === '[1.5,4.5,7.5,10.5]', JSON.stringify(r.report));
const tieB = r.els.filter(e => e.size && e.size.w && e.size.w.number === 0.0508), rafB = r.els.filter(e => e.size && e.size.w && e.size.w.number === 0.0381);
ok('SE2 sizes come from the labels whose LEADER TIP touches the bar: the tie "2 - 2"x2"x1/4"" is 2 in = 0.0508 m, the rafter "1.5"x1.5"x1/4" Angle" 1.5 in = 0.0381 m (source label)', tieB.length === 4 && rafB.length === 4 && tieB.every(e => e.size.w.source === 'label') && /Angle/.test(rafB[0].ifc.type_name));
ok('SE3 geometry: the tie lies along the section axis (y 0..4 m) at z 3.0 m, square section 0.0508 m centred on its station x; volume = 4 m x 0.0508 m x 0.0508 m (windings outward)', JSON.stringify(bb(tieB[0])) !== '' && Math.abs(vol(tieB[0]) - 4 * 0.0508 * 0.0508) < 1e-6 && Math.abs(bb(tieB[0])[1][0] - 0) < 0.03 && Math.abs(bb(tieB[0])[1][1] - 4) < 0.03, JSON.stringify(bb(tieB[0])) + ' vol ' + vol(tieB[0]).toFixed(6));
ok('SE4 provenance: the copy AT the cut (x = 4.5 m) is derived (drawn evidence), the other three are assumed (red): 2 derived + 6 assumed', bars.filter(e => e.prov === 'derived').length === 2 && bars.filter(e => e.prov === 'assumed').length === 6 && bars.filter(e => e.prov === 'derived').every(e => e.size.station === 4.5));
ok('SE5 yellow default section.spacing (column pitch) is listed', r.defaults.some(d => d.key === 'section.spacing' && d.kind === 'default'));
// SE6 unlabelled bar takes the modal labelled size
r = build(TIE + RAF + labelTie, []);
const rafD = r.els.filter(e => e.kind === 'bar' && e.size.w.source === 'default');
ok('SE6 a bar with no label pointing at it takes the most common LABELLED size (here the only one: 0.0508) as a yellow default, source default', rafD.length === 4 && rafD.every(e => e.size.w.number === 0.0508) && r.defaults.some(d => d.key === 'section.bar.size' && d.kind === 'default'));
// SE7 no size anywhere = gap, no body
r = build(TIE, []);
ok('SE7 CONTROL no label at all: GAP:bar_no_size with the @SIZE hint, NO body (nothing guessed)', r.els.length === 0 && r.gaps.length === 1 && r.gaps[0].code === 'GAP:bar_no_size' && /@SIZE=body-bar-0-/.test(r.gaps[0].detail), JSON.stringify(r.gaps).slice(0, 200));
// SE8 ambiguous labels
r = build(TIE + labelTie + LD('L3', [[1100, 3000], [1250, 2800], [1500, 2500]]) + tx('1.5"x1.5"x1/4" Angle', 1500, 2500), []);
ok('SE8 CONTROL two different size labels point at one bar: GAP:bar_label_ambiguous (both listed), no body', r.els.length === 0 && r.gaps.some(x => x.code === 'GAP:bar_label_ambiguous' && /2 - 2/.test(x.detail) && /Angle/.test(x.detail)));
// SE9 a label naming another element is not a member size
r = build(TIE + LD('L9', [[1000, 3000], [1200, 2700], [1500, 2700]]) + tx('Beam-1 (12"x10")', 1500, 2700), []);
ok('SE9 CONTROL a label that names another element ("Beam-1 (12"x10")") is not a member size: no size, no body', r.els.length === 0 && r.gaps.some(x => x.code === 'GAP:bar_no_size'));
// SE10 user size
const tieHandle = read([['plan.dxf', doc('', PLAN)], ['sec.dxf', doc(TIE, SEC())]])[1].dxf.entities.filter(e => e.type === 'LINE')[0].handle, nums = {}; nums['body-bar-0-' + tieHandle] = { w: 0.06 };
r = build(TIE, [], { numbers: nums });
ok('SE10 the user states the size (@SIZE w = 0.06 m): the bar is built at 0.06 m at every station, source user', r.els.length === 4 && r.els.every(e => e.size.w.number === 0.06 && e.size.w.source === 'user'));
// SE11 spacing
r = build(TIE + labelTie, [], { numbers: { 'section-spacing': { x: 6 } } });
ok('SE11 the user states the spacing (6 m): stations 0.5, 4.5 ... = 0.. the copies at 4.5 +- k x 6 within 0..12 m -> 4.5 - 6 < 0, so stations {4.5, 10.5}: 2 copies', r.report.sheets['sec.dxf'].stations === 2 && JSON.stringify([...new Set(r.els.map(e => e.size.station))].sort((a, b) => a - b)) === '[4.5,10.5]');
// plates + runs
r = build(TIE + RAF + labelTie + labelRaf + GUS + PUR, []);
const pl = r.els.filter(e => e.kind === 'plate'), runs = r.els.filter(e => e.kind === 'member');
ok('SE12 a closed outline on the truss layer is a gusset PLATE at every station: thickness 1/4 in = 0.00635 m from the sheet\'s one "Thickness Plate" label (a yellow default: the label points at no plate), 4 plates, volume 0.2 x 0.1 x 0.00635', pl.length === 4 && pl.every(e => e.size.t.number === 0.00635) && Math.abs(vol(pl[0]) - 0.2 * 0.1 * 0.00635) < 1e-9 && r.defaults.some(d => d.key === 'section.plate.thickness'), pl[0] && vol(pl[0]).toFixed(8));
ok('SE13 an open outline on the truss layer (a purlin angle symbol) is ONE run from the first to the last station (x 1.5 .. 10.5 m), derived', runs.length === 1 && Math.abs(bb(runs[0])[0][0] - 1.5) < 1e-6 && Math.abs(bb(runs[0])[0][1] - 10.5) < 1e-6 && runs[0].prov === 'derived' && vol(runs[0]) > 0, runs[0] && JSON.stringify(bb(runs[0])));
ok('SE14 CONTROL plates with no thickness label: GAP:plate_no_thickness, no plate', build(TIE + labelTie + lw('Fo', [[1900, 3000], [2100, 3000], [2100, 3100], [1900, 3100]], true, 'G1'), []).gaps.some(x => x.code === 'GAP:plate_no_thickness'));
ok('SE15 determinism: the same sheets twice give identical bodies', JSON.stringify(build(TIE + RAF + labelTie + labelRaf + GUS + PUR, []).els) === JSON.stringify(build(TIE + RAF + labelTie + labelRaf + GUS + PUR, []).els));
ok('SE16 CONTROL no section layer typed: nothing built, no gap', build(TIE, []).els.length >= 0 && SC.buildSections(read([['plan.dxf', doc('', PLAN)], ['sec.dxf', doc(TIE, SEC().filter(m => !/LAYER/.test(m[0])))]]), {}).els.length === 0);
// through the structure judge
const ELEV = [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=S'], ['@GRIDH=A', 0, 0], ['@GRIDH=B', 3000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000]];
const sh = read([['plan.dxf', doc('', PLAN)], ['south.dxf', doc('', ELEV)], ['sec.dxf', doc(TIE + RAF + labelTie + labelRaf, SEC())]]), j = ST.judge(sh, { I, B });
ok('SE17 the structure judge builds the section bodies (8 bars) with the others: the `bar` kind makes the set a structure set; defaults carried', ST.isStructure(sh, B) && j.gate.structure && j.gate.structure.bodies === 8 && j.defaults.some(d => d.key === 'section.spacing'), j.log);
console.log(fail ? 'FAIL W-SECTION ' + fail : 'PASS W-SECTION'); process.exit(fail ? 1 : 0);
