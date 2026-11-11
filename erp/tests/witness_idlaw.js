#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IDLAW (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §IDLAW-SPEC). READ THE LOG after every run: every verdict is a §IDLAW line.
// THE ISSUE it proves/disproves: the page gives every row made through the op log a NEGATIVE synthetic pk (crud_core listTip -opId); a key/FK test written as the Java `get<Col>_ID() > 0` then sees a migrated /
//   session-created row as "no value" (the Payment-Save defect, PR #2869). This witness closes the CLASS: (CENSUS) no bare `> 0` key/FK test is left in erp/ (models, processes, poster, engine, plugins) except the named
//   LEAVE list; (UNIT) ModelLayer.idSet semantics; (CYCLE) the whole migrated-tenant cycle - pay a migrated invoice, a new order -> shipment -> invoice -> payment, a vendor payment (witness_migration_trade) and the
//   Payment Save (witness_migration_paysave) - passes in child processes under WS_ID_LAW=synthetic with books balanced; (MUTANT) the census FAILS on a re-introduced bare test, the trade witness FAILS with a dropped
//   fact leg, the Payment Save FAILS under the old `> 0`. Nothing judged -> INCONCLUSIVE. Command: node erp/tests/witness_idlaw.js 2>&1 | tee /tmp/count_logs/mig_idlaw.log
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var ERP = process.env.ERP_DIR || path.join(__dirname, '..');
var CASES = {}, ALL = { judged: 0, failed: 0 };
function say(s) { console.log(s); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §IDLAW-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(JSON.stringify(info)).slice(0, 1500))); }

// ── CENSUS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function walk(d, out) { fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) { var p = path.join(d, e.name);
  if (e.isDirectory()) { if (!/^(tests|node_modules|fixtures|patches|\.git)$/.test(e.name)) walk(p, out); }
  else if (/\.(js|mjs)$/.test(e.name) && !/(_dict|\.min)\.|dict\.js$/.test(e.name)) out.push(p); }); return out; }
