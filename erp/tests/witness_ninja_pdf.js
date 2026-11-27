#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-NINJA-PDF (bim-compiler prompts/SHEET_FRONT_DOOR.md §19: "a report printed by our ERP"). READ THE LOG after every run: every verdict is a §NINJAPDF line;
//   the exit code is not the evidence. A claim that judged nothing prints INCONCLUSIVE, never PASS. A mutant that makes its named claim THROW is CRASHED, not a kill.
// CLAIMS (spec §19, each names the issue it exposes):
//   N1 ROUND TRIP  the trial-balance sample, run from the ERP's own "Excel Report" pill on the rail (Run report -> Download PDF, a real download), is read back by OUR reader
//                  (pdf/report_reader.js over pdf/pdf_open.js + pdf.js) to the SAME cells at the same address with the same text, no extra cell, verdict ADDS_UP   -> a printed report cannot come back
//   N2 THAI        every Thai text cell of the trial balance AND the sales register PDFs is extracted by poppler `pdftotext -raw` exactly as the sheet holds it, SARA AM
//                  included (จำนวนเอกสาร, not จำานวนเอกสาร); the same strings through pdf.js (the reader's extractor)                                       -> the PDF says another word than the sheet
//   N3 ONE PAGE    that PDF opens on the one-page editor (§18, pdf/index.html: its own Open button, a real double-click, typing, Enter), the first number cell
//                  of the report +1.00 is applied (§EDSHEET-EDIT ok=true), our reader reads the new number at the same address and box with every other cell
//                  unchanged, poppler reads it, and the total that no longer agrees is named (DOES_NOT_ADD_UP). Judged only when §18 is on main (a main commit
//                  saying "Edit as a sheet"; "one page" alone also matches #3498, §17's phone page), else INCONCLUSIVE "§18 not merged yet"  -> printed, but not editable
//   N4 LANE        the engine lane's own witnesses stay green: the run_all.sh output named by NINJAPDF_LANE_LOG (W40 B2_browser_run, W41 B2_pill_end_to_end, W42 R_register_*,
//                  W44 X_xtab2, W47 R_replay_* when the private cases exist, W48 W_pill_preflight); no log -> INCONCLUSIVE                                 -> the move broke the engine
//   N5 COST        first visit of the ERP page: the only new requests are the overlay's report_pill.js (bytes logged); "Run report" fetches ExcelJS + the engine and NOT the
//                  PDF writer; the first "Download PDF" fetches PDFKit + the fonts                                                                        -> every visitor pays for a PDF writer
//   N6 ONE ENGINE  erp/overlay/ninja/{ninja_calc,ninja_pdf,ninja_preflight,ninja_report,ninja_template,ninja_template_xlsx}.js are byte-identical to bim-compiler build/erp
//                  (NINJAPDF_SOURCE_REF, default origin/master, read with git show from NINJAPDF_SOURCE_REPO or ~/bim-compiler); unreadable -> INCONCLUSIVE     -> two engines drift
// MUTANTS (NINJAPDF_MUTANTS=1; the server hands the browser a rewritten ninja_pdf.js, the text must match exactly once): M1 SARA AM fix removed -> N2 FAIL;
//   M2 a cell dropped from the PDF -> N1 FAIL.
// Browser: headless Chromium (puppeteer: NINJAPDF_PUPPETEER or ~/bim-compiler/node_modules/puppeteer), --no-sandbox --disable-gpu, DBUS unset, service worker bypassed (every request seen),
//   the REAL erp/idempiere.html?login=GardenAdmin served from this tree (NINJAPDF_LIVE=<site url> = the deployed site). Command: env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_ninja_pdf.js
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..'), MUTANT = process.env.NINJAPDF_MUTANT || '';
var FROM = '2003-01-01', TO = '2003-12-31', RFROM = '2002-01-01', RTO = '2026-12-31';
var ENGINE = ['ninja_calc', 'ninja_pdf', 'ninja_preflight', 'ninja_report', 'ninja_template', 'ninja_template_xlsx'];
var MUT = [
  { name: 'M1-sara-am-fix-removed', kills: 'N2', file: 'erp/overlay/ninja/ninja_pdf.js', from: 'if (r.am) amDraw(doc, r.t, tx, ty); else doc.text(r.t, tx, ty, { lineBreak: false });', to: 'doc.text(r.t, tx, ty, { lineBreak: false });' },
  { name: 'M2-cell-dropped-from-pdf', kills: 'N1', file: 'erp/overlay/ninja/ninja_pdf.js', from: "if (c.t === 'z' || (c.t === 's' && c.v === '')) return;", to: "if (c.t === 'z' || (c.t === 's' && c.v === '') || k === 'D6') return;" }
];
var ACTIVE = MUTANT ? MUT.filter(function (m) { return m.name === MUTANT; })[0] : null;
var CASES = {}, ALL = { judged: 0, failed: 0 }, INC = {};
function J(x) { return JSON.stringify(x); }
function say(s) { console.log(s); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0, threw: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §NINJAPDF-CHECK claim=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 900)));
}
async function guard(cs, key, fn) { try { await fn(); } catch (e) { check(cs, key, 'the claim runs', false, 'threw: ' + String(e && (e.stack || e.message) || e).slice(0, 600)); CASES[cs].threw++; } }
function verdict(cs, measured) {
  var c = CASES[cs] || { judged: 0, failed: 0, threw: 0 }, v = INC[cs] ? 'INCONCLUSIVE' : !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS';
  say('§NINJAPDF-' + cs + ' ' + v + ' ' + (INC[cs] ? '"' + INC[cs] + '" ' : '') + (measured || '') + ' judged=' + c.judged + ' failed=' + c.failed + ' threw=' + c.threw + (MUTANT ? ' mutant=' + MUTANT : ''));
  return v;
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ── the static server: this tree, as GitHub Pages serves it; every request recorded ──
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png' };
var NET = { log: [], mutantApplied: null };
function serve() {
  return new Promise(function (res) {
    var srv = http.createServer(function (req, rsp) {
      var rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), f = path.join(ROOT, rel);
      if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || !fs.statSync(f).isFile()) { rsp.writeHead(404); rsp.end(); return; }
      var body = fs.readFileSync(f);
      if (ACTIVE && rel === ACTIVE.file) { var txt = body.toString('utf8'), n = txt.split(ACTIVE.from).length - 1; NET.mutantApplied = n; if (n === 1) body = Buffer.from(txt.replace(ACTIVE.from, ACTIVE.to)); }
      NET.log.push({ rel: rel, bytes: body.length });
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-cache' }); rsp.end(body);
    });
    srv.listen(0, '127.0.0.1', function () { res({ srv: srv, base: 'http://127.0.0.1:' + srv.address().port + '/' }); });
  });
}
var NEW = /^(erp\/overlay\/ninja\/|common\/pdfwriter\/|viewer\/lib\/exceljs)/;
function fetched(from, re) { return NET.log.slice(from).filter(function (r) { return re.test(r.rel); }); }
function sum(list) { return list.reduce(function (a, r) { return a + r.bytes; }, 0); }
function names(list) { return list.map(function (r) { return r.rel; }).filter(function (x, i, a) { return a.indexOf(x) === i; }); }

