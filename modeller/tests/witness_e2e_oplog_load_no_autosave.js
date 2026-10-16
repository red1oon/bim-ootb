#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-OPLOG-LOAD-NO-AUTOSAVE scope (read the log after every run)
 * SCOPE: bonsai_oplog.js _emit() persist-vs-notify split at the 3 LOAD-only call sites — restore(),
 * reload(), setModelKey() (follow-on to the §AUTOSAVE_FIX Finding 4 / PR #703 localStorage-quota lineage).
 *
 * ISSUE THIS PROVES/DISPROVES: "_emit() is one choke point for BOTH real-edit persistence and load-time UI
 * notification, so restore()/reload()/setModelKey() — which just read bytes FROM storage — immediately call
 * _save() and write those SAME unmodified bytes straight BACK to localStorage before any real edit happened"
 * — was TRUE (every building open / boot restore / Connect-Scene pull burned a full-model localStorage write
 * for nothing, feeding the Terminal-scale quota exhaustion Finding 4 fixed downstream), now FALSE (_emit(false)
 * = notify-only at exactly those 3 sites; every mutation path still calls bare _emit() and persists).
 *
 * Oracle: a COUNTING localStorage.setItem spy (delegates to the real setItem — no behaviour change), counted
 * PER KEY, plus a 'bonsai:oplog' event counter to prove the notify half of _emit() still fires on load paths.
 * Real browser, real signed commits for the persisted bytes — nothing simulated.
 *
 * RED/GREEN protocol (PR #703 pattern): run once with the fix stashed → L3/L4/L5 must FAIL (each load path
 * writes the key once = the bug), then with the fix → all GREEN. Logs: modeller/tests/logs/.
 *
 * CLAIMS:
 *   L1 SETUP      — a real signed commit on the scratch model autosaves: spy counts ≥1 setItem(scratchKey)
 *                   (baseline: the persistence path IS observable through this spy — no vacuous zeros later).
 *   L2 PLANT      — setModelKey('mo_LoadTest') + a real commit persists bytes under mo_LoadTest, then switch
 *                   back to the scratch key (arms L3: mo_LoadTest is now an already-persisted model to open).
 *   L3 OPEN-NOWRITE  (THE claim) — setModelKey('mo_LoadTest') with NO edit: setItem(mo_LoadTest) === 0 (the
 *                   bug wrote the just-loaded bytes back once), setItem(scratchKey) === 1 (the deliberate
 *                   OLD-key flush at setModelKey's start — must stay), and 'bonsai:oplog' fired (notify kept).
 *   L4 RELOAD-NOWRITE — reload() (Connect-Scene multi-surface pull) with NO edit: setItem(mo_LoadTest) === 0,
 *                   'bonsai:oplog' fired.
 *   L5 RESTORE-NOWRITE — restore() (boot-time path) with NO edit: setItem(mo_LoadTest) === 0, 'bonsai:oplog'
 *                   fired.
 *   L6 EDIT-PERSISTS — one real commit() after all that: setItem(mo_LoadTest) === 1 and the log grew — the
 *                   fix removed ONLY the load-time no-op write, not persistence itself.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-E2E-OPLOG-LOAD-NO-AUTOSAVE', async (t) => {
  // Install the counting spy + event counter BEFORE anything else touches the oplog.
  await t.pg.evaluate(() => {
    const orig = localStorage.setItem.bind(localStorage);
    window.__lsWrites = {};
    localStorage.setItem = (k, v) => { window.__lsWrites[k] = (window.__lsWrites[k] || 0) + 1; return orig(k, v); };
    window.__oplogEvents = 0;
    window.addEventListener('bonsai:oplog', () => { window.__oplogEvents++; });
    window.__spyReset = () => { window.__lsWrites = {}; window.__oplogEvents = 0; };
  });

  // L1 — baseline: one real signed commit on the scratch model; the autosave MUST show up in the spy.
  const setup = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    const scratchKey = O._KEY;
    await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 1, h: 1 }, dir: [0, 0, 2.5] } });
    return { scratchKey, len: O.length, writes: window.__lsWrites[scratchKey] || 0 };
  });
  t.assert('L1 SETUP real commit autosaved — spy observes the persistence path (setItem(scratch)>=1)',
    setup.len > 0 && setup.writes >= 1, JSON.stringify(setup));

  // L2 — plant an already-persisted building instance under mo_LoadTest, then return to the scratch key.
  const plant = await t.pg.evaluate(async (scratchKey) => {
    const O = window.Bonsai.oplog;
    await O.setModelKey('mo_LoadTest');
    await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 2, h: 1 }, dir: [0, 0, 1.5] } });
    const planted = { len: O.length, lsHasKey: !!localStorage.getItem('mo_LoadTest') };
    await O.setModelKey(scratchKey);            // back on scratch — arms the L3 open-an-existing-model measurement
    return planted;
  }, setup.scratchKey);
  t.assert('L2 PLANT mo_LoadTest holds a real persisted signed op-log', plant.len > 0 && plant.lsHasKey, JSON.stringify(plant));

  // L3 — THE claim: opening the already-persisted model (setModelKey) must NOT write its own bytes back.
  const open = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    window.__spyReset();
    await O.setModelKey('mo_LoadTest');
    return { newKeyWrites: window.__lsWrites['mo_LoadTest'] || 0, oldKeyFlush: window.__lsWrites[Object.keys(window.__lsWrites).find(k => k !== 'mo_LoadTest')] || 0, allWrites: window.__lsWrites, events: window.__oplogEvents, len: O.length };
  });
  t.assert('L3 OPEN-NOWRITE setModelKey loaded ' + open.len + ' ops with ZERO setItem(mo_LoadTest) — the load-time write-back is gone',
    open.len > 0 && open.newKeyWrites === 0, JSON.stringify(open.allWrites));
  t.assert('L3b OLD-KEY-FLUSH the deliberate _save() of the OLD key at setModelKey start still happened exactly once',
    open.oldKeyFlush === 1, JSON.stringify(open.allWrites));
  t.assert('L3c NOTIFY-KEPT bonsai:oplog still dispatched on open (UI notification half of _emit preserved)',
    open.events >= 1, 'events=' + open.events);

  // L4 — reload() (the Connect-Scene shared-store pull): re-reads the SAME bytes — must not write them back.
  const rel = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    window.__spyReset();
    await O.reload();
    return { writes: window.__lsWrites['mo_LoadTest'] || 0, all: window.__lsWrites, events: window.__oplogEvents, len: O.length };
  });
  t.assert('L4 RELOAD-NOWRITE reload() re-read ' + rel.len + ' ops with ZERO setItem(mo_LoadTest)',
    rel.len > 0 && rel.writes === 0, JSON.stringify(rel.all));
  t.assert('L4b NOTIFY-KEPT bonsai:oplog still dispatched on reload', rel.events >= 1, 'events=' + rel.events);

  // L5 — restore() (the boot-time path, same guard shape `if (this.length) { _foldUpto; _emit }`).
  const res = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    window.__spyReset();
    await O.restore();
    return { writes: window.__lsWrites['mo_LoadTest'] || 0, all: window.__lsWrites, events: window.__oplogEvents, len: O.length };
  });
  t.assert('L5 RESTORE-NOWRITE restore() folded ' + res.len + ' ops with ZERO setItem(mo_LoadTest)',
    res.len > 0 && res.writes === 0, JSON.stringify(res.all));
  t.assert('L5b NOTIFY-KEPT bonsai:oplog still dispatched on restore', res.events >= 1, 'events=' + res.events);

  // L6 — persistence is NOT broken: one real edit still autosaves exactly once.
  const edit = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    const before = O.length;
    window.__spyReset();
    await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 1, h: 2 }, dir: [0, 0, 3] } });
    return { writes: window.__lsWrites['mo_LoadTest'] || 0, grew: O.length > before, len: O.length };
  });
  t.assert('L6 EDIT-PERSISTS a real commit() still autosaves (setItem(mo_LoadTest)===1) — only the load no-op write was removed',
    edit.grew && edit.writes === 1, JSON.stringify(edit));
  console.log('  §OPLOG_LOAD_NO_AUTOSAVE_WITNESS open=' + open.newKeyWrites + ' reload=' + rel.writes + ' restore=' + res.writes + ' editWrites=' + edit.writes + ' finalLen=' + edit.len);
}, { width: 900, height: 700, dpr: 1 });
