#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-FILE-IT (bim-compiler prompts/SHEET_FRONT_DOOR.md §9, slice S3b: a browser runner for the filing path). READ THE LOG after every run:
//   every verdict is a §FILEIT line; the exit code is not the evidence. INCONCLUSIVE when nothing was judged (no browser = the browser cases judge nothing).
//   A mutant that makes its named case THROW is CRASHED, not a kill.
// SPEC (claims written before the code, each names the issue it exposes):
//   F1 PARITY   the same workbook filed in node (runner.js + node kernel) and in the browser page: same verdict, same writes, same C_Invoice + lines + Fact_Acct
//               fingerprint, both equal to the S1 oracle path (rows straight into I_Invoice + AD_Process 207)                    -> the browser kernel is a different kernel
//   F2 CROSS    the browser's ledger line verifies + replays in node; the node line verifies + replays in the browser             -> two journal formats / two hashes
//   F3 BYTES    clock and ids fixed the same on both sides: the journal line is the SAME STRING; browser SHA-256 == node crypto     -> hashing or serialising differs by host
//   F4 REFUSED  subtotal 0.01 high: the page says Not filed with both numbers, no document, journal empty, no ledger row offered   -> a refused sheet leaves a ledger trace
//   F5 BOOKS    document + books on screen == an independent SQL read of the page's DB; debits = credits; names and a price the sheet never held -> figures echoed from the sheet
//   F6 DOWNLOAD the downloaded workbook: one new ledger row that verifies + replays; only docno + status changed; reopen chains; another workbook starts its own chain
//   F7 OFFLINE  engine booted, network off: a filing still succeeds, no request attempted; nothing was ever sent out                -> "nothing is uploaded" unproven
//   F8 COST     §KRN-BROWSER-COST scripts, bytes, boot ms, file ms, heap                                                           -> unmeasured weight
//   F9 VACUOUS  no _door_tags -> INCONCLUSIVE in plain words, nothing filed, no download offered                                  -> an untagged workbook passes
//   F10 PANE    the real taskpane.html (Office.js answered by a boot-only stub): the pane's own runner files, File it is not NOT-WIRED -> the pane wiring is claimed, not run
//   F12 NOSAVED the workbook re-saved by a writer that stores no formula result (openpyxl stand-in): REFUSED, G20 / G8 / G9 named with the reason, zero ledger rows, zero journal entries, no invoice; read WITHOUT sheetStubs the formula is invisible
//               (why READ carries it); the normal workbook files and says checks: all ran; a template without a subtotal / a tagged empty one files and says subtotal=absent  -> the adds-up check silently off (§12 D10/D11)
//   F13 ASTRAL  a history entry holding U+1F600 survives the openpyxl re-save (stored ASCII-escaped, no character beyond U+FFFF) and Check history says OK; an OLD workbook (raw emoji in its history) verifies and is normalised on the next append -> an untouched history reported as edited (§12 H-ASTRAL)
//   F11 OLD     W-SHEET-DOOR 21, W-SHEET-ADDIN 59, W-SHEET-HISTORY 20 still PASS on the restructured kernel                         -> the restructure broke the node kernel
// Browser: headless Chromium (puppeteer, FILEIT_PUPPETEER or ~/bim-compiler/node_modules/puppeteer) on the REAL erp/sheet_addin/file_it.html served by a local static
//   server from this tree, real file chooser, real download. Mutants (FILEIT_MUTANTS=1): the server hands the browser a rewritten file (the text must match exactly
//   once, else NOT-APPLIED); a child run must print FAIL for the named case without a throw in it.
// Command: env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_file_it.js      (FILEIT_MUTANTS=1 adds the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http'), nodeCrypto = require('crypto');
var ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..');
var MUTANT = process.env.FILEIT_MUTANT || '', ONLY = (process.env.FILEIT_ONLY || '').split(',').filter(Boolean);     // ONLY = the node-side cases a node mutant child runs (no browser, no F11)
if (!process.env.SQLJS) process.env.SQLJS = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';   // ws_kernel node shell reads it
var _log = console.log; console.log = function () { /* the kernel's own lines: the browser's are captured per page */ };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0, threw: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §FILEIT-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 900)));
}
async function guard(cs, key, rule, fn) { try { await fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); CASES[cs].threw++; } }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0, threw: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§FILEIT-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + ' threw=' + c.threw + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }

var K = require(path.join(ERP, 'ws_kernel.js')), SD = require(process.env.FILEIT_SDOOR || path.join(ERP, 'sheet_door.js')), AP = require(path.join(ERP, 'ad_process.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
var SA = require(process.env.FILEIT_SHIM || path.join(ERP, 'sheet_addin/host_shim.js')), XH = require(process.env.FILEIT_XHOST || path.join(ERP, 'sheet_addin/xlsx_host.js')), EH = require(path.join(ERP, 'sheet_addin/excel_host.js'));
var RN = require(path.join(ERP, 'sheet_addin/runner.js')), SAMPLE = require(path.join(ERP, 'sheet_addin/sample_invoice.js')), WEB = require(path.join(ERP, 'ws_kernel_web.js'));
var TPL = SAMPLE.TPL, DOCNO = 'FILEIT-0001', DATE = '2026-11-20';
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fileit-'));

// ── mutants: a rewritten copy of ONE served file reaches the browser (the node side keeps the real file: the two sides then disagree) ──
var MUT = [
  { name: 'M1-browser-sha-differs', kills: 'F3', file: 'erp/ws_kernel_web.js', from: '0x6a09e667, 0xbb67ae85,', to: '0x6a09e667, 0xbb67ae86,' },
  { name: 'M2-ledger-line-on-refusal', kills: 'F4', file: 'erp/sheet_addin/runner.js', from: 'JSON.stringify(k.journal[k.journal.length - 1]) : null, id = null;', to: 'JSON.stringify(k.journal[k.journal.length - 1]) : JSON.stringify(r.checks || []), id = null;' },
  { name: 'M3-document-echoed-from-the-sheet', kills: 'F5', file: 'erp/sheet_addin/file_it.js', from: 'st.last = await runner.file(tpl, cells, ledgerLines, noSavedResult); return st.last;',
    to: 'st.last = await runner.file(tpl, cells, ledgerLines, noSavedResult); if (st.last.facts) { st.last.facts.partner = cells[tpl.header.partner]; st.last.facts.lines.forEach(function (l, i) { var r = tpl.lines.from + i; l.product = cells[tpl.lines.cols.product + r]; l.price = cells[tpl.lines.cols.price + r]; }); } return st.last;' },
  { name: 'M4-ledger-not-replayed-on-reopen', kills: 'F6', file: 'erp/sheet_addin/runner.js', from: "try { st.k.replay(ledgerLines.join('\\n')); }", to: 'try { void 0; }' },
  { name: 'M5-one-extra-cell-written', kills: 'F6', file: 'erp/sheet_addin/xlsx_host.js', from: 'writes.forEach(function (w) {', to: "writes.concat([{ cell: 'A1', value: 'x' }]).forEach(function (w) {" },
  { name: 'M6-date-conversion-dropped', kills: 'F1', file: 'erp/sheet_addin/xlsx_host.js', from: 'ev(c.v, c.z)', to: 'c.v' },
  { name: 'M7-kernel-kept-across-workbooks', kills: 'F6', file: 'erp/sheet_addin/runner.js', from: 'if (!st.k || st.lines.length) {', to: 'if (!st.k) {' },
  { name: 'M8-pane-runner-not-created', kills: 'F10', file: 'erp/sheet_addin/taskpane.js', from: 'if (!window.SheetAddinRunner && window.SheetRunner && window.WsKernelWeb)', to: 'if (false)' },
  { name: 'M9-workbook-sent-out', kills: 'F7', file: 'erp/sheet_addin/file_it.js', from: "st.name = name; st.last = null;", to: "st.name = name; st.last = null; fetch('upload', { method: 'POST', body: bytes }).catch(function () {});" }
];
var ACTIVE = MUT.filter(function (m) { return m.name === MUTANT; })[0] || null;

// ── the static server: this tree, as GitHub Pages would serve it; counts what it hands out and anything that is not a GET ──
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.sql': 'text/plain; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
var NET = { requests: 0, bytes: 0, notGet: [], mutantApplied: null };
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
      NET.requests++; NET.bytes += body.length;
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'max-age=600' }); rsp.end(body);
    });
    srv.listen(0, '127.0.0.1', function () { res({ srv: srv, base: 'http://127.0.0.1:' + srv.address().port + '/' }); });
  });
}

