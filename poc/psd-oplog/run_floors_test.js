// Usage: node run_floors_test.js   Level 3a check-count floors FL1-FL5 (pre-registered in witness_log/HYPOTHESES.md before this file existed). Needs the witness ledger with n_checks (run witness_all.js once), Node 20, system Chrome (CHROMIUM) and PYTHON for the editor_carry run.
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process'), { countChecks } = require('./witness_count.js');
const ROOT = __dirname, TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'floors-')), rec = [], fails = [];
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '>=' ? value >= limit : cmp === '<' ? value < limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push({ id, name, value, cmp, limit }); console.error((pass ? 'PASS ' : 'FAIL ') + id + ' ' + name + ' = ' + value + ' (' + cmp + ' ' + limit + ')'); };
const floorsRun = (args) => spawnSync('node', [path.join(ROOT, 'witness_floors.js'), ...args], { cwd: ROOT, encoding: 'utf8' });
const realFloors = JSON.parse(fs.readFileSync(path.join(ROOT, 'witness_log', 'floors.json'), 'utf8')), CF = realFloors.editor_carry.n;
// FL1 baseline
{ const r = floorsRun([]); chk('FL1', 'real ledger vs real floors: 0 trips (exit code)', r.status, '==', 0); chk('FL1', 'floors.json has editor_carry with a numeric floor (a stderr-only suite the old files could not count)', typeof CF === 'number', '==', true); }
// FL2 the erosion on a real suite: delete ONE chk(...) line of run_carry.js
const src = fs.readFileSync(path.join(ROOT, 'editor', 'run_carry.js'), 'utf8').split('\n'), at = src.findIndex((l) => /^\s*chk\('CF1', 'the file name matches/.test(l));
chk('FL2', 'the line to delete exists in editor/run_carry.js (one chk call on a line of its own)', at >= 0, '==', true);
const MUT = path.join(ROOT, 'editor', 'run_carry_mut.js'); src.splice(at, 1); fs.writeFileSync(MUT, src.join('\n'));
const run = (file) => spawnSync('node', [file], { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 1 << 28, timeout: 600000 });
const base = run(path.join(ROOT, 'editor', 'run_carry.js')), mut = run(MUT); fs.rmSync(MUT, { force: true });
const nb = countChecks(base.stdout, base.stderr), nm = countChecks(mut.stdout, mut.stderr), gateOf = (r) => (r.status === 0 && !/^FAIL\b/m.test(r.stderr + r.stdout) ? 'PASS' : 'FAIL');
chk('FL2', 'unmutated editor_carry: own gate PASS', gateOf(base), '==', 'PASS'); chk('FL2', 'unmutated count equals the floor (a stable count, run 2 of 2 with the ledger run: flaky counts would make a floor a false alarm)', nb, '==', CF);
chk('FL2', 'MUTATED editor_carry (one check deleted): the suite\'s OWN gate still says PASS (the present gate is blind to a deleted check)', gateOf(mut), '==', 'PASS'); chk('FL2', 'MUTATED count is one lower', nm, '==', CF - 1);
const ledgerTxt = fs.readFileSync(path.join(ROOT, 'witness_log', 'ledger.jsonl'), 'utf8'), L2 = path.join(TMP, 'ledger_mut.jsonl');
fs.writeFileSync(L2, ledgerTxt + JSON.stringify({ suite: 'editor_carry', gate: gateOf(mut), n_checks: nm, commit: 'mutated' }) + '\n');
{ const r = floorsRun(['--ledger', L2]); chk('FL2', 'floors check on the mutated result TRIPS (exit 1)', r.status, '==', 1); chk('FL2', 'the trip names editor_carry and the counts', /TRIP editor_carry: \d+ checks < floor \d+/.test(r.stdout), '==', true); }
// FL3 a suite vanishes: ledger and latest dir without editor_carry
{ const ld = path.join(TMP, 'latest'); fs.mkdirSync(ld); for (const f of fs.readdirSync(path.join(ROOT, 'witness_log', 'latest'))) if (!f.startsWith('editor_carry.')) fs.copyFileSync(path.join(ROOT, 'witness_log', 'latest', f), path.join(ld, f));
  const L3 = path.join(TMP, 'ledger_missing.jsonl'); fs.writeFileSync(L3, ledgerTxt.split('\n').filter((l) => l && JSON.parse(l).suite !== 'editor_carry').join('\n') + '\n');
  const r = floorsRun(['--latest', ld, '--ledger', L3]); chk('FL3', 'a floor on a suite whose result is missing TRIPS (exit 1)', r.status, '==', 1); chk('FL3', 'the trip says "result missing"', /TRIP editor_carry: result missing/.test(r.stdout), '==', true); }
// FL4 ratchet only up
{ const F = path.join(TMP, 'floors4.json'); fs.writeFileSync(F, JSON.stringify({ editor_carry: { n: CF } }));
  const up = path.join(TMP, 'l_up.jsonl'), down = path.join(TMP, 'l_down.jsonl'); fs.writeFileSync(up, JSON.stringify({ suite: 'editor_carry', gate: 'PASS', n_checks: CF + 5 }) + '\n'); fs.writeFileSync(down, JSON.stringify({ suite: 'editor_carry', gate: 'PASS', n_checks: CF - 5 }) + '\n');
  const empty = path.join(TMP, 'empty'); fs.mkdirSync(empty);
  floorsRun(['--raise', '--floors', F, '--ledger', up, '--latest', empty]); chk('FL4', '--raise after a run with MORE checks raises the floor', JSON.parse(fs.readFileSync(F, 'utf8')).editor_carry.n, '==', CF + 5);
  floorsRun(['--raise', '--floors', F, '--ledger', down, '--latest', empty]); chk('FL4', '--raise after a run with FEWER checks leaves the floor unchanged (never lowers)', JSON.parse(fs.readFileSync(F, 'utf8')).editor_carry.n, '==', CF + 5); }
// FL5 limits stated before the result: suites that carry no count are gate-only
{ const gateOnly = Object.entries(realFloors).filter(([, v]) => v.n == null).map(([k]) => k); console.error('FL5 gate-only suites (the ratchet cannot see erosion inside them): ' + gateOnly.join(', ')); chk('FL5', 'number of suites with a count floor (of ' + Object.keys(realFloors).length + ')', Object.keys(realFloors).length - gateOnly.length, '>=', 30); }
const out = { n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails, checks: rec, node: process.version }; console.log(JSON.stringify({ ...out, checks: undefined }, null, 1)); process.exit(fails.length ? 1 : 0);
