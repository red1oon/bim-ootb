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
//                  unchanged, poppler reads it, and the total that no longer agrees is named (DOES_NOT_ADD_UP). Judged only when pdf/edit_layer.js (§18) is in this tree,
//                  else INCONCLUSIVE; edited bytes not captured = FAIL (no check is skipped silently)  -> printed, but not editable
//   N4 LANE        the engine lane's own witnesses stay green: the run_all.sh output named by NINJAPDF_LANE_LOG (W40 B2_browser_run, W41 B2_pill_end_to_end, W42 R_register_*,
//                  W44 X_xtab2, W47 R_replay_* when the private cases exist, W48 W_pill_preflight); no log -> INCONCLUSIVE                                 -> the move broke the engine
//   N5 COST        first visit of the ERP page: the only new requests are the overlay's report_pill.js (bytes logged); "Run report" fetches ExcelJS + the engine (ninja_pdf.js
//                  included: cellText) and NOT the PDF writer; the first "Download PDF" fetches PDFKit + the fonts                                                                        -> every visitor pays for a PDF writer
//   N7 PILL        (§20.6 P-R1 + C4) in the real pill: a PDF that fails leaves the finished report and puts its error in its own node (#np-pdf-err); two clicks on "Download PDF"
//                  while it renders start ONE toPdf; a cell no font holds is said in one line on the pill (#np-pdf-note) and counted in §NINJA_REPORT_PDF missingGlyphs=
//   N2b SARA AM    (§20.6 C5, node) the Thai/Lao words of every shape (tone mark before AM, AM at a run start, Lao, repeated) through the renderer + poppler; the clusters themselves
//   C1..C4         (§20.6, node, each FAILS on the engine of origin/main: run with NINJAPDF_ENGINE=<old ninja_pdf.js>) C1 a number too wide for its cell prints as '#' fill inside the cell and is
//                  counted; C2 fonts parsed once per file, not per use; C3 no page above 14,400 pt, cut at row boundaries, a merge kept whole; C4 code points no font holds are counted
//   P3 ONE RULE    (§20.6 P-R3, node) the renderer prints what the exported cellText says; the number-format fallback rule is written once in the overlay
//   N6 ONE ENGINE  erp/overlay/ninja/{ninja_calc,ninja_pdf,ninja_preflight,ninja_report,ninja_template,ninja_template_xlsx}.js are byte-identical to bim-compiler build/erp
//                  (NINJAPDF_SOURCE_REF, default origin/master, read with git show from NINJAPDF_SOURCE_REPO or ~/bim-compiler); unreadable -> INCONCLUSIVE     -> two engines drift
// MUTANTS (NINJAPDF_MUTANTS=1; the server hands the browser a rewritten ninja_pdf.js, the text must match exactly once): M1 SARA AM fix removed -> N2 FAIL;
//   M2 a cell dropped from the PDF -> N1 FAIL; node-only (no browser run): M3 the tone-mark backtrack loop of SARA AM deleted -> N2b; M4 the '#' fill off -> C1; M5 no page cut -> C3;
//   M6 missing glyphs not counted -> C4; M7 fonts not registered by name -> C2.
// VERDICT WORD (§20.6 P-R4): PASS only when every claim above was judged and held; PASS-PARTIAL notJudged=<claims> when none failed but some claim judged nothing (INCONCLUSIVE); FAIL; INCONCLUSIVE when nothing was judged.
// NODE ONLY: NINJAPDF_NODE_ONLY=1 skips the browser claims (N1 N2 N3 N5 N7).
// Browser: headless Chromium (puppeteer: NINJAPDF_PUPPETEER or ~/bim-compiler/node_modules/puppeteer), --no-sandbox --disable-gpu, DBUS unset, service worker bypassed (every request seen),
//   the REAL erp/idempiere.html?login=GardenAdmin served from this tree (NINJAPDF_LIVE=<site url> = the deployed site). Command: env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_ninja_pdf.js
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..'), MUTANT = process.env.NINJAPDF_MUTANT || '';
var FROM = '2003-01-01', TO = '2003-12-31', RFROM = '2002-01-01', RTO = '2026-12-31';
var ENGINE = ['ninja_calc', 'ninja_pdf', 'ninja_preflight', 'ninja_report', 'ninja_template', 'ninja_template_xlsx'];
var MUT = [
  { name: 'M1-sara-am-fix-removed', kills: 'N2', file: 'erp/overlay/ninja/ninja_pdf.js', from: 'if (r.am) amDraw(doc, r.t, tx, ty); else doc.text(r.t, tx, ty, { lineBreak: false });', to: 'doc.text(r.t, tx, ty, { lineBreak: false });' },
  { name: 'M2-cell-dropped-from-pdf', kills: 'N1', file: 'erp/overlay/ninja/ninja_pdf.js', from: "if (c.t === 'z' || (c.t === 's' && c.v === '')) return;", to: "if (c.t === 'z' || (c.t === 's' && c.v === '') || k === 'D6') return;" },
  { name: 'M3-tone-mark-backtrack-deleted', kills: 'N2b', nodeOnly: true, file: 'erp/overlay/ninja/ninja_pdf.js', from: 'while (j > from && AM_MARK.test(t[j - 1])) j--; ', to: '' },
  { name: 'M4-hash-fill-off', kills: 'C1', nodeOnly: true, file: 'erp/overlay/ninja/ninja_pdf.js', from: 'if (measure(text) > w + 0.001) {', to: 'if (false) {' },
  { name: 'M5-no-page-cut', kills: 'C3', nodeOnly: true, file: 'erp/overlay/ninja/ninja_pdf.js', from: 'while (r1 < nRows && rowY[r1 + 1] - rowY[r0] <= cap) r1++;', to: 'r1 = nRows;' },
  { name: 'M6-glyphs-not-counted', kills: 'C4', nodeOnly: true, file: 'erp/overlay/ninja/ninja_pdf.js', from: '|| fk.hasGlyphForCodePoint(cp)) continue;', to: '|| true) continue;' },
  { name: 'M7-fonts-not-registered', kills: 'C2', nodeOnly: true, file: 'erp/overlay/ninja/ninja_pdf.js', from: "if (typeof src === 'string') return src; var n = fontReg.get(src);", to: 'return src; var n = fontReg.get(src);' }
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

// ── the Output sheet the PDF was printed from, as printed text: the engine's own cellText (§20.6 P-R3: the one rule the renderer, the pill preview and this witness share) ──
function sheetCells(page) {
  return page.evaluate(function () {
    var res = window.NinjaPill.__report.last(), m = res.model, ws = m.Sheets.Output, st = m._styles || {}, X = window.XLSX, out = [];
    Object.keys(ws).forEach(function (k) {
      if (k[0] === '!') return; var c = ws[k]; if (!c || c.t === 'z' || (c.t === 's' && c.v === '')) return;
      var text = window.NinjaPdf.cellText(c, st, function (f, v) { return X.SSF.format(f, v); });
      out.push({ cell: k, t: c.t, v: c.v, text: text });
    });
    return out;
  });
}
async function waitFile(dir, re, ms) { var t = Date.now(); while (Date.now() - t < ms) { var f = fs.readdirSync(dir).filter(function (n) { return re.test(n) && !/\.crdownload$/.test(n); }); if (f.length) { await sleep(300); return path.join(dir, f[0]); } await sleep(200); } return null; }
async function runSample(page, id, from, to, dl, noDownload) {
  if (!(await page.$('#ninja-panel'))) {   // the user's way in: the "Excel Report" pill on the rail (contributed by the built-in bundle plugins/ninja_excel.mjs)
    await page.waitForSelector('#pill-ninja', { timeout: 60000 });
    await page.evaluate(function () { var dock = document.getElementById('idmp-pill'), trig = document.querySelector('#idmp-pill-trigger,[data-pill-trigger]');
      if (dock && trig && getComputedStyle(dock).display === 'none') trig.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      document.getElementById('pill-ninja').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  }
  await page.waitForSelector('#np-sample-' + id, { timeout: 20000 }); await sleep(300);
  var file = id === 'tb' ? 'ninja_tb_sample.xlsx' : 'ninja_register_sample.xlsx';
  await page.evaluate(function (i) { document.getElementById('np-out').innerHTML = ''; document.getElementById('np-sample-' + i).click(); }, id);   // a fresh lookup; the old flow is cleared so its Run button cannot be pressed for this sample
  await page.waitForFunction(function (f) { var o = document.getElementById('np-out'); return o && o.textContent.indexOf('Report template — ' + f) >= 0 && document.getElementById('np-run'); }, { timeout: 60000 }, file);
  await page.evaluate(function (f, t) { document.getElementById('np-from').value = f; document.getElementById('np-to').value = t; }, from, to);
  var n0 = NET.log.length;
  await page.evaluate(function () { document.getElementById('np-run').click(); }); await page.waitForSelector('#np-rep-sum, #np-rep span[style*="ff9b9b"]', { timeout: 90000 });
  var err = await page.evaluate(function () { var e = document.querySelector('#np-rep span[style*="ff9b9b"]'); return e ? e.textContent : null; });
  if (err) throw new Error('report run failed: ' + err);
  var afterRun = fetched(n0, NEW), cells = await sheetCells(page), n1 = NET.log.length;
  if (noDownload) return { cells: cells, afterRun: afterRun, afterPdf: [], pdf: null };
  var before = fs.readdirSync(dl);
  await page.evaluate(function () { document.getElementById('np-dl-pdf').click(); });
  var t0 = Date.now();
  var pdf = null;
  while (!pdf && Date.now() - t0 < 120000) { var f = fs.readdirSync(dl).filter(function (n) { return before.indexOf(n) < 0 && /\.pdf$/.test(n); }); if (f.length) { await sleep(400); pdf = path.join(path.dirname(dl), id + '_' + f[0]); fs.renameSync(path.join(dl, f[0]), pdf); } else await sleep(200); }   // moved out at once: a later download of the same name would overwrite it
  return { cells: cells, afterRun: afterRun, afterPdf: fetched(n1, NEW), pdf: pdf };
}

// N7 driver (§20.6 P-R1 + C4) on a fresh trial-balance report that has NOT been downloaded: (A) the PDF fails -> the finished report stays, the error sits in its own node;
//   (B) two clicks while the PDF renders -> ONE toPdf; a cell with Chinese text (no font holds it) is said on the pill in one line
async function probePill(page, dl) {
  await runSample(page, 'tb', FROM, TO, dl, true);
  return page.evaluate(async function () {
    var NR = window.NinjaReport, res = window.NinjaPill.__report.last(), orig = NR.toPdf, calls = 0, wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }, $ = function (i) { return document.getElementById(i); };
    NR.toPdf = function () { calls++; return Promise.reject(new Error('boom-test')); };
    $('np-dl-pdf').click(); await wait(400);
    var A = { calls: calls, sum: !!$('np-rep-sum'), preview: !!$('np-preview'), xlsxLink: !!$('np-dl-xlsx'), pdfLink: !!$('np-dl-pdf'), err: $('np-pdf-err') ? $('np-pdf-err').textContent : null, pdfSet: !!res.pdf };
    res.model.Sheets.Output.Z1 = { t: 's', v: '中文 ok' };
    calls = 0; NR.toPdf = function () { calls++; return orig.apply(this, arguments); };
    var link = $('np-dl-pdf'); link.click(); link.click(); link.click();
    var t0 = Date.now(); while (!res.pdf && Date.now() - t0 < 90000) await wait(100); await wait(300);
    NR.toPdf = orig;
    return { A: A, B: { calls: calls, pdf: !!res.pdf, sum: !!$('np-rep-sum'), err: !!$('np-pdf-err'), note: $('np-pdf-note') ? $('np-pdf-note').textContent : null, facts: res.facts && res.facts.missingGlyphs } };
  });
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

// ── the node claims: the renderer run in plain node (pdfkit + the six fonts) and read back by poppler; no browser. ENGINE under test = erp/overlay/ninja/ninja_pdf.js, or NINJAPDF_ENGINE=<file> (used to prove a case FAILS on the old engine) ──
var ENGINE_FILE = process.env.NINJAPDF_ENGINE || path.join(ERP, 'overlay/ninja/ninja_pdf.js'), ENGINE_REL = 'erp/overlay/ninja/ninja_pdf.js';
function loadEngine() {
  var txt = fs.readFileSync(ENGINE_FILE, 'utf8');
  if (ACTIVE && ACTIVE.file === ENGINE_REL && !process.env.NINJAPDF_ENGINE) { var n = txt.split(ACTIVE.from).length - 1; NET.mutantApplied = n; if (n === 1) txt = txt.replace(ACTIVE.from, function () { return ACTIVE.to; }); }
  var m = { exports: {} }; new Function('module', 'exports', 'require', txt)(m, m.exports, require); return m.exports;
}
function nodeKit() {
  var PD = require(path.join(ROOT, 'common/pdfwriter/pdfkit.standalone.js')); if (PD.default) PD = PD.default;
  var F = {}; [['lr', 'LiberationSans-Regular'], ['lb', 'LiberationSans-Bold'], ['tr', 'NotoSansThai-Regular'], ['tb', 'NotoSansThai-Bold'], ['ar', 'NotoSansLao-Regular'], ['ab', 'NotoSansLao-Bold']].forEach(function (x) { F[x[0]] = new Uint8Array(fs.readFileSync(path.join(ROOT, 'common/pdfwriter/fonts', x[1] + '.ttf'))); });
  var used = new Set();                                           // the same script rule as ninja_report.js resolver(): bytes, like the pill
  var fonts = { resolve: function (name, bold, italic, text) { var f = /[ก-๛]/.test(text) ? (bold ? F.tb : F.tr) : /[຀-໿]/.test(text) ? (bold ? F.ab : F.ar) : (bold ? F.lb : F.lr); used.add(f); return f; } };
  var fmt = function (f, v) { if (f === '0.00' || f === '#,##0.00') { var s = Math.abs(v).toFixed(2).split('.'); if (f[0] === '#') s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (v < 0 ? '-' : '') + s.join('.'); } return String(v); };
  return { PD: PD, fonts: fonts, used: used, fmt: fmt, NP: loadEngine() };
}
var NSEQ = 0;
function nodePdf(TMP, buf) { var f = path.join(TMP, 'node' + (++NSEQ) + '.pdf'); fs.writeFileSync(f, Buffer.from(buf)); return f; }
function ptext(f, extra) { return (cp.spawnSync('pdftotext', ['-raw'].concat(extra || [], [f, '-']), { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || '').replace(/\f/g, ''); }
function pinfo(f) { var o = cp.spawnSync('pdfinfo', ['-f', '1', '-l', '99', f], { encoding: 'utf8' }).stdout || '', pages = Number((/Pages:\s+(\d+)/.exec(o) || [])[1] || 0), sizes = []; var re = /Page\s+(\d+) size:\s+([\d.]+) x ([\d.]+) pts/g, m; while ((m = re.exec(o))) sizes.push([Number(m[2]), Number(m[3])]); return { pages: pages, sizes: sizes }; }
function pwords(f) { var o = cp.spawnSync('pdftotext', ['-bbox', f, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || '', words = [], page = 0; o.split('\n').forEach(function (l) { if (/^\s*<page /.test(l)) page++; var m = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*)<\/word>/.exec(l); if (m) words.push({ page: page, x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5] }); }); return words; }
async function capture(fn) { var lines = [], l0 = console.log; console.log = function (s) { lines.push(String(s)); }; try { var r = await fn(); return { r: r, lines: lines }; } finally { console.log = l0; } }
function shown(lines, re) { lines.filter(function (l) { return re.test(l); }).forEach(function (l) { say('  ' + l); }); }

async function nodeClaims(TMP) {
  var K = nodeKit(), NP = K.NP;
  var render = function (ws, styles) { return NP.renderSheet(K.PD, { Sheets: { Output: ws }, _styles: styles || {} }, { profile: 'excel', fonts: K.fonts, formatNumber: K.fmt }); };
  say('§NINJAPDF-NODE engine=' + (process.env.NINJAPDF_ENGINE ? 'OVERRIDE ' + path.basename(ENGINE_FILE) : ENGINE_REL) + ' exports=' + Object.keys(NP).join(','));

  // N2b (spec §20.6 C5): SARA AM through the renderer + poppler, every shape of the rule - tone mark before AM, AM at a run's start, Lao, repeated in one cell, mixed with Latin.
  //   The first check reads the clusters the renderer builds (runsOf); the tone-mark backtrack loop is what makes 'น้ำ' ONE cluster. The mutant that deletes the loop must die here.
  await guard('N2b', 'sara-am', async function () {
    var words = ['จำนวน', 'น้ำ', 'ต่ำ', 'ก่ำ', 'ก้ำ', 'ก๊ำ', 'ก๋ำ', 'กำไร', 'ำ', 'ำนวน', 'จำจำจำ', 'น้ำน้ำน้ำ ต่ำต่ำ', 'ทำงาน ทำ', 'น้ำตาล', 'Abc จำนวน 123', 'ຈຳນວນ', 'ນ້ຳ', 'ກ່ຳກ້ຳ', 'ຳ'], ws = { '!cols': [{ width: 34 }] };
    words.forEach(function (w, i) { ws['A' + (i + 1)] = { t: 's', v: w }; });
    var clusters = ['น้ำ', 'ต่ำ', 'ก๊ำ', 'ກ່ຳ', 'ນ້ຳ'], badRuns = [];
    clusters.forEach(function (w) { var rs = NP.runsOf(w); if (!(rs.length === 1 && rs[0].am && rs[0].t === w)) badRuns.push(w + ' -> ' + JSON.stringify(rs.map(function (r) { return [r.t, !!r.am]; }))); });
    var starts = NP.runsOf('ำ'); if (!(starts.length === 1 && starts[0].am && starts[0].t === 'ำ')) badRuns.push('ำ -> ' + JSON.stringify(starts));
    var cap = await capture(function () { return render(ws); }), f = nodePdf(TMP, cap.r.pdf), lines = ptext(f).split('\n').map(function (l) { return l.trim(); }), bad = [];
    words.forEach(function (w, i) { if (lines[i] !== w) bad.push('"' + w + '" -> "' + lines[i] + '"'); });
    say('  §NINJAPDF-N2b-FACT words=' + words.length + ' popplerExact=' + (words.length - bad.length) + ' clustersChecked=' + (clusters.length + 1) + ' badClusters=' + badRuns.length);
    check('N2b', 'population', 'the word list holds every shape: tone mark before AM (>=4), AM at a run start (>=3), Lao (>=4), a repeat in one cell (>=2)', words.filter(function (w) { return /[่-๋]ำ/.test(w); }).length >= 4 && words.filter(function (w) { return /^ำ|^ຳ/.test(w); }).length >= 3 && words.filter(function (w) { return /[຀-໿]/.test(w); }).length >= 4 && words.filter(function (w) { return /(.ำ).*\1/.test(w); }).length >= 2, words.length);
    check('N2b', 'clusters', 'a tone mark between the consonant and AM keeps ONE cluster (น้ำ ต่ำ ก๊ำ ນ້ຳ); AM alone is its own (' + (clusters.length + 1 - badRuns.length) + ' of ' + (clusters.length + 1) + ')', badRuns.length === 0, badRuns);
    check('N2b', 'poppler', 'pdftotext -raw gives back every word exactly (' + (words.length - bad.length) + ' of ' + words.length + ')', bad.length === 0, bad.slice(0, 6));
  });
  verdict('N2b');

  // C1: a number wider than its column prints as '#' fill (Excel), inside its cell, and is counted - never as the clipped tail of its digits
  await guard('C1', 'overflow', async function () {
    var ws = { A1: { t: 'n', v: 1234567.89, s: 's0' }, B1: { t: 'n', v: 1234.5, s: 's0' }, C1: { t: 's', v: 'x' }, '!cols': [{ width: 5 }, { width: 12 }, { width: 5 }] }, cap = await capture(function () { return render(ws, { s0: { numFmt: '#,##0.00' } }); });
    var f = nodePdf(TMP, cap.r.pdf), W = pwords(f), a = W.filter(function (w) { return w.x0 < 63 + 1; })[0], b = W.filter(function (w) { return /1,234\.50/.test(w.t); })[0];
    shown(cap.lines, /^§NINJA_PDF/); say('  §NINJAPDF-C1-FACT cellA1 word="' + (a && a.t) + '" x=' + (a && a.x0.toFixed(2)) + '..' + (a && a.x1.toFixed(2)) + ' cellBounds=36.00..63.00 B1="' + (b && b.t) + '" returned overflowNumbers=' + cap.r.overflowNumbers);
    check('C1', 'hash-fill', 'the number that does not fit prints as # fill (and no digit of it)', !!a && /^#+$/.test(a.t), a && a.t);
    check('C1', 'inside-cell', 'the # fill lies inside its cell (36.00..63.00 pt): 36 <= x0 and x1 <= 63', !!a && a.x0 >= 36 - 0.01 && a.x1 <= 63 + 0.01, a && [a.x0, a.x1]);
    check('C1', 'fit-untouched', 'a number that fits is printed whole (1,234.50)', !!b, W.map(function (w) { return w.t; }));
    check('C1', 'counted', 'the count is returned and logged: overflowNumbers=1 (returned) and the §NINJA_PDF line says overflowNumbers=1', cap.r.overflowNumbers === 1 && cap.lines.some(function (l) { return /^§NINJA_PDF .*overflowNumbers=1( |$)/.test(l); }), { ret: cap.r.overflowNumbers, lines: cap.lines.slice(0, 2) });
  });
  verdict('C1');

  // C2: fonts registered once per document and used by name: pdfkit parses a font on EVERY doc.font(bytes) (1,800 cells -> thousands of parses)
  await guard('C2', 'fonts-once', async function () {
    var ws = {}; for (var j = 1; j <= 300; j++) for (var k = 0; k < 6; k++) ws['ABCDEF'[k] + j] = k ? { t: 'n', v: j * k * 100.25 } : { t: 's', v: 'บัญชี ' + j };
    var last = null, PD2 = class extends K.PD { constructor(o) { super(o); last = this; } }, t0 = Date.now(); K.used.clear();
    var cap = await capture(function () { return NP.renderSheet(PD2, { Sheets: { Output: ws }, _styles: {} }, { profile: 'excel', fonts: K.fonts, formatNumber: K.fmt }); }), ms = Date.now() - t0;
    var parses = last ? last._fontCount : -1;                  // pdfkit counts every font it opens (the first is its own Helvetica)
    shown(cap.lines, /^§NINJA_PDF/); say('  §NINJAPDF-C2-FACT cells=1800 fontParses=' + parses + ' distinctFontFiles=' + K.used.size + ' ms=' + ms);
    check('C2', 'population', 'both a Latin and a Thai font were used (2 distinct font files)', K.used.size >= 2, K.used.size);
    check('C2', 'parses', 'the font is parsed once per distinct file, not per use: fontParses <= distinct files + 1 (got ' + parses + ' for 1,800 cells)', parses > 0 && parses <= K.used.size + 1, { parses: parses, distinct: K.used.size });
  });
  verdict('C2');

  // C3: no page taller than 14,400 pt; the cut is at a row boundary; no row lost or doubled; a merge is not split when it can be avoided
  await guard('C3', 'pages', async function () {
    var N = 2500, ws = {}; for (var i = 1; i <= N; i++) { ws['A' + i] = { t: 's', v: 'row ' + i }; ws['B' + i] = { t: 'n', v: i * 1.5, s: 's0' }; }
    var cap = await capture(function () { return render(ws, { s0: { numFmt: '0.00' } }); }), f = nodePdf(TMP, cap.r.pdf), I = pinfo(f), per = Math.floor((14400 - 144) / 12.75), want = Math.ceil(N / per);
    var all = ptext(f).split('\n').filter(function (l) { return l.trim(); }), wrong = []; for (var r = 1; r <= N; r++) if (all[r - 1] !== 'row ' + r + ' ' + (r * 1.5).toFixed(2)) { wrong.push(r + ': ' + all[r - 1]); if (wrong.length > 4) break; }
    var p1 = ptext(f, ['-f', '1', '-l', '1']).split('\n').filter(function (l) { return l.trim(); });
    shown(cap.lines, /^§NINJA_PDF/); say('  §NINJAPDF-C3-FACT rows=' + N + ' pdfinfoPages=' + I.pages + ' expected=' + want + ' tallest=' + Math.max.apply(null, I.sizes.map(function (s) { return s[1]; })) + 'pt rowsOnPage1=' + p1.length + ' expectedPerPage=' + per);
    check('C3', 'page-count', 'the sheet is cut into ceil(2500 / ' + per + ') = ' + want + ' pages (pdfinfo)', I.pages === want, I);
    check('C3', 'height', 'no page is taller than 14,400 pt, and the first is nearly full (> 14,000)', I.sizes.length > 0 && I.sizes.every(function (s) { return s[1] <= 14400; }) && I.sizes[0][1] > 14000, I.sizes);
    check('C3', 'row-cut', 'page 1 holds exactly ' + per + ' whole rows (the cut is a row boundary)', p1.length === per && /^row 1 /.test(p1[0]) && p1[p1.length - 1].indexOf('row ' + per + ' ') === 0, p1.slice(-2));
    check('C3', 'no-row-lost', 'every row 1..2500 is read back once, in order, with its number', wrong.length === 0 && all.length === N, { wrong: wrong, lines: all.length });
    // a vertical merge that the natural cut would split moves whole to the next page
    var m = {}; for (var q = 1; q <= 1200; q++) m['A' + q] = { t: 's', v: 'm ' + q }; m['A1117'] = { t: 's', v: 'MERGED' }; delete m.A1118; delete m.A1119; m['!merges'] = [{ s: { r: 1116, c: 0 }, e: { r: 1118, c: 1 } }];
    var cm = await capture(function () { return render(m); }), fm = nodePdf(TMP, cm.r.pdf), Im = pinfo(fm), W = pwords(fm), mw = W.filter(function (w) { return w.t === 'MERGED'; })[0], last1 = ptext(fm, ['-f', '1', '-l', '1']).split('\n').filter(function (l) { return l.trim(); }).pop();
    say('  §NINJAPDF-C3-FACT merge rows 1117-1119: page1 lastLine="' + last1 + '" MERGED on page ' + (mw && mw.page) + ' pages=' + Im.pages);
    check('C3', 'merge-whole', 'a merge across the natural cut moves whole to page 2 (page 1 ends "m 1116", MERGED is on page 2)', Im.pages === 2 && last1 === 'm 1116' && !!mw && mw.page === 2, { last1: last1, merged: mw, pages: Im.pages });
  });
  verdict('C3');

  // C4: code points no loaded font holds are counted and returned (missingGlyphs), and logged; a clean sheet counts 0
  await guard('C4', 'glyphs', async function () {
    var bad = await capture(function () { return render({ A1: { t: 's', v: '中文 Report' }, A2: { t: 's', v: 'تقرير' }, A3: { t: 's', v: 'Thai จำนวน Lao ຈຳນວນ' }, '!cols': [{ width: 30 }] }); }),
        ok = await capture(function () { return render({ A1: { t: 's', v: 'Thai จำนวน น้ำ' }, A2: { t: 's', v: 'Lao ຈຳນວນ' }, A3: { t: 's', v: 'Latin (1/2) 3.50 - done, "q"' }, A4: { t: 'n', v: 1234.5 }, '!cols': [{ width: 30 }] }); }),
        g = bad.r.missingGlyphs, g0 = ok.r.missingGlyphs;
    shown(bad.lines, /^§NINJA_PDF/); shown(ok.lines, /^§NINJA_PDF/);
    say('  §NINJAPDF-C4-FACT withCJKArabic: ' + JSON.stringify(g) + ' clean: ' + JSON.stringify(g0));
    check('C4', 'counted', 'the Chinese + Arabic cells are counted: >= 7 code points (2 + 5), 2 cells, and 中 and ت are named; the Latin and Thai words are not', !!g && g.count >= 7 && g.cells === 2 && g.chars.indexOf('中') >= 0 && g.chars.indexOf('ت') >= 0 && !/[A-Za-z฀-๿຀-໿]/.test(g.chars), g);
    check('C4', 'clean-is-zero', 'a sheet of Latin / Thai / Lao text and a number counts 0 (a population of 4 cells was judged)', !!g0 && g0.count === 0 && g0.cells === 0, g0);
    check('C4', 'logged', 'the §NINJA_PDF line says missingGlyphs=' + (g && g.count) + ' for the first sheet and missingGlyphs=0 for the second', !!g && bad.lines.some(function (l) { return new RegExp('^§NINJA_PDF .*missingGlyphs=' + g.count + ' ').test(l); }) && ok.lines.some(function (l) { return /^§NINJA_PDF .*missingGlyphs=0 /.test(l); }), { bad: bad.lines, ok: ok.lines });
  });
  verdict('C4');

  // P3 (P-R3): ONE printed-text rule. The renderer prints what cellText says; no second copy of the rule in the overlay or in this witness
  await guard('P3', 'one-rule', async function () {
    check('P3', 'exported', 'cellText is exported by the engine (a function)', typeof NP.cellText === 'function', Object.keys(NP)); if (typeof NP.cellText !== 'function') return;
    var st = { s0: { numFmt: '#,##0.00' } }, cells = [{ t: 'n', v: 1234.5, s: 's0' }, { t: 'n', v: 7, z: '0.00' }, { t: 'n', v: 5 }, { t: 'b', v: true }, { t: 's', v: 'abc' }, { t: 's', v: null }, { t: 'z' }], want = cells.map(function (c) { return NP.cellText(c, st, K.fmt); });
    var ws = { '!cols': [{ width: 20 }] }; cells.forEach(function (c, i) { ws['A' + (i + 1)] = c; });
    var cap = await capture(function () { return render(ws, st); }), lines = ptext(nodePdf(TMP, cap.r.pdf)).split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l; }), expect = want.filter(function (t) { return t; });
    say('  §NINJAPDF-P3-FACT cellText=' + JSON.stringify(want) + ' printed=' + JSON.stringify(lines));
    check('P3', 'renderer-prints-it', 'the renderer prints exactly what cellText returns, cell by cell (' + expect.length + ' printed)', JSON.stringify(lines) === JSON.stringify(expect) && JSON.stringify(want) === JSON.stringify(['1,234.50', '7.00', '5', 'TRUE', 'abc', '', '']), { want: want, lines: lines });
    var rule = new RegExp('numFmt\\)?\\s*\\|\\|[^;]{0,40}\'General\''), hits = [];
    fs.readdirSync(path.join(ERP, 'overlay/ninja')).filter(function (f) { return /\.js$/.test(f); }).concat(['../../tests/witness_ninja_pdf.js']).forEach(function (f) { var t = fs.readFileSync(path.join(ERP, 'overlay/ninja', f), 'utf8'); if (rule.test(t)) hits.push(f); });
    check('P3', 'one-copy', 'the number-format fallback rule is written in exactly one file (ninja_pdf.js): the pill and this witness call cellText', hits.length === 1 && hits[0] === 'ninja_pdf.js', hits);
  });
  verdict('P3');
}

var PUP = null; try { PUP = require(process.env.NINJAPDF_PUPPETEER || path.join(os.homedir(), 'bim-compiler/node_modules/puppeteer')); } catch (e) { PUP = null; }
(async function main() {
  var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ninjapdf-')), dl = path.join(TMP, 'dl'); fs.mkdirSync(dl);
  if ((ACTIVE && ACTIVE.nodeOnly) || process.env.NINJAPDF_NODE_ONLY) PUP = null;
  say('§NINJAPDF-LOAD tree=' + ROOT + ' mutant=' + (MUTANT || 'none') + ' puppeteer=' + (PUP ? 'yes' : 'NO (N1 N2 N5 judge nothing)'));
  if (MUTANT && !ACTIVE) { say('§NINJAPDF-VERDICT INCONCLUSIVE unknown mutant ' + MUTANT); process.exit(3); }

  // N6 first: one engine (no browser needed)
  if (process.env.NINJAPDF_ENGINE) INC.N6 = 'engine overridden by NINJAPDF_ENGINE'; else await guard('N6', 'sync', async function () {
    var repo = process.env.NINJAPDF_SOURCE_REPO || path.join(os.homedir(), 'bim-compiler'), ref = process.env.NINJAPDF_SOURCE_REF || 'origin/master', same = [], diff = [], gone = [];
    ENGINE.forEach(function (f) {
      var src = null; try { src = cp.execFileSync('git', ['-C', repo, 'show', ref + ':build/erp/' + f + '.js'], { maxBuffer: 1 << 26 }); } catch (e) { gone.push(f); return; }
      (Buffer.compare(src, fs.readFileSync(path.join(ERP, 'overlay/ninja', f + '.js'))) === 0 ? same : diff).push(f);
    });
    if (gone.length === ENGINE.length) { INC.N6 = 'build/erp not readable at ' + repo + ' ' + ref; return; }
    check('N6', 'identical', 'every engine file in erp/overlay/ninja equals bim-compiler ' + ref + ':build/erp (' + same.length + ' of ' + ENGINE.length + ')', same.length === ENGINE.length, { diff: diff, missing: gone });
  });

  try { await nodeClaims(TMP); } catch (e) { say('  §NINJAPDF-NODE-ERROR ' + String(e && (e.stack || e.message)).slice(0, 600)); }

  var LIVE = process.env.NINJAPDF_LIVE || '';   // e.g. https://red1oon.github.io/bim-ootb/ : the deployed site instead of this tree (requests recorded from the page; no mutant)
  var N3 = null, probe = null;
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
      await guard('N7', 'pill-run', async function () { probe = await probePill(page, dl); });
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
    // the printed text equals cellText only while nothing was printed as '#' fill or left blank for want of a font: the engine's own counts say so (§20.6 C1 C4), and the cost fields (renderMs, heapMB) are logged
    var pl = logs.filter(function (l) { return /^§NINJA_REPORT_PDF/.test(l); })[0] || '';
    check('N1', 'engine-counts', 'the trial balance printed with overflowNumbers=0 missingGlyphs=0 pages=1 and renderMs= heapMB= in its §NINJA_REPORT_PDF line', /pages=1 /.test(pl) && /overflowNumbers=0 /.test(pl) && /missingGlyphs=0 /.test(pl) && /renderMs=\d+ heapMB=[\d.]+/.test(pl), pl);
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
  var s18 = 'edit_layer.js';
  if (!fs.existsSync(path.join(ROOT, 'pdf/edit_layer.js'))) INC.N3 = '§18 (pdf/edit_layer.js) is not in this tree';
  else if (!N3) INC.N3 = PUP ? 'the one-page run did not happen (no trial-balance PDF)' : 'no browser';
  else await guard('N3', 'edit', async function () {
    say('  §NINJAPDF-N3-FACT §18=' + s18 + ' cell=' + N3.cell + ' old="' + N3.old + '" new="' + N3.neu + '" layer="' + (N3.layer || '').slice(0, 140) + '" edit="' + (N3.edit || '').slice(0, 160) + '"');
    check('N3', 'opens', 'pdf/index.html opens the engine\'s PDF and lays the edit layer over it (§PDFED-OPEN ok=true, §EDSHEET-LAYER)', !!N3.open && !!N3.layer, { open: N3.open, layer: N3.layer });
    check('N3', 'edit-applies', 'the number typed on the page is applied: §EDSHEET-EDIT cell=' + N3.cell + ' ok=true old="' + N3.old + '" new="' + N3.neu + '"', !!N3.edit && new RegExp('cell=' + N3.cell + ' .*ok=true old="' + N3.old.replace(/[.()]/g, '\\$&') + '" new="' + N3.neu.replace(/[.()]/g, '\\$&') + '"').test(N3.edit), N3.edit);
    check('N3', 'bytes', 'the edited PDF bytes were read back from the page (no later check of this claim is skipped)', !!N3.bytes, N3.edit);
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
    check('N5', 'run-no-pdf-writer', '"Run report" fetches ExcelJS + the engine (ninja_pdf.js too: it owns cellText, the one printed-text rule, 16 KB) and NOT PDFKit or a font', run.some(function (x) { return /exceljs/.test(x); }) && run.some(function (x) { return /ninja_template\.js$/.test(x); }) && run.some(function (x) { return /ninja_pdf\.js$/.test(x); }) && !run.some(function (x) { return /pdfkit|common\/pdfwriter/.test(x); }), run);
    check('N5', 'pdf-on-demand', 'the first "Download PDF" fetches PDFKit and the six fonts (ninja_pdf.js is already there)', pdf.some(function (x) { return /pdfkit\.standalone/.test(x); }) && !pdf.some(function (x) { return /ninja_pdf\.js$/.test(x); }) && pdf.filter(function (x) { return /common\/pdfwriter\/fonts\//.test(x); }).length === 6, pdf);
    if (reg) check('N5', 'once', 'the second report fetches nothing of the report again', names(reg.afterRun).length === 0 && names(reg.afterPdf).filter(function (x) { return !/samples\//.test(x); }).length === 0, { run: names(reg.afterRun), pdf: names(reg.afterPdf) });
  });
  verdict('N5');
  verdict('N6');

  // N7: the pill - a failed PDF leaves the finished report; two clicks start one render; a cell no font holds is said on the pill and counted in the log
  await guard('N7', 'pill', async function () {
    if (!probe) { INC.N7 = PUP ? 'the pill probe did not run' : 'no browser'; return; }
    var A = probe.A, B = probe.B, ln = logs.filter(function (l) { return /^§NINJA_REPORT_PDF/.test(l); })[2] || '';
    say('  §NINJAPDF-N7-FACT A(failing PDF)=' + J(A) + ' B(three clicks, one cell of Chinese)=' + J(B) + ' log="' + ln + '"');
    check('N7', 'fail-keeps-report', 'a PDF that fails leaves the finished report on the pill (summary, preview, both download links still there)', A.calls === 1 && A.sum && A.preview && A.xlsxLink && A.pdfLink && !A.pdfSet, A);
    check('N7', 'fail-own-node', 'the PDF error is in its own node #np-pdf-err and names the cause (boom-test)', /PDF failed: boom-test/.test(A.err || ''), A.err);
    check('N7', 'one-in-flight', 'three clicks on "Download PDF" while it renders start ONE toPdf (calls=1), the PDF is made, the report is still there, the old error is gone', B.calls === 1 && B.pdf && B.sum && !B.err, B);
    check('N7', 'glyph-line', 'the pill says in one line that the Chinese cell has no font (#np-pdf-note: 2 characters in 1 cell, 中文)', /^2 characters in 1 cell \(中文\) have no font in this PDF and are left blank\.$/.test(B.note || ''), B.note);
    check('N7', 'glyph-log', 'the §NINJA_REPORT_PDF line says missingGlyphs=2 missingCells=1 and carries renderMs= heapMB=', /missingGlyphs=2 missingCells=1/.test(ln) && /renderMs=\d+ heapMB=[\d.]+/.test(ln), ln);
  });
  verdict('N7');

  var CL = ['N1', 'N2', 'N2b', 'N3', 'N4', 'N5', 'N6', 'N7', 'C1', 'C2', 'C3', 'C4', 'P3'];
  var vs = CL.map(function (c) { var x = CASES[c] || {}; return c + '=' + (INC[c] ? 'INCONCLUSIVE' : !x.judged ? 'INCONCLUSIVE' : x.failed ? 'FAIL' : 'PASS'); });
  var anyFail = vs.some(function (v) { return /FAIL/.test(v); }), anyPass = vs.some(function (v) { return /PASS/.test(v); }), notJudged = vs.filter(function (v) { return /INCONCLUSIVE/.test(v); }).map(function (v) { return v.split('=')[0]; });

  // mutants: each must turn its named claim FAIL (a crash is not a kill)
  if (process.env.NINJAPDF_MUTANTS === '1' && !MUTANT) {
    var killed = 0;
    MUT.forEach(function (m) {
      var out = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { NINJAPDF_MUTANT: m.name, NINJAPDF_MUTANTS: '' }), encoding: 'utf8', maxBuffer: 1 << 26 }).stdout || '';
      fs.writeFileSync(path.join(TMP, m.name + '.log'), out);
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
  var word = anyFail ? 'FAIL' : !anyPass ? 'INCONCLUSIVE' : notJudged.length ? 'PASS-PARTIAL notJudged=' + notJudged.join(',') : 'PASS';   // PASS only when every claim was judged
  say('§NINJAPDF-VERDICT ' + word + ' ' + vs.join(' ') + ' judged=' + ALL.judged + ' failed=' + ALL.failed);
  process.exit(anyFail ? 1 : anyPass ? 0 : 3);
})();
