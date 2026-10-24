#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-TEAM-ICON-MODELLER, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §15.15.1-§15.15.3. READ THE LOG after every run — the exit code is not evidence.
//   Two REAL Playwright BrowserContexts, the REAL modeller/modeller.html, dumb folder pipe. NOTHING is paired on the phone page: the whole pairing runs through the ONE Team icon and its panel.
//   §TI-ONE      DISPROVES "two identical icons": no #team-people-toggle anywhere, exactly one #b-teams, state off before anything
//   §TI-ON       the icon opens the panel; "Turn on team mode" reloads and the panel reopens by itself with Start a team / Join; the phone page is never requested
//   §TI-PAIR     A starts, B joins from A's invite link, A lists B's code and approves, B Visits: both "team devices 2"; icon off -> pending (B) -> on (both) from aria-pressed
//   §TI-AVATAR   A picks a07 in the panel grid; after A's and B's Visit B's People row for A carries a07; each person without a choice shows defaultFor(person_uu); a heads-up label carries the avatar
//   §TI-POPOVER  enrolled: the icon toggles the People popover (with "Team settings"), it does not open the panel
//   §TI-NOERR    0 page errors
// Run: node modeller/tests/witness_team_icon_modeller.js 2>&1 | tee /tmp/witness_team_icon_modeller.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var fails = 0, judged = 0, inconclusive = [], errors = 0;
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function incon(label, why) { inconclusive.push(label); console.log('   ⚪ INCONCLUSIVE ' + label + ' — ' + why); }
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n;
  if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function sha1(b) { return crypto.createHash('sha1').update(b).digest('hex'); }
function kidOfName(n) { var p = n.split('/'); return (p.length >= 4 && p[0] === 's' && /^[0-9a-f]{64}$/.test(p[1]) && (p[2] === 'o' || p[2] === 'h' || p[2] === 'r')) ? p[3] : null; }   // §13.6 space-scoped names

