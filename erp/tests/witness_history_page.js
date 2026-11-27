#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HISTORY-PAGE (bim-compiler prompts/SHEET_FRONT_DOOR.md §14: the history page, any spreadsheet file gets a memory, no add-in). READ THE LOG after every run:
//   every verdict is a §HPAGE line; the exit code is not the evidence. INCONCLUSIVE when nothing was judged (no browser = the page cases judge nothing; no WPS = P9 judges nothing).
//   A mutant that makes its named case THROW is CRASHED, not a kill.
// SPEC (claims written in §14.2 before the code; each names the issue it exposes). What is judged on the page is what the user SEES (the DOM), against the engine run in node:
//   P1 DAY     real ninja_sample.xlsx: no history said, Stamp = genesis; edited OUTSIDE in node; reopened: exactly those cells listed as changes since the last stamp; Stamp = exactly
//              those cells, the number typed over the SUM flagged; Stamp again = NO-OP and the stored history text is unchanged                -> outside edits missed / an empty stamp grows the file
//   P2 FILE    every downloaded workbook in node: SheetHistory.verify AND the kernel's verifyJournal; visible cells + formulas equal the input; _door_history very hidden;
//              the Excel shim's own Check history / Cell history read the same entries                                                          -> a second format / the page damages the sheet
//   P3 STORY   the story shown for a clicked cell equals the engine's cellStory (3 values, added-then-cleared, never changed, empty)                 -> a partial or wrong per-cell history
//   P4 REWIND  for EVERY step N and every sheet the grid equals asOf(N) cell for cell, the marks equal entry N's cells; "Download this version" re-opens as that state, N entries  -> time travel wrong
//   P5 MERGE   two copies of one stamped file: different cells combine; 11 vs 22 is ONE conflict with both values and both names, nothing written until picked; same value twice is no
//              conflict; the merged file verifies, holds the pick, its story names both; refused in words: unrelated file, hand-edited history (entry named), unstamped copy (cells named)
//   P6 TAMPER  one recorded value edited in _door_history: the entry is named, Stamp refused, the stored history untouched, no story / rewind / merge shown   -> an edited history built upon
//   P7 LIGHT   no kernel, no seed: requests <= 8 and bytes <= 400,000 for the page; only GET, nothing leaves the origin through the whole run       -> "nothing is uploaded" unproven
//   P8 PHONE   390 x 844 touch: no sideways scroll on load, after open, after a stamp by tap, with a story open, with a conflict shown             -> unusable on a phone
//   P9 WPS     a stamped workbook saved by the REAL WPS writer (erp/tests/wps_driver.js): history verifies, what WPS changed is listed, a Stamp chains on (no WPS: INCONCLUSIVE)
//   P10 COST   §SHIST-PAGE-COST requests, bytes, ms, heap
//   E1 MERGE-ENTRY  engine in node: mergeEntry refuses an unpicked conflict; its entry verifies (engine + kernel), asOf = merged + picks; an edit in the carried entries is caught;
//              cellStory shows the other side; the same copy again = NO-OP; a merge of a merge verifies                                             -> a merge nobody can audit
// Browser: headless Chromium (puppeteer, HPAGE_PUPPETEER or ~/bim-compiler/node_modules/puppeteer) on the REAL erp/sheet_addin/history.html over a local static server from this
//   tree, real file chooser, real downloads. Mutants (HPAGE_MUTANTS=1): the server hands the browser ONE rewritten file (the text must match exactly once, else NOT-APPLIED);
//   node mutants hand a rewritten engine copy to a child run of E1 only.
// Command: env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_history_page.js     (HPAGE_MUTANTS=1 adds the sweep; HPAGE_WPS=0 skips real WPS; HPAGE_URL=<https page> = a live smoke run)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..');
var MUTANT = process.env.HPAGE_MUTANT || '', ONLY = (process.env.HPAGE_ONLY || '').split(',').filter(Boolean), LIVE = process.env.HPAGE_URL || '';
if (!process.env.SQLJS) process.env.SQLJS = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var _log = console.log; console.log = function () { /* the kernel's own lines */ };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 }, E1b = null;
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0, threw: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §HPAGE-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 900)));
}
async function guard(cs, key, rule, fn) { try { await fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); CASES[cs].threw++; } }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0, threw: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§HPAGE-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + ' threw=' + c.threw + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
var wants = function (cs) { return !ONLY.length || ONLY.indexOf(cs) >= 0; };
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

var SH = require(process.env.HPAGE_ENGINE || path.join(ERP, 'sheet_history.js')), K = require(path.join(ERP, 'ws_kernel.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
var SA = require(path.join(ERP, 'sheet_addin/host_shim.js')), XH = require(path.join(ERP, 'sheet_addin/xlsx_host.js')), SAMPLE = require(path.join(ERP, 'sheet_addin/sample_invoice.js'));
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hpage-')), SRC = path.join(ERP, 'ninja_sample.xlsx');

// ── mutants: ONE rewritten file reaches the browser ──
var MUT = [
  { name: 'M1-outside-changes-not-listed', kills: 'P1', file: 'erp/sheet_addin/history.js', from: '/*MUT-BIND*/', to: 'out.pending = [];' },
  { name: 'M2-noop-stamp-writes-an-entry', kills: 'P1', file: 'erp/sheet_addin/host_shim.js', from: "if (r.verdict !== 'RECORDED') return { action: 'stamp', verdict: 'NO-OP',", to: "if (r.verdict !== 'RECORDED') await appendRow(HISTORY, ls[ls.length - 1]); if (r.verdict !== 'RECORDED') return { action: 'stamp', verdict: 'NO-OP'," },
  { name: 'M3-download-writes-a-stray-cell', kills: 'P2', file: 'erp/sheet_addin/history.js', from: 'function bytesOf(wb) { return', to: "function bytesOf(wb) { wb.Sheets[wb.SheetNames[0]].A1 = { t: 's', v: 'x' }; return" },
  { name: 'M4-story-of-the-wrong-cell', kills: 'P3', file: 'erp/sheet_addin/history.js', from: 'story({ sheet: st.sheet, cell: td.dataset.cell });', to: "story({ sheet: st.sheet, cell: 'A1' });" },
  { name: 'M5-rewind-off-by-one', kills: 'P4', file: 'erp/sheet_addin/history.js', from: 'st.step /*MUT-STEP*/', to: 'st.step - 1' },
  { name: 'M6-rewound-file-keeps-the-full-history', kills: 'P4', file: 'erp/sheet_addin/history.js', from: 'n /*MUT-KEEP*/', to: 'st.lines.length' },
  { name: 'M7-conflict-resolved-silently-side-b-wins', kills: 'P5', file: 'erp/sheet_addin/history.js', from: 'var picks = o.picks; /*MUT-SILENT*/', to: "var picks = {}; o.m.conflicts.forEach(function (c) { picks[key(c)] = 'b'; });" },
  { name: 'M8-unstamped-copy-merged-anyway', kills: 'P5', file: 'erp/sheet_addin/history.js', from: 'var unstamped = b.pending; /*MUT-UNSTAMPED*/', to: 'var unstamped = [];' },
  { name: 'M9-finish-allowed-before-a-pick', kills: 'P5', file: 'erp/sheet_addin/history.js', from: 'b.disabled = st.busy || o.m.conflicts.some(function (c) { return !o.picks[key(c)]; });', to: 'b.disabled = st.busy;' },
  { name: 'M10-tampered-entry-accepted', kills: 'P6', file: 'erp/sheet_history.js', from: 'if (!e.payload || await sha256(JSON.stringify(e.payload.ops)) !== e.opsDigest)', to: 'if (!e.payload)' },
  { name: 'M11-kernel-loaded', kills: 'P7', file: 'erp/sheet_addin/history.html', from: '<script src="history.js', to: '<script src="../ws_kernel_web.js"></script>\n<script src="history.js' },
  { name: 'M12-page-forced-wide', kills: 'P8', file: 'erp/sheet_addin/history.html', from: '</head>', to: '<style>main { min-width: 1200px; }</style></head>' }
];
var NMUT = [
  { name: 'N1-carried-entries-not-verified', kills: 'E1', file: 'erp/sheet_history.js', from: '/*MUT-CARRIED*/ ok =', to: 'var unused =' },
  { name: 'N2-picks-ignored-side-b-taken', kills: 'E1', file: 'erp/sheet_history.js', from: '/*MUT-PICK*/', to: "p = 'b';" },
  { name: 'N3-merge-entry-made-with-a-conflict-open', kills: 'E1', file: 'erp/sheet_history.js', from: "return ['a', 'b', 'base'].indexOf(picks[c.sheet + '!' + c.cell]) < 0; });", to: 'return false; });' }
];
var ACTIVE = MUT.filter(function (m) { return m.name === MUTANT; })[0] || null;

// ── the static server: this tree, as GitHub Pages would serve it; counts what it hands out and anything that is not a GET ──
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png' };
var NET = { requests: 0, bytes: 0, urls: [], notGet: [], mutantApplied: null };
function isIcon(u) { return /favicon\.ico$/.test(u); }
function serve() {
  return new Promise(function (res) {
    var srv = http.createServer(function (req, rsp) {
      var rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      if (!isIcon(rel)) { NET.requests++; NET.urls.push(req.method + ' ' + rel); }
      if (req.method !== 'GET') { NET.notGet.push(req.method + ' ' + rel); req.resume(); rsp.writeHead(405); rsp.end(); return; }
      var f = path.join(ROOT, rel);
      if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || !fs.statSync(f).isFile()) { rsp.writeHead(404); rsp.end(); return; }
      var body = fs.readFileSync(f);
      if (ACTIVE && rel === ACTIVE.file) { var txt = body.toString('utf8'), n = txt.split(ACTIVE.from).length - 1; NET.mutantApplied = n; if (n === 1) body = Buffer.from(txt.replace(ACTIVE.from, ACTIVE.to)); }
      NET.bytes += body.length;
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); rsp.end(body);
    });
    srv.listen(0, '127.0.0.1', function () { res({ srv: srv, base: 'http://127.0.0.1:' + srv.address().port + '/' }); });
  });
}

