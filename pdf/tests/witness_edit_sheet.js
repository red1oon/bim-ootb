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
//   H9 AROUND    two opens that overlap end as the LAST file; a failed open undresses the page; a turned phone redraws <= 6 pages at the new width;
//                a text edited outside the table, then the .xlsx on Sheet history: 0 changes nobody made (§20.5)
//   E5 EXCEL     the .xlsx re-reads to the same cells, SUM formulas on the totals, the history verifying through the Excel menu's own reader
//   E7 PHONE     390 px, CPU 4x: the page fits the width, a tap opens the cell's editor without scrolling the page, an edit applies
//   H10 XREF STREAM a PDF 1.5 file (xref stream + object streams, made by xref_fixture.js) opens file=writable, an edit applies and keeps ONE xref stream, undo is byte-identical (SHEET_FRONT_DOOR §22.3)
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
var TF = require('./table_fixture.js'), FX = require('./xref_fixture.js'), PO = require(path.join(PDFD, 'pdf_open.js')), RR = require(path.join(PDFD, 'report_reader.js')), PW = require(path.join(PDFD, 'pdf_write.js')), H = require(path.join(ROOT, 'erp/sheet_history.js')), XLSX = require(path.join(ROOT, 'erp/xlsx.mini.min.js')), SA = require(path.join(ROOT, 'erp/sheet_addin/host_shim.js'));
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
  'drag-box-stays': { kills: 'H8', file: 'pdf/edit_layer.js', from: 'if (ev.pointerType === \'mouse\') drop();', to: '' },
  'text-into-number': { kills: 'H4', file: 'pdf/index.html', from: 'var asText = false; /*MUT-TEXTNUM*/', to: 'var asText = true;' },
  'blank-flash': { kills: 'H11', file: 'pdf/index.html', from: 'var keep = true; /*MUT-FLASH*/', to: 'var keep = false;' },
  'open-race': { kills: 'H9', file: 'pdf/index.html', from: 'var lost = mine !== S.asked; /*MUT-OPENRACE*/', to: 'var lost = false;' },
  'no-resize': { kills: 'H9', file: 'pdf/index.html', from: 'var skip = false; /*MUT-NORESIZE*/', to: 'var skip = true;' },
  'follow-off': { kills: 'E3', file: 'pdf/pdf_write.js', from: '/*MUT-FOLLOW*/', to: 'edits = edits.slice(0, 1); followed = [];' },
  'broken-total-repaired': { kills: 'E3F', file: 'pdf/pdf_write.js', from: 'if (!c.ok /*MUT-REPAIR*/) return;', to: 'if (false) return;' },
  'float-arithmetic': { kills: 'E3F', file: 'pdf/pdf_write.js', from: '/*MUT-FLOAT*/ decStr(decAdd(dec(RR.parseNum(R.sheet[a].text).d), memo[a]))', to: 'String(RR.parseNum(R.sheet[a].text).v + Number(decStr(memo[a])))' },
  'followed-second-step': { kills: 'E3F', file: 'pdf/index.html', from: '/*MUT-TWOSTEP*/', to: 'if (!W.ok && edits.length > 1) { var w1 = await PdfWrite.rewriteText(S.bytes, edits.slice(0, 1), { substitute: true }); if (w1.ok) S.bytes = w1.bytes; }' },
  'one-sheet-only': { kills: 'H9', file: 'pdf/index.html', from: 'if (!S.lines.length || s === sh || wb.SheetNames.indexOf(s) >= 0) return;', to: 'return;' }
};
var CASES = {}, ORDER = ['H1', 'E3', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H11', 'E5', 'E7', 'H10', 'E3F', 'E3G'];
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
  var boxesOfUndo = function () { return pg.evaluate(function () { var out = []; window.PdfPage.state.undo.forEach(function (u) { (u.changes || [u.change]).forEach(function (c) { var b1 = c.box[1], b3 = c.box[3]; if (b3 - b1 < 2) { var base = (b1 + b3) / 2; b1 = base - c.size; b3 = base + 0.35 * c.size; } out.push([Math.min(c.x0Before, c.x0After), b1, Math.max(c.x1Before, c.x1After), b3]); }); }); return out; }); };   // the box of EVERY cell a step changed (a figure and the totals that followed it)
  var histOps = function () { return pg.evaluate(function () { return window.PdfPage.state.history.map(function (e) { return { actor: e.actor, ops: e.payload.ops.map(function (o) { return { cell: o.cell, f: (o.after && o.after.f) || null, typed: !!o.typedOverFormula }; }) }; }); }); };
  // a real double-click on the target's centre, type, Enter
  var centre = async function (p, sel) { return p.$eval(sel, function (e) { var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }); };
  var typeOn = async function (sel, text, p) {
    p = p || pg; var n = logs.length; await p.$eval(sel, function (e) { e.scrollIntoView({ block: 'center' }); }); await sleep(100); var c = await centre(p, sel);
    await p.mouse.click(c.x, c.y, { clickCount: 2 }); await p.waitForSelector('.el-ed input', { timeout: 5000 });
    await p.$eval('.el-ed input', function (i) { i.select(); }); await p.keyboard.type(text); await p.keyboard.press('Enter');
    await waitLog(/^§EDSHEET-(EDIT|LAYER)/, n, 15000); await waitLog(/^§EDSHEET-EDIT /, n, 15000); await waitLog(/^§EDSHEET-LAYER/, n, 15000); await sleep(150); return n;
  };
  var cellSel = function (a) { return '.el-t[data-cell="' + a + '"][data-kind="cell"]'; };
  var RES = {}, FIRST = null;
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
      // SHEET_FRONT_DOOR §30: a changed figure and the totals that HELD follow in the same step (D10 -> D28, F10, F28), as in Excel
      var b0 = await bytesOf('bytes'), n1 = await typeOn(D10, '499.09'), ed = since(/^§EDSHEET-EDIT /, n1)[0], fo = since(/^§EDSHEET-FOLLOW /, n1)[0], L1 = await layer(), H1 = await histOps(), b1 = await bytesOf('bytes'), Rb1 = (await readBack(b1)).R; FIRST = b1;
      say('  ' + ed); say('  ' + fo); say('  ' + (since(/^§PDFWR-HISTORY/, n1).join(' | ')));
      check('E3', 'edit-applies', 'D10 498.09 -> 499.09 typed on the page: §EDSHEET-EDIT ok=true', !!ed && /ok=true old="498\.09" new="499\.09"/.test(ed), ed);
      check('E3', 'totals-follow', 'D28, F10 and F28 follow in the same step: §EDSHEET-FOLLOW cell=D10 followed=[D28,F10,F28] ops=4 ok=true; every mark is green (' + L1.marks.length + '), the 3 followed cells are lit, the status line says "D10 is now 499.09; D28, F10 and F28 followed. Page 1 adds up"',
        !!fo && /cell=D10 followed=\[D28,F10,F28\] ops=4 ok=true/.test(fo) && L1.marks.length >= 4 && L1.marks.every(function (m) { return m.ok; }) && L1.lit === 3 && /^D10 is now 499\.09; D28, F10 and F28 followed\. Page 1 adds up/.test(L1.stat), { fo: fo, marks: L1.marks.filter(function (m) { return !m.ok; }), lit: L1.lit, stat: L1.stat });
      var new4 = { D10: '499.09', D28: '40,393.44', F10: '1,019.16', F28: '1.00' }, others = Object.keys(R0.sheet).filter(function (a) { return !new4[a]; }).filter(function (a) { return !Rb1.sheet[a] || Rb1.sheet[a].text !== R0.sheet[a].text || Rb1.map[a].box.some(function (v, i) { return Math.abs(v - R0.map[a].box[i]) > 0.01; }); });
      check('E3', 'new-figures-read', 'our reader reads the four new figures at their places (D10 499.09, D28 40,393.44, F10 1,019.16, F28 1.00), the verdict is ADDS_UP and every other cell (' + (Object.keys(R0.sheet).length - 4) + ') is the same text in the same box', Object.keys(new4).every(function (a) { return Rb1.sheet[a] && Rb1.sheet[a].text === new4[a]; }) && Rb1.verdict === 'ADDS_UP' && !others.length, { others: others.slice(0, 3), verdict: Rb1.verdict });
      if (HAVE_POPPLER) {
        var f1 = path.join(tmp, 'follow1.pdf'), fo0 = path.join(tmp, 'follow0.pdf'); fs.writeFileSync(f1, b1); fs.writeFileSync(fo0, TBB);
        var w0 = bboxWords(fo0), w1 = bboxWords(f1), chg = [], mv = []; w0.forEach(function (w, i) { var v = w1[i] || {}; if (v.s !== w.s) chg.push(w.s + '->' + v.s); else if (Math.abs(w.x0 - v.x0) > 0.05 || Math.abs(w.x1 - v.x1) > 0.05 || Math.abs(w.y0 - v.y0) > 0.05) mv.push(w.s); });
        check('E3', 'poppler-new-figures', 'poppler reads the same ' + w0.length + ' words with exactly the four figures changed (498.09, 40,392.44, 1,018.16, 0.00 -> the new ones), none moved', w0.length === w1.length && chg.length === 4 && mv.length === 0 && chg.indexOf('498.09->499.09') >= 0 && chg.indexOf('40,392.44->40,393.44') >= 0 && chg.indexOf('1,018.16->1,019.16') >= 0, { chg: chg, mv: mv.slice(0, 3) });
      } else note('E3', 'poppler absent: the four figures were not read by an independent reader');
      var hist1 = H1[H1.length - 1];
      check('E3', 'one-entry', 'the edit is ONE history entry after the genesis (entries ' + e0 + ' -> ' + L1.entries + ') with 4 ops (D10, D28, F10, F28), 3 of them carrying their formula, none typed over a formula', L1.entries === 2 && hist1.ops.length === 4 && hist1.ops.filter(function (o) { return o.f; }).length === 3 && hist1.ops.filter(function (o) { return o.typed; }).length === 0 && hist1.ops.map(function (o) { return o.cell; }).sort().join() === 'D10,D28,F10,F28', { entries: L1.entries, ops: hist1.ops });
      // one Undo takes the figure and every followed cell back (the original bytes); Redo brings the edited bytes
      var nu = logs.length; await pg.click('#b-undo'); await waitLog(/^§EDSHEET-UNDO/, nu, 15000); await waitLog(/^§EDSHEET-LAYER/, nu, 15000); var bu = await bytesOf('bytes'), Hu = await histOps(), Lu = await layer();
      var nr = logs.length; await pg.click('#b-redo'); await waitLog(/^§EDSHEET-REDO/, nr, 15000); await waitLog(/^§EDSHEET-LAYER/, nr, 15000); var br = await bytesOf('bytes'), Hr = await histOps(), lastU = Hu[Hu.length - 1];
      check('E3', 'one-undo-one-redo', 'ONE Undo gives back the original bytes (all four cells at once, ' + TBB.length + ' bytes), its history entry holds the 4 cells and none typed over; ONE Redo gives back the edited bytes',
        Buffer.compare(Buffer.from(bu), Buffer.from(TBB)) === 0 && Buffer.compare(Buffer.from(b0), Buffer.from(TBB)) === 0 && Buffer.compare(Buffer.from(br), Buffer.from(b1)) === 0 && lastU.ops.length === 4 && lastU.ops.filter(function (o) { return o.typed; }).length === 0 && Hr.length === Hu.length + 1 && Lu.marks.every(function (m) { return m.ok; }),
        { undoSame: Buffer.compare(Buffer.from(bu), Buffer.from(TBB)) === 0, redoSame: Buffer.compare(Buffer.from(br), Buffer.from(b1)) === 0, undoEntry: lastU });
      // the reader's own SUM range is the oracle for the rows to light (not a hand-typed range)
      var ck28 = R0.checks.filter(function (c) { return c.kind === 'SUM' && c.cell === 'D28'; })[0], want28 = ck28 ? ck28.range : '?', m28 = /^D(\d+):D(\d+)$/.exec(want28), nRows = m28 ? m28[2] - m28[1] + 1 : -1;
      var n2 = logs.length, c28 = await centre(pg, cellSel('D28')); await pg.mouse.click(c28.x, c28.y); var tt = await waitLog(/^§EDSHEET-TOTAL/, n2, 4000), lit = (await layer()).lit;
      check('E3', 'total-formula', 'a click on the total D28 says its formula and lights its rows (the reader found SUM(' + want28 + '): ' + nRows + ' rows; ' + lit + ' lit)', !!tt && tt.indexOf('formula=SUM(' + want28 + ')') >= 0 && lit === nRows, { log: tt, lit: lit });
      var c6 = await centre(pg, cellSel('D6')), c9 = await centre(pg, cellSel('D9')), n3 = logs.length;
      await pg.mouse.move(c6.x - 30, c6.y - 4); await pg.mouse.down(); await pg.mouse.move(c9.x + 10, c9.y + 4, { steps: 6 }); await pg.mouse.up(); var sl = await waitLog(/^§EDSHEET-SELECT/, n3, 4000);
      var want = ['D6', 'D7', 'D8', 'D9'].map(function (a) { return R0.sheet[a] ? R0.sheet[a].v : 0; }).reduce(function (x, y) { return x + y; }, 0);
      check('E3', 'drag-sum', 'a mouse drag over D6..D9 gives their sum and count (§EDSHEET-SELECT count=4 sum=' + want + ')', !!sl && / count=4 /.test(sl) && Math.abs(Number(/sum=([-\d.]+)/.exec(sl)[1]) - want) < 1e-6, sl);
      // typing OVER a total: only that cell changes, it is flagged typed over, red, and nothing is pushed into its rows
      var nt = await typeOn(cellSel('D28'), '40400.44'), edT = since(/^§EDSHEET-EDIT /, nt)[0], foT = since(/^§EDSHEET-FOLLOW /, nt)[0], LT = await layer(), HT = await histOps(), bT = await bytesOf('bytes'), RT = (await readBack(bT)).R, dT = LT.marks.filter(function (m) { return m.cell === 'D28'; })[0], hT = HT[HT.length - 1];
      var diffT = Object.keys(Rb1.sheet).filter(function (a) { return a !== 'D28' && RT.sheet[a].text !== Rb1.sheet[a].text; });
      check('E3', 'typed-over-total', 'typing 40400.44 over the total D28: ONE op, nothing followed (§EDSHEET-FOLLOW followed=[] ops=1), D28 flagged typed over a formula, its mark RED with gap 7.00 (so the marks are recomputed), no other cell changed',
        !!edT && /ok=true old="40,393\.44" new="40,400\.44"/.test(edT) && !!foT && /followed=\[\] ops=1 ok=true/.test(foT) && hT.ops.length === 1 && hT.ops[0].cell === 'D28' && hT.ops[0].typed === true && !!dT && !dT.ok && Math.abs(dT.gap - 7) < 1e-9 && !diffT.length, { ed: edT, fo: foT, ops: hT.ops, mark: dT, diff: diffT.slice(0, 3) });
      var ntu = logs.length; await pg.click('#b-undo'); await waitLog(/^§EDSHEET-UNDO/, ntu, 15000); await waitLog(/^§EDSHEET-LAYER/, ntu, 15000);
      // the consistent four (PDF_EDITOR §4.3 W1): D10 500.09 now carries F10 1,020.16, D28 40,394.44, F28 2.00 with it - ONE edit, not four
      var n5 = await typeOn(D10, '500.09'), fo5 = since(/^§EDSHEET-FOLLOW /, n5)[0], L2 = await layer();
      check('E3', 'consistent-adds-up', 'D10 -> 500.09 once: D28 40,394.44, F10 1,020.16 and F28 2.00 follow (§EDSHEET-FOLLOW followed=[D28,F10,F28]); every mark adds up (' + L2.marks.length + ' marks) and the status says it adds up', !!fo5 && /followed=\[D28,F10,F28\] ops=4 ok=true/.test(fo5) && L2.marks.length >= 4 && L2.marks.every(function (m) { return m.ok; }) && /adds up/.test(L2.stat), { fo: fo5, marks: L2.marks.filter(function (m) { return !m.ok; }), stat: L2.stat });
      check('E3', 'entries', 'the history after this: genesis, edit, undo, redo, typed over, its undo, the second edit = 7 entries (entries=' + L2.entries + ')', L2.entries === 7, L2.entries);
      RES.E3 = 'followed=D28,F10,F28 ops=4 lit=' + L1.lit + ' typedOverGap=' + (dT && dT.gap) + ' entries=' + L2.entries + ' marksOk=' + L2.marks.filter(function (m) { return m.ok; }).length + '/' + L2.marks.length;
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
      check('H5', 'export-lists', 'the export lists both substitutions: the total F28 that followed D10 (a digit the bold subset lacks, written in the regular face) and B12 (§EDSHEET-EXPORT substituted=2 list=["F28:LiberationSans-Bold>LiberationSans","B12:LiberationSans>Helvetica"])', !!exp && /substituted=2 /.test(exp) && /F28:LiberationSans-Bold>LiberationSans/.test(exp) && /B12:LiberationSans>Helvetica/.test(exp), exp);
      RES.H5 = (redLog || '').replace(/^§EDSHEET-FONT /, '');
    });
    await guard('H7', async function () {
      var sb = (await layer()).subs.filter(function (s) { return s.cell === 'B12'; })[0], n = logs.length;
      if (sb) { var c = await centre(pg, '.el-sub[data-key="' + sb.key + '"] button'); await pg.mouse.click(c.x, c.y); }
      var ac = await waitLog(/^§EDSHEET-ACCEPT/, n, 4000), L = await layer(), runs2 = await PW.listRuns(await bytesOf('bytes'), 1), q = runs2.filter(function (r) { return r.text === 'Quiz Zebra'; })[0];
      check('H7', 'accept', 'Accept on B12 removes ITS red box (§EDSHEET-ACCEPT redBoxes=1: the followed total F28 keeps its own) and the substitution stays: "Quiz Zebra" is still drawn in Helvetica', !!ac && /redBoxes=1/.test(ac) && L.subs.length === 1 && L.subs[0].cell === 'F28' && !!q && q.font === 'Helvetica', { log: ac, subs: L.subs, run: q });
      var sf = L.subs.filter(function (s) { return s.cell === 'F28'; })[0], n2 = logs.length;
      if (sf) { await pg.$eval('.el-sub[data-key="' + sf.key + '"] button', function (e) { e.scrollIntoView({ block: 'center' }); }); await sleep(150); var c2 = await centre(pg, '.el-sub[data-key="' + sf.key + '"] button'); await pg.mouse.click(c2.x, c2.y); }
      var ac2 = await waitLog(/^§EDSHEET-ACCEPT/, n2, 4000), L2 = await layer();
      check('H7', 'accept-followed', 'the red box of a total that FOLLOWED a figure (F28, "font not same: LiberationSans-Bold -> LiberationSans") is accepted like any other: redBoxes=0', !!sf && /font not same: LiberationSans-Bold → LiberationSans/.test(sf.text) && !!ac2 && /cell=F28 font=LiberationSans redBoxes=0/.test(ac2) && !L2.subs.length, { sf: sf, log: ac2, subs: L2.subs });
      RES.H7 = (ac || '').replace(/^§EDSHEET-ACCEPT /, '') + ' · ' + (ac2 || '').replace(/^§EDSHEET-ACCEPT /, '');
    });

    // ── H3: integrity of the exported file ──
    await guard('H3', async function () {
      var C = compareObjects(TBB, edited), cn = pageContentNums(C.a), extra = C.changed.filter(function (n) { return cn.indexOf(n) < 0; });
      var fontHolder = extra.filter(function (n) { return /DoorStd1/.test(C.b[n]) && !/DoorStd1/.test(C.a[n]); }), others = extra.filter(function (n) { return fontHolder.indexOf(n) < 0; });
      var addedFont = C.added.filter(function (n) { return /\/BaseFont\s*\/Helvetica\b/.test(C.b[n]); });
      check('H3', 'objects', 'every object not holding an edited run is byte-identical: changed = the page content stream (' + cn.join(',') + ') + the ONE font dictionary that names the added Helvetica (' + fontHolder.join(',') + '); added = that font (' + addedFont.join(',') + '); nothing else (' + Object.keys(C.a).length + ' objects)',
        C.changed.indexOf(cn[0]) >= 0 && fontHolder.length === 1 && !others.length && C.added.length === 1 && addedFont.length === 1 && !C.removed.length, { changed: C.changed, added: C.added, removed: C.removed, others: others });
      if (!HAVE_POPPLER) { note('H3', 'poppler absent: raster not judged'); return; }
      var A = raster(fO, tmp, 'o'), B = raster(fE, tmp, 'e'), k = 72 / 72, boxes = (await boxesOfUndo()).map(function (b) { return b.map(function (v) { return v * k; }); });
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
      var n3 = logs.length; c = await centre(pg, cellSel('D10')); await pg.mouse.click(c.x, c.y, { clickCount: 2 }); await pg.waitForSelector('.el-ed input'); await pg.$eval('.el-ed input', function (i) { i.select(); }); await pg.keyboard.type('12O.50'); await pg.keyboard.press('Enter');
      var r3 = await waitLog(/^§EDSHEET-EDIT .*ok=/, n3, 10000), st3 = await pg.$eval('#stat', function (e) { return e.textContent; }), b3 = await b64('bytes');
      check('H4', 'number-cell-takes-number', '"12O.50" (a letter O) typed into the number cell D10 on the page is REFUSED not-a-number, said in words, the PDF bytes unchanged (§21)', !!r3 && /ok=false reason=not-a-number/.test(r3) && /is not a number/.test(st3) && b3 === b0, { log: r3, stat: st3, same: b3 === b0 });
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

    // ── H9 (SHEET_FRONT_DOOR §20.5): the page around the editor - overlapping opens, a failed open, a turned phone, and the .xlsx of a prose edit ──
    await guard('H9', async function () {
      var MRu = 'corpus/market_impact_report.pdf', TBu = 'corpus/trial_balance_th.pdf';
      var n = logs.length, two = await pg.evaluate(async function (a, b) {
        var f = async function (u) { return new Uint8Array(await (await fetch(u)).arrayBuffer()); }, big = await f(a), small = await f(b);
        var p1 = window.PdfPage.openBytes(big, 'big12.pdf'), p2 = window.PdfPage.openBytes(small, 'small1.pdf'); await Promise.all([p1, p2]);   // the second asked before the first closed the old file
        var p3 = window.PdfPage.openBytes(big, 'big12.pdf'); await new Promise(function (r) { setTimeout(r, 4); }); var p4 = window.PdfPage.openBytes(small, 'small1.pdf'); await Promise.all([p3, p4]); var S = window.PdfPage.state;   // and again, the second asked while the first is being READ
        return { name: S.name, bytesAreSmall: S.bytes.length === small.length, pages: S.info && S.info.pages, divs: document.querySelectorAll('.pg').length, docPages: S.doc && S.doc.numPages };
      }, MRu, TBu);
      check('H9', 'overlapping-opens', 'a 12-page file and a 1-page file opened without waiting: name, bytes, document and page count are all the LAST file\'s (1 page)', two.name === 'small1.pdf' && two.bytesAreSmall && two.pages === 1 && two.divs === 1 && two.docPages === 1, two);
      await waitLog(/^§PDFED-OPEN ok=true/, n, 30000);
      var bad = await pg.evaluate(async function () { await window.PdfPage.openBytes(new Uint8Array([104, 101, 108, 108, 111]), 'notes.txt'); var s = document.getElementById('b-sample'); return { open: document.body.classList.contains('open'), sampleShown: !!(s && s.offsetParent !== null), stat: document.getElementById('stat').textContent }; });
      check('H9', 'failed-open-dress', 'after a good file, a file that is not a PDF: the page is no longer in its "open" dress and the sample button is back', bad.open === false && bad.sampleShown === true && /not a PDF/.test(bad.stat), bad);
      // a phone turned from landscape to portrait with the 12-page report open
      var ctx = await br.createBrowserContext(), p = await ctx.newPage(), pl = []; p.on('console', function (m) { pl.push(m.text()); });
      await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await p.goto(base + 'index.html', { waitUntil: 'load' });
      await p.evaluate(async function (a) { window.PdfPage.openBytes(new Uint8Array(await (await fetch(a)).arrayBuffer()), 'report12.pdf'); }, MRu);
      for (var t = 0; t < 600 && !pl.some(function (l) { return /^§PDFED-OPEN ok=true/.test(l); }); t++) await sleep(100);
      var m0 = await p.evaluate(function () { return { alive: window.PdfPage.alive(), pages: document.querySelectorAll('.pg').length }; });
      await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(1500);
      var m1 = await p.evaluate(function () { var w = 0; document.querySelectorAll('.pg').forEach(function (d) { w = Math.max(w, d.getBoundingClientRect().width); }); return { alive: window.PdfPage.alive(), widest: Math.round(w), inner: window.innerWidth, layer: document.querySelectorAll('.el-layer').length }; });
      var rl = pl.filter(function (l) { return /^§PDFED-RELAYOUT/.test(l); }).pop() || ''; say('  ' + rl);
      check('H9', 'phone-turned', 'the 12-page report, 844 px wide then 390: at most 6 of ' + m0.pages + ' pages drawn (' + m1.alive + '), no page wider than the window (' + m1.widest + ' of ' + m1.inner + ' px), the edit layer still on page 1', m0.pages === 12 && m1.alive <= 6 && m1.widest <= m1.inner && m1.layer === 1 && !!rl, { before: m0, after: m1, log: rl });
      await ctx.close();
      // a text changed OUTSIDE the table, then the .xlsx, opened on the Sheet history page: nothing nobody did
      var SC = path.join(PDFD, 'corpus/showcase.pdf'), n2 = await pick(pg, SC); await waitLog(/^§EDSHEET-LAYER/, n2, 30000); await waitLog(/^§PDFED-OPEN ok=true/, n2, 30000);
      var tg = await pg.evaluate(function () { var L = window.PdfPage.state.layer; return { cells: Object.keys(L.R.sheet).length, t: L.targets.list.filter(function (x) { return !x.lock && x.kind === 'run' && !x.cell && /^[A-Za-z][A-Za-z ]{3,}$/.test(x.text); }).map(function (x) { return { id: x.id, text: x.text }; })[0] || null }; });
      if (!tg.t || !tg.cells) { note('H9', 'showcase.pdf gives no writable text outside its table (cells=' + tg.cells + '): the prose-edit case was not judged'); check('H9', 'prose-population', 'the corpus gives a page with a table AND a writable text outside it', false, tg); return; }
      var ne = await typeOn('.el-t[data-id="' + tg.t.id + '"]', tg.t.text.slice(0, -1)), e = since(/^§EDSHEET-EDIT /, ne)[0] || ''; say('  ' + e);
      var nx = logs.length; await pg.click('#b-xlsx'); await waitLog(/^§PDFED-XLSX/, nx, 15000); var sx = since(/^§PDFXLSX-SHEETS/, nx)[0] || ''; say('  ' + sx);
      var fX = path.join(tmp, 'prose.xlsx'); fs.writeFileSync(fX, Buffer.from(await bytesOf('lastXlsx')));
      var hp = await br.newPage(), hl = []; hp.on('console', function (m) { hl.push(m.text()); }); await hp.goto(base + '../erp/sheet_addin/history.html', { waitUntil: 'load' });
      var fc = await Promise.all([hp.waitForFileChooser({ timeout: 8000 }), hp.click('label[for=file]')]); await fc[0].accept([fX]);
      for (var t2 = 0; t2 < 150 && !hl.some(function (l) { return /^§SHIST-PAGE-BIND/.test(l); }); t2++) await sleep(100);
      var bind = hl.filter(function (l) { return /^§SHIST-PAGE-BIND/.test(l); }).pop() || '', hs = await hp.$eval('#status', function (x) { return x.textContent; }); say('  ' + bind.slice(0, 260)); await hp.close();
      check('H9', 'prose-no-phantom', '"' + tg.t.text + '" (outside the table of ' + tg.cells + ' cells) edited on the page, Download .xlsx, opened on Sheet history: verified, state=intact, 0 changes nobody made', /ok=true/.test(e) && /sheet=|_door_text/.test(sx + e) && / state=intact /.test(bind + ' ') && / pending=0/.test(bind) && /verified/.test(hs), { edit: e, sheets: sx, bind: bind.slice(0, 300), status: hs.slice(0, 160) });
      RES.H9 = 'opens=' + two.name + '/' + two.pages + 'p · turned alive=' + m1.alive + ' widest=' + m1.widest + '/' + m1.inner + ' · prose ' + (/ pending=(\d+)/.exec(bind) || ['', '?'])[1] + ' pending';
    });

    // ── H11 (SHEET_FRONT_DOOR §28): the sheet is never shown without its drawing - an edit, an undo, a redo keep the page as it was until the new drawing is complete ──
    await guard('H11', async function () {
      var n = await pick(pg, TB); await waitLog(/^§EDSHEET-LAYER/, n, 30000); await waitLog(/^§PDFED-OPEN ok=true/, n, 30000); await sleep(600);
      await pg.evaluate(function () { window.__blank = { ms: 0, frames: 0, bad: 0, last: performance.now(), states: {} }; (function k() { var B = window.__blank, d = document.querySelector('.pg[data-p="1"]'), cs = d ? d.querySelectorAll('canvas') : [], c = cs[0], t = performance.now();
        var s = !c || !c.width ? 'no-canvas' : (c.dataset.stale || d.dataset.drawn) ? 'shown' : 'blank-canvas'; B.frames++; B.states[s] = (B.states[s] || 0) + 1; if (s !== 'shown') { B.bad++; B.ms += t - B.last; } B.last = t; requestAnimationFrame(k); })(); });
      var mark = function () { return pg.evaluate(function () { var B = window.__blank; return { ms: Math.round(B.ms), frames: B.frames, bad: B.bad, states: JSON.parse(JSON.stringify(B.states)) }; }); };
      var m0 = await mark(); await typeOn(cellSel('D10'), '499.09'); await sleep(700); var m1 = await mark();
      var nu = logs.length; await pg.click('#b-undo'); await waitLog(/^§EDSHEET-UNDO cell=/, nu, 15000); await waitLog(/^§EDSHEET-LAYER/, nu, 15000); await sleep(700); var m2 = await mark();
      var nr = logs.length; await pg.click('#b-redo'); await waitLog(/^§EDSHEET-REDO/, nr, 15000); await waitLog(/^§EDSHEET-LAYER/, nr, 15000); await sleep(700); var m3 = await mark();
      var fin = await pg.evaluate(function () { var d = document.querySelector('.pg[data-p="1"]'), cs = d.querySelectorAll('canvas'), c = cs[0], x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, dark = 0, tot = 0; for (var i = 0; i < x.length; i += 28) { tot++; if (x[i] + x[i + 1] + x[i + 2] < 384) dark++; } return { canvases: cs.length, stale: !!c.dataset.stale, drawn: d.dataset.drawn || null, ink: Math.round(dark / tot * 10000) / 10000 }; });
      say('  §EDSHEET-BLANK frames=' + m3.frames + ' edit: notShownMs=' + (m1.ms - m0.ms) + ' undo: ' + (m2.ms - m1.ms) + ' redo: ' + (m3.ms - m2.ms) + ' states=' + J(m3.states) + ' after: ' + J(fin));
      check('H11', 'population', 'the page was watched every frame through an edit, an undo and a redo (' + (m3.frames - m0.frames) + ' frames, 100 or more)', m3.frames - m0.frames >= 100, m3);
      check('H11', 'never-blank', 'in no frame is page 1 without a canvas or showing a canvas not yet drawn: edit ' + (m1.bad - m0.bad) + ', undo ' + (m2.bad - m1.bad) + ', redo ' + (m3.bad - m2.bad) + ' such frames', m3.bad - m0.bad === 0, { edit: m1.bad - m0.bad, undo: m2.bad - m1.bad, redo: m3.bad - m2.bad, states: m3.states });
      check('H11', 'one-fresh-canvas-after', 'afterwards page 1 holds ONE canvas, not a stale one, drawn, with ink on it (' + fin.ink + ')', fin.canvases === 1 && !fin.stale && fin.drawn === '1' && fin.ink > 0.01, fin);
      RES.H11 = 'frames=' + (m3.frames - m0.frames) + ' notShown=' + (m3.bad - m0.bad) + ' ink=' + fin.ink;
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
      var A = raster(fI, tmp, 'pi'), B = raster(fIE, tmp, 'pe'), boxes = await boxesOfUndo(), d = rasterDiff(A, B, boxes, 2);
      say('  §EDSHEET-RASTER picture ' + J(d));
      check('H3', 'picture-raster', 'poppler raster of the picture page: 0 pixels changed outside the ' + boxes.length + ' edited boxes (D10, the 3 totals that followed it, B10; the picture included)', d.same && d.inside > 0 && d.outside === 0, d);
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
    // ── H10 (SHEET_FRONT_DOOR §22.3): a PDF 1.5 file (xref stream + object streams, made here by xref_fixture.js) opens WRITABLE on the page, an edit applies, undo is byte-identical ──
    await guard('H10', async function () {
      var cvx = FX.convert(TBB), fX = path.join(tmp, 'tb_xrefstream.pdf'), XI = FX.xsRead(cvx.bytes); fs.writeFileSync(fX, cvx.bytes);
      var n = await pick(pg, fX), lay = await waitLog(/^§EDSHEET-LAYER/, n, 30000); await waitLog(/^§PDFED-OPEN ok=true/, n, 30000); say('  ' + lay);
      check('H10', 'opens-writable', 'a converted trial balance (' + cvx.objStreams + ' object streams, ' + cvx.packed + ' packed objects, xref stream: ' + XI.streams + ', tables: ' + XI.tables + ') opens with §EDSHEET-LAYER file=writable and its writable runs offered', !!lay && / file=writable /.test(lay) && XI.streams === 1 && XI.tables === 0 && cvx.packed > 10 && / writableRuns=([1-9]\d*) /.test(lay), { lay: lay, streams: XI.streams });
      var b0 = await bytesOf('bytes'), nE = await typeOn(cellSel('D10'), '499.09'), ed = since(/^§EDSHEET-EDIT /, nE)[0], b1 = await bytesOf('bytes'), XO = FX.xsRead(b1), vo = XO.valid(), rb = await readBack(b1); say('  ' + ed);
      var pi = cp.spawnSync('pdfinfo', [(function () { var f = path.join(tmp, 'xs_edited.pdf'); fs.writeFileSync(f, b1); return f; })()], { encoding: 'utf8' });
      check('H10', 'edit-applies', 'D10 498.09 -> 499.09 typed on the page: §EDSHEET-EDIT ok=true; the saved bytes keep ONE xref stream (no table, no /Prev), every offset and /Length exact in the witness\'s own reader (' + vo.counts.t2 + ' type-2 entries kept), re-read D10 = 499.09' + (HAVE_POPPLER ? ', pdfinfo exit 0 and silent' : ''),
        !!ed && /ok=true old="498\.09" new="499\.09"/.test(ed) && XO.streams === 1 && XO.tables === 0 && XO.prev === 0 && XO.startxrefs === 1 && vo.bad.length === 0 && vo.counts.t2 === XI.valid().counts.t2 && rb.R && rb.R.sheet.D10.text === '499.09' && (!HAVE_POPPLER || (pi.status === 0 && !(pi.stderr || '').trim())), { ed: ed, xo: [XO.streams, XO.tables, XO.prev, XO.startxrefs], bad: vo.bad.slice(0, 2), t2: vo.counts.t2, pdfinfo: [pi.status, pi.stderr] });
      var nu = logs.length; await pg.click('#b-undo'); await waitLog(/^§EDSHEET-UNDO/, nu, 15000); await waitLog(/^§EDSHEET-LAYER/, nu, 15000); var bu = await bytesOf('bytes');
      check('H10', 'undo-identical', 'Undo gives the converted file back byte for byte (' + cvx.bytes.length + ' bytes) and the edited copy differs from it', Buffer.compare(Buffer.from(bu), Buffer.from(cvx.bytes)) === 0 && Buffer.compare(Buffer.from(b0), Buffer.from(cvx.bytes)) === 0 && Buffer.compare(Buffer.from(b1), Buffer.from(cvx.bytes)) !== 0, { undoSame: Buffer.compare(Buffer.from(bu), Buffer.from(cvx.bytes)) === 0, openedSame: Buffer.compare(Buffer.from(b0), Buffer.from(cvx.bytes)) === 0 });
      RES.H10 = 'objStreams=' + cvx.objStreams + ' packed=' + cvx.packed + ' editedBytes=' + b1.length + ' type2Kept=' + vo.counts.t2 + ' xrefStreams=' + XO.streams;
    });

    // ── E3F (SHEET_FRONT_DOOR §30.2): fixtures made here - a total wrong BEFORE, a total one digit too wide for its clipped box, cents that floats get wrong ──
    await guard('E3F', async function () {
      var B = ['0.10', '20.20', '300.30'], C = ['1.10', '22.20', '333.30'], rows = [['Rent', B[0], C[0]], ['Fees', B[1], C[1]], ['Tax', B[2], C[2]]];
      var make = function (name, o) { var f = path.join(tmp, name + '.pdf'); fs.writeFileSync(f, TF.ledger(o)); return f; }, openFx = async function (f) { var n = await pick(pg, f); await waitLog(/^§EDSHEET-LAYER/, n, 30000); await waitLog(/^§PDFED-OPEN ok=true/, n, 30000); return layer(); };
      var textsOf = async function () { return (await readBack(await bytesOf('bytes'))).R; };
      // a total that was wrong before is never followed and never repaired
      var Lw = await openFx(make('wrong_total', { rows: rows, totals: ['321.60', TF.sum(C)] })), mB7 = Lw.marks.filter(function (m) { return m.cell === 'B7'; })[0], mC7 = Lw.marks.filter(function (m) { return m.cell === 'C7'; })[0];
      var nb = await typeOn(cellSel('B3'), '0.20'), foB = since(/^§EDSHEET-FOLLOW /, nb)[0], LB = await layer(), RB = await textsOf(), bB7 = LB.marks.filter(function (m) { return m.cell === 'B7'; })[0];
      var nc = await typeOn(cellSel('C3'), '2.10'), foC = since(/^§EDSHEET-FOLLOW /, nc)[0], LC = await layer(), RC = await textsOf();
      say('  ' + foB); say('  ' + foC);
      check('E3F', 'broken-total-stays', 'a fixture whose printed total B7 is off by 1.00 (321.60, rows 320.60), read red at open: a figure above it (B3 0.10 -> 0.20) changes that figure ONLY (§EDSHEET-FOLLOW followed=[] ops=1), B7 stays 321.60 and RED; a figure of the other column (C3 -> 2.10) moves its own total C7 to 357.60 (followed=[C7]) and B7 is still 321.60, still red',
        !!mB7 && !mB7.ok && Math.abs(mB7.gap - 1) < 1e-9 && !!mC7 && mC7.ok && !!foB && /followed=\[\] ops=1 ok=true/.test(foB) && RB.sheet.B3.text === '0.20' && RB.sheet.B7.text === '321.60' && !!bB7 && !bB7.ok && !!foC && /followed=\[C7\] ops=2 ok=true/.test(foC) && RC.sheet.C7.text === '357.60' && RC.sheet.B7.text === '321.60' && LC.marks.filter(function (m) { return m.cell === 'B7'; })[0].ok === false && LC.marks.filter(function (m) { return m.cell === 'C7'; })[0].ok === true,
        { mB7: mB7, foB: foB, B7: RB.sheet.B7 && RB.sheet.B7.text, foC: foC, C7: RC.sheet.C7 && RC.sheet.C7.text, B7after: RC.sheet.B7 && RC.sheet.B7.text });
      // a followed total that cannot be written refuses the WHOLE edit: the figure is not written either
      await openFx(make('wide_total', { rows: [['Rent', '0.10', '1.10'], ['Fees', '20.20', '22.20'], ['Tax', '79.30', '33.30']], totals: ['99.60', '56.60'], clip: [0] }));
      var bw0 = await b64('bytes'), hw0 = (await histOps()).length, uw0 = await pg.evaluate(function () { return window.PdfPage.state.undo.length; }), nW = logs.length, cW = await centre(pg, cellSel('B3'));
      await pg.mouse.click(cW.x, cW.y, { clickCount: 2 }); await pg.waitForSelector('.el-ed input'); await pg.$eval('.el-ed input', function (i) { i.select(); }); await pg.keyboard.type('0.50'); await pg.keyboard.press('Enter');
      var rW = await waitLog(/^§EDSHEET-EDIT .*ok=/, nW, 10000), foW = await waitLog(/^§EDSHEET-FOLLOW /, nW, 4000), stW = await pg.$eval('#stat', function (e) { return e.textContent; }), bw1 = await b64('bytes'), hwo = await histOps(), hw1 = hwo.length, uw1 = await pg.evaluate(function () { return window.PdfPage.state.undo.length; }), RW = await textsOf();
      say('  ' + rW); say('  ' + foW);
      check('E3F', 'too-wide-refused', 'the total B7 (99.60) is clipped to its own width; B3 0.10 -> 0.50 would make it 100.00, one digit wider: the WHOLE edit is refused by name (§EDSHEET-EDIT ok=false reason=does-not-fit, §EDSHEET-FOLLOW ok=false), said in words naming B7, and nothing changed: bytes identical, B3 still 0.10, no history entry of the edit (only the page\'s first reading, as for any refused edit), no undo step',
        !!rW && /ok=false reason=does-not-fit/.test(rW) && !!foW && /ok=false reason=does-not-fit/.test(foW) && /B7 \(a total that follows B3\) cannot be written/.test(stW) && /was not changed/.test(stW) && bw0 === bw1 && RW.sheet.B3.text === '0.10' && hw1 <= hw0 + 1 && hwo.filter(function (e) { return e.actor === 'you'; }).length === 0 && uw0 === uw1, { edit: rW, follow: foW, stat: stW, sameBytes: bw0 === bw1, history: [hw0, hw1], undo: [uw0, uw1], B3: RW.sheet.B3.text });
      // exact decimals on the page: 320.60 + 0.10
      await openFx(make('cents', { rows: rows, totals: [TF.sum(B), TF.sum(C)] }));
      var nx = await typeOn(cellSel('B3'), '0.20'), foX = since(/^§EDSHEET-FOLLOW /, nx)[0], LX = await layer(), RX = await textsOf();
      check('E3F', 'exact-cents', 'cents that floats get wrong: B3 0.10 -> 0.20 moves the total B7 from 320.60 to exactly 320.70 (a float gives ' + String(320.6 + 0.1) + '): written, re-read, and the mark is green', String(320.6 + 0.1) !== '320.7' && !!foX && /followed=\[B7\] ops=2 ok=true/.test(foX) && RX.sheet.B7.text === '320.70' && LX.marks.every(function (m) { return m.ok; }), { fo: foX, B7: RX.sheet.B7 && RX.sheet.B7.text, marks: LX.marks.filter(function (m) { return !m.ok; }) });
      RES.E3F = 'wrong total stays ' + (RC.sheet.B7 && RC.sheet.B7.text) + ' · too-wide refused=' + (/does-not-fit/.test(rW || '')) + ' · cents B7=' + (RX.sheet.B7 && RX.sheet.B7.text);
    });

    // ── E3G (SHEET_FRONT_DOOR §30.1): "Show grid" follows the same rule through the same code ──
    await guard('E3G', async function () {
      var n = await pick(pg, TB); await waitLog(/^§EDSHEET-LAYER/, n, 30000); await waitLog(/^§PDFED-OPEN ok=true/, n, 30000);
      var ng = logs.length; await pg.click('#b-sheet'); await waitLog(/^§PDFWR-HISTORY entries=1/, ng, 15000); await waitLog(/^§SHEET_READER/, ng, 15000);
      var nE = logs.length; await pg.click('#grid td[data-a="D10"]', { clickCount: 2 }); await pg.waitForSelector('#grid td[data-a="D10"] input', { timeout: 5000 }); await pg.keyboard.type('499.09'); await pg.keyboard.press('Enter');
      var ed = await waitLog(/^§PDFWR-EDIT cell=D10/, nE, 15000), fo = since(/^§EDSHEET-FOLLOW /, nE)[0], hs = since(/^§PDFWR-HISTORY/, nE)[0] || ''; await sleep(300);
      var u = await pg.evaluate(function () { var t = function (a) { var d = document.querySelector('#grid td[data-a="' + a + '"]'); return d ? d.textContent : null; }; return { D10: t('D10'), D28: t('D28'), F10: t('F10'), F28: t('F28'), cls: document.getElementById('verdict').className, verdict: document.getElementById('verdict').textContent, fl: document.querySelectorAll('#grid td.fl').length, edits: window.PdfPage.state.edits, entries: window.PdfPage.state.history.length }; });
      var bG = await bytesOf('bytes'), ops = await histOps(), last = ops[ops.length - 1];
      say('  ' + ed); say('  ' + fo);
      check('E3G', 'grid-follows', 'the same edit through the grid (double-click D10, 499.09, Enter): §PDFWR-EDIT ok=true, §EDSHEET-FOLLOW followed=[D28,F10,F28] ops=4, the grid shows D28 40,393.44, F10 1,019.16, F28 1.00, says "D28, F10 and F28 followed" and that the page adds up (green), the 3 followed cells are lit, ONE history entry with 4 ops (3 with their formula, none typed over)',
        !!ed && /ok=true old="498\.09" new="499\.09" sheetVerdict=ADDS_UP pdfVerdict=ADDS_UP agree=true/.test(ed) && !!fo && /cell=D10 followed=\[D28,F10,F28\] ops=4 ok=true/.test(fo) && u.D28 === '40,393.44' && u.F10 === '1,019.16' && u.F28 === '1.00' && u.cls === 'good' && /D28, F10 and F28 followed/.test(u.verdict) && /adds up/.test(u.verdict) && u.fl === 3 && u.edits === 1 && u.entries === 2 && last.ops.length === 4 && last.ops.filter(function (o) { return o.f; }).length === 3 && !last.ops.some(function (o) { return o.typed; }), { ed: ed, fo: fo, ui: u, ops: last });
      check('E3G', 'same-bytes-as-the-page', 'the grid and the page give the SAME file for the same figure (one owner of what follows): ' + (bG ? bG.length : 0) + ' bytes, byte-identical to the page edit of E3', !!FIRST && Buffer.compare(Buffer.from(bG), Buffer.from(FIRST)) === 0, { grid: bG && bG.length, page: FIRST && FIRST.length });
      RES.E3G = 'ops=' + last.ops.length + ' fl=' + u.fl + ' sameBytes=' + (!!FIRST && Buffer.compare(Buffer.from(bG), Buffer.from(FIRST)) === 0);
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
