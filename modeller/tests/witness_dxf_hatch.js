// W-HATCH (prompts/DXF2BIM_MODELLER_LANE.md §L11). Issue: dxf-parser has no HATCH, so the shed's brick-wall hatches (144 in the source) were invisible to the reader;
// boundary loops must come out of the DXF text exactly, none dropped silently. Read the log; exit code is not evidence.
const fs = require('fs'), path = require('path');
const H = require('../dxf2hatch.js');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const g = (c, v) => c + '\n' + v + '\n';
const head = (handle, layer, pat) => g(0, 'HATCH') + g(5, handle) + g(8, layer) + g(100, 'AcDbHatch') + g(10, 0) + g(20, 0) + g(30, 0) + g(2, pat) + g(70, 0) + g(71, 0);
const polyPath = (vs, closed, bulges) => g(92, 3) + g(72, bulges ? 1 : 0) + g(73, closed ? 1 : 0) + g(93, vs.length) + vs.map((v, i) => g(10, v[0]) + g(20, v[1]) + (bulges ? g(42, bulges[i] || 0) : '')).join('') + g(97, 0);
const edgePath = (edges) => g(92, 1) + g(93, edges.length) + edges.map(e => e.t === 1 ? g(72, 1) + g(10, e.a[0]) + g(20, e.a[1]) + g(11, e.b[0]) + g(21, e.b[1]) : g(72, 2) + g(10, e.c[0]) + g(20, e.c[1]) + g(40, e.r) + g(50, e.a0) + g(51, e.a1) + g(73, 1)).join('') + g(97, 0);
const tail = g(75, 1) + g(76, 1) + g(98, 0);
const doc = (body) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + g(0, 'ENDSEC') + g(0, 'EOF');
const rect = [[0, 0], [100, 0], [100, 50], [0, 50]];