// ── node side: the same layers the page uses, plus an independent reader of the stored rows ──
function readWb(file) { return XLSX.read(fs.readFileSync(file), Object.assign({ type: 'buffer' }, XH.READ)); }
function writeWb(wb, name) { var f = path.join(TMP, name); fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })); return f; }
function hostOf(wb, user) { return XH.create(XLSX, wb, { engineValue: function (v) { return v; }, userName: user || 'node' }); }
function shimOf(wb, user) { return SA.create(hostOf(wb, user), { SheetHistory: SH }); }
function rowsOf(wb) { var s = wb.Sheets[SA.HISTORY]; return s && s['!ref'] ? XLSX.utils.sheet_to_json(s, { header: 1, raw: true, defval: '' }).map(function (r) { return r.map(function (c) { return c == null ? '' : String(c); }); }) : []; }
function linesOf(wb) { return rowsOf(wb).map(function (r) { return r.join(''); }).filter(Boolean); }       // NOT the shim's reader: rows joined by hand
function entriesOf(wb) { return linesOf(wb).map(function (l) { return JSON.parse(l); }); }
function hiddenOf(wb, name) { var i = wb.SheetNames.indexOf(name), m = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]; return i < 0 ? null : (m && m.Hidden ? m.Hidden : 0); }
function visible(wb) { return wb.SheetNames.filter(function (n) { return !hiddenOf(wb, n); }); }
async function snapOf(wb) { var h = hostOf(wb), o = {}, n = visible(wb); for (var i = 0; i < n.length; i++) o[n[i]] = await h.readSheetValues(n[i]); return o; }
// a snapshot in one canonical text (sheet and cell order do not matter; a sheet with no cell is no sheet)
function canon(snap) { return J(Object.keys(snap).filter(function (s) { return Object.keys(snap[s]).length; }).sort().map(function (s) { return [s, Object.keys(snap[s]).sort().map(function (a) { var c = snap[s][a]; return [a, c.v === undefined ? null : c.v, c.f == null ? null : c.f]; })]; })); }
function cellsOf(wb) { var o = {}; visible(wb).forEach(function (n) { var s = wb.Sheets[n]; Object.keys(s).forEach(function (a) { if (a.charAt(0) !== '!' && (s[a].v != null || s[a].f != null)) o[n + '!' + a] = [s[a].t === 'z' ? null : s[a].v, s[a].f || null]; }); }); return o; }
function diffKeys(a, b) { var d = []; Object.keys(Object.assign({}, a, b)).forEach(function (k) { if (J(a[k] === undefined ? null : a[k]) !== J(b[k] === undefined ? null : b[k])) d.push(k); }); return d.sort(); }
function keys(ops) { return ops.map(function (o) { return o.sheet + '!' + o.cell; }); }
function sorted(a) { return a.slice().sort(); }
// "another program": the file opened, cells changed, saved again by a writer that is not the page (SheetJS in node; it keeps formula results, as Excel and WPS do)
function editOutside(file, name, fn) { var wb = readWb(file); fn(wb.Sheets, wb); return writeWb(wb, name); }
function put(s, a, v) { if (v == null) delete s[a]; else s[a] = typeof v === 'number' ? { t: 'n', v: v } : { t: 's', v: String(v) }; var r = XLSX.utils.decode_range(s['!ref']), c = XLSX.utils.decode_cell(a); r.e.r = Math.max(r.e.r, c.r); r.e.c = Math.max(r.e.c, c.c); s['!ref'] = XLSX.utils.encode_range(r); }
function tamper(file, name, from, to) {                                       // one text edited inside the stored history, as a hand would
  var wb = readWb(file), s = wb.Sheets[SA.HISTORY], hits = 0;
  Object.keys(s).forEach(function (a) { if (a.charAt(0) !== '!' && String(s[a].v).indexOf(from) >= 0 && !hits) { s[a] = { t: 's', v: String(s[a].v).replace(from, to) }; hits++; } });
  return { file: writeWb(wb, name), hits: hits };
}
async function fileFacts(file) {                                              // what P2 judges of one downloaded workbook
  var wb = readWb(file), lines = linesOf(wb), v = await SH.verify(lines), kv = K.verifyJournal(lines.join('\n')), shim = shimOf(wb), ch = await shim.checkHistory();
  return { wb: wb, lines: lines, entries: v.ok ? lines.map(function (l) { return JSON.parse(l); }) : [], verify: v, kernel: kv, hidden: hiddenOf(wb, SA.HISTORY), check: ch, shim: shim, cells: cellsOf(wb),
    astral: /[\uD800-\uDFFF]/.test(rowsOf(wb).join('')), longest: Math.max.apply(null, [0].concat(rowsOf(wb).map(function (r) { return Math.max.apply(null, r.map(function (c) { return c.length; })); }))) };
}

