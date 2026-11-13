#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-X0-REALVSC (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.9, issue #2932).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "X0 Navigator was only ever proven through a stub of the vscode API" —
//   here the REAL VS Code loads the extension and is asked, through its own commands, what a user gets on real
//   source: F12, hover, a phantom, a made-up field, a §TAG. It also closes §F.5's open point: the background
//   index refresh must finish inside VS Code's own runtime.
// HOW: VS Code's extension-test mode (suite.js runs inside it), a temp profile (the developer's own settings and
//   extensions are not touched), a virtual display (xvfb-run: no window on anyone's screen) and --disable-gpu.
// RED CONTROLS: a made-up field gets no X0 hover and no X0 jump; a made-up §TAG says "no spec found".
// LOCAL ONLY: needs VS Code and xvfb-run. Missing, or VS Code leaves no result → INCONCLUSIVE, never PASS.
// Command: node devtools/vscode/x0-navigator/tests/realvsc/run.js [--compiler-root <dir>] [--keep]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const S = require('../../lib/app_surface_index');

const EXT = path.resolve(__dirname, '..', '..');
const ROOT = path.resolve(EXT, '..', '..', '..');
const argv = process.argv.slice(2);
const argOf = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const COMPILER = argOf('--compiler-root') ? path.resolve(argOf('--compiler-root')) : path.resolve(ROOT, '..', 'bim-compiler');
const KEEP = argv.includes('--keep');
const SEC = '§';

