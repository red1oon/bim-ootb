#!/usr/bin/env node
// ⚠ DO NOT REMOVE - W-EDIT-SHEET (bim-compiler prompts/SHEET_FRONT_DOOR.md §18.3 + §18.5 + §18.6, slice A). READ THE LOG after every run; the exit code is not evidence.
// Copyright (c) 2025-2026 Redhuan D. Oon  SPDX-License-Identifier: MIT
// THE ISSUE THIS PROVES OR DISPROVES: a report arrives as a PDF; can it be edited RIGHT ON THE PAGE, like a sheet, and handed back as the SAME PDF with only
//   the edited text changed - without a picture, a font or any other object of the file being touched, and without a substituted font slipping in unsaid?
//   Real page, real double-click / tap / key presses, real downloads, headless Chromium (CPU only). Every claim is a number or a log line, never a picture.
//   H1 COVER     the edit layer covers every writable run of page 1 and no locked one; each locked run (Thai, a picture) names why     -> dropped / wrongly offered runs
//   E3 TOTALS    D10 +1 -> D28 marked "does not add up", gap 1.00; the consistent four -> every mark adds up; a total lights its rows; a drag sums; 1 entry per edit
//   H2 ROUND TRIP a text and a number edit: our reader and poppler read the new text at the same boxes, the old text gone              -> looks right, reads back wrong
//   H3 INTEGRITY every object not holding an edited run byte-identical; every image stream identical; poppler raster: 0 pixels changed outside the edited boxes
//   H4 REFUSED   Thai typed, or a character no font here can show: refused by name, bytes unchanged, never written wrong
//   H5 FONT      a missing glyph -> the closest standard font, logged, a red "font not same" box on screen, NOT in the exported PDF, listed by the export
//   H6 UNDO      edit -> undo -> the PDF is the original bytes again (every object identical); redo re-applies; the history verifies with the undo entries
//   H7 ACCEPT    Accept removes the red box and keeps the substitution
//   H8 BOUNDED   undo keeps earlier copies up to a byte budget: older steps lose bytes, not their record; a drag that leaves the page leaves no box (§20)
//   E5 EXCEL     the .xlsx re-reads to the same cells, SUM formulas on the totals, the history verifying through the Excel menu's own reader
//   E7 PHONE     390 px, CPU 4x: the page fits the width, a tap opens the cell's editor without scrolling the page, an edit applies
// Mutants (EDSHEET_MUTANTS=1, each in a child run; a crash is not a kill): a target dropped -> H1; totals not recomputed -> E3; a cell written at the wrong
//   place -> H2; Thai silently dropped -> H4; an untouched object rewritten -> H3; the red box written into the PDF -> H5; an undo not recorded -> H6.
// Command: env -u DBUS_SESSION_BUS_ADDRESS node pdf/tests/witness_edit_sheet.js        EDSHEET_URL=https://red1oon.github.io/bim-ootb/pdf/ for the live page (no mutants)
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ROOT = path.join(__dirname, '..', '..'), PDFD = path.join(ROOT, 'pdf'), puppeteer;
try { puppeteer = require(path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer')); } catch (e) { try { puppeteer = require('puppeteer'); } catch (e2) { console.log('§EDSHEET-VERDICT INCONCLUSIVE puppeteer is not installed: nothing judged'); process.exit(2); } }
var say = function (s) { process.stdout.write(s + '\n'); }; console.log = function () {}; console.warn = function () {};
var pdfjs = require(path.join(ROOT, 'modeller/lib/pdfjs/pdf.min.js')); pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'modeller/lib/pdfjs/pdf.worker.min.js');
var PO = require(path.join(PDFD, 'pdf_open.js')), RR = require(path.join(PDFD, 'report_reader.js')), PW = require(path.join(PDFD, 'pdf_write.js')), H = require(path.join(ROOT, 'erp/sheet_history.js')), XLSX = require(path.join(ROOT, 'erp/xlsx.mini.min.js')), SA = require(path.join(ROOT, 'erp/sheet_addin/host_shim.js'));
var J = JSON.stringify, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }, count = function (t, s) { return t.split(s).length - 1; };
var HAVE_POPPLER = !cp.spawnSync('pdftotext', ['-v']).error, HAVE_GS = !cp.spawnSync('gs', ['--version']).error;
var MUTANT = process.env.EDSHEET_MUTANT || '', LIVE = process.env.EDSHEET_URL || '';
var MUTANTS = {
  'drop-target': { kills: 'H1', file: 'pdf/edit_layer.js', from: '/*MUT-DROPTARGET*/', to: 'if (t.id === (L.targets.list.filter(function (x) { return !x.lock; })[3] || {}).id) return;' },
  'totals-stale': { kills: 'E3', file: 'pdf/index.html', from: '/*MUT-STALE*/', to: 'if (S.layer && S.layer.R) R = S.layer.R;' },
  'wrong-place': { kills: 'H2', file: 'pdf/pdf_write.js', from: '/*MUT-EDGE*/ -start * 1000 / unit', to: '-(start + 20) * 1000 / unit' },
  'thai-dropped': { kills: 'H4', file: 'pdf/pdf_write.js', from: '/*MUT-DROPTHAI*/', to: 'newText = newText.replace(/[\\u0E00-\\u0E7F]/g, \'\').trim() || \'x\';' },
  'object-rewritten': { kills: 'H3', file: 'pdf/pdf_write.js', from: '/*MUT-REWRITE*/', to: 'var cat = F.obj(F.trailer.Root.ref); replaced[cat.num] = bytesOf(cat.num + \' \' + cat.gen + \' obj\\n\' + ser(cat.val) + \'\\nendobj\\n\');' },
  'redbox-written': { kills: 'H5', file: 'pdf/pdf_write.js', from: 'var redbox = \'\'; /*MUT-REDBOX*/', to: 'var redbox = \' ET q 1 0 0 RG 0.8 w \' + fmt(nx0 - 1) + \' 0 \' + fmt(Wd + 2) + \' 12 re S Q BT\';' },
  'undo-not-recorded': { kills: 'H6', file: 'pdf/index.html', from: 'var skipRec = false; /*MUT-NOUNDOREC*/', to: 'var skipRec = actor !== \'you\';' },
  'undo-unbounded': { kills: 'H8', file: 'pdf/index.html', from: 'if (full || (i < S.undo.length - 1 && held + u.before.length > S.undoBudget))', to: 'if (false)' },
  'drag-box-stays': { kills: 'H8', file: 'pdf/edit_layer.js', from: 'if (ev.pointerType === \'mouse\') drop();', to: '' }
};
var CASES = {}, ORDER = ['H1', 'E3', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'E5', 'E7'];
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0, notes: [] }; c.judged++; if (!ok) c.failed++; say('  §EDSHEET-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 600))); }
function note(cs, s) { (CASES[cs] = CASES[cs] || { judged: 0, failed: 0, notes: [] }).notes.push(s); }

// ── independent readers (the witness's own, not the engine's) ──
function latin1(b) { return Buffer.from(b).toString('latin1'); }
function objects(b) {   // every "N G obj ... endobj" of the file, by number (the last definition wins, as a reader takes it)
  var s = latin1(b), re = /(?:^|[\r\n\s])(\d+) (\d+) obj\b/g, m, out = {};
  while ((m = re.exec(s))) { var st = m.index + m[0].length - (m[1] + ' ' + m[2] + ' obj').length, e = s.indexOf('endobj', st); if (e < 0) break; out[m[1]] = s.slice(st, e + 6); re.lastIndex = e + 6; }
  return out;
}
function zlibOf(body) { var i = body.indexOf('stream'); if (i < 0) return null; var p = i + 6; if (body[p] === '\r') p++; if (body[p] === '\n') p++; var e = body.lastIndexOf('endstream'); var raw = Buffer.from(body.slice(p, e), 'latin1'); try { return require('zlib').inflateSync(raw).toString('latin1'); } catch (x) { return /FlateDecode/.test(body) ? null : raw.toString('latin1'); } }
function pageContentNums(objs) { var out = []; Object.keys(objs).forEach(function (n) { var o = objs[n]; if (/\/Type\s*\/Page\b/.test(o)) { var m = /\/Contents\s+(\d+)\s+0\s+R/.exec(o), a = /\/Contents\s*\[([^\]]*)\]/.exec(o); if (m) out.push(m[1]); if (a) (a[1].match(/(\d+)\s+0\s+R/g) || []).forEach(function (x) { out.push(x.split(/\s/)[0]); }); } }); return out; }
function compareObjects(A, B) { var a = objects(A), b = objects(B), changed = [], added = [], removed = []; Object.keys(b).forEach(function (n) { if (!(n in a)) added.push(n); else if (a[n] !== b[n]) changed.push(n); }); Object.keys(a).forEach(function (n) { if (!(n in b)) removed.push(n); }); return { a: a, b: b, changed: changed, added: added, removed: removed }; }
function pdftext(file, args) { return cp.spawnSync('pdftotext', (args || ['-raw']).concat([file, '-']), { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout || ''; }
function bboxWords(file) { var t = pdftext(file, ['-bbox']), out = [], re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g, m; while ((m = re.exec(t))) out.push({ s: m[5].replace(/&amp;/g, '&'), x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] }); return out; }
function raster(file, tmp, name) { var base = path.join(tmp, name); cp.spawnSync('pdftoppm', ['-r', '72', '-f', '1', '-l', '1', file, base]); var f = fs.readdirSync(tmp).filter(function (x) { return x.indexOf(name) === 0 && /\.ppm$/.test(x); })[0]; if (!f) return null; var b = fs.readFileSync(path.join(tmp, f)), s = b.toString('latin1', 0, 64).split(/\s+/), w = +s[1], h = +s[2], off = b.length - w * h * 3; return { w: w, h: h, px: b.subarray(off) }; }
function rasterDiff(A, B, boxes, pad) { if (!A || !B || A.w !== B.w || A.h !== B.h) return { same: false }; var inside = 0, outside = 0, firstOut = null; for (var y = 0; y < A.h; y++) for (var x = 0; x < A.w; x++) { var i = (y * A.w + x) * 3; if (A.px[i] === B.px[i] && A.px[i + 1] === B.px[i + 1] && A.px[i + 2] === B.px[i + 2]) continue; if (boxes.some(function (b) { return x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad; })) inside++; else { outside++; if (!firstOut) firstOut = [x, y]; } } return { same: true, w: A.w, h: A.h, inside: inside, outside: outside, firstOut: firstOut }; }
async function readBack(bytes) { var o = await PO.open(pdfjs, bytes); return { open: o, R: o.ok ? RR.read(o.items, { page: 1 }) : null }; }
function xlsxHost(wb) { return { getHidden: async function (name) { var ws = wb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).map(function (r) { return r.map(String); }) : []; }, setHidden: async function () {}, selectedCell: async function () { return { sheet: 'Report', cell: 'A1' }; }, visibleSheets: async function () { return []; }, readSheetValues: async function () { return {}; }, userName: async function () { return 'witness'; } }; }

