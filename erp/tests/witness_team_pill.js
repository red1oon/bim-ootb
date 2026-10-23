#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-TEAM-PILL, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.8 (T1/T2/T3). READ THE LOG after every run — the exit code is not evidence.
//   One real browser, the real erp/idempiere.html. Every arm names the issue it proves or disproves; an arm that judged nothing prints INCONCLUSIVE.
//   §PILL-OFF    the Team pill (two heads icon) is on the bar WITHOUT team mode, and the page still loads no comm/sync script (nothing else changed).
//   §PILL-PANEL  the pill opens the panel: "System default", the repo from team_defaults.js, key status consistent with the shipped defaults, trial text.
//   §PILL-OWN    "Save as my own" stores owner/repo/key with trial=false and the panel then says "Your own" + no trial limit; "Use system default" restores trial=true.
//   §PILL-MODE   Turn on → ?team=1 + the Team chip appears and survives a reload WITHOUT ?team=1; Turn off → chip gone, page back to plain.
//   §PILL-NOERR  0 page errors.
// Run: node erp/tests/witness_team_pill.js 2>&1 | tee /tmp/witness_team_pill.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var fails = 0, judged = 0, inconclusive = [], errors = 0;
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function incon(label, why) { inconclusive.push(label); console.log('   ⚪ INCONCLUSIVE ' + label + ' — ' + why); }
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