function line(f, verdict) { console.log(SEC + 'X0_REALVSC ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict); }
function inconclusive(why) { console.log('  ' + why); line({ reason: JSON.stringify(why) }, 'INCONCLUSIVE'); process.exit(0); }
const which = n => { const r = cp.spawnSync('which', [n], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };

// VS Code's real program (the `code` launcher returns at once, so the run could not be awaited through it).
const CANDIDATES = [process.env.VSCODE_BIN, '/snap/code/current/usr/share/code/code', '/usr/share/code/code', '/usr/lib/code/code',
  '/opt/visual-studio-code/code', '/usr/share/codium/codium'].filter(Boolean);
const BIN = CANDIDATES.find(p => fs.existsSync(p));
if (!BIN) inconclusive('VS Code program not found (set VSCODE_BIN)');
if (!which('xvfb-run')) inconclusive('xvfb-run not found');
if (!process.env.X0_REALVSC_GO && !argv.includes('--go')) inconclusive('not started: this launches VS Code. Pass --go (owner rule: no GUI run without a go)');

// ── plan: real places in real source, found here so suite.js stays dumb ──
const index = S.loadSurface(ROOT);
if (!index || !index.rows) inconclusive('internal/APP_SURFACE.md missing or empty');
const names = Array.from(index.fields.keys()).sort();
const G = 'AP' + 'P';
function findRead(pred) {
  // a line of real viewer source that READS <god object>.<field> for a field passing `pred`
  const dir = path.join(ROOT, 'viewer');
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js')).sort()) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const re = new RegExp('(?<![\\w$.])' + G + '\\.([A-Za-z_$][\\w$]*)', 'g');
      let m;
      while ((m = re.exec(lines[i]))) {
        if (/^\s*(\/\/|\*)/.test(lines[i])) continue;
        const fld = index.fields.get(m[1]);
        if (fld && pred(fld)) return { field: m[1], file: path.join(dir, f), line: i + 1, col: m.index + G.length + 2 };
      }
    }
  }
  return null;
}
const def = findRead(f => !f.phantom && f.as === 'A' && S.resolve(index, f.name).kind === 'definition');
const ph = findRead(f => f.phantom);
function findTag(tag) {
  const T = require('../../lib/tag_index');
  const p = (T.buildPrinterIndex(ROOT).tags.get(tag) || []).find(x => x.rank === 0);
  if (!p) return null;
  const text = fs.readFileSync(p.abs, 'utf8').split('\n')[p.line - 1];
  return { file: p.abs, line: p.line, col: text.indexOf(tag) + 2 };
}
const KNOWN_TAG = SEC + 'HOSTED_BEFORE_HOST';
const tagAt = findTag(KNOWN_TAG);
if (!def || !ph || !tagAt) inconclusive('could not find real source places (def=' + !!def + ' phantom=' + !!ph + ' tag=' + !!tagAt + ')');

// A call of a function declared in the same file: something the built-in JavaScript support resolves by itself.
function findProbe(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*function\s+([A-Za-z_$][\w$]{3,})\s*\(/.exec(lines[i]);
    if (!m) continue;
    for (let j = 0; j < lines.length; j++) {
      if (j === i || /^\s*(\/\/|\*)/.test(lines[j])) continue;
      const k = lines[j].search(new RegExp('(?<![\\w$.])' + m[1].replace(/\$/g, '\\$') + '\\s*\\('));
      if (k >= 0) return { file, line: j + 1, col: k + 1, name: m[1] };
    }
  }
  return null;
}
const probe = findProbe(def.file);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-realvsc-'));
// two made-up things live in a scratch file OUTSIDE the repo (a file inside it would enter the real index)
const scratch = path.join(TMP, 'scratch.js');
fs.writeFileSync(scratch, ['var v = ' + G + '.zzNotAField__;', "console.log('" + SEC + "ZZ_NOT_A_TAG');", ''].join('\n'));
const plan = { probe, steps: [
  { label: 'def', file: def.file, line: def.line, col: def.col, tries: 4 },
  { label: 'phantom', file: ph.file, line: ph.line, col: ph.col, tries: 1 },
  { label: 'tag', file: tagAt.file, line: tagAt.line, col: tagAt.col, tries: 1 },
  { label: 'unknown', file: scratch, line: 1, col: ('var v = ' + G + '.').length + 2, tries: 1 },
  { label: 'fake_tag', file: scratch, line: 2, col: "console.log('".length + 3, tries: 1 },
] };
const OUT = path.join(TMP, 'result.json');
fs.mkdirSync(path.join(TMP, 'user', 'User'), { recursive: true });
fs.writeFileSync(path.join(TMP, 'user', 'User', 'settings.json'), JSON.stringify({
  'bimDevtools.compilerRoot': COMPILER, 'telemetry.telemetryLevel': 'off', 'update.mode': 'none',
  'extensions.autoUpdate': false, 'security.workspace.trust.enabled': false, 'workbench.startupEditor': 'none', 'git.enabled': false
}));
const args = ['-a', BIN, '--no-sandbox', '--disable-gpu', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
  '--user-data-dir=' + path.join(TMP, 'user'), '--extensions-dir=' + path.join(TMP, 'ext'),
  '--extensionDevelopmentPath=' + EXT, '--extensionTestsPath=' + path.join(__dirname, 'suite.js'), ROOT];
const env = Object.assign({}, process.env, { X0_REALVSC_OUT: OUT, X0_REALVSC_PLAN: JSON.stringify(plan) });
delete env.ELECTRON_RUN_AS_NODE;
const t0 = Date.now();
const r = cp.spawnSync('xvfb-run', args, { env, encoding: 'utf8', timeout: 300000, maxBuffer: 1 << 26 });
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('  VS Code run: exit=' + r.status + (r.signal ? ' signal=' + r.signal : '') + ' seconds=' + secs + ' program=' + BIN);
if (!fs.existsSync(OUT)) {
  console.log((r.stderr || '').split('\n').filter(Boolean).slice(-8).map(l => '    ' + l.slice(0, 200)).join('\n'));
  if (!KEEP) fs.rmSync(TMP, { recursive: true, force: true });
  inconclusive('VS Code left no result file');
}
const res = JSON.parse(fs.readFileSync(OUT, 'utf8'));
if (res.error) console.log('  suite error: ' + res.error.split('\n')[0]);

const yn = b => (b ? 'Y' : 'N');
let fail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; return !!cond; }
const st = res.steps || {};
const want = S.resolve(index, def.field);
const rel = p => path.relative(ROOT, p);
const isX0Def = (d, w) => path.resolve(d.file) === path.join(ROOT, w.file) && d.line === w.line;

