// cpe_load_path family — part `chain` (original cpe_load_path.js lines 49–1148).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/cpe_load_path.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as LPS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts = (typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts || {};
(typeof window !== 'undefined' ? window : globalThis).__cpeLoadPathParts.chain = function* __split_cpe_load_path_chain(LPS, A) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  LPS._lookGhost = _lookGhost;
  LPS._err = _err;
  LPS._buildItems = _buildItems;
  LPS._resolveChainInfo = _resolveChainInfo;
  LPS._chainStoreySpan = _chainStoreySpan;
  LPS._chainDrawnInfo = _chainDrawnInfo;
  LPS._printChainWitness = _printChainWitness;
  LPS._pick = _pick;
  LPS._rankValid = _rankValid;
  LPS._hexForHop = _hexForHop;
  LPS._buildChainClones = _buildChainClones;
  LPS._fetchHopScheduleCost = _fetchHopScheduleCost;
  LPS._disposeChainClones = _disposeChainClones;
  LPS._clonesWitness = _clonesWitness;
  LPS._applyGhost = _applyGhost;
  LPS._restoreGhost = _restoreGhost;
  LPS._applyWhiten = _applyWhiten;
  LPS._buildBatchedElementClones = _buildBatchedElementClones;
  LPS._unhideStackOnly = _unhideStackOnly;
  LPS._cullBatchedClonesToView = _cullBatchedClonesToView;
  LPS._restoreBatchedElementClones = _restoreBatchedElementClones;
  LPS._buildCutCap = _buildCutCap;
  LPS._updateCapPlane = _updateCapPlane;
  LPS._restoreCutCap = _restoreCutCap;
  LPS._restoreWhiten = _restoreWhiten;
  LPS._isSolid = _isSolid;
  LPS._visibleWitness = _visibleWitness;
  Object.defineProperty(LPS, 'HOLD_CAP_SEC', { get: function () { return HOLD_CAP_SEC; }, set: function (v) { HOLD_CAP_SEC = v; }, enumerable: true });
  Object.defineProperty(LPS, 'GLOW_SEC', { get: function () { return GLOW_SEC; }, set: function (v) { GLOW_SEC = v; }, enumerable: true });
  Object.defineProperty(LPS, 'GHOST_OPACITY', { get: function () { return GHOST_OPACITY; }, set: function (v) { GHOST_OPACITY = v; }, enumerable: true });
  Object.defineProperty(LPS, 'BACKDROP_FADE_SEC', { get: function () { return BACKDROP_FADE_SEC; }, set: function (v) { BACKDROP_FADE_SEC = v; }, enumerable: true });
  Object.defineProperty(LPS, 'CONCRETE_GREY_HEX', { get: function () { return CONCRETE_GREY_HEX; }, set: function (v) { CONCRETE_GREY_HEX = v; }, enumerable: true });
  Object.defineProperty(LPS, 'SHOT_THRESHOLD', { get: function () { return SHOT_THRESHOLD; }, set: function (v) { SHOT_THRESHOLD = v; }, enumerable: true });
  Object.defineProperty(LPS, 'SHOT_SAMPLES', { get: function () { return SHOT_SAMPLES; }, set: function (v) { SHOT_SAMPLES = v; }, enumerable: true });
  Object.defineProperty(LPS, 'SCORE_TOP_N', { get: function () { return SCORE_TOP_N; }, set: function (v) { SCORE_TOP_N = v; }, enumerable: true });
  Object.defineProperty(LPS, 'RAYCAST_INSTANCE_BUDGET', { get: function () { return RAYCAST_INSTANCE_BUDGET; }, set: function (v) { RAYCAST_INSTANCE_BUDGET = v; }, enumerable: true });
  Object.defineProperty(LPS, '_lp', { get: function () { return _lp; }, set: function (v) { _lp = v; }, enumerable: true });
  Object.defineProperty(LPS, '_ghostTouched', { get: function () { return _ghostTouched; }, set: function (v) { _ghostTouched = v; }, enumerable: true });
  Object.defineProperty(LPS, '_whitenTouched', { get: function () { return _whitenTouched; }, set: function (v) { _whitenTouched = v; }, enumerable: true });
  Object.defineProperty(LPS, '_whitenInstColor', { get: function () { return _whitenInstColor; }, set: function (v) { _whitenInstColor = v; }, enumerable: true });
  Object.defineProperty(LPS, '_whitenColorPairs', { get: function () { return _whitenColorPairs; }, set: function (v) { _whitenColorPairs = v; }, enumerable: true });
  Object.defineProperty(LPS, '_whitenTmpColor', { get: function () { return _whitenTmpColor; }, set: function (v) { _whitenTmpColor = v; }, enumerable: true });
  Object.defineProperty(LPS, '_capMeshes', { get: function () { return _capMeshes; }, set: function (v) { _capMeshes = v; }, enumerable: true });
  Object.defineProperty(LPS, '_capPlaneMesh', { get: function () { return _capPlaneMesh; }, set: function (v) { _capPlaneMesh = v; }, enumerable: true });
  Object.defineProperty(LPS, '_lpStackOnlyHidden', { get: function () { return _lpStackOnlyHidden; }, set: function (v) { _lpStackOnlyHidden = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


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
        var ov = (SA.civilRuleFor && SA.civilRuleFor(A.db, r[0])) || SA.matchNameOverride(cls, name, NO);   // §CIVIL_PHASE
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
  A._loadPathResolveChainInfo = _resolveChainInfo; A._loadPathMemberPxHeight = LPS._memberPxHeight;

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
      var src = LPS._sourceInstance(h.guid);
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
      h._srcWorldMatrix = src.world; h._srcLocalBox = LPS._sourceLocalBox(src.mesh, src.index);
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
    var allElse = (typeof Set !== 'undefined') ? new Set(LPS._allElseObjects()) : null;
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
        if (!LPS._revInstanceIndex) LPS._buildReverseIndexes();
        var slotMap = LPS._revInstanceIndex[obj.id];
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
        var bSlotMap = LPS._revBatchIndex[obj.id];
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
            try { if (obj.getBoundingBoxAt) { var _lb = obj.getBoundingBoxAt(geomId, new THREE.Box3()); if (_lb && !_lb.isEmpty()) m.userData._lpBox = _lb.applyMatrix4(tmpMat); } } catch (eBB) {}   // §LOADPATH_VIEW_CULL
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
        var iSlotMap = LPS._revInstanceIndex[obj.id];
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
            try { if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox(); if (obj.geometry.boundingBox) m2.userData._lpBox = obj.geometry.boundingBox.clone().applyMatrix4(tmpMat); } catch (eBB2) {}   // §LOADPATH_VIEW_CULL
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
  // ══ §LOADPATH_VIEW_CULL (2026-10-01, red1: "It is a black screen mostly … can't it not occlude or avoid doing that?") ══
  // The un-packed pieces above are frustumCulled=false (their geometry is the container's WHOLE shared buffer, so three.js's own
  // bounds test would be meaningless), so every freeze render drew all ~63k of them: §FRAME_COST i=86 held=73797 inFrustum=18856.
  // The freeze camera is fixed (hard freeze), so the in-view set is decided ONCE at arm from each piece's own world box. Off-view
  // pieces move to LP_OFFVIEW_LAYER: the film camera (TAA / AO / bounce all render through it) skips them; every shadow-casting
  // light's shadow camera enables that layer, so an off-screen piece still casts its shadow into the frame. No piece is removed;
  // pieces without a box stay on layer 0 (drawn, as before). Restored with the clones.
  var LP_OFFVIEW_LAYER = 29, _lpCullLights = [];
  var _lpStackOnlyHidden = [];
  function _unhideStackOnly() { var n = _lpStackOnlyHidden.length; _lpStackOnlyHidden.forEach(function (o) { o.visible = true; }); _lpStackOnlyHidden = []; A._lpStackOnly = false;
    if (n) console.log('§LOADPATH_STACK_ONLY_RESTORE shown=' + n); return n; }
  function _cullBatchedClonesToView() {
    if (typeof THREE === 'undefined' || !A.camera || !_batchedClones.length) return null;
    var t0 = performance.now(), cam = A.camera; cam.updateMatrixWorld();
    var fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    var inV = 0, off = 0, noBox = 0;
    _batchedClones.forEach(function (m) {
      var b = m.userData._lpBox;
      if (!b) { noBox++; return; }
      if (fr.intersectsBox(b)) { inV++; return; }
      m.layers.set(LP_OFFVIEW_LAYER); off++;
    });
    _lpCullLights = [];
    if (off) A.scene.traverse(function (o) { if (o.isLight && o.castShadow && o.shadow && o.shadow.camera && !o.shadow.camera.layers.isEnabled(LP_OFFVIEW_LAYER)) { o.shadow.camera.layers.enable(LP_OFFVIEW_LAYER); _lpCullLights.push(o); } });
    var r = { pieces: _batchedClones.length, inView: inV, offView: off, noBox: noBox, shadowLights: _lpCullLights.length, ms: Math.round(performance.now() - t0) };
    console.log('§LOADPATH_VIEW_CULL pieces=' + r.pieces + ' inView=' + inV + ' offView=' + off + ' noBox=' + noBox + ' shadowLightsSeeingThem=' + r.shadowLights + ' ms=' + r.ms +
      ' (off-view pieces skipped by the film camera, still in every shadow map; &lpcull=0 = draw all as before)');
    return r;
  }
  function _uncullLights() { _lpCullLights.forEach(function (o) { try { o.shadow.camera.layers.disable(LP_OFFVIEW_LAYER); } catch (e) {} }); _lpCullLights = []; }
  function _restoreBatchedElementClones() {
    var n = _batchedClones.length;
    _batchedClones.forEach(function (m) { A.scene.remove(m); m.geometry.dispose(); });
    _batchedClones = []; _uncullLights();   // §LOADPATH_VIEW_CULL
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
};
