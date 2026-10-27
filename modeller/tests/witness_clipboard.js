#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-CLIPBOARD (BIMCompiler prompts/MODELLER_CLIPBOARD_COPY_PASTE.md §REGROUND 2026-10-28). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the Modeller had no copy that carries relations. "Add a bay" cloned a source's GEOM_INSERT params itself, so a copy had no hole, no door,
// and none of its source's later edits (a moved / stretched source was copied at its pre-edit place and size). Pure, node, a built op log:
//   C1 a wall with a cut + its door (one fills edge): the copy = wall + door + the cut + the cut's move + the door's slide; the cut's parent = the copied wall, its void = source + shift,
//      slide.fillingFid = the copied door, the cut-move's cutId = the copied cut; ONE fills edge re-keyed to the copies' guids (opening = the copied cut's guid)
//   C2 a source moved, scaled, grid-stretched and room-moved after its insert: the copy, folded by the shipped foldInsert, = the source's folded box + shift (2 float32 steps: the fold's positions are Float32Array);
//      control: the insert row alone (the bay's old clone) gives a different box (the fixture's edits matter, so C2 is not vacuous)
//   C3 the copy's grid op names no grid line (gridId null): the grid fold moves no line for it
//   C4 an op type the copy does not know (GEOM_SHELL) on the source refuses the copy, naming it
//   C5 a copy carries no bayCopy / spanSplit of its source (a copy never re-inserts a grid line)
//   C6 without the cascade, a copied wall comes alone: its cut is copied, fillingFid null, no edge
// usage: node modeller/tests/witness_clipboard.js
'use strict';
const path = require('path');
global.window = global; global.fetch = undefined; global.location = { href: 'http://localhost/' };
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'bonsai_library.js'));
const Library = global.window.Bonsai.library, Clipboard = require(path.join(ROOT, 'clipboard.js')), SdgCascade = require(path.join(ROOT, 'sdg_cascade.js'));
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const op = (id, t, p) => ({ id, op_type: t, parameters: p });
const ins = (id, cls, bbox, pl, extra) => op(id, 'GEOM_INSERT', Object.assign({ ifc_class: cls, bbox, placement: pl }, extra || {}));
const OPS = [
  ins(1, 'IfcWall', [-2, 2, -0.1, 0.1, -1.5, 1.5], { x: 10, y: 5, z: 0, rot: 0 }),
  ins(2, 'IfcDoor', [-0.45, 0.45, -0.05, 0.05, -1.05, 1.05], { x: 10.5, y: 5, z: 0, rot: 0 }),
  op(3, 'GEOM_CUT', { parent: 1, void: { c1: [10, 4.8, 0], c2: [11, 5.2, 2.1] }, slide: { opening: 'H1', filling: null, fillingFid: 2 } }),
  op(4, 'GEOM_CUT_MOVE', { cutId: 3, parent: 1, dx: 0.2, dy: 0, dz: 0, induced: 'fills-opening' }),
  op(5, 'GEOM_MOVE', { parent: 2, dx: 0.2, dy: 0, dz: 0 }),
  ins(6, 'IfcBeam', [-1, 1, -0.15, 0.15, -0.2, 0.2], { x: 0, y: 0, z: 3, rot: 0 }),
  op(7, 'GEOM_MOVE', { parent: 6, dx: 1, dy: 0, dz: 0 }),
  op(8, 'GEOM_SCALE', { parent: 6, fx: 1.5, fy: 1, fz: 1 }),
  op(9, 'GEOM_GRID_MOVE', { gridId: 'gx2', delta: 0.5, commands: [{ featureId: 6, action: 'SCALE', axis: 'x', newScale: 1.2, translateDelta: 0.1 }, { featureId: 99, action: 'TRANSLATE', axis: 'x', delta: 0.5 }] }),
  op(10, 'GEOM_ROOM_MOVE', { members: [{ featureId: 6 }, { featureId: 98 }], dx: 0, dy: 0.3, dz: 0 }),
  ins(11, 'IfcSlab', [-1, 1, -1, 1, -0.1, 0.1], { x: 20, y: 0, z: 0, rot: 0 }),
  op(12, 'GEOM_SHELL', { parent: 11, faces: [0], thickness: 0.05 }),
  ins(13, 'IfcColumn', [-0.15, 0.15, -0.15, 0.15, -1.5, 1.5], { x: 30, y: 0, z: 0, rot: 0 }, { bayCopy: { id: 'bay-x3', axis: 'x', index: 3, pos: 30, pitch: 3, dir: 1, src: 7 }, spanSplit: { id: 'ss-1' } })
];
const guidByFid = { 1: 'gW', 2: 'gD', 6: 'gB', 11: 'gS', 13: 'gC' }, fidByGuid = {}; Object.keys(guidByFid).forEach(f => { fidByGuid[guidByFid[f]] = +f; });
const cas = { ridersFor: SdgCascade.ridersFor, guidByFid, fidByGuid, fills: [{ a: 'gD', b: 'gW', host_guid: 'gW', filling_guid: 'gD', opening_guid: 'gCut3', kind: 'fills', provenance: 'dxf2bim:convert' }] };
const S = [3, 0, 0], FIRST = 100;
// C1
const B1 = Clipboard.build([1], S, OPS, FIRST, cas, { nonce: 'w' });
console.log('§CLIPBOARD-W C1 ok=' + B1.ok + ' why=' + B1.why + ' ops=' + B1.ops.map((o, i) => (FIRST + i) + ':' + o.op_type + '(p' + (o.params.parent != null ? o.params.parent : '-') + (o.params.cutId != null ? ' cut' + o.params.cutId : '') + ')').join(' ') + ' riders=' + JSON.stringify(B1.riders));
const cw = B1.copyOf && B1.copyOf[1], cd = B1.copyOf && B1.copyOf[2], cut = B1.ops.find(o => o.op_type === 'GEOM_CUT'), cm = B1.ops.find(o => o.op_type === 'GEOM_CUT_MOVE'), dm = B1.ops.find(o => o.op_type === 'GEOM_MOVE');
const cutId = FIRST + B1.ops.indexOf(cut), e = B1.edges[0] || {};
ok('C1 a copied wall brings its door, its cut (parent, void + shift, fillingFid), the cut move (cutId) and the door slide; one fills edge re-keyed', B1.ok && B1.ops.length === 5 && cw === 100 && cd === 101 &&
  cut && cut.params.parent === cw && JSON.stringify(cut.params.void) === JSON.stringify({ c1: [13, 4.8, 0], c2: [14, 5.2, 2.1] }) && cut.params.slide.fillingFid === cd &&
  cm && cm.params.cutId === cutId && cm.params.parent === cw && dm && dm.params.parent === cd && dm.params.dx === 0.2 &&
  B1.edges.length === 1 && e.host_guid === B1.guidOf[cw] && e.filling_guid === B1.guidOf[cd] && e.opening_guid === cut.outputGuid && e.host_guid !== 'gW',
  'copies wall #' + cw + ' door #' + cd + ' | cut parent=' + (cut && cut.params.parent) + ' void=' + JSON.stringify(cut && cut.params.void) + ' fillingFid=' + (cut && cut.params.slide.fillingFid) + ' | cutmove cutId=' + (cm && cm.params.cutId) + ' (cut id ' + cutId + ') | edges=' + B1.edges.length + ' ' + JSON.stringify(e).slice(0, 160));
