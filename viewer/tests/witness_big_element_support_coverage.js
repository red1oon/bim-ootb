#!/usr/bin/env node
// witness_big_element_support_coverage.js — §BIG_SUPPORT_COVERAGE (2026-08-11, bim-compiler
// prompts/4D_SCHEDULE_PERFECTION.md §SPEC 2026-08-11, item 1d).
//
// ISSUE this witness proves/disproves: the "big element without support" bug class the user asked
// about directly — an element above the measured p95 bbox volume (ScheduleGate.BIG_ELEMENT_VOL =
// 1.556 m³, extracted across 135,630 real elements / 5 shipped buildings, 2026-08-11) can schedule
// with LITERALLY NO support check applied: auditFloating's zero-candidate blind spot (`se===0`
// silently passed before 1a). The existing floating counters are the WRONG metric for this (user
// ruled them out — the 8-element floating tail is isolated-outlier noise); this witness targets the
// coverage seam itself: for every big element in each shipped building, it must have ≥1 recorded
// support candidate OR be Substructure-exempt (1c: seq===1 ⟺ phase==='Substructure' —
// IfcFooting/IfcReinforcingBar only, verified 1:1 in rates/sequence_rules.json) — every remaining
// exception is COUNTED and LOCKED as a measured baseline below, split by the Gap-B annotation
// buildingModelsSubstructure (annotate-don't-suppress: Terminal/HHS model NO foundation layer at
// all, so their findings carry that context instead of being hidden or treated as equally alarming).
//
// Element build is the real shipped code (sliced, never reimplemented — repo convention,
// witness_gantt_lock_integrity.js / witness_tm_geo_order_cycles.js): time_machine.js
// _promoteRoofLoadPath + _buildXrayElements fed through the canonical, unmodified-at-runtime
// ScheduleGate.computeSchedule()/auditFloating() from viewer/schedule_gate.js, against the real
// shipped buildings/*_extracted.db fixtures.
//
// Approximation caveat (same as witness_tm_geo_order_cycles.js): the x-ray build carries no
// resource/installSecs — filled resource=cls, installSecs=120. Crew/duration behaviour only; the
// candidate-coverage result is STRUCTURAL (support-pool topology from geometry+seq), unaffected.
//
// Command: BLD_DIR=~/bim-ootb/buildings node tests/witness_big_element_support_coverage.js (from viewer/)
// Read the §BIG_SUPPORT_COVERAGE log lines, not exit code alone.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');

// The 5 shipped buildings the 1.556 m³ p95 was measured on, with the EXTRACTED (not assumed)
// buildingModelsSubstructure facts from the 2026-08-11 Q2 extraction: Terminal and HHS model ZERO
// Substructure-phase elements (no IfcFooting, nothing else matches) — expected and correct, not a
// bug. EXPECTED unchecked = measured baseline from this witness's own first logged run (repo
// convention, cf. witness_tm_geo_order_cycles.js floating=8): if it moves EITHER way that is a real
// behavior change to examine, never to absorb silently. null = measure-only (pre-baseline).
const BUILDINGS = [
  // Baselines MEASURED 2026-08-11 (this witness's own first logged run, bigsup_measure.log):
  //   Terminal big=1333 unchecked=279 (IfcSlab:236,IfcBeam:22,...)      floating=8 (the known tail)
  //   Hospital big=4314 unchecked=503 (IfcDuctSegment:139,IfcPlate:83,…) floating=0
  //   Duplex   big=49   unchecked=6   (IfcSlab:4,IfcWallStandardCase:2)  floating=0
  //   HHS      big=239  unchecked=21  (IfcFlowSegment:11,IfcSlab:5,…)    floating=0
  //   Clinic   big=442  unchecked=22  (IfcWallStandardCase:10,…)         floating=1
  { file: 'Terminal_extracted.db',             name: 'Terminal', bms: false, expectedUnchecked: 279 },
  { file: 'Hospital_extracted.db',             name: 'Hospital', bms: true,  expectedUnchecked: 503 },
  { file: 'Duplex_extracted.db',               name: 'Duplex',   bms: true,  expectedUnchecked: 6 },
  { file: 'HHS_Office_Federated_extracted.db', name: 'HHS',      bms: false, expectedUnchecked: 21 },
  { file: 'Clinic_extracted.db',               name: 'Clinic',   bms: true,  expectedUnchecked: 22 },
];

