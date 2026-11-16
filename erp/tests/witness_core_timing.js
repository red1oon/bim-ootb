#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-CORE-TIMING (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part A, A2-TIMING-1, decision A-4; bim-ootb #3109).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "core code times its § lines with Date.now() (A-4 bans it even there)": after, erp/ad_callout.js sessionContext
//   (§LOGINCTX ms=) and erp/model_pa.js storeDue (§GOAL_STORE ms=) take their time from the ONE installed edge (Env.perfMs / Env.elapsed),
//   and say ms=? when no edge is installed, never a wall clock and never a throw.
// POPULATION: the REAL erp/ad_callout.js and erp/model_pa.js (or the files named by CORE_TIMING_DIR, for the red run on main's copies), run under
//   a FAKE edge whose perfMs() returns 1000, then 1042, … (+42 per read), so the only possible honest ms is 42.
// RED CONTROL: main's files under the same fake do NOT print ms=42 (their Date.now() difference is unrelated): CORE_TIMING_DIR=<main>/erp must FAIL.
// Command: node erp/tests/witness_core_timing.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ERP = process.env.CORE_TIMING_DIR ? path.resolve(process.env.CORE_TIMING_DIR) : path.join(__dirname, '..');
let fail = 0, judged = 0;
function check(label, cond) { judged++; console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; }
const capture = fn => { const lines = [], log = console.log; console.log = (...a) => { lines.push(a.join(' ')); }; try { fn(); } finally { console.log = log; } return lines; };

global.window = global.window || global;
const A = require(path.join(ERP, 'ad_callout.js'));
const Env = A.Env;
// loginContext reads a few dictionary rows; a stub query hands every SELECT one generic row (the rows' values are not what this judges).
if (typeof A.bind === 'function') A.bind(() => [{ a: 101, c: 100, h: 'N', n: 'SuperUser', v: 'SuperUser' }], {});
console.log('  files: ' + ERP);

// T1: no edge installed → null, no throw (timing is not a date: A-3's throw is for a missing date).
let t1 = null, threw = false;
try { t1 = [typeof Env.perfMs === 'function' ? Env.perfMs() : 'missing', typeof Env.elapsed === 'function' ? Env.elapsed(5) : 'missing']; } catch (e) { threw = true; }
check('T1 no edge: Env.perfMs() and Env.elapsed(5) are null, nothing throws (' + JSON.stringify(t1) + ')', !threw && t1 && t1[0] === null && t1[1] === null);
const envFor = n => ({ client: 11, org: 11, role: 102, user: 101 + n, wh: 103, date: '2026-11-16 00:00:00', session: {} });
const noEdgeLines = capture(() => A.sessionContext(envFor(0)));
const noEdge = noEdgeLines.find(l => l.startsWith('§LOGINCTX build')) || '';
check('T1 no edge: §LOGINCTX says ms=? (never a wall clock) — ' + noEdge.replace(/^.* (keys=)/, '$1'), / ms=\?$/.test(noEdge));

// T2: a fake edge 1000, 1042, … → §LOGINCTX ms=42.
let tick = 958;
const fakeEdge = { nowMs: () => Date.parse('2026-11-16T03:00:00Z'), uuid: () => '00000000-0000-4000-8000-000000000000', perfMs: () => (tick += 42) };
let edged = true;
try { Env.setEdge(fakeEdge); } catch (e) { edged = false; }
const edgeLines = capture(() => A.sessionContext(envFor(1)));
const withEdge = edgeLines.find(l => l.startsWith('§LOGINCTX build')) || '';
check('T2 fake edge (+42 per read): §LOGINCTX says ms=42 — ' + withEdge.replace(/^.* (keys=)/, '$1'), edged && / ms=42$/.test(withEdge));

// T3: model_pa.js in a sandbox with stubs; the same fake edge → §GOAL_STORE ms=42; no AdCallout → ms=?.
function runModelPa(withAdCallout) {
  const out = [];
  const sandbox = {
    console: { log: (...a) => out.push(a.join(' ')) },
    ModelLayer: {}, GoalEngine: { installModel() {}, storeDue() { return [{ written: true }, { written: false }]; } },
    __crud: {
      modelRun(opts, cb) { opts.fn({ q: () => [], update() {}, env: {} }); cb({ ok: true, ops: [{ op_type: 'CRUD_UPDATE' }], observed: null }); },
      applyOpGroup(ops, cb) { cb({ committed: true }); }
    }
  };
  if (withAdCallout) sandbox.AdCallout = A;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ERP, 'model_pa.js'), 'utf8'), sandbox, { filename: 'model_pa.js' });
  sandbox.ModelPA.storeDue();
  return out.find(l => l.startsWith('§GOAL_STORE')) || '(no §GOAL_STORE line)';
}
const gWith = runModelPa(true), gWithout = runModelPa(false);
check('T3 model_pa storeDue under the fake edge: §GOAL_STORE … ms=42 — ' + gWith.replace(/^§GOAL_STORE /, ''), / ms=42( |$)/.test(gWith));
check('T3 model_pa storeDue with no AdCallout/edge: ms=? — ' + gWithout.replace(/^§GOAL_STORE /, ''), / ms=\?( |$)/.test(gWithout));
const src = fs.readFileSync(path.join(ERP, 'model_pa.js'), 'utf8').replace(/\/\/.*$/gm, '');
check('T3 model_pa.js has no Date.now / performance.now / new Date() left (A-4)', !/Date\.now\(|performance\.now\(|new Date\(\s*\)/.test(src));

const verdict = judged === 0 ? 'INCONCLUSIVE' : fail === 0 ? 'PASS' : 'FAIL';
console.log('§CORE_TIMING checks=' + judged + ' failed=' + fail + ' verdict=' + verdict);
if (verdict !== 'PASS') process.exitCode = 1;
