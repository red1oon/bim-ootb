#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * witness_comm_phone_page.js — W-PHONE-PAGE. Spec: bim-compiler prompts/TEAMWORK_FRAMEWORK.md §12.13.
 * The user's own laptop + phone test, rehearsed with REAL clicks on common/comm/comm_phone.html: a desktop context
 * ("laptop") and an emulated Pixel 7 context ("phone"), separate storage, real GitHub pipe (red1oon/bim-teams-pipe,
 * token from `gh auth token` TYPED into the token field). Every step is a button press a person would make.
 *   §PHONE-PAIR     — phone joins by the invite link, shows a code; laptop sees the SAME code in its requests and approves.
 *   §PHONE-SYNC     — an order made on the phone appears on the laptop after visits; an edit on the laptop reaches the phone.
 *   §PHONE-CONFLICT — both edit the same order without visiting in between → both screens show the conflict, total kept.
 *   §PHONE-RESUME   — reloading the phone keeps its device code, team and orders (IndexedDB), no re-pairing.
 *   §PHONE-EARLY    — while loading, buttons are disabled and progress shows; once ready Save works (the user hit "doesn't react").
 *   §PHONE-NOERR    — zero page errors.
 * Cleans up its GitHub branches. Run: node common/tests/witness_comm_phone_page.js 2>&1 | tee /tmp/witness_comm_phone_page.log
 */
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var TOKEN = cp.execSync('gh auth token', { encoding: 'utf8' }).trim();
var PB = null; try { PB = JSON.parse(fs.readFileSync(require('os').homedir() + '/.config/bim-teams/postbox.json', 'utf8')); } catch (e) {}   // optional: the Gmail visit log
var fails = 0, judged = 0, errors = 0;
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
async function gh(method, p) { var r = await fetch('https://api.github.com/repos/red1oon/bim-teams-pipe' + p, { method: method, headers: { 'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json' } }); return r.status; }

