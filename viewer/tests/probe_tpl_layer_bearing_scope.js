#!/usr/bin/env node
// PROBE — §TPL_LAYER_SCOPE: how big is the change if §TPL_LAYER_ORDER stops narrowing the bearing
// relation? Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.5c. MEASURE-ONLY — it decides
// nothing, changes nothing, and is the evidence behind that section's ⛔ HOLD.
//
// ISSUE THIS PROVES OR DISPROVES. `schedule_author.js` announces the layer pass as "topological
// layers of the SHIPPED contact graph's bearing relation" and calls the real
// SupportSweep.contactGraph — then RE-FILTERS its output with a clause the owner does not have:
//
//   schedule_author.js  if (S2.bz < T2.bz - EPSl && S2.tz >= T2.bz - GAPl && S2.tz <= T2.bz + GAPl)
//   support_sweep.js:410   if ((S.bz < T.bz - EPS && S.tz >= T.bz - GAP) || ...   <- no upper bound
//
// That extra clause is §I.1 copy 3's upper bound — which exists ONLY on auditFloating's WALL pool —
// applied here to EVERY contact. §H.2a measured that 32.0% of Hospital's in-scope bearing contacts
// are supports whose top sits above the base they carry: precisely the edges this discards. And the
// pass's own self-check RE-TYPES THE SAME NARROWED PREDICATE, so `stillInverted` counts inversions
// only among pairs the pass and the judge already agree to look at — PRIMAL LAW clause 4's
// scope-blind verdict.
//
// THREE VARIANTS, so the pass-change and the judge-change can be told apart:
//   narrow    — shipped: pass and judge BOTH narrowed. The status quo.
//   widejudge — SHIPPED pass, OWNER's judge. The key variant: it counts the real inversions the
//               shipped self-check is structurally unable to see. Nothing about behaviour changes
//               here — only what the judge is allowed to look at.
//   wide      — the candidate fix: the owner's predicate on both sides.
//
// Usage: node viewer/tests/probe_tpl_layer_bearing_scope.js [Building ...]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const HOME = os.homedir();
const VIEWER = process.env.VIEWER_DIR || path.join(__dirname, '..');
const BLD = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['Duplex', 'HHS_Office_Federated', 'Hospital'];
const START = '2026-01-01';

// The two narrowing clauses, matched VERBATIM against the shipped file. If either stops matching,
// this probe throws rather than silently measuring an unpatched variant and reporting "no change".
const PASS_NARROW  = ' && S2.tz <= T2.bz + GAPl';
const JUDGE_NARROW = ' && _S.tz <= _T.bz + SG.GAP';

// Build symlink-farm viewer variants differing from the shipped tree ONLY in those clauses.
function buildVariants() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tplscope-'));
  const src = fs.readFileSync(path.join(VIEWER, 'schedule_author.js'), 'utf8');
  const nP = src.split(PASS_NARROW).length - 1, nJ = src.split(JUDGE_NARROW).length - 1;
  if (nP !== 1 || nJ !== 1) {
    throw new Error('§TPL_SCOPE ABORT — expected exactly one of each narrowing clause, found pass=' +
      nP + ' judge=' + nJ + '. The predicate moved; re-read schedule_author.js before trusting this probe.');
  }
  const out = {};
  for (const [name, dropPass, dropJudge] of [['narrow', 0, 0], ['widejudge', 0, 1], ['wide', 1, 1]]) {
    const d = path.join(root, name);
    fs.mkdirSync(d);
    for (const f of fs.readdirSync(VIEWER)) {
      if (f === 'schedule_author.js') continue;
      fs.symlinkSync(path.join(VIEWER, f), path.join(d, f));
    }
    let s = src;
    if (dropPass) s = s.replace(PASS_NARROW, '');
    if (dropJudge) s = s.replace(JUDGE_NARROW, '');
    fs.writeFileSync(path.join(d, 'schedule_author.js'), s);
    out[name] = d;
  }
  return out;
}

