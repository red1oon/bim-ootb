#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* ⚠ DO NOT REMOVE — Scope: W-POWER-CUT, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §52 D0 (Triple Redundancy, copy 1 = the device). READ THE LOG after every run — the exit code is not evidence.
 * THE ISSUE: the kernel log lives in sql.js memory; the viewer/modeller/erp kernels reach disk only by a whole-DB snapshot 2 s after the LAST op (kernel_ops.js
 * _persistToIdb), with no flush when the tab is hidden or closed. The ERP record path is different: crud_overlay appends each committed row to an add()-only store.
 * REAL Chromium (Playwright's build) started by this script and killed with SIGKILL (a crash, not a graceful close); the real kernel files; real IndexedDB; then the
 * SAME profile is reopened and what is ON DISK is read. Harness: common/tests/power_cut_harness.html (?k=viewer|modeller|erp).
 *   C0 CONTROL   commit 3, wait 3 s, kill -> 3 on disk (the instrument can see a recovery) - viewer, modeller, erp
 *   E1           ERP record-path primitive: commit + append each row (awaited), kill at 200 ms -> 3 appended (saved = on disk already)
 *   H1           commit 3, tab becomes hidden, kill at 600 ms -> 3 on disk (RED before §52 option A: 0) - viewer, modeller, erp
 *   P1           commit 3, navigate away (pagehide), kill at 600 ms -> 3 on disk (RED before option A: 0) - viewer
 *   L1 / L2      MEASURED, stated as §LIMIT (option A does not cover a crash mid-work): commit 3 then kill at 200 ms; one op every 500 ms for 6 s then kill
 *   CH           every snapshot that was read opens and passes verifyChain (never half-written)
 * Limits: a SIGKILL of the browser is a process crash; an OS power cut can additionally lose writes still in the OS cache (IndexedDB durability flag not requested).
 * Verdict: §PC_VERDICT PASS | FAIL | INCONCLUSIVE.   Run: node common/tests/witness_power_cut.js [bim-ootb dir] | tee <log> */
'use strict';
var path = require('path'), fs = require('fs'), os = require('os'), http = require('http'), cp = require('child_process'), net = require('net');
var TREE = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
var PW; [path.join(TREE, 'tests', 'node_modules', 'playwright'), 'playwright'].some(function (c) { try { PW = require(c); return true; } catch (e) { return false; } });
if (!PW) { console.log('§PC_VERDICT INCONCLUSIVE playwright is not installed: run `cd ' + path.join(TREE, 'tests') + ' && npm install && npx playwright install chromium`'); process.exit(2); }
var fails = 0, judged = 0, inc = 0, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function ok(a, c, label, d) { judged++; if (!c) fails++; console.log('   ' + (c ? 'PASS' : 'FAIL') + ' §PC-' + a + ' ' + label + (d ? ' - ' + d : '')); return c; }
function vac(a, label) { inc++; console.log('   INCONCLUSIVE §PC-' + a + ' ' + label); }

var MIME = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm' };
function serve() { return new Promise(function (res) { var s = http.createServer(function (q, r) { var p = path.join(TREE, decodeURIComponent(q.url.split('?')[0]));
  if (p.indexOf(TREE) !== 0 || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r); }); s.listen(0, '127.0.0.1', function () { res(s); }); }); }
function freePort() { return new Promise(function (res) { var s = net.createServer(); s.listen(0, function () { var p = s.address().port; s.close(function () { res(p); }); }); }); }
async function launch(dir) {
  var port = await freePort(), exe = PW.chromium.executablePath();
  var proc = cp.spawn(exe, ['--headless=new', '--no-sandbox', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  for (var i = 0; i < 300; i++) { try { await new Promise(function (res, rej) { http.get('http://127.0.0.1:' + port + '/json/version', function (r) { r.resume(); r.on('end', res); }).on('error', rej); }); break; } catch (e) { await sleep(100); } }
  var browser = await PW.chromium.connectOverCDP('http://127.0.0.1:' + port), ctx = browser.contexts()[0], page = ctx.pages()[0] || await ctx.newPage();
  return { proc: proc, browser: browser, page: page };
}
function kill(b) { return new Promise(function (res) { b.proc.on('exit', function () { res(); }); try { process.kill(b.proc.pid, 'SIGKILL'); } catch (e) { res(); } }); }
var BASE;
async function scenario(k, act) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc_' + k + '_')), b = await launch(dir), logs = [];
  b.page.on('console', function (m) { var t = m.text(); if (/§KRN_|§KERNEL_OP|PC /.test(t)) logs.push(t); });
  await b.page.goto(BASE + '/common/tests/power_cut_harness.html?k=' + k); await b.page.evaluate('PC.ready');
  var t0 = Date.now(); await act(b.page); var tKill = Date.now() - t0;
  await kill(b);
  var b2 = await launch(dir); await b2.page.goto(BASE + '/common/tests/power_cut_harness.html?k=' + k); await b2.page.evaluate('PC.ready');
  var disk = await b2.page.evaluate('PC.readDisk()'); await kill(b2); fs.rmSync(dir, { recursive: true, force: true });
  disk.killed_after_ms = tKill; disk.persist_lines = logs.filter(function (l) { return /§KRN_PERSIST /.test(l); }).length; return disk;
}
var CHAINS = [];
function note(d) { if (d.snapshot) CHAINS.push(d.chain); return JSON.stringify(d); }

(async function main() {
  var srv = await serve(); BASE = 'http://127.0.0.1:' + srv.address().port;
  var head = (cp.spawnSync('git', ['-C', TREE, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout || '').trim();
  console.log('§PC_HEADER W-POWER-CUT tree=' + TREE + ' commit=' + head + ' chromium=' + PW.chromium.executablePath() + ' node=' + process.version);
  for (var k of ['viewer', 'modeller', 'erp']) {
    var c0 = await scenario(k, async function (p) { await p.evaluate('PC.commit(3,"c0")'); await sleep(3000); });
    var ctl = ok('C0', c0.rows === 3, k + ': CONTROL commit 3, wait 3 s, kill -> 3 rows on disk', note(c0));
    var h1 = await scenario(k, async function (p) { await p.evaluate('PC.commit(3,"h1")'); await p.evaluate('PC.hide()'); await sleep(600); });
    if (!ctl) vac('H1', k + ': control failed, H1 not judged'); else ok('H1', h1.rows === 3, k + ': commit 3, tab hidden, kill at 600 ms -> 3 rows on disk', note(h1));
  }
  var p1 = await scenario('viewer', async function (p) { await p.evaluate('PC.commit(3,"p1")'); await p.goto('about:blank'); await sleep(600); });
  ok('P1', p1.rows === 3, 'viewer: commit 3, navigate away (pagehide), kill at 600 ms -> 3 rows on disk', note(p1));
  var e1 = await scenario('erp', async function (p) { await p.evaluate('PC.commitAppend(3)'); await sleep(200); });
  ok('E1', e1.appended === 3, 'ERP record path (commit + append each row, awaited), kill at 200 ms -> 3 appended rows on disk', JSON.stringify(e1));
  var l1 = await scenario('viewer', async function (p) { await p.evaluate('PC.commit(3,"l1")'); await sleep(200); });
  console.log('§LIMIT viewer kernel: a crash 200 ms after 3 edits leaves ' + l1.rows + ' of 3 on disk (option A covers hide/close, not a crash mid-work) ' + note(l1));
  var l2 = await scenario('viewer', async function (p) { for (var i = 0; i < 12; i++) { await p.evaluate('PC.commit(1,"l2")'); await sleep(500); } });
  console.log('§LIMIT viewer kernel: one edit every 500 ms for 6 s, then a crash, leaves ' + l2.rows + ' of 12 on disk (the debounce restarts on every edit) ' + note(l2));
  if (!CHAINS.length) vac('CH', 'no snapshot was read'); else ok('CH', CHAINS.every(function (c) { return c === 'ok'; }), 'every snapshot read back opens and passes verifyChain (' + CHAINS.length + ')', CHAINS.join(','));
  srv.close();
  var verdict = fails ? 'FAIL' : (inc || !judged) ? 'INCONCLUSIVE' : 'PASS';
  console.log('§PC_VERDICT ' + verdict + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inc);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§PC_VERDICT INCONCLUSIVE crashed: ' + (e && e.stack || e)); process.exit(2); });
