#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DOOR-DROP (bim-compiler prompts/SHEET_FRONT_DOOR.md §29.5, slice 1+2: a marked workbook dropped on the ERP becomes a draft with the file attached). READ THE LOG after every run:
//   every verdict is a §DOORDROP line; the exit code is not the evidence. INCONCLUSIVE when nothing was judged (no browser = nothing of the page is judged). A mutant that makes its case THROW is CRASHED, not a kill.
// WHAT IS JUDGED: headless Chromium on the REAL erp/idempiere.html served from this tree; a synthetic DragEvent carrying a real File (the drop event reaches the page the way a user's drop does; a real OS drag is NOT
//   reproduced here). Every claim reads what the user would see (the window's grid rows + record ids, the form, the line tab, the Attachment dialog's own list, the Home screen's count, the words on screen) AND the books.
// LEGACY FACTS the claims lean on (cited, never softened): Import Invoice default DocAction PR -> In Progress, nothing posted (ImportInvoice.java:53, MInvoice.prepareIt / MInvoice.java:1811-1814; AD_Process_Para 207 default);
//   organisation * refused by Import Invoice ("Invalid Org": a document needs a real AD_Org_ID); a second invoice of the same DocumentNo / partner / type refused by legacy's unique index
//   c_invoice_documentno_target (psql: pg_indexes c_invoice); AD_Attachment (AD_Table_ID 254, Record_ID, Title 'zip' = AttachmentDBSystem), toolbar Attachment (AD_ToolBarButton 200039);
//   Home "Unprocessed Documents" = PA_DocumentStatus 200005 over RV_Unprocessed with CreatedBy=@#AD_User_ID@ (MDocumentStatus.java); a window's own Complete = the DocAction bar.
// SPEC (claims, each names the issue it exposes and can fail):
//   D1 DRAFT     one drop -> ONE new invoice In Progress, Posted N, Processed N, 0 Fact_Acct rows, lines + totals == the node oracle's fingerprint; the dragover and drop were taken (default cancelled)  -> nothing / two / a completed document
//   D2 WINDOW    the standard Invoice window is in front on that record: tabs = the dictionary's, form = the draft, grid row id = the committed id, the line tab shows the 2 lines WITHOUT Save;
//                (after a reload) the window's own Complete completes + posts the entries the §24 oracle makes                                         -> in the books but not in the window / a door-only button
//   D3 ATTACHED  the Attachment dialog's own list names the dropped file, its size is shown, the bytes read back == the dropped bytes, the row is C_Invoice + this record, Title zip     -> the file is not kept with the record
//   D4 REFUSALS  each of: not logged in, organisation *, no marks (workbook without _door_tags, a text file, a PDF), the engine's own refusals (subtotal off, unknown partner, a CO template), a duplicate DocumentNo
//                -> its words on screen, 0 ops committed, 0 attachment, the books unchanged; several files in one drop are each judged on their own  -> a refusal that commits / leaves a trace / says nothing
//   D5 LAZY      nothing of the door is requested before a drop; the first drop's cost (requests, bytes, ms, heap) is a § line                         -> every user pays for a feature they did not use
//   D6 ZONES     the existing drop zones that the page can reach still take their own drops with the overlay listening (the overlay stays out; the zone answers)   -> the new listener breaks an old drop zone
//   D7 RELOAD    after a reload the draft and its attachment are still there                                                                          -> kept in memory only
//   D8 ACTIVITY  Home "Unprocessed Documents" rises by one after the drop and falls after Complete, read from the Home screen                         -> the user cannot see the new document waiting
// MUTANTS (DOORDROP_MUTANTS=1; each rewrites the file the page is served, the text must match exactly once, else NOT-APPLIED; a child run must print FAIL for its case without a throw):
//   M1 the drop does nothing (D1) · M2 a second draft per drop (D1) · M3 the draft is completed by the drop (D1) · M4 the attachment skipped (D3) · M5 a refusal that commits (D4)
// "FAILS BEFORE": DOORDROP_NO_OVERLAY=1 serves boot.js without the overlay in its list: D1 must FAIL.
// Command: env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_door_drop.js      (DOORDROP_MUTANTS=1 adds the mutant sweep; DOORDROP_SKIP_OLD=1 skips the regression list)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http'), crypto = require('crypto');
var ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..');
var MUTANT = process.env.DOORDROP_MUTANT || '', NO_OVERLAY = process.env.DOORDROP_NO_OVERLAY === '1', ONLY = (process.env.DOORDROP_ONLY || '').split(',').filter(Boolean);
if (!process.env.SQLJS) process.env.SQLJS = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
var _log = console.log; console.log = function () { /* the kernel's own lines: the pages' are captured per page */ };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function on(cs) { return !ONLY.length || ONLY.indexOf(cs) >= 0; }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0, threw: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §DOORDROP-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1100)));
}
async function guard(cs, key, rule, fn) { try { await fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); CASES[cs].threw++; } }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0, threw: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§DOORDROP-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + ' threw=' + c.threw + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function cents(x) { return Math.round(Number(x) * 100); }
function sha(b) { return crypto.createHash('sha256').update(b).digest('hex'); }

var K = require(path.join(ERP, 'ws_kernel.js')), AP = require(path.join(ERP, 'ad_process.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js')), SAMPLE = require(path.join(ERP, 'sheet_addin/sample_invoice.js'));
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'doordrop-')), DATE = '2026-11-20', DOCNO = 'DROP-0001';
var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103 };
function wbBytes(o) { var wb = SAMPLE.build(XLSX, o || {}); return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); }
function noTags(o) { var wb = SAMPLE.build(XLSX, o || {}); var i = wb.SheetNames.indexOf('_door_tags'); wb.SheetNames.splice(i, 1); delete wb.Sheets._door_tags; wb.Workbook.Sheets.splice(i, 1); return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); }

// ── mutants: a rewritten copy of the served file(s) ──
var MUT = [
  { name: 'M1-drop-does-nothing', kills: 'D1', file: 'erp/overlay/door_drop.js', edits: [['    take(e.dataTransfer.files);', '    void e;']] },
  { name: 'M2-second-draft-per-drop', kills: 'D1', file: 'erp/overlay/door_drop.js',
    edits: [["var res = await shim.fileIt(), r = out.r || res.result || {};", "var res = await shim.fileIt(); await (async function () { delete wb.Sheets.Invoice.F2; try { await window.SheetAddin.create(host, { SheetDoor: window.SheetDoor, runner: runner({}) }).fileIt(); } catch (e) { /* mutant */ } })(); var r = out.r || res.result || {};"]] },
  { name: 'M3-draft-completed-by-the-drop', kills: 'D1', file: 'erp/sheet_door.js', edits: [["{ params: { AD_Client_ID: C, AD_Org_ID: O } }", "{ params: { AD_Client_ID: C, AD_Org_ID: O, DocAction: 'CO' } }"]] },
  { name: 'M4-attachment-skipped', kills: 'D3', file: 'erp/overlay/door_drop.js', edits: [["att = await attach(rec, at, file, bytes);", "att = { ok: true }; void attach;"]] },
  { name: 'M5-refusal-commits', kills: 'D4', file: 'erp/overlay/door_drop.js',
    edits: [["box = { r: r, ops: r.ok ? trx.groupOps() : [], log: trx.log };", "box = { r: r, ops: trx.groupOps(), log: trx.log };"], ["      if (r.ok) {\n        var cr = await commit(box.ops); out.cr = cr;", "      if (true) {\n        var cr = await commit(box.ops); out.cr = cr;"]] },
  { name: 'M0-overlay-not-in-the-list', kills: 'D1', file: 'erp/overlay/boot.js', edits: [[/, 'door_drop\.js\?v=[0-9a-f]{8}'\];/, '];']], failsBefore: true }
];
var ACTIVE = MUT.filter(function (m) { return m.name === MUTANT; })[0] || (NO_OVERLAY ? MUT[5] : null);
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.sql': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.xlsx': 'application/octet-stream' };
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
        var txt = body.toString('utf8'), ok = true;
        ACTIVE.edits.forEach(function (e) { var n = e[0] instanceof RegExp ? (txt.match(new RegExp(e[0].source, 'g')) || []).length : txt.split(e[0]).length - 1; if (n !== 1) ok = false; });
        NET.mutantApplied = ok ? 1 : 0;
        if (ok) { ACTIVE.edits.forEach(function (e) { txt = txt.replace(e[0], function () { return e[1]; }); }); body = Buffer.from(txt); }
      }
      NET.requests++;
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-cache' }); rsp.end(body);
    });
    srv.listen(0, '127.0.0.1', function () { res({ srv: srv, base: 'http://127.0.0.1:' + srv.address().port + '/' }); });
  });
}

