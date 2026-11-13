#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-X0-INSTALL (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.10, bim-ootb #2938).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "a developer follows the install steps and VS Code does not load the add-on" —
//   the steps are: `node devtools/vscode/pack.js`, then `code --install-extension <the .vsix>`. Here they are run for real:
//   the packer, VS Code's own command line into a TEMP extensions folder that already has a registry file (the normal case),
//   then the real VS Code is started and asked whether it has the extension, and what a hover gives.
// RED CONTROL (the defect this replaces): a symlink into an extensions folder that has a registry file must NOT load.
//   If it does load, VS Code changed and the README may offer the symlink again: the witness then says so (verdict stays
//   PASS for the .vsix path, with symlink_with_registry_found=Y).
// The developer's own VS Code profile and extensions are never touched (temp --user-data-dir / --extensions-dir).
// LOCAL ONLY: needs VS Code and xvfb-run; starts nothing without --go. Otherwise INCONCLUSIVE, never PASS.
// Command: node devtools/vscode/x0-navigator/tests/realvsc/install.js --go
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const P = require('../../../pack');
const S = require('../../lib/app_surface_index');

const EXT = path.resolve(__dirname, '..', '..');
const ROOT = path.resolve(EXT, '..', '..', '..');
const SEC = '§';
function line(f, verdict) { console.log(SEC + 'X0_INSTALL ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict); }
function inconclusive(why) { console.log('  ' + why); line({ reason: JSON.stringify(why) }, 'INCONCLUSIVE'); process.exit(0); }
const has = n => cp.spawnSync('which', [n]).status === 0;
const BIN = [process.env.VSCODE_BIN, '/snap/code/current/usr/share/code/code', '/usr/share/code/code', '/usr/lib/code/code', '/opt/visual-studio-code/code'].filter(Boolean).find(p => fs.existsSync(p));
if (!BIN) inconclusive('VS Code program not found (set VSCODE_BIN)');
if (!has('code')) inconclusive('the `code` command is not on PATH');
if (!has('xvfb-run')) inconclusive('xvfb-run not found');
if (!process.argv.includes('--go')) inconclusive('not started: this launches VS Code. Pass --go (owner rule: no GUI run without a go)');

// a real place to hover: a field written only under the one-letter name
const index = S.loadSurface(ROOT);
const G = 'AP' + 'P';
let place = null;
for (const f of fs.readdirSync(path.join(ROOT, 'viewer')).filter(n => n.endsWith('.js')).sort()) {
  const lines = fs.readFileSync(path.join(ROOT, 'viewer', f), 'utf8').split('\n');
  for (let i = 0; i < lines.length && !place; i++) {
    if (/^\s*(\/\/|\*)/.test(lines[i])) continue;
    const m = new RegExp('(?<![\\w$.])' + G + '\\.([A-Za-z_$][\\w$]*)').exec(lines[i]);
    const fld = m && index.fields.get(m[1]);
    if (fld && !fld.phantom && fld.as === 'A') place = { file: path.join(ROOT, 'viewer', f), line: i + 1, col: m.index + G.length + 2, field: m[1] };
  }
  if (place) break;
}
if (!place) inconclusive('no real place to hover found');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-install-'));
let fail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; return !!cond; }
const yn = b => (b ? 'Y' : 'N');
function launch(extDir, tag) {
  const out = path.join(TMP, tag + '.json'), user = path.join(TMP, 'user_' + tag);
  fs.mkdirSync(path.join(user, 'User'), { recursive: true });
  fs.writeFileSync(path.join(user, 'User', 'settings.json'), JSON.stringify({ 'telemetry.telemetryLevel': 'off', 'update.mode': 'none', 'security.workspace.trust.enabled': false, 'git.enabled': false, 'workbench.startupEditor': 'none' }));
  const env = Object.assign({}, process.env, { X0_INSTALL_OUT: out, X0_INSTALL_PLAN: JSON.stringify(place) });
  delete env.ELECTRON_RUN_AS_NODE;
  const r = cp.spawnSync('xvfb-run', ['-a', BIN, '--no-sandbox', '--disable-gpu', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
    '--user-data-dir=' + user, '--extensions-dir=' + extDir, '--extensionDevelopmentPath=' + path.join(__dirname, 'empty_driver'),
    '--extensionTestsPath=' + path.join(__dirname, 'install_suite.js'), ROOT], { env, encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 26 });
  console.log('  VS Code run (' + tag + '): exit=' + r.status);
  return fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
}

// 1. pack
const packed = P.pack(EXT, path.join(TMP, 'dist'));
const noTests = packed.files.every(f => !f.startsWith('tests/'));
check('packed ' + packed.files.length + ' files, ' + packed.bytes + ' bytes, no tests/ inside', packed.files.includes('package.json') && packed.files.includes('extension.js') && noTests);
const again = P.pack(EXT, path.join(TMP, 'dist2'));
check('the same input packs to the same bytes', fs.readFileSync(packed.file).equals(fs.readFileSync(again.file)));

// 2. install through VS Code's own command line, into a folder that ALREADY has a registry file
const extDir = path.join(TMP, 'ext'); fs.mkdirSync(extDir); fs.writeFileSync(path.join(extDir, 'extensions.json'), '[]');
const cli = cp.spawnSync('code', ['--install-extension', packed.file, '--extensions-dir', extDir, '--user-data-dir', path.join(TMP, 'user_cli')], { encoding: 'utf8', timeout: 120000 });
const cliOk = check('`code --install-extension` accepted the .vsix (exit ' + cli.status + ')', cli.status === 0 && /successfully installed/.test(cli.stdout + cli.stderr));
const reg = JSON.parse(fs.readFileSync(path.join(extDir, 'extensions.json'), 'utf8'));
check('VS Code wrote it into its registry file', reg.some(e => e.identifier && e.identifier.id === packed.id && e.version === packed.version));

// 3. the real VS Code: is it there, does it work
const a = launch(extDir, 'vsix');
if (!a) { fs.rmSync(TMP, { recursive: true, force: true }); inconclusive('VS Code left no result file'); }
if (a.error) console.log('  suite error: ' + a.error.split('\n')[0]);
const found = check('VS Code ' + a.vscode + ' has the installed extension and activated it', a.found && a.active);
check('it runs from the installed copy, not from this checkout', !!a.path && a.path.startsWith(extDir));
const fresh = check('the installed copy refreshed its index (' + a.fresh + ')', !!a.fresh);
const want = S.resolve(index, place.field);
const hover = check('hover on a real field → "written at ' + want.file + ':' + want.line + '"', !!a.hover && a.hover.includes('written at') && a.hover.includes(want.file + ':' + want.line));

// 4. red control: the old instruction (a symlink beside an existing registry file)
const linkDir = path.join(TMP, 'ext_link'); fs.mkdirSync(linkDir); fs.writeFileSync(path.join(linkDir, 'extensions.json'), '[]');
fs.symlinkSync(EXT, path.join(linkDir, packed.id + '-' + packed.version));
const b = launch(linkDir, 'symlink');
const linkFound = !!(b && b.found);
console.log('  ' + (linkFound ? 'NOTE  ' : 'PASS  ') + 'red control: a symlink beside an existing registry file → ' + (linkFound ? 'LOADED (VS Code changed: the symlink install may be offered again)' : 'not loaded (why the README no longer offers it)'));

fs.rmSync(TMP, { recursive: true, force: true });
line({ vscode: a.vscode, packed_files: packed.files.length, vsix_bytes: packed.bytes, cli_install: yn(cliOk), found: yn(found), fresh: yn(fresh), hover: yn(hover),
  symlink_with_registry_found: yn(linkFound) }, fail === 0 ? 'PASS' : 'FAIL');
if (fail) process.exitCode = 1;