// ── node side: the SAME stack the page runs (workbook file -> xlsx_host -> host_shim File it -> runner -> kernel), over the node kernel ──
function readWb(file) { return XLSX.read(fs.readFileSync(file), Object.assign({ type: 'buffer' }, XH.READ)); }
function writeWb(wb, name) { var f = path.join(TMP, name); fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); return f; }
function makeRunner() { return RN.create({ boot: function () { return K.load(); }, SheetDoor: SD, AP: function () { return AP; } }); }
async function nodeFile(file, runner) {
  var wb = readWb(file), host = XH.create(XLSX, wb, { engineValue: EH.engineValue }), last = null;
  runner = runner || makeRunner();
  var shim = SA.create(host, { SheetDoor: SD, SheetHistory: require(path.join(ERP, 'sheet_history.js')), runner: { file: async function (a, b, c, d) { last = await runner.file(a, b, c, d); return last; } } });
  var r = await shim.fileIt();
  return { r: r, last: last, wb: wb, runner: runner, k: runner.kernel() };
}
// fingerprint(q, docno): C_Invoice + lines + Fact_Acct, ids stripped (the S1 / S3 fingerprint); q may be sync (node) or async (the page)
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
function cellsOf(wb, sheet) { var s = wb.Sheets[sheet], o = {}; Object.keys(s).forEach(function (a) { if (a.charAt(0) !== '!') o[a] = [s[a].v == null ? null : s[a].v, s[a].f || null]; }); return o; }
function diffCells(a, b) { var d = []; Object.keys(Object.assign({}, a, b)).forEach(function (k) { if (J(a[k] || null) !== J(b[k] || null)) d.push(k); }); return d.sort(); }
function hiddenOf(wb, name) { var i = wb.SheetNames.indexOf(name), m = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]; return i < 0 ? null : (m ? m.Hidden : 0); }
function num(t) { return Number(String(t).replace(/,/g, '')); }

// ── browser side ──
var PUP = null; if (!ONLY.length) try { PUP = require(process.env.FILEIT_PUPPETEER || path.join(os.homedir(), 'bim-compiler/node_modules/puppeteer')); } catch (e) { PUP = null; }
var B = { browser: null, base: null, external: [], console: [] };
async function newPage(rel, opts) {
  opts = opts || {};
  var page = await B.browser.newPage(), dl = fs.mkdtempSync(path.join(TMP, 'dl-'));
  page.__dl = dl; page.__reqs = [];
  var cdp = await page.target().createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  page.on('console', function (m) { var t = m.text(); if (/^§/.test(t)) B.console.push(t); });
  page.on('pageerror', function (e) { B.console.push('§PAGEERROR ' + (e && e.message)); });
  await page.setRequestInterception(true);
  page.on('request', function (rq) {
    var u = rq.url();
    page.__reqs.push(rq.method() + ' ' + u);
    if (opts.stub && opts.stub[u] != null) return rq.respond({ status: 200, contentType: 'text/javascript', body: opts.stub[u] });
    if (u.indexOf(B.base) !== 0 && !/^(data|blob):/.test(u)) { B.external.push(rq.method() + ' ' + u); return rq.abort(); }
    rq.continue();
  });
  await page.goto(B.base + rel, { waitUntil: 'load', timeout: 120000 });
  return page;
}
async function pageReady(page) { await page.waitForFunction(function () { return window.FileItPage && window.FileItPage.runner.ready(); }, { timeout: 180000 }); }
async function upload(page, file) {
  var got = await Promise.all([page.waitForFileChooser({ timeout: 30000 }), page.click('label[for=file]')]);
  await got[0].accept([file]);
  await page.waitForFunction(function (n) { return window.FileItPage.state.name === n && !!window.FileItPage.state.wb && window.FileItPage.state.verdict === null; }, { timeout: 30000 }, path.basename(file));
}
async function fileIt(page) {
  await page.click('#b-file');
  await page.waitForFunction(function () { var s = window.FileItPage.state; return !s.busy && s.verdict !== null; }, { timeout: 180000 });
  return page.evaluate(function () {
    function rows(sel) { return Array.prototype.map.call(document.querySelectorAll(sel), function (tr) { return Array.prototype.map.call(tr.children, function (td) { return td.textContent; }); }); }
    var s = window.FileItPage.state, v = document.getElementById('verdict'), head = {};
    Array.prototype.forEach.call(document.querySelectorAll('#doc-head dd'), function (dd) { head[dd.dataset.k] = dd.textContent; });
    return { verdict: s.verdict, text: v.textContent, mark: v.dataset.verdict, docShown: !document.getElementById('doc').hidden, booksShown: !document.getElementById('books').hidden,
      downloadOffered: !document.getElementById('b-download').hidden, head: head, lines: rows('#doc-lines tbody tr'), books: rows('#books-rows tbody tr'),
      result: s.last ? s.last.result : null, ledgerLine: s.last ? s.last.ledgerLine : null, journal: window.FileItPage.runner.kernel() ? window.FileItPage.journal() : null };
  });
}
function qPage(page, handle) { return function (sql, params) { return page.evaluate(function (h, s, p) { var k = h ? window[h] : window.FileItPage.runner.kernel(); return k.q(s, p || []); }, handle || null, sql, params || []); }; }
async function download(page, name) {
  var f = path.join(page.__dl, name); if (fs.existsSync(f)) fs.unlinkSync(f);
  await page.click('#b-download');
  for (var i = 0; i < 100; i++) { if (fs.existsSync(f) && fs.statSync(f).size > 0 && !fs.readdirSync(page.__dl).some(function (x) { return /\.crdownload$/.test(x); })) return f; await new Promise(function (r) { setTimeout(r, 100); }); }
  return null;
}

