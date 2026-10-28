#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-BAY-RIDE (prompts/DXF2BIM_FOUNDATION_LANE.md §D89 step 3). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: "add a bay" moved every element whose centre lies beyond the hinge by its own raw GEOM_MOVE, so a door moved because it lay beyond, not because
// it rides its wall — a door in a wall that stays was pulled out of it, and a hosted door's move did not say it rode its host. The spine already owns "what drags along"
// (SdgCascade.ridersFor, as commitMove uses it). Pure planner, node, a built set (5 bays at 3 m on x; bays 0-2 typical = 2 walls; the real Farming Shed rule from element_defaults.json):
//   R1 the hosted door beyond the hinge (#D3 in wall #W3s) moves as a hosted-by rider of its moved wall, same delta, and has no bay-add op of its own
//   R2 the door whose wall stays (#D2, in the bay-2 wall #W2n that straddles the hinge, centre on the near side) gets no op
//   R3 the unhosted door beyond (#D4, no fills edge) still moves one pitch as a free element
//   R4 a filling hosted by a full-length element the bay stretches (window #K in covering #CV) refuses the plan with the reason
//   R6 (§D89 step 4, B8) a typical bay holding a cut wall + its window: the new bay gets the same — the window copied as its wall's rider, the cut copied into the copied wall
//      (void + one pitch, fillingFid = the copied window), the fills edge re-keyed; main's bay copy has no window and no cut
//   R5 without the cascade the plan is today's: every non-spanning element beyond the hinge gets its own bay-add move, no riders
// Falsifier: BAY_ADD_MODULE=<main 1e7b6d40's bay_add.js> -> R1, R2, R4, R6 FAIL; main 3f7d1fd8 (step 3) -> R6 FAIL.
// usage: node modeller/tests/witness_bay_ride.js
'use strict';
const path = require('path');
const BayAdd = require(process.env.BAY_ADD_MODULE || path.join(__dirname, '..', 'bay_add.js'));
const SdgCascade = require(path.join(__dirname, '..', 'sdg_cascade.js'));
const Clipboard = require(path.join(__dirname, '..', 'clipboard.js'));   // the planner's copier (§D89 step 4); main's planner ignores it
const copier = rows => ({ build: Clipboard.build, ops: rows.map(r => ({ id: r.id, op_type: 'GEOM_INSERT', parameters: r.params })), firstId: 1000 });
const rule = require(path.join(__dirname, '..', 'element_defaults.json')).building_types['Farming Shed'].edits.bay_repeat;
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const grid = { xs: [0, 3, 6, 9, 12, 15], ys: [0, 10], xlabels: ['1', '2', '3', '4', '5', '6'], ylabels: ['A', 'B'] }, PITCH = 3;
let nid = 0; const name = {};
const row = (nm, cls, x0, x1, y0, y1) => { const id = ++nid; name[id] = nm; return { id, cls, params: { ifc_class: cls, placement: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, rot: 0 }, bbox: [x0, x1, y0, y1, 0, 3] }, box: [x0, y0, 0, x1, y1, 3] }; };
const rowsA = [];
for (let j = 0; j < 5; j++) {   // two side walls per bay; bay 2's north wall runs past the hinge (x 9) and holds a door beyond it
  rowsA.push(row('W' + j + 's', 'IfcWall', j * 3 + 0.1, j * 3 + 2.9, -0.1, 0.1));
  rowsA.push(row('W' + j + 'n', 'IfcWall', j * 3 + 0.1, j === 2 ? 9.8 : j * 3 + 2.9, 9.9, 10.1));
}
grid.xs.forEach((x, i) => rowsA.push(row('C' + i, 'IfcColumn', x - 0.15, x + 0.15, -0.15, 0.15)));
rowsA.push(row('D3', 'IfcDoor', 10, 11, -0.1, 0.1));      // hosted by W3s (beyond)
rowsA.push(row('D2', 'IfcDoor', 9.4, 9.7, 9.9, 10.1));    // hosted by W2n (centre 7.95: stays), the door's own centre 9.55 lies beyond
rowsA.push(row('D4', 'IfcDoor', 13, 14, -0.1, 0.1));      // no fills edge: a free element beyond
rowsA.push(row('PL', 'IfcMember', 0, 15, 4.9, 5.1));      // a full-length purlin (stretched)
const byName = {}; rowsA.forEach(r => { byName[name[r.id]] = r.id; });
const guidByFid = {}, fidByGuid = {}; rowsA.forEach(r => { guidByFid[r.id] = 'g' + r.id; fidByGuid['g' + r.id] = r.id; });
const edge = (f, h) => ({ host_guid: 'g' + byName[h], filling_guid: 'g' + byName[f], kind: 'fills' });
const fillsA = [edge('D3', 'W3s'), edge('D2', 'W2n')];
const cas = fills => ({ ridersFor: SdgCascade.ridersFor, guidByFid, fidByGuid, fills });
const opsOf = (P, id) => P.ops.filter(o => o.params.parent === id).map(o => o.op_type + '(' + (o.params.induced || '-') + ' dx=' + o.params.dx + ')');
const P = BayAdd.plan(rowsA, grid, rule, 'max', cas(fillsA), copier(rowsA));
console.log('§BAY-RIDE plan ok=' + P.ok + ' why=' + P.why + ' moved=' + (P.moved || []).map(i => name[i]).join(',') + ' riders=' + (P.riders || []).map(i => name[i]).join(','));
if (!P.ok) { ok('R0 the built set plans', false, P.why); console.log('§W-BAY-RIDE FAIL judged=' + judged + ' fail=' + fails); process.exit(1); }
const d3 = opsOf(P, byName.D3), w3 = opsOf(P, byName.W3s);
ok('R1 the hosted door beyond moves as a hosted-by rider of its moved wall, same delta, no bay-add op of its own', d3.length === 1 && d3[0] === 'GEOM_MOVE(hosted-by dx=' + PITCH + ')' && w3[0] === 'GEOM_MOVE(bay-add dx=' + PITCH + ')',
  'D3 ' + JSON.stringify(d3) + ' | its wall W3s ' + JSON.stringify(w3));
