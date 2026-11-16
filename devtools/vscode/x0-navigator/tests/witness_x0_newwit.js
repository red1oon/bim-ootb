#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-X0-NEWWIT (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.26, bim-ootb #3096).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "a new witness starts blank: the writer looks up by hand what X0 already knows about the file".
//   After: "New witness for this file" expands the ONE `witness` snippet with FACTS only (the header's spec, the § tags the file
//   prints, the APP fields it writes), never a guessed test, and the result FAILs until a person fills it.
// POPULATION: real repo files (erp/model_pa.js and a header-less file), copied into a temp repo with the real snippet file and the
//   real witness_kit, so nothing is ever written into this checkout. A missing file → INCONCLUSIVE.
// RED CONTROLS: the tags listed must equal an INDEPENDENT regex over the file's console.log('§… literals; the generated file must
//   FAIL unedited and a filled copy must PASS (so the run can see a PASS); a second run must not touch the first file.
// Not proven here: how VS Code shows the opened file (the stub is not VS Code).
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_newwit.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const EXT = path.resolve(__dirname, '..');
const W = require(path.join(EXT, 'lib', 'witness_stub.js'));
const FC = require(path.join(EXT, 'lib', 'file_context.js'));

const SUBJECT = 'erp/model_pa.js';                 // prints §MODEL-PA and §GOAL_STORE; header cites CAPEX_DASHBOARD.md §5.24
const NOHEADER = 'erp/tests/../ad_ddl_notnull.js'; // normalised below; a generated table file with no spec header
let fail = 0, judged = 0;
function check(label, cond) { judged++; console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; }