// C2 fold: the kernel's per-parent accumulation (bonsai_kernel.js foldChainToScene) + the shipped foldInsert
const fold = (ops, fid) => {
  const mv = { dx: 0, dy: 0, dz: 0, drot: 0, fx: 1, fy: 1, fz: 1 }, grid = []; let insOp = null;
  ops.forEach(o => { const p = o.parameters || o.params;
    if (o.op_type === 'GEOM_INSERT' && o.id === fid) insOp = o;
    else if (p.parent === fid && o.op_type === 'GEOM_MOVE') { mv.dx += p.dx || 0; mv.dy += p.dy || 0; mv.dz += p.dz || 0; }
    else if (p.parent === fid && o.op_type === 'GEOM_ROTATE') mv.drot += p.drot || 0;
    else if (p.parent === fid && o.op_type === 'GEOM_SCALE') { mv.fx *= p.fx != null ? p.fx : 1; mv.fy *= p.fy != null ? p.fy : 1; mv.fz *= p.fz != null ? p.fz : 1; }
    else if (o.op_type === 'GEOM_ROOM_MOVE') (p.members || []).forEach(m => { if (m.featureId === fid) { mv.dx += p.dx || 0; mv.dy += p.dy || 0; mv.dz += p.dz || 0; } });
    else if (o.op_type === 'GEOM_GRID_MOVE') (p.commands || []).forEach(c => { if (c.featureId === fid) grid.push(c); }); });
  const d = Library.foldInsert({ id: fid, op_type: 'GEOM_INSERT', parameters: insOp.parameters || insOp.params }, mv, grid), b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < d.positions.length; i += 3) for (let k = 0; k < 3; k++) { b[2 * k] = Math.min(b[2 * k], d.positions[i + k]); b[2 * k + 1] = Math.max(b[2 * k + 1], d.positions[i + k]); }
  return b;
};
const B2 = Clipboard.build([6], S, OPS, FIRST, cas, { nonce: 'w' }), withIds = B2.ops.map((o, i) => ({ id: FIRST + i, op_type: o.op_type, parameters: o.params }));
const src = fold(OPS, 6), copy = B2.ok ? fold(withIds, B2.copyOf[6]) : null, want = src.map((v, i) => v + S[i >> 1]);
const ctrl = fold([{ id: 500, op_type: 'GEOM_INSERT', parameters: Object.assign({}, OPS[5].parameters, { placement: { x: 3, y: 0, z: 3, rot: 0 } }) }], 500);
const f32 = v => 2 * Math.pow(2, Math.floor(Math.log2(Math.max(1e-30, Math.abs(v)))) - 23), tol = Math.max.apply(null, want.map(f32));   // the fold writes Float32Array positions: 2 float32 steps of the largest coordinate (sdg_gate's rule)
const off = copy ? Math.max.apply(null, copy.map((v, i) => Math.abs(v - want[i]))) : Infinity, coff = Math.max.apply(null, ctrl.map((v, i) => Math.abs(v - want[i])));
ok('C2 a moved / scaled / grid-stretched / room-moved source: the copy folds to the source\'s box + shift; the insert row alone does not', B2.ok && off <= tol && coff > 0.1,
  'ops ' + B2.ops.map(o => o.op_type).join(',') + ' | source ' + src.map(v => v.toFixed(4)).join(',') + ' | copy - (source + shift) max ' + off.toExponential(2) + ' (tol ' + tol.toExponential(2) + ', float32) | insert-only control off by ' + coff.toFixed(4) + ' m');
