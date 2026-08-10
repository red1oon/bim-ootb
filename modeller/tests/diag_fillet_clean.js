#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — DIAGNOSTIC ONLY. Clean, isolated, single-target repro (no cross-target oplog
 * accumulation, generous settle waits) — ruling out whether diag_fillet_repro.js's earlier observed
 * "filletOk=true" for fid=87 was a real fix-state or a race/reuse artifact of running 2 targets +
 * many probe calls in the SAME oplog/session. Usage: node diag_fillet_clean.js <fid>
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const targetFid = parseInt(process.argv[2] || '87', 10);

runE2E('DIAG-FILLET-CLEAN-' + targetFid, async (t) => {
  await t.open('Duplex');
  const selRes = await t.pg.evaluate(f => { try { return window.Bonsai.select(f); } catch (e) { return 'ERR:' + e.message; } }, targetFid);
  await t.sleep(500);
  console.log('  §SELECT fid=' + targetFid + ' res=' + JSON.stringify(selRes));

  const beforeCut = await t.oplog();
  await t.clickSel('#b-cut');
  // Poll status text until it stabilizes on "cut opening in #<fid>" (real completion signal, not a blind sleep).
  let statFinal = null;
  for (let i = 0; i < 40; i++) {
    const s = await t.pg.evaluate(() => document.getElementById('stat').textContent);
    if (/^cut opening in #/.test(s)) { statFinal = s; break; }
    await t.sleep(150);
  }
  console.log('  §CUT-STAT fid=' + targetFid + ' final=' + JSON.stringify(statFinal));
  await t.sleep(1000);   // extra buffer past the completion signal, matching this project's own generous-settle pattern
  const afterCut = await t.oplog(); const lastCut = await t.lastOp();
  console.log('  §CUT fid=' + targetFid + ' len ' + beforeCut.len + '->' + afterCut.len + ' op=' + (lastCut && lastCut.op_type) + ' parent=' + (lastCut && lastCut.parameters && lastCut.parameters.parent));
  const chain = await t.verifyChain();
  console.log('  §CHAIN fid=' + targetFid + ' verifyChain=' + chain);

  const reSelRes = await t.pg.evaluate(f => { try { return window.Bonsai.select(f); } catch (e) { return 'ERR:' + e.message; } }, targetFid);
  await t.sleep(800);
  const reSelSet = await t.pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
  console.log('  §RE-SELECT fid=' + targetFid + ' res=' + JSON.stringify(reSelRes) + ' selSet=' + JSON.stringify(reSelSet));

  await t.clickSel('#b-fillet'); await t.sleep(1200);
  const edges = await t.pg.evaluate(() => (window._edgeList || []).map(e => ({ i: e.i, mid: e.mid })));
  const statText = await t.pg.evaluate(() => document.getElementById('stat').textContent);
  console.log('  §EDGES fid=' + targetFid + ' count=' + edges.length + ' stat=' + JSON.stringify(statText));
  if (!edges.length) { console.log('  §ABORT no edges'); return; }

  const e0 = edges.slice().sort((a, b) => b.mid[2] - a.mid[2])[0];
  const epx = await t.proj(e0.mid[0], e0.mid[1], e0.mid[2]);
  await t.pg.mouse.click(epx[0], epx[1]); await t.sleep(400);
  const applyEnabled = await t.pg.evaluate(() => { const b = document.getElementById('b-applyfillet'); return b && !b.disabled; });
  console.log('  §PICK fid=' + targetFid + ' edgeIdx=' + e0.i + ' applyEnabled=' + applyEnabled);
  if (!applyEnabled) { console.log('  §ABORT pick miss'); return; }

  await t.pg.evaluate(() => { const el = document.getElementById('dim-rad'); if (el) el.value = '0.02'; });
  const beforeFillet = await t.oplog();
  t.errs.length = 0;
  const consoleErrs = [];
  const onConsole = msg => { if (msg.type() === 'error' || msg.type() === 'warning') consoleErrs.push(msg.type() + ':' + msg.text()); };
  t.pg.on('console', onConsole);
  await t.clickSel('#b-applyfillet');
  // Poll status text until it settles ("filleted #.." or "FAIL ..") instead of a blind sleep.
  let fStat = null;
  for (let i = 0; i < 40; i++) {
    const s = await t.pg.evaluate(() => document.getElementById('stat').textContent);
    if (/^filleted #/.test(s) || /^FAIL/.test(s)) { fStat = s; break; }
    await t.sleep(150);
  }
  await t.sleep(500);
  t.pg.off('console', onConsole);
  const afterFillet = await t.oplog(); const lastFillet = await t.lastOp();
  const filletOk = afterFillet.len === beforeFillet.len + 1 && lastFillet && lastFillet.op_type === 'GEOM_FILLET';
  console.log('  §FILLET-RESULT fid=' + targetFid + ' filletOk=' + filletOk + ' finalStat=' + JSON.stringify(fStat) +
    ' opsLen ' + beforeFillet.len + '->' + afterFillet.len + ' pageErrs=' + JSON.stringify(t.errs) + ' consoleErrs=' + JSON.stringify(consoleErrs.slice(0, 10)));
  console.log('  §DONE');
}, { width: 1200, height: 850, dpr: 2 });
