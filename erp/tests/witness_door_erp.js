#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DOOR-ERP (bim-compiler prompts/SHEET_FRONT_DOOR.md §10, slice S3c: the filed document in the REAL ERP window). READ THE LOG after every run:
//   every verdict is a §DOORERP line; the exit code is not the evidence. INCONCLUSIVE when nothing was judged (no browser = nothing of the pages is judged).
//   A mutant that makes its named case THROW is CRASHED, not a kill.
// SPEC (claims written before the code, each names the issue it exposes):
//   E1 BOOKS    sample invoice filed on file_it.html, the page's own "Open in the ERP" link followed, login on the page's card: the ERP page DB holds that invoice ONCE,
//               header + Fact_Acct equal to the filing page's, fingerprint == node oracle, debits = credits; §DOOR-HANDOVER applied=1 skipped=0 refused=0   -> the document lives only in the filing page
//   E2 WINDOW   what the user sees: the window of the link (id from the dictionary) on that record: grid rows + record id per row, the line tab WITHOUT Save,
//               the Posted view == Fact_Acct of the page DB, the parent row intact; the same window from the MENU lists the record once            -> in the DB but not in the window
//   E3 GENERIC  a ledger entry of another document kind (a Sales Order through Import Order in the node kernel) goes through the SAME hook and opens in ITS window;
//               door_handover.js and the hook name no table of the dictionary                                                                    -> the hook is per-document code
//   E4 ONCE     reload: applied=0 skipped=1, exactly one invoice; the workbook filed again (2 chained entries): applied=1 skipped=1, one invoice of each number -> a reload or re-open files twice
//   E5 REFUSED  a changed character, a line that is no journal entry, record ids already used, a row that moved on, a ledger whose 2nd entry is refused:
//               each REFUSED, named in the log and in plain words, nothing applied                                                                -> a tampered or colliding ledger is applied, or half applied
//   E6 KEPT     after the page's own persist + reload the boot reads the resident bundle (db=idb_cache) and the invoice with its posting is there;
//               after a normal save in the page and another reload both are there                                                                 -> the hand-over lives in memory only
//   E7 HOOKS    no save hook is added on the live page; node: replayInto == build().replay, dispose() takes a kernel's validators back              -> a second set of save hooks
//   E8 COST     §DOOR-HANDOVER-COST ms / ops / hooks; a page with NO hand-over requests none of the door's scripts                                 -> unmeasured weight; every user pays
//   E9 NOWHERE  every request the server saw is a GET; no page request goes to another host                                                        -> the ledger is sent somewhere
//   E10 OLD     W-SHEET-DOOR 21, W-SHEET-ADDIN 59, W-SHEET-HISTORY 20, W-FILE-IT 40 print their verdict lines unchanged                             -> the kernel restructure broke something
// Browser: headless Chromium (puppeteer, DOORERP_PUPPETEER or ~/bim-compiler/node_modules/puppeteer) on the REAL erp/sheet_addin/file_it.html and erp/idempiere.html,
//   served by a local static server from this tree; real file chooser, real download, the ERP page's own login card (GardenWorld / GardenAdmin), each scenario in its own
//   browser context (its own storage). Mutants (DOORERP_MUTANTS=1): the server hands the browser a rewritten file (the text must match exactly once, else NOT-APPLIED).
// Command: env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_door_erp.js      (DOORERP_MUTANTS=1 adds the mutant sweep; DOORERP_SKIP_OLD=1 skips E10)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..');
var MUTANT = process.env.DOORERP_MUTANT || '';
if (!process.env.SQLJS) process.env.SQLJS = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';   // ws_kernel node shell reads it
var _log = console.log; console.log = function () { /* the kernel's own lines: the pages' are captured per page */ };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0, threw: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §DOORERP-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1100)));
}
async function guard(cs, key, rule, fn) { try { await fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); CASES[cs].threw++; } }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0, threw: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§DOORERP-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + ' threw=' + c.threw + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

var K = require(path.join(ERP, 'ws_kernel.js')), SD = require(path.join(ERP, 'sheet_door.js')), AP = require(path.join(ERP, 'ad_process.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
var SA = require(path.join(ERP, 'sheet_addin/host_shim.js')), XH = require(path.join(ERP, 'sheet_addin/xlsx_host.js')), EH = require(path.join(ERP, 'sheet_addin/excel_host.js'));
var RN = require(path.join(ERP, 'sheet_addin/runner.js')), SAMPLE = require(path.join(ERP, 'sheet_addin/sample_invoice.js')), MV = require(path.join(ERP, 'ad_modelval.js'));
var DH = require(path.join(ERP, 'door_handover.js'));
var DOCNO = 'DOORERP-0001', DOCNO2 = 'DOORERP-0002', DOCNO9 = 'DOORERP-0009', SO = 'DOORERP-SO1', DATE = '2026-11-20';
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'doorerp-'));
var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103 };

// ── mutants: a rewritten copy of ONE served file reaches the browser ──
var MUT = [
  { name: 'M1-link-does-not-hand-over', kills: 'E1', file: 'erp/sheet_addin/file_it.js', from: 'function handOver() { return W.DoorHandover.offer(W.WsKernel, st.name, runner.lines()); }', to: 'function handOver() { return { ok: true }; }' },
  { name: 'M2-grid-row-faked-without-the-db-row', kills: 'E2', file: 'erp/idempiere.html', from: "tr.setAttribute('data-ad-table', tab.tableName); tr.setAttribute('data-ad-record', recVal(rec, _keyCol(tab)));", to: "tr.setAttribute('data-ad-table', tab.tableName); tr.setAttribute('data-ad-record', Number(recVal(rec, _keyCol(tab))) + 1);" },
  { name: 'M3-row-in-the-db-not-in-the-grid', kills: 'E2', file: 'erp/idempiere.html', from: "    _records.forEach(function (rec, i) {\n      var tr = el('tr'); tr.dataset.i = i;", to: "    _records.forEach(function (rec, i) {\n      if (Number(recVal(rec, _keyCol(tab))) > 1300109) return;\n      var tr = el('tr'); tr.dataset.i = i;" },
  { name: 'M4-hook-applies-one-table-only', kills: 'E3', file: 'erp/door_handover.js', from: 'skip: function (e) { return !!seen[e.hash]; },', to: "skip: function (e) { return !!seen[e.hash] || !e.payload.ops.some(function (o) { return o.table === 'c_invoice'; }); }," },
  { name: 'M5-entry-applied-twice', kills: 'E4', file: 'erp/door_handover.js', from: 'atomic: true, guard: true, skip: function (e) { return !!seen[e.hash]; },', to: 'atomic: true, guard: false, skip: function () { return false; },' },
  { name: 'M6-applied-hash-not-recorded', kills: 'E4', file: 'erp/door_handover.js', from: "[e.hash, name, e.seq, e.payload.ops.length, new Date().toISOString()]); n++;", to: "['x' + e.hash, name, e.seq, e.payload.ops.length, new Date().toISOString()]); n++;" },
  { name: 'M7-tampered-line-applied', kills: 'E5', file: 'erp/ws_kernel.js', from: 'if (e.payload && e.payload.ops && H.sha256(JSON.stringify(e.payload.ops)) !== e.opsDigest) throw new Error(', to: 'if (e.payload && e.payload.ops && !e.opsDigest) throw new Error(' },
  { name: 'M8-used-ids-not-checked', kills: 'E5', file: 'erp/ws_kernel.js', from: "if (made[t + '|' + kv] || rowsOf(db, 'SELECT 1 AS x FROM ' + t + ' WHERE \"' + kc + '\"=? LIMIT 1', [kv]).length) throw new Error(", to: "if (made[t + '|' + kv] === 2) throw new Error(" },
  { name: 'M9-moved-on-row-overwritten', kills: 'E5', file: 'erp/ws_kernel.js', from: 'if (!same(now, c.old)) throw new Error(', to: 'if (now === undefined) throw new Error(' },
  { name: 'M10-refusal-not-atomic', kills: 'E5', file: 'erp/door_handover.js', from: 'atomic: true, guard: true, skip: function (e) { return !!seen[e.hash]; },', to: 'atomic: false, guard: true, skip: function (e) { return !!seen[e.hash]; },' },
  { name: 'M11-no-persist-after-applying', kills: 'E6', file: 'erp/idempiere.html', from: 'persist: seedParam ? null : _persistBundle }', to: 'persist: null }' },
  { name: 'M12-hand-over-installs-save-hooks', kills: 'E7', file: 'erp/door_handover.js', from: "var out = take(db, { K: global.WsKernel, persist: env.persist });", to: "var out = take(db, { K: global.WsKernel, persist: env.persist }); mv.installMInvoiceSaveHooks({ prepare: function () { return { all: function () { return []; }, get: function () { return null; } }; } });" },
  { name: 'M13-every-page-loads-the-door', kills: 'E8', file: 'erp/idempiere.html', from: "try { if (localStorage.getItem('door_handover_v1')) { await loadScript(", to: "try { if (localStorage) { await loadScript(" }
];
var ACTIVE = MUT.filter(function (m) { return m.name === MUTANT; })[0] || null;

