#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-PROOF-MAP (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part E, "E1 BUILD SPEC"; owner E-1, E-2).
// Read the log after every run: exit code is not evidence. Verdict line: §PROOF_MAP_W … verdict=PASS|FAIL|INCONCLUSIVE.
// PROVES: scripts/gen_proof_map.js, witness_kit/proves.js, witness_kit/results.js
// ISSUE THIS PROVES OR DISPROVES: "the proof map loses a module, believes a PROVES: line that names no file, shows an INCONCLUSIVE run as a
//   pass, shows a run as current after the witness changed, or shows a stored, stale "named by" list instead of the tests on disk (#3326)".
// INDEPENDENT SOURCE: a temp git repo built here with known modules, PROVES: lines and cache entries, and the real modeller's own counts
//   (module lines of modules.json; PROVES: lines found by a plain text grep).
// RED CONTROLS (must be detected): a PROVES: line naming a missing file (bad_paths=1, exit 1) · a cached INCONCLUSIVE · a witness edited after its run.
// Command: node scripts/tests/witness_proof_map.js   (~3 s)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), say = s => process.stdout.write(s + '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w-proof-map-'));
process.env.BIM_WITNESS_CACHE = path.join(tmp, 'cache');
const PM = require(path.join(ROOT, 'scripts', 'gen_proof_map.js')), RES = require(path.join(ROOT, 'witness_kit', 'results.js'));
const checks = []; const check = (k, ok, d) => { checks.push(ok); say(`  §PROOF_MAP_W_CHECK ${k} ok=${ok ? 'Y' : 'N'} ${d}`); };
try {
  // verdict reading
  const v1 = RES.verdictOf('x\n§FOO a=1 verdict=PASS\n', 0), v2 = RES.verdictOf('§BAR_VERDICT FAIL judged=3', 1), v3 = RES.verdictOf('nothing', 0), v4 = RES.verdictOf('verdict=PASS\nverdict=INCONCLUSIVE', 0);
  check('verdict_read', v1.verdict === 'PASS' && v2.verdict === 'FAIL' && v3.verdict === 'PASS' && v3.from_exit && v4.verdict === 'INCONCLUSIVE', `${v1.verdict} ${v2.verdict} ${v3.verdict}(from_exit=${v3.from_exit}) last-wins=${v4.verdict}`);
  // the temp repo
  const repo = path.join(tmp, 'repo'), g = (...a) => cp.execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.email=w@x', '-c', 'user.name=w', ...a], { cwd: repo, encoding: 'utf8' });
  fs.mkdirSync(path.join(repo, 'app', 'tests'), { recursive: true });
  // B-3 REVISED (#3326): modules.json stores no witnesses; "named by" comes from witnessesOf() over the tests on disk at each run.
  const mod = () => ({ v: 1, load: 'boot', lazyGroup: null, precache: true, deps: [], uses: [], notDeps: [], owner: '' });
  fs.writeFileSync(path.join(repo, 'app', 'modules.json'), JSON.stringify({ modules: { 'app/a.js': mod(), 'app/b.js': mod(), 'app/c.js': mod() } }));
  ['a', 'b', 'c'].forEach(n => fs.writeFileSync(path.join(repo, 'app', n + '.js'), '// ' + n + '\n'));
  fs.writeFileSync(path.join(repo, 'app', 'tests', 'witness_a.js'), '#!/usr/bin/env node\n// PROVES: app/a.js R1\n// ISSUE …\nconsole.log("verdict=INCONCLUSIVE")\n');
  fs.writeFileSync(path.join(repo, 'app', 'tests', 'witness_named.js'), '// only a comment names app/c.js: not counted\nrequire("../b.js");\n');
  g('init', '-q'); g('add', '.'); g('commit', '-qm', 'one');
  RES.record(repo, 'app/tests/witness_a.js', { out: 'verdict=INCONCLUSIVE', exit: 0, seconds: 1 });
  RES.record(repo, 'app/tests/witness_named.js', { out: 'verdict=PASS', exit: 0, seconds: 1 });
  let r = PM.build(repo, 'app');
  const a = r.rows.find(x => x.module === 'app/a.js'), b = r.rows.find(x => x.module === 'app/b.js'), c = r.rows.find(x => x.module === 'app/c.js');
  check('states', a.state === 'proven' && b.state === 'named-only' && c.state === 'unproven' && r.summary.modules === 3, `a=${a.state} b=${b.state} c=${c.state}`);
  check('named_live_not_stored', !/witnesses/.test(fs.readFileSync(path.join(repo, 'app', 'modules.json'), 'utf8')) && b.named.length === 1 && b.named[0].witness === 'app/tests/witness_named.js' && !c.named.length,
    `no stored list; b named by ${b.named.map(x => x.witness)} · c (named in a comment only) named=${c.named.length}`);
  check('red_inconclusive_shown', a.proven[0].verdict === 'INCONCLUSIVE' && a.proven[0].rules.join() === 'R1' && r.summary.inconclusive === 1, `a proven by ${a.proven[0].witness} [${a.proven[0].verdict}] rules=${a.proven[0].rules}`);
  check('fresh_not_stale', a.proven[0].stale === false && b.named[0].verdict === 'PASS' && b.named[0].stale === false, `a stale=${a.proven[0].stale} b=${b.named[0].verdict} stale=${b.named[0].stale}`);
  fs.appendFileSync(path.join(repo, 'app', 'tests', 'witness_a.js'), '// edited after its run\n'); g('commit', '-qam', 'two');
  r = PM.build(repo, 'app');
  check('red_stale_after_edit', r.rows.find(x => x.module === 'app/a.js').proven[0].stale === true && r.rows.find(x => x.module === 'app/b.js').named[0].stale === false, `a stale=${r.rows.find(x => x.module === 'app/a.js').proven[0].stale} b stale=${r.rows.find(x => x.module === 'app/b.js').named[0].stale}`);
  fs.writeFileSync(path.join(repo, 'app', 'tests', 'witness_bad.js'), '// PROVES: app/no_such.js\n'); g('add', '.'); g('commit', '-qm', 'three');
  r = PM.build(repo, 'app');
  const cli = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen_proof_map.js'), 'app', '--root', repo, '--quiet'], { encoding: 'utf8', env: process.env });
  check('red_bad_path', r.summary.bad_paths === 1 && r.bad[0].file === 'app/no_such.js' && cli.status === 1 && /§PROOF_MAP_BAD witness=app\/tests\/witness_bad\.js names=app\/no_such\.js/.test(cli.stdout), `bad_paths=${r.summary.bad_paths} cli_exit=${cli.status}`);
  // the real modeller
  const real = PM.build(ROOT, 'modeller'), mj = JSON.parse(fs.readFileSync(path.join(ROOT, 'modeller', 'modules.json'), 'utf8'));
  const want = Object.keys(mj.modules).filter(f => /\.m?js$/.test(f) && !/(^|\/)lib\//.test(f)).length;
  const grep = cp.execFileSync('git', ['grep', '-h', '-E', '^\\s*(//|\\*)\\s*PROVES:', '--', '*tests/*witness*.js', '*tests/*witness*.mjs'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
    .reduce((n, l) => n + l.replace(/^.*?PROVES:/, '').split(',').filter(x => x.trim()).length, 0);   // entries, as the map counts them
  const s = real.summary;
  check('real_modeller', s.modules === want && s.proven + s.named_only + s.unproven === want && s.bad_paths === 0 && s.proves_lines === grep && s.proven > 0, `modules=${s.modules}/${want} proven=${s.proven} named_only=${s.named_only} unproven=${s.unproven} proves_lines=${s.proves_lines} (grep ${grep}) bad_paths=${s.bad_paths}`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
const ok = checks.filter(Boolean).length, verdict = !checks.length ? 'INCONCLUSIVE' : ok === checks.length ? 'PASS' : 'FAIL';
say(`§PROOF_MAP_W checks=${ok}/${checks.length} verdict=${verdict}`);
process.exit(verdict === 'PASS' ? 0 : 1);
