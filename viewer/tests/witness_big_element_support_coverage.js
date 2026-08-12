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
// IfcFooting/IfcPile/IfcReinforcingBar class rules + the 'foundation_pile_misclassified_slab' and
// 'slab_on_grade_substructure' name-overrides, verified 1:1 in rates/sequence_rules.json) — every remaining
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
// buildingModelsSubstructure facts. 2026-08-11 Q2 extraction said Terminal and HHS model ZERO
// Substructure-phase elements — for HHS that stands; for Terminal it was an artifact of the class
// lookup: its 236 'jkrST_str-fo_pc_rcp' 30m precast PILES were authored as IfcSlab, now reclassed
// seq 1 by the 'foundation_pile_misclassified_slab' name-override (rates.js — big-element
// follow-up, same day), so Terminal is bms=true. EXPECTED unchecked = measured baseline from this
// witness's own logged runs (repo convention, cf. witness_tm_geo_order_cycles.js floating=8): if
// it moves EITHER way that is a real behavior change to examine, never to absorb silently.
const BUILDINGS = [
  // Baselines RE-MEASURED 2026-08-11 (big-element follow-up, bigsup_after_fix2.log) after three
  // deliberate changes, each with its own delta reasoned below (first-run baselines in parens):
  //  (1) §HANG_NEAREST fallback (schedule_gate.js) — big pure-sink hangers (rod-suspended MEP etc.)
  //      now find their real carrier above: Terminal −11 (8 IfcDuctSegment+3 IfcDuctFitting),
  //      Hospital −264 (139 IfcDuctSegment, 60 IfcDuctFitting, …), HHS −10, Clinic −6.
  //  (2) pile name-override — Terminal −236 IfcSlab (piles, now seq-1 exempt; big pop 1333→1097).
  //  (3) harness key fix (SEQUENCE_NAME_OVERRIDES was read from a key the JSON never had — these
  //      witnesses silently ran with NAME OVERRIDES OFF while the live viewer always ran with
  //      rates.js's in-file copy ON; now live-parity): curtainwall glazing/mullions (IfcPlate/
  //      IfcMember→seq 7 sinks) re-mix Hospital/HHS/Clinic counts — Hospital's 83 unchecked
  //      IfcPlate resolve via (1), Clinic gains 5 IfcWallStandardCase/IfcMember (net 0).
  //   Terminal big=1097 unchecked=32  (IfcBeam:22,IfcColumn:7,IfcWall:3)  floating=8 (known tail, HELD)
  //   Hospital big=4314 unchecked=177 (IfcBeam:56,IfcWallStandardCase:45,…) floating=0 (HELD)
  //   Duplex   big=49   unchecked=6   (IfcSlab:4,IfcWallStandardCase:2)     floating=0 (HELD)
  //   HHS      big=239  unchecked=13  (IfcSlab:5,IfcFlowSegment:3,…)        floating=0 (HELD)
  //   Clinic   big=442  unchecked=22  (IfcWallStandardCase:15,IfcMember:3,…) floating=1 (HELD)
  // RE-MEASURED 2026-08-11 (closure pass, bigsup_after_fix.log) after the
  // 'slab_on_grade_substructure' name-override (rates.js/sequence_rules.json — slab-on-grade is
  // the 1c spec's own named ground-bearing class, pattern measured to exactly Duplex 4 + Clinic 4
  // IfcSlab across every shipped DB, zero elsewhere): Duplex unchecked 6→2 / big 49→45 (its 4 SoG
  // slabs — forensically ground-bearing, footing tops ~1.1m below over fill — now seq-1 exempt),
  // Clinic big 442→440 (its SoG slabs already had bearing candidates; 2 were big; unchecked 22
  // HELD), Terminal/Hospital/HHS byte-identical, per-building floating HELD (8/0/0/0/1). The
  // IfcPile SEQUENCE_RULES entry added the same pass (Gap A close) changed nothing anywhere —
  // latent by construction (no shipped building models the class; Terminal's real piles arrive
  // via the IfcSlab name-override). TOTAL 250→246.
  { file: 'Terminal_extracted.db',             name: 'Terminal', bms: true,  expectedUnchecked: 32 },   // was bms:false/279
  { file: 'Hospital_extracted.db',             name: 'Hospital', bms: true,  expectedUnchecked: 177 },  // was 503
  { file: 'Duplex_extracted.db',               name: 'Duplex',   bms: true,  expectedUnchecked: 2 },    // was 6 — SoG override, see above
  { file: 'HHS_Office_Federated_extracted.db', name: 'HHS',      bms: false, expectedUnchecked: 13 },   // was 21
  { file: 'Clinic_extracted.db',               name: 'Clinic',   bms: true,  expectedUnchecked: 22 },   // count HELD, mix changed (see 3)
  // Coverage extended 2026-08-11 (chase-to-zero pass) — first witness coverage for these two; the
  // 5-building locked set above is UNTOUCHED (its 246 total stands; these rows are additive).
  // LTU_AHouse: the LIVE-SERVED vintage (_meta.db — streaming.js §6.9 serves the split pair to real
  // users when present; which vintage is canonical remains the user's open decision, this witness
  // just tests what users get). Measured 2026-08-11 (probe_ltu.log): unchecked=611 on the live
  // vintage (old _extracted read 70 unchecked but 2839 floating — the Aug-10 re-extraction traded
  // ~2500 wrong-order floats for honestly-unverifiable warns), floating=334 (ALL 334 are support-
  // pool members in mutual/co-planar bearing shapes — §SUPPORT_CYCLE cycle-fallback tail, the
  // documented warn-only class; §DEQ_REPAIR only repairs seq>4 by design since pushing a pool
  // member in a mutual pair never converges — measured Clinic 43k pushes/400 sweeps).
  // JKR: bms=false (zero seq-1 elements — its foundation slabs are authored plain IfcSlab at the
  // z≈84m site datum), unchecked=6, floating=81 (same steel co-planar family: CHS members/columns).
  { file: 'LTU_AHouse_meta.db',                name: 'LTU_AHouse', bms: true,  expectedUnchecked: 611 },
  { file: 'JKR_extracted.db',                  name: 'JKR',        bms: false, expectedUnchecked: 6 },
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
      window: { SEQUENCE_RULES: rulesJson.SEQUENCE_RULES, SEQUENCE_DEFAULT: rulesJson.SEQUENCE_DEFAULT, SEQUENCE_NAME_OVERRIDES: rulesJson.SEQUENCE_NAME_OVERRIDES || rulesJson.NAME_OVERRIDES || [] },
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
      ' matches the EXTRACTED per-building fact (expected ' + B.bms + (B.bms ? '' : ' — no foundation layer modeled, expected and correct') + ')');

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