function serve() {
  var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.pdf': 'application/pdf', '.css': 'text/css' }, mut = MUTANTS[MUTANT];
  var srv = http.createServer(function (q, s) {
    var u = decodeURIComponent(q.url.split('?')[0]), p = path.join(ROOT, u); if (p.indexOf(ROOT) !== 0) { s.writeHead(403); return s.end(); } if (/\/$/.test(p)) p += 'index.html';
    fs.readFile(p, function (e, b) {
      if (e) { s.writeHead(404); return s.end(); }
      if (mut && path.relative(ROOT, p) === mut.file) { var t = b.toString('utf8'); if (t.indexOf(mut.from) < 0) { say('§EDSHEET-MUTANT-BROKEN marker not found: ' + mut.from); } b = Buffer.from(t.replace(mut.from, mut.to), 'utf8'); }
      s.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); s.end(b);
    });
  });
  return new Promise(function (r) { srv.listen(0, '127.0.0.1', function () { r(srv); }); });
}

async function main() {
  var srv = LIVE ? null : await serve(), base = LIVE ? LIVE.replace(/\/$/, '') + '/' : 'http://127.0.0.1:' + srv.address().port + '/pdf/';
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edsheet_')), TB = path.join(PDFD, 'corpus/trial_balance_th.pdf'), TBB = new Uint8Array(fs.readFileSync(TB));
  say('§EDSHEET-SITE ' + (LIVE ? 'LIVE ' + base : 'local tree') + (MUTANT ? ' mutant=' + MUTANT : '') + ' poppler=' + HAVE_POPPLER + ' ghostscript=' + HAVE_GS);
  var br = await puppeteer.launch({ headless: 'new', userDataDir: path.join(tmp, 'profile'), args: ['--no-sandbox', '--disable-gpu', '--enable-precise-memory-info'] });
  var pg = await br.newPage(), logs = [], errs = [], dl = path.join(tmp, 'dl'); await pg.setViewport({ width: 1500, height: 950 });
  pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(String(e).slice(0, 200)); });
  var cdp = await pg.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl }).catch(function () {});
  var waitLog = async function (re, from, ms) { for (var t = 0; t < (ms || 20000); t += 50) { var l = logs.slice(from).filter(function (x) { return re.test(x); })[0]; if (l) return l; await sleep(50); } return null; };
  var since = function (re, from) { return logs.slice(from).filter(function (x) { return re.test(x); }); };
  var pick = async function (p, file) { var n = logs.length, r = await Promise.all([p.waitForFileChooser(), p.click('#b-open')]); await r[0].accept([file]); return n; };
  var b64 = function (prop) { return pg.evaluate(function (pp) { var u = window.PdfPage.state[pp]; if (!u) return null; var s = ''; for (var i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }, prop); };
  var bytesOf = async function (prop) { var s = await b64(prop); return s ? new Uint8Array(Buffer.from(s, 'base64')) : null; };
  // the layer as the user meets it: every target element with its box back in page points (from its % position) and its lock
  var layer = function (p) { return (p || pg).evaluate(function () { var L = document.querySelector('.el-layer'), S = window.PdfPage.state; if (!L || !S.layer) return null; var sz = S.info.sizes[S.layer.page - 1], W = sz[0], Hh = sz[1], pc = function (v) { return parseFloat(v) / 100; };
    var ts = Array.prototype.map.call(L.querySelectorAll('.el-t'), function (e) { var x0 = pc(e.style.left) * W, y0 = pc(e.style.top) * Hh; return { id: e.dataset.id, kind: e.dataset.kind, cell: e.dataset.cell || null, lock: e.dataset.lock || null, title: e.title, box: [x0, y0, x0 + pc(e.style.width) * W, y0 + pc(e.style.height) * Hh] }; });
    var mk = Array.prototype.map.call(L.querySelectorAll('.el-mark'), function (e) { return { cell: e.dataset.cell, ok: e.dataset.ok === 'true', gap: Number(e.dataset.gap), computed: Number(e.dataset.computed), kind: e.dataset.kind, label: e.textContent }; });
    var subs = Array.prototype.map.call(L.querySelectorAll('.el-sub'), function (e) { return { key: e.dataset.key, cell: e.dataset.cell, text: e.textContent }; });
    return { targets: ts, marks: mk, subs: subs, lit: L.querySelectorAll('.el-lit').length, stat: document.getElementById('stat').textContent, entries: S.history.length, undo: S.undo.length, redo: S.redo.length, size: sz }; }); };
  // a real double-click on the target's centre, type, Enter
  var centre = async function (p, sel) { return p.$eval(sel, function (e) { var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }); };
  var typeOn = async function (sel, text, p) {
    p = p || pg; var n = logs.length; await p.$eval(sel, function (e) { e.scrollIntoView({ block: 'center' }); }); await sleep(100); var c = await centre(p, sel);
    await p.mouse.click(c.x, c.y, { clickCount: 2 }); await p.waitForSelector('.el-ed input', { timeout: 5000 });
    await p.$eval('.el-ed input', function (i) { i.select(); }); await p.keyboard.type(text); await p.keyboard.press('Enter');
    await waitLog(/^§EDSHEET-(EDIT|LAYER)/, n, 15000); await waitLog(/^§EDSHEET-EDIT /, n, 15000); await waitLog(/^§EDSHEET-LAYER/, n, 15000); await sleep(150); return n;
  };
  var cellSel = function (a) { return '.el-t[data-cell="' + a + '"][data-kind="cell"]'; };
  var RES = {};
  try {
    await pg.goto(base + 'index.html', { waitUntil: 'load' });
    var n0 = await pick(pg, TB), lay0 = await waitLog(/^§EDSHEET-LAYER/, n0, 30000), open0 = await waitLog(/^§PDFED-OPEN ok=true/, n0, 30000);
    say('  ' + lay0);
    var runs = await PW.listRuns(TBB, 1), o0 = await readBack(TBB), R0 = o0.R, L0 = await layer();

    // ── H1: every writable run inside a writable target; no locked run inside one; every locked target says why ──
    await guard('H1', async function () {
      var live = runs.filter(function (r) { return r.n > 0; }), wr = live.filter(function (r) { return !r.lock; }), lk = live.filter(function (r) { return r.lock; });
      // a run is "in" a target when the middle of its glyphs is: (centre x, baseline - 0.35 x height), in page points
      var hit = function (r, t) { var cx = (r.x0 + r.x1) / 2, cy = r.y - 0.35 * r.h; return cx >= t.box[0] - 0.6 && cx <= t.box[2] + 0.6 && cy >= t.box[1] - 0.6 && cy <= t.box[3] + 0.6; };
      var W = L0.targets.filter(function (t) { return !t.lock; }), Lk = L0.targets.filter(function (t) { return t.lock; });
      var uncovered = wr.filter(function (r) { return !W.some(function (t) { return hit(r, t); }); }), wrongly = lk.filter(function (r) { return W.some(function (t) { return hit(r, t); }); });
      check('H1', 'writable-covered', 'every writable run of page 1 (' + wr.length + ' by the engine\'s own lockOf) lies inside a writable target on the page', wr.length > 0 && !uncovered.length, uncovered.slice(0, 3));
      check('H1', 'locked-not-offered', 'no locked run (' + lk.length + ') lies inside a writable target', !wrongly.length, wrongly.slice(0, 3));
      check('H1', 'locked-say-why', 'every locked target carries its reason in words (' + Lk.length + ' locked targets)', Lk.length > 0 && Lk.every(function (t) { return /^Locked: .{10,}/.test(t.title); }), Lk.filter(function (t) { return !/^Locked: .{10,}/.test(t.title); }).slice(0, 2));
      var th = Lk.filter(function (t) { return t.lock === 'script-not-supported'; })[0], n = logs.length, c = th ? await centre(pg, '.el-t[data-id="' + th.id + '"]') : null;
      if (c) { await pg.mouse.click(c.x, c.y); } var lg = await waitLog(/^§EDSHEET-LOCKED/, n, 4000), st = await pg.$eval('#stat', function (e) { return e.textContent; });
      check('H1', 'tap-says-why', 'a click on a Thai run says why it is locked, in words ("Locked: Thai text ...")', !!lg && /lock=script-not-supported/.test(lg) && /^Locked: Thai text/.test(st), { log: lg, stat: st });
      RES.H1 = 'writableRuns=' + wr.length + ' lockedRuns=' + lk.length + ' writableTargets=' + W.length + ' lockedTargets=' + Lk.length + ' uncovered=' + uncovered.length + ' wronglyOffered=' + wrongly.length;
    });

    // ── E3: live totals on the page ──
    var D10 = cellSel('D10');
    await guard('E3', async function () {
      var m0 = L0.marks, e0 = L0.entries;
      check('E3', 'marks-at-open', 'at open every total the reader found is marked on the page and adds up (' + m0.length + ' marks)', m0.length >= 4 && m0.every(function (m) { return m.ok; }), m0);
      var n1 = await typeOn(D10, '499.09'), ed = since(/^§EDSHEET-EDIT /, n1)[0], L1 = await layer(), d28 = L1.marks.filter(function (m) { return m.cell === 'D28'; })[0];
      say('  ' + ed); say('  ' + (since(/^§PDFWR-HISTORY/, n1).join(' | ')));
      check('E3', 'edit-applies', 'D10 498.09 -> 499.09 typed on the page: §EDSHEET-EDIT ok=true', !!ed && /ok=true old="498\.09" new="499\.09"/.test(ed), ed);
      check('E3', 'total-recomputed', 'D28 is marked "does not add up": rows sum 40393.44 against the printed 40,392.44, gap 1.00', !!d28 && !d28.ok && Math.abs(d28.gap - 1) < 1e-9 && Math.abs(d28.computed - 40393.44) < 1e-6 && /gap 1\.00/.test(d28.label), d28);
      check('E3', 'one-entry', 'the edit is ONE history entry after the genesis (entries ' + e0 + ' -> ' + L1.entries + ')', L1.entries === 2, { before: e0, after: L1.entries });
      // the reader's own SUM range is the oracle for the rows to light (not a hand-typed range)
      var ck28 = R0.checks.filter(function (c) { return c.kind === 'SUM' && c.cell === 'D28'; })[0], want28 = ck28 ? ck28.range : '?', m28 = /^D(\d+):D(\d+)$/.exec(want28), nRows = m28 ? m28[2] - m28[1] + 1 : -1;
      var n2 = logs.length, c28 = await centre(pg, cellSel('D28')); await pg.mouse.click(c28.x, c28.y); var tt = await waitLog(/^§EDSHEET-TOTAL/, n2, 4000), lit = (await layer()).lit;
      check('E3', 'total-formula', 'a click on the total D28 says its formula and lights its rows (the reader found SUM(' + want28 + '): ' + nRows + ' rows; ' + lit + ' lit)', !!tt && tt.indexOf('formula=SUM(' + want28 + ')') >= 0 && lit === nRows, { log: tt, lit: lit });
      var c6 = await centre(pg, cellSel('D6')), c9 = await centre(pg, cellSel('D9')), n3 = logs.length;
      await pg.mouse.move(c6.x - 30, c6.y - 4); await pg.mouse.down(); await pg.mouse.move(c9.x + 10, c9.y + 4, { steps: 6 }); await pg.mouse.up(); var sl = await waitLog(/^§EDSHEET-SELECT/, n3, 4000);
      var want = ['D6', 'D7', 'D8', 'D9'].map(function (a) { return R0.sheet[a] ? R0.sheet[a].v : 0; }).reduce(function (x, y) { return x + y; }, 0);
      check('E3', 'drag-sum', 'a mouse drag over D6..D9 gives their sum and count (§EDSHEET-SELECT count=4 sum=' + want + ')', !!sl && / count=4 /.test(sl) && Math.abs(Number(/sum=([-\d.]+)/.exec(sl)[1]) - want) < 1e-6, sl);
      // the consistent four (PDF_EDITOR §4.3 W1): D10 500.09, F10 1,020.16, D28 40,394.44, F28 2.00
      await typeOn(D10, '500.09'); await typeOn(cellSel('F10'), '1020.16'); await typeOn(cellSel('D28'), '40394.44'); await typeOn(cellSel('F28'), '2.00');
      var L2 = await layer();
      check('E3', 'consistent-adds-up', 'after the consistent four every mark adds up again (' + L2.marks.length + ' marks) and the status says it adds up', L2.marks.length >= 4 && L2.marks.every(function (m) { return m.ok; }) && /adds up/.test(L2.stat), { marks: L2.marks.filter(function (m) { return !m.ok; }), stat: L2.stat });
      check('E3', 'entry-per-edit', 'five edits = five entries after the genesis (entries=' + L2.entries + ')', L2.entries === 6, L2.entries);
      RES.E3 = 'D28 gap=' + (d28 && d28.gap) + ' computed=' + (d28 && d28.computed) + ' lit=' + lit + ' entries=' + L2.entries + ' marksOk=' + L2.marks.filter(function (m) { return m.ok; }).length + '/' + L2.marks.length;
    });

    // ── H2 + H5 (text edits, one with a missing glyph) ──
    var nB = 0, redLog = null;
    await guard('H2', async function () {
      nB = await typeOn(cellSel('B10'), 'Accounts Receivable'); var e1 = since(/^§EDSHEET-EDIT /, nB)[0]; say('  ' + e1);
      check('H2', 'text-edit', 'a TEXT cell (B10, an account name) changed on the page: §EDSHEET-EDIT ok=true new="Accounts Receivable" sub=none', !!e1 && /ok=true old="Accounts Receivable - Trade" new="Accounts Receivable"/.test(e1) && / sub=none /.test(e1), e1);
    });
    // a RUN on its own: the title cell A1 mixes Thai (locked) and "(Trial Balance)" (writable): the run alone is offered and edited
    var tA1 = (await layer()).targets.filter(function (t) { return t.kind === 'run' && t.cell === 'A1' && !t.lock; })[0], nA = tA1 ? await typeOn('.el-t[data-id="' + tA1.id + '"]', '(Trial 2003)') : logs.length, eA = since(/^§EDSHEET-EDIT /, nA)[0]; say('  ' + eA);
    var nQ = await typeOn(cellSel('B12'), 'Quiz Zebra'); redLog = since(/^§EDSHEET-FONT/, nQ)[0]; var eQ = since(/^§EDSHEET-EDIT /, nQ)[0], LQ = await layer(); say('  ' + redLog); say('  ' + eQ);
    var edited = await bytesOf('bytes');
    var nD = logs.length; await pg.click('#b-pdf'); await waitLog(/^§EDSHEET-EXPORT/, nD, 15000); var exp = since(/^§EDSHEET-EXPORT/, nD)[0], dlPdf = await bytesOf('lastPdf'), fE = path.join(tmp, 'edited.pdf'), fO = path.join(tmp, 'orig.pdf'), fH = path.join(tmp, 'downloaded.pdf');
    fs.writeFileSync(fE, edited); fs.writeFileSync(fO, TBB); fs.writeFileSync(fH, dlPdf); say('  ' + exp);
    var back = await readBack(edited), R2 = back.R;
    await guard('H2', async function () {
      var keys0 = Object.keys(R0.sheet).sort(), keys2 = Object.keys(R2.sheet).sort();
      check('H2', 'same-addresses', 'the edited PDF re-read by our reader: the same ' + keys0.length + ' cell addresses', J(keys0) === J(keys2), { only0: keys0.filter(function (a) { return keys2.indexOf(a) < 0; }), only2: keys2.filter(function (a) { return keys0.indexOf(a) < 0; }) });
      check('H2', 'run-in-mixed-cell', 'in A1 (Thai locked + a Latin run) the Latin run alone is offered and edited: §EDSHEET-EDIT kind=run ok=true new="(Trial 2003)" (no wider than the old run: the title already overflows its clip, a wider text is refused does-not-fit); A1 re-reads with it', !!eA && /kind=run ok=true old="\(Trial Balance\)" new="\(Trial 2003\)"/.test(eA) && /\(Trial 2003\)$/.test(R2.sheet.A1.text) && R2.sheet.A1.text.indexOf(R0.sheet.A1.text.replace(' (Trial Balance)', '')) === 0, { log: eA, A1: R2.sheet.A1.text });
      var want = { B10: 'Accounts Receivable', B12: 'Quiz Zebra', D10: '500.09', F10: '1,020.16', D28: '40,394.44', F28: '2.00' }, bad = Object.keys(want).concat(['A1']).filter(function (a) { if (a === 'A1') return false; return !R2.sheet[a] || R2.sheet[a].text !== want[a]; });
      check('H2', 'new-text-read', 'our reader reads the new texts at their cells (' + Object.keys(want).join(', ') + ') and every other cell unchanged', !bad.length && keys0.every(function (a) { return want[a] || a === 'A1' || R2.sheet[a].text === R0.sheet[a].text; }), bad.map(function (a) { return a + '=' + (R2.sheet[a] && R2.sheet[a].text); }));
      var lb = function (R, a) { return R.map[a].box; }, dx = Math.abs(lb(R2, 'B10')[0] - lb(R0, 'B10')[0]), dr = Math.abs(lb(R2, 'D10')[2] - lb(R0, 'D10')[2]);
      check('H2', 'same-boxes', 'the boxes stay: B10 left edge moved ' + dx.toFixed(3) + ' pt, D10 right edge ' + dr.toFixed(3) + ' pt (both <= 0.01)', dx <= 0.01 && dr <= 0.01, { dx: dx, dr: dr });
      check('H2', 'adds-up', 'the re-read verdict is ADDS_UP (the consistent edits)', R2.verdict === 'ADDS_UP', R2.reason);
      if (!HAVE_POPPLER) { note('H2', 'poppler absent: the independent reader was not run'); return; }
      var T = pdftext(fE), w = bboxWords(fE), w0 = bboxWords(fO);
      check('H2', 'poppler-new', 'poppler (pdftotext -raw) reads "12110 Accounts Receivable 520.07 500.09" and "Quiz Zebra"; "Receivable - Trade" 0 times, "498.09" 0 times', /12110 Accounts Receivable 520\.07 500\.09 - 1,020\.16/.test(T) && count(T, 'Quiz Zebra') === 1 && count(T, 'Receivable - Trade') === 0 && count(T, '498.09') === 0, T.split('\n').filter(function (l) { return /12110|Quiz|Product/.test(l); }));
      var q = w.filter(function (x) { return x.s === 'Quiz'; })[0], p0 = w0.filter(function (x) { return x.s === 'Product'; })[0];
      check('H2', 'poppler-box', 'poppler -bbox: "Quiz" starts where "Product" started (|dx| <= 0.05 pt)', !!q && !!p0 && Math.abs(q.x0 - p0.x0) <= 0.05, { q: q, p0: p0 });
      var info = cp.spawnSync('pdfinfo', [fH], { encoding: 'utf8' });
      check('H2', 'pdfinfo', 'pdfinfo on the downloaded file: exit 0, no message, 1 page', info.status === 0 && !(info.stderr || '').trim() && /Pages:\s+1\b/.test(info.stdout), { status: info.status, err: info.stderr });
      RES.H2 = 'cells=' + keys2.length + ' B10dx=' + dx.toFixed(3) + ' D10dr=' + dr.toFixed(3) + ' verdict=' + R2.verdict;
    });

    // ── H5 + H7: the closest font, the red box on screen only, accepted ──
    await guard('H5', async function () {
      check('H5', 'logged', 'B12 "Quiz Zebra": LiberationSans has no Q, z, Z -> the closest standard font, logged §EDSHEET-FONT from=LiberationSans to=Helvetica standard=true with why', !!redLog && /cell=B12 /.test(redLog) && /from=LiberationSans to=Helvetica standard=true/.test(redLog) && /why="[^"]{20,}"/.test(redLog), redLog);
      var sb = LQ.subs.filter(function (s) { return s.cell === 'B12'; })[0];
      check('H5', 'red-box', 'a red box on the page says "font not same: LiberationSans → Helvetica"', !!sb && /font not same: LiberationSans → Helvetica/.test(sb.text), LQ.subs);
      var fonts = cp.spawnSync('pdffonts', [fE], { encoding: 'utf8' }).stdout || '';
      check('H5', 'font-in-file', 'the edited PDF holds the added standard Helvetica (pdffonts)', /^Helvetica\s+Type 1/m.test(fonts), fonts);
      var C = compareObjects(TBB, edited), cn = pageContentNums(C.a)[0], s0 = zlibOf(C.a[cn]) || '', s1 = zlibOf(C.b[cn]) || '', reN = function (s) { return (s.match(/\bre\b/g) || []).length; }, rgN = function (s) { return (s.match(/\bRG\b/g) || []).length; };
      var T = HAVE_POPPLER ? pdftext(fH) : '';
      check('H5', 'not-in-pdf', 'the red box is NOT in the exported PDF: no "font not same" text (poppler), the page stream draws the same number of rectangles (' + reN(s0) + ' -> ' + reN(s1) + ') and stroke colours (' + rgN(s0) + ' -> ' + rgN(s1) + ')', !/font not same/.test(T) && reN(s0) === reN(s1) && rgN(s0) === rgN(s1) && s0.length > 0, { re: [reN(s0), reN(s1)], rg: [rgN(s0), rgN(s1)] });
      check('H5', 'export-lists', 'the export lists the substitution (§EDSHEET-EXPORT substituted=1 list=["B12:LiberationSans>Helvetica"])', !!exp && /substituted=1 /.test(exp) && /B12:LiberationSans>Helvetica/.test(exp), exp);
      RES.H5 = (redLog || '').replace(/^§EDSHEET-FONT /, '');
    });
    await guard('H7', async function () {
      var sb = (await layer()).subs.filter(function (s) { return s.cell === 'B12'; })[0], n = logs.length;
      if (sb) { var c = await centre(pg, '.el-sub[data-key="' + sb.key + '"] button'); await pg.mouse.click(c.x, c.y); }
      var ac = await waitLog(/^§EDSHEET-ACCEPT/, n, 4000), L = await layer(), runs2 = await PW.listRuns(await bytesOf('bytes'), 1), q = runs2.filter(function (r) { return r.text === 'Quiz Zebra'; })[0];
      check('H7', 'accept', 'Accept removes the red box (§EDSHEET-ACCEPT redBoxes=0) and the substitution stays: "Quiz Zebra" is still drawn in Helvetica', !!ac && /redBoxes=0/.test(ac) && !L.subs.length && !!q && q.font === 'Helvetica', { log: ac, subs: L.subs, run: q });
      RES.H7 = (ac || '').replace(/^§EDSHEET-ACCEPT /, '');
    });

    // ── H3: integrity of the exported file ──
    await guard('H3', async function () {
      var C = compareObjects(TBB, edited), cn = pageContentNums(C.a), extra = C.changed.filter(function (n) { return cn.indexOf(n) < 0; });
      var fontHolder = extra.filter(function (n) { return /DoorStd1/.test(C.b[n]) && !/DoorStd1/.test(C.a[n]); }), others = extra.filter(function (n) { return fontHolder.indexOf(n) < 0; });
      var addedFont = C.added.filter(function (n) { return /\/BaseFont\s*\/Helvetica\b/.test(C.b[n]); });
      check('H3', 'objects', 'every object not holding an edited run is byte-identical: changed = the page content stream (' + cn.join(',') + ') + the ONE font dictionary that names the added Helvetica (' + fontHolder.join(',') + '); added = that font (' + addedFont.join(',') + '); nothing else (' + Object.keys(C.a).length + ' objects)',
        C.changed.indexOf(cn[0]) >= 0 && fontHolder.length === 1 && !others.length && C.added.length === 1 && addedFont.length === 1 && !C.removed.length, { changed: C.changed, added: C.added, removed: C.removed, others: others });
      if (!HAVE_POPPLER) { note('H3', 'poppler absent: raster not judged'); return; }
      var A = raster(fO, tmp, 'o'), B = raster(fE, tmp, 'e'), k = 72 / 72, boxes = (await pg.evaluate(function () { return window.PdfPage.state.undo.map(function (u) { var c = u.change, b1 = c.box[1], b3 = c.box[3]; if (b3 - b1 < 2) { var base = (b1 + b3) / 2; b1 = base - c.size; b3 = base + 0.35 * c.size; } return [Math.min(c.x0Before, c.x0After), b1, Math.max(c.x1Before, c.x1After), b3]; }); })).map(function (b) { return b.map(function (v) { return v * k; }); });
      var d = rasterDiff(A, B, boxes, 2); say('  §EDSHEET-RASTER ' + J(d) + ' boxes=' + boxes.length);
      check('H3', 'raster', 'poppler raster (72 dpi): pixels changed inside the ' + boxes.length + ' edited boxes (> 0), 0 outside them', d.same && d.inside > 0 && d.outside === 0, d);
      RES.H3 = 'changed=' + C.changed.join(',') + ' added=' + C.added.join(',') + ' of ' + Object.keys(C.a).length + ' objects; raster inside=' + d.inside + ' outside=' + d.outside;
    });

    // ── H4: refused by name, never written wrong ──
    await guard('H4', async function () {
      var b0 = await b64('bytes'), n = logs.length; await pg.$eval(cellSel('B11'), function (e) { e.scrollIntoView({ block: 'center' }); }); var c = await centre(pg, cellSel('B11'));
      await pg.mouse.click(c.x, c.y, { clickCount: 2 }); await pg.waitForSelector('.el-ed input'); await pg.$eval('.el-ed input', function (i) { i.select(); }); await pg.keyboard.type('รวม'); await pg.keyboard.press('Enter');
      var r1 = await waitLog(/^§EDSHEET-EDIT .*ok=/, n, 10000), st1 = await pg.$eval('#stat', function (e) { return e.textContent; }), b1 = await b64('bytes');
      check('H4', 'thai-refused', 'Thai typed into B11 is REFUSED by name (script-not-supported), said in words, the PDF bytes unchanged', !!r1 && /ok=false reason=script-not-supported/.test(r1) && /Thai/.test(st1) && b1 === b0, { log: r1, stat: st1, same: b1 === b0 });
      var n2 = logs.length; c = await centre(pg, cellSel('B11')); await pg.mouse.click(c.x, c.y, { clickCount: 2 }); await pg.waitForSelector('.el-ed input'); await pg.$eval('.el-ed input', function (i) { i.select(); }); await pg.keyboard.type('Due → From'); await pg.keyboard.press('Enter');
      var r2 = await waitLog(/^§EDSHEET-EDIT .*ok=/, n2, 10000), b2 = await b64('bytes');
      check('H4', 'no-font-refused', 'a character no font here can show ("→": not in the subset, not in WinAnsi) is REFUSED glyph-missing naming it, bytes unchanged', !!r2 && /ok=false reason=glyph-missing/.test(r2) && /standard PDF fonts cannot show "→"/.test(r2) && b2 === b0, { log: r2, same: b2 === b0 });
      RES.H4 = (r1 || '').replace(/.*reason=/, 'thai:').slice(0, 40) + ' · ' + (r2 || '').replace(/.*reason=/, 'arrow:').slice(0, 30);
    });

    // ── E5: the .xlsx ──
    await guard('E5', async function () {
      var n = logs.length; await pg.click('#b-xlsx'); await waitLog(/^§PDFED-XLSX/, n, 15000); var xb = await bytesOf('lastXlsx'), wb = xb ? XLSX.read(xb, { type: 'array' }) : null, ws = wb && wb.Sheets.Report;
      var Rn = (await readBack(edited)).R, diff = Object.keys(Rn.sheet).filter(function (a) { var c = ws && ws[a]; return !c || (Rn.sheet[a].t === 'n' ? Math.abs(c.v - Rn.sheet[a].v) > 1e-9 : String(c.v) !== String(Rn.sheet[a].v)); });
      check('E5', 'same-cells', 'the .xlsx holds every cell the edited PDF re-reads to (' + Object.keys(Rn.sheet).length + '), same values', !!ws && !diff.length, diff.slice(0, 5));
      var sums = Rn.checks.filter(function (c) { return c.kind === 'SUM'; }).map(function (c) { return c.cell; }), noF = sums.filter(function (a) { return !(ws[a] && /^SUM\(/.test(ws[a].f || '')); });
      check('E5', 'sum-formulas', 'every total (' + sums.join(',') + ') carries its SUM formula in the .xlsx', sums.length >= 4 && !noF.length, noF);
      var shim = SA.create(xlsxHost(wb), { SheetHistory: H }), ck = await shim.checkHistory(), ents = await pg.evaluate(function () { return window.PdfPage.state.history.length; });
      check('E5', 'history', 'the Excel menu\'s own reader (host_shim.js) says the history is OK with the page\'s ' + ents + ' entries', ck.verdict === 'OK' && ck.history.entries === ents, ck.text);
      RES.E5 = 'cells=' + Object.keys(Rn.sheet).length + ' sums=' + sums.length + ' history=' + ck.verdict + '/' + (ck.history && ck.history.entries);
    });

    // ── H6: undo / redo on a fresh open ──
    await guard('H6', async function () {
      var n = await pick(pg, TB); await waitLog(/^§EDSHEET-LAYER/, n, 30000); await waitLog(/^§PDFED-OPEN ok=true/, n, 30000);
      var b0 = await bytesOf('bytes'); await typeOn(cellSel('B11'), 'Intercompany Due'); var b1 = await bytesOf('bytes');
      var nu = logs.length; await pg.$eval('#stat', function (e) { e.focus && e.focus(); }); await pg.keyboard.down('Control'); await pg.keyboard.press('KeyZ'); await pg.keyboard.up('Control');
      var u = await waitLog(/^§EDSHEET-UNDO/, nu, 15000); await waitLog(/^§EDSHEET-LAYER/, nu, 15000); var bu = await bytesOf('bytes'), Lu = await layer();
      var C = compareObjects(b0, bu);
      check('H6', 'undo-original', 'Ctrl+Z: §EDSHEET-UNDO; the PDF is the original again: ' + (Buffer.compare(Buffer.from(b0), Buffer.from(bu)) === 0 ? 'byte-identical' : C.changed.length + ' objects differ') + '; B11 reads "Intercompany Due From"', !!u && Buffer.compare(Buffer.from(b0), Buffer.from(bu)) === 0 && (await readBack(bu)).R.sheet.B11.text === 'Intercompany Due From', { log: u, changed: C.changed });
      var nr = logs.length; await pg.click('#b-redo'); var rd = await waitLog(/^§EDSHEET-REDO/, nr, 15000); await waitLog(/^§EDSHEET-LAYER/, nr, 15000); var br2 = await bytesOf('bytes');
      check('H6', 'redo', 'Redo (button): the edit is back, bytes equal the edited bytes, B11 reads "Intercompany Due"', !!rd && Buffer.compare(Buffer.from(b1), Buffer.from(br2)) === 0 && (await readBack(br2)).R.sheet.B11.text === 'Intercompany Due', rd);
      var nu2 = logs.length; await pg.click('#b-undo'); await waitLog(/^§EDSHEET-UNDO/, nu2, 15000); await waitLog(/^§EDSHEET-LAYER/, nu2, 15000);
      var lines = await pg.evaluate(function () { return window.PdfPage.state.lines.slice(); }), hist = lines.map(function (l) { return JSON.parse(l); }), v = await H.verify(lines);
      var actors = hist.map(function (e) { return e.actor; }), lastOp = hist[hist.length - 1] && hist[hist.length - 1].payload.ops[0];
      check('H6', 'history', 'the history is genesis, edit, undo, redo, undo (actors ' + J(actors) + '), SheetHistory.verify ok, the last undo sets B11 back to "Intercompany Due From"', v.ok && J(actors) === J(['report-reader', 'you', 'you (undo)', 'you (redo)', 'you (undo)']) && !!lastOp && lastOp.cell === 'B11' && lastOp.after && lastOp.after.v === 'Intercompany Due From', { verify: v, actors: actors, op: lastOp });
      var nd = logs.length; await pg.click('#b-pdf'); await waitLog(/^§EDSHEET-EXPORT/, nd, 15000); var dl2 = await bytesOf('lastPdf'), C2 = compareObjects(b0, dl2), o2 = await PO.open(pdfjs, dl2);
      var hist2 = o2.history || [], v2 = await H.verify(hist2), cn = pageContentNums(C2.a), touched = C2.changed.filter(function (n) { return cn.indexOf(n) >= 0 || /\/Subtype\s*\/Image/.test(C2.a[n]) || /\/Font\b/.test(C2.a[n]); });
      check('H6', 'export-after-undo', 'the PDF downloaded after the undo: page content and fonts byte-identical to the original (' + touched.length + ' touched), its history (' + hist2.length + ' entries) verifies; the only objects that differ hold the history (' + C2.changed.join(',') + ' changed, ' + C2.added.length + ' added)', !touched.length && v2.ok && hist2.length === 5 && C2.added.length === 2 && C2.changed.length === 1, { touched: touched, verify: v2, changed: C2.changed, added: C2.added.length });
      RES.H6 = 'undo=byte-identical redo=byte-identical entries=' + hist2.length + ' verify=' + v2.ok + ' actors=' + actors.join('|');
    });

    // ── H8 (SHEET_FRONT_DOOR §20.3): undo holds a BOUNDED pile of earlier copies; a drag that ends outside the page leaves nothing ──
    await guard('H8', async function () {
      var n = await pick(pg, TB); await waitLog(/^§EDSHEET-LAYER/, n, 30000); await waitLog(/^§PDFED-OPEN ok=true/, n, 30000);
      var size = (await bytesOf('bytes')).length; await pg.evaluate(function (b) { window.PdfPage.state.undoBudget = b; }, size + 2000);   // room for ONE earlier copy
      await typeOn(cellSel('B11'), 'Due One'); await typeOn(cellSel('B11'), 'Due Two'); var b2 = await bytesOf('bytes'), n3 = logs.length; await typeOn(cellSel('B11'), 'Due Three'); var b3 = await bytesOf('bytes');
      var mem = since(/^§EDSHEET-UNDO-MEM/, n3)[0] || '', ro = since(/^§PDFED-REOPEN/, n3)[0] || ''; say('  ' + mem); say('  ' + ro);
      var held = await pg.evaluate(function () { return window.PdfPage.state.undo.map(function (u) { return !!u.before; }); });
      check('H8', 'bounded', 'with room for one earlier copy, three edits leave 3 steps on record and 1 with its bytes (the newest): ' + J(held), / steps=3 withBytes=1 /.test(mem) && J(held) === J([false, false, true]), { mem: mem, held: held });
      check('H8', 'reopen-cost-said', 'each edit says what its reopen cost (§PDFED-REOPEN pagesRead=1 of=1)', /pagesRead=1 of=1 /.test(ro), ro);
      var nu = logs.length; await pg.click('#b-undo'); await waitLog(/^§EDSHEET-UNDO cell=/, nu, 15000); await waitLog(/^§EDSHEET-LAYER/, nu, 15000); var bu = await bytesOf('bytes');
      var dis = await pg.$eval('#b-undo', function (b) { return b.disabled; }), nu2 = logs.length; await pg.evaluate(function () { return window.PdfPage.step('undo'); });
      var stop = await waitLog(/^§EDSHEET-UNDO ok=false reason=memory/, nu2, 4000), st = await pg.$eval('#stat', function (e) { return e.textContent; }), bs = await bytesOf('bytes');
      check('H8', 'newest-undone-then-stops', 'the newest step undoes byte-identically; then Undo is disabled, a further undo is refused in words ("Undo stops here ...") and the bytes stay',
        Buffer.compare(Buffer.from(b2), Buffer.from(bu)) === 0 && dis === true && !!stop && /^Undo stops here/.test(st) && Buffer.compare(Buffer.from(bu), Buffer.from(bs)) === 0, { same: Buffer.compare(Buffer.from(b2), Buffer.from(bu)) === 0, disabled: dis, log: stop, stat: st });
      var nr = logs.length; await pg.click('#b-redo'); await waitLog(/^§EDSHEET-REDO/, nr, 15000); await waitLog(/^§EDSHEET-LAYER/, nr, 15000);
      check('H8', 'redo-after', 'Redo brings the third edit back byte-identically', Buffer.compare(Buffer.from(b3), Buffer.from(await bytesOf('bytes'))) === 0, null);
      // a drag that leaves the page: no box stays, nothing is summed; a drag inside still sums (so the first is not a dead layer)
      await pg.$eval(cellSel('D6'), function (e) { e.scrollIntoView({ block: 'center' }); }); await sleep(150);
      var c6 = await centre(pg, cellSel('D6')), c9 = await centre(pg, cellSel('D9')), lb = await pg.$eval('.el-layer', function (e) { var b = e.getBoundingClientRect(); return { left: b.left, top: b.top }; }), nd = logs.length;
      await pg.mouse.move(c6.x - 30, c6.y - 4); await pg.mouse.down(); await pg.mouse.move(c9.x + 10, c9.y + 4, { steps: 6 }); var boxWhile = await pg.$$eval('.el-sel', function (a) { return a.length; });
      await pg.mouse.move(Math.max(1, lb.left - 20), c9.y, { steps: 6 }); await pg.mouse.up(); await sleep(300);
      var boxAfter = await pg.$$eval('.el-sel', function (a) { return a.length; }), sel = since(/^§EDSHEET-SELECT/, nd).length, ni = logs.length;
      await pg.mouse.move(c6.x - 30, c6.y - 4); await pg.mouse.down(); await pg.mouse.move(c9.x + 10, c9.y + 4, { steps: 6 }); await pg.mouse.up(); var inside = await waitLog(/^§EDSHEET-SELECT/, ni, 4000);
      check('H8', 'drag-left-the-page', 'a mouse drag that leaves the page: the box was there (' + boxWhile + '), is gone after (' + boxAfter + '), nothing summed (' + sel + '); the same drag kept inside sums 4 cells',
        boxWhile === 1 && boxAfter === 0 && sel === 0 && !!inside && / count=4 /.test(inside), { boxWhile: boxWhile, boxAfter: boxAfter, sel: sel, inside: inside, layerLeft: lb.left });
      RES.H8 = (mem.replace(/^§EDSHEET-UNDO-MEM /, '').replace(/ heapMB.*/, '')) + ' · stop=' + !!stop + ' · dragOutside box=' + boxAfter;
    });

    // ── H3 on a page that holds a picture (made here by ghostscript from the trial balance) ──
    await guard('H3', async function () {
      if (!HAVE_GS || !HAVE_POPPLER) { note('H3', 'ghostscript or poppler absent: the picture page was not judged'); return; }
      var hex = ''; for (var y = 0; y < 32; y++) for (var x = 0; x < 64 * 3; x++) hex += ('0' + ((x * 7 + y * 3) % 256).toString(16)).slice(-2);
      var ps = path.join(tmp, 'img.ps'), fI = path.join(tmp, 'picture.pdf'); fs.writeFileSync(ps, '<< /EndPage { exch pop 0 eq { gsave 560 12 translate 96 48 scale 64 32 8 [64 0 0 -32 0 32] <' + hex + '> false 3 colorimage grestore true } { false } ifelse } >> setpagedevice\n');
      var g = cp.spawnSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4', '-sOutputFile=' + fI, ps, '-f', TB], { encoding: 'utf8' }); if (g.status !== 0) { note('H3', 'ghostscript made no copy'); return; }
      var IB = new Uint8Array(fs.readFileSync(fI)), n = await pick(pg, fI); await waitLog(/^§EDSHEET-LAYER/, n, 30000); var ly = since(/^§EDSHEET-LAYER/, n)[0]; say('  ' + ly);
      var L = await layer(), img = L.targets.filter(function (t) { return t.kind === 'image'; })[0], n1 = logs.length;
      if (img) { var c = await centre(pg, '.el-t[data-id="' + img.id + '"]'); await pg.mouse.click(c.x, c.y); }
      var lk = await waitLog(/^§EDSHEET-LOCKED/, n1, 4000), st = await pg.$eval('#stat', function (e) { return e.textContent; });
      check('H1', 'picture-locked', 'on the picture page the picture is a LOCKED target and a click says why ("Locked: a picture ...")', !!img && img.lock === 'image' && !!lk && /lock=image/.test(lk) && /^Locked: a picture/.test(st), { img: img, log: lk, stat: st });
      await typeOn(cellSel('D10'), '499.09'); await typeOn(cellSel('B10'), 'Accounts Receivable'); var E = await bytesOf('bytes'), fIE = path.join(tmp, 'picture_edited.pdf'); fs.writeFileSync(fIE, E);
      var C = compareObjects(IB, E), imgs = Object.keys(C.a).filter(function (k) { return /\/Subtype\s*\/Image/.test(C.a[k]); }), cn = pageContentNums(C.a), other = C.changed.filter(function (k) { return cn.indexOf(k) < 0; });
      check('H3', 'picture-identical', 'after two edits on the picture page: every image stream byte-identical (' + imgs.length + ' image object(s)), only the page content stream changed (' + C.changed.join(',') + '), nothing added', imgs.length >= 1 && imgs.every(function (k) { return C.a[k] === C.b[k]; }) && !other.length && !C.added.length, { imgs: imgs, changed: C.changed, added: C.added });
      var A = raster(fI, tmp, 'pi'), B = raster(fIE, tmp, 'pe'), boxes = await pg.evaluate(function () { return window.PdfPage.state.undo.map(function (u) { var c = u.change, b1 = c.box[1], b3 = c.box[3]; if (b3 - b1 < 2) { var base = (b1 + b3) / 2; b1 = base - c.size; b3 = base + 0.35 * c.size; } return [Math.min(c.x0Before, c.x0After), b1, Math.max(c.x1Before, c.x1After), b3]; }); }), d = rasterDiff(A, B, boxes, 2);
      say('  §EDSHEET-RASTER picture ' + J(d));
      check('H3', 'picture-raster', 'poppler raster of the picture page: 0 pixels changed outside the 2 edited boxes (the picture included)', d.same && d.inside > 0 && d.outside === 0, d);
    });

    // ── H2 on a one-byte (TrueType, WinAnsi) font and a page with no table: the 12-page report ──
    await guard('H2', async function () {
      var MR = path.join(PDFD, 'corpus/market_impact_report.pdf'), MB = new Uint8Array(fs.readFileSync(MR)), n = await pick(pg, MR); await waitLog(/^§EDSHEET-LAYER/, n, 30000); var ly = since(/^§EDSHEET-LAYER/, n)[0]; say('  ' + ly);
      var t = (await layer()).targets.filter(function (x) { return !x.lock && x.kind === 'run'; }), want = t.filter(function (x) { return /Date: March 2026/.test(x.title + '') || true; });
      var tg = await pg.evaluate(function () { return window.PdfPage.state.layer.targets.list.filter(function (x) { return !x.lock && /March 2026/.test(x.text); }).map(function (x) { return { id: x.id, text: x.text }; })[0]; });
      var ne = tg ? await typeOn('.el-t[data-id="' + tg.id + '"]', tg.text.replace('March 2026', 'April 2026')) : logs.length, e = since(/^§EDSHEET-EDIT /, ne)[0], hs = since(/^§PDFWR-HISTORY/, ne)[0]; say('  ' + e); say('  ' + hs);
      var E = await bytesOf('bytes'), fM = path.join(tmp, 'report_edited.pdf'); fs.writeFileSync(fM, E); var T = HAVE_POPPLER ? pdftext(fM, ['-raw', '-l', '1']) : '', C = compareObjects(MB, E), cn = pageContentNums(C.a);
      check('H2', 'one-byte-font', 'the report (TrueType WinAnsi fonts, no table, ' + (ly || '').replace(/.*writableRuns=(\d+).*/, '$1') + ' writable runs on page 1): "' + (tg && tg.text) + '" -> April; poppler reads "April 2026", not "March 2026", on page 1; the history records it under _door_text', !!tg && !!e && /ok=true/.test(e) && (!HAVE_POPPLER || (count(T, 'April 2026') === 1 && count(T, 'March 2026') === 0)) && !!hs && /sheet=_door_text/.test(hs), { tg: tg, e: e, hs: hs, T: T.slice(0, 200) });
      var other = C.changed.filter(function (k) { return cn.indexOf(k) < 0 && !/DoorStd/.test(C.b[k]); });
      check('H3', 'report-objects', 'on the 12-page report (' + Object.keys(C.a).length + ' objects) only page 1\'s content stream changed (+ a font holder if a standard font was added): changed=' + C.changed.join(',') + ' added=' + C.added.length, !other.length && C.changed.length >= 1 && C.added.length <= 1, { changed: C.changed, other: other, added: C.added });
    });

    // ── E7: the phone ──
    await guard('E7', async function () {
      if (LIVE && MUTANT) return;
      var ctx = await br.createBrowserContext(), p = await ctx.newPage(), pl = []; p.on('console', function (m) { pl.push(m.text()); });
      await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
      var c2 = await p.target().createCDPSession(); await c2.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await p.goto(base + 'index.html', { waitUntil: 'load' });
      var r = await Promise.all([p.waitForFileChooser(), p.tap('#b-open')]); var t0 = Date.now(); await r[0].accept([TB]);
      for (var t = 0; t < 60000 && !pl.some(function (l) { return /^§EDSHEET-LAYER/.test(l); }); t += 100) await sleep(100);
      var layMs = Date.now() - t0, ly = pl.filter(function (l) { return /^§EDSHEET-LAYER/.test(l); })[0]; say('  §EDSHEET-PHONE layerMs=' + layMs + ' ' + (ly || 'no layer'));
      var w = await p.evaluate(function () { return { sw: document.documentElement.scrollWidth, pg: document.querySelector('.pg[data-p="1"]').getBoundingClientRect().width, hdr: document.querySelector('header').getBoundingClientRect().height }; });
      check('E7', 'fits', 'at 390 px the page with its edit layer fits the width (document ' + w.sw + ' px, page ' + Math.round(w.pg) + ' px) and the toolbar stays <= 100 px (' + Math.round(w.hdr) + ')', !!ly && w.sw <= 390 && w.pg <= 390 && w.hdr <= 100, w);
      var pos = await p.$eval('.el-t[data-cell="D10"][data-kind="cell"]', function (e) { var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, sy: window.scrollY, ih: innerHeight }; });
      if (pos.y > pos.ih - 40 || pos.y < 120) { await p.evaluate(function (dy) { window.scrollBy(0, dy); }, pos.y - pos.ih / 2); await sleep(300); pos = await p.$eval('.el-t[data-cell="D10"][data-kind="cell"]', function (e) { var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, sy: window.scrollY, ih: innerHeight }; }); }
      var nE = pl.length; await p.touchscreen.tap(pos.x, pos.y); await p.waitForSelector('.el-ed input', { timeout: 8000 }).catch(function () {});
      var after = await p.evaluate(function () { var i = document.querySelector('.el-ed input'), b = i && i.getBoundingClientRect(); return { open: !!i, sy: window.scrollY, inView: !!b && b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth, font: i ? getComputedStyle(i).fontSize : null }; });
      var opened = pl.slice(nE).filter(function (l) { return /^§EDSHEET-EDITOR/.test(l); })[0];
      check('E7', 'tap-opens', 'a tap on D10 opens its editor in place, the page does not scroll (scrollY ' + pos.sy + ' -> ' + after.sy + '), the field is on screen, ' + after.font + ' text', after.open && after.sy === pos.sy && after.inView && !!opened && /windowScrolled=0/.test(opened), { after: after, log: opened });
      await p.keyboard.type('499.09'); await p.keyboard.press('Enter'); for (var t2 = 0; t2 < 30000 && !pl.slice(nE).some(function (l) { return /^§EDSHEET-EDIT /.test(l); }); t2 += 100) await sleep(100);
      var ed = pl.slice(nE).filter(function (l) { return /^§EDSHEET-EDIT /.test(l); })[0];
      check('E7', 'edit-on-phone', 'typed and Enter on the phone: §EDSHEET-EDIT ok=true new="499.09"', !!ed && /ok=true .*new="499\.09"/.test(ed), ed);
      RES.E7 = 'layerMs=' + layMs + ' doc=' + w.sw + 'px header=' + Math.round(w.hdr) + 'px scrolled=' + (after.sy - pos.sy) + ' input=' + after.font;
      await ctx.close();
    });
    if (errs.length) { check('H1', 'no-page-errors', 'no page errors during the run', false, errs.slice(0, 3)); }
  } finally { await br.close(); if (srv) srv.close(); }
  var heap = Math.round(process.memoryUsage().heapUsed / 1048576), lays = logs.filter(function (l) { return /^§EDSHEET-LAYER/.test(l); }).map(function (l) { return +(/ ms=(\d+)/.exec(l) || [0, 0])[1]; });
  say('§EDSHEET-COST layerBuilds=' + lays.length + ' layerMsMax=' + Math.max.apply(null, lays.concat([0])) + ' layerHeapMB=' + ((logs.filter(function (l) { return /^§EDSHEET-LAYER/.test(l); }).pop() || '').match(/heapMB=(-?\d+)/) || [0, '?'])[1] + ' witnessHeapMB=' + heap);
  return RES;
}
async function guard(cs, fn) { try { await fn(); } catch (e) { check(cs, 'crash', 'the case runs', false, String((e && e.stack) || e).slice(0, 400)); } }

