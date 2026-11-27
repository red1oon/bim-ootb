#!/usr/bin/env node
// ⚠ DO NOT REMOVE - W-SHEET-READER (bim-compiler prompts/SHEET_FRONT_DOOR.md §7, slice S10). READ THE LOG after every run; the exit code is not evidence.
// THE ISSUE THIS PROVES OR DISPROVES: a report that arrives as a PDF cannot be reused without retyping it, and a retyped or
//   mis-read report is trusted blindly. Does pdf/report_reader.js turn our own trial-balance PDF back into the sheet that printed it?
//   R1 CELLS      all oracle cells at the SAME address with the same text, no extra cell            -> cells lost, merged, split, shifted
//   R2 NUMBERS    oracle numbers equal within 0.005; brackets negative; dash 0; codes stay text      -> wrong signs, codes as numbers
//   R3 ADDS UP    the total row is found by arithmetic and agrees; ONE changed digit is caught        -> a report that does not add up is accepted
//   R4 SOURCE MAP each poppler word's centre lies in exactly one cell box whose text holds the word   -> a write-back would hit the wrong place
//   R5 VACUOUS    no text / no table -> INCONCLUSIVE, never a sheet                                  -> an empty or prose page "passes"
//   R6 XLSX       written by the ERP's SheetJS and read back: same cells, SUM formulas, source map    -> the hand-off file differs
//   R7 HISTORY    the read sheet is an S9 genesis entry the kernel verifies; one edit = one CELL_SET  -> a second core
//   R8 COST       ms, cells, items, heap
// Oracle: pdf/corpus/trial_balance_th.cells.json = the sheet that printed the PDF (dumped from the engine that made it). Independent box reader: poppler.
// Command: node pdf/tests/witness_sheet_reader.js     (SREAD_MUTANTS=1 adds the mutant sweep: each mutant must turn its named case FAIL; a crash is not a kill)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ROOT = path.join(__dirname, '..', '..'), PDFD = path.join(ROOT, 'pdf'), ERP = path.join(ROOT, 'erp');
var ENGINE = process.env.SREAD_ENGINE || path.join(PDFD, 'report_reader.js'), MUTANT = process.env.SREAD_MUTANT || '';
var log0 = console.log, warn0 = console.warn; console.log = function () {}; console.warn = function () {};
var pdfjs = require(path.join(ROOT, 'modeller/lib/pdfjs/pdf.min.js')); pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'modeller/lib/pdfjs/pdf.worker.min.js');
console.log = log0; console.warn = warn0;
var PO = require(path.join(PDFD, 'pdf_open.js')), RR = require(ENGINE), XLSX = require(path.join(ERP, 'xlsx.mini.min.js')), H = require(path.join(ERP, 'sheet_history.js')), K = require(path.join(ERP, 'ws_kernel.js'));
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function say(s) { console.log(s); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §SREAD-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§SREAD-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
async function guard(cs, fn) { try { await fn(); } catch (e) { check(cs, 'crash', 'the case runs', false, String(e && e.stack || e).slice(0, 300)); } verdict(cs); }
function clone(x) { return JSON.parse(J(x)); }
var near = function (a, b) { return Math.abs(a - b) < 0.005; }, squash = function (s) { return String(s).replace(/\s+/g, ''); };

(async function () {
  var PDF = path.join(PDFD, 'corpus/trial_balance_th.pdf'), ORA = JSON.parse(fs.readFileSync(path.join(PDFD, 'corpus/trial_balance_th.cells.json'), 'utf8'));
  var bytes = new Uint8Array(fs.readFileSync(PDF)), doc = await PO.open(pdfjs, bytes);
  if (!doc.ok) { say('§SREAD-VERDICT INCONCLUSIVE the corpus PDF did not open: ' + J(doc)); process.exit(2); }
  var want = {}; ORA.cells.forEach(function (c) { want[c.cell] = c; });
  var heap0 = process.memoryUsage().heapUsed, t0 = Date.now(), R = RR.read(doc.items), ms = Date.now() - t0;
  say('§SREAD-LOAD engine=' + ENGINE + ' mutant=' + (MUTANT || 'none') + ' pdf=trial_balance_th.pdf bytes=' + bytes.length + ' pages=' + doc.pages + ' items=' + doc.items[0].length + ' oracleCells=' + ORA.cells.length);

  await guard('R1', async function () {
    var miss = [], extra = [];
    Object.keys(want).forEach(function (a) { var g = R.sheet[a]; if (!g || g.text !== want[a].text.trim()) miss.push(a + ' want "' + want[a].text.trim() + '" got ' + (g ? '"' + g.text + '"' : 'nothing')); });
    Object.keys(R.sheet).forEach(function (a) { if (!want[a]) extra.push(a + '="' + R.sheet[a].text + '"'); });
    check('R1', 'population', 'the oracle holds cells to judge (144)', ORA.cells.length === 144, ORA.cells.length);
    check('R1', 'same-address', 'every oracle cell is read at the same address with the same text (' + (ORA.cells.length - miss.length) + ' of ' + ORA.cells.length + ')', miss.length === 0, miss.slice(0, 8));
    check('R1', 'no-extra', 'no cell is read that the source sheet does not hold', extra.length === 0, extra.slice(0, 8));
    check('R1', 'blank-rows', 'the source\'s blank rows 4, 27, 29 are kept (3 blank rows found)', R.stats.blankRows === 3 && !R.sheet.A4 && !R.sheet.A27 && !R.sheet.A29, R.stats);
  });

  await guard('R2', async function () {
    var nums = ORA.cells.filter(function (c) { return c.t === 'n'; }), bad = [], neg = 0, dash = 0;
    nums.forEach(function (c) { var g = R.sheet[c.cell]; if (!g || g.t !== 'n' || !near(g.v, c.v)) bad.push(c.cell + ' want ' + c.v + ' got ' + J(g)); if (/^\(/.test(c.text)) neg++; if (c.text === '-') dash++; });
    check('R2', 'numbers', 'every oracle number is a number within 0.005 (' + (nums.length - bad.length) + ' of ' + nums.length + ')', nums.length > 0 && bad.length === 0, bad.slice(0, 8));
    var negBad = nums.filter(function (c) { return /^\(/.test(c.text) && !(R.sheet[c.cell] && R.sheet[c.cell].v < 0); });
    check('R2', 'brackets', 'the ' + neg + ' bracketed figures are negative', neg > 0 && negBad.length === 0, negBad.slice(0, 5));
    var dashBad = nums.filter(function (c) { return c.text === '-' && !(R.sheet[c.cell] && R.sheet[c.cell].t === 'n' && R.sheet[c.cell].v === 0); });
    check('R2', 'dash', 'the ' + dash + ' dashes in number columns are 0', dash > 0 && dashBad.length === 0, dashBad.slice(0, 5));
    var txt = ORA.cells.filter(function (c) { return c.t === 's'; }), tb = txt.filter(function (c) { var g = R.sheet[c.cell]; return !g || g.t !== 's'; });
    check('R2', 'codes', 'the ' + txt.length + ' text cells stay text; account code A6 is "11100", not a number', tb.length === 0 && R.sheet.A6 && R.sheet.A6.v === '11100', tb.slice(0, 5));
  });

  await guard('R3', async function () {
    var sums = R.checks.filter(function (c) { return c.kind === 'SUM'; }), rule = R.checks.filter(function (c) { return c.kind === 'ROW'; })[0];
    check('R3', 'total-row', 'the total row is found by arithmetic at row 28, 4 of 4 columns agree', sums.length === 4 && sums.every(function (c) { return c.ok && /28$/.test(c.cell); }), sums);
    var d = sums.filter(function (c) { return c.cell === 'D28'; })[0], e = sums.filter(function (c) { return c.cell === 'E28'; })[0];
    check('R3', 'figure', 'debit = credit = 40,392.44, printed and summed from the 21 rows', !!d && !!e && near(d.printed, 40392.44) && near(d.computed, 40392.44) && near(e.printed, 40392.44) && near(e.computed, 40392.44) && d.range === 'D6:D26', [d, e]);
    check('R3', 'row-rule', 'the row rule F = C + D - E is found and holds on 21 of 21 rows', !!rule && rule.formula === 'F = C + D - E' && rule.rows === 21 && rule.of === 21, rule);
    check('R3', 'verdict', 'verdict ADDS_UP', R.verdict === 'ADDS_UP' && R.ok === true, R.verdict);
    var items = clone(doc.items), hit = items[0].filter(function (i) { return i.s === '498.09'; });
    check('R3', 'tamper-applied', 'the printed figure 498.09 (D10) exists once and is changed to 499.09', hit.length === 1, hit.length);
    if (hit.length === 1) hit[0].s = '499.09';
    var T = RR.read(items);
    check('R3', 'tamper-caught', 'one changed digit -> DOES_NOT_ADD_UP, naming D28 and both numbers (40392.44, 40393.44)', T.verdict === 'DOES_NOT_ADD_UP' && T.ok === false && /D28/.test(T.reason) && /40392\.44/.test(T.reason) && /40393\.44/.test(T.reason), { verdict: T.verdict, reason: T.reason });
    check('R3', 'tamper-no-formula', 'the total that does not agree gets no SUM formula', !T.sheet.D28 || !T.sheet.D28.f, T.sheet.D28);
  });

  await guard('R4', async function () {
    var out = cp.spawnSync('pdftotext', ['-bbox', PDF, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (out.error || out.status !== 0) { say('  §SREAD-NOTE R4 poppler pdftotext not available: nothing judged'); return; }
    var words = [], re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g, m;
    var un = function (s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); };
    while ((m = re.exec(out.stdout))) words.push({ x: (Number(m[1]) + Number(m[3])) / 2, y: (Number(m[2]) + Number(m[4])) / 2, w: un(m[5]) });
    var cells = Object.keys(R.map), hold = {}, stray = [], wrong = [];
    words.forEach(function (w) {
      var inside = cells.filter(function (a) { var b = R.map[a].box; return w.x >= b[0] && w.x <= b[2] && w.y >= b[1] && w.y <= b[3]; });
      if (inside.length !== 1) { stray.push(w.w + '@' + w.x.toFixed(1) + ',' + w.y.toFixed(1) + ' in ' + inside.length); return; }
      hold[inside[0]] = (hold[inside[0]] || 0) + 1;
      if (squash(R.sheet[inside[0]].text).indexOf(squash(w.w)) < 0) wrong.push(w.w + ' in ' + inside[0] + '="' + R.sheet[inside[0]].text + '"');
    });
    var empty = cells.filter(function (a) { return !hold[a]; });
    check('R4', 'population', 'poppler gives words to judge', words.length > 100, words.length);
    check('R4', 'one-box', 'each of the ' + words.length + ' poppler word centres lies inside exactly one cell box', stray.length === 0, stray.slice(0, 6));
    check('R4', 'right-cell', 'that cell\'s text holds the word', wrong.length === 0, wrong.slice(0, 6));
    check('R4', 'every-cell', 'every one of the ' + cells.length + ' cell boxes holds a word', empty.length === 0, empty.slice(0, 8));
  });

  await guard('R5', async function () {
    var E = RR.read([[]]);
    check('R5', 'no-text', 'a page with no text -> INCONCLUSIVE, no sheet', E.verdict === 'INCONCLUSIVE' && E.ok === false && Object.keys(E.sheet).length === 0 && /no text/.test(E.reason), E);
    var prose = await PO.open(pdfjs, new Uint8Array(fs.readFileSync(path.join(PDFD, 'corpus/market_impact_report.pdf'))));
    var Pz = RR.read(prose.items, { page: 1 });
    check('R5', 'no-table', 'a cover page (text, no table) -> INCONCLUSIVE "no table found", no sheet', prose.ok && prose.items[0].length > 0 && Pz.verdict === 'INCONCLUSIVE' && Pz.ok === false && Object.keys(Pz.sheet).length === 0 && /no table/.test(Pz.reason), { items: prose.ok && prose.items[0].length, verdict: Pz.verdict, reason: Pz.reason });
  });

  await guard('R6', async function () {
    var wb = RR.toWorkbook(XLSX, R), buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), back = XLSX.read(buf, { type: 'buffer' }), ws = back.Sheets.Report || {}, bad = [];
    Object.keys(R.sheet).forEach(function (a) { var c = ws[a], g = R.sheet[a]; if (!c || (g.t === 'n' ? !(c.t === 'n' && near(c.v, g.v)) : String(c.v) !== g.v)) bad.push(a + ' ' + J(c && { t: c.t, v: c.v })); });
    var n = Object.keys(ws).filter(function (k) { return k[0] !== '!'; }).length;
    check('R6', 'same-cells', 'the .xlsx re-read holds the same ' + Object.keys(R.sheet).length + ' cells with the same values (file ' + buf.length + ' bytes)', bad.length === 0 && n === Object.keys(R.sheet).length, { bad: bad.slice(0, 6), n: n });
    var f = ['C28', 'D28', 'E28', 'F28'].map(function (a) { return ws[a] && ws[a].f; });
    check('R6', 'formulas', 'the four totals carry SUM formulas over their rows', J(f) === J(['SUM(C6:C26)', 'SUM(D6:D26)', 'SUM(E6:E26)', 'SUM(F6:F26)']), f);
    var src = back.Sheets._door_source ? XLSX.utils.sheet_to_json(back.Sheets._door_source) : [], d28 = src.filter(function (r) { return r.cell === 'D28'; })[0];
    check('R6', 'source-map', 'the hidden sheet _door_source lists every cell with its page and box (D28 equal to the read map)', src.length === Object.keys(R.map).length && !!d28 && d28.page === 1 && near(d28.x0, R.map.D28.box[0]) && near(d28.y1, R.map.D28.box[3]) && (back.Workbook.Sheets[1] || {}).Hidden === 1, { rows: src.length, d28: d28 });
  });

  await guard('R7', async function () {
    var snap = RR.toSnapshot(R), hist = [], g = await H.record(hist, null, snap, 'report-reader', '2026-11-27T01:00:00Z'); hist.push(g.entry);
    var next = clone(snap); next.Report.D10.v = 499.09; var e2 = await H.record(hist, snap, next, 'clerk', '2026-11-27T02:00:00Z');
    var v = K.verifyJournal([g.line, e2.line].join('\n'));
    check('R7', 'genesis', 'the read sheet is one genesis entry holding all ' + Object.keys(R.sheet).length + ' cells', g.verdict === 'RECORDED' && g.entry.ops === Object.keys(R.sheet).length, g.entry && g.entry.ops);
    check('R7', 'kernel-verify', 'the kernel\'s own verifyJournal verifies it (2 entries)', v.ok === true && v.entries === 2, v);
    var ops = e2.entry ? e2.entry.payload.ops : [];
    check('R7', 'one-edit', 'one later edit records exactly one CELL_SET (Report!D10 498.09 -> 499.09)', ops.length === 1 && ops[0].sheet === 'Report' && ops[0].cell === 'D10' && ops[0].before.v === 498.09 && ops[0].after.v === 499.09, ops);
  });

  await guard('R8', async function () {
    say('§SREAD-COST items=' + R.stats.items + ' lines=' + R.stats.lines + ' cells=' + R.stats.cells + ' readMs=' + ms + ' pdfBytes=' + bytes.length + ' heapDeltaKB=' + Math.round((process.memoryUsage().heapUsed - heap0) / 1024) + ' heapMB=' + Math.round(process.memoryUsage().heapUsed / 1048576));
    check('R8', 'logged', 'the cost line carries a cell count and a time', R.stats.cells > 0 && ms >= 0, R.stats);
  });

  if (process.env.SREAD_MUTANTS === '1' && !MUTANT) {
    var src = fs.readFileSync(ENGINE, 'utf8'), killed = 0;
    var MUT = [
      { name: 'M1-blank-rows-dropped', kills: 'R1', from: '/*MUT-BLANK*/', to: 'step = 1;' },
      { name: 'M2-brackets-not-negative', kills: 'R2', from: 'm[1] /*MUT-BRACKET*/', to: 'false' },
      { name: 'M3-sums-not-compared', kills: 'R3', from: '/*MUT-SUM*/ Math.abs(p - s) < tol', to: 'true' },
      { name: 'M4-boxes-shifted-a-row', kills: 'R4', from: '[g.x0, g.top /*MUT-BOX*/, g.x1, g.bot]', to: '[g.x0, g.top + 12.75, g.x1, g.bot + 12.75]' },
      { name: 'M5-column-dropped-on-write', kills: 'R6', from: '/*MUT-XLSX*/', to: 'if (rc[0] === 4) return;' }
    ];
    MUT.forEach(function (m) {
      var n = src.split(m.from).length - 1;
      if (n !== 1) { say('§SREAD-MUTANT name=' + m.name + ' NOT-APPLIED matches=' + n); return; }
      var f = path.join(os.tmpdir(), 'sread_' + process.pid + '_' + m.name + '.js'); fs.writeFileSync(f, src.replace(m.from, m.to));
      var out = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { SREAD_ENGINE: f, SREAD_MUTANT: m.name, SREAD_MUTANTS: '' }), encoding: 'utf8' }).stdout || '';
      fs.unlinkSync(f);
      var line = (out.split('\n').filter(function (l) { return l.indexOf('§SREAD-' + m.kills + ' verdict=') === 0; })[0] || 'no verdict line (crash)'), k = /verdict=FAIL/.test(line) && !/key=crash FAIL/.test(out);
      if (k) killed++; say('§SREAD-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + (k ? 'KILLED' : 'SURVIVED') + ' child="' + line + '"');
    });
    say('§SREAD-MUTANTS killed=' + killed + '/' + MUT.length); ALL.judged++; if (killed !== MUT.length) ALL.failed++;
  }
  var inc = Object.keys(CASES).filter(function (c) { return !CASES[c].judged; }), none = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'].filter(function (c) { return !CASES[c]; });
  say('§SREAD-VERDICT ' + (ALL.failed ? 'FAIL' : none.length || inc.length ? 'INCONCLUSIVE' : 'PASS') + ' judged=' + ALL.judged + ' failed=' + ALL.failed + (none.length ? ' notJudged=' + none.join(',') : '') + (MUTANT ? ' mutant=' + MUTANT : ''));
  process.exit(ALL.failed ? 1 : none.length ? 2 : 0);
})().catch(function (e) { console.log('§SREAD-VERDICT FAIL crash ' + (e && e.stack || e)); process.exit(3); });
