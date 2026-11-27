// ⚠ DO NOT REMOVE — WITNESS W-TASK-ARRIVAL (2026-11-28, bim-compiler prompts/MOBILE_PERF.md WO-13 + the designer's per-element additions)
// ISSUE THIS PROVES OR DISPROVES: which task card comes up as the walker moves. viewer/task_arrival.js is ONE pure function (no DOM, no
// THREE); a task has MANY elements (every door of an item), so arrival is judged per element: nearest ARMED element inside the task's own
// radius on the walker's storey, one card per task per call, re-armed only after leaving the radius or the storey. No default radius.
// Node only, numbers only. Every expected number below is a LITERAL with its arithmetic in a comment.
//   A1 inside radius, same storey -> shown; d_m equals the hand-computed distance to 1 mm
//   A2 same x,y but another storey -> not shown
//   A3 a second sample inside -> not shown again; out, then in -> shown again
//   A4 a set of 3 elements: the NEAREST decides (list order is irrelevant; one card per task; equal distance -> smallest guid)
//   A5 no radius (null / absent / 0 / negative / NaN / Infinity) -> never by distance, counted in no_radius; shown by qr and by manual
//   A6 empty task list -> §TASK_ARRIVE_SCAN tasks=0; this case is printed INCONCLUSIVE (nothing was judged), it is not a fail
//   A7 two elements of one task both inside: first sample shows the nearest, a later sample nearer the second shows the second, neither twice
//   A8 arriveBy('qr') with a non-matching string shows nothing, a matching one shows that task (by=qr, guid=null, d_m=null); armed state untouched
//   A9 walk.js wiring: the guard of _walkTaskArrive (the REAL function text, extracted from viewer/walk.js) does nothing and throws nothing
//      when window.TaskArrival is undefined OR A._tasks is empty/absent; with both present it calls arrive() once with the mapped sample
//   R1 RED CONTROL: the storey test removed from the module source -> A2 must FAIL
//   R2 RED CONTROL: the "armed" bookkeeping removed from the module source -> A3 must FAIL
// §-log first — READ viewer/tests/witness_task_arrival.log after every run. Run: node viewer/tests/witness_task_arrival.js
'use strict';
const fs = require('fs'), path = require('path');
const SRC_PATH = path.join(__dirname, '..', 'task_arrival.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const WALK = fs.readFileSync(path.join(__dirname, '..', 'walk.js'), 'utf8');

const out = [];
const realLog = console.log;
console.log = function () { const m = Array.prototype.join.call(arguments, ' '); out.push(m); realLog(m); };
function S(m) { console.log(m); }
function load(src) { const m = { exports: {} }; new Function('module', src)(m); return m.exports; }
function mutate(src, from, to) { if (src.indexOf(from) < 0) throw new Error('R-control: snippet not found: ' + from); return src.replace(from, to); }

let checks = 0, fails = 0, inconclusive = 0;
function check(name, ok, detail) { checks++; if (!ok) fails++; S('§W-TASK-ARRIVAL ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (detail ? ' — ' + detail : '')); }
const near = (a, b) => Math.abs(a - b) < 0.0005;   // 1 mm
const ids = r => r.show.map(s => s.taskId + '@' + s.guid).join(',') || '-';

// --- the scenarios (functions of the API, so the red controls rerun the very same assertions on a mutant) -----------------------
function scenA2(API) {   // same x,y one storey up
  const T = [{ id: 'T1', radius_m: 6, qr: null, elements: [{ guid: 'E1', storey: 'L0', x: 4, y: 6 }] }];
  const r = API.arrive({ x: 3, y: 4, storey: 'L1' }, T, {});
  return { ok: r.show.length === 0, shown: ids(r) };
}
function scenA3(API) {
  const T = [{ id: 'T1', radius_m: 6, qr: null, elements: [{ guid: 'E1', storey: 'L0', x: 4, y: 6 }] }];
  let r = API.arrive({ x: 3, y: 4, storey: 'L0' }, T, {});              // in: shown
  const first = r.show.length === 1;
  r = API.arrive({ x: 3, y: 4.5, storey: 'L0' }, T, r.state);           // still in: not again
  const again = r.show.length === 0;
  r = API.arrive({ x: 100, y: 100, storey: 'L0' }, T, r.state);         // out (dx=-97, dy=-96 -> d = sqrt(9409+9216) = 136.5): nothing, re-armed
  const out1 = r.show.length === 0;
  r = API.arrive({ x: 3, y: 4, storey: 'L0' }, T, r.state);             // in again: shown again
  const re = r.show.length === 1;
  return { ok: first && again && out1 && re, detail: 'first=' + first + ' notAgain=' + again + ' out=' + out1 + ' reshown=' + re };
}

const API = load(SRC);

// A1 — element (4,6), sample (3,4): dx=1, dy=2 -> d = sqrt(1+4) = sqrt(5) = 2.2360680; radius 6 -> inside
{
  const T = [{ id: 'T1', radius_m: 6, qr: null, elements: [{ guid: 'E1', storey: 'L0', x: 4, y: 6 }] }];
  const r = API.arrive({ x: 3, y: 4, storey: 'L0' }, T, {});
  const s = r.show[0];
  check('A1', r.show.length === 1 && s.taskId === 'T1' && s.guid === 'E1' && s.by === 'distance' && near(s.d_m, 2.236068),
    'show=' + ids(r) + ' d_m=' + (s ? s.d_m.toFixed(3) : 'none') + ' expected 2.236 (sqrt(1^2+2^2))');
}
// A2 — same x,y, storey L1 vs the element's L0
{ const a = scenA2(API); check('A2', a.ok, 'shown=' + a.shown + ' (expected -)'); }
// A3 — see scenA3: second sample (3,4.5): dx=1, dy=1.5 -> 1.803 (inside, not armed); out-sample d = 136.5 > 6
{ const a = scenA3(API); check('A3', a.ok, a.detail); }
// A4 — sample (1,0) L0, radius 10. a(0,0): d=1 ; b(5,0): d=4 ; c(0,9): d=sqrt(1+81)=9.0554. List order c,b,a: the nearest is a, not the first listed.
{
  const els = [{ guid: 'g-c', storey: 'L0', x: 0, y: 9 }, { guid: 'g-b', storey: 'L0', x: 5, y: 0 }, { guid: 'g-a', storey: 'L0', x: 0, y: 0 }];
  const r = API.arrive({ x: 1, y: 0, storey: 'L0' }, [{ id: 'T1', radius_m: 10, qr: null, elements: els }], {});
  const nearest = r.show.length === 1 && r.show[0].guid === 'g-a' && near(r.show[0].d_m, 1);
  // tie: sample (0,0): z1(3,0) d=3 and z2(0,3) d=3 equal -> lexically smallest guid 'a-tie' (listed second)
  const tie = API.arrive({ x: 0, y: 0, storey: 'L0' }, [{ id: 'T2', radius_m: 10, qr: null,
    elements: [{ guid: 'b-tie', storey: 'L0', x: 3, y: 0 }, { guid: 'a-tie', storey: 'L0', x: 0, y: 3 }] }], {});
  const tieOk = tie.show.length === 1 && tie.show[0].guid === 'a-tie' && near(tie.show[0].d_m, 3);
  check('A4', nearest && tieOk, 'nearest=' + ids(r) + ' d_m=' + (r.show[0] ? r.show[0].d_m.toFixed(3) : 'none') + ' (expected g-a 1.000); tie=' + ids(tie) + ' (expected a-tie)');
}
// A5 — no radius in six spellings; the walker stands ON the element (d=0) and still nothing shows by distance; qr + manual show it
{
  const mk = (id, rad, qr) => { const t = { id, qr, elements: [{ guid: 'E-' + id, storey: 'L0', x: 0, y: 0 }] }; if (rad !== undefined) t.radius_m = rad; return t; };
  const T = [mk('N1', null, 'QR-N1'), mk('N2', undefined, null), mk('N3', 0, null), mk('N4', -2, null), mk('N5', NaN, null), mk('N6', Infinity, null)];
  const r = API.arrive({ x: 0, y: 0, storey: 'L0' }, T, {});
  const q = API.arriveBy('qr', 'QR-N1', T, r.state), m = API.arriveBy('manual', 'N3', T, r.state);
  check('A5', r.show.length === 0 && r.scan.tasks === 6 && r.scan.no_radius === 6 && r.scan.with_radius === 0
    && q.show.length === 1 && q.show[0].taskId === 'N1' && q.show[0].by === 'qr'
    && m.show.length === 1 && m.show[0].taskId === 'N3' && m.show[0].by === 'manual',
    'distance=' + ids(r) + ' scan=' + JSON.stringify(r.scan) + ' qr=' + ids(q) + ' manual=' + ids(m));
}
// A6 — empty list: nothing judged -> INCONCLUSIVE (printed as such; not a fail, not a PASS)
{
  const r = API.arrive({ x: 0, y: 0, storey: 'L0' }, [], {});
  const ok = r.show.length === 0 && r.scan.tasks === 0 && r.scan.shown === 0;
  checks++; if (!ok) fails++; else inconclusive++;
  S('§W-TASK-ARRIVAL A6 ' + (ok ? 'INCONCLUSIVE' : 'FAIL') + ' — empty task list: scan tasks=' + r.scan.tasks + ' (nothing judged; the scan line is the result, this is not a PASS)');
}
// A7 — e1(0,0), e2(10,0), radius 12, same storey L0.
//   s1 (1,0): d1=1, d2=9 -> e1 shown (nearest)
//   s2 (8,0): d1=8, d2=2 -> e1 inside but not armed (still shown), e2 armed and inside -> e2 shown
//   s3 (8,0) again: both shown, none armed -> nothing
{
  const T = [{ id: 'T1', radius_m: 12, qr: null, elements: [{ guid: 'e1', storey: 'L0', x: 0, y: 0 }, { guid: 'e2', storey: 'L0', x: 10, y: 0 }] }];
  const r1 = API.arrive({ x: 1, y: 0, storey: 'L0' }, T, {});
  const r2 = API.arrive({ x: 8, y: 0, storey: 'L0' }, T, r1.state);
  const r3 = API.arrive({ x: 8, y: 0, storey: 'L0' }, T, r2.state);
  check('A7', r1.show.length === 1 && r1.show[0].guid === 'e1' && near(r1.show[0].d_m, 1)
    && r2.show.length === 1 && r2.show[0].guid === 'e2' && near(r2.show[0].d_m, 2)
    && r3.show.length === 0, 's1=' + ids(r1) + ' (d 1.000) s2=' + ids(r2) + ' (d 2.000) s3=' + ids(r3));
}
// A8 — task qr 'QR-7'
{
  const T = [{ id: 'T7', radius_m: 5, qr: 'QR-7', elements: [{ guid: 'E7', storey: 'L0', x: 0, y: 0 }] }, { id: 'T8', radius_m: 5, qr: null, elements: [] }];
  const s0 = API.arrive({ x: 0, y: 0, storey: 'L0' }, T, {});                       // E7 shown by distance, now NOT armed
  const no = API.arriveBy('qr', 'QR-77', T, s0.state), yes = API.arriveBy('qr', 'QR-7', T, s0.state);
  const sameState = JSON.stringify(yes.state) === JSON.stringify(s0.state) && JSON.stringify(no.state) === JSON.stringify(s0.state);
  const after = API.arrive({ x: 0, y: 0, storey: 'L0' }, T, yes.state);            // qr did not re-arm E7: still nothing
  check('A8', no.show.length === 0 && yes.show.length === 1 && yes.show[0].taskId === 'T7' && yes.show[0].by === 'qr'
    && yes.show[0].guid === null && yes.show[0].d_m === null && sameState && after.show.length === 0,
    'nonmatch=' + ids(no) + ' match=' + ids(yes) + ' armedUntouched=' + sameState + ' afterQr=' + ids(after));
}
// A9 — the REAL _walkTaskArrive text from viewer/walk.js, run against stubs
{
  const m = /function _walkTaskArrive\(p\) \{[\s\S]*?\n  \}\n/.exec(WALK);
  if (!m) { check('A9', false, '_walkTaskArrive not found in viewer/walk.js'); }
  else {
    const mk = (win, A) => new Function('window', 'A', 'TaskArrival', m[0] + '; return _walkTaskArrive;')(win, A, win.TaskArrival);
    const base = () => ({ walkStoreyLevels: [{ storey: 'L0', floorZ: 0 }, { storey: 'L1', floorZ: 3 }], WALK_EYE_HEIGHT: 1.6,
      three2ifc: (x, y, z) => ({ ix: x + 100, iy: -z + 200, iz: y }) });
    let calls = 0, got = null;
    const fake = { arrive: (s, t, st) => { calls++; got = { s, n: t.length }; return { show: [], state: { n: calls }, scan: {} }; } };
    const before = out.length; let threw = false;
    const cases = [
      ['no TaskArrival', {}, Object.assign(base(), { _tasks: [{ id: 'T' }] })],
      ['_tasks absent', { TaskArrival: fake }, base()],
      ['_tasks empty', { TaskArrival: fake }, Object.assign(base(), { _tasks: [] })],
      ['_tasks not array', { TaskArrival: fake }, Object.assign(base(), { _tasks: 'x' })]];
    for (const c of cases) { try { mk(c[1], c[2])({ x: 1, y: 1.6, z: -2 }); } catch (e) { threw = true; } }
    const quiet = calls === 0 && !threw && out.length === before;
    // both present: camera feet y = 4.6-1.6 = 3.0 -> nearest floor L1 (|3-3|=0 vs |3-0|=3); ifc x = 1+100 = 101, y = -(-2)+200 = 202
    const A = Object.assign(base(), { _tasks: [{ id: 'T' }] });
    mk({ TaskArrival: fake }, A)({ x: 1, y: 4.6, z: -2 });
    const live = calls === 1 && got.s.x === 101 && got.s.y === 202 && got.s.storey === 'L1' && got.n === 1 && A._taskArrivalState.n === 1;
    check('A9', quiet && live, 'guards (4 cases: arrive calls=0 throws=' + threw + ' new log lines=' + (out.length - before) + ') ; both present -> 1 call sample=' + JSON.stringify(got && got.s) + ' (expected x=101 y=202 storey=L1); proven by running the real function text extracted from walk.js under node with stubs');
  }
}

// R1 — storey test removed -> A2 must FAIL
{
  S('§W-TASK-ARRIVAL R1 mutant: storey test removed (the mutant\'s own log lines follow)');
  const mut = load(mutate(SRC, "String(el.storey) === String(sample.storey) && ", ''));
  const a = scenA2(mut);
  if (a.ok) { fails++; S('§W-TASK-ARRIVAL R1 NOT-DETECTED — A2 still passes without the storey test (the witness cannot fail)'); }
  else S('§W-TASK-ARRIVAL R1 DETECTED — A2 fails without the storey test: shown=' + a.shown);
}
// R2 — armed bookkeeping removed -> A3 must FAIL
{
  S('§W-TASK-ARRIVAL R2 mutant: armed bookkeeping removed (the mutant\'s own log lines follow)');
  const mut = load(mutate(SRC, "if (next.shown[k]) continue; ", ''));
  const a = scenA3(mut);
  if (a.ok) { fails++; S('§W-TASK-ARRIVAL R2 NOT-DETECTED — A3 still passes without the armed test (the witness cannot fail)'); }
  else S('§W-TASK-ARRIVAL R2 DETECTED — A3 fails without the armed test: ' + a.detail);
}

const verdict = fails ? 'FAIL' : 'PASS';
S('§W-TASK-ARRIVAL checks=' + checks + ' fail=' + fails + ' verdict=' + verdict + (inconclusive ? ' (A6 reported INCONCLUSIVE by design: empty list judges nothing)' : ''));
fs.writeFileSync(path.join(__dirname, 'witness_task_arrival.log'), out.join('\n') + '\n');
process.exit(fails ? 1 : 0);
