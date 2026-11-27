#!/usr/bin/env node
// ⚠ DO NOT REMOVE - W-PDF-WRITE-PAGE (bim-compiler prompts/PDF_EDITOR.md §4.3, the page half). READ THE LOG after every run; the exit code is not evidence.
// THE ISSUE THIS PROVES OR DISPROVES: the write-back engine passes in node (witness_pdf_write.js), but can a number really be CHANGED on the
//   real page and the same PDF handed back? The chain end is "a cell is edited and the result is correct", not "the engine loads":
//   real page, real double-click and key presses, real Download, headless Chromium, CPU only. Every check is a number or a log line, never a picture.
// Command: env -u DBUS_SESSION_BUS_ADDRESS node pdf/tests/witness_pdf_write_page.js      INCONCLUSIVE (exit 2) when puppeteer is missing.
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ROOT = path.join(__dirname, '..', '..'), PDFD = path.join(ROOT, 'pdf'), puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { try { puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')); } catch (e2) { console.log('§PDFWP-VERDICT INCONCLUSIVE puppeteer is not installed: nothing judged'); process.exit(2); } }
var say = function (s) { process.stdout.write(s + '\n'); }, log0 = console.log; console.log = function () {}; console.warn = function () {};
var pdfjs = require(path.join(ROOT, 'modeller/lib/pdfjs/pdf.min.js')); pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'modeller/lib/pdfjs/pdf.worker.min.js');
var PO = require(path.join(PDFD, 'pdf_open.js')), RR = require(path.join(PDFD, 'report_reader.js')), XLSX = require(path.join(ROOT, 'erp/xlsx.mini.min.js')), K = require(path.join(ROOT, 'erp/ws_kernel.js'));
var judged = 0, failed = 0, J = JSON.stringify;
function check(key, rule, ok, info) { judged++; if (!ok) failed++; say('  §PDFWP-CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info))); }
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.pdf': 'application/pdf' };
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }, count = function (t, s) { return t.split(s).length - 1; };

(async function () {
  var srv = http.createServer(function (q, s) { var p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (p.indexOf(ROOT) !== 0) { s.writeHead(403); return s.end(); } if (/\/$/.test(p)) p += 'index.html'; fs.readFile(p, function (e, b) { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); }); var base = 'http://127.0.0.1:' + srv.address().port;
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfwp_')), dl = path.join(tmp, 'dl'), br = await puppeteer.launch({ headless: 'new', userDataDir: path.join(tmp, 'profile'), args: ['--no-sandbox', '--disable-gpu'] });
  var pg = await br.newPage(), logs = [], errs = []; await pg.setViewport({ width: 1500, height: 900 });
  pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(String(e).slice(0, 200)); });
  var cdp = await pg.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl }).catch(function () {});
  var waitLog = async function (re, from, ms) { for (var t = 0; t < (ms || 20000); t += 100) { var l = logs.slice(from).filter(function (x) { return re.test(x); })[0]; if (l) return l; await sleep(100); } return null; };
  var pick = async function (file) { var n = logs.length, r = await Promise.all([pg.waitForFileChooser(), pg.click('#b-open')]); await r[0].accept([file]); return n; };
  var TB = path.join(PDFD, 'corpus/trial_balance_th.pdf');
  // type into a number cell with real events: double-click, select all (the page does it), keys, then Enter or Escape
  var typeInto = async function (a, text, key) { var n = logs.length; await pg.click('#grid td[data-a="' + a + '"]', { clickCount: 2 }); await pg.waitForSelector('#grid td[data-a="' + a + '"] input', { timeout: 5000 }); await pg.keyboard.type(text); await pg.keyboard.press(key || 'Enter'); return n; };
  var ui = function () { return pg.evaluate(function () { var S = window.PdfPage.state, t = function (a) { var d = document.querySelector('#grid td[data-a="' + a + '"]'); return d ? { text: d.textContent, cls: d.className } : null; }; return { D10: t('D10'), D28: t('D28'), verdict: document.getElementById('verdict').textContent, cls: document.getElementById('verdict').className, stat: document.getElementById('stat').textContent, pdfBtn: !document.getElementById('b-pdf').disabled, edits: S.edits, hist: S.history.length, bytes: S.bytes ? S.bytes.length : 0, inputs: document.querySelectorAll('#grid input').length }; }); };
  var drawn = function () { return pg.waitForFunction('document.querySelector(\'.pg[data-p="1"]\') && document.querySelector(\'.pg[data-p="1"]\').dataset.drawn === "1"', { timeout: 20000 }).catch(function () {}); };
  var grab = function (name) { return pg.evaluate(function (nm) { var c = document.querySelector('.pg[data-p="1"] canvas'); if (!c) return null; window[nm] = { w: c.width, h: c.height, d: c.getContext('2d').getImageData(0, 0, c.width, c.height).data }; return { w: c.width, h: c.height }; }, name); };
  var b64 = function (prop) { return pg.evaluate(function (p) { var u = window.PdfPage.state[p]; if (!u) return null; var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }, prop); };
  try {
    await pg.goto(base + '/pdf/index.html', { waitUntil: 'load' });
    var boot = await waitLog(/^§PDFED-BOOT/, 0, 10000);
    check('boot', 'the page loads the writer and the history engine (§PDFED-BOOT writer=function history=function)', !!boot && /writer=function/.test(boot) && /history=function/.test(boot), boot);
    var n0 = await pick(TB); await waitLog(/^§PDFED-OPEN ok=true/, n0); await drawn();
    var n1 = logs.length; await pg.click('#b-sheet'); var rd = await waitLog(/^§SHEET_READER/, n1), gen = await waitLog(/^§PDFWR-HISTORY entries=1/, n1);
    var u0 = await ui();
    check('before', 'Read as sheet: ADDS_UP, 144 cells; the history starts with its genesis entry (144 cells); Download PDF is off until a number is changed', !!rd && /verdict=ADDS_UP/.test(rd) && /cells=144 /.test(rd) && !!gen && /ops=144 genesis=true/.test(gen) && u0.pdfBtn === false && u0.D10.text === '498.09', { read: rd, gen: gen, ui: u0 });
    await pg.click('#grid td[data-a="B10"]', { clickCount: 2 }); await sleep(200);
    check('text-cell', 'a TEXT cell (B10) opens no editor on double-click: numbers only', (await ui()).inputs === 0, await ui());
    await grab('__before');

    // edit 1: D10 498.09 -> 499.09, the total left stale
    var bytes0 = u0.bytes, n2 = await typeInto('D10', '499.09'), ed1 = await waitLog(/^§PDFWR-EDIT cell=D10/, n2), sh1 = logs.slice(n2).filter(function (l) { return /^§PDFWR-SHEET cell=D10/.test(l); })[0], rr1 = logs.slice(n2).filter(function (l) { return /^§PDFWR-REREAD cell=D10/.test(l); })[0], hs1 = await waitLog(/^§PDFWR-HISTORY entries=2/, n2, 5000), wr1 = logs.slice(n2).filter(function (l) { return /^§PDF_WRITE ok=/.test(l); })[0];
    say('  ' + wr1); say('  ' + sh1); say('  ' + rr1); say('  ' + hs1); say('  ' + ed1);
    check('edit-applied', 'typing 499.09 into D10 and Enter: §PDFWR-EDIT ok=true old="498.09" new="499.09", the engine line §PDF_WRITE ok=true applied=1', !!ed1 && /ok=true old="498\.09" new="499\.09"/.test(ed1) && !!wr1 && /ok=true edits=1 applied=1 refused=0/.test(wr1), { edit: ed1, write: wr1 });
    check('both-verdicts', 'both verdicts are logged and agree: the edited SHEET and the re-read rewritten PDF say DOES_NOT_ADD_UP naming D28 (40392.44 vs 40393.44)', !!sh1 && !!rr1 && /verdict=DOES_NOT_ADD_UP/.test(sh1) && /D28: printed 40392\.44 != rows sum 40393\.44/.test(sh1) && /verdict=DOES_NOT_ADD_UP/.test(rr1) && /D28: printed 40392\.44 != rows sum 40393\.44/.test(rr1) && /text="499\.09"/.test(rr1) && /agree=true/.test(ed1 || ''), { sheet: sh1, reread: rr1 });
    await drawn(); var u1 = await ui();
    check('grid-after', 'the grid shows D10 = 499.09 marked as edited, says in words that the page does NOT add up, and Download PDF is on', u1.D10.text === '499.09' && /\bed\b/.test(u1.D10.cls) && u1.cls === 'bad' && /does NOT add up/.test(u1.verdict) && /D28/.test(u1.verdict) && /D10 is now 499\.09/.test(u1.verdict) && u1.pdfBtn === true && u1.edits === 1, u1);
    check('history-1', 'the edit is ONE history entry with ONE CELL_SET: §PDFWR-HISTORY entries=2 ops=1 cell=D10 before=498.09 after=499.09', !!hs1 && /entries=2 ops=1 cell=D10 before=498\.09 after=499\.09 typedOverFormula=false/.test(hs1), hs1);
    await grab('__after');
    var px = await pg.evaluate(function () { var A = window.__before, B = window.__after, S = window.PdfPage.state; if (!A || !B || A.w !== B.w || A.h !== B.h) return { same: false, a: A && [A.w, A.h], b: B && [B.w, B.h] }; var k = A.w / S.info.sizes[0][0], m = S.read.map.D10.box, q = [Math.floor(m[0] * k) - 3, Math.floor(m[1] * k) - 3, Math.ceil(m[2] * k) + 3, Math.ceil(m[3] * k) + 3], inside = 0, outside = 0; for (var y = 0; y < A.h; y++) for (var x = 0; x < A.w; x++) { var i = (y * A.w + x) * 4; if (A.d[i] === B.d[i] && A.d[i + 1] === B.d[i + 1] && A.d[i + 2] === B.d[i + 2] && A.d[i + 3] === B.d[i + 3]) continue; if (x >= q[0] && x <= q[2] && y >= q[1] && y <= q[3]) inside++; else outside++; } return { same: true, w: A.w, h: A.h, inside: inside, outside: outside }; });
    say('§PDFWP-CANVAS ' + J(px));
    check('canvas', 'the page on screen was redrawn from the rewritten PDF: pixels inside D10\'s box changed (> 0), 0 pixels changed anywhere else', px.same && px.inside > 0 && px.outside === 0, px);

    // edit 2: the total, typed without its comma -> printed the way the column prints
    var n3 = await typeInto('D28', '40393.44'), ed2 = await waitLog(/^§PDFWR-EDIT cell=D28/, n3), rr2 = logs.slice(n3).filter(function (l) { return /^§PDFWR-REREAD cell=D28/.test(l); })[0], hs2 = await waitLog(/^§PDFWR-HISTORY entries=3/, n3, 5000);
    say('  ' + rr2); say('  ' + hs2); say('  ' + ed2);
    await drawn(); var u2 = await ui();
    check('total', 'typing 40393.44 into D28: printed as the column prints it ("40,393.44"); sheet and re-read PDF both ADDS_UP; the grid says the page adds up', !!ed2 && /ok=true old="40,392\.44" new="40,393\.44" sheetVerdict=ADDS_UP pdfVerdict=ADDS_UP agree=true fontSub=none/.test(ed2) && !!rr2 && /text="40,393\.44"/.test(rr2) && u2.D28.text === '40,393.44' && u2.cls === 'good' && /adds up/.test(u2.verdict), { edit: ed2, ui: u2 });
    check('history-2', 'second entry: ONE CELL_SET for D28, flagged typedOverFormula (a typed total over a found SUM)', !!hs2 && /entries=3 ops=1 cell=D28 before=40392\.44 after=40393\.44 typedOverFormula=true/.test(hs2), hs2);

    // Download PDF: the bytes handed over, judged outside the page
    var n4 = logs.length; await pg.click('#b-pdf'); var dn = await waitLog(/^§PDFWR-DOWNLOAD/, n4), pb = await b64('lastPdf'), out = pb ? new Uint8Array(Buffer.from(pb, 'base64')) : null, file = path.join(dl, 'trial_balance_th_edited.pdf');
    say('  ' + dn);
    for (var w = 0; w < 50 && !fs.existsSync(file); w++) await sleep(100);
    var onDisk = fs.existsSync(file) ? fs.readFileSync(file) : null;
    check('download', 'Download PDF hands over trial_balance_th_edited.pdf: the file the browser saved is byte-equal to the page\'s rewritten PDF (' + (out ? out.length : 0) + ' bytes)', !!dn && /file="trial_balance_th_edited\.pdf"/.test(dn) && /edits=2 historyEntries=3 verdict=ADDS_UP/.test(dn) && !!out && !!onDisk && Buffer.from(out).equals(onDisk), { log: dn, page: out && out.length, disk: onDisk && onDisk.length });
    if (out) {
      var f = path.join(tmp, 'judge.pdf'); fs.writeFileSync(f, out);
      var txt = cp.spawnSync('pdftotext', ['-raw', f, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }), info = cp.spawnSync('pdfinfo', [f], { encoding: 'utf8' });
      if (txt.error || info.error) say('  §PDFWP-NOTE poppler is not installed: the downloaded PDF was not judged by an independent reader');
      else check('poppler', 'poppler on the downloaded PDF: 499.09 once, 40,393.44 once, 498.09 gone, 40,392.44 once (E28); pdfinfo 1 page, no message', count(txt.stdout, '499.09') === 1 && count(txt.stdout, '40,393.44') === 1 && count(txt.stdout, '498.09') === 0 && count(txt.stdout, '40,392.44') === 1 && info.status === 0 && (info.stderr || '').trim() === '' && /Pages:\s+1\b/.test(info.stdout) && (txt.stderr || '').trim() === '', { counts: [count(txt.stdout, '499.09'), count(txt.stdout, '40,393.44'), count(txt.stdout, '498.09'), count(txt.stdout, '40,392.44')], err: info.stderr });
      var doc = await PO.open(pdfjs, out), R = doc.ok ? RR.read(doc.items) : { sheet: {}, verdict: 'NOT-OPEN' };
      check('node-reread', 'our reader in node on the downloaded PDF: 144 cells, D10 = 499.09, D28 = 40393.44, verdict ADDS_UP', doc.ok && Object.keys(R.sheet).length === 144 && R.sheet.D10.v === 499.09 && R.sheet.D28.v === 40393.44 && R.verdict === 'ADDS_UP', { verdict: R.verdict, d10: R.sheet.D10, d28: R.sheet.D28 });
    }
    var lines = await pg.evaluate(function () { return window.PdfPage.state.lines; }), v = K.verifyJournal(lines.join('\n')), ents = lines.map(function (l) { return JSON.parse(l); });
    check('history-verified', 'the page\'s history (genesis + one entry per applied edit = 3 lines) passes the kernel\'s own verifyJournal; entries 2 and 3 hold one CELL_SET each (D10, D28)', v.ok === true && v.entries === 3 && ents.length === 3 && ents[1].payload.ops.length === 1 && ents[1].payload.ops[0].cell === 'D10' && ents[2].payload.ops.length === 1 && ents[2].payload.ops[0].cell === 'D28' && ents[2].actor === 'you', { verify: v, n: ents.length });
    var n5 = logs.length; await pg.click('#b-xlsx'); await waitLog(/^§PDFED-XLSX/, n5); var xb = await b64('lastXlsx'), ws = xb ? XLSX.read(Buffer.from(xb, 'base64'), { type: 'buffer' }).Sheets.Report : null;
    check('xlsx-after', 'the .xlsx handed over after the edits holds the edited sheet: D10 = 499.09, D28 = 40393.44 with =SUM(D6:D26)', !!ws && ws.D10 && ws.D10.v === 499.09 && ws.D28 && ws.D28.v === 40393.44 && ws.D28.f === 'SUM(D6:D26)', ws && { d10: ws.D10, d28: ws.D28 });

    // refusals in words: nothing changes
    var before = await ui(), n6 = await typeInto('D10', 'abc'), r1 = await waitLog(/^§PDFWR-EDIT cell=D10/, n6, 5000), a1 = await ui();
    check('refuse-word', 'typing "abc" into D10 is refused in words (reason=not-a-number): the cell goes back to 499.09, no history entry, the PDF bytes unchanged', !!r1 && /ok=false reason=not-a-number/.test(r1) && a1.D10.text === '499.09' && /was not changed/.test(a1.stat) && a1.hist === before.hist && a1.bytes === before.bytes && a1.edits === before.edits, { log: r1, ui: a1 });
    var n7 = await typeInto('D10', '1.234'), r2 = await waitLog(/^§PDFWR-EDIT cell=D10/, n7, 5000), a2 = await ui();
    check('refuse-decimals', 'typing "1.234" (more decimals than the column prints) is refused, not rounded: reason=too-many-decimals, nothing changes', !!r2 && /ok=false reason=too-many-decimals/.test(r2) && a2.D10.text === '499.09' && a2.hist === before.hist && a2.bytes === before.bytes, { log: r2, ui: a2 });
    var n8 = await typeInto('D10', '777.77', 'Escape'); await sleep(400); var a3 = await ui();
    check('escape', 'Escape leaves the cell as it was: no §PDFWR-EDIT line, D10 still 499.09, no editor left open', logs.slice(n8).filter(function (l) { return /^§PDFWR-EDIT/.test(l); }).length === 0 && a3.D10.text === '499.09' && a3.inputs === 0 && a3.hist === before.hist, a3);
    var n9 = await typeInto('D10', '999999999999999.99'), r3 = await waitLog(/^§PDFWR-EDIT cell=D10/, n9, 5000), a4 = await ui();
    say('  ' + r3);
    check('refuse-fit', 'a number too wide for its cell is refused in words (reason=does-not-fit), nothing changes', !!r3 && /ok=false reason=does-not-fit/.test(r3) && a4.D10.text === '499.09' && a4.bytes === before.bytes && a4.hist === before.hist, { log: r3, ui: a4 });
    // a digit the bold subset lacks: written, and said in words
    var n10 = await typeInto('D28', '40395.44'), ed3 = await waitLog(/^§PDFWR-EDIT cell=D28/, n10), sub = logs.slice(n10).filter(function (l) { return /^§PDFED-FONT-SUB/.test(l); })[0], a5 = await ui();
    say('  ' + sub); say('  ' + ed3);
    check('substitution-said', 'D28 -> 40,395.44 (the bold subset has no 5): written with §PDFED-FONT-SUB, and the page SAYS which font was used and why', !!ed3 && /ok=true/.test(ed3) && /fontSub=LiberationSans-Bold>LiberationSans /.test(ed3) && !!sub && /missing="5"/.test(sub) && /written in LiberationSans because the font LiberationSans-Bold in this PDF has no "5"/.test(a5.verdict) && a5.D28.text === '40,395.44' && a5.cls === 'bad', { edit: ed3, sub: sub, ui: a5 });

    // no network: the page still boots with the writer and still edits (pdf_write.js and sheet_history.js are in the offline cache)
    var sw = await waitLog(/^§PDFED-OFFLINE ready=true/, 0, 15000); await sleep(500);
    await pg.setOfflineMode(true); var n11 = logs.length; await pg.reload({ waitUntil: 'load' }).catch(function () {}); var boot2 = await waitLog(/^§PDFED-BOOT/, n11, 10000), off = null;
    if (boot2) { var n12 = await pick(TB); await waitLog(/^§PDFED-OPEN ok=true/, n12); await pg.click('#b-sheet'); await waitLog(/^§PDFWR-HISTORY entries=1/, n12); var n13 = await typeInto('D10', '499.09'); off = await waitLog(/^§PDFWR-EDIT cell=D10/, n13); }
    await pg.setOfflineMode(false);
    check('offline', 'with the network OFF the page reloads with the writer and an edit still works (§PDFWR-EDIT ok=true)', !!sw && !!boot2 && /writer=function history=function/.test(boot2) && !!off && /ok=true old="498\.09" new="499\.09"/.test(off), { sw: sw, boot: boot2, edit: off });
    check('no-errors', 'no uncaught page error in the whole run', errs.length === 0, errs.slice(0, 4));
  } catch (e) { check('crash', 'the run completes', false, String(e && e.stack || e).slice(0, 400)); }
  await br.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  say('§PDFWP-VERDICT ' + (!judged ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + failed);
  process.exit(failed ? 1 : judged ? 0 : 2);
})().catch(function (e) { say('§PDFWP-VERDICT FAIL crash ' + (e && e.stack || e)); process.exit(3); });
