#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MAIN-FLAG-LOCAL (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §35.5 D13, §40.2). READ THE LOG (/tmp/d13_logs/main_flag_local.log): every verdict is a § line; exit code is not evidence.
// THE ISSUE: who decides which till is "main"? D13: the BRANCH supervisor, on that till, in Configuration; HQ neither sets nor checks it. Proves:
//  (a) supervisor sets main on T1 -> T1's LAN ops (collect, stock answer, receive) work on the REAL branch_relay.py; (b) T2/T3 are refused and make 0 relay requests; (c) a non-supervisor cannot set or clear it (API and Configuration UI);
//  (d) HQ's SODA batch carries NO kind-M row (even when asked) and a stale stored M row does not set the flag; (e) kind-S StorageOnHand reaches the main till and is not kept by the others; (f) Configuration checkbox: disabled for GardenUser, enabled for GardenAdmin, persists across reload.
// HARNESS: the REAL erp/branch_relay.py serves the app (--app) at http://localhost:<port> as on a shop PC; real Chromium contexts; mutants are copies of erp/ + common/ proven applied exactly once.
// Mutants: MF_MUT=sup-check-off | soda-M-honoured | ui-gate-off.  Run: node erp/tests/witness_main_flag_local.js 2>&1 | tee /tmp/d13_logs/main_flag_local.log
'use strict';
var path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..'), MUT = process.env.MF_MUT || '';
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var MUTS = {
  'sup-check-off': [['erp/till_lan.js', "if (!auth || auth.supervisor !== true) {", "if (false) {"]],
  'soda-M-honoured': [['erp/soda_core.js', "(o.onhand || []).forEach(function (h) {", "if (o.mainTill) rows.push(base({ kind: 'M', value: String(o.mainTill) })); (o.onhand || []).forEach(function (h) {"]],
  'ui-gate-off': [['erp/till_setup.js', "(cache.sup ? '' : ' disabled')", "''"]]
};
var J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }, V = { j: 0, f: 0 };
function check(key, ok, label, info) { V.j++; if (!ok) V.f++; console.log('  §MF_CHECK ' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 400))); return ok; }

