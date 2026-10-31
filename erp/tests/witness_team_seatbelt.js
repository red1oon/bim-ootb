#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SEATBELT (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §48.13). READ THE LOG after every run: every verdict is a §SB line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: the Seatbelt must say ADVISE for each real pre-flight defect (S1-S9, one control per row), must never claim CLEAR when it judged nothing,
// and must never block: no BLOCK status exists, a DocAction under ADVISE is only LOGGED (owner 2026-10-30: advisory + logged override; twin rule — Process unchanged).
//   B1 clean state all OK · B2 each S1-S9 turns ADVISE on a state with exactly that defect (9 controls) · B3 unpaired = INCONCLUSIVE, never CLEAR · B4 no BLOCK anywhere, noteCommit
//   returns nothing · B5 DocAction under ADVISE logs the override, under CLEAR logs nothing, a non-DocAction logs nothing · B6 export = terms-v1 kind seatbelt
//   MUTANTS (--mutants): s4ok (refused never advised) · s9ok (numbering always OK) · nolog (override never logged) — each must turn >= 1 row red; a crash is not a kill.
// The real-page arm is witness_team_so §TEAM-SEATBELT (paired devices, real counters).
'use strict';
var fs = require('fs'), path = require('path'), Module = require('module'), cp = require('child_process');
var MUT = { s4ok: ["R.push(row('S4', 'refused on my trail', rn === 0,", "R.push(row('S4', 'refused on my trail', true,"],
  s9ok: ["var dn = st.docno || {}, dOk = !!dn.bound && !!dn.userValue && !(dn.sharedValue > 0);", "var dn = st.docno || {}, dOk = true;"],
  nolog: ["if (!m || m.verdict !== 'ADVISE' || !op || op.op_type !== 'SET_STATUS') return;", "return;"] };
if (process.env.MUTATE) { var mu = MUT[process.env.MUTATE], js0 = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, fn) { if (mu && path.basename(fn) === 'team_seatbelt.js') { var src = fs.readFileSync(fn, 'utf8');
    if (src.indexOf(mu[0]) < 0) { console.log('§SB MUTANT-NOT-APPLIED ' + process.env.MUTATE); process.exit(3); } console.log('§SB MUTANT-APPLIED ' + process.env.MUTATE); return m._compile(src.replace(mu[0], mu[1]), fn); } return js0(m, fn); }; }
