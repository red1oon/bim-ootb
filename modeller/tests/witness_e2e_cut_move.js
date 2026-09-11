#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-CUT-MOVE: real-user, maths-asserted E2E of GEOM_CUT_MOVE — a carved void follows its
 * opening (prompts/SPEC_GEOM_CUT_MOVE.md §5; parents SPEC_DAGEVU_SLIDE.md §3 S5, SPEC_DAGEVU_ENGINE.md §3 anchor).
 * Read the log after every run.
 *
 * FIXTURE — a sketched rectangular wall (GEOM_EXTRUDE_POLY [0,4]×[0,0.2]×3, the tool's primary use case), a REAL bCut
 * (the toolbar's own #b-cut on the real-clicked wall — its 40%-centred through-void is x∈[1.2,2.8] z∈[0.9,2.1]), a
 * sketched door inside that hole (x∈[1.5,2.5]) and a rel_fills_host row injected in the exact shape the §ARC-1/CrossEdges
 * pipeline produces (witness_e2e_opening_slide's pattern). The constraint/fold/commit MATH is production code.
 * The hole is MEASURED off the wall mesh's vertices: a through-void's edge loops are the only vertices strictly between
 * the wall's top (z=3) and bottom (z=0).
 *
 *   M1 GRAB        — the door grabs into a SLIDE session that CARRIES the cut (the old S6 refusal is gone for a movable void)
 *   M2 COMMIT      — a real +0.8 m mouse drag commits ONE gesture: GEOM_MOVE(door) + GEOM_CUT_MOVE{cutId, dx, 0, 0}
 *   M3 HOLE-FOLLOWS — the rendered hole moved by the SAME dx as the door (vertex-measured); width unchanged
 *   M4 UNDO        — ONE real Ctrl+Z (one gesture) deactivates both rows and restores door AND hole
 *   M5 ANCHOR      — Move-Grid: drag gridline B (x=4) +1 with the door HELD (anchor default) ⇒ GEOM_GRID_MOVE +
 *                    GEOM_CUT_MOVE (the inverse shift) + GEOM_CUT_RESIZE{fx≈1/f} (SPEC_GEOM_CUT_RESIZE.md §4 — the
 *                    width-hold that fixes step 1's residual); door centre unchanged, hole centre AND WIDTH unchanged
 *                    (≤1e-3, 1.6 m), the wall is 5 m; §V7 label says "1 hole held" with no "(Δw …)" suffix; verifyChain
 *   M6 UNDO        — ONE real Ctrl+Z restores wall, door and hole (all three gesture rows undo together)
 */
'use strict';
const { runE2E } = require('./e2e_harness');

const centreOf = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
  return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
}, fid);
// the through-void's x-extent on the wall mesh: vertices strictly between the wall's z-faces
const holeOf = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox;
  const p = m.geometry.getAttribute('position').array; let xmin = Infinity, xmax = -Infinity, n = 0;
  for (let i = 0; i < p.length; i += 3) { const z = p[i + 2]; if (z > bb.min.z + 1e-6 && z < bb.max.z - 1e-6) { xmin = Math.min(xmin, p[i]); xmax = Math.max(xmax, p[i]); n++; } }
  return { xmin, xmax, c: (xmin + xmax) / 2, w: xmax - xmin, n, wall: [bb.min.x, bb.max.x] };
}, fid);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
// the REAL undo path (modeller.html keydown → doUndo): ONE gesture = ONE Ctrl+Z — unlike the history slider (a scrub:
// a prefix re-fold that leaves every row ACTIVE), this deactivates the gesture's rows so the NEXT commit builds on the
// reverted log — exactly what M5 needs after M2.
const ctrlZ = async (t) => { await t.pg.keyboard.down('Control'); await t.pg.keyboard.press('z'); await t.pg.keyboard.up('Control'); await t.sleep(1200); };