(async function () {
  console.log('═══ W-TEAM-ICON-MODELLER — the ONE Team icon, in-panel pairing and avatars, two real browsers (TEAMWORK_FRAMEWORK §15.15) ═══\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'team-modeller-'));
  // ── the dumb folder server (GET/PUT /pipe/f/<name>, GET /pipe/list?prefix=) + the static repo ──
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    var f = path.join(ROOT, p === '/' ? '/modeller/modeller.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';

  // ── a stand-in for api.github.com for the UNMODIFIED phone page: a thin view of the SAME folder (one branch per device) ──
  var blobs = {}, trees = {}, commits = {}, commitKid = {};
  function namesByKid() { var m = {}; walk(FOLDER, '', []).forEach(function (n) { var k = kidOfName(n); if (k) (m[k] = m[k] || []).push(n); }); return m; }
  function commitOf(kid) { var ns = (namesByKid()[kid] || []).sort(), h = crypto.createHash('sha1'); ns.forEach(function (n) { h.update(n); h.update(fs.readFileSync(path.join(FOLDER, n))); }); var c = h.digest('hex'); commitKid[c] = kid; return c; }
  async function fakeGh(route) {
    var rq = route.request(), u = new URL(rq.url()), m = rq.method(), p = u.pathname.replace('/repos/red1oon/bim-teams-pipe', '');
    var cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'access-control-expose-headers': '*' };
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    function J(st, b) { return route.fulfill({ status: st, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(b) }); }
    var body = rq.postData() ? JSON.parse(rq.postData()) : null, mm;
    if (m === 'GET' && p === '/git/matching-refs/heads/dev/') { var nk = namesByKid(); return J(200, Object.keys(nk).map(function (k) { return { ref: 'refs/heads/dev/' + k, object: { sha: commitOf(k) } }; })); }
    if (m === 'GET' && (mm = /^\/git\/trees\/([0-9a-f]{40})$/.exec(p))) { var kid = commitKid[mm[1]]; if (!kid) return J(404, {});
      return J(200, { tree: (namesByKid()[kid] || []).map(function (n) { var b = fs.readFileSync(path.join(FOLDER, n)), s = sha1(b); blobs[s] = b; return { path: n, type: 'blob', sha: s, size: b.length }; }) }); }
    if (m === 'GET' && (mm = /^\/git\/blobs\/([0-9a-f]{40})$/.exec(p))) { var bb = blobs[mm[1]]; return bb ? J(200, { content: bb.toString('base64'), encoding: 'base64' }) : J(404, {}); }
    if (m === 'GET' && (mm = /^\/git\/ref\/heads\/dev\/(.+)$/.exec(p))) { return (namesByKid()[mm[1]] ? J(200, { object: { sha: commitOf(mm[1]) } }) : J(404, {})); }
    if (m === 'GET' && (mm = /^\/git\/commits\/([0-9a-f]{40})$/.exec(p))) return J(200, { tree: { sha: 'f'.repeat(40) } });
    if (m === 'POST' && p === '/git/blobs') { var buf = Buffer.from(body.content, 'base64'), s2 = sha1(buf); blobs[s2] = buf; return J(201, { sha: s2 }); }
    if (m === 'POST' && p === '/git/trees') { var id = crypto.randomBytes(20).toString('hex'); trees[id] = body.tree; return J(201, { sha: id }); }
    if (m === 'POST' && p === '/git/commits') { var cid = crypto.randomBytes(20).toString('hex'); commits[cid] = body.tree; return J(201, { sha: cid }); }
    if ((m === 'PATCH' && /^\/git\/refs\/heads\/dev\//.test(p)) || (m === 'POST' && p === '/git/refs')) {
      (trees[commits[body.sha]] || []).forEach(function (e) { var fp = path.join(FOLDER, e.path); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, blobs[e.sha]); });
      return J(m === 'POST' ? 201 : 200, { object: { sha: body.sha } }); }
    return J(404, { message: 'fake-gh: unhandled ' + m + ' ' + p });
  }


  var browser = await reqPw().chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }), L = { A: [], B: [] }, phoneHits = 0;
  try {
    var ctx = { A: await browser.newContext({ viewport: { width: 1280, height: 860 } }), B: await browser.newContext({ viewport: { width: 1280, height: 860 } }) }, pg = {};
    for (var who of ['A', 'B']) {
      await ctx[who].route('https://api.github.com/**', fakeGh);
      pg[who] = await ctx[who].newPage();
      pg[who].on('request', function (rq) { if (/comm_phone\.html/.test(rq.url())) phoneHits++; });
      (function (w) { pg[w].on('console', function (m) { var t = m.text(); L[w].push(t); if (/§TEAM_PAIR|§TEAM_VISIT|§PEOPLE_AVATAR|§TEAM_PANEL|🔴/.test(t)) console.log('     [' + w + '] ' + t.slice(0, 220)); });
        pg[w].on('pageerror', function (e) { errors++; L[w].push('PAGEERR ' + e.message); console.log('     [' + w + '] 🔴 pageerror ' + e.message); });
        pg[w].on('dialog', function (d) { d.accept().catch(function () {}); }); })(who);
    }
    var MODELLER = base + '/modeller/modeller.html?pipe=' + encodeURIComponent(PIPE);
    async function waitModeller(p) { await p.waitForFunction(function () { return window.Bonsai && window.Bonsai.oplog && window.Bonsai.group && window.TeamPanel; }, null, { timeout: 90000 }); await sleep(600); }
    async function state(w) { return pg[w].evaluate(function () { var b = document.getElementById('b-teams'); return b ? { st: b.getAttribute('data-team-state'), pressed: b.getAttribute('aria-pressed'), on: b.classList.contains('on'), n: document.querySelectorAll('#b-teams').length } : null; }); }
    async function panelOpen(w) { await pg[w].waitForSelector('#team-panel', { timeout: 30000 }); await sleep(500); }
    async function waitLog(w, re, from, ms) { var t0 = Date.now(); while (Date.now() - t0 < ms) { var l = L[w].slice(from).find(function (x) { return re.test(x); }); if (l) return l; await sleep(150); } return null; }
    async function visit(w) { var n0 = L[w].length; await pg[w].click('#team-visit'); var l = await waitLog(w, /§TEAM_VISIT /, n0, 60000); await pg[w].evaluate(function () { return window.TeamSyncModeller.settle(); }); await sleep(900); return l; }
    async function chipText(w) { return pg[w].evaluate(function () { var c = document.getElementById('team-label'); return c ? c.textContent : null; }); }

    // ═══ §TI-ONE ═══
    console.log('\n§TI-ONE');
    await pg.A.goto(MODELLER); await waitModeller(pg.A);
    var one = await pg.A.evaluate(function () { return { toggle: !!document.getElementById('team-people-toggle'), icons: document.querySelectorAll('#b-teams').length, panel: !!document.getElementById('team-panel'), chip: !!document.getElementById('team-chip') }; }), st0 = await state('A');
    verdict(!one.toggle && one.icons === 1 && !one.panel && !one.chip && st0.st === 'off' && st0.pressed === 'false', 'team mode off: exactly ONE Team icon (#b-teams, state off, aria-pressed=false), no bottom-right People button, no panel, no chip', JSON.stringify({ one: one, st: st0 }));

    // ═══ §TI-ON ═══
    console.log('\n§TI-ON');
    await pg.A.click('#b-teams'); await panelOpen('A');
    var pOff = await pg.A.evaluate(function () { return { state: document.getElementById('tp-state').textContent, mode: document.getElementById('tp-mode').textContent, found: !!document.getElementById('tp-found'), dots: !!document.getElementById('tp-dots'), avatar: !!document.getElementById('tp-avatar') && document.getElementById('tp-avatar').style.display !== 'none' }; });
    verdict(/off/.test(pOff.state) && /Turn on/.test(pOff.mode) && !pOff.found && !pOff.avatar, 'the icon opens the panel: "Team mode is off", a Turn on button, no Start / Join yet (team mode is off)', JSON.stringify(pOff));
    var navP = pg.A.waitForNavigation({ waitUntil: 'load', timeout: 60000 }); await pg.A.click('#tp-mode'); await navP; await waitModeller(pg.A);
    await panelOpen('A'); await pg.A.waitForSelector('#tp-found', { timeout: 30000 });
    var pOn = await pg.A.evaluate(function () { return { state: document.getElementById('tp-state').textContent, found: !!document.getElementById('tp-found'), join: !!document.getElementById('tp-join'), inv: !!document.getElementById('tp-inv'), avatar: document.getElementById('tp-avatar').style.display !== 'none', grid: document.querySelectorAll('.tp-av-pick').length }; });
    verdict(/on/.test(pOn.state) && pOn.found && pOn.join && pOn.inv && pOn.avatar && pOn.grid === 24 && phoneHits === 0, 'after "Turn on team mode" the page reloads and the panel REOPENS by itself: Start a team, invite field + Join, the avatar grid (24); the phone page was never requested', JSON.stringify(Object.assign({ phoneHits: phoneHits }, pOn)));

    // ═══ §TI-PAIR ═══
    console.log('\n§TI-PAIR');
    await pg.A.click('#tp-found'); await pg.A.waitForSelector('#tp-paired', { timeout: 60000 }); await sleep(600);
    var link = await pg.A.inputValue('#tp-link'), stA = await state('A'), pairedTxt = await pg.A.textContent('#tp-paired');
    verdict(/Paired/.test(pairedTxt) && /#join=[0-9a-f]{64}$/.test(link) && /team=1/.test(link) && stA.st === 'on' && stA.pressed === 'true' && stA.on, 'A: Start a team -> "Paired", an invite link (#join=<64 hex>), the icon is ON (aria-pressed=true)', JSON.stringify({ txt: pairedTxt.trim(), tail: link.slice(-20), st: stA }));
    await pg.A.click('#tp-close'); await sleep(300);
    await pg.B.goto(link); await waitModeller(pg.B); await panelOpen('B'); await pg.B.waitForSelector('#tp-join', { timeout: 30000 });
    var invPre = await pg.B.inputValue('#tp-inv'); await pg.B.click('#tp-join'); await pg.B.waitForSelector('#tp-code', { timeout: 60000 });
    var code = (await pg.B.textContent('#tp-code')).trim(), stB1 = await state('B');
    verdict(invPre === link.split('#join=')[1] && /^[0-9A-F]{4}-[0-9A-F]{4}$/.test(code) && stB1.st === 'pending' && stB1.pressed === 'false', 'B opens the invite link: the panel opens with the invite PREFILLED; Join shows B\'s device code; the icon is PENDING (not on yet)', JSON.stringify({ code: code, st: stB1 }));
    await pg.B.click('#tp-close'); await sleep(300);
    await pg.A.click('#b-teams'); await pg.A.waitForSelector('#team-people', { state: 'attached' }); await sleep(400);
    var popA0 = await pg.A.evaluate(function () { var b = document.getElementById('team-people'); return { shown: getComputedStyle(b).display !== 'none', panel: !!document.getElementById('team-panel') }; });
    verdict(popA0.shown && !popA0.panel, '§TI-POPOVER enrolled A clicks the icon: the People popover opens under it, the panel does NOT', JSON.stringify(popA0));
    await pg.A.waitForSelector('#tp-settings', { timeout: 15000 }); await pg.A.click('#tp-settings'); await panelOpen('A');
    await pg.A.click('#tp-req'); await pg.A.waitForSelector('#tp-reqs .tp-request', { timeout: 30000 });
    var reqs = await pg.A.$$eval('#tp-reqs .tp-rcode', function (els) { return els.map(function (e) { return e.textContent.trim(); }); }), roles = await pg.A.$$eval('#tp-reqs .tp-role option', function (os) { return os.map(function (o) { return o.value + ':' + o.textContent; }); });
    verdict(reqs.length === 1 && reqs[0] === code && roles.length === 1 && /^102:/.test(roles[0]), 'A lists exactly B\'s code ' + code + ' with the one Modeller role (102)', JSON.stringify({ reqs: reqs, roles: roles }));
    await pg.A.click('#tp-reqs .tp-approve'); await pg.A.waitForSelector('#tp-paired', { timeout: 60000 }); await sleep(800);
    await visit('B'); await sleep(400);
    var ctA = await chipText('A'), ctB = await chipText('B'), stB2 = await state('B'), stA2 = await state('A');
    verdict(/team devices 2/.test(ctA) && /team devices 2/.test(ctB) && stB2.st === 'on' && stB2.pressed === 'true' && stA2.st === 'on', 'after Approve and B\'s Visit: both chips say "team devices 2"; B\'s icon went off -> pending -> ON', JSON.stringify({ A: ctA, B: ctB, stB: stB2 }));
    await pg.A.click('#tp-close').catch(function () {}); await sleep(300);

    // ═══ §TI-AVATAR ═══
    console.log('\n§TI-AVATAR');
    var AVm = await pg.A.evaluate(function () { return { ids: window.TeamAvatars.ids().length, a07: window.TeamAvatars.valid('a07') }; });
    var puA = await pg.A.evaluate(function () { return new Promise(function (res) { var r = indexedDB.open('comm_phone', 1); r.onsuccess = function () { var q = r.result.transaction('kv').objectStore('kv').get('device'); q.onsuccess = function () { res(q.result.person_uu); }; }; }); });
    var puB = await pg.B.evaluate(function () { return new Promise(function (res) { var r = indexedDB.open('comm_phone', 1); r.onsuccess = function () { var q = r.result.transaction('kv').objectStore('kv').get('device'); q.onsuccess = function () { res(q.result.person_uu); }; }; }); });
    var dfl = await pg.A.evaluate(function (a) { return { A: window.TeamAvatars.defaultFor(a[0]), B: window.TeamAvatars.defaultFor(a[1]) }; }, [puA, puB]);
    await pg.A.click('#b-teams'); await sleep(300); await pg.A.click('#tp-settings'); await panelOpen('A');
    var pre = await pg.A.evaluate(function () { return { pressed: Array.prototype.map.call(document.querySelectorAll('.tp-av-pick[aria-pressed="true"]'), function (b) { return b.getAttribute('data-avatar'); }), note: document.getElementById('tp-av-note').textContent }; });
    verdict(AVm.ids === 24 && AVm.a07 && pre.pressed.length === 0 && /Not chosen yet/.test(pre.note), 'NO-OP guard: before choosing, A has no avatar picked (grid of 24, none pressed, "Not chosen yet")', JSON.stringify(pre));
    await pg.A.click('.tp-av-pick[data-avatar="a07"]'); await sleep(500);
    var post = await pg.A.evaluate(function () { return { pressed: Array.prototype.map.call(document.querySelectorAll('.tp-av-pick[aria-pressed="true"]'), function (b) { return b.getAttribute('data-avatar'); }), kv: null }; });
    var kvAv = await pg.A.evaluate(function () { return new Promise(function (res) { var r = indexedDB.open('comm_phone', 1); r.onsuccess = function () { var q = r.result.transaction('kv').objectStore('kv').get('cfg'); q.onsuccess = function () { res(q.result.avatar); }; }; }); });
    verdict(post.pressed.join() === 'a07' && kvAv === 'a07', 'A picks a07: the grid shows it pressed and it is saved on A\'s browser (cfg.avatar)', JSON.stringify({ pressed: post.pressed, kv: kvAv }));
    await pg.A.click('#tp-close'); await sleep(300);
    await visit('A'); await visit('B'); await visit('A');
    await pg.B.click('#b-teams'); await pg.B.waitForSelector('#team-people .tp-person', { timeout: 20000 }); await sleep(500);
    var rowsB = await pg.B.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#team-people .tp-person'), function (r) { return { person: r.getAttribute('data-person'), self: r.getAttribute('data-self') === '1', av: (r.querySelector('.tp-avatar') || {}).getAttribute ? r.querySelector('.tp-avatar').getAttribute('data-avatar') : null, svg: !!r.querySelector('.tp-avatar svg') }; }); });
    var rA = rowsB.filter(function (r) { return r.person === puA.toLowerCase() || r.person === puA; })[0], rB = rowsB.filter(function (r) { return r.self; })[0];
    if (rowsB.length < 2 || !rA || !rB) incon('§TI-AVATAR rows', 'fewer than 2 rows or the rows are not identifiable: ' + JSON.stringify(rowsB));
    else {
      verdict(rA.av === 'a07' && rA.svg, 'B\'s People list shows A with the avatar A CHOSE (a07), drawn as an SVG head — it travelled through the signed focus board', JSON.stringify(rA));
      verdict(rB.av === dfl.B && rB.svg && dfl.B !== dfl.A, 'B has chosen nothing: B\'s own row draws the deterministic default for B\'s person (' + dfl.B + '), different from A\'s default (' + dfl.A + ')', JSON.stringify({ rB: rB, dfl: dfl }));
    }
    var rowsA = await (async function () { await pg.A.click('#b-teams'); await pg.A.waitForSelector('#team-people .tp-person', { timeout: 20000 }); await sleep(500); return pg.A.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#team-people .tp-person'), function (r) { return { person: r.getAttribute('data-person'), self: r.getAttribute('data-self') === '1', av: r.querySelector('.tp-avatar').getAttribute('data-avatar') }; }); }); })();
    var aB = rowsA.filter(function (r) { return !r.self; })[0];
    verdict(aB && aB.av === dfl.B, 'A sees B with the same default (' + dfl.B + ') B sees for itself — the default agrees on both devices with no message', JSON.stringify(rowsA));
    // heads-up label with the avatar
    await pg.A.click('#b-teams'); await sleep(300);
    console.log('§TI-STEP create-block');
    var uu = await pg.A.evaluate(async function () { var c = await window.Bonsai.oplog.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 2, h: 1 }, dir: [0, 0, 1] } }); await window.TeamSyncModeller.settle(); return window.Bonsai.oplog.db.exec("SELECT op_uuid FROM kernel_ops WHERE id=" + c.id)[0].values[0][0]; });   // row ids are per device and renumbered by every Visit: keep the uuid, resolve the row id where it is used
    await visit('A'); await visit('B');
    console.log('§TI-STEP ids uu=' + uu);
    var rowByUu = function (w) { return pg[w].evaluate(function (u) { var r = window.Bonsai.oplog.db.exec("SELECT id FROM kernel_ops WHERE op_uuid='" + u + "' AND undone=0"); return r.length ? r[0].values[0][0] : null; }, uu); };
    var idA = await rowByUu('A'), idB = await rowByUu('B'); console.log('§TI-STEP rows A=' + idA + ' B=' + idB);
    if (idA == null || idB == null) { incon('§TI-AVATAR heads-up', 'the shared block is not on both windows (A=' + idA + ' B=' + idB + ')'); throw new Error('no shared block'); }
    await pg.B.evaluate(function (i) { window.Bonsai.select(i); }, idB); await pg.A.evaluate(function (i) { window.Bonsai.select(i); }, idA); await sleep(500);
    await visit('A'); await visit('B');
    var hu = await pg.B.evaluate(function () { var b = document.getElementById('team-headsup'); return b ? { text: b.textContent.replace(/\s+/g, ' ').trim(), av: (b.querySelector('.tp-avatar') || {}).getAttribute ? b.querySelector('.tp-avatar').getAttribute('data-avatar') : null, svg: !!b.querySelector('.tp-avatar svg') } : null; });
    verdict(hu && /is editing this element/.test(hu.text) && hu.av === 'a07' && hu.svg, 'B\'s heads-up label "<name> is editing this element" carries A\'s avatar a07', JSON.stringify(hu));

    console.log('\n§TI-NOERR');
    verdict(errors === 0, '0 page errors on both windows', 'pageerrors=' + errors);
  } finally { await browser.close(); server.close(); try { fs.rmSync(FOLDER, { recursive: true, force: true }); } catch (e) {} }
  console.log('\n' + (fails ? '🔴' : inconclusive.length ? '⚪' : '🟢') + ' §W-TEAM-ICON-MODELLER ' + (fails ? 'FAIL' : inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length + ' pageerrors=' + errors);
  process.exit(fails || errors ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(1); });