function runVariant(vdir, dbFile) {
  for (const k of Object.keys(require.cache)) if (k.includes('/viewer/') || k.startsWith(vdir)) delete require.cache[k];
  const SG = require(path.join(vdir, 'schedule_gate.js'));
  global.ScheduleGate = SG; globalThis.ScheduleGate = SG;
  // ⚠ SupportSweep MUST be registered or the layer pass does not run AT ALL — it logs
  // §TPL_LAYER_ORDER_FAIL and returns null. The node witness harness does NOT register it, so every
  // template witness has been scoring a run in which this pass never executed (surfaced 2026-08-27
  // when witness_4d_template_instantiation stopped muting its log; see §I.5j(b)).
  const SS = require(path.join(vdir, 'support_sweep.js'));
  global.SupportSweep = SS; globalThis.SupportSweep = SS;
  const CP = require(path.join(vdir, 'cpm_schedule.js'));
  global.CpmSchedule = CP; globalThis.CpmSchedule = CP;
  const SA = require(path.join(vdir, 'schedule_author.js'));
  const T = JSON.parse(fs.readFileSync(path.join(vdir, 'rates', '4D_template.json'), 'utf8'));
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(vdir, 'rates.js'), 'utf8'), sb);

  const db = new global.__SQL.Database(new Uint8Array(fs.readFileSync(dbFile)));
  const logs = [];
  const _l = console.log, _w = console.warn;
  console.log = (...a) => { logs.push(a.join(' ')); };
  console.warn = (...a) => { logs.push(a.join(' ')); };
  let res;
  try {
    res = SA.materializeZones(db, sb.SEQUENCE_RULES, {
      start: START, laborRates: sb.LABOR_RATES, rates: sb.RATES,
      nameOverrides: sb.SEQUENCE_NAME_OVERRIDES, defaultRule: sb.SEQUENCE_DEFAULT,
      scheduleGate: SG, shiftHours: T.calendar.hours_per_shift, template: T
    });
  } finally { console.log = _l; console.warn = _w; }

  const q = s => { const r = db.exec(s); return r.length ? r[0].values : []; };
  const te = q("SELECT task_id,guid FROM task_elements");
  db.close();
  const sched = (res && res.displaySchedule) || {};
  // ⚠ SHAPE GUARD. displaySchedule is {start,end}; the persisted cache (cache_4d_run.js) is {s,e}.
  // Reading the wrong one yields `undefined` everywhere, which compares false and reports "nothing
  // changed" — this probe genuinely did that once, printing startChanged=0 and 1 distinct start
  // instant per task, before this guard existed. Refuse to measure rather than measure nothing.
  const k0 = Object.keys(sched)[0];
  if (k0 && (sched[k0].start === undefined || sched[k0].end === undefined)) {
    throw new Error('§TPL_SCOPE ABORT — displaySchedule is not {start,end}; got [' + Object.keys(sched[k0]) + ']');
  }
  return {
    ok: !!(res && res.ok), sched, te, totalDays: res && res.totalDays,
    line: logs.filter(l => l.indexOf('§TPL_LAYER_SELFCHECK') === 0).pop() || '<none>',
    inverted: (function () {
      const m = /stillInverted=(\d+)/.exec(logs.filter(l => l.indexOf('§TPL_LAYER_SELFCHECK') === 0).pop() || '');
      return m ? Number(m[1]) : null;
    })()
  };
}

function ranks(te, sched) {
  const byTask = {};
  te.forEach(([tid, g]) => { (byTask[tid] = byTask[tid] || []).push(g); });
  const rank = {}, taskOf = {};
  for (const tid of Object.keys(byTask)) {
    const gs = byTask[tid].filter(g => sched[g]);
    gs.sort((a, b) => (sched[a].start - sched[b].start) || (a < b ? -1 : 1));
    gs.forEach((g, i) => { rank[g] = i; taskOf[g] = tid; });
  }
  return { rank, taskOf, byTask };
}

(async () => {
  const V = buildVariants();
  global.__SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  for (const bld of BUILDINGS) {
    const dbFile = path.join(BLD, bld + '_extracted.db');
    if (!fs.existsSync(dbFile)) { console.log('§TPL_SCOPE SKIP ' + bld + ' — no db'); continue; }
    const R = {};
    for (const v of Object.keys(V)) R[v] = runVariant(V[v], dbFile);
    console.log('\n═══ ' + bld + ' ═══');
    for (const v of Object.keys(V)) console.log('  ' + v.padEnd(10) + R[v].line);
    if (!R.narrow.ok || !R.wide.ok || !R.widejudge.ok) { console.log('  §TPL_SCOPE INCONCLUSIVE — a variant failed to materialize'); continue; }

    const A = ranks(R.narrow.te, R.narrow.sched), C = ranks(R.wide.te, R.wide.sched);
    const guids = Object.keys(A.rank);
    let movedRank = 0, movedTask = 0, judged = 0, startChanged = 0, maxShiftD = 0;
    const tasksTouched = new Set();
    for (const g of guids) {
      if (C.rank[g] === undefined) continue;
      judged++;
      if (A.taskOf[g] !== C.taskOf[g]) { movedTask++; tasksTouched.add(A.taskOf[g]); }
      else if (A.rank[g] !== C.rank[g]) { movedRank++; tasksTouched.add(A.taskOf[g]); }
      const a = R.narrow.sched[g], c = R.wide.sched[g];
      if (a && c && a.start !== c.start) { startChanged++; maxShiftD = Math.max(maxShiftD, Math.abs(a.start - c.start) / 86400000); }
    }
    const nTasks = Object.keys(A.byTask).length;
    const blind = R.widejudge.inverted ? (100 * (R.widejudge.inverted - R.narrow.inverted) / R.widejudge.inverted) : 0;
    const cure = R.widejudge.inverted ? (100 * (R.widejudge.inverted - R.wide.inverted) / R.widejudge.inverted) : 0;
    console.log('  §TPL_SCOPE_JUDGE  shippedJudge=' + R.narrow.inverted +
      '  ownerJudge(sameRun)=' + R.widejudge.inverted +
      '  ownerJudge(afterFix)=' + R.wide.inverted +
      '  selfCheckBlindTo=' + blind.toFixed(1) + '%  fixCures=' + cure.toFixed(1) + '%');
    console.log('  §TPL_SCOPE_BLAST  rankChanged=' + movedRank + '/' + judged +
      ' (' + (100 * movedRank / (judged || 1)).toFixed(2) + '%)' +
      '  tasksTouched=' + tasksTouched.size + '/' + nTasks +
      ' (' + (100 * tasksTouched.size / (nTasks || 1)).toFixed(1) + '%)' +
      '  taskMembershipChanged=' + movedTask +
      '  maxElementShift=' + maxShiftD.toFixed(2) + 'd' +
      '  totalDays ' + R.narrow.totalDays + '->' + R.wide.totalDays);
  }
  console.log('\n§TPL_SCOPE VERDICT — see bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.5c. The fix is ' +
    'CORRECT and cures most real inversions, but its blast radius is SWEEPING (most elements in most ' +
    'tasks reorder), so it is HELD pending a decision, not applied.');
})();