const need = [SUBJECT, '.vscode/witness.code-snippets', 'internal/APP_SURFACE.md', 'witness_kit/contract.js'];
const missing = need.filter(f => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) { console.log('§X0_NEWWIT_W missing=' + missing.join(',') + ' verdict=INCONCLUSIVE'); process.exit(0); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-newwit-'));
const REPO = path.join(TMP, 'repo');
const copy = rel => { const d = path.join(REPO, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.cpSync(path.join(ROOT, rel), d, { recursive: true }); };
need.forEach(copy); copy('witness_kit');
const noHeaderRel = path.posix.normalize(NOHEADER);
const noHeaderSrc = "'use strict';\nmodule.exports = { a: 1 };\n";   // a file with no leading comment at all
fs.mkdirSync(path.dirname(path.join(REPO, noHeaderRel)), { recursive: true });
fs.writeFileSync(path.join(REPO, noHeaderRel), noHeaderSrc);

const runNode = f => cp.spawnSync(process.execPath, [f], { cwd: REPO, encoding: 'utf8', timeout: 60000 });

(async () => {
  // N1: facts only, and they agree with an independent reading of the file.
  const text = fs.readFileSync(path.join(REPO, SUBJECT), 'utf8');
  const indep = new Set((text.match(/console\.log\(\s*'(§[A-Z0-9][A-Z0-9_-]*[A-Z0-9_])/g) || []).map(m => m.replace(/^console\.log\(\s*'/, '')));
  const facts = FC.build(REPO, SUBJECT, { fields: null, tagIndex: null }).facts;
  const r1 = W.make(REPO, SUBJECT, facts);
  const listed = new Set(r1.tags || []);
  const same = indep.size > 0 && indep.size === listed.size && [...indep].every(t => listed.has(t));
  check('N1 the § tags listed = an independent regex over ' + SUBJECT + ' (stub ' + [...listed].join(' ') + ' | regex ' + [...indep].join(' ') + ')', same);
  const headerCite = (FC.headerOf(text).lines.join('\n').match(/prompts\/[\w./-]+\.md\s*§\s*[\w.:-]+/) || [''])[0];
  check('N1 the spec line quotes the header\'s own citation (' + r1.spec + ')', !!r1.spec && !!headerCite && r1.spec.replace(/\s+/g, ' ').endsWith(headerCite.replace(/\s+/g, ' ')));
  check('N1 the stub is the snippet expanded (header, contract require, empty population) at ' + r1.path,
    r1.path === 'erp/tests/witness_model_pa.js' && /WITNESS W-MODEL-PA/.test(r1.text) && /require\('\.\.\/\.\.\/witness_kit\/contract'\)/.test(r1.text) && /return \[\];/.test(r1.text) && /FACTS FROM X0 about erp\/model_pa\.js/.test(r1.text));
  check('N1 no test is guessed: the claim and the red control are still the snippet\'s placeholder words',
    /the defect, in one sentence/.test(r1.text) && /how the broken copy is made/.test(r1.text));

  // N2: unedited it FAILs (population-nonempty); a filled copy PASSes (red control: the run can see a PASS).
  const out1 = path.join(REPO, r1.path);
  fs.mkdirSync(path.dirname(out1), { recursive: true }); fs.writeFileSync(out1, r1.text, { flag: 'wx' });
  const u = runNode(out1);
  check('N2 the unedited stub FAILs (exit=' + u.status + ', population-nonempty ' + (/FAIL.*population-nonempty/.test(u.stdout + u.stderr) ? 'named' : 'NOT named') + ')',
    u.status !== 0 && /population-nonempty/.test(u.stdout + u.stderr));
  const filled = path.join(REPO, 'erp/tests/witness_model_pa_filled.js');
  fs.writeFileSync(filled, r1.text.replace('return [];', 'return [{ id: 1 }, { id: 2 }];'));
  const f = runNode(filled);
  check('N2 RED: the same stub with real rows filled in PASSes (exit=' + f.status + ')', f.status === 0 && !/\bFAIL\b/.test(f.stdout));
  fs.rmSync(filled);

  // N3: never overwrite.
  const before = fs.readFileSync(out1);
  const r2 = W.make(REPO, SUBJECT, facts);
  check('N3 a second run picks a new name (' + r2.path + ') and the first file is unchanged',
    r2.path === 'erp/tests/witness_model_pa_2.js' && fs.readFileSync(out1).equals(before));

  // N4: no header → NO SPEC (never invented); tests/ and non-.js are refused.
  const rN = W.make(REPO, noHeaderRel, { tagInfo: [], fields: [] });
  check('N4 a file with no header → "NO SPEC", no citation invented (spec=' + rN.spec + ')', rN.spec === null && /NO SPEC in erp\/ad_ddl_notnull\.js's header/.test(rN.text) && !/prompts\/\w/.test(rN.text.split('FACTS FROM X0')[0].replace(/spec: bim-compiler prompts\/CODE_ARCHITECTURE_DESIGN|witness_kit/g, '')));
  const rT = W.make(REPO, r1.path, facts), rJ = W.make(REPO, 'internal/APP_SURFACE.md', facts);
  check('N4 RED: a tests/ file and a non-.js file are refused (' + rT.refused + ' | ' + rJ.refused + ')', !!rT.refused && !!rJ.refused && !rT.text && !rJ.text);

  // N5: wiring through the shared stub: the command exists, writes once, opens once, never overwrites.
  const { reg, vscodeStub, restore } = require('./vscode_stub').install(REPO);
  const ext = require(path.join(EXT, 'extension.js'));
  const ctx = { subscriptions: [], extensionPath: EXT, storageUri: { fsPath: fs.mkdtempSync(path.join(TMP, 'store-')) } };
  ext.activate(ctx);
  const fn = reg.commandFns['x0Navigator.newWitnessForFile'];
  check('N5 activate registers x0Navigator.newWitnessForFile (commands=' + reg.commands.length + ')', typeof fn === 'function');
  let made = null;
  if (typeof fn === 'function') {
    vscodeStub.window.activeTextEditor = { document: { uri: { fsPath: path.join(REPO, SUBJECT) } } };
    made = await fn();
  }
  const line = reg.lines.find(l => l.startsWith('§X0_NEWWIT')) || '(no §X0_NEWWIT line)';
  console.log('    ' + line);
  check('N5 the command wrote ' + made + ' (a free name, the first file untouched) and opened it once',
    made === 'erp/tests/witness_model_pa_2.js' && fs.existsSync(path.join(REPO, made)) && fs.readFileSync(out1).equals(before) && reg.opened.length === 1 && reg.shown.length === 1);
  if (typeof fn === 'function') {
    vscodeStub.window.activeTextEditor = { document: { uri: { fsPath: path.join(REPO, r1.path) } } };
    const refused = await fn();
    check('N5 on a tests/ file it refuses and says why (' + (reg.infos[reg.infos.length - 1] || '') + ')', refused === null && /no witness made/.test(reg.infos[reg.infos.length - 1] || ''));
  }
  ctx.subscriptions.forEach(d => { try { d.dispose(); } catch (e) { /* stub */ } });
  restore();

  fs.rmSync(TMP, { recursive: true, force: true });
  const verdict = judged === 0 ? 'INCONCLUSIVE' : fail === 0 ? 'PASS' : 'FAIL';
  console.log('§X0_NEWWIT_W subject=' + SUBJECT + ' tags=' + listed.size + ' spec=' + (r1.spec ? 'Y' : 'N') + ' checks=' + judged + ' failed=' + fail + ' verdict=' + verdict);
  if (verdict !== 'PASS') process.exitCode = 1;
})().catch(e => { fs.rmSync(TMP, { recursive: true, force: true }); console.log('  FAIL ' + (e && e.stack || e)); console.log('§X0_NEWWIT_W verdict=FAIL'); process.exitCode = 1; });
