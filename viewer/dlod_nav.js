/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// dlod_nav.js — Implementing FLY_TOUR_DLOD_SCALE.md §9 (v1) — Witnesses: W-DLOD-NAV-EQUIV,
// W-DLOD-NAV-PROXY, W-DLOD-NAV-PERF, W-DLOD-NAV-NO-REBUILD.
// §ROOM_OCCL step 1 — Implementing FLY_TOUR_DLOD_SCALE.md §13 — Witnesses: W-ROOM-OCCL-EQUIV,
// W-ROOM-OCCL-PROXY, W-ROOM-OCCL-PERF, W-ROOM-OCCL-STABILITY. Room-mismatch (camera's current
// room ≠ element's contained room) as a THIRD OR'd demote criterion in the same _boxIndex state
// machine; live point-in-rect current-room test with the walker's floor-anchor Z-join; N-eval
// membership-stability gate; interior legs only. window.__dlodNav.roomOcclEnabled — DEFAULT
// TRUE as of §18/§19 (2026-07-23): PROMOTE/DEMOTE tightened (below) on the condition the camera's
// own current room stays solid regardless of distance, which needs this criterion always live, not
// console-only. Flip to false for the old §9-only distance/frustum behavior.
// §ROOM_OCCL step 2 (portal/PVS) — Implementing FLY_TOUR_DLOD_SCALE.md §16 — Witnesses:
// W-PVS-EQUIV, W-PVS-CORRECT, W-PVS-STABILITY, W-PVS-PERF. window.__dlodNav.pvsEnabled (default
// false) REPLACES the plain room-equality mismatch test with room-graph-derived visible-room-set
// membership (common/room_graph.js's buildRoomPVS) when true; false ⇒ behavior identical to the
// shipped §13 mechanism (this flag is a pure superset gated behind its OWN lever, never implied by
// roomOcclEnabled alone — §13's own EQUIV/PROXY/STABILITY witnesses stay valid unchanged).
// §ROOM_OCCL step 3 (hierarchical GPU occlusion) — Implementing FLY_TOUR_DLOD_SCALE.md §17.2-17.4
// — Witnesses: W-OCCL-BVH-EQUIV, W-OCCL-BVH-CORRECT, W-OCCL-BVH-STABILITY, W-OCCL-BVH-PERF.
// window.__dlodNav.occlBvhEnabled (default false) adds a FOURTH OR'd demote criterion: an
// in-memory median-split BVH over element AABBs (§17.2, built sync once per building — measured
// 312ms build over the real 122,330-element set, §17.9 decision 1) traversed top-down with async
// WebGL2 occlusion queries (§17.3, ANY_SAMPLES_PASSED_CONSERVATIVE on each visited node's AABB
// proxy, depth-tested against the already-rendered frame; hidden ⇒ whole subtree demoted, no
// descent; visible ⇒ descend on a later cycle), round-robined across frames with a per-node
// result HOLD window (§17.4). COMPOSES with §16's PVS per §17.9 decision 3 — roomMis runs as the
// free first filter, occlMis is a plain further OR. false ⇒ behavior identical to shipped §13+§16.
// §17.16 supersedes this with a structural-occluder decouple (see occlStructEnabled below);
// §17.2-17.4 stays in the tree, gated off, until §17.16's own witnesses retire it.
// §20 — FLY_TOUR_DLOD_SCALE.md §20: adaptive mesh-budget distance boost, a FIFTH mechanism
// layered on the same PROMOTE_DIST/DEMOTE_DIST thresholds these criteria are evaluated against
// (widens them under an active-count watermark controller — see budgetBoostEnabled below). Its own
// §20.1 cross-track safeguard requires the controller's active-count read to reflect the
// distance/frustum/room population BEFORE occlusion pruning — see _passEligible/_stats.activeElig.
//
// Nav-scope DLOD box-proxy: during free orbit/pan and Fly Tour on large buildings (>50k
// elements), far/out-of-frustum elements render as wireframe boxes (TM_DLOD_SCALE.md §9's
// established proxy look), real mesh otherwise. SIBLING of time_machine.js's TM-only DLOD —
// reuses the PATTERN, shares NO state with it (four prior retractions all involved coupled
// visibility systems; mutual exclusion instead: this module disengages whenever TM is open).
//
// §8 FINDINGS combo (measured, both SwiftShader + RTX 4060): hysteresis (promote ≤50m in-frustum,
// demote >80m or 5m-outside-frustum) + 10-frame overlay-hoist cross-fade + depthWrite:false on
// fading materials. Overlay-hoist (§8 ADDENDUM B) because BatchedMesh has no per-instance alpha
// on r185 — hide slot + same-frame standalone copy measured pixel-identical.
//
// ENGAGE GATE (§9; any failure ⇒ full disengage+restore): pill ON, >50k elements, !streaming,
// !TM (_tmOn), !Find isolation (activeGuidFilter — §3 USER-DICTATED scope), !storey/disc filter,
// !Cinema (_cinemaOrbitActive/_maxqActive), !Photoreal still (_stillRefineActive).
(function () {
  'use strict';

  function A() { return window.APP || window.A; }

  var NAV_MIN_ELEMENTS = 50000;    // LARGE_BUILDING, time_machine.js:471 — same proven gate
  // §19 (2026-07-23, user: "tightening distances OK as long as in-room remain solid" — §18
  // measured ~4.5→~8.4fps mean at the §8 band, full-ghost ceiling ~13.4fps): tightened from
  // 50/80 now that _wantedReal has a same-room-as-camera bypass (below) protecting whatever room
  // the camera is actually in from distance demotion regardless of these numbers.
  var PROMOTE_DIST = 38, DEMOTE_DIST = 60;
  var PROMOTE_SQ = PROMOTE_DIST * PROMOTE_DIST, DEMOTE_SQ = DEMOTE_DIST * DEMOTE_DIST;
  var FRUSTUM_MARGIN = 5;          // §9: angular hysteresis — must be 5m OUTSIDE frustum to demote
  var FADE_FRAMES = 10;            // §8 FINDINGS #4: N=10 sufficed; 5 and 20 both worse
  var FADE_CAP = 128;              // §9: transitions beyond cap SNAP (= shipped TM-DLOD behavior)
                                   // (a per-frame TRANSITION_BUDGET was tried 2026-07-21 and
                                   // MEASURED WORSE — throttling convergence left the scene
                                   // half-real through the demote wave, draw calls 3245→7984,
                                   // sweep mean 19.9→92.5ms. Transitions are not the flight
                                   // bottleneck; do not re-add without new numbers.)
  var EVAL_CHUNK = 16384;          // §FLY_SMOOTH (2026-07-21 user "still lagging in flight"):
                                   // one monolithic 122k-element eval measured 42ms/hit at a
                                   // 150ms cadence = 28% main-thread duty cycle + 7k-transition
                                   // bursts per hit (473k snaps/600 flight frames). The scan is
                                   // now CHUNKED — ~16k elements per rAF tick (~3-4ms), a full
                                   // pass every ~8 frames — same partition, amortized cost,
                                   // transition bursts spread across frames.
  var DEPTH_MAX_RADIUS = 25;       // §9 shine-thru fix: no depth pass for oversized bboxes — a
                                   // giant slab's invisible occluder would erase REAL nearby
                                   // geometry (center-distance ≠ bbox extent); wireframe-only there
  // §20 (2026-07-24) adaptive mesh-budget distance boost. Real sweep on LTU_AHouse (RTX 4060,
  // headless hardware-GL, witness/w_budget_perf.log — real frame_ms at a fixed aerial pose with
  // forceBoost pinned across 11 values, active count 46→43,422): the ~16.6-16.7ms fully-boxed
  // floor (matches §10's 17.3ms) holds flat through ~3,700 active, is still only +9% at 7,795
  // (18.1ms), but is ALREADY +33% by 11,094 (22.2ms) and +65% by 15,616 (27.5ms) — the real knee
  // sits around 10-12k active, notably EARLIER than the 20k figure floated in conversation
  // (§20.2's own warning, confirmed: that figure was not measured). Watermarks placed with
  // margin on both sides of the real knee, not at its edge:
  var BUDGET_LOW = 6000;           // comfortably below the +9%-at-7,795 point — genuine headroom
  var BUDGET_HIGH = 12000;         // just past the +33% mark, before the steeper +65%/+90% climb
                                    // at 15,616/20,001 — decrements before the expensive zone
  var BUDGET_STEP = 2;             // meters per eval cycle (150ms throttle) — slow ramp, no pop;
                                    // ≈500-750 active elements/meter in the transition zone per
                                    // the sweep, so one step moves the count by roughly 1,000-1,500
  var MAX_BOOST = 60;              // meters (PROMOTE 38→98, DEMOTE 60→120 at full boost) — the
                                    // sweep's own boost=60 point (active=20,001, 31.6ms, ~1.9x
                                    // floor) is where BUDGET_HIGH's decrement would already be
                                    // firing; capped here as a sanity ceiling, not the primary
                                    // safety valve (BUDGET_HIGH's count-based decrement is)
  var ROOM_STABLE_N = 12;          // §13 membership-stability gate (§11.2 Q4: 10-15 frames —
                                   // filters all 17 measured A→B→A flaps at ~0.2s switch latency,
                                   // well under the 500ms median room dwell)
  var OCCL_LEAF_SIZE = 4;          // §17.2: small leaf — object-grain culling floor (POC §17.11
                                   // proved object-grain demotion is what moves frame_ms)
  var OCCL_HOLD = FADE_FRAMES;     // §17.4: per-node result reuse window before re-query — start
                                   // from the SAME tuned FADE_FRAMES=10 constant, not a new number
  var OCCL_QUERY_BUDGET = 64;      // §17.4 round-robin: max occlusion queries ISSUED per frame
                                   // ("chunk" = N visited nodes/frame, tree analogue of EVAL_CHUNK)
  var OCCL_CAM_MARGIN = 1.0;       // camera inside (node AABB + margin) ⇒ unconditionally visible,
                                   // never queried — an inside-the-box proxy can rasterize 0 samples
                                   // (faces behind/clipped) and would FALSE-HIDE the camera's own
                                   // surroundings; §17.5 pitfall 2's by-construction guard
  var OCCL_MAX_HIDE_DIAG = 30;     // §17.14 (FLY_TOUR_DLOD_SCALE.md): root-cause fix for §17.12/
                                   // §17.13's 31.48% false-hide rate — a coarse node's AABB diagonal
                                   // must be small enough that "hidden" (0 samples) is a plausible
                                   // verdict for its WHOLE subtree, not just a screen-space accident
                                   // of a huge, mostly-empty box. §17.13 measured LTU_AHouse's root
                                   // at 514m diag, its own children still 289-408m — building-scale,
                                   // never trustworthy as a single occluder proxy. 30m matches this
                                   // codebase's OWN existing "oversized proxy" sense of scale
                                   // (DEPTH_MAX_RADIUS=25 above, §9's giant-slab depth-pass exclusion
                                   // — a comparable single-room/small-structure order of magnitude),
                                   // not an arbitrary new number. A node above this diag NEVER gets
                                   // its "hidden" query result trusted/acted on — see
                                   // _occlIssueQueries: it is force-descended into its children
                                   // instead (or, if a leaf, left permanently visible — safe/
                                   // conservative direction, §17.5 pitfall 2), so only nodes that are
                                   // actually small enough to be a valid single-occluder proxy ever
                                   // cull their subtree. Measured depth/diag distribution logged once
                                   // per BVH build at §OCCL_BVH_BUILD_OVERSIZED above the count().

  // §17.16 — FLY_TOUR_DLOD_SCALE.md §17.16: structural occluder decouple (replaces §17.2-17.4's
  // whole-building-BVH occlusion path; see occlStructEnabled below). Sandbox POC (§17.16.9) already
  // proved this mechanism on real LTU_AHouse data/schema (witness/sandbox_occl_struct_1_2.js,
  // witness/sandbox_occl_struct_3_4.js, both worktree-local, not committed) — ports that proven
  // logic here, hardened with caching + real DLOD-layer integration.
  var OCCL_STRUCT_CLASSES = ['IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcRoof'];
                                    // §17.16.1: real ifc_class selection, MEASURED not assumed —
                                    // sandbox §OCCL_STRUCT_SELECT_FINAL on real LTU_AHouse:
                                    // count=4103 (3.26% of 125,698 elements_meta rows), ARC=3527/
                                    // STR=576. IfcCovering (24,321 rows, obvious "ceiling" guess)
                                    // correctly EXCLUDED — §OCCL_STRUCT_COVERING_CHECK found it
                                    // 24,311/24,321 MEP pipe/duct insulation on this building, not
                                    // architectural ceiling (only 10 rows ARC).
  var OCCL_STRUCT_LEAF_SIZE = 8;   // §17.16.2 diagnostic BVH leaf size (sandbox measurement 2's own
                                    // constant) — NOT traversed at runtime (see _occStructPrepass:
                                    // sandbox measurement 3 proved a flat InstancedMesh render of the
                                    // whole ~4103-element set already costs 0.05-0.16ms/call, nowhere
                                    // near the 16.6ms budget — a runtime BVH-culled render of the
                                    // occluder set would be optimizing something already free;
                                    // "measure, don't assume" per 17.16.2/17.16.8's own discipline).
                                    // Built once, for the §OCCL_STRUCT_BVH_COMPARE log line only.
  var OCCL_STRUCT_QUERY_BUDGET = OCCL_QUERY_BUDGET; // §17.16.4: same round-robin discipline as §17.3
  var OCCL_STRUCT_HOLD = OCCL_HOLD;                 // reuse the same tuned hold window, not a new number
  var OCCL_STRUCT_V = 'v1';        // §17.16.6 cache version stamp (ROOM_WALKER_V convention) — bump
                                    // to invalidate every cached IndexedDB entry fleet-wide.

  var _pillOn = false;             // user toggle — OFF = this module does exactly nothing
  var _engaged = false;            // gate currently satisfied and proxy state applied
  var _rafId = null;
  var _boxIndex = null;            // guid → {mesh, idx, matrix, pos, radius, state:'real'|'box', boxVisible}
  var _boxMeshes = null;           // wireframe InstancedMesh per discipline (nav-owned set)
  var _boxBld = null;
  var _realIndex = null;           // guid → {kind:'mesh'|'inst'|'batch', obj, idx|slotId, meta}
  var _fades = [];                 // active transitions
  var _unitBox = null, _zeroM = null, _frustum = null, _psm = null, _sphere = null, _m4 = null;
  var _lastCamSig = null;
  var _guidArr = null, _evalCursor = 0, _scanPending = false; // §FLY_SMOOTH: chunked-scan state
  var _passReal = 0, _passBoxed = 0; // partition counters accumulated across a pass
  // §20 cross-track safeguard (FLY_TOUR_DLOD_SCALE.md §20.1): pre-occlusion eligible count,
  // published to _stats.activeElig at pass-complete — see _budgetControl's own header comment.
  var _passEligible = 0;
  var _logAccStarted = 0, _lastLogT = 0; // 2026-07-21 user "remove history log spam": eval line ≤1 per 2s
  // §20 (2026-07-24) — persisted closed-loop distance-boost state. At 0 (shipped default, and
  // whenever budgetBoostEnabled is false) PROMOTE_DIST/DEMOTE_DIST are used completely unmodified
  // — byte-identical to §19 (W-BUDGET-EQUIV). forceBoost, when non-null, pins _budgetBoost for
  // witness use (sweep/delta) and disables the controller's own ramp/decay that cycle.
  var _budgetBoost = 0;
  var _appliedBoost = 0;           // effective boost baked into the CURRENT partition (change ⇒ rearm scan)
  var _lastBudgetT = 0;            // periodic-tick throttle clock (150ms — see _tick)
  var _passPromoteSq = 0, _passDemoteSq = 0; // effective thresholds, frozen per-pass (see _evalChunk)
  var _passBoostVal = 0;           // the boost value the CURRENTLY-COMPLETING pass was frozen at
  // §ROOM_OCCL state (§13) — live by default since §19; inert only if roomOcclEnabled is set false
  var _roomIdx = null, _roomIdxBld = null, _roomIdxTriedT = 0, _roomStampRef = null;
  var _roomCur = null, _roomPend, _roomPendN = 0, _roomActive = false, _roomEvals = 0;
  // §ROOM_OCCL step 2 (§16) — portal/PVS state, ALL inert unless _stats.pvsEnabled is flipped true
  var _pvs = null, _pvsBld = null, _pvsTriedT = 0;
  // §ROOM_OCCL step 3 (§17) — occl-BVH state, ALL inert unless _stats.occlBvhEnabled is flipped true
  var _bvh = null, _bvhBld = null;     // median-split BVH root (lazy, building-keyed like _pvsEnsure)
  var _occlHidden = null;              // guid → true: live hide-set maintained by the traversal
  var _occlCut = [];                   // active traversal frontier (vis/hid boundary nodes)
  var _occlCutIdx = 0, _occlCutDead = 0; // round-robin cursor + lazy-compaction counter
  var _occlPendingList = [];           // nodes with an ISSUED, not-yet-resolved GPU query
  var _occlTouched = [];               // nodes ever given query/state — reset list for disable/rebuild
  var _occlGl = null;                  // {ok, gl, prog, vao, uMin, uMax, uMVP} raw-GL query resources
  var _occlFrame = 0;                  // traversal frame counter (HOLD window bookkeeping)
  var _occlM4 = null;                  // scratch MVP for query-proxy rendering
  var _lastOcclEnabled = false;        // §17.11 lesson: lever flips must re-arm the scan themselves
  // §17.15 diagnostic (FLY_TOUR_DLOD_SCALE.md §17.15) — inert unless window.__dlodNav.occlDebugTrace
  // = true. _occlHiddenGen increments every time the hide-set ACTUALLY changes (any guid added or
  // removed by _markSubtree); _occlHiddenCount is a running count maintained incrementally (avoids
  // an O(hidden-set-size) for-in on every change). Each node stamps the generation/count/frame it
  // saw AT QUERY-ISSUE time; when a result resolves to a DIFFERENT verdict than the node's last one,
  // §OCCL_BVH_FLIP logs latency (frames between issue and resolve) and how much the world (hide-set)
  // moved during that window — the direct test for §17.15's hypotheses (a) self-referential depth
  // feedback and (b) async staleness.
  var _occlNodeId = 0, _occlHiddenGen = 0, _occlHiddenCount = 0;
  // §17.13 depth-prepass fix (FLY_TOUR_DLOD_SCALE.md §17.12 root-cause probe) — occlusion queries
  // must depth-test against REAL geometry only, never the box-proxy meshes _buildBoxes owns
  // (isDlodNavProxy/isDlodNavDepth InstancedMeshes). An offscreen WebGLRenderTarget, box meshes
  // hidden for the duration of ONE render() call, is the occluder source for queries instead of
  // "whatever the default framebuffer last held" — fully decoupled from the visible canvas, so the
  // real display frame (box proxies included) is never disturbed (no flicker risk by construction).
  var _occlDepthRT = null, _occlDepthMat = null;
  // §17.16 state — ALL inert unless _stats.occlStructEnabled is flipped true. Independent of every
  // §17.2-17.4 var above (no shared mutable state — the whole point of the pivot).
  var _occStruct = null, _occStructBld = null;   // {scene, mesh, rt, bvhRootDiag} — built once/building
  var _occStructLoading = false, _occStructTriedT = 0; // async (IDB) build in flight / retry throttle
  var _occ2Hidden = null;          // guid → true: live hide-set from the structural-occluder queries
  var _occStructFrame = 0;         // own frame counter (hold-window bookkeeping, independent of §17.3's)
  var _occStructCandBuf = null, _occStructCandGuids = null; // candidate accumulation (see _evalChunk)
  var _occStructCursor = 0;
  var _occStructPendingList = [];  // guids with an ISSUED, not-yet-resolved GPU query
  var _lastOcclStructEnabled = false;
  var _stats = { mutations: 0, active: 0, boxed: 0, fades: 0, snaps: 0, evalMs: 0,
    // §20 (2026-07-24) cross-track safeguard state: activeElig is the distance/frustum/room
    // population measured BEFORE occlusion pruning (§17.16.4's own candidate definition) — the
    // budget controller reads THIS, never post-occlusion `active`, so boost and occlusion stay
    // decoupled (FLY_TOUR_DLOD_SCALE.md §20.1's cross-track note). At boost=0 and both occlusion
    // levers off, activeElig === active exactly.
    activeElig: 0,
    // §19: default TRUE — see file-header note. Still live-flippable from the console
    // (window.__dlodNav.roomOcclEnabled = false) to fall back to plain distance/frustum.
    roomOcclEnabled: true, roomCur: null, roomLeg: false, roomEvals: 0, roomChanges: 0,
    roomIdxRects: 0, roomIdxStamped: 0,
    // §16 step-2 testing lever: same convention — console-only (window.__dlodNav.pvsEnabled =
    // true), independent of roomOcclEnabled's own default; false ⇒ §13's exact shipped behavior.
    pvsEnabled: false, pvsRooms: 0, pvsAvgVisible: 0,
    // §20 (2026-07-24) — console-only lever, same convention: false ⇒ §19's exact shipped
    // PROMOTE_DIST/DEMOTE_DIST behavior, byte-identical (W-BUDGET-EQUIV). forceBoost (null =
    // controller-driven) lets a witness pin the effective boost directly for a sweep/delta
    // measurement without waiting for the ramp to converge.
    budgetBoostEnabled: true, budgetBoost: 0, forceBoost: null,
    // §17 step-3 testing lever: same convention — console-only (window.__dlodNav.occlBvhEnabled =
    // true), independent of the §13/§16 levers; false ⇒ identical to shipped §13+§16 behavior.
    occlBvhEnabled: false, occlBvhNodes: 0, occlHidden: 0, occlCut: 0,
    occlQueriesIssued: 0, occlResultsRead: 0,
    // §17.15 diagnostic lever — console-only, default false, zero cost while off (guarded at each
    // call site below, never a hot-path branch when disabled beyond one boolean check).
    occlDebugTrace: false,
    // §17.15 — NEGATIVE RESULT, default false, own sub-lever so occlBvhEnabled=true ALONE stays
    // byte-identical to §17.14's already-measured (22.27% false-hide, still-oscillating) behavior.
    // See _occlForceHiddenRealVisible's own header comment: measured WORSE oscillation (genDelta/
    // hiddenCountDelta both up ~25-30%) AND ~130-172ms per depth-prepass call (≥8x the ~16.6ms
    // frame budget) — kept in the tree, gated off, as a documented dead end so a future attempt
    // doesn't re-walk this exact fix shape without knowing it was already tried and falsified.
    occlDepthDecoupleEnabled: false,
    // §17.16 step: same console-only convention (window.__dlodNav.occlStructEnabled = true),
    // independent of occlBvhEnabled — false ⇒ identical to shipped §13+§16 behavior. Once witnessed
    // (W-OCC2-*), this flips to default true and occlBvhEnabled's whole §17.2-17.4 machinery retires.
    occlStructEnabled: false, occlStructReady: false, occlStructCount: 0, occlStructRootDiag: 0,
    occlStructCandidates: 0, occlStructHidden: 0, occlStructQueriesIssued: 0, occlStructResultsRead: 0 };
  window.__dlodNav = _stats;

  // §20 — effective boost this pass: forceBoost (witness pin) wins outright; otherwise the
  // controller's own ramped value when enabled; 0 (shipped) when disabled.
  function _effBoost() {
    if (_stats.forceBoost !== null && _stats.forceBoost !== undefined) return _stats.forceBoost;
    if (_stats.budgetBoostEnabled !== true) return 0;
    return _budgetBoost;
  }

  // §20 closed-loop controller — called on the periodic 150ms budget-tick (below), driven off
  // the LAST PUBLISHED PRE-OCCLUSION count (_stats.activeElig, from the most recently completed
  // scan pass). §20.1's cross-track safeguard (added after occl-BVH/§17.16 shipped alongside this):
  // reading the post-occlusion `_stats.active` here would create a feedback loop — boost sees a
  // low count → widens distance → occlusion hides most of the new candidates anyway → count still
  // low → boost widens further, chasing a target occlusion keeps eating, unbounded. `activeElig`
  // is measured immediately after distance/frustum/room-mismatch, the same population §17.16.4
  // defines as occlusion's own query subjects, BEFORE occlMis prunes it — decoupling the two closed
  // loops. At boost=0 with both occlusion levers off, activeElig === active, so this is still
  // byte-identical to the pre-occlusion §20 behavior (W-BUDGET-EQUIV unaffected). Returns the
  // resulting effective boost. A forced boost (witness pin) short-circuits the ramp entirely — ramp
  // state (_budgetBoost) itself does not move while pinned, so releasing the pin resumes from
  // wherever it was, not 0.
  function _budgetControl() {
    if (_stats.forceBoost !== null && _stats.forceBoost !== undefined) { _stats.budgetBoost = _stats.forceBoost; return _stats.forceBoost; }
    if (_stats.budgetBoostEnabled !== true) { _budgetBoost = 0; _stats.budgetBoost = 0; return 0; }
    if (_stats.activeElig < BUDGET_LOW) _budgetBoost = Math.min(MAX_BOOST, _budgetBoost + BUDGET_STEP);
    else if (_stats.activeElig > BUDGET_HIGH) _budgetBoost = Math.max(0, _budgetBoost - BUDGET_STEP);
    // between watermarks: hold steady, no assignment — this dead band IS the hysteresis
    _stats.budgetBoost = _budgetBoost;
    return _budgetBoost;
  }

  function _gateBlockReason(app) {
    if (!app || !app.scene || !app.camera || typeof THREE === 'undefined') return 'no-app';
    if (!(app.activeBuildingTotal > NAV_MIN_ELEMENTS)) return 'small-building';
    if (app.streaming) return 'streaming';
    if (app._tmOn) return 'tm-open';                          // TM owns visibility when open
    if (app.activeGuidFilter) return 'find-isolation';        // §3 scope decision: full disengage
    if (app.activeStoreyFilter !== null && app.activeStoreyFilter !== undefined) return 'storey-filter';
    if (app.hiddenDiscs && app.hiddenDiscs.size > 0) return 'disc-filter';
    if (app._cinemaOrbitActive || app._maxqActive) return 'cinema';   // §3: Alt+C excluded
    if (app._stillRefineActive) return 'photoreal';                   // §3: Alt+P excluded
    return null;
  }

  // ── Box set + index (pattern: time_machine.js _dlodBuildBoxes, TM_DLOD_SCALE.md §9) ──
  function _buildBoxes(app) {
    if (_boxIndex && _boxBld === app.activeBuilding) return true;
    if (!app.dbQuery || !app.ifc2three) { console.log('§DLOD_NAV_BUILD_SKIP deps'); return false; }
    var t0 = performance.now(), rows;
    try {
      rows = app.dbQuery("SELECT t.guid, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z, m.discipline" +
        " FROM element_transforms t JOIN elements_meta m ON m.guid = t.guid WHERE t.center_x IS NOT NULL") || [];
    } catch (e) { console.log('§DLOD_NAV_BUILD_SKIP query ' + e.message); return false; }
    _disposeBoxes();
    var byDisc = {};
    for (var i = 0; i < rows.length; i++) { var d = rows[i][7] || '_'; (byDisc[d] = byDisc[d] || []).push(rows[i]); }
    var discs = Object.keys(byDisc);
    if (!discs.length) { console.log('§DLOD_NAV_BUILD_EMPTY rows=' + rows.length); return false; }
    if (!_unitBox) _unitBox = new THREE.BoxGeometry(1, 1, 1);
    if (!_zeroM) _zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
    var index = Object.create(null), meshes = [], total = 0;
    var m4 = new THREE.Matrix4(), _pos = new THREE.Vector3(), _scl = new THREE.Vector3(), _q = new THREE.Quaternion();
    for (var di = 0; di < discs.length; di++) {
      var disc = discs[di], drows = byDisc[disc];
      var color = (app.DISC_COLORS && app.DISC_COLORS[disc]) || app.DEFAULT_COLOR || 0x8899aa;
      // Wireframe look verbatim — feedback_no_fake_lod_unbreakable.md: boxes must read as proxy
      var mat = new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.4 });
      var im = new THREE.InstancedMesh(_unitBox, mat, drows.length);
      im.frustumCulled = false;
      im.userData.isBboxPlaceholder = true;  // proven pick-exclusion (picking.js:257)
      im.userData.isDlodNavProxy = true;     // nav-scope marker (vs isDlodTmProxy)
      // §9 addition (user: "bboxes must not shine thru"): paired depth-only pass — boxed masses
      // self-occlude, so interior boxes stop X-raying through boxed facades. Opaque pass
      // (transparent:false) ⇒ depth is laid down before the transparent wireframes render.
      var depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
      var imDepth = new THREE.InstancedMesh(_unitBox, depthMat, drows.length);
      imDepth.frustumCulled = false;
      imDepth.userData.isBboxPlaceholder = true;
      imDepth.userData.isDlodNavDepth = true;
      // NEVER registered in _instanceMeta/_batchMeta — landmine 1 (TM_DLOD_SCALE.md §5.1)
      for (var j = 0; j < drows.length; j++) {
        var r = drows[j], p = app.ifc2three(r[1], r[2], r[3]);
        var bx = r[4] || 0.3, by = r[5] || 0.3, bz = r[6] || 0.3;
        _pos.set(p.x, p.y, p.z);
        _scl.set(bx, bz, by); // axis swap matches _buildMergedGhost / TM box build
        m4.compose(_pos, _q, _scl);
        im.setMatrixAt(j, _zeroM);
        imDepth.setMatrixAt(j, _zeroM);
        // §17.2: real AABB half-extents stashed at the same build step (3 more floats vs sphere) —
        // Three.js WORLD space with the SAME bx/bz/by axis swap as _scl above (§17.2's named
        // coordinate-frame landmine: the BVH must live in the frame camPos/frustum already use).
        var hx = bx * 0.5, hy = bz * 0.5, hz = by * 0.5;
        index[r[0]] = { mesh: im, depthMesh: imDepth, idx: j, matrix: m4.clone(), pos: _pos.clone(),
          radius: Math.sqrt(bx * bx + by * by + bz * bz) * 0.5, state: 'real', boxVisible: false,
          minX: p.x - hx, minY: p.y - hy, minZ: p.z - hz,
          maxX: p.x + hx, maxY: p.y + hy, maxZ: p.z + hz };
        total++;
      }
      im.instanceMatrix.needsUpdate = true;
      imDepth.instanceMatrix.needsUpdate = true;
      app.scene.add(imDepth); app.scene.add(im);
      meshes.push(im); meshes.push(imDepth);
    }
    _boxIndex = index; _boxMeshes = meshes; _boxBld = app.activeBuilding;
    _guidArr = Object.keys(index); _evalCursor = 0; _scanPending = false; // §FLY_SMOOTH chunk state
    console.log('§DLOD_NAV_BUILD bld=' + app.activeBuilding + ' boxes=' + total + ' discs=' + discs.length +
      ' build_ms=' + (performance.now() - t0).toFixed(0));
    return true;
  }

  function _disposeBoxes() {
    if (_boxMeshes) for (var i = 0; i < _boxMeshes.length; i++) {
      var m = _boxMeshes[i];
      if (m.parent) m.parent.remove(m);
      m.material.dispose(); // geometry (_unitBox) is shared — disposed never, module-lifetime
    }
    _boxMeshes = null; _boxIndex = null; _boxBld = null; _realIndex = null;
    _occStructDispose();
  }

  // ── Real-mesh reverse index: guid → where its real representation lives ──
  function _buildRealIndex(app) {
    if (_realIndex) return;
    var t0 = performance.now(), idx = Object.create(null), n = 0, aggs = 0;
    app.scene.traverse(function (obj) {
      if (!obj.userData) return;
      if (obj.userData.isBboxPlaceholder) return; // never index proxies (ours or TM's or load-time)
      if (obj.userData.guid && obj.isMesh) { idx[obj.userData.guid] = { kind: 'mesh', obj: obj }; n++; return; }
      // Per-mesh aggregate: per-slot hiding (zero-scale/setVisibleAt) never removes the mesh
      // OBJECT's draw call — when every slot of a mesh is DLOD-hidden, drop the whole mesh from
      // the render list (mesh.visible=false), same lever as A.filterInstancedMesh's anyVisible.
      // Measured on LTU (W-DLOD-NAV-PERF run 2): without this, all-boxed only cut 15675→13639
      // draw calls — the scene is ~15K small mesh objects, the object-level flag is the lever.
      if (obj.isInstancedMesh && app._instanceMeta && app._instanceMeta[obj.id]) {
        var metas = app._instanceMeta[obj.id];
        var agg = { obj: obj, total: metas.length, hidden: 0 }; aggs++;
        for (var i = 0; i < metas.length; i++) { idx[metas[i].guid] = { kind: 'inst', obj: obj, idx: i, meta: metas[i], agg: agg }; n++; }
        return;
      }
      if (obj.isBatchedMesh && app._batchMeta && app._batchMeta[obj.id]) {
        var bmetas = app._batchMeta[obj.id];
        var bagg = { obj: obj, total: bmetas.length, hidden: 0 }; aggs++;
        for (var b = 0; b < bmetas.length; b++) { idx[bmetas[b].guid] = { kind: 'batch', obj: obj, slotId: bmetas[b].slotId, meta: bmetas[b], agg: bagg }; n++; }
      }
    });
    _realIndex = idx;
    console.log('§DLOD_NAV_REALIDX entries=' + n + ' meshAggs=' + aggs + ' ms=' + (performance.now() - t0).toFixed(0));
  }

  function _hideReal(r) {
    _stats.mutations++;
    if (r.kind === 'mesh') { r.obj.visible = false; return; }
    if (r.kind === 'inst') {
      if (!r.meta._origMatrix) { r.meta._origMatrix = new THREE.Matrix4(); r.obj.getMatrixAt(r.idx, r.meta._origMatrix); }
      r.obj.setMatrixAt(r.idx, _zeroM); r.obj.instanceMatrix.needsUpdate = true;
    } else {
      r.obj.setVisibleAt(r.slotId, false);
    }
    r.agg.hidden++;
    if (r.agg.hidden >= r.agg.total) r.obj.visible = false; // whole mesh boxed — kill its draw call
  }
  function _showReal(r) {
    _stats.mutations++;
    if (r.kind === 'mesh') { r.obj.visible = true; return; }
    if (r.kind === 'inst') {
      if (r.meta._origMatrix) { r.obj.setMatrixAt(r.idx, r.meta._origMatrix); r.obj.instanceMatrix.needsUpdate = true; }
    } else {
      r.obj.setVisibleAt(r.slotId, true);
    }
    r.agg.hidden--;
    if (!r.obj.visible) r.obj.visible = true;
  }
  function _realMatrix(r, out) {
    if (r.kind === 'mesh') { out.copy(r.obj.matrixWorld); return true; }
    if (r.kind === 'inst') {
      if (r.meta._origMatrix) out.copy(r.meta._origMatrix); else r.obj.getMatrixAt(r.idx, out);
      out.premultiply(r.obj.matrixWorld); return true;
    }
    r.obj.getMatrixAt(r.slotId, out); out.premultiply(r.obj.matrixWorld); return true;
  }
  function _realGeometry(r) {
    if (r.kind === 'mesh') return r.obj.geometry;
    if (r.kind === 'inst') return r.obj.geometry;
    var sg = r.obj.userData.slotGeo; // recorded at flush (streaming.js §9 additive line)
    return (sg && sg[r.slotId]) || null;
  }
  function _realMaterial(r) {
    var m = r.obj.material;
    return Array.isArray(m) ? m[0] : m;
  }

  function _setBoxInstance(e, visible) {
    if (e.boxVisible === visible) return;
    e.boxVisible = visible;
    var m = visible ? e.matrix : _zeroM;
    e.mesh.setMatrixAt(e.idx, m);
    e.mesh.instanceMatrix.needsUpdate = true;
    // §9: paired depth-only pass tracks the wireframe — except oversized bboxes (see DEPTH_MAX_RADIUS)
    e.depthMesh.setMatrixAt(e.idx, (visible && e.radius <= DEPTH_MAX_RADIUS) ? e.matrix : _zeroM);
    e.depthMesh.instanceMatrix.needsUpdate = true;
    _stats.mutations++;
  }

  // ── Cross-fade transitions (§8 FINDINGS #4: overlay-hoist + depthWrite:false, N=10) ──
  function _startFade(app, guid, e, r, toBox) {
    var geo = _realGeometry(r);
    if (!geo) { _snap(app, e, r, toBox); return; }   // no slot geometry recorded → snap (graceful)
    if (_fades.length >= FADE_CAP) { _snap(app, e, r, toBox); _stats.snaps++; return; }
    var m4 = new THREE.Matrix4();
    _realMatrix(r, m4);
    var realMat = _realMaterial(r);
    if (!realMat) { _snap(app, e, r, toBox); return; }
    var rm = realMat.clone(); rm.transparent = true; rm.depthWrite = false;
    var realCopy = new THREE.Mesh(geo, rm);
    realCopy.matrixAutoUpdate = false; realCopy.matrix.copy(m4);
    realCopy.userData.isDlodNavOverlay = true; realCopy.userData.isBboxPlaceholder = true; // pick-excluded
    var bm = e.mesh.material.clone(); bm.depthWrite = false; // wireframe, already transparent
    var boxCopy = new THREE.Mesh(_unitBox, bm);
    boxCopy.matrixAutoUpdate = false; boxCopy.matrix.copy(e.matrix);
    boxCopy.userData.isDlodNavOverlay = true; boxCopy.userData.isBboxPlaceholder = true;
    // same-frame swap: hide both canonical representations, overlays take over (pixel-identical, §8 ADDENDUM P3)
    _hideReal(r);
    _setBoxInstance(e, false);
    rm.opacity = toBox ? 1 : 0;
    bm.opacity = toBox ? 0 : 0.4;
    app.scene.add(realCopy); app.scene.add(boxCopy);
    e.state = toBox ? 'box' : 'real'; // target state owned immediately; fade is presentation only
    // §17.15: guid stashed too (was only on e/r's callers before) — the depth-prepass decouple fix
    // (_occlForceHiddenRealVisible) needs to look up "is this guid currently mid-fade" by guid.
    _fades.push({ e: e, r: r, guid: guid, toBox: toBox, frame: 0, realCopy: realCopy, boxCopy: boxCopy });
    _stats.fades++;
  }

  function _snap(app, e, r, toBox) {
    if (toBox) { _hideReal(r); _setBoxInstance(e, true); } else { _setBoxInstance(e, false); _showReal(r); }
    e.state = toBox ? 'box' : 'real';
  }

  function _finishFade(app, f) {
    app.scene.remove(f.realCopy); app.scene.remove(f.boxCopy);
    f.realCopy.material.dispose(); f.boxCopy.material.dispose(); // clones only; geometries shared
    if (f.toBox) { _setBoxInstance(f.e, true); } else { _showReal(f.r); }
  }

  function _stepFades(app) {
    if (!_fades.length) return false;
    for (var i = _fades.length - 1; i >= 0; i--) {
      var f = _fades[i];
      f.frame++;
      var t = Math.min(1, f.frame / FADE_FRAMES);
      var real01 = f.toBox ? 1 - t : t;
      f.realCopy.material.opacity = real01;
      f.boxCopy.material.opacity = 0.4 * (1 - real01);
      if (t >= 1) { _finishFade(app, f); _fades.splice(i, 1); }
    }
    return true;
  }

  function _cancelFadesSnap(app) {
    for (var i = 0; i < _fades.length; i++) {
      var f = _fades[i];
      _finishFade(app, f); // jump to target state instantly
    }
    _fades.length = 0;
  }

  // ══ §ROOM_OCCL — FLY_TOUR_DLOD_SCALE.md §13: room-mismatch demote, STEP 1 ══
  // §11.2 Q3 gate: room-criterion active only on interior legs. During a tour, interior =
  // flyPath legs plus the interior pause/lookAround beats between them (they hold camera
  // position, so interior-ness persists; the finale lookAround is distinguished by carrying
  // lookAtX). Tour-driven orbit/moveTo/Bird's-eye/Final legs disable it. Outside a tour there
  // is no aerial/orbit leg concept — free navigation counts as interior by default (§13).
  function _roomLegActive(app) {
    if (app.flyActive && app.walkActions && app.walkActions.length) {
      var act = app.walkActions[app.walkActionIdx];
      if (!act) return false;
      if (act.type === 'flyPath') return true;
      if ((act.type === 'pause' || act.type === 'lookAround') && act.lookAtX === undefined) return true;
      return false; // orbit / moveTo / rise / riseAndTilt / finale lookAround
    }
    return true;
  }

  // Lazy, building-keyed camera-room index + per-element room stamp. Only ever called when
  // roomOcclEnabled — zero queries, zero cost otherwise. Rooms may not be compiled yet when the
  // flag is first flipped (ensureRooms is idle-deferred on 'o'): retry throttled, never spin.
  function _roomIdxEnsure(app) {
    if (_roomIdx && _roomIdxBld === app.activeBuilding && _roomStampRef === _boxIndex) return true;
    var now = performance.now();
    if (now - _roomIdxTriedT < 3000) return false;
    _roomIdxTriedT = now;
    if (!window.RoomWalker || !window.RoomWalker.buildCameraRoomIndex || !app.db || !app.dbQuery || !_boxIndex) return false;
    var t0 = performance.now(), idx;
    try { idx = window.RoomWalker.buildCameraRoomIndex(app.db); }
    catch (e) { console.log('§ROOM_OCCL_INDEX_ERR ' + e.message); return false; }
    if (!idx || !idx.rects) { console.log('§ROOM_OCCL_INDEX rects=0 (rooms not compiled yet — will retry)'); return false; }
    // Stamp each element's LOGICAL contained room from rel_contained_in_space (compiled RM_ rows
    // only — the same domain roomAt() resolves into). Elements with no row keep room=undefined and
    // are simply never eligible for the room-criterion (§13: distance/frustum unchanged for them).
    var stamped = 0;
    try {
      var rel = app.dbQuery("SELECT element_guid, space_guid FROM rel_contained_in_space " +
        "WHERE space_guid LIKE 'RM\\_%' ESCAPE '\\'") || [];
      for (var i = 0; i < rel.length; i++) { var be = _boxIndex[rel[i][0]]; if (be) { be.room = rel[i][1]; stamped++; } }
    } catch (e2) { console.log('§ROOM_OCCL_INDEX_ERR rel ' + e2.message); return false; }
    _roomIdx = idx; _roomIdxBld = app.activeBuilding; _roomStampRef = _boxIndex;
    _stats.roomIdxRects = idx.rects; _stats.roomIdxStamped = stamped;
    console.log('§ROOM_OCCL_INDEX bld=' + app.activeBuilding + ' rects=' + idx.rects +
      ' floors=' + idx.anchorNames.length + ' stamped=' + stamped + ' ms=' + (performance.now() - t0).toFixed(0));
    return true;
  }

  function _roomReset() {
    if (_roomCur !== null) _scanPending = true; // room dropped — re-partition so room-demoted elements can promote
    _roomCur = null; _roomPend = undefined; _roomPendN = 0; _roomActive = false;
    _stats.roomCur = null; _stats.roomLeg = false;
  }

  // §16 — lazy, building-keyed room-to-room PVS. Only ever called when pvsEnabled; reuses the
  // SAME cached graph navigate_find.js's Find panel / room-path routing already builds
  // (app.getRoomGraph()), never a second graph build (FLY_TOUR_CORRIDOR_GRAPH.md R2's "one cache"
  // rule). Retry-throttled like _roomIdxEnsure — the graph may not exist yet the instant the
  // console flag is flipped (loadNavigate()'s chain is async, §DLOD_NAV_ROOMS idle-defers it).
  function _pvsEnsure(app) {
    if (_pvs && _pvsBld === app.activeBuilding) return true;
    var now = performance.now();
    if (now - _pvsTriedT < 3000) return false;
    _pvsTriedT = now;
    if (!app.getRoomGraph || !window.RoomGraph || !window.RoomGraph.buildRoomPVS) return false;
    var graph;
    try { graph = app.getRoomGraph(); } catch (eG) { console.log('§ROOM_PVS_ERR graph ' + eG.message); return false; }
    if (!graph || !graph.edges || !graph.edges.length) {
      console.log('§ROOM_PVS graph not ready (edges=0) — will retry'); return false;
    }
    var t0 = performance.now(), pvs;
    try { pvs = window.RoomGraph.buildRoomPVS(graph, { maxDoorCrossings: 1 }); }
    catch (eB) { console.log('§ROOM_PVS_ERR build ' + eB.message); return false; }
    _pvs = pvs; _pvsBld = app.activeBuilding;
    var roomKeys = Object.keys(pvs), totalVis = 0;
    roomKeys.forEach(function (k) { totalVis += Object.keys(pvs[k]).length; });
    _stats.pvsRooms = roomKeys.length;
    _stats.pvsAvgVisible = roomKeys.length ? +(totalVis / roomKeys.length).toFixed(1) : 0;
    console.log('§ROOM_PVS_BUILD bld=' + app.activeBuilding + ' rooms=' + roomKeys.length +
      ' avgVisible=' + _stats.pvsAvgVisible + ' ms=' + (performance.now() - t0).toFixed(0));
    return true;
  }

  // §16 — room-mismatch test, shared by _wantedReal and __dlodNavAudit so both always agree.
  // pvsEnabled=false (default) ⇒ IDENTICAL to §13's shipped equality test, byte-for-byte — the
  // PVS set (when built) always contains the room itself, so pvsEnabled=true is a pure superset
  // of "same room", never a stricter test.
  function _roomMismatch(e) {
    if (!_roomActive || e.room === undefined) return false;
    if (_stats.pvsEnabled === true && _pvs && _pvs[_roomCur]) return !_pvs[_roomCur][e.room];
    return e.room !== _roomCur;
  }

  // ══ §17 — FLY_TOUR_DLOD_SCALE.md §17.2-17.4: hierarchical GPU occlusion culling, STEP 3 ══
  // §17.3 integration: occlMis is a FOURTH plain OR'd demote criterion next to roomMis. The guid
  // is in the traversal's live hide-set only while the lever is on and a resolved GPU query said
  // the guid's covering BVH node is occluded. Keys by guid (unlike _roomMismatch's e.room) —
  // hide-ownership lives on tree nodes, elements are only ever looked up.
  function _occlBvhMismatch(guid) {
    return _stats.occlBvhEnabled === true && _occlHidden !== null && _occlHidden[guid] === true;
  }

  // §17.2: plain median-split BVH over _boxIndex's already-resident AABBs (zero new SQL). Real
  // traversable JS nodes {minX..maxZ, children|leaf, parent} — never an opaque blob (§17.9
  // decision 2). Built SYNCHRONOUSLY once per building (§17.9 decision 1: measured 312ms build /
  // 439ms total over the real 122,330-element set — cheap enough, no idle-defer), lazy
  // building-keyed cache exactly like _pvsEnsure/_roomIdxEnsure.
  function _bvhBuildNode(items, lo, hi, parent) {
    var minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (var i = lo; i < hi; i++) {
      var it = items[i];
      if (it.minX < minX) minX = it.minX; if (it.minY < minY) minY = it.minY; if (it.minZ < minZ) minZ = it.minZ;
      if (it.maxX > maxX) maxX = it.maxX; if (it.maxY > maxY) maxY = it.maxY; if (it.maxZ > maxZ) maxZ = it.maxZ;
    }
    var ddx = maxX - minX, ddy = maxY - minY, ddz = maxZ - minZ;
    var node = { minX: minX, minY: minY, minZ: minZ, maxX: maxX, maxY: maxY, maxZ: maxZ,
      diag: Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz),   // §17.14: box diagonal — the size gate test
      parent: parent, children: null, leaf: null, nid: _occlNodeId++,  // §17.15: stable id for trace logs
      // traversal state (§17.3/§17.4) — res: null|'vis'|'hid'; pending: query issued, unresolved
      q: null, pending: false, res: null, holdUntil: 0, inCut: false, hiddenMarked: false, touched: false,
      _issueFrame: 0, _issueGen: 0, _issueHiddenCount: 0 }; // §17.15 diagnostic stamps (see _occlIssueQueries)
    if (hi - lo <= OCCL_LEAF_SIZE) {
      var guids = [];
      for (var g = lo; g < hi; g++) guids.push(items[g].guid);
      node.leaf = guids;
      return node;
    }
    var dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
    var axis = (dx >= dy && dx >= dz) ? 'cx' : (dy >= dz ? 'cy' : 'cz');
    var sub = items.slice(lo, hi);
    sub.sort(function (a, b) { return a[axis] - b[axis]; });
    for (var s = 0; s < sub.length; s++) items[lo + s] = sub[s];
    var mid = lo + ((hi - lo) >> 1);
    node.children = [_bvhBuildNode(items, lo, mid, node), _bvhBuildNode(items, mid, hi, node)];
    return node;
  }

  function _bvhEnsure(app) {
    if (_bvh && _bvhBld === app.activeBuilding) {
      // §17-BUG1 fix: a prior _occlDisable() reset _occlCut to [] without touching _bvh/_bvhBld —
      // the tree itself is still valid, only the traversal cut needs re-seeding on re-enable.
      // Without this, off->on within the same building never issues another query (permanently inert).
      if (!_occlCut.length) {
        _occlCut = _bvh.children ? _bvh.children.slice() : [_bvh];
        for (var c = 0; c < _occlCut.length; c++) { _occlCut[c].inCut = true; _occlTouch(_occlCut[c]); }
        _occlCutIdx = 0; _occlCutDead = 0;
        console.log('§OCCL_BVH_REENABLE bld=' + app.activeBuilding + ' cut=' + _occlCut.length);
      }
      return true;
    }
    if (!_boxIndex) return false;
    _occlResetTraversal();                 // old tree's nodes/queries are garbage — drop cleanly
    if (_occlHidden) { for (var k in _occlHidden) { _scanPending = true; break; } }
    _occlHidden = Object.create(null);
    var t0 = performance.now(), items = [], guid;
    for (guid in _boxIndex) {
      var e = _boxIndex[guid];
      items.push({ guid: guid, minX: e.minX, minY: e.minY, minZ: e.minZ,
        maxX: e.maxX, maxY: e.maxY, maxZ: e.maxZ, cx: e.pos.x, cy: e.pos.y, cz: e.pos.z });
    }
    if (!items.length) return false;
    _occlNodeId = 0; _occlHiddenGen = 0; _occlHiddenCount = 0;   // §17.15: fresh trace ids/counters per build
    _bvh = _bvhBuildNode(items, 0, items.length, null);
    _bvhBld = app.activeBuilding;
    var nodes = 0, leaves = 0, maxDepth = 0, oversized = 0;
    (function count(n, d) { nodes++; if (d > maxDepth) maxDepth = d;
      if (n.diag > OCCL_MAX_HIDE_DIAG) oversized++;
      if (n.leaf) leaves++; else { count(n.children[0], d + 1); count(n.children[1], d + 1); } })(_bvh, 0);
    _stats.occlBvhNodes = nodes;
    // §17.14 measurement (2026-07-23, real 122,330-element LTU_AHouse, logged once per build for
    // any future retune): per-depth diag(min/avg/max) — root diag=514m (confirms §17.13's finding);
    // deep-tree outliers (sparse/far-apart element clusters, e.g. site/landscape features) still hit
    // diag~194-210m as late as depth 10 — a DEPTH cutoff alone would not be sufficient, only a
    // direct per-node SIZE gate (below) generalizes correctly regardless of tree depth:
    // d0(n=1 avg=514) d1(n=2 avg=359,min=310,max=408) d2(n=4 avg=283,min=208,max=368)
    // d3(n=8 avg=196,min=122,max=256) d4(n=16 avg=135,min=66,max=217) d5(n=32 avg=98,min=42,max=210)
    // d6(n=64 avg=74,min=27,max=208) d7(n=128 avg=57,min=18,max=201) d8(n=256 avg=42,min=11,max=196)
    // d9(n=512 avg=32,min=7,max=196) d10(n=1024 avg=24,min=2,max=194)
    console.log('§OCCL_BVH_BUILD_OVERSIZED bld=' + app.activeBuilding + ' maxHideDiag=' + OCCL_MAX_HIDE_DIAG +
      ' oversizedNodes=' + oversized + '/' + nodes + ' — these never get a trusted hide verdict, only descended');
    // §17.3: traversal starts at the root's CHILDREN — never query the root singleton (its box is
    // the whole building; the camera is always inside it).
    _occlCut = _bvh.children ? _bvh.children.slice() : [_bvh];
    for (var c = 0; c < _occlCut.length; c++) { _occlCut[c].inCut = true; _occlTouch(_occlCut[c]); }
    _occlCutIdx = 0; _occlCutDead = 0;
    console.log('§OCCL_BVH_BUILD bld=' + app.activeBuilding + ' elements=' + items.length +
      ' nodes=' + nodes + ' leaves=' + leaves + ' depth=' + maxDepth +
      ' build_ms=' + (performance.now() - t0).toFixed(0));
    return true;
  }

  function _occlTouch(n) { if (!n.touched) { n.touched = true; _occlTouched.push(n); } }

  // Reset every node that ever carried traversal/query state; delete its GL query object.
  function _occlResetTraversal() {
    var gl = _occlGl && _occlGl.ok ? _occlGl.gl : null;
    for (var i = 0; i < _occlTouched.length; i++) {
      var n = _occlTouched[i];
      if (n.q && gl) gl.deleteQuery(n.q);
      n.q = null; n.pending = false; n.res = null; n.holdUntil = 0; n.inCut = false;
      n.hiddenMarked = false; n.touched = false;
    }
    _occlTouched.length = 0; _occlPendingList.length = 0;
    _occlCut = []; _occlCutIdx = 0; _occlCutDead = 0;
    _stats.occlCut = 0;
  }

  // Live-flip back to false (or lever-off path): clear the hide-set so the very next scan pass
  // restores the shipped §13+§16 partition — the same one-shot reset shape as _roomReset.
  function _occlDisable() {
    var had = false;
    if (_occlHidden) { for (var k in _occlHidden) { had = true; break; } }
    _occlHidden = null;
    _occlResetTraversal();
    if (had) _scanPending = true;
    _stats.occlHidden = 0;
    _lastOcclEnabled = false;
    console.log('§OCCL_BVH_OFF hiddenCleared=' + had);
  }

  function _markSubtree(n, hide) {
    var changed = 0;
    (function walk(x) {
      if (x.leaf) {
        for (var i = 0; i < x.leaf.length; i++) {
          var g = x.leaf[i];
          if (hide) { if (_occlHidden[g] !== true) { _occlHidden[g] = true; changed++; } }
          else if (_occlHidden[g] === true) { delete _occlHidden[g]; changed++; }
        }
      } else { walk(x.children[0]); walk(x.children[1]); }
    })(n);
    // §17.15 diagnostic bookkeeping — running hide-set size + a generation counter that ticks on
    // every REAL change (never on a no-op mark), used to correlate query flips with "how much did
    // the hide-set move while this node's query was in flight."
    if (changed) {
      _occlHiddenCount += hide ? changed : -changed;
      _occlHiddenGen++;
    }
    return changed;
  }

  function _occlCamInside(n, c) {
    return c.x > n.minX - OCCL_CAM_MARGIN && c.x < n.maxX + OCCL_CAM_MARGIN &&
           c.y > n.minY - OCCL_CAM_MARGIN && c.y < n.maxY + OCCL_CAM_MARGIN &&
           c.z > n.minZ - OCCL_CAM_MARGIN && c.z < n.maxZ + OCCL_CAM_MARGIN;
  }

  function _occlRemoveFromCut(n) { n.inCut = false; _occlCutDead++; }
  function _occlAddToCut(n) {
    if (n.inCut) return;
    n.inCut = true; _occlTouch(n); _occlCut.push(n);
  }

  // "Visible" outcome for a cut node — from a resolved query OR the camera-inside guard.
  function _occlNodeVisible(n) {
    var changed = 0;
    n.res = 'vis'; n.holdUntil = _occlFrame + OCCL_HOLD;
    if (n.hiddenMarked) { changed = _markSubtree(n, false); n.hiddenMarked = false; }
    if (n.children) {
      // §17.3: descend — children join the cut, the (now redundant) parent leaves it. A node in
      // the cut therefore never has active descendants in the cut at the same time.
      _occlAddToCut(n.children[0]); _occlAddToCut(n.children[1]);
      _occlRemoveFromCut(n);
    }
    // visible LEAF stays in the cut — re-queried after its hold window (may become hidden later)
    return changed;
  }

  // "Hidden" outcome (0 samples): whole subtree demoted, NO descent (§17.3's early-out — this is
  // where one query culls thousands of elements across discipline buckets at once).
  function _occlNodeHidden(n) {
    var changed = 0;
    n.res = 'hid'; n.holdUntil = _occlFrame + OCCL_HOLD;
    if (!n.hiddenMarked) { changed = _markSubtree(n, true); n.hiddenMarked = true; }
    // Collapse upward: when BOTH children of a parent sit hidden in the cut, replace them with
    // the parent (bounds the cut to the vis/hid boundary; repeated cycles cascade further up).
    var p = n.parent;
    if (p && p !== _bvh) {
      var sib = p.children[0] === n ? p.children[1] : p.children[0];
      if (sib.inCut && sib.res === 'hid' && !sib.pending && n.inCut && !n.pending) {
        _occlRemoveFromCut(n); _occlRemoveFromCut(sib);
        n.hiddenMarked = false; sib.hiddenMarked = false; // ownership moves up — guids stay hidden
        p.res = 'hid'; p.hiddenMarked = true; p.holdUntil = _occlFrame + OCCL_HOLD;
        _occlAddToCut(p);
      }
    }
    return changed;
  }

  // §17.13 — depth-only pre-pass, REAL geometry only (box-proxy InstancedMeshes hidden for the
  // duration of this one render() call). Renders into an offscreen target the visible canvas never
  // sees, so the main app's own render(scene,camera) (box proxies included) is untouched — this
  // pass exists purely to give the occlusion queries a depth buffer to test against that isn't
  // contaminated by nav-DLOD's own wireframe stand-ins (§17.12's named root-cause hypothesis).
  // Returns the render target actually bound to the GL context afterward — the caller reads/
  // restores it once queries are issued (never leaves the renderer render-targeted off the canvas).
  function _occlDepthEnsure(app) {
    var sz = app.renderer.getSize(new THREE.Vector2());
    var w = Math.max(1, sz.x | 0), h = Math.max(1, sz.y | 0);
    if (_occlDepthRT && _occlDepthRT.width === w && _occlDepthRT.height === h) return;
    if (_occlDepthRT) _occlDepthRT.dispose();
    _occlDepthRT = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false });
  }
  // §17.15 diagnosis + fix attempt (FLY_TOUR_DLOD_SCALE.md §17.15) — NEGATIVE RESULT, gated off by
  // its own occlDepthDecoupleEnabled lever (default false); read the full write-up in the spec doc
  // before reviving this shape. §17.12/§17.13/§17.14 all measured a large, never-converging
  // false-hide rate but never diagnosed WHY the hide-set kept oscillating at a frozen camera.
  // §17.15's diagnostic trace (§OCCL_BVH_FLIP, window.__dlodNav.occlDebugTrace) found the direct
  // correlation: hiding a guid for DISPLAY (real→box, via _hideReal) also removes it from the
  // depth-only prepass's occluder source, since that pass only ever draws whatever's currently
  // shown as real — measured genDelta up to 91 (other hide-set mutations) and hiddenCountDelta up
  // to 18,162 guids inside the SAME single-frame window one query was in flight; 859/868 sampled
  // flips were hid→vis. Confirmed NOT async staleness — latencyFrames was exactly 1 for every
  // single sampled flip (the GPU query resolves essentially next-frame; no growing backlog).
  // ATTEMPTED FIX below: restore every _occlHidden guid's REAL geometry (cached matrix) into the
  // depth-only prepass for the duration of that one render() call, so occl-BVH demoting a guid
  // could never erase its own ability to occlude something else.
  // MEASURED RESULT (real RTX 4060, same frozen pose-0, same trace instrumentation): the fix did
  // NOT reduce oscillation — meanGenDelta actually rose 32.83→42.49 and meanAbsHiddenCountDelta
  // rose 3669.72→4501.58 (both ~25-30% WORSE, not better), hidden-count still swung ~95k-112k (same
  // magnitude as pre-fix ~88k-113k) — AND cost 130-172ms PER depth-prepass call (≥8x the ~16.6ms
  // frame budget; §OCCL_BVH_PREPASS_COST), which alone disqualifies it regardless of correctness.
  // The run also crashed (headless-Chrome "context closed", the standing §16.8 long-real-GPU-run
  // failure mode) before reaching settle, consistent with the added per-frame cost.
  // Why it likely didn't work (inferred from the evidence, not separately isolated): this fix only
  // restores geometry for guids occl-BVH ITSELF hid (_occlHidden, ~95-112k of the ~120k boxed
  // total) — the remaining ~8-25k guids boxed by the INDEPENDENT §9/§13/§16 distance/room criteria
  // (plausibly including the actual dividing walls/floors between rooms — an adjacent room's own
  // wall is routinely room-mismatch-boxed regardless of occl-BVH) stay excluded from the depth
  // source exactly as before, so the same class of "occluder vanished" event keeps happening
  // through that door. A complete version of this fix would need to decouple ALL demoted real
  // geometry, not just occl-BVH's own subset — arithmetically equivalent to rendering ~100% of the
  // building's real geometry every occlusion-query frame, which directly conflicts with DLOD's own
  // reason to exist and would cost even more than the ~150ms/call already measured for the partial
  // set. This looks like a genuine architectural dead end for the "cached-matrix restore into a
  // shared depth prepass" fix shape specifically — not an implementation bug to patch further.
  // Kept in the tree, OFF by default, so a future attempt has the code + this write-up rather than
  // re-deriving and re-falsifying the same shape from scratch.
  function _occlForceHiddenRealVisible() {
    if (!_occlHidden || !_realIndex) return null;
    var fadingGuids = null;
    if (_fades.length) { fadingGuids = Object.create(null); for (var f = 0; f < _fades.length; f++) fadingGuids[_fades[f].guid] = true; }
    var restoreInst = [], restoreBatch = [], restoreMesh = [], forcedObjs = Object.create(null), n = 0;
    for (var g in _occlHidden) {
      if (fadingGuids && fadingGuids[g]) continue;   // realCopy already covers this guid this pass
      var r = _realIndex[g];
      if (!r) continue;
      if (r.kind === 'inst') {
        if (!r.meta._origMatrix) continue;           // never actually hidden yet — nothing to restore
        r.obj.setMatrixAt(r.idx, r.meta._origMatrix);
        restoreInst.push(r);
        if (!forcedObjs[r.obj.id]) { forcedObjs[r.obj.id] = { obj: r.obj, wasVisible: r.obj.visible }; r.obj.visible = true; }
      } else if (r.kind === 'batch') {
        r.obj.setVisibleAt(r.slotId, true);
        restoreBatch.push(r);
        if (!forcedObjs[r.obj.id]) { forcedObjs[r.obj.id] = { obj: r.obj, wasVisible: r.obj.visible }; r.obj.visible = true; }
      } else { // 'mesh'
        restoreMesh.push({ r: r, wasVisible: r.obj.visible });
        r.obj.visible = true;
      }
      n++;
    }
    var instObjs = [];
    for (var k in forcedObjs) instObjs.push(forcedObjs[k]);
    if (n) { for (var oi = 0; oi < instObjs.length; oi++) instObjs[oi].obj.instanceMatrix && (instObjs[oi].obj.instanceMatrix.needsUpdate = true); }
    return { restoreInst: restoreInst, restoreBatch: restoreBatch, restoreMesh: restoreMesh, forcedObjs: instObjs, n: n };
  }
  function _occlRestoreHiddenReal(st) {
    if (!st) return;
    for (var i = 0; i < st.restoreInst.length; i++) { var r = st.restoreInst[i]; r.obj.setMatrixAt(r.idx, _zeroM); }
    for (i = 0; i < st.restoreBatch.length; i++) st.restoreBatch[i].obj.setVisibleAt(st.restoreBatch[i].slotId, false);
    for (i = 0; i < st.restoreMesh.length; i++) st.restoreMesh[i].r.obj.visible = st.restoreMesh[i].wasVisible;
    for (i = 0; i < st.forcedObjs.length; i++) {
      st.forcedObjs[i].obj.visible = st.forcedObjs[i].wasVisible;
      if (st.forcedObjs[i].obj.instanceMatrix) st.forcedObjs[i].obj.instanceMatrix.needsUpdate = true;
    }
  }

  var _occlPrepassLogged = 0; // §17.15: log the decoupled-restore cost a handful of times, not every frame
  function _occlDepthPrepass(app) {
    _occlDepthEnsure(app);
    if (!_occlDepthMat) _occlDepthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    var i, savedVis = [];
    if (_boxMeshes) for (i = 0; i < _boxMeshes.length; i++) { savedVis.push(_boxMeshes[i].visible); _boxMeshes[i].visible = false; }
    // §8's cross-fade overlays (_startFade) also carry a wireframe "boxCopy" clone tagged
    // isBboxPlaceholder — the SAME contamination risk as the steady-state box meshes above, just
    // bounded to FADE_CAP=128 elements at a time. Hide only the box half; the realCopy half is
    // genuine real geometry mid-transition and stays a legitimate occluder.
    var savedFadeVis = [];
    for (i = 0; i < _fades.length; i++) { savedFadeVis.push(_fades[i].boxCopy.visible); _fades[i].boxCopy.visible = false; }
    // §17.15 — NEGATIVE RESULT, default OFF (own sub-lever, see occlDepthDecoupleEnabled's own
    // comment above _stats): measured WORSE oscillation + ≥8x frame-budget cost. occlBvhEnabled
    // alone (this flag left false) stays byte-identical to §17.14's already-measured behavior.
    var decouple = _stats.occlDepthDecoupleEnabled === true;
    var t0 = (decouple && _occlPrepassLogged < 20) ? performance.now() : 0;
    var restoreState = decouple ? _occlForceHiddenRealVisible() : null;
    var prevTarget = app.renderer.getRenderTarget();
    var prevOverride = app.scene.overrideMaterial;
    app.scene.overrideMaterial = _occlDepthMat;
    app.renderer.setRenderTarget(_occlDepthRT);
    app.renderer.clear(true, true, false);
    app.renderer.render(app.scene, app.camera);
    app.scene.overrideMaterial = prevOverride;
    if (decouple) _occlRestoreHiddenReal(restoreState); // undo the decouple, back to display state
    if (_boxMeshes) for (i = 0; i < _boxMeshes.length; i++) _boxMeshes[i].visible = savedVis[i];
    for (i = 0; i < _fades.length; i++) _fades[i].boxCopy.visible = savedFadeVis[i];
    if (t0) {
      _occlPrepassLogged++;
      console.log('§OCCL_BVH_PREPASS_COST forcedGuids=' + (restoreState ? restoreState.n : 0) +
        ' forcedObjs=' + (restoreState ? restoreState.forcedObjs.length : 0) +
        ' ms=' + (performance.now() - t0).toFixed(2));
    }
    return prevTarget; // render target is CURRENTLY the depth RT — caller restores prevTarget when done
  }

  // §17.3 raw-GL query resources — WebGL2 core occlusion queries (ANY_SAMPLES_PASSED_CONSERVATIVE
  // is core WebGL2; EXT_occlusion_query_boolean is its WebGL1 spelling). One tiny program: a unit
  // cube stretched to a node's AABB by uMin/uMax, color/depth writes OFF, depth-TEST on against the
  // §17.13 depth-prepass's REAL-only render (not "whatever the renderer last drew" — §17.12 found
  // that included box proxies and caused a self-amplifying false-hide feedback loop).
  function _occlGlInit(app) {
    if (_occlGl) return _occlGl.ok;
    var gl = app.renderer.getContext();
    if (!(typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext)) {
      _occlGl = { ok: false };
      console.log('§OCCL_BVH_GL webgl2=false — occl-BVH criterion inert on this context');
      return false;
    }
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    try {
      var prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER,
        '#version 300 es\nin vec3 p; uniform vec3 uMin; uniform vec3 uMax; uniform mat4 uMVP;\n' +
        'void main(){ gl_Position = uMVP * vec4(mix(uMin, uMax, p), 1.0); }'));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER,
        '#version 300 es\nprecision lowp float; out vec4 c; void main(){ c = vec4(1.0); }'));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      var vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      var vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      // 8 unit-cube corners; corner i = (i&1, i>>1&1, i>>2&1)
      var pos = new Float32Array(24);
      for (var i = 0; i < 8; i++) { pos[i * 3] = i & 1; pos[i * 3 + 1] = (i >> 1) & 1; pos[i * 3 + 2] = (i >> 2) & 1; }
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      var ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array([
        0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7, 0, 4, 1, 1, 4, 5,
        2, 3, 6, 3, 7, 6, 0, 2, 4, 2, 6, 4, 1, 5, 3, 3, 5, 7]), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      _occlGl = { ok: true, gl: gl, prog: prog, vao: vao,
        uMin: gl.getUniformLocation(prog, 'uMin'), uMax: gl.getUniformLocation(prog, 'uMax'),
        uMVP: gl.getUniformLocation(prog, 'uMVP') };
      // Raw GL just ran under three.js's back — invalidate its cached state tracker.
      app.renderer.resetState();
      console.log('§OCCL_BVH_GL webgl2=true program=ok');
      return true;
    } catch (err) {
      _occlGl = { ok: false };
      if (app.renderer.resetState) app.renderer.resetState();
      console.log('§OCCL_BVH_GL_ERR ' + err.message);
      return false;
    }
  }

  // §17.3 "async by construction" — THE canonical way this gets implemented wrong is a
  // synchronous stall (issue + immediately read). This function only ever POLLS
  // QUERY_RESULT_AVAILABLE; a result is consumed on whatever later frame it resolves. NEVER
  // gl.finish()/getQueryParameter(QUERY_RESULT) before AVAILABLE says so.
  function _occlPollResults() {
    if (!_occlPendingList.length) return 0;
    var gl = _occlGl.gl, changed = 0, keep = [];
    var trace = _stats.occlDebugTrace === true;   // §17.15 — one boolean check, zero cost when off
    for (var i = 0; i < _occlPendingList.length; i++) {
      var n = _occlPendingList[i];
      if (!gl.getQueryParameter(n.q, gl.QUERY_RESULT_AVAILABLE)) { keep.push(n); continue; }
      n.pending = false;
      _stats.occlResultsRead++;
      if (!n.inCut) continue;               // collapsed/reset while in flight — result is moot
      var anySamples = gl.getQueryParameter(n.q, gl.QUERY_RESULT);
      var prevRes = n.res;
      var newRes = anySamples ? 'vis' : 'hid';
      if (trace && prevRes !== null && prevRes !== newRes) {
        // §17.15 §OCCL_BVH_FLIP — direct evidence line for hypotheses (a)/(b): latencyFrames = how
        // long this query sat in flight; genDelta/countDelta = how much the hide-set (and therefore
        // the depth-prepass occluder set, since a hidden element's real geometry stops rendering —
        // §17.12/§17.13's own finding) moved WHILE the query was unresolved.
        console.log('§OCCL_BVH_FLIP nid=' + n.nid + ' leaf=' + (n.leaf ? n.leaf.length : 0) +
          ' diag=' + n.diag.toFixed(1) + ' prevRes=' + prevRes + ' newRes=' + newRes +
          ' issueFrame=' + n._issueFrame + ' readFrame=' + _occlFrame +
          ' latencyFrames=' + (_occlFrame - n._issueFrame) +
          ' issueHiddenCount=' + n._issueHiddenCount + ' readHiddenCount=' + _occlHiddenCount +
          ' hiddenCountDelta=' + (_occlHiddenCount - n._issueHiddenCount) +
          ' genDelta=' + (_occlHiddenGen - n._issueGen));
      }
      changed += anySamples ? _occlNodeVisible(n) : _occlNodeHidden(n);
    }
    _occlPendingList = keep;
    return changed;
  }

  // Issue up to OCCL_QUERY_BUDGET queries this frame, round-robin over the cut (§17.4 — the tree
  // analogue of EVAL_CHUNK's flat chunking: N visited NODES per frame, never the whole tree).
  function _occlIssueQueries(app) {
    var len = _occlCut.length;
    if (!len) return 0;
    var gl = _occlGl.gl, changed = 0, issued = 0, camPos = app.camera.position;
    if (!_occlM4) _occlM4 = new THREE.Matrix4();
    _occlM4.multiplyMatrices(app.camera.projectionMatrix, app.camera.matrixWorldInverse);
    var glReady = false, prevTarget = null;
    for (var step = 0; step < len && issued < OCCL_QUERY_BUDGET; step++) {
      var n = _occlCut[(_occlCutIdx + step) % len];
      if (!n.inCut || n.pending || _occlFrame < n.holdUntil) continue;
      if (_occlCamInside(n, camPos)) {      // §17.5 pitfall-2 guard — never query around the camera
        changed += _occlNodeVisible(n);
        continue;
      }
      // §17.14 size gate — root-cause fix for §17.12/§17.13's 31.48% false-hide rate: a node whose
      // AABB diagonal exceeds OCCL_MAX_HIDE_DIAG is NEVER trusted with a "hidden" verdict, no matter
      // how it entered the cut (original fan-out OR §17.3's upward hidden-sibling collapse — that
      // collapse can re-insert an oversized ancestor as a live cut member, and it would otherwise
      // get freshly re-queried once its hold window expires). Skip the query entirely and force the
      // SAME outcome a "visible" query result would produce: descend into children (a smaller node
      // CAN be a valid proxy) without spending a GPU query on a box too coarse to trust. A leaf that
      // is itself still oversized (rare — sparse, far-apart elements, §17.14's own measured
      // depth10 max=194m outlier) has no children to descend into and is simply left visible
      // permanently — safe/conservative, never the wrong direction (§17.5 pitfall 2).
      if (n.diag > OCCL_MAX_HIDE_DIAG) {
        changed += _occlNodeVisible(n);
        continue;
      }
      if (!glReady) {
        // §17.13: real-only depth pre-pass, THEN issue queries against ITS depth buffer — never
        // the default framebuffer (which is whatever the last full frame drew, box proxies
        // included). _occlDepthPrepass leaves the depth RT bound; restored below once done.
        prevTarget = _occlDepthPrepass(app);
        gl.useProgram(_occlGl.prog);
        gl.bindVertexArray(_occlGl.vao);
        gl.uniformMatrix4fv(_occlGl.uMVP, false, _occlM4.elements);
        gl.colorMask(false, false, false, false);
        gl.depthMask(false);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.CULL_FACE);           // camera near a box: back faces must still rasterize
        gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
        glReady = true;
      }
      if (!n.q) n.q = gl.createQuery();
      _occlTouch(n);
      gl.uniform3f(_occlGl.uMin, n.minX, n.minY, n.minZ);
      gl.uniform3f(_occlGl.uMax, n.maxX, n.maxY, n.maxZ);
      gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, n.q);
      gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_BYTE, 0);
      gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
      n.pending = true;
      // §17.15 diagnostic stamp — snapshot the world state AT ISSUE time so the eventual resolve
      // (whenever it lands, §_occlPollResults) can report how much it moved underneath the query.
      n._issueFrame = _occlFrame; n._issueGen = _occlHiddenGen; n._issueHiddenCount = _occlHiddenCount;
      _occlPendingList.push(n);
      issued++;
    }
    _occlCutIdx = len ? (_occlCutIdx + Math.max(1, issued)) % len : 0;
    _stats.occlQueriesIssued += issued;
    if (glReady) {
      gl.bindVertexArray(null);
      app.renderer.setRenderTarget(prevTarget); // §17.13: hand the canvas back — never leaves the
                                                 // renderer targeted off-screen for the display render
      app.renderer.resetState();            // hand three.js back a truthful state cache
    }
    return changed;
  }

  function _occlCompactCut() {
    if (_occlCutDead < 256) return;
    var alive = [];
    for (var i = 0; i < _occlCut.length; i++) if (_occlCut[i].inCut) alive.push(_occlCut[i]);
    _occlCut = alive; _occlCutDead = 0; _occlCutIdx = 0;
  }

  // §17 per-frame stage — driven from the SAME _tick rAF loop as everything else (header
  // doctrine: no second rAF/timer), but with its OWN amortization, independent of _scanPending:
  // queries in flight resolve on their own schedule whether or not the camera moved.
  function _occlTick(app) {
    if (!_bvhEnsure(app)) return;
    if (!_occlGlInit(app)) return;
    _occlFrame++;
    var changed = _occlPollResults();
    changed += _occlIssueQueries(app);
    _occlCompactCut();
    if (changed) {
      // §17.11's landmine, generalized: the element scan only re-arms on camera-pose change —
      // a hide-set change with a frozen camera would otherwise never be applied.
      _scanPending = true;
      var hn = 0; for (var k in _occlHidden) hn++;
      _stats.occlHidden = hn;
    }
    _stats.occlCut = _occlCut.length - _occlCutDead;
    _lastOcclEnabled = true;
  }

  // ══ §17.16 — FLY_TOUR_DLOD_SCALE.md §17.16: structural occluder decouple ══
  // Core principle (17.16, confirmed against §17.15's own evidence): one scene for DISPLAY, one
  // separate, STATIC depth source for occlusion — they never share geometry state. Unlike §17.2's
  // BVH (built over the SAME 122,330 elements DLOD promote/demote mutates every frame), this
  // occluder set is wall/slab/roof/ceiling-class elements ONLY, queried once per building and never
  // touched again by any DLOD layer's hide/show state — structurally eliminates §17.15's feedback
  // loop rather than mitigating it.

  // §17.16.1 schema guard — cheap insurance, not because today's schema is in doubt (verified
  // against Duplex_mep_extracted.db) but because elements_rtree is CONFIRMED ABSENT on
  // LTU_AHouse_extracted.db (sandbox finding, §OCCL_STRUCT_SCHEMA) — check per building, never
  // assume. Convert an rtree AABB (IFC-raw frame) to Three world-space by transforming BOTH diagonal
  // corners through app.ifc2three and taking pointwise min/max — correct regardless of which axis
  // ends up permuted/sign-flipped (ifc2three is a pure permutation+sign-flip, no rotation).
  function _occStructHasRtree(app) {
    try {
      var rows = app.dbQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='elements_rtree'") || [];
      return rows.length > 0;
    } catch (e) { return false; }
  }

  // §17.16.1 selection — GUIDS ONLY. Real occluder GEOMETRY (§17.16.8: "start with real wall/slab/
  // roof geometry as-is... only add simplification if numbers show a cost problem, not assumed
  // upfront") comes from the already-loaded scene's own _realIndex at build time (_occStructBuildScene
  // below), not from a box approximation of AABBs — a box spans door/window openings the real mesh
  // doesn't, which measured a real 5-27% false-hide rate through doorways before this fix (see commit
  // history: box-proxy attempt tried first, reverted on real ground-truth numbers).
  function _occStructQuerySql(app) {
    var t0 = performance.now();
    var inList = OCCL_STRUCT_CLASSES.map(function (c) { return "'" + c + "'"; }).join(',');
    var hasRtree = _occStructHasRtree(app);   // logged for the record; guid-only query needs no AABB
    var rows = app.dbQuery("SELECT guid FROM elements_meta WHERE ifc_class IN (" + inList + ")") || [];
    var guids = [];
    for (var i = 0; i < rows.length; i++) guids.push(rows[i][0]);
    console.log('§OCCL_STRUCT_SELECT bld=' + app.activeBuilding + ' rtree=' + hasRtree +
      ' classes=' + JSON.stringify(OCCL_STRUCT_CLASSES) + ' count=' + guids.length +
      ' sql_ms=' + (performance.now() - t0).toFixed(0));
    return guids;
  }

  // §17.16.6 cache — mirrors room_walker.js's ROOM_WALKER_V self-heal convention, reusing the SAME
  // shared IndexedDB opener/store every other cache in this app uses (A.openCacheDB / A.CACHE_STORE
  // = 'dbs', schedule_author.js's own persistDb precedent) — a distinct key namespace
  // ('occlStruct:'+building+':'+OCCL_STRUCT_V), not the whole-DB-blob keys. Version bump on
  // OCCL_STRUCT_V alone invalidates every stale entry fleet-wide (key simply misses).
  function _occStructCacheKey(app) { return 'occlStruct:' + app.activeBuilding + ':' + OCCL_STRUCT_V; }
  function _occStructCacheGet(app) {
    return new Promise(function (resolve) {
      if (!app.openCacheDB) { resolve(null); return; }
      app.openCacheDB().then(function (idb) {
        if (!idb || !idb.objectStoreNames || !idb.objectStoreNames.contains(app.CACHE_STORE || 'dbs')) { resolve(null); return; }
        try {
          var tx = idb.transaction(app.CACHE_STORE || 'dbs', 'readonly');
          var req = tx.objectStore(app.CACHE_STORE || 'dbs').get(_occStructCacheKey(app));
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      }).catch(function () { resolve(null); });
    });
  }
  function _occStructCacheSet(app, items) {
    return new Promise(function (resolve) {
      if (!app.openCacheDB) { resolve(false); return; }
      app.openCacheDB().then(function (idb) {
        if (!idb || !idb.objectStoreNames || !idb.objectStoreNames.contains(app.CACHE_STORE || 'dbs')) { resolve(false); return; }
        try {
          var tx = idb.transaction(app.CACHE_STORE || 'dbs', 'readwrite');
          tx.objectStore(app.CACHE_STORE || 'dbs').put(items, _occStructCacheKey(app));
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      }).catch(function () { resolve(false); });
    });
  }

  // §17.16.2 diagnostic-only BVH — NO res/pending/hiddenMarked/hold-window fields (never a live
  // visibility state machine, pure spatial index), NOT traversed at runtime (see OCCL_STRUCT_LEAF_SIZE
  // comment — measured unnecessary). Built once per building purely to log the root-tightness
  // comparison W-OCC2-SELECT/17.16.2 asks for.
  function _occStructBvhBuild(items) {
    function buildNode(lo, hi, depth) {
      var minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity, i, it;
      for (i = lo; i < hi; i++) {
        it = items[i];
        if (it.minX < minX) minX = it.minX; if (it.minY < minY) minY = it.minY; if (it.minZ < minZ) minZ = it.minZ;
        if (it.maxX > maxX) maxX = it.maxX; if (it.maxY > maxY) maxY = it.maxY; if (it.maxZ > maxZ) maxZ = it.maxZ;
      }
      var ddx = maxX - minX, ddy = maxY - minY, ddz = maxZ - minZ;
      var node = { minX: minX, minY: minY, minZ: minZ, maxX: maxX, maxY: maxY, maxZ: maxZ,
        diag: Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz), depth: depth, n: hi - lo, children: null };
      if (hi - lo <= OCCL_STRUCT_LEAF_SIZE) return node;
      var dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
      var axis = (dx >= dy && dx >= dz) ? 0 : (dy >= dz ? 1 : 2);
      var sub = items.slice(lo, hi);
      sub.sort(function (a, b) {
        var av = axis === 0 ? (a.minX + a.maxX) : axis === 1 ? (a.minY + a.maxY) : (a.minZ + a.maxZ);
        var bv = axis === 0 ? (b.minX + b.maxX) : axis === 1 ? (b.minY + b.maxY) : (b.minZ + b.maxZ);
        return av - bv;
      });
      for (var s = 0; s < sub.length; s++) items[lo + s] = sub[s];
      var mid = lo + ((hi - lo) >> 1);
      node.children = [buildNode(lo, mid, depth + 1), buildNode(mid, hi, depth + 1)];
      return node;
    }
    var t0 = performance.now();
    var root = items.length ? buildNode(0, items.length, 0) : null;
    var buildMs = performance.now() - t0;
    return { root: root, buildMs: buildMs };
  }

  // §17.16.3 — separate depth target, occluder-set-only, colorWrite:false. NEVER app.scene, never
  // touched by any DLOD promote/demote (the whole point). REAL geometry (§17.16.8), not a box
  // approximation — one static Mesh per occluder guid, sharing the ALREADY-LOADED BufferGeometry
  // its real representation uses (_realGeometry/_realMatrix, the SAME helpers _startFade's overlay
  // clone already relies on — proven pattern, not new). A guid whose real mesh isn't resident yet
  // (progressive streaming) is skipped, best-effort, same tolerance this file already extends
  // elsewhere ("no real mesh resident — index only", _evalChunk).
  function _occStructBuildScene(app, guids) {
    var mat = new THREE.MeshBasicMaterial({ colorWrite: false });
    var scene = new THREE.Scene();
    var byGuid = Object.create(null), added = 0, skippedNoReal = 0, skippedNoGeo = 0;
    var m4 = new THREE.Matrix4();
    var diagItems = []; // reuse _boxIndex's own already-correct world AABBs for the diagnostic BVH
    for (var i = 0; i < guids.length; i++) {
      var guid = guids[i];
      var r = _realIndex ? _realIndex[guid] : null;
      if (!r) { skippedNoReal++; continue; }
      var geo = _realGeometry(r);
      if (!geo) { skippedNoGeo++; continue; }
      if (!_realMatrix(r, m4)) { skippedNoGeo++; continue; }
      var mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(m4);
      scene.add(mesh);
      byGuid[guid] = mesh;
      added++;
      var e = _boxIndex && _boxIndex[guid];
      if (e) diagItems.push({ guid: guid, minX: e.minX, minY: e.minY, minZ: e.minZ, maxX: e.maxX, maxY: e.maxY, maxZ: e.maxZ });
    }
    var bvh = _occStructBvhBuild(diagItems);
    var sz2 = app.renderer.getSize(new THREE.Vector2());
    var rt = new THREE.WebGLRenderTarget(Math.max(1, sz2.x | 0), Math.max(1, sz2.y | 0), { depthBuffer: true, stencilBuffer: false });
    console.log('§OCCL_STRUCT_SCENE_BUILD bld=' + app.activeBuilding + ' requested=' + guids.length +
      ' added=' + added + ' skippedNoReal=' + skippedNoReal + ' skippedNoGeo=' + skippedNoGeo +
      ' bvhBuildMs=' + bvh.buildMs.toFixed(0) + ' bvhRootDiag=' + (bvh.root ? bvh.root.diag.toFixed(1) : 0) +
      ' whole_building_root=514 (§17.13 measured) rootRatio=' + (bvh.root ? (bvh.root.diag / 514).toFixed(3) : 'n/a'));
    return { scene: scene, mat: mat, rt: rt, byGuid: byGuid, count: added, bvhRootDiag: bvh.root ? bvh.root.diag : 0 };
  }

  function _occStructDispose() {
    if (_occStruct) {
      if (_occStruct.mat) _occStruct.mat.dispose(); // geometries are SHARED with the main scene — never disposed here
      if (_occStruct.rt) _occStruct.rt.dispose();
    }
    _occStruct = null; _occStructBld = null; _occStructLoading = false;
    _occ2Hidden = null; _occStructCandGuids = null; _occStructCandBuf = null;
    _occStructPendingList.length = 0; _occStructCursor = 0; _occStructFrame = 0;
    _stats.occlStructReady = false; _stats.occlStructCount = 0; _stats.occlStructRootDiag = 0;
    _stats.occlStructHidden = 0; _stats.occlStructCandidates = 0;
  }

  // §17.16.6 — lazy, building-keyed, async (IDB read is async even though app.dbQuery is sync).
  // Retry-throttled like _pvsEnsure/_roomIdxEnsure; returns false (not ready) until the build
  // resolves, never blocks the rAF tick.
  function _occStructEnsure(app) {
    if (_occStruct && _occStructBld === app.activeBuilding) return true;
    if (_occStructLoading) return false;
    var now = performance.now();
    if (now - _occStructTriedT < 3000) return false;
    _occStructTriedT = now;
    if (!app.dbQuery || !app.ifc2three || !app.db || !app.renderer) return false;
    _occStructLoading = true;
    var bld = app.activeBuilding;
    var tCold0 = performance.now();
    _occStructCacheGet(app).then(function (cached) {
      if (cached && cached.length) {
        console.log('§OCCL_STRUCT_CACHE_HIT bld=' + bld + ' count=' + cached.length +
          ' warm_ms=' + (performance.now() - tCold0).toFixed(0));
        return cached;
      }
      var items = _occStructQuerySql(app);
      var tWrite0 = performance.now();
      return _occStructCacheSet(app, items).then(function (ok) {
        console.log('§OCCL_STRUCT_CACHE_MISS bld=' + bld + ' count=' + items.length +
          ' cold_ms=' + (performance.now() - tCold0).toFixed(0) +
          ' cacheWrite_ms=' + (performance.now() - tWrite0).toFixed(0) + ' cached=' + ok);
        return items;
      });
    }).then(function (items) {
      if (bld !== app.activeBuilding) { _occStructLoading = false; return; } // building changed mid-load
      if (!items || !items.length) {
        console.log('§OCCL_STRUCT_BUILD_EMPTY bld=' + bld);
        _occStructLoading = false; return;
      }
      _occStruct = _occStructBuildScene(app, items);
      _occStructBld = bld;
      _occStructLoading = false;
      _stats.occlStructReady = true; _stats.occlStructCount = _occStruct.count;
      _stats.occlStructRootDiag = +_occStruct.bvhRootDiag.toFixed(1);
    }).catch(function (e) {
      console.log('§OCCL_STRUCT_BUILD_ERR ' + (e && e.message));
      _occStructLoading = false;
    });
    return false;
  }

  function _occStructPrepass(app) {
    var sz = app.renderer.getSize(new THREE.Vector2());
    var w = Math.max(1, sz.x | 0), h = Math.max(1, sz.y | 0);
    if (_occStruct.rt.width !== w || _occStruct.rt.height !== h) { _occStruct.rt.dispose(); _occStruct.rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false }); }
    var prevTarget = app.renderer.getRenderTarget();
    app.renderer.setRenderTarget(_occStruct.rt);
    app.renderer.clear(true, true, false);
    app.renderer.render(_occStruct.scene, app.camera);
    app.renderer.setRenderTarget(prevTarget);
    return prevTarget;
  }

  // §17.16.4 — query subjects = the UNCHANGED §9/§19/§13/§16 active population, no new gating of its
  // own. _occStructMismatch is the 5th (transitional — replaces occlBvh once retired) OR'd criterion
  // in _wantedReal, keyed by guid exactly like _occlBvhMismatch.
  function _occStructMismatch(guid) {
    return _stats.occlStructEnabled === true && _occ2Hidden !== null && _occ2Hidden[guid] === true;
  }

  function _occStructPollResults() {
    if (!_occStructPendingList.length) return 0;
    var gl = _occlGl.gl, changed = 0, keep = [];
    for (var i = 0; i < _occStructPendingList.length; i++) {
      var e = _occStructPendingList[i];
      if (!gl.getQueryParameter(e.o2Q, gl.QUERY_RESULT_AVAILABLE)) { keep.push(e); continue; }
      e.o2Pending = false;
      _stats.occlStructResultsRead++;
      var anySamples = gl.getQueryParameter(e.o2Q, gl.QUERY_RESULT);
      var newRes = anySamples ? 'vis' : 'hid';
      if (e.o2Res !== newRes) {
        e.o2Res = newRes;
        if (newRes === 'hid') { if (_occ2Hidden[e.o2Guid] !== true) { _occ2Hidden[e.o2Guid] = true; changed++; } }
        else { if (_occ2Hidden[e.o2Guid] === true) { delete _occ2Hidden[e.o2Guid]; changed++; } }
      }
      e.o2HoldUntil = _occStructFrame + OCCL_STRUCT_HOLD;
    }
    _occStructPendingList = keep;
    return changed;
  }

  // Flat round-robin over the candidate list (§17.16.4 — NO hierarchical traversal over query
  // subjects: the sandbox proved a simple per-candidate query against the static target already
  // settles cleanly at real population sizes (~27k), so a second BVH here would be solving a problem
  // that measurement showed doesn't exist — "measure, don't assume" per 17.16.8's own discipline).
  function _occStructIssueQueries(app) {
    var cands = _occStructCandGuids;
    var len = cands ? cands.length : 0;
    if (!len) return 0;
    var gl = _occlGl.gl, changed = 0, issued = 0, camPos = app.camera.position;
    if (!_occlM4) _occlM4 = new THREE.Matrix4();
    _occlM4.multiplyMatrices(app.camera.projectionMatrix, app.camera.matrixWorldInverse);
    var glReady = false, prevTarget = null;
    for (var step = 0; step < len && issued < OCCL_STRUCT_QUERY_BUDGET; step++) {
      var guid = cands[(_occStructCursor + step) % len];
      var e = _boxIndex[guid];
      if (!e) continue;
      if (e.o2Pending || _occStructFrame < (e.o2HoldUntil || 0)) continue;
      // §17.5 pitfall-2 guard (same as §17.3's _occlCamInside), applied to the CANDIDATE's own AABB
      // this time (there is no tree node here) — camera inside its box ⇒ unconditionally visible.
      if (camPos.x > e.minX - OCCL_CAM_MARGIN && camPos.x < e.maxX + OCCL_CAM_MARGIN &&
          camPos.y > e.minY - OCCL_CAM_MARGIN && camPos.y < e.maxY + OCCL_CAM_MARGIN &&
          camPos.z > e.minZ - OCCL_CAM_MARGIN && camPos.z < e.maxZ + OCCL_CAM_MARGIN) {
        if (e.o2Res !== 'vis') { e.o2Res = 'vis'; if (_occ2Hidden[guid] === true) { delete _occ2Hidden[guid]; changed++; } }
        e.o2HoldUntil = _occStructFrame + OCCL_STRUCT_HOLD;
        continue;
      }
      if (!glReady) {
        prevTarget = _occStructPrepass(app);   // real occluder-only depth render, every issue cycle
        gl.useProgram(_occlGl.prog);
        gl.bindVertexArray(_occlGl.vao);
        gl.uniformMatrix4fv(_occlGl.uMVP, false, _occlM4.elements);
        gl.colorMask(false, false, false, false);
        gl.depthMask(false);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
        glReady = true;
      }
      if (!e.o2Q) e.o2Q = gl.createQuery();
      e.o2Guid = guid;
      gl.uniform3f(_occlGl.uMin, e.minX, e.minY, e.minZ);
      gl.uniform3f(_occlGl.uMax, e.maxX, e.maxY, e.maxZ);
      gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, e.o2Q);
      gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_BYTE, 0);
      gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
      e.o2Pending = true;
      _occStructPendingList.push(e);
      issued++;
    }
    _occStructCursor = len ? (_occStructCursor + Math.max(1, issued)) % len : 0;
    _stats.occlStructQueriesIssued += issued;
    if (glReady) {
      gl.bindVertexArray(null);
      app.renderer.setRenderTarget(prevTarget);
      app.renderer.resetState();
    }
    return changed;
  }

  function _occStructTick(app) {
    if (!_occStructEnsure(app)) return;
    if (!_occlGlInit(app)) return;
    if (!_occ2Hidden) _occ2Hidden = Object.create(null); // first engage this building — lazy init
    // §17.11's own lesson, restated here: a lever flip must re-arm the scan ITSELF — _evalChunk only
    // runs when _scanPending is set (camera move or a hide-set change), so the FIRST candidate build
    // after occlStructEnabled flips true (camera possibly frozen) would otherwise never happen.
    if (!_occStructCandGuids) { _scanPending = true; return; }
    if (!_occStructCandGuids.length) return;
    _occStructFrame++;
    var changed = _occStructPollResults();
    changed += _occStructIssueQueries(app);
    if (changed) {
      _scanPending = true;
      var hn = 0; for (var k in _occ2Hidden) hn++;
      _stats.occlStructHidden = hn;
    }
    _stats.occlStructCandidates = _occStructCandGuids.length;
    _lastOcclStructEnabled = true;
  }

  // Live-flip back to false: clear the hide-set + candidate/pending state (query resources on
  // individual _boxIndex entries are simply abandoned — GC'd whenever _boxIndex itself rebuilds;
  // no live queries survive a candidate-list swap anyway). Same one-shot reset shape as _occlDisable.
  function _occStructDisableLever() {
    var had = false;
    if (_occ2Hidden) { for (var k in _occ2Hidden) { had = true; break; } }
    _occ2Hidden = Object.create(null);
    _occStructCandGuids = null; _occStructCandBuf = null;
    _occStructPendingList.length = 0; _occStructCursor = 0;
    if (had) _scanPending = true;
    _stats.occlStructHidden = 0; _stats.occlStructCandidates = 0;
    _lastOcclStructEnabled = false;
    console.log('§OCCL_STRUCT_OFF hiddenCleared=' + had);
  }

  // Per-frame current-room eval (same rAF loop as everything else — no second timer, §13). The
  // stability window is counted in FRAMES per §11.2 Q4's measurement; a room ACCEPTANCE re-arms
  // the chunked scan so the partition updates even when the camera pose itself is unchanged
  // (e.g. stability maturing while hovering). The point-in-rect test is one camera point vs the
  // compiled rect rows on ONE floor — trivial next to the element scan (§11.2 Q2).
  function _roomEval(app) {
    if (!_roomIdxEnsure(app)) { _roomReset(); return; }
    // §16: best-effort, never blocks the §13 path — until the PVS is ready, _roomMismatch()
    // degrades to the plain equality test (§13's shipped behavior), never a crash or a stall.
    if (_stats.pvsEnabled === true) _pvsEnsure(app);
    if (!_roomLegActive(app)) { _roomReset(); return; }
    _stats.roomLeg = true;
    var off = app.modelOffset, c = app.camera.position;
    if (!off) { _roomReset(); return; }
    // three→IFC: inverse of A.ifc2three (same mapping navigate_engine.js startNavigation uses)
    var raw = _roomIdx.roomAt(c.x + off.x, -c.z + off.y, c.y + off.z);
    _roomEvals++; _stats.roomEvals = _roomEvals;
    // §13 membership-stability gate: accept a NEW current room (including null) only after
    // ROOM_STABLE_N consecutive evals agree — filters the measured A→B→A flap churn (§11.2 Q4).
    if (raw === _roomPend) { _roomPendN++; } else { _roomPend = raw; _roomPendN = 1; }
    if (_roomPendN >= ROOM_STABLE_N && raw !== _roomCur) {
      _roomCur = raw; _stats.roomCur = raw; _stats.roomChanges++;
      console.log('§ROOM_OCCL_ROOM room=' + (raw || 'none') + ' stableN=' + _roomPendN +
        ' changes=' + _stats.roomChanges);
      _scanPending = true;
    }
    // §13 explicit no-room state: camera outside all compiled rects ⇒ criterion contributes
    // nothing this tick — distance/frustum alone still govern. Never "no room = demote all."
    _roomActive = (_roomCur !== null);
  }

  // ── Per-element wanted state under hysteresis (FLY_TOUR_DLOD_SCALE.md §9 decision rule) ──
  // §20: promoteSq/demoteSq are passed in (effective PROMOTE_DIST/DEMOTE_DIST + boost, squared,
  // precomputed ONCE per pass by the caller) rather than read as fixed module constants — at
  // boost=0 these equal PROMOTE_SQ/DEMOTE_SQ exactly, so this is a pure generalization, not a
  // behavior change on the boost=0 path (W-BUDGET-EQUIV). guid (§17/§17.16) keys the occlusion
  // hide-sets — the traversal's live hide-set is guid-keyed, elements are only ever looked up.
  function _wantedReal(e, camPos, promoteSq, demoteSq, guid) {
    var d2 = camPos.distanceToSquared(e.pos);
    // §13/§16 room-mismatch: THIRD OR'd demote criterion (promote = inverse AND-of-NOTs). Only
    // bites when roomOcclEnabled+interior-leg+camera-in-a-room (_roomActive) AND the element has a
    // compiled containment row (e.room). false ⇒ short-circuits to the shipped decision rule.
    var roomMis = _roomMismatch(e);
    // §19: element is contained in the room the camera is CURRENTLY in — exempt from the distance
    // gate entirely (frustum/hysteresis still applies below). Without this, tightening
    // PROMOTE/DEMOTE for far-field aggression would also box out the room the user is standing in.
    var sameRoom = _roomActive && e.room !== undefined && e.room === _roomCur;
    // §17 occl-BVH / §17.16 structural: FOURTH OR'd demote criterion. Composes with PVS per §17.9
    // decision 3: roomMis filters first for free, occlMis is a plain further OR — no short-circuit
    // engineering into the traversal itself (correctness first, v1). §17.16: transitional OR —
    // both default false so EQUIV stays trivially satisfied; occlBvh's whole §17.2-17.4 machinery
    // retires once §17.16's own witnesses (W-OCC2-*) pass.
    var occlMis = _occlBvhMismatch(guid) || _occStructMismatch(guid);
    if (e.state === 'real') {
      // demote only when clearly out: >60m (+boost) OR sphere+5m margin outside frustum OR room
      // mismatch OR GPU-query-proven occluded (distance skipped entirely when sameRoom — §19 above)
      if (!sameRoom && d2 > demoteSq) return false;
      if (roomMis || occlMis) return false;
      _sphere.center.copy(e.pos); _sphere.radius = e.radius + FRUSTUM_MARGIN;
      return _frustum.intersectsSphere(_sphere);
    }
    // promote only when clearly in: ≤38m (+boost) AND exact frustum AND no criterion still demoting
    if (!sameRoom && d2 > promoteSq) return false;
    if (roomMis || occlMis) return false;
    _sphere.center.copy(e.pos); _sphere.radius = e.radius;
    return _frustum.intersectsSphere(_sphere);
  }

  // §FLY_SMOOTH: one CHUNK of the scan per rAF tick. Camera pose is re-read per chunk — elements
  // in different chunks see slightly different poses within a pass; the 50/80m + 5m-frustum
  // hysteresis bands absorb that skew by design (they exist to absorb pose jitter).
  function _evalChunk(app) {
    if (!_guidArr || !_guidArr.length) return;
    var t0 = performance.now();
    if (!_frustum) { _frustum = new THREE.Frustum(); _psm = new THREE.Matrix4(); _sphere = new THREE.Sphere(); _m4 = new THREE.Matrix4(); }
    _psm.multiplyMatrices(app.camera.projectionMatrix, app.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_psm);
    var camPos = app.camera.position;
    // §20: effective thresholds frozen at PASS START (_evalCursor===0), not recomputed every
    // chunk-tick — the periodic 150ms budget-tick (in _tick) can fire mid-pass (a pass takes
    // ~8 chunk-ticks to cover 122k elements, close to the same 150ms cadence), and letting the
    // threshold drift mid-pass left early-chunk elements evaluated under an older boost than
    // late-chunk elements in the SAME pass — a smear that never got a follow-up clean pass to
    // reconcile once the ramp stopped (found via W-BUDGET-DELTA: mismatch stuck at 804 after 20s
    // with boost visibly steady). Freezing per-pass fixes it: at boost=0 this is still exactly
    // PROMOTE_SQ/DEMOTE_SQ every pass (W-BUDGET-EQUIV unaffected).
    if (_evalCursor === 0) {
      _passBoostVal = _effBoost();
      _passPromoteSq = _passBoostVal ? (PROMOTE_DIST + _passBoostVal) * (PROMOTE_DIST + _passBoostVal) : PROMOTE_SQ;
      _passDemoteSq = _passBoostVal ? (DEMOTE_DIST + _passBoostVal) * (DEMOTE_DIST + _passBoostVal) : DEMOTE_SQ;
    }
    var promoteSq = _passPromoteSq, demoteSq = _passDemoteSq;
    var end = Math.min(_evalCursor + EVAL_CHUNK, _guidArr.length);
    var started = 0;
    // §17.16.4: candidate accumulation rides the SAME chunked scan, no second O(n) pass. A pass
    // starting at cursor 0 opens a fresh buffer; the buffer is published as the live candidate list
    // only once the pass completes (below) — mid-pass reads of _occStructCandGuids keep using last
    // pass's list, same "publish at pass end" discipline _stats.active/_stats.boxed already use.
    if (_stats.occlStructEnabled === true && _evalCursor === 0) _occStructCandBuf = [];
    for (var i = _evalCursor; i < end; i++) {
      var guid = _guidArr[i], e = _boxIndex[guid];
      var want = _wantedReal(e, camPos, promoteSq, demoteSq, guid);
      // §17.16.4 candidate population / §20.1 cross-track safeguard: "would be real ignoring
      // occlusion" under the SAME §9/§13/§19/§20 hysteresis rule _wantedReal applies to e.state
      // (distance + frustum + room, no occlMis) — mirrors _wantedReal exactly minus the occlMis
      // term, using the SAME per-pass boosted promoteSq/demoteSq _wantedReal itself just used (not
      // the fixed PROMOTE_SQ/DEMOTE_SQ — those would silently diverge from _wantedReal's own
      // decision once boost is nonzero). A flat distance-only net (tried first, reverted —
      // measured 103,476 candidates vs the sandbox's own ~27k "active" population at an equivalent
      // pose) forgot the frustum test entirely; this is the correct, tighter population. Computed
      // UNCONDITIONALLY (not just when occlStructEnabled) so _passEligible — and therefore the §20
      // budget controller's activeElig read — stays correct whichever occlusion lever is on.
      var d2s = camPos.distanceToSquared(e.pos);
      var elig;
      if (e.state === 'real') {
        elig = d2s <= demoteSq && !_roomMismatch(e);
        if (elig) { _sphere.center.copy(e.pos); _sphere.radius = e.radius + FRUSTUM_MARGIN; elig = _frustum.intersectsSphere(_sphere); }
      } else {
        elig = d2s <= promoteSq && !_roomMismatch(e);
        if (elig) { _sphere.center.copy(e.pos); _sphere.radius = e.radius; elig = _frustum.intersectsSphere(_sphere); }
      }
      if (elig) {
        _passEligible++;
        if (_occStructCandBuf) _occStructCandBuf.push(guid);
      } else if (_occ2Hidden && _occ2Hidden[guid] === true) delete _occ2Hidden[guid]; // stale — out of eligible zone
      if (want === (e.state === 'real')) { if (e.state === 'box') _passBoxed++; else _passReal++; continue; }
      var r = _realIndex[guid];
      if (!r) { e.state = want ? 'real' : 'box'; continue; } // no real mesh resident — index only
      _startFade(app, guid, e, r, !want);
      started++;
      if (e.state === 'box') _passBoxed++; else _passReal++;
    }
    _evalCursor = end;
    _stats.evalMs = +(performance.now() - t0).toFixed(1); // per-CHUNK cost now (was per full pass)
    _logAccStarted += started;
    if (_evalCursor >= _guidArr.length) { // pass complete — publish partition, rearm on next pose change
      _stats.active = _passReal; _stats.boxed = _passBoxed; _stats.activeElig = _passEligible;
      _passReal = 0; _passBoxed = 0; _passEligible = 0;
      _evalCursor = 0;
      // §20: if the boost moved on (periodic tick fired) WHILE this pass was still mid-flight —
      // a real race, a pass takes ~8 chunk-ticks (~130ms) at close to the same 150ms cadence the
      // boost can change on — this pass was frozen at a now-stale value (_passBoostVal). Clearing
      // _scanPending here would silently strand the partition at that stale value forever (no
      // camera/room change left to re-arm it) — found via W-BUDGET-DELTA (mismatch stuck at
      // 1000+ indefinitely after boost visibly stopped changing). Instead, leave _scanPending
      // true so a fresh pass starts IMMEDIATELY under the current boost — at most one extra pass,
      // and only while boost is still actively moving; a converged/steady boost never re-triggers.
      _scanPending = (_passBoostVal !== _effBoost());
      if (_occStructCandBuf) { _occStructCandGuids = _occStructCandBuf; _occStructCandBuf = null; }
      var _nowLog = performance.now();
      if (_logAccStarted && (_nowLog - _lastLogT) >= 2000) {
        console.log('§DLOD_NAV active=' + _stats.active + ' boxed=' + _stats.boxed + ' mode=on started=' + _logAccStarted +
          ' fades=' + _fades.length + ' chunk_ms=' + _stats.evalMs +
          (_stats.roomOcclEnabled === true ? ' room=' + (_roomActive ? (_roomCur || 'none') : (_stats.roomLeg ? 'none' : 'leg-off')) : '') +
          (_stats.occlBvhEnabled === true ? ' occlHidden=' + _stats.occlHidden + ' occlCut=' + _stats.occlCut : '') +
          (_stats.occlStructEnabled === true ? ' occlStructHidden=' + _stats.occlStructHidden + ' occlStructCand=' + _stats.occlStructCandidates : ''));
        _logAccStarted = 0; _lastLogT = _nowLog;
      }
    }
    if (started && app.markDirty) app.markDirty();
  }

  function _camSig(app) {
    var p = app.camera.position, q = app.camera.quaternion;
    return p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2) + '|' +
           q.x.toFixed(3) + ',' + q.y.toFixed(3) + ',' + q.z.toFixed(3) + ',' + q.w.toFixed(3);
  }

  // §FPS_MODE finding (2026-07-23): the old _restoreAll was a single synchronous loop over the
  // whole box index — measured 2.5-3.6s frame_ms spike on LTU_AHouse (122k) on every disengage,
  // worse than the cold-engage burst it mirrors. Chunked the same way _evalChunk already is
  // (EVAL_CHUNK per rAF tick). _restoreFlush lets a re-engage force-finish a still-draining
  // restore synchronously first, so _buildBoxes never races a stale in-flight drain — bounded to
  // "whatever's left undone" rather than always the full 122k.
  var _restoreFlush = null;
  function _restoreAllNow(app, reason, onDone) {
    _roomReset(); // §ROOM_OCCL: disengage clears current-room state (index stays, building-keyed)
    _cancelFadesSnap(app);
    var idx = _boxIndex, ridx = _realIndex;
    var guids = idx ? Object.keys(idx) : [];
    var i = 0;
    // §26 fix (2026-08-08): finish() must run AT MOST ONCE per _restoreAllNow() invocation. Before
    // this flag, step()'s own already-scheduled requestAnimationFrame(step) continuation (queued
    // during THIS call's first synchronous step() below, before any external caller forces an
    // early finish via the module-level _restoreFlush) was never cancelled — a rapid OFF→ON toggle
    // makes _tick() call _restoreFlush() (=finish, closure-local, still the CURRENT invocation's)
    // to force-complete the drain early so the fresh re-engage can rebuild _boxIndex. That leftover
    // rAF-scheduled step() then fires on a LATER frame regardless, sees i already at guids.length,
    // and calls finish() A SECOND TIME — re-disposing (via onDone=_disposeBoxes) whatever _boxIndex
    // is CURRENTLY live (the fresh one from the re-engage), which the main tick's _evalChunk then
    // reads as null on its very next call. Reproduced live: `witness_boxindex_race.js` — unfixed,
    // rapid o/o on LTU_AHouse throws `Cannot read properties of null (reading '<guid>')` from
    // _evalChunk, exactly matching the field stack trace; fixed, zero crash across repeated runs,
    // __dlodNavAudit() mismatch=0 afterward (structurally correct, not just crash-silenced).
    var _done = false;
    function runTo(end) {
      for (; i < end; i++) {
        var guid = guids[i], e = idx[guid];
        if (e.state === 'box') {
          var r = ridx && ridx[guid];
          _setBoxInstance(e, false);
          if (r) _showReal(r);
          e.state = 'real';
        }
      }
    }
    function finish() {
      if (_done) return; // stale leftover step() firing after an external flush already finished this
      _done = true;
      runTo(guids.length); // no-op if step() already finished the loop
      _restoreFlush = null;
      // Belt-and-braces: if a filter turned on while we were engaged, reassert it after restore
      if (app.activeGuidFilter && app.filterByGuids) app.filterByGuids(app.activeGuidFilter);
      else if ((app.activeStoreyFilter !== null && app.activeStoreyFilter !== undefined) && app.filterStorey) app.filterStorey(app.activeStoreyFilter);
      if (app.markDirty) app.markDirty();
      console.log('§DLOD_NAV_DISENGAGE reason=' + reason + ' mutations=' + _stats.mutations);
      if (onDone) onDone();
    }
    function step() {
      if (_done) return; // this invocation was already force-finished elsewhere — stop rescheduling
      runTo(Math.min(i + EVAL_CHUNK, guids.length));
      if (i < guids.length) requestAnimationFrame(step);
      else finish();
    }
    _restoreFlush = finish;
    step();
  }

  function _tick() {
    _rafId = null;
    if (!_pillOn) return; // pill off mid-flight — _toggleOff already restored
    var app = A();
    var block = _gateBlockReason(app);
    if (block) {
      if (_engaged) { _engaged = false; window._dlodNavEngaged = false; _lastCamSig = null; _restoreAllNow(app, block); }
      _rafId = requestAnimationFrame(_tick); // stay alive; re-engage when the gate clears
      return;
    }
    if (!_engaged) {
      if (_restoreFlush) _restoreFlush(); // finish any still-draining restore before rebuilding the index
      if (!_buildBoxes(app)) { _rafId = requestAnimationFrame(_tick); return; }
      _buildRealIndex(app);
      _engaged = true; window._dlodNavEngaged = true; _lastCamSig = null;
      // §20: fresh engage starts the boost ramp at 0 (never carries a stale value across a
      // disengage/re-engage cycle — same discipline as _lastCamSig reset above).
      _budgetBoost = 0; _stats.budgetBoost = 0; _appliedBoost = 0; _lastBudgetT = 0;
      console.log('§DLOD_NAV_ENGAGE bld=' + app.activeBuilding + ' elements=' + app.activeBuildingTotal);
    }
    // §ROOM_OCCL (§13): evaluated only when the console lever is on; the else-branch is a pure
    // var reset (fires once after a live flip back to false, restoring the shipped partition).
    if (_stats.roomOcclEnabled === true) _roomEval(app);
    else if (_roomActive || _roomCur !== null || _roomPendN) _roomReset();
    // §17 occl-BVH stage: same convention — lever on ⇒ run the traversal's own amortized stage;
    // flip back to false ⇒ one-shot _occlDisable clears the hide-set + re-arms the scan so the
    // shipped §13+§16 partition is restored. Default-false path touches NOTHING.
    if (_stats.occlBvhEnabled === true) _occlTick(app);
    else if (_lastOcclEnabled) _occlDisable();
    // §17.16 — same convention: lever on ⇒ run the flat-candidate query stage; flip back to false ⇒
    // one-shot disable clears the hide-set + re-arms the scan. Default-false path touches NOTHING
    // (never even builds the occluder scene — _occStructEnsure is only called from _occStructTick).
    if (_stats.occlStructEnabled === true) _occStructTick(app);
    else if (_lastOcclStructEnabled) _occStructDisableLever();
    var fading = _stepFades(app);
    if (fading && app.markDirty) app.markDirty();
    var sig = _camSig(app);
    if (sig !== _lastCamSig) { _lastCamSig = sig; _scanPending = true; } // pose changed — (re)arm scan
    // §20: periodic 150ms budget-tick, INDEPENDENT of camera movement — this is the one new
    // periodic driver this feature adds (everything else in this file only re-evaluates on pose
    // change). Reads the last-published _stats.active (guarded until a pass has actually
    // completed at least once, so the cold-engage active=0 burst can't be misread as "empty,
    // ramp up"). Only re-arms a scan pass when the effective boost actually CHANGED — a converged,
    // steady boost costs nothing extra per frame beyond this one cheap comparison (self-limiting,
    // §20.1's own design goal: near-zero overhead once settled, whether settled at 0 or at max).
    if (_stats.budgetBoostEnabled === true || (_stats.forceBoost !== null && _stats.forceBoost !== undefined)) {
      var nowB = performance.now();
      if (nowB - _lastBudgetT >= 150) {
        _lastBudgetT = nowB;
        if ((_stats.active + _stats.boxed) > 0) {
          var newBoost = _budgetControl();
          if (newBoost !== _appliedBoost) {
            _appliedBoost = newBoost;
            _scanPending = true; // partition must be recomputed under the new effective distance
            console.log('§DLOD_NAV_BUDGET boost=' + newBoost + ' active=' + _stats.active + ' boxed=' + _stats.boxed);
          }
        }
      }
    }
    if (_scanPending) _evalChunk(app); // one chunk per frame until the pass completes
    _rafId = requestAnimationFrame(_tick);
  }

  // 2026-07-21 user ask: momentary status-bar confirmation on toggle (same convention as Fly's
  // "Fly stopped." — A.status.textContent). Auto-clears after 5s ONLY if nothing overwrote it.
  var _statusClearT = null;
  function _statusMsg(app, msg) {
    if (!app || !app.status) return;
    app.status.textContent = msg;
    if (_statusClearT) clearTimeout(_statusClearT);
    _statusClearT = setTimeout(function () {
      if (app.status.textContent === msg) app.status.textContent = '';
    }, 5000);
  }
  window.toggleDlodNav = function () {
    var app = A();
    if (!_pillOn) {
      if (!app || !(app.activeBuildingTotal > NAV_MIN_ELEMENTS)) {
        console.log('§DLOD_NAV_GATE elements=' + (app ? app.activeBuildingTotal : 0) + ' threshold=' + NAV_MIN_ELEMENTS + ' verdict=too-small');
        if (app && app.toast) app.toast('Nav LOD needs a large building (>50k elements)');
        return;
      }
      _pillOn = true; window._dlodNavOn = true;
      // §DLOD_NAV_TOGGLE_BLOCKED: toggling on while a gate condition already holds (e.g. bbox/ghost
      // mode's filterByGuids(new Set()) leaves activeGuidFilter truthy) used to log on=true and stay
      // silently disengaged — no ENGAGE line, no toast, no way to tell it did nothing. Surface it now;
      // _tick still auto-engages once the block clears, this is feedback-only, no behavior change.
      var _armBlock = _gateBlockReason(app);
      if (_armBlock) {
        console.log('§DLOD_NAV_TOGGLE on=true blocked=' + _armBlock);
        _statusMsg(app, 'Nav LOD armed but blocked (' + _armBlock + ') — will engage once cleared');
      } else {
        console.log('§DLOD_NAV_TOGGLE on=true');
        _statusMsg(app, 'Nav LOD ON — boxing far elements (o to turn off)');
      }
      if (!_rafId) _rafId = requestAnimationFrame(_tick);
      // §DLOD_NAV_ROOMS: a >50k-element building crossing the nav-LOD gate is the same "about to
      // navigate seriously" signal Fly Tour already treats as "make sure rooms are fresh"
      // (tour.js's A._prepareGraphTour: A.loadNavigate() then A.ensureRooms()) — reuses that exact
      // call, not a fork. Deferred via requestIdleCallback (same idiom as effects.js's staffage
      // preload and navigate_find.js's ghost-shell build) rather than fired immediately: measured
      // live, loadNavigate()'s 10-script chain contends hard with an in-flight geometry-streaming
      // pipeline on exactly the large buildings this gate targets — firing it the instant 'o' is
      // pressed risks competing with the box-proxy's own frame budget for the one thing DLOD-nav
      // exists to protect. Idle-deferred, this only warms rooms up opportunistically once the main
      // thread is actually free, for whatever Find/Fly/Cinema feature runs next.
      if (app && app.loadNavigate) {
        var _warmRooms = function() {
          app.loadNavigate().then(function() {
            return app.ensureRooms ? app.ensureRooms({}) : null;
          }).then(function(res) {
            if (res) console.log('§DLOD_NAV_ROOMS status=' + res.status + ' source=' + (res.source || 'none') + ' rooms=' + (res.rooms != null ? res.rooms : '-'));
          }).catch(function(e) { console.warn('§DLOD_NAV_ROOMS_ERR ' + (e && e.message)); });
        };
        if (window.requestIdleCallback) window.requestIdleCallback(_warmRooms, { timeout: 8000 });
        else setTimeout(_warmRooms, 5000);
      }
    } else {
      _pillOn = false; window._dlodNavOn = false;
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      console.log('§DLOD_NAV_TOGGLE on=false');
      _statusMsg(app, 'Nav LOD OFF — full detail restored');
      if (_engaged) {
        _engaged = false; window._dlodNavEngaged = false;
        _restoreAllNow(app, 'pill-off', _disposeBoxes); // dispose only once the chunked drain finishes
      } else {
        _disposeBoxes();
      }
    }
    if (app && app.markDirty) app.markDirty();
  };

  // W-DLOD-NAV-PROXY: recompute the wanted partition from scratch, compare to applied state.
  // Elements mid-fade count as their target state (state is set at fade START by design).
  window.__dlodNavAudit = function () {
    var app = A();
    if (!_engaged || !_boxIndex) return { engaged: false, mismatch: -1 };
    _psm.multiplyMatrices(app.camera.projectionMatrix, app.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_psm);
    var camPos = app.camera.position, mismatch = 0, boxed = 0, real = 0, roomOnly = 0;
    // §20: same effective-threshold generalization as _evalChunk — at boost=0 (or the mechanism
    // disabled) this is PROMOTE_SQ/DEMOTE_SQ exactly, so the audit still agrees with a boost=0
    // partition byte-for-byte (W-BUDGET-EQUIV covers this path too).
    var _boost = _effBoost();
    var _promoteSq = _boost ? (PROMOTE_DIST + _boost) * (PROMOTE_DIST + _boost) : PROMOTE_SQ;
    var _demoteSq = _boost ? (DEMOTE_DIST + _boost) * (DEMOTE_DIST + _boost) : DEMOTE_SQ;
    for (var guid in _boxIndex) {
      var e = _boxIndex[guid];
      var want = _wantedReal(e, camPos, _promoteSq, _demoteSq, guid);
      if (want !== (e.state === 'real')) mismatch++;
      if (e.state === 'box') boxed++; else real++;
      // §ROOM_OCCL/§16 (W-ROOM-OCCL-PROXY / W-PVS-CORRECT support): boxed PURELY because of room
      // mismatch (equality OR PVS-membership, whichever _roomMismatch is currently using) — i.e.
      // within promote distance and in-frustum, so distance/frustum alone would have it real.
      if (e.state === 'box' && _roomMismatch(e)) {
        if (camPos.distanceToSquared(e.pos) <= PROMOTE_SQ) {
          _sphere.center.copy(e.pos); _sphere.radius = e.radius;
          if (_frustum.intersectsSphere(_sphere)) roomOnly++;
        }
      }
    }
    var res = { engaged: true, mismatch: mismatch, real: real, boxed: boxed, fades: _fades.length, snaps: _stats.snaps,
      budget: { enabled: _stats.budgetBoostEnabled === true, boost: _boost,
        promoteDist: PROMOTE_DIST + _boost, demoteDist: DEMOTE_DIST + _boost },
      roomOccl: { enabled: _stats.roomOcclEnabled === true, active: _roomActive, room: _roomCur,
        legActive: _stats.roomLeg, roomOnlyBoxed: roomOnly,
        pvsEnabled: _stats.pvsEnabled === true, pvsRooms: _stats.pvsRooms, pvsAvgVisible: _stats.pvsAvgVisible },
      // §17 (W-OCCL-BVH-* support) — counters are 0/false while occlBvhEnabled is default-false
      occlBvh: { enabled: _stats.occlBvhEnabled === true, hidden: _stats.occlHidden,
        cut: _stats.occlCut, nodes: _stats.occlBvhNodes,
        queriesIssued: _stats.occlQueriesIssued, resultsRead: _stats.occlResultsRead },
      // §17.16 (W-OCC2-* support) — counters are 0/false while occlStructEnabled is default-false
      occlStruct: { enabled: _stats.occlStructEnabled === true, ready: _stats.occlStructReady,
        count: _stats.occlStructCount, rootDiag: _stats.occlStructRootDiag,
        candidates: _stats.occlStructCandidates, hidden: _stats.occlStructHidden,
        queriesIssued: _stats.occlStructQueriesIssued, resultsRead: _stats.occlStructResultsRead } };
    console.log('§DLOD_NAV_AUDIT mismatch=' + mismatch + ' real=' + real + ' boxed=' + boxed + ' fades=' + _fades.length +
      ' activeElig=' + _stats.activeElig +
      (_stats.roomOcclEnabled === true ? ' §ROOM_OCCL_AUDIT active=' + _roomActive + ' room=' + (_roomCur || 'none') + ' roomOnlyBoxed=' + roomOnly : '') +
      (_stats.pvsEnabled === true ? ' §PVS_AUDIT rooms=' + _stats.pvsRooms + ' avgVisible=' + _stats.pvsAvgVisible : '') +
      (_stats.occlBvhEnabled === true ? ' §OCCL_BVH_AUDIT hidden=' + _stats.occlHidden + ' cut=' + _stats.occlCut +
        ' issued=' + _stats.occlQueriesIssued + ' read=' + _stats.occlResultsRead : '') +
      (_stats.occlStructEnabled === true ? ' §OCCL_STRUCT_AUDIT ready=' + _stats.occlStructReady +
        ' hidden=' + _stats.occlStructHidden + ' candidates=' + _stats.occlStructCandidates +
        ' issued=' + _stats.occlStructQueriesIssued + ' read=' + _stats.occlStructResultsRead : ''));
    return res;
  };

  // §17 (W-OCCL-BVH-CORRECT support) — debug accessor exposing the traversal's live guid hide-set
  // (same console-only convention as __dlodNavAudit; counts alone can't be cross-checked against
  // the §15 ground-truth classifier, the witness needs the actual guids).
  window.__dlodOcclHiddenGuids = function () { return _occlHidden ? Object.keys(_occlHidden) : []; };
  // §17.16 (W-OCC2-CORRECT support) — same convention, structural-occluder hide-set.
  window.__dlodOcclStructHiddenGuids = function () { return _occ2Hidden ? Object.keys(_occ2Hidden) : []; };

  console.log('§DLOD_NAV_READY pill=off engaged=false');
})();
