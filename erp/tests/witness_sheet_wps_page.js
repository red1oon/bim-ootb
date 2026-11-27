#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SHEET-WPS-PAGE (bim-compiler prompts/SHEET_FRONT_DOOR.md §11, slice S4, the browser half). READ THE LOG after every run: every verdict is a §SWPP line; the exit code is not the evidence.
//   INCONCLUSIVE when nothing was judged (no browser, or no soffice, judges nothing). A mutant that makes its case THROW is CRASHED, not a kill.
//   REAL WPS IS NOT RUN: Q1 injects a FAKE WPS Application (fake_wps.js) into the real task pane; Q2 re-saves through openpyxl (LibreOffice Calc is not installed here) as a STAND-IN for "another office suite" (an independent xlsx writer, not an office suite; WPS's own writer is NOT run);
//   Q3 is headless Chromium DEVICE EMULATION at 390 x 844 (viewport, pixel ratio 3, mobile flag, touch), not a phone: no phone memory, CPU or WebView.
// SPEC (claims written in §11.3 before the code):
//   Q1 PANE    the real taskpane.html with a fake WPS Application injected and no Office.js: picks the WPS host; Stamp RECORDED; File it FILED with the oracle fingerprint; read-only name box; no Microsoft request
//   Q2 RESAVE  a filed + stamped workbook and the PDF page's .xlsx, re-saved by openpyxl (stand-in): per-attribute losses measured; no _door_* sheet visible afterwards; ledger/history chunks exact and still verify; the
//              re-saved workbook opens in the real file_it.html, files, chains (2 rows) and gives the fingerprint the original gives
//   Q3 MOBILE  file_it.html and pdf/index.html at 390x844 touch: no horizontal scroll on load and after a result; the file control accepts a file; a workbook files / a PDF opens; §DOOR-MOBILE cost line
// Mutants (SWPP_MUTANTS=1): the server hands the browser a rewritten copy (text must match exactly once, else NOT-APPLIED), or the re-save step is damaged; a child run must print FAIL for the named case.
// Command: env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_sheet_wps_page.js     (SWPP_MUTANTS=1 adds the sweep; SWPP_ONLY=Q1,Q2 limits the cases)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..');
var MUTANT = process.env.SWPP_MUTANT || '', ONLY = (process.env.SWPP_ONLY || '').split(',').filter(Boolean);
if (!process.env.SQLJS) process.env.SQLJS = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
var _log = console.log; console.log = function () { /* the kernel's own lines: the browser's are captured per page */ };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §SWPP-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 900)));
}
async function guard(cs, key, rule, fn) { try { await fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); } }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§SWPP-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
var wants = function (cs) { return !ONLY.length || ONLY.indexOf(cs) >= 0; };

var K = require(path.join(ERP, 'ws_kernel.js')), SD = require(path.join(ERP, 'sheet_door.js')), SH = require(path.join(ERP, 'sheet_history.js')), AP = require(path.join(ERP, 'ad_process.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
var SA = require(path.join(ERP, 'sheet_addin/host_shim.js')), XH = require(path.join(ERP, 'sheet_addin/xlsx_host.js')), EH = require(path.join(ERP, 'sheet_addin/excel_host.js'));
var RN = require(path.join(ERP, 'sheet_addin/runner.js')), SAMPLE = require(path.join(ERP, 'sheet_addin/sample_invoice.js')), SF = require('./sheet_fakes.js');
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'swpp-')), cleanEnv = (function () { var e = Object.assign({}, process.env); delete e.DBUS_SESSION_BUS_ADDRESS; return e; })();
var PUP = null; try { PUP = require(process.env.SWPP_PUPPETEER || path.join(os.homedir(), 'bim-compiler/node_modules/puppeteer')); } catch (e) { PUP = null; }
var SOFFICE = (cp.spawnSync('sh', ['-c', 'command -v soffice'], { encoding: 'utf8' }).stdout || '').trim();   // only to PROVE below that this machine's LibreOffice has no spreadsheet component

