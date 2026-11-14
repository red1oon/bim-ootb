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
const ph = findRead(f => f.phantom && !f.untied);
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
fs.writeFileSync(scratch, ['var v = ' + G + '.zzNotAField__;', "console.log('" + SEC + 'ZZ_NOT_A_TAG_' + Date.now().toString(36).toUpperCase() + "');", ''].join('\n'));
// §F.12: a log stamped by the repo's own stamper at this commit, carrying the known tag, so the real CodeLens has something
// provable to show. It is removed after the run.
const PROBE_LOG = path.join(ROOT, 'logs', 'x0_realvsc_lens_probe.log');
const PROBE_VALUE = KNOWN_TAG + ' hostedTotal=11 matched=11';
fs.mkdirSync(path.dirname(PROBE_LOG), { recursive: true });
fs.writeFileSync(PROBE_LOG, require(path.join(ROOT, 'scripts', 'log_stamp.js')).stampLine(ROOT, 'x0_realvsc') + '\n' + PROBE_VALUE + '\n');
const tagFileClean = cp.spawnSync('git', ['diff', '--quiet', 'HEAD', '--', path.relative(ROOT, tagAt.file)], { cwd: ROOT }).status === 0;
const plan = { probe, extras: { lensFile: tagAt.file }, steps: [
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
fs.rmSync(PROBE_LOG, { force: true });
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

// §F.12 first versions, inside the real editor
const x = res.extras || {};
const WANT = ['contextForFile', 'costIfDeployed', 'openLogLine', 'rebuildIndexes', 'shipCheck', 'shipFetchBack', 'shipRunLocal'].map(c => 'x0Navigator.' + c);
const cmdOk = check('VS Code knows all ' + WANT.length + ' X0 commands', WANT.every(c => (x.commands || []).includes(c)));
const costLines = (x.cost || []).filter(l => l.startsWith(SEC + 'DEPLOY_COST app='));
const costOk = check('"Cost if deployed" run as a VS Code command → ' + costLines.length + ' app lines (' + (costLines[0] || '').slice(0, 80) + '…)', costLines.length >= 3);
const chk = x.check || [];
const checkOk = check('"Check" run as a VS Code command: syntax step ran under VS Code\'s own runtime, audit passed, a verdict was printed (' + (chk[chk.length - 1] || 'no output') + ')',
  chk.some(l => /SHIP_SYNTAX files=\d+ verdict=PASS/.test(l)) && chk.some(l => /SHIP_AUDIT verdict=PASS/.test(l)) && /SHIP_CHECK verdict=PASS/.test(chk[chk.length - 1] || ''));
const statusOk = check('status bar text for ' + rel(tagAt.file) + ': ' + x.status, /start-up|offline cache/.test(x.status || ''));
const lens = (x.lenses || []).find(l => l.title.includes('hostedTotal=11 matched=11'));
let lensOk = true;
if (!tagFileClean) console.log('  NOTE  ' + rel(tagAt.file) + ' differs from HEAD here: the lens rightly shows nothing, not judged');
else lensOk = check('CodeLens from VS Code\'s own provider call: line ' + (lens && lens.line) + ' "' + (lens ? lens.title.slice(0, 70) : 'none') + '…"', !!lens && lens.line === tagAt.line);

// §F.19: Find All References, asked through VS Code's own entry point, compared with the lib's list made from the SAME fresh index
const AR = require('../../lib/app_refs');
const libRefs = AR.references(ROOT, AR.loadSites(res.indexAfter), def.field);
const key = x => path.resolve(x.file || x.abs) + ':' + x.line;
const got = new Set((d.refs || []).map(key));
const wantSites = libRefs.writes.concat(libRefs.reads);
const missing = wantSites.filter(x => !got.has(path.join(ROOT, x.file) + ':' + x.line)).length;
const refsOk = check('Find All References on ' + G + '.' + def.field + ' → VS Code returns ' + (d.refs || []).length + ' places; all ' + wantSites.length + ' sites of the index are among them (missing ' + missing + '), the write site included',
  libRefs.known && wantSites.length > 1 && missing === 0 && got.has(path.join(ROOT, want.file) + ':' + want.line));
const refsRedOk = check('red control: a made-up field → X0 adds no reference (' + ((st.unknown || {}).refs || []).length + ' from VS Code itself)', ((st.unknown || {}).refs || []).every(x => !String(x.file).startsWith(ROOT + path.sep)));

// §F.15 step 2: the tag hover on the printing line carries the provable value; the made-up tag (a file outside the repo) gets no such line
let lastOk = true;
const lastLine = (/last value[^\n]*/.exec(t.hover) || [''])[0];
if (!tagFileClean) console.log('  NOTE  the hover\'s last-value line is not judged either (same reason)');
else lastOk = check('tag hover from VS Code\'s own provider call ends with the provable value, its log and commit ("' + lastLine.slice(0, 96) + '")',
  /^last value: `.*hostedTotal=11 matched=11` — x0_realvsc_lens_probe\.log:2 @ [0-9a-f]{7}$/.test(lastLine));
const lastRedOk = check('red control: the made-up tag in a file outside the repo gets no last-value line', !/last value/.test(ft.hover));
// §F.16: Context for this file, as VS Code ran it
const FC = require('../../lib/file_context');
const tagRel = rel(tagAt.file).split(path.sep).join('/');
const ctx = String(x.context || '');
const sec = (txt, title) => { const i = txt.indexOf('## ' + title); const j = txt.indexOf('\n## ', i + 3); return i < 0 ? null : txt.slice(i, j < 0 ? undefined : j); };
const wantCtx = FC.build(ROOT, tagRel, { fields: null, tagIndex: null }).text;
const ctxOk = check('"Context for this file" run as a VS Code command on ' + tagRel + ' → the lib\'s block (' + ctx.split('\n').length + ' lines; header and load sections identical), field and tag sections answered, copied to the clipboard, opened beside (' + x.contextDocs + ' markdown editor)',
  ctx.startsWith('# Context for `' + tagRel + '`') && sec(ctx, 'Its own header') === sec(wantCtx, 'Its own header') && sec(ctx, 'How it reaches a user') === sec(wantCtx, 'How it reaches a user') &&
  !/INCONCLUSIVE: no APP field index|spec index not available/.test(ctx) && ctx.includes('`' + KNOWN_TAG + '`') && x.contextClip === ctx && x.contextDocs === 1);

if (KEEP) console.log('  kept: ' + TMP); else fs.rmSync(TMP, { recursive: true, force: true });
line({ vscode: res.vscode, active: yn(active), fresh: yn(fresh), def: yn(defOk), hover: yn(hovOk), phantom: yn(phOk), unknown_silent: yn(unkOk),
  tag: yn(tagOk), fake_tag: yn(fakeOk), commands: yn(cmdOk), cost: yn(costOk), check: yn(checkOk), status: yn(statusOk), lens: yn(lensOk), refs: yn(refsOk), refs_red: yn(refsRedOk), last_value: yn(lastOk), last_value_red: yn(lastRedOk), context: yn(ctxOk), builtin_ready: yn(pr.ready), builtin_defs: pr.ready ? builtin : '?', seconds: secs }, fail === 0 ? 'PASS' : 'FAIL');
if (fail) process.exitCode = 1;
