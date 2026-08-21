// support_sweep.js — the support-order physics, extracted from time_machine.js (§S58)
//
// Implementing bim-compiler prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md §S58
// Witness: witness_midair_zero.js — pass=49 fail=0, identical before and after the move.
//
// PURE FUNCTIONS ONLY. No module state, no time_machine variable, no DOM, NO CONSOLE SIDE EFFECTS.
// time_machine.js keeps thin wrappers under the original private names; those wrappers own every
// state assignment and every § log line. The model computes; the parent reports. Same split as
// gantt_model.js (§S53/F3), the shipped precedent this file copies.
//
// NOTHING HERE IS NEW. Every rule and every comment moved verbatim, and the WHY stays attached to
// the rule it explains. The only interior deltas from the originals are:
//   (a) three console.log statements removed — they are the parent's job now, and
//   (b) additive return fields so the wrappers print the identical numbers:
//       _cjpJudgeParity gains maxShiftMs/ms/ok, _capWindowRescale gains {skipped, rescaled}.
//
// The declarations KEEP their original private names so the internal call graph moved with zero
// edits, and so witness_og_guard_bearing_bound.js can still slice this file BY FUNCTION NAME to
// build its text-perturbation variants — immune to indentation and log wording, unlike the raw
// text markers it used to slice out of time_machine.js. The API map exports public names.
// gantt_model.js could afford to rename on move; this region cannot.
//
// ScheduleGate is read as a bare identifier via guarded `typeof` AT CALL TIME, verbatim from the
// original bodies — no load-time dependency. In node, set global.ScheduleGate before calling.
// _designatedSupport's SG.EPS deref is UNGUARDED: its documented precondition is that callers reach
// it through contactGraph's G.ok gate first. That call-order contract moved with it.
'use strict';
(function (global) {

  // ── §PHASE_OVERLAP_SUPPORT_GUARD — the support-order sweep, now a NAMED shared pass ──────────
  // 2026-08-11 §TIER_SERIAL restructure: hoisted VERBATIM out of injectGantt's _cap-only overlay
  // branch. It now (a) enforces Tier 2's per-element support gating on the DEFAULT generative
  // display path — its main job under the two-tier design — and (b) verifies/repairs the _cap
  // global-affine overlay (expected ≈0 pushes there). The block's interior bytes and ORIGINAL
  // INDENTATION are deliberately preserved: two witnesses (witness_og_guard_bearing_bound.js,
  // witness_gantt_og_grid_perf.js) slice it by text markers (the _ogCELL declaration → the
  // §PHASE_OVERLAP_SUPPORT_GUARD log statement, whose historical §PHASE_OVERLAP_BAND wording is
  // part of the end-mark bytes) and execute it against synthetic _allScheduled arrays —
  // re-indenting, rewording the log, or renaming variables would rot both (that exact rot killed
  // witness_gantt_og_grid_perf once already, 2026-08-07..11).
  // _allScheduled: [{guid,s,e,bz,tz,x0,x1,y0,y1,cls,seq,...}] — mutated in place (including a
  // bz-ascending sort); s only ever moves LATER (push after real support), duration preserved.
  function _ogSupportSweep(_allScheduled, taskWin) {
      // §PHASE_OVERLAP_SUPPORT_GUARD global pass (see header above). isCarrier/CELL/EPS/GAP are the
      // SAME role-blind support predicate this file already uses for the generative path
      // (audit_support_roleblind.js / §SUPPORT_CHECK above) — not a new definition. Processing in
      // ascending base_z order is safe in ONE pass: a carrier's base_z is always below what it
      // carries (the support DAG's own topological potential, established by §STAGGER_SUPPORT_ORDER
      // above), so every true carrier of T has already been visited — and any correction already
      // applied to it — by the time T is processed.
      // §XRAY_WALL_SCOPE (found 2026-08-04, live in a real Hospital session — user report: proxy/
      // misc elements chronologically before columns, "2 trucks came on first! Then walls!"): this
      // predicate was even more permissive than the two sibling copies already fixed this session
      // (schedule_gate.js auditFloating(), time_machine.js _buildXraySupportCache) — ANY wall was a
      // candidate carrier for ANY element, no promoted-roof-slab restriction at all. A wall is only
      // ever a real candidate carrier for a slab itself promoted to the roof role (seq>4) — same
      // §4D_ROOF_LOAD_PATH M3 restriction, applied here for the third time this session. Structure
      // (seq<=4) stays an unconditional carrier candidate for everything — only the wall branch is
      // now gated on the TARGET being a promoted slab.
      var _ogCELL = (typeof ScheduleGate !== 'undefined' && ScheduleGate.CELL) || 4;
      var _ogEPS = 0.05, _ogGAP = 0.5;
      // §OG_HANG_BAND (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
      // §HOSPITAL_LIGHTING_STILL_FLOATING — captured-path repair vs judge parity, same doctrine as
      // §4D_LAYER_TRUTH/§GROUNDED_OVERRIDE_FIX/§OG_BEARING_BOUND: guard and judge must share one
      // physics). _contactGraph's hang/carrier-above relation (the JUDGE _midairAudit reads) has NO
      // upper Z bound by design — measured+kept in §DAY_GAP_TAIL (bounding IT strands elements as
      // orphans, 3-40x blowup, rejected on its own numbers). But _ogSupportSweep's OWN hang-repair
      // query below reused the tight bearing tolerance (_ogGAP=0.5m, meant for near-zero physical
      // touching gaps) as its search radius too — so it could only ever REPAIR a hang relation whose
      // carrier's underside sits within 0.5m of the target's top, while the judge (correctly) accepts
      // real carrier-above relations much further away (a ceiling-hung/embedded item's true structural
      // carrier is routinely several metres up through a void). MEASURED on Hospital's still-floating
      // IfcBuildingElementProxy population (post-repair, hang-classified, 821 elements): the real
      // carrier the judge picks sits p25=1.05m p50=2.00m p90=3.75m max=10.62m above the target —
      // 812/821 (99%) within 9.5m — the SAME band this codebase already measured and cited once before
      // for the identical relation (§HANG_NEAREST, "0.5-9.5m, Hospital ducts p50 1.22m") — reused here,
      // not re-guessed. Unlike the rejected judge-side bound, widening the REPAIR's search radius can
      // only ever find MORE of what the judge already accepts as real — it cannot create a single new
      // orphan (orphan/grounded counts come from _contactGraph alone, untouched by this function).
      // §OG_HANG_UNBOUND (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
      // §CARRIER_DEDUP_DERISK_STUDY): the flat 9.5m band above was itself a mismatch — both the
      // judge (_contactGraph) and the generative path's own hangGate() are unbounded above (a real
      // carrier can sit any distance up through a void); "9.5m" was only ever a MEASURED empirical
      // range on the buildings checked, never hangGate's actual enforced radius, so this repair was
      // still missing real carriers further away. §OG_HANG_WINDOW_BOUND (shipped same day) already
      // refuses any push that would exit the target's own Gantt task window regardless of distance,
      // so a distance cap on the SEARCH itself no longer earns its keep as a safety net — it only
      // hides real carriers now. Restructured to mirror hangGate's own two-tier shape exactly
      // (schedule_gate.js hangGate(), §HANG_NEAREST): tier 1 is the tight direct-mount band (±GAP,
      // the ORIGINAL pre-§OG_HANG_BAND behavior); tier 2, only when tier 1 finds nothing, is an
      // unbounded nearest-plane search — find the closest real carrier above, then take the latest
      // finish among carriers co-planar with it, the identical two-step hangGate's own fallback
      // uses. Not BIG-only (unlike hangGate's fallback) — that restriction exists there to bound
      // cost on the FULL generative pass; this repair only ever runs on the much smaller
      // already-scheduled/still-floating population.
      var _ogMaxTz = 0;
      _allScheduled.forEach(function (e) { if (e.tz > _ogMaxTz) _ogMaxTz = e.tz; });
      var _ogCellsQueryTopFar = function (e) { return _ogCellsFor(e.x0, e.x1, e.y0, e.y1, e.tz + _ogEPS, _ogMaxTz); };
      // §OG_GRID_Z_BAND (2026-08-05, measured not guessed — 4D_SCHEDULE_PERFECTION.md §Open Decisions
      // named this block "NOT yet measured, prime suspect"). The grid used to bucket by XY only, so
      // a small-footprint TALL building stacks every floor's structural elements into the SAME cell —
      // measured 4636ms on Terminal's 48,428 elements (22 stacked storeys, small footprint, worst
      // cell 379 members) vs 1695ms on Hospital's 63,415 (more elements, but a bigger footprint means
      // less Z-stacking per cell) — element COUNT alone doesn't predict the cost, per-cell Z-density
      // does. Bucketing Z too prunes each query to the target's own real vertical neighborhood — the
      // ONLY z-range `S.bz<T.bz-EPS && |S.tz-T.bz|<=GAP` can ever match — with the identical predicate
      // inside the loop unchanged, so results are provably identical, only the scan is smaller.
      var _ogCellsFor = function (x0, x1, y0, y1, z0, z1) {
        var out = [];
        for (var cx = Math.floor(x0 / _ogCELL); cx <= Math.floor(x1 / _ogCELL); cx++)
          for (var cy = Math.floor(y0 / _ogCELL); cy <= Math.floor(y1 / _ogCELL); cy++)
            for (var cz = Math.floor(z0 / _ogCELL); cz <= Math.floor(z1 / _ogCELL); cz++)
              out.push(cx + '|' + cy + '|' + cz);
        return out;
      };
      // Build-time: bucket a candidate under its OWN full vertical extent, so it registers in every
      // z-cell it actually occupies (a tall candidate can span more than one).
      var _ogCellsBuild = function (e) { return _ogCellsFor(e.x0, e.x1, e.y0, e.y1, e.bz, e.tz); };
      // Query-time: only a target's real z-neighborhood [T.bz-GAP, T.bz+GAP] can ever satisfy the
      // |S.tz-T.bz|<=GAP predicate — querying anything wider would waste the pruning this exists for.
      var _ogCellsQuery = function (e) { return _ogCellsFor(e.x0, e.x1, e.y0, e.y1, e.bz - _ogGAP, e.bz + _ogGAP); };
      var _ogXY = function (a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; };
      var _ogStructGrid = {}, _ogWallGrid = {};
      _allScheduled.forEach(function (e) {
        // §PROMOTED_CARRIER_POOL (2026-08-11): pool aligned with auditFloating's — seq<=4 ∪
        // promoted slabs (see _buildXraySupportCache for the full finding-A note; guard and judge
        // MUST stay one physics or §XRAY_EDGES staged>0 comes back).
        if (e.seq <= 4 || (e.cls === 'IfcSlab' && e.seq > 4)) _ogCellsBuild(e).forEach(function (c) { (_ogStructGrid[c] = _ogStructGrid[c] || []).push(e); });
        else if (e.cls.indexOf('IfcWall') === 0) _ogCellsBuild(e).forEach(function (c) { (_ogWallGrid[c] = _ogWallGrid[c] || []).push(e); });
      });
      _allScheduled.sort(function (a, b) { return a.bz - b.bz; });
      // §4D_LAYER_TRUTH (2026-08-07): the single ascending-bz pass was measured leaving 25 staged
      // violations (witness_4d_layer_truth.js, Hospital) for the SAME two reasons §DEQ_REPAIR exists
      // in schedule_gate.js: (a) pushing a carrier later never re-checks dependents already visited
      // (bz order guarantees carriers-first only for bearing-below, and a push can still ripple
      // forward), and (b) the predicate was hang-blind — a fan's carrier (roof above) has HIGHER bz,
      // so ordering can't help it at all. Same fix as the engine layer: bearing-below OR (no bearing)
      // hang-carrier, swept to fixpoint (≤16, monotone pushes, acyclic relation).
      // Hang lookup queries the target's TOP z-neighborhood (carrier underside within ±GAP of T.tz,
      // carrier top strictly above T.tz — the same antisymmetric predicate as schedule_gate.js).
      var _ogCellsQueryTop = function (e) { return _ogCellsFor(e.x0, e.x1, e.y0, e.y1, e.tz - _ogGAP, e.tz + _ogGAP); };
      var _ogPushed = 0, _ogSweeps = 0;
      for (; _ogSweeps < 16; _ogSweeps++) {
        var _ogMoved = 0;
        _allScheduled.forEach(function (T) {
          var promotedSlab = (T.cls === 'IfcSlab' && T.seq > 4);
          var cells = _ogCellsQuery(T), seen = {}, lastEnd = 0, hasBearing = false;
          // §OG_BEARING_BOUND (2026-08-11, Part 2 Option C — bim-compiler
          // prompts/4D_SCHEDULE_PERFECTION.md closure pass. Witness:
          // witness_og_guard_bearing_bound.js + witness_gantt_og_grid_perf.js):
          // the bearing test was unbounded ABOVE — a full-height column/wall registered as carrying
          // every element at every level inside its footprint, so each of those elements was pushed
          // to the END of the whole enveloping carrier (over-conservative; the STUDY's verified
          // bug). Two-tier fix, mirroring the DAG's own wallCarries lesson ("a wall carries a slab
          // AT ITS TOP, never one embedded metres below its crown", generalized to my own span):
          //   tier 1 — carriers whose top lies within MY OWN extent (+GAP) define my bearing plane;
          //   tier 2 — ENVELOPING carriers (top above T.tz+GAP) are still DETECTED (hasBearing —
          //            §4D_LAYER_TRUTH's 25-staged lesson: never narrower than the audits) but only
          //            GATE me when no tier-1 carrier exists (a beam framing into a full-height
          //            mast keeps its real support; it just stops waiting for the mast's crown when
          //            a storey-level carrier is present).
          // _buildXraySupportCache applies the IDENTICAL two-tier rule — guard and judge stay one
          // physics, which is what keeps §XRAY_EDGES staged=0 (the 2026-08-07 alignment invariant).
          var _ogTopBound = T.tz + _ogGAP, envEnd = 0;
          for (var ci = 0; ci < cells.length; ci++) {
            var arr = _ogStructGrid[cells[ci]];
            if (arr) for (var si = 0; si < arr.length; si++) {
              var S = arr[si];
              if (S.guid === T.guid || seen[S.guid]) continue; seen[S.guid] = 1;
              // §4D_LAYER_TRUTH: detection ALIGNED with auditFloating()/_buildXraySupportCache —
              // carrier top REACHES my base (>= T.bz-GAP; a tall column a beam frames into still
              // counts). §OG_BEARING_BOUND above splits gating into the two tiers.
              if (S.bz < T.bz - _ogEPS && S.tz >= T.bz - _ogGAP && _ogXY(S, T)) {
                hasBearing = true;
                if (S.tz <= _ogTopBound) { if (S.e > lastEnd) lastEnd = S.e; }
                else if (S.e > envEnd) envEnd = S.e; }
            }
            if (!promotedSlab) continue;
            arr = _ogWallGrid[cells[ci]];
            if (arr) for (var wi = 0; wi < arr.length; wi++) {
              var W = arr[wi];
              if (W.guid === T.guid || seen[W.guid]) continue; seen[W.guid] = 1;
              if (W.bz < T.bz - _ogEPS && W.tz >= T.bz - _ogGAP && _ogXY(W, T)) {
                hasBearing = true;
                if (W.tz <= _ogTopBound) { if (W.e > lastEnd) lastEnd = W.e; }
                else if (W.e > envEnd) envEnd = W.e; }
            }
          }
          if (!lastEnd && envEnd) lastEnd = envEnd;   // tier 2 binds only with zero tier-1 carriers
          var _ogFromHang = false;
          if (!hasBearing && T.seq > 4) {          // hangs — gate on the carrier above instead
            var hcells = _ogCellsQueryTop(T), hseen = {};
            for (var hi = 0; hi < hcells.length; hi++) {
              var harr = _ogStructGrid[hcells[hi]];
              if (harr) for (var hj = 0; hj < harr.length; hj++) {
                var H = harr[hj];
                if (H.guid === T.guid || hseen[H.guid]) continue; hseen[H.guid] = 1;
                if (H.bz >= T.tz - _ogGAP && H.bz <= T.tz + _ogGAP && H.tz > T.tz + _ogEPS &&
                    _ogXY(H, T) && H.e > lastEnd) { lastEnd = H.e; _ogFromHang = true; }
              }
            }
            // §OG_HANG_UNBOUND tier 2 — only when the direct-mount band above found nothing.
            // Same two-step shape as hangGate's §HANG_NEAREST fallback: find the nearest real
            // carrier plane above (unbounded reach), then take the latest finish among carriers
            // co-planar with THAT plane (within GAP of it) — not just the single nearest element.
            if (!_ogFromHang) {
              var fcells = _ogCellsQueryTopFar(T), nb = Infinity;
              for (var fi = 0; fi < fcells.length; fi++) {
                var farr = _ogStructGrid[fcells[fi]];
                if (farr) for (var fj = 0; fj < farr.length; fj++) {
                  var F = farr[fj];
                  if (F.guid === T.guid) continue;
                  if (F.bz > T.tz + _ogGAP && F.bz < nb && _ogXY(F, T)) nb = F.bz;
                }
              }
              if (nb < Infinity) {
                for (var fi2 = 0; fi2 < fcells.length; fi2++) {
                  var farr2 = _ogStructGrid[fcells[fi2]];
                  if (farr2) for (var fj2 = 0; fj2 < farr2.length; fj2++) {
                    var F2 = farr2[fj2];
                    if (F2.guid === T.guid) continue;
                    if (F2.bz > T.tz + _ogGAP && F2.bz <= nb + _ogGAP && _ogXY(F2, T) && F2.e > lastEnd) {
                      lastEnd = F2.e; _ogFromHang = true;
                    }
                  }
                }
              }
            }
          }
          if (lastEnd && T.s < lastEnd) {
            var dur = Math.max(60000, T.e - T.s);
            // §OG_HANG_WINDOW_BOUND (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
            // §GANTT_WINDOW_FIDELITY_AND_SPREAD): §OG_HANG_BAND's widened 9.5m hang radius can now
            // reach a real carrier far enough away that the honest push would land the target OUTSIDE
            // its own authored task window — measured on LTU_AHouse: 526 elements, overshoot up to
            // 79.1 days (was 16 elements, max 0.8d, before the widened radius). The ORIGINAL 0.5m
            // bearing push never did this on any measured building — bearing pushes stay unbounded,
            // unchanged. Per the user's own ruling ("if it is not in that single source of truth, it
            // does not happen, yet"), a hang-repair that would violate the window does not apply —
            // the element stays honestly floating (as it was before §OG_HANG_BAND) rather than being
            // pushed to a fabricated, window-compliant-looking date that isn't the real dependency.
            var _ogW = taskWin && taskWin[T.task];
            if (_ogFromHang && _ogW && lastEnd + 1 + dur > _ogW.e) {
              // real carrier sits outside this task's window — no push, no invented substitute date
            } else {
              T.s = lastEnd + 1;
              T.e = T.s + dur;
              _ogPushed++; _ogMoved++;
            }
          }
        });
        if (!_ogMoved) break;
      }
      return { pushed: _ogPushed, sweeps: _ogSweeps };
  }

  // ══ §CROSSTASK_JUDGE_PARITY (2026-08-16, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md) ══════
  // Runs AFTER _ogSupportSweep on the captured path. Closes the judge/repair mismatch that stranded
  // 3090 elements floating across the 7 shipped buildings: the judge (_contactGraph/_midairAudit,
  // the 🔓→🔒 lock rule) is class-blind and pool-blind, but _ogSupportSweep can only ever push past
  // its NARROW carrier pool (seq<=4 ∪ promoted slabs, walls for promoted slabs) — so an element
  // whose only real contacts live outside that pool (a fitting on a proxy, a tread on a stringer —
  // the exact §MIDAIR_REPAIR (a)-population) is flagged floating forever and repaired never.
  // This pass is §MIDAIR_REPAIR's already-shipped weakest rule — AN ELEMENT MAY NOT APPEAR BEFORE
  // THE FIRST ELEMENT IT PHYSICALLY TOUCHES APPEARS — applied to the captured timeline WITH the
  // §OG_HANG_WINDOW_BOUND discipline the rejected 2026-08-13 _midairRepair swap lacked (its failure
  // was exactly window-crossing desync, 100-300d): a push lands ONLY when the element's whole
  // rescheduled span stays inside its OWN task's authored window; an element already outside its
  // window is never pushed further out; anything else stays honestly floating (WINDOW_BLOCKED —
  // a real task-authoring conflict, §CPM_GENERATOR_UPSTREAM_SPEC's territory, never papered over).
  // Monotone-later pushes reusing existing start values, fixpoint-swept, bounded — same
  // termination argument as _midairRepair's own. MEASURED (probe_captured_floating.js §EXP4, all 7
  // buildings, 2026-08-16): floating 3090 -> 656 (-78.8%), window fidelity byte-identical on every
  // building, orphans/grounded untouched (the judge itself is never modified here).
  // §CJP_DAY_ROUNDING_TOL (2026-08-16, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md thread 2,
  // §CJP_DECOMP_EXP8 measurement) — a task window's own end (taskWin[t].e) is ALREADY rounded to a
  // whole day (materializeZones: `Math.round((z.end-minStart)/86400000)`), but the WINDOW_BLOCKED
  // check below compared it against an element's exact-millisecond real end with zero tolerance.
  // MEASURED per-task decomposition on 3 buildings: Clinic 82/91 (90%) of its residual floating had
  // avgGapDays <1 (TASK_Substructure_First_Floor alone: n=38, avgGapDays=0.1, on a 4-day window) —
  // a sub-day rounding artifact against the window's own quantum, not a real authoring conflict.
  // Fix: the window's rounded end already means "through the end of that calendar day" — allow a
  // push whose result lands within that same day, exactly the quantum the window itself was rounded
  // to (not an invented fudge factor). Genuinely-undersized windows (gaps of many days, e.g.
  // Hospital's TASK_Superstructure_Level_2, avgGapDays=52 on an 11-day window) are UNCHANGED — still
  // correctly WINDOW_BLOCKED, one day of slack cannot paper over a real conflict.
  function _cjpJudgeParity(items, taskWin) {
    var _CJP_DAY_TOL = 86400000;
    var _t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var G = _contactGraph(items);
    if (!G.ok) return { pushed: 0, sweeps: 0, ok: false };
    var pushed = 0, sweeps = 0, maxShift = 0;
    for (; sweeps < 16; sweeps++) {
      var moved = 0;
      for (var i = 0; i < items.length; i++) {
        var list = G.contacts[i]; if (!list) continue;
        var T = items[i];
        var first = Infinity;
        for (var k = 0; k < list.length; k++) { var s = items[list[k]].s; if (s < first) first = s; }
        if (first <= T.s + 1) continue;                    // not floating
        var w = taskWin && taskWin[T.task]; if (!w) continue;
        if (T.s < w.s || T.e > w.e) continue;              // already out of window — never worsen
        var dur = Math.max(60000, T.e - T.s);
        if (first + dur > w.e + _CJP_DAY_TOL) continue;     // WINDOW_BLOCKED — honest floating
        var d = first - T.s;
        T.s = first; T.e = T.s + dur;
        pushed++; moved++; if (d > maxShift) maxShift = d;
      }
      if (!moved) break;
    }
    // §CJP_LIVE_CENSUS (2026-08-16): the user-facing truth this pass leaves behind, computed from
    // the SAME contact graph (no extra scan) — without this line a live session cannot say how much
    // floating actually remains (the 2026-08-16 "still lots of floating" report had no number).
    var floating = 0, blocked = 0;
    for (var ci = 0; ci < items.length; ci++) {
      var cl = G.contacts[ci]; if (!cl) continue;
      var Tc = items[ci], cf = Infinity;
      for (var ck = 0; ck < cl.length; ck++) { var cs = items[cl[ck]].s; if (cs < cf) cf = cs; }
      if (cf > Tc.s + 1) {
        floating++;
        var cw = taskWin && taskWin[Tc.task];
        if (cw && cf + Math.max(60000, Tc.e - Tc.s) > cw.e + _CJP_DAY_TOL) blocked++;
      }
    }
    return { pushed: pushed, sweeps: sweeps, floating: floating, windowBlocked: blocked,
      // §S58: maxShift and the elapsed ms were log-only locals before the extraction; both are
      // RETURNED now so the time_machine.js wrapper prints the identical § line. Additive only.
      maxShiftMs: maxShift, ok: true,
      ms: Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - _t0) };
  }

  // ══ §MIDAIR_REPAIR (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md) ══════════════
  // The acceptance bar, user's own words: "all i want is not to see a single item hanging in
  // midair that is all" — and "no band aid fix, just generalised solution."
  //
  // WHY the existing proof trail could not deliver that. ScheduleGate.auditFloating counts an
  // element as floating only when a support it KNOWS ABOUT finishes after that element starts, and
  // the pools it knows about are narrow: structGrid = seq<=4 plus promoted slabs, wallGrid = walls.
  // So two populations are invisible to it, and both are exactly what an eye sees as hanging:
  //   (a) an element whose only real neighbours are outside those pools (a post on a curtain-wall
  //       plate, a fitting on a proxy, a stair tread on a stringer) — auditFloating finds no
  //       candidate at all, records `se=0`, and reports it clean;
  //   (b) a seq<=4 structure-pool member — never support-checked in EITHER direction (the gates in
  //       schedule_gate.js all run in placeNonst). MEASURED live report: HHS's stair flights are
  //       authored as IfcSlab, so seq=4, so no gate ever ran — 2 of them appeared on day 1.5 with
  //       their first real neighbour on day 8.5, and 2 more on day 9.6 against day 49.7. That is
  //       the "stairs hanging in midair" the user watched, and it needed no temporary-works excuse.
  // MEASURED, before this function existed (probe_midair_census.js, DISPLAY timeline, all 7 shipped
  // buildings): Terminal 161, Hospital 165, Duplex 19, HHS 156, Clinic 345, LTU_AHouse 4605, JKR 110
  // elements appear with NOTHING they touch yet visible — 5,561 total, while auditFloating reported
  // its usual locked baselines. This is the gap between "the witnesses pass" and "the movie is right".
  //
  // THE RULE, stated once, class-blind and pool-blind: AN ELEMENT MAY NOT APPEAR BEFORE THE FIRST
  // ELEMENT IT PHYSICALLY TOUCHES APPEARS. Contact is the union of the three relations the shipped
  // gates already model, applied without any class or pool filter — bearing-below (I rest on S),
  // carrier-above (I hang from S), embedded (S spans my whole height at my XY). Exempt: an element
  // that IS the ground layer of its own footprint (nothing overlapping it starts lower) — it rests
  // on unmodelled soil, the same exemption auditFloating's §SUPPORT_UNCHECKED 1c already carries.
  //
  // WHY IT IS SAFE, not another reshaping. It is the WEAKEST rule that closes the gap: FIRST (min)
  // contact, not last (max) — so it fires only for an element whose EVERY neighbour is still
  // invisible, and cannot re-time the 99% that already sit on something. It only ever moves an
  // element LATER (monotonicity, the property §TIER_SERIAL W-TS-3 depends on, is preserved by
  // construction). It terminates: every raise sets a start to some other element's CURRENT start,
  // so the global maximum start never grows, and the sweep is capped besides.
  // It runs on the DISPLAY timeline, after _twoTierRemap, because that is the last layer before
  // kernel_ops — a repair in the generative layer would be undone by the Tier-2 shift moving a
  // carrier out from under its consumer.
  //
  // TIER-1 SERIALIZATION LOSES TO SUPPORT ORDER, and that is the established doctrine here, not a
  // new licence: §TIER_DAG_WINS already accepts backbone elements crossing a phase window when the
  // support DAG forces it ("counted, never hidden"). t1Moved reports the same population for this
  // rule. Physics beats phase tidiness — an element cannot exist before what holds it.
  //
  // ORPHANS ARE REPORTED, NEVER MOVED: an element that touches nothing anywhere in the model has no
  // schedule that can fix it (it hangs at every instant, including the last frame). That is an
  // extraction/authoring fact — measured 972 across the 7 buildings — and it is logged for exactly
  // the same reason §SUPPORT_UNCHECKED is: so a data limit is never mistaken for a scheduling bug.
  // _contactGraph(items) — the one place the physical world is derived. Both the repair below and
  // the LOCK-GATE audit (_midairAudit → verifyGanttIntegrity) build on this single definition, so a
  // planner's own edit is judged by exactly the rule the generator enforced. items need bbox
  // (x0,x1,y0,y1,bz,tz) only — times are read later, never here: geometry does not move.
  // Returns { contacts: [idx[]|null], grounded: Uint8Array, orphans, groundedN, ok }.
  function _contactGraph(items) {
    var SG = (typeof ScheduleGate !== 'undefined') ? ScheduleGate : null;
    if (!SG || !SG.CELL) return { ok: false, contacts: null, grounded: null, orphans: 0, groundedN: 0 };
    var CELL = SG.CELL, EPS = SG.EPS, GAP = SG.GAP;   // the shipped constants, never re-typed here
    var n = items.length, i, j, k, c, S, T, arr, cs;
    var grid = {};
    function cellsOf(e) {
      var o = [], a, b;
      for (a = Math.floor(e.x0 / CELL); a <= Math.floor(e.x1 / CELL); a++)
        for (b = Math.floor(e.y0 / CELL); b <= Math.floor(e.y1 / CELL); b++) o.push(a + ',' + b);
      return o;
    }
    for (i = 0; i < n; i++) { cs = cellsOf(items[i]); for (c = 0; c < cs.length; c++) (grid[cs[c]] || (grid[cs[c]] = [])).push(i); }
    var contacts = new Array(n), grounded = new Uint8Array(n), stamp = new Int32Array(n);
    var orphans = 0, groundedN = 0;
    for (i = 0; i < n; i++) {
      T = items[i]; cs = cellsOf(T);
      var lowest = Infinity, list = null;
      for (c = 0; c < cs.length; c++) {
        arr = grid[cs[c]]; if (!arr) continue;
        for (k = 0; k < arr.length; k++) {
          j = arr[k]; if (j === i || stamp[j] === i + 1) continue;
          S = items[j];
          if (!(S.x0 <= T.x1 && S.x1 >= T.x0 && S.y0 <= T.y1 && S.y1 >= T.y0)) continue;
          stamp[j] = i + 1;
          if (S.bz < lowest) lowest = S.bz;
          if ((S.bz < T.bz - EPS && S.tz >= T.bz - GAP) ||        // bearing below — I rest on S
              (S.bz >= T.tz - GAP && S.tz > T.tz + EPS) ||        // carrier above — I hang from S
              (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS)) {       // embedded — S spans my height
            (list || (list = [])).push(j);
          }
        }
      }
      grounded[i] = (lowest < T.bz - GAP) ? 0 : 1;                // 1 ⇒ I am my footprint's ground layer
      contacts[i] = list;
      if (grounded[i]) groundedN++; else if (!list) orphans++;
    }
    return { ok: true, contacts: contacts, grounded: grounded, orphans: orphans, groundedN: groundedN };
  }

  // _designatedSupport(items, G) — mirrors cpm_schedule.js's designatedSupport EXACTLY (same
  // formula, same preference order, same grounded-narrowing) — kept as a second copy under the
  // same §CPM_PARITY drift-prevention discipline as _contactGraph above (probe_cpm_schedule.js
  // now also diffs this pair contact-for-contact; a diverging edit here fails that witness loudly
  // instead of silently). See cpm_schedule.js's own §GROUNDED_NEVER_HANGS comment for the full
  // reasoning — summary: bearing-below (nearest below), else embedded, else carrier-above ONLY
  // when the element is not grounded (a genuine close support, even under the coarse `grounded`
  // threshold, always wins over the grounded exemption — §GROUNDED_OVERRIDE_FIX precedent).
  function _designatedSupport(items, G) {
    var SG = (typeof ScheduleGate !== 'undefined') ? ScheduleGate : null;
    var EPS = SG.EPS, GAP = SG.GAP;
    var n = items.length, out = new Int32Array(n);
    for (var i = 0; i < n; i++) {
      out[i] = -1;
      var list = G.contacts[i]; if (!list) continue;
      // §S26.2 (2026-08-19) — STRUCTURE FIRST, contact only as a last resort. The election used to
      // take any lower touching box, so an IfcFlowSegment under a wall "bore" that wall: a CONTACT,
      // not a precedence, and those edges are what contradict phase order (Duplex: 761 physics-vs-
      // phase contradictions vs 1 when supports are restricted to load-bearing classes).
      // Electing ONLY from the pool was measured FIRST and is wrong: an element whose every contact
      // is non-pool then gets no support at all, starts at day 0, and appears before the thing it
      // touches — W-MZ-2 went 0 -> 2,781 on LTU, 0 -> 107 on Hospital. So the same classification
      // elects TWICE: the pool winner when one exists, else the unrestricted winner. Nothing loses
      // its support edge; a real structural support simply outranks a pipe.
      var T = items[i], bestJ = -1, bestCls = 9, bestScore = Infinity;
      var poolJ = -1, poolCls = 9, poolScore = Infinity;
      var inPool = SG.supportPool || function () { return true; };
      for (var k = 0; k < list.length; k++) {
        var j = list[k], S = items[j], cls, score;
        if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP) { cls = 0; score = -S.tz; }
        else if (S.bz <= T.bz + EPS && S.tz >= T.tz - EPS) { cls = 1; score = Math.abs(S.bz - T.bz); }
        else { cls = 2; score = S.bz; }
        if (cls < bestCls || (cls === bestCls && (score < bestScore ||
            (score === bestScore && (bestJ < 0 || String(S.guid) < String(items[bestJ].guid)))))) {
          bestCls = cls; bestScore = score; bestJ = j;
        }
        if (inPool(S) && (cls < poolCls || (cls === poolCls && (score < poolScore ||
            (score === poolScore && (poolJ < 0 || String(S.guid) < String(items[poolJ].guid))))))) {
          poolCls = cls; poolScore = score; poolJ = j;
        }
      }
      if (poolJ >= 0) { bestJ = poolJ; bestCls = poolCls; }   // §S26.2 structure outranks contact
      if (bestCls === 2 && G.grounded[i]) continue;
      out[i] = bestJ;
    }
    return out;
  }

  // _midairAudit(items) — the JUDGE, same graph, no mutation: how many elements appear before what
  // they actually DEPEND ON appears. Used by verifyGanttIntegrity (the 🔓→🔒 lock gate) so a
  // dragged bar that re-creates a hanging is REFUSED, not silently accepted — auditFloating alone
  // cannot see this population (that is the whole §MIDAIR_REPAIR finding).
  //
  // §MIDAIR_DIRECTIONAL (2026-08-18, 4D_GANTT_TM_REFACTOR.md) — REPLACES the old symmetric check
  // ("does my EARLIEST contact of ANY kind start after me"), which false-flagged a correctly-
  // grounded element the moment designatedSupport()-style logic stopped forcing it to share a
  // start with whatever's built on top of it (that forcing bug is what accidentally kept this one
  // masked until now). Directional: uses _designatedSupport()'s own real-dependency result — an
  // element with nothing it actually depends on (des=-1, grounded or a genuine orphan) can never
  // be floating, no matter what starts later nearby. This does NOT reintroduce the
  // §GROUNDED_OVERRIDE_FIX (2026-08-13) mistake: that fix rejected skipping the audit whenever
  // `grounded[i]` was set, because the coarse grounded threshold can be true even when a genuine
  // close support exists (verified: scripts/probe_e3_synthetic.js CASE7) — this check still finds
  // and uses that real support via _designatedSupport()'s own narrowing, it just no longer treats
  // "something built on top of me, which depends on ME" as a thing I should be waiting for.
  // ⛔ OPEN — ref: bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S58.5 (already tracked there; this
  // is the code-side pointer, not a second record). That item asks: "measure whether the two judges
  // still agree per element, or only in aggregate." MEASURED 2026-08-22 during the §S58 extraction,
  // and the answer is worse than aggregate-only agreement: weakening THIS judge by 86,400,000x
  // (the `items[sIdx].s > items[i].s + 1` threshold raised to + 86400000) produces ZERO failures
  // across witness_midair_zero, witness_hosted_before_host, witness_kernel_ops_sched_version and
  // witness_curtain_wall_opening. witness_midair_zero locks midair with its OWN census() (see the
  // matching note there), which mirrors _contactGraph's symmetric carrier clause and did NOT follow
  // this judge when #1435 made it directional. So the function that names the lane's core metric
  // has no test that goes red when it breaks. Do not "fix" that by deleting census() — it is a
  // deliberate independent judge; the open question is whether the two still describe one physics.
  function _midairAudit(items) {
    var out = { midair: 0, orphans: 0, guids: [], ok: true };
    if (!items || !items.length) return out;
    var G = _contactGraph(items);
    if (!G.ok) return out;
    out.orphans = G.orphans;
    var des = _designatedSupport(items, G);
    for (var i = 0; i < items.length; i++) {
      var sIdx = des[i]; if (sIdx < 0) continue;
      if (items[sIdx].s > items[i].s + 1) { out.midair++; if (out.guids.length < 20) out.guids.push(items[i].guid); }
    }
    out.ok = out.midair === 0;
    return out;
  }

      function _capWindowRescale(_allScheduled, _win) {
      var _GANTT_GAP_CLAMP_K = 500;
      var _taskItems = {}, _taskSpan = {};
      _allScheduled.forEach(function (item) {
        (_taskItems[item.task] = _taskItems[item.task] || []).push(item);
        var sp = _taskSpan[item.task] || (_taskSpan[item.task] = { min: Infinity, max: -Infinity });
        if (item.s < sp.min) sp.min = item.s;
        if (item.e > sp.max) sp.max = item.e;
      });
      // §CAP_RESCALE_IDENTITY (2026-08-16, bim-compiler prompts/4D_SCHEDULE_ARCHITECTURE_REDESIGN.md
      // §STAGE4_RETIREMENT_PROPOSAL step 1): a window authored FROM these same element times
      // (§ZONE_DISPLAY_AUTHORING / §CPM_DISPLAY) is a VIEW of the schedule, not a second schedule —
      // re-spacing inside it can only damage the contact order it was derived from (measured,
      // probe_cpm_display_path.js on Terminal: rescale alone turned a 0-floating CPM timeline into
      // 4,712 violations). A task is IDENTITY when its window equals its elements' own envelope
      // within the window's OWN day-rounding quantum (the same derived bound §CJP_DAY_ROUNDING_TOL
      // uses) — skipped, times replay verbatim. A bar a planner actually moved/resized fails the
      // guard and still rescales, so Gantt edits keep reaching the movie.
      // The guard compares DURATIONS, not absolute ms — kernel_ops element times and the tasks
      // table's calendar dates live in different time origins (the rescale is also the re-basing
      // step), so an absolute-ms compare never matches in the browser (measured live: 0/72).
      // An identity task is re-based with a pure per-task AFFINE map (anchor to w.s, scale by
      // durFactor≈1) — the element ORDER and relative spacing survive byte-exact, which is the
      // whole point; only a bar a planner actually RESIZED (duration changed >1 day) still takes
      // the gap-clamp re-spacing below.
      var _identD = 86400000, _identSkipped = 0, _identRescaled = 0;
      Object.keys(_taskItems).forEach(function (tid) {
        var arr = _taskItems[tid];
        var w = _win[tid];
        var sp = _taskSpan[tid];
        // identity = the window is the HEAD of its own element span: same start within the 2-day
        // floor/ceil quantum (§ZONE_ENVELOPE_DAYS), and no wider than the span needs. The span may
        // legitimately OVERHANG the window (§ZONE_WINDOW_DAGWINS_CLIP: a dag-wins straggler rides
        // OUTSIDE its bar and is never squeezed back in — squeezing is what manufactured 4,712
        // violations from a 0-floating timeline). Identity tasks take a RIGID SHIFT only (<=2d
        // day-rounding), order and spacing byte-exact. A bar a planner moved (start off by >2d) or
        // widened past its own span still takes the full rescale below.
        // action for an identity task: NOTHING — replay verbatim. Even a rigid per-task shift is
        // poison here (measured: sub-2-day differential shifts across tasks broke 537 cross-task
        // contact pairs, 34 of them unrepairable because a straggler sits outside its own window).
        // The window is a floor/ceil VIEW of these exact times; there is nothing to move.
        if (w && Math.abs(w.s - sp.min) <= 2 * _identD && (w.e - w.s) <= (sp.max - sp.min) + 2 * _identD) {
          _identSkipped++;
          return;
        }
        _identRescaled++;
        var tSpan = Math.max(1, w.e - w.s);
        var lsSpan = Math.max(1, sp.max - sp.min);
        var durFactor = tSpan / lsSpan;      // unchanged duration-scaling ratio — real relative
                                              // install-time proportions preserved, never flattened
        arr.sort(function (a, b) { return a.s - b.s || (a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0); });
        var N = arr.length;
        var rawValGaps = new Array(N);
        rawValGaps[0] = (arr[0].s - sp.min) * durFactor;   // item[0]'s own value-based position
        for (var gi = 1; gi < N; gi++) rawValGaps[gi] = (arr[gi].s - arr[gi - 1].s) * durFactor;
        var target = 0;
        for (var ti = 0; ti < N; ti++) target += rawValGaps[ti];   // = the ORIGINAL formula's own
                                                                     // last-element position (relative
                                                                     // to w.s) — never tSpan directly
        var sortedGaps = rawValGaps.slice(1).sort(function (a, b) { return a - b; });
        var medGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 0;
        var cap = Math.max(medGap * _GANTT_GAP_CLAMP_K, 60000);
        var clampedGap = new Array(N);
        clampedGap[0] = rawValGaps[0];       // lead gap never clamped — outlier stat is about
                                              // inter-element spacing, not the task's own start offset
        var clampedSum = clampedGap[0];
        for (var ci = 1; ci < N; ci++) {
          clampedGap[ci] = Math.min(rawValGaps[ci], cap);
          clampedSum += clampedGap[ci];
        }
        // Redistribute EXACTLY what clamping removed (target - clampedSum) as an equal additive
        // pad — reduces to the identity (byte-identical to the pre-existing formula) whenever
        // nothing gets clamped, since target === clampedSum in that case.
        var pad = Math.max(0, target - clampedSum) / N;
        var cursor = w.s;
        for (var pi = 0; pi < N; pi++) {
          var item = arr[pi];
          var scaledDur = Math.max(60000, Math.floor(Math.max(0, item.e - item.s) * durFactor));
          cursor += clampedGap[pi] + pad;
          item.s = Math.floor(cursor);
          item.e = item.s + scaledDur;       // never zero/negative duration (floor already >=60000)
        }
      });
      // §S58: this was a console.log; the counts are RETURNED and the wrapper prints the same line.
      return { skipped: _identSkipped, rescaled: _identRescaled };
      }

  var API = {
    ogSupportSweep: _ogSupportSweep,
    cjpJudgeParity: _cjpJudgeParity,
    contactGraph: _contactGraph,
    designatedSupport: _designatedSupport,
    midairAudit: _midairAudit,
    capWindowRescale: _capWindowRescale
  };
  global.SupportSweep = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