// ── browser side ──
var PUP = null; if (!ONLY.length || ONLY.some(function (c) { return c.charAt(0) === 'P'; })) try { PUP = require(process.env.HPAGE_PUPPETEER || path.join(os.homedir(), 'bim-compiler/node_modules/puppeteer')); } catch (e) { PUP = null; }
var B = { browser: null, base: null, external: [], pageErrors: [], loaded: 0 };
var PAGE = 'erp/sheet_addin/history.html';
async function newPage(opts) {
  opts = opts || {};
  var page = await B.browser.newPage(); page.__logs = []; page.__reqs = [];
  if (opts.phone) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  page.__cdp = await page.target().createCDPSession();
  page.on('console', function (m) { var t = m.text(); if (/^§/.test(t)) page.__logs.push(t); });
  page.on('pageerror', function (e) { B.pageErrors.push(String(e && e.message)); page.__logs.push('§PAGEERROR ' + (e && e.message)); });
  await page.setRequestInterception(true);
  page.on('request', function (rq) {
    var u = rq.url(); if (!isIcon(u)) page.__reqs.push(rq.method() + ' ' + u);
    if (u.indexOf(B.base) !== 0 && !/^(data|blob):/.test(u)) { B.external.push(rq.method() + ' ' + u); return rq.abort(); }
    rq.continue();
  });
  var n0 = NET.requests, b0 = NET.bytes, u0 = NET.urls.length;
  await page.goto(LIVE || (B.base + PAGE), { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(function () { return !!(window.HistoryPage && window.HistoryPage.state.cost); }, { timeout: 60000 });
  page.__load = { requests: NET.requests - n0, bytes: NET.bytes - b0, urls: NET.urls.slice(u0) }; B.loaded += page.__load.requests;
  return page;
}
function renders(page) { return page.evaluate(function () { return window.HistoryPage.state.renders; }); }
async function act(page, fn) { var n = await renders(page); await fn(); await page.waitForFunction(function (k) { var s = window.HistoryPage.state; return s.renders > k && !s.busy; }, { timeout: 60000 }, n); }
async function choose(page, label, file) { await act(page, async function () { var got = await Promise.all([page.waitForFileChooser({ timeout: 30000 }), page.click(label)]); await got[0].accept([file]); }); }
function openFile(page, file) { return choose(page, 'label[for=file]', file); }
function openOther(page, file) { return choose(page, 'label[for=file2]', file); }
async function setName(page, name) { await page.$eval('#who', function (e) { e.value = ''; }); await page.type('#who', name); }
function stamp(page) { return act(page, function () { return page.click('#b-stamp'); }); }
// a real touch on the element; when the touch cannot land (the element is off a page that is too wide) it is noted in `missed` and the element is clicked instead, so the case goes on and FAILS rather than throws
async function touch(page, sel, missed) { try { await page.tap(sel); } catch (e) { missed.push(sel); await page.evaluate(function (s) { document.querySelector(s).click(); }, sel); } }
async function download(page, sel) {
  var dir = fs.mkdtempSync(path.join(TMP, 'dl-')); await page.__cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  await page.click(sel);
  for (var t = 0; t < 300; t++) { var fl = fs.readdirSync(dir).filter(function (f) { return !/\.crdownload$/.test(f); }); if (fl.length && fs.statSync(path.join(dir, fl[0])).size > 0) { await sleep(150); return path.join(dir, fl[0]); } await sleep(100); }
  throw new Error('no download arrived from ' + sel);
}
// click the element whose data-<attr> is val; false (nothing clicked, nothing awaited) when the page shows no such element
async function clickData(page, sel, attr, val) {
  var has = await page.evaluate(function (s, a, v) { return Array.prototype.slice.call(document.querySelectorAll(s)).some(function (x) { return x.dataset[a] === v; }); }, sel, attr, val);
  if (!has) return false;
  await act(page, function () { return page.evaluate(function (s, a, v) { Array.prototype.slice.call(document.querySelectorAll(s)).filter(function (x) { return x.dataset[a] === v; })[0].click(); }, sel, attr, val); });
  return true;
}
function goStep(page, n) { return clickData(page, '#steps button', 'step', String(n)); }
function goSheet(page, n) { return clickData(page, '#tabs button', 'sheet', n); }
function cellStory(page, a) { return clickData(page, '#grid td', 'cell', a); }
function pickSide(page, side) { return page.evaluate(function (s) { var b = document.querySelector('#conflicts button[data-pick="' + s + '"]'); if (b) b.click(); return !!b; }, side); }
// what the user sees
function dom(page) {
  return page.evaluate(function () {
    var q = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }, id = function (x) { return document.getElementById(x); }, H = window.HistoryPage.state;
    var shown = function (x) { var e = id(x); return !!e && !e.hidden && !(e.closest('section') && e.closest('section').hidden); }, grid = {};
    q('#grid td').forEach(function (td) { if (td.dataset.v !== undefined) grid[td.dataset.cell] = { v: JSON.parse(td.dataset.v), f: td.dataset.f === undefined ? null : td.dataset.f }; });
    return { state: id('status').dataset.state, status: id('status').textContent, opened: id('opened').textContent, name: id('who').value, whoNote: id('who-note').textContent,
      pending: shown('pending') ? q('#pending li').map(function (li) { return { cell: li.dataset.cell, over: li.dataset.typedOver === '1', text: li.textContent }; }) : [],
      stamp: shown('stamp-result') ? { verdict: id('stamp-result').dataset.verdict, text: id('stamp-result').textContent } : { verdict: null, text: '' }, stampDisabled: id('b-stamp').disabled, downloadShown: shown('b-download'),
      sheetShown: shown('sheet'), storyShown: shown('story'), mergeShown: shown('merge'), stepShown: shown('b-download-step'),
      steps: q('#steps button').map(function (b) { return { step: b.dataset.step, on: b.getAttribute('aria-pressed') === 'true', text: b.textContent }; }),
      tabs: q('#tabs button').map(function (b) { return b.dataset.sheet; }), sheet: H.sheet, viewNote: id('view-note').textContent,
      grid: grid, marks: q('#grid td.chg').map(function (td) { return td.dataset.cell; }), selected: q('#grid td.sel').map(function (td) { return td.dataset.cell; }),
      storyHead: id('story-head').textContent, story: q('#story-list li').map(function (li) { return { seq: li.dataset.seq ? Number(li.dataset.seq) : null, actor: li.dataset.actor || null, at: li.dataset.at || null, before: li.dataset.before ? JSON.parse(li.dataset.before) : null, after: li.dataset.after ? JSON.parse(li.dataset.after) : null,
        typedOverFormula: li.dataset.typedOver === '1', mergedAt: li.dataset.mergedAt ? Number(li.dataset.mergedAt) : null, pending: li.dataset.pending === '1', text: li.textContent }; }),
      merge: { shown: shown('merge-status'), verdict: id('merge-status').dataset.verdict, text: id('merge-status').textContent, applied: q('#merge-applied li').map(function (li) { return { cell: li.dataset.cell, actor: li.dataset.actor, text: li.textContent }; }),
        conflicts: q('#conflicts .conflict').map(function (c) { return { cell: c.dataset.cell, a: JSON.parse(c.dataset.a), b: JSON.parse(c.dataset.b), base: JSON.parse(c.dataset.base), whoA: c.dataset.whoA, whoB: c.dataset.whoB, text: c.querySelector('p').textContent,
          buttons: Array.prototype.slice.call(c.querySelectorAll('button')).map(function (b) { return { pick: b.dataset.pick, on: b.getAttribute('aria-pressed') === 'true', text: b.textContent }; }) }; }),
        finishShown: shown('b-merge'), finishDisabled: id('b-merge').disabled },
      lines: H.lines.length, fileName: H.name, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, cost: H.cost };
  });
}
// the open workbook as a download would write it, WITHOUT clicking Download (for "nothing was written" checks)
async function pageBytes(page) { var b64 = await page.evaluate(function () { var u = window.HistoryPage.bytes(), s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }); var f = path.join(TMP, 'peek-' + Date.now() + '-' + Math.round(Math.random() * 1e6) + '.xlsx'); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; }
function gridOf(snap, sheet) { var o = {}, s = (snap && snap[sheet]) || {}; Object.keys(s).forEach(function (a) { o[a] = { v: s[a].v === undefined ? null : s[a].v, f: s[a].f == null ? null : s[a].f }; }); return o; }
function storyKey(s) { return s.map(function (x) { return [x.seq, x.actor, x.at, x.before, x.after, !!x.typedOverFormula, x.mergedAt || null]; }); }
function cellIs(cells, k, v) { return J(cells[k]) === J([v, null]); }

(async function main() {
  say('§HPAGE-LOAD tree=' + ROOT + ' mutant=' + (MUTANT || 'none') + ' only=' + (ONLY.join(',') || 'all') + ' puppeteer=' + (PUP ? 'yes' : 'NO (the page cases judge nothing)') + (LIVE ? ' LIVE=' + LIVE : ''));
  var srv = await serve(); B.base = LIVE ? new URL(LIVE).origin + '/' : srv.base;
  if (PUP) B.browser = await PUP.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'], env: (function () { var e = Object.assign({}, process.env); delete e.DBUS_SESSION_BUS_ADDRESS; return e; })() });
  var F = {}, S0 = await snapOf(readWb(SRC)), N0 = Object.keys(S0).reduce(function (n, s) { return n + Object.keys(S0[s]).length; }, 0);
  var B6 = S0.BACKUP.B6.v, B6a = Math.round((B6 + 100) * 100) / 100, B6b = Math.round((B6 + 101) * 100) / 100, B7 = S0.BACKUP.B7.v;
  var real = S0.BACKUP.B9 && S0.BACKUP.B9.f === 'SUM(B5:B8)' && typeof B6 === 'number' && !S0.BACKUP.F2 && !S0.BACKUP.C5 && !S0.BACKUP.C6 && !S0.BACKUP.D5 && !S0.BACKUP.D6 && !S0.BACKUP.C8;
  say('§HPAGE-FIXTURE workbook=ninja_sample.xlsx sheets=' + Object.keys(S0).length + ' cells=' + N0 + ' BACKUP!B9=' + J(S0.BACKUP.B9) + ' B6=' + B6 + ' B7=' + B7 + ' real=' + !!real);

  // ═══════════════ LIVE: one stamp + one merge against the deployed page (HPAGE_URL) ═══════════════
  if (LIVE) {
    if (B.browser) await guard('LIVE', 'run', 'the deployed page stamps and merges', async function () {
      var p = await newPage(), d0 = await dom(p);
      check('LIVE', 'loaded', 'the deployed page loaded its own scripts and no kernel (' + J(d0.cost) + ')', !!d0.cost && d0.cost.kernel === false && d0.cost.requests <= 8 && d0.cost.bytes > 0 && d0.cost.bytes <= 400000, d0.cost);
      await openFile(p, SRC); await setName(p, 'Aisha'); await stamp(p); var d1 = await dom(p), f1 = await download(p, '#b-download'), x1 = await fileFacts(f1);
      check('LIVE', 'stamp', 'a Stamp on the live page records the genesis (' + N0 + ' cells) and the downloaded file verifies (engine + kernel)', d1.stamp.verdict === 'RECORDED' && d1.state === 'intact' && x1.verify.ok && x1.kernel.ok && x1.entries.length === 1 && x1.entries[0].ops === N0, { stamp: d1.stamp, v: x1.verify, k: x1.kernel.ok });
      var a0 = editOutside(f1, 'live_a.xlsx', function (s) { put(s.BACKUP, 'C5', 'paid'); put(s.BACKUP, 'B7', 11); }), b0 = editOutside(f1, 'live_b.xlsx', function (s) { put(s.BACKUP, 'C6', 'query'); put(s.BACKUP, 'B7', 22); });
      await openFile(p, a0); await stamp(p); var cA = await download(p, '#b-download');
      await openFile(p, b0); await setName(p, 'Ben'); await stamp(p); var cB = await download(p, '#b-download');
      await openFile(p, cA); await setName(p, 'Aisha'); await openOther(p, cB); var dm = await dom(p), c = dm.merge.conflicts[0] || { a: {}, b: {} };
      check('LIVE', 'conflict', 'the live page shows ONE conflict on BACKUP!B7 with both values (11, 22) and both names, Finish disabled', dm.merge.conflicts.length === 1 && c.cell === 'BACKUP!B7' && c.a.v === 11 && c.b.v === 22 && c.whoA === 'Aisha' && c.whoB === 'Ben' && dm.merge.finishDisabled === true, dm.merge);
      await pickSide(p, 'a'); await act(p, function () { return p.click('#b-merge'); }); var d2 = await dom(p), fm = await download(p, '#b-download'), xm = await fileFacts(fm);
      check('LIVE', 'merge', 'the merged file from the live page verifies (engine + kernel), is 3 entries, keeps B7 = 11 and holds C5 and C6', d2.merge.verdict === 'RECORDED' && xm.verify.ok && xm.kernel.ok && xm.entries.length === 3 && cellIs(xm.cells, 'BACKUP!B7', 11) && cellIs(xm.cells, 'BACKUP!C5', 'paid') && cellIs(xm.cells, 'BACKUP!C6', 'query'), { m: d2.merge.text, v: xm.verify, cells: [xm.cells['BACKUP!B7'], xm.cells['BACKUP!C5'], xm.cells['BACKUP!C6']] });
      check('LIVE', 'nothing-sent', 'every request of the live run was a GET to the page\'s own origin (' + p.__reqs.length + ' requests incl. blob downloads)', B.external.length === 0 && p.__reqs.every(function (r) { return /^GET /.test(r); }), { external: B.external, reqs: p.__reqs });
      say('§HPAGE-LIVE url=' + LIVE + ' requests=' + J(p.__reqs.filter(function (r) { return !/^GET blob:/.test(r); }).map(function (r) { return r.replace(/^GET https?:\/\/[^/]+/, ''); })));
      p.__logs.filter(function (l) { return /^§SHIST-PAGE-(COST|STAMP|MERGE)/.test(l); }).forEach(function (l) { say('  page: ' + l.slice(0, 300)); });
      await p.close();
    });
    verdict('LIVE'); if (B.browser) await B.browser.close(); srv.srv.close();
    var lv = !CASES.LIVE || !CASES.LIVE.judged ? 'INCONCLUSIVE' : CASES.LIVE.failed ? 'FAIL' : 'PASS';
    say('§HPAGE-VERDICT ' + lv + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=["LIVE"] (headless Chromium on the DEPLOYED page ' + LIVE + '; real Excel NOT run)');
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(lv === 'PASS' ? 0 : 1);
  }

  // ═══════════════ P1 DAY (also makes the files every later case uses) ═══════════════
  var page = null, D = {};
  if (B.browser) {
    await guard('P1', 'day', 'a day on the real sample workbook', async function () {
      check('P1', 'real', 'the workbook is real: BACKUP!B9 is =SUM(B5:B8), B6 a number, the cells the day writes to are empty', !!real, S0.BACKUP);
      page = await newPage(); D.load = page.__load; D.cost0 = (await dom(page)).cost;
      await openFile(page, SRC); var d0 = await dom(page);
      check('P1', 'no-history', 'a workbook with no history: the page says so and offers Stamp; no step, no merge, no download offered', d0.state === 'none' && /no history yet/.test(d0.status) && !d0.stampDisabled && d0.steps.length === 1 && !d0.mergeShown && !d0.downloadShown, d0);
      await stamp(page); var dn = await dom(page);
      check('P1', 'name-needed', 'Stamp with no name typed records nothing and asks for the name (a name is never invented)', dn.stamp.verdict === 'REFUSED' && /name/.test(dn.stamp.text) && dn.lines === 0, dn.stamp);
      await setName(page, 'Aisha'); await stamp(page); var d1 = await dom(page); F.f1 = await download(page, '#b-download');
      var e1 = entriesOf(readWb(F.f1));
      check('P1', 'genesis', 'Stamp writes entry 1 = every non-empty cell of the visible sheets (' + N0 + '), by the typed name, and the page then says the sheet matches', d1.stamp.verdict === 'RECORDED' && d1.state === 'intact' && e1.length === 1 && e1[0].ops === N0 && e1[0].meta.genesis === true && e1[0].actor === 'Aisha' && canon(SH.asOf(e1, 1)) === canon(S0), { stamp: d1.stamp, state: d1.state, ops: e1[0] && e1[0].ops });
      check('P1', 'not-a-signature', 'the page says in words the name is typed, not a signature', /not a signature/.test(d1.whoNote), d1.whoNote);
      // another program edits the file: B6 +100, a note in F2, 600 typed over the SUM in B9
      F.f1e = editOutside(F.f1, 'day_edited1.xlsx', function (s) { put(s.BACKUP, 'B6', B6a); put(s.BACKUP, 'F2', 'checked by QS'); put(s.BACKUP, 'B9', 600); });
      check('P1', 'outside', 'the outside edit is real: the file bytes differ and its stored history rows are byte for byte the same', !fs.readFileSync(F.f1).equals(fs.readFileSync(F.f1e)) && J(rowsOf(readWb(F.f1))) === J(rowsOf(readWb(F.f1e))), null);
      await openFile(page, F.f1e); var d2 = await dom(page), want = ['BACKUP!F2', 'BACKUP!B6', 'BACKUP!B9'];
      check('P1', 'listed', 'reopened: the page lists EXACTLY the changed cells ' + J(want) + ' as changes since the last stamp (not an error), and marks exactly those in the grid', d2.state === 'pending' && J(d2.pending.map(function (p) { return p.cell; })) === J(want) && /changed since the last stamp/.test(d2.status) && J(sorted(d2.marks)) === J(['B6', 'B9', 'F2']), { state: d2.state, pending: d2.pending, marks: d2.marks });
      var p1 = d2.pending[1] || { text: '' }, p2 = d2.pending[2] || { text: '' };
      check('P1', 'listed-values', 'each listed cell shows before and now (B6 ' + B6 + ' -> ' + B6a + '; B9 the formula -> 600, flagged as typed over a formula; nothing else flagged)', d2.pending.length === 3 && p1.text.indexOf(String(B6)) >= 0 && p1.text.indexOf(String(B6a)) >= 0 && /=SUM\(B5:B8\)/.test(p2.text) && /600/.test(p2.text) && p2.over === true && !d2.pending[0].over && !p1.over, d2.pending);
      check('P1', 'name-kept', 'the name typed once is still in the field after reopening (kept by this browser; also in every entry of the workbook)', d2.name === 'Aisha', d2.name);
      await setName(page, 'Ben'); await stamp(page); var d3 = await dom(page); F.f2 = await download(page, '#b-download');
      var e2 = entriesOf(readWb(F.f2)), ops2 = e2[1] ? e2[1].payload.ops : [];
      check('P1', 'entry-2', 'Stamp records entry 2 holding EXACTLY those cells, by Ben, chained on entry 1; the page says the sheet matches again', d3.stamp.verdict === 'RECORDED' && d3.state === 'intact' && e2.length === 2 && J(keys(ops2)) === J(want) && e2[1].actor === 'Ben' && e2[1].prev === e2[0].hash && e2[0].hash === e1[0].hash, { stamp: d3.stamp, keys: keys(ops2) });
      check('P1', 'typed-over', 'the number typed over the SUM is flagged typedOverFormula (B9 only)', J(ops2.filter(function (o) { return o.typedOverFormula; }).map(function (o) { return o.cell; })) === J(['B9']), ops2);
      await stamp(page); var d4 = await dom(page); F.f2n = d4.downloadShown ? await download(page, '#b-download') : await pageBytes(page);
      check('P1', 'no-op', 'Stamp with nothing changed is a NO-OP said in words, and the stored history rows of the downloaded file are byte for byte unchanged (2 entries)', d4.stamp.verdict === 'NO-OP' && /No change/.test(d4.stamp.text) && J(rowsOf(readWb(F.f2n))) === J(rowsOf(readWb(F.f2))) && linesOf(readWb(F.f2n)).length === 2, { stamp: d4.stamp, lines: linesOf(readWb(F.f2n)).length });
      // day 3: B6 changed again, the note cleared
      F.f2e = editOutside(F.f2, 'day_edited2.xlsx', function (s) { put(s.BACKUP, 'B6', B6b); put(s.BACKUP, 'F2', null); });
      await openFile(page, F.f2e); await setName(page, 'Aisha'); await stamp(page); F.f3 = await download(page, '#b-download');
      var e3 = entriesOf(readWb(F.f3));
      check('P1', 'entry-3', 'a third stamp (B6 again, the note cleared) records exactly those two cells', e3.length === 3 && J(keys(e3[2].payload.ops)) === J(['BACKUP!F2', 'BACKUP!B6']) && e3[2].payload.ops[0].after === null, e3[2] && keys(e3[2].payload.ops));
      D.e3 = e3;
    });
    verdict('P1');

    // ═══════════════ P2 FILE ═══════════════
    await guard('P2', 'file', 'the downloaded workbooks, re-read in node', async function () {
      var pairs = [['f1', SRC, 1], ['f2', F.f1e, 2], ['f2n', F.f2, 2], ['f3', F.f2e, 3]];
      for (var i = 0; i < pairs.length; i++) {
        var x = await fileFacts(F[pairs[i][0]]), given = cellsOf(readWb(pairs[i][1])), dk = diffKeys(given, x.cells);
        check('P2', 'verify-' + pairs[i][0], pairs[i][0] + ': SheetHistory.verify AND the kernel\'s verifyJournal accept the stored history (' + pairs[i][2] + ' entr' + (pairs[i][2] === 1 ? 'y' : 'ies') + ')', x.verify.ok && x.verify.entries === pairs[i][2] && x.kernel.ok && x.kernel.entries === pairs[i][2], { v: x.verify, k: x.kernel });
        check('P2', 'cells-' + pairs[i][0], pairs[i][0] + ': every visible cell and formula equals the file the page was given (' + Object.keys(given).length + ' cells, 0 differ): the page touched only _door_history', dk.length === 0 && Object.keys(given).length === Object.keys(x.cells).length, dk);
        check('P2', 'hidden-' + pairs[i][0], pairs[i][0] + ': _door_history is very hidden (2), no stored cell over 32,767 characters, no character beyond U+FFFF stored', x.hidden === 2 && x.longest <= 32767 && !x.astral, { hidden: x.hidden, longest: x.longest });
        check('P2', 'shim-' + pairs[i][0], pairs[i][0] + ': the Excel shim\'s own Check history reads the same entries (OK, ' + pairs[i][2] + ')', x.check.verdict === 'OK' && x.check.history.entries === pairs[i][2], x.check);
      }
      var x3 = await fileFacts(F.f3), st = await x3.shim.cellHistory({ sheet: 'BACKUP', cell: 'B6' });
      check('P2', 'shim-story', 'the Excel shim\'s Cell history on the page-written file equals the engine\'s cellStory (B6: 3 values)', st.verdict === 'STORY' && st.story.length === 3 && J(st.story) === J(SH.cellStory(x3.entries, 'BACKUP', 'B6')), st.story);
      var names = readWb(F.f3).SheetNames;
      check('P2', 'sheets', 'the workbook holds its own sheets plus _door_history only (' + J(names) + ')', J(names) === J(readWb(SRC).SheetNames.concat([SA.HISTORY])), names);
    });
    verdict('P2');

    // ═══════════════ P3 STORY ═══════════════
    await guard('P3', 'story', 'a cell\'s story on the page vs the engine', async function () {
      await openFile(page, F.f3); var e = D.e3 || [];
      var cases = [['B6', 3], ['F2', 2], ['A1', 1], ['B9', 2]];
      for (var i = 0; i < cases.length; i++) {
        if (cases[i][0] === 'F2') await goStep(page, 2);                       // F2 is empty now: it is clicked in the sheet as it was at step 2
        var hit = await cellStory(page, cases[i][0]), d = await dom(page), want = SH.cellStory(e, 'BACKUP', cases[i][0]);
        check('P3', 'story-' + cases[i][0], 'BACKUP!' + cases[i][0] + ': the story on screen is the engine\'s cellStory, line for line (' + cases[i][1] + ' value(s): who, when, before, after, typed-over)', hit && d.story.length === cases[i][1] && J(storyKey(d.story)) === J(storyKey(want)) && J(d.selected) === J([cases[i][0]]), { dom: storyKey(d.story), want: storyKey(want), selected: d.selected });
        if (cases[i][0] === 'F2') await goStep(page, 'now');
      }
      var dB = await dom(page), l2 = dB.story[1] || { text: '' };
      check('P3', 'words', 'the B9 story says in words who typed over the formula and when (Ben; "typed over a formula")', dB.story.length === 2 && /Ben/.test(l2.text) && /typed over a formula/.test(l2.text) && /UTC/.test(l2.text), dB.story);
      await cellStory(page, 'C5'); var dE = await dom(page);
      check('P3', 'empty', 'an empty cell never touched: no line, and the page says there is no recorded history for it', dE.story.length === 0 && /No recorded history for BACKUP!C5/.test(dE.storyHead), { head: dE.storyHead, story: dE.story });
    });
    verdict('P3');

    // ═══════════════ P4 REWIND ═══════════════
    await guard('P4', 'rewind', 'the sheet at every step', async function () {
      await openFile(page, F.f3); var e = D.e3 || [], bad = [], markBad = [], judged = 0, d, n;
      for (n = 1; n <= e.length; n++) {
        await goStep(page, n); var snap = SH.asOf(e, n), sheets = Object.keys(snap); d = await dom(page);
        if (J(d.tabs) !== J(sheets)) { bad.push('tabs@' + n + ' ' + J(d.tabs)); continue; }
        for (var i = 0; i < sheets.length; i++) {
          await goSheet(page, sheets[i]); d = await dom(page); judged += Object.keys(snap[sheets[i]]).length;
          var dk = diffKeys(d.grid, gridOf(snap, sheets[i])); if (dk.length) bad.push(n + ':' + sheets[i] + ':' + dk.slice(0, 4).join(','));
          var wm = sorted(e[n - 1].payload.ops.filter(function (o) { return o.sheet === sheets[i]; }).map(function (o) { return o.cell; })); if (J(sorted(d.marks)) !== J(wm)) markBad.push(n + ':' + sheets[i] + ' ' + J(d.marks).slice(0, 80) + ' want ' + J(wm).slice(0, 80));
        }
      }
      check('P4', 'grid', 'for EVERY step N (1..' + e.length + ') and every sheet the grid on screen equals asOf(N) cell for cell (value and formula; ' + judged + ' cells judged)', e.length === 3 && bad.length === 0 && judged === N0 * 3 + 1, { bad: bad, judged: judged });
      check('P4', 'marks', 'at every step the marked cells are exactly the cells that step changed', e.length === 3 && markBad.length === 0, markBad);
      await goStep(page, 2); await goSheet(page, 'BACKUP'); var d2 = await dom(page);
      check('P4', 'step-2', 'step 2 shows what "Now" does not: B9 = 600 with no formula, the note in F2, B6 = ' + B6a + '; the page says whose step it is', !!d2.grid.B9 && d2.grid.B9.v === 600 && d2.grid.B9.f === null && !!d2.grid.F2 && d2.grid.F2.v === 'checked by QS' && d2.grid.B6.v === B6a && /step 2/.test(d2.viewNote) && /Ben/.test(d2.viewNote) && d2.stepShown, { B9: d2.grid.B9, F2: d2.grid.F2, note: d2.viewNote });
      await goStep(page, 1); await goSheet(page, 'BACKUP'); var d1 = await dom(page);
      check('P4', 'step-1', 'step 1 shows the sheet before anyone edited it: B9 holds =SUM(B5:B8) = ' + S0.BACKUP.B9.v + ', F2 empty, B6 = ' + B6, !!d1.grid.B9 && d1.grid.B9.f === 'SUM(B5:B8)' && d1.grid.B9.v === S0.BACKUP.B9.v && !d1.grid.F2 && d1.grid.B6.v === B6, { B9: d1.grid.B9, B6: d1.grid.B6 });
      for (n = 1; n <= e.length; n++) {
        await goStep(page, n); var f = await download(page, '#b-download-step'), x = await fileFacts(f), sn = await snapOf(x.wb);
        check('P4', 'version-' + n, '"Download this version" at step ' + n + ' (' + path.basename(f) + '): the visible sheets ARE asOf(' + n + '), the history is entries 1..' + n + ' only and verifies (engine + kernel)', canon(sn) === canon(SH.asOf(e, n)) && x.lines.length === n && x.verify.ok && x.kernel.ok && J(x.lines) === J(linesOf(readWb(F.f3)).slice(0, n)) && new RegExp('_as_of_step_' + n + '\\.xlsx$').test(f), { lines: x.lines.length, v: x.verify, diff: diffKeys(gridOf(sn, 'BACKUP'), gridOf(SH.asOf(e, n), 'BACKUP')) });
        if (n < e.length) { var p2 = await newPage(); await openFile(p2, f); var dr = await dom(p2); await p2.close();
          check('P4', 'reopen-' + n, 'that file re-opens on the page as intact at step ' + n + ' (' + n + ' entr' + (n === 1 ? 'y' : 'ies') + ', nothing changed since)', dr.state === 'intact' && dr.lines === n && dr.pending.length === 0, { state: dr.state, lines: dr.lines, pending: dr.pending }); }
      }
      await goStep(page, 'now'); var dn = await dom(page);
      check('P4', 'now', '"Now" returns to the file as it is; the open workbook itself was never rewound (3 entries, intact)', dn.state === 'intact' && dn.lines === 3 && !dn.stepShown, { state: dn.state, lines: dn.lines });
    });
    verdict('P4');

    // ═══════════════ P5 MERGE ═══════════════
    await guard('P5', 'merge', 'two copies of one stamped file', async function () {
      // two people take the genesis file f1 home: Aisha (A) and Ben (B)
      var a0 = editOutside(F.f1, 'copy_a_edit.xlsx', function (s) { put(s.BACKUP, 'C5', 'paid'); put(s.BACKUP, 'B7', 11); put(s.BACKUP, 'B8', 77); });
      var b0 = editOutside(F.f1, 'copy_b_edit.xlsx', function (s) { put(s.BACKUP, 'C6', 'query'); put(s.BACKUP, 'B7', 22); put(s.BACKUP, 'B8', 77); });
      await openFile(page, a0); await setName(page, 'Aisha'); await stamp(page); F.cA = await download(page, '#b-download');
      await openFile(page, b0); await setName(page, 'Ben'); await stamp(page); F.cB = await download(page, '#b-download');
      var eA = entriesOf(readWb(F.cA)), eB = entriesOf(readWb(F.cB));
      // refusals first, on Aisha's copy
      await openFile(page, F.cA); await setName(page, 'Aisha');
      var inv = SAMPLE.build(XLSX, { docno: 'HPAGE-1' }); await shimOf(inv, 'Chen').stamp(); F.unrelated = writeWb(inv, 'unrelated.xlsx');
      await openOther(page, F.unrelated); var dU = await dom(page);
      check('P5', 'unrelated', 'an unrelated stamped workbook is refused in words (not a copy of this workbook), nothing offered', dU.merge.verdict === 'REFUSED' && /not a copy of this workbook/.test(dU.merge.text) && !dU.merge.finishShown && dU.lines === 2, dU.merge);
      await openOther(page, SRC); var dN = await dom(page);
      check('P5', 'no-history', 'a workbook with no history is refused in words', dN.merge.verdict === 'REFUSED' && /no history inside/.test(dN.merge.text) && !dN.merge.finishShown, dN.merge);
      var tb = tamper(F.cB, 'copy_b_tampered.xlsx', '"after":{"v":22,', '"after":{"v":23,'); await openOther(page, tb.file); var dT = await dom(page);
      check('P5', 'hand-edited', 'a copy whose history was edited by hand (22 -> 23 inside entry 2) is refused and the entry is named', tb.hits === 1 && dT.merge.verdict === 'REFUSED' && /edited by hand: entry 2 of 2/.test(dT.merge.text) && !dT.merge.finishShown, { hits: tb.hits, m: dT.merge });
      var ub = editOutside(F.cB, 'copy_b_unstamped.xlsx', function (s) { put(s.BACKUP, 'D5', 'late'); }); await openOther(page, ub); var dS = await dom(page);
      check('P5', 'unstamped', 'a copy holding a change that was never stamped is refused and the cell is named (BACKUP!D5)', dS.merge.verdict === 'REFUSED' && /never stamped \(BACKUP!D5\)/.test(dS.merge.text) && !dS.merge.finishShown, dS.merge);
      // the real merge
      await openOther(page, F.cB); var dm = await dom(page), c = dm.merge.conflicts[0] || { a: {}, b: {}, base: {}, buttons: [], text: '' }, before = await fileFacts(await pageBytes(page));
      check('P5', 'combine', 'edits on different cells combine: C6 comes from the other copy and is listed with who made it (Ben); C5 stays', dm.merge.verdict === 'CONFLICTS' && J(dm.merge.applied.map(function (x) { return [x.cell, x.actor]; })) === J([['BACKUP!C6', 'Ben']]), dm.merge);
      check('P5', 'conflict', 'B7 set to 11 and to 22 is ONE conflict showing BOTH values, who made each (Aisha, Ben) and the value before both (' + B7 + ')', dm.merge.conflicts.length === 1 && c.cell === 'BACKUP!B7' && c.a.v === 11 && c.b.v === 22 && c.base.v === B7 && c.whoA === 'Aisha' && c.whoB === 'Ben' && /Aisha set it to 11/.test(c.text) && /Ben set it to 22/.test(c.text) && c.text.indexOf(String(B7)) >= 0, c);
      check('P5', 'same-change', 'B8 set to 77 on both sides is NOT a conflict and is not listed as coming from the other copy', dm.merge.verdict === 'CONFLICTS' && dm.merge.conflicts.every(function (x) { return x.cell !== 'BACKUP!B8'; }) && dm.merge.applied.every(function (x) { return x.cell !== 'BACKUP!B8'; }), dm.merge);
      check('P5', 'not-silent', 'until the user picks: no choice is pre-selected, Finish is disabled, and the open workbook is unchanged (2 entries, B7 = 11, C6 empty)', c.buttons.length === 3 && c.buttons.every(function (b) { return !b.on; }) && dm.merge.finishShown && dm.merge.finishDisabled === true && before.lines.length === 2 && cellIs(before.cells, 'BACKUP!B7', 11) && !before.cells['BACKUP!C6'], { buttons: c.buttons, finishDisabled: dm.merge.finishDisabled, lines: before.lines.length });
      if (dm.merge.finishShown && !dm.merge.finishDisabled) { await act(page, function () { return page.click('#b-merge'); }); var dx = await dom(page);            // only reached when the button is wrongly enabled
        check('P5', 'engine-refuses', 'a Finish forced before any pick writes nothing (the engine refuses an unpicked conflict)', dx.lines === 2 && dx.merge.verdict === 'REFUSED', dx.merge); await openOther(page, F.cB); }
      await pickSide(page, 'a'); var dp = await dom(page), pb = (dp.merge.conflicts[0] || { buttons: [{}, {}] }).buttons;
      check('P5', 'picked', 'after "Keep 11 (Aisha)" is chosen that choice shows as chosen and Finish is enabled', pb[0].on === true && !pb[1].on && dp.merge.finishDisabled === false, dp.merge);
      await act(page, function () { return page.click('#b-merge'); }); var dd = await dom(page); F.merged = await download(page, '#b-download');
      var x = await fileFacts(F.merged), me = x.entries[2] || { meta: {}, payload: { ops: [] } }, mg = me.meta.merge || {}, th = me.payload.theirs || [];
      check('P5', 'merged-file', 'the merged file (' + path.basename(F.merged) + '): 3 entries, verifies with the engine AND the kernel, the Excel shim reads it (OK, 3)', dd.merge.verdict === 'RECORDED' && x.lines.length === 3 && x.verify.ok && x.kernel.ok && x.check.verdict === 'OK' && /_merged\.xlsx$/.test(F.merged), { m: dd.merge.text, v: x.verify, k: x.kernel.ok });
      check('P5', 'merged-cells', 'it holds the PICKED value B7 = 11, Aisha\'s C5, Ben\'s C6 and B8 = 77; every other visible cell is as in Aisha\'s copy', cellIs(x.cells, 'BACKUP!B7', 11) && cellIs(x.cells, 'BACKUP!C5', 'paid') && cellIs(x.cells, 'BACKUP!C6', 'query') && cellIs(x.cells, 'BACKUP!B8', 77) && J(diffKeys(cellsOf(readWb(F.cA)), x.cells)) === J(['BACKUP!C6']), { B7: x.cells['BACKUP!B7'], diff: diffKeys(cellsOf(readWb(F.cA)), x.cells) });
      check('P5', 'merge-entry', 'the merge is ONE entry on Aisha\'s chain: its cells are what changed in her copy (C6), meta.merge names the fork (1), Ben\'s head hash and the pick; Ben\'s entry is carried inside', J(keys(me.payload.ops)) === J(['BACKUP!C6']) && mg.fork === 1 && mg.other === eB[1].hash && mg.otherEntries === 1 && J(mg.picks) === J([{ sheet: 'BACKUP', cell: 'B7', pick: 'a' }]) && th.length === 1 && th[0].hash === eB[1].hash && me.prev === eA[1].hash && me.actor === 'Aisha', { ops: keys(me.payload.ops), mg: mg });
      check('P5', 'after-merge', 'after the merge the page says the sheet matches the last stamp (3 entries), and offers the file under a merged name', dd.state === 'intact' && dd.lines === 3 && dd.pending.length === 0 && /_merged\.xlsx$/.test(dd.fileName), { state: dd.state, lines: dd.lines, name: dd.fileName });
      await cellStory(page, 'B7'); var ds = await dom(page);
      check('P5', 'story-both', 'the story of B7 after the merge names BOTH people: genesis, Aisha -> 11, and Ben -> 22 marked as made in the other copy', J(storyKey(ds.story)) === J(storyKey(SH.cellStory(x.entries, 'BACKUP', 'B7'))) && ds.story.length === 3 && ds.story.some(function (s) { return s.actor === 'Ben' && s.after.v === 22 && s.mergedAt === 3 && /other copy/.test(s.text); }) && ds.story.some(function (s) { return s.actor === 'Aisha' && s.after.v === 11; }), ds.story);
      await openOther(page, F.cB); var d2 = await dom(page);
      check('P5', 'again', 'the same copy opened again is not merged twice (said in words, nothing offered)', d2.merge.verdict === 'NO-OP' && /already merged/.test(d2.merge.text) && !d2.merge.finishShown, d2.merge);
      // the other direction, taking THEIRS: Ben merges Aisha's copy and takes her 11
      await openFile(page, F.cB); await setName(page, 'Ben'); await openOther(page, F.cA); await pickSide(page, 'b'); await act(page, function () { return page.click('#b-merge'); });
      var fb = await download(page, '#b-download'), xb = await fileFacts(fb);
      check('P5', 'theirs', 'the other way round (Ben merges Aisha\'s copy and takes hers): B7 = 11, C5 and C6 both there, verifies; both merged files hold the same visible cells', xb.verify.ok && xb.kernel.ok && xb.lines.length === 3 && cellIs(xb.cells, 'BACKUP!B7', 11) && diffKeys(xb.cells, x.cells).length === 0, { v: xb.verify, diff: diffKeys(xb.cells, x.cells) });
      // a pending change on THIS side
      await openFile(page, editOutside(F.cA, 'copy_a_unstamped.xlsx', function (s) { put(s.BACKUP, 'D6', 'mine, late'); })); await openOther(page, F.cB); var dq = await dom(page);
      check('P5', 'mine-unstamped', 'when the OPEN workbook holds an unstamped change the merge is refused and names it (BACKUP!D6): stamp first', dq.merge.verdict === 'REFUSED' && /not stamped yet \(BACKUP!D6\)/.test(dq.merge.text) && !dq.merge.finishShown, dq.merge);
    });
    verdict('P5');

    // ═══════════════ P6 TAMPER ═══════════════
    await guard('P6', 'tamper', 'a history edited by hand', async function () {
      var t = tamper(F.f3, 'tampered.xlsx', '"after":{"v":600,', '"after":{"v":601,'), rows0 = rowsOf(readWb(t.file));
      await openFile(page, t.file); var d = await dom(page);
      check('P6', 'named', 'one recorded value edited (600 -> 601 inside entry 2): the page names entry 2 of 3 and says a recorded value was edited', t.hits === 1 && d.state === 'broken' && /entry 2 of 3/.test(d.status) && /recorded cell value was edited/.test(d.status), { hits: t.hits, state: d.state, status: d.status });
      check('P6', 'nothing-shown', 'nothing is built on it: Stamp disabled, no sheet / steps, no story, no merge, no download offered', d.stampDisabled === true && !d.sheetShown && !d.storyShown && !d.mergeShown && !d.downloadShown, { stampDisabled: d.stampDisabled, sheet: d.sheetShown, story: d.storyShown, merge: d.mergeShown, dl: d.downloadShown });
      await page.evaluate(function () { var b = document.getElementById('b-stamp'); b.disabled = false; b.click(); }); await sleep(500);
      var after = await fileFacts(await pageBytes(page)), d2 = await dom(page);
      check('P6', 'refused', 'a Stamp forced on it (button re-enabled by hand) records nothing: the stored history rows are byte for byte the tampered file\'s (3 rows)', J(rowsOf(after.wb)) === J(rows0) && after.lines.length === 3 && d2.state === 'broken', { lines: after.lines.length, state: d2.state });
      var del = editOutside(F.f3, 'entry_removed.xlsx', function (s) { var h = s[SA.HISTORY], r = XLSX.utils.sheet_to_json(h, { header: 1, raw: true, defval: '' }); r.splice(1, 1); var n = XLSX.utils.aoa_to_sheet(r.map(function (x) { return x.map(function (c) { return { t: 's', v: String(c) }; }); })); Object.keys(h).forEach(function (k) { delete h[k]; }); Object.assign(h, n); });
      await openFile(page, del); var d3 = await dom(page);
      check('P6', 'removed', 'an entry REMOVED from the middle (entry 2 of 3) is named too: the chain breaks at the entry that follows', d3.state === 'broken' && /entry 2 of 2/.test(d3.status) && /removed, reordered or inserted/.test(d3.status), d3.status);
    });
    verdict('P6');

    // ═══════════════ P7 LIGHT ═══════════════
    await guard('P7', 'light', 'what the page loads and sends', async function () {
      var L = D.load || { requests: -1, bytes: -1, urls: [] }, heavy = L.urls.filter(function (u) { return /ws_kernel|kernel|sql-wasm|\.wasm|\.db|ad_seed|ad_process|sheet_door|runner\.js/.test(u); });
      say('§HPAGE-LOADED requests=' + L.requests + ' bytes=' + L.bytes + ' files=' + J(L.urls.map(function (u) { return u.replace(/^GET /, ''); })));
      check('P7', 'ceiling', 'the page is ready after <= 8 requests and <= 400,000 bytes served (got ' + L.requests + ' requests, ' + L.bytes + ' bytes)', L.requests > 0 && L.requests <= 8 && L.bytes > 250000 && L.bytes <= 400000, L);
      check('P7', 'no-kernel', 'no kernel, no SQL engine, no seed and no books code is requested, and none is defined in the page', heavy.length === 0 && !!D.cost0 && D.cost0.kernel === false && J(L.urls.map(function (u) { return path.basename(u); }).sort()) === J(['history.html', 'history.js', 'host_shim.js', 'sheet_history.js', 'xlsx.mini.min.js', 'xlsx_host.js']), { heavy: heavy, got: L.urls, cost: D.cost0 });
      check('P7', 'self-count', 'the page\'s own count agrees with the server\'s (the page reports ' + (D.cost0 && D.cost0.bytes) + ' bytes in ' + (D.cost0 && D.cost0.requests) + ' requests)', !!D.cost0 && D.cost0.bytes === L.bytes && D.cost0.requests === L.requests, { page: D.cost0, server: L });
      check('P7', 'nothing-sent', 'through open, stamp, story, rewind, merge and download: every request was a GET, none left the origin, and the server saw NO request after a page was ready (' + NET.requests + ' requests = the page loads alone)', NET.notGet.length === 0 && B.external.length === 0 && page.__reqs.every(function (r) { return /^GET /.test(r); }) && NET.requests === B.loaded, { notGet: NET.notGet, external: B.external, server: NET.requests, loads: B.loaded });
      check('P7', 'no-page-error', 'no script error on the page through the whole run', B.pageErrors.length === 0, B.pageErrors);
    });
    verdict('P7');

    // ═══════════════ P8 PHONE ═══════════════
    await guard('P8', 'phone', 'a phone-sized touch screen', async function () {
      var p = await newPage({ phone: true }), w = [], missed = [], fit = function (d, at) { w.push(at + ' ' + d.scrollW + '/' + d.innerW); return d.scrollW <= d.innerW && d.innerW === 390; };          // a too-wide page on a phone either scrolls sideways or is shrunk (the window reads wider than 390)
      var d0 = await dom(p), ok0 = fit(d0, 'load');
      if (!ok0) { check('P8', 'no-sideways-scroll', 'scrollWidth <= innerWidth and the window still 390 wide on load (' + w.join(', ') + '); the page does not fit, so nothing further is attempted on it', false, w); await p.close(); return; }
      await openFile(p, F.f2e); var d1 = await dom(p), ok1 = fit(d1, 'open');
      await setName(p, 'Aisha'); await act(p, function () { return touch(p, '#b-stamp', missed); }); var d2 = await dom(p), ok2 = fit(d2, 'stamp');
      check('P8', 'tap-stamp', 'a Stamp made by TAP on a 390 x 844 touch screen records (entry 3, 2 cells)', d1.state === 'pending' && d2.stamp.verdict === 'RECORDED' && d2.lines === 3 && d2.state === 'intact', { state: d1.state, stamp: d2.stamp });
      await act(p, function () { return touch(p, '#grid td[data-cell="B6"]', missed); }); var d3 = await dom(p), ok3 = fit(d3, 'story');
      check('P8', 'tap-story', 'a cell tapped shows its story (B6: 3 values)', d3.story.length === 3, d3.story);
      await act(p, function () { return touch(p, '#steps button[data-step="2"]', missed); }); var d4 = await dom(p), ok4 = fit(d4, 'rewind');
      await openFile(p, F.cA); await openOther(p, F.cB); var d5 = await dom(p), ok5 = fit(d5, 'conflict');
      await touch(p, '#conflicts button[data-pick="b"]', missed); await act(p, function () { return touch(p, '#b-merge', missed); }); var d6 = await dom(p), ok6 = fit(d6, 'merged');
      check('P8', 'tap-merge', 'a conflict picked and the merge finished by TAP (theirs: B7 = 22)', d5.merge.conflicts.length === 1 && d6.merge.verdict === 'RECORDED' && d6.lines === 3 && !!d6.grid.B7 && d6.grid.B7.v === 22, { m: d6.merge, B7: d6.grid.B7 });
      check('P8', 'touches-land', 'every one of the 5 touches landed on its element (Stamp, a cell, a step, a choice, Finish)', missed.length === 0, missed);
      check('P8', 'no-sideways-scroll', 'scrollWidth <= innerWidth = 390 at every point (' + w.join(', ') + ')', ok0 && ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && d0.innerW === 390, w);
      say('§HPAGE-PHONE viewport=390x844 dpr=3 touch=true emulated=true ' + w.join(' ') + ' (device emulation, not a phone)');
      await p.close();
    });
    verdict('P8');

    // ═══════════════ P10 COST ═══════════════
    await guard('P10', 'cost', 'the weight is logged', async function () {
      var lines = page.__logs.filter(function (l) { return /^§SHIST-PAGE-COST /.test(l); }), st = page.__logs.filter(function (l) { return /^§SHIST-PAGE-STAMP verdict=RECORDED/.test(l); }), op = page.__logs.filter(function (l) { return /^§SHIST-PAGE-OPEN /.test(l); });
      check('P10', 'logged', 'the page logs §SHIST-PAGE-COST (requests, bytes, ms to ready, heap) and per-action ms on OPEN and STAMP', lines.length === 1 && /requests=\d+ bytes=\d+ readyMs=\d+ heapMB=-?\d+ kernelLoaded=false/.test(lines[0]) && st.length >= 3 && /ms=\d+/.test(st[0]) && op.length >= 3, lines);
      say('  page: ' + (lines[0] || '(none)')); say('  page: ' + (op[0] || '')); say('  page: ' + (st[0] || '')); say('  page: ' + (st[1] || ''));
      page.__logs.filter(function (l) { return /^§SHIST-PAGE-MERGE verdict=(CONFLICTS|RECORDED)/.test(l); }).slice(0, 2).forEach(function (l) { say('  page: ' + l.slice(0, 330)); });
      say('§HPAGE-COST pageRequests=' + D.load.requests + ' pageBytes=' + D.load.bytes + ' fileBytes: source=' + fs.statSync(SRC).size + ' stamped1=' + fs.statSync(F.f1).size + ' stamped3=' + fs.statSync(F.f3).size + ' merged=' + (F.merged ? fs.statSync(F.merged).size : -1) + ' historyChars: genesis=' + linesOf(readWb(F.f1))[0].length + ' all3=' + linesOf(readWb(F.f3)).join('').length);
      // measured, not judged: a writer that stores NO formula result (openpyxl, the §12 hazard). The history survives; every formula cell reads as changed (its value is gone).
      var py = path.join(TMP, 'openpyxl_saved.xlsx'), pr = cp.spawnSync('python3', ['-c', 'import sys, openpyxl\nwb = openpyxl.load_workbook(sys.argv[1]); wb.save(sys.argv[2])', F.f1, py], { encoding: 'utf8' });
      if (pr.status !== 0 || !fs.existsSync(py)) say('§HPAGE-NOTE openpyxl re-save NOT measured (python3 / openpyxl missing)');
      else { var px = await fileFacts(py), pp = px.verify.ok ? SH.diff(SH.asOf(px.entries, px.entries.length), await snapOf(px.wb)) : [], nf = Object.keys(S0).reduce(function (n, sh) { return n + Object.keys(S0[sh]).filter(function (a) { return S0[sh][a].f != null; }).length; }, 0);
        await openFile(page, py); var dpy = await dom(page);
        say('§HPAGE-NOTE openpyxl re-save (no formula results stored): history verifies=' + px.verify.ok + ' hidden=' + px.hidden + ' page state=' + dpy.state + ' listed=' + dpy.pending.length + ' of which formula cells whose value is gone=' + pp.filter(function (o) { return o.after && o.after.f != null && o.after.v == null; }).length + ' (formula cells in the workbook=' + nf + ') e.g. "' + (dpy.pending[0] ? dpy.pending[0].text.slice(0, 90) : '') + '"'); }
    });
    verdict('P10');

    // ═══════════════ P9 WPS (the real writer; the history must survive the first real program) ═══════════════
    if (!MUTANT && process.env.HPAGE_WPS !== '0') {
      var WD = require('./wps_driver.js'), T = WD.tools(), RUN = path.join(os.homedir(), 'hpage-wps-run-' + process.pid);
      if (!T.wps || !T.Xvfb || !T.xdotool || !T.xprop) say('§HPAGE-WPS not run: missing ' + Object.keys(T).filter(function (k) { return !T[k]; }).join(',') + ' (P9 judges nothing)');
      else await guard('P9', 'wps', 'the real WPS writer', async function () {
        fs.mkdirSync(RUN, { recursive: true });
        try {
          var work = path.join(RUN, 'stamped.xlsx'); fs.copyFileSync(F.f2, work);
          var r = await WD.resave(work), xml = cp.spawnSync('sh', ['-c', 'unzip -p "' + work + '" "xl/worksheets/*.xml" | grep -c "www.wps.cn"'], { encoding: 'utf8' }).stdout.trim();
          say('§HPAGE-WPS-RESAVE wps=' + WD.VERSION + ' ok=' + r.ok + ' bytesIn=' + r.bytesIn + ' bytesOut=' + r.bytesOut + ' ms=' + r.ms + ' wpsNamespace=' + (Number(xml) > 0) + ' handled=' + J(r.handled) + (r.err ? ' err="' + r.err + '"' : ''));
          if (!(r.ok && r.bytesOut !== r.bytesIn && Number(xml) > 0)) { say('§HPAGE-WPS WPS did not write the file: P9 judges nothing'); return; }
          var saved = path.join(TMP, 'wps_saved.xlsx'); fs.copyFileSync(work, saved);
          var x = await fileFacts(saved), given = await fileFacts(F.f2);
          check('P9', 'survives', 'after WPS saved it: the stored history is byte for byte the same 2 lines, verifies (engine + kernel), still very hidden', J(x.lines) === J(given.lines) && x.verify.ok && x.kernel.ok && x.hidden === 2, { v: x.verify, hidden: x.hidden });
          var p = await newPage(); await openFile(p, saved); var d = await dom(p), pend = SH.diff(SH.asOf(x.entries, 2), await snapOf(x.wb));
          say('§HPAGE-WPS-BIND state=' + d.state + ' changedByWps=' + J(d.pending.map(function (q) { return q.text; })));
          check('P9', 'bound', 'the page binds the WPS-saved file: what WPS itself changed (' + d.pending.length + ' cell(s)) is exactly what the engine finds in node, listed as changes since the last stamp, not as an error', (d.state === 'intact' || d.state === 'pending') && J(d.pending.map(function (q) { return q.cell; })) === J(keys(pend)), { state: d.state, pending: d.pending });
          await p.close();
          var edited = editOutside(saved, 'wps_saved_edited.xlsx', function (s) { put(s.BACKUP, 'C8', 'after WPS'); });
          p = await newPage(); await openFile(p, edited); await setName(p, 'Aisha'); await stamp(p); var d2 = await dom(p), f = await download(p, '#b-download'), y = await fileFacts(f), e3 = y.entries[2] || { payload: { ops: [] } }; await p.close();
          check('P9', 'stamps-on', 'a Stamp after a further edit chains on: entry 3 holds that cell (plus what WPS changed), prev = entry 2, the file verifies', d2.stamp.verdict === 'RECORDED' && y.lines.length === 3 && y.verify.ok && y.kernel.ok && e3.prev === x.entries[1].hash && J(sorted(keys(e3.payload.ops))) === J(sorted(keys(pend).concat(['BACKUP!C8']))), { stamp: d2.stamp, ops: keys(e3.payload.ops) });
        } finally {
          fs.rmSync(RUN, { recursive: true, force: true });
          var left = WD.left(); say('§HPAGE-WPS-CLEANUP started xvfb=' + J(WD.STARTED.xvfb) + ' wps=' + J(WD.STARTED.wps) + ' stillRunning=' + (left ? J(left.split('\n').map(function (l) { return l.trim().slice(0, 60); })) : 'none') + ' runDirRemoved=' + !fs.existsSync(RUN));
        }
      });
      verdict('P9');
    }
    if (ACTIVE) say('§HPAGE-MUTANT-SERVED name=' + ACTIVE.name + ' file=' + ACTIVE.file + ' matches=' + NET.mutantApplied);
    await B.browser.close();
  }
  srv.srv.close();

  // ═══════════════ E1 MERGE-ENTRY (engine, node) ═══════════════
  if (wants('E1')) {
    await guard('E1', 'engine', 'a merge as one entry of the chain', async function () {
      var mk = function (base, edits) { var s = JSON.parse(J(base)); Object.keys(edits).forEach(function (a) { s.BACKUP[a] = { v: edits[a], f: null }; }); return s; };
      var g = await SH.record([], null, S0, 'owner', '2026-11-28T01:00:00.000Z'), base = [g.entry];
      var A1 = mk(S0, { C5: 'paid', B7: 11, B8: 77 }), A2 = mk(A1, { D5: 'ok' }), B1 = mk(S0, { C6: 'query', B7: 22, B8: 77 });
      var a1 = await SH.record(base, S0, A1, 'Aisha', '2026-11-28T02:00:00.000Z'), a = base.concat([a1.entry]), a2 = await SH.record(a, A1, A2, 'Aisha', '2026-11-28T03:00:00.000Z'); a = a.concat([a2.entry]);
      var b1 = await SH.record(base, S0, B1, 'Ben', '2026-11-28T02:30:00.000Z'), b = base.concat([b1.entry]);
      var r0 = await SH.mergeEntry(a, b, {}, 'Aisha', '2026-11-28T04:00:00.000Z');
      check('E1', 'unpicked', 'a conflict without a pick: REFUSED, the conflict named, no entry made', r0.verdict === 'REFUSED' && !r0.entry && !!r0.unresolved && r0.unresolved.length === 1 && r0.unresolved[0].cell === 'B7', { v: r0.verdict, u: r0.unresolved, e: !!r0.entry });
      var want = function (p) { var s = mk(A2, { C6: 'query' }); if (p === 'b') s.BACKUP.B7 = { v: 22, f: null }; if (p === 'base') s.BACKUP.B7 = JSON.parse(J(S0.BACKUP.B7)); return s; }, bad = [];
      for (var i = 0; i < 3; i++) {
        var p = ['a', 'b', 'base'][i], r = await SH.mergeEntry(a, b, { 'BACKUP!B7': p }, 'Aisha', '2026-11-28T04:00:00.000Z'), all = a.concat(r.entry ? [r.entry] : []), lines = all.map(function (e) { return J(e); });
        var v = await SH.verify(lines), kv = K.verifyJournal(lines.join('\n'));
        if (!(r.verdict === 'RECORDED' && v.ok && kv.ok && kv.entries === 4 && canon(SH.asOf(all, 4)) === canon(want(p)) && canon(r.snapshot) === canon(want(p)) && J(JSON.parse(r.line)) === J(r.entry))) bad.push({ p: p, verdict: r.verdict, v: v, k: kv.ok, B7: SH.asOf(all, 4).BACKUP.B7, ops: r.entry && keys(r.entry.payload.ops) });
        if (p === 'b') E1b = { r: r, all: all, lines: lines };
      }
      check('E1', 'picks', 'for each pick (mine / theirs / the value before both): the entry is RECORDED, verifies with the engine AND the kernel, and asOf of it = the other copy\'s edits + that pick', bad.length === 0, bad);
      var e = E1b.r.entry, m = e.meta.merge;
      check('E1', 'shape', 'the entry: ops = what changes in the open copy (C6, B7), meta.merge = { fork 1, the other head hash, 1 entry, the pick }, payload.theirs = the other copy\'s entry; the chain stays linear (prev = the open copy\'s head)', J(sorted(keys(e.payload.ops))) === J(['BACKUP!B7', 'BACKUP!C6']) && m.fork === 1 && m.other === b[1].hash && m.otherEntries === 1 && J(m.picks) === J([{ sheet: 'BACKUP', cell: 'B7', pick: 'b' }]) && e.payload.theirs.length === 1 && e.payload.theirs[0].hash === b[1].hash && e.prev === a[2].hash && e.seq === 4, { ops: keys(e.payload.ops), m: m });
      var forge = function (fn) { var t = JSON.parse(E1b.lines[3]); fn(t); return SH.verify(E1b.lines.slice(0, 3).concat([J(t)])); };
      var v1 = await forge(function (t) { t.payload.theirs[0].payload.ops[0].after.v = 'forged'; }), v2 = await forge(function (t) { t.meta.merge.other = b[0].hash; }), v3 = await forge(function (t) { delete t.payload.theirs; }), v4 = await forge(function (t) { t.payload.theirs[0].actor = 'Mallory'; });
      check('E1', 'carried-tamper', 'an edit INSIDE the carried entries is caught at the merge entry (a value; who made it), so is a changed head hash and a removed carried list', !v1.ok && v1.brokenAt === 4 && /merge/.test(v1.why) && !v4.ok && v4.brokenAt === 4 && /merge/.test(v4.why) && !v2.ok && v2.brokenAt === 4 && !v3.ok && v3.brokenAt === 4 && /missing/.test(v3.why), { v1: v1, v2: v2, v3: v3, v4: v4 });
      var tk = JSON.parse(E1b.lines[3]); tk.payload.theirs[0].payload.ops[0].after.v = 'forged';
      say('  §HPAGE-NOTE the kernel\'s verifyJournal on the forged carried entry: ok=' + K.verifyJournal(E1b.lines.slice(0, 3).concat([J(tk)]).join('\n')).ok + ' (it checks the chain; the carried entries are the engine\'s verify to check)');
      var st = SH.cellStory(E1b.all, 'BACKUP', 'B7');
      check('E1', 'story', 'cellStory of the conflict cell: genesis, Aisha 11, Ben 22 (marked mergedAt 4), then the merge entry setting 22', st.length === 4 && J(st.map(function (s) { return [s.seq, s.actor, s.after.v, s.mergedAt || null]; })) === J([[1, 'owner', B7, null], [2, 'Aisha', 11, null], [2, 'Ben', 22, 4], [4, 'Aisha', 22, null]]), st);
      var again = await SH.mergeEntry(E1b.all, b, {}, 'Aisha'), nothing = await SH.mergeEntry(a, base, {}, 'Aisha'), unrelated = await SH.mergeEntry(a, [(await SH.record([], null, { X: { A1: { v: 1, f: null } } }, 'z', '2026-01-01T00:00:00.000Z')).entry], {}, 'Aisha');
      check('E1', 'no-op', 'the same copy merged again is a NO-OP; a copy with nothing new is a NO-OP; an unrelated history is REFUSED; none makes an entry', again.verdict === 'NO-OP' && /already merged/.test(again.why) && nothing.verdict === 'NO-OP' && unrelated.verdict === 'REFUSED' && !again.entry && !nothing.entry && !unrelated.entry, { again: again.verdict, nothing: nothing.verdict, unrelated: unrelated.verdict });
      var S4 = SH.asOf(E1b.all, 4), S5 = mk(S4, { D8: 'next day' }), nx = await SH.record(E1b.all, S4, S5, 'Aisha', '2026-11-29T01:00:00.000Z'), on = E1b.all.concat([nx.entry]);
      var back = await SH.mergeEntry(b, on, {}, 'Ben', '2026-11-29T02:00:00.000Z'), bl = b.concat(back.entry ? [back.entry] : []).map(function (x) { return J(x); }), vb = await SH.verify(bl);
      check('E1', 'on-and-back', 'a Stamp chains on a merge entry; Ben then merges Aisha\'s merged copy back with no conflict left, and that merge OF a merge verifies (engine + kernel); both ends hold the same sheet', nx.verdict === 'RECORDED' && (await SH.verify(on.map(function (x) { return J(x); }))).ok && back.verdict === 'RECORDED' && back.merge.conflicts.length === 0 && vb.ok && K.verifyJournal(bl.join('\n')).ok && canon(back.snapshot) === canon(SH.asOf(on, 5)), { nx: nx.verdict, back: back.verdict, conflicts: back.merge && back.merge.conflicts, vb: vb });
      var v5 = { ok: true }; if (back.entry) { var t5 = JSON.parse(bl[2]); t5.payload.theirs[2].payload.theirs[0].payload.ops[0].after.v = 'deep forgery'; v5 = await SH.verify(bl.slice(0, 2).concat([J(t5)])); }
      check('E1', 'nested-tamper', 'an edit two merges deep (inside the carried entries of a carried merge entry) is still caught', !v5.ok && v5.brokenAt === 3, v5);
      if (!process.env.HPAGE_ENGINE) { var old = cp.spawnSync(process.execPath, [path.join(__dirname, 'witness_sheet_history.js')], { encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '', ol = (old.match(/§SHIST-VERDICT[^\n]*/) || ['(no verdict line)'])[0];
        check('E1', 'old', 'W-SHEET-HISTORY is unchanged on the extended engine: ' + ol.slice(0, 44), /§SHIST-VERDICT PASS judged=20 failed=0/.test(ol), ol); }
    });
    verdict('E1');
  }

  // ═══════════════ MUTANTS ═══════════════
  if (process.env.HPAGE_MUTANTS === '1' && !MUTANT) {
    var killed = 0;
    MUT.forEach(function (m) {
      var out = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { HPAGE_MUTANT: m.name, HPAGE_MUTANTS: '', HPAGE_ONLY: 'P' }), encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '';
      var line = (out.match(new RegExp('§HPAGE-' + m.kills + ' verdict=\\w+[^\\n]*')) || [''])[0], applied = (out.match(/§HPAGE-MUTANT-SERVED[^\n]*matches=(\w+)/) || [])[1];
      var state = applied !== '1' ? 'NOT-APPLIED' : !/verdict=FAIL/.test(line) ? 'SURVIVED' : !/threw=0/.test(line) ? 'CRASHED' : 'KILLED';
      if (state === 'KILLED') killed++;
      say('§HPAGE-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + state + ' matches=' + applied + ' child="' + line + '"');
    });
    var nTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hpage-nmut-'));
    NMUT.forEach(function (m) {
      var src = fs.readFileSync(path.join(ROOT, m.file), 'utf8'), n = src.split(m.from).length - 1;
      if (n !== 1) { say('§HPAGE-MUTANT name=' + m.name + ' kills=' + m.kills + ' NOT-APPLIED matches=' + n); return; }
      var f = path.join(nTmp, m.name + '.js'); fs.writeFileSync(f, src.replace(m.from, m.to));
      var out = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { HPAGE_MUTANT: m.name, HPAGE_MUTANTS: '', HPAGE_ONLY: 'E1', HPAGE_ENGINE: f }), encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '';
      var line = (out.match(new RegExp('§HPAGE-' + m.kills + ' verdict=\\w+[^\\n]*')) || [''])[0], state = !/verdict=FAIL/.test(line) ? 'SURVIVED' : !/threw=0/.test(line) ? 'CRASHED' : 'KILLED';
      if (state === 'KILLED') killed++;
      say('§HPAGE-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + state + ' child="' + line + '"');
    });
    fs.rmSync(nTmp, { recursive: true, force: true });
    say('§HPAGE-MUTANTS killed=' + killed + '/' + (MUT.length + NMUT.length));
    if (killed !== MUT.length + NMUT.length) ALL.failed++;
  }
  var names = Object.keys(CASES), vs = names.map(function (c) { return !CASES[c].judged ? 'INCONCLUSIVE' : CASES[c].failed ? 'FAIL' : 'PASS'; });
  var pageJudged = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P10'].every(function (c) { return CASES[c] && CASES[c].judged; }), wps = CASES.P9 && CASES.P9.judged ? 'P9 real WPS ' + require('./wps_driver.js').VERSION + ' writer RAN' : 'P9 INCONCLUSIVE: real WPS not run';
  var overall = !ALL.judged || (!ONLY.length && !pageJudged) ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§HPAGE-VERDICT ' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(names) + ' ' + J(vs) + (B.browser ? ' (headless Chromium on the real page; ' + wps + '; real Excel NOT run)' : ' (no browser: nothing of the page was judged)'));
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(overall === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§HPAGE-VERDICT FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
