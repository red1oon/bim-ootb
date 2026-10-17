// W-PREP: dxf2prep.js (prompts/DXF2BIM_MODELLER_LANE.md §L7). Each check names the issue it proves; read the log, exit code alone is not evidence.
const P = require('../dxf2prep.js'), fs = require('fs'), path = require('path');
let fail = 0; const ok = (name, c, info) => { console.log((c ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!c) fail++; };
const throws = f => { try { f(); return false; } catch (e) { return true; } };

// W-PREP-ID — issue: one hatch with 3 loops gave 3 bodies the same guid (meshes swapped on the canvas)
const ids = [0, 1, 2].map(i => ({ guid: P.bodyId('167', i, 3), handle: '167' }));
ok('ID1 three loops of one entity get three distinct ids', new Set(ids.map(b => b.guid)).size === 3, ids.map(b => b.guid).join(' '));
ok('ID2 single-loop entity keeps its plain handle', P.bodyId('14E', 0, 1) === '14E');
ok('ID3 FALSIFIER: the old behaviour (same id for three bodies) is caught', throws(() => P.assertUniqueIds([0, 1, 2].map(() => ({ guid: 'gable-167', handle: '167' })))));
ok('ID4 a unique set passes', P.assertUniqueIds(ids) === 3);

// W-PREP-LOOPS — issue: CAD elevations are loose lines, the reader needs closed rectangles
const rect = (x0, y0, x1, y1, h) => [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]].map(([a, b], i) => ({ a, b, handle: h + '.' + i }));
let segs = rect(0, 0, 10, 5, 'A').concat(rect(20, 0, 30, 5, 'B'));
let r = P.lineLoops(segs, 0.001);
ok('LP1 two separate rectangles -> two loops with areas 50', r.loops.length === 2 && r.loops.every(l => Math.abs(l.area - 50) < 1e-9), r.loops.map(l => l.area).join(','));
ok('LP2 member handles are listed', r.loops.some(l => l.handles.length === 4));
segs = rect(0, 0, 10, 5, 'A').filter((s, i) => i !== 2);   // remove the top line
ok('LP3 FALSIFIER: removing one line breaks exactly that loop', P.lineLoops(segs, 0.001).loops.length === 0);
segs = rect(0, 0, 10, 5, 'A').concat([{ a: [5, 0], b: [5, 5], handle: 'T' }]);   // T-junction divider through a rectangle (endpoints on the edges, not at corners)
r = P.lineLoops(segs, 0.001);
ok('LP4 a divider on the edges splits the rectangle into 2 regions of 25', r.loops.length === 2 && r.loops.every(l => Math.abs(l.area - 25) < 1e-9), r.loops.map(l => l.area).join(','));
segs = [{ a: [0, 0], b: [6, 0], handle: 'a' }, { a: [4, 0], b: [10, 0], handle: 'b' }, { a: [10, 0], b: [10, 5], handle: 'c' }, { a: [10, 5], b: [0, 5], handle: 'd' }, { a: [0, 5], b: [0, 0], handle: 'e' }];
r = P.lineLoops(segs, 0.001);
ok('LP5 overlapping collinear lines (CAD double-draw) still give one loop of 50', r.loops.length === 1 && Math.abs(r.loops[0].area - 50) < 1e-9, r.loops.map(l => l.area).join(','));
segs = rect(0, 0, 10, 5, 'A').map(s => ({ a: [s.a[0] + 0.0004, s.a[1]], b: s.b, handle: s.handle }));
ok('LP6 endpoints 0.4 mm apart snap within tol 1 mm', P.lineLoops(segs, 0.001).loops.length === 1);

// real CAD: the shed's South elevation (local-only material, optional)
const SH = process.env.SHED_SHEETS || path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets');
const f = path.join(SH, '1S_ELEV_SOUTH.dxf');
if (fs.existsSync(f)) {
  const DxfParser = require('../lib/dxf-parser.js'), d = new DxfParser().parseSync(fs.readFileSync(f, 'utf8'));
  const sg = []; d.entities.forEach(e => { if (e.type === 'LINE' && e.layer === '0') sg.push({ a: [e.vertices[0].x, e.vertices[0].y], b: [e.vertices[1].x, e.vertices[1].y], handle: e.handle }); });
  const L = P.lineLoops(sg, 0.05);
  const big = L.loops.filter(l => l.area > 100);
  console.log('INFO shed South elevation: ' + sg.length + ' LINEs (layer 0) -> ' + L.loops.length + ' closed loops, ' + big.length + ' larger than 100 sq in, dropped ' + L.dropped);
  ok('LP7 real CAD elevation yields closed regions (was 0 closed wall rectangles before)', L.loops.length > 0);
} else console.log('SKIP LP7 shed sheets not present (local-only material)');

