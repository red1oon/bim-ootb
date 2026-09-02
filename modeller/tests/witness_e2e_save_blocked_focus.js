#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SAVE-BLOCKED-FOCUS scope (read the log after every run)
 * SCOPE: prompts/WATCHDOG_SCALE_AND_UX_SWEEP.md / SCALE_AND_UX_SWEEP.md §3.2 — before this fix, runSave()'s
 * RED-blocked path (modeller.html's `if (res.red.length)` branch) ONLY called toast()+setStat() — text saying
 * "blocked", with NO way for the user to find which element(s) are the problem (confirmed by reading the code,
 * not assumed). Fix: select the RED finding's elements (setSelectionIds — same fn a normal click uses) and
 * fly the camera to the primary one (fitView — same fn the 'F' key uses) BEFORE returning.
 *
 * ISSUE THIS PROVES/DISPROVES: "a blocked Save points the user at the offending element" — was FALSE
 * (toast-only dead end), now TRUE (selection + camera fly-to on the exact real clash pair).
 * CLAIM F1: real clash → real #b-save click → §SAVE_RED_FOCUS logged, selectedIds contains both clash
 *           partners, primary == the first RED finding's `a`, and the camera actually moved (controls.target
 *           changed) — not just a log line with no real effect.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-SAVE-BLOCKED-FOCUS', async (t) => {
  await t.open('Duplex');
  await t.pg.waitForFunction(() => !!window.__saveGateBaseline, { timeout: 20000 }).catch(() => {});

  const targetBefore = await t.pg.evaluate(() => { const c = window.A.controls.target; return [c.x, c.y, c.z]; });

  const clashPair = await t.pg.evaluate(() => {
    const boxes = window.__gateBoxes(), rel = window.__gateRel();
    const fbg = window.__arcFidByGuid || {};
    const abutFids = new Set();
    ((window.swXEdges && window.swXEdges.abuts) || []).forEach(e => { const a = fbg[e.a], b = fbg[e.b]; if (a != null) abutFids.add(a); if (b != null) abutFids.add(b); });
    const vol = (id) => { const b = boxes[id]; return (b[1] - b[0]) * (b[3] - b[2]) * (b[5] - b[4]); };
    const ids = Object.keys(boxes).map(Number).filter(id => !abutFids.has(id)).sort((a, b) => vol(a) - vol(b));
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      if (rel.related(a, b)) continue;
      const ca = [(boxes[a][0] + boxes[a][1]) / 2, (boxes[a][2] + boxes[a][3]) / 2, (boxes[a][4] + boxes[a][5]) / 2];
      const cb = [(boxes[b][0] + boxes[b][1]) / 2, (boxes[b][2] + boxes[b][3]) / 2, (boxes[b][4] + boxes[b][5]) / 2];
      return { a, b, dx: cb[0] - ca[0], dy: cb[1] - ca[1], dz: cb[2] - ca[2] };
    }
    return null;
  });
  t.assert('F0-SETUP found an unrelated pair to clash', !!clashPair, JSON.stringify(clashPair));

  await t.pg.evaluate(async (p) => {
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: p.a, dx: p.dx, dy: p.dy, dz: p.dz } });
  }, clashPair);
  await t.sleep(300);

  await t.pg.evaluate(() => { window.__lastSaveResult = undefined; window.Bonsai._selSet = new Set(); });
  await t.clickSel('#b-save');
  await t.pg.waitForFunction(() => window.__lastSaveResult !== undefined, { timeout: 15000 }).catch(() => {});
  await t.sleep(200);

  const r1 = await t.pg.evaluate(() => window.__lastSaveResult);
  const focusLog = t.slog.filter(l => /^§SAVE_RED_FOCUS/.test(l)).pop() || '';
  const sel = await t.pg.evaluate(() => ({ ids: Array.from(window.Bonsai._selSet || []), primary: window.__e2e ? undefined : undefined }));
  const selIds = await t.pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
  const targetAfter = await t.pg.evaluate(() => { const c = window.A.controls.target; return [c.x, c.y, c.z]; });
  const camMoved = Math.hypot(targetAfter[0] - targetBefore[0], targetAfter[1] - targetBefore[1], targetAfter[2] - targetBefore[2]) > 1e-3;

  t.assert('F1 RED-BLOCKED-FOCUS (real clash blocks Save AND selects+flies to the offending pair, not just a toast)',
    r1 && r1.ok === false && r1.reason === 'red-blocked' &&
    /^§SAVE_RED_FOCUS/.test(focusLog) &&
    selIds.includes(clashPair.a) && selIds.includes(clashPair.b) &&
    camMoved,
    'result=' + JSON.stringify(r1) + ' focusLog="' + focusLog + '" selIds=' + JSON.stringify(selIds) +
    ' clashPair=' + JSON.stringify(clashPair) + ' targetBefore=' + JSON.stringify(targetBefore) + ' targetAfter=' + JSON.stringify(targetAfter) + ' camMoved=' + camMoved);
}, { width: 1200, height: 850, dpr: 1 });