// ── the static server: this tree, as GitHub Pages would serve it ──
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.sql': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
var NET = { requests: 0, notGet: [], mutantApplied: null };
function serve() {
  return new Promise(function (res) {
    var srv = http.createServer(function (req, rsp) {
      var rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      if (req.method !== 'GET') { NET.notGet.push(req.method + ' ' + rel); req.resume(); rsp.writeHead(405); rsp.end(); return; }
      var f = path.join(ROOT, rel);
      if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || !fs.statSync(f).isFile()) { rsp.writeHead(404); rsp.end(); return; }
      var body = fs.readFileSync(f);
      if (ACTIVE && rel === ACTIVE.file) {
        var txt = body.toString('utf8'), n = txt.split(ACTIVE.from).length - 1;
        NET.mutantApplied = n;
        if (n === 1) body = Buffer.from(txt.replace(ACTIVE.from, ACTIVE.to));
      }
      NET.requests++;
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-cache' }); rsp.end(body);
    });
    srv.listen(0, '127.0.0.1', function () { res({ srv: srv, base: 'http://127.0.0.1:' + srv.address().port + '/' }); });
  });
}

// ── node side ──
function readWb(file) { return XLSX.read(fs.readFileSync(file), Object.assign({ type: 'buffer' }, XH.READ)); }
function writeWb(wb, name) { var f = path.join(TMP, name); fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); return f; }
function makeRunner() { return RN.create({ boot: function () { return K.load(); }, SheetDoor: SD, AP: function () { return AP; } }); }
async function nodeFile(file) {
  var wb = readWb(file), host = XH.create(XLSX, wb, { engineValue: EH.engineValue }), last = null, runner = makeRunner();
  var shim = SA.create(host, { SheetDoor: SD, runner: { file: async function (a, b, c) { last = await runner.file(a, b, c); return last; } } });
  var r = await shim.fileIt();
  return { r: r, last: last, k: runner.kernel(), lines: runner.lines() };
}
// fingerprint(q, docno): C_Invoice + lines + Fact_Acct, ids stripped (the S1 / S3 / S3b fingerprint); q may be sync (node) or async (a page)
async function fingerprint(q, docno) {
  var inv = await q('SELECT * FROM c_invoice WHERE documentno=?', [docno]), out = [];
  for (var n = 0; n < inv.length; n++) {
    var i = inv[n];
    var ls = await q('SELECT line, m_product_id, c_charge_id, qtyinvoiced, priceactual, linenetamt, c_tax_id, description FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line', [i.c_invoice_id]);
    var fa = await q('SELECT account_id, amtacctdr, amtacctcr FROM fact_acct WHERE ad_table_id=318 AND record_id=? ORDER BY account_id, amtacctdr, amtacctcr', [i.c_invoice_id]);
    out.push({ h: [i.c_bpartner_id, i.c_doctype_id, i.issotrx, i.documentno, String(i.dateinvoiced).slice(0, 10), i.docstatus, i.totallines, i.grandtotal, i.c_currency_id, i.posted], l: ls, f: fa });
  }
  return J(out);
}
function ledgerLines(wb) { var s = wb.Sheets[SA.LEDGER]; return s && s['!ref'] ? XLSX.utils.sheet_to_json(s, { header: 1, raw: true, defval: '' }).map(function (r) { return r.join(''); }).filter(Boolean) : []; }
function num(t) { return Number(String(t).replace(/,/g, '')); }
function cents(x) { return Math.round(Number(x) * 100); }

