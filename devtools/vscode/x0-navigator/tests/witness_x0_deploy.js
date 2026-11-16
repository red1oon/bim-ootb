#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-X0-DEPLOY (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.29, bim-ootb #3105).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "a CI-bot merge starts no Pages deploy, and nothing in the editor can publish main": after, the X0 step
//   "5 · Deploy main now" starts deploy-pages.yml on main with the person's own gh login, and refuses in plain words when it cannot.
// POPULATION: temp git repos whose origin is the real one (red1oon/bim-ootb), carrying the REAL .github/workflows/deploy-pages.yml of
//   this checkout; a FAKE gh that records its arguments. NOTHING here reaches GitHub (X0_GH / opts.gh point at the fake).
// RED CONTROLS: no gh, gh not logged in, and a workflow file without workflow_dispatch must each refuse with a reason AND run nothing
//   (the fake's log has no `workflow run`); in the editor, no Deploy click → nothing runs.
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_deploy.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const EXT = path.resolve(__dirname, '..');
const ship = require(path.join(EXT, 'lib', 'ship.js'));
const WF = path.join(ROOT, '.github', 'workflows', ship.DEPLOY_WORKFLOW);

let fail = 0, judged = 0;
function check(label, cond) { judged++; console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; }
if (!fs.existsSync(WF)) { console.log('§X0_DEPLOY_W no ' + WF + ' verdict=INCONCLUSIVE'); process.exit(0); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-deploy-'));
const LOG = path.join(TMP, 'gh.log');
const FAKE = path.join(TMP, 'gh');
fs.writeFileSync(FAKE, '#!/usr/bin/env node\n' +
  "const fs=require('fs'),a=process.argv.slice(2);fs.appendFileSync(" + JSON.stringify(LOG) + ",a.join(' ')+'\\n');\n" +
  "if(a[0]==='--version'){console.log('gh version 0.0.0-fake');process.exit(0)}\n" +
  "if(a[0]==='auth'){process.exit(process.env.FAKE_GH_AUTH==='no'?1:0)}\n" +
  "if(a[0]==='workflow'){process.exit(0)}\n" +
  "if(a[0]==='run'){console.log('https://github.com/red1oon/bim-ootb/actions/runs/1');process.exit(0)}\n" +
  'process.exit(2);\n');
fs.chmodSync(FAKE, 0o755);
function repo(name, workflowText) {
  const d = path.join(TMP, name);
  fs.mkdirSync(path.join(d, '.github', 'workflows'), { recursive: true });
  if (workflowText != null) fs.writeFileSync(path.join(d, '.github', 'workflows', ship.DEPLOY_WORKFLOW), workflowText);
  cp.spawnSync('git', ['init', '-q'], { cwd: d }); cp.spawnSync('git', ['remote', 'add', 'origin', 'git@github.com:red1oon/bim-ootb.git'], { cwd: d });
  return d;
}
const logLines = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean) : []);
const reset = () => { try { fs.rmSync(LOG); } catch (e) { /* none */ } };
const ran = () => logLines().some(l => l.startsWith('workflow run'));

const real = fs.readFileSync(WF, 'utf8');
check('D0 the real ' + ship.DEPLOY_WORKFLOW + ' declares workflow_dispatch (a person can start it)', /^\s*workflow_dispatch\s*:/m.test(real));

// D1: the happy path runs exactly the one command.
const good = repo('good', real);
reset(); delete process.env.FAKE_GH_AUTH;
const r1 = ship.deployMain(good, { gh: FAKE });
console.log('    ' + r1.lines.join(' | '));
const wr = logLines().filter(l => l.startsWith('workflow run'));
check('D1 logged in → runs exactly `workflow run deploy-pages.yml --ref main -R red1oon/bim-ootb` once (' + wr.join(' / ') + ')',
  r1.started === true && wr.length === 1 && wr[0] === 'workflow run deploy-pages.yml --ref main -R red1oon/bim-ootb');
