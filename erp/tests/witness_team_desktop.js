#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-TEAM-DESKTOP, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.9. READ THE LOG after every run — the exit code is not evidence.
//   Two REAL browser contexts on one desktop ("A" and a private window "B"), the REAL erp/idempiere.html, dumb folder pipe. The phone page is NEVER opened:
//   the whole setup (team mode on, Start a team, invite, Join, requests, role, Approve) is done in the Team panel behind the Team pill.
//   §DT-ON      team mode is switched on from the pill (no ?team=1 typed): chip appears, panel says not paired.
//   §DT-FOUND   A: Start a team → invite link, panel shows Paired as founder.
//   §DT-JOIN    B (separate storage) opens the invite link: the panel opens by itself with the invite prefilled → Join → shows its code and "Waiting for approval".
//   §DT-APPROVE A: Check join requests lists EXACTLY B's code → role picked → Approve; B Visit → Paired. NO-OP guard: before B's Visit, B is not enrolled.
//   §DT-ORDER   A creates an order in window 143, Visit A, Visit B → B's grid has it (the setup really carries work).
//   §DT-NOERR   0 page errors.
// Run: node erp/tests/witness_team_desktop.js 2>&1 | tee /tmp/witness_team_desktop.log

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
  console.log('═══ W-TEAM-DESKTOP — team setup with no phone: Team panel pairing, two users on one desktop (TEAMWORK_FRAMEWORK §13.9) ═══\n');
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

  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] }), L = { A: [], B: [] };
  var HDR = ['A', 'B'];
  try {
    var ctx = { A: await browser.newContext({ viewport: { width: 1400, height: 900 } }), B: await browser.newContext({ viewport: { width: 1400, height: 900 } }) };
    var pg = {};
    for (var who of HDR) {
      pg[who] = await ctx[who].newPage();
      (function (w) { pg[w].on('console', function (m) { var t = m.text(); L[w].push(t); if (/§TEAM_|§TEAM-REBUILD|§COMM_SYNC|🔴/.test(t)) console.log('     [' + w + '] ' + t.slice(0, 260)); });
        pg[w].on('pageerror', function (e) { errors++; L[w].push('PAGEERR ' + e.message); console.log('     [' + w + '] 🔴 pageerror ' + e.message); });
        pg[w].on('dialog', function (d) { d.accept().catch(function () {}); }); })(who);
    }
    var URL0 = base + '/erp/idempiere.html?login=GardenAdmin&window=143&pipe=' + encodeURIComponent(PIPE);   // the pipe= param stands in for GitHub; NOTHING says team=1
    async function loadErp(w, url) { await pg[w].goto(url || URL0, { waitUntil: 'load' }); await pg[w].waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 60000 }); await sleep(1500); }
    async function pillClick(w) { if (!(await pg[w].isVisible('#pill-team'))) { await pg[w].click('#idmp-pill-trigger'); await sleep(900); } await pg[w].click('#pill-team'); await pg[w].waitForSelector('#team-panel', { timeout: 10000 }); }
    async function panelText(w, sel) { return pg[w].$eval(sel, function (e) { return e.textContent; }).catch(function () { return null; }); }
    async function chip(w) { return pg[w].evaluate(function () { var c = document.getElementById('team-chip'), b = document.getElementById('team-visit');
      return c ? { text: c.textContent.replace(/\s+/g, ' ').trim(), data: c.getAttribute('data-team'), cursor: b ? getComputedStyle(b).cursor : null } : null; }); }
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

    // ═══ §DT-ON ═══
    console.log('§DT-ON');
    await loadErp('A');
    var pre = await pg.A.evaluate(function () { return { chip: !!document.getElementById('team-chip'), cs: typeof window.CommStore }; });
    await pillClick('A'); await pg.A.click('#tp-mode'); await pg.A.waitForURL(/team=1/, { timeout: 30000 }); await pg.A.waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 60000 }); await pg.A.waitForSelector('#team-chip', { timeout: 60000 }); await sleep(1000);
    var c0 = await chip('A'); await pillClick('A'); var needs = await panelText('A', '#tp-pairsec');
    verdict(!pre.chip && pre.cs === 'undefined' && c0 && /not paired/.test(c0.text) && /not in a team yet/.test(needs || ''), 'team mode is switched on from the pill alone; chip and panel say "not paired / not in a team yet"', JSON.stringify({ before: pre, chip: c0 && c0.text, panel: (needs || '').slice(0, 60) }));

    // ═══ §DT-FOUND ═══
    console.log('\n§DT-FOUND');
    await pg.A.click('#tp-found'); await pg.A.waitForSelector('#tp-paired', { timeout: 30000 });
    var paired = await panelText('A', '#tp-paired'), link = await pg.A.inputValue('#tp-link');
    verdict(/Paired/.test(paired) && /founder/.test(paired) && /#join=[0-9a-f]{64}$/.test(link) && /team=1/.test(link), 'Start a team → panel shows Paired as founder, with an invite link', paired + ' | ...' + link.slice(-24));
    await pg.A.click('#tp-close');

    // ═══ §DT-JOIN ═══
    console.log('\n§DT-JOIN');
    await loadErp('B', link.replace(/^https?:\/\/[^/]+/, base));   // B has separate storage: it is a different user on the same desktop
    await pg.B.waitForSelector('#team-panel', { timeout: 60000 });
    var pre2 = await pg.B.inputValue('#tp-inv');
    verdict(/^[0-9a-f]{64}$/.test(pre2), 'B opens the invite link: the Team panel opens by itself with the invite prefilled', pre2.slice(0, 12) + '…');
    await pg.B.click('#tp-join'); await pg.B.waitForSelector('#tp-code', { timeout: 30000 });
    var codeB = (await panelText('B', '#tp-code')).trim(), waitB = await panelText('B', '#tp-wait');
    verdict(/^[0-9A-F]{4}-[0-9A-F]{4}$/.test(codeB) && /Waiting for approval/.test(waitB + (await panelText('B', '#tp-pairsec'))), 'Join → B shows its device code and "Waiting for approval"', codeB);

    // ═══ §DT-APPROVE ═══
    console.log('\n§DT-APPROVE');
    await pillClick('A'); await pg.A.click('#tp-req'); await pg.A.waitForSelector('#tp-reqs .tp-request, #tp-reqs div', { timeout: 30000 });
    var codes = await pg.A.$$eval('#tp-reqs .tp-rcode', function (e) { return e.map(function (x) { return x.textContent.trim(); }); });
    verdict(codes.length === 1 && codes[0] === codeB, 'A lists exactly B\'s code as the pending request', codes.join(',') + ' vs ' + codeB);
    var stB0 = await pg.B.evaluate(function () { return window.TeamSync.pairState(); });
    verdict(stB0.enrolled === false, 'NO-OP guard: before the approval and B\'s Visit, B is not enrolled', JSON.stringify({ enrolled: stB0.enrolled, devices: stB0.devices }));
    await pg.A.selectOption('#tp-reqs .tp-role', '102'); await pg.A.click('#tp-reqs .tp-approve'); await pg.A.waitForSelector('#tp-paired', { timeout: 30000 }); await sleep(800);
    await pg.B.click('#tp-visit'); await pg.B.waitForSelector('#tp-paired', { timeout: 30000 });
    var pB = await panelText('B', '#tp-paired'), stA = await pg.A.evaluate(function () { return window.TeamSync.pairState(); });
    verdict(/Paired/.test(pB) && /team devices 2/.test(pB) && stA.devices === 2, 'after Approve and B\'s Visit, B is Paired and both see 2 team devices', pB + ' | A devices=' + stA.devices);
    await pg.A.click('#tp-close'); await pg.B.click('#tp-close');

    // ═══ §DT-ORDER ═══
    console.log('\n§DT-ORDER');
    await toHeaderGrid('A'); await toHeaderGrid('B');
    var pkA = await newOrder('A', 'DT-one'); await addLine('A');
    await visit('A'); await visit('B'); await toHeaderGrid('B');
    var rowsB = await gridRows('B'), tx = await pg.B.evaluate(function () { var db = window.__crud.kernelDb(), r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='CRUD_CREATE' AND undone=0"); 
      return r.length ? r[0].values.filter(function (v) { var p = JSON.parse(v[0]); return p.table === 'c_order' && p.fields && p.fields.description === 'DT-one'; }).length : 0; });
    verdict(tx === 1, 'A\'s order made after the desktop-only setup reaches B (B holds 1 order "DT-one" in its op-log)', 'B orders=' + tx + ' gridRows=' + rowsB.length + ' (A pk ' + pkA + ')');

    console.log('\n§DT-NOERR'); verdict(errors === 0, 'zero page errors on both users', 'errors=' + errors);
  } finally { await browser.close(); server.close(); try { fs.rmSync(FOLDER, { recursive: true, force: true }); } catch (e) {} }
  console.log('\n──────────────────────────────────────────────');
  console.log('§W-TEAM-DESKTOP ' + (fails || !judged ? (judged ? 'FAIL' : 'INCONCLUSIVE') : (inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS')) + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length + ' pageerrors=' + errors);
  process.exit(fails || !judged ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(2); });