// ── mutants: a rewritten copy of ONE served file reaches the browser; M4 damages the re-save step itself ──
var MUT = [
  { name: 'M12-pane-always-picks-the-excel-host', kills: 'Q1', file: 'erp/sheet_addin/taskpane.js', from: 'function inWps() { return !!(window.Application && window.Application.PluginStorage && window.SheetAddinWps); }', to: 'function inWps() { return false; }' },
  { name: 'M13-page-forced-wide', kills: 'Q3', file: 'erp/sheet_addin/file_it.html', from: '</head>', to: '<style>main { min-width: 1200px; }</style></head>' },
  { name: 'M4-resave-makes-the-hidden-sheets-visible', kills: 'Q2', resave: 'show' }
];
var ACTIVE = MUTANT ? MUT.filter(function (m) { return m.name === MUTANT; })[0] : null;
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.sql': 'text/plain; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.pdf': 'application/pdf', '.svg': 'image/svg+xml' };
var NET = { requests: 0, bytes: 0, mutantApplied: null };
function serve() {
  return new Promise(function (res) {
    var srv = http.createServer(function (req, rsp) {
      var rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), f = path.join(ROOT, rel);
      if (req.method !== 'GET' || f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || !fs.statSync(f).isFile()) { rsp.writeHead(404); rsp.end(); return; }
      var body = fs.readFileSync(f);
      if (ACTIVE && ACTIVE.file === rel) { var txt = body.toString('utf8'), n = txt.split(ACTIVE.from).length - 1; NET.mutantApplied = n; if (n === 1) body = Buffer.from(txt.replace(ACTIVE.from, ACTIVE.to)); }
      NET.requests++; NET.bytes += body.length;
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'max-age=600' }); rsp.end(body);
    });
    srv.listen(0, '127.0.0.1', function () { res({ srv: srv, base: 'http://127.0.0.1:' + srv.address().port + '/' }); });
  });
}
async function fingerprint(q, docno) {
  var inv = await q('SELECT * FROM c_invoice WHERE documentno=?', [docno]), out = [];
  for (var n = 0; n < inv.length; n++) {
    var i = inv[n], ls = await q('SELECT line, m_product_id, c_charge_id, qtyinvoiced, priceactual, linenetamt, c_tax_id, description FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line', [i.c_invoice_id]);
    var fa = await q('SELECT account_id, amtacctdr, amtacctcr FROM fact_acct WHERE ad_table_id=318 AND record_id=? ORDER BY account_id, amtacctdr, amtacctcr', [i.c_invoice_id]);
    out.push({ h: [i.c_bpartner_id, i.c_doctype_id, i.issotrx, i.documentno, String(i.dateinvoiced).slice(0, 10), i.docstatus, i.totallines, i.grandtotal, i.c_currency_id, i.posted], l: ls, f: fa });
  }
  return J(out);
}
var READ = Object.assign({ type: 'buffer' }, XH.READ);
function readWb(file) { return XLSX.read(fs.readFileSync(file), READ); }
function writeWb(wb, name) { var f = path.join(TMP, name); fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })); return f; }
function rowsOf(wb, name) { var s = wb.Sheets[name]; return s && s['!ref'] ? XLSX.utils.sheet_to_json(s, { header: 1, raw: true, defval: '' }).map(function (r) { return r.map(function (c) { return c == null ? '' : String(c); }); }) : null; }
function linesOf(wb, name) { var r = rowsOf(wb, name); return r ? r.map(function (x) { return x.join(''); }).filter(Boolean) : []; }
function hiddenOf(wb, name) { var i = wb.SheetNames.indexOf(name), m = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]; return i < 0 ? null : (m && m.Hidden ? m.Hidden : 0); }
function cellsOf(wb, sheet) { var s = wb.Sheets[sheet], o = {}; Object.keys(s).forEach(function (a) { if (a.charAt(0) !== '!') o[a] = { v: s[a].v == null ? null : s[a].v, f: s[a].f || null, z: s[a].z || null }; }); return o; }
// the second xlsx writer. LibreOffice Calc is NOT installed on the build machine (soffice exists, with Writer / Math / Base only: it cannot load a .csv or .xlsx, §SWPP-STANDIN below), so the
// stand-in for "saved by another suite" is openpyxl (Python): an independent xlsx reader and writer, NOT an office suite and NOT WPS. It loads the whole workbook and saves it again.
var OPENPYXL = (cp.spawnSync('python3', ['-c', 'import openpyxl;print(openpyxl.__version__)'], { encoding: 'utf8', cwd: TMP }).stdout || '').trim();
function resave(file, tag) {
  var out = path.join(TMP, 're_' + tag); fs.mkdirSync(out, { recursive: true });
  var f = path.join(out, path.basename(file)), r = cp.spawnSync('python3', ['-c', 'import sys, openpyxl\nwb = openpyxl.load_workbook(sys.argv[1])\nwb.save(sys.argv[2])', file, f], { env: cleanEnv, encoding: 'utf8', timeout: 180000, cwd: TMP }), ok = r.status === 0 && fs.existsSync(f);   // openpyxl lives in the user site: no -I; cwd = an empty temp dir, our own generated files only
  if (ok && ACTIVE && ACTIVE.resave === 'show') { var wb = readWb(f); wb.Workbook.Sheets.forEach(function (m, i) { if (/^_door_/.test(wb.SheetNames[i])) m.Hidden = 0; }); fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); }   // MUTANT: the re-saver un-hides
  return { ok: ok, file: f, status: r.status, err: (r.stderr || '').slice(0, 300) };
}
async function nodeFile(wb, runner, user) {
  var host = XH.create(XLSX, wb, { engineValue: EH.engineValue, userName: user }), last = null;
  var shim = SA.create(host, { SheetDoor: SD, SheetHistory: SH, runner: { file: async function (a, b, c) { last = await runner.file(a, b, c); return last; } } });
  return { shim: shim, last: function () { return last; } };
}

