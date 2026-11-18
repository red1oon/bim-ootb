#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-SETUP. SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.39 (bim-ootb #3297). Read the log after every run: exit code is not evidence.
// PROVES: scripts/setup.js
// PROVES: scripts/lib/tracked_files.js
// LOCAL ONLY (not in CI): `npm ci` needs the network, T9 needs VS Code + xvfb-run. T9 starts VS Code only with --go (owner rule: no GUI run without a go); without it the verdict is INCONCLUSIVE, never PASS.
// Command: node scripts/tests/witness_setup.js [--go] [--tree <folder>]      --tree = the "download" to judge (default: this working tree, tracked + untracked files, as a ZIP has no .git). RED control: --tree <git archive of the OLD main>.
// Each check names the issue it proves or disproves:
//  T0 the documented fetch URL (GitHub's anonymous tarball of main) answers 200 — HEAD only, read-only; offline = INCONCLUSIVE   (a guide step 0 that points at a dead URL)
//  T1 a ZIP cannot run manifest/bump (no espree) and says so in ONE line naming setup.js, while proof_map no longer needs git        (the stack trace + "not a git repository" defects)
//  T2 after setup.js, the three tools work in the same folder — judged by running them again here, not by trusting setup's own report   (the "too much typing" defect)
//  T3 a second run is idempotent                                                                                                          (a setup script that breaks on re-run)
//  T4 without --install nothing is created under the user's HOME and no Marketplace extension is installed                                  (never touch the owner's profile)
//  T5 the §SETUP_VSC counts equal an independent count of .vscode/                                                                        (a status line that does not match the files)
//  T6 --dry-run changes nothing in the folder                                                                                             (a "dry" run that writes)
//  T7 a missing `code` is a loud gap line with the one-line fix; FAIL only when VS Code was asked for                                       (silent failure)
//  T8 with node_modules removed the tools print the one §NEED_DEPS line and no stack trace                                                  (the raw "Cannot find module espree")
//  T9 REAL VS Code: the folder opens, Code Facts is found + active from setup's own extensions folder, the task list equals tasks.json's labels   (the VS Code side is not just files on disk)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..'), argv = process.argv.slice(2), GO = argv.includes('--go'), ti = argv.indexOf('--tree'), TREE = ti >= 0 ? path.resolve(argv[ti + 1]) : null;
const say = s => console.log(s), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-w-')), DL = path.join(TMP, 'download');
const sh = (cmd, args, o) => { const r = cp.spawnSync(cmd, args, Object.assign({ encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }, o)); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* gone */ } });   // also after a crash
let fail = 0, pass = 0, inconclusive = 0;
const check = (id, label, cond, extra) => { say('  ' + (cond ? 'PASS ' : 'FAIL ') + id + ' ' + label + (extra ? '  [' + extra + ']' : '')); cond ? pass++ : fail++; return !!cond; };
const stat = (id, label, why) => { say('  INCONCLUSIVE ' + id + ' ' + label + ' — ' + why); inconclusive++; };
const treeHash = d => { const h = crypto.createHash('sha1'); (function w(p) { for (const n of fs.readdirSync(path.join(d, p)).sort()) { const r = p ? p + '/' + n : n, st = fs.lstatSync(path.join(d, r)); if (st.isDirectory()) w(r); else h.update(r + ':' + st.size + ';'); } })(''); return h.digest('hex'); };
const tool = (cwd, args, env) => sh(process.execPath, args, { cwd, env: Object.assign({}, process.env, env || {}) });
const setup = (cwd, args, env) => tool(cwd, ['scripts/setup.js'].concat(args || []), env);
const line = (t, re) => (t.split('\n').find(l => re.test(l)) || '');

// the "download": a folder with the tree's files and NO .git (what GitHub's ZIP gives)
fs.mkdirSync(DL, { recursive: true });
if (TREE) sh('bash', ['-c', `cp -a "${TREE}/." "${DL}/"`]);
else sh('bash', ['-c', `git -C "${ROOT}" ls-files -co --exclude-standard -z | tar --null -T - -C "${ROOT}" -cf - | tar -x -C "${DL}"`]);
const files = fs.readdirSync(DL).length; say(`§SETUP_W download=${DL} top_entries=${files} git_dir=${fs.existsSync(path.join(DL, '.git')) ? 'Y' : 'N'} node_modules=${fs.existsSync(path.join(DL, 'node_modules')) ? 'Y' : 'N'} tree=${TREE || 'working tree'}`);
const pristine = path.join(TMP, 'pristine'); sh('bash', ['-c', `cp -a "${DL}" "${pristine}"`]);

// T0 (read-only: HEAD, follows the redirect to codeload; offline or no curl = INCONCLUSIVE, never PASS)
{ const url = 'https://github.com/red1oon/bim-ootb/archive/refs/heads/main.tar.gz', r = sh('curl', ['-sIL', '--max-time', '20', '-o', '/dev/null', '-w', '%{http_code}', url]), st = (r.out.match(/\d{3}$/) || ['000'])[0];
  say(`§SETUP_FETCH url=${url} status=${st}`);
  if (st === '000') stat('T0', 'the documented tarball URL answers 200', 'no network or no curl'); else check('T0', 'the documented tarball URL answers 200 (anonymous HEAD)', st === '200', 'status=' + st); }
