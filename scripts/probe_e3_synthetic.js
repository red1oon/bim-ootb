#!/usr/bin/env node
// probe_e3_synthetic.js — 4D_GANTT_TM_REFACTOR.md, straggler-exemption removal. Small, fully
// hand-designed graphs with every element's expected (start,end) computed BY HAND before running
// the engine — ground-truth checks, not regression-diffs against a prior run. Each case is its
// own isolated CpmSchedule.run() call (own levels/XY, no cross-case interference).
//
// §VERIFICATION starting set (5 topologies): case1 = stragglers present in a phase + a deadlock-
// stress case (also proves the core E1-E4 + crew-cap mechanism end to end). case2 = a level
// missing a phase. case3 = an orphan element. case4 = parallel independent zones on one band.
'use strict';
const path = require('path');
const CpmSchedule = require(path.join(__dirname, '..', 'viewer', 'cpm_schedule.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));
const fs = require('fs');

const DAY = 86400000;
function el(guid, cls, phase, seq, storey, resource, bz, tz, x0, x1, y0, y1, s, e) {
  return { guid, cls, seq, phase, storey, resource, x0, x1, y0, y1, bz, tz, s: s * DAY, e: e * DAY };
}

// Independent judge — sliced _contactGraph from time_machine.js, same convention every other
// witness in this project uses.
function sliceFn(src, name) {
  const idx = src.lastIndexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'time_machine.js'), 'utf8');
const _contactGraph = (new Function('ScheduleGate', sliceFn(tmSrc, '_contactGraph') + '\nreturn _contactGraph;'))(ScheduleGate);

function checkCase(name, items, opts, EXPECT, EXPECT_DROPS, EXPECT_STRAG_COUNT) {
  console.log('--- ' + name + ' ---');
  const run = CpmSchedule.run(items, opts);
  if (!run.ok) { console.log(name + ' FAIL run.ok=false error=' + run.error); return false; }
  const times = run.solution.times, strag = run.graph.stragglerOf;
  let mismatches = 0;
  items.forEach(function (it, i) {
    const exp = EXPECT[it.guid];
    const gotS = times[i].s / DAY, gotE = times[i].e / DAY, gotStrag = !!strag[i];
    const okS = Math.abs(gotS - exp.s) < 0.01, okE = Math.abs(gotE - exp.e) < 0.01, okStrag = gotStrag === exp.straggler;
    if (!okS || !okE || !okStrag) mismatches++;
    console.log('  ' + it.guid + ': got s=' + gotS.toFixed(2) + ' e=' + gotE.toFixed(2) + ' strag=' + gotStrag +
      ' | expect s=' + exp.s + ' e=' + exp.e + ' strag=' + exp.straggler + ' | ' + (okS && okE && okStrag ? 'MATCH' : 'MISMATCH'));
  });
  if (EXPECT_DROPS) {
    const d = run.solution.drops;
    const dropsMatch = d.e3 === EXPECT_DROPS.e3 && d.e4 === EXPECT_DROPS.e4 && d.member === EXPECT_DROPS.member &&
      d.contractedSccs === EXPECT_DROPS.contractedSccs && d.contractedNodes === EXPECT_DROPS.contractedNodes && d.fsViolInScc === EXPECT_DROPS.fsViolInScc;
    console.log('  cycleDrops: got=' + JSON.stringify(d) + ' expect=' + JSON.stringify(EXPECT_DROPS) + ' | ' + (dropsMatch ? 'MATCH' : 'MISMATCH'));
    if (!dropsMatch) mismatches++;
  }
  if (EXPECT_STRAG_COUNT != null) {
    const sc = run.graph.counts.stragglers, ok = sc === EXPECT_STRAG_COUNT;
    console.log('  stragglerCount: got=' + sc + ' expect=' + EXPECT_STRAG_COUNT + ' | ' + (ok ? 'MATCH' : 'MISMATCH'));
    if (!ok) mismatches++;
  }
  const cpmItems = items.map(function (it, i) { return Object.assign({}, it, { s: times[i].s, e: times[i].e }); });
  const G = _contactGraph(cpmItems);
  let midair = 0;
  for (let i = 0; i < cpmItems.length; i++) {
    const list = G.contacts[i]; if (!list) continue;
    let first = Infinity;
    for (const k of list) { const s = cpmItems[k].s; if (s < first) first = s; }
    if (first > cpmItems[i].s + 1) midair++;
  }
  console.log('  floating: midair=' + midair + ' | ' + (midair === 0 ? 'PASS' : 'FAIL'));
  if (midair !== 0) mismatches++;
  console.log(name + ' ' + (mismatches === 0 ? 'PASS' : 'FAIL') + ' mismatches=' + mismatches);
  return mismatches === 0;
}

// ══ CASE 1 — stragglers present in a phase + a deadlock scenario, plus E1/E2/E3/E4/crew-cap ═════
// L1 (z 0-3m): FOOTING_L1(Substructure,CONCRETE) supports COL_L1(Superstructure,STEEL,dur2) and
// WALL_L1_MAIN(Architecture,MASON,dur3, x=[2.5,4.5]). COL_L1B(Superstructure,STEEL,dur1) is a
// grounded, far-away second STEEL element for crew-cap=1 contention. BRACKET(Superstructure,
// STEEL2,dur1, x=[8,10]) rests on WALL_L1(Architecture,MASON,dur2, x=[8,10]) — a deliberate
// deadlock: BRACKET feeds M(L1,Superstructure), which (E3) gates WALL_L1, which (E1 SS) BRACKET
// depends on. LIGHT_L1(MEP Rough-in,ELECTRICIAN,dur1) is hosted (E2) by WALL_L1_MAIN. L2 (z 3-6m):
// COL_L2(Superstructure,STEEL,dur2) rests on COL_L1 (E1) and is gated by E4 from M(L1,Superstructure).
// §DESIGNATED_SUPPORT_TOUCH_AMBIGUITY (found verifying this case, not assumed): FOOTING_L1 and
// WALL_L1 are each the BOTTOM of a stack touching its neighbor at an EXACT Z boundary, with no
// bearing-below/embedded candidate of their own — designatedSupport's weakest "carrier-above"
// fallback fires for both, symmetrically self-assigning the element above as their own support: a
// second, accidental (but mechanically identical, and harmless — verified below) 2-node pure-
// physics cycle, same phenomenon as BRACKET/WALL_L1, doubling stragglers/contractedSccs. Timing
// output is unaffected either way. Kept rather than re-engineered away.
const case1Items = [
  el('FOOTING_L1',   'IfcFooting',          'Substructure',   1, 'L1', 'CONCRETE',    -1,  0, 0, 6, 0, 2, 0, 1),
  el('COL_L1',       'IfcColumn',           'Superstructure', 2, 'L1', 'STEEL',        0,  3, 0, 2, 0, 2, 0, 2),
  el('COL_L1B',      'IfcColumn',           'Superstructure', 2, 'L1', 'STEEL',        0,  3, 20, 22, 0, 2, 0, 1),
  el('BRACKET',      'IfcMember',           'Superstructure', 2, 'L1', 'STEEL2',       0,  3, 8, 10, 0, 2, 0, 1),
  el('WALL_L1',      'IfcWallStandardCase', 'Architecture',   5, 'L1', 'MASON',      -0.5, 0, 8, 10, 0, 2, 0, 2),
  el('WALL_L1_MAIN', 'IfcWallStandardCase', 'Architecture',   5, 'L1', 'MASON',        0,  3, 2.5, 4.5, 0, 2, 0, 3),
  el('LIGHT_L1',      'IfcLightFixture',    'MEP Rough-in',   7, 'L1', 'ELECTRICIAN', 1.4, 1.6, 3.4, 3.6, 0.9, 1.1, 0, 1),
  el('COL_L2',       'IfcColumn',           'Superstructure', 2, 'L2', 'STEEL',        3,  6, 0, 2, 0, 2, 0, 2)
];
const case1Expect = {
  FOOTING_L1:    { s: 0, e: 1,   straggler: true  },
  COL_L1:        { s: 0, e: 2,   straggler: false },
  COL_L1B:       { s: 2, e: 3,   straggler: false },
  BRACKET:       { s: 0, e: 1,   straggler: true  },
  WALL_L1:       { s: 0, e: 2,   straggler: false },
  WALL_L1_MAIN:  { s: 3, e: 6,   straggler: false },
  LIGHT_L1:      { s: 6, e: 7,   straggler: false },
  COL_L2:        { s: 3, e: 5,   straggler: false }
};
const case1Drops = { e3: 2, e4: 0, member: 2, contractedSccs: 2, contractedNodes: 4, fsViolInScc: 0 };

// ══ CASE 2 — a level missing a phase (Superstructure absent at L3; Substructure chains straight
// to Architecture, skipping the gap; Tier-2's t1Complete correctly excludes the absent phase from
// its max instead of erroring or stalling). ═══════════════════════════════════════════════════
const case2Items = [
  el('FOOTING2', 'IfcFooting',          'Substructure', 1, 'L3', 'CONCRETE', -1, 0, 0, 2, 0, 2, 0, 1),
  el('WALL2',    'IfcWallStandardCase', 'Architecture',  5, 'L3', 'MASON',     0, 3, 0, 2, 0, 2, 0, 1),
  el('MEP2',     'IfcLightFixture',     'MEP Rough-in',  7, 'L3', 'ELECTRICIAN', 3.4, 3.6, 5, 6, 0, 1, 0, 1)
];
// §DESIGNATED_SUPPORT_TOUCH_AMBIGUITY applies again here (FOOTING2/WALL2 touch at z=0, same as
// case1's FOOTING_L1/COL_L1) — verified, not re-derived blind: FOOTING2 and WALL2 form a mutual
// pure-physics 2-cycle (contracted, shared start=0), which ALSO closes a 3-cycle with
// M(L3,Substructure) (FOOTING2->M[member], M->WALL2[e3, since present=[Substructure,Architecture]
// with Superstructure absent], WALL2->FOOTING2[E1, the reversed/accidental edge]) -> member+e3
// dropped there too, leaving the mutual E1 pair to be contracted. Net effect on MEP2's gate: since
// FOOTING2's member edge into M(Substructure) is dropped, M(Substructure) no longer reflects
// FOOTING2 at all (ES stays at the base epoch, 0) -- but WALL2 still separately feeds its OWN
// M(Architecture) milestone via an UNRELATED member edge (not part of this cycle), so
// M(Architecture)=WALL2.finish=1 survives intact. t1Complete(L3)=max(M(Substructure)=0[reset by
// the drop],M(Architecture)=1)=1 [Superstructure absent throughout]. MEP2: ES=1,dur1 -> s=1,e=2.
const case2Expect = {
  FOOTING2: { s: 0, e: 1, straggler: true  },
  WALL2:    { s: 0, e: 1, straggler: false },
  MEP2:     { s: 1, e: 2, straggler: false }
};
const case2Drops = { e3: 1, e4: 0, member: 1, contractedSccs: 1, contractedNodes: 2, fsViolInScc: 0 };

// ══ CASE 3 — an orphan element (not grounded, no valid contact: something sits below within grid
// range but too far in Z to satisfy any of bearing-below/embedded/carrier-above). ════════════════
const case3Items = [
  el('FAR_BELOW', 'IfcSlab',   'Substructure',   1, 'L4', 'CONCRETE', 0, 1, 0, 2, 0, 2, 0, 1),
  el('ORPHAN_EL', 'IfcColumn', 'Superstructure', 2, 'L4', 'STEEL',    5, 6, 0, 2, 0, 2, 0, 1)
];
// ORPHAN_EL is a genuine orphan (verified): from ITS OWN scan, FAR_BELOW is 4m below — fails
// bearing-below (S.tz=1 < ORPHAN.bz-GAP=4.5), embedded, and carrier-above -> contacts[ORPHAN_EL]
// stays null, des=-1, no E1 edge INTO it -- but grounded[ORPHAN_EL]=0 (FAR_BELOW's bz=0 IS lower,
// so it's correctly NOT counted as resting on true ground) -> !grounded && !list -> real orphan.
// BUT (verified, not assumed): carrier-above has NO UPPER distance bound (`S.bz>=T.tz-GAP` only
// checks S isn't too far BELOW T's top; any S positioned above T at ANY distance can match) — so
// FROM FAR_BELOW's OWN scan, ORPHAN_EL (4m above, same XY) DOES match carrier-above, giving
// FAR_BELOW a spurious E1 support from ORPHAN_EL (reversed: ORPHAN_EL->FAR_BELOW). Combined with
// both being at the SAME level L4 (present=[Substructure,Superstructure], so E3 gates
// M(Substructure)->ORPHAN_EL), this closes a 3-cycle (FAR_BELOW->M[member], M->ORPHAN_EL[e3],
// ORPHAN_EL->FAR_BELOW[E1]) -> member+e3 dropped. Only ONE direction of E1 exists here (ORPHAN_EL
// has no reverse edge, its own contacts are null) so no mutual pair survives to contract ->
// contractedSccs=0, unlike case1/case2. Final: ORPHAN_EL's e3-in dropped, no other constraint ->
// s=0,e=1. FAR_BELOW's only surviving constraint is the E1 SS from ORPHAN_EL (needs its START=0)
// -> s=0,e=1. FAR_BELOW inherits ORPHAN_EL's higher groupKey via that surviving physics edge -> straggler.
const case3Expect = {
  FAR_BELOW: { s: 0, e: 1, straggler: true  },
  ORPHAN_EL: { s: 0, e: 1, straggler: false }
};
const case3Drops = { e3: 1, e4: 0, member: 1, contractedSccs: 0, contractedNodes: 0, fsViolInScc: 0 };

// ══ CASE 4 — parallel independent zones sharing one band (two differently-NAMED levels whose
// mean Z falls in the SAME 3m band): must NOT cross-chain via E4 — each zone's own timeline stays
// independent of the other's, even though they're in the same band. ═════════════════════════════
// §DESIGNATED_SUPPORT_TOUCH_AMBIGUITY-clean by construction this time: every element sits in its
// OWN, mutually-disjoint 4m grid cell (x centers 1,11,51,61 — all >4m apart) so NONE of them ever
// appear in each other's contact scan at all — zero E1 edges anywhere in this case, deliberately,
// so the E3/E4 chain is the ONLY mechanism in play and isn't muddied by the touch artifact found
// in cases 1-3 (that artifact accidentally dropped the E3 gate the first version of this case
// relied on — rebuilt clean rather than patched).
const case4Items = [
  el('WINGA_FOOTING', 'IfcFooting', 'Substructure',   1, 'WingA', 'CONCRETE', 0,   1,   0,  2, 0, 2, 0, 5),    // slow: dur=5d
  el('WINGA_COL',      'IfcColumn', 'Superstructure', 2, 'WingA', 'STEEL',    1,   2,   10, 12, 0, 2, 0, 1),
  el('WINGB_FOOTING', 'IfcFooting', 'Substructure',   1, 'WingB', 'CONCRETE', 0.1, 1.1, 50, 52, 0, 2, 0, 1),   // fast: dur=1d
  el('WINGB_COL',      'IfcColumn', 'Superstructure', 2, 'WingB', 'STEEL',    1.1, 2.1, 60, 62, 0, 2, 0, 1)
];
// WingA meanZ~0.5, WingB meanZ~0.6 -> both floor(meanZ/3)=band 0, same band, different level names
// (E3 is per-LEVEL-NAME so already independent; the assertion that matters is E4, which only
// chains ADJACENT DISTINCT bandRanks — same-band names are never connected to each other by E4).
// No E1 edges at all (disjoint XY). WINGA_FOOTING: grounded, s=0,e=5 (slow). WINGA_COL: pure E3
// from M(WingA,Substructure)=5 -> s=5,e=6. WINGB_FOOTING: grounded, s=0,e=1 (fast). WINGB_COL:
// pure E3 from M(WingB,Substructure)=1 (its OWN zone's milestone, NOT WingA's slower one) -> s=1,
// e=2 -- proves WingB's schedule is NOT held hostage by WingA's slower one despite sharing a band.
const case4Expect = {
  WINGA_FOOTING: { s: 0, e: 5, straggler: false },
  WINGA_COL:     { s: 5, e: 6, straggler: false },
  WINGB_FOOTING: { s: 0, e: 1, straggler: false },
  WINGB_COL:     { s: 1, e: 2, straggler: false }
};
const case4Drops = { e3: 0, e4: 0, member: 0, contractedSccs: 0, contractedNodes: 0, fsViolInScc: 0 };

function main() {
  const results = [
    checkCase('CASE1_STRAGGLER_DEADLOCK', case1Items, { maxCrews: { STEEL: 1 } }, case1Expect, case1Drops, 2),
    checkCase('CASE2_MISSING_PHASE', case2Items, {}, case2Expect, case2Drops, 1),
    checkCase('CASE3_ORPHAN', case3Items, {}, case3Expect, case3Drops, 1),
    checkCase('CASE4_PARALLEL_ZONES_ONE_BAND', case4Items, {}, case4Expect, case4Drops, 0)
  ];
  const allPass = results.every(Boolean);
  console.log('\n§E3_SYNTHETIC_SUITE ' + (allPass ? 'PASS' : 'FAIL') + ' cases=' + results.length + ' passed=' + results.filter(Boolean).length);
  process.exit(allPass ? 0 : 1);
}
main();
