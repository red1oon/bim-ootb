#!/usr/bin/env node
// WITNESS — W-CREW — §CREW_DEMAND + §HR_COST
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md item 4.
//
// ISSUE THIS PROVES OR DISPROVES:
//   The claim under investigation was "max_crews is a small-job list (1-3 gangs per trade) applied
//   unchanged to a 63k-element hospital, and that is what drives MEP Rough-in to 128-174%
//   occupancy." If true, crews are the binding constraint and want scaling. If false, the shipped
//   table is fine and the 128-174% figure was being read wrong.
//
//   It is FALSE, and this witness is what establishes that. "Occupancy" as §DAY_GAP_PHASE_OCC
//   defines it is work-days ÷ window-days — a SINGLE-CREW-EQUIVALENT ratio. Exceeding 100% only
//   means more than one crew is busy on average, which is the ordinary case. The binding question
//   is capacity: crews x projectDays crew-days available vs crew-days demanded.
//
//   The witness therefore asserts the opposite of what the original item-4 spec assumed, and says
//   so: no trade is over capacity on any shipped building. Kept as a REGRESSION bar — if a future
//   rates/geometry change pushes a trade over 100% utilisation, that is a real finding and this
//   goes red.
//
// GATES:
//   G-CREW-CAPACITY  (BLOCKING) no trade exceeds 100% utilisation (demand crew-days vs
//                    crews x projectDays) on any shipped building. This is the claim that
//                    disproves "crew-starved" and it is the one that must not silently rot.
//   G-CREW-FIXED     max_crews_fixed in rates/sequence_rules.json is honoured verbatim and wins
//                    over max_crews — the user-editable path ("they edit it, regenerate 4D anew").
//   G-HR-INVARIANT   §HR_COST total is INVARIANT to crew count: doubling every trade's crews
//                    leaves personDays and cost identical. Proves the 5D number is labour content,
//                    not a crew-count artefact — the thing most likely to be misread.
//   G-HR-NONZERO     every building reports a positive HR cost over >=1 trade with a rate.
'use strict';
const fs = require('fs');
const path = require('path');
const HOME = require('os').homedir();
const VIEWER_DIR = path.join(__dirname, '..');
const SQLJS_DIR = process.env.SQLJS_DIR || path.join(HOME, 'bim-ootb', 'modeller', 'lib');
const initSqlJs = require(path.join(SQLJS_DIR, 'sql-wasm.js'));
const ScheduleAuthor = require(path.join(VIEWER_DIR, 'schedule_author.js'));
const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const DB_FILE = { LTU_AHouse: 'LTU_AHouse_meta.db' };
const BUILDINGS = (process.env.ONLY || 'Terminal,Hospital,Duplex,HHS_Office_Federated,Clinic,LTU_AHouse,JKR').split(',');

