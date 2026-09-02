#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — prompts/TEAMS_OVERLAY_LIVE_E2E_TEST.md. A REAL two-user E2E over the LIVE Modeller
//   embed (modeller/teams_embed.js). Two scenarios, both driven through the ACTUAL production affordances
//   (#b-teams → #teams-pill clicks, no page.evaluate() into engine internals):
//
//   SCENARIO 1 (§SEP-*) — TWO SEPARATE Playwright BrowserContexts, i.e. two real, independent browser
//   profiles/devices (project doctrine: real user path, not one context faking two). THE FINDING: this
//   correctly, REPRODUCIBLY shows each session sees only ITS OWN presence row, never the peer's —
//   because BroadcastChannel is scoped per storage partition and NEVER crosses separate contexts, even on
//   the same http origin (proven directly against the raw platform API in §BC-CONTROL, no app code
//   involved). This is a platform fact, not a bug in teams_embed.js: no amount of patching the Modeller
//   embed can make two genuinely separate real users see each other's Tier-1 heartbeat this way. Real
//   cross-device presence would need to ride the durable Tier-2 transport (teams/transport.js pushOps/
//   pullOps, already witnessed at the engine level via W-ERP-SYNC/W-REMOTE) — which is NOT wired into the
//   live embed today.
//
//   SCENARIO 2 (§SAME-*) — TWO TABS in the SAME BrowserContext (one real user, two windows — the one case
//   BroadcastChannel actually covers). Proves a REAL bug found+fixed along the way: modeller/teams_embed.js
//   sent its own heartbeat but never SUBSCRIBED to the bus — `window.__teamsPeerBeats` was read every time
//   a pane opened but NEVER WRITTEN anywhere in the codebase (confirmed by grep before this fix), so even
//   same-profile peers were invisible to each other. Fixed: init() now calls `_conn.bus.on(...)` once and
//   live re-renders the open pane on every peer heartbeat. This scenario is the genuine regression test for
//   that fix.
//   Run: node teams/tests/witness_e2e_dual_presence_modeller.js 2>&1 | tee teams/logs/e2e_dual_presence.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');   // repo root — modeller/ and teams/ are siblings here
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

// presence rows are the DIRECT children of .teams-presence-list (one per identity). Select leaf rows only
// (`> div`) — a descendant `div span` count would double-count via the wrapper div itself.
async function paneUsers(page) {
  return page.$$eval('#teams-pane .teams-presence-list > div', function (rows) {
    return rows.map(function (r) { return r.textContent.trim(); });
  });
}
async function turnOnTeams(page, who, log) {
  await page.waitForSelector('#b-teams', { timeout: 8000 });
  await page.click('#b-teams');                                    // real click #1 — mounts the (closed) pill
  await page.waitForSelector('#teams-pill', { timeout: 8000 });
  var pressed = await page.getAttribute('#teams-pill', 'aria-pressed');
  if (pressed !== 'true') await page.click('#teams-pill');         // real click #2 — opens the pane (onMount)
  await page.waitForSelector('#teams-pane', { timeout: 8000 });
  log('§E2E-MOUNT ' + who + ' pane mounted');
}
function log(m) { console.log('   ' + m); }