(async function () {
  var RES = await main().catch(function (e) { check('H1', 'run', 'the witness runs', false, String((e && e.stack) || e).slice(0, 400)); return {}; });
  var judged = 0, failed = 0;
  ORDER.forEach(function (cs) { var c = CASES[cs] || { judged: 0, failed: 0, notes: [] }; judged += c.judged; failed += c.failed; say('§EDSHEET-' + cs + ' ' + (!c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS') + ' judged=' + c.judged + ' failed=' + c.failed + (RES[cs] ? ' ' + RES[cs] : '') + (c.notes.length ? ' notes=' + J(c.notes) : '') + (MUTANT ? ' mutant=' + MUTANT : '')); });
  var killed = 0, total = 0;
  if (process.env.EDSHEET_MUTANTS === '1' && !MUTANT && !LIVE) {
    for (var name of Object.keys(MUTANTS)) {
      total++; var m = MUTANTS[name], ch = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { EDSHEET_MUTANT: name, EDSHEET_MUTANTS: '' }), encoding: 'utf8', maxBuffer: 1 << 26, timeout: 600000 });
      var out = ch.stdout || '', line = out.split('\n').filter(function (l) { return l.indexOf('§EDSHEET-' + m.kills + ' ') === 0; })[0] || '', crash = /key=crash/.test(out.split('\n').filter(function (l) { return l.indexOf('case=' + m.kills + ' ') >= 0 && / FAIL /.test(l); }).join('\n')) && !/key=(?!crash)\S+ FAIL/.test(out.split('\n').filter(function (l) { return l.indexOf('case=' + m.kills + ' ') >= 0; }).join('\n'));
      var broken = /§EDSHEET-MUTANT-BROKEN/.test(out), k = / FAIL /.test(line) && !crash && !broken; if (k) killed++;
      var fk = out.split('\n').filter(function (l) { return l.indexOf('case=' + m.kills + ' ') >= 0 && / FAIL /.test(l); }).map(function (l) { return (/key=(\S+)/.exec(l) || [])[1]; });
      say('§EDSHEET-MUTANT name=' + name + ' kills=' + m.kills + ' ' + (k ? 'KILLED' : 'SURVIVED' + (crash ? ' (crash only)' : '') + (broken ? ' (marker missing)' : '')) + ' failedChecks=' + fk.join(',') + ' child="' + line.trim().slice(0, 160) + '"');
    }
    say('§EDSHEET-MUTANTS killed=' + killed + '/' + total);
  }
  var verdict = !judged ? 'INCONCLUSIVE' : failed || (total && killed < total) ? 'FAIL' : 'PASS';
  say('§EDSHEET-VERDICT ' + verdict + ' judged=' + judged + ' failed=' + failed + (total ? ' mutants=' + killed + '/' + total : '') + (MUTANT ? ' mutant=' + MUTANT : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})();
