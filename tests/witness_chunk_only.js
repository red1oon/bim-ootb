/**
 * W-CHUNK-ONLY (F1) — witness: does any call site feed NETWORK-FETCHED SQL text into a raw
 * db.run()/db.exec() instead of the shared statement-aware chunker A._runSqlChunked?
 *
 * Issue it proves/disproves (prompts/4D_SCHEDULE_PERFECTION.md §FOLLOW-ON F1, 2026-08-10):
 *   a single run() over a multi-thousand-statement fetched patch crashes the bundled
 *   sql-wasm.wasm ("memory access out of bounds") and bricks the SHARED wasm heap. This class
 *   was fixed TWICE in one day (scene.js _applyPendingPatch am, navigate_find.js needle pm) —
 *   same bug, missed call site. Per-call-site discipline drifted; this witness makes the
 *   invariant mechanical: SQL text that crossed the network as a file goes through the chunker,
 *   or carries an explicit `// §CHUNK-EXEMPT: <reason>` on the flagged line.
 *
 * Rule (deterministic, per file — no dataflow guessing beyond it):
 *   1. collect identifiers assigned from a network text body:
 *        <id> = await <x>.text()          (async form — scene.js/navigate_find.js style)
 *        .text().then(function (<id>)     (promise form — modeller str_walker_outliner style)
 *        .text().then(<id> =>             (arrow form)
 *   2. flag any `.run(<id>)` / `.exec(<id>)` of a collected <id> ONLY on lines textually AFTER
 *      that ident's first network binding — a same-named ident earlier in the file is a different
 *      variable (real case: modeller _count(db, sql)'s constant-SELECT param at :422 vs the patch
 *      text bound at :652). Lines containing `§CHUNK-EXEMPT: <reason>` are skipped.
 *   Small constant-literal queries (db.exec(sql) where sql is a local SELECT string) are NOT
 *   network-derived and are deliberately out of scope — they cannot reach the crash size class.
 *   Known miss, accepted: a helper DEFINED before the binding but handed the patch text later —
 *   the drift class this guards (inline patch application) is always after the fetch.
 *
 * Scope: viewer/*.js + modeller/*.js (flat; lib/ is vendor). Both apps scanned by default —
 * feat/modeller-nogeo-compose-port (bim-ootb#1273) landed the modeller chunker, so both are green.
 *
 * Self-test: the detector is first run against embedded known-bad fixtures (the two historical
 * bugs, verbatim shapes) and must flag BOTH — a scanner that cannot reproduce the finding it
 * exists for is not a witness.
 *
 * Usage: node tests/witness_chunk_only.js            (exit 0 = PASS, 1 = violations/self-test fail)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const ASSIGN_RES = [
  /(?:var|let|const)?\s*([A-Za-z_$][\w$]*)\s*=\s*await\s+[\w$.]+\.text\(\)/g,
  /\.text\(\)\s*\.then\(\s*function\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g,
  /\.text\(\)\s*\.then\(\s*(?:\(\s*)?([A-Za-z_$][\w$]*)(?:\s*\))?\s*=>/g,
];

function scanSource(src, fileLabel) {
  // ident → line number of its FIRST network-text binding (1-based)
  const netIdents = new Map();
  for (const re of ASSIGN_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const lineNo = src.slice(0, m.index).split('\n').length;
      if (!netIdents.has(m[1]) || netIdents.get(m[1]) > lineNo) netIdents.set(m[1], lineNo);
    }
  }
  const hits = [];
  if (!netIdents.size) return hits;
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('§CHUNK-EXEMPT:')) continue;
    const callRe = /\.(run|exec)\(\s*([A-Za-z_$][\w$]*)\s*[),]/g;
    let c;
    while ((c = callRe.exec(line)) !== null) {
      if (netIdents.has(c[2]) && (i + 1) >= netIdents.get(c[2]))
        hits.push(`${fileLabel}:${i + 1} .${c[1]}(${c[2]})`);
    }
  }
  return hits;
}

// --- self-test: the two historical bugs, verbatim shapes — detector MUST flag both -----------
const FIXTURES = [
  { name: 'needle-2026-08-10', src: 'var sqlText = await r.text();\nA.db.run(sqlText);\n', expect: 1 },
  { name: 'modeller-promise-style', src: 'return r.text().then(function (sql) {\n  pdb.run(sql);\n});\n', expect: 1 },
  { name: 'chunked-is-clean', src: 'var sqlText = await r.text();\nvar _ch = A._runSqlChunked(A.db, sqlText);\n', expect: 0 },
  { name: 'constant-literal-out-of-scope', src: 'var sql = "SELECT 1";\ndb.exec(sql);\n', expect: 0 },
  { name: 'same-name-helper-before-binding', src: 'function _count(db, sql) { var r = db.exec(sql); }\nreturn r.text().then(function (sql) {\n  Modeller._runChunked(pdb, sql);\n});\n', expect: 0 },
];
let selfFail = 0;
for (const f of FIXTURES) {
  const n = scanSource(f.src, f.name).length;
  const ok = n === f.expect;
  console.log(`§CHUNK_ONLY_SELFTEST ${ok ? 'PASS' : 'FAIL'} ${f.name} hits=${n} expect=${f.expect}`);
  if (!ok) selfFail++;
}

// --- scan the real tree ----------------------------------------------------------------------
const dirs = ['viewer', 'modeller'];
let scanned = 0;
const violations = [];
for (const d of dirs) {
  const dir = path.join(ROOT, d);
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    scanned++;
    violations.push(...scanSource(fs.readFileSync(path.join(dir, f), 'utf8'), `${d}/${f}`));
  }
}
for (const v of violations) console.log(`§CHUNK_ONLY_VIOLATION ${v} — network-fetched SQL must go through A._runSqlChunked (or carry §CHUNK-EXEMPT: <reason>)`);
const pass = !selfFail && !violations.length;
console.log(`§CHUNK_ONLY_WITNESS ${pass ? 'PASS' : 'FAIL'} scanned=${scanned} files hits=${violations.length} selftest_fail=${selfFail} scope=${dirs.join(',')}`);
process.exit(pass ? 0 : 1);