// ── browser side ──
var PUP = null; try { PUP = require(process.env.DOORERP_PUPPETEER || path.join(os.homedir(), 'bim-compiler/node_modules/puppeteer')); } catch (e) { PUP = null; }
var B = { browser: null, base: null, external: [], pageErrors: [] };
async function newPage(ctx, rel) {
  var page = await ctx.newPage(), dl = fs.mkdtempSync(path.join(TMP, 'dl-'));
  await page.setViewport({ width: 1440, height: 810 });
  page.__dl = dl; page.__reqs = []; page.__log = [];
  var cdp = await page.target().createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  page.on('console', function (m) { var t = m.text(); if (/^§/.test(t)) page.__log.push(t); });
  page.on('pageerror', function (e) { B.pageErrors.push(String(e && e.message).slice(0, 200)); });
  await page.setRequestInterception(true);
  page.on('request', function (rq) {
    var u = rq.url();
    page.__reqs.push(rq.method() + ' ' + u);
    if (u.indexOf(B.base) !== 0 && !/^(data|blob):/.test(u)) { B.external.push(rq.method() + ' ' + u.slice(0, 120) + (rq.postData() ? ' BODY=' + rq.postData().length : '')); return rq.abort(); }
    rq.continue();
  });
  if (rel) await page.goto(B.base + rel, { waitUntil: 'load', timeout: 120000 });
  return page;
}
function logOf(page, re, from) { return page.__log.slice(from || 0).filter(function (l) { return re.test(l); }); }
async function waitLog(page, re, from, ms) { var t0 = Date.now(); while (Date.now() - t0 < (ms || 120000)) { var l = logOf(page, re, from); if (l.length) return l[l.length - 1]; await sleep(100); } throw new Error('no page line ' + re + ' within ' + (ms || 120000) + ' ms; last lines: ' + page.__log.slice(-6).join(' | ').slice(0, 600)); }
// file_it.html
async function fiReady(page) { await page.waitForFunction(function () { return window.FileItPage && window.FileItPage.runner.ready(); }, { timeout: 180000 }); }
async function fiUpload(page, file) {
  var got = await Promise.all([page.waitForFileChooser({ timeout: 30000 }), page.click('label[for=file]')]);
  await got[0].accept([file]);
  await page.waitForFunction(function (n) { return window.FileItPage.state.name === n && !!window.FileItPage.state.wb && window.FileItPage.state.verdict === null; }, { timeout: 30000 }, path.basename(file));
}
async function fiFile(page) {
  await page.click('#b-file');
  await page.waitForFunction(function () { var s = window.FileItPage.state; return !s.busy && s.verdict !== null; }, { timeout: 180000 });
  return page.evaluate(function () {
    var s = window.FileItPage.state, a = document.getElementById('b-erp');
    return { verdict: s.verdict, text: document.getElementById('verdict').textContent, link: a.hidden ? null : a.getAttribute('href'), linkText: a.textContent, note: document.getElementById('erp-note').textContent,
      facts: s.last && s.last.facts ? { id: s.last.facts.id, window: s.last.facts.window, documentno: s.last.facts.documentno } : null, lines: window.FileItPage.runner.lines(), downloadOffered: !document.getElementById('b-download').hidden };
  });
}
function fiQ(page) { return function (sql, params) { return page.evaluate(function (s, p) { return window.FileItPage.runner.kernel().q(s, p || []); }, sql, params || []); }; }
async function fiDownload(page, name) {
  var f = path.join(page.__dl, name); if (fs.existsSync(f)) fs.unlinkSync(f);
  await page.click('#b-download');
  for (var i = 0; i < 100; i++) { if (fs.existsSync(f) && fs.statSync(f).size > 0 && !fs.readdirSync(page.__dl).some(function (x) { return /\.crdownload$/.test(x); })) return f; await sleep(100); }
  return null;
}
// idempiere.html
function erpQ(page) { return function (sql, params) { return page.evaluate(function (s, p) { var st = window.__idmpDb.prepare(s), out = []; try { if (p && p.length) st.bind(p); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }, sql, params || []); }; }
async function erpBoot(page) { var l = await waitLog(page, /^§IDEMPIERE boot db=/, 0, 180000); return (l.match(/db=(\S+)/) || [])[1]; }   // the hand-over hook runs before this line
async function erpLogin(page) {   // the page's own login card: tenant (when the page asks), user, role / org as offered, Log In
  var pick = function (list, nm) { return page.evaluate(function (l, n) { var e = Array.prototype.filter.call(document.querySelectorAll(l + ' .idmp-login-user'), function (x) { var m = x.querySelector('.nm'); return m && m.textContent.trim() === n; })[0]; if (e) e.click(); return !!e; }, list, nm); };
  await page.waitForFunction(function () { return document.getElementById('idmp-login').style.display === 'flex'; }, { timeout: 60000 });
  if (await pick('#idmp-login-clients', 'GardenWorld')) await sleep(300);
  await page.waitForFunction(function () { return document.querySelectorAll('#idmp-login-users .idmp-login-user').length > 0; }, { timeout: 30000 });
  if (!(await pick('#idmp-login-users', 'GardenAdmin'))) throw new Error('GardenAdmin is not on the login card');
  await page.waitForFunction(function () { var e = document.getElementById('idmp-login-step2'); return e && e.style.display !== 'none'; }, { timeout: 30000 });
  await page.click('#idmp-login-ok');
  await page.waitForFunction(function () { var t = document.getElementById('idmp-tree'); return t && t.children.length > 0; }, { timeout: 60000 });
}
async function erpOpen(ctx, rel) { var page = await newPage(ctx, rel); var src = await erpBoot(page); page.__src = src; return page; }
function snap(page) {
  return page.evaluate(function () {
    var cellsOf = function (tr) { var o = {}; Array.prototype.forEach.call(tr.querySelectorAll('td[data-ad-col]'), function (td) { o[td.getAttribute('data-ad-col')] = td.textContent.trim(); }); return o; };
    var form = {}; Array.prototype.forEach.call(document.querySelectorAll('#idmp-inline-mount input[data-col], #idmp-inline-mount select[data-col]'), function (e) { form[e.getAttribute('data-col')] = e.value; });
    return { tabs: Array.prototype.map.call(document.querySelectorAll('#idmp-tabstrip .idmp-adtab'), function (e) { return e.textContent.trim(); }),
      active: (document.querySelector('#idmp-tabstrip .idmp-adtab.active') || { textContent: '' }).textContent.trim(),
      rows: Array.prototype.map.call(document.querySelectorAll('tr[data-ad-record]'), function (tr) { return { table: tr.getAttribute('data-ad-table'), id: tr.getAttribute('data-ad-record'), cells: cellsOf(tr) }; }),
      form: form, status: document.getElementById('idmp-status-main').textContent, note: (document.getElementById('door-handover-note') || { textContent: null }).textContent };
  });
}
async function grid(page) {   // the tab's rows as the grid shows them (the toolbar's own Grid toggle when the tab is in form view)
  var s = await snap(page);
  if (!s.rows.length) { await page.click('#idmp-toolbar [data-tb="toggle"]'); await sleep(900); s = await snap(page); }
  return s;
}
async function tab(page, name) {
  var ok = await page.evaluate(function (n) { var e = Array.prototype.filter.call(document.querySelectorAll('#idmp-tabstrip .idmp-adtab'), function (x) { return x.textContent.trim() === n; })[0]; if (e) e.click(); return !!e; }, name);
  if (!ok) throw new Error('no tab ' + name);
  await page.waitForFunction(function (n) { return (document.querySelector('#idmp-tabstrip .idmp-adtab.active') || { textContent: '' }).textContent.trim() === n; }, { timeout: 20000 }, name); await sleep(1100);
}
async function menu(page, windowId) {   // the window opened from its menu leaf (no zoom)
  var id = (await erpQ(page)("SELECT MIN(AD_Menu_ID) AS m FROM AD_Menu WHERE AD_Window_ID=? AND Action='W' AND IsActive='Y'", [windowId]))[0].m, n0 = page.__log.length;
  var ok = await page.evaluate(function (i) { var leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]'); if (leaf) leaf.click(); return !!leaf; }, id);
  if (!ok) throw new Error('window ' + windowId + ' has no menu leaf for this role');
  await waitLog(page, /^§IDEMPIERE tab=/, n0, 30000); await sleep(900);
}
async function posted(page) {   // click the row's own Posted button, read the accounting view: as it opens, then each further schema of its selector (pick, Refresh)
  var n0 = page.__log.length, had = await page.evaluate(function () { var b = document.querySelector('.idmp-posted-btn'); if (b) b.click(); return b ? b.textContent.trim() : null; });
  if (!had) return { button: null, lines: [], log: null, schemas: [], more: [] };
  await sleep(900);
  var read = function () { return page.evaluate(function () {
    var o = document.getElementById('posted-overlay'), sel = o && o.querySelector('.posted-schema-sel');
    return { text: o ? o.textContent : null, schemas: sel ? Array.prototype.map.call(sel.options, function (x) { return x.value; }) : [], shown: sel ? sel.value : null,
      lines: Array.prototype.map.call(document.querySelectorAll('#posted-overlay .posted-line'), function (l) { var g = function (c) { var e = l.querySelector(c); return e ? e.textContent.trim() : null; }; return [g('.posted-acct'), g('.posted-dr'), g('.posted-cr')]; }) };
  }); };
  var r = await read(); r.button = had; r.log = logOf(page, /^§POSTED-FACTS/, n0)[0] || null; r.more = [];
  for (var i = 1; i < r.schemas.length; i++) {
    var n1 = page.__log.length;
    await page.evaluate(function (v) { var o = document.getElementById('posted-overlay'), s = o.querySelector('.posted-schema-sel'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); o.querySelector('.posted-refresh').click(); }, r.schemas[i]);
    await sleep(700);
    var m = await read(); m.log = logOf(page, /^§POSTED-FACTS/, n1)[0] || null; r.more.push(m);
  }
  await page.evaluate(function () { var x = document.querySelector('#posted-overlay .posted-ov-x'); if (x) x.click(); });
  return r;
}
// the door's scripts this page loaded, in order: the script elements of the document (the page loads every script as an element; puppeteer's request event misses what the
//   service worker answers and the resource-timing buffer stops at 250 entries, both found by this check failing)
function doorScripts(page) { return page.evaluate(function () { return Array.prototype.map.call(document.scripts, function (e) { return e.src || ''; }).filter(function (n) { return /door_handover|ws_kernel/.test(n); }).map(function (n) { return n.replace(/^.*\/erp\//, '').replace(/\?.*$/, ''); }); }); }
function handoverLine(page) { return logOf(page, /^§DOOR-HANDOVER applied=/)[0] || '(no §DOOR-HANDOVER line)'; }
function isLine(l, a, s, r) { return new RegExp('^§DOOR-HANDOVER applied=' + a + ' skipped=' + s + ' refused=' + r + ' ').test(l); }
// keep a ledger for the ERP page the way another page of this origin would: through the door's own offer (it verifies), from a file_it page
async function offerVia(page, name, lines) { return page.evaluate(function (n, l) { return window.DoorHandover.offer(window.WsKernel, n, l); }, name, lines); }
function stored(page) { return page.evaluate(function (k) { return JSON.parse(localStorage.getItem(k) || '{"books":{}}'); }, DH.KEY); }
function store(page, all) { return page.evaluate(function (k, v) { localStorage.setItem(k, JSON.stringify(v)); }, DH.KEY, all); }
// sig: the rows a ledger could touch, as counts and as the values of the rows it updates (before / after a refusal they must be the same string)
async function sig(q) {
  var o = {}, ts = ['c_invoice', 'c_invoiceline', 'c_invoicetax', 'fact_acct', 'i_invoice', 'c_order', 'c_orderline', 'c_greeting'];
  for (var i = 0; i < ts.length; i++) o[ts[i]] = Number((await q('SELECT count(*) AS n FROM ' + ts[i], []))[0].n);
  o.bp = (await q('SELECT so_creditused, totalopenbalance, actuallifetimevalue FROM c_bpartner WHERE c_bpartner_id=117', []))[0];
  o.period = (await q('SELECT c_period_id FROM c_acctschema WHERE c_acctschema_id=101', []))[0];
  return J(o);
}

(async function main() {
  say('§DOORERP-LOAD tree=' + ROOT + ' mutant=' + (MUTANT || 'none') + ' puppeteer=' + (PUP ? 'yes' : 'NO (the pages judge nothing)'));
  var WB_A = writeWb(SAMPLE.build(XLSX, { docno: DOCNO }), 'door_invoice.xlsx'), WB_9 = writeWb(SAMPLE.build(XLSX, { docno: DOCNO9 }), 'door_other.xlsx');

  // ═══ node: the oracle (rows straight into I_Invoice + AD_Process 207), the same workbook through the door, another workbook, an ORDER, and two crafted ledgers ═══
  var KO = await K.load(), oRun = KO.inTrx(S, { ws: 'oracle' }, function (trx, ML) {
    var rows = SAMPLE.LINES.map(function (l) { return { i_isimported: 'N', qtyordered: String(l.qty), issotrx: 'Y', doctypename: 'AR Invoice', iso_code: 'USD', bpartnervalue: 'C&W', dateinvoiced: DATE + ' 00:00:00', dateacct: DATE + ' 00:00:00', documentno: DOCNO, productvalue: l.product, description: l.description, priceactual: String(l.price) }; });
    for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, 'i_invoice', null, ML.newPO(trx, 'i_invoice', rows[i])); if (!sv.ok) return { ok: false, error: sv.error }; }
    var p = AP.runInTrx(trx, 207, { params: { AD_Client_ID: 11, AD_Org_ID: 11, DocAction: 'CO' } }); return { ok: p.ok, error: p.summary };
  });
  var FP_DIRECT = await fingerprint(KO.q, DOCNO), oracleOk = oRun.ok && FP_DIRECT !== '[]';
  var NA = await nodeFile(WB_A), N9 = await nodeFile(WB_9), FP_NODE = NA.k ? await fingerprint(NA.k.q, DOCNO) : '[]';
  say('§DOORERP-ORACLE direct ok=' + oRun.ok + ' fingerprintBytes=' + FP_DIRECT.length + ' node door verdict=' + NA.r.verdict + ' sameFingerprint=' + (FP_NODE === FP_DIRECT) + ' ledgerLineChars=' + (NA.lines[0] || '').length);
  // an ORDER: iDempiere's Import Order (AD_Process 206) in the node kernel, one transaction, one journal entry. The door itself files invoices only (sheet_door.js); this is the
  //   same kind of ledger entry from another document, to show the hand-over hook is not about invoices.
  var KS = await K.load(), sRun = KS.inTrx(S, { ws: 'door_witness_order' }, function (trx, ML) {
    var rows = [[123, 2], [130, 1]].map(function (p) { return { i_isimported: 'N', issotrx: 'Y', documentno: SO, doctypename: 'Standard Order', bpartnervalue: 'C&W', m_product_id: p[0], qtyordered: p[1], c_uom_id: 100, dateordered: DATE + ' 00:00:00' }; });
    for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, 'i_order', null, ML.newPO(trx, 'i_order', rows[i])); if (!sv.ok) return { ok: false, error: sv.error }; }
    var p = AP.runInTrx(trx, 206, { params: { AD_Client_ID: 11, AD_Org_ID: 11, DocAction: 'PR' } }); return { ok: p.ok, error: p.summary };
  });
  var SO_LINES = KS.journal.map(J), SO_ROW = KS.one('SELECT c_order_id, documentno, docstatus, grandtotal, c_bpartner_id, issotrx FROM c_order WHERE documentno=?', [SO]) || {};
  var SO_OL = KS.q('SELECT c_orderline_id, line, m_product_id, qtyordered, linenetamt FROM c_orderline WHERE c_order_id=? ORDER BY line', [SO_ROW.c_order_id || -1]), SO_WIN = RN.zoomWindow(KS, 'c_order', SO_ROW.issotrx);
  say('§DOORERP-ORDER import ok=' + sRun.ok + ' entries=' + SO_LINES.length + ' order=' + J(SO_ROW) + ' lines=' + SO_OL.length + ' window=' + SO_WIN);
  // crafted ledgers (signed by the node kernel's own commit): D = a row that has moved on once workbook A is in the books; T = entry 1 harmless, entry 2 the same conflict
  var KD = await K.load(); KD.commit(S, [{ op_type: 'CRUD_UPDATE', table: 'c_bpartner', id: 117, changes: { so_creditused: { old: 161.12, new: 999 } } }], { ws: 'door_witness_moved' });
  var D_LINES = KD.journal.map(J);
  var KT = await K.load(); KT.commit(S, [{ op_type: 'CRUD_CREATE', table: 'c_greeting', fields: { name: 'door-atomic', greeting: 'x' } }], { ws: 'door_witness_atomic' });
  KT.commit(S, [{ op_type: 'CRUD_UPDATE', table: 'c_bpartner', id: 117, changes: { so_creditused: { old: 161.12, new: 999 } } }], { ws: 'door_witness_atomic' });
  var T_LINES = KT.journal.map(J);

  var srv = await serve(); B.base = srv.base;
  if (PUP) B.browser = await PUP.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'], env: (function () { var e = Object.assign({}, process.env); delete e.DBUS_SESSION_BUS_ADDRESS; return e; })() });

  if (B.browser) {
    // ═════════ context 0: a page that took NO hand-over (the baseline of E1, E5, E7, E8) ═════════
    var base = { ok: false };
    try {
      var c0 = await B.browser.createBrowserContext(), p0 = await erpOpen(c0, 'erp/idempiere.html');
      base = { ok: true, hooks: await p0.evaluate(function () { return window.AdModelVal.registeredCount(); }), sig: await sig(erpQ(p0)), inv: (await erpQ(p0)('SELECT count(*) AS n FROM c_invoice WHERE documentno LIKE ?', ['DOORERP-%']))[0].n,
        door: await doorScripts(p0), resources: await p0.evaluate(function () { return document.scripts.length; }), line: logOf(p0, /^§DOOR-HANDOVER/), dh: await p0.evaluate(function () { return typeof window.DoorHandover + '/' + typeof window.WsKernel; }),
        applied: (await erpQ(p0)("SELECT count(*) AS n FROM sqlite_master WHERE name='door_ledger_applied'", []))[0].n };
      await c0.close();
    } catch (e) { base.err = String(e && e.message); }
    say('§DOORERP-BASELINE (a page that took no hand-over) ' + J(base).slice(0, 700));

    // ═════════ context 1: the real path. file_it.html -> its own link -> idempiere.html ═════════
    var c1 = await B.browser.createBrowserContext(), pf = null, v1 = null, pe = null, dlA = null, FQ = null, EQ = null, ID = null, WIN = null, FA_F = null;
    await guard('E1', 'books', 'the sample invoice filed on file_it.html is in the ERP page DB after its own link is followed', async function () {
      pf = await newPage(c1, 'erp/sheet_addin/file_it.html'); await fiReady(pf);
      await fiUpload(pf, WB_A); v1 = await fiFile(pf); FQ = fiQ(pf);
      dlA = v1.downloadOffered ? await fiDownload(pf, 'door_invoice.xlsx') : null;
      var invF = (await FQ('SELECT c_invoice_id, documentno, c_bpartner_id, grandtotal, totallines, docstatus, posted, issotrx FROM c_invoice WHERE documentno=?', [DOCNO]))[0] || {};
      FA_F = await FQ('SELECT fact_acct_id, c_acctschema_id, account_id, amtacctdr, amtacctcr FROM fact_acct WHERE ad_table_id=318 AND record_id=? ORDER BY fact_acct_id', [invF.c_invoice_id || -1]);
      var FP_F = await fingerprint(FQ, DOCNO), m = /^\.\.\/idempiere\.html\?window=(\d+)&record=(\d+)$/.exec(v1.link || '');
      ID = invF.c_invoice_id; WIN = m ? Number(m[1]) : null;
      check('E1', 'filed', 'the filing page filed it (FILED) and its books equal the node oracle (fingerprint, non-empty)', v1.verdict === 'FILED' && oracleOk && FP_F === FP_DIRECT, { v: v1.verdict, text: v1.text });
      check('E1', 'link', 'the page offers "Open in the ERP": the ERP page\'s own deep link ?window=&record= and nothing else in it (no login); record == the filed C_Invoice_ID', !!m && Number(m[2]) === Number(ID) && /Open in the ERP/.test(v1.linkText), { link: v1.link, id: ID });
      // follow the link the way a user does: a click, a navigation of this tab
      pe = pf; pe.__log.length = 0; pe.__reqs.length = 0;
      await Promise.all([pe.waitForNavigation({ waitUntil: 'load', timeout: 120000 }), pe.click('#b-erp')]);
      pe.__src = await erpBoot(pe); EQ = erpQ(pe);
      var note = (await snap(pe)).note;
      var winDict = (await EQ("SELECT AD_Window_ID AS w FROM AD_Table WHERE TableName='C_Invoice'", []))[0].w;
      check('E1', 'link-window', 'the link\'s window is the one the ERP page\'s own dictionary gives for C_Invoice (AD_Table.AD_Window_ID; a sales-side record)', WIN === Number(winDict) && invF.issotrx === 'Y', { link: WIN, dict: winDict });
      var hl = handoverLine(pe);
      say('  page: ' + hl); logOf(pe, /^§(DOOR-HANDOVER-COST|PROJ-SNAPSHOT|IDEMPIERE boot)/).forEach(function (l) { say('  page: ' + l); });
      check('E1', 'log', 'the ERP page logged §DOOR-HANDOVER applied=1 skipped=0 refused=0 (before its login)', isLine(hl, 1, 0, 0), hl);
      var invE = await EQ('SELECT c_invoice_id, documentno, c_bpartner_id, grandtotal, totallines, docstatus, posted, issotrx FROM c_invoice WHERE documentno=?', [DOCNO]);
      check('E1', 'header', 'the ERP page DB holds that invoice exactly ONCE and its id, DocumentNo, partner, grand total, lines total, DocStatus and Posted equal the filing page\'s row (a page with no hand-over holds none)', invE.length === 1 && J(invE[0]) === J(invF) && invF.docstatus === 'CO' && invF.posted === 'Y' && Number(invF.grandtotal) === 153.5 && base.ok && Number(base.inv) === 0, { erp: invE, filing: invF, baseline: base.inv });
      var FA_E = await EQ('SELECT fact_acct_id, c_acctschema_id, account_id, amtacctdr, amtacctcr FROM fact_acct WHERE ad_table_id=318 AND record_id=? ORDER BY fact_acct_id', [ID]);
      var bal = {}; FA_E.forEach(function (f) { var b = bal[f.c_acctschema_id] = bal[f.c_acctschema_id] || [0, 0]; b[0] += cents(f.amtacctdr); b[1] += cents(f.amtacctcr); });
      check('E1', 'fact-acct', 'the Fact_Acct rows of that record in the ERP page DB equal the filing page\'s (id, schema, account, debit, credit), ' + FA_F.length + ' rows; per accounting schema debits = credits > 0', FA_E.length > 0 && J(FA_E) === J(FA_F) && Object.keys(bal).length > 0 && Object.keys(bal).every(function (k) { return bal[k][0] === bal[k][1] && bal[k][0] > 0; }), { erp: FA_E, filing: FA_F, bal: bal });
      check('E1', 'fingerprint', 'fingerprint(ERP page DB) == fingerprint(filing page) == fingerprint(node oracle)', (await fingerprint(EQ, DOCNO)) === FP_DIRECT && FP_F === FP_DIRECT, null);
      check('E1', 'told', 'the page tells the user in plain words that the document of that workbook is now in these books', /1 document filed from your sheet door_invoice\.xlsx is now in these books\./.test(String(note)), note);
    });
    verdict('E1');

    await guard('E2', 'window', 'what the user sees in the window the link opens', async function () {
      await erpLogin(pe); await waitLog(pe, /^§ZOOM window=/, 0, 60000); await sleep(1200);
      var dictTabs = (await EQ("SELECT Name AS n FROM AD_Tab WHERE AD_Window_ID=? AND IsActive='Y' ORDER BY SeqNo", [WIN])).map(function (r) { return r.n; }), s0 = await snap(pe);
      var bp = (await EQ('SELECT b.name FROM c_invoice i JOIN c_bpartner b ON b.c_bpartner_id=i.c_bpartner_id WHERE i.c_invoice_id=?', [ID]))[0] || {};
      check('E2', 'landed', 'the link landed in window ' + WIN + ': its tabs are the dictionary\'s tabs, in order; the record shown is the filed one (DocumentNo, grand total, DocStatus in the form) - Record 1 of 1', J(s0.tabs) === J(dictTabs) && dictTabs.length > 1 && s0.form.documentno === DOCNO && Number(s0.form.grandtotal) === 153.5 && s0.form.docstatus === 'CO' && /Record 1 of 1/.test(s0.status), { tabs: s0.tabs, dict: dictTabs, form: [s0.form.documentno, s0.form.grandtotal, s0.form.docstatus], status: s0.status });
      var g = await grid(pe), r0 = g.rows[0] || { cells: {} };
      var dbRow = (await EQ('SELECT documentno FROM c_invoice WHERE c_invoice_id=?', [Number(r0.id) || -1]))[0];
      check('E2', 'grid', 'the grid shows exactly 1 row; its record id == the filed C_Invoice_ID, the DB holds a row at the id the grid shows, and its DocumentNo and Business Partner cells are the DB\'s (the partner by NAME)', g.rows.length === 1 && r0.table === 'C_Invoice' && Number(r0.id) === Number(ID) && !!dbRow && dbRow.documentno === r0.cells.DocumentNo && r0.cells.DocumentNo === DOCNO && !!bp.name && r0.cells.C_BPartner_ID === bp.name, { rows: g.rows.map(function (r) { return [r.table, r.id, r.cells.DocumentNo, r.cells.C_BPartner_ID]; }), db: dbRow, bp: bp });
      // the posting, from the row's own Posted button
      var pv = await posted(pe), sch = FA_F.length ? FA_F[0].c_acctschema_id : null, want = [];
      var fe = await EQ('SELECT f.account_id, f.amtacctdr, f.amtacctcr, ev.value, ev.name FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_table_id=318 AND f.record_id=? AND f.c_acctschema_id=? ORDER BY f.fact_acct_id', [ID, sch]);
      fe.forEach(function (f) { want.push([f.value + ' · ' + f.name, cents(f.amtacctdr), cents(f.amtacctcr)]); });
      var shown = pv.lines.map(function (l) { return [l[0], cents(num(l[1])), cents(num(l[2]))]; });
      say('  page: ' + pv.log);
      check('E2', 'posting', 'the Posted view (the row\'s own button, "' + pv.button + '") shows the Fact_Acct rows of the page DB for that record in its first accounting schema: same account, debit, credit, same count (' + want.length + '), balanced', want.length > 0 && J(shown) === J(want) && /balanced=true/.test(String(pv.log)) && shown.reduce(function (a, l) { return a + l[1] - l[2]; }, 0) === 0, { shown: shown, want: want, log: pv.log });
      // every entry of the record: the view's schema selector, each further schema picked and refreshed (the Account Viewer's way; it never lists two schemas at once)
      var seenAll = shown.length, allOk = pv.shown === String(sch), offered = (await EQ('SELECT DISTINCT c_acctschema_id AS s FROM fact_acct WHERE ad_table_id=318 AND record_id=? ORDER BY 1', [ID])).map(function (r) { return String(r.s); });
      for (var mi = 0; mi < pv.more.length; mi++) {
        var m = pv.more[mi], fm = await EQ('SELECT f.amtacctdr, f.amtacctcr, ev.value, ev.name FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_table_id=318 AND f.record_id=? AND f.c_acctschema_id=? ORDER BY f.fact_acct_id', [ID, Number(m.shown)]);
        var wm = fm.map(function (f) { return [f.value + ' · ' + f.name, cents(f.amtacctdr), cents(f.amtacctcr)]; }), sm = m.lines.map(function (l) { return [l[0], cents(num(l[1])), cents(num(l[2]))]; });
        say('  page: ' + m.log);
        seenAll += sm.length; if (J(sm) !== J(wm) || !wm.length || !/balanced=true/.test(String(m.log)) || m.shown !== pv.schemas[mi + 1]) allOk = false;
      }
      check('E2', 'posting-all', 'through the view\'s schema selector (' + pv.schemas.join(', ') + ': pick, Refresh) every Fact_Acct row of the record is shown, each under its own schema, equal to the page DB: ' + seenAll + ' of ' + FA_F.length + ' entries; every schema that holds rows is offered', allOk && seenAll === FA_F.length && FA_F.length === 6 && offered.every(function (x) { return pv.schemas.indexOf(x) >= 0; }) && offered.length === 2, { seen: seenAll, of: FA_F.length, schemas: pv.schemas, offered: offered, more: pv.more.map(function (x) { return [x.shown, x.lines.length, x.log]; }) });
      // the lines, WITHOUT Save
      var saves0 = logOf(pe, /^§CRUD-(PERSIST|GROUP-PERSIST)/).length;
      await tab(pe, dictTabs[1]); var gl = await grid(pe);
      var lDb = await EQ('SELECT c_invoiceline_id, c_invoice_id, line, linenetamt FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line', [ID]);
      var parentOf = {}; for (var i = 0; i < gl.rows.length; i++) { var pr = (await EQ('SELECT c_invoice_id FROM c_invoiceline WHERE c_invoiceline_id=?', [Number(gl.rows[i].id)]))[0]; parentOf[gl.rows[i].id] = pr ? pr.c_invoice_id : null; }
      check('E2', 'lines', 'tab "' + dictTabs[1] + '" shows the 2 lines without any Save: 2 grid rows, their record ids == the DB\'s C_InvoiceLine ids of that invoice, the parent id of every shown row == the invoice; no save happened on the page', gl.rows.length === 2 && lDb.length === 2 && J(gl.rows.map(function (r) { return Number(r.id); }).sort()) === J(lDb.map(function (r) { return Number(r.c_invoiceline_id); }).sort()) &&
        gl.rows.every(function (r) { return r.table === 'C_InvoiceLine' && Number(parentOf[r.id]) === Number(ID); }) && logOf(pe, /^§CRUD-(PERSIST|GROUP-PERSIST)/).length === saves0, { rows: gl.rows.map(function (r) { return [r.table, r.id]; }), parentOf: parentOf, db: lDb });
      await tab(pe, dictTabs[0]); var gb = await grid(pe);
      check('E2', 'parent-intact', 'back on tab "' + dictTabs[0] + '" the same single row is there (record id, DocumentNo)', gb.rows.length === 1 && Number(gb.rows[0].id) === Number(ID) && gb.rows[0].cells.DocumentNo === DOCNO, gb.rows.map(function (r) { return [r.id, r.cells.DocumentNo]; }));
      await menu(pe, WIN); var gm = await grid(pe), mine = gm.rows.filter(function (r) { return Number(r.id) === Number(ID); });
      var tl = logOf(pe, /^§IDEMPIERE tab=/).pop();
      say('  page: ' + tl);
      check('E2', 'menu', 'the same window opened from its MENU leaf (no zoom) lists the record exactly once among its ' + gm.rows.length + ' rows, and every row the grid shows has its row in the DB', mine.length === 1 && gm.rows.length >= 1 && (await EQ('SELECT count(*) AS n FROM c_invoice WHERE c_invoice_id IN (' + gm.rows.map(function (r) { return Number(r.id) || -1; }).concat([-1]).join(',') + ')', []))[0].n === gm.rows.length, { rows: gm.rows.map(function (r) { return r.id; }) });
    });
    verdict('E2');

    // ═════════ E4 / E6: a reload, then the workbook filed again ═════════
    var pr1 = null, src1 = null;
    await guard('E4', 'reload', 'the ERP page reloaded: nothing is applied a second time', async function () {
      await sleep(1500);   // the page's own persist is an IndexedDB write
      await pe.close();
      pr1 = await erpOpen(c1, 'erp/idempiere.html?window=' + WIN + '&record=' + ID); src1 = pr1.__src;
      var hl = handoverLine(pr1), q = erpQ(pr1); say('  page: ' + hl + '   (boot db=' + src1 + ')');
      var n = { inv: (await q('SELECT count(*) AS n FROM c_invoice WHERE documentno=?', [DOCNO]))[0].n, fa: (await q('SELECT count(*) AS n FROM fact_acct WHERE ad_table_id=318 AND record_id=?', [ID]))[0].n,
        il: (await q('SELECT count(*) AS n FROM c_invoiceline WHERE c_invoice_id=?', [ID]))[0].n, tax: (await q('SELECT count(*) AS n FROM c_invoicetax WHERE c_invoice_id=?', [ID]))[0].n, ap: (await q('SELECT count(*) AS n FROM door_ledger_applied', []))[0].n };
      check('E4', 'reload', 'after a reload: §DOOR-HANDOVER applied=0 skipped=1 refused=0; still exactly 1 invoice, 2 lines, 1 tax row, ' + FA_F.length + ' Fact_Acct rows; 1 applied hash recorded', isLine(hl, 0, 1, 0) && n.inv === 1 && n.il === 2 && n.tax === 1 && n.fa === FA_F.length && n.ap === 1, { line: hl, n: n });
      check('E4', 'same-books', 'the fingerprint of the reloaded page DB is still the oracle\'s', (await fingerprint(q, DOCNO)) === FP_DIRECT, null);
    });
    await guard('E6', 'kept', 'the invoice survives the reload because the page kept it, not because it was applied again', async function () {
      check('E6', 'bundle', 'the reloaded page booted from its resident bundle (§IDEMPIERE boot db=idb_cache), applied nothing, and the invoice with its ' + FA_F.length + ' Fact_Acct rows is there', src1 === 'idb_cache' && isLine(handoverLine(pr1), 0, 1, 0) && (await fingerprint(erpQ(pr1), DOCNO)) === FP_DIRECT, { src: src1, line: handoverLine(pr1) });
    });
    var ID2 = null;
    await guard('E4', 'again', 'the same workbook filed again with a new number: only the new entry is applied', async function () {
      var wb = readWb(dlA || WB_A); wb.Sheets.Invoice.F2 = { t: 's', v: DOCNO2 };
      var WB_A2 = writeWb(wb, 'door_invoice.xlsx'), pf2 = await newPage(c1, 'erp/sheet_addin/file_it.html'); await fiReady(pf2);
      await fiUpload(pf2, WB_A2); var v2 = await fiFile(pf2), bpF = (await fiQ(pf2)('SELECT so_creditused, totalopenbalance, actuallifetimevalue FROM c_bpartner WHERE c_bpartner_id=117', []))[0];
      ID2 = v2.facts && v2.facts.id;
      check('E4', 'chained', 'filed again (FILED): the workbook\'s ledger now has 2 entries, chained, and the page offers the link to the NEW record', v2.verdict === 'FILED' && v2.lines.length === 2 && K.verifyJournal(v2.lines.join('\n')).ok === true && !!ID2 && Number(ID2) !== Number(ID) && new RegExp('record=' + ID2 + '$').test(String(v2.link)), { v: v2.verdict, text: v2.text, lines: v2.lines.length, link: v2.link });
      pf2.__log.length = 0;
      await Promise.all([pf2.waitForNavigation({ waitUntil: 'load', timeout: 120000 }), pf2.click('#b-erp')]);
      pf2.__src = await erpBoot(pf2); var q = erpQ(pf2), hl = handoverLine(pf2); say('  page: ' + hl);
      var n1 = (await q('SELECT count(*) AS n FROM c_invoice WHERE documentno=?', [DOCNO]))[0].n, n2 = (await q('SELECT count(*) AS n FROM c_invoice WHERE documentno=?', [DOCNO2]))[0].n;
      var fa = (await q('SELECT count(*) AS n FROM fact_acct WHERE ad_table_id=318 AND record_id IN (?,?)', [ID, ID2]))[0].n, bpE = (await q('SELECT so_creditused, totalopenbalance, actuallifetimevalue FROM c_bpartner WHERE c_bpartner_id=117', []))[0];
      check('E4', 'one-of-each', '§DOOR-HANDOVER applied=1 skipped=1 refused=0; exactly one invoice of each number, ' + (2 * FA_F.length) + ' Fact_Acct rows for the two; the customer\'s open balance and credit used equal the filing page\'s (' + J(bpF) + ')', isLine(hl, 1, 1, 0) && n1 === 1 && n2 === 1 && fa === 2 * FA_F.length && J(bpE) === J(bpF), { line: hl, n1: n1, n2: n2, fa: fa, bpE: bpE, bpF: bpF });
      await erpLogin(pf2); await waitLog(pf2, /^§ZOOM window=/, 0, 60000); await sleep(1000);
      var g = await grid(pf2);
      check('E4', 'second-in-window', 'the second link lands on the second invoice: 1 grid row, record id == its C_Invoice_ID, DocumentNo ' + DOCNO2, g.rows.length === 1 && Number(g.rows[0].id) === Number(ID2) && g.rows[0].cells.DocumentNo === DOCNO2, g.rows.map(function (r) { return [r.id, r.cells.DocumentNo]; }));
      // E6 second half on this page: a normal save through the toolbar, then another reload
      await guard('E6', 'normal-save', 'a normal save in the page, then a reload', async function () {
        var gw = (await q("SELECT AD_Window_ID AS w FROM AD_Window WHERE Name='Greeting'", []))[0].w, n0 = pf2.__log.length;
        await menu(pf2, gw); await pf2.click('#idmp-toolbar [data-tb="new"]'); await pf2.waitForSelector('#idmp-inline-mount input[data-col="name"]', { timeout: 20000 });
        await pf2.click('#idmp-inline-mount input[data-col="name"]'); await pf2.type('#idmp-inline-mount input[data-col="name"]', 'Door witness'); await pf2.keyboard.press('Tab');
        await pf2.click('#idmp-toolbar [data-tb="save"]'); var sv = await waitLog(pf2, /^§CRUD-PERSIST key=c_greeting/, n0, 30000); say('  page: ' + sv.slice(0, 200));
        await sleep(1500); await pf2.close();
        var p3 = await erpOpen(c1, 'erp/idempiere.html'), q3 = erpQ(p3), hl3 = handoverLine(p3); say('  page: ' + hl3 + '   (boot db=' + p3.__src + ')');
        await erpLogin(p3);
        await menu(p3, gw); var gg = await grid(p3), mineG = gg.rows.filter(function (r) { return r.cells.Name === 'Door witness'; });
        await menu(p3, WIN); var gi = await grid(p3), ids = gi.rows.map(function (r) { return Number(r.id); });
        check('E6', 'after-save', 'after a normal save (a new Greeting through the toolbar: ' + (sv.match(/op=\S+/) || [''])[0] + ', its own op log) and a reload: boot from the bundle, §DOOR-HANDOVER applied=0 skipped=2 refused=0, both invoices with the oracle fingerprint, the saved Greeting is in its window (record id ' + (mineG[0] && mineG[0].id) + ', the page\'s own negative id) and the Invoice window from the menu lists both invoices',
          p3.__src === 'idb_cache' && isLine(hl3, 0, 2, 0) && (await fingerprint(q3, DOCNO)) === FP_DIRECT && (await fingerprint(q3, DOCNO2)).split(DOCNO2).join(DOCNO) === FP_DIRECT && mineG.length === 1 && Number(mineG[0].id) < 0 && ids.indexOf(Number(ID)) >= 0 && ids.indexOf(Number(ID2)) >= 0,
          { src: p3.__src, line: hl3, greeting: gg.rows.map(function (r) { return [r.id, r.cells.Name]; }), invoices: ids });
        await p3.close();
      });
    });
    verdict('E4'); verdict('E6');
    await c1.close();

    // ═════════ context 2: E3 another document kind through the same hook ═════════
    await guard('E3', 'generic', 'a Sales Order\'s ledger entry through the same hand-over', async function () {
      var c2 = await B.browser.createBrowserContext(), px = await newPage(c2, 'erp/sheet_addin/file_it.html'); await fiReady(px);
      var of = await offerVia(px, 'an order from the node kernel', SO_LINES);
      check('E3', 'order-made', 'the node kernel made a Sales Order through iDempiere\'s Import Order (one journal entry, 2 lines, In Progress) and the door\'s offer took its ledger (verified)', sRun.ok && SO_LINES.length === 1 && SO_ROW.docstatus === 'IP' && SO_OL.length === 2 && of.ok === true && of.entries === 1, { run: sRun.error, row: SO_ROW, offer: of });
      await px.close();
      var po = await erpOpen(c2, 'erp/idempiere.html?window=' + SO_WIN + '&record=' + SO_ROW.c_order_id), q = erpQ(po), hl = handoverLine(po); say('  page: ' + hl);
      var row = (await q('SELECT c_order_id, documentno, docstatus, grandtotal, c_bpartner_id, issotrx FROM c_order WHERE documentno=?', [SO])), ol = await q('SELECT c_orderline_id, line, m_product_id, qtyordered, linenetamt FROM c_orderline WHERE c_order_id=? ORDER BY line', [SO_ROW.c_order_id]);
      var winDict = (await q("SELECT AD_Window_ID AS w FROM AD_Table WHERE TableName='C_Order'", []))[0].w;
      check('E3', 'order-books', '§DOOR-HANDOVER applied=1 skipped=0 refused=0; the ERP page DB holds that order once, equal to the node kernel\'s row and its 2 lines; its window by the dictionary is ' + winDict, isLine(hl, 1, 0, 0) && row.length === 1 && J(row[0]) === J(SO_ROW) && J(ol) === J(SO_OL) && Number(winDict) === Number(SO_WIN), { line: hl, row: row, ol: ol, why: logOf(po, /^§DOOR-HANDOVER-REFUSED/) });
      await erpLogin(po); await waitLog(po, /^§ZOOM window=/, 0, 60000); await sleep(1200);
      var dictTabs = (await q("SELECT Name AS n FROM AD_Tab WHERE AD_Window_ID=? AND IsActive='Y' ORDER BY SeqNo", [SO_WIN])).map(function (r) { return r.n; }), g = await grid(po);
      await tab(po, dictTabs[1]); var gl = await grid(po);
      check('E3', 'order-window', 'the same generic window engine shows it: window ' + SO_WIN + ', 1 grid row with record id == C_Order_ID and its DocumentNo; tab "' + dictTabs[1] + '" shows its 2 lines (record ids == the DB\'s)', g.rows.length === 1 && g.rows[0].table === 'C_Order' && Number(g.rows[0].id) === Number(SO_ROW.c_order_id) && g.rows[0].cells.DocumentNo === SO &&
        gl.rows.length === 2 && J(gl.rows.map(function (r) { return Number(r.id); }).sort()) === J(SO_OL.map(function (r) { return Number(r.c_orderline_id); }).sort()), { g: g.rows.map(function (r) { return [r.table, r.id, r.cells.DocumentNo]; }), lines: gl.rows.map(function (r) { return [r.table, r.id]; }) });
      await c2.close();
      // no table of the dictionary is named in the hand-over code or in the page's hook (comments stripped)
      var strip = function (t) { return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1'); };
      var code = strip(fs.readFileSync(path.join(ERP, 'door_handover.js'), 'utf8')), html = fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8'), h0 = html.indexOf("try { if (localStorage.getItem('door_handover_v1'))"), hook = h0 < 0 ? '' : html.slice(h0, html.indexOf('if (ADP && ADP.init) ADP.init(db);', h0));
      var tables = KS.q('SELECT lower(tablename) AS t FROM ad_table', []).map(function (r) { return r.t; }), hit = tables.filter(function (t) { return new RegExp('(^|[^a-z0-9_])' + t.replace(/[^a-z0-9_]/g, '') + '([^a-z0-9_]|$)', 'i').test(code + '\n' + hook); });
      check('E3', 'no-table-named', 'door_handover.js (comments stripped) and the hook in idempiere.html (' + hook.split('\n').length + ' lines, ' + hook.length + ' characters) name none of the dictionary\'s ' + tables.length + ' tables; the hook holds no "if table" branch', tables.length > 500 && hook.length > 100 && hit.length === 0 && !/tablename|table\s*===/i.test(hook), { hit: hit.slice(0, 10), hookLen: hook.length });
    });
    verdict('E3');

    // ═════════ context 3: E5 refusals on a page that holds nothing yet ═════════
    await guard('E5', 'tamper', 'a changed character and a line that is no journal entry', async function () {
      var c3 = await B.browser.createBrowserContext(), px = await newPage(c3, 'erp/sheet_addin/file_it.html'); await fiReady(px);
      var bad = NA.lines[0].replace('"grandtotal":153.5', '"grandtotal":163.5'), head = NA.lines[0].replace('"actor":"user:100"', '"actor":"user:101"');
      var ofHead = await offerVia(px, 'head.xlsx', [head]);
      check('E5', 'offer-refuses', 'the tamper is real (one character differs in each line) and the door\'s own offer refuses a ledger whose chain is broken; nothing is kept', bad !== NA.lines[0] && bad.length === NA.lines[0].length && head !== NA.lines[0] && head.length === NA.lines[0].length && ofHead.ok === false && Object.keys((await stored(px)).books).length === 0, ofHead);
      // tampering AT REST: the kept record is edited after a good offer (what the ERP page must not trust)
      await store(px, { books: { a: { name: 'payload-changed.xlsx', lines: [bad] }, b: { name: 'header-changed.xlsx', lines: [head] }, c: { name: 'not-a-ledger.xlsx', lines: ['this is not a journal entry'] } } });
      await px.close();
      var pt = await erpOpen(c3, 'erp/idempiere.html'), q = erpQ(pt), hl = handoverLine(pt), why = logOf(pt, /^§DOOR-HANDOVER-REFUSED/), note = (await snap(pt)).note;
      say('  page: ' + hl); why.forEach(function (w) { say('  page: ' + w); });
      var by = function (n) { return why.filter(function (w) { return w.indexOf('book="' + n + '"') >= 0; })[0] || ''; };
      check('E5', 'refused-3', '§DOOR-HANDOVER applied=0 skipped=0 refused=3; each named with its reason: the changed payload (does not match its digest), the changed header (does not verify), the non-entry (unparseable)', isLine(hl, 0, 0, 3) && /does not match its digest/.test(by('payload-changed.xlsx')) && /does not verify/.test(by('header-changed.xlsx')) && /unparseable/.test(by('not-a-ledger.xlsx')), { line: hl, why: why });
      check('E5', 'nothing-applied', 'nothing was applied: the rows a ledger could touch are exactly those of a page that took no hand-over (counts of 8 tables, the customer\'s balances, the schema\'s period), no invoice of that number, no applied-hash table', base.ok && (await sig(q)) === base.sig && (await fingerprint(q, DOCNO)) === '[]' && (await q("SELECT count(*) AS n FROM sqlite_master WHERE name='door_ledger_applied'", []))[0].n === 0, { sig: await sig(q), base: base.sig });
      check('E5', 'told', 'the page tells the user in plain words, naming each workbook, that it was not taken and nothing was changed', /Not taken into these books: payload-changed\.xlsx/.test(String(note)) && /header-changed\.xlsx/.test(String(note)) && /Nothing was changed\./.test(String(note)), note);
      await c3.close();
    });
    await guard('E5', 'collide', 'record ids already used, a row that moved on, a ledger whose second entry is refused', async function () {
      var c4 = await B.browser.createBrowserContext(), px = await newPage(c4, 'erp/sheet_addin/file_it.html'); await fiReady(px);
      var o1 = await offerVia(px, 'first.xlsx', NA.lines); await px.close();
      var pa = await erpOpen(c4, 'erp/idempiere.html'), qa = erpQ(pa), hlA = handoverLine(pa), sigA = await sig(qa); say('  page: ' + hlA);
      check('E5', 'first-taken', 'a good ledger (the node door\'s filing of the same workbook) is taken first: applied=1, the oracle fingerprint; so the guard does not refuse everything', o1.ok && isLine(hlA, 1, 0, 0) && (await fingerprint(qa, DOCNO)) === FP_DIRECT && sigA !== base.sig, { line: hlA });
      // three more ledgers reach the same books: all three verify (the offer takes them), none may be applied
      var o2 = await pa.evaluate(function (n9, d, t) { var D = window.DoorHandover, K0 = window.WsKernel; return [D.offer(K0, 'other-workbook.xlsx', n9), D.offer(K0, 'moved-on.xlsx', d), D.offer(K0, 'two-entries.xlsx', t)]; }, N9.lines, D_LINES, T_LINES);
      await sleep(1500); await pa.close();
      var pb = await erpOpen(c4, 'erp/idempiere.html'), qb = erpQ(pb), hlB = handoverLine(pb), why = logOf(pb, /^§DOOR-HANDOVER-REFUSED/); say('  page: ' + hlB); why.forEach(function (w) { say('  page: ' + w); });
      var by = function (n) { return why.filter(function (w) { return w.indexOf('book="' + n + '"') >= 0; })[0] || ''; };
      check('E5', 'three-verify', 'the three other ledgers are well-formed (the offer verified and kept each): a different workbook (same seed, so the same record ids), an update of a row, a 2-entry chain', o2.every(function (o) { return o.ok === true; }) && N9.r.verdict === 'FILED' && D_LINES.length === 1 && T_LINES.length === 2, o2);
      check('E5', 'ids-used', 'the different workbook is REFUSED: its record ids are already in these books (named: table and id)', /is already in these books/.test(by('other-workbook.xlsx')) && (await fingerprint(qb, DOCNO9)) === '[]' && (await qb('SELECT count(*) AS n FROM c_invoice WHERE c_invoice_id=?', [NA.last.facts.id]))[0].n === 1, by('other-workbook.xlsx'));
      check('E5', 'moved-on', 'the update is REFUSED: the row no longer holds the value the ledger started from (named: table, id, column, both values 314.62 and 161.12)', /c_bpartner 117 so_creditused is 314\.62 in these books, the ledger started from 161\.12/.test(by('moved-on.xlsx')), by('moved-on.xlsx'));
      check('E5', 'all-or-none', 'the 2-entry ledger is REFUSED whole: its first entry alone would apply (a new record), its second is refused, and the first entry\'s record is NOT in the books', /entry 2: c_bpartner 117/.test(by('two-entries.xlsx')) && (await qb("SELECT count(*) AS n FROM c_greeting WHERE name='door-atomic'", []))[0].n === 0, { why: by('two-entries.xlsx') });
      check('E5', 'unchanged', '§DOOR-HANDOVER applied=0 skipped=1 refused=3 and the books are exactly as after the first ledger (same counts and values); 1 applied hash', isLine(hlB, 0, 1, 3) && (await sig(qb)) === sigA && (await qb('SELECT count(*) AS n FROM door_ledger_applied', []))[0].n === 1, { line: hlB, sig: await sig(qb), sigA: sigA });
      await c4.close();
    });
    verdict('E5');

    // ═════════ E7 hooks, E8 cost, E9 nothing leaves ═════════
    var costLine = '';
    await guard('E7', 'hooks', 'the hand-over adds no save hook', async function () {
      var c5 = await B.browser.createBrowserContext(), px = await newPage(c5, 'erp/sheet_addin/file_it.html'); await fiReady(px); await offerVia(px, 'hooks.xlsx', NA.lines); await px.close();
      var ph = await erpOpen(c5, 'erp/idempiere.html'), n = await ph.evaluate(function () { return window.AdModelVal.registeredCount(); });
      costLine = logOf(ph, /^§DOOR-HANDOVER-COST/)[0] || ''; var snapLine = logOf(ph, /^§PROJ-SNAPSHOT/)[0] || '';
      say('  page: ' + handoverLine(ph)); say('  page: ' + costLine); say('  page: ' + snapLine);
      var m = /saveHooks=(\d+)->(\d+)/.exec(costLine) || [];
      check('E7', 'page', 'a page that took a hand-over has the same number of registered validators as a page that took none (' + base.hooks + ', > 0), and the count did not move across the hand-over (' + m[1] + ' -> ' + m[2] + ')', isLine(handoverLine(ph), 1, 0, 0) && base.ok && n === base.hooks && n > 0 && m[1] === m[2] && Number(m[2]) === n, { withHandover: n, without: base.hooks, cost: costLine });
      ph.__door = await doorScripts(ph);
      check('E8', 'cost', '§DOOR-HANDOVER-COST is measured: total ms, scripts / apply / persist ms, entries=1, ops=18; the bundle the page persisted is measured (§PROJ-SNAPSHOT bytes)', /ms=\d+ scriptsMs=\d+ applyMs=\d+ persistMs=\d+ entries=1 ops=18 /.test(costLine) && /bytes=\d{7,}/.test(snapLine), { cost: costLine, snap: snapLine });
      check('E8', 'lazy', 'a page with NO hand-over loaded none of the door\'s scripts among its ' + base.resources + ' script elements and has neither global (' + base.dh + '); a page WITH one requested exactly door_handover.js, ws_kernel_web.js, ws_kernel.js, once each', base.ok && base.door.length === 0 && base.resources > 100 && base.dh === 'undefined/undefined' && base.line.length === 0 && base.applied === 0 &&
        J(ph.__door) === J(['door_handover.js', 'ws_kernel_web.js', 'ws_kernel.js']), { none: base.door, resources: base.resources, some: ph.__door });
      await c5.close();
    });
    await guard('E7', 'node', 'replayInto is the one replay; dispose takes the hooks back', async function () {
      var KR = await K.load(), r1 = KR.replay(NA.lines.join('\n')), KB = await K.load(), j0 = KB.journal.length, r2 = K.replayInto(KB.db, NA.lines.join('\n'));
      check('E7', 'one-replay', 'node: K.replayInto on a database (no kernel journal touched) gives the same books as build().replay of the same ledger: both the oracle fingerprint, replayed=1', r1.replayed === 1 && r2.replayed === 1 && KB.journal.length === j0 && (await fingerprint(KR.q, DOCNO)) === FP_DIRECT && (await fingerprint(KB.q, DOCNO)) === FP_DIRECT, { r1: r1, r2: r2 });
      var n0 = MV.registeredCount(), KX = await K.load(), n1 = MV.registeredCount(), took = KX.dispose(), n2 = MV.registeredCount();
      check('E7', 'dispose', 'node: build() registers its validators (' + n0 + ' -> ' + n1 + ') and dispose() removes exactly those (' + took + '), back to ' + n2, n1 > n0 && took === n1 - n0 && n2 === n0, { n0: n0, n1: n1, took: took, n2: n2 });
      var second = null; try { K.replayInto(KB.db, NA.lines.join('\n'), { guard: true, atomic: true }); second = 'applied'; } catch (e) { second = e.message; }
      check('E7', 'guard-node', 'node: the same ledger a second time with the guard is refused (its record ids are in the books) and the invoice is still one', /is already in these books/.test(String(second)) && KB.q('SELECT count(*) AS n FROM c_invoice WHERE documentno=?', [DOCNO])[0].n === 1, second);
    });
    verdict('E7'); verdict('E8');
    await guard('E9', 'nowhere', 'nothing leaves the device', async function () {
      var ext = B.external.filter(function (r, i, a) { return a.indexOf(r) === i; });
      say('§DOORERP-NET serverRequests=' + NET.requests + ' notGET=' + NET.notGet.length + ' pageRequestsToOtherHosts=' + ext.length + (ext.length ? ' ' + J(ext.slice(0, 6)) : ''));
      check('E9', 'get-only', 'over the whole run (file_it pages and ERP pages, their service worker included) the server saw only GETs (' + NET.requests + ' requests)', NET.notGet.length === 0 && NET.requests > 100, NET.notGet.slice(0, 5));
      check('E9', 'no-other-host', 'no page request went to another host with a body; requests to another host: ' + ext.length + ' (blocked by the witness, listed above)', ext.every(function (r) { return /^GET /.test(r) && !/BODY=/.test(r); }), ext.slice(0, 8));
    });
    verdict('E9');
    if (B.pageErrors.length) say('§DOORERP-PAGEERRORS n=' + B.pageErrors.length + ' ' + J(B.pageErrors.filter(function (e, i, a) { return a.indexOf(e) === i; }).slice(0, 5)));
    await B.browser.close();
  } else ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9'].forEach(verdict);
  srv.srv.close();
  if (ACTIVE) say('§DOORERP-MUTANT-SERVED name=' + ACTIVE.name + ' file=' + ACTIVE.file + ' matches=' + NET.mutantApplied);

  // ═══ E10: the older witnesses of this lane on the restructured kernel ═══
  if (!MUTANT && process.env.DOORERP_SKIP_OLD !== '1') {
    await guard('E10', 'old', 'the lane\'s older witnesses print their verdict lines unchanged', async function () {
      [['witness_sheet_door.js', /§SDOOR-VERDICT PASS judged=33 failed=0/], ['witness_sheet_addin.js', /§SADDIN-VERDICT PASS judged=63 failed=0/], ['witness_sheet_history.js', /§SHIST-VERDICT PASS judged=20 failed=0/], ['witness_file_it.js', /§FILEIT-VERDICT PASS judged=53 failed=0/]].forEach(function (w) {
        var env = Object.assign({}, process.env); delete env.DBUS_SESSION_BUS_ADDRESS;
        var out = cp.spawnSync(process.execPath, [path.join(__dirname, w[0])], { encoding: 'utf8', maxBuffer: 64 << 20, env: env }).stdout || '', line = (out.match(new RegExp(String(w[1]).slice(1, -1).split('-VERDICT')[0] + '-VERDICT[^\\n]*')) || ['(no verdict line)'])[0];
        say('  §DOORERP-OLD ' + w[0] + ' -> ' + line.slice(0, 170));
        check('E10', w[0], w[0] + ' prints ' + String(w[1]).slice(1, -1), w[1].test(line), line);
      });
    });
    verdict('E10');
  }

  // ═══ MUTANTS ═══
  if (process.env.DOORERP_MUTANTS === '1' && !MUTANT) {
    var killed = 0;
    MUT.forEach(function (m) {
      var out = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { DOORERP_MUTANT: m.name, DOORERP_MUTANTS: '' }), encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '';
      var line = (out.match(new RegExp('§DOORERP-' + m.kills + ' verdict=\\w+[^\\n]*')) || [''])[0], applied = (out.match(/§DOORERP-MUTANT-SERVED[^\n]*matches=(\w+)/) || [])[1];
      var state = applied !== '1' ? 'NOT-APPLIED' : !/verdict=FAIL/.test(line) ? 'SURVIVED' : !/threw=0/.test(line) ? 'CRASHED' : 'KILLED';
      if (state === 'KILLED') killed++;
      var first = (out.match(new RegExp('§DOORERP-CHECK case=' + m.kills + ' key=\\S+ FAIL')) || [''])[0];
      say('§DOORERP-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + state + ' matches=' + applied + ' child="' + line + '" first="' + first + '"');
    });
    say('§DOORERP-MUTANTS killed=' + killed + '/' + MUT.length);
    if (killed !== MUT.length) ALL.failed++;
  }
  var names = Object.keys(CASES), vs = names.map(function (c) { return CASES[c].failed ? 'FAIL' : 'PASS'; });
  var overall = !ALL.judged || !B.browser ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§DOORERP-VERDICT ' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(names) + ' ' + J(vs) + (B.browser ? ' (headless Chromium on the real file_it.html and idempiere.html; real Excel NOT run)' : ' (no browser: nothing of the pages was judged)'));
  process.exit(overall === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§DOORERP-VERDICT FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
