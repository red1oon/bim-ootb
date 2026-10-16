#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DICT-CENSUS (bim-compiler prompts/ERP_DEPTH_FILM.md §DICT-CENSUS stage 1). READ THE LOG: §DC lines; exit code is not evidence.
// THE ISSUE: is every legacy AD_/PA_/R_ dictionary table present in the seed AS LOADED (ad_seed.db + patches applied statement by statement) with the same row count for client 0 and 11?
//   Denominator = every such table that has rows for client 0/11 on the pilot. INCONCLUSIVE if the legacy dump is missing or nothing judged.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var LEG = process.env.DC_LEGACY || '/home/red1/bim-compiler/scripts/bridge/out/dict_census_legacy.json', log = console.log;
(async function () {
  if (!fs.existsSync(LEG)) { log('§DC-VERDICT INCONCLUSIVE legacy dump missing: ' + LEG); process.exit(3); }
  var L = JSON.parse(fs.readFileSync(LEG, 'utf8')), SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) }), db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  var ok = 0, bad = 0;
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); ok++; } catch (e) { bad++; } });
  log('§DC seed-as-loaded: patch statements ok=' + ok + ' failed=' + bad);
  var RUNTIME = /^(ad_changelog|ad_session|ad_pinstance|ad_pinstance_para|ad_pinstance_log|ad_issue|ad_attachment|ad_migrationscript|ad_package_imp.*|ad_alertprocessorlog|ad_schedulerlog|ad_workflowprocessorlog|ad_sequence_no|ad_note|ad_recentitem)$/, cls = function (t) { return RUNTIME.test(t) ? 'RUNTIME' : /_trl$/.test(t) ? 'TRANSLATION' : 'DICTIONARY'; };
  // tenant/harness-created roles exist on ONE side only (the twin's System-overlay role 1000000, the pilot's 'Bridge System WS' 1200001): their access rows are not shipped dictionary -> judge per-role tables over the roles BOTH sides have
  var seedRoles = db.exec("SELECT ad_role_id FROM ad_role WHERE ad_client_id IN (0,11)")[0].values.map(function (r) { return String(r[0]); }), common = (L.__roles || []).map(String).filter(function (r) { return seedRoles.indexOf(r) >= 0; });
  log('§DC roles: legacy=' + (L.__roles || []).length + ' seed=' + seedRoles.length + ' common=' + common.length + ' exempt(one-side-only)=' + ((L.__roles || []).length + seedRoles.length - 2 * common.length));
  var judged = 0, match = 0, diff = [], absent = [], tally = {};
  Object.keys(L).sort().forEach(function (t) {
    if (t.indexOf('__') === 0) return;
    var by = L[t].byClient, leg = (by['0'] || 0) + (by['11'] || 0) + (by['none'] || 0), perRole = L[t].byRole && Object.keys(L[t].byRole).length;
    if (perRole) leg = common.reduce(function (a, r) { return a + (L[t].byRole[r] || 0); }, 0);   // only roles both sides have
    if (!leg) return; judged++;
    var ti = db.exec("SELECT lower(name) FROM pragma_table_info('" + t + "')"), cols = ti.length ? ti[0].values.map(function (r) { return r[0]; }) : null;
    if (!cols) { var c2 = cls(t); tally[c2] = tally[c2] || { ok: 0, bad: 0 }; tally[c2].bad++; absent.push(c2 + ' ' + t + ' legacy=' + leg); return; }
    var q = perRole && cols.indexOf('ad_role_id') >= 0 ? 'SELECT count(*) FROM ' + t + ' WHERE ad_client_id IN (0,11) AND ad_role_id IN (' + common.join(',') + ')' : cols.indexOf('ad_client_id') >= 0 ? 'SELECT count(*) FROM ' + t + ' WHERE ad_client_id IN (0,11)' : 'SELECT count(*) FROM ' + t, n = db.exec(q)[0].values[0][0];
    var c = cls(t); tally[c] = tally[c] || { ok: 0, bad: 0 }; if (n === leg) { match++; tally[c].ok++; } else { diff.push(c + ' ' + t + ' legacy=' + leg + ' seed=' + n); tally[c].bad++; }
  });
  diff.forEach(function (d) { log('  §DC-TABLE COUNT-DIFF ' + d); }); absent.forEach(function (a) { log('  §DC-TABLE ABSENT-IN-SEED ' + a); });
  Object.keys(tally).forEach(function (k) { log('§DC-CLASS ' + k + ' match=' + tally[k].ok + ' gap=' + tally[k].bad); });
  var v = !judged ? 'INCONCLUSIVE' : (diff.length || absent.length) ? 'FAIL' : 'PASS';
  log('§DC-VERDICT ' + v + ' judged=' + judged + ' match=' + match + ' countDiff=' + diff.length + ' absent=' + absent.length); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { log('§DC-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
