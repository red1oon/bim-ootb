/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * cpe_load_path.js — §129.1 LOAD PATH (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §129.1,
 * implementation notes §129.4 v2-v8). A geological section through the structure, one stack lit
 * hop by hop, held at topout. Non-invent: the support relation is SupportSweep's own
 * (support_sweep.js), the seq/phase classification is ScheduleAuthor's own (schedule_author.js /
 * rates.js), the restore hand-back is the storey-reveal leg's own (A._applyDiscVisibility +
 * window.__forceFull), the solid overlay is navigate_find.js's own overlay-mesh idiom
 * (_buildShapeMeshes). Nothing here re-derives any of those four.
 *
 * v2: PICK/hop-counting restricted to load-bearing classes with a labelled storey; non-structural
 * elements are walked THROUGH but not counted; the chain must terminate on a footing/pile or a
 * §GROUND_CONNECTED member.
 * v4: isolation is by MATERIAL (ghost the rest, uniformly, no per-container exemption); the chain
 * is drawn as standalone clone meshes (navigate_find.js's own `_buildShapeMeshes` technique) — solid
 * no longer depends on which shared container a hop happens to live in.
 * v5-v7: a camera CUT to a fitted pose (fit-to-target lift, then a witness-projection bisection) —
 * WITHDRAWN in v8.
 * v8 (2026-09-15, red1 sighting v7 + two amendments — see §129.4): the camera cut is GONE. The film's
 * own camera HOLDS exactly where it is (frozen at arm, re-asserted through the hold, never touched at
 * restore — the same v3/v4 mechanism, brought back). PICK is plain max-load-bearing-depth again (no
 * in-shot filter); instead the HOLD POINT itself is SEARCHED forward from topout for the first tNorm
 * where the whole building is ≥80% in frame (`_searchHoldPoint`, sampling the film's own
 * `plan.poseAt()` — no render). CUT returns in a narrower form: ONE clip plane, facing the camera,
 * placed just in front of the chain's own nearest face, applied ONLY to this beat's own ghost
 * material clones (never `A.sectionPlane`/the renderer's shared clipping array) — the rest of the
 * building beyond the plane stays ghosted and visible, proving v1's "everything hidden" defect is
 * gone (`beyondVisible>0`). FRAMING settled on PASS iff at least one hop intersects the frame.
 * Load-path (+ ledger + cost odometer) now gate under `--measure`, not a separate flag.
 *
 * ONE PURE BUILD, PER-FRAME APPLY, PER-FRAME 2D COMPOSITE, ONE DISPOSE — the same four-hook shape
 * cpe_flythru_cues.js already uses (A.flythruCuesBuild/ApplyVisual/CompositeOntoCanvas/Dispose), so
 * cinema_maxq.js's bake loop wires this exactly like its neighbours, not a fifth pattern.
 *
 * Witness lines: §LOADPATH_BUILD, §LOADPATH_SHOT, §LOADPATH_PICK, §LOADPATH_CHAIN,
 * §LOADPATH_VISIBLE, §LOADPATH_FRAMING, §LOADPATH_HOLD, §LOADPATH_RESTORE, §LOADPATH_WINDOW_SHIFT.
 * Control taps: window.__lpBreakSupport (CHAIN must FAIL), window.__lpSkipRestore (RESTORE must
 * FAIL), window.__lpHideRest (VISIBLE must FAIL), window.__lpFrameOff (FRAMING must FAIL),
 * window.__lpClipAll (VISIBLE must FAIL — post-v8b-hardening, the clip plane is pushed behind
 * every real ghost candidate on purpose, so `beyondVisible` correctly reads 0; the FAIL shows up as
 * `clipped`/`nearSideClipped` at their max instead, the same "everything hidden" degenerate state
 * this control exists to catch — this line only names which field used to carry it, not which does now).
 * No pixel evidence — every claim is a printed value, never a frame judgement.
 */
function setupCpeLoadPath(A) {
  'use strict';

  // §129.8 item 3 (2026-09-16) — TWO STACKS: FAR then NEAR back to back, 1s/visible-hop + 1s EACH,
  // TOTAL capped at 12s (was 8s for one stack) — also v8's own search-window width.
  var HOLD_CAP_SEC = 12;
  // §129.8 item 1 — SHINE-THROUGH is the default look; window.__lpLookGhost=1 reverts to the old
  // ghost+cut+backdrop-fade look (§129.7 items 6-7, §129.1 CUT) for an A/B.
  function _lookGhost() { return !!window.__lpLookGhost; }
  var SHINE_RENDER_ORDER = 100000;   // "renderOrder above everything" — the clone's own is 999 pre-129.8
  var SHINE_EMISSIVE_LIFT = 0.35;    // "solid rainbow with a slight emissive lift"
  var GLOW_SEC = 1.0;        // how long a hop's label stays "landing" before settling to its steady hue
  // §129.7 item 7 (2026-09-16, user: stack not discernible) — 0.12 -> 0.20 for THIS BEAT's ghost
  // clones only. Private module-scope const, never shared with the discipline parade's own ghost
  // look elsewhere, so raising it cannot touch that beat.
  var GHOST_OPACITY = 0.20;  // the rest of the scene's real opacity while the stack holds
  var SOLID_OPACITY = 1.0;   // layers whose turn has landed — printed on §LOADPATH_VISIBLE
  var BACKDROP_FADE_SEC = 1.0;   // §129.16 (2026-09-18, red1: "give the fade a full sec... same with
  // the fade back in") — was 0.5s (§129.7 item 6, "fade in and out" over ~0.5s of MOVING film);
  // doubled for a smoother user-perceived transition. §129.27 SUPERSEDES the "drives backdrop AND
  // cut/whiten" half of this: backdrop and cut/whiten are both instant now (§129.24/§129.27) — this
  // constant's only remaining live consumer is `A._loadPathFadeSecFor`, which HUD's own fade-in/out
  // (cinema_maxq.js `_hudFadeT`) still uses, capped the same `min(this, durSec/2)` way as always.
  // §129 (2026-09-17, red1: "concrete grey (better than white)") — the freeze's "concrete" treatment
  // target colour. Was pure white (0xffffff); every site that swaps a non-stack element's base colour
  // during the hold (the material clone, the cap plane, the per-slot instance-colour neutralize) reads
  // this ONE constant, so changing the look again later never needs a second edit pass.
  var CONCRETE_GREY_HEX = 0xb8b8b2;
  var SHOT_THRESHOLD = 0.80; // v8 HOLD-POINT SEARCH — red1's own "complete or 80% of building"
  var SHOT_SAMPLES = 24;     // search resolution across the window — real film-plan samples, no render
  // ROUND 17 (2026-09-16, Terminal_silent hang — deterministic, chrome pegged at 99%, no deadlock:
  // `_pickTwoStacks` ran the expensive raycast pass (`_scoreChain`/`_memberUnoccluded`) on EVERY
  // candidate `_pick` ever found, unfiltered — O(candidates x hops x samples x scene-mesh-count),
  // fully synchronous; a comment on ROUND 15 already logged HHS (a SMALL building) needing
  // raysCast=35158 for this exact pass, and Terminal's own candidate pool is much larger/denser) —
  // bounds that pass to the SCORE_TOP_N best candidates by a cheap (no-raycast) pre-rank
  // (`_rankAndCapForScoring`, just above `_pickTwoStacks`). House style for a "cap the pool" constant
  // is clash_labels.js's own `TOP_N=8` (nearest-pairs DISPLAY cap); this is a scoring-COST cap guarding
  // against silently dropping the genuine best candidate on a real building, hence the wider margin.
  // HHS/Hospital/LTU each have far fewer than SCORE_TOP_N valid candidates, so this never changes
  // their pick (`_rankAndCapForScoring` is a no-op whenever `valid.length <= SCORE_TOP_N`).
  var SCORE_TOP_N = 40;
  // ROUND 18 (2026-09-16, Terminal_silent STILL hangs after ROUND 17's SCORE_TOP_N cap — confirmed
  // via a TEMP diagnostic: scoredCount=40 correctly, yet Terminal's own `_raycastUniverse()` sums to
  // ~49,612 TOTAL INSTANCES across its BatchedMesh/InstancedMesh containers (universe=1310 OBJECTS,
  // each holding tens of thousands of internal instances three.js raycasts one-by-one with no
  // broad-phase acceleration) — the per-candidate raycast cost is driven by UNIVERSE SIZE, not
  // candidate count, so capping candidates alone was never enough. `RAYCAST_INSTANCE_BUDGET` gates
  // the whole `_scoreChain` raycast pass on that universe instance sum (see `_pickTwoStacks`).
  // Threshold: a real code comment (navigate_find.js's own `_LARGE_BUILDING_ELEM_THRESHOLD`,
  // measured against buildings/*_extracted.db elements_meta) puts HHS at 6,880 elements and Terminal
  // at 48,428 — closely tracking Terminal's own measured 49,612 raycast-universe instances, so
  // elements_meta count is a reasonable proxy for universe instance count. 20000 sits with margin
  // above HHS (6,880) and comfortably below Terminal (~49,612), the top of the 15000-20000 range the
  // spec suggested, for the most headroom on a legitimately large-but-tractable building.
  // CAVEAT (unverified, flag for the verifying session): that SAME comment puts Hospital's elements_meta
  // count at 63,415 — HIGHER than Terminal's 48,428 — which, if Hospital's real hold-arm raycast
  // universe scales anywhere near its element count, could ALSO exceed this budget and trip the new
  // fallback on Hospital (undesired — Hospital is expected to stay on the real occlusion-scored path).
  // No Hospital §LOADPATH_PICK bake log exists yet in this worktree to confirm either way; the first
  // real Hospital bake after this change should check its own `universe=`/would-be totalInstances
  // before trusting this constant.
  var RAYCAST_INSTANCE_BUDGET = 20000;

  // v2 PICK — load-bearing classes only, read from THIS DB's own elements_meta values (never a
  // per-building list: the same fixed six/seven names apply to every building; what varies is only
  // which of them a given building's own elements_meta rows actually carry).
  var LOAD_BEARING_CLASSES = { IfcSlab: 1, IfcBeam: 1, IfcColumn: 1, IfcWall: 1, IfcWallStandardCase: 1, IfcFooting: 1, IfcPile: 1 };
  var GROUND_CLASSES = { IfcFooting: 1, IfcPile: 1 };
  var UNLABELLED_STOREY = { 'Unknown': 1, '_UNKNOWN': 1, '': 1 };
  function _isStructural(item) { return !!LOAD_BEARING_CLASSES[item.cls]; }
  function _hasStorey(item) { return !!item.storey && !UNLABELLED_STOREY[item.storey]; }
  function _isCountedHop(item) { return _isStructural(item) && _hasStorey(item); }

  var _lp = null;   // the whole build's state, or null if never built / build failed

  function _err(fn, e) { console.warn('§LOADPATH_' + fn + '_ERR ' + (e && e.message)); }

  // ── §129.1 DATA: items[] the same shape time_machine.js's own _buildXrayElements() builds
  // (guid, cls, storey, seq, phase, bz/tz, x0/x1/y0/y1) — a DELIBERATE re-query (see §129.4), not a
  // shared abstraction, since _buildXrayElements is private to time_machine.js. Built for EVERY
  // element (not just load-bearing ones) because the support PHYSICS (contactGraph/designatedSupport)
  // needs the whole population — a structural column resting on a non-structural bracket must still
  // see that bracket to find its real support. ─────────────────────────────────────────────────────
  function _buildItems() {
    var rows = A.dbQuery(
      'SELECT m.guid, m.ifc_class, m.element_name, m.storey, ' +
      'COALESCE(t.center_z,0), COALESCE(t.bbox_z,0), ' +
      'COALESCE(t.center_x,0), COALESCE(t.center_y,0), ' +
      'COALESCE(t.bbox_x,0), COALESCE(t.bbox_y,0) ' +
      'FROM elements_meta m LEFT JOIN element_transforms t ON t.guid = m.guid ' +
      "WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'");
    if (!rows.length) return [];
    var SR = window.SEQUENCE_RULES || {}, SD = window.SEQUENCE_DEFAULT || null;
    var NO = window.SEQUENCE_NAME_OVERRIDES || [];
    var SA = window.ScheduleAuthor;
    return rows.map(function (r) {
      var cls = r[1], name = r[2] || '', storey = r[3] || '_UNKNOWN';
      var cz = r[4] || 0, bz = r[5] || 0, cx = r[6] || 0, cy = r[7] || 0, bx = r[8] || 0, by = r[9] || 0;
      var rule = SD || { phase: 'Architecture', sequence: 6, resource: null };
      if (SA) {
        var ov = SA.matchNameOverride(cls, name, NO);
        rule = ov || SA.matchRule(cls, SR, SD);
      }
      return {
        guid: r[0], cls: cls, storey: storey, seq: rule.sequence, phase: rule.phase,
        bz: cz - bz / 2, tz: cz + bz / 2,
        x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2
      };
    });
  }

  // ── v2 CHAIN INFO: one memoized, cycle-guarded pass over des[] (SupportSweep.designatedSupport's
  // own relation) computing, for every item, (a) countedDepth — hops to ground counting ONLY
  // load-bearing+labelled members, walking THROUGH everything else without incrementing;
  // (b) skipCount — how many non-counted elements were walked through on the way; (c) rootIdx/rootOk
  // — the walk's terminal element and whether it is a footing/pile or truly ground-connected. Uses
  // `G.groundConnected` (the §GROUND_CONNECTED seeded reachability flag), NOT the cruder footprint-
  // local `G.grounded` ("nothing beneath me in my own XY column") — support_sweep.js's own comments
  // document exactly why `grounded` alone false-positives on a genuinely floating orphan (nothing
  // below it in its column either), the one failure mode this PICK filter exists to exclude. A cycle
  // (§SUPPORT_CYCLE) is treated as its own root, never an infinite loop. ────────────────────────────
  function _resolveChainInfo(items, des, groundConnected) {
    var n = items.length;
    var countedDepth = new Int32Array(n).fill(-1);
    var skipCount = new Int32Array(n).fill(-1);
    var rootIdx = new Int32Array(n).fill(-1);
    var rootOk = new Uint8Array(n);
    function isGroundRoot(i) { return !!(GROUND_CLASSES[items[i].cls] || groundConnected[i] === 1); }
    function resolve(i, visiting) {
      if (countedDepth[i] >= 0) return;
      var counted = _isCountedHop(items[i]) ? 1 : 0;
      if (visiting[i]) {
        countedDepth[i] = counted; skipCount[i] = counted ? 0 : 1; rootIdx[i] = i; rootOk[i] = isGroundRoot(i) ? 1 : 0;
        return;
      }
      visiting[i] = true;
      var p = des[i];
      if (p < 0) {
        countedDepth[i] = counted; skipCount[i] = counted ? 0 : 1; rootIdx[i] = i; rootOk[i] = isGroundRoot(i) ? 1 : 0;
      } else {
        resolve(p, visiting);
        countedDepth[i] = countedDepth[p] + counted;
        skipCount[i] = skipCount[p] + (counted ? 0 : 1);
        rootIdx[i] = rootIdx[p];
        rootOk[i] = rootOk[p];
      }
      visiting[i] = false;
    }
    for (var i = 0; i < n; i++) resolve(i, {});
    return { countedDepth: countedDepth, skipCount: skipCount, rootIdx: rootIdx, rootOk: rootOk };
  }

  // ── v8 PICK: candidates are load-bearing + labelled-storey + ending on ground (v2, unchanged); the
  // in-shot FILTER v8's first draft added is GONE (superseded before it ever ran — see §129.4). Deepest
  // counted chain wins; v8 inserts "stack-in-frame at the searched hold point" ahead of footprint in
  // the tie order, so this now returns every candidate tied at the max depth (usually one) instead of
  // resolving the tie itself — the caller (which alone knows the hold point) breaks it. ─────────────
  // ── v2 CHAIN: walk des[] from the pick to ground, pushing ONLY counted (load-bearing + labelled)
  // hops — non-structural elements are skipped through (still followed via des[], never displayed).
  // Cap 200 steps (defensive — real chains are a handful; only guards a data anomaly). ─────────────
  function _chainCounted(items, des, pickIdx) {
    var out = [], cur = pickIdx, seen = {}, steps = 0, cap = 200;
    while (cur >= 0 && steps < cap && !seen[cur]) {
      seen[cur] = true; steps++;
      if (_isCountedHop(items[cur])) out.push(cur);
      cur = des[cur];
    }
    return out;   // indices, ground-most LAST
  }
  // ── v10 CHAIN MUST DESCEND (2026-09-15, user ruling): a candidate chain is valid only if every
  // hop's base is BELOW the previous hop's base, walking top -> ground (chainIdx is top-most first,
  // per _chainCounted's own contract) — a real geological section descends; support_sweep.js's own
  // `des[]` relation is PLACEMENT ORDER, not gravity, so nothing here guarantees that on its own
  // (LTU's own 21-hop chain climbs 5.7m -> 14.8m — a support_sweep.js finding, noted in §129.4,
  // NOT fixed here: this filter works around it in PICK, never edits the sweep's own relation).
  // `ascents` counts hops whose base is >= the hop above (flat counts as an ascent — never descending
  // is the bar, not "non-increasing").
  function _chainDescendInfo(items, chainIdx) {
    var descents = 0, ascents = 0;
    for (var k = 0; k < chainIdx.length - 1; k++) {
      var upperBz = items[chainIdx[k]].bz, lowerBz = items[chainIdx[k + 1]].bz;
      if (lowerBz < upperBz) descents++; else ascents++;
    }
    return { descents: descents, ascents: ascents, monotone: ascents === 0 };
  }
  // ── §129.40 CHAIN MUST BEAR (2026-09-19, red1: "it was hopping with only one ground slab right
  // to 3rd floor ... so you have to advice what is a Load Path") ────────────────────────────────
  // A LOAD PATH IS THE ORDERED SET OF MEMBERS THAT CARRY A LOAD TO THE GROUND, EACH BEARING
  // DIRECTLY ON THE NEXT. "Descending" is not enough, and the HHS bake of this date is the proof:
  // the winning chain was
  //     Slab L3 (z 7.425) -> Slab L3 (z 7.150) -> Slab L1 (z 0.169) -> Column L1 -> Slab L1
  // which _chainDescendInfo passed as monotone=true descents=4 ascents=0, because it counts steps
  // in the SUPPORT GRAPH and never looks at how far apart the members actually are. Between hop 2
  // and hop 3 there is a 6.98 m fall with nothing in it. Nothing bears on anything; it is a stack
  // of floor plates with a hole where Level 2 should be.
  //
  // The chain that SHOULD have won was built in the same bake and thrown away:
  //     Column L3 (7.3-10.6) -> Column L2 (3.8-7.3) -> Column L1 (0.09-3.5) -> Column L1 (0-3.5)
  //     -> Slab L1 -> ground
  // every column's base meeting the one below's top, every storey present. The ranking is
  // `visibleHopsMajority, depth, score` — it picks what the CAMERA can see, and a floor plate is
  // always more visible than a column. So the fix is not a new ranking, it is a GATE applied
  // before ranking: a chain that does not physically bear must never be a candidate at all.
  //
  // TWO CHECKS, both read straight off geometry already in `items` (bz/tz, x0/x1/y0/y1):
  //   1. CONTACT — the lower member's top must reach the upper member's base. The allowance is
  //      BEAR_GAP_TOL_M below: two stacked columns are legitimately separated by the floor
  //      construction between them (measured 0.30 m on this very building's own column line), so
  //      the tolerance has to clear a slab-and-topping, and nothing more. 0.75 m is generous for
  //      that and still a fifth of the shortest storey here, so the 6.76 m hole above is rejected
  //      with a 9x margin — it is not a number tuned until one chain passed.
  //   2. PLAN OVERLAP — the two members must share footprint. Load travels down, not sideways: a
  //      member that stands clear of the one above it in plan is not carrying it, however close in
  //      z. Counted separately from the gap so the log says WHICH rule bit.
  // Neither check invents structure. Both refuse chains the data cannot support, which is the
  // Prime Directive's own direction of travel: say "this is not a load path" rather than draw one.
  var BEAR_GAP_TOL_M = 0.75;
  function _chainBearsInfo(items, chainIdx) {
    var gaps = 0, offsets = 0, worstGapM = 0, worstAt = -1;
    for (var k = 0; k < chainIdx.length - 1; k++) {
      var up = items[chainIdx[k]], lo = items[chainIdx[k + 1]];
      // CONTACT: how far the lower member's top falls short of the upper member's base. Negative
      // (they interpenetrate, or the lower one rises past the base) is contact, not a gap.
      var gapM = up.bz - lo.tz;
      if (gapM > BEAR_GAP_TOL_M) {
        gaps++;
        if (gapM > worstGapM) { worstGapM = gapM; worstAt = k; }
      }
      // PLAN OVERLAP: any shared footprint at all. Zero-area touching counts — a column landing
      // exactly on a slab edge is still bearing on it.
      var ox = Math.min(up.x1, lo.x1) - Math.max(up.x0, lo.x0);
      var oy = Math.min(up.y1, lo.y1) - Math.max(up.y0, lo.y0);
      if (!(ox >= 0 && oy >= 0)) offsets++;
    }
    return { gaps: gaps, offsets: offsets, bears: (gaps === 0 && offsets === 0),
             worstGapM: worstGapM, worstAt: worstAt };
  }
  // ── §129.42 STOREY SPAN (2026-09-19, red1: "storey span ahead of visibility, go ahead") ──────
  // The bearing gate (§129.40) made every candidate physically possible. It did not make the
  // WINNER interesting: on the 11:08 HHS bake the pick became Wall L1 -> Slab L1 -> Column L1 ->
  // Slab L1 -> ground — borne, honest, and entirely on the ground floor, while
  // Column L3 -> L2 -> L1 -> L1 -> Slab sat in the field and lost. The ranker's first key is
  // `visibleHopsMajority`: it asks what the CAMERA can see, and a floor plate is always more
  // visible than a column, so a chain that never leaves Level 1 beats one that walks the building.
  // A load path is a story about carrying load from the TOP of the structure to the ground, so the
  // number of distinct storeys it crosses is the thing to rank on first; visibility decides between
  // chains that tell the same story, which is what it was always good for.
  // Counted as DISTINCT non-empty storey labels, not hop count: four hops all on Level 1 span one
  // storey, and two hops on Level 3 and Level 1 span two. Unlabelled members (this fleet has them —
  // §STOREY_ARCH_WITNESS counts 41 on HHS alone) contribute nothing rather than a guess, so a chain
  // cannot win span by being badly tagged.
  function _chainStoreySpan(items, chainIdx) {
    var seen = {}, n = 0;
    for (var k = 0; k < chainIdx.length; k++) {
      var st = items[chainIdx[k]] && items[chainIdx[k]].storey;
      if (!st) continue;
      if (!seen[st]) { seen[st] = 1; n++; }
    }
    return n;
  }
  A._loadPathChainStoreySpan = _chainStoreySpan;
  // Published for W-LOADPATH-BEARING (viewer/tests/witness_loadpath_bearing.js): the gate is
  // the thing under test, so the witness must call the SHIPPED function, never a copy of it.
  A._loadPathChainBears = _chainBearsInfo;
  // ROUND 9 CHAIN-PRINT GAP (2026-09-16, real Terminal r9 bake: the live re-pick switched the
  // winner 7-hop probe chain -> 6-hop live chain, but the log still only ever carried the PROBE
  // pick's §LOADPATH_CHAIN) — the drawn-hop bookkeeping (the `__lpBreakSupport` control's "drop the
  // last hop" tap included) and the print itself, factored out so BOTH the build-time print (the
  // probe's own winner) and the arm-time re-print (the FINAL, possibly live-switched winner) go
  // through the identical computation — never two slightly different copies of "what did we draw".
  function _chainDrawnInfo(chainIdx) {
    var hopsSweep = chainIdx.length;
    var drawnIdx = chainIdx.slice();
    if (window.__lpBreakSupport) drawnIdx = drawnIdx.slice(0, -1);   // control: drop the last hop
    return { drawnIdx: drawnIdx, hopsDrawn: drawnIdx.length, hopsSweep: hopsSweep };
  }
  function _printChainWitness(items, pickItem, chainIdx, drawnInfo, pickSourceLabel) {
    var chainStr = chainIdx.map(function (i) { return items[i].guid + ':' + items[i].cls + ':' + items[i].storey; })
      .concat(['ground']).join(', ');
    var chainOk = (drawnInfo.hopsDrawn === drawnInfo.hopsSweep) &&
      drawnInfo.drawnIdx.every(function (i, k) { return i === chainIdx[k]; });
    var descInfo = _chainDescendInfo(items, chainIdx);
    // §129.40 — monotone alone said PASS on a chain with a 6.98 m hole in it. The bearing verdict
    // rides the same line so the printed chain can never look good while being impossible.
    var bearInfo = _chainBearsInfo(items, chainIdx);
    console.log('§LOADPATH_CHAIN guid=' + pickItem.guid + ' hops=[' + chainStr + '] hopsDrawn=' + drawnInfo.hopsDrawn +
      ' hopsSweep=' + drawnInfo.hopsSweep + ' monotone=' + descInfo.monotone + ' descents=' + descInfo.descents +
      ' ascents=' + descInfo.ascents + ' bears=' + bearInfo.bears + ' gaps=' + bearInfo.gaps +
      ' offsets=' + bearInfo.offsets + ' worstGapM=' + bearInfo.worstGapM.toFixed(2) +
      (pickSourceLabel ? ' pickSource=' + pickSourceLabel : '') +
      ' => ' + (chainOk && descInfo.ascents === 0 && bearInfo.bears ? 'PASS' : 'FAIL'));
    return { chainOk: chainOk, descInfo: descInfo, bearInfo: bearInfo };
  }
  function _footprintOf(item) { return Math.max(0, item.x1 - item.x0) * Math.max(0, item.y1 - item.y0); }
  // ── v10 PICK — returns EVERY eligible (load-bearing+labelled, ground-ending) candidate whose OWN
  // chain is monotone-descending (CHAIN MUST DESCEND above); an ascending chain is never a
  // candidate, regardless of depth. §129.7 ROUND 4 item 1b (2026-09-16, real Terminal bake: a lone
  // ground-floor slab won PICK — "a slab on ground is not a path") — a candidate also needs >= 2
  // load-bearing hops before ground (depth >= 2); depth===1 is excluded outright, counted separately
  // from the ascending rejection. Ranking (visibleHops/minMemberPx/depth/footprint/guid) is done by
  // the caller, which alone knows the searched hold pose. ───────────────────────────────────────
  function _pick(items, info, des) {
    var n = items.length, candidates = 0, rejectedAscending = 0, rejectedSingleHop = 0, valid = [];
    var rejectedNoBearing = 0, rejectedOffset = 0, worstRejectedGapM = 0;
    for (var i = 0; i < n; i++) {
      if (!_isCountedHop(items[i]) || !info.rootOk[i]) continue;
      candidates++;
      var chain = _chainCounted(items, des, i);
      var desc = _chainDescendInfo(items, chain);
      if (!desc.monotone) { rejectedAscending++; continue; }
      if (info.countedDepth[i] < 2) { rejectedSingleHop++; continue; }
      // §129.40 — the gate, BEFORE any ranking. A chain that does not physically bear is not a
      // load path at any visibility score, so it never reaches the ranker to win on being big.
      var bear = _chainBearsInfo(items, chain);
      if (bear.gaps) {
        rejectedNoBearing++;
        if (bear.worstGapM > worstRejectedGapM) worstRejectedGapM = bear.worstGapM;
        continue;
      }
      if (bear.offsets) { rejectedOffset++; continue; }
      valid.push({ idx: i, depth: info.countedDepth[i], chain: chain, descents: desc.descents, ascents: desc.ascents });
    }
    // §129.40 — if the gate emptied the field, say so with the number that did it rather than
    // falling back to an un-borne chain. An honest "no load path here" beats a drawn fiction.
    if (!valid.length) {
      console.log('§LOADPATH_BEARING INCONCLUSIVE candidates=' + candidates +
        ' rejectedNoBearing=' + rejectedNoBearing + ' rejectedOffset=' + rejectedOffset +
        ' worstGapM=' + worstRejectedGapM.toFixed(2) + ' tolM=' + BEAR_GAP_TOL_M +
        ' — every chain either fails to descend, is a single hop, or has members that do not bear ' +
        'on each other. Nothing drawn: a chain with a hole in it is not a load path.');
      return null;
    }
    console.log('§LOADPATH_BEARING kept=' + valid.length + '/' + candidates +
      ' rejectedNoBearing=' + rejectedNoBearing + ' rejectedOffset=' + rejectedOffset +
      ' worstRejectedGapM=' + worstRejectedGapM.toFixed(2) + ' tolM=' + BEAR_GAP_TOL_M + ' => PASS');
    return { valid: valid, candidates: candidates, rejectedAscending: rejectedAscending,
             rejectedSingleHop: rejectedSingleHop, rejectedNoBearing: rejectedNoBearing,
             rejectedOffset: rejectedOffset };
  }
  // ── ROUND 4 item 1a (2026-09-16, real Terminal bake: minMemberPx-first rewarded one giant
  // ground-floor slab) — RE-SUPERSEDES §129.7 item 3's minMemberPx-first ranking: visibleHops DESC
  // is the primary key again (item 7's own original rule — "the stack that shows the most layers
  // wins, not the deepest one hidden off-frame"), THEN minMemberPx DESC ("a thicker member or a
  // nearer one both raise it" — now the TIE-BREAK among candidates that show the same number of
  // hops), then depth, footprint, guid. `visibleHopsOf(chain)` and `minMemberPxOf(chain)` are both
  // supplied by the caller (needs the searched hold pose + camera + output resolution).
  // Candidates with ZERO visible hops are excluded from ranking ("≥1 visible hop" — a stack you
  // cannot see at all cannot be "discernible" by any px measure); if that empties the list
  // (degenerate: nothing visible at all), rank falls back to the full list rather than failing PICK
  // outright — same "never a null PICK when SOME valid chain exists" contract as before.
  // Control `window.__lpPickThinnest=1` (rank minMemberPx ASCENDING, tie-break only — visibleHops
  // stays DESC even under this control, since it is no longer the thing being controlled) is the
  // caller's own concern (it re-sorts the returned `valid` list, never re-implemented here).
  function _rankValid(items, valid, visibleHopsOf, minMemberPxOf, thinnest) {
    valid.forEach(function (c) {
      c.visibleHops = visibleHopsOf(c.chain);
      c.footprint = _footprintOf(items[c.idx]);
      var mp = minMemberPxOf ? minMemberPxOf(c.chain) : { minMemberPx: 0, memberPx: [] };
      c.minMemberPx = mp.minMemberPx; c.memberPx = mp.memberPx;
    });
    var visible = valid.filter(function (c) { return c.visibleHops >= 1; });
    var pool = visible.length ? visible : valid;
    // dir multiplies the base DESC comparator (b.minMemberPx - a.minMemberPx): +1 keeps it DESC
    // (the real rule — largest minMemberPx first among equal-visibleHops candidates), -1 negates it
    // to ASC for __lpPickThinnest.
    var dir = thinnest ? -1 : 1;
    pool.sort(function (a, b) {
      if (b.visibleHops !== a.visibleHops) return b.visibleHops - a.visibleHops;
      if (b.minMemberPx !== a.minMemberPx) return dir * (b.minMemberPx - a.minMemberPx);
      if (b.depth !== a.depth) return b.depth - a.depth;
      if (b.footprint !== a.footprint) return b.footprint - a.footprint;
      var ga = items[a.idx].guid, gb = items[b.idx].guid;
      return ga < gb ? -1 : (ga > gb ? 1 : 0);
    });
    var w = pool[0], rule = (pool.length === 1) ? 'deepest'
      : (pool[1].visibleHops !== w.visibleHops) ? 'visibleHops'
      : (pool[1].minMemberPx !== w.minMemberPx) ? 'minMemberPx'
      : (pool[1].depth !== w.depth) ? 'depth'
      : (pool[1].footprint !== w.footprint) ? 'footprint' : 'guid';
    return { idx: w.idx, chain: w.chain, depth: w.depth, visibleHops: w.visibleHops,
             footprint: w.footprint, minMemberPx: w.minMemberPx, memberPx: w.memberPx, rule: rule };
  }
  // Exposed for a direct node dry run of CHAIN MUST DESCEND / visible-hops-first PICK, against real
  // `items`/`des`/`info` shapes — never a second, re-implemented copy of this logic in a test file.
  A._loadPathChainDescendInfo = _chainDescendInfo; A._loadPathPick = _pick; A._loadPathRankValid = _rankValid;
  // ROUND 9 CHAIN-PRINT GAP — exposed so a dry run can prove the arm-time §LOADPATH_CHAIN re-print
  // (for the FINAL, possibly live-switched winner) goes through the identical drawn-hop bookkeeping
  // the build-time print uses, never a second copy.
  A._loadPathChainDrawnInfo = _chainDrawnInfo; A._loadPathPrintChainWitness = _printChainWitness;
  A._loadPathResolveChainInfo = _resolveChainInfo; A._loadPathMemberPxHeight = _memberPxHeight;

  // ── v4 hue ramp (unchanged math, now applied to a clone mesh's own material instead of a shared
  // instance's color slot). ground = red (hue 0) -> top = violet (hue ~0.78), one ramp, no
  // per-building constant. ────────────────────────────────────────────────────────────────────────
  function _hexForHop(i, n) {
    var c = new THREE.Color();
    var hue = (n > 1) ? (i / (n - 1)) * 0.78 : 0;
    c.setHSL(hue, 0.85, 0.55);
    return c.getHex();
  }

  // ── v4 SOLID OVERLAY — one standalone THREE.Mesh per chain hop. Real geometry from
  // A.meshCache[hash] (still, unchanged). ROUND 5 (2026-09-16, real Terminal bake: the OLD transform
  // — DB coordinates through A.ifc2three, the same math navigate_find.js's own _buildShapeMeshes
  // uses — put every clone somewhere the film's own camera never looks and left two with no
  // resolvable geometry at all; on HHS this happened to line up, Terminal's own element_transforms
  // are SITE coordinates and its containers carry an extra building-offset/scale/rotation this DB
  // math never knew about) SUPERSEDED: the clone's world transform now comes from the SOURCE
  // INSTANCE's own REAL, currently-rendered world matrix (`_sourceInstance` above — container's
  // getMatrixAt(index) premultiplied by the container's own matrixWorld) — the exact same path that
  // places the real geometry, so it can never disagree with it, regardless of whatever offset/scale/
  // rotation chain produces that matrix. A clone mesh is independent of whatever its origin
  // container's material does (ghosted or not), which is exactly the property this beat needs:
  // "solid" no longer depends on which of 41 shared containers a hop happens to live in. ────────────
  function _buildChainClones(hopsUp) {
    if (typeof THREE === 'undefined' || !A.scene || !A.dbQuery) return 0;
    var guids = hopsUp.map(function (h) { return h.guid; });
    if (!guids.length) return 0;
    var ph = guids.map(function () { return '?'; }).join(',');
    var rows = A.dbQuery(
      'SELECT i.guid, i.geometry_hash, m.material_rgba, m.ifc_class ' +
      'FROM element_instances i JOIN elements_meta m ON m.guid = i.guid WHERE i.guid IN (' + ph + ')', guids) || [];
    var byGuid = {};
    rows.forEach(function (r) { byGuid[r[0]] = r; });
    // Control window.__lpCloneOffset=1 (ROUND 5 item 2) — shifts every clone by one building WIDTH
    // along world X, simulating a real placement bug for §LOADPATH_CLONES to catch. `_lp.buildingBox`
    // is already built (loadPathBuild's own whole-building bbox) by the time clones are built.
    var offsetVec = null;
    if (window.__lpCloneOffset && _lp && _lp.buildingBox) {
      var bw = _lp.buildingBox.maxX - _lp.buildingBox.minX;
      offsetVec = new THREE.Vector3(bw, 0, 0);
    }
    var n = 0;
    hopsUp.forEach(function (h) {
      var r = byGuid[h.guid];
      if (!r) { h._cloneMissing = 'no-instance-row'; return; }
      var geo = A.meshCache && A.meshCache[r[1]];
      if (!geo) { h._cloneMissing = 'no-cached-geometry'; return; }
      var src = _sourceInstance(h.guid);
      if (!src) { h._cloneMissing = 'no-source-instance'; return; }
      var base = A._getMaterial ? A._getMaterial(r[2], r[3]) : null;
      var mat = base && base.clone ? base.clone() : new THREE.MeshStandardMaterial();
      var ghostLook = _lookGhost();
      if (ghostLook) {
        // v10 LOOK (§129.7, kept behind window.__lpLookGhost=1 for an A/B) — "at arm no layer is
        // solid": every clone starts GHOSTED (the same GHOST_OPACITY the rest-of-building ghost
        // uses) and is turned solid one at a time, bottom-up, by loadPathApplyVisual's own step loop.
        mat.transparent = true; mat.opacity = GHOST_OPACITY; mat.depthWrite = false; mat.depthTest = true;
        if (mat.color) mat.color.setHex(h.hex); else if (mat.emissive) mat.emissive.setHex(h.hex);
      } else {
        // §129.8 item 1 SHINE-THROUGH (default) — the building stays exactly as the film renders
        // it (no ghost material touches it at all, see _applyGhost's own gate below); the clone
        // itself shines through whatever occludes it: depthTest=false, depthWrite=false, a
        // renderOrder above everything (SHINE_RENDER_ORDER, well past every other renderOrder=999
        // overlay in this file), solid rainbow, opacity=1, a slight emissive lift. Starts INVISIBLE
        // (no ghost state to sit in before its turn) — the per-step reveal loop below flips
        // `visible=true` bottom-up instead of animating opacity.
        mat.transparent = false; mat.opacity = 1; mat.depthWrite = false; mat.depthTest = false;
        if (mat.color) mat.color.setHex(h.hex);
        if (mat.emissive) { mat.emissive.setHex(h.hex); mat.emissiveIntensity = SHINE_EMISSIVE_LIFT; }
      }
      var mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(src.world);
      if (offsetVec) mesh.matrix.setPosition(new THREE.Vector3().setFromMatrixPosition(src.world).add(offsetVec));
      mesh.matrixWorldNeedsUpdate = true;
      mesh.renderOrder = ghostLook ? 999 : SHINE_RENDER_ORDER;
      mesh.frustumCulled = false;
      mesh.visible = ghostLook ? true : false;   // shine mode: invisible until this hop's reveal step
      mesh.userData._loadPathClone = true;
      // ROUND 13 Fix 1b — belt AND suspenders: a no-op raycast makes this clone invisible to ANY
      // Raycaster.intersectObject(s) call, permanently, regardless of _raycastUniverse's own
      // registry/cache timing (three.js's own per-object raycast override).
      mesh.raycast = function () {};
      A.scene.add(mesh);
      h._cloneMesh = mesh; h._cloneMat = mat;
      h._srcWorldMatrix = src.world; h._srcLocalBox = _sourceLocalBox(src.mesh, src.index);
      n++;
    });
    return n;
  }
  // §129.26 (2026-09-18, red1: "give it its own costing as if it's just to build that stack... it's
  // just a POC" — after §129.25 traced the panel's DAYS figure to `tasks.schedule_duration`, which
  // turned out to disagree with what's on disk (P11D saved vs P12D live) somewhere inside the
  // project's own big CPM/reconciliation pipeline — a real discrepancy, but in a system well outside
  // this beat's own scope to safely edit blind). SUPERSEDES that approach entirely: days and cost
  // now BOTH come from the exact same, single, self-contained source — `calcLabor(ifcClass, 1)`
  // (rates.js, real CIDB-2024 productivity/crew-size/day-rate tables — genuinely resource/crew-rate
  // based, just at the class level, not a named person) — never the external schedule tables at all.
  // No more task_id/dedup logic either: `.days` is now a per-ELEMENT labour-effort figure (this
  // element's own share, `qty=1`, same convention cost already used), so the running total is a
  // plain sum — "how much labour went into the stack so far", not a calendar-time claim, and immune
  // to whatever the wider scheduling pipeline does to its own saved windows.
  function _fetchHopScheduleCost(hopsUp) {
    if (!A.dbQuery || !hopsUp.length) return;
    var guids = hopsUp.map(function (h) { return h.guid; });
    var ph = guids.map(function () { return '?'; }).join(',');
    // Task NAME only, for row context — a real, correctly-loaded string (confirmed via §GANTT_SOURCE
    // captured=100% generated=0% this session), not a computed figure, so none of §129.25's own
    // duration-recompute risk applies to it. Kept purely descriptive; nothing sums or dedupes it.
    var rows = A.dbQuery(
      'SELECT te.guid, t.name FROM task_elements te JOIN tasks t ON t.task_id = te.task_id WHERE te.guid IN (' + ph + ')', guids) || [];
    var byGuid = {};
    rows.forEach(function (r) { if (!byGuid[r[0]]) byGuid[r[0]] = r[1]; });
    hopsUp.forEach(function (h) {
      h.taskName = byGuid[h.guid] || null;
      var lab = (typeof calcLabor === 'function') ? calcLabor(h.cls, 1) : { cost: 0, days: 0 };
      h.hopCost = lab.cost;
      h.hopDays = lab.days;
    });
  }
  function _disposeChainClones(hopsUp) {
    var n = 0;
    hopsUp.forEach(function (h) {
      if (!h._cloneMesh) return;
      try { A.scene.remove(h._cloneMesh); } catch (e) {}
      try { h._cloneMat.dispose(); } catch (e2) {}
      h._cloneMesh = null; h._cloneMat = null; n++;
    });
    return n;
  }
  // ROUND 5 item 2 (2026-09-16) WITNESS — fired once, right after _buildChainClones: every clone's
  // OWN world Box3 (from the mesh actually added to the scene) against its SOURCE INSTANCE's world
  // box (container geometry bbox x instance matrix, cached on the hop as _srcWorldMatrix/_srcLocalBox
  // by _buildChainClones itself — never re-derived here). `offset` = distance between the two boxes'
  // centres; PASS requires offset < that member's OWN diagonal (its size, not a threshold constant)
  // for every hop, `placed===N`, and `emptyGeom===0`.
  // §129.8 item 3 — `pickItem`/`stackName` are now explicit params (never implicitly `_lp.pickItem`,
  // which is only the NEAR stack) so this one function still serves BOTH stacks; existing callers
  // that only ever had one stack pass `_lp.pickItem`/`'near'` (back-compat default below).
  function _clonesWitness(hopsUp, pickItem, stackName) {
    var N = hopsUp.length, placed = 0, emptyGeom = 0, maxOffset = 0, allWithinDiag = true, missing = [];
    hopsUp.forEach(function (h) {
      if (!h._cloneMesh) {
        if (h._cloneMissing === 'no-cached-geometry') emptyGeom++;
        missing.push(h.guid + ':' + (h._cloneMissing || 'unknown'));
        return;
      }
      placed++;
      if (!h._srcLocalBox || !h._srcWorldMatrix) return;   // nothing more to check without a source box
      h._cloneMesh.updateMatrixWorld(true);
      var cloneBox = new THREE.Box3().setFromObject(h._cloneMesh);
      var srcWorldBox = h._srcLocalBox.clone().applyMatrix4(h._srcWorldMatrix);
      var offset = cloneBox.getCenter(new THREE.Vector3()).distanceTo(srcWorldBox.getCenter(new THREE.Vector3()));
      var diag = srcWorldBox.getSize(new THREE.Vector3()).length();
      if (offset > maxOffset) maxOffset = offset;
      if (!(offset < diag)) { allWithinDiag = false; missing.push(h.guid + ':offset-' + offset.toFixed(2) + 'm-vs-diag-' + diag.toFixed(2) + 'm'); }
    });
    var ok = placed === N && emptyGeom === 0 && allWithinDiag;
    // ROUND 9 CHAIN-PRINT GAP — `guid=` names WHICH pick these clones belong to (the FINAL winner:
    // `_lp.pickItem` is already the live-repicked one by the time clones are built, never the stale
    // probe pick) — `hopsUp` itself was already that pick's own chain, this just labels the line.
    var guidNow = pickItem ? pickItem.guid : ((_lp && _lp.pickItem) ? _lp.pickItem.guid : '?');
    console.log('§LOADPATH_CLONES stack=' + (stackName || 'near') + ' guid=' + guidNow + ' placed=' + placed + '/' + N + ' maxOffset=' + maxOffset.toFixed(2) + 'm emptyGeom=' + emptyGeom +
      (missing.length ? ' missing=[' + missing.join(',') + ']' : '') + ' => ' + (ok ? 'PASS' : 'FAIL'));
  }
  A._loadPathClonesWitness = _clonesWitness;
  // Exposed for a direct node dry run of _buildChainClones against a fake container/scene, without
  // running the whole PICK/CHAIN/loadPathBuild pipeline — same convention as every other exposure in
  // this file. `_loadPathDebugSetLp` is a TEST-ONLY seam (never called by any real code path) so a
  // dry run can supply the one piece of `_lp` state (`buildingBox`) the __lpCloneOffset control reads.
  A._loadPathBuildChainClones = _buildChainClones; A._loadPathDisposeChainClones = _disposeChainClones;
  A._loadPathDebugSetLp = function (v) { _lp = v; };
  A._loadPathVisibleWitness = function () { return _visibleWitness(_lp, 'near'); };

  // ── v4 CUT (unchanged from v3 in spirit, simplified in scope): ghost EVERY non-clone object,
  // uniformly, no exemption — the clones (drawn on top, renderOrder=999, full opacity) are what
  // "solid" means now, so a container is free to ghost even when a chain hop also lives inside it.
  // Modeled on effects.js's own §CPE_ARCH_FADE (`cpeArchFadeApplyVisual`): clone-per-distinct-
  // material, deduped via a Map, restore by putting the original object back — the same discipline
  // §STOREY_REVEAL_TINT_SHARED_MATERIAL forced onto the storey tint next door. `visible` is NEVER set
  // false on the real path — only the `__lpHideRest` control does that. Regular (`isMesh`) meshes are
  // excluded from double-processing here by explicitly checking `!isInstancedMesh && !isBatchedMesh`
  // (three.js sets isMesh=true on BOTH those subclasses too — the v3 double-touch bug). ─────────────
  var _ghostTouched = [], _ghostClones = [], _clipPlane = null;
  // v8 third amendment: `plane` (or null) is applied to every ghost material clone this pass creates —
  // never to `A.sectionPlane`/the renderer's shared clippingPlanes array, only to materials this beat
  // itself clones and disposes. Requires `A.renderer.localClippingEnabled = true` (the SAME once-on
  // flag grid_overlay.js's own per-material clip idiom sets and never unsets).
  function _applyGhost(plane) {
    if (typeof THREE === 'undefined') return { n: 0, hiddenN: 0 };
    _clipPlane = plane || null;
    if (plane && A.renderer) A.renderer.localClippingEnabled = true;
    var hide = !!window.__lpHideRest;   // control: simulate the OLD, WRONG "hide everything" look
    var matMap = (typeof Map !== 'undefined') ? new Map() : null;
    var n = 0, hiddenN = 0;
    function ghostOne(obj) {
      if (obj.userData && obj.userData._loadPathClone) return;   // never ghost our own overlay
      if (hide) {
        _ghostTouched.push({ mesh: obj, wasVisible: obj.visible, kind: 'vis' });
        obj.visible = false; hiddenN++; n++;
        return;
      }
      if (!obj.material || Array.isArray(obj.material) || !obj.material.clone) return;
      var orig = obj.material, cl = matMap ? matMap.get(orig) : null;
      if (!cl) {
        cl = orig.clone(); cl.transparent = true; cl.opacity = GHOST_OPACITY; cl.depthWrite = false;
        if (plane) { cl.clippingPlanes = [plane]; cl.clipShadows = true; }
        if (matMap) matMap.set(orig, cl);
        _ghostClones.push(cl);
      }
      _ghostTouched.push({ mesh: obj, mat: orig, kind: 'mat', clone: cl });
      obj.material = cl; n++;
    }
    A.collectMeshes(function (o) { return o.isMesh && !o.isInstancedMesh && !o.isBatchedMesh; }).forEach(ghostOne);
    A.collectMeshes(function (o) { return o.isInstancedMesh || o.isBatchedMesh; }).forEach(ghostOne);
    return { n: n, hiddenN: hiddenN };
  }
  function _restoreGhost() {
    var n = _ghostTouched.length;
    _ghostTouched.forEach(function (t) {
      if (t.kind === 'vis') t.mesh.visible = t.wasVisible;
      else if (t.kind === 'mat') t.mesh.material = t.mat;
    });
    _ghostTouched = [];
    _ghostClones.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    _ghostClones = [];
    _clipPlane = null;
    return n;
  }

  // ── Locked spec 2026-09-17 item 4 — WHITEN. During the hold, every non-stack building element's
  // BASE COLOUR goes white while lighting (roughness/metalness/normalMap/shadows) is left untouched,
  // so the frozen building stays a lit, shaded white model, not a flat cutout. Same clone-per-
  // distinct-material/Map/restore discipline as _applyGhost/_restoreGhost directly above — a
  // separate pass (never folded into _applyGhost itself) because ghost mode's own opacity-based
  // look is a different, still-needed A/B behaviour (window.__lpLookGhost) that must not be touched.
  // Runs REGARDLESS of _lookGhost() — the user wants this in the default shine-through look, and the
  // spec is explicit this is not mode-gated — so it is called AFTER the ghost/no-ghost branch below,
  // cloning whatever obj.material IS at that point (the ghost clone in ghost mode, the true original
  // in shine mode); _restoreWhiten() below must therefore run BEFORE _restoreGhost() at every call
  // site (LIFO — undo the outer wrap first) or a ghost-mode restore would hand back the white clone,
  // not the true original.
  var _whitenTouched = [], _whitenClones = [], _whitenInstColor = [], _whitenColorPairs = [], _whitenTmpColor = null, _whitenBatchColorTex = [];
  // §LOADPATH_WHITEN (2026-09-17, red1: "solve systematically, ensure it is WITNESSED") — real,
  // sourced concern, not guessed: three.js multiplies `material.color` by an InstancedMesh/
  // BatchedMesh's own per-instance `instanceColor` when present (confirmed in this codebase's own
  // comment, `hba_lens.js:60`: "un-set instanceColor multiplies WHITE (identity)"). This project
  // ALREADY uses per-instance colour elsewhere (`cpe_storey_reveal.js`'s storey-tint glow, and other
  // beat files) — if any building element this pass whitens still carries a non-default
  // `instanceColor` (its own real per-element colour, or a leftover tint another beat forgot to
  // restore), setting `material.color` alone would be multiplicatively invisible: white(1,1,1) times
  // that colour is just that colour, unchanged. Fix: for every instanced/batched mesh touched, ALSO
  // back up and neutralise its WHOLE `instanceColor` buffer (fill 1,1,1 — the identity), restored by
  // direct array copy (fast, no per-instance get/set loop needed for potentially thousands of
  // instances) at release. Regular (non-instanced) meshes have no such buffer — untouched, as before.
  // §129 SECTION-CUT (2026-09-17) — `cutPlane` param added, optional, backward compatible (existing
  // callers passing nothing keep the old whiten-with-no-clip behaviour). When set, every whitened
  // clone ALSO gets `clippingPlanes=[cutPlane]` - the SAME white material now also clips, so "the cut
  // surface and everything behind it get the concrete/white treatment" (red1's own words) is one pass,
  // not two separate systems. Never applied to the stack's own clones (`whitenOne`'s existing
  // `_loadPathClone` exclusion above already guarantees that - re-checked by `§LOADPATH_CUT` below).
  function _applyWhiten(cutPlane) {
    if (typeof THREE === 'undefined' || !A.collectMeshes) return { n: 0, instanceColorMeshes: 0 };
    // Excludes the backdrop/staffage population (_allElseObjects: ground/sky/skyline/staffage/props)
    // — that population already fades to opacity 0 via _backdropCapture/_backdropApply, which mutate
    // the ORIGINAL material object's opacity IN PLACE and restore it by identity. If this pass
    // reassigned obj.material to a white clone for those same objects, the backdrop fade would keep
    // mutating an orphaned, no-longer-rendered original — invisible, and broken on restore. Building
    // elements only, same restraint the constraints ask for.
    var allElse = (typeof Set !== 'undefined') ? new Set(_allElseObjects()) : null;
    var matMap = (typeof Map !== 'undefined') ? new Map() : null;
    var n = 0, instanceColorMeshes = 0;
    function whitenOne(obj) {
      if (obj.userData && obj.userData._loadPathClone) return;   // never touch the stack's own clones
      if (allElse && allElse.has(obj)) return;                   // last night's own fade owns this one
      if (!obj.material || Array.isArray(obj.material) || !obj.material.clone) return;
      var orig = obj.material, cl = matMap ? matMap.get(orig) : null;
      if (!cl) {
        cl = orig.clone();
        // §129 OPEN ITEM (2026-09-17) — when a section-cut plane is riding this pass (shine mode),
        // the white swap is FADED IN per-frame by `_sectionCutApply` (colour lerp against the SAME
        // t as the backdrop/HUD fade), so the clone starts at the ORIGINAL colour, not white, and
        // is registered for that per-frame lerp. Without a cutPlane (ghost mode's own whiten, no
        // fade wiring), keep the old instant-white behaviour unchanged.
        if (cl.color) {
          if (cutPlane) _whitenColorPairs.push({ clone: cl, orig: orig.color.clone() });
          else cl.color.setHex(CONCRETE_GREY_HEX);   // base colour -> concrete grey; roughness/metalness/normalMap untouched
        }
        if (cl.map) cl.map = null;                // a diffuse texture would still show its pattern through a white color
        if (cutPlane) { cl.clippingPlanes = [cutPlane]; cl.clipShadows = true; }
        cl.needsUpdate = true;
        if (matMap) matMap.set(orig, cl);
        _whitenClones.push(cl);
      }
      _whitenTouched.push({ mesh: obj, mat: orig });
      obj.material = cl; n++;
      // FIX (2026-09-17, found by re-deriving from code after red1 reported "not a single change is
      // evident" and a live pre-render diagnostic showed material.color/clippingPlanes genuinely
      // correct at render time): the bulk `.instanceColor.array` check below ONLY ever sees
      // InstancedMesh's own buffer — BatchedMesh has NO `.instanceColor` property at all, its
      // per-slot colour lives in a completely separate internal mechanism, only reachable through
      // `setColorAt`/`getColorAt` (the SAME unified API this codebase's own proven pattern already
      // uses for both mesh types — `cpe_storey_reveal.js`/`hba_lens.js`, "mirrors hba_lens.js's
      // proven MeshPort pattern verbatim"). A container this codebase compiles from many merged
      // elements very plausibly bakes each element's REAL colour per-slot exactly this way — white
      // times that real colour is just that colour, unchanged, which is exactly what red1 saw: the
      // building's true colours, completely unaffected by `material.color` alone. Neutralizing EVERY
      // slot this container manages (via `_revInstanceIndex`/`_revBatchIndex`, the same per-slot guid
      // maps `_isBuildingElementObj` already builds) covers BOTH mesh types through the ONE real API,
      // replacing the old instanceColor-only bulk check entirely (that check missed BatchedMesh 100%
      // of the time and would double-write style-mismatch bugs at restore if kept alongside).
      // FIX 2 (2026-09-17, red1: "reframe the render calls... offload from display") — a per-slot
      // `setColorAt(slot, WHITE)` write proved, exhaustively (pixel readback + raycast + live
      // `getColorAt` cross-check at the RENDERER'S OWN reported slot id), to leave the real building
      // unaffected on screen despite every JS-level check reading back correct — some three.js
      // BatchedMesh shader-variant/state mismatch this codebase can't chase further from JS alone.
      // Removed the multiplication at its SOURCE instead: three.js's own `setColorAt` source (pulled
      // at runtime, `null===this._colorsTexture&&this._initColorsTexture()`) proves a null
      // `_colorsTexture` is a safe, EXPECTED state it already knows how to lazily rebuild — nulling
      // the reference is not a hack against the API, it IS the API's own "no override" state. With it
      // null, the renderer has nothing to multiply `material.color` by at all. Reversible: the
      // ORIGINAL texture object is restored BY REFERENCE in `_restoreWhiten`, untouched the whole
      // time (never written into, never rebuilt) — so nothing already painted on it is ever at risk,
      // unlike a write-then-restore approach on the SAME object would be.
      if (obj.isBatchedMesh && '_colorsTexture' in obj) {
        _whitenBatchColorTex.push({ mesh: obj, backup: obj._colorsTexture });
        obj._colorsTexture = null;
      } else if (obj.isInstancedMesh && obj.setColorAt && obj.getColorAt) {
        // InstancedMesh's OWN per-slot check never showed this same symptom in diagnosis (its one
        // sampled point read correctly whitened on screen) — kept on the original, narrower,
        // already-proven-fine per-slot write path, not touched by FIX 2 above.
        if (!_revInstanceIndex) _buildReverseIndexes();
        var slotMap = _revInstanceIndex[obj.id];
        var slotKeys = slotMap ? Object.keys(slotMap) : [];
        if (slotKeys.length) {
          if (!_whitenTmpColor && typeof THREE !== 'undefined') _whitenTmpColor = new THREE.Color();
          var backups = [];
          for (var _sk = 0; _sk < slotKeys.length; _sk++) {
            var _slot = +slotKeys[_sk];
            try {
              obj.getColorAt(_slot, _whitenTmpColor);
              backups.push({ idx: _slot, hex: _whitenTmpColor.getHex() });
              obj.setColorAt(_slot, _whitenTmpColor.setHex(CONCRETE_GREY_HEX));
            } catch (eSlot) { /* slot out of range for this container — skip, never fatal */ }
          }
          if (backups.length) {
            instanceColorMeshes++;
            _whitenInstColor.push({ mesh: obj, slots: backups });
            if (obj.instanceColor) obj.instanceColor.needsUpdate = true;
          }
        }
      }
    }
    A.collectMeshes(function (o) { return o.isMesh && !o.isInstancedMesh && !o.isBatchedMesh; }).forEach(whitenOne);
    A.collectMeshes(function (o) { return o.isInstancedMesh || o.isBatchedMesh; }).forEach(whitenOne);
    return { n: n, instanceColorMeshes: instanceColorMeshes, batchColorTexNulled: _whitenBatchColorTex.length };
  }
  // §129 OPEN ITEM (2026-09-17, red1) — SECTION-CUT CAP. A bare clip plane on thin-shell BIM geometry
  // shows a hole, not a cut — red1's own stated concern: WebGL clipping discards fragments beyond the
  // plane, it does not rasterize a fill at the boundary. Standard technique (three.js's own
  // `webgl_clipping_stencil` example): draw every clipped solid's BACK faces first
  // (stencilZPass=INCR_WRAP), then its FRONT faces (stencilZPass=DECR_WRAP) — both colorWrite=false/
  // depthWrite=false, invisible themselves — so wherever the plane crossed a solid an ODD number of
  // times the stencil buffer is left non-zero. One big cap plane, at the cut plane's own position/
  // orientation, then draws (stencilFunc=NOTEQUAL ref=0) ONLY over those non-zero pixels — the real,
  // mesh-shaped cross-section, not a flat see-through rectangle.
  // COVERAGE: built for regular Mesh and InstancedMesh — the two paths a companion object can safely
  // share source data with (matrixWorld / instanceMatrix by reference, no copy) without touching draw
  // internals. BatchedMesh companions are NOT built (its draw-range/matricesTexture internals are not
  // a safe share-by-reference target) — those meshes still clip correctly, they just show a hole
  // where they're cut; counted and reported separately (`batchedSkipped=`), never silently folded
  // into `covered`, per this project's own PRIMAL LAW clause 4 (a witness must report a partial
  // result honestly, not round it up to a silent PASS).
  var _capMeshes = [], _capPlaneMesh = null, _capStencilMats = [];
  var _batchedClones = [], _batchedHidden = [];
  // §129 FIX 3 (2026-09-17, red1: "reframe the render calls... offload from display") — FIX 1 (per-
  // slot setColorAt write) and FIX 2 (null the colorsTexture reference) both proved, exhaustively
  // (pixel readback + raycast + a live magenta-override test that ALSO never reached the screen),
  // that nothing done to a BatchedMesh's material/colour state at the CONTAINER level reaches the
  // pixel this codebase's own raycaster says that container draws. Rather than keep chasing a
  // rendering-internals mismatch with no further JS-visible lever, this bypasses the container
  // entirely: HIDE it (`visible=false`, trivially reversible) and draw its real elements as
  // ordinary, individual `THREE.Mesh` clones instead — exactly how the load-path STACK itself
  // already renders (proven, no mystery). Real API, read from this project's own bundled three.js
  // source at runtime (`BatchedMesh.prototype.getGeometryIdAt/getGeometryRangeAt/getMatrixAt`), not
  // guessed: each instance slot maps to a geometryId, that geometryId maps to an index-buffer
  // {start,count} range into the container's ONE shared vertex/index buffer, and `getMatrixAt` gives
  // its real placement. A plain Mesh sharing those SAME buffer attributes (no copy) with
  // `setDrawRange` set to that one range, and the container's OWN white clone material (already
  // built and clipping-plane-attached by `_applyWhiten`, reused by reference here, not rebuilt),
  // draws exactly that one element — with none of BatchedMesh's per-item colour machinery in the
  // picture at all to fight.
  // EXTENDED (2026-09-17) — a bisection test (hide EVERY top-level scene child, see if the suspect
  // pixels finally go black) proved the wrong colour was real scene geometry, but NOT the specific
  // BatchedMesh container identified and hidden above — some second, overlapping object this file's
  // own guid/reverse-index classification never separately caught was still rendering there.
  // Un-batching InstancedMesh the SAME way (hide the container, draw individual clones) removes that
  // whole class of "in-place per-slot colour" object from the picture too — InstancedMesh shares ONE
  // geometry across all instances (no per-slot geometry-range extraction needed, only `getMatrixAt`),
  // so this is the simpler half of the same fix, not a new mechanism.
  function _buildBatchedElementClones() {
    if (typeof THREE === 'undefined' || !A.scene) return { containers: 0, elements: 0, elementsFailed: 0 };
    var containers = 0, elements = 0, elementsFailed = 0, tmpMat = new THREE.Matrix4();
    _whitenTouched.forEach(function (t) {
      var obj = t.mesh;
      var cl = obj.material;   // the container's own white clone, already built + clip-planed above
      if (obj.isBatchedMesh && obj.getGeometryIdAt && obj.getGeometryRangeAt && obj.getMatrixAt) {
        var bSlotMap = _revBatchIndex[obj.id];
        var bSlotKeys = bSlotMap ? Object.keys(bSlotMap) : [];
        if (!bSlotKeys.length) return;
        var builtAnyB = false;
        bSlotKeys.forEach(function (sk) {
          var slot = +sk;
          try {
            var geomId = obj.getGeometryIdAt(slot);
            var range = obj.getGeometryRangeAt(geomId, {});
            var geo = new THREE.BufferGeometry();
            for (var attrName in obj.geometry.attributes) geo.setAttribute(attrName, obj.geometry.attributes[attrName]);
            if (obj.geometry.index) geo.setIndex(obj.geometry.index);
            geo.setDrawRange(range.start, range.count);
            obj.getMatrixAt(slot, tmpMat);
            tmpMat.premultiply(obj.matrixWorld);
            var m = new THREE.Mesh(geo, cl);
            m.matrixAutoUpdate = false;
            m.matrix.copy(tmpMat);
            m.matrixWorldNeedsUpdate = true;
            m.frustumCulled = false;
            m.userData._loadPathClone = true;   // never a building element / never re-whitened / never in allElse
            A.scene.add(m);
            _batchedClones.push(m);
            elements++; builtAnyB = true;
          } catch (eEl) { elementsFailed++; /* one bad slot must never sink the whole container */ }
        });
        if (builtAnyB) { obj.visible = false; _batchedHidden.push(obj); containers++; }
      } else if (obj.isInstancedMesh && obj.getMatrixAt) {
        var iSlotMap = _revInstanceIndex[obj.id];
        var iSlotKeys = iSlotMap ? Object.keys(iSlotMap) : [];
        if (!iSlotKeys.length) return;
        var builtAnyI = false;
        iSlotKeys.forEach(function (sk) {
          var slot = +sk;
          try {
            obj.getMatrixAt(slot, tmpMat);
            tmpMat.premultiply(obj.matrixWorld);
            var m2 = new THREE.Mesh(obj.geometry, cl);   // ONE shared geometry across all instances — no range extraction needed
            m2.matrixAutoUpdate = false;
            m2.matrix.copy(tmpMat);
            m2.matrixWorldNeedsUpdate = true;
            m2.frustumCulled = false;
            m2.userData._loadPathClone = true;
            A.scene.add(m2);
            _batchedClones.push(m2);
            elements++; builtAnyI = true;
          } catch (eEl2) { elementsFailed++; }
        });
        if (builtAnyI) { obj.visible = false; _batchedHidden.push(obj); containers++; }
      }
    });
    return { containers: containers, elements: elements, elementsFailed: elementsFailed };
  }
  function _restoreBatchedElementClones() {
    var n = _batchedClones.length;
    _batchedClones.forEach(function (m) { A.scene.remove(m); m.geometry.dispose(); });
    _batchedClones = [];
    var nHidden = _batchedHidden.length;
    _batchedHidden.forEach(function (o) { o.visible = true; });
    _batchedHidden = [];
    return { clonesRemoved: n, containersShown: nHidden };
  }
  function _stencilMat(side, incr, plane) {
    var m = new THREE.MeshBasicMaterial({ side: side, colorWrite: false, depthWrite: false });
    m.stencilWrite = true;
    m.stencilFunc = THREE.AlwaysStencilFunc;
    m.stencilRef = 0;
    m.stencilFail = THREE.KeepStencilOp;
    m.stencilZFail = incr ? THREE.IncrementWrapStencilOp : THREE.DecrementWrapStencilOp;
    m.stencilZPass = incr ? THREE.IncrementWrapStencilOp : THREE.DecrementWrapStencilOp;
    m.clippingPlanes = [plane];
    return m;
  }
  function _buildCutCap(cutPlane, buildingBox) {
    if (typeof THREE === 'undefined' || !A.scene || !cutPlane) return { covered: 0, batchedSkipped: 0, capBuilt: false };
    var backMat = _stencilMat(THREE.BackSide, true, cutPlane);
    var frontMat = _stencilMat(THREE.FrontSide, false, cutPlane);
    _capStencilMats.push(backMat, frontMat);
    var covered = 0, batchedSkipped = 0;
    _whitenTouched.forEach(function (t) {
      var mesh = t.mesh;
      if (mesh.isBatchedMesh) { batchedSkipped++; return; }
      if (!mesh.geometry) return;
      var backC, frontC;
      if (mesh.isInstancedMesh) {
        backC = new THREE.InstancedMesh(mesh.geometry, backMat, mesh.count);
        backC.instanceMatrix = mesh.instanceMatrix;
        frontC = new THREE.InstancedMesh(mesh.geometry, frontMat, mesh.count);
        frontC.instanceMatrix = mesh.instanceMatrix;
      } else {
        backC = new THREE.Mesh(mesh.geometry, backMat);
        frontC = new THREE.Mesh(mesh.geometry, frontMat);
      }
      [backC, frontC].forEach(function (c) {
        c.matrixAutoUpdate = false;
        c.matrix.copy(mesh.matrixWorld);   // companion sits directly under scene (identity parent) — local matrix = desired world matrix
        c.matrixWorldNeedsUpdate = true;
        c.frustumCulled = false;
        c.renderOrder = -1;                // stencil-mark BEFORE the cap plane reads the stencil buffer
        c.userData._loadPathClone = true;  // never a building element / never re-whitened / never in allElse
        A.scene.add(c);
        _capMeshes.push(c);
      });
      covered++;
    });
    var capBuilt = false;
    if (buildingBox && covered > 0) {
      var n = cutPlane.normal.clone();
      var centre = new THREE.Vector3((buildingBox.minX + buildingBox.maxX) / 2, (buildingBox.minY + buildingBox.maxY) / 2, (buildingBox.minZ + buildingBox.maxZ) / 2);
      var d = n.dot(centre) + cutPlane.constant;
      var onPlane = centre.clone().sub(n.clone().multiplyScalar(d));
      var diag = Math.hypot(buildingBox.maxX - buildingBox.minX, buildingBox.maxY - buildingBox.minY, buildingBox.maxZ - buildingBox.minZ);
      var size = Math.max(1, diag) * 1.5;
      var capMat = new THREE.MeshStandardMaterial({ color: CONCRETE_GREY_HEX, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
      capMat.stencilWrite = true;
      capMat.stencilRef = 0;
      capMat.stencilFunc = THREE.NotEqualStencilFunc;
      capMat.stencilFail = THREE.KeepStencilOp;
      capMat.stencilZFail = THREE.KeepStencilOp;
      capMat.stencilZPass = THREE.KeepStencilOp;   // read-only test — the cap draw never mutates the stencil buffer further
      _capPlaneMesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), capMat);
      _capPlaneMesh.position.copy(onPlane);
      _capPlaneMesh.lookAt(onPlane.clone().sub(n));   // local +Z (the plane's face normal) ends up aligned with `n`
      _capPlaneMesh.renderOrder = -0.5;                // after the stencil marks, before/with the normal colour pass
      _capPlaneMesh.userData._loadPathClone = true;
      A.scene.add(_capPlaneMesh);
      capBuilt = true;
    }
    return { covered: covered, batchedSkipped: batchedSkipped, capBuilt: capBuilt, capMat: _capPlaneMesh ? _capPlaneMesh.material : null };
  }
  // §129 OPEN ITEM (2026-09-17) — re-slides the cap plane's own position to track the SAME plane's
  // current (possibly mid-sweep) constant, every frame the fade is live. The stencil companions need
  // no equivalent per-frame touch (they read `cutPlane.constant` at render time via `clippingPlanes`,
  // same as any other clipped material) — only this VISUAL cap mesh's own transform is derived from
  // the plane, once, at build time, and therefore needs re-deriving whenever the plane moves.
  function _updateCapPlane(cutPlane, buildingBox) {
    if (!_capPlaneMesh || !cutPlane || !buildingBox || typeof THREE === 'undefined') return;
    var n = cutPlane.normal;
    var centre = new THREE.Vector3((buildingBox.minX + buildingBox.maxX) / 2, (buildingBox.minY + buildingBox.maxY) / 2, (buildingBox.minZ + buildingBox.maxZ) / 2);
    var d = n.dot(centre) + cutPlane.constant;
    var onPlane = centre.clone().sub(n.clone().multiplyScalar(d));
    _capPlaneMesh.position.copy(onPlane);
    _capPlaneMesh.lookAt(onPlane.clone().sub(n));
  }
  function _restoreCutCap() {
    var n = _capMeshes.length;
    _capMeshes.forEach(function (c) { A.scene.remove(c); });
    _capMeshes = [];
    _capStencilMats.forEach(function (m) { m.dispose(); });
    _capStencilMats = [];
    var hadPlane = !!_capPlaneMesh;
    if (_capPlaneMesh) {
      A.scene.remove(_capPlaneMesh);
      _capPlaneMesh.geometry.dispose();
      _capPlaneMesh.material.dispose();
      _capPlaneMesh = null;
    }
    return { companionsRemoved: n, planeRemoved: hadPlane };
  }

  function _restoreWhiten() {
    var n = _whitenTouched.length;
    _whitenTouched.forEach(function (t) { t.mesh.material = t.mat; });
    _whitenTouched = [];
    _whitenClones.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    _whitenClones = [];
    var instRestored = 0;
    _whitenInstColor.forEach(function (t) {
      var ok = true;
      for (var _sr = 0; _sr < t.slots.length; _sr++) {
        var _s = t.slots[_sr];
        try { t.mesh.setColorAt(_s.idx, _whitenTmpColor.setHex(_s.hex)); } catch (eRestore) { ok = false; }
      }
      if (t.mesh.instanceColor) t.mesh.instanceColor.needsUpdate = true;
      if (ok) instRestored++;
    });
    var instTotal = _whitenInstColor.length;
    _whitenInstColor = [];
    _whitenColorPairs = [];
    var batchTexRestored = 0;
    _whitenBatchColorTex.forEach(function (t) { t.mesh._colorsTexture = t.backup; batchTexRestored++; });
    var batchTexTotal = _whitenBatchColorTex.length;
    _whitenBatchColorTex = [];
    return { n: n, instRestored: instRestored, instTotal: instTotal, batchTexRestored: batchTexRestored, batchTexTotal: batchTexTotal };
  }

  // ── v8 WITNESS helpers — solid means "has its own clone mesh, visible, opaque" (unchanged from v4).
  // nearSideClipped/beyondVisible are new (third amendment): a ghosted object with the clip plane
  // applied "survives" (beyondVisible) if its OWN Box3 centre sits on the FAR side of the plane — a
  // real geometric check, not a render sample; a bug that puts the plane behind everything (or an
  // empty far side) reads as beyondVisible=0, reproducing v1's "everything hidden" defect on demand. ──
  function _isSolid(h) {
    var m = h._cloneMesh;
    if (!m) return false;
    var mat = m.material;
    var matOk = !mat ? true : ((mat.opacity == null || mat.opacity >= 0.99) && !(mat.clippingPlanes && mat.clippingPlanes.length));
    return !!m.visible && matOk;
  }
  // §129.8 item 3 — `stack` ({name, hopsUp, revealedHops}) replaces the implicit `_lp` read so the
  // SAME witness serves both FAR and NEAR; `_lp.ghostResult`/`_clipPlane` stay GLOBAL reads (ONE
  // ghost/clip pass covers the whole scene regardless of which stack is being reported).
  function _visibleWitness(stack, stackName) {
    var N = stack.hopsUp.length, solid = 0;
    stack.hopsUp.forEach(function (h) { if (_isSolid(h)) solid++; });
    var ghostedN = _lp.ghostResult ? Math.max(0, _lp.ghostResult.n - _lp.ghostResult.hiddenN) : 0;
    var hiddenN = _lp.ghostResult ? _lp.ghostResult.hiddenN : 0;
    // §129 OPEN ITEM — the section-cut plane (shine mode) INTENTIONALLY puts clippingPlanes on every
    // whitened material now; the old "shine mode clips nothing" invariant below is retired to "clips
    // nothing IT DIDN'T MEAN TO" — sectionCutClippedN is that expected population, counted
    // separately so a REAL leak (an unrelated clip plane surviving somewhere) still fails this.
    var clippedN = 0, sectionCutClippedN = 0;
    A.collectMeshes(function (o) { return o.isMesh && o.material && !Array.isArray(o.material) && o.material.clippingPlanes && o.material.clippingPlanes.length; })
      .forEach(function (o) {
        clippedN++;
        if (_lp.sectionCutPlane && o.material.clippingPlanes.indexOf(_lp.sectionCutPlane) !== -1) sectionCutClippedN++;
      });
    var unexpectedClippedN = clippedN - sectionCutClippedN;
    // v8b HARDENED (review, 2026-09-15, after a real HHS bake showed __lpClipAll leaving
    // beyondVisible=10: a degenerate/empty Box3 — NaN or inverted min>max, e.g. a zero-vertex or
    // not-yet-updated mesh — used to count toward beyondVisible whenever the dot-product happened to
    // land >= 0 by NaN/Infinity arithmetic coincidence, not a real geometric fact. Those are now
    // excluded from beyondVisible and reported separately as `emptyBoxes` — never silently folded
    // into either count.
    var nearSideClipped = 0, beyondVisible = 0, emptyBoxes = 0;
    if (_clipPlane && typeof THREE !== 'undefined') {
      _ghostTouched.forEach(function (t) {
        if (t.kind !== 'mat' || !t.clone || t.clone.clippingPlanes !== _clipPlane && !(t.clone.clippingPlanes && t.clone.clippingPlanes[0] === _clipPlane)) return;
        nearSideClipped++;
        try {
          var b = new THREE.Box3().setFromObject(t.mesh);
          var finite = isFinite(b.min.x) && isFinite(b.min.y) && isFinite(b.min.z) &&
            isFinite(b.max.x) && isFinite(b.max.y) && isFinite(b.max.z) &&
            b.min.x <= b.max.x && b.min.y <= b.max.y && b.min.z <= b.max.z;
          if (!finite) { emptyBoxes++; return; }
          var c = b.getCenter(new THREE.Vector3());
          if (_clipPlane.normal.dot(c) + _clipPlane.constant >= 0) beyondVisible++;
        } catch (e) { emptyBoxes++; }
      });
    }
    // v10 LOOK reconciliation: under v8b "the whole stack is solid from arm", solid===N was the
    // right invariant. v10 makes solidity a FUNCTION OF TIME (bottom-up, one layer per step, none
    // solid at arm) — §LOADPATH_STACK (above) is what proves that progression is correct STEP BY
    // STEP; this witness's own job is unchanged (materials/hidden/clipped are real, no leaks) so its
    // bar is now "solid count matches how many layers have had their turn AT THIS MOMENT"
    // (_lp.revealedHops), not "every layer, always" — a real defect (e.g. a hop stuck ghost past its
    // own turn, or solid before it) still fails this exactly as before.
    // §129.7 item 7 — ghostOpacity must stay a GHOST, never creep toward a solid-looking value.
    // ROUND 5 item 3 (2026-09-16, real Terminal bake: `solid=5` of `hops=7` printed PASS — a hole).
    // A hop whose clone never got BUILT AT ALL (h._cloneMissing set — no source instance, no cached
    // geometry) can NEVER become solid no matter how far the reveal progresses: that is a structural
    // defect, not a timing one, and the old `solid===revealedHops` check alone could not tell "on
    // track, mid-progression" apart from "permanently stuck below K". Named explicitly (guid:reason)
    // so a real bake's log states exactly which member is missing and why — never just a number.
    var missingHops = [];
    stack.hopsUp.forEach(function (h) { if (h._cloneMissing) missingHops.push(h.guid + ':' + h._cloneMissing); });
    // §129.8 item 1 — shine mode: ghosted/clipped fields are 0 by construction (no ghost pass, no
    // clip plane ever runs — see the arm-time gate); PASS criterion is solid==K (K = however many
    // of this stack's hops have had their turn so far, `stack.revealedHops` — the SAME "on track,
    // mid-progression" semantic the pre-129.8 single-stack witness already proved correct, never a
    // literal "every hop, always" which the mid-hold moment does not generally coincide with).
    var ok = (solid === stack.revealedHops) && (_lookGhost() ? (_clipPlane ? beyondVisible > 0 : hiddenN === 0 && unexpectedClippedN === 0) : (hiddenN === 0 && unexpectedClippedN === 0)) &&
      (GHOST_OPACITY < 0.50) && missingHops.length === 0;
    console.log('§LOADPATH_VISIBLE stack=' + (stackName || stack.name) + ' hops=' + N + ' solid=' + solid + ' ghosted=' + ghostedN +
      ' hidden=' + hiddenN + ' clipped=' + clippedN + ' sectionCutClipped=' + sectionCutClippedN + ' unexpectedClipped=' + unexpectedClippedN +
      ' nearSideClipped=' + nearSideClipped +
      ' beyondVisible=' + beyondVisible + ' emptyBoxes=' + emptyBoxes +
      ' ghostOpacity=' + GHOST_OPACITY.toFixed(2) + ' solidOpacity=' + SOLID_OPACITY.toFixed(2) +
      ' missing=[' + missingHops.join(',') + ']' +
      ' => ' + (ok ? 'PASS' : 'FAIL'));
  }
  // v4: the bbox is the clones' OWN geometry-aware THREE.Box3 in scene space (not a padded point
  // cloud) — per instruction, after updateMatrixWorld(true) on each clone.
  // §129.8 item 3 — parameterized (`hopsUp`, defaulting to the NEAR stack's own `_lp.hopsUp` for
  // every pre-existing call site) so the SAME box math serves either stack, never a second copy.
  function _chainWorldBBox(hopsUp) {
    var box = null;
    (hopsUp || _lp.hopsUp).forEach(function (h) {
      if (!h._cloneMesh) return;
      h._cloneMesh.updateMatrixWorld(true);
      var b = new THREE.Box3().setFromObject(h._cloneMesh);
      if (!box) box = b; else box.union(b);
    });
    return box;
  }
  // ══ ROUND 5 (2026-09-16, real Terminal bake: PICK said visibleHops=7/7 from DB-metadata boxes,
  // but the CLONE MESHES the film actually draws were somewhere else — none in frustum, two not even
  // solid) ═══════════════════════════════════════════════════════════════════════════════════════
  // "the same path that places the real geometry can never disagree with it": find the SOURCE
  // INSTANCE (container + slot) a guid actually lives in — A._instanceGuids is the ready-made O(1)
  // index streaming.js already maintains for InstancedMesh elements; BatchedMesh elements have no
  // such index (only the reverse A.guidMap[meshId_slotId]->guid), so those fall back to a scoped
  // linear scan of A._batchMeta (done once per hop at ARM/BUILD time, never per-frame). Returns the
  // REAL, currently-rendered world matrix — container.getMatrixAt(index) premultiplied by the
  // container's own matrixWorld — so no independent re-derivation of building offset / ifc2three
  // scale-rotation / any container-level transform can ever disagree with what is actually drawn.
  function _sourceInstance(guid) {
    if (!A.scene || typeof THREE === 'undefined') return null;
    var meshId = null, index = null;
    var hit = A._instanceGuids && A._instanceGuids[guid];
    if (hit) { meshId = hit.meshId; index = hit.instanceIndex; }
    else if (A._batchMeta) {
      for (var mid in A._batchMeta) {
        var arr = A._batchMeta[mid];
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && arr[i].guid === guid) { meshId = Number(mid); index = (arr[i].slotId != null) ? arr[i].slotId : i; break; }
        }
        if (meshId != null) break;
      }
    }
    if (meshId == null || index == null) return null;
    var mesh = A.scene.getObjectById(meshId);
    if (!mesh || typeof mesh.getMatrixAt !== 'function') return null;
    if (mesh.updateMatrixWorld) mesh.updateMatrixWorld(true);
    var local = new THREE.Matrix4();
    mesh.getMatrixAt(index, local);
    var world = local.clone().premultiply(mesh.matrixWorld);
    return { mesh: mesh, index: index, world: world };
  }
  // The container's own LOCAL (pre-world) bounding box for one slot — `getBoundingBoxAt` (modern
  // BatchedMesh API) when the container has it, else the shared `geometry.boundingBox` (InstancedMesh
  // — every instance shares one geometry, so this IS that slot's own local box).
  function _sourceLocalBox(mesh, index) {
    var box = new THREE.Box3();
    if (typeof mesh.getBoundingBoxAt === 'function') { mesh.getBoundingBoxAt(index, box); return box; }
    if (mesh.geometry) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.copy(mesh.geometry.boundingBox);
      return box;
    }
    return null;
  }
  // Real world AABB for a guid, from its SOURCE INSTANCE — the SAME box `_buildChainClones` places
  // its clone at and `§LOADPATH_CLONES` measures against. Returns null when no source instance can
  // be found (never falls back to the DB-coordinate math this round replaces — a hop this cannot
  // resolve is simply not counted as visible/measured, rather than risking a second disagreement).
  function _instanceWorldBox(guid) {
    var src = _sourceInstance(guid);
    if (!src) return null;
    var local = _sourceLocalBox(src.mesh, src.index);
    if (!local) return null;
    var world = local.clone().applyMatrix4(src.world);
    if (!isFinite(world.min.x) || !isFinite(world.max.x)) return null;
    return { minX: world.min.x, maxX: world.max.x, minY: world.min.y, maxY: world.max.y,
             minZ: world.min.z, maxZ: world.max.z, _box3: world, _srcWorld: src.world, _srcLocal: local };
  }
  A._loadPathSourceInstance = _sourceInstance; A._loadPathInstanceWorldBox = _instanceWorldBox;
  A._loadPathSearchHoldPoint = _searchHoldPoint;   // ROUND 7 — direct dry run of the fallback criterion

  // ── v8: world AABBs straight from items[]' own DB-space bbox (x0/x1/y0/y1/bz/tz, already built for
  // the support-physics graph — zero extra DB queries) via A.modelOffset, the SAME axis mapping
  // A.ifc2three uses (X unchanged, Y=IFC Z, Z=-IFC Y — min/max on Z flip because of the negation).
  // No rotation is applied (matches A.ifc2three's own point-only contract) — an approximation for
  // rotated elements, disclosed in §129.4, not invented away. Still used for buildingBox/stackBox
  // (whole-building/whole-chain framing, informational) — NEVER for per-hop visibility any more
  // (ROUND 5 item 4 — see _instanceWorldBox above, which PICK's own visibleHopsOf/minMemberPxOf use). ──
  function _worldAABBFromItem(item) {
    var off = (A.modelOffset) || { x: 0, y: 0, z: 0 };
    return {
      minX: item.x0 - off.x, maxX: item.x1 - off.x,
      minY: item.bz - off.z, maxY: item.tz - off.z,
      minZ: -(item.y1 - off.y), maxZ: -(item.y0 - off.y)
    };
  }
  function _unionAABB(a, b) {
    if (!a) return b; if (!b) return a;
    return { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX),
             minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY),
             minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) };
  }
  function _buildingWorldBBox(items) {
    var box = null;
    for (var i = 0; i < items.length; i++) box = _unionAABB(box, _worldAABBFromItem(items[i]));
    return box;
  }
  function _cornersOfAABB(box) {
    var out = [];
    for (var xi = 0; xi < 2; xi++) for (var yi = 0; yi < 2; yi++) for (var zi = 0; zi < 2; zi++)
      out.push(new THREE.Vector3(xi ? box.maxX : box.minX, yi ? box.maxY : box.minY, zi ? box.maxZ : box.minZ));
    return out;
  }
  // ROUND 6 (2026-09-16, real Terminal bake: FRAMING aimed the camera at A.controls.target — stale/
  // wrong on Terminal's site coordinates, since cinema_maxq drives the bake camera directly and
  // never keeps controls.target in sync — reading `hopsIntersecting=0/7` while PICK's own
  // instance-world-box test, at the SAME shot pose, said 7/7) — the frustum-vs-box test itself is
  // factored out so it can run EITHER against a pushed HYPOTHETICAL pose (PICK's shot-search over
  // `plan.poseAt`, which carries its own real tx/ty/tz — never touches controls.target) OR against
  // the camera's CURRENT, already-correct matrices with no re-aim at all (FRAMING, at the live hold
  // pose — see _projectAABBLive below).
  function _frustumTestAtCurrentPose(box, camera) {
    var corners = _cornersOfAABB(box);
    var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    // v8c HARDENED (review, 2026-09-15, after a real HHS bake showed __lpFrameOff's own
    // hopsIntersecting stuck at 4/5, PASS, even though buildingInFrame correctly read 0.000): the
    // old "intersects" test took the min/max NDC span of all 8 projected corners with no regard to
    // whether a corner was actually IN FRONT of the camera (p.z<=1) — a box thousands of metres off
    // to the side has corners at extreme angles, some BEHIND the camera, whose perspective divide by
    // a near-zero/negative w flips their NDC sign onto essentially arbitrary values; the resulting
    // min/max span routinely covers all of [-1,1] by that artifact alone, reading "intersects=true"
    // for a box nowhere near the frustum. Replaced with a REAL frustum/box test (THREE.Frustum),
    // built from the SAME projectionMatrix/matrixWorldInverse.
    var fr = null;
    if (typeof THREE.Frustum === 'function' && typeof THREE.Matrix4 === 'function' && camera.matrixWorldInverse) {
      var frMat = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      fr = new THREE.Frustum().setFromProjectionMatrix(frMat);
    }
    var intersects;
    if (fr) {
      var fbox = new THREE.Box3(new THREE.Vector3(box.minX, box.minY, box.minZ), new THREE.Vector3(box.maxX, box.maxY, box.maxZ));
      intersects = fr.intersectsBox(fbox);
    }
    // ROUND 7 (2026-09-16, real Terminal bake: §LOADPATH_SHOT's own `buildingInFrame` — the SAME
    // per-corner check `fraction` here feeds — read 0.125 while FRAMING's `intersects`-based test on
    // the SAME pose read a different, frustum-correct picture; "the same corner-vs-frustum
    // inconsistency" as the v8c fix above, just in the OTHER metric this function returns): `fraction`
    // now counts a corner as "in" via `fr.containsPoint(corner)` — a WORLD-SPACE test against the
    // frustum's 6 planes — instead of the old NDC-range-plus-p.z<=1 check, which suffered the exact
    // same perspective-divide sign-flip artifact intersects used to. `containsPoint` cannot flip sign
    // (no perspective divide involved at all), so a corner behind/beside the camera is correctly
    // never counted, and one genuinely inside the frustum volume always is.
    var inCount = 0;
    corners.forEach(function (c) {
      var p = c.clone().project(camera);   // still needed for xmin/xmax/ymin/ymax (ndcHeight) and the stub fallback below
      xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y);
      var inFrustum = fr ? fr.containsPoint(c) : (p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1 && p.z <= 1);
      if (inFrustum) inCount++;
    });
    if (intersects == null) {
      // Fallback for a camera/THREE stub with no Frustum support — the old min/max span test,
      // known-imprecise on off-axis/behind-camera boxes, kept only so a call never throws outright.
      intersects = !(xmax < -1 || xmin > 1 || ymax < -1 || ymin > 1);
    }
    // §129.7 item 3 (2026-09-16) — the NDC y-span of the SAME 8 corners already projected above,
    // for `_memberPxHeight` below (never a second, re-projected opinion of the box's screen size).
    var ndcHeight = (isFinite(ymin) && isFinite(ymax)) ? Math.max(0, ymax - ymin) : null;
    // §129.8 item 2 — the NDC x-span too, for `screenArea` (§LOADPATH_FRAMING's own memberPx and
    // the scoring formula's screenArea) — SAME 8 corners, never a second projection.
    var ndcWidth = (isFinite(xmin) && isFinite(xmax)) ? Math.max(0, xmax - xmin) : null;
    return { fraction: inCount / 8, intersects: intersects, ndcHeight: ndcHeight, ndcWidth: ndcWidth };
  }
  // Corner-in-NDC fraction (0..1 of 8) for `box`, at a HYPOTHETICAL `pose` (a plain
  // {x,y,z,tx,ty,tz} — from `plan.poseAt`, the film's OWN planned position+look-target, NEVER
  // `A.controls.target`) using `camera` as a template (its own fov/aspect/projectionMatrix —
  // position/target/up are pushed to `pose` for the probe, then restored, since this evaluates a
  // CANDIDATE pose the live scene is not actually at — PICK's hold-point search only).
  function _projectAABB(box, pose, camera) {
    if (!camera || typeof THREE === 'undefined' || !camera.lookAt) return null;
    var savedPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    var savedUp = camera.up ? { x: camera.up.x, y: camera.up.y, z: camera.up.z } : null;
    camera.position.set(pose.x, pose.y, pose.z);
    if (camera.up && camera.up.set) camera.up.set(0, 1, 0);
    camera.lookAt(pose.tx, pose.ty, pose.tz);
    if (camera.updateMatrixWorld) camera.updateMatrixWorld();
    var result = _frustumTestAtCurrentPose(box, camera);
    camera.position.set(savedPos.x, savedPos.y, savedPos.z);
    if (savedUp && camera.up && camera.up.set) camera.up.set(savedUp.x, savedUp.y, savedUp.z);
    return result;
  }
  // ROUND 6 — the LIVE-pose test: the camera is ALREADY at its correct, real position+orientation
  // (the hold's own re-assert, item 1 below, put it there) — no pose is pushed, no lookAt, nothing
  // restored. This is what FRAMING projects with now, and the ONLY thing that fixes
  // "hopsIntersecting=0/7 while PICK said 7/7 at the SAME world boxes": the old code was aiming the
  // camera AWAY from the building via a stale A.controls.target before testing.
  function _projectAABBLive(box, camera) {
    if (!camera || typeof THREE === 'undefined') return null;
    if (camera.updateMatrixWorld) camera.updateMatrixWorld();
    return _frustumTestAtCurrentPose(box, camera);
  }
  // ROUND 6 — exposed for a direct node dry run proving the OLD (pose-with-controls.target-driven
  // lookAt) vs NEW (live, no-reaim) behaviour on the exact same camera/box.
  A._loadPathProjectAABB = _projectAABB; A._loadPathProjectAABBLive = _projectAABBLive;
  // §129.7 item 3 — "a thicker member or a nearer one both raise it": the projected bbox HEIGHT in
  // PIXELS of one item at one pose, from the SAME `_projectAABB` NDC math every other visibility
  // check here already uses (`ndcHeight` spans a [-1,1] axis, i.e. 2 NDC units == `outH` px).
  function _memberPxHeight(box, pose, camera, outH) {
    var r = _projectAABB(box, pose, camera);
    if (!r || r.ndcHeight == null) return 0;
    return r.ndcHeight * (outH || 1080) / 2;
  }
  // ROUND 6 — the live-pose counterpart (FRAMING's own memberPx, no re-aim, see _projectAABBLive).
  function _memberPxHeightLive(box, camera, outH) {
    var r = _projectAABBLive(box, camera);
    if (!r || r.ndcHeight == null) return 0;
    return r.ndcHeight * (outH || 1080) / 2;
  }
  // §129.8 item 2 — screenArea (px²) of a box's projection at a live pose. Same NDC math every
  // other visibility check here already uses; never re-derived. Used both by the scoring formula
  // (item 3, screenArea) and by §LOADPATH_FRAMING's own memberPx print.
  function _screenAreaPxLive(box, camera, outW, outH) {
    var r = _projectAABBLive(box, camera);
    if (!r || r.ndcHeight == null || r.ndcWidth == null) return 0;
    return (r.ndcWidth * (outW || 1920) / 2) * (r.ndcHeight * (outH || 1080) / 2);
  }
  A._loadPathScreenAreaPxLive = _screenAreaPxLive;

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // §129.8 item 2 — VISIBLE = UNOCCLUDED. Raycasts from the camera to sample points on a member's
  // OWN camera-facing box faces, against the REAL building meshes (the SAME universe `_applyGhost`'s
  // own ghost-everything pass already iterates via A.collectMeshes — reused, never a second list),
  // and maps a hit back to a guid the same way `_sourceInstance`'s own forward lookup works,
  // REVERSED. Raycast ONLY at the hold pose, ONCE per candidate that already passed the (cheap)
  // frustum test — never per frame (§129.8 item 2's own "mind cost").
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // ROUND 13 (2026-09-16, real HHS bake: `memberVis=[0,0,0,0,0]` on a frustum-5/5 ladder — a
  // THREE.Raycaster hit against a BatchedMesh carries `hit.batchId`, NEVER `hit.instanceId`; the
  // OLD code below only ever received `instanceId`, so the guid never resolved and every candidate
  // read 0 unoccluded regardless of true occlusion) — BOTH reverse indexes are now built ONCE,
  // together, on first use: `_revInstanceIndex` from A._instanceGuids (InstancedMesh), `_revBatchIndex`
  // from A._batchMeta (BatchedMesh) — never a per-hit linear scan, which the OLD BatchedMesh branch
  // here was doing (a scan of A._batchMeta[object.id] on every single ray).
  var _revInstanceIndex = null;   // {meshId: {instanceIndex: guid}} — lazily built from A._instanceGuids
  var _revBatchIndex = null;      // {meshId: {slotId: guid}} — lazily built from A._batchMeta
  // ROUND 15 item 1 — guid -> IFC class, for the `hop0Occluder=IfcWall:guid` diagnostic. Sourced
  // straight from `A._batchMeta`'s own `ifcClass` field (streaming.js's own `_batchMeta[meshId] =
  // [{guid, storey, disc, ifcClass, slotId}, ...]` shape) — never a second DB query in the hot
  // raycast loop. InstancedMesh guids (`A._instanceGuids`, which carries no class field) read as
  // unknown here — disclosed, never invented.
  var _revGuidClass = null;       // {guid: ifcClass}
  function _buildReverseIndexes() {
    _revInstanceIndex = {};
    var ig = A._instanceGuids || {};
    for (var g in ig) {
      var hit = ig[g];
      if (hit == null || hit.meshId == null) continue;
      if (!_revInstanceIndex[hit.meshId]) _revInstanceIndex[hit.meshId] = {};
      _revInstanceIndex[hit.meshId][hit.instanceIndex] = g;
    }
    _revBatchIndex = {};
    _revGuidClass = {};
    var bm = A._batchMeta || {};
    for (var mid in bm) {
      var arr = bm[mid];
      if (!arr) continue;
      if (!_revBatchIndex[mid]) _revBatchIndex[mid] = {};
      for (var k = 0; k < arr.length; k++) {
        var rec = arr[k];
        if (!rec) continue;
        var slot = (rec.slotId != null) ? rec.slotId : k;
        _revBatchIndex[mid][slot] = rec.guid;
        if (rec.guid != null && rec.ifcClass != null) _revGuidClass[rec.guid] = rec.ifcClass;
      }
    }
  }
  function _classForGuid(guid) {
    if (!_revGuidClass) _buildReverseIndexes();
    return (guid != null && _revGuidClass[guid] != null) ? _revGuidClass[guid] : null;
  }
  A._loadPathClassForGuid = _classForGuid;
  // `slotId` — the CALLER passes `hits[0].batchId != null ? hits[0].batchId : hits[0].instanceId`
  // (whichever the real hit actually carries), never `instanceId` alone. O(1) both branches.
  function _reverseGuidFor(object, slotId) {
    if (!_revInstanceIndex) _buildReverseIndexes();
    var byIdx = _revInstanceIndex[object.id];
    if (byIdx && slotId != null && byIdx[slotId] != null) return byIdx[slotId];
    var byBatch = _revBatchIndex[object.id];
    if (byBatch && slotId != null && byBatch[slotId] != null) return byBatch[slotId];
    if (object.userData && object.userData.guid) return object.userData.guid;   // a plain (non-instanced) mesh, best-effort
    return null;
  }
  // The raycast universe — regular + instanced/batched building meshes, EXCLUDING this beat's own
  // clones (userData._loadPathClone) so a stack can never occlude itself. Cached once per hold
  // (reset at build/dispose), never rebuilt per candidate or per sample point. Fix 1b (ROUND 13,
  // belt AND suspenders): every clone ALSO gets `mesh.raycast = noop` at build time
  // (`_buildChainClones`), so this filter alone is never the only thing standing between a clone
  // and a false self-hit.
  var _rayMeshCache = null;
  function _raycastUniverse() {
    if (_rayMeshCache) return _rayMeshCache;
    if (!A.collectMeshes) return (_rayMeshCache = []);
    var regular = A.collectMeshes(function (o) { return o.isMesh && !o.isInstancedMesh && !o.isBatchedMesh && !(o.userData && o.userData._loadPathClone); });
    var instBatch = A.collectMeshes(function (o) { return (o.isInstancedMesh || o.isBatchedMesh) && !(o.userData && o.userData._loadPathClone); });
    _rayMeshCache = regular.concat(instBatch);
    return _rayMeshCache;
  }
  function _resetRayCache() { _rayMeshCache = null; _revInstanceIndex = null; _revBatchIndex = null; _revGuidClass = null; }
  A._loadPathRaycastUniverse = _raycastUniverse; A._loadPathReverseGuidFor = _reverseGuidFor;
  A._loadPathResetRayCache = _resetRayCache;

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // §LOADPATH_BACKDROP generalized population (2026-09-16, red1 direct ruling: "ALL ELSE FADE OFF" —
  // no enumerated exceptions). "Is this object a real building element" (never faded) vs "is this
  // backdrop/context/staffage/prop" (must fade) is decided by the SAME reverse-guid machinery this
  // file already built for raycast occlusion — never a second, disagreeing classifier:
  //   • InstancedMesh/BatchedMesh: a container is a recognized building-element source iff its own
  //     mesh id has a NON-EMPTY entry in `_revInstanceIndex`/`_revBatchIndex` (built from
  //     A._instanceGuids/A._batchMeta — populated ONLY for real IFC-streamed elements, streaming.js).
  //     An instanced/batched container that resolves NO guids at all (e.g. a city-mode bbox
  //     placeholder, viewer/city.js — a different feature, never expected to coexist with a
  //     load-path beat's own hold, but classified correctly either way by this check rather than by
  //     assuming "any InstancedMesh is building") is therefore NOT exempted from the fade.
  //   • A regular (non-instanced/batched) mesh carrying `userData.isMerged` (streaming.js
  //     §MERGED_GUID) IS a building element despite having no single `userData.guid` of its own —
  //     it groups MULTIPLE real elements' geometry into one mesh, addressed via A._mergedMeta's own
  //     idxStart/idxCount ranges, not a mesh-level guid. Read directly in streaming.js (~L2519) before
  //     writing this check: without it, EVERY merged bucket (any storey/discipline/material group the
  //     compiler chose not to instance) would misclassify as "all else" and fade part of the real
  //     building — the exact risk this file's own task brief warned about, caught by reading the
  //     code, not guessed.
  //   • Otherwise (a plain regular mesh): building element iff `userData.guid` resolves, the SAME
  //     best-effort branch `_reverseGuidFor` itself falls back to for a non-instanced hit.
  function _isBuildingElementObj(obj) {
    if (obj.userData && obj.userData.isMerged) return true;   // streaming.js §MERGED_GUID — real geometry, no single guid
    if (obj.isInstancedMesh || obj.isBatchedMesh) {
      if (!_revInstanceIndex) _buildReverseIndexes();
      var byIdx = _revInstanceIndex[obj.id];
      if (byIdx && Object.keys(byIdx).length) return true;
      var byBatch = _revBatchIndex[obj.id];
      if (byBatch && Object.keys(byBatch).length) return true;
      return false;
    }
    return !!(obj.userData && obj.userData.guid != null);
  }
  A._loadPathIsBuildingElementObj = _isBuildingElementObj;
  // The "all else" population itself — every VISIBLE object A.collectMeshes's traversal reaches that
  // is neither this beat's own clone nor a recognized building element (above). Reuses A.collectMeshes
  // (the SAME universe `_applyGhost`/`_raycastUniverse` already walk — no second scene traversal),
  // broadened to ALSO match THREE.Sprite: staffage people/trees (§STAFFAGE_*, viewer/effects.js
  // §PHOTO_STAFFAGE) are cutout sprites, not meshes, and the user's own ruling explicitly names them
  // ("staffage — people/cars/trees... must ALSO fade off") — dropping them because the reused
  // predicate style elsewhere in this file happens to say `isMesh` only would silently lose the exact
  // coverage this generalization exists to add. The staffage CAR (a real THREE.Mesh, a loaded BufferGeometry,
  // §STAFFAGE_CAR_MESH) and ground/sky/skyline all fall out of "not a building element" naturally —
  // no hand-picked list.
  // A.ground is the ONE object A.collectMeshes itself always excludes ("Excludes ground plane",
  // viewer/helpers.js) — captured explicitly here IN ADDITION, never dropped. A._sky (three.js's own
  // Sky class extends Mesh, added directly via `scene.add(_sky)`) and the photo-skyline's box meshes
  // (THREE.Mesh, added into a THREE.Group that IS in the scene, viewer/effects.js) are both regular,
  // un-guid'd meshes A.collectMeshes's traversal already reaches on its own — verified by reading
  // scene.js/effects.js, not assumed — so neither needs the same explicit add-back A.ground does.
  function _allElseObjects() {
    var out = [];
    if (typeof A.collectMeshes === 'function') {
      A.collectMeshes(function (o) {
        if (o.userData && o.userData._loadPathClone) return false;   // never our own overlay — see _applyGhost's own gate
        if (o.visible === false) return false;                       // fade what is actually shown, never an already-hidden object
        // Fix (2026-09-17, red1: "background complete fade off" — confirmed real, not hypothetical:
        // `effects.js`'s skyline window-light glow (`_photoSkylineLights`, a `THREE.Points` object)
        // is genuinely visible during a load-path hold — `§PHOTO_STAGING on` fires and stays on
        // through the hold in a real bake (HHS_loadpath_r25.log) — and was silently excluded here
        // because this predicate never matched `isPoints`. `collectMeshes` itself does a raw
        // `scene.traverse` with no type pre-filter (helpers.js) — it reaches Points fine, this
        // predicate just never asked for them. `PointsMaterial` has the same standard
        // `.opacity`/`.transparent` fields `_backdropCapture`'s generic fade already reads off any
        // material — no special-casing needed once it's in the population.
        if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isSprite || o.isPoints)) return false;
        return !_isBuildingElementObj(o);
      }).forEach(function (o) { out.push(o); });
    }
    if (A.ground && A.ground.material && A.ground.visible !== false) out.push(A.ground);
    return out;
  }
  A._loadPathAllElseObjects = _allElseObjects;

  // Sample points on the box faces that face `camPos` — up to 3 faces face any exterior point of an
  // AABB; a grid of side*side points per facing face, side = ceil(sqrt(S/facingCount)), so the total
  // is >= S (never fewer — S is a MINIMUM, per the spec's own "sample S points, S >= 9"). Degenerate
  // (camera inside the box — no face faces it) samples all 6 rather than returning zero points.
  function _facingFaceSamples(box, camPos, S) {
    var cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2, cz = (box.minZ + box.maxZ) / 2;
    var hx = (box.maxX - box.minX) / 2, hy = (box.maxY - box.minY) / 2, hz = (box.maxZ - box.minZ) / 2;
    var faces = [
      { n: [1, 0, 0], c: [box.maxX, cy, cz], u: [0, 1, 0], v: [0, 0, 1], hu: hy, hv: hz },
      { n: [-1, 0, 0], c: [box.minX, cy, cz], u: [0, 1, 0], v: [0, 0, 1], hu: hy, hv: hz },
      { n: [0, 1, 0], c: [cx, box.maxY, cz], u: [1, 0, 0], v: [0, 0, 1], hu: hx, hv: hz },
      { n: [0, -1, 0], c: [cx, box.minY, cz], u: [1, 0, 0], v: [0, 0, 1], hu: hx, hv: hz },
      { n: [0, 0, 1], c: [cx, cy, box.maxZ], u: [1, 0, 0], v: [0, 1, 0], hu: hx, hv: hy },
      { n: [0, 0, -1], c: [cx, cy, box.minZ], u: [1, 0, 0], v: [0, 1, 0], hu: hx, hv: hy }
    ];
    var facing = faces.filter(function (f) {
      var dx = camPos.x - f.c[0], dy = camPos.y - f.c[1], dz = camPos.z - f.c[2];
      return (dx * f.n[0] + dy * f.n[1] + dz * f.n[2]) > 0;
    });
    if (!facing.length) facing = faces;   // camera inside the box — sample every face, never zero
    var perFace = Math.max(1, Math.ceil(S / facing.length));
    var side = Math.max(1, Math.ceil(Math.sqrt(perFace)));
    var pts = [];
    facing.forEach(function (f) {
      for (var i = 0; i < side; i++) for (var j = 0; j < side; j++) {
        var pu = side > 1 ? (-1 + 2 * i / (side - 1)) : 0, pv = side > 1 ? (-1 + 2 * j / (side - 1)) : 0;
        pts.push({
          x: f.c[0] + f.u[0] * pu * f.hu + f.v[0] * pv * f.hv,
          y: f.c[1] + f.u[1] * pu * f.hu + f.v[1] * pv * f.hv,
          z: f.c[2] + f.u[2] * pu * f.hu + f.v[2] * pv * f.hv
        });
      }
    });
    return pts;
  }
  // S from the box's own screen size — a bigger member on screen gets more samples, never fewer
  // than 9 (the spec's own floor).
  function _sampleCountFor(screenAreaPx) {
    return Math.max(9, Math.min(49, Math.round((screenAreaPx || 0) / 300)));
  }
  // ROUND 15 item 1 (2026-09-16, real HHS R14 bake: raysCast=35158 hitsTotal=30351 selfHits=29 — not
  // blind, rays genuinely hit geometry, but only 0.08% resolve to self, so every candidate read
  // ~0 unoccluded) — root cause: the sample points lie on the member's BOUNDING-BOX faces, not its
  // real surface, so a box-face point routinely sits in EMPTY AIR beyond a non-box-shaped member's
  // actual mass (a thin/rounded/L-shaped member, or simply a box corner past the real solid). The
  // OLD test ("first hit is self, else occluded") then blamed whatever the ray happened to reach
  // next — a wall or slab merely CO-LOCATED with that box-face point, never actually standing between
  // the camera and the member. REDEFINED: a sample is UNOCCLUDED iff the first hit is self, OR the
  // first hit's distance >= (distance camera->sample point - eps) — i.e. NOTHING lies strictly
  // BETWEEN the camera and the box face, regardless of what (or whether anything) is found at or
  // beyond that depth. A true occluder must be CLOSER than the sample point. No hit at all (nothing
  // in the way, up to the far cutoff) also counts as unoccluded — unchanged, never a false negative
  // from a lookup gap.
  var OCCLUSION_EPS = 0.05;
  function _memberUnoccluded(box, camPos, guid, S) {
    if (typeof THREE === 'undefined' || !THREE.Raycaster) return { unoccluded: 1, S: 0, raysCast: 0, hitsAny: 0, selfHits: 0, dominantOccluder: null };
    var pts = _facingFaceSamples(box, camPos, S);
    if (!pts.length) return { unoccluded: 0, S: 0, raysCast: 0, hitsAny: 0, selfHits: 0, dominantOccluder: null };
    var meshes = _raycastUniverse();
    var rc = new THREE.Raycaster();
    var hitsAny = 0, trueSelfHits = 0, unoccludedCount = 0;
    var occluderTally = {};   // ROUND 15 item 1 — guid -> count, among rays with a genuine (closer) occluder
    pts.forEach(function (p) {
      var dx = p.x - camPos.x, dy = p.y - camPos.y, dz = p.z - camPos.z, len = Math.hypot(dx, dy, dz) || 1e-6;
      rc.set(new THREE.Vector3(camPos.x, camPos.y, camPos.z), new THREE.Vector3(dx / len, dy / len, dz / len));
      if ('far' in rc) rc.far = len + OCCLUSION_EPS;
      var hits = meshes.length ? rc.intersectObjects(meshes, false) : [];
      if (!hits.length) { unoccludedCount++; return; }
      hitsAny++;
      var nearest = hits[0];
      // ROUND 13 Fix 1 — pass whichever slot id the hit actually carries: BatchedMesh hits carry
      // `batchId`, never `instanceId` (InstancedMesh-only); the OLD call here (`instanceId` alone)
      // is the real HHS defect's own root cause.
      var g = _reverseGuidFor(nearest.object, nearest.batchId != null ? nearest.batchId : nearest.instanceId);
      if (g === guid) { trueSelfHits++; unoccludedCount++; return; }
      // ROUND 15 item 1 — the ray reached at least as far as the member's own box-face point without
      // hitting anything CLOSER: the object found at/beyond that depth is not a true occluder (the
      // box-face sample simply lies beyond the member's real, non-box-shaped surface).
      if (nearest.distance >= len - OCCLUSION_EPS) { unoccludedCount++; return; }
      // A genuine occluder: something else is strictly CLOSER to the camera than this box-face point.
      if (g != null) occluderTally[g] = (occluderTally[g] || 0) + 1;
    });
    // Dominant occluder — the guid with the most occluding rays (informational, printed for hop 0 of
    // the drawn stack only; ties broken by first-seen, never a re-derived second opinion).
    var dominantGuid = null, dominantCount = 0;
    for (var og in occluderTally) { if (occluderTally[og] > dominantCount) { dominantGuid = og; dominantCount = occluderTally[og]; } }
    var dominantOccluder = dominantGuid ? { guid: dominantGuid, cls: _classForGuid(dominantGuid), count: dominantCount } : null;
    return { unoccluded: unoccludedCount / pts.length, S: pts.length, raysCast: pts.length, hitsAny: hitsAny,
             selfHits: trueSelfHits, dominantOccluder: dominantOccluder };
  }
  A._loadPathFacingFaceSamples = _facingFaceSamples; A._loadPathMemberUnoccluded = _memberUnoccluded;
  A._loadPathSampleCountFor = _sampleCountFor;

  // A member's own screen-space box (px rect, clamped to the frame) — for the `underHud` test.
  function _screenRectPx(box, camera, outW, outH) {
    var corners = _cornersOfAABB(box);
    var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    corners.forEach(function (c) {
      var p = c.clone().project(camera);
      xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y);
    });
    if (!isFinite(xmin) || !isFinite(xmax)) return null;
    var x0 = (Math.max(-1, xmin) * 0.5 + 0.5) * outW, x1 = (Math.min(1, xmax) * 0.5 + 0.5) * outW;
    var y0 = (1 - (Math.min(1, ymax) * 0.5 + 0.5)) * outH, y1 = (1 - (Math.max(-1, ymin) * 0.5 + 0.5)) * outH;
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  }
  // §129.8 item 2/4b — a member counts as hidden if its screen box intersects any HUD rect from the
  // ARM-FRAME snapshot (`_lp.armHudRects` — "what was on screen just before the freeze", item 4b's
  // own ruling; never the live, now-suppressed registry mid-hold).
  function _underHud(box, camera, outW, outH, hudRects) {
    if (!hudRects || !hudRects.length) return false;
    var r = _screenRectPx(box, camera, outW, outH);
    if (!r) return false;
    for (var i = 0; i < hudRects.length; i++) {
      var h2 = hudRects[i];
      if (!(r.x + r.w <= h2.x || h2.x + h2.w <= r.x || r.y + r.h <= h2.y || h2.y + h2.h <= r.y)) return true;
    }
    return false;
  }
  A._loadPathScreenRectPx = _screenRectPx; A._loadPathUnderHud = _underHud;

  // §129.8 item 3, ROUND 12 item 1 (2026-09-16, real HHS bake: PICK chose a 2-hop slab reading
  // memberPx=[1584.9,212.2] memberVis=[0.11,0] over the good 5-hop column ladder — Σ(unoccluded x
  // screenArea) rewards a giant, mostly-hidden member because its huge screenArea alone can outweigh
  // a whole stack of small, genuinely-visible ones) — a hop only counts as VISIBLE (`majorityVisible`)
  // when the MAJORITY of its sampled surface is unoccluded (`unoccluded >= 0.5`) and it is not under
  // the arm-frame HUD; `score`/`occludedScore` are kept (still printed, still the FINAL tie-break)
  // but ranking's PRIMARY key is now the count of majority-visible hops (see `_pickTwoStacks`).
  // Raycasts/projects ONLY hops whose box passes the live frustum test first (§129.8 item 2's own
  // cost discipline); a hop that fails the frustum test contributes 0 and is not raycast at all.
  function _scoreChain(chainIdx, items, camera, outW, outH, hudRects) {
    var perHop = [];
    var score = 0, occludedScore = 0, distSum = 0, distN = 0, visibleHopsMajority = 0, visibleHopsFrustum = 0;
    // ROUND 13 Fix 2 / ROUND 14 — raw ray/hit/self-hit totals, summed across this chain's own hops,
    // for the raycast-blind self-check (see _pickTwoStacks). `hitsAnyTotal` (ROUND 14, NEW) is
    // distinct from `selfHitsTotal` — see _memberUnoccluded's own comment.
    var raysCastTotal = 0, hitsAnyTotal = 0, selfHitsTotal = 0;
    chainIdx.forEach(function (i) {
      var guid = items[i].guid;
      var box = _instanceWorldBox(guid);
      if (!box) { perHop.push({ guid: guid, unoccluded: 0, screenArea: 0, underHud: false, visible: false, majorityVisible: false }); return; }
      var camPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      var fr = _projectAABBLive(box, camera);
      if (!fr || !fr.intersects) { perHop.push({ guid: guid, unoccluded: 0, screenArea: 0, underHud: false, visible: false, majorityVisible: false }); return; }
      // ROUND 13 addendum — the plain frustum-intersects count (the PRE-ROUND-12 rule), kept
      // alongside visibleHopsMajority so `_pickTwoStacks` can fall back to it when the raycast
      // itself is proven blind, never a second re-derivation of "does this hop's box hit the frame".
      visibleHopsFrustum++;
      var screenArea = _screenAreaPxLive(box, camera, outW, outH);
      var S = _sampleCountFor(screenArea);
      var mu = _memberUnoccluded(box, camPos, guid, S);
      var uo = mu.unoccluded;
      raysCastTotal += mu.raysCast; hitsAnyTotal += mu.hitsAny; selfHitsTotal += mu.selfHits;
      var underHud = _underHud(box, camera, outW, outH, hudRects);
      var hopScore = underHud ? 0 : (uo * screenArea);
      score += hopScore;
      occludedScore += (1 - uo);
      var cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2, cz = (box.minZ + box.maxZ) / 2;
      distSum += Math.hypot(cx - camPos.x, cy - camPos.y, cz - camPos.z); distN++;
      // ROUND 12 item 1 — MAJORITY visible: unoccluded >= 0.5 (at least half the sampled surface is
      // actually seen) AND not under the HUD. A giant slab at 11% unoccluded is NOT visible by this
      // rule, however large its screenArea.
      var majorityVisible = !underHud && uo >= 0.5;
      if (majorityVisible) visibleHopsMajority++;
      perHop.push({ guid: guid, unoccluded: uo, screenArea: screenArea, underHud: underHud, visible: true, majorityVisible: majorityVisible,
                    dominantOccluder: mu.dominantOccluder });   // ROUND 15 item 1 — for hop0Occluder=
    });
    return { perHop: perHop, score: score, occludedScore: occludedScore, dist: distN ? distSum / distN : Infinity,
             visibleHopsMajority: visibleHopsMajority, visibleHopsFrustum: visibleHopsFrustum,
             raysCast: raysCastTotal, hitsAny: hitsAnyTotal, selfHits: selfHitsTotal };
  }
  A._loadPathScoreChain = _scoreChain;

  // §129.8 item 3 — TWO STACKS. `valid` = every candidate from `_pick` (monotone-descending,
  // ground-ending, >=2 load-bearing hops); scores every one that has >=1 hop passing the frustum
  // test, picks NEAR (best) then FAR (best among candidates whose camera distance exceeds NEAR's by
  // >= the building's own extent along camDir — no threshold constant). `window.__lpOneStack=1`
  // forces FAR out regardless. `window.__lpPickOccluded=1` ranks by occludedScore DESC instead of
  // score DESC — the control's own inversion.
  // §129.8 item 3 — the building's own extent along a view direction: project the 8 corners of
  // `box` onto `dir` (from `pos`), span of the projections. No threshold constant — used both by
  // the build-time provisional FAR estimate (shotPose) and the arm-time FINAL pick (live camera).
  function _extentAlongDir(box, pos, dir) {
    if (!box) return 0;
    var lo = Infinity, hi = -Infinity;
    _cornersOfAABB(box).forEach(function (c) {
      var t = (c.x - pos.x) * dir.x + (c.y - pos.y) * dir.y + (c.z - pos.z) * dir.z;
      if (t < lo) lo = t; if (t > hi) hi = t;
    });
    return Math.max(0, hi - lo);
  }
  A._loadPathExtentAlongDir = _extentAlongDir;
  // ROUND 12 item 1 — the real comparator: MAJORITY-visible hop count is now the PRIMARY key (never
  // score alone — see _scoreChain's own comment for the real bake that proved score-alone wrong),
  // then total hops (depth), then score/occludedScore as the final tie-break. `window.__lpPickOccluded`
  // inverts the FIRST TWO keys (fewest majority-visible hops, fewest total hops) so the control still
  // deliberately prefers the worse candidate by the SAME rule the real pick now uses, never a
  // different metric that could coincidentally agree with the real rule by accident.
  // ROUND 13 addendum — `visKey` picks which visible-hop count this comparator ranks by
  // ('visibleHopsMajority' normally, 'visibleHopsFrustum' when `_pickTwoStacks` proves the raycast
  // itself is blind) — parameterized so there is only ever ONE comparator, never a second one
  // re-derived for the fallback case.
  function _stackCmp(a, b, occludedMode, visKey) {
    visKey = visKey || 'visibleHopsMajority';
    // §129.42 — STOREY SPAN IS THE FIRST KEY, in both directions. `occludedMode` is the
    // falsifiability control: it must keep preferring the WORSE candidate by the SAME rule the real
    // pick uses, so the new key has to lead there too (fewest storeys crossed), or the control
    // would silently start ranking by a metric the real path no longer leads with.
    var aSpan = a.storeySpan || 0, bSpan = b.storeySpan || 0;
    if (occludedMode) {
      if (aSpan !== bSpan) return aSpan - bSpan;
      if (a[visKey] !== b[visKey]) return a[visKey] - b[visKey];
      if (a.depth !== b.depth) return a.depth - b.depth;
      return b.occludedScore - a.occludedScore;
    }
    if (bSpan !== aSpan) return bSpan - aSpan;
    if (b[visKey] !== a[visKey]) return b[visKey] - a[visKey];
    if (b.depth !== a.depth) return b.depth - a.depth;
    if (b.score !== a.score) return b.score - a.score;
    return a.idx < b.idx ? -1 : (a.idx > b.idx ? 1 : 0);
  }
  A._loadPathStackCmp = _stackCmp;
  // ROUND 17 — the cheap (no-raycast) pre-rank that bounds `_pickTwoStacks`'s expensive scoring pass
  // to SCORE_TOP_N candidates. Reuses the SAME frustum test + screen-area math `_scoreChain` itself
  // runs per hop (`_instanceWorldBox`/`_projectAABBLive`/`_screenAreaPxLive` — never `_memberUnoccluded`,
  // the raycast, which is the actual cost blowing up on Terminal), so this never adds a second,
  // disagreeing notion of "in frame". Primary key mirrors `_pickTwoStacks`'s own qualification rule
  // (both tier 1 and tier 2 require >=2 frustum-visible hops): a candidate that could never qualify
  // (hopsInFrustum<2) ranks lowest and is the first dropped once the pool exceeds the cap. Tie-broken
  // by summed screen area (an upper bound on the eventual score=uo*screenArea, uo in [0,1] — never
  // computed here, only estimated) then camera distance ASC (nearer first, all else equal — same
  // "nearer raises rank" convention `_rankValid`'s own minMemberPx tie-break follows elsewhere in this
  // file). Distance from the candidate's own hop boxes to the camera doubles as "distance to the hold
  // point" here since this runs at ARM, on the live (already-held) camera.
  function _cheapCandidateRank(items, chainIdx, camera, outW, outH) {
    var hopsInFrustum = 0, areaSum = 0, distSum = 0, distN = 0;
    chainIdx.forEach(function (i) {
      var box = _instanceWorldBox(items[i].guid);
      if (!box) return;
      var fr = _projectAABBLive(box, camera);
      if (!fr || !fr.intersects) return;
      hopsInFrustum++;
      areaSum += _screenAreaPxLive(box, camera, outW, outH) || 0;
      var cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2, cz = (box.minZ + box.maxZ) / 2;
      distSum += Math.hypot(cx - camera.position.x, cy - camera.position.y, cz - camera.position.z); distN++;
    });
    return { hopsInFrustum: hopsInFrustum, areaSum: areaSum, dist: distN ? distSum / distN : Infinity };
  }
  // Ranks `valid` by the cheap signal above and caps it to `cap` entries — the ONLY gate between
  // `_pick`'s full candidate list and the expensive per-candidate `_scoreChain` pass below. A no-op
  // (returns `valid` itself, unranked) whenever `valid.length <= cap` or there is no live camera to
  // rank against — so a building small enough that this was never a problem (HHS/Hospital/LTU) is
  // byte-for-byte unaffected. Never mutates `valid`.
  function _rankAndCapForScoring(items, valid, camera, outW, outH, cap) {
    if (!camera || valid.length <= cap) return valid;
    var withRank = valid.map(function (c) {
      return { c: c, r: _cheapCandidateRank(items, c.chain, camera, outW, outH) };
    });
    withRank.sort(function (a, b) {
      if (b.r.hopsInFrustum !== a.r.hopsInFrustum) return b.r.hopsInFrustum - a.r.hopsInFrustum;
      if (b.r.areaSum !== a.r.areaSum) return b.r.areaSum - a.r.areaSum;
      return a.r.dist - b.r.dist;
    });
    return withRank.slice(0, cap).map(function (w) { return w.c; });
  }
  A._loadPathCheapCandidateRank = _cheapCandidateRank; A._loadPathRankAndCapForScoring = _rankAndCapForScoring;
  function _pickTwoStacks(items, valid, camera, outW, outH, hudRects, buildingBox) {
    var occludedMode = !!window.__lpPickOccluded;
    // ROUND 14 (2026-09-16, real HHS R13 bake: raycast STILL blind after ROUND 13 landed, with NO
    // §LOADPATH_VISIBILITY line at all — meaning ROUND 13's own blind condition, hitsTotal>0 &&
    // selfHits===0, never fired, so the aggregate totals themselves must have read 0) — rebuild the
    // raycast universe/reverse-index HERE, at ARM, immediately before scoring: never rely on
    // whatever `_raycastUniverse()`'s cache happened to capture earlier in this hold's own
    // lifetime — a stale/empty capture from before this hold's chain clones existed (or from a
    // scene not yet fully populated) would otherwise silently stay cached, unrefreshed, for the
    // rest of the hold, since the cache's own contract is "build once, reuse until _resetRayCache()".
    _resetRayCache();
    var universe = _raycastUniverse().length;
    // ROUND 17 — bound the expensive per-candidate raycast pass below to SCORE_TOP_N candidates,
    // cheaply pre-ranked (see `_rankAndCapForScoring` just above); a no-op whenever `valid.length` is
    // already <= SCORE_TOP_N. `validTotal`/`scoredCount` are carried through every return below so a
    // reviewer can see, from the log alone, that the cap fired (and by how much) on a real bake.
    var capped = _rankAndCapForScoring(items, valid, camera, outW, outH, SCORE_TOP_N);
    var validTotal = valid.length, scoredCount = capped.length;
    // ROUND 18 — gate the expensive raycast pass on the RAYCAST UNIVERSE's own total instance count
    // (see `RAYCAST_INSTANCE_BUDGET`'s own comment), not just candidate count: a TEMP diagnostic
    // (since removed) proved Terminal's 40 SCORE_TOP_N-capped candidates still hang forever, because
    // each one's `_scoreChain`/`_memberUnoccluded` raycasts against `_raycastUniverse()`, and
    // Terminal's universe is 1310 OBJECTS but ~49,612 TOTAL INSTANCES (BatchedMesh/InstancedMesh
    // containers each holding tens of thousands of internal instances three.js raycasts one-by-one,
    // no broad-phase acceleration) — computed ONCE here, only when there is something to score, and
    // strictly BEFORE any `_scoreChain` call, so the check itself is cheap and gates the expensive
    // work rather than running after the damage is done.
    if (capped.length > 0) {
      var instanceSum = 0, universeMeshes = _raycastUniverse();
      for (var ui = 0; ui < universeMeshes.length; ui++) {
        var um = universeMeshes[ui];
        instanceSum += (um.isInstancedMesh ? (um.count || 0)
          : um.isBatchedMesh ? ((A._batchMeta && A._batchMeta[um.id] && A._batchMeta[um.id].length) || um.maxInstanceCount || 0)
          : 1);
      }
      if (instanceSum > RAYCAST_INSTANCE_BUDGET) {
        // Raycast universe too large to score even the capped pool — skip `_scoreChain` entirely
        // (never call it, not even once) and fall back to the SAME accepted "can't get a real
        // occlusion answer" path used elsewhere (`pickSource=frustum-fallback`), extended with a new,
        // honest reason distinct from `no-unoccluded-candidate` (that one means tier 1 genuinely
        // found nobody AFTER raycasting — this means raycasting was never attempted at all).
        // `capped` is already ranked best-first by `_rankAndCapForScoring`'s own cheap signal
        // (frustum hop count, then screen area, then camera distance — never re-ranked here); NEAR is
        // simply its first entry. FAR reuses the exact same spacing rule the real path uses just
        // below (`_extentAlongDir` + "camera distance from NEAR >= the building's own extent"), walking
        // `capped` in that same best-first order for the first candidate far enough from NEAR — i.e.
        // the second-best-that's-far-enough, never a second, re-derived notion of "far".
        // Capture the REAL `_cheapCandidateRank` fields (not just `.dist`) — `hopsInFrustum` is the
        // actual measured frustum-visible hop count for this candidate, never an assumed maximum.
        var rankedCapped = capped.map(function (c) {
          var r = _cheapCandidateRank(items, c.chain, camera, outW, outH);
          return { c: c, dist: r.dist, hopsInFrustum: r.hopsInFrustum, areaSum: r.areaSum };
        });
        var fbToStack = function (rc) {
          // Occlusion was NEVER tested on this path (that's the whole point of skipping the raycast
          // pass) — `unoccluded: null` is the honest "not measured" value (not 0, not 1), never a
          // fabricated pass/fail. Every consumer of `perHop[i].unoccluded` (`fmtMemberVis` here, and
          // `_framingWitness`'s own `memberVis` build) must print `n/a` for `null`, never feed it
          // straight into `.toFixed(2)` as if it were a real measurement.
          var perHop = rc.c.chain.map(function (i) {
            return { guid: items[i].guid, unoccluded: null, screenArea: 0, underHud: false, visible: true,
                     majorityVisible: true, dominantOccluder: null };
          });
          return { idx: rc.c.idx, chain: rc.c.chain, depth: rc.c.depth, score: 0, occludedScore: 0,
                   dist: rc.dist, perHop: perHop, visibleHopsMajority: rc.c.chain.length,
                   storeySpan: _chainStoreySpan(items, rc.c.chain),
                   visibleHopsFrustum: rc.hopsInFrustum, raysCast: 0, hitsAny: 0, selfHits: 0 };
        };
        var fbNear = fbToStack(rankedCapped[0]);
        var fbPickSource = 'frustum-fallback reason=raycast-universe-too-large';
        if (window.__lpOneStack) {
          return { near: fbNear, far: null, farReason: 'one-stack-control', pickSource: fbPickSource,
                   raycastBlind: false, blindReason: null, tier: 2, visKey: 'visibleHopsFrustum',
                   raysCast: 0, hitsTotal: 0, selfHits: 0, universe: universe,
                   validTotal: validTotal, scored: scoredCount };
        }
        var fbCamPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        var fbCamDirV = (typeof camera.getWorldDirection === 'function' && typeof THREE !== 'undefined')
          ? camera.getWorldDirection(new THREE.Vector3()) : { x: 0, y: 0, z: -1 };
        var fbExtent = _extentAlongDir(buildingBox, fbCamPos, fbCamDirV);
        var fbFarRc = null;
        for (var fi = 1; fi < rankedCapped.length; fi++) {
          if (rankedCapped[fi].dist - rankedCapped[0].dist >= fbExtent) { fbFarRc = rankedCapped[fi]; break; }
        }
        var fbFar = fbFarRc ? fbToStack(fbFarRc) : null;
        return { near: fbNear, far: fbFar, farReason: fbFar ? null : 'none-beyond-depth', extent: fbExtent,
                 pickSource: fbPickSource, raycastBlind: false, blindReason: null, tier: 2, visKey: 'visibleHopsFrustum',
                 raysCast: 0, hitsTotal: 0, selfHits: 0, universe: universe,
                 validTotal: validTotal, scored: scoredCount };
      }
    }
    var scored = capped.map(function (c) {
      var s = _scoreChain(c.chain, items, camera, outW, outH, hudRects);
      return { idx: c.idx, chain: c.chain, depth: c.depth, score: s.score, occludedScore: s.occludedScore,
               dist: s.dist, perHop: s.perHop, visibleHopsMajority: s.visibleHopsMajority,
               storeySpan: _chainStoreySpan(items, c.chain),
               visibleHopsFrustum: s.visibleHopsFrustum, raysCast: s.raysCast, hitsAny: s.hitsAny, selfHits: s.selfHits };
    });
    // ROUND 13 Fix 2 / ROUND 14 (broadened) — "never silently premised on a lie": sum raw ray/hit/
    // self-hit totals across EVERY candidate BEFORE the visibility-count filter below, so the check
    // still fires even when that filter would otherwise exclude everyone.
    var raysCastTotal = 0, hitsTotal = 0, selfHitsTotal = 0;
    scored.forEach(function (s) { raysCastTotal += s.raysCast; hitsTotal += s.hitsAny; selfHitsTotal += s.selfHits; });
    // ROUND 15 (2026-09-16, real HHS R14 bake: raysCast=35158 hitsTotal=30351 selfHits=29 — NOT
    // "blind" by intent, just genuinely low self-resolution once item 1's redefinition is in play) —
    // `selfHitsTotal===0` is DROPPED from the blind trigger: under item 1's new distance-based
    // occlusion rule, a ray that never precisely lands on a thin/recessed member's own real surface
    // legitimately contributes ZERO self-hits while still correctly reading UNOCCLUDED (it counts
    // toward `unoccludedCount`, never `selfHits`) — so `selfHitsTotal` can be low or exactly 0 for a
    // perfectly healthy, fully-visible candidate, and is no longer a reliable signal of a broken
    // pipeline. `blind` now means ONLY "the raycast infrastructure produced no signal at all":
    // `raysCast===0` (the live frustum test never passed for any hop of any candidate) or
    // `hitsTotal===0` (rays were cast but the universe returned nothing, e.g. truly empty) — a
    // genuinely, fully-occluded-by-real-geometry candidate (hitsTotal high, selfHits low/0) is NOT
    // blind; it is tier 1 legitimately finding nobody, handled by tier 2 below (item 2).
    var blind = scored.length > 0 && (raysCastTotal === 0 || hitsTotal === 0);
    var blindReason = raysCastTotal === 0 ? 'no-rays' : 'no-hits';
    if (blind) {
      console.log('§LOADPATH_VISIBILITY INCONCLUSIVE reason=raycast-blind(' + blindReason + ') raysCast=' + raysCastTotal +
        ' hitsTotal=' + hitsTotal + ' selfHits=' + selfHitsTotal + ' universe=' + universe);
    }
    // ROUND 15 item 2 (2026-09-16, real HHS R14 bake: raysCast=35158 hitsTotal=30351 selfHits=29 —
    // NOT blind by ROUND 14's own definition, yet zero candidates reached >=2 majority-unoccluded
    // hops, so the old two-way blind/not-blind branch fell straight through to `pickSource=none`
    // while the probe stack was still drawn — dishonest) — THREE explicit, honestly labelled tiers,
    // tried in order, applied identically to NEAR and FAR (both are drawn from whichever tier's own
    // `qualified` pool first produces >=2-hop candidates — never a second, independently-tiered
    // search for FAR):
    //   tier 1 — occlusion-scored (`visibleHopsMajority`, the normal/best case), tried FIRST even
    //            when the raw ray totals look thin, since a real bake can have selfHits>0 SOMEWHERE
    //            while genuinely having zero qualifying candidates (this round's own symptom) — that
    //            is tier 1 legitimately finding nobody, not a raycast defect.
    //   tier 2 — frustum-scored (`visibleHopsFrustum`, "the stack shines through occluders by
    //            design"), when tier 1 found nothing AND the raycast itself is NOT blind —
    //            `pickSource=frustum-fallback reason=no-unoccluded-candidate`.
    //   tier 3 — frustum-scored, when the raycast IS blind (ROUND 14's own aggregate check) —
    //            `pickSource=probe-fallback reason=raycast-blind(...)`, unchanged from ROUND 14.
    // `pickSource=none` may only ever print when NO tier's `qualified` pool has anybody at all.
    var tier1 = scored.filter(function (s) { return s.visibleHopsMajority >= 2; });
    var qualified, visKey, tier, tierReason;
    if (!blind && tier1.length) {
      qualified = tier1; visKey = 'visibleHopsMajority'; tier = 1; tierReason = null;
    } else {
      qualified = scored.filter(function (s) { return s.visibleHopsFrustum >= 2; });
      visKey = 'visibleHopsFrustum';
      if (blind) { tier = 3; tierReason = 'raycast-blind(' + blindReason + ')'; }
      else { tier = 2; tierReason = 'no-unoccluded-candidate'; }
    }
    if (!qualified.length) {
      return { near: null, far: null, pickSource: 'none', raycastBlind: blind, blindReason: blind ? blindReason : null,
               raysCast: raysCastTotal, hitsTotal: hitsTotal, selfHits: selfHitsTotal, universe: universe,
               tier: tier, visKey: visKey, validTotal: validTotal, scored: scoredCount,
               farReason: 'no-candidate-with-2-' + (tier === 1 ? 'majority' : 'frustum') + '-visible-hops' };
    }
    qualified.sort(function (a, b) { return _stackCmp(a, b, occludedMode, visKey); });
    // §129.42 — the best span ANY qualified candidate offered, recorded before the winner is taken.
    // If the winner's own span is lower than this, storey span did not decide the pick and the log
    // should be able to say so rather than leave it to be inferred.
    var bestSpanAvail = qualified.reduce(function (m, c) { return Math.max(m, c.storeySpan || 0); }, 0);
    var near = qualified[0];
    // A stack IS drawn here (`near` is real), so `pickSource` must never read `none`.
    var pickSource = tier === 1 ? 'live' : (tier === 2 ? ('frustum-fallback reason=' + tierReason) : ('probe-fallback reason=' + tierReason));
    if (window.__lpOneStack) {
      return { near: near, far: null, farReason: 'one-stack-control', pickSource: pickSource, bestSpanAvail: bestSpanAvail,
               raycastBlind: blind, blindReason: blind ? blindReason : null, tier: tier, visKey: visKey,
               raysCast: raysCastTotal, hitsTotal: hitsTotal, selfHits: selfHitsTotal, universe: universe,
               validTotal: validTotal, scored: scoredCount };
    }
    var camPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    var camDirV = (typeof camera.getWorldDirection === 'function' && typeof THREE !== 'undefined')
      ? camera.getWorldDirection(new THREE.Vector3()) : { x: 0, y: 0, z: -1 };
    var extent = _extentAlongDir(buildingBox, camPos, camDirV);
    var farPool = qualified.slice(1).filter(function (s) { return s.dist - near.dist >= extent; });
    farPool.sort(function (a, b) { return _stackCmp(a, b, occludedMode, visKey); });
    var far = farPool.length ? farPool[0] : null;
    return { near: near, far: far, farReason: far ? null : 'none-beyond-depth', extent: extent, bestSpanAvail: bestSpanAvail,
             pickSource: pickSource, raycastBlind: blind, blindReason: blind ? blindReason : null, tier: tier, visKey: visKey,
             raysCast: raysCastTotal, hitsTotal: hitsTotal, selfHits: selfHitsTotal, universe: universe,
             validTotal: validTotal, scored: scoredCount };
  }
  A._loadPathPickTwoStacks = _pickTwoStacks;

  // ── v8 HOLD-POINT SEARCH — red1's relaxation: not a strict in-shot filter, a SEARCH for the first
  // tNorm (forward from topout) where the WHOLE BUILDING is >=80% in frame (corner fraction — chosen
  // over projected-area overlap for tractability, per §129.4's own disclosure), sampling the film's
  // OWN camera path with no render and no live-camera commitment. The search window is
  // [topoutU, topoutU + HOLD_CAP_SEC/filmSecFull] — this session's own definition of "to the
  // stats-round boundary" (no such variable exists pre-computed; disclosed, not discovered).
  // ROUND 7 (2026-09-16, real Terminal bake) — (a) samples via `A._bakeCameraPoseAt(tn)` (the real,
  // gaze-blended per-frame pose cinema_maxq.js's own frame loop builds) when exposed, never the raw
  // `plan.poseAt(tn)` alone — a hypothetical pose the bake never actually renders is not "the same
  // pose" FRAMING later reads live. (b) when NO sample reaches the 80% rule, falls back to red1's own
  // ruling: the sample where the BEST candidate chain (whichever, at THAT sample, shows the most) has
  // the most hops in the frustum — "so the hold lands where a stack is visible" — printed as
  // `bestVisibleHops=`. `validChains`/`items` (optional — from `pick.valid`, already computed by the
  // time this runs) enable that fallback; omitted, this degrades to the old building-fraction-only
  // fallback (never a null pose or a thrown error). ─────────────────────────────────────────────────
  function _searchHoldPoint(plan, topoutU, filmSecFull, buildingBox, items, validChains) {
    var poseAtFn = (typeof A._bakeCameraPoseAt === 'function') ? A._bakeCameraPoseAt
      : (plan && typeof plan.poseAt === 'function') ? plan.poseAt : null;
    if (!poseAtFn || !A.camera) {
      return { tNorm: topoutU, buildingInFrame: null, best: true, reason: 'no-plan', bestVisibleHops: null };
    }
    var windowU = filmSecFull > 0 ? Math.min(1 - topoutU, HOLD_CAP_SEC / filmSecFull) : 0;
    var bestTn = topoutU, bestF = -1;
    var bestVisTn = topoutU, bestVisHops = -1;
    for (var s = 0; s <= SHOT_SAMPLES; s++) {
      var tn = topoutU + windowU * (s / SHOT_SAMPLES);
      var pose = poseAtFn(tn);
      if (!pose) continue;
      var r = _projectAABB(buildingBox, pose, A.camera);
      if (!r) continue;
      if (r.fraction > bestF) { bestF = r.fraction; bestTn = tn; }
      if (r.fraction >= SHOT_THRESHOLD) return { tNorm: tn, buildingInFrame: r.fraction, best: false, bestVisibleHops: null };
      if (validChains && items) {
        var visHere = 0;
        for (var ci = 0; ci < validChains.length; ci++) {
          var n = 0, chain = validChains[ci].chain;
          for (var hi = 0; hi < chain.length; hi++) {
            var box = _instanceWorldBox(items[chain[hi]].guid);
            if (!box) continue;
            var rr = _projectAABB(box, pose, A.camera);
            if (rr && rr.intersects) n++;
          }
          if (n > visHere) visHere = n;
        }
        if (visHere > bestVisHops) { bestVisHops = visHere; bestVisTn = tn; }
      }
    }
    if (bestVisHops >= 1) {
      return { tNorm: bestVisTn, buildingInFrame: bestF < 0 ? null : bestF, best: true, bestVisibleHops: bestVisHops };
    }
    return { tNorm: bestTn, buildingInFrame: bestF < 0 ? null : bestF, best: true, bestVisibleHops: validChains ? 0 : null };
  }
  // ── v8b HARDENED (review, 2026-09-15, after a real HHS bake showed __lpClipAll leaving
  // beyondVisible=10 => false PASS): the OLD __lpClipAll reference was `_lp.buildingBox`, built from
  // elements_meta/element_transforms DB rows only — but `_applyGhost` ghosts EVERY mesh
  // `A.collectMeshes` finds in the live THREE.js scene (site/context props, helpers, anything not a
  // tracked DB element), which is a LARGER, different population than the DB-derived box. A plane
  // placed behind the small box left real ghosted objects — the ones outside it — on its far side,
  // "surviving" the all-clip control by construction, not by a witness bug. Scans the SAME
  // population `_applyGhost`'s own collectMeshes predicates enumerate (never our own overlay clones),
  // taking each mesh's OWN real-time Box3 (skipping empty/NaN ones — `empty`, logged, never guessed
  // at) — so the plane this control places sits behind literally everything that will be ghosted. ──
  function _ghostPopulationMaxDepth(camPos, viewDir) {
    var maxDepth = -Infinity, seen = 0, empty = 0;
    function scanOne(obj) {
      if (obj.userData && obj.userData._loadPathClone) return;   // never our own overlay
      seen++;
      try {
        var b = new THREE.Box3().setFromObject(obj);
        var finite = isFinite(b.min.x) && isFinite(b.min.y) && isFinite(b.min.z) &&
          isFinite(b.max.x) && isFinite(b.max.y) && isFinite(b.max.z) &&
          b.min.x <= b.max.x && b.min.y <= b.max.y && b.min.z <= b.max.z;
        if (!finite) { empty++; return; }
        _cornersOfAABB({ minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z })
          .forEach(function (c) {
            var depth = c.clone().sub(camPos).dot(viewDir);
            if (depth > maxDepth) maxDepth = depth;
          });
      } catch (e) { empty++; }
    }
    A.collectMeshes(function (o) { return o.isMesh && !o.isInstancedMesh && !o.isBatchedMesh; }).forEach(scanOne);
    A.collectMeshes(function (o) { return o.isInstancedMesh || o.isBatchedMesh; }).forEach(scanOne);
    return { maxDepth: maxDepth, seen: seen, empty: empty };
  }
  // ── v8 CUT (third amendment) — ONE clip plane, facing the camera, placed just in front of the
  // chain's nearest face along the view axis; applied ONLY to this beat's own ghost material clones.
  // `normal = viewDir` (camera -> chainCenter, pointing INTO the scene): three.js keeps the half-space
  // where `normal.dot(p)+constant >= 0`, i.e. the FAR side (beyond the plane) — exactly "remove only
  // what's between the camera and the plane". `__lpClipAll` pushes the plane behind the FARTHEST REAL
  // GHOST CANDIDATE (see `_ghostPopulationMaxDepth` above), not the chain's near face, so nothing
  // survives. ─────────────────────────────────────────────────────────────────────────────────────
  function _placeCutPlane(chainBox, buildingBox, camPos) {
    if (typeof THREE === 'undefined' || !camPos) return null;
    var chainCenter = chainBox.getCenter(new THREE.Vector3());
    var viewDir = chainCenter.clone().sub(camPos);
    if (viewDir.lengthSq && viewDir.lengthSq() < 1e-8) return null;
    viewDir.normalize();
    var size = chainBox.getSize(new THREE.Vector3());
    var eps = Math.max(0.1, Math.hypot(size.x, size.y, size.z) * 0.05);
    var extreme, planeDepth;
    if (window.__lpClipAll) {
      var scan = _ghostPopulationMaxDepth(camPos, viewDir);
      console.log('§LOADPATH_CLIPALL_SCAN seen=' + scan.seen + ' empty=' + scan.empty +
        ' maxDepth=' + (scan.maxDepth === -Infinity ? 'n/a' : scan.maxDepth.toFixed(2)));
      if (scan.seen === 0 || scan.maxDepth === -Infinity) return null;   // nothing real to clip behind
      extreme = scan.maxDepth;
      planeDepth = extreme + eps;
    } else {
      var corners = [chainBox.min, new THREE.Vector3(chainBox.max.x, chainBox.min.y, chainBox.min.z),
       new THREE.Vector3(chainBox.min.x, chainBox.max.y, chainBox.min.z), new THREE.Vector3(chainBox.min.x, chainBox.min.y, chainBox.max.z),
       new THREE.Vector3(chainBox.max.x, chainBox.max.y, chainBox.min.z), new THREE.Vector3(chainBox.max.x, chainBox.min.y, chainBox.max.z),
       new THREE.Vector3(chainBox.min.x, chainBox.max.y, chainBox.max.z), chainBox.max];
      extreme = Infinity;
      corners.forEach(function (c) {
        var depth = c.clone().sub(camPos).dot(viewDir);
        extreme = Math.min(extreme, depth);
      });
      planeDepth = extreme - eps;
    }
    var planePoint = camPos.clone().add(viewDir.clone().multiplyScalar(planeDepth));
    return new THREE.Plane(viewDir.clone(), -viewDir.dot(planePoint));
  }

  // §129 OPEN ITEM (2026-09-17, red1, locked over several turns, "go ahead on 5") — SECTION-CUT.
  // The default-look counterpart of `_placeCutPlane` above: that one places the plane just IN FRONT
  // of the chain (near face - eps), for the OLD ghost-mode look, to hide the near-side facade UP TO
  // the stack. This one places it just BEHIND the chain (far face + eps) so the stack itself sits
  // entirely on the camera side of the plane and is NEVER clipped by it, regardless of its own
  // extent - "never in front of it, never clipping the stack itself" per red1's own words. Same
  // corner-enumeration approach as `_placeCutPlane`'s non-clipAll branch, MAX instead of MIN.
  function _placeSectionCutPlane(chainBox, camPos) {
    if (typeof THREE === 'undefined' || !camPos || !chainBox) return null;
    var chainCenter = chainBox.getCenter(new THREE.Vector3());
    var viewDir = chainCenter.clone().sub(camPos);
    if (viewDir.lengthSq() < 1e-8) return null;
    viewDir.normalize();
    var size = chainBox.getSize(new THREE.Vector3());
    var eps = Math.max(0.1, Math.hypot(size.x, size.y, size.z) * 0.05);
    var corners = _cornersOfAABB({ minX: chainBox.min.x, maxX: chainBox.max.x, minY: chainBox.min.y,
      maxY: chainBox.max.y, minZ: chainBox.min.z, maxZ: chainBox.max.z });
    var extreme = -Infinity;
    corners.forEach(function (c) {
      var depth = c.clone().sub(camPos).dot(viewDir);
      extreme = Math.max(extreme, depth);
    });
    var planeDepth = extreme + eps;
    var planePoint = camPos.clone().add(viewDir.clone().multiplyScalar(planeDepth));
    return { plane: new THREE.Plane(viewDir.clone(), -viewDir.dot(planePoint)), farDepth: extreme, planeDepth: planeDepth,
      viewDir: viewDir.clone(), camPos: camPos.clone() };
  }
  // §129 OPEN ITEM (2026-09-17, red1: "make the clipped fade off too, same 0.5s as the rest fade
  // set") — the cut currently snaps in/out instantly at arm/release while backdrop and HUD both ramp
  // over BACKDROP_FADE_SEC. A hard geometric clip plane has no native "opacity" to fade, and a single
  // material's opacity cannot distinguish the fragments a straddling mesh keeps from the ones it
  // loses (that split only exists per-fragment, at the clip test itself) - so "fade" here means the
  // plane's own DEPTH sweeps from a no-op position (t=0, at the camera - clips nothing real) to its
  // final resting depth (t=1, `sectionCut.planeDepth`) over the SAME t curve `_backdropFadeT` already
  // produces, holds at the final depth through the whole hold, and sweeps back to the no-op depth
  // over the release-side window - a progressive reveal in sync with the backdrop going black and the
  // HUD fading out, never an instant pop. Since `clippingPlanes` arrays hold a REFERENCE to this ONE
  // Plane object everywhere it was attached (412 whitened materials + up to 824 cap-stencil
  // companions), mutating `plane.constant` once per frame re-drives clipping AND stencil-marking
  // for all of them for free - no per-material touch needed after arm. The white colour swap rides
  // the identical t (`Color.lerp(origColal, WHITE, t)`), so the concrete-white look also eases in
  // instead of popping.
  var _WHITE_COLOR = null;   // lazily constructed (needs THREE loaded)
  // §129.19 FIX (2026-09-18, red1, after watching r84: "still wipe off away from cam pov... nail it
  // to be a true fade instead") — CONFIRMED via frame-by-frame inspection, not guessed: at only 10%
  // into the arm-side fade, the foreground walkway was already fully cut/whitened while everything
  // farther from camera was still untouched — the unmistakable signature of a boundary physically
  // travelling from `_CUT_DEPTH0` ("a hair in front of the camera") out to `sc.planeDepth` (behind
  // the stack) over the fade window. That IS the wipe: a moving depth boundary is directional and
  // spatially uneven by construction, no matter how smoothly `t` itself ramps or how well its timing
  // is synced with everything else (§129.17/§129.18 already fixed THAT half correctly). The plane
  // now snaps straight to its FINAL resting depth from the first held frame — no sweep, no
  // intermediate position ever rendered — so the geometric cut itself is a single, instant, one-time
  // fact rather than a travelling line. What still eases in over `t` is exactly what already was
  // genuine, uniform (non-directional) fade material: the whiten colour lerp below, unchanged. The
  // net perceived effect is a colour/opacity dissolve into the final cutaway state, not a wipe.
  function _sectionCutApply(sc, t, buildingBox) {
    if (!sc || !sc.plane) return;
    var depth = sc.planeDepth;
    var planePoint = sc.camPos.clone().add(sc.viewDir.clone().multiplyScalar(depth));
    sc.plane.constant = -sc.viewDir.dot(planePoint);
    sc.liveDepth = depth;   // stashed for the witness - the REAL live value the plane was set to, never re-derived
    // Reset TAA accumulation every frame the COLOUR is still moving (t<1) — the target colour
    // changes every one of these frames, so there is nothing stable yet for the accumulator to
    // converge on; letting it accumulate mid-fade would blend a whole sequence of different
    // in-between states together. Once t reaches 1 this simply stops firing (see the `t < 1` guard),
    // and normal accumulation is free to converge on the final, STABLE white state for the rest of
    // the hold — this is a one-time reset per change, not a permanent "never accumulate" switch.
    if (t < 1 && A._taaPass) A._taaPass.accumulateIndex = -1;
    if (typeof THREE !== 'undefined') {
      if (!_WHITE_COLOR) _WHITE_COLOR = new THREE.Color(CONCRETE_GREY_HEX);   // name kept, value is now the concrete-grey target
      _whitenColorPairs.forEach(function (p) { p.clone.color.copy(p.orig).lerp(_WHITE_COLOR, t); });
      // FIX (2026-09-17, found via pixel readback + call-order tracing after red1 reported zero
      // visible change) — `A.cpeRevealApplyVisual`/`A.storeyRevealApplyVisual` run EVERY frame,
      // unconditionally, and RE-ASSERT their own discipline/storey tint via the SAME `setColorAt`
      // API this pass neutralized ONCE at arm — earlier in cinema_maxq.js's per-frame call order than
      // this beat, every single hold frame, with zero awareness this hold exists. A one-shot
      // neutralization is therefore overwritten before every render but the arm frame itself (one
      // 0.1s frame, invisible). Must be RE-asserted here, every hold frame, not just at arm — the
      // SAME per-slot backup (`_whitenInstColor`, taken once at arm) is what "original" lerps from.
      if (!_whitenTmpColor) _whitenTmpColor = new THREE.Color();
      _whitenInstColor.forEach(function (rec) {
        for (var _ri = 0; _ri < rec.slots.length; _ri++) {
          var _rs = rec.slots[_ri];
          try { rec.mesh.setColorAt(_rs.idx, _whitenTmpColor.setHex(_rs.hex).lerp(_WHITE_COLOR, t)); } catch (eReassert) {}
        }
        if (rec.mesh.instanceColor) rec.mesh.instanceColor.needsUpdate = true;
      });
    }
    _updateCapPlane(sc.plane, buildingBox);   // cap mesh's own transform tracks the SAME swept plane
    // §129.22 (2026-09-18, red1: "originally it supposed to be concrete surface with cut section...
    // it's not fading along to give better realism") — the cap (the solid concrete cut-face fill,
    // `_buildCutCap`) used to just APPEAR the instant it was built (arm), same abrupt-pop class as
    // the clip plane's own now-removed sweep (§129.19) — it's a genuinely NEW surface, never present
    // before arm, and popping straight to opaque read as the same kind of "abruptly hidden [→ shown]"
    // rather than fading in. Independent material (not shared with any other pass), so unlike the
    // near-side facade population (still an open limitation — see this section's own note below) it
    // can fade cleanly on the SAME `t` as everything else, no per-element sharing problem to solve.
    if (_capPlaneMesh && _capPlaneMesh.material) {
      _capPlaneMesh.material.transparent = true;
      _capPlaneMesh.material.opacity = t;
    }
    // NOT fixed this pass, flagged rather than silently left: the NEAR-SIDE facade population (the
    // real building elements the clip plane removes to expose the cross-section) still disappears in
    // one instant step once the plane reaches its fixed final position, because BatchedMesh/
    // InstancedMesh element clones share ONE material per CONTAINER (`_buildBatchedElementClones`,
    // `var cl = obj.material`) — a container's own instances are scattered across near AND far side of
    // the cut plane, so fading that ONE shared opacity would incorrectly also fade out the far-side
    // (revealed) instances that are meant to stay solid. A real per-element fade needs per-element
    // (not per-container) materials, a real cost/architecture change, not attempted here — red1's own
    // "since you can't handle too much we settle for" accepted this trade explicitly.
  }

  // v8b HARDENED AGAIN (review, 2026-09-15, after a real HHS bake showed __lpFrameOff making
  // buildingInFrame WORSE — 1.000, up from the normal run's 0.500 — not zero): the shift direction
  // came from a WITHDRAWN fixed constant, (0.5,0.5,0.7), utterly unrelated to the actual live shot;
  // by pure chance it moved the boxes further INTO frame instead of out of it, on top of a magnitude
  // (2.5x the building diagonal) that the prior review round never actually needed to increase — the
  // DIRECTION was the whole defect. That constant is now GONE from this function entirely (nothing
  // in v8b references it). The shift direction is the camera's OWN real right vector — perpendicular
  // to its ACTUAL view direction (`A.camera.getWorldDirection`), never a guess — and the magnitude is
  // 50x the building's diagonal: large enough that no perspective camera, at any FOV or distance,
  // could still keep the shifted box's own projection inside NDC [-1,1]. Applied identically to
  // EVERY box this witness projects — each hop AND the building box (buildingInFrame) AND the chain
  // box (stackInFrame, for consistency: leaving it unshifted next to a shifted hopsIntersecting would
  // print a self-contradicting line). `f`/`g`/`hopsIntersecting` are ALL still the TRUE geometry when
  // the control is off; the shift is applied identically to the real, live boxes, never a separate guess.
  // §129.8 item 3 — `stack` ({name, hopsUp, pickItem, memberVis}) replaces the implicit `_lp` read
  // so the SAME witness serves both FAR and NEAR; `_lp.buildingBox` stays a global read (one
  // building, shared by both stacks' framing fractions).
  function _framingWitness(stack, stackName) {
    if (!A.camera || typeof THREE === 'undefined') { console.log('§LOADPATH_FRAMING INCONCLUSIVE reason=no-camera'); return; }
    // ROUND 8 (2026-09-16) DIAGNOSTIC — force=true, explicitly, right before anything reads the
    // camera's matrices, and say so (`camMatrixAge=`) — ruling out "the witness read a stale
    // matrixWorldInverse" as the cause of PICK/FRAMING disagreeing, rather than assuming it.
    var camMatrixAge = 'stale';
    if (A.camera.updateMatrixWorld) { A.camera.updateMatrixWorld(true); camMatrixAge = 'fresh'; }
    // ROUND 6 — NO pose is pushed and NOTHING is re-aimed: the camera is already at its real, held
    // pose (item 1's arm/hold fix keeps it there) — projecting with _projectAABBLive reads that
    // pose's OWN current matrices directly. A.controls.target is never consulted for orientation
    // here any more (that was the whole defect: a stale/wrong target aimed the TEST camera away
    // from the building while the real, rendered camera was pointed correctly the whole time).
    var camDirVec = (typeof A.camera.getWorldDirection === 'function') ? A.camera.getWorldDirection(new THREE.Vector3()) : null;
    var off = { x: 0, y: 0, z: 0 };
    var frameOffActive = !!(window.__lpFrameOff && _lp.buildingBox && typeof A.camera.getWorldDirection === 'function');
    if (frameOffActive) {
      var fwd = A.camera.getWorldDirection(new THREE.Vector3());
      var camUp = (A.camera.up && A.camera.up.clone) ? A.camera.up.clone() : new THREE.Vector3(0, 1, 0);
      var right = new THREE.Vector3().crossVectors(fwd, camUp).normalize();
      var bSize = { x: _lp.buildingBox.maxX - _lp.buildingBox.minX, y: _lp.buildingBox.maxY - _lp.buildingBox.minY,
                    z: _lp.buildingBox.maxZ - _lp.buildingBox.minZ };
      var offMag = 50 * Math.hypot(bSize.x, bSize.y, bSize.z);   // no camera keeps this in NDC [-1,1]
      off = { x: right.x * offMag, y: right.y * offMag, z: right.z * offMag };
    }
    function shiftBox(box) {
      if (!box || (off.x === 0 && off.y === 0 && off.z === 0)) return box;
      return { minX: box.minX + off.x, maxX: box.maxX + off.x, minY: box.minY + off.y, maxY: box.maxY + off.y,
               minZ: box.minZ + off.z, maxZ: box.maxZ + off.z };
    }
    var fBox = shiftBox(_lp.buildingBox);
    var fRes = fBox ? _projectAABBLive(fBox, A.camera) : null;
    var f = fRes ? fRes.fraction : null;
    var chainBox = _chainWorldBBox(stack.hopsUp);
    var gBox = chainBox ? shiftBox({ minX: chainBox.min.x, maxX: chainBox.max.x, minY: chainBox.min.y,
      maxY: chainBox.max.y, minZ: chainBox.min.z, maxZ: chainBox.max.z }) : null;
    var gRes = gBox ? _projectAABBLive(gBox, A.camera) : null;
    var g = gRes ? gRes.fraction : null;
    var hopsN = stack.hopsUp.length, hopsIntersecting = 0, memberPx = [];
    // ROUND 4 item 1c (2026-09-16, real Terminal bake: memberPx=[1383.1] printed for a hop this
    // SAME witness itself found hopsIntersecting=0 for) — PICK's own minMemberPxOf (shotPose + the
    // item's DB-metadata AABB) and this witness's own hopsIntersecting (the LIVE hold pose + the
    // REAL clone mesh's box) are two independent computations that can legitimately disagree.
    // Fixed by computing memberPx HERE, from the EXACT SAME box/pose/frustum-test this witness's
    // own hopsIntersecting already uses — one computation, one pose, one box source, feeding both
    // numbers, so they can never again print a contradiction: a hop this test finds NOT intersecting
    // contributes nothing to memberPx (never a giant, meaningless height for an off-frustum member).
    stack.hopsUp.forEach(function (h) {
      if (!h._cloneMesh) return;
      h._cloneMesh.updateMatrixWorld(true);
      var b = new THREE.Box3().setFromObject(h._cloneMesh);
      var box = shiftBox({ minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z });
      var r = _projectAABBLive(box, A.camera);
      if (r && r.intersects) { hopsIntersecting++; memberPx.push(_memberPxHeightLive(box, A.camera, _lp.outH)); }
    });
    var ok = hopsIntersecting >= 1;
    // ══ ROUND 8 (2026-09-16) DIAGNOSTIC ONLY, for hop 0 (_lp.hopsUp[0]) — the two boxes PICK and
    // FRAMING each actually use, and whether the LIVE frustum (a fresh, LOCAL Frustum built here
    // ONLY for this print — never substituted for the real one `_projectAABBLive` builds internally,
    // so this cannot change any decision) agrees or disagrees with each of them independently. A
    // fresh Frustum for the SAME matrices `_frustumTestAtCurrentPose` just used above (camMatrixAge
    // already forced fresh) — if hop0Dot is negative, the clone centre is literally behind the
    // camera; if frustumSrc/frustumClone disagree with each other, the boxes themselves differ; if
    // both agree and both say "in", but hopsIntersecting still read 0 for a DIFFERENT hop, the cause
    // is per-hop, not systemic. ═══════════════════════════════════════════════════════════════════
    var hop0Src = null, hop0Clone = null, hop0Dot = null, hop0NDC = null, frustumSrc = null, frustumClone = null;
    if (stack.hopsUp.length) {
      var hop0 = stack.hopsUp[0];
      var srcBox0 = _instanceWorldBox(hop0.guid);
      if (srcBox0) hop0Src = { x: (srcBox0.minX + srcBox0.maxX) / 2, y: (srcBox0.minY + srcBox0.maxY) / 2, z: (srcBox0.minZ + srcBox0.maxZ) / 2 };
      if (hop0._cloneMesh) {
        hop0._cloneMesh.updateMatrixWorld(true);
        var cb0 = new THREE.Box3().setFromObject(hop0._cloneMesh);
        hop0Clone = cb0.getCenter(new THREE.Vector3());
      }
      var camPosNow = { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z };
      if (hop0Clone && camDirVec) {
        hop0Dot = (hop0Clone.x - camPosNow.x) * camDirVec.x + (hop0Clone.y - camPosNow.y) * camDirVec.y + (hop0Clone.z - camPosNow.z) * camDirVec.z;
      }
      if (hop0Clone) { var p0 = hop0Clone.clone().project(A.camera); hop0NDC = { x: p0.x, y: p0.y, z: p0.z }; }
      if (typeof THREE.Frustum === 'function' && typeof THREE.Matrix4 === 'function' && A.camera.matrixWorldInverse) {
        var frMat0 = new THREE.Matrix4().multiplyMatrices(A.camera.projectionMatrix, A.camera.matrixWorldInverse);
        var fr0 = new THREE.Frustum().setFromProjectionMatrix(frMat0);
        if (hop0Src) frustumSrc = fr0.containsPoint(hop0Src);
        if (hop0Clone) frustumClone = fr0.containsPoint(hop0Clone);
      }
    }
    function fmtV(v) { return v ? '[' + v.x.toFixed(3) + ',' + v.y.toFixed(3) + ',' + v.z.toFixed(3) + ']' : '?'; }
    // §129.8 item 2 — memberVis (unoccluded)/underHud, per hop, REUSING the arm-time occlusion
    // scoring `_pickTwoStacks`/`_scoreChain` already computed ONCE (never re-raycast per frame —
    // the spec's own cost discipline): `stack.memberVis` is that pick's own `perHop` array (chain/
    // top-down order, by guid), remapped here onto `stack.hopsUp`'s own bottom-up order so every
    // printed array lines up hop-for-hop with `hex`/`memberPx`/every other per-hop field.
    var visByGuid = {};
    (stack.memberVis || []).forEach(function (m) { visByGuid[m.guid] = m; });
    var memberVis = [], underHud = [];
    stack.hopsUp.forEach(function (h) {
      var m = visByGuid[h.guid];
      // ROUND 18 — `unoccluded` reads `null` when the arm-time pick skipped raycasting entirely
      // (`pickSource=frustum-fallback reason=raycast-universe-too-large`, ~`_pickTwoStacks`'s own
      // size gate): print the honest `n/a`, never a fabricated 0/1 fed straight into `.toFixed(2)`.
      memberVis.push(m ? (m.unoccluded == null ? 'n/a' : +m.unoccluded.toFixed(2)) : 0);
      underHud.push(!!(m && m.underHud));
    });
    // ROUND 9 CHAIN-PRINT GAP — `guid=` names WHICH pick is being framed: `stack.pickItem`/
    // `stack.hopsUp` are already the FINAL (live, occlusion-scored) winner by the time this fires
    // (mid-hold), never a stale probe pick.
    console.log('§LOADPATH_FRAMING stack=' + (stackName || stack.name) + ' guid=' + (stack.pickItem ? stack.pickItem.guid : '?') +
      ' buildingInFrame=' + (f == null ? '?' : f.toFixed(3)) +
      ' stackInFrame=' + (g == null ? '?' : g.toFixed(3)) + ' hopsIntersecting=' + hopsIntersecting + '/' + hopsN +
      ' memberPx=[' + memberPx.map(function (m) { return m.toFixed(1); }).join(',') + ']' +
      ' memberVis=[' + memberVis.join(',') + ']' + ' underHud=[' + underHud.join(',') + ']' +
      ' camDir=' + (camDirVec ? '[' + camDirVec.x.toFixed(3) + ',' + camDirVec.y.toFixed(3) + ',' + camDirVec.z.toFixed(3) + ']' : '?') +
      ' camMatrixAge=' + camMatrixAge +
      ' hop0Src=' + fmtV(hop0Src) + ' hop0Clone=' + fmtV(hop0Clone) +
      ' hop0Dot=' + (hop0Dot == null ? '?' : hop0Dot.toFixed(3)) + ' hop0NDC=' + fmtV(hop0NDC) +
      ' frustumSrc=' + (frustumSrc == null ? '?' : frustumSrc) + ' frustumClone=' + (frustumClone == null ? '?' : frustumClone) +
      (frameOffActive ? ' frameOff=true offset=[' + off.x.toFixed(2) + ',' + off.y.toFixed(2) + ',' + off.z.toFixed(2) + ']' : '') +
      ' => ' + (ok ? 'PASS' : 'FAIL'));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // A.loadPathBuild(plan, filmSecFull, topoutU, db) — once, before the frame loop.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // §129.7 item 3 — `outW`/`outH` (optional, defaults 1920x1080 — the reference resolution ranking
  // was disclosed against; RANK ORDER among candidates is scale-invariant so this default never
  // changes WHICH candidate wins, only the printed px number's units) are the render canvas size,
  // needed to convert the ranking's own NDC projections to real pixels for `minMemberPx`.
  // `fps` (optional, default 24) — §129.7 item 6's own §LOADPATH_BACKDROP witness needs it to
  // report `fadeInFrames`/`fadeOutFrames` as real frame counts, never a guessed constant.
  A.loadPathBuild = function (plan, filmSecFull, topoutU, db, outW, outH, fps) {
    _lp = null; A._loadPathWindow = null;
    // ROUND 9 item 1 — fresh per build, so a bake with no hold this time (or the
    // __lpNoClockFreeze control) never carries a PREVIOUS hold's armTnMatch into §LOADPATH_HOLD.
    A._loadPathArmFrameTn = null; A._loadPathArmTnMatch = true;
    _lpLabelsWitnessFiredThisHold = {};   // §LOADPATH_LABELS — re-arm for this (possibly new) hold, per stack
    _lpCardWitnessFired = false;   // ROUND 13 / §LOADPATH_CARD — re-arm for this (possibly new) hold
    try {
      db = db || A.db;
      if (!db) { console.log('§LOADPATH_BUILD INCONCLUSIVE reason=no-db'); return; }
      if (!window.SupportSweep || !window.SupportSweep.contactGraph || !window.SupportSweep.designatedSupport) {
        console.log('§LOADPATH_BUILD INCONCLUSIVE reason=no-SupportSweep'); return;
      }
      if (topoutU == null) { console.log('§LOADPATH_BUILD INCONCLUSIVE reason=no-topout (no buildup on this bake)'); return; }
      var items = _buildItems();
      if (!items.length) { console.log('§LOADPATH_BUILD INCONCLUSIVE reason=no-geometry'); return; }
      var G = window.SupportSweep.contactGraph(items);
      if (!G.ok) { console.log('§LOADPATH_BUILD INCONCLUSIVE reason=contactGraph-not-ok (no ScheduleGate on this page)'); return; }
      var des = window.SupportSweep.designatedSupport(items, G);
      var info = _resolveChainInfo(items, des, G.groundConnected);
      var pick = _pick(items, info, des);
      if (!pick) { console.log('§LOADPATH_BUILD INCONCLUSIVE reason=empty-pick (no monotone-descending, load-bearing, labelled, ground-ending candidate)'); return; }

      // v8 HOLD-POINT SEARCH — building-only, independent of which candidate eventually wins.
      // ROUND 7 — `items`/`pick.valid` are passed so the search's own fallback criterion (no sample
      // reached 80%) can land on the sample where SOME candidate chain shows the most hops.
      var buildingBox = _buildingWorldBBox(items);
      var shot = _searchHoldPoint(plan, topoutU, filmSecFull, buildingBox, items, pick.valid);

      // §129.7 item 3 — rank every MONOTONE-DESCENDING, >=1-visible-hop candidate by minMemberPx
      // DESC FIRST ("a thicker member or a nearer one both raise it"), then hops-in-the-shot, then
      // depth, footprint, guid.
      // ROUND 5 item 4 (2026-09-16, real Terminal bake: PICK's own DB-metadata boxes said
      // visibleHops=7/7 while the real clone meshes' own frustum test found 0/7) — visibility and
      // memberPx are now measured against `_instanceWorldBox(guid)`, the SAME source-instance world
      // box `_buildChainClones`'s clones are placed at (never `_worldAABBFromItem`'s DB-coordinate
      // math again for this): PICK and FRAMING read the identical geometry, so they can no longer
      // disagree. A guid with no resolvable source instance counts as NOT visible for that hop
      // (never a silent fallback to the old, disagreeing math).
      // ROUND 7 item 2 (2026-09-16, real Terminal bake: PICK still disagreed with FRAMING even after
      // Round 5's fix, because `plan.poseAt(shot.tNorm)` is the RAW, un-blended plan pose — a camera
      // orientation the bake never actually renders; the frame loop ALSO gaze-blends the look target
      // (§57.5) before it ever reaches the real camera) — `shotPose` now comes from
      // `A._bakeCameraPoseAt(shot.tNorm)` (the exact pose the frame loop builds), never the raw plan
      // pose, so PICK evaluates the SAME orientation FRAMING will later see live.
      var shotPose = (typeof A._bakeCameraPoseAt === 'function') ? A._bakeCameraPoseAt(shot.tNorm)
        : (plan && typeof plan.poseAt === 'function') ? plan.poseAt(shot.tNorm) : null;
      var _outH = outH || 1080;
      function visibleHopsOf(chainIdxForV) {
        if (!shotPose || !A.camera) return 0;
        var vis = 0;
        chainIdxForV.forEach(function (i) {
          var box = _instanceWorldBox(items[i].guid);
          if (!box) return;
          var r = _projectAABB(box, shotPose, A.camera);
          if (r && r.intersects) vis++;
        });
        return vis;
      }
      // Per VISIBLE hop only (item 7a/c's own convention — off-screen hops are never measured, only
      // coloured): the smallest projected bbox height is the candidate's minMemberPx.
      function minMemberPxOf(chainIdxForV) {
        if (!shotPose || !A.camera) return { minMemberPx: 0, memberPx: [] };
        var memberPx = [];
        chainIdxForV.forEach(function (i) {
          var box = _instanceWorldBox(items[i].guid);
          if (!box) return;
          var r = _projectAABB(box, shotPose, A.camera);
          if (r && r.intersects) memberPx.push(_memberPxHeight(box, shotPose, A.camera, _outH));
        });
        return { minMemberPx: memberPx.length ? Math.min.apply(null, memberPx) : 0, memberPx: memberPx };
      }
      var resolved = _rankValid(items, pick.valid, visibleHopsOf, minMemberPxOf, !!window.__lpPickThinnest);
      var pickItem = items[resolved.idx];
      // stackInFrame — informational only (never gates PICK/ranking since v9 item 7): the winning
      // chain's own union-bbox corner fraction at the hold point, unchanged v8 metric.
      var stackBox = null;
      resolved.chain.forEach(function (i) { stackBox = _unionAABB(stackBox, _worldAABBFromItem(items[i])); });
      var stackInFrameRes = (stackBox && shotPose && A.camera) ? _projectAABB(stackBox, shotPose, A.camera) : null;
      var stackInFrame = stackInFrameRes ? stackInFrameRes.fraction : 0;
      console.log('§LOADPATH_SHOT tNorm=' + shot.tNorm.toFixed(4) +
        ' buildingInFrame=' + (shot.buildingInFrame == null ? '?' : shot.buildingInFrame.toFixed(3)) +
        ' stackInFrame=' + stackInFrame.toFixed(3) + ' best=' + shot.best +
        ' bestVisibleHops=' + (shot.bestVisibleHops == null ? '?' : shot.bestVisibleHops) +
        (shot.reason ? ' reason=' + shot.reason : ''));
      // ROUND 7 item 4 (2026-09-16) — at the CHOSEN hold pose, if no candidate chain has even one
      // hop in the frustum (resolved.visibleHops===0 — _rankValid's own ">=1 visible hop" filter
      // could only fall back to the full, unfiltered pool), there is nothing to hold on: print
      // INCONCLUSIVE and skip the beat rather than draw/arm an off-screen stack. Gated on
      // `shotPose && A.camera` — visibleHops is UNCONDITIONALLY 0 whenever there was no camera/pose
      // to test against at all (visibleHopsOf's own `if (!shotPose||!A.camera) return 0`), which is
      // "we could not judge", never "we judged and saw nothing" — only the latter should skip.
      if (shotPose && A.camera && resolved.visibleHops === 0) {
        console.log('§LOADPATH_PICK INCONCLUSIVE reason=no-stack-in-shot');
        return;
      }
      // §129.8 item 3 — PROVISIONAL two-stack estimate, at BUILD time, off the CHEAP probe-based
      // ranking (never raycasting here — raycasting happens exactly once, at ARM, on the live
      // camera, see the FINAL pick in loadPathApplyVisual). This exists ONLY to size `durSec`
      // (frames are spliced into the timeline before arm ever fires — see cinema_maxq.js's own
      // `_lpHoldFrameStart`/`_lpFramesInserted`, computed immediately after this function returns —
      // so the hop counts for BOTH stacks must be known now). The arm-time occlusion-scored pick is
      // the one that actually decides which guids light up; a mismatch in hop COUNT between this
      // estimate and the final pick only shortens/lengthens that stack's own reveal cadence by a
      // step or two — the same tolerated approximation ROUND 9 already accepted for the single-stack
      // case (a live re-pick with a different hop count than the probe's own guess).
      var nearProvisionalHops = resolved.chain.length;
      var farProvisionalHops = 0;
      if (!window.__lpOneStack) {
        var nearDist = 0;
        if (shotPose && stackBox) {
          var nbc = { x: (stackBox.minX + stackBox.maxX) / 2, y: (stackBox.minY + stackBox.maxY) / 2, z: (stackBox.minZ + stackBox.maxZ) / 2 };
          nearDist = Math.hypot(nbc.x - shotPose.x, nbc.y - shotPose.y, nbc.z - shotPose.z);
        }
        var shotDir = shotPose ? (function () {
          var dx = shotPose.tx - shotPose.x, dy = shotPose.ty - shotPose.y, dz = shotPose.tz - shotPose.z, dl = Math.hypot(dx, dy, dz) || 1;
          return { x: dx / dl, y: dy / dl, z: dz / dl };
        })() : { x: 0, y: 0, z: -1 };
        var extentEstimate = shotPose ? _extentAlongDir(buildingBox, shotPose, shotDir) : 0;
        var farCandidates = pick.valid.filter(function (c) {
          if (c.idx === resolved.idx) return false;
          var cb = null; c.chain.forEach(function (i) { cb = _unionAABB(cb, _worldAABBFromItem(items[i])); });
          if (!cb || !shotPose) return false;
          var cc = { x: (cb.minX + cb.maxX) / 2, y: (cb.minY + cb.maxY) / 2, z: (cb.minZ + cb.maxZ) / 2 };
          var d = Math.hypot(cc.x - shotPose.x, cc.y - shotPose.y, cc.z - shotPose.z);
          return (d - nearDist) >= extentEstimate;
        });
        if (farCandidates.length) {
          var farResolved = _rankValid(items, farCandidates, visibleHopsOf, minMemberPxOf, !!window.__lpPickThinnest);
          farProvisionalHops = farResolved.chain.length;
        }
      }
      var nearDurEst = Math.min(HOLD_CAP_SEC, nearProvisionalHops * 1 + 1);
      var farDurEst = farProvisionalHops ? Math.min(HOLD_CAP_SEC, farProvisionalHops * 1 + 1) : 0;
      var durSec = nearDurEst + farDurEst;
      if (durSec > HOLD_CAP_SEC) {
        var _scale = HOLD_CAP_SEC / durSec;
        nearDurEst *= _scale; farDurEst *= _scale; durSec = HOLD_CAP_SEC;
      }

      var chainIdx = resolved.chain;     // ground-truth, NEVER touched by the tap — already validated monotone in _pick
      // v10 CHAIN MUST DESCEND — re-print the ALREADY-validated descent info (computed once in
      // _pick, never re-derived) so a log reader sees the proof on the same line as the chain
      // itself. `ascents` is always 0 here BY CONSTRUCTION (an ascending chain is never a candidate
      // in the first place, see _pick) — the control/dry-run proof that ascending chains are
      // REJECTED, not silently accepted, lives in the node dry run, not a live toggle on this line.
      // Drawn-hop bookkeeping + the print itself go through `_chainDrawnInfo`/`_printChainWitness`
      // (ROUND 9 CHAIN-PRINT GAP) — this build-time call is unchanged (no `pickSource=`, byte-
      // identical to the pre-gap-fix line); the arm-time re-pick below prints it again for the
      // FINAL (possibly live-switched) winner, tagged `pickSource=`.
      var drawnInfo = _chainDrawnInfo(chainIdx);
      var drawnIdx = drawnInfo.drawnIdx;
      _printChainWitness(items, pickItem, chainIdx, drawnInfo, null);

      // Ground-up for the visual (label k/N lands bottom-first): reverse the drawn (top-down) walk.
      var hopsUp = drawnIdx.slice().reverse().map(function (i, k) {
        return { guid: items[i].guid, cls: items[i].cls, storey: items[i].storey, idx: i, k: k };
      });
      hopsUp.forEach(function (h, k) { h.hex = _hexForHop(k, hopsUp.length); });
      console.log('§LOADPATH_PICK guid=' + pickItem.guid + ' cls=' + pickItem.cls + ' storey=' + pickItem.storey +
        ' hops=' + resolved.depth + ' candidates=' + pick.candidates + ' rejectedAscending=' + pick.rejectedAscending +
        ' rejectedSingleHop=' + pick.rejectedSingleHop +
        ' skippedNonStructural=' + info.skipCount[resolved.idx] + ' visibleHops=' + resolved.visibleHops + '/' + resolved.chain.length +
        ' minMemberPx=' + resolved.minMemberPx.toFixed(1) +
        ' stackInFrame=' + stackInFrame.toFixed(3) + ' rule=' + resolved.rule +
        ' (provisional — see §LOADPATH_PICK stacks= at arm for the FINAL, occlusion-scored pick)');

      var holdStartSec = shot.tNorm * filmSecFull;   // v8: the SEARCHED point, not raw topoutU
      var holdEndSec = holdStartSec + durSec;
      var durU = filmSecFull > 0 ? Math.max(0, Math.min(1 - topoutU, (holdEndSec / filmSecFull) - topoutU)) : 0;
      // ROUND 13 / §129.8 item 6 — the BUILD-TIME PROBE pick's own guid(s), stashed ONLY for
      // window.__lpCardWrongStack's own control (_cardAssemble's wrongStackControl branch); the
      // real card and its witness always read the LIVE, arm-time re-pick (_lp.pickItem/_lp.far.
      // pickItem) instead. `farResolved` is function-scoped (var-hoisted) and stays undefined when
      // no far candidate was ever found at build time — never re-derived here.
      var buildFarGuid = (typeof farResolved !== 'undefined' && farResolved) ? items[farResolved.idx].guid : null;

      _lp = {
        ok: true, items: items, pickItem: pickItem, buildingBox: buildingBox,
        buildNearGuid: pickItem.guid, buildFarGuid: buildFarGuid,
        hopsUp: hopsUp, filmSecFull: filmSecFull, holdStartSec: holdStartSec, holdEndSec: holdEndSec,
        midSec: (holdStartSec + holdEndSec) / 2, midFired: false, ghostResult: null, armPose: null,
        chainBox: null, lastHoldPose: null, fps: fps || 24, outH: outH || 1080, outW: outW || 1920,
        backdropWitnessFired: false, hudFadeWitnessFired: false,   // §129.7 item 6 / §129.8 item 4b — fresh per build/hold
        // ROUND 8 (2026-09-16) DIAGNOSTICS ONLY — PICK's own probe pose and its own visibleHops
        // count, stashed so the ARM-time diagnostic print below can compare them against the LIVE
        // camera without re-deriving or re-guessing either one.
        shotPose: shotPose, pickVisibleHops: resolved.visibleHops,
        // ROUND 9 item 2 / §129.8 item 3 — every valid (monotone-descending, ground-ending, >=2-hop)
        // candidate from THIS build's own `_pick`, stashed so the ARM-time FINAL PICK below can
        // score the SAME pool against the live camera (occlusion, item 2) instead of only re-testing
        // the probe's already-chosen chain.
        validCandidates: pick.valid,
        // §129.8 item 3 — TWO STACKS. `far` is null until/unless arm actually picks one; durSec
        // fields are the BUILD-TIME ESTIMATE (frame count is already committed by the time arm
        // runs) — arm may reveal a different hop count per stack without changing these.
        nearDurSec: nearDurEst, farDurSec: farDurEst,
        far: null, lookMode: _lookGhost() ? 'ghost' : 'shine', armHudRects: null,
        durSec: durSec, armed: false, cursorAtEntry: null, holdBroke: false, revealedHops: 0,
        name: 'near'   // §129.8 item 3 — _lp itself doubles as the NEAR stack object (minimal-diff
                        // reuse of every existing per-hop function); `_lp.far` is the other one.
      };
      A._loadPathBackdropAppliedBlackOnce = false;   // §129.7 item 6 — fresh per build, for the __lpBackdropNoRestore control
      // §LOADPATH_BACKDROP generalized population (2026-09-16) — fresh per build, the ONE safe reset
      // point (well before any fade begins this hold — see `_bd`'s own comment for why this is never
      // folded into the ARM-time `_resetRayCache()` a few lines below/elsewhere in this function).
      _bd = null; _blackSample = null;
      A._loadPathFocusLastResult = null;   // §LOADPATH_CONTEXT_OFF — fresh per build, never a stale prior hold's FOCUS verdict
      A._loadPathWindow = { durU: durU, durSec: durSec, holdStartSec: holdStartSec, holdEndSec: holdEndSec };
      _resetRayCache();   // §129.8 item 2 — fresh raycast universe for this (possibly new) hold
      console.log('§LOADPATH_BUILD ok hops=' + hopsUp.length + ' durSec=' + durSec.toFixed(2) +
        ' window=[' + holdStartSec.toFixed(2) + 's,' + holdEndSec.toFixed(2) + 's] topoutU=' + topoutU.toFixed(4) +
        ' holdPointTNorm=' + shot.tNorm.toFixed(4));
    } catch (e) { _err('BUILD', e); _lp = null; A._loadPathWindow = null; }
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // A.loadPathApplyVisual(plan, tNorm) — every frame; (null, 0) forces a restore.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // v10 LOOK — "a solid layer must never sit above a ghost one": which hopsUp indices (ground-up,
  // index 0 = ground) are solid once `revealed` steps have landed. Normal = bottom-up [0..revealed).
  // Control window.__lpTopDown=1 makes it the TOP `revealed` layers instead — deliberately inverted,
  // to prove §LOADPATH_STACK catches the very first violation (step 1: the top layer alone is solid
  // while everything below it, including ground, is still ghost).
  function _solidSetFor(K, revealed) {
    var set = {};
    if (window.__lpTopDown) { for (var i = K - revealed; i < K; i++) set[i] = true; }
    else { for (var j = 0; j < revealed; j++) set[j] = true; }
    return set;
  }
  // §LOADPATH_STACK — measures ACTUAL material state (_isSolid), never trusts the intended index:
  // finds the highest solid index, then checks every index below it is ALSO solid. Any ghost found
  // below the highest solid layer is the "solid above a ghost" inversion the witness exists to catch.
  // §129.8 item 3 — `stack` ({name, hopsUp}) replaces the implicit `_lp` read, so the SAME function
  // serves both FAR and NEAR; prints `stack=far|near` and `step=j/K` per the spec's own line shape.
  function _stackWitness(stack, revealed) {
    var K = stack.hopsUp.length, solidCount = 0, highestSolid = -1;
    for (var idx = 0; idx < K; idx++) { if (_isSolid(stack.hopsUp[idx])) { solidCount++; if (idx > highestSolid) highestSolid = idx; } }
    var broken = false;
    for (var idx2 = 0; idx2 <= highestSolid; idx2++) if (!_isSolid(stack.hopsUp[idx2])) broken = true;
    console.log('§LOADPATH_STACK stack=' + stack.name + ' order=bottomUp step=' + revealed + '/' + K +
      ' solid=' + solidCount + '/' + K + ' ghostAbove=' + (K - solidCount) + ' => ' + (broken ? 'FAIL' : 'PASS'));
    return !broken;
  }
  // §129.8 item 3 — one stack's own bottom-up reveal step, driven by `stackElapsed` (seconds since
  // THIS stack's own turn began — 0 at its own arm, capped at its own durSec). Shine mode toggles
  // `mesh.visible` (opacity stays 1 always, see _buildChainClones); ghost mode animates
  // opacity/transparent/depthWrite exactly as §129.7's own v10 LOOK did. No-ops once fully revealed
  // (idempotent — safe to call every frame with a clamped `stackElapsed`).
  function _revealStackStep(stack, stackElapsed) {
    var K = stack.hopsUp.length;
    var revealed = Math.max(0, Math.min(K, Math.floor(stackElapsed) + 1));
    if (revealed === stack.revealedHops) return;
    stack.revealedHops = revealed;
    var solidSet = _solidSetFor(K, revealed);
    var landingIdx = window.__lpTopDown ? (K - revealed) : (revealed - 1);
    var ghostLook = _lookGhost();
    stack.hopsUp.forEach(function (h, k) {
      if (!h._cloneMesh) return;
      var makeSolid = !!solidSet[k];
      var age = stackElapsed - (revealed - 1);
      var hex = (k === landingIdx && age >= 0 && age < GLOW_SEC && typeof THREE !== 'undefined')
        ? new THREE.Color(h.hex).lerp(new THREE.Color(0xffffff), 1 - age / GLOW_SEC).getHex() : h.hex;
      if (ghostLook) {
        if (!h._cloneMat) return;
        h._cloneMat.transparent = !makeSolid; h._cloneMat.opacity = makeSolid ? 1 : GHOST_OPACITY;
        h._cloneMat.depthWrite = makeSolid;
        if (h._cloneMat.color) h._cloneMat.color.setHex(hex);
      } else {
        h._cloneMesh.visible = makeSolid;   // §129.8 item 1 — shine-through: visibility IS solidity
        if (h._cloneMat && h._cloneMat.color) h._cloneMat.color.setHex(hex);
      }
    });
    stack.stackOk = _stackWitness(stack, revealed) && (stack.stackOk !== false);
  }
  A._loadPathStackWitness = _stackWitness; A._loadPathRevealStackStep = _revealStackStep;
  A._loadPathSolidSetFor = _solidSetFor; A._loadPathIsSolid = _isSolid;
  // ══ §129.7 item 6 (2026-09-16, user: "the background earth, silhouette and sky to disappear in
  // black... add it, fade in and out"; sharpened by the coordinator: the fade rides the FILM CLOCK
  // in MOVING film — ~0.5s BEFORE arm (ending black exactly at arm) and ~0.5s AFTER release
  // (starting black exactly at release); the FROZEN hold itself is a constant (same tFilm as arm,
  // nothing to interpolate) ══════════════════════════════════════════════════════════════════════
  // Pure — `fSec`/`holdStartSec`/`holdEndSec` all in the SAME real-seconds units _lp already uses
  // (holdStartSec/holdEndSec are the PLANNED hold window, known from the hold-point search at BUILD
  // time — no need to wait for arm to actually happen to start the pre-arm fade). Node-dry-runnable
  // with plain numbers, same convention as _ladderLayout/_freeVerticalSpan above.
  // Fix (2026-09-16, 3rd investigation into §LOADPATH_BACKDROP_DIAG's appliedBlackOnce staying
  // false all the way to release, confirmed via §LOADPATH_BACKDROP_FSEC_DIAG's own numbers against
  // a real HHS bake) — the live `fSec` a caller passes is whatever frame cinema_maxq.js's own
  // frame-splice actually rendered, which `_lpFrameForArmTn` (cinema_maxq.js:1648, `Math.round`)
  // grid-snaps to the NEAREST frame of the CONTINUOUS, unsnapped `holdStartSec`/`holdEndSec` this
  // pure formula compares against — by construction up to half a frame's worth of real seconds off,
  // either side. The old strict `<`/`<=` boundary never returned exactly 1 for the WHOLE hold
  // whenever the snap rounded short — root-caused from code + real bake numbers, not guessed.
  // `eps` = one frame's duration at THIS hold's own fps (2x the max 0.5-frame snap error — a
  // comfortable margin that still fails a real multi-frame regression, never so loose it would mask
  // one). `fps` is optional (falls back to 24) so every existing/other caller (node dry runs
  // included) keeps working unchanged — this stays pure/dry-runnable with plain numbers.
  // §129.14 FIX (2026-09-18, real bake evidence, `§LOADPATH_FSEC_DIAG`/`§LOADPATH_BACKDROP_APPLY_
  // DIAG` on HHS_loadpath_r76-r79) — the ramp-OUT used to compare live `fSec` against the ABSOLUTE
  // `holdEndSec`. That is correct ONLY if `fSec` advances continuously through the whole hold. It
  // doesn't: the beat's own clock-freeze (§129.6 item 1, cinema_maxq.js) PINS `fSec` at `holdStartSec`
  // for the entire spliced hold, then resumes counting UP FROM THAT SAME PINNED VALUE once released —
  // so `fSec` has to count through the WHOLE `(holdEndSec-holdStartSec)` span AGAIN, in real POST-
  // RELEASE film-time, before it ever crosses `holdEndSec` and the ramp even starts. Measured: a
  // 6-second hold left the backdrop (52/52 items, `_bd.items`) pinned at `opacity=0` for ~6 more real
  // seconds after the camera had already visually resumed moving — not the intended 0.5s symmetric
  // fade. `A._sky`'s own SEPARATE hide/show restore (not fSec-gated at all, flipped instantly at the
  // real frame-splice release) was never affected — which is why sky/ground LOOKED fine in the prior
  // session's diagnostic while this opacity-driven population (skyline silhouette boxes etc) stayed
  // black. Fix: ramp OUT from the TRUE release moment (`releaseFSec`, the real fSec captured once at
  // the frame-splice release trigger, `A._loadPathReleaseTFilm * _lp.filmSecFull` — see call site),
  // never from the stale `holdEndSec` threshold `fSec` may take seconds to naturally reach.
  // §129.17 FIX (2026-09-18, red1: "the back[drop] still wipes as it is not grouped together with
  // HUD/overlay that does fade off/on... the fade back in also shows the background cuts in without
  // syncing with the rest" / "ensure it is same fade effect, not a wipe") — the arm-side fade used to
  // run BEFORE arm (`[holdStartSec-fadeSec, holdStartSec]`, driven by the continuously-advancing
  // pre-arm `fSec`), finishing to fully black BEFORE the hold visually starts at all. CONFIRMED via a
  // real extracted frame (HHS_loadpath_r81, one frame before arm): the skyline was already solid
  // black while the building/HUD were still completely normal — a full fadeSec of "nothing else is
  // moving yet" before anything else even begins its own transition, which reads as an abrupt,
  // disconnected cut rather than one unified fade. Cut/whiten structurally CANNOT fade in before arm
  // (its clones/cut plane don't exist until arm builds them — §129 OPEN ITEM's own comment) and HUD's
  // own fade-out already starts AT arm, so the fix brings backdrop into that SAME window instead:
  // driven by `elapsed` (the hold's own internal clock, correctly advances even while `fSec` is
  // frozen — see §129.14's own root-cause writeup for why `fSec` alone can't drive an arm-side ramp)
  // exactly like `_cutT` already does, not by `fSec`. Still a genuine OPACITY fade throughout, same
  // mechanism as before and same as HUD/cut-whiten's own colour lerp — only the TIMING WINDOW moved,
  // never becoming a geometric wipe. The RELEASE side is untouched: it already starts AT true release
  // (§129.14/§129.16), matching cut/whiten's own release timing, and `fSec` correctly advances again
  // post-release so the original fSec-driven mechanism is still the right tool there.
  function _backdropFadeT(elapsed, inWindow, fSec, fadeSec, releaseFSec) {
    if (!(fadeSec > 0)) return 0;
    if (releaseFSec != null) return Math.max(0, Math.min(1, 1 - (fSec - releaseFSec) / fadeSec));
    if (!inWindow || elapsed == null) return 0;   // not armed yet — nothing to fade, matches cut/whiten
    return Math.max(0, Math.min(1, elapsed / fadeSec));   // same curve as cut/whiten's own _cutT
  }
  // Reuses whatever the film already has for backdrop/context — GENERALIZED 2026-09-16 (red1 direct
  // ruling: "ALL ELSE FADE OFF", superseding the old hand-picked ground/sky/skyline-only list): every
  // object `_allElseObjects()` returns (ground/sky/skyline/staffage/props/anything else that is not
  // this beat's own clone and not a recognized building element — see that function's own comment)
  // PLUS the renderer's own clear colour — NO new scene objects, NO enumerated exceptions.
  // Captured ONCE per hold build (lazily — first real call is `loadPathApplyVisual`'s own frame 0,
  // always well before any fade, since `A.loadPathBuild` runs "once, before the frame loop" and
  // resets `_bd`/`_blackSample` to null right there — see its own reset lines). Deliberately NOT
  // folded into `_resetRayCache()` (which ALSO runs at ARM, mid-fade, inside `_pickTwoStacks` — line
  // ~1173 above): re-capturing "original" opacities from materials that are already faded toward
  // black at that instant would corrupt every original this fade needs for the rest of the hold. The
  // POPULATION enumeration (`_allElseObjects()`, cheap identification only, no opacity read) is safe
  // to redo at either point; the OPACITY snapshot below is only ever taken here, at the one safe time.
  var _bd = null;
  // §LOADPATH_BACKDROP live-at-black sample (coordinator addition, 2026-09-16) — populated ONCE by
  // `_backdropApply`, the FIRST real playback frame this hold's own fade actually reaches t=1, so the
  // witness (fired later, at release) can report the TRUE live material state at the black point —
  // not just that the pure `_backdropFadeT` formula says t should be 1 there. Reset alongside `_bd`.
  var _blackSample = null;
  var _bdSeen = null;   // persists across calls — lets _backdropTopUp() know what's already captured
  function _backdropCapture() {
    if (_bd) return _bd;
    var objs = _allElseObjects();
    var items = [];
    _bdSeen = (typeof Set !== 'undefined') ? new Set() : null;
    function addMat(m) {
      if (!m) return;
      if (_bdSeen) { if (_bdSeen.has(m)) return; _bdSeen.add(m); }   // shared materials (e.g. cached staffage) fade once, not N times
      items.push({ mat: m, opacity: (m.opacity != null ? m.opacity : 1), transparent: !!m.transparent });
    }
    objs.forEach(function (o) {
      var mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach(addMat);
    });
    _bd = { items: items, objCount: objs.length, renderer: null };
    if (A.renderer && typeof A.renderer.getClearColor === 'function' && typeof THREE !== 'undefined') {
      var c = new THREE.Color(); A.renderer.getClearColor(c);
      _bd.renderer = { color: c.clone(), alpha: (typeof A.renderer.getClearAlpha === 'function') ? A.renderer.getClearAlpha() : 1 };
    }
    console.log('§LOADPATH_BACKDROP_POPULATION allElseCount=' + _bd.objCount + ' materials=' + _bd.items.length);
    return _bd;
  }
  // Fix (2026-09-17, red1: "background complete fade off" — root-caused via a real diagnostic, not
  // guessed: a real bake showed `pointsInScene=0` at the exact moment `_backdropCapture()` ran, even
  // though `§PHOTO_PROPS built windowLights=4824` had already fired earlier — the skyline-lights/
  // glow-points objects genuinely did not exist/weren't visible yet at this hold's OWN first capture,
  // which `loadPathBuild` deliberately takes early, well before any fade — see `_bd`'s own comment for
  // why re-capturing OPACITY mid-fade is unsafe (ROUND 16). But that comment ALSO says the POPULATION
  // scan alone is safe to redo at any point — this is exactly that, done as narrowly as possible: a
  // TOP-UP, called only while `t` is still EXACTLY 0 (nothing has started fading for ANY object yet,
  // by definition, since `_backdropFadeT` returns 0 strictly before the ramp begins) — finds any
  // object `_allElseObjects()` now returns that ISN'T already in `_bd.items` (photo-staging settling
  // late, or any future case of a background object appearing after this hold's own build), and adds
  // it with its CURRENT (genuinely still-unfaded, because t=0 guarantees nothing touched it yet)
  // opacity as its baseline. NEVER touches an already-captured entry — additive only.
  function _backdropTopUp() {
    if (!_bd || !_bdSeen) return;
    var objs = _allElseObjects();
    var added = 0;
    objs.forEach(function (o) {
      var mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach(function (m) {
        if (!m || _bdSeen.has(m)) return;
        _bdSeen.add(m);
        _bd.items.push({ mat: m, opacity: (m.opacity != null ? m.opacity : 1), transparent: !!m.transparent });
        added++;
      });
    });
    if (added > 0) {
      _bd.objCount = objs.length;
      console.log('§LOADPATH_BACKDROP_POPULATION_TOPUP added=' + added + ' allElseCount=' + _bd.objCount + ' materials=' + _bd.items.length);
    }
  }
  // `t`: 0 = normal, 1 = fully black. Fades OPACITY toward 0 (revealing the renderer's own clear
  // colour, which is lerped toward black in lockstep) rather than guessing at each shader's own
  // colour math (A._sky is a physically-based Sky shader with no simple "diffuse colour" to lerp).
  // Control `window.__lpBackdropNoRestore=1` — stops RE-PINNING the frozen black state once reached
  // (real hold frames never need re-pinning since nothing else touches these materials during a
  // FOCUS-suppressed hold; this control exists purely so a dry run can prove the witness catches a
  // broken pin: perturb the materials mid-hold, and without re-pinning the perturbation survives to
  // the release-frame snapshot, so `restored=false`).
  function _backdropApply(t) {
    // ROUND 16 item 3 (§129.9 item 3, 2026-09-16, user: "Would fade to black helps?" — yes) — the
    // §129.7 item 6 backdrop fade now applies in BOTH look modes: sky/ground/context silhouette fade
    // to black before the freeze and back after release exactly as ghost mode always did; the
    // building itself is untouched here (shine-through's own clones render on top, depthTest=false,
    // renderOrder above everything — they stay lit and visible regardless of the backdrop's own
    // opacity). Previously gated to `_lookGhost()` only ("no need to fade off background" — SUPERSEDED
    // by this round's own ruling); `t` is still computed and passed every frame (pure, cheap)
    // regardless of mode, so the caller needs no branch of its own.
    var bd = _backdropCapture();
    // Fix (2026-09-17) — was gated to `t === 0` only ("nothing has started fading for anything yet").
    // That misses anything that turns visible LATER, mid-hold (`indoorHallTint` — a floor-decal
    // annotation driven by its own `_tnFilm`-based beat, settling opaque well after t first reached
    // 1). `_backdropTopUp`'s own logic already only ADDS objects never seen before, captured at
    // THEIR OWN current (real, untouched) opacity — safe at any t, not just t===0, which is why this
    // is a widened gate, not a new mechanism. Running it every frame is the only way to catch
    // something that appears at an arbitrary point during the hold, not just right at its start.
    _backdropTopUp();
    // Finding-2 re-fix (2026-09-16) — the guard used to read `t >= 1 && noRestore && appliedOnce`,
    // which only suppresses re-pinning while STILL fully black. By the release/witness-check frame,
    // `t` has usually already dropped below 1 (fade-out under way), so THIS frame's own normal apply
    // silently re-pins the correct value from the frozen original before the witness ever reads the
    // material — erasing an external perturbation's evidence one frame before it can be measured.
    // Once black has been reached once under this control, skip re-pinning for the REST of the
    // hold's lifecycle (not just while t>=1), so a mid-hold perturbation survives all the way to the
    // release-frame §LOADPATH_BACKDROP snapshot as the control's own doc comment always intended.
    if (window.__lpBackdropNoRestore && A._loadPathBackdropAppliedBlackOnce) return;
    var reachedBlack = (t >= 1);
    if (reachedBlack) A._loadPathBackdropAppliedBlackOnce = true;
    var op = 1 - t;
    bd.items.forEach(function (e) { e.mat.transparent = true; e.mat.opacity = op * e.opacity; });
    if (bd.renderer && A.renderer && typeof A.renderer.setClearColor === 'function' && typeof THREE !== 'undefined') {
      var black = new THREE.Color(0, 0, 0);
      A.renderer.setClearColor(bd.renderer.color.clone().lerp(black, t), bd.renderer.alpha);
    }
    // §129.14 — root-caused the black patch to `_backdropFadeT`'s ramp-out being keyed to `fSec`
    // recrossing `holdEndSec`, which the clock-freeze made take almost a full extra hold-duration of
    // real post-release time (see that function's own comment + the fix at its call site). Kept as a
    // standing regression witness, cheap, capped: `staleDespiteHighBaseline` should now settle to 0
    // within a handful of post-release frames, not ride at 46/52 for 20+ frames the way it did pre-fix.
    if (A._loadPathRestoreCount > 0 && !A._loadPathHoldFrameActive) {
      if (!A._lp129BackdropApplyLogCount) A._lp129BackdropApplyLogCount = 0;
      if (A._lp129BackdropApplyLogCount < 20) {
        A._lp129BackdropApplyLogCount++;
        var _stale = 0, _atZero = 0;
        bd.items.forEach(function (e) { if (e.opacity >= 0.5 && e.mat.opacity <= 0.01) _stale++; if (e.mat.opacity <= 0.01) _atZero++; });
        console.log('§LOADPATH_BACKDROP_APPLY_DIAG t=' + t.toFixed(4) + ' op=' + op.toFixed(4) +
          ' items=' + bd.items.length + ' atZeroOpacityNow=' + _atZero +
          ' staleDespiteHighBaseline=' + _stale + ' restoreCount=' + A._loadPathRestoreCount);
      }
    }
    // Coordinator addition (2026-09-16) — sample the LIVE material state at the black point, ONCE,
    // the first real frame it actually happens: not "the formula says t=1", the MATERIALS themselves,
    // read back right after the assignment above. EPS is opacity noise tolerance only (float rounding
    // through `op*e.opacity`), never a visibility threshold.
    if (reachedBlack && !_blackSample) {
      var EPS = 0.01, faded = 0;
      bd.items.forEach(function (e) { if (e.mat.opacity <= EPS) faded++; });
      _blackSample = { faded: faded, total: bd.items.length };
    }
  }
  function _backdropSnapshot() {
    var bd = _backdropCapture();
    return bd.items.map(function (e) { return +e.mat.opacity.toFixed(4); });
  }
  // ROUND 4 item 3 (2026-09-16) — the EXPECTED snapshot for a given fade fraction `t`, computed
  // fresh from the captured ORIGINALS (never a live read), for the "same-frame" restored check
  // below: what the live material SHOULD show at this exact `t`, independent of when it is asked.
  function _backdropExpected(t) {
    var bd = _backdropCapture();
    return bd.items.map(function (e) { return +((1 - t) * e.opacity).toFixed(4); });
  }
  function _backdropRestore() {
    if (!_bd) return;
    _bd.items.forEach(function (e) { e.mat.opacity = e.opacity; e.mat.transparent = e.transparent; });
    if (_bd.renderer && A.renderer && typeof A.renderer.setClearColor === 'function') A.renderer.setClearColor(_bd.renderer.color, _bd.renderer.alpha);
  }
  // WITNESS `§LOADPATH_BACKDROP allElseCount=N allElseAtBlack=n/N fadeInFrames=k black=… fadeOutFrames=m
  // restored=… => PASS|FAIL|INCONCLUSIVE`, fired once, at release. `black`: the pure formula reads 1
  // at holdStartSec (arm) AND at midSec (hold's own middle frame, already computed once by
  // `A.loadPathBuild` as `_lp.midSec`) — a real regression guard, not a tautology: it would catch a
  // future off-by-one on the frozen-branch boundary. ROUND 4 item 3 (2026-09-16, real Terminal bake:
  // `restored=false` on a run with nothing actually broken) — the ORIGINAL `restored` compared the
  // arm snapshot against the release snapshot: two DIFFERENT tFilm moments (the release frame's OWN
  // fSec can land past `holdEndSec` by a partial frame, so its own correct `t` is already < 1 —
  // legitimately, not a bug) — "a moving target", never reliably equal even when nothing is wrong.
  // Fixed: `restored` now recomputes the EXPECTED opacity for the RELEASE FRAME'S OWN fSec (fresh
  // from the pure formula, via `_backdropExpected`) and compares it against the LIVE material's
  // CURRENT (same-instant) state — "is the backdrop what the film's own clock says it should be right
  // now", immune to which exact moment happens to be "release". Both `expected`/`live` are now arrays
  // over the FULL generalized population (`bd.items`, ground included), so `restored` proves the
  // broadened population is put back, not just ground/sky as before.
  // `allElseCount`/`allElseAtBlack` (coordinator addition, 2026-09-16) — PRIMAL LAW clause 4 (never a
  // vacuous pass): an empty population makes every check below vacuously true, so it reads
  // INCONCLUSIVE, never a silent PASS. `allElseAtBlack` reports the LIVE material sample taken in
  // `_backdropApply` at the real black point (`_blackSample`), never re-derived from the formula.
  function _backdropWitness(lp, releaseFSec) {
    // ROUND 16 item 3 — the backdrop fade (and this witness) now runs in BOTH look modes; the old
    // shine-through INCONCLUSIVE early-return is REMOVED (§129.8 item 1's "no need to fade off
    // background" is superseded by this round's own ruling — see _backdropApply's own comment).
    var fps = lp.fps || 24;
    var k = Math.max(1, Math.round(BACKDROP_FADE_SEC * fps));
    var m = k;   // same fadeSec both directions by design; kept separate for a future asymmetric ruling
    // §129.17 — `blackAtArm` is no longer a meaningful check under the new elapsed-driven arm-side
    // fade: AT the exact arm instant elapsed=0, so `t` is DEFINED to read 0 there now (the fade's own
    // starting point, by design — checking "black at arm" the old way would be a tautological FAIL
    // against the very fix just made). The real regression guard is the hold's own MIDDLE: well past
    // one fadeSec into any hold long enough to have a middle at all, `t` must have reached 1.
    var midElapsed = lp.midSec - lp.holdStartSec;
    var black = _backdropFadeT(midElapsed, true, null, BACKDROP_FADE_SEC, null) === 1;
    // §129.24 — backdrop no longer ramps at release at all (see `_backdropApply(inWindow?1:0)`'s own
    // call site comment): the moment release happens, `inWindow` is ALREADY false, so the live `t` is
    // ALREADY `0` — instant, matching the building's own instant clip. `tRelease` is fixed at 0
    // rather than re-derived from `_backdropFadeT`'s own ramp formula (which no longer drives the
    // live value at all) — using the old formula here would assert a ramp that the real code hasn't
    // run since this fix, a stale expectation, not a real regression guard.
    var tRelease = 0;
    var expected = _backdropExpected(tRelease), live = _backdropSnapshot();
    var restored = JSON.stringify(expected) === JSON.stringify(live);
    var bd = _backdropCapture();
    var vacuous = bd.objCount === 0;
    var atBlackStr = _blackSample ? (_blackSample.faded + '/' + _blackSample.total) : 'unsampled';
    var allElseFadedOk = !vacuous && !!_blackSample && (_blackSample.faded === _blackSample.total);
    var verdict = vacuous ? 'INCONCLUSIVE' : ((black && restored && allElseFadedOk) ? 'PASS' : 'FAIL');
    console.log('§LOADPATH_BACKDROP allElseCount=' + bd.objCount + ' allElseAtBlack=' + atBlackStr + ' faded' +
      ' fadeInFrames=' + k + ' black=' + black + ' fadeOutFrames=' + m +
      ' restored=' + restored + ' => ' + verdict);
    // Coordinator addition (2026-09-16) — ONE tied-together confirmation spanning BOTH halves of "no
    // other layers HUDs, background, sun lit sky, ground": HUD suppression (§LOADPATH_FOCUS, sampled
    // mid-hold by cinema_maxq.js, stashed on A._loadPathFocusLastResult) and backdrop/context fade
    // (this witness), read together so neither half has to be trusted/cross-referenced alone.
    var focus = A._loadPathFocusLastResult;
    var focusStr = focus ? ((focus.ok ? 'PASS' : 'FAIL') + '(painted=' + focus.painted + ' unwrappedDraws=' + focus.unwrappedDraws + ')') : 'n/a';
    var backdropStr = verdict + '(allElseCount=' + bd.objCount + ' allElseAtBlack=' + atBlackStr + ' restored=' + restored + ')';
    var bothOk = !!focus && focus.ok && verdict === 'PASS';
    console.log('§LOADPATH_CONTEXT_OFF hud=' + focusStr + ' backdrop=' + backdropStr + ' => ' + (bothOk ? 'PASS' : (vacuous || !focus ? 'INCONCLUSIVE' : 'FAIL')));
    return { ok: verdict === 'PASS', verdict: verdict };
  }
  A._loadPathBackdropFadeT = _backdropFadeT; A.loadPathBackdropApply = _backdropApply;
  A.loadPathBackdropRestore = _backdropRestore; A._loadPathBackdropSnapshot = _backdropSnapshot;
  A._loadPathBackdropWitness = _backdropWitness; A._loadPathBackdropExpected = _backdropExpected;
  // §129.18 built `A._loadPathFadeT` as ONE shared ramp formula for backdrop, cut/whiten, and HUD —
  // superseded by §129.24/§129.27: backdrop and cut/whiten are both instant now (nothing left to
  // ramp), and HUD went back to its own dedicated formula (`_hudFadeT`, cinema_maxq.js) since
  // front-loading its release side needs the hold's own known `durSec`, not a detected `releaseFSec`.
  // The ONLY remaining caller of `_backdropFadeT` is `_backdropWitness`'s own arm-side "black by
  // midSec" check, a few lines below — kept as export in case a future diagnostic wants the pure
  // formula again, not because anything live still shares it.
  A._loadPathFadeT = _backdropFadeT;
  // Still genuinely shared — HUD's own fadeSec (cinema_maxq.js) reads this SAME cap so a hold too
  // short to fit a full fadeSec both ways degrades identically everywhere, one place, not per-caller.
  A._loadPathFadeSecFor = function (durSec) { return Math.min(BACKDROP_FADE_SEC, (durSec || 0) / 2); };
  // §129 DIAGNOSTIC (2026-09-17) — called by cinema_maxq.js's _captureFrame, IMMEDIATELY before the
  // render call that produces the actual encoded pixel, on hold frames only. Samples LIVE state off
  // the SAME arrays the apply-side witnesses already trust (_whitenTouched, _bd), from THIS SAME
  // closure — the only question left after every apply-side witness passed: is the mutated object
  // still the one about to be drawn, still mutated, right now, not undone by anything in between.
  function _diagSampleOne(w) {
    if (!w) return null;
    var m = w.mesh.material;
    return { kind: w.mesh.isInstancedMesh ? 'instanced' : (w.mesh.isBatchedMesh ? 'batched' : 'regular'),
      hasClone: m !== w.mat, color: m && m.color ? m.color.toArray() : null,
      clip: !!(m && m.clippingPlanes && m.clippingPlanes.length),
      visible: !!w.mesh.visible, inScene: !!(A.scene && w.mesh.parent),
      renderOrder: w.mesh.renderOrder, type: m ? m.type : null };
  }
  // §129 DIAGNOSTIC (2026-09-17) — DEFINITIVE pixel-to-object identification: raycast from the FROZEN
  // arm camera through the exact same NDC points the pixel-readback diagnostic samples, so "what is
  // actually at this screen point" is answered by real geometry, never guessed from a screenshot.
  A._loadPathDiagRaycast = function (ndcPairs, tag) {
    if (typeof THREE === 'undefined' || !A.camera || !A.scene) return;
    var ray = new THREE.Raycaster();
    var out = [];
    ndcPairs.forEach(function (p) {
      ray.setFromCamera(new THREE.Vector2(p[0], p[1]), A.camera);
      var hits = ray.intersectObjects(A.scene.children, true);
      // FIX (2026-09-17) — three.js's own Raycaster does NOT check `.visible` at all by default
      // (`Object3D.raycast` has no visibility gate; that's only applied by `traverseVisible`, never
      // by the raycaster) — it happily reports hits on objects this beat has explicitly hidden
      // (`obj.visible=false` in the unbatch fix). Every earlier reading of this diagnostic implicitly
      // assumed "raycast hit" meant "what the viewer sees" — true only while nothing was hidden yet.
      // Now checks the FULL ancestor chain's visibility, the same thing the renderer actually honours.
      function _visibleChain(o) { while (o) { if (o.visible === false) return false; o = o.parent; } return true; }
      // Raycasting has no concept of the stencil test — it would hit the cap plane's full geometric
      // extent regardless of where its FRAGMENT SHADER gets stencil-rejected (drawing nothing there).
      // Skip this beat's own overlay objects (stack clones AND the cap/stencil-companion meshes,
      // all flagged `_loadPathClone`) to find what a VIEWER actually sees exposed at this point.
      var h = null;
      for (var _hi = 0; _hi < hits.length; _hi++) {
        if (!(hits[_hi].object.userData && hits[_hi].object.userData._loadPathClone) && _visibleChain(hits[_hi].object)) { h = hits[_hi]; break; }
      }
      if (!h) {
        out.push(p.join(',') + '=miss(all ' + hits.length + ' hits were _loadPathClone or invisible: ' +
          hits.slice(0, 5).map(function (hh) { return (hh.object.name || hh.object.type) + (hh.object.visible === false ? '[hidden]' : ''); }).join(',') + ')');
        return;
      }
      var o = h.object;
      var isWhitened = _whitenTouched.some(function (t) { return t.mesh === o; });
      var g = null;
      try { g = A._loadPathIsBuildingElementObj ? A._loadPathIsBuildingElementObj(o) : null; } catch (e) {}
      // The intersection's OWN reported slot (`h.instanceId` for InstancedMesh, `h.batchId` for
      // BatchedMesh — whichever three.js's Raycaster actually populates for this hit) is the REAL
      // slot the renderer draws at this screen point. Read its LIVE colour right now via the SAME
      // getColorAt API this whole fix is built on, and separately check whether that exact slot
      // number is even a KEY in the reverse-index this fix enumerated — if it is not, the fix wrote
      // to the wrong universe of slots entirely.
      var realSlot = (h.instanceId != null) ? h.instanceId : (h.batchId != null ? h.batchId : null);
      var slotColorHex = 'n/a', wasInMap = 'n/a';
      if (realSlot != null && o.getColorAt) {
        try {
          if (!_whitenTmpColor && typeof THREE !== 'undefined') _whitenTmpColor = new THREE.Color();
          o.getColorAt(realSlot, _whitenTmpColor);
          slotColorHex = _whitenTmpColor.getHexString();
        } catch (eGc) { slotColorHex = 'err:' + eGc.message; }
        var _sm = _revInstanceIndex[o.id] || _revBatchIndex[o.id];
        wasInMap = !!(_sm && Object.prototype.hasOwnProperty.call(_sm, realSlot));
      }
      out.push(p.join(',') + '=' + (o.name || o.type) + '|instanced=' + !!o.isInstancedMesh +
        '|batched=' + !!o.isBatchedMesh + '|isStackClone=' + !!(o.userData && o.userData._loadPathClone) +
        '|isBuildingElem=' + g + '|inWhitenTouched=' + isWhitened + '|matType=' + (o.material && o.material.type) +
        '|matColor=' + (o.material && o.material.color ? o.material.color.getHexString() : 'n/a') +
        '|realSlot=' + realSlot + '|slotColorNow=' + slotColorHex + '|slotWasNeutralized=' + wasInMap +
        '|vertexColors=' + (o.material && o.material.vertexColors) +
        '|geomHasColorAttr=' + !!(o.geometry && o.geometry.attributes && o.geometry.attributes.color) +
        '|hasColorsTexture=' + !!(o._colorsTexture) + '|colorsTextureNeedsUpdate=' + (o._colorsTexture ? o._colorsTexture.needsUpdate : 'n/a') +
        '|matUUID=' + (o.material && o.material.uuid) + '|origMatUUID=' + (function(){var tt=_whitenTouched.filter(function(x){return x.mesh===o;})[0]; return tt?tt.mat.uuid:'n/a';})() +
        '|setColorAtSrc=' + (o.setColorAt ? o.setColorAt.toString().slice(0, 300) : 'n/a') +
        '|isBatchedMeshCtor=' + (o.constructor && o.constructor.name) +
        '|instanceMeta=' + (function () { var im = A._instanceMeta && A._instanceMeta[o.id]; var rec = im && realSlot != null ? im[realSlot] : null; return rec ? JSON.stringify(rec) : (im ? 'no-rec-for-slot' : 'no-instanceMeta-for-mesh'); })() +
        '|inBackdropPop=' + (function () { if (!_bd) return 'backdrop-never-captured'; return _bd.items.some(function (it) { return it.mat === o.material; }); })() +
        // §129.12 — the black-patch raycast (postRelFrame extension) hit a dark MeshBasicMaterial
        // that could either be a genuinely dark asset (correct) or one stuck opacity~0/transparent
        // against the black clear colour (the sky/indoorHallTint bug class) — matColor alone can't
        // tell those apart, opacity/transparent/the backdrop's OWN captured baseline for this exact
        // material can.
        '|liveOpacity=' + (o.material ? o.material.opacity : 'n/a') + '|liveTransparent=' + (o.material ? o.material.transparent : 'n/a') +
        '|bdCaptured=' + (function () { if (!_bd) return 'n/a'; var it = _bd.items.filter(function (x) { return x.mat === o.material; })[0]; return it ? ('origOpacity=' + it.opacity + ' origTransparent=' + it.transparent) : 'not-in-pop'; })() +
        // §129.14 — decisive check for the black-patch theory: is this literally one of the 40
        // photo-staging skyline silhouette boxes (`_buildPhotoProps`, effects.js)? `objUUID` (the
        // MESH's own uuid, never reused/cloned anywhere in this codebase) proves same-object-across-
        // frames vs two-different-adjacent-boxes, which `matUUID` alone can't (nothing clones
        // backdrop-population materials, so a differing matUUID across samples can only mean a
        // different object was hit, not a swapped material on the same one).
        '|objUUID=' + o.uuid + '|inPhotoSkyline=' + (A._getPhotoSkyline && A._getPhotoSkyline() ? (o.parent === A._getPhotoSkyline()) : 'no-skyline-group') +
        '|objVisible=' + o.visible + '|parentVisible=' + (o.parent ? o.parent.visible : 'no-parent'));
    });
    console.log('§LOADPATH_DIAG_RAYCAST' + (tag ? ' ' + tag : '') + ' ' + out.join(' '));
  };
  A._loadPathDiagSample = function (tag) {
    var regular = null, instanced = null, batched = null, nReg = 0, nInst = 0, nBatch = 0;
    for (var i = 0; i < _whitenTouched.length; i++) {
      var t = _whitenTouched[i];
      if (t.mesh.isInstancedMesh) { nInst++; if (!instanced) instanced = t; }
      else if (t.mesh.isBatchedMesh) { nBatch++; if (!batched) batched = t; }
      else { nReg++; if (!regular) regular = t; }
    }
    var b = _bd && _bd.items[0];
    var bLive = b ? { opacity: b.mat.opacity, transparent: b.mat.transparent } : null;
    console.log('§LOADPATH_DIAG tag=' + tag + ' armed=' + (_lp && _lp.armed) +
      ' whitenTouchedN=' + _whitenTouched.length + ' byType=regular:' + nReg + '/instanced:' + nInst + '/batched:' + nBatch +
      ' regular=' + JSON.stringify(_diagSampleOne(regular)) +
      ' instanced=' + JSON.stringify(_diagSampleOne(instanced)) +
      ' batched=' + JSON.stringify(_diagSampleOne(batched)) +
      ' backdropItemsN=' + (_bd ? _bd.items.length : 'n/a') + ' bdSample0=' + JSON.stringify(bLive) +
      ' capMeshesN=' + _capMeshes.length + ' localClippingEnabled=' + (A.renderer && A.renderer.localClippingEnabled) +
      ' sectionCutLiveDepth=' + (_lp && _lp.sectionCut ? _lp.sectionCut.liveDepth : 'n/a'));
  };

  A.loadPathApplyVisual = function (plan, tNorm, holdCtl, frameHoldCtl) {
    try {
      if (plan === null) { _forceRestore(); return; }
      if (!_lp || !_lp.ok) return;
      var fSec = tNorm * _lp.filmSecFull;
      // §129.6 item 1 (2026-09-15, after a real HHS bake showed a camera "resume jump"): window
      // membership and elapsed-hold-time come from cinema_maxq.js's own explicit `holdCtl`
      // ({inHold, elapsedSec}) — its own loop-index bookkeeping around the FROZEN/inserted hold
      // frames — NEVER re-derived from `fSec`, which the SAME fix freezes at the arm value for the
      // whole hold (so fSec is constant throughout and can no longer drive the reveal's own elapsed
      // time). `holdCtl` falsy (control tap `__lpNoClockFreeze`, or an old/other caller) used to fall
      // all the way back to the ORIGINAL fSec-based self-determination, reproducing the pre-fix
      // behaviour exactly, on purpose, for that control — see ROUND 19 below for why that fallback
      // alone was still wrong for THIS function's own internal pacing.
      // ROUND 19 (2026-09-16) — `frameHoldCtl` (new, optional 4th param) is cinema_maxq.js's own
      // frame-index-only signal, derived purely from the loop index against the frame-splice
      // boundaries (`_lpHoldFrameStart`/`_lpFramesInserted`), which __lpNoClockFreeze never touches
      // (Finding 4 left the splice/insertion itself unconditional). A continuously-advancing
      // (unfrozen) fSec blows past holdEndSec in only a handful of real rendered frames under that
      // control — long before all the spliced-in hold frames have rendered — starving this beat's
      // OWN internal reveal (STACK stalling partway, VISIBLE/FRAMING/... never reached) of the hold
      // frames it needs. When `holdCtl` is falsy but `frameHoldCtl` is supplied, window membership/
      // elapsed for THIS function's own arm/reveal/release cycle paces off the frame splice instead
      // of fSec; the arm/release tNorm stashed for §LOADPATH_RESUME is untouched — only the
      // reveal-pacing source changes. A caller supplying neither (old/other caller, node dry run)
      // keeps the original fSec fallback.
      var inWindow, elapsed;
      if (holdCtl) { inWindow = !!holdCtl.inHold; elapsed = holdCtl.elapsedSec; }
      else if (frameHoldCtl) { inWindow = !!frameHoldCtl.inHold; elapsed = frameHoldCtl.elapsedSec; }
      else { inWindow = fSec >= _lp.holdStartSec && fSec < _lp.holdEndSec; elapsed = fSec - _lp.holdStartSec; }
      // §129.24/§129.27 (2026-09-18, red1: "the background sky ground, building that needs to cut
      // out... separate from HUD overlays that fades off/on") — backdrop AND cut/whiten (below) are
      // both an instant step at the EXACT SAME moment (`inWindow`, arm/release) — the building's own
      // near-side facade pop is structurally instant (§129.22: per-container shared materials, no
      // cheap per-element fade), so backdrop stopped fighting it instead of running its own smooth
      // ramp next to an instant pop. HUD is the only thing that still eases (cinema_maxq.js's own
      // `_hudFadeT`, front-loaded so it finishes before release, never straddling this cut).
      // §129.33 (2026-09-19, red1: "let go of the ground... it's going out of its bound loop") — a
      // REAL, confirmed-via-full-movie-bake bug: this call used to run unconditionally EVERY FRAME OF
      // THE WHOLE FILM, the instant load-path finished building (which needs no playback progress at
      // all, just the pre-computed plan — effectively from frame 0). Outside its own hold it always
      // passed `t=0`, which still forces `mat.transparent=true` and re-pins `mat.opacity` on the
      // entire ground/sky/backdrop population every single frame, for the ENTIRE rest of the film —
      // permanently blocking whatever ELSE legitimately wants to animate those same materials (ground
      // opacity ramping in during construction, the day-to-dusk sun arc's own lighting response, etc).
      // A real Hospital full-movie bake showed the collateral damage directly: ground fine during the
      // actual hold (this call was always correctly scoped THERE), but forced into a stuck, wrong look
      // everywhere else in the film once something else tried to touch it. Whiten/cut (below) already
      // only acts between arm and release and cleanly disposes after — this call now matches that same
      // discipline: skip entirely outside `inWindow`/`_lp.armed`, so `_backdropCapture()`'s own lazy
      // first call happens AT ARM (a deliberate, stable moment — matching how whiten captures ITS OWN
      // "before" state) instead of racing whatever else the scene is doing at essentially frame 0, and
      // load-path releases the ground for good the instant `_restore()` clears `_lp.armed`.
      if (inWindow || _lp.armed) _backdropApply(inWindow ? 1 : 0);
      if (inWindow && !_lp.armed) {
        _lp.armed = true;
        // §129.16/§129.27 — the ladder/card vanish EXACTLY at true release, same frame `_lp.armed`
        // itself goes false again now (§129.27 collapsed the old "stays armed past release to sweep
        // the cut/whiten back" delay to a single instant) — kept as its own flag anyway (not just
        // `_lp.armed`) since `A.loadPathCompositeOntoCanvas` gates on it and a dedicated flag is
        // cheap insurance if release ever needs to span more than one frame again.
        _lp.showLadder = true;
        // FIX (2026-09-17, found by tracing `A.startStillRefine()` — called EVERY frame of every
        // bake, `viewer/cinema_maxq.js` — which sets `A._taaPass.accumulate = true` unconditionally.
        // During normal navigation the camera keeps moving every frame, so accumulation has nothing
        // stable to build on; during THIS hold the camera is deliberately frozen for many seconds —
        // exactly the condition TAA accumulation is designed to exploit for quality. TAA has no
        // concept of "the material just changed" — it only resets on camera/geometry motion. Every
        // apply-side witness in this file proved the JS object state (material.color, per-slot
        // colour, clippingPlanes) was correct; a raycast+getColorAt cross-check at mid-hold confirmed
        // the exact slot the renderer draws was genuinely white. Only the ENCODED PIXEL disagreed —
        // because TAA kept blending in dozens of pre-change (real colour) samples, each new white
        // sample contributing a shrinking fraction, never converging within the hold. Resetting the
        // accumulation index the instant the hold arms (and every frame the fade is still moving,
        // below) makes the accumulator start fresh from the NEW state instead of diluting it forever.
        if (A._taaPass) A._taaPass.accumulateIndex = -1;
        // §129.6 item 1 — the tFilm value AT ARM, exposed for cinema_maxq.js's own §LOADPATH_RESUME
        // witness (a single source of truth: whatever tNorm actually was on THIS call, whether the
        // clock-freeze fix or the __lpNoClockFreeze control is in effect).
        A._loadPathArmTFilm = tNorm;
        _lp.cursorAtEntry = (typeof window.tmGetState === 'function') ? window.tmGetState().cursor : null;
        // §129.8 item 4b — snapshot the HUD registry RIGHT NOW, before anything below can move on:
        // this is the ARM frame, the last frame cinema_maxq.js's own _captureFrame ran every OTHER
        // HUD drawer on before calling into load path (drawn LAST, see its own §HUD FIX comment) —
        // so A._hudLayoutRects already holds "what was on screen just before the freeze" (item 4b's
        // own wording for the underHud test), never the (about to be suppressed) hold-frame registry.
        _lp.armHudRects = (A._hudLayoutRects || []).slice();
        // Finding 1 broadened fix (2026-09-16) — trigger cinema_maxq.js's own §HUD_LAYOUT_ARM sample
        // (same convention as A._loadPathMidHoldThisFrame below): THIS frame's own _captureFrame call
        // (still to come, later in the SAME bake-loop iteration) resets+repopulates A._hudLayoutRects
        // fresh, and at elapsedSec===0 the FOCUS fade (A._loadPathHudAlpha) hasn't started yet, so the
        // resource panel actually draws and registers real rects this frame — a real sample, not the
        // vacuous one the mid-hold witness gets once FOCUS fades everything out.
        A._loadPathArmFrameThisFrame = true;
        // ══ §129.8 items 2/3 — FINAL PICK AT ARM, ON THE LIVE CAMERA, TWO STACKS, OCCLUSION-SCORED.
        // Supersedes ROUND 9's single-chain live re-pick (same principle: WHEN stays the probe-based
        // hold-point search's own answer, `shot.tNorm`, already baked into `holdStartSec` at BUILD;
        // only WHICH CHAIN(S) light up is decided here) — now over the FULL candidate pool
        // (`_lp.validCandidates`), scored by real raycast occlusion x screen area (`_pickTwoStacks`),
        // never the probe-pose frustum-only ranking BUILD used only to size `durSec`. Runs BEFORE
        // `_buildChainClones`, so the clones/labels built for this hold are always the FINAL pick.
        (function () {
          var picked = (A.camera && _lp.validCandidates && _lp.validCandidates.length)
            ? _pickTwoStacks(_lp.items, _lp.validCandidates, A.camera, _lp.outW, _lp.outH, _lp.armHudRects, _lp.buildingBox)
            // ROUND 14 — this fallback never even reaches _pickTwoStacks (no camera/candidates at
            // all), so it carries the SAME diagnostic field shape (never `undefined` on the print
            // line below) with honest zeros/none rather than omitting them.
            : { near: null, far: null, farReason: 'no-camera-or-candidates', pickSource: 'none',
                raycastBlind: false, blindReason: null, tier: null, visKey: null, raysCast: 0, hitsTotal: 0, selfHits: 0, universe: 0,
                validTotal: (_lp.validCandidates ? _lp.validCandidates.length : 0), scored: 0 };
          function hopsUpFrom(chainIdx) {
            var d = _chainDrawnInfo(chainIdx);
            var up = d.drawnIdx.slice().reverse().map(function (i, k) {
              return { guid: _lp.items[i].guid, cls: _lp.items[i].cls, storey: _lp.items[i].storey, idx: i, k: k };
            });
            up.forEach(function (h, k) { h.hex = _hexForHop(k, up.length); });
            return { hopsUp: up, chainIdx: chainIdx, drawnInfo: d };
          }
          function fmtPick(s) { return s ? (_lp.items[s.idx].guid + '(' + s.score.toFixed(1) + ',' + s.dist.toFixed(1) + ')') : 'none'; }
          // ROUND 12 item 1 — the rule that actually decided the pick, printed on the SAME line:
          // visibleHops=K/N (majority) (K = hops with unoccluded>=0.5 and not under the arm HUD) and
          // memberVis=[...] (every hop's own unoccluded, chain/top-down order — the exact numbers
          // §LOADPATH_FRAMING later reports too, never a second, disagreeing count).
          // ROUND 13/15 — reads `picked.visKey`, the count `_pickTwoStacks`'s own tier logic ACTUALLY
          // ranked by (never re-derived from `raycastBlind` alone — ROUND 15's own tier 2 also ranks
          // by `visibleHopsFrustum` while NOT blind, which the old `raycastBlind`-only re-derivation
          // could not tell apart from tier 1).
          function fmtVisibleHops(s) {
            if (!s) return 'n/a';
            var key = picked.visKey || 'visibleHopsMajority';
            return s[key] + '/' + s.chain.length + ' (' + (key === 'visibleHopsFrustum' ? 'frustum' : 'majority') + ')';
          }
          // ROUND 18 — `h.unoccluded` reads `null` on the new raycast-universe-too-large fallback
          // (occlusion genuinely never tested there) — print `n/a`, never a fabricated number.
          function fmtMemberVis(s) { return s ? '[' + s.perHop.map(function (h) { return h.unoccluded == null ? 'n/a' : h.unoccluded.toFixed(2); }).join(',') + ']' : '[]'; }
          // ROUND 15 item 1 — the class+guid of hop 0's dominant occluder (chain order, i.e. the
          // TOP of the drawn chain per _pick's own top-down convention — never re-ordered to ground-
          // up here), or `none` when hop 0 has no genuine (closer-than-the-box-face) occluder.
          function fmtOccluder(s) {
            if (!s || !s.perHop || !s.perHop.length) return 'none';
            var occ = s.perHop[0].dominantOccluder;
            return occ ? ((occ.cls || 'unknown') + ':' + occ.guid) : 'none';
          }
          if (picked.near) {
            var nb = hopsUpFrom(picked.near.chain);
            _lp.pickItem = _lp.items[picked.near.idx];
            _lp.hopsUp = nb.hopsUp;
            _lp.nearScore = picked.near; _lp.memberVis = picked.near.perHop;
            _printChainWitness(_lp.items, _lp.pickItem, nb.chainIdx, nb.drawnInfo, 'live');
          }
          if (picked.far) {
            var fb = hopsUpFrom(picked.far.chain);
            var farPickItem = _lp.items[picked.far.idx];
            _lp.far = { name: 'far', pickItem: farPickItem, hopsUp: fb.hopsUp, chainBox: null,
              revealedHops: 0, stackOk: undefined, durSec: _lp.farDurSec, score: picked.far,
              memberVis: picked.far.perHop };
            _printChainWitness(_lp.items, farPickItem, fb.chainIdx, fb.drawnInfo, 'live');
          } else {
            _lp.far = null;
          }
          // ROUND 13 addendum — `pickSource` now comes straight from `_pickTwoStacks` itself
          // (`live` / `probe-fallback reason=raycast-blind(...)` / `none`), never re-derived here
          // from `picked.near` alone — that re-derivation is exactly what silently printed `none`
          // while a stack was actually drawn, on the real HHS BatchedMesh bake.
          // ROUND 14 (2026-09-16, real HHS R13 bake: NO §LOADPATH_VISIBILITY line at all, so the
          // raw totals behind the pick were never visible in the log) — `raysCast=`/`hitsTotal=`/
          // `selfHits=`/`universe=` now print on EVERY arm, unconditionally (not just when blind),
          // straight from `_pickTwoStacks`'s own return — the single source of truth, never a
          // second, re-derived count.
          console.log('§LOADPATH_PICK stacks=' + (picked.far ? 2 : 1) +
            ' near=' + fmtPick(picked.near) + (picked.far ? ' far=' + fmtPick(picked.far) : '') +
            (picked.farReason ? ' farReason=' + picked.farReason : '') +
            ' pickSource=' + picked.pickSource +
            // §129.42 — the printed rule must name the key it actually leads with, or the log
            // says one thing while the comparator does another.
            ' rankBy=' + (picked.visKey ? ('storeySpan,' + picked.visKey + ',depth,' + (window.__lpPickOccluded ? 'occludedScore' : 'score')) : 'n/a') +
            ' nearSpan=' + ((picked.near && picked.near.storeySpan) || 0) +
            ' bestSpanAvail=' + (picked.bestSpanAvail || 0) +
            // ROUND 17 — `scored=`/`validTotal=` make the ARM-TIME cap visible on the SAME line as the
            // pick it produced: `scored` is how many candidates actually went through the expensive
            // _scoreChain/raycast pass (capped at SCORE_TOP_N), `validTotal` is _pick's own full,
            // unfiltered `valid` count (never itself capped) — `scored < validTotal` is the fix firing.
            ' scored=' + picked.scored + '/' + picked.validTotal +
            ' raysCast=' + picked.raysCast + ' hitsTotal=' + picked.hitsTotal + ' selfHits=' + picked.selfHits + ' universe=' + picked.universe +
            ' visibleHops=' + fmtVisibleHops(picked.near) + ' memberVis=' + fmtMemberVis(picked.near) +
            ' hop0Occluder=' + fmtOccluder(picked.near) +
            (picked.far ? ' farVisibleHops=' + fmtVisibleHops(picked.far) + ' farMemberVis=' + fmtMemberVis(picked.far) +
              ' farHop0Occluder=' + fmtOccluder(picked.far) : ''));
        })();
        // §129.8 item 1 — SHINE-THROUGH LOOK witness, once per arm: mode, and the ghost/clip/fade
        // fields this beat's own witnesses (§LOADPATH_VISIBLE) must all read 0/false for in shine
        // mode (FAIL if any survives — checked from real state, not the mode flag alone).
        var nClones = _buildChainClones(_lp.hopsUp);
        var nClonesFar = _lp.far ? _buildChainClones(_lp.far.hopsUp) : 0;
        _fetchHopScheduleCost(_lp.hopsUp);
        if (_lp.far) _fetchHopScheduleCost(_lp.far.hopsUp);
        // §129.4 v8b WHEN — the camera cut is WITHDRAWN. Capture the film's OWN pose exactly once,
        // at arm, and hold it verbatim through the whole window (re-asserted every hold frame below,
        // never fitted/dollied/cut). `_lp.armPose` is the single source of truth HOLD's own
        // `cameraMoved` witness checks against at restore.
        // ROUND 6 (2026-09-16, real Terminal bake) — ORIENTATION is now the camera's own REAL
        // quaternion, captured directly, NEVER `A.controls.target`: cinema_maxq drives the bake
        // camera's position/orientation itself every frame and never keeps controls.target in sync,
        // so on Terminal's site coordinates that target was stale/wrong — re-asserting "position +
        // look at controls.target" during the hold silently re-aimed the REAL camera away from the
        // building every single hold frame, a visible defect `cameraMoved` (position-only) could
        // never see. `armSource` records whether a real quaternion was actually captured — printed
        // on §LOADPATH_HOLD; per the ruling, there is no fallback to controls.target at all, ever.
        var armQuat = (A.camera && A.camera.quaternion && A.camera.quaternion.clone) ? A.camera.quaternion.clone() : null;
        _lp.armSource = armQuat ? 'quaternion' : 'none';
        _lp.armPose = (A.camera && armQuat) ? {
          x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z, quaternion: armQuat
        } : null;
        _lp.lastHoldPose = _lp.armPose ? { x: _lp.armPose.x, y: _lp.armPose.y, z: _lp.armPose.z, quaternion: armQuat.clone() } : null;
        // §129.4 v6 note (still true in v8b) — ONE Box3 per stack, computed ONCE here (never a
        // second, separately-timed _chainWorldBBox() call) — used by the cut-plane placement (ghost
        // mode only) and by the ladder's own "which side" decision (both modes).
        _lp.chainBox = _chainWorldBBox(_lp.hopsUp);
        if (_lp.far) _lp.far.chainBox = _chainWorldBBox(_lp.far.hopsUp);
        var camPos3 = (_lp.armPose && typeof THREE !== 'undefined')
          ? new THREE.Vector3(_lp.armPose.x, _lp.armPose.y, _lp.armPose.z) : null;
        var plane = null, sectionCut = null;
        if (_lookGhost()) {
          // §129.7 items 6-7 / §129.1 CUT, kept behind window.__lpLookGhost=1. ONE clip plane,
          // facing the camera, placed just in front of the (near stack's) chain's nearest face —
          // applied ONLY to this beat's own ghost material clones, never A.sectionPlane.
          plane = (_lp.chainBox && camPos3) ? _placeCutPlane(_lp.chainBox, _lp.buildingBox, camPos3) : null;
          _lp.ghostResult = _applyGhost(plane);
        } else {
          // §129.8 item 1 — SHINE-THROUGH: the building is NEVER ghosted, NEVER clipped. ROUND 16
          // item 3 — the backdrop IS now faded in this mode too (_backdropApply above runs
          // unconditionally, no longer gated to ghost mode — see its own comment).
          _lp.ghostResult = { n: 0, hiddenN: 0 };
          // §129 OPEN ITEM (2026-09-17) — SECTION-CUT, shine mode only (this is the look the stack's
          // "reads as thin" diagnosis is about). Plane just behind the near stack's own chain; near
          // side (everything but the stack, which is never in this population — see _applyWhiten's
          // own `_loadPathClone` exclusion) is cut away. `window.__lpNoSectionCut=1` kills it for an
          // A/B, same convention as every other control tap in this file.
          sectionCut = (!window.__lpNoSectionCut && _lp.chainBox && camPos3) ? _placeSectionCutPlane(_lp.chainBox, camPos3) : null;
          if (sectionCut && A.renderer) A.renderer.localClippingEnabled = true;
          // Exposed so `_visibleWitness` can tell "this beat's own intentional section-cut
          // population" apart from an unexpected/leftover clip plane elsewhere in the scene —
          // the pre-129-OPEN-ITEM witness invariant ("shine mode clips nothing") is retired,
          // not deleted: it becomes "shine mode clips nothing IT DIDN'T MEAN TO".
          _lp.sectionCutPlane = sectionCut ? sectionCut.plane : null;
          _lp.sectionCut = sectionCut;   // full object (viewDir/camPos/planeDepth) — the per-frame fade needs all of it, not just the plane
        }
        // Locked spec 2026-09-17 item 4 — WHITEN, regardless of mode (never gated behind
        // _lookGhost()): runs AFTER the branch above so it clones whatever obj.material IS right
        // now (the ghost clone in ghost mode, the true original in shine mode). Restored in the
        // opposite order — _restoreWhiten() before _restoreGhost() — in _restore()/_forceRestore().
        // §129 OPEN ITEM — the section-cut plane (shine mode only) rides the SAME whiten pass: "the
        // cut surface and everything behind it get the concrete/white treatment" (red1's own words).
        _lp.whitenResult = _applyWhiten(sectionCut ? sectionCut.plane : null);
        // ROUND 16 item 3 — `backdropFaded` is now true in BOTH modes (_backdropApply's own gate on
        // `_lookGhost()` is removed); `ghosted`/`clipped` stay mode-specific (shine mode never
        // ghosts/clips the building itself, only the backdrop).
        console.log('§LOADPATH_LOOK mode=' + _lp.lookMode + ' ghosted=' + (_lookGhost() ? 'n/a' : 0) +
          ' clipped=' + (_lookGhost() ? (plane ? 1 : 0) : 0) + ' backdropFaded=true' +
          ' => ' + (_lookGhost() || (_lp.ghostResult.n === 0 && !plane) ? 'PASS' : 'FAIL'));
        // §129 OPEN ITEM WITNESS — (a) plane sits strictly behind the chain's own farthest corner
        // (marginM > 0, by construction of the eps in _placeSectionCutPlane, but asserted here from
        // the REAL numbers, not assumed); (b) every whitened clone actually carries the plane
        // (clippedCount === whitenResult.n — nothing "everything else" escapes the cut); (d) the
        // stack's own clones carry NO clipping plane at all (stackClipped must be 0 — the stack is
        // provably unaffected). (c), the solid-cap-not-a-hole requirement, is asserted separately by
        // §LOADPATH_CUT_CAP right below (structural: the companion/cap objects genuinely exist with
        // the right stencil wiring — never a pixel readback, per this project's own FUNDAMENTAL LAW).
        if (!_lookGhost()) {
          if (!sectionCut) {
            console.log('§LOADPATH_CUT INCONCLUSIVE reason=' + (window.__lpNoSectionCut ? 'control-off' : 'no-chainbox-or-campos'));
          } else {
            var _cutMarginM = sectionCut.planeDepth - sectionCut.farDepth;
            var _cutClippedN = _whitenTouched.filter(function (t) {
              return t.mesh.material && t.mesh.material.clippingPlanes && t.mesh.material.clippingPlanes.indexOf(sectionCut.plane) !== -1;
            }).length;
            var _cutStackTouched = 0;
            A.collectMeshes(function (o) { return !!(o.userData && o.userData._loadPathClone); }).forEach(function (o) {
              if (o.material && o.material.clippingPlanes && o.material.clippingPlanes.length) _cutStackTouched++;
            });
            var _cutOk = _cutMarginM > 0 && _cutClippedN === _lp.whitenResult.n && _cutStackTouched === 0;
            console.log('§LOADPATH_CUT marginM=' + _cutMarginM.toFixed(3) + ' clippedCount=' + _cutClippedN + '/' + _lp.whitenResult.n +
              ' stackClipped=' + _cutStackTouched + ' => ' + (_lp.whitenResult.n === 0 ? 'INCONCLUSIVE reason=nothing-whitened' : (_cutOk ? 'PASS' : 'FAIL')));
            // §129 OPEN ITEM — CAP. "Must produce a genuinely SOLID-looking cut face, not a hole"
            // (red1's own words). Built only when there is something real to cap (whitenResult.n>0).
            // FIX (2026-09-17, found by re-deriving from code after red1 reported the cap wasn't
            // showing up despite this witness reading PASS): checking `renderer.getContext()`'s own
            // attributes proves the CANVAS has a stencil buffer, but when `A._composer` exists
            // (confirmed live every bake — `§EFFECTS_INIT loaded`), the scene geometry never renders
            // to that canvas directly - TAARenderPass renders it into EffectComposer's OWN internal
            // WebGLRenderTarget first (`viewer/effects.js`'s own `_composer.render()` call site,
            // `c.toBlob()` only reads the canvas AFTER that composite). EffectComposer.js's default
            // render target is built with only `{type: HalfFloatType}` - stencilBuffer defaults false
            // on any WebGLRenderTarget, same as ever other one in this codebase. The witness was
            // checking a buffer the geometry pass never touches. Now checks the REAL target: the
            // composer's own renderTarget1 when a composer is active, the canvas context otherwise.
            var _hasStencil = A._composer && A._composer.renderTarget1
              ? !!A._composer.renderTarget1.stencilBuffer
              : !!((A.renderer && A.renderer.getContext) ? A.renderer.getContext().getContextAttributes().stencil : false);
            _lp.cutCapResult = (_lp.whitenResult.n > 0 && _hasStencil) ? _buildCutCap(sectionCut.plane, _lp.buildingBox) : { covered: 0, batchedSkipped: 0, capBuilt: false };
            var _capExpected = _lp.whitenResult.n; // every whitened, non-batched touch should get a stencil companion pair
            var _capOk = _hasStencil && _lp.cutCapResult.capBuilt && (_lp.cutCapResult.covered + _lp.cutCapResult.batchedSkipped) === _capExpected;
            console.log('§LOADPATH_CUT_CAP composerActive=' + !!A._composer + ' stencilBuffer=' + _hasStencil + ' covered=' + _lp.cutCapResult.covered + '/' + _capExpected +
              ' batchedSkipped=' + _lp.cutCapResult.batchedSkipped + ' capBuilt=' + _lp.cutCapResult.capBuilt +
              ' => ' + (_lp.whitenResult.n === 0 ? 'INCONCLUSIVE reason=nothing-whitened' : (!_hasStencil ? 'FAIL reason=no-stencil-buffer' : (_capOk ? 'PASS' : 'FAIL'))));
            // §129 FIX 3 — unbatch every BatchedMesh container this pass whitened into individual,
            // ordinary Mesh clones (see the function's own comment for why). Runs after the cap so
            // the cap's own coverage accounting above still reports the CONTAINER-level truth
            // (`batchedSkipped`) unchanged — this is an independent, additional pass, not a
            // replacement for it.
            _lp.batchUnpackResult = _buildBatchedElementClones();
            var _bu = _lp.batchUnpackResult;
            console.log('§LOADPATH_BATCH_UNPACK containers=' + _bu.containers + ' elements=' + _bu.elements +
              ' elementsFailed=' + _bu.elementsFailed +
              ' => ' + (_bu.containers === 0 ? 'INCONCLUSIVE reason=no-batched-containers' : (_bu.elements > 0 ? 'PASS' : 'FAIL')));
            // §129 DIAGNOSTIC BISECTION (2026-09-17) — the unbatch above hides the ENTIRE source
            // container (proven, `containersShown` restore count matches) yet the suspect pixels are
            // STILL byte-identical, meaning whatever is visible there was never that container. Next
            // bisection: hide EVERY top-level scene child except this beat's own overlay, to find out
            // whether the colour is coming from geometry at all or from something else entirely
            // (background/post-process). window.__lpDebugHideAll=1, temporary, removed once answered.
            if (window.__lpDebugHideAll && A.scene) {
              A._lpDebugHidden = [];
              A.scene.children.forEach(function (c) {
                if (c.visible && !(c.userData && c.userData._loadPathClone)) { A._lpDebugHidden.push(c); c.visible = false; }
              });
              console.log('§LOADPATH_DEBUG_HIDE_ALL hidden=' + A._lpDebugHidden.length);
            }
          }
        }
        console.log('§LOADPATH_ARM hop=' + _lp.hopsUp.length + '/' + _lp.hopsUp.length +
          (_lp.far ? ' farHop=' + _lp.far.hopsUp.length + '/' + _lp.far.hopsUp.length : '') +
          ' clones=' + nClones + '/' + _lp.hopsUp.length +
          (_lp.far ? ' farClones=' + nClonesFar + '/' + _lp.far.hopsUp.length : '') +
          ' ghosted=' + Math.max(0, _lp.ghostResult.n - _lp.ghostResult.hiddenN) +
          ' hidden=' + _lp.ghostResult.hiddenN + ' entryCursor=' + _lp.cursorAtEntry +
          ' armPose=' + (_lp.armPose ? '[' + _lp.armPose.x.toFixed(2) + ',' + _lp.armPose.y.toFixed(2) + ',' + _lp.armPose.z.toFixed(2) + ']' : '?') +
          ' clipPlane=' + (plane ? 'set' : 'none'));
        _clonesWitness(_lp.hopsUp, _lp.pickItem, 'near');   // ROUND 5 item 2 — right after the clones this frame just built
        if (_lp.far) _clonesWitness(_lp.far.hopsUp, _lp.far.pickItem, 'far');
      }
      if (inWindow) {
        // §129.4 v8b WHEN — re-assert the ARM pose every frame (overriding whatever beat owns this
        // tNorm range would otherwise have set a few lines earlier in the bake loop — same
        // insertion-order guarantee v3-v7 already relied on). No fit, no dolly: HOLD verbatim.
        // ROUND 6 — position + quaternion, set DIRECTLY on the camera; A.controls is NEVER touched
        // here (no .target.set, no .update()) — that OrbitControls-style re-derivation from a target
        // is exactly what could silently re-aim the real camera off a stale target every hold frame.
        if (_lp.armPose && A.camera && A.camera.quaternion) {
          A.camera.position.set(_lp.armPose.x, _lp.armPose.y, _lp.armPose.z);
          A.camera.quaternion.copy(_lp.armPose.quaternion);
          if (A.camera.updateMatrixWorld) A.camera.updateMatrixWorld();
          _lp.lastHoldPose = { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z,
            quaternion: A.camera.quaternion.clone() };
        }
        // §129.27 SUPERSEDES this section's own earlier history (§129 OPEN ITEM through §129.24) of
        // chasing a symmetric COLOUR ramp for cut/whiten at both ends — red1's final ruling is that
        // cut/whiten (like backdrop) is an instant step, not a fade, at both arm and release; only
        // HUD still eases. See `_lp.sectionCut` handling just below (arm) and the release branch
        // further down in this function for the current, instant behaviour.
        // FIX (2026-09-17) — `indoorHallTint` (and any sibling 3D-space measure/indoor annotation
        // mesh, e.g. `slabBeatOutline`) proved that relying on the BACKDROP'S OPACITY fade alone is
        // not fully reliable for these: `.visible` and `material.opacity` are separate properties,
        // and a mesh mid-fade (or whose own beat keeps nudging its opacity) can still leave a faint,
        // colour-shifting blend on screen even while "faded" by the numbers. HIDE THEM OUTRIGHT
        // instead — the same "hide, don't just fade" fix already proven for the batched/instanced
        // whiten population — belt-and-suspenders on top of the backdrop fade, not a replacement
        // for it (backdrop still owns their real opacity/restore bookkeeping).
        // Runs EVERY hold frame, not once at arm — the whole reason `indoorHallTint` slipped through
        // in the first place was a beat becoming visible/opaque MID-HOLD, after a one-time scan had
        // already run (the exact same class of bug already fixed once for the backdrop's own
        // population top-up). `if (o.visible)` naturally skips anything already hidden by this same
        // loop on an earlier frame — cheap, idempotent, no need for a separate one-shot gate.
        if (!_lp.indoorAnnotHidden) _lp.indoorAnnotHidden = [];
        ['indoorBeats', 'slabBeat'].forEach(function (gname) {
          var grp = A.scene && A.scene.children.filter(function (c) { return c.name === gname; })[0];
          if (grp) grp.traverse(function (o) {
            if (o.visible) { _lp.indoorAnnotHidden.push(o); o.visible = false; }
          });
        });
        // §129.11 follow-up (2026-09-17) — a patch of un-faded sky, top-right of frame, confirmed via
        // raycast (`§LOADPATH_DIAG_RAYCAST ... matType=ShaderMaterial ... isBatchedMeshCtor=Sky`) to
        // be `A._sky` itself: three.js's physically-based Sky shader computes its own colour from
        // atmosphere uniforms (turbidity/rayleigh/sun position) and, like most sky-dome shaders,
        // outputs a hardcoded opaque alpha in its own fragment shader — it never reads three.js's
        // generic `material.opacity` uniform at all, so `_backdropApply`'s opacity fade (correct for
        // every ordinary material) has provably no effect on it. Same fix as everything else in this
        // block: hide it outright rather than rely on a fade mechanism it was never wired to obey.
        if (A._sky && A._sky.visible) { _lp.indoorAnnotHidden.push(A._sky); A._sky.visible = false; }
        if (_lp.sectionCut) {
          // §129.27 (2026-09-18, red1: "the background sky ground, building that needs to cut
          // out" — not a fade like HUD/overlays) — cut/whiten is now an INSTANT step, matching
          // backdrop's own `inWindow?1:0` (§129.24). The 1s colour ramp this used to share with HUD
          // (§129.18) is retired for this beat; only HUD still eases (cinema_maxq.js's `_hudFadeT`).
          var _cutT = 1;
          _sectionCutApply(_lp.sectionCut, _cutT, _lp.buildingBox);
          // WITNESS, first hold frame only — proves depth AND colour are ALREADY at target the
          // instant the hold arms, same "expected vs live, same instant" discipline `_backdropWitness`
          // uses. `sampleColorAtTarget` reads ONE representative whitened clone's live colour (not a
          // screenshot — the material's own numeric `.color` fields).
          if (!_lp.cutFadeStartWitnessFired) {
            _lp.cutFadeStartWitnessFired = true;
            var _depthAtFinalInstantly = Math.abs(_lp.sectionCut.liveDepth - _lp.sectionCut.planeDepth) < 1e-6;
            var _sample = _whitenColorPairs[0];
            // Distance-from-TARGET (§129 concrete-grey, not literal white any more) rather than a
            // hardcoded ">0.999 = white" threshold — this must stay correct whatever the target
            // colour is, without a second edit here every time the look changes.
            var _colorAtTarget = _sample && _WHITE_COLOR ? (Math.abs(_sample.clone.color.r - _WHITE_COLOR.r) < 0.02 &&
              Math.abs(_sample.clone.color.g - _WHITE_COLOR.g) < 0.02 && Math.abs(_sample.clone.color.b - _WHITE_COLOR.b) < 0.02) : null;
            console.log('§LOADPATH_CUT_FADE_START elapsed=' + elapsed.toFixed(3) + ' t=' + _cutT.toFixed(3) +
              ' depthAtFinalInstantly=' + _depthAtFinalInstantly +
              ' colorAtTargetInstantly=' + (_colorAtTarget == null ? 'n/a' : _colorAtTarget) +
              ' => ' + (_sample == null ? 'INCONCLUSIVE reason=nothing-whitened' : ((_depthAtFinalInstantly && _colorAtTarget) ? 'PASS' : 'FAIL')));
          }
        }
        // §129.8 item 3 — TWO STACKS, FAR then NEAR, back to back within the ONE hold: FAR gets
        // `[0, farDurSec)` of `elapsed`, NEAR gets the rest. FAR is driven to its OWN full reveal
        // once its window has passed (never left mid-reveal because a frame landed exactly on the
        // boundary), then NEAR takes over — same "no-op once fully revealed" idempotence
        // `_revealStackStep` already guarantees, so calling both every hold frame is always safe.
        var farDurSec = _lp.far ? _lp.far.durSec : 0;
        if (_lp.far) _revealStackStep(_lp.far, Math.min(elapsed, farDurSec));
        if (elapsed >= farDurSec) _revealStackStep(_lp, elapsed - farDurSec);
        if (!_lp.midFired && elapsed >= _lp.durSec / 2) {
          _lp.midFired = true;
          A._loadPathMidHoldThisFrame = true;   // §129.6 items 4/8 — cinema_maxq.js's own §HUD_LAYOUT/§LOADPATH_FOCUS trigger, same frame
          _visibleWitness(_lp, 'near');
          _framingWitness(_lp, 'near');
          if (_lp.far) { _visibleWitness(_lp.far, 'far'); _framingWitness(_lp.far, 'far'); }
          // §129 OPEN ITEM — by mid-hold the fade-in (fadeSec, well under half a normal hold) must be
          // COMPLETE: the cut sits at its real final depth and the whitened clones are genuinely
          // white, not still mid-ramp. Same expected-vs-live discipline as the start witness above.
          if (_lp.sectionCut) {
            var _depthAtFinal = Math.abs(_lp.sectionCut.liveDepth - _lp.sectionCut.planeDepth) < 1e-6;
            var _sampleMid = _whitenColorPairs[0];
            var _isWhiteNow = _sampleMid && _WHITE_COLOR ? (Math.abs(_sampleMid.clone.color.r - _WHITE_COLOR.r) < 0.02 &&
              Math.abs(_sampleMid.clone.color.g - _WHITE_COLOR.g) < 0.02 && Math.abs(_sampleMid.clone.color.b - _WHITE_COLOR.b) < 0.02) : null;
            console.log('§LOADPATH_CUT_FADE_MID elapsed=' + elapsed.toFixed(3) + ' depthAtFinal=' + _depthAtFinal +
              ' atTargetColor=' + (_isWhiteNow == null ? 'n/a' : _isWhiteNow) +
              ' => ' + (_sampleMid == null ? 'INCONCLUSIVE reason=nothing-whitened' : ((_depthAtFinal && _isWhiteNow) ? 'PASS' : 'FAIL')));
          }
        }
        if (typeof window.tmGetState === 'function') {
          var cur = window.tmGetState().cursor;
          if (_lp.cursorAtEntry != null && cur !== _lp.cursorAtEntry) _lp.holdBroke = true;
        }
      } else if (_lp.armed) {
        // §129.27 (2026-09-18, red1: "clean cut to full building must, with background sky ground
        // behind it... don't fade them back after the cut, before" — HUD's own front-loaded fade-in
        // finishes BEFORE this point, see cinema_maxq.js's `_hudFadeT`) — release is ONE frame again,
        // superseding §129.16's "stays armed past release to sweep back" delay. That delay is the
        // most likely cause of the reported black-frame glitch at switch-back: for up to a full
        // `fadeSec` after the "release" the camera had already resumed moving while the cut cap /
        // unbatched clones / whitened materials were STILL live, un-torn-down, viewed from an angle
        // the frozen geometry was never built for. Collapsing arm and release to true instants
        // removes that window outright — ladder/card vanishing, the release-tFilm/restoreCount
        // signals, the backdrop witness, the sky/indoor-annotation restore, the cut/whiten snap-back,
        // AND the real geometry teardown (`_restore`) all now happen on the SAME true-release frame.
        if (_lp.showLadder) {
          A._loadPathReleaseTFilm = tNorm;   // §129.6 item 1 — the tFilm value AT RELEASE, same source-of-truth contract as arm
          A._loadPathRestoreCount = (A._loadPathRestoreCount || 0) + 1;   // cinema_maxq.js's own resume-frame detector
          // §129.7 item 6 — first moving-film frame after release: the "first fade-out frame", exactly
          // when both the arm snapshot and this release snapshot exist, so the witness fires here once.
          if (!_lp.backdropWitnessFired) {
            _lp.backdropWitnessFired = true;
            _backdropWitness(_lp, fSec);
          }
          _lp.showLadder = false;   // ladder/card vanish now — unchanged, already-proven timing
          var _iaN2 = (_lp.indoorAnnotHidden || []).length;
          (_lp.indoorAnnotHidden || []).forEach(function (o) { o.visible = true; });
          console.log('§LOADPATH_INDOOR_ANNOT_RESTORE hiddenShown=' + _iaN2 +
            ' => ' + (_iaN2 === 0 ? 'INCONCLUSIVE reason=nothing-hidden' : 'PASS'));
          _lp.indoorAnnotHidden = null;
        }
        if (_lp.sectionCut) {
          // WITNESS, mirrors §LOADPATH_CUT_FADE_START — proves depth AND colour are ALREADY back to
          // original the instant release happens, same frame as the real teardown below, no gap.
          var _depthUnchanged = Math.abs(_lp.sectionCut.liveDepth - _lp.sectionCut.planeDepth) < 1e-6;
          _sectionCutApply(_lp.sectionCut, 0, _lp.buildingBox);
          var _sampleEnd = _whitenColorPairs[0];
          var _colorBackToOrig = _sampleEnd ? (Math.abs(_sampleEnd.clone.color.r - _sampleEnd.orig.r) < 0.02 &&
            Math.abs(_sampleEnd.clone.color.g - _sampleEnd.orig.g) < 0.02 && Math.abs(_sampleEnd.clone.color.b - _sampleEnd.orig.b) < 0.02) : null;
          console.log('§LOADPATH_CUT_FADE_END instant=true depthUnchanged=' + _depthUnchanged +
            ' colorBackToOrig=' + (_colorBackToOrig == null ? 'n/a' : _colorBackToOrig) +
            ' => ' + (_sampleEnd == null ? 'INCONCLUSIVE reason=nothing-whitened' : ((_depthUnchanged && _colorBackToOrig) ? 'PASS' : 'FAIL')));
        }
        _restore(fSec);
      }
    } catch (e) { _err('APPLY', e); }
  };

  function _restore(exitFSec) {
    // §129.4 PRIMAL LAW clause 4 — a witness must be able to say INCONCLUSIVE, not just PASS/FAIL,
    // when nothing was actually judged (no Time Machine cursor to compare against).
    var haveCursor = (typeof window.tmGetState === 'function') && _lp.cursorAtEntry != null;
    var cursorAfter = (typeof window.tmGetState === 'function') ? window.tmGetState().cursor : null;
    // §129.4 v8b HOLD — cameraMoved: the LAST hold frame's live pose (captured on every per-frame
    // re-assert above) compared to the pose captured once at arm. Re-asserted every frame, so this
    // is trivially false unless something else perturbs the camera between the last re-assert and
    // this exit frame (e.g. OrbitControls damping) — the falsifiable proof the hold actually held.
    // ROUND 6 — now ALSO checks quaternion drift (angleTo), never just position: the real Terminal
    // defect (the hold re-aiming the camera via a stale A.controls.target every frame) moved
    // ORIENTATION only, which the old position-only check could never have caught even if it had
    // still been running the old code — "cameraMoved=false compares against the same wrong pose".
    var cameraMoved = false;
    if (_lp.armPose && _lp.lastHoldPose) {
      var EPS_P = 1e-6, EPS_ANG = 1e-6;
      cameraMoved = Math.abs(_lp.lastHoldPose.x - _lp.armPose.x) > EPS_P ||
        Math.abs(_lp.lastHoldPose.y - _lp.armPose.y) > EPS_P ||
        Math.abs(_lp.lastHoldPose.z - _lp.armPose.z) > EPS_P;
      if (!cameraMoved && _lp.armPose.quaternion && _lp.lastHoldPose.quaternion &&
          typeof _lp.armPose.quaternion.angleTo === 'function') {
        cameraMoved = _lp.armPose.quaternion.angleTo(_lp.lastHoldPose.quaternion) > EPS_ANG;
      }
    }
    // §LOADPATH_HOLD gains camPos=/camDir=/armSource= (ROUND 6 item 4) — camDir is the LAST HOLD
    // frame's own forward vector, derived from its captured quaternion (never the live camera at
    // _restore() time, which by now may already be driving the NEXT beat's own pose). If a real
    // quaternion was never captured at arm, there is no trustworthy orientation to check at all —
    // INCONCLUSIVE, never a silent pass on an unproven claim, and never a fallback to
    // A.controls.target (per this round's own ruling).
    var camPos = _lp.lastHoldPose ? [_lp.lastHoldPose.x, _lp.lastHoldPose.y, _lp.lastHoldPose.z] : null;
    var camDir = (_lp.lastHoldPose && _lp.lastHoldPose.quaternion && typeof THREE !== 'undefined')
      ? new THREE.Vector3(0, 0, -1).applyQuaternion(_lp.lastHoldPose.quaternion) : null;
    var armSource = _lp.armSource || 'none';
    // ROUND 9 item 1 — cinema_maxq.js's own frame-grid mapping (`_lpFrameForArmTn`) is the single
    // source of truth for "did the hold arm on the frame its own tNorm actually asks for"; read
    // here, never re-derived, so this witness FAILs whenever `§LOADPATH_HOLD_INSERT` already printed
    // `armTnMatch=false => FAIL`. Missing (no hold this bake, or __lpNoClockFreeze) defaults true —
    // never a manufactured FAIL for a value nothing computed.
    var armTnMatch = (A._loadPathArmTnMatch !== false);
    var holdVerdict = (armSource !== 'quaternion') ? 'INCONCLUSIVE reason=controls-target'
      : !haveCursor ? 'INCONCLUSIVE reason=no-tm-cursor'
      : ((!_lp.holdBroke && !cameraMoved && armTnMatch) ? 'PASS' : 'FAIL');
    console.log('§LOADPATH_HOLD tNorm=' + (_lp.holdStartSec / _lp.filmSecFull).toFixed(4) +
      ' shapeSec=' + _lp.durSec.toFixed(2) + ' hops=' + _lp.hopsUp.length +
      (_lp.far ? ' farHops=' + _lp.far.hopsUp.length : '') +
      ' cursorDayBefore=' + _lp.cursorAtEntry + ' cursorDayAfter=' + cursorAfter +
      ' cameraMoved=' + cameraMoved + ' armTnMatch=' + armTnMatch +
      ' camPos=' + (camPos ? '[' + camPos.map(function (v) { return v.toFixed(2); }).join(',') + ']' : '?') +
      ' camDir=' + (camDir ? '[' + camDir.x.toFixed(3) + ',' + camDir.y.toFixed(3) + ',' + camDir.z.toFixed(3) + ']' : '?') +
      ' armSource=' + armSource +
      ' => ' + holdVerdict);
    // v8b RESTORE — the camera is NEVER touched here at all (holds through the whole window, then
    // cinema_maxq.js's own per-frame pose logic simply resumes driving it next frame; "cameraRestored"
    // is gone — HOLD's own cameraMoved above is the fact that owns "did we hold", this function only
    // owns "did we clean up").
    // §129.8 item 3 — BOTH stacks' clones are disposed here (far's too, when it exists); ghost
    // materials are a single shared pass regardless of stack count, unchanged.
    var skip = !!window.__lpSkipRestore;
    var materialsRestored = 0, total = _ghostTouched.length;
    var clonesN = _lp.hopsUp.filter(function (h) { return !!h._cloneMesh; }).length +
      (_lp.far ? _lp.far.hopsUp.filter(function (h) { return !!h._cloneMesh; }).length : 0);
    var clonesReverted = 0;
    if (!skip) {
      // §129 OPEN ITEM — the cap's companion/plane meshes are pure scene additions (never a material
      // swap on a real building object), so they come out FIRST, before anything whiten touches is
      // even considered for restore — order relative to whiten doesn't matter for correctness, but
      // "the newest addition unwinds first" keeps the LIFO discipline this file already uses.
      var _capR = _restoreCutCap();
      var _capApply = _lp.cutCapResult || { covered: 0, batchedSkipped: 0, capBuilt: false };
      var _capVacuous = (_capApply.covered === 0 && !_capApply.capBuilt);
      console.log('§LOADPATH_CUT_CAP_RESTORE companionsRemoved=' + _capR.companionsRemoved + '/' + (_capApply.covered * 2) +
        ' planeRemoved=' + _capR.planeRemoved + '/' + _capApply.capBuilt +
        ' => ' + (_capVacuous ? 'INCONCLUSIVE reason=nothing-capped' : ((_capR.companionsRemoved === _capApply.covered * 2 && _capR.planeRemoved === _capApply.capBuilt) ? 'PASS' : 'FAIL')));
      // §129 FIX 3 — undo the unbatch: dispose the per-element clones, show the original containers
      // again. Independent of whiten/cap restore above — order relative to them doesn't matter.
      var _buR = _restoreBatchedElementClones();
      var _buApply = _lp.batchUnpackResult || { containers: 0, elements: 0 };
      var _buVacuous = (_buApply.containers === 0);
      console.log('§LOADPATH_BATCH_UNPACK_RESTORE clonesRemoved=' + _buR.clonesRemoved + '/' + _buApply.elements +
        ' containersShown=' + _buR.containersShown + '/' + _buApply.containers +
        ' => ' + (_buVacuous ? 'INCONCLUSIVE reason=no-batched-containers' : ((_buR.clonesRemoved === _buApply.elements && _buR.containersShown === _buApply.containers) ? 'PASS' : 'FAIL')));
      // §129.16/§129.27 — the sky/indoor-annotation hide-outright restore fires in the release
      // branch's own `_lp.showLadder` block (its `§LOADPATH_INDOOR_ANNOT_RESTORE` line), same frame
      // as this `_restore()` call now that §129.27 collapsed release back to a single instant.
      // `_lp.indoorAnnotHidden` is already `null` by the time this runs; left un-duplicated rather
      // than printing a second, always-INCONCLUSIVE copy of that line.
      // Locked spec item 4 — undo the whiten wrap BEFORE the ghost restore beneath it (LIFO, same
      // order _applyWhiten/_restoreGhost's own comments spell out); gated by the same __lpSkipRestore
      // control so that control still means "nothing was put back" for the whole pass, not just ghost.
      var _wr = _restoreWhiten();
      // §LOADPATH_WHITEN (2026-09-17) — the ONE real proof that the "building goes concrete/white"
      // ruling actually did something and actually undid it: `whitened` is the apply-time count
      // (`_lp.whitenResult`, stashed at arm — never re-derived here, that would be a tautology),
      // `materialsRestored` is THIS call's own live count. `instanceColorMeshes`/`instRestored` prove
      // the multiplicative-instanceColor risk (this file's own comment on `_applyWhiten`) was actually
      // handled, not just possible in theory — vacuous (nothing to whiten at all) reads INCONCLUSIVE,
      // never a silent PASS, same PRIMAL LAW discipline as every other witness in this file.
      var _wApply = _lp.whitenResult || { n: 0, instanceColorMeshes: 0, batchColorTexNulled: 0 };
      var _whitenVacuous = (_wApply.n === 0);
      var _whitenOk = _whitenVacuous ? null
        : (_wr.n === _wApply.n && _wr.instRestored === _wr.instTotal && _wr.instTotal === _wApply.instanceColorMeshes &&
           _wr.batchTexRestored === _wr.batchTexTotal && _wr.batchTexTotal === _wApply.batchColorTexNulled);
      console.log('§LOADPATH_WHITEN whitened=' + _wApply.n + ' materialsRestored=' + _wr.n + '/' + _wApply.n +
        ' instanceColorMeshes=' + _wApply.instanceColorMeshes + ' instanceColorRestored=' + _wr.instRestored + '/' + _wr.instTotal +
        ' batchColorTexNulled=' + _wApply.batchColorTexNulled + ' batchColorTexRestored=' + _wr.batchTexRestored + '/' + _wr.batchTexTotal +
        ' => ' + (_whitenVacuous ? 'INCONCLUSIVE reason=nothing-to-whiten' : (_whitenOk ? 'PASS' : 'FAIL')));
      materialsRestored += _restoreGhost();
      clonesReverted = _disposeChainClones(_lp.hopsUp) + (_lp.far ? _disposeChainClones(_lp.far.hopsUp) : 0);
      try { if (typeof A._applyDiscVisibility === 'function') A._applyDiscVisibility(); } catch (e1) {}
      try { if (typeof window.tmSetCursor === 'function') window.__forceFull = true; } catch (e2) {}
    }
    _lp.armed = false; _lp.cursorAtEntry = null; _lp.holdBroke = false; _lp.revealedHops = 0;
    _lp.chainBox = null; _lp.armPose = null; _lp.lastHoldPose = null; _lp.far = null; _lp.sectionCutPlane = null; _lp.sectionCut = null; _lp.cutCapResult = null; _lp.batchUnpackResult = null;
    // §129.4: total===0 means ARM found nothing live to touch at all (a lookup miss, not a restore
    // outcome) — vacuous, not a PASS, per the same PRIMAL LAW clause. `planesLeft` is kept in the
    // print for format continuity — the clip plane always goes with its disposed clone in
    // _restoreGhost(), so a real restore always leaves 0 live.
    var vacuous = (total === 0 && clonesN === 0);
    var restoreVerdict = vacuous ? 'INCONCLUSIVE reason=nothing-touched-at-arm'
      : ((materialsRestored === total && clonesReverted === clonesN) ? 'PASS' : 'FAIL');
    console.log('§LOADPATH_RESTORE materialsRestored=' + materialsRestored + '/' + total +
      ' planesLeft=0 clonesReverted=' + clonesReverted + '/' + clonesN + ' => ' + restoreVerdict);
  }
  function _forceRestore() {
    if (_lp && _lp.armed) { _restore(_lp.holdEndSec); return; }
    // Nothing armed — still clear any leftover touch state defensively (bake-abort safety).
    var hasClones = _lp && _lp.hopsUp && _lp.hopsUp.some(function (h) { return !!h._cloneMesh; });
    var hasFarClones = _lp && _lp.far && _lp.far.hopsUp.some(function (h) { return !!h._cloneMesh; });
    if (_ghostTouched.length || _whitenTouched.length || hasClones || hasFarClones) {
      _restoreCutCap();   // bake-abort safety — same as _restore() above, defensive here too
      _restoreBatchedElementClones();   // same defensive safety net for the unbatch clones
      if (_lp && _lp.indoorAnnotHidden) { _lp.indoorAnnotHidden.forEach(function (o) { o.visible = true; }); _lp.indoorAnnotHidden = null; }
      _restoreWhiten();   // LIFO — before _restoreGhost(), same discipline as _restore() above
      var materialsRestored = _restoreGhost();
      var clonesReverted = (_lp ? _disposeChainClones(_lp.hopsUp) : 0) + (_lp && _lp.far ? _disposeChainClones(_lp.far.hopsUp) : 0);
      if (_lp) _lp.far = null;
      console.log('§LOADPATH_RESTORE materialsRestored=' + materialsRestored + '/' + materialsRestored +
        ' planesLeft=0 clonesReverted=' + clonesReverted + '/' + clonesReverted + ' => PASS (forced, nothing armed)');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // A.loadPathCompositeOntoCanvas(ctx, w, h, filmSec) — every captured frame, 2D pass.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // ══ §129.6 items 5/7 LABEL LADDER (2026-09-15) ══════════════════════════════════════════════════
  // Pure layout math — no THREE.js, no canvas — so it is directly node-dry-runnable against
  // synthetic screen positions. `hopScreens`: [{k, px, py}, ...] for VISIBLE hops ONLY (item 7b),
  // in GROUND-UP order (matching hopsUp's own convention). Returns one row per hop, reversed to
  // TOP-DOWN display order (item 5: "sorted by layer height" reads as the stack's own physical
  // order), evenly spaced by rowH = labelH + gap with gap >= one label height (spec's own floor).
  // §HUD FIX (2026-09-15, real HHS bake: the ladder column landed under the pie/resource panel,
  // overlaps=5) — `avoidRects` ([{x,y,w,h}, ...], typically A._hudLayoutRects from an EARLIER point
  // in the SAME frame) is now consulted: for each candidate side (preferred first, then the other),
  // find the largest CONTIGUOUS vertical band whose column x-range does not cross any avoid-rect
  // that also spans that x-range; use the first side whose free band is >= the ladder's own needed
  // height. If NEITHER side has room, drop the column below the lowest avoid-rect (spec's own
  // explicit fallback) — still on the preferred side's x. Returns `{rows, column}` — `column` is the
  // ACTUALLY chosen side, which the caller's own witness print must read (never the naive
  // preferRight guess, since avoidance can flip it).
  function _freeVerticalSpan(x0, x1, avoidRects, h) {
    var blockers = (avoidRects || [])
      .filter(function (r) { return !(r.x + r.w <= x0 || x1 <= r.x); })
      .map(function (r) { return { y0: r.y, y1: r.y + r.h }; })
      .sort(function (a, b) { return a.y0 - b.y0; });
    var spans = [], cursor = 0;
    blockers.forEach(function (b) {
      if (b.y0 > cursor) spans.push({ y0: cursor, y1: b.y0 });
      cursor = Math.max(cursor, b.y1);
    });
    if (cursor < h) spans.push({ y0: cursor, y1: h });
    var best = null;
    spans.forEach(function (s) { if (!best || (s.y1 - s.y0) > (best.y1 - best.y0)) best = s; });
    // §HUD FIX 2 (2026-09-16) edge case: when the blockers consume the WHOLE column (spans is
    // empty because every gap got closed), falling back to {0,h} claimed the FULLY-BLOCKED column
    // as maximally free — the opposite of the truth — which is exactly why AVOIDANCE 2's left
    // column (fully blocked, 0..h) was still picked over the spec's "drop below lowest rect"
    // fallback. {0,h} is only correct when there were no blockers in this column at all, which the
    // `if (cursor < h) spans.push(...)` line above already covers whenever real room exists. A
    // zero-size span here reads as "no room" to every caller (any neededH > 0 fails >= against it),
    // so the caller correctly moves to the next side / the below-lowest-rect fallback.
    // §129.7 item 2 (2026-09-16) NOTE: superseded as the ladder's OWN placement method — the ladder
    // no longer chooses a side or dodges a blocker (see `_ladderLayout` below) — kept as a tested,
    // still-exposed (`A._loadPathFreeVerticalSpan`) utility, not dead code removed on a guess.
    return best || { y0: h, y1: h };
  }
  // Cross-overlap: every row in `a` against every rect in `b` (a HUD registry, typically). Distinct
  // from `_rectsOverlapCount` (pairwise WITHIN one list) — this is "does THIS SET intersect THAT
  // SET", the exact shape §129.7 item 2's `hudClear` check needs.
  function _crossOverlapCount(a, b) {
    var n = 0;
    for (var i = 0; i < a.length; i++) for (var j = 0; j < b.length; j++) {
      var x = a[i], y = b[j];
      if (!(x.x + x.w <= y.x || y.x + y.w <= x.x || x.y + x.h <= y.y || y.y + y.h <= x.y)) n++;
    }
    return n;
  }
  // §129.7 item 2 (2026-09-16, user: "the labelling skew to the right and obscured a bit by the
  // HUD... rather have the labels fall in the screen centre") — SUPERSEDES the side-choosing/
  // relocating algorithm above entirely. The column is now ALWAYS centred on the frame's x-centre,
  // vertically centred in the FULL frame height — same vertical order (top-down by layer height)
  // and same gap rule (rowH = labelH + gap, gap >= labelH) as before. It does NOT dodge a registered
  // HUD rect: "the centre is normally free — if not, the witness says so" is the user's own ruling,
  // confirmed by the dry-run requirement that a blocked centre must FAIL, not relocate silently.
  // `preferRight` is kept as a parameter only for call-site/back-compat (ignored, no side to prefer
  // any more); `avoidRects`, when given, is used ONLY to compute `hudOverlaps`/`hudClear` for the
  // caller's own witness — never to move the column.
  function _ladderLayout(hopScreens, w, h, preferRight, labelW, labelH, avoidRects) {
    labelH = labelH || Math.max(14, Math.round(h * 0.022));
    labelW = labelW || Math.max(60, Math.round(w * 0.16));
    var gap = labelH, rowH = labelH + gap;
    var topDown = hopScreens.slice().reverse();
    var neededH = topDown.length > 0 ? topDown.length * rowH - gap : 0;
    var centreX = Math.round(w / 2 - labelW / 2);
    var startY = Math.max(0, (h - neededH) / 2);   // vertically centred in the FULL frame height
    var rows = topDown.map(function (hs, pos) {
      return { k: hs.k, px: hs.px, py: hs.py, x: centreX, y: startY + pos * rowH, w: labelW, h: labelH };
    });
    var hudOverlaps = _crossOverlapCount(rows, avoidRects || []);
    return { rows: rows, column: 'centre', hudOverlaps: hudOverlaps, hudClear: hudOverlaps === 0 };
  }
  // §129.8 item 4 (2026-09-16, SUPERSEDES the screen-centred column above for the TWO-STACK case —
  // "ladders beside their stacks... the side with more room, between the two stacks if both fit")
  // — revives `_freeVerticalSpan`'s own side-choosing math (kept, tested, exposed since §129.7 item
  // 2 superseded its ORIGINAL use, never dead code removed on a guess): tries the side with more
  // free vertical room next to `stackBoxPx` ([0, x0) or (x1, w]) against `avoidRects` (the HUD
  // registry — and, when both stacks are shown, the OTHER stack's own screen box, so the two
  // ladders cannot land on each other), places the column flush against that side, vertically
  // centred in the free span found.
  function _ladderLayoutBesideStack(hopScreens, stackBoxPx, w, h, labelW, labelH, avoidRects) {
    labelH = labelH || Math.max(14, Math.round(h * 0.022));
    labelW = labelW || Math.max(60, Math.round(w * 0.16));
    // ROUND 12 item 4 (2026-09-16, real HHS bake: `loadpath.label.near.*:0,…` — a column flush
    // against the frame's own left edge) — "keep a margin of one label height from every frame
    // edge": one `labelH` of clearance on every side (left/right/top/bottom), never just clamped to
    // 0/w/0/h.
    var margin = labelH;
    var gap = labelH, rowH = labelH + gap;
    // FIX (2026-09-18, red1: "the lines drawn are not proper Y accurate") — labels used to be ordered
    // by fixed hop-index (`.reverse()`, highest hop always drawn topmost), never by where each hop's
    // OWN anchor actually lands on screen. Under perspective, a taller/farther hop can project BELOW
    // a shorter/nearer one even though its hop-index is higher — the label order didn't move with it,
    // so its leader line had to cross whichever line WAS drawn to the correct screen-order slot. Real
    // fix: sort by the anchor's own projected screen-Y (top of screen first), so label order always
    // matches anchor order and leader lines never have to cross to reach their own row.
    var topDown = hopScreens.slice().sort(function (a, b) { return a.py - b.py; });
    var neededH = topDown.length > 0 ? topDown.length * rowH - gap : 0;
    var x0 = stackBoxPx ? stackBoxPx.x0 : w / 2, x1 = stackBoxPx ? stackBoxPx.x1 : w / 2;
    var leftSpan = _freeVerticalSpan(0, x0, avoidRects, h);
    var rightSpan = _freeVerticalSpan(x1, w, avoidRects, h);
    var leftRoom = Math.max(0, leftSpan.y1 - leftSpan.y0), rightRoom = Math.max(0, rightSpan.y1 - rightSpan.y0);
    var side = rightRoom >= leftRoom ? 'right' : 'left';
    var span = side === 'right' ? rightSpan : leftSpan;
    var colX = side === 'right'
      ? Math.min(w - labelW - margin, Math.round(x1))
      : Math.max(margin, Math.round(x0 - labelW));
    var spanY0 = Math.max(margin, span.y0), spanY1 = Math.min(h - margin, span.y1);
    var room = Math.max(0, spanY1 - spanY0);
    var startY = spanY0 + Math.max(0, (room - neededH) / 2);
    var rows = topDown.map(function (hs, pos) {
      return { k: hs.k, px: hs.px, py: hs.py, x: colX, y: startY + pos * rowH, w: labelW, h: labelH };
    });
    var hudOverlaps = _crossOverlapCount(rows, avoidRects || []);
    return { rows: rows, column: side, hudOverlaps: hudOverlaps, hudClear: hudOverlaps === 0 };
  }
  A._loadPathLadderLayoutBesideStack = _ladderLayoutBesideStack;
  // Control window.__lpLabelsNaive=1 — v8 behaviour: one label AT each hop's own projected point,
  // no column, no gap floor — exactly what item 5 asks the ladder to replace.
  function _naiveLayout(hopScreens, labelW, labelH) {
    labelH = labelH || 14; labelW = labelW || 90;
    return hopScreens.map(function (hs) {
      return { k: hs.k, px: hs.px, py: hs.py, x: hs.px, y: hs.py - labelH / 2, w: labelW, h: labelH };
    });
  }
  function _rectsOverlapCount(rects) {
    var n = 0;
    for (var i = 0; i < rects.length; i++) for (var j = i + 1; j < rects.length; j++) {
      var a = rects[i], b = rects[j];
      if (!(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)) n++;
    }
    return n;
  }
  function _minVerticalGap(rects) {
    var sorted = rects.slice().sort(function (a, b) { return a.y - b.y; }), m = Infinity;
    for (var i = 1; i < sorted.length; i++) { var g = sorted[i].y - (sorted[i - 1].y + sorted[i - 1].h); if (g < m) m = g; }
    return m === Infinity ? null : m;
  }
  function _allRectsInFrame(rects, w, h) {
    return rects.every(function (r) { return r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h; });
  }
  // Exposed for a direct node dry run of the pure layout math (never re-derived a second time there).
  A._loadPathLadderLayout = _ladderLayout; A._loadPathNaiveLayout = _naiveLayout;
  A._loadPathRectsOverlapCount = _rectsOverlapCount; A._loadPathMinVerticalGap = _minVerticalGap;
  A._loadPathFreeVerticalSpan = _freeVerticalSpan; A._loadPathCrossOverlapCount = _crossOverlapCount;

  // §129.21 (2026-09-18, red1: "I think we do away with lines and all in a HUD... Just have a nice
  // HUD like the other overlays, as each stack item appears, it's corresponding info row does so
  // too in that same colour thus user correlates right away. A running total qty cost in bigger
  // font gives the wow") — REPLACES the ladder's leader-line-to-3D-anchor scheme (`_drawStackLadder`
  // below, kept defined but no longer called from the composite pass — see that call site's own
  // note) with a plain, fixed-position HUD list, one row per REVEALED hop, colour-swatched to match
  // that hop's own 3D shine-through colour (`h.hex`, `_hexForHop` — the SAME gradient the stack
  // itself already renders in, not a new scheme). Solves the ladder's own line-crossing bug outright
  // (§129.15) — there is no leader line to cross any more, no 3D anchor projection needed at all.
  // Alternating zebra-striped row backgrounds (red1: "for a more pro look"), a running total
  // (elements placed · cost, `A._loadPathFetchHopScheduleCost`'s own real per-hop `calcLabor` figure
  // — never invented) in a larger header font.
  // §129.23 (2026-09-18, red1: "the sequence should also match, ie from bottom up in the HUD... I
  // asked for running totals for days too, thus need not be at each line since cost is not at each
  // line") — rows now list hop1 (the foundation, "each layer rests on the one below it") at the
  // panel's OWN bottom edge, newer/higher hops appended ABOVE as they reveal — the panel grows
  // upward from a fixed bottom, mirroring how the building itself rises. `yBottom` (was `yTop`) is
  // that fixed anchor; the caller reserves it from each stack's FULL hop count (`_stackInfoPanelMaxH`
  // below) so the anchor never shifts as `revealed` grows mid-hold. Days total is a HEADER figure,
  // matching cost — and, same as cost, genuinely SUMMED (never invented): unique TASK ids among the
  // revealed hops only, each task's own real duration counted ONCE — several hops commonly share one
  // task (e.g. "Substructure" spanning many columns), so a naive per-hop sum would double-count real
  // calendar time that is not actually sequential.
  // §HUD_SCALE — takes the frame HEIGHT now, not the old `k` scale: the one sizing law is a
  // function of h, and this helper must reserve the height the panel will ACTUALLY draw at,
  // or the bottom anchor it feeds shifts under the panel mid-hold.
  function _stackInfoPanelMaxH(h, stack) {
    if (!stack || !stack.hopsUp) return 0;
    // §HUD_SCALE — 13px at the h=900 this panel was drawn against, i.e. a 0.01444 fraction,
    // handed to the one law so it rises with resolution like every other overlay.
    var fontPx = (window.__hudFontPx ? window.__hudFontPx(h, 0.014444, 9) : Math.max(9, Math.round(h * 0.014444)));
    var headerFontPx = Math.round(fontPx * 1.35);
    var rowH = Math.round(fontPx * 2.0);
    var headerH = Math.round(headerFontPx * 2.6);
    var pad = Math.round(fontPx * 0.6);
    return headerH + stack.hopsUp.length * rowH + pad;
  }
  A._loadPathStackInfoPanelMaxH = _stackInfoPanelMaxH;
  // §129.28 (2026-09-18, red1: "the stack lines box to avoid the stack itself... move out of from
  // obscuring it") — screen-space bbox of the stack's own REVEALED (currently-solid/visible, per
  // `_solidSetFor` — never a re-derived "index < revealedHops" guess, which would silently invert
  // under `window.__lpTopDown`) hop clones. Same projection `_drawStackLadder` used before this
  // fixed-position panel replaced it (position-only, not full AABB corners — a cheap, already-
  // proven approximation for "roughly where the stack is on screen"). Used only to decide whether
  // the panel below needs to step aside.
  function _stackScreenBox(stack, w, h) {
    var bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    var proj = new THREE.Vector3();
    var _solid = _solidSetFor(stack.hopsUp.length, stack.revealedHops || 0);
    (stack.hopsUp || []).forEach(function (h_, i) {
      if (!h_._cloneMesh || !_solid[i]) return;
      var b = new THREE.Box3().setFromObject(h_._cloneMesh);
      var box = { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z };
      var r = _projectAABBLive(box, A.camera);
      if (!r || !r.intersects) return;
      var wp = new THREE.Vector3(); h_._cloneMesh.getWorldPosition(wp);
      proj.copy(wp).project(A.camera);
      var pxn = Math.max(-1.5, Math.min(1.5, proj.x)), pyn = Math.max(-1.5, Math.min(1.5, proj.y));
      var px = (pxn * 0.5 + 0.5) * w, py = (1 - (pyn * 0.5 + 0.5)) * h;
      bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px); by0 = Math.min(by0, py); by1 = Math.max(by1, py);
    });
    return isFinite(bx0) ? { x0: bx0, x1: bx1, y0: by0, y1: by1 } : null;
  }
  function _drawStackInfoPanel(ctx, w, h, k, stack, stackName, yBottom, avoidRect) {
    if (!stack || !stack.hopsUp || !stack.hopsUp.length) return null;
    var revealed = Math.max(0, Math.min(stack.hopsUp.length, stack.revealedHops || 0));
    if (revealed <= 0) return null;
    // §HUD_SCALE — 13px at the h=900 this panel was drawn against, i.e. a 0.01444 fraction,
    // handed to the one law so it rises with resolution like every other overlay.
    var fontPx = (window.__hudFontPx ? window.__hudFontPx(h, 0.014444, 9) : Math.max(9, Math.round(h * 0.014444)));
    var headerFontPx = Math.round(fontPx * 1.35);
    var rowH = Math.round(fontPx * 2.0);
    var headerH = Math.round(headerFontPx * 2.6);
    var pad = Math.round(fontPx * 0.6);
    var swatch = Math.round(fontPx * 0.75);
    var divider = Math.max(1, Math.round(fontPx * 0.08));
    ctx.save();
    // §129.26 (2026-09-18, red1: "make the table professional looking with totals correct" / "need
    // not be at each line since cost is not at each line") — rows are back to plain class/storey/hop
    // (no per-row day tag either now, matching cost's own always-header-only convention); totals
    // (RM cost, days — both `calcLabor`'s own real per-element figures, §129.26 above) live ONLY in
    // the header, summed straight (no dedup — see that section's own reasoning for why cost/days are
    // now the SAME kind of additive per-element figure). A thin divider under the header and a
    // slightly bolder header weight are the "professional" cues — same dark-glass plate, no new look.
    ctx.font = '600 ' + fontPx + 'px Segoe UI, system-ui, sans-serif';
    var rowsText = [];
    var maxRowW = 0;
    for (var mi = 0; mi < revealed; mi++) {
      var mh = stack.hopsUp[mi];
      var lbl = mh.cls.replace(/^Ifc/, '') + ' · ' + mh.storey + ' · hop ' + (mi + 1) + '/' + stack.hopsUp.length;
      rowsText.push(lbl);
      maxRowW = Math.max(maxRowW, ctx.measureText(lbl).width);
    }
    ctx.font = '700 ' + headerFontPx + 'px Segoe UI, system-ui, sans-serif';
    var totalCost = 0, totalDays = 0;
    for (var ci = 0; ci < revealed; ci++) {
      var ch = stack.hopsUp[ci];
      totalCost += (ch.hopCost || 0);
      totalDays += (ch.hopDays || 0);
    }
    var headerText = revealed + ' of ' + stack.hopsUp.length + ' placed';
    var totalsText = 'RM ' + _spaceThousandsLP(totalCost) + ' · ' + _formatDaysLP(totalDays);
    var headerW = Math.max(ctx.measureText(headerText).width, ctx.measureText(totalsText).width);
    var panelW = Math.round(Math.max(headerW, maxRowW + swatch + pad * 3) + pad * 2);
    var panelH = headerH + revealed * rowH + pad;
    var x = Math.round(w - panelW - w * 0.012);
    var y = Math.round(yBottom) - panelH;
    // §129.28 (2026-09-18, red1) — step the panel LEFT of the stack's own screen bbox when (and
    // only when) the fixed right-edge position would actually sit on top of it (a tall stack whose
    // upper hops happen to project into this same top-right corner). Left untouched otherwise.
    var stackBoxPx = _stackScreenBox(stack, w, h);
    if (stackBoxPx && x < stackBoxPx.x1 && (x + panelW) > stackBoxPx.x0 && y < stackBoxPx.y1 && (y + panelH) > stackBoxPx.y0) {
      x = Math.round(Math.max(pad, stackBoxPx.x0 - panelW - w * 0.012));
    }
    // §129.30 (2026-09-18, red1: "the stack label box is obscured by the top-left info box, thus it
    // has one more target to avoid") — the stack-avoidance nudge above can land the panel right on
    // top of the (always top-left, fixed) info card. A second, independent check: step DOWN below
    // the card when they'd overlap, keeping whatever `x` the stack-avoidance step already chose.
    if (avoidRect && x < avoidRect.x + avoidRect.w && (x + panelW) > avoidRect.x &&
        y < avoidRect.y + avoidRect.h && (y + panelH) > avoidRect.y) {
      y = Math.round(avoidRect.y + avoidRect.h + pad);
    }
    var rr = Math.round(Math.min(panelH, panelW) * 0.09);
    // §129.21 amendment (2026-09-18, red1: "keep design theme consistent with other HUDs") — the
    // SAME frosted dark-glass plate every other panel (resource panel, path map, measure boxes)
    // already shares via `A.cpePanelPlate` — not the white plate the ladder/info-card used (that
    // was always a deliberate ONE-OFF for on-black freeze legibility, not the project's real
    // default). Ink matches too: white at the SAME opacities `_HUD_LEGIBLE` already measured
    // against this exact plate, rather than a new pair invented for this one panel.
    if (typeof A.cpePanelPlate === 'function') A.cpePanelPlate(ctx, x, y, panelW, panelH, rr);
    else { ctx.fillStyle = 'rgba(0,0,0,0.45)'; if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, panelW, panelH, rr); ctx.fill(); } else ctx.fillRect(x, y, panelW, panelH); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + headerFontPx + 'px Segoe UI, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(headerText, x + pad, y + headerH * 0.34);
    ctx.font = '700 ' + Math.round(headerFontPx * 0.86) + 'px Segoe UI, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,215,0,0.95)';   // a warm gold pick-out for the totals line — reads as "the number that matters" against the plain white header above it
    ctx.fillText(totalsText, x + pad, y + headerH * 0.72);
    // Divider — a clean, professional break between the summary header and the itemised rows below.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + pad, y + headerH - divider, panelW - pad * 2, divider);
    ctx.font = '600 ' + fontPx + 'px Segoe UI, system-ui, sans-serif';
    // §129.23 — bottom-up: hop1 (ri=0) draws at the panel's OWN bottom-most row; each higher hop
    // stacks ABOVE it. `panelH` already reserves exactly `revealed` rows worth of space below the
    // header, so `ri` counted from the bottom lands every row flush, no gap.
    for (var ri = 0; ri < revealed; ri++) {
      var rowY = (y + panelH) - pad - (ri + 1) * rowH;
      if (ri % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';   // zebra band — a lift off the glass, not a light tint
        ctx.fillRect(x, rowY, panelW, rowH);
      }
      var hop = stack.hopsUp[ri];
      ctx.fillStyle = '#' + ('000000' + (hop.hex >>> 0).toString(16)).slice(-6);
      ctx.fillRect(x + pad, rowY + (rowH - swatch) / 2, swatch, swatch);
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillText(rowsText[ri], x + pad * 2 + swatch, rowY + rowH / 2);
    }
    ctx.restore();
    if (A._hudLayoutRegister) A._hudLayoutRegister('loadpath.infopanel.' + stackName, x, y, panelW, panelH);
    return { x0: x, y0: y, x1: x + panelW, y1: y + panelH };
  }
  // Local thousands-separator — this file has no shared formatter to reuse (cpe_resource_panel.js's
  // own `_spaceThousands` lives in a different closure), and this is the only place in THIS file that
  // needs one.
  function _spaceThousandsLP(n) {
    var s = Math.round(n).toString();
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  // Whole-day figures print clean ("6 days"); a real fractional remainder (from an hour-only task,
  // §_isoDurToDays) keeps one decimal rather than rounding it away.
  function _formatDaysLP(days) {
    var rounded = Math.round(days * 10) / 10;
    var isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
    return (isWhole ? Math.round(rounded) : rounded) + (Math.abs(rounded) === 1 ? ' day' : ' days');
  }

  var _lpLabelsWitnessFiredThisHold = {};   // §129.8 item 3 — keyed by stack name ('near'/'far')
  // §129.21 (2026-09-18) — RETIRED from the composite pass (see `A.loadPathCompositeOntoCanvas`'s
  // own call site, now `_drawStackInfoPanel` instead), superseded by red1's own direction to drop
  // the leader-line ladder for a plain HUD list. Kept defined, not deleted: still exposed for a
  // direct node dry run of the pure layout math (`A._loadPathLadderLayoutBesideStack` etc, below),
  // and as prior art if a future look ever wants a 3D-anchored label again.
  // §129.8 item 4 — one stack's own hop-screen projection + ladder-beside-box + draw + witness.
  // `otherStackBoxPx` (nullable): the OTHER stack's own screen box, added to `avoidRects` ONLY for
  // THIS stack's own side/room search, so the two ladders cannot land on each other — "between the
  // two stacks if both fit" falls out of this for free (each stack's ladder naturally lands on its
  // OUTER side once the other stack's box blocks the inner one, unless the inner side still has
  // more free room, in which case the free-room rule already picked correctly on its own merits).
  function _drawStackLadder(ctx, w, h, k, stack, stackName, avoidRectsBase, otherStackBoxPx) {
    var proj = new THREE.Vector3();
    var hopScreens = [];
    var bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    stack.hopsUp.forEach(function (h_, i) {
      if (!h_._cloneMesh) return;
      h_._cloneMesh.updateMatrixWorld(true);
      var b = new THREE.Box3().setFromObject(h_._cloneMesh);
      var box = { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z };
      var r = _projectAABBLive(box, A.camera);
      if (!r || !r.intersects) return;   // off-screen: coloured (already drawn in 3D) but never labelled/leadered
      var wp = new THREE.Vector3(); h_._cloneMesh.getWorldPosition(wp);
      proj.copy(wp).project(A.camera);
      var pxn = Math.max(-1.5, Math.min(1.5, proj.x)), pyn = Math.max(-1.5, Math.min(1.5, proj.y));
      var px = (pxn * 0.5 + 0.5) * w, py = (1 - (pyn * 0.5 + 0.5)) * h;
      hopScreens.push({ k: i, px: px, py: py });
      bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px); by0 = Math.min(by0, py); by1 = Math.max(by1, py);
    });
    var stackBoxPx = isFinite(bx0) ? { x0: bx0, x1: bx1, y0: by0, y1: by1 } : { x0: w / 2, x1: w / 2, y0: 0, y1: h };
    var avoidRects = otherStackBoxPx ? avoidRectsBase.concat([{ x: otherStackBoxPx.x0, y: otherStackBoxPx.y0,
      w: otherStackBoxPx.x1 - otherStackBoxPx.x0, h: otherStackBoxPx.y1 - otherStackBoxPx.y0 }]) : avoidRectsBase;
    // FIX (2026-09-18, red1: "the background of each label not in full" — the plate was a fixed
    // `w*0.16` guess, unrelated to the actual label text; a longer storey name like "GROUND FLOOR
    // LEVEL" overflowed it on both sides, and where that overflow fell outside the frame it was
    // clipped outright, cutting off leading/trailing characters with no plate behind them at all).
    // Measure every label THIS stack will actually draw (revealedHops-gated, same filter the draw
    // loop below uses) at the bold/current font (the wider of the two weights — a safe upper bound
    // regardless of which row ends up "current"), and size the plate to the WIDEST of them, so every
    // row's white background genuinely covers its own text, no exceptions.
    ctx.save();
    ctx.font = '700 ' + (13 * k).toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
    var _measuredLabelW = 0;
    stack.hopsUp.forEach(function (h_, i) {
      if (i >= stack.revealedHops) return;
      var lbl = h_.cls + ' · ' + h_.storey + ' · hop ' + (i + 1) + '/' + stack.hopsUp.length;
      var mw = ctx.measureText(lbl).width;
      if (mw > _measuredLabelW) _measuredLabelW = mw;
    });
    ctx.restore();
    var _labelPadX = Math.round(16 * k);
    var labelWAuto = Math.max(60, Math.round(_measuredLabelW + _labelPadX * 2));
    var layout, column, hudClear = true;
    if (window.__lpLabelsNaive) {
      layout = _naiveLayout(hopScreens, labelWAuto, Math.max(14, Math.round(h * 0.022)));
      column = (stackBoxPx.x0 + stackBoxPx.x1) / 2 < w / 2 ? 'right' : 'left';
      hudClear = _crossOverlapCount(layout, avoidRects) === 0;
    } else {
      var laddered = _ladderLayoutBesideStack(hopScreens, stackBoxPx, w, h, labelWAuto, null, avoidRects);
      layout = laddered.rows; column = laddered.column; hudClear = laddered.hudClear;
    }
    layout.forEach(function (row) {
      if (row.k >= stack.revealedHops) return;   // this layer's turn has not come yet
      var h_ = stack.hopsUp[row.k];
      var isCurrent = (row.k === stack.revealedHops - 1);
      ctx.save();
      // Locked spec 2026-09-17 (red1) item 3 — leader line goes yellow (was white/light-grey): a
      // real, legible warm yellow, not a garish pure #ffff00 — reads clearly against a black
      // backdrop and a white building either way. isCurrent keeps its own distinction via a brighter
      // shade AND the existing lineWidth split (both kept — belt and suspenders, minor either way).
      ctx.strokeStyle = isCurrent ? '#ffd83d' : '#f5c518';
      ctx.lineWidth = (isCurrent ? 2.2 : 1.4) * k;
      ctx.beginPath(); ctx.moveTo(row.px, row.py);
      ctx.lineTo(row.x + (row.x > row.px ? 0 : row.w), row.y + row.h / 2); ctx.stroke();
      var label = h_.cls + ' · ' + h_.storey + ' · hop ' + (row.k + 1) + '/' + stack.hopsUp.length;
      ctx.font = (isCurrent ? '700 ' : '600 ') + (13 * k).toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // FIX (2026-09-17, red1 direct correction — reversed from what shipped here, no written spec
      // entry existed to check it against): black text on a WHITE plate, not white text on a black
      // one. `row` is already sized exactly for this text by the ladder layout above (x/y/w/h) —
      // used directly, no re-measure. Opacity raised 50%->100% (red1, same day: "falling on black
      // anyway [during the hold] to be more legible" — nothing behind it a translucent plate would
      // need to show through).
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.fillStyle = isCurrent ? '#000000' : '#14181d';
      ctx.fillText(label, row.x + row.w / 2, row.y + row.h / 2);
      ctx.restore();
      if (A._hudLayoutRegister) A._hudLayoutRegister('loadpath.label.' + stackName + '.' + row.k, row.x, row.y, row.w, row.h);
    });
    if (A._loadPathMidHoldThisFrame && !_lpLabelsWitnessFiredThisHold[stackName]) {
      _lpLabelsWitnessFiredThisHold[stackName] = true;
      var overlaps = _rectsOverlapCount(layout);
      var minGap = _minVerticalGap(layout);
      var inFrame = _allRectsInFrame(layout, w, h);
      var ok = overlaps === 0 && inFrame && hudClear;
      console.log('§LOADPATH_LABELS stack=' + stackName + ' n=' + hopScreens.length + ' of=' + stack.hopsUp.length +
        ' column=' + column + ' x=' + (layout[0] ? Math.round(layout[0].x) : 0) +
        ' overlaps=' + overlaps + ' minGapPx=' + (minGap == null ? 'n/a' : minGap.toFixed(1)) +
        ' inFrame=' + inFrame + ' hudClear=' + hudClear + ' => ' + (ok ? 'PASS' : 'FAIL'));
    }
    return stackBoxPx;
  }

  // ══ §129.8 item 6 / ROUND 13 (2026-09-16) — INFO CARD DURING THE HOLD ══════════════════════════
  // Pure layout/text math, same "no THREE.js/DOM needed" convention every other exposed function in
  // this file uses — verbatim from the dry-run harness (scratchpad/test_loadpath_card.js), proven
  // there first (17 asserts) before landing here unchanged. Text is assembled ONLY from PICK/CHAIN/
  // HOLD data already computed (_lp.cursorAtEntry, A._resPanelProjectStart, hopsUp, pickItem) —
  // nothing new computed here.
  var _lpCardWitnessFired = false;   // reset per build/hold in A.loadPathBuild, alongside the labels flag
  // IfcColumn -> column, IfcWallStandardCase -> wall, IfcSlab -> slab. No new vocabulary — the SAME
  // `cls` field every hop already carries from _buildItems().
  function _shortClassLabel(cls) {
    var s = String(cls || '').replace(/^Ifc/, '');
    s = s.replace(/StandardCase$/, '');
    return s.toLowerCase();
  }
  // "Level 3 column" — storey + short class, for one hop.
  function _stackFragment(hop) {
    return hop.storey + ' ' + _shortClassLabel(hop.cls);
  }
  // "Near stack   5 layers · Level 3 column → Level 1 slab → ground" — top and bottom hop only
  // (never the full walk), K = the SAME layer count §LOADPATH_STACK's own step=j/K already prints.
  function _stackCardLine(label, stack) {
    var K = stack.hopsUp.length;
    var top = _stackFragment(stack.hopsUp[K - 1]);
    var bottom = _stackFragment(stack.hopsUp[0]);
    return label + ' stack   ' + K + ' layers · ' + top + ' → ' + bottom + ' → ground';
  }
  var MS_PER_DAY_CARD = 86400000;   // own local const — this file carries no projectStartMs of its own
  function _cardDayNumber(cursorMs, projectStartMs) {
    if (cursorMs == null || projectStartMs == null) return null;
    return Math.floor((cursorMs - projectStartMs) / MS_PER_DAY_CARD) + 1;
  }
  var CARD_FIXED_LINE = 'each layer rests on the one below it, as the 4D order built them';
  // info = { cursorEntry, projectStart, near: {hopsUp, pickItem}, far: {...}|null,
  //          wrongStackControl: bool, buildNearGuid, buildFarGuid }
  // Returns { lines: [...], nearGuid, farGuid } — farGuid is null when there is no far stack.
  function _cardAssemble(info) {
    var day = _cardDayNumber(info.cursorEntry, info.projectStart);
    var lines = [];
    lines.push('LOAD PATH ·' + (day != null ? ' day ' + day + ',' : '') + ' structure topped out');
    lines.push(_stackCardLine('Near', info.near));
    var farGuid = null;
    if (info.far) {
      lines.push(_stackCardLine('Far', info.far));
      farGuid = info.wrongStackControl ? info.buildFarGuid : info.far.pickItem.guid;
    }
    lines.push(CARD_FIXED_LINE);
    var nearGuid = info.wrongStackControl ? info.buildNearGuid : info.near.pickItem.guid;
    return { lines: lines, nearGuid: nearGuid, farGuid: farGuid };
  }
  // Fixed top-left placement, sized to fit the longest line — no avoidance search, unlike the
  // ladders. margin/pad/rowH are the SAME corner-inset convention every other HUD corner box already
  // uses (cpe_resource_panel.js's own `_box`: margin = round(h*0.028)), passed in here, never
  // hardcoded twice.
  function _cardRect(maxLineWidthPx, numLines, rowH, pad, margin) {
    return { x: margin, y: margin, w: maxLineWidthPx + pad * 2, h: numLines * rowH + pad * 2 };
  }
  // §LOADPATH_CARD's own geometry checks reuse the SAME cross-overlap/in-frame shape
  // _ladderLayoutBesideStack's own witness already uses (_crossOverlapCount/_allRectsInFrame),
  // scoped here to ONLY `loadpath.label.*` rects (the card is drawn while the rest of the HUD
  // registry is unregistered at alpha 0, per ROUND 12 item 3 — nothing else is live geometry to
  // avoid) — never a second, duplicated overlap/in-frame implementation.
  function _cardOverlapsLadders(rect, hudRects) {
    var ladderRects = (hudRects || []).filter(function (r) { return r.name && r.name.indexOf('loadpath.label.') === 0; });
    return _crossOverlapCount([rect], ladderRects);
  }
  function _cardInFrame(rect, w, h) { return _allRectsInFrame([rect], w, h); }
  // §LOADPATH_CARD lines=N rect=x,y,w,h inFrame=true overlaps=0 near=guid far=guid|none => PASS|FAIL
  // `drawnNearGuid`/`drawnFarGuid` are the ACTUALLY drawn stacks (_lp.pickItem.guid/_lp.far.pickItem.
  // guid) — checked against the assembled card's OWN nearGuid/farGuid regardless of any control,
  // which is what makes window.__lpCardWrongStack a real, falsifiable check rather than an
  // unverified label swap.
  function _cardWitness(assembled, rect, w, h, hudRects, drawnNearGuid, drawnFarGuid) {
    var inFrame = _cardInFrame(rect, w, h);
    var overlaps = _cardOverlapsLadders(rect, hudRects);
    var nearOk = assembled.nearGuid === drawnNearGuid;
    var farOk = drawnFarGuid != null ? (assembled.farGuid === drawnFarGuid) : (assembled.farGuid == null);
    var ok = inFrame && overlaps === 0 && nearOk && farOk;
    console.log('§LOADPATH_CARD lines=' + assembled.lines.length +
      ' rect=' + Math.round(rect.x) + ',' + Math.round(rect.y) + ',' + Math.round(rect.w) + ',' + Math.round(rect.h) +
      ' inFrame=' + inFrame + ' overlaps=' + overlaps +
      ' near=' + assembled.nearGuid + ' far=' + (assembled.farGuid || 'none') +
      ' => ' + (ok ? 'PASS' : 'FAIL'));
    return ok;
  }
  A._loadPathShortClassLabel = _shortClassLabel; A._loadPathStackFragment = _stackFragment;
  A._loadPathStackCardLine = _stackCardLine; A._loadPathCardDayNumber = _cardDayNumber;
  A._loadPathCardAssemble = _cardAssemble; A._loadPathCardRect = _cardRect;
  A._loadPathCardOverlapsLadders = _cardOverlapsLadders; A._loadPathCardInFrame = _cardInFrame;
  A._loadPathCardWitness = _cardWitness;

  // The actual 2D draw call — top-left, fades in with the first ladder and out with the HUD fade-in
  // (`cardAlpha = 1 - A._loadPathHudAlpha`, the SAME HUD_FADE_SEC curve mirrored, no new curve).
  // `window.__lpCardWrongStack=1` makes the TEXT name the BUILD-TIME PROBE pick instead of the live
  // re-pick (_lp.buildNearGuid/_lp.buildFarGuid, stashed in loadPathBuild) — the witness above always
  // compares against the REAL drawn guids regardless, so the control reliably FAILS when build and
  // live picks genuinely differ.
  // §129.30 (2026-09-18) — factored out of `_drawInfoCard` so `loadPathCompositeOntoCanvas` can know
  // the card's own rect BEFORE positioning the stack panel (which needs to avoid it), without a
  // second, independently-drifting copy of this same measurement.
  function _infoCardLayout(ctx, w, h, k) {
    var info = {
      cursorEntry: _lp.cursorAtEntry, projectStart: A._resPanelProjectStart,
      near: { hopsUp: _lp.hopsUp, pickItem: _lp.pickItem },
      far: _lp.far ? { hopsUp: _lp.far.hopsUp, pickItem: _lp.far.pickItem } : null,
      wrongStackControl: !!window.__lpCardWrongStack, buildNearGuid: _lp.buildNearGuid, buildFarGuid: _lp.buildFarGuid
    };
    var assembled = _cardAssemble(info);
    // §129.32 (2026-09-19, red1: "font size independent like the other HUDs from resolution change")
    // — was `Math.max(9, Math.round(17 * k))`, `k` capped at 1.6 — grew slower than every other HUD
    // (day counter: `Math.max(14, Math.round(h * 0.026))`, no ceiling at all), so the gap widened at
    // hi-res: this card fell visibly behind text sized directly off `h` right next to it. Same direct
    // `h`-fraction convention now, no `k` indirection, no ceiling — matches `cpe_day_counter.js`'s
    // own formula exactly, so this card scales at the SAME rate the rest of the HUD already does.
    // `pad`/`rowH`/the card's own rect (`_cardRect`, below) all derive from `fontPx`, so this one
    // number scales the whole plate proportionally, not just the text.
    // §HUD_SCALE (2026-09-19, red1: "too big in low res and too small in hi res") — the size
    // now comes from the ONE law in cinema_maxq.js, which lets the FRACTION of frame height
    // rise gently with resolution instead of holding constant. The 1080 anchor below is this
    // overlay's own previous constant, so nothing moves at 1080 and every overlay keeps its
    // tuned size RELATIVE to its neighbours. The fallback is the old formula verbatim, for a
    // page that loads this module without cinema_maxq.
    var fontPx = (window.__hudFontPx ? window.__hudFontPx(h, 0.026, 9) : Math.max(9, Math.round(h * 0.026)));
    var pad = Math.round(fontPx * 0.6), margin = Math.round(h * 0.028), rowH = Math.round(fontPx * 1.55);
    ctx.save();
    ctx.font = '600 ' + fontPx + 'px Segoe UI, system-ui, sans-serif';
    var maxLineWidthPx = 0;
    assembled.lines.forEach(function (l) { maxLineWidthPx = Math.max(maxLineWidthPx, ctx.measureText(l).width); });
    ctx.restore();
    var rect = _cardRect(maxLineWidthPx, assembled.lines.length, rowH, pad, margin);
    return { assembled: assembled, rect: rect, fontPx: fontPx, pad: pad, rowH: rowH };
  }
  function _drawInfoCard(ctx, w, h, k, layout) {
    // §129.29 (2026-09-18, code review after §129.27) — was `1 - A._loadPathHudAlpha`, INVERTED:
    // that made the card blank whenever HUD is near-normal (hudAlpha near 1) — right at arm before
    // the HUD fade-out has progressed, and right before release once the front-loaded fade-in
    // finishes — while showing it only near HUD's minimum, mid-hold. Per the RECONCILIATION ruling
    // (§129.12), this card is PART OF THE FROZEN SCENE, same as the ladder panel just below it,
    // which already draws unconditionally with no HUD-alpha gate at all. The caller
    // (`A.loadPathCompositeOntoCanvas`) already restricts this whole draw pass to `_lp.showLadder`
    // — no separate alpha needed here.
    layout = layout || _infoCardLayout(ctx, w, h, k);
    var assembled = layout.assembled, rect = layout.rect, pad = layout.pad, rowH = layout.rowH;
    ctx.save();
    // FIX (2026-09-17, red1: "Freeze info panel is not even following the label schema just given")
    // — same schema as the ladder labels: black text on a WHITE plate (100% opaque, same "falling on
    // black anyway" reasoning as the ladder labels above). Was using the shared `A.cpePanelPlate` (a
    // dark-glass panel tuned for the REST of the HUD, left untouched here on purpose — changing it
    // would affect unrelated panels) with near-white text, the same reversed scheme fixed once for
    // the ladder and missed here.
    var rr = Math.round(rect.h * 0.09);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, rr); ctx.fill(); }
    else ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    // §129.39 (2026-09-19, red1 on a 1080p frame: "its text is still too small") — THIS FUNCTION
    // NEVER SET ctx.font. `_infoCardLayout` sets it, measures the lines with it, and then hands the
    // context back through its OWN ctx.restore() — so every fillText below ran at the canvas 2D
    // default, `10px sans-serif`, on every frame this card has ever drawn.
    // That is why §129.32 looked like it did nothing: it changed the formula from `17*k` to
    // `h*0.026`, the PLATE grew with it (rect is derived from fontPx), and the TEXT did not move,
    // because the text was never sized by that number in the first place. Measured on the delivered
    // 1920x1080 film: a 913x163 plate — the right size for 28px — carrying ~10px glyphs.
    // One line. The size is `layout.fontPx`, the same number the plate was measured with, so the
    // two can no longer disagree.
    ctx.font = '600 ' + layout.fontPx + 'px Segoe UI, system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    assembled.lines.forEach(function (l, i) {
      var ly = rect.y + pad + rowH * i + rowH / 2, lx = rect.x + pad;
      ctx.fillStyle = '#14181d';
      ctx.fillText(l, lx, ly);
    });
    ctx.restore();
    if (A._hudLayoutRegister) A._hudLayoutRegister('loadpath.card', rect.x, rect.y, rect.w, rect.h);
    if (A._loadPathMidHoldThisFrame && !_lpCardWitnessFired) {
      _lpCardWitnessFired = true;
      var drawnNearGuid = _lp.pickItem ? _lp.pickItem.guid : null;
      var drawnFarGuid = _lp.far ? _lp.far.pickItem.guid : null;
      _cardWitness(assembled, rect, w, h, A._hudLayoutRects || [], drawnNearGuid, drawnFarGuid);
    }
  }
  A._loadPathDrawInfoCard = _drawInfoCard;

  A.loadPathCompositeOntoCanvas = function (ctx, w, h, filmSec) {
    try {
      if (!_lp || !_lp.ok || !_lp.showLadder || !A.camera || typeof THREE === 'undefined') return;
      // §129.36 (2026-09-19, red1: "the label sizes are constant such that when hi res the freeze
      // text does not look diminished ... that goes for the rest") — the 1.6 CEILING was the bug.
      // `k` is the panel/ladder's own size scale (13px at the h=900 it was drawn against). Clamped
      // to 1.6 it stopped growing above h=1440, so the text held a SHRINKING share of the frame as
      // resolution rose: 1.48% of frame height at 1080, 0.97% at 2160, against the 2.6% the day
      // counter and the info card hold at EVERY resolution (`Math.round(h * 0.026)`, no ceiling).
      // Now a straight proportion, the convention every other bake overlay in this viewer already
      // follows (day counter 0.026, sun readout 0.020, sun clock 0.014 — all direct `h` fractions,
      // none capped). h=900 and h=1080 are unchanged to the pixel, so the look red1 has already
      // signed off does not move; only hi-res stops shrinking and 4K gets 31px instead of 21px.
      // The 0.6 FLOOR is gone with it — a floor is the same defect pointing the other way.
      // (The per-font `Math.max(9, ...)` legibility floors below still hold under ~623px height,
      // which is test-clip territory only; every delivered resolution is above it.)
      var k = h / 900;
      // §129.8 item 4b — the ARM-frame HUD snapshot, never the live (now hold-suppressed) registry
      // — same source of truth the underHud test uses.
      var avoidRects = _lp.armHudRects || A._hudLayoutRects || [];
      // §129.21/§129.23 — the ladder's own leader-line-to-3D-anchor placement (`_drawStackLadder`,
      // kept defined below but no longer called) is REPLACED by a fixed-position HUD list panel per
      // stack, growing upward from a fixed BOTTOM anchor (bottom-up row order, §129.23) — so each
      // stack's own anchor is reserved from its FULL hop count (`_stackInfoPanelMaxH`), not its
      // current `revealed` count, and never shifts as more hops reveal mid-hold. FAR's reserved
      // block sits above NEAR's, same "far drawn first" order the ladder used.
      var topMargin = Math.round(h * 0.028), stackGap = Math.round(h * 0.014);
      // §129.30 — computed BEFORE the stack panels so their own avoidance nudge can see it; reused
      // (never recomputed) by `_drawInfoCard` below, single source of truth for the card's rect.
      var cardLayout = _infoCardLayout(ctx, w, h, k);
      var nearMaxH = _stackInfoPanelMaxH(h, _lp);
      var nearBottomY = topMargin + nearMaxH;
      var farPanelBox = null;
      if (_lp.far) {
        var farMaxH = _stackInfoPanelMaxH(h, _lp.far);
        var farBottomY = topMargin + farMaxH;
        farPanelBox = _drawStackInfoPanel(ctx, w, h, k, _lp.far, 'far', farBottomY, cardLayout.rect);
        nearBottomY = farBottomY + stackGap + nearMaxH;
      }
      var nearPanelBox = _drawStackInfoPanel(ctx, w, h, k, _lp, 'near', nearBottomY, cardLayout.rect);
      if (A._loadPathMidHoldThisFrame && !_lpLabelsWitnessFiredThisHold.near) {
        _lpLabelsWitnessFiredThisHold.near = true;
        var _revealedN = _lp.revealedHops || 0;
        var _inFrameN = !nearPanelBox || (nearPanelBox.x0 >= 0 && nearPanelBox.y0 >= 0 && nearPanelBox.x1 <= w && nearPanelBox.y1 <= h);
        console.log('§LOADPATH_INFOPANEL stack=near revealed=' + _revealedN + '/' + _lp.hopsUp.length +
          ' inFrame=' + _inFrameN + ' => ' + (_revealedN > 0 && !_inFrameN ? 'FAIL' : (_revealedN === 0 ? 'INCONCLUSIVE reason=nothing-revealed-yet' : 'PASS')));
      }
      // ROUND 14 (2026-09-16, real HHS R13 bake: NO §LOADPATH_CARD line at all) — `_drawInfoCard`
      // was defined in ROUND 13 but never actually WIRED into this composite pass. Fixed: called
      // here, same frame as the ladders, so it draws/witnesses for whatever `_lp.hopsUp`/`_lp.
      // pickItem` is ACTUALLY drawn (fallback included), never `picked.near` from the arm block.
      _drawInfoCard(ctx, w, h, k, cardLayout);
    } catch (e) { if (!A._loadPathDrawWarned) { A._loadPathDrawWarned = true; _err('DRAW', e); } }
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  A.loadPathDispose = function () {
    try { _forceRestore(); } catch (e) {}
    _lp = null; A._loadPathWindow = null;
  };

  console.log('§LOADPATH_INIT wired gate=measure (§129.1 v8b — camera holds at arm pose, no cut; ' +
    'hold-point searched forward from topout; pick/chain/visible(clip+clones)/framing/hold/restore; ' +
    'controls: window.__lpBreakSupport, window.__lpSkipRestore, window.__lpHideRest, window.__lpFrameOff, window.__lpClipAll)');
}
if (typeof window !== 'undefined') window.setupCpeLoadPath = setupCpeLoadPath;
if (typeof module !== 'undefined' && module.exports) module.exports = setupCpeLoadPath;