var KEY = [ /\b(?:Number|nz|id0)\(\s*[\w.\[\]']*_id\s*\)\s*>\s*0/i, /\.get(?!AD_Client|Record)\w*_ID\(\)\s*>\s*0/, /\b\w*_id\s*>\s*0\b(?!\.)/i ];
// LEAVE list (named in §IDLAW-SPEC): file -> substring identifying the line that legitimately stays
var LEAVE = [ ['model_layer.js', 'keepKey'], ['model_layer.js', 'PO.saveNew'], ['model_cost.js', 'reversalline_id'] ];
function scan(name, src) { var hits = [], left = 0;
  src.split('\n').forEach(function (l, i) { var code = l.replace(/\/\/.*$/, '').replace(/\bctx\.\w+/g, 'CTX'); if (/ad_client_id/i.test(code) || /getAD_Client_ID/.test(code)) return;
    if (!KEY.some(function (r) { return r.test(code); })) return;
    if (LEAVE.some(function (x) { return name === x[0] && l.indexOf(x[1]) >= 0; })) { left++; return; }
    hits.push(name + ':' + (i + 1) + ' ' + l.trim().slice(0, 140)); }); return { hits: hits, left: left }; }
var files = walk(ERP, []), hits = [], left = 0;
files.forEach(function (f) { var r = scan(path.relative(ERP, f), fs.readFileSync(f, 'utf8')); hits = hits.concat(r.hits); left += r.left; });
say('§IDLAW-CENSUS files=' + files.length + ' bare_key_tests=' + hits.length + ' leave_list_hits=' + left);
hits.slice(0, 40).forEach(function (h) { say('  §IDLAW-HIT ' + h); });
check('CENSUS', 'no-bare-key-test', 'no `Number(x.<col>_id) > 0` / `get<Col>_ID() > 0` / SQL `<col>_id>0` key test is left in ' + files.length + ' erp source files outside the named LEAVE list (' + left + ' lines)', files.length > 50 && hits.length === 0, hits.slice(0, 10));
var m = scan('mutant.js', "if (Number(r.c_bankaccount_id) > 0) return null;\nvar n = 1; if (qty > 0) n++;\nWHERE c_orderline_id>0\n");
check('CENSUS', 'mutant-caught', 'MUTANT: the census flags a re-introduced bare key test (2 of the 3 injected lines; the qty test is not a key test)', m.hits.length === 2, m);

// ── UNIT: ModelLayer.idSet ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
if (!global.window) global.window = {};
var ML = require(path.join(ERP, 'model_layer.js'));
var cases = [[-4711, true], [4711, true], [0, false], [null, false], [undefined, false], ['', false], ['-5', true], [NaN, false]];
check('UNIT', 'idSet', 'ModelLayer.idSet: positive and synthetic negative = set; 0, null, undefined, "", NaN = not set', typeof ML.idSet === 'function' && cases.every(function (c) { return ML.idSet(c[0]) === c[1]; }), cases.map(function (c) { return [c[0], ML.idSet && ML.idSet(c[0])]; }));

// ── CYCLE: the migrated tenant under the PAGE's id law, in child processes ─────────────────────────────────────────────────────────────────
function child(file, env) { var r = cp.spawnSync(process.execPath, [path.join(__dirname, file)], { env: Object.assign({}, process.env, { WS_ID_LAW: 'synthetic', ERP_DIR: ERP }, env || {}), encoding: 'utf8', timeout: 900000, maxBuffer: 1 << 26 });
  var out = (r.stdout || '') + (r.stderr || ''), v = (out.match(/§(?:TRD|PAYSAVE)-VERDICT (\w+) judged=(\d+) failed=(\d+)/) || []); fs.writeFileSync('/tmp/count_logs/idlaw_child_' + file.replace(/\W/g, '_') + (env && (env.MUT || env.PAYSAVE_MUT) ? '_mut' : '') + '.log', out);
  return { rc: r.status, verdict: v[1] || 'NONE', judged: Number(v[2] || 0), failed: Number(v[3] || 0), neg: (out.match(/§PAYSAVE-NEG[^\n]*/) || [''])[0].slice(0, 120) }; }
try { fs.mkdirSync('/tmp/count_logs', { recursive: true }); } catch (e) {}
var T = child('witness_migration_trade.js'), P = child('witness_migration_paysave.js');
say('§IDLAW-CYCLE trade=' + JSON.stringify(T) + ' paysave=' + JSON.stringify(P));
check('CYCLE', 'premise', 'control: the paysave child ran under the page law and found NEGATIVE ids in the migrated tenant (' + P.neg + ')', /rows_negative=[1-9]/.test(P.neg), P);
check('CYCLE', 'trade', 'under synthetic ids the migrated tenant trades: pay a migrated invoice, new order -> shipment -> invoice -> payment, vendor payment; books balanced (witness_migration_trade PASS, judged>0)', T.verdict === 'PASS' && T.judged > 0 && T.failed === 0, T);
check('CYCLE', 'paysave', 'under synthetic ids the Payment Save through the validation hooks passes and the rows after are right (witness_migration_paysave PASS, judged>0)', P.verdict === 'PASS' && P.judged > 0 && P.failed === 0, P);
var MT = child('witness_migration_trade.js', { MUT: 'unbal' }), MP = child('witness_migration_paysave.js', { PAYSAVE_MUT: 'oldcheck' });
check('MUTANT', 'trade-unbal', 'MUTANT: a dropped fact leg makes the trade witness FAIL under synthetic ids (not vacuous)', MT.verdict === 'FAIL' && MT.failed > 0, MT);
check('MUTANT', 'paysave-oldcheck', 'MUTANT: the old plain `> 0` Payment check makes the Payment Save FAIL under synthetic ids', MP.verdict === 'FAIL' && MP.failed > 0, MP);

Object.keys(CASES).forEach(function (c) { var x = CASES[c]; say('§IDLAW-' + c + ' verdict=' + (!x.judged ? 'INCONCLUSIVE' : x.failed ? 'FAIL' : 'PASS') + ' judged=' + x.judged + ' failed=' + x.failed); });
var V = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
say('§IDLAW-VERDICT ' + V + ' judged=' + ALL.judged + ' failed=' + ALL.failed);
process.exit(V === 'PASS' ? 0 : 1);