const active = check('VS Code ' + res.vscode + ' loaded and activated the extension', res.found && res.active);
const fresh = check('the index refresh finished INSIDE VS Code (' + (res.fresh && res.fresh.line ? res.fresh.line + ' ms=' + res.fresh.ms : JSON.stringify(res.fresh)) + ') and the providers now read VS Code\'s storage folder',
  res.fresh && typeof res.fresh === 'object' && res.storage && !String(res.indexAfter).startsWith(ROOT));
const d = st.def || { defs: [], hover: '' };
console.log('  def step: ' + rel(def.file) + ':' + def.line + '  ' + d.text);
const x0defs = d.defs.filter(x => isX0Def(x, want));
const builtin = d.defs.length - x0defs.length;
const defOk = check('F12 on ' + G + '.' + def.field + ' (written only under the one-letter name) → VS Code offers ' + want.file + ':' + want.line + ', a line that mentions the field',
  x0defs.length === 1 && S.lineHasField(fs.readFileSync(path.join(ROOT, want.file), 'utf8').split('\n')[want.line - 1], def.field));
const pr = res.probe || { ready: false, seconds: 0 };
console.log('  built-in JavaScript support ready=' + yn(pr.ready) + ' after ' + pr.seconds + ' s (probe: a call of ' + (pr.name || '?') + '() → ' + (pr.to ? rel(pr.to) : 'no answer') + ')');
console.log('  VS Code\'s built-in JavaScript support gave ' + builtin + ' other definition(s) for it: ' + JSON.stringify(d.defs.filter(x => !isX0Def(x, want)).slice(0, 3).map(x => rel(x.file) + ':' + x.line)));
const hovOk = check('hover on it → "written at ' + want.file + ':' + want.line + '"', d.hover.includes('written at') && d.hover.includes(want.file + ':' + want.line));
const p = st.phantom || { defs: [], hover: '' };
const phOk = check('phantom ' + G + '.' + ph.field + ' → hover says PHANTOM; X0 offers no jump (' + p.defs.length + ' result(s), all from the built-in support)',
  /PHANTOM — read, never written/.test(p.hover));
const u = st.unknown || { defs: [], hover: 'x' };
const unkOk = check('red control: a made-up field → no X0 hover text, no definition', !/written at|PHANTOM|index stale/.test(u.hover) && u.defs.length === 0);
const t = st.tag || { hover: '' };
const tagOk = check(KNOWN_TAG + ' hover → names the tag, lists spec places' + (fs.existsSync(COMPILER) ? ' (bim-compiler specs included)' : ''),
  t.hover.includes('**' + KNOWN_TAG + '**') && /prompts\/[^\s)]+\.md:\d+/.test(t.hover) && /printed by:/.test(t.hover)
  && (!fs.existsSync(COMPILER) || /bim-compiler prompts\//.test(t.hover)));
const ft = st.fake_tag || { hover: '' };
const fakeOk = check('red control: a made-up tag → "no spec found"', /no spec found/.test(ft.hover));

if (KEEP) console.log('  kept: ' + TMP); else fs.rmSync(TMP, { recursive: true, force: true });
line({ vscode: res.vscode, active: yn(active), fresh: yn(fresh), def: yn(defOk), hover: yn(hovOk), phantom: yn(phOk), unknown_silent: yn(unkOk),
  tag: yn(tagOk), fake_tag: yn(fakeOk), builtin_ready: yn(pr.ready), builtin_defs: pr.ready ? builtin : '?', seconds: secs }, fail === 0 ? 'PASS' : 'FAIL');
if (fail) process.exitCode = 1;
