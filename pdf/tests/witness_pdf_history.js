#!/usr/bin/env node
// ⚠ DO NOT REMOVE - W-PDF-HISTORY (bim-compiler prompts/PDF_EDITOR.md §4.5: the edit history travels INSIDE the PDF and the .xlsx). READ THE LOG after every run; the exit code is not evidence.
// THE ISSUE THIS PROVES OR DISPROVES: until now the history lived in the page's memory and was lost on download. A file must carry its own
//   tamper-evident memory, and a history that verifies but belongs to OTHER numbers must not lend them its proof.
//   H1  TRAVELS         from the SAVED bytes alone the history is found, line for line, and both verifiers accept it        -> history lost on download
//   H2  CONTINUES       a second session appends entry N+1 chained to N; the file holds ONE attachment                      -> chain restarted; attachments pile up
//   H3  INDEPENDENT     poppler pdfdetach lists and extracts it; pdfinfo clean; text and word boxes as without it          -> only our reader sees it; something visible changed
//   H4  UNTOUCHED       history-only save: content streams and every object but the name-tree holder byte-identical           -> a history-only save rewrites the page
//   H5  TAMPERED        a value changed in the carried history, an entry removed: named at that entry; not continued         -> a rewritten history is built upon
//   H6  CHANGED OUTSIDE a number rewritten without recording: the binding names the cell                                   -> history and numbers drift apart unseen
//   H7  OTHER FILE      another file's (verifying) history pasted in: refused as not this file's                           -> a pasted history lends its proof
//   H8  NO HISTORY      a plain PDF opens exactly as before; a history-carrying one opens in P0's terms                    -> false "tampered"; opens worse
//   H9  XLSX            the hidden sheet _door_history, read by host_shim.js's OWN reader, verifies                        -> the Excel menu cannot read it
//   H10 COST            bytes per entry and for genesis, as lines and inside the PDF                                       -> unmeasured weight
//   H11 TWO PAGES       a ghostscript two-page copy: one chain, two sheets, both pages bound                               -> one generator only; page 2 lost
//   H12 REFUSED         not a PDF, encrypted, bad name: named, bytes unchanged                                             -> a damaged file written anyway
// Independent readers: poppler pdfdetach / pdfinfo / pdftotext / pdftoppm, node zlib, the kernel's verifyJournal, this file's own xref reading.
// Command: node pdf/tests/witness_pdf_history.js     (PDFHIST_MUTANTS=1 adds the mutant sweep: each mutant must turn its named case FAIL; a crash is not a kill)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), zlib = require('zlib');
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ROOT = path.join(__dirname, '..', '..'), PDFD = path.join(ROOT, 'pdf'), ERP = path.join(ROOT, 'erp'), MUTANT = process.env.PDFHIST_MUTANT || '';
var ENG = { history: process.env.PDFHIST_E_HISTORY || path.join(PDFD, 'pdf_history.js'), write: process.env.PDFHIST_E_WRITE || path.join(PDFD, 'pdf_write.js'), open: process.env.PDFHIST_E_OPEN || path.join(PDFD, 'pdf_open.js') };
var CAP = [], say = function (s) { process.stdout.write(s + '\n'); };
console.log = function () { CAP.push(Array.prototype.join.call(arguments, ' ')); }; console.warn = function () {};   // the engines' own §-lines are kept in CAP and echoed where they are evidence
var pdfjs = require(path.join(ROOT, 'modeller/lib/pdfjs/pdf.min.js')); pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'modeller/lib/pdfjs/pdf.worker.min.js');
var PO = require(ENG.open), RR = require(path.join(PDFD, 'report_reader.js')), PW = require(ENG.write), PH = require(ENG.history), H = require(path.join(ERP, 'sheet_history.js')), K = require(path.join(ERP, 'ws_kernel.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js')), SA = require(path.join(ERP, 'sheet_addin/host_shim.js'));
var CASES = {}, ALL = { judged: 0, failed: 0 }, TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfhist_')), seq = 0, AT = '2026-11-27T00:00:00.000Z', ZERO = new Array(65).join('0');
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §PDFHIST-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§PDFHIST-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
async function guard(cs, fn) { try { await fn(); } catch (e) { check(cs, 'crash', 'the case runs', false, String(e && e.stack || e).slice(0, 400)); } verdict(cs); }
function lastLog(re) { for (var i = CAP.length - 1; i >= 0; i--) if (re.test(CAP[i])) return CAP[i]; return null; }
function same(a, b) { return !!a && !!b && a.length === b.length && Buffer.from(a.buffer, a.byteOffset, a.length).equals(Buffer.from(b.buffer, b.byteOffset, b.length)); }
function count(text, s) { return text.split(s).length - 1; }
function corpus(f) { return new Uint8Array(fs.readFileSync(path.join(PDFD, 'corpus', f))); }

// ── a SESSION: what the page does with a file, from its bytes alone (open -> check -> adopt; read a page; edit a number; save) ──
async function session(bytes) {
  var doc = await PO.open(pdfjs, bytes), c = doc.ok ? await PH.check(H, RR, doc.history, doc.items) : { state: 'not-open' }, ad = PH.adopt(c, (doc.ok && doc.history) || []);
  return { bytes: bytes, doc: doc, check: c, history: ad.history, lines: ad.lines, snap: ad.snap, brk: ad.brk };
}
async function readPage(S, p) {   // "Read as sheet": the page's sheet joins the history unless the carried history already holds it
  var R = RR.read(S.doc.items, { page: p });
  if (!(S.snap && S.snap[PH.sheetOf(p)])) { var g = await PH.start(H, RR, S.history, S.snap, R, p, S.brk, 'report-reader', AT); if (g.entry) { S.history.push(g.entry); S.lines.push(g.line); S.snap = g.snapshot; S.brk = null; } }
  return R;
}
async function editCell(S, p, cell, newText, recorded) {   // a number typed over; recorded === false = "changed by other means" (the writer, no history entry)
  var R = RR.read(S.doc.items, { page: p }), W = await PW.rewriteNumbers(S.bytes, [{ cell: cell, page: p, box: R.map[cell].box, oldText: R.sheet[cell].text, newText: newText }], { substitute: true });
  if (!W.ok) throw new Error('edit ' + cell + ' refused: ' + J(W.refused));
  S.bytes = W.bytes; S.doc = await PO.open(pdfjs, W.bytes);
  if (recorded !== false) { var rec = await PW.record(H, S.history, S.snap, W.changes, 'you', AT, PH.sheetOf(p)); if (rec.entry) { S.history.push(rec.entry); S.lines.push(rec.line); S.snap = rec.snapshot; } }
  return W;
}
async function saveS(S) { return (await PH.save(PW, S.bytes, S.lines)).bytes; }
function both(lines) { var k; try { k = K.verifyJournal(lines.join('\n')); } catch (e) { k = { ok: false, why: String(e) }; } return H.verify(lines).then(function (v) { return { sheet: v, kernel: k, ok: v.ok === true && k.ok === true && v.entries === lines.length && k.entries === lines.length }; }); }
function ops(line) { try { return JSON.parse(line).payload.ops; } catch (e) { return []; } }