(async function () {
  console.log('═══ W-TEAM-PILL — the Team pill, panel and system-default setup (TEAMWORK_FRAMEWORK §13.8) ═══\n');
  var server = http.createServer(function (req, res) { var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, URL0 = base + '/erp/idempiere.html?login=GardenAdmin&window=143';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] }), lines = [];
  try {
    var pg = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    pg.on('console', function (m) { var t = m.text(); lines.push(t); if (/§TEAM_PANEL|§TEAM_BOOT|🔴/.test(t)) console.log('     ' + t.slice(0, 260)); });
    pg.on('pageerror', function (e) { errors++; console.log('     🔴 pageerror ' + e.message); });
    async function load(u) { await pg.goto(u, { waitUntil: 'load' }); await pg.waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 60000 }); await sleep(1500); }
    async function press(sel) { await pg.evaluate(function (s) { document.querySelector(s).click(); }, sel); }
    async function pillClick() { if (!(await pg.isVisible('#pill-team'))) { await pg.click('#idmp-pill-trigger'); await sleep(900); } await pg.click('#pill-team'); }
    async function cfgOf() { return pg.evaluate(function () { return new Promise(function (res) { var r = indexedDB.open('comm_phone', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { var q = r.result.transaction('kv').objectStore('kv').get('cfg'); q.onsuccess = function () { res(q.result || null); }; }; }); }); }
    var D = null;

    console.log('§PILL-OFF');
    await load(URL0);
    var off = await pg.evaluate(function () { var b = document.getElementById('pill-team'), svg = b && b.querySelector('svg');
      return { pill: !!b, title: b && b.title, shapes: svg ? { circle: svg.querySelectorAll('circle').length, path: svg.querySelectorAll('path').length } : null,
        ts: typeof window.TeamSync, cs: typeof window.CommStore, panel: typeof window.TeamPanel, defs: window.TeamDefaults || null,
        scripts: Array.prototype.filter.call(document.scripts, function (s) { return /comm_|team_sync/.test(s.src); }).length, chip: !!document.getElementById('team-chip') }; });
    D = off.defs;
    verdict(off.pill && off.title === 'Team' && off.shapes && off.shapes.circle === 1 && off.shapes.path === 3, 'the Team pill is on the bar without team mode and shows the two-heads (Lucide users) icon', JSON.stringify({ title: off.title, shapes: off.shapes }));
    verdict(off.ts === 'undefined' && off.cs === 'undefined' && off.scripts === 0 && !off.chip, 'without team mode the page still loads no comm_*/team_sync script and has no chip', JSON.stringify({ ts: off.ts, cs: off.cs, scripts: off.scripts, chip: off.chip }));
    verdict(off.panel === 'object' && D && D.repo === 'bim-teams-trial' && D.owner === 'red1oon', 'the shipped system default points at the TRIAL repo (not the real pipe)', JSON.stringify({ owner: D && D.owner, repo: D && D.repo, keyShipped: !!(D && D.token) }));

    console.log('\n§PILL-PANEL');
    await pillClick(); await pg.waitForSelector('#team-panel', { timeout: 8000 }).catch(function () {});
    var pan = await pg.evaluate(function () { var q = function (s) { var e = document.querySelector(s); return e ? (e.value != null && e.tagName === 'INPUT' ? e.value : e.textContent) : null; };
      return { open: !!document.getElementById('team-panel'), source: q('#tp-source'), owner: q('#tp-owner'), repo: q('#tp-repo'), key: q('#tp-key'), trial: q('#tp-trial'), state: q('#tp-state'), guide: (document.getElementById('tp-guide') || {}).href, pair: (document.getElementById('tp-pair') || {}).href }; });
    console.log('   §PILL panel=' + JSON.stringify(pan));
    verdict(pan.open && pan.source === 'System default' && pan.owner === D.owner && pan.repo === D.repo, 'the pill opens the panel showing "System default" with the default repo prefilled', pan.source + ' ' + pan.owner + '/' + pan.repo);
    verdict(D.token ? /Key installed/.test(pan.key) : /not installed/.test(pan.key), 'the key line matches the shipped defaults (' + (D.token ? 'installed' : 'not installed') + ')', pan.key);
    verdict(/one full test cycle/.test(pan.trial) && /off/.test(pan.state), 'the panel says the default is a one-cycle trial and team mode is off', (pan.trial || '').slice(0, 90));
    var g = await fetch(pan.guide).then(function (r) { return r.status; }), pr = await fetch(pan.pair).then(function (r) { return r.status; });
    verdict(g === 200 && pr === 200, 'the guide link and the pairing link both resolve', 'guide=' + g + ' pair=' + pr);

    console.log('\n§PILL-OWN');
    await pg.fill('#tp-owner', 'acme'); await pg.fill('#tp-repo', 'acme-team'); await pg.fill('#tp-token', 'github_pat_OWN');
    await press('#tp-own'); await pg.waitForSelector('#team-panel #tp-source', { timeout: 8000 }); await sleep(300);
    var c1 = await cfgOf(), own = await pg.evaluate(function () { return { source: document.getElementById('tp-source').textContent, trial: document.getElementById('tp-trial').textContent, repo: document.getElementById('tp-repo').value }; });
    verdict(c1 && c1.owner === 'acme' && c1.repo === 'acme-team' && c1.token === 'github_pat_OWN' && c1.trial === false, 'Save as my own stores owner/repo/key with trial=false', JSON.stringify({ owner: c1 && c1.owner, repo: c1 && c1.repo, trial: c1 && c1.trial, token: c1 && (c1.token || '').length + ' chars' }));
    verdict(own.source === 'Your own' && /no trial limit/.test(own.trial) && own.repo === 'acme-team', 'the panel now says "Your own", no trial limit', JSON.stringify(own));
    await press('#tp-sys'); await pg.waitForSelector('#team-panel #tp-source', { timeout: 8000 }); await sleep(300);
    var c2 = await cfgOf(), back = await pg.evaluate(function () { return document.getElementById('tp-source').textContent; });
    verdict(c2 && c2.repo === D.repo && c2.trial === true && back === 'System default', 'Use system default restores the default repo with trial=true', JSON.stringify({ repo: c2 && c2.repo, trial: c2 && c2.trial }));

    console.log('\n§PILL-MODE');
    await press('#tp-mode'); await pg.waitForURL(/team=1/, { timeout: 30000 }); await pg.waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 60000 });
    await pg.waitForSelector('#team-chip', { timeout: 60000 }).catch(function () {}); await sleep(800);
    var on = await pg.evaluate(function () { return { url: location.search, ls: localStorage.getItem('teamMode'), chip: !!document.getElementById('team-chip'), cs: typeof window.CommStore, data: (document.getElementById('team-chip') || { getAttribute: function () { return null; } }).getAttribute('data-team') }; });
    verdict(/team=1/.test(on.url) && on.ls === '1' && on.chip && on.cs === 'object', 'Turn on → ?team=1, switch stored, the Team chip appears (state: ' + on.data + ')', JSON.stringify(on));
    await load(URL0);                                                       // reload WITHOUT ?team=1: the stored switch must keep it on
    await pg.waitForSelector('#team-chip', { timeout: 60000 }).catch(function () {});
    var keep = await pg.evaluate(function () { return { url: location.search, chip: !!document.getElementById('team-chip') }; });
    verdict(!/team=1/.test(keep.url) && keep.chip, 'a reload without ?team=1 keeps team mode on (the switch persists)', JSON.stringify(keep));
    await pillClick(); await pg.waitForSelector('#team-panel', { timeout: 8000 });
    var lbl = await pg.textContent('#tp-mode'); await press('#tp-mode'); await sleep(2500); await pg.waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 60000 }); await sleep(1500);
    var offAgain = await pg.evaluate(function () { return { url: location.search, ls: localStorage.getItem('teamMode'), chip: !!document.getElementById('team-chip'), cs: typeof window.CommStore, scripts: Array.prototype.filter.call(document.scripts, function (s) { return /comm_|team_sync/.test(s.src); }).length }; });
    verdict(/off/.test(lbl) && offAgain.ls === null && !offAgain.chip && offAgain.cs === 'undefined' && offAgain.scripts === 0, 'Turn off → switch cleared, chip gone, no comm scripts (page back to plain)', lbl + ' ' + JSON.stringify(offAgain));

    console.log('\n§PILL-NOERR'); verdict(errors === 0, 'zero page errors', 'errors=' + errors);
  } finally { await browser.close(); server.close(); }
  console.log('\n──────────────────────────────────────────────');
  console.log('§W-TEAM-PILL ' + (fails || !judged ? (judged ? 'FAIL' : 'INCONCLUSIVE') : (inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS')) + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length + ' pageerrors=' + errors);
  process.exit(fails || !judged ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(2); });
