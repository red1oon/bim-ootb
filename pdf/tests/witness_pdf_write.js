#!/usr/bin/env node
// ⚠ DO NOT REMOVE - W-PDF-WRITE (bim-compiler prompts/PDF_EDITOR.md §4.3, phase P4 narrow: numbers-only in-place write-back). READ THE LOG after every run; the exit code is not evidence.
// THE ISSUE THIS PROVES OR DISPROVES: a number changed in the sheet must come back in the SAME PDF, in the same place, with nothing else
//   moved and the old number really gone (KillerPDF #413 "editing text shifts the line and keeps old text parts" is the named falsifier).
//   W1  ROUND TRIP     the saved bytes re-read (pdf_open + report_reader) give the new values at the same addresses   -> wrong cell, or nothing written
//   W2  INDEPENDENT    poppler reads the new strings, one fewer of each old one, at the old place                     -> our reader agrees only with our writer
//   W3  OLD GONE       the old run is not in the content stream, nor anywhere in the file; one line changed per edit    -> old text left behind or kept in a revision
//   W4  NOTHING MOVED  every other cell / word / object / pixel is the same; the right edge is kept                    -> a neighbour shifted, alignment lost
//   W5  STILL BITES    only D10 rewritten -> the re-read says DOES_NOT_ADD_UP and names D28                              -> the check goes blind after an edit
//   W6  REFUSED        not a number, wrong old text, empty box, missing glyph, too wide, twice, bad batch: named, bytes unchanged -> a wrong write passes silently
//   W7  STATED SUB     a digit the bold subset lacks is written in the regular face of the same family, said out loud   -> a silent font change, or a dead end
//   W8  HISTORY        one S9 entry per rewrite, one CELL_SET per change, kernel-verified; replay == the re-read PDF      -> history and file disagree
//   W9  VALID FILE     poppler opens it without a word; every xref entry and /Length is exact; cost logged              -> a file only we can open
//   W10 VARIANTS       the same file Flate-compressed, and with D10 drawn as two runs (made here, checked by poppler)    -> only one stream style works
//   W11 SECOND WRITER  a ghostscript re-distilled copy: round-trips, or is refused by name                              -> the engine fits one generator only
//   W12 SHEET SIDE     the edited SHEET's verdict (reader's own rule) equals the re-read PDF's; formatLike reads the column -> sheet and PDF disagree
//   W14 REVIEW        made here: hidden scan text locked; a glyph a one-byte subset lacks substituted, not written at width 0; a shared page offered == written; reopen reads 1 page == a fresh open -> the corpus's blind spots (SHEET_FRONT_DOOR §20)
//   W13 CORPUS SWEEP   EVERY number cell of every corpus PDF, one edit each: round-trips in both readers or is refused by name  -> only the hand-picked cells work
// Independent readers: poppler pdftotext / pdfinfo / pdftoppm, node zlib, and this file's own xref and stream reading (never the engine's).
// Command: node pdf/tests/witness_pdf_write.js     (PDFWR_MUTANTS=1 adds the mutant sweep: each mutant must turn its named case FAIL; a crash is not a kill)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), zlib = require('zlib');
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ROOT = path.join(__dirname, '..', '..'), PDFD = path.join(ROOT, 'pdf'), ERP = path.join(ROOT, 'erp');
var ENGINE = process.env.PDFWR_ENGINE || path.join(PDFD, 'pdf_write.js'), MUTANT = process.env.PDFWR_MUTANT || '';
var CAP = [], say = function (s) { process.stdout.write(s + '\n'); };
console.log = function () { CAP.push(Array.prototype.join.call(arguments, ' ')); }; console.warn = function () {};   // the engines' own §-lines are kept in CAP and echoed where they are evidence
var pdfjs = require(path.join(ROOT, 'modeller/lib/pdfjs/pdf.min.js')); pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'modeller/lib/pdfjs/pdf.worker.min.js');
var PO = require(process.env.PDFWR_OPEN || path.join(PDFD, 'pdf_open.js')), RR = require(path.join(PDFD, 'report_reader.js')), PW = require(ENGINE), H = require(path.join(ERP, 'sheet_history.js')), K = require(path.join(ERP, 'ws_kernel.js'));
var CASES = {}, ALL = { judged: 0, failed: 0 }, TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfwr_')), TOL = 0.01, seq = 0;
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §PDFWR-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§PDFWR-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
async function guard(cs, fn) { try { await fn(); } catch (e) { check(cs, 'crash', 'the case runs', false, String(e && e.stack || e).slice(0, 400)); } verdict(cs); }
var near = function (a, b, t) { return Math.abs(a - b) <= (t == null ? TOL : t); }, cent = function (a, b) { return Math.abs(a - b) < 0.005; };
function lastLog(re) { for (var i = CAP.length - 1; i >= 0; i--) if (re.test(CAP[i])) return CAP[i]; return null; }
function same(a, b) { return a.length === b.length && Buffer.from(a.buffer, a.byteOffset, a.length).equals(Buffer.from(b.buffer, b.byteOffset, b.length)); }

// ── our own reader (the pair the page uses) ──
async function reread(bytes) { var doc = await PO.open(pdfjs, bytes); if (!doc.ok) return { ok: false, doc: doc, R: { sheet: {}, map: {}, checks: [], verdict: 'NOT-OPEN', reason: J(doc) } }; return { ok: true, doc: doc, R: RR.read(doc.items) }; }
function edit(R, cell, newText, more) { return Object.assign({ cell: cell, page: R.map[cell].page, box: R.map[cell].box, oldText: R.sheet[cell].text, newText: newText }, more || {}); }

