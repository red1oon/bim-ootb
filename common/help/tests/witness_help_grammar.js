#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-PREFIX (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.1; grammar = prompts/HELP_QUERY_CORE_DESIGN.md §3, D4).
// Scope: common/help/help_grammar.js parse(line). READ THE LOG after every run (common/help/tests/logs/witness_help_grammar.log);
// the exit code is not evidence. A verdict line says INCONCLUSIVE, never PASS, when nothing was judged.
// Issues it proves/disproves:
//   P1 "a '#' in a URL, a heading or '#1 priority today' is taken for a document, or a '?' mid-line / '¿' / '/' / '@' is read wrong":
//      EVERY row of the design's §3 collision table is read FROM THE DESIGN FILE at run time (N = rows found); each row is mapped to
//      the input(s) it names and the kind the row states (the row's own words must contain the evidence phrase); a row that cannot be
//      mapped is a FAIL, not a skip. X of N printed. Plus the full-width '？' '＃' of the grammar block (extras, counted apart).
//   P2 "the page reads a line differently from Node": the same cases give the byte-identical JSON in Node and in headless chromium.
//   Red control: HQ_BREAK=anyhash (every leading '#' = a document) must make P1 FAIL (log goes to ...red_anyhash.log).
// usage: node common/help/tests/witness_help_grammar.js [--design <path to HELP_QUERY_CORE_DESIGN.md>]
//   default design = `git -C ~/bim-compiler show origin/master:prompts/HELP_QUERY_CORE_DESIGN.md`; neither available -> INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const HOME = process.env.HOME || '';
const SRC = path.join(__dirname, '..', 'help_grammar.js');
const BREAK = process.env.HQ_BREAK || '';
const LOG = path.join(__dirname, 'logs', BREAK ? 'witness_help_grammar.red_' + BREAK + '.log' : 'witness_help_grammar.log');
const out = [];
const L = s => { out.push(s); console.log(s); };
let pass = 0, fail = 0, inconcl = 0;
const ck = (ok, id, msg) => { L((ok ? '§PASS ' : '§FAIL ') + id + ' ' + msg); ok ? pass++ : fail++; };
const finish = () => {
  const v = fail ? 'FAIL' : (pass === 0 || inconcl ? 'INCONCLUSIVE' : 'PASS');
  L('§W-PREFIX ' + v + ' pass=' + pass + ' fail=' + fail + (inconcl ? ' inconclusive=' + inconcl : '') + (BREAK ? ' HQ_BREAK=' + BREAK : ''));
  fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, out.join('\n') + '\n');
  process.exit(v === 'PASS' ? 0 : 1);
};