// W-PREP-DEFAULTS — issue: values the drawing does not state were defaulted silently
const D = P.Defaults();
D.stated('column.size', '12x12 in', ['1AC']); D.assume('roof.thickness', 1, 'not stated in the drawing; display thickness', [0.5, 1, 1.5]);
ok('DF1 a stated value is not listed as a default', D.defaults().length === 1 && D.defaults()[0].key === 'roof.thickness');
ok('DF2 issues flag is on while a default stands', D.hasIssues());
D.override('roof.thickness', 1.5);
ok('DF3 choosing a value clears the issue and records the choice', !D.hasIssues() && D.rows().find(x => x.key === 'roof.thickness').kind === 'chosen');
ok('DF4 stated rows keep their evidence handles', D.rows()[0].evidence[0] === '1AC');

// W-IFC-TYPE — issue: 4D/5D needs a proper IFC class + predefined type on every body
const t = P.ifcType('purlin', 'Purlin 1.5"x1.5"x1/4" Angle', 'steel');
ok('IT1 purlin -> IfcMember/PURLIN with the drawing label', t.ifc_class === 'IfcMember' && t.PredefinedType === 'PURLIN' && t.type_name.startsWith('Purlin'));
ok('IT2 FALSIFIER: an unmapped kind fails loudly, no silent IfcBuildingElementProxy', throws(() => P.ifcType('flux-capacitor')));
// W-PREP-EMIT (§L7.8) — issue: a value the pre-processor applies must be a visible default, and a user choice must change the result
const L = (a, b, c, d, h) => ({ type: 'LINE', layer: '0', handle: h, vertices: [{ x: a, y: b }, { x: c, y: d }] });
const box = (x0, y0, x1, y1, h, gap) => [L(x0, y0, x1, y0, h + 1), L(x1, y0, x1, y1, h + 2), L(x1, y1, x0, y1, h + 3), L(x0, y0 + (gap || 0), x0, y1, h + 4)];
const sheet = box(0, 0, 10, 5, 'A').concat(box(20, 0, 30, 5, 'B', 0.05));   // B's left side starts 0.05 above its corner: an open corner
let E = P.prepare(sheet, {});
ok('EM1 a line-work sheet emits exactly one default, loops.snap_tol = 0.01', E.lineWork && E.defaults.filter(r => r.kind === 'default').length === 1 && E.defaults[0].key === 'loops.snap_tol' && E.defaults[0].value === 0.01, JSON.stringify(E.defaults.map(r => [r.key, r.value, r.kind])));
ok('EM2 at the default tolerance the open corner stays open: 1 region', E.loops.length === 1, String(E.loops.length));
ok('EM3 CONTROL a user choice changes the result: tol 0.1 closes the corner (2 regions)', P.prepare(sheet, { 'loops.snap_tol': 0.1 }).loops.length === 2);
ok('EM3b CONTROL tol 0.001 keeps it open (1 region)', P.prepare(sheet, { 'loops.snap_tol': 0.001 }).loops.length === 1);
ok('EM4 the choice is recorded as chosen (no longer a default)', P.prepare(sheet, { 'loops.snap_tol': 0.1 }).defaults[0].kind === 'chosen');
const closedSheet = [{ type: 'LWPOLYLINE', layer: 'A-WALL', shape: true, handle: 'P', vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }] }].concat(box(0, 0, 10, 5, 'A'), box(20, 0, 30, 5, 'B'));
ok('EM5 a sheet with a closed polyline is not line work: NO default emitted (no yellow noise)', !P.prepare(closedSheet, {}).lineWork && P.prepare(closedSheet, {}).defaults.length === 0);
ok('EM6 marking-layer texts/lines are ignored by the segment reader', P.segmentsOf([{ type: 'LINE', layer: 'DXF2BIM-MARK', vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }]).length === 0);
const D2 = P.Defaults(); P.prepare(sheet, {}, D2); P.prepare(sheet, {}, D2);
ok('EM7 two line-work sheets share ONE tolerance row', D2.rows().length === 1);
console.log(fail ? 'W-PREP FAIL ' + fail : 'W-PREP PASS'); process.exit(fail ? 1 : 0);
