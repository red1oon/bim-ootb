#!/usr/bin/env node
// ⚠ DO NOT REMOVE - W-PDF-HISTORY-PAGE (bim-compiler prompts/PDF_EDITOR.md §4.5, the page half). READ THE LOG after every run; the exit code is not evidence.
// THE ISSUE THIS PROVES OR DISPROVES: the engine passes in node (witness_pdf_history.js), but does the history really LEAVE the page inside the
//   downloaded PDF and .xlsx, and does the page take it up again when that same file is opened? The chain end is "the file on disk is opened in a
//   second session and the next edit is entry N+1", not "the engine loads". Real page, real file chooser, real key presses, real downloads,
//   headless Chromium, CPU only. Every check is a number or a log line, never a picture.
// Command: env -u DBUS_SESSION_BUS_ADDRESS node pdf/tests/witness_pdf_history_page.js      INCONCLUSIVE (exit 2) when puppeteer is missing.
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ROOT = path.join(__dirname, '..', '..'), PDFD = path.join(ROOT, 'pdf'), puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { try { puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')); } catch (e2) { console.log('§PDFHP-VERDICT INCONCLUSIVE puppeteer is not installed: nothing judged'); process.exit(2); } }
var say = function (s) { process.stdout.write(s + '\n'); }; console.log = function () {}; console.warn = function () {};
var pdfjs = require(path.join(ROOT, 'modeller/lib/pdfjs/pdf.min.js')); pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'modeller/lib/pdfjs/pdf.worker.min.js');
var PO = require(path.join(PDFD, 'pdf_open.js')), RR = require(path.join(PDFD, 'report_reader.js')), PW = require(path.join(PDFD, 'pdf_write.js')), PH = require(path.join(PDFD, 'pdf_history.js')), H = require(path.join(ROOT, 'erp/sheet_history.js')), K = require(path.join(ROOT, 'erp/ws_kernel.js')), XLSX = require(path.join(ROOT, 'erp/xlsx.mini.min.js')), SA = require(path.join(ROOT, 'erp/sheet_addin/host_shim.js'));
var judged = 0, failed = 0, J = JSON.stringify;
function check(key, rule, ok, info) { judged++; if (!ok) failed++; say('  §PDFHP-CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info))); }
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.pdf': 'application/pdf' };
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var HAVE_DETACH = !cp.spawnSync('pdfdetach', ['-v'], { encoding: 'utf8' }).error;
function detach(file) { var l = cp.spawnSync('pdfdetach', ['-list', file], { encoding: 'utf8' }), names = (l.stdout || '').split('\n').map(function (x) { return (/^\s*\d+:\s+(.*)$/.exec(x) || [])[1]; }).filter(Boolean), o = file + '.att'; if (names.length) cp.spawnSync('pdfdetach', ['-save', '1', '-o', o, file], { encoding: 'utf8' }); return { names: names, text: fs.existsSync(o) ? fs.readFileSync(o, 'utf8') : null }; }
function xlsxHost(wb) { return { getHidden: async function (name) { var ws = wb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).map(function (r) { return r.map(String); }) : []; }, setHidden: async function () {}, selectedCell: async function () { return { sheet: 'Report', cell: 'A1' }; }, visibleSheets: async function () { return []; }, readSheetValues: async function () { return {}; }, userName: async function () { return 'witness'; } }; }

(async function () {
  var srv = http.createServer(function (q, s) { var p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (p.indexOf(ROOT) !== 0) { s.writeHead(403); return s.end(); } if (/\/$/.test(p)) p += 'index.html'; fs.readFile(p, function (e, b) { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); }); var base = 'http://127.0.0.1:' + srv.address().port;
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfhp_')), br = await puppeteer.launch({ headless: 'new', userDataDir: path.join(tmp, 'profile'), args: ['--no-sandbox', '--disable-gpu'] });
  var pg = await br.newPage(), logs = [], errs = []; await pg.setViewport({ width: 1500, height: 900 });
  pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(String(e).slice(0, 200)); });
  var cdp = await pg.target().createCDPSession(), dlTo = async function (name) { var d = path.join(tmp, name); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: d }).catch(function () {}); return d; };
  var waitLog = async function (re, from, ms) { for (var t = 0; t < (ms || 20000); t += 100) { var l = logs.slice(from).filter(function (x) { return re.test(x); })[0]; if (l) return l; await sleep(100); } return null; };
  var since = function (re, from) { return logs.slice(from).filter(function (x) { return re.test(x); }); };
  var pick = async function (file) { var n = logs.length, r = await Promise.all([pg.waitForFileChooser(), pg.click('#b-open')]); await r[0].accept([file]); await waitLog(/^§PDFHIST-STATE/, n); return n; };
  var typeInto = async function (a, text) { var n = logs.length; await pg.click('#grid td[data-a="' + a + '"]', { clickCount: 2 }); await pg.waitForSelector('#grid td[data-a="' + a + '"] input', { timeout: 5000 }); await pg.keyboard.type(text); await pg.keyboard.press('Enter'); await waitLog(/^§PDFWR-EDIT cell=/, n); return n; };
  var ui = function () { return pg.evaluate(function () { var S = window.PdfPage.state, h = document.getElementById('hist-say'); return { say: h.textContent, cls: h.className, story: Array.prototype.map.call(document.querySelectorAll('#hist-story div'), function (d) { return d.textContent; }), ask: !document.getElementById('hist-cell').disabled, lines: S.lines.slice(), entries: S.history.length, pdfBtn: !document.getElementById('b-pdf').disabled, carried: S.check ? S.check.state : null }; }); };
  var b64 = function (prop) { return pg.evaluate(function (p) { var u = window.PdfPage.state[p]; if (!u) return null; var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }, prop); };
  var saved = async function (dir, name) { var f = path.join(dir, name); for (var w = 0; w < 80 && !fs.existsSync(f); w++) await sleep(100); await sleep(150); return fs.existsSync(f) ? f : null; };
  var TB = path.join(PDFD, 'corpus/trial_balance_th.pdf');
  try {
    await pg.goto(base + '/pdf/index.html', { waitUntil: 'load' });
    var boot = await waitLog(/^§PDFED-BOOT/, 0, 10000);
    check('boot', 'the page loads the in-file history owner and the Excel menu\'s chunk writer (§PDFED-BOOT inFile=function chunks=function)', !!boot && /inFile=function chunks=function/.test(boot), boot);

    // session 1: a plain PDF -> read -> one edit -> Download PDF
    var n0 = await pick(TB), op0 = since(/^§PDFHIST-OPEN/, n0)[0], u0 = await ui();
    check('plain-open', 'a PDF without history opens as before: §PDFHIST-OPEN state=none, the History block says there is none yet, no word of tampering, the story box is off', !!op0 && /state=none entries=0/.test(op0) && /^No history yet/.test(u0.say) && u0.cls === 'none' && u0.ask === false && !/changed|verify/i.test(u0.say), { log: op0, ui: u0 });
    var n1 = logs.length; await pg.click('#b-sheet'); await waitLog(/^§PDFWR-HISTORY entries=1/, n1); await waitLog(/^§PDFHIST-STATE entries=1/, n1); var u1 = await ui();
    check('genesis-said', 'Read as sheet starts the history and the block says so: "History: 1 entry, verified. It is kept inside the PDF and the .xlsx you download."', /^History: 1 entry, verified\. It is kept inside the PDF and the \.xlsx you download\./.test(u1.say) && u1.cls === 'good' && u1.ask === true, u1);
    await typeInto('D10', '499.09'); await waitLog(/^§PDFHIST-STATE entries=2/, n1);
    var d1 = await dlTo('dl1'), n2 = logs.length; await pg.click('#b-pdf'); var dn = await waitLog(/^§PDFWR-DOWNLOAD/, n2), sv = since(/^§PDFHIST-SAVE/, n2)[0], f1 = await saved(d1, 'trial_balance_th_edited.pdf'), u2 = await ui(), pb = await b64('lastPdf');
    say('  ' + sv); say('  ' + dn);
    check('download-carries', 'Download PDF: §PDFHIST-SAVE ok=true entries=2, §PDFWR-DOWNLOAD historyInFile=true; the file the browser saved is byte-equal to the page\'s bytes', !!sv && /ok=true entries=2 /.test(sv) && /replaced=false/.test(sv) && !!dn && /historyEntries=2 .*historyInFile=true/.test(dn) && !!f1 && !!pb && Buffer.from(pb, 'base64').equals(fs.readFileSync(f1)), { save: sv, dl: dn, file: f1 });
    if (f1) {
      if (HAVE_DETACH) { var a1 = detach(f1); check('disk-poppler', 'the file ON DISK, read by poppler: pdfdetach lists ' + PH.NAME + ' and extracts exactly the page\'s 2 history lines', J(a1.names) === J([PH.NAME]) && a1.text === u2.lines.map(function (l) { return l + '\n'; }).join('') && u2.lines.length === 2, { names: a1.names, lines: u2.lines.length }); }
      else say('  §PDFHP-NOTE pdfdetach is not installed: the downloaded file was not judged by an independent tool');
      var doc1 = await PO.open(pdfjs, new Uint8Array(fs.readFileSync(f1))), R1 = doc1.ok ? RR.read(doc1.items) : { sheet: {} };
      check('disk-node', 'the file on disk in node: the opener returns the 2 lines, the kernel\'s verifyJournal accepts them, the page reads D10 = 499.09', doc1.ok && J(doc1.history) === J(u2.lines) && K.verifyJournal((doc1.history || []).join('\n')).ok === true && R1.sheet.D10 && R1.sheet.D10.v === 499.09, { hist: doc1.history && doc1.history.length });

      // session 2: the SAME file from disk, through the real file chooser
      var n3 = await pick(f1), op1 = since(/^§PDFHIST-OPEN/, n3)[0], u3 = await ui();
      say('  ' + op1);
      check('reopen-taken-up', 'the downloaded file opened again: §PDFHIST-OPEN state=ok entries=2 cells=144 differ=0 continued=true; the block says "History: 2 entries, verified, carried inside this file and continued"', !!op1 && /state=ok entries=2 cells=144 differ=0 pages=1 continued=true/.test(op1) && /^History: 2 entries, verified, carried inside this file and continued\./.test(u3.say) && u3.cls === 'good' && J(u3.lines) === J(u2.lines), { log: op1, ui: u3.say });
      var n4 = logs.length; await pg.click('#b-sheet'); var co = await waitLog(/^§PDFHIST-CONTINUE/, n4, 8000), u4 = await ui();
      check('no-second-genesis', 'Read as sheet in the second session records NOTHING (§PDFHIST-CONTINUE entries=2 recorded=nothing): no new genesis line, still 2 entries', !!co && /entries=2 page=1 recorded=nothing/.test(co) && since(/^§PDFWR-HISTORY/, n4).length === 0 && u4.entries === 2, { log: co, extra: since(/^§PDFWR-HISTORY/, n4) });
      var n5 = await typeInto('D28', '40393.44'), hs = await waitLog(/^§PDFWR-HISTORY entries=3/, n5, 8000); await waitLog(/^§PDFHIST-STATE entries=3/, n5); var u5 = await ui(), e = u5.lines.map(function (l) { return JSON.parse(l); });
      say('  ' + hs);
      check('appended', 'the next edit (D28 -> 40,393.44) is entry 3 CHAINED to the carried entry 2 (seq 3, prev = entry 2\'s hash); the first 2 lines are the carried ones; the kernel accepts all 3', !!hs && /entries=3 ops=1 cell=D28 before=40392\.44 after=40393\.44/.test(hs) && e.length === 3 && e[2].seq === 3 && e[2].prev === e[1].hash && J(u5.lines.slice(0, 2)) === J(u2.lines) && K.verifyJournal(u5.lines.join('\n')).ok === true && /^History: 3 entries, verified/.test(u5.say), { log: hs, n: e.length, say: u5.say });

      // a cell's story on request: typed, and by a click on the cell
      var n6 = logs.length; await pg.click('#hist-cell', { clickCount: 3 }); await pg.keyboard.type('d10'); await pg.keyboard.press('Enter'); var s1 = await waitLog(/^§PDFHIST-STORY cell=D10/, n6, 5000), u6 = await ui();
      say('  ' + s1);
      check('story-typed', 'typing d10 in the History box and Enter shows D10\'s story: 2 values (first read 498.09, then 498.09 -> 499.09 by you), from the CARRIED entries', !!s1 && /values=2/.test(s1) && u6.story.length === 2 && /#1 .* report-reader: \(empty\) -> 498\.09/.test(u6.story[0]) && /#2 .* you: 498\.09 -> 499\.09/.test(u6.story[1]), { log: s1, story: u6.story });
      var n7 = logs.length; await pg.click('#grid td[data-a="D28"]'); var s2 = await waitLog(/^§PDFHIST-STORY cell=D28/, n7, 5000), u7 = await ui();
      check('story-clicked', 'a click on D28 shows its story: 2 values, the second 40392.44 -> 40393.44, NOT marked typed over a total: the typed total still adds up its column, so it stays a SUM (bim-compiler SHEET_FRONT_DOOR §16.2)', !!s2 && /values=2/.test(s2) && u7.story.length === 2 && /#3 .* you: 40392\.44 -> 40393\.44$/.test(u7.story[1]), { log: s2, story: u7.story });

      // Download PDF again: the attachment is replaced, not added
      var d2 = await dlTo('dl2'), n8 = logs.length; await pg.click('#b-pdf'); await waitLog(/^§PDFWR-DOWNLOAD/, n8); var sv2 = since(/^§PDFHIST-SAVE/, n8)[0], f2 = await saved(d2, 'trial_balance_th_edited.pdf');
      say('  ' + sv2);
      var a2 = f2 && HAVE_DETACH ? detach(f2) : null, doc2 = f2 ? await PO.open(pdfjs, new Uint8Array(fs.readFileSync(f2))) : { ok: false };
      check('second-download', 'the second download keeps its name and REPLACES the history inside (§PDFHIST-SAVE entries=3 replaced=true): one attachment, 3 lines, verified by both verifiers', !!sv2 && /ok=true entries=3 .*replaced=true/.test(sv2) && doc2.ok && J(doc2.history) === J(u5.lines) && (await H.verify(doc2.history)).ok === true && K.verifyJournal(doc2.history.join('\n')).entries === 3 && (!a2 || (J(a2.names) === J([PH.NAME]) && a2.text === u5.lines.map(function (l) { return l + '\n'; }).join(''))), { save: sv2, file: f2, names: a2 && a2.names });

      // Download .xlsx: the same lines in the Excel menu's hidden sheet, read by the menu's own reader
      var n9 = logs.length; await pg.click('#b-xlsx'); await waitLog(/^§PDFED-XLSX/, n9); var hx = since(/^§PDFHIST-XLSX/, n9)[0], xb = await b64('lastXlsx'), wb = xb ? XLSX.read(Buffer.from(xb, 'base64'), { type: 'buffer' }) : null;
      say('  ' + hx);
      var shim = wb ? SA.create(xlsxHost(wb), { SheetHistory: H }) : null, ck = shim ? await shim.checkHistory() : {}, st = shim ? await shim.cellHistory({ sheet: 'Report', cell: 'D28' }) : {}, hi = wb ? wb.SheetNames.indexOf(SA.HISTORY) : -1;
      check('xlsx-through-the-menu', 'the .xlsx handed over holds the very hidden sheet ' + SA.HISTORY + '; host_shim.js\'s own reader says OK with 3 entries ("' + ck.text + '") and tells D28\'s story (2 values); the visible sheet holds D28 = 40393.44', !!hx && /entries=3/.test(hx) && hi >= 0 && wb.Workbook.Sheets[hi].Hidden === 2 && ck.verdict === 'OK' && ck.history.entries === 3 && st.verdict === 'STORY' && st.story.length === 2 && st.story[1].after.v === 40393.44 && wb.Sheets.Report.D28.v === 40393.44, { log: hx, check: ck.text, story: st.text });

      // made in node from the downloaded file: a history edited by hand, and a number changed without recording
      var good = new Uint8Array(fs.readFileSync(f2)), L = doc2.history || [], tl = [L[0], (L[1] || '').replace('"before":{"v":498.09', '"before":{"v":1.09'), L[2]], tam = await PW.embedFile(good, PH.NAME, PH.toBytes(tl));
      var Rg = RR.read(doc2.items), out = await PW.rewriteNumbers(good, [{ cell: 'D12', page: 1, box: Rg.map.D12.box, oldText: Rg.sheet.D12.text, newText: '15,816.66' }], { substitute: true });
      var fT = path.join(tmp, 'tampered_history.pdf'), fO = path.join(tmp, 'changed_outside.pdf'); fs.writeFileSync(fT, tam.bytes); fs.writeFileSync(fO, out.bytes);
      var n10 = await pick(fT), op2 = since(/^§PDFHIST-OPEN/, n10)[0], u8 = await ui();
      say('  ' + op2);
      check('tampered-said', 'a hand-edited history (entry 2) is named in words and NOT taken up: §PDFHIST-OPEN state=broken brokenAt=2, the block (in the warning colour) says entry 2 of 3 does not verify and that it is not continued; 0 entries', tam.ok && tl[1] !== L[1] && !!op2 && /state=broken entries=3 brokenAt=2 why="payload/.test(op2) && /continued=false/.test(op2) && /entry 2 of 3 does not verify/.test(u8.say) && /not continued/.test(u8.say) && u8.cls === 'bad' && u8.entries === 0, { log: op2, ui: u8.say });
      var n11 = logs.length; await pg.click('#b-sheet'); var g2 = await waitLog(/^§PDFWR-HISTORY entries=1/, n11, 8000); await waitLog(/^§PDFHIST-STATE entries=1/, n11); var u9 = await ui(), o9 = u9.lines[0] ? JSON.parse(u9.lines[0]).payload.ops.filter(function (x) { return x.sheet === PH.BREAK; }) : [];
      say('  ' + g2);
      check('restart-records-break', 'the next history starts with a NEW genesis that records the break (§PDFWR-HISTORY entries=1 genesis=true afterBreak=true; its ' + PH.BREAK + '!A1 names entry 2), and the block keeps saying what came before it', !!g2 && /ops=145 genesis=true page=1 afterBreak=true/.test(g2) && o9.length === 1 && /entry 2 of 3/.test(o9[0].after.v) && /^History: 1 entry, verified\..* Before it: .*entry 2 of 3/.test(u9.say), { log: g2, ops: o9, say: u9.say });
      var n12 = await pick(fO), op3 = since(/^§PDFHIST-OPEN/, n12)[0], u10 = await ui();
      say('  ' + op3);
      check('changed-outside-said', 'a number changed without recording (D12) is named in words: §PDFHIST-OPEN state=mismatch kind=changed-outside first=D12 printed=15816.66 history=15815.66 differ=1; the block names D12 and both values; nothing is taken up', out.ok && !!op3 && /state=mismatch entries=3 cells=144 differ=1 pages=1 kind=changed-outside first=D12 printed=15816\.66 history=15815\.66 continued=false/.test(op3) && /D12 prints 15816\.66, the history says 15815\.66/.test(u10.say) && /changed outside this editor/.test(u10.say) && u10.cls === 'bad' && u10.entries === 0, { log: op3, ui: u10.say });
      var n13 = await pick(TB), op4 = since(/^§PDFHIST-OPEN/, n13)[0], u11 = await ui();
      check('no-leak', 'a plain PDF opened after those: state=none again, "No history yet", nothing left over from the file before', !!op4 && /state=none/.test(op4) && /^No history yet/.test(u11.say) && u11.entries === 0 && u11.cls === 'none' && u11.story.length === 0 && u11.pdfBtn === false, { log: op4, ui: u11 });
    }
    // no network: the page still boots with the history owner (pdf_history.js and host_shim.js are in the offline cache)
    var sw = await waitLog(/^§PDFED-OFFLINE ready=true/, 0, 15000); await sleep(500);
    await pg.setOfflineMode(true); var n14 = logs.length; await pg.reload({ waitUntil: 'load' }).catch(function () {}); var boot2 = await waitLog(/^§PDFED-BOOT/, n14, 10000), off = null;
    if (boot2 && f2) { var n15 = await pick(f2); off = since(/^§PDFHIST-OPEN/, n15)[0]; }
    await pg.setOfflineMode(false);
    check('offline', 'with the network OFF the page reloads with the history owner and takes up the history of the downloaded file (§PDFHIST-OPEN state=ok entries=3)', !!sw && !!boot2 && /inFile=function chunks=function/.test(boot2) && !!off && /state=ok entries=3 .*continued=true/.test(off), { sw: sw, boot: boot2, open: off });
    check('no-errors', 'no uncaught page error in the whole run', errs.length === 0, errs.slice(0, 4));
  } catch (e) { check('crash', 'the run completes', false, String(e && e.stack || e).slice(0, 400)); }
  await br.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  say('§PDFHP-VERDICT ' + (!judged ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + failed);
  process.exit(failed ? 1 : judged ? 0 : 2);
})().catch(function (e) { say('§PDFHP-VERDICT FAIL crash ' + (e && e.stack || e)); process.exit(3); });
