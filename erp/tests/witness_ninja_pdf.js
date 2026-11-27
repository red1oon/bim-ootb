#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-NINJA-PDF (bim-compiler prompts/SHEET_FRONT_DOOR.md §19: "a report printed by our ERP"). READ THE LOG after every run: every verdict is a §NINJAPDF line;
//   the exit code is not the evidence. A claim that judged nothing prints INCONCLUSIVE, never PASS. A mutant that makes its named claim THROW is CRASHED, not a kill.
// CLAIMS (spec §19, each names the issue it exposes):
//   N1 ROUND TRIP  the trial-balance sample, run from the ERP's own "Excel Report" pill (Run report -> Download PDF, a real download), is read back by OUR reader
//                  (pdf/report_reader.js over pdf/pdf_open.js + pdf.js) to the SAME cells at the same address with the same text, no extra cell, verdict ADDS_UP   -> a printed report cannot come back
//   N2 THAI        every Thai text cell of the trial balance AND the sales register PDFs is extracted by poppler `pdftotext -raw` exactly as the sheet holds it, SARA AM
//                  included (จำนวนเอกสาร, not จำานวนเอกสาร); the same strings through pdf.js (the reader's extractor)                                       -> the PDF says another word than the sheet
//   N3 ONE PAGE    the PDF opens on the one-page editor (§18) and a number edit round-trips - judged only when §18 is on main (a main commit saying "Edit as a sheet";
//                  "one page" alone also matches #3498, the phone page of §17), else INCONCLUSIVE "§18 not merged yet"
//   N4 LANE        the engine lane's own witnesses stay green: the run_all.sh output named by NINJAPDF_LANE_LOG (W40 B2_browser_run, W41 B2_pill_end_to_end, W42 R_register_*,
//                  W44 X_xtab2, W47 R_replay_* when the private cases exist, W48 W_pill_preflight); no log -> INCONCLUSIVE                                 -> the move broke the engine
//   N5 COST        first visit of the ERP page: the only new requests are the overlay's report_pill.js (bytes logged); "Run report" fetches ExcelJS + the engine and NOT the
//                  PDF writer; the first "Download PDF" fetches PDFKit + the fonts                                                                        -> every visitor pays for a PDF writer
//   N6 ONE ENGINE  erp/overlay/ninja/{ninja_calc,ninja_pdf,ninja_preflight,ninja_report,ninja_template,ninja_template_xlsx}.js are byte-identical to bim-compiler build/erp
//                  (NINJAPDF_SOURCE_REF, default origin/master, read with git show from NINJAPDF_SOURCE_REPO or ~/bim-compiler); unreadable -> INCONCLUSIVE     -> two engines drift
// MUTANTS (NINJAPDF_MUTANTS=1; the server hands the browser a rewritten ninja_pdf.js, the text must match exactly once): M1 SARA AM fix removed -> N2 FAIL;
//   M2 a cell dropped from the PDF -> N1 FAIL.
// Browser: headless Chromium (puppeteer: NINJAPDF_PUPPETEER or ~/bim-compiler/node_modules/puppeteer), --no-sandbox --disable-gpu, DBUS unset, service worker bypassed (every request seen),
//   the REAL erp/idempiere.html?login=GardenAdmin served from this tree. Command: env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_ninja_pdf.js
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
var NEW = /^(erp\/overlay\/ninja\/|common\/lib\/pdfkit|common\/fonts\/|viewer\/lib\/exceljs)/;
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
  await page.evaluate(function () { if (!document.getElementById('ninja-panel')) window.NinjaPill.open({ db: window.__idmpDb }); });
  await page.waitForSelector('#np-sample-' + id, { timeout: 20000 });
  await page.click('#np-sample-' + id); await page.waitForSelector('#np-run', { timeout: 20000 });
  await page.evaluate(function (f, t) { document.getElementById('np-from').value = f; document.getElementById('np-to').value = t; }, from, to);
  var n0 = NET.log.length;
  await page.click('#np-run'); await page.waitForSelector('#np-rep-sum, #np-rep span[style*="ff9b9b"]', { timeout: 90000 });
  var err = await page.evaluate(function () { var e = document.querySelector('#np-rep span[style*="ff9b9b"]'); return e ? e.textContent : null; });
  if (err) throw new Error('report run failed: ' + err);
  var afterRun = fetched(n0, NEW), cells = await sheetCells(page), n1 = NET.log.length;
  var before = fs.readdirSync(dl);
  await page.click('#np-dl-pdf');
  var t0 = Date.now(), file = null;
  while (!file && Date.now() - t0 < 90000) { var f = fs.readdirSync(dl).filter(function (n) { return before.indexOf(n) < 0 && /\.pdf$/.test(n); }); if (f.length) { await sleep(400); file = path.join(dl, f[0]); } else await sleep(200); }
  return { cells: cells, afterRun: afterRun, afterPdf: fetched(n1, NEW), pdf: file };
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

  var S = await serve(), B = null, page = null, first = null, tb = null, reg = null;
  try {
    if (PUP) {
      B = await PUP.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'], env: (function () { var e = Object.assign({}, process.env); delete e.DBUS_SESSION_BUS_ADDRESS; return e; })() });
      page = await B.newPage(); await page.setBypassServiceWorker(true);
      var logs = []; page.on('console', function (m) { var t = m.text(); if (/^§(NINJA|PREFLIGHT|SQL_SUMMARY|OVERLAY)/.test(t)) logs.push(t); }); page.on('pageerror', function (e) { logs.push('§PAGEERROR ' + String(e && e.message).slice(0, 200)); });
      var cdp = await page.target().createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
      await page.goto(S.base + 'erp/idempiere.html?login=GardenAdmin', { waitUntil: 'networkidle2', timeout: 120000 });
      await page.waitForFunction(function () { return !!(window.NinjaPill && window.NinjaPill.__report && window.__idmpDb); }, { timeout: 60000 });
      await sleep(1500);
      first = { reqs: fetched(0, NEW), all: NET.log.length };
      await guard('N1', 'tb-run', async function () { tb = await runSample(page, 'tb', FROM, TO, dl); });
      await guard('N2', 'reg-run', async function () { reg = await runSample(page, 'reg', RFROM, RTO, dl); });
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

  // N3: §18 one-page editor - only when it is on main
  var s18 = ''; try { s18 = cp.execSync('git -C ' + JSON.stringify(ROOT) + ' log origin/main --oneline | grep -i "edit as a sheet" | head -3', { encoding: 'utf8' }).trim(); } catch (e) { s18 = ''; }
  INC.N3 = s18 ? '§18 merged (' + s18.split('\n')[0].slice(0, 80) + ') but this witness has no N3 driver yet - run its H2/H3 on this PDF' : '§18 not merged yet';
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
    check('N4', 'no-bad', 'no gate of run_all.sh is BAD', bad.length === 0, bad.slice(0, 6));
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
    check('N5', 'run-no-pdf-writer', '"Run report" fetches ExcelJS + the engine and NOT PDFKit or a font', run.some(function (x) { return /exceljs/.test(x); }) && run.some(function (x) { return /ninja_template\.js$/.test(x); }) && !run.some(function (x) { return /pdfkit|common\/fonts|ninja_pdf/.test(x); }), run);
    check('N5', 'pdf-on-demand', 'the first "Download PDF" fetches PDFKit, ninja_pdf.js and the six fonts', pdf.some(function (x) { return /pdfkit\.standalone/.test(x); }) && pdf.some(function (x) { return /ninja_pdf\.js$/.test(x); }) && pdf.filter(function (x) { return /common\/fonts\//.test(x); }).length === 6, pdf);
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
