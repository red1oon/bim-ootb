// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — capex/tools/migration_apply.js (moved OUT of erp/ core, §5.19: EXTENSION-LAYER LAW): legacy iDempiere migration scripts (migration/iD13/postgresql/<yyyymmddHHMM>_<ticket>.sql) on the SQLite twin. Implementing bim-ootb
//   prompts/CAPEX_DASHBOARD.md §5.14 (release model: ONE artefact) + §5.19 (the RUN_SyncDB rule, for the node witnesses that build a twin DB; the BROWSER twin gets the same rows through the plugin bundle capex/plugin/capex_dashboard.mjs) — Witnesses: W-PA-ENGINE (M), W-MIG-SYNC.
// Every statement goes through the kernel's ONE dialect choke point (ad_callout.js convertSql). Statements are split on ';' outside quotes and '--' comments, as legacy's own script files are
//   written ("Log Migration Script" output).
// Legacy mechanism ported (~/idempiere-dev-setup/idempiere):
//   - SyncDB.sh (org.adempiere.server-feature/utils.unix/postgresql/SyncDB.sh:50-90): pending = file names NOT in AD_MigrationScript, applied in NAME ORDER; an erroring file STOPS the run
//     (:79-84, "Stop processing to allow user to fix the problem"); when anything was applied the post-migration processes run (:91-99) — here only update_sequences, for the tables the run wrote.
//   - adempiere.register_migration_script(p_script) (pg_get_functiondef on the pilot, 2026-11-03): not registered → INSERT AD_MigrationScript (IsApply 'Y', ScriptRoll 'N', Status 'CO',
//     ProjectName 'iDempiere', ReleaseNo from AD_System, Name, FileName 'postgresql/'||name, client 0, org 0, createdby 100); registered → Description || ' reapplied'.
//     ⚠ the twin has no AD_System: ReleaseNo is NULL and AD_System.LastMigrationScriptApplied is not kept (§MIG_REGISTER logs it) — named, not faked.
//   - 03_update_sequences.sql (migration/processes_post_migration/postgresql): CurrentNext = MAX(<Table>_ID ≥ 1000000) + 1, else 1000000 — for the tables the run inserted into.
// Read the log: §MIG_SYNC registered=N pending=N applied=N stopped=… · §MIG_APPLY file=… statements ok failed · §MIG_STMT_FAIL (each failure, with its error) · §MIG_SEQ.
(function (root) {
  'use strict';
  // the twin's AD_MigrationScript: legacy's columns (information_schema on the pilot, 2026-11-03), typed the way erp/patches/build_ad_seed_patch.sh types extracted tables (numeric → NUMERIC, else TEXT)
  var REG_DDL = 'CREATE TABLE IF NOT EXISTS ad_migrationscript (ad_client_id NUMERIC, ad_migrationscript_id NUMERIC PRIMARY KEY, ad_org_id NUMERIC, created TEXT, createdby NUMERIC, description TEXT, ' +
    'developername TEXT, isactive TEXT, name TEXT, projectname TEXT, reference TEXT, releaseno TEXT, scriptroll TEXT, status TEXT, url TEXT, updated TEXT, updatedby NUMERIC, isapply TEXT, filename TEXT, ' +
    'script TEXT, ad_migrationscript_uu TEXT)';
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
  function uuid() { var h = '0123456789abcdef', s = ''; for (var i = 0; i < 32; i++) s += h[Math.floor(Math.random() * 16)]; return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-' + '89ab'[Math.floor(Math.random() * 4)] + s.slice(17, 20) + '-' + s.slice(20, 32); }
  function register(o, name, now) {   // adempiere.register_migration_script
    var r = o.q('SELECT MAX(ad_migrationscript_id) AS id FROM ad_migrationscript WHERE name=?', [name])[0];
    if (r && r.id != null) { o.run("UPDATE ad_migrationscript SET updated=?, description=COALESCE(description,' ')||' reapplied' WHERE ad_migrationscript_id=?", [now, r.id]); return 'reapplied'; }
    var nx = o.q('SELECT COALESCE(MAX(ad_migrationscript_id), 0) + 1 AS n FROM ad_migrationscript')[0].n;   // nextidfunc(53081) — the twin has no system sequence row for it: next = MAX+1 (named)
    o.run("INSERT INTO ad_migrationscript (isapply,scriptroll,ad_migrationscript_uu,status,projectname,releaseno,name,filename,ad_client_id,ad_org_id,created,createdby,updated,updatedby,isactive,ad_migrationscript_id) " +
      "VALUES ('Y','N',?,'CO','iDempiere',NULL,?,?,0,0,?,100,?,100,'Y',?)", [uuid(), name, 'postgresql/' + name, now, now, nx]);
    return 'registered';
  }
  // apply(text, {file, run(sql[,params]), q(sql,params)→rows (needed to register), has(table) → bool, convertSql, now, log})
  function apply(text, o) {
    var log = o.log || function () {}, conv = o.convertSql || function (s) { return s; }, sts = split(text), ok = 0, bad = 0, skipped = 0, tables = {};
    sts.forEach(function (st) {
      var reg = /^SELECT\s+register_migration_script\s*\(\s*'([^']+)'\s*\)/i.exec(st);
      if (reg) {
        if (!o.has('ad_migrationscript') || !o.q) { skipped++; log('§MIG_REGISTER_SKIPPED file=' + o.file + ' reason=no AD_MigrationScript table in the twin'); return; }
        try { var how = register(o, reg[1], o.now || ''); ok++; log('§MIG_REGISTER file=' + reg[1] + ' ' + how + ' releaseNo=NULL (no AD_System in the twin)'); } catch (e) { bad++; log('§MIG_STMT_FAIL file=' + o.file + ' err=' + JSON.stringify(String(e && e.message || e)) + ' sql=register_migration_script'); }
        return;
      }
      var ins = /^INSERT\s+INTO\s+(\w+)/i.exec(st); if (ins) tables[ins[1]] = 1;
      try { o.run(conv(st)); ok++; } catch (e) { bad++; log('§MIG_STMT_FAIL file=' + o.file + ' err=' + JSON.stringify(String(e && e.message || e)) + ' sql=' + JSON.stringify(st.slice(0, 160))); }
    });
    log('§MIG_APPLY file=' + o.file + ' statements=' + sts.length + ' ok=' + ok + ' failed=' + bad + ' skipped=' + skipped);
    return { statements: sts.length, ok: ok, failed: bad, skipped: skipped, tables: Object.keys(tables) };
  }
  // update_sequences for the tables written (03_update_sequences.sql: user range — MAX(id ≥ 1000000)+1, else 1000000)
  function updateSequences(o, tables) {
    tables.forEach(function (t) {
      var id = t + '_ID', m;
      try { m = o.q('SELECT MAX(' + id + ') AS m FROM ' + t + ' WHERE ' + id + ' >= 1000000')[0]; } catch (e) { return; }
      var next = m && m.m != null ? Number(m.m) + 1 : 1000000;
      var row; try { row = o.q("SELECT COUNT(*) AS n FROM ad_sequence WHERE lower(name)=lower(?) AND istableid='Y'", [t])[0]; } catch (e) { row = null; }
      if (!row || !Number(row.n)) { o.log && o.log('§MIG_SEQ table=' + t + ' no AD_Sequence table-ID row in the twin (keys are allocated at commit) — nothing to update'); return; }
      try { o.run("UPDATE ad_sequence SET currentnext=? WHERE lower(name)=lower(?) AND istableid='Y'", [next, t]); o.log && o.log('§MIG_SEQ table=' + t + ' currentnext=' + next); } catch (e) { o.log && o.log('§MIG_SEQ table=' + t + ' skipped ' + e.message); }
    });
  }
  // ensureAll(o + {files:[{name, text}]}) — SyncDB.sh: register table ensured, pending (by name, sorted) applied, stop at the first erroring file, then update_sequences.
  function ensureAll(o) {
    var log = o.log || function () {};
    o.run(REG_DDL);
    var done = {}; o.q('SELECT name FROM ad_migrationscript').forEach(function (r) { done[r.name] = 1; });
    var files = o.files.slice().sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }), pending = files.filter(function (f) { return !done[f.name]; }), applied = 0, stopped = null, tables = {};
    for (var i = 0; i < pending.length; i++) {
      var r = apply(pending[i].text, Object.assign({}, o, { file: pending[i].name, has: function () { return true; } }));
      r.tables.forEach(function (t) { tables[t] = 1; }); applied++;
      if (r.failed) { stopped = pending[i].name; break; }
    }
    if (applied) updateSequences(Object.assign({ log: log }, o), Object.keys(tables));
    log('§MIG_SYNC files=' + files.length + ' registered=' + Object.keys(done).length + ' pending=' + pending.length + ' applied=' + applied + (stopped ? ' STOPPED_AT=' + stopped : '') + (pending.length ? '' : ' (already in sync)'));
    return { files: files.length, pending: pending.length, applied: applied, stopped: stopped };
  }
  var api = { apply: apply, split: split, ensureAll: ensureAll, REG_DDL: REG_DDL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MigrationApply = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