// ── node side: the oracles (rows straight into I_Invoice + AD_Process 207, no door) ──
async function fingerprint(q, docno) {   // C_Invoice + lines + Fact_Acct, ids stripped; q sync (node) or async (a page)
  var inv = await q('SELECT * FROM c_invoice WHERE documentno=?', [docno]), out = [];
  for (var n = 0; n < inv.length; n++) {
    var i = inv[n];
    var ls = await q('SELECT line, m_product_id, c_charge_id, qtyinvoiced, priceactual, linenetamt, c_tax_id, description FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line', [i.c_invoice_id]);
    var fa = await q('SELECT account_id, amtacctdr, amtacctcr FROM fact_acct WHERE ad_table_id=318 AND record_id=? ORDER BY account_id, amtacctdr, amtacctcr', [i.c_invoice_id]);
    out.push({ h: [i.c_bpartner_id, i.c_doctype_id, i.issotrx, i.documentno, String(i.dateinvoiced).slice(0, 10), i.docstatus, i.totallines, i.grandtotal, i.c_currency_id, i.posted], l: ls, f: fa });
  }
  return J(out);
}
function oracleRun(k, docno, docAction) {
  var rows = SAMPLE.LINES.map(function (l) { return { i_isimported: 'N', qtyordered: String(l.qty), issotrx: 'Y', doctypename: 'AR Invoice', iso_code: 'USD', bpartnervalue: 'C&W', dateinvoiced: DATE + ' 00:00:00', dateacct: DATE + ' 00:00:00', documentno: docno, productvalue: l.product, description: l.description, priceactual: String(l.price) }; });
  return k.inTrx(S, { ws: 'oracle' }, function (trx, ML) {
    for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, 'i_invoice', null, ML.newPO(trx, 'i_invoice', rows[i])); if (!sv.ok) return { ok: false, error: sv.error }; }
    var prm = { AD_Client_ID: 11, AD_Org_ID: 11 }; if (docAction) prm.DocAction = docAction;
    var p = AP.runInTrx(trx, 207, { params: prm }); return { ok: p.ok, error: p.summary };
  });
}

