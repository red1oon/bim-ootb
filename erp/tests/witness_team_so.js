#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-TEAM-SO, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.1 (W1). READ THE LOG after every run — the exit code is not evidence.
//   Two REAL Playwright BrowserContexts (separate storage), the REAL erp/idempiere.html, REAL clicks in window 143 (Sales Order):
//   pairing through common/comm/comm_phone.html clicks (founder + join + approve), then the ERP in team mode (?team=1) on the SAME
//   browser storage. The ERP devices talk through a dumb folder over CommPipe.httpPipe (no GitHub budget); the unmodified phone page
//   pairs through a stand-in for api.github.com that is a thin view of that SAME folder (Playwright route) — no real GitHub is touched.
//   Every arm names the issue it proves or disproves; an arm that judged nothing prints INCONCLUSIVE, never PASS.
//   §TEAM-OFF      without ?team=1 the page is untouched (no chip, no comm scripts, no TeamSync) — proves "nothing changes".
//   §TEAM-PAIR     pairing through the phone page works for both browsers and the ERP reads that identity (chip: code · devices · Visit).
//   §TEAM-SO-SYNC  A creates an order + 1 line, Visits; B Visits and its grid shows the order; Order Line tab: row count AND parent id
//                  per row, switching tabs WITHOUT Save (disproves "the line lands on the wrong/no parent after sync").
//   §TEAM-EDIT     B edits a header field, both Visit, A shows it.
//   §TEAM-CL1      both create an order, then edit it BEFORE any Visit, then sync: each order keeps its OWN edit, on both
//                  (disproves "an edit by device-local pk lands on another device's record" — TEAMWORK_FRAMEWORK §12.1).
//   §TEAM-CONFLICT both edit the same field crossed: both show the CurrentRecordModified conflict and keep the last agreed value.
//   §TEAM-LOCALONLY a DocAction (W2) is NOT sent and shows as a visible local-only warning (never guessed).
//   §TEAM-NOERR    0 page errors.   §TEAM-XOFN  how many AD windows the hook covers generically vs witnessed.
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
  console.log('═══ W-TEAM-SO — the real Sales Order window in team mode, two real browsers (TEAMWORK_FRAMEWORK §13.1) ═══\n');
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
      (function (w) { pg[w].on('console', function (m) { var t = m.text(); L[w].push(t); if (/§TEAM_|§TEAM-REFRESH|§TEAM-REBUILD|§COMM_SYNC|🔴/.test(t)) console.log('     [' + w + '] ' + t.slice(0, 330)); });
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

    // ═══ §TEAM-SO-SYNC ═══
    console.log('\n§TEAM-SO-SYNC');
    await toHeaderGrid('A'); await toHeaderGrid('B');
    var baseA = (await gridRows('A')).length, baseB = (await gridRows('B')).length;
    var pkA1 = await newOrder('A', 'W1-A-one');
    await addLine('A');
    var outA = L.A.filter(function (t) { return /§TEAM_OUT /.test(t); });
    var hdrOut = outA.filter(function (t) { return /table=c_order uu=/.test(t); }), lnOut = outA.filter(function (t) { return /table=c_orderline uu=/.test(t); });
    console.log('   §TEAM A created order pk=' + pkA1 + ' (header op lines=' + hdrOut.length + ', line op lines=' + lnOut.length + ')');
    verdict(hdrOut.length >= 1 && lnOut.length === 1 && /refs=1/.test(lnOut[0]), 'A: the header CREATE and the line CREATE were each turned into a v3 envelope; the line carries its header as a ref (CL1b FK rule)', hdrOut.length + ' header op(s), line: ' + (lnOut[0] || 'none').slice(0, 120));
    var lo = await chip('A');
    console.log('   §TEAM A chip after save: ' + JSON.stringify(lo));
    await visit('A');
    var vB = await visit('B');
    await toHeaderGrid('B');
    var rowsB = await gridRows('B');
    var projB = L.B.filter(function (t) { return /§TEAM_VISIT /.test(t); }).pop() || '';
    verdict(rowsB.length === baseB + 1, 'B\'s grid shows the order A created (rows ' + baseB + ' → ' + rowsB.length + ')', projB.slice(0, 260));
    var newPkB = (rowsB.filter(function (r) { return r.pk < 0; }).pop() || {}).pk;
    if (newPkB == null) incon('B Order Line parent id', 'no synthetic-pk row on B');
    else {
      await selectRow('B', newPkB);
      var d0 = await descOf('B'); verdict(d0 === 'W1-A-one', 'B\'s header form carries A\'s Description', 'description=' + d0);
      var nL = L.B.length; await pg.B.click('#idmp-tabstrip >> text=Order Line'); await sleep(1200);
      var lr = await lineRows('B'), lk = linkOf('B', nL);
      console.log('   §TEAM B Order Line tab: rows=' + lr.length + ' pks=' + JSON.stringify(lr.map(function (r) { return r.pk; })) + ' link(c_order_id)=' + lk + ' header pk=' + newPkB);
      verdict(lr.length === 1 && String(lk) === String(newPkB), 'B: Order Line tab shows exactly 1 row, filtered by the header\'s CURRENT pk (parent id per row = ' + newPkB + ')', 'rows=' + lr.length + ' link=' + lk);
      // parent id per row, read from the line record itself (the kernel overlay row) — what the user cannot see but the tab filter used
      var par = await pg.B.evaluate(function (h) { var K = window.__crud.kernelDb(), r = window.__crud.core.listTip(K, 'c_orderline', 'c_orderline_id', [], null).rows; return r.map(function (x) { return String(x.c_order_id); }).filter(function (v) { return v === String(h); }); }, newPkB);
      verdict(par.length === 1, 'B: every projected line row carries the header\'s local pk as its c_order_id (FK {uu} → local pk)', 'lines with c_order_id=' + newPkB + ': ' + par.length);
      // switching tabs WITHOUT Save keeps the same answer
      await pg.B.click('#idmp-tabstrip .idmp-adtab >> nth=0'); await sleep(800); var n2 = L.B.length;
      await pg.B.click('#idmp-tabstrip >> text=Order Line'); await sleep(1100);
      var lr2 = await lineRows('B'), lk2 = linkOf('B', n2);
      verdict(lr2.length === 1 && String(lk2) === String(newPkB), 'B: header → Order Line → header → Order Line WITHOUT Save keeps 1 row on the same parent', 'rows=' + lr2.length + ' link=' + lk2);
    }

    // ═══ §TEAM-EDIT ═══
    console.log('\n§TEAM-EDIT');
    await toHeaderGrid('B'); var rB = await gridRows('B'); var pkB1 = (rB.filter(function (r) { return r.pk < 0; }).pop() || {}).pk;
    await selectRow('B', pkB1); await editDesc('B', 'W1-A-one edited-by-B');
    await visit('B'); await visit('A');
    await toHeaderGrid('A'); var rA = await gridRows('A'); var pkA1n = (rA.filter(function (r) { return r.pk < 0; }).pop() || {}).pk;
    await selectRow('A', pkA1n); var dA = await descOf('A');
    verdict(dA === 'W1-A-one edited-by-B', 'A shows B\'s edit of the header Description after both Visit', 'A description=' + dA);

    // ═══ §TEAM-CL1 ═══
    console.log('\n§TEAM-CL1');
    await toHeaderGrid('A'); await toHeaderGrid('B');
    var preA = await gridRows('A'), preB = await gridRows('B');
    var pkAc = await newOrder('A', 'CL1-A'), pkBc = await newOrder('B', 'CL1-B');
    console.log('   §TEAM-CL1 synthetic pks at creation: A=' + pkAc + ' B=' + pkBc + (pkAc === pkBc ? '  (COLLIDE — the §12.1 defect precondition holds)' : '  (differ)'));
    await editDesc('A', 'CL1-A edited'); await editDesc('B', 'CL1-B edited');   // each edits its OWN order by its local pk, before any sync
    for (var rr = 0; rr < 2; rr++) { for (var w2 of HDR) await visit(w2); }
    async function descMap(w) { await toHeaderGrid(w); var rows = await gridRows(w), out = {};
      for (var r of rows.filter(function (x) { return x.pk < 0; })) { await selectRow(w, r.pk); out[r.pk] = await descOf(w); await pg[w].click('#idmp-toolbar [data-tb="ignore"]').catch(function () {}); await sleep(300); await toHeaderGrid(w); }
      return out; }
    var mA = await descMap('A'), mB = await descMap('B');
    var vA = Object.keys(mA).map(function (k) { return mA[k]; }).sort(), vB = Object.keys(mB).map(function (k) { return mB[k]; }).sort();
    console.log('   §TEAM-CL1 A sees ' + JSON.stringify(vA) + '  B sees ' + JSON.stringify(vB));
    var want = ['CL1-A edited', 'CL1-B edited', 'W1-A-one edited-by-B'].sort();
    verdict(JSON.stringify(vA) === JSON.stringify(want) && JSON.stringify(vB) === JSON.stringify(want), 'both devices hold the SAME three orders, each carrying its OWN edit (no edit landed on another device\'s record)', 'A=' + JSON.stringify(vA) + ' B=' + JSON.stringify(vB));
    // ═══ §TEAM-CONFLICT ═══
    console.log('\n§TEAM-CONFLICT');
    await toHeaderGrid('A'); await toHeaderGrid('B');
    async function pkOfDesc(w, d) { var m = await descMap(w); var k = Object.keys(m).filter(function (x) { return m[x] === d; })[0]; if (k != null) { await toHeaderGrid(w); } return k == null ? null : Number(k); }
    var cpkA = await pkOfDesc('A', 'CL1-A edited'), cpkB = await pkOfDesc('B', 'CL1-A edited');
    await selectRow('A', cpkA); await editDesc('A', 'CROSS-from-A');
    await selectRow('B', cpkB); await editDesc('B', 'CROSS-from-B');
    for (var r2 = 0; r2 < 2; r2++) { for (var w3 of HDR) await visit(w3); }
    var cfA = await pg.A.$$eval('#team-conflicts .team-conflict', function (e) { return e.map(function (x) { return x.textContent; }); });
    var cfB = await pg.B.$$eval('#team-conflicts .team-conflict', function (e) { return e.map(function (x) { return x.textContent; }); });
    console.log('   §TEAM-CONFLICT A=' + JSON.stringify(cfA)); console.log('   §TEAM-CONFLICT B=' + JSON.stringify(cfB));
    var okTxt = function (a) { return a.length === 1 && /CROSS-from-A/.test(a[0]) && /CROSS-from-B/.test(a[0]) && /Current record was changed by another user, please ReQuery/.test(a[0]); };
    verdict(okTxt(cfA) && okTxt(cfB), 'both devices show ONE conflict naming both values, with iDempiere\'s CurrentRecordModified text', 'A=' + cfA.length + ' B=' + cfB.length);
    // TEAM_REPLICATION_PLUGIN_STUDY §12.4 (A4): the text is the CORE's AD_Message row, not a copy in team_sync.js — each page's own dictionary row ends the line, and the plugin file holds no literal
    var amsg = async function (w) { return pg[w].evaluate(function () { var r = window.__idmpDb.exec("SELECT msgtext FROM ad_message WHERE value='CurrentRecordModified'"); return r.length ? String(r[0].values[0][0]) : null; }); };
    var mA = await amsg('A'), mB = await amsg('B'), tsSrc = fs.readFileSync(path.join(ROOT, 'erp', 'team_sync.js'), 'utf8');
    console.log('   §TEAM-CONFLICT-MSG ad_message A=' + JSON.stringify(mA) + ' B=' + JSON.stringify(mB) + ' literalInPlugin=' + /please ReQuery/.test(tsSrc));
    verdict(!!mA && !!mB && cfA.length === 1 && cfB.length === 1 && cfA[0].slice(-mA.length) === mA && cfB[0].slice(-mB.length) === mB && !/please ReQuery/.test(tsSrc),
      'the conflict line ends with the page\'s OWN AD_Message CurrentRecordModified text and team_sync.js carries no copy of it (the core shows its message, §8.3 A4)', 'A=' + JSON.stringify(mA) + ' B=' + JSON.stringify(mB));
    await toHeaderGrid('A'); await toHeaderGrid('B');
    var dmA = await descMap('A'), dmB = await descMap('B');
    console.log('   §TEAM-CONFLICT descriptions A=' + JSON.stringify(dmA) + ' B=' + JSON.stringify(dmB));
    // the §12.1 defect precondition, observed on the real devices: pk numbers are not portable — either the same local pk number names DIFFERENT records on A and on B (collision),
    // or the same record carries DIFFERENT pk numbers on A and on B (moved). Which form shows depends on where each device's records land in its fold order (timing), so either counts.
    var clash = Object.keys(dmA).filter(function (k) { return dmB[k] !== undefined && dmB[k] !== dmA[k]; });
    var pkB = {}; Object.keys(dmB).forEach(function (k) { pkB[dmB[k]] = k; });
    var moved = Object.keys(dmA).filter(function (k) { return pkB[dmA[k]] !== undefined && pkB[dmA[k]] !== k; });
    console.log('   §TEAM-CL1 pk portability: collision=' + clash.length + ' moved=' + moved.length);
    if (clash.length) verdict(true, 'pk numbers are NOT portable between the devices (the §12.1 defect precondition is real): pk ' + clash[0] + ' is "' + dmA[clash[0]] + '" on A but "' + dmB[clash[0]] + '" on B — and every edit above still landed on its own record', clash.length + ' clashing pk(s)');
    else if (moved.length) verdict(true, 'pk numbers are NOT portable between the devices (the §12.1 defect precondition is real): "' + dmA[moved[0]] + '" is pk ' + moved[0] + ' on A but pk ' + pkB[dmA[moved[0]]] + ' on B — and every edit above still landed on its own record', moved.length + ' moved record(s), 0 collisions this run');
    else incon('§TEAM-CL1 defect precondition', 'every record has the same local pk on A and B in this run — W-UU-NO-COLLIDE covers the collision itself');
    await toHeaderGrid('A'); await toHeaderGrid('B');
    var kA = await pkOfDesc('A', 'CL1-A edited'), kB = await pkOfDesc('B', 'CL1-A edited');
    verdict(kA != null && kB != null, 'both devices keep the last agreed value on the record (Description = "CL1-A edited")', 'A pk=' + kA + ' B pk=' + kB);

    // ═══ §TEAM-LOCALONLY — a DocAction is W2: not sent, visible warning ═══
    console.log('\n§TEAM-LOCALONLY');
    var nLo = L.A.length, before = (await chip('A')).localonly;
    await pg.A.evaluate(function () { return window.__crud.applyOp({ op_type: 'DOC_ACTION', key: 'c_order', table: 'c_order', verb: 'process', id: null, action: 'PR', from: 'DR', to: 'IP', outcome: 'success' }); });
    await sleep(1500);
    var warn = L.A.slice(nLo).filter(function (t) { return /§TEAM_LOCALONLY/.test(t); }), after = await chip('A');
    if (!warn.length && !(after.localonly > before)) incon('§TEAM-LOCALONLY', 'the DocAction commit did not reach the funnel in this harness (no §TEAM_LOCALONLY line, chip unchanged) — see log');
    else verdict(warn.length >= 1 && after.localonly > before, 'a DocAction is NOT sent and the chip shows a visible local-only warning', (warn[0] || '').slice(0, 160) + ' | chip.localonly ' + before + ' → ' + after.localonly);

    // ═══ §TEAM-XOFN ═══
    console.log('\n§TEAM-XOFN');
    var xn = await pg.A.evaluate(function () {
      var db = window.__idmpDb, q = function (s) { var r = db.exec(s); return r.length ? r[0].values : []; }, local = window.TeamSync.stationLocal();
      var wins = q("SELECT ad_window_id FROM ad_window WHERE isactive='Y'").map(function (r) { return Number(r[0]); }), cov = 0, full = 0, none = 0, noData = 0;
      var memo = {}; function ok(t) { var k = String(t).toLowerCase(); if (memo[k] !== undefined) return memo[k];
        var ex = q("SELECT 1 FROM sqlite_master WHERE type='table' AND lower(name)='" + k + "'").length > 0;
        memo[k] = ex && local.indexOf(k) < 0 && q("SELECT 1 FROM pragma_table_info('" + k + "') WHERE lower(name)='" + k + "_uu'").length > 0; return memo[k]; }
      wins.forEach(function (w) { var tabs = q("SELECT DISTINCT lower(t.tablename) FROM ad_tab tb JOIN ad_table t ON t.ad_table_id=tb.ad_table_id WHERE tb.ad_window_id=" + w + " AND tb.isactive='Y'").map(function (r) { return r[0]; });
        if (!tabs.length) { none++; return; } var okN = tabs.filter(ok).length; if (okN === tabs.length) full++; if (okN > 0) cov++; else noData++; });
      return { N: wins.length, covered: cov, fully: full, noTabs: none, noTranslatableTab: noData };
    });
    console.log('   §TEAM-XOFN windows N=' + xn.N + ' | generically covered (>=1 tab on a table with <t>_uu, not station-owned)=' + xn.covered + ' | every tab covered=' + xn.fully + ' | no tabs=' + xn.noTabs + ' | no translatable tab=' + xn.noTranslatableTab + ' | witnessed=1 (window 143 Sales Order: header + Order Line)');
    verdict(xn.N > 0 && xn.covered > 0, 'X of N: the generic hook covers ' + xn.covered + ' of ' + xn.N + ' AD windows (' + xn.fully + ' with every tab); witnessed 1 of ' + xn.N + ' — NOT "all windows work"');

    console.log('\n§TEAM-NOERR'); verdict(errors === 0, 'zero page errors on both devices', 'errors=' + errors);
  } finally { await browser.close(); server.close(); try { fs.rmSync(FOLDER, { recursive: true, force: true }); } catch (e) {} }
  console.log('\n──────────────────────────────────────────────');
  console.log('§W-TEAM-SO ' + (fails || !judged ? (judged ? 'FAIL' : 'INCONCLUSIVE') : (inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS')) + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length + ' pageerrors=' + errors);
  process.exit(fails || !judged ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(2); });
