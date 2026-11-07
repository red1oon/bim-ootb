#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-BLOCK-SHIFT (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §13.1, §14.1). READ THE §-LOG after every run.
 * Real Open of the real Garage, the real commit path, numbers only. Each claim names the issue it proves or disproves:
 *   P   the classifier is wrong: hand rows through BayAdd.shift
 *   L   a block shift is not rigid: the bay widens to the goal, every other bay is unchanged
 *   E   elements do not follow the lines: moved and stayed against their boxes, a crossing element vertex by vertex against the plane
 *   K   the floors stay behind: §13 limit 1, every clean Garage shift left them, and the row said CLEAN
 *   R   the report is vacuous or wrong: span rows against an independent recount, the overlap row judged
 *   F   the §12 flaw: the same goal line by line refuses, the shift does not
 *   U   it is not one gesture: one Ctrl+Z restores every box and line, Ctrl+Y returns After, the chain verifies
 *   N   the shift hides a real conflict: a widening is clean, a narrowing into what stays is RED
 *   A   a move reshapes a 3-axis element: found building this, bonsai_library.js dropped rotX/rotY on any GEOM_MOVE
 * Falsifier: SHIFT_BREAK=1 (the elements travel a different distance from the lines) must turn this RED.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const BA = require('../bay_add.js'), SW = require('../str_walker.js');
const BREAK = process.env.SHIFT_BREAK === '1', EPS = 1e-3;
const L = (m) => console.log('§W-BLOCK-SHIFT ' + m);
const row = (r, id) => r.rows.filter(x => x.id === id)[0] || {};
const nrow = (r, id) => r.newRows.filter(x => x.id === id)[0] || {};
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? EPS : e);

function recountSpans(base0, mat, depth, moves) {   // the walker's own datums and the rule table, deliberately not GridSpanGate
  const lines = { x: base0.grid.xLines.slice(), y: base0.grid.yLines.slice() }, R = SW.SW_SPAN_RULES[mat], out = { RED: 0, ORANGE: 0, GREEN: 0 };
  moves.forEach(m => { lines[m.axis][m.index] += m.delta; });
  base0.girders.forEach(g => { const ax = g.axis === 'Xline@' ? 'y' : 'x', i = base0.grid[ax + 'Lines'].indexOf(g.fromDatum), j = base0.grid[ax + 'Lines'].indexOf(g.toDatum), s = Math.abs(lines[ax][j] - lines[ax][i]);
    if (s > R.maxBeamSpan) out.RED++; else if (depth < s / R.depthRatio - 1e-9) out.ORANGE++; else out.GREEN++; });
  return out;
}
async function openGarage(t) {
  await t.open('HospitalGarage', {});
  for (let i = 0; i < 240; i++) { if (await t.pg.evaluate(() => !!window.__saveGateBaseline && Object.keys(window.__saveGateBaseline).length > 0)) break; await t.sleep(500); }
  for (let i = 0; i < 60 && !t.slog.some(l => /§STRWALK-OL §GEO-SERVED HospitalGarage/.test(l)); i++) await t.sleep(500);
  await t.sleep(5000); await t.clickSel('#b-gridmove'); await t.sleep(600);
  await t.pg.evaluate((b) => { window.__editReportKeepBoxes = true; if (b) window.__blockShiftBreak = true; }, BREAK);
}
const boxes = (t) => t.pg.evaluate(() => window.__gateBoxes());
const sameBoxes = (a, b) => { const bad = []; Object.keys(a).forEach(k => { if (!b[k] || a[k].some((v, i) => !near(v, b[k][i]))) bad.push(+k); }); return bad; };

