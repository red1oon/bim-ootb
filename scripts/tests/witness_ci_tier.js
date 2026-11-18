#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-CI-TIER (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part E, "CI-TIER BUILD SPEC"; owner "Fast tier on every PR").
// Read the log after every run: exit code is not evidence. Verdict line: §CI_TIER_W … verdict=PASS|FAIL|INCONCLUSIVE.
// PROVES: scripts/gen_ci_tier.js, scripts/run_ci_tier.js
// ISSUE THIS PROVES OR DISPROVES: "the fast tier lets in a slow, failing, inconclusive or browser witness, keeps a hand-edited list, or passes a
//   CI job in which a listed witness went red".
// INDEPENDENT SOURCE: a cache planted here (known verdicts and seconds) and a temp list with one real passing witness and one planted failing one.
// RED CONTROLS: the slow / INCONCLUSIVE / browser entries must be left out; the failing entry must turn the job red; the committed list must equal
//   what the generator writes from THIS machine's cache (NOT-JUDGED when the cache is empty, e.g. on a runner).
// Command: node scripts/tests/witness_ci_tier.js   (~10 s)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), say = s => process.stdout.write(s + '\n');
const realCache = require(path.join(ROOT, 'witness_kit', 'results.js')).DIR();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w-ci-tier-'));
const checks = []; const check = (k, ok, d) => { checks.push(ok); say(`  §CI_TIER_W_CHECK ${k} ok=${ok ? 'Y' : 'N'} ${d}`); };
let committedJudged = 'NOT-JUDGED';
try {
  // (1) the committed list = the generator's output from this machine's cache
  let cached = 0; try { cached = fs.readdirSync(realCache).filter(f => f.endsWith('.json')).length; } catch (e) { cached = 0; }
  const G0 = require(path.join(ROOT, 'scripts', 'gen_ci_tier.js'));
  if (cached) { const cur = fs.readFileSync(path.join(ROOT, G0.LIST), 'utf8'), t = G0.text(G0.generate(ROOT, JSON.parse(cur).limit_s).list); committedJudged = t === cur ? 'same' : 'DIFFERS'; check('committed_equals_generated', t === cur, `cache_entries=${cached} committed=${committedJudged} (run: node scripts/gen_ci_tier.js --write)`); }
  else say('  §CI_TIER_W_CHECK committed_equals_generated NOT-JUDGED (no local cache: a runner)');
  // (2) the filter, on a planted cache
  process.env.BIM_WITNESS_CACHE = path.join(tmp, 'cache'); fs.mkdirSync(process.env.BIM_WITNESS_CACHE);
  const plant = (file, verdict, exit, seconds) => fs.writeFileSync(path.join(process.env.BIM_WITNESS_CACHE, file.replace(/\//g, '__') + '.json'), JSON.stringify({ file, cwd: '', verdict, exit, seconds }));
  plant('scripts/tests/witness_proof_map.js', 'PASS', 0, 2.5);
  plant('scripts/tests/witness_deps_candidates.js', 'PASS', 0, 30);
  plant('scripts/tests/witness_bump.js', 'INCONCLUSIVE', 0, 1);
  plant('capex/tests/witness_capex_sample.js', 'PASS', 0, 1);
  plant('nope/tests/witness_untracked.js', 'PASS', 0, 1);
  const g = G0.generate(ROOT, 10), kept = g.list.witnesses.map(w => w.file);
  check('filter', kept.join() === 'scripts/tests/witness_proof_map.js' && g.why.slow === 1 && g.why.not_pass === 1 && g.why.browser === 1 && g.why.not_tracked === 1, `kept=${kept.join(',')} why=${JSON.stringify(g.why)}`);
  // (3) the CI runner: a passing list passes, a planted red fails the job
  const bad = path.join(tmp, 'witness_planted_red.js'); fs.writeFileSync(bad, "console.log('§X verdict=FAIL'); process.exit(1);\n");
  const inconc = path.join(tmp, 'witness_planted_inconclusive.js'); fs.writeFileSync(inconc, "console.log('§X verdict=INCONCLUSIVE');\n");
  const rel = f => path.relative(ROOT, f);
  const run = ws => { const l = path.join(tmp, 'list.json'); fs.writeFileSync(l, JSON.stringify({ witnesses: ws })); return cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'run_ci_tier.js'), '--list', l, '--timeout-s', '120'], { encoding: 'utf8' }); };
  const good = run([{ file: 'scripts/tests/witness_proof_map.js', cwd: '', seconds: 2.5 }]);
  check('runner_green', good.status === 0 && /§CI_TIER_RESULT listed=1 green=1 red=0 .*verdict=PASS/.test(good.stdout), `exit=${good.status} ${(good.stdout.match(/§CI_TIER_RESULT.*/) || [''])[0].slice(0, 120)}`);
  const red = run([{ file: 'scripts/tests/witness_proof_map.js', cwd: '', seconds: 2.5 }, { file: rel(bad), cwd: '', seconds: 0.1 }, { file: rel(inconc), cwd: '', seconds: 0.1 }]);
  check('red_job_fails', red.status === 1 && /red=2 .*verdict=FAIL/.test(red.stdout), `exit=${red.status} ${(red.stdout.match(/§CI_TIER_RESULT.*/) || [''])[0].slice(0, 160)}`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
const ok = checks.filter(Boolean).length, verdict = !checks.length ? 'INCONCLUSIVE' : ok === checks.length ? 'PASS' : 'FAIL';
say(`§CI_TIER_W checks=${ok}/${checks.length} committed=${committedJudged} verdict=${verdict}`);
process.exit(verdict === 'PASS' ? 0 : 1);
