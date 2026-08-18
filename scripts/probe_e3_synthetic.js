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
  const midair = directionalMidair(cpmItems).midair;
  console.log('  floating: midair=' + midair + ' | ' + (midair === 0 ? 'PASS' : 'FAIL'));
  if (midair !== 0) mismatches++;
  console.log(name + ' ' + (mismatches === 0 ? 'PASS' : 'FAIL') + ' mismatches=' + mismatches);
  return mismatches === 0;
}

// §MIDAIR_DIRECTIONAL — the fix under test in this section. Was symmetric ("does my earliest
// physical neighbor of ANY kind start around when I do"), which false-flags a correctly-grounded
// element the moment designatedSupport() stops forcing it to share a start with whatever's built
// on top of it. Directional: uses the SAME real support designatedSupport() now correctly
// computes (grounded-check-first) — an element with nothing to depend on (grounded or orphan,
// des=-1) can never be floating, no matter what starts later nearby.
function directionalMidair(items) {
  const G = _contactGraph(items);
  const des = CpmSchedule.designatedSupport(items, G);
  let midair = 0; const guids = [];
  for (let i = 0; i < items.length; i++) {
    const sIdx = des[i]; if (sIdx < 0) continue;
    if (items[sIdx].s > items[i].s + 1) { midair++; guids.push(items[i].guid); }
  }
  return { midair, orphans: G.orphans, guids };
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
  // §GAP_BOUNDARY_COINCIDENCE (found verifying the grounded-check fix, 2026-08-18): bz was -0.5,
  // making BRACKET's own vertical gap to WALL_L1 land EXACTLY on GAP (0.5m) -- the `grounded`
  // formula's strict `<` there disagreed with bearing-below's inclusive `>=` at that exact
  // boundary, so BRACKET itself registered as "grounded" despite having a genuine support,
  // wrongly skipped by the fix. -0.6 clears the boundary while keeping the bearing-below match
  // (S.tz=0 >= BRACKET.bz(0)-GAP(0.5)=-0.5 still holds). Real, reportable edge case, not a defect
  // in the fix itself -- see the report.
  el('WALL_L1',      'IfcWallStandardCase', 'Architecture',   5, 'L1', 'MASON',      -0.6, 0, 8, 10, 0, 2, 0, 2),
  el('WALL_L1_MAIN', 'IfcWallStandardCase', 'Architecture',   5, 'L1', 'MASON',        0,  3, 2.5, 4.5, 0, 2, 0, 3),
  el('LIGHT_L1',      'IfcLightFixture',    'MEP Rough-in',   7, 'L1', 'ELECTRICIAN', 1.4, 1.6, 3.4, 3.6, 0.9, 1.1, 0, 1),
  el('COL_L2',       'IfcColumn',           'Superstructure', 2, 'L2', 'STEEL',        3,  6, 0, 2, 0, 2, 0, 2)
];
// §GROUNDED_NEVER_HANGS re-derivation (2026-08-18) — FOOTING_L1 and WALL_L1 no longer get a
// spurious reversed support from designatedSupport()'s grounded-check-first fix, so the
// accidental 2-node mutual cycles (and the second straggler) are gone. The DELIBERATE cycle
// (BRACKET genuinely rests on WALL_L1, which is gated behind Superstructure's own completion)
// is untouched by that fix and still resolves the same way. E3 now correctly reaches COL_L1/
// COL_L1B/COL_L2/WALL_L1_MAIN/LIGHT_L1 (no longer reset to 0 by the accidental cycle), pushing
// every downstream time later than before — re-derived by hand, then confirmed via a direct
// contactGraph/designatedSupport dump before trusting these numbers (see the fix's own report).
const case1Expect = {
  FOOTING_L1:    { s: 0, e: 1,   straggler: false },
  COL_L1:        { s: 1, e: 3,   straggler: false },
  COL_L1B:       { s: 3, e: 4,   straggler: false },
  BRACKET:       { s: 1, e: 2,   straggler: true  },
  WALL_L1:       { s: 0, e: 2,   straggler: false },
  WALL_L1_MAIN:  { s: 4, e: 7,   straggler: false },
  LIGHT_L1:      { s: 7, e: 8,   straggler: false },
  COL_L2:        { s: 4, e: 6,   straggler: false }
};
const case1Drops = { e3: 1, e4: 0, member: 1, contractedSccs: 0, contractedNodes: 0, fsViolInScc: 0 };

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
// §GROUNDED_NEVER_HANGS re-derivation (2026-08-18) — FOOTING2 no longer gets a spurious reversed
// support from WALL2; the accidental cycle (and FOOTING2's false straggler flag) is gone. E3
// correctly reaches WALL2 now (M(Substructure) no longer reset to 0), pushing WALL2 and MEP2 both
// one day later than before.
const case2Expect = {
  FOOTING2: { s: 0, e: 1, straggler: false },
  WALL2:    { s: 1, e: 2, straggler: false },
  MEP2:     { s: 2, e: 3, straggler: false }
};
const case2Drops = { e3: 0, e4: 0, member: 0, contractedSccs: 0, contractedNodes: 0, fsViolInScc: 0 };

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
// §GROUNDED_NEVER_HANGS re-derivation (2026-08-18) — FAR_BELOW no longer gets a spurious reversed
// support from ORPHAN_EL (the long-distance carrier-above match); with that edge gone, the whole
// chain is a simple DAG (no cycle at all), so nothing gets dropped and ORPHAN_EL's E3 gate from
// M(Substructure) applies normally, pushing it one day later than before.
const case3Expect = {
  FAR_BELOW: { s: 0, e: 1, straggler: false },
  ORPHAN_EL: { s: 1, e: 2, straggler: false }
};
const case3Drops = { e3: 0, e4: 0, member: 0, contractedSccs: 0, contractedNodes: 0, fsViolInScc: 0 };

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

