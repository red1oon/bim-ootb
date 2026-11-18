// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-CTXHELP-OVERLAY (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.16 C1): legacy's Context Help container (AD_CtxHelp, AD_CtxHelpMsg, AD_CtxHelpMsg_Trl,
//   AD_CtxHelpSuggestion: window 200034 "Context Help", 200088 "Context Help Suggestion") had dictionary rows in the seed but no physical table (the AD_CtxHelp_ID link columns on
//   AD_Tab / AD_Process / AD_Form / AD_InfoWindow / AD_Workflow / AD_WF_Node are already there, seed + hashed patch). An idempotent boot OVERLAY (the ad_docvalue_overlay.js pattern), outside the hashed patches, so the Team BASE hash does not move. Rows: ad_ctxhelp_rows.js, generated from the reference DB
//   (patches/build_ctxhelp_overlay.py). Legacy's tables, columns and codes unchanged (owner, §19.15: "same shape as legacy").
(function (global) {
  'use strict';
  function log(m) { try { console.log(m); } catch (e) {} }
  function data() { return global.AD_CTXHELP_ROWS || (typeof module !== 'undefined' && module.exports ? require('./ad_ctxhelp_rows.js') : null); }
  function colsOf(db, t) { var r = db.exec('PRAGMA table_info("' + t + '")'); return r.length ? r[0].values.map(function (v) { return String(v[1]).toLowerCase(); }) : []; }
  // ensure(db) - a sql.js Database. Returns { tables, rows, skipped, ms }: tables created, rows inserted (INSERT OR IGNORE on the key, so a tenant's row is never overwritten).
  function ensure(db) {
    var t0 = Date.now(), D = data(), made = 0, ok = 0, skip = 0;
    if (!D) { log('§CTXHELP_OVERLAY ensure SKIPPED no ad_ctxhelp_rows.js'); return { tables: 0, rows: 0, skipped: 0, ms: 0 }; }
    D.tables.forEach(function (T) { if (!colsOf(db, T.t).length) { db.run(T.ddl); made++; } });
    D.rows.forEach(function (st) { try { db.run(st); ok += db.getRowsModified(); } catch (e) { skip++; } });
    var out = { tables: made, rows: ok, skipped: skip, ms: Date.now() - t0 };
    log('§CTXHELP_OVERLAY ensure tables=' + made + '/' + D.tables.length + ' rows=' + ok + '/' + D.rows.length + ' skipped=' + skip + ' ms=' + out.ms +
      ' (legacy context help tables; boot overlay, outside the team base hash)');
    return out;
  }
  var API = { ensure: ensure, data: data };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.AdCtxHelpOverlay = API;
})(typeof window !== 'undefined' ? window : globalThis);