(async () => {
  let fails = 0;
  const run = async (name, body) => { const r = await runE2E(name, body, { noExit: true }); fails += r.fail; };
  await run('W-BLOCK-SHIFT', async (t) => {
    // ---- P pure, hand rows: line at 10, a 0.6 m column on it, so the band is 0.3 + 0.1 and the plane is at 9.6 ----
    const rec = (id, cls, lo, hi, extra) => Object.assign({ id, cls, lo, hi, params: { bbox: [-0.1, 0.1, -(hi - lo) / 2, (hi - lo) / 2, -1, 1], placement: { rot: 0 } } }, extra || {});
    const S = { axis: 'y', index: 1, lines: [0, 10, 20], delta: 2, theta: 0, follow: ['IfcWall', 'IfcColumn', 'IfcBuildingElementProxy'], edgeTol: 0.1 };
    const base = [rec(1, 'IfcColumn', 9.7, 10.3), rec(2, 'IfcWall', 12, 15), rec(3, 'IfcWall', 0, 9), rec(4, 'IfcWall', 5, 15), rec(5, 'IfcFurniture', 5, 15), rec(6, 'IfcDoor', 13, 14)];
    const cas = (fills) => ({ ridersFor: (m, g, f, e) => e.filter(x => m.indexOf(f[x.host_guid]) >= 0).map(x => f[x.filling_guid]), guidByFid: {}, fidByGuid: { H: 2, D: 6, HS: 4 }, fills });
    const p = BA.shift(base, S, cas([{ host_guid: 'H', filling_guid: 'D' }]), []);
    L('hand plan ' + JSON.stringify({ moved: p.moved, stretched: p.stretched, riders: p.riders, left: p.left, stayed: p.stayed, band: p.band, at: p.at }));
    t.assert('P1 the plane is the line minus the band, and the band is the column on the line + the engine tolerance', near(p.band, 0.4) && near(p.at, 9.6));
    t.assert('P2 wholly beyond moves; wholly before stays', p.moved.join() === '1,2' && p.stayed === 1);
    t.assert('P3 a crossing element gets one hinge at the plane, by exactly the move, and no scale', p.stretched.join() === '4' && p.commands.length === 1 && p.commands[0].featureId === 4 && near(p.commands[0].at, 9.6) && near(p.commands[0].dy, 2) && !p.ops.some(o => o.op_type === 'GEOM_SCALE'));
    t.assert('P4 a class that does not follow is named, never hinged', p.left.length === 1 && p.left[0].id === 5);
    t.assert('P5 a filling rides its host and is not classified itself', p.riders.join() === '6' && p.moved.indexOf(6) < 0);
    const q1 = BA.shift(base, S, cas([{ host_guid: 'HS', filling_guid: 'D' }]), []);
    t.assert('P6a a filling beyond the plane in a crossing host rides', q1.ok && q1.riders.join() === '6', q1.why);
    const q2 = BA.shift(base.slice(0, 5).concat([rec(6, 'IfcDoor', 9, 10)]), S, cas([{ host_guid: 'HS', filling_guid: 'D' }]), []);
    t.assert('P6b a filling straddling the plane: refused, with why', !q2.ok && /straddles/.test(q2.why), q2.why);
    const q3 = BA.shift(base.slice(0, 5).concat([rec(6, 'IfcDoor', 6, 7)]), S, cas([{ host_guid: 'HS', filling_guid: 'D' }]), []);
    t.assert('P6c a filling before the plane stays', q3.ok && !q3.riders.length);
    const q4 = BA.shift(base, S, null, [{ op_type: 'GEOM_CUT', parameters: { parent: 4 } }]);
    t.assert('P7 a crossing element carrying a cut: refused, the worker folds those as solids', !q4.ok && /GEOM_CUT/.test(q4.why), q4.why);
    t.assert('P8 no such line: refused', !BA.shift(base, Object.assign({}, S, { index: 9 }), null, []).ok);
    const q5 = BA.shift(base, S, null, [{ op_type: 'GEOM_GRID_MOVE', parameters: { commands: [{ featureId: 2, action: 'HINGE' }] } }]), c5 = q5.commands.filter(c => c.featureId === 2)[0];
    t.assert('P9 an element already carrying a hinge stays in command order: at null, no GEOM_MOVE', !!c5 && c5.at === null && !q5.ops.some(o => o.params.parent === 2));
    const r3 = rec(8, 'IfcWall', 5, 15); r3.params.placement = { rotX: 0, rotY: 1.57, rotZRad: 0 }; const yw = rec(9, 'IfcWall', 5, 15); yw.params.placement = { rot: 45 };
    t.assert('P10 a 3-axis or oblique crossing element follows too: the rule has no local axis', BA.shift([r3, yw], S, null, []).stretched.length === 2);
    const th = -2 * Math.PI / 180, q6 = BA.shift([rec(10, 'IfcWall', 12, 15)], Object.assign({}, S, { theta: th }), null, []);
    t.assert('P11 on a rotated lattice the block travels along the lattice axis', near(q6.ops[0].params.dx, -Math.sin(th) * 2, 1e-9) && near(q6.ops[0].params.dy, Math.cos(th) * 2, 1e-9), JSON.stringify(q6.ops[0].params));

    await openGarage(t);
    const pg = t.pg, D = 1.51, LINE = 9;
    const info = await pg.evaluate(() => { const i = window.swbGateInfo(); return { theta: i.theta, depth: i.section.depth, base0: { grid: { xLines: i.base0.grid.xLines, yLines: i.base0.grid.yLines }, girders: i.base0.girders.map(g => ({ axis: g.axis, fromDatum: g.fromDatum, toDatum: g.toDatum })) } }; });
    const ys0 = await pg.evaluate(() => window.Bonsai.grid.ys.slice()), n0 = await pg.evaluate(() => window.Bonsai.oplog._geomOps().length);
    await pg.evaluate(() => { const v = {}; window.Bonsai.group().children.forEach(m => { if (m.isMesh && m.userData.featureId != null) v[m.userData.featureId] = m.geometry.attributes.position.array.slice(); }); window.__v0 = v; });   // this witness's own copy, every vertex before the edit
    const lazy0 = await pg.evaluate(() => ({ loaded: !!window.BayAdd, tag: !!document.querySelector('script[src^="bay_add.js"]') }));
    t.assert('Z1 §14.6 bay_add.js is not in the page until a shift is asked for', !lazy0.loaded && !lazy0.tag, JSON.stringify(lazy0));
    const rep = await pg.evaluate(async (d) => { await window.__gridShift('gy9', d); return window.__lastEditReport; }, D);
    t.assert('Z2 the first shift loads it, and says so', t.slog.some(l => /§BLOCK-SHIFT bay_add\.js loaded on first use/.test(l)));
    t.assert('L0 a report exists and names a block shift', !!rep && rep.change.kind === 'block-shift' && rep.change.through === 'gy28' && rep.change.lines === 20, JSON.stringify(rep && rep.change));
    L('report ' + JSON.stringify(rep.change) + ' rows ' + JSON.stringify(rep.rows.map(r => [r.id, r.state, r.before, r.after])));
    L('line ' + t.slog.filter(l => /§BLOCK-SHIFT/.test(l)).pop());

    // ---- L the lines ----
    const ys1 = await pg.evaluate(() => window.Bonsai.grid.ys.slice());
    t.assert('L1 the widened bay reaches its goal', near(ys1[LINE] - ys1[LINE - 1], ys0[LINE] - ys0[LINE - 1] + D, 1e-9), (ys1[LINE] - ys1[LINE - 1]).toFixed(4));
    t.assert('L2 every other bay on the axis keeps its width', ys1.every((v, i) => i === 0 || i === LINE || near(v - ys1[i - 1], ys0[i] - ys0[i - 1], 1e-9)));
    t.assert('L3 lines before stay, lines from it on all moved by exactly the move', ys1.every((v, i) => near(v, ys0[i] + (i >= LINE ? D : 0), 1e-9)));

    // ---- E the elements ----
    const ops = await pg.evaluate((n) => window.Bonsai.oplog._geomOps().slice(n).map(o => ({ t: o.op_type, p: o.parameters })), n0);
    const hinges = ops.filter(o => o.t === 'GEOM_GRID_MOVE').reduce((a, o) => a.concat(o.p.commands || []), []), crossing = hinges.map(c => c.featureId), moved = ops.filter(o => o.t === 'GEOM_MOVE').map(o => o.p.parent);
    const bx = await pg.evaluate(() => window.__editReportBoxes);
    const expected = [-Math.sin(info.theta) * D, Math.cos(info.theta) * D];
    const badMove = moved.filter(id => { const a = bx.before[id], b = bx.after[id]; if (!a || !b) return false; return !(near(b[0] - a[0], expected[0]) && near(b[1] - a[1], expected[0]) && near(b[2] - a[2], expected[1]) && near(b[3] - a[3], expected[1]) && near(b[4] - a[4], 0) && near(b[5] - a[5], 0)); });
    t.assert('E0 not vacuous: over 100 moved elements were looked at', moved.length > 100, 'moved=' + moved.length);
    t.assert('E1 every moved element keeps its size and travels the block\'s vector', badMove.length === 0, 'bad=' + badMove.slice(0, 5).join(','));
    const touched = new Set(moved.concat(crossing));
    const stay = Object.keys(bx.before).map(Number).filter(id => !touched.has(id));
    t.assert('E2 every other element is unchanged', sameBoxes(stay.reduce((o, k) => { o[k] = bx.before[k]; return o; }, {}), bx.after).length === 0, 'unchanged=' + stay.length);
    const vx = await pg.evaluate((hs) => { const out = { before: 0, beyond: 0, bad: 0, elementsBoth: 0, first: null }; hs.forEach(c => { const m = window.Bonsai.group().children.find(q => q.isMesh && q.userData.featureId === c.featureId), a = window.__v0[c.featureId], b = m.geometry.attributes.position.array; let nb = 0, ny = 0; for (let i = 0; i < a.length; i += 3) { const go = c.n[0] * a[i] + c.n[1] * a[i + 1] >= c.at, ex = a[i] + (go ? c.dx : 0), ey = a[i + 1] + (go ? c.dy : 0); if (go) { out.beyond++; ny++; } else { out.before++; nb++; } if (Math.abs(b[i] - ex) > 1e-3 || Math.abs(b[i + 1] - ey) > 1e-3 || Math.abs(b[i + 2] - a[i + 2]) > 1e-3) { out.bad++; if (!out.first) out.first = [c.featureId, i, b[i] - ex, b[i + 1] - ey]; } } if (nb && ny) out.elementsBoth++; }); return out; }, hinges);
    L('crossing vertices ' + JSON.stringify(vx));
    t.assert('E3a every vertex of a crossing element: before the plane unchanged, beyond it moved by exactly the vector', vx.bad === 0, JSON.stringify(vx.first));
    t.assert('E3b not vacuous: crossing elements really have vertices on both sides', vx.elementsBoth >= 12 && vx.before > 0 && vx.beyond > 0, JSON.stringify(vx));
    t.assert('E4 what the report says happened = the ops', rep.change.moved + rep.change.riders === moved.length && rep.change.stretched === crossing.length);
    const proxy = await pg.evaluate((ids) => { const c = {}; window.Bonsai.oplog._geomOps().forEach(o => { if (o.op_type === 'GEOM_INSERT' && ids.indexOf(o.id) >= 0) c[o.parameters.ifc_class] = (c[o.parameters.ifc_class] || 0) + 1; }); return c; }, crossing);
    L('crossing by class ' + JSON.stringify(proxy));
    t.assert('K1 §13 limit 1 is gone: nothing crossing this line is left behind', rep.change.left.count === 0, JSON.stringify(rep.change.left));
    t.assert('K2 the floors really are among what followed, and the report says so', proxy.IfcBuildingElementProxy === 12 && rep.change.stretched_by_class.IfcBuildingElementProxy === 12, JSON.stringify(rep.change.stretched_by_class));

    // ---- R the report ----
    const rb = recountSpans(info.base0, 'RC', info.depth, []), ra = recountSpans(info.base0, 'RC', info.depth, ys0.map((_, i) => i).filter(i => i >= LINE).map(i => ({ axis: 'y', index: i, delta: D })));
    t.assert('R1 span rows = an independent recount, both sides', row(rep, 'span_red').before === rb.RED && row(rep, 'span_red').after === ra.RED && row(rep, 'span_orange').before === rb.ORANGE && row(rep, 'span_orange').after === ra.ORANGE, JSON.stringify([rb, ra]));
    t.assert('R2 not vacuous: the shift moved the count', ra.ORANGE !== rb.ORANGE, rb.ORANGE + '->' + ra.ORANGE);
    t.assert('R3 the overlap row judged the moved elements', row(rep, 'overlap').state === 'JUDGED' && parseInt(row(rep, 'overlap').scope, 10) > 100, row(rep, 'overlap').scope);

    // ---- U one gesture ----
    await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await t.sleep(1500);
    const un = await boxes(t), ysU = await pg.evaluate(() => window.Bonsai.grid.ys.slice());
    t.assert('U1 one Ctrl+Z restores every box', sameBoxes(bx.before, un).length === 0, 'different=' + sameBoxes(bx.before, un).length);
    t.assert('U2 one Ctrl+Z restores every line', ysU.every((v, i) => near(v, ys0[i], 1e-9)));
    await pg.keyboard.down('Control'); await pg.keyboard.press('y'); await pg.keyboard.up('Control'); await t.sleep(1500);
    const re = await boxes(t);
    t.assert('U3 one Ctrl+Y returns After', sameBoxes(bx.after, re).length === 0, 'different=' + sameBoxes(bx.after, re).length);
    t.assert('U4 the chain verifies', await t.verifyChain());
  });

  if (!BREAK) {
    await run('W-BLOCK-SHIFT-LINEWISE', async (t) => {
      await openGarage(t);
      const res = await t.pg.evaluate(async () => { const out = []; for (let k = 9; k <= 14; k++) { const b = window.__lastEditReport; await window.__gridStretch('gy' + k, 1.51); out.push({ line: 'gy' + k, report: window.__lastEditReport !== b, stat: (document.getElementById('stat').textContent || '').slice(0, 70) }); } return out; });
      L('line by line ' + JSON.stringify(res.map(r => [r.line, r.report ? 'report' : 'refused'])));
      t.assert('F1 the §12 flaw is real: line by line, the same shift is refused part way', res.some(r => !r.report), res.filter(r => !r.report).map(r => r.line).join(','));
    });
    await run('W-BLOCK-SHIFT-WIDEN', async (t) => {
      await openGarage(t);
      const r = await t.pg.evaluate(async () => { window.__gateLatticeBoxes = true; await window.__gridShift('gy9', 1.51); return window.__lastEditReport; });
      L('widen ' + JSON.stringify(r.newRows.filter(n => n.count)));
      t.assert('F2 the shift the line-by-line path refused is judged, on lattice boxes, with nothing new red', nrow(r, 'clash').count === 0 && nrow(r, 'abuts-clash').count === 0 && row(r, 'span_red').delta === 0, row(r, 'overlap').label);
      t.assert('F3 a shift has no sideways error, so it is judged at the plain 20 mm', /over 20 mm/.test(row(r, 'overlap').label), row(r, 'overlap').label);
      t.assert('F4 a rigid widening changes no overlap count', row(r, 'overlap').before === row(r, 'overlap').after, row(r, 'overlap').before + '->' + row(r, 'overlap').after);
    });
    await run('W-BLOCK-SHIFT-NARROW', async (t) => {
      await openGarage(t);
      const r = await t.pg.evaluate(async () => { window.__gateLatticeBoxes = true; await window.__gridShift('gy11', -1.49); return window.__lastEditReport; });
      L('narrow ' + JSON.stringify(r.newRows.filter(n => n.count)));
      t.assert('N1 a narrowing into what stays is RED: a tolerance cannot hide it', nrow(r, 'clash').count > 0, 'clash=' + nrow(r, 'clash').count);
    });
    await run('W-BLOCK-SHIFT-3AXIS', async (t) => {
      await t.open('SampleHouse', {}); await t.sleep(1500);
      const r = await t.pg.evaluate(async () => { const O = window.Bonsai.oplog, B = () => window.__gateBoxes(), ins = O._geomOps().filter(o => o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters.placement && (o.parameters.placement.rotX || o.parameters.placement.rotY)), out = []; for (const o of ins) { const a = B()[o.id]; await O.commit({ op_type: 'GEOM_MOVE', parameters: { parent: o.id, dx: 0, dy: 1, dz: 0 } }, {}); const b = B()[o.id]; out.push({ id: o.id, d: b.map((v, i) => +(v - a[i]).toFixed(4)) }); } return out; });
      L('3-axis ' + JSON.stringify(r));
      t.assert('A1 not vacuous: this building has 3-axis elements', r.length > 0, 'n=' + r.length);
      t.assert('A2 a plain move of a 3-axis element changes its box by exactly the move', r.every(x => near(x.d[0], 0) && near(x.d[1], 0) && near(x.d[2], 1) && near(x.d[3], 1) && near(x.d[4], 0) && near(x.d[5], 0)));
    });
  }
  console.log('§WITNESS_BLOCK_SHIFT fail=' + fails + ' verdict=' + (fails ? 'FAIL' : 'PASS'));
  process.exit(fails ? 1 : 0);
})();