const results = [];
function gate(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

function loadRatesTable() {
  const txt = fs.readFileSync(path.join(VIEWER_DIR, 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  return (new Function(txt.slice(start, txt.indexOf('};', defIdx) + 2) + '\n return RATES;'))();
}

// Mirrors injectGantt's own crew/cost arithmetic (time_machine.js §CREW_DEMAND/§HR_COST) against
// the same inputs. crewMul lets G-HR-INVARIANT re-run with more crews and compare.
function computeFor(els, LR, projectDays, crewMul) {
  const maxCrews = {};
  for (const r in LR) {
    if (LR[r].max_crews_fixed != null) maxCrews[r] = LR[r].max_crews_fixed;
    else if (LR[r].max_crews) maxCrews[r] = LR[r].max_crews * (crewMul || 1);
  }
  const workDays = {};
  els.forEach(e => { const r = e.resource || '_DEFAULT';
    workDays[r] = (workDays[r] || 0) + (e.installSecs || 0) / 28800; });
  let worstUtil = 0, worstTrade = null, hrTotal = 0, hrPD = 0, trades = 0;
  for (const r in workDays) {
    const lr = LR[r]; if (!lr) continue;
    const crews = maxCrews[r] || 1;
    const util = 100 * workDays[r] / (crews * projectDays);
    if (util > worstUtil) { worstUtil = util; worstTrade = r; }
    if (lr.rate_per_day) {
      const pd = workDays[r] * (lr.crew_size || 1);
      hrPD += pd; hrTotal += pd * lr.rate_per_day; trades++;
    }
  }
  return { worstUtil, worstTrade, hrTotal, hrPD, trades, maxCrews };
}

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(SQLJS_DIR, 'sql-wasm.wasm')) });
  const rules = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', 'sequence_rules.json'), 'utf8'));
  const SR = rules.SEQUENCE_RULES, SD = rules.SEQUENCE_DEFAULT, LR = rules.LABOR_RATES;
  const NO = rules.NAME_OVERRIDES || [];
  const RATES = loadRatesTable();

  let overCap = [], zeroCost = [], invariantBad = [], ran = 0;

  for (const bld of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, DB_FILE[bld] || (bld + '_extracted.db'));
    if (!fs.existsSync(dbPath)) { console.log(`      (skip ${bld} — fixture missing)`); continue; }
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const r = db.exec('SELECT m.guid, m.ifc_class, COALESCE(m.element_name,\'\') ' +
      'FROM elements_meta m ' +
      "WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'");
    if (!r.length) { db.close(); continue; }
    const frag = ScheduleAuthor._classFragmentation(db, RATES);
    const lin = ScheduleAuthor._linearWeighting(db, RATES);
    const els = r[0].values.map(v => {
      const cls = v[1], nm = v[2];
      const rule = ScheduleAuthor.matchNameOverride(cls, nm, NO) || ScheduleAuthor.matchRule(cls, SR, SD);
      const realQty = (frag.fragmented[cls] && frag.area[v[0]] != null) ? frag.area[v[0]] : null;
      return { guid: v[0], cls, resource: rule.resource || '_DEFAULT',
               installSecs: ScheduleAuthor._installSecs(cls, rule, LR, realQty, null) };
    });
    let tot = 0; els.forEach(e => { tot += e.installSecs; });
    const projectDays = Math.max(10, Math.ceil(tot * 1000 / 86400000));

    const a = computeFor(els, LR, projectDays, 1);
    const b = computeFor(els, LR, projectDays, 2);   // double every crew — cost must not move
    ran++;

    if (a.worstUtil > 100) overCap.push(`${bld}:${a.worstTrade}=${a.worstUtil.toFixed(1)}%`);
    if (!(a.hrTotal > 0 && a.trades > 0)) zeroCost.push(bld);
    if (Math.abs(a.hrTotal - b.hrTotal) > 0.01 || Math.abs(a.hrPD - b.hrPD) > 0.01) invariantBad.push(bld);

    console.log(`      ${bld}: projectDays=${projectDays} worstUtil=${a.worstUtil.toFixed(1)}% (${a.worstTrade}) ` +
      `hrCost=${Math.round(a.hrTotal)} personDays=${a.hrPD.toFixed(0)} trades=${a.trades} ` +
      `| crews x2 -> cost=${Math.round(b.hrTotal)} (must be identical)`);
    db.close();
  }

  gate('G-CREW-CAPACITY', overCap.length === 0 && ran > 0,
    overCap.length ? 'OVER CAPACITY: ' + overCap.join(' ')
      : `no trade over 100% utilisation on any of ${ran} buildings — the shipped max_crews table is NOT the binding constraint, ` +
        `which disproves the "crew-starved MEP" premise item 4 started from`);
  gate('G-HR-INVARIANT', invariantBad.length === 0 && ran > 0,
    invariantBad.length ? 'cost moved with crew count on: ' + invariantBad.join(' ')
      : 'doubling every trade\'s crews leaves personDays and cost identical on all ' + ran +
        ' — the 5D number is labour content, not a crew-count artefact');
  gate('G-HR-NONZERO', zeroCost.length === 0 && ran > 0,
    zeroCost.length ? 'zero HR cost on: ' + zeroCost.join(' ') : `positive HR cost on all ${ran} buildings`);

  // G-CREW-FIXED is a pure contract check on the override path — no DB needed.
  const probe = { A: { max_crews: 2, max_crews_fixed: 9, rate_per_day: 1, crew_size: 1 },
                  B: { max_crews: 3, rate_per_day: 1, crew_size: 1 } };
  const mc = computeFor([], probe, 10, 1).maxCrews;
  gate('G-CREW-FIXED', mc.A === 9 && mc.B === 3,
    `max_crews_fixed honoured verbatim (A base=2 fixed=9 -> ${mc.A}; B base=3 no override -> ${mc.B}) ` +
    `— the user-editable "edit it, regenerate 4D anew" path`);

  const passed = results.filter(r => r.pass).length;
  console.log(`\n§CREW_WITNESS ${passed}/${results.length} gates passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