// ── independent readers: poppler ──
function tmpFile(bytes, ext) { var f = path.join(TMP, 'f' + (++seq) + (ext || '.pdf')); fs.writeFileSync(f, bytes); return f; }
var HAVE_POPPLER = !cp.spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).error, HAVE_DETACH = !cp.spawnSync('pdfdetach', ['-v'], { encoding: 'utf8' }).error, HAVE_GS = !cp.spawnSync('gs', ['--version'], { encoding: 'utf8' }).error;
function ptext(bytes) { return cp.spawnSync('pdftotext', ['-raw', tmpFile(bytes), '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout || ''; }
function pbbox(bytes) { return (cp.spawnSync('pdftotext', ['-bbox', tmpFile(bytes), '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout || '').split('\n').filter(function (l) { return /<word /.test(l); }); }
function pinfo(bytes) { var o = cp.spawnSync('pdfinfo', [tmpFile(bytes)], { encoding: 'utf8' }); return { status: o.status, err: (o.stderr || '').trim(), pages: Number((/Pages:\s+(\d+)/.exec(o.stdout || '') || [])[1]), version: (/PDF version:\s+(\S+)/.exec(o.stdout || '') || [])[1] }; }
function detach(bytes) {   // poppler's own view of the attachments: the listed names, and the saved bytes of ours
  var f = tmpFile(bytes), l = cp.spawnSync('pdfdetach', ['-list', f], { encoding: 'utf8' }), names = (l.stdout || '').split('\n').map(function (x) { return (/^\s*\d+:\s+(.*)$/.exec(x) || [])[1]; }).filter(Boolean), o = f + '.att', data = null;
  if (names.indexOf(PH.NAME) >= 0) { var s = cp.spawnSync('pdfdetach', ['-save', String(names.indexOf(PH.NAME) + 1), '-o', o, f], { encoding: 'utf8' }); if (s.status === 0 && fs.existsSync(o)) data = new Uint8Array(fs.readFileSync(o)); }
  return { names: names, data: data, err: (l.stderr || '').trim() };
}
function raster(bytes) {
  var f = tmpFile(bytes), o = cp.spawnSync('pdftoppm', ['-r', '100', '-gray', '-f', '1', '-l', '1', f, f], { encoding: 'utf8' }), pgm = fs.readdirSync(TMP).filter(function (n) { return n.indexOf(path.basename(f) + '-') === 0 && /\.pgm$/.test(n); })[0];
  if (o.status !== 0 || !pgm) return null; var b = fs.readFileSync(path.join(TMP, pgm)), m = /^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(b.subarray(0, 40).toString('latin1')); if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]), px: b.subarray(m[0].length) };
}
// ── independent readers: this file's own view of the PDF (classic xref, object slices), never the engine's ──
function struct(bytes) {
  var b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length), s = b.toString('latin1'), sx = s.lastIndexOf('startxref'), xo = Number(/startxref\s+(\d+)/.exec(s.slice(sx))[1]), tr = s.indexOf('trailer', xo);
  var head = /^xref\s+(\d+)\s+(\d+)\s+/.exec(s.slice(xo, xo + 40)), ents = s.slice(xo + head[0].length, tr).match(/\d{10} \d{5} [nf]/g) || [], objs = [];
  ents.forEach(function (e, i) { if (e[17] === 'n') objs.push({ num: Number(head[1]) + i, off: Number(e.slice(0, 10)) }); });
  objs.sort(function (a, c) { return a.off - c.off; }); objs.forEach(function (o, i) { o.end = i + 1 < objs.length ? objs[i + 1].off : xo; o.raw = b.subarray(o.off, o.end); o.text = o.raw.toString('latin1'); });
  var by = {}; objs.forEach(function (o) { by[o.num] = o; });
  return { b: b, s: s, xrefOff: xo, entries: ents.length, objs: objs, by: by, trailer: s.slice(tr, sx), eofs: count(s, '%%EOF'), prev: /\/Prev\b/.test(s.slice(tr, sx)) };
}
function streamOf(o) { var t = o.text, k = t.indexOf('stream'), p = k + 6; if (t[p] === '\r') p++; if (t[p] === '\n') p++; var e = t.lastIndexOf('endstream'); if (t[e - 1] === '\n') e--; if (t[e - 1] === '\r') e--; return { dict: t.slice(0, k), raw: o.raw.subarray(p, e) }; }
// the carried history changed "inside the PDF" by this witness (its own deflate, its own xref), never by the engine
function swapAttachment(bytes, lines) {
  var st = struct(bytes), ef = st.objs.filter(function (o) { return /\/Type\s*\/EmbeddedFile\b/.test(o.text); })[0]; if (!ef) return null;
  var raw = Buffer.from(lines.map(function (l) { return l + '\n'; }).join(''), 'utf8'), z = zlib.deflateSync(raw), parts = [st.b.subarray(0, st.objs[0].off)], pos = st.objs[0].off, at = {};
  st.objs.forEach(function (o) { var piece = o === ef ? Buffer.concat([Buffer.from(o.num + ' 0 obj\n<< /Type /EmbeddedFile /Filter /FlateDecode /Length ' + z.length + ' /Params << /Size ' + raw.length + ' >> >>\nstream\n', 'latin1'), z, Buffer.from('\nendstream\nendobj\n', 'latin1')]) : o.raw; at[o.num] = pos; parts.push(piece); pos += piece.length; });
  var x = 'xref\n0 ' + st.entries + '\n'; for (var i = 0; i < st.entries; i++) x += at[i] != null ? ('0000000000' + at[i]).slice(-10) + ' 00000 n \n' : '0000000000 65535 f \n';
  parts.push(Buffer.from(x + st.trailer + 'startxref\n' + pos + '\n%%EOF\n', 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}
// the .xlsx as a spreadsheet host would hand it to the Excel menu: hidden sheets as rows of strings (host_shim.js's host interface)
function xlsxHost(wb) { return { getHidden: async function (name) { var ws = wb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).map(function (r) { return r.map(String); }) : []; }, setHidden: async function () {}, selectedCell: async function () { return { sheet: 'Report', cell: 'A1' }; }, visibleSheets: async function () { return []; }, readSheetValues: async function () { return {}; }, userName: async function () { return 'witness'; } }; }

(async function () {
  var TB = corpus('trial_balance_th.pdf'), SR = corpus('sales_register_th.pdf');
  say('§PDFHIST-LOAD mutant=' + (MUTANT || 'none') + ' engines=' + Object.keys(ENG).map(function (k) { return k + ':' + path.basename(ENG[k]); }).join(',') + ' pdf=trial_balance_th.pdf bytes=' + TB.length + ' poppler=' + HAVE_POPPLER + ' pdfdetach=' + HAVE_DETACH + ' gs=' + HAVE_GS + ' nameInOpener=' + PO.HISTORY + ' nameInHistory=' + PH.NAME);
  // the fixture every case starts from: session 1 = read page 1, D10 498.09 -> 499.09, D28 40,392.44 -> 40,393.44, save
  var S1, SAVED1, PLAIN1;
  try { S1 = await session(TB); await readPage(S1, 1); await editCell(S1, 1, 'D10', '499.09'); await editCell(S1, 1, 'D28', '40,393.44'); PLAIN1 = S1.bytes; SAVED1 = await saveS(S1); }
  catch (e) { say('§PDFHIST-VERDICT INCONCLUSIVE the fixture could not be built: ' + String(e && e.message || e)); process.exit(2); }
  var LINES1 = S1.lines.slice(); say('  ' + lastLog(/^§PDFHIST-SAVE/)); say('  ' + lastLog(/^§PDF_EMBED/));

  await guard('H1', async function () {
    var doc = await PO.open(pdfjs, SAVED1), got = (doc.ok && doc.history) || [], v = await both(got), c = await PH.check(H, RR, doc.history, doc.items), R = doc.ok ? RR.read(doc.items, { page: 1 }) : { sheet: {} };
    check('H1', 'found', 'from the saved bytes alone (a fresh open): the opener returns the history, ' + LINES1.length + ' lines, each equal to the recorded line', doc.ok && got.length === 3 && LINES1.length === 3 && got.every(function (l, i) { return l === LINES1[i]; }), { ok: doc.ok, lines: got.length, recorded: LINES1.length });
    check('H1', 'both-verifiers', 'SheetHistory.verify AND the kernel\'s ws_kernel.verifyJournal accept the lines read back from the file (3 entries each)', v.ok && got.length === 3, v);
    check('H1', 'cells-as-recorded', 'entry 1 is the genesis (144 cells); entry 2 holds ONE CELL_SET D10 498.09 -> 499.09, entry 3 ONE CELL_SET D28 40392.44 -> 40393.44', ops(got[0]).length === 144 && J(ops(got[1]).map(function (o) { return [o.sheet, o.cell, o.before.v, o.after.v]; })) === J([['Report', 'D10', 498.09, 499.09]]) && J(ops(got[2]).map(function (o) { return [o.sheet, o.cell, o.before.v, o.after.v]; })) === J([['Report', 'D28', 40392.44, 40393.44]]), [ops(got[0]).length, ops(got[1]), ops(got[2])]);
    check('H1', 'bound', 'the history replayed equals what the reader reads from the saved page: state ok, 144 of 144 cells, 0 differ; the page reads D10 = 499.09, D28 = 40393.44', c.state === 'ok' && c.of === 144 && c.differ === 0 && R.sheet.D10 && R.sheet.D10.v === 499.09 && R.sheet.D28.v === 40393.44, { state: c.state, of: c.of, differ: c.differ, first: c.first });
    check('H1', 'one-name', 'the opener and the history engine name the same file (' + PH.NAME + ')', PO.HISTORY === PH.NAME && PH.NAME === '_door_history.jsonl', [PO.HISTORY, PH.NAME]);
  });

  var SAVED2 = null, LINES2 = [];
  await guard('H2', async function () {
    var S2 = await session(SAVED1), n0 = S2.lines.length; await readPage(S2, 1); var nRead = S2.lines.length; await editCell(S2, 1, 'F10', '1,019.16'); SAVED2 = await saveS(S2); LINES2 = S2.lines.slice();
    var e3 = LINES2[2] ? JSON.parse(LINES2[2]) : {}, e4 = LINES2[3] ? JSON.parse(LINES2[3]) : {}, v = await both(LINES2), doc = await PO.open(pdfjs, SAVED2), got = (doc.ok && doc.history) || [];
    check('H2', 'taken-up', 'a second session that has ONLY the saved bytes takes the carried history up (3 entries) and Read as sheet records nothing new (still 3)', S2.check.state === 'ok' && n0 === 3 && nRead === 3, { state: S2.check.state, onOpen: n0, afterRead: nRead });
    check('H2', 'appended', 'its edit (F10 1,018.16 -> 1,019.16) is entry 4: seq 4, prev = entry 3\'s hash, no second genesis; the first 3 lines are unchanged', LINES2.length === 4 && e4.seq === 4 && e4.prev === e3.hash && !e4.meta.genesis && LINES2.slice(0, 3).every(function (l, i) { return l === LINES1[i]; }) && J(ops(LINES2[3]).map(function (o) { return [o.cell, o.before.v, o.after.v]; })) === J([['F10', 1018.16, 1019.16]]), { n: LINES2.length, seq: e4.seq, chained: e4.prev === e3.hash, genesis: e4.meta && e4.meta.genesis, ops: ops(LINES2[3] || '{}') });
    check('H2', 'verifies', 'the 4 lines read back from the second save pass both verifiers and equal the session\'s lines', v.ok && got.length === 4 && got.every(function (l, i) { return l === LINES2[i]; }), { v: v, got: got.length });
    var a = struct(SAVED1), b = struct(SAVED2), efs = b.objs.filter(function (o) { return /\/Type\s*\/EmbeddedFile\b/.test(o.text); }).length, fss = b.objs.filter(function (o) { return /\/Type\s*\/Filespec\b/.test(o.text); }).length;
    check('H2', 'replaced-not-added', 'saved again the file holds ONE embedded file and ONE file specification, and as many objects as after the first save (' + a.objs.length + ')', efs === 1 && fss === 1 && b.objs.length === a.objs.length, { embedded: efs, filespecs: fss, objects: [a.objs.length, b.objs.length] });
    if (HAVE_DETACH) { var d = detach(SAVED2); check('H2', 'poppler-one', 'poppler lists exactly one attachment after the second save, holding the 4 lines', d.names.length === 1 && !!d.data && same(d.data, PH.toBytes(LINES2)), { names: d.names, bytes: d.data && d.data.length }); }
  });

  await guard('H3', async function () {
    if (!HAVE_POPPLER || !HAVE_DETACH) { say('  §PDFHIST-NOTE H3 poppler (pdfdetach / pdftotext / pdfinfo) is not installed: nothing judged'); return; }
    var d = detach(SAVED1), want = PH.toBytes(LINES1), i1 = pinfo(SAVED1), i0 = pinfo(PLAIN1);
    check('H3', 'listed', 'poppler pdfdetach -list names ' + PH.NAME + ' (1 embedded file) without a message', d.names.length === 1 && d.names[0] === PH.NAME && d.err === '', d);
    check('H3', 'extracted', 'pdfdetach -save gives ' + want.length + ' bytes equal to the recorded lines (each followed by a newline)', !!d.data && same(d.data, want), { got: d.data && d.data.length, want: want.length });
    check('H3', 'pdfinfo', 'pdfinfo: exit 0, no message, the same page count as the save without history (' + i0.pages + ')', i1.status === 0 && i1.err === '' && i1.pages === i0.pages && i1.pages === 1, { with: i1, without: i0 });
    var t1 = ptext(SAVED1), t0 = ptext(PLAIN1), w1 = pbbox(SAVED1), w0 = pbbox(PLAIN1);
    check('H3', 'text', 'pdftotext -raw of the save with history is identical to the same save without it (' + t0.length + ' characters), and holds 499.09', t1 === t0 && t0.length > 500 && count(t1, '499.09') === 1, { with: t1.length, without: t0.length });
    check('H3', 'word-boxes', 'pdftotext -bbox: every word and its box identical with and without the history (' + w0.length + ' words)', w0.length > 100 && J(w1) === J(w0), { with: w1.length, without: w0.length });
    say('  §PDFHIST-NOTE H3 pdfinfo PDF version: with history ' + i1.version + ', without ' + i0.version + ' (the header says 1.4 once /EmbeddedFiles is used)');
  });

  await guard('H4', async function () {
    var S = await session(TB); await readPage(S, 1); var one = await saveS(S), two = await saveS(S), again = (await PH.save(PW, one, S.lines)).bytes, a = struct(TB), b = struct(one);
    var changed = a.objs.filter(function (o) { return !b.by[o.num] || !o.raw.equals(b.by[o.num].raw); }).map(function (o) { return o.num; }), added = b.objs.filter(function (o) { return !a.by[o.num]; }), cn = Number(/\/Contents\s+(\d+)\s+0\s+R/.exec(a.s)[1]);
    check('H4', 'content-identical', 'history-only save of the unedited file: the page content stream (object ' + cn + ', ' + a.by[cn].raw.length + ' bytes) is byte-identical', !!b.by[cn] && a.by[cn].raw.equals(b.by[cn].raw) && one.length > TB.length, { cn: cn, grew: one.length - TB.length });
    check('H4', 'one-object-changed', 'of the ' + a.objs.length + ' original objects exactly ONE differs: the one that holds the name tree (it now names /EmbeddedFiles); the catalog itself is untouched here because /Names is its own object', changed.length === 1 && /\/EmbeddedFiles/.test(b.by[changed[0]].text) && !/\/Type\s*\/Catalog/.test(b.by[changed[0]].text), { changed: changed, text: changed.map(function (n) { return b.by[n] && b.by[n].text.slice(0, 120); }) });
    check('H4', 'two-new', 'exactly 2 objects are new: the embedded file stream and its file specification', added.length === 2 && added.filter(function (o) { return /\/Type\s*\/EmbeddedFile\b/.test(o.text); }).length === 1 && added.filter(function (o) { return /\/Type\s*\/Filespec\b/.test(o.text); }).length === 1, added.map(function (o) { return o.text.slice(0, 60); }));
    var ef = added.filter(function (o) { return /\/Type\s*\/EmbeddedFile\b/.test(o.text); })[0], so = ef ? streamOf(ef) : null, inf = so ? zlib.inflateSync(so.raw) : Buffer.alloc(0);
    check('H4', 'stream-exact', 'the embedded stream inflates (node zlib) to the lines; /Length equals the stored bytes and /Params /Size the plain bytes', !!so && same(new Uint8Array(inf), PH.toBytes(S.lines)) && Number((/\/Length\s+(\d+)/.exec(so.dict) || [])[1]) === so.raw.length && Number((/\/Size\s+(\d+)/.exec(so.dict) || [])[1]) === inf.length, so && { dict: so.dict, raw: so.raw.length, plain: inf.length });
    check('H4', 'one-revision', 'the saved file is ONE revision (one %%EOF, no /Prev) and every cross-reference entry points at its own "N G obj"', b.eofs === 1 && !b.prev && b.objs.every(function (o) { return new RegExp('^' + o.num + ' \\d+ obj').test(o.text); }), { eofs: b.eofs, prev: b.prev });
    check('H4', 'header', 'the first bytes differ only in the version: %PDF-1.3 became %PDF-1.4 (/EmbeddedFiles is PDF 1.4)', a.s.slice(0, 8) === '%PDF-1.3' && b.s.slice(0, 8) === '%PDF-1.4' && a.b.subarray(8, a.objs[0].off).equals(b.b.subarray(8, b.objs[0].off)), [a.s.slice(0, 8), b.s.slice(0, 8)]);
    check('H4', 'same-in-same-out', 'the same lines saved twice give the same bytes, and saving them again INTO the saved file changes nothing', same(one, two) && same(one, again), { one: one.length, two: two.length, again: again.length });
    if (HAVE_POPPLER) { var r0 = raster(TB), r1 = raster(one), diff = -1; if (r0 && r1 && r0.w === r1.w && r0.h === r1.h) { diff = 0; for (var i = 0; i < r0.px.length; i++) if (r0.px[i] !== r1.px[i]) diff++; } say('§PDFHIST-RASTER renderer=pdftoppm dpi=100 size=' + (r0 ? r0.w + 'x' + r0.h : '?') + ' pixelsChanged=' + diff); check('H4', 'raster', 'rendered by poppler (pdftoppm, grey, 100 dpi): 0 pixels differ between the file and its history-only save', diff === 0, diff); }
    else say('  §PDFHIST-NOTE H4 poppler is not installed: the raster was not judged');
  });

  await guard('H5', async function () {
    var l2 = LINES1[1] || '', t2 = l2.replace('"before":{"v":498.09', '"before":{"v":1.09'), tam = swapAttachment(SAVED1, [LINES1[0], t2, LINES1[2]]), cut = swapAttachment(SAVED1, [LINES1[0], LINES1[2]]);
    check('H5', 'made', 'the witness changed ONE recorded value inside the PDF\'s history with its own deflate and cross-reference table (entry 2, the value before: 498.09 -> 1.09); poppler still extracts the changed lines', !!tam && t2 !== l2 && (!HAVE_DETACH || same(detach(tam).data, PH.toBytes([LINES1[0], t2, LINES1[2]]))), { changed: t2 !== l2 });
    var A = await session(tam), B = await session(cut);
    check('H5', 'named-at-entry', 'a changed value: state broken, entry 2 named, why = payload (a value the replay would never show: only the digest sees it)', A.check.state === 'broken' && A.check.brokenAt === 2 && /payload/.test(A.check.why || ''), A.check);
    check('H5', 'removed-entry', 'an entry removed (line 2 of 3): state broken, named at entry 2 (prev-hash)', B.check.state === 'broken' && B.check.brokenAt === 2 && /prev-hash/.test(B.check.why || ''), B.check);
    check('H5', 'said', 'it is said in plain words, naming the entry: "' + (A.brk || '') + '"', /entry 2 of 3 does not verify/.test(A.brk || '') && A.history.length === 0 && A.lines.length === 0, { brk: A.brk, taken: A.history.length });
    await readPage(A, 1); var g = A.lines[0] ? JSON.parse(A.lines[0]) : {}, note = (((A.snap || {})[PH.BREAK] || {}).A1 || {}).v, v = await both(A.lines);
    check('H5', 'not-continued', 'the chain is NOT continued: the next recording is a new genesis (seq 1, prev = zeros, 1 line), not entry 4', A.lines.length === 1 && g.seq === 1 && g.prev === ZERO && g.meta && g.meta.genesis === true, { n: A.lines.length, seq: g.seq });
    check('H5', 'break-recorded', 'that genesis RECORDS the break as a cell of its own (' + PH.BREAK + '!A1 names entry 2), inside the payload so the digest protects it; the new chain passes both verifiers', /entry 2 of 3/.test(note || '') && ops(A.lines[0] || '{}').some(function (o) { return o.sheet === PH.BREAK && o.cell === 'A1'; }) && v.ok, { note: note, v: v });
    await editCell(A, 1, 'F10', '1,019.16'); var back = await session(await saveS(A));
    check('H5', 'restart-holds', 'the restarted history travels too: saved and reopened it is state ok with 2 entries (the break cell is not a page cell and is not held against the page)', back.check.state === 'ok' && back.lines.length === 2 && back.check.differ === 0, { state: back.check.state, n: back.lines.length, first: back.check.first });
  });

  await guard('H6', async function () {
    var X = await session(SAVED1), R0 = RR.read(X.doc.items, { page: 1 }); await editCell(X, 1, 'D12', '15,816.66', false);   // the existing writer, NO history entry
    var Y = await session(X.bytes), v = await both((Y.doc.ok && Y.doc.history) || []), c = Y.check, f = c.first || {};
    check('H6', 'made', 'D12 was rewritten by the writer without recording (15,815.66 -> 15,816.66); the file still carries the old 3-line history, which still VERIFIES', R0.sheet.D12.text === '15,815.66' && v.ok && ((Y.doc.ok && Y.doc.history) || []).length === 3, { v: v });
    check('H6', 'cell-named', 'the binding check names the cell: state mismatch, kind changed-outside, first = D12 printed 15816.66, history 15815.66, 1 of 144 cells differ', c.state === 'mismatch' && c.kind === 'changed-outside' && f.cell === 'D12' && f.printed === 15816.66 && f.history === 15815.66 && c.differ === 1 && c.of === 144, { state: c.state, kind: c.kind, first: f, differ: c.differ, of: c.of });
    check('H6', 'said', 'in plain words: "' + (Y.brk || '') + '"', /D12 prints 15816\.66, the history says 15815\.66/.test(Y.brk || '') && /changed outside this editor/.test(Y.brk || ''), Y.brk);
    await readPage(Y, 1); var g = Y.lines[0] ? JSON.parse(Y.lines[0]) : {};
    check('H6', 'not-continued', 'the chain is not continued: nothing is taken up, the next recording is a new genesis whose break cell names D12', Y.check.state === 'mismatch' && Y.lines.length === 1 && g.seq === 1 && g.prev === ZERO && /D12/.test((((Y.snap || {})[PH.BREAK] || {}).A1 || {}).v || ''), { n: Y.lines.length, seq: g.seq, note: ((Y.snap || {})[PH.BREAK] || {}).A1 });
  });

  await guard('H7', async function () {
    var O = await session(SR); await readPage(O, 1); var v = await both(O.lines), put = await PH.save(PW, TB, O.lines), Z = await session(put.bytes), c = Z.check, f = c.first || {};
    check('H7', 'made', 'the sales register\'s own history (' + O.lines.length + ' line, ' + ops(O.lines[0] || '{}').length + ' cells, verifies) was put into the trial balance', O.lines.length === 1 && v.ok && put.ok && ((Z.doc.ok && Z.doc.history) || []).length === 1, { v: v, put: put.ok });
    check('H7', 'refused', 'it verifies, and is REFUSED as not this file\'s: state mismatch, kind other-file (the two sides do not hold the same cells), first differing cell named (' + f.cell + '), ' + c.differ + ' of ' + c.of + ' cells differ', c.state === 'mismatch' && c.kind === 'other-file' && !!f.cell && c.differ > 100 && Z.history.length === 0, { state: c.state, kind: c.kind, first: f, differ: c.differ, of: c.of });
    check('H7', 'said', 'in plain words: "' + (Z.brk || '').slice(0, 220) + '"', /another file's history/.test(Z.brk || '') && /does not match the page/.test(Z.brk || ''), Z.brk);
  });

  await guard('H8', async function () {
    var files = fs.readdirSync(path.join(PDFD, 'corpus')).filter(function (f) { return /\.pdf$/.test(f); }).sort(), plain = 0, carried = 0, bad = [], notes = [];
    for (var f of files) {
      var b = corpus(f), S = await session(b), w = PH.words(S.check, S.lines.length, true);
      if (S.doc.ok && S.doc.history === null && S.check.state === 'none' && S.brk === null && S.lines.length === 0 && !/changed|tamper|not match|not verify/i.test(w)) plain++; else bad.push({ f: f, why: 'plain', state: S.check.state, words: w });
      await readPage(S, 1); var own = S.lines.length > 0, lines = own ? S.lines : LINES1.slice(0, 1), put = await PH.save(PW, b, lines), T = await session(put.bytes);
      var okSelf = put.ok && T.doc.ok && J(T.doc.history) === J(lines) && T.doc.pages === S.doc.pages && J(T.doc.text) === J(S.doc.text) && J(T.doc.outline) === J(S.doc.outline) && J(T.doc.items) === J(S.doc.items) && (!own || T.check.state === 'ok');
      var okPop = true; if (HAVE_POPPLER) { var i1 = pinfo(put.bytes); okPop = i1.status === 0 && i1.err === '' && i1.pages === T.doc.pages && ptext(put.bytes) === ptext(b) && (!HAVE_DETACH || J(detach(put.bytes).names) === J([PH.NAME])); }
      if (okSelf && okPop) carried++; else bad.push({ f: f, why: 'carried', put: put.ok ? 'ok' : put.refused, self: okSelf, poppler: okPop, state: T.check.state });
      notes.push(f + ':pages=' + S.doc.pages + ',outline=' + S.doc.outline.length + ',history=' + (own ? 'own(' + ops(lines[0]).length + ' cells)' : 'payload-only') + ',added=' + (put.bytes.length - b.length));
    }
    say('  §PDFHIST-NOTE H8 ' + notes.join(' · '));
    check('H8', 'population', 'the corpus gives PDFs to judge: ' + files.length + ' (5 or more), one of them with pages and an outline of its own', files.length >= 5, files);
    check('H8', 'no-false-alarm', 'every corpus PDF as shipped (' + plain + ' of ' + files.length + '): history null, state none, nothing taken up, no word of tampering', plain === files.length, bad);
    check('H8', 'p0-terms', 'every corpus PDF given a history (' + carried + ' of ' + files.length + '): pages, text, outline and text items identical to the copy without it (which W-PDFED-P0 judges); poppler: pdfinfo clean with the same page count, pdftotext -raw identical, one attachment listed' + (HAVE_POPPLER ? '' : ' [poppler missing: our reader only]'), carried === files.length, bad);
  });

  await guard('H9', async function () {
    var doc = await PO.open(pdfjs, SAVED1), R = RR.read(doc.items, { page: 1 }), mk = function (limit) { var wb = RR.toWorkbook(XLSX, R); PH.toWorkbook(XLSX, wb, LINES1, SA.splitLine, limit); return XLSX.read(Buffer.from(PH.xlsxBytes(XLSX, wb)), { type: 'buffer' }); };
    var wb = mk(SA.CELL_LIMIT), idx = wb.SheetNames.indexOf(PH.SHEET), shim = SA.create(xlsxHost(wb), { SheetHistory: H }), ck = await shim.checkHistory(), st = await shim.cellHistory({ sheet: 'Report', cell: 'D10' });
    check('H9', 'one-convention', 'the hidden sheet is named as the Excel menu names it (' + SA.HISTORY + ') and is VERY hidden; the visible sheet still holds D10 = 499.09', PH.SHEET === SA.HISTORY && idx >= 0 && wb.Workbook.Sheets[idx].Hidden === 2 && wb.Sheets.Report.D10.v === 499.09, { names: wb.SheetNames, hidden: idx >= 0 && wb.Workbook.Sheets[idx].Hidden });
    check('H9', 'shim-check', 'the downloaded .xlsx read by host_shim.js\'s OWN reader: Check history says OK, 3 entries ("' + ck.text + '")', ck.verdict === 'OK' && ck.history && ck.history.entries === 3, ck);
    check('H9', 'shim-story', 'Cell history of Report!D10 through the shim: 2 values in order (genesis 498.09, then 498.09 -> 499.09 by "you")', st.verdict === 'STORY' && (st.story || []).length === 2 && st.story[0].after.v === 498.09 && st.story[1].before.v === 498.09 && st.story[1].after.v === 499.09 && st.story[1].actor === 'you', st);
    var small = mk(1000), rows = XLSX.utils.sheet_to_json(small.Sheets[PH.SHEET] || {}, { header: 1, defval: '' }), maxCell = 0, chunks = 0; rows.forEach(function (r) { r.forEach(function (c) { if (c !== '') chunks++; maxCell = Math.max(maxCell, String(c).length); }); });
    var ck2 = await SA.create(xlsxHost(small), { SheetHistory: H }).checkHistory();
    say('§PDFHIST-XLSX-CHUNKS limit=1000 rows=' + rows.length + ' chunks=' + chunks + ' longestStoredCell=' + maxCell + ' longestLine=' + Math.max.apply(null, LINES1.map(function (l) { return l.length; })) + ' realLimit=' + SA.CELL_LIMIT);
    check('H9', 'chunks', 'with a cell limit of 1,000 the ' + LINES1.length + ' lines are stored as ' + chunks + ' chunks, none over the limit; each row re-joined equals its line; the shim verifies it (OK, 3 entries)', rows.length === 3 && chunks > 3 && maxCell <= 1000 && rows.every(function (r, i) { return r.join('') === LINES1[i]; }) && ck2.verdict === 'OK' && ck2.history.entries === 3, { rows: rows.length, chunks: chunks, max: maxCell, ck: ck2.text });
    var ws = small.Sheets[PH.SHEET] || {}, bump = function (c) { var was = c.v; c.v = String(c.v).replace(/\d/, function (d) { return String((Number(d) + 1) % 10); }); return was; }, verdictOf = async function () { return (await SA.create(xlsxHost(small), { SheetHistory: H }).checkHistory()).text; };
    var t1 = '', t2 = ''; if (ws.B1 && ws.A2) { var keep = bump(ws.B1); t1 = await verdictOf(); ws.B1.v = keep; bump(ws.A2); t2 = await verdictOf(); }
    check('H9', 'tamper', 'one changed digit in a stored chunk is caught through the shim and the entry is named: in the SECOND chunk of the split genesis row -> BROKEN at entry 1; in row 2 -> BROKEN at entry 2', /history: BROKEN at entry 1 /.test(t1) && /history: BROKEN at entry 2 /.test(t2), [t1, t2]);
  });

  await guard('H10', async function () {
    var rows = [], t0 = Date.now();
    var S = await session(TB); await readPage(S, 1); var g = await saveS(S); await editCell(S, 1, 'D10', '499.09'); var plain2 = S.bytes, s2 = await saveS(S); await editCell(S, 1, 'D28', '40,393.44'); var plain3 = S.bytes, s3 = await saveS(S), ms = Date.now() - t0;
    rows.push({ file: 'trial_balance_th.pdf', cells: 144, fileBytes: TB.length, genesisLine: S.lines[0].length, genesisInPdf: g.length - TB.length, entryLines: [S.lines[1].length, S.lines[2].length], entryInPdf: [(s2.length - plain2.length) - (g.length - TB.length), (s3.length - plain3.length) - (s2.length - plain2.length)], ms: ms });
    var Q = await session(SR), Rq = await readPage(Q, 1), gq = await saveS(Q), cells = Object.keys(Rq.sheet), done = null; t0 = Date.now();
    for (var a of cells.filter(function (x) { return Rq.sheet[x].t === 'n' && /\d$/.test(Rq.sheet[x].text); })) { var t = Rq.sheet[a].text, nt = t.slice(0, -1) + ((Number(t.slice(-1)) + 1) % 10); try { await editCell(Q, 1, a, nt); done = a; break; } catch (e) { /* a refused cell (a glyph the subset lacks): the next one */ } }
    if (done) { var sq = await saveS(Q); rows.push({ file: 'sales_register_th.pdf', cells: cells.length, fileBytes: SR.length, genesisLine: Q.lines[0].length, genesisInPdf: gq.length - SR.length, entryLines: [Q.lines[1].length], entryInPdf: [(sq.length - Q.bytes.length) - (gq.length - SR.length)], ms: Date.now() - t0, cell: done }); }
    var xl = function (R, lines) { var wb = RR.toWorkbook(XLSX, R); if (lines) PH.toWorkbook(XLSX, wb, lines, SA.splitLine, SA.CELL_LIMIT); return PH.xlsxBytes(XLSX, wb).length; }, lb = function (ls) { return PH.toBytes(ls).length; };
    var Rt = RR.read(S.doc.items, { page: 1 }), xr = [{ file: 'trial_balance_th.pdf', lines: S.lines.length, lineBytes: lb(S.lines), without: xl(Rt), with: xl(Rt, S.lines) }];
    if (done) { var Rs = RR.read(Q.doc.items, { page: 1 }); xr.push({ file: 'sales_register_th.pdf', lines: Q.lines.length, lineBytes: lb(Q.lines), without: xl(Rs), with: xl(Rs, Q.lines) }); }
    xr.forEach(function (x) { say('§PDFHIST-COST-XLSX file=' + x.file + ' entries=' + x.lines + ' lineBytes=' + x.lineBytes + ' xlsxWithout=' + x.without + ' xlsxWith=' + x.with + ' added=' + (x.with - x.without) + ' compressed=true'); });
    check('H10', 'xlsx-cheaper-than-its-lines', 'in the .xlsx (written with deflate) the history adds fewer bytes than its own lines, on both files', xr.length === 2 && xr.every(function (x) { return x.with > x.without && x.with - x.without < x.lineBytes; }), xr);
    rows.forEach(function (r) { say('§PDFHIST-COST file=' + r.file + ' cells=' + r.cells + ' fileBytes=' + r.fileBytes + ' genesisLineBytes=' + r.genesisLine + ' genesisAddedToPdf=' + r.genesisInPdf + ' perCellInPdf=' + (r.genesisInPdf / r.cells).toFixed(1) + ' entryLineBytes=' + r.entryLines.join(',') + ' entryAddedToPdf=' + r.entryInPdf.join(',') + ' ms=' + r.ms + ' heapMB=' + Math.round(process.memoryUsage().heapUsed / 1048576)); });
    check('H10', 'measured', 'cost measured on 2 corpus files: the genesis and each later entry, as a line and as bytes added to the PDF (all positive, the PDF grows by less than the line: Flate)', rows.length === 2 && rows.every(function (r) { return r.genesisInPdf > 0 && r.genesisInPdf < r.genesisLine && r.entryInPdf.every(function (x) { return x > 0; }) && r.entryLines.every(function (x) { return x > 0; }); }), rows);
  });

  await guard('H11', async function () {
    if (!HAVE_GS) { say('  §PDFHIST-NOTE H11 ghostscript is not installed: nothing judged'); return; }
    var src = tmpFile(TB), out = path.join(TMP, 'two.pdf'), o = cp.spawnSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-o', out, src, src], { encoding: 'utf8' });
    if (o.status !== 0 || !fs.existsSync(out)) { say('  §PDFHIST-NOTE H11 ghostscript did not make the two-page copy: nothing judged'); return; }
    var two = new Uint8Array(fs.readFileSync(out)), S = await session(two), st = struct(two), cat = st.objs.filter(function (x) { return /\/Type\s*\/Catalog/.test(x.text); })[0];
    say('  §PDFHIST-NOTE H11 ghostscript copy: bytes=' + two.length + ' objects=' + st.objs.length + ' pages=' + S.doc.pages + ' catalogHasNames=' + /\/Names/.test(cat ? cat.text : ''));
    check('H11', 'made', 'a second writer\'s file: the trial balance on TWO pages (ghostscript), no history, a catalog WITHOUT /Names', S.doc.ok && S.doc.pages === 2 && S.check.state === 'none' && !!cat && !/\/Names/.test(cat.text), { pages: S.doc.pages, state: S.check.state });
    await readPage(S, 1); await editCell(S, 1, 'D10', '499.09'); await readPage(S, 2); await editCell(S, 2, 'D12', '15,816.66');
    var saved = await saveS(S), T = await session(saved), v = await both(T.lines), e = T.lines.map(function (l) { return JSON.parse(l); }), b = struct(saved), cat2 = b.objs.filter(function (x) { return /\/Type\s*\/Catalog/.test(x.text); })[0];
    check('H11', 'one-chain-two-sheets', 'ONE chain of 4 entries: genesis (page 1, 144 cells), D10 on Report, page 2 added as an ordinary entry (144 cells on "Report p2", not a genesis), D12 on "Report p2"', e.length === 4 && e[0].meta.genesis === true && e[0].ops === 144 && J(ops(T.lines[1]).map(function (x) { return [x.sheet, x.cell]; })) === J([['Report', 'D10']]) && !e[2].meta.genesis && e[2].ops === 144 && ops(T.lines[2]).every(function (x) { return x.sheet === 'Report p2'; }) && J(ops(T.lines[3]).map(function (x) { return [x.sheet, x.cell, x.after.v]; })) === J([['Report p2', 'D12', 15816.66]]), e.map(function (x) { return [x.seq, x.ops, !!x.meta.genesis]; }));
    check('H11', 'bound-both-pages', 'saved and reopened: both verifiers accept, state ok, pages 1 and 2 bound (288 of 288 cells, 0 differ); page 1 reads D10 = 499.09, page 2 reads D12 = 15816.66 and D10 = 498.09', v.ok && T.check.state === 'ok' && J(T.check.pages) === J([1, 2]) && T.check.of === 288 && T.check.differ === 0 && RR.read(T.doc.items, { page: 1 }).sheet.D10.v === 499.09 && RR.read(T.doc.items, { page: 2 }).sheet.D12.v === 15816.66 && RR.read(T.doc.items, { page: 2 }).sheet.D10.v === 498.09, { v: v, state: T.check.state, pages: T.check.pages, of: T.check.of, first: T.check.first });
    check('H11', 'catalog-path', 'here the CATALOG is the changed object (it gains /Names /EmbeddedFiles); the file is one revision', !!cat2 && /\/Names/.test(cat2.text) && /\/EmbeddedFiles/.test(cat2.text) && b.eofs === 1 && !b.prev, cat2 && cat2.text.slice(0, 200));
    if (HAVE_DETACH) { var d = detach(saved), i = pinfo(saved); check('H11', 'poppler', 'poppler: one attachment holding the 4 lines; pdfinfo clean, 2 pages', d.names.length === 1 && same(d.data, PH.toBytes(T.lines)) && T.lines.length === 4 && i.status === 0 && i.err === '' && i.pages === 2, { names: d.names, info: i }); }
    var X = await session(saved); await editCell(X, 2, 'D28', '40,393.44', false); var Y = await session(X.bytes), f = Y.check.first || {};
    check('H11', 'page-2-bound', 'a number changed on page 2 without recording is named with its page: state mismatch, first = D28 on page 2 ("Report p2")', Y.check.state === 'mismatch' && f.cell === 'D28' && f.page === 2 && f.sheet === 'Report p2' && /D28 on page 2/.test(Y.brk || ''), { state: Y.check.state, first: f, brk: Y.brk });
  });

  await guard('H12', async function () {
    var data = PH.toBytes(LINES1), junk = new Uint8Array(Buffer.from('hello, this is not a PDF')), r1 = await PW.embedFile(junk, PH.NAME, data), r2 = await PW.embedFile(TB, 'a/b.jsonl', data), r3 = await PW.embedFile(new Uint8Array(0), PH.NAME, data);
    check('H12', 'not-a-pdf', 'a non-PDF and an empty file: refused not-a-pdf, the input bytes handed back', !r1.ok && r1.refused[0].reason === 'not-a-pdf' && r1.bytes === junk && !r3.ok && r3.refused[0].reason === 'not-a-pdf', [r1.refused, r3.refused]);
    check('H12', 'bad-name', 'a file name with a slash: refused bad-name, bytes unchanged', !r2.ok && r2.refused[0].reason === 'bad-name' && r2.bytes === TB, r2.refused);
    if (HAVE_GS) { var src = tmpFile(TB), enc = path.join(TMP, 'enc.pdf'); cp.spawnSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-sOwnerPassword=o', '-sUserPassword=u', '-o', enc, src], { encoding: 'utf8' }); var eb = fs.existsSync(enc) ? new Uint8Array(fs.readFileSync(enc)) : null, r4 = eb ? await PW.embedFile(eb, PH.NAME, data) : null;
      if (r4) check('H12', 'encrypted', 'a password-protected copy (ghostscript): refused encrypted, bytes unchanged', !r4.ok && r4.refused[0].reason === 'encrypted' && r4.bytes === eb, r4.refused); }
    else say('  §PDFHIST-NOTE H12 ghostscript is not installed: the encrypted refusal was not judged');
  });

  if (process.env.PDFHIST_MUTANTS === '1' && !MUTANT) {
    var srcs = { history: fs.readFileSync(ENG.history, 'utf8'), open: fs.readFileSync(ENG.open, 'utf8'), write: fs.readFileSync(ENG.write, 'utf8').replace('require(\'./report_reader.js\')', 'require(' + J(path.join(PDFD, 'report_reader.js')) + ')') }, killed = 0;
    var MUT = [
      { name: 'M1-history-not-written', kills: 'H1', file: 'write', from: '/*MUT-NOEMBED*/ out = await F.build(put);', to: 'out = bytes;' },
      { name: 'M2-opener-drops-the-attachment', kills: 'H1', file: 'open', from: '/*MUT-DROP*/ out.attachments[HISTORY]', to: 'null' },
      { name: 'M3-chain-restarted-not-continued', kills: 'H2', file: 'history', from: '/*MUT-RESTART*/', to: 'go = false;' },
      { name: 'M4-attachment-added-not-replaced', kills: 'H2', file: 'write', from: 'at >= 0 /*MUT-TWICE*/', to: 'false' },
      { name: 'M5-tampered-entry-accepted', kills: 'H5', file: 'history', from: '/*MUT-ACCEPT*/ v = await SH.verify(lines);', to: '' },
      { name: 'M6-break-not-recorded', kills: 'H5', file: 'history', from: '/*MUT-NOBREAK*/ next[BREAK] = { A1: { v: brk, f: null } };', to: '' },
      { name: 'M7-binding-check-skipped', kills: 'H6', file: 'history', from: '/*MUT-NOBIND*/', to: 'skip = true;' },
      { name: 'M8-binding-check-skipped-other-file', kills: 'H7', file: 'history', from: '/*MUT-NOBIND*/', to: 'skip = true;' },
      { name: 'M9-xlsx-history-sheet-not-written', kills: 'H9', file: 'history', from: '/*MUT-NOSHEET*/', to: 'rows = [];' },
      { name: 'M10-xlsx-stored-not-compressed', kills: 'H10', file: 'history', from: 'compression: true /*MUT-STORED*/', to: 'compression: false' }
    ];
    MUT.forEach(function (m) {
      var src = srcs[m.file], n = src.split(m.from).length - 1;
      if (n !== 1) { say('§PDFHIST-MUTANT name=' + m.name + ' NOT-APPLIED matches=' + n); return; }
      var f = path.join(TMP, 'mut_' + m.name + '.js'), env = Object.assign({}, process.env, { PDFHIST_MUTANT: m.name, PDFHIST_MUTANTS: '' }); fs.writeFileSync(f, src.replace(m.from, m.to)); env['PDFHIST_E_' + m.file.toUpperCase()] = f;
      var out = cp.spawnSync(process.execPath, [__filename], { env: env, encoding: 'utf8', maxBuffer: 1 << 26 }).stdout || '';
      var line = (out.split('\n').filter(function (l) { return l.indexOf('§PDFHIST-' + m.kills + ' verdict=') === 0; })[0] || 'no verdict line (crash)'), fails = out.split('\n').filter(function (l) { return l.indexOf('§PDFHIST-CHECK case=' + m.kills + ' ') >= 0 && / FAIL /.test(l); }).map(function (l) { return /key=(\S+)/.exec(l)[1]; });
      var k = /verdict=FAIL/.test(line) && fails.length > 0 && fails.indexOf('crash') < 0;
      if (k) killed++; say('§PDFHIST-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + (k ? 'KILLED' : fails.indexOf('crash') >= 0 ? 'CRASHED' : 'SURVIVED') + ' failedChecks=' + fails.join(',') + ' child="' + line + '"');
    });
    say('§PDFHIST-MUTANTS killed=' + killed + '/' + MUT.length); ALL.judged++; if (killed !== MUT.length) ALL.failed++;
  }
  var NAMES = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'H11', 'H12'], none = NAMES.filter(function (c) { return !CASES[c] || !CASES[c].judged; });
  fs.rmSync(TMP, { recursive: true, force: true });
  say('§PDFHIST-VERDICT ' + (ALL.failed ? 'FAIL' : none.length ? 'INCONCLUSIVE' : 'PASS') + ' judged=' + ALL.judged + ' failed=' + ALL.failed + (none.length ? ' notJudged=' + none.join(',') : '') + (MUTANT ? ' mutant=' + MUTANT : ''));
  process.exit(ALL.failed ? 1 : none.length ? 2 : 0);
})().catch(function (e) { say('§PDFHIST-VERDICT FAIL crash ' + (e && e.stack || e)); process.exit(3); });