// T1
{ const m = tool(DL, ['scripts/gen_manifest.js', '--check', 'modeller']), b = tool(DL, ['scripts/bump.js', 'modeller/arc_editable.js']), p = tool(DL, ['scripts/gen_proof_map.js', 'modeller']);
  const one = t => t.trim().split('\n').length === 1 && /^§NEED_DEPS .*node scripts\/setup\.js/.test(t.trim());
  check('T1', 'before setup: manifest and bump stop with the ONE §NEED_DEPS line naming setup.js', m.code !== 0 && b.code !== 0 && one(m.out) && one(b.out), 'manifest exit=' + m.code + ' bump exit=' + b.code + ' first=' + JSON.stringify(m.out.trim().split('\n')[0].slice(0, 90)));
  check('T1', 'before setup: proof_map needs no git and no install (works in a folder with no .git)', p.code === 0 && /§PROOF_MAP .*bad_paths=0/.test(p.out), 'exit=' + p.code + ' ' + line(p.out, /§PROOF_MAP/).slice(0, 80)); }
// T2
const s1 = setup(DL), v1 = line(s1.out, /^§SETUP steps=/);
check('T2', 'setup.js ends §SETUP … verdict=PASS with no gaps', /verdict=PASS/.test(v1) && /gaps=0/.test(v1) && s1.code === 0, v1);
{ const m = tool(DL, ['scripts/gen_manifest.js', '--check', 'modeller']), p = tool(DL, ['scripts/gen_proof_map.js', 'modeller']), b = tool(DL, ['scripts/bump.js', 'modeller/arc_editable.js']);
  check('T2', 'then, run here: manifest --check verdict=PASS', m.code === 0 && /§MANIFEST_CHECK .*verdict=PASS/.test(m.out), line(m.out, /§MANIFEST_CHECK/).slice(0, 110));
  check('T2', 'then, run here: proof_map bad_paths=0', p.code === 0 && /bad_paths=0/.test(p.out));
  check('T2', 'then, run here: bump dry run exits 0 and prints its §BUMP line', b.code === 0 && /§BUMP/.test(b.out));
  check('T2', 'the folder never became a git repository (no git init)', !fs.existsSync(path.join(DL, '.git'))); }
// T3
{ const s2 = setup(DL), v2 = line(s2.out, /^§SETUP steps=/);
  check('T3', 'second run: deps skipped=present, same verdict PASS', /§SETUP_DEPS skipped=present/.test(s2.out) && /verdict=PASS/.test(v2) && s2.code === 0, line(s2.out, /§SETUP_DEPS/) + ' | ' + v2); }
// T4
{ const home = path.join(TMP, 'home'); fs.mkdirSync(home); const s = setup(DL, [], { HOME: home }), made = fs.readdirSync(home), vsc = line(s.out, /^§SETUP_VSC/);
  check('T4', 'with an empty HOME, setup creates nothing under it', made.length === 0, 'created=' + JSON.stringify(made));
  check('T4', 'no --install: mode=throwaway, eslint=recommended (listed, not installed)', /mode=throwaway/.test(vsc) && /eslint=recommended/.test(vsc) && /ext_dir=\S*\.setup\/vscode-ext/.test(vsc), vsc.slice(0, 120)); }
// T5
{ const rd = f => { try { return fs.readFileSync(path.join(DL, '.vscode', f), 'utf8'); } catch (e) { return ''; } }, n = (t, re) => (t.match(re) || []).length;
  const want = { tasks: n(rd('tasks.json'), /"label"\s*:/g), snippets: n(rd('witness.code-snippets'), /"prefix"\s*:/g), launch: n(rd('launch.json'), /"name"\s*:/g) > 0 ? 'Y' : 'N' };
  const vsc = line(setup(DL).out, /^§SETUP_VSC/), got = { tasks: +((/tasks=(\d+)/.exec(vsc) || [])[1]), snippets: +((/snippets=(\d+)/.exec(vsc) || [])[1]), launch: (/launch=(\w)/.exec(vsc) || [])[1] };
  check('T5', '§SETUP_VSC tasks/snippets/launch equal an independent count of .vscode/', got.tasks === want.tasks && got.snippets === want.snippets && got.launch === want.launch && want.tasks > 0, 'want=' + JSON.stringify(want) + ' got=' + JSON.stringify(got));
  check('T5', 'eslint=recommended agrees with extensions.json', /dbaeumer\.vscode-eslint/.test(rd('extensions.json')) === /eslint=recommended/.test(vsc)); }
// T6
{ const h0 = treeHash(pristine), s = setup(pristine, ['--dry-run']), h1 = treeHash(pristine);
  check('T6', '--dry-run: verdict=DRY and the folder is byte-for-byte the same (no node_modules, no .setup, no dist)', /verdict=DRY/.test(s.out) && h0 === h1, line(s.out, /^§SETUP steps=/)); }