// ── the Output sheet the PDF was printed from, as printed text (the same rule ninja_pdf.js draws with) ──
function sheetCells(page) {
  return page.evaluate(function () {
    var res = window.NinjaPill.__report.last(), m = res.model, ws = m.Sheets.Output, st = m._styles || {}, X = window.XLSX, out = [];
    Object.keys(ws).forEach(function (k) {
      if (k[0] === '!') return; var c = ws[k]; if (!c || c.t === 'z' || (c.t === 's' && c.v === '')) return;
      var s = c.s != null ? st[c.s] : null, text = c.t === 'n' ? X.SSF.format((s && s.numFmt) || c.z || 'General', c.v) : c.t === 'b' ? (c.v ? 'TRUE' : 'FALSE') : String(c.v);
      out.push({ cell: k, t: c.t, v: c.v, text: text });
    });
    return out;
  });
}
async function waitFile(dir, re, ms) { var t = Date.now(); while (Date.now() - t < ms) { var f = fs.readdirSync(dir).filter(function (n) { return re.test(n) && !/\.crdownload$/.test(n); }); if (f.length) { await sleep(300); return path.join(dir, f[0]); } await sleep(200); } return null; }
async function runSample(page, id, from, to, dl) {
  if (!(await page.$('#ninja-panel'))) {   // the user's way in: the "Excel Report" pill on the rail (contributed by the built-in bundle plugins/ninja_excel.mjs)
    await page.waitForSelector('#pill-ninja', { timeout: 60000 });
    await page.evaluate(function () { var dock = document.getElementById('idmp-pill'), trig = document.querySelector('#idmp-pill-trigger,[data-pill-trigger]');
      if (dock && trig && getComputedStyle(dock).display === 'none') trig.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      document.getElementById('pill-ninja').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  }
  await page.waitForSelector('#np-sample-' + id, { timeout: 20000 }); await sleep(300);
  await page.evaluate(function (i) { document.getElementById('np-sample-' + i).click(); }, id);   // a fresh lookup: the panel may have been re-drawn since
  await page.waitForFunction(function () { var o = document.getElementById('np-out'); return o && /Report template/.test(o.textContent) && document.getElementById('np-run'); }, { timeout: 20000 });
  await page.evaluate(function (f, t) { document.getElementById('np-from').value = f; document.getElementById('np-to').value = t; }, from, to);
  var n0 = NET.log.length;
  await page.evaluate(function () { document.getElementById('np-run').click(); }); await page.waitForSelector('#np-rep-sum, #np-rep span[style*="ff9b9b"]', { timeout: 90000 });
  var err = await page.evaluate(function () { var e = document.querySelector('#np-rep span[style*="ff9b9b"]'); return e ? e.textContent : null; });
  if (err) throw new Error('report run failed: ' + err);
  var afterRun = fetched(n0, NEW), cells = await sheetCells(page), n1 = NET.log.length;
  var before = fs.readdirSync(dl);
  await page.evaluate(function () { document.getElementById('np-dl-pdf').click(); });
  var t0 = Date.now(), file = null;
  while (!file && Date.now() - t0 < 90000) { var f = fs.readdirSync(dl).filter(function (n) { return before.indexOf(n) < 0 && /\.pdf$/.test(n); }); if (f.length) { await sleep(400); file = path.join(dl, f[0]); } else await sleep(200); }
  return { cells: cells, afterRun: afterRun, afterPdf: fetched(n1, NEW), pdf: file };
}

// N3 driver: the §18 page as the user meets it (its own Open button, a real double-click, typing, Enter); the first number cell of the report, +1.00
async function oneOnPage(B, base, tb) {
  var c = tb.cells.filter(function (x) { return x.t === 'n' && /^\d{1,3}(,\d{3})*\.\d\d$/.test(x.text) && /^[C-F]\d+$/.test(x.cell) && Number(x.cell.slice(1)) >= 6; })[0]; if (!c) return null;
  var neu = (Math.round(c.v * 100) + 100) / 100, txt = neu.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var p = await B.newPage(), logs = []; p.on('console', function (m) { logs.push(m.text()); }); await p.setViewport({ width: 1500, height: 950 });
  var waitLog = async function (re, from, ms) { for (var t = 0; t < (ms || 20000); t += 50) { var l = logs.slice(from).filter(function (x) { return re.test(x); })[0]; if (l) return l; await sleep(50); } return null; };
  await p.goto(base + 'pdf/index.html', { waitUntil: 'load' });
  var r = await Promise.all([p.waitForFileChooser(), p.click('#b-open')]); await r[0].accept([tb.pdf]);
  var open = await waitLog(/^§PDFED-OPEN ok=true/, 0, 30000), layer = await waitLog(/^§EDSHEET-LAYER/, 0, 30000), sel = '.el-t[data-cell="' + c.cell + '"][data-kind="cell"]';
  await p.waitForSelector(sel, { timeout: 15000 }); await p.$eval(sel, function (e) { e.scrollIntoView({ block: 'center' }); }); await sleep(150);
  var at = await p.$eval(sel, function (e) { var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }), n = logs.length;
  await p.mouse.click(at.x, at.y, { clickCount: 2 }); await p.waitForSelector('.el-ed input', { timeout: 5000 });
  await p.$eval('.el-ed input', function (i) { i.select(); }); await p.keyboard.type(txt); await p.keyboard.press('Enter');
  var edit = await waitLog(/^§EDSHEET-EDIT /, n, 15000); await waitLog(/^§EDSHEET-LAYER/, n, 15000); await sleep(200);
  var b64 = await p.evaluate(function () { var u = window.PdfPage.state.bytes; if (!u) return null; var s = ''; for (var i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); });
  await p.close();
  return { cell: c.cell, old: c.text, neu: txt, open: open, layer: layer, edit: edit, bytes: b64 ? new Uint8Array(Buffer.from(b64, 'base64')) : null };
}

var PUP = null; try { PUP = require(process.env.NINJAPDF_PUPPETEER || path.join(os.homedir(), 'bim-compiler/node_modules/puppeteer')); } catch (e) { PUP = null; }
(async function main() {
  var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ninjapdf-')), dl = path.join(TMP, 'dl'); fs.mkdirSync(dl);
  say('§NINJAPDF-LOAD tree=' + ROOT + ' mutant=' + (MUTANT || 'none') + ' puppeteer=' + (PUP ? 'yes' : 'NO (N1 N2 N5 judge nothing)'));
  if (MUTANT && !ACTIVE) { say('§NINJAPDF-VERDICT INCONCLUSIVE unknown mutant ' + MUTANT); process.exit(3); }

  // N6 first: one engine (no browser needed)
  await guard('N6', 'sync', async function () {
    var repo = process.env.NINJAPDF_SOURCE_REPO || path.join(os.homedir(), 'bim-compiler'), ref = process.env.NINJAPDF_SOURCE_REF || 'origin/master', same = [], diff = [], gone = [];
    ENGINE.forEach(function (f) {
      var src = null; try { src = cp.execFileSync('git', ['-C', repo, 'show', ref + ':build/erp/' + f + '.js'], { maxBuffer: 1 << 26 }); } catch (e) { gone.push(f); return; }
      (Buffer.compare(src, fs.readFileSync(path.join(ERP, 'overlay/ninja', f + '.js'))) === 0 ? same : diff).push(f);
    });
    if (gone.length === ENGINE.length) { INC.N6 = 'build/erp not readable at ' + repo + ' ' + ref; return; }
    check('N6', 'identical', 'every engine file in erp/overlay/ninja equals bim-compiler ' + ref + ':build/erp (' + same.length + ' of ' + ENGINE.length + ')', same.length === ENGINE.length, { diff: diff, missing: gone });
  });

  var LIVE = process.env.NINJAPDF_LIVE || '';   // e.g. https://red1oon.github.io/bim-ootb/ : the deployed site instead of this tree (requests recorded from the page; no mutant)
  var N3 = null;
  var S = LIVE ? { base: LIVE.replace(/\/?$/, '/'), srv: { close: function () {} } } : await serve(), B = null, page = null, first = null, tb = null, reg = null;
  if (LIVE) say('§NINJAPDF-LIVE base=' + S.base);
  try {
    if (PUP) {
      B = await PUP.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'], env: (function () { var e = Object.assign({}, process.env); delete e.DBUS_SESSION_BUS_ADDRESS; return e; })() });
      page = await B.newPage(); await page.setBypassServiceWorker(true);
      var logs = []; page.on('console', function (m) { var t = m.text(); if (/^§(NINJA|PREFLIGHT|SQL_SUMMARY|OVERLAY)/.test(t)) logs.push(t); }); page.on('pageerror', function (e) { logs.push('§PAGEERROR ' + String(e && e.message).slice(0, 200)); });
      if (LIVE) page.on('response', function (r) { var u = r.url(); if (u.indexOf(S.base) !== 0) return; var rel = decodeURIComponent(u.slice(S.base.length).split('?')[0]); var e = { rel: rel, bytes: Number(r.headers()['content-length'] || 0) }; NET.log.push(e);
        if (NEW.test(rel)) r.buffer().then(function (b) { e.bytes = b.length; }).catch(function () {}); });
      var cdp = await page.target().createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
      await page.goto(S.base + 'erp/idempiere.html?login=GardenAdmin', { waitUntil: 'networkidle2', timeout: 120000 });
      await page.waitForFunction(function () { return !!(window.NinjaPill && window.NinjaPill.__report && window.__idmpDb); }, { timeout: 60000 });
      await sleep(1500);
      first = { reqs: fetched(0, NEW), all: NET.log.length };
      await guard('N1', 'tb-run', async function () { tb = await runSample(page, 'tb', FROM, TO, dl); });
      await guard('N2', 'reg-run', async function () { reg = await runSample(page, 'reg', RFROM, RTO, dl); });
      if (tb && tb.pdf && fs.existsSync(path.join(ROOT, 'pdf/edit_layer.js'))) { try { N3 = await oneOnPage(B, S.base, tb); } catch (e) { say('  §NINJAPDF-N3-ERROR ' + String(e && (e.stack || e.message)).slice(0, 400)); } }
      logs.filter(function (l) { return /§NINJA_REPORT_(LOAD|RUN|DONE|PDF)|§NINJA-REPORT-PILL|§PREFLIGHT_SUMMARY|§SQL_SUMMARY|§PAGEERROR/.test(l); }).forEach(function (l) { say('  ' + l); });
    }
  } catch (e) { say('  §NINJAPDF-BROWSER-ERROR ' + String(e && (e.stack || e.message)).slice(0, 600)); }
  if (B) await B.close(); S.srv.close();
  if (ACTIVE) say('§NINJAPDF-MUTANT-APPLIED ' + ACTIVE.name + ' matches=' + NET.mutantApplied);

  // N1: our reader reads the downloaded PDF back to the sheet that printed it
  await guard('N1', 'read', async function () {
    if (!tb || !tb.pdf) { if (!PUP) INC.N1 = 'no browser'; else check('N1', 'download', 'Download PDF delivered a .pdf file', false, tb); return; }
    var l0 = console.log, w0 = console.warn; console.log = function () {}; console.warn = function () {};
    var pdfjs = require(path.join(ROOT, 'modeller/lib/pdfjs/pdf.min.js')); pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'modeller/lib/pdfjs/pdf.worker.min.js');
    var PO = require(path.join(ROOT, 'pdf/pdf_open.js')), RR = require(path.join(ROOT, 'pdf/report_reader.js'));
    var doc = await PO.open(pdfjs, new Uint8Array(fs.readFileSync(tb.pdf))), R = doc.ok ? RR.read(doc.items) : null; console.log = l0; console.warn = w0;
    var want = {}; tb.cells.forEach(function (c) { want[c.cell] = c; });
    var miss = [], extra = [];
    if (R) { Object.keys(want).forEach(function (a) { var g = R.sheet[a]; if (!g || g.text !== want[a].text.trim()) miss.push(a + ' want "' + want[a].text.trim() + '" got ' + (g ? '"' + g.text + '"' : 'nothing')); });
      Object.keys(R.sheet).forEach(function (a) { if (!want[a]) extra.push(a + '="' + R.sheet[a].text + '"'); }); }
    say('  §NINJAPDF-N1-FACT pdf=' + path.basename(tb.pdf) + ' bytes=' + fs.statSync(tb.pdf).size + ' pages=' + (doc && doc.pages) + ' sheetCells=' + tb.cells.length + ' read=' + (R ? Object.keys(R.sheet).length : 0) + ' sameAddressAndText=' + (tb.cells.length - miss.length) + ' extra=' + extra.length + ' verdict=' + (R && R.verdict) + (R && R.reason ? ' reason="' + R.reason + '"' : ''));
    check('N1', 'population', 'the trial balance printed cells to judge (more than 40)', tb.cells.length > 40, tb.cells.length);
    check('N1', 'opens', 'pdf.js opens the downloaded PDF, one page', !!(doc && doc.ok && doc.pages === 1), doc && { ok: doc.ok, pages: doc.pages });
    check('N1', 'same-cells', 'every sheet cell is read back at the same address with the same text (' + (tb.cells.length - miss.length) + ' of ' + tb.cells.length + ')', R && miss.length === 0, miss.slice(0, 8));
    check('N1', 'no-extra', 'no cell is read that the sheet does not hold', R && extra.length === 0, extra.slice(0, 8));
    check('N1', 'adds-up', 'the reader finds the totals by arithmetic: verdict ADDS_UP', R && R.verdict === 'ADDS_UP', R && { verdict: R.verdict, reason: R.reason });
  });
  verdict('N1');

  // N2: Thai labels through poppler (pdftotext -raw) and pdf.js, SARA AM included
  await guard('N2', 'thai', async function () {
    var runs = [['trial-balance', tb], ['sales-register', reg]].filter(function (x) { return x[1] && x[1].pdf; });
    if (!runs.length) { INC.N2 = PUP ? 'no PDF was downloaded' : 'no browser'; return; }
    var l0 = console.log, w0 = console.warn; console.log = function () {}; console.warn = function () {};
    var pdfjs = require(path.join(ROOT, 'modeller/lib/pdfjs/pdf.min.js')); pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'modeller/lib/pdfjs/pdf.worker.min.js'); var PO = require(path.join(ROOT, 'pdf/pdf_open.js'));
    console.log = l0; console.warn = w0;
    var am = 0;
    for (var i = 0; i < runs.length; i++) {
      var nm = runs[i][0], r = runs[i][1], raw = cp.spawnSync('pdftotext', ['-raw', r.pdf, '-'], { encoding: 'utf8' }).stdout || '';
      console.log = function () {}; var d = await PO.open(pdfjs, new Uint8Array(fs.readFileSync(r.pdf))); console.log = l0;
      var pj = d.ok ? d.items[0].map(function (x) { return x.s; }).join('') : '';
      var thai = r.cells.filter(function (c) { return c.t === 's' && /[ก-๛]/.test(c.text); }), badP = [], badJ = [];
      thai.forEach(function (c) {
        var s = c.text.trim(); if (/ำ/.test(s)) am++;
        if (raw.split('\n').map(function (l) { return l.trim(); }).join('\n').indexOf(s) < 0) badP.push(c.cell + ' "' + s + '"');
        if (pj.replace(/\s+/g, '').indexOf(s.replace(/\s+/g, '')) < 0) badJ.push(c.cell + ' "' + s + '"');
      });
      var amLine = raw.split('\n').filter(function (l) { return /จำ|จำา/.test(l); })[0];
      say('  §NINJAPDF-N2-FACT pdf=' + nm + ' thaiCells=' + thai.length + ' popplerEqual=' + (thai.length - badP.length) + ' pdfjsEqual=' + (thai.length - badJ.length) + (amLine ? ' saraAmLine="' + amLine.trim() + '"' : ''));
      check('N2', nm + '-poppler', 'every Thai cell of the ' + nm + ' is in pdftotext -raw exactly (' + (thai.length - badP.length) + ' of ' + thai.length + ')', thai.length > 0 && badP.length === 0, badP.slice(0, 6));
      check('N2', nm + '-pdfjs', 'every Thai cell of the ' + nm + ' is in the pdf.js text the reader reads (' + (thai.length - badJ.length) + ' of ' + thai.length + ')', thai.length > 0 && badJ.length === 0, badJ.slice(0, 6));
    }
    check('N2', 'sara-am-population', 'at least one judged Thai cell holds SARA AM (the defect\'s own word)', am > 0, am);
  });
  verdict('N2');

  // N3: §18 one-page editor - only when it is on main: the engine's own PDF opened on pdf/index.html, one number typed on the page, the result read back
  var s18 = ''; try { s18 = cp.execSync('git -C ' + JSON.stringify(ROOT) + ' log origin/main --oneline | grep -i "edit as a sheet" | head -1', { encoding: 'utf8' }).trim(); } catch (e) { s18 = ''; }
  if (!s18 || !fs.existsSync(path.join(ROOT, 'pdf/edit_layer.js'))) INC.N3 = '§18 not merged yet';
  else if (!N3) INC.N3 = PUP ? 'the one-page run did not happen (no trial-balance PDF)' : 'no browser';
  else await guard('N3', 'edit', async function () {
    say('  §NINJAPDF-N3-FACT §18=' + s18.slice(0, 9) + ' cell=' + N3.cell + ' old="' + N3.old + '" new="' + N3.neu + '" layer="' + (N3.layer || '').slice(0, 140) + '" edit="' + (N3.edit || '').slice(0, 160) + '"');
    check('N3', 'opens', 'pdf/index.html opens the engine\'s PDF and lays the edit layer over it (§PDFED-OPEN ok=true, §EDSHEET-LAYER)', !!N3.open && !!N3.layer, { open: N3.open, layer: N3.layer });
    check('N3', 'edit-applies', 'the number typed on the page is applied: §EDSHEET-EDIT cell=' + N3.cell + ' ok=true old="' + N3.old + '" new="' + N3.neu + '"', !!N3.edit && new RegExp('cell=' + N3.cell + ' .*ok=true old="' + N3.old.replace(/[.()]/g, '\\$&') + '" new="' + N3.neu.replace(/[.()]/g, '\\$&') + '"').test(N3.edit), N3.edit);
    if (!N3.bytes) return;
    var l0 = console.log, w0 = console.warn; console.log = function () {}; console.warn = function () {};
    var pdfjs = require(path.join(ROOT, 'modeller/lib/pdfjs/pdf.min.js')); pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'modeller/lib/pdfjs/pdf.worker.min.js');
    var PO = require(path.join(ROOT, 'pdf/pdf_open.js')), RR = require(path.join(ROOT, 'pdf/report_reader.js'));
    var d0 = await PO.open(pdfjs, new Uint8Array(fs.readFileSync(tb.pdf))), d1 = await PO.open(pdfjs, N3.bytes); console.log = l0; console.warn = w0;
    var R0 = RR.read(d0.items), R1 = RR.read(d1.items), k0 = Object.keys(R0.sheet).sort(), k1 = Object.keys(R1.sheet).sort();
    var others = k0.filter(function (a) { return a !== N3.cell && (!R1.sheet[a] || R1.sheet[a].text !== R0.sheet[a].text); });
    var dx = R1.map[N3.cell] && R0.map[N3.cell] ? Math.abs(R1.map[N3.cell].box[2] - R0.map[N3.cell].box[2]) : NaN;
    var f = path.join(path.dirname(tb.pdf), 'edited.pdf'); fs.writeFileSync(f, N3.bytes); var T = cp.spawnSync('pdftotext', ['-raw', f, '-'], { encoding: 'utf8' }).stdout || '';
    var cnt = function (t, x) { return t.split(x).length - 1; }, T0 = cp.spawnSync('pdftotext', ['-raw', tb.pdf, '-'], { encoding: 'utf8' }).stdout || '';
    say('  §NINJAPDF-N3-READ cells=' + k1.length + ' ' + N3.cell + '="' + (R1.sheet[N3.cell] && R1.sheet[N3.cell].text) + '" othersChanged=' + others.length + ' rightEdgeMoved=' + (isNaN(dx) ? '?' : dx.toFixed(3)) + 'pt verdict=' + R1.verdict + (R1.reason ? ' reason="' + R1.reason.slice(0, 120) + '"' : '') + ' poppler new=' + cnt(T, N3.neu) + ' old=' + cnt(T, N3.old) + ' (before: old=' + cnt(T0, N3.old) + ')');
    check('N3', 'reader-new', 'our reader reads the new number at ' + N3.cell + ', the same ' + k0.length + ' addresses, every other cell unchanged', R1.sheet[N3.cell] && R1.sheet[N3.cell].text === N3.neu && JSON.stringify(k0) === JSON.stringify(k1) && !others.length, { got: R1.sheet[N3.cell], others: others.slice(0, 5) });
    check('N3', 'same-box', 'the edited cell keeps its right edge (moved <= 0.01 pt)', dx <= 0.01, dx);
    check('N3', 'poppler-new', 'poppler reads the new number once more and the old one once less', cnt(T, N3.neu) === cnt(T0, N3.neu) + 1 && cnt(T, N3.old) === cnt(T0, N3.old) - 1, { neu: [cnt(T0, N3.neu), cnt(T, N3.neu)], old: [cnt(T0, N3.old), cnt(T, N3.old)] });
    check('N3', 'total-named', 'the total that no longer agrees is NAMED by the reader (verdict DOES_NOT_ADD_UP)', R1.verdict === 'DOES_NOT_ADD_UP', R1.verdict);
  });
  verdict('N3');

  // N4: the lane's own witnesses, from the run_all.sh output named by NINJAPDF_LANE_LOG
  await guard('N4', 'lane', async function () {
    var f = process.env.NINJAPDF_LANE_LOG; if (!f || !fs.existsSync(f)) { INC.N4 = 'no run_all.sh log (set NINJAPDF_LANE_LOG)'; return; }
    var lines = fs.readFileSync(f, 'utf8').split('\n'), ok = {}, bad = lines.filter(function (l) { return /^BAD /.test(l); });
    lines.forEach(function (l) { var m = /^ok\s+(\S+)\s+(PASS|FAIL|INCONCLUSIVE)/.exec(l); if (m) ok[m[1]] = m[2]; });
    var need = ['B2_browser_run', 'B2_NEG_browser_run', 'B2_pill_end_to_end', 'B2_NEG_pill', 'W_pill_preflight', 'R_register_big', 'R_NEG_register', 'X_xtab2', 'X_NEG_xtab2'];
    var replay = Object.keys(ok).filter(function (k) { return /^R_replay_/.test(k); });
    say('  §NINJAPDF-N4-FACT log=' + path.basename(f) + ' gatesOk=' + Object.keys(ok).length + ' bad=' + bad.length + ' W47replay=' + (replay.length ? replay.join(',') : 'absent (private cases not on this machine)'));
    check('N4', 'named', 'W40/W41/W42/W44/W48 gates and their negative controls print their expected verdict (' + need.filter(function (k) { return ok[k]; }).length + ' of ' + need.length + ')', need.every(function (k) { return ok[k]; }), need.filter(function (k) { return !ok[k]; }));
    var mine = /^BAD\s+(B2_|W_|R_register|R_NEG_register|R_VACUOUS|R_replay_|X_)/, badN4 = bad.filter(function (l) { return mine.test(l); }), other = bad.filter(function (l) { return !mine.test(l); });
    if (other.length) say('  §NINJAPDF-N4-OUTSIDE gates outside W40/W41/W42/W44/W47/W48 that are BAD (not judged here, named): ' + other.map(function (l) { return l.split(/\s+/)[1]; }).join(','));
    check('N4', 'no-bad', 'no W40/W41/W42/W44/W47/W48 gate of run_all.sh is BAD', badN4.length === 0, badN4.slice(0, 6));
  });
  verdict('N4');

  // N5: what each step fetched
  await guard('N5', 'cost', async function () {
    if (!first) { INC.N5 = 'no browser'; return; }
    var pills = fs.readFileSync(path.join(ERP, 'overlay/pills.js')).length, pillsMain = null;
    try { pillsMain = cp.execFileSync('git', ['-C', ROOT, 'show', 'origin/main:erp/overlay/pills.js']).length; } catch (e) { pillsMain = null; }
    var firstNew = names(first.reqs), added = sum(first.reqs) + (pillsMain == null ? 0 : pills - pillsMain);
    say('  §NINJAPDF-N5-FACT firstVisitRequests=' + first.all + ' newFiles=' + firstNew.join(',') + ' bytesAdded=' + added + ' (report_pill.js ' + sum(first.reqs) + ' + pills.js ' + (pillsMain == null ? '?' : (pills - pillsMain)) + ')' +
      (tb ? ' run=' + names(tb.afterRun).map(function (x) { return x.split('/').pop(); }).join(',') + ' runBytes=' + sum(tb.afterRun) + ' pdf=' + names(tb.afterPdf).map(function (x) { return x.split('/').pop(); }).join(',') + ' pdfBytes=' + sum(tb.afterPdf) : ''));
    check('N5', 'first-visit', 'the first visit fetches report_pill.js and nothing else of the report (no engine, no ExcelJS, no PDFKit, no font)', firstNew.length === 1 && firstNew[0] === 'erp/overlay/ninja/report_pill.js', firstNew);
    if (!tb) return;
    var run = names(tb.afterRun), pdf = names(tb.afterPdf);
    check('N5', 'run-no-pdf-writer', '"Run report" fetches ExcelJS + the engine and NOT PDFKit or a font', run.some(function (x) { return /exceljs/.test(x); }) && run.some(function (x) { return /ninja_template\.js$/.test(x); }) && !run.some(function (x) { return /pdfkit|common\/pdfwriter|ninja_pdf/.test(x); }), run);
    check('N5', 'pdf-on-demand', 'the first "Download PDF" fetches PDFKit, ninja_pdf.js and the six fonts', pdf.some(function (x) { return /pdfkit\.standalone/.test(x); }) && pdf.some(function (x) { return /ninja_pdf\.js$/.test(x); }) && pdf.filter(function (x) { return /common\/pdfwriter\/fonts\//.test(x); }).length === 6, pdf);
    if (reg) check('N5', 'once', 'the second report fetches nothing of the report again', names(reg.afterRun).length === 0 && names(reg.afterPdf).filter(function (x) { return !/samples\//.test(x); }).length === 0, { run: names(reg.afterRun), pdf: names(reg.afterPdf) });
  });
  verdict('N5');
  verdict('N6');

  var vs = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'].map(function (c) { var x = CASES[c] || {}; return c + '=' + (INC[c] ? 'INCONCLUSIVE' : !x.judged ? 'INCONCLUSIVE' : x.failed ? 'FAIL' : 'PASS'); });
  var anyFail = vs.some(function (v) { return /FAIL/.test(v); }), anyPass = vs.some(function (v) { return /PASS/.test(v); });

  // mutants: each must turn its named claim FAIL (a crash is not a kill)
  if (process.env.NINJAPDF_MUTANTS === '1' && !MUTANT) {
    var killed = 0;
    MUT.forEach(function (m) {
      var out = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { NINJAPDF_MUTANT: m.name, NINJAPDF_MUTANTS: '' }), encoding: 'utf8', maxBuffer: 1 << 26 }).stdout || '';
      var line = (out.match(new RegExp('^§NINJAPDF-' + m.kills + ' \\S+.*$', 'm')) || [''])[0], applied = (out.match(/§NINJAPDF-MUTANT-APPLIED \S+ matches=(\S+)/) || [])[1];
      var k = applied === '1' && /^§NINJAPDF-\S+ FAIL/.test(line) && !/threw=[1-9]/.test(line);
      if (k) killed++;
      say('  §NINJAPDF-MUTANT ' + m.name + ' applied=' + applied + ' -> ' + (k ? 'KILLED' : 'SURVIVED') + ' ' + line.slice(0, 200));
      (out.match(/§NINJAPDF-N2-FACT[^\n]*/g) || []).forEach(function (l) { if (m.kills === 'N2') say('    ' + l); });
      (out.match(/§NINJAPDF-N1-FACT[^\n]*/g) || []).forEach(function (l) { if (m.kills === 'N1') say('    ' + l); });
    });
    say('§NINJAPDF-MUTANTS killed=' + killed + '/' + MUT.length);
    if (killed < MUT.length) anyFail = true;
  }
  say('§NINJAPDF-VERDICT ' + (anyFail ? 'FAIL' : anyPass ? 'PASS' : 'INCONCLUSIVE') + ' ' + vs.join(' ') + ' judged=' + ALL.judged + ' failed=' + ALL.failed);
  process.exit(anyFail ? 1 : anyPass ? 0 : 3);
})();
