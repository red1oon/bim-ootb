#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SHEET-WPS-REAL (bim-compiler prompts/SHEET_FRONT_DOOR.md §13). READ THE LOG after every run: every verdict is a §WPSR line; the exit code is not the evidence.
//   The REAL WPS Spreadsheets (snap wps-office) saves the lane's workbooks as .xlsx with its OWN writer, inside its own Xvfb display (never the real screen); the result is judged with the
//   SAME checks as W-SHEET-WPS-PAGE Q2 (the openpyxl stand-in). A difference is a FINDING (reported, never patched here). INCONCLUSIVE (exit 2) when WPS, Xvfb, xdotool or a browser is missing,
//   or when WPS did not write the file: nothing was judged. THE WPS MENU IS NOT RUN (§13 W4: no working JS add-in runtime in this build).
// SPEC (claims written in §13.2 before the code):
//   W1 WROTE  WPS saved the filed+stamped invoice workbook and the PDF page .xlsx: bytes changed + WPS signature; red controls C1 (save skipped -> NOT-WRITTEN) and C2 (original has no signature)
//   W2 KEEP   per attribute, WPS-saved vs given: hidden state, chunks byte for byte + verify, formulas and cached values, date, plain cells, emoji, text cells; PDF page too
//   W3 FILE   the WPS-saved invoice workbook in the real file_it.html: FILED, chain of 2, same C_Invoice + lines + Fact_Acct fingerprint as the original file in node
//   W4 MENU   static evidence (+ opt-in WPSR_MENU_PROBE=1 registration probe) about the WPSJS add-in runtime of this build
// Command: env -u DBUS_SESSION_BUS_ADDRESS node erp/tests/witness_sheet_wps_real.js      (WPSR_ONLY=W1,W2 limits cases; WPSR_MENU_PROBE=1 adds the W4 probe; WPSR_KEEP=1 keeps the run directory)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..');
var ONLY = (process.env.WPSR_ONLY || '').split(',').filter(Boolean);
if (!process.env.SQLJS) process.env.SQLJS = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
var _log = console.log; console.log = function () { /* the kernel's own lines: the browser's are captured per page */ };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, findings: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
// check: ok -> OK; not ok and opts.finding -> FINDING (a measured difference, reported); not ok otherwise -> FAIL (the harness is wrong)
function check(cs, key, rule, ok, info, finding) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, findings: 0, failed: 0 }; c.judged++; ALL.judged++;
  var st = ok ? 'OK' : finding ? 'FINDING' : 'FAIL'; if (st === 'FINDING') { c.findings++; ALL.findings++; } if (st === 'FAIL') { c.failed++; ALL.failed++; }
  say('  §WPSR-CHECK case=' + cs + ' key=' + key + ' ' + st + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 900)));
}
async function guard(cs, key, rule, fn) { try { await fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); } }
function caseVerdict(cs) { var c = CASES[cs] || { judged: 0, findings: 0, failed: 0 }; return !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : c.findings ? 'FINDINGS' : 'PASS'; }
function verdict(cs) { var c = CASES[cs] || { judged: 0, findings: 0, failed: 0 }, v = caseVerdict(cs); say('§WPSR-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' findings=' + c.findings + ' failed=' + c.failed); return v; }
var wants = function (cs) { return !ONLY.length || ONLY.indexOf(cs) >= 0; };
function sh(cmd, args, o) { return cp.spawnSync(cmd, args, Object.assign({ encoding: 'utf8', timeout: 30000 }, o || {})); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var CLEAN = (function () { var e = Object.assign({}, process.env); delete e.DBUS_SESSION_BUS_ADDRESS; return e; })();

// ── preflight: every missing tool is INCONCLUSIVE, never PASS ──
var WPS_BIN = '/snap/bin/wps-office.et', WPS_VER = (function () { try { return (/^version:\s*(\S+)/m.exec(fs.readFileSync('/snap/wps-office/current/meta/snap.yaml', 'utf8')) || [])[1] || ''; } catch (e) { return ''; } })();
var TOOLS = { wps: fs.existsSync(WPS_BIN) && !!WPS_VER, Xvfb: !!sh('sh', ['-c', 'command -v Xvfb']).stdout.trim(), xdotool: !!sh('sh', ['-c', 'command -v xdotool']).stdout.trim(), xprop: !!sh('sh', ['-c', 'command -v xprop']).stdout.trim(), python3: !!sh('sh', ['-c', 'command -v python3']).stdout.trim() };
var PUP = null; try { PUP = require(process.env.WPSR_PUPPETEER || path.join(os.homedir(), 'bim-compiler/node_modules/puppeteer')); } catch (e) { PUP = null; }
var SUFFIX = '(real WPS ' + (WPS_VER || '?') + ' writer under Xvfb; the WPS menu NOT run: this build has no JS add-in runtime)';
function inconclusive(why) { say('§WPSR-VERDICT INCONCLUSIVE judged=0 reason="' + why + '" ' + SUFFIX); process.exit(2); }
say('§WPSR-LOAD tree=' + ROOT + ' wps=' + (WPS_VER || 'NO') + ' xvfb=' + TOOLS.Xvfb + ' xdotool=' + TOOLS.xdotool + ' xprop=' + TOOLS.xprop + ' puppeteer=' + (PUP ? 'yes' : 'NO') + ' only=' + (ONLY.join(',') || 'all'));
if (!TOOLS.wps || !TOOLS.Xvfb || !TOOLS.xdotool || !TOOLS.xprop || !TOOLS.python3) inconclusive('missing tool: ' + Object.keys(TOOLS).filter(function (k) { return !TOOLS[k]; }).join(','));
if (!PUP && (wants('W3') || wants('W1') || wants('W2'))) inconclusive('no puppeteer (the PDF page workbook and the file_it page need a browser)');

var K = require(path.join(ERP, 'ws_kernel.js')), SD = require(path.join(ERP, 'sheet_door.js')), SH = require(path.join(ERP, 'sheet_history.js')), AP = require(path.join(ERP, 'ad_process.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
var SA = require(path.join(ERP, 'sheet_addin/host_shim.js')), XH = require(path.join(ERP, 'sheet_addin/xlsx_host.js')), EH = require(path.join(ERP, 'sheet_addin/excel_host.js'));
var RN = require(path.join(ERP, 'sheet_addin/runner.js')), SAMPLE = require(path.join(ERP, 'sheet_addin/sample_invoice.js'));
// the snap sandbox cannot read /tmp: the run directory is a NON-HIDDEN directory under $HOME (made and removed here)
var RUN = path.join(os.homedir(), 'wps-real-run-' + process.pid); fs.mkdirSync(RUN, { recursive: true });
var STARTED = { xvfb: [], wps: [] };           // ONLY the processes this run started

// ═════════════ the WPS driver: own Xvfb, own WPS, xdotool, kill only ours ═════════════
function freeDisplay() { for (var n = 90 + (process.pid % 40); n < 400; n++) if (!fs.existsSync('/tmp/.X11-unix/X' + n) && !fs.existsSync('/tmp/.X' + n + '-lock')) return n; return -1; }
function xd(D, args) { return sh('xdotool', args, { env: Object.assign({}, CLEAN, { DISPLAY: ':' + D }) }); }
function windows(D) { var ids = (xd(D, ['search', '--onlyvisible', '--name', '']).stdout || '').split(/\s+/).filter(Boolean); return ids.map(function (id) { var g = (xd(D, ['getwindowgeometry', id]).stdout || ''), m = /Position:\s*(-?\d+),(-?\d+)[\s\S]*Geometry:\s*(\d+)x(\d+)/.exec(g); return { id: id, name: (xd(D, ['getwindowname', id]).stdout || '').trim(), x: m ? +m[1] : 0, y: m ? +m[2] : 0, w: m ? +m[3] : 0, h: m ? +m[4] : 0 }; }); }
function killTree(pid) { try { process.kill(pid, 'SIGTERM'); } catch (e) { /* gone */ } }
function pidOfWindow(D, id) { var m = /=\s*(\d+)/.exec(sh('xprop', ['-id', id, '_NET_WM_PID'], { env: Object.assign({}, CLEAN, { DISPLAY: ':' + D }) }).stdout || ''); return m ? +m[1] : 0; }
// resave(file, o): open `file` in WPS Spreadsheets, Ctrl+S (WPS's own writer), detect by the file's bytes, close. o.save === false is the red control (the save step is skipped).
async function wpsResave(file, o) {
  o = o || {}; var out = { file: file, ok: false, ms: 0, bytesIn: fs.statSync(file).size, bytesOut: 0, titles: [], handled: [], err: '' }, t0 = Date.now(), D = freeDisplay(), xv = null, wps = null, wpid = 0;
  if (D < 0) { out.err = 'no free display number'; return out; }
  var statIn = fs.statSync(file), mt0 = statIn.mtimeMs;
  try {
    xv = cp.spawn('Xvfb', [':' + D, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { stdio: 'ignore', env: CLEAN }); STARTED.xvfb.push(xv.pid);
    for (var i = 0; i < 50 && !fs.existsSync('/tmp/.X11-unix/X' + D); i++) await sleep(100);
    wps = cp.spawn(WPS_BIN, [file], { stdio: 'ignore', detached: true, env: Object.assign({}, CLEAN, { DISPLAY: ':' + D, LIBGL_ALWAYS_SOFTWARE: '1' }) }); wps.unref(); STARTED.wps.push(wps.pid);
    var main = null, seen = {};
    for (var s = 0; s < 120 && !main; s++) {                      // up to 60 s for the document window
      await sleep(500); var ws = windows(D);
      ws.forEach(function (w) { if (w.name && !seen[w.name]) { seen[w.name] = 1; out.titles.push(w.name); } });
      main = ws.filter(function (w) { return /Spreadsheets$/.test(w.name); })[0] || null;
    }
    if (!main) { out.err = 'no Spreadsheets window within 60 s; titles=' + J(out.titles); return out; }
    wpid = pidOfWindow(D, main.id); if (wpid) STARTED.wps.push(wpid);
    await sleep(4000);                                            // the System Check dialog appears a few seconds after the window
    for (var d = 0; d < 6; d++) {
      var ws2 = windows(D), dlg = ws2.filter(function (w) { return /^System Check$/.test(w.name); })[0];
      ws2.forEach(function (w) { if (w.name && !seen[w.name]) { seen[w.name] = 1; out.titles.push(w.name); } });
      if (!dlg) break;
      xd(D, ['mousemove', String(dlg.x + dlg.w - 47), String(dlg.y + dlg.h - 22), 'click', '1']); out.handled.push('System Check: Close clicked'); await sleep(1500);
    }
    if (o.save !== false) {
      var win = windows(D).filter(function (w) { return /Spreadsheets$/.test(w.name); })[0] || main;
      xd(D, ['windowfocus', win.id]); xd(D, ['mousemove', '640', '400', 'click', '1']); await sleep(500); xd(D, ['key', 'ctrl+s']);
      var last = -1, stable = 0;
      for (var k = 0; k < 120; k++) {                             // up to 60 s: wait for the bytes to change, then to stop changing
        await sleep(500); var st = fs.statSync(file); ws2 = windows(D); ws2.forEach(function (w) { if (w.name && !seen[w.name]) { seen[w.name] = 1; out.titles.push(w.name); } });
        if (st.mtimeMs !== mt0 && st.size !== statIn.size) { if (st.size === last) { if (++stable >= 3) break; } else { stable = 0; last = st.size; } }
      }
    } else await sleep(3000);
    out.bytesOut = fs.statSync(file).size; out.ok = true;
  } catch (e) { out.err = String(e && e.message || e); } finally {
    // close: our own Ctrl+Q first (the document is saved), then kill only the PIDs this run started
    try { if (wpid) { xd(D, ['key', 'ctrl+q']); await sleep(1500); } } catch (e) { /* ignore */ }
    STARTED.wps.forEach(function (p) { killTree(p); }); await sleep(1500); STARTED.wps.forEach(function (p) { try { process.kill(p, 0); process.kill(p, 'SIGKILL'); } catch (e) { /* gone */ } });
    if (xv) { killTree(xv.pid); await sleep(500); try { process.kill(xv.pid, 0); process.kill(xv.pid, 'SIGKILL'); } catch (e) { /* gone */ } }
    out.ms = Date.now() - t0;
  }
  return out;
}
// what the file says about its writer (the local user name is REDACTED: only "present" / "equals the OS user" is reported)
function pkgInfo(file) {
  var py = 'import sys, zipfile, json, re, os\nz = zipfile.ZipFile(sys.argv[1]); names = z.namelist()\n' +
    'def rd(n): return z.read(n).decode("utf8", "replace") if n in names else ""\napp = re.search(r"<Application>([^<]*)</Application>", rd("docProps/app.xml")); core = rd("docProps/core.xml")\n' +
    'lmb = re.search(r"<cp:lastModifiedBy>([^<]*)", core); cr = re.search(r"<dc:creator>([^<]*)", core); user = os.environ.get("USER", "")\n' +
    'wps = any(b"www.wps.cn" in z.read(n) for n in names if n.startswith("xl/worksheets/sheet") or n == "xl/workbook.xml")\n' +
    'print(json.dumps({"app": app.group(1) if app else None, "creator": cr.group(1) if cr and cr.group(1) != user else ("<local user>" if cr else None), "lmbPresent": bool(lmb and lmb.group(1)), "lmbIsLocalUser": bool(lmb and user and lmb.group(1) == user), "wpsNs": wps, "customProps": "docProps/custom.xml" in names, "zipDates": sorted(set("%04d-%02d-%02d" % i.date_time[:3] for i in z.infolist())), "entries": len(names)}))';
  var r = sh('python3', ['-I', '-c', py, file], { cwd: RUN }); return r.status === 0 ? JSON.parse(r.stdout) : { err: (r.stderr || '').slice(0, 200) };
}

// ═════════════ the SAME judging helpers as W-SHEET-WPS-PAGE ═════════════
var READ = Object.assign({ type: 'buffer' }, XH.READ);
function readWb(file) { return XLSX.read(fs.readFileSync(file), READ); }
function writeWb(wb, name) { var f = path.join(RUN, name); fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })); return f; }
function rowsOf(wb, name) { var s = wb.Sheets[name]; return s && s['!ref'] ? XLSX.utils.sheet_to_json(s, { header: 1, raw: true, defval: '' }).map(function (r) { return r.map(function (c) { return c == null ? '' : String(c); }); }) : null; }
function linesOf(wb, name) { var r = rowsOf(wb, name); return r ? r.map(function (x) { return x.join(''); }).filter(Boolean) : []; }
function hiddenOf(wb, name) { var i = wb.SheetNames.indexOf(name), m = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]; return i < 0 ? null : (m && m.Hidden ? m.Hidden : 0); }
function cellsOf(wb, sheet) { var s = wb.Sheets[sheet] || {}, o = {}; Object.keys(s).forEach(function (a) { if (a.charAt(0) !== '!') o[a] = { v: s[a].v == null ? null : s[a].v, f: s[a].f || null, z: s[a].z || null }; }); return o; }
function cps(t) { return Array.from(String(t), function (c) { return c.codePointAt(0).toString(16); }).join(' '); }
async function nodeFile(wb, runner, user) {
  var host = XH.create(XLSX, wb, { engineValue: EH.engineValue, userName: user }), last = null;
  var shim = SA.create(host, { SheetDoor: SD, SheetHistory: SH, runner: { file: async function (a, b, c) { last = await runner.file(a, b, c); return last; } } });
  return { shim: shim, last: function () { return last; } };
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
// ── static file server + browser helpers (as the page witness) ──
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.sql': 'text/plain; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.pdf': 'application/pdf', '.svg': 'image/svg+xml' };
function serve() {
  return new Promise(function (res) {
    var srv = http.createServer(function (req, rsp) {
      var rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), f = path.join(ROOT, rel);
      if (req.method !== 'GET' || f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || !fs.statSync(f).isFile()) { rsp.writeHead(404); rsp.end(); return; }
      var body = fs.readFileSync(f); rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'max-age=600' }); rsp.end(body);
    });
    srv.listen(0, '127.0.0.1', function () { res({ srv: srv, base: 'http://127.0.0.1:' + srv.address().port + '/' }); });
  });
}
var B = { browser: null, base: null, external: [] };
async function newPage(rel) {
  var page = await B.browser.newPage(); page.__logs = [];
  page.on('console', function (m) { page.__logs.push(m.text()); }); page.on('pageerror', function (e) { page.__logs.push('§PAGEERROR ' + (e && e.message)); });
  await page.setRequestInterception(true);
  page.on('request', function (rq) { var u = rq.url(); if (u.indexOf(B.base) !== 0 && !/^(data|blob):/.test(u)) { B.external.push(rq.method() + ' ' + u); return rq.abort(); } rq.continue(); });
  await page.goto(B.base + rel, { waitUntil: 'load', timeout: 120000 }); return page;
}
async function chooseFile(page, labelSel, file) { var got = await Promise.all([page.waitForFileChooser({ timeout: 30000 }), page.click(labelSel)]); await got[0].accept([file]); }
async function waitLog(page, re, ms) { for (var t = 0; t < (ms || 20000); t += 100) { var l = page.__logs.filter(function (x) { return re.test(x); })[0]; if (l) return l; await sleep(100); } return null; }
async function fileOnPage(file, docno) {
  var p = await newPage('erp/sheet_addin/file_it.html'); await p.waitForFunction(function () { return window.FileItPage && window.FileItPage.runner.ready(); }, { timeout: 180000 });
  await chooseFile(p, 'label[for=file]', file); await p.waitForFunction(function (n) { return window.FileItPage.state.name === n && !!window.FileItPage.state.wb && window.FileItPage.state.verdict === null; }, { timeout: 30000 }, path.basename(file));
  await p.click('#b-file'); await p.waitForFunction(function () { var s = window.FileItPage.state; return !s.busy && s.verdict !== null; }, { timeout: 180000 });
  var r = await p.evaluate(function () { var s = window.FileItPage.state; return { verdict: s.verdict, text: document.getElementById('verdict').textContent, journal: window.FileItPage.runner.kernel() ? window.FileItPage.journal() : null }; });
  r.fp = r.verdict === 'FILED' ? await fingerprint(function (sql, pa) { return p.evaluate(function (a, b) { return window.FileItPage.runner.kernel().q(a, b || []); }, sql, pa || []); }, docno) : '[]';
  await p.close(); return r;
}