// ══ CASE 5 — a grounded footing with something built on top that starts MUCH later must NOT be
// flagged floating. This is the exact regression the OLD symmetric judge produced the moment
// designatedSupport() stopped forcing a grounded element to share its start with whatever's on
// top of it: FOOTING5 (grounded, no real support, des=-1) sits at day 0; COL5 (rests on FOOTING5)
// is hand-given a much later start (day 5, simulating a real delay — crew queue, a gate, anything)
// to maximize the gap the OLD check would have misread as "I appear before my neighbor arrives".
// Tests the JUDGE directly (hand-picked times, not run through solve()) — the question is whether
// the CHECK is right, not whether the engine produced these times. ═══════════════════════════════
const case5Items = [
  el('FOOTING5', 'IfcFooting', 'Substructure',   1, 'L5', 'CONCRETE', -1, 0, 0, 2, 0, 2, 0, 1),
  el('COL5',     'IfcColumn',  'Superstructure', 2, 'L5', 'STEEL',     0, 3, 0, 2, 0, 2, 5, 7)
];
// Hand-computed: FOOTING5 is grounded (nothing below it) -> designatedSupport=-1 -> can never be
// floating, regardless of COL5's start. COL5's designated support IS FOOTING5 (bearing-below) ->
// is FOOTING5.s(0) > COL5.s(5)+1? No -> COL5 not floating either (its support started well before
// it did, which is correct). Expected: midair=0.

// ══ CASE 6 — a genuine floating violation must still be caught. DEPENDENT6 is hand-given a start
// BEFORE its real support (SUPPORT6) has even begun — the exact case the fix must not regress.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const case6Items = [
  el('SUPPORT6',   'IfcFooting', 'Substructure',   1, 'L6', 'CONCRETE', -1, 0, 0, 2, 0, 2, 5, 6),
  el('DEPENDENT6', 'IfcColumn',  'Superstructure', 2, 'L6', 'STEEL',     0, 3, 0, 2, 0, 2, 0, 1)
];
// Hand-computed: SUPPORT6 is grounded -> never floating. DEPENDENT6's designated support IS
// SUPPORT6 (bearing-below) -> is SUPPORT6.s(5) > DEPENDENT6.s(0)+1=1? YES (5>1) -> DEPENDENT6 IS
// floating. Expected: midair=1, guids=['DEPENDENT6'].

