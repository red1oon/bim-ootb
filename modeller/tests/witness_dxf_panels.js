// W-PANELS (prompts/DXF2BIM_MODELLER_LANE.md §L11.2). Issue: the gable-end and side walls of a CAD set are drawn as elevation HATCHES, which the reader never saw; the product must turn the hatch
// loops a user types as `panel` into wall panels with a THICKNESS that comes from the drawing's own label (leader tip inside the panel), never from a guess. Read the log; exit code is not evidence.
const fs = require('fs'), path = require('path');
const I = require('../dxf2bim_import.js'), P = require('../dxf2prep.js'), B = require('../dxf2bodies.js'), ST = require('../dxf2structure.js'), PN = require('../dxf2panels.js');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const g = (c, v) => c + '\n' + v + '\n';
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const tx = (t, x, y) => g(0, 'TEXT') + g(8, 'Tex') + g(10, x) + g(20, y) + g(30, 0) + g(40, 20) + g(1, t);
const LD = (h, pts) => g(0, 'LEADER') + g(5, h) + g(8, 'Dim') + g(100, 'AcDbLeader') + g(76, pts.length) + pts.map(p => g(10, p[0]) + g(20, p[1]) + g(30, 0)).join('');
const poly = (handle, layer, loops) => g(0, 'HATCH') + g(5, handle) + g(8, layer) + g(100, 'AcDbHatch') + g(10, 0) + g(20, 0) + g(30, 0) + g(2, 'BLOCKS') + g(70, 0) + g(71, 0) + g(91, loops.length) +
  loops.map(vs => g(92, 3) + g(72, 0) + g(73, 1) + g(93, vs.length) + vs.map(v => g(10, v[0]) + g(20, v[1])).join('') + g(97, 0)).join('') + g(75, 1) + g(76, 1) + g(98, 0);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 4000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 2150]];
const WEST = (extra) => [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minX'], ['@HAXIS=+Y'], ['@UNITS=mm'], ['@NAME=W'], ['@GRIDH=1', 150, 0], ['@GRIDH=2', 2150, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Wall,panel']].concat(extra || []);
const LOW = [[150, 0], [2150, 0], [2150, 2000], [150, 2000]], LOW2 = [[2150, 0], [4150, 0], [4150, 2000], [2150, 2000]], GAB = [[150, 2000], [2150, 2000], [1150, 2500]];
const westDxf = (body, marks) => doc(body, WEST(marks));
const planDxf = doc('', PLAN);
const labelled = poly('H1', 'Wall', [LOW]) + LD('L1', [[500, 1000], [700, -300], [900, -300]]) + tx('10" Brick Wall', 900, -300);
const read = files => I.readSheets(files.map(([name, text]) => ({ name, text })), { prep: P });
const build = (files, o) => PN.buildPanels(read(files), o);
const bb = e => { const c = [0, 1, 2].map(i => e.vertices.map(v => v[i])); return c.map(a => [Math.min(...a), Math.max(...a)].map(v => Math.round(v * 1e6) / 1e6)); };
const vol = e => { let v = 0; e.faces.forEach(([a, b, c]) => { const A = e.vertices[a], Bv = e.vertices[b], C = e.vertices[c]; v += (A[0] * (Bv[1] * C[2] - Bv[2] * C[1]) - A[1] * (Bv[0] * C[2] - Bv[2] * C[0]) + A[2] * (Bv[0] * C[1] - Bv[1] * C[0])) / 6; }); return v; };

