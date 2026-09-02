#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-AUTOSAVE-IDB-FALLBACK scope (read the log after every run)
 * SCOPE: SCALE_CHECK_TERMINAL_FINDINGS_2026-07-05.md Finding 4 (real data-loss risk) — bonsai_oplog.js's
 * `_save()` used to write the WHOLE signed op-log to localStorage on every change with NO fallback; at
 * Terminal scale this measurably exceeds localStorage's ~5-10MB/origin quota (confirmed in the raw scale-check
 * log: 20x "§OPLOG autosave FAILED ... QuotaExceededError ... 'mo_Terminal' exceeded the quota") and a failed
 * autosave was console.error-only — the edit stayed correct in-session but silently did NOT survive a reload.
 *
 * ISSUE THIS PROVES/DISPROVES: "a localStorage-overflow autosave silently loses the edit" — was TRUE (nothing
 * else was tried, no visible signal), now FALSE (falls back to IndexedDB, and a genuine page-reload path
 * restores the edit from there).
 *
 * Reproduces the OVERFLOW deterministically (real op-log commit, real db bytes, real IndexedDB write/read —
 * only the localStorage.setItem FAILURE itself is forced, standing in for the real multi-MB Terminal export
 * hitting the browser's real quota ceiling — building an actual multi-MB db here would mean a slow real
 * Terminal open just to exercise the exact same catch-block code path _save() already has for ANY setItem
 * failure, quota or otherwise) — no synthetic geometry, no invented op data, just a forced localStorage error.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-AUTOSAVE-IDB-FALLBACK', async (t) => {
  await t.pg.evaluate(async () => {
    await window.Bonsai.oplog.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 1, h: 1 }, dir: [0, 0, 2.5] } });
  });
  const before = await t.pg.evaluate(() => window.Bonsai.oplog.length);
  t.assert('P0-SETUP a real signed op committed to the scratch model', before > 0, 'len=' + before);

  const idbResult = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    const key = O._KEY;
    localStorage.removeItem(key);           // make sure there's no stale copy to confuse the restore precedence
    const origSet = localStorage.setItem.bind(localStorage);
    // Force the exact failure _save()'s catch block handles — QuotaExceededError, standing in for the real
    // Terminal-scale overflow (same catch path either way; forcing it here keeps this witness fast/deterministic).
    localStorage.setItem = () => { throw new DOMException('simulated quota exceeded', 'QuotaExceededError'); };
    let saveSettled = false;
    try {
      O._save();                            // the REAL autosave call-site (not a hand-rolled substitute)
      // _save()'s IDB fallback path is async (fire-and-forget from _save()'s own perspective) — wait for it.
      await new Promise((resolve) => { const check = () => { setTimeout(resolve, 400); }; check(); });
      saveSettled = true;
    } finally { localStorage.setItem = origSet; }
    const lsHasKey = !!localStorage.getItem(key);
    const idbBytes = await O._idbGet(key);
    return { saveSettled, lsHasKey, idbLen: idbBytes ? idbBytes.length : 0 };
  });
  t.assert('P1 IDB fallback WRITE actually happened (bytes landed in IndexedDB via the real _save() call, not silently dropped)',
    idbResult.idbLen > 0, JSON.stringify(idbResult));
  t.assert('P1b localStorage genuinely has NO copy (this really is the fallback path, not a lucky localStorage success)',
    idbResult.lsHasKey === false, JSON.stringify(idbResult));

  const fixLog = t.slog.filter(l => /^§OPLOG §AUTOSAVE_FIX path=idb_fallback/.test(l)).pop() || '';
  t.assert('P2 §AUTOSAVE_FIX path=idb_fallback logged with a real byte count', /bytes=\d+/.test(fixLog), 'fixLog="' + fixLog + '"');

  // "Reload": drop the in-memory db exactly like a real page reload would, then re-run the SAME restore path
  // (_ensureDb) — round-trip proof the edit actually comes back, not just "the IDB write succeeded".
  const after = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    if (O.db) { try { O.db.close(); } catch (e) {} }
    O.db = null; O._opsCache = null;
    await O._ensureDb();
    return { len: O.length };
  });
  const restoreLog = t.slog.filter(l => /^§OPLOG restored saved model/.test(l)).pop() || '';
  const reloadRestoreLog = t.slog.filter(l => /^§OPLOG §AUTOSAVE_FIX path=idb_fallback bytes=\d+ reload_restore=true/.test(l)).pop() || '';
  console.log('  §AUTOSAVE_FIX_WITNESS before=' + before + ' after=' + after.len);
  t.assert('P3 RELOAD genuinely restores the edit FROM IndexedDB (op-log length matches pre-reload — round-trip proof, not just a successful write)',
    after.len === before, JSON.stringify({ before, after }));
  t.assert('P4 restore log confirms source=idb', /source=idb/.test(restoreLog), 'restoreLog="' + restoreLog + '"');
  t.assert('P5 §AUTOSAVE_FIX ... reload_restore=true logged (the exact tag the fix spec asks for)', !!reloadRestoreLog, 'reloadRestoreLog="' + reloadRestoreLog + '"');
}, { width: 900, height: 700, dpr: 1 });