(async function main() {
  var srv = await serve(); B.base = srv.base;
  B.browser = await PUP.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'], env: CLEAN });
  var DOCNO_A = 'WPS-0001', DOCNO_B = 'WPS-0002', FP2 = null, WBO = null, PX = null, EMOJI_ROW = 452;
  // ═══ the fixtures: exactly the page witness's workbook (filed once, stamped: history entry > 32,767 chars, a new number typed for a second filing) + ONE emoji cell; and the PDF page's own .xlsx ═══
  var wb = SAMPLE.build(XLSX, { docno: DOCNO_A }), rowsData = [['Notes']].concat(Array.from({ length: 450 }, function (_, i) { return ['item ' + (i + 1) + ' ' + (i % 50 === 49 ? 'accent é中 ' : '') + 'x'.repeat(100)]; }));
  rowsData.push(['emoji \u{1F600} x']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsData), 'Data'); wb.Workbook = wb.Workbook || {}; wb.Workbook.Sheets = wb.SheetNames.map(function (n) { return { Hidden: /^_door_/.test(n) ? 2 : 0 }; });
  var runner1 = RN.create({ boot: function () { return K.load(); }, SheetDoor: SD, AP: function () { return AP; } }), n1 = await nodeFile(wb, runner1, 'Aminah');
  var f1 = await n1.shim.fileIt(), s1 = await n1.shim.stamp();
  say('§WPSR-FIXTURE filed=' + f1.verdict + ' text="' + f1.text + '" stamp=' + s1.verdict + ' cells=' + s1.cells + ' chunks=' + s1.chunks + ' sheets=' + J(wb.SheetNames) + ' emojiCell=Data!A' + EMOJI_ROW);
  wb.Sheets.Invoice.F2 = { t: 's', v: DOCNO_B };
  WBO = writeWb(wb, 'wps_filed_stamped.xlsx');
  var wb2 = readWb(WBO), runner2 = RN.create({ boot: function () { return K.load(); }, SheetDoor: SD, AP: function () { return AP; } }), n2 = await nodeFile(wb2, runner2), f2 = await n2.shim.fileIt();
  FP2 = f2.verdict === 'FILED' ? await fingerprint(async function (s, p) { return runner2.kernel().q(s, p || []); }, DOCNO_B) : '[]';
  say('§WPSR-ORACLE second filing on the original file (node): ' + f2.verdict + ' fingerprintBytes=' + FP2.length);
  var q = await newPage('pdf/index.html'), TB = path.join(ROOT, 'pdf/corpus/trial_balance_th.pdf');
  await chooseFile(q, '#b-open', TB); await waitLog(q, /^§PDFED-OPEN ok=true/, 20000); await q.click('#b-sheet'); await waitLog(q, /^§PDFWR-HISTORY entries=1/, 20000); await q.click('#b-xlsx');
  var b64 = await q.evaluate(function () { var u = window.PdfPage.state.lastXlsx; if (!u) return null; var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }); await q.close();
  if (b64) { PX = path.join(RUN, 'pdf_page.xlsx'); fs.writeFileSync(PX, Buffer.from(b64, 'base64')); }
  say('§WPSR-FIXTURE pdfPageXlsx=' + (PX ? fs.statSync(PX).size + ' bytes' : 'NOT-MADE'));

  // ═══ W1 WROTE (+ the red controls) ═══
  var G = {};                                                   // given / got copies per file
  if (wants('W1') || wants('W2') || wants('W3')) {
    await guard('W1', 'run', 'WPS Spreadsheets opens each workbook and saves it as .xlsx with its own writer', async function () {
      var jobs = [{ tag: 'invoice', src: WBO }].concat(PX ? [{ tag: 'pdfpage', src: PX }] : []);
      for (var j = 0; j < jobs.length; j++) {
        var given = path.join(RUN, 'given_' + jobs[j].tag + '.xlsx'), work = path.join(RUN, 'wps_' + jobs[j].tag + '.xlsx'); fs.copyFileSync(jobs[j].src, given); fs.copyFileSync(jobs[j].src, work);
        var piIn = pkgInfo(given), r = await wpsResave(work); var piOut = pkgInfo(work); G[jobs[j].tag] = { given: given, got: work, r: r, piIn: piIn, piOut: piOut };
        say('§WPS-RESAVE file=' + path.basename(jobs[j].src) + ' app="' + (piOut.app || '') + '" bytesIn=' + r.bytesIn + ' bytesOut=' + r.bytesOut + ' ms=' + r.ms + ' wpsNamespace=' + piOut.wpsNs + ' zipDates=' + J(piOut.zipDates) + ' customProps=' + piOut.customProps + ' lastModifiedBy=' + (piOut.lmbPresent ? (piOut.lmbIsLocalUser ? '<local OS user: redacted>' : '<present>') : 'absent') + ' appGiven="' + (piIn.app || '') + '" windows=' + J(r.titles) + ' handled=' + J(r.handled) + (r.err ? ' err="' + r.err + '"' : ''));
        check('W1', 'wrote-' + jobs[j].tag, jobs[j].tag + ': after WPS saved it the output bytes differ from the input AND the file carries a WPS signature (the www.wps.cn namespace in its sheet XML)', r.ok && r.bytesOut !== r.bytesIn && piOut.wpsNs === true, { r: r, piOut: piOut });
      }
      Object.keys(G).forEach(function (t) { check('W1', 'app-names-wps-' + t, t + ': docProps/app.xml Application names WPS (the producer metadata is how a reader could tell who wrote the file; got "' + (G[t].piOut.app || '') + '", given "' + (G[t].piIn.app || '') + '")', /WPS|Kingsoft/i.test(G[t].piOut.app || ''), { app: G[t].piOut.app }, true); });
      check('W1', 'lastModifiedBy', 'the WPS-saved file does not carry the local OS user name in docProps/core.xml (a privacy leak into a filed workbook)', Object.keys(G).every(function (t) { return !G[t].piOut.lmbIsLocalUser; }), Object.keys(G).map(function (t) { return t + ':' + G[t].piOut.lmbIsLocalUser; }), true);
      // C2: the un-saved original must not carry the signature
      check('W1', 'C2-original-not-wps', 'red control C2: the file WPS was GIVEN carries no WPS signature, so the detector can say "not written by WPS"', G.invoice && G.invoice.piIn.wpsNs === false, G.invoice && G.invoice.piIn);
      // C1: the same launch with the save step skipped must read NOT-WRITTEN
      var c1 = path.join(RUN, 'control_nosave.xlsx'); fs.copyFileSync(WBO, c1); var c1in = fs.readFileSync(c1), rc = await wpsResave(c1, { save: false }), c1out = fs.readFileSync(c1), pc = pkgInfo(c1);
      say('§WPS-RESAVE file=control_nosave.xlsx(save skipped) app="' + (pc.app || '') + '" bytesIn=' + c1in.length + ' bytesOut=' + c1out.length + ' ms=' + rc.ms + ' wpsNamespace=' + pc.wpsNs + ' verdict=' + (c1out.equals(c1in) && !pc.wpsNs ? 'NOT-WRITTEN' : 'WRITTEN'));
      check('W1', 'C1-nosave-detected', 'red control C1: WPS opened the file but the save step was skipped: the detector must read NOT-WRITTEN (bytes equal, no WPS signature)', rc.ok && c1out.equals(c1in) && pc.wpsNs === false, { rc: rc, same: c1out.equals(c1in), ns: pc.wpsNs });
    });
    verdict('W1');
  }
  var wrote = G.invoice && G.invoice.r.ok && G.invoice.piOut.wpsNs === true;

  // ═══ W2 KEEP: the page witness's Q2 judgement, real writer ═══
  if (wants('W2')) {
    if (!wrote) CASES.W2 = CASES.W2 || { judged: 0, findings: 0, failed: 0 };
    else await guard('W2', 'keep', 'WPS-saved invoice workbook judged attribute by attribute against the file WPS was given', async function () {
      var a = readWb(G.invoice.given), b = readWb(G.invoice.got), names = a.SheetNames.slice(), loss = [];
      check('W2', 'sheets', 'the same sheets in the same order after the WPS save', J(b.SheetNames) === J(names), { a: names, b: b.SheetNames }, true);
      names.filter(function (n) { return /^_door_/.test(n); }).forEach(function (n) { loss.push(n + ' hidden ' + hiddenOf(a, n) + '->' + hiddenOf(b, n)); });
      say('§WPSR-LOSS hidden-state (SheetJS Hidden: 0 visible, 1 hidden, 2 very hidden): ' + loss.join(' | '));
      check('W2', 'not-visible', 'no _door_* sheet is visible after the WPS save (hidden or very hidden)', names.filter(function (n) { return /^_door_/.test(n); }).every(function (n) { return hiddenOf(b, n) >= 1; }), loss, true);
      check('W2', 'very-hidden', 'every _door_* sheet is still VERY hidden (2), as given', names.filter(function (n) { return /^_door_/.test(n); }).every(function (n) { return hiddenOf(b, n) === 2; }), loss, true);
      ['_door_tags', '_door_ledger', '_door_history'].forEach(function (n) {
        var la = linesOf(a, n), lb = linesOf(b, n), ra = rowsOf(a, n), rb = rowsOf(b, n);
        say('§WPSR-LOSS chunks ' + n + ': rows ' + (ra && ra.length) + '->' + (rb && rb.length) + ' joined lines ' + la.length + '->' + lb.length + ' chars ' + la.map(function (x) { return x.length; }).join(',') + '->' + lb.map(function (x) { return x.length; }).join(',') + ' cells per row ' + J(ra && ra.map(function (r) { return r.length; })) + '->' + J(rb && rb.map(function (r) { return r.length; })));
        check('W2', 'chunks-' + n, n + ': the joined lines are byte-for-byte the same after the WPS save (' + la.length + ' line(s), longest ' + Math.max.apply(null, la.map(function (x) { return x.length; }).concat([0])) + ' chars)', la.length >= 1 && J(la) === J(lb), { a: la.map(function (x) { return x.length; }), b: lb.map(function (x) { return x.length; }) }, true);
      });
      var hl = linesOf(b, '_door_history'), ll = linesOf(b, '_door_ledger'), vh = await SH.verify(hl), vl = await SH.verify(ll);
      check('W2', 'verify', 'the WPS-saved history AND ledger still verify (SheetHistory.verify and ws_kernel.verifyJournal)', vh.ok === true && K.verifyJournal(hl.join('\n')).ok === true && vl.ok === true && K.verifyJournal(ll.join('\n')).ok === true, { h: vh, l: vl }, true);
      var ca = cellsOf(a, 'Invoice'), cb = cellsOf(b, 'Invoice'), vd = [], fd = [], zd = [];
      Object.keys(ca).forEach(function (k) { if (J(ca[k].v) !== J((cb[k] || {}).v)) vd.push(k); if ((ca[k].f || null) !== ((cb[k] || {}).f || null)) fd.push(k + ':' + ca[k].f + '->' + (cb[k] || {}).f); if ((ca[k].z || null) !== ((cb[k] || {}).z || null)) zd.push(k + ':' + ca[k].z + '->' + (cb[k] || {}).z); });
      Object.keys(cb).forEach(function (k) { if (!(k in ca)) vd.push('+' + k); });
      say('§WPSR-LOSS Invoice cells=' + Object.keys(ca).length + ' value-diffs=' + J(vd) + ' formula-diffs=' + J(fd) + ' number-format-diffs=' + J(zd.slice(0, 12)));
      var fcells = Object.keys(ca).filter(function (k) { return ca[k].f; }), plainDiffs = vd.filter(function (k) { return !ca[k.replace(/^\+/, '')] || !ca[k.replace(/^\+/, '')].f; });
      check('W2', 'values', 'every value of the visible Invoice sheet that is NOT a formula result is the same after the WPS save (' + (Object.keys(ca).length - fcells.length) + ' cells)', plainDiffs.length === 0, plainDiffs, true);
      check('W2', 'formulas', 'the formula cells ' + J(fcells) + ' still hold their formulas as the vendored SheetJS reads them', fcells.every(function (k) { return cb[k] && cb[k].f === ca[k].f; }), fd, true);
      var cached = fcells.map(function (k) { return k + '=' + J((cb[k] || {}).v) + '(given ' + J(ca[k].v) + ')'; });
      say('§WPSR-LOSS cached-results ' + cached.join(' '));
      check('W2', 'cached', 'WPS stores a cached RESULT for each formula and our vendored reader sees it (G8, G9, G20 equal the given values): the S4 hazard "formula with no saved result" does not arise', fcells.every(function (k) { return cb[k] && cb[k].v === ca[k].v; }), cached, true);
      var rc = await XH.create(XLSX, b, { engineValue: EH.engineValue }).readCells('Invoice', ['G20', 'G8', 'G9', 'F3']), ro = await XH.create(XLSX, a, { engineValue: EH.engineValue }).readCells('Invoice', ['G20', 'G8', 'G9', 'F3']);
      say('§WPSR-LOSS engine-reads (given -> WPS-saved) G20 ' + J(ro.G20) + '->' + J(rc.G20) + ' G8 ' + J(ro.G8) + '->' + J(rc.G8) + ' G9 ' + J(ro.G9) + '->' + J(rc.G9) + ' F3(date) ' + J(ro.F3) + '->' + J(rc.F3));
      check('W2', 'engine-reads', 'the engine reads the printed subtotal G20, the amounts G8 G9 and the date F3 identically from the WPS-saved file (the add-up check still runs; the date is still 2026-11-20)', J(ro) === J(rc) && rc.F3 === '2026-11-20' && rc.G20 != null, { given: ro, got: rc }, true);
      var cd = cellsOf(a, 'Data'), cdb = cellsOf(b, 'Data'), dd = Object.keys(cd).filter(function (k) { return J(cd[k].v) !== J((cdb[k] || {}).v); }), em = 'A' + EMOJI_ROW;
      check('W2', 'data', 'the ' + (Object.keys(cd).length - 1) + ' text cells of the second visible sheet (accents and a CJK character included) are unchanged', dd.filter(function (k) { return k !== em; }).length === 0, dd.slice(0, 5), true);
      var eo = (cd[em] || {}).v, eb = (cdb[em] || {}).v;
      say('§WPSR-LOSS astral-character original=[' + cps(eo) + '] after-WPS-read-by-SheetJS=[' + cps(eb) + '] (a character beyond U+FFFF; the stand-in openpyxl gave U+F600 through this same reader)');
      check('W2', 'emoji', 'the emoji cell Data!' + em + ' reads back from the WPS-saved file as the same text (U+1F600 intact through the vendored reader)', eo != null && eo === eb, { o: cps(eo), b: cps(eb) }, true);
      if (G.pdfpage && G.pdfpage.r.ok && G.pdfpage.piOut.wpsNs) {
        var pa = readWb(G.pdfpage.given), pb = readWb(G.pdfpage.got), pn = pa.SheetNames.filter(function (n) { return /^_door_/.test(n); }), ph = pn.map(function (n) { return n + ' ' + hiddenOf(pa, n) + '->' + hiddenOf(pb, n); });
        var ra2 = cellsOf(pa, 'Report'), rb2 = cellsOf(pb, 'Report'), pf = Object.keys(ra2).filter(function (k) { return ra2[k].f; }), pd = Object.keys(ra2).filter(function (k) { return !ra2[k].f && J(ra2[k].v) !== J((rb2[k] || {}).v); }), pfd = pf.filter(function (k) { return !(rb2[k] && rb2[k].f === ra2[k].f && rb2[k].v === ra2[k].v); });
        say('§WPSR-LOSS pdf-page xlsx hidden-state: ' + ph.join(' | ') + ' ; sheets ' + J(pa.SheetNames) + '->' + J(pb.SheetNames) + ' ; formula cells ' + J(pf) + ' lost-or-changed ' + J(pfd) + ' ; non-formula diffs ' + J(pd.slice(0, 5)));
        check('W2', 'pdf-hidden', 'PDF-page workbook: every _door_* sheet keeps its state (' + ph.join(', ') + ')', pn.length === 2 && pn.every(function (n) { return hiddenOf(pb, n) === hiddenOf(pa, n); }), ph, true);
        check('W2', 'pdf-cells', 'PDF-page workbook: the ' + (Object.keys(ra2).length - pf.length) + ' non-formula report cells are unchanged', Object.keys(ra2).length === 144 && pd.length === 0, pd.slice(0, 5), true);
        var pfk = pf.filter(function (k) { return !(rb2[k] && rb2[k].f === ra2[k].f); }), pcv = pf.map(function (k) { return k + ' ' + J(ra2[k].v) + '->' + J((rb2[k] || {}).v); });
        say('§WPSR-LOSS pdf-page cached-results (given -> WPS-saved) ' + pcv.join(' | '));
        check('W2', 'pdf-formulas', 'PDF-page workbook: the totals ' + J(pf) + ' keep their formulas through the vendored reader', pf.length === 4 && pfk.length === 0, pfk, true);
        check('W2', 'pdf-cached', 'PDF-page workbook: the cached results of the totals are the given values exactly (WPS recalculates on load: a float residue instead of 0 is a difference)', pf.length === 4 && pfd.length === 0, pcv, true);
        var h2 = linesOf(pb, '_door_history'), vh2 = await SH.verify(h2);
        check('W2', 'pdf-history', 'PDF-page workbook: the history line is byte-for-byte the same and verifies', J(linesOf(pa, '_door_history')) === J(h2) && vh2.ok === true, vh2, true);
      }
    });
    verdict('W2');
  }

  // ═══ W3 FILE: the WPS-saved workbook in the real file_it.html ═══
  if (wants('W3')) {
    if (!wrote) CASES.W3 = CASES.W3 || { judged: 0, findings: 0, failed: 0 };
    else await guard('W3', 'page-files', 'the WPS-saved invoice workbook opened in file_it.html', async function () {
      var r = await fileOnPage(G.invoice.got, DOCNO_B), j = r.journal || [];
      var chain = j.length === 2 && JSON.parse(j[0]).seq === 1 && JSON.parse(j[1]).seq === 2 && JSON.parse(j[1]).prev === JSON.parse(j[0]).hash;
      say('§WPSR-FILE verdict=' + r.verdict + ' text="' + String(r.text).slice(0, 200) + '" chain=' + j.length + ' chainLinked=' + chain + ' fingerprintBytes=' + r.fp.length + ' sameAsOriginal=' + (r.fp === FP2 && r.fp !== '[]'));
      check('W3', 'filed', 'file_it.html FILES the WPS-saved workbook (its _door_tags read, its ledger replayed)', r.verdict === 'FILED', { v: r.verdict, text: String(r.text).slice(0, 200) }, true);
      check('W3', 'chain', 'the chain has 2 entries (seq 1, 2) and the second links to the first', chain, { n: j.length }, true);
      check('W3', 'fingerprint', 'the new invoice has the C_Invoice + lines + Fact_Acct fingerprint the ORIGINAL file gives in node', r.fp === FP2 && r.fp !== '[]', { same: r.fp === FP2, bytes: r.fp.length }, true);
    });
    verdict('W3');
  }

  // ═══ W4 MENU: evidence only ═══
  if (wants('W4')) {
    await guard('W4', 'static', 'what this build ships for the WPSJS add-in runtime', async function () {
      var O6 = '/snap/wps-office/current/opt/kingsoft/wps-office/office6', files = fs.existsSync(O6) ? fs.readdirSync(O6) : [], addons = fs.existsSync(path.join(O6, 'addons')) ? fs.readdirSync(path.join(O6, 'addons')) : [];
      var expected = files.filter(function (f) { return /jsapi|jsplugin|jsaddon|cef|wpsjs|libv8|chromium/i.test(f); });
      var str = sh('sh', ['-c', 'strings -a "' + path.join(O6, 'libkso.so') + '" | grep -E "KJSPluginManager$|^jsplugins.xml$|/wps/jsaddons/|^PluginStorage$" | sort -u | tr "\\n" " "'], { timeout: 60000 }).stdout.trim();
      var home = path.join(os.homedir(), 'snap/wps-office'), made = sh('sh', ['-c', 'find "' + home + '" \\( -iname "jsaddons" -o -iname publish.xml -o -iname jsplugins.xml \\) 2>/dev/null | head -3']).stdout.trim();
      say('§WPSR-MENU-STATIC office6 files=' + files.length + ' addons=' + J(addons) + ' jsapi/cef/v8-named files=' + J(expected) + ' libkso.so strings: ' + (str || 'none') + ' ; jsaddons/publish.xml under ~/snap/wps-office before any probe: ' + (made || 'none'));
      check('W4', 'no-runtime-files', 'no add-in runtime file (jsapi / jsplugin / cef / wpsjs / v8) ships in office6, and none of the add-ons is a JS one', expected.length === 0 && addons.every(function (a) { return !/js/i.test(a); }), { expected: expected, addons: addons });
    });
    if (process.env.WPSR_MENU_PROBE === '1') await guard('W4', 'probe', 'a registered online add-in (publish.xml + jsplugins.xml, local server) is NOT fetched by this WPS within 50 s', async function () {
      var JD = path.join(os.homedir(), 'snap/wps-office/1/.local/share/Kingsoft/wps/jsaddons'), existed = fs.existsSync(JD), reqs = [], PORT = 58991;
      var s2 = http.createServer(function (rq, rs) { reqs.push(rq.method + ' ' + rq.url); rs.writeHead(404); rs.end(); }); await new Promise(function (r) { s2.listen(PORT, '127.0.0.1', r); });
      var xml = '<jsplugins>\n  <jspluginonline name="SheetDoor" type="et" url="http://127.0.0.1:' + PORT + '/"/>\n</jsplugins>\n'; fs.mkdirSync(JD, { recursive: true }); fs.writeFileSync(path.join(JD, 'publish.xml'), xml); fs.writeFileSync(path.join(JD, 'jsplugins.xml'), xml);
      var f = path.join(RUN, 'menu_probe.xlsx'); fs.copyFileSync(WBO, f); var t0 = Date.now(); var r = await wpsResave(f, { save: false }); await sleep(Math.max(0, 50000 - (Date.now() - t0)));
      var tabs = r.titles; s2.close(); if (!existed) fs.rmSync(path.join(os.homedir(), 'snap/wps-office/1/.local/share/Kingsoft/wps'), { recursive: true, force: true });
      say('§WPSR-MENU-PROBE registered=http://127.0.0.1:' + PORT + '/ windows=' + J(tabs) + ' requestsReceived=' + reqs.length + ' ' + J(reqs.slice(0, 5)) + ' registrationRemoved=' + !fs.existsSync(JD));
      check('W4', 'probe', 'a registered online add-in is NOT fetched by this WPS within 50 s (0 requests = the menu cannot load here)', reqs.length === 0, reqs);
    });
    verdict('W4');
  }
  await B.browser.close(); srv.srv.close();
  if (B.external.length) say('§WPSR-EXTERNAL requests refused (left the local tree): ' + B.external.length + ' e.g. ' + B.external.slice(0, 3).join(' | '));
  if (process.env.WPSR_KEEP !== '1') fs.rmSync(RUN, { recursive: true, force: true }); else say('§WPSR-KEEP run directory kept: ' + RUN);
  var left = sh('sh', ['-c', 'ps -o pid=,args= -p ' + STARTED.xvfb.concat(STARTED.wps).join(',') + ' 2>/dev/null']).stdout.trim();
  say('§WPSR-CLEANUP started xvfb=' + J(STARTED.xvfb) + ' wps=' + J(STARTED.wps) + ' stillRunning=' + (left ? J(left.split('\n').map(function (l) { return l.trim().slice(0, 60); })) : 'none'));
  var vs = ['W1', 'W2', 'W3', 'W4'].filter(wants).map(caseVerdict);
  var overall = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : vs.indexOf('INCONCLUSIVE') >= 0 && !(ONLY.length) ? 'INCONCLUSIVE' : ALL.findings ? 'FINDINGS' : 'PASS';
  say('§WPSR-VERDICT ' + overall + ' judged=' + ALL.judged + ' findings=' + ALL.findings + ' failed=' + ALL.failed + ' cases=' + J(vs) + ' ' + SUFFIX);
  process.exit(overall === 'PASS' || overall === 'FINDINGS' ? 0 : overall === 'INCONCLUSIVE' ? 2 : 1);
})().catch(function (e) { STARTED.wps.forEach(killTree); STARTED.xvfb.forEach(killTree); say('§WPSR-VERDICT FAIL crashed: ' + (e && e.stack || e) + ' ' + SUFFIX); process.exit(1); });
