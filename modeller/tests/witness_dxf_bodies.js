// W-BODIES (prompts/DXF2BIM_MODELLER_LANE.md §L7.10). Issue: columns/beams of a CAD set cannot be expressed by the wall/slab/roof pipeline; bodies must come ONLY from drawn
// geometry typed by the user (plan footprint x elevation z range) and a missing/contradicting height must be a gap, never a guess. Read the log; exit code is not evidence.
const I = require('../dxf2bim_import.js'), B = require('../dxf2bodies.js'), P = require('../dxf2prep.js');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const g = (c, v) => c + '\n' + v + '\n';
const poly = (layer, x0, y0, x1, y1, h) => g(0, 'LWPOLYLINE') + g(5, h) + g(8, layer) + g(90, 4) + g(70, 1) + g(10, x0) + g(20, y0) + g(10, x1) + g(20, y0) + g(10, x1) + g(20, y1) + g(10, x0) + g(20, y1);
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const lbox = (layer, x0, y0, x1, y1) => line(layer, x0, y0, x1, y0) + line(layer, x1, y0, x1, y1) + line(layer, x1, y1, x0, y1) + line(layer, x0, y1, x0, y0);
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 4000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 2150], ['@LAYER=Col,column']];
const ELEV = (face, extra) => [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=' + (face || 'minY')], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=E'], ['@GRIDH=A', 1000, 0], ['@GRIDH=B', 4000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Col,column']].concat(extra || []);
const cols = [[850, 1150], [3850, 4150], [6850, 7150]];
const planDxf = (list) => doc(list.map(([a, b], i) => poly('Col', a, 0, b, 300, 'C' + i)).join(''), PLAN);
const elevDxf = (top, extra, only) => doc((only || cols).map(([a, b]) => lbox('Col', a, 0, b, top)).join('') + lbox('Col', 1150, 0, 3850, top), ELEV('minY', extra));   // + one bay panel that matches no plan column
const read = files => I.readSheets(files.map(([name, text]) => ({ name, text })), { prep: P });
const run = (files, o) => B.buildBodies(read(files), o);

let r = run([['plan.dxf', planDxf(cols)], ['south.dxf', elevDxf(3000)]]);
ok('B1 3 plan column rectangles x a South elevation -> exactly 3 columns', r.els.length === 3 && r.els.every(e => e.kind === 'column'), JSON.stringify(r.report.kinds));
ok('B1b z range is the drawn one (0..3 m), IfcColumn/COLUMN, provenance drawn, height from the elevation', r.els.every(e => e.z0 === 0 && e.z1 === 3 && e.class === 'IfcColumn' && e.ifc.PredefinedType === 'COLUMN' && e.prov === 'drawn' && e.height_source === 'elevation'));
const noPanel = run([['plan.dxf', planDxf(cols)], ['south.dxf', doc(cols.map(([a, b]) => lbox('Col', a, 0, b, 3000)).join(''), ELEV('minY'))]]);
ok('B2 CONTROL the elevation bay panel (1150..3850) matches no plan column: the bodies are identical with and without it', JSON.stringify(noPanel.els.map(e => [e.guid, e.z0, e.z1])) === JSON.stringify(r.els.map(e => [e.guid, e.z0, e.z1])) && r.els.length === 3);
const vol = e => { let v = 0; e.faces.forEach(([a, b, c]) => { const A = e.vertices[a], Bv = e.vertices[b], C = e.vertices[c]; v += (A[0] * (Bv[1] * C[2] - Bv[2] * C[1]) - A[1] * (Bv[0] * C[2] - Bv[2] * C[0]) + A[2] * (Bv[0] * C[1] - Bv[1] * C[0])) / 6; }); return v; };
ok('B7 mesh volume == footprint x height (0.3 x 0.3 x 3 m) and windings outward (volume > 0)', r.els.every(e => Math.abs(vol(e) - 0.27) < 1e-9), r.els.map(e => vol(e).toFixed(6)).join(','));
ok('B6 ids unique', new Set(r.els.map(e => e.guid)).size === r.els.length);
r = run([['plan.dxf', planDxf(cols.concat([[9850, 10150]]))], ['south.dxf', elevDxf(3000)]]);
ok('B3 CONTROL a 4th plan column with no elevation counterpart -> GAP:body_no_elevation, no body (no guessed height)', r.els.length === 3 && r.gaps.length === 1 && r.gaps[0].code === 'GAP:body_no_elevation', JSON.stringify(r.gaps.map(x => x.code)));
const north = elevDxf(3500).replace('@FACE=minY', '@FACE=maxY');
r = run([['plan.dxf', planDxf(cols)], ['south.dxf', elevDxf(3000)], ['north.dxf', north]]);
ok('B4 CONTROL South says 3.0 m, North says 3.5 m for the same columns -> GAP:body_ambiguous_z x3, no body', r.els.length === 0 && r.gaps.filter(x => x.code === 'GAP:body_ambiguous_z').length === 3, JSON.stringify(r.gaps.map(x => x.code)));
const untyped = planDxf(cols).replace('@LAYER=Col,column', '@LAYER=Col,ignore');
r = run([['plan.dxf', untyped], ['south.dxf', elevDxf(3000)]]);
ok('B5 FALSIFIER an untyped layer produces nothing (no body, no gap)', r.els.length === 0 && r.gaps.length === 0);
const r1 = run([['plan.dxf', planDxf(cols)], ['south.dxf', elevDxf(3000)]]), r2 = run([['plan.dxf', planDxf(cols)], ['south.dxf', elevDxf(3000)]]);
ok('B8 deterministic: the same input twice gives the same bodies', JSON.stringify(r1.els) === JSON.stringify(r2.els));
// the elevation drawn as LOOSE LINES gives the same columns (the shed case); a beam typed on the same layers is a different kind
ok('B9 beam kind: a layer typed beam gives IfcBeam/BEAM', (() => { const p = planDxf(cols).replace(/@LAYER=Col,column/, '@LAYER=Col,beam'), e = elevDxf(3000).replace('@LAYER=Col,column', '@LAYER=Col,beam'); const x = run([['plan.dxf', p], ['south.dxf', e]]); return x.els.length === 3 && x.els.every(q => q.class === 'IfcBeam' && q.ifc.PredefinedType === 'BEAM'); })());
console.log(fail ? 'W-BODIES FAIL ' + fail : 'W-BODIES PASS'); process.exit(fail ? 1 : 0);
