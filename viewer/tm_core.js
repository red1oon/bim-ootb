// time_machine family — part `core` (original time_machine.js lines 19–1418).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/time_machine.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as TMS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts = (typeof window !== 'undefined' ? window : globalThis).__timeMachineParts || {};
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts.core = function* __split_time_machine_core(TMS) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  TMS.A = A;
  TMS._bdWatchSet = _bdWatchSet;
  TMS._bdRec = _bdRec;
  TMS._bdSeen = _bdSeen;
  TMS._tmEnsure = _tmEnsure;
  TMS.loadOps = loadOps;
  TMS.computeDays = computeDays;
  TMS.restorePeeled = restorePeeled;
  TMS.computeStoryboard = computeStoryboard;
  TMS.pickClearAngle = pickClearAngle;
  TMS.buildGuidPosMap = buildGuidPosMap;
  TMS._dlodEngaged = _dlodEngaged;
  TMS._dlodResolveCamera = _dlodResolveCamera;
  TMS._dlodInView = _dlodInView;
  TMS._dlodDisposeBoxes = _dlodDisposeBoxes;
  TMS._dlodBuildBoxes = _dlodBuildBoxes;
  TMS._dlodUpdateBoxes = _dlodUpdateBoxes;
  TMS.clearSparks = clearSparks;
  TMS._giCancelConverge = _giCancelConverge;
  TMS._giHoldCamSig = _giHoldCamSig;
  TMS._giScheduleHoldConverge = _giScheduleHoldConverge;
  TMS._gspCollect = _gspCollect;
  TMS._gspEmit = _gspEmit;
  TMS._gspStopDecay = _gspStopDecay;
  TMS._gspClear = _gspClear;
  TMS._tmSceneSig = _tmSceneSig;
  TMS._tmBuildEventIndex = _tmBuildEventIndex;
  TMS._tmHasEventIn = _tmHasEventIn;
  Object.defineProperty(TMS, '_active', { get: function () { return _active; }, set: function (v) { _active = v; }, enumerable: true });
  Object.defineProperty(TMS, '_tmEnabledGI', { get: function () { return _tmEnabledGI; }, set: function (v) { _tmEnabledGI = v; }, enumerable: true });
  Object.defineProperty(TMS, '_panel', { get: function () { return _panel; }, set: function (v) { _panel = v; }, enumerable: true });
  Object.defineProperty(TMS, '_mode', { get: function () { return _mode; }, set: function (v) { _mode = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ops', { get: function () { return _ops; }, set: function (v) { _ops = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cursor', { get: function () { return _cursor; }, set: function (v) { _cursor = v; }, enumerable: true });
  Object.defineProperty(TMS, '_projectStart', { get: function () { return _projectStart; }, set: function (v) { _projectStart = v; }, enumerable: true });
  Object.defineProperty(TMS, '_projectEnd', { get: function () { return _projectEnd; }, set: function (v) { _projectEnd = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttAxisStart', { get: function () { return _ganttAxisStart; }, set: function (v) { _ganttAxisStart = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttAxisEnd', { get: function () { return _ganttAxisEnd; }, set: function (v) { _ganttAxisEnd = v; }, enumerable: true });
  Object.defineProperty(TMS, '_days', { get: function () { return _days; }, set: function (v) { _days = v; }, enumerable: true });
  Object.defineProperty(TMS, '_anchorDay', { get: function () { return _anchorDay; }, set: function (v) { _anchorDay = v; }, enumerable: true });
  Object.defineProperty(TMS, '_anchorHr', { get: function () { return _anchorHr; }, set: function (v) { _anchorHr = v; }, enumerable: true });
  Object.defineProperty(TMS, '_savedVisibility', { get: function () { return _savedVisibility; }, set: function (v) { _savedVisibility = v; }, enumerable: true });
  Object.defineProperty(TMS, '_highlightMeshes', { get: function () { return _highlightMeshes; }, set: function (v) { _highlightMeshes = v; }, enumerable: true });
  Object.defineProperty(TMS, '_tmXraySolidifyTs', { get: function () { return _tmXraySolidifyTs; }, set: function (v) { _tmXraySolidifyTs = v; }, enumerable: true });
  Object.defineProperty(TMS, '_tmXrayStagedTotal', { get: function () { return _tmXrayStagedTotal; }, set: function (v) { _tmXrayStagedTotal = v; }, enumerable: true });
  Object.defineProperty(TMS, '_tmXraySolidifiedN', { get: function () { return _tmXraySolidifiedN; }, set: function (v) { _tmXraySolidifiedN = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttVisible', { get: function () { return _ganttVisible; }, set: function (v) { _ganttVisible = v; }, enumerable: true });
  Object.defineProperty(TMS, '_dashVisible', { get: function () { return _dashVisible; }, set: function (v) { _dashVisible = v; }, enumerable: true });
  Object.defineProperty(TMS, '_varVisible', { get: function () { return _varVisible; }, set: function (v) { _varVisible = v; }, enumerable: true });
  Object.defineProperty(TMS, '_p6Visible', { get: function () { return _p6Visible; }, set: function (v) { _p6Visible = v; }, enumerable: true });
  Object.defineProperty(TMS, '_p6ModsPromise', { get: function () { return _p6ModsPromise; }, set: function (v) { _p6ModsPromise = v; }, enumerable: true });
  Object.defineProperty(TMS, '_opsPlanned', { get: function () { return _opsPlanned; }, set: function (v) { _opsPlanned = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttTasks', { get: function () { return _ganttTasks; }, set: function (v) { _ganttTasks = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttDirty', { get: function () { return _ganttDirty; }, set: function (v) { _ganttDirty = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttIdentified', { get: function () { return _ganttIdentified; }, set: function (v) { _ganttIdentified = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttUnidentified', { get: function () { return _ganttUnidentified; }, set: function (v) { _ganttUnidentified = v; }, enumerable: true });
  Object.defineProperty(TMS, '_capActive', { get: function () { return _capActive; }, set: function (v) { _capActive = v; }, enumerable: true });
  Object.defineProperty(TMS, '_coveredCount', { get: function () { return _coveredCount; }, set: function (v) { _coveredCount = v; }, enumerable: true });
  Object.defineProperty(TMS, '_coveragePct', { get: function () { return _coveragePct; }, set: function (v) { _coveragePct = v; }, enumerable: true });
  Object.defineProperty(TMS, '_sCurveData', { get: function () { return _sCurveData; }, set: function (v) { _sCurveData = v; }, enumerable: true });
  Object.defineProperty(TMS, '_shopfloor', { get: function () { return _shopfloor; }, set: function (v) { _shopfloor = v; }, enumerable: true });
  Object.defineProperty(TMS, '_shopfloorLoading', { get: function () { return _shopfloorLoading; }, set: function (v) { _shopfloorLoading = v; }, enumerable: true });
  Object.defineProperty(TMS, '_tmV1', { get: function () { return _tmV1; }, set: function (v) { _tmV1 = v; }, enumerable: true });
  Object.defineProperty(TMS, '_tmV2', { get: function () { return _tmV2; }, set: function (v) { _tmV2 = v; }, enumerable: true });
  Object.defineProperty(TMS, '_tmV3', { get: function () { return _tmV3; }, set: function (v) { _tmV3 = v; }, enumerable: true });
  Object.defineProperty(TMS, '_tmM4', { get: function () { return _tmM4; }, set: function (v) { _tmM4 = v; }, enumerable: true });
  Object.defineProperty(TMS, '_tmColor', { get: function () { return _tmColor; }, set: function (v) { _tmColor = v; }, enumerable: true });
  Object.defineProperty(TMS, '_tmRay', { get: function () { return _tmRay; }, set: function (v) { _tmRay = v; }, enumerable: true });
  Object.defineProperty(TMS, '_prevCursor', { get: function () { return _prevCursor; }, set: function (v) { _prevCursor = v; }, enumerable: true });
  Object.defineProperty(TMS, '_sunCycle', { get: function () { return _sunCycle; }, set: function (v) { _sunCycle = v; }, enumerable: true });
  Object.defineProperty(TMS, '_lastElDeg', { get: function () { return _lastElDeg; }, set: function (v) { _lastElDeg = v; }, enumerable: true });
  Object.defineProperty(TMS, '_camFollow', { get: function () { return _camFollow; }, set: function (v) { _camFollow = v; }, enumerable: true });
  Object.defineProperty(TMS, '_camTarget', { get: function () { return _camTarget; }, set: function (v) { _camTarget = v; }, enumerable: true });
  Object.defineProperty(TMS, '_camAngle', { get: function () { return _camAngle; }, set: function (v) { _camAngle = v; }, enumerable: true });
  Object.defineProperty(TMS, '_camUserInteracted', { get: function () { return _camUserInteracted; }, set: function (v) { _camUserInteracted = v; }, enumerable: true });
  Object.defineProperty(TMS, '_camLogTick', { get: function () { return _camLogTick; }, set: function (v) { _camLogTick = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineStoryboard', { get: function () { return _cineStoryboard; }, set: function (v) { _cineStoryboard = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineSceneIdx', { get: function () { return _cineSceneIdx; }, set: function (v) { _cineSceneIdx = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineBeat', { get: function () { return _cineBeat; }, set: function (v) { _cineBeat = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineTick', { get: function () { return _cineTick; }, set: function (v) { _cineTick = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineNextTarget', { get: function () { return _cineNextTarget; }, set: function (v) { _cineNextTarget = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineTransitFrom', { get: function () { return _cineTransitFrom; }, set: function (v) { _cineTransitFrom = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineTransitTo', { get: function () { return _cineTransitTo; }, set: function (v) { _cineTransitTo = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineEstabStart', { get: function () { return _cineEstabStart; }, set: function (v) { _cineEstabStart = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineEstabEnd', { get: function () { return _cineEstabEnd; }, set: function (v) { _cineEstabEnd = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineOpenStart', { get: function () { return _cineOpenStart; }, set: function (v) { _cineOpenStart = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineOpenTarget', { get: function () { return _cineOpenTarget; }, set: function (v) { _cineOpenTarget = v; }, enumerable: true });
  Object.defineProperty(TMS, '_BEAT_OPENING', { get: function () { return _BEAT_OPENING; }, set: function (v) { _BEAT_OPENING = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineSeenZones', { get: function () { return _cineSeenZones; }, set: function (v) { _cineSeenZones = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineCloseupCount', { get: function () { return _cineCloseupCount; }, set: function (v) { _cineCloseupCount = v; }, enumerable: true });
  Object.defineProperty(TMS, '_BEAT_CLOSEUP', { get: function () { return _BEAT_CLOSEUP; }, set: function (v) { _BEAT_CLOSEUP = v; }, enumerable: true });
  Object.defineProperty(TMS, '_BEAT_TRANSIT', { get: function () { return _BEAT_TRANSIT; }, set: function (v) { _BEAT_TRANSIT = v; }, enumerable: true });
  Object.defineProperty(TMS, '_BEAT_ESTAB', { get: function () { return _BEAT_ESTAB; }, set: function (v) { _BEAT_ESTAB = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cinePeeled', { get: function () { return _cinePeeled; }, set: function (v) { _cinePeeled = v; }, enumerable: true });
  Object.defineProperty(TMS, '_cineHeroSlowdown', { get: function () { return _cineHeroSlowdown; }, set: function (v) { _cineHeroSlowdown = v; }, enumerable: true });
  Object.defineProperty(TMS, '_FLYTHROUGH_DIST', { get: function () { return _FLYTHROUGH_DIST; }, set: function (v) { _FLYTHROUGH_DIST = v; }, enumerable: true });
  Object.defineProperty(TMS, '_PANORAMIC_DIST', { get: function () { return _PANORAMIC_DIST; }, set: function (v) { _PANORAMIC_DIST = v; }, enumerable: true });
  Object.defineProperty(TMS, '_HERO_DIST', { get: function () { return _HERO_DIST; }, set: function (v) { _HERO_DIST = v; }, enumerable: true });
  Object.defineProperty(TMS, '_bgBuildRaf', { get: function () { return _bgBuildRaf; }, set: function (v) { _bgBuildRaf = v; }, enumerable: true });
  Object.defineProperty(TMS, '_shadowLogTick', { get: function () { return _shadowLogTick; }, set: function (v) { _shadowLogTick = v; }, enumerable: true });
  Object.defineProperty(TMS, 'LARGE_BUILDING', { get: function () { return LARGE_BUILDING; }, set: function (v) { LARGE_BUILDING = v; }, enumerable: true });
  Object.defineProperty(TMS, '_isLargeBuilding', { get: function () { return _isLargeBuilding; }, set: function (v) { _isLargeBuilding = v; }, enumerable: true });
  Object.defineProperty(TMS, '_zeroMatrix', { get: function () { return _zeroMatrix; }, set: function (v) { _zeroMatrix = v; }, enumerable: true });
  Object.defineProperty(TMS, '_whiteColor', { get: function () { return _whiteColor; }, set: function (v) { _whiteColor = v; }, enumerable: true });
  Object.defineProperty(TMS, '_savedInstanceMatrices', { get: function () { return _savedInstanceMatrices; }, set: function (v) { _savedInstanceMatrices = v; }, enumerable: true });
  Object.defineProperty(TMS, '_dlodPausedByTm', { get: function () { return _dlodPausedByTm; }, set: function (v) { _dlodPausedByTm = v; }, enumerable: true });
  Object.defineProperty(TMS, 'DLOD_TM_MIN_ELEMENTS', { get: function () { return DLOD_TM_MIN_ELEMENTS; }, set: function (v) { DLOD_TM_MIN_ELEMENTS = v; }, enumerable: true });
  Object.defineProperty(TMS, '_dlodProxyOn', { get: function () { return _dlodProxyOn; }, set: function (v) { _dlodProxyOn = v; }, enumerable: true });
  Object.defineProperty(TMS, '_dlodBoxIndex', { get: function () { return _dlodBoxIndex; }, set: function (v) { _dlodBoxIndex = v; }, enumerable: true });
  Object.defineProperty(TMS, '_lastProxyEngaged', { get: function () { return _lastProxyEngaged; }, set: function (v) { _lastProxyEngaged = v; }, enumerable: true });
  Object.defineProperty(TMS, '_dlodPrevOn', { get: function () { return _dlodPrevOn; }, set: function (v) { _dlodPrevOn = v; }, enumerable: true });
  Object.defineProperty(TMS, '_dlodFrustum', { get: function () { return _dlodFrustum; }, set: function (v) { _dlodFrustum = v; }, enumerable: true });
  Object.defineProperty(TMS, '_dlodPSM', { get: function () { return _dlodPSM; }, set: function (v) { _dlodPSM = v; }, enumerable: true });
  Object.defineProperty(TMS, '_dlodSphere', { get: function () { return _dlodSphere; }, set: function (v) { _dlodSphere = v; }, enumerable: true });
  Object.defineProperty(TMS, '_dlodCamPos', { get: function () { return _dlodCamPos; }, set: function (v) { _dlodCamPos = v; }, enumerable: true });
  Object.defineProperty(TMS, '_dlodLastCamSig', { get: function () { return _dlodLastCamSig; }, set: function (v) { _dlodLastCamSig = v; }, enumerable: true });
  Object.defineProperty(TMS, '_gspRoll', { get: function () { return _gspRoll; }, set: function (v) { _gspRoll = v; }, enumerable: true });
  Object.defineProperty(TMS, '_gspCand', { get: function () { return _gspCand; }, set: function (v) { _gspCand = v; }, enumerable: true });
  Object.defineProperty(TMS, '_gspFrontierN', { get: function () { return _gspFrontierN; }, set: function (v) { _gspFrontierN = v; }, enumerable: true });
  Object.defineProperty(TMS, '_gspRecentN', { get: function () { return _gspRecentN; }, set: function (v) { _gspRecentN = v; }, enumerable: true });
  Object.defineProperty(TMS, '_evMesh', { get: function () { return _evMesh; }, set: function (v) { _evMesh = v; }, enumerable: true });
  Object.defineProperty(TMS, '_evSig', { get: function () { return _evSig; }, set: function (v) { _evSig = v; }, enumerable: true });
  Object.defineProperty(TMS, '_incrStats', { get: function () { return _incrStats; }, set: function (v) { _incrStats = v; }, enumerable: true });
  Object.defineProperty(TMS, '_incrPrimed', { get: function () { return _incrPrimed; }, set: function (v) { _incrPrimed = v; }, enumerable: true });
  Object.defineProperty(TMS, '_INCR_MAX_SPAN_MS', { get: function () { return _INCR_MAX_SPAN_MS; }, set: function (v) { _INCR_MAX_SPAN_MS = v; }, enumerable: true });
  Object.defineProperty(TMS, '_lastShadowOn', { get: function () { return _lastShadowOn; }, set: function (v) { _lastShadowOn = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order

  function A() { return window.APP || window.A; }

  var _active = false;
  var _tmEnabledGI = false;   // §TM_GI_AUTO: did TM itself switch Alt+G on? (→ TM switches it off on close)
  var _giHoldTimer = 0;       // §TM_GI_HOLD: 300ms "you stopped moving" timer → polish the held frame
  var _giConvergeRaf = 0;     // §TM_GI_HOLD: RAF driving N8AO accumulation to convergence on a held frame
  var _giConverging = false;  // §TM_GI_HOLD: true while the converge RAF is running
  var _panel = null;
  var _mode = 'DAY';
  var _ops = [];          // all ops sorted by start_ts
  var _cursor = 0;        // current time (ms) in the project timeline
  var _projectStart = 0;
  var _projectEnd = 0;
  // §GANTT_AXIS_OUTLIER (2026-08-04, prompts/4D_SCHEDULE_PERFECTION.md) — SEPARATE from _projectStart/
  // _projectEnd on purpose: those two remain the real, unqualified playback bounds (renderAtTime,
  // scrubbing, "every element must eventually build" — Prime Rule, do not touch). These are the DISPLAY
  // axis for the Gantt drawer only. Live-confirmed via __tmGanttBars on Hospital: one storey='_UNKNOWN'
  // op alone defined _projectEnd (1049d), while every real, storey-tagged bar finished by ~325d (31% of
  // that span) — the SAME '_UNKNOWN' bucket deriveBandRanks() (schedule_gate.js) already excludes from
  // its ladder ("the unknown bucket is not a floor"), just not yet from this axis. A single malformed
  // event should not be able to rescale the whole chart; it still gets built by the real timeline above.
  // User ruling: don't special-case '_UNKNOWN' as the label — refer back to the pattern already proven
  // correct in this file for exactly this problem (§GANTT_MINI_TRIM's 2nd-98th percentile bar trim),
  // root-cause-agnostic so it catches any wild outlier, not just the one already found.
  var _ganttAxisStart = 0;
  var _ganttAxisEnd = 0;
  var _days = [];          // distinct day start timestamps
  var _anchorDay = null;
  var _anchorHr = null;
  var _savedVisibility = [];
  var _highlightMeshes = [];
  // §Z_STACK_XRAY_STAGING (2026-08-03, prompts/GANTT_ACCURACY.md §Z_STACK_XRAY_STAGING) — guid → ms
  // the cursor must reach before that guid may render SOLID. Present ONLY for the defect
  // population (an element whose last support carrier finishes AFTER the element's own reveal) —
  // built once per TM activation by _buildXraySupportCache(), a pure function of already-extracted
  // geometry + the current _ops schedule. Never written to kernel_ops/DB — presentation only.
  var _tmXraySolidifyTs = {};
  var _tmXrayStagedTotal = 0;   // total guids ever eligible to stage, this activation (the "n=")
  var _tmXraySolidifiedN = 0;   // guids that have crossed their solidify ms so far (the "solidified=")

  // ══ §CPE_BUILDUP_PLACED (MEP_CLASH_REVEAL_MOVIE.md §88.3/§88.6e) ═════════════════════════════
  // §CPE_BUILDUP reports an AGGREGATE — `placed=N/63415` — and nothing else in this codebase names
  // a single element. So when Hospital's 8,899 m² Level 1 slab read as bare ground from the opening
  // seconds to the closing reveal (§88), no bake log could say whether it was placed at frame 50,
  // at frame 4000, or never: the op count reads identically whether the guid has no mesh at all,
  // has one that was left hidden, or has one that is drawn and occluded by something else. Those
  // are three different bugs with three different fixes, and a count cannot tell them apart.
  //
  // The observation rides along in the ONE traverse that already decides visibility — no second
  // pass, no second opinion about what is on screen. A WATCH SET (≤16 guids) is the only per-object
  // cost: one lookup in a null-prototype map per traversed object, and a getWorldPosition for the
  // handful that match.
  //
  // ⚠ The record PERSISTS across ticks and is never reset to MISSING. The traverse's incremental
  // path (`_incrOK`) legitimately SKIPS whole BatchedMesh/InstancedMesh objects on ticks where
  // nothing in them changed — resetting each tick would report those frames as "mesh vanished"
  // every time the delta path engaged. Only `op` (which comes from the schedule, not the scene) is
  // recomputed every tick; `mesh`/`visible`/`y`/`host` are last-observed values.
  var _bdWatch = null;          // guid -> { cls, storey } | null when not yet built, false when off
  var _bdState = Object.create(null);   // guid -> { op, mesh, visible, y, host }

  // Watch set, in the §88.6e order: an explicit `?watch=guid,guid` on the viewer URL wins; else the
  // largest slab per storey — the floor plates, which is exactly the population §88 is about and the
  // same pool §SLAB_BEAT already picks its beat from.
  function _bdWatchSet(app) {
    if (_bdWatch !== null) return _bdWatch;
    _bdWatch = false;
    try {
      var w = Object.create(null), n = 0, i;
      var q = (typeof location !== 'undefined' && location.search) ? location.search : '';
      var m = /[?&]watch=([^&]+)/.exec(q);
      if (m) {
        var gs = decodeURIComponent(m[1]).split(',');
        for (i = 0; i < gs.length && n < 16; i++) {
          var g = gs[i].trim(); if (!g) continue;
          w[g] = { cls: '?', storey: '?' }; n++;
        }
        if (n) {
          // Fill in cls/storey for the explicit set so the log line reads without a second lookup.
          if (app && app.db) {
            var keys = Object.keys(w).map(function (k) { return "'" + k.replace(/'/g, "''") + "'"; });
            var rr = app.db.exec('SELECT guid, ifc_class, storey FROM elements_meta WHERE guid IN (' + keys.join(',') + ')');
            if (rr.length) for (i = 0; i < rr[0].values.length; i++) {
              var rv = rr[0].values[i];
              if (w[rv[0]]) { w[rv[0]].cls = rv[1] || '?'; w[rv[0]].storey = rv[2] || '?'; }
            }
          }
          _bdWatch = w;
          console.log('§CPE_BUILDUP_PLACED_WATCH n=' + n + ' src=url guids=' + Object.keys(w).join(','));
          return _bdWatch;
        }
      }
      if (!app || !app.db) { _bdWatch = null; return null; }   // retry next tick, the DB may not be up yet
      var r = app.db.exec(
        'SELECT m.guid, m.ifc_class, m.storey, MAX(t.bbox_x * t.bbox_y) AS area ' +
        'FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid ' +
        "WHERE m.ifc_class = 'IfcSlab' AND t.bbox_x IS NOT NULL AND t.bbox_y IS NOT NULL " +
        'GROUP BY m.storey ORDER BY area DESC LIMIT 16'
      );
      if (!r.length || !r[0].values.length) {
        console.log('§CPE_BUILDUP_PLACED_WATCH n=0 src=slab-per-storey — this model has no IfcSlab with a bbox; pass ?watch=<guid> to name one');
        _bdWatch = false; return false;
      }
      var names = [];
      for (i = 0; i < r[0].values.length; i++) {
        var v = r[0].values[i];
        w[v[0]] = { cls: v[1] || '?', storey: v[2] || '?' };
        names.push((v[2] || '?') + ' ' + Math.round(v[3]) + 'm2');
        n++;
      }
      _bdWatch = w;
      console.log('§CPE_BUILDUP_PLACED_WATCH n=' + n + ' src=slab-per-storey ' + names.join(' | '));
    } catch (e) {
      console.warn('§CPE_BUILDUP_PLACED_WATCH_FAIL ' + (e && e.message));
      _bdWatch = false;
    }
    return _bdWatch;
  }

  function _bdRec(g) {
    var s = _bdState[g];
    if (!s) s = _bdState[g] = { op: 'pending', mesh: 'MISSING', visible: false, y: null, host: '-' };
    return s;
  }

  // Called from the traverse the moment a watched guid's rendering path has decided its visibility.
  // `obj` is optional and only used for the world Y — the number that says whether a drawn element
  // is above or below the ghost-ground plane (§88.6a), which is the whole reason y is reported.
  function _bdSeen(g, host, visible, obj) {
    var s = _bdRec(g);
    s.mesh = 'found'; s.host = host; s.visible = !!visible;
    if (obj && obj.getWorldPosition) {
      try { var v = new THREE.Vector3(); obj.getWorldPosition(v); s.y = +v.y.toFixed(3); } catch (e) {}
    }
  }

  // The bake reads this once per frame (cinema_maxq.js) and logs only what CHANGED, so a 4,699-frame
  // film costs a handful of lines rather than 4,699 × |watch|.
  window.tmWatchState = function () {
    if (!_bdWatch) return null;
    var out = {};
    for (var g in _bdWatch) {
      var s = _bdState[g];
      out[g] = { cls: _bdWatch[g].cls, storey: _bdWatch[g].storey,
                 op: s ? s.op : 'pending', mesh: s ? s.mesh : 'MISSING',
                 visible: s ? s.visible : false, y: s ? s.y : null, host: s ? s.host : '-' };
    }
    return out;
  };
  var _ganttVisible = false;
  var _dashVisible = false;
  // §TM-VARIANCE (GW_HOSPITAL_SHOWCASE_SPEC §ACTUAL): planned = TM's own generated timeline; actual = a
  // deterministic over-run VARIANT computed live on it. No shipped schedule data — a variant ON what's there.
  var _varVisible = false;
  var _p6Visible = false;      // §TM_P6_FOLD — the P6/MSP interop section (collapsed by default)
  var _p6ModsPromise = null;   // §TM_P6_FOLD — lazy-load promise cache for foreign_schedule/schedule_diff
  var _opsPlanned = null;   // snapshot of the planned _ops phase windows (taken when variance first opens)
  var _ganttTasks = [];  // computed task groups for click detection
  // §GANTT_BAR_IDENTITY (K0): the storey|phase rollup below used to be recomputed from scratch on
  // EVERY drawGanttMini() call — i.e. once per playback frame, walking all 63,415 ops on Hospital.
  // The rollup only changes when _ops changes, so it is now cached behind this flag and the draw
  // path is pure drawing.
  var _ganttDirty = true;
  var _ganttIdentified = 0, _ganttUnidentified = 0;   // §GANTT_BAR_IDENTITY counters
  // T3 (4D_CAPTURE_AND_FALLBACK §3.1): native-4D coverage of the active schedule.
  var _capActive = false;   // true when the timeline used a captured IFC schedule
  var _coveredCount = 0;    // elements driven by real captured task dates
  var _coveragePct = 0;     // covered / total * 100 (for the coverage badge)
  var _sCurveData = null;  // cached S-curve points (computed once)
  var _shopfloor = null, _shopfloorLoading = false;  // §E2b: PP_Order cost-element stacked S-curve cache

  // §S278: Cached temp objects — lazy-init on first use (THREE may not be loaded yet)
  var _tmV1, _tmV2, _tmV3, _tmM4, _tmColor, _tmRay;
  function _tmEnsure() {
    if (_tmV1) return;
    _tmV1 = new THREE.Vector3(); _tmV2 = new THREE.Vector3(); _tmV3 = new THREE.Vector3();
    _tmM4 = new THREE.Matrix4();
    _tmColor = new THREE.Color();
    _tmRay = new THREE.Raycaster();
    console.log('§TM_LAZY_INIT cached THREE objects created');
  }

  // ── Query ops from DB ──
  function loadOps() {
    var app = A();
    if (!app || !app.db) return [];
    try {
      var r = app.db.exec(
        'SELECT id, timestamp, op_type, parameters, input_guids, output_guid ' +
        'FROM kernel_ops WHERE undone = 0 ORDER BY timestamp'
      );
      if (!r.length) return [];
      return r[0].values.map(function(row) {
        var params = row[3] ? JSON.parse(row[3]) : {};
        return {
          id: row[0], start_ts: row[1], op_type: row[2],
          end_ts: params._end_ts || (row[1] + 60000), // default 1 min if no end
          parameters: params,
          input_guids: row[4] ? JSON.parse(row[4]) : [],
          output_guid: row[5] || null
        };
      });
    } catch(e) { return []; }
  }

  // §GANTT_OPS_BOOKKEEPING_LEAK (2026-08-04): _ops (loadOps()) intentionally carries EVERY kernel_ops
  // row, not just construction ops — copyGuids(false) and other consumers legitimately want the full
  // mixed history (picks, GRID_*, etc.), so the fix does NOT belong in loadOps()'s query. But a
  // bookkeeping op like BUILDING_OPEN (streaming.js, commitOp with no ts -> Date.now(), real
  // wall-clock, no storey/phase, no real output_guid) has no business defining the PROJECT'S OWN
  // timeline bounds — traced live as the "_UNKNOWN/Architecture outlier" behind §GANTT_AXIS_OUTLIER
  // (#1175, which qualified the DISPLAY axis but left _projectStart/_projectEnd — the real playback
  // bounds scrubbing/renderAtTime use — still polluted, unmeasured until now). Scoped to exactly the
  // two places that build the construction TIMELINE from _ops: this function's bounds, and
  // buildGanttTasks()'s bar grouping.
  function _placeOps() { return _ops.filter(function (o) { return o.op_type === 'ELEMENT_PLACE'; }); }

  // computeDays() — THIN WRAPPER (§S53, F3). The model lives in gantt_model.js (GanttModel
  // .computeDays); this function owns only the STATE assignment and the read-only debug hook, which
  // is what belongs in time_machine.js. Every rule — the day ladder, the unqualified playback bounds,
  // and §GANTT_AXIS_OUTLIER's Tukey-qualified DISPLAY axis — moved there verbatim with its comments.
  function computeDays() {
    var GM = (typeof window !== 'undefined' && window.GanttModel) || null;
    if (!GM) { console.warn('§LOAD_FAIL gantt_model.js — computeDays skipped, timeline bounds unchanged'); return; }
    // §GANTT_AXIS_COVERS_TASKS (§S65 STAGE 3) — pass the real authored windows so the display axis
    // covers every bar buildTasks() now draws at its task's own span. buildTaskIndex() is the same
    // source buildGanttTasks() uses, so the two layers cannot disagree about what a task's window is.
    var _axIdx = null;
    try { _axIdx = TMS.buildTaskIndex(); } catch (e) { _axIdx = null; }
    var r = GM.computeDays(_placeOps(), _axIdx && _axIdx.tasks);
    _days = r.days;
    if (r.projectStart !== null) { _projectStart = r.projectStart; _projectEnd = r.projectEnd; }
    _ganttAxisStart = r.axisStart; _ganttAxisEnd = r.axisEnd;
    // (G-3 fix 2026-08-11: a stale byte-duplicate of the axis block sat here reading `_ops` —
    // bookkeeping ops included — and OVERWROTE the qualified axis, so the display axis absorbed
    // BUILDING_OPEN. Removed; GanttModel.computeDays is now the single authority.)
    // §GANTT_AXIS_RAW (2026-08-18, 4D_GANTT_TM_REFACTOR.md — the axis's own near-duplicate fix) —
    // read-only debug hook, same convention as __tmGanttBarsRaw, so this layer is verifiable by a
    // witness instead of only by reading source. Exposes both the qualified axis actually drawn
    // against and the true unqualified bounds, so a probe can directly check "does any bar's real
    // end exceed what it's scaled against" without a second, separate computation.
    try {
      window.__tmGanttAxis = { axisStart: _ganttAxisStart, axisEnd: _ganttAxisEnd,
        projectStart: _projectStart, projectEnd: _projectEnd, n: r.n };
    } catch (e) {}
    // §S58 (§S58.2): the qualified DISPLAY axis vs the true playback end was written to the debug
    // hook above and NEVER logged, though §GANTT_AXIS_OUTLIER's own header names that exact
    // difference as the cause of a prior bug class ("a bar's DATA could be correct while its DRAWN
    // pixel position was still wrong"). A reader had to poke a global. Now it is a log line.
    var _axD = 86400000;
    console.log('§GANTT_AXIS n=' + r.n +
      ' axisDays=' + (r.axisEnd != null ? ((r.axisEnd - r.axisStart) / _axD).toFixed(1) : 'n/a') +
      ' trueDays=' + (r.projectEnd != null ? ((r.projectEnd - _projectStart) / _axD).toFixed(1) : 'n/a') +
      ' qualifiedAway=' + (r.axisEnd != null && r.projectEnd != null
        ? ((r.projectEnd - r.axisEnd) / _axD).toFixed(1) + 'd' : 'n/a') +
      ' (display axis is Tukey-qualified; playback bounds are NOT — they must reach every element)');
  }

  // ── Scene: emerge from nothing ──
  // placed (start_ts <= cursor AND end_ts <= cursor) → solid original material
  // frontier (start_ts <= cursor < end_ts) → orange glow, just being installed
  // future (start_ts > cursor) → invisible
  // At cursor <= projectStart: completely empty scene
  // At cursor >= projectEnd: fully built, all solid, no glow

  var _prevCursor = 0; // track previous cursor for frontier detection
  var _sunCycle = false;  // day/night toggle
  var _lastElDeg = undefined;  // §S277b: last sun elevation for adaptive tick speed
  var _camFollow = false; // camera follow toggle
  var _camTarget = null;  // smoothed follow target (persists across ticks)
  var _camAngle = 0;      // slow orbit azimuth (radians), cinematic drift
  var _camUserInteracted = 0; // timestamp of last manual orbit interaction
  var _camLogTick = 0;    // throttle §CAM_FOLLOW logging

  // ══════════���═══════════════════════════════════════════════════════
  // §S260c: CINEMATIC DIRECTOR — Film Studio storyboard approach
  // Pre-plans entire camera path when Eye is pressed. Each "scene" is
  // a dense construction event. Between scenes: continuous crane shots.
  // Every 3-4 scenes: establishing orbit with sun sweep.
  // ══════���═══════════════════════════��═══════════════════════════════
  var _cineStoryboard = [];   // [{center:V3, guids:[], startIdx, endIdx, angle, count}]
  var _cineSceneIdx = 0;      // current scene in storyboard
  var _cineBeat = 'closeup';  // 'closeup' | 'establishing' | 'transit'
  var _cineTick = 0;          // ticks in current beat
  var _cineNextTarget = null; // current scene center (V3)
  var _cineTransitFrom = null;
  var _cineTransitTo = null;
  var _cineEstabAngle = 0;
  var _cineEstabStart = null; // §S260d: predetermined establishing arc start
  var _cineEstabEnd = null;   // §S260d: predetermined establishing arc end
  var _cineOpenStart = null;  // §S260d: opening shot camera position
  var _cineOpenTarget = null; // §S260d: opening shot look-at target
  var _BEAT_OPENING = 50;     // §S260e: 4s establishing orbit (50 ticks × 80ms) — full building visible, then deconstruct
  var _cineSeenZones = {};    // spatial zone keys already featured
  var _cineCloseupCount = 0;  // scenes since last establishing
  var _BEAT_CLOSEUP = 20;     // §S260f: ticks per scene (~1.6s) — brisk pace, no lingering
  var _BEAT_TRANSIT = 12;     // §S260f: ticks crane travel (~1s)
  var _BEAT_ESTAB = 20;       // §S260f: ticks establishing orbit (~1.6s)
  var _cinePeeled = [];       // meshes temporarily hidden for clear line-of-sight
  var _cineHeroSlowdown = false; // true during hero beats → slow tick to hourly

  // ── Restore peeled meshes (called every beat transition + every tick before re-peel) ──
  function restorePeeled() {
    for (var i = 0; i < _cinePeeled.length; i++) {
      var obj = _cinePeeled[i];
      if (obj._cinePeeled) {
        // §S278: dispose clone, restore original material (prevents leak per peel cycle)
        if (obj._cinePeelOrigMat) {
          var clone = obj.material;
          obj.material = obj._cinePeelOrigMat;
          clone.dispose();
          delete obj._cinePeelOrigMat;
        }
        delete obj._cinePeeled;
      }
    }
    _cinePeeled = [];
  }

  // ── Storyboard computation (called once on Drone press) ──
  // Three scene types:
  //   'flythrough' — tight on devices appearing in series (cam tracks along chain)
  //   'panoramic'  — wide orbit over dense construction area with shadow sweep
  //   'hero'       — tight 360° orbit around a single significant element (column, equipment)
  var _PANORAMIC_THRESHOLD = 30; // §S260d: clusters with ≥30 elements → panoramic (was 12 — fewer, better scenes)
  var _HERO_INTERVAL = 8;        // §S260d: insert a hero shot every 8 scenes (was 5 — too frequent)
  var _FLYTHROUGH_DIST = 12;     // §S260d: metres from cluster — was 5 (too close, inside geometry)
  var _PANORAMIC_DIST = 25;      // §S260c: metres back for panoramic orbit (was 40, tighter)
  var _HERO_DIST = 8;            // §S260d: metres from element for hero orbit (was 3 — too close)

  // ── Nearest-neighbour spatial chain: orders GUIDs into a walk path ──
  // Produces an array of Vector3 positions forming a smooth installation sequence.
  // e.g., sprinklers appearing left→right along a corridor.
  function buildSpatialChain(guids, guidPosMap) {
    var pts = [];
    for (var i = 0; i < guids.length; i++) {
      var p = guidPosMap[guids[i]];
      if (p) pts.push(p.clone());
    }
    if (pts.length < 2) return pts;
    // Start from the leftmost point (min x) — gives predictable direction
    var startIdx = 0;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].x < pts[startIdx].x) startIdx = i;
    }
    var chain = [pts[startIdx]];
    var used = {}; used[startIdx] = true;
    var cur = startIdx;
    for (var step = 1; step < pts.length; step++) {
      var bestDist = Infinity, bestJ = -1;
      for (var j = 0; j < pts.length; j++) {
        if (used[j]) continue;
        var d = pts[cur].distanceToSquared(pts[j]);
        if (d < bestDist) { bestDist = d; bestJ = j; }
      }
      if (bestJ >= 0) { chain.push(pts[bestJ]); used[bestJ] = true; cur = bestJ; }
    }
    return chain;
  }

  // §S260d: Progressive storyboard — cluster ops into scenes
  // fromIdx/toIdx allow chunked processing: first call does ops[0..500], rest done in background.
  function _clusterOps(ops, guidPosMap, fromIdx, toIdx) {
    var scenes = [];
    var CLUSTER_RADIUS_XZ = 20; // §S260d: wider clusters = fewer, denser scenes (was 12)
    var i = fromIdx;
    while (i < toIdx) {
      var op = ops[i];
      var guid = op.output_guid || (op.input_guids && op.input_guids[0]);
      var pos = guid ? guidPosMap[guid] : null;
      var cls = (op.parameters && op.parameters.cls) || '';
      if (!pos) { i++; continue; }

      var cx = pos.x, cz = pos.z, count = 1;
      var guids = [guid];
      var startIdx = i, endIdx = i;
      var startTs = op.start_ts;
      var endTs = op.end_ts || op.start_ts;
      var cy = pos.y;

      for (var j = i + 1; j < ops.length && j < i + 300; j++) {
        var g2 = ops[j].output_guid || (ops[j].input_guids && ops[j].input_guids[0]);
        var p2 = g2 ? guidPosMap[g2] : null;
        var cls2 = (ops[j].parameters && ops[j].parameters.cls) || '';
        if (!p2) continue;
        if (cls2 !== cls && count < 3) { /* allow first 2 mixed */ }
        else if (cls2 !== cls && count >= 3) continue;
        var dx = p2.x - cx/count, dz = p2.z - cz/count;
        var distXZ = Math.sqrt(dx*dx + dz*dz);
        if (distXZ < CLUSTER_RADIUS_XZ) {
          cx += p2.x; cz += p2.z; cy += p2.y; count++;
          guids.push(g2);
          endIdx = j;
          if (ops[j].end_ts > endTs) endTs = ops[j].end_ts;
        } else if (count > 3) break;
      }

      // §S260d: Minimum cluster size — 8 for large buildings, 3 for small
      var minCluster = ops.length > 5000 ? 8 : 3;
      if (count >= minCluster) {
        var center = new THREE.Vector3(cx/count, cy/count, cz/count);
        var type = count >= _PANORAMIC_THRESHOLD ? 'panoramic' : 'flythrough';
        var chain = null;
        if (type === 'flythrough' && guids.length >= 3) {
          chain = buildSpatialChain(guids, guidPosMap);
        }
        scenes.push({
          center: center, guids: guids, startIdx: startIdx, endIdx: endIdx,
          count: count, type: type, cls: cls,
          startTs: startTs, endTs: endTs,
          chain: chain, angle: Math.random() * Math.PI * 2, _angleLazy: true,
          _arcV: 4 // §S260d: cache version marker
        });
        i = endIdx + 1;
      } else {
        i++;
      }
    }
    return { scenes: scenes, nextIdx: i >= toIdx ? toIdx : i };
  }

  // §S260e: Finalize scenes — spatial sort (bottom-up Y, sweep X), add heroes (desktop)
  function _finalizeScenes(scenes, guidPosMap, isMobile) {
    // §S260e: Sort scenes spatially — foundation (low Y) first, then left-to-right (X sweep)
    // This eliminates erratic camera jumps between distant clusters.
    scenes.sort(function(a, b) {
      var dy = a.center.y - b.center.y;
      if (Math.abs(dy) > 2.0) return dy; // >2m Y difference = different storey band
      return a.center.x - b.center.x;    // same band = sweep left-to-right
    });
    // §S260e: Log scene order after sort for self-review
    var orderLog = scenes.slice(0, 8).map(function(s, i) {
      return i + ':' + s.type.charAt(0) + ' y=' + s.center.y.toFixed(1) + ' x=' + s.center.x.toFixed(1) + ' n=' + s.count;
    });
    console.log('§CINE_SCENE_ORDER (first 8): ' + orderLog.join(' | '));

    if (isMobile) {
      var MAX_SCENES_MOBILE = 10;
      if (scenes.length > MAX_SCENES_MOBILE) scenes.length = MAX_SCENES_MOBILE;
      return scenes;
    }
    // Desktop: insert hero shots every N scenes
    var withHeroes = [];
    for (var h = 0; h < scenes.length; h++) {
      withHeroes.push(scenes[h]);
      if ((h + 1) % _HERO_INTERVAL === 0 && scenes[h].guids.length > 0) {
        var heroGuid = scenes[h].guids[scenes[h].guids.length - 1];
        var heroPos = guidPosMap[heroGuid];
        if (heroPos) {
          withHeroes.push({
            center: heroPos.clone(), guids: [heroGuid], startIdx: scenes[h].startIdx,
            endIdx: scenes[h].endIdx, count: 1, zoneKey: 'hero',
            type: 'hero', firstTs: scenes[h].firstTs, chain: null,
            angle: Math.random() * Math.PI * 2, _angleLazy: true
          });
        }
      }
    }
    return withHeroes;
  }

  var _bgBuildRaf = 0; // rAF handle for background storyboard building

  // §S260d: Progressive storyboard — compute first chunk immediately, build rest in background.
  // Returns the initial scenes (enough for first ~3 scenes). Appends more via rAF chunks.
  function computeStoryboard(ops, guidPosMap) {
    var _isMob = !!(window._isMobile || window._isMobileTM);
    var FIRST_CHUNK = Math.min(500, ops.length); // first 500 ops = instant (<5ms)

    // Phase 1: immediate — first chunk
    var result = _clusterOps(ops, guidPosMap, 0, FIRST_CHUNK);
    var allRawScenes = result.scenes;
    var cursor = result.nextIdx;

    // Finalize what we have so far
    var initial = _finalizeScenes(allRawScenes.slice(), guidPosMap, _isMob);

    var nFly = 0, nPan = 0, nHero = 0;
    for (var m = 0; m < initial.length; m++) {
      if (initial[m].type === 'flythrough') nFly++;
      else if (initial[m].type === 'panoramic') nPan++;
      else nHero++;
    }
    console.log('§CINE_STORYBOARD_INIT scenes=' + initial.length +
      ' (fly=' + nFly + ' pan=' + nPan + ' hero=' + nHero +
      ') from first ' + FIRST_CHUNK + '/' + ops.length + ' ops');

    if (cursor >= ops.length || _isMob) {
      // Small building or mobile — done
      return initial;
    }

    // Phase 2: background — process remaining ops in rAF chunks while playing
    // We mutate _cineStoryboard directly (it's the live array)
    if (_bgBuildRaf) { cancelAnimationFrame(_bgBuildRaf); _bgBuildRaf = 0; }
    var CHUNK_SIZE = 1000; // ops per frame (~2-5ms each)
    function buildChunk() {
      if (cursor >= ops.length) {
        // All done — re-finalize with full scene list
        var final = _finalizeScenes(allRawScenes, guidPosMap, false);
        // Replace storyboard from current scene onwards (keep already-played scenes)
        var keepN = _cineSceneIdx;
        for (var ri = 0; ri < final.length; ri++) {
          _cineStoryboard[keepN + ri] = final[ri];
        }
        _cineStoryboard.length = keepN + final.length;
        var nf2=0, np2=0, nh2=0;
        for (var mm = 0; mm < _cineStoryboard.length; mm++) {
          if (_cineStoryboard[mm].type === 'flythrough') nf2++;
          else if (_cineStoryboard[mm].type === 'panoramic') np2++;
          else nh2++;
        }
        console.log('§CINE_STORYBOARD_DONE scenes=' + _cineStoryboard.length +
          ' (fly=' + nf2 + ' pan=' + np2 + ' hero=' + nh2 + ') from ' + ops.length + ' ops');
        TMS.viewerStatus('🚁 ' + _cineStoryboard.length + ' scenes ready — press ▶ to play');
        _bgBuildRaf = 0;
        // Cache full storyboard
        TMS.cachePut('movie', _cineStoryboard);
        return;
      }
      var end = Math.min(cursor + CHUNK_SIZE, ops.length);
      var chunk = _clusterOps(ops, guidPosMap, cursor, end);
      for (var ci = 0; ci < chunk.scenes.length; ci++) allRawScenes.push(chunk.scenes[ci]);
      cursor = end;
      console.log('§CINE_BG_CHUNK ops=' + cursor + '/' + ops.length + ' rawScenes=' + allRawScenes.length);
      _bgBuildRaf = requestAnimationFrame(buildChunk);
    }
    _bgBuildRaf = requestAnimationFrame(buildChunk);

    return initial;
  }

  // ── Occlusion-aware angle selection ──
  // Tries 8 angles around the target at the given distance + 3/4 above elevation.
  // Raycasts from each candidate camera position to the target center.
  // Returns the first angle with a clear line of sight; falls back to random if all blocked.
  function pickClearAngle(center, dist) {
    var app = A();
    if (!app || !app.scene) return Math.random() * Math.PI * 2;
    var ray = new THREE.Raycaster();
    ray.far = dist + 5;
    var meshes = [];
    app.scene.traverse(function(o) {
      if (o.isMesh && o.visible) meshes.push(o);
    });
    if (!meshes.length) return Math.random() * Math.PI * 2;

    var elevation = dist * 0.5; // 3/4 above angle — half dist up
    for (var trial = 0; trial < 8; trial++) {
      var az = (trial / 8) * Math.PI * 2;
      var camPos = new THREE.Vector3(
        center.x + Math.cos(az) * dist,
        center.y + elevation,
        center.z + Math.sin(az) * dist
      );
      var dir = new THREE.Vector3().subVectors(center, camPos).normalize();
      ray.set(camPos, dir);
      var hits = ray.intersectObjects(meshes, false);
      // Clear if no hit, or first hit is beyond 80% of the distance (close to target = OK)
      if (!hits.length || hits[0].distance > dist * 0.8) {
        return az;
      }
    }
    // All blocked — pick the one with the farthest first hit (least obstructed)
    var bestAz = 0, bestDist = 0;
    for (var trial = 0; trial < 8; trial++) {
      var az = (trial / 8) * Math.PI * 2;
      var camPos = new THREE.Vector3(
        center.x + Math.cos(az) * dist,
        center.y + elevation,
        center.z + Math.sin(az) * dist
      );
      var dir = new THREE.Vector3().subVectors(center, camPos).normalize();
      ray.set(camPos, dir);
      var hits = ray.intersectObjects(meshes, false);
      var d = hits.length ? hits[0].distance : dist + 10;
      if (d > bestDist) { bestDist = d; bestAz = az; }
    }
    console.log('§CINE_ANGLE_FALLBACK center=' + center.x.toFixed(1) + ',' + center.z.toFixed(1) +
      ' bestDist=' + bestDist.toFixed(1));
    return bestAz;
  }

  // Build guidPosMap from current scene graph (call once when storyboard is computed)
  function buildGuidPosMap() {
    var app = A();
    var map = {};
    if (!app || !app.scene) return map;
    var tmpV = new THREE.Vector3();
    app.scene.traverse(function(obj) {
      if (!obj.userData) return;
      if (obj.userData.guid && obj.isMesh) {
        obj.getWorldPosition(tmpV);
        if (tmpV.x !== 0 || tmpV.y !== 0 || tmpV.z !== 0) {
          map[obj.userData.guid] = tmpV.clone();
        }
      } else if (obj.isBatchedMesh && app._batchMeta && app._batchMeta[obj.id]) {
        // §S260c: BatchedMesh GUIDs are in app._batchMeta, not obj.userData.guids
        var bmetas = app._batchMeta[obj.id];
        var m4 = new THREE.Matrix4();
        for (var idx = 0; idx < bmetas.length; idx++) {
          try {
            obj.getMatrixAt(bmetas[idx].slotId, m4);
            tmpV.setFromMatrixPosition(m4);
            if (tmpV.x !== 0 || tmpV.y !== 0 || tmpV.z !== 0) {
              map[bmetas[idx].guid] = tmpV.clone();
            }
          } catch(e) {}
        }
      } else if (obj.isInstancedMesh && app._instanceMeta && app._instanceMeta[obj.id]) {
        // §S260c: InstancedMesh GUIDs in app._instanceMeta
        var imetas = app._instanceMeta[obj.id];
        var m4 = new THREE.Matrix4();
        for (var idx = 0; idx < imetas.length; idx++) {
          try {
            obj.getMatrixAt(idx, m4);
            tmpV.setFromMatrixPosition(m4);
            if (tmpV.x !== 0 || tmpV.y !== 0 || tmpV.z !== 0) {
              map[imetas[idx].guid] = tmpV.clone();
            }
          } catch(e) {}
        }
      }
    });
    console.log('§CINE_GUIDMAP entries=' + Object.keys(map).length);
    return map;
  }
  var _shadowLogTick = 0; // throttle §SHADOW_FRONTIER logging
  var LARGE_BUILDING = 50000; // §S259: threshold for disabling expensive TM effects
  var _isLargeBuilding = false;

  var _zeroMatrix = null; // lazy init
  var _whiteColor = null; // §S260f: reusable white for BatchedMesh slot reset
  var _savedInstanceMatrices = {}; // meshId → { idx → Matrix4 }
  var _dlodPausedByTm = false;     // §DLOD_TM_OWNERSHIP — only re-enable dlod.js if THIS module paused it (a user's own DLOD-off setting is not ours to flip)

  // ── TM_DLOD_SCALE.md Phase 3 (redesigned 2026-07-20 per live LTU testing + user ask):
  // representation-by-VIEW, not by construction-time activity. Frontier (building now) and
  // recent (just finished, amber linger) always stay real — unchanged. Everything else that's
  // `placed` (built) is real ONLY if in-view (distance ≤50m AND in camera frustum, the exact S261
  // LOD0/LOD2 tier boundary — done/S261_DLOD_MILLION.md line 24), else a wireframe box. A pure
  // time-window swap (frontier∪recent∪lookahead vs placed) boxed the WHOLE building the instant it
  // engaged this late in construction (106K/122K placed) — including whatever the camera was
  // pointed at, since time-since-built has nothing to do with what's on screen. This still does
  // NOT touch `setGeometryAt` — real meshes stay resident, box InstancedMeshes are SEPARATE
  // objects, both toggled via the same setVisibleAt/zero-scale visibility mechanism TM already uses.
  var DLOD_TM_MIN_ELEMENTS = LARGE_BUILDING; // reuse §S259's existing 50000 gate, not a new number
  var DLOD_VIEW_DIST = 50; // metres — same threshold S261's retracted LOD0/LOD2 tiers used
  var DLOD_VIEW_DIST_SQ = DLOD_VIEW_DIST * DLOD_VIEW_DIST;
  var _dlodProxyOn = false;      // user toggle (pill), default OFF — bit-identical to today when OFF
  var _dlodBoxIndex = null;      // guid → { mesh, idx, matrix (real Matrix4), pos, radius, visible }
  var _dlodBoxMeshes = null;     // [InstancedMesh, ...] one per discipline
  var _dlodBoxBld = null;        // building the index was built for
  var _lastProxyEngaged = null;  // edge-detection (mirrors _lastShadowOn) for a forced full pass
  // §129.51c (2026-09-19) — the REAL-MESH twin of _lastProxyEngaged. That one forces a full sync of
  // the proxy's own BOXES on an engage/disengage edge; nothing did the same for the real instance
  // rows, so disengaging stopped the proxy hiding MORE without ever un-hiding what it already hid.
  var _dlodPrevOn = null;
  var _dlodFrustum = null, _dlodPSM = null, _dlodSphere = null; // per-tick scratch (built lazily, reused)
  var _dlodCamPos = null;
  // §DLOD_TM_CAMGUARD (2026-07-20): last camera pose-signature seen on a DLOD-engaged tick — see
  // §10's root cause. Reuses _giHoldCamSig's exact string-diff shape (TM_GI_HOLD_CAMGUARD,
  // ported PR #816), not a new threshold: cheap position+quaternion string, compared every tick.
  var _dlodLastCamSig = null;

  function _dlodEngaged(app) {
    // §5.4 Streaming interplay: refuse to engage until streaming drains (Fly Tour §FLY_STREAM_WAIT doctrine)
    // §129.50 (2026-09-19, red1: "DLOD yes most likely.. so study how to disable during Reveal") —
    // THE REVEAL ROUND OWNS INSTANCE VISIBILITY WHILE IT IS UP, so the proxy stands down.
    // Both systems hide an instanced element the same way — by zero-scaling its row — and only one
    // of them writes every tick. The reveal writes ONCE per slot (cpeRevealApplyVisual returns early
    // on an unchanged key), the proxy writes continuously, so the proxy always wins and ARC comes
    // back on the frame after it is hidden. MEASURED on the delivered Hospital film: ARC gone at
    // exactly 102.0 s and solid again at 102.1 s, one frame.
    // ⚠ THIS IS NOT THE OLD BUG IT LOOKS LIKE. time_machine.js has never consulted hiddenDiscs, and
    // that is fine — those lines are from 2026-08-15, on main, and the reveal worked with them for
    // a month. What changed is that --dlod-proxy made _dlodProxyOn reachable from a headless bake
    // for the first time (2026-09-19), so a second writer started competing for those rows.
    // red1's own logs are the proof: Hospital_groundfix_check3.log, 06:38 the same day, has
    // reveal=1 AND the load-path batch unpack AND dlod=0, and its reveal was fine.
    // Standing down is the honest fix rather than teaching the proxy about hiddenDiscs: during the
    // round the camera is flying the model to SHOW one discipline at a time, which is the one moment
    // a draw-cost proxy has nothing useful to say, and it costs only the round's own seconds.
    if (app && app._cpeRevealVisualKey) return false;
    // §129.51 — and the STOREY reveal, for the same reason plus a sharper one: that leg SNAPSHOTS
    // the scene at arm and writes the snapshot back at restore, so anything the proxy is hiding at
    // that instant becomes permanent. Measured on Hospital: armed with 2,674 rows zero-scaled,
    // handed back 2,981 members off. Standing down covers arm-to-restore, not just the tint window.
    if (app && app._storeyRevealArmed) return false;
    return _dlodProxyOn && _isLargeBuilding && !app.streaming;
  }

  // §DLOD_VF_CAMGUARD (2026-08-05, cross-session finding — independently root-caused in both
  // 4D_SCHEDULE_PERFECTION.md and CINEMA_PATH_EDITOR.md's own SESSION HANDOFF). The buildup-
  // visibility gate used to be hardcoded to the main camera always, even while CPE's POV panel
  // scrubs its own `vfCam` independently (main camera stays parked during a scrub) — so the POV
  // inset could show buildup-hidden geometry gated by the WRONG camera's frustum. Pulled out as its
  // own pure function (same precedent as `_retimeSpan`'s own header: kept self-contained so a
  // witness can slice the real decision out of `renderAtTime` instead of re-implementing it).
  // Returns the POV camera while CPE's viewfinder is genuinely on, else the main camera — never
  // guesses, reads CPE's own exposed `activePOVCamera()` accessor.
  function _dlodResolveCamera(app) {
    var povCam = (typeof window !== 'undefined' && window.APP && window.APP.cinemaPathEditor &&
      window.APP.cinemaPathEditor.activePOVCamera) ? window.APP.cinemaPathEditor.activePOVCamera() : null;
    return povCam || app.camera;
  }

  // In-view = the S261 LOD0/LOD2 boundary: close AND actually in the camera's frustum. Fails open
  // (treats as in-view/real) for an unknown guid rather than risk hiding something real by mistake.
  // §DLOD_ONSCREEN_FIX (2026-09-19, red1 on the Hospital bake: "DLOD occured when at a distance,
  // which should not as it impairs the scenes"). The old test boxed anything more than
  // DLOD_VIEW_DIST (50 m) from the camera, WITHOUT asking whether it was on screen — the frustum
  // check only ran for things already inside 50 m. Hospital's envelope is far bigger than 50 m and
  // its closing orbit pulls back well beyond it, so at the one shot that shows the finished
  // building, every element was "out of view" and the whole model rendered as a wireframe cage.
  // Boxing is now what the button always claimed: OFF SCREEN. Distance alone never boxes anything.
  function _dlodInView(g) {
    var b = _dlodBoxIndex && _dlodBoxIndex[g];
    if (!b || !_dlodCamPos) return true;
    _dlodSphere.center.copy(b.pos); _dlodSphere.radius = b.radius;
    if (_dlodFrustum.intersectsSphere(_dlodSphere)) return true;   // on screen at ANY distance
    return _dlodCamPos.distanceToSquared(b.pos) <= DLOD_VIEW_DIST_SQ;  // off screen but close: keep real
  }

  function _dlodDisposeBoxes() {
    if (!_dlodBoxMeshes) return;
    for (var oi = 0; oi < _dlodBoxMeshes.length; oi++) {
      var om = _dlodBoxMeshes[oi];
      if (om.parent) om.parent.remove(om);
      om.geometry.dispose(); om.material.dispose();
    }
    _dlodBoxMeshes = null; _dlodBoxIndex = null; _dlodBoxBld = null;
  }

  function _dlodBuildBoxes(app) {
    if (_dlodBoxIndex && _dlodBoxBld === app.activeBuilding) return; // cached per building
    if (!app.scene || typeof THREE === 'undefined' || !app.dbQuery || !app.ifc2three) {
      console.log('§DLOD_TM_BUILD_SKIP deps'); return;
    }
    var t0 = (performance && performance.now) ? performance.now() : 0;
    var rows;
    try {
      rows = app.dbQuery("SELECT t.guid, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z, m.discipline" +
        " FROM element_transforms t JOIN elements_meta m ON m.guid = t.guid WHERE t.center_x IS NOT NULL") || [];
    } catch (e) { console.log('§DLOD_TM_BUILD_SKIP query ' + e.message); return; }
    var byDisc = {};
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i][7] || '_'; (byDisc[d] = byDisc[d] || []).push(rows[i]);
    }
    var discs = Object.keys(byDisc);
    if (!discs.length) { console.log('§DLOD_TM_BUILD_EMPTY rows=' + rows.length); return; }
    if (!_zeroMatrix) _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    _dlodDisposeBoxes(); // drop any prior building's boxes before building the new set
    var geo = new THREE.BoxGeometry(1, 1, 1);
    var index = Object.create(null), meshes = [], total = 0;
    var m4 = new THREE.Matrix4(), _pos = new THREE.Vector3(), _scl = new THREE.Vector3(), _q = new THREE.Quaternion();
    for (var di = 0; di < discs.length; di++) {
      var disc = discs[di], drows = byDisc[disc];
      var color = app.DISC_COLORS[disc] || app.DEFAULT_COLOR;
      // 2026-07-20 user testing on LTU (day159, 106K/122K placed): solid boxes read as a wholesale
      // LOD400 loss the instant the toggle engages, not a graceful proxy — switched to wireframe
      // (user ask) matching _drawBboxPlaceholders' actual established look (streaming.js:221),
      // same as the load-time placeholder language feedback_no_fake_lod_unbreakable.md points at.
      var mat = new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.4 });
      var im = new THREE.InstancedMesh(geo, mat, drows.length);
      im.frustumCulled = false;
      im.userData.isBboxPlaceholder = true; // §S260d proven pick-exclusion (picking.js:257) — same flag as load-time boxes
      im.userData.isDlodTmProxy = true; // distinct marker — _drawBboxPlaceholders' load-time boxes share
      // isBboxPlaceholder + the same BoxGeometry/wireframe material, so this is the only reliable way
      // to tell "DLOD Phase 3 box" apart from an ordinary streaming placeholder when debugging.
      for (var j = 0; j < drows.length; j++) {
        var r = drows[j], p = app.ifc2three(r[1], r[2], r[3]);
        var bx = r[4] || 0.3, by = r[5] || 0.3, bz = r[6] || 0.3;
        _pos.set(p.x, p.y, p.z);
        _scl.set(bx, bz, by); // bbox (x, z, y) — axis swap matches _buildMergedGhost
        m4.compose(_pos, _q, _scl);
        im.setMatrixAt(j, _zeroMatrix); // hidden until _dlodUpdateBoxes decides otherwise
        // §DLOD_VIEW: pos/radius cached once here — the SAME position both the box-visibility sync
        // and the real-mesh hide decision read every tick, no per-tick decompose/getWorldPosition.
        index[r[0]] = { mesh: im, idx: j, matrix: m4.clone(), pos: _pos.clone(),
          radius: Math.sqrt(bx * bx + by * by + bz * bz) * 0.5, visible: false };
        total++;
      }
      im.instanceMatrix.needsUpdate = true;
      im.visible = true; // per-instance zero-scale hides; group itself stays visible
      app.scene.add(im);
      meshes.push(im);
    }
    _dlodBoxIndex = index; _dlodBoxMeshes = meshes; _dlodBoxBld = app.activeBuilding;
    _lastProxyEngaged = null; // force a full sync pass on the next tick after a (re)build
    var ms = ((performance && performance.now) ? performance.now() : 0) - t0;
    console.log('§DLOD_TM_BUILD bld=' + app.activeBuilding + ' boxes=' + total + ' discs=' + discs.length + ' build_ms=' + ms.toFixed(0));
  }

  // §129.56 — census throttle state. 2,000 ms is a compromise read off this project's own bake
  // rates: at the measured 0.79-1.42 s/frame of a 1080p Hospital bake that is roughly one line per
  // one-to-two frames, and at a 480p test-iteration rate it is one line per several — either way a
  // few hundred lines across a full film, not thousands. `window.__dlodCensusMs` overrides it for a
  // run that wants finer sampling, without a rebuild.
  var _dlodCensusAt = 0, _dlodCensusPasses = 0;
  var DLOD_CENSUS_MS = (typeof window !== 'undefined' && +window.__dlodCensusMs > 0) ? +window.__dlodCensusMs : 2000;

  function _dlodUpdateBoxes(app, engaged, placed, frontier, recent) {
    if (_dlodBoxIndex && _dlodBoxBld !== app.activeBuilding) _dlodDisposeBoxes(); // building switched — stale guids, drop
    if (!_dlodBoxIndex) {
      if (!engaged) return;
      _dlodBuildBoxes(app);
      if (!_dlodBoxIndex) return;
    }
    var forceFull = (_lastProxyEngaged !== engaged);
    _lastProxyEngaged = engaged;
    var touched = null, boxed = 0;
    // §129.56 — counted in the loop that is already running, never a second traversal or an
    // Object.keys() over the index. `indexed` is how many proxy boxes exist at all; `candidates`
    // is how many the proxy was ALLOWED to box this pass (placed, not frontier, not recent).
    // `boxed < candidates` means the frustum/distance test kept them real — a different fact from
    // "nothing was eligible", and until now neither was visible in any log.
    var indexed = 0, candidates = 0;
    for (var guid in _dlodBoxIndex) {
      var b = _dlodBoxIndex[guid];
      indexed++;
      var wantVisible = false;
      if (engaged && placed[guid] && !frontier[guid] && recent[guid] === undefined) {
        candidates++;
        // §DLOD_VIEW: same in-view test as the real-mesh branches, inlined against the position
        // already in hand (b.pos/b.radius) — avoids a second index lookup via _dlodInView(guid).
        // §DLOD_ONSCREEN_FIX — frustum FIRST, and distance can no longer box an on-screen element
        // on its own (see _dlodInView above for the whole story). Off screen AND beyond 50 m boxes;
        // anything else stays real.
        _dlodSphere.center.copy(b.pos); _dlodSphere.radius = b.radius;
        var outOfView = !_dlodFrustum.intersectsSphere(_dlodSphere) &&
                        _dlodCamPos.distanceToSquared(b.pos) > DLOD_VIEW_DIST_SQ;
        wantVisible = outOfView;
      }
      if (!forceFull && b.visible === wantVisible) { if (wantVisible) boxed++; continue; }
      b.visible = wantVisible;
      b.mesh.setMatrixAt(b.idx, wantVisible ? b.matrix : _zeroMatrix);
      if (!touched) touched = [];
      if (touched.indexOf(b.mesh) === -1) touched.push(b.mesh);
      if (wantVisible) boxed++;
    }
    if (touched) for (var ti = 0; ti < touched.length; ti++) touched[ti].instanceMatrix.needsUpdate = true;
    if (forceFull) console.log('§DLOD_TM active=' + Object.keys(frontier).length + ' boxed=' + boxed +
      ' mode=' + (engaged ? 'on' : 'off'));
    // §129.56 (2026-09-20, red1: "isn't DLOD engaged in this hi res bake?" — and no log could
    // answer it) — the line ABOVE prints only on an engage/disengage EDGE, so on the 09-20 Hospital
    // hi-res bake it fired exactly once, at frame 0 before the buildup had placed anything:
    // `§DLOD_TM active=1 boxed=0 mode=on`. That reads as "the proxy is doing nothing" and means
    // "the proxy had nothing to do YET". This is the standing census, wall-clock throttled so a
    // 5,000-frame film costs a few dozen lines instead of 5,000. `passes`/`since` are printed
    // BECAUSE it is throttled: a sampled census that hides its own sampling rate is the same lie
    // in a smaller font — with them, the real per-frame rate is recoverable from one line.
    _dlodCensusPasses++;
    if (typeof window !== 'undefined') window.__dlodBoxedMax = Math.max(window.__dlodBoxedMax || 0, boxed);   // W7: whole-film max, every pass
    var _nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // `_dlodCensusAt === 0` = the very first pass: emit IMMEDIATELY rather than after a full
    // window. The question this tag exists to answer ("is the proxy engaged in this bake?") is
    // asked at the start of a run, and a census that stays silent for its first 2,000 ms answers
    // it late — at 1.4 s/frame on a 1080p Hospital that is the first frame or two, exactly the
    // ones a reader checks. Caught by W-DLOD-CENSUS on its first run, before any bake used it.
    if (_dlodCensusAt === 0 || _nowMs - _dlodCensusAt >= DLOD_CENSUS_MS) {
      console.log('§DLOD_TM_CENSUS boxed=' + boxed + '/' + indexed + ' candidates=' + candidates +
        ' frontier=' + Object.keys(frontier).length + ' passes=' + _dlodCensusPasses +
        ' since=' + Math.round(_dlodCensusAt ? (_nowMs - _dlodCensusAt) : 0) + 'ms' +
        ' mode=' + (engaged ? 'on' : 'off'));
      _dlodCensusAt = _nowMs; _dlodCensusPasses = 0;
    }
  }

  // §S260d: Audio removed — can't hear on most browsers anyway

  // ── Metal sparks + construction smoke (desktop only) ──
  var _sparkSystems = [];   // active spark/smoke point clouds
  var _sparkMaterial = null; // shared Points material
  var _smokeMaterial = null; // shared smoke material

  function initSparkMaterial() {
    if (_sparkMaterial) return;
    _sparkMaterial = new THREE.PointsMaterial({
      size: 3, sizeAttenuation: true,
      color: 0xffcc44, transparent: true, opacity: 1,
      depthTest: false, blending: THREE.AdditiveBlending
    });
  }

  function spawnSparks(position, scene) {
    initSparkMaterial();
    var count = 5 + Math.floor(Math.random() * 6); // 5-10 points
    var geom = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    var vel = new Float32Array(count * 3); // velocities
    for (var i = 0; i < count; i++) {
      pos[i*3]   = position.x + (Math.random()-0.5)*0.3;
      pos[i*3+1] = position.y + (Math.random()-0.5)*0.3;
      pos[i*3+2] = position.z + (Math.random()-0.5)*0.3;
      vel[i*3]   = (Math.random()-0.5)*2;
      vel[i*3+1] = Math.random()*3 + 1;       // upward burst
      vel[i*3+2] = (Math.random()-0.5)*2;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var points = new THREE.Points(geom, _sparkMaterial.clone());
    points.renderOrder = 1000;
    scene.add(points);
    _sparkSystems.push({ points: points, vel: vel, born: performance.now(), life: 500, type: 'spark' });
  }

  // §S260c: Dust puff — slow-rising, larger, softer particles for non-metal elements
  function spawnDust(position, scene) {
    if (!_smokeMaterial) {
      _smokeMaterial = new THREE.PointsMaterial({
        size: 6, sizeAttenuation: true,
        color: 0xccbbaa, transparent: true, opacity: 0.5,
        depthTest: false, blending: THREE.NormalBlending
      });
    }
    var count = 4 + Math.floor(Math.random() * 4); // 4-7 particles
    var geom = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    var vel = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      pos[i*3]   = position.x + (Math.random()-0.5)*0.8;
      pos[i*3+1] = position.y + Math.random()*0.3;
      pos[i*3+2] = position.z + (Math.random()-0.5)*0.8;
      vel[i*3]   = (Math.random()-0.5)*0.5;   // slow lateral drift
      vel[i*3+1] = 0.5 + Math.random()*1.0;   // gentle rise
      vel[i*3+2] = (Math.random()-0.5)*0.5;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var points = new THREE.Points(geom, _smokeMaterial.clone());
    points.renderOrder = 1000;
    scene.add(points);
    _sparkSystems.push({ points: points, vel: vel, born: performance.now(), life: 1200, type: 'dust' });
  }

  function updateSparks() {
    var now = performance.now();
    for (var i = _sparkSystems.length - 1; i >= 0; i--) {
      var s = _sparkSystems[i];
      var age = now - s.born;
      if (age > s.life) {
        s.points.parent.remove(s.points);
        s.points.geometry.dispose();
        s.points.material.dispose();
        _sparkSystems.splice(i, 1);
        continue;
      }
      // Animate: gravity + fade
      var dt = 0.016; // ~60fps step
      var posArr = s.points.geometry.attributes.position.array;
      for (var j = 0; j < posArr.length; j += 3) {
        posArr[j]   += s.vel[j]   * dt;
        posArr[j+1] += s.vel[j+1] * dt;
        posArr[j+2] += s.vel[j+2] * dt;
        s.vel[j+1] -= 9.8 * dt; // gravity
      }
      s.points.geometry.attributes.position.needsUpdate = true;
      s.points.material.opacity = 1 - (age / s.life);
    }
  }

  function clearSparks() {
    for (var i = 0; i < _sparkSystems.length; i++) {
      var s = _sparkSystems[i];
      if (s.points.parent) s.points.parent.remove(s.points);
      s.points.geometry.dispose();
      s.points.material.dispose();
    }
    _sparkSystems = [];
  }

  // §TM_GI_HOLD (2026-07-17): "re-accumulate after ~300ms of stillness" — polish a held TM frame.
  // renderAtTime forces N8AO single-pass (accumulate off) so a MOVING scene (scrub / playback tick)
  // is clean-but-slightly-grainy and never ghosts. When motion STOPS (no renderAtTime call for 300ms
  // AND not auto-playing), switch N8AO to accumulate mode and drive a short RAF loop to converge —
  // sharpening the still frame to the full Alt+G quality. Any new renderAtTime (scrub/tick) or a
  // playback start cancels it and drops straight back to single-pass. Never fires mid-playback: ticks
  // arrive <300ms apart AND we gate on !_playing.
  function _giCancelConverge() {
    if (_giHoldTimer) { clearTimeout(_giHoldTimer); _giHoldTimer = 0; }
    if (_giConvergeRaf) { cancelAnimationFrame(_giConvergeRaf); _giConvergeRaf = 0; }
    _giConverging = false;
  }

  // §TM_GI_HOLD_CAMGUARD (2026-07-17, found by re-reading this repo's own already-fixed ghost
  // family, not by live report): TAA still-refine (effects.js §STILL_REFINE_RESTART) and the SSGI
  // still-fold (effects_gi_poc.js §SSGI_CONVERGE_CAMGUARD, PR #816 — "ghosted/doubled geometry and
  // see-through floors") both hit the SAME root cause once each: a multi-frame accumulation loop
  // with no camera-pose check blends frames across a camera that's still moving — OrbitControls
  // inertial damping can keep gliding (no pointer events fire during the glide), and this app's
  // on-demand render loop only resumes applying that damping once something starts driving frames
  // again, which the converge loop itself does. This hold-converge loop (#837) shipped without
  // that guard — the exact same unguarded shape PR #816 fixed for SSGI, just never live-verified
  // before it hit a real user ("live-eyeball of the sharpen pending" in the original commit record).
  // A raw camera orbit-drag does NOT cancel this loop today (only TM close/playback-start/GI-off
  // do) — so a drag starting while the 24-frame accumulate is in flight blends N8AO across the
  // moving view, exactly the reported "ghosting when moving the scene." Fix: same pose-signature
  // restart discipline, ported directly — position+quaternion string, checked every frame.
  // §DLOD_VF_CAMGUARD_SIG (2026-08-05) — optional `cam` override, defaulting to app.camera so both
  // existing GI hold-converge call sites below (main-viewport-only, unaffected) are byte-identical.
  // The DLOD call site passes the SAME resolved camera _dlodInView's frustum was built from
  // (_dlodResolveCamera's result — vfCam when POV is active) instead of always app.camera: without
  // this, _dlodCamMoved never sees vfCam moving during a POV-only scrub/play (main stays parked,
  // §CPE_SCRUB_POV_ONLY), so the incremental-delta path could skip re-evaluating DLOD visibility
  // for geometry newly entering/leaving vfCam's OWN moving frustum — stale buildup in the POV inset
  // that a fresh full pass (triggered by anything else, e.g. a big cursor jump) would silently fix,
  // masking the gap. Same camera basis end-to-end: resolve → frustum → moved-detection.
  function _giHoldCamSig(app, cam) {
    cam = cam || (app && app.camera);
    if (!cam) return '';
    var p = cam.position, q = cam.quaternion;
    return p.x.toFixed(4) + ',' + p.y.toFixed(4) + ',' + p.z.toFixed(4) + ',' +
           q.x.toFixed(5) + ',' + q.y.toFixed(5) + ',' + q.z.toFixed(5) + ',' + q.w.toFixed(5);
  }
  function _giScheduleHoldConverge(app) {
    if (_giHoldTimer) { clearTimeout(_giHoldTimer); _giHoldTimer = 0; }
    _giHoldTimer = setTimeout(function () {
      _giHoldTimer = 0;
      // Bail if state changed while waiting: TM closed, GI off, mid-playback, or pass missing.
      if (!_active || TMS._playing || !app._giComposerActive || !app._giComposer || !app._giN8aoPass) return;
      if (!app._giN8aoPass.configuration) return;
      app._giN8aoPass.configuration.accumulate = true;         // temporal accumulation ON for the hold
      if (app._giN8aoPass.firstFrame) app._giN8aoPass.firstFrame();  // clean reset before accumulating
      _giConverging = true;
      var frames = 0, MAX = 24;   // ~24 frames is enough for N8AO (aoSamples=8) to visibly converge
      var sig = _giHoldCamSig(app);
      console.log('§TM_GI_HOLD converge start (held 300ms, still)');
      (function _step() {
        if (!_giConverging || !_active || TMS._playing || !app._giComposerActive || !app._giComposer) { _giConvergeRaf = 0; _giConverging = false; return; }
        var sigNow = _giHoldCamSig(app);
        if (sigNow !== sig) {
          // §TM_GI_HOLD_CAMGUARD: camera moved mid-converge (damping glide, or a real drag the
          // existing bail checks above can't see) — drop straight back to clean single-pass rather
          // than blending accumulated frames across a moving view. Re-arms naturally on the next
          // genuine 300ms of stillness via the normal renderAtTime -> _giScheduleHoldConverge path.
          console.log('§TM_GI_HOLD_RESTART cam-moved mid-converge frames=' + frames + ' — dropping to single-pass');
          _giConvergeRaf = 0; _giConverging = false;
          app._giN8aoPass.configuration.accumulate = false;
          if (app._giN8aoPass.firstFrame) app._giN8aoPass.firstFrame();
          return;
        }
        app._giComposer.render();
        if (++frames >= MAX) { _giConvergeRaf = 0; _giConverging = false; console.log('§TM_GI_HOLD converged frames=' + frames); return; }
        _giConvergeRaf = requestAnimationFrame(_step);
      })();
    }, 300);
  }

  // ══════════════════════════════════════════════════════════════════
  // §GROUP_SPARK — frontier spark eye candy (2026-07-19)
  // ══════════════════════════════════════════════════════════════════
  // Spec: bim-compiler prompts/HOSPITAL_4D_SUPERSTRUCTURE_DURATION_ANOMALY.md §GROUP_SPARK
  // User: "if it is a group of pieces, then they randomize among themselves repeatedly until
  // their duration is reached. If the group is small say only single or 2 pieces then it is
  // those only. This is irrespective the piece ar big or small." / "sparkling is just an
  // animation eye candy."
  //
  // Reads NOTHING from the schedule — pure decoration over whatever is mid-install. Groups are
  // therefore spatial cells (pieces near each other = worked together), NOT real task data.
  //
  // ⚠ THIS REPLACES THE REVERTED #866 HALO. Two root causes killed that one (both reproduced in
  // an isolated rig, both designed out here — do NOT reintroduce either):
  //   1. UNCAPPED ADDITIVE STACKING — one sprite per batched slot / per instance, no pool cap.
  //      Additive blending is unbounded; 414 frontier elements summed into a solid yellow wash.
  //      Here: only `frac` of each group is lit, so count scales with ACTIVE GROUPS, not with
  //      frontier size. _GSP_CAP is a safety net, not the mechanism.
  //   2. SPRITES OUTLIVING THE RENDER LOOP — the viewer is render-on-demand with idle-park
  //      (main.js §IDLE-PARK). Sprites left visible when rendering parks freeze on screen
  //      forever. THIS was the "it just lingers" nobody could pin down.
  //      Here: sparks exist ONLY during playback; stop decays to zero; scrub draws none.
  //      The only state that can persist is zero.
  var _gspTexture = null, _gspPool = [], _gspActive = 0;
  var _gspRoll = 0;            // re-roll index — advances once per PLAYBACK tick (frozen at 0 in a
                               // bake: see §VAC / §R14.1 at the §GROUP_SPARK_TICK log below)
  var _gspTick = 0;            // §VAC — advances on EVERY _gspEmit, playing or not; the log's own
                               // sample counter, replacing the dead `_gspRoll % 10` throttle
  var _gspLastVerdict = null;  // §VAC V2 — last §GROUP_SPARK_TICK verdict, for run-length reporting
  var _gspRepeats = 0;         // §VAC V2 — identical verdicts suppressed since _gspLastVerdict
  var _gspDecay = 1;           // 1 while playing; ramps to 0 on stop
  var _gspDecayTimer = null;
  var _gspCand = [];           // flat [x,y,z,...] collected during the traverse
  var _GSP_CAP = 140;          // safety net only
  var _GSP_FRAC = 0.16;        // fraction of a group sparking at once
  var _GSP_SIZE = 2.6;         // world-metres; constant by design — "irrespective the piece
                               // ar big or small", additive+depthTest:false keeps it visible
  var _GSP_CELL = 6;           // spatial-cell size (m) that defines a "group"
  var _GSP_DECAY_STEPS = 15;   // steps the stop die-out is stretched over
  var _gspLogged = false;
  var _gspFrontierN = 0, _gspRecentN = 0;   // §-log breakdown: why the candidate count is what it is

  // Per-FLASH lifecycle (NOT per-element install progress): born white-hot, cools out inside one
  // re-roll interval. Multi-stop, adjacent-lerp only — a two-point lerp desaturates through the
  // midpoint and loses the orange band.
  var _GSP_RAMP = [
    { t: 0.00, c: 0xfff8f0, i: 1.00 },
    { t: 0.12, c: 0xffd27a, i: 0.78 },
    { t: 0.34, c: 0xff932c, i: 0.45 },
    { t: 0.58, c: 0xff3800, i: 0.20 },
    { t: 0.80, c: 0x8c1400, i: 0.06 },
    { t: 1.00, c: 0x3d0a00, i: 0.00 }
  ];
  var _gspCA = null, _gspCB = null, _gspCO = null;
  function _gspRampAt(t) {
    if (!_gspCA) { _gspCA = new THREE.Color(); _gspCB = new THREE.Color(); _gspCO = new THREE.Color(); }
    t = Math.max(0, Math.min(1, t));
    var k = 0;
    while (k < _GSP_RAMP.length - 2 && t > _GSP_RAMP[k + 1].t) k++;
    var s0 = _GSP_RAMP[k], s1 = _GSP_RAMP[k + 1];
    var f = (t - s0.t) / (s1.t - s0.t);
    _gspCA.setHex(s0.c); _gspCB.setHex(s1.c);
    _gspCO.copy(_gspCA).lerp(_gspCB, f);
    return { color: _gspCO.getHex(), intensity: s0.i + (s1.i - s0.i) * f };
  }

  // Seeded hash, never Math.random() — frames must be reproducible so captures are comparable.
  function _gspHash(a, b, c) {
    var h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2246822519)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function _gspTex() {
    if (_gspTexture) return _gspTexture;
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    _gspTexture = new THREE.CanvasTexture(c);
    return _gspTexture;
  }

  function _gspSprite(idx) {
    if (_gspPool[idx]) return _gspPool[idx];
    var mat = new THREE.SpriteMaterial({
      map: _gspTex(), color: 0xffffff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false
    });
    var s = new THREE.Sprite(mat);
    s.renderOrder = 11;
    s.visible = false;
    _gspPool[idx] = s;
    var app = A();
    if (app && app.scene) app.scene.add(s);
    return s;
  }

  function _gspSweep() {
    for (var i = _gspActive; i < _gspPool.length; i++) {
      if (_gspPool[i]) _gspPool[i].visible = false;
    }
  }

  // Called from inside the traverse for every frontier element (all three mesh paths).
  function _gspCollect(x, y, z) {
    // §PERF: sparks are playback-only, so collection is too. Without this the traverse pushed
    // thousands of candidates on EVERY scrub frame for _gspEmit to discard — pure waste on the
    // exact interaction (scrubbing a large building) where frames are most expensive.
    if (!TMS._playing) return;
    if (_gspCand.length < 12000) _gspCand.push(x, y, z);   // flat — no per-tick object alloc
  }

  function _gspEmitOne(ci, phase) {
    if (_gspActive >= _GSP_CAP) return;
    var r = _gspRampAt(phase);
    if (r.intensity <= 0.02) return;
    var s = _gspSprite(_gspActive);
    s.material.color.setHex(r.color);
    s.material.opacity = 0.95 * Math.pow(r.intensity, 0.7) * _gspDecay;
    s.scale.setScalar(_GSP_SIZE * (0.7 + 0.5 * r.intensity));
    s.position.set(_gspCand[ci], _gspCand[ci + 1], _gspCand[ci + 2]);
    s.visible = true;
    _gspActive++;
  }

  // Called ONCE after the traverse. Buckets candidates into spatial cells (= "groups"), then
  // lights a random subset of each. Groups of 1-2 light entirely — nothing to randomize among.
  function _gspEmit(isPlaying) {
    var app = A();
    _gspActive = 0;
    // Unconditional tick log — MUST fire even on the early-return paths, otherwise a zero-spark
    // result is indistinguishable from "the code never ran" (that ambiguity is exactly what let
    // #866 ship believing it was verified). That requirement is KEPT: the tick is still reported
    // on every path, it is just no longer reported once per frame with an identical verdict.
    //
    // §VAC / §R14.1 — the throttle this line used to carry was DEAD in the bake path.
    // It read `_gspRoll % 10 === 0`, intending a 1-in-10 sample. `_gspRoll++` happens in exactly
    // one place — playTick() (search "§GROUP_SPARK: one re-roll per playback tick"), behind
    // `if (!_playing) return;`. A MaxQ bake never calls playTick(); it drives renderAtTime()
    // directly. So _gspRoll is frozen at 0, `0 % 10 === 0` is always true, and 1-in-10 silently
    // became 1-in-1. MEASURED, s5_hospital.log: 2,027 firings over 2,027 frames, every one
    // carrying `roll=0`. (The same dead expression also gates §PERF_TRAVERSE below — named in
    // §R14.1, deliberately NOT changed here: that one is a real per-frame measurement other
    // sections quote.) Fixed with a counter that advances on every emit, playing or not.
    //
    // §VAC V1+V2 — and the verdict itself was vacuous: 1,681 of those 2,027 firings read
    // `playing=false cand=0 (frontier=0 recent=0)`, i.e. nothing to light and no playback to
    // light it during. A run of identical verdicts is now printed ONCE with its repeat count;
    // the count is the signal, so nothing is dropped.
    _gspTick++;
    var _gspVerdict = (!isPlaying || !_gspCand.length)
      ? 'VACUOUS (' + (!isPlaying ? 'not playing' : 'cand=0 — no frontier/recent candidates this tick') +
        ') playing=' + !!isPlaying + ' cand=' + (_gspCand.length / 3) +
        ' (frontier=' + _gspFrontierN + ' recent=' + _gspRecentN + ')'
      : 'playing=true cand=' + (_gspCand.length / 3) +
        ' (frontier=' + _gspFrontierN + ' recent=' + _gspRecentN + ')' +
        ' roll=' + _gspRoll + ' decay=' + _gspDecay.toFixed(2);
    if (_gspVerdict !== _gspLastVerdict) {
      if (_gspRepeats > 0) console.log('§GROUP_SPARK_TICK repeats=' + _gspRepeats + ' (identical verdict, suppressed)');
      console.log('§GROUP_SPARK_TICK ' + _gspVerdict + ' tick=' + _gspTick);
      _gspLastVerdict = _gspVerdict; _gspRepeats = 0;
    } else {
      _gspRepeats++;
      // Never let a long identical run go completely silent — a bounded heartbeat proves the code
      // is still running (the #866 ambiguity above), without one line per frame.
      if (_gspTick % 500 === 0) console.log('§GROUP_SPARK_TICK still ' + _gspVerdict + ' — repeats=' + _gspRepeats + ' tick=' + _gspTick);
    }
    // Scrub / paused / not playing → NO sparks at all. Scrubbing is a state-diff read; flashing
    // VFX competes with it (user: "the appreciation is in the quick diff in states").
    if (!app || !app.scene || !isPlaying || _gspDecay <= 0 || !_gspCand.length) { _gspSweep(); return; }

    // §PERF: numeric spatial hash into a Map — the old "cx,cy,cz" string key allocated one
    // string per candidate per tick (GC churn scaling with building size). A hash collision just
    // merges two groups, which is harmless for decoration.
    var cells = new Map(), i;
    for (i = 0; i < _gspCand.length; i += 3) {
      var key = (Math.imul(Math.floor(_gspCand[i] / _GSP_CELL), 73856093) ^
                 Math.imul(Math.floor(_gspCand[i + 1] / _GSP_CELL), 19349663) ^
                 Math.imul(Math.floor(_gspCand[i + 2] / _GSP_CELL), 83492791)) | 0;
      var bucket = cells.get(key);
      if (bucket) bucket.push(i); else cells.set(key, [i]);
    }

    var gid = 0, groups = 0, singles = 0;
    var _it = cells.values(), _e;
    while (!(_e = _it.next()).done) {
      if (_gspActive >= _GSP_CAP) break;
      var idxs = _e.value, n = idxs.length;
      gid++; groups++;
      if (n <= 2) {
        // "If the group is small say only single or 2 pieces then it is those only."
        singles++;
        for (var s2 = 0; s2 < n; s2++) _gspEmitOne(idxs[s2], _gspHash(gid, _gspRoll, s2));
        continue;
      }
      // "they randomize among themselves repeatedly until their duration is reached"
      var k = Math.max(1, Math.round(n * _GSP_FRAC));
      for (var j = 0; j < k; j++) {
        var pick = idxs[Math.floor(_gspHash(gid, _gspRoll, j) * n) % n];
        // Stagger each spark's phase so a group doesn't pulse in lockstep
        _gspEmitOne(pick, _gspHash(gid, _gspRoll, j + 977));
      }
    }
    _gspSweep();

    if (!_gspLogged || (_gspRoll % 20 === 0)) {
      console.log('§GROUP_SPARK groups=' + groups + ' singles=' + singles +
                  ' cand=' + (_gspCand.length / 3) + ' sprites=' + _gspActive +
                  '/cap ' + _GSP_CAP + ' roll=' + _gspRoll + ' decay=' + _gspDecay.toFixed(2));
      _gspLogged = true;
    }
  }

  // Stop → freeze the re-roll and let in-flight flashes cool out, then park at ZERO.
  // Bounded burst (~0.5s), NOT a permanent rAF loop — idle-park is preserved.
  function _gspStopDecay() {
    if (_gspDecayTimer) { clearInterval(_gspDecayTimer); _gspDecayTimer = null; }
    if (!_gspActive) { _gspDecay = 1; return; }
    var step = 0;
    _gspDecayTimer = setInterval(function () {
      step++;
      _gspDecay = Math.max(0, 1 - step / _GSP_DECAY_STEPS);
      for (var i = 0; i < _gspActive; i++) {
        var sp = _gspPool[i];
        if (sp && sp.visible) sp.material.opacity *= 0.82;
      }
      var app = A();
      if (app && app.markDirty) app.markDirty();
      if (_gspDecay <= 0) {
        clearInterval(_gspDecayTimer); _gspDecayTimer = null;
        _gspActive = 0; _gspSweep(); _gspDecay = 1;
        console.log('§GROUP_SPARK_DECAY parked at zero sprites after ' + step + ' steps');
        if (app && app.markDirty) app.markDirty();
      }
    }, 33);
  }

  // Hard clear — TM deactivate. Nothing may survive TM being switched off.
  function _gspClear() {
    if (_gspDecayTimer) { clearInterval(_gspDecayTimer); _gspDecayTimer = null; }
    _gspActive = 0; _gspDecay = 1; _gspCand.length = 0;
    for (var i = 0; i < _gspPool.length; i++) if (_gspPool[i]) _gspPool[i].visible = false;
    console.log('§GROUP_SPARK_CLEAR all sprites hidden (TM deactivate)');
  }

  // ══════════════════════════════════════════════════════════════════
  // §PERF_INCR — skip meshes with no state transition in the cursor delta
  // ══════════════════════════════════════════════════════════════════
  // Spec: bim-compiler prompts/TM_INCREMENTAL_RENDER_PERF.md
  //
  // renderAtTime() walked all 10,841 scene objects and ~63k batched slots EVERY tick to service
  // single-digit actual changes (§PERF_TRAVERSE ms=15.6-22.4 of a ~31ms tick).
  //
  // DESIGN NOTE — why this is a mesh-level skip and NOT a guid->{mesh,slot} index:
  // that index was the original spec's plan (§4.3) and it is UNSOUND here. Slot assignments are
  // not stable for the lifetime of a TM session: streaming.js §CONSOLIDATE rebuilds BatchedMeshes
  // into NEW meshes with new slotIds (streaming.js ~1619), and city.js evicts + disposes meshes
  // (city.js ~163). A cached index would silently write to the WRONG element — corruption, not an
  // exception. This design holds no guid->slot references at all, so there is nothing to go stale.
  //
  // What it does instead: precompute, per mesh, the sorted timestamps at which ANY of its elements
  // changes state (start_ts -> frontier, end_ts -> recent, end_ts+linger -> placed). Moving the
  // cursor A->B, a mesh whose event list has nothing in (A,B] cannot have changed, so its whole
  // slot loop is skipped and its slots keep the visibility they already have — which is correct
  // precisely because nothing happened to them.
  var _evMesh = null;        // meshId -> sorted Float64Array of transition timestamps
  var _evSig = '';           // scene signature the above was built for (staleness detector)
  var _posCache = {};        // guid -> {x,y,z}. Element geometry never moves, so this is valid
                             // for the whole session once filled — it lets the frontier/camera
                             // aggregates be served without traversing skipped meshes.
  var _incrStats = { delta: 0, full: 0, skipped: 0, walked: 0 };
  // Delta mode is only sound once a FULL pass has set every mesh's slot state at least once for
  // the current index. Until then a skip would preserve state that was never established.
  var _incrPrimed = false;
  // Above this cursor jump, skipping stops paying (too many meshes have events anyway) and the
  // full path is cheaper. 7 days: a playback tick is minutes, a drag-scrub is months.
  var _INCR_MAX_SPAN_MS = 7 * 24 * 3600 * 1000;
  // §PERF_INCR Phase 2: last tick's app._shadowOn, to detect the OFF<->ON edge. Batched/Instanced
  // castShadow/receiveShadow flags are only (re)computed on ticks that aren't skipped, so a mesh
  // skipped across a shadow toggle would keep a stale flag. Force one full pass on the edge tick
  // only -- not for the whole time shadows stay on, which is what the old blanket gate did.
  var _lastShadowOn = null;

  // Staleness signature — keyed ONLY on the element-mesh set, via A._metaGen (bumped by
  // streaming/city at the four sites that mutate _batchMeta/_instanceMeta). O(1).
  // ⚠ DO NOT fold in scene.children.length. It changes EVERY playback tick for reasons unrelated
  // to the mesh set — group-spark sprites add/remove, SFX, stars, bloom — which made the signature
  // flip every tick, rebuilt the 108ms event index every tick on LTU (16k meshes / 367k events),
  // AND reset _incrPrimed so the skip never engaged (mode=full skipped=0 forever). Net: ~158ms/tick
  // of self-inflicted JS on LTU, slower than no optimisation. The index depends only on which guids
  // live in which meshes; that changes only via streaming/eviction, which bump _metaGen. Nothing
  // else may invalidate it.
  function _tmSceneSig(app) {
    return '' + (app._metaGen | 0);
  }

  // Build meshId -> sorted transition timestamps. One pass over _ops + the meta tables.
  function _tmBuildEventIndex(app, lingerMs) {
    var t0 = performance.now();
    var guidT = Object.create(null);   // guid -> [t,...]
    for (var i = 0; i < _ops.length; i++) {
      var op = _ops[i];
      var g = op.output_guid;
      if (!g && op.input_guids && op.input_guids.length) g = op.input_guids[0];
      if (!g) continue;
      (guidT[g] || (guidT[g] = [])).push(op.start_ts, op.end_ts, op.end_ts + lingerMs);
    }
    var byMesh = Object.create(null), k, metas, j, arr, ts;
    function addAll(meshId, guid) {
      ts = guidT[guid];
      if (!ts) return;
      arr = byMesh[meshId] || (byMesh[meshId] = []);
      for (var q = 0; q < ts.length; q++) arr.push(ts[q]);
    }
    if (app._batchMeta) for (k in app._batchMeta) {
      if (!Object.prototype.hasOwnProperty.call(app._batchMeta, k)) continue;
      metas = app._batchMeta[k];
      for (j = 0; j < metas.length; j++) addAll(k, metas[j].guid);
    }
    if (app._instanceMeta) for (k in app._instanceMeta) {
      if (!Object.prototype.hasOwnProperty.call(app._instanceMeta, k)) continue;
      metas = app._instanceMeta[k];
      for (j = 0; j < metas.length; j++) addAll(k, metas[j].guid);
    }
    _evMesh = Object.create(null);
    var meshes = 0, events = 0;
    for (k in byMesh) {
      if (!Object.prototype.hasOwnProperty.call(byMesh, k)) continue;
      var a = Float64Array.from(byMesh[k]);
      a.sort();
      _evMesh[k] = a; meshes++; events += a.length;
    }
    _evSig = _tmSceneSig(app);
    _incrPrimed = false;   // index changed -> require a fresh full pass before skipping again
    console.log('§PERF_INCR_INDEX built meshes=' + meshes + ' events=' + events +
                ' ms=' + (performance.now() - t0).toFixed(1));
  }

  // Any transition strictly inside (lo, hi]? Binary search the sorted array.
  function _tmHasEventIn(arr, lo, hi) {
    if (!arr || !arr.length) return false;
    if (hi < arr[0] || lo >= arr[arr.length - 1]) return false;
    var a = 0, b = arr.length - 1, mid;
    while (a < b) { mid = (a + b) >> 1; if (arr[mid] <= lo) a = mid + 1; else b = mid; }
    return arr[a] > lo && arr[a] <= hi;
  }
};
