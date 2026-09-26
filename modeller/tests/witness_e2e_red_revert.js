#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-RED-REVERT: one-click revert of an edit the gate flags RED (MODELLER_MASTER row 22, part 1).
 * SCOPE: BIMCompiler prompts/Modeller/NEXT_0926/SPEC_RED_REVERT.md. Read the log after every run.
 * ISSUE: the RED gate only REPORTED — the user had no one-click way back (RED on main 9325eb6d: no Revert control).
 * Fixture = §GATE-SMOKE's: drive element A onto the most-separated element B through __commitMove (the move tool's path).
 *   V1 PRE         — __lastGate is RED and the toast has a Revert button (else VOID).
 *   V2 REVERT      — clicking Revert puts A back (±1 mm), undoes the edit's row, op-log verifies.
 *   V3 STALE-GUARD — RED edit, then another edit, then that RED toast's Revert: nothing undone, §RED-REVERT reverted=false.
 *   (+ harness NO-ERROR)
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-RED-REVERT', async (t) => {
  await t.open('Duplex');
  await t.pg.waitForFunction(() => Object.keys(window.__gateBoxes()).length > 0, { timeout: 30000 }).catch(() => {});
  const plan = await t.pg.evaluate(() => {
    const B = window.__gateBoxes(), ids = Object.keys(B).map(Number), c = id => [0, 1, 2].map(k => (B[id][2 * k] + B[id][2 * k + 1]) / 2);
    let best = null, bd = -1;
    for (const a of ids) for (const b of ids) { if (a === b) continue; const ca = c(a), cb = c(b), d = Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]); if (d > bd) { bd = d; best = { a, b, delta: [cb[0] - ca[0], cb[1] - ca[1], cb[2] - ca[2]] }; } }
    const other = ids.find(x => x !== best.a && x !== best.b);
    return Object.assign(best, { other });
  });
  console.log('  §FIXTURE ' + JSON.stringify(plan));
  const snap = (id) => t.pg.evaluate((id) => ({ box: window.__gateBoxes()[id], active: window.Bonsai.oplog._allGeom().filter(o => !o.undone).length }), id);
  const s0 = await snap(plan.a);
  await t.pg.evaluate(async (p) => { window.Bonsai.select(p.a); await window.__commitMove(p.delta[0], p.delta[1], p.delta[2]); }, plan);
  await t.sleep(400);
  const pre = await t.pg.evaluate(() => { const bs = Array.from(document.querySelectorAll('#toast-stack .toast-act')).filter(b => b.textContent === 'Revert');
    if (bs.length) bs[bs.length - 1].setAttribute('data-w', 'r1'); return { gate: window.__lastGate || '', button: bs.length > 0 }; });
  const s1 = await snap(plan.a);
  const ok1 = /RED/.test(pre.gate) && pre.button;
  t.assert('V1 PRE (edit flagged RED, toast has Revert)', ok1, JSON.stringify(pre));
  if (!ok1) { console.log('  ⚪ VOID — V2/V3 not judged'); return; }
  await t.pg.click('[data-w="r1"]');
  await t.pg.evaluate(async () => { const MH = window.ModellerHistory; await ((MH.pending && MH.pending()) || Promise.resolve()); });
  await t.sleep(500);
  const s2 = await snap(plan.a);
  const dev = Math.max(...s2.box.map((v, i) => Math.abs(v - s0.box[i])));
  const line2 = t.slog.filter(l => /§RED-REVERT/.test(l)).pop() || '';
  t.assert('V2 REVERT (A back ±1 mm, edit row undone, chain verifies)', dev <= 0.001 && s2.active === s1.active - 1 && /reverted=true/.test(line2) && await t.verifyChain(),
    'dev=' + dev.toFixed(5) + ' active ' + s1.active + '→' + s2.active + ' ' + line2.slice(0, 100));

  // V3: RED edit → a second (clean) edit → the stale Revert must not undo anything
  await t.pg.evaluate(async (p) => { window.Bonsai.select(p.a); await window.__commitMove(p.delta[0], p.delta[1], p.delta[2]); }, plan);
  await t.sleep(400);
  const got = await t.pg.evaluate(() => { const bs = Array.from(document.querySelectorAll('#toast-stack .toast-act')).filter(b => b.textContent === 'Revert' && !b.hasAttribute('data-w'));
    if (bs.length) bs[bs.length - 1].setAttribute('data-w', 'r2'); return bs.length > 0; });
  await t.pg.evaluate(async (p) => { window.Bonsai.select(p.other); await window.__commitMove(0, 0, 25); }, plan);
  await t.sleep(400);
  const s3 = await snap(plan.a);
  if (got) { await t.pg.click('[data-w="r2"]'); await t.sleep(600); }
  const s4 = await snap(plan.a);
  const line3 = t.slog.filter(l => /§RED-REVERT/.test(l)).pop() || '';
  t.assert('V3 STALE-GUARD (Revert after a later edit undoes nothing)', got && s4.active === s3.active && /reverted=false/.test(line3), 'button=' + got + ' active ' + s3.active + '→' + s4.active + ' ' + line3.slice(0, 120));
});
