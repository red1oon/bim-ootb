#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS §X0_ACTIVATE (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.4 "Glue check",
// issue #2920). Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "the pure modules are right but the extension never wires them into VS Code" —
//   activate() must register exactly 1 definition provider and 2 hover providers for `javascript`, and those
//   providers, called the way VS Code calls them on a document, must give the answers the pure modules give.
// HOW: a fixture-side stub of the few `vscode` calls extension.js uses (no VS Code, no npm). The workspace folder
//   is this real checkout, so the providers read the real internal/APP_SURFACE.md and the real specs.
// RED CONTROLS: a made-up field and a plain word give no definition and no hover; a phantom gives a hover, no jump.
// Not proven here: how VS Code itself draws the hover or follows its links (the stub is not VS Code).
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_activate.js
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const EXT = path.resolve(__dirname, '..');
const reg = { definition: [], hover: [], commands: [], saves: 0 };
const vscodeStub = {
  languages: {
    registerDefinitionProvider(sel, p) { reg.definition.push({ sel, p }); return { dispose() {} }; },
    registerHoverProvider(sel, p) { reg.hover.push({ sel, p }); return { dispose() {} }; },
    registerCodeLensProvider(sel, p) { reg.lens = (reg.lens || []).concat([{ sel, p }]); return { dispose() {} }; }
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: ROOT } }],
    getConfiguration() { return { get() { return ''; } }; },
    onDidSaveTextDocument(fn) { reg.saves++; reg.saveFns = (reg.saveFns || []).concat([fn]); reg.onSave = d => reg.saveFns.forEach(f => f(d)); return { dispose() {} }; }
  },
  commands: { registerCommand(id) { reg.commands.push(id); return { dispose() {} }; } },
  window: { showInformationMessage() {}, activeTextEditor: undefined,
    createOutputChannel() { reg.channels = (reg.channels || 0) + 1; return { appendLine() {}, show() {}, dispose() {} }; },
    createStatusBarItem() { reg.status = { show() { this.shown = true; }, hide() { this.shown = false; }, dispose() {} }; return reg.status; },
    onDidChangeActiveTextEditor(fn) { reg.onEditor = fn; return { dispose() {} }; },
    registerTreeDataProvider(id, p) { reg.tree = { id, p }; return { dispose() {} }; } },
  TreeItem: function (label) { this.label = label; },
  tasks: { fetchTasks: async () => [{ name: 'Serve repo (http://localhost:8000)' }], executeTask: async t => { reg.taskRun = t.name; } },
  StatusBarAlignment: { Left: 1, Right: 2 },
  EventEmitter: function () { this.event = function () {}; this.fire = function () {}; this.dispose = function () {}; },
  CodeLens: function (range, command) { this.range = range; this.command = command; },
  Range: function (a, b, c, d) { this.start = { line: a, character: b }; this.end = { line: c, character: d }; },
  Selection: function (a, b) { this.active = a; },
  Uri: { file(p) { return { fsPath: p, with(o) { return { toString() { return 'file://' + p + '#' + o.fragment; } }; } }; } },
  Location: function (uri, position) { this.uri = uri; this.position = position; },
  Position: function (line, character) { this.line = line; this.character = character; },
  MarkdownString: function (value) { this.value = value; },
  Hover: function (contents) { this.contents = contents; }
};
const realLoad = Module._load;
Module._load = function (request) { return request === 'vscode' ? vscodeStub : realLoad.apply(this, arguments); };

let fail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; }

const ext = require(path.join(EXT, 'extension.js'));
const os = require('os');
const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-activate-'));
const context = { subscriptions: [], extensionPath: EXT, storageUri: { fsPath: STORE } };
const api = ext.activate(context);
const committedFile = api.indexFile();

const isJs = r => r.sel && r.sel.language === 'javascript';
const nDef = reg.definition.filter(isJs).length, nHover = reg.hover.filter(isJs).length;
check('activate() registered 1 definition provider for javascript (n=' + nDef + ')', nDef === 1 && reg.definition.length === 1);
check('activate() registered 2 hover providers for javascript (n=' + nHover + ')', nHover === 2 && reg.hover.length === 2);

// Call the providers the way VS Code does. The sample lines are assembled from pieces so this file adds no
// field to the real index (scripts/gen_app_surface.js reads string literals too).
const S = require(path.join(EXT, 'lib', 'app_surface_index.js'));
const index = S.loadSurface(ROOT);
const names = Array.from(index.fields.keys()).sort();
const defName = names.find(n => S.resolve(index, n).kind === 'definition');
const phName = names.find(n => index.fields.get(n).phantom);
const G = 'AP' + 'P', DOT = '.';
function doc(line) { return { lineAt() { return { text: line }; }, getText() { return line; } }; }
const at = (line, word) => ({ line: 0, character: line.indexOf(word) + 1 });
const hovers = (d, pos) => reg.hover.map(h => h.p.provideHover(d, pos)).filter(Boolean);
const define = (d, pos) => reg.definition[0].p.provideDefinition(d, pos);

