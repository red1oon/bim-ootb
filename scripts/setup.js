#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.39 (bim-ootb #3297). Witness: scripts/tests/witness_setup.js (W-SETUP). Read the output: exit code is not evidence.
// ONE command from a fresh GitHub ZIP download to a working dev setup:   node scripts/setup.js [--open] [--install] [--serve [port]] [--no-code-facts] [--dry-run]
//   S1 prerequisites · S2 npm ci (the lockfile's versions; the manifest/bump tools need espree) · S3 the three dev tools run in THIS folder and their own verdict lines are read ·
//   S4 the VS Code side: Code Facts packed + installed, .vscode/ tasks, snippets, launch, recommended extensions counted · S5 the next lines to serve / open.
// Idempotent. Never touches your VS Code profile unless --install (default: a throwaway extensions + user-data folder under <folder>/.setup/). No network except `npm ci`
// (+ the Marketplace for the recommended extensions under --install). No git init, no writes outside the folder. One § line per step; the last line is §SETUP … verdict=.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..'), argv = process.argv.slice(2), has = f => argv.includes(f);
const DRY = has('--dry-run'), INSTALL = has('--install'), OPEN = has('--open'), NOX0 = has('--no-code-facts'), si = argv.indexOf('--serve');
const SERVE = si >= 0 ? (/^\d+$/.test(argv[si + 1] || '') ? +argv[si + 1] : 8000) : 0;
const CODE_FIX = "VS Code: Command Palette > Shell Command: Install 'code' command in PATH (or install from https://code.visualstudio.com), then run node scripts/setup.js again";
const say = s => console.log(s), gaps = []; let steps = 0, ok = 0;
// a hard gap fails the verdict; a soft gap is reported (with its fix) but the part the user asked for still counts
const gap = (step, what, fix, soft) => { gaps.push({ step, hard: !soft }); say(`§SETUP_GAP step=${step} what=${JSON.stringify(what)}` + (fix ? ` fix=${JSON.stringify(fix)}` : '')); };
const run = (cmd, args, o) => { const r = cp.spawnSync(cmd, args, Object.assign({ cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }, o)); return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || ''), status: r.status }; };
const which = n => { const r = cp.spawnSync('sh', ['-c', 'command -v ' + n], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
const last = t => t.trim().split('\n').slice(-1)[0].slice(0, 160);
const jsonc = require('./lib/jsonc.js').read;   // JSONC (comments, trailing commas): the one reader, shared with W-VSC-OPERATIONAL
const step = fn => { steps++; const g0 = gaps.filter(g => g.hard).length; fn(); if (gaps.filter(g => g.hard).length === g0) ok++; };

const node = process.versions.node, npm = which('npm'), py = which('python3'), code = which('code');
// S1
step(() => {
  say(`§SETUP_PREREQ node=${node} npm=${npm ? 'Y' : 'N'} python3=${py ? 'Y' : 'N'} code=${code || 'missing'}`);
  if (+node.split('.')[0] < 18) gap('S1', 'node ' + node + ' is older than 18', 'install Node 18 or newer');
  if (!npm) gap('S1', 'npm not found', 'install Node from https://nodejs.org (npm comes with it)');
  if (!py && SERVE) gap('S1', 'python3 not found (needed by --serve)', 'install python3, or serve the folder with any static server');
});
// S2
step(() => {
  const dep = () => fs.existsSync(path.join(ROOT, 'node_modules', 'espree'));
  if (dep()) return say('§SETUP_DEPS skipped=present');
  if (DRY) return say('§SETUP_DEPS would="npm ci --no-audit --no-fund"');
  if (!npm) return gap('S2', "npm missing, cannot install the tools' dependencies");
  const r = run('npm', ['ci', '--no-audit', '--no-fund']);
  say(`§SETUP_DEPS npm_ci=${r.ok ? 'ok' : 'FAIL'} espree=${dep() ? 'Y' : 'N'}`);
  if (!r.ok) gap('S2', 'npm ci failed: ' + last(r.out), 'check the network, then run node scripts/setup.js again');
});
// S3
step(() => {
  if (DRY) return say('§SETUP_TOOLS would="gen_manifest.js --check modeller · gen_proof_map.js modeller · bump.js modeller/arc_editable.js"');
  const tools = [['manifest', ['scripts/gen_manifest.js', '--check', 'modeller'], /§MANIFEST_CHECK .*verdict=PASS/], ['proof_map', ['scripts/gen_proof_map.js', 'modeller'], /§PROOF_MAP .*bad_paths=0/], ['bump', ['scripts/bump.js', 'modeller/arc_editable.js'], /§BUMP/]];
  const res = tools.map(([n, a, re]) => { const r = run(process.execPath, a), good = r.ok && re.test(r.out);
    if (!good) gap('S3', n + ' failed: ' + (r.out.trim().split('\n').find(l => /Error|§NEED|fatal|FAIL/.test(l)) || last(r.out)).slice(0, 160), 'node scripts/setup.js (S2) installs what it needs');
    return n + '=' + (good ? 'PASS' : 'FAIL'); });
  say('§SETUP_TOOLS ' + res.join(' '));
});
// S4
const vsc = { mode: INSTALL ? 'user' : 'throwaway', extDir: path.join(ROOT, '.setup', 'vscode-ext'), userDir: path.join(ROOT, '.setup', 'vscode-user') };
// VS Code writes ~/.cache/Microsoft/DeveloperTools/deviceid even with its own folders given (measured 2026-11-18, W-SETUP T4): in throwaway mode its cache goes under .setup/ too
const codeEnv = vsc.mode === 'throwaway' ? { env: Object.assign({}, process.env, { XDG_CACHE_HOME: path.join(ROOT, '.setup', 'cache') }) } : undefined;
step(() => {
  const V = path.join(ROOT, '.vscode'), cnt = {};
  try { cnt.tasks = jsonc(path.join(V, 'tasks.json')).tasks.length; } catch (e) { cnt.tasks = 0; }
  try { cnt.snippets = Object.keys(jsonc(path.join(V, 'witness.code-snippets'))).length; } catch (e) { cnt.snippets = 0; }
  try { cnt.launch = jsonc(path.join(V, 'launch.json')).configurations.length > 0 ? 'Y' : 'N'; } catch (e) { cnt.launch = 'N'; }
  let rec = []; try { rec = jsonc(path.join(V, 'extensions.json')).recommendations || []; } catch (e) { /* none */ }
  let cfState = 'skipped', eslint = rec.length ? 'recommended' : 'none';
  if (DRY) cfState = NOX0 ? 'skipped' : 'would-install';
  else if (!NOX0) {
    const p = run(process.execPath, ['devtools/vscode/pack.js']), vsix = (/file=(\S+\.vsix)/.exec(p.out) || [])[1];
    if (!p.ok || !vsix) gap('S4', 'packing Code Facts failed: ' + last(p.out));
    else if (!code) gap('S4', "VS Code's code command is not on PATH", CODE_FIX, !(INSTALL || OPEN));
    else {
      const a = ['--install-extension', vsix];
      if (!INSTALL) { fs.mkdirSync(vsc.extDir, { recursive: true }); fs.mkdirSync(vsc.userDir, { recursive: true }); a.push('--extensions-dir', vsc.extDir, '--user-data-dir', vsc.userDir); }
      const r = run('code', a, codeEnv); cfState = r.ok && /successfully installed|already installed/i.test(r.out) ? 'installed' : 'FAIL';
      if (cfState === 'FAIL') gap('S4', 'code --install-extension failed: ' + last(r.out));
      if (INSTALL && cfState === 'installed') {
        const bad = rec.filter(id => !run('code', ['--install-extension', id]).ok); eslint = bad.length ? 'FAIL:' + bad.join(',') : 'installed';
        if (bad.length) gap('S4', 'could not install ' + bad.join(','), 'check the network (the Marketplace), then run node scripts/setup.js --install again');
      }
    }
  }
  if (!code && NOX0 && (INSTALL || OPEN)) gap('S4', "VS Code's code command is not on PATH", CODE_FIX);
  say(`§SETUP_VSC code=${code || 'missing'} codefacts=${cfState} eslint=${eslint} tasks=${cnt.tasks} snippets=${cnt.snippets} launch=${cnt.launch} mode=${vsc.mode} ext_dir=${INSTALL ? 'user' : vsc.extDir}`);
});
// S5
const openArgs = vsc.mode === 'throwaway' ? ['--extensions-dir', vsc.extDir, '--user-data-dir', vsc.userDir, ROOT] : [ROOT];
const hard = gaps.filter(g => g.hard).length, verdict = DRY ? 'DRY' : hard ? 'FAIL' : 'PASS';
say(`§SETUP_NEXT open=${JSON.stringify('code ' + openArgs.map(a => '"' + a + '"').join(' '))} serve="node scripts/setup.js --serve [port]"`);
say(`§SETUP steps=${steps} ok=${ok} gaps=${gaps.length} verdict=${verdict}`);
if (OPEN && !DRY && code) { cp.spawn('code', openArgs, Object.assign({ detached: true, stdio: 'ignore' }, codeEnv)).unref(); say('§SETUP_OPEN launched=Y'); }
if (SERVE && !DRY && verdict !== 'FAIL' && py) {
  ['viewer/viewer.html', 'erp/idempiere.html', 'modeller/modeller.html'].forEach(u => say(`§SETUP_SERVE url=http://localhost:${SERVE}/${u}`));
  cp.spawnSync('python3', ['-m', 'http.server', String(SERVE)], { cwd: ROOT, stdio: 'inherit' });
}
process.exit(verdict === 'FAIL' ? 1 : 0);