const d2 = opsOf(P, byName.D2), w2 = opsOf(P, byName.W2n);
ok('R2 the door whose wall stays gets no op', d2.length === 0 && w2.length === 0, 'D2 ' + JSON.stringify(d2) + ' | its wall W2n ' + JSON.stringify(w2));
const d4 = opsOf(P, byName.D4);
ok('R3 the unhosted door beyond still moves one pitch as a free element', d4.length === 1 && d4[0] === 'GEOM_MOVE(bay-add dx=' + PITCH + ')', 'D4 ' + JSON.stringify(d4));
// R4 a window in the stretched full-length covering
const rowsB = rowsA.concat([row('CV', 'IfcCovering', 0, 15, -0.2, 10.2), row('K', 'IfcWindow', 12.5, 13.5, 4, 6)]);
rowsB.slice(-2).forEach(r => { byName[name[r.id]] = r.id; guidByFid[r.id] = 'g' + r.id; fidByGuid['g' + r.id] = r.id; });
const PB = BayAdd.plan(rowsB, grid, rule, 'max', cas(fillsA.concat([edge('K', 'CV')])), copier(rowsB));
ok('R4 a filling of a stretched full-length element refuses the plan with the reason', PB.ok === false && /stretch/.test(String(PB.why)) && String(PB.why).indexOf('#' + byName.K) >= 0,
  'ok=' + PB.ok + ' why="' + PB.why + '"');
// R5 no cascade: today's rule
const P0 = BayAdd.plan(rowsA, grid, rule, 'max', null, copier(rowsA));
const beyond = rowsA.filter(r => name[r.id] !== 'PL' && (r.box[0] + r.box[3]) / 2 > 9 + BayAdd.ON_LINE).map(r => r.id).sort((a, b) => a - b);
const mv0 = P0.ops.filter(o => o.op_type === 'GEOM_MOVE').map(o => o.params.parent).sort((a, b) => a - b);
ok('R5 without the cascade every non-spanning element beyond the hinge gets its own bay-add move (today\'s plan), no riders', P0.ok && JSON.stringify(mv0) === JSON.stringify(beyond) && P0.ops.every(o => o.op_type !== 'GEOM_MOVE' || o.params.induced === 'bay-add') && !(P0.riders || []).length,
  'moves ' + mv0.map(i => name[i]).join(',') + ' | beyond ' + beyond.map(i => name[i]).join(','));
