#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-PEOPLE-MODELLER, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.12.G.1. READ THE LOG after every run — the exit code is not evidence.
//   Two REAL Playwright BrowserContexts, the REAL modeller/modeller.html in team mode, pairing through the unmodified phone page (as witness_team_modeller.js), dumb folder pipe.
//   Elements are authored through the Modeller's command API (Bonsai.oplog.commit); selection is the Modeller's own Bonsai.select (fires the same dagevu:select the mouse does);
//   Visit is a real click. Ranking / history are recomputed by THIS file from the raw cl_op rows and the raw head files (not by calling TeamPeople).
//   §PM-HEADSUP  (1) A selects shared element E → B (E selected) shows "A is editing this element" — NO-OP guard: not before A's Visit; (2) A deselects → B clears only after A's Visit AND B's next Visit
//   §PM-RANK     (3) the People list order = newest op/head order recomputed from the raw rows
//   §PM-TTL      (4) a focus older than the TTL is not shown (injected clock); real clock shows it again
//   §PM-OFF      (5) "Don't show what I'm on": pipe bytes carry no label / uu, banner and badge vanish, "active" stays; control: switching back on restores them
//   §PM-HIST     (6) A's "last tasks" = A's raw ops grouped by element
//   §PM-NOSCOPE  the Modeller has no AD dictionary: no scope toggle, no inbox (named limit L2) and Everyone is shown
//   §PM-NOERR    0 page errors
// Run: node modeller/tests/witness_people_modeller.js 2>&1 | tee /tmp/witness_people_modeller.log
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
  console.log('═══ W-PEOPLE-MODELLER — the people strip in the real Modeller, two real browsers (TEAMWORK_FRAMEWORK §13.12.G.1) ═══\n');
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

  var browser = await reqPw().chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }), L = { A: [], B: [], C: [] };
  var HDR = ['A', 'B'];
  try {
    var ctx = { A: await browser.newContext({ viewport: { width: 1280, height: 860 } }), B: await browser.newContext({ viewport: { width: 1280, height: 860 } }), C: await browser.newContext({ viewport: { width: 1280, height: 860 } }) };
    var pg = {};
    for (var who of ['A', 'B', 'C']) {
      await ctx[who].route('https://api.github.com/**', fakeGh);
      pg[who] = await ctx[who].newPage();
      (function (w) { pg[w].on('console', function (m) { var t = m.text(); L[w].push(t); if (/§TEAM_VISIT|§PEOPLE_|🔴/.test(t)) console.log('     [' + w + '] ' + t.slice(0, 330)); });
        pg[w].on('pageerror', function (e) { errors++; L[w].push('PAGEERR ' + e.message); console.log('     [' + w + '] 🔴 pageerror ' + e.message); });
        pg[w].on('dialog', function (d) { d.accept().catch(function () {}); }); })(who);
    }
    var MODELLER = base + '/modeller/modeller.html';
    async function waitModeller(p) { await p.waitForFunction(function () { return window.Bonsai && window.Bonsai.oplog && window.KernelOps && window.Bonsai.group; }, null, { timeout: 90000 }); await sleep(600); }

    // ═══ §TM-PAIR — founder + join + approve on the unmodified phone page, real clicks ═══
    console.log('\n§TM-PAIR');
    var phone = base + '/common/comm/comm_phone.html?gap=0';
    async function ready(p) { await p.waitForSelector('body[data-ready="1"]', { timeout: 120000 }); }
    async function press(p, sel) { await p.click(sel); await ready(p); }
    async function token(p) { await ready(p); await p.fill('#token', 'fake-token-local-folder'); await press(p, '#b-token'); }
    await pg.A.goto(phone); await token(pg.A); await press(pg.A, '#b-found');
    var invite = await pg.A.inputValue('#invite-link');
    await pg.B.goto(invite.replace(/^https?:\/\/[^/]+/, base).replace('#', '?gap=0#')); await token(pg.B);
    await press(pg.B, '#b-join'); var code = (await pg.B.textContent('#mycode')).trim();
    await press(pg.A, '#b-requests');
    var codes = await pg.A.$$eval('#requests .request .code', function (els) { return els.map(function (e) { return e.textContent.trim(); }); });
    await pg.A.selectOption('#requests .request:has-text("' + code + '") .req-role', '102').catch(function () {});
    await pg.A.click('#requests .request:has-text("' + code + '") .b-approve'); await ready(pg.A);
    await press(pg.B, '#b-visit');
    var st = await pg.B.textContent('#pair-state');
    verdict(codes.length === 1 && codes[0] === code && /enrolled/.test(st), 'phone pages paired: founder A approved B\'s code ' + code + ', B says enrolled', codes.join(',') + ' | ' + st.trim());
    var kids = {}; for (var w0 of HDR) kids[w0] = await pg[w0].evaluate(function () { return new Promise(function (res) { var r = indexedDB.open('comm_phone', 1);
      r.onsuccess = function () { var q = r.result.transaction('kv').objectStore('kv').get('device'); q.onsuccess = function () { res(q.result && q.result.kid); }; }; }); });

    async function openModeller(w) {
      await pg[w].goto(MODELLER + '?team=1&pipe=' + encodeURIComponent(PIPE), { waitUntil: 'load' }); await waitModeller(pg[w]);
      await pg[w].waitForSelector('#team-chip[data-team="ready"]', { timeout: 60000 }); await sleep(600);
    }
    for (var w1 of HDR) await openModeller(w1);

    // ── helpers ──
    async function api(w, op, P) { return pg[w].evaluate(async function (a) { var c = await window.Bonsai.oplog.commit({ op_type: a.op, parameters: a.P }); await window.TeamSyncModeller.settle(); return c && c.id; }, { op: op, P: P }); }
    async function waitLog(w, re, from, ms) { var t0 = Date.now(); while (Date.now() - t0 < ms) { var l = L[w].slice(from).find(function (x) { return re.test(x); }); if (l) return l; await sleep(150); } return null; }
    async function visit(w) { var n0 = L[w].length; await pg[w].click('#team-visit'); var l = await waitLog(w, /§TEAM_VISIT /, n0, 60000); await pg[w].evaluate(function () { return window.TeamSyncModeller.settle(); }); await sleep(900); return l; }
    async function rowIdOf(w, uu) { return pg[w].evaluate(function (u) { var r = window.Bonsai.oplog.db.exec("SELECT id FROM kernel_ops WHERE op_uuid='" + u + "' AND undone=0"); return r.length ? r[0].values[0][0] : null; }, uu); }
    async function select(w, id) { await pg[w].evaluate(function (i) { window.Bonsai.select(i); }, id); await sleep(500); }
    async function selectNone(w) { await pg[w].evaluate(function () { window.Bonsai.select(null); }); await sleep(500); }
    async function banner(w) { return pg[w].evaluate(function () { var b = document.getElementById('team-headsup'); return b ? { text: b.textContent.replace(/\s+/g, ' ').trim(), lines: Array.prototype.map.call(b.querySelectorAll('.team-headsup-line'), function (x) { return { person: x.getAttribute('data-person'), uu: x.getAttribute('data-uu'), text: x.textContent.trim() }; }), h: b.getBoundingClientRect().height } : null; }); }
    async function raw(w) { return pg[w].evaluate(function () { return window.TeamSyncModeller.store().query('SELECT envelope FROM cl_op').map(function (r) { return JSON.parse(r.envelope); }); }); }
    function folderObj(rel) { var p = path.join(FOLDER, rel); return fs.existsSync(p) ? { text: fs.readFileSync(p, 'utf8'), json: JSON.parse(fs.readFileSync(p, 'utf8')) } : null; }
    async function openPeople(w) { var open = await pg[w].evaluate(function () { return getComputedStyle(document.getElementById('team-people')).display !== 'none'; }); if (!open) await pg[w].click('#b-teams'); await pg[w].waitForSelector('#team-people .tp-person', { timeout: 15000 }); await sleep(400); }
    async function closePeople(w) { var open = await pg[w].evaluate(function () { return getComputedStyle(document.getElementById('team-people')).display !== 'none'; }); if (open) await pg[w].click('#b-teams'); await sleep(200); }
    async function strip(w) { return pg[w].evaluate(function () { return { scopeBtn: !!document.getElementById('tp-m-scope'), noscope: !!document.getElementById('tp-noscope'), inbox: !!document.getElementById('tp-inbox'), hideH: document.getElementById('tp-hide').getBoundingClientRect().height,
      rows: Array.prototype.map.call(document.querySelectorAll('#team-people .tp-person'), function (r) { return { person: r.getAttribute('data-person'), self: r.getAttribute('data-self') === '1', off: r.getAttribute('data-off') === '1', name: r.querySelector('.tp-name').textContent.trim(), active: r.querySelector('.tp-active').textContent.trim(), h: r.getBoundingClientRect().height,
        badges: Array.prototype.map.call(r.querySelectorAll('.tp-badge'), function (b) { return { uu: b.getAttribute('data-uu'), text: b.textContent.trim() }; }) }; }), toggleH: document.getElementById('b-teams').getBoundingClientRect().height }; }); }
    var ms = function (n) { return n * 60000; };

    // ═══ setup: A creates E1, B creates E2, everyone visits ═══
    console.log('\n§PM-ON');
    var e1id = await api('A', 'GEOM_EXTRUDE', { profile: { w: 2, h: 1 }, dir: [0, 0, 2.5] });
    await visit('A'); await visit('B');
    var e2id = await api('B', 'GEOM_EXTRUDE', { profile: { w: 1, h: 1 }, dir: [0, 0, 1] });
    await visit('B'); await visit('A');
    var envsA = await raw('A'), creates = envsA.filter(function (e) { return e.body.op_type === 'CRUD_CREATE' && e.target.table === 'bim_element'; });
    var kidA = await pg.A.evaluate(function () { return window.TeamSyncModeller.store().kid; }), kidB = await pg.B.evaluate(function () { return window.TeamSyncModeller.store().kid; }), space = await pg.A.evaluate(function () { return window.TeamSyncModeller.store().space; });
    var E1 = creates.filter(function (e) { return e.author === kidA; })[0], E2 = creates.filter(function (e) { return e.author === kidB; })[0];
    verdict(creates.length === 2 && E1 && E2 && Math.abs(Date.now() - E1.ts) < 10 * 60000 && Math.abs(Date.now() - E2.ts) < 10 * 60000, 'two shared elements exist on A: E1 authored by A, E2 authored by B (raw cl_op), both signed with a WALL-CLOCK ts (within 10 min of now — the kernel row timestamps are synthetic 2023 values)', 'creates=' + creates.length + ' ageE1(s)=' + (E1 && Math.round((Date.now() - E1.ts) / 1000)));
    var uu1 = E1 && E1.target.uu;
    var pre = folderObj('s/' + space + '/f/' + kidA);
    verdict(pre && pre.json.focus.length === 0 && (await banner('B')) === null && (await banner('A')) === null, 'precondition: nothing selected, A\'s focus object on the pipe is the empty set, no banner on either device', 'entries=' + (pre && pre.json.focus.length));

    // ═══ §PM-HEADSUP (1)(2) ═══
    console.log('\n§PM-HEADSUP');
    var idB1 = await rowIdOf('B', uu1), idA1 = await rowIdOf('A', uu1);
    await select('B', idB1);
    var foB = await pg.B.evaluate(function () { return window.TeamSyncModeller.focusOwn(); });
    verdict(foB.length === 1 && foB[0].uu === uu1 && (await banner('B')) === null, 'NO-OP guard: B selects E1 (its own focus = E1) and A has nothing selected → no banner on B', JSON.stringify(foB.map(function (e) { return e.label; })));
    await select('A', idA1);
    var foA = await pg.A.evaluate(function () { return window.TeamSyncModeller.focusOwn(); }), pubA0 = folderObj('s/' + space + '/f/' + kidA);
    verdict(foA.length === 1 && foA[0].uu === uu1 && pubA0.json.focus.length === 0, 'A selects E1: A\'s own focus = E1 ("' + (foA[0] && foA[0].label) + '") but the pipe still holds the empty set (as fresh as the last Visit)', 'pipe entries=' + pubA0.json.focus.length);
    await visit('B');
    verdict((await banner('B')) === null, 'CONTROL: B Visits while A has E1 selected but has NOT visited → still no banner', '');
    await visit('A');
    var pubA1 = folderObj('s/' + space + '/f/' + kidA);
    verdict(pubA1.json.focus.length === 1 && pubA1.json.focus[0].uu === uu1 && pubA1.json.focus[0].table === 'bim_element' && pubA1.json.sig.length > 100, 'A Visits: the pipe object lists E1 (table bim_element), signed', JSON.stringify(pubA1.json.focus.map(function (e) { return e.label; })));
    await visit('B');
    var genesis = (await raw('B')).filter(function (e) { return e.body.op_type === 'GENESIS'; })[0], nameA = genesis.body.params.founder.name, bn = await banner('B');
    verdict(bn && bn.lines.length === 1 && bn.lines[0].uu === uu1 && bn.lines[0].text === nameA + ' is editing this element (just now)' && bn.h >= 44, 'B Visits with E1 selected: "' + (bn && bn.lines[0] && bn.lines[0].text) + '" (name = A\'s founder name from the raw GENESIS), label >= 44 px high', 'h=' + (bn && Math.round(bn.h)));
    await selectNone('A');
    var foA2 = await pg.A.evaluate(function () { return window.TeamSyncModeller.focusOwn(); });
    await visit('B');
    verdict(foA2.length === 0 && (await banner('B')) !== null, 'A deselects (own focus empty); B Visits BEFORE A does → the label is still there (advisory, as fresh as A\'s last Visit)', '');
    await visit('A');
    verdict(folderObj('s/' + space + '/f/' + kidA).json.focus.length === 0, 'A Visits: the pipe object is overwritten with the empty set', '');
    await visit('B');
    verdict((await banner('B')) === null, 'B\'s next Visit clears the label', '');

    // ═══ §PM-TTL (4) ═══
    console.log('\n§PM-TTL');
    var idA1b = await rowIdOf('A', uu1), idB1b = await rowIdOf('B', uu1);
    await select('A', idA1b); await visit('A'); await select('B', idB1b); await visit('B');
    var shown1 = await banner('B');
    await pg.B.evaluate(function () { window.TeamSyncModeller._setClock(function () { return Date.now() + 31 * 60000; }); return window.TeamSyncModeller.refreshPeople(); }); await sleep(400);
    var gone = await banner('B');
    await pg.B.evaluate(function () { window.TeamSyncModeller._setClock(null); return window.TeamSyncModeller.refreshPeople(); }); await sleep(400);
    var back = await banner('B');
    verdict(shown1 && !gone && back, 'A\'s focus is shown; with B\'s injected clock 31 min ahead (TTL 30 min) it is NOT shown; with the real clock it is shown again (CONTROL)', JSON.stringify({ shown: !!shown1, at31min: !!gone, real: !!back }));

    // ═══ §PM-RANK (3) ═══
    console.log('\n§PM-RANK');
    await visit('A'); await visit('B');     // B last: nobody visits between B's Visit and reading the list
    await openPeople('B'); var sB = await strip('B');
    var envsB = await raw('B'), kidPerson = {}, nm = {};
    var gp = envsB.filter(function (e) { return e.body.op_type === 'GENESIS'; })[0].body.params.founder; kidPerson[gp.kid] = gp.person_uu.toLowerCase(); nm[gp.person_uu.toLowerCase()] = gp.name;
    envsB.filter(function (e) { return e.body.op_type === 'PERSON'; }).forEach(function (e) { nm[String(e.body.params.person_uu).toLowerCase()] = e.body.params.name; });
    envsB.filter(function (e) { return e.body.op_type === 'ENROLL'; }).forEach(function (e) { kidPerson[e.body.params.kid] = String(e.body.params.person_uu).toLowerCase(); });
    var last = {}; envsB.forEach(function (e) { var p = kidPerson[e.author]; if (p && (last[p] == null || e.ts > last[p])) last[p] = e.ts; });
    walk(path.join(FOLDER, 's', space, 'h'), '', []).forEach(function (k) { var hd = JSON.parse(fs.readFileSync(path.join(FOLDER, 's', space, 'h', k), 'utf8')), p = kidPerson[hd.author]; if (p && (last[p] == null || hd.ts > last[p])) last[p] = hd.ts; });
    var expect = Object.keys(last).sort(function (x, y) { return last[y] - last[x] || (x < y ? -1 : 1); }), got = sB.rows.map(function (r) { return r.person; });
    if (sB.rows.length < 2) incon('§PM-RANK', 'fewer than 2 people — an ordering is vacuous');
    else verdict(got.join() === expect.join(), 'the People list order [' + sB.rows.map(function (r) { return r.name; }).join(', ') + '] equals the newest op/head order recomputed from the raw rows [' + expect.map(function (p) { return nm[p]; }).join(', ') + ']', 'ages(s)=' + expect.map(function (p) { return Math.round((Date.now() - last[p]) / 1000); }).join(','));
    verdict(sB.rows[0].self === true && expect.slice().reverse().join() !== got.join(), 'CONTROL: B (who just Visited) is first and the reversed order differs from what is shown', 'first=' + sB.rows[0].name);
    verdict(sB.rows.every(function (r) { return r.h >= 44 && /^active /.test(r.active); }) && sB.toggleH >= 36 && sB.hideH >= 20, 'rows are >= 44 px high and the Team icon (the pill-rail icon, the ONE control now, §15.15.1) is >= 36 px; every row says "active …"', JSON.stringify(sB.rows.map(function (r) { return Math.round(r.h); })) + ' toggle=' + Math.round(sB.toggleH));
    console.log('\n§PM-NOSCOPE'); 
    verdict(sB.scopeBtn === false && sB.noscope === true && sB.inbox === false && sB.rows.length === 2, 'the Modeller has no AD dictionary: no scope toggle, a plain note instead, no inbox, everyone shown (named limit L2)', JSON.stringify({ scopeBtn: sB.scopeBtn, note: sB.noscope, inbox: sB.inbox }));
    var tip = await pg.B.evaluate(function () { return document.getElementById('team-label').title; });
    verdict(/active/.test(tip) && tip.split('\n').length === 2, 'the chip tooltip lists both people with their activity', JSON.stringify(tip));

    // ═══ §PM-HIST (6) ═══
    console.log('\n§PM-HIST');
    var personA = kidPerson[kidA];
    await pg.B.click('#team-people .tp-person[data-person="' + personA + '"]'); await sleep(500);
    var hist = await pg.B.evaluate(function (p) { return Array.prototype.map.call(document.querySelectorAll('#team-people .tp-person[data-person="' + p + '"] .tp-hist'), function (h) { return { table: h.getAttribute('data-table'), uu: h.getAttribute('data-uu'), count: Number(h.getAttribute('data-count')), text: h.textContent.trim() }; }); }, personA);
    var mine = envsB.filter(function (e) { return kidPerson[e.author] === personA && !/^comm_/.test(e.target.table); }).sort(function (a, b) { return b.ts - a.ts || b.seq - a.seq; }).slice(0, 10), grp = {};
    mine.forEach(function (e) { var k = e.target.table + '|' + e.target.uu; grp[k] = (grp[k] || 0) + 1; });
    var gotH = {}; hist.forEach(function (h) { gotH[h.table + '|' + h.uu] = h.count; });
    if (!mine.length) incon('§PM-HIST', 'A authored no business ops');
    else verdict(JSON.stringify(Object.keys(grp).sort().map(function (k) { return [k, grp[k]]; })) === JSON.stringify(Object.keys(gotH).sort().map(function (k) { return [k, gotH[k]]; })) && gotH['bim_element|' + uu1] >= 1 && hist.every(function (h) { return /^extrude [0-9a-f]{8} · /.test(h.text) && /(just now|\d+ min ago)$/.test(h.text); }), 'A\'s "last tasks" in B\'s list = A\'s raw cl_op ops grouped by element (' + mine.length + ' ops → ' + Object.keys(grp).length + ' element(s)); E1 is among them', JSON.stringify(hist.map(function (h) { return h.count + ':' + h.text; })));
    await closePeople('B');

    // ═══ §PM-OFF (5) ═══
    console.log('\n§PM-OFF');
    await select('A', await rowIdOf('A', uu1)); await visit('A'); await visit('B');
    var preOff = await banner('B');
    await openPeople('A'); await pg.A.check('#tp-hide'); await sleep(400); await closePeople('A');
    await visit('A'); await visit('B');
    var offObj = folderObj('s/' + space + '/f/' + kidA), offBanner = await banner('B');
    await openPeople('B'); var sOff = await strip('B'); await closePeople('B');
    var rowA = sOff.rows.filter(function (r) { return r.person === personA; })[0];
    verdict(preOff && offObj.json.off === true && offObj.json.focus.length === 0 && offObj.text.indexOf(uu1) < 0 && offObj.text.indexOf('extrude') < 0, 'switch-off: before it B saw the label; after it the pipe bytes of A\'s focus object carry no label and no element uu — only {off:true}', 'bytes=' + offObj.text.length);
    verdict(offBanner === null && rowA && rowA.off && rowA.badges.length === 0 && /^active /.test(rowA.active), 'B shows no label on E1 and A\'s row has no badge — only "' + (rowA && rowA.active) + '"', '');
    await openPeople('A'); await pg.A.uncheck('#tp-hide'); await sleep(400); await closePeople('A');
    await visit('A'); await visit('B');
    var onBanner = await banner('B');
    verdict(onBanner && onBanner.lines.length === 1, 'CONTROL: switching it back on and Visiting restores the label', onBanner && onBanner.text);

    console.log('\n§PM-NOERR'); verdict(errors === 0, 'zero page errors on both users', 'errors=' + errors);
  } finally { await browser.close(); server.close(); try { fs.rmSync(FOLDER, { recursive: true, force: true }); } catch (e) {} }
  console.log('\n──────────────────────────────────────────────');
  console.log('§W-PEOPLE-MODELLER ' + (fails || !judged ? (judged ? 'FAIL' : 'INCONCLUSIVE') : (inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS')) + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length + ' pageerrors=' + errors);
  process.exit(fails || !judged ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(2); });