// ── browser helpers ──
var B = { browser: null, base: null, external: [], console: [] };
async function newPage(rel, opts) {
  opts = opts || {}; var ctx = opts.fresh ? await B.browser.createBrowserContext() : B.browser, page = await ctx.newPage(); page.__ctx = opts.fresh ? ctx : null; page.__reqs = []; page.__logs = [];
  page.on('console', function (m) { var t = m.text(); page.__logs.push(t); if (/^§/.test(t)) B.console.push(t); });
  page.on('pageerror', function (e) { B.console.push('§PAGEERROR ' + (e && e.message)); page.__logs.push('§PAGEERROR ' + (e && e.message)); });
  if (opts.mobile) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  if (opts.before) await page.evaluateOnNewDocument(opts.before);
  await page.setRequestInterception(true);
  page.on('request', function (rq) { var u = rq.url(); page.__reqs.push(rq.method() + ' ' + u); if (u.indexOf(B.base) !== 0 && !/^(data|blob):/.test(u)) { B.external.push(rq.method() + ' ' + u); return rq.abort(); } rq.continue(); });
  var n0 = { r: NET.requests, b: NET.bytes }, t0 = Date.now(); await page.goto(B.base + rel, { waitUntil: 'load', timeout: 120000 });
  page.__n0 = n0; page.__load = { ms: Date.now() - t0, requests: NET.requests - n0.r, bytes: NET.bytes - n0.b }; return page;
}
async function closePage(p) { await p.close(); if (p.__ctx) await p.__ctx.close(); }
async function fileReady(page) { await page.waitForFunction(function () { return window.FileItPage && window.FileItPage.runner.ready(); }, { timeout: 180000 }); }
async function chooseFile(page, labelSel, file, tap) {
  var got = await Promise.all([page.waitForFileChooser({ timeout: 30000 }), tap ? page.tap(labelSel) : page.click(labelSel)]); await got[0].accept([file]);
}
async function openIn(page, file, tap) {
  await chooseFile(page, 'label[for=file]', file, tap);
  await page.waitForFunction(function (n) { return window.FileItPage.state.name === n && !!window.FileItPage.state.wb && window.FileItPage.state.verdict === null; }, { timeout: 30000 }, path.basename(file));
}
async function fileItOn(page, tap) {
  if (tap) await page.tap('#b-file'); else await page.click('#b-file');
  await page.waitForFunction(function () { var s = window.FileItPage.state; return !s.busy && s.verdict !== null; }, { timeout: 180000 });
  return page.evaluate(function () { var s = window.FileItPage.state; return { verdict: s.verdict, text: document.getElementById('verdict').textContent, ledgerLine: s.last ? s.last.ledgerLine : null, journal: window.FileItPage.runner.kernel() ? window.FileItPage.journal() : null }; });
}
function qPage(page) { return function (sql, params) { return page.evaluate(function (s, p) { return window.FileItPage.runner.kernel().q(s, p || []); }, sql, params || []); }; }
function widths(page) { return page.evaluate(function () { return { scrollW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth, innerW: window.innerWidth, dpr: window.devicePixelRatio, touch: 'ontouchstart' in window }; }); }
function heapMB(page) { return page.evaluate(function () { var m = performance.memory; return m ? Math.round(m.usedJSHeapSize / 1048576) : null; }); }
async function waitLog(page, re, ms) { for (var t = 0; t < (ms || 20000); t += 100) { var l = page.__logs.filter(function (x) { return re.test(x); })[0]; if (l) return l; await new Promise(function (r) { setTimeout(r, 100); }); } return null; }

