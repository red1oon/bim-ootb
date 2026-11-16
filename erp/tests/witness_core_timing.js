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
// A2-TIMING-3: T8 common/room_graph.js _legalizePath (graph._legalizeStats.ms) and T9 its REAL reader, viewer/egress_sanity.js on buildings/Clinic_meta.db
//   (no raster, so §PATH_LEGAL_NO_RASTER prints; ms must be exactly 42 x calls); T10 viewer/schedule_inject.js inject (§SCHED_INJECT … ms=, materializeMs/persistMs);
//   T11 neither file has a clock call left. ? / null with no edge. RED CONTROL: CORE_TIMING_COMMON_DIR=<main>/common and CORE_TIMING_VIEWER_DIR=<main>/viewer
//   must FAIL T8-T11. Clinic_meta.db from CORE_TIMING_BUILDINGS (default ~/bim-ootb/buildings) or CORE_TIMING_EGRESS_DB; absent = INCONCLUSIVE.
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

// ── A2-TIMING-3 ───────────────────────────────────────────────────────────────────────────────────────────────────
const COMMON = process.env.CORE_TIMING_COMMON_DIR ? path.resolve(process.env.CORE_TIMING_COMMON_DIR) : path.join(__dirname, '..', '..', 'common');
console.log('  common files: ' + COMMON);
const RG = require(path.join(COMMON, 'room_graph.js'));
// T8: two rooms on different storeys (a vertical hop: _legalizePath tests no chord, so the only timer reads are its own start + end).
function twoRooms() {
  const n = (g, s, x) => ({ guid: g, kind: 'room', storey: s, cx: x, cy: 0, name: g });
  const g = { nodes: [n('r1', 'L1', 0), n('r2', 'L2', 5)], edges: [{ a: 'r1', b: 'r2', kind: 'E1', doorGuid: 'd1', doorName: 'D1' }] };
  g.nodesByGuid = { r1: g.nodes[0], r2: g.nodes[1] };
  return g;
}
function legStats() { const g = twoRooms(); capture(() => { for (let i = 0; i < 3; i++) RG.shortestPath(g, 'r1', 'r2'); }); return g._legalizeStats || {}; }
tick = 958; globalThis.CoreEdge = fakeEdge;
const L1 = legStats();
check('T8 fake edge: room_graph _legalizeStats after 3 routes = {calls:' + L1.calls + ', ms:' + L1.ms + '} (expected calls:3, ms:126)', L1.calls === 3 && L1.ms === 126);
delete globalThis.CoreEdge;
const L0 = legStats();
check('T8 no edge: _legalizeStats.ms=' + L0.ms + ' (null, never a wall clock) calls=' + L0.calls, L0.calls === 3 && L0.ms === null);

// T9: the REAL reader, EgressSanity.evaluate on a building with no storey_walkable_raster (so §PATH_LEGAL_NO_RASTER prints).
const BLD = process.env.CORE_TIMING_BUILDINGS || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const DUPLEX = process.env.CORE_TIMING_EGRESS_DB || path.join(BLD, 'Clinic_meta.db');   // a building with NO storey_walkable_raster
let initSql = null;
try { initSql = require(path.join(__dirname, '..', '..', 'tests', '_sqljs.js')).requireSqlJs(); } catch (e) { initSql = null; }
async function egressLine(withEdge) {
  const SQL = await initSql();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(DUPLEX)));
  const q = (sql, p) => { const r = p ? db.exec(sql, p) : db.exec(sql); return r.length ? r[0].values : []; };
  const rules = JSON.parse(fs.readFileSync(path.join(VIEWER, 'rates', 'egress_rules.json'), 'utf8'));
  const ES = require(path.join(VIEWER, 'egress_sanity.js'));
  const logs = []; let threw = null;
  tick = 958; if (withEdge) globalThis.CoreEdge = fakeEdge; else delete globalThis.CoreEdge;
  capture(() => { try { ES.evaluate(q, rules, { log: m => logs.push(m) }); } catch (e) { threw = e.message; } });
  delete globalThis.CoreEdge; db.close();
  return { line: logs.find(l => /§PATH_LEGAL_NO_RASTER/.test(l)) || null, threw };
}
async function t9() {
  if (!initSql || !fs.existsSync(DUPLEX)) { console.log('  §CORE_TIMING T9 INCONCLUSIVE: ' + (initSql ? DUPLEX + ' absent' : 'sql.js not found')); return 'INCONCLUSIVE'; }
  const E1 = await egressLine(true), E0 = await egressLine(false);
  if (!E1.line && !E1.threw) { console.log('  §CORE_TIMING T9 INCONCLUSIVE: no §PATH_LEGAL_NO_RASTER line (nothing judged)'); return 'INCONCLUSIVE'; }
  const m = E1.line && E1.line.match(/ calls=(\d+) ms=(\S+)/);
  check('T9 fake edge, Clinic egress: ' + (E1.line ? E1.line.replace(/^.*(legalizations=)/, '$1') : 'threw ' + E1.threw) + ' (ms must be 42 x calls)',
    !!m && Number(m[2]) === 42 * Number(m[1]));
  check('T9 no edge, Clinic egress: ' + (E0.line ? E0.line.replace(/^.*(legalizations=)/, '$1') : 'threw ' + E0.threw) + ' (ms=?, no throw)',
    !E0.threw && !!E0.line && / ms=\?( |$)/.test(E0.line));
  return 'ran';
}

