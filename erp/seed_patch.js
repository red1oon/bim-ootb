// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// SeedPatch.apply(db, text) - the ONE applier of patches/<seed>.sql (idempiere.html boot). Per statement, best-effort (a failing statement never blocks the boot), then heals duplicates.
// F1 (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §REVIEW-R1R2): the patch is re-applied on EVERY load, also to a persisted db; INSERT OR IGNORE dedups only against a key, so a table
//   the patch seeds with no primary key / unique index (c_conversiontype, ad_message ...) took every row again on each reload (16 System tables doubled) and Import GL Journal then
//   failed with "more than one row returned by a subquery". Generic, no table list: for every table the patch INSERTs into, delete byte-identical duplicate rows (an AD row has a key,
//   so a whole-row duplicate is never data). Also heals an already-duplicated db.
(function (root) {
  'use strict';
  // dedupe(db, {table:1}) - delete byte-identical duplicate rows; returns rows removed. Also used by boot overlays that INSERT OR IGNORE into key-less tables (ad_docvalue_overlay).
  function dedupe(db, tables) {
    var n = 0;
    Object.keys(tables).forEach(function (t) {
      try {
        var info = db.exec('PRAGMA table_info(' + t + ')')[0]; if (!info) return;
        var cl = info.values.map(function (c) { return '"' + c[1] + '"'; }).join(',');
        db.run('DELETE FROM ' + t + ' WHERE rowid NOT IN (SELECT MIN(rowid) FROM ' + t + ' GROUP BY ' + cl + ')'); n += db.getRowsModified();
      } catch (e) { /* a view or a table the patch dropped */ }
    });
    return n;
  }
  function apply(db, text, opts) {
    var r = { ok: 0, fail: 0, chg: 0, dup: 0, tables: {} };
    text.split(/;\s*\n/).forEach(function (st) {
      st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return;
      var m = /^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+["`]?(\w+)/i.exec(st); if (m) r.tables[m[1].toLowerCase()] = 1;
      try { db.run(st); r.ok++; r.chg += db.getRowsModified(); } catch (e) { r.fail++; }
    });
    if (!(opts && opts.noDedup)) r.dup = dedupe(db, r.tables);
    return r;
  }
  var api = { apply: apply, dedupe: dedupe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SeedPatch = api;
})(typeof window !== 'undefined' ? window : this);
