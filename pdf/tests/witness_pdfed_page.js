#!/usr/bin/env node
// ⚠ DO NOT REMOVE - W-PDFED-P0, page half: claim V5 (bim-compiler prompts/PDF_EDITOR.md §4.1). READ THE LOG after every run; the exit code is not evidence.
// THE ISSUE THIS PROVES OR DISPROVES: the engines pass in node, but does the REAL page load them, draw a page, read the report as a sheet,
//   hand over the .xlsx, release off-screen pages and refuse a bad file in words? Wiring only: values are proven by the node witnesses.
//   Real page, real clicks, real file chooser, headless Chromium, CPU only (no GPU). Every check is a number or a log line, never a picture.
// Command: NODE_PATH=~/bim-compiler/node_modules node pdf/tests/witness_pdfed_page.js      VACUOUS (exit 2) when puppeteer is missing.
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..'), PDFD = path.join(ROOT, 'pdf'), puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { try { puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')); } catch (e2) { console.log('§PDFPG-VERDICT INCONCLUSIVE puppeteer is not installed: nothing judged'); process.exit(2); } }
var XLSX = require(path.join(ROOT, 'erp/xlsx.mini.min.js'));
var judged = 0, failed = 0, J = JSON.stringify;
function check(key, rule, ok, info) { judged++; if (!ok) failed++; console.log('  §PDFPG-CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info))); }
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.pdf': 'application/pdf' };
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

(async function () {
  var srv = http.createServer(function (q, s) { var p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (p.indexOf(ROOT) !== 0) { s.writeHead(403); return s.end(); } if (/\/$/.test(p)) p += 'index.html';   /* a folder serves its index.html, as GitHub Pages does */ fs.readFile(p, function (e, b) { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); }); var base = 'http://127.0.0.1:' + srv.address().port;
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfpg_')), br = await puppeteer.launch({ headless: 'new', userDataDir: path.join(tmp, 'profile'), args: ['--no-sandbox', '--disable-gpu'] });
  var pg = await br.newPage(), logs = [], errs = []; await pg.setViewport({ width: 1400, height: 800 });
  pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(String(e).slice(0, 200)); });
  var cdp = await pg.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.join(tmp, 'dl') }).catch(function () {});
  var waitLog = async function (re, from, ms) { for (var t = 0; t < (ms || 20000); t += 100) { var l = logs.slice(from).filter(function (x) { return re.test(x); })[0]; if (l) return l; await sleep(100); } return null; };
  var pick = async function (file) { var n = logs.length, r = await Promise.all([pg.waitForFileChooser(), pg.click('#b-open')]); await r[0].accept([file]); return n; };
  try {
    await pg.goto(base + '/pdf/index.html', { waitUntil: 'load' });
    var boot = await waitLog(/^§PDFED-BOOT/, 0, 10000);
    check('boot', 'the page loads pdf.js, the reader and SheetJS (§PDFED-BOOT)', !!boot && /reader=function/.test(boot), boot);

    // the trial balance
    var n0 = await pick(path.join(PDFD, 'corpus/trial_balance_th.pdf')), open = await waitLog(/^§PDFED-OPEN/, n0);
    check('open', 'the real file chooser opens the trial balance: §PDFED-OPEN ok=true pages=1', !!open && /ok=true/.test(open) && /pages=1 /.test(open), open);
    await pg.waitForFunction('document.querySelector(\'.pg[data-p="1"]\') && document.querySelector(\'.pg[data-p="1"]\').dataset.drawn === "1"', { timeout: 20000 }).catch(function () {});
    var ink = await pg.evaluate(function () { var c = document.querySelector('.pg[data-p="1"] canvas'); if (!c) return { canvas: false }; var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, n = 0; for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200)) n++; return { canvas: true, w: c.width, h: c.height, ink: n }; });
    console.log('§PDFPG-INK ' + J(ink));
    check('ink', 'page 1 is drawn: its canvas holds ink (dark pixels > 1000 of ' + (ink.w * ink.h) + ')', ink.canvas && ink.ink > 1000, ink);
    var n1 = logs.length; await pg.click('#b-sheet'); var rd = await waitLog(/^§SHEET_READER/, n1);
    check('read', 'Read as sheet logs §SHEET_READER verdict=ADDS_UP cells=144', !!rd && /verdict=ADDS_UP/.test(rd) && /cells=144 /.test(rd), rd);
    var ui = await pg.evaluate(function () { return { cells: document.querySelectorAll('#grid td[data-a]').length, verdict: document.getElementById('verdict').textContent, cls: document.getElementById('verdict').className, d28: (document.querySelector('#grid td[data-a="D28"]') || {}).textContent }; });
    check('grid', 'the grid shows 144 cells, D28 = 40,392.44, and says in words that the page adds up', ui.cells === 144 && ui.d28 === '40,392.44' && ui.cls === 'good' && /adds up/.test(ui.verdict), ui);
    await pg.hover('#grid td[data-a="D28"]');
    var box = await pg.evaluate(function () { var b = document.querySelector('.pg .box'), S = window.PdfPage.state; if (!b) return null; var m = S.read.map.D28, d = b.parentElement, k = d.clientWidth / S.info.sizes[0][0]; return { a: b.dataset.a, page: Number(d.dataset.p), dx: Math.abs(parseFloat(b.style.left) + 2 - m.box[0] * k), dy: Math.abs(parseFloat(b.style.top) + 1 - m.box[1] * k), n: document.querySelectorAll('.pg .box').length }; });
    check('box', 'hovering D28 marks exactly one box on page 1, placed at the source map\'s box (off by < 0.5 px)', !!box && box.a === 'D28' && box.page === 1 && box.n === 1 && box.dx < 0.5 && box.dy < 0.5, box);
    var n2 = logs.length; await pg.click('#b-xlsx'); var xl = await waitLog(/^§PDFED-XLSX/, n2);
    var b64 = await pg.evaluate(function () { var u = window.PdfPage.state.lastXlsx; if (!u) return null; var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); });
    var ws = b64 ? XLSX.read(Buffer.from(b64, 'base64'), { type: 'buffer' }).Sheets.Report : null;
    check('xlsx', 'the .xlsx the page hands over re-reads to D28 = 40392.44 with =SUM(D6:D26) and A6 = "11100"', !!xl && !!ws && ws.D28 && Math.abs(ws.D28.v - 40392.44) < 0.005 && ws.D28.f === 'SUM(D6:D26)' && ws.A6 && ws.A6.v === '11100', { log: xl, d28: ws && ws.D28 });

    // the 12-page report: outline, find, release
    var big = path.join(PDFD, 'corpus/market_impact_report.pdf'), n3 = await pick(big), open2 = await waitLog(/^§PDFED-OPEN/, n3);
    check('open-12', 'the 12-page report opens: §PDFED-OPEN ok=true pages=12 outline=23', !!open2 && /ok=true/.test(open2) && /pages=12 /.test(open2) && /outline=23 /.test(open2), open2);
    var sheetGone = await pg.evaluate(function () { return !document.getElementById('main').classList.contains('sheet') && window.PdfPage.state.read === null; });
    check('reset', 'opening another file clears the previous sheet', sheetGone, sheetGone);
    await sleep(800); var a0 = await pg.evaluate(function () { return window.PdfPage.alive(); });
    var xml = (cp.spawnSync('pdftohtml', ['-xml', '-i', '-stdout', big], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || ''), items = [], re = /<item page="(\d+)">/g, m; while ((m = re.exec(xml))) items.push(Number(m[1]));
    var links = await pg.$$('#outline a'); if (links.length) await links[links.length - 1].click(); await sleep(600);
    var cur = await pg.evaluate(function () { return window.PdfPage.state.current; });
    if (items.length) check('outline', 'the outline lists 23 entries; clicking the last goes to the page poppler names (' + items[items.length - 1] + ')', links.length === 23 && items.length === 23 && cur === items[items.length - 1], { links: links.length, current: cur });
    else console.log('  §PDFPG-NOTE outline target not judged: pdftohtml not available');
    var n4 = logs.length; await pg.type('#q', 'market'); var fd = await waitLog(/^§PDFED-FIND q="market"/, n4);
    var txt = cp.spawnSync('pdftotext', ['-raw', big, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || '', want = (txt.toLowerCase().match(/market/g) || []).length, got = fd ? Number((/hits=(\d+)/.exec(fd) || [])[1]) : -1;
    if (want) check('find', 'Find "market" counts ' + want + ' hits, as poppler\'s text does', got === want, { got: got, want: want, log: fd });
    else console.log('  §PDFPG-NOTE find not judged: pdftotext gave no text');
    for (var p = 1; p <= 12; p++) { await pg.evaluate(function (q) { window.PdfPage.go(q); }, p); await sleep(350); }
    await sleep(800);
    var end = await pg.evaluate(function () { var S = window.PdfPage.state; return { alive: window.PdfPage.alive(), renders: S.renders, releases: S.releases, current: S.current, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1 }; });
    console.log('§PDFPG-RELEASE pages=12 aliveAtOpen=' + a0 + ' aliveAtEnd=' + end.alive + ' renders=' + end.renders + ' releases=' + end.releases + ' heapMB=' + end.heapMB);
    check('release', 'after scrolling through all 12 pages: 12 or more draws, canvases alive < 12, releases > 0', a0 < 12 && end.alive < 12 && end.alive > 0 && end.releases > 0 && end.renders >= 12, { open: a0, end: end });
    var costLine = logs.filter(function (l) { return /^§PDFED-COST/.test(l); }).pop();
    check('cost', 'the page logs §PDFED-COST with canvasesAlive and heap', !!costLine && /canvasesAlive=\d+/.test(costLine) && /heapMB=-?\d+/.test(costLine), costLine);

    // a bad file is refused in words
    var bad = path.join(tmp, 'notes.pdf'); fs.writeFileSync(bad, 'these are my notes, not a PDF');
    var n5 = await pick(bad), open3 = await waitLog(/^§PDFED-OPEN/, n5), st = await pg.evaluate(function () { return { stat: document.getElementById('stat').textContent, canvases: window.PdfPage.alive(), sheetBtn: document.getElementById('b-sheet').disabled }; });
    check('refuse', 'a non-PDF is refused in words (§PDFED-OPEN ok=false named=not-a-pdf), nothing drawn, Read as sheet off', !!open3 && /ok=false named=not-a-pdf/.test(open3) && /not a PDF/.test(st.stat) && st.canvases === 0 && st.sheetBtn === true, { log: open3, st: st });
    // no network: the page still boots and still reads the report
    var sw = await waitLog(/^§PDFED-OFFLINE ready=true/, 0, 15000); await sleep(500);
    await pg.setOfflineMode(true); var n6 = logs.length; await pg.reload({ waitUntil: 'load' }).catch(function () {}); var boot2 = await waitLog(/^§PDFED-BOOT/, n6, 10000), off = null;
    if (boot2) { var n7 = await pick(path.join(PDFD, 'corpus/trial_balance_th.pdf')); await waitLog(/^§PDFED-OPEN ok=true/, n7); var n8 = logs.length; await pg.click('#b-sheet'); off = await waitLog(/^§SHEET_READER/, n8); }
    await pg.setOfflineMode(false);
    check('offline', 'with the network OFF the page reloads, opens the trial balance and reads it: verdict=ADDS_UP cells=144', !!sw && !!boot2 && !!off && /verdict=ADDS_UP/.test(off) && /cells=144 /.test(off), { sw: sw, boot: boot2, read: off });
    // red control for the offline check: with the service worker bypassed and the network off, the page must NOT boot
    await pg.setBypassServiceWorker(true); await pg.setOfflineMode(true); var n9 = logs.length; await pg.reload({ waitUntil: 'load', timeout: 8000 }).catch(function () {}); var boot3 = await waitLog(/^§PDFED-BOOT/, n9, 3000);
    await pg.setOfflineMode(false); await pg.setBypassServiceWorker(false);
    check('offline-control', 'red control: network off AND the offline cache bypassed -> the page does not boot (so the offline check can fail)', boot3 === null, boot3);
    check('no-errors', 'no uncaught page error in the whole run', errs.length === 0, errs.slice(0, 4));
  } catch (e) { check('crash', 'the run completes', false, String(e && e.stack || e).slice(0, 400)); }
  await br.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log('§PDFPG-VERDICT ' + (!judged ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + failed);
  process.exit(failed ? 1 : judged ? 0 : 2);
})().catch(function (e) { console.log('§PDFPG-VERDICT FAIL crash ' + (e && e.stack || e)); process.exit(3); });