// T10: ScheduleInject.inject with stubs (the timing is all this judges; the stub's materialize/persist do nothing).
async function injectRun(withEdge) {
  const SI = require(path.join(VIEWER, 'schedule_inject.js'));
  const A = { db: { exec: () => [], run() {} }, DB_URL: 'stub.db' };
  const SA = { activeSchedule: () => null, materializeZones: () => ({ ok: true, scheduleId: 'SCH_AUTHORED', zoneCount: 3, templateVersion: 't' }), persistDb: () => Promise.resolve(true) };
  const progress = { stage() {}, fail() {}, done() {} };
  tick = 958; if (withEdge) globalThis.CoreEdge = fakeEdge; else delete globalThis.CoreEdge;
  const lines = [], log = console.log; console.log = (...a) => lines.push(a.join(' '));
  let res; try { res = await SI.inject(A, { scheduleAuthor: SA, progress, template: null }); } finally { console.log = log; delete globalThis.CoreEdge; }
  return { mat: lines.find(l => l.startsWith('§SCHED_INJECT materialized')) || '(none)', result: lines.find(l => l.startsWith('§SCHED_INJECT_RESULT')) || '(none)', res };
}
async function t10() {
  const I1 = await injectRun(true), I0 = await injectRun(false);
  const say = I => I.mat.replace(/^.*(tasks=)/, '$1') + ' | ' + I.result.replace(/^§SCHED_INJECT_RESULT /, '') + ' | res ' + (I.res && I.res.materializeMs) + '/' + (I.res && I.res.persistMs);
  check('T10 fake edge: ' + say(I1), / ms=42$/.test(I1.mat) && / materializeMs=42 persistMs=42$/.test(I1.result) && I1.res && I1.res.materializeMs === 42 && I1.res.persistMs === 42);
  check('T10 no edge: ' + say(I0), / ms=\?$/.test(I0.mat) && / materializeMs=\? persistMs=\?$/.test(I0.result) && I0.res && I0.res.materializeMs === null && I0.res.persistMs === null);
}
for (const [dir, f] of [[COMMON, 'room_graph.js'], [VIEWER, 'schedule_inject.js']]) {
  const v = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
  const n = (v.match(/\bDate\.now\(|\bperformance\.now\(/g) || []).length;
  check('T11 ' + path.basename(dir) + '/' + f + ' has no Date.now / performance.now call left (found ' + n + ')', n === 0);
}

(async () => {
const t9state = await t9();
await t10();
const verdict = judged === 0 ? 'INCONCLUSIVE' : fail === 0 ? (t9state === 'INCONCLUSIVE' ? 'INCONCLUSIVE' : 'PASS') : 'FAIL';
console.log('§CORE_TIMING checks=' + judged + ' failed=' + fail + ' verdict=' + verdict);
if (verdict !== 'PASS') process.exitCode = 1;
})();