const g = B2.ops.find(o => o.op_type === 'GEOM_GRID_MOVE');
ok('C3 the copy\'s grid op names no grid line and carries only the copy\'s own command', g && g.params.gridId === null && g.params.delta === 0 && g.params.commands.length === 1 && g.params.commands[0].featureId === B2.copyOf[6],
  JSON.stringify(g && g.params));
const B4 = Clipboard.build([11], S, OPS, FIRST, cas, {});
ok('C4 an op type the copy does not know refuses the copy, naming it', B4.ok === false && /GEOM_SHELL/.test(String(B4.why)) && !B4.ops.length, 'why="' + B4.why + '"');
const B5 = Clipboard.build([13], S, OPS, FIRST, cas, {}), p5 = B5.ops[0] && B5.ops[0].params;
ok('C5 a copy carries no bayCopy / spanSplit of its source', B5.ok && p5 && !p5.bayCopy && !p5.spanSplit && p5.copyOf === 13 && p5.placement.x === 33, JSON.stringify(p5).slice(0, 200));
const B6 = Clipboard.build([1], S, OPS, FIRST, null, {}), c6 = B6.ops.find(o => o.op_type === 'GEOM_CUT');
ok('C6 without the cascade a copied wall comes alone: its cut is copied, fillingFid null, no edge', B6.ok && B6.items.length === 1 && c6 && c6.params.slide.fillingFid === null && !B6.edges.length,
  'items ' + B6.items.length + ' cut fillingFid=' + (c6 && c6.params.slide.fillingFid) + ' edges=' + B6.edges.length);
console.log('§W-CLIPBOARD ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails); process.exit(fails || !judged ? 1 : 0);
