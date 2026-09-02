// mep_coordination.js — CoordinationHandler: the rules-driven arbiter for MEP route deconfliction.
//
// The NEW RouteWalker sub-handler (see docs/MEP_COORDINATION_RULESET.md). When RouteHandler proposes a
// path and SpaceHandler reports a clash — vs a wall OR vs another discipline's route — this decides
// WHO HOLDS, WHO YIELDS, by HOW MUCH (min separation), and the resolution MOVE.
//
// NON-INVENT: every rule carries {status, source}. status ∈ VERIFIED | PENDING | REFUTED.
//   - VERIFIED (≥2-0 adversarial deep-research vote, cited): ENFORCED.
//   - PENDING  (gathered from a real source but not confirmed / specific claim abstained): ADVISORY only —
//              logged as a warning, NOT enforced.
//   - REFUTED  (voted down): do NOT use; kept here only as a tombstone so it is not re-added.
//   Source rows mirror docs/MEP_COORDINATION_RULESET.md exactly. Do not add a rule without a source.
//
// PROVENANCE UPDATE 2026-06-22 (deep-research run wsog87r4b, 25 claims → 10 confirmed / 15 killed):
//   ✅ DRAIN holds at a clash — gravity fixed-fall (1°–5°) cannot be re-pitched (VERIFIED 3-0:
//      pinnacleiit MEP-coordination; CIBSE/Geberit BS EN 12056 drainage-design).
//   ✅ STRUCT holds — structure is immovable (physical fact; BG6 coordinates services AROUND it).
//   ✅ ELEC ↔ water/gas 25 mm; ELEC ↔ telecom/data 50 mm (VERIFIED 3-0: AS/NZS 3000:2018, sparkycalc
//      LV-segregation summary). ✅ BG6/2018 is the coordination-CONVENTION framework (VERIFIED), but it
//      does NOT publish the inter-service ORDERING.
//   🟡 the fuller largest-before-smallest / rigid-before-flexible ladder among ACMV/FP/DWATER/ELEC stays
//      PENDING — every specific-sequence claim was REFUTED (1-2 / 0-3, single-blog, non-normative).
//   ❌ ceiling-void vertical STACKING order (sprinkler-highest AND duct-highest both REFUTED 0-3) — no
//      universally-citable order → NOT encoded (no stackZ). ❌ ELEC/tray ↔ hot-pipe 300 mm AS/NZS
//      attribution REFUTED 0-3 → the ACMV↔ELEC number stays advisory-only.
'use strict';
(function (root) {

  // Disciplines (our codes). DRAIN = gravity soil/waste/storm; DWATER = pressurised cold/hot water;
  // FP = fire sprinkler; ACMV = HVAC duct + chilled water; ELEC = cable tray/conduit/busbar;
  // DATA = ELV/comms; GAS = fuel gas / LPG; STRUCT = ARC/STR member (wall/slab/beam).
  var DISC = ['DRAIN', 'ACMV', 'FP', 'DWATER', 'GAS', 'ELEC', 'DATA', 'STRUCT'];

  // ROUTING PRIORITY ranks — lower rank is laid first and HOLDS its path; higher rank YIELDS.
  // Used for the WHO-HOLDS ordering. The ENFORCE status of that decision is NOT global — it is derived
  // per-pair in holdsStatus(): only STRUCT-holds and DRAIN-holds are citable/physical (VERIFIED); the
  // rest of the ladder is PENDING (the specific sequence was refuted).  §1/§2 docs/MEP_COORDINATION_RULESET.md
  var PRIORITY = {
    STRUCT: 0,            // immovable — never moves (physical)
    DRAIN:  1,            // gravity, fixed fall — holds (VERIFIED)
    ACMV:   2,            // largest service (duct)        ┐
    FP:     3,            // sprinkler mains               │ relative order among these = PENDING
    DWATER: 3,            // pressurised pipe              │ (largest/rigid ladder unverified)
    GAS:    3,            //                               │
    ELEC:   4,            // cable tray / conduit          │
    DATA:   4             // ELV / comms                   ┘
  };

  // Per-pair YIELD-decision provenance. VERIFIED only when the HOLDER is structurally/physically fixed.
  var HOLD_STRUCT = 'structure is immovable (physical); BG6 coordinates services around it';
  var HOLD_DRAIN  = 'gravity fixed-fall (1°–5°) cannot be re-pitched — pinnacleiit MEP coord; CIBSE/Geberit BS EN 12056';
  var HOLD_LADDER = 'largest/rigid-before-flexible ladder UNVERIFIED (specific sequence REFUTED); BG6 framework only';
  function holdsStatus(holder) {
    if (holder === 'STRUCT') return { status: 'VERIFIED', source: HOLD_STRUCT };
    if (holder === 'DRAIN')  return { status: 'VERIFIED', source: HOLD_DRAIN };
    return { status: 'PENDING', source: HOLD_LADDER };
  }

  // §3 MIN SEPARATION (mm) per unordered discipline pair. Each: [mm, status, source].
  function key(a, b) { return [a, b].sort().join('|'); }
  var SEP = {};
  function sep(a, b, mm, status, src) { SEP[key(a, b)] = { mm: mm, status: status, source: src }; }
  sep('DATA', 'ELEC', 50, 'VERIFIED', 'BS 6701 / NEC 800.52 (CommScope TP-106296); corrob. AS/NZS 3000:2018 §3.8 50mm');
  sep('FP', 'STRUCT', 50, 'VERIFIED', 'NFPA 13 §18.4.9 (clearance from non-supporting structure)');
  sep('ELEC', 'DWATER', 25, 'VERIFIED', 'AS/NZS 3000:2018 — LV ≥25mm from above-ground water pipe (sparkycalc LV-segregation)');
  sep('ELEC', 'GAS',    25, 'VERIFIED', 'AS/NZS 3000:2018 — LV ≥25mm from above-ground gas pipe (sparkycalc LV-segregation)');
  sep('ACMV', 'ELEC',  300, 'PENDING',  'tray↔hot/duct 300mm — AS/NZS 3000 attribution REFUTED 0-3 (ccceng); advisory only');

  var DEFAULT_SEP = { mm: 25, status: 'PENDING', source: 'fallback default — no cited pair rule; advisory only' };

  // ── API ────────────────────────────────────────────────────────────────────
  var CoordinationHandler = {
    disciplines: DISC,

    priorityRank: function (d) { return PRIORITY[d] != null ? PRIORITY[d] : 99; },

    // who yields when a and b clash → { holds, yields, status, source }.
    // status reflects whether the HOLD decision is citable (STRUCT/DRAIN) or still PENDING (the ladder).
    yields: function (a, b) {
      var ra = this.priorityRank(a), rb = this.priorityRank(b);
      var holds = ra <= rb ? a : b, yieldsD = ra <= rb ? b : a;
      var hs = holdsStatus(holds);
      return { holds: holds, yields: yieldsD, status: hs.status, source: hs.source };
    },

    // required min separation (mm) between two services
    minSeparation: function (a, b) {
      return SEP[key(a, b)] || DEFAULT_SEP;
    },

    // §3 resolution MOVE for the yielding service. Duct has a cited move: depress ≤30% height (no width
    // increase) to pass under an obstruction before rerouting. ✅ VERIFIED (SMACNA Duct Design).
    resolveMove: function (yieldDisc) {
      if (yieldDisc === 'ACMV') {
        return { move: 'depress', maxFraction: 0.30, status: 'VERIFIED',
                 source: 'SMACNA Duct Design (depress ≤30% height, loss coeff 0.24–0.35)' };
      }
      return { move: 'reroute', status: 'VERIFIED',
               source: 'flexible service reroutes around the holder (BG6 clash-resolution; gravity/structure hold)' };
    },

    // full arbitration for a clashing pair: who yields, by how much, how — with enforce flag.
    // ENFORCE only when BOTH the yield-decision AND the separation are VERIFIED; else advisory (logged).
    arbitrate: function (a, b) {
      var y = this.yields(a, b);
      var s = this.minSeparation(a, b);
      var mv = this.resolveMove(y.yields);
      var enforce = (y.status === 'VERIFIED') && (s.status === 'VERIFIED');
      return {
        holds: y.holds, yields: y.yields, minSepMm: s.mm, move: mv.move,
        enforce: enforce,
        notes: {
          priority: y.status + ' (' + y.source + ')',
          separation: s.status + ' (' + s.source + ')',
          move: mv.status + ' (' + mv.source + ')'
        }
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CoordinationHandler;
  if (root) root.CoordinationHandler = CoordinationHandler;
})(typeof window !== 'undefined' ? window : null);