(async function main() {
  say('§SWPP-LOAD tree=' + ROOT + ' mutant=' + (MUTANT || 'none') + ' puppeteer=' + (PUP ? 'yes' : 'NO') + ' soffice=' + (SOFFICE || 'NO') + ' openpyxl=' + (OPENPYXL || 'NO') + ' only=' + (ONLY.join(',') || 'all'));
  var srv = await serve(); B.base = srv.base;
  if (PUP) B.browser = await PUP.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--enable-precise-memory-info'], env: cleanEnv });
  var DOCNO_A = 'WPS-0001', DOCNO_B = 'WPS-0002', FP2 = null, WBO = null, LO = null;

  // ═══ the workbook every Q2 / Q3 step uses: filed once, stamped (history entry > 32,767 chars), a new number typed for a second filing ═══
  if (wants('Q2') || wants('Q3')) {
    var wb = SAMPLE.build(XLSX, { docno: DOCNO_A }), data = XLSX.utils.aoa_to_sheet([['Notes']].concat(Array.from({ length: 450 }, function (_, i) { return ['item ' + (i + 1) + ' ' + (i % 50 === 49 ? 'accent \u00e9\u4e2d ' : '') + 'x'.repeat(100)]; })));
    XLSX.utils.book_append_sheet(wb, data, 'Data'); wb.Workbook = wb.Workbook || {}; wb.Workbook.Sheets = wb.SheetNames.map(function (n) { return { Hidden: /^_door_/.test(n) ? 2 : 0 }; });
    var runner1 = RN.create({ boot: function () { return K.load(); }, SheetDoor: SD, AP: function () { return AP; } }), n1 = await nodeFile(wb, runner1, 'Aminah');
    var f1 = await n1.shim.fileIt(), s1 = await n1.shim.stamp();
    say('§SWPP-FIXTURE filed=' + f1.verdict + ' text="' + f1.text + '" stamp=' + s1.verdict + ' cells=' + s1.cells + ' chunks=' + s1.chunks + ' sheets=' + J(wb.SheetNames));
    wb.Sheets.Invoice.F2 = { t: 's', v: DOCNO_B };                         // the user types the next invoice number (the status cell still says the first was filed)
    WBO = writeWb(wb, 'wps_filed_stamped.xlsx');
    // the second filing on the ORIGINAL file, in node: its fingerprint is what the re-saved file must give in the page
    var wb2 = readWb(WBO), runner2 = RN.create({ boot: function () { return K.load(); }, SheetDoor: SD, AP: function () { return AP; } }), n2 = await nodeFile(wb2, runner2), f2 = await n2.shim.fileIt();
    FP2 = f2.verdict === 'FILED' ? await fingerprint(async function (s, p) { return runner2.kernel().q(s, p || []); }, DOCNO_B) : '[]';
    say('§SWPP-ORACLE second filing on the original file: ' + f2.verdict + ' text="' + f2.text + '" fingerprintBytes=' + FP2.length);
  }

  // ═══ Q1 PANE ═══
  if (wants('Q1')) {
    if (!B.browser) CASES.Q1 = CASES.Q1 || { judged: 0, failed: 0 };
    else await guard('Q1', 'pane', 'the real taskpane.html with a fake WPS Application and no Office.js', async function () {
      var m = new SF.Workbook(), ws = m.addSheet('Invoice'); m.active = 'Invoice'; var wbq = SAMPLE.build(XLSX, { docno: 'WPS-Q1' }), sh = wbq.Sheets.Invoice;
      Object.keys(sh).forEach(function (a) { if (a.charAt(0) !== '!') ws.cells[a] = { v: sh[a].v, f: sh[a].f || null, fmt: sh[a].z }; });
      m.setHiddenRows('_door_tags', [SA.splitLine(J(SAMPLE.TPL))]); m.resetLog();
      var model = { sheets: JSON.parse(J(m.sheets)), active: 'Invoice', selected: { sheet: 'Invoice', addr: 'B3' } };
      var injected = '(function(){' + fs.readFileSync(path.join(__dirname, 'sheet_fakes.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'fake_wps.js'), 'utf8') + '\n' +
        'var mdl = FakeWps.fromJSON(' + J(model) + '); window.__fakeModel = mdl; window.Application = FakeWps.app(mdl, { user: "Aminah" });})();';
      var p = await newPage('erp/sheet_addin/taskpane.html?action=stamp', { before: injected });
      await p.waitForFunction(function () { return /RECORDED|NO-OP|REFUSED|INCONCLUSIVE|Could not|did not load/.test(document.getElementById('verdict').textContent); }, { timeout: 20000 }).catch(function () { /* judged below */ });
      var verdictText = await p.evaluate(function () { return document.getElementById('verdict').textContent; });
      var ui = await p.evaluate(function () { var w = document.getElementById('who'), s = window.__fakeModel.sheets._door_history; return { who: w.value, ro: w.readOnly, label: document.getElementById('who-label').textContent, rows: s ? Object.keys(s.cells).length : 0, vis: s ? s.vis : null }; });
      check('Q1', 'picks-wps', 'with a fake WPS Application and no Office.js the pane runs Stamp through the WPS host: RECORDED, the history written into a very hidden sheet of the (fake) workbook', /^RECORDED/.test(verdictText || '') && ui.rows >= 1 && ui.vis === 'VeryHidden', { text: verdictText, ui: ui });
      check('Q1', 'name', 'the name box is read-only and shows Application.UserName ("Aminah"); the label says it comes from WPS', ui.ro === true && ui.who === 'Aminah' && /from WPS/.test(ui.label), ui);
      var ms = p.__reqs.filter(function (r) { return /appsforoffice|microsoft/i.test(r); });
      check('Q1', 'no-ms', 'no request went to a Microsoft host (the pane did not wait on Office.js): ' + p.__reqs.length + ' requests so far', ms.length === 0, { ms: ms });
      await p.click('#b-fileit');
      await p.waitForFunction(function () { return /^(FILED|REFUSED|ERROR|INCONCLUSIVE|NOT-WIRED)/.test(document.getElementById('verdict').textContent); }, { timeout: 180000 }).catch(function () { /* judged below */ });
      var fv = await p.evaluate(function () { return document.getElementById('verdict').textContent; });
      var fp = /^FILED/.test(fv) ? await fingerprint(function (s, pa) { return p.evaluate(function (a, b) { return window.SheetAddinRunner.kernel().q(a, b || []); }, s, pa || []); }, 'WPS-Q1') : '[]';
      var rows = await p.evaluate(function () { var s = window.__fakeModel.sheets._door_ledger; return s ? Object.keys(s.cells).length : 0; });
      var K0 = await K.load(), d = {}; Object.keys(sh).forEach(function (a) { if (a.charAt(0) !== '!' && /^[A-Z]+\d+$/.test(a)) d[a] = typeof sh[a].v === 'number' ? String(sh[a].v) : sh[a].v; }); d.F3 = '2026-11-20';
      var dr = K0.inTrx({ clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness' }, { ws: 'sheet_door' }, function (trx) { return SD.file(trx, { AP: AP, ML: K0.ML }, SAMPLE.TPL, d, { AD_Client_ID: 11, AD_Org_ID: 11 }); });
      var fpd = await fingerprint(async function (s, pa) { return K0.q(s, pa || []); }, 'WPS-Q1');
      check('Q1', 'files', 'File it in the pane over the fake WPS: FILED, a ledger row written (hidden), the invoice has the oracle fingerprint (engine called directly)', /^FILED/.test(fv) && rows >= 1 && fp === fpd && fp !== '[]' && dr.ok, { fv: fv.slice(0, 120), rows: rows, same: fp === fpd, oracle: dr.ok });
      await closePage(p);
    });
    verdict('Q1');
  }

  // ═══ Q2 RESAVE ═══
  if (wants('Q2')) {
    if (SOFFICE) { var csv = path.join(TMP, 'probe.csv'); fs.writeFileSync(csv, 'a,1\n'); var pr0 = cp.spawnSync(SOFFICE, ['-env:UserInstallation=file://' + path.join(TMP, 'lo_probe'), '--headless', '--convert-to', 'xlsx', '--outdir', path.join(TMP, 'lo_probe_out'), csv], { env: cleanEnv, encoding: 'utf8', timeout: 120000 });
      say('§SWPP-STANDIN soffice=' + SOFFICE + ' converts_csv_to_xlsx=' + (fs.existsSync(path.join(TMP, 'lo_probe_out', 'probe.xlsx')) ? 'YES' : 'NO') + ' said="' + String((pr0.stderr || '') + (pr0.stdout || '')).replace(/\s+/g, ' ').trim().slice(-90) + '" -> stand-in = openpyxl ' + OPENPYXL); }
    if (!OPENPYXL || !B.browser) CASES.Q2 = CASES.Q2 || { judged: 0, failed: 0 };
    else await guard('Q2', 'resave', 'a filed + stamped workbook re-saved by openpyxl (stand-in)', async function () {
      LO = resave(WBO, 'a'); check('Q2', 'ran', 'the openpyxl load + save wrote the re-saved file', LO.ok, LO); if (!LO.ok) return;
      var a = readWb(WBO), b = readWb(LO.file), loss = [], names = a.SheetNames.slice();
      check('Q2', 'sheets', 'the same sheets in the same order after the re-save', J(b.SheetNames) === J(names), { a: names, b: b.SheetNames });
      names.filter(function (n) { return /^_door_/.test(n); }).forEach(function (n) { loss.push(n + ' hidden ' + hiddenOf(a, n) + '->' + hiddenOf(b, n)); });
      say('§SWPP-LOSS hidden-state (SheetJS Hidden: 0 visible, 1 hidden, 2 very hidden): ' + loss.join(' | '));
      check('Q2', 'not-visible', 'after the re-save NO _door_* sheet is visible (hidden or very hidden both count; very hidden -> hidden is a measured downgrade, see §SWPP-LOSS)', names.filter(function (n) { return /^_door_/.test(n); }).every(function (n) { return hiddenOf(b, n) >= 1; }), loss);
      ['_door_tags', '_door_ledger', '_door_history'].forEach(function (n) {
        var la = linesOf(a, n), lb = linesOf(b, n), ra = rowsOf(a, n), rb = rowsOf(b, n);
        say('§SWPP-LOSS chunks ' + n + ': rows ' + (ra && ra.length) + '->' + (rb && rb.length) + ' joined lines ' + la.length + '->' + lb.length + ' chars ' + la.map(function (x) { return x.length; }).join(',') + '->' + lb.map(function (x) { return x.length; }).join(',') + ' cells per row ' + J(ra && ra.map(function (r) { return r.length; })) + '->' + J(rb && rb.map(function (r) { return r.length; })));
        check('Q2', 'chunks-' + n, n + ': the joined lines are byte-for-byte the same after the re-save (' + la.length + ' line(s), longest ' + Math.max.apply(null, la.map(function (x) { return x.length; }).concat([0])) + ' chars)', la.length >= 1 && J(la) === J(lb), { a: la.map(function (x) { return x.length; }), b: lb.map(function (x) { return x.length; }) });
      });
      var hl = linesOf(b, '_door_history'), ll = linesOf(b, '_door_ledger');
      check('Q2', 'verify', 'the re-saved history AND ledger still verify (SheetHistory.verify and ws_kernel.verifyJournal)', (await SH.verify(hl)).ok === true && K.verifyJournal(hl.join('\n')).ok === true && (await SH.verify(ll)).ok === true && K.verifyJournal(ll.join('\n')).ok === true, { h: await SH.verify(hl), l: await SH.verify(ll) });
      var ca = cellsOf(a, 'Invoice'), cb = cellsOf(b, 'Invoice'), vd = [], fd = [], zd = [];
      Object.keys(ca).forEach(function (k) { if (J(ca[k].v) !== J((cb[k] || {}).v)) vd.push(k); if ((ca[k].f || null) !== ((cb[k] || {}).f || null)) fd.push(k); if ((ca[k].z || null) !== ((cb[k] || {}).z || null)) zd.push(k + ':' + ca[k].z + '->' + (cb[k] || {}).z); });
      Object.keys(cb).forEach(function (k) { if (!(k in ca)) vd.push('+' + k); });
      say('§SWPP-LOSS Invoice cells=' + Object.keys(ca).length + ' value-diffs=' + J(vd) + ' formula-diffs=' + J(fd) + ' number-format-diffs=' + J(zd.slice(0, 12)));
      var plainDiffs = vd.filter(function (k) { return !ca[k.replace(/^\+/, '')] || !ca[k.replace(/^\+/, '')].f; }), fcells = Object.keys(ca).filter(function (k) { return ca[k].f; });
      check('Q2', 'values', 'every value of the visible Invoice sheet that is NOT a formula result is the same after the re-save (' + (Object.keys(ca).length - fcells.length) + ' cells)', plainDiffs.length === 0, plainDiffs);
      // the formula cells: measured, and the loss attributed (writer or reader) from the saved file itself, read back by the writer's own library
      var fr = cp.spawnSync('python3', ['-c', 'import sys, json, openpyxl\nws = openpyxl.load_workbook(sys.argv[1])["Invoice"]\nprint(json.dumps({k: ws[k].value for k in sys.argv[2:]}))'].concat([LO.file], fcells), { encoding: 'utf8', cwd: TMP }), pyf = fr.status === 0 ? JSON.parse(fr.stdout) : null;
      var lost = fcells.filter(function (k) { return !(cb[k] && (cb[k].f || cb[k].v != null)); });
      say('§SWPP-LIMIT formula-cells ' + J(fcells) + ': after the re-save our reader (SheetJS) sees ' + lost.length + ' of them as EMPTY cells; the saved file still holds the formulas for openpyxl itself: ' + J(pyf) + ' (the writer keeps the formula, writes no cached result; since §12 the reader reads them as formula cells with NO result - sheetStubs - and the door REFUSES them, Q2 page-refuses)');
      check('Q2', 'formula-attribution', 'the formulas are NOT lost by the re-save: the saved file still holds each one (openpyxl reads "=" + the original formula back); what is lost is the cached result, which our reader needs', !!pyf && fcells.every(function (k) { return pyf[k] === '=' + ca[k].f; }), { py: pyf, f: fcells });
      var sub = await XH.create(XLSX, b, { engineValue: EH.engineValue }).readCells('Invoice', ['G20', 'G8']);
      say('§SWPP-LIMIT add-up-check subtotal cell G20 reaches the engine as ' + J(sub.G20) + ' and amount G8 as ' + J(sub.G8) + ' after this re-save: a blank here is only the engine\'s view; the host also says G20 / G8 hold a formula with no saved result (§12), so the filing is refused, not filed unchecked');
      var cd = cellsOf(a, 'Data'), cdb = cellsOf(b, 'Data'), dd = Object.keys(cd).filter(function (k) { return J(cd[k].v) !== J((cdb[k] || {}).v); });
      check('Q2', 'data', 'the 451 text cells of the second visible sheet (accents and a CJK character included) are unchanged', Object.keys(cd).length === 451 && dd.length === 0, dd.slice(0, 5));
      // an astral character (an emoji) in a cell: measured on a small file, the loss attributed to writer or reader
      var aw = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(aw, XLSX.utils.aoa_to_sheet([['emoji \u{1F600} x']]), 'S1'); var AF = writeWb(aw, 'astral.xlsx'), AR = resave(AF, 'c');
      var ap = cp.spawnSync('python3', ['-c', 'import sys, json, openpyxl\nprint(json.dumps([ord(c) for c in openpyxl.load_workbook(sys.argv[1])["S1"]["A1"].value]))', AR.file], { encoding: 'utf8', cwd: TMP }), cps = function (t) { return Array.from(String(t), function (c) { return c.codePointAt(0).toString(16); }).join(' '); };
      var aOrig = readWb(AF).Sheets.S1.A1.v, aBack = readWb(AR.file).Sheets.S1.A1.v, aPy = ap.status === 0 ? JSON.parse(ap.stdout).map(function (n) { return n.toString(16); }).join(' ') : null;
      say('§SWPP-LIMIT astral-character original=[' + cps(aOrig) + '] after-resave-read-by-SheetJS=[' + cps(aBack) + '] after-resave-read-by-openpyxl=[' + aPy + '] (a character beyond U+FFFF stored as an inline string by another writer is read wrongly by erp/xlsx.mini.min.js; Excel and LibreOffice write shared strings, WPS UNKNOWN)');
      check('Q2', 'astral-attribution', 'the astral loss is in OUR READER, not the re-save: openpyxl reads its own saved file back as U+1F600 while SheetJS reads U+F600 (and the same SheetJS reads its own file right)', aPy === cps(aOrig) && cps(aBack) !== cps(aOrig) && cps(aOrig).indexOf('1f600') >= 0, { orig: cps(aOrig), back: cps(aBack), py: aPy });
      // open the re-saved file in the real file_it.html. §12 (D10): the re-saved file holds G8 / G9 / G20 as formulas with NO saved result, so File it REFUSES it, names the cells and files nothing (before §12 it was FILED with the adds-up check silently off).
      var p0 = await newPage('erp/sheet_addin/file_it.html'); await fileReady(p0); await openIn(p0, LO.file); var r0 = await fileItOn(p0), j0 = r0.journal || [];
      check('Q2', 'page-refuses', 'the re-saved workbook opened in file_it.html is REFUSED: the verdict text names G20, G8 and G9 and says "formulas with no saved result" and the checks that did not run; the kernel journal holds only the 1 entry replayed from the workbook (nothing new filed), no download offered for a new entry', r0.verdict === 'REFUSED' && /cells G20, G8 and G9 hold formulas with no saved result/.test(r0.text) && /subtotal=no-saved-result/.test(r0.text) && j0.length === 1, { v: r0.verdict, text: r0.text.slice(0, 260), n: j0.length });
      await closePage(p0);
      // the remedy the message offers (the figures typed in): the SAME file, ledger and hidden sheets as the re-saver wrote them, is FILED, the ledger replays and chains, same books as the original file gives
      var fixed = readWb(LO.file), fsh = fixed.Sheets.Invoice; fsh.G8 = { t: 'n', v: 123.5 }; fsh.G9 = { t: 'n', v: 30 }; fsh.G20 = { t: 'n', v: 153.5 }; var FIXF = path.join(TMP, 'resaved_typed.xlsx'); fs.writeFileSync(FIXF, XLSX.write(fixed, { type: 'buffer', bookType: 'xlsx' }));
      var p = await newPage('erp/sheet_addin/file_it.html'); await fileReady(p); await openIn(p, FIXF); var r = await fileItOn(p), fp = r.verdict === 'FILED' ? await fingerprint(qPage(p), DOCNO_B) : '[]', j = r.journal || [];
      check('Q2', 'page-files', 'with the figures typed in, the re-saved workbook opened in file_it.html is FILED (its _door_tags read, its ledger replayed), the chain has 2 entries (seq 1, 2; the 2nd links to the 1st) and the new invoice has the fingerprint the ORIGINAL file gives in node', r.verdict === 'FILED' && j.length === 2 && JSON.parse(j[0]).seq === 1 && JSON.parse(j[1]).seq === 2 && JSON.parse(j[1]).prev === JSON.parse(j[0]).hash && fp === FP2 && fp !== '[]', { v: r.verdict, text: r.text.slice(0, 160), n: j.length, same: fp === FP2 });
      await closePage(p);
      // the PDF page's .xlsx through the same re-save
      var q = await newPage('pdf/index.html'), TB = path.join(ROOT, 'pdf/corpus/trial_balance_th.pdf');
      await chooseFile(q, '#b-open', TB); await waitLog(q, /^§PDFED-OPEN ok=true/, 20000); await q.click('#b-sheet'); await waitLog(q, /^§PDFWR-HISTORY entries=1/, 20000); await q.click('#b-xlsx');
      var b64 = await q.evaluate(function () { var u = window.PdfPage.state.lastXlsx; if (!u) return null; var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }); await closePage(q);
      check('Q2', 'pdf-xlsx', 'the PDF page produced its .xlsx (Report + hidden _door_source + hidden _door_history)', !!b64, null); if (!b64) return;
      var PX = path.join(TMP, 'pdf_page.xlsx'); fs.writeFileSync(PX, Buffer.from(b64, 'base64')); var pr = resave(PX, 'b'); check('Q2', 'pdf-ran', 'the PDF page .xlsx re-saved by openpyxl', pr.ok, pr); if (!pr.ok) return;
      var pa = readWb(PX), pb = readWb(pr.file), pn = pa.SheetNames.filter(function (n) { return /^_door_/.test(n); }), ph = [];
      pn.forEach(function (n) { ph.push(n + ' ' + hiddenOf(pa, n) + '->' + hiddenOf(pb, n)); }); say('§SWPP-LOSS pdf-page xlsx hidden-state: ' + ph.join(' | ') + ' ; sheets ' + J(pa.SheetNames) + '->' + J(pb.SheetNames));
      var ra2 = cellsOf(pa, 'Report'), rb2 = cellsOf(pb, 'Report'), rd = Object.keys(ra2).filter(function (k) { return J(ra2[k].v) !== J((rb2[k] || {}).v); }), h2 = linesOf(pb, '_door_history');
      var pf = Object.keys(ra2).filter(function (k) { return ra2[k].f; }), pd = Object.keys(ra2).filter(function (k) { return !ra2[k].f && J(ra2[k].v) !== J((rb2[k] || {}).v); });
      say('§SWPP-LIMIT pdf-page formula-cells ' + J(pf) + ' (the totals): formulas with no saved result after the re-save for the same reason as above (read back by xlsx_host.js they are named, never blank); the other ' + (Object.keys(ra2).length - pf.length) + ' report cells are unchanged');
      check('Q2', 'pdf-kept', 'PDF-page workbook after the re-save: the ' + (Object.keys(ra2).length - pf.length) + ' non-formula report cells are unchanged, no _door_* sheet is visible, the history line is byte-for-byte the same and verifies', Object.keys(ra2).length === 144 && pd.length === 0 && pn.length === 2 && pn.every(function (n) { return hiddenOf(pb, n) >= 1; }) && J(linesOf(pa, '_door_history')) === J(h2) && (await SH.verify(h2)).ok === true, { cells: Object.keys(ra2).length, diffs: pd.slice(0, 5), h: ph });
    });
    verdict('Q2');
  }

  // ═══ Q3 MOBILE ═══
  if (wants('Q3')) {
    if (!B.browser) CASES.Q3 = CASES.Q3 || { judged: 0, failed: 0 };
    else {
      await guard('Q3', 'file-it', 'file_it.html at 390x844 touch', async function () {
        var p = await newPage('erp/sheet_addin/file_it.html', { mobile: true, fresh: true }); await fileReady(p); var rb = NET.bytes - p.__n0.b, rr = NET.requests - p.__n0.r, w0 = await widths(p), heap0 = await heapMB(p), cost = await p.evaluate(function () { return window.WsKernelWeb.cost.last; });
        check('Q3', 'emulation', 'the emulation is on (innerWidth 390, pixel ratio 3, touch events): emulation, not a phone', w0.innerW === 390 && w0.dpr === 3 && w0.touch === true, w0);
        check('Q3', 'no-hscroll-load', 'file_it.html: document scrollWidth <= innerWidth on load (no horizontal scroll)', w0.scrollW <= w0.innerW && w0.bodyW <= w0.innerW, w0);
        await openIn(p, WBO, true); var w1 = await widths(p), t1 = Date.now(), r = await fileItOn(p, true), fileMs = Date.now() - t1, w2 = await widths(p), heap1 = await heapMB(p);
        check('Q3', 'file-control', 'the file control accepts a file by touch (tap on the label, real chooser): the page opened wps_filed_stamped.xlsx and still fits', w1.scrollW <= w1.innerW, w1);
        check('Q3', 'files', 'File it by touch gives FILED on the phone-size page', r.verdict === 'FILED', { v: r.verdict, text: r.text.slice(0, 120) });
        check('Q3', 'no-hscroll-result', 'file_it.html with the document and its books on screen: still no horizontal scroll', w2.scrollW <= w2.innerW && w2.bodyW <= w2.innerW, w2);
        say('§DOOR-MOBILE page=file_it.html viewport=390x844 dpr=3 touch=true emulated=true requests=' + rr + ' firstLoadBytes=' + rb + ' (to the engine ready; the page alone was ' + p.__load.bytes + ') bootMs=' + (cost && cost.totalMs) + ' fileMs=' + fileMs + ' jsHeapMBAfterBoot=' + heap0 + ' jsHeapMBAfterFiling=' + heap1 + ' scrollW=' + w2.scrollW + ' innerW=' + w2.innerW + ' (device emulation, not a phone)');
        await closePage(p);
      });
      await guard('Q3', 'pdf', 'pdf/index.html at 390x844 touch', async function () {
        var p = await newPage('pdf/index.html', { mobile: true, fresh: true }), w0 = await widths(p), heap0 = await heapMB(p), TB = path.join(ROOT, 'pdf/corpus/trial_balance_th.pdf');
        check('Q3', 'pdf-no-hscroll-load', 'pdf/index.html: no horizontal scroll on load', w0.scrollW <= w0.innerW && w0.bodyW <= w0.innerW, w0);
        var t0 = Date.now(); await chooseFile(p, '#b-open', TB, true); var o = await waitLog(p, /^§PDFED-OPEN ok=true/, 20000), openMs = Date.now() - t0, w1 = await widths(p);
        check('Q3', 'pdf-opens', 'a PDF chosen through the file control by touch opens (§PDFED-OPEN ok=true) and the page still fits the width', !!o && w1.scrollW <= w1.innerW, { o: o, w1: w1 });
        await p.tap('#b-sheet'); var h = await waitLog(p, /^§PDFWR-HISTORY entries=1/, 20000), rd = p.__logs.filter(function (l) { return /^§SHEET_READER/.test(l); })[0], w2 = await widths(p), heap1 = await heapMB(p);
        check('Q3', 'pdf-sheet', 'Read as sheet by touch: ADDS_UP, 144 cells, and no horizontal scroll with the grid on screen', !!h && /verdict=ADDS_UP/.test(rd || '') && /cells=144 /.test(rd || '') && w2.scrollW <= w2.innerW && w2.bodyW <= w2.innerW, { rd: rd, w2: w2 });
        say('§DOOR-MOBILE page=pdf/index.html viewport=390x844 dpr=3 touch=true emulated=true requests=' + p.__load.requests + ' firstLoadBytes=' + p.__load.bytes + ' openMs=' + openMs + ' jsHeapMBAfterLoad=' + heap0 + ' jsHeapMBAfterRead=' + heap1 + ' scrollW=' + w2.scrollW + ' innerW=' + w2.innerW + ' (device emulation, not a phone)');
        await closePage(p);
      });
    }
    verdict('Q3');
  }
  if (B.browser) await B.browser.close();
  srv.srv.close();
  if (ACTIVE && ACTIVE.file) say('§SWPP-MUTANT-SERVED name=' + ACTIVE.name + ' file=' + ACTIVE.file + ' matches=' + NET.mutantApplied);
  B.console.filter(function (l) { return /^§PAGEERROR/.test(l); }).slice(0, 6).forEach(function (l) { say('  page: ' + l); });
  if (B.external.length) say('§SWPP-EXTERNAL requests refused (left the local tree): ' + B.external.length + ' e.g. ' + B.external.slice(0, 3).join(' | '));

  // ═══ MUTANTS ═══
  var killed = 0;
  if (process.env.SWPP_MUTANTS === '1' && !MUTANT) {
    MUT.forEach(function (m) {
      var env = Object.assign({}, process.env, { SWPP_MUTANT: m.name, SWPP_MUTANTS: '', SWPP_ONLY: m.kills });
      var out = cp.spawnSync(process.execPath, [__filename], { env: env, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 900000 }).stdout || '', applied = /SWPP-MUTANT-SERVED[^\n]*matches=(\d+)/.exec(out);
      var line = (out.match(new RegExp('§SWPP-' + m.kills + ' verdict=\\w+[^\\n]*')) || [''])[0], crashed = new RegExp('case=' + m.kills + ' key=\\S+ FAIL .* got="threw:').test(out), na = m.file && (!applied || applied[1] !== '1'), k = /verdict=FAIL/.test(line) && !crashed && !na;
      if (k) killed++;
      say('§SWPP-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + (na ? 'NOT-APPLIED' : k ? 'KILLED' : crashed ? 'CRASHED(not a kill)' : 'SURVIVED') + ' child="' + line + '"');
    });
    say('§SWPP-MUTANTS killed=' + killed + '/' + MUT.length);
    if (killed !== MUT.length) ALL.failed++;
  }
  var vs = ['Q1', 'Q2', 'Q3'].filter(wants).map(function (c) { var x = CASES[c] || { judged: 0, failed: 0 }; return !x.judged ? 'INCONCLUSIVE' : x.failed ? 'FAIL' : 'PASS'; });
  var overall = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : vs.indexOf('INCONCLUSIVE') >= 0 ? 'INCONCLUSIVE' : 'PASS';
  say('§SWPP-VERDICT ' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(vs) + ' (headless Chromium; fake WPS Application; openpyxl stand-in for the re-save; device emulation; real WPS NOT run)');
  process.exit(overall === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§SWPP-VERDICT FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
