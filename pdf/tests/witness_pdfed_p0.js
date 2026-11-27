#!/usr/bin/env node
// ⚠ DO NOT REMOVE - W-PDFED-P0, engine half (bim-compiler prompts/PDF_EDITOR.md §4.1, phase P0 VIEW). READ THE LOG after every run; the exit code is not evidence.
// THE ISSUE THIS PROVES OR DISPROVES: a PDF tool that shows a blank page, loses text or bookmarks, or says "opened" for a damaged or
//   locked file cannot be trusted with a report. Does pdf/pdf_open.js describe each corpus file exactly as an INDEPENDENT reader (poppler) does?
//   V1 PAGES    page count == pdfinfo                                                   -> pages lost
//   V2 TEXT     per page, characters read (spaces removed, NFC) == pdftotext's multiset -> text lost or garbled
//               (pdftotext -raw: its default mode REMOVES line-end hyphens, so a column of accounting dashes reads 8 of 40 there - measured 2026-11-27)
//   V3 OUTLINE  outline titles in order == pdftohtml -xml outline                       -> bookmarks lost
//   V4 BROKEN / LOCKED  cut-xref copy opens the same or is NAMED; password copy NAMED then opens; empty, non-PDF, header-only are NAMED -> a blank page for a bad file
// The page half (V5, the real page in a headless browser) is pdf/tests/witness_pdfed_page.js.
// Command: node pdf/tests/witness_pdfed_p0.js   (PDFED_MUTANTS=1 adds the mutant sweep; PDFED_EXTRA=<dir> adds every *.pdf in it to V1-V3)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..'), PDFD = path.join(ROOT, 'pdf');
var ENGINE = process.env.PDFED_ENGINE || path.join(PDFD, 'pdf_open.js'), MUTANT = process.env.PDFED_MUTANT || '';
var log0 = console.log, warn0 = console.warn; console.log = function () {}; console.warn = function () {};
var pdfjs = require(path.join(ROOT, 'modeller/lib/pdfjs/pdf.min.js')); pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'modeller/lib/pdfjs/pdf.worker.min.js');
console.log = log0; console.warn = function (m) { if (!/^Warning: /.test(String(m))) warn0(m); };   // pdf.js recovery chatter stays out; its outcome is judged below
var PO = require(ENGINE);
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function say(s) { log0(s); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §PDFED-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§PDFED-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function run(cmd, args) { var r = cp.spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 }); return r.error || r.status !== 0 ? null : r.stdout; }
function bag(s) { var m = {}; Array.from(String(s).normalize('NFC').replace(/\s+/g, '')).forEach(function (ch) { m[ch] = (m[ch] || 0) + 1; }); return m; }
function bagDiff(a, b) { var d = 0, ex = []; Object.keys(Object.assign({}, a, b)).forEach(function (k) { var n = Math.abs((a[k] || 0) - (b[k] || 0)); if (n) { d += n; if (ex.length < 6) ex.push(k + ':' + (a[k] || 0) + '/' + (b[k] || 0)); } }); return { d: d, ex: ex }; }
function un(s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, n) { return String.fromCodePoint(Number(n)); }).replace(/&amp;/g, '&'); }
var read = function (f) { return new Uint8Array(fs.readFileSync(f)); };