(async function () {
  console.log('═══ W-MAIN-FLAG-LOCAL ═══' + (MUT ? ' MUTANT=' + MUT : ''));
  var APPDIR = ROOT;
  if (MUT) { var m = MUTS[MUT]; if (!m) { console.log('§MF_CRASH unknown mutant'); process.exit(2); }
    APPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-app-')); cp.execSync('cp -r ' + JSON.stringify(path.join(ROOT, 'erp')) + ' ' + JSON.stringify(path.join(ROOT, 'common')) + ' ' + JSON.stringify(APPDIR));
    m.forEach(function (x) { var f = path.join(APPDIR, x[0]), s = fs.readFileSync(f, 'utf8'); if (s.split(x[1]).length !== 2) { console.log('§MF_CRASH MUTATION DID NOT APPLY exactly once ' + x[1].slice(0, 40)); process.exit(2); } fs.writeFileSync(f, s.replace(x[1], function () { return x[2]; })); });
    console.log('§MF_MUTANT applied ' + MUT + ' (each anchor found exactly once)'); }
  var PORT = 18000 + Math.floor(Math.random() * 1000), BOX = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-box-')), rlog = [];
  var relay = cp.spawn('python3', [path.join(ROOT, 'erp', 'branch_relay.py'), '--port', String(PORT), '--dir', BOX, '--app', APPDIR, '--bind', '127.0.0.1'], { stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise(function (res, rej) { relay.stderr.on('data', function (d) { String(d).split('\n').forEach(function (l) { if (l) { rlog.push(l); if (l.indexOf('§RELAY_UP') === 0) res(); } }); }); relay.on('error', rej); setTimeout(function () { rej(new Error('relay did not start')); }, 8000); });
  var APP = 'http://localhost:' + PORT, RELAY = 'http://127.0.0.1:' + PORT, br = await reqPw().chromium.launch({ headless: true }), logs = [];
  var nReq = function () { return rlog.filter(function (l) { return l.indexOf('§RELAY ') === 0 && /\/pipe\//.test(l); }).length; };
  async function pc(till) { var ctx = await br.newContext(), pg = await ctx.newPage(); pg.on('console', function (m) { var t = m.text(); logs.push(till + ' ' + t); if (/§(MAIN|SODA_M)/.test(t)) console.log('  ' + till + ' ' + t.slice(0, 160)); }); pg.on('pageerror', function (e) { console.log('§MF_PAGEERR ' + till + ' ' + e.message.slice(0, 200)); });
    await pg.goto(APP + '/erp/tests/lan_harness.html?' + new URLSearchParams({ till: till, relay: RELAY, expected: 'T1,T2,T3' }).toString()); await pg.evaluate(function () { return window.mk(); }); return pg; }
  var SUP = { supervisor: true, name: 'GardenAdmin' }, NOSUP = { supervisor: false, name: 'GardenUser' };
  var ORD = function (key, pid, qty) { return [{ documentno: key, m_product_id: pid, qtyordered: qty, priceactual: 1 }]; };
  try {
    // (a)(b)(c) protocol on the real relay
    var T1 = await pc('T1'), T2 = await pc('T2'), T3 = await pc('T3');
    var r0 = await T1.evaluate(function (a) { return L.setMain(true, a); }, NOSUP); var f0 = await T1.evaluate(function () { return L.isMain(); });
    check('c-nonsup-set', r0.refused === 'not-supervisor' && f0 === false, 'a non-supervisor cannot set the flag (API)', { r0: r0, f0: f0 });
    var r1 = await T1.evaluate(function (a) { return L.setMain(true, a); }, SUP);
    check('a-sup-set', r1.ok === true && r1.on === true, 'the supervisor sets main on T1', r1);
    await T2.evaluate(function (a) { return L.deposit('T2-1', a.o, []); }, { o: ORD('T2-1', 100, 3) }); await T3.evaluate(function (a) { return L.deposit('T3-1', a.o, []); }, { o: ORD('T3-1', 100, 4) });
    var c1 = await T1.evaluate(async function () { var c = await L.collect(); return { ok: c.ok, reached: c.reached, lines: Object.keys(ST.main.lines).length }; });
    check('a-t1-collect', c1.ok === true && c1.lines === 2 && c1.reached.indexOf('T2') >= 0 && c1.reached.indexOf('T3') >= 0, 'T1 (main) collects both tills\' lines', c1);
    var q1 = await T1.evaluate(async function () { return (await L.answerQueries()) || {}; }); check('a-t1-answer', !q1.refused, 'T1 stock-question service runs', q1);
    var rc = await T1.evaluate(function () { return L.received(100, 5); }); check('a-t1-receive', rc && rc.ok === true, 'T1 receive stock works', rc);
    var before = nReq(), refused = {};
    for (var P of [['T2', T2], ['T3', T3]]) refused[P[0]] = await P[1].evaluate(async function () { return { collect: await L.collect(), answer: await L.answerQueries(), recv: L.received(1, 1), eoda: L.requireMain('EODA send'), on: L.isMain() }; });
    var allRef = ['T2', 'T3'].every(function (k) { var x = refused[k]; return x.collect.refused === 'not-main' && x.answer.refused === 'not-main' && x.recv.refused === 'not-main' && x.eoda && x.eoda.refused === 'not-main' && x.on === false; });
    check('b-others-refused', allRef, 'T2 and T3: collect, answer, receive, EODA send all refused with "not the branch main till"', refused);
    check('b-no-relay-traffic', nReq() === before, 'the refused ops made 0 branch-relay requests', { before: before, after: nReq() });
    var r2 = await T2.evaluate(function (a) { return L.setMain(false, a); }, NOSUP), r3 = await T1.evaluate(function (a) { return L.setMain(false, a); }, NOSUP), on1 = await T1.evaluate(function () { return L.isMain(); });
    check('c-nonsup-clear', r3.refused === 'not-supervisor' && on1 === true, 'a non-supervisor cannot clear the flag on T1', { r3: r3, on1: on1 });
    // (e) kind-S reaches the main till only
    var S = [{ kind: 'S', m_product_id: 100, detail: J({ qty: 50 }) }, { kind: 'S', m_product_id: 200, detail: J({ qty: 30 }) }];
    var s1 = await T1.evaluate(function (a) { return L.applySodaStock(a); }, S), s2 = await T2.evaluate(function (a) { return { n: L.applySodaStock(a), kept: Object.keys(ST.main.soda).length }; }, S);
    check('e-stock-main-only', s1 === 2 && s2.n === 0 && s2.kept === 0, 'StorageOnHand (S rows) is kept by the main till (2) and dropped by T2 (0 kept)', { s1: s1, s2: s2 });
    // (d) HQ's batch carries no flag
    var SC = require(path.join(APPDIR, 'erp', 'soda_core.js')), rd = SC.refDelta({ since: null, upto: '2026-11-05 00:00:00', batchId: 'B1', seq: 1, client: 11, org: 11, version: 1, prices: [], products: [], taxes: [], mainTill: 'T1', onhand: [{ m_product_id: 100, qty: 50 }] });
    var kinds = rd.rows.map(function (r) { return r.kind; });
    check('d-hq-carries-no-flag', kinds.indexOf('M') < 0 && kinds.indexOf('S') >= 0 && kinds.indexOf('B') === 0, 'refDelta given mainTill:"T1" still emits no kind-M row (S and B kept)', kinds);
    await T1.close(); await T2.close(); await T3.close();
    // (d)(f) the real till page, served by the branch relay at localhost
    async function till(who) { var ctx = await br.newContext(), pg = await ctx.newPage(); pg.on('console', function (m) { var t = m.text(); logs.push('till ' + t); if (/§(MAIN|SODA_M|TILL_SETUP_SAVE)/.test(t)) console.log('  till ' + t.slice(0, 160)); }); pg.on('pageerror', function (e) { console.log('§MF_PAGEERR ' + e.message.slice(0, 200)); });
      pg.__ctx = ctx; await bootTill(pg); return pg; }
    async function bootTill(pg) { await pg.goto(APP + '/erp/till.html?relay=' + encodeURIComponent(RELAY), { waitUntil: 'load' }); await pg.waitForFunction('window.Till && window.Till.ready && window.TillSetup', null, { timeout: 170000 }); }
    async function loginSetup(pg, who) { await pg.click('#u1 .u-user:has-text("' + who + '")'); await pg.click('#cfg-open'); await pg.waitForSelector('#setup #cfg-tabs button'); await pg.evaluate(async function () { TillSetup.render.tab = 'S'; await TillSetup.render(); }); await pg.waitForSelector('#cfg-main'); }
    var pg = await till();
    await loginSetup(pg, 'GardenUser');
    var u = await pg.evaluate(function () { var c = document.querySelector('#cfg-main'); return { disabled: c.disabled, checked: c.checked, main: Till.lan().isMain() }; });
    check('f-user-disabled', u.disabled === true && u.checked === false && u.main === false, 'GardenUser: the main-till checkbox is disabled and off', u);
    var ur = await pg.evaluate(function () { return Till.lan().setMain(true, { supervisor: false, name: 'GardenUser' }); });
    check('c-user-api', ur.refused === 'not-supervisor', 'GardenUser calling the writer is refused', ur);
    await pg.close(); await pg.__ctx.close();
    var pa = await till(); var tk = await pa.evaluate(function () { return Till.state().cfg.tillKey; });
    await loginSetup(pa, 'GardenAdmin');
    var ad = await pa.evaluate(function () { var c = document.querySelector('#cfg-main'); return { disabled: c.disabled, main: Till.lan().isMain() }; });
    check('f-admin-enabled', ad.disabled === false && ad.main === false, 'GardenAdmin: the checkbox is enabled', ad);
    await pa.evaluate(function () { document.querySelector('#cfg-main').checked = true; }); await pa.click('#cfg-save');
    var sv = await pa.evaluate(function (tk) { var st = JSON.parse(localStorage.getItem('tilllan.v1:' + tk) || '{}'); return { main: Till.lan().isMain(), stored: !!(st.main && st.main.on) }; }, tk);
    check('f-admin-set-persist', sv.main === true && sv.stored === true, 'GardenAdmin ticks + Save: this till is main and the device store holds it', sv);
    await bootTill(pa); var rl = await pa.evaluate(function () { return Till.lan().isMain(); }); check('f-reload', rl === true, 'the flag survives a reload of the till page', rl);
    // a non-supervisor opening Configuration later sees it ON but cannot clear it
    await pa.click('#u1 .u-user:has-text("GardenUser")'); await pa.click('#cfg-open'); await pa.waitForSelector('#setup #cfg-tabs button'); await pa.evaluate(async function () { TillSetup.render.tab = 'S'; await TillSetup.render(); }); await pa.waitForSelector('#cfg-main');
    var u2 = await pa.evaluate(function () { var c = document.querySelector('#cfg-main'); c.checked = false; return { disabled: c.disabled, was: true }; }); await pa.click('#cfg-save');
    var still = await pa.evaluate(function () { return Till.lan().isMain(); });
    check('c-user-cannot-clear', u2.disabled === true && still === true, 'GardenUser cannot clear it from Configuration (disabled; Save leaves it on)', { u2: u2, still: still });
    await pa.close(); await pa.__ctx.close();
    // (d) a stale kind-M row (an old HQ batch) does not set the flag on a till that is not main
    var pn = await till(); var tk2 = await pn.evaluate(function () { return Till.state().cfg.tillKey; });
    var ig = await pn.evaluate(async function (tk) { Till.engine().__idmpDb.run("INSERT INTO pos_tillref (pos_tillref_id, seq, kind, value) VALUES (-9, 9999, 'M', '" + tk + "')"); await Till.applySoda(); return Till.lan().isMain(); }, tk2);
    var sawIgn = logs.some(function (l) { return l.indexOf('§SODA_M_IGNORED') >= 0; });
    check('d-stale-M-ignored', ig === false && sawIgn, 'a stored kind-M row for THIS till key does not set the flag (§SODA_M_IGNORED logged)', { isMain: ig, sawIgn: sawIgn });
    await pn.close();
  } catch (e) { console.log('§MF_CRASH ' + (e && e.stack || e)); V.f++; V.crash = 1; }
  try { await br.close(); } catch (e) {} relay.kill('SIGTERM');
  var errs = logs.filter(function (l) { return /pageerror|Uncaught/.test(l); }).length;
  console.log('§MF_VERDICT W-MAIN-FLAG-LOCAL ' + (V.crash ? 'CRASH' : V.j === 0 ? 'INCONCLUSIVE' : V.f ? 'FAIL' : 'PASS') + ' judged=' + V.j + ' failed=' + V.f + (MUT ? ' mutant=' + MUT : ''));
  process.exit(!V.crash && V.j && !V.f ? 0 : 1);
})();
