#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-PATHS (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part E, "E0 BUILD SPEC").
// Read the log after every run: exit code is not evidence. Verdict line: §PATHS … verdict=PASS|FAIL|INCONCLUSIVE.
// ISSUE THIS PROVES OR DISPROVES: "witness_kit/paths.js cannot stand in for the home folders witnesses hard-code today" — if a resolver
//   returned a different folder than the string it replaces, converting a witness to it would change what that witness reads.
// INDEPENDENT SOURCE: the hard-coded strings themselves (the roots measured in 326 witness files), resolved with fs.realpathSync on both
//   sides; the git toplevel of this file for the worktree claim; a child process for the env overrides.
// RED CONTROLS (must throw): an unknown input name · need() on a missing path (message starts "MISSING input") · a node module in none
//   of the three folders (the message names all three).
// NOT-JUDGED, never PASS: a measured root that does not exist on this machine (a CI runner). INCONCLUSIVE: 0 rows judged.
// Command: node witness_kit/tests/witness_paths.js   (< 1 s)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const P = require(path.join(__dirname, '..', 'paths.js')), say = s => process.stdout.write(s + '\n');
const H = os.homedir(), real = p => { try { return fs.realpathSync(p); } catch (e) { return null; } };

// the hard-coded spellings measured on main b9b2e522 (count = witness files using it) -> the resolver call that replaces it
const ROWS = [
  ['/home/red1/bim-compiler/node_modules', 125, () => P.compiler('node_modules')],
  ['/home/red1/bim-compiler/deploy', 23, () => P.compiler('deploy')],
  ['/home/red1/bim-compiler/scripts', 9, () => P.compiler('scripts')],
  [H + '/bim-compiler/node_modules/puppeteer', 11, () => P.nodeModule('puppeteer')],
  ['/home/red1/bim-ootb/node_modules/sql.js', 12, () => P.nodeModule('sql.js')],
  ['/home/red1/bim-ootb/tests/node_modules/playwright', 108, () => P.nodeModule('playwright')],
  [H + '/bim-ootb/buildings', 46, () => P.input('buildings')],
  [H + '/Videos/dxf2bim_film_work/why/cli/marked', 33, () => P.input('shed_marked')],
  [H + '/Videos/dxf2bim_film_work/why/raw', 3, () => P.input('shed_raw')],
  [H + '/Downloads/JALAN JELAPANG IFC', 37, () => P.input('civil_ifc')],
];
let judged = 0, same = 0, notJudged = 0; const fails = [];
const clean = Object.assign({}, process.env); ['BIM_COMPILER_ROOT', 'SHED_RAW_DIR', 'SHED_MARKED_DIR', 'SHED_MARKED', 'BLD_DIR', 'BUILDINGS_DIR'].forEach(k => delete clean[k]);
const envSet = ['BIM_COMPILER_ROOT', 'SHED_RAW_DIR', 'SHED_MARKED_DIR', 'SHED_MARKED', 'BLD_DIR', 'BUILDINGS_DIR'].filter(k => process.env[k]);
if (envSet.length) say('  NOTE  env set in this shell (rows judged with them as the user would): ' + envSet.join(','));
for (const [hard, n, fn] of ROWS) {
  const a = real(hard);
  let got; try { got = fn(); } catch (e) { got = 'THREW ' + e.message.slice(0, 80); }
  if (!a) { notJudged++; say(`  §PATHS_ROW hard=${JSON.stringify(hard)} files=${n} resolver=${JSON.stringify(got)} NOT-JUDGED (not on this machine)`); continue; }
  judged++; const ok = real(got) === a; if (ok) same++; else fails.push(hard);
  say(`  §PATHS_ROW hard=${JSON.stringify(hard)} files=${n} resolver=${JSON.stringify(got)} same=${ok ? 'Y' : 'N'}`);
}
// (2) the tree under test is the tree this file lives in (a worktree resolves to itself, not to ~/bim-ootb)
let top = null; try { top = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: __dirname, encoding: 'utf8' }).trim(); } catch (e) { top = null; }
const treeOk = !!top && real(P.ootb()) === real(top);
say(`  §PATHS_TREE ootb=${P.ootb()} git_toplevel=${top} same=${treeOk ? 'Y' : 'N'}${top && real(top) !== real(H + '/bim-ootb') ? ' (a worktree: the shared checkout is NOT used)' : ''}`);
// (3) env overrides, in a child process with a clean env
const probe = `const P=require(${JSON.stringify(path.join(__dirname, '..', 'paths.js'))});console.log(JSON.stringify([P.compiler(),P.input('shed_raw'),P.input('shed_marked'),P.input('civil_ifc')]))`;
const child = env => JSON.parse(cp.execFileSync(process.execPath, ['-e', probe], { env: Object.assign({}, clean, env), encoding: 'utf8' }));
const e1 = child({ BIM_COMPILER_ROOT: '/tmp/w_paths_c', SHED_RAW_DIR: '/tmp/w_paths_r', SHED_MARKED: '/tmp/w_paths_m2', BLD_DIR: '/tmp/w_paths_b' });
const e2 = child({ SHED_MARKED_DIR: '/tmp/w_paths_m1', SHED_MARKED: '/tmp/w_paths_m2' });
const envOk = e1[0] === '/tmp/w_paths_c' && e1[1] === '/tmp/w_paths_r' && e1[2] === '/tmp/w_paths_m2' && e1[3] === '/tmp/w_paths_b' && e2[2] === '/tmp/w_paths_m1';
say(`  §PATHS_ENV override=${JSON.stringify(e1)} first_of_two=${e2[2]} ok=${envOk ? 'Y' : 'N'}`);
// (4) red controls
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const red = [
  ['unknown input', throws(() => P.input('no_such_input'), /unknown input "no_such_input"/)],
  ['need on a missing path', throws(() => P.need('/tmp/w_paths_no_such_file_' + process.pid, 'probe'), /^MISSING input /)],
  ['module in none of the folders', throws(() => P.nodeModule('zz-w-paths-no-such-module'), new RegExp('^MISSING input .*' + P.moduleDirs().map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(', ')))],
];
red.forEach(([k, ok]) => say(`  §PATHS_RED ${k} detected=${ok ? 'Y' : 'N'}`));
fails.forEach(f => say('  §PATHS_FAIL resolver differs from the hard-coded ' + f));
const redOk = red.every(x => x[1]);
const verdict = !judged || !redOk ? 'INCONCLUSIVE' : (same === judged && treeOk && envOk ? 'PASS' : 'FAIL');
say(`§PATHS roots=${ROWS.length} judged=${judged} same=${same}/${judged} not_judged=${notJudged} tree=${treeOk ? 'Y' : 'N'} env_override=${envOk ? 'Y' : 'N'} red=${red.filter(x => x[1]).length}/${red.length} verdict=${verdict}`);
process.exit(verdict === 'PASS' ? 0 : 1);