(async function () {
  if (!run('pdfinfo', ['-v']) && !run('pdfinfo', [path.join(PDFD, 'corpus/trial_balance_th.pdf')])) { say('§PDFED-VERDICT INCONCLUSIVE poppler (pdfinfo, pdftotext, pdftohtml) is not installed: no independent reader, nothing judged'); process.exit(2); }
  var files = ['trial_balance_th.pdf', 'market_impact_report.pdf'].map(function (f) { return path.join(PDFD, 'corpus', f); });
  if (process.env.PDFED_EXTRA) fs.readdirSync(process.env.PDFED_EXTRA).filter(function (f) { return /\.pdf$/i.test(f); }).forEach(function (f) { files.push(path.join(process.env.PDFED_EXTRA, f)); });
  say('§PDFED-LOAD engine=' + ENGINE + ' mutant=' + (MUTANT || 'none') + ' pdfjs=' + pdfjs.version + ' files=' + files.length);
  var opened = {}, outlines = 0;
  for (var i = 0; i < files.length; i++) {
    var f = files[i], name = path.basename(f), t0 = Date.now(), d = await PO.open(pdfjs, read(f)); opened[f] = d;
    var info = run('pdfinfo', [f]) || '', pages = Number((/Pages:\s+(\d+)/.exec(info) || [])[1]);
    check('V1', name, 'page count == pdfinfo (' + pages + ')', d.ok === true && pages > 0 && d.pages === pages, { ok: d.ok, named: d.named, pages: d.pages });
    if (!d.ok) continue;
    var worst = 0, chars = 0, ex = [];
    for (var p = 1; p <= d.pages; p++) { var ref = run('pdftotext', ['-raw', '-f', String(p), '-l', String(p), f, '-']) || '', a = bag(d.text[p - 1]), b = bag(ref), df = bagDiff(a, b); chars += Object.keys(b).reduce(function (s, k) { return s + b[k]; }, 0); if (df.d > worst) { worst = df.d; ex = ['p' + p].concat(df.ex); } }
    check('V2', name, 'per page the characters read == pdftotext\'s (' + chars + ' characters over ' + d.pages + ' pages, worst page differs by ' + worst + ')', chars > 0 && worst === 0, ex);
    var xml = run('pdftohtml', ['-xml', '-i', '-stdout', f]) || '', want = [], re = /<item page="\d+">([\s\S]*?)<\/item>/g, m; while ((m = re.exec(xml))) want.push(un(m[1]).trim());
    var got = d.outline.map(function (o) { return o.title.trim(); }); outlines += want.length;
    if (want.length || got.length) check('V3', name, 'outline titles in order == pdftohtml\'s (' + want.length + ')', J(got) === J(want), { got: got.length, want: want.length, firstDiff: got.filter(function (g, k) { return g !== want[k]; })[0] });
    else say('  §PDFED-NOTE V3 ' + name + ' has no outline in either reader: not judged');
    say('§PDFED-OPEN file=' + name + ' pages=' + d.pages + ' chars=' + chars + ' outline=' + got.length + ' runs=' + d.items.reduce(function (s, x) { return s + x.length; }, 0) + ' rotatedSkipped=' + d.rotated + ' ms=' + (Date.now() - t0) + ' heapMB=' + Math.round(process.memoryUsage().heapUsed / 1048576));
  }
  verdict('V1'); verdict('V2'); if (!outlines) say('  §PDFED-NOTE V3 no corpus file has an outline: VACUOUS'); verdict('V3');

  // V4: bad and locked files, made here from the corpus, never committed
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfed_')), src = files[0], good = opened[src], b = fs.readFileSync(src);
  var cut = b.subarray(0, b.lastIndexOf('xref')), c = await PO.open(pdfjs, new Uint8Array(cut));
  check('V4', 'cut-xref', 'the copy with its cross-reference table cut off (' + (b.length - cut.length) + ' bytes gone) opens with the same pages and text, or is NAMED', (c.ok && good.ok && c.pages === good.pages && bagDiff(bag(c.text.join('')), bag(good.text.join(''))).d === 0) || (!c.ok && !!c.named), { ok: c.ok, pages: c.pages, named: c.named });
  say('  §PDFED-NOTE V4 cut-xref outcome=' + (c.ok ? 'OPENED pages=' + c.pages : 'NAMED ' + c.named));
  var e = await PO.open(pdfjs, new Uint8Array(0)); check('V4', 'empty', 'an empty file is NAMED empty', e.ok === false && e.named === 'empty' && !e.pages, e);
  var n = await PO.open(pdfjs, new Uint8Array(Buffer.from('PK\u0003\u0004 this is a spreadsheet, not a PDF'))); check('V4', 'not-a-pdf', 'a non-PDF is NAMED not-a-pdf', n.ok === false && n.named === 'not-a-pdf' && !n.pages, n);
  var h = await PO.open(pdfjs, new Uint8Array(Buffer.from('%PDF-1.7\n' + 'garbage '.repeat(400)))); check('V4', 'header-only', 'a PDF header over garbage is NAMED damaged, never opened with 0 pages', h.ok === false && h.named === 'damaged' && !h.pages, h);
  var lock = path.join(tmp, 'locked.pdf'), gs = cp.spawnSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-sOwnerPassword=owner', '-sUserPassword=open-sesame', '-dEncryptionR=3', '-dKeyLength=128', '-sOutputFile=' + lock, src], { encoding: 'utf8' });
  if (gs.error || gs.status !== 0 || !fs.existsSync(lock) || !/Encrypted:\s+yes/.test(run('pdfinfo', ['-upw', 'open-sesame', lock]) || '')) say('  §PDFED-NOTE V4 no password copy could be made (ghostscript missing or it did not encrypt): the locked claims are NOT judged');
  else {
    var l0 = await PO.open(pdfjs, read(lock)), l1 = await PO.open(pdfjs, read(lock), { password: 'wrong' }), l2 = await PO.open(pdfjs, read(lock), { password: 'open-sesame' });
    check('V4', 'needs-password', 'the password copy without a password is NAMED needs-password', l0.ok === false && l0.named === 'needs-password', l0);
    check('V4', 'wrong-password', 'with a wrong password it is NAMED wrong-password', l1.ok === false && l1.named === 'wrong-password', l1);
    check('V4', 'opens-with-password', 'with the password it opens: ' + good.pages + ' page(s)', l2.ok === true && l2.pages === good.pages, { ok: l2.ok, named: l2.named, pages: l2.pages });
  }
  fs.rmSync(tmp, { recursive: true, force: true }); verdict('V4');

  if (process.env.PDFED_MUTANTS === '1' && !MUTANT) {
    var code = fs.readFileSync(ENGINE, 'utf8'), killed = 0;
    var MUT = [
      { name: 'M1-first-character-dropped', kills: 'V2', from: "/*MUT-TEXT*/", to: ".replace(/\\S/, '')" },
      { name: 'M2-nested-outline-dropped', kills: 'V3', from: '/*MUT-NEST*/ flat(n.items, depth + 1, out);', to: '' },
      { name: 'M3-errors-swallowed', kills: 'V4', from: "/*MUT-ERR*/ return refuse('damaged', (e && e.message) || e);", to: 'return { ok: true, pages: 0, text: [], items: [], sizes: [], outline: [], rotated: 0 };' }
    ];
    MUT.forEach(function (m) {
      var k0 = code.split(m.from).length - 1; if (k0 !== 1) { say('§PDFED-MUTANT name=' + m.name + ' NOT-APPLIED matches=' + k0); return; }
      var mf = path.join(os.tmpdir(), 'pdfed_' + process.pid + '_' + m.name + '.js'); fs.writeFileSync(mf, code.replace(m.from, m.to));
      var out = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { PDFED_ENGINE: mf, PDFED_MUTANT: m.name, PDFED_MUTANTS: '' }), encoding: 'utf8' }).stdout || ''; fs.unlinkSync(mf);
      var line = out.split('\n').filter(function (x) { return x.indexOf('§PDFED-' + m.kills + ' verdict=') === 0; })[0] || 'no verdict line (crash)', k = /verdict=FAIL/.test(line);
      if (k) killed++; say('§PDFED-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + (k ? 'KILLED' : 'SURVIVED') + ' child="' + line + '"');
    });
    say('§PDFED-MUTANTS killed=' + killed + '/' + MUT.length); ALL.judged++; if (killed !== MUT.length) ALL.failed++;
  }
  var none = ['V1', 'V2', 'V3', 'V4'].filter(function (k) { return !CASES[k] || !CASES[k].judged; });
  say('§PDFED-VERDICT ' + (ALL.failed ? 'FAIL' : none.length ? 'INCONCLUSIVE' : 'PASS') + ' judged=' + ALL.judged + ' failed=' + ALL.failed + (none.length ? ' notJudged=' + none.join(',') : '') + (MUTANT ? ' mutant=' + MUTANT : ''));
  process.exit(ALL.failed ? 1 : none.length ? 2 : 0);
})().catch(function (e) { log0('§PDFED-VERDICT FAIL crash ' + (e && e.stack || e)); process.exit(3); });
