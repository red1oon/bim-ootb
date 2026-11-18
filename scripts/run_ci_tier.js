#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part E, "CI-TIER BUILD SPEC". Runs tests/ci_fast_tier.json in CI.
// Each witness runs from the folder it ran from locally, with a per-witness timeout; a red is believed only when it repeats (one retry,
// as tests/run_witness_suite.js does). The job has a budget: a witness not reached is NAMED, never a silent pass.
// Pass = exit 0 and, when it printed a verdict, verdict=PASS. INCONCLUSIVE / VACUOUS / SKIP on the runner = a red here (the tier holds
// only witnesses that passed locally, so a different answer on the runner is a finding: exclude it with the reason, or fix it).
// USE:  node scripts/run_ci_tier.js [--list FILE] [--budget-s 600] [--timeout-s 60]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const RES = require('../witness_kit/results.js');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.join(__dirname, '..'), LIST = path.resolve(ROOT, opt('--list', 'tests/ci_fast_tier.json'));
const BUDGET = 1000 * +opt('--budget-s', 600), TIMEOUT = 1000 * +opt('--timeout-s', 60);
/** One run of one listed witness, from the folder it ran from locally. `env` = the environment to run it in (the probe strips outside inputs). */
function runOne(w, timeoutMs, env) { const s = Date.now(), r = cp.spawnSync(process.execPath, [path.join(ROOT, w.file)], { cwd: path.join(ROOT, w.cwd || ''), encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, env: env || process.env });
  const out = (r.stdout || '') + (r.stderr || ''), v = RES.verdictOf(out, r.status), timedOut = r.error && r.error.code === 'ETIMEDOUT';
  return { ok: !timedOut && r.status === 0 && v.verdict === 'PASS', v: timedOut ? 'TIMEOUT' : v.verdict, exit: r.status, secs: (Date.now() - s) / 1000, tail: out.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 300) }; }
module.exports = { runOne };
if (require.main !== module) return;
const list = JSON.parse(fs.readFileSync(LIST, 'utf8')).witnesses || [];
const t0 = Date.now(), red = [], green = [], flaky = [], unrun = [];
const once = w => runOne(w, TIMEOUT);
for (const w of list) {
  if (Date.now() - t0 >= BUDGET) { unrun.push(w.file); continue; }
  let r = once(w), again = false;
  if (!r.ok) { const r2 = once(w); again = true; if (r2.ok) { flaky.push(w.file); r = r2; } }
  (r.ok ? green : red).push(w.file);
  console.log(`§CI_TIER_RUN w=${w.file} ok=${r.ok ? 'Y' : 'N'}${again && r.ok ? '(flaky)' : ''} verdict=${r.v} exit=${r.exit} secs=${r.secs.toFixed(1)} local_secs=${w.seconds}${r.ok ? '' : ' tail=' + JSON.stringify(r.tail)}`);
}
const verdict = !list.length ? 'INCONCLUSIVE' : red.length ? 'FAIL' : 'PASS';
console.log(`§CI_TIER_RESULT listed=${list.length} green=${green.length} red=${red.length} flaky=${flaky.length} unrun=${unrun.length} secs=${Math.round((Date.now() - t0) / 1000)} red_list=[${red.join(',')}] unrun_list=[${unrun.join(',')}] verdict=${verdict}`);
process.exit(verdict === 'PASS' ? 0 : 1);