// ── independent readers: poppler ──
function tmpFile(bytes) { var f = path.join(TMP, 'f' + (++seq) + '.pdf'); fs.writeFileSync(f, bytes); return f; }
var HAVE_POPPLER = !cp.spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).error, HAVE_GS = !cp.spawnSync('gs', ['--version'], { encoding: 'utf8' }).error;
function ptext(bytes) { var o = cp.spawnSync('pdftotext', ['-raw', tmpFile(bytes), '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }); return { text: o.stdout || '', err: (o.stderr || '').trim(), status: o.status }; }
function count(text, s) { return text.split(s).length - 1; }
function pwords(bytes, page) {
  var out = cp.spawnSync('pdftotext', ['-bbox'].concat(page ? ['-f', String(page), '-l', String(page)] : []).concat([tmpFile(bytes), '-']), { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout || '', words = [], re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g, m;
  var un = function (s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); };
  while ((m = re.exec(out))) words.push({ x0: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), y1: Number(m[4]), w: un(m[5]) });
  return words.sort(function (a, b) { return a.y0 - b.y0 || a.x0 - b.x0; });
}
function wordIn(words, box) { return words.filter(function (w) { var cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2; return cx >= box[0] && cx <= box[2] && cy >= box[1] && cy <= box[3]; }); }
function pinfo(bytes) { var o = cp.spawnSync('pdfinfo', [tmpFile(bytes)], { encoding: 'utf8' }); return { status: o.status, err: (o.stderr || '').trim(), pages: Number((/Pages:\s+(\d+)/.exec(o.stdout || '') || [])[1]) }; }
function raster(bytes) {   // poppler's own renderer, grey, 100 dpi -> { w, h, px }
  var f = tmpFile(bytes), o = cp.spawnSync('pdftoppm', ['-r', '100', '-gray', '-f', '1', '-l', '1', f, f], { encoding: 'utf8' }), pgm = fs.readdirSync(TMP).filter(function (n) { return n.indexOf(path.basename(f) + '-') === 0 && /\.pgm$/.test(n); })[0];
  if (o.status !== 0 || !pgm) return null; var b = fs.readFileSync(path.join(TMP, pgm)), m = /^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(b.subarray(0, 40).toString('latin1')); if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]), px: b.subarray(m[0].length) };
}
// ── independent readers: this file's own view of the PDF (classic xref, object slices, the page's content stream) ──
function struct(bytes) {
  var b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length), s = b.toString('latin1'), sx = s.lastIndexOf('startxref'), xo = Number(/startxref\s+(\d+)/.exec(s.slice(sx))[1]), tr = s.indexOf('trailer', xo);
  var head = /^xref\s+(\d+)\s+(\d+)\s+/.exec(s.slice(xo, xo + 40)), ents = s.slice(xo + head[0].length, tr).match(/\d{10} \d{5} [nf]/g) || [], objs = [];
  ents.forEach(function (e, i) { if (e[17] === 'n') objs.push({ num: Number(head[1]) + i, off: Number(e.slice(0, 10)) }); });
  objs.sort(function (a, c) { return a.off - c.off; }); objs.forEach(function (o, i) { o.end = i + 1 < objs.length ? objs[i + 1].off : xo; o.raw = b.subarray(o.off, o.end); o.head = s.slice(o.off, Math.min(o.end, o.off + 24)); });
  var by = {}; objs.forEach(function (o) { by[o.num] = o; });
  return { b: b, s: s, xrefOff: xo, entries: ents.length, objs: objs, by: by, trailer: s.slice(tr, sx), eofs: count(s, '%%EOF'), prev: /\/Prev\b/.test(s.slice(tr, sx)) };
}
function stream(st, num) {   // dictionary text, raw stream bytes, decoded (zlib here, never the engine)
  var o = st.by[num], t = o.raw.toString('latin1'), k = t.indexOf('stream'), d = t.slice(0, k), p = k + 6; if (t[p] === '\r') p++; if (t[p] === '\n') p++;
  var e = t.lastIndexOf('endstream'), end = e; if (t[end - 1] === '\n') end--; if (t[end - 1] === '\r') end--;
  var raw = o.raw.subarray(p, end), flate = /FlateDecode/.test(d), lm = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(d), len = lm ? (lm[2] ? Number(/obj\s+(\d+)/.exec(st.by[Number(lm[1])].raw.toString('latin1'))[1]) : Number(lm[1])) : -1;
  return { dict: d, raw: raw, flate: flate, length: len, text: (flate ? zlib.inflateSync(raw) : raw).toString('latin1') };
}
function contentNum(st) { return Number(/\/Contents\s+(\d+)\s+0\s+R/.exec(st.s)[1]); }
function fontTable(st, base) {   // char -> { code, w } of one Type0 font, read from its ToUnicode and /W here
  var f = st.objs.filter(function (o) { var t = o.raw.toString('latin1'); return /\/Type0/.test(t) && new RegExp('\\+' + base + '\\s').test(t); })[0], t = f.raw.toString('latin1');
  var cm = stream(st, Number(/\/ToUnicode\s+(\d+)/.exec(t)[1])).text, list = /beginbfrange\s*<[0-9a-f]+>\s*<[0-9a-f]+>\s*\[([^\]]*)\]/i.exec(cm)[1].match(/<[0-9a-f]+>/gi);
  var W = /\/W\s*\[\s*0\s*\[([^\]]*)\]/.exec(st.by[Number(/\/DescendantFonts\s*\[\s*(\d+)/.exec(t)[1])].raw.toString('latin1'))[1].trim().split(/\s+/).map(Number), out = {};
  list.forEach(function (h, code) { out[String.fromCharCode(parseInt(h.slice(1, -1), 16))] = { code: code, w: W[code] }; });
  return out;
}
function hexOf(tab, text) { return text.split('').map(function (c) { return ('000' + tab[c].code.toString(16)).slice(-4); }).join(''); }
// a copy of the file with its content stream changed, written by this witness (its own xref), never by the engine
function variant(bytes, change) {
  var st = struct(bytes), cn = contentNum(st), body = change(stream(st, cn).text), parts = [st.b.subarray(0, st.objs[0].off)], pos = st.objs[0].off, at = {};
  st.objs.forEach(function (o) { var piece = o.num === cn ? Buffer.concat([Buffer.from(cn + ' 0 obj\n<< /Length ' + body.data.length + (body.flate ? ' /Filter /FlateDecode' : '') + ' >>\nstream\n', 'latin1'), body.data, Buffer.from('\nendstream\nendobj\n', 'latin1')]) : o.raw; at[o.num] = pos; parts.push(piece); pos += piece.length; });
  var x = 'xref\n0 ' + st.entries + '\n'; for (var i = 0; i < st.entries; i++) x += at[i] != null ? ('0000000000' + at[i]).slice(-10) + ' 00000 n \n' : '0000000000 65535 f \n';
  parts.push(Buffer.from(x + st.trailer + 'startxref\n' + pos + '\n%%EOF\n', 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}

(async function () {
  var PDF = path.join(PDFD, 'corpus/trial_balance_th.pdf'), bytes = new Uint8Array(fs.readFileSync(PDF)), A = await reread(bytes);
  if (!A.ok || A.R.verdict !== 'ADDS_UP') { say('§PDFWR-VERDICT INCONCLUSIVE the corpus PDF did not open or read: ' + J(A.R.reason)); process.exit(2); }
  var R = A.R, cells = Object.keys(R.sheet), ST = struct(bytes), CN = contentNum(ST), SRC = stream(ST, CN), BEFORE_TXT = HAVE_POPPLER ? ptext(bytes).text : '', BEFORE_W = HAVE_POPPLER ? pwords(bytes) : [];
  say('§PDFWR-LOAD engine=' + ENGINE + ' mutant=' + (MUTANT || 'none') + ' pdf=trial_balance_th.pdf bytes=' + bytes.length + ' objects=' + ST.objs.length + ' contentObj=' + CN + ' contentBytes=' + SRC.raw.length + ' flate=' + SRC.flate + ' cells=' + cells.length + ' poppler=' + HAVE_POPPLER + ' gs=' + HAVE_GS);
  var E2 = [edit(R, 'D10', '499.09'), edit(R, 'D28', '40,393.44')], t0 = Date.now(), heap0 = process.memoryUsage().heapUsed, W = await PW.rewriteNumbers(bytes, E2), ms = Date.now() - t0, heapKB = Math.round((process.memoryUsage().heapUsed - heap0) / 1024);
  var B = W.ok ? await reread(W.bytes) : { ok: false, R: { sheet: {}, map: {}, checks: [], verdict: 'NOT-WRITTEN', reason: J(W.refused) } };
  say('  ' + lastLog(/^§PDF_WRITE ok=/));
  function othersSame(Ra, Rb, edited) { var bad = []; Object.keys(Ra.sheet).forEach(function (a) { if (edited.indexOf(a) >= 0) return; var x = Ra.sheet[a], y = Rb.sheet[a], m = Ra.map[a], n = Rb.map[a]; if (!y || y.text !== x.text || !n || m.box.some(function (v, i) { return !near(v, n.box[i]); })) bad.push(a + ' ' + J(y && y.text) + ' ' + J(n && n.box) + ' was ' + J(x.text) + ' ' + J(m.box)); }); return bad; }

  await guard('W1', async function () {
    check('W1', 'applied', 'the two edits (D10, D28, boxes from the reader\'s map) are applied: ok=true, 2 changes, 0 refused', W.ok === true && W.changes.length === 2 && W.refused.length === 0, { ok: W.ok, refused: W.refused });
    check('W1', 'new-values', 'the SAVED bytes re-read: D10 = 499.09 and D28 = 40,393.44 at the same addresses', B.ok && B.R.sheet.D10 && cent(B.R.sheet.D10.v, 499.09) && B.R.sheet.D10.text === '499.09' && B.R.sheet.D28 && cent(B.R.sheet.D28.v, 40393.44) && B.R.sheet.D28.text === '40,393.44', { D10: B.R.sheet.D10, D28: B.R.sheet.D28 });
    var changed = cells.filter(function (a) { return !B.R.sheet[a] || B.R.sheet[a].text !== R.sheet[a].text; });
    check('W1', 'only-those', 'the re-read holds the same ' + cells.length + ' cells and ONLY D10 and D28 differ (E28, the other 40,392.44, is untouched)', Object.keys(B.R.sheet).length === cells.length && J(changed) === J(['D10', 'D28']) && B.R.sheet.E28 && B.R.sheet.E28.text === '40,392.44', { n: Object.keys(B.R.sheet).length, changed: changed.slice(0, 8) });
    check('W1', 'adds-up', 'the re-read sum agrees, D28 = SUM(D6:D26) = 40393.44, and the reader names the row left stale (F10): DOES_NOT_ADD_UP, not a false pass', B.R.verdict === 'DOES_NOT_ADD_UP' && /F10/.test(B.R.reason) && B.R.checks.some(function (c) { return c.cell === 'D28' && c.ok && cent(c.computed, 40393.44); }), { verdict: B.R.verdict, reason: B.R.reason });
    say('  §PDFWR-NOTE W1 reader checks before=' + R.checks.length + ' after=' + B.R.checks.length + ' rowRuleAfter=' + J((B.R.checks.filter(function (c) { return c.kind === 'ROW'; })[0] || null)) + ' (F10 was not edited: the row rule F = C + D - E no longer holds on row 10 and the reader stops reporting it)');
    var E4 = [edit(R, 'D10', '500.09'), edit(R, 'F10', '1,020.16'), edit(R, 'D28', '40,394.44'), edit(R, 'F28', '2.00')], W4 = await PW.rewriteNumbers(bytes, E4), C = W4.ok ? await reread(W4.bytes) : { R: { checks: [], sheet: {} } }, rule = C.R.checks.filter(function (c) { return c.kind === 'ROW'; })[0];
    check('W1', 'consistent-four', 'a fully consistent edit (D10 500.09, F10 1,020.16, D28 40,394.44, F28 2.00) re-reads ADDS_UP with all 5 checks: 4 sums and the row rule on 21 of 21 rows', W4.ok && C.R.verdict === 'ADDS_UP' && C.R.checks.length === 5 && C.R.checks.every(function (c) { return c.ok; }) && !!rule && rule.rows === 21 && rule.formula === 'F = C + D - E' && C.R.sheet.F28.text === '2.00', { ok: W4.ok, refused: W4.refused, verdict: C.R.verdict, checks: C.R.checks.length, rule: rule });
  });

  await guard('W2', async function () {
    if (!HAVE_POPPLER) { say('  §PDFWR-NOTE W2 poppler is not installed: nothing judged'); return; }
    var T = ptext(W.bytes), words = pwords(W.bytes);
    check('W2', 'population', 'poppler reads the source: 498.09 once, 40,392.44 twice, ' + BEFORE_W.length + ' words', count(BEFORE_TXT, '498.09') === 1 && count(BEFORE_TXT, '40,392.44') === 2 && BEFORE_W.length > 100, { a: count(BEFORE_TXT, '498.09'), b: count(BEFORE_TXT, '40,392.44'), words: BEFORE_W.length });
    check('W2', 'new-strings', 'poppler (pdftotext -raw) on the saved bytes holds 499.09 once and 40,393.44 once', count(T.text, '499.09') === 1 && count(T.text, '40,393.44') === 1, { a: count(T.text, '499.09'), b: count(T.text, '40,393.44') });
    check('W2', 'old-strings', 'and one FEWER of each old string: 498.09 0 times, 40,392.44 once (E28)', count(T.text, '498.09') === 0 && count(T.text, '40,392.44') === 1, { a: count(T.text, '498.09'), b: count(T.text, '40,392.44') });
    var d10 = wordIn(words, R.map.D10.box), d28 = wordIn(words, R.map.D28.box), e28 = wordIn(words, R.map.E28.box);
    check('W2', 'same-place', 'poppler (pdftotext -bbox): the word inside D10\'s box is 499.09, inside D28\'s box 40,393.44, inside E28\'s box still 40,392.44', d10.length === 1 && d10[0].w === '499.09' && d28.length === 1 && d28[0].w === '40,393.44' && e28.length === 1 && e28[0].w === '40,392.44', { d10: d10, d28: d28, e28: e28 });
  });

  await guard('W3', async function () {
    var st = struct(W.bytes), cn = contentNum(st), out = stream(st, cn), a = SRC.text.split('\n'), b = out.text.split('\n'), diff = [];
    for (var i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diff.push(i);
    check('W3', 'lines', 'the content stream keeps its ' + a.length + ' lines and exactly 2 differ (one per edit), each a TJ', a.length === b.length && diff.length === 2 && diff.every(function (i) { return / TJ$/.test(a[i]) && / TJ$/.test(b[i]); }), { before: a.length, after: b.length, diff: diff.slice(0, 6), lines: diff.slice(0, 3).map(function (i) { return [a[i], b[i]]; }) });
    var blocks = diff.map(function (i) { return a.slice(i - 2, i + 1).join('\n'); }), left = blocks.filter(function (blk) { return out.text.indexOf(blk) >= 0 || st.s.indexOf(blk) >= 0; });
    check('W3', 'old-run-gone', 'the old runs (their Tm + Tf + TJ lines, each unique in the source) occur nowhere in the saved content stream nor in the saved file', blocks.length === 2 && blocks.every(function (blk) { return / Tm\n/.test(blk) && count(SRC.text, blk) === 1; }) && left.length === 0, { blocks: blocks, left: left.length });
    var ops = function (t) { var c = {}; (t.match(/(?:^|\s)(BT|ET|Tm|Tf|TJ|Tj|Td|re|W|n|f|S|q|Q|cm|Do)(?=\s|$)/g) || []).forEach(function (k) { k = k.trim(); c[k] = (c[k] || 0) + 1; }); return c; };
    check('W3', 'operators', 'no operator was added or removed (nothing painted over, nothing hidden): the counts of BT ET Tm Tf TJ re W n f S q Q cm are the same', J(ops(SRC.text)) === J(ops(out.text)) && ops(out.text).TJ === 185, { before: ops(SRC.text), after: ops(out.text) });
    check('W3', 'one-revision', 'the saved file is ONE revision: one %%EOF, no /Prev, the same ' + ST.objs.length + ' objects (an appended revision would keep the old number)', st.eofs === 1 && !st.prev && st.objs.length === ST.objs.length, { eofs: st.eofs, prev: st.prev, objs: st.objs.length });
    say('  §PDFWR-NOTE W3 changed lines: ' + diff.map(function (i) { return J(a[i]) + ' -> ' + J(b[i]); }).join(' ; '));
  });

  await guard('W4', async function () {
    var bad = B.ok ? othersSame(R, B.R, ['D10', 'D28']) : ['not re-read'];
    check('W4', 'reader-others', 'reader map: each of the other ' + (cells.length - 2) + ' cells has the same text and the same box within ' + TOL + ' pt', bad.length === 0, bad.slice(0, 5));
    check('W4', 'reader-right-edge', 'reader map: the RIGHT edge of D10 and D28 is unchanged within ' + TOL + ' pt', B.ok && near(B.R.map.D10.box[2], R.map.D10.box[2]) && near(B.R.map.D28.box[2], R.map.D28.box[2]), { D10: [R.map.D10.box, B.R.map.D10 && B.R.map.D10.box], D28: [R.map.D28.box, B.R.map.D28 && B.R.map.D28.box] });
    var st = struct(W.bytes), cn = contentNum(st), diffObj = ST.objs.filter(function (o) { return o.num !== CN && !(st.by[o.num] && st.by[o.num].raw.toString('latin1').trimEnd() === o.raw.toString('latin1').trimEnd()); }).map(function (o) { return o.num; });
    check('W4', 'objects', 'every object but the content stream (' + (ST.objs.length - 1) + ' of ' + ST.objs.length + ') is byte-identical in the saved file', cn === CN && diffObj.length === 0, { contentObj: cn, differ: diffObj });
    // the width-changing edit: the right edge stays, the left edge moves by the font's own widths
    var tab = fontTable(ST, 'LiberationSans'), grow = (tab['1'].w + tab[','].w) / 1000 * 9, W2 = await PW.rewriteNumbers(bytes, [edit(R, 'D10', '1,498.09')]), C = W2.ok ? await reread(W2.bytes) : { ok: false, R: { sheet: {}, map: {} } };
    say('  §PDFWR-NOTE W4 width edit D10 498.09 -> 1,498.09: /W of "1" = ' + tab['1'].w + ', of "," = ' + tab[','].w + ' -> the number grows by ' + grow.toFixed(4) + ' pt at 9 pt; change=' + J(W2.changes[0] && { x0Before: W2.changes[0].x0Before, x0After: W2.changes[0].x0After, x1Before: W2.changes[0].x1Before, x1After: W2.changes[0].x1After }));
    check('W4', 'width-reader', 'reader map after 498.09 -> 1,498.09: right edge unchanged, left edge moved left by ' + grow.toFixed(2) + ' pt, both within ' + TOL + ' pt; every other cell as before', W2.ok && C.ok && C.R.sheet.D10.text === '1,498.09' && near(C.R.map.D10.box[2], R.map.D10.box[2]) && near(R.map.D10.box[0] - C.R.map.D10.box[0], grow, 0.011) && othersSame(R, C.R, ['D10']).length === 0, { ok: W2.ok, refused: W2.refused, before: R.map.D10.box, after: C.R.map.D10 && C.R.map.D10.box, others: C.ok ? othersSame(R, C.R, ['D10']).slice(0, 3) : null });
    if (!HAVE_POPPLER) { say('  §PDFWR-NOTE W4 poppler is not installed: words and pixels not judged'); return; }
    var wa = BEFORE_W, wb = pwords(W.bytes), moved = [], edge = [];
    wa.forEach(function (w, i) { var v = wb[i]; if (!v) { moved.push(w.w + ' lost'); return; } var edited = (w.w === '498.09' && v.w === '499.09') || (w.w === '40,392.44' && v.w === '40,393.44'); if (edited) { edge.push(Math.abs(w.x1 - v.x1)); if (!near(w.x1, v.x1) || !near(w.y0, v.y0) || !near(w.y1, v.y1)) moved.push(w.w + ' right edge ' + w.x1 + ' -> ' + v.x1); return; } if (v.w !== w.w || !near(w.x0, v.x0) || !near(w.x1, v.x1) || !near(w.y0, v.y0) || !near(w.y1, v.y1)) moved.push(w.w + '@' + w.x0 + ',' + w.y0 + ' -> ' + v.w + '@' + v.x0 + ',' + v.y0); });
    check('W4', 'poppler-words', 'poppler: the same ' + wa.length + ' words; the ' + (wa.length - 2) + ' unedited ones have the same text and box within ' + TOL + ' pt; the 2 edited ones keep their right edge (max shift ' + (edge.length ? Math.max.apply(null, edge).toFixed(4) : '?') + ' pt)', wa.length === wb.length && edge.length === 2 && moved.length === 0, { before: wa.length, after: wb.length, edited: edge.length, moved: moved.slice(0, 5) });
    var shrink = tab['4'].w / 1000 * 9, AL = [];
    for (var al of ['left', 'center']) { var Wa = await PW.rewriteNumbers(bytes, [edit(R, 'D10', '98.09', { align: al })]), Ca = Wa.ok ? await reread(Wa.bytes) : { ok: false, R: { sheet: {}, map: {} } }, pw = Wa.ok ? pwords(Wa.bytes).filter(function (w) { return w.w === '98.09' && Math.abs(w.y0 - wordIn(wa, R.map.D10.box)[0].y0) < 1; }) : [], was = wordIn(wa, R.map.D10.box)[0], mb = Ca.R.map.D10 ? Ca.R.map.D10.box : [0, 0, 0, 0], ob = R.map.D10.box;
      AL.push({ al: al, ok: Wa.ok, refused: Wa.refused, reader: [ob[0], ob[2], mb[0], mb[2]], poppler: pw[0] && [was.x0, was.x1, pw[0].x0, pw[0].x1],
        good: Wa.ok && Wa.changes[0].align === al && Ca.ok && Ca.R.sheet.D10.text === '98.09' && pw.length === 1 && othersSame(R, Ca.R, ['D10']).length === 0 && (al === 'left' ? near(mb[0], ob[0]) && near(ob[2] - mb[2], shrink, 0.011) && near(pw[0].x0, was.x0) && near(was.x1 - pw[0].x1, shrink) : near((mb[0] + mb[2]) / 2, (ob[0] + ob[2]) / 2, 0.011) && near(ob[2] - mb[2], shrink / 2, 0.011) && near((pw[0].x0 + pw[0].x1) / 2, (was.x0 + was.x1) / 2) && near(was.x1 - pw[0].x1, shrink / 2)) }); }
    check('W4', 'align-left-centre', 'the same cell with align left / centre (498.09 -> 98.09, ' + shrink.toFixed(2) + ' pt narrower by the /W of "4"): left keeps the LEFT edge and pulls the right edge in by ' + shrink.toFixed(2) + ' pt; centre keeps the MIDDLE and pulls each edge in by ' + (shrink / 2).toFixed(2) + ' pt, in both readers within ' + TOL + ' pt', AL.length === 2 && AL.every(function (x) { return x.good; }), AL);
    var w0 = wordIn(wa, R.map.D10.box)[0], w1 = W2.ok ? pwords(W2.bytes).filter(function (w) { return w.w === '1,498.09'; }) : [];
    check('W4', 'width-poppler', 'poppler after 498.09 -> 1,498.09: the word\'s xMax is unchanged and its xMin moved left by ' + grow.toFixed(2) + ' pt, both within ' + TOL + ' pt', !!w0 && w1.length === 1 && near(w1[0].x1, w0.x1) && near(w0.x0 - w1[0].x0, grow), { before: w0, after: w1 });
    var ra = raster(bytes), rb = raster(W.bytes);
    if (!ra || !rb) { say('  §PDFWR-NOTE W4 pdftoppm gave no image: pixels not judged'); return; }
    var k = 100 / 72, boxes = ['D10', 'D28'].map(function (a) { var m = R.map[a].box; return [Math.floor(m[0] * k) - 2, Math.floor(m[1] * k) - 2, Math.ceil(m[2] * k) + 2, Math.ceil(m[3] * k) + 2]; }), inside = 0, outside = 0;
    for (var y = 0; y < ra.h; y++) for (var x = 0; x < ra.w; x++) { var i = y * ra.w + x; if (ra.px[i] === rb.px[i]) continue; if (boxes.some(function (q) { return x >= q[0] && x <= q[2] && y >= q[1] && y <= q[3]; })) inside++; else outside++; }
    say('  §PDFWR-RASTER renderer=pdftoppm dpi=100 size=' + ra.w + 'x' + ra.h + ' pixelsChangedInsideEditedBoxes=' + inside + ' outside=' + outside);
    check('W4', 'pixels', 'rendered by poppler (grey, 100 dpi, ' + ra.w + 'x' + ra.h + '): 0 pixels differ outside the two edited boxes, more than 0 inside (the edit is on the page, nothing else is)', ra.w === rb.w && ra.h === rb.h && outside === 0 && inside > 0, { inside: inside, outside: outside });
  });

  await guard('W5', async function () {
    var W1 = await PW.rewriteNumbers(bytes, [edit(R, 'D10', '499.09')]), C = W1.ok ? await reread(W1.bytes) : { R: { verdict: 'NOT-WRITTEN', reason: J(W1.refused), sheet: {} } };
    check('W5', 'stale-total', 'only D10 rewritten (the total left as printed): the re-read verdict is DOES_NOT_ADD_UP, naming D28 and both numbers (40392.44, 40393.44)', W1.ok && C.R.verdict === 'DOES_NOT_ADD_UP' && /D28/.test(C.R.reason) && /40392\.44/.test(C.R.reason) && /40393\.44/.test(C.R.reason), { ok: W1.ok, verdict: C.R.verdict, reason: C.R.reason });
    check('W5', 'no-formula', 'and the total that no longer agrees carries no SUM formula', !!C.R.sheet.D28 && !C.R.sheet.D28.f, C.R.sheet.D28);
    say('  §PDFWR-NOTE W5 re-read: verdict=' + C.R.verdict + ' reason="' + C.R.reason + '"');
  });

  await guard('W6', async function () {
    var empty = R.map.D26.box.slice(); empty[1] += 12.75; empty[3] += 12.75;   // row 27 is the source's blank row
    var T = [
      { key: 'not-a-number', what: 'a non-number new text ("abc")', edits: [edit(R, 'D10', 'abc')], want: 'not-a-number' },
      { key: 'half-number', what: 'a half-number new text ("12a.5")', edits: [edit(R, 'D10', '12a.5')], want: 'not-a-number' },
      { key: 'text-cell', what: 'a text cell (B10 "' + R.sheet.B10.text + '")', edits: [edit(R, 'B10', '5.00')], want: 'not-a-number' },
      { key: 'old-text', what: 'an old text that is not what is in the box (D10 said to hold 111.11)', edits: [edit(R, 'D10', '499.09', { oldText: '111.11' })], want: 'old-text-not-in-box' },
      { key: 'empty-box', what: 'a box with no text (the blank row 27 under D26)', edits: [{ cell: 'D27', page: 1, box: empty, oldText: '1.00', newText: '2.00' }], want: 'no-text-in-box' },
      { key: 'glyph-missing', what: 'a glyph the bold subset lacks (D28 -> 40,395.44)', edits: [edit(R, 'D28', '40,395.44')], want: 'glyph-missing', also: function (r) { return r.refused[0].font === 'LiberationSans-Bold' && r.refused[0].missing === '5' && /"5"/.test(r.refused[0].message); } },
      { key: 'does-not-fit', what: 'a number too wide for its cell (D10 -> 999,999,999,999,999.99)', edits: [edit(R, 'D10', '999,999,999,999,999.99')], want: 'does-not-fit' },
      { key: 'duplicate', what: 'two edits on one box (D10 twice)', edits: [edit(R, 'D10', '499.09'), edit(R, 'D10', '500.09')], want: 'duplicate-edit' },
      { key: 'no-page', what: 'a page the file does not have (page 7)', edits: [edit(R, 'D10', '499.09', { page: 7 })], want: 'no-such-page' },
      { key: 'batch', what: 'one bad edit in a batch of two (D10 good, D28 -> 40,395.44 bad): the WHOLE batch', edits: [edit(R, 'D10', '499.09'), edit(R, 'D28', '40,395.44')], want: 'glyph-missing' }
    ];
    for (var t of T) {
      var r = await PW.rewriteNumbers(bytes, t.edits), names = r.refused.map(function (x) { return x.reason; });
      check('W6', t.key, t.what + ' is REFUSED as ' + t.want + ': ok=false, no change, the input bytes handed back unchanged', r.ok === false && names.indexOf(t.want) >= 0 && r.changes.length === 0 && r.bytes === bytes && same(r.bytes, new Uint8Array(fs.readFileSync(PDF))) && (!t.also || t.also(r)), { ok: r.ok, refused: r.refused, changes: r.changes.length, sameBytes: r.bytes === bytes });
      say('    ' + lastLog(/^§PDF_WRITE-REFUSED/));
    }
    var np = await PW.rewriteNumbers(new Uint8Array(Buffer.from('these are my notes, not a PDF')), [edit(R, 'D10', '499.09')]);
    check('W6', 'not-a-pdf', 'a file that is not a PDF is REFUSED as not-a-pdf', np.ok === false && np.refused[0].reason === 'not-a-pdf', np.refused);
    if (HAVE_GS) {
      var locked = path.join(TMP, 'locked.pdf'), g = cp.spawnSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-sOwnerPassword=o', '-sUserPassword=u', '-sOutputFile=' + locked, PDF], { encoding: 'utf8' });
      if (g.status === 0 && fs.existsSync(locked)) { var lb = new Uint8Array(fs.readFileSync(locked)), lr = await PW.rewriteNumbers(lb, [edit(R, 'D10', '499.09')]); check('W6', 'encrypted', 'a password-protected copy (made here by ghostscript) is REFUSED by name (encrypted, or xref-stream), bytes unchanged', lr.ok === false && /^(encrypted|xref-stream)$/.test(lr.refused[0].reason) && lr.bytes === lb, lr.refused); say('    ' + lastLog(/^§PDF_WRITE-REFUSED/)); }
    } else say('  §PDFWR-NOTE W6 ghostscript is not installed: the encrypted copy was not judged');
  });

  await guard('W7', async function () {
    var n0 = CAP.length, S = await PW.rewriteNumbers(bytes, [edit(R, 'D28', '40,395.44')], { substitute: true }), line = CAP.slice(n0).filter(function (l) { return /^§PDFED-FONT-SUB/.test(l); })[0] || null, C = S.ok ? await reread(S.bytes) : { ok: false, R: { sheet: {}, map: {} } }, ch = S.changes[0] || {};
    say('  ' + line);
    check('W7', 'applied', 'with substitute: D28 -> 40,395.44 is written; the change carries fontSub { from LiberationSans-Bold, to LiberationSans, missing "5" }', S.ok && !!ch.fontSub && ch.fontSub.from === 'LiberationSans-Bold' && ch.fontSub.to === 'LiberationSans' && ch.fontSub.missing === '5', { ok: S.ok, refused: S.refused, fontSub: ch.fontSub });
    check('W7', 'stated', 'and it is said out loud: a §PDFED-FONT-SUB line names from, to and the missing digit', !!line && /from=LiberationSans-Bold/.test(line) && /to=LiberationSans /.test(line) && /missing="5"/.test(line) && /stated=true/.test(line), line);
    check('W7', 'reader', 'the re-read gives D28 = 40,395.44, right edge unchanged within ' + TOL + ' pt, every other cell (E28 in bold beside it) as before', C.ok && C.R.sheet.D28.text === '40,395.44' && near(C.R.map.D28.box[2], R.map.D28.box[2]) && othersSame(R, C.R, ['D28']).length === 0, { d28: C.R.sheet.D28, box: C.R.map.D28 && C.R.map.D28.box, was: R.map.D28.box, others: C.ok ? othersSame(R, C.R, ['D28']).slice(0, 3) : null });
    if (!HAVE_POPPLER) { say('  §PDFWR-NOTE W7 poppler is not installed: not judged there'); return; }
    var wb = S.ok ? pwords(S.bytes) : [], d28 = wordIn(wb, R.map.D28.box)[0], was = wordIn(BEFORE_W, R.map.D28.box)[0], e0 = wordIn(BEFORE_W, R.map.E28.box)[0], e1 = wordIn(wb, R.map.E28.box)[0];
    check('W7', 'poppler', 'poppler reads 40,395.44 in D28 with the same xMax; E28 (bold) has the same text and box: the bold font is back after the run', !!d28 && d28.w === '40,395.44' && near(d28.x1, was.x1) && !!e1 && e1.w === '40,392.44' && near(e1.x0, e0.x0) && near(e1.x1, e0.x1), { d28: d28, was: was, e28: e1, e28was: e0 });
    var fonts = cp.spawnSync('pdffonts', [tmpFile(S.bytes)], { encoding: 'utf8' }).stdout || '';
    check('W7', 'no-new-font', 'no font was added to the file: pdffonts lists the same 4 embedded subsets', (fonts.match(/\+/g) || []).length === 4, fonts);
  });

  await guard('W8', async function () {
    var snap = RR.toSnapshot(R), hist = [], g = await H.record(hist, null, snap, 'report-reader', '2026-11-27T01:00:00Z'); hist.push(g.entry);
    var rec = await PW.record(H, hist, snap, W.changes, 'clerk', '2026-11-27T02:00:00Z'), ops = rec.entry ? rec.entry.payload.ops : []; if (rec.entry) hist.push(rec.entry);
    check('W8', 'one-entry', 'the rewrite is ONE journal entry (seq 2) with one CELL_SET per applied change: Report!D10 498.09 -> 499.09 and Report!D28 40392.44 -> 40393.44', rec.verdict === 'RECORDED' && rec.entry.seq === 2 && ops.length === 2 && ops.every(function (o) { return o.op_type === 'CELL_SET' && o.sheet === 'Report'; }) && ops[0].cell === 'D10' && ops[0].before.v === 498.09 && ops[0].after.v === 499.09 && ops[1].cell === 'D28' && ops[1].before.v === 40392.44 && ops[1].after.v === 40393.44, ops);
    check('W8', 'typed-over', 'the total typed over a found SUM is flagged typedOverFormula (S9 rule H7); the plain cell D10 is not', ops.length === 2 && ops[1].typedOverFormula === true && !ops[0].typedOverFormula && ops[1].before.f === 'SUM(D6:D26)', ops);
    var v = K.verifyJournal([g.line, rec.line].join('\n'));
    check('W8', 'kernel-verify', 'the kernel\'s own verifyJournal accepts genesis + the rewrite entry (no second log format)', v.ok === true && v.entries === 2, v);
    var asof = H.asOf(hist, 2).Report || {}, off = B.ok ? Object.keys(B.R.sheet).filter(function (a) { return !asof[a] || asof[a].v !== B.R.sheet[a].v; }) : ['not re-read'];
    check('W8', 'replay-equals-file', 'the history replayed to its last entry holds the same VALUE as the re-read PDF at every one of the ' + cells.length + ' addresses', off.length === 0 && Object.keys(asof).length === cells.length, off.slice(0, 6));
    var bad = await PW.rewriteNumbers(bytes, [edit(R, 'D28', '40,395.44')]), none = await PW.record(H, hist, rec.snapshot, bad.changes, 'clerk', '2026-11-27T03:00:00Z');
    check('W8', 'refused-records-nothing', 'a refused rewrite (0 changes) records nothing: NO-OP, no entry', bad.ok === false && none.verdict === 'NO-OP' && none.entry === null && hist.length === 2, { ok: bad.ok, verdict: none.verdict });
  });

  await guard('W9', async function () {
    var st = struct(W.bytes), off = st.objs.filter(function (o) { return !new RegExp('^' + o.num + ' 0 obj').test(o.head); }).map(function (o) { return o.num + '@' + o.off + ' "' + o.head.slice(0, 10) + '"'; });
    check('W9', 'xref-exact', 'every one of the ' + st.objs.length + ' cross-reference entries points at its "N 0 obj"; the table lists ' + st.entries + ' entries as the source does', st.objs.length === ST.objs.length && off.length === 0 && st.entries === ST.entries && st.s.slice(st.xrefOff, st.xrefOff + 4) === 'xref', off.slice(0, 5));
    var out = stream(st, contentNum(st));
    check('W9', 'length-exact', '/Length of the rewritten stream (' + out.length + ') equals the bytes between stream and endstream (' + out.raw.length + ')', out.length === out.raw.length, { length: out.length, real: out.raw.length });
    say('§PDFWR-COST edits=2 bytesIn=' + bytes.length + ' bytesOut=' + W.bytes.length + ' delta=' + (W.bytes.length - bytes.length) + ' contentBytesIn=' + SRC.raw.length + ' contentBytesOut=' + out.raw.length + ' rewriteMs=' + ms + ' heapDeltaKB=' + heapKB + ' heapMB=' + Math.round(process.memoryUsage().heapUsed / 1048576));
    check('W9', 'cost', 'the cost line carries the size delta and a time', ms >= 0 && W.bytes.length > 0, ms);
    if (!HAVE_POPPLER) { say('  §PDFWR-NOTE W9 poppler is not installed: not judged there'); return; }
    var a = pinfo(bytes), b = pinfo(W.bytes), t = ptext(W.bytes);
    check('W9', 'pdfinfo', 'poppler pdfinfo opens the saved file: exit 0, no message, ' + a.pages + ' page as the source; pdftotext prints no message either', b.status === 0 && b.err === '' && b.pages === a.pages && a.pages === 1 && t.status === 0 && t.err === '', { info: b, textErr: t.err });
  });

  await guard('W10', async function () {
    if (!HAVE_POPPLER) { say('  §PDFWR-NOTE W10 poppler is not installed: the variants cannot be checked equal first, nothing judged'); return; }
    // (a) the same file, content stream Flate-compressed by node zlib
    var fl = variant(bytes, function (t) { return { data: zlib.deflateSync(Buffer.from(t, 'latin1')), flate: true }; }), stf = struct(fl), okv = ptext(fl), Af = await reread(fl);
    check('W10', 'flate-copy', 'the compressed copy (made here: content ' + SRC.raw.length + ' -> ' + stream(stf, contentNum(stf)).raw.length + ' bytes, FlateDecode) reads the same in poppler as the source and ADDS_UP in our reader', stream(stf, contentNum(stf)).flate && okv.err === '' && okv.text === BEFORE_TXT && Af.ok && Af.R.verdict === 'ADDS_UP', { err: okv.err, same: okv.text === BEFORE_TXT, verdict: Af.R.verdict });
    var Wf = await PW.rewriteNumbers(fl, [edit(Af.R, 'D10', '499.09'), edit(Af.R, 'D28', '40,393.44')]), Bf = Wf.ok ? await reread(Wf.bytes) : { ok: false, R: { sheet: {}, map: {} } };
    var sto = Wf.ok ? struct(Wf.bytes) : null, outf = sto ? stream(sto, contentNum(sto)) : { flate: false, text: '', dict: '' }, tf = Wf.ok ? ptext(Wf.bytes) : { text: '', err: 'not written' };
    check('W10', 'flate-round-trip', 'the edit round-trips on it: re-read D10 = 499.09, D28 = 40,393.44, the sum agrees and the stale row F10 is named, the other cells as before; poppler reads the new strings and no 498.09', Wf.ok && Bf.ok && Bf.R.sheet.D10.text === '499.09' && Bf.R.sheet.D28.text === '40,393.44' && Bf.R.verdict === 'DOES_NOT_ADD_UP' && /F10/.test(Bf.R.reason) && othersSame(Af.R, Bf.R, ['D10', 'D28']).length === 0 && count(tf.text, '499.09') === 1 && count(tf.text, '40,393.44') === 1 && count(tf.text, '498.09') === 0 && tf.err === '', { ok: Wf.ok, refused: Wf.refused, verdict: Bf.R.verdict, err: tf.err });
    var la = SRC.text.split('\n'), lb = outf.text.split('\n'), nd = 0; for (var i = 0; i < la.length; i++) if (la[i] !== lb[i]) nd++;
    check('W10', 'flate-kept', 'the saved stream is still FlateDecode, inflates with node zlib (not the engine), /Length exact, and differs from the source text in exactly 2 lines', outf.flate && outf.length === outf.raw.length && la.length === lb.length && nd === 2, { flate: outf.flate, length: outf.length, real: outf.raw && outf.raw.length, lines: [la.length, lb.length], differ: nd });
    // (b) D10 drawn as two runs: "49" then "8.09"
    var tab = fontTable(ST, 'LiberationSans'), whole = '[<' + hexOf(tab, '498.09') + '> 0] TJ', two = '[<' + hexOf(tab, '49') + '>] TJ\n[<' + hexOf(tab, '8.09') + '> 0] TJ';
    var sp = variant(bytes, function (t) { return { data: Buffer.from(t.replace(whole, two), 'latin1'), flate: false }; }), oks = ptext(sp), As = await reread(sp), runs = (await PW.listRuns(sp, 1)).filter(function (r) { return r.text === '49' || r.text === '8.09'; });
    check('W10', 'split-copy', 'the split copy (made here: D10\'s one TJ, unique in the source, cut into "49" and "8.09") reads the same in poppler as the source; the writer sees the two runs', count(SRC.text, whole) === 1 && oks.err === '' && oks.text === BEFORE_TXT && As.ok && As.R.sheet.D10.text === '498.09' && runs.length === 2, { unique: count(SRC.text, whole), err: oks.err, same: oks.text === BEFORE_TXT, d10: As.R.sheet.D10, runs: runs.length });
    var Ws = await PW.rewriteNumbers(sp, [edit(As.R, 'D10', '1,498.09')]), Bs = Ws.ok ? await reread(Ws.bytes) : { ok: false, R: { sheet: {}, map: {} } }, ts = Ws.ok ? ptext(Ws.bytes) : { text: '', err: 'not written' }, w0 = wordIn(BEFORE_W, R.map.D10.box)[0], w1 = Ws.ok ? pwords(Ws.bytes).filter(function (w) { return w.w === '1,498.09'; }) : [];
    check('W10', 'split-round-trip', 'a number in TWO runs is one cell: 498.09 -> 1,498.09 applied (runs=2), re-read 1,498.09 with the right edge kept and every other cell as before; poppler reads 1,498.09 once, same xMax, and its text has no error', Ws.ok && Ws.changes[0].runs === 2 && Bs.ok && Bs.R.sheet.D10.text === '1,498.09' && near(Bs.R.map.D10.box[2], As.R.map.D10.box[2]) && othersSame(As.R, Bs.R, ['D10']).length === 0 && count(ts.text, '1,498.09') === 1 && ts.err === '' && w1.length === 1 && near(w1[0].x1, w0.x1), { ok: Ws.ok, refused: Ws.refused, change: Ws.changes[0], d10: Bs.R.sheet.D10, box: Bs.R.map.D10, words: w1, was: w0 });
  });

  await guard('W11', async function () {
    if (!HAVE_GS || !HAVE_POPPLER) { say('  §PDFWR-NOTE W11 ghostscript or poppler is not installed: nothing judged'); return; }
    var f = path.join(TMP, 'gs.pdf'), g = cp.spawnSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4', '-sOutputFile=' + f, PDF], { encoding: 'utf8' });
    if (g.status !== 0 || !fs.existsSync(f)) { say('  §PDFWR-NOTE W11 ghostscript made no copy: nothing judged'); return; }
    var gb = new Uint8Array(fs.readFileSync(f)), Ag = await reread(gb), stg = struct(gb), cg = stream(stg, contentNum(stg)), runs = await PW.listRuns(gb, 1);
    say('  §PDFWR-NOTE W11 ghostscript copy: bytes=' + gb.length + ' objects=' + stg.objs.length + ' content flate=' + cg.flate + ' ' + cg.raw.length + ' bytes, Tj=' + count(cg.text, 'Tj') + ' TJ=' + count(cg.text, 'TJ') + ' Td=' + count(cg.text, ' Td') + ' runs=' + runs.length + ' (the source: 185 TJ, 0 Tj, 0 Td, hex strings; here literal strings, Tj and Td)');
    check('W11', 'copy', 'the ghostscript re-distilled copy (other operators, literal strings, compressed, /Length by reference) reads 144 cells and ADDS_UP in our reader', Ag.ok && Ag.R.verdict === 'ADDS_UP' && Object.keys(Ag.R.sheet).length === 144 && Ag.R.sheet.D10.text === '498.09', { verdict: Ag.R.verdict, cells: Object.keys(Ag.R.sheet).length });
    var Wg = await PW.rewriteNumbers(gb, [edit(Ag.R, 'D10', '499.09'), edit(Ag.R, 'D28', '40,393.44')]);
    say('  ' + lastLog(/^§PDF_WRITE ok=/));
    if (!Wg.ok) { check('W11', 'refused-by-name', 'the edit is REFUSED by name and the bytes are unchanged (never a silent wrong write)', Wg.refused.length > 0 && Wg.refused.every(function (r) { return !!r.reason; }) && Wg.bytes === gb, Wg.refused); say('  §PDFWR-NOTE W11 outcome=REFUSED ' + J(Wg.refused.map(function (r) { return r.reason; }))); return; }
    var Bg = await reread(Wg.bytes), tg = ptext(Wg.bytes), wa = pwords(gb), wb = pwords(Wg.bytes), moved = [], edited = 0, info = pinfo(Wg.bytes);
    wa.forEach(function (w, i) { var v = wb[i] || {}, ed = (w.w === '498.09' && v.w === '499.09') || (w.w === '40,392.44' && v.w === '40,393.44'); if (ed) edited++; if ((!ed && v.w !== w.w) || (!ed && !near(w.x0, v.x0)) || !near(w.x1, v.x1) || !near(w.y0, v.y0) || !near(w.y1, v.y1)) moved.push(w.w + ' -> ' + v.w); });
    check('W11', 'round-trip', 'the edit round-trips on it: re-read D10 = 499.09, D28 = 40,393.44, the stale row F10 named, the other cells as before', Bg.ok && Bg.R.sheet.D10.text === '499.09' && Bg.R.sheet.D28.text === '40,393.44' && Bg.R.verdict === 'DOES_NOT_ADD_UP' && /F10/.test(Bg.R.reason) && othersSame(Ag.R, Bg.R, ['D10', 'D28']).length === 0, { verdict: Bg.R.verdict, d10: Bg.R.sheet.D10, d28: Bg.R.sheet.D28, others: Bg.ok ? othersSame(Ag.R, Bg.R, ['D10', 'D28']).slice(0, 3) : null });
    check('W11', 'poppler', 'poppler: 499.09 once, 40,393.44 once, 498.09 gone, 40,392.44 once; the same ' + wa.length + ' words, 2 edited with their right edge kept, none moved; pdfinfo and pdftotext print no message', count(tg.text, '499.09') === 1 && count(tg.text, '40,393.44') === 1 && count(tg.text, '498.09') === 0 && count(tg.text, '40,392.44') === 1 && wa.length === wb.length && edited === 2 && moved.length === 0 && info.status === 0 && info.err === '' && tg.err === '', { counts: [count(tg.text, '499.09'), count(tg.text, '40,393.44'), count(tg.text, '498.09'), count(tg.text, '40,392.44')], words: [wa.length, wb.length], edited: edited, moved: moved.slice(0, 5), info: info, err: tg.err });
    say('  §PDFWR-NOTE W11 outcome=ROUND-TRIP bytesIn=' + gb.length + ' bytesOut=' + Wg.bytes.length);
  });

  await guard('W12', async function () {
    var SETS = [['D10 only', [edit(R, 'D10', '499.09')]], ['D10 + D28', E2], ['the consistent four', [edit(R, 'D10', '500.09'), edit(R, 'F10', '1,020.16'), edit(R, 'D28', '40,394.44'), edit(R, 'F28', '2.00')]]];
    for (var s of SETS) {
      var ap = PW.applyToItems(A.doc.items, s[1]), sheetV = RR.read(ap.pages), w = await PW.rewriteNumbers(bytes, s[1]), pdfV = w.ok ? (await reread(w.bytes)).R : { verdict: 'NOT-WRITTEN', reason: '' };
      check('W12', 'agree-' + s[0].replace(/\W+/g, '-'), s[0] + ': the edited SHEET (the reader\'s own rule on the edited input) and the re-read rewritten PDF give the same verdict and reason (' + pdfV.verdict + ')', ap.ok && w.ok && sheetV.verdict === pdfV.verdict && sheetV.reason === pdfV.reason && s[1].every(function (e) { return sheetV.sheet[e.cell].text === e.newText; }), { sheet: [sheetV.verdict, sheetV.reason], pdf: [pdfV.verdict, pdfV.reason] });
    }
    check('W12', 'source-untouched', 'applyToItems does not change the items it was given (D10 still reads 498.09 there)', A.doc.items[0].filter(function (i) { return i.s === '498.09'; }).length === 1 && A.doc.items[0].filter(function (i) { return i.s === '499.09'; }).length === 0, null);
    var col = function (c) { return cells.filter(function (a) { return a.replace(/\d+/, '') === c && R.sheet[a].t === 'n'; }).map(function (a) { return R.sheet[a].text; }); }, D = col('D'), F = col('F');
    var f = [PW.formatLike(D, '40393.44'), PW.formatLike(F, '-1466.15'), PW.formatLike(D, '0'), PW.formatLike(D, '499.091'), PW.formatLike(D, 'abc'), PW.formatLike(D, '1498.9'), PW.formatLike(F, '(5)')];
    var aD = PW.alignOf(R, 'D10'), fake = function (boxes) { var r = { sheet: {}, map: {} }; boxes.forEach(function (b, i) { r.sheet['A' + (i + 1)] = { t: 'n' }; r.map['A' + (i + 1)] = { box: [b[0], 0, b[1], 10] }; }); return r; };
    var aC = PW.alignOf(fake([[10, 30], [5, 35], [15, 25]]), 'A1'), aL = PW.alignOf(fake([[10, 30], [10, 40], [10, 22]]), 'A1'), aT = PW.alignOf(fake([[10, 30], [10, 30]]), 'A1');
    check('W12', 'align-of', 'alignOf reads the column from the source map: column D = right, decided (all ' + aD.cells + ' number cells share the right edge, fewer share the left or the centre); boxes sharing a centre = center; sharing a left edge = left; boxes of one width = right with decided:false (no evidence)', aD.align === 'right' && aD.decided === true && aD.right === aD.cells && aD.cells > 20 && aD.left < aD.right && aD.centre < aD.right && aC.align === 'center' && aC.decided && aL.align === 'left' && aL.decided && aT.align === 'right' && aT.decided === false, { D: aD, centre: aC, left: aL, tie: aT });
    check('W12', 'format-like', 'formatLike reads the column: 40393.44 -> "40,393.44", -1466.15 -> "(1,466.15)" (column F prints brackets), 0 -> "-" (column D prints a dash), 1498.9 -> "1,498.90", (5) -> "(5.00)"; 499.091 is refused too-many-decimals and abc not-a-number', F.some(function (x) { return x[0] === '('; }) && D.indexOf('-') >= 0 && f[0].text === '40,393.44' && f[1].text === '(1,466.15)' && f[2].text === '-' && f[3].ok === false && f[3].reason === 'too-many-decimals' && f[4].ok === false && f[4].reason === 'not-a-number' && f[5].text === '1,498.90' && f[6].text === '(5.00)', f);
  });

  await guard('W13', async function () {
    var files = JSON.parse(fs.readFileSync(path.join(PDFD, 'corpus/manifest.json'), 'utf8')).files.map(function (f) { return f.file; }), tot = { files: 0, cells: 0, ok: 0, refused: 0, okSub: 0, wrong: 0 }, reasons = {}, wrong = [], sq = function (t) { return String(t).replace(/\s+/g, ''); };
    var judge = async function (w, Rp, a, nw, p) {   // our reader, then poppler
      var d2 = await PO.open(pdfjs, w.bytes); if (!d2.ok) return 'did not re-open';
      var R2 = RR.read(d2.items, { page: p }); if (!R2.sheet[a] || R2.sheet[a].text !== nw) return 're-read ' + J(R2.sheet[a] && R2.sheet[a].text);
      if (!near(R2.map[a].box[2], Rp.map[a].box[2])) return 'right edge ' + Rp.map[a].box[2] + ' -> ' + R2.map[a].box[2];
      var oth = othersSame(Rp, R2, [a]); if (oth.length || Object.keys(R2.sheet).length !== Object.keys(Rp.sheet).length) return 'other cells changed: ' + oth.slice(0, 2).join(' | ');
      if (HAVE_POPPLER) { var got = wordIn(pwords(w.bytes, p), R2.map[a].box).sort(function (x, y) { return x.x0 - y.x0; }).map(function (x) { return x.w; }).join(''); if (sq(got) !== sq(nw)) return 'poppler reads ' + J(got) + ' in the box'; }
      return null;
    };
    for (var name of files) {
      var fb = new Uint8Array(fs.readFileSync(path.join(PDFD, 'corpus', name))), d = await PO.open(pdfjs, fb), per = { cells: 0, ok: 0, okSub: 0, refused: {}, wrong: 0 };
      if (!d.ok) { say('  §PDFWR-NOTE W13 ' + name + ' did not open: ' + d.named); continue; }
      for (var p = 1; p <= d.pages; p++) {
        var Rp = RR.read(d.items, { page: p }), nums = Object.keys(Rp.sheet).filter(function (a) { return Rp.sheet[a].t === 'n'; });
        for (var a of nums) {
          per.cells++; var old = Rp.sheet[a].text, m = /\d(?=\D*$)/.exec(old), nw = m ? old.slice(0, m.index) + ((Number(m[0]) + 1) % 10) + old.slice(m.index + 1) : '0.00', e = { cell: a, page: p, box: Rp.map[a].box, oldText: old, newText: nw }, w = await PW.rewriteNumbers(fb, [e]), why;
          if (w.ok) { why = await judge(w, Rp, a, nw, p); if (why) { per.wrong++; wrong.push(name + ' p' + p + ' ' + a + ' "' + old + '"->"' + nw + '": ' + why); } else per.ok++; continue; }
          var rs = w.refused[0] && w.refused[0].reason;
          if (!rs || w.bytes !== fb || w.changes.length) { per.wrong++; wrong.push(name + ' p' + p + ' ' + a + ': refused without a name, or the bytes changed'); continue; }
          per.refused[rs] = (per.refused[rs] || 0) + 1; reasons[rs] = reasons[rs] || { n: 0, eg: name + ' ' + a + ' "' + old + '"->"' + nw + '": ' + w.refused[0].message }; reasons[rs].n++;
          var ws = await PW.rewriteNumbers(fb, [e], { substitute: true });
          if (ws.ok) { why = await judge(ws, Rp, a, nw, p); if (why) { per.wrong++; wrong.push(name + ' p' + p + ' ' + a + ' (substituted): ' + why); } else per.okSub++; }
        }
      }
      var nref = Object.keys(per.refused).reduce(function (n, k) { return n + per.refused[k]; }, 0); if (per.cells) tot.files++; tot.cells += per.cells; tot.ok += per.ok; tot.okSub += per.okSub; tot.refused += nref; tot.wrong += per.wrong;
      say('§PDFWR-SWEEP file=' + name + ' pages=' + d.pages + ' numberCells=' + per.cells + ' roundTrip=' + per.ok + ' refused=' + nref + ' ' + J(per.refused) + ' ofThoseRoundTripWithSubstitute=' + per.okSub + ' wrong=' + per.wrong);
    }
    say('§PDFWR-SWEEP total corpusFiles=' + files.length + ' filesWithNumbers=' + tot.files + ' numberCells=' + tot.cells + ' roundTrip=' + tot.ok + ' refused=' + tot.refused + ' ofThoseRoundTripWithSubstitute=' + tot.okSub + ' wrong=' + tot.wrong + ' poppler=' + HAVE_POPPLER);
    Object.keys(reasons).forEach(function (k) { say('  §PDFWR-NOTE W13 refused reason=' + k + ' n=' + reasons[k].n + ' e.g. ' + reasons[k].eg); });
    if (!tot.cells) { say('  §PDFWR-NOTE W13 the corpus holds no number cell: nothing judged'); return; }
    check('W13', 'population', 'the corpus gives number cells to judge: ' + tot.cells + ' cells in ' + tot.files + ' of ' + files.length + ' PDFs (100 or more)', tot.cells >= 100 && tot.files >= 5, tot);
    check('W13', 'no-wrong-write', 'every one of the ' + tot.cells + ' edits either round-trips in both readers (' + tot.ok + ') or is refused by name with the bytes unchanged (' + tot.refused + '): 0 wrong writes', tot.wrong === 0 && tot.ok + tot.refused === tot.cells && tot.ok > 0, wrong.slice(0, 6));
    check('W13', 'with-substitute', 'of the ' + tot.refused + ' refused, ' + tot.okSub + ' round-trip once a stated substitution is allowed; the rest stay refused by name (0 wrong)', tot.wrong === 0 && tot.okSub <= tot.refused, tot);
  });

  // W14 REVIEW (SHEET_FRONT_DOOR §20.3): the four inputs the corpus does not hold, built here (no binary in git). An invalid fixture judges nothing: poppler must open each.
  await guard('W14', async function () {
    var mk = function (objs) {
      var out = '%PDF-1.4\n', off = {}, ns = Object.keys(objs).map(Number).sort(function (a, b) { return a - b; });
      ns.forEach(function (n) { off[n] = out.length; var o = objs[n]; out += n + ' 0 obj\n' + (typeof o === 'string' ? o : '<< /Length ' + o.stream.length + ' >>\nstream\n' + o.stream + '\nendstream') + '\nendobj\n'; });
      var size = ns[ns.length - 1] + 1, x = out.length; out += 'xref\n0 ' + size + '\n0000000000 65535 f \n';
      for (var n = 1; n < size; n++) out += ('0000000000' + (off[n] || 0)).slice(-10) + (off[n] ? ' 00000 n \n' : ' 00000 f \n');
      return new Uint8Array(Buffer.from(out + 'trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n', 'latin1'));
    };
    var HELV = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', PAGE = function (c) { return '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents ' + c + ' 0 R >>'; };
    var one = function (content, font, extra) { return mk(Object.assign({ 1: '<< /Type /Catalog /Pages 2 0 R >>', 2: '<< /Type /Pages /Kids [10 0 R] /Count 1 >>', 4: font || HELV, 5: { stream: content }, 10: PAGE(5) }, extra || {})); };
    var valid = function (key, b, pages) { if (!HAVE_POPPLER) { say('  §PDFWR-NOTE W14 poppler absent: fixture ' + key + ' not checked by an independent reader'); return true; } var i = pinfo(b); check('W14', key + '-fixture', 'poppler opens the ' + key + ' fixture made here: exit 0, ' + pages + ' page(s)', i.status === 0 && i.pages === pages, i); return i.status === 0 && i.pages === pages; };
    var live = async function (b) { return (await PW.listRuns(b, 1)); }, ed = function (r, o, n) { return { page: 1, cell: 'X1', box: [r.x0, r.y - 0.3, r.x1, r.y + 0.3], oldText: o, newText: n, align: 'left' }; };
    // plain words (SHEET_FRONT_DOOR P7): no message the page can show carries build jargon; judged on every string of the shipped files, comment lines left out
    var jar = []; ['pdf_write.js', 'edit_layer.js', 'pdf_history.js', 'pdf_open.js', 'index.html'].forEach(function (fn) { fs.readFileSync(path.join(PDFD, fn), 'utf8').split('\n').forEach(function (l, i) { if (/^\s*(\/\/|\*|<!--)/.test(l)) return; var m = l.replace(/\/\*.*?\*\//g, '').replace(/\s\/\/ .*$/, '').match(/'[^']*(slice [A-Z]\b|in this cut|phase P\d)[^']*'/); if (m) jar.push(fn + ':' + (i + 1) + ' ' + m[0].slice(0, 60)); }); });
    check('W14', 'plain-words', 'no on-screen message of the PDF page says "slice B", "in this cut" or "phase P7" (' + jar.length + ' found)', jar.length === 0, jar.slice(0, 5));
    // invisible: a mode-3 run (the hidden text of a scan) beside a drawn one
    var bi = one('BT /F1 12 Tf 100 700 Td (visible 55.00) Tj 3 Tr 0 -20 Td (123.00) Tj ET');
    if (valid('invisible', bi, 1)) {
      var ri = await live(bi), hid = ri.filter(function (r) { return r.text === '123.00'; })[0], vis = ri.filter(function (r) { return r.text === 'visible 55.00'; })[0];
      var wi = await PW.rewriteText(bi, [ed(hid, '123.00', '999.00')], { substitute: true }), wv = await PW.rewriteText(bi, [ed(vis, 'visible 55.00', 'visible 56.00')], { substitute: true });
      check('W14', 'invisible-locked', 'text of render mode 3 is locked "invisible-text" for the page and refused by the same name by the writer, bytes unchanged; the drawn run beside it stays writable and is written',
        !!hid && hid.lock === 'invisible-text' && !wi.ok && wi.refused[0].reason === 'invisible-text' && same(wi.bytes, bi) && !!vis && vis.lock === null && wv.ok && (!HAVE_POPPLER || /visible 56\.00/.test(ptext(wv.bytes).text)), { hid: hid && hid.lock, refused: wi.refused, vis: vis && vis.lock, wv: wv.ok });
    }
    // subset: a one-byte WinAnsi font whose /Widths hold '.', 0, 1, 2, 3, 5 only (4 is in range at width 0, 7 is beyond LastChar)
    var FS = '<< /Type /Font /Subtype /TrueType /BaseFont /ABCDEF+Arial /Encoding /WinAnsiEncoding /FirstChar 46 /LastChar 53 /Widths [278 0 556 556 556 556 0 556] /FontDescriptor 6 0 R >>';
    var bs = one('BT /F1 12 Tf 100 700 Td (123.00) Tj ET', FS, { 6: '<< /Type /FontDescriptor /FontName /ABCDEF+Arial /Flags 32 /ItalicAngle 0 /Ascent 905 /Descent -212 /CapHeight 716 /StemV 80 /FontBBox [-665 -325 2000 1006] >>' });
    if (valid('subset', bs, 1)) {
      var rs = (await live(bs)).filter(function (r) { return r.n > 0; })[0], res = {};
      for (var nt of ['173.00', '143.00', '153.00']) { var w = await PW.rewriteText(bs, [ed(rs, '123.00', nt)], { substitute: true }), c = w.changes[0] || {}; res[nt] = { ok: w.ok, sub: c.fontSub ? c.fontSub.to : null, w0: c.x1Before - c.x0Before, w1: c.x1After - c.x0After, refused: w.refused[0] && w.refused[0].reason }; }
      var wide = 6.672 * 5 + 3.336;   // Helvetica at 12 pt: five digits of 556 and one period of 278 (Adobe AFM)
      check('W14', 'subset-missing-substituted', 'a digit the subset does not hold ("7" beyond LastChar, "4" at width 0) is written in a standard font, stated, at that font\'s width (' + wide.toFixed(2) + ' pt, not a glyph narrower)',
        ['173.00', '143.00'].every(function (k) { return res[k].ok && res[k].sub === 'Helvetica' && near(res[k].w1, wide, 0.02); }), res);
      check('W14', 'subset-carried-kept', 'a digit the subset holds ("5") is written in the font itself, no substitution, same width as before', res['153.00'].ok && res['153.00'].sub === null && near(res['153.00'].w1, res['153.00'].w0, 0.02), res['153.00']);
    }
    // shared: two pages on one content stream - what the page is offered must be what the writer writes
    var bsh = mk({ 1: '<< /Type /Catalog /Pages 2 0 R >>', 2: '<< /Type /Pages /Kids [10 0 R 11 0 R] /Count 2 >>', 4: HELV, 5: { stream: 'BT /F1 12 Tf 100 700 Td (123.00) Tj ET' }, 10: PAGE(5), 11: PAGE(5) });
    if (valid('shared', bsh, 2)) {
      var rsh = await live(bsh), wsh = await PW.rewriteText(bsh, [{ page: 1, cell: 'X1', box: [99, 141.7, 140, 142.3], oldText: '123.00', newText: '124.00', align: 'left' }], { substitute: true });
      check('W14', 'shared-offered-equals-writable', 'a page that shares its content stream: listRuns offers no run and names pageLock "shared-content"; the writer refuses by the same name',
        rsh.filter(function (r) { return !r.lock; }).length === 0 && !!rsh.pageLock && rsh.pageLock.reason === 'shared-content' && !wsh.ok && wsh.refused[0].reason === 'shared-content', { offered: rsh.length, pageLock: rsh.pageLock || null, refused: wsh.refused });
    }
    // reopen: 40 pages, one edit on page 7 - one page read, and every page equal to a full fresh open of the new bytes
    var N = 40, o4 = { 1: '<< /Type /Catalog /Pages 2 0 R >>', 4: HELV }, kids = [];
    for (var p = 0; p < N; p++) { o4[100 + 2 * p] = PAGE(101 + 2 * p); o4[101 + 2 * p] = { stream: 'BT /F1 10 Tf 1 0 0 1 60 700 Tm (Page ' + (p + 1) + ' account) Tj 1 0 0 1 420 700 Tm (' + (1000 + p) + '.00) Tj ET' }; kids.push((100 + 2 * p) + ' 0 R'); }
    o4[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + N + ' >>';
    var b4 = mk(o4);
    if (valid('reopen', b4, N)) {
      var prev = await PO.open(pdfjs, b4), r7 = (await PW.listRuns(b4, 7)).filter(function (r) { return r.text === '1006.00'; })[0];
      var w4 = await PW.rewriteText(b4, [{ page: 7, cell: 'X1', box: [r7.x0, r7.y - 0.3, r7.x1, r7.y + 0.3], oldText: '1006.00', newText: '1007.50', align: 'right' }], { substitute: true });
      var re = await PO.reopen(pdfjs, w4.bytes, prev, 7), fresh = await PO.open(pdfjs, w4.bytes), diff = [];
      for (var q = 0; q < N; q++) if (re.text[q] !== fresh.text[q] || J(re.items[q]) !== J(fresh.items[q])) diff.push(q + 1);
      say('  §PDFWR-NOTE W14 reopen pages=' + N + ' pagesRead=' + re.pagesRead + ' pagesDifferentFromFreshOpen=' + J(diff) + ' page7="' + String(re.text[6]).replace(/\s+/g, ' ') + '"');
      check('W14', 'reopen-one-page', 'after an edit on page 7 of ' + N + ' the reopen reads 1 page, and the text and runs of ALL ' + N + ' pages equal a full fresh open of the new bytes; page 7 shows 1007.50',
        w4.ok && re.ok && re.pagesRead === 1 && re.textDone === true && diff.length === 0 && /1007\.50/.test(re.text[6]) && !/1006\.00/.test(re.text[6]), { ok: w4.ok, pagesRead: re.pagesRead, diff: diff, p7: re.text[6] });
      var other = await PO.reopen(pdfjs, w4.bytes, { ok: true, textDone: true, pages: N - 1, text: [], items: [] }, 7);
      check('W14', 'reopen-falls-back', 'a previous reading with another page count is not carried: every page is read (' + N + ')', other.ok && other.pagesRead === N && other.text[6] === fresh.text[6], { pagesRead: other.pagesRead });
    }
  });

  if (process.env.PDFWR_MUTANTS === '1' && !MUTANT) {
    var src = fs.readFileSync(ENGINE, 'utf8').replace('require(\'./report_reader.js\')', 'require(' + J(path.join(PDFD, 'report_reader.js')) + ')'), killed = 0;
    var MUT = [
      { name: 'M1-old-run-kept', kills: 'W3', from: '/*MUT-KEEP*/', to: 'keep = latin1(S.bytes, sp.s, sp.e) + \'\\n\';' },
      { name: 'M2-right-edge-not-kept', kills: 'W4', from: '/*MUT-EDGE*/ -start * 1000 / unit', to: '0' },
      { name: 'M3-box-ignored-last-run-with-that-text', kills: 'W1', from: '/*MUT-BOX*/ inThis(r)', to: '(r.text === oldText && r === runs.filter(function (q) { return q.text === oldText; }).pop())' },
      { name: 'M4-missing-glyph-not-refused', kills: 'W6', from: 'missing.length /*MUT-GLYPH*/', to: 'false' },
      { name: 'M5-fit-not-checked', kills: 'W6', from: '/*MUT-FIT*/', to: 'skipFit = true;' },
      { name: 'M6-xref-offsets-not-updated', kills: 'W9', from: '/*MUT-XREF*/ pos', to: 'x.off' },
      { name: 'M7-invisible-text-offered', kills: 'W14', from: 'var hidden = r.mode === 3 || r.mode === 7; /*MUT-TR*/', to: 'var hidden = false;' },
      { name: 'M8-widths-not-read', kills: 'W14', from: 'var anyWidth = false; /*MUT-WIDTHS*/', to: 'var anyWidth = true;' },
      { name: 'M9-page-lock-not-told', kills: 'W14', from: 'out.pageLock = P.lock; /*MUT-PAGELOCK*/', to: 'out.pageLock = null;' },
      { name: 'M10-edited-page-carried', kills: 'W14', open: true, from: '/*MUT-CARRY*/ await r.readPage(page);', to: 'r.text[page - 1] = prev.text[page - 1]; r.items[page - 1] = prev.items[page - 1];' }
    ];
    var srcOpen = fs.readFileSync(path.join(PDFD, 'pdf_open.js'), 'utf8');
    MUT.forEach(function (m) {
      var src0 = src; if (m.open) src = srcOpen;   // a mutant of pdf_open.js (PDFWR_OPEN) instead of the engine
      var n = src.split(m.from).length - 1;
      if (n !== 1) { src = src0; say('§PDFWR-MUTANT name=' + m.name + ' NOT-APPLIED matches=' + n); return; }
      var f = path.join(TMP, 'mut_' + m.name + '.js'); fs.writeFileSync(f, src.replace(m.from, m.to));
      var out = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, m.open ? { PDFWR_OPEN: f } : { PDFWR_ENGINE: f }, { PDFWR_MUTANT: m.name, PDFWR_MUTANTS: '' }), encoding: 'utf8', maxBuffer: 1 << 26 }).stdout || '';
      var line = (out.split('\n').filter(function (l) { return l.indexOf('§PDFWR-' + m.kills + ' verdict=') === 0; })[0] || 'no verdict line (crash)'), fails = out.split('\n').filter(function (l) { return l.indexOf('§PDFWR-CHECK case=' + m.kills + ' ') >= 0 && / FAIL /.test(l); }).map(function (l) { return /key=(\S+)/.exec(l)[1]; });
      var k = /verdict=FAIL/.test(line) && fails.length > 0 && fails.indexOf('crash') < 0;
      src = src0; if (k) killed++; say('§PDFWR-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + (k ? 'KILLED' : 'SURVIVED') + ' failedChecks=' + fails.join(',') + ' child="' + line + '"');
    });
    say('§PDFWR-MUTANTS killed=' + killed + '/' + MUT.length); ALL.judged++; if (killed !== MUT.length) ALL.failed++;
  }
  var NAMES = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12', 'W13', 'W14'], none = NAMES.filter(function (c) { return !CASES[c] || !CASES[c].judged; });
  fs.rmSync(TMP, { recursive: true, force: true });
  say('§PDFWR-VERDICT ' + (ALL.failed ? 'FAIL' : none.length ? 'INCONCLUSIVE' : 'PASS') + ' judged=' + ALL.judged + ' failed=' + ALL.failed + (none.length ? ' notJudged=' + none.join(',') : '') + (MUTANT ? ' mutant=' + MUTANT : ''));
  process.exit(ALL.failed ? 1 : none.length ? 2 : 0);
})().catch(function (e) { say('§PDFWR-VERDICT FAIL crash ' + (e && e.stack || e)); process.exit(3); });