(async () => {
  assert(ScheduleGate.BIG_ELEMENT_VOL === 1.556,
    'W-BIGSUP-0 ScheduleGate exports the measured p95 threshold (BIG_ELEMENT_VOL=' + ScheduleGate.BIG_ELEMENT_VOL + ', single source of truth)');
  const BIG = ScheduleGate.BIG_ELEMENT_VOL;

  const names = ['_buildXrayElements'];
  if (tmSrc.indexOf('function _promoteRoofLoadPath(') >= 0) names.unshift('_promoteRoofLoadPath');
  let sliced;
  try { sliced = names.map(n => sliceFn(tmSrc, n)).join('\n'); }
  catch (e) { assert(false, 'W-BIGSUP-SLICE failed: ' + e.message); finish(); return; }

  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));

  let totBig = 0, totUnchecked = 0;
  for (const B of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, B.file);
    if (!fs.existsSync(dbPath)) { console.log('§BIGSUP_SKIP ' + B.name + ' fixture missing at ' + dbPath); continue; }
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const sandbox = {
      console: console,
      performance: { now: () => Date.now() },
      window: { SEQUENCE_RULES: rulesJson.SEQUENCE_RULES, SEQUENCE_DEFAULT: rulesJson.SEQUENCE_DEFAULT, SEQUENCE_NAME_OVERRIDES: rulesJson.SEQUENCE_NAME_OVERRIDES || [] },
      A: function () { return { db: db }; },
    };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements;', sandbox);
    const els = sandbox.__bxe();
    db.close();
    assert(els && els.length > 0, 'W-BIGSUP-' + B.name + '-1 real geometry via the shipped element build (n=' + (els ? els.length : 0) + ')');
    if (!els || !els.length) continue;

    // Same degenerate-geometry filter as the sibling witnesses (no-transform rows collapse to a
    // zero-size bbox at origin and would poison the support grids).
    const geoEls = els.filter(e => !(e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z));
    geoEls.forEach(e => { e.resource = e.cls; e.installSecs = 120; });

    // Gap-B fact check: buildingModelsSubstructure per the same seq===1 test auditFloating applies.
    const bms = geoEls.some(e => e.seq === 1);
    assert(bms === B.bms, 'W-BIGSUP-' + B.name + '-2 buildingModelsSubstructure=' + bms +
      ' matches the 2026-08-11 Q2 extraction (expected ' + B.bms + (B.bms ? '' : ' — no foundation layer modeled, expected and correct') + ')');

    const bigEls = geoEls.filter(e => e.seq !== 1 && (e.x1 - e.x0) * (e.y1 - e.y0) * (e.top_z - e.base_z) > BIG);
    const seqByGuid = {};
    geoEls.forEach(e => { seqByGuid[e.guid] = e.seq; });

    // Count the §SUPPORT_UNCHECKED emissions too — the log line IS the shipped observability (1a);
    // collector and emission must agree or the warn path is broken.
    const captured = [];
    const origLog = console.log;
    console.log = function () { captured.push(Array.prototype.map.call(arguments, String).join(' ')); return origLog.apply(console, arguments); };
    let sched, floating;
    const unchecked = [];
    try {
      sched = ScheduleGate.computeSchedule(geoEls, 0, 1);
      floating = ScheduleGate.auditFloating(geoEls, sched, null, null, unchecked);
    } finally { console.log = origLog; }
    const emitted = captured.filter(l => l.indexOf('§SUPPORT_UNCHECKED ') === 0).length;

    assert(emitted === unchecked.length, 'W-BIGSUP-' + B.name + '-3 every finding is EMITTED as a §SUPPORT_UNCHECKED log line (emitted=' + emitted + ' collected=' + unchecked.length + ')');
    const wellFormed = unchecked.every(u => u.guid && u.cls && u.vol > BIG && seqByGuid[u.guid] !== 1 && u.buildingModelsSubstructure === bms);
    assert(wellFormed, 'W-BIGSUP-' + B.name + '-4 findings well-formed: vol>' + BIG + 'm³, Substructure(seq===1) exempt honored, Gap-B annotation matches building (n=' + unchecked.length + ')');

    // THE 1d claim: every big element has ≥1 recorded support candidate OR is Substructure-exempt.
    // unchecked = the exceptions, locked at the measured baseline (see BUILDINGS table).
    const covered = bigEls.length - unchecked.length;
    if (B.expectedUnchecked === null) {
      console.log('  MEASURE ' + B.name + ' unchecked=' + unchecked.length + ' (no baseline yet — bake this number into BUILDINGS)');
    } else {
      assert(unchecked.length === B.expectedUnchecked, 'W-BIGSUP-' + B.name + '-5 big-element support coverage: unchecked=' +
        unchecked.length + '/' + bigEls.length + ' (measured baseline ' + B.expectedUnchecked + ' — a move EITHER way is a real behavior change)');
    }

    const byCls = {};
    unchecked.forEach(u => { byCls[u.cls] = (byCls[u.cls] || 0) + 1; });
    console.log('§BIG_SUPPORT_COVERAGE bld=' + B.name + ' big=' + bigEls.length + ' unchecked=' + unchecked.length +
      ' covered=' + covered + ' buildingModelsSubstructure=' + bms + ' floating=' + floating + ' n=' + geoEls.length + '/' + els.length);
    if (unchecked.length) console.log('§BIG_SUPPORT_UNCHECKED_CLASSES bld=' + B.name + ' ' +
      Object.keys(byCls).sort((a, b) => byCls[b] - byCls[a]).map(k => k + ':' + byCls[k]).join(','));
    totBig += bigEls.length; totUnchecked += unchecked.length;
  }

  console.log('§BIG_SUPPORT_COVERAGE_TOTAL big=' + totBig + ' unchecked=' + totUnchecked +
    ' (threshold ' + BIG + 'm³ = measured p95; warn-only per §SPEC 2026-08-11 1a — gate-vs-warn decided on these real counts, not guessed)');
  finish();
})();

function finish() {
  console.log('§BIG_SUPPORT_COVERAGE_SUMMARY pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exit(1); }
  console.log('PASS — every big element (>p95 bbox vol) either has a recorded support candidate, is Substructure-exempt, or is a NAMED+COUNTED §SUPPORT_UNCHECKED finding annotated with buildingModelsSubstructure');
}
