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
// A2-TIMING-2 (decision A-6, one global CoreEdge): T4 the ERP Env and the viewer read ONE holder (globalThis.CoreEdge); T5 viewer/cpm_schedule.js run() and
//   T6 viewer/schedule_gate.js computeSchedule time their § lines (§CPM_RUN ms={…}, §GEO_ORDER orderMs=) from it, '?' / null with no edge; T7 neither file
//   has a clock call left. RED CONTROL: CORE_TIMING_VIEWER_DIR=<main>/viewer (the pre-A-6 copies) must FAIL T5-T7.
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

// ── A2-TIMING-2 (A-6) ─────────────────────────────────────────────────────────────────────────────────────────────
const VIEWER = process.env.CORE_TIMING_VIEWER_DIR ? path.resolve(process.env.CORE_TIMING_VIEWER_DIR) : path.join(__dirname, '..', '..', 'viewer');
console.log('  viewer files: ' + VIEWER);
// T4: one holder. Env.setEdge (T2 above) put the fake in globalThis.CoreEdge; an edge set directly on the global is what Env reads.
check('T4 Env.setEdge stores the edge in globalThis.CoreEdge (one holder for the ERP and the viewer)', globalThis.CoreEdge === fakeEdge);
const direct = { nowMs: () => 0, uuid: () => 'u', perfMs: () => 777 };
globalThis.CoreEdge = direct;
check('T4 an edge set directly on globalThis.CoreEdge is the one Env reads (Env.perfMs()=' + Env.perfMs() + ')', Env.perfMs() === 777 && Env.edge() === direct);
// T5/T6: three stacked elements (a slab, a wall and a column on it), the real ScheduleGate.computeSchedule then CpmSchedule.run (graph path: no db).
const SG = require(path.join(VIEWER, 'schedule_gate.js')); global.ScheduleGate = SG;
const CP = require(path.join(VIEWER, 'cpm_schedule.js'));
const EL = [
  { guid: 's1', cls: 'IfcSlab', seq: 1, phase: 1, storey: 'L1', x0: 0, x1: 10, y0: 0, y1: 10, bz: 0, tz: 0.2, base_z: 0, top_z: 0.2, resource: 'concrete' },
  { guid: 'w1', cls: 'IfcWall', seq: 2, phase: 1, storey: 'L1', x0: 0, x1: 10, y0: 0, y1: 0.2, bz: 0.2, tz: 3, base_z: 0.2, top_z: 3, resource: 'mason' },
  { guid: 'c1', cls: 'IfcColumn', seq: 2, phase: 1, storey: 'L1', x0: 5, x1: 5.3, y0: 5, y1: 5.3, bz: 0.2, tz: 3, base_z: 0.2, top_z: 3, resource: 'concrete' }];
function pipeline() {
  let res = null;
  const lines = capture(() => {
    const sch = SG.computeSchedule(EL.map(e => Object.assign({}, e)), 0, 1, {}, 8);
    res = CP.run(EL.map(e => Object.assign({}, e, { s: sch[e.guid] && sch[e.guid].start, e: sch[e.guid] && sch[e.guid].end })), {});
  });
  return { geo: lines.find(l => l.startsWith('§GEO_ORDER')) || '(no §GEO_ORDER)', cpm: lines.find(l => l.startsWith('§CPM_RUN')) || '(no §CPM_RUN)', res };
}
tick = 958; globalThis.CoreEdge = fakeEdge;
const P1 = pipeline();
const cpmMs = (P1.cpm.match(/ ms=\{contact:([^,]+),build:([^,]+),solve:([^,]+),total:([^}]+)\}/) || []).slice(1);
check('T5 fake edge: §CPM_RUN ms={' + cpmMs.join(',') + '} = 42,42,42,126 and res.ms.total=' + (P1.res && P1.res.ms && P1.res.ms.total),
  cpmMs.join(',') === '42,42,42,126' && P1.res && P1.res.ms && P1.res.ms.total === 126);
check('T6 fake edge: §GEO_ORDER ' + (P1.geo.match(/orderMs=\S+/) || ['?'])[0] + ' (expected orderMs=42)', / orderMs=42$/.test(P1.geo));
delete globalThis.CoreEdge;
const P0 = pipeline();
const cpm0 = (P0.cpm.match(/ ms=\{[^}]*\}/) || [''])[0].trim();
check('T5 no edge: §CPM_RUN ' + cpm0 + ' all ? and res.ms.total=' + (P0.res && P0.res.ms && P0.res.ms.total) + ' (null, never a wall clock)',
  cpm0 === 'ms={contact:?,build:?,solve:?,total:?}' && P0.res && P0.res.ms && P0.res.ms.total === null);
check('T6 no edge: §GEO_ORDER ' + (P0.geo.match(/orderMs=\S+/) || ['(none)'])[0] + ' (expected orderMs=?)', / orderMs=\?$/.test(P0.geo));
for (const f of ['cpm_schedule.js', 'schedule_gate.js']) {
  const v = fs.readFileSync(path.join(VIEWER, f), 'utf8').replace(/\/\/.*$/gm, '');
  const n = (v.match(/\bDate\.now\(|\bperformance\.now\(/g) || []).length;
  check('T7 viewer/' + f + ' has no Date.now / performance.now call left (found ' + n + ')', n === 0);
}

const verdict = judged === 0 ? 'INCONCLUSIVE' : fail === 0 ? 'PASS' : 'FAIL';
console.log('§CORE_TIMING checks=' + judged + ' failed=' + fail + ' verdict=' + verdict);
if (verdict !== 'PASS') process.exitCode = 1;
