#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SAVE-BLOCKED-HEAL-INDUCED scope (read the log after every run)
 * SCOPE: SCALE_CHECK_TERMINAL_FINDINGS_2026-07-05.md Finding 2 / item 4 (message-clarity fix, no behavior
 * change) — before this fix, runSave()'s RED-blocked toast said "Save blocked — N RED: <kinds>" regardless of
 * WHETHER the RED was pre-existing in the model or was ITSELF created by this Save's own auto-heal pass (the
 * real Terminal-scale failure mode Finding 2 found: healing an ORANGE abuts-realign moved the WALL back into
 * touch with its pulled-away neighbour, and that wall-shift swept into a THIRD, wholly unrelated element,
 * escalating to a genuine RED — heal succeeded, but the Save still blocked, with a message that gave no hint
 * WHY). Fix (modeller.html runSave(), the `if (res.red.length)` branch): track which featureIds the heal pass
 * itself moved (target + hosted riders) in `healMovedFids`; if any post-heal RED finding names one of those
 * ids, the toast/log now say so explicitly instead of a generic RED count.
 *
 * ISSUE THIS PROVES/DISPROVES: "a heal-induced new RED reads the same as a pre-existing RED" — was TRUE
 * (generic message either way), now FALSE (§SAVE_BLOCKED_REASON heal_induced=true/false + a distinct toast).
 *
 * Reproduces Finding 2's mechanism DETERMINISTICALLY at Duplex's small, fast scale (real elements, only the
 * MOVE deltas are computed — nothing invented) instead of requiring real Terminal building density to get
 * lucky: wall wA + neighbour elC flush against it (real abuts edge) is the standard abuts-realign fixture
 * (same recipe witness_e2e_scale_check_terminal.js's C2 uses); a THIRD real element elX is placed flush
 * against the SAME wall face, offset along the wall's length so it does not spatially collide with elC, and
 * deliberately left OUT of the abuts/related graph (genuinely unrelated). Pulling elC away opens the ORANGE
 * gap; sdg_save.js's healOp moves `finding.a` == wA (the unmoved neighbour, per its own header comment) back
 * toward elC to re-touch it — sweeping wA's box into elX's, which the whole-scene re-evaluate (sdg_gate.js
 * kind (1), moved-vs-ALL-fids) then correctly flags as a NEW clash.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-SAVE-BLOCKED-HEAL-INDUCED', async (t) => {
  await t.open('Duplex');
  await t.pg.waitForFunction(() => !!window.__saveGateBaseline, { timeout: 20000 }).catch(() => {});

  const setup = await t.pg.evaluate(() => {
    const boxes = window.__gateBoxes(), rel = window.__gateRel();
    const entangled = new Set();
    Object.keys(rel.hostOf).forEach(k => { entangled.add(+k); entangled.add(rel.hostOf[k]); });
    (rel.abuts || []).forEach(e => { entangled.add(e.a); entangled.add(e.b); });
    const ids = Object.keys(boxes).map(Number);
    const ext = (id) => { const b = boxes[id]; return [b[1] - b[0], b[3] - b[2], b[5] - b[4]]; };
    // wall-ish: thin on exactly one horizontal axis, tall/long on the others (mirrors the scale-check C2 filter).
    const wallish = ids.filter(id => { const e = ext(id); const mn = Math.min(...e), mx = Math.max(...e); return mn > 0.05 && mn < 0.6 && mx > 1.5; });
    for (const wA of wallish) {
      const wExt = ext(wA);
      const k = wExt.indexOf(Math.min(...wExt));                 // thickness axis (the thinnest extent)
      if (k === 2) continue;                                     // a "wall" thin along Z would be a floor/roof slab — skip
      const j = [0, 1, 2].find(a => a !== k && a !== 2);          // the wall's in-plane LENGTH axis (not thickness, not Z)
      const small = ids.filter(id => id !== wA && !entangled.has(id) && Math.max(...ext(id)) < 2.0 && Math.min(...ext(id)) > 0.05);
      if (small.length < 2) continue;
      const wBox = boxes[wA];
      function flushOnK(id) {
        const b = boxes[id]; const d = [0, 0, 0];
        d[k] = wBox[2 * k + 1] - b[2 * k];                        // flush against wA's + face on the thickness axis
        for (let ax = 0; ax < 3; ax++) { if (ax === k) continue; const wC = (wBox[2 * ax] + wBox[2 * ax + 1]) / 2, bC = (b[2 * ax] + b[2 * ax + 1]) / 2; d[ax] = wC - bC; }
        return d;
      }
      // try every distinct pair for elC/elX until one placement keeps them from overlapping each other
      for (let ci = 0; ci < small.length; ci++) for (let xi = 0; xi < small.length; xi++) {
        if (ci === xi) continue;
        const elC = small[ci], elX = small[xi];
        const dC = flushOnK(elC), dX = flushOnK(elX);
        const eC = ext(elC), eX = ext(elX);
        dX[j] += eC[j] / 2 + eX[j] / 2 + 0.3;                     // shove elX further along the wall's length — beside elC, not on top of it
        return { wA, elC, elX, k, j, dC, dX };
      }
    }
    return null;
  });
  t.assert('H0-SETUP found a real wall + 2 distinct unrelated small neighbours (elC to pull, elX to be swept into)', !!setup, JSON.stringify(setup));

  await t.pg.evaluate(async (s) => {
    window.swXEdges = window.swXEdges || { abuts: [], fills: [], anchored: [], spans: [], aggregates: [], datums: [] };
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: s.elC, dx: s.dC[0], dy: s.dC[1], dz: s.dC[2] } });
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: s.elX, dx: s.dX[0], dy: s.dX[1], dz: s.dX[2] } });
    // ONLY wA<->elC is a registered abuts edge — elX stays genuinely UNRELATED (no edge), which is the whole
    // point: the gate's related() must NOT exempt a wA/elX overlap once the heal sweeps wA into it.
    window.swXEdges.abuts.push({ a: window.__arcGuidByFid[s.wA], b: window.__arcGuidByFid[s.elC] });
    window.__saveGateInit();   // re-arm the baseline AFTER this flush placement — this IS the clean starting state
  }, setup);
  await t.sleep(300);

  // pull elC away along the thickness axis — real abuts-realign ORANGE (wA unmoved, elC moved, gap reopened)
  await t.pg.evaluate(async (s) => {
    const d = [0, 0, 0]; d[s.k] = 0.5;
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: s.elC, dx: d[0], dy: d[1], dz: d[2] } });
  }, setup);
  await t.sleep(300);

  const pre = await t.pg.evaluate((s) => {
    const before = window.__saveGateBaseline, after = window.__gateBoxes(), rel = window.__gateRel();
    const moved = Object.keys(after).map(Number).filter(id => { const b = before[id], a = after[id]; return !b || b.some((v, i) => Math.abs(v - a[i]) > 1e-9); });
    const res = window.SdgGate.evaluate(before, after, moved, rel, {});
    return { red: res.red.length, orange: res.orange.filter(o => o.kind === 'abuts-realign' && o.a === s.wA && o.b === s.elC).length };
  }, setup);
  t.assert('H1-PRECONDITION real ORANGE abuts-realign fixture, zero RED before Save', pre.red === 0 && pre.orange === 1, JSON.stringify(pre));

  await t.pg.evaluate(() => { window.__lastSaveResult = undefined; });
  await t.clickSel('#b-save');
  await t.pg.waitForFunction(() => window.__lastSaveResult !== undefined, { timeout: 15000 }).catch(() => {});
  await t.sleep(200);

  const r = await t.pg.evaluate(() => window.__lastSaveResult);
  const reasonLog = t.slog.filter(l => /^§SAVE_BLOCKED_REASON/.test(l)).pop() || '';
  const blockedLog = t.slog.filter(l => /^§SAVE_BLOCKED reason=/.test(l)).pop() || '';
  const autohealLog = t.slog.filter(l => /^§SAVE_AUTOHEAL fixed=/.test(l)).pop() || '';
  const toastMsg = await t.pg.evaluate(() => {
    const els = Array.from(document.querySelectorAll('#toast-stack .toast.error span:not(.ti)'));
    return els.length ? els[els.length - 1].textContent : null;
  });

  t.assert('H2 SAVE-BLOCKED reproduced heal-induced RED (heal ran, THEN wA-shift clashed elX)',
    r && r.ok === false && r.reason === 'red-blocked' && !!r.healed && r.healed.length >= 1 && /^§SAVE_AUTOHEAL fixed=/.test(autohealLog),
    'result=' + JSON.stringify(r) + ' autohealLog="' + autohealLog + '"');

  t.assert('H3 SAVE_BLOCKED_REASON heal_induced=true (was indistinguishable from a pre-existing RED before this fix)',
    /heal_induced=true/.test(reasonLog), 'reasonLog="' + reasonLog + '" blockedLog="' + blockedLog + '"');

  t.assert('H4 toast message NAMES the heal-induced cause (not the old generic "N RED: kind" text)',
    !!toastMsg && /auto-heal fixed/.test(toastMsg) && /new clash/.test(toastMsg) && /resolve manually/.test(toastMsg),
    'toast="' + toastMsg + '"');

  const selIds = await t.pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
  t.assert('H5 element still selected/flown-to (the §UX-SAVE-BLOCKED-FOCUS mechanism from the prior commit is UNCHANGED by this message-only fix)',
    selIds.length > 0, 'selIds=' + JSON.stringify(selIds));
}, { width: 1200, height: 850, dpr: 1 });
