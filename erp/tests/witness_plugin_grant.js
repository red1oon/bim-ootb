#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PLUGIN-GRANT (bim-compiler prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §12.3, Phase 2 sub-step 2.1).
//   READ THE LOG after every run: every verdict is a §GRANT line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill: it must print its own FAIL verdict.
// THE ISSUE: separation of concern for the Team plugin must be a CAPABILITY the host enforces, not a promise checked by grep (§10.3 item 4a). Before 2.1 a bundle reaches every
//   gate surface of the bus (ctx.events gate topics, ctx.modelval.registerValidator, ctx.rules.register) - nothing restricts it (§12.1 M7).
// SPEC (the claims, written before the code):
//   G1 OBSERVE-OK    manifest.events='observe': a postCreate subscription and an {observe:true} afterNew subscription register, start succeeds (ACTIVE), and both are delivered after a committed group.
//   G2 GATE-REFUSED  the same grant subscribing afterNew WITHOUT observe -> activation refused (state INSTALLED, not ACTIVE), the subscription it made BEFORE the refused call is gone
//                    (registry at baseline), the error names the grant and the topic.
//   G3 VALIDATOR     the same grant calling ctx.modelval.registerValidator -> refused likewise, REGISTRY unchanged.
//   G4 RULES         the same grant calling ctx.rules.register -> refused likewise (stage 3 runs inside the save and can veto), no rule function left.
//   G5 COMPAT        no manifest.events field -> a gate subscription is accepted (every bundle shipped before Phase 2 keeps today's behaviour).
//   G6 BAD-VALUE     manifest.events='bogus' -> installBundle refuses.
//   G7 CAPABILITY    after G2's refusal, a save that fires afterNew never calls the refused bundle's function (the grant is enforced by the host, not by the bundle's good manners).
//   G8 LOG           §PLUGIN-GRANT bundle=<id> events=<grant> is printed when a granted bundle activates; §PLUGIN-GRANT refused ... when a call is refused.
// Command: node erp/tests/witness_plugin_grant.js            (GRANT_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!global.window) global.window = {};
var ERP = process.env.GRANT_ERP || path.join(__dirname, '..');
var MUTANT = process.env.GRANT_MUTANT || '';
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var _log = console.log, SEEN = [];
console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 };
  c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §GRANT-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§GRANT-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }

// ── MUTANTS: each rewrites plugin_registry.js in a mirror (every .js COPIED, not symlinked: node resolves a symlink to its real path), proves the text was found exactly once,
//    and the named case must print FAIL in the child's own verdict.
var MUTANTS = [
  { id: 'M1-subscribe-unchecked', file: 'plugin_registry.js', from: "if (grant === 'observe' && !isObs) refuse('gate topic ' + topic);", to: '', kills: 'G2' },
  { id: 'M2-observe-flag-ignored', file: 'plugin_registry.js', from: "var isObs = !!(host.modelval.isObserveTopic && host.modelval.isObserveTopic(topic)) || !!(opts && opts.observe === true);", to: "var isObs = !!(host.modelval.isObserveTopic && host.modelval.isObserveTopic(topic));", kills: 'G1' },
  { id: 'M3-validator-unchecked', file: 'plugin_registry.js', from: "if (grant === 'observe') refuse('registerValidator ' + table + ' ' + timing);", to: '', kills: 'G3' },
  { id: 'M4-rules-unchecked', file: 'plugin_registry.js', from: "if (grant === 'observe') refuse('rules.register ' + name);", to: '', kills: 'G4' },
  { id: 'M5-absent-is-observe', file: 'plugin_registry.js', from: "var grant = manifest.events || 'gate';", to: "var grant = manifest.events || 'observe';", kills: 'G5' },
  { id: 'M6-any-value-accepted', file: 'plugin_registry.js', from: "if (mf.events !== undefined && GRANTS.indexOf(mf.events) < 0)", to: "if (false)", kills: 'G6' }
];
function runMutants() {
  var res = { total: MUTANTS.length, applied: 0, killed: 0, notApplied: [], crashed: [], survived: [] };
  MUTANTS.forEach(function (m) {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grantmut-'));
    fs.readdirSync(ERP).forEach(function (f) { if (/\.js$/.test(f)) fs.copyFileSync(path.join(ERP, f), path.join(dir, f)); });
    fs.symlinkSync(path.join(ERP, 'ad_seed.db'), path.join(dir, 'ad_seed.db')); fs.mkdirSync(path.join(dir, 'patches')); fs.copyFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), path.join(dir, 'patches/ad_seed.db.sql'));
    var src = fs.readFileSync(path.join(dir, m.file), 'utf8'), n = src.split(m.from).length - 1;
    if (n !== 1) { res.notApplied.push(m.id + '(found ' + n + ')'); say('§GRANT-MUTANT id=' + m.id + ' NOT-APPLIED found=' + n); return; }
    fs.writeFileSync(path.join(dir, m.file), src.replace(m.from, m.to)); res.applied++;
    var r = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { GRANT_ERP: dir, GRANT_MUTANT: m.id, GRANT_MUTANTS: '' }), encoding: 'utf8', timeout: 120000 });
    var out = String(r.stdout || ''), line = (out.match(new RegExp('§GRANT-' + m.kills + ' verdict=\\w+[^\\n]*')) || [null])[0];
    if (!/§GRANT-RESULT verdict=/.test(out)) { res.crashed.push(m.id); say('§GRANT-MUTANT id=' + m.id + ' CRASHED (not a kill) ' + String(r.stderr || '').split('\n')[0]); return; }
    if (line && /verdict=FAIL/.test(line)) { res.killed++; say('§GRANT-MUTANT id=' + m.id + ' KILLED by ' + m.kills + ' :: ' + line); }
    else { res.survived.push(m.id); say('§GRANT-MUTANT id=' + m.id + ' SURVIVED ' + m.kills + ' :: ' + line); }
  });
  var ok = res.applied === res.total && res.killed === res.total;
  say('§GRANT-MUTANTS verdict=' + (ok ? 'PASS' : 'FAIL') + ' total=' + res.total + ' applied=' + res.applied + ' killed=' + res.killed + ' notApplied=' + JSON.stringify(res.notApplied) + ' crashed=' + JSON.stringify(res.crashed) + ' survived=' + JSON.stringify(res.survived));
  process.exit(ok ? 0 : 1);
}
if (process.env.GRANT_MUTANTS === '1') { runMutants(); return; }

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join('/home/red1/bim-ootb/node_modules/sql.js/dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { /* = page loader */ } });
  var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js')), PR = require(path.join(ERP, 'plugin_registry.js')), RULE = require(path.join(ERP, 'ad_rule.js'));
  say('§GRANT-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none'));
  function q(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var uu = 0, clock = Date.parse('2026-10-27T09:00:00Z');
  function env() { clock += 1000; return { client: 11, org: 11, user: 100, date: '2026-10-27 00:00:00', now: '2026-10-27 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  var T = 'c_uom', TP = { afterNew: 'adempiere/po/afterNew', postCreate: 'adempiere/po/postCreate' };
  function uomFields(n) { return { name: 'GRANTW ' + n, x12de355: 'G' + n, uomsymbol: 'g' + n, stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT' }; }
  function save(n) { var r = ML.run(q, env(), { table: T, timing: 'PROCESS', fn: function (trx) { ML.save(trx, T, null, uomFields(n)); return { ok: true }; } }); ML.deliverObserved(r, {}); return r; }
  function subsW() { return MV.subscriptions().filter(function (s) { return /^W\.grant/.test(s.name); }).length; }
  function valsW() { var n = 0; Object.keys(MV.REGISTRY).forEach(function (t) { Object.keys(MV.REGISTRY[t]).forEach(function (ti) { (MV.REGISTRY[t][ti] || []).forEach(function (h) { if (/^W\.grant/.test(h.name)) n++; }); }); }); return n; }
  function rulesW() { return (RULE.ruleFunctions ? RULE.ruleFunctions() : []).filter(function (f) { return /^W\.grant/.test(f.name); }).length; }
  var BUNDLES = {}, ran = [];
  var host = { engineVersion: '1.0.0', modelval: MV, docAction: ML, rule: RULE, import: function (u) { return Promise.resolve(BUNDLES[u]); }, ops: { append: function () { return 1; } } };
  var reg = PR.create(host);
  function bundle(url, id, events, activate) { var mf = { id: id, version: '1.0.0', engineVersion: '>=0.9.0', requires: {} }; if (events !== undefined) mf.events = events; BUNDLES[url] = { manifest: mf, activate: activate, deactivate: async function () {} }; return url; }
  async function tryStart(url, id) { var err = null, st = null; try { await reg.installBundle(url); st = await reg.startBundle(id); } catch (e) { err = e; } var rec = reg.list ? reg.list().filter(function (b) { return b.id === id; })[0] : null; return { err: err, st: st, state: rec ? rec.state : (st && st.state) }; }
  function linesSince(i, re) { return SEEN.slice(i).filter(function (s) { return re.test(s); }); }

  // G1 + G8
  var i1 = SEEN.length;
  var r1 = await tryStart(bundle('b/g1.mjs', 'com.test.grant.obs', 'observe', async function (ctx) {
    ctx.events.subscribe(TP.postCreate, T, 'W.grant.g1.post', function () { ran.push('g1.post'); return null; });
    ctx.events.subscribe(TP.afterNew, T, 'W.grant.g1.obsAfterNew', function () { ran.push('g1.obsAfterNew'); return null; }, { observe: true });
  }), 'com.test.grant.obs');
  var s1 = subsW(); ran.length = 0; save(1); var got1 = ran.slice().sort().join();
  check('G1', 'observe-ok', "grant 'observe': postCreate + {observe:true} afterNew register, bundle ACTIVE, both delivered after the committed group", !r1.err && r1.state === 'ACTIVE' && s1 === 2 && got1 === 'g1.obsAfterNew,g1.post', { err: r1.err && r1.err.message, state: r1.state, subs: s1, ran: got1 });
  var g8a = linesSince(i1, /§PLUGIN-GRANT bundle=com\.test\.grant\.obs events=observe/).length;
  if (!r1.err) await reg.stopBundle('com.test.grant.obs');
  check('G1', 'stop-clean', 'stop removes both subscriptions', subsW() === 0, { subs: subsW() });

  // G2 + G7 + G8
  var i2 = SEEN.length, base2 = subsW();
  var r2 = await tryStart(bundle('b/g2.mjs', 'com.test.grant.gate', 'observe', async function (ctx) {
    ctx.events.subscribe(TP.postCreate, T, 'W.grant.g2.first', function () { ran.push('g2.first'); return null; });
    ctx.events.subscribe(TP.afterNew, T, 'W.grant.g2.gate', function () { ran.push('g2.gate'); return null; });
  }), 'com.test.grant.gate');
  var m2 = r2.err ? String(r2.err.message) : '';
  check('G2', 'gate-refused', "grant 'observe' subscribing afterNew without observe: activation refused, not ACTIVE, the earlier subscription undone, message names grant + topic",
    !!r2.err && r2.state !== 'ACTIVE' && subsW() === base2 && /observe/.test(m2) && m2.indexOf(TP.afterNew) >= 0, { err: m2, state: r2.state, subs: subsW(), base: base2 });
  ran.length = 0; save(2);
  check('G7', 'capability', 'a save that fires afterNew never calls the refused bundle (neither its gate fn nor its undone observer)', ran.filter(function (x) { return /^g2\./.test(x); }).length === 0, { ran: ran });
  var g8b = linesSince(i2, /§PLUGIN-GRANT refused bundle=com\.test\.grant\.gate/).length;

  // G3
  var base3 = valsW();
  var r3 = await tryStart(bundle('b/g3.mjs', 'com.test.grant.val', 'observe', async function (ctx) { ctx.modelval.registerValidator(T, 'BEFORE_NEW', 'W.grant.g3.val', function () { return null; }); }), 'com.test.grant.val');
  check('G3', 'validator-refused', "grant 'observe' calling ctx.modelval.registerValidator: refused, not ACTIVE, REGISTRY unchanged", !!r3.err && r3.state !== 'ACTIVE' && valsW() === base3 && /observe/.test(String(r3.err && r3.err.message)), { err: r3.err && r3.err.message, state: r3.state, vals: valsW(), base: base3 });

  // G4
  var base4 = rulesW();
  var r4 = await tryStart(bundle('b/g4.mjs', 'com.test.grant.rule', 'observe', async function (ctx) { ctx.rules.register('W.grant.g4.fn', function () { return null; }); }), 'com.test.grant.rule');
  check('G4', 'rules-refused', "grant 'observe' calling ctx.rules.register: refused, not ACTIVE, no rule function left", !!r4.err && r4.state !== 'ACTIVE' && rulesW() === base4 && /observe/.test(String(r4.err && r4.err.message)), { err: r4.err && r4.err.message, state: r4.state, rules: rulesW(), base: base4 });

  // G5
  var r5 = await tryStart(bundle('b/g5.mjs', 'com.test.grant.none', undefined, async function (ctx) { ctx.events.subscribe(TP.afterNew, T, 'W.grant.g5.gate', function () { ran.push('g5.gate'); return null; }); }), 'com.test.grant.none');
  ran.length = 0; save(5);
  check('G5', 'compat', 'no manifest.events: a gate subscription is accepted and runs inside the save (today\'s behaviour)', !r5.err && r5.state === 'ACTIVE' && ran.indexOf('g5.gate') >= 0, { err: r5.err && r5.err.message, state: r5.state, ran: ran });
  if (!r5.err) await reg.stopBundle('com.test.grant.none');

  // G6
  var r6 = await tryStart(bundle('b/g6.mjs', 'com.test.grant.bad', 'bogus', async function () {}), 'com.test.grant.bad');
  check('G6', 'bad-value', "manifest.events='bogus': installBundle refuses", !!r6.err && /events/.test(String(r6.err && r6.err.message)), { err: r6.err && r6.err.message, state: r6.state });

  check('G8', 'log', '§PLUGIN-GRANT line at activation of the observe bundle and a §PLUGIN-GRANT refused line for the refused one', g8a === 1 && g8b >= 1, { activated: g8a, refused: g8b });
  SEEN.filter(function (s) { return /§PLUGIN-GRANT/.test(s); }).forEach(function (s) { say('  shipped: ' + s); });

  var vs = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'].map(verdict);
  var failed = Object.keys(CASES).filter(function (k) { return CASES[k].failed; });
  say('§GRANT-RESULT verdict=' + (vs.every(function (v) { return v === 'PASS'; }) ? 'PASS' : vs.indexOf('INCONCLUSIVE') >= 0 && !failed.length ? 'INCONCLUSIVE' : 'FAIL') + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + JSON.stringify(failed));
  process.exit(ALL.failed ? 1 : 0);
})().catch(function (e) { say('§GRANT-RESULT verdict=FAIL crashed ' + (e && e.stack)); process.exit(2); });
