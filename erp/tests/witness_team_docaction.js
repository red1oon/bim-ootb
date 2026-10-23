#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-TEAM-DOCACTION, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.7 (W2). READ THE LOG after every run — the exit code is not evidence.
//   Same harness as witness_team_so.js (two REAL browsers, REAL erp/idempiere.html?team=1, window 143, dumb folder pipe). Documents are completed through the
//   host DocAction lane (__crud.process — the one iDempiere's Process pill / DocAction bar call), so the model layer's whole fan-out group commits.
//   §DA-SYNC   A completes an order, Visits; B Visits: B's DocStatus lane (readTip) = CO, its grid docstatus = CO, and its consequence rows equal A's.
//   §DA-CROSS  both complete the SAME order before any Visit: one docstatus conflict on both, the order stays DR and NONE of its consequences show (all-or-none).
//   §DA-NOERR  0 page errors.
//   Every arm names the issue it proves or disproves; an arm that judged nothing prints INCONCLUSIVE, never PASS.
// Run: node erp/tests/witness_team_docaction.js 2>&1 | tee /tmp/witness_team_docaction.log
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
  console.log('═══ W-TEAM-DOCACTION — the real Sales Order window in team mode, two real browsers (TEAMWORK_FRAMEWORK §13.7) ═══\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'team-so-'));
  // ── the dumb folder server (GET/PUT /pipe/f/<name>, GET /pipe/list?prefix=) + the static repo ──
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
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

  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] }), L = { A: [], B: [] };
  var HDR = ['A', 'B'];
  try {
    var ctx = { A: await browser.newContext({ viewport: { width: 1400, height: 900 } }), B: await browser.newContext({ viewport: { width: 1400, height: 900 } }) };
    var pg = {};
    for (var who of HDR) {
      await ctx[who].route('https://api.github.com/**', fakeGh);
      pg[who] = await ctx[who].newPage();
      (function (w) { pg[w].on('console', function (m) { var t = m.text(); L[w].push(t); if (/§TEAM_|§TEAM-REFRESH|§TEAM-REBUILD|§COMM_SYNC|group-torn|verifyChain=FAIL|🔴/.test(t)) console.log('     [' + w + '] ' + t.slice(0, 330)); });
        pg[w].on('pageerror', function (e) { errors++; L[w].push('PAGEERR ' + e.message); console.log('     [' + w + '] 🔴 pageerror ' + e.message); });
        pg[w].on('dialog', function (d) { d.accept().catch(function () {}); }); })(who);
    }

    // ═══ §TEAM-OFF ═══
    console.log('§TEAM-OFF');
    await pg.A.goto(base + '/erp/idempiere.html?login=GardenAdmin&window=143', { waitUntil: 'load' });
    await pg.A.waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 60000 }); await sleep(800);
    var off = await pg.A.evaluate(function () { return { chip: !!document.getElementById('team-chip'), conf: !!document.getElementById('team-conflicts'), ts: typeof window.TeamSync, cs: typeof window.CommStore,
      scripts: Array.prototype.filter.call(document.scripts, function (s) { return /comm_|team_sync/.test(s.src); }).length }; });
    verdict(!off.chip && !off.conf && off.ts === 'undefined' && off.cs === 'undefined' && off.scripts === 0, 'without ?team=1: no chip, no conflict box, no TeamSync/CommStore global, no comm_*/team_sync script tags', JSON.stringify(off));
    var offTeam = L.A.filter(function (t) { return /§TEAM_|§TEAM-RE/.test(t); });
    verdict(offTeam.length === 0, 'without ?team=1 the page emits no §TEAM log line', 'lines=' + offTeam.length);

    // ═══ §TEAM-PAIR — founder + join + approve on the unmodified phone page, real clicks ═══
    console.log('\n§TEAM-PAIR');
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
    await pg.A.selectOption('#requests .request:has-text("' + code + '") .req-role', '102').catch(function () {});   // the role picked on Approve: GardenWorld Admin (GardenAdmin's own role)
    await pg.A.click('#requests .request:has-text("' + code + '") .b-approve'); await ready(pg.A);
    await press(pg.B, '#b-visit');
    var st = await pg.B.textContent('#pair-state');
    verdict(codes.length === 1 && codes[0] === code && /enrolled/.test(st), 'phone pages paired: founder A approved B\'s code ' + code + ', B says enrolled', codes.join(',') + ' | ' + st.trim());
    var kids = {}; for (var w0 of HDR) kids[w0] = await pg[w0].evaluate(function () { return new Promise(function (res) { var r = indexedDB.open('comm_phone', 1);
      r.onsuccess = function () { var q = r.result.transaction('kv').objectStore('kv').get('device'); q.onsuccess = function () { res(q.result && q.result.kid); }; }; }); });

    // ── open the ERP in team mode on the same storage ──
    async function openErp(w, win) {
      await pg[w].goto(base + '/erp/idempiere.html?login=GardenAdmin&window=' + (win || 143) + '&team=1&pipe=' + encodeURIComponent(PIPE), { waitUntil: 'load' });
      await pg[w].waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 60000 });
      await pg[w].waitForSelector('#team-chip[data-team="ready"]', { timeout: 60000 }); await sleep(900);
    }
    async function chip(w) { return pg[w].evaluate(function () { var c = document.getElementById('team-chip'), b = document.getElementById('team-visit');
      return c ? { text: c.textContent.replace(/\s+/g, ' ').trim(), cursor: b ? getComputedStyle(b).cursor : null, conflicts: Number(c.getAttribute('data-conflicts')), localonly: Number(c.getAttribute('data-localonly')) } : null; }); }
    for (var w1 of HDR) await openErp(w1);
    var cA = await chip('A'), cB = await chip('B');
    verdict(cA && cB && cA.text.indexOf(kids.A.slice(0, 4).toUpperCase() + '-' + kids.A.slice(4, 8).toUpperCase()) >= 0 && /team devices 2/.test(cA.text) && cA.cursor === 'pointer',
      'the ERP chip shows device code · team devices 2 · a Visit button with the hand cursor (A)', JSON.stringify(cA));
    verdict(cB && /team devices (1|2)/.test(cB.text), 'the ERP chip reads B\'s identity from the phone page storage (B)', JSON.stringify(cB));

    // ── real-click helpers on window 143 ──
    var sel = function (c) { return '#idmp-inline-mount select[data-col="' + c + '"]'; };
    var inp = function (c) { return '#idmp-inline-mount input[data-col="' + c + '"]'; };
    async function toHeaderGrid(w) {   // Grid view of the header tab, ALL rows (the legacy user's path)
      var p = pg[w]; await p.click('#idmp-tabstrip .idmp-adtab >> nth=0'); await sleep(900);
      await require('./legacy_open.js').showAllRows(p, { settle: 300 }); await sleep(500);
    }
    async function gridRows(w) { return pg[w].evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'), function (tr) { return { pk: Number(tr.getAttribute('data-ad-record')), text: tr.textContent.replace(/\s+/g, ' ').trim() }; }); }); }
    async function newOrder(w, desc) {
      var p = pg[w], n0 = L[w].length;
      await p.click('#idmp-tabstrip .idmp-adtab >> nth=0'); await sleep(700);
      await p.click('#idmp-toolbar [data-tb="new"]'); await p.waitForSelector('#idmp-inline-mount .cfrow'); await sleep(700);
      await p.selectOption(sel('ad_org_id'), '11').catch(function () {}); await sleep(400);
      await p.selectOption(sel('m_warehouse_id'), '103').catch(function () {}); await sleep(300);
      await p.selectOption(sel('c_bpartner_id'), '118'); await sleep(300);
      var dts = await p.$$eval(sel('c_doctypetarget_id') + ' option', function (o) { return o.map(function (x) { return { v: x.value, t: x.text }; }); });
      var dt = dts.find(function (o) { return /^Standard Order/.test(o.t); }) || dts.find(function (o) { return /^POS Order/.test(o.t); }); if (!dt) throw new Error('no order doctype');
      await p.selectOption(sel('c_doctypetarget_id'), dt.v);
      await p.fill(inp('description'), desc); await p.dispatchEvent(inp('description'), 'change');
      await p.click('#idmp-toolbar [data-tb="save"]');
      var l = await waitLog(w, /§CRUD-CREATE-SEL table=c_order id=/, n0, 15000); await sleep(900);
      return Number((/id=(-?\d+)/.exec(l || '') || [])[1]);
    }
    async function waitLog(w, re, from, ms) { var t0 = Date.now(); while (Date.now() - t0 < ms) { var l = L[w].slice(from).find(function (x) { return re.test(x); }); if (l) return l; await sleep(150); } return null; }
    async function addLine(w) {
      var p = pg[w];
      await p.click('#idmp-tabstrip >> text=Order Line'); await sleep(900);
      await p.click('#idmp-toolbar [data-tb="new"]'); await p.waitForSelector('#idmp-inline-mount .cfrow'); await sleep(700);
      await p.selectOption(sel('m_product_id'), '123'); await sleep(300);
      var qi = p.locator(inp('qtyentered')).first(); await qi.fill('2'); await qi.blur(); await sleep(300);
      var uom = (await p.$$eval(sel('c_uom_id') + ' option', function (o) { return o.map(function (x) { return { v: x.value, t: x.text }; }); })).find(function (o) { return /^Each/.test(o.t); });
      var tax = (await p.$$eval(sel('c_tax_id') + ' option', function (o) { return o.map(function (x) { return { v: x.value, t: x.text }; }); })).find(function (o) { return /^Standard \(104\)/.test(o.t); });
      if (uom) await p.selectOption(sel('c_uom_id'), uom.v); if (tax) await p.selectOption(sel('c_tax_id'), tax.v);
      var pe = p.locator(inp('priceentered')).first(); await pe.fill('61.75'); await pe.blur();
      await p.locator(inp('priceactual')).first().fill('61.75').catch(function () {});
      var n0 = L[w].length; await p.click('#idmp-toolbar [data-tb="save"]');
      await waitLog(w, /§CRUD-PERSIST key=c_orderline/, n0, 15000); await sleep(1200);
    }
    async function visit(w) { var n0 = L[w].length; await pg[w].click('#team-visit'); var l = await waitLog(w, /§TEAM_VISIT /, n0, 60000); await sleep(1200); return l; }
    async function selectRow(w, pk) { await pg[w].evaluate(function (i) { var tr = Array.prototype.filter.call(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'), function (x) { return Number(x.getAttribute('data-ad-record')) === i; })[0]; if (tr) tr.click(); }, pk); await pg[w].waitForSelector('#idmp-inline-mount .cfrow', { timeout: 8000 }).catch(function () {}); await sleep(700); }
    async function descOf(w) { return pg[w].$eval(inp('description'), function (e) { return e.value; }).catch(function () { return null; }); }
    async function editDesc(w, v) { var p = pg[w]; await p.fill(inp('description'), v); await p.dispatchEvent(inp('description'), 'change'); await sleep(300);
      var n0 = L[w].length; await p.click('#idmp-toolbar [data-tb="save"]'); await waitLog(w, /§CRUD-PERSIST key=c_order /, n0, 15000); await sleep(900); }
    async function ensureGrid(w) { var tgl = pg[w].locator('#idmp-toolbar [data-tb="toggle"]');   // a single-row tab opens as a FORM (legacy parity); the grid is the Grid/Form toggle
      var inForm = await pg[w].evaluate(function () { return !document.querySelector('#idmp-content .idmp-grid'); });
      if (inForm && await tgl.count()) { await tgl.first().click().catch(function () {}); await sleep(900); } }
    async function lineRows(w) { await ensureGrid(w); return pg[w].evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'), function (tr) { return { pk: Number(tr.getAttribute('data-ad-record')), text: tr.textContent.replace(/\s+/g, ' ').trim() }; }); }); }
    // the user-visible header record id the Order Line tab is linked to (the §IDEMPIERE-MD log carries the link value the grid filtered by)
    function linkOf(w, from) { var m = L[w].slice(from).filter(function (x) { return /§IDEMPIERE-MD tab=Order Line/.test(x); }).pop(); return m ? (/c_order_id=(-?\d+)/i.exec(m) || [])[1] : null; }

    // ── probes over the page's own sidecar (what the user's screen is built from) ──
    function probe(w, desc) { return pg[w].evaluate(function (d) {
      var db = window.__crud.kernelDb(), q = function (s) { var r = db.exec(s); return r.length ? r[0].values : []; }, pk = null;
      q("SELECT id, parameters FROM kernel_ops WHERE op_type='CRUD_CREATE' AND undone=0 ORDER BY id").forEach(function (v) { var p = JSON.parse(v[1]); if (p.table === 'c_order' && p.fields && p.fields.description === d) pk = -v[0]; });
      if (pk == null) return null;
      var row = window.CrudCore.listTip(db, 'c_order', 'c_order_id', [], null).rows.filter(function (r) { return Number(r.c_order_id) === pk; })[0] || {};
      var tax = 0, ln = 0; q("SELECT op_type, parameters FROM kernel_ops WHERE undone=0").forEach(function (v) { var p; try { p = JSON.parse(v[1]); } catch (e) { return; }
        if (v[0] === 'CRUD_CREATE' && p.table === 'c_ordertax' && p.fields && Number(p.fields.c_order_id) === pk) tax++; });
      var lines = window.CrudCore.listTip(db, 'c_orderline', 'c_orderline_id', [], null).rows.filter(function (r) { return Number(r.c_order_id) === pk; });
      var proc = lines.filter(function (r) { return r.processed === 'Y'; }).length;
      return { pk: pk, tip: window.__crud.readTip('c_order', pk), col: row.docstatus || null, tax: tax, lines: lines.length, linesProcessed: proc }; }, desc); }
    async function complete(w, desc) { var pr = await probe(w, desc), n0 = L[w].length;
      await pg[w].evaluate(function (id) { window.__crud.process('c_order', id, 'CO', { from: 'DR', to: 'CO', outcome: 'success' }); }, pr.pk);
      var cl = await waitLog(w, /§CRUD process committed key=c_order/, n0, 20000); await sleep(1500);
      var torn = L[w].slice(n0).filter(function (t) { return /group-torn|verifyChain=FAIL/.test(t); });
      console.log('   §DA-COMMIT-CHAIN ' + w + ' ' + (cl || 'NO COMMIT LINE').slice(0, 160) + (torn.length ? '  TORN: ' + torn[0].slice(0, 160) : ''));
      verdict(!!cl && /verifyChain=ok/.test(cl) && !torn.length, 'the Complete commit on ' + w + ' leaves the op-log chain valid (verifyChain=ok, no group-torn)', cl ? (/verifyChain=\w+/.exec(cl) || ['?'])[0] + (torn.length ? ' torn=' + torn.length : '') : 'no commit line'); }
    async function cfs(w) { return pg[w].$$eval('#team-conflicts .team-conflict', function (e) { return e.map(function (x) { return x.textContent; }); }); }
    function lines(w, re, from) { return L[w].slice(from || 0).filter(function (t) { return re.test(t); }); }

    // ═══ §DA-SYNC ═══
    console.log('\n§DA-SYNC');
    await toHeaderGrid('A'); await toHeaderGrid('B');
    await newOrder('A', 'DA-one'); await addLine('A');
    await visit('A'); await visit('B');
    var b0 = await probe('B', 'DA-one'), a0 = await probe('A', 'DA-one');
    console.log('   §DA before: A=' + JSON.stringify(a0) + ' B=' + JSON.stringify(b0));
    if (!b0 || !a0) incon('§DA-SYNC', 'the order did not reach B before the action — precondition missing');
    else {
      var nA = L.A.length; await complete('A', 'DA-one');
      var outStatus = lines('A', /§TEAM_OUT op=SET_STATUS/, nA), stillLocal = lines('A', /§TEAM_LOCALONLY op=SET_STATUS/, nA);
      verdict(outStatus.length === 1 && stillLocal.length === 0, 'A: the SET_STATUS of the Complete is sent (it was local-only in W1)', 'sent=' + outStatus.length + ' localonly=' + stillLocal.length + ' ' + (outStatus[0] || '').slice(0, 110));
      var preB = await probe('B', 'DA-one');
      verdict(preB.tip !== 'CO' && preB.col !== 'CO', 'NO-OP guard: before B visits, B does not already show CO', 'B tip=' + preB.tip + ' col=' + preB.col);
      await visit('A'); await visit('B');
      var a1 = await probe('A', 'DA-one'), b1 = await probe('B', 'DA-one');
      console.log('   §DA after: A=' + JSON.stringify(a1) + ' B=' + JSON.stringify(b1));
      verdict(a1.tip === 'CO' && b1.tip === 'CO', 'both devices: the DocStatus lane (readTip) says CO', 'A=' + a1.tip + ' B=' + b1.tip);
      verdict(a1.col === 'CO' && b1.col === 'CO', 'both devices: the order\'s docstatus column says CO (the grid shows the same as the bar)', 'A=' + a1.col + ' B=' + b1.col);
      verdict(a1.tax >= 1 && b1.tax === a1.tax && b1.linesProcessed === a1.linesProcessed && a1.linesProcessed === a1.lines, 'B holds the SAME consequences as A (tax rows ' + a1.tax + ', processed lines ' + a1.linesProcessed + '/' + a1.lines + ')', 'B tax=' + b1.tax + ' processed=' + b1.linesProcessed + '/' + b1.lines);
      var cA = await cfs('A'), cB = await cfs('B');
      verdict(cA.length === 0 && cB.length === 0, 'an uncrossed Complete raises no conflict on either device', 'A=' + cA.length + ' B=' + cB.length);
      // the one refusal seen in the first run: which op, which reason (named limit §13.7-4, pinned so a change is noticed)
      var ref = await pg.A.evaluate(function () { var S = window.TeamSync.store(); return S.delivery().filter(function (x) { return x.verdict === 'REFUSED'; }).map(function (x) {
        var r = S.query('SELECT target_table AS t FROM cl_op WHERE op_hash=?', [x.hash])[0]; return { table: r && r.t, reason: x.reason }; }); });
      console.log('   §DA-REFUSED ' + JSON.stringify(ref));
      verdict(ref.length >= 1 && ref.every(function (x) { return x.table === 'm_storagereservation'; }), 'the only refused op(s) of a Complete are the m_storagereservation write on a seeded row (named limit: needs the K3 owner/CAS rule)', JSON.stringify(ref));
      var vf = lines('B', /§TEAM_VISIT/).slice(-1)[0] || '';
      verdict(/verifyChain=ok/.test(vf), 'B\'s rebuilt sidecar chain verifies (SET_STATUS rows re-sealed)', vf.slice(0, 200));
    }

    // ═══ §DA-CROSS ═══
    console.log('\n§DA-CROSS');
    await newOrder('A', 'DA-two'); await addLine('A'); await visit('A'); await visit('B');
    var x0a = await probe('A', 'DA-two'), x0b = await probe('B', 'DA-two');
    if (!x0a || !x0b || !x0a.lines || !x0b.lines) incon('§DA-CROSS', 'the order or its line did not reach both devices — nothing to complete crossed');
    else {
      await complete('A', 'DA-two'); await complete('B', 'DA-two');                 // each completes its own copy BEFORE any Visit
      var mid = [await probe('A', 'DA-two'), await probe('B', 'DA-two')];
      console.log('   §DA-CROSS before visit: A=' + JSON.stringify(mid[0]) + ' B=' + JSON.stringify(mid[1]));
      var hasConseq = mid[0].tax >= 1 && mid[1].tax >= 1;
      for (var rr = 0; rr < 2; rr++) { await visit('A'); await visit('B'); }
      var xa = await probe('A', 'DA-two'), xb = await probe('B', 'DA-two'), ca = await cfs('A'), cb = await cfs('B');
      console.log('   §DA-CROSS after: A=' + JSON.stringify(xa) + ' B=' + JSON.stringify(xb));
      console.log('   §DA-CROSS conflicts A=' + JSON.stringify(ca.map(function (t) { return t.slice(0, 120); })) + ' B=' + JSON.stringify(cb.map(function (t) { return t.slice(0, 120); })));
      console.log('   §DA-CROSS group lines A: ' + lines('A', /§TEAM_GROUP_HELD/).length + ' B: ' + lines('B', /§TEAM_GROUP_HELD/).length);
      verdict(ca.some(function (t) { return /docstatus/.test(t); }) && cb.some(function (t) { return /docstatus/.test(t); }), 'both devices show a docstatus conflict with CurrentRecordModified', 'A=' + ca.length + ' B=' + cb.length);
      verdict(xa.tip !== 'CO' && xb.tip !== 'CO' && xa.col !== 'CO' && xb.col !== 'CO', 'the order keeps its last agreed status (not CO) on both', 'A tip=' + xa.tip + ' col=' + xa.col + ' | B tip=' + xb.tip + ' col=' + xb.col);
      if (!hasConseq) incon('§DA-CROSS all-or-none', 'the Complete produced no consequence rows (tax) on a device — nothing to hold back');
      else verdict(xa.tax === 0 && xb.tax === 0 && xa.linesProcessed === 0 && xb.linesProcessed === 0, 'all-or-none: NONE of the Complete\'s consequences show on either device (tax rows, processed lines)', 'A tax=' + xa.tax + ' processed=' + xa.linesProcessed + ' | B tax=' + xb.tax + ' processed=' + xb.linesProcessed);
    }

    // ═══ §DA-TRIAL (§13.8 T4) — the system-default trial ends after ONE Complete; an own setup is not limited ═══
    console.log('\n§DA-TRIAL');
    async function setTrial(w, on) { await pg[w].evaluate(function (v) { return new Promise(function (res) { var r = indexedDB.open('comm_phone', 1);
      r.onsuccess = function () { var t = r.result.transaction('kv', 'readwrite'), st = t.objectStore('kv'), q = st.get('cfg'); q.onsuccess = function () { var c = q.result || {}; c.trial = v; st.put(c, 'cfg'); }; t.oncomplete = function () { res(); }; }; }); }, on); }
    await setTrial('A', true); await openErp('A'); await toHeaderGrid('A');
    var tA = await chip('A'), nT = L.A.length;
    var tChip = await pg.A.evaluate(function () { return document.getElementById('team-chip').getAttribute('data-trial'); });
    verdict(tChip === 'finished', 'with the trial on, the chip knows the cycle is already done (A completed an order earlier)', 'data-trial=' + tChip);
    await newOrder('A', 'DA-trial');
    var lo = lines('A', /§TEAM_LOCALONLY .*reason=trial-finished/, nT), outs = lines('A', /§TEAM_OUT op=CRUD_CREATE table=c_order uu/, nT), warn = await pg.A.$eval('#team-warn', function (e) { return e.textContent; });
    verdict(lo.length >= 1 && outs.length === 0, 'a new order after the cycle stays on this device (local-only, trial-finished), nothing is sent', 'localonly=' + lo.length + ' sent=' + outs.length);
    verdict(/Trial cycle finished/.test(warn), 'the chip tells the user in words', warn.slice(0, 120));
    await setTrial('A', false); await openErp('A'); await toHeaderGrid('A'); var nT2 = L.A.length;
    await newOrder('A', 'DA-own');
    var outs2 = lines('A', /§TEAM_OUT op=CRUD_CREATE table=c_order uu/, nT2), lo2 = lines('A', /reason=trial-/, nT2);
    verdict(outs2.length >= 1 && lo2.length === 0, 'control: with trial off (own setup) the same action IS sent', 'sent=' + outs2.length + ' trial-blocked=' + lo2.length);

    console.log('\n§DA-NOERR'); verdict(errors === 0, 'zero page errors on both devices', 'errors=' + errors);
  } finally { await browser.close(); server.close(); try { fs.rmSync(FOLDER, { recursive: true, force: true }); } catch (e) {} }
  console.log('\n──────────────────────────────────────────────');
  console.log('§W-TEAM-DOCACTION ' + (fails || !judged ? (judged ? 'FAIL' : 'INCONCLUSIVE') : (inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS')) + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length + ' pageerrors=' + errors);
  process.exit(fails || !judged ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(2); });