// R6 a typical bay with a cut wall + window (bays 0-2: wall + window + cut; bays 3-4: plain walls)
nid = 100; const rowsC = [], opsC = [], gC = {}, fC = {}, edgesC = [];
for (let j = 0; j < 5; j++) {
  const ws = row('V' + j + 's', 'IfcWall', j * 3 + 0.1, j * 3 + 2.9, -0.1, 0.1), wn = row('V' + j + 'n', 'IfcWall', j * 3 + 0.1, j * 3 + 2.9, 9.9, 10.1); rowsC.push(ws, wn);
  if (j < 3) { const k = row('K' + j, 'IfcWindow', j * 3 + 1, j * 3 + 2, -0.05, 0.05); rowsC.push(k); edgesC.push({ host: ws.id, fill: k.id, cut: j }); }
}
grid.xs.forEach((x, i) => rowsC.push(row('Q' + i, 'IfcColumn', x - 0.15, x + 0.15, -0.15, 0.15)));
rowsC.forEach(r => { opsC.push({ id: r.id, op_type: 'GEOM_INSERT', parameters: r.params }); gC[r.id] = 'h' + r.id; fC['h' + r.id] = r.id; });
const cutIds = {}; edgesC.forEach(e => { const id = ++nid, k = rowsC.find(r => r.id === e.fill); cutIds[e.fill] = id;
  opsC.push({ id, op_type: 'GEOM_CUT', parameters: { parent: e.host, void: { c1: [k.box[0], -0.2, 1], c2: [k.box[3], 0.2, 2] }, slide: { opening: 'O' + e.cut, filling: null, fillingFid: e.fill } } }); });
const fillsC = edgesC.map(e => ({ host_guid: 'h' + e.host, filling_guid: 'h' + e.fill, opening_guid: null, kind: 'fills' }));
const PC = BayAdd.plan(rowsC, grid, rule, 'max', { ridersFor: SdgCascade.ridersFor, guidByFid: gC, fidByGuid: fC, fills: fillsC }, { build: Clipboard.build, ops: opsC, firstId: 1000 });
const nm = id => (rowsC.find(r => r.id === id) || {}).id != null ? name[id] : '#' + id;
const k2 = rowsC.find(r => name[r.id] === 'K2'), v2 = rowsC.find(r => name[r.id] === 'V2s');
const cK = PC.ok ? (PC.copied || []).find(c => c.from === k2.id) : null, cV = PC.ok ? (PC.copied || []).find(c => c.from === v2.id) : null;
const cutC = PC.ok ? PC.ops.find(o => o.op_type === 'GEOM_CUT') : null, eC = PC.ok && PC.copy ? PC.copy.edges[0] : null;
ok('R6 a typical bay with a cut wall + window: the new bay gets the window (its wall\'s rider) and the cut, into the copied wall, one pitch on; the fills edge re-keyed',
  PC.ok && !!cK && !!cV && !!cutC && cutC.params.parent === cV.to && Math.abs(cutC.params.void.c1[0] - (k2.box[0] + PITCH)) < 1e-9 && cutC.params.slide.fillingFid === cK.to &&
  !!eC && eC.host_guid === PC.copy.guidOf[cV.to] && eC.filling_guid === PC.copy.guidOf[cK.to],
  'ok=' + PC.ok + ' why=' + PC.why + ' copied ' + (PC.copied || []).map(c => nm(c.from)).join(',') + ' | window copy ' + (cK ? '#' + cK.to : 'none') + ' | cut ' + (cutC ? 'parent #' + cutC.params.parent + ' x ' + cutC.params.void.c1[0] + ' fillingFid #' + cutC.params.slide.fillingFid : 'none') + ' | edge ' + (eC ? eC.host_guid + ' <- ' + eC.filling_guid : 'none'));
console.log('§W-BAY-RIDE ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails); process.exit(fails || !judged ? 1 : 0);
