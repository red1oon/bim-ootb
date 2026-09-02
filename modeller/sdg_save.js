// sdg_save.js — §SAVE-1: pure planning core for Modeller "Save" (MODELLER_SAVE_COMPLETEIT.md). Save = a
// validated snapshot promotion: run SdgGate.evaluate(), auto-heal what's SAFELY fixable, block on residual RED,
// then write a physical-DB snapshot. This module owns ONLY the pure classify/plan-op logic (no DOM, no
// IndexedDB, no oplog access) so it is unit-testable pure-node, same convention as sdg_gate.js/sdg_cascade.js.
// The DOM/oplog/IndexedDB wiring (runSave()) lives in modeller.html + save_catalog.js.
//
// DECISION (per MODELLER_SAVE_COMPLETEIT.md, defaulted by the assistant while the user was away from keyboard,
// flagged for confirmation not hard sign-off): Modeller Save does NOT call erp/ad_docfsm.js's DocumentEngine —
// it only MIRRORS that module's Error/Clean signal SHAPE (plain object, boolean `ok`, machine-readable `reason`
// string on failure) for consistency. No ERP DocStatus transition is ever driven by a Modeller Save.
//
// AUTO-HEAL SCOPE: only ORANGE findings that (a) are one of the two classes named in the spec
// ('abuts-realign', 'clearance') AND (b) actually CARRY a verified `proposedDelta` array get healed — never
// invented. As of this writing (2026-07-05) sdg_gate.js's `evaluate()` only ever attaches `proposedDelta` to
// 'abuts-realign' findings (sdg_gate.js:133) — 'clearance' findings (sdg_gate.js:68) carry no delta at all
// today, so in PRACTICE only abuts-realign auto-heals; this module is written class-agnostic (checks for the
// field, not just the kind) so a future sdg_gate.js clearance-delta addition auto-heals through here with zero
// change needed. Flagged in the PR description — do not silently assume clearance is "handled."
//
// HEAL TARGET: per witness_sdg_gate.js's OWN re-verification (A8: `SdgGate.overlaps(a8[A], tr(touchNb,
// hit8.proposedDelta))` — the delta is applied to `hit.a`, i.e. the finding's UNMOVED neighbour `nb`, not the
// side that moved `mv`/`b`) — this mirrors SPATIAL_DEPENDENCY_GRAPH.md's own framing ("neighbor realigns to
// shared face"): the neighbour catches up to the mover, preserving the user's edit. NEVER move `finding.b`.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SdgSave = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // The two spec-named classes eligible for auto-heal — gated ADDITIONALLY on `proposedDelta` actually present.
  var HEALABLE_KINDS = { 'abuts-realign': 1, 'clearance': 1 };

  // planHeal(orange) -> { healable: [finding,...], other: [finding,...] }
  // healable = ORANGE findings of an eligible kind that carry a real (array, length-3) proposedDelta.
  // other = everything else (unhealable ORANGE — e.g. today's delta-less 'clearance' — reported, never touched).
  function planHeal(orange) {
    var healable = [], other = [];
    (orange || []).forEach(function (o) {
      var hasDelta = HEALABLE_KINDS[o.kind] && Array.isArray(o.proposedDelta) && o.proposedDelta.length === 3;
      (hasDelta ? healable : other).push(o);
    });
    return { healable: healable, other: other };
  }

  // healOp(finding) -> {op_type:'GEOM_MOVE', params:{parent, dx, dy, dz, induced:'sdg-autoheal'}}
  // Shaped for oplog.commitGesture(opsArray) (params, NOT parameters — see bonsai_oplog.js commitGesture /
  // bonsai_gridmove.js's induced-rider ops for the exact convention this mirrors).
  function healOp(finding) {
    var d = finding.proposedDelta;
    return { op_type: 'GEOM_MOVE', params: { parent: finding.a, dx: d[0], dy: d[1], dz: d[2], induced: 'sdg-autoheal' } };
  }

  // orangeKey(o) -> a stable identity string for diffing "was this finding already known" across two
  // evaluate() passes (before-heal vs after-heal/re-verify) — used to detect genuinely NEW issues a heal
  // opened at a neighbour (the one-hop proof), never chased further by this module (it only ever plans ONE
  // heal pass off the FIRST evaluate() call — see modeller.html runSave()).
  function orangeKey(o) { return o.kind + '|' + o.a + '|' + o.b; }

  // newFindings(beforeList, afterList) -> afterList entries whose orangeKey wasn't present in beforeList.
  function newFindings(beforeList, afterList) {
    var seen = {};
    (beforeList || []).forEach(function (o) { seen[orangeKey(o)] = 1; });
    return (afterList || []).filter(function (o) { return !seen[orangeKey(o)]; });
  }

  // ABUTS_TOL mirrors sdg_gate.js's own touch tolerance (non-invent reuse — sdg_gate.js doesn't export its
  // internal constant, so this is the SAME literal value, not a re-derivation).
  var ABUTS_TOL = 0.03;
  // reverifyGap(finding, after, overlapsFn) -> {axisIdx, overlap, closed}
  // Direct gradient-check re-measurement of ONE SPECIFIC healed finding against the REAL post-heal geometry
  // (the heal op-log commit already happened for real — this isn't a synthetic copy) — "never trust the delta
  // blindly", mirroring witness_sdg_gate.js's own A8 re-measure convention (SdgGate.overlaps on the after-state).
  // overlapsFn = SdgGate.overlaps, passed in (not required) so this module stays dependency-free/pure/testable.
  function reverifyGap(finding, after, overlapsFn) {
    var axisIdx = 'xyz'.indexOf(finding.axis);
    var aBox = after[finding.a], bBox = after[finding.b];
    if (!aBox || !bBox || axisIdx < 0 || !overlapsFn) return { axisIdx: axisIdx, overlap: null, closed: false };
    var ov = overlapsFn(aBox, bBox)[axisIdx];
    return { axisIdx: axisIdx, overlap: ov, closed: Math.abs(ov) <= ABUTS_TOL };
  }

  return {
    planHeal: planHeal, healOp: healOp, orangeKey: orangeKey, newFindings: newFindings,
    reverifyGap: reverifyGap, HEALABLE_KINDS: HEALABLE_KINDS, ABUTS_TOL: ABUTS_TOL
  };
});