check('D1 it prints §SHIP_DEPLOY started=Y with the run link, and says to Fetch back', /§SHIP_DEPLOY started=Y repo=red1oon\/bim-ootb ref=main/.test(r1.lines[0]) && /run=https:\/\/github\.com\//.test(r1.lines[0]) && /Fetch back/.test(r1.lines[1] || ''));

// D2: refusals run nothing.
reset();
const rNo = ship.deployMain(good, { gh: path.join(TMP, 'no_such_gh') });
check('D2 RED: no gh → "install the GitHub CLI", nothing run (' + rNo.why + ')', rNo.started === false && /install the GitHub CLI/.test(rNo.why) && !ran());
reset(); process.env.FAKE_GH_AUTH = 'no';
const rAuth = ship.deployMain(good, { gh: FAKE });
delete process.env.FAKE_GH_AUTH;
check('D2 RED: gh not logged in → "gh auth login", nothing run (' + rAuth.why + ')', rAuth.started === false && /gh auth login/.test(rAuth.why) && !ran());
reset();
const noDispatch = repo('nodispatch', real.replace(/^\s*workflow_dispatch\s*:.*$/m, ''));
const rD = ship.deployMain(noDispatch, { gh: FAKE });
check('D2 RED: a workflow without workflow_dispatch → refused, naming the file, nothing run (' + rD.why + ')', rD.started === false && /no workflow_dispatch/.test(rD.why) && /deploy-pages\.yml/.test(rD.why) && logLines().length === 0);
reset();
const notGh = repo('notgh', real); cp.spawnSync('git', ['remote', 'set-url', 'origin', 'https://example.org/x/y.git'], { cwd: notGh });
const rG = ship.deployMain(notGh, { gh: FAKE });
check('D2 RED: an origin that is not GitHub → refused, nothing run (' + rG.why + ')', rG.started === false && /not a GitHub repo/.test(rG.why) && logLines().length === 0);

// D3: the editor wiring, through the shared stub; X0_GH keeps it on the fake.
(async () => {
  process.env.X0_GH = FAKE;
  const { reg, vscodeStub, restore } = require('./vscode_stub').install(ROOT);
  const ext = require(path.join(EXT, 'extension.js'));
  const STORE = fs.mkdtempSync(path.join(TMP, 'store-'));
  const api = ext.activate({ subscriptions: [], extensionPath: EXT, storageUri: { fsPath: STORE } });
  const fn = reg.commandFns['x0Navigator.shipDeploy'];
  check('D3 the command x0Navigator.shipDeploy is registered and Run & Ship lists 5 steps, the 5th = Deploy (' + api.steps().map(s => s[0]).join(' / ') + ')',
    typeof fn === 'function' && api.steps().length === 5 && /^5 · Deploy main now$/.test(api.steps()[4][0]) && api.steps()[4][2] === 'x0Navigator.shipDeploy');
  reset();
  const noClick = typeof fn === 'function' ? await fn() : null;
  check('D3 RED: without the Deploy click nothing runs (' + (noClick || []).join(' ') + ')', !ran() && /started=N why=not confirmed/.test((noClick || []).join(' ')));
  const orig = vscodeStub.window.showInformationMessage;
  vscodeStub.window.showInformationMessage = () => Promise.resolve('Deploy');
  reset();
  const click = typeof fn === 'function' ? await fn() : null;
  vscodeStub.window.showInformationMessage = orig;
  check('D3 with the click it runs the deploy once, on the fake (' + logLines().filter(l => l.startsWith('workflow run')).length + ')',
    logLines().filter(l => l.startsWith('workflow run')).length === 1 && /started=Y/.test((click || []).join(' ')));
  restore();
  delete process.env.X0_GH;
  fs.rmSync(TMP, { recursive: true, force: true });
  const verdict = judged === 0 ? 'INCONCLUSIVE' : fail === 0 ? 'PASS' : 'FAIL';
  console.log('§X0_DEPLOY_W checks=' + judged + ' failed=' + fail + ' verdict=' + verdict);
  if (verdict !== 'PASS') process.exitCode = 1;
})().catch(e => { fs.rmSync(TMP, { recursive: true, force: true }); console.log('  FAIL ' + (e && e.stack || e)); console.log('§X0_DEPLOY_W verdict=FAIL'); process.exitCode = 1; });
