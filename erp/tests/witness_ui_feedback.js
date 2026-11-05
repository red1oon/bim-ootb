#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-UI-FEEDBACK (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §40.4). READ THE LOG (/tmp/d13_logs/ui_feedback.log): every verdict is a § line; exit code is not evidence.
// THE ISSUE: the live till, kitchen and branch admin were BLANK while the hidden engine loaded (15 s), and a failure was silent. Proves, from MEASURED DOM text of the one shared status line (#ps-status, erp/page_status.js):
//  (1) t=0.5 s: non-empty "Starting..."; (2) during boot the elapsed seconds advance; (3) past the limit: "Still starting" + a Retry button + the likely cause; (4) after ready: an instruction (till: choose a cashier; kitchen: no orders yet + relay words; admin: what to do first);
//  (5) FORCED engine failure (idempiere.html aborted): a "Problem:" message with what to do + Retry; (6) the public trial address says it is a trial (GardenWorld demo data, no branch relay), a relay address does not.
// HARNESS: the REAL erp/branch_relay.py serves the app (--app); Chromium; trial host mapped with --host-resolver-rules. Mutants (copies, applied once): status-blank, failure-silent.  MF: UIF_MUT=<name>.
'use strict';
var path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..'), MUT = process.env.UIF_MUT || '';
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var MUTS = { 'status-blank': ['erp/page_status.js', "el.className = 'ps-' + cls; el.innerHTML = html;", "el.className = 'ps-' + cls; el.innerHTML = '';"], 'failure-silent': ['erp/page_status.js', "var s = String(line); if (s.indexOf('🔴') !== 0) return;", "return;"] };
var J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }, V = { j: 0, f: 0 };
function check(key, ok, label, info) { V.j++; if (!ok) V.f++; console.log('  §UIF_CHECK ' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + label + (ok ? '' : ' got=' + J(info).slice(0, 300))); return ok; }
(async function () {
  console.log('═══ W-UI-FEEDBACK ═══' + (MUT ? ' MUTANT=' + MUT : ''));
  var APPDIR = ROOT;
  if (MUT) { var m = MUTS[MUT]; APPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'uif-app-')); cp.execSync('cp -r ' + J(path.join(ROOT, 'erp')) + ' ' + J(path.join(ROOT, 'common')) + ' ' + J(APPDIR)); var f = path.join(APPDIR, m[0]), s = fs.readFileSync(f, 'utf8'); if (s.split(m[1]).length !== 2) { console.log('§UIF_CRASH MUTATION DID NOT APPLY exactly once'); process.exit(2); } fs.writeFileSync(f, s.replace(m[1], function () { return m[2]; })); console.log('§UIF_MUTANT applied ' + MUT); }
  var PORT = 19000 + Math.floor(Math.random() * 900), BOX = fs.mkdtempSync(path.join(os.tmpdir(), 'uif-box-'));
  var relay = cp.spawn('python3', [path.join(ROOT, 'erp', 'branch_relay.py'), '--port', String(PORT), '--dir', BOX, '--app', APPDIR, '--bind', '127.0.0.1'], { stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise(function (res, rej) { relay.stderr.on('data', function (d) { if (String(d).indexOf('§RELAY_UP') >= 0) res(); }); setTimeout(function () { rej(new Error('relay did not start')); }, 8000); });
  var APP = 'http://localhost:' + PORT, RELAY = 'http://127.0.0.1:' + PORT;
  var br = await reqPw().chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP trial.test 127.0.0.1'] }), perr = [];
  var txt = function (pg) { return pg.evaluate(function () { var e = document.querySelector('#ps-status'); return e ? e.innerText.trim() : null; }); };
  async function ctxPage(abort) { var ctx = await br.newContext(), pg = await ctx.newPage(); pg.on('pageerror', function (e) { perr.push(e.message); }); if (abort) await ctx.route('**/idempiere.html*', function (r) { return r.abort('blockedbyclient'); }); return pg; }
  var PAGES = { till: ['till.html', function () { return window.Till && window.Till.ready; }], kitchen: ['kitchen.html', function () { return window.Kitchen && window.Kitchen.ready; }], admin: ['branch_admin.html', function () { return window.BranchAdmin && window.BranchAdmin.ready; }] };
  try {
    for (var name of Object.keys(PAGES)) {
      var url = APP + '/erp/' + PAGES[name][0] + '?pslimit=1';
      var pg = await ctxPage(false); await pg.goto(url, { waitUntil: 'domcontentloaded' }); await sleep(500);
      var t05 = await txt(pg); check(name + '-t0.5', !!t05 && /Starting/.test(t05), name + ' at 0.5 s: a visible "Starting..." line', t05);
      var a = await txt(pg); await sleep(1300); var b = await txt(pg); var na = Number((/\((\d+) s\)/.exec(a) || [])[1]), nb = Number((/\((\d+) s\)/.exec(b) || [])[1]);
      check(name + '-elapsed', (nb > na) || /Still starting/.test(b), name + ' during boot: the elapsed seconds advance (' + na + ' -> ' + nb + ')', { a: a, b: b });
      await sleep(200); var late = await txt(pg); var hasRetry = await pg.evaluate(function () { return !!document.querySelector('#ps-retry'); });
      var stillBooting = !(await pg.evaluate(function () { return !!((window.Till && window.Till.ready) || (window.Kitchen && window.Kitchen.ready) || (window.BranchAdmin && window.BranchAdmin.ready)); }));
      if (stillBooting) check(name + '-limit', /Still starting/.test(late) && hasRetry && /Likely cause/.test(late), name + ' past the 1 s limit while still booting: "Still starting", likely cause, Retry button', late); else console.log('  §UIF_NOTE ' + name + ' booted before the limit; the limit state is judged on the failure case instead');
      await pg.waitForFunction(PAGES[name][1], null, { timeout: 170000 }); await sleep(300);
      var rd = await txt(pg), expect = { till: /Choose your name/, kitchen: /Not joined to a branch relay|Branch relay:/, admin: /First: open the main till/ }[name];
      check(name + '-ready', !!rd && expect.test(rd), name + ' after ready: an instruction (' + expect + ')', rd);
      if (name === 'kitchen') { var ke = await pg.evaluate(function () { var e = document.querySelector('#k-empty'); return { hidden: e.hidden, text: e.textContent.trim() }; }); check('kitchen-empty', !ke.hidden && /No orders yet\. Orders appear here when a till presses Send Order\./.test(ke.text), 'kitchen empty state is shown with the instruction', ke); }
      if (name === 'admin') { var ae = await pg.evaluate(function () { var e = document.querySelector('#a-empty'); return { hidden: e.hidden, text: e.textContent.trim() }; }); check('admin-empty', !ae.hidden && /Nothing handed over yet/.test(ae.text), 'admin empty state is shown with what to do', ae); }
      await pg.context().close();
      // forced engine failure
      var pf = await ctxPage(true); await pf.goto(APP + '/erp/' + PAGES[name][0], { waitUntil: 'domcontentloaded' }); await pf.waitForFunction(function () { var e = document.querySelector('#ps-status'); return e && /Problem:/.test(e.innerText); }, null, { timeout: 30000 }).catch(function () {});
      var ft = await txt(pf), fr = await pf.evaluate(function () { return !!document.querySelector('#ps-retry'); });
      check(name + '-failure', !!ft && /Problem:/.test(ft) && fr && /Retry|retry/.test(ft), name + ' with the engine forced to fail: a readable "Problem:" message with what to do and a Retry button', ft); await pf.context().close();
    }
    // the trial address
    var pt = await ctxPage(false); await pt.goto('http://trial.test:' + PORT + '/erp/till.html', { waitUntil: 'domcontentloaded' }); await sleep(600); var tt = await txt(pt);
    check('trial-says-trial', /Trial: one browser, GardenWorld demo data, no branch relay/.test(tt || ''), 'a public (non-local) address says it is a trial with demo data and no branch relay', tt); await pt.context().close();
    var pr = await ctxPage(false); await pr.goto('http://trial.test:' + PORT + '/erp/till.html?relay=' + encodeURIComponent(RELAY), { waitUntil: 'domcontentloaded' }); await sleep(600); var tr = await txt(pr);
    check('relay-not-trial', !!tr && !/Trial:/.test(tr), 'the same address with ?relay= is not called a trial', tr); await pr.context().close();
    check('no-pageerrors', perr.length === 0, 'no uncaught page errors in the normal boots', perr.slice(0, 2));
  } catch (e) { console.log('§UIF_CRASH ' + (e && e.stack || e)); V.f++; V.crash = 1; }
  try { await br.close(); } catch (e) {} relay.kill('SIGTERM');
  console.log('§UIF_VERDICT W-UI-FEEDBACK ' + (V.crash ? 'CRASH' : V.j === 0 ? 'INCONCLUSIVE' : V.f ? 'FAIL' : 'PASS') + ' judged=' + V.j + ' failed=' + V.f + (MUT ? ' mutant=' + MUT : ''));
  process.exit(!V.crash && V.j && !V.f ? 0 : 1);
})();