const want = S.resolve(index, defName);
const l1 = '  var v = ' + G + DOT + defName + ';';
const d1 = define(doc(l1), at(l1, defName));
check('F12 on a written field (' + defName + ') → ' + want.file + ':' + want.line,
  !!d1 && d1.uri.fsPath === path.join(ROOT, want.file) && d1.position.line === want.line - 1
  && S.lineHasField(fs.readFileSync(d1.uri.fsPath, 'utf8').split('\n')[d1.position.line], defName));
const h1 = hovers(doc(l1), at(l1, defName));
check('hover on it → one hover, "written at", with a link to that line',
  h1.length === 1 && /written at \[/.test(h1[0].contents.value) && h1[0].contents.value.includes('#L' + want.line));

const l2 = '  if (' + G + DOT + phName + ') {}';
const h2 = hovers(doc(l2), at(l2, phName));
check('phantom (' + phName + ') → hover says PHANTOM, F12 gives nothing',
  define(doc(l2), at(l2, phName)) == null && h2.length === 1 && /PHANTOM — read, never written/.test(h2[0].contents.value));

const l3 = '  var v = ' + G + DOT + 'zzNotAField__ + plainWord;';
check('red control: made-up field → no definition, no hover',
  define(doc(l3), at(l3, 'zzNotAField__')) == null && hovers(doc(l3), at(l3, 'zzNotAField__')).length === 0);
check('red control: a plain word → no definition, no hover',
  define(doc(l3), at(l3, 'plainWord')) == null && hovers(doc(l3), at(l3, 'plainWord')).length === 0);

const SEC = '§';
const l4 = "  console.log('" + SEC + "HOSTED_BEFORE_HOST n=' + n);";
const h4 = hovers(doc(l4), at(l4, 'HOSTED'));
check(SEC + 'TAG hover → one hover naming the tag, with printers from this repo',
  h4.length === 1 && h4[0].contents.value.startsWith('**' + SEC + 'HOSTED_BEFORE_HOST**') && /printed by:/.test(h4[0].contents.value));
const l5 = "  console.log('" + SEC + "ZZ_NOT_A_TAG');";
const h5 = hovers(doc(l5), at(l5, 'ZZ_NOT'));
check('made-up ' + SEC + 'TAG → hover says "no spec found" (never silent)', h5.length === 1 && /no spec found/.test(h5[0].contents.value));
check('commands registered: ' + reg.commands.join(', '), reg.commands.length === 6 && ['x0Navigator.shipRunLocal', 'x0Navigator.shipCheck', 'x0Navigator.shipFetchBack'].every(c => reg.commands.includes(c)) && reg.commands.includes('x0Navigator.costIfDeployed') && reg.commands.includes('x0Navigator.openLogLine') && reg.saves === 2);
// Run and ship (§F.12c): the side-bar list and the Check step, through the registered wiring, on this real checkout
{
  const items = reg.tree ? reg.tree.p.getChildren().map(s => reg.tree.p.getTreeItem(s)) : [];
  check('the "Run & Ship" list has 4 steps, each bound to a registered command (' + items.map(i => i.label).join(' | ') + ')',
    reg.tree && reg.tree.id === 'x0RunShip' && items.length === 4 && items.every(i => reg.commands.includes(i.command.command)));
  const chk = api.shipCheck();
  check('Check prints its three steps and a verdict (' + (chk[chk.length - 1] || '').slice(0, 60) + ')',
    chk.some(l => l.startsWith(SEC + 'SHIP_SYNTAX')) && chk.some(l => l.startsWith(SEC + 'SHIP_AUDIT verdict=PASS')) && /SHIP_CHECK verdict=(PASS|FAIL)/.test(chk[chk.length - 1]));
}
// Values beside the code (§F.12b), through the registered CodeLens provider, on this real checkout: a log is stamped by the
// repo's own stamper at the current commit, so a tag printed by an unchanged file must get a lens, and an unstamped copy must not.
check('1 CodeLens provider registered for javascript', (reg.lens || []).length === 1 && reg.lens[0].sel.language === 'javascript');
{
  const T2 = require(path.join(EXT, 'lib', 'tag_index.js'));
  const pr = (T2.buildPrinterIndex(ROOT).tags.get(SEC + 'HOSTED_BEFORE_HOST') || []).find(x => x.rank === 0);
  const text = fs.readFileSync(pr.abs, 'utf8');
  const lensDoc = { uri: { fsPath: pr.abs }, getText() { return text; } };
  const logsDir = path.join(ROOT, 'logs'), probe = path.join(logsDir, 'x0_activate_lens_probe.log');
  const cp2 = require('child_process');
  const fileClean = cp2.spawnSync('git', ['diff', '--quiet', 'HEAD', '--', pr.file], { cwd: ROOT }).status === 0;
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(probe, SEC + 'HOSTED_BEFORE_HOST hostedTotal=7 (no stamp)' + '\n');
  const unstamped = reg.lens[0].p.provideCodeLenses(lensDoc).filter(c => /hostedTotal=7/.test(c.command.title)).length;
  fs.writeFileSync(probe, require(path.join(ROOT, 'scripts', 'log_stamp.js')).stampLine(ROOT, 'activate witness') + '\n' + SEC + 'HOSTED_BEFORE_HOST hostedTotal=7 matched=7' + '\n');
  const fut = new Date(Date.now() + 5000); fs.utimesSync(probe, fut, fut);          // a new mtime, so the cached scan is dropped
  const got = reg.lens[0].p.provideCodeLenses(lensDoc).filter(c => /hostedTotal=7 matched=7/.test(c.command.title));
  fs.rmSync(probe);
  check('red control: an unstamped log gives no lens (n=' + unstamped + ')', unstamped === 0);
  if (!fileClean) console.log('  NOTE ' + pr.file + ' differs from HEAD in this checkout: the lens rightly shows nothing, not judged');
  else check('a stamped log at this commit → a lens on ' + pr.file + ':' + pr.line + ' (' + (got[0] && got[0].command.title.slice(0, 70)) + '…)',
    got.length >= 1 && got[0].range.start.line === pr.line - 1 && got[0].command.command === 'x0Navigator.openLogLine');
}
// Cost if deployed (§F.12a), through the registered wiring, on this real checkout
const costLines = api.costIfDeployed();
check('"Cost if deployed" prints one ' + SEC + 'DEPLOY_COST line per app (' + costLines.filter(l => l.startsWith(SEC + 'DEPLOY_COST app=')).length + ')',
  costLines.filter(l => l.startsWith(SEC + 'DEPLOY_COST app=')).length >= 3);
const fileDoc = rel => ({ uri: { fsPath: path.join(ROOT, rel) } });
const stBoot = api.statusText(fileDoc('viewer/scene.js')), stNone = api.statusText(fileDoc('scripts/log_stamp.js'));
check('status bar: a page script says "start-up" (' + stBoot + '); a dev script says "' + stNone + '"', /viewer: start-up/.test(stBoot || '') && stNone === 'not loaded at start');


// §F.5: after the first refresh the providers read a fresh copy in the storage folder, never the committed one.
api.whenFresh().then(async r => {
  const now = api.indexFile();
  const fresh = !!r && !!now && now.startsWith(STORE) && now !== committedFile && fs.existsSync(now);
  check('before the refresh the providers read the committed index', committedFile === path.join(ROOT, 'internal', 'APP_SURFACE.md'));
  check('after it they read a fresh copy in the storage folder (' + (r ? r.line : 'refresh failed') + ')', fresh);
  const d6 = define(doc(l1), at(l1, defName));
  check('F12 still resolves from the fresh copy, at a line that mentions the field',
    !!d6 && S.lineHasField(fs.readFileSync(d6.uri.fsPath, 'utf8').split('\n')[d6.position.line], defName));
  // A save must not start a generator run by itself (~4 s each). Only a lookup that misses after a save does, once.
  const runs0 = api.refreshRuns();
  reg.onSave({ fileName: path.join(ROOT, 'viewer', 'anything.js') });
  hovers(doc(l1), at(l1, defName));                       // a hit: no run
  const afterHit = api.refreshRuns() - runs0;
  hovers(doc(l3), at(l3, 'zzNotAField__'));               // a miss after a save: one run
  hovers(doc(l3), at(l3, 'zzNotAField__'));               // a second miss: no further run
  const afterMiss = api.refreshRuns() - runs0;
  check('a save alone, and a lookup that hits, start no generator run (n=' + afterHit + ')', afterHit === 0);
  check('a lookup that misses after a save starts exactly one (n=' + afterMiss + ')', afterMiss === 1);
  const runLines = await api.shipRunLocal();
  check('Run local starts the repo\'s own serve task and lists each app (' + reg.taskRun + ')', /^Serve repo/.test(reg.taskRun || '') && runLines.filter(l => /SHIP_RUN app=/.test(l)).length >= 3);
  context.subscriptions.forEach(d => d.dispose());
  fs.rmSync(STORE, { recursive: true, force: true });
  Module._load = realLoad;
  console.log('§X0_ACTIVATE definition=' + nDef + ' hover=' + nHover + ' commands=' + reg.commands.length
    + ' fresh=' + (fresh ? 'Y' : 'N') + ' checks_failed=' + fail + ' verdict=' + (fail === 0 ? 'PASS' : 'FAIL'));
  if (fail) process.exitCode = 1;
});
