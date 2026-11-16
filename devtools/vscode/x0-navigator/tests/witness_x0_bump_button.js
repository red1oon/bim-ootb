#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-X0-BUMP-BUTTON (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.34 BUILD SPEC 3; decision F-24).
// Read the log after every run: exit code is not evidence. Verdict line: §X0_BUMP_BUTTON checks= failed= verdict=PASS|FAIL.
// ISSUE THIS PROVES OR DISPROVES: "the VS Code bump of an ERP file ran scripts/bump.js with spawnSync and a 60 s limit while the parity gate takes
//   minutes, so it froze VS Code and failed (since F-16); and there was no way to check first and write later". After: one status-bar Bump button;
//   a press checks every changed file in the background (async), it turns solid on a pass, a second press writes; a save resets it; the ERP quick fix
//   starts it instead of the 60 s spawnSync.
// POPULATION: the REAL extension.js activated on this checkout through the shared vscode stub. The only seam: child_process.spawn of
//   <root>/scripts/bump.js is redirected to a fixture script (prints the real § line shapes, exits by env) so no real gate runs.
// RED CONTROL: main's extension.js has no x0Navigator.bumpButton command: run with X0_EXT=<main worktree>/devtools/vscode/x0-navigator, B1-B6 FAIL.
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_bump_button.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const EXT = process.env.X0_EXT ? path.resolve(process.env.X0_EXT) : path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { reg, restore } = require('./vscode_stub').install(ROOT);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-bump-button-')), ARGS = path.join(tmp, 'args.txt'), FAKE = path.join(tmp, 'fake_bump.js');
fs.writeFileSync(FAKE, `const fs = require('fs'); fs.appendFileSync(${JSON.stringify(ARGS)}, process.argv.slice(2).join(' ') + '\\n');
const w = process.argv.includes('--write'), mode = process.env.FAKE_BUMP || 'pass';
if (w) { console.log('§BUMP_DONE targets=1 mode=write written=2'); process.exit(0); }
console.log('§BUMP_CHANGED base=abc changed=2 bumpable=1 skipped=1 files=erp/x.js');
console.log('§BUMP_PARITY_PLAN witnesses=2'); console.log('§BUMP_PARITY_RUN w=witness_a secs=1 verdicts=1'); console.log('§BUMP_PARITY_RUN w=witness_b secs=1 verdicts=1');
console.log('§BUMP_PARITY mode=block verdicts=2 new=[] scoped=tree verdict=PASS');
console.log('§BUMP_TOUCH_PLAN witnesses=1 budget_s=600'); console.log('§BUMP_TOUCH_RUN w=erp/tests/witness_x.js change=' + (mode === 'fail' ? 1 : 0) + ' base=0 secs=1 last=""');
if (mode === 'fail') { console.log('§BUMP_TOUCH files=erp/x.js witnesses=1 new_fail=[witness_x] pre_fail=[] unrun=[] verdict=BLOCKED'); process.exit(3); }
console.log('§BUMP_TOUCH files=erp/x.js witnesses=1 new_fail=[] pre_fail=[] unrun=[witness_slow] verdict=PASS'); console.log('§BUMP_CHECK verdict=PASS key=abc targets=1');
`);
const realSpawn = cp.spawn;
cp.spawn = function (cmd, args, opts) {
  if (Array.isArray(args) && args[0] && /[\\/]scripts[\\/]bump\.js$/.test(args[0])) return realSpawn(process.execPath, [FAKE, ...args.slice(1)], Object.assign({}, opts, { env: Object.assign({}, process.env) }));
  return realSpawn.apply(this, arguments);
};
let fail = 0, n = 0;
const check = (id, label, ok, info) => { n++; if (!ok) fail++; console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + id + ' ' + label + (info ? ' — ' + info : '')); };
const argsSeen = () => fs.existsSync(ARGS) ? fs.readFileSync(ARGS, 'utf8').split('\n').filter(Boolean) : [];

(async () => {
  const ext = require(path.join(EXT, 'extension.js'));
  const context = { subscriptions: [], extensionPath: EXT, storageUri: { fsPath: tmp } };
  ext.activate(context);
  const btn = (reg.statusItems || []).find(i => i.command === 'x0Navigator.bumpButton');
  const press = reg.commandFns['x0Navigator.bumpButton'];
  check('B1', 'activation shows one Bump button, idle, wired to x0Navigator.bumpButton', !!btn && !!press && btn.shown && /circle-outline\) Bump$/.test(btn.text), btn ? btn.text : '(no button)');
  if (!btn || !press) { console.log('§X0_BUMP_BUTTON checks=' + n + ' failed=' + (fail + 5) + ' verdict=FAIL (no button: B2-B6 not reachable)'); restore(); process.exit(1); }

  const texts = []; const keep = Object.getOwnPropertyDescriptor(btn, 'text');
  let cur = btn.text; Object.defineProperty(btn, 'text', { get() { return cur; }, set(v) { cur = v; texts.push(v); }, configurable: true });
  const p = press(); const during = btn.text;
  await p;
  check('B2', 'a press checks in the background (the press returned before the check ended), shows progress, ends solid ✓',
    /sync~spin\) Bump: checking/.test(during) && texts.some(t => /bridge 2\/2/.test(t)) && texts.some(t => /witnesses 1\/1/.test(t)) && /pass-filled\) Bump ✓/.test(btn.text) && /witness_slow/.test(btn.tooltip)
      && argsSeen()[0] && /^--changed --check --root /.test(argsSeen()[0]),
    'during="' + during + '" progress=[' + texts.filter(t => /\d\/\d/.test(t)).join(' | ') + '] end="' + btn.text + '" args="' + (argsSeen()[0] || '') + '"');
  await press();
  check('B3', 'a press on ✓ writes (--changed --write) and goes back to idle', /^--changed --write --root /.test(argsSeen()[1] || '') && /circle-outline\) Bump$/.test(btn.text), 'args="' + (argsSeen()[1] || '') + '" end="' + btn.text + '"');

  process.env.FAKE_BUMP = 'fail';
  await press();
  check('B4', 'a check with a new failure ends red with the witness name', /error\) Bump ✗ witness_x$/.test(btn.text), btn.text);
  reg.onSave({ uri: { fsPath: path.join(ROOT, 'erp', 'x.js') }, getText() { return ''; }, languageId: 'javascript' });
  check('B5', 'a save in the source root while ✗ puts it back to idle (the result was for the old tree)', /circle-outline\) Bump$/.test(btn.text) && /changed since the check/.test(btn.tooltip), btn.text + ' / ' + btn.tooltip.slice(0, 40));

  process.env.FAKE_BUMP = 'pass'; const before = argsSeen().length;
  await reg.commandFns['x0Navigator.bumpThisFile']('erp/ad_callout.js', true);
  check('B6', 'the ERP quick fix starts the background check (not ship.bump\'s 60 s spawnSync): the fixture saw --changed --check', /^--changed --check /.test(argsSeen()[before] || '') && /Bump ✓/.test(btn.text), 'args="' + (argsSeen()[before] || '') + '"');

  if (keep) Object.defineProperty(btn, 'text', keep);
  restore(); cp.spawn = realSpawn; fs.rmSync(tmp, { recursive: true, force: true });
  console.log('§X0_BUMP_BUTTON checks=' + n + ' failed=' + fail + ' verdict=' + (fail ? 'FAIL' : 'PASS'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§X0_BUMP_BUTTON checks=' + n + ' failed=' + (fail + 1) + ' verdict=FAIL error=' + (e && e.stack || e)); process.exit(1); });