let r = H.parseHatches(doc(head('A1', 'Wall', 'BLOCKS') + g(91, 1) + polyPath(rect, true) + tail));
ok('H1 a polyline-path hatch: 1 hatch, layer Wall, pattern BLOCKS, 1 closed loop of 4 points, area 5000', r.hatches.length === 1 && r.hatches[0].layer === 'Wall' && r.hatches[0].pattern === 'BLOCKS' && r.hatches[0].loops.length === 1 && r.hatches[0].loops[0].closed && r.hatches[0].loops[0].pts.length === 4 && Math.abs(Math.abs(H.area(r.hatches[0].loops[0].pts)) - 5000) < 1e-9 && r.gaps.length === 0);
const edges = [{ t: 1, a: [0, 0], b: [100, 0] }, { t: 1, a: [100, 50], b: [100, 0] }, { t: 1, a: [100, 50], b: [0, 50] }, { t: 1, a: [0, 0], b: [0, 50] }];   // shuffled directions
r = H.parseHatches(doc(head('A2', 'Wall', 'BLOCKS') + g(91, 1) + edgePath(edges) + tail));
ok('H2 an edge-path hatch whose 4 LINE edges run in mixed directions is chained into one closed 4-point loop (area 5000)', r.hatches[0].loops.length === 1 && r.hatches[0].loops[0].closed && r.hatches[0].loops[0].pts.length === 4 && Math.abs(Math.abs(H.area(r.hatches[0].loops[0].pts)) - 5000) < 1e-9 && r.gaps.length === 0);
r = H.parseHatches(doc(head('A3', 'Wall', 'BLOCKS') + g(91, 3) + polyPath(rect, true) + polyPath([[10, 10], [20, 10], [20, 20], [10, 20]], true) + polyPath([[50, 10], [60, 10], [60, 20], [50, 20]], true) + tail));
ok('H3 ONE entity with 3 loops (the shed gable case) gives 3 loops of one hatch, in order (the importer needs -L<i> ids)', r.hatches.length === 1 && r.hatches[0].loops.length === 3 && Math.abs(H.area(r.hatches[0].loops[1].pts)) === 100);
r = H.parseHatches(doc(head('A4', 'Dim', 'ANSI31') + g(91, 1) + edgePath([{ t: 1, a: [0, 0], b: [100, 0] }, { t: 2, c: [100, 50], r: 50, a0: 270, a1: 90 }, { t: 1, a: [100, 100], b: [0, 100] }, { t: 1, a: [0, 100], b: [0, 0] }]) + tail));
const lp = r.hatches[0].loops[0];
ok('H4 a counter-clockwise ARC edge (semicircle r 50) is flattened and chained: closed loop, arc flag, area = 100x100 box + half disc', lp.closed && lp.arc && Math.abs(Math.abs(H.area(lp.pts)) - (100 * 100 + Math.PI * 2500 / 2)) < 60, 'area=' + Math.abs(H.area(lp.pts)).toFixed(1));
r = H.parseHatches(doc(head('A5', 'Wall', 'BLOCKS') + g(91, 1) + edgePath([{ t: 1, a: [0, 0], b: [100, 0] }, { t: 1, a: [100, 0], b: [100, 50] }, { t: 1, a: [0, 50], b: [0, 0] }]) + tail));
ok('H5 CONTROL edges that do not close (a missing side) -> GAP:hatch_loop_open with the hatch handle, loop kept but closed=false (never passed off as a region)', r.gaps.length === 1 && r.gaps[0].code === 'GAP:hatch_loop_open' && r.gaps[0].handle === 'A5' && r.hatches[0].loops[0].closed === false);
r = H.parseHatches(doc(head('A6', 'Wall', 'BLOCKS') + g(91, 1) + g(92, 1) + g(93, 1) + g(72, 3) + g(10, 0) + g(20, 0) + g(11, 5) + g(21, 0) + g(40, 0.5) + g(50, 0) + g(51, 360) + g(73, 1) + g(97, 0) + tail));
ok('H6 CONTROL an ELLIPSE edge is not supported: GAP:hatch_edge_unsupported (with the handle), no loop invented', r.gaps.length === 1 && r.gaps[0].code === 'GAP:hatch_edge_unsupported' && r.hatches[0].loops.length === 0);
r = H.parseHatches(doc(head('A7', 'Wall', 'BLOCKS') + g(91, 1) + polyPath([[0, 0], [100, 0], [100, 50], [0, 50]], true, [0, -1, 0, 0]) + tail));
const bumpArea = bl => Math.abs(H.area(H.parseHatches(doc(head('B', 'Wall', 'BLOCKS') + g(91, 1) + polyPath([[0, 0], [100, 0], [100, 50], [0, 50]], true, bl) + tail)).hatches[0].loops[0].pts));
ok('H7 a polyline bulge of 1 (a semicircle, r 25) on the right side adds or removes exactly the half disc area (981.7) depending on its sign; no bulge = 5000', r.hatches[0].loops[0].arc && Math.abs(bumpArea([0, 0, 0, 0]) - 5000) < 1e-9 && [bumpArea([0, 1, 0, 0]), bumpArea([0, -1, 0, 0])].sort((x, y) => x - y).every((v, i) => Math.abs(v - (i ? 5000 + 981.75 : 5000 - 981.75)) < 15), [bumpArea([0, 1, 0, 0]).toFixed(1), bumpArea([0, -1, 0, 0]).toFixed(1)].join(' / '));
ok('H8 FALSIFIER the text of a drawing with no hatches yields none and no gap', H.parseHatches(doc(g(0, 'LINE') + g(8, 'X') + g(10, 0) + g(20, 0) + g(11, 1) + g(21, 1))).hatches.length === 0);
const LD = (h, pts) => g(0, 'LEADER') + g(5, h) + g(8, 'Dim') + g(100, 'AcDbLeader') + g(76, pts.length) + pts.map(p => g(10, p[0]) + g(20, p[1]) + g(30, 0)).join('');
const ls = H.parseLeaders(doc(LD('L1', [[10, 10], [20, 40], [35, 40]]) + LD('L2', [[1, 1]]) + g(0, 'LINE') + g(8, 'X') + g(10, 0) + g(20, 0) + g(11, 1) + g(21, 1)));
ok('H10 LEADER entities: tip = first vertex, label end = last; a one-vertex stub is not a leader; other entities are ignored', ls.length === 1 && ls[0].handle === 'L1' && ls[0].pts[0].join() === '10,10' && ls[0].pts[2].join() === '35,40');
ok('H11 inPoly: a point inside the 100x50 box, one outside, one in the notch of an L shape', H.inPoly([50, 25], rect) && !H.inPoly([150, 25], rect) && !H.inPoly([25, 40], [[0, 0], [100, 0], [100, 50], [50, 50], [50, 25], [0, 25]]));
// H9 the real shed: every hatch of the source sheets is accounted for (raw count == parsed count) and all loops close
const SH = process.env.SHED_SHEETS || path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets/');
if (!fs.existsSync(path.join(SH, '0_FLOOR_PLAN.dxf'))) console.log('SKIP H9: local shed sheets not present');
else {
  let raw = 0, parsed = 0, loops = 0, open = 0, gp = 0; const by = {};
  fs.readdirSync(SH).filter(f => /^[0-9N].*\.dxf$/.test(f)).sort().forEach(f => {
    const tx = fs.readFileSync(path.join(SH, f), 'utf8'), lines = tx.split(/\r?\n/); let rc = 0; for (let i = 0; i + 1 < lines.length; i += 2) if (lines[i].trim() === '0' && lines[i + 1].trim() === 'HATCH') rc++;
    const R = H.parseHatches(tx); raw += rc; parsed += R.hatches.length; gp += R.gaps.length; R.hatches.forEach(h => { loops += h.loops.length; h.loops.forEach(l => { if (!l.closed) open++; }); const k = h.layer + '/' + h.pattern; by[k] = (by[k] || 0) + 1; });
  });
  console.log('real shed: hatches raw=' + raw + ' parsed=' + parsed + ' loops=' + loops + ' open=' + open + ' gaps=' + gp + ' ' + JSON.stringify(by));
  ok('H9 real shed: every HATCH entity in the sheets is parsed (raw == parsed), every loop closes, 0 gaps', raw > 0 && raw === parsed && open === 0 && gp === 0, 'raw=' + raw + ' parsed=' + parsed);
}
console.log(fail ? 'FAIL W-HATCH ' + fail : 'PASS W-HATCH'); process.exit(fail ? 1 : 0);