(async function () {
  console.log('═══ W-PHONE-PAGE — laptop + phone, real clicks, real GitHub (TEAMWORK_FRAMEWORK §12.13) ═══\n');
  var server = http.createServer(function (req, res) { var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var url = 'http://127.0.0.1:' + server.address().port + '/common/comm/comm_phone.html?gap=5000';
  var pw = reqPw(), browser = await pw.chromium.launch({ args: ['--disable-gpu'] }), kids = [];
  try {
    var lap = await (await browser.newContext()).newPage(), ph = await (await browser.newContext(pw.devices['Pixel 7'])).newPage();
    [['laptop', lap], ['phone', ph]].forEach(function (x) { x[1].on('console', function (m) { if (/§PHONE|§COMM_SYNC|🔴/.test(m.text())) console.log('     [' + x[0] + '] ' + m.text()); });
      x[1].on('pageerror', function (e) { errors++; console.log('     [' + x[0] + '] 🔴 pageerror ' + e.message); }); });
    async function ready(p) { await p.waitForSelector('body[data-ready="1"]', { timeout: 90000 }); }
    async function press(p, sel) { await p.click(sel); await ready(p); }
    async function token(p) { await ready(p); await p.fill('#token', TOKEN); if (PB) { await p.fill('#pb-url', PB.url); await p.fill('#pb-secret', PB.secret); } await press(p, '#b-token'); }
    var notes = []; [lap, ph].forEach(function (p) { p.on('console', function (m) { var t = m.text(); if (/§PHONE_NOTE/.test(t)) notes.push(t); }); });

    async function kidOf(p) { return p.evaluate(function () { return new Promise(function (res) { var r = indexedDB.open('comm_phone', 1);
      r.onsuccess = function () { var q = r.result.transaction('kv').objectStore('kv').get('device'); q.onsuccess = function () { res(q.result && q.result.kid); }; }; }); }); }
    console.log('\n§PHONE-EARLY');
    var early = await (await browser.newContext()).newPage(); early.on('pageerror', function (e) { errors++; console.log('     [early] 🔴 pageerror ' + e.message); });
    await early.goto(url, { waitUntil: 'domcontentloaded' });
    var dis = await early.$eval('#b-token', function (b) { return b.disabled; }), prog = await early.isVisible('#boot');
    await ready(early);
    var en = await early.$eval('#b-token', function (b) { return !b.disabled; }), progGone = !(await early.isVisible('#boot'));
    await early.fill('#token', 'github_pat_EARLY'); await press(early, '#b-token');
    var saved = await early.isVisible('#s-space');
    verdict(dis && prog && en && progGone && saved, 'while loading: Save disabled + progress shown; when ready: enabled, progress gone, Save works',
      'disabled=' + dis + ' progress=' + prog + ' enabled-after=' + en + ' progress-gone=' + progGone + ' saved=' + saved);
    await early.context().close();

    await lap.goto(url); await token(lap); kids.push(await kidOf(lap)); await press(lap, '#b-found');
    var invite = await lap.inputValue('#invite-link'), kidL = await lap.evaluate(function () { return document.getElementById('status').textContent; });
    console.log('   §PHONE laptop founded; invite link = …' + invite.slice(-20));
    await ph.goto(invite.replace(/^https?:\/\/[^/]+/, 'http://127.0.0.1:' + server.address().port).replace('#', '?gap=5000#')); await token(ph); kids.push(await kidOf(ph));
    var preset = await ph.inputValue('#invite'); await press(ph, '#b-join');
    var code = (await ph.textContent('#mycode')).trim();
    console.log('   §PHONE phone joined (invite prefilled from link: ' + (preset.length === 64) + '), code ' + code);

    console.log('\n§PHONE-PAIR');
    await press(lap, '#b-requests');
    var codes = await lap.$$eval('#requests .request .code', function (els) { return els.map(function (e) { return e.textContent.trim(); }); });
    verdict(codes.length === 1 && codes[0] === code, 'the laptop lists exactly the phone\'s code ' + code + ' (requests from other spaces ignored)', codes.join(','));
    await lap.click('#requests .request:has-text("' + code + '") .b-approve'); await ready(lap);
    await press(ph, '#b-visit');
    var st = await ph.textContent('#pair-state');
    verdict(/enrolled/.test(st) && await ph.isVisible('#s-work'), 'after one visit the phone says it is in the team and shows Work', st.trim());

    console.log('\n§PHONE-SYNC');
    await press(ph, '#b-new'); await press(ph, '#b-visit'); await press(lap, '#b-visit');
    var lapOrders = await lap.$$eval('#orders .row b', function (e) { return e.map(function (x) { return x.textContent; }); });
    verdict(lapOrders.length === 1 && /^O-/.test(lapOrders[0]), 'the phone\'s order appears on the laptop', lapOrders.join(','));
    await lap.fill('#orders .row input', '150'); await press(lap, '#orders .row .b-save'); await press(lap, '#b-visit'); await press(ph, '#b-visit');
    var phTot = (await ph.textContent('#orders .row .tot')).trim();
    verdict(phTot === '150', 'the laptop\'s edit (150) reaches the phone', 'phone shows ' + phTot);

    console.log('\n§PHONE-CONFLICT');
    await lap.fill('#orders .row input', '200'); await press(lap, '#orders .row .b-save');
    await ph.fill('#orders .row input', '300'); await press(ph, '#orders .row .b-save');
    await press(lap, '#b-visit'); await press(ph, '#b-visit'); await press(lap, '#b-visit');
    var cL = await lap.$$eval('.conflict', function (e) { return e.map(function (x) { return x.textContent; }); }), cP = await ph.$$eval('.conflict', function (e) { return e.map(function (x) { return x.textContent; }); });
    var tL = (await lap.textContent('#orders .row .tot')).trim(), tP = (await ph.textContent('#orders .row .tot')).trim();
    console.log('   §PHONE conflict laptop=' + JSON.stringify(cL) + ' total=' + tL + '  phone=' + JSON.stringify(cP) + ' total=' + tP);
    verdict(cL.length === 1 && cP.length === 1 && /200/.test(cL[0]) && /300/.test(cL[0]), 'both screens show one conflict naming 200 and 300');
    verdict(tL === '150' && tP === '150', 'both keep the last agreed total (150)', tL + '/' + tP);

    console.log('\n§PHONE-RESUME');
    var codeBefore = code; await ph.reload(); await ready(ph);
    var codeAfter = (await ph.textContent('#mycode')).trim(), ordersAfter = await ph.$$eval('#orders .row', function (e) { return e.length; });
    verdict(codeAfter === codeBefore && ordersAfter === 1 && await ph.isVisible('#s-work'), 'after a reload the phone keeps its code, team and order', codeAfter + ' orders=' + ordersAfter);
    var dl = (await lap.textContent('#delivery')).trim(); console.log('   §PHONE laptop delivery: ' + dl);
    console.log('\n§PHONE-VISITLOG');
    if (!PB) console.log('   ⚪ INCONCLUSIVE — no ~/.config/bim-teams/postbox.json, visit log not judged');
    else {
      var okN = notes.filter(function (t) { return /§PHONE_NOTE ok /.test(t); }), bad = notes.filter(function (t) { return /failed/.test(t); });
      var lg = await (await fetch(PB.url + '?secret=' + encodeURIComponent(PB.secret) + '&max=40', { redirect: 'follow' })).json();
      var subs = (lg.entries || []).map(function (e) { return e.subject; }), mine = okN.map(function (t) { return t.replace(/^.*§PHONE_NOTE ok /, '').replace(/ \(confirmed.*$/, ''); });
      console.log('   §PHONE visit notes ok=' + okN.length + ' failed=' + bad.length + (bad[0] ? ' first failure: ' + bad[0].slice(0, 120) : ''));
      verdict(okN.length >= 8 && !bad.length, 'every visit from BOTH browsers left a note in the Gmail log', 'ok=' + okN.length + ' failed=' + bad.length);
      verdict(mine.every(function (m) { return subs.indexOf(m) >= 0; }), 'each note the page reported is really in the log (read back by subject + note id)');
    }

    console.log('\n§PHONE-NOERR'); verdict(errors === 0, 'zero page errors on both devices', 'errors=' + errors);
  } finally {
    await browser.close(); server.close();
    for (var k of kids) console.log('   §PHONE cleanup dev/' + k + ' → ' + await gh('DELETE', '/git/refs/heads/dev/' + k));
  }
  console.log('\n──────────────────────────────────────────────');
  console.log('§W-PHONE-PAGE ' + (fails || !judged ? (judged ? 'FAIL' : 'INCONCLUSIVE') : 'PASS') + ' judged=' + judged + ' fails=' + fails);
  process.exit(fails || !judged ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(2); });