(async function main() {
  say('§FILEIT-LOAD tree=' + ROOT + ' mutant=' + (MUTANT || 'none') + ' puppeteer=' + (PUP ? 'yes' : 'NO (browser cases judge nothing)'));

  // ═══ the workbooks (built with the page's own sample builder: the witness files the very sample the page hands out) ═══
  var WB_A = writeWb(SAMPLE.build(XLSX, { docno: DOCNO }), 'invoice_a.xlsx');
  var WB_BAD = writeWb(SAMPLE.build(XLSX, { docno: 'FILEIT-BAD', subtotal: 153.51 }), 'invoice_bad.xlsx');
  var WB_PL = writeWb(SAMPLE.build(XLSX, { docno: 'FILEIT-PL', lines: [{ product: 'Oak', description: 'Oak tree, 2m', qty: 2, price: 61.75 }, { product: 'Elm', description: 'Elm tree', qty: 3, price: null }], grandtotal: null }), 'invoice_pricelist.xlsx');
  var WB_OTHER = writeWb(SAMPLE.build(XLSX, { docno: 'FILEIT-0009' }), 'invoice_other.xlsx');
  var plain = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(plain, XLSX.utils.aoa_to_sheet([['Customer', 'C&W'], ['Oak', 2, 61.75]]), 'Sheet1'); var WB_NOTAGS = writeWb(plain, 'no_tags.xlsx');
  var IN_A = cellsOf(readWb(WB_A), 'Invoice');

  // ═══ oracle (S1): rows straight into I_Invoice + AD_Process 207 on the node kernel, no door ═══
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103 };
  var KO = await K.load(), oRun = KO.inTrx(S, { ws: 'oracle' }, function (trx, ML) {
    var rows = SAMPLE.LINES.map(function (l) { return { i_isimported: 'N', qtyordered: String(l.qty), issotrx: 'Y', doctypename: 'AR Invoice', iso_code: 'USD', bpartnervalue: 'C&W', dateinvoiced: DATE + ' 00:00:00', dateacct: DATE + ' 00:00:00', documentno: DOCNO, productvalue: l.product, description: l.description, priceactual: String(l.price) }; });
    for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, 'i_invoice', null, ML.newPO(trx, 'i_invoice', rows[i])); if (!sv.ok) return { ok: false, error: sv.error }; }
    var p = AP.runInTrx(trx, 207, { params: { AD_Client_ID: 11, AD_Org_ID: 11, DocAction: 'CO' } }); return { ok: p.ok, error: p.summary };
  });
  var FP_DIRECT = await fingerprint(KO.q, DOCNO), oInv = KO.one('SELECT grandtotal, totallines, docstatus FROM c_invoice WHERE documentno=?', [DOCNO]) || {};
  var oracleOk = oRun.ok && oInv.docstatus === 'CO' && Number(oInv.totallines) === 153.5 && FP_DIRECT !== '[]';
  say('§FILEIT-ORACLE direct ok=' + oRun.ok + ' invoice=' + J(oInv) + ' fingerprintBytes=' + FP_DIRECT.length);

  // ═══ node side of the parity ═══
  var N = await nodeFile(WB_A), FP_NODE = N.k ? await fingerprint(N.k.q, DOCNO) : '[]', LINE_NODE = N.last && N.last.ledgerLine;
  say('§FILEIT-NODE verdict=' + N.r.verdict + ' text="' + N.r.text + '" writes=' + J(N.r.writes) + ' ledgerLineChars=' + (LINE_NODE ? LINE_NODE.length : 0));

  var srv = await serve(); B.base = srv.base;
  if (PUP) B.browser = await PUP.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'], env: (function () { var e = Object.assign({}, process.env); delete e.DBUS_SESSION_BUS_ADDRESS; return e; })() });
  var COSTLINE = null;

  if (B.browser) {
    // ═════════ page 1: F1 parity, F8 cost, F5 books, F6 download ═════════
    var p1 = null, v1 = null, dlA = null, FP_B = null;
    await guard('F1', 'parity', 'the same workbook filed in node and in the browser page', async function () {
      var t0 = Date.now(), n0 = { r: NET.requests, b: NET.bytes };
      p1 = await newPage('erp/sheet_addin/file_it.html'); await pageReady(p1);
      var bootWall = Date.now() - t0, cost = await p1.evaluate(function () { var m = performance.memory; return { c: window.WsKernelWeb.cost.last, heap: m ? Math.round(m.usedJSHeapSize / 1048576) : null, files: window.WsKernelWeb.FILES.length }; });
      await upload(p1, WB_A); var t1 = Date.now(); v1 = await fileIt(p1); var fileMs = Date.now() - t1;
      FP_B = await fingerprint(qPage(p1), DOCNO);
      var heap2 = await p1.evaluate(function () { var m = performance.memory; return m ? Math.round(m.usedJSHeapSize / 1048576) : null; });
      COSTLINE = { scripts: cost.c && cost.c.scripts, kernelFiles: cost.files, requests: NET.requests - n0.r, bytesServed: NET.bytes - n0.b, seedAndPatchBytes: cost.c && cost.c.bytes, scriptsMs: cost.c && cost.c.scriptsMs, bootMs: cost.c && cost.c.bootMs,
        pageReadyMs: bootWall, fileMs: fileMs, jsHeapMBAfterBoot: cost.heap, jsHeapMBAfterFiling: heap2 };
      check('F1', 'oracle', 'the oracle run itself is real: ok, CO, total lines 153.50, a non-empty fingerprint', oracleOk, { ok: oRun.ok, inv: oInv, err: oRun.error });
      check('F1', 'node-filed', 'node: the workbook filed through xlsx_host + host_shim + runner (verdict FILED) and equals the oracle', N.r.verdict === 'FILED' && FP_NODE === FP_DIRECT, { v: N.r.verdict, text: N.r.text });
      check('F1', 'browser-filed', 'browser: the page filed the same workbook (verdict FILED, the page shows it)', v1.verdict === 'FILED' && v1.mark === 'FILED' && /^Filed\. /.test(v1.text), { v: v1.verdict, text: v1.text, result: v1.result });
      check('F1', 'same-verdict-writes', 'same verdict text in the status cell and the same writes as node', !!v1.result && J(v1.result.writes) === J(N.last.result.writes) && J(v1.result.writes.map(function (w) { return w.cell; }).sort()) === J(['F2', 'G24']), { browser: v1.result && v1.result.writes, node: N.last.result.writes });
      check('F1', 'fingerprint', 'fingerprint(browser page DB) == fingerprint(node) == fingerprint(oracle), non-empty', oracleOk && FP_B === FP_NODE && FP_B === FP_DIRECT, { browser: String(FP_B).slice(0, 300), node: FP_NODE.slice(0, 300) });
    });
    verdict('F1');

    await guard('F8', 'cost', 'the browser kernel cost is measured', async function () {
      say('§KRN-BROWSER-COST ' + (COSTLINE ? Object.keys(COSTLINE).map(function (k) { return k + '=' + COSTLINE[k]; }).join(' ') : 'none'));
      check('F8', 'cost', 'scripts, bytes, boot ms, file ms and heap are all measured (numbers > 0)', !!COSTLINE && ['scripts', 'requests', 'bytesServed', 'seedAndPatchBytes', 'bootMs', 'pageReadyMs', 'fileMs', 'jsHeapMBAfterBoot'].every(function (k) { return typeof COSTLINE[k] === 'number' && COSTLINE[k] > 0; }), COSTLINE);
    });
    verdict('F8');

    await guard('F5', 'books', 'document and books on screen are read from the page DB', async function () {
      var q = qPage(p1), inv = (await q('SELECT c_invoice_id, c_bpartner_id, grandtotal FROM c_invoice WHERE documentno=?', [DOCNO]))[0] || {};
      var fa = await q('SELECT account_id, amtacctdr, amtacctcr FROM fact_acct WHERE record_id=? AND ad_table_id=318 ORDER BY fact_acct_id', [inv.c_invoice_id || -1]);
      var acct = {}; for (var i = 0; i < fa.length; i++) { var ev = (await q('SELECT value, name FROM c_elementvalue WHERE c_elementvalue_id=?', [fa[i].account_id]))[0] || {}; acct[fa[i].account_id] = ev; }
      var shown = (v1 ? v1.books : []).filter(function (r) { return r[2] !== 'Total'; }), tot = (v1 ? v1.books : []).filter(function (r) { return r[2] === 'Total'; })[0] || [];
      var rowsEq = fa.length > 0 && shown.length === fa.length && fa.every(function (f, n) { var r = shown[n]; return r[1] === acct[f.account_id].value && r[2] === acct[f.account_id].name && num(r[3]) === Number(f.amtacctdr) && num(r[4]) === Number(f.amtacctcr); });
      check('F5', 'rows', 'every entry row on screen == the witness\'s own SQL read of Fact_Acct in the page DB (account, name, debit, credit), same count, > 0 rows', v1 && v1.booksShown && rowsEq, { shown: shown, sql: fa });
      var dr = fa.reduce(function (a, f) { return a + Math.round(Number(f.amtacctdr) * 100); }, 0), cr = fa.reduce(function (a, f) { return a + Math.round(Number(f.amtacctcr) * 100); }, 0);
      check('F5', 'balanced', 'debits = credits > 0 in the DB, and the total row on screen shows that sum', dr === cr && dr > 0 && Math.round(num(tot[3]) * 100) === dr && Math.round(num(tot[4]) * 100) === cr, { dr: dr, cr: cr, tot: tot });
      var nfa = N.k.q('SELECT ev.value AS a, f.amtacctdr AS d, f.amtacctcr AS c FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id JOIN c_invoice i ON i.c_invoice_id=f.record_id WHERE f.ad_table_id=318 AND i.documentno=? ORDER BY f.fact_acct_id', [DOCNO]);
      check('F5', 'node-books', 'the rows on screen equal the node kernel\'s entries for the same filing', nfa.length > 0 && J(nfa.map(function (r) { return [r.a, Number(r.d), Number(r.c)]; })) === J(shown.map(function (r) { return [r[1], num(r[3]), num(r[4])]; })), { node: nfa, shown: shown });
      var bp = (await q('SELECT name, value FROM c_bpartner WHERE c_bpartner_id=?', [inv.c_bpartner_id || -1]))[0] || {};
      var pn = await q('SELECT p.name, p.value FROM c_invoiceline l JOIN m_product p ON p.m_product_id=l.m_product_id WHERE l.c_invoice_id=? ORDER BY l.line', [inv.c_invoice_id || -1]);
      check('F5', 'names', 'the page shows the partner NAME and the product NAMES from the DB; the sheet holds only their search keys (C&W, Oak, Elm)', !!bp.name && v1.head.Customer === bp.name && bp.name !== IN_A.B3[0] && pn.length === 2 && v1.lines.length === 2 &&
        pn.every(function (p, n) { return v1.lines[n][1] === p.name && p.name !== p.value; }) && num(String(v1.head['Grand total']).split(' ')[0]) === Number(inv.grandtotal), { head: v1.head, lines: v1.lines, bp: bp, pn: pn });
    });

    // F6 (first half) on page 1: the download of the filed workbook
    await guard('F6', 'download', 'the downloaded workbook holds one ledger row and only the docno + status cells changed', async function () {
      dlA = v1 && v1.downloadOffered ? await download(p1, 'invoice_a.xlsx') : null;
      check('F6', 'offered', 'after a filing the page offers the workbook back and the file arrives', !!dlA, { offered: v1 && v1.downloadOffered });
      var wb = dlA ? readWb(dlA) : null, ll = wb ? ledgerLines(wb) : [], out = wb ? cellsOf(wb, 'Invoice') : {};
      check('F6', 'one-row', 'exactly ONE _door_ledger row (the input had none), and it is the line the page kernel journalled', ll.length === 1 && ledgerLines(readWb(WB_A)).length === 0 && ll[0] === (v1 && v1.ledgerLine), { rows: ll.length });
      var d = diffCells(IN_A, out);
      check('F6', 'cells', 'docno cell F2 holds the filed number, status cell G24 says Filed; no other cell of the sheet differs in value or formula (' + Object.keys(IN_A).length + ' cells compared)', J(d) === J(['G24']) && !!out.F2 && out.F2[0] === DOCNO && /^Filed FILEIT-0001/.test(String(out.G24 && out.G24[0])) && Object.keys(IN_A).length > 15, { diff: d, F2: out.F2, G24: out.G24 });
      check('F6', 'hidden', '_door_tags and _door_ledger are very hidden in the downloaded file; the invoice sheet is visible', !!wb && hiddenOf(wb, SA.TAGS) === 2 && hiddenOf(wb, SA.LEDGER) === 2 && hiddenOf(wb, 'Invoice') === 0, wb && [hiddenOf(wb, SA.TAGS), hiddenOf(wb, SA.LEDGER), hiddenOf(wb, 'Invoice')]);
    });

    // F2: the browser line in node
    var LINE_B = v1 && v1.ledgerLine;
    await guard('F2', 'b-to-n', 'the browser ledger line verifies and replays in node', async function () {
      var ll = dlA ? ledgerLines(readWb(dlA)) : [], v = ll.length ? K.verifyJournal(ll.join('\n')) : { ok: false, why: 'no line' };
      check('F2', 'b-verifies-in-node', 'the ledger line from the DOWNLOADED workbook passes node ws_kernel.verifyJournal', v.ok === true && v.entries === 1, v);
      var KR = await K.load(), rp = null, err = null; try { rp = KR.replay(ll.join('\n')); } catch (e) { err = e.message; }
      check('F2', 'b-replays-in-node', 'replayed into a fresh NODE kernel it gives the same fingerprint as the page DB and the oracle', !!rp && rp.replayed === 1 && (await fingerprint(KR.q, DOCNO)) === FP_DIRECT && FP_B === FP_DIRECT, { rp: rp, err: err });
    });

    // F5 (second half): a line the price list prices - the sheet has no price to echo
    await guard('F5', 'pricelist', 'a blank price cell: the page shows the price the books used', async function () {
      await upload(p1, WB_PL); var v = await fileIt(p1), q = qPage(p1);
      var pl = await q('SELECT l.line, l.priceactual, l.linenetamt FROM c_invoiceline l JOIN c_invoice i ON i.c_invoice_id=l.c_invoice_id WHERE i.documentno=? ORDER BY l.line', ['FILEIT-PL']);
      var inPl = cellsOf(readWb(WB_PL), 'Invoice');
      check('F5', 'pricelist', 'filed; the Elm line\'s price cell is blank in the sheet, the page shows the price list price read from the DB (> 0) and its net', v.verdict === 'FILED' && !inPl.E9 && pl.length === 2 && Number(pl[1].priceactual) > 0 && v.lines.length === 2 &&
        num(v.lines[1][4]) === Number(pl[1].priceactual) && num(v.lines[1][5]) === Number(pl[1].linenetamt), { v: v.verdict, text: v.text, lines: v.lines, sql: pl });
    });
    verdict('F5');

    // ═════════ page 2: F6 reopen + another workbook ═════════
    await guard('F6', 'reopen', 'the downloaded workbook reopened in a reloaded page chains; another workbook starts its own chain', async function () {
      var wb = readWb(dlA || WB_A); wb.Sheets.Invoice.F2 = { t: 's', v: 'FILEIT-0002' };
      var WB_A2 = writeWb(wb, 'invoice_a2.xlsx'), p2 = await newPage('erp/sheet_addin/file_it.html'); await pageReady(p2);
      await upload(p2, WB_A2); var v = await fileIt(p2), dl = v.downloadOffered ? await download(p2, 'invoice_a2.xlsx') : null;
      var ll = dl ? ledgerLines(readWb(dl)) : [], vj = K.verifyJournal(ll.join('\n')), e = ll.map(function (l) { try { return JSON.parse(l); } catch (x) { return {}; } });
      check('F6', 'chain', 'second filing FILED; the workbook now holds 2 ledger rows, seq 1 then 2, row 2 chained to row 1, both verify', v.verdict === 'FILED' && ll.length === 2 && vj.ok === true && e[0].seq === 1 && e[1].seq === 2 && e[1].prev === e[0].hash, { v: v.verdict, text: v.text, rows: ll.length, vj: vj });
      var KR = await K.load(), rp = null, err = null; try { rp = KR.replay(ll.join('\n')); } catch (x) { err = x.message; }
      var f1 = await fingerprint(KR.q, DOCNO), f2 = await fingerprint(KR.q, 'FILEIT-0002');
      check('F6', 'replay-both', 'both rows replay into a fresh node kernel: invoice 1 identical to the oracle, invoice 2 identical apart from its number', !!rp && rp.replayed === 2 && f1 === FP_DIRECT && f2 !== '[]' && f2.split('FILEIT-0002').join(DOCNO) === FP_DIRECT, { rp: rp, err: err });
      await upload(p2, WB_OTHER); var vo = await fileIt(p2), dlo = vo.downloadOffered ? await download(p2, 'invoice_other.xlsx') : null;
      var lo = dlo ? ledgerLines(readWb(dlo)) : [], vjo = K.verifyJournal(lo.join('\n')), eo = lo.length ? JSON.parse(lo[0]) : {};
      check('F6', 'other-own-chain', 'a different workbook opened in the same page starts its OWN chain: 1 row, seq 1, verifies alone, and the page DB does not hold the first workbook\'s invoices', vo.verdict === 'FILED' && lo.length === 1 && vjo.ok === true && eo.seq === 1 &&
        (await fingerprint(qPage(p2), DOCNO)) === '[]' && (await fingerprint(qPage(p2), 'FILEIT-0009')) !== '[]', { v: vo.verdict, text: vo.text, rows: lo.length, vj: vjo, seq: eo.seq });
      await p2.close();
    });
    verdict('F6');

    // ═════════ page 3: F2 node -> browser, F3 same bytes ═════════
    var p3 = null;
    await guard('F2', 'n-to-b', 'the node ledger line verifies and replays in the browser', async function () {
      p3 = await newPage('erp/sheet_addin/file_it.html'); await pageReady(p3);
      var r = await p3.evaluate(async function (line) {
        var out = { verify: null, replay: null, err: null };
        try { out.verify = window.WsKernel.verifyJournal(line); window.__k2 = await window.WsKernelWeb.boot(); out.replay = window.__k2.replay(line); } catch (e) { out.err = String(e && e.message || e); }
        return out;
      }, LINE_NODE || '');
      check('F2', 'n-verifies-in-browser', 'the NODE ledger line passes the browser kernel\'s verifyJournal (the same function, the browser shell\'s SHA-256)', !!LINE_NODE && !!r.verify && r.verify.ok === true && r.verify.entries === 1, r);
      var fp = r.replay ? await fingerprint(qPage(p3, '__k2'), DOCNO) : null;
      check('F2', 'n-replays-in-browser', 'replayed into a fresh BROWSER kernel it gives the oracle fingerprint', !!r.replay && r.replay.replayed === 1 && fp === FP_DIRECT, { replay: r.replay, err: r.err, fp: String(fp).slice(0, 200) });
    });
    verdict('F2');

    await guard('F3', 'bytes', 'fixed clock + ids: the journal line is the same string in node and in the browser', async function () {
      var T = 1795000000000, cells = await XH.create(XLSX, readWb(WB_A), { engineValue: EH.engineValue }).readCells('Invoice', SD.tagCells(TPL));
      var real = K.shell(), n = 0;
      K.shell({ nowMs: function () { return T; }, uuid: function () { n++; return '00000000-0000-4000-8000-' + ('000000000000' + n).slice(-12); } });
      var lineN = null, errN = null;
      try { lineN = (await makeRunner().file(TPL, cells, [])).ledgerLine; } catch (e) { errN = e.message; } finally { K.shell({ nowMs: real.nowMs, uuid: real.uuid }); }
      var rb = await p3.evaluate(async function (T, tpl, cells) {
        var n = 0, out = { line: null, err: null };
        window.WsKernelWeb.over = { nowMs: function () { return T; }, uuid: function () { n++; return '00000000-0000-4000-8000-' + ('000000000000' + n).slice(-12); } };
        try { out.line = (await window.SheetRunner.create({ boot: window.WsKernelWeb.boot, SheetDoor: window.SheetDoor, AP: function () { return window.AdProcess; } }).file(tpl, cells, [])).ledgerLine; } catch (e) { out.err = String(e && e.message || e); }
        window.WsKernelWeb.over = null;
        return out;
      }, T, TPL, cells);
      var at = 0; if (lineN && rb.line) while (at < lineN.length && lineN[at] === rb.line[at]) at++;
      check('F3', 'filed-both', 'both fixed-clock filings produced a ledger line', !!lineN && !!rb.line, { errN: errN, errB: rb.err });
      check('F3', 'same-string', 'the journal line of the same filing is the SAME STRING in node and in the browser (' + (lineN ? lineN.length : 0) + ' characters: seq, actor, at, opsDigest, prev, hash, every op with its ids, stamps and uuids)', !!lineN && lineN === rb.line, { firstDiffAt: at, node: lineN && lineN.slice(Math.max(0, at - 60), at + 60), browser: rb.line && rb.line.slice(Math.max(0, at - 60), at + 60) });
      var e = lineN ? JSON.parse(lineN) : { payload: { ops: [] } }, texts = ['', 'abc', 'ก😀é', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'a'.repeat(1 << 20), J(e.payload.ops), String(e.prev) + J([e.seq, e.actor, e.meta, e.opsDigest])];
      var hb = await p3.evaluate(function (ts) { return ts.map(function (t) { return window.WsKernelWeb.sha256(t); }); }, texts), hn = texts.map(function (t) { return nodeCrypto.createHash('sha256').update(t).digest('hex'); });
      check('F3', 'sha256', 'the browser shell\'s SHA-256 == node crypto on ' + texts.length + ' texts (empty, ASCII, astral, block edges, 1 MB, the line\'s own ops text and hash text); the last two ARE the line\'s opsDigest and hash', J(hb) === J(hn) && hn[7] === e.opsDigest && hn[8] === e.hash, { browser: hb, node: hn });
      check('F3', 'sha256-node-copy', 'the same shell file loaded in node gives node crypto\'s digests too', J(texts.map(WEB.sha256)) === J(hn), null);
    });
    verdict('F3');
    if (p3) await p3.close();

    // ═════════ page 4: F4 refused, F9 vacuous, F7 offline ═════════
    var p4 = null;
    await guard('F4', 'refused', 'a workbook whose subtotal is 0.01 high', async function () {
      p4 = await newPage('erp/sheet_addin/file_it.html'); await pageReady(p4);
      await upload(p4, WB_BAD); var v = await fileIt(p4);
      check('F4', 'reason', 'the page says Not filed and names BOTH numbers (lines 153.5, printed 153.51), marked REFUSED', v.verdict === 'REFUSED' && v.mark === 'REFUSED' && /^Not filed: /.test(v.text) && /153\.5\b/.test(v.text.replace('153.51', '')) && /153\.51/.test(v.text), { v: v.verdict, text: v.text });
      check('F4', 'no-document', 'no document and no books are shown; the kernel journal is empty; no C_Invoice and no pending I_Invoice row in the page DB', !v.docShown && !v.booksShown && J(v.journal) === '[]' && (await fingerprint(qPage(p4), 'FILEIT-BAD')) === '[]' &&
        Number((await qPage(p4)('SELECT count(*) AS n FROM i_invoice', []))[0].n) === 0, { doc: v.docShown, journal: v.journal && v.journal.length });
      var dl = v.downloadOffered ? await download(p4, 'invoice_bad.xlsx') : null, wb = dl ? readWb(dl) : null, d = wb ? diffCells(cellsOf(readWb(WB_BAD), 'Invoice'), cellsOf(wb, 'Invoice')) : null;
      check('F4', 'no-ledger-row', 'the workbook offered back has NO _door_ledger row, and only the status cell G24 differs from what was opened', !!wb && ledgerLines(wb).length === 0 && J(d) === J(['G24']) && /^Not filed: /.test(String(wb.Sheets.Invoice.G24.v)), { rows: wb && ledgerLines(wb).length, diff: d });
    });
    verdict('F4');

    await guard('F9', 'vacuous', 'a workbook with no _door_tags', async function () {
      await upload(p4, WB_NOTAGS); var v = await fileIt(p4);
      check('F9', 'no-tags', 'INCONCLUSIVE in plain words naming _door_tags; no document shown, journal empty, no download offered', v.verdict === 'INCONCLUSIVE' && v.mark === 'INCONCLUSIVE' && /_door_tags/.test(v.text) && !v.docShown && !v.downloadOffered && J(v.journal) === '[]', { v: v.verdict, text: v.text, dl: v.downloadOffered });
    });
    verdict('F9');

    await guard('F7', 'offline', 'the engine booted, the network off', async function () {
      var r0 = p4.__reqs.length; await p4.setOfflineMode(true);
      await upload(p4, WB_A); var v = await fileIt(p4), fp = await fingerprint(qPage(p4), DOCNO), during = p4.__reqs.slice(r0);
      check('F7', 'files-offline', 'with the network OFF the page files the workbook (FILED, the oracle fingerprint) and attempts NO request', v.verdict === 'FILED' && fp === FP_DIRECT && during.length === 0, { v: v.verdict, text: v.text, requests: during });
      check('F7', 'nothing-sent', 'across every file_it page of this run: every request was a GET to the page\'s own server (the server saw no other method), none went anywhere else', NET.notGet.length === 0 && B.external.length === 0 && NET.requests > 0, { notGet: NET.notGet, external: B.external });
      var rel = 'not tried';
      try {
        await p4.reload({ waitUntil: 'load', timeout: 20000 });
        var back = await p4.waitForFunction(function () { return window.FileItPage && window.FileItPage.runner.ready(); }, { timeout: 15000 }).then(function () { return true; }, function () { return false; });
        rel = 'page reloaded with the network off: engine ready=' + (back ? 'Y (every file came from the browser HTTP cache; the test server allows 600 s, as GitHub Pages does)' : 'N') + ' engineText="' + (await p4.evaluate(function () { var e = document.getElementById('engine'); return e ? e.textContent : '(no page)'; })) + '"';
      } catch (e) { rel = 'reload failed: ' + String(e && e.message).split('\n')[0]; }
      say('§FILEIT-OFFLINE-RELOAD (measured, not a claim) ' + rel);
      await p4.setOfflineMode(false);
    });
    verdict('F7');
    if (p4) await p4.close();
    if (p1) await p1.close();

    // ═════════ page 5: F10 the real task pane ═════════
    await guard('F10', 'pane', 'the real taskpane.html with a boot-only Office.js stub', async function () {
      var stub = {}; stub['https://appsforoffice.microsoft.com/lib/1/hosted/office.js'] = 'window.Office = { HostType: { Excel: "Excel" }, onReady: function (f) { f({ host: "Excel" }); } }; window.Excel = { run: function () { return Promise.reject(new Error("stub: no workbook")); } };';
      var p5 = await newPage('erp/sheet_addin/taskpane.html', { stub: stub });
      var cells = await XH.create(XLSX, readWb(WB_A), { engineValue: EH.engineValue }).readCells('Invoice', SD.tagCells(TPL));
      var r = await p5.evaluate(async function (tpl, cells, line) {
        var mem = { F2: cells.F2 }, hidden = { _door_tags: [[JSON.stringify(tpl)]] }, reads = 0;
        var host = { readCells: async function (s, addrs) { var o = {}; addrs.forEach(function (a) { reads++; o[a] = cells[a] == null ? null : cells[a]; }); return o; }, writeCells: async function (s, ws) { ws.forEach(function (w) { mem[w.cell] = w.value; }); },
          getHidden: async function (n) { return hidden[n] || []; }, setHidden: async function (n, rows) { hidden[n] = rows; }, activeSheet: async function () { return 'Invoice'; }, userName: async function () { return 'witness'; } };
        var out = { hasRunner: !!window.SheetAddinRunner, wiredBefore: !!(window.WsKernel), verdict: null, text: null, ledgerRows: 0, err: null, mem: mem };
        try { await window.WsKernelWeb.scripts(); out.verifyNoBoot = window.WsKernel.verifyJournal(line); } catch (e) { out.verifyNoBoot = { ok: false, why: String(e && e.message || e) }; }
        try {   // exactly the wiring taskpane.js does: the shim over a host, with the pane's own runner
          var shim = window.SheetAddin.create(host, { SheetDoor: window.SheetDoor, SheetHistory: window.SheetHistory, runner: window.SheetAddinRunner || null });
          var res = await shim.fileIt(); out.verdict = res.verdict; out.text = res.text; out.ledgerRows = (hidden._door_ledger || []).length;
        } catch (e) { out.err = String(e && e.message || e); }
        return out;
      }, TPL, cells, LINE_NODE || '');
      check('F10', 'lazy', 'the pane did not load the kernel before File it was used (no WsKernel global at pane load)', r.wiredBefore === false, r);
      check('F10', 'wired', 'File it through the shim with the pane\'s own runner is FILED, not NOT-WIRED; one ledger row; the docno + status written', r.hasRunner === true && r.verdict === 'FILED' && r.ledgerRows === 1 && r.mem.F2 === DOCNO && /^Filed /.test(String(r.mem.G24)), r);
      check('F10', 'verify-without-boot', 'with the kernel scripts loaded and NO kernel booted, the pane verifies a ledger line (what Check history needs for a ledger made elsewhere)', !!r.verifyNoBoot && r.verifyNoBoot.ok === true && r.verifyNoBoot.entries === 1, r.verifyNoBoot);
      var fp = r.hasRunner && r.verdict === 'FILED' ? await fingerprint(function (sql, params) { return p5.evaluate(function (s, p) { return window.SheetAddinRunner.kernel().q(s, p || []); }, sql, params || []); }, DOCNO) : null;
      check('F10', 'fingerprint', 'the invoice filed in the pane has the oracle fingerprint', fp === FP_DIRECT, String(fp).slice(0, 200));
      var txt = await p5.evaluate(function () { return document.body.textContent; });
      check('F10', 'text', 'the pane no longer tells the user that File it is not loaded in this build', !/not loaded in this build/.test(txt) && /File it/.test(txt), null);
      await p5.close();
    });
    verdict('F10');
    B.console.filter(function (l) { return /^§(KRN-BROWSER-BOOT|PAGEERROR)/.test(l); }).slice(0, 12).forEach(function (l) { say('  page: ' + l); });
    await B.browser.close();
  } else ['F1', 'F8', 'F5', 'F6', 'F2', 'F3', 'F4', 'F9', 'F7', 'F10'].forEach(verdict);
  srv.srv.close();
  if (ACTIVE) say('§FILEIT-MUTANT-SERVED name=' + ACTIVE.name + ' file=' + ACTIVE.file + ' matches=' + NET.mutantApplied);


  // ═══ F12 NOSAVED + F13 ASTRAL (§12): the same stack in node, on workbooks re-saved by another writer (openpyxl stand-in: an independent xlsx reader + writer, NOT an office suite) ═══
  var OPENPYXL = (cp.spawnSync('python3', ['-c', 'import openpyxl;print(openpyxl.__version__)'], { encoding: 'utf8', cwd: TMP }).stdout || '').trim();
  var cleanEnv = Object.assign({}, process.env); delete cleanEnv.DBUS_SESSION_BUS_ADDRESS;
  function resave(file, tag) {
    var out = path.join(TMP, 're_' + tag); fs.mkdirSync(out, { recursive: true });
    var f = path.join(out, path.basename(file)), r = cp.spawnSync('python3', ['-c', 'import sys, openpyxl\nwb = openpyxl.load_workbook(sys.argv[1])\nwb.save(sys.argv[2])', file, f], { env: cleanEnv, encoding: 'utf8', timeout: 180000, cwd: TMP });
    return { ok: r.status === 0 && fs.existsSync(f), file: f, err: (r.stderr || '').slice(0, 300) };
  }
  var allRan = 'checks: line=ran subtotal=ran grandtotal=ran linenet=ran';
  if (!ONLY.length || ONLY.indexOf('F12') >= 0) {
    say('§FILEIT-STANDIN openpyxl=' + (OPENPYXL || 'NO (F12 / F13 judge nothing: INCONCLUSIVE)'));
    if (OPENPYXL) await guard('F12', 'nosaved', 'the openpyxl re-saved workbook is REFUSED, G20 G8 G9 named, nothing filed', async function () {
      var RS = resave(WB_A, 'nosaved'); check('F12', 'resave-ran', 'the openpyxl load + save wrote the re-saved file', RS.ok, RS);
      if (!RS.ok) return;
      var raw = XLSX.read(fs.readFileSync(RS.file), { type: 'buffer', cellNF: true, cellFormula: true }).Sheets.Invoice;
      check('F12', 'why-stubs', 'the re-saved file holds the formulas but NO result: read without sheetStubs SheetJS DROPS G8, G9 and G20 (the old silent hole), read with XH.READ it keeps them as formula cells', !raw.G20 && !raw.G8 && !raw.G9 && ['G8', 'G9', 'G20'].every(function (a) { return readWb(RS.file).Sheets.Invoice[a] && readWb(RS.file).Sheets.Invoice[a].f; }), { without: [raw.G20, raw.G8, raw.G9] });
      var R = await nodeFile(RS.file), K2 = R.k, ledger = ledgerLines(R.wb), inv = K2 ? await fingerprint(K2.q, DOCNO) : '[]';
      say('§FILEIT-NOSAVED verdict=' + R.r.verdict + ' text="' + R.r.text + '" ' + R.r.checksLine);
      check('F12', 'refused', 'REFUSED (not FILED), the text names G20, G8 and G9 and says "formulas with no saved result"; "open and save the file" is in it', R.r.verdict === 'REFUSED' && /^Not filed: cells G20, G8 and G9 hold formulas with no saved result; open and save the file in your spreadsheet program, or type the figures$/.test(R.r.text), { v: R.r.verdict, text: R.r.text });
      check('F12', 'nothing-filed', 'zero ledger rows in the workbook, zero kernel journal entries, no invoice, only the status cell written', ledger.length === 0 && (!K2 || K2.journal.length === 0) && inv === '[]' && J(R.r.writes.map(function (w) { return w.cell; })) === J(['G24']), { rows: ledger.length, writes: R.r.writes });
      check('F12', 'says-which', 'the verdict says which checks did not run: line=no-saved-result subtotal=no-saved-result', /line=no-saved-result subtotal=no-saved-result/.test(String(R.r.checksLine)), R.r.checksLine);
      // the user's remedy works: type the figures (what the message offers) and the very same file files, every check ran
      var wb2 = readWb(RS.file), sh2 = wb2.Sheets.Invoice; sh2.G8 = { t: 'n', v: 123.5 }; sh2.G9 = { t: 'n', v: 30 }; sh2.G20 = { t: 'n', v: 153.5 };
      var F2 = writeWb(wb2, 'typed.xlsx'), R2 = await nodeFile(F2);
      check('F12', 'remedy', 'the same file with the three figures typed in is FILED, every check ran', R2.r.verdict === 'FILED' && R2.r.checksLine === allRan, { v: R2.r.verdict, text: R2.r.text, c: R2.r.checksLine });
    });
    await guard('F12', 'normal', 'the normal workbook is unchanged and says every check ran', async function () {
      check('F12', 'normal', 'WB_A filed in node: FILED, the oracle fingerprint, ' + allRan + ', the status cell the plain "Filed <no> (CO)"', N.r.verdict === 'FILED' && FP_NODE === FP_DIRECT && N.r.checksLine === allRan && /^Filed FILEIT-0001 \(CO\)$/.test(N.r.text), { v: N.r.verdict, c: N.r.checksLine, text: N.r.text });
    });
    await guard('F12', 'absent', 'a template without a subtotal and a tagged but empty subtotal both file and say subtotal=absent', async function () {
      var a = SAMPLE.build(XLSX, { docno: 'FILEIT-NS' }), t2 = JSON.parse(J(TPL)); delete t2.header.subtotal; a.Sheets._door_tags.A1.v = J(t2);
      var RA = await nodeFile(writeWb(a, 'no_subtotal_tag.xlsx'));
      check('F12', 'no-tag', 'the template does not tag a subtotal: FILED, subtotal=absent, no "not checked" in the status cell', RA.r.verdict === 'FILED' && /subtotal=absent/.test(String(RA.r.checksLine)) && !/not checked/.test(RA.r.text), { v: RA.r.verdict, c: RA.r.checksLine, text: RA.r.text });
      var b = SAMPLE.build(XLSX, { docno: 'FILEIT-NE' }); delete b.Sheets.Invoice.G20;
      var RB = await nodeFile(writeWb(b, 'empty_subtotal.xlsx'));
      check('F12', 'tagged-empty', 'the subtotal is tagged but the cell is empty: FILED, subtotal=absent, the status cell says "not checked: subtotal (none printed)"', RB.r.verdict === 'FILED' && /subtotal=absent/.test(String(RB.r.checksLine)) && /; not checked: subtotal \(none printed\)$/.test(RB.r.text), { v: RB.r.verdict, c: RB.r.checksLine, text: RB.r.text });
    });
  }
  if (!ONLY.length || ONLY.indexOf('F13') >= 0) {
    if (OPENPYXL) await guard('F13', 'astral', 'a history holding U+1F600 survives the openpyxl re-save and verifies', async function () {
      var hs = SAMPLE.build(XLSX, { docno: 'FILEIT-EM' }); hs.Sheets.Invoice.C8.v = 'Oak tree \u{1F600} 2m';
      var hostE = XH.create(XLSX, hs, { engineValue: EH.engineValue, userName: 'witness' }), shimE = SA.create(hostE, { SheetDoor: SD, SheetHistory: require(path.join(ERP, 'sheet_history.js')), runner: null });
      var st = await shimE.stamp(), stored = ['_door_history'].map(function (n) { return hs.Sheets[n] ? Object.keys(hs.Sheets[n]).filter(function (a) { return a.charAt(0) !== '!'; }).map(function (a) { return String(hs.Sheets[n][a].v); }).join('') : ''; })[0];
      check('F13', 'stamped', 'Stamp recorded the entry (RECORDED) and the stored history text holds the emoji only as the escape \\ud83d\\ude00, no character beyond U+FFFF', st.verdict === 'RECORDED' && stored.indexOf('\\ud83d\\ude00') >= 0 && !/[\uD800-\uDFFF]/.test(stored), { v: st.verdict, text: st.text, stored: stored.slice(0, 80) });
      var before = await shimE.checkHistory(); check('F13', 'before', 'Check history on the new workbook says OK', before.verdict === 'OK', before);
      var RS = resave(writeWb(hs, 'emoji_hist.xlsx'), 'emoji');
      if (!RS.ok) { check('F13', 'resave-ran', 'the openpyxl load + save wrote the re-saved file', false, RS); return; }
      var back = readWb(RS.file), shimB = SA.create(XH.create(XLSX, back, { engineValue: EH.engineValue }), { SheetDoor: SD, SheetHistory: require(path.join(ERP, 'sheet_history.js')), runner: null }), after = await shimB.checkHistory();
      check('F13', 'resaved', 'after the re-save Check history still says OK (a history that was never edited is not called edited)', after.verdict === 'OK' && after.ok === true, after);
      // an OLD workbook: the line written the way the previous code did (raw emoji in the hidden cells), verified, then normalised by the next append
      var SH2 = require(path.join(ERP, 'sheet_history.js')), old = SAMPLE.build(XLSX, { docno: 'FILEIT-OL' }), hostO = XH.create(XLSX, old, { engineValue: EH.engineValue, userName: 'old' });
      var rec = await SH2.record([], null, { Invoice: { A1: { v: 'raw \u{1F600} line', f: null } } }, 'old', '2026-11-01T00:00:00.000Z');
      await hostO.setHidden('_door_history', [SA.splitLine(rec.line)]);
      var shimO = SA.create(hostO, { SheetDoor: SD, SheetHistory: SH2, runner: null }), o1 = await shimO.checkHistory(), s2 = await shimO.stamp(), o2 = await shimO.checkHistory();
      var oldStored = Object.keys(old.Sheets._door_history).filter(function (a) { return a.charAt(0) !== '!'; }).map(function (a) { return String(old.Sheets._door_history[a].v); }).join('');
      check('F13', 'old', 'the old raw-emoji history verifies as written, a Stamp appends entry 2, both verify, and the stored text is now escaped (no character beyond U+FFFF)', /raw \u{1F600} line/u.test(rec.line) && o1.verdict === 'OK' && s2.verdict === 'RECORDED' && o2.verdict === 'OK' && o2.history.entries === 2 && !/[\uD800-\uDFFF]/.test(oldStored), { o1: o1.verdict, s2: s2.verdict, o2: o2.text });
    });
  }

  if (!ONLY.length || ONLY.indexOf('F12') >= 0) verdict('F12');
  if (!ONLY.length || ONLY.indexOf('F13') >= 0) verdict('F13');

  // ═══ F11: the older witnesses of this lane on the restructured kernel ═══
  if (!MUTANT && process.env.FILEIT_SKIP_OLD !== '1') {
    await guard('F11', 'old', 'S1 / S3 / S9 pass unchanged', async function () {
      [['witness_sheet_door.js', /§SDOOR-VERDICT PASS judged=33 failed=0/], ['witness_sheet_addin.js', /§SADDIN-VERDICT PASS judged=63 failed=0/], ['witness_sheet_history.js', /§SHIST-VERDICT PASS judged=20 failed=0/]].forEach(function (w) {
        var out = cp.spawnSync(process.execPath, [path.join(__dirname, w[0])], { encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '', line = (out.match(/§S\w+-VERDICT[^\n]*/) || ['(no verdict line)'])[0];
        say('  §FILEIT-OLD ' + w[0] + ' -> ' + line.slice(0, 160));
        check('F11', w[0], w[0] + ' prints ' + String(w[1]).slice(1, -1), w[1].test(line), line);
      });
    });
    verdict('F11');
  }

  // ═══ MUTANTS ═══
  if (process.env.FILEIT_MUTANTS === '1' && !MUTANT) {
    var killed = 0;
    MUT.forEach(function (m) {
      var out = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { FILEIT_MUTANT: m.name, FILEIT_MUTANTS: '' }), encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '';
      var line = (out.match(new RegExp('§FILEIT-' + m.kills + ' verdict=\\w+[^\\n]*')) || [''])[0], applied = (out.match(/§FILEIT-MUTANT-SERVED[^\n]*matches=(\w+)/) || [])[1];
      var state = applied !== '1' ? 'NOT-APPLIED' : !/verdict=FAIL/.test(line) ? 'SURVIVED' : !/threw=0/.test(line) ? 'CRASHED' : 'KILLED';
      if (state === 'KILLED') killed++;
      say('§FILEIT-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + state + ' matches=' + applied + ' child="' + line + '"');
    });
    say('§FILEIT-MUTANTS killed=' + killed + '/' + MUT.length);
    if (killed !== MUT.length) ALL.failed++;
    // node-side mutants (F12 / F13): a rewritten COPY of one module is handed to a child run of only those cases (env var = the module path)
    var NMUT = [
      { name: 'N1-sheetstubs-dropped-from-READ', kills: 'F12', file: 'erp/sheet_addin/xlsx_host.js', env: 'FILEIT_XHOST', from: 'cellFormula: true, sheetStubs: true }', to: 'cellFormula: true }' },
      { name: 'N2-no-saved-result-never-reported', kills: 'F12', file: 'erp/sheet_addin/xlsx_host.js', env: 'FILEIT_XHOST', from: "return !!c && c.f != null && c.f !== '' && !hasValue(c); });", to: 'return false; });' },
      { name: 'N3-stub-zero-read-as-a-saved-result', kills: 'F12', file: 'erp/sheet_addin/xlsx_host.js', env: 'FILEIT_XHOST', from: "function hasValue(c) { return !!c && c.t !== 'z' && c.v != null; }", to: 'function hasValue(c) { return !!c && c.v != null; }' },
      { name: 'N4-checks-list-not-reported', kills: 'F12', file: 'erp/sheet_door.js', env: 'FILEIT_SDOOR', from: 'r.checksLine = ranLine(r.ran);', to: "r.checksLine = '';" },
      { name: 'N5-astral-escape-dropped', kills: 'F13', file: 'erp/sheet_addin/host_shim.js', env: 'FILEIT_SHIM', from: 'function escapeAstral(line) { return line.replace(', to: 'function escapeAstral(line) { return line; } function escapeAstralOff(line) { return line.replace(' },
      { name: 'N6-old-lines-not-normalised', kills: 'F13', file: 'erp/sheet_addin/host_shim.js', env: 'FILEIT_SHIM', from: 'ls.map(function (l) { return splitLine(escapeAstral(l), limit); })', to: 'ls.map(function (l, i) { return splitLine(i === ls.length - 1 ? escapeAstral(l) : l, limit); })' }
    ], nTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fileit-nmut-')), nKilled = 0;
    NMUT.forEach(function (m) {
      var src = fs.readFileSync(path.join(ROOT, m.file), 'utf8'), n = src.split(m.from).length - 1;
      if (n !== 1) { say('§FILEIT-MUTANT name=' + m.name + ' kills=' + m.kills + ' NOT-APPLIED matches=' + n); return; }
      var f = path.join(nTmp, m.name + '.js'); fs.writeFileSync(f, src.replace(m.from, m.to));
      var env = Object.assign({}, process.env, { FILEIT_MUTANT: m.name, FILEIT_MUTANTS: '', FILEIT_ONLY: m.kills }); env[m.env] = f;
      var out = cp.spawnSync(process.execPath, [__filename], { env: env, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '';
      var line = (out.match(new RegExp('§FILEIT-' + m.kills + ' verdict=\\w+[^\\n]*')) || [''])[0], state = !/verdict=FAIL/.test(line) ? 'SURVIVED' : !/threw=0/.test(line) ? 'CRASHED' : 'KILLED';
      if (state === 'KILLED') nKilled++;
      say('§FILEIT-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + state + ' child="' + line + '"');
    });
    say('§FILEIT-NODE-MUTANTS killed=' + nKilled + '/' + NMUT.length);
    if (nKilled !== NMUT.length) ALL.failed++;
  }
  var names = Object.keys(CASES), vs = names.map(function (c) { return CASES[c].failed ? 'FAIL' : 'PASS'; });
  var rsJudged = !ONLY.length ? ['F12', 'F13'].every(function (c) { return CASES[c] && CASES[c].judged; }) : true;     // no openpyxl = F12 / F13 judged nothing = INCONCLUSIVE, never PASS
  var overall = !ALL.judged || (!B.browser && !ONLY.length) || !rsJudged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§FILEIT-VERDICT ' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(names) + ' ' + J(vs) + (B.browser ? ' (headless Chromium on the real page; real Excel NOT run)' : ' (no browser: nothing of the browser was judged)'));
  process.exit(overall === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§FILEIT-VERDICT FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
