// capex/tests/witness_fold_one_schedule.js — W-FOLD-ONE-SCHEDULE (spec: prompts/CAPEX_DASHBOARD.md §5 R1 + §5.1 R1 BUILD SPEC).
// ISSUE IT PROVES OR DISPROVES: "the Project Order carries a programme the 4D owner never produced" — the fold used to schedule phases
// with its own serial duration loop (HHS: ~19 months) while the 4D owner's programme for the same building ends on day ~53.
// Expected values are INDEPENDENT: read straight from the 4D owner's persisted run (run.json tasks), never from the fold.
// Break switch: BREAK=1 shifts one 4D task by +5 days AFTER the fold ran, so the expected dates move and the dates check must FAIL.
// Run: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_fold_one_schedule.js [building=HHS_Office_Federated]
'use strict';
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..');
const ProjFold = require(path.join(ROOT, 'viewer', 'proj_fold.js'));
const FI = require(path.join(ROOT, 'capex', 'tools', 'fold_inputs.js'));
const BLD = process.argv[2] || 'HHS_Office_Federated';
const START = '2026-11-01', NOW = START + ' 00:00:00';
const BREAK = process.env.BREAK === '1';
let fails = 0, judged = 0, inconclusive = 0;
function check(name, ok, detail) { judged++; if (!ok) fails++; console.log('§W_FOLD1_ASSERT ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : '')); }
function inc(name, why) { inconclusive++; console.log('§W_FOLD1_ASSERT INCONCLUSIVE ' + name + ' ' + why); }
function addDays(s, d) { return new Date(Date.parse(s + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10); }
const q = (db, sql, p) => { const r = db.exec(sql, p || []); return r.length ? r[0].values : []; };

function openErp(SQL) {
  const edb = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db')));
  fs.readFileSync(path.join(ROOT, 'erp', 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(st => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { edb.run(st); } catch (e) {} });
  ['ad_docvalue_overlay.js', 'ad_taxcat_overlay.js'].forEach(f => require(path.join(ROOT, 'erp', f)).ensure(edb));
  return edb;
}

(async () => {
  const SQL = await initSqlJs();
  const dbPath = [path.join(ROOT, 'buildings', BLD + '_extracted.db'), path.join(process.env.HOME, 'bim-ootb', 'buildings', BLD + '_extracted.db')].find(fs.existsSync);
  if (!dbPath) { console.log('§W_FOLD1_VERDICT INCONCLUSIVE no building db for ' + BLD); process.exit(2); }
  const bdb = new SQL.Database(fs.readFileSync(dbPath));
  const building = q(bdb, 'SELECT DISTINCT building FROM elements_meta LIMIT 1')[0][0];
  const sched = FI.schedule4D(BLD, START);
  if (!sched) { console.log('§W_FOLD1_VERDICT INCONCLUSIVE no 4D run at the current code key — run: node scripts/cache_4d_run.js ' + BLD); process.exit(2); }
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'rsmeans2024_us.json'), 'utf8'));
  const sr = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'sequence_rules.json'), 'utf8'));
  const hier = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'ifc_schema_hierarchy.json'), 'utf8'));
  const base = { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, hierarchy: hier.hierarchy || hier, packCurrencyISO: 'USD', now: NOW };

  // ── A: the fold given the 4D owner's programme ──
  const rows = FI.apply5DRates(FI.compute5D(bdb, building, sched), pack.materials || {});
  const edb = openErp(SQL);
  const r = ProjFold.foldProjectOrder(edb, building, rows, Object.assign({ schedule: sched }, base));
  console.log('§W_FOLD1_RUN building=' + building + ' rows=' + rows.length + ' created=' + JSON.stringify(r.created) + ' notes=' + JSON.stringify(r.notes));
  const pid = r.projectId;

  // expected, from the owner's run only
  const T = sched.tasks.map(t => Object.assign({}, t));
  if (BREAK) { T[0].sDays += 5; T[0].eDays += 5; console.log('§W_FOLD1_BREAK shifted ' + T[0].id + ' +5 d in the EXPECTED set'); }
  const expPh = {};
  T.forEach(t => { const p = expPh[t.phase] || (expPh[t.phase] = { s: Infinity, e: -Infinity, n: 0 }); p.s = Math.min(p.s, t.sDays); p.e = Math.max(p.e, t.eDays); p.n++; });
  const got = {}; q(edb, 'SELECT Name, StartDate, EndDate, SeqNo FROM C_ProjectPhase WHERE C_Project_ID=? ORDER BY SeqNo', [pid]).forEach(v => { got[v[0]] = { s: v[1], e: v[2], seq: v[3] }; });
  Object.keys(got).forEach(n => console.log('§W_FOLD1_PHASE ' + n + ' seq=' + got[n].seq + ' ' + String(got[n].s).slice(0, 10) + ' → ' + String(got[n].e).slice(0, 10) +
    (expPh[n] ? '  4D day ' + expPh[n].s + '-' + expPh[n].e + ' = ' + addDays(START, expPh[n].s) + ' → ' + addDays(START, expPh[n].e) : '  (not a 4D phase)')));

  const expNames = Object.keys(expPh).sort(), gotNames = Object.keys(got).sort();
  check('PHASE-SET', expNames.join('|') === gotNames.join('|'), '4D=[' + expNames.join(', ') + '] order=[' + gotNames.join(', ') + ']');
  let dateBad = [];
  expNames.forEach(n => { const g = got[n]; if (!g || String(g.s).slice(0, 10) !== addDays(START, expPh[n].s) || String(g.e).slice(0, 10) !== addDays(START, expPh[n].e)) dateBad.push(n); });
  check('PHASE-DATES == min/max of the 4D tasks', dateBad.length === 0, dateBad.length ? 'wrong=' + dateBad.join(', ') : 'all ' + expNames.length);
  const tSeq = sched.phaseSeq, seqBad = expNames.filter(n => got[n] && tSeq[n] != null && got[n].seq !== tSeq[n]);
  check('PHASE-SEQNO == template sequence', seqBad.length === 0, seqBad.length ? 'wrong=' + seqBad.join(', ') : '');

  const nTasks = q(edb, 'SELECT COUNT(*) FROM C_ProjectTask k JOIN C_ProjectPhase p ON p.C_ProjectPhase_ID=k.C_ProjectPhase_ID WHERE p.C_Project_ID=?', [pid])[0][0];
  const taskNames = q(edb, "SELECT p.Name, k.Name FROM C_ProjectTask k JOIN C_ProjectPhase p ON p.C_ProjectPhase_ID=k.C_ProjectPhase_ID WHERE p.C_Project_ID=?", [pid]);
  const expTaskNames = T.map(t => t.phase + '|' + t.phase + ' — ' + t.storey).sort();
  check('TASKS == the 4D tasks (one per bar, under its phase)', nTasks === T.length && taskNames.map(v => v[0] + '|' + v[1]).sort().join(';') === expTaskNames.join(';'), 'order=' + nTasks + ' 4D=' + T.length);

  // every line's phase/task == the 4D task of its rows' guids (rows carry taskId from the owner's run)
  const g2t = {}; T.forEach(t => t.guids.forEach(g => { g2t[g] = t; }));
  const lines = q(edb, "SELECT l.c_projectline_id, p.Name, k.Name, pr.Value, l.plannedqty FROM C_ProjectLine l JOIN C_ProjectPhase p ON p.C_ProjectPhase_ID=l.c_projectphase_id LEFT JOIN C_ProjectTask k ON k.C_ProjectTask_ID=l.c_projecttask_id JOIN M_Product pr ON pr.M_Product_ID=l.m_product_id WHERE l.c_project_id=?", [pid]);
  const lineKeys = {}; lines.forEach(v => { lineKeys[v[3] + '#' + v[2]] = v[1]; });
  let lineBad = 0, lineChecked = 0;
  rows.forEach(row => {
    const t = g2t[row.guids[0]]; if (!t) return;
    const key = (row.cls === 'IfcBuildingElementProxy' && row.disc && row.disc.charAt(0) !== '_' ? row.cls + ':' + row.disc : row.cls) + '#' + t.phase + ' — ' + t.storey;
    lineChecked++; if (lineKeys[key] !== t.phase) lineBad++;
  });
  check('LINE-PHASE == the 4D phase of its elements', lineChecked > 0 && lineBad === 0, 'rows checked=' + lineChecked + ' wrong=' + lineBad + ' lines=' + lines.length);
  check('NO_4D_SCHEDULE absent when a programme was given', !(r.notes || []).some(n => n.indexOf('NO_4D_SCHEDULE') === 0));

  // elements + quantity conserved (money is untouched by scheduling: same elements, same per-element qty)
  const nEl = rows.reduce((a, x) => a + x.count, 0), nAll = q(bdb, "SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0")[0][0];
  const lineCnt = q(edb, "SELECT COUNT(*) FROM C_ProjectLine WHERE c_project_id=?", [pid])[0][0];
  check('ELEMENTS CONSERVED', nEl === nAll, 'rows=' + nEl + ' db=' + nAll);
  console.log('§W_FOLD1_MONEY plannedAmt=' + r.plannedAmt + ' lines=' + lineCnt + ' programme=' + addDays(START, Math.min.apply(null, T.map(t => t.sDays))) + ' → ' + addDays(START, Math.max.apply(null, T.map(t => t.eDays))));

  // ── B: negative — no programme → no dates + NO_4D_SCHEDULE ──
  const edb2 = openErp(SQL);
  const rows2 = FI.apply5DRates(FI.compute5D(bdb, building, null), pack.materials || {});
  const r2 = ProjFold.foldProjectOrder(edb2, building, rows2, base);
  const dated = q(edb2, 'SELECT COUNT(*) FROM C_ProjectPhase WHERE C_Project_ID=? AND (StartDate IS NOT NULL OR EndDate IS NOT NULL)', [r2.projectId])[0][0];
  const nPh2 = q(edb2, 'SELECT COUNT(*) FROM C_ProjectPhase WHERE C_Project_ID=?', [r2.projectId])[0][0];
  check('NO SCHEDULE → 0 dated phases', nPh2 > 0 && dated === 0, 'phases=' + nPh2 + ' dated=' + dated);
  check('NO SCHEDULE → note NO_4D_SCHEDULE', (r2.notes || []).some(n => n.indexOf('NO_4D_SCHEDULE') === 0), JSON.stringify(r2.notes));
  // money: same elements and per-element quantities; only the 3-dp PlannedQty rounding is per line (legacy MProjectLine rule), so the two
  // totals may differ by at most Σ over lines of rate × 0.0005 — the bound is computed, a bigger gap means quantity was lost or doubled
  const lineRates = db => q(db, 'SELECT plannedprice FROM C_ProjectLine WHERE c_project_id=?', [db === edb ? pid : r2.projectId]).map(v => Number(v[0]) || 0);
  const bound = lineRates(edb).concat(lineRates(edb2)).reduce((a, x) => a + x * 0.0005, 0);
  const delta = Math.abs(Number(r.plannedAmt) - Number(r2.plannedAmt));
  check('MONEY with vs without a programme (only per-line 3-dp rounding may differ)', delta <= bound + 1e-9, 'with=' + r.plannedAmt + ' without=' + r2.plannedAmt + ' |Δ|=' + delta.toFixed(5) + ' bound=' + bound.toFixed(5));

  // ── idempotent: fold A again → +0 ──
  const r3 = ProjFold.foldProjectOrder(edb, building, rows, Object.assign({ schedule: sched }, base));
  const plus = r3.created.phases + r3.created.tasks + r3.created.lines + r3.created.products;
  check('IDEMPOTENT 2nd fold', plus === 0, JSON.stringify(r3.created));

  const verdict = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  console.log('§W_FOLD1_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconclusive + (BREAK ? ' (BREAK=1 — must be FAIL)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.error('§W_FOLD1_ERROR ' + (e && e.stack || e)); process.exit(2); });
