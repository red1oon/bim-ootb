// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part E, "E1 BUILD SPEC" (owner E-2: "Yes, ~/.cache JSON").
// One small JSON per witness, its LAST run: {file, cwd (the folder it ran from, repo-relative), verdict, from_exit, line, exit, seconds, head, at}, in ~/.cache/bim_witness/ (never committed).
// Written by the runners that already spawn witnesses (tests/run_witness_suite.js, modeller/tests/run_all_witnesses.js, scripts/bump.js's touch gate);
// read by the proof map and scripts/gen_ci_tier.js.
// verdict = the last `verdict=WORD` or `_VERDICT WORD` the witness printed; with none, PASS/FAIL from the exit code (from_exit=true). Never throws.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const DIR = () => process.env.BIM_WITNESS_CACHE || path.join(os.homedir(), '.cache', 'bim_witness');
const keyOf = rel => rel.replace(/[\/\\]/g, '__') + '.json';
const WORDS = 'PASS|FAIL|INCONCLUSIVE|VACUOUS|NOT-JUDGED|HARNESS-FAIL|PASS-with-INCONCLUSIVE|SKIP';
function verdictOf(out, exit) {
  const re = new RegExp('(?:verdict=|_VERDICT\\s+)(' + WORDS + ')\\b', 'g'); let m, last = null, line = '';
  for (const l of String(out || '').split('\n')) { re.lastIndex = 0; while ((m = re.exec(l))) { last = m[1]; line = l.trim().slice(0, 300); } }
  return last ? { verdict: last, from_exit: false, line } : { verdict: exit === 0 ? 'PASS' : 'FAIL', from_exit: true, line: '' };
}
const heads = new Map();
function headOf(dir) { if (!heads.has(dir)) { try { heads.set(dir, cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch (e) { heads.set(dir, ''); } } return heads.get(dir); }
/** @param {string} root - repo root  @param {string} file - witness path (absolute or root-relative) */
function record(root, file, r) {
  try {
    const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
    const v = verdictOf(r.out, r.exit);
    const rec = { file: rel, cwd: r.cwd != null ? String(r.cwd).split(path.sep).join('/') : '', verdict: v.verdict, from_exit: v.from_exit, line: v.line, exit: r.exit, seconds: Math.round((r.seconds || 0) * 10) / 10, head: headOf(root), at: new Date().toISOString() };
    fs.mkdirSync(DIR(), { recursive: true }); fs.writeFileSync(path.join(DIR(), keyOf(rel)), JSON.stringify(rec) + '\n');
    return rec;
  } catch (e) { return null; }
}
function last(rel) { try { return JSON.parse(fs.readFileSync(path.join(DIR(), keyOf(rel)), 'utf8')); } catch (e) { return null; } }
module.exports = { record, last, verdictOf, DIR };