// T7
{ const bin = path.join(TMP, 'bin'); fs.mkdirSync(bin);
  for (const n of ['node', 'npm', 'python3', 'sh']) { const r = sh('sh', ['-c', 'command -v ' + n]).out.trim(); if (r) fs.symlinkSync(fs.realpathSync(r), path.join(bin, n)); }
  const env = { PATH: bin }, a = setup(DL, ['--open'], env), b = setup(DL, [], env);
  check('T7', '--open without `code`: a §SETUP_GAP step=S4 line with a fix=, verdict FAIL, exit 1', /§SETUP_GAP step=S4 .*fix=/.test(a.out) && /verdict=FAIL/.test(a.out) && a.code === 1, line(a.out, /§SETUP_GAP/).slice(0, 110));
  check('T7', 'no --open: the same gap is still printed, the tools part still counts (verdict PASS)', /§SETUP_GAP step=S4 .*fix=/.test(b.out) && /code=missing/.test(b.out) && /verdict=PASS/.test(b.out) && b.code === 0); }
// T8
{ const nm = path.join(DL, 'node_modules'), had = fs.existsSync(nm); if (had) fs.renameSync(nm, nm + '.off'); const m = tool(DL, ['scripts/gen_manifest.js', '--check', 'modeller']), b = tool(DL, ['scripts/bump.js', 'modeller/arc_editable.js']); if (had) fs.renameSync(nm + '.off', nm);
  check('T8', 'node_modules removed: manifest and bump print one §NEED_DEPS line, no stack trace', [m, b].every(x => /^§NEED_DEPS .*node scripts\/setup\.js$/.test(x.out.trim()) && !/\n\s+at /.test(x.out)), JSON.stringify(m.out.trim().slice(0, 100))); }
// T9
{ const BIN = [process.env.VSCODE_BIN, '/snap/code/current/usr/share/code/code', '/usr/share/code/code', '/usr/lib/code/code', '/opt/visual-studio-code/code'].filter(Boolean).find(p => fs.existsSync(p));
  const has = n => cp.spawnSync('which', [n]).status === 0, extDir = path.join(DL, '.setup', 'vscode-ext'), userDir = path.join(DL, '.setup', 'vscode-user');
  if (!GO) stat('T9', 'real VS Code opens the folder with Code Facts active and the tasks listed', 'not started: this launches VS Code. Pass --go (owner rule: no GUI run without a go)');
  else if (!BIN || !has('xvfb-run')) stat('T9', 'real VS Code …', 'VS Code program or xvfb-run not found (set VSCODE_BIN)');
  else if (!fs.existsSync(extDir)) check('T9', 'setup left an extensions folder for the window (codefacts=installed)', false, extDir + ' missing');
  else {
    const out = path.join(TMP, 'vsc.json'), env = Object.assign({}, process.env, { SETUP_VSC_OUT: out }); delete env.ELECTRON_RUN_AS_NODE;
    const r = cp.spawnSync('xvfb-run', ['-a', BIN, '--no-sandbox', '--disable-gpu', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--user-data-dir=' + userDir, '--extensions-dir=' + extDir,
      '--extensionDevelopmentPath=' + path.join(ROOT, 'devtools/vscode/code-facts/tests/realvsc/empty_driver'), '--extensionTestsPath=' + path.join(__dirname, 'setup_vsc_suite.js'), DL], { env, encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 26 });
    say('  VS Code run: exit=' + r.status);
    const a = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
    if (!a) check('T9', 'VS Code left a result file', false, 'exit=' + r.status);
    else { const labels = [...fs.readFileSync(path.join(DL, '.vscode', 'tasks.json'), 'utf8').matchAll(/"label"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
      say('§SETUP_W_VSC ' + JSON.stringify({ vscode: a.vscode, folder: a.folder, codefacts_found: a.codefacts_found, codefacts_active: a.codefacts_active, tasks: (a.tasks || []).length }));
      check('T9', 'VS Code opened the setup folder', !!a.folder && fs.realpathSync(a.folder) === fs.realpathSync(DL), a.folder);
      check('T9', 'Code Facts is found and active, from setup\'s own extensions folder', !!a.codefacts_found && !!a.codefacts_active && !!a.codefacts_path && a.codefacts_path.startsWith(extDir), a.codefacts_path);
      check('T9', 'the task list holds exactly the ' + labels.length + ' labels of tasks.json', labels.length > 0 && JSON.stringify([...labels].sort()) === JSON.stringify([...(a.tasks || [])].sort()), 'listed=' + (a.tasks || []).length + (a.error ? ' error=' + a.error.split('\n')[0] : '')); } } }
const verdict = fail ? 'FAIL' : inconclusive ? 'INCONCLUSIVE' : 'PASS';
say(`§SETUP_W checks=${pass + fail} pass=${pass} fail=${fail} inconclusive=${inconclusive} verdict=${verdict}`);
process.exit(fail ? 1 : 0);