(async function () {
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent(req.url.split('?')[0]);
    var fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, r); });
  var port = server.address().port;
  var url = 'http://localhost:' + port + '/modeller/modeller.html';
  var browser = await reqPw().chromium.launch();

  try {
    // ── raw-platform control: does BroadcastChannel cross two separate contexts at all, with NO app
    //    code involved? Settles whether any later failure is a teams_embed.js bug or a platform fact. ──
    console.log('\n═══ §BC-CONTROL — raw BroadcastChannel across two separate contexts (no app code) ═══\n');
    var cc1 = await browser.newContext(), cc2 = await browser.newContext();
    var cp1 = await cc1.newPage(), cp2 = await cc2.newPage();
    await cp1.goto(url, { waitUntil: 'load' }); await cp2.goto(url, { waitUntil: 'load' });
    await cp1.evaluate(function () { window.__log = []; window.__ch = new BroadcastChannel('e2e_control'); window.__ch.onmessage = function (e) { window.__log.push(e.data); }; });
    await cp2.evaluate(function () { window.__log = []; window.__ch = new BroadcastChannel('e2e_control'); window.__ch.onmessage = function (e) { window.__log.push(e.data); }; });
    await cp1.evaluate(function () { window.__ch.postMessage({ from: 'ctx1' }); });
    await cp2.waitForTimeout(300);
    var gotOn2 = await cp2.evaluate(function () { return window.__log; });
    verdict(gotOn2.length === 0, '§BC-CONTROL separate contexts do NOT share BroadcastChannel (platform fact)', 'ctx2 received=' + JSON.stringify(gotOn2));
    await cc1.close(); await cc2.close();

    // ── SCENARIO 1: two SEPARATE contexts through the real production UI ──
    console.log('\n═══ §SEP — two SEPARATE Playwright contexts (real independent users), live Modeller Teams embed ═══\n');
    var ctxA = await browser.newContext(), ctxB = await browser.newContext();
    var pageA = await ctxA.newPage(), pageB = await ctxB.newPage();
    var errA = [], errB = [];
    pageA.on('pageerror', function (e) { errA.push(e.message); });
    pageB.on('pageerror', function (e) { errB.push(e.message); });
    await pageA.goto(url, { waitUntil: 'load' }); await pageB.goto(url, { waitUntil: 'load' });
    await pageA.evaluate(function () { window.TeamsEmbedUser = 'alice'; });
    await pageB.evaluate(function () { window.TeamsEmbedUser = 'bob'; });
    await turnOnTeams(pageA, 'sessionA(alice)', log);
    await turnOnTeams(pageB, 'sessionB(bob)', log);
    await pageA.waitForTimeout(400); await pageB.waitForTimeout(400);
    var sepA = await paneUsers(pageA), sepB = await paneUsers(pageB);
    console.log('   §E2E-EMIT sessionA rows: ' + JSON.stringify(sepA));
    console.log('   §E2E-EMIT sessionB rows: ' + JSON.stringify(sepB));
    verdict(sepA.some(function (t) { return /alice/.test(t); }), '§SEP-SELF sessionA sees its own (alice) row', 'rows=' + JSON.stringify(sepA));
    verdict(sepB.some(function (t) { return /bob/.test(t); }), '§SEP-SELF sessionB sees its own (bob) row', 'rows=' + JSON.stringify(sepB));
    // EXPECTED (not a bug): separate contexts never see the peer — matches §BC-CONTROL. Documented, not chased.
    verdict(!sepA.some(function (t) { return /bob/.test(t); }) && !sepB.some(function (t) { return /alice/.test(t); }),
      '§SEP-NO-CROSS confirms: two genuinely separate sessions do NOT see each other (matches §BC-CONTROL, not fixable at this layer)',
      'A=' + JSON.stringify(sepA) + ' B=' + JSON.stringify(sepB));
    verdict(errA.length === 0 && errB.length === 0, '§SEP-NOERR 0 page errors both sessions', 'A=' + JSON.stringify(errA) + ' B=' + JSON.stringify(errB));
    await ctxA.close(); await ctxB.close();

    // ── SCENARIO 2: SAME context, two tabs (one real user, two windows) — the regression test for the fix ──
    console.log('\n═══ §SAME — two tabs, ONE context (the case BroadcastChannel actually covers) ═══\n');
    var ctxS = await browser.newContext();
    var pageC = await ctxS.newPage(), pageD = await ctxS.newPage();
    var errC = [], errD = [];
    pageC.on('pageerror', function (e) { errC.push(e.message); });
    pageD.on('pageerror', function (e) { errD.push(e.message); });
    await pageC.goto(url, { waitUntil: 'load' }); await pageD.goto(url, { waitUntil: 'load' });
    await pageC.evaluate(function () { window.TeamsEmbedUser = 'carol'; });
    await pageD.evaluate(function () { window.TeamsEmbedUser = 'dave'; });
    await turnOnTeams(pageC, 'tabC(carol)', log);
    await turnOnTeams(pageD, 'tabD(dave)', log);
    await pageC.waitForTimeout(400); await pageD.waitForTimeout(400);
    var sameC = await paneUsers(pageC), sameD = await paneUsers(pageD);
    console.log('   §E2E-EMIT tabC rows: ' + JSON.stringify(sameC));
    console.log('   §E2E-EMIT tabD rows: ' + JSON.stringify(sameD));
    verdict(sameC.some(function (t) { return /carol/.test(t); }), '§SAME-SELF tabC sees its own (carol) row', 'rows=' + JSON.stringify(sameC));
    verdict(sameD.some(function (t) { return /dave/.test(t); }), '§SAME-SELF tabD sees its own (dave) row', 'rows=' + JSON.stringify(sameD));
    // tabC (opened AFTER tabD) sees tabD immediately — the fix delivers a heartbeat sent after tabC subscribed.
    verdict(sameC.some(function (t) { return /dave/.test(t); }), '§SAME-CROSS tabC (carol, later joiner) sees peer dave\'s row LIVE (the fix)', 'rows=' + JSON.stringify(sameC));
    // NAMED LIMITATION (not silently patched): tabD subscribed BEFORE carol's one-shot heartbeat existed —
    // there is no periodic re-beat and no "who's here" query, so a peer present BEFORE you subscribed stays
    // invisible until they re-announce (e.g. close+reopen their pane). Proven here: dave does NOT see carol
    // yet (order-dependent gap) — until carol re-announces, after which dave (already subscribed) DOES catch it.
    verdict(!sameD.some(function (t) { return /carol/.test(t); }), '§SAME-GAP (named, not fixed) tabD does NOT yet see the earlier-joined carol — no periodic heartbeat/replay exists', 'rows=' + JSON.stringify(sameD));
    // tabC re-announces (close+reopen — a real click cycle) → a NEW carol heartbeat fires AFTER dave's
    // subscription was already live, so dave (already listening) picks it up: proves the gap is closeable
    // by re-announcing, not a dead subscription.
    await pageC.click('#teams-pill'); await pageC.click('#teams-pill');
    await pageC.waitForSelector('#teams-pane'); await pageD.waitForTimeout(300);
    var sameD2 = await paneUsers(pageD);
    console.log('   §E2E-EMIT tabD rows after carol re-announces: ' + JSON.stringify(sameD2));
    verdict(sameD2.some(function (t) { return /carol/.test(t); }), '§SAME-CATCHUP tabD sees carol once she re-announces (subscription IS live, just no auto-replay)', 'rows=' + JSON.stringify(sameD2));
    verdict(errC.length === 0 && errD.length === 0, '§SAME-NOERR 0 page errors both tabs', 'C=' + JSON.stringify(errC) + ' D=' + JSON.stringify(errD));
    await ctxS.close();
  } finally {
    await browser.close(); server.close();
  }

  var n = 11;
  console.log('\n' + (fails === 0 ? '✅ W-E2E-DUAL-PRESENCE ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL — see 🔴 lines above') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 THREW ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 6).join('\n')); process.exit(1); });
