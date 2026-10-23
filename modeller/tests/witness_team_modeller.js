#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-TEAM-MODELLER, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §15 (Modeller case). READ THE LOG after every run — the exit code is not evidence.
//   Two REAL Playwright BrowserContexts (separate storage), the REAL modeller/modeller.html, pairing through the unmodified common/comm/comm_phone.html (founder + join +
//   approve), then the Modeller in team mode (?team=1) on the SAME browser storage. A dumb folder pipe via CommPipe.httpPipe (no GitHub); the phone page pairs through a
//   Playwright stand-in for api.github.com that is a thin view of that folder. Features are authored through the Modeller's own command API (Bonsai.oplog.commit — the call the
//   gizmo release makes); Visit is a real click. Every number is read from the live page: kernel_ops rows, moveDeltaFor, mesh bbox centres/sizes, verifyChain, the engine's conflict list.
//   Every arm names the issue it proves or disproves; an arm that judged nothing prints INCONCLUSIVE, never PASS.
//   §TM-OFF        disproves "team code touches an ordinary Modeller session" (separate browser C).
//   §TM-PAIR       pairing + chip.
//   §TM-CREATE     A creates + moves (negative integers!), B Visits and shows the same element at the same place (NO-OP guard: B empty before its Visit).
//   §TM-DIFF       different elements moved on each device: both apply, 0 conflicts.
//   §TM-CROSS      same element, same axis, crossed: one conflict per device, last agreed position kept; an axis only one device moved still applies.
//   §TM-RESOLVE    a later move by someone who saw both clears it; both converge.
//   §TM-LOCALONLY  an op outside the slice (GEOM_ROTATE) is not sent; the kept row follows its parent's new row id after the rebuild.
//   §TM-XOFN       X of N GEOM op types shared.   §TM-NOERR  0 page errors.
// Run: node modeller/tests/witness_team_modeller.js 2>&1 | tee /tmp/witness_team_modeller.log
// Run: node erp/tests/witness_team_so.js 2>&1 | tee /tmp/witness_team_so.log
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
  console.log('═══ W-TEAM-MODELLER — the real Modeller in team mode, two real browsers (TEAMWORK_FRAMEWORK §15) ═══\n');
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
      (function (w) { pg[w].on('console', function (m) { var t = m.text(); L[w].push(t); if (/§TEAM_|§COMM_SYNC|🔴/.test(t)) console.log('     [' + w + '] ' + t.slice(0, 330)); });
        pg[w].on('pageerror', function (e) { errors++; L[w].push('PAGEERR ' + e.message); console.log('     [' + w + '] 🔴 pageerror ' + e.message); });
        pg[w].on('dialog', function (d) { d.accept().catch(function () {}); }); })(who);
    }
    var MODELLER = base + '/modeller/modeller.html';
    async function waitModeller(p) { await p.waitForFunction(function () { return window.Bonsai && window.Bonsai.oplog && window.KernelOps && window.Bonsai.group; }, null, { timeout: 90000 }); await sleep(600); }

    // ═══ §TM-OFF — a SEPARATE browser (C) so its model can never leak into A/B ═══
    console.log('§TM-OFF');
    await pg.C.goto(MODELLER, { waitUntil: 'load' }); await waitModeller(pg.C);
    var off = await pg.C.evaluate(async function () {
      var O = window.Bonsai.oplog, c = await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 1, h: 1 }, dir: [0, 0, 2] } });
      return { rowId: c && c.id, len: O.length, chip: !!document.getElementById('team-chip'), box: !!document.getElementById('team-conflicts'), ts: typeof window.TeamSyncModeller, cs: typeof window.CommStore,
        scripts: Array.prototype.filter.call(document.scripts, function (s) { return /comm_|team_sync|team_defaults|team_trial/.test(s.src); }).length };
    });
    if (!off.len) incon('§TM-OFF', 'the control commit produced no row — nothing to prove "ordinary session untouched" with');
    else verdict(off.len === 1 && !off.chip && !off.box && off.ts === 'undefined' && off.cs === 'undefined' && off.scripts === 0, 'without the switch: no chip, no conflict box, no TeamSyncModeller/CommStore global, no comm/team script tag — and the Modeller still commits a feature', JSON.stringify(off));
    var offTeam = L.C.filter(function (t) { return /§TEAM_/.test(t); });
    verdict(offTeam.length === 0, 'without the switch the page emits no §TEAM line', 'lines=' + offTeam.length);
    await ctx.C.close();

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
    async function chip(w) { return pg[w].evaluate(function () { var c = document.getElementById('team-chip'), b = document.getElementById('team-visit');
      return c ? { text: c.textContent.replace(/\s+/g, ' ').trim(), cursor: b ? getComputedStyle(b).cursor : null, conflicts: Number(c.getAttribute('data-conflicts')), localonly: Number(c.getAttribute('data-localonly')) } : null; }); }
    var cA = await chip('A'), cB = await chip('B');
    verdict(cA && cB && cA.text.indexOf(kids.A.slice(0, 4).toUpperCase() + '-' + kids.A.slice(4, 8).toUpperCase()) >= 0 && /team devices 2/.test(cA.text) && cA.cursor === 'pointer',
      'the Modeller chip shows device code · team devices 2 · a Visit button with the hand cursor (A)', JSON.stringify(cA));
    verdict(cB && /team devices (1|2)/.test(cB.text), 'the Modeller chip reads B\'s identity from the phone page storage (B)', JSON.stringify(cB));

    // ── model helpers (all numbers come from the live page) ──
    async function api(w, op, P) { return pg[w].evaluate(async function (a) { var c = await window.Bonsai.oplog.commit({ op_type: a.op, parameters: a.P }); await window.TeamSyncModeller.settle(); return c && c.id; }, { op: op, P: P }); }
    async function snap(w) {
      return pg[w].evaluate(function () {
        var O = window.Bonsai.oplog, r = O.db.exec("SELECT id, op_uuid, op_type, parameters, undone, gid, user_tag FROM kernel_ops WHERE op_type LIKE 'GEOM%' ORDER BY id"), rows = [];
        if (r.length) r[0].values.forEach(function (v) { rows.push({ id: v[0], uu: v[1], type: v[2], P: JSON.parse(v[3]), undone: v[4], gid: v[5], tag: v[6] }); });
        var g = window.Bonsai.group(), T = window.THREE, boxes = {}, nMesh = 0;
        g.children.forEach(function (m) { if (!m.isMesh || m.userData.featureId == null) return; nMesh++; var b = new T.Box3().setFromObject(m), k = m.userData.featureId; if (boxes[k]) boxes[k].union(b); else boxes[k] = b; });
        var el = {};
        rows.forEach(function (x) { if (x.undone || /^GEOM_(MOVE|ROTATE|SCALE)$/.test(x.type) || x.P.parent != null) return;
          var b = boxes[x.id], c = b ? b.getCenter(new T.Vector3()) : null, s = b ? b.getSize(new T.Vector3()) : null, d = O.moveDeltaFor(x.id);
          el[x.uu] = { id: x.id, type: x.type, tag: x.tag, centre: c ? [c.x, c.y, c.z] : null, size: s ? [s.x, s.y, s.z] : null, off: [d.dx, d.dy, d.dz] }; });
        return { rows: rows, el: el, nMesh: nMesh, len: O.length };
      });
    }
    async function verifyChain(w) { return pg[w].evaluate(async function () { var v = await window.KernelOps.verifyChain(window.Bonsai.oplog.db); return !!(v && v.ok); }); }
    async function waitLog(w, re, from, ms) { var t0 = Date.now(); while (Date.now() - t0 < ms) { var l = L[w].slice(from).find(function (x) { return re.test(x); }); if (l) return l; await sleep(150); } return null; }
    function dumpFolder() { walk(FOLDER, '', []).forEach(function (n) { var b = fs.readFileSync(path.join(FOLDER, n)); console.log('     [folder] ' + n.replace(/[0-9a-f]{64}/, '<space>') + ' ' + b.length + 'B ' + JSON.stringify(b.slice(0, 14).toString('latin1'))); }); }
    async function visit(w) { var n0 = L[w].length; await pg[w].click('#team-visit'); var l = await waitLog(w, /§TEAM_VISIT /, n0, 60000); if (!l || /error/.test(l)) dumpFolder(); await pg[w].evaluate(function () { return window.TeamSyncModeller.settle(); }); await sleep(500); return l; }
    async function conflicts(w) { return pg[w].evaluate(async function () { var cf = await window.TeamSyncModeller.store().conflicts(); return cf.map(function (k) { return { uu: k.uu, col: k.col, before: window.TeamSyncModeller.decV(k.before), values: k.candidates.map(function (x) { return window.TeamSyncModeller.decV(x.value); }) }; }); }); }
    function near(a, b, tol) { return a && b && a.length === b.length && a.every(function (v, i) { return Math.abs(v - b[i]) <= (tol || 1e-3); }); }
    function maxErr(a, b) { return Math.max.apply(null, a.map(function (v, i) { return Math.abs(v - b[i]); })); }
    var sentLog = function (w, re) { return L[w].filter(function (t) { return re.test(t); }); };

    // ═══ §TM-CREATE — A creates + moves (with a NEGATIVE integer), B must show the same element at the same place ═══
    console.log('\n§TM-CREATE');
    var e1id = await api('A', 'GEOM_EXTRUDE', { profile: { w: 2, h: 1 }, dir: [0, 0, 2.5] });
    await api('A', 'GEOM_MOVE', { parent: e1id, dx: 2, dy: -3, dz: 0 });
    var A0 = await snap('A'), E1 = Object.keys(A0.el)[0], a0c = A0.el[E1] && A0.el[E1].centre;
    var outLines = sentLog('A', /§TEAM_OUT/);
    verdict(!!E1 && outLines.length === 2 && /op=GEOM_EXTRUDE as=CRUD_CREATE/.test(outLines[0]) && /op=GEOM_MOVE as=CRUD_UPDATE .*cols=pos_x,pos_y /.test(outLines[1]),
      'A\'s extrude is sent as a CREATE and its move (dx=2, dy=-3 — a negative integer, F7) as an UPDATE of pos_x,pos_y only', outLines.map(function (x) { return x.slice(0, 110); }).join(' | '));
    verdict(a0c && near(a0c, [3, -2.5, 1.25], 1e-3) && near(A0.el[E1].off, [2, -3, 0], 1e-9), 'A\'s own element is at the expected centre [3,-2.5,1.25] (extrude 2x1x2.5 at origin has centre [1,0.5,1.25]; moved by 2,-3,0)', JSON.stringify(A0.el[E1]));
    var B0 = await snap('B');
    if (B0.len !== 0 || B0.nMesh !== 0) incon('§TM-CREATE NO-OP guard', 'B already had rows/meshes before its Visit: rows=' + B0.len + ' meshes=' + B0.nMesh);
    else verdict(true, 'NO-OP guard: before its Visit B has 0 GEOM rows and 0 meshes (so what it shows afterwards can only have come through the pipe)');
    await visit('A'); var A1 = await snap('A');
    verdict(A1.el[E1] && maxErr(A1.el[E1].centre, a0c) < 1e-3 && A1.el[E1].tag === 'team' && A1.len === 2, 'A\'s Visit rebuilds A\'s own model faithfully: same element, same centre (err ' + (A1.el[E1] ? maxErr(A1.el[E1].centre, a0c).toExponential(1) : '?') + '), rows re-tagged team, 2 rows', JSON.stringify(A1.el[E1]));
    await visit('B'); var B1 = await snap('B'), be = B1.el[E1];
    verdict(!!be && B1.len === 2 && be.tag === 'team', 'B shows the element after its Visit: same uu, 2 GEOM rows (create + move), tagged team', 'rows=' + B1.len + ' el=' + JSON.stringify(be));
    verdict(be && be.centre && maxErr(be.centre, a0c) < 1e-3 && near(be.off, [2, -3, 0], 1e-9), 'B\'s mesh centre equals A\'s to ' + (be && be.centre ? maxErr(be.centre, a0c).toExponential(1) : '?') + ' m and B\'s net move is (2,-3,0): the negative integer survived the pipe', JSON.stringify(be && be.centre));
    verdict(await verifyChain('B') && await verifyChain('A'), 'both devices\' rebuilt kernel chains verify (verifyChain)');

    // ── more elements, one of them with negative-integer geometry (GEOM_EXTRUDE_POLY points) ──
    var e2id = await api('A', 'GEOM_EXTRUDE', { profile: { w: 1, h: 3 }, dir: [0, 0, 1] });
    var e3id = await api('A', 'GEOM_EXTRUDE_POLY', { profile: { points: [[-2, -1], [0, -1], [0, 1], [-2, 1]] }, depth: 3 });
    var A2 = await snap('A'); var uuOf = function (S, id) { return Object.keys(S.el).filter(function (u) { return S.el[u].id === id; })[0]; };
    var E2 = uuOf(A2, e2id), E3 = uuOf(A2, e3id);
    await visit('A'); await visit('B'); var B2 = await snap('B'), A2b = await snap('A');
    verdict(E2 && E3 && B2.el[E2] && B2.el[E3] && near(B2.el[E3].centre, A2.el[E3].centre, 1e-3) && near(B2.el[E3].size, A2.el[E3].size, 1e-3),
      'a polygon extrude with negative-integer points ([-2,-1]…) arrives with the same size and centre on B (' + JSON.stringify(B2.el[E3] && B2.el[E3].size) + ')', JSON.stringify(B2.el[E3]));

    // ═══ §TM-DIFF — different elements, both apply ═══
    console.log('\n§TM-DIFF');
    var idsA = {}, idsB = {}; idsA[E1] = A2b.el[E1].id; idsB[E1] = B2.el[E1].id; idsA[E2] = A2b.el[E2].id; idsB[E2] = B2.el[E2].id;
    var dA = await snap('A'), dBb = await snap('B'), preA = dA.el[E1].centre.slice(), preB2 = dBb.el[E2].centre.slice();
    await api('A', 'GEOM_MOVE', { parent: idsA[E1], dx: 1, dy: 0, dz: 0 });
    await api('B', 'GEOM_MOVE', { parent: idsB[E2], dx: 0, dy: 4, dz: 0 });
    var mA = await snap('A'), mB = await snap('B');
    var movedOwn = Math.abs(mA.el[E1].centre[0] - preA[0] - 1) < 1e-3 && Math.abs(mB.el[E2].centre[1] - preB2[1] - 4) < 1e-3;
    if (!movedOwn) incon('§TM-DIFF', 'a device\'s own move did not show on its own screen before the Visit (A dx ' + (mA.el[E1].centre[0] - preA[0]) + ', B dy ' + (mB.el[E2].centre[1] - preB2[1]) + ') — nothing to compare');
    else verdict(true, 'VACUOUS guard: before any Visit each device\'s own move shows on its own screen (A moved E1 +1 in x, B moved E2 +4 in y)');
    await visit('A'); await visit('B'); await visit('A');
    var fA = await snap('A'), fB = await snap('B'), cfA = await conflicts('A'), cfB = await conflicts('B');
    verdict(cfA.length === 0 && cfB.length === 0, 'different elements: 0 conflicts on both devices', 'A=' + cfA.length + ' B=' + cfB.length);
    verdict(near(fA.el[E1].centre, [preA[0] + 1, preA[1], preA[2]], 1e-3) && near(fB.el[E1].centre, fA.el[E1].centre, 1e-3) && near(fA.el[E2].centre, [preB2[0], preB2[1] + 4, preB2[2]], 1e-3) && near(fB.el[E2].centre, fA.el[E2].centre, 1e-3),
      'both moves applied on both devices: E1 x+1 and E2 y+4 (centres equal across devices)', 'E1 ' + JSON.stringify(fA.el[E1].centre) + ' E2 ' + JSON.stringify(fA.el[E2].centre));

    // ═══ §TM-CROSS — same element, same axis, crossed ═══
    console.log('\n§TM-CROSS');
    var agreed = fA.el[E1].centre.slice(), agreedOff = fA.el[E1].off.slice(), idA1 = fA.el[E1].id, idB1 = fB.el[E1].id;
    await api('A', 'GEOM_MOVE', { parent: idA1, dx: 1, dy: 0, dz: 0 });        // x -> agreed+1
    await api('B', 'GEOM_MOVE', { parent: idB1, dx: 2, dy: 0, dz: 1 });        // x -> agreed+2 (clashes), z -> +1 (only B touches z)
    var xA = await snap('A'), xB = await snap('B');
    verdict(Math.abs(xA.el[E1].centre[0] - agreed[0] - 1) < 1e-3 && Math.abs(xB.el[E1].centre[0] - agreed[0] - 2) < 1e-3,
      'NO-OP guard: before the Visits each device shows its OWN position (A x+1, B x+2)', 'A ' + xA.el[E1].centre[0].toFixed(3) + ' B ' + xB.el[E1].centre[0].toFixed(3) + ' agreed ' + agreed[0].toFixed(3));
    await visit('A'); await visit('B'); await visit('A');
    var zA = await snap('A'), zB = await snap('B'), czA = await conflicts('A'), czB = await conflicts('B'), chA = await chip('A'), chB = await chip('B');
    verdict(czA.length === 1 && czB.length === 1 && czA[0].col === 'pos_x' && czB[0].col === 'pos_x', 'each device shows exactly ONE open conflict, on pos_x of the element', 'A=' + JSON.stringify(czA) + ' B=' + JSON.stringify(czB));
    var vals = czA[0] ? czA[0].values.slice().sort() : [];
    verdict(czA[0] && JSON.stringify(vals) === JSON.stringify([agreedOff[0] + 1, agreedOff[0] + 2].sort()) && Math.abs(czA[0].before - agreedOff[0]) < 1e-9, 'the conflict names both crossed values (' + JSON.stringify(vals) + ') and the last agreed one (' + (czA[0] && czA[0].before) + ')', JSON.stringify(czA[0]));
    verdict(chA.conflicts === 1 && chB.conflicts === 1, 'the chip counts the conflict on both devices (data-conflicts)', JSON.stringify([chA.conflicts, chB.conflicts]));
    var txt = await pg.A.$eval('#team-conflicts', function (e) { return e.textContent; });
    verdict(/Current record was changed by another user, please ReQuery/.test(txt), 'the conflict list shows iDempiere\'s CurrentRecordModified text', txt.slice(0, 140));
    verdict(Math.abs(zA.el[E1].centre[0] - agreed[0]) < 1e-3 && Math.abs(zB.el[E1].centre[0] - agreed[0]) < 1e-3, 'both devices keep the LAST AGREED x (' + agreed[0].toFixed(3) + ') — neither crossed move wins', 'A ' + zA.el[E1].centre[0].toFixed(3) + ' B ' + zB.el[E1].centre[0].toFixed(3));
    verdict(Math.abs(zA.el[E1].centre[2] - agreed[2] - 1) < 1e-3 && Math.abs(zB.el[E1].centre[2] - agreed[2] - 1) < 1e-3 && Math.abs(zA.el[E1].centre[1] - agreed[1]) < 1e-3, 'the axis only B moved (z +1) still applies on BOTH devices, y untouched', 'A z ' + zA.el[E1].centre[2].toFixed(3) + ' B z ' + zB.el[E1].centre[2].toFixed(3));

    // ═══ §TM-RESOLVE — a later move by someone who has seen both ═══
    console.log('\n§TM-RESOLVE');
    if (czA.length !== 1) incon('§TM-RESOLVE', 'there was no conflict to resolve');
    else {
      await api('A', 'GEOM_MOVE', { parent: zA.el[E1].id, dx: 1.5, dy: 0, dz: 0 });
      await visit('A'); await visit('B'); await visit('A');
      var rA = await snap('A'), rB = await snap('B'), crA = await conflicts('A'), crB = await conflicts('B');
      verdict(crA.length === 0 && crB.length === 0, 'after A (who had seen both) moves again, the conflict is gone on both devices', 'A=' + crA.length + ' B=' + crB.length);
      verdict(Math.abs(rA.el[E1].centre[0] - agreed[0] - 1.5) < 1e-3 && near(rA.el[E1].centre, rB.el[E1].centre, 1e-3), 'both devices converge on x = agreed + 1.5 (' + rA.el[E1].centre[0].toFixed(3) + ' / ' + rB.el[E1].centre[0].toFixed(3) + ') with identical centres', JSON.stringify(rA.el[E1].centre));
    }

    // ═══ §TM-LOCALONLY — an op class outside the slice stays on the device; the kept row follows its parent's new id ═══
    console.log('\n§TM-LOCALONLY');
    var s0A = await snap('A'), s0B = await snap('B'), nLo = L.A.length, loBefore = (await chip('A')).localonly, idE1 = s0A.el[E1].id, sizeBefore = s0A.el[E1].size.slice();
    await api('A', 'GEOM_GRID_MOVE', { commands: [] });          // a local-only row with NO parent: it is kept BEFORE the projection, so every projected row id shifts by one
    await api('A', 'GEOM_ROTATE', { parent: idE1, drot: 90 });
    var rotLines = L.A.slice(nLo).filter(function (t) { return /§TEAM_LOCALONLY op=GEOM_ROTATE/.test(t); }), loAfter = (await chip('A')).localonly;
    verdict(rotLines.length === 1 && loAfter === loBefore + 2, 'a GEOM_ROTATE (and a parent-less GEOM_GRID_MOVE) is NOT sent: one §TEAM_LOCALONLY line for the rotate with its reason, chip local-only ' + loBefore + ' → ' + loAfter, (rotLines[0] || '').slice(0, 150));
    var s1A = await snap('A'), spun = Math.abs(s1A.el[E1].size[0] - sizeBefore[1]) < 1e-3 && Math.abs(s1A.el[E1].size[1] - sizeBefore[0]) < 1e-3;
    if (!spun) incon('§TM-LOCALONLY remap', 'the rotation did not change the extents on A (' + JSON.stringify(sizeBefore) + ' → ' + JSON.stringify(s1A.el[E1].size) + ') — nothing to follow through the rebuild');
    else {
      await visit('A'); await visit('B');
      var s2A = await snap('A'), s2B = await snap('B'), rotRow = s2A.rows.filter(function (r) { return r.type === 'GEOM_ROTATE'; })[0], visA = L.A.filter(function (t) { return /§TEAM_VISIT /.test(t); }).pop();
      if (s2A.el[E1].id === idE1) incon('§TM-LOCALONLY remap', 'E1 kept its row id (' + idE1 + ') through the rebuild — the remap was not exercised');
      else verdict(s2A.el[E1].id === idE1 + 1, 'VACUOUS guard: the rebuild renumbered E1\'s row ' + idE1 + ' → ' + s2A.el[E1].id + ' (the local-only parent-less row now sits first)');
      verdict(rotRow && rotRow.P.parent === s2A.el[E1].id && s2A.el[E1].id !== idE1 && rotRow.id > s2A.el[E1].id && rotRow.tag === 'local', 'A\'s kept local ROTATE row now points at the element\'s NEW row id (' + (rotRow && rotRow.P.parent) + ' = ' + s2A.el[E1].id + ') and sits after it', JSON.stringify(rotRow));
      verdict(/remapMiss=0/.test(visA) && /kept=2 \(after=1\)/.test(visA) && /remapped=1/.test(visA), 'the Visit logged 2 kept rows (1 placed after the projection), 1 id remapped, 0 remap misses', (visA || '').slice(-190));
      verdict(Math.abs(s2A.el[E1].size[0] - sizeBefore[1]) < 1e-3, 'A\'s rotation still applies after the rebuild (extents ' + JSON.stringify(s2A.el[E1].size.map(function (v) { return +v.toFixed(3); })) + ')', '');
      verdict(s2B.rows.every(function (r) { return r.type !== 'GEOM_ROTATE'; }) && Math.abs(s2B.el[E1].size[0] - sizeBefore[0]) < 1e-3, 'B never receives the rotation: no GEOM_ROTATE row, extents unchanged (' + JSON.stringify(s2B.el[E1].size.map(function (v) { return +v.toFixed(3); })) + ')', '');
    }

    // ═══ §TM-XOFN — the denominator ═══
    console.log('\n§TM-XOFN');
    var shared = await pg.A.evaluate(function () { return window.TeamSyncModeller.classes(); });
    var workerSrc = fs.readFileSync(path.join(ROOT, 'modeller', 'bonsai_kernel_worker.js'), 'utf8'), kernelSrc = fs.readFileSync(path.join(ROOT, 'modeller', 'bonsai_kernel.js'), 'utf8');
    var all = {}; (workerSrc + kernelSrc).replace(/GEOM_[A-Z_]+/g, function (m) { all[m] = 1; return m; });
    var allN = Object.keys(all).length, shN = Object.keys(shared).filter(function (k) { return all[k]; }).length;
    console.log('   §TM-XOFN GEOM op types named in bonsai_kernel_worker.js + bonsai_kernel.js: N=' + allN + ' | shared=' + shN + ' (' + Object.keys(shared).join(',') + ') | local-only=' + (allN - shN) + ' | witnessed: ' + ['GEOM_EXTRUDE', 'GEOM_EXTRUDE_POLY', 'GEOM_MOVE'].join(',') + ' (3) + GEOM_ROTATE as the local-only control');
    verdict(allN > 0 && shN > 0 && shN === Object.keys(shared).length, 'X of N: ' + shN + ' of ' + allN + ' GEOM op types are shared; ' + (allN - shN) + ' stay local-only; witnessed 3 shared + 1 local-only control — NOT "the Modeller works"');

    console.log('\n§TM-NOERR'); verdict(errors === 0, 'zero page errors on all pages', 'errors=' + errors);
  } finally { await browser.close(); server.close(); try { fs.rmSync(FOLDER, { recursive: true, force: true }); } catch (e) {} }
  console.log('\n──────────────────────────────────────────────');
  console.log('§W-TEAM-MODELLER ' + (fails || !judged ? (judged ? 'FAIL' : 'INCONCLUSIVE') : (inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS')) + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length + ' pageerrors=' + errors + (inconclusive.length ? ' [' + inconclusive.join(', ') + ']' : ''));
  process.exit(fails || !judged ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(2); });