// ── browser side ──
var PUP = null; try { PUP = require(process.env.DOORDROP_PUPPETEER || path.join(os.homedir(), 'bim-compiler/node_modules/puppeteer')); } catch (e) { PUP = null; }
var B = { browser: null, base: null, external: [], pageErrors: [] };
async function newPage(ctx, rel) {
  var page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 810 });
  page.__reqs = []; page.__log = [];
  page.on('console', function (m) { var t = m.text(); if (/^§/.test(t)) page.__log.push(t); });
  page.on('pageerror', function (e) { B.pageErrors.push(String(e && e.message).slice(0, 200)); });
  await page.setRequestInterception(true);
  page.on('request', function (rq) { var u = rq.url(); page.__reqs.push(rq.method() + ' ' + u); if (u.indexOf(B.base) !== 0 && !/^(data|blob):/.test(u)) { B.external.push(rq.method() + ' ' + u.slice(0, 120)); return rq.abort(); } rq.continue(); });
  if (rel) await page.goto(B.base + rel, { waitUntil: 'load', timeout: 120000 });
  return page;
}
function logOf(page, re, from) { return page.__log.slice(from || 0).filter(function (l) { return re.test(l); }); }
async function waitLog(page, re, from, ms) { var t0 = Date.now(); while (Date.now() - t0 < (ms || 120000)) { var l = logOf(page, re, from); if (l.length) return l[l.length - 1]; await sleep(100); } throw new Error('no page line ' + re + ' within ' + (ms || 120000) + ' ms; last lines: ' + page.__log.slice(-6).join(' | ').slice(0, 600)); }
function erpQ(page) { return function (sql, params) { return page.evaluate(function (s, p) { var st = window.__idmpDb.prepare(s), out = []; try { if (p && p.length) st.bind(p); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }, sql, params || []); }; }
function erpQT(page) { return function (sql, params) { return page.evaluate(function (s, p) { return window.__crud.withTipQuery(function (q) { return q(s, p || []); }); }, sql, params || []); }; }   // base + the signed tip: the committed state the user sees
async function erpOpen(ctx, rel) { var page = await newPage(ctx, rel); await waitLog(page, /^§IDEMPIERE boot db=/, 0, 180000); await waitLog(page, /^§DOOR-DROP overlay ready/, 0, 60000).catch(function () { page.__noOverlay = true; }); return page; }
async function erpLogin(page, org) {   // the page's own login card: GardenWorld / GardenAdmin; org = the AD_Org_ID to pick on step 2 (omit: the card's default, which is *)
  var pick = function (list, nm) { return page.evaluate(function (l, n) { var e = Array.prototype.filter.call(document.querySelectorAll(l + ' .idmp-login-user'), function (x) { var m = x.querySelector('.nm'); return m && m.textContent.trim() === n; })[0]; if (e) e.click(); return !!e; }, list, nm); };
  await page.waitForFunction(function () { return document.getElementById('idmp-login').style.display === 'flex'; }, { timeout: 60000 });
  if (await pick('#idmp-login-clients', 'GardenWorld')) await sleep(300);
  await page.waitForFunction(function () { return document.querySelectorAll('#idmp-login-users .idmp-login-user').length > 0; }, { timeout: 30000 });
  if (!(await pick('#idmp-login-users', 'GardenAdmin'))) throw new Error('GardenAdmin is not on the login card');
  await page.waitForFunction(function () { var e = document.getElementById('idmp-login-step2'); return e && e.style.display !== 'none'; }, { timeout: 30000 });
  if (org) await page.evaluate(function (o) { var s = document.getElementById('idmp-login-org'); s.value = String(o); s.dispatchEvent(new Event('change')); }, org);
  await page.click('#idmp-login-ok');
  await page.waitForFunction(function () { var t = document.getElementById('idmp-tree'); return t && t.children.length > 0; }, { timeout: 60000 });
  await page.evaluate(function () { return new Promise(function (r) { window.__crud.withSidecar(function () { r(1); }); }); });
  await sleep(1500);
}
// a synthetic drop of REAL Files on `sel`: dragenter, dragover, drop; returns whether the page took each (a taken event is default-cancelled: the browser would not open the file in place of the ERP)
async function dropFiles(page, files, sel) {
  return page.evaluate(function (fs, s) {
    var dt = new DataTransfer(); fs.forEach(function (f) { var u = Uint8Array.from(atob(f.b64), function (c) { return c.charCodeAt(0); }); dt.items.add(new File([u], f.name, { type: f.type || '' })); });
    var el = document.querySelector(s) || document.body, r = {};
    ['dragenter', 'dragover', 'drop'].forEach(function (n) { r[n] = !el.dispatchEvent(new DragEvent(n, { bubbles: true, cancelable: true, dataTransfer: dt })); });
    return r;
  }, files.map(function (f) { return { name: f.name, type: f.type, b64: f.bytes.toString('base64') }; }), sel || 'body');
}
async function waitDone(page, names, from) { for (var i = 0; i < names.length; i++) await waitLog(page, new RegExp('^§DOOR-DROP file="' + names[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '" bytes=\\d+ state='), from, 90000); await sleep(400); }
function noteRows(page) { return page.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#door-drop-note [data-door-drop-file]'), function (r) { return { file: r.getAttribute('data-door-drop-file'), state: r.getAttribute('data-state'), text: r.textContent }; }); }); }
async function sig(page) {   // everything a refused drop could leave a trace in: rows (tip), the op log, the attachments
  var q = erpQT(page), o = {}, ts = ['c_invoice', 'c_invoiceline', 'c_invoicetax', 'fact_acct', 'i_invoice', 'ad_attachment', 'c_order'];
  for (var i = 0; i < ts.length; i++) o[ts[i]] = Number((await q('SELECT count(*) AS n FROM ' + ts[i], []))[0].n);
  o.ops = await page.evaluate(function () { var d = window.__crud.kernelDb(); var r = d ? d.exec('SELECT count(*) FROM kernel_ops') : []; return r.length ? Number(r[0].values[0][0]) : -1; });
  return J(o);
}
async function snap(page) {
  return page.evaluate(function () {
    var cellsOf = function (tr) { var o = {}; Array.prototype.forEach.call(tr.querySelectorAll('td[data-ad-col]'), function (td) { o[td.getAttribute('data-ad-col')] = td.textContent.trim(); }); return o; };
    var form = {}; Array.prototype.forEach.call(document.querySelectorAll('#idmp-inline-mount input[data-col], #idmp-inline-mount select[data-col]'), function (e) { form[e.getAttribute('data-col')] = e.value; });
    return { tabs: Array.prototype.map.call(document.querySelectorAll('#idmp-tabstrip .idmp-adtab'), function (e) { return e.textContent.trim(); }), wins: Array.prototype.map.call(document.querySelectorAll('#idmp-wintabs .idmp-wintab .lbl'), function (e) { return e.textContent.trim(); }),
      active: (document.querySelector('#idmp-tabstrip .idmp-adtab.active') || { textContent: '' }).textContent.trim(),
      rows: Array.prototype.map.call(document.querySelectorAll('tr[data-ad-record]'), function (tr) { return { table: tr.getAttribute('data-ad-table'), id: tr.getAttribute('data-ad-record'), cells: cellsOf(tr) }; }),
      form: form, status: document.getElementById('idmp-status-main').textContent };
  });
}
async function grid(page) { var s = await snap(page); if (!s.rows.length) { await page.click('#idmp-toolbar [data-tb="toggle"]'); await sleep(900); s = await snap(page); } return s; }
async function tab(page, name) {
  var ok = await page.evaluate(function (n) { var e = Array.prototype.filter.call(document.querySelectorAll('#idmp-tabstrip .idmp-adtab'), function (x) { return x.textContent.trim() === n; })[0]; if (e) e.click(); return !!e; }, name);
  if (!ok) throw new Error('no tab ' + name);
  await page.waitForFunction(function (n) { return (document.querySelector('#idmp-tabstrip .idmp-adtab.active') || { textContent: '' }).textContent.trim() === n; }, { timeout: 20000 }, name); await sleep(1100);
}
async function homeCount(page, label) {   // the Home screen's tile, as the user reads it
  await page.waitForFunction(function () { return !!document.querySelector('#idmp-home .ds'); }, { timeout: 60000 }); await sleep(1800);
  return page.evaluate(function (l) { var t = Array.prototype.filter.call(document.querySelectorAll('#idmp-home .ds'), function (x) { var d = x.querySelector('.dl'); return d && d.textContent.trim() === l; })[0]; return t ? Number(t.getAttribute('data-ds-count')) : null; }, label);
}
async function closeWindow(page) { await page.evaluate(function () { var x = document.querySelector('#idmp-wintabs .idmp-wintab.active .x'); if (x) x.click(); }); await page.waitForFunction(function () { return !!document.getElementById('idmp-placeholder'); }, { timeout: 20000 }); }

(async function main() {
  say('§DOORDROP-LOAD tree=' + ROOT + ' mutant=' + (MUTANT || (NO_OVERLAY ? 'M0 (fails-before run)' : 'none')) + ' only=' + (ONLY.join(',') || 'all') + ' puppeteer=' + (PUP ? 'yes' : 'NO (the page judges nothing)'));
  var W1 = wbBytes({ docno: DOCNO }), FACTS_CO = [], FP_DIRECT = '[]', oracleOk = false;
  if (on('D1') || on('D2')) {
    var KO = await K.load(), oRun = oracleRun(KO, DOCNO); FP_DIRECT = await fingerprint(KO.q, DOCNO);
    var oInv = KO.one('SELECT docstatus, posted FROM c_invoice WHERE documentno=?', [DOCNO]) || {};
    oracleOk = oRun.ok && FP_DIRECT !== '[]' && oInv.docstatus === 'IP' && oInv.posted === 'N';
    var KC = await K.load(), cRun = oracleRun(KC, DOCNO, 'CO');   // the entries a Complete makes (the §24 oracle: Import Invoice with DocAction CO)
    FACTS_CO = KC.q('SELECT account_id AS a, amtacctdr AS d, amtacctcr AS c FROM fact_acct WHERE ad_table_id=318 AND record_id=(SELECT c_invoice_id FROM c_invoice WHERE documentno=?) ORDER BY account_id, amtacctdr, amtacctcr', [DOCNO]).map(function (r) { return [Number(r.a), cents(r.d), cents(r.c)]; });
    say('§DOORDROP-ORACLE direct(default DocAction) ok=' + oRun.ok + ' status=' + J(oInv) + ' fingerprintBytes=' + FP_DIRECT.length + ' completeOracle ok=' + cRun.ok + ' factRows=' + FACTS_CO.length);
  }
  var srv = await serve(); B.base = srv.base;
  if (PUP) B.browser = await PUP.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'], env: (function () { var e = Object.assign({}, process.env); delete e.DBUS_SESSION_BUS_ADDRESS; return e; })() });

  if (B.browser) {
    var c1 = await B.browser.createBrowserContext(), p1 = null, ID = null, WIN = null, u0 = null, EQ = null, EQT = null, dictTabs = [], sig0 = null, fromLog = 0;
    // ═════════ S1: login (HQ), the Home count, then ONE drop ═════════
    await guard('D1', 'boot', 'the ERP page boots with the overlay listening and logs in', async function () {
      p1 = await erpOpen(c1, 'erp/idempiere.html'); await erpLogin(p1, 11); EQ = erpQ(p1); EQT = erpQT(p1);
      WIN = (await EQ("SELECT AD_Window_ID AS w FROM AD_Table WHERE lower(TableName)='c_invoice'", []))[0].w;   // the dictionary's window of the table: the sales side (the sample is an AR invoice)
      dictTabs = (await EQ("SELECT Name AS n FROM AD_Tab WHERE AD_Window_ID=? AND IsActive='Y' ORDER BY SeqNo", [WIN])).map(function (r) { return r.n; });
      u0 = on('D8') ? await homeCount(p1, 'Unprocessed Documents') : null; sig0 = await sig(p1);
    });
    if (p1) {
      var scriptsBefore = await p1.evaluate(function () { return { xlsx: typeof window.XLSX, sd: typeof window.SheetDoor, shim: typeof window.SheetAddin, dd: typeof window.DoorDrop }; });
      var reqsBefore = p1.__reqs.filter(function (r) { return /sheet_door|host_shim|xlsx_host|excel_host|xlsx\.mini/.test(r); });
      say('§DOORDROP-BEFORE overlay=' + scriptsBefore.dd + ' xlsx=' + scriptsBefore.xlsx + ' SheetDoor=' + scriptsBefore.sd + ' requestsForTheDoor=' + reqsBefore.length + ' homeUnprocessed=' + u0 + ' window=' + WIN + ' tabs=' + J(dictTabs));
      var nInv0 = Number((await EQT('SELECT count(*) AS n FROM c_invoice', []))[0].n);
      fromLog = p1.__log.length;
      var tk = await dropFiles(p1, [{ name: 'door_invoice.xlsx', bytes: W1 }], '#idmp-content');
      await waitDone(p1, ['door_invoice.xlsx'], fromLog).catch(function (e) { say('§DOORDROP-NOTE ' + String(e.message).slice(0, 300)); });
      await sleep(2500);
      var inv = (await EQT('SELECT * FROM c_invoice WHERE documentno=?', [DOCNO])), I = inv[0] || {}; ID = I.c_invoice_id;
      var nInv1 = Number((await EQT('SELECT count(*) AS n FROM c_invoice', []))[0].n), fa = Number((await EQT('SELECT count(*) AS n FROM fact_acct WHERE ad_table_id=318 AND record_id=?', [ID == null ? -999999 : ID]))[0].n);
      var groups = logOf(p1, /^§CRUD-GROUP-PERSIST ops=\d+/, fromLog).map(function (l) { return Number((l.match(/ops=(\d+)/) || [])[1]); }), bigGroups = groups.filter(function (n) { return n > 1; });
      var fp = ID != null ? await fingerprint(EQT, DOCNO) : '[]', say1 = logOf(p1, /^§DOOR-DROP-DRAFT/, fromLog)[0] || '(no §DOOR-DROP-DRAFT line)';
      say('  page: ' + say1); say('  page: ' + (logOf(p1, /^§DOOR-DROP-SAY/, fromLog)[0] || '(no §DOOR-DROP-SAY line)'));
      if (on('D1')) {
        await guard('D1', 'one', 'after ONE drop of door_invoice.xlsx the books (base + signed tip) hold exactly ONE new invoice ' + DOCNO + ' (count ' + nInv0 + ' -> ' + (nInv0 + 1) + '), ONE signed group of record changes (the draft; others are the attachment), the page took dragover and drop (default cancelled)',
          function () { check('D1', 'one', 'after ONE drop the books hold exactly ONE new invoice ' + DOCNO + ' (count ' + nInv0 + ' -> ' + (nInv0 + 1) + '), one signed group for the draft, and the page took dragover and drop (default cancelled: the browser does not open the file instead)',
            inv.length === 1 && nInv1 === nInv0 + 1 && bigGroups.length === 1 && tk.dragover === true && tk.drop === true, { n: inv.length, before: nInv0, after: nInv1, groups: groups, taken: tk }); });
        check('D1', 'status', 'the draft is In Progress (DocStatus IP, DocAction CO), Posted N, Processed N, with 0 Fact_Acct rows - the unposted state legacy\'s Import Invoice default PR gives (MInvoice.java:1811-1814); the door completed nothing',
          I.docstatus === 'IP' && I.docaction === 'CO' && I.posted === 'N' && I.processed === 'N' && fa === 0, { docstatus: I.docstatus, docaction: I.docaction, posted: I.posted, processed: I.processed, facts: fa });
        check('D1', 'oracle', 'the draft\'s header, its 2 lines (product, qty, price, net, tax) and totals are, ids stripped, the node oracle\'s fingerprint (the same rows declared straight into I_Invoice and imported by AD_Process 207): ' + FP_DIRECT.length + ' bytes',
          oracleOk && fp === FP_DIRECT, { oracleOk: oracleOk, same: fp === FP_DIRECT, page: fp.slice(0, 300), oracle: FP_DIRECT.slice(0, 300) });
        check('D1', 'createdby', 'the draft belongs to the logged-in user (CreatedBy = the session\'s AD_User_ID, GardenAdmin), not to a door identity, and to the session\'s organisation HQ',
          Number(I.createdby) === Number(await p1.evaluate(function () { return window.APP.actor; })) && Number(I.ad_org_id) === 11, { createdby: I.createdby, org: I.ad_org_id });
      }
      if (on('D2')) await guard('D2', 'window', 'the window in front', async function () {
        var s0 = await snap(p1);
        check('D2', 'landed', 'the standard window ' + WIN + ' is in front, its tabs are the dictionary\'s tabs in order (' + J(dictTabs) + '), its form shows the draft (DocumentNo, grand total 153.5, DocStatus IP), "Record 1 of 1"',
          J(s0.tabs) === J(dictTabs) && dictTabs.length > 1 && s0.form.documentno === DOCNO && Number(s0.form.grandtotal) === 153.5 && s0.form.docstatus === 'IP' && /Record 1 of 1/.test(s0.status), { tabs: s0.tabs, wins: s0.wins, form: s0.form, status: s0.status });
        var g = await grid(p1), r0 = g.rows[0] || { cells: {} }, dbRow = (await EQT('SELECT documentno FROM c_invoice WHERE c_invoice_id=?', [Number(r0.id) || -999999]))[0];
        check('D2', 'grid', 'the grid shows exactly 1 row, its record id == the committed C_Invoice_ID (' + ID + '), the books hold the row at the id the grid shows, and the DocumentNo cell is the books\'',
          g.rows.length === 1 && r0.table === 'C_Invoice' && Number(r0.id) === Number(ID) && !!dbRow && dbRow.documentno === r0.cells.DocumentNo && r0.cells.DocumentNo === DOCNO, { rows: g.rows.map(function (r) { return [r.table, r.id, r.cells.DocumentNo]; }), id: ID });
        var saves0 = logOf(p1, /^§CRUD-(PERSIST|GROUP-PERSIST)/).length;
        await tab(p1, dictTabs[1]); var gl = await grid(p1);
        var lDb = await EQT('SELECT c_invoiceline_id, c_invoice_id, line, linenetamt FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line', [ID]), parentOf = {};
        for (var i = 0; i < gl.rows.length; i++) { var pr = (await EQT('SELECT c_invoice_id FROM c_invoiceline WHERE c_invoiceline_id=?', [Number(gl.rows[i].id)]))[0]; parentOf[gl.rows[i].id] = pr ? pr.c_invoice_id : null; }
        check('D2', 'lines', 'tab "' + dictTabs[1] + '" shows the 2 lines WITHOUT any Save: 2 grid rows, their record ids == the books\' C_InvoiceLine ids of the draft, every shown row\'s parent id == the draft, no save happened in the page',
          gl.rows.length === 2 && lDb.length === 2 && J(gl.rows.map(function (r) { return Number(r.id); }).sort()) === J(lDb.map(function (r) { return Number(r.c_invoiceline_id); }).sort()) && gl.rows.every(function (r) { return r.table === 'C_InvoiceLine' && Number(parentOf[r.id]) === Number(ID); }) && logOf(p1, /^§CRUD-(PERSIST|GROUP-PERSIST)/).length === saves0,
          { rows: gl.rows.map(function (r) { return [r.table, r.id]; }), parentOf: parentOf, db: lDb });
        await tab(p1, dictTabs[0]);
      });
      if (on('D3')) await guard('D3', 'dialog', 'the Attachment dialog', async function () {
        var btn = await p1.evaluate(function () { var b = document.querySelector('#idmp-toolbar [data-tb="attachment"]'); return b ? { disabled: !!b.disabled, active: b.classList.contains('active') } : null; });
        if (btn && !btn.disabled) await p1.click('#idmp-toolbar [data-tb="attachment"]');
        await p1.waitForSelector('#att-ov', { timeout: 20000 }).catch(function () { /* judged below */ }); await sleep(600);
        var dlg = await p1.evaluate(function () { var s = document.querySelector('#att-ov select[data-att="entries"]'); return s ? { opts: Array.prototype.map.call(s.options, function (o) { return o.textContent; }), size: (document.querySelector('#att-ov [data-att="size"]') || {}).textContent } : null; });
        var back = await p1.evaluate(async function (id) {
          var A = window.__idmpAttach, AT = await A.load(), host = A.host(), tid = window.__crud.withTipQuery(function (q) { return q("SELECT ad_table_id FROM ad_table WHERE lower(tablename)='c_invoice'", []); })[0].ad_table_id;
          var uu = window.__crud.withTipQuery(function (q) { return q('SELECT c_invoice_uu AS u FROM c_invoice WHERE c_invoice_id=?', [id]); })[0].u, row = AT.lookup(host, { tableId: tid, recordId: id, recordUU: uu }); if (!row) return null; var ld = await AT.load(row), e = ld.entries[0]; if (!e) return { row: { title: row.title, table: row.ad_table_id, record: row.record_id }, entries: 0 };
          var full = window.__crud.withTipQuery(function (q) { return q('SELECT ad_table_id, record_id FROM ad_attachment WHERE ad_attachment_id=?', [row.ad_attachment_id]); })[0] || {}; return { row: { title: row.title, table: full.ad_table_id, record: full.record_id }, entries: ld.entries.length, name: e.name, hash: await AT.sha256(e.data), size: e.data.length };
        }, ID);
        await p1.evaluate(function () { var c = document.querySelector('#att-ov [data-att="cancel"]'); if (c) c.click(); });
        say('  page: ' + (logOf(p1, /^§DOOR-DROP-ATTACH/, fromLog)[0] || '(no §DOOR-DROP-ATTACH line)')); say('  page: ' + J(logOf(p1, /^§ATT (open|close|tabs|toolbar)/, fromLog)));
        check('D3', 'list', 'the toolbar\'s Attachment button is enabled on the draft and the dialog\'s own list names exactly "door_invoice.xlsx", with its size shown', !!btn && !btn.disabled && !!dlg && J(dlg.opts) === J(['door_invoice.xlsx']) && /KB|MB/.test(String(dlg.size)), { btn: btn, dlg: dlg });
        check('D3', 'bytes', 'the bytes read back from the attachment == the dropped file (sha256 ' + sha(W1).slice(0, 12) + '..., ' + W1.length + ' bytes); the row is AD_Table_ID 318 (C_Invoice) + Record_ID ' + ID + ', Title zip (AttachmentDBSystem), one entry',
          !!back && back.entries === 1 && back.hash === sha(W1) && back.size === W1.length && Number(back.row.table) === 318 && Number(back.row.record) === Number(ID) && back.row.title === 'zip', { back: back });
      });
      if (on('D5')) {
        var cost = logOf(p1, /^§DOOR-DROP-COST/, fromLog)[0] || '', ld = (cost.match(/loaded=(\S*)/) || [])[1] || '', cb = Number((cost.match(/bytes=(\d+)/) || [])[1]), cr = Number((cost.match(/requests=(\d+)/) || [])[1]);
        say('§DOORDROP-COST ' + (cost || '(no §DOOR-DROP-COST line)').replace(/^§DOOR-DROP-COST /, ''));
        check('D5', 'lazy', 'BEFORE the drop the page had requested none of the door\'s files (SheetJS, the engine, the readers: ' + J(reqsBefore) + ') and held none of them (xlsx=' + scriptsBefore.xlsx + ', SheetDoor=' + scriptsBefore.sd + ', SheetAddin=' + scriptsBefore.shim + ')', reqsBefore.length === 0 && scriptsBefore.xlsx === 'undefined' && scriptsBefore.sd === 'undefined' && scriptsBefore.shim === 'undefined' && scriptsBefore.dd === 'object', { reqs: reqsBefore, scripts: scriptsBefore });
        check('D5', 'cost', 'the first drop\'s cost is measured: a § line with its requests (' + cr + '), bytes (' + cb + '), ms and heap, naming the files that came with it (' + ld + ')', /ms=\d+ heapMB=-?\d+/.test(cost) && cr >= 4 && cb > 100000 && /xlsx\.mini\.min/.test(ld) && /sheet_door/.test(ld), { cost: cost });
      }
      // ═════════ the duplicate, in the same page: the same file again ═════════
      if (on('D4')) await guard('D4', 'duplicate', 'the same DocumentNo again', async function () {
        var s0 = await sig(p1), n0 = p1.__log.length;
        await dropFiles(p1, [{ name: 'door_invoice_again.xlsx', bytes: W1 }]); await waitDone(p1, ['door_invoice_again.xlsx'], n0); var rows = await noteRows(p1), s1 = await sig(p1);
        var persisted = logOf(p1, /^§CRUD-GROUP-PERSIST/, n0).length;
        say('  page: ' + J(rows));
        check('D4', 'duplicate', 'a second drop of a file with the same DocumentNo, partner and type is refused with legacy\'s unique index said in words ("document number ' + DOCNO + ' already exists for this business partner and document type"); 0 groups committed, no attachment, the books unchanged (' + s0 + ')',
          rows.length === 1 && rows[0].state === 'refused' && /document number DROP-0001 already exists for this business partner and document type/.test(rows[0].text) && persisted === 0 && s0 === s1, { rows: rows, persisted: persisted, before: s0, after: s1 });
      });
      // ═════════ D8 fall/rise, D7 reload ═════════
      var u1 = null;
      if (on('D8')) await guard('D8', 'rise', 'the Home count after the drop', async function () {
        await closeWindow(p1); u1 = await homeCount(p1, 'Unprocessed Documents');
        check('D8', 'rise', 'Home "Unprocessed Documents" (PA_DocumentStatus 200005, CreatedBy = this user) read from the Home screen: ' + u0 + ' before the drop, ' + u1 + ' after it (+1)', u0 != null && u1 === u0 + 1, { before: u0, after: u1 });
      });
      var p2 = null, id2 = null;
      if (on('D7') || on('D2') || on('D8')) await guard('D7', 'reload', 'a reload', async function () {
        await sleep(2000); await p1.close();
        p2 = await erpOpen(c1, 'erp/idempiere.html'); await erpLogin(p2, 11); var EQT2 = erpQT(p2);
        var inv2 = (await EQT2('SELECT c_invoice_id, docstatus, posted FROM c_invoice WHERE documentno=?', [DOCNO])), n2 = Number((await EQT2('SELECT count(*) AS n FROM c_invoice WHERE documentno=?', [DOCNO]))[0].n); id2 = inv2[0] && inv2[0].c_invoice_id;
        var att = await p2.evaluate(async function (id) { var A = window.__idmpAttach, AT = await A.load(), host = A.host(), tid = window.__crud.withTipQuery(function (q) { return q("SELECT ad_table_id FROM ad_table WHERE lower(tablename)='c_invoice'", []); })[0].ad_table_id, uu = window.__crud.withTipQuery(function (q) { return q('SELECT c_invoice_uu AS u FROM c_invoice WHERE c_invoice_id=?', [id]); })[0].u, row = AT.lookup(host, { tableId: tid, recordId: id, recordUU: uu }); if (!row) return null; var ld = await AT.load(row); return { entries: ld.entries.map(function (e) { return e.name; }), hash: ld.entries[0] ? await AT.sha256(ld.entries[0].data) : null }; }, id2);
        if (on('D7')) check('D7', 'reload', 'after a reload (a new page, the same browser storage): exactly one invoice ' + DOCNO + ' (In Progress, not posted) and its attachment (door_invoice.xlsx, same bytes) are still there, read from the books', n2 === 1 && !!inv2[0] && inv2[0].docstatus === 'IP' && inv2[0].posted === 'N' && !!att && J(att.entries) === J(['door_invoice.xlsx']) && att.hash === sha(W1), { n: n2, inv: inv2, att: att });
        if (on('D8')) { var u2 = await homeCount(p2, 'Unprocessed Documents'); check('D8', 'reload', 'after the reload the Home still counts it (' + u2 + ' = ' + u1 + ')', u1 != null && u2 === u1, { u1: u1, u2: u2 }); }
      });
      if (p2 && on('D2')) await guard('D2', 'complete', 'the window\'s own Complete', async function () {
        var EQT2 = erpQT(p2), n0 = p2.__log.length;
        var shown = await p2.evaluate(function (w, id) { return window.IdmpHost.zoom(w, null, id); }, WIN, id2); await waitLog(p2, /^§ZOOM window=/, n0, 60000); await sleep(1500);
        var legal = await p2.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('[data-doc-action]'), function (b) { return b.getAttribute('data-doc-action'); }); }), nC = p2.__log.length;
        await p2.evaluate(function () { var b = document.querySelector('[data-doc-action="CO"]'); if (b) b.click(); });
        var committed = await waitLog(p2, /^§CRUD process committed key=c_invoice/, nC, 60000).catch(function () { return '(no signed commit line within 60 s)'; }); await sleep(1500);
        var wf = logOf(p2, /^§MODEL-DOCACTION table=c_invoice/, nC)[0] || '', post = logOf(p2, /^§MODEL-POST table=c_invoice/, nC)[0] || '', sC = await snap(p2);
        var tipInv = (await EQT2('SELECT docstatus, posted, processed FROM c_invoice WHERE c_invoice_id=?', [id2]))[0] || {};
        var facts = (await EQT2('SELECT account_id AS a, amtacctdr AS d, amtacctcr AS c FROM fact_acct WHERE ad_table_id=318 AND record_id=? ORDER BY account_id, amtacctdr, amtacctcr', [id2])).map(function (r) { return [Number(r.a), cents(r.d), cents(r.c)]; });
        say('  page: ' + wf.slice(0, 220)); say('  page: ' + post);
        check('D2', 'complete', 'the window (zoomed to the draft: ' + shown + ') offers its OWN Complete (data-doc-action CO among ' + J(legal) + '); pressing it: DocStatus CO, Posted Y, Processed Y and the Fact_Acct rows (account, debit, credit) are EXACTLY the ' + FACTS_CO.length + ' the §24 oracle makes (Import Invoice with DocAction CO)',
          shown === true && legal.indexOf('CO') >= 0 && /action=CO ok=true status=CO/.test(wf) && /verifyChain=ok/.test(committed) && sC.form.docstatus === 'CO' && tipInv.docstatus === 'CO' && tipInv.posted === 'Y' && tipInv.processed === 'Y' && FACTS_CO.length === 6 && J(facts) === J(FACTS_CO), { legal: legal, wf: wf.slice(0, 160), committed: committed.slice(0, 120), form: sC.form.docstatus, tip: tipInv, facts: facts, oracle: FACTS_CO });
        if (on('D8')) {
          await closeWindow(p2); var u3 = await homeCount(p2, 'Unprocessed Documents');
          check('D8', 'fall', 'after the window\'s Complete the Home count falls back: ' + u1 + ' -> ' + u3 + ' (the baseline was ' + u0 + ')', u0 != null && u3 === u0 && u3 === u1 - 1, { u0: u0, u1: u1, u3: u3 });
        }
      });
      if (p2) await p2.close().catch(function () { /* gone */ }); else if (p1 && !p1.isClosed()) await p1.close().catch(function () { /* gone */ });
    }
    ['D1', 'D2', 'D3', 'D5', 'D7', 'D8'].forEach(function (c) { if (on(c)) verdict(c); });

    // ═════════ S2: refusals (D4) - each in a page of its own, the books judged before and after ═════════
    if (on('D4')) {
      var c2 = await B.browser.createBrowserContext(), U = { log: 'Log in first, then drop the file.' };
      async function refuse(page, key, rule, files, rx, states) {
        var s0 = await sig(page).catch(function () { return '(no books yet)'; }), n0 = page.__log.length;
        await dropFiles(page, files); await waitDone(page, files.map(function (f) { return f.name; }), n0); var rows = await noteRows(page), s1 = await sig(page).catch(function () { return '(no books yet)'; });
        var persisted = logOf(page, /^§CRUD-GROUP-PERSIST/, n0).length; say('  page: ' + J(rows));
        check('D4', key, rule + '; 0 groups committed, no attachment, the books unchanged (' + s0 + ')', rows.length === files.length && rows.every(function (r, i) { return r.state === states[i] && rx[i].test(r.text); }) && persisted === 0 && s0 === s1, { rows: rows, persisted: persisted, before: s0, after: s1 });
        return rows;
      }
      await guard('D4', 'not-logged-in', 'not logged in', async function () {
        var p = await erpOpen(c2, 'erp/idempiere.html'); await p.waitForFunction(function () { return document.getElementById('idmp-login').style.display === 'flex'; }, { timeout: 60000 });
        var n0 = p.__log.length; await dropFiles(p, [{ name: 'early.xlsx', bytes: W1 }]); await waitDone(p, ['early.xlsx'], n0); var rows = await noteRows(p);
        check('D4', 'not-logged-in', 'a file dropped on the login screen is refused: "' + U.log + '"; nothing committed (no signed group, no draft)', rows.length === 1 && rows[0].state === 'refused' && /Log in first, then drop the file\./.test(rows[0].text) && logOf(p, /^§CRUD-GROUP-PERSIST/, n0).length === 0 && logOf(p, /^§DOOR-DROP-DRAFT/, n0).length === 0, { rows: rows });
        await p.close();
      });
      await guard('D4', 'org-star', 'organisation *', async function () {
        var p = await erpOpen(c2, 'erp/idempiere.html'); await erpLogin(p, null);
        var org = await p.evaluate(function () { return window.APP.orgId; });
        await refuse(p, 'org-star', 'logged in with organisation * (AD_Org_ID ' + org + ') a marked workbook is refused in words ("Choose an organisation at login: a document cannot be filed under *.") - legacy Import Invoice refuses AD_Org_ID 0 (Invalid Org)', [{ name: 'door_invoice.xlsx', bytes: wbBytes({ docno: 'DROP-0020' }) }], [/Choose an organisation at login: a document cannot be filed under \*\./], ['refused']);
        await p.close();
      });
      await guard('D4', 'hq', 'logged in at HQ', async function () {
        var p = await erpOpen(c2, 'erp/idempiere.html'); await erpLogin(p, 11);
        await refuse(p, 'no-marks', 'a workbook without _door_tags, a text file and a PDF are each refused: "This file is not marked for the ERP yet."', [{ name: 'plain.xlsx', bytes: noTags({ docno: 'DROP-0021' }) }, { name: 'notes.txt', bytes: Buffer.from('hello') }, { name: 'bill.pdf', bytes: Buffer.from('%PDF-1.4\n%x\n') }],
          [/not marked for the ERP yet/, /not marked for the ERP yet/, /not marked for the ERP yet/], ['refused', 'refused', 'refused']);
        await refuse(p, 'subtotal', 'a marked workbook whose subtotal prints 153.51 (the lines add up to 153.5) is refused with the engine\'s own words', [{ name: 'bad_subtotal.xlsx', bytes: wbBytes({ docno: 'DROP-0022', subtotal: 153.51 }) }], [/add up to 153\.5 but the subtotal prints 153\.51/], ['refused']);
        var r = await refuse(p, 'partner', 'an unknown business partner is refused with Import Invoice\'s own error, said without its markup', [{ name: 'nobody.xlsx', bytes: wbBytes({ docno: 'DROP-0023', partner: 'NoSuchPartnerXYZ' }) }], [/Not filed: .*BPartner/i], ['refused']);
        say('§DOORDROP-NOTE unknown partner words: ' + J(r.map(function (x) { return x.text; })));
        await refuse(p, 'co-template', 'a template that asks for document action CO is refused: "this page files a document for review; complete it in the ERP"', [{ name: 'co.xlsx', bytes: wbBytes({ docno: 'DROP-0024', tpl: Object.assign({}, SAMPLE.TPL, { docAction: 'CO' }) }) }], [/complete it in the ERP/], ['refused']);
        // several files in ONE drop: each judged on its own
        var s0 = await sig(p), n0 = p.__log.length, nI0 = Number((await erpQT(p)('SELECT count(*) AS n FROM c_invoice', []))[0].n);
        var files = [{ name: 'good.xlsx', bytes: wbBytes({ docno: 'DROP-0025' }) }, { name: 'plain2.xlsx', bytes: noTags({ docno: 'DROP-0026' }) }, { name: 'bad2.xlsx', bytes: wbBytes({ docno: 'DROP-0027', subtotal: 1 }) }];
        await dropFiles(p, files); await waitDone(p, files.map(function (f) { return f.name; }), n0); await sleep(2000);
        var rows = await noteRows(p), nI1 = Number((await erpQT(p)('SELECT count(*) AS n FROM c_invoice', []))[0].n), have = (await erpQT(p)("SELECT documentno FROM c_invoice WHERE documentno IN ('DROP-0025','DROP-0026','DROP-0027')", [])).map(function (x) { return x.documentno; });
        say('  page: ' + J(rows));
        check('D4', 'several', 'three files in one drop are each judged on their own: good.xlsx -> a draft ("Drafted: AR Invoice DROP-0025, In Progress. Open it and press Complete."), plain2.xlsx -> not marked, bad2.xlsx -> not filed; the books gained exactly the one invoice DROP-0025',
          rows.length === 3 && rows[0].state === 'drafted' && /^good\.xlsx: Drafted: AR Invoice DROP-0025, In Progress\. Open it and press Complete\.$/.test(rows[0].text) && rows[1].state === 'refused' && /not marked for the ERP yet/.test(rows[1].text) && rows[2].state === 'refused' && /subtotal prints 1/.test(rows[2].text) && nI1 === nI0 + 1 && J(have) === J(['DROP-0025']), { rows: rows, before: nI0, after: nI1, have: have, sig0: s0 });
        await p.close();
      });
      await c2.close();
    }
    if (on('D4')) verdict('D4');

    // ═════════ D6: the existing drop zones still take their own drops with the overlay listening ═════════
    if (on('D6')) {
      var c3 = await B.browser.createBrowserContext();
      await guard('D6', 'zones', 'the reachable drop zones', async function () {
        var p = await erpOpen(c3, 'erp/idempiere.html'); await erpLogin(p, 11); var n0 = p.__log.length, tb = fs.readFileSync(path.join(ERP, 'overlay/ninja/samples/ninja_tb_sample.xlsx'));
        var zone = async function (sel, files, text) {   // a drop ON the zone: returns whether the zone took it (default cancelled) and whether the overlay claimed any file
          var m = p.__log.length;
          var r = await p.evaluate(function (s, fs, txt) {
            var el = document.querySelector(s); if (!el) return null; var dt = new DataTransfer();
            fs.forEach(function (f) { var u = Uint8Array.from(atob(f.b64), function (c) { return c.charCodeAt(0); }); dt.items.add(new File([u], f.name)); }); if (txt) dt.setData('text/plain', txt);
            var o = {}; ['dragover', 'drop'].forEach(function (n) { o[n] = !el.dispatchEvent(new DragEvent(n, { bubbles: true, cancelable: true, dataTransfer: dt })); }); return o;
          }, sel, (files || []).map(function (f) { return { name: f.name, b64: f.bytes.toString('base64') }; }), text || '');
          await sleep(2500); return { took: r, overlayLines: logOf(p, /^§DOOR-DROP file=|^§DOOR-DROP-DRAFT/, m).length, m: m };
        };
        // 1. the Excel Report pill's drop zone (ninja_pill.js np-drop; overlay/ninja/report_pill.js captures it): a report template goes to the report flow, nothing is drafted
        await p.evaluate(function () { window.NinjaPill.open({ db: window.__idmpDb }); }); await p.waitForSelector('#np-drop', { timeout: 20000 });
        var z1 = await zone('#np-drop', [{ name: 'ninja_tb_sample.xlsx', bytes: tb }]); var np = await p.evaluate(function () { return { run: !!document.getElementById('np-run'), out: (document.getElementById('np-out') || {}).textContent }; });
        check('D6', 'excel-report', 'the Excel Report pill\'s own drop zone took a report workbook (default cancelled), its report flow started (Run report offered), and the overlay claimed nothing (0 door lines)', !!z1.took && z1.took.drop === true && np.run === true && z1.overlayLines === 0, { z: z1, np: np });
        await p.evaluate(function () { var c = document.getElementById('np-close'); if (c) c.dispatchEvent(new Event('pointerup')); });
        // 2. the Home screen's Recent Items trash (overlay/home.js): a text drag, no file
        var tr = await p.evaluate(function () { return !!document.querySelector('.ri-trash'); });
        if (tr) { var z2 = await zone('.ri-trash', [], '12345'); check('D6', 'recent-trash', 'the Home\'s Recent Items trash took its text drop (§DASH-RECENT drop id=12345 logged) and the overlay (which acts only on files) claimed nothing', !!z2.took && z2.took.drop === true && logOf(p, /^§DASH-RECENT drop id=12345/, z2.m).length === 1 && z2.overlayLines === 0, { z: z2 }); }
        else say('§DOORDROP-NOTE D6 recent-trash: the Home screen was not showing (no .ri-trash): not exercised');
        // 3. the ERP picker's chain-file zone (erp_picker.js ep-drop): open the migrate dialog, choose Odoo, go to step 3
        await p.evaluate(function () { window.ErpPicker.open({ mode: 'migrate' }); }); await sleep(800);
        await p.evaluate(function () { var e = document.querySelector('#ep-overlay [data-erp="odoo"], #ep-overlay [data-key="odoo"]') || Array.prototype.filter.call(document.querySelectorAll('#ep-overlay .ep-erp, #ep-overlay button, #ep-overlay div'), function (x) { return /^Odoo/.test((x.textContent || '').trim()); })[0]; if (e) e.click(); }); await sleep(600);
        await p.evaluate(function () { var g = document.getElementById('ep-go'); if (g && !g.disabled) g.click(); }); await sleep(1500);
        var hasEp = await p.evaluate(function () { return !!document.getElementById('ep-drop'); });
        if (hasEp) { var z3 = await zone('#ep-drop', [{ name: 'chain.json', bytes: Buffer.from('not json') }]); var ept = await p.evaluate(function () { return (document.getElementById('ep-droptxt') || {}).textContent; });
          check('D6', 'erp-picker', 'the ERP picker\'s chain-file zone took a dropped file (default cancelled) and answered with its own words ("Not a valid chain file"), the overlay claimed nothing', !!z3.took && z3.took.drop === true && /Not a valid chain file/.test(String(ept)) && z3.overlayLines === 0, { z: z3, text: ept }); }
        else say('§DOORDROP-NOTE D6 erp-picker: the picker did not reach its step-3 drop zone through the page\'s own dialog: not exercised');
        await p.evaluate(function () { if (window.ErpPicker && window.ErpPicker.close) window.ErpPicker.close(); });
        say('§DOORDROP-NOTE D6 not exercised: the plugin engine\'s model-sheet zone (#pe-drop exists only for the System Administrator role: this login has none: ' + (await p.evaluate(function () { return !document.getElementById('pe-drop'); })) + ') and the kanban columns (KanbanLens.mount needs the lens page)');
        await p.close();
      });
      verdict('D6');
    }
    if (B.pageErrors.length) say('§DOORDROP-PAGEERRORS n=' + B.pageErrors.length + ' ' + J(B.pageErrors.filter(function (e, i, a) { return a.indexOf(e) === i; }).slice(0, 5)));
    say('§DOORDROP-NET serverRequests=' + NET.requests + ' notGET=' + NET.notGet.length + ' pageRequestsToOtherHosts=' + B.external.length);
    await B.browser.close();
  } else ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'].forEach(function (c) { if (on(c)) verdict(c); });
  srv.srv.close();
  if (ACTIVE) say('§DOORDROP-MUTANT-SERVED name=' + ACTIVE.name + ' file=' + ACTIVE.file + ' matches=' + NET.mutantApplied);

  // ═══ the lane's older witnesses must print their verdict lines unchanged ═══
  if (!MUTANT && !NO_OVERLAY && !ONLY.length && process.env.DOORDROP_SKIP_OLD !== '1') {
    await guard('D9', 'old', 'the older witnesses of this lane', async function () {
      [['witness_sheet_door.js', /§SDOOR-VERDICT PASS judged=44 failed=0/], ['witness_sheet_addin.js', /§SADDIN-VERDICT PASS/], ['witness_sheet_history.js', /§SHIST-VERDICT PASS/]].forEach(function (w) {
        var env = Object.assign({}, process.env); delete env.DBUS_SESSION_BUS_ADDRESS;
        var out = cp.spawnSync(process.execPath, [path.join(__dirname, w[0])], { encoding: 'utf8', maxBuffer: 64 << 20, env: env }).stdout || '', line = (out.match(new RegExp(String(w[1]).slice(1, -1).replace(/ PASS.*$/, ' \\w+.*'))) || [''])[0];
        say('  §DOORDROP-OLD ' + w[0] + ' -> ' + line.slice(0, 170)); check('D9', w[0], w[0] + ' prints ' + String(w[1]).slice(1, -1), w[1].test(line), line);
      });
    });
    verdict('D9');
  }

  // ═══ MUTANTS ═══
  if (process.env.DOORDROP_MUTANTS === '1' && !MUTANT) {
    var killed = 0, list = MUT.filter(function (m) { return !m.failsBefore; });
    list.forEach(function (m) {
      var env = Object.assign({}, process.env, { DOORDROP_MUTANT: m.name, DOORDROP_MUTANTS: '', DOORDROP_ONLY: m.kills }); delete env.DBUS_SESSION_BUS_ADDRESS;
      var out = cp.spawnSync(process.execPath, [__filename], { env: env, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '';
      var line = (out.match(new RegExp('§DOORDROP-' + m.kills + ' verdict=\\w+[^\\n]*')) || [''])[0], applied = (out.match(/§DOORDROP-MUTANT-SERVED[^\n]*matches=(\w+)/) || [])[1];
      var state = applied !== '1' ? 'NOT-APPLIED' : !/verdict=FAIL/.test(line) ? 'SURVIVED' : !/threw=0/.test(line) ? 'CRASHED' : 'KILLED';
      if (state === 'KILLED') killed++;
      var first = (out.match(new RegExp('§DOORDROP-CHECK case=' + m.kills + ' key=\\S+ FAIL')) || [''])[0];
      say('§DOORDROP-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + state + ' matches=' + applied + ' child="' + line + '" first="' + first + '"');
    });
    say('§DOORDROP-MUTANTS killed=' + killed + '/' + list.length);
    if (killed !== list.length) ALL.failed++;
  }
  var names = Object.keys(CASES), vs = names.map(function (c) { return CASES[c].failed ? 'FAIL' : 'PASS'; });
  var overall = !ALL.judged || !B.browser ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§DOORDROP-VERDICT ' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(names) + ' ' + J(vs) + (B.browser ? ' (headless Chromium on the real idempiere.html, synthetic DragEvent with real Files)' : ' (NO browser: the page judged nothing)'));
  process.exit(overall === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§DOORDROP-VERDICT FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