let r = build([['plan.dxf', planDxf], ['west.dxf', westDxf(labelled)]]);
const e0 = r.els[0];
ok('PN1 a hatch layer typed panel + a "10\\" Brick Wall" label whose LEADER TIP is inside the panel: one IfcWall panel, thickness 0.254 m (source label), centred on the end grid line x = 1.0 m', r.els.length === 1 && r.gaps.length === 0 && e0.class === 'IfcWall' && e0.size.t.number === 0.254 && e0.size.t.source === 'label' && JSON.stringify(bb(e0)) === JSON.stringify([[0.873, 1.127], [0.15, 2.15], [0, 2]]), JSON.stringify(e0 && bb(e0)) + ' ' + JSON.stringify(r.gaps));
ok('PN2 volume == area x thickness (2 m x 2 m x 0.254 m) with outward windings (volume > 0): the mesh follows the drawn polygon', Math.abs(vol(e0) - 4 * 0.254) < 1e-9, vol(e0).toFixed(6));
ok('PN3 the plane is a yellow default (panel.plane: end grid, centred) and the label text names the IFC type', r.defaults.some(d => d.key === 'panel.plane' && d.kind === 'default') && e0.ifc.type_name === '10" Brick Wall');
// gable triangle with the 5" label; lower panel labelled 10"
const two = labelled + poly('H2', 'Wall', [GAB]) + LD('L2', [[1150, 2200], [1500, 2800], [1800, 2800]]) + tx('5" Brick Wall', 1800, 2800);
r = build([['plan.dxf', planDxf], ['west.dxf', westDxf(two)]]);
const gab = r.els.find(e => e.handle === 'H2'), low = r.els.find(e => e.handle === 'H1');
ok('PN4 a triangular gable panel: thickness 0.127 m from ITS OWN label, area 0.5 x 2 x 0.5 = 0.5 m2, volume 0.0635 m3 (ear-clipped prism, not a box)', gab && low && gab.size.t.number === 0.127 && low.size.t.number === 0.254 && Math.abs(vol(gab) - 0.5 * 0.127) < 1e-9, gab && vol(gab).toFixed(6));
ok('PN5 the gable top starts where the lower panel stops (z 2.0 .. 2.5 m) and sits on the same plane (x 1.0 +- 0.0635)', gab && JSON.stringify(bb(gab)) === JSON.stringify([[0.9365, 1.0635], [0.15, 2.15], [2, 2.5]]), gab && JSON.stringify(bb(gab)));
// a second lower panel with NO leader of its own: inherits the thickness of the labelled panel that overlaps it in height
r = build([['plan.dxf', planDxf], ['west.dxf', westDxf(labelled + poly('H3', 'Wall', [LOW2]))]]);
const inh = r.els.find(e => e.handle === 'H3');
ok('PN6 an unlabelled panel takes the thickness of the labelled panel that overlaps it in height (inherited, derived provenance), listed as a yellow default', inh && inh.size.t.number === 0.254 && inh.size.t.source === 'inherited' && inh.prov === 'derived' && r.defaults.some(d => d.key === 'panel.thickness_inherited' && d.kind === 'default'));
r = build([['plan.dxf', planDxf], ['west.dxf', westDxf(poly('H2', 'Wall', [GAB]))]]);
ok('PN7 CONTROL no label anywhere: GAP:panel_no_thickness with the handle and the @SIZE hint, NO body (nothing guessed)', r.els.length === 0 && r.gaps.length === 1 && r.gaps[0].code === 'GAP:panel_no_thickness' && r.gaps[0].handle === 'H2' && /@SIZE=body-panel-0-H2,w/.test(r.gaps[0].detail), JSON.stringify(r.gaps).slice(0, 200));
r = build([['plan.dxf', planDxf], ['west.dxf', westDxf(poly('H2', 'Wall', [GAB]))]], { numbers: { 'body-panel-0-H2': { w: 0.2 } } });
ok('PN8 the user states the number (@SIZE w, here via opts.numbers): the panel is built at 0.2 m, source user', r.els.length === 1 && r.els[0].size.t.number === 0.2 && r.els[0].size.t.source === 'user');
const lowAndGab = labelled + poly('H2', 'Wall', [GAB]);
r = build([['plan.dxf', planDxf], ['west.dxf', westDxf(lowAndGab)]]);
ok('PN9 CONTROL a label that overlaps another panel in height only: the gable (z 2..2.5) does NOT inherit the lower panel\'s 10" (no overlap) -> no body for it, the lower one stands', r.els.length === 1 && r.els[0].handle === 'H1' && r.gaps.some(x => x.code === 'GAP:panel_no_thickness' && x.handle === 'H2'));
r = build([['plan.dxf', planDxf], ['west.dxf', westDxf(labelled.replace('Wall', 'Other'))]]);
ok('PN10 FALSIFIER the hatch layer is not the typed one (Other, not Wall): no panels, no gaps', r.els.length === 0 && r.gaps.length === 0);
r = build([['plan.dxf', planDxf], ['west.dxf', westDxf(poly('H4', 'Wall', [LOW, [[400, 400], [800, 400], [800, 800], [400, 800]]]) + LD('L1', [[500, 1500], [700, -300], [900, -300]]) + tx('10" Brick Wall', 900, -300))]]);
ok('PN11 CONTROL a loop inside another loop of the same hatch is a HOLE: GAP:panel_hole_unsupported for it, the outer panel is still built (never a solid where the drawing has a hole... reported, not hidden)', r.gaps.some(x => x.code === 'GAP:panel_hole_unsupported') && r.els.length === 1 && r.els[0].guid === 'body-panel-0-H4-L0', JSON.stringify(r.gaps).slice(0, 160));
r = build([['plan.dxf', planDxf], ['west.dxf', westDxf(poly('H5', 'Wall', [LOW, [[2150, 0], [4150, 0], [4150, 2000], [2150, 2000]]]) + LD('L1', [[500, 1000], [700, -300], [900, -300]]) + tx('10" Brick Wall', 900, -300))]]);
ok('PN12 one entity with TWO separate loops gives two bodies with distinct ids (-L0, -L1)', r.els.length === 2 && new Set(r.els.map(e => e.guid)).size === 2 && r.els.every(e => /-L[01]$/.test(e.guid)), r.els.map(e => e.guid).join());
// a NORTH-type face (minY, runs along X): the other axis permutation, windings must still be outward
const SOUTH = [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=S'], ['@GRIDH=A', 1000, 0], ['@GRIDH=B', 4000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Wall,panel']];
const sPanel = poly('S1', 'Wall', [[[1000, 0], [4000, 0], [4000, 2000], [1000, 2000]]]) + LD('L1', [[2000, 1000], [2200, -300], [2400, -300]]) + tx('5" Brick Wall', 2400, -300);
r = build([['plan.dxf', planDxf], ['south.dxf', doc(sPanel, SOUTH)]]);
ok('PN13 a minY face (runs along X): the panel lies on the SOUTH grid line y = 0.15 m, thickness 0.127 m centred on it, 3 m x 2 m, volume positive', r.els.length === 1 && JSON.stringify(bb(r.els[0])) === JSON.stringify([[1, 4], [0.0865, 0.2135], [0, 2]]) && Math.abs(vol(r.els[0]) - 6 * 0.127) < 1e-9, r.els[0] && JSON.stringify(bb(r.els[0])) + ' vol ' + vol(r.els[0]).toFixed(5));
ok('PN14 determinism: the same sheets twice give identical panels', JSON.stringify(build([['plan.dxf', planDxf], ['west.dxf', westDxf(two)]]).els) === JSON.stringify(build([['plan.dxf', planDxf], ['west.dxf', westDxf(two)]]).els));
// through the structure judge: a panels-only set (plan with grid + West elevation, no column layer) is a structure set that qualifies
const sh = read([['plan.dxf', planDxf], ['west.dxf', westDxf(two)]]), j = ST.judge(sh, { I, B });
ok('PN15 the structure judge builds the panels with the other bodies: panel kind is a body kind, 2 bodies, 0 blocking, defaults carried', ST.isStructure(sh, B) && j.gate.structure && j.gate.structure.bodies === 2 && j.gate.verdict.blocking.length === 0 && j.defaults.some(d => d.key === 'panel.plane'), j.log);

