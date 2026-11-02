// capex/tests/witness_fold_schedule_from_db.js — W-FOLD-SCHEDULE-FROM-DB (spec: prompts/CAPEX_DASHBOARD.md §5.5 R1-f).
// ISSUE IT PROVES OR DISPROVES: "the viewer's push ignores the programme on screen" — the Find › ERP push folded without a programme, so the order had no dates
// while the Gantt showed them. The reader ProjFold.scheduleFromDb(db) must return, from the building db the viewer holds, EXACTLY the task list the 4D owner produced.
// Instrument: the SHIPPED pipeline via scripts/cache_4d_run.js build() (no second harness), with its read-only onDb hook → the db right after materializeZones.
// Expected values = materializeZones' own res.tasks (start + sDays/eDays, guids) — independent of the reader.
// Break switch: BREAK=1 drops one element from the reader's output (never from the pipeline db, whose run is persisted) → the element-set check must FAIL.
// Run: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_fold_schedule_from_db.js [building=HHS_Office_Federated]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
const BLD = process.argv[2] || 'HHS_Office_Federated', BREAK = process.env.BREAK === '1';
let fails = 0, judged = 0;
function check(name, ok, detail) { judged++; if (!ok) fails++; console.log('§W_FSDB_ASSERT ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : '')); }
const addDays = (s, d) => new Date(Date.parse(s + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);

(async () => {
  let got = null, exp = null, start = null, foldOut = null, noneOut = 'unset';
  await CACHE.build(BLD, true, undefined, { onDb: (db, res, ctx) => {
    const ProjFold = require(path.join(ROOT, 'viewer', 'proj_fold.js'));
    start = ctx.start;
    exp = (res && res.tasks || []).map(t => ({ id: t.id, phase: t.phase, storey: t.storey, s: addDays(start, t.sDays), e: addDays(start, t.eDays), g: t.guids.slice().sort().join(',') }));
    const sch = ProjFold.scheduleFromDb(db, ctx.template, ctx.SA);   // reads only
    if (BREAK && sch && sch.tasks.length) { const g = sch.tasks[0].guids.pop(); console.log('§W_FSDB_BREAK dropped ' + g + ' from reader task ' + sch.tasks[0].id); }
    got = sch && sch.tasks.map(t => ({ id: t.id, phase: t.phase, storey: t.storey, s: addDays(sch.start, t.sDays), e: addDays(sch.start, t.eDays), g: t.guids.slice().sort().join(',') }));
    if (sch) foldOut = { sch };
    // negative: a db with no schedule rows → null
    const fresh = new db.constructor();
    noneOut = ProjFold.scheduleFromDb(fresh, ctx.template, ctx.SA);
  } });
  if (!exp || !exp.length) { console.log('§W_FSDB_VERDICT INCONCLUSIVE the pipeline produced no tasks for ' + BLD); process.exit(2); }
  check('READER found the active schedule', !!got, got ? 'tasks=' + got.length : 'null');
  if (got) {
    const ge = {}; got.forEach(t => { ge[t.id] = t; });
    const idsSame = exp.length === got.length && exp.every(t => ge[t.id]);
    check('SAME TASK SET (ids)', idsSame, 'owner=' + exp.length + ' reader=' + got.length);
    const bad = k => exp.filter(t => ge[t.id] && ge[t.id][k] !== t[k]).map(t => t.id);
    ['phase', 'storey', 's', 'e'].forEach(k => { const b = bad(k); check('SAME ' + k.toUpperCase() + ' per task', b.length === 0, b.length ? 'wrong=' + b.slice(0, 3).join(',') : ''); });
    const bg = bad('g'); check('SAME ELEMENT SET per task', bg.length === 0, bg.length ? 'wrong=' + bg.slice(0, 3).join(',') : 'Σ guids=' + exp.reduce((a, t) => a + t.g.split(',').length, 0));
    console.log('§W_FSDB_PROGRAMME start=' + foldOut.sch.start + ' last=' + addDays(foldOut.sch.start, Math.max(...foldOut.sch.tasks.map(t => t.eDays))) + ' phaseSeq=' + JSON.stringify(foldOut.sch.phaseSeq));
  }
  check('NO SCHEDULE → null', noneOut === null, 'got=' + JSON.stringify(noneOut));
  const verdict = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  console.log('§W_FSDB_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (BREAK=1 — must be FAIL)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.log('§W_FSDB_ERROR ' + (e && e.stack || e)); process.exit(2); });
