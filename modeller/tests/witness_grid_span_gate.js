#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GRID-SPAN-GATE (MODELLER_MASTER §GRID-SPAN-GATE SPEC 2026-10-02, row 38)
 * SCOPE: real Open of HospitalGarage -> Move Grid -> real mouse drag of gridline y8 -> bays coloured by the EXISTING span
 * rule (str_walker.js SW_SPAN_RULES) -> RED release opens "Add one more?" -> one gesture, one undo. READ THE §-LOG after every run.
 * Issues proven: G1 grid not column-derived on Open (today) · G2 material read from the building's names · G3 colour transitions at
 * the table spans · G4 hover texts · G5 add-one-more copies real columns · G6 halved spans return GREEN · G7 one Ctrl+Z / Ctrl+Y.
 * Falsifier: GSG_BREAK=1 (rule lookup broken) must turn this RED. A claim that judged nothing prints INCONCLUSIVE.
 */
'use strict';
const path = require('path');
const { runE2E } = require('./e2e_harness');
const SW = require('../str_walker.js'), GS = require('../grid_span_gate.js');
const BREAK = process.env.GSG_BREAK === '1';
const SHOTS = process.env.GSG_SHOTS || '';   // dir for guide shots (clip, dpr 2)

runE2E('W-GRID-SPAN-GATE', async (t) => {
  const pg = t.pg, L = (m) => console.log('§GRID-SPAN ' + m);
  if (BREAK) await pg.evaluate(() => { window.__gsgBreakRule = true; });
  const shot = async (name, clip) => { if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, name + '.png'), clip }); };
  // W0 pure: boundaries number vs number (table x measured depth)
  for (const mat of ['RC', 'STEEL']) {
    const R = SW.SW_SPAN_RULES[mat], d = 0.535, T1 = d * R.depthRatio, T2 = R.maxBeamSpan, e = 1e-6;
    const s = (x) => GS.check(x, mat, d).signal;
    t.assert('W0 ' + mat + ' pure boundaries (GREEN<=' + T1.toFixed(3) + ' < ORANGE <= ' + T2 + ' < RED)',
      (T1 >= T2 ? true : s(T1 - e) === 'GREEN' && s(T1 + e) === 'ORANGE') && s(T2 - e) !== 'RED' && s(T2 + e) === 'RED', 'T1=' + T1 + ' T2=' + T2);
  }
  await t.open('HospitalGarage', {});
  for (let i = 0; i < 60 && !t.slog.some(l => /§STRWALK-OL §GEO-SERVED HospitalGarage/.test(l)); i++) await t.sleep(500);
  await t.sleep(5000);
  await shot('span-open', { x: 320, y: 150, width: 640, height: 400 });
  const g0 = await pg.evaluate(() => { const i = window.swbGateInfo(); return { sys: i && i.system, def: window.Bonsai.grid._isDefault, xs: window.Bonsai.grid.xs.length, nx: i && i.base0.grid.xLines.length, ny: i && i.base0.grid.yLines.length }; });
  t.assert('G1a before arming: walker column-framed, grid is still the default (not column-derived) — the measured gap', g0.sys === 'column-framed' && g0.def === true && g0.xs === 4, JSON.stringify(g0));
  await t.clickSel('#b-gridmove'); await t.sleep(600);
  const g1 = await pg.evaluate(() => { const G = window.Bonsai.grid, i = window.swbGateInfo(), th = i.theta, c0 = i.centroid; let md = 0;
    G.xs.forEach((x, k) => { md = Math.max(md, Math.abs(window.swToFrame(x, c0.y, th)[0] - i.base0.grid.xLines[k])); });
    G.ys.forEach((y, k) => { md = Math.max(md, Math.abs(window.swToFrame(c0.x, y, th)[1] - i.base0.grid.yLines[k])); });
    return { cd: G._columnDerived, nx: G.xs.length, ny: G.ys.length, md, z: G.z }; });
  t.assert('G1 Move Grid lays the building\'s own lattice as the grid (17x29, frame-exact)', g1.cd === true && g1.nx === g0.nx && g1.ny === g0.ny && g1.md < 1e-9, JSON.stringify(g1));
  // ---- G2 material (read from the building's own names) ----
  const mat = t.slog.find(l => /§GRID-SPAN material=/.test(l));
  // material is read at grab time; assert after the grab below
  // ---- camera: plan view over the grid plane ----
  const J = 8;
  await t.sleep(300);
  const setup = await pg.evaluate((J) => { const G = window.Bonsai.grid; const cx = (G.xs[0] + G.xs[G.xs.length - 1]) / 2, cy = (G.ys[0] + G.ys[G.ys.length - 1]) / 2;
    window.__e2e.overhead(cx, cy, G.z + 215); return { z: G.z, xm: (G.xs[6] + G.xs[7]) / 2, y0: G.ys[J], gap: [G.ys[J] - G.ys[J - 1], G.ys[J + 1] - G.ys[J]] }; }, J);
  await t.sleep(500);
  const P = (x, y) => pg.evaluate((a, b, c) => window.__e2e.proj(a, b, c), x, y, setup.z);
  const info = await pg.evaluate(() => { const i = window.swbGateInfo(); return { depth: i.section.depth }; });
  const R = SW.SW_SPAN_RULES.RC, T1 = info.depth * R.depthRatio, T2 = R.maxBeamSpan;
  L('setup line=gy' + J + ' bays(before)=' + setup.gap.map(x => x.toFixed(3)) + ' measuredBeamDepth=' + info.depth.toFixed(4) + ' T1(ORANGE>)=' + T1.toFixed(4) + ' T2(RED>)=' + T2);
  const down = await P(setup.xm, setup.y0);
  await pg.mouse.move(down[0], down[1]); await t.sleep(80); await pg.mouse.down(); await t.sleep(80);
  const cl = (q, w, h) => ({ x: Math.max(0, q[0] - w / 2), y: Math.max(0, q[1] - h / 2), width: w, height: h });
  await shot('span-grab', cl(down, 420, 260));
  const sess = await pg.evaluate(() => window.Bonsai.gridspan.session);
  const matLine = t.slog.find(l => /§GRID-SPAN material=/.test(l)) || '';
  t.assert('G2 material read from the building\'s own STR names = RC (not guessed)', !!sess && sess.material === 'RC' && /beams rc=166 steel=29 unnamed=0 of 195/.test(matLine) && /mixed=true/.test(matLine), matLine.slice(0, 200));
  t.assert('G2b the dragged line is gy' + J + ' (real grab)', !!sess && sess.gridId === 'gy' + J, JSON.stringify(sess));
  // ---- drag in +y by 0.25 m of world target per step; record every frame ----
  const frames = []; let reachedRed = false, shotO = false;
  for (let d = 0.1; d <= 9 && !reachedRed; d += 0.1) {
    const q = await P(setup.xm, setup.y0 + d); await pg.mouse.move(q[0], q[1], { steps: 2 }); await t.sleep(60);
    const f = await pg.evaluate(() => { const B = window.Bonsai.gridspan, w = B.last && B.last.worst; return { delta: window.__dg().delta, worst: w ? { signal: w.signal, span: w.span, span0: w.span0, n: w.n } : null,
      all: B.last ? B.last.bays.map(b => ({ a: b.a, b: b.b, signal: b.signal, span: b.span, n: b.n })) : [], hover: B.hover, tip: document.getElementById('gsg-tip') ? { disp: document.getElementById('gsg-tip').style.display, text: (document.getElementById('gsg-text') || {}).textContent } : null }; });
    frames.push(f);
    if (f.worst && f.worst.signal === 'ORANGE' && !shotO) { shotO = true; const bx = q; await shot('span-orange', { x: Math.max(0, bx[0] - 330), y: Math.max(0, bx[1] - 190), width: 660, height: 380 }); }
    if (f.worst && f.worst.signal === 'RED') { reachedRed = true; await shot('span-red', { x: Math.max(0, q[0] - 330), y: Math.max(0, q[1] - 190), width: 660, height: 380 }); }
  }
  global.__frames = frames;
  // G3: every frame's signal == the independent table rule on the frame's own span; monotone GREEN->ORANGE->RED; transitions bracket T1/T2
  const exp = (sp) => sp > T2 ? 'RED' : (info.depth < sp / R.depthRatio - 1e-9 ? 'ORANGE' : 'GREEN');
  const bad = frames.filter(f => !f.worst || f.worst.signal !== exp(f.worst.span) || Math.abs(f.worst.span - (f.worst.span0 + f.delta)) > 1e-9 || Math.abs(f.worst.span0 - 5.4864) > 1e-3);
  t.assert('G3a every frame: signal == table rule(span) and span == 5.486 + drag delta (' + frames.length + ' frames)', frames.length > 10 && bad.length === 0, bad.length ? JSON.stringify(bad[0]) : 'ok');
  const lastG = frames.filter(f => f.worst && f.worst.signal === 'GREEN').pop(), firstO = frames.find(f => f.worst && f.worst.signal === 'ORANGE');
  const lastO = frames.filter(f => f.worst && f.worst.signal === 'ORANGE').pop(), firstR = frames.find(f => f.worst && f.worst.signal === 'RED');
  const seq = frames.map(f => f.worst && f.worst.signal).join('');
  t.assert('G3b GREEN->ORANGE at ' + T1.toFixed(3) + ' m: last GREEN span ' + (lastG && lastG.worst.span.toFixed(3)) + ' <= T1 < first ORANGE span ' + (firstO && firstO.worst.span.toFixed(3)),
    !!lastG && !!firstO && lastG.worst.span <= T1 && firstO.worst.span > T1, 'bracket ' + (lastG && firstO && (firstO.worst.span - lastG.worst.span).toFixed(3)) + ' m');
  t.assert('G3c ORANGE->RED at ' + T2 + ' m: last ORANGE span ' + (lastO && lastO.worst.span.toFixed(3)) + ' <= T2 < first RED span ' + (firstR && firstR.worst.span.toFixed(3)),
    !!lastO && !!firstR && lastO.worst.span <= T2 && firstR.worst.span > T2 && /^G+O+R+$/.test(seq.replace(/GREEN/g, 'G').replace(/ORANGE/g, 'O').replace(/RED/g, 'R')), 'order ok; bracket ' + (lastO && firstR && (firstR.worst.span - lastO.worst.span).toFixed(3)) + ' m');
  const fo = frames.find(f => f.worst && f.worst.signal === 'ORANGE' && f.hover), fr = frames.filter(f => f.worst && f.worst.signal === 'RED' && f.hover).pop();
  const reqD = fo && fo.worst.span / R.depthRatio;
  t.assert('G4a ORANGE hover text carries the required depth span/' + R.depthRatio + ' = ' + (reqD && reqD.toFixed(2)) + ' m + preliminary note',
    !!fo && fo.tip.disp === 'block' && fo.tip.text.indexOf(reqD.toFixed(2) + ' m') >= 0 && /structural engineer confirms/.test(fo.tip.text), fo && fo.tip.text);
  t.assert('G4b RED hover text carries the limit (12 m, RC) and "Add one more?" + preliminary note',
    !!fr && /Limit for this column span \(12 m, RC\)\. Add one more\?/.test(fr.tip.text) && /structural engineer confirms/.test(fr.tip.text), fr && fr.tip.text);
  global.__ctx = { setup, T1, T2, info, frames };
  // ---- release on RED: prompt, NO commit ----
  const ol0 = await t.oplog(); const nIns0 = await pg.evaluate(() => window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT').length);
  const lastPos = await pg.evaluate(() => 0);
  await pg.mouse.up(); await t.sleep(400);
  const pr = await pg.evaluate(() => ({ p: window.Bonsai.gridspan.prompt, add: !!document.getElementById('gsg-add'), cancel: !!document.getElementById('gsg-cancel') }));
  const ol1 = await t.oplog();
  t.assert('G5a release on RED opens the prompt and commits NOTHING (op-log unchanged ' + ol0.len + '->' + ol1.len + ')', !!pr.p && pr.p.open && pr.add && pr.cancel && ol1.len === ol0.len, JSON.stringify(pr.p && { bay: pr.p.bay, delta: pr.p.delta, clamp: pr.p.clamp }));
  // independent expectations from the walker's pristine base (not from the gate)
  const exp5 = await pg.evaluate((J) => { const i = window.swbGateInfo(), g = i.base0.grid, yv = [g.yLines[J - 1], g.yLines[J]];
    const gs = i.base0.girders.filter(x => x.axis === 'Xline@' && x.fromDatum === yv[0] && x.toDatum === yv[1]);
    return { n: gs.length, from: gs.map(x => [x.from[0], x.from[1]]), srcs: gs.map(x => i.base0.walked.find(w => w.x === x.from[0] && w.y === x.from[1]).srcGuid) }; }, J);
  const bayBefore = pr.p ? pr.p.bay.span : null;
  const grid0 = await pg.evaluate(() => window.Bonsai.grid.ys.length);
  const addBox = await pg.evaluate(() => { const r = document.getElementById('gsg-add').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await shot('span-prompt', { x: Math.max(0, addBox[0] - 330), y: Math.max(0, addBox[1] - 190), width: 660, height: 380 });
  await pg.mouse.move(addBox[0], addBox[1]); await t.sleep(100); await pg.mouse.click(addBox[0], addBox[1]); await t.sleep(2500);
  // wait for the gesture to FINISH (live is slower): grid line folded in, gesture log printed, all 5 meshes folded
  for (let i = 0; i < 90; i++) { const st = await pg.evaluate(() => ({ ys: window.Bonsai.grid.ys.length, m: window.Bonsai.group().children.filter(o => o.isMesh && o.userData.featureId != null).length })); if (st.ys === grid0 + 1 && t.slog.some(l => /§GESTURE gid=.*§GRID-SPAN extraOps=/.test(l))) break; await t.sleep(500); }
  await t.sleep(1500);
  const ol2 = await t.oplog();
  const ops2 = await pg.evaluate(() => window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT' && o.parameters.spanSplit).map(o => ({ id: o.id, h: o.parameters.realGeomHash, src: o.parameters.spanSplit.srcGuid, p: o.parameters.placement, bbox: o.parameters.bbox })));
  const gl = t.slog.filter(l => /§GESTURE gid=.*§GRID-SPAN extraOps=/.test(l)).pop() || '';
  t.assert('G5b "Add one more" lands ' + exp5.n + ' columns (== the girders / lines crossed in the bay) in ONE gesture', ops2.length === exp5.n && exp5.n > 0 && /extraOps=/.test(gl), 'added=' + ops2.length + ' expected=' + exp5.n + ' log=' + gl.slice(0, 160));
  // type hash == the measured column's own hash (direct SQL on the building DB, independent of the gate)
  const hashes = await pg.evaluate((srcs) => { const db = new window.SQL.Database(new Uint8Array(window.__dwBuf)); const o = srcs.map(g => { const r = db.exec("SELECT geometry_hash FROM element_instances WHERE guid='" + g + "'"); return r.length ? r[0].values[0][0] : null; }); db.close(); return o; }, exp5.srcs);
  const hOk = ops2.length === hashes.length && ops2.every((o) => hashes.includes(o.h) && o.h) && ops2.every((o) => hashes[exp5.srcs.indexOf(o.src)] === o.h);
  t.assert('G5c every added column carries the SAME geometry hash as the measured column it copies (' + hashes.filter((h, i, a) => a.indexOf(h) === i).join(',') + ')', hOk, JSON.stringify(ops2.map(o => o.h)));
  const tri = await pg.evaluate((ids) => { const g = window.Bonsai.group(); return ids.map(id => { const m = g.children.find(o => o.isMesh && o.userData.featureId === id); if (!m) return null; const ix = m.geometry.index; return ix ? ix.count / 3 : m.geometry.attributes.position.count / 3; }); }, ops2.map(o => o.id));
  const realTri = await pg.evaluate((h) => { const db = new window.SQL.Database(new Uint8Array(window.__dwGeoBuf)); const r = window.RealGeometry.resolveHashes(db, [h]); db.close(); return r[h] ? r[h].faces.length / 3 : null; }, ops2[0] && ops2[0].h);
  t.assert('G5d added columns are the building\'s OWN resolved mesh for that hash (' + realTri + ' tris from the geo DB; a plain extruded column is legitimately 12 — the proof is hash+tri equality, not a count)', realTri > 0 && tri.length === exp5.n && tri.every(x => x === realTri) && ops2.every(o => !!o.h), 'scene tris=' + JSON.stringify(tri) + ' real=' + realTri);
  const mid = await pg.evaluate((J) => { const G = window.Bonsai.grid; return [(G.xs[6] + G.xs[7]) / 2, G.ys[J], G.z]; }, J);
  const midPx = await pg.evaluate((a) => window.__e2e.proj(a[0], a[1], a[2]), mid);
  await shot('span-added', cl(midPx, 420, 260));
  // G6: spans halve, colour returns GREEN, grid has the new line
  const after = await pg.evaluate((J) => { const O = window.Bonsai.oplog, GSv = window.GridSpanGate, i = window.swbGateInfo(), st = GSv.fold(i, O._geomOps(), O.cursor);
    const sp = st.pieces.filter(p => /#[12]$/.test(p.guid)).map(p => ({ g: p.guid, span: GSv.spanOf(st, p) })); return { sp, ys: window.Bonsai.grid.ys.length, lines: st.lines.y.length }; }, J);
  const halves = after.sp.every(x => Math.abs(x.span - bayBefore / 2) < 1e-9) && after.sp.length === 2 * exp5.n;
  const col = after.sp.map(x => GS.check(x.span, 'RC', info.depth).signal);
  t.assert('G6 bay span ' + (bayBefore && bayBefore.toFixed(3)) + ' halves to ' + (bayBefore && (bayBefore / 2).toFixed(3)) + ' on all ' + after.sp.length + ' pieces; colour returns GREEN; grid ' + grid0 + '->' + after.ys + ' lines',
    halves && col.every(c => c === 'GREEN') && after.ys === grid0 + 1 && after.lines === grid0 + 1, JSON.stringify(after.sp.slice(0, 2)) + ' ' + col.join(','));
  // G7: one Ctrl+Z / Ctrl+Y
  const nIns2 = await pg.evaluate(() => window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT').length);
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); for (let i = 0; i < 90; i++) { const a = await pg.evaluate(() => { const O = window.Bonsai.oplog; return O._geomOps().slice(0, O.cursor).filter(o => o.op_type === 'GEOM_INSERT' && o.parameters.spanSplit).length; }); if (a === 0) break; await t.sleep(500); }
  await t.sleep(1000);
  const undo = await pg.evaluate(() => { const O = window.Bonsai.oplog, i = window.swbGateInfo(), st = window.GridSpanGate.fold(i, O._geomOps(), O.cursor);
    const act = O._geomOps().slice(0, O.cursor).filter(o => o.op_type === 'GEOM_INSERT' && o.parameters.spanSplit).length;
    return { act, ys: window.Bonsai.grid.ys.length, split: st.pieces.filter(p => /#[12]$/.test(p.guid)).length, y8: window.Bonsai.grid.ys[8], y7: window.Bonsai.grid.ys[7] }; });
  await shot('span-undone', cl(midPx, 420, 260));
  t.assert('G7a ONE Ctrl+Z removes the added columns, restores the grid line count and the bay spans', undo.act === 0 && undo.ys === grid0 && undo.split === 0 && Math.abs((undo.y8 - undo.y7) - setup.gap[0]) < 1e-6, JSON.stringify(undo));
  await pg.keyboard.down('Control'); await pg.keyboard.press('y'); await pg.keyboard.up('Control');
  for (let i = 0; i < 90; i++) { const a = await pg.evaluate(() => { const O = window.Bonsai.oplog; return O._geomOps().slice(0, O.cursor).filter(o => o.op_type === 'GEOM_INSERT' && o.parameters.spanSplit).length; }); if (a === exp5.n) break; await t.sleep(500); }
  await t.sleep(1000);
  const redo = await pg.evaluate(() => { const O = window.Bonsai.oplog; return { act: O._geomOps().slice(0, O.cursor).filter(o => o.op_type === 'GEOM_INSERT' && o.parameters.spanSplit).length, ys: window.Bonsai.grid.ys.length }; });
  t.assert('G7b ONE Ctrl+Y re-adds them (' + exp5.n + ' columns, grid ' + grid0 + '->' + (grid0 + 1) + ')', redo.act === exp5.n && redo.ys === grid0 + 1, JSON.stringify(redo));
  t.assert('G7c chain verifies', (await t.verifyChain()) === true);
  if (!t.slog.some(l => /§GRID-SPAN/.test(l))) console.log('INCONCLUSIVE: no §GRID-SPAN line');
}, { width: 1280, height: 860, dpr: 2 });