// a label that states a height ("5\" Support Wall, H-24\"") against the drawn panel height: advisory, geometry as drawn
r = build([['plan.dxf', planDxf], ['west.dxf', westDxf(poly('H1', 'Wall', [LOW]) + LD('L1', [[500, 1000], [700, -300], [900, -300]]) + tx('5" Support Wall, H-24"', 900, -300))]]);
ok('PN17 the label states H-24" (0.6096 m) but the drawn panel is 2.0 m high: GAP:panel_label_height (ratio 3.28), the panel is still built as drawn (the thickness 5" from the same label)', r.els.length === 1 && r.els[0].size.t.number === 0.127 && r.gaps.some(x => x.code === 'GAP:panel_label_height' && /0.6096/.test(x.detail) && /3\.28/.test(x.detail)), JSON.stringify(r.gaps).slice(0, 220));
r = build([['plan.dxf', planDxf], ['west.dxf', westDxf(poly('H1', 'Wall', [LOW]) + LD('L1', [[500, 1000], [700, -300], [900, -300]]) + tx('5" Support Wall, H-79"', 900, -300))]]);
ok('PN18 CONTROL a stated height that agrees (H-79" = 2.007 m against 2.0 m): no height advisory', r.els.length === 1 && !r.gaps.some(x => x.code === 'GAP:panel_label_height'));
// ---- §L11.3 fans: concentric CIRCLEs of a layer typed `fan` ----
const circ = (layer, x, y, r, h) => g(0, 'CIRCLE') + g(5, h) + g(8, layer) + g(10, x) + g(20, y) + g(30, 0) + g(40, r);
const fanSheet = (body, extra) => doc(body, WEST(['@LAYER=Rod,fan'].map(t => [t])).concat(extra || []));
let fr = build([['plan.dxf', planDxf], ['west.dxf', doc(circ('Rod', 1000, 1500, 700, 'F1') + circ('Rod', 1000, 1500, 120, 'F2'), WEST([['@LAYER=Rod,fan']]).filter(m => !/Wall,panel/.test(m[0])))]]);
const fan = fr.els[0], area24 = 0.5 * 24 * 0.7 * 0.7 * Math.sin(2 * Math.PI / 24);
ok('PN19 two concentric circles (r 700 and 120 mm) on a layer typed fan = ONE IfcFan: the outer circle is the housing (diameter 1.4 m), a 0.3 m deep disc (yellow default fan.depth) centred on the wall plane x = 1.0 m at y 1.0 + 0.15..., z 1.5 m; volume = the 24-gon area x depth', fr.els.length === 1 && fan.class === 'IfcFan' && fan.size.d.number === 1.4 && fan.size.rings === 2 && fan.size.depth.number === 0.3 && fan.size.depth.source === 'default' && Math.abs(vol(fan) - area24 * 0.3) < 1e-5 && JSON.stringify(bb(fan)) === JSON.stringify([[0.85, 1.15], [0.3, 1.7], [0.8, 2.2]]), JSON.stringify(fan && bb(fan)) + ' vol ' + (fan && vol(fan).toFixed(5)));
ok('PN20 the fan depth is a listed yellow default (fan.depth) and the state is derived (position and diameter drawn, depth not)', fr.defaults.some(d => d.key === 'fan.depth' && d.kind === 'default') && fan.prov === 'derived');
fr = build([['plan.dxf', planDxf], ['west.dxf', doc(circ('Rod', 1000, 1500, 700, 'F1'), WEST([['@LAYER=Rod,fan']]).filter(m => !/Wall,panel/.test(m[0])))]], { numbers: { 'body-fan-0-F1': { w: 0.5 } } });
ok('PN21 the user states the depth (@SIZE w = 0.5 m): the fan is 0.5 m deep, source user', fr.els.length === 1 && fr.els[0].size.depth.number === 0.5 && fr.els[0].size.depth.source === 'user');
fr = build([['plan.dxf', planDxf], ['west.dxf', doc(circ('Rod', 1000, 1500, 700, 'F1') + circ('Other', 2000, 1500, 300, 'F3'), WEST([['@LAYER=Rod,fan']]).filter(m => !/Wall,panel/.test(m[0])))]]);
ok('PN22 CONTROL a circle on another layer (Other) is not a fan', fr.els.length === 1 && fr.els[0].handle === 'F1');
fr = build([['plan.dxf', planDxf], ['west.dxf', doc(circ('Rod', 1000, 1500, 700, 'F1') + circ('Rod', 3000, 1500, 700, 'F4'), WEST([['@LAYER=Rod,fan']]).filter(m => !/Wall,panel/.test(m[0])))]]);
ok('PN23 two separate fans (centres 2 m apart) are two bodies with distinct ids', fr.els.length === 2 && new Set(fr.els.map(e => e.guid)).size === 2);
// real shed (local material, SKIP when absent): the West and East gable ends
const SH = process.env.SHED_SHEETS || path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets/');
if (!fs.existsSync(path.join(SH, '2_ELEV_WEST.dxf'))) console.log('SKIP PN16: local shed sheets not present');
else console.log('PN16 (real shed) is exercised by W-CLI C20');
console.log(fail ? 'FAIL W-PANELS ' + fail : 'PASS W-PANELS'); process.exit(fail ? 1 : 0);