// ── the design file ──
const ai = process.argv.indexOf('--design'); let design = null, from = '';
try {
  if (ai > 0 && process.argv[ai + 1]) { from = process.argv[ai + 1]; design = fs.readFileSync(from, 'utf8'); }
  else { from = 'git -C ~/bim-compiler show origin/master:prompts/HELP_QUERY_CORE_DESIGN.md';
    design = cp.execFileSync('git', ['-C', path.join(HOME, 'bim-compiler'), 'show', 'origin/master:prompts/HELP_QUERY_CORE_DESIGN.md'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
} catch (e) { design = null; }
if (!design) { L('§P1 INCONCLUSIVE design file not readable (' + from + ')'); inconcl++; finish(); }
L('§DESIGN source=' + from + ' sha256=' + crypto.createHash('sha256').update(design).digest('hex').slice(0, 16) + ' bytes=' + design.length);

// §3 table: the pipe rows between "## 3." and "## 4."
const sec = design.split(/^## 3\./m)[1]; const sec3 = sec ? sec.split(/^## 4\./m)[0] : '';
const rows = sec3.split('\n').filter(l => /^\|/.test(l) && !/^\|\s*Collision\s*\|/.test(l) && !/^\|[-\s|]+$/.test(l))
  .map(l => l.replace(/^\||\|\s*$/g, '').split('|').map(s => s.trim())).filter(c => c.length >= 3);
L('§P1_ROWS read ' + rows.length + ' rows from the §3 collision table');
if (!rows.length) { L('§P1 INCONCLUSIVE no collision-table rows found in §3'); inconcl++; finish(); }

// row key (regex on cell 1) -> the inputs it names, the result the row states, and a phrase the row's cell 2 must contain
const K = (kind, number, rest) => ({ kind, number, rest });
const MAP = [
  { key: /bash reads an unquoted `#`/, ev: /no collision/, cases: [['#50000', K('doc', '50000', '')]] },
  { key: /literal `\?` in a question/, ev: /punctuation/, cases: [['how do I void an order?', K('text', null, 'how do I void an order?')]] },
  { key: /question that starts with `\?`/, ev: /`help` and `text` do the same/, cases: [['?how do I void an order', K('help', null, 'how do I void an order')], ['? how do I void an order', K('help', null, 'how do I void an order')]] },
  { key: /Spanish `¿/, ev: /line is text/, cases: [['¿Cómo anulo un pedido?', K('text', null, '¿Cómo anulo un pedido?')]] },
  { key: /URL with a fragment/, ev: /text/, cases: [['https://example.org/Guide/#save', K('text', null, 'https://example.org/Guide/#save')]] },
  { key: /path or URL starting with `\/`/, ev: /text in a box/, cases: [['/home/user/file.txt', K('text', null, '/home/user/file.txt')], ['/C_Order', K('text', null, '/C_Order')]] },
  { key: /`# heading`, `#1 priority today`/, ev: /text, not a document/, cases: [['# heading', K('text', null, '# heading')], ['#1 priority today', K('text', null, '#1 priority today')]] },
  { key: /`#SO-1001`/, ev: /is a document/, cases: [['#SO-1001', K('doc', 'SO-1001', '')]] },
  { key: /`#` alone/, ev: /usage message/, cases: [['#', K('doc', '', '')], ['  #  ', K('doc', '', '')]] },
  { key: /`@name`/, ev: /`reserved`/, cases: [['@name', K('reserved', null, 'name')]] },
  { key: /Modeller's `\?` key toggles/, ev: /is the prefix/, cases: [['?wall', K('help', null, 'wall')]] },
  { key: /Viewer focuses the box/, ev: /the prefix/, cases: [['?wall', K('help', null, 'wall')]] },
  { key: /`#<number>` in the Viewer/, ev: /selects \+ frames the element/, cases: [['#12345', K('doc', '12345', '')]] },
  { key: /Legacy's `\/` for document search/, ev: /Not in this grammar/, cases: [['/C_Order', K('text', null, '/C_Order')]] },
];
// the grammar block's own sentence: the full-width '？' '＃' count as '?' '#' (not table rows: counted apart)
const EXTRAS = [['？how do I void an order', K('help', null, 'how do I void an order')], ['＃SO-1001', K('doc', 'SO-1001', '')], ['＃', K('doc', '', '')], ['# a', K('text', null, '# a')], ['#a#b', K('text', null, '#a#b')], ['', K('text', null, '')]];

const mod = require(SRC); const real = mod.parse;
// red control: a '#' read as a document wherever it leads (HQ_BREAK=anyhash) - the broken reader lives HERE, the module stays pure
const parseP1 = BREAK === 'anyhash'
  ? (l => { const t = String(l).replace(/^\s+/, ''); return /^[#＃]/.test(t) ? { kind: 'doc', rest: '', number: t.slice(1).trim() } : real(l); })
  : real;
if (BREAK && BREAK !== 'anyhash') { L('§P1 INCONCLUSIVE unknown HQ_BREAK=' + BREAK); inconcl++; finish(); }
if (BREAK) L('§RED_CONTROL HQ_BREAK=anyhash active: P1 must FAIL (every leading # is read as a document)');

// ── P1 ──
const cases = []; let rowOk = 0, judged = 0;
rows.forEach((r, i) => {
  const id = 'P1.row' + (i + 1), m = MAP.find(x => x.key.test(r[0])), label = r[0].slice(0, 60);
  if (!m) { ck(false, id, 'UNMAPPED table row: "' + label + '" (cannot map = FAIL, not skip)'); judged++; return; }
  if (!m.ev.test(r[1])) { ck(false, id, 'row "' + label + '" no longer states ' + m.ev + ' in its result cell: "' + r[1].slice(0, 80) + '"'); judged++; return; }
  const bad = [];
  m.cases.forEach(([line, exp]) => {
    cases.push(line); judged++;
    const got = parseP1(line);
    if (got.kind !== exp.kind || got.number !== exp.number || got.rest !== exp.rest) bad.push(JSON.stringify(line) + ' want ' + JSON.stringify(exp) + ' got ' + JSON.stringify(got));
  });
  if (!bad.length) rowOk++;
  ck(!bad.length, id, '"' + label + '" ' + m.cases.map(c => JSON.stringify(c[0]) + '->' + c[1].kind).join(' ') + (bad.length ? '  MISMATCH ' + bad.join('; ') : ''));
});
L('§P1 table rows ' + rowOk + ' of ' + rows.length + ' (N=' + rows.length + ', cases judged=' + judged + ')');
let exOk = 0;
EXTRAS.forEach(([line, exp], i) => {
  cases.push(line); judged++;
  const got = parseP1(line), ok = got.kind === exp.kind && got.number === exp.number && got.rest === exp.rest; if (ok) exOk++;
  ck(ok, 'P1.x' + (i + 1), 'grammar ' + JSON.stringify(line) + '->' + exp.kind + (ok ? '' : ' got ' + JSON.stringify(got)));
});
L('§P1 grammar extras ' + exOk + ' of ' + EXTRAS.length);
if (!judged) { L('§P1 INCONCLUSIVE 0 cases judged'); inconcl++; }

// ── P2: Node vs headless chromium, byte-identical JSON of the REAL parse ──
(async () => {
  let chromium;
  try { chromium = require(path.join(HOME, 'bim-ootb', 'tests', 'node_modules', 'playwright')).chromium; } catch (e) { try { chromium = require('playwright').chromium; } catch (e2) { chromium = null; } }
  if (!chromium || !cases.length) { L('§P2 INCONCLUSIVE ' + (!cases.length ? 'no cases' : 'playwright not found')); inconcl++; return finish(); }
  const nodeJson = JSON.stringify(cases.map(real));
  let br;
  try {
    br = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    const pg = await br.newPage(); await pg.setContent('<!doctype html><meta charset="utf-8"><title>p</title>');
    await pg.addScriptTag({ content: fs.readFileSync(SRC, 'utf8') });
    const r = await pg.evaluate(cs => ({ has: typeof window.HelpGrammar === 'object' && typeof window.HelpGrammar.parse === 'function', json: window.HelpGrammar ? JSON.stringify(cs.map(window.HelpGrammar.parse)) : null, ua: navigator.userAgent, nodeLeak: typeof require + typeof process + typeof module }), cases);
    L('§P2_PAGE headless=1 gpu=off ' + r.ua.replace(/.*(HeadlessChrome\/[\d.]+).*/, '$1') + ' window.HelpGrammar=' + r.has + ' node-globals=' + r.nodeLeak);
    ck(r.has && r.json === nodeJson, 'P2', 'node and chromium JSON byte-identical over ' + cases.length + ' cases (' + nodeJson.length + ' bytes, sha ' + crypto.createHash('sha256').update(nodeJson).digest('hex').slice(0, 12) + ')' + (r.json === nodeJson ? '' : ' DIFFER'));
  } catch (e) { L('§P2 INCONCLUSIVE chromium did not run: ' + String(e.message).split('\n')[0]); inconcl++; }
  finally { if (br) await br.close(); }
  finish();
})();
