#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part E, "E1 BUILD SPEC" (owner E-1: `PROVES:` line; E-2: last run in ~/.cache).
// ISSUE: nothing says which witness proves which module, or what it last said. This prints, per module of <app>/modules.json:
//   proven by  — witnesses whose PROVES: line names it (strong)
//   named by   — B1's extracted `witnesses` (the test names the file in a string: weaker, shown apart)
//   each with its last cached verdict (witness_kit/results.js) and `stale` when the module or the witness changed after that run's commit.
//   INCONCLUSIVE is never shown as PASS; a witness never run through a runner says `no run recorded`. Dev-side; writes nothing in the tree.
// USE:  node scripts/gen_proof_map.js modeller [--root DIR] [--out FILE] [--quiet]
// Witness: scripts/tests/witness_proof_map.js (W-PROOF-MAP). Read the log: the §PROOF_MAP line is the result.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { trackedFiles } = require('./lib/tracked_files.js'), { provesOf } = require('../witness_kit/proves.js'), RES = require('../witness_kit/results.js');

function changedSince(root, head, files) {
  if (!head) return null;
  try { const out = cp.execFileSync('git', ['diff', '--name-only', head, 'HEAD', '--', ...files], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); return out.split('\n').filter(Boolean).length > 0; }
  catch (e) { return null; }   // the run's commit is not in this clone: unknown, said as such
}
/**
 * @returns {{rows:object[], bad:object[], summary:object}}
 */
function build(root, app) {
  const m = JSON.parse(fs.readFileSync(path.join(root, app, 'modules.json'), 'utf8'));
  const tests = trackedFiles(root).filter(f => /(^|\/)tests?\/[^/]*witness[^/]*\.(js|mjs)$/.test(f));
  const proves = new Map(), bad = []; let lines = 0;
  for (const t of tests) {
    let src; try { src = fs.readFileSync(path.join(root, t), 'utf8'); } catch (e) { continue; }
    for (const p of provesOf(src)) {
      lines++;
      if (!fs.existsSync(path.join(root, p.file))) { bad.push({ witness: t, file: p.file }); continue; }
      (proves.get(p.file) || proves.set(p.file, []).get(p.file)).push({ witness: t, rules: p.rules });
    }
  }
  const run = (mod, w) => { const r = RES.last(w); if (!r) return { verdict: 'no run recorded' }; const st = changedSince(root, r.head, [mod, w]); return { verdict: r.verdict, from_exit: r.from_exit, at: r.at, seconds: r.seconds, stale: st }; };
  const rows = Object.keys(m.modules).sort().filter(f => /\.m?js$/.test(f) && !/(^|\/)lib\//.test(f)).map(f => {
    const pr = (proves.get(f) || []).map(x => Object.assign({ witness: x.witness, rules: x.rules }, run(f, x.witness)));
    const nm = m.modules[f].witnesses.filter(w => !pr.some(x => x.witness === w)).map(w => Object.assign({ witness: w }, run(f, w)));
    return { module: f, owner: m.modules[f].owner, proven: pr, named: nm, state: pr.length ? 'proven' : nm.length ? 'named-only' : 'unproven' };
  });
  const all = rows.flatMap(r => r.proven.concat(r.named));
  const summary = { app, modules: rows.length, proven: rows.filter(r => r.state === 'proven').length, named_only: rows.filter(r => r.state === 'named-only').length,
    unproven: rows.filter(r => r.state === 'unproven').length, proves_lines: lines, bad_paths: bad.length, cached: all.filter(x => x.verdict !== 'no run recorded').length,
    stale: all.filter(x => x.stale === true).length, inconclusive: all.filter(x => /INCONCLUSIVE|VACUOUS|NOT-JUDGED|SKIP/.test(x.verdict)).length };
  return { rows, bad, summary };
}
const show = x => x.witness + ' [' + x.verdict + (x.stale ? ', stale' : '') + (x.from_exit ? ', from exit code' : '') + ']';
module.exports = { build };

if (require.main === module) {
  const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const app = argv.find((a, i) => !a.startsWith('--') && !['--root', '--out'].includes(argv[i - 1]));
  const root = path.resolve(opt('--root') || path.join(__dirname, '..'));
  if (!app) { console.error('usage: node scripts/gen_proof_map.js <app> [--root DIR] [--out FILE] [--quiet]'); process.exit(1); }
  const r = build(root, app);
  r.bad.forEach(b => console.log(`§PROOF_MAP_BAD witness=${b.witness} names=${b.file} (no such file)`));
  if (!argv.includes('--quiet')) for (const x of r.rows) console.log(`${x.state.padEnd(10)} ${x.module}` + (x.proven.length ? '\n    proven by ' + x.proven.map(show).join(' · ') : '') + (x.named.length ? '\n    named by  ' + x.named.slice(0, 6).map(show).join(' · ') + (x.named.length > 6 ? ' · +' + (x.named.length - 6) : '') : ''));
  console.log('§PROOF_MAP ' + Object.entries(r.summary).map(([k, v]) => k + '=' + v).join(' '));
  if (opt('--out')) { const out = path.resolve(opt('--out')); if (!path.relative(root, out).startsWith('..')) { console.log('§PROOF_MAP_ERR --out must be outside the tree'); process.exit(1); } fs.writeFileSync(out, JSON.stringify(r, null, 1)); }
  process.exit(r.bad.length ? 1 : 0);
}
