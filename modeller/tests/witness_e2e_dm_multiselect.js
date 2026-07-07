#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-DM-MULTISELECT: real-user, maths-asserted E2E of P1-P3 multi-select
 * (RESUME_SESSION_2026-07-08.md §OPEN item 4 — the direct-manip witness batch).
 *
 * ISSUE THIS PROVES OR DISPROVES: P1-P3 (marquee multi-select + shift-click toggle + group move)
 * shipped with only a dispatched-PointerEvent dev witness (bonsai_multiselect_live.js, ?multiselect=demo)
 * — never driven through REAL browser input (pg.mouse/pg.keyboard, real toolbar clicks). This witness
 * drives the REAL user path end-to-end and asserts hand-derived numeric invariants. Fixture geometry is
 * authored via the op-log (exact coordinates are the point of a hand-derived invariant); every
 * INTERACTION under test is a real trusted mouse/keyboard event.
 *
 * Fixture (hand-chosen exact numbers):
 *   grid xs=[0..6] pitch 1, ys=[0,3]
 *   W0 bbox x[0,1]   y[0,0.2] z[0,3]  (marquee target)
 *   W1 bbox x[2,3]   y[0,0.2] z[0,3]  (marquee target)
 *   W2 bbox x[5,6]   y[0,0.2] z[0,3]  (control — outside the marquee, must never move)
 *   Group c0 = centre of W0∪W1 bbox = (1.5, 0.1, 1.5). Real X-shaft drag of raw +1.5m →
 *   grid snap target = gridline x=3 (c0.x+1.5=3.0 exactly) → committed delta dx = 3.0−1.5 = 1.5
 *   EXACTLY (snap absorbs the click/raycast epsilon: ndx = raw + (3 − (1.5+raw)) = 1.5).
 *
 *   S1 MARQUEE-EXACT-SET   — real Shift+drag box over W0+W1 selects EXACTLY {f0,f1} (exact fid set,
 *                            not a count); control W2's projected centre proven outside the box first.
 *   S2 MARQUEE-LOG         — the real §MARQUEE console line fired listing exactly those fids.
 *   S3 TOGGLE-ADD          — real Shift+click on W2 grows the set to EXACTLY {f0,f1,f2}.
 *   S4 TOGGLE-REMOVE       — second Shift+click removes it again: EXACTLY {f0,f1}.
 *   S5 GROUP-MOVE-OPS      — real #b-move toolbar click + real X-shaft drag commits EXACTLY 2 signed
 *                            GEOM_MOVE ops, parents == {f0,f1}, each dx==1.5 dy==0 dz==0 (hand-derived).
 *   S6 GROUP-MOVE-SCENE    — W0 bbox is now x[1.5,2.5] and W1 x[3.5,4.5] (both moved by the SAME delta).
 *   S7 CONTROL-UNTOUCHED   — W2 has ZERO move ops and its bbox is bit-identical to before.
 *   S8 CHAIN               — 5 signed ops (3 inserts + 2 moves), KernelOps chain verifies.
 *   S9 ESC-TWO-PRESS       — real Escape #1 exits Move keeping the 2-set; Escape #2 clears to 0.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-E2E-DM-MULTISELECT', async (t) => {
  const pg = t.pg;
  // ── fixture: exact-coordinate walls + grid (authoring, not the interaction under test) ─────────
  const fids = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    window.Bonsai.grid.define({ xs: [0, 1, 2, 3, 4, 5, 6], ys: [0, 3], xlabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], ylabels: ['1', '2'] });
    window.Bonsai.grid.show(true); O.clear();
    const mk = async (x0) => (await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[x0, 0], [x0 + 1, 0], [x0 + 1, 0.2], [x0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 })).id;
    const ids = [await mk(0), await mk(2), await mk(5)];
    const meshOf = f => window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f);
    for (let i = 0; i < 120 && !(meshOf(ids[0]) && meshOf(ids[1]) && meshOf(ids[2])); i++) await new Promise(r => setTimeout(r, 50));
    return ids;
  });
  const [f0, f1, f2] = fids;
  console.log('§DM-MULTI fixture fids=' + JSON.stringify(fids));

  // deterministic overhead camera over the walls (the same top-down idiom the harness's overhead() uses)
  await pg.evaluate(() => { const cam = window.A.camera, ctl = window.A.controls; cam.up.set(0, 1, 0); cam.position.set(3, 0.1, 16); ctl.target.set(3, 0.1, 0); ctl.update(); if (window.A.requestRender) window.A.requestRender(); });
  await t.sleep(350);
  const proj = (x, y, z) => pg.evaluate((a, b, c) => { const v = new window.THREE.Vector3(a, b, c).project(window.A.camera); const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect(); return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top]; }, x, y, z);
  const selSet = () => pg.evaluate(() => Array.from(window.Bonsai._selSet || []).sort((a, b) => a - b));
  const bboxOf = (fid) => pg.evaluate(f => { const m = window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z]; }, fid);
  const w2Before = await bboxOf(f2);

  // ── S1/S2: REAL Shift+drag marquee around W0+W1 centres, W2 proven outside ─────────────────────
  const p0 = await proj(0.5, 0.1, 1.5), p1 = await proj(2.5, 0.1, 1.5), p2 = await proj(5.5, 0.1, 1.5);
  const bx0 = Math.min(p0[0], p1[0]) - 40, by0 = Math.min(p0[1], p1[1]) - 40;
  const bx1 = Math.max(p0[0], p1[0]) + 40, by1 = Math.max(p0[1], p1[1]) + 40;
  const controlOutside = p2[0] < bx0 || p2[0] > bx1 || p2[1] < by0 || p2[1] > by1;
  await pg.keyboard.down('Shift');
  await pg.mouse.move(bx0, by0); await t.sleep(40);
  await pg.mouse.down(); await t.sleep(40);
  await pg.mouse.move((bx0 + bx1) / 2, (by0 + by1) / 2, { steps: 4 }); await t.sleep(30);
  await pg.mouse.move(bx1, by1, { steps: 4 }); await t.sleep(40);
  await pg.mouse.up(); await pg.keyboard.up('Shift'); await t.sleep(250);
  const afterMarquee = await selSet();
  console.log('§DM-MULTI marquee box=[' + [bx0, by0, bx1, by1].map(v => v.toFixed(0)).join(',') + '] sel=' + JSON.stringify(afterMarquee) + ' controlOutside=' + controlOutside);
  t.assert('S1 MARQUEE-EXACT-SET (real Shift+drag selects EXACTLY {f0,f1}; control proven outside box)',
    controlOutside && afterMarquee.length === 2 && afterMarquee[0] === f0 && afterMarquee[1] === f1,
    'sel=' + JSON.stringify(afterMarquee) + ' want=[' + f0 + ',' + f1 + ']');
  const mqLog = t.slog.find(l => l.startsWith('§MARQUEE'));
  t.assert('S2 MARQUEE-LOG (§MARQUEE console line fired with exactly those fids)',
    !!mqLog && mqLog.includes('[' + f0 + ',' + f1 + ']'), 'log=' + mqLog);
  await t.shot('01-marquee');

  // ── S3/S4: REAL Shift+click toggle on the control wall ─────────────────────────────────────────
  await pg.keyboard.down('Shift');
  await pg.mouse.move(p2[0], p2[1]); await t.sleep(40);
  await pg.mouse.down(); await t.sleep(30); await pg.mouse.up(); await t.sleep(200);
  const afterAdd = await selSet();
  await pg.mouse.down(); await t.sleep(30); await pg.mouse.up(); await pg.keyboard.up('Shift'); await t.sleep(200);
  const afterRemove = await selSet();
  console.log('§DM-MULTI toggle afterAdd=' + JSON.stringify(afterAdd) + ' afterRemove=' + JSON.stringify(afterRemove));
  t.assert('S3 TOGGLE-ADD (real Shift+click adds control: set == {f0,f1,f2})',
    afterAdd.length === 3 && afterAdd[0] === f0 && afterAdd[1] === f1 && afterAdd[2] === f2, JSON.stringify(afterAdd));
  t.assert('S4 TOGGLE-REMOVE (second Shift+click removes it: back to {f0,f1})',
    afterRemove.length === 2 && afterRemove[0] === f0 && afterRemove[1] === f1, JSON.stringify(afterRemove));

  // ── S5-S8: REAL toolbar Move + REAL X-shaft drag of the group ──────────────────────────────────
  await pg.click('#b-move'); await t.sleep(300);
  const armed = await pg.evaluate(() => ({ moving: !!document.querySelector('#b-move.on'), gizmo: !!window.A.scene.getObjectByName('MoveGizmo') }));
  // grab a point ON the +X shaft (c0=(1.5,0.1,1.5); L=min(3,max(0.9,3*0.7+0.4))=2.5 → shaft spans x 1.5..4.0)
  const gDown = await proj(1.5 + 1.2, 0.1, 1.5);
  const gUp = await proj(1.5 + 1.2 + 1.5, 0.1, 1.5);            // raw +1.5m along X → snaps to gridline x=3 → dx=1.5 exact
  await pg.mouse.move(gDown[0], gDown[1]); await t.sleep(60);
  await pg.mouse.down(); await t.sleep(80);
  await pg.mouse.move((gDown[0] + gUp[0]) / 2, gDown[1], { steps: 4 }); await t.sleep(50);
  await pg.mouse.move(gUp[0], gUp[1], { steps: 6 }); await t.sleep(80);
  await pg.mouse.up(); await t.sleep(1200);                      // 2 async signed commits + refold
  const ops = await pg.evaluate(() => {
    const O = window.Bonsai.oplog;
    const mv = O._geomOps().filter(o => o.op_type === 'GEOM_MOVE');
    return {
      moves: mv.map(m => ({ parent: m.parent, dx: +m.parameters.dx, dy: +m.parameters.dy, dz: +m.parameters.dz })),
      signed: O.db.exec("SELECT COUNT(*) FROM kernel_ops WHERE sig IS NOT NULL")[0].values[0][0],
    };
  });
  const verify = await t.verifyChain();
  const parents = ops.moves.map(m => m.parent).sort((a, b) => a - b);
  console.log('§DM-MULTI group-move moves=' + JSON.stringify(ops.moves) + ' signed=' + ops.signed + ' verify=' + verify);
  t.assert('S5 GROUP-MOVE-OPS (real toolbar+drag → EXACTLY 2 GEOM_MOVE, parents {f0,f1}, each dx==1.5 dy==0 dz==0)',
    armed.moving && armed.gizmo && ops.moves.length === 2 && parents[0] === f0 && parents[1] === f1 &&
    ops.moves.every(m => Math.abs(m.dx - 1.5) < 1e-6 && m.dy === 0 && m.dz === 0),
    'armed=' + JSON.stringify(armed) + ' moves=' + JSON.stringify(ops.moves));
  // scene truth: both walls moved by exactly the committed delta; poll the refold
  let w0After = null, w1After = null;
  for (let i = 0; i < 100; i++) { w0After = await bboxOf(f0); if (w0After && Math.abs(w0After[0] - 1.5) < 1e-3) break; await t.sleep(80); }
  w1After = await bboxOf(f1);
  const w2After = await bboxOf(f2);
  console.log('§DM-MULTI bbox w0=' + JSON.stringify(w0After) + ' w1=' + JSON.stringify(w1After) + ' w2=' + JSON.stringify(w2After));
  const near6 = (a, b) => Math.abs(a - b) < 1e-3;
  t.assert('S6 GROUP-MOVE-SCENE (W0 → x[1.5,2.5], W1 → x[3.5,4.5]; y/z untouched)',
    !!w0After && !!w1After && near6(w0After[0], 1.5) && near6(w0After[1], 2.5) && near6(w1After[0], 3.5) && near6(w1After[1], 4.5) &&
    near6(w0After[2], 0) && near6(w0After[3], 0.2) && near6(w0After[4], 0) && near6(w0After[5], 3),
    'w0=' + JSON.stringify(w0After) + ' w1=' + JSON.stringify(w1After));
  t.assert('S7 CONTROL-UNTOUCHED (W2: zero move ops, bbox identical to pre-drag)',
    ops.moves.filter(m => m.parent === f2).length === 0 && !!w2After && w2Before.every((v, i) => near6(v, w2After[i])),
    'before=' + JSON.stringify(w2Before) + ' after=' + JSON.stringify(w2After));
  t.assert('S8 CHAIN (5 signed ops = 3 inserts + 2 moves; chain verifies)',
    ops.signed === 5 && verify === true, 'signed=' + ops.signed + ' verify=' + verify);
  await t.shot('02-group-moved');

  // ── S9: REAL two-press Escape (exit Move keeping the set, then clear) ──────────────────────────
  await pg.keyboard.press('Escape'); await t.sleep(200);
  const esc1 = await pg.evaluate(() => ({ n: (window.Bonsai._selSet || new Set()).size, moving: !!document.querySelector('#b-move.on') }));
  await pg.keyboard.press('Escape'); await t.sleep(200);
  const esc2 = await selSet();
  console.log('§DM-MULTI esc1=' + JSON.stringify(esc1) + ' esc2=' + JSON.stringify(esc2));
  t.assert('S9 ESC-TWO-PRESS (Esc#1 exits Move keeping 2-set; Esc#2 clears to 0)',
    esc1.n === 2 && esc1.moving === false && esc2.length === 0, JSON.stringify({ esc1, esc2 }));
});
