// Proves ANALYSIS_SIDECAR.md §T4 — W-4D-SIDECAR / W-4D-REGRESSION-GUARD.
// Issue under test: "4D default is captured-or-CPM (never depends on kernel_ops);
// kernel_ops is an override that applies ONLY if valid; a broken/empty/throwing
// kernel_ops falls back to the baked default → the Gantt is NEVER broken."
const A = require('../viewer/analysis_sidecar.js');

let logs = [];
const origLog = console.log;
console.log = (...a) => { logs.push(a.join(' ')); origLog(...a); };

const CPM_TASKS = [{ id: 1, name: 'L1 - Substructure', phase: 'Substructure' }];
const cpmFn = () => CPM_TASKS;                       // page's generateSchedule (stub)
const CAP_TASKS = [{ id: 9, name: 'CAPTURED', phase: 'Superstructure' }];

let fail = 0;
function check(name, cond, got) { console.log((cond?'PASS ':'FAIL ')+name+(cond?'':'  got='+JSON.stringify(got))); if(!cond) fail++; }

(async () => {
  // 1) captured present → source=captured, CPM NOT used
  let cpmCalled = false;
  const cap = A.compute4D('B', () => CAP_TASKS, () => { cpmCalled = true; return CPM_TASKS; }, []);
  check('captured present → source=captured', cap.source === 'captured' && cap.tasks === CAP_TASKS, cap.source);
  check('captured present → CPM not invoked', cpmCalled === false);

  // 2) captured absent → CPM default, source=generated
  const gen = A.compute4D('B', () => null, cpmFn, []);
  check('captured absent → source=generated', gen.source === 'generated' && gen.tasks === CPM_TASKS, gen.source);

  // 3) captured THROWS → graceful fall to CPM (no throw)
  const thr = A.compute4D('B', () => { throw new Error('bad tasks table'); }, cpmFn, []);
  check('captured throws → falls to CPM (no throw)', thr.source === 'generated', thr.source);

  // 4) resolve4D: valid kernel_ops overrides
  const def = { source: 'generated', tasks: CPM_TASKS };
  const r1 = A.resolve4D(def, [{ op: 1 }], () => [{ id: 1 }, { id: 2 }]);
  check('valid kernel_ops → override (source=kernel_ops, overridden)', r1.source === 'kernel_ops' && r1.overridden === true && r1.tasks.length === 2, r1);

  // 5) empty kernel_ops → default
  const r2 = A.resolve4D(def, [], () => [{ id: 1 }]);
  check('empty kernel_ops → baked default', r2.source === 'generated' && r2.overridden === false && r2.tasks === CPM_TASKS, r2);

  // 6) THE REGRESSION GUARD: buildFromOps THROWS (the TM-regenerate breakage) → default, no throw
  let threw = false;
  let r3;
  try { r3 = A.resolve4D(def, [{ op: 'corrupt' }], () => { throw new Error('drone regenerate drift'); }); }
  catch (e) { threw = true; }
  check('kernel_ops builder THROWS → NO throw escapes', threw === false);
  check('kernel_ops builder THROWS → falls to baked default (Gantt not broken)', r3 && r3.source === 'generated' && r3.tasks === CPM_TASKS, r3);

  // 7) buildFromOps returns [] (drift yields nothing) → default
  const r4 = A.resolve4D(def, [{ op: 1 }], () => []);
  check('kernel_ops builder empty → baked default', r4.source === 'generated' && r4.overridden === false, r4);

  // 8) get4D lazy path, OPFS-absent → computed, baked=false, witness fires
  const got = await A.get4D('Duplex', () => null, cpmFn, []);
  check('§4D_SIDECAR computed line fired (schedule=generated)', logs.some(l => /§4D_SIDECAR source=computed building=Duplex schedule=generated tasks=1 baked=false/.test(l)));
  check('get4D returns the default schedule', got.tasks === CPM_TASKS, got);

  console.log('\n§4D witnesses:', logs.filter(l => /§4D_(SIDECAR|RESOLVE)/.test(l)).join('  |  '));
  console.log(fail===0 ? '\n✅ ALL PASS' : `\n❌ ${fail} FAILED`);
  process.exit(fail===0?0:1);
})();