if (process.argv.indexOf('--mutants') >= 0) {
  var kills = 0; Object.keys(MUT).forEach(function (k) {
    var r = cp.spawnSync('node', [__filename], { env: Object.assign({}, process.env, { MUTATE: k }), encoding: 'utf8' }), out = (r.stdout || '') + (r.stderr || '');
    var applied = out.indexOf('§SB MUTANT-APPLIED ' + k) >= 0, crash = /§SB_VERDICT FAIL crash/.test(out), red = (out.match(/§SB FAIL B\w+/g) || []).map(function (x) { return x.split(' ')[2]; });
    var kill = r.status === 1 && applied && !crash && red.length > 0; if (kill) kills++;
    console.log('§SB-MUTANT ' + k + ' ' + (kill ? 'KILLED' : 'SURVIVED') + ' exit=' + r.status + ' applied=' + applied + ' crash=' + crash + ' red=' + red.join(','));
  });
  console.log('§SB_MUTANTS killed=' + kills + '/' + Object.keys(MUT).length); process.exit(kills === Object.keys(MUT).length ? 0 : 1);
}
try {
  var SB = require(path.join(__dirname, '..', 'team_seatbelt.js')), judged = 0, fails = 0;
  var ck = function (id, issue, ok, d) { judged++; if (!ok) fails++; console.log('§SB ' + (ok ? 'PASS' : 'FAIL') + ' ' + id + ' - ' + issue + (d ? ' :: ' + d : '')); };
  var NOW = Date.parse('2026-10-31T10:00:00Z');
  function clean() { return { paired: true, enrolled: true, base: 'ok', now: NOW, lastVisitAt: NOW - 60000, visit_ms: 900000, unsent: 0, refusedReasons: {}, gaps: 0, parked: {}, conflicts: 0, localOnly: 0, docno: { bound: true, userValue: 'gardenad', sharedValue: 0 } }; }
  var m0 = SB.model(clean());
  ck('B1', 'a clean paired state is CLEAR with all 9 rows OK (the baseline the controls flip)', m0.verdict === 'CLEAR' && m0.rows.length === 9 && m0.rows.every(function (r) { return r.status === 'OK'; }), m0.rows.map(function (r) { return r.id + '=' + r.status; }).join(' '));
  var DEF = { S1: function (s) { s.base = 'mismatch'; }, S2: function (s) { s.enrolled = false; }, S3: function (s) { s.unsent = 3; s.lastVisitAt = NOW - 3600000; },
    S4: function (s) { s.refusedReasons = { 'docno-station': 1, 'not-executor': 2 }; }, S5: function (s) { s.gaps = 2; }, S6: function (s) { s.parked = { 'needs-upgrade': 1 }; },
    S7: function (s) { s.conflicts = 1; }, S8: function (s) { s.localOnly = 4; }, S9: function (s) { s.docno = { bound: true, userValue: 'shopday1', sharedValue: 1 }; } };
  var b2 = Object.keys(DEF).map(function (id) { var s = clean(); DEF[id](s); var m = SB.model(s), adv = m.rows.filter(function (r) { return r.status === 'ADVISE'; }).map(function (r) { return r.id; });
    var ok = m.verdict === 'ADVISE' && adv.length === 1 && adv[0] === id; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + id + ' defect -> advise=[' + adv.join(',') + '] ' + (m.rows.filter(function (r) { return r.id === id; })[0] || {}).why); return ok; });
  ck('B2', 'each of S1-S9 turns ADVISE on a state with exactly that defect, and only that row (9 controls)', b2.every(Boolean), b2.filter(Boolean).length + '/9');
  var s3b = clean(); s3b.unsent = 3; var m3b = SB.model(s3b);
  ck('B2b', 'unsent changes within the Visit contract are not advised (S3 judges the contract, not the count)', m3b.verdict === 'CLEAR', 'unsent=3 last Visit 1 min ago -> ' + m3b.verdict);
  var mu = SB.model({ paired: false }), mn = SB.model(null);
  ck('B3', 'an unpaired or missing state is INCONCLUSIVE with no rows (never CLEAR: nothing was judged)', mu.verdict === 'INCONCLUSIVE' && mn.verdict === 'INCONCLUSIVE' && mu.rows.length === 0, mu.verdict + '/' + mn.verdict);
  var all = SB.model(Object.keys(DEF).reduce(function (s, id) { DEF[id](s); return s; }, clean())), src = fs.readFileSync(path.join(__dirname, '..', 'team_seatbelt.js'), 'utf8');
  var ret = SB.noteCommit(all, { op_type: 'SET_STATUS', from: 'DR', to: 'CO', table: 'c_order' }, function () {});
  ck('B4', 'nothing can block: every row is OK or ADVISE even with all 9 defects, no BLOCK status in the module, noteCommit returns nothing to cancel on', all.rows.every(function (r) { return r.status === 'OK' || r.status === 'ADVISE'; }) && src.indexOf("'BLOCK'") < 0 && ret === undefined,
    'statuses=' + all.rows.map(function (r) { return r.status; }).join(',') + ' return=' + ret);
  var logs = [], L = function (x) { logs.push(x); }, before = SB.overrides().length;
  SB.noteCommit(SB.model(clean()), { op_type: 'SET_STATUS', from: 'DR', to: 'CO', table: 'c_order' }, L);
  SB.noteCommit(all, { op_type: 'CRUD_UPDATE', table: 'c_order' }, L);
  SB.noteCommit(all, { op_type: 'SET_STATUS', from: 'DR', to: 'CO', table: 'c_order' }, L);
  console.log('   override lines: ' + JSON.stringify(logs));
  ck('B5', 'a DocAction under ADVISE logs §TEAM_SEATBELT_OVERRIDE with the advised rows; under CLEAR, or a non-DocAction, nothing is logged', logs.length === 1 && /§TEAM_SEATBELT_OVERRIDE action=DR→CO table=c_order advise=\[S1,S2,S3,S4,S5,S6,S7,S8,S9\]/.test(logs[0]) && SB.overrides().length >= before + 1, 'lines=' + logs.length);
  var ex = SB.exportJson(all);
  ck('B6', 'the export is terms-v1 kind seatbelt with the rows and the overrides (shared schema with the runner)', ex.schema === 'terms-v1' && ex.kind === 'seatbelt' && ex.rows.length === 9 && ex.overrides.length >= 1, ex.schema + '/' + ex.kind + ' rows=' + ex.rows.length + ' overrides=' + ex.overrides.length);
  console.log('§SB_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails);
  process.exit(fails ? 1 : 0);
} catch (e) { console.log('§SB_VERDICT FAIL crash ' + (e && e.stack || e)); process.exit(1); }
