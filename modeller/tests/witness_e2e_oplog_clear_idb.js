#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-OPLOG-CLEAR-IDB scope (read the log after every run)
 * SCOPE: bonsai_oplog.js clear() vs the §AUTOSAVE_FIX IndexedDB fallback store
 * (SCALE_CHECK_TERMINAL_FINDINGS_2026-07-05.md Finding 4 introduced the fallback; this witness covers its
 * missing DELETE leg). clear() removed ONLY localStorage[this._KEY] — it never purged the 'oplog_fallback'
 * entry in the 'bim_ootb_cache' IndexedDB database, even though _loadBytesEither()'s precedence comment
 * promises "only clear() shrinks it, which empties both keys together".
 *
 * ISSUE THIS PROVES/DISPROVES (leg 1, K1-K6): "clearing a model whose autosave overflowed into the IDB
 * fallback silently resurrects the cleared edits on the next open of the same key" — was TRUE (localStorage
 * empty → restore precedence ALWAYS trusts a found IDB entry, hit by a real Terminal-scale user), now FALSE
 * (clear() also fires _idbDelete(this._KEY); the entry is measurably gone from IndexedDB after clear()).
 *
 * ISSUE THIS PROVES/DISPROVES (leg 2, K7-K9 — Finding 4 UPDATE 2026-07-07, sticky fallback): "_save()
 * re-attempts the doomed synchronous localStorage.setItem on EVERY save after one quota overflow, throwing+
 * catching a real QuotaExceededError per edit for the rest of the session (the repeated console-error spam a
 * real user saw twice in one session)" — was TRUE (no memory of the prior failure), now FALSE (_useIdbOnly
 * flips on the first failure; the second _save() measurably never calls localStorage.setItem again — counted
 * by a spy wrapper — and goes straight to the same _idbPut fallback path).
 *
 * Real browser, real IndexedDB, real op-log commit for the bytes. The one engineered step: the prior
 * overflow save is simulated by calling the REAL O._idbPut(key, realExportedBytes) directly (the exact
 * write _save()'s quota-failure branch performs — see witness_e2e_autosave_idb_fallback.js, which already
 * proves that branch end-to-end) instead of building an actual multi-MB Terminal log just to overflow the
 * quota. The delete claim is then asserted by querying IndexedDB RAW (indexedDB.open → store.get), NOT via
 * the module's own _idbGet — an independent oracle, not the code under test grading itself.
 *
 * CLAIMS:
 *   K1 SETUP     — a real signed op committed; localStorage holds the key (the normal-path save happened).
 *   K2 PRECOND   — the IDB fallback entry EXISTS before clear() (raw query; real exported db bytes) — the
 *                  exact stale-copy state the bug resurrects from. A second key (mo_OtherBuilding) is also
 *                  planted to prove K6.
 *   K3 CLEAR     — window.Bonsai.oplog.clear() runs (the same call bClear.onclick and 20+ other sites make).
 *   K4 LS-REGR   — localStorage.getItem(key) is null after clear() (the pre-existing behaviour, unbroken).
 *   K5 IDB-GONE  — raw IndexedDB get(key) → undefined after clear() (THE fixed claim, asserted directly).
 *   K6 SCOPED    — mo_OtherBuilding's entry SURVIVES (clear() deletes its own key, not the whole store —
 *                  another building's overflow save must never be collateral damage).
 *   K7 STICKY-1  — the FIRST quota-failed _save() attempts localStorage.setItem exactly once (spy count)
 *                  and flips _useIdbOnly to true.
 *   K8 STICKY-2  — a SECOND _save() in the same session NEVER touches localStorage.setItem again (spy count
 *                  unchanged) and _useIdbOnly stays true — the doomed re-attempt spam is gone.
 *   K9 STICKY-IDB— the sticky-path save still genuinely lands in IndexedDB (raw query, real bytes) — the
 *                  skip is a shortcut TO the fallback, not a silently-dropped save.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-E2E-OPLOG-CLEAR-IDB', async (t) => {
  // K1 — one real signed op on the scratch model; _emit()→_save() persists it to localStorage.
  const setup = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 1, h: 1 }, dir: [0, 0, 2.5] } });
    return { len: O.length, key: O._KEY, lsHasKey: !!localStorage.getItem(O._KEY) };
  });
  t.assert('K1 SETUP a real signed op committed and autosaved to localStorage', setup.len > 0 && setup.lsHasKey, JSON.stringify(setup));

  // Independent oracle: RAW IndexedDB read (not O._idbGet — the module must not grade itself).
  await t.pg.evaluate(() => {
    window.__rawIdbGet = (key) => new Promise((resolve) => {
      const rq = indexedDB.open('bim_ootb_cache');
      rq.onsuccess = () => {
        const idb = rq.result;
        if (!idb.objectStoreNames.contains('oplog_fallback')) { resolve({ storeExists: false, present: false, len: 0 }); return; }
        const g = idb.transaction('oplog_fallback', 'readonly').objectStore('oplog_fallback').get(key);
        g.onsuccess = () => resolve({ storeExists: true, present: g.result !== undefined, len: g.result ? g.result.length : 0 });
        g.onerror = () => resolve({ storeExists: true, present: false, err: true });
      };
      rq.onerror = () => resolve({ err: true, present: false });
    });
  });

  // K2 — simulate the prior overflow save with the REAL _idbPut and the REAL exported db bytes; plant a
  // second building's entry too (K6's scoped-delete proof).
  const pre = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    const bytes = O.db.export();                       // real signed op-log bytes, not invented payload
    await O._idbPut(O._KEY, bytes);                    // the exact write _save()'s quota-failure branch makes
    await O._idbPut('mo_OtherBuilding', bytes);        // another building's fallback save (must survive clear)
    return { own: await window.__rawIdbGet(O._KEY), other: await window.__rawIdbGet('mo_OtherBuilding') };
  });
  t.assert('K2 PRECOND IDB fallback entry exists BEFORE clear() (raw query — the stale copy the bug resurrects from)',
    pre.own.present && pre.own.len > 0 && pre.other.present, JSON.stringify(pre));

  // K3 — the real clear() call (same call the #b-clear button and every "open different resident" flow makes),
  // then wait for the fire-and-forget _idbDelete to complete (same 400ms settle the autosave witness uses).
  const cleared = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    const key = O._KEY;
    O.clear();
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { key, len: O.length, ls: localStorage.getItem(key), own: await window.__rawIdbGet(key), other: await window.__rawIdbGet('mo_OtherBuilding') };
  });
  t.assert('K3 CLEAR ran and reset the in-memory log', cleared.len === 0, 'len=' + cleared.len);
  t.assert('K4 LS-REGR localStorage key removed by clear() (pre-existing behaviour intact)', cleared.ls === null, 'ls=' + JSON.stringify(cleared.ls));
  t.assert('K5 IDB-GONE raw IndexedDB get(key) is undefined after clear() — the fallback entry is PURGED, nothing left to resurrect',
    cleared.own.storeExists === true && cleared.own.present === false, JSON.stringify(cleared.own));
  t.assert('K6 SCOPED another building\'s fallback entry (mo_OtherBuilding) survives — clear() deletes its own key only',
    cleared.other.present === true && cleared.other.len > 0, JSON.stringify(cleared.other));
  console.log('  §OPLOG_CLEAR_IDB_WITNESS key=' + cleared.key + ' ls=' + JSON.stringify(cleared.ls) + ' idbPresent=' + cleared.own.present + ' otherPresent=' + cleared.other.present);

  // ── Leg 2: sticky IDB-only autosave (Finding 4 UPDATE 2026-07-07) ────────────────────────────────────────
  // K7-K9 — commit a fresh real op (clear() above left the log empty; commit re-creates the db), then force
  // ONE quota failure via a COUNTING setItem spy (the same simulated-QuotaExceededError idiom
  // witness_e2e_autosave_idb_fallback.js already uses) and prove the second _save() never re-attempts setItem.
  const sticky = await t.pg.evaluate(async () => {
    const O = window.Bonsai.oplog;
    await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 2, h: 1 }, dir: [0, 0, 1.5] } });
    const flagBefore = O._useIdbOnly;
    const origSet = localStorage.setItem.bind(localStorage);
    let setItemCalls = 0;
    localStorage.setItem = () => { setItemCalls++; throw new DOMException('simulated quota exceeded', 'QuotaExceededError'); };
    let callsAfterFirst, flagAfterFirst, callsAfterSecond, flagAfterSecond;
    try {
      O._save();                                              // 1st save: attempts setItem → fails → flips sticky
      callsAfterFirst = setItemCalls; flagAfterFirst = O._useIdbOnly;
      await new Promise((resolve) => setTimeout(resolve, 400));
      O._save();                                              // 2nd save: must SKIP setItem entirely
      callsAfterSecond = setItemCalls; flagAfterSecond = O._useIdbOnly;
      await new Promise((resolve) => setTimeout(resolve, 400));
    } finally { localStorage.setItem = origSet; }
    const idb = await window.__rawIdbGet(O._KEY);
    return { flagBefore, callsAfterFirst, flagAfterFirst, callsAfterSecond, flagAfterSecond, idb };
  });
  t.assert('K7 STICKY-1 first quota failure attempted setItem exactly once and flipped _useIdbOnly false→true',
    sticky.flagBefore === false && sticky.callsAfterFirst === 1 && sticky.flagAfterFirst === true, JSON.stringify(sticky));
  t.assert('K8 STICKY-2 second _save() NEVER called localStorage.setItem again (spy count unchanged) — no repeated doomed attempt',
    sticky.callsAfterSecond === 1 && sticky.flagAfterSecond === true, 'calls=' + sticky.callsAfterFirst + '→' + sticky.callsAfterSecond);
  t.assert('K9 STICKY-IDB the sticky-path save genuinely landed in IndexedDB (raw query) — skipped setItem is a shortcut TO the fallback, not a dropped save',
    sticky.idb.present === true && sticky.idb.len > 0, JSON.stringify(sticky.idb));
  console.log('  §OPLOG_STICKY_WITNESS setItemCalls first=' + sticky.callsAfterFirst + ' second=' + sticky.callsAfterSecond + ' useIdbOnly=' + sticky.flagAfterSecond + ' idbLen=' + sticky.idb.len);
}, { width: 900, height: 700, dpr: 1 });
