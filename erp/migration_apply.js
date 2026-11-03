// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — migration_apply.js: apply an iDempiere migration script (migration/iD13/postgresql/<yyyymmddHHMM>_<ticket>.sql) to the SQLite twin. Implementing bim-ootb
//   prompts/CAPEX_DASHBOARD.md §5.14 (release model: ONE artefact — the SAME migration script legacy applies is applied here) — Witness: W-PA-ENGINE (step M).
// Every statement goes through the kernel's ONE dialect choke point (ad_callout.js convertSql). Statements are split on ';' at end of line outside quotes, as legacy's
//   own script files are written ("Log Migration Script" output). register_migration_script(<file>) is the legacy PL/pgSQL function (adempiere.register_migration_script): it
//   records the file in AD_MigrationScript — the twin seed has NO AD_MigrationScript table, so the call is NAMED-skipped (§MIG_REGISTER_SKIPPED), never faked.
// Read the log: §MIG_APPLY file=… statements=N ok=N failed=N; any failed statement is printed with its error. A failed statement does not stop the script (psql default without ON_ERROR_STOP).
(function (root) {
  'use strict';
  function split(text) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (!q && c === '-' && text[i + 1] === '-') { var e = text.indexOf('\n', i); i = e < 0 ? text.length : e; cur += '\n'; continue; }
      if (c === "'") q = !q;
      if (!q && c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  // apply(text, {file, run(sql), has(table) → bool, convertSql, log})
  function apply(text, o) {
    var log = o.log || function () {}, conv = o.convertSql || function (s) { return s; }, sts = split(text), ok = 0, bad = 0, skipped = 0;
    sts.forEach(function (st) {
      if (/^SELECT\s+register_migration_script\s*\(/i.test(st)) {
        if (!o.has('ad_migrationscript')) { skipped++; log('§MIG_REGISTER_SKIPPED file=' + o.file + ' reason=no AD_MigrationScript table in the twin'); return; }
      }
      try { o.run(conv(st)); ok++; } catch (e) { bad++; log('§MIG_STMT_FAIL file=' + o.file + ' err=' + JSON.stringify(String(e && e.message || e)) + ' sql=' + JSON.stringify(st.slice(0, 160))); }
    });
    log('§MIG_APPLY file=' + o.file + ' statements=' + sts.length + ' ok=' + ok + ' failed=' + bad + ' skipped=' + skipped);
    return { statements: sts.length, ok: ok, failed: bad, skipped: skipped };
  }
  var api = { apply: apply, split: split };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MigrationApply = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
