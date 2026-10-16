// witness_kit/invariants/bar_needs.js — the needs() edge PROVIDERS of the 4D Bar model.
// Spec: bim-compiler prompts/4D_BAR_MODEL.md §3 + §3.1 (EXTRACTION IS MANDATORY).
//
// The one rule these gate: every provider LIFTS a shipped schedule_gate.js predicate — none are
// re-derived. §3.1's own measured cost of getting this wrong: a hand-written "support = anything
// below" gave Duplex 4,706 edges / 52 midair; ScheduleGate.supportPool-filtered gave far fewer and
// 0 midair. `edgeCountMatchesShipped` is the gate that makes THAT specific regression impossible to
// ship unnoticed — it doesn't re-check bar_needs.js's own arithmetic, it checks bar_needs.js's
// output against a SECOND, INDEPENDENT computation: the real ScheduleGate.computeSchedule's own
// self-reported §GEO_ORDER edge count, parsed out of its console.log — the shipped predicate,
// called directly, not trusted by inspection.
'use strict';

/**
 * G-BN-NOSELF — no edge may point an element at itself.
 * @param {object[]} rows - {from, to, kind, ...}
 * @returns {boolean}
 */
const noSelfEdges = rows => rows.every(r => r.from !== r.to);

/**
 * G-BN-NODUP — no (building, kind, from, to) tuple may repeat. Duplicate edges are exactly the
 * shape a stray second grid-cell scan of the same pair would produce if the per-element dedup
 * (schedule_gate.js's own stamp/gen technique, lifted into bar_needs.js) were ever dropped.
 * @param {object[]} rows - {building, from, to, kind}
 * @returns {boolean}
 */
function noDuplicateEdges(rows) {
  const seen = new Set();
  for (const r of rows) {
    const k = r.building + '|' + r.kind + '|' + r.from + '|' + r.to;
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

/**
 * G-BN-EDGECOUNT — the anti-re-derivation gate, the whole point of this witness
 * (4D_BAR_MODEL.md §3.1). support+carrier+wall+host must sum to EXACTLY the real
 * ScheduleGate.computeSchedule's own §GEO_ORDER `edges=` count for the SAME element set —
 * computeSchedule's own §GEOMETRIC_SUPPORT_ORDER DAG builder (schedule_gate.js:758-862) is the
 * predicate bar_needs.js's SupportNeeds/CarrierNeeds/WallNeeds providers lift their geometry from,
 * so their combined total (opening excluded — it is not part of that DAG at all, see below) has no
 * freedom to differ from what the shipped function itself reports building the identical elements.
 * A hand-rederived support definition changes this SUM without changing computeSchedule's own
 * count, so any drift between an author's private geometry and the shipped one fails here.
 * @param {{mySum:number, shippedEdges:number}[]} perBuilding
 * @returns {boolean}
 */
const edgeCountMatchesShipped = perBuilding =>
  perBuilding.every(b => b.mySum === b.shippedEdges);

/**
 * G-BN-HOSTCOUNT — HostNeeds' edge count equals BOTH computeSchedule's own hostEdges= tally AND a
 * fresh, independent call to ScheduleGate.hostPairs() on the same elements. Two independent
 * re-derivations of "did bar_needs.js actually call hostPairs, not reimplement §HOSTED_BEFORE_HOST".
 * @param {{myHost:number, shippedHostEdges:number, hostPairsLen:number}[]} perBuilding
 * @returns {boolean}
 */
const hostCountMatchesShipped = perBuilding =>
  perBuilding.every(b => b.myHost === b.shippedHostEdges && b.myHost === b.hostPairsLen);

/**
 * G-BN-OPENINGCOUNT — OpeningNeeds' edge count equals a fresh, independent call to
 * ScheduleGate.openingPairs() on the same elements. openingPairs is not part of computeSchedule's
 * DAG (doors/windows are gated at runtime by openingGate, never ordered by the Kahn-topological
 * pass), so this is checked against openingPairs directly rather than against §GEO_ORDER.
 * @param {{myOpening:number, openingPairsLen:number}[]} perBuilding
 * @returns {boolean}
 */
const openingCountMatchesShipped = perBuilding =>
  perBuilding.every(b => b.myOpening === b.openingPairsLen);

/**
 * G-BN-SUPPORTPOOL-CALLED — ScheduleGate.supportPool was invoked at least once while building
 * SupportNeeds/CarrierNeeds — the exact call the §3.1 hard rule requires in place of retyping
 * `e.seq<=4 || isPromotedSlab(e) || isStairFlight(e)` a second time. A count of 0 means the source
 * population was built some other way — this witness's own §W-REDCONTROL proves that shape is
 * catchable (see witness_bar_needs.js's own redControl / supportPoolCallCount=0 assertion).
 * @param {number} callCount
 * @returns {boolean}
 */
const supportPoolWasCalled = callCount => callCount > 0;

module.exports = {
  noSelfEdges, noDuplicateEdges, edgeCountMatchesShipped,
  hostCountMatchesShipped, openingCountMatchesShipped, supportPoolWasCalled
};