// ══ CASE 7 — the narrowing itself: a grounded-by-coarse-threshold element that still has a
// genuine close support must NOT lose it. `grounded[i]` uses the coarse GAP(0.5m) threshold over
// ALL XY-neighbors regardless of relation, but a genuine bearing-below match only needs EPS(0.05m)
// clearance — a real support sitting between EPS and GAP below T satisfies cls=0 while leaving
// `lowest >= T.bz-GAP`, so grounded[T] stays 1 even though T has real support. The ORIGINAL blunt
// fix ("if grounded, always -1") would have discarded THIN_FTG7 here — exactly the
// §GROUNDED_OVERRIDE_FIX mistake repeated. The narrowed fix must not. ══════════════════════════
const case7Items = [
  el('THIN_FTG7', 'IfcFooting', 'Substructure', 1, 'L7', 'CONCRETE', -0.2, 0.05, 0, 2, 0, 2, 0, 1),
  el('SLAB7',     'IfcSlab',    'Superstructure', 2, 'L7', 'CONCRETE', 0, 1, 0, 2, 0, 2, 1, 2)
];
// Hand-computed: SLAB7.bz=0. THIN_FTG7.bz=-0.2, THIN_FTG7.tz=0.05. cls=0 test for THIN_FTG7 as
// SLAB7's support: THIN_FTG7.bz(-0.2) < SLAB7.bz(0)-EPS(0.05)=-0.05? YES. THIN_FTG7.tz(0.05) >=
// SLAB7.bz(0)-GAP(0.5)=-0.5? YES -> cls=0, genuine bearing-below. grounded[SLAB7]: lowest among
// SLAB7's neighbors = THIN_FTG7.bz(-0.2); is -0.2 < SLAB7.bz(0)-GAP(0.5)=-0.5? NO -> grounded[SLAB7]=1
// despite the genuine support existing. Narrowed fix: bestCls=0 (not 2) -> grounded check never
// applies -> des[SLAB7]=THIN_FTG7's index. THIN_FTG7 itself: only neighbor is SLAB7 above (cls=2
// by elimination, S.bz(0) is not < T.bz(-0.2)-EPS and not <= T.bz+EPS with S.tz>=T.tz — falls to
// cls=2); grounded[THIN_FTG7]=1 (nothing below IT either) -> bestCls=2 && grounded -> des=-1.
// Correct: THIN_FTG7 is the true base element, gets no support; SLAB7 correctly keeps its real one.
function checkNarrowing(name, items, expectDes) {
  console.log('--- ' + name + ' ---');
  const G = CpmSchedule.contactGraph(items);
  const des = CpmSchedule.designatedSupport(items, G);
  let ok = true;
  items.forEach(function (it, i) {
    const gotJ = des[i], gotGuid = gotJ >= 0 ? items[gotJ].guid : null;
    const exp = expectDes[it.guid];
    const match = gotGuid === exp;
    if (!match) ok = false;
    console.log('  ' + it.guid + ': des=' + gotGuid + ' expect=' + exp + ' | ' + (match ? 'MATCH' : 'MISMATCH'));
  });
  console.log(name + ' ' + (ok ? 'PASS' : 'FAIL'));
  return ok;
}

function checkDirectionalOnly(name, items, expectMidair, expectGuids) {
  console.log('--- ' + name + ' ---');
  const r = directionalMidair(items);
  const guidsOk = JSON.stringify(r.guids.sort()) === JSON.stringify((expectGuids || []).sort());
  const ok = r.midair === expectMidair && guidsOk;
  console.log('  midair: got=' + r.midair + ' guids=' + JSON.stringify(r.guids) +
    ' | expect=' + expectMidair + ' guids=' + JSON.stringify(expectGuids || []) + ' | ' + (ok ? 'MATCH' : 'MISMATCH'));
  console.log(name + ' ' + (ok ? 'PASS' : 'FAIL'));
  return ok;
}

function main() {
  const results = [
    checkCase('CASE1_STRAGGLER_DEADLOCK', case1Items, { maxCrews: { STEEL: 1 } }, case1Expect, case1Drops, 1),
    checkCase('CASE2_MISSING_PHASE', case2Items, {}, case2Expect, case2Drops, 0),
    checkCase('CASE3_ORPHAN', case3Items, {}, case3Expect, case3Drops, 0),
    checkCase('CASE4_PARALLEL_ZONES_ONE_BAND', case4Items, {}, case4Expect, case4Drops, 0),
    checkDirectionalOnly('CASE5_GROUNDED_NOT_FLOATING', case5Items, 0, []),
    checkDirectionalOnly('CASE6_GENUINE_FLOATING_STILL_CAUGHT', case6Items, 1, ['DEPENDENT6']),
    checkNarrowing('CASE7_GROUNDED_BUT_REAL_SUPPORT_SURVIVES', case7Items, { THIN_FTG7: null, SLAB7: 'THIN_FTG7' })
  ];
  const allPass = results.every(Boolean);
  console.log('\n§E3_SYNTHETIC_SUITE ' + (allPass ? 'PASS' : 'FAIL') + ' cases=' + results.length + ' passed=' + results.filter(Boolean).length);
  process.exit(allPass ? 0 : 1);
}
main();