runE2E('W-E2E-CUT-MOVE', async (t) => {
  await t.open('Duplex'); await t.shot('01-open');
  await t.clickSel('#b-clear'); await t.sleep(400);
  const wallId = await t.pg.evaluate(async () => {
    window.Bonsai.grid.define({ xs: [0, 4, 8], ys: [0, 3], xlabels: ['A', 'B', 'C'], ylabels: ['1', '2'] });
    const O = window.Bonsai.oplog;
    const wall = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 });
    if (typeof syncHistory === 'function') syncHistory();
    return wall.id;
  });
  await t.clickSel('#b-fit'); await t.sleep(500);
  // the REAL bCut: real click selects the wall, the toolbar's own Cut derives the void from the wall's bbox
  await t.clickOn(wallId); await t.sleep(200); await t.clickSel('#b-cut'); await t.sleep(1500);
  const cut = await t.pg.evaluate(() => { const c = window.Bonsai.oplog._geomOps().find(o => o.op_type === 'GEOM_CUT'); return c ? { id: c.id, parent: c.parent, void: c.parameters.void } : null; });
  const ids = await t.pg.evaluate(async (host) => {
    const O = window.Bonsai.oplog;
    const door = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[1.5, 0.05], [2.5, 0.05], [2.5, 0.15], [1.5, 0.15]] }, depth: 2.1 } }, { color: 0xc8a06a });
    if (typeof syncHistory === 'function') syncHistory();
    window.__arcGuidByFid = { [host]: 'g-host', [door.id]: 'g-door' };
    window.__arcFidByGuid = { 'g-host': host, 'g-door': door.id };
    window.swXEdges = { fills: [{ host_guid: 'g-host', filling_guid: 'g-door', opening_guid: null, provenance: 'ifc:recovered' }], abuts: [] };
    window.__arcAnchorFids = null;
    return { host, door: door.id };
  }, wallId);
  await t.clickSel('#b-fit'); await t.sleep(500);
  const hole0 = await holeOf(t, ids.host), pre = await centreOf(t, ids.door);
  console.log('  §CUT-MOVE fixture wall=' + ids.host + ' cut=' + JSON.stringify(cut) + ' door=' + ids.door + ' hole0=' + JSON.stringify(hole0) + ' door0=' + JSON.stringify(pre));
  t.assert('FIXTURE (real bCut void x∈[1.2,2.8] on the sketched wall; measured hole matches; door inside it)',
    cut && cut.parent === ids.host && hole0 && near(hole0.xmin, 1.2, 1e-6) && near(hole0.xmax, 2.8, 1e-6) && pre && near(pre[0], 2.0, 1e-6), JSON.stringify({ cut, hole0 }));
  await t.shot('02-fixture');

  // ── M1 GRAB ───────────────────────────────────────────────────────────────────────────────────────────────────
  const grab = await t.pg.evaluate((fid) => {
    const ok = window.__armItemDrag(fid, {}); const s = window.Bonsai.itemdrag._session;
    return ok && s && s.slide ? { ok, axis: s.slide.axis, cuts: s.slide.cuts, tMin: s.slide.tMin, tMax: s.slide.tMax } : { ok, slide: false };
  }, ids.door);
  let logAt = 0;
  t.slog.slice(logAt).filter(l => /§SLIDE|§CUT-MOVE/.test(l)).forEach(l => console.log('    ' + l.slice(0, 300))); logAt = t.slog.length;
  t.assert('M1 GRAB (the door over a REAL carved void grabs into a SLIDE session carrying cuts=[{cutId,F:1}] — no S6 refusal)',
    grab.ok && grab.axis === 0 && Array.isArray(grab.cuts) && grab.cuts.length === 1 && grab.cuts[0].cutId === cut.id && grab.cuts[0].F === 1, JSON.stringify(grab));
  if (!grab.ok || grab.slide === false) return;

  // ── M2 COMMIT: real drag +0.8 m along the wall (with a 0.2 m off-axis drift) ─────────────────────────────────
  const T = 0.8;
  const p0 = await t.proj(pre[0], pre[1], pre[2]), p1 = await t.proj(pre[0] + T, pre[1] + 0.2, pre[2]);
  const before = await t.oplog();
  await t.pg.mouse.move(p0[0], p0[1]); await t.sleep(40); await t.pg.mouse.down(); await t.sleep(40);
  await t.pg.mouse.move((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, { steps: 5 }); await t.sleep(120);
  await t.pg.mouse.move(p1[0], p1[1], { steps: 5 }); await t.sleep(150);
  await t.shot('03-mid-slide');
  await t.pg.mouse.up(); await t.sleep(1200);
  const after = await t.oplog(); const chain = await t.verifyChain();
  const ops2 = await t.pg.evaluate((fromLen) => {
    const added = window.Bonsai.oplog._geomOps().slice(fromLen);
    const r = window.Bonsai.oplog.db.exec('SELECT id, gid FROM kernel_ops ORDER BY id DESC LIMIT 2');
    return { types: added.map(o => o.op_type), mv: (added.find(o => o.op_type === 'GEOM_MOVE') || {}).parameters, cm: (added.find(o => o.op_type === 'GEOM_CUT_MOVE') || {}).parameters,
      gids: r.length ? r[0].values.map(v => v[1]) : [] };
  }, before.len);
  t.slog.slice(logAt).filter(l => /§ITEMDRAG commit|§CUT-MOVE/.test(l)).forEach(l => console.log('    ' + l.slice(0, 320))); logAt = t.slog.length;
  console.log('  §CUT-MOVE M2 ' + JSON.stringify(ops2) + ' oplog ' + before.len + '→' + after.len + ' chain=' + chain);
  t.assert('M2 COMMIT (ONE gesture: GEOM_MOVE(door) + GEOM_CUT_MOVE{cutId, dx=door dx, dy=dz=0, induced fills-opening}, same gid; verifyChain true)',
    after.len === before.len + 2 && ops2.types.length === 2 && ops2.mv && ops2.cm && ops2.cm.cutId === cut.id && ops2.cm.parent === ids.host &&
    near(ops2.cm.dx, ops2.mv.dx, 1e-9) && ops2.cm.dy === 0 && ops2.cm.dz === 0 && near(ops2.mv.dx, T, 0.06) && ops2.gids[0] === ops2.gids[1] && /^gesture-grp-/.test(ops2.gids[0] || '') && chain === true,
    JSON.stringify(ops2));
  await t.shot('04-slid');

  // ── M3 HOLE-FOLLOWS ───────────────────────────────────────────────────────────────────────────────────────────
  const hole1 = await holeOf(t, ids.host), post = await centreOf(t, ids.door);
  console.log('  §CUT-MOVE M3 hole1=' + JSON.stringify(hole1) + ' door1=' + JSON.stringify(post));
  t.assert('M3 HOLE-FOLLOWS (the rendered hole moved by exactly the committed dx; width 1.6 unchanged; wall outline [0,4] unchanged; door and hole centres stay 0 apart as before)',
    hole1 && ops2.cm && near(hole1.xmin - hole0.xmin, ops2.cm.dx, 1e-6) && near(hole1.w, hole0.w, 1e-6) && near(hole1.wall[0], 0, 1e-6) && near(hole1.wall[1], 4, 1e-6) &&
    post && near(post[0] - pre[0], hole1.c - hole0.c, 1e-6), 'Δhole=' + (hole1 ? (hole1.xmin - hole0.xmin).toFixed(4) : '?') + ' Δdoor=' + (post ? (post[0] - pre[0]).toFixed(4) : '?'));

  // ── M4 UNDO ───────────────────────────────────────────────────────────────────────────────────────────────────
  await ctrlZ(t);
  const undone = await t.oplog(); const hole2 = await holeOf(t, ids.host); const back = await centreOf(t, ids.door);
  t.assert('M4 UNDO (ONE real Ctrl+Z deactivates BOTH gesture rows: active len restored, hole back at [1.2,2.8], door back at its pre-drag centre)',
    undone.len === before.len && hole2 && near(hole2.xmin, 1.2, 1e-6) && near(hole2.xmax, 2.8, 1e-6) && back && near(back[0], pre[0], 1e-6), JSON.stringify({ len: undone.len, want: before.len, hole2 }));
  await t.shot('05-undone');

  // ── M5 ANCHOR: Move-Grid, drag gridline B (x=4) +1 with the door held ────────────────────────────────────────
  const hole4 = await holeOf(t, ids.host), door4 = await centreOf(t, ids.door);   // the measured PRE-stretch state M5 must hold
  await t.clickSel('#b-gridmove'); await t.sleep(400);
  const DX = 1.0;
  const gd = await t.proj(4, 1.5, 0), gu = await t.proj(4 + DX, 1.5, 0);
  const before5 = await t.oplog();
  await t.pg.mouse.move(gd[0], gd[1]); await t.sleep(40); await t.pg.mouse.down(); await t.sleep(40);
  await t.pg.mouse.move((gd[0] + gu[0]) / 2, (gd[1] + gu[1]) / 2, { steps: 6 }); await t.sleep(60);
  await t.pg.mouse.move(gu[0], gu[1], { steps: 6 }); await t.sleep(200);
  const mid5 = await t.pg.evaluate(() => ({ dim: window.__dimLabel ? window.__dimLabel.text : null, stat: (document.getElementById('stat') || {}).textContent || '' }));
  await t.shot('06-mid-stretch');
  await t.pg.mouse.up(); await t.sleep(1500);
  const after5 = await t.oplog(); const chain5 = await t.verifyChain();
  const ops5 = await t.pg.evaluate((fromLen) => {
    const added = window.Bonsai.oplog._geomOps().slice(fromLen);
    const gm = added.find(o => o.op_type === 'GEOM_GRID_MOVE'), cm = added.find(o => o.op_type === 'GEOM_CUT_MOVE'), rz = added.find(o => o.op_type === 'GEOM_CUT_RESIZE');
    return { types: added.map(o => o.op_type), cmds: gm ? gm.parameters.commands : null, cm: cm ? cm.parameters : null, rz: rz ? rz.parameters : null };
  }, before5.len);
  const hole5 = await holeOf(t, ids.host), door5 = await centreOf(t, ids.door);
  t.slog.slice(logAt).filter(l => /§GRIDMOVE commit|§CUT-MOVE|§DAGEVU/.test(l)).forEach(l => console.log('    ' + l.slice(0, 320))); logAt = t.slog.length;
  console.log('  §CUT-MOVE M5 dimLabel="' + mid5.dim + '" ops=' + JSON.stringify(ops5) + ' hole5=' + JSON.stringify(hole5) + ' door5=' + JSON.stringify(door5) + ' oplog ' + before5.len + '→' + after5.len + ' chain=' + chain5);
  const sc = ops5.cmds && ops5.cmds.find(c => c.featureId === ids.host && c.action === 'SCALE');
  const f = sc ? sc.newScale : NaN, wantS = sc ? -((hole4.c - hole4.wall[0]) * (f - 1) + (sc.translateDelta || 0)) / f : NaN;   // spec §3: s = −Δ/(f·F), F=1 here
  // §CUT-RESIZE (SPEC_GEOM_CUT_RESIZE.md §4 M5): a THIRD row rides the SAME gesture — GEOM_CUT_RESIZE{fx≈1/f, fy=fz=1} —
  // and the hole's WORLD width is now UNCHANGED (1.6 m, not f×1.6): the step 1 residual is gone.
  t.assert('M5 ANCHOR (gesture = GEOM_GRID_MOVE(SCALE wall) + GEOM_CUT_MOVE{dx = −Δ/f} + GEOM_CUT_RESIZE{fx≈1/f, fy=fz=1}; the HELD door\'s centre is unchanged; the hole\'s centre AND WIDTH are unchanged ≤1e-3 (1.6 m, the step-1 residual is gone); mid-drag §V7 label matches "1 hole held" with NO "(Δw …)" suffix; verifyChain)',
    after5.len === before5.len + 3 && ops5.cm && ops5.cm.cutId === cut.id && ops5.cm.induced === 'anchor-hold' && sc && near(ops5.cm.dx, wantS, 1e-6) && ops5.cm.dy === 0 &&
    ops5.rz && ops5.rz.cutId === cut.id && ops5.rz.induced === 'anchor-hold' && near(ops5.rz.fx, 1 / f, 1e-6) && ops5.rz.fy === 1 && ops5.rz.fz === 1 &&
    door5 && near(door5[0], door4[0], 1e-6) && hole5 && near(hole5.c, hole4.c, 1e-3) && near(hole5.w, hole4.w, 1e-3) && hole5.wall[1] > 4.5 &&
    typeof mid5.dim === 'string' && /1 hole held(?! \()/.test(mid5.dim) && chain5 === true,
    'f=' + f + ' wantS=' + (isFinite(wantS) ? wantS.toFixed(4) : '?') + ' cm.dx=' + (ops5.cm ? ops5.cm.dx.toFixed(4) : '?') + ' rz.fx=' + (ops5.rz ? ops5.rz.fx.toFixed(4) : '?') +
    ' hole4.c=' + hole4.c.toFixed(4) + ' hole5=' + JSON.stringify(hole5) + ' door4.x=' + door4[0].toFixed(4) + ' door5.x=' + (door5 ? door5[0].toFixed(4) : '?') + ' dim="' + mid5.dim + '"');
  await t.shot('07-stretched-held');

  // ── M6 UNDO ───────────────────────────────────────────────────────────────────────────────────────────────────
  await ctrlZ(t);
  const undone6 = await t.oplog(); const hole6 = await holeOf(t, ids.host); const door6 = await centreOf(t, ids.door);
  t.assert('M6 UNDO (ONE real Ctrl+Z: all three gesture rows — GRID_MOVE, CUT_MOVE, CUT_RESIZE — deactivated, wall back to 4 m, hole back at its pre-stretch extent, door unchanged)',
    undone6.len === before5.len && hole6 && near(hole6.wall[1], 4, 1e-6) && near(hole6.xmin, hole4.xmin, 1e-6) && near(hole6.xmax, hole4.xmax, 1e-6) && door6 && near(door6[0], door4[0], 1e-6), JSON.stringify({ len: undone6.len, want: before5.len, hole6 }));
  await t.shot('08-undone');
}, { width: 1280, height: 860, dpr: 2 });
