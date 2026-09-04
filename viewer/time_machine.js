// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* time_machine.js — 4D Construction Timeline
   ⏳ toolbar → draggable panel with weighted construction playback.

   Starts fully built. ◀ deconstructs, ▶ builds. << >> jump to start/end.
   DAY/HR/MIN = playback speed AND slider scope.
   Slider drills into where the player stopped:
     DAY → scrub across project days
     HR  → 24 ticks within the stopped day
     MIN → 60 ticks (seconds) within the stopped minute

   Elements have weighted durations from LABOR_RATES productivity.
   Parallel trades: multiple elements active simultaneously.
   Active elements highlighted orange glow, see-through.
   Auto-injects from IFC classes + SEQUENCE_RULES + LABOR_RATES. */

(function() {
  'use strict';
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
    try { _axIdx = buildTaskIndex(); } catch (e) { _axIdx = null; }
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
        viewerStatus('🚁 ' + _cineStoryboard.length + ' scenes ready — press ▶ to play');
        _bgBuildRaf = 0;
        // Cache full storyboard
        cachePut('movie', _cineStoryboard);
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
  var _dlodFrustum = null, _dlodPSM = null, _dlodSphere = null; // per-tick scratch (built lazily, reused)
  var _dlodCamPos = null;
  // §DLOD_TM_CAMGUARD (2026-07-20): last camera pose-signature seen on a DLOD-engaged tick — see
  // §10's root cause. Reuses _giHoldCamSig's exact string-diff shape (TM_GI_HOLD_CAMGUARD,
  // ported PR #816), not a new threshold: cheap position+quaternion string, compared every tick.
  var _dlodLastCamSig = null;

  function _dlodEngaged(app) {
    // §5.4 Streaming interplay: refuse to engage until streaming drains (Fly Tour §FLY_STREAM_WAIT doctrine)
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
  function _dlodInView(g) {
    var b = _dlodBoxIndex && _dlodBoxIndex[g];
    if (!b || !_dlodCamPos) return true;
    if (_dlodCamPos.distanceToSquared(b.pos) > DLOD_VIEW_DIST_SQ) return false;
    _dlodSphere.center.copy(b.pos); _dlodSphere.radius = b.radius;
    return _dlodFrustum.intersectsSphere(_dlodSphere);
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
    for (var guid in _dlodBoxIndex) {
      var b = _dlodBoxIndex[guid];
      var wantVisible = false;
      if (engaged && placed[guid] && !frontier[guid] && recent[guid] === undefined) {
        // §DLOD_VIEW: same in-view test as the real-mesh branches, inlined against the position
        // already in hand (b.pos/b.radius) — avoids a second index lookup via _dlodInView(guid).
        var outOfView = _dlodCamPos.distanceToSquared(b.pos) > DLOD_VIEW_DIST_SQ;
        if (!outOfView) {
          _dlodSphere.center.copy(b.pos); _dlodSphere.radius = b.radius;
          outOfView = !_dlodFrustum.intersectsSphere(_dlodSphere);
        }
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
      if (!_active || _playing || !app._giComposerActive || !app._giComposer || !app._giN8aoPass) return;
      if (!app._giN8aoPass.configuration) return;
      app._giN8aoPass.configuration.accumulate = true;         // temporal accumulation ON for the hold
      if (app._giN8aoPass.firstFrame) app._giN8aoPass.firstFrame();  // clean reset before accumulating
      _giConverging = true;
      var frames = 0, MAX = 24;   // ~24 frames is enough for N8AO (aoSamples=8) to visibly converge
      var sig = _giHoldCamSig(app);
      console.log('§TM_GI_HOLD converge start (held 300ms, still)');
      (function _step() {
        if (!_giConverging || !_active || _playing || !app._giComposerActive || !app._giComposer) { _giConvergeRaf = 0; _giConverging = false; return; }
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
    if (!_playing) return;
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

  function renderAtTime(cursorMs) {
    var app = A();
    if (!app || !app.scene) return;
    _tmEnsure();
    _gspCand.length = 0;   // §GROUP_SPARK: reset candidates each tick, before the traverse
    _gspFrontierN = 0; _gspRecentN = 0;
    if (!_zeroMatrix) _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    if (!_whiteColor) _whiteColor = new THREE.Color(1, 1, 1);
    _prevCursor = _cursor;
    _cursor = cursorMs;

    // Restore previously highlighted meshes to solid
    clearHighlight();

    // Determine which elements to show and their state
    var placed = {};    // guid → true (fully built: end_ts <= cursor)
    var frontier = {};  // guid → {t: 0-1 progress, isSteel: bool}
    var recent = {};    // guid → fade 0-1 (1 = just finished)
    var arrival = {};   // guid → true (just appeared this tick — white flash)
    var _sfxPhases = null; // phase set at the frontier this tick (§SFX voice + §CPE_ROOM_TITLE_COLLECTIVE bracket)
    var lingerMs = tickMs() * 3; // linger for 3 ticks after completion
    var _isMobileTM = !!(window._isMobile || window._isMobileTM);

    for (var i = 0; i < _ops.length; i++) {
      var op = _ops[i];
      if (op.start_ts > cursorMs) break;
      var guid = op.output_guid;
      if (!guid && op.input_guids && op.input_guids.length) guid = op.input_guids[0];
      if (!guid) continue;

      if (op.end_ts <= cursorMs) {
        placed[guid] = true;
        // Recently finished — amber linger with fade
        var age = cursorMs - op.end_ts;
        if (age < lingerMs) recent[guid] = 1 - (age / lingerMs);
      } else {
        var progress = (cursorMs - op.start_ts) / Math.max(1, op.end_ts - op.start_ts);
        var p = op.parameters || {};
        var cls = p.cls || '';
        var isSteel = /^Ifc(Beam|Column|Member|Plate)$/.test(cls) ||
                      (p.resource === 'STEEL_ERECTOR');
        frontier[guid] = { t: progress, isSteel: isSteel };
        // Arrival = first 15% of install time (white flash)
        if (progress < 0.15) arrival[guid] = true;
        // §SFX seam (sfx.js) + §CPE_ROOM_TITLE_COLLECTIVE (cpe_room_title.js): collect the
        // construction phase(s) at the frontier. Two consumers now — the sfx voice AND the
        // caption's [phase] bracket — so the collection no longer gates on __sfxTM; each
        // consumer still decides for itself what to do with it (SoC).
        if (p.phase) { if (!_sfxPhases) _sfxPhases = {}; _sfxPhases[p.phase] = (_sfxPhases[p.phase] || 0) + 1; }
      }
    }

    // §S260d: Whitebox material state logger — module-level counter persists across ticks
    function _wbMat(tag, obj) {
      // §PERF: whitebox material logger — a DIAGNOSTIC, not for production playback. It fired once
      // per mesh every tick (~20+ console.logs/tick on a large model, each with heavy string
      // building), which is real per-tick cost and, with devtools open in Firefox, a major stall.
      // Default OFF; set window.__TM_WBDEBUG=true in the console to re-enable when diagnosing colors.
      if (!window.__TM_WBDEBUG) return;
      _wbLogCount++;
      if (_wbLogCount > 10 && _wbLogCount % 500 !== 0) return;
      var m = obj.material;
      if (!m) return;
      var rgb = m.color ? ('rgb=' + m.color.r.toFixed(2) + ',' + m.color.g.toFixed(2) + ',' + m.color.b.toFixed(2)) : 'no-color';
      var em = m.emissive ? ('em=' + m.emissive.r.toFixed(2) + ',' + m.emissive.g.toFixed(2) + ',' + m.emissive.b.toFixed(2) + ' eI=' + (m.emissiveIntensity || 0).toFixed(2)) : 'no-em';
      var pbr = (m.roughness !== undefined) ? (' rough=' + m.roughness.toFixed(2) + ' metal=' + (m.metalness || 0).toFixed(2)) : '';
      var bright = m.color && (m.color.r > 0.9 && m.color.g > 0.9 && m.color.b > 0.9);
      var emBright = m.emissive && m.emissiveIntensity > 0.3 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0;
      var flag = (bright ? ' ⚠WHITE' : '') + (emBright ? ' ⚠EMISSIVE' : '');
      console.log('§WB_MAT ' + tag + ' guid=' + (obj.userData && obj.userData.guid || '?').substring(0,12) +
        ' cls=' + (obj.userData && obj.userData.ifcClass || '?') +
        ' type=' + (m.type || '?') +
        ' ' + rgb + ' ' + em + pbr + ' op=' + (m.opacity || 1).toFixed(2) +
        ' transp=' + !!m.transparent + ' hi=' + !!obj._tm_highlighted +
        ' mesh=' + (obj.isBatchedMesh ? 'BM' : obj.isInstancedMesh ? 'IM' : 'M') + flag);
    }

    // ── Single unified traverse: visibility + shadow + sparks + guidPosMap ──
    // Merged from 4 separate traversals → 1 for 100K+ element performance.
    var _shadowCasters = 0, _shadowReceivers = 0;
    var _frontierCentroids = [];  // for shadow proximity promotion (2nd pass)
    var _frontierPositions = [];  // for camera follow
    var _guidPosMap = {};         // guid → Vector3 for look-ahead (O(1) per guid)
    var _placedMeshes = [];       // for shadow promotion pass

    // Pre-compute which GUIDs the look-ahead needs — avoids getWorldPosition on ALL 100K meshes
    var _previewGuids = null;
    if (_camFollow) {
      _previewGuids = {};
      var _preMs = tickMs() * 2;
      for (var _pi = 0; _pi < _ops.length; _pi++) {
        if (_ops[_pi].start_ts > _cursor + _preMs) break;
        if (_ops[_pi].start_ts <= _cursor) continue;
        var _pg = _ops[_pi].output_guid;
        if (!_pg && _ops[_pi].input_guids && _ops[_pi].input_guids.length) _pg = _ops[_pi].input_guids[0];
        if (_pg) _previewGuids[_pg] = true;
      }
    }

    // §S260d: All particle effects removed

    // ── TM_DLOD_SCALE.md §3 (redesigned): real = frontier ∪ recent ∪ in-view; box = placed, not
    // in either. Box index must exist BEFORE the traverse below reads _dlodInView, so build it here
    // (not lazily inside _dlodUpdateBoxes) — else the first engaged tick would see an empty index
    // and fail every element open to "real", one tick behind. Zero cost when the toggle is off.
    var _dlodOn = _dlodEngaged(app);
    if (_dlodOn) {
      _dlodBuildBoxes(app);
      if (_dlodBoxIndex && app.camera) {
        if (!_dlodFrustum) { _dlodFrustum = new THREE.Frustum(); _dlodPSM = new THREE.Matrix4(); _dlodSphere = new THREE.Sphere(); }
        // §DLOD_VF_CAMGUARD — gate against whichever camera the user is actually looking through.
        var _dlodActiveCam = _dlodResolveCamera(app);
        // §DLOD_VF_MATRIX_STALE (2026-08-05) — this function runs off Time Machine's OWN setTimeout
        // ticker (_playTimer, see playTick), never synchronized with the rAF-driven animate() loop.
        // app.camera's matrixWorld/matrixWorldInverse get refreshed every rAF frame because
        // renderer.render(scene, app.camera) runs there unconditionally. vfCam's ONLY gets refreshed
        // by cinema_path_editor.js's own _vfRender(), itself gated behind the SAME rAF loop's
        // needsRender check — so on a POV-only rehearsal, whichever of these two independent timers
        // (TM's setTimeout vs. rAF) happens to fire first in a given moment can read vfCam's matrix
        // BEFORE this tick's _applyVFPose() move has actually reached it, i.e. the frustum below is
        // built from the WRONG pose. updateMatrixWorld() recomputes both matrixWorld and
        // matrixWorldInverse from whatever position/quaternion _applyVFPose already set — cheap
        // (single camera, not a scene traverse) and makes this tick's frustum correct regardless of
        // which timer got here first. This is exactly the vfCam-goes-blank mechanism named in the
        // prior session's handoff ("vfCam ends up looking at nothing").
        _dlodActiveCam.updateMatrixWorld();
        _dlodCamPos = _dlodActiveCam.position;
        _dlodPSM.multiplyMatrices(_dlodActiveCam.projectionMatrix, _dlodActiveCam.matrixWorldInverse);
        _dlodFrustum.setFromProjectionMatrix(_dlodPSM);
      } else {
        _dlodOn = false; // box build failed (deps/query) — fall back to legacy behavior this tick
      }
    }

    // §PERF_INCR: decide delta vs full for THIS tick.
    // Full is required (not merely allowed) when: index missing/stale, no previous cursor, shadows
    // just toggled (see _lastShadowOn above), or the jump is large enough that skipping saves
    // nothing. A long scrub legitimately changes tens of thousands of elements -- forcing delta
    // there would be SLOWER than the full path, which is the failure this guard prevents.
    // §PERF_INCR Phase 2: shadows staying ON/OFF steady-state does NOT need a blanket full-mode
    // gate -- _placedMeshes/_frontierCentroids/_shadowCasters are built in the single-mesh branch
    // below, which is unconditional (never skipped) regardless of _incrOK. Only the EDGE tick
    // (shadow flag flips) needs a forced full pass, to (re)seed Batched/Instanced shadow flags.
    var _sig = _tmSceneSig(app);
    // §PERF_INCR_DEFER (TM_STREAM_REBUILD_COALESCE.md; CPE_4D_PERF_MEM_FINDINGS.md §3-R5): TM
    // active WHILE a big building still streams = every batch bumps _metaGen = a full 50-159ms
    // index rebuild per batch (10+ on LTU, 0.5-2s stacked) — and each rebuild forced mode=full
    // anyway (_incrPrimed reset). While app.streaming, skip the builds entirely and render
    // full-mode (identical output — the full path never consults the index); build ONCE on the
    // first pass after streaming settles. Mirrors _dlodEngaged's !app.streaming gate. A stale
    // index is never consulted: the index is DROPPED here, not kept (§4 Risk discipline —
    // "a stale index silently corrupts the scene").
    if (!_evMesh || _sig !== _evSig) {
      if (app.streaming) {
        // Drop (never keep-stale) any existing index once; then stay index-less and silent —
        // every pass below renders the full path (_incrPrimed=false ⇒ _incrOK=false).
        if (_evMesh) {
          _evMesh = null; _evSig = ''; _incrPrimed = false;
          console.log('§PERF_INCR_DEFER streaming — index dropped, builds deferred until settle');
        }
      } else {
        _tmBuildEventIndex(app, lingerMs);
      }
    }
    var _dLo = Math.min(_prevCursor, cursorMs), _dHi = Math.max(_prevCursor, cursorMs);
    var _shadowNow = !!app._shadowOn;
    var _shadowJustToggled = (_lastShadowOn !== null && _lastShadowOn !== _shadowNow);
    // §DLOD_TM_CAMGUARD (TM_DLOD_SCALE.md §10, direction b): _dlodInView is a pure function of
    // camera pose, but it's only ever read inside the BatchedMesh/InstancedMesh branches below,
    // which the incremental-delta skip can bypass entirely when nothing was built/finished this
    // tick (span=0, pure orbit). Force a full pass whenever the camera pose actually changed on a
    // DLOD-engaged tick, so the real-mesh restore (box→real) is re-evaluated same as the box path
    // already is (_dlodUpdateBoxes has no such skip). Off the DLOD path this is always false — zero
    // behavioural change (W-DLOD-EQUIV).
    var _dlodCamMoved = false;
    if (_dlodOn) {
      // §DLOD_VF_CAMGUARD_SIG: same camera _dlodCamPos/frustum were just built from above
      // (_dlodActiveCam — vfCam when POV is active, main otherwise), not always app.camera — see
      // that function's own comment for why using the wrong one here goes stale silently.
      var _dlodCamSigNow = _giHoldCamSig(app, _dlodActiveCam);
      _dlodCamMoved = (_dlodLastCamSig !== null && _dlodLastCamSig !== _dlodCamSigNow);
      _dlodLastCamSig = _dlodCamSigNow;
    } else {
      _dlodLastCamSig = null; // reset: engaging DLOD later must not compare against a stale pose
    }
    var _incrOK = !!_evMesh && _prevCursor != null && !_shadowJustToggled && !_dlodCamMoved &&
                  (_dHi - _dLo) <= _INCR_MAX_SPAN_MS && _incrPrimed;
    // W-INCR-EQUIV hook: the verification harness sets window.__forceFull to re-render the SAME
    // cursor via the full path, so the two results can be diffed. Test-only; no production effect.
    if (window.__forceFull) { _incrOK = false; window.__forceFull = false; }
    if (_incrOK) _incrStats.delta++; else _incrStats.full++;
    _lastShadowOn = _shadowNow;

    // §SHADOW_FRONTIER_AT_CAPTURE (2026-08-12, real user report: "not casting shadows inside
    // early construction"): existing §SHADOW_FRONTIER casters/receivers counters only increment
    // when app._shadowOn (native Sunglass toggle) is true -- always false during a PHOTO_SHADOW/
    // MaxQ bake, so that log reads 0/0 every bake regardless of whether the PHOTO_SHADOW system's
    // OWN separate reassert (effects.js _reassertPhotoShadowCoverage) actually corrects it -- an
    // unrelated internal counter, not proof either way. Built directly from `frontier` (already
    // fully populated above, straight from the schedule ops) rather than captured during the
    // scene traversal below -- an earlier version tried the traversal and came back empty every
    // time: steel beams/columns (isSteel above) are exactly the elements most likely rendered via
    // BatchedMesh/InstancedMesh, which never carry a single userData.guid the "single mesh" branch
    // below can match against. Reading straight from `frontier` is correct regardless of which
    // rendering path a given guid ends up on.
    window.__tmFrontierGuidsNow = new Set(Object.keys(frontier));
    var _perfT0 = performance.now(), _perfObjs = 0, _perfSkipped = 0, _perfHideForProxy = 0;
    app.scene.traverse(function(obj) {
      _perfObjs++;
      if (!obj.userData) return;

      // ── Single mesh (has userData.guid) ──
      if (obj.userData.guid) {
        var g = obj.userData.guid;
        var isFrontier = !!frontier[g];
        var isPlaced = !!placed[g];
        var isRecent = recent[g] !== undefined;
        // §XRAY_STAGING_REMOVED (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
        // §HOSPITAL_LIGHTING_STILL_FLOATING — user directive: "remove that staging stage!!!" after
        // "on Day 5... hanging MEP elements started hanging in mid air"). §Z_STACK_XRAY_STAGING
        // (2026-08-03) used to show a placed-but-not-yet-fully-supported element as a translucent
        // ghost instead of solid — a deliberate "still under construction" visual. That ghost IS a
        // real element appearing before its support finishes, i.e. exactly the mid-air look, just
        // translucent instead of opaque. It also only ever applied to obj.isMesh — BatchedMesh/
        // InstancedMesh (where the bulk of MEP actually renders) got NO such gating at all and
        // showed the same unsupported population fully SOLID, worse than the ghost. Folding the
        // same one condition into `showReal` here removes the ghost path entirely and closes the
        // BatchedMesh/InstancedMesh gap the same way, in one place: nothing appears until its own
        // support is actually finished, full stop — never a ghost, never an early solid.
        var isStagedNow = !isFrontier && (_tmXraySolidifyTs[g] !== undefined && cursorMs < _tmXraySolidifyTs[g]);
        // §DLOD_TM landmine-5 guard (double-draw): hideForProxy can only be true for placed-only
        // elements — isFrontier already excludes it, so real-mesh and box visibility stay disjoint.
        var hideForProxy = _dlodOn && isPlaced && !isFrontier && !isRecent && !_dlodInView(g);
        if (hideForProxy) _perfHideForProxy++;
        var showReal = (isRecent || isPlaced) && !hideForProxy && !isStagedNow;

        // Visibility + highlighting
        if (isFrontier) {
          obj.visible = true;
          if (obj.isMesh) {
            _wbMat('FRONTIER', obj);
            var ft = frontier[g].t;
            // §S260e: Emissive glow on frontier — visible on all GPUs
            // Cyan flash (first 15%) then orange glow during install
            var fColor = ft < 0.15 ? 0x44ffff : 0xff8c00;
            applyHighlight(obj, fColor, 0.85, 0.4);
          }
        } else if (showReal) {
          obj.visible = true;
          if (obj._tm_highlighted) { _wbMat('RESTORE', obj); restoreMaterial(obj); }
        } else {
          obj.visible = false;
          if (obj._tm_highlighted) restoreMaterial(obj);
        }

        // Shadow + camera (merged — was 3 separate traversals)
        // §S260b: Only set shadow flags if Sunglass shadow is ON
        if (obj.isMesh) {
          if (isFrontier) {
            obj.castShadow = !!app._shadowOn;
            obj.receiveShadow = !!app._shadowOn;
            if (app._shadowOn) { _shadowCasters++; _shadowReceivers++; }
            var swp = new THREE.Vector3();
            obj.getWorldPosition(swp);
            _frontierCentroids.push(swp);
            _frontierPositions.push(swp);
            if (_camFollow) _guidPosMap[g] = swp;
            _gspCollect(swp.x, swp.y, swp.z); _gspFrontierN++;   // §GROUP_SPARK: single-mesh frontier
            // §S260d: Sparks removed (white square artifacts)
          } else if (showReal) {
            obj.receiveShadow = false;  // §S259: shadows globally disabled
            obj.castShadow = false;
            _placedMeshes.push(obj);
            // Only getWorldPosition for preview GUIDs (not all 100K meshes)
            if (_previewGuids && _previewGuids[g]) {
              var pmp = new THREE.Vector3();
              obj.getWorldPosition(pmp);
              _guidPosMap[g] = pmp;
            }
          } else {
            obj.castShadow = false;
            obj.receiveShadow = false;
            // Only getWorldPosition for preview GUIDs (future elements in look-ahead window)
            if (_previewGuids && _previewGuids[g]) {
              var fmp = new THREE.Vector3();
              obj.getWorldPosition(fmp);
              _guidPosMap[g] = fmp;
            }
          }
        }
        return;
      }

      // ── BatchedMesh (per-slot GUIDs in _batchMeta) — S260 ──
      if (obj.isBatchedMesh && app._batchMeta && app._batchMeta[obj.id]) {
        // §PERF_INCR Phase 2: same event index already indexes _batchMeta guids (see
        // _tmBuildEventIndex) but this branch never consulted it -- LTU's BatchedMesh-consolidated
        // geometry (8 draw calls) got ZERO benefit from Phase 1, only InstancedMesh did.
        if (_incrOK && !_tmHasEventIn(_evMesh[obj.id], _dLo, _dHi)) { _perfSkipped++; return; }
        var bmetas = app._batchMeta[obj.id];
        var anyVis = false;
        var _bmHasFrontier = false;
        var _bmM4 = _tmM4;
        var _bmPos = _tmV1;
        for (var bi = 0; bi < bmetas.length; bi++) {
          var bg = bmetas[bi].guid;
          var sid = bmetas[bi].slotId;
          var bHideForProxy = _dlodOn && !!placed[bg] && !frontier[bg] && recent[bg] === undefined && !_dlodInView(bg);
          // §XRAY_STAGING_REMOVED — same gate as the single-mesh branch: this population (mostly
          // MEP, batched for performance) previously had NO staging check at all and showed fully
          // solid before its own support finished — the worse half of the bug this removal closes.
          var bStaged = !frontier[bg] && (_tmXraySolidifyTs[bg] !== undefined && cursorMs < _tmXraySolidifyTs[bg]);
          if ((placed[bg] || frontier[bg] || recent[bg] !== undefined) && !bHideForProxy && !bStaged) {
            obj.setVisibleAt(sid, true);
            anyVis = true;
            if (frontier[bg]) {
              _bmHasFrontier = true;
              obj.getMatrixAt(sid, _bmM4);
              _bmPos.setFromMatrixPosition(_bmM4);
              _gspCollect(_bmPos.x, _bmPos.y, _bmPos.z);   // §GROUP_SPARK: BatchedMesh slot
              _gspFrontierN++;
              if (_camFollow) {
                _frontierPositions.push(_bmPos.clone());
                _guidPosMap[bg] = _bmPos.clone();
              }
              // §YELLOW_BOX_RETIRED (2026-07-18, user: "bleed badly for Hospital") — the
              // depthTest:false edge box shone through walls/floors it should have been hidden
              // behind, reading as a bug not a feature on real buildings. Position tracking above
              // (camFollow/_frontierPositions/_guidPosMap) is unrelated and stays; only the
              // visible marker itself is removed.
            } else if (recent[bg] !== undefined) {
              // §GROUP_SPARK: recently-finished pieces are still cooling — include them as spark
              // candidates. Real frontier on Hospital is only ~7 elements at a time (crew-cap),
              // far too sparse to read; `recent` is the pool that makes the effect visible.
              // Still pure decoration: it only widens WHAT gets decorated, nothing is inferred.
              obj.getMatrixAt(sid, _bmM4);
              _bmPos.setFromMatrixPosition(_bmM4);
              _gspCollect(_bmPos.x, _bmPos.y, _bmPos.z);
              _gspRecentN++;
            }
            if (_camFollow && _previewGuids && _previewGuids[bg]) {
              obj.getMatrixAt(sid, _bmM4);
              _bmPos.setFromMatrixPosition(_bmM4);
              _guidPosMap[bg] = _bmPos.clone();
            }
          } else {
            obj.setVisibleAt(sid, false);
          }
        }
        obj.visible = anyVis;
        // §S260f: No material swap on BatchedMesh — elements visible by setVisibleAt is enough
        if (anyVis) _wbMat('BATCHED', obj);
        if (app._shadowOn) {
          obj.castShadow = anyVis;
          obj.receiveShadow = anyVis;
        }
      }

      // ── InstancedMesh (per-instance GUIDs in _instanceMeta) ──
      if (obj.isInstancedMesh && app._instanceMeta && app._instanceMeta[obj.id]) {
        if (_incrOK && !_tmHasEventIn(_evMesh[obj.id], _dLo, _dHi)) { _perfSkipped++; return; }
        var metas = app._instanceMeta[obj.id];
        var meshId = obj.id;
        var anyVisible = false;
        var anyFrontier = false;

        if (!_savedInstanceMatrices[meshId]) {
          _savedInstanceMatrices[meshId] = {};
          var tmpM = new THREE.Matrix4();
          for (var mi = 0; mi < metas.length; mi++) {
            obj.getMatrixAt(mi, tmpM);
            _savedInstanceMatrices[meshId][mi] = tmpM.clone();
          }
        }

        for (var mi = 0; mi < metas.length; mi++) {
          var ig = metas[mi].guid;
          var iHideForProxy = _dlodOn && !!placed[ig] && !frontier[ig] && recent[ig] === undefined && !_dlodInView(ig);
          // §XRAY_STAGING_REMOVED — same gate as the single-mesh/BatchedMesh branches.
          var iStaged = !frontier[ig] && (_tmXraySolidifyTs[ig] !== undefined && cursorMs < _tmXraySolidifyTs[ig]);
          if ((placed[ig] || frontier[ig] || recent[ig] !== undefined) && !iHideForProxy && !iStaged) {
            if (_savedInstanceMatrices[meshId][mi]) {
              obj.setMatrixAt(mi, _savedInstanceMatrices[meshId][mi]);
            }
            anyVisible = true;
            if (frontier[ig]) {
              anyFrontier = true;
              // §GROUP_SPARK: InstancedMesh instance — position from the saved matrix
              if (_savedInstanceMatrices[meshId][mi]) {
                _tmV2.setFromMatrixPosition(_savedInstanceMatrices[meshId][mi]);
                _gspCollect(_tmV2.x, _tmV2.y, _tmV2.z); _gspFrontierN++;
              }
            }
          } else {
            obj.setMatrixAt(mi, _zeroMatrix);
          }
        }
        obj.instanceMatrix.needsUpdate = true;
        obj.visible = anyVisible;
        if (anyVisible) _wbMat('INSTANCED' + (anyFrontier ? '_FRONTIER' : ''), obj);

        // §S260d: DO NOT highlight InstancedMesh — shared material affects ALL instances,
        // not just frontier ones. This was the white box flash (entire mesh turned orange).
        // Frontier instances are visible via matrix restore; non-frontier via zero matrix.
        if (obj._tm_highlighted) {
          restoreMaterial(obj); // clean up any leftover highlight from previous code
        }
      }
    });

    var _travMs = performance.now() - _perfT0;
    if (_gspRoll % 10 === 0) console.log('§PERF_TRAVERSE ms=' + _travMs.toFixed(1) +
      ' objs=' + _perfObjs + ' skipped=' + _perfSkipped + ' mode=' + (_incrOK ? 'delta' : 'full') +
      ' span=' + Math.round((_dHi - _dLo) / 3600000) + 'h cand=' + (_gspCand.length / 3));
    // Diagnostic hook (harmless, cheap): last-traverse stats for perf verification without relying
    // on the throttled log. Read via window.__tmTrav in a probe.
    window.__tmTrav = { ms: +_travMs.toFixed(1), objs: _perfObjs, skipped: _perfSkipped,
                        mode: _incrOK ? 'delta' : 'full' };
    // §DLOD_VF_VISCOUNT (2026-08-05) — every tick while DLOD is engaged AND a POV camera (not main)
    // is the active gate, per the prior session's ask: "add a log of visible-element-count from
    // vfCam's perspective... at the moment _vfRender()'s box goes visually blank". Not throttled
    // like §PERF_TRAVERSE — only fires while B is on, so volume is bounded by rehearsal length, not
    // general use. hideForProxy climbing toward objs (few/no real meshes left near the camera) at
    // the SAME tick the user reports "blank" would confirm the DLOD-culling theory directly; staying
    // low would point elsewhere (e.g. scissor/viewport, see §CPE_VF_RENDER_TRACE).
    if (_dlodOn && _dlodActiveCam !== app.camera) {
      window.__tmDlodVf = { hideForProxy: _perfHideForProxy, objs: _perfObjs,
        camPos: { x: +_dlodCamPos.x.toFixed(2), y: +_dlodCamPos.y.toFixed(2), z: +_dlodCamPos.z.toFixed(2) } };
      console.log('§DLOD_VF_VISCOUNT hideForProxy=' + _perfHideForProxy + ' objs=' + _perfObjs +
        ' camPos=' + JSON.stringify(window.__tmDlodVf.camPos));
    }
    _incrPrimed = true;   // a full pass has now established slot state for every mesh
    // §GROUP_SPARK: emit AFTER the traverse — capping and per-group random selection need the
    // whole candidate set, which spawn-as-you-find (the reverted #866 shape) cannot provide.
    // `_playing` gates it: sparks during playback only, never on scrub.
    _gspEmit(_playing);

    // TM_DLOD_SCALE.md §2/§5.1: box-proxy sync — separate objects, never registered in
    // _batchMeta/_instanceMeta above, so this never touches _metaGen (W-DLOD-NO-REBUILD).
    _dlodUpdateBoxes(app, _dlodOn, placed, frontier, recent);

    // ── Shadow promotion pass: nearby placed meshes → castShadow (cap 500) ──
    // §S260b: Only when Sunglass shadow is ON
    if (app._shadowOn && _frontierCentroids.length && _shadowCasters < 500) {
      var maxExtra = 500 - _shadowCasters;
      var stride = Math.max(1, Math.floor(_placedMeshes.length / 1000));
      for (var spi = 0; spi < _placedMeshes.length && maxExtra > 0; spi += stride) {
        var sobj = _placedMeshes[spi];
        sobj.getWorldPosition(_tmV2);
        for (var si = 0; si < _frontierCentroids.length; si++) {
          if (_tmV2.distanceToSquared(_frontierCentroids[si]) < 400) {
            sobj.castShadow = true;
            _shadowCasters++;
            maxExtra--;
            break;
          }
        }
      }
    }
    // §SHADOW_FRONTIER — log every 60 ticks
    // §VAC V1 / §R14.1 (bim-compiler prompts/CPE_4D_PERF_MEM_STUDY.md): this line printed
    // "casters=0 receivers=0" on all 33 firings of the 2,027-frame Hospital bake, and BOTH of its
    // counters are structurally unreachable in that run — so the zeros were never a judgement.
    //   (a) _shadowCasters/_shadowReceivers only increment behind `if (app._shadowOn)` (:1463 and
    //       the promotion pass directly above); that run logged §TM_SHADOW_INHERIT shadowOn=false.
    //   (b) both counters live in the SINGLE-MESH branch (see the §PERF_INCR Phase 2 comment near
    //       :1342). On a device that took the fast batched path there are no individually-meshed
    //       elements at all — §SHADOW_FRONTIER_IDX measured meshGuids=0 groupGuids=63182 on the
    //       same building, and §BATCHED_FAIL never fired.
    // The log line sits OUTSIDE the `if (app._shadowOn …)` block on purpose (a zero must still be
    // reportable), so it has to name WHICH predicate is empty rather than print a bare 0.
    _shadowLogTick++;
    if (_shadowLogTick >= 60) {
      _shadowLogTick = 0;
      if (!app._shadowOn) {
        console.log('§SHADOW_FRONTIER VACUOUS — shadowOn=false, the casters/receivers counters are gated off; 0 means "not asked", not "none found"');
      } else if (!_placedMeshes.length && !_frontierCentroids.length) {
        console.log('§SHADOW_FRONTIER VACUOUS — shadowOn=true but the single-mesh branch placed 0 meshes and 0 frontier centroids (batched/instanced scene); these counters cannot see batched geometry');
      } else {
        console.log('§SHADOW_FRONTIER casters=' + _shadowCasters + ' receivers=' + _shadowReceivers +
          ' (single-mesh branch only; placedMeshes=' + _placedMeshes.length + ' frontierCentroids=' + _frontierCentroids.length + ')');
      }
    }

    // §S260c: Cinematic Director — storyboard-driven camera (Film Studio mode)
    // Scene types: 'flythrough' (tight on devices) vs 'panoramic' (wide orbit over dense area)
    // §S260c BUG6: Run camera when storyboard exists, not just when frontier elements are present.
    // The storyboard is pre-planned — camera must move even between frontier bursts.
    if (_camFollow && _cineStoryboard.length && app.controls && app.camera) {
      var nowPerf = performance.now();
      _cineTick++;
      var target = app.controls.target;

      function easeInOut(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }

      // ── Line-of-sight peel: temporarily hide meshes blocking camera → target ──
      // Restores them next tick. Essential for MEP in constrained ceiling/shaft spaces.
      // §S260c: SKIP on mobile — material clones consume memory
      var _isMobileCine = !!(window._isMobile || window._isMobileTM);
      function peelObstructions(camPos, tgtPos) {
        if (_isMobileCine) return; // no peel on mobile
        // Restore anything peeled last tick
        restorePeeled();
        _tmV2.subVectors(tgtPos, camPos).normalize();
        var dist = camPos.distanceTo(tgtPos);
        _tmRay.set(camPos, _tmV2);
        _tmRay.far = dist * 0.9; // only hide things between cam and 90% of target
        var meshes = [];
        app.scene.traverse(function(o) { if (o.isMesh && o.visible) meshes.push(o); });
        var hits = _tmRay.intersectObjects(meshes, false);
        // Hide up to 5 obstructing meshes (walls, slabs blocking the view)
        for (var hi = 0; hi < Math.min(hits.length, 5); hi++) {
          var obj = hits[hi].object;
          if (obj.userData && obj.userData.guid) {
            obj._cinePeeled = true;
            obj._cinePeelOrigMat = obj.material; // §S278: save original to restore + dispose clone
            obj.material = obj.material.clone();
            obj.material.transparent = true;
            obj.material.opacity = 0.08;
            obj.material.needsUpdate = true;
            _cinePeeled.push(obj);
          }
        }
      }

      // Advance storyboard: move to next scene when cursor passes current scene's end time
      var scene = _cineStoryboard[_cineSceneIdx];
      // §S260d: Scene ends when BOTH conditions met:
      // 1. Cursor past scene's timeline end (ops are done)
      // 2. Minimum beat ticks elapsed (ensures enough real screen time for camera arc)
      var sceneEnded = false;
      var beatLen = scene && scene.type === 'panoramic' ? _BEAT_ESTAB : _BEAT_CLOSEUP;
      var timelineEnded = scene && scene.endTs ? (_cursor >= scene.endTs) : true;
      var beatDone = _cineTick > beatLen;
      sceneEnded = timelineEnded && beatDone;

      if (scene && _cineBeat === 'closeup' && sceneEnded) {
        // §S260d: If background builder still running and we're at the end, hold here
        if (_bgBuildRaf && _cineSceneIdx >= _cineStoryboard.length - 1) {
          _cineTick = 0;
          viewerStatus('🚁 Composing flight path... ' + _cineStoryboard.length + ' scenes');
        } else {
        restorePeeled();
        _cineHeroSlowdown = false;
        if (scene) { delete scene._arcStart; delete scene._arcEnd; }
        _cineCloseupCount++;
        _cineTick = 0;
        _cineSceneIdx++;
        // §S260f: Skip scenes whose construction is already done — jump to where action is
        while (_cineSceneIdx < _cineStoryboard.length - 1) {
          var _peek = _cineStoryboard[_cineSceneIdx];
          if (_peek.endTs && _cursor >= _peek.endTs) {
            _cineSceneIdx++;
          } else {
            break;
          }
        }

        // §S260f: No establishing beat — transit directly to next scene (no lingering)
        {
          _cineBeat = 'transit';
          _cineTransitFrom = app.camera.position.clone();
          var ns = _cineStoryboard[_cineSceneIdx];
          if (ns) {
            var nDist = ns.type === 'panoramic' ? _PANORAMIC_DIST : ns.type === 'hero' ? _HERO_DIST : _FLYTHROUGH_DIST;
            _cineTransitTo = new THREE.Vector3(
              ns.center.x + Math.cos(ns.angle) * nDist,
              ns.center.y + nDist * 0.5,
              ns.center.z + Math.sin(ns.angle) * nDist
            );
            _cineNextTarget = ns.center;
          } else {
            _cineTransitTo = app.camera.position.clone();
          }
          console.log('§CINE_BEAT transit → scene ' + _cineSceneIdx + '/' + _cineStoryboard.length);
        }
      } // else (not waiting for bg build)
      } // sceneEnded

      // ── CLOSEUP (flythrough or panoramic scene) ──
      // §S260c v2: Boost exposure during close-up for vivid materials
      if (app.renderer) {
        var targetExp = (_cineBeat === 'closeup') ? 1.3 : 1.15;
        var curExp = app.renderer.toneMappingExposure;
        if (Math.abs(curExp - targetExp) > 0.01) {
          app.renderer.toneMappingExposure += (targetExp - curExp) * 0.08;
        }
      }
      // §S260e: OPENING — 10s establishing orbit, look-at starts at foundation (first scene)
      if (_cineBeat === 'opening') {
        _sunCycle = true;
        var openT = Math.min(1, _cineTick / _BEAT_OPENING);
        if (_cineOpenStart && _cineOpenTarget) {
          var openAz = openT * Math.PI; // 180° sweep
          var openOff = _tmV2.subVectors(_cineOpenStart, _cineOpenTarget);
          var openR = Math.sqrt(openOff.x * openOff.x + openOff.z * openOff.z);
          var openBaseAz = Math.atan2(openOff.z, openOff.x);
          // §S260e: Look-at target — lerp from first scene (foundation) to building center
          // First scene is lowest Y after spatial sort = underground piling/footing
          var foundationY = (_cineStoryboard.length > 0) ? _cineStoryboard[0].center.y : _cineOpenTarget.y;
          var lookY = foundationY + (_cineOpenTarget.y - foundationY) * easeInOut(openT);
          // Camera Y — orbit at building-center height, looking DOWN at foundation initially
          var camY = _cineOpenStart.y;
          app.camera.position.set(
            _cineOpenTarget.x + Math.cos(openBaseAz + openAz) * openR,
            camY,
            _cineOpenTarget.z + Math.sin(openBaseAz + openAz) * openR
          );
          target.set(_cineOpenTarget.x, lookY, _cineOpenTarget.z);
          if (_cineTick % 25 === 0) {
            console.log('§CINE_OPEN_CAM t=' + openT.toFixed(2) + ' camY=' + camY.toFixed(1) +
              ' lookY=' + lookY.toFixed(1) + ' foundationY=' + foundationY.toFixed(1) +
              ' az=' + (openBaseAz + openAz).toFixed(2) + ' tick=' + _cineTick + '/' + _BEAT_OPENING);
          }
        }
        if (_cineTick >= _BEAT_OPENING) {
          // §S260e: Opening done — construction already playing, transition camera to first scene
          _cineBeat = 'transit';
          _cineTick = 0;
          _cineSceneIdx = 0;
          _cineTransitFrom = app.camera.position.clone();
          var firstSc = _cineStoryboard[0];
          if (firstSc) {
            var fDist = firstSc.type === 'panoramic' ? _PANORAMIC_DIST : _FLYTHROUGH_DIST;
            _cineTransitTo = new THREE.Vector3(
              firstSc.center.x + Math.cos(firstSc.angle || 0) * fDist * 2,
              firstSc.center.y + fDist * 0.7,
              firstSc.center.z + Math.sin(firstSc.angle || 0) * fDist * 2
            );
            _cineNextTarget = firstSc.center;
            console.log('§CINE_OPENING_END → transit to scene 0 type=' + firstSc.type +
              ' y=' + firstSc.center.y.toFixed(1) + ' cls=' + (firstSc.cls || '?') +
              ' count=' + firstSc.count);
          } else {
            _cineTransitTo = app.camera.position.clone();
          }
          console.log('§CINE_OPENING_END → transit to scene 0');
        }
      } else if (_cineBeat === 'closeup') {
        var sc = _cineStoryboard[_cineSceneIdx];
        if (sc) {
          // §S260f: Blend scene center (stable) with frontier centroid (where action is)
          // 70% scene center + 30% frontier = smooth path biased toward action
          var _lookAt = sc.center;
          if (_frontierPositions.length > 0) {
            var _fx = 0, _fy = 0, _fz = 0;
            for (var fi = 0; fi < _frontierPositions.length; fi++) {
              _fx += _frontierPositions[fi].x; _fy += _frontierPositions[fi].y; _fz += _frontierPositions[fi].z;
            }
            var _fc = new THREE.Vector3(_fx / _frontierPositions.length, _fy / _frontierPositions.length, _fz / _frontierPositions.length);
            _lookAt = new THREE.Vector3(
              sc.center.x * 0.7 + _fc.x * 0.3,
              sc.center.y * 0.7 + _fc.y * 0.3,
              sc.center.z * 0.7 + _fc.z * 0.3);
          }
          _cineNextTarget = _lookAt;
          var _userIdle = (nowPerf - _camUserInteracted > 3000);
          if (!_camTarget) _camTarget = _lookAt.clone();
          if (_userIdle) {
            // §S260f: Slow lerp for smooth glide (0.08), not chasing (0.25)
            _camTarget.x += (_lookAt.x - _camTarget.x) * 0.08;
            _camTarget.y += (_lookAt.y - _camTarget.y) * 0.08;
            _camTarget.z += (_lookAt.z - _camTarget.z) * 0.08;

            target.x += (_camTarget.x - target.x) * 0.06;
            target.y += (_camTarget.y - target.y) * 0.06;
            target.z += (_camTarget.z - target.z) * 0.06;

            var baseDist = sc.type === 'panoramic' ? _PANORAMIC_DIST :
                           sc.type === 'hero' ? _HERO_DIST : _FLYTHROUGH_DIST;
            var desiredDist = baseDist + Math.min(20, (sc.count || 8) * 0.3);
            var camDist = app.camera.position.distanceTo(target);
            var minDist = desiredDist * 0.5;
            if (camDist < minDist) {
              _tmV2.subVectors(app.camera.position, target).normalize();
              app.camera.position.copy(target).addScaledVector(_tmV2, minDist);
              camDist = minDist;
            }
            var diff = camDist - desiredDist;
            if (Math.abs(diff) > 0.5) {
              var spd = diff > 0 ? 0.08 : 0.04;
              _tmV2.subVectors(target, app.camera.position).normalize();
              app.camera.position.addScaledVector(_tmV2, diff * spd);
            }
          }

          // Slow orbit
          if (_playing && _userIdle) {
            var orbitSpd = sc.type === 'hero' ? (Math.PI * 2 / _BEAT_CLOSEUP) : 0.006;
            _camAngle += orbitSpd;
            _tmV2.subVectors(app.camera.position, target);
            var dist2D = Math.sqrt(_tmV2.x * _tmV2.x + _tmV2.z * _tmV2.z);
            var curAz = Math.atan2(_tmV2.z, _tmV2.x);
            _tmV2.x = Math.cos(curAz + orbitSpd) * dist2D;
            _tmV2.z = Math.sin(curAz + orbitSpd) * dist2D;
            app.camera.position.copy(target).add(_tmV2);
          }

          // Peel obstructions
          peelObstructions(app.camera.position, target);

          // Hero: slow time + outline
          if (sc.type === 'hero') {
            _cineHeroSlowdown = true;
            app.scene.traverse(function(obj) {
              if (obj.userData && obj.userData.guid === sc.guids[0] && obj.isMesh) {
                applyOutline(obj, 0xff6600);
              }
            });
          }
          if (sc.type === 'panoramic') _sunCycle = true;
        }

      // ── ESTABLISHING: wide pull-back, full building orbit, shadow sweep ──
      } else if (_cineBeat === 'establishing') {
        _sunCycle = true;
        var bldCenter = _tmV2.set(0, 10, 0);
        if (app.buildingCentres && app.activeBuilding && app.buildingCentres[app.activeBuilding]) {
          var bc = app.buildingCentres[app.activeBuilding];
          var p = app.ifc2three(bc.ix, bc.iy, bc.iz);
          bldCenter.set(p.x, p.y, p.z);
        }

        // §S260d: Reverted to S260c establishing — pull back + orbit
        target.x += (bldCenter.x - target.x) * 0.04;
        target.y += (bldCenter.y - target.y) * 0.04;
        target.z += (bldCenter.z - target.z) * 0.04;

        var wideDesired = 80;
        var camDist = app.camera.position.distanceTo(target);
        if (camDist < wideDesired) {
          _tmV3.subVectors(app.camera.position, target).normalize();
          app.camera.position.addScaledVector(_tmV3, (wideDesired - camDist) * 0.04);
        }
        if (_playing && (nowPerf - _camUserInteracted > 2000)) {
          _camAngle += 0.012;
          _tmV3.subVectors(app.camera.position, target);
          var dist2D = Math.sqrt(_tmV3.x * _tmV3.x + _tmV3.z * _tmV3.z);
          var curAz = Math.atan2(_tmV3.z, _tmV3.x);
          _tmV3.x = Math.cos(curAz + 0.012) * dist2D;
          _tmV3.z = Math.sin(curAz + 0.012) * dist2D;
          app.camera.position.copy(target).add(_tmV3);
        }

        if (_cineTick > _BEAT_ESTAB) {
          _cineBeat = 'transit';
          _cineTick = 0;
          _cineTransitFrom = app.camera.position.clone();
          // Wrap storyboard if exhausted
          // §S260c v2: Don't wrap/loop — when storyboard exhausted, stay in establishing
          if (_cineSceneIdx >= _cineStoryboard.length) _cineSceneIdx = _cineStoryboard.length - 1;
          var ns = _cineStoryboard[_cineSceneIdx];
          if (ns) {
            var nDist = ns.type === 'panoramic' ? _PANORAMIC_DIST : ns.type === 'hero' ? _HERO_DIST : _FLYTHROUGH_DIST;
            _cineTransitTo = new THREE.Vector3(
              ns.center.x + Math.cos(ns.angle) * nDist,
              ns.center.y + nDist * 0.5,
              ns.center.z + Math.sin(ns.angle) * nDist
            );
            _cineNextTarget = ns.center;
          } else {
            _cineTransitTo = app.camera.position.clone();
            _cineNextTarget = null;
          }
          console.log('§CINE_BEAT transit from establishing → scene ' + _cineSceneIdx);
        }

      // ── TRANSIT: continuous crane shot — arc lift, never a jump cut ──
      } else if (_cineBeat === 'transit') {
        restorePeeled(); // clear peeled meshes during travel
        var t = Math.min(1, _cineTick / _BEAT_TRANSIT);
        var et = easeInOut(t);

        var midLift = Math.sin(t * Math.PI) * 5;
        app.camera.position.lerpVectors(_cineTransitFrom, _cineTransitTo, et);
        app.camera.position.y += midLift;

        // S260c: smooth target convergence during transit
        if (_cineNextTarget) {
          target.x += (_cineNextTarget.x - target.x) * (et * 0.12 + 0.03);
          target.y += (_cineNextTarget.y - target.y) * (et * 0.12 + 0.03);
          target.z += (_cineNextTarget.z - target.z) * (et * 0.12 + 0.03);
        }

        if (t >= 1) {
          _cineBeat = 'closeup';
          _cineTick = 0;
          _camTarget = _cineNextTarget ? _cineNextTarget.clone() : null;
          // §S260d: Lazy angle — raycast once on arrival (not during storyboard build)
          var arrScene = _cineStoryboard[_cineSceneIdx];
          if (arrScene && arrScene._angleLazy) {
            var lDist = arrScene.type === 'panoramic' ? _PANORAMIC_DIST :
                        arrScene.type === 'hero' ? _HERO_DIST : _FLYTHROUGH_DIST;
            arrScene.angle = pickClearAngle(arrScene.center, lDist);
            delete arrScene._angleLazy;
            console.log('§LAZY_ANGLE scene=' + _cineSceneIdx + ' angle=' + arrScene.angle.toFixed(2));
          }
          // §S260d: Arc system computes start/end on first closeup tick — no snap needed here
          console.log('§CINE_BEAT closeup — arrived at scene ' + _cineSceneIdx +
            ' type=' + (arrScene ? arrScene.type : '?'));
        }
      }

      app.controls.update();

      // §CINE_DIRECTOR — log every 40 ticks
      _camLogTick++;
      if (_camLogTick >= 40) {
        _camLogTick = 0;
        var scInfo = _cineStoryboard[_cineSceneIdx];
        var _cp = app.camera.position, _ct = app.controls.target;
        var _cd = _cp.distanceTo(_ct);
        console.log('§CINE_DIRECTOR beat=' + _cineBeat + ' scene=' + _cineSceneIdx + '/' +
          _cineStoryboard.length + ' type=' + (scInfo ? scInfo.type : '?') +
          ' tick=' + _cineTick + ' peeled=' + _cinePeeled.length +
          ' cam=(' + _cp.x.toFixed(1) + ',' + _cp.y.toFixed(1) + ',' + _cp.z.toFixed(1) + ')' +
          ' tgt=(' + _ct.x.toFixed(1) + ',' + _ct.y.toFixed(1) + ',' + _ct.z.toFixed(1) + ')' +
          ' dist=' + _cd.toFixed(1));
      }
    }

    // §S260d: Distant particles REMOVED — PointsMaterial white square artifacts

    // §SFX seam (sfx.js): report frontier phases + a representative world centroid (→ stereo
    // pan) + progress/activity (→ the cinematic bed's two dials). No-op when audio off/absent.
    // most-active phase first (by element count) — stable dominant, not alphabetical flicker
    var _sfxArr = _sfxPhases ? Object.keys(_sfxPhases).sort(function (a, b) { return _sfxPhases[b] - _sfxPhases[a]; }) : [];
    // §CPE_ROOM_TITLE_COLLECTIVE: the dominant frontier phase, refreshed EVERY tick — null the
    // moment the frontier empties (construction complete), so the caption bracket can never
    // outlive the work it names. cpe_room_title.js reads this at draw time.
    var _appPh = (typeof A === 'function') ? A() : null;
    if (_appPh) _appPh.tmFrontierPhase = _sfxArr[0] || null;
    if (window.__sfxTM) {
      var _sfxCen = null;
      if (_frontierPositions.length) {
        var _sx = 0, _sy = 0, _sz = 0;
        for (var _spi = 0; _spi < _frontierPositions.length; _spi++) { _sx += _frontierPositions[_spi].x; _sy += _frontierPositions[_spi].y; _sz += _frontierPositions[_spi].z; }
        _sfxCen = { x: _sx / _frontierPositions.length, y: _sy / _frontierPositions.length, z: _sz / _frontierPositions.length };
      }
      var _sfxSpan = _projectEnd - _projectStart;
      var _sfxProg = _sfxSpan > 0 ? Math.max(0, Math.min(1, (_cursor - _projectStart) / _sfxSpan)) : 0;
      window.__sfxTM(_sfxArr, _sfxCen, { progress: _sfxProg, active: _frontierPositions.length });
      _sfxPhases = null;
    }

    // Implementing prompts/PHOTOREAL_STILL_RENDER.md §BILLBOARD_NAME_ELEMENT §5 —
    // Witness: W-BILLBOARD-NAME-ELEMENT V1/V2.
    // §TM_OVERLAY_SYNC seam — presentation overlays (the billboard artwork quad and the building
    // name-plate lettering in effects.js) are NOT elements: they carry no userData.guid, so the
    // traverse above never touches them and they render from frame 0 of a buildup, even at cursors
    // where the REAL element they sit on is hidden. Handing them the element's guid instead would
    // make two scene objects answer to one guid for picking/Find/BOM, and would run applyHighlight
    // (cyan/orange emissive at 0.85 opacity) over the artwork during its install window.
    // So: one O(1) feature-detected call, same shape and same place as the §SFX seam above. TM
    // hands over the visibility it has ALREADY computed for this tick — the overlay owner cannot
    // drift from the element because it is not re-deriving anything. Passing null (see deactivate)
    // means "TM is off, show your overlays".
    if (window.__tmOverlaySync) {
      try {
        window.__tmOverlaySync(function (g) {
          return !!placed[g] || !!frontier[g] || recent[g] !== undefined;
        });
      } catch (e) { /* an overlay owner must never be able to break the scrub */ }
    }

    applySunCycle(cursorMs);
    if (_ganttVisible) drawGanttMini();
    if (_dashVisible) drawDashboard();
    if (_varVisible) drawVariance();   // §S1 — variance drawer tracks the scrub (hairline + phase-under-cursor)

    if (app.markDirty) app.markDirty();
    // Force immediate render — mobile browsers defer rAF until touch.
    // §TM_GI_RENDER (2026-07-17): honor the Alt+G N8AO composer here directly, in SINGLE-PASS mode.
    // Two facts force this exact shape: (1) TM's desktop render gate wakes, draws ONE frame, then
    // self-parks the rAF chain (main.js §S286 "§IDLE_GATE park — 0 frames"), so N8AO's temporal
    // accumulation (accumulate:true) can NEVER converge on a static-camera scrub — it's frozen at a
    // partial buffer, and whether firstFrame()'s clear won the race with the main loop's own composer
    // render decided clean-vs-ghost => the intermittent ghost the user saw. Single-pass AO
    // (accumulate=false) produces a COMPLETE frame in the one render the gate allows. (2) rendering
    // through the composer here (not raw) makes the AO frame deterministic in this call, not racing
    // the main loop. No-op unless Alt+G is already engaged. accumulate is restored to true in
    // deactivate() so a normal (non-TM) Alt+G keeps its converged-still quality.
    if (app._giComposer && app._giComposerActive) {
      _giCancelConverge();   // §TM_GI_HOLD: this call IS motion (scrub/tick) — abandon any hold-polish
      if (app._giN8aoPass && app._giN8aoPass.configuration) app._giN8aoPass.configuration.accumulate = false;
      if (!renderAtTime._giLogged) { console.log('§TM_GI_RENDER Time Machine → Alt+G N8AO composer, single-pass (accumulate off)'); renderAtTime._giLogged = true; }
      app._giComposer.render();
      if (!_playing) _giScheduleHoldConverge(app);   // §TM_GI_HOLD: arm the 300ms "settled → polish" timer
    } else if (app.renderer && app.scene && app.camera) {
      app.renderer.render(app.scene, app.camera);
    }
    // §CPE_VF_BUILDUP_BLANK (2026-08-06) — user report: "B blank during BuildUp playback, only
    // shows when paused" (HANDOFF 2026-08-06 LATE, Item 1). renderAtTime() just painted the FULL
    // canvas with the MAIN camera, wiping out whatever B's own scissor sub-render
    // (cinema_path_editor.js _vfRender, installed as app._cpeViewfinderRender) drew on a prior
    // frame. B only got repainted afterward if main.js's animate() rAF loop happened to run again
    // and see _needsRender still true — during a povOnly BuildUp rehearsal that is a race against
    // cinema_path_editor.js's OWN independent rAF chain (_previewFly's step(), which calls
    // tmSetCursor -> renderAtTime every frame and so re-wins the race almost every tick). Confirmed
    // live: witness_cpe_vf_buildup_blank.js (scratchpad, not yet committed) measured B's render
    // count against §PERF_TRAVERSE tick count during a 5s povOnly+buildup rehearsal — HHS_Office_
    // Federated, ~75% coverage before this fix (occasional flicker of real content between long
    // stale/frozen stretches — matches the earlier HANDOFF's inconclusive pixel-readback samples),
    // 100%+ after. Calling the hook here — same call main.js's animate() already makes at both its
    // own render branches — repaints B immediately after every tick, unconditionally, removing the
    // race instead of hoping to win it. No-op (single property check) when B is off.
    if (app._cpeViewfinderRender) app._cpeViewfinderRender();
    updateStatus();
    _broadcastTimeline();   // §S3 — realtime cross-tab scrub + pinpoint the item the data is addressing
  }

  // ── §S3 (TM_4D5D_VARIANCE_LANE) — realtime cross-tab timeline broadcast + scene pinpoint ──
  // The 4D ALREADY EXISTS (injectGantt). This stage does NOT regenerate it — it BROADCASTS the scrub over the
  // shared Connect bus (same channel the modeller speaks) so sibling tabs/surfaces follow in lockstep, and it
  // PINPOINTS the element(s) the cursor is addressing at this instant (the frontier) — publishing them as a
  // selection (so an ERP tab lights the matching record) + a HUD callout that singles them out.
  var _applyingRemoteScrub = false;   // echo guard: don't re-publish a scrub we're applying from another surface
  var _lastTLms = 0;                   // throttle wall-clock (runtime only; never used by witnesses)
  // PURE: the guids "addressed by the data" at cursorMs = ops whose window straddles the cursor (being built now).
  // Falls back to the most-recently-finished op when nothing is mid-flight, so a parked cursor still pinpoints.
  function _frontierAt(cursorMs) {
    var live = [], lastDone = null;
    for (var i = 0; i < _ops.length; i++) {
      var op = _ops[i];
      if (op.start_ts > cursorMs) continue;
      var guid = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
      if (!guid) continue;
      if (op.end_ts > cursorMs) live.push({ guid: guid, phase: (op.parameters || {}).phase || 'Architecture' });
      else if (!lastDone || op.end_ts > lastDone.end) lastDone = { guid: guid, phase: (op.parameters || {}).phase || 'Architecture', end: op.end_ts };
    }
    if (!live.length && lastDone) live.push({ guid: lastDone.guid, phase: lastDone.phase });
    return live;
  }
  function _broadcastTimeline() {
    var C = window.Connect;
    if (!_ops.length) return;
    var frontier = _frontierAt(_cursor);
    var guids = frontier.map(function (f) { return f.guid; });
    var lead = frontier.length ? frontier[0] : null;
    // HUD callout — single out the item(s) the data is addressing at this moment (always, even off-bus)
    _updatePinpoint(frontier);
    if (!C || !C.on || _applyingRemoteScrub) return;     // off-bus or echoing a remote scrub → no publish
    var now = (function () { try { return Date.now(); } catch (e) { return _lastTLms + 100; } })();
    if (now - _lastTLms < 80) return;                    // throttle the fan-out during playback/drag
    _lastTLms = now;
    var app = A(), span = _projectEnd - _projectStart;
    C.publish('timeline', { cursor: _cursor, frac: span > 0 ? (_cursor - _projectStart) / span : 0,
      frontier: guids.slice(0, 40), lead: lead ? lead.guid : null, phase: lead ? lead.phase : null,
      building: (app && app.activeBuilding) || null, surface: 'viewer' });
    // pinpoint cross-surface: publish the lead addressed element as a selection (ERP/sibling lights its record)
    if (lead) C.publish('selection', { guid: lead.guid, ifcClass: null, surface: 'viewer' });
    console.log('§TM_BROADCAST cursor=' + Math.round(_cursor) + ' frontier=' + guids.length + ' lead=' + String(lead && lead.guid).slice(0, 10) + ' phase=' + (lead ? lead.phase : '-'));
  }
  // inbound scrub from a sibling viewer tab (same building) → move our cursor to match, echo-guarded.
  function _applyRemoteTimeline(t) {
    if (!t || t.surface !== 'viewer' || !_active || !_ops.length) return;
    var app = A();
    if (t.building && app && app.activeBuilding && t.building !== app.activeBuilding) return;  // different model
    var span = _projectEnd - _projectStart;
    var c = (typeof t.cursor === 'number') ? t.cursor : (typeof t.frac === 'number' ? _projectStart + t.frac * span : null);
    if (c == null) return;
    _applyingRemoteScrub = true;
    try { renderAtTime(Math.max(_projectStart, Math.min(_projectEnd, c))); try { anchorFromCursor(); configSlider(); } catch (e) {} }
    finally { _applyingRemoteScrub = false; }
    console.log('§TM_TL_IN cursor=' + Math.round(_cursor) + ' from=' + (t.surface || '?'));
  }
  // HUD callout that names the addressed item(s) — created lazily, sits above the TM panel.
  function _updatePinpoint(frontier) {
    var el = document.getElementById('tm-pinpoint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tm-pinpoint';
      el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:128px;z-index:16;background:rgba(8,16,40,0.78);' +
        'border:1px solid #4fc3f7;border-radius:14px;padding:4px 12px;font-size:12px;color:#e8f4ff;pointer-events:none;' +
        'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);white-space:nowrap;display:none';
      document.body.appendChild(el);
    }
    if (!_active || !frontier || !frontier.length) { el.style.display = 'none'; return; }
    var byPhase = {}; frontier.forEach(function (f) { byPhase[f.phase] = (byPhase[f.phase] || 0) + 1; });
    var ph = Object.keys(byPhase).sort(function (a, b) { return byPhase[b] - byPhase[a]; })[0];
    el.innerHTML = '<span style="color:#4fc3f7">⊕ Now building</span> · ' + frontier.length + ' item' +
      (frontier.length > 1 ? 's' : '') + ' · <b>' + ph + '</b>';
    el.style.display = 'block';
  }

  // ── §S260c: Outline effect — wireframe edge overlay on mesh ──
  // Adds EdgesGeometry LineSegments as a child. Preserves original material.
  // Reusable by TM frontier, picking, clash, etc.
  var _outlineMeshes = []; // tracked for bulk cleanup

  var _highlightLogTick = 0; // throttle §HIGHLIGHT_APPLY logging
  var _wbLogCount = 0;       // §S260d: whitebox material log counter (persists across ticks)
  function applyOutline(obj, color) {
    if (!obj.isMesh || !obj.geometry) return;
    if (obj._tm_outline) return; // already has outline
    if (_highlightLogTick++ % 50 === 0) console.log('§HIGHLIGHT_APPLY type=outline guid=' + (obj.userData && obj.userData.guid) + ' color=0x' + (color || 0xff8c00).toString(16));
    try {
      var edges = new THREE.EdgesGeometry(obj.geometry, 30); // 30° threshold
      var line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: color || 0xff8c00, linewidth: 2, depthTest: true
      }));
      line.renderOrder = 1;
      line.userData._isOutline = true;
      obj.add(line);
      obj._tm_outline = line;
      _outlineMeshes.push(obj);
    } catch(e) {} // EdgesGeometry can fail on degenerate geometry
  }

  function removeOutline(obj) {
    if (!obj._tm_outline) return;
    obj.remove(obj._tm_outline);
    obj._tm_outline.geometry.dispose();
    obj._tm_outline.material.dispose();
    delete obj._tm_outline;
  }

  function clearAllOutlines() {
    for (var i = _outlineMeshes.length - 1; i >= 0; i--) {
      var om = _outlineMeshes[i];
      // §S260e: Frontier bbox glow lines are standalone scene children (not mesh children)
      if (om.userData && om.userData._isTmFrontier) {
        if (om.parent) om.parent.remove(om);
        // geometry + material are shared — just remove from scene, don't dispose
        continue;
      }
      removeOutline(om);
    }
    _outlineMeshes = [];
  }

  function applyHighlight(obj, color, opacity, emissiveI) {
    color = color || 0xff8c00;
    opacity = opacity || 0.9;
    emissiveI = emissiveI || 0.25;
    if (!obj._tm_highlighted && _highlightLogTick++ % 50 === 0) console.log('§HIGHLIGHT_APPLY type=highlight guid=' + (obj.userData && obj.userData.guid) + ' color=0x' + color.toString(16) + ' opacity=' + opacity);
    if (!obj._tm_highlighted) {
      obj._tm_origMaterial = obj.material;
      obj.material = obj.material.clone();
      obj._tm_highlighted = true;
      _highlightMeshes.push(obj);
    }
    var mat = obj.material;
    // §S260e: Emissive glow + depthTest:false — shines through ground for underground elements
    if (mat.emissive) { mat.emissive.setHex(color); mat.emissiveIntensity = emissiveI; }
    mat.transparent = true;
    mat.opacity = opacity;
    mat.depthTest = false;
    mat.needsUpdate = true;
    obj.renderOrder = 10;
    // §S260d: whitebox — log AFTER material modification to catch over-bright
    if (_highlightLogTick % 100 === 0) {
      var _hC = mat.color; var _hE = mat.emissive;
      var _hBright = _hC && (_hC.r > 0.9 && _hC.g > 0.9 && _hC.b > 0.9);
      var _hEmB = _hE && mat.emissiveIntensity > 0.3 && (_hE.r + _hE.g + _hE.b) > 0;
      console.log('§WB_HIGHLIGHT_AFTER guid=' + (obj.userData && obj.userData.guid || '?').substring(0,12) +
        ' type=' + (mat.type || '?') +
        ' rgb=' + (_hC ? _hC.r.toFixed(2)+','+_hC.g.toFixed(2)+','+_hC.b.toFixed(2) : '?') +
        ' em=' + (_hE ? _hE.r.toFixed(2)+','+_hE.g.toFixed(2)+','+_hE.b.toFixed(2) : '?') +
        ' eI=' + (mat.emissiveIntensity||0).toFixed(2) + ' op=' + mat.opacity.toFixed(2) +
        (_hBright ? ' ⚠WHITE' : '') + (_hEmB ? ' ⚠EMISSIVE' : ''));
    }
  }

  // Flash: brief arrival glow — subtle, not blinding
  function applyFlash(obj, color) {
    if (!obj._tm_highlighted && _highlightLogTick++ % 50 === 0) console.log('§HIGHLIGHT_APPLY type=flash guid=' + (obj.userData && obj.userData.guid) + ' color=0x' + (color || 0).toString(16));
    if (!obj._tm_highlighted) {
      obj._tm_origMaterial = obj.material;
      obj.material = obj.material.clone();
      obj._tm_highlighted = true;
      _highlightMeshes.push(obj);
    }
    var mat = obj.material;
    // §S260d: Capped emissive — 0.15 prevents white flash on light materials
    if (mat.emissive) { mat.emissive.setHex(color); mat.emissiveIntensity = 0.15; }
    mat.transparent = false;
    mat.opacity = 1.0;
    mat.depthTest = true;
    mat.needsUpdate = true;
  }

  function restoreMaterial(obj) {
    if (!obj._tm_highlighted) return;
    // Restore original material reference — no leftover color contamination
    if (obj._tm_origMaterial) {
      obj.material.dispose(); // free cloned material
      obj.material = obj._tm_origMaterial;
      delete obj._tm_origMaterial;
    }
    obj.renderOrder = 0;
    obj._tm_highlighted = false;
  }

  function clearHighlight(force) {
    // §Z_STACK_XRAY_STAGING: this runs at the TOP of every renderAtTime tick (§S260c "restore
    // previously highlighted meshes to solid"), which is correct for the transient frontier glow
    // (~a handful of elements at a time, per §CREW-CAP) but would be an O(staged-population)
    // clone+dispose CYCLE every tick if it also swept a large, SUSTAINED staged population — the
    // exact per-tick cost W-XRAY-4 exists to keep bounded. _tm_xrayStaged objects are left alone
    // here; renderAtTime's own showReal branch restores them explicitly, exactly once, on the tick
    // they actually resolve (or scrub behind their own reveal) — see the _tm_xrayStaged checks there.
    // §TM_CLOSE_RESTORE (2026-08-04): that per-tick skip must NOT apply when TM itself is being
    // switched off — deactivate()'s restoreVisibility() passes force=true so a still-staged (ghosted,
    // grey/0.3-opacity) element does not survive TM closing. Same "nothing may survive TM being
    // switched off" convention this file already applies to _gspClear/_tmXraySolidifyTs/etc.
    var keep = [];
    for (var i = 0; i < _highlightMeshes.length; i++) {
      var hm = _highlightMeshes[i];
      if (!force && hm._tm_xrayStaged) { keep.push(hm); continue; }
      hm._tm_xrayStaged = false;
      restoreMaterial(hm);
    }
    _highlightMeshes = keep;
    clearAllOutlines(); // §S260c: also remove wireframe outlines
  }

  // ── Day/night — smooth sky + lighting, no shadow plumbing ──
  var _savedClearColor = null;
  var _savedLighting = null;  // §S277b: save full lighting state on TM entry

  // Smooth color lerp between two hex colors
  function lerpColor(a, b, t) {
    var ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    var br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    var r = Math.round(ar + (br - ar) * t);
    var g = Math.round(ag + (bg - ag) * t);
    var bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
  }

  function applySunCycle(cursorMs) {
    if (!_sunCycle) return;
    var app = A();
    if (!app || !app.sun) return;

    // §S276b: Show Sky shader during sun cycle
    if (app._sky && !app._sky.visible) app._sky.visible = true;
    app._sunCycleActive = true;

    // §S277b: Save full lighting state once on TM entry — restore on exit
    if (_savedLighting === null) {
      _savedLighting = {
        clearColor: app.renderer ? app.renderer.getClearColor(_tmColor).getHex() : 0x1a1a2e,
        sunI: app.sun.intensity,
        ambI: app.ambient ? app.ambient.intensity : 0.785,
        hemiI: app.hemi ? app.hemi.intensity : 1.257,
        exposure: app.renderer ? app.renderer.toneMappingExposure : 0.45
      };
      console.log('§TM_SAVE_LIGHTING sunI=' + _savedLighting.sunI.toFixed(2) +
        ' ambI=' + _savedLighting.ambI.toFixed(2) + ' hemiI=' + _savedLighting.hemiI.toFixed(2) +
        ' exposure=' + _savedLighting.exposure.toFixed(2));
    }
    // Save original sky color once (legacy compat)
    if (_savedClearColor === null && app.renderer) {
      _savedClearColor = app.renderer.getClearColor(_tmColor).getHex();
    }

    var h = new Date(cursorMs).getHours();
    var m = new Date(cursorMs).getMinutes();
    var t = h + m / 60; // 0-24 fractional hour

    // Sun arc: smooth sine curve
    var angle = (t / 24) * Math.PI * 2 - Math.PI / 2;
    var elevation = Math.sin(angle); // -1 midnight, +1 noon
    var azimuth = Math.cos(angle);
    var dayFactor = Math.max(0, elevation); // 0 at night, 1 at noon

    // §S276b: Sun position moves every tick (shadows follow smoothly).
    // Sky shader visual update throttled to every 10th tick (avoids rapid sky flicker).
    var elDeg = elevation * 90;
    _lastElDeg = elDeg;  // §S277b: expose for adaptive TICK_MS
    var azDeg = (azimuth * 0.5 + 0.5) * 360;
    // Always move sun — shadows must track every tick
    var phi = (90 - elDeg) * Math.PI / 180;
    var theta = azDeg * Math.PI / 180;
    var sx = Math.sin(phi) * Math.cos(theta);
    var sy = Math.cos(phi);
    var sz = Math.sin(phi) * Math.sin(theta);
    // §S276b: Position sun relative to building center (not origin) for shadow coverage
    var _ctr = app.controls ? app.controls.target : { x: 0, y: 0, z: 0 };
    var _env = 300;
    var _bc = Object.values(app.buildingCentres || {})[0];
    if (_bc && _bc.envelope) _env = Math.ceil(_bc.envelope);
    app.sun.position.set(_ctr.x + sx * _env * 2, Math.max(sy * _env * 2, 10), _ctr.z + sz * _env * 2);
    app.sun.target.position.copy(_ctr);
    app.sun.target.updateMatrixWorld();
    app.sun.updateMatrixWorld();
    if (app.sun.shadow && app.sun.shadow.camera) {
      app.sun.shadow.camera.updateProjectionMatrix();
      app.sun.shadow.camera.updateMatrixWorld();
    }
    if (app.renderer && app.renderer.shadowMap) app.renderer.shadowMap.needsUpdate = true;
    // §S276b: Sky shader visual — update every tick near horizon (dawn/dusk fade),
    // throttle to every 5th tick during midday/midnight (less visual change).
    if (!applySunCycle._count) applySunCycle._count = 0;
    applySunCycle._count++;
    // §S276b: Sky transitions — Preetham for day/dusk/dawn, starfield for night.
    var _nearHorizon = Math.abs(elDeg) < 25;
    var _skyInterval = _nearHorizon ? 1 : 3;
    // §S276b: Sky always visible — Preetham goes dark naturally at low sun, no flash.
    if (app._sky && applySunCycle._count % _skyInterval === 0) {
      app._sky.visible = true;
      // Clamp sun slightly below horizon — Preetham darkens to deep blue/purple
      var _clampedSy = Math.max(sy, -0.08);
      app._sky.material.uniforms['sunPosition'].value.set(sx, _clampedSy, sz);
      // Richer dusk/dawn: boost turbidity + rayleigh near horizon
      app._sky.material.uniforms['turbidity'].value = elDeg < 10 ? 8 : 4;
      app._sky.material.uniforms['rayleigh'].value = elDeg < 10 ? 4 : 2;
    }
    // §S276b: Night starfield — appears when sun is well below horizon
    if (elDeg <= -15 && !app._nightStars) {
      var _starGeo = new THREE.BufferGeometry();
      var _starPos = new Float32Array(600 * 3);  // 600 stars
      for (var si = 0; si < 600; si++) {
        // Random positions on a large sphere
        var _sth = Math.random() * Math.PI * 2;
        var _sph = Math.acos(2 * Math.random() - 1);
        var _sr = 40000;
        _starPos[si * 3]     = _sr * Math.sin(_sph) * Math.cos(_sth);
        _starPos[si * 3 + 1] = Math.abs(_sr * Math.cos(_sph));  // upper hemisphere only
        _starPos[si * 3 + 2] = _sr * Math.sin(_sph) * Math.sin(_sth);
      }
      _starGeo.setAttribute('position', new THREE.BufferAttribute(_starPos, 3));
      var _starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 30, sizeAttenuation: true });
      app._nightStars = new THREE.Points(_starGeo, _starMat);
      app._nightStars.userData.isTmEffect = true;
      app.scene.add(app._nightStars);
      // Moon — simple bright sphere
      var _moonGeo = new THREE.SphereGeometry(200, 16, 16);
      var _moonMat = new THREE.MeshBasicMaterial({ color: 0xeeeedd });
      app._moon = new THREE.Mesh(_moonGeo, _moonMat);
      app._moon.position.set(15000, 25000, -10000);
      app._moon.userData.isTmEffect = true;
      app.scene.add(app._moon);
      // Dim ambient for moonlight feel
      console.log('§TM_NIGHT stars=600 moon=1');
    }
    if (elDeg > -10 && app._nightStars) {
      // Dawn — remove stars and moon
      app.scene.remove(app._nightStars);
      app._nightStars.geometry.dispose();
      app._nightStars.material.dispose();
      app._nightStars = null;
      if (app._moon) {
        app.scene.remove(app._moon);
        app._moon.geometry.dispose();
        app._moon.material.dispose();
        app._moon = null;
      }
      console.log('§TM_DAWN stars removed');
    }

    // Smooth lighting — intensity follows day/night
    app.sun.intensity = 0.05 + dayFactor * 4.4;
    if (app.ambient) app.ambient.intensity = 0.15 + dayFactor * 0.6;
    if (app.hemi) app.hemi.intensity = 0.1 + dayFactor * 1.1;
    // §S277c: Fog color follows sun cycle — dark at night, warm at dawn/dusk, light blue at day
    if (app.scene && app.scene.fog) {
      var fogT = Math.max(0, Math.min(1, (elDeg + 10) / 55));
      // Dawn/dusk: warm orange tint when near horizon
      var warmT = (Math.abs(elDeg) < 15) ? (1 - Math.abs(elDeg) / 15) * 0.3 : 0;
      app.scene.fog.color.setRGB(0.10 + fogT * 0.55 + warmT, 0.10 + fogT * 0.55, 0.18 + fogT * 0.50);
    }

    // §S277f: Lensflare — track sun position directly (don't call updateSky, it conflicts with TM sun)
    if (app._lensflare) {
      var _lfSunPos = app.sun.position;
      app._lensflare.position.copy(_lfSunPos);
      if (app._lensflare.userData._halo) app._lensflare.userData._halo.position.copy(_lfSunPos);
      var _lfSunDir = _tmV2.copy(_lfSunPos).sub(app.camera.position).normalize();
      app.camera.getWorldDirection(_tmV3);
      var _lfDot = _lfSunDir.dot(_tmV3);
      var _lfAbove = _lfSunPos.y > 50;
      var _lfShow = _lfAbove && _lfDot > 0.3 && dayFactor > 0.1;
      var _lfElev = Math.max(0, Math.min(1, _lfSunPos.y / (_env * 2)));
      var _lfI = _lfShow ? (1 - _lfElev * 0.6) * Math.max(0, (_lfDot - 0.3) / 0.7) : 0;
      app._lensflare.material.opacity = _lfI * 0.9;
      app._lensflare.visible = _lfI > 0.01;
      if (app._lensflare.userData._halo) {
        app._lensflare.userData._halo.material.opacity = _lfI * 0.4;
        app._lensflare.userData._halo.visible = app._lensflare.visible;
      }
    }

    // §S277b/§TM-NIGHT-TONE: Night floodlight — warm emissive on cached materials (not scene traverse).
    // _matCache has ~100-150 entries vs 122K scene objects. Zero freeze.
    // FIX (W-TM-NIGHT-TONE): was 0xffaa44@0.2 on ALL matCache → whole building self-lit brown,
    // burying moonlight and killing natural night. Now glow ONLY lit sources (fixtures/windows);
    // walls/floors stay dark. Soft peach 0xffe4b5 matches Night mode (tools.js toggleNightMode).
    // matCache key is 'rgba|IfcClass' — match class via key suffix, same as toggleNightMode.
    var _tmGlowClasses = ['IfcLightFixture', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcWindow'];
    if (elDeg <= -15 && !app._tmBloomActive) {
      app._tmBloomActive = true;
      var _bloomCount = 0, _bloomSkip = 0;
      var _mc = app._matCache || {};
      for (var _mk in _mc) {
        var _mm = _mc[_mk];
        if (!_mm || !_mm.emissive || _mm.userData._origEmissive !== undefined) continue;
        var _isLit = false;
        for (var _gi = 0; _gi < _tmGlowClasses.length; _gi++) {
          if (_mk.indexOf(_tmGlowClasses[_gi]) >= 0) { _isLit = true; break; }
        }
        if (!_isLit) { _bloomSkip++; continue; }   // surface material — stays dark
        _mm.userData._origEmissive = _mm.emissive.getHex();
        _mm.userData._origEmissiveI = _mm.emissiveIntensity || 0;
        _mm.emissive.setHex(0xffe4b5);    // soft peach, not brown 0xffaa44
        _mm.emissiveIntensity = 0.2;
        _mm.needsUpdate = true;
        _bloomCount++;
      }
      console.log('§TM_BLOOM_ON lit=' + _bloomCount + ' darkSurfaces=' + _bloomSkip + ' color=0xffe4b5');
    }
    if (elDeg > -10 && app._tmBloomActive) {
      var _mc2 = app._matCache || {};
      for (var _mk2 in _mc2) {
        var _mm2 = _mc2[_mk2];
        if (!_mm2 || _mm2.userData._origEmissive === undefined) continue;
        _mm2.emissive.setHex(_mm2.userData._origEmissive);
        _mm2.emissiveIntensity = _mm2.userData._origEmissiveI;
        delete _mm2.userData._origEmissive;
        delete _mm2.userData._origEmissiveI;
        _mm2.needsUpdate = true;
      }
      app._tmBloomActive = false;
      console.log('§TM_BLOOM_OFF');
    }
  }

  function restoreSky() {
    var app = A();
    if (!app) return;
    // §S277b: Full lighting restore — sun/ambient/hemi/exposure back to pre-TM values
    app._sunCycleActive = false;
    if (app._sky && !app._shadowOn) app._sky.visible = false;  // keep sky if shadows still on
    // §S277f: Hide lensflare
    if (app._lensflare) { app._lensflare.visible = false; if (app._lensflare.userData._halo) app._lensflare.userData._halo.visible = false; }
    // §S277b: Clear bloom emissive via matCache (not scene traverse — avoids 122K freeze)
    if (app._tmBloomActive) {
      var _rmc = app._matCache || {};
      for (var _rmk in _rmc) {
        var _rmm = _rmc[_rmk];
        if (!_rmm || _rmm.userData._origEmissive === undefined) continue;
        _rmm.emissive.setHex(_rmm.userData._origEmissive);
        _rmm.emissiveIntensity = _rmm.userData._origEmissiveI;
        delete _rmm.userData._origEmissive;
        delete _rmm.userData._origEmissiveI;
        _rmm.needsUpdate = true;
      }
      app._tmBloomActive = false;
    }
    if (app.updateSky) app.updateSky(45, 180);
    if (_savedLighting) {
      app.sun.intensity = _savedLighting.sunI;
      if (app.ambient) app.ambient.intensity = _savedLighting.ambI;
      if (app.hemi) app.hemi.intensity = _savedLighting.hemiI;
      if (app.renderer) {
        app.renderer.toneMappingExposure = _savedLighting.exposure;
        app.renderer.setClearColor(_savedLighting.clearColor);
      }
      console.log('§TM_RESTORE_LIGHTING sunI=' + _savedLighting.sunI.toFixed(2) +
        ' ambI=' + _savedLighting.ambI.toFixed(2) + ' hemiI=' + _savedLighting.hemiI.toFixed(2) +
        ' exposure=' + _savedLighting.exposure.toFixed(2));
      _savedLighting = null;
    } else if (app.renderer && _savedClearColor !== null) {
      app.renderer.setClearColor(_savedClearColor);
    }
    _savedClearColor = null;
    // §S277b: Remove night stars/moon if still present
    if (app._nightStars) {
      app.scene.remove(app._nightStars);
      app._nightStars.geometry.dispose();
      app._nightStars.material.dispose();
      app._nightStars = null;
    }
    if (app._moon) {
      app.scene.remove(app._moon);
      app._moon.geometry.dispose();
      app._moon.material.dispose();
      app._moon = null;
    }
  }

  function updateStatus() {
    var pbar = document.getElementById('tm-progress-bar');
    var range = _projectEnd - _projectStart;
    if (pbar && range > 0) pbar.style.width = Math.round((_cursor - _projectStart) / range * 100) + '%';

    // Count placed, collect readable active element names
    var placed = 0;
    var activeNames = [];
    for (var i = 0; i < _ops.length; i++) {
      if (_ops[i].start_ts > _cursor) break;
      placed++;
      if (_cursor < _ops[i].end_ts) {
        var p = _ops[i].parameters;
        // Prefer element name, fall back to IFC class stripped of "Ifc" prefix
        var nm = (p && p.name) || '';
        if (!nm && p && p.cls) nm = p.cls.replace(/^Ifc/, '');
        if (nm && activeNames.length < 3) activeNames.push(nm);
      }
    }

    var status = document.getElementById('tm-status');
    var label = document.getElementById('tm-label');
    var bigCounter = document.getElementById('tm-big-counter');
    var d = new Date(_cursor);
    if (label) label.textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    if (status) status.textContent = placed + ' placed | ' + (activeNames.join(', ') || 'idle');
    if (bigCounter) {
      var elapsedMs = _cursor - _projectStart;
      var totalDays = Math.floor(elapsedMs / 86400000);
      var remainHrs = Math.floor((elapsedMs % 86400000) / 3600000);
      bigCounter.textContent = 'DAY ' + totalDays + ' \u2502 HR ' + remainHrs;
    }
  }

  // ── Anchor from cursor ──
  function anchorFromCursor() {
    var d = new Date(_cursor);
    _anchorDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    _anchorHr = d.getHours();
  }

  // ── Tick size in ms based on mode ──
  function tickMs() {
    // §S277b: Smaller time steps during dawn/dusk — more frames in the golden hour
    var base;
    if (_mode === 'DAY') base = 3200000;       // ~53 min per tick
    else if (_mode === 'HR') base = 52000;     // 52 sec per tick
    else base = 9000;                          // 9 seconds per tick
    // §S277b: During twilight, shrink time step — more frames across the color transition
    // Widened zone: 30° above to 20° below horizon. Finest at horizon crossing.
    if (_sunCycle && _lastElDeg !== undefined) {
      var el = _lastElDeg;
      if (el > -20 && el < 30) {
        var dist = Math.abs(el);
        var range = el >= 0 ? 30 : 20;
        var t = 1 - dist / range;  // 1 at horizon, 0 at edge
        // Time step shrinks to 0.25x at horizon (4x more frames)
        var stepScale = 1 - 0.75 * t * t;
        base = Math.floor(base * stepScale);
      }
    }
    return base;
  }

  // ── Scene state save/restore ──
  var _savedInstanceState = {}; // meshId → { vis, matrices: { idx → Matrix4 } }
  var _savedBatchState = {};    // §S260b: meshId → { vis, slots: [bool, ...] }

  function saveVisibility() {
    _savedVisibility = [];
    _savedInstanceState = {};
    _savedBatchState = {};
    var app = A();
    if (!app || !app.scene) return;
    app.scene.traverse(function(obj) {
      if (obj.userData && obj.userData.guid) {
        _savedVisibility.push({ obj: obj, vis: obj.visible });
      }
      // §SE-7 (W-TM-DEDUPE-SAVE): Save InstancedMesh VISIBILITY only here — NOT matrices. The matrix
      // snapshot used to be cloned a SECOND time right here (one `new THREE.Matrix4()` + `.clone()` per
      // instance, ~29s of main-thread block on a 122K-element building — the "still hangs" report). It
      // was pure duplicate work: `renderAtTime()` (called unconditionally right after this, in
      // `_finishActivate`, and on every subsequent tick) already lazily builds `_savedInstanceMatrices`
      // — the SAME per-instance original matrices — as a side effect of rendering it has to do anyway.
      // `restoreVisibility()` now reads from that shared lazy cache instead of a redundant private copy.
      if (obj.isInstancedMesh && app._instanceMeta && app._instanceMeta[obj.id]) {
        _savedInstanceState[obj.id] = { vis: obj.visible, obj: obj };
      }
      // §S260b: Save BatchedMesh slot visibility
      if (obj.isBatchedMesh && app._batchMeta && app._batchMeta[obj.id]) {
        var bmetas = app._batchMeta[obj.id];
        var slots = [];
        for (var si = 0; si < bmetas.length; si++) {
          slots.push(obj.getVisibleAt ? obj.getVisibleAt(bmetas[si].slotId) : true);
        }
        _savedBatchState[obj.id] = { vis: obj.visible, slots: slots, obj: obj };
      }
    });
  }

  function restoreVisibility(force) {
    clearHighlight(force);
    var app = A();
    // §SE-7: matrices come from `_savedInstanceMatrices` (renderAtTime's lazy per-tick cache), not a
    // private clone saveVisibility() no longer makes. `activate()` always calls `renderAtTime()` at
    // least once before any `deactivate()` can run (§S260c "initial render" call in `_finishActivate`),
    // so every InstancedMesh this loop iterates (i.e. every one `saveVisibility()` saw) is guaranteed to
    // already have an entry here. A mesh with no entry (should not happen per the above) is left as-is —
    // correct either way, since renderAtTime never touched/mutated its matrix in that case.
    for (var meshId in _savedInstanceState) {
      var state = _savedInstanceState[meshId];
      var obj = state.obj;
      var mats = _savedInstanceMatrices[meshId];
      if (mats) {
        for (var idx in mats) {
          obj.setMatrixAt(parseInt(idx), mats[idx]);
        }
        obj.instanceMatrix.needsUpdate = true;
      }
      obj.visible = state.vis;
    }
    _savedInstanceState = {};
    _savedInstanceMatrices = {};
    // §S260b: Restore BatchedMesh slot visibility
    for (var bmId in _savedBatchState) {
      var bs = _savedBatchState[bmId];
      var bmetas = app._batchMeta && app._batchMeta[bmId];
      if (bmetas) {
        for (var si = 0; si < bmetas.length; si++) {
          bs.obj.setVisibleAt(bmetas[si].slotId, bs.slots[si] !== false);
        }
      }
      bs.obj.visible = bs.vis;
    }
    _savedBatchState = {};
    // Restore single mesh visibility — shadow flags return to Sunglass state
    _savedVisibility.forEach(function(s) {
      s.obj.visible = s.vis;
    });
    _savedVisibility = [];
    // §S260b: Restore shadow flags to Sunglass state (not blindly clear)
    var app = A();
    if (app && app.scene) {
      var shOn = !!app._shadowOn;
      app.scene.traverse(function(obj) {
        if (obj.isMesh || obj.isInstancedMesh || obj.isBatchedMesh) {
          obj.castShadow = shOn; obj.receiveShadow = shOn;
        }
      });
      if (app.renderer) app.renderer.shadowMap.needsUpdate = true;
    }
    if (app && app.markDirty) app.markDirty();
  }

  // ── UI ──
  function buildPanel() {
    _panel = document.createElement('div');
    _panel.id = 'time-machine-panel';
    _panel.style.cssText =
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:250;' +
      'display:none;flex-direction:column;align-items:center;gap:6px;padding:10px 16px;' +
      'background:rgba(20,20,40,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(79,195,247,0.3);border-radius:12px;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.5);color:#e0e0e0;font-family:sans-serif;' +
      'width:376px;user-select:none;touch-action:none;';

    _panel.innerHTML =
      '<div style="display:flex;align-items:center;width:100%;cursor:grab" class="tm-drag">' +
        '<button id="tm-sun" style="font-size:14px;padding:4px 8px;min-width:32px;min-height:32px" title="Day/night cycle"><span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:linear-gradient(90deg,#fff 50%,#222 50%);vertical-align:middle"></span></button>' +
        '<button id="tm-eye" style="padding:2px 6px;min-width:36px;min-height:36px;background:#888" title="Drone Pilot — cinematic camera"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2"/><circle cx="12" cy="12" r="3"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M12 2v4"/><path d="M12 18v4"/></svg></button>' +
        '<button id="tm-gantt" style="font-size:12px;padding:2px 6px" title="Gantt chart">&#x1F4CA;</button>' +
        // §GANTT_EDIT DEP (user ruling 2026-08-04): the ✎ Author-4D side-panel button is REMOVED —
        // the Gantt drawer itself is now the editable surface (drag to move, edge-pull to resize,
        // both constraint-aware). §TM_P6_FOLD (2026-08-24): the "later pass" that old comment
        // promised for the ↗ Editor tab happened — the tab's editing surface (WBS outline,
        // dependency editor, drag-Gantt, ▶ CPM, zoom) was fully redundant with the drawer's direct
        // editing (§GANTT_EDIT/§GANTT_PROPS) + auto-CPM-annotate (§S68), so schedule_editor.html /
        // schedule_editor_ui.js are DELETED. The tab's one non-redundant surface — P6/MS Project
        // import/export + Diff-vs-Model — is folded into the #tm-p6-box section below, and #tm-editor
        // is repurposed as its toggle.
        '<button id="tm-whatif" style="font-size:12px;padding:2px 6px" title="What-if: slip a phase, watch the chain re-fold in blue">&#9094;</button>' +
        '<button id="tm-editor" style="font-size:11px;padding:2px 6px" title="P6 / MS Project interop — import a Primavera .xer/.xml or MS Project XML programme onto this model, export MSPDI/PMXML/XER, or grade an imported schedule against the model to see its own quantity + rate estimate">&#8644; P6/MSP</button>' +
        '<button id="tm-dash" style="font-size:12px;padding:2px 6px" title="Dashboard">&#x1F4CB;</button>' +
        '<button id="tm-var" style="font-size:13px;padding:2px 6px;display:none" title="Budget vs Actual variance">&#x2696;</button>' +
        '<button id="tm-lod" style="padding:2px 6px;min-width:32px;min-height:32px;display:none" title="Draw-cost proxy: box the already-built elements outside camera view (large buildings only). OFF = today\'s rendering, unchanged."><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></button>' +
        '<span id="tm-big-counter" style="flex:1;font-size:18px;font-weight:bold;color:#4fc3f7;text-align:center;letter-spacing:1px">DAY 0 | HR 0</span>' +
        '<button id="tm-close" style="width:22px;height:22px;font-size:12px;padding:0;line-height:1" title="Close">&#x2715;</button>' +
      '</div>' +
      '<div id="tm-status" style="width:100%;text-align:center;font-size:13px;color:#ccc;padding:2px 0;min-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        '4D Construction Playback</div>' +
      '<div style="display:flex;gap:4px;align-items:center;width:100%">' +
        '<span id="tm-label" style="color:#4fc3f7;font-weight:bold;font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">—</span>' +
        '<div style="display:flex;gap:3px">' +
          '<button class="tm-mode" data-mode="DAY">DAY</button>' +
          '<button class="tm-mode" data-mode="HR">HR</button>' +
          '<button class="tm-mode" data-mode="MIN">MIN</button>' +
        '</div>' +
      '</div>' +
      '<input id="tm-slider" type="range" min="0" max="100" value="50" style="width:100%;accent-color:#4fc3f7">' +
      '<div id="tm-progress" style="width:100%;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">' +
        '<div id="tm-progress-bar" style="height:100%;width:100%;background:#4fc3f7;transition:width 0.2s"></div>' +
      '</div>' +
      '<div style="display:flex;gap:3px;width:100%;height:30px">' +
        '<button id="tm-start-btn" style="width:30px;font-size:14px" title="Jump to start">&#x25C0;&#x25C0;</button>' +
        '<button id="tm-rev-btn" style="width:30px;font-size:14px" title="Deconstruct">&#x25C0;</button>' +
        '<button id="tm-stop-btn" style="width:30px;font-size:14px" title="Stop">&#x25A0;</button>' +
        '<button id="tm-fwd-btn" style="width:30px;font-size:14px" title="Build">&#x25B6;</button>' +
        '<button id="tm-end-btn" style="width:30px;font-size:14px" title="Jump to end">&#x25B6;&#x25B6;</button>' +
        '<button id="tm-undo" style="flex:1;font-size:9px" title="Undo the last Gantt drag/resize">&#x21BA; Undo edit</button>' +
        '<button id="tm-baseline" style="flex:1;font-size:9px" title="Snapshot current dates as the baseline for schedule variance">&#x2691; Set Baseline</button>' +
        '<button id="tm-reschedule-asap" style="flex:1;font-size:9px" title="Pull every task back to the earliest start its predecessors allow (compression only — never moves a task later)">&#x23EA; Pull Back</button>' +
      '</div>' +
      '<div id="tm-gantt-box" class="tm-drawer-bottom">' +
        // §GANTT_PALETTE 2026-08-04: phase legend strip removed — the hover tooltip already reports
        // storey, phase, element count, day range and source, so the legend was pure duplication.
        // §GANTT_RULER (E5) + §GANTT_RESIZE (E6), 2026-08-04. The drawer had NO time axis at all —
        // the only temporal reference was the cursor hairline, so a bar's absolute dates were only
        // discoverable by hovering it. position:sticky keeps the header pinned while the bar rows
        // scroll underneath, so the axis is always on screen. The grip above it drags the drawer
        // taller than the CSS 220px cap (a 22-storey building renders ~130 bars into that box).
        '<div id="tm-gantt-head" style="position:sticky;top:0;z-index:3;background:#12161c">' +
          '<div id="tm-gantt-grip" style="height:7px;cursor:ns-resize;background:rgba(79,195,247,0.18);' +
            'border-bottom:1px solid rgba(79,195,247,0.25)" title="Drag to resize the Gantt drawer"></div>' +
          // §GANTT_EDIT_LOCK (user ruling 2026-08-05, supersedes §GANTT_AUTHOR_ENTRY's button): no
          // button opens a side panel any more, native or otherwise — the drawer materializes its own
          // schedule automatically (see drawGanttMini's auto-generate call) the first time it has
          // nothing to show, same native ScheduleAuthor.materializeZones/materializeDefault path,
          // still guarded against clobbering a real imported schedule. What the user DOES need a
          // manual control for is whether the bars are draggable right now — that's this lock toggle,
          // not a generate trigger.
          '<div id="tm-gantt-lockbar" style="display:flex;align-items:center;gap:6px;padding:3px 6px;' +
            'font-size:10px;color:#8a97a5;border-bottom:1px solid rgba(79,195,247,0.15)">' +
            '<button id="tm-gantt-editlock" style="font-size:10px;padding:1px 6px" ' +
            'title="Locked: drag/resize/link disabled, timeline still scrubs live. Click to unlock editing.">' +
            '&#x1F512; Locked</button><span id="tm-gantt-lockmsg" style="flex:1"></span>' +
            // §S75 — the legend for the float rail. The swatches are drawn as thin bars, the same
            // shape as the rail itself, so the mapping reads without a caption. Counts come from the
            // SAME annotate pass that paints the bars (never a second computation), and the whole
            // strip is emptied when CPM could not run rather than showing a stale or invented zero.
            '<span id="tm-gantt-cpmlegend" style="white-space:nowrap;color:#8a97a5"></span></div>' +
          '<canvas id="tm-gantt-ruler" style="width:100%;height:18px;display:block;cursor:ew-resize" ' +
            'title="Drag to shift the whole project\'s start/finish (Editing must be unlocked)"></canvas>' +
        '</div>' +
        '<div style="position:relative">' +
          '<canvas id="tm-gantt-canvas" style="width:100%;cursor:pointer"></canvas>' +
          '<div id="tm-gantt-hair" style="position:absolute;top:0;width:2px;height:100%;background:#ff8c00;pointer-events:none;z-index:1;display:none"></div>' +
          '<div id="tm-gantt-marquee" style="position:absolute;border:1px dashed #4fc3f7;' +
            'background:rgba(79,195,247,0.12);pointer-events:none;z-index:1;display:none"></div>' +
          '<div id="tm-gantt-tip" style="position:absolute;top:4px;left:0;background:rgba(20,20,40,0.92);color:#ff8c00;font-size:10px;padding:3px 8px;border-radius:3px;border:1px solid rgba(255,140,0,0.3);pointer-events:none;z-index:2;display:none;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis"></div>' +
        '</div>' +
      '</div>' +
      '<div id="tm-var-box" class="tm-drawer-bottom">' +
        '<div id="tm-var-head" style="padding:4px 6px 2px;font-size:11px;color:#e0e0e0;line-height:1.5"></div>' +
        '<canvas id="tm-var-canvas" style="width:100%;cursor:default"></canvas>' +
        '<div id="tm-var-list" style="padding:2px 6px 4px;font-size:10px;color:#ccc"></div>' +
      '</div>' +
      // §TM_P6_FOLD — P6/MS Project interop + Diff-vs-Model, folded in from the retired Schedule
      // Editor tab (2026-08-24). Collapsed by default (.tm-drawer-bottom max-height:0); #tm-editor
      // toggles it and lazy-loads foreign_schedule.js + schedule_diff.js on first open.
      '<div id="tm-p6-box" class="tm-drawer-bottom">' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:6px 6px 2px">' +
          '<span style="font-size:9px;color:#8a97a5;text-transform:uppercase;letter-spacing:.06em">Import</span>' +
          '<button id="tm-p6-import" style="font-size:10px" title="Import a Primavera P6 programme (.xer or .xml/PMXML) or MS Project XML (MSPDI) — adopt its WBS, logic and dates onto this model. Binding tasks to elements stays a separate, reviewable step.">&#8681; P6/MSP file</button>' +
          '<input id="tm-p6-file" type="file" accept=".xer,.xml" style="display:none">' +
          '<label style="font-size:10px;color:#8a97a5" title="If activity names carry a BIM-Bind token (@discipline:IfcClass[:storey]), resolve it against this model and pre-bind tasks to elements on import — a reviewable first pass, not a guess."><input id="tm-p6-autobind" type="checkbox" checked> auto-bind</label>' +
          '<span style="width:1px;height:14px;background:rgba(79,195,247,0.25);margin:0 2px"></span>' +
          '<span style="font-size:9px;color:#8a97a5;text-transform:uppercase;letter-spacing:.06em">Export</span>' +
          '<button id="tm-p6-export-msp" style="font-size:10px" title="Export the current schedule (WBS, dates, dependencies) as MS Project XML (MSPDI) — opens directly in Microsoft Project; re-imports here too.">&#8679; MSP</button>' +
          '<button id="tm-p6-export-pmxml" style="font-size:10px" title="Export as Primavera P6 PMXML (APIBusinessObjects XML) — the format every documented P6 export path uses; re-imports here too. Some fields (WBS code, EPS-level activity codes, resource assignments, global calendars, baselines) are not carried — P6 itself drops most of these on cross-DB import.">&#8679; PMXML</button>' +
          '<button id="tm-p6-export-xer" style="font-size:10px" title="Export as Primavera XER — the older tab-delimited P6 interchange, for P6 installs that still prefer it over PMXML. Same known-lossy fields as PMXML.">&#8679; XER</button>' +
          '<span style="width:1px;height:14px;background:rgba(79,195,247,0.25);margin:0 2px"></span>' +
          '<button id="tm-p6-diff" style="font-size:10px" title="4D Schedule Diff — grade an IMPORTED P6/MSP schedule per-phase against the model. It compares their durations to our own real-quantity + labor-rate estimate (import a file first)">&#9878; Diff vs Model</button>' +
        '</div>' +
        '<div id="tm-p6-out" style="padding:2px 8px 6px;font-size:10px;color:#9fb0c6;line-height:1.5;max-height:64px;overflow-y:auto"></div>' +
      '</div>' +
      '<div id="tm-dash-col" class="tm-drawer-right">' +
        '<div style="display:flex;gap:8px;justify-content:center;margin-bottom:8px">' +
          '<canvas id="tm-dash-time-pie" width="120" height="120" style="width:110px;height:110px"></canvas>' +
          '<canvas id="tm-dash-cost-pie" width="120" height="120" style="width:110px;height:110px"></canvas>' +
        '</div>' +
        '<div style="font-size:11px;color:#4fc3f7;font-weight:bold;margin-bottom:4px">Phase Progress</div>' +
        '<div id="tm-dash-phases"></div>' +
        '<div style="font-size:11px;color:#4fc3f7;font-weight:bold;margin:8px 0 4px">Site Resources</div>' +
        '<div id="tm-dash-crews"></div>' +
        '<div style="font-size:11px;color:#4fc3f7;font-weight:bold;margin:8px 0 4px">S-Curve</div>' +
        '<canvas id="tm-dash-scurve" width="200" height="60" style="width:100%;height:60px"></canvas>' +
        '<div id="tm-dash-daycnt" style="font-size:10px;color:#999;margin-top:2px;text-align:center"></div>' +
      '</div>' +
      // §TM_PANEL_RESIZE (2026-08-05, user ruling: "panel borders supposed to be draggable so we
      // can see more"). The whole drawer was hardcoded 376px with a resize handle for the internal
      // Gantt box's HEIGHT (tm-gantt-grip) but nothing for the drawer's own WIDTH — exactly what the
      // screenshot showed: the props panel overlapping the storey labels and ruler with nowhere to
      // grow into. `_panel` is centered via left:50%/translateX(-50%), so a single edge handle grows
      // the box symmetrically for free — no left-edge math needed.
      '<div id="tm-panel-resize-grip" title="Drag to resize the drawer" style="position:absolute;' +
        'top:0;right:-3px;bottom:0;width:8px;cursor:ew-resize;z-index:6"></div>' +
      // §TM_PANEL_RESIZE_H (2026-08-05, user: "make the lower border pullable expandable too, not
      // just the right border") — same edge-grip pattern as the width handle above, mirrored onto
      // the panel's bottom edge so both resizable dimensions are reachable the same way.
      '<div id="tm-panel-resize-grip-b" title="Drag to resize the drawer" style="position:absolute;' +
        'left:0;right:0;bottom:-3px;height:8px;cursor:ns-resize;z-index:6"></div>';
    document.body.appendChild(_panel);
    wirePanelResize();
    wirePanelResizeHeight();

    var style = document.createElement('style');
    style.textContent =
      '#time-machine-panel{transition:width 200ms ease-out}' +
      '#time-machine-panel.tm-panel-resizing{transition:none}' +
      '#tm-panel-resize-grip:hover,#tm-panel-resize-grip.tm-gripping{background:rgba(79,195,247,0.35)}' +
      '#tm-panel-resize-grip-b:hover,#tm-panel-resize-grip-b.tm-gripping{background:rgba(79,195,247,0.35)}' +
      '#time-machine-panel button{background:rgba(255,255,255,0.1);color:#e0e0e0;border:1px solid rgba(79,195,247,0.3);' +
      'border-radius:4px;padding:4px 4px;cursor:pointer;font-size:10px}' +
      '#time-machine-panel button:hover{background:rgba(79,195,247,0.2)}' +
      '#time-machine-panel button.tm-active{background:#1a6b8a;color:#fff}' +
      '#tm-eye.tm-active{background:#fff !important}' +
      '.tm-drawer-bottom{max-height:0;overflow:hidden;transition:max-height 200ms ease-out;' +
      'width:100%;margin-top:4px;border-top:1px solid rgba(79,195,247,0.2)}' +
      '.tm-drawer-bottom.open{max-height:220px;overflow-y:auto}' +
      '.tm-drawer-right{width:0;overflow:hidden;transition:width 200ms ease-out,opacity 150ms;opacity:0;' +
      'position:absolute;left:100%;top:0;padding:0;pointer-events:none;' +
      'background:rgba(20,20,40,0.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(79,195,247,0.3);border-left:none;border-radius:0 12px 12px 0;' +
      'max-height:80vh;overflow-y:auto}' +
      '.tm-drawer-right.open{width:260px;opacity:1;padding:10px;pointer-events:auto}' +
      '@media(max-width:600px){#time-machine-panel{width:92vw;bottom:60px}' +
      '.tm-drawer-right{left:auto;top:100%;border-radius:0 0 12px 12px;border-left:1px solid rgba(79,195,247,0.3);border-top:none}' +
      '.tm-drawer-right.open{width:100%;max-height:200px}}';
    document.head.appendChild(style);

    makeDraggable(_panel);

    // Mode buttons
    _panel.querySelectorAll('.tm-mode').forEach(function(btn) {
      btn.addEventListener('pointerup', function(e) {
        e.stopPropagation(); switchMode(btn.dataset.mode);
      });
    });

    document.getElementById('tm-slider').addEventListener('input', onSlide);

    // §AUTHOR-1: the 4D-schedule authoring wizard + what-if are TM-owned (launched from this surface).
    var _author = document.getElementById('tm-author');
    if (_author) _author.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      if (window.ScheduleAuthorUI) window.ScheduleAuthorUI.toggle();
      else if (typeof window.openScheduleAuthorWizard === 'function') window.openScheduleAuthorWizard();
      else { var s = document.getElementById('tm-status'); if (s) s.textContent = 'Author engine not loaded'; }
    });
    var _whatif = document.getElementById('tm-whatif');
    if (_whatif) _whatif.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      if (window.WhatIfPanel) window.WhatIfPanel.open();
      else { var s = document.getElementById('tm-status'); if (s) s.textContent = 'What-if engine not loaded'; }
    });
    // §TM_P6_FOLD — repurposed #tm-editor: no longer opens a tab; toggles the in-panel P6/MSP
    // interop section (import/export/diff). Editing lives in the drawer itself (§GANTT_EDIT +
    // §S68 auto-CPM); the interop engines lazy-load on first open, so Alt+C and plain viewer
    // boot pay nothing for this section.
    var _editor = document.getElementById('tm-editor');
    if (_editor) _editor.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      toggleP6Drawer();
    });
    wireP6Controls();

    // Transport buttons
    document.getElementById('tm-start-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); stopPlayback(); renderAtTime(_projectStart); anchorFromCursor(); configSlider();
    });
    document.getElementById('tm-end-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); stopPlayback(); renderAtTime(_projectEnd); anchorFromCursor(); configSlider();
    });
    document.getElementById('tm-rev-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); startPlayback(-1);
    });
    document.getElementById('tm-fwd-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); startPlayback(+1);
    });
    document.getElementById('tm-stop-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); stopPlayback();
    });

    document.getElementById('tm-undo').addEventListener('pointerup', function(e) {
      e.stopPropagation(); undoLastGanttEdit();
    });
    document.getElementById('tm-baseline').addEventListener('pointerup', function(e) {
      e.stopPropagation(); setGanttBaseline();
    });
    document.getElementById('tm-reschedule-asap').addEventListener('pointerup', function(e) {
      e.stopPropagation(); rescheduleGanttAsap();
    });
    document.getElementById('tm-sun').addEventListener('pointerup', function(e) {
      e.stopPropagation();
      var app = A();
      if (!app) return;
      _sunCycle = !_sunCycle;
      var btn = document.getElementById('tm-sun');
      if (btn) btn.classList.toggle('tm-active', _sunCycle);
      if (_sunCycle) {
        applySunCycle(_cursor);
      } else {
        // §S277b: Sun toggle off — restore lighting but keep _savedLighting for re-toggle
        app._sunCycleActive = false;
        if (app._sky && !app._shadowOn) app._sky.visible = false;
        if (app._lensflare) { app._lensflare.visible = false; if (app._lensflare.userData._halo) app._lensflare.userData._halo.visible = false; }
        if (app.updateSky) app.updateSky(45, 180);
        if (_savedLighting) {
          app.sun.intensity = _savedLighting.sunI;
          if (app.ambient) app.ambient.intensity = _savedLighting.ambI;
          if (app.hemi) app.hemi.intensity = _savedLighting.hemiI;
          if (app.renderer) {
            app.renderer.toneMappingExposure = _savedLighting.exposure;
            app.renderer.setClearColor(_savedLighting.clearColor);
          }
        }
        _savedClearColor = null;
      }
      if (app.renderer && app.scene && app.camera) app.renderer.render(app.scene, app.camera);
    });
    var _lodBtn = document.getElementById('tm-lod');
    if (_lodBtn) _lodBtn.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      _dlodProxyOn = !_dlodProxyOn;
      _lodBtn.classList.toggle('tm-active', _dlodProxyOn);
      console.log('§DLOD_TM_TOGGLE on=' + _dlodProxyOn + ' large=' + _isLargeBuilding + ' streaming=' + !!A().streaming);
      // §4: user-paced edge — force the FULL traverse path (not §PERF_INCR delta, which would skip
      // nearly every mesh at a zero-span re-render and leave the toggle visually unapplied).
      window.__forceFull = true;
      renderAtTime(_cursor);
      if (A().renderer && A().scene && A().camera) A().renderer.render(A().scene, A().camera);
    });
    document.getElementById('tm-eye').addEventListener('pointerup', function(e) {
      e.stopPropagation();
      _camFollow = !_camFollow;
      _camAngle = 0;
      var btn = document.getElementById('tm-eye');
      if (btn) btn.classList.toggle('tm-active', _camFollow);

      if (_camFollow) {
        // §S260c: Compute storyboard — show status while preparing
        viewerStatus('🚁 Pilot Drone processing...');
        _cineBeat = 'closeup';
        _cineTick = 0;
        _cineSceneIdx = 0;
        _cineCloseupCount = 0;
        _cineSeenZones = {};

        // §S260c: Check IDB for cached Movie Script, else compute fresh
        cacheGet('movie').then(function(cachedScript) {
          // §S260d: Invalidate old cache — check for _arcV marker (S260d storyboard format)
          var cacheValid = cachedScript && cachedScript.length > 0 && cachedScript[0]._arcV === 4;
          if (cacheValid) {
            // Reconstruct Vector3 objects from plain {x,y,z}
            for (var si = 0; si < cachedScript.length; si++) {
              var s = cachedScript[si];
              s.center = new THREE.Vector3(s.center.x, s.center.y, s.center.z);
              if (s.chain) {
                for (var ci = 0; ci < s.chain.length; ci++) {
                  s.chain[ci] = new THREE.Vector3(s.chain[ci].x, s.chain[ci].y, s.chain[ci].z);
                }
              }
            }
            _cineStoryboard = cachedScript;
            console.log('§MOVIE_CACHE_HIT scenes=' + _cineStoryboard.length);
          } else {
            var posMap = buildGuidPosMap();
            _cineStoryboard = computeStoryboard(_ops, posMap);
            // §S260d: Don't cache here — background builder caches full storyboard when done
            if (_cineStoryboard.length && !_bgBuildRaf) {
              cachePut('movie', _cineStoryboard);
              console.log('§MOVIE_CACHE_SAVE scenes=' + _cineStoryboard.length);
            }
          }

          if (_cineStoryboard.length) {
            _cineNextTarget = _cineStoryboard[0].center;
            _camTarget = _cineStoryboard[0].center.clone();
            // §S260c v2: Don't auto-play — let user press ▶ when ready
            viewerStatus('🚁 ' + _cineStoryboard.length + ' scenes ready — press ▶ to play');
            console.log('§CINE_READY scenes=' + _cineStoryboard.length + ' — awaiting user Play');
          } else {
            viewerStatus('🚁 No scenes found — load a building first');
          }
        }).catch(function(e) {
          console.warn('§MOVIE_CACHE_ERR ' + (e && e.message));
          var posMap = buildGuidPosMap();
          _cineStoryboard = computeStoryboard(_ops, posMap);
          if (_cineStoryboard.length) {
            _cineNextTarget = _cineStoryboard[0].center;
            _camTarget = _cineStoryboard[0].center.clone();
            viewerStatus('🚁 ' + _cineStoryboard.length + ' scenes ready — press ▶ to play');
          }
        });
      } else {
        _cineStoryboard = [];
        if (_bgBuildRaf) { cancelAnimationFrame(_bgBuildRaf); _bgBuildRaf = 0; }
        restorePeeled();
        _cineHeroSlowdown = false;
        _cineEstabStart = null; _cineEstabEnd = null;
        stopPlayback();
        viewerStatus('');
      }

      // Hook orbit controls — detect manual interaction to pause auto-rotation
      var app = A();
      if (app && app.renderer && app.renderer.domElement) {
        app.renderer.domElement.addEventListener('pointerdown', function() {
          _camUserInteracted = performance.now();
        });
      }
    });
    document.getElementById('tm-gantt').addEventListener('pointerup', function(e) {
      e.stopPropagation();
      _ganttVisible = !_ganttVisible;
      // Mobile: only one drawer at a time
      if (_ganttVisible && window.innerWidth < 600 && _dashVisible) {
        _dashVisible = false;
        toggleDashDOM(false);
      }
      var btn = document.getElementById('tm-gantt');
      if (btn) btn.classList.toggle('tm-active', _ganttVisible);
      var box = document.getElementById('tm-gantt-box');
      if (box) box.classList.toggle('open', _ganttVisible);
      // §GANTT_AUTHOR_REPROBE (2/2, found in a real browser 2026-08-04): re-probing inside
      // buildTaskIndex() was not enough on its own — buildGanttTasks() is gated on _ganttDirty, and
      // authoring a schedule does not set it, so the re-probe never ran and freshly authored bars
      // stayed non-editable. PROVEN live: materializeZones returned ok:true with 18 zones while the
      // drawer still showed the "not editable" banner. Opening the drawer is exactly the moment the
      // user expects it to reflect reality, so mark it dirty here.
      if (_ganttVisible) { _ganttDirty = true; drawGanttMini(); }
    });
    document.getElementById('tm-dash').addEventListener('pointerup', function(e) {
      e.stopPropagation();
      _dashVisible = !_dashVisible;
      // Mobile: only one drawer at a time
      if (_dashVisible && window.innerWidth < 600 && _ganttVisible) {
        _ganttVisible = false;
        var gb = document.getElementById('tm-gantt-box');
        if (gb) gb.classList.remove('open');
        var gbtn = document.getElementById('tm-gantt');
        if (gbtn) gbtn.classList.remove('tm-active');
      }
      toggleDashDOM(_dashVisible);
      if (_dashVisible) drawDashboard();
    });
    document.getElementById('tm-var').addEventListener('pointerup', function(e) {
      e.stopPropagation();
      _varVisible = !_varVisible;
      // Mobile: only one bottom drawer at a time (mirror the gantt/dash rule)
      if (_varVisible && window.innerWidth < 600 && _ganttVisible) {
        _ganttVisible = false;
        var gb2 = document.getElementById('tm-gantt-box'); if (gb2) gb2.classList.remove('open');
        var gbt2 = document.getElementById('tm-gantt'); if (gbt2) gbt2.classList.remove('tm-active');
      }
      var vbtn = document.getElementById('tm-var');
      if (vbtn) vbtn.classList.toggle('tm-active', _varVisible);
      var vbox = document.getElementById('tm-var-box');
      if (vbox) vbox.classList.toggle('open', _varVisible);
      if (_varVisible) drawVariance();
    });
    // §S1 — tap a phase row in the variance drawer to jump the cursor to that phase's window (reciprocal of
    // the hairline: the scrub moves the highlight, a tap moves the cursor). Maps click-Y → phase row.
    document.getElementById('tm-var-canvas').addEventListener('pointerup', function (e) {
      if (!_active || !_ops.length || !_twin) return;
      var V = _computeVariance();
      if (!V || !V.phases.length) return;
      var rect = e.target.getBoundingClientRect();
      var barH = 9, gap = 5, rowH = barH + gap;
      var ti = Math.floor((e.clientY - rect.top - 4) / rowH);
      if (ti < 0 || ti >= V.phases.length) return;
      var p = V.phases[ti];
      renderAtTime(p.winStart);
      anchorFromCursor();
      configSlider();
      console.log('§TM_VARIANCE_JUMP phase="' + p.phase + '" cursor=' + Math.round(_cursor) + ' committed=' + p.aCost);
    });
    // ── §GANTT_DRAG (E1/E2 UI half) — pointerdown starts a bar drag, pointerup either commits the
    // edit or falls through to the original seek. Registered BEFORE the seek handler so _dragMoved
    // is already set by the time that one runs.
    wireGanttDrag();
    document.getElementById('tm-gantt-canvas').addEventListener('pointerup', function(e) {
      if (!_active || !_ops.length) return;
      if (_dragConsumed) { _dragConsumed = false; return; }   // this pointerup finished an edit, not a seek
      var rect = e.target.getBoundingClientRect();
      var x = (e.clientX - rect.left - 60) / (rect.width - 60);  // account for storey label margin
      if (x < 0) x = 0;
      var pct = Math.min(1, Math.max(0, x));
      // §GANTT_AXIS_OUTLIER: invert against the SAME qualified axis the bars/ruler are drawn against.
      var ts = _ganttAxisStart + pct * Math.max(1, _ganttAxisEnd - _ganttAxisStart);
      var bar = findBarAtClick(e);
      renderAtTime(ts);
      anchorFromCursor();
      configSlider();
      if (bar) console.log('§GANTT_MINI_SEEK ts=' + Math.round(ts) + ' bar="' + bar.storey + '|' + bar.phase + '"');
    });
    // Hover tooltip for gantt bars
    document.getElementById('tm-gantt-canvas').addEventListener('pointermove', function(e) {
      var tip = document.getElementById('tm-gantt-tip');
      if (!tip || !_ganttTasks.length) return;
      var bar = findBarAtClick(e);
      if (bar) {
        var dayStart = Math.round((bar.startTs - _projectStart) / 86400000);
        var dayEnd = Math.round((bar.endTs - _projectStart) / 86400000);
        // \u00a7gate: source label so you can tell preset IFC 4D from generated fallback
        var src = (bar.cap === bar.count) ? 'IFC 4D' : (bar.cap > 0 ? (bar.cap + '/' + bar.count + ' IFC 4D') : 'generated');
        tip.textContent = bar.storey + ' \u2014 ' + bar.phase + ' (' + bar.count + ' el, Day ' + dayStart + '\u2013' + dayEnd + ', ' + src + ')';
        tip.style.left = Math.max(0, Math.min(e.offsetX + 8, e.target.clientWidth - 200)) + 'px';
        // \u00a7gate: follow the pointer/touch Y so the tip stays visible when the Gantt is scrolled
        // (was pinned at top:4px \u2192 off-screen once scrolled down). Just above the tip; flip below near the top.
        var ty = e.offsetY - 22; if (ty < 2) ty = e.offsetY + 16;
        tip.style.top = ty + 'px';
        tip.style.display = 'block';
      } else {
        tip.style.display = 'none';
      }
    });
    document.getElementById('tm-gantt-canvas').addEventListener('pointerleave', function() {
      var tip = document.getElementById('tm-gantt-tip');
      if (tip) tip.style.display = 'none';
    });
    document.getElementById('tm-close').addEventListener('pointerup', function(e) {
      e.stopPropagation(); deactivate();
    });
  }

  // ── Draggable (measure.js pattern + mobile) ──
  function makeDraggable(el) {
    var ox, oy, sx, sy, dragging = false;
    var dragStrip = (window._isMobile) ? 50 : 30;
    if (window._isMobile) {
      el.addEventListener('touchstart', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        var rect = el.getBoundingClientRect();
        var t = e.touches[0];
        if (t.clientY - rect.top <= dragStrip) e.preventDefault();
      }, { passive: false });
    }
    el.addEventListener('pointerdown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      var rect = el.getBoundingClientRect();
      if (e.clientY - rect.top > dragStrip) return;
      dragging = true;
      ox = e.clientX; oy = e.clientY;
      sx = rect.left; sy = rect.top;
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', function(e) {
      if (!dragging) return;
      el.style.left = (sx + e.clientX - ox) + 'px';
      el.style.top = (sy + e.clientY - oy) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
    });
    el.addEventListener('pointerup', function() { dragging = false; });
  }

  // ── Mode switching ──
  function switchMode(mode) {
    _mode = mode;
    _panel.querySelectorAll('.tm-mode').forEach(function(btn) {
      btn.classList.toggle('tm-active', btn.dataset.mode === mode);
    });
    anchorFromCursor();
    configSlider();
  }

  function configSlider() {
    var slider = document.getElementById('tm-slider');
    if (_mode === 'DAY') {
      slider.min = 0;
      slider.max = Math.max(_days.length - 1, 0);
      var dayIdx = 0;
      if (_anchorDay !== null) {
        for (var i = 0; i < _days.length; i++) {
          if (_days[i] <= _anchorDay) dayIdx = i;
        }
      } else { dayIdx = _days.length - 1; }
      slider.value = dayIdx;
    } else if (_mode === 'HR') {
      slider.min = 0; slider.max = 23;
      slider.value = (_anchorHr !== null) ? _anchorHr : 12;
    } else {
      slider.min = 0; slider.max = 59;
      slider.value = new Date(_cursor).getSeconds();
    }
  }

  // ── Slider scrub ──
  function onSlide() {
    var slider = document.getElementById('tm-slider');
    var val = parseInt(slider.value);
    var targetMs;

    if (_mode === 'DAY') {
      var dayIdx = Math.min(val, _days.length - 1);
      _anchorDay = _days[dayIdx];
      targetMs = _anchorDay + 86400000; // end of that day
    } else if (_mode === 'HR') {
      _anchorHr = val;
      if (_anchorDay === null && _days.length) _anchorDay = _days[0];
      targetMs = (_anchorDay || _projectStart) + (val + 1) * 3600000;
    } else {
      if (_anchorDay === null && _days.length) _anchorDay = _days[0];
      if (_anchorHr === null) _anchorHr = 0;
      var anchorMinute = new Date(_cursor).getMinutes();
      targetMs = (_anchorDay || _projectStart) + _anchorHr * 3600000 + anchorMinute * 60000 + (val + 1) * 1000;
    }

    renderAtTime(targetMs);
  }

  function copyGuids(onlyNew) {
    var guids = {};
    for (var i = 0; i < _ops.length; i++) {
      if (_ops[i].start_ts > _cursor) break;
      if (onlyNew && _ops[i].op_type !== 'ELEMENT_PLACE') continue;
      var g = _ops[i].output_guid;
      if (g) guids[g] = true;
    }
    var list = Object.keys(guids);
    if (!list.length) return;
    if (navigator.clipboard) navigator.clipboard.writeText(list.join('\n'));
    console.log('§TIME_MACHINE copy ' + (onlyNew ? 'new' : 'all') + ' — ' + list.length + ' GUIDs');
  }

  // ── Playback ──
  var _playing = false;
  var _playDir = 0;
  var _playTimer = null;
  // §S277b: Adaptive tick interval — auto-speed by building size + dramatic slowdown at dawn/dusk
  var _activeBuildingCount = 0;  // set in _finishActivate
  function TICK_MS() {
    // Base speed scales with building size: 3.5K→200ms, 48K→150ms, 122K→220ms
    var base = _isLargeBuilding ? 220 : Math.max(140, Math.min(200, 200 - (_activeBuildingCount / 1000)));
    // §S277b: Dramatic slowdown during twilight — widened zone, steeper ramp at horizon
    // Zone: |30°| to |-20°| covers full sunset→dark and dark→sunrise
    if (_sunCycle && _lastElDeg !== undefined) {
      var el = _lastElDeg;
      if (el > -20 && el < 30) {
        // Proximity to horizon (0°): peaks at el=0, fades at edges
        var dist = Math.abs(el);
        var range = el >= 0 ? 30 : 20;  // asymmetric: 30° above, 20° below
        var t = 1 - dist / range;  // 1 at horizon, 0 at edge
        // Smooth ease-in: slow factor 1x→5x with cubic ramp at center
        var slowFactor = 1 + 4 * t * t;
        base = Math.floor(base * slowFactor);
      }
    }
    return base;
  }

  function startPlayback(dir) {
    if (_playing && _playDir === dir) { stopPlayback(); return; }
    stopPlayback();
    _playing = true;
    _playDir = dir;
    // §PERF_INCR_FIX (part 2, live LTU report post-#912): these wrap-around warps mutated _cursor
    // SILENTLY — no render. The next playTick's renderAtTime then derived _prevCursor from the
    // already-warped value, so the delta window was (start, start+1tick]: only hour-0/1 events got
    // applied and the fully-built end-state scene stayed on canvas ("first second of play at Hour 0
    // does not clear"). Same calling-convention bug family as #912 — warp via renderAtTime (full
    // span → mode=full → every mesh updated), never by assigning _cursor directly.
    if (dir < 0 && _cursor <= _projectStart) renderAtTime(_projectEnd);
    // §S260e: Opening = construction starts from empty, camera orbits for context
    var _willOpen = _camFollow && dir > 0 && _cineStoryboard.length &&
      (_cursor >= _projectEnd || _cursor <= _projectStart + 1);
    if (dir > 0 && _cursor >= _projectEnd) renderAtTime(_projectStart);

    if (_willOpen) {
      if (_cursor > _projectStart) renderAtTime(_projectStart); // start empty — construction builds while camera orbits
      var app = A();
      if (app && app.camera && app.controls) {
        // §S260e: Opening — 10s orbit, camera starts below grade for foundation visibility
        _cineBeat = 'opening';
        _cineTick = 0;
        _cineSceneIdx = 0;
        _cineOpenStart = app.camera.position.clone();
        _cineOpenTarget = app.controls.target.clone();
        // §S260e: Log building extents for self-review
        var _minY = Infinity, _maxY = -Infinity;
        for (var si = 0; si < _cineStoryboard.length; si++) {
          var cy = _cineStoryboard[si].center.y;
          if (cy < _minY) _minY = cy;
          if (cy > _maxY) _maxY = cy;
        }
        console.log('§CINE_OPENING scenes=' + _cineStoryboard.length +
          ' camY=' + _cineOpenStart.y.toFixed(1) +
          ' targetY=' + _cineOpenTarget.y.toFixed(1) +
          ' sceneMinY=' + _minY.toFixed(1) + ' sceneMaxY=' + _maxY.toFixed(1));
        // Find the first scene center for the transition out
        var firstSc = _cineStoryboard[0];
        if (firstSc) {
          _cineNextTarget = firstSc.center;
          _camTarget = firstSc.center.clone();
        }
      }
    }

    var btn = document.getElementById(dir < 0 ? 'tm-rev-btn' : 'tm-fwd-btn');
    if (btn) { btn.textContent = '\u25AE\u25AE'; btn.classList.add('tm-active'); }
    playTick();
  }

  function stopPlayback() {
    _playing = false;
    if (_playTimer) { clearTimeout(_playTimer); _playTimer = null; }
    _gspStopDecay();   // §GROUP_SPARK: in-flight flashes cool out, then park at ZERO sprites
    var rb = document.getElementById('tm-rev-btn');
    var fb = document.getElementById('tm-fwd-btn');
    if (rb) { rb.textContent = '\u25C0'; rb.classList.remove('tm-active'); }
    if (fb) { fb.textContent = '\u25B6'; fb.classList.remove('tm-active'); }
    anchorFromCursor();
    configSlider();
  }

  function playTick() {
    if (!_playing) return;

    _gspRoll++;   // §GROUP_SPARK: one re-roll per playback tick ("randomize among themselves
                  // repeatedly until their duration is reached")
    // §PERF_INCR_FIX: compute the target into a LOCAL var, not the global _cursor, before calling
    // renderAtTime — renderAtTime reads _cursor itself to derive _prevCursor (the delta-skip
    // window's lower bound). Pre-assigning _cursor here made _prevCursor==cursorMs on EVERY tick
    // (zero-width window), so _tmHasEventIn found "no event" for every mesh and the delta path
    // skipped the whole scene every tick once shadows stopped forcing full mode (Phase 2). Confirmed
    // live: real playback log showed span=0h on every tick. renderAtTime sets the global _cursor
    // itself once it has captured the true previous value — do not set it here first.
    var _nextCursor = Math.max(_projectStart, Math.min(_cursor + _playDir * tickMs(), _projectEnd));

    renderAtTime(_nextCursor);

    // Update slider position during playback
    anchorFromCursor();
    configSlider();

    if ((_playDir < 0 && _cursor <= _projectStart) || (_playDir > 0 && _cursor >= _projectEnd)) {
      stopPlayback();
      return;
    }

    _playTimer = setTimeout(playTick, TICK_MS());
  }

  // ══════════════════════════════════════════════════════════════════
  // §4D_ROOF_LOAD_PATH — roof/load-path promotion classifier (ONE copy)
  // ══════════════════════════════════════════════════════════════════
  // ONE classifier, TWO callers: injectGantt() (the live scheduler build) and _buildXrayElements()
  // (the x-ray staging rebuild that verifyGanttIntegrity() — the schedule LOCK gate — also runs
  // on). Consolidated 2026-08-10 from two inline copies verified byte-identical in .seq output —
  // a future silent divergence would have made the lock gate verify against a different
  // classification than the one actually scheduled: a correctness bug, not a rendering glitch.
  //
  // §4D_ROOF_LOAD_PATH M1 (2026-08-01, prompts/GANTT_ACCURACY.md §4D_ROOF_LOAD_PATH) — a slab's
  // ROLE is a load-path fact, not a storey-name label. SUPERSEDES the deleted `/roof/i` override:
  // measured 2026-08-01, that regex fired ZERO times on Hospital ("Level 1..7A"/"Unknown")
  // and LTU_AHouse ("TAKPLAN", Swedish) — the two roof slabs it was meant to catch have storey
  // "Unknown". For each IfcSlab, take the IfcWall*/IfcWallStandardCase whose XY footprint overlaps
  // it ("those walls"). Two checks from the SAME paragraph of the spec, both epsilon-free:
  //   (a) the slab's base_z is above the average midheight of those walls — the walls are BELOW
  //       and physically carry it.
  //   (b) NONE of those walls stand ON it (no overlapping wall has base_z >= the slab's own
  //       top_z) — this is the spec's own stated definition of "the floor case" ("floor slab:
  //       walls stand ON it ... otherwise it stays a floor slab"), and it is NOT redundant with
  //       (a): measured on this exact DB, (a) alone is true for nearly every capped-wall slab in
  //       the building (35 slabs -> 23 "promoted"), including known mid-building intermediate
  //       floors (base_z 176.81, between Level 2 and Level 3, 5 more levels above) — a slab that
  //       caps the walls below it satisfies (a) whether or not it ALSO carries walls above, so (a)
  //       alone cannot tell "top of the load path" from "one more floor in the middle of it". (b)
  //       is the missing half of the spec's own description and brings Hospital down to the 2
  //       true roof slabs + a handful of isolated panels with no wall directly overlapping the
  //       next level up (open corridor/atrium bays) — reported, not silently forced to exactly 2.
  // Promoted -> roof role -> seq 8, phase 'Architecture'. Otherwise stays whatever seq matchRule
  // gave it (the floor case). No new numeric constant either way — both checks compare the slab
  // against its own extracted geometry and the walls' own extracted geometry.
  //
  // Pure two-phase pass over `elements` (order-independent — both original call sites ran it on
  // differently-sorted arrays with identical .seq results). Mutates promoted slabs' el.seq (and
  // el.phase — harmless bookkeeping on the x-ray path, whose elements never carried a phase field
  // and nothing downstream reads it). Returns { total, seedCount, m4Count } so each caller keeps
  // its own log wording — only injectGantt logs §GANTT_OVERRIDE, _buildXrayElements stays silent.
  function _promoteRoofLoadPath(elements) {
    var loadPathWalls = elements.filter(function(e) { return e.cls.indexOf('IfcWall') === 0; });
    var loadPathOverrides = 0;
    var lpGuids = [];  // promoted GUIDs — returned for the §4D_ROOF_LOAD_PATH witness hook (G-RLP-2/3)
    // §4D_WALLS_BEFORE_ROOF (2026-08-01) — pass 1 computes the SEED set exactly as #1120 shipped it
    // (clause a AND clause b), so the shipped count is reproduced unchanged before M4 widens it.
    var lpSlabs = [], lpSeed = [];
    elements.forEach(function(el) {
      if (el.cls !== 'IfcSlab') return;
      var carriers = loadPathWalls.filter(function(w) {
        return el.x0 <= w.x1 && el.x1 >= w.x0 && el.y0 <= w.y1 && el.y1 >= w.y0;
      });
      if (!carriers.length) return;
      var midSum = 0, above = [];
      for (var ci = 0; ci < carriers.length; ci++) {
        midSum += (carriers[ci].base_z + carriers[ci].top_z) / 2;
        if (carriers[ci].base_z >= el.top_z) above.push(carriers[ci]);
      }
      var wallMidheight = midSum / carriers.length;
      var clauseA = el.base_z > wallMidheight;
      lpSlabs.push({ el: el, clauseA: clauseA, above: above });
      if (clauseA && !above.length) {
        el.seq = 8; el.phase = 'Architecture';
        loadPathOverrides++;
        lpSeed.push(el);
        lpGuids.push(el.guid);
      }
    });

    // §4D_WALLS_BEFORE_ROOF M4 (2026-08-01, prompts/GANTT_ACCURACY.md §4D_WALLS_BEFORE_ROOF) —
    // user, live on a Hospital MaxQ bake: "The roof before the walls still happening on the roof
    // top". #1120's clause (b) disqualifies a roof if ANY XY-overlapping wall stands on it. On
    // Hospital that disqualifies the 2091.5 m² topmost deck (3Csn1z$1v5Q8DXdumWYJUE, base_z 199.66)
    // because the two helipad boxes — whose OWN roofs #1120 promoted — stand on it. MEASURED on
    // origin/main: it starts 2022-07-27 as Superstructure while its 14 wall carriers finish
    // 2023-04-30 — 277 days before its own walls, the identical error #1120 reported fixing for the
    // boxes. This is #1120's `⚠ LIMIT 2` arriving, and wider than LIMIT 2 predicted: these walls are
    // 3.05–3.47 m tall and DO carry something, so LIMIT 2's "parapet carries nothing" discriminator
    // would not have caught it.
    //   THE RULE: a wall standing on a slab is not "the next storey" if that wall is itself CAPPED
    //   by a slab already known to be a roof (a helipad box, a plant enclosure, a coped parapet —
    //   the load path tops out in a roof, it does not continue the building). Capped = a seed roof
    //   slab XY-overlapping the wall with its base_z between the wall's base_z and top_z + GAP. A
    //   wall capped by NOTHING does not qualify.
    //   DEPTH 1, ON THE FROZEN SEED SET, DELIBERATELY. Full recursion was measured and collapses:
    //   the box walls excuse the 199.66 deck -> the deck excuses 3064w0y0nDv9wdb1cWL_Gu -> Level 6
    //   promotes -> Level 5 -> Level 4 -> the whole building becomes "roof". Depth-1 terminates.
    //   MEASURED: Hospital 10 -> 11. The one addition is the user's slab. Level 6 (3 blockers),
    //   Level 5 (33), Level 4 (514) and #1120's own floor control 1OV06Y3c5D8vODNyxVnSVI (56) all
    //   stay blocked. A footprint-extent ratio was tried and REJECTED — it does not separate (roof
    //   0.040 vs intermediate panels 0.024/0.024/0.029/0.044, Level 6 0.170); no threshold exists,
    //   which is why this is a load-path rule and not an area rule.
    var LP_GAP = 0.5;  // m — same "tops out at this level" tolerance schedule_gate.js uses (GAP)
    var m4Promoted = 0;
    if (lpSeed.length) {
      lpSlabs.forEach(function(rec) {
        var el = rec.el;
        if (el.seq === 8 || !rec.clauseA || !rec.above.length) return;
        for (var ai = 0; ai < rec.above.length; ai++) {
          var w = rec.above[ai], capped = false;
          for (var si = 0; si < lpSeed.length; si++) {
            var C = lpSeed[si];
            if (C.x0 <= w.x1 && C.x1 >= w.x0 && C.y0 <= w.y1 && C.y1 >= w.y0 &&
                C.base_z >= w.base_z && C.base_z <= w.top_z + LP_GAP) { capped = true; break; }
          }
          if (!capped) return;             // a wall the building genuinely continues through
        }
        el.seq = 8; el.phase = 'Architecture';
        loadPathOverrides++; m4Promoted++;
        lpGuids.push(el.guid);
      });
    }
    return { total: loadPathOverrides, seedCount: lpSeed.length, m4Count: m4Promoted, guids: lpGuids };
  }

  // §SCHEDULE_CLASSIFY_DEDUP (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
  // §SCHEDULE_CLASSIFY_DEDUP — Witness: witness_class_fallback_blackbox.js). Before this,
  // matchNameOverride/matchRule were two BYTE-IDENTICAL closures, one inside _buildXrayElements
  // and one inside injectGantt — on top of the canonical, already-exported implementation
  // schedule_author.js carries (window.ScheduleAuthor.matchNameOverride/matchRule), same pattern
  // the §TM_DURATION_SYNC comment above _installSecs already used for install-time. ONE shared
  // pair now, delegating to ScheduleAuthor when loaded (always true past initial page load — this
  // is only ever called from schedule generation, never at script-eval time) with the same
  // algorithm kept as a fallback for the ScheduleAuthor-not-loaded case, matching this file's own
  // established convention (see _installSecs's wrapper a few hundred lines below). Both call
  // sites keep their own local matchNameOverride(cls,name)/matchRule(cls,name) wrappers — same
  // names, same signatures — so this is a pure body-swap, not a call-site rewrite.
  function _classifyNameOverride(cls, name, nameOverrides) {
    if (window.ScheduleAuthor && window.ScheduleAuthor.matchNameOverride) {
      return window.ScheduleAuthor.matchNameOverride(cls, name, nameOverrides);
    }
    if (!name || !nameOverrides) return null;
    for (var i = 0; i < nameOverrides.length; i++) {
      var ov = nameOverrides[i];
      if (ov.classes && ov.classes.indexOf(cls) < 0) continue;
      if (!ov._re) { try { ov._re = new RegExp(ov.pattern, ov.flags || 'i'); } catch (e) { ov._re = null; } }
      if (ov._re && ov._re.test(name)) return ov;
    }
    return null;
  }
  function _classifyRule(cls, name, rules, dflt, nameOverrides) {
    if (!cls) return dflt;
    var ov = _classifyNameOverride(cls, name, nameOverrides);
    if (ov) return ov;
    if (window.ScheduleAuthor && window.ScheduleAuthor.matchRule) {
      return window.ScheduleAuthor.matchRule(cls, rules, dflt);
    }
    var bestKey = null, bestLen = 0;
    for (var key in rules) {
      if (cls.indexOf(key) >= 0 && key.length > bestLen) { bestKey = key; bestLen = key.length; }
    }
    if (!bestKey) console.warn('§CLASS_UNMATCHED cls=' + cls + ' falling back to default phase=' + dflt.phase);
    return bestKey ? rules[bestKey] : dflt;
  }

  // ══════════════════════════════════════════════════════════════════
  // ── §ZONE_INDEX (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §ZONE_INDEX —
  // Witness: viewer/tests/witness_zone_index.js W-ZONE) ────────────────────────────────────────
  // ONE derived spatial-zone index, built once per (building, _metaGen) and reused by every
  // building op that needs a zone. Before this, the SAME median-Z storey banding was written out
  // TWICE — inside _buildXrayElements and again inside injectGantt — byte-identical algorithms
  // differing only in which column index their own SELECT put `cz` at, plus a counter. That is the
  // duplication pattern CPE_4D_PERF_MEM_FINDINGS.md §R7 already records for the support predicate
  // (4 copies) and the element build (a self-described "DELIBERATE COPY"); a third consumer (the
  // §TIER_SERIAL_BY_ZONE barrier) would have made it three, so it is consolidated FIRST.
  //
  // ⚠ THE ZONE IS A GEOMETRIC INFERENCE, NOT IFC TRUTH — say so wherever it is reported. Measured
  // share of elements whose elements_meta.storey is null/empty/"unknown": Duplex 86.0%, Terminal
  // 69.9%, Clinic 32.2%, Hospital 15.9%. A key read straight from the column would be absent for
  // most elements on most buildings, which is why the median-Z reassignment exists at all and why
  // it — not the column — is the primary key.
  //
  // FALLBACK CHAIN, finest available wins, each level an optional refinement over the one below,
  // never a prerequisite (user: "storey room space should all come into play amicably"):
  //     room/space  → storey → derived median-Z band → single zone
  // Measured reason it must be a chain and not a requirement: of the 7 shipped buildings, ONLY
  // Terminal carries the richer tables (spatial_structure n=59, rel_contained_in_space n=2,181).
  // A model extracted without them loses precision, never correctness; a single-storey model
  // degrades to one zone, which is exactly today's global behaviour.
  //
  // ⚠ SCOPE OF THIS CHANGE: consolidation + cache ONLY. `level` and `spaceOf` are BUILT and
  // REPORTED but nothing consumes them yet — turning the space level on changes zone granularity,
  // which is a scheduling behaviour change and belongs with §TIER_SERIAL_BY_ZONE's own witness,
  // not with a refactor that has to prove itself byte-identical.
  var _zoneMemo = [];   // 2-slot, most-recent first — same discipline as §XRAY_CACHE_MEMO

  // §S62: the builder moved VERBATIM to viewer/zone_index.js (pure: db in, index out). The memo,
  // the key and the §ZONE_INDEX log below stay here — state and reporting are the parent's job.
  // Name kept so every caller and the __tmZoneProbe hook read unchanged.
  function _zoneIndexBuild(db) { return ZoneIndex.build(db); }

  // Memoized accessor. Key mirrors §XRAY_CACHE_MEMO: over-invalidating on _metaGen is the safe
  // direction (a miss costs one rebuild; a false hit is a wrong-zone bug).
  function _zoneIndex() {
    var app = A();
    if (!app || !app.db) return null;
    // Read _metaGen directly rather than borrowing §XRAY_CACHE_MEMO's helper — two unrelated memos
    // should not be coupled through a shared accessor just because their keys happen to rhyme.
    var key = ((app.activeBuilding) || '?') + '|' + ((app._metaGen != null) ? (app._metaGen | 0) : -1);
    for (var i = 0; i < _zoneMemo.length; i++) {
      if (_zoneMemo[i].key === key) {
        var hit = _zoneMemo[i];
        if (_zoneMemo.length > 1 && i > 0) { _zoneMemo.splice(i, 1); _zoneMemo.unshift(hit); }
        return hit.idx;
      }
    }
    var idx = _zoneIndexBuild(app.db);
    if (!idx) return null;
    _zoneMemo.unshift({ key: key, idx: idx });
    if (_zoneMemo.length > 2) _zoneMemo.length = 2;
    console.log('§ZONE_INDEX built bands=' + idx.names.length + ' level=' + idx.level +
      ' elements=' + idx.totalN + ' noStorey=' + idx.unknownN +
      ' (' + (100 * idx.unknownN / Math.max(1, idx.totalN)).toFixed(1) + '% — zone is a median-Z' +
      ' INFERENCE, not IFC truth)' + ' medianTies=' + idx.tiesN +
      ' spaceRows=' + idx.spaceN + ' ms=' + idx.buildMs.toFixed(1));
    return idx;
  }
  // Test hook (diagnostic only, same contract as __tmXrayProbe) — lets W-ZONE compare the shared
  // index against a freshly-built one and read the memo depth.
  window.__tmZoneProbe = function (op) {
    if (op === 'clearMemo') { _zoneMemo = []; }
    var idx = _zoneIndex();
    if (!idx) return null;
    return { bands: idx.names.length, names: idx.names.slice(), band: idx.band,
             medianZ: idx.medianZ, level: idx.level, ties: idx.tiesN,
             unknownN: idx.unknownN, totalN: idx.totalN, spaceN: idx.spaceN,
             memoDepth: _zoneMemo.length };
  };

  // §Z_STACK_XRAY_STAGING — support-edge cache for x-ray staging
  // ══════════════════════════════════════════════════════════════════
  // Implementing prompts/GANTT_ACCURACY.md §Z_STACK_XRAY_STAGING — Witness: witness_zstack_xray_staging.js
  // An element revealed at its scheduled time whose support carriers are NOT all placed renders
  // X-RAY instead of solid, and flips solid the instant its last carrier places. This is a
  // RENDER-ONLY gate layered on the existing (correct, user-confirmed) reveal timing — it never
  // writes kernel_ops, never reorders anything (W-XRAY-2: computeSchedule's output is untouched by
  // this section, byte-identical with or without it).
  //
  // _buildXrayElements() is a DELIBERATE COPY of the geometry+seq build inside injectGantt()
  // (repo convention: audit_support_roleblind.js / witness_stagger_support_order.js both copy the
  // support predicate rather than importing it — see origin/feat/element-cpm:viewer/schedule_gate.js
  // §ELEMENT_CPM, parked; only the PREDICATE is reused here, not the reordering engine it lived
  // in). EXCEPTION (2026-08-10): the roof/load-path promotion is no longer a copy — both this
  // function and injectGantt call the shared _promoteRoofLoadPath() above, because
  // verifyGanttIntegrity() (the schedule LOCK gate) runs on THIS build and a silent classifier
  // divergence there would be a correctness bug, not a rendering glitch.
  // It is intentionally NEVER called by injectGantt and has no db.run/INSERT capability — it
  // exists so the xray cache can be (re)built on EVERY TM activation, including the cached-gantt
  // fast path (§GANTT_CACHE_HIT) where injectGantt() never runs at all.
  function _buildXrayElements() {
    var app = A();
    if (!app || !app.db) return null;
    var db = app.db;
    var SR = window.SEQUENCE_RULES || {};
    var SD = window.SEQUENCE_DEFAULT || { phase: 'Architecture', sequence: 6, resource: null };
    var NO = window.SEQUENCE_NAME_OVERRIDES || [];
    // §SCHEDULE_CLASSIFY_DEDUP — body delegates to the one shared pair above (_classifyNameOverride/
    // _classifyRule), which itself defers to schedule_author.js's canonical, already-exported
    // matchNameOverride/matchRule. Local name/signature unchanged so nothing below this line moves.
    function matchNameOverride(cls, name) { return _classifyNameOverride(cls, name, NO); }
    function matchRule(cls, name) { return _classifyRule(cls, name, SR, SD, NO); }
    var r;
    try {
      r = db.exec(
        'SELECT m.guid, m.ifc_class, m.element_name, m.storey, ' +
        'COALESCE(t.center_z, 0) as cz, COALESCE(t.bbox_z, 0) as bz, ' +
        'COALESCE(t.center_x, 0) as cx, COALESCE(t.center_y, 0) as cy, ' +
        'COALESCE(t.bbox_x, 0) as bx, COALESCE(t.bbox_y, 0) as by ' +
        'FROM elements_meta m ' +
        'LEFT JOIN element_transforms t ON t.guid = m.guid ' +
        "WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'"
      );
    } catch (e) { return null; }
    if (!r.length || !r[0].values.length) return null;

    // §ZONE_INDEX (2026-08-12) — was an inline copy of the median-Z banding, byte-identical to
    // injectGantt's own except for the column index its SELECT put `cz` at. One shared index now;
    // see _zoneIndexBuild's header for why the zone is an inference and why it is memoized.
    var _zi = _zoneIndex();
    function assignStoreyByZ(storey, cz) { return _zi ? _zi.assign(storey, cz) : storey; }

    var elements = r[0].values.map(function(row) {
      var cls = row[1], elName = row[2] || '', rawStorey = row[3] || '_UNKNOWN', cz = row[4] || 0, bz = row[5] || 0;
      var cx = row[6] || 0, cy = row[7] || 0, bx = row[8] || 0, by = row[9] || 0;
      var storey = assignStoreyByZ(rawStorey, cz);
      var rule = matchRule(cls, elName);
      return {
        guid: row[0], cls: cls, storey: storey,
        base_z: cz - bz / 2, top_z: cz + bz / 2,
        x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2,
        seq: rule.sequence
      };
    });

    // §4D_ROOF_LOAD_PATH M1/M4 — same load-path promotion the live scheduler applies, now SHARED
    // (one classifier, _promoteRoofLoadPath above — consolidated 2026-08-10 from an inline copy
    // verified byte-identical in .seq output) so a promoted roof slab's carrier predicate (the
    // looser wall-bears check) matches what actually got scheduled — the exact scenario this whole
    // feature exists for ("roof before its walls"). Counts unused here: only injectGantt logs
    // §GANTT_OVERRIDE.
    var _lp = _promoteRoofLoadPath(elements);
    return elements;
  }

  // Build _tmXraySolidifyTs from elements + schedMap = { guid: {end: ms}, ... } (derived from the
  // CURRENT _ops, whatever their source — generated fallback or captured IFC 4D — so captured-path
  // ghosting works unchanged, same pass, per §Z_STACK_XRAY_STAGING's own out-of-scope note).
  // Predicate copied verbatim from origin/feat/element-cpm:viewer/schedule_gate.js lines 216-256
  // (structGrid/wallGrid spatial index, EPS/GAP/CELL constants) — same numbers the shipped
  // schedule_gate.js's own auditFloating() already uses.
  function _buildXraySupportCache(elements, schedMap) {
    _tmXraySolidifyTs = {}; _tmXrayStagedTotal = 0; _tmXraySolidifiedN = 0;
    if (!elements || !elements.length) return;
    var t0 = performance.now();
    var CELL = 4, EPS = 0.05, GAP = 0.5;
    function cellsOf(e) {
      var o = [], i, j;
      for (i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
        for (j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
      return o;
    }
    function overlap(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }
    var structGrid = {}, wallGrid = {}, i, c, cs, k, arr, S, T;
    for (i = 0; i < elements.length; i++) {
      var e = elements[i];
      // §PROMOTED_CARRIER_POOL (2026-08-11, §TIER_SERIAL finding A follow-on): pool aligned with
      // auditFloating's (schedule_gate.js) — seq<=4 ∪ load-path-PROMOTED slabs (seq>4 IfcSlab).
      // Promoted roof slabs are audit/DAG carriers (helipad boxes stand on the promoted deck;
      // Terminal's 24k wall-carried cone) but were INVISIBLE here, so their dependents were never
      // staged/gated against them — the guard (_ogSupportSweep) applies the IDENTICAL pool, the
      // pair stays one physics (witness_og_guard_bearing_bound W-OGB-3).
      if (e.seq <= 4 || (e.cls === 'IfcSlab' && e.seq > 4)) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (structGrid[cs[c]] = structGrid[cs[c]] || []).push(e); }
      else if (e.cls && e.cls.indexOf('IfcWall') === 0) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (wallGrid[cs[c]] = wallGrid[cs[c]] || []).push(e); }
    }
    var eCount = 0;
    for (i = 0; i < elements.length; i++) {
      T = elements[i];
      var sc = schedMap[T.guid]; if (!sc) continue;
      var promotedSlab = (T.cls === 'IfcSlab' && T.seq > 4);
      cs = cellsOf(T);
      // §OG_BEARING_BOUND (2026-08-11) — the judge half of the guard's two-tier bearing rule (see
      // §PHASE_OVERLAP_SUPPORT_GUARD below for the full ruling): carriers topping within T's own
      // extent (+GAP) define its bearing plane; ENVELOPING carriers (top above T.top_z+GAP, e.g. a
      // full-height column the element frames into mid-span) still count as detected support but
      // only judge T when no in-extent carrier exists. Guard and judge MUST apply the identical
      // rule or staged>0 comes back (the 2026-08-07 §4D_LAYER_TRUTH alignment, third asymmetry
      // fixed then; this change keeps the pair symmetric while removing the crown-wait).
      var topBound = T.top_z + GAP, maxEnvEnd = 0;
      var mark = {}, maxCarrierEnd = 0, hasCarrier = false;
      for (c = 0; c < cs.length; c++) {
        arr = structGrid[cs[c]];
        if (arr) for (k = 0; k < arr.length; k++) {
          S = arr[k]; if (S === T || mark[S.guid]) continue; mark[S.guid] = 1;
          if (S.base_z < T.base_z - EPS && S.top_z >= T.base_z - GAP && overlap(S, T)) {
            var sc1 = schedMap[S.guid]; eCount++;
            if (sc1) { hasCarrier = true;
              if (S.top_z <= topBound) { if (sc1.end > maxCarrierEnd) maxCarrierEnd = sc1.end; }
              else if (sc1.end > maxEnvEnd) maxEnvEnd = sc1.end; }
          }
        }
        // §XRAY_WALL_SCOPE (found 2026-08-04, 4D_SCHEDULE_PERFECTION.md "Z-stack" chase): a wall is
        // only EVER a real candidate carrier for a slab ITSELF promoted to the roof role (seq>4) —
        // schedule_gate.js's auditFloating() already restricts wallGrid this way (§4D_ROOF_LOAD_PATH
        // M3: "walls do not structurally carry beams/members/furniture in this DB", MEASURED 2026-08-01
        // — the unrestricted version false-"floated" 0->3421/10979 on Hospital). This sibling
        // implementation never got that same restriction, so wallGrid was checked for EVERY element,
        // not just promoted slabs — a beam/column/ordinary-slab sitting near a wall's top height (a
        // wall's top and a beam's base are naturally close at any floor-to-floor transition) got
        // flagged as "carried by" a wall it never structurally depends on. MEASURED: 1,217 false-
        // positive xray-staged elements on Hospital (93% of them beams/columns/ordinary-slabs vs.
        // walls), all cleared to 0 by adding the SAME `promotedSlab` guard auditFloating() already
        // uses. Only reachable for a promotedSlab T (see var promotedSlab above), never for beams/
        // columns/furniture/MEP.
        if (promotedSlab) {
        arr = wallGrid[cs[c]];
        if (arr) for (k = 0; k < arr.length; k++) {
          S = arr[k]; if (S === T || mark[S.guid]) continue; mark[S.guid] = 1;
          if (!(S.base_z < T.base_z - EPS) || !overlap(S, T)) continue;
          if (S.top_z >= T.base_z - GAP) {
            var sc2 = schedMap[S.guid]; eCount++;
            if (sc2) { hasCarrier = true;
              if (S.top_z <= topBound) { if (sc2.end > maxCarrierEnd) maxCarrierEnd = sc2.end; }
              else if (sc2.end > maxEnvEnd) maxEnvEnd = sc2.end; }
          }
        }
        }
      }
      if (!maxCarrierEnd && maxEnvEnd) maxCarrierEnd = maxEnvEnd;   // §OG_BEARING_BOUND tier-2 fallback
      if (hasCarrier && maxCarrierEnd > sc.end) {
        _tmXraySolidifyTs[T.guid] = maxCarrierEnd;
        _tmXrayStagedTotal++;
      }
    }
    var msBuild = performance.now() - t0;
    console.log('§XRAY_EDGES n=' + eCount + ' ms=' + msBuild.toFixed(1) +
      ' staged=' + _tmXrayStagedTotal + '/' + elements.length +
      ' (elements whose last support carrier finishes after their own reveal)');
  }

  // ── §XRAY_CACHE_MEMO (2026-08-12, bim-compiler prompts/CPE_4D_PERF_MEM_FINDINGS.md §3c —
  // Implementing R4(b), user ruling "memoize on an input key, keep the reset" — Witness:
  // viewer/tests/witness_xray_cache_memo.js W-XRAY-MEMO) ────────────────────────────────────────
  // The rebuild below ran on EVERY activation (~0.7s / 74,942 edges on Hospital), including the
  // §GANTT_CACHE_HIT fast path. It is a PURE FUNCTION of (elements from the DB) + (_ops end_ts),
  // so an identical-input re-activation was recomputing a byte-identical map.
  //
  // What is memoized and what is NOT — this distinction IS the doctrine compliance:
  //   MEMOIZED: the derived map (guid → solidify ms) + its "staged total". Pure, input-keyed.
  //   NOT MEMOIZED (still reset on TM-off, unchanged at :deactivate): _tmXraySolidifiedN and the
  //   per-object _tm_xrayStaged flags — the RUNTIME STAGING STATE. §Z_STACK_XRAY_STAGING's
  //   "nothing may survive TM being switched off" is about that state, and it still doesn't.
  // A memo surviving is not the same as state surviving.
  //
  // Safe to alias rather than deep-copy: the ONLY writes to _tmXraySolidifyTs[...] are inside
  // _buildXraySupportCache (which rebuilds it wholesale); every other site REASSIGNS the var
  // (`= {}`), never mutates the object, so deactivate()'s reset cannot corrupt the memo.
  //
  // TWO SLOTS, not one — and the reason is the MAXQ/Alt-C round trip specifically. A single slot
  // makes tmApplyDerivedOrder → tmRestoreDerivedOrder miss in BOTH directions: the derived re-key
  // evicts the real-order map, then restoring evicts the derived one. Two slots (most-recent +
  // previous) make that alternation hit both ways, which is exactly the path the cinema bake walks.
  // Witnessed: with one slot, G-XM-KEY's restore leg came back MISS.
  var _xrayElemMemo = null;    // { key, elements }  — DB-derived, _ops-independent (warmable)
  var _xrayCacheMemo = [];     // [{ key, ts, staged }, ...] most-recent first, capped at 2

  function _xrayMemoFind(key) {
    for (var i = 0; i < _xrayCacheMemo.length; i++) if (_xrayCacheMemo[i].key === key) return _xrayCacheMemo[i];
    return null;
  }
  function _xrayMemoPut(key, ts, staged) {
    for (var i = 0; i < _xrayCacheMemo.length; i++) {
      if (_xrayCacheMemo[i].key === key) { _xrayCacheMemo.splice(i, 1); break; }
    }
    _xrayCacheMemo.unshift({ key: key, ts: ts, staged: staged });
    if (_xrayCacheMemo.length > 2) _xrayCacheMemo.length = 2;
  }

  // _metaGen is in both keys per the ruling. It OVER-invalidates for the elements half (it bumps on
  // streaming/eviction, which cannot change a DB SELECT) — that is the deliberately safe direction:
  // a miss costs a rebuild, a false hit is a wrong-render bug.
  function _xrayMemoGen() {
    var app = A();
    return (app && app._metaGen != null) ? (app._metaGen | 0) : -1;
  }

  // Build the elements list, or serve it from the memo. Shared by the rebuild and by §TM_WARM.
  function _xrayElementsMemoized() {
    var app = A();
    var key = ((app && app.activeBuilding) || '?') + '|' + _xrayMemoGen();
    if (_xrayElemMemo && _xrayElemMemo.key === key) return { elements: _xrayElemMemo.elements, hit: true };
    var els = _buildXrayElements();
    if (els) _xrayElemMemo = { key: key, elements: els };
    return { elements: els, hit: false };
  }

  // Shared entry point: rebuild the xray cache from whatever _ops currently holds. Called from
  // _finishActivate (every TM activation) AND from tmRestoreDerivedOrder (MAXQ → back to the real
  // construction order, where the cache IS valid again and must not stay cleared).
  function _tmRebuildXrayCache() {
    var _xt0 = performance.now();
    var _xrSched = {};
    // opsSig: rolling hash over (guid, end_ts), computed in the pass that already builds _xrSched —
    // no extra traversal. This is what makes every re-key path self-correcting WITHOUT a special
    // case: tmApplyDerivedOrder (camera-path re-key) and _tmResyncAfterRetime (drag/ruler/group/
    // undo) both move end_ts, so the sig changes and the memo is forced to miss.
    var _sigH = 0x811c9dc5, _sigN = 0;
    for (var _xi = 0; _xi < _ops.length; _xi++) {
      var _xo = _ops[_xi];
      var _xg = _xo.output_guid || (_xo.input_guids && _xo.input_guids.length && _xo.input_guids[0]);
      if (_xg) {
        _xrSched[_xg] = { end: _xo.end_ts };
        _sigN++;
        for (var _sc = 0; _sc < _xg.length; _sc++) {
          _sigH ^= _xg.charCodeAt(_sc); _sigH = (_sigH * 0x01000193) >>> 0;
        }
        _sigH ^= (_xo.end_ts | 0); _sigH = (_sigH * 0x01000193) >>> 0;
      }
    }
    var _opsSig = _ops.length + ':' + _sigN + ':' + _sigH.toString(16);
    var _key = _xrayMemoGen() + '|' + _opsSig;

    var _memoHit = _xrayMemoFind(_key);
    if (_memoHit) {
      _tmXraySolidifyTs = _memoHit.ts;
      _tmXrayStagedTotal = _memoHit.staged;
      _tmXraySolidifiedN = 0;   // runtime progress ALWAYS restarts — never memoized
      console.log('§XRAY_CACHE_BUILD elemMs=0.0 edgeMs=0.0 total_ms=' +
        (performance.now() - _xt0).toFixed(1) + ' elemMemo=hit edgeMemo=hit staged=' + _tmXrayStagedTotal);
      return;
    }

    var _e0 = performance.now();
    var _em = _xrayElementsMemoized();
    var _elemMs = performance.now() - _e0;
    var _xrElements = _em.elements;
    var _g0 = performance.now();
    if (_xrElements) _buildXraySupportCache(_xrElements, _xrSched);
    else { _tmXraySolidifyTs = {}; _tmXrayStagedTotal = 0; _tmXraySolidifiedN = 0; }
    var _edgeMs = performance.now() - _g0;
    if (_xrElements) _xrayMemoPut(_key, _tmXraySolidifyTs, _tmXrayStagedTotal);
    console.log('§XRAY_CACHE_BUILD elemMs=' + _elemMs.toFixed(1) + ' edgeMs=' + _edgeMs.toFixed(1) +
      ' total_ms=' + (performance.now() - _xt0).toFixed(1) +
      ' elemMemo=' + (_em.hit ? 'hit' : 'miss') + ' edgeMemo=miss staged=' + _tmXrayStagedTotal);
  }

  // ── §TIER_SERIAL / §TIER_REGATE (retired §S20 Part B, 2026-08-17, 4D_GANTT_TM_REFACTOR.md) —
  // the two-tier Substructure/Superstructure/Architecture-serial + audit-physics-regate display
  // repair chain (_TIER1_ORDER, _zoneOf, _tier1Extents, _tier1Serialize, _tier1Protrusion,
  // _tierAuditRegate — all reachable only through each other and the deleted _twoTierRemap below,
  // zero external callers, verified by grep before deletion) is DELETED. Replaced fleet-wide by
  // §CPM_DISPLAY's one-DAG forward pass (viewer/cpm_schedule.js) — see _displayTimeline below.
  // Confirmed twice this lane never reached this chain live (§S13.8 by reading, §S14.0 and every
  // fleet run since by measurement) before deleting it. Net: -216 lines.

  // ── §PHASE_OVERLAP_SUPPORT_GUARD — the support-order sweep ───────────────────────────────────
  // §S58 (SCRIPT_LENGTH_REFACTOR_SEAMS.md): the physics moved VERBATIM to viewer/support_sweep.js.
  // This wrapper is the parent's half of the split — it owns the § log line, the module owns the
  // rule. Do NOT reword the log: the §PHASE_OVERLAP_BAND token is pinned by the extraction's
  // before/after normalized log diff, which is what proves the move changed no behaviour.
  // Slicing note, replacing the old one: witness_og_guard_bearing_bound.js now slices
  // support_sweep.js BY FUNCTION NAME (brace-counted), so indentation and log wording no longer
  // rot it — that coupling is retired, not preserved. witness_gantt_og_grid_perf.js calls the
  // module directly. Do not re-introduce raw text markers here.
  // _allScheduled: mutated in place (including a bz-ascending sort); s only ever moves LATER
  // (push after real support), duration preserved.
  function _ogSupportSweep(_allScheduled, taskWin) {
      var r = SupportSweep.ogSupportSweep(_allScheduled, taskWin);
      if (r.pushed) console.log('§PHASE_OVERLAP_SUPPORT_GUARD pushed=' + r.pushed + '/' + _allScheduled.length +
        ' (sweeps=' + r.sweeps + ', bearing+hang) elements later than their §PHASE_OVERLAP_BAND window to stay after their real support');
      return r;
  }

  // ══ §CROSSTASK_JUDGE_PARITY — judge/repair parity, window-bounded ════════════════════════════
  // §S58: physics in viewer/support_sweep.js; this wrapper owns the § line. maxShiftMs and ms come
  // back from the module so the printed numbers are identical to the pre-extraction line.
  function _cjpJudgeParity(items, taskWin) {
    var r = SupportSweep.cjpJudgeParity(items, taskWin);
    if (r.ok !== false) console.log('§CROSSTASK_JUDGE_PARITY pushed=' + r.pushed + ' sweeps=' + r.sweeps +
      ' maxShiftDays=' + (r.maxShiftMs / 86400000).toFixed(1) +
      ' floating=' + r.floating + '/' + items.length + ' windowBlocked=' + r.windowBlocked +
      ' ms=' + r.ms +
      ' — judge-rule floating repaired within each element\'s own task window');
    return r;
  }

  // ══ §CPM_DISPLAY (2026-08-16, bim-compiler prompts/4D_SCHEDULE_ARCHITECTURE_REDESIGN.md
  // §STAGE4_RETIREMENT_PROPOSAL step 1) — the display timeline is authored by ONE dependency-DAG
  // forward pass (viewer/cpm_schedule.js: contact-graph support edges + host/opening + discipline +
  // storey hammocks + crew lower bound, SCC-condensed Kahn), replacing the retired _twoTierRemap +
  // _midairRepair repair chain at BOTH consumers of this one function (kernel_ops write + the
  // materializeZones displayRemap hook), so the movie, the Gantt windows, and the progress needle
  // describe the SAME schedule by construction — floating impossible instead of chased.
  // Measured fleet-wide before wiring (probe_cpm_schedule.js, all 7 buildings): floating 0/7,
  // storey order improves-or-matches RAW everywhere.
  // §S20 Part B (2026-08-17, 4D_GANTT_TM_REFACTOR.md) — the legacy chain this branch used to fall
  // back to (_twoTierRemap/_midairRepair/_tier1Serialize/_tierAuditRegate + their _tier1Extents/
  // _tier1Protrusion/_zoneOf/_TIER1_ORDER helpers) is DELETED: confirmed twice over this lane's
  // entire measured history (§S13.8 by reading, §S14.0 and every fleet run since by measurement)
  // that `§CPM_DISPLAY_FALLBACK` never fired live — CpmSchedule.run always succeeds. `?cpm4d=0`'s
  // fallback target no longer exists, so the URL-param lever is RETIRED (a flag that silently did
  // nothing, or worse referenced deleted code, is worse than no flag). `_CPM_DISPLAY` stays a named
  // variable (not inlined) rather than deleted outright: every witness/probe in this lane injects
  // its own `var _CPM_DISPLAY = true;` ahead of a sliced copy of this function (the established
  // convention for forcing the live branch in a sandbox with no `location` global) — keeping the
  // name means none of them need editing for this. The one truly exceptional path left (CpmSchedule
  // missing, or CpmSchedule.run failing — never once measured live) is a minimal explicit no-op +
  // loud console.error, not a silent revert to a chain that no longer exists.
  var _CPM_DISPLAY = true;
  function _displayTimeline(items) {
    // §CPM_DISPLAY_ONE_TRUTH: on a cold open the materializeZones hook computes FIRST
    // (§GANTT_PREMATERIALIZE) and the kernel_ops seam runs SECOND — measured live on Terminal
    // (2026-08-16): the two consumers' element recipes (schedule_author's vs this file's) produce
    // timelines 151.2d vs 121.2d, 36/72 windows duration-mismatched, §CROSSTASK floating 9. So:
    // whichever consumer computes first is THE schedule; the partner call of the same generation
    // cycle CONSUMES it here (one-shot — the next cycle recomputes fresh, so a rates/shift edit is
    // never served stale). Coverage is the fingerprint: a different building's guids miss.
    var _cache = _displayTimeline._last;
    if (_cache) {
      var _rh = 0, _rm = 0, _ri;
      for (_ri = 0; _ri < items.length; _ri++) { if (_cache.map[items[_ri].guid]) _rh++; else _rm++; }
      if (_rh > 0 && _rh >= 0.999 * (_rh + _rm)) {
        // §CPM_DISPLAY_EPOCH: the two consumers anchor computeSchedule differently (the hook at 0,
        // the seam at baseMs/_cap.base) — a verbatim replay would land ops in the wrong epoch
        // (1970 for any uncovered element). Rigid-shift the cached timeline so its earliest start
        // lands on the requester's own earliest RAW start: relative structure (the schedule) is
        // untouched, only the calendar anchor moves.
        var _reqMin = Infinity;
        for (_ri = 0; _ri < items.length; _ri++) if (items[_ri].s < _reqMin) _reqMin = items[_ri].s;
        var _delta = (isFinite(_reqMin) && isFinite(_cache.minS)) ? (_reqMin - _cache.minS) : 0;
        var _rstrag = {};
        for (_ri = 0; _ri < items.length; _ri++) {
          var _rc = _cache.map[items[_ri].guid];
          if (_rc) {
            items[_ri].s = _rc.start + _delta; items[_ri].e = _rc.end + _delta;
            if (_rc.str) _rstrag[items[_ri].guid] = 1;
          }
        }
        _displayTimeline._last = null;
        var _raud = _midairAudit(items);
        console.log('§CPM_DISPLAY_REUSE hits=' + _rh + ' misses=' + _rm + ' midair=' + _raud.midair +
          ' epochShiftDays=' + (_delta / 86400000).toFixed(1) +
          ' — this consumer replays the SAME timeline its partner authored (one truth, no second recipe)');
        return { cpm: 'reuse', midair: _raud.midair, stats: null, strag: _rstrag };
      }
    }
    if (_CPM_DISPLAY && typeof CpmSchedule !== 'undefined' && CpmSchedule.run) {
      // §S6_CREW_PASS (4D_GANTT_TM_REFACTOR.md §S2_REVIEW_VERDICT S6): hand the solve the SAME
      // per-resource crew caps computeSchedule runs on (max_crews_fixed wins over max_crews —
      // injectGantt's own §CREW_DEMAND rule), so precedence-displaced work is re-paced by real
      // crew capacity in-pass instead of landing simultaneously at the schedule tail.
      var _dtLR = (typeof window !== 'undefined' && window.LABOR_RATES) || {};
      var _dtMaxCrews = {};
      for (var _dtR in _dtLR) {
        if (_dtLR[_dtR].max_crews_fixed != null) _dtMaxCrews[_dtR] = _dtLR[_dtR].max_crews_fixed;
        else if (_dtLR[_dtR].max_crews) _dtMaxCrews[_dtR] = _dtLR[_dtR].max_crews;
      }
      var r = CpmSchedule.run(items, { maxCrews: _dtMaxCrews });
      if (r && r.ok) {
        for (var i = 0; i < items.length; i++) { items[i].s = r.solution.times[i].s; items[i].e = r.solution.times[i].e; }
        var aud = _midairAudit(items);
        _displayTimelineRemember(items, r.graph.stragglerOf);
        // §S51 item d (4D_GANTT_TM_REFACTOR.md §S51): when the CELL path authored this timeline,
        // remember each element's cell identity so injectGantt stamps it into the ops and the
        // Gantt groups bars BY CELL — the display reads the schedule's own grain instead of
        // re-deriving a coarser one. NOT one-shot (the partner consumer of the same generation
        // cycle replays via the REUSE branch above and still needs it); overwritten on every
        // fresh authoring, and set NULL on a GRAPH-path authoring so a building switch can never
        // leak one building's cells onto another's bars.
        if (r.gate && r.gate.cellKeys) {
          var _cm = {};
          for (var _cki = 0; _cki < items.length; _cki++) {
            var _ckp = String(r.gate.cellKeys[_cki]).split('\u0001');
            _cm[items[_cki].guid] = 'L' + _ckp[0] + '\u00b7T' + _ckp[1] + '\u00b7' + _ckp[2];
          }
          _displayTimeline._lastCell = { map: _cm, n: items.length };
        } else {
          _displayTimeline._lastCell = null;
        }
        console.log('§CPM_DISPLAY on — one-DAG schedule authored the display timeline' +
          ' midair=' + aud.midair + ' orphans=' + aud.orphans +
          ' stragglers=' + r.graph.counts.stragglers + ' (0 midair = nothing appears before what it touches)');
        var _cstrag = {};
        for (var _ci = 0; _ci < items.length; _ci++) if (r.graph.stragglerOf[_ci]) _cstrag[items[_ci].guid] = 1;
        return { cpm: true, midair: aud.midair, stats: r, strag: _cstrag };
      }
      console.error('§CPM_DISPLAY_FALLBACK CpmSchedule.run failed or unavailable — the legacy ' +
        'display-repair chain was retired (§S20 Part B, 2026-08-17); items left at their RAW ' +
        'computeSchedule times, unauthored (may show real hangings — this path has never fired live)');
    }
    _displayTimelineRemember(items, null);
    return { cpm: false, stats: null };
  }
  // §CPM_DISPLAY_ONE_TRUTH: the LAST computed display timeline, guid-keyed. materializeZones'
  // displayRemap hook serves THIS map when it covers the request — the kernel_ops movie and the
  // authored task windows then describe literally the same schedule, instead of two near-identical
  // recipes (time_machine's element build vs schedule_author's) re-deriving it 30 days apart
  // (measured live on Terminal, 2026-08-16: makespan 151.2d vs 121.2d, 36/72 task windows
  // duration-mismatched, §CROSSTASK_JUDGE_PARITY floating 9). Coverage is the fingerprint — a
  // different building's guids simply miss and fall through to the compute path.
  function _displayTimelineRemember(items, stragglerOf) {
    var map = {}, minS = Infinity;
    for (var i = 0; i < items.length; i++) {
      map[items[i].guid] = { start: items[i].s, end: items[i].e, str: stragglerOf ? stragglerOf[i] : 0 };
      if (items[i].s < minS) minS = items[i].s;
    }
    _displayTimeline._last = { map: map, n: items.length, minS: minS };
  }

  // §ZONE_DISPLAY_AUTHORING (2026-08-16, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
  // §CHASE_TO_ZERO_WINDOW_AUTHORING) — the displayRemap hook handed to ScheduleAuthor.materializeZones
  // by every real UI call site in this file. The Gantt's task windows used to be derived from the RAW
  // computeSchedule output while the movie plays the TWO-TIER DISPLAY timeline (_twoTierRemap +
  // _midairRepair) — two different schedules; measured live 2026-08-16 on Hospital: display span 420d
  // vs authored windows 334d, and the captured overlay manufactured 2211 order violations out of a
  // 0-floating kernel_ops input. This hook maps the raw schedule through the SAME two functions the
  // kernel_ops write path runs — one physics, no copy — so authored windows and the movie describe
  // ONE schedule. Probe §EXP7/§EXP8 (probe_captured_floating.js, browser-faithful pipeline):
  // Hospital floating 664 -> 63, window fidelity 97.03% -> 99.95%.
  // §S4_RAW_SCHEDULE_REUSE (2026-08-16, 4D_GANTT_TM_REFACTOR.md §MODEL M4 + §STAGES S4) — mirrors
  // the EXISTING §CPM_DISPLAY_ONE_TRUTH display-timeline cache (_displayTimeline._last) one level
  // earlier: the RAW crew-leveled schedule itself. On a cold open, materializeZones
  // (schedule_author.js) computes its OWN ScheduleGate.computeSchedule call FIRST
  // (§GANTT_PREMATERIALIZE) and hands it to THIS hook as `schedule` — injectGantt's own later
  // computeSchedule call (needed only to feed _sched into §SUPPORT_CHECK's auditFloating) is
  // measured dead work when this covers the same elements (§S4_ACTIVATION_TIMING: ~1.6s on
  // Hospital-63k). A NEW, additive, ONE-SHOT cache (cleared on consumption, same one-shot
  // discipline as _displayTimeline._last so a rates/shift edit is never served stale) — does not
  // touch computeSchedule's own body or the existing display-timeline reuse contract.
  var _rawScheduleRemember = null;   // { map: {guid:{start,end}}, n }

  // §TPL_WIRED (2026-08-26, bim-compiler prompts/4D_BAR_MODEL.md §19/§20) — the 4D programme
  // template, loaded ONCE and handed to every materializeZones call site in this file.
  //
  // WHY THIS EXISTS. viewer/rates/4D_template.json shipped 2026-08-25 (PR #1531-#1534) and
  // schedule_author.js's instantiateTemplate() has read it since — but NO production call site
  // ever passed `opts.template`, so the whole template path was dead code while every live
  // schedule came from deriveZones grouping the geometry solve after the fact. Four schedule
  // witnesses pass `template:` THEMSELVES, so the path was green and unreached at the same time
  // (4D_BAR_MODEL.md line 693: "No witness exercises the LIVE call sites").
  //
  // ROUTED THROUGH loadJsonWithOverrides so a Settings edit (json_4d_template) applies, exactly
  // as grid_drag.js does for json_grid_rules — one convention, not a second loader.
  //
  // NULL IS THE SAFE FALLBACK, BY CONSTRUCTION: materializeZones ignores an absent opts.template
  // and runs the legacy zone path byte-identically, so a fetch failure degrades to today's
  // behaviour instead of breaking generation.
  var _4dTemplate = null, _4dTemplateTried = false;
  async function _load4DTemplate() {
    if (_4dTemplateTried) return _4dTemplate;
    _4dTemplateTried = true;
    var url = 'rates/4D_template.json';
    try {
      _4dTemplate = (typeof window.loadJsonWithOverrides === 'function')
        ? await window.loadJsonWithOverrides(url, 'json_4d_template')
        : await fetch(url).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          });
      // published so schedule_author_ui.js's draft path uses the SAME template object — one
      // programme, not a second copy loaded on its own.
      try { window._4dTemplate = _4dTemplate; } catch (e) {}
      console.log('§TPL_WIRED loaded ' + url + ' v' +
        ((_4dTemplate && _4dTemplate.meta && _4dTemplate.meta.version) || '?') +
        ' phases=' + ((_4dTemplate && _4dTemplate.phases || []).length) +
        ' — the programme is AUTHORED; deriveZones no longer defines the phases');
    } catch (e) {
      _4dTemplate = null;
      console.warn('§TPL_WIRED_FAIL ' + e.message +
        ' — falling back to the legacy deriveZones path (byte-identical to pre-2026-08-26)');
    }
    return _4dTemplate;
  }

  // §FUTURE-5A A7 (attempted 2026-09-02, queue item B-3, REVERTED same day) — rates.js's
  // `var SHIFT_HOURS = 24` is hand-copied as a literal `24` fallback at 4 separate sites in this
  // file ("the shape that produced §GANTT_SHIFT_HOURS_DESYNC — one copy missed", §FUTURE-5A's own
  // words). Consolidating all 4 into one `_shiftHoursOrDefault()` helper was tried and REVERTED in
  // the same session as B1's STRUCT_MAX_SEQ revert, same root cause: `witness_gantt_native_generate.js`
  // slices `generateGanttSchedule` out of this file as raw source text and evals it in a sandbox
  // that only also includes `_tmBusyRecording`/`_tmEditLocked` — a call to a shared helper declared
  // elsewhere in this file is undefined in that sandbox (masked by a SECOND ReferenceError inside
  // the catch, `_tmEditExceptionRecover is not defined`, since that's ALSO not in the slice — the
  // real cause only surfaces by removing the outer catch and looking directly). Left as 4 literal
  // `(window.SHIFT_HOURS > 0) ? window.SHIFT_HOURS : 24` copies, unchanged. Before retrying this
  // consolidation, audit every `sliceFn`/`new Function` witness in `viewer/tests/` that slices ANY
  // of the 4 enclosing functions (grep for the pattern first, not just for SHIFT_HOURS).

  // §TUKEY_BOUND (4D_GANTT_TM_REFACTOR.md stage 2, 2026-08-17) — hoisted out of _tmDisplayRemap
  // (was a nested closure there) so buildGanttTasks() can share the SAME envelope math instead of
  // re-deriving its own. This is the proven, already-shipped, already-measured rule (Hospital
  // floating 664->63, window fidelity 97.03%->99.95% when this landed for §ZONE_WINDOW_DAGWINS_CLIP)
  // — uniform at every group size, no group-size branch, no cliff. Percentile convention matches
  // storeyOrderReport/§GANTT_GAP_CLAMP: sorted[Math.floor(n*p)], no interpolation.
  // §S53 (F3): the formula itself now lives in gantt_model.js — ONE envelope shared by the drawer's
  // bar spans, the display axis, and witness_midair_zero.js (which used to slice this function out
  // of this file BY SOURCE TEXT). This delegate keeps the in-file callers reading unchanged.
  function _tukeyBound(arr, lowSide) {
    return window.GanttModel.tukeyBound(arr, lowSide);
  }
  function _tmDisplayRemap(elements, schedule) {
    (function () {
      var map = {}, n = 0;
      elements.forEach(function (el) {
        var st = schedule[el.guid];
        if (st) { map[el.guid] = { start: st.start, end: st.end }; n++; }
      });
      _rawScheduleRemember = { map: map, n: n };
    })();
    var items = [];
    elements.forEach(function (el) {
      var st = schedule[el.guid]; if (!st) return;
      items.push({ guid: el.guid, s: st.start, e: st.end, bz: el.base_z, tz: el.top_z,
        x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1,
        cls: el.cls, seq: el.seq, phase: el.phase, storey: el.storey,
        resource: el.resource });   // §S6_CREW_PASS: the solve's in-pass crew pools key on this
    });
    if (!items.length) return null;
    _displayTimeline(items);   // §CPM_DISPLAY: same single source as the kernel_ops write path (times only)
    var out = {};
    // §ZONE_WINDOW_DAGWINS_CLIP (2026-08-16, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §MODEL M2 —
    // superseded the min/max-over-non-stragglers formula this tag originally shipped with; tag kept,
    // formula changed per M2's own instruction). A TASK BAR is the ROBUST ENVELOPE of ALL its
    // members' true times — Tukey fences (Q1-1.5*IQR .. Q3+1.5*IQR, clamped to actual min/max) over
    // member starts (low fence) and ends (high fence), the same outlier-statistic family as the
    // shipped per-task median-based §GANTT_GAP_CLAMP. CLASSIFICATION-FREE (no straggler graph lookup
    // needed) — right on BOTH Hospital-shaped (late-tail) and Terminal-shaped (straggler-mass)
    // buildings, where a fixed classification undercounted/overcounted depending on shape. For WINDOW
    // AUTHORING ONLY, every member's time is clamped into its group's fence so the bar shows the
    // group's own coherent mass; a genuine outlier still rides outside the resulting bar (never
    // hidden — §TIER_DAG_WINS doctrine unchanged) — deriveZones takes a plain min(start)/max(end)
    // over what this function returns, so clamping IS the mechanism that shapes the bar. The
    // movie/ops keep TRUE physics times (this map is window-authoring-only, per §ZONE_DISPLAY_AUTHORING
    // above — never fed back into `items`). Percentile convention matches storeyOrderReport /
    // §GANTT_GAP_CLAMP: sorted[Math.floor(n*p)], no interpolation.
    var _SGw = (typeof ScheduleGate !== 'undefined') ? ScheduleGate : null;
    var _gkOf = function (it) {
      return (it.phase || '_UNPHASED') + '||' + (_SGw && _SGw.collapsePhase ? _SGw.collapsePhase(it.storey) : (it.storey || ''));
    };
    var _groups = {};
    items.forEach(function (it) {
      var k = _gkOf(it), g = _groups[k] || (_groups[k] = { starts: [], ends: [] });
      g.starts.push(it.s); g.ends.push(it.e);
    });
    // §TUKEY_BOUND — hoisted to module scope (2026-08-17, 4D_GANTT_TM_REFACTOR.md stage 2) so
    // buildGanttTasks() shares this exact function instead of re-deriving it a third time.
    var _bar = {};
    Object.keys(_groups).forEach(function (k) {
      var g = _groups[k], lo = _tukeyBound(g.starts, true), hi = _tukeyBound(g.ends, false);
      _bar[k] = { lo: lo, hi: Math.max(hi, lo) };   // degenerate-group safety (n=1, zero IQR)
    });
    var _clamped = 0;
    items.forEach(function (it) {
      var b = _bar[_gkOf(it)], st = it.s, en = it.e;
      if (b) {
        var nst = Math.min(Math.max(st, b.lo), b.hi), nen = Math.min(Math.max(en, b.lo), b.hi);
        if (nen <= nst) { nst = Math.max(b.lo, b.hi - 60000); nen = b.hi; }
        if (nst !== st || nen !== en) _clamped++;
        st = nst; en = nen;
      }
      out[it.guid] = { start: st, end: en };
    });
    console.log('§ZONE_WINDOW_DAGWINS_CLIP clamped=' + _clamped +
      ' (Tukey-fenced group envelope, classification-free, for WINDOW AUTHORING ONLY — ops/movie keep true physics times)');
    return out;
  }

  // ══ §TM_REVEAL_TILED (2026-09-02, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §FUTURE item 2,
  // §TM_REVEAL_SHIPPED) — WHERE inside its bar each element PLAYS. ════════════════════════════
  // Witness: viewer/tests/witness_tm_reveal_within_bar.js (W-RWB). Probe: scripts/probe_tm_reveal_shipped.js.
  //
  // THE FINDING. materializeZones returns `displaySchedule` (= ScheduleAuthor.remapSolveToTasks:
  // support-layer bands, duration-weighted tiling — §TPL_MOVIE_BINDS_BARS "every element now plays
  // inside the bar that claims it") and this file never read it. The kernel_ops timestamps the
  // scrubber and the film actually play were written by injectGantt's _tmRescaleToTaskWindow: a
  // per-task AFFINE of the CPM group's raw [min,max] onto the template window. CpmSchedule's GLOBAL
  // per-resource crew pools give a task's members a raw span of up to 434 d for a 35-day bar
  // (Hospital TASK_MEP_Rough_in_Level_1), so the affine squashed the group's core into a sliver and
  // left the rest of the bar empty. Measured on the shipped chain (sliced live functions, no
  // browser): dead air (bar lit, NOTHING in progress) mean 44/63/63/71% of every bar on Duplex/HHS/
  // Hospital/Terminal, worst 99.9%; Hospital TASK_MEP_Final_Level_5 n=564 days=3 reveal deciles
  // [3.5,0,0,0,0,0,0,0,0,96.5]; 553 Hospital footings on 200 distinct instants inside the first
  // half of an 11-day bar, days 6-11 empty. User, 2026-09-02: "the sub structure and floor slabs
  // are appearing all one shot instead of nicer progressive animation."
  //
  // THE FIX. Call the verb the codebase already owns for this question (4D_MODEL_INTEGRITY.md §I
  // "where inside its task?") instead of re-deriving a layout here: remapSolveToTasks with the CPM
  // display times as the solve and NO layer map — one band per task, members in CPM start order
  // (ties on guid), each element's width its own CPM-duration share, tiled edge-to-edge across the
  // task's real window. Monotone, so every ordering CPM established survives — the exact property
  // the affine was chosen for (measured: 0 order violations over 119k adjacent pairs, 4 buildings);
  // no dead air by construction (measured 0.0% on all four); no number invented (widths are the
  // durations the solve computed, windows are the template's). §S50's cell order stays the live
  // precedence carrier — this changes SPACING, never order. Gated on schedules.display_authored=1
  // (our own authored windows — the same flag §CAP_RESCALE_SKIP/§OG_SWEEP_SKIP key on); imported/
  // captured/baselined schedules keep the affine byte-identically, as does any element this map
  // misses. Task windows, dates, crews, cost and the film cursor are untouched.
  //
  // WHAT IT DOES NOT DO, ON PURPOSE: a superstructure level's slab SET stays compact — _installSecs
  // prices every IfcSlab at a flat 823 s (0.8% of Hospital L3's labour) and the cell order lays a
  // level out trade-by-trade — both rulings, neither this function's to change (spec §D).
  function _tmTilePlayWithinTasks(disp, cap, displayAuthored) {
    if (!cap || !cap.win || !cap.guidTask) {
      console.log('§TM_REVEAL_TILED skip reason=no dated task windows (_cap null) — affine rescale kept');
      return null;
    }
    if (!displayAuthored) {
      console.log('§TM_REVEAL_TILED skip reason=schedule not display-authored (imported/captured/baselined windows) — affine rescale kept');
      return null;
    }
    // Resolved through `window` only — the same seam every real UI call site in this file uses for
    // ScheduleAuthor (buildTaskIndex, generateGanttSchedule); a witness sandbox supplies window.ScheduleAuthor.
    var SA = (typeof window !== 'undefined' && window.ScheduleAuthor) || null;
    if (!SA || typeof SA.remapSolveToTasks !== 'function') {
      console.log('§TM_REVEAL_TILED skip reason=ScheduleAuthor.remapSolveToTasks unavailable — affine rescale kept');
      return null;
    }
    var base = cap.base;
    if (!isFinite(base)) { base = Infinity; for (var k0 in cap.win) if (cap.win[k0].s < base) base = cap.win[k0].s; }
    var tasks = [], byTid = {}, skipped = 0;
    for (var g in cap.guidTask) {
      var tid = cap.guidTask[g], w = cap.win[tid];
      if (!w || !disp[g]) { skipped++; continue; }
      var t = byTid[tid];
      if (!t) { t = byTid[tid] = { id: tid, sDays: (w.s - base) / 86400000, eDays: (w.e - base) / 86400000, guids: [] }; tasks.push(t); }
      t.guids.push(g);
    }
    if (!tasks.length) {
      console.log('§TM_REVEAL_TILED skip reason=no element resolves to a dated task — affine rescale kept');
      return null;
    }
    var r = SA.remapSolveToTasks(disp, tasks, new Date(base).toISOString(), null);
    console.log('§TM_REVEAL_TILED tasks=' + tasks.length + ' mapped=' + r.mapped + ' skipped=' + skipped +
      ' degenerate=' + r.degenerateTasks +
      ' — each element plays its own CPM-duration share of its bar, CPM order kept, no dead air (was: per-task affine, §TM_ELEMENT_WINDOW_RESCALE)');
    return r.schedule;
  }

  // _twoTierRemap (retired §S20 Part B, 2026-08-17, 4D_GANTT_TM_REFACTOR.md) — the legacy
  // two-tier (Substructure/Superstructure/Architecture-serial, then audit-physics-regate) display
  // orchestrator. Reachable ONLY via _displayTimeline's now-deleted fallback branch — confirmed
  // twice this lane never reached it live (§S13.8 by reading, §S14.0 and every fleet run since by
  // measurement) before deleting it. Replaced fleet-wide by §CPM_DISPLAY's one-DAG forward pass
  // (viewer/cpm_schedule.js) — see _displayTimeline above.

  // ══ §MIDAIR_REPAIR — the one place the physical world is derived ═════════════════════════════
  // §S58: _contactGraph / _designatedSupport / _midairAudit moved VERBATIM to support_sweep.js,
  // with their full doctrine comments. These three wrappers are bare delegates — no log exists on
  // this path today and none was added. The names are FROZEN: witness_gantt_lock_integrity.js
  // gates on `function _midairAudit(` being present in this file, and _displayTimeline /
  // verifyGanttIntegrity resolve them as bare identifiers at run time.
  function _contactGraph(items) { return SupportSweep.contactGraph(items); }

  // _designatedSupport(items, G) — see support_sweep.js. PRECONDITION: G.ok === true.
  function _designatedSupport(items, G) { return SupportSweep.designatedSupport(items, G); }

  // _midairAudit(items) — the JUDGE. See support_sweep.js.
  function _midairAudit(items) { return SupportSweep.midairAudit(items); }

  // _midairRepair (retired §S20 Part B, 2026-08-17, 4D_GANTT_TM_REFACTOR.md) — the legacy
  // display-repair pass that used to run after _twoTierRemap. Replaced fleet-wide by §CPM_DISPLAY's
  // one-DAG forward pass (viewer/cpm_schedule.js), which guarantees 0 midair BY CONSTRUCTION
  // instead of chasing it after the fact — see _displayTimeline above. The doctrine this repair
  // enforced (the acceptance bar, contact definition, why-it-was-safe reasoning) is unchanged and
  // still documented once, above _contactGraph/_midairAudit (both KEPT — _midairAudit is still the
  // 🔓→🔒 lock-gate's judge, verifyGanttIntegrity).

  // §GANTT_LOCK_INTEGRITY (2026-08-07, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md) — the
  // lock-back verification core. Pure READ: rebuilds geometry via _buildXrayElements() (works on
  // the §GANTT_CACHE_HIT path too) and audits the CURRENT op times — the post-edit truth, whatever
  // the user dragged — with ScheduleGate.auditFloating, ALL classes, no filter (the §DEQ_V1 bar).
  // The check IS auditFloating: when §GEOMETRIC_SUPPORT_ORDER-class upgrades land in the gate
  // module, this hook strengthens automatically, no separate integration.
  // Returns { ok, floating, total, guids, ms, skipped? }. A state with nothing auditable (no
  // geometry / gate not loaded) verifies ok WITH the skip named — logged by the caller, never a
  // silent false pass.
  function verifyGanttIntegrity() {
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    function ms() { return Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0); }
    if (typeof ScheduleGate === 'undefined' || !ScheduleGate.auditFloating)
      return { ok: true, skipped: 'no_schedule_gate', floating: 0, total: 0, guids: [], ms: ms() };
    var els = _buildXrayElements();
    if (!els || !els.length) return { ok: true, skipped: 'no_geometry', floating: 0, total: 0, guids: [], ms: ms() };
    var sched = {};
    for (var i = 0; i < _ops.length; i++) {
      var o = _ops[i];
      var g = o.output_guid || (o.input_guids && o.input_guids.length && o.input_guids[0]);
      if (g) sched[g] = { start: o.timestamp, end: o.end_ts || o.timestamp };
    }
    // audit only elements that are scheduled AND have real geometry — §4D_NOGEO parked elements
    // (zero bbox at origin) can neither bear nor hang and sit at project end by design
    var audited = [];
    for (var j = 0; j < els.length; j++) {
      var e = els[j];
      if (!sched[e.guid]) continue;
      if (e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z) continue;
      audited.push(e);
    }
    if (!audited.length) return { ok: true, skipped: 'no_scheduled_geometry', floating: 0, midair: 0, total: 0, guids: [], ms: ms() };
    var guids = [];
    var n = ScheduleGate.auditFloating(audited, sched, null, guids);
    // §MIDAIR_REPAIR (2026-08-12) — the lock gate must judge by the SAME rule the generator
    // enforces, or a planner's drag can re-create exactly the hangings the generated film has none
    // of and the lock would still be granted: auditFloating's support pools (seq<=4 + promoted
    // slabs + walls) cannot see an element whose real neighbours are outside them, nor any
    // structure-pool member at all. Same _contactGraph, no mutation — REFUSING the lock is right
    // here, where a human made the change and can undo it, whereas the generator repairs silently.
    var mrItems = audited.map(function (e) {
      var t = sched[e.guid];
      return { guid: e.guid, s: t.start, e: t.end, bz: e.base_z, tz: e.top_z,
        x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1 };
    });
    var ma = _midairAudit(mrItems);
    // §S73 — the breach must name WHAT THE EDIT BROKE, not the first 20 offenders it happens to scan.
    // Two defects lived in the one line this replaces (`if (ma.midair && guids.length < 20) guids =
    // guids.concat(...)`):
    //   1. whenever auditFloating's own collector alone reached 20 — documented as normal on 4 of 7
    //      shipped buildings (Terminal 8, Clinic 1, JKR 81, LTU_AHouse 334) — the midair offenders
    //      were SILENTLY dropped, so a midair-caused breach listed only floating elements;
    //   2. even with room, the sample was scan-ordered, so it was dominated by the PRE-EXISTING tail
    //      the baseline already knew about, and the element the planner just dragged was usually
    //      absent. That is the operator-facing failure: "your edit broke physics — here are twenty
    //      guids you did not touch."
    // Fix: rank NEW offenders (absent from the lock baseline's own offender set) ahead of known ones,
    // keep floating-then-midair order inside each rank, then cap at the same 20. The full list is
    // returned as allGuids so captureLockBaseline can remember the set instead of just the counts.
    var allGuids = guids.concat(ma.guids || []);
    var baseSet = (_lockBaseline && _lockBaseline.guidSet) || null;
    var ranked = allGuids;
    if (baseSet) {
      var fresh = [], known = [];
      for (var ai = 0; ai < allGuids.length; ai++) (baseSet[allGuids[ai]] ? known : fresh).push(allGuids[ai]);
      ranked = fresh.concat(known);
    }
    guids = ranked.slice(0, 20);
    // §GANTT_LOCK_DELTA (2026-08-12) — the gate asks "did YOUR EDIT break physics", not "is the
    // generator perfect". Absolute zero was the wrong test and was already wrong before
    // §MIDAIR_REPAIR: measured pre-repair auditFloating on the shipped buildings was Terminal 8,
    // Clinic 1, JKR 81, LTU_AHouse 334 (the documented warn-only tails — co-planar framing, mutual
    // bearing, the §SUPPORT_CYCLE population), so `ok: n === 0` refused the lock on 4 of 7
    // buildings on a FRESHLY GENERATED, UNEDITED schedule. A planner could never re-lock there.
    // The reference is now the state captured when editing began (_lockBaseline, set on unlock):
    // a breach is an INCREASE in either measure. Both counts are still reported absolutely, so the
    // known tails stay visible instead of being defined away.
    var base = _lockBaseline || { floating: n, midair: ma.midair };
    return { ok: n <= base.floating && ma.midair <= base.midair,
      floating: n, midair: ma.midair, baseFloating: base.floating, baseMidair: base.midair,
      dFloating: n - base.floating, dMidair: ma.midair - base.midair,
      total: audited.length, guids: guids, allGuids: allGuids, ms: ms() };
  }

  // §GANTT_LOCK_DELTA — the physics state at the moment editing STARTED. Captured on 🔒→🔓 so the
  // lock-back comparison is against what the planner inherited, never against an ideal the shipped
  // generator does not reach on every building. Null ⇒ verifyGanttIntegrity self-references (any
  // first call is its own baseline), which is the safe direction: it can only refuse a WORSENING.
  var _lockBaseline = null;
  function captureLockBaseline() {
    var v = verifyGanttIntegrity();
    // §S73: remember WHICH elements were already offending, not just how many. That set is what lets
    // a later breach rank the newly-broken elements first — the ones the planner's edit is
    // responsible for — instead of burying them under the tail that was there all along.
    var gset = {};
    (v.allGuids || v.guids || []).forEach(function (g) { gset[g] = 1; });
    _lockBaseline = { floating: v.floating, midair: v.midair, guidSet: gset };
    console.log('§GANTT_LOCK_BASELINE floating=' + v.floating + ' midair=' + v.midair +
      ' total=' + v.total + ' ms=' + v.ms + ' (edit start — a lock is refused only on an INCREASE)');
    return _lockBaseline;
  }

  // ══════════════════════════════════════════════════════════════════
  // Z-DRIVEN CONSTRUCTION SCHEDULE
  // ══════════════════════════════════════════════════════════════════
  //
  // One abstract rule: lower Z finishes before higher Z starts.
  // Within same Z-band (storey): seq from SEQUENCE_RULES for phase order.
  // Same resource on same storey = sequential. Different resource = parallel.
  // Always re-inject on activate — never use stale cached ops.

  // §GANTT_REFOLD_HANG (2026-08-10, 4D_SCHEDULE_PERFECTION.md §GANTT_REFOLD_HANG handoff):
  // injectGantt()'s two hot loops froze the tab on Hospital (63,415 elements — live-confirmed:
  // the console stream stopped dead between §PHASE_OVERLAP_SUPPORT_GUARD's log and
  // §WRITE_LOOP_TIMING's, which never printed). Both loops are order-dependent (shared object
  // refs mutate .s/.e read by later elements) so they cannot be parallelized or reordered — but
  // chunking PRESERVES order: slicing them into _TM_CHUNK-sized batches with a macrotask yield
  // between batches changes nothing about the output, only returns control to the browser.
  // setTimeout(0), not rAF — must keep draining while the tab is backgrounded.
  var _TM_CHUNK = 2500;
  function _tmYield() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // §GANTT_REFOLD_HANG sync note (2026-08-12): the branch's extracted _ogSupportGuard was
  // superseded during the 26-commit drift by main's own _ogSupportSweep (witness-locked physics —
  // see §OG sections above); this sync keeps main's sweep untouched and lands ONLY the chunked
  // kernel_ops writer below (the measured §WRITE_LOOP_TIMING freeze) + the async call-site plumbing.
  async function _writeScheduledChunked(db, _allScheduled, _yieldFn) {
    if (_yieldFn === undefined) _yieldFn = _tmYield;
    var _wlT0 = performance.now();
    db.run('BEGIN');
    var _upd = db.prepare("UPDATE kernel_ops SET timestamp = ?, parameters = ? " +
      "WHERE op_type = 'ELEMENT_PLACE' AND output_guid = ?");
    for (var _wi = 0; _wi < _allScheduled.length; _wi++) {
      var item = _allScheduled[_wi];
      item.params._end_ts = item.e;
      item.params._captured = 1;
      item.params._task = item.task;
      _upd.run([item.s, JSON.stringify(item.params), item.guid]);
      if (_yieldFn && ((_wi + 1) % _TM_CHUNK === 0) && (_wi + 1) < _allScheduled.length) {
        db.run('COMMIT'); await _yieldFn(); db.run('BEGIN');
      }
    }
    _upd.free();
    console.log('§WRITE_LOOP_TIMING rows=' + _allScheduled.length + ' ms=' + (performance.now() - _wlT0).toFixed(1));
    db.run('COMMIT');
  }

  async function injectGantt() {
    var app = A();
    if (!app || !app.db) return false;
    var db = app.db;
    // §S4_ACTIVATION_TIMING (4D_GANTT_TM_REFACTOR.md §STAGES S4, measure-first per M4) — additive
    // profiling only, no behavior change. Bracket the phases inside the ~20s Hospital-63k activation
    // budget the diagnosis only partly itemized (§WRITE_LOOP_TIMING=7.19s + "computeSchedule+geo-
    // order ~1.5-2s", leaving ~11-12s unaccounted) so the real dominant cost can be MEASURED before
    // any call is skipped, per M4's own "measure per-chunk cost before touching" instruction.
    var _s4T0 = performance.now(), _s4Marks = [];
    function _s4Mark(label) { _s4Marks.push(label + '=' + (performance.now() - _s4T0).toFixed(0)); }

    db.run('CREATE TABLE IF NOT EXISTS kernel_ops (' +
      'id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL,' +
      'op_type TEXT NOT NULL, parameters TEXT NOT NULL,' +
      'input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0)');
    // §SE-7c: the T3 overlay pass below runs one UPDATE ... WHERE op_type=? AND output_guid=? PER
    // ELEMENT (up to 122K times on a large building) — with no index, each is a full table scan of
    // kernel_ops itself (also up to 122K rows), i.e. O(n^2). This index turns it into an indexed
    // lookup per UPDATE — the actual dominant cost behind "regenerate Time Machine after a schedule
    // change is slow" (materializeDefault's own writes were already fixed by §SE-5; this is a
    // DIFFERENT table/query, never indexed). IF NOT EXISTS — safe to re-run, no data change.
    db.run('CREATE INDEX IF NOT EXISTS idx_kernel_ops_guid ON kernel_ops(output_guid)');

    // ── T3 (§3.1): probe for a usable captured native IFC 4D schedule ──────────
    // If present + parseable, the generative timeline is rebased onto the real
    // project_start (baseMs below) and covered elements get their real task dates +
    // names (overlay at the end of this function). If absent/empty/unparseable,
    // _cap stays null → the generative path runs EXACTLY as before
    // (W-TM-FALLBACK regression guard — no behavioural change for no-4D buildings).
    var _cap = (function() {
      try {
        var tr = db.exec("SELECT task_id, name, schedule_start, schedule_finish FROM tasks " +
          "WHERE schedule_start IS NOT NULL AND schedule_finish IS NOT NULL " +
          "AND (is_summary IS NULL OR is_summary = 0)");
        if (!tr.length || !tr[0].values.length) return null;
        var win = {}, minS = Infinity, maxE = -Infinity, n = 0;
        tr[0].values.forEach(function(row) {
          var s = Date.parse(row[2]), e = Date.parse(row[3]);
          if (!isFinite(s) || !isFinite(e) || e < s) return;   // skip unparseable / inverted
          win[row[0]] = { s: s, e: e, name: row[1] || row[0] };
          if (s < minS) minS = s;
          if (e > maxE) maxE = e;
          n++;
        });
        if (!n) return null;                                    // no parseable dated leaf task
        // guid → task (earliest-starting task wins if an element links to several)
        var guidTask = {}, te = null;
        try { te = db.exec("SELECT task_id, guid FROM task_elements"); } catch(e) { te = null; }
        if (te && te.length && te[0].values.length) {
          te[0].values.forEach(function(row) {
            var tid = row[0], g = row[1];
            if (!win[tid]) return;                              // link points at summary/undated task
            if (!guidTask[g] || win[tid].s < win[guidTask[g]].s) guidTask[g] = tid;
          });
        }
        return { base: minS, projEnd: maxE, win: win, guidTask: guidTask, taskCount: n };
      } catch(e) { return null; }                               // no tasks table → fallback
    })();

    var SR = window.SEQUENCE_RULES || {};
    var LR = window.LABOR_RATES || {};
    var SD = window.SEQUENCE_DEFAULT || {phase:'Architecture',sequence:6,resource:null};
    var NO = window.SEQUENCE_NAME_OVERRIDES || [];  // §4D_FACADE_ORDER — see rates/sequence_rules.json

    // §4D_FACADE_ORDER: ifc_class alone cannot tell curtain-wall glazing/framing (IfcPlate/IfcMember)
    // from genuinely structural plates/members (e.g. Terminal's Metal Deck IfcPlate, seq 4 is correct
    // there) — name is the only extracted signal. Checked BEFORE the class lookup, never replacing it:
    // an element that matches no override keeps its plain class-default seq.
    // §SCHEDULE_CLASSIFY_DEDUP — same shared pair as _buildXrayElements above, see that comment.
    function matchNameOverride(cls, name) { return _classifyNameOverride(cls, name, NO); }
    function matchRule(cls, name) { return _classifyRule(cls, name, SR, SD, NO); }
    // §TM_DURATION_SYNC (viewer/schedule_author.js commit d35366a §LABOR_QUANTITY_WEIGHT): this used
    // to be a hand-duplicated copy of the per-unit-rate formula with NO fragmentation/area-weighting —
    // Terminal's 33,324 "Metal Deck" IfcPlate fragments (avg 0.074 m² each) each got a full per-element
    // labor charge, inflating the REAL-TIME PLAYBACK clock (via schedule_gate.js place()'s
    // installSecs*scaleFactor) even after schedule_author.js's WBS/Gantt dates were fixed to the
    // correct 111-day Superstructure. Now calls schedule_author.js's ScheduleAuthor._installSecs
    // (the SAME function materializeDefault/scheduleContiguous use) with the SAME realQty area-weight
    // (`_frag`, computed once per injectGantt() call below) — single source of truth, no second copy.
    var _frag = (function () {
      if (window.ScheduleAuthor && window.ScheduleAuthor._classFragmentation) {
        return window.ScheduleAuthor._classFragmentation(db, window.RATES || {});
      }
      console.warn('§TM_DURATION_SYNC_FALLBACK ScheduleAuthor not loaded — install-secs NOT area-weighted for fragmented classes');
      return { fragmented: {}, area: {} };
    })();
    // §HEAVY_MEMBER_SPEED_LIMIT sync (2026-08-04) — same gap as §TM_DURATION_SYNC above, found live:
    // this wrapper never passed the real-length weighting fix (schedule_author.js _installSecs 5th
    // arg) through, so the default/initial Time Machine timeline still charged every beam/column the
    // SAME flat duration regardless of real size, even though the "Generate first draft" wizard path
    // (schedule_author.js) already had it. Same single-source-of-truth call, just the missing param.
    var _lin = (function () {
      if (window.ScheduleAuthor && window.ScheduleAuthor._linearWeighting) {
        return window.ScheduleAuthor._linearWeighting(db, window.RATES || {});
      }
      return { avgLength: {}, length: {} };
    })();
    function getInstallSecs(cls, rule, guid, bx, by, bz) {
      rule = rule || matchRule(cls);
      var realQty = (_frag.fragmented[cls] && guid != null && _frag.area[guid] != null) ? _frag.area[guid] : null;
      var hasGeom = bx > 0 || by > 0 || bz > 0;
      var clsAvgLen = _lin.avgLength[cls];
      var lengthRatio = (realQty == null && hasGeom && clsAvgLen > 0) ? Math.max(bx, by, bz) / clsAvgLen : null;
      if (window.ScheduleAuthor && window.ScheduleAuthor._installSecs) {
        return window.ScheduleAuthor._installSecs(cls, rule, LR, realQty, lengthRatio);
      }
      // Fallback (ScheduleAuthor not loaded) — old per-element behavior, no area weighting.
      // §FUTURE-5A A1/B3 (applied 2026-09-02, queue item B-3): reads the SAME
      // LR._productivity_basis_secs / LR._zero_minute_floor_secs (sequence_rules.json) the primary
      // ScheduleAuthor._installSecs path above reads, literal-fallback identical to before this fix.
      var resource = rule.resource;
      var _floorSecs = LR._zero_minute_floor_secs || 120;
      if (!resource || !LR[resource]) return _floorSecs;
      var labor = LR[resource], bestPk = null, bestLen = 0;
      for (var pk in labor.productivity) {
        if (cls.indexOf(pk) >= 0 && pk.length > bestLen) { bestPk = pk; bestLen = pk.length; }
      }
      // §TPL_ZERO_MINUTE (§S65) — keep this fallback in step with ScheduleAuthor._installSecs'
      // default_productivity, or the two copies disagree the moment ScheduleAuthor fails to load.
      var prod = bestPk ? labor.productivity[bestPk] : (labor.default_productivity || 0);
      return prod > 0 ? Math.round((LR._productivity_basis_secs || 28800) / prod) : _floorSecs;
    }

    // Query elements with spatial Z
    var r;
    try {
      r = db.exec(
        'SELECT m.guid, m.ifc_class, m.element_name, m.storey, m.discipline, ' +
        'COALESCE(t.center_z, 0) as cz, COALESCE(t.bbox_z, 0) as bz, ' +
        'COALESCE(t.center_x, 0) as cx, COALESCE(t.center_y, 0) as cy, ' +
        'COALESCE(t.bbox_x, 0) as bx, COALESCE(t.bbox_y, 0) as by ' +
        'FROM elements_meta m ' +
        'LEFT JOIN element_transforms t ON t.guid = m.guid ' +
        "WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace' " +
        'ORDER BY cz, COALESCE(t.center_x, 0), COALESCE(t.center_y, 0)'
      );
    } catch(e) { console.log('§GANTT table error: ' + e.message); return false; }
    if (!r.length || !r[0].values.length) return false;
    _s4Mark('elemQuery');

    var totalDbElements = r[0].values.length;

    // ── Storey bands: group by storey name, rank by MEDIAN Z (bottom-up) ──
    // §S260c BUG5: Use median center_z per storey instead of min.
    // Min Z is unreliable — a column extending down from an upper storey gives it a low minZ,
    // causing upper elements to appear before lower storeys finish.
    // Median Z represents the typical floor level of that storey.
    // §ZONE_INDEX (2026-08-12) — was a second inline copy of the median-Z banding (see
    // _zoneIndexBuild). Same numbers, one owner, memoized across activations. The §GANTT
    // storey-bands line below is kept BYTE-IDENTICAL: it is part of W-ZONE's equivalence bar.
    var _zi = _zoneIndex();
    var storeyMedianZ = _zi ? _zi.medianZ : {};
    var storeyNames = _zi ? _zi.names : [];
    var storeyBand = _zi ? _zi.band : {};

    console.log('§GANTT storey-bands: ' + storeyNames.length + ' bands from storey names (median Z): ' +
      storeyNames.map(function(s, i) { return i + '="' + s + '" medZ=' + storeyMedianZ[s].toFixed(1); }).join(', '));

    // §STOREY-Z (2026-07-18 — mirrors build/room_walker.js's proven storeyZAnchors/_assignByZ
    // pattern, "HHS: all 716 vertical curtain children carry storey 'Unknown'; their z clusters
    // match Level 1/2/3 exactly"): elements with no real storey containment — a literal "Unknown"
    // IFC storey label, confirmed general across every building checked (Hospital 14.9%, HHS
    // 30.8%, Terminal 69.9%, Duplex 87%) — all shared ONE storey key, so the mini-Gantt drawer's
    // storey|phase grouping merged them into ONE bar spanning nearly the whole project, masking
    // the genuinely-cascading per-Level bars next to it ("still all at once" per prompts/
    // HOSPITAL_4D_SUPERSTRUCTURE_DURATION_ANOMALY.md Item 6). Reassign to the nearest REAL storey
    // by median Z — deterministic, uses only already-extracted Z data, nothing invented — so the
    // Gantt grouping, the storey-band ranking above, and the roof-slab override below all see the
    // corrected storey with zero further code changes downstream.
    var unknownReassigned = 0;
    function assignStoreyByZ(storey, cz) {
      // §ZONE_INDEX: the reassignment itself now lives in the shared index; the counter stays here
      // because §GANTT_STOREY_Z below reports what THIS pass reassigned, not what the index holds.
      if (storey !== '_UNKNOWN' && !/^unknown$/i.test(storey)) return storey;
      if (!_zi || !storeyNames.length) return storey;
      unknownReassigned++;
      return _zi.assign(storey, cz);
    }

    // ── Build elements with storey-aware overrides ──
    var nameOverrides = 0;
    var elements = r[0].values.map(function(row) {
      var cls = row[1], elName = row[2] || '', rawStorey = row[3] || '_UNKNOWN', cz = row[5] || 0, bz = row[6] || 0;
      var cx = row[7] || 0, cy = row[8] || 0, bx = row[9] || 0, by = row[10] || 0;
      var storey = assignStoreyByZ(rawStorey, cz);  // §STOREY-Z
      var ov = matchNameOverride(cls, elName);
      if (ov) nameOverrides++;
      var rule = ov || matchRule(cls);
      var seq = rule.sequence, phase = rule.phase;

      return {
        guid: row[0], cls: cls, name: elName, storey: storey,
        cz: cz, band: Math.floor(cz / 3),  // §S260e: Z-quantized band (3m = ~one floor)
        base_z: cz - bz / 2, top_z: cz + bz / 2,  // §gate: Z geometry (base = underside, top = where it tops out)
        x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2,  // §gate: XY footprint for the support gate
        seq: seq, phase: phase,
        resource: rule.resource || '_DEFAULT',
        installSecs: getInstallSecs(cls, rule, row[0], bx, by, bz),
        // §4D_NOGEO (2026-08-07, 4D_SCHEDULE_PERFECTION.md §4D_LAYER_TRUTH): no transform row —
        // COALESCE lands it at origin with a zero bbox. It cannot bear, hang, or be witnessed, and
        // at z=0 (metres below the building) geoGate finds nothing under it, so it scheduled at
        // day 0 AND dragged its whole zone's start there (user-witnessed: "walls before the
        // foundations" — 233 such elements on Hospital, §GANTT band 0 z=[0.0,0.0] Architecture:233).
        noGeo: (bx === 0 && by === 0 && bz === 0 && cx === 0 && cy === 0 && cz === 0)
      };
    });
    if (unknownReassigned) console.log('§GANTT_STOREY_Z reassigned=' + unknownReassigned + ' no-storey elements to nearest real storey by median Z');
    if (nameOverrides) console.log('§NAME_OVERRIDE ' + nameOverrides + ' elements reclassified by name (' +
      NO.map(function(o){ return o.id; }).join(',') + ') — see rates/sequence_rules.json NAME_OVERRIDES');

    // §GROUNDWORK_SLAB (4D_GANTT_TM_REFACTOR.md §S9 / M5) — ONE shared definition
    // (ScheduleGate.groundworkSlabs), applied by BOTH element recipes (schedule_author's
    // _buildScheduleElements applies the same call) so authored zones/tasks and this movie recipe
    // reclassify the SAME slabs: a slab-on-grade (bears on grade/piles/footings only, in the
    // building's lowest Superstructure band) is Substructure work — E3's phase chain then orders
    // plate-before-steel at its level with zero solver changes. seq/resource unchanged.
    if (typeof ScheduleGate !== 'undefined' && ScheduleGate.groundworkSlabs) {
      var _gw = ScheduleGate.groundworkSlabs(elements), _gwN = 0, _gwLevels = {};
      elements.forEach(function (el) {
        if (_gw[el.guid]) { el.phase = 'Substructure'; _gwN++; _gwLevels[el.storey || '_'] = 1; }
      });
      if (_gwN) console.log('§GROUNDWORK_SLAB recipe=time_machine n=' + _gwN +
        ' levels=' + JSON.stringify(Object.keys(_gwLevels)) +
        ' — slab-on-grade reclassified Substructure (bears on grade/piles/footings only, lowest Superstructure band)');
    }

    // §4D_ROOF_LOAD_PATH M1 + §4D_WALLS_BEFORE_ROOF M4 — roof/load-path promotion, shared
    // classifier (full doctrine comments live on _promoteRoofLoadPath above, moved there verbatim
    // when the two inline copies were consolidated 2026-08-10).
    var _lp = _promoteRoofLoadPath(elements);
    // §4D_ROOF_LOAD_PATH witness hook (double-underscore debug convention, same as __tmGanttShift):
    // witness_4d_roof_load_path G-RLP-2/3 read the promoted set here rather than from kernel_ops.
    // This hook was ADDED because the _cap path used to overwrite the ops' `phase` param with the
    // task NAME, hiding the promotion from kernel_ops; §GANTT_PHASE_CLOBBER (2026-08-12, ~:5238)
    // ends that clobber, so `phase` is honest in kernel_ops again — the hook stays because reading
    // the promoted set directly is still the cheaper, more direct assertion. Refreshed every run.
    window.__tmLoadPathPromoted = _lp.guids;
    if (_lp.total) console.log('§GANTT_OVERRIDE ' + _lp.total +
      ' slabs promoted to roof role (seq=8) by load path — base_z above the average midheight of their XY-overlapping walls' +
      ' (seed=' + _lp.seedCount + ' + M4 rooftop-appurtenance=' + _lp.m4Count + ')');

    // §S260e: Sort by actual Z (quantized to 3m bands) → seq → fine Z
    // Real construction: lower Z builds first regardless of storey name.
    // Within same Z band (~one floor height): seq order (columns→beams→slabs→walls→MEP).
    // This ensures pile caps at Z=-1 come before beams at Z=14, even if same storey name.
    elements.sort(function(a, b) {
      var aZband = Math.floor(a.cz / 3);
      var bZband = Math.floor(b.cz / 3);
      if (aZband !== bZband) return aZband - bZband;
      if (a.seq !== b.seq) return a.seq - b.seq;
      return a.cz - b.cz;
    });

    // Log band contents
    var bandCounts = {};
    elements.forEach(function(el) {
      if (!bandCounts[el.band]) bandCounts[el.band] = {n:0, minZ:el.cz, maxZ:el.cz, phases:{}};
      var bc = bandCounts[el.band];
      bc.n++;
      if (el.cz < bc.minZ) bc.minZ = el.cz;
      if (el.cz > bc.maxZ) bc.maxZ = el.cz;
      bc.phases[el.phase] = (bc.phases[el.phase] || 0) + 1;
    });
    for (var bk in bandCounts) {
      var bc = bandCounts[bk];
      var pp = [];
      for (var ph in bc.phases) pp.push(ph + ':' + bc.phases[ph]);
      console.log('§GANTT band ' + bk + ' z=[' + bc.minZ.toFixed(1) + ',' + bc.maxZ.toFixed(1) + '] ' +
        bc.n + ' elements: ' + pp.join(', '));
    }

    // ── Scale factor ──
    var totalSecs = 0;
    elements.forEach(function(el) { totalSecs += el.installSecs; });
    var rawMs = totalSecs * 1000;
    // Round the clock — 24/7 CALENDAR, no weekends, no holidays (unchanged ruling).
    // §ARCH_START_TEMPO / M1 (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md): the
    // 24/7 calendar never meant a 24-HOUR SHIFT, but this line assumed one — `rawDays` divided the
    // labour by a 24 h day while every second of it came from `28800/productivity`, i.e. an 8 h
    // crew-day (schedule_author.js _installSecs; its phase widths already divide by 28800*crews).
    // So the movie clock and the authored Gantt disagreed by exactly 24/8 on the same work.
    // schedule_gate.js now spends a crew's seconds inside an 8 h window per calendar day, so the
    // wall-clock day this project really needs is rawMs/SHIFT_MS — take the shift length FROM that
    // module (one owner, no second constant to drift).
    // COMPOSITION WITH scaleFactor, deliberately not compounding: scaleFactor exists only to inflate
    // a DEGENERATELY tiny project (<10 days) up to a watchable 10. Measuring rawDays on the capped
    // clock FIRST means the 3x the crew day already bought is counted before the <10 test — a
    // project that reaches 10 real days once its crews work 8 h/day gets scaleFactor 1, not a second
    // stretch on top. The 10-day floor is then in the same wall-clock unit as everything downstream.
    // §SHIFT_HOURS (2026-08-13, rates.js — user ruling: "24hr is our default, import and JSON
    // setting can import as we align to standard model"). schedule_gate.js's own default stays 8h
    // (so witnesses/probes that never pass shiftHours are untouched — see computeSchedule's header);
    // the REAL generation path reads rates.js's SHIFT_HOURS (default 24) and threads it through as
    // computeSchedule's 5th arg below, so the module actually runs the hours this project asked for.
    var fullDayMs = 24 * 3600000;
    var _shiftHours = (typeof window !== 'undefined' && window.SHIFT_HOURS > 0) ? window.SHIFT_HOURS : 24;
    var shiftMs = _shiftHours * 3600000;
    var rawDays = rawMs / shiftMs;
    var scaleFactor = rawDays < 10 ? (10 * shiftMs) / rawMs : 1;

    var projectDays = Math.max(10, Math.ceil(rawDays * scaleFactor));
    console.log('§CREW_DAY_CLOCK totalSecs=' + Math.round(totalSecs) + ' shiftH=' + (shiftMs / 3600000) +
      ' rawDays=' + rawDays.toFixed(1) + ' scale=' + scaleFactor.toFixed(2) + ' projectDays=' + projectDays +
      ' (was rawDays=' + (rawMs / fullDayMs).toFixed(1) + ' on the pre-M1 24h-shift clock)');
    var startDate = new Date();
    startDate.setDate(startDate.getDate() - projectDays);
    startDate.setHours(0, 0, 0, 0);
    // T3 §3.3: when a captured schedule exists, anchor the generated timeline onto the
    // REAL project_start so covered (real-date) and uncovered (generated) share one epoch.
    var baseMs = _cap ? _cap.base : startDate.getTime();

    // ── Schedule ──
    var resourceCursor = {};  // "resource|band" → next ms
    var count = 0;

    // §gate (2026-05-30): support-gate FALLBACK scheduler — REPLACES the old center-Z band gate
    // ("band N waits N-1") that floated beams over still-building tall columns (Hospital cols avg
    // 6.87m vs 3m bands → the band under a beam was often empty, so its gate found no support).
    // Each element is gated by the structure topping within ±TOL of its base_z. Pure logic lives in
    // schedule_gate.js (unit-tested: tests/test_schedule_gate.js → 0/1970 floating on real Hospital
    // geometry vs 1127/1970 before). Captured IFC 4D still OVERWRITES the covered subset VERBATIM in
    // the overlay pass below — this governs only the GENERATED fallback timing. No CPM/deps (planner's).
    // §CREW-CAP (2026-07-18): real-world crew count per trade — see schedule_gate.js header.
    // LABOR_RATES[resource].max_crews (rates.js / rates/sequence_rules.json), falls back to
    // schedule_gate.js's own MAX_CREWS_DEFAULT for any resource without an explicit value.
    // ── §CREW_DEMAND + §HR_COST (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
    // item 4 — Witness: viewer/tests/witness_crew_demand.js W-CREW) ───────────────────────────
    // User: "as each user imports own IFC set, the script gives them the max resource needed, and
    // when they edit it it can regenerate 4D anew" + "the 5D set per building will then reflect
    // the cost of HR used too."
    //
    // ⚠ WHAT THIS IS NOT: an auto-scaler. A first cut derived crews as
    // ceil(workDays(T)/projectDays) and MEASURED AS A NO-OP on all 7 buildings — projectDays is the
    // all-trade serial total (Hospital 1036, LTU 2329), so no single trade's work can exceed it and
    // the ceil is always 1, below every baseline. Worse, the premise behind wanting one was wrong:
    // MEP Rough-in's "130.8% occupancy" is a SINGLE-CREW-EQUIVALENT ratio (work-days ÷ window-days).
    // Exceeding 100% just means more than one crew is busy on average — which is the normal case.
    // The real check is capacity: MEP Rough-in draws on 3 trades x 2 crews over a 555-day window
    // = ~3,330 crew-days available against 725.9 needed. It is NOT crew-starved, and the shipped
    // table is not the small-job list it looked like. Reporting the numbers instead of "fixing"
    // something that measures fine.
    var _maxCrews = {};
    for (var _mcRes in LR) {
      if (LR[_mcRes].max_crews_fixed != null) _maxCrews[_mcRes] = LR[_mcRes].max_crews_fixed;
      else if (LR[_mcRes].max_crews) _maxCrews[_mcRes] = LR[_mcRes].max_crews;
    }
    // Per-trade labour content, straight from the installSecs the scheduler itself uses
    // (28800s = the 8h crew-day getInstallSecs divides by). §FUTURE-5A A1 (applied 2026-09-02,
    // queue item B-3): reads sequence_rules.json LR._productivity_basis_secs, same 28800 fallback.
    var _crewWorkDays = {};
    var _hrCostBasisSecs = LR._productivity_basis_secs || 28800;
    elements.forEach(function (el) {
      var _r = el.resource || '_DEFAULT';
      _crewWorkDays[_r] = (_crewWorkDays[_r] || 0) + (el.installSecs || 0) / _hrCostBasisSecs;
    });
    // §CREW_DEMAND — "the max resource needed", reported per trade so a user can see what to edit.
    // capacity = crews x projectDays crew-days; utilisation = demand / capacity. A trade over 100%
    // genuinely cannot fit and wants more crews; everything under is headroom.
    // §ARCH_START_TEMPO / M1: this ratio is only now dimensionally honest. demand is crew-days
    // (installSecs/28800 = 8 h each) while projectDays used to be counted on a 24-h clock, so ONE
    // calendar day was silently worth THREE crew-days of capacity and every utilisation printed here
    // was overstated ~3x. Same formula, same inputs — projectDays is now wall-clock days at the same
    // 8 h shift the demand is quoted in, so a trade's % is comparable to its real crew count.
    var _cdLog = [];
    for (var _cd in _crewWorkDays) {
      var _cdr = LR[_cd]; if (!_cdr) continue;
      var _crews = _maxCrews[_cd] || 1;
      // §CAP_SHADOW_FIX (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
      // §HOSPITAL_LIGHTING_STILL_FLOATING): this used to be `var _cap = _crews * projectDays`. `var`
      // is function-scoped, and injectGantt() ALSO declares `_cap` (the captured-native-schedule
      // descriptor object) earlier at this function's top — same name, same scope, so this line
      // silently clobbered it with a number on every run. The overlay 250 lines below then threw
      // `_cap.guidTask[g]` on a NUMBER, on the FIRST covered guid, every time — caught by injectGantt's
      // own outer .catch (§GANTT_CACHE_ERR), invisible unless you read the log. Renamed so the two
      // never collide again.
      var _capacityCd = _crews * projectDays;
      _cdLog.push(_cd + ' demand=' + _crewWorkDays[_cd].toFixed(1) + 'cd crews=' + _crews +
        (_cdr.max_crews_fixed != null ? '(FIXED)' : '') +
        ' capacity=' + _capacityCd.toFixed(0) + 'cd util=' + (_capacityCd ? (100 * _crewWorkDays[_cd] / _capacityCd).toFixed(1) : '?') + '%');
    }
    console.log('§CREW_DEMAND projectDays=' + projectDays + ' — ' + _cdLog.join(' | ') +
      ' (util>100% = that trade cannot fit and wants more crews; set max_crews_fixed in ' +
      'rates/sequence_rules.json and regenerate to apply an edit)');

    // §HR_COST (5D) — the labour the schedule commits, per trade. personDays = crew-days x
    // crew_size (a 6-hand gang spends 6 person-days per crew-day); cost = personDays x rate_per_day.
    // ⚠ Reading note that matters for 5D: crew COUNT does not change this total — the same labour
    // content done by more hands in less time. Crews change WHEN the cost lands, not how much.
    // That time-phasing is what makes it 5D rather than a bill of quantities.
    var _hrTotal = 0, _hrPD = 0, _hrLog = [];
    for (var _hr in _crewWorkDays) {
      var _hrR = LR[_hr]; if (!_hrR || !_hrR.rate_per_day) continue;
      var _pd = _crewWorkDays[_hr] * (_hrR.crew_size || 1);
      var _cost = _pd * _hrR.rate_per_day;
      _hrTotal += _cost; _hrPD += _pd;
      _hrLog.push(_hr + ' personDays=' + _pd.toFixed(1) + ' @' + _hrR.rate_per_day + '/d = ' + Math.round(_cost));
    }
    // §HR_COST_EXPOSE (2026-08-30) — additive, read-only. §CPE_BIG_STATS wants the 5D headline for
    // a client-facing card, and the only honest source is the number this block already computed.
    // Re-deriving cost in the panel would be a second opinion about the schedule's own labour
    // content, which this file's header forbids.
    A()._hrCost = { total: Math.round(_hrTotal), personDays: +_hrPD.toFixed(1), trades: _hrLog.length };
    console.log('§HR_COST total=' + Math.round(_hrTotal) + ' personDays=' + _hrPD.toFixed(1) +
      ' across ' + _hrLog.length + ' trades — ' + _hrLog.join(' | ') +
      ' (crew count changes WHEN this lands, not the total)');

    // §4D_NOGEO: geometry-less elements are EXCLUDED from the support-gated schedule (they poison
    // it at day 0) and parked at the project end below — present in the movie's totals, never in
    // its physics.
    var _geoElements = elements.filter(function (el) { return !el.noGeo; });
    var _noGeoN = elements.length - _geoElements.length;
    // §S4_RAW_SCHEDULE_REUSE: if the materializeZones hook already computed this same element set's
    // raw schedule earlier in this generation cycle (cold-open ordering — §GANTT_PREMATERIALIZE
    // runs before injectGantt), reuse it instead of recomputing computeSchedule a second time.
    // Coverage-checked exactly like §CPM_DISPLAY_ONE_TRUTH's own reuse test (>=99.9% guid hit rate)
    // so a different building's stale cache can never be mistaken for a match. Falls through to a
    // real computeSchedule call, byte-identical to pre-S4 behavior, on any miss.
    var _sched = null, _rawHits = 0, _rawMisses = 0;
    if (_rawScheduleRemember && _rawScheduleRemember.n > 0) {
      for (var _rgi = 0; _rgi < _geoElements.length; _rgi++) {
        if (_rawScheduleRemember.map[_geoElements[_rgi].guid]) _rawHits++; else _rawMisses++;
      }
      if (_rawHits > 0 && _rawHits >= 0.999 * (_rawHits + _rawMisses)) {
        _sched = _rawScheduleRemember.map;
        console.log('§S4_RAW_SCHEDULE_REUSE hits=' + _rawHits + ' misses=' + _rawMisses +
          ' — skipped a second computeSchedule call (materializeZones already computed this raw schedule)');
      }
      _rawScheduleRemember = null;   // one-shot, same discipline as _displayTimeline._last
    }
    if (!_sched) {
      _sched = (typeof ScheduleGate !== 'undefined' && ScheduleGate.computeSchedule)
        ? ScheduleGate.computeSchedule(_geoElements, baseMs, scaleFactor, _maxCrews, _shiftHours) : null;
    }
    if (!_sched) { console.warn('§SUPPORT_CHECK ScheduleGate.js not loaded — generated 4D aborted'); return false; }
    _s4Mark('computeSchedule');
    // §TIER_SERIAL (2026-08-11): the DISPLAYED timeline is the two-tier remap of computeSchedule's
    // output — backbone phases strictly serial, everything else one support-gated concurrent pool
    // (full doctrine on _twoTierRemap above). _sched itself stays RAW: §SUPPORT_CHECK/§ROOF_GATE
    // below keep auditing the generative layer's proven truth (floating baselines byte-identical);
    // the kernel_ops written from _disp are what the movie/Gantt/X-ray judge consume.
    var _twItems = _geoElements.map(function (el) {
      var _ts = _sched[el.guid];
      return { guid: el.guid, s: _ts ? _ts.start : baseMs, e: _ts ? _ts.end : baseMs + 60000,
        bz: el.base_z, tz: el.top_z, x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1,
        cls: el.cls, seq: el.seq, phase: el.phase,
        storey: el.storey,   // §TIER_SERIAL_BY_ZONE: the §ZONE_INDEX band, already median-Z repaired
        resource: el.resource };   // §S6_CREW_PASS: the solve's in-pass crew pools key on this
    });
    var _twStats = _displayTimeline(_twItems).stats;   // §CPM_DISPLAY (or legacy §TIER_SERIAL+§MIDAIR_REPAIR via ?cpm4d=0)
    _s4Mark('displayTimeline');
    var _disp = {};
    _twItems.forEach(function (it) { _disp[it.guid] = { start: it.s, end: it.e }; });
    var _schedEnd = baseMs;
    for (var _sg in _disp) if (_disp[_sg].end > _schedEnd) _schedEnd = _disp[_sg].end;
    if (_noGeoN) console.log('§4D_NOGEO parked=' + _noGeoN + ' at project end (no transform/zero bbox — cannot bear, hang, or be witnessed)');

    // §S51 item d — cell identity for the Gantt: stamped into each op so buildGanttTasks groups
    // bars by CELL on cell-path buildings (GRAPH-path authoring set _lastCell = null above, so
    // those buildings' ops carry no stamp and group exactly as before). Coverage-checked the same
    // way as _displayTimeline._last: a different building's guids miss and the stamp is skipped.
    var _cellMap = null;
    if (_displayTimeline._lastCell && _displayTimeline._lastCell.map) {
      var _chit = 0, _cmiss = 0, _cmap0 = _displayTimeline._lastCell.map;
      _twItems.forEach(function (it) { if (_cmap0[it.guid]) _chit++; else _cmiss++; });
      if (_chit > 0 && _chit >= 0.999 * (_chit + _cmiss)) _cellMap = _cmap0;
      console.log('§S51_CELL_STAMP coverage=' + _chit + '/' + (_chit + _cmiss) +
        ' stamping=' + (_cellMap ? 'YES — bars group by cell' : 'NO — coverage below 99.9%, bars stay storey|phase this generation'));
    }
    // §TM_ELEMENT_WINDOW_BIND (2026-08-25, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md "Two clocks"
    // recurring bug class) — `_disp[el.guid]` comes from CpmSchedule.run(), a pure relative CPM
    // solver with NO epoch concept anywhere in cpm_schedule.js. `_cap.win[taskId]` is the one thing
    // in this whole function already proven real (Date.parse() on the REAL tasks.schedule_start/
    // finish, verified on 5 buildings, WITNESS_INTERFACE_FRAMEWORK.md §3/§6/§9).
    //
    // §TM_ELEMENT_WINDOW_RESCALE (2026-08-25, same day, real regression found live and fixed within
    // the hour): the FIRST cut of this fix (a hard per-element Math.min/max clamp) fixed the epoch
    // but broke the DISTRIBUTION — every element's raw time was near-1970, so ALL 6880 clamped to the
    // exact same boundary instant, producing a NEW pile-up (§GANTT_OPS_FIRST20 showed 18 identical
    // "Level 1|seq=5|IfcBuildingElementProxy" entries in a row; §CROSSTASK_JUDGE_PARITY floating
    // jumped 14->89, all windowBlocked=89, because nothing had room to move). The witness that
    // shipped with the hard clamp (witness_tm_element_window_bind.js) only asserted "inside the
    // window" — true the whole time — and never checked spread, so it stayed green through the
    // regression. Real lesson, not just a code fix: a bounds check is not a distribution check.
    //
    // The fix: a per-task PROPORTIONAL RESCALE, not a per-element clamp. Group every element by its
    // real task, find that group's own RAW min/max (whatever CpmSchedule.run actually computed —
    // real order, wrong epoch), then affine-map that raw range onto the task's REAL window. Relative
    // order and spacing survive; only the epoch and scale change. Elements with no resolvable real
    // task keep prior behavior unchanged — nothing invented.
    var _winGroups = {};
    if (_cap) {
      elements.forEach(function(el) {
        var s = _disp[el.guid] || { start: _schedEnd, end: _schedEnd + 60000 };
        var taskId = _cap.guidTask[el.guid];
        if (taskId == null || !_cap.win[taskId]) return;
        var g = _winGroups[taskId] || (_winGroups[taskId] = { min: Infinity, max: -Infinity });
        if (s.start < g.min) g.min = s.start;
        if (s.end > g.max) g.max = s.end;
      });
    }
    // §TM_REVEAL_TILED — same DB flag §CAP_RESCALE_SKIP / §OG_SWEEP_SKIP key on (display_authored=1:
    // the windows are our own authored ones), read HERE because the tiling decides WHERE inside its
    // bar each element is written, i.e. before the write loop, not in the overlay pass after it.
    var _playDisplayAuthored = false;
    try {
      var _pdaR = db.exec('SELECT 1 FROM schedules WHERE display_authored=1 LIMIT 1');
      _playDisplayAuthored = !!(_pdaR.length && _pdaR[0].values.length);
    } catch (ePda) { /* legacy DB without the column — affine rescale stays */ }
    var _tiledPlay = _tmTilePlayWithinTasks(_disp, _cap, _playDisplayAuthored);
    function _tmRescaleToTaskWindow(guid, s) {
      // §TM_REVEAL_TILED — the tiled interval wins when one exists (see _tmTilePlayWithinTasks).
      // Everything below is the affine fallback, byte-identical for every element and every
      // schedule the tiling does not cover (imported/captured/baselined windows, unmapped guids).
      if (_tiledPlay && _tiledPlay[guid]) {
        var _tp = _tiledPlay[guid];
        return { start: _tp.start, end: _tp.end, clamped: true, tiled: true };
      }
      if (!_cap) return s;
      var taskId = _cap.guidTask[guid];
      var win = (taskId != null) ? _cap.win[taskId] : null;
      if (!win) return s;
      var g = _winGroups[taskId];
      if (!g || !isFinite(g.min) || !isFinite(g.max)) return s;
      var rawSpan = Math.max(1, g.max - g.min);
      var realSpan = Math.max(1, win.e - win.s);
      var scale = realSpan / rawSpan;
      var st = win.s + (s.start - g.min) * scale;
      var en = win.s + (s.end - g.min) * scale;
      // Final safety clamp — the affine map lands inside [win.s, win.e] by construction except for
      // float rounding at the extremes; same degenerate-window guard as before if start/end collapse.
      st = Math.min(Math.max(st, win.s), win.e);
      en = Math.min(Math.max(en, win.s), win.e);
      if (en <= st) { st = Math.max(win.s, win.e - 60000); en = win.e; }
      if (st === s.start && en === s.end) return s;
      return { start: st, end: en, clamped: true };
    }
    // §S280h: ONE transaction + prepared statement (batched INSERTs — avoids the multi-second freeze).
    db.run('BEGIN');
    var _gStmt = db.prepare('INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES(?,?,?,?,?,0)');
    var _projEnd = baseMs;
    var _windowClamped = 0, _windowUncovered = 0, _windowTiled = 0;   // §TM_REVEAL_TILED: tiled ⊂ clamped
    elements.forEach(function(el) {
      var s = _disp[el.guid] || { start: _schedEnd, end: _schedEnd + 60000 };   // §4D_NOGEO park at the DISPLAY end (§TIER_SERIAL), was baseMs (day 0)
      var bound = _tmRescaleToTaskWindow(el.guid, s);
      if (bound.clamped) _windowClamped++; else if (!_cap || _cap.guidTask[el.guid] == null) _windowUncovered++;
      if (bound.tiled) _windowTiled++;   // §TM_REVEAL_TILED
      s = bound;
      _gStmt.run([s.start, 'ELEMENT_PLACE',
         JSON.stringify({phase:el.phase, cls:el.cls, name:el.name, storey:el.storey,
           resource:el.resource, _end_ts:s.end, _genVersion:_GANTT_CACHE_VERSION,
           _cell: _cellMap ? _cellMap[el.guid] : undefined}),
         JSON.stringify([el.guid]), el.guid]);
      count++;
      if (s.end > _projEnd) _projEnd = s.end;
    });
    _gStmt.free();
    console.log('§TM_ELEMENT_WINDOW_BIND total=' + elements.length + ' clamped=' + _windowClamped +
      ' tiled=' + _windowTiled + ' uncovered=' + _windowUncovered +
      ' (tiled = §TM_REVEAL_TILED laid it out inside its bar; clamped-not-tiled = affine fallback; uncovered = no resolvable real task window, prior behavior kept)');
    _s4Mark('insertLoop');
    db.run('COMMIT');
    resourceCursor['_end'] = _projEnd;   // feed the endDate computation below (Math.max over values)

    // §SUPPORT_CHECK: independent XY-aware audit — NOTHING may start before its physical support
    // (bearing-below OR the carrier it hangs from) finishes. 0 ⇒ nothing floats. Pre-fix (Hospital):
    // 84 beams + 765 members floated (Z-only) and 133 furniture + 1980 flow + 1156 walls (ε=0.5
    // skipped the slab they sit on). Two-pass + ε=0.05 → 0.
    // §DEQ_V1 (2026-08-07, 4D_SCHEDULE_PERFECTION.md §DEQ_V1_IMPL #5): filter is ALL classes now —
    // the old hand-picked list (Beam/Member/Slab/'Furni'/'Wall') silently excluded every MEP/flow
    // class, so this line printed floating=0 while fans hung mid-air unaudited.
    var _auditN = _geoElements.length;
    // §SUPPORT_UNCHECKED collector — 4D_SCHEDULE_PERFECTION.md §SPEC 2026-08-11 1a (warn-only):
    // big elements (bbox vol > ScheduleGate.BIG_ELEMENT_VOL, measured p95) that the audit found
    // ZERO support candidates for — previously silent false-pass. Floating count/gating unchanged.
    var _unchecked = [];
    var _float = ScheduleGate.auditFloating(_geoElements, _sched, null, null, _unchecked);
    _s4Mark('supportCheck');
    console.log('§SUPPORT_CHECK floating=' + _float + '/' + _auditN + ' (ALL classes, bearing-below + hang-carrier) gated=' + elements.length + ' (0=solved)');
    console.log('§SUPPORT_UNCHECKED_SUMMARY n=' + _unchecked.length + '/' + _auditN +
      ' bigVol>' + (ScheduleGate.BIG_ELEMENT_VOL || 1.556) + 'm³ zero-candidate' +
      ' buildingModelsSubstructure=' + (_unchecked.length ? _unchecked[0].buildingModelsSubstructure
        : _geoElements.some(function (e) { return e.seq === 1; })) +
      ' (warn-only — reported not gated, see §SPEC 2026-08-11 1a)');

    // §4D_WALLS_BEFORE_ROOF M6 (2026-08-01, prompts/GANTT_ACCURACY.md §4D_WALLS_BEFORE_ROOF) — stop
    // the instrument from lying. §SUPPORT_CHECK above offers its wall pool ONLY to slabs the load-
    // path rule already promoted (seq>4), so a roof it FAILED to promote reads floating=0 exactly as
    // if nothing were wrong — that is #1120's `⚠ LIMIT 1`, and it is why "roof before walls" survived
    // a merge that reported floating=0/10979 on the very run the user was complaining about (24 of
    // 35 Hospital slabs started ~290 days before the walls carrying them, and the only instrument
    // said solved). This line is ROLE-BLIND: it counts, for EVERY IfcSlab regardless of seq, whether
    // it starts before the XY-overlapping walls that carry it finish.
    //   roofSlabs half  = a GATE. Must be 0. A roof-role slab that starts before its carriers is the
    //                     defect this section exists to kill.
    //   otherSlabs half = a MEASUREMENT, NOT a gate. An ordinary intermediate floor legitimately
    //                     precedes the partitions beneath it in a frame-first concrete schedule —
    //                     gating on it is #1120's measured-and-rejected "attempt 2" (24 false
    //                     positives). Printing it is what makes LIMIT 1 auditable instead of hidden.
    try {
      // §I.5b (bim-compiler prompts/4D_MODEL_INTEGRITY.md, §FUTURE item 7 Stage 5, queue item B-2)
      // — EPS/GAP now read from the module they belong to, in the SAME defensive `||` shape CELL and
      // BIG_ELEMENT_VOL already use two lines apart. schedule_gate.js:1298-1300 exports them with an
      // explicit reason ("a second copy is a second thing to drift"); this statement obeyed it for
      // CELL and hand-typed the other two. Nothing changes today — all three literals equal their
      // source — but a one-line change to GAP now moves this site with the rest of them.
      var _rgCELL = (ScheduleGate.CELL || 4), _rgEPS = (ScheduleGate.EPS || 0.05), _rgGAP = (ScheduleGate.GAP || 0.5);
      // §SPEC 2026-08-11 1b (4D_SCHEDULE_PERFECTION.md, Witness: witness_big_element_support_
      // coverage.js): widen the audited pool beyond IfcSlab — EVERY element above the measured p95
      // bbox volume (ScheduleGate.BIG_ELEMENT_VOL = 1.556 m³, extracted 2026-08-11) is also audited
      // against the walls carrying it, independent of class or promotion status — the load-path
      // classifier's known depth-1 false negatives become visible here instead of reading clean.
      // REPORTED, NOT GATED (own counter pair; existing roofSlabs gate + otherSlabs measurement
      // byte-identical). 1c: Substructure (seq===1) exempt — rests on unmodeled soil.
      var _rgBIGVOL = (ScheduleGate.BIG_ELEMENT_VOL || 1.556);
      var _rgGrid = {}, _rgSlabs = [], _rgBig = [];
      for (var _rgi = 0; _rgi < elements.length; _rgi++) {
        var _e = elements[_rgi];
        if (_e.cls !== 'IfcSlab' && _e.seq !== 1 &&
            (_e.x1 - _e.x0) * (_e.y1 - _e.y0) * (_e.top_z - _e.base_z) > _rgBIGVOL) _rgBig.push(_e);
        if (_e.cls === 'IfcSlab') { _rgSlabs.push(_e); continue; }
        if (_e.cls.indexOf('IfcWall') !== 0) continue;
        for (var _gx = Math.floor(_e.x0 / _rgCELL); _gx <= Math.floor(_e.x1 / _rgCELL); _gx++)
          for (var _gy = Math.floor(_e.y0 / _rgCELL); _gy <= Math.floor(_e.y1 / _rgCELL); _gy++)
            (_rgGrid[_gx + ',' + _gy] = _rgGrid[_gx + ',' + _gy] || []).push(_e);
      }
      var _rgRoofN = 0, _rgRoofLate = 0, _rgOtherN = 0, _rgOtherLate = 0, _rgBigN = 0, _rgBigLate = 0;
      // shared wall-carrier scan — slabs and 1b's big elements are tested against the SAME physics
      var _rgLateVsWalls = function(S) {
        var sc = _sched[S.guid]; if (!sc) return null;
        var maxEnd = 0, seen = {};
        for (var gx = Math.floor(S.x0 / _rgCELL); gx <= Math.floor(S.x1 / _rgCELL); gx++)
          for (var gy = Math.floor(S.y0 / _rgCELL); gy <= Math.floor(S.y1 / _rgCELL); gy++) {
            var arr = _rgGrid[gx + ',' + gy]; if (!arr) continue;
            for (var wi = 0; wi < arr.length; wi++) {
              var W = arr[wi]; if (seen[W.guid]) continue; seen[W.guid] = 1;
              if (W.base_z < S.base_z - _rgEPS && W.top_z >= S.base_z - _rgGAP &&
                  S.x0 <= W.x1 && S.x1 >= W.x0 && S.y0 <= W.y1 && S.y1 >= W.y0) {
                var we = _sched[W.guid]; if (we && we.end > maxEnd) maxEnd = we.end;
              }
            }
          }
        return (maxEnd > 0 && sc.start < maxEnd - 1);
      };
      _rgSlabs.forEach(function(S) {
        var late = _rgLateVsWalls(S); if (late === null) return;
        if (S.seq > 4) { _rgRoofN++; if (late) _rgRoofLate++; }
        else { _rgOtherN++; if (late) _rgOtherLate++; }
      });
      _rgBig.forEach(function(S) {
        var late = _rgLateVsWalls(S); if (late === null) return;
        _rgBigN++; if (late) _rgBigLate++;
      });
      console.log('§ROOF_GATE roofSlabs=' + _rgRoofN + ' lateVsWallCarriers=' + _rgRoofLate +
        ' (0=required) | otherSlabs=' + _rgOtherN + ' lateVsWallCarriers=' + _rgOtherLate +
        ' (frame-first, expected — reported not gated, see GANTT_ACCURACY.md LIMIT 1)' +
        ' | bigElems=' + _rgBigN + ' lateVsWallCarriers=' + _rgBigLate +
        ' (>' + _rgBIGVOL + 'm³ p95, non-slab non-Substructure — reported not gated, §SPEC 2026-08-11 1b)');
    } catch (e) { console.log('§ROOF_GATE error: ' + e.message); }
    // §4D_ROOF_LOAD_PATH witness hook (2026-08-01) — same double-underscore debug convention as
    // __tmTrav/__forceFull/__tmStep above: read-only, lets witness_4d_roof_load_path.js compare the
    // OLD (seq<=4-only) and NEW (M3) audit definitions against the SAME elements+schedule.
    window.__tmScheduleDebug = { elements: elements, sched: _sched, disp: _disp, tier: _twStats, audit: null };  // §DEQ_V1: audit unfiltered; §TIER_SERIAL: disp = displayed two-tier map, sched stays RAW generative

    // §S260c BUG5: Log first 20 ops to verify bottom-up storey ordering
    // §GANTT_OPS_TIEBREAK (2026-08-04) — display-only fix, real timestamps unchanged. Many elements
    // genuinely tie at the same millisecond (each trade's crew queue starts independently at t=0 —
    // by design, real parallel trades, MEASURED: footings/proxies/walls/columns all start at exactly
    // 0ms on Hospital). ORDER BY timestamp alone leaves ties in arbitrary DB order, which read as
    // "wrong sequence" even though nothing about the real schedule/movie/support-check is wrong.
    // Fetch a wider window, stable-sort by (timestamp, seq) in JS, THEN take 20 — so ties display
    // Substructure-first without touching a single real computed date anywhere else in the app.
    var _first20 = [];
    try {
      var f20r = db.exec('SELECT timestamp, parameters FROM kernel_ops WHERE undone=0 ORDER BY timestamp LIMIT 500');
      if (f20r.length) {
        var _f20rows = f20r[0].values.map(function (row) {
          var p = JSON.parse(row[1]);
          return { ts: row[0], p: p, seq: matchRule(p.cls, p.name).sequence };
        });
        _f20rows.sort(function (a, b) { return (a.ts - b.ts) || (a.seq - b.seq); });
        _f20rows.slice(0, 20).forEach(function (r) {
          _first20.push(r.p.storey + '|band=' + storeyBand[r.p.storey || '_UNKNOWN'] + '|seq=' + r.seq + '|' + r.p.cls);
        });
      }
    } catch(e) {}
    console.log('§GANTT_OPS_FIRST20: ' + _first20.join(', '));

    var endDate = new Date(Math.max.apply(null, Object.values(resourceCursor)));
    var sceneGuids = 0;
    if (app.scene) {
      var seen = {};
      app.scene.traverse(function(obj) {
        if (obj.userData && obj.userData.guid && !seen[obj.userData.guid]) {
          seen[obj.userData.guid] = true; sceneGuids++;
        }
      });
    }
    _s4Mark('generativeBranchEnd');
    console.log('§S4_ACTIVATION_TIMING ' + _s4Marks.join(' '));
    console.log('§GANTT injected=' + count + ' dbElements=' + totalDbElements +
      ' sceneMeshGUIDs=' + sceneGuids +
      ', bands=' + storeyNames.length + ', serialClockDays=' + projectDays + ', scale=' + scaleFactor.toFixed(2) +
      ', anchor=' + new Date(baseMs).toLocaleDateString() + ' end=' + endDate.toLocaleDateString() +
      ' (anchor=real ops epoch; serialClockDays sizes the degenerate-project floor, not the axis)');

    // ── T3 §3.1/§3.3: overlay captured task names + the captured project window onto covered
    // elements. The generative pass above already laid every element on the real-start epoch
    // (baseMs) carrying the §TIER_SERIAL two-tier display timeline.
    //
    // §TIER_SERIAL Option A (2026-08-11, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §SPEC
    // 2026-08-11 evening — replaces §PLAYBACK-STAGGER/§STAGGER_SUPPORT_ORDER/§4D_LAYER_TRUTH's
    // independent per-task-bucket affine + §STAGGER_HOST + the in-branch guard invocation):
    // each task bucket used to be rescaled into its own §PHASE_OVERLAP_BAND window INDEPENDENTLY,
    // which un-did computeSchedule's cross-bucket support order (measured pre-guard: Terminal 447 /
    // Hospital 1,929 violations — the reason §PHASE_OVERLAP_SUPPORT_GUARD was born as a repair
    // pass). Now the covered set maps through ONE global monotone affine into the captured project
    // window [_cap.base, _cap.projEnd]: order — and therefore support order — is preserved BY
    // CONSTRUCTION, no per-bucket window can reorder across bucket boundaries anymore. Deliberate,
    // user-decided Option A cost: an individual task's dragged window no longer independently
    // rescales its own elements — task NAMES still overlay (mini-Gantt), and the overall captured
    // window anchors/scales the whole timeline. §STAGGER_HOST was already inert here (since
    // §4D_LAYER_TRUTH's ls-affine, element times derive from ls alone — its index reshuffle
    // changed nothing) — removed with the per-bucket map, not silently lost.
    _capActive = false; _coveredCount = 0; _coveragePct = 0;
    if (_cap) {
      var _covered = 0;
      var _elByGuid = {};
      elements.forEach(function(el) { _elByGuid[el.guid] = el; });
      var _allScheduled = [];
      var _allOps = db.exec("SELECT output_guid, parameters, timestamp FROM kernel_ops WHERE op_type='ELEMENT_PLACE'");
      if (_allOps.length && _allOps[0].values.length) {
        _allOps[0].values.forEach(function(row) {
          var g = row[0], tid = _cap.guidTask[g];
          if (!tid) return;                         // uncovered → keeps the two-tier generated timing
          var w = _cap.win[tid];
          if (!w) return;                           // link points at summary/undated task
          var _el = _elByGuid[g];
          var p; try { p = JSON.parse(row[1]) || {}; } catch (e) { p = {}; }
          var _ls = row[2] || 0;
          var _le = p._end_ts || (_ls + 60000);
          // §GANTT_PHASE_CLOBBER (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md —
          // Witness: W-PHASE-KEY / witness_gantt_phase_palette.js). This line used to be
          // `p.phase = w.name`, i.e. it wrote the TASK NAME into the field the whole drawer keys
          // on. Harmless while task names looked like phases; destructive since zone-level
          // authoring became the default, because materializeZones names its tasks
          // "<Phase> — <Storey>". Measured on the user's Hospital session, every op's phase became
          // "Architecture — Level 1" and three separate things broke at once:
          //   1. PHASE_COLORS[task.phase] || '#888'  -> all 35 bars grey (also PHASE_INK/PHASE_SHORT)
          //   2. _phaseRank() = _ROW_PHASE_ORDER.indexOf(phase) -> -1 for every row, so the sort
          //      falls through to alphabetical: §GANTT_ROW_ORDER printed Architecture … Substructure
          //      5th — §GANTT_ROW_ORDER (K1)'s ORIGINAL reported bug, back verbatim and silent.
          //   3. tm-dash-phases buckets by the same field and filters through PHASE_ORDER -> zero
          //      matches, no §DASH_PHASE line in the entire session, phase progress renders empty.
          // The name was never made visible by this line anyway: buildGanttTasks reads it from the
          // task index into `taskName` (~:5694) and the bar detail header renders
          // `bar.taskName || (bar.phase + ' — ' + bar.storey)` (~:6716). So keep the name, in its
          // own field, and leave the phase alone — the drawer needs BOTH, not one overwriting the other.
          p.taskName = w.name;                      // real task name → mini-Gantt detail header
          _allScheduled.push({ guid: g, s: _ls, e: _le, params: p, task: tid,
            bz: _el ? _el.base_z : 0, tz: _el ? _el.top_z : 0,
            x0: _el ? _el.x0 : 0, x1: _el ? _el.x1 : 0,
            y0: _el ? _el.y0 : 0, y1: _el ? _el.y1 : 0,
            cls: _el ? _el.cls : '', seq: _el ? _el.seq : 999 });
          _covered++;
        });
      }
      // §GANTT_TASK_WINDOW_FIDELITY (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
      // §HOSPITAL_LIGHTING_STILL_FLOATING — user directive: "if it is not in that single source of
      // truth [the Gantt/task JSON], it does not happen, yet"). This REPLACES Option A's ONE GLOBAL
      // affine (2026-08-11, see the header above — kept verbatim for the history, now superseded).
      // Option A's own global rescale never actually used `w.s`/`w.e` (each task's OWN authored
      // schedule_start/schedule_finish) for placement at all — it only read them for the overall
      // min/max span and the task-name overlay. Every element was positioned by where its OLD
      // generative timestamp fell in a GLOBAL min→max compression, with no mechanical tie to its
      // own task's window — an element authored for "Superstructure — Level 3" could land anywhere
      // in the whole captured span. Measured live: this is exactly why the movie read as untied from
      // the Gantt chart. Fixed at the source: each element is now rescaled WITHIN its own task's
      // window only, preserving its pre-existing relative order among that task's own covered
      // elements (monotone per-task, same floor() reasoning Option A used globally).
      // Known, accepted cost — same one Option A was built to avoid, now scoped correctly instead of
      // hidden: a structural dependency that crosses two tasks with overlapping/conflicting authored
      // windows can still show a real violation. That is now an honest signal pointing at the task
      // AUTHORING (materializeZones' own CPM windows), not a display-layer artifact to paper over.
      // _ogSupportSweep (unchanged, runs next) still catches and reports what it can within its own
      // narrower carrier pool — its pushes now stay local to each task's own already-correct window
      // instead of a whole-timeline compression, so they can no longer manufacture the kind of
      // cross-window desync #1364's reverted bolt-on did.
      // §GANTT_GAP_CLAMP_SPREAD (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
      // §GANTT_WINDOW_FIDELITY_AND_SPREAD — user: "Are they correlating exactly to TM Gantt chart
      // timeline? and spread evenly within each bar?" → "It is a simple spread it evenly" → "U have
      // a denominator for a 4D time factor - divide by it! or shrink to it which is other way round").
      // The VALUE-preserving rescale below this comment used to divide EVERY gap by each task's own
      // real TIME SPAN (lsSpan) — so a genuine CPM gap in the raw schedule (elements waiting on a
      // cross-discipline dependency, e.g. curtain-wall framing waiting on MEP rough-in at the same
      // storey, §4D_BAND_MONOTONIC's `phaseTrade`) survived as a proportionally-compressed but still-
      // empty display gap. Measured: Hospital's TASK_Architecture_Level_4 showed a hard bimodal split
      // (1571 elements day 0-12, a real 120-day silent gap, 2779 elements day 133-135), aggregate
      // Hospital KS-vs-uniform=0.14. Rejected two other levers first (splitting into authored
      // sub-bars, loosening `phaseTrade`) as touching settled dependency-gating design.
      // Three earlier attempts tried and REJECTED with measured numbers — do not re-derive:
      // 1. Pure rank/count spread (every gap = tSpan/N by index). Fixed Q2 perfectly (KS
      //    0.14->0.0117) but broke Q1 hard (Hospital 99.97%->97.80%, 14.9d max overshoot) — a
      //    tiny per-element step compressed real, necessary minimum lead times between directly
      //    dependent elements, exactly the intra-task-precedence risk this fix was flagged to check.
      // 2. Clamp each gap to tSpan/N, then MULTIPLICATIVELY restretch the compressed timeline to
      //    refill the window. Converged to nearly the SAME Q1 regression as #1 (97.78-97.93%
      //    across every clamp threshold tried) — one common per-task stretch factor scales every
      //    gap, including safe tiny real ones, so it reintroduces the same compression risk by a
      //    different mechanism.
      // 3. Clamp+ADDITIVE pad (grow gaps by a constant instead of a multiplier — normal gaps only
      //    ever get LARGER, never compressed) fixed the mechanism, but an early version measured
      //    a padding bug: target was computed against `tSpan` (the whole window, including the
      //    structural gap between the last element's real START and the window's own end that
      //    exists even with ZERO clamping) instead of what the ORIGINAL unclamped formula actually
      //    produces — so pad barely moved across clamp thresholds 3..50, dominated by that
      //    structural gap, not by anything clamping had removed.
      // SHIPPED: additive redistribution, target computed as the exact sum the original per-gap
      // value-based formula would produce (so zero clamping ⇒ byte-identical to the pre-existing
      // rescale), clamp threshold = this TASK's OWN median real gap × 500 (a self-referential,
      // per-task statistic — not one shared magic constant across every task/building). Measured,
      // all 7 buildings, this exact configuration: Hospital/Duplex/HHS/Clinic/JKR — Q1 window
      // fidelity byte-identical to the pre-existing #1368/#1376 baseline (same violation count on
      // 4/5; JKR Q2 also improved) while Q2 (spread) measurably improves; Hospital's reported
      // TASK_Architecture_Level_4 case specifically goes from a hard 120-day dead gap to a
      // near-perfectly uniform histogram. Two real, bounded, NOT-hidden costs: LTU_AHouse Q1
      // fidelity 99.98%->99.94% (20->71 violations, still a small fraction of 122,330 elements) in
      // exchange for a large Q2 gain (KS 0.1107->0.0261); Terminal's violation COUNT is unchanged
      // (still exactly 436/48,428, zero new Q1 cost) but its in-window spread SHAPE got WORSE
      // (KS 0.0946->0.2823) — Terminal has several tasks whose real gap distribution is itself
      // multi-modal at genuinely different scales (not one dominant outlier + a dense remainder,
      // like Hospital's reported case), so a single task-wide median-based threshold isn't the
      // right lever there; named for a future session, not chased further this pass — Terminal was
      // already imperfectly spread pre-fix (KS 0.0946), this is a real but same-axis regression,
      // not a new correctness class.
      // §ZONE_DISPLAY_AUTHORING (2026-08-16): extracted into the named _capWindowRescale so
      // witnesses/probes can slice the SHIPPED rescale instead of maintaining copies — body verbatim.
      // §CAP_RESCALE_SKIP (2026-08-16, bim-compiler prompts/4D_SCHEDULE_ARCHITECTURE_REDESIGN.md
      // §ZONE_WINDOW_DAGWINS_CLIP follow-through): a display-authored schedule's windows are VIEWS
      // of these very element times — there is nothing to reconcile, and every reconciliation
      // attempt measurably damaged the contact order (gap-clamp: 4,712 manufactured violations;
      // even a rigid per-task shift: 537). Same DB flag §OG_SWEEP_SKIP already keys on, computed
      // once here for both. Bar EDITS are not lost: the Gantt edit machinery mutates element times
      // directly (witness_gantt_edit_lock / witness_gantt_group_move) — this load-path rescale was
      // only ever for imported/captured windows, which keep it below.
      var _capDisplayAuthored = false;
      try {
        var _daR0 = db.exec('SELECT 1 FROM schedules WHERE display_authored=1 LIMIT 1');
        _capDisplayAuthored = !!(_daR0.length && _daR0[0].values.length);
      } catch (e0) { /* legacy DB without the column — rescale stays */ }
      if (_capDisplayAuthored) {
        console.log('§CAP_RESCALE_SKIP display-authored windows are views of these element times — nothing to reconcile');
      } else {
        _capWindowRescale(_allScheduled, _cap.win);
      }
      // §S58: rescale physics in viewer/support_sweep.js; this wrapper owns the § line.
      function _capWindowRescale(_allScheduled, _win) {
        var r = SupportSweep.capWindowRescale(_allScheduled, _win);
        console.log('§CAP_RESCALE_IDENTITY tasks=' + r.skipped + '/' + (r.skipped + r.rescaled) + ' replayed verbatim (window==head of own span within day rounding); reSpaced=' + r.rescaled);
        return r;
      }
      // §ZONE_DISPLAY_AUTHORING (2026-08-16): when the task windows were authored FROM the display
      // timeline (schedules.display_authored=1, written by materializeZones' displayRemap path),
      // the strict end-bar sweep is SKIPPED. _ogSupportSweep enforces "start after the carrier
      // FINISHES" — a bar §MIDAIR_REPAIR's own header deliberately does NOT enforce on the display
      // timeline (a frontier-glowing half-built support reads as resting, not hanging) — and it
      // only existed here because windows and movie described two different schedules. Measured on
      // the browser-faithful probe (§EXP7 vs §EXP8, Hospital): keeping the sweep = 1781 elements
      // pushed OUT of their own bars (97.2% fidelity); skipping it = 31 out (99.95%), floating
      // 79 -> 63. Imported/legacy/edited-window schedules (flag absent or 0) keep the sweep —
      // their windows are not the display envelope, so the old repair still earns its keep there.
      var _cjpDisplayAuthored = false;
      try {
        var _daR = db.exec('SELECT 1 FROM schedules WHERE display_authored=1 LIMIT 1');
        _cjpDisplayAuthored = !!(_daR.length && _daR[0].values.length);
      } catch (e) { /* legacy DB without the column — sweep stays */ }
      if (_cjpDisplayAuthored) {
        console.log('§OG_SWEEP_SKIP display-authored windows — strict end-bar repair not applied (weak-bar parity below is the acceptance bar)');
      } else {
        _ogSupportSweep(_allScheduled, _cap.win);
      }
      _cjpJudgeParity(_allScheduled, _cap.win);   // §CROSSTASK_JUDGE_PARITY — judge/repair parity, window-bounded
      _s4Mark('capBranchPreWrite');
      // §GANTT_REFOLD_HANG (fix/gantt-refold-hang, synced 2026-08-12 — CPE_4D_PERF_MEM_FINDINGS.md
      // §3-R2): the inline BEGIN→per-row UPDATE→COMMIT loop was the measured §WRITE_LOOP_TIMING
      // ms=2044.9 synchronous freeze on LTU (live log 2026-08-10). _writeScheduledChunked writes the
      // IDENTICAL rows in the IDENTICAL order (same fields, same log line), committing and yielding
      // a macrotask every _TM_CHUNK=2500 rows so the tab stays responsive. Witness:
      // viewer/tests/witness_gantt_refold_yield.js (identity gate: chunked rows == sync rows).
      await _writeScheduledChunked(db, _allScheduled);
      _s4Mark('capBranchWrite');
      console.log('§S4_ACTIVATION_TIMING_CAP ' + _s4Marks.join(' '));
      _capActive = true;
      _coveredCount = _covered;
      _coveragePct = totalDbElements ? Math.round(_covered / totalDbElements * 100) : 0;
      console.log('§GANTT_SOURCE captured tasks=' + _cap.taskCount + ' covered=' + _covered +
        ' generated=' + (totalDbElements - _covered) + ' total=' + totalDbElements + ' pct=' + _coveragePct);
      console.log('§4D_COVERAGE captured=' + _covered + ' generated=' + (totalDbElements - _covered) +
        ' total=' + totalDbElements + ' pct=' + _coveragePct +
        ' window=' + new Date(_cap.base).toISOString().slice(0,10) + '..' + new Date(_cap.projEnd).toISOString().slice(0,10));
    } else {
      console.log('§GANTT_SOURCE generated');       // W-TM-FALLBACK: no native 4D, pure generative
    }
    return count > 0;
  }

  // ── Mini Gantt chart ──
  var _ganttTasksComputed = false; // §S58: no longer gates the log lines; "has ever built" only
  var _ganttRebuildN = 0;
  var _ganttSpanFromTask = 0, _ganttSpanFromOps = 0;   // §GANTT_BAR_IS_ITS_TASK (§S65)          // §S58: rebuild ordinal — N rebuilds per gesture is readable

  // ── §GANTT_BAR_IDENTITY (K0 — prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT) ──
  // The drawer used to derive its bars purely by grouping raw kernel_ops on storey|phase, yielding
  // bar objects with NO task_id — which is precisely why no bar was ever draggable: moveTask(db,
  // taskId, …) had nothing to be handed. schedule_author.js materializeZones() already writes the
  // SAME phase×floor decomposition into the real model (tasks + task_elements + task_sequences).
  // Two code paths derived one decomposition independently and were never connected. This joins them.
  //
  // The join is by GUID through task_elements, deliberately NOT by matching storey/phase strings:
  // deriveZones() keys a zone on collapsePhase(e.storey) while the drawer reads the raw p.storey off
  // the op params, so those two names legitimately differ and string-matching would silently
  // mis-associate bars. GUID identity is exact.
  //
  // Bars whose ops carry no task (a generated schedule with nothing authored) keep their old
  // storey|phase identity and simply stay non-editable — honest, and reported as a coverage ratio by
  // §GANTT_BAR_IDENTITY rather than hidden.
  var _taskIndex = null;      // { guidTask:{guid→tid}, tasks:{tid→{id,name,start,finish}}, scheduleId }
  var _taskIndexFor = null;   // building key the index was built for (invalidation)

  function buildTaskIndex() {
    var app = A();
    var key = (app && app.activeBuilding) || '';
    // §GANTT_AUTHOR_REPROBE (found by the browser wiring test, 2026-08-04): only a POSITIVE result is
    // cached. Caching the negative meant that once the drawer had been opened on an un-authored
    // building, authoring a schedule afterwards never took effect — the bars stayed non-editable
    // until a building change, because nothing invalidated the "no schedule" answer. Re-probing costs
    // one activeSchedule() query per rebuild, and rebuilds only happen when _ganttDirty is set.
    if (_taskIndex !== null && _taskIndex.ok && _taskIndexFor === key) return _taskIndex;
    _taskIndexFor = key;
    _taskIndex = { ok: false, guidTask: {}, tasks: {}, scheduleId: null, n: 0 };
    if (!app || !app.db) return null;
    var db = app.db, sched = null, SA = null;
    try {
      SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
      if (SA && SA.activeSchedule) sched = SA.activeSchedule(db, { currentGenVersion: _GANTT_CACHE_VERSION });
    } catch (e) { sched = null; }
    if (!sched || !sched.id) {
      console.log('§GANTT_BAR_IDENTITY schedule=none bars stay non-editable (no authored schedule)');
      return null;
    }
    // §GANTT_SCHEDULE_STALE (4D_SCHEDULE_PERFECTION.md §GANTT_SHIFT_HOURS_DESYNC follow-up): the
    // authored Gantt had no equivalent of kernel_ops's _genVersion self-heal — once materialized it
    // was frozen forever regardless of how much the scheduling code changed since. Re-materialize in
    // place, same real UI opts shape as _materializeNativeSchedule/generateGanttSchedule, BEFORE the
    // task index is built from it. sched.safeToRegen already excludes captured (imported) schedules
    // and anything with a baseline set (the user's committed, edited product) — see activeSchedule's
    // own header for the exact contract.
    // §TM_BAKE_LOCK (§S69) — the guard is on the REGEN, not on buildTaskIndex itself. This block
    // rewrites the whole schedule in place, so firing it mid-bake would swap the timeline out from
    // under the recorder; but refusing the whole function would leave the Gantt with no task index
    // and break the very display the film is recording. Skipping only the regen keeps the film on
    // the exact schedule it started with, and genVersion stays stale so the self-heal simply runs on
    // the next rebuild after the bake finishes. Found by W-TBL-5's derivation, not by hand.
    if (sched.safeToRegen && SA.materializeZones && !_tmEditLocked('buildTaskIndex:staleRegen')) {
      console.log('§GANTT_SCHEDULE_STALE_REGEN id=' + sched.id + ' genVersion=' + sched.genVersion +
        ' current=' + _GANTT_CACHE_VERSION + ' — re-materializing in place');
      try {
        var _SR = window.SEQUENCE_RULES || {}, _LR = window.LABOR_RATES || {}, _RT = window.RATES || {};
        var _shGantt = (window.SHIFT_HOURS > 0) ? window.SHIFT_HOURS : 24;
        // §FUTURE-5A B2 (applied 2026-09-02, queue item B-3): sourced from 4D_template.json
        // calendar.project_start (same literal, '2026-01-01', as before this fix).
        var _tplStart = (_4dTemplate && _4dTemplate.calendar && _4dTemplate.calendar.project_start) || '2026-01-01';
        var rres = SA.materializeZones(db, _SR, { start: _tplStart, laborRates: _LR, rates: _RT,
          scheduleGate: window.ScheduleGate, shiftHours: _shGantt, genVersion: _GANTT_CACHE_VERSION,
          displayRemap: _tmDisplayRemap, template: _4dTemplate });   // §ZONE_DISPLAY_AUTHORING + §TPL_WIRED
        if ((!rres || !rres.ok) && SA.materializeDefault) {
          rres = SA.materializeDefault(db, _SR, { start: _tplStart, laborRates: _LR, blank: false,
            genVersion: _GANTT_CACHE_VERSION });
        }
        console.log('§GANTT_SCHEDULE_STALE_REGEN_RESULT ok=' + !!(rres && rres.ok));
      } catch (e) { console.log('§GANTT_SCHEDULE_STALE_REGEN_FAIL ' + e.message); }
    }
    try {
      var tr = db.exec('SELECT task_id, name, schedule_start, schedule_finish FROM tasks ' +
        'WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)', [sched.id]);
      if (tr.length) tr[0].values.forEach(function (row) {
        _taskIndex.tasks[row[0]] = { id: row[0], name: row[1], start: row[2], finish: row[3] };
        _taskIndex.n++;
      });
      var er = db.exec('SELECT te.guid, te.task_id FROM task_elements te ' +
        'JOIN tasks t ON t.task_id = te.task_id WHERE t.schedule_id=?', [sched.id]);
      if (er.length) er[0].values.forEach(function (row) { _taskIndex.guidTask[row[0]] = row[1]; });
    } catch (e) {
      console.log('§GANTT_BAR_IDENTITY schedule=' + sched.id + ' error=' + e.message);
      return null;
    }
    _taskIndex.scheduleId = sched.id;
    _taskIndex.ok = _taskIndex.n > 0;
    return _taskIndex.ok ? _taskIndex : null;
  }

  // Invalidate the cached index + bar rollup (call after any write that re-dates or re-authors).
  function invalidateGanttModel() { _taskIndex = null; _taskIndexFor = null; _ganttDirty = true; }

  // §GANTT_PALETTE (2026-08-04, prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT VIS) — user report:
  // "not clear enough which is which". Three real collisions in the previous palette, not taste:
  //  1. Substructure #7a8a8e and Superstructure #5b7fa5 were both desaturated blue-greys — the least
  //     distinguishable pair sat on the two ADJACENT structural phases.
  //  2. Architecture #c07a4a (orange-brown) competed with two RESERVED STATUS colours: #ff8c00 is the
  //     active-bar outline + cursor hairline, #ffeb3b is the captured-IFC-4D frame. A phase fill must
  //     never occupy a status hue.
  //  3. The palette encoded no trade family: the two MEP phases (#8bc34a green / #ab47bc purple)
  //     looked unrelated, while MEP Rough-in and Finishes (#26a69a teal) looked related.
  // Now: three trade families by HUE (structure blue / MEP green / architecture purple), dark→light
  // WITHIN each family following build order, and orange+yellow left free for status only.
  //
  // MEASURED, not eyeballed (CIE76 dE + WCAG, scratchpad/palette_tune.js — the FUNDAMENTAL LAW
  // applies to colour too: numbers, not "looks better"):
  //   min pairwise dE      20.8 → 34.7   (worst old pair was Substructure/Superstructure, as reported)
  //   min dE to a status hue 42.5 → 60.9
  //   worst label contrast  2.10:1 → 5.92:1   (the OLD palette failed a 3.0 floor on every light bar —
  //                                            white-on-#8bc34a was 2.10:1, effectively unreadable)
  var PHASE_COLORS = {
    'Substructure':   '#37516b',   // structure, deep
    'Superstructure': '#79b4e8',   // structure, light
    'MEP Rough-in':   '#27714a',   // MEP, deep
    'MEP Final':      '#7ccb80',   // MEP, light
    'Architecture':   '#5e3f87',   // architecture, deep
    'Finishes':       '#c096e0'    // architecture, light
  };

  // Adaptive label ink — white on the deep family members, near-black on the light ones. Forcing
  // white onto every bar is what drove the old 2.10:1 contrast; picked per fill, all six clear 5.9:1.
  var PHASE_INK = {
    'Substructure':   '#ffffff',
    'Superstructure': '#10141a',
    'MEP Rough-in':   '#ffffff',
    'MEP Final':      '#10141a',
    'Architecture':   '#ffffff',
    'Finishes':       '#10141a'
  };

  // The in-bar text label used to be phase.substring(0,3), which collided on exactly the same pair
  // the colours did: "Sub" vs "Sup", one character apart at 9px. Explicit short codes instead.
  var PHASE_SHORT = {
    'Substructure': 'SUB', 'Superstructure': 'SUPER', 'MEP Rough-in': 'MEP-R',
    'MEP Final': 'MEP-F', 'Architecture': 'ARCH', 'Finishes': 'FIN'
  };

  // ── §TM-VARIANCE — budget-vs-actual from the STORED twin (TM_4D5D_VARIANCE_LANE §S1) ──
  // COST is READ, never recomputed: PlannedAmt → CommittedAmt straight off the iDempiere C_Project /
  // C_ProjectPhase records baked into erp/ad_seed.db (erp/tests/bake_gw_hospital_variance.js). The drawer
  // shows the SAME figure the ledger holds — §DOCTRINE 2/3 "variance = the PlannedAmt↔CommittedAmt pair,
  // read the twin, don't recompute". Phase TIME windows come from TM's own injected gantt (_ops) so the
  // cursor scrubs the same axis as the 3D scene. No LABOR_RATES×days, no hash variant — that only correlated.
  var _DAY_MS = 86400000;
  var _VAR_ORDER = ['Substructure', 'Superstructure', 'MEP Rough-in', 'Architecture', 'MEP Final', 'Finishes'];
  var _twin = null;          // { building, projectId, planned, committed, phases:[{name,seqno,start,end,planned,committed}] }
  var _twinLoading = false;
  // §PERF_NEG_CACHE: building names whose ERP load returned no rows. Without these, the per-tick
  // dashboard/variance guards re-fetch ad_seed.db (25.8MB) from IDB forever on a non-folded building.
  var _twinMiss = null, _shopfloorMiss = null;
  // Load the folded ERP twin once: fetch the seed db → sql.js → read the C_Project cost pair + its phases.
  // Same lazy-fetch idiom as navigate_find._ensureErpDb; read-only (db.close after extracting the figures).
  function _loadTwin() {
    var app = A();
    // §S54 (4D_GANTT_TM_REFACTOR.md §S54.2, item F2): this used to read
    // `(app && app.activeBuilding) || 'Hospital'` — with no active building it silently loaded
    // HOSPITAL's ERP twin and attached its cost/phase figures to whatever model was on screen.
    // No active building is a REAL state (an arbitrary IFC opened straight into the viewer) and
    // the honest answer there is the one both functions already give a building with no C_Project
    // row: no folded project. Skip, never guess — and skip BEFORE the 25.8MB ad_seed.db fetch.
    var building = app && app.activeBuilding;
    if (!building) { console.log('§TM_TWIN_NOBLD no active building — ERP twin skipped (never defaulted to another building\'s project)'); return Promise.resolve(null); }
    if (_twin && _twin.building === building) return Promise.resolve(_twin);   // cached for THIS building
    if (_twinMiss === building) return Promise.resolve(null);   // §PERF_NEG_CACHE — see _loadShopfloor
    if (_twinLoading) return Promise.resolve(null);                            // a load is in flight; caller retries
    var SQL = (app && app._SQL) || window.SQL || window._SQL_CACHED;
    if (!SQL) { console.log('§TM_TWIN_DEFER no sql.js factory'); return Promise.resolve(null); }
    _twinLoading = true;
    return APP.cachedFetch('../erp/ad_seed.db').then(function (buf) {
      var db = new SQL.Database(new Uint8Array(buf));
      var pr = db.exec("SELECT C_Project_ID,PlannedAmt,CommittedAmt FROM C_Project WHERE Value=?", [building]);
      if (!pr.length || !pr[0].values.length) { db.close(); _twinLoading = false; _twinMiss = building; console.log('§TM_TWIN_MISS building="' + building + '" — not a folded project (miss cached, no refetch)'); return null; }
      var pid = pr[0].values[0][0], planned = Number(pr[0].values[0][1] || 0), committed = Number(pr[0].values[0][2] || 0);
      var ph = db.exec("SELECT Name,SeqNo,StartDate,EndDate,PlannedAmt,CommittedAmt FROM C_ProjectPhase WHERE C_Project_ID=" + Number(pid) + " AND Name<>'Unsequenced' ORDER BY SeqNo");
      var phases = (ph.length ? ph[0].values : []).map(function (row) {
        return { name: row[0], seqno: Number(row[1] || 0), start: Date.parse(row[2]), end: Date.parse(row[3]),
                 planned: Number(row[4] || 0), committed: Number(row[5] || 0) };
      });
      db.close();
      _twin = { building: building, projectId: pid, planned: planned, committed: committed, phases: phases };
      _twinLoading = false;
      console.log('§TM_TWIN_LOADED building="' + building + '" planned=' + planned + ' committed=' + committed + ' phases=' + phases.length);
      return _twin;
    }).catch(function (e) { _twinLoading = false; console.log('§TM_TWIN_ERR ' + e.message); return null; });
  }
  // §E2b — load PP_Order + PP_Order_Cost from the ERP DB for the active building's project.
  // Builds _shopfloor.orders = [{start, end, elements:{Material,Labor,Burden,Overhead}}]
  // Same fetch/cache pattern as _loadTwin; closed over _shopfloor/_shopfloorLoading.
  function _loadShopfloor() {
    var app = A();
    var building = app && app.activeBuilding;   // §S54 (item F2) — see _loadTwin: skip, never guess a building
    if (!building) { console.log('§PERF_NEG_CACHE shopfloor no-building — skipped before the ad_seed.db fetch (not a cached miss: the miss cache is keyed by name and this state has none)'); return Promise.resolve(null); }
    if (_shopfloor && _shopfloor.building === building) return Promise.resolve(_shopfloor);
    // §PERF_NEG_CACHE: remember a MISS too. drawDash() calls this every tick behind
    // `if (!_shopfloor && !_shopfloorLoading)`, and every failure path below cleared the
    // in-flight flag WITHOUT setting _shopfloor — so a building with no PP_Order rows re-fetched
    // ad_seed.db (25.8MB) from IndexedDB on EVERY playback tick. A cache that only remembers
    // successes is not a cache.
    if (_shopfloorMiss === building) return Promise.resolve(null);
    if (_shopfloorLoading) return Promise.resolve(null);
    var SQL = (app && app._SQL) || window.SQL || window._SQL_CACHED;
    if (!SQL) return Promise.resolve(null);   // NOT a miss — sql.js may arrive later, retry is correct
    _shopfloorLoading = true;
    return APP.cachedFetch('../erp/ad_seed.db').then(function (buf) {
      var db = new SQL.Database(new Uint8Array(buf));
      var pr = db.exec('SELECT C_Project_ID FROM C_Project WHERE Value=?', [building]);
      if (!pr.length || !pr[0].values.length) { db.close(); _shopfloorLoading = false; _shopfloorMiss = building; console.log('§PERF_NEG_CACHE shopfloor miss cached building="' + building + '" — no further ad_seed.db refetch'); return null; }
      var pid = pr[0].values[0][0];
      var res = db.exec(
        'SELECT o.PP_Order_ID, o.DateStartSchedule, o.DateFinishSchedule,' +
        ' oc.M_CostElement_ID, ce.Name AS elem, oc.CumulatedAmt' +
        ' FROM PP_Order o' +
        ' JOIN PP_Order_Cost oc ON o.PP_Order_ID=oc.PP_Order_ID' +
        ' JOIN M_CostElement ce ON oc.M_CostElement_ID=ce.M_CostElement_ID' +
        ' WHERE o.C_Project_ID=' + Number(pid) + ' AND oc.CumulatedAmt>0' +
        ' ORDER BY o.DateFinishSchedule, oc.M_CostElement_ID'
      );
      db.close();
      var rows = res.length ? res[0].values : [];
      var orderMap = {};
      rows.forEach(function (r) {
        var oid = r[0], s = Date.parse(r[1]), e = Date.parse(r[2]), eName = r[4], amt = Number(r[5] || 0);
        if (!orderMap[oid]) orderMap[oid] = { start: s, end: e, elements: {} };
        orderMap[oid].elements[eName] = (orderMap[oid].elements[eName] || 0) + amt;
      });
      var orders = Object.keys(orderMap).map(function (k) { return orderMap[k]; });
      _shopfloor = { building: building, orders: orders };
      _shopfloorLoading = false;
      console.log('§TM_SHOPFLOOR_LOADED building=' + building + ' orders=' + orders.length + ' rows=' + rows.length);
      return _shopfloor;
    }).catch(function (e) { _shopfloorLoading = false; console.log('§TM_SHOPFLOOR_ERR ' + e.message); return null; });
  }
  function _money(n) { n = Math.round(n); var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e6) return s + 'RM' + (a / 1e6).toFixed(1) + 'M'; if (a >= 1e3) return s + 'RM' + Math.round(a / 1e3) + 'K'; return s + 'RM' + a; }
  // Join the STORED twin cost (READ) to TM's gantt phase windows (the scrub axis). The cost numbers are the
  // records verbatim — Σ phase PlannedAmt == C_Project.PlannedAmt and Σ CommittedAmt == C_Project.CommittedAmt
  // (verified: 64,719,479 → 87,372,995). The _ops aggregation only supplies each phase's TIME window so the
  // cursor + hairline land on the same axis as the 3D scene. Marquee = any phase ≥+50% over (Superstructure).
  function _computeVariance() {
    if (!_twin) return null;
    var src = _opsPlanned || _ops, win = {};
    for (var i = 0; i < src.length; i++) {
      var op = src[i], ph = (op.parameters || {}).phase || 'Architecture';
      if (!win[ph]) win[ph] = { start: op.start_ts, end: op.end_ts };
      else { if (op.start_ts < win[ph].start) win[ph].start = op.start_ts; if (op.end_ts > win[ph].end) win[ph].end = op.end_ts; }
    }
    var t0 = Infinity, t1 = -Infinity, pStart = Infinity, pEnd = -Infinity;
    var phases = _twin.phases.map(function (tp) {
      var w = win[tp.name], dCost = tp.committed - tp.planned;
      var ws = w ? w.start : tp.start, we = w ? w.end : tp.end;
      if (isFinite(ws) && ws < t0) t0 = ws;
      if (isFinite(we) && we > t1) t1 = we;
      if (isFinite(tp.start) && tp.start < pStart) pStart = tp.start;
      if (isFinite(tp.end) && tp.end > pEnd) pEnd = tp.end;
      return { phase: tp.name, pCost: tp.planned, aCost: tp.committed, dCost: dCost,
               pct: tp.planned > 0 ? Math.round(dCost / tp.planned * 100) : 0,
               winStart: ws, winEnd: we, startDate: tp.start, endDate: tp.end,
               marquee: tp.planned > 0 && dCost / tp.planned >= 0.5 };
    }).sort(function (x, y) { var ix = _VAR_ORDER.indexOf(x.phase), iy = _VAR_ORDER.indexOf(y.phase); return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy); });
    if (!isFinite(t0)) { t0 = _projectStart; t1 = _projectEnd; }
    return { phases: phases, tP: _twin.planned, tA: _twin.committed, dCost: _twin.committed - _twin.planned,
             pctOver: _twin.planned > 0 ? Math.round((_twin.committed - _twin.planned) / _twin.planned * 100) : 0,
             t0: t0, t1: t1, plannedStart: pStart, plannedEnd: pEnd };
  }
  function _recomputeBounds() {
    var s = Infinity, e = -Infinity;
    for (var i = 0; i < _ops.length; i++) { if (_ops[i].start_ts < s) s = _ops[i].start_ts; if (_ops[i].end_ts > e) e = _ops[i].end_ts; }
    if (isFinite(s)) { _projectStart = s; _projectEnd = e; }
  }
  // map the scrub cursor to the phase whose gantt window contains it (for the hairline + row highlight).
  function _varPhaseUnderCursor(V) {
    if (!V) return -1;
    for (var i = 0; i < V.phases.length; i++) { var p = V.phases[i]; if (_cursor >= p.winStart && _cursor <= p.winEnd) return i; }
    return -1;
  }
  // E3 / W-SHOP-DATES — the 4D counterpart to the 5D cost Δ. DOCTRINE (TM_4D5D §S3/§4): there is NO actual-date
  // column to read (PP_Order.DateStart/DateFinish are NULL by design), so the schedule slip is a PROJECTION FROM
  // COST — never an invented actual date: slip = planned-duration × (r−1), r = CommittedAmt/PlannedAmt (the real
  // twin). Planned durations are REAL (C_ProjectPhase.StartDate/EndDate, per-order PP_Order.DateStartSchedule/
  // Finish). Honestly labelled "projected from cost". Ripple/dependency is S6 — phases project INDEPENDENTLY here.
  var _DAY = 86400000;
  function _computeScheduleProjection(V) {
    if (!V) return null;
    var phases = V.phases.map(function (p) {
      var durDays = (isFinite(p.startDate) && isFinite(p.endDate) && p.endDate > p.startDate)
        ? Math.round((p.endDate - p.startDate) / _DAY) : 0;
      var r = p.pCost > 0 ? p.aCost / p.pCost : 1;
      var slipDays = Math.round(durDays * (r - 1));            // +late / −early, mirrors the cost over/under sign
      return { phase: p.phase, durDays: durDays, r: r, slipDays: slipDays,
               projEnd: isFinite(p.endDate) ? p.endDate + slipDays * _DAY : NaN, marquee: p.marquee };
    });
    var projDurDays = (isFinite(V.plannedStart) && isFinite(V.plannedEnd) && V.plannedEnd > V.plannedStart)
      ? Math.round((V.plannedEnd - V.plannedStart) / _DAY) : 0;
    var rProj = V.tP > 0 ? V.tA / V.tP : 1;                    // project-level ratio (no phase compounding = no ripple)
    var projSlipDays = Math.round(projDurDays * (rProj - 1));
    return { phases: phases, projDurDays: projDurDays, rProj: rProj, projSlipDays: projSlipDays,
             projEnd: isFinite(V.plannedEnd) ? V.plannedEnd + projSlipDays * _DAY : NaN };
  }
  // S5(B) / W-PC-EVM — Earned-Value Management folded from the EXISTING twin (no generated C_ProjectIssue layer;
  // PC_EVM_SPEC). COST is real: at the cursor, each phase contributes its baseline progress fraction →
  // EV (budgeted value of work done) + AC (committed cost of work done) → CPI = EV/AC, and the at-completion
  // forecast EAC = BAC/CPI (at completion EV=BAC ⇒ EAC = AC = the real CommittedAmt, to the rupiah). SCHEDULE has
  // no independent actual on this twin (see §HONESTY FINDING) so we emit NO SPI — the schedule story is the E3
  // "projected finish". Label "cost · from records". Cursor-driven (drawVariance re-folds on scrub).
  function _computeEVM(V, cursor) {
    if (!V) return null;
    var EV = 0, AC = 0;
    V.phases.forEach(function (p) {
      var s = p.startDate, e = p.endDate;
      var frac = (isFinite(s) && isFinite(e) && e > s) ? Math.max(0, Math.min(1, (cursor - s) / (e - s)))
               : (isFinite(cursor) && isFinite(e) && cursor >= e ? 1 : 0);
      EV += p.pCost * frac;                                   // BCWP — budgeted value of completed work
      AC += p.aCost * frac;                                   // ACWP — committed cost of completed work
    });
    var BAC = V.tP;                                           // budget at completion = Σ PlannedAmt
    var CPI = AC > 0 ? EV / AC : 1;
    var EAC = CPI > 0 ? Math.round(BAC / CPI) : V.tA;         // forecast at completion (= committed once complete)
    return { EV: Math.round(EV), AC: Math.round(AC), CPI: CPI, CV: Math.round(EV - AC), BAC: BAC, EAC: EAC, VAC: BAC - EAC };
  }
  function drawVariance() {
    if (!_ops.length) return;
    if (!_opsPlanned) _opsPlanned = _ops.slice();          // first open: snapshot the planned timeline (phase windows)
    var head = document.getElementById('tm-var-head');
    if (!_twin) {                                          // records not fetched yet → load, then redraw
      if (head) head.innerHTML = '<b style="color:#4fc3f7">Budget vs Actual</b><div style="margin-top:2px;color:#888">Reading records…</div>';
      _loadTwin().then(function (t) { if (t && _varVisible) drawVariance(); });
      return;
    }
    var V = _computeVariance();
    if (!V) { if (head) head.innerHTML = '<b style="color:#4fc3f7">Budget vs Actual</b><div style="margin-top:2px;color:#888">No project records for this model</div>'; return; }
    var fmtD = function (ms) { return isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '—'; };
    var curIdx = _varPhaseUnderCursor(V);
    var SP = _computeScheduleProjection(V);                     // E3 — the projected-from-cost schedule slip (4D Δ)
    var EVM = _computeEVM(V, _cursor);                          // S5(B) — cursor-driven cost EVM (CPI + EAC forecast)
    var slipColor = function (d) { return d >= 0 ? '#ff6b6b' : '#26a69a'; };
    var slipTxt = function (d) { return (d >= 0 ? '+' : '') + d + ' d'; };

    // header — the headline COST pair (READ from the twin) + the planned schedule span. Honest labels:
    // cost Δ is "from records"; the date span is the planned baseline (no actual-date column yet → §S3).
    if (head) {
      head.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px">' +
          '<b style="color:#4fc3f7">Budget vs Actual</b>' +
          '<span style="font-size:9px;color:#888">from records · ' + _twin.building + '</span>' +
        '</div>' +
        '<div style="margin-top:2px">Cost <b style="color:#9fd6ff" title="C_Project.PlannedAmt">' + _money(V.tP) + '</b> → ' +
          '<b style="color:#ff6b6b" title="C_Project.CommittedAmt">' + _money(V.tA) + '</b> ' +
          '<span style="color:' + (V.dCost >= 0 ? '#ff6b6b' : '#26a69a') + '">(' + (V.dCost >= 0 ? '+' : '') + V.pctOver + '%, ' +
          (V.dCost >= 0 ? '+' : '') + _money(V.dCost) + ')</span></div>' +
        '<div style="color:#9fd6ff">Schedule ' + fmtD(V.plannedStart) + ' → ' + fmtD(V.plannedEnd) +
          ' <span style="color:#888">(planned baseline)</span></div>' +
        (SP ? '<div style="color:#ffb74d">Projected finish ' + fmtD(SP.projEnd) +
          ' <span style="color:' + slipColor(SP.projSlipDays) + '">(' + slipTxt(SP.projSlipDays) + ')</span>' +
          ' <span style="color:#888">projected from cost</span></div>' : '') +
        // S5(B) EVM — cursor-driven earned value: EV/AC + CPI + the at-completion forecast (EAC). Cost only,
        // from records (no independent SPI on this twin — see §HONESTY FINDING; schedule = the line above).
        (EVM ? '<div style="margin-top:2px;color:#cfe8ff">EV <b>' + _money(EVM.EV) + '</b> / AC <b>' + _money(EVM.AC) + '</b>' +
          ' · CPI <b style="color:' + (EVM.CPI >= 1 ? '#26a69a' : '#ff6b6b') + '">' + EVM.CPI.toFixed(2) + '</b>' +
          ' · forecast <b title="EAC = BAC/CPI">' + _money(EVM.EAC) + '</b>' +
          ' <span style="color:' + (EVM.VAC >= 0 ? '#26a69a' : '#ff6b6b') + '">(' + (EVM.VAC >= 0 ? '+' : '') + _money(EVM.VAC) + ')</span>' +
          ' <span style="font-size:9px;color:#888">cost · from records</span></div>' : '');
    }

    // canvas — one bar per phase on the SAME axis the cursor scrubs; bar color = phase, edge cap red/green by
    // COST over/under (from records). Phase under the cursor is outlined; a vertical hairline marks the cursor.
    var canvas = document.getElementById('tm-var-canvas');
    var box = document.getElementById('tm-var-box');
    if (canvas && box) {
      var phases = V.phases, n = phases.length;
      var barH = 9, gap = 5, rowH = barH + gap, marginL = 64;
      var cW = box.clientWidth, cH = n * rowH + 8, barW = cW - marginL - 6;
      var range = Math.max(1, V.t1 - V.t0);
      canvas.width = cW * (window.devicePixelRatio || 1);
      canvas.height = cH * (window.devicePixelRatio || 1);
      canvas.style.height = cH + 'px';
      var ctx = canvas.getContext('2d');
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      ctx.clearRect(0, 0, cW, cH);
      ctx.textBaseline = 'middle'; ctx.font = '9px sans-serif';
      for (var ti = 0; ti < n; ti++) {
        var p = phases[ti], color = PHASE_COLORS[p.phase] || '#888', y = ti * rowH + 4;
        var over = p.dCost > 0;
        // label
        ctx.fillStyle = (ti === curIdx) ? '#fff' : (p.marquee ? '#ff8c00' : '#bbb'); ctx.textAlign = 'right';
        ctx.fillText((p.marquee ? '⚠ ' : '') + p.phase.substring(0, 11), marginL - 4, y + barH / 2);
        // phase bar on the cursor axis
        var px = marginL + (p.winStart - V.t0) / range * barW, pw = Math.max(3, (p.winEnd - p.winStart) / range * barW);
        ctx.globalAlpha = (ti === curIdx) ? 1 : 0.78; ctx.fillStyle = color; ctx.fillRect(px, y, pw, barH);
        // cost over/under cap on the trailing edge (red over, green under) — the variance signal
        ctx.globalAlpha = 1; ctx.fillStyle = over ? '#e53935' : '#26a69a';
        ctx.fillRect(px + pw - 3, y, 3, barH);
        // row highlight outline for the phase under the cursor
        if (ti === curIdx) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(px - 0.5, y - 0.5, pw + 1, barH + 1); }
      }
      // cursor hairline
      var hx = marginL + (_cursor - V.t0) / range * barW;
      if (hx >= marginL && hx <= marginL + barW) {
        ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, cH); ctx.stroke();
      }
    }

    // compact per-phase variance list — committed vs planned, ΔCost from records.
    var list = document.getElementById('tm-var-list');
    if (list) {
      var html = '';
      V.phases.forEach(function (p, i) {
        var dc = (p.dCost >= 0 ? '+' : '') + _money(p.dCost);
        var col = p.dCost > 0 ? '#ff6b6b' : '#26a69a';
        var sp = SP ? SP.phases[i] : null;                      // E3 — the per-phase projected schedule slip
        var spTxt = sp ? ' <span style="color:' + slipColor(sp.slipDays) + '" title="projected from cost">' + slipTxt(sp.slipDays) + '</span>' : '';
        html += '<div style="display:flex;justify-content:space-between;gap:6px' + (i === curIdx ? ';color:#fff;font-weight:bold' : '') + '">' +
          '<span>' + (p.marquee ? '⚠ ' : '') + p.phase + '</span>' +
          '<span style="color:' + col + '">' + dc + ' (' + (p.pct >= 0 ? '+' : '') + p.pct + '%)' + spTxt + '</span></div>';
      });
      list.innerHTML = html;
    }
    console.log('§TM_VARIANCE source=twin building="' + _twin.building + '" phases=' + V.phases.length +
      ' plannedCost=' + V.tP + ' committedCost=' + V.tA + ' over=' + V.pctOver + '% curPhase=' +
      (curIdx >= 0 ? V.phases[curIdx].phase : '-'));
    if (SP) console.log('§SCHED_PROJECT source=projected-from-cost building="' + _twin.building +
      '" projEnd=' + fmtD(SP.projEnd) + ' projSlipDays=' + SP.projSlipDays + ' rProj=' + SP.rProj.toFixed(3) +
      ' phases=' + SP.phases.map(function (x) { return x.phase + ':' + (x.slipDays >= 0 ? '+' : '') + x.slipDays + 'd'; }).join(','));
    if (EVM) console.log('§EVM_FOLD source=twin(cost) cursor=' + Math.round(_cursor) + ' EV=' + EVM.EV +
      ' AC=' + EVM.AC + ' CPI=' + EVM.CPI.toFixed(3) + ' CV=' + EVM.CV + ' BAC=' + EVM.BAC + ' EAC=' + EVM.EAC + ' VAC=' + EVM.VAC);
  }

  // buildGanttTasks() — THIN WRAPPER (§S53, F3). The model lives in gantt_model.js
  // (GanttModel.buildTasks): the §S51 grouping precedence (task id -> cell stamp -> storey|phase),
  // the §GANTT_MINI_TRIM Tukey bar-span trim, and the SEQUENCE_RULES-derived §GANTT_ROW_ORDER sort,
  // all moved there verbatim with their comments. This function keeps what is genuinely
  // time_machine's: the K0 dirty-flag gate, the state assignment, and the three §-log proof lines.
  function buildGanttTasks() {
    if (!_ganttDirty) return;
    var GM = (typeof window !== 'undefined' && window.GanttModel) || null;
    if (!GM) { console.warn('§LOAD_FAIL gantt_model.js — buildGanttTasks skipped, bars unchanged'); return; }
    _ganttDirty = false;
    var idx = buildTaskIndex();
    var r = GM.buildTasks(_ops, idx, (typeof window !== 'undefined' && window.SEQUENCE_RULES) || null);
    _ganttTasks = r.tasks;
    _ganttIdentified = r.identified; _ganttUnidentified = r.unidentified;
    _ganttSpanFromTask = r.spanFromTask || 0; _ganttSpanFromOps = r.spanFromOps || 0;

    // §S58 (4D_GANTT_TM_REFACTOR.md §S58.1a): these three lines used to be gated on
    // `_ganttTasksComputed`, a "log once flag" reset only at building-close — so they reported the
    // FIRST build of a building and never again. But this function recomputes the whole model
    // whenever `_ganttDirty` is set, i.e. after every drag, retime, group-move, link and undo,
    // which is exactly when a reader needs the numbers. A drag that duplicated bars, reordered
    // phases or flipped the editable/non-editable mix was invisible in the log for the rest of the
    // session. Now reported on every real REBUILD. NOT per-frame: the `!_ganttDirty` early-return
    // above means a redraw with an unchanged model logs nothing.
    {
      _ganttRebuildN++;
      var _idBars = 0;
      for (var bi = 0; bi < _ganttTasks.length; bi++) if (_ganttTasks[bi].taskId) _idBars++;
      console.log('§GANTT_MINI tasks=' + _ganttTasks.length + ' rebuild=' + _ganttRebuildN);
      // §GANTT_CPM_ANNOTATE (§S68) — prime float/criticality ONCE per building, so the critical path
      // is on screen before the first edit. Deliberately not per-rebuild: every rebuild past this one
      // is edit-driven, and each edit path already re-annotates itself after its own retime, so a
      // per-rebuild call would run CPM twice for every drag. Reset with the rest of the per-building
      // state on deactivate.
      if (!_cpmPrimed) { _cpmPrimed = true; _tmAnnotateCpm(); }
      // K0 proof line: how many bars carry a real tasks.task_id (i.e. are addressable by the edit
      // verbs) vs how many are still the un-authored storey|phase fallback. editable=0 means no
      // authored schedule exists for this building, NOT that the join failed.
      // K1 proof line: the row order actually drawn, so "is substructure first" is checkable from the
      // log instead of from a screenshot.
      console.log('§GANTT_ROW_ORDER rebuild=' + _ganttRebuildN + ' phases=' +
        JSON.stringify(_ganttTasks.map(function (t) { return t.phase; })
        .filter(function (p, i, arr) { return i === 0 || arr[i - 1] !== p; })));
      console.log('§GANTT_BAR_IDENTITY rebuild=' + _ganttRebuildN +
        ' schedule=' + ((_taskIndex && _taskIndex.scheduleId) || 'none') +
        ' bars=' + _ganttTasks.length + ' editable=' + _idBars +
        ' opsWithTask=' + _ganttIdentified + ' opsWithout=' + _ganttUnidentified +
        ' modelTasks=' + ((_taskIndex && _taskIndex.n) || 0));
      // §GANTT_BAR_IS_ITS_TASK (§S65 STAGE 3) — where each bar's SPAN came from. spanFromTask is the
      // authored window (the correct source); spanFromOps is the Tukey envelope over member elements,
      // now only the un-authored fallback. Before this fix every bar was spanFromOps, and on
      // HHS_Office_Federated that drew "Superstructure — Roof Level" 0.6px wide against its own
      // 101.4px window (0.6%), with a mean absolute start error of 5.33 days across 17 bars.
      console.log('§GANTT_BAR_SPAN_SOURCE rebuild=' + _ganttRebuildN +
        ' spanFromTask=' + _ganttSpanFromTask + ' spanFromOps=' + _ganttSpanFromOps +
        ' bars=' + _ganttTasks.length);
      _ganttTasksComputed = true;
    }
  }

  // §GANTT_RULER (E5) — the drawer's time axis. Ticks are chosen so labels land roughly every 80px
  // and always on a "nice" day interval, so the axis stays readable from a 30-day Duplex to a
  // 1000-day Terminal without any per-building tuning. Returns the tick times so the bar canvas can
  // draw matching gridlines — one source of truth for where a date sits horizontally.
  var _RULER_STEPS = [1, 2, 5, 7, 14, 30, 60, 90, 180, 365, 730];
  // §GANTT_AXIS_OUTLIER: ruler geometry is DISPLAY — uses the qualified axis (_ganttAxisStart/End),
  // never the real playback _projectStart/_projectEnd. See the var declarations for why.
  function ganttRulerTicks(barW) {
    var range = Math.max(1, _ganttAxisEnd - _ganttAxisStart);
    var totalDays = range / 86400000;
    var pxPerDay = barW / totalDays;
    var step = _RULER_STEPS[_RULER_STEPS.length - 1];
    for (var i = 0; i < _RULER_STEPS.length; i++) {
      if (_RULER_STEPS[i] * pxPerDay >= 80) { step = _RULER_STEPS[i]; break; }
    }
    var ticks = [];
    for (var d = 0; d <= totalDays; d += step) ticks.push({ day: Math.round(d), ts: _ganttAxisStart + d * 86400000 });
    return { ticks: ticks, step: step, totalDays: totalDays };
  }

  function drawGanttRuler(cW, marginL, barW) {
    var rc = document.getElementById('tm-gantt-ruler');
    if (!rc) return null;
    var H = 18, dpr = window.devicePixelRatio || 1;
    rc.width = cW * dpr; rc.height = H * dpr; rc.style.height = H + 'px';
    var ctx = rc.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cW, H);
    var R = ganttRulerTicks(barW);
    var range = Math.max(1, _ganttAxisEnd - _ganttAxisStart);
    // "Day N" origin label in the storey-label gutter, so the axis reads as project days too.
    ctx.fillStyle = '#8a97a5'; ctx.font = '9px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Day', 4, H / 2);
    var longSpan = R.step >= 30;
    ctx.strokeStyle = 'rgba(120,140,160,0.35)'; ctx.lineWidth = 1;
    R.ticks.forEach(function (t) {
      var x = marginL + (t.ts - _ganttAxisStart) / range * barW;
      if (x < marginL - 0.5 || x > marginL + barW + 0.5) return;
      ctx.beginPath(); ctx.moveTo(x + 0.5, H - 5); ctx.lineTo(x + 0.5, H); ctx.stroke();
      var dt = new Date(t.ts);
      // Real calendar date, plus the project-day number the rest of the drawer already speaks in.
      var lbl = longSpan
        ? dt.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
        : dt.getDate() + ' ' + dt.toLocaleDateString(undefined, { month: 'short' });
      ctx.fillStyle = '#aab6c2'; ctx.textAlign = 'center';
      ctx.fillText(lbl, x, 5);
      ctx.fillStyle = '#68758a';
      ctx.fillText('d' + t.day, x, 13);
    });
    // Cursor marker on the axis, same orange as the hairline. Clamped into [0,1] — the real _cursor
    // can legitimately sit past the qualified axis (e.g. scrubbed to the outlier op itself); off the
    // qualified ruler is the correct place for that, not a reason to hide the marker entirely.
    var hxFrac = Math.max(0, Math.min(1, (_cursor - _ganttAxisStart) / range));
    var hx = marginL + hxFrac * barW;
    if (hx >= marginL && hx <= marginL + barW) {
      ctx.fillStyle = '#ff8c00';
      ctx.beginPath(); ctx.moveTo(hx, H - 6); ctx.lineTo(hx - 4, H); ctx.lineTo(hx + 4, H); ctx.closePath(); ctx.fill();
    }
    return R;
  }

  // §TM_PANEL_RESIZE — drag tm-panel-resize-grip to widen the WHOLE drawer past its 376px default.
  // _panel is centered (left:50%/translateX(-50%)), so dragging the right edge by dx pixels must
  // grow width by 2*dx for the edge to actually track the cursor 1:1 (the invisible left edge moves
  // -dx to keep centered) — see wirePanelResize's pointermove for the derivation.
  var _panelW = 0;            // 0 = follow the stylesheet default (376px); set once the user drags
  var _panelWPreEdit = null;  // width to restore to when Editing turns back off (auto-expand undo)
  var PANEL_W_DEFAULT = 376, PANEL_W_EDIT = 560, PANEL_W_MIN = 320;

  function wirePanelResize() {
    var grip = document.getElementById('tm-panel-resize-grip');
    if (!grip || !_panel || grip._wired) return;
    grip._wired = true;
    var startX = 0, startW = 0, dragging = false;
    grip.addEventListener('pointerdown', function (e) {
      dragging = true; startX = e.clientX; startW = _panel.getBoundingClientRect().width;
      _panel.classList.add('tm-panel-resizing');
      grip.classList.add('tm-gripping');
      grip.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
    });
    grip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var maxW = Math.min(Math.round(window.innerWidth * 0.92), 900);
      var w = Math.max(PANEL_W_MIN, Math.min(maxW, Math.round(startW + 2 * (e.clientX - startX))));
      _panelW = w;
      _panel.style.width = w + 'px';
      e.preventDefault(); e.stopPropagation();
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      _panel.classList.remove('tm-panel-resizing');
      grip.classList.remove('tm-gripping');
      try { grip.releasePointerCapture(e.pointerId); } catch (err) {}
      console.log('§TM_PANEL_RESIZE width=' + _panelW + 'px');
    }
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  // §TM_PANEL_RESIZE_H — companion to wirePanelResize() above, same grip/pointer-capture pattern,
  // mirrored onto the panel's bottom edge. FIX (2026-08-06, user: "it seems there is an inner frame
  // for the gantt chart panel... it does not be max" — confirmed live): this used to grow the OUTER
  // _panel shell only, leaving the actual content (#tm-gantt-box, the Gantt canvas) clipped at its
  // own separate height cap — so the drag looked like it worked but never uncrammed any content.
  // Now it drives the SAME #tm-gantt-box / _ganttBoxH that the internal top-strip grip
  // (wireGanttResize, §GANTT_RESIZE E6) already owns — this is just a second, more discoverable
  // entry point to that one real resize, not a second independent mechanism. _panel itself has no
  // height cap of its own (flex column, grows to fit content) so it naturally follows the box taller
  // — no outer-panel style needed at all, exactly like the top-strip grip already proves works.
  function wirePanelResizeHeight() {
    var grip = document.getElementById('tm-panel-resize-grip-b');
    var box = document.getElementById('tm-gantt-box');
    if (!grip || !box || grip._wired) return;
    grip._wired = true;
    var startY = 0, startH = 0, dragging = false;
    grip.addEventListener('pointerdown', function (e) {
      dragging = true; startY = e.clientY; startH = box.clientHeight;
      if (_panel) _panel.classList.add('tm-panel-resizing');
      grip.classList.add('tm-gripping');
      grip.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
    });
    grip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      // Grip sits at the drawer's BOTTOM edge (opposite of tm-gantt-grip's top-edge placement), so
      // dragging DOWN (positive dy) grows it — same clamp bounds as wireGanttResize for consistency.
      var h = Math.max(80, Math.min(Math.round(window.innerHeight * 0.75), startH + (e.clientY - startY)));
      _ganttBoxH = h;
      box.style.maxHeight = h + 'px';
      e.preventDefault(); e.stopPropagation();
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      if (_panel) _panel.classList.remove('tm-panel-resizing');
      grip.classList.remove('tm-gripping');
      try { grip.releasePointerCapture(e.pointerId); } catch (err) {}
      console.log('§TM_PANEL_RESIZE_H height=' + _ganttBoxH + 'px rows=' + _ganttTasks.length);
    }
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  // §TM_RULER_SHIFT UI — drag the day ruler to move the whole project's start/finish (user ruling
  // 2026-08-05). Same lock gate as bar drag/resize/link (this is the biggest possible edit, not a
  // reason to exempt it from the lock). Uses the SAME axis math as ganttHit's dayPx so a drag of N
  // pixels always means the same N days everywhere in the drawer, ruler included.
  function wireGanttRulerShift() {
    var rc = document.getElementById('tm-gantt-ruler');
    if (!rc || rc._shiftWired) return;
    rc._shiftWired = true;
    var startX = 0, dragDays = 0, dragging = false;
    rc.addEventListener('pointerdown', function (e) {
      if (!_ganttEditable) {
        console.log('§TM_RULER_SHIFT_REJECT reason=locked');
        var t0 = document.getElementById('tm-gantt-tip');
        if (t0) {
          t0.textContent = 'Locked — click 🔒 Locked to enable editing';
          t0.style.display = 'block';
          setTimeout(function () { t0.style.display = 'none'; }, 2200);
        }
        return;
      }
      dragging = true; startX = e.clientX; dragDays = 0;
      try { rc.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault(); e.stopPropagation();
    });
    rc.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var range = Math.max(1, _ganttAxisEnd - _ganttAxisStart);
      var barW = Math.max(1, rc.clientWidth - 60);   // 60 = the storey-label gutter, same as ganttHit/drawGanttMini
      var dayPx = barW / (range / 86400000);
      dragDays = Math.round((e.clientX - startX) / Math.max(0.001, dayPx));
      var tip = document.getElementById('tm-gantt-tip');
      if (tip) {
        tip.textContent = 'Shift whole schedule ' + (dragDays >= 0 ? '+' : '') + dragDays + 'd';
        tip.style.left = '4px'; tip.style.top = '20px'; tip.style.display = 'block';
      }
      e.preventDefault(); e.stopPropagation();
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      try { rc.releasePointerCapture(e.pointerId); } catch (err) {}
      var tip = document.getElementById('tm-gantt-tip');
      if (tip) tip.style.display = 'none';
      if (dragDays) shiftGanttSchedule(dragDays);
    }
    rc.addEventListener('pointerup', end);
    rc.addEventListener('pointercancel', end);
  }

  // §GANTT_RESIZE (E6) — drag the grip to make the drawer taller than the CSS 220px cap. Inline
  // max-height wins over the .tm-drawer-bottom.open rule, so the class keeps owning open/close and
  // this only owns the height. Reuses the same pointer-capture idiom as makeDraggable.
  var _ganttBoxH = 0;   // 0 = follow the stylesheet default
  function wireGanttResize() {
    var grip = document.getElementById('tm-gantt-grip');
    var box = document.getElementById('tm-gantt-box');
    if (!grip || !box || grip._wired) return;
    grip._wired = true;
    var startY = 0, startH = 0, dragging = false;
    grip.addEventListener('pointerdown', function (e) {
      dragging = true; startY = e.clientY; startH = box.clientHeight;
      grip.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
    });
    grip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      // Grip sits at the drawer's TOP edge, so dragging UP (negative dy) grows it.
      var h = Math.max(80, Math.min(Math.round(window.innerHeight * 0.75), startH + (startY - e.clientY)));
      _ganttBoxH = h;
      box.style.maxHeight = h + 'px';
      e.preventDefault(); e.stopPropagation();
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      try { grip.releasePointerCapture(e.pointerId); } catch (err) {}
      console.log('§GANTT_RESIZE height=' + _ganttBoxH + 'px rows=' + _ganttTasks.length);
    }
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  // ── §GANTT_DRAG (E1/E2) + §GANTT_RETIME (W1) ──────────────────────────────────────────────────
  // The UI half of the constraint-aware edit. The ENGINE half lives in schedule_author.js
  // (moveTaskCascade / resizeTask) and is witnessed independently — this layer only translates a
  // gesture into a date and then re-times the affected elements so the movie cannot disagree with
  // the chart it was dragged on.
  var _drag = null;            // { bar, mode:'move'|'resizeL'|'resizeR', x0, dayPx, previewDays }
  var _dragConsumed = false;   // set on a committed edit so the seek handler ignores that pointerup
  var EDGE_PX = 5;             // grab zone at each bar end — inside this, a drag resizes, not moves

  // §GANTT_EDIT_LOCK (user ruling 2026-08-05): the drawer is the ONLY editing surface now — no more
  // side-panel button. Default LOCKED so an accidental drag can never move a date; the user flips it
  // ON deliberately to edit. Gates drag/resize (wireGanttDrag pointerdown, which also gates the E3
  // drag-to-link since endDrag never runs without a live _drag) and the E7 props dblclick (typed
  // retime + unlink). Playback/scrub/seek/render are NEVER gated — the canvas stays live feedback
  // regardless of lock state (user: "if canvas is runtime responsive, it gives the user feedback
  // which is desirable"). Persistence model is UNCHANGED: every accepted edit still writes straight
  // to the tasks/kernel_ops tables the instant it's committed (same as before this toggle existed,
  // §GANTT_EDIT_UNDO already covers the single-level undo of that immediate write) — the toggle is a
  // UI lock only, not a new draft/commit layer.
  var _ganttEditable = false;
  var _ganttAutoGenAttempted = false;  // reset per activate() — one auto-generate attempt per open

  // §GANTT_GROUP_MOVE (user ruling 2026-08-05): marquee-select a cluster of bars (MS-Word-style —
  // drag from EMPTY canvas space, sweep into the bars you want), then dragging any SELECTED bar
  // moves the whole group together (same uniform-shift primitive as §TM_RULER_SHIFT, scoped to the
  // selection instead of the whole project). Ephemeral, never persisted — same convention as
  // selecting files in a file manager: it exists between "marquee" and "click away," nothing more.
  // Click any empty canvas space (a marquee drag that ends up ~zero-size) clears it — same gesture
  // starts a NEW marquee and dissolves the OLD selection in one motion, no separate "ungroup" verb.
  var _ganttSelected = {};   // taskId -> true
  var _marquee = null;       // { x0, y0, x1, y1 } in canvas-local px while a marquee drag is live
  var _groupDrag = null;     // { taskIds, x0, y0, dayPx, days, moved } while dragging a selected bar

  // §GANTT_EDIT_UNDO — single-level (not a stack): a drag can cascade N successors with no way back
  // except regenerating the whole schedule (real gap, this session's own edit UI made it possible).
  // Scope is deliberately narrow: only commitGanttDrag (E1/E2 move/resize) sets this, not link/unlink
  // or the property panel — matching exactly the need named in 4D_SCHEDULE_PERFECTION.md, not a
  // speculative general undo system. { schedId, tasksBefore:{taskId:{start,finish,duration}},
  // opsBefore:{guid:{start_ts,end_ts,parameters}}, taskId, mode } — cleared on every fresh TM activate().
  var _lastEdit = null;

  // Which bar (and where on it) is under the pointer? Extends findBarAtClick with an edge zone so a
  // single gesture can mean either E1 (move) or E2 (edge-pull), the way P6/MSP behave.
  function ganttHit(e) {
    var bar = findBarAtClick(e);
    if (!bar) return null;
    var rect = e.target.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var marginL = 60, barW = rect.width - marginL;
    // §GANTT_AXIS_OUTLIER: must match the qualified axis findBarAtClick/drawGanttMini now use.
    var range = Math.max(1, _ganttAxisEnd - _ganttAxisStart);
    var bx = marginL + (bar.startTs - _ganttAxisStart) / range * barW;
    var bw = Math.max(2, (bar.endTs - bar.startTs) / range * barW);
    var mode = 'move';
    if (x <= bx + EDGE_PX) mode = 'resizeL';
    else if (x >= bx + bw - EDGE_PX) mode = 'resizeR';
    return { bar: bar, mode: mode, dayPx: barW / (range / 86400000) };
  }

  // §GANTT_RETIME (W1) — after an accepted edit, re-time the affected tasks' OWN elements onto their
  // new window. This is what keeps the drawer and the 3D movie from diverging: the bar's drawn span
  // is derived from the element ops (§GANTT_BAR_IDENTITY), so moving the elements IS what moves the
  // bar. Coherence is structural rather than policed afterwards.
  //
  // The remap is AFFINE over each element's existing position in its old window, deliberately: a
  // zone's internal ordering was already computed correctly by the engine (computeSchedule, plus this
  // session's support fixes), so an edit must PRESERVE that order, not re-derive it. Only the window
  // the order is stretched across changes.
  // The remap itself, kept pure and self-contained so witness_gantt_edit_coherence.js can slice it
  // out of THIS source and test the shipped function rather than a hand-copied duplicate (the copy
  // problem this codebase already paid for three times with the support predicate).
  function _retimeSpan(opS, opE, oS, oE, nS, nE) {
    // §S7_OUTLIER_DELTA (4D_GANTT_TM_REFACTOR.md §S7, measured live 2026-08-16: Terminal roof task
    // n=11,004 had 440 ops outside its drawn bar; a drag collapsed 437 to the 60s floor and
    // INVERTED 217 — end before start by up to -3.6h — because the affine map below assumes
    // containment and extrapolates-then-clamps an outsider). An op outside the OLD window is a
    // dag-wins Tukey outlier the bar deliberately excludes (M2: "counted, never hidden") — the
    // edit-side rule is the same doctrine: never squeeze it into the window. It gets the window's
    // uniform START delta with its TRUE duration preserved (a move shifts it with the task; a
    // right-edge resize leaves it untouched, since nS==oS ⇒ delta 0).
    if (opS < oS - 1 || opE > oE + 1) {
      var ds = nS - oS;
      return { s: Math.round(opS + ds), e: Math.round(opE + ds) };
    }
    var oSpan = Math.max(1, oE - oS), nSpan = Math.max(1, nE - nS);
    var s = Math.round(nS + ((opS - oS) / oSpan) * nSpan);
    var e = Math.round(nS + ((opE - oS) / oSpan) * nSpan);
    if (s < nS) s = nS;
    if (e > nE) e = nE;
    if (e <= s) e = Math.min(nE, s + 60000);
    return { s: s, e: e };
  }

  function retimeTaskElements(db, barsByTask, moved, tasksBefore) {
    var upd = db.prepare("UPDATE kernel_ops SET timestamp = ?, parameters = ? " +
      "WHERE op_type = 'ELEMENT_PLACE' AND output_guid = ?");
    var opByGuid = {}, i;
    for (i = 0; i < _ops.length; i++) if (_ops[i].output_guid) opByGuid[_ops[i].output_guid] = _ops[i];
    var rows = 0, t0 = (window.performance || Date).now();
    // §RETIME_OUTLIER_AUDIT (4D_GANTT_TM_REFACTOR.md §S7 step 1 — measure, don't assume): count,
    // per commit, the ops whose TRUE times sit outside their task's OLD drawn window (the Tukey
    // outliers M2 deliberately leaves riding outside the bar) and what duration _retimeSpan hands
    // each one back. collapsed = duration crushed to the 60s floor; inverted = end before start.
    var audOutside = 0, audCollapsed = 0, audInverted = 0, audMinDur = Infinity, audMaxDur = -Infinity;
    // §S22_EPOCH_FIX (4D_GANTT_TM_REFACTOR.md §S22, MEASURED 2026-08-17 on a real +10d drag —
    // Clinic TASK_MEP_Rough_in_Level_1: bar.startTs/endTs went 1970-01-09..1970-03-23 -> AFTER the
    // drag, 2026-08-23..2026-11-18. m.start/m.finish (ScheduleAuthor's moveTaskCascade/resizeTask/
    // shiftSchedule/shiftTasks result) are REAL absolute calendar dates on the `tasks` table's OWN
    // clock (materializeZones seeds it from real "today", schedule_author.js:386/480 — `start` opt +
    // day-count added via _addDays). bar.startTs/endTs (oS/oE) and every op's start_ts/end_ts are on
    // the TM's OWN internal clock (kernel_ops.timestamp, sourced from cpm_schedule.js's zero-anchored
    // day-offset solve — confirmed near-1970 by design, matching the raw solver dumps quoted
    // elsewhere in this lane). Date.parse(m.start)-ing directly and feeding it to _retimeSpan
    // alongside oS/oE (a DIFFERENT, day-offset clock) spliced the dragged task's ops onto a
    // timescale ~57 YEARS from the rest of the untouched project: _projectEnd (computeDays() takes
    // Math.max over ALL ops) ballooned to match, so the rest of the schedule occupied 0.5% of the
    // resulting scrub range — practically unreachable by a live drag-scrub, matching the live user
    // report ("scrubbing didn't solve it") even though a scripted absolute-cursor jump COULD still
    // land there (§S22's own diagnostic evidence, both correct in isolation, missed this).
    // Fix: convert m.start/m.finish into TM-clock units via tasksBefore[m.id] — the SAME `tasks`
    // table, SAME clock, snapshotted immediately before the ScheduleAuthor verb ran (already
    // captured at every one of retimeTaskElements's 3 call sites for undo, just never passed in
    // here). A pure DAY-COUNT DELTA is clock-agnostic: both clocks share 86400000ms/day granularity,
    // only their zero-point differs, so (Date.parse(m.start) - Date.parse(before.start)) applied
    // onto oS/oE (already on the correct clock) needs no knowledge of either clock's absolute
    // zero-point. Sub-day rounding noise (materializeZones's Math.floor/ceil day-grid) can survive
    // the round trip — far below the severity of a decades-scale splice, and the same day-grain this
    // whole authoring pipeline already works in.
    var epochFixApplied = 0, epochFixSkippedNoBefore = 0;
    db.run('BEGIN');
    moved.forEach(function (m) {
      var bar = barsByTask[m.id]; if (!bar || !bar.guids || !bar.guids.length) return;
      var tb = tasksBefore && tasksBefore[m.id];
      var nS, nE;
      if (tb && tb.start && tb.finish) {
        var oldRealS = Date.parse(tb.start + 'T00:00:00Z'), oldRealE = Date.parse(tb.finish + 'T00:00:00Z');
        var newRealS = Date.parse(m.start + 'T00:00:00Z'), newRealE = Date.parse(m.finish + 'T00:00:00Z');
        if (isNaN(oldRealS) || isNaN(oldRealE) || isNaN(newRealS) || isNaN(newRealE)) return;
        nS = Math.round(bar.startTs + (newRealS - oldRealS));
        nE = Math.round(bar.endTs + (newRealE - oldRealE));
        epochFixApplied++;
        console.log('§S22_EPOCH_FIX_DETAIL task=' + m.id + ' tb.start=' + tb.start + ' tb.finish=' + tb.finish +
          ' m.start=' + m.start + ' m.finish=' + m.finish + ' oS=' + bar.startTs + ' oE=' + bar.endTs +
          ' deltaSdays=' + ((newRealS - oldRealS) / 86400000).toFixed(2) + ' nS=' + nS + ' nE=' + nE);
      } else {
        // No before-snapshot for this task — refuse rather than guess a cross-clock splice. Every
        // real call site (commitGanttDrag/shiftGanttSchedule/commitGanttGroupShift) captures
        // tasksBefore for every task it's about to touch, so this should never fire live; it exists
        // as a fail-safe, not a fallback path to lean on.
        epochFixSkippedNoBefore++;
        return;
      }
      if (isNaN(nS) || isNaN(nE) || nE <= nS) return;
      var oS = bar.startTs, oE = bar.endTs, oSpan = Math.max(1, oE - oS), nSpan = nE - nS;
      for (var gi = 0; gi < bar.guids.length; gi++) {
        var g = bar.guids[gi], op = opByGuid[g]; if (!op) continue;
        var wasOutside = (op.start_ts < oS - 1 || op.end_ts > oE + 1);
        var r = _retimeSpan(op.start_ts, op.end_ts, oS, oE, nS, nE);
        if (wasOutside) {
          audOutside++;
          var audDur = r.e - r.s;
          if (audDur <= 60000) audCollapsed++;
          if (audDur < 0) audInverted++;
          if (audDur < audMinDur) audMinDur = audDur;
          if (audDur > audMaxDur) audMaxDur = audDur;
        }
        op.start_ts = r.s; op.end_ts = r.e;
        op.parameters._end_ts = r.e;
        upd.run([r.s, JSON.stringify(op.parameters), g]);
        rows++;
      }
    });
    db.run('COMMIT');
    upd.free();
    console.log('§GANTT_RETIME tasks=' + moved.length + ' rows=' + rows +
      ' ms=' + ((window.performance || Date).now() - t0).toFixed(1));
    console.log('§RETIME_OUTLIER_AUDIT outsideOldWindow=' + audOutside + ' collapsed60s=' + audCollapsed +
      ' inverted=' + audInverted +
      (audOutside ? ' outlierDurMs=[' + audMinDur + ',' + audMaxDur + ']' : '') +
      ' — outliers ride outside their bar (M2); collapse/inversion here is the §S7 edit-path defect');
    console.log('§S22_EPOCH_FIX clockTranslated=' + epochFixApplied + ' skippedNoBefore=' + epochFixSkippedNoBefore +
      ' — nS/nE derived via tasksBefore day-delta, never a raw Date.parse(m.start) splice onto the TM clock');
    return rows;
  }

  // §GANTT_RETIME_RESYNC (2026-08-07, 4D_SCHEDULE_PERFECTION.md §4D_LAYER_TRUTH follow-on — user
  // report: "foundation piling nor others does not come onto canvas anymore, though i dragged to
  // certain bars passing", witnessed as §PERF_TRAVERSE cand=0 on every scrub after §GANTT_RETIME):
  // retimeTaskElements moves the ops' timestamps, but THREE derived structures kept the old times —
  // (1) the §PERF_INCR event index (_evMesh), so the incremental reveal skipped meshes straight
  // across their new transitions (the blackout); (2) _ops' sort order (consumers binary-search it);
  // (3) the §XRAY solidify cache (stale carrier ends). One resync, called by every retime commit
  // path (drag, ruler shift, group shift, undo) — same drop-pattern deactivate() already uses.
  function _tmResyncAfterRetime() {
    _ops.sort(function (a, b) { return a.start_ts - b.start_ts; });
    _evMesh = null; _evSig = ''; _incrPrimed = false;   // §PERF_INCR: force full rebuild next tick
    _tmRebuildXrayCache();
  }

  // ── §GANTT_CPM_ANNOTATE — float + critical path, DERIVED from the edit, never driving it ────────
  // Implementing bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S68 (product decision, 2026-08-23:
  // "go with annotate"). Settles the standing question "does the drag run CPM?" — it does not, and
  // deliberately still does not. moveTaskCascade's push-only cascade + predecessor-floor clamp stays
  // the date engine. CPM runs AFTER it, in fixedDates mode, purely to derive float/criticality FROM
  // the dates the cascade just wrote.
  // Why fixedDates is mandatory here: computeCpm's derived forward pass (max over predecessors'
  // EF+lag) compounds independently-fitted lags on a multi-parent zone graph — MEASURED at PF=138d
  // against the real movie's 93d on Terminal's 71-zone graph, +48% (schedule_author.js:1385). A drag
  // that silently restretches the project by half is worse than the honest cascade. With the flag,
  // ES/EF come straight from the persisted dates and only the BACKWARD pass runs, over real edges,
  // so total float and is_critical stay meaningful.
  // computeCpm's only write is early_*/late_*/free_float/total_float/is_critical — it never touches
  // schedule_start/schedule_finish/schedule_duration. That is the whole safety property of this
  // feature, and it is witnessed byte-for-byte (W-CPM-2), not assumed from reading the code.
  // §S75 — ONE definition of the float palette. The rail on the canvas and the legend swatch in the
  // drawer must be the same colour by construction; two hex literals in two files is how a legend
  // ends up quietly explaining a colour the bars no longer use.
  var CPM_COLOR_CRITICAL = '#e53935';   // zero float — this task cannot slip without moving the end date
  var CPM_COLOR_FLOAT = '#26a69a';      // has slack
  var _ganttCritical = {};   // taskId -> { critical, totalFloat } — DISPLAY state, not a date source
  var _cpmPrimed = false;    // first-build annotate ran for this building (reset on deactivate)
  // _tmCpmLegend(marks) — §S75. null/empty ⇒ the strip is cleared: a legend that keeps showing the
  // last building's counts after a bail is worse than no legend.
  function _tmCpmLegend(crit, slack, pf, minF, maxF) {
    var el = (typeof document !== 'undefined') && document.getElementById('tm-gantt-cpmlegend');
    if (!el) return;
    if (crit === null) { el.textContent = ''; el.removeAttribute('title'); return; }
    var sw = function (c) {
      return '<span style="display:inline-block;width:12px;height:3px;background:' + c +
        ';vertical-align:middle;margin-right:3px"></span>';
    };
    el.innerHTML = sw(CPM_COLOR_CRITICAL) + '<b style="color:#c9d3dd">' + crit + '</b> critical' +
      '<span style="margin:0 5px">·</span>' + sw(CPM_COLOR_FLOAT) + '<b style="color:#c9d3dd">' + slack + '</b> with float';
    el.title = 'Critical Path Method, recomputed after every edit. Red = zero total float: the task ' +
      'cannot slip without moving the project end. Green = it has slack.\n' +
      'Project duration ' + pf + 'd · total float ' + minF + '..' + maxF + 'd.\n' +
      'CPM reads the dates the drag produced — it never changes one.';
  }

  function _tmAnnotateCpm(schedId) {
    var app = A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.computeCpm) {
      console.log('§GANTT_CPM_ANNOTATE_SKIP reason=ScheduleAuthor_not_loaded');
      _tmCpmLegend(null);
      return null;
    }
    schedId = schedId || (_taskIndex && _taskIndex.scheduleId) || 'SCH_AUTHORED';
    // A `tasks` table predating the widened DDL has no is_critical column, so computeCpm's UPDATE
    // would throw INSIDE a drag commit. Probe first and refuse loudly — annotate must never be able
    // to break an edit that already succeeded.
    try { app.db.exec('SELECT is_critical FROM tasks LIMIT 1'); }
    catch (e) {
      console.log('§GANTT_CPM_ANNOTATE_SKIP reason=thin_tasks_table schedule=' + schedId);
      _tmCpmLegend(null);
      return null;
    }
    var r = null;
    try { r = SA.computeCpm(app.db, schedId, { fixedDates: true }); }
    catch (e) { console.log('§GANTT_CPM_ANNOTATE_SKIP reason=threw msg=' + (e && e.message)); _tmCpmLegend(null); return null; }
    if (!r || r.error) {
      // Cycle/orphan (computeCpm logs §SE_CPM_BAIL) or no tasks. 2 of the 7 fleet buildings still
      // carry cycles (4D_SCHEDULE_PERFECTION.md §MILESTONE), so this is a real, expected branch.
      // CLEAR the marks rather than leave stale ones on screen — never paint a critical path that
      // the current dates do not support.
      _ganttCritical = {};
      _tmCpmLegend(null);
      console.log('§GANTT_CPM_ANNOTATE_SKIP reason=' + (r ? r.error : 'no_result') + ' schedule=' + schedId);
      return null;
    }
    var marks = {}, crit = 0, minF = null, maxF = null;
    (r.tasks || []).forEach(function (t) {
      marks[t.id] = { critical: !!t.critical, totalFloat: t.totalFloat };
      if (t.critical) crit++;
      if (minF === null || t.totalFloat < minF) minF = t.totalFloat;
      if (maxF === null || t.totalFloat > maxF) maxF = t.totalFloat;
    });
    _ganttCritical = marks;
    var nT = (r.tasks || []).length;
    _tmCpmLegend(crit, nT - crit, r.projectDuration, minF, maxF);
    console.log('§GANTT_CPM_ANNOTATE schedule=' + schedId + ' tasks=' + nT +
      ' critical=' + crit + ' (' + (nT ? Math.round(crit / nT * 100) : 0) + '%) projectDuration=' +
      r.projectDuration + 'd float=' + minF + '..' + maxF + ' datesWritten=0 (fixedDates)');
    return r;
  }

  // Commit a finished gesture: engine verb → clamp/cascade result → re-time elements → redraw.
  // ── §TM_BAKE_LOCK — the film plays this timeline; do not edit it mid-record ───────────────────
  // Implementing bim-compiler prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md §S56.
  // User's rule, verbatim: "Alt-S movie making is a separation of concern. It runs the TM to record
  // the movie. User should not do both same time to avoid conflict." Until now that was DISCIPLINE,
  // not code: cinema_maxq.js sets A._maxqActive (:884) and dlod_nav.js/panels.js both honour it,
  // while time_machine.js — the thing being recorded — never read it at all.
  // The busy triple is the SAME one tmWarmXrayElements already uses below (see its comment: the
  // flags dlod_nav.js names as "not idle"). Extracted from that list rather than invented; there is
  // deliberately no new bake flag on APP, because a second source of truth is how these drift.
  // Refusal is LOUD and returns — never a silent no-op, never a queued edit applied after the bake.
  function _tmBusyRecording(app) {
    if (!app) return null;
    if (app._maxqActive) return 'maxq_bake';
    if (app._cinemaOrbitActive) return 'cinema_orbit';
    if (app._stillRefineActive) return 'still_refine';
    return null;
  }

  // _tmEditLocked(verb) — the ONE refusal, called by every timeline-mutating entry point.
  // Implementing bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S69. §S56 shipped this guard as five
  // duplicated lines inside commitGanttDrag and generateGanttSchedule; the five paths added since
  // (ruler shift, group shift, undo, link, typed apply/unlink) never got a copy, so a bake could be
  // desynced by any of them. Duplication was the mechanism — a rule that has to be re-typed at each
  // new call site is a rule that eventually is not. One helper, one log format, and W-TBL-5 derives
  // the list of callers from the code instead of trusting a hand-kept list.
  // Refusal stays LOUD and returns — never a silent no-op, never an edit queued and applied after
  // the bake finishes.
  function _tmEditLocked(verb) {
    var busy = _tmBusyRecording(A());
    if (!busy) return false;
    console.log('§TM_BAKE_LOCK refused=' + verb + ' reason=' + busy +
      ' — the film is playing this timeline; editing it mid-record would desync the recording');
    return true;
  }

  // _tmPersistEdit(what) — write the edited building back to the IndexedDB slot it was loaded from.
  // Implementing bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S70.
  // Until now an in-canvas Gantt edit lived ONLY in the in-memory sql.js db and died on reload.
  // retimeTaskElements writes kernel_ops with raw SQL rather than through KernelOps' commit API, so
  // kernel_ops.js's own debounce never fired for it, and nothing else persisted it either. This is
  // the same gap schedule_editor_ui.js (the Editor tab, since folded in — §TM_P6_FOLD) closed (§SE-6, "the gap that made every
  // schedule edit vanish on tab close") — same DB, same slot, same verb, just never wired here.
  // MEASURED cost of persistDb's whole-db export on the real fleet: Duplex 3ms, Terminal 10ms,
  // LTU 26ms, Clinic 47ms, JKR 70ms, Hospital (252MB) 86ms — one dropped frame at the worst, and
  // persistDb debounces 1200ms on top, so a burst of drags collapses to a single write.
  // Guards mirror §KRN_PERSIST_GUARD: only APP.db under the url APP.db's own bytes came from,
  // never a foreign db (a lens committing its own op-db under the building's key cost a P0 in
  // kernel_ops.js), and never when _cacheDisabled (incognito / low quota).
  // §TM_SPLITMODE_PERSIST_KEY (4D_GANTT_TM_REFACTOR.md §S78): a split-mode building's A.db is
  // loaded from metaUrl, not A.DB_URL (streaming.js) — persisting under A.DB_URL writes a slot
  // the reload path's cachedFetch(metaUrl) never reads, so the edit survives the write and is
  // silently unreachable on reload (measured on Hospital/Clinic, §S76). app._dbPersistUrl is set
  // by streaming.js at the exact point app.db is assigned, in BOTH the split and whole-db
  // branches — it is the one url that is always guaranteed to describe app.db's actual content,
  // so persisting under it (falling back to app.DB_URL only if a pre-this-fix build never set it)
  // keeps read-key and write-key derived from the same fact, not two independent guesses.
  function _tmPersistEdit(what) {
    var app = A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.persistDb) {
      console.log('§GANTT_EDIT_PERSIST_SKIP what=' + what + ' reason=ScheduleAuthor_not_loaded');
      return;
    }
    if (!app.DB_URL) { console.log('§GANTT_EDIT_PERSIST_SKIP what=' + what + ' reason=no_db_url'); return; }
    if (app._cacheDisabled) { console.log('§GANTT_EDIT_PERSIST_SKIP what=' + what + ' reason=cache_disabled'); return; }
    var persistUrl = app._dbPersistUrl || app.DB_URL;
    SA.persistDb(app.db, persistUrl, {}).then(function (ok) {
      console.log('§GANTT_EDIT_PERSIST what=' + what + ' url=' + persistUrl + ' ok=' + ok);
      // §GANTT_EDIT_PERSIST_FAIL (bim-compiler 4D_GANTT_TM_REFACTOR.md §5b) — a save that fails must
      // be LOUD. Before this the ok=false branch did nothing but log at info level: the edit stayed
      // on screen, looked saved, and was gone on the next reload. persistDb now reports false for a
      // real abort (§SCHED_PERSIST_ERR carries the reason), so say so where the user is looking.
      if (!ok) {
        console.warn('§GANTT_EDIT_PERSIST_FAIL what=' + what + ' url=' + persistUrl +
          ' — edit is in memory only and will NOT survive a reload');
        try { _tmSay('⚠ Could not save this edit — it will be lost on reload. See console (§SCHED_PERSIST_ERR).', 7000); } catch (e) {}
      }
    });
  }

  // ── §TM_SILENT_REFUSAL — every refusal the user can trigger gets a visible tip ─────────────────
  // Implementing the tm-error-handling spec (W-TM-SRT / W-TM-EXC). Before this, ten refusal paths
  // logged a §..._REJECT/§..._FAIL line and returned: the drag snapped back, the click did nothing,
  // and the user saw NOTHING (commitGanttDrag :6205/:6210/:6243/:6259, shiftGanttSchedule
  // :6347/:6363, commitGanttGroupShift :6401/:6418, the dblclick lock gate :6852, openGanttProps
  // :6934, linkGanttBars :6864 — pre-fix line numbers). Same centralization rationale as
  // _tmEditLocked above: a tip that has to be re-typed at each new refusal site is a tip that
  // eventually is not (witness_tm_silent_refusal_tips.js now gates that).
  function _tmTipRestore(tip) {
    // _tmSayException below loosens these so its inline action is clickable/wrappable; every
    // hide (and every fresh show) puts the drawer's original inline contract back.
    tip.style.pointerEvents = 'none';
    tip.style.whiteSpace = 'nowrap';
    tip.style.overflow = 'hidden';
  }
  function _tmSay(msg, ms) {
    var tip = document.getElementById('tm-gantt-tip');
    if (!tip) return;
    _tmTipRestore(tip);
    tip.textContent = msg;
    tip.style.display = 'block';
    setTimeout(function () { tip.style.display = 'none'; }, ms || 2600);
  }

  // ── §TM_EDIT_EXCEPTION — an edit pipeline that THROWS must not leave a stale frame ─────────────
  // Each edit verb runs a multi-step pipeline (engine verb → retimeTaskElements → resync → annotate
  // → persist → repaint). Before this, a throw anywhere in it propagated uncaught to
  // error_reporter.js's sitewide handler (generic "Something went wrong", 3-per-session cap, shared
  // app-wide) and TM's own display froze on whatever half-updated frame the throw interrupted.
  // On catch: log, then re-derive the display from the DB's REAL current state. Every recovery step
  // is an idempotent re-deriver (verified by reading each: _tmResyncAfterRetime re-sorts _ops and
  // nulls caches; invalidateGanttModel nulls flags; computeDays re-reads _placeOps(); drawGanttMini
  // rebuilds and redraws; renderAtTime paints visibility at the cursor) — the same five calls every
  // successful edit already ends with, and undoLastGanttEdit already re-runs after restoring the DB.
  // Each step is individually guarded so one failing step cannot rob the panel of the rest.
  function _tmEditExceptionRecover(fnName, e) {
    console.log('§TM_EDIT_EXCEPTION fn=' + fnName + ' error=' + (e && e.message));
    try { _tmResyncAfterRetime(); } catch (e2) { console.log('§TM_EDIT_EXCEPTION_RECOVER_SKIP step=resync error=' + (e2 && e2.message)); }
    try { invalidateGanttModel(); } catch (e2) { console.log('§TM_EDIT_EXCEPTION_RECOVER_SKIP step=invalidate error=' + (e2 && e2.message)); }
    try { computeDays(); } catch (e2) { console.log('§TM_EDIT_EXCEPTION_RECOVER_SKIP step=computeDays error=' + (e2 && e2.message)); }
    try { drawGanttMini(); } catch (e2) { console.log('§TM_EDIT_EXCEPTION_RECOVER_SKIP step=draw error=' + (e2 && e2.message)); }
    try { renderAtTime(_cursor); } catch (e2) { console.log('§TM_EDIT_EXCEPTION_RECOVER_SKIP step=render error=' + (e2 && e2.message)); }
    try { _tmSayException(e); } catch (e2) { console.log('§TM_EDIT_EXCEPTION_RECOVER_SKIP step=tip error=' + (e2 && e2.message)); }
  }

  // The TM-specific message (never the sitewide generic toast), plus the ONE concrete, low-risk
  // mitigation that is actually buildable from what exists: offering to close the OTHER open
  // panels. "Other panels" is grounded in the app's REAL registry — scene.js's _registerPanel /
  // window._panels ({id, el, nav, close}), using the exact visibility check _cyclePanel already
  // uses. The TM panel itself is NOT in that registry (hand-built #time-machine-panel appended to
  // document.body), so the id filter is belt-and-braces. Closing is ONLY ever user-clicked — the
  // offer is an inline button in the tip, never an automatic side-effect.
  function _tmVisibleOtherPanels() {
    var out = [];
    var reg = (typeof window !== 'undefined' && window._panels) || [];
    for (var i = 0; i < reg.length; i++) {
      var p = reg[i];
      if (!p || !p.el || p.el.id === 'time-machine-panel') continue;
      if (p.el.style.display !== 'none' && p.el.offsetWidth > 0) out.push(p);   // _cyclePanel's check
    }
    return out;
  }
  function _tmSayException(e) {
    var tip = document.getElementById('tm-gantt-tip');
    if (!tip) return;
    var shortReason = (e && e.message) ? String(e.message).slice(0, 90) : 'unexpected error';
    _tmTipRestore(tip);
    tip.textContent = 'Time Machine couldn\'t complete this edit — ' + shortReason;
    var others = [];
    try { others = _tmVisibleOtherPanels(); } catch (e2) {}
    var hidden = false;
    function hide() {
      if (hidden) return;
      hidden = true;
      tip.style.display = 'none';
      _tmTipRestore(tip);
    }
    if (others.length) {
      var btn = document.createElement('button');
      btn.textContent = 'Close other panels (' + others.length + ')';
      btn.style.cssText = 'display:block;margin-top:3px;font-size:10px;padding:1px 6px;cursor:pointer';
      btn.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var ids = [], n = 0;
        for (var i = 0; i < others.length; i++) {
          var p = others[i];
          try {
            if (typeof p.close === 'function') p.close();
            else p.el.style.display = 'none';
            ids.push(p.id); n++;
          } catch (e3) {}
        }
        console.log('§TM_CLOSE_OTHER_PANELS closed=' + n + ' ids=[' + ids.join(',') + ']');
        hide();
      });
      tip.appendChild(btn);
      // The drawer tip ships pointer-events:none + nowrap/ellipsis (fine for passive text, fatal
      // for a button) — loosen while the offer is up; hide()/_tmTipRestore puts it all back.
      tip.style.pointerEvents = 'auto';
      tip.style.whiteSpace = 'normal';
      tip.style.overflow = 'visible';
    }
    tip.style.display = 'block';
    setTimeout(hide, others.length ? 8000 : 3600);
  }

  function commitGanttDrag(bar, mode, deltaDays) {
    if (_tmEditLocked('commitGanttDrag')) return;
    var app = A();
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.moveTaskCascade) {
      console.log('§GANTT_DRAG_REJECT reason=ScheduleAuthor_not_loaded');
      _tmSay('Not available');   // §TM_SILENT_REFUSAL — same wording as setGanttBaseline/rescheduleGanttAsap's SA guard
      return;
    }
    if (!bar.taskId) {
      // Honest refusal: an un-authored bar has no task to move. Never fake the edit.
      console.log('§GANTT_DRAG_REJECT reason=bar_has_no_task storey="' + bar.storey + '" phase="' + bar.phase + '"');
      _tmSay('Not editable — no schedule task on this bar');   // §TM_SILENT_REFUSAL — same wording as wireGanttDrag's copy of this refusal
      return;
    }
    var schedId = (_taskIndex && _taskIndex.scheduleId) || 'SCH_AUTHORED';
    var d = function (ms) { return new Date(ms).toISOString().slice(0, 10); };

    // §GANTT_EDIT_UNDO — snapshot BEFORE the engine verb mutates `tasks`. Cascade scope isn't known
    // until the verb returns, so this captures every leaf task in the active schedule (cheap — a
    // handful to a few hundred rows), not just the dragged one.
    var tasksBefore = {};
    try {
      var tb = app.db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration ' +
        'FROM tasks WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)', [schedId]);
      if (tb.length) tb[0].values.forEach(function (row) {
        tasksBefore[row[0]] = { start: row[1], finish: row[2], duration: row[3] };
      });
    } catch (e) {}

    // §S22_EPOCH_FIX (4D_GANTT_TM_REFACTOR.md §S22, MEASURED 2026-08-17): the target date string
    // handed to moveTaskCascade/resizeTask used to be d(bar.startTs + deltaDays*86400000) — bar.startTs
    // is the TM's OWN internal clock (kernel_ops-derived day-offset solve, near-1970 by construction),
    // NOT a real calendar date. On a real drag this produced a target like "1970-01-19" that
    // moveTaskCascade's C2 predecessor-floor clamp (correctly) snapped straight back to the task's
    // OWN current real position (`§GANTT_EDIT_CLAMP requested=1970-01-19 clampedTo=2026-08-23
    // blockedBy=...`, measured live) — the drag's deltaDays was silently discarded, the task never
    // actually moved, EVERY 'move' drag on an on-critical-path task was a no-op in real terms. The
    // target must be computed from the task's ACTUAL real calendar position — tasksBefore[bar.taskId],
    // captured just above from the SAME `tasks` table ScheduleAuthor itself reads — not from bar's
    // TM-clock fields. bar.taskId is guaranteed present in tasksBefore (same query, same schedId,
    // same task) except in a genuinely stale-model edge case, refused rather than silently
    // mis-targeted.
    var tbBar = tasksBefore[bar.taskId];
    if (!tbBar || !tbBar.start || !tbBar.finish) {
      console.log('§GANTT_DRAG_REJECT reason=no_real_task_snapshot task=' + bar.taskId);
      _tmSay('Cannot edit — no real dates found for this task');   // §TM_SILENT_REFUSAL
      return;
    }
    var realS0 = Date.parse(tbBar.start + 'T00:00:00Z'), realE0 = Date.parse(tbBar.finish + 'T00:00:00Z');

    // §TM_EDIT_EXCEPTION — the whole pipeline (engine verb → retime → resync → annotate → persist →
    // repaint), so a throw anywhere in it recovers the display instead of freezing a stale frame.
    try {
    var res;
    if (mode === 'move') {
      res = SA.moveTaskCascade(app.db, schedId, bar.taskId, d(realS0 + deltaDays * 86400000), {});
    } else if (mode === 'resizeR') {
      res = SA.resizeTask(app.db, schedId, bar.taskId, d(realS0),
        d(realE0 + deltaDays * 86400000), {});
    } else {
      res = SA.resizeTask(app.db, schedId, bar.taskId, d(realS0 + deltaDays * 86400000),
        d(realE0), {});
    }
    if (!res || !res.ok) {
      // §TM_SILENT_REFUSAL — the CLAMPED case below always showed a tip; the outright-failure case
      // (bad_date / no_such_task / no_tasks / cycle from the engine verb) showed nothing at all.
      console.log('§GANTT_DRAG_REJECT task=' + bar.taskId + ' reason=' + ((res && res.reason) || 'unknown'));
      _tmSay('Rejected: ' + ((res && res.reason) || 'unknown'));   // same format as the props panel's Rejected: line
      return;
    }
    // C2 feedback: the user must SEE that the drag was refused, not silently land somewhere else.
    if (res.clamped) {
      var tip = document.getElementById('tm-gantt-tip');
      if (tip) {
        tip.textContent = 'Blocked by ' + res.blockedBy + ' — clamped to ' + res.start;
        tip.style.display = 'block';
        setTimeout(function () { tip.style.display = 'none'; }, 2600);
      }
    }
    var barsByTask = {};
    for (var i = 0; i < _ganttTasks.length; i++) if (_ganttTasks[i].taskId) barsByTask[_ganttTasks[i].taskId] = _ganttTasks[i];

    // §GANTT_EDIT_UNDO — the element-op "before" state, captured from the in-memory _ops (still the
    // pre-retime values at this point) for exactly the guids retimeTaskElements is about to touch.
    // Hash the guid->op lookup ONCE (same shape as retimeTaskElements's own opByGuid below) — a
    // linear scan per guid here was O(cascadeGuids * totalOps): measured 92s wall-clock on Terminal
    // (3,519 guids * 48,428 ops) before this fix, unusable for an interactive drag.
    var opsBefore = {};
    var _opByGuidForUndo = {};
    for (var oi2 = 0; oi2 < _ops.length; oi2++) if (_ops[oi2].output_guid) _opByGuidForUndo[_ops[oi2].output_guid] = _ops[oi2];
    (res.moved || []).forEach(function (m) {
      var bar2 = barsByTask[m.id]; if (!bar2 || !bar2.guids) return;
      bar2.guids.forEach(function (g) {
        var op = _opByGuidForUndo[g];
        if (op) opsBefore[g] = { start_ts: op.start_ts, end_ts: op.end_ts, parameters: JSON.stringify(op.parameters) };
      });
    });

    retimeTaskElements(app.db, barsByTask, res.moved || [], tasksBefore);
    _lastEdit = { schedId: schedId, taskId: bar.taskId, mode: mode, tasksBefore: tasksBefore, opsBefore: opsBefore };
    console.log('§GANTT_DRAG_COMMIT task=' + bar.taskId + ' mode=' + mode + ' deltaDays=' + deltaDays +
      ' start=' + res.start + ' clamped=' + res.clamped + ' cascaded=' + res.cascaded);
    _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
    _tmAnnotateCpm(schedId);   // §GANTT_CPM_ANNOTATE (§S68) — re-derive float/critical FROM the new dates
    _tmPersistEdit('drag');   // §S70 — the edit must survive a reload
    invalidateGanttModel();
    computeDays();
    drawGanttMini();
    renderAtTime(_cursor);
    // §S73 — the ONLY `return true` in this function. Every refusal above returns undefined, so the
    // __tmGanttDrag test hook can report what actually happened instead of "I found the bar."
    return true;
    } catch (e) { _tmEditExceptionRecover('commitGanttDrag', e); }   // §TM_EDIT_EXCEPTION — undefined return = "did not commit" (§S73)
  }
  // Test hooks (diagnostic only, same contract as __tmZoneProbe) — §S7's live drag reproduction:
  // a headless probe needs the real commit path and the real computed bars, not a DOM gesture.
  // §S73: returns whether the edit COMMITTED, not whether the bar was found. It used to return true
  // for a refused edit too — including a §TM_BAKE_LOCK refusal — so a probe watching this hook would
  // report a mid-bake edit as successful, which is precisely the regression the lock exists to catch.
  // `notFound` is distinguishable from `false` for the same reason: a renamed task should not read as
  // "the software refused."
  window.__tmGanttDrag = function (taskId, mode, deltaDays) {
    for (var i = 0; i < _ganttTasks.length; i++) {
      if (_ganttTasks[i].taskId === taskId) return commitGanttDrag(_ganttTasks[i], mode, deltaDays) === true;
    }
    return 'notFound';
  };
  window.__tmGanttWindows = function () {   // NOT __tmGanttBars — drawGanttMini owns that name (rects)
    return _ganttTasks.map(function (g) {
      return { taskId: g.taskId, storey: g.storey, phase: g.phase, startTs: g.startTs, endTs: g.endTs,
               n: g.guids ? g.guids.length : 0 };
    });
  };
  // §S22_DIAG (2026-08-17, 4D_GANTT_TM_REFACTOR.md §S22 — TM invisible-after-drag-then-scrub bug):
  // read-only, same double-underscore convention as __tmGanttWindows above but returns the actual
  // guid list for one task, needed to check per-guid mesh-visibility state (via __tmSnapshotVisible)
  // against the schedule, which __tmGanttWindows (count only) cannot support. Diagnostic only.
  window.__tmGanttTaskGuids = function (taskId) {
    for (var i = 0; i < _ganttTasks.length; i++) {
      if (_ganttTasks[i].taskId === taskId) return (_ganttTasks[i].guids || []).slice();
    }
    return null;
  };

  // §TM_RULER_SHIFT — drag the day ruler to move the WHOLE project's start/finish. Same shape as
  // commitGanttDrag (snapshot every leaf task's before-state + every touched guid's before-state
  // into the SAME _lastEdit single-level undo, call the real engine verb, retimeTaskElements to
  // resync playback), just against SA.shiftSchedule instead of moveTaskCascade/resizeTask and
  // against EVERY task instead of one cascade. mode:'shift' in _lastEdit is cosmetic (log/tip text
  // only) — undoLastGanttEdit's restore loop doesn't branch on it, so no other change was needed
  // there at all.
  function shiftGanttSchedule(deltaDays) {
    if (_tmEditLocked('shiftGanttSchedule')) return;   // §TM_BAKE_LOCK (§S69)
    var app = A();
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.shiftSchedule) {
      console.log('§TM_RULER_SHIFT_REJECT reason=ScheduleAuthor_not_loaded');
      _tmSay('Not available');   // §TM_SILENT_REFUSAL
      return;
    }
    if (!deltaDays) return;   // a click, not a drag — nothing to shift
    var schedId = (_taskIndex && _taskIndex.scheduleId) || 'SCH_AUTHORED';

    var tasksBefore = {};
    try {
      var tb = app.db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE schedule_id=?', [schedId]);
      if (tb.length) tb[0].values.forEach(function (row) {
        tasksBefore[row[0]] = { start: row[1], finish: row[2], duration: row[3] };
      });
    } catch (e) {}

    try {   // §TM_EDIT_EXCEPTION — engine verb through final repaint
    var res = SA.shiftSchedule(app.db, schedId, deltaDays);
    if (!res || !res.ok) {
      console.log('§TM_RULER_SHIFT_REJECT reason=' + ((res && res.reason) || 'unknown'));
      _tmSay('Cannot shift — ' + ((res && res.reason) || 'no schedule'));   // §TM_SILENT_REFUSAL — same shape as "Cannot compress"
      return;
    }

    var barsByTask = {};
    for (var i = 0; i < _ganttTasks.length; i++) if (_ganttTasks[i].taskId) barsByTask[_ganttTasks[i].taskId] = _ganttTasks[i];
    var opsBefore = {};
    var _opByGuidForUndo = {};
    for (var oi2 = 0; oi2 < _ops.length; oi2++) if (_ops[oi2].output_guid) _opByGuidForUndo[_ops[oi2].output_guid] = _ops[oi2];
    res.moved.forEach(function (m) {
      var bar2 = barsByTask[m.id]; if (!bar2 || !bar2.guids) return;
      bar2.guids.forEach(function (g) {
        var op = _opByGuidForUndo[g];
        if (op) opsBefore[g] = { start_ts: op.start_ts, end_ts: op.end_ts, parameters: JSON.stringify(op.parameters) };
      });
    });

    retimeTaskElements(app.db, barsByTask, res.moved, tasksBefore);
    _lastEdit = { schedId: schedId, taskId: '(whole schedule)', mode: 'shift', tasksBefore: tasksBefore, opsBefore: opsBefore };
    console.log('§TM_RULER_SHIFT_COMMIT schedule=' + schedId + ' deltaDays=' + deltaDays + ' tasks=' + res.moved.length);
    _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
    _tmAnnotateCpm(schedId);   // §GANTT_CPM_ANNOTATE (§S68) — re-derive float/critical FROM the new dates
    _tmPersistEdit('rulerShift');   // §S70 — the edit must survive a reload
    invalidateGanttModel();
    computeDays();
    drawGanttMini();
    renderAtTime(_cursor);
    } catch (e) { _tmEditExceptionRecover('shiftGanttSchedule', e); }   // §TM_EDIT_EXCEPTION
  }

  // §GANTT_GROUP_MOVE — same shape as shiftGanttSchedule, scoped to an explicit marquee-selected
  // task_id list instead of the whole schedule. Reuses the SAME _lastEdit single-level undo — its
  // restore loop doesn't care whether tasksBefore/opsBefore covers a cascade, the whole schedule,
  // or a selection, it just restores whatever's in there.
  function commitGanttGroupShift(taskIds, deltaDays) {
    if (_tmEditLocked('commitGanttGroupShift')) return;   // §TM_BAKE_LOCK (§S69)
    var app = A();
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.shiftTasks) {
      console.log('§GANTT_GROUP_SHIFT_REJECT reason=ScheduleAuthor_not_loaded');
      _tmSay('Not available');   // §TM_SILENT_REFUSAL
      return;
    }
    if (!deltaDays || !taskIds || !taskIds.length) return;
    var schedId = (_taskIndex && _taskIndex.scheduleId) || 'SCH_AUTHORED';

    var tasksBefore = {};
    try {
      var placeholders = taskIds.map(function () { return '?'; }).join(',');
      var tb = app.db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE task_id IN (' + placeholders + ')', taskIds);
      if (tb.length) tb[0].values.forEach(function (row) {
        tasksBefore[row[0]] = { start: row[1], finish: row[2], duration: row[3] };
      });
    } catch (e) {}

    try {   // §TM_EDIT_EXCEPTION — engine verb through final repaint
    var res = SA.shiftTasks(app.db, taskIds, deltaDays);
    if (!res || !res.ok) {
      console.log('§GANTT_GROUP_SHIFT_REJECT reason=' + ((res && res.reason) || 'unknown'));
      _tmSay('Cannot move group — ' + ((res && res.reason) || 'no schedule'));   // §TM_SILENT_REFUSAL
      return;
    }

    var barsByTask = {};
    for (var i = 0; i < _ganttTasks.length; i++) if (_ganttTasks[i].taskId) barsByTask[_ganttTasks[i].taskId] = _ganttTasks[i];
    var opsBefore = {};
    var _opByGuidForUndo = {};
    for (var oi3 = 0; oi3 < _ops.length; oi3++) if (_ops[oi3].output_guid) _opByGuidForUndo[_ops[oi3].output_guid] = _ops[oi3];
    res.moved.forEach(function (m) {
      var bar3 = barsByTask[m.id]; if (!bar3 || !bar3.guids) return;
      bar3.guids.forEach(function (g) {
        var op = _opByGuidForUndo[g];
        if (op) opsBefore[g] = { start_ts: op.start_ts, end_ts: op.end_ts, parameters: JSON.stringify(op.parameters) };
      });
    });

    retimeTaskElements(app.db, barsByTask, res.moved, tasksBefore);
    _lastEdit = { schedId: schedId, taskId: '(' + taskIds.length + ' selected)', mode: 'group-shift', tasksBefore: tasksBefore, opsBefore: opsBefore };
    console.log('§GANTT_GROUP_SHIFT_COMMIT tasks=' + res.moved.length + ' deltaDays=' + deltaDays);
    _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
    _tmAnnotateCpm(schedId);   // §GANTT_CPM_ANNOTATE (§S68) — re-derive float/critical FROM the new dates
    _tmPersistEdit('groupShift');   // §S70 — the edit must survive a reload
    invalidateGanttModel();
    computeDays();
    drawGanttMini();
    renderAtTime(_cursor);
    } catch (e) { _tmEditExceptionRecover('commitGanttGroupShift', e); }   // §TM_EDIT_EXCEPTION
  }

  // §GANTT_EDIT_UNDO — reverse the single most recent commitGanttDrag edit. Restores both halves
  // that edit changed: the task dates (moveTaskCascade/resizeTask's write to `tasks`) and the
  // element ops (retimeTaskElements's write to `kernel_ops`) — same two tables, same shape, run
  // backward. Single-level: clears _lastEdit so a second click is a no-op, not a second undo step.
  function undoLastGanttEdit() {
    // §TM_BAKE_LOCK (§S69) — an undo mutates the timeline exactly as much as the edit it reverses.
    if (_tmEditLocked('undoLastGanttEdit')) return;
    var app = A();
    var tip = document.getElementById('tm-gantt-tip');
    function say(msg) {
      if (!tip) return;
      tip.textContent = msg; tip.style.display = 'block';
      setTimeout(function () { tip.style.display = 'none'; }, 2200);
    }
    if (!_lastEdit || !app || !app.db) {
      console.log('§GANTT_EDIT_UNDO_REJECT reason=nothing_to_undo');
      say('Nothing to undo');
      return;
    }
    var edit = _lastEdit;
    _lastEdit = null;   // single-level — commit even if a write below throws, never retry the same edit
    var db = app.db;
    db.run('BEGIN');
    var stT = db.prepare('UPDATE tasks SET schedule_start=?, schedule_finish=?, schedule_duration=? WHERE task_id=?');
    var tRestored = 0;
    for (var tid in edit.tasksBefore) {
      var t = edit.tasksBefore[tid];
      stT.run([t.start, t.finish, t.duration, tid]);
      tRestored++;
    }
    stT.free();
    var stO = db.prepare('UPDATE kernel_ops SET timestamp=?, parameters=? WHERE op_type=\'ELEMENT_PLACE\' AND output_guid=?');
    var oRestored = 0;
    // Same O(1)-per-guid hash, same reason as commitGanttDrag's opsBefore capture — a linear scan
    // per guid here is O(cascadeGuids * totalOps), unusable on a large building's cascade.
    var _opByGuidForRestore = {};
    for (var oi3 = 0; oi3 < _ops.length; oi3++) if (_ops[oi3].output_guid) _opByGuidForRestore[_ops[oi3].output_guid] = _ops[oi3];
    for (var guid in edit.opsBefore) {
      var o = edit.opsBefore[guid];
      stO.run([o.start_ts, o.parameters, guid]);
      var opR = _opByGuidForRestore[guid];
      if (opR) { opR.start_ts = o.start_ts; opR.end_ts = o.end_ts; opR.parameters = JSON.parse(o.parameters); }
      oRestored++;
    }
    stO.free();
    db.run('COMMIT');
    console.log('§GANTT_EDIT_UNDO task=' + edit.taskId + ' mode=' + edit.mode +
      ' tasksRestored=' + tRestored + ' opsRestored=' + oRestored);
    say('Undone: ' + edit.mode + ' ' + edit.taskId);
    _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
    _tmAnnotateCpm(edit.schedId);   // §GANTT_CPM_ANNOTATE (§S68) — re-derive float/critical FROM the new dates
    _tmPersistEdit('undo');   // §S70 — the edit must survive a reload
    invalidateGanttModel();
    computeDays();
    drawGanttMini();
    renderAtTime(_cursor);
  }

  // ⚑ Set Baseline — replaces the dead Copy New slot. Definition user-confirmed 2026-08-05
  // (4D_SCHEDULE_PERFECTION.md "the transport row's two buttons"): a deliberate snapshot of the
  // schedule's own dates, a DIFFERENT axis from §TM-VARIANCE's existing ERP cost variance. Manual
  // button today because MOB's auto-trigger-at-ERP-push (M2) doesn't exist yet — once it does, the
  // SAME ScheduleAuthor.setBaseline verb gets called there too; this button does not become obsolete,
  // it becomes the "re-baseline for an approved change order" case named in the spec.
  function setGanttBaseline() {
    var app = A();
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    var tip = document.getElementById('tm-gantt-tip');
    function say(msg) {
      if (!tip) return;
      tip.textContent = msg; tip.style.display = 'block';
      setTimeout(function () { tip.style.display = 'none'; }, 2600);
    }
    if (!app || !app.db || !SA || !SA.setBaseline) {
      console.log('§GANTT_SET_BASELINE_REJECT reason=ScheduleAuthor_not_loaded');
      say('Not available'); return;
    }
    var schedId = (_taskIndex && _taskIndex.scheduleId) || 'SCH_AUTHORED';
    var res = SA.setBaseline(app.db, schedId);
    if (!res.ok) { say('No schedule to baseline yet — generate a 4D schedule first'); return; }
    say('Baseline set — ' + res.taskCount + ' tasks');
  }

  // ⏪ Pull Back — §GANTT_RESCHEDULE_ASAP. The EXPLICIT "reschedule as early as possible" action.
  // moveTaskCascade is push-only by design (§S68's annotate-only drag contract: a drag moves ONE
  // bar and pushes violated successors, it never silently re-optimises the rest of the programme).
  // The user-decided product shape for pull-back is therefore a deliberate transport-row button —
  // same surface as ⚑ Set Baseline — not a side-effect of every drag. Same 7-step commit pipeline
  // as every other edit path (lock → verb → retime → resync → annotate → persist → redraw); W-CPM-1
  // / W-PERS-1 / W-TBL-5 derive their caller lists from the source and hold this function to it.
  function rescheduleGanttAsap() {
    if (_tmEditLocked('rescheduleGanttAsap')) return;   // §TM_BAKE_LOCK (§S69)
    var app = A();
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    var tip = document.getElementById('tm-gantt-tip');
    function say(msg) {
      if (!tip) return;
      tip.textContent = msg; tip.style.display = 'block';
      setTimeout(function () { tip.style.display = 'none'; }, 2600);
    }
    if (!app || !app.db || !SA || !SA.rescheduleAsap) {
      console.log('§GANTT_RESCHEDULE_ASAP_REJECT reason=ScheduleAuthor_not_loaded');
      say('Not available'); return;
    }
    // (returns: true = committed, 'nothing' = zero float to close, undefined = refused — §S73's
    // convention, so the __tmRescheduleAsap probe hook reports what HAPPENED, not "I was called".)
    var schedId = (_taskIndex && _taskIndex.scheduleId) || 'SCH_AUTHORED';

    // §GANTT_EDIT_UNDO — snapshot BEFORE the engine verb mutates `tasks`. This action can move MANY
    // leaf tasks, so the snapshot covers every leaf in the schedule (same scope commitGanttDrag
    // already uses for exactly this reason: "cascade scope isn't known until the verb returns").
    var tasksBefore = {};
    try {
      var tb = app.db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration ' +
        'FROM tasks WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)', [schedId]);
      if (tb.length) tb[0].values.forEach(function (row) {
        tasksBefore[row[0]] = { start: row[1], finish: row[2], duration: row[3] };
      });
    } catch (e) {}

    try {   // §TM_EDIT_EXCEPTION — engine verb through final repaint; a throw returns undefined = "refused" (§S73)
    var res = SA.rescheduleAsap(app.db, schedId, {});
    if (!res || !res.ok) {
      console.log('§GANTT_RESCHEDULE_ASAP_REJECT reason=' + ((res && res.reason) || 'unknown'));
      say('Cannot compress — ' + ((res && res.reason) || 'no schedule'));
      return;
    }
    if (!res.moved.length) {
      // The verb wrote nothing (compression found zero float to close) — honest no-op, no retime,
      // no persist, no undo entry to clobber the user's real last edit.
      say('Nothing to compress — schedule is already at earliest float');
      return 'nothing';
    }

    var barsByTask = {};
    for (var i = 0; i < _ganttTasks.length; i++) if (_ganttTasks[i].taskId) barsByTask[_ganttTasks[i].taskId] = _ganttTasks[i];
    var opsBefore = {};
    var _opByGuidForUndo = {};
    for (var oi4 = 0; oi4 < _ops.length; oi4++) if (_ops[oi4].output_guid) _opByGuidForUndo[_ops[oi4].output_guid] = _ops[oi4];
    res.moved.forEach(function (m) {
      var bar4 = barsByTask[m.id]; if (!bar4 || !bar4.guids) return;
      bar4.guids.forEach(function (g) {
        var op = _opByGuidForUndo[g];
        if (op) opsBefore[g] = { start_ts: op.start_ts, end_ts: op.end_ts, parameters: JSON.stringify(op.parameters) };
      });
    });

    retimeTaskElements(app.db, barsByTask, res.moved, tasksBefore);
    _lastEdit = { schedId: schedId, taskId: '(' + res.moved.length + ' pulled back)', mode: 'asap', tasksBefore: tasksBefore, opsBefore: opsBefore };
    console.log('§GANTT_RESCHEDULE_ASAP_COMMIT schedule=' + schedId + ' tasks=' + res.moved.length +
      ' daysCompressed=' + res.daysCompressed);
    _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
    _tmAnnotateCpm(schedId);   // §GANTT_CPM_ANNOTATE (§S68) — re-derive float/critical FROM the new dates
    _tmPersistEdit('rescheduleAsap');   // §S70 — the edit must survive a reload
    invalidateGanttModel();
    computeDays();
    drawGanttMini();
    renderAtTime(_cursor);
    say('Compressed ' + res.moved.length + ' task' + (res.moved.length === 1 ? '' : 's') +
      (res.daysCompressed > 0 ? ' — project finish moved up ' + res.daysCompressed + ' day' + (res.daysCompressed === 1 ? '' : 's')
                              : ' — project finish unchanged (internal float closed)'));
    return true;
    } catch (e) { _tmEditExceptionRecover('rescheduleGanttAsap', e); }   // §TM_EDIT_EXCEPTION
  }
  // Test hook (diagnostic only, same contract as __tmGanttDrag / __tmZoneProbe): a headless probe
  // needs the REAL commit path — lock check, engine verb, retime, resync, annotate, persist — not a
  // DOM gesture. §S73 semantics: true = committed, 'nothing' = zero closable float, false = refused.
  window.__tmRescheduleAsap = function () { return rescheduleGanttAsap() || false; };

  // §GANTT_AUTHOR_ENTRY (native, §GANTT_EDIT_LOCK 2026-08-05 dropped the last old-panel fallback) —
  // called automatically by drawGanttMini when the drawer has nothing editable to show, no button,
  // no side panel involved at all any more. Calls the real engine verb directly, same as the panel's
  // own generateDraft() zone-detail path (schedule_author_ui.js), not a reimplementation of it.
  // §GANTT_SINGLE_LOAD (2026-08-07, 4D_SCHEDULE_PERFECTION.md §GANTT_DOUBLE_LOAD) — the materialize
  // core, callable BEFORE activation: no UI tip, no refold. Returns true iff a fresh native schedule
  // was written. Scoped to the truly-cold case only (NO schedule row at all) — an existing schedule,
  // authored or captured, is left for injectGantt to absorb as-is; generateGanttSchedule() below keeps
  // its own wider semantics (regenerates over a non-captured schedule) for the drawer's auto-gen
  // fallback. Same materializeZones call/opts as generateGanttSchedule — keep them in sync.
  function _materializeNativeSchedule(app) {
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.materializeZones) return false;
    // §TM_BAKE_LOCK (§S69) — deliberately NOT guarded, and the line below is why: this bootstrap
    // returns early whenever a schedule already exists, and a bake by definition plays an existing
    // one. It can only ever write the FIRST schedule for a building, which is not a timeline any
    // film is mid-way through recording. W-TBL-5d asserts that early-return still stands.
    var act = SA.activeSchedule ? SA.activeSchedule(app.db) : null;
    if (act) return false;                       // schedule exists — injectGantt absorbs it, one pass
    var todayStart = new Date().toISOString().slice(0, 10);
    var SR = window.SEQUENCE_RULES || {}, LR = window.LABOR_RATES || {}, RT = window.RATES || {};
    var _shiftHoursGantt = (window.SHIFT_HOURS > 0) ? window.SHIFT_HOURS : 24; // §GANTT_SHIFT_HOURS_DESYNC — match injectGantt's real clock
    var res = SA.materializeZones(app.db, SR, { start: todayStart, laborRates: LR, rates: RT, scheduleGate: window.ScheduleGate, shiftHours: _shiftHoursGantt, genVersion: _GANTT_CACHE_VERSION, displayRemap: _tmDisplayRemap, template: _4dTemplate });   // §ZONE_DISPLAY_AUTHORING + §TPL_WIRED
    if (!res.ok && SA.materializeDefault) res = SA.materializeDefault(app.db, SR, { start: todayStart, laborRates: LR, blank: false, genVersion: _GANTT_CACHE_VERSION });
    console.log('§GANTT_PREMATERIALIZE ' + (res.ok
      ? 'native schedule written BEFORE first injectGantt (zones=' + (res.zoneCount != null ? res.zoneCount : 'n/a') + ') — single-pass cold open'
      : 'failed reason=' + (res.reason || 'unknown') + ' — legacy auto-generate fallback will handle it'));
    return !!res.ok;
  }

  function generateGanttSchedule() {
    if (_tmEditLocked('generateGanttSchedule')) return;
    var app = A();
    var SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    var tip = document.getElementById('tm-gantt-tip');
    function say(msg) {
      if (!tip) return;
      tip.textContent = msg; tip.style.display = 'block';
      setTimeout(function () { tip.style.display = 'none'; }, 3200);
    }
    if (!app || !app.db || !SA || !SA.materializeZones) {
      console.log('§GANTT_AUTHOR_ENTRY_FAIL reason=ScheduleAuthor_not_loaded');
      say('Not available'); return;
    }
    // Never clobber a REAL imported (Bonsai/Revit/IFC-native) schedule with a synthetic one — the
    // SAME guard schedule_author_ui.js's generateDraft() already applies before it materializes
    // anything. Previously this fell back to opening the old ScheduleAuthorUI side panel to edit a
    // captured schedule's structure — user ruling 2026-08-05 removed that too ("prefer to edit right
    // in the gantt chart itself"): a captured schedule is left exactly as imported (never
    // regenerated) and is edited through the SAME drawer lock/drag/link/props surface as any other
    // schedule, once its bars carry real task_ids via the normal cap/injectGantt load path.
    try {   // §TM_EDIT_EXCEPTION — schedule probe + materialize verb through the refresh
    var act = SA.activeSchedule ? SA.activeSchedule(app.db) : null;
    if (act && act.captured) {
      console.log('§GANTT_AUTHOR_ENTRY captured=' + act.id + ' — leaving it as imported, not regenerating');
      return;
    }
    // §TM_RULER_SHIFT (2026-08-05, user ruling): "defaulted to today if the JSON is silent" — the
    // native auto-generate path has no imported schedule to take a start date from, so it starts
    // TODAY (real wall-clock date), not a hardcoded placeholder. Once materialized the user can drag
    // the ruler to shift the whole project to a different start, same as any other edit.
    var todayStart = new Date().toISOString().slice(0, 10);
    var SR = window.SEQUENCE_RULES || {}, LR = window.LABOR_RATES || {}, RT = window.RATES || {};
    var _shiftHoursGantt = (window.SHIFT_HOURS > 0) ? window.SHIFT_HOURS : 24; // §GANTT_SHIFT_HOURS_DESYNC — match injectGantt's real clock
    var res = SA.materializeZones(app.db, SR, { start: todayStart, laborRates: LR, rates: RT, scheduleGate: window.ScheduleGate, shiftHours: _shiftHoursGantt, genVersion: _GANTT_CACHE_VERSION, displayRemap: _tmDisplayRemap, template: _4dTemplate });   // §ZONE_DISPLAY_AUTHORING + §TPL_WIRED
    if (!res.ok) {
      console.log('§GANTT_AUTHOR_ENTRY_ZONE_FALLBACK reason=' + (res.reason || 'unknown'));
      res = SA.materializeDefault ? SA.materializeDefault(app.db, SR, { start: todayStart, laborRates: LR, blank: false, genVersion: _GANTT_CACHE_VERSION }) : { ok: false };
    }
    if (!res.ok) {
      console.log('§GANTT_AUTHOR_ENTRY_FAIL reason=' + (res.reason || 'materialize_failed'));
      say('Could not generate a schedule'); return;
    }
    console.log('§GANTT_AUTHOR_ENTRY native generate zones=' + (res.zoneCount != null ? res.zoneCount : 'n/a') +
      ' phases=' + (res.phases ? res.phases.length : 'n/a'));
    say('Schedule generated — refreshing…');
    // Reuse the SAME refresh path applyTo4D() already uses for this exact situation (a fresh/edited
    // schedule needs the drawer's overlay re-run) — real, already-working machinery, not a second
    // lighter-weight refresh path whose correctness would need its own separate proof.
    if (typeof window.tmRefoldSchedule === 'function') window.tmRefoldSchedule();
    else { invalidateGanttModel(); computeDays(); drawGanttMini(); renderAtTime(_cursor); }
    } catch (e) { _tmEditExceptionRecover('generateGanttSchedule', e); }   // §TM_EDIT_EXCEPTION
  }

  function wireGanttDrag() {
    var cv = document.getElementById('tm-gantt-canvas');
    if (!cv || cv._dragWired) return;
    cv._dragWired = true;
    cv.addEventListener('pointerdown', function (e) {
      if (!_active || !_ganttTasks.length) return;
      var hit = ganttHit(e);
      if (!hit) {
        // §GANTT_GROUP_MOVE — empty canvas starts a marquee-select (MS-Word-style: drag from empty
        // space, sweep into the bars you want). Same lock gate as everything else — selecting is
        // UI-only, but its only purpose here is to enable a group move, which IS an edit.
        if (!_ganttEditable) return;
        var mrect = e.target.getBoundingClientRect();
        _marquee = { x0: e.clientX - mrect.left, y0: e.clientY - mrect.top, x1: e.clientX - mrect.left, y1: e.clientY - mrect.top };
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }
      // §GANTT_DRAG_REJECT at the point of refusal. This used to be a bare `return`: a user dragging
      // a non-editable bar got NO feedback and NO log line, and the browser wiring test could not
      // tell "handler never fired" apart from "handler correctly refused". Silence is not a refusal.
      if (!hit.bar.taskId) {
        console.log('§GANTT_DRAG_REJECT reason=bar_has_no_task storey="' + hit.bar.storey +
          '" phase="' + hit.bar.phase + '"');
        var t0 = document.getElementById('tm-gantt-tip');
        if (t0) {
          t0.textContent = 'Not editable — no schedule task on this bar';
          t0.style.display = 'block';
          setTimeout(function () { t0.style.display = 'none'; }, 2200);
        }
        return;
      }
      // §GANTT_EDIT_LOCK — drag/resize AND the drag-to-link path (endDrag never runs without a live
      // _drag) are both gated here, at the single point of entry. Seek/scrub/hover are untouched —
      // those are wired on tm-gantt-canvas's OWN pointerup/pointermove listeners registered earlier
      // in activate(), not in this function.
      if (!_ganttEditable) {
        console.log('§GANTT_DRAG_REJECT reason=locked');
        var t1 = document.getElementById('tm-gantt-tip');
        if (t1) {
          t1.textContent = 'Locked — click 🔒 Locked to enable editing';
          t1.style.display = 'block';
          setTimeout(function () { t1.style.display = 'none'; }, 2200);
        }
        return;
      }
      // §GANTT_GROUP_MOVE — dragging a bar that's part of the current multi-selection moves the
      // WHOLE group together. Dragging a bar OUTSIDE the current selection clears it first (same
      // convention as every other selection UI: clicking an unselected object deselects the group).
      if (_ganttSelected[hit.bar.taskId] && Object.keys(_ganttSelected).length > 1) {
        _groupDrag = { taskIds: Object.keys(_ganttSelected), x0: e.clientX, y0: e.clientY, dayPx: hit.dayPx, days: 0, moved: false };
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }
      if (Object.keys(_ganttSelected).length) { _ganttSelected = {}; drawGanttMini(); }
      _drag = { bar: hit.bar, mode: hit.mode, x0: e.clientX, y0: e.clientY, dayPx: hit.dayPx, days: 0, moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    });
    cv.addEventListener('pointermove', function (e) {
      if (_marquee) {
        var mrect2 = e.target.getBoundingClientRect();
        _marquee.x1 = e.clientX - mrect2.left; _marquee.y1 = e.clientY - mrect2.top;
        var mel = document.getElementById('tm-gantt-marquee');
        if (mel) {
          var lo = Math.min(_marquee.x0, _marquee.x1), hi = Math.max(_marquee.x0, _marquee.x1);
          var top = Math.min(_marquee.y0, _marquee.y1), bot = Math.max(_marquee.y0, _marquee.y1);
          mel.style.left = lo + 'px'; mel.style.top = top + 'px';
          mel.style.width = (hi - lo) + 'px'; mel.style.height = (bot - top) + 'px';
          mel.style.display = 'block';
        }
        e.preventDefault();
        return;
      }
      if (_groupDrag) {
        var days2 = Math.round((e.clientX - _groupDrag.x0) / Math.max(0.001, _groupDrag.dayPx));
        if (days2 !== _groupDrag.days) { _groupDrag.days = days2; _groupDrag.moved = _groupDrag.moved || days2 !== 0; }
        var tip2 = document.getElementById('tm-gantt-tip');
        if (tip2 && _groupDrag.moved) {
          tip2.textContent = 'Move ' + _groupDrag.taskIds.length + ' bars  ' + (days2 >= 0 ? '+' : '') + days2 + 'd';
          tip2.style.left = Math.max(0, Math.min(e.offsetX + 8, e.target.clientWidth - 200)) + 'px';
          tip2.style.top = Math.max(2, e.offsetY - 22) + 'px';
          tip2.style.display = 'block';
        }
        e.preventDefault();
        return;
      }
      if (!_drag) { cv.style.cursor = (function () { var h = ganttHit(e); return h && h.bar.taskId ? (h.mode === 'move' ? 'grab' : 'ew-resize') : 'pointer'; })(); return; }
      var days = Math.round((e.clientX - _drag.x0) / Math.max(0.001, _drag.dayPx));
      if (days !== _drag.days) { _drag.days = days; _drag.moved = _drag.moved || days !== 0; }
      var tip = document.getElementById('tm-gantt-tip');
      if (tip && _drag.moved) {
        tip.textContent = (_drag.mode === 'move' ? 'Move ' : 'Resize ') + _drag.bar.phase + ' — ' +
          _drag.bar.storey + '  ' + (days >= 0 ? '+' : '') + days + 'd';
        tip.style.left = Math.max(0, Math.min(e.offsetX + 8, e.target.clientWidth - 200)) + 'px';
        tip.style.top = Math.max(2, e.offsetY - 22) + 'px';
        tip.style.display = 'block';
      }
      e.preventDefault();
    });
    function endDrag(e) {
      if (_marquee) {
        var m = _marquee; _marquee = null;
        try { cv.releasePointerCapture(e.pointerId); } catch (err) {}
        var mel2 = document.getElementById('tm-gantt-marquee');
        if (mel2) mel2.style.display = 'none';
        // A near-zero marquee is a CLICK, not a drag — click-away-to-deselect, the same gesture
        // that starts a new marquee also dissolves the old selection (no separate "ungroup" verb).
        if (Math.abs(m.x1 - m.x0) + Math.abs(m.y1 - m.y0) < 4) {
          if (Object.keys(_ganttSelected).length) {
            _ganttSelected = {};
            console.log('§GANTT_GROUP_SELECT count=0 (cleared)');
            drawGanttMini();
          }
          return;
        }
        var hitBars = barsInRect(cv.clientWidth, m.x0, m.y0, m.x1, m.y1);
        _ganttSelected = {};
        hitBars.forEach(function (t) { _ganttSelected[t.taskId] = true; });
        console.log('§GANTT_GROUP_SELECT count=' + hitBars.length);
        drawGanttMini();
        return;
      }
      if (_groupDrag) {
        var gd = _groupDrag; _groupDrag = null;
        try { cv.releasePointerCapture(e.pointerId); } catch (err) {}
        var tip3 = document.getElementById('tm-gantt-tip');
        if (tip3) tip3.style.display = 'none';
        if (!gd.moved || !gd.days) return;   // a click, not a drag
        _dragConsumed = true;
        commitGanttGroupShift(gd.taskIds, gd.days);
        return;
      }
      if (!_drag) return;
      var d = _drag; _drag = null;
      try { cv.releasePointerCapture(e.pointerId); } catch (err) {}
      // §GANTT_LINK (E3): a drag that ENDS on a different bar, at least one row away, means "link
      // these two", not "move this one". Requiring a full row of vertical travel keeps incidental
      // drift during a horizontal move from silently creating a dependency.
      var drop = ganttHit(e);
      if (drop && drop.bar !== d.bar && drop.bar.taskId && d.bar.taskId &&
          Math.abs(e.clientY - d.y0) >= 14) {
        _dragConsumed = true;
        linkGanttBars(d.bar, drop.bar);
        return;
      }
      if (!d.moved || !d.days) return;          // a click, not a drag — let the seek handler have it
      _dragConsumed = true;
      commitGanttDrag(d.bar, d.mode, d.days);
    }
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    // §GANTT_PROPS (E7): double-click opens the keyed-entry panel. Drag is for speed, typing is for
    // accuracy — on a 400-day project one pixel is ~2 days, so drag alone can never be the precise path.
    cv.addEventListener('dblclick', function (e) {
      var hit = ganttHit(e);
      if (!hit || !hit.bar.taskId) return;
      if (!_ganttEditable) {  // §GANTT_EDIT_LOCK — same gate as drag, props panel also edits (typed retime + unlink)
        console.log('§GANTT_PROPS_REJECT reason=locked');
        // §TM_SILENT_REFUSAL — every OTHER lock refusal already says this. Inline tip-set (not
        // _tmSay) on purpose: wireGanttDrag's sibling refusals use this exact self-contained
        // pattern, and witness_gantt_edit_lock.js slices this function alone into its sandbox.
        var t2 = document.getElementById('tm-gantt-tip');
        if (t2) {
          t2.textContent = 'Locked — click 🔒 Locked to enable editing';
          t2.style.display = 'block';
          setTimeout(function () { t2.style.display = 'none'; }, 2200);
        }
        return;
      }
      _dragConsumed = true; openGanttProps(hit.bar);
    });
  }

  // §GANTT_LINK (E3) — create a real FS dependency, guarded by the EXISTING wouldCycle. A cyclic
  // schedule is invalid, so the guard refuses rather than "fixing" it silently.
  function linkGanttBars(predBar, succBar) {
    if (_tmEditLocked('linkGanttBars')) return;   // §TM_BAKE_LOCK (§S69)
    var app = A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    // §TM_SILENT_REFUSAL — this guard returns before the local say() below exists, so it uses the
    // module-scope _tmSay (the guard used to be the one refusal in this function with no tip).
    if (!app || !app.db || !SA || !SA.addDependency) { console.log('§GANTT_LINK_REJECT reason=ScheduleAuthor_not_loaded'); _tmSay('Not available'); return; }
    var tip = document.getElementById('tm-gantt-tip');
    function say(msg) { if (tip) { tip.textContent = msg; tip.style.display = 'block'; setTimeout(function () { tip.style.display = 'none'; }, 2600); } }
    try {   // §TM_EDIT_EXCEPTION — cycle probe + addDependency verb through the final repaint
    if (SA.wouldCycle && SA.wouldCycle(app.db, predBar.taskId, succBar.taskId)) {
      console.log('§GANTT_EDIT_CYCLE_BLOCKED pred=' + predBar.taskId + ' succ=' + succBar.taskId);
      say('Refused — that link would create a cycle');
      return;
    }
    var r = SA.addDependency(app.db, predBar.taskId, succBar.taskId, 'FS', 0);
    console.log('§GANTT_EDIT_LINK pred=' + predBar.taskId + ' succ=' + succBar.taskId +
      ' type=FS ok=' + JSON.stringify(r && (r.ok !== undefined ? r.ok : r)));
    say('Linked: ' + predBar.phase + ' — ' + predBar.storey + '  →  ' + succBar.phase + ' — ' + succBar.storey);
    // The new edge may make the successor illegal where it currently sits. Re-apply it through the
    // SAME constraint-aware verb so the graph and the dates agree immediately, rather than leaving a
    // freshly-created violation on screen.
    var schedId = (_taskIndex && _taskIndex.scheduleId) || 'SCH_AUTHORED';
    if (SA.moveTaskCascade) {
      var tasksBeforeLink = {};
      try {
        var tbL = app.db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE schedule_id=?', [schedId]);
        if (tbL.length) tbL[0].values.forEach(function (row) { tasksBeforeLink[row[0]] = { start: row[1], finish: row[2], duration: row[3] }; });
      } catch (e) {}
      // §S22_EPOCH_FIX: succBar.startTs is the TM's OWN internal clock (kernel_ops-derived day-offset
      // solve, not a real date) — new Date(succBar.startTs) misread it as if it already were one,
      // handing moveTaskCascade a bogus target (the same clock-mismatch class §S22 found in
      // retimeTaskElements, one call site over). Re-apply the successor at its OWN CURRENT real
      // position instead — tasks.schedule_start, just captured above — the correct "no-op except for
      // the new constraint" input the comment above already intends.
      var succReal = tasksBeforeLink[succBar.taskId];
      var targetDate = succReal ? succReal.start : new Date(succBar.startTs).toISOString().slice(0, 10);
      var res = SA.moveTaskCascade(app.db, schedId, succBar.taskId, targetDate, {});
      if (res && res.ok && res.moved && res.moved.length) {
        var byTask = {};
        for (var i = 0; i < _ganttTasks.length; i++) if (_ganttTasks[i].taskId) byTask[_ganttTasks[i].taskId] = _ganttTasks[i];
        retimeTaskElements(app.db, byTask, res.moved, tasksBeforeLink);
        _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
      }
      // §FUTURE-5A item 6 (applied 2026-09-02, queue item B-3): the ONLY §GANTT_EDIT_CLAMP call
      // site in this file with NO on-screen feedback at all — commitGanttDrag/openGanttProps'
      // Apply already show `blockedBy`/`clampedTo` (the inline tm-gantt-tip pattern _tmSay itself
      // wraps), but this re-apply-after-link call to moveTaskCascade never checked res.clamped, so
      // a new link that ALSO clamps the successor left the user with only the earlier "Linked: ..."
      // message and no word that the date shown isn't where the link math alone would have put it.
      // res.blockedBy is the engine's own extracted binding predecessor (schedule_author.js
      // _bindingPred) — never invented here.
      if (res && res.clamped) {
        _tmSay('Linked, but ' + succBar.taskId + ' clamped to ' + res.start + ' — blocked by ' + res.blockedBy, 3400);
      }
    }
    // §GANTT_CPM_ANNOTATE (§S68) — OUTSIDE the moved-check on purpose: a new EDGE changes the graph,
    // so it changes float and criticality even when the clamp left every date exactly where it was.
    _tmAnnotateCpm(schedId);
    _tmPersistEdit('link');   // §S70 — the edit must survive a reload
    invalidateGanttModel(); computeDays(); drawGanttMini(); renderAtTime(_cursor);
    } catch (e) { _tmEditExceptionRecover('linkGanttBars', e); }   // §TM_EDIT_EXCEPTION
  }

  // §GANTT_PROPS (E7) — typed editing + the dependency list (E4 unlink lives here rather than on a
  // 1px arrow hit-target: same verbs, same C1/C2 checks, just a precise input surface).
  function openGanttProps(bar) {
    var app = A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA) return;
    var schedId = (_taskIndex && _taskIndex.scheduleId) || 'SCH_AUTHORED';
    var d = function (ms) { return new Date(ms).toISOString().slice(0, 10); };
    // §S22_EPOCH_FIX, E7 (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S72) — the REAL calendar
    // dates, read from `tasks`, never bar.startTs/bar.endTs.
    // bar.startTs is the TM's OWN internal playback clock (a kernel_ops-derived day-offset solve,
    // near-1970 by construction). §S22 fixed commitGanttDrag for exactly this and E7 was never
    // brought along: the panel showed "1970-01-01" for a task really starting 2026-09-07, and
    // Apply then wrote that 1970 date straight into tasks.schedule_start through moveTaskCascade.
    // MEASURED live before the fix (Duplex, real dblclick → real Apply):
    //   §GANTT_PROPS_OPEN task=TASK_Substructure_T_FDN → input value 1970-01-01
    //   §GANTT_EDIT_MOVE  task=TASK_Substructure_T_FDN start=1970-01-05 cascaded=0
    //   §GANTT_EDIT_PERSIST what=propsApply ok=true      ← and §S70 then cached the corruption
    var realS = null, realF = null;
    try {
      var rr = app.db.exec('SELECT schedule_start, schedule_finish FROM tasks WHERE task_id=?', [bar.taskId]);
      if (rr.length && rr[0].values.length) { realS = rr[0].values[0][0]; realF = rr[0].values[0][1]; }
    } catch (e) {}
    if (!realS || !realF) {
      // Honest refusal, same shape as commitGanttDrag's no_real_task_snapshot: a panel that cannot
      // read the task's real dates must not offer to edit them with made-up ones.
      console.log('§GANTT_PROPS_REJECT reason=no_real_task_dates task=' + bar.taskId);
      _tmSay('Cannot edit — no real dates found for this task');   // §TM_SILENT_REFUSAL
      return;
    }
    var box = document.getElementById('tm-gantt-props') || (function () {
      var el = document.createElement('div');
      el.id = 'tm-gantt-props';
      el.style.cssText = 'position:absolute;right:8px;bottom:8px;z-index:20;background:rgba(20,20,40,0.97);' +
        'border:1px solid rgba(79,195,247,0.35);border-radius:8px;padding:8px 10px;font-size:11px;' +
        'color:#e0e0e0;min-width:250px;max-width:330px;max-height:60vh;overflow:auto';
      (document.getElementById('time-machine-panel') || document.body).appendChild(el);
      return el;
    })();
    var deps = (SA.listDependencies ? SA.listDependencies(app.db, schedId) : [])
      .filter(function (x) { return x.succId === bar.taskId || x.predId === bar.taskId; });
    var cpmInfo = bar.taskId ? _ganttCritical[bar.taskId] : null;   // §S68 — display only, never a date source
    var depHtml = deps.length ? deps.map(function (x, i) {
      var dir = x.succId === bar.taskId ? '← after' : '→ before';
      var other = x.succId === bar.taskId ? x.predName : x.succName;
      return '<div style="display:flex;justify-content:space-between;gap:6px;padding:1px 0">' +
        '<span>' + dir + ' <b>' + other + '</b> <span style="color:#8a97a5">' + x.type +
        (x.lag ? (x.lag > 0 ? '+' : '') + x.lag + 'd' : '') + '</span></span>' +
        '<button data-unlink="' + i + '" style="font-size:9px;padding:0 5px">unlink</button></div>';
    }).join('') : '<div style="color:#8a97a5">no dependencies</div>';
    box.innerHTML =
      '<div style="font-weight:bold;margin-bottom:4px">' + (bar.taskName || (bar.phase + ' — ' + bar.storey)) + '</div>' +
      '<div style="color:#8a97a5;margin-bottom:6px">' + bar.count + ' elements · ' + bar.taskId + '</div>' +
      // §GANTT_CPM_ANNOTATE (§S68) — read-only. Total float is the ONE number that tells you whether
      // a slip on this task moves the project end; the bar's red rail only says "zero float". Blank
      // when CPM could not run (cycle/thin table) rather than showing a made-up 0.
      (cpmInfo ? '<div style="margin-bottom:6px;color:' + (cpmInfo.critical ? '#e53935' : '#8a97a5') + '">' +
        (cpmInfo.critical ? 'CRITICAL PATH · zero float' : 'Total float ' + cpmInfo.totalFloat + 'd') +
        ' <span style="font-size:9px;color:#8a97a5">(CPM, dates unchanged)</span></div>' : '') +
      '<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">Start' +
        '<input id="tmp-s" type="date" value="' + realS + '" style="flex:1;font-size:11px"></div>' +
      '<div style="display:flex;gap:4px;align-items:center;margin-bottom:6px">Finish' +
        '<input id="tmp-f" type="date" value="' + realF + '" style="flex:1;font-size:11px"></div>' +
      '<div style="margin-bottom:4px;color:#8a97a5">Dependencies</div>' + depHtml +
      '<div style="display:flex;gap:6px;margin-top:8px">' +
        '<button id="tmp-apply" style="flex:1;font-size:11px">Apply</button>' +
        '<button id="tmp-close" style="font-size:11px">Close</button></div>' +
      '<div id="tmp-msg" style="color:#ff8c00;margin-top:4px;min-height:12px"></div>';
    box.style.display = 'block';
    console.log('§GANTT_PROPS_OPEN task=' + bar.taskId + ' deps=' + deps.length + ' elements=' + bar.count);
    document.getElementById('tmp-close').onclick = function () { box.style.display = 'none'; };
    box.querySelectorAll('[data-unlink]').forEach(function (btn) {
      btn.onclick = function () {
        // §TM_BAKE_LOCK (§S69) — on the WRITE, not on opening the panel: reading a task's dates
        // mid-bake is harmless, and refusing that would be a worse product than the bug.
        if (_tmEditLocked('openGanttProps:unlink')) return;
        var x = deps[parseInt(btn.getAttribute('data-unlink'), 10)];
        if (!x || !SA.removeDependency) return;
        SA.removeDependency(app.db, x.predId, x.succId);
        console.log('§GANTT_EDIT_UNLINK pred=' + x.predId + ' succ=' + x.succId);
        _tmAnnotateCpm(schedId);   // §GANTT_CPM_ANNOTATE (§S68) — removing an edge changes float too
        _tmPersistEdit('unlink');   // §S70 — the edit must survive a reload
        invalidateGanttModel(); computeDays(); drawGanttMini(); openGanttProps(bar);
      };
    });
    document.getElementById('tmp-apply').onclick = function () {
      if (_tmEditLocked('openGanttProps:apply')) return;   // §TM_BAKE_LOCK (§S69) — same, on the write
      var s = document.getElementById('tmp-s').value, f = document.getElementById('tmp-f').value;
      var msg = document.getElementById('tmp-msg');
      // Typed dates go through the SAME constraint-aware verbs as a drag — keyin is a second input
      // surface onto one model, never a bypass around C1/C2.
      // §S22_EPOCH_FIX: same tasksBefore snapshot commitGanttDrag/shiftGanttSchedule/
      // commitGanttGroupShift already capture, needed here too so retimeTaskElements can convert
      // res.moved's real calendar dates back onto the TM's own clock instead of splicing them in raw.
      var tasksBeforeApply = {};
      try {
        var tbA = app.db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE schedule_id=?', [schedId]);
        if (tbA.length) tbA[0].values.forEach(function (row) { tasksBeforeApply[row[0]] = { start: row[1], finish: row[2], duration: row[3] }; });
      } catch (e) {}
      // Compare against the REAL dates the panel was populated with (§S72) — comparing the typed
      // value against the TM-clock d(bar.startTs) made "start changed, finish didn't" always true,
      // so a pure finish edit was routed through moveTaskCascade as if it were a move.
      try {   // §TM_EDIT_EXCEPTION — typed-apply pipeline: engine verb through the final repaint
      var res = (s !== realS && f === realF && SA.moveTaskCascade)
        ? SA.moveTaskCascade(app.db, schedId, bar.taskId, s, {})
        : SA.resizeTask(app.db, schedId, bar.taskId, s, f, {});
      if (!res || !res.ok) { if (msg) msg.textContent = 'Rejected: ' + ((res && res.reason) || 'unknown'); return; }
      if (msg) msg.textContent = res.clamped ? ('Clamped to ' + res.start + ' by ' + res.blockedBy) :
        ('Applied · ' + res.cascaded + ' successor(s) cascaded');
      var byTask = {};
      for (var i = 0; i < _ganttTasks.length; i++) if (_ganttTasks[i].taskId) byTask[_ganttTasks[i].taskId] = _ganttTasks[i];
      retimeTaskElements(app.db, byTask, res.moved || [], tasksBeforeApply);
      _tmResyncAfterRetime();   // §GANTT_RETIME_RESYNC — without this the canvas plays the OLD times
      _tmAnnotateCpm(schedId);   // §GANTT_CPM_ANNOTATE (§S68) — re-derive float/critical FROM the new dates
      _tmPersistEdit('propsApply');   // §S70 — the edit must survive a reload
      console.log('§GANTT_PROPS_APPLY task=' + bar.taskId + ' start=' + res.start +
        ' clamped=' + res.clamped + ' cascaded=' + res.cascaded);
      invalidateGanttModel(); computeDays(); drawGanttMini(); renderAtTime(_cursor);
      } catch (e) { _tmEditExceptionRecover('commitGanttProps', e); }   // §TM_EDIT_EXCEPTION — the typed-apply path (props panel Apply)
    };
  }

  // ── §TM_P6_FOLD — P6 / MS Project interop + Diff-vs-Model, folded IN from the retired Schedule
  // Editor tab (viewer/schedule_editor.html + schedule_editor_ui.js, DELETED 2026-08-24). The tab's
  // editing surface (WBS outline, dependency editor, drag-Gantt, ▶ CPM, zoom) was fully redundant:
  // the drawer edits directly (§GANTT_EDIT/§GANTT_PROPS) and CPM float/criticality is auto-derived
  // after every edit (§S68 _tmAnnotateCpm). What was NOT redundant — file interop (Import P6/MSPDI,
  // Export MSPDI/PMXML/XER, §X5/§X6/§X7) and the §4D_SCHEDULE_DIFF grader — lives here now,
  // operating on the TM's own already-open app.db instead of a second sql.js copy in another tab.
  // foreign_schedule.js + schedule_diff.js stay pure engines and are LAZY-LOADED on first open of
  // this section (promise-cached dynamic injection, the same pattern as main.js APP.loadNavigate /
  // APP.loadWizard) — the main viewer's eager script list does not grow.
  // Alt+C impact: NONE — cinema_maxq.js only calls window.tm* globals that read closure state
  // (_ops/_projectStart/_projectEnd); it never opens the TM panel or touches its DOM (see the
  // §TM/Alt+C separation contract near tmActivateForBake: "Alt+C owns the camera", never the DOM).
  function _tmLoadP6Modules() {
    if (window.ForeignSchedule && window.ScheduleDiff) return Promise.resolve();
    if (_p6ModsPromise) return _p6ModsPromise;
    _p6ModsPromise = new Promise(function (resolve, reject) {
      var mods = ['foreign_schedule.js?v=1', 'schedule_diff.js?v=1'];
      function next(i) {
        if (i >= mods.length) { console.log('§TM_P6_LAZY_LOADED ' + mods.join(' + ')); resolve(); return; }
        var s = document.createElement('script');
        s.src = mods[i];
        s.onload = function () { next(i + 1); };
        s.onerror = function () { _p6ModsPromise = null; reject(new Error('failed to load ' + mods[i])); };
        document.head.appendChild(s);
      }
      next(0);
    });
    return _p6ModsPromise;
  }

  function toggleP6Drawer() {
    _p6Visible = !_p6Visible;
    // Mobile: only one bottom drawer at a time (mirror the gantt/dash/var rule).
    if (_p6Visible && window.innerWidth < 600 && _ganttVisible) {
      _ganttVisible = false;
      var gb = document.getElementById('tm-gantt-box'); if (gb) gb.classList.remove('open');
      var gbt = document.getElementById('tm-gantt'); if (gbt) gbt.classList.remove('tm-active');
    }
    var btn = document.getElementById('tm-editor');
    if (btn) btn.classList.toggle('tm-active', _p6Visible);
    var box = document.getElementById('tm-p6-box');
    if (box) box.classList.toggle('open', _p6Visible);
    if (_p6Visible) {
      _tmLoadP6Modules().then(function () {
        console.log('§TM_P6_OPEN modules ready ForeignSchedule=' + !!window.ForeignSchedule +
          ' ScheduleDiff=' + !!window.ScheduleDiff);
      }).catch(function (e) {
        _tmP6Say('Interop modules failed to load: ' + e.message);
      });
    }
  }

  function wireP6Controls() {
    var imp = document.getElementById('tm-p6-import'), impFile = document.getElementById('tm-p6-file');
    if (imp && impFile) {
      // 'click' (not pointerup) on purpose: opening a file dialog needs the user-activation a
      // click carries; the hidden input's programmatic .click() then inherits it.
      imp.addEventListener('click', function (e) { e.stopPropagation(); impFile.click(); });
      impFile.addEventListener('change', function () {
        if (impFile.files && impFile.files[0]) tmImportForeign(impFile.files[0]);
        impFile.value = '';
      });
    }
    var em = document.getElementById('tm-p6-export-msp');
    if (em) em.addEventListener('pointerup', function (e) { e.stopPropagation(); tmExportMSProject(); });
    var ep = document.getElementById('tm-p6-export-pmxml');
    if (ep) ep.addEventListener('pointerup', function (e) { e.stopPropagation(); tmExportPMXML(); });
    var ex = document.getElementById('tm-p6-export-xer');
    if (ex) ex.addEventListener('pointerup', function (e) { e.stopPropagation(); tmExportXER(); });
    var ed = document.getElementById('tm-p6-diff');
    if (ed) ed.addEventListener('pointerup', function (e) { e.stopPropagation(); tmDiffVsModel(); });
  }

  // Status routing: the section's own output line (persistent, multi-result) + the drawer tip
  // (transient, same say() every other TM action uses).
  function _tmP6Say(msg) {
    var out = document.getElementById('tm-p6-out');
    if (out) out.textContent = msg;
    _tmSay(msg);
  }

  // UTC day arithmetic — matches the engine's _addDays; ported verbatim from the Editor tab.
  function _p6DaysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

  function _tmP6BaseName(app) {
    var u = String((app && (app._dbPersistUrl || app.DB_URL)) || 'schedule');
    return u.split('?')[0].split('/').pop().replace(/\.[a-z0-9]+$/i, '') || 'schedule';
  }

  function _tmP6Download(content, mime, filename) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // Refresh the cached index first so an export right after an import targets the ADOPTED schedule,
  // not the last one the drawer indexed (buildTaskIndex re-probes activeSchedule; positive-cached).
  function _tmP6SchedId() {
    try { buildTaskIndex(); } catch (e) {}
    return (_taskIndex && _taskIndex.scheduleId) || 'SCH_AUTHORED';
  }

  // §X5 port — import a Primavera P6 (.xer / PMXML .xml) or MS Project (MSPDI) programme into the
  // TM's own db. Adopt via ForeignSchedule, then §TM-REFOLD: an import IS an external schedule
  // edit, so it takes the exact rebuild path main.js's bim_4d consumer already uses (stale gantt
  // cache + kernel_ops places invalidated, re-activate re-reads the adopted tasks). task_elements
  // stays empty unless auto-bind resolves tokens — binding is a separate, reviewable craft.
  function tmImportForeign(file) {
    if (_tmEditLocked('tmImportForeign')) { _tmP6Say('Recording in progress — import refused'); return; }   // §TM_BAKE_LOCK (§S69)
    var app = A();
    var FSx = (typeof window !== 'undefined') && window.ForeignSchedule;
    if (!FSx) { _tmP6Say('Interop module not loaded — reopen the P6/MSP section'); return; }
    if (!app || !app.db) { _tmP6Say('No model open yet'); return; }
    var rdr = new FileReader();
    rdr.onload = function () {
      try {
        var txt = String(rdr.result);
        var det = FSx.parseForeign(txt, file.name);   // sniff P6-XER / P6-XML(PMXML) / MS Project(MSPDI)
        var data = FSx.toScheduleData(det.parsed);
        FSx.adoptIntoDb(app.db, data);
        var schedId = data.schedules[0].id;
        // §B3 — auto-bind by convention (opt-in, reviewable): resolve any @disc:class tokens the
        // file carried and report the pre-bound counts — a deterministic SUGGESTION, never silent.
        var tokened = data.tasks.filter(function (t) { return t.bindSelector; }).length;
        var ab = document.getElementById('tm-p6-autobind'); var bindMsg = '';
        if (tokened && (!ab || ab.checked) && FSx.autoBind) {
          var r = FSx.autoBind(app.db, schedId);
          bindMsg = ' Pre-bound ' + r.bound + ' elements across ' + r.perActivity.length +
            ' activities by convention' +
            (r.unresolved.length ? ' (' + r.unresolved.length + ' selector(s) matched nothing — review)' : '') + '.';
          console.log('§TM_AUTOBIND schedule=' + schedId + ' bound=' + r.bound +
            ' activities=' + r.perActivity.length + ' unresolved=' + r.unresolved.length);
        } else if (tokened) {
          bindMsg = ' (' + tokened + ' activities carry a bind token — tick auto-bind to resolve.)';
        }
        invalidateGanttModel();
        _tmAnnotateCpm(schedId);        // §S68 — the Editor tab's ▶ CPM, automatic here
        _tmPersistEdit('import_p6');    // §S70 — an imported programme is a real edit, save it
        refoldSchedule();               // §TM-REFOLD — rebuild the 4D from the LIVE tasks table
        _tmP6Say('Imported ' + det.format + ' "' + file.name + '" — ' + data._meta.summaryCount +
          ' WBS / ' + data._meta.leafCount + ' activities / ' + data.taskSequences.length + ' links.' + bindMsg);
        console.log('§TM_IMPORT_P6 file=' + file.name + ' format=' + det.format +
          ' schedule=' + schedId + ' wbs=' + data._meta.summaryCount +
          ' activities=' + data._meta.leafCount + ' tokened=' + tokened);
      } catch (e) { _tmP6Say('Import failed: ' + e.message); console.error('§TM_IMPORT_P6 ERROR', e); }
    };
    rdr.readAsText(file);
  }

  // §X6 port — export to MS Project XML (MSPDI). Schema/units verified AGAINST foreign_schedule.js
  // parseMSPDI (not invented): OutlineLevel-encoded hierarchy, Duration='PT{hours}H0M0S', LinkLag in
  // TENTHS OF A MINUTE, PredecessorLink/Type 0=FF/1=FS/2=SF/3=SS, 8h/day calendar (MinutesPerDay=480).
  function tmExportMSProject() {
    var app = A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.wbsTree) { _tmP6Say('No schedule to export'); return; }
    var schedId = _tmP6SchedId();
    var tree = SA.wbsTree(app.db, schedId);
    if (!tree.length) { _tmP6Say('No tasks to export'); return; }
    var deps = SA.listDependencies ? SA.listDependencies(app.db, schedId) : [];
    var predByTask = {};
    deps.forEach(function (d) { (predByTask[d.succId] = predByTask[d.succId] || []).push(d); });

    var HPD = 8, MPD = HPD * 60;
    var TYPE_CODE = { FS: 1, SS: 3, FF: 0, SF: 2 };
    // split/join for the quote (not a /"/g regex literal): witness_tm_silent_refusal_tips.js's
    // brace scanner deliberately aborts on any regex literal containing a quote or brace.
    function xmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split('"').join('&quot;'); }
    function durTag(start, finish) {
      if (!start || !finish) return 'PT0H0M0S';
      var days = Math.max(1, _p6DaysBetween(start, finish));
      return 'PT' + (days * HPD) + 'H0M0S';
    }

    var uid = {}, seq = 1, rows = [];
    (function walk(nodes, level) {
      nodes.forEach(function (n) {
        uid[n.id] = seq++;
        rows.push({ n: n, level: level });
        if (n.children && n.children.length) walk(n.children, level + 1);
      });
    })(tree, 1);

    var name = _tmP6BaseName(app);
    var xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Project xmlns="http://schemas.microsoft.com/project">',
      '<Name>' + xmlEsc(name) + '</Name>',
      '<MinutesPerDay>' + MPD + '</MinutesPerDay>',
      '<Tasks>'];
    rows.forEach(function (r) {
      var n = r.n, u = uid[n.id];
      var links = predByTask[n.id] || [];
      xml.push('<Task>' +
        '<UID>' + u + '</UID><ID>' + u + '</ID>' +
        '<Name>' + xmlEsc(n.name) + '</Name>' +
        '<OutlineLevel>' + r.level + '</OutlineLevel>' +
        '<Summary>' + (n.isSummary ? 1 : 0) + '</Summary>' +
        (n.start ? '<Start>' + n.start + 'T08:00:00</Start>' : '') +
        (n.finish ? '<Finish>' + n.finish + 'T17:00:00</Finish>' : '') +
        '<Duration>' + durTag(n.start, n.finish) + '</Duration>' +
        (n.critical ? '<Critical>1</Critical>' : '') +
        links.map(function (l) {
          var lagTenths = Math.round((l.lag || 0) * HPD * 60 * 10);
          return '<PredecessorLink><PredecessorUID>' + uid[l.predId] + '</PredecessorUID>' +
            '<Type>' + (TYPE_CODE[l.type] != null ? TYPE_CODE[l.type] : 1) + '</Type>' +
            '<LinkLag>' + lagTenths + '</LinkLag></PredecessorLink>';
        }).join('') +
        '</Task>');
    });
    xml.push('</Tasks></Project>');

    var fname = name + '_schedule.xml';
    _tmP6Download(xml.join(''), 'application/xml', fname);
    _tmP6Say('Exported ' + rows.length + ' tasks / ' + deps.length + ' links to MS Project XML (' + fname + ').');
    console.log('§TM_EXPORT_MSP tasks=' + rows.length + ' links=' + deps.length + ' file=' + fname);
  }

  // §X7 port — Primavera PMXML / XER writers. SAME (tree, deps) input tmExportMSProject reads —
  // ForeignSchedule.toPMXML/toXER are pure serializers (W-XER-ROUNDTRIP/W-PMXML-ROUNDTRIP prove
  // mismatch=0 re-parsing the writer's own output with our reader).
  function _tmExportP6(kind, writeFn, ext, mime, label) {
    var app = A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    if (!app || !app.db || !SA || !SA.wbsTree) { _tmP6Say('No schedule to export'); return; }
    var FSx = (typeof window !== 'undefined') && window.ForeignSchedule;
    if (!FSx || !FSx[writeFn]) { _tmP6Say('Interop module not loaded — reopen the P6/MSP section'); return; }
    var schedId = _tmP6SchedId();
    var tree = SA.wbsTree(app.db, schedId);
    if (!tree.length) { _tmP6Say('No tasks to export'); return; }
    var deps = SA.listDependencies ? SA.listDependencies(app.db, schedId) : [];
    var name = _tmP6BaseName(app);
    var out = FSx[writeFn](tree, deps, { hpd: 8, projectId: schedId, projectName: name });

    var fname = name + '_schedule.' + ext;
    _tmP6Download(out, mime, fname);
    var leafCount = 0; (function walk(ns) { (ns || []).forEach(function (n) { if (!n.isSummary) leafCount++; walk(n.children); }); })(tree);
    _tmP6Say('Exported ' + leafCount + ' tasks / ' + deps.length + ' links to ' + label + ' (' + fname +
      '). Some fields (WBS code, EPS-level activity codes, resource assignments, global calendars, ' +
      'baselines) are not carried — P6 itself drops most of these on cross-DB import.');
    console.log('§TM_EXPORT_' + kind + ' tasks=' + leafCount + ' links=' + deps.length + ' file=' + fname);
  }
  function tmExportPMXML() { _tmExportP6('PMXML', 'toPMXML', 'xml', 'application/xml', 'Primavera PMXML'); }
  function tmExportXER() { _tmExportP6('XER', 'toXER', 'xer', 'text/plain', 'Primavera XER'); }

  // §4D_SCHEDULE_DIFF port — grade an IMPORTED P6/MSP schedule's per-phase durations against OUR
  // own real-quantity + labor-rate estimate for THIS building. Only meaningful on a captured
  // (imported) schedule — diffing our own generated estimate against itself is a no-op. The
  // estimate is written to the throwaway SCH_DIFF_SHADOW schedule (non-destructive,
  // rebuild-on-every-call — schedule_diff.js's own convention).
  function tmDiffVsModel() {
    var app = A(), SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
    var DFx = (typeof window !== 'undefined') && window.ScheduleDiff;
    if (!DFx) { _tmP6Say('Interop module not loaded — reopen the P6/MSP section'); return; }
    if (!app || !app.db || !SA || !SA.activeSchedule) { _tmP6Say('No schedule loaded'); return; }
    var act = SA.activeSchedule(app.db);
    if (!act || !act.captured) {
      _tmP6Say('Diff vs Model compares an IMPORTED P6/MSP schedule against our real-quantity estimate — import one first.');
      return;
    }
    _tmP6Say('Computing schedule diff…');
    setTimeout(function () {
      var res = DFx.computeScheduleDiff(app.db, null, { importedScheduleId: act.id, start: '2026-01-01' });
      if (res.error) { _tmP6Say('Diff failed: ' + res.error); return; }
      var lines = res.phases.map(function (r) {
        var icon = r.flag === 'optimistic' ? '⚡' : r.flag === 'slow' ? '🐢' : '✓';
        return icon + ' ' + r.phase + ': theirs ' + r.theirDays + 'd vs ours ' + r.ourDays + 'd (' +
          (r.deltaPct > 0 ? '+' : '') + r.deltaPct + '%) — ' + r.flagMsg;
      });
      if (res.unmatchedActivities.length) lines.push(res.unmatchedActivities.length +
        ' activity(ies) unmatched — see console §4D_DIFF_UNMATCHED');
      var out = document.getElementById('tm-p6-out');
      if (out) out.textContent = lines.join('   ');
      _tmSay('4D Schedule Diff: ' + res.summary.matchedPhases + '/' + res.summary.ourPhases +
        ' phases compared, ' + res.summary.matchedActivities + '/' + res.summary.theirActivities +
        ' activities matched.');
      console.log('§TM_DIFF schedule=' + act.id + ' matchedPhases=' + res.summary.matchedPhases +
        ' matchedActivities=' + res.summary.matchedActivities + ' unmatched=' + res.summary.unmatchedActivities);
    }, 30);
  }

  function drawGanttMini() {
    if (!_ops.length) return;
    var canvas = document.getElementById('tm-gantt-canvas');
    var box = document.getElementById('tm-gantt-box');
    if (!canvas || !box) return;
    buildGanttTasks();
    if (!_ganttTasks.length) return;
    wireGanttResize();
    wireGanttRulerShift();
    // §GANTT_EDIT_LOCK: wire the lock toggle once, and auto-materialize a schedule the first time
    // this drawer has nothing editable to show (replaces the old §GANTT_AUTHOR_ENTRY button — no
    // click required, no side panel involved). One attempt per activate() (_ganttAutoGenAttempted),
    // so a genuine materialize failure doesn't retry every redraw.
    (function () {
      var editable = 0;
      for (var q = 0; q < _ganttTasks.length; q++) if (_ganttTasks[q].taskId) editable++;
      var lockBtn = document.getElementById('tm-gantt-editlock');
      if (lockBtn && !lockBtn._wired) {
        lockBtn._wired = true;
        lockBtn.addEventListener('pointerup', function (e) {
          e.stopPropagation();
          function applyLockUi() {
            lockBtn.innerHTML = _ganttEditable ? '&#x1F513; Editing' : '&#x1F512; Locked';
            lockBtn.title = _ganttEditable
              ? 'Editing: drag to move/resize, drag onto another bar to link, double-click for typed edit. Click to lock.'
              : 'Locked: drag/resize/link disabled, timeline still scrubs live. Click to unlock editing.';
            console.log('§GANTT_EDIT_LOCK editable=' + _ganttEditable);
            // §TM_PANEL_RESIZE auto-expand (user ruling 2026-08-05): editing needs elbow room (the
            // props panel alone is ~330px wide) — widen automatically rather than making the user find
            // the new resize grip every time. Only expands if narrower than the edit width already (a
            // user who manually widened past it keeps their own choice); restores to whatever width was
            // active the moment editing turned on, so a manual resize DURING editing is not fought.
            if (_panel) {
              var curW = _panel.getBoundingClientRect().width;
              if (_ganttEditable) {
                _panelWPreEdit = curW;
                if (curW < PANEL_W_EDIT) { _panelW = PANEL_W_EDIT; _panel.style.width = PANEL_W_EDIT + 'px'; }
              } else if (_panelWPreEdit != null) {
                _panelW = _panelWPreEdit; _panel.style.width = _panelWPreEdit + 'px'; _panelWPreEdit = null;
              }
            }
          }
          if (_ganttEditable) {
            // §GANTT_LOCK_INTEGRITY: 🔓→🔒 verifies the EDITED schedule still holds physical
            // integrity before the lock is accepted. Breach ⇒ the lock is REFUSED (stays Editing),
            // the flag names the floaters, and ↺ Undo (or further corrective edits) is the way out —
            // the gate is stateless, every lock attempt re-audits, so undo depth vs breach depth
            // (spec open-question 1) needs no edit-history tracing. Only THIS transition is gated
            // (spec Q2); unlock below never verifies.
            var lm = document.getElementById('tm-gantt-lockmsg');
            if (lm) { lm.textContent = 'Verifying integrity…'; lm.style.color = ''; }
            setTimeout(function () {   // let the "Verifying…" state paint before the audit runs (spec Q3)
              var v = verifyGanttIntegrity();
              if (!v.ok) {
                console.log('§GANTT_LOCK_BREACH floating=' + v.floating + '(+' + v.dFloating + ') midair=' +
                  (v.midair || 0) + '(+' + (v.dMidair || 0) + ')/' + v.total + ' ms=' + v.ms +
                  ' sample=[' + v.guids.slice(0, 5).join(',') + '] (lock refused — Undo or fix, then lock again)');
                if (lm) {
                  var _breach = [];
                  if (v.dFloating > 0) _breach.push('+' + v.dFloating + ' floating');
                  if (v.dMidair > 0) _breach.push('+' + v.dMidair + ' hanging in midair');
                  lm.textContent = '⚠ Integrity Breach: ' + _breach.join(' + ') + ' — press ↺ Undo edit (or fix), then lock again';
                  lm.style.color = '#f66';
                }
                return;   // REFUSED — _ganttEditable stays true, nothing hidden
              }
              console.log('§GANTT_LOCK_VERIFY ok floating=' + v.floating + '/base=' + v.baseFloating +
                ' midair=' + v.midair + '/base=' + v.baseMidair + ' total=' + v.total + ' ms=' + v.ms +
                (v.skipped ? ' skipped=' + v.skipped : ''));
              if (lm) { lm.textContent = ''; lm.style.color = ''; }
              _ganttEditable = false;
              applyLockUi();
            }, 0);
            return;
          }
          _ganttEditable = true;
          captureLockBaseline();   // §GANTT_LOCK_DELTA: the state the planner inherited
          applyLockUi();
        });
      }
      var lockMsg = document.getElementById('tm-gantt-lockmsg');
      if (lockMsg) lockMsg.textContent = editable ? '' : (_ganttAutoGenAttempted ? 'No schedule available' : '');
      if (!editable && !_ganttAutoGenAttempted) {
        _ganttAutoGenAttempted = true;
        console.log('§GANTT_AUTO_GENERATE no editable bars — materializing a schedule natively');
        generateGanttSchedule();
      }
    })();
    if (_ganttBoxH) box.style.maxHeight = _ganttBoxH + 'px';

    // §GANTT_PALETTE: the phase legend strip is GONE (user: "the legend is redundant, just hover
    // labelling is sufficient"). The hover tooltip already reports strictly more than the legend did
    // — storey, phase, element count, day range AND the generated-vs-IFC-4D source — so the legend
    // carried no information of its own. Removing it returns its row of vertical space to the bars.

    // Canvas sizing
    var barH = 12, gapH = 2, rowH = barH + gapH;
    var marginL = 60; // storey labels
    var numTasks = _ganttTasks.length;
    var cW = box.clientWidth;
    var cH = numTasks * rowH + 4;
    var barW = cW - marginL;

    canvas.width = cW * (window.devicePixelRatio || 1);
    canvas.height = cH * (window.devicePixelRatio || 1);
    canvas.style.height = cH + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, cW, cH);

    // §GANTT_AXIS_OUTLIER: qualified DISPLAY axis (see var declarations) — bars/ruler/gridlines/hairline
    // all draw against this, never the real playback _projectStart/_projectEnd.
    var range = Math.max(1, _ganttAxisEnd - _ganttAxisStart);
    var prevStorey = '';

    // §GANTT_RULER (E5): draw the sticky axis header, then lay its ticks down the bar canvas as
    // gridlines. Same tick set for both, so a bar's edge can be read against a real date instead of
    // being eyeballed against nothing. Drawn BEFORE the bars so it never sits on top of them.
    var R = drawGanttRuler(cW, marginL, barW);
    if (R) {
      ctx.strokeStyle = 'rgba(120,140,160,0.13)';
      ctx.lineWidth = 1;
      R.ticks.forEach(function (t) {
        var gx = Math.round(marginL + (t.ts - _ganttAxisStart) / range * barW) + 0.5;
        if (gx < marginL || gx > marginL + barW) return;
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, cH); ctx.stroke();
      });
    }

    // Draw bars
    for (var ti = 0; ti < numTasks; ti++) {
      var task = _ganttTasks[ti];
      var x = marginL + (task.startTs - _ganttAxisStart) / range * barW;
      var w = (task.endTs - task.startTs) / range * barW;
      if (w < 2) w = 2;
      var y = ti * rowH + 2;
      var color = PHASE_COLORS[task.phase] || '#888';

      // Storey label (only if different from previous row)
      if (task.storey !== prevStorey) {
        prevStorey = task.storey;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#999';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(task.storey.substring(0, 8), marginL - 4, y + barH / 2);
      }

      // Active highlight: cursor is within this task's time range
      var isActive = (_cursor >= task.startTs && _cursor <= task.endTs);

      // §GANTT_PALETTE: fills at full opacity — 0.8 flattened what little contrast the old palette
      // had. The families carry the distinction now, so the bars can be read at a glance.
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, barH);

      // §gate: captured (preset IFC 4D) bars get a bright-yellow frame so you can tell the real
      // programme from the generated fallback. cap = #captured ops in this storey|phase group.
      if (task.cap > 0) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffeb3b';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), barH - 1);
      }

      if (isActive) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ff8c00';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, barH);
      }

      // §GANTT_GROUP_MOVE — marquee-selected bars get a bright cyan frame, same idea as the
      // captured-schedule yellow frame above (a different concern, so a different colour, drawn
      // last so it always reads on top). Selection is ephemeral UI state (_ganttSelected), not
      // persisted — this is the only place it's visible.
      if (task.taskId && _ganttSelected[task.taskId]) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, barH + 2);
      }

      // §GANTT_CPM_ANNOTATE (§S68/§S74): float rail on the BOTTOM edge — red = on the critical path
      // (zero float), green = has slack. DRAWN LAST, and that placement is the fix, not a preference:
      // §S68 drew it right after the bar fill, so the yellow captured-schedule frame (a 1px
      // strokeRect around the whole bar) painted straight over its bottom row. MEASURED on the live
      // site before this change — canvas pixels read back, not eyeballed — 19 bars: the rail showed
      // on only ONE of its two rows (railVisibleAt row h-2 = 15, at h-1 = 0) and the yellow frame
      // owned h-1 on 17 of 19. A 2px cue that renders as 1px, half of it blended against the phase
      // fill, is why it read as "no visual cue at all".
      // NOT a fourth stroke frame: yellow (captured), orange (cursor-active) and cyan
      // (marquee-selected) already take all three, and a fourth at this row height is unreadable.
      // Why BOTH colours rather than red-only: MEASURED over the 8-building fleet with the real rate
      // tables, criticality runs 27–82% of tasks (witness_gantt_cpm_annotate.js W-CPM-5). At the top
      // of that range a red-only rail marks four bars in five and carries almost no signal; painting
      // the complement makes the SCARCE thing — the bars that can actually move without pushing the
      // end date — the thing that stands out, at every fraction.
      // The marks are derived FROM the dates the cascade wrote — annotate never moved one.
      var cpmMark = task.taskId ? _ganttCritical[task.taskId] : null;
      if (cpmMark) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = cpmMark.critical ? CPM_COLOR_CRITICAL : CPM_COLOR_FLOAT;
        ctx.fillRect(x, y + barH - 2, w, 2);
      }

      // Label: explicit phase short-code (§GANTT_PALETTE). substring(0,3) used to yield "Sub" vs
      // "Sup" — one character apart at 9px, colliding on the very pair the colours also collided on.
      if (w > 40) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = PHASE_INK[task.phase] || '#fff';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(PHASE_SHORT[task.phase] || task.phase.substring(0, 3), x + w - 3, y + barH / 2);
      }
    }

    // §GANTT_BAR_RECTS — read-only debug hook, same double-underscore convention as __tmScheduleDebug
    // above. Exposes the ACTUAL drawn rect of every bar so a browser wiring test can aim a synthetic
    // pointer at measured geometry instead of guessing at it. The first attempt at proving the drag
    // aimed at marginL+40px and hit empty canvas past the end of a short bar, which is
    // indistinguishable from "the handler never fired" — this removes that ambiguity for good.
    // §GANTT_AXIS_OUTLIER: hook reads back the qualified axis too, so a live probe sees exactly
    // what's drawn, not the pre-fix unqualified math.
    try {
      window.__tmGanttBars = _ganttTasks.map(function (t, i) {
        var bx = marginL + (t.startTs - _ganttAxisStart) / range * barW;
        var bw = Math.max(2, (t.endTs - t.startTs) / range * barW);
        return { i: i, taskId: t.taskId || null, phase: t.phase, storey: t.storey,
          x: bx, w: bw, y: i * rowH + 2, h: barH, midX: bx + bw / 2, midY: i * rowH + 2 + barH / 2 };
      });
      // §GANTT_BAR_RECTS_RAW (2026-08-17, 4D_GANTT_TM_REFACTOR.md stage 2) — same read-only debug
      // convention as __tmGanttBars above, but the real ms times instead of pixel geometry. Needed
      // to measure the actual rendered bar span (stagger acceptance) without re-deriving ms from
      // pixels through the axis math — a live probe reads exactly what was drawn from, not a
      // reconstruction of it.
      window.__tmGanttBarsRaw = _ganttTasks.map(function (t, i) {
        return { i: i, taskId: t.taskId || null, phase: t.phase, storey: t.storey,
          startTs: t.startTs, endTs: t.endTs, count: t.count };
      });
    } catch (e) {}

    // Hairline cursor. §GANTT_AXIS_OUTLIER: clamp into the qualified axis — the real _cursor can
    // legitimately run past it (e.g. once playback reaches the outlier op itself), and an unclamped
    // hairline would draw far outside the canvas instead of pinning to the visible edge.
    ctx.globalAlpha = 1;
    var hxFrac2 = Math.max(0, Math.min(1, (_cursor - _ganttAxisStart) / range));
    var hx = marginL + hxFrac2 * barW;
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx, cH);
    ctx.stroke();

    ctx.globalAlpha = 1;

    // Update div hairline too
    var hair = document.getElementById('tm-gantt-hair');
    if (hair) {
      hair.style.left = hx + 'px';
      hair.style.display = 'block';
    }

    // §S260c: Auto-scroll Gantt drawer to keep active bar visible during playback
    if (_playing && box.scrollHeight > box.clientHeight) {
      for (var ai = 0; ai < numTasks; ai++) {
        if (_cursor >= _ganttTasks[ai].startTs && _cursor <= _ganttTasks[ai].endTs) {
          var activeY = ai * rowH;
          var scrollTarget = activeY - box.clientHeight / 2;
          if (Math.abs(box.scrollTop - scrollTarget) > rowH * 2) {
            box.scrollTop += (scrollTarget - box.scrollTop) * 0.15; // smooth scroll
          }
          break;
        }
      }
    }
  }

  // ── Dashboard DOM toggle ──
  function toggleDashDOM(on) {
    var col = document.getElementById('tm-dash-col');
    if (col) col.classList.toggle('open', on);
    var btn = document.getElementById('tm-dash');
    if (btn) btn.classList.toggle('tm-active', on);
  }

  // ── Find bar at click/hover ──
  function findBarAtClick(e) {
    if (!_ganttTasks.length) return null;
    var rect = e.target.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var barH = 12, gapH = 2, rowH = barH + gapH;
    var cW = rect.width;
    // §GANTT_AXIS_OUTLIER: must match drawGanttMini's own bar geometry, which draws against the
    // qualified axis — hit-testing against the unqualified one would silently miss bars.
    var range = Math.max(1, _ganttAxisEnd - _ganttAxisStart);
    var marginL = 60;
    var barW = cW - marginL;
    for (var i = 0; i < _ganttTasks.length; i++) {
      var task = _ganttTasks[i];
      var bx = marginL + (task.startTs - _ganttAxisStart) / range * barW;
      var bw = (task.endTs - task.startTs) / range * barW;
      if (bw < 2) bw = 2;
      var by = i * rowH + 2;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + barH) return task;
    }
    return null;
  }

  // §GANTT_GROUP_MOVE — every task whose drawn rect intersects the given canvas-local marquee
  // rectangle. SAME geometry as findBarAtClick (marginL=60, rowH=14) — a marquee that misses a bar
  // findBarAtClick would also miss is a bug, not a feature, so this deliberately shares the exact
  // constants rather than a second copy of them. Only bars with a real taskId are selectable — an
  // un-authored bar has nothing to shift.
  function barsInRect(cW, rx0, ry0, rx1, ry1) {
    var barH = 12, gapH = 2, rowH = barH + gapH;
    var range = Math.max(1, _ganttAxisEnd - _ganttAxisStart);
    var marginL = 60;
    var barW = cW - marginL;
    var lo = Math.min(rx0, rx1), hi = Math.max(rx0, rx1), top = Math.min(ry0, ry1), bot = Math.max(ry0, ry1);
    var out = [];
    for (var i = 0; i < _ganttTasks.length; i++) {
      var task = _ganttTasks[i]; if (!task.taskId) continue;
      var bx = marginL + (task.startTs - _ganttAxisStart) / range * barW;
      var bw = (task.endTs - task.startTs) / range * barW; if (bw < 2) bw = 2;
      var by = i * rowH + 2;
      if (bx <= hi && bx + bw >= lo && by <= bot && by + barH >= top) out.push(task);
    }
    return out;
  }

  // ── RES_ICONS (reused from boq_charts) ──
  var RES_ICONS = {
    STEEL_ERECTOR:  '\uD83C\uDFD7\uFE0F',
    CONCRETE_GANG:  '\uD83D\uDEA7',
    MASON:          '\uD83E\uDDF1',
    PLUMBER:        '\uD83D\uDEB0',
    HVAC_TECH:      '\u2699\uFE0F',
    ELECTRICIAN:    '\u26A1',
    CARPENTER:      '\uD83E\uDEB5',
    ROOFER:         '\uD83C\uDFE0',
    FINISHER:       '\uD83D\uDD8C\uFE0F',
    LABORER:        '\uD83D\uDC77'
  };

  // ── Donut pie chart ──
  function drawDonut(canvasId, pct, label, sublabel, color) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height, cx = w/2, cy = h/2, r = Math.min(cx,cy) - 8;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.stroke();
    if (pct > 0) {
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI/2, -Math.PI/2 + Math.PI*2*(pct/100));
      ctx.lineWidth = 12; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy - 6);
    ctx.fillStyle = '#999'; ctx.font = '10px sans-serif';
    ctx.fillText(sublabel, cx, cy + 12);
  }

  // ── Dashboard drawer ──
  var _dashLogTick = 0; // §S260d: throttle dashboard logs
  function drawDashboard() {
    if (!_ops.length) return;
    _dashLogTick++;

    // Time donut — elapsed vs total days
    var totalDays = Math.max(1, Math.round((_projectEnd - _projectStart) / 86400000));
    var curDay = Math.max(0, Math.round((_cursor - _projectStart) / 86400000));
    var timePct = Math.round(curDay / totalDays * 100);
    drawDonut('tm-dash-time-pie', timePct, 'Day ' + curDay, timePct + '% elapsed', '#4fc3f7');

    // Cost donut — weighted by rate_per_day × install duration per op
    // Each op accrues cost proportionally between start and end (not binary done/not-done).
    var LR = window.LABOR_RATES || {};
    var totalCost = 0, doneCost = 0;
    for (var ci2 = 0; ci2 < _ops.length; ci2++) {
      var op2 = _ops[ci2];
      var opRes = (op2.parameters || {}).resource || '';
      var lr = LR[opRes];
      // §FUTURE-5A B5 (applied 2026-09-02, queue item B-3): the bare "95" was an undocumented
      // duplicate of sequence_rules.json LABOR_RATES.LABORER (rate_per_day 95, crew_size 1) — read
      // that entry directly; the literal 95 now fires only if LABORER itself is absent from LR.
      var _laborerLR = LR.LABORER;
      var dailyRate = lr ? lr.rate_per_day * (lr.crew_size || 1)
        : (_laborerLR ? _laborerLR.rate_per_day * (_laborerLR.crew_size || 1) : 95);
      var opStart = op2.start_ts || _projectStart;
      var realEnd = op2.end_ts || _projectEnd;
      var durMs = Math.max(1, realEnd - opStart);
      var durDays = durMs / 86400000;
      var cost = dailyRate * durDays;
      totalCost += cost;
      // Proportional: how much of this op's duration has elapsed at cursor
      if (_cursor >= realEnd) {
        doneCost += cost;
      } else if (_cursor > opStart) {
        doneCost += cost * ((_cursor - opStart) / durMs);
      }
    }
    if (_dashLogTick % 20 === 0) console.log('§COST_DEBUG ops=' + _ops.length + ' totalCost=' + Math.round(totalCost) + ' doneCost=' + Math.round(doneCost) + ' cursor=' + Math.round((_cursor-_projectStart)/86400000) + 'd/' + Math.round((_projectEnd-_projectStart)/86400000) + 'd');
    var costPct = totalCost > 0 ? Math.round(doneCost / totalCost * 100) : 0;
    var costLabel = doneCost >= 1000000 ? '$' + (doneCost/1000000).toFixed(1) + 'M'
                  : doneCost >= 1000 ? '$' + Math.round(doneCost/1000) + 'K'
                  : '$' + Math.round(doneCost);
    drawDonut('tm-dash-cost-pie', costPct, costLabel, costPct + '% spent', '#44cc44');
    if (_dashLogTick % 20 === 0) console.log('§DASH_DONUTS time=' + timePct + '% cost=' + costPct + '%');

    // Phase progress
    var phaseTotals = {};
    var phaseDone = {};
    var PHASE_ORDER = ['Substructure','Superstructure','MEP Rough-in','Architecture','MEP Final','Finishes'];
    for (var i = 0; i < _ops.length; i++) {
      var p = (_ops[i].parameters || {}).phase || 'Architecture';
      if (!phaseTotals[p]) { phaseTotals[p] = 0; phaseDone[p] = 0; }
      phaseTotals[p]++;
      if (_ops[i].end_ts <= _cursor) phaseDone[p]++;
    }

    var phDiv = document.getElementById('tm-dash-phases');
    if (phDiv) {
      var html = '';
      var phaseCount = 0;
      for (var pi = 0; pi < PHASE_ORDER.length; pi++) {
        var ph = PHASE_ORDER[pi];
        if (!phaseTotals[ph]) continue;
        phaseCount++;
        var pct = Math.round(phaseDone[ph] / phaseTotals[ph] * 100);
        var col = PHASE_COLORS[ph] || '#888';
        html += '<div style="margin:2px 0;font-size:10px">' +
          '<div style="display:flex;justify-content:space-between;color:#ccc"><span>' + ph + '</span><span>' + pct + '%</span></div>' +
          '<div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">' +
          '<div style="width:' + pct + '%;height:100%;background:' + col + ';transition:width 0.2s"></div></div></div>';
        if (_dashLogTick % 20 === 0) console.log('§DASH_PHASE ' + ph + ' ' + pct + '%');
      }
      phDiv.innerHTML = html;
    }

    // Site resources — frontier ops with progress bars (old GanttChart player style)
    var crews = {};
    var crewTotal = 0;
    var maxCrew = 0;
    var machines = {};
    var EA = window.EQUIPMENT_ALLOCATION || {};
    for (var ci = 0; ci < _ops.length; ci++) {
      var op = _ops[ci];
      if (op.start_ts <= _cursor && op.end_ts > _cursor) {
        var res = (op.parameters || {}).resource || '';
        if (res) {
          if (!crews[res]) crews[res] = 0;
          crews[res]++;
          crewTotal++;
          if (crews[res] > maxCrew) maxCrew = crews[res];
        }
        // Equipment from EQUIPMENT_ALLOCATION
        var opCls = (op.parameters || {}).cls || '';
        var eqAlloc = EA[opCls];
        if (eqAlloc && eqAlloc.equipment) machines[eqAlloc.equipment] = true;
      }
    }
    var RES_COLORS = {
      STEEL_ERECTOR: '#e57373', CONCRETE_GANG: '#ffb74d', MASON: '#a1887f',
      PLUMBER: '#4fc3f7', HVAC_TECH: '#81c784', ELECTRICIAN: '#fff176',
      CARPENTER: '#ce93d8', ROOFER: '#90a4ae', FINISHER: '#f48fb1', LABORER: '#b0bec5'
    };
    var crDiv = document.getElementById('tm-dash-crews');
    if (crDiv) {
      var ch = '';
      for (var r in crews) {
        var icon = RES_ICONS[r] || '\uD83D\uDC77';
        var color = RES_COLORS[r] || '#888';
        var LR = window.LABOR_RATES || {};
        var tradeLabel = LR[r] && LR[r].trade ? LR[r].trade.split(' (')[0] : r.replace(/_/g, ' ');
        var barPct = maxCrew > 0 ? Math.round(crews[r] / maxCrew * 100) : 0;
        ch += '<div style="display:flex;align-items:center;gap:4px;padding:2px 0">' +
          '<span style="font-size:16px;width:22px;text-align:center;flex-shrink:0">' + icon + '</span>' +
          '<span style="width:60px;font-size:9px;color:' + color + ';font-weight:600;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + tradeLabel + '</span>' +
          '<div style="flex:1;height:14px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">' +
          '<div style="height:100%;width:' + barPct + '%;background:' + color + ';border-radius:3px;transition:width 0.3s"></div></div>' +
          '<span style="width:24px;text-align:right;font-size:13px;font-weight:800;color:' + color + ';flex-shrink:0">' + crews[r] + '</span></div>';
      }
      // Equipment row
      var machList = Object.keys(machines);
      var ER = window.EQUIPMENT_RATES || {};
      if (machList.length) {
        ch += '<div style="margin-top:3px;padding-top:3px;border-top:1px solid rgba(255,255,255,0.05)">';
        for (var mi2 = 0; mi2 < machList.length; mi2++) {
          var eqDesc = ER[machList[mi2]] ? ER[machList[mi2]].desc : machList[mi2].replace(/_/g, ' ');
          ch += '<div style="display:flex;align-items:center;gap:4px;padding:1px 0;color:rgba(255,255,255,0.5)">' +
            '<span style="font-size:13px;width:22px;text-align:center">\uD83D\uDE9C</span>' +
            '<span style="font-size:9px">' + eqDesc + '</span></div>';
        }
        ch += '</div>';
      }
      // Footer
      ch += '<div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:4px;padding-top:3px;border-top:1px solid rgba(255,255,255,0.05)">' +
        '<strong style="color:rgba(255,255,255,0.7)">' + crewTotal + '</strong> workers \u00B7 ' +
        '<strong style="color:rgba(255,255,255,0.7)">' + machList.length + '</strong> machines</div>';
      if (!crewTotal) ch = '<div style="color:#666;font-size:10px">No active crews</div>';
      crDiv.innerHTML = ch;
    }

    // S-Curve sparkline
    if (!_sCurveData) computeSCurve();
    // §E2b: trigger shopfloor load on first draw; invalidate S-curve when it arrives so stacked data renders
    if (!_shopfloor && !_shopfloorLoading) {
      _loadShopfloor().then(function (sf) {
        if (sf) { _sCurveData = null; if (_dashVisible) { computeSCurve(); drawSCurve(); } }
      });
    }
    drawSCurve();

    // Day counter
    var totalDays = Math.max(1, Math.round((_projectEnd - _projectStart) / 86400000));
    var curDay = Math.max(0, Math.round((_cursor - _projectStart) / 86400000));
    var totalDone = 0;
    for (var di = 0; di < _ops.length; di++) { if (_ops[di].end_ts <= _cursor) totalDone++; }
    var donePct = Math.round(totalDone / _ops.length * 100);
    var dc = document.getElementById('tm-dash-daycnt');
    if (dc) dc.textContent = 'Day ' + curDay + ' / ' + totalDays + ' \u2014 ' + donePct + '% complete';

    // §S260e: Throttle — was spamming every tick during playback
    if (!drawDashboard._tick) drawDashboard._tick = 0;
    if (++drawDashboard._tick % 20 === 0) {
      console.log('§DASH_OPEN phases=' + phaseCount + ' crews=' + crewTotal);
    }
  }

  // §E2b — STACKED S-curve: if shopfloor data loaded, stacks Material/Labor/Burden/Overhead cost elements;
  // else falls back to op-count monotonic curve. "Batch lights together" = all elements of an order accrue
  // at its finish date (not during; binary done/not-done per order, monotonic by construction). W-SHOP-SCURVE.
  var _SF_ELEMS = ['Material', 'Labor', 'Burden', 'Overhead'];
  var _SF_COLORS = { Material: 'rgba(136,136,136,0.65)', Labor: 'rgba(79,195,247,0.65)',
                     Burden: 'rgba(255,213,79,0.65)', Overhead: 'rgba(255,140,0,0.65)' };

  function computeSCurve() {
    if (!_ops.length) { _sCurveData = []; return; }
    var totalDays = Math.max(1, Math.round((_projectEnd - _projectStart) / 86400000));
    var step = Math.max(1, Math.floor(totalDays / 50));
    var sf = _shopfloor;

    if (sf && sf.orders.length) {
      // cost-element stacked: at each step, sum CumulatedAmt of orders whose finish has passed
      var grandTotal = 0;
      sf.orders.forEach(function (o) {
        _SF_ELEMS.forEach(function (e) { grandTotal += (o.elements[e] || 0); });
      });
      if (!grandTotal) { _sCurveData = []; return; }
      var points = [];
      for (var d = 0; d <= totalDays; d += step) {
        var ts = _projectStart + d * 86400000;
        var pt = { day: d };
        _SF_ELEMS.forEach(function (e) { pt[e] = 0; });
        sf.orders.forEach(function (o) {
          if (o.end <= ts) { _SF_ELEMS.forEach(function (e) { pt[e] += o.elements[e] || 0; }); }
        });
        _SF_ELEMS.forEach(function (e) { pt[e] = pt[e] / grandTotal * 100; });   // → % of grand total
        points.push(pt);
      }
      _sCurveData = points;
      console.log('§SCURVE_COMPUTE stacked=true orders=' + sf.orders.length + ' steps=' + points.length + ' grandTotal=' + Math.round(grandTotal));
    } else {
      // fallback count-based (until shopfloor loads)
      var points2 = [];
      for (var d2 = 0; d2 <= totalDays; d2 += step) {
        var ts2 = _projectStart + d2 * 86400000;
        var done = 0;
        for (var i = 0; i < _ops.length; i++) { if (_ops[i].end_ts <= ts2) done++; }
        points2.push({ day: d2, pct: done / _ops.length * 100 });
      }
      _sCurveData = points2;
    }
  }

  function drawSCurve() {
    var canvas = document.getElementById('tm-dash-scurve');
    if (!canvas || !_sCurveData || !_sCurveData.length) return;
    var c = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    c.clearRect(0, 0, w, h);
    var pts = _sCurveData;
    var isStacked = 'Material' in (pts[0] || {});
    var totalDays = Math.max(1, pts[pts.length - 1].day);

    if (isStacked) {
      // stacked area per cost element (bottom to top: Material / Labor / Burden / Overhead)
      for (var ei = 0; ei < _SF_ELEMS.length; ei++) {
        var eName = _SF_ELEMS[ei];
        c.beginPath();
        for (var i = 0; i < pts.length; i++) {
          var x = pts[i].day / totalDays * w;
          var stackPct = 0; for (var j = 0; j <= ei; j++) stackPct += (pts[i][_SF_ELEMS[j]] || 0);
          var y = h - (stackPct / 100 * h);
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        for (var i = pts.length - 1; i >= 0; i--) {
          var x = pts[i].day / totalDays * w;
          var basePct = 0; for (var j = 0; j < ei; j++) basePct += (pts[i][_SF_ELEMS[j]] || 0);
          var y = h - (basePct / 100 * h);
          c.lineTo(x, y);
        }
        c.closePath(); c.fillStyle = _SF_COLORS[eName]; c.fill();
      }
      // cursor dot at top of stack
      var curDay = Math.max(0, (_cursor - _projectStart) / 86400000);
      var ci2 = Math.min(pts.length - 1, Math.round(curDay / totalDays * (pts.length - 1)));
      var cp = pts[ci2];
      if (cp) {
        var topPct = _SF_ELEMS.reduce(function (s, e) { return s + (cp[e] || 0); }, 0);
        var dx = cp.day / totalDays * w, dy = h - (topPct / 100 * h);
        c.beginPath(); c.arc(dx, dy, 3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
        if ((drawSCurve._tick = (drawSCurve._tick || 0) + 1) % 20 === 0)
          console.log('§SCURVE_DRAW stacked=true cursor_day=' + Math.round(curDay) + ' accrued=' + Math.round(topPct) + '%');
      }
    } else {
      // fallback single line
      c.beginPath(); c.strokeStyle = '#4fc3f7'; c.lineWidth = 2;
      for (var i = 0; i < pts.length; i++) {
        var pt = pts[i], x = pt.day / totalDays * w, y = h - (pt.pct / 100 * h);
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke(); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = 'rgba(79,195,247,0.1)'; c.fill();
      var curDay2 = Math.max(0, (_cursor - _projectStart) / 86400000);
      var done2 = 0; for (var ci3 = 0; ci3 < _ops.length; ci3++) { if (_ops[ci3].end_ts <= _cursor) done2++; }
      var dx2 = curDay2 / totalDays * w, dy2 = h - (done2 / Math.max(_ops.length, 1) * h);
      c.beginPath(); c.arc(dx2, dy2, 4, 0, Math.PI * 2); c.fillStyle = '#ff8c00'; c.fill();
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // §S260c: JSON CACHE — persist Gantt schedule + Movie Script in IDB
  // Keys: "gantt:v{N}:{building}" and "movie:{building}"
  // Same IDB store as DB file cache. Tiny (100-500KB) vs DB files (10-170MB).
  // Clear Cache on landing deletes entire IDB → next session recomputes.
  //
  // §GANTT_CACHE_VERSION: bump this whenever schedule-GENERATION logic changes in a way that
  // would make an already-cached schedule wrong (rate/productivity tables, sequence rules,
  // schedule_gate.js gating logic). A cached 'gantt' entry survives indefinitely otherwise —
  // §GANTT_CACHE_HIT trusts it forever, so a logic fix alone does NOT reach a browser that
  // already generated+cached a schedule under the old (buggy) logic; only a version bump does,
  // since it changes the cache KEY and makes the old entry an orphaned miss. Do NOT rely on
  // manual cacheDel/tmRefoldSchedule for this class of fix — that requires the user to know to
  // do it. v2 (2026-07-18): locale_loader.js productivity-map deep-merge fix. v3 (2026-07-18):
  // schedule_gate.js §CREW-CAP fix (uncapped per-Z-band crews → capped project-wide pool) — see
  // prompts/HOSPITAL_4D_SUPERSTRUCTURE_DURATION_ANOMALY.md Item 2. v4 (2026-07-18): §STOREY-Z
  // no-storey-element reassignment (PR #869) — Item 6. Missed on first landing (user hit exactly
  // this "hard reset didn't fix it" symptom); this bump is that fix's second half.
  // v5 (2026-08-01): §4D_ROOF_LOAD_PATH (PR #1120) changed BOTH things this comment names — the
  // slab sequence rule (role now derived from the load path, not the storey name) and
  // schedule_gate.js's gating logic (walls became candidate supports for promoted roof slabs).
  // Missed on first landing for the SECOND time in this file's history, and the user hit the exact
  // symptom the v4 note above already describes in those words: "I still see the roof of the helipad
  // huts going first before the walls" AFTER a hard reset, because §GANTT_CACHE_HIT served a
  // gantt:v4 entry generated under the old ordering. A hard reset cannot clear it — the entry is in
  // IndexedDB, not the HTTP cache. This bump is that fix's second half.
  // §STOREY_DATUM_FRAME (2026-09-03) 38→39: a v38 schedule authored on Hospital_meta.db / the user's
  // Hospital_silent.db was banded by a storey ladder in the WRONG vertical frame (56 local-frame
  // elevation rows won over the 7 world-frame center_z rows by emptiness) — 1 band, 7 tasks, 509 d
  // instead of 8/42/318. schedule_author.js now picks the ladder whose span contains the element
  // base-Z median; a persisted v38 grid still carries the collapsed ladder, so regenerate.
  var _GANTT_CACHE_VERSION = 39;   // §STOREY_DATUM_FRAME (2026-09-03) — see above. Previous: 38 §TM_REVEAL_TILED (2026-09-02) — kernel_ops timestamps are now tiled inside each bar (CPM order, own-duration width) instead of the per-task affine; a v37 IDB entry still carries the affine layout (dead air 44-71% of every bar), regenerate
  // was 37:   // §S51 item d — ops now carry the cell stamp (_cell) so the Gantt groups by the schedule's own cells; pre-§S51 kernel_ops lack it, regenerate
  // was 28:   // §CPM_DISPLAY (2026-08-16): display timeline authored by the one-DAG CPM pass
  // was 27:   // §ZONE_DISPLAY_AUTHORING (2026-08-16): task windows authored from
                                   // the DISPLAY timeline + strict-bar sweep skipped on that path —
                                   // one schedule for movie and Gantt. Bump re-materializes stale
                                   // authored Gantts + regenerates kernel_ops under the new windows.
                                   // Prior: 26 §CROSSTASK_JUDGE_PARITY (2026-08-16): window-bounded judge-rule
                                   // repair after _ogSupportSweep — captured floating 3090 -> 656.
                                   // Prior: 25 §OG_HANG_UNBOUND (2026-08-15): _ogSupportSweep's hang repair
  // now searches unbounded above (was capped 9.5m) — a kernel_ops table materialized under v24 or
  // earlier keeps replaying elements left floating that this version now repairs.
  // §GANTT_GAP_CLAMP_SPREAD (2026-08-15): the per-task rescale's
  // gap-clamp+pad spread changes every element's display date — a kernel_ops table materialized
  // under v23 or earlier keeps replaying the old value-based-only positions forever without this
  // bump, regardless of the code fix being deployed.
  // §OG_HANG_BAND (2026-08-15): _ogSupportSweep's hang-repair search
  // radius widened 0.5m->9.5m (see that function's own header) — a kernel_ops table materialized
  // under v21 or earlier keeps replaying the narrower-band repair's (more-floating) dates forever
  // without this bump, regardless of the code fix being deployed.
  // v22->23: §OG_HANG_WINDOW_BOUND — the widened hang-repair now refuses a push that would land an
  // element outside its own task's authored window (see _ogSupportSweep's own header). A kernel_ops
  // table materialized under v22 keeps the wider-but-window-violating dates (up to 79d off on
  // LTU_AHouse) without this bump.
  // §GANTT_TASK_WINDOW_FIDELITY (2026-08-15): the captured overlay's
  // affine changed from ONE global rescale to a PER-TASK rescale — every element's placement moves,
  // on every building with a captured/materialized schedule. A kernel_ops table materialized under
  // v20 replays the old global-affine dates forever without this bump. Previous: §CAP_SHADOW_FIX
  // (2026-08-15): every kernel_ops materialized under
  // v19 or earlier was ALWAYS produced by the crash-fallback path (injectGantt's `_cap` overlay could
  // never run — see the fix note ~30 lines below, at the `_capacityCd` rename). Its data is not wrong
  // (the fallback used the already-correct generative timeline), but nobody has ever actually seen the
  // captured/native-IFC-schedule overlay run. Bump so every session regenerates once under the fixed
  // code and that path finally gets exercised for real, not silently skipped forever. Previous:
  // §TIER_REGATE_WORKLIST (2026-08-14): _tierAuditRegate rewritten full-array-rescan -> worklist/dirty-queue, A/B'd byte-identical on all 7 buildings (scripts/probe_tier_regate_worklist.js) but the ALGORITHM changed, so a building materialized under v18 must be regenerated to pick up the new code path even though its output is provably the same. Previous: §STAIR_FLIGHT_GRID_VISIBILITY (2026-08-14, 4D_SCHEDULE_PERFECTION.md SESSION 6): IfcStairFlight elements are now real geoGate/DAG support sources (schedule_gate.js structIdxGrid/grid) — previously invisible to anything resting on them (a mid-landing, a floor above), so the raw generative schedule this repair chain runs on changed for every building with stairs of this shape. HHS's Day-50 landing report closes near-exactly (FINAL display gap -40.85d -> -0.11d). A building materialized under v17 replays the old (stair-support-blind) order forever regardless of deployed code without this bump.
  // v16: §TIER2_PER_ELEMENT_CLAMP + §SHIFT_HOURS (2026-08-13): _twoTierRemap's Tier-2 push is now a per-element clamp to t1EndZ[z] instead of a uniform zone shift (MEP Final occupancy 22%->~69-105%, no more dead-air window inflation), and the real generation path now runs the crew's shift at rates.js SHIFT_HOURS (default 24, was hardcoded 8) — user ruling: "24hr is our default, import and JSON setting can import as we align to standard model". MEASURED Hospital totalDays 2019.6(v15, live) -> 369.2 (v16, all 7 buildings shrank 1.7x-5.5x, see prompts/4D_SCHEDULE_PERFECTION.md).
                                   // v14 was §CURTAIN_WALL_OPENING (2026-08-12): openingGate gained a curtain-wall fallback pool (IfcCurtainWall/IfcPlate/IfcMember) for openings with no IfcWall* host — HHS_Office_Federated had 34 of 133 openings ungated, Level 3's glass doors starting up to 9.5d before the façade they sit in. computeSchedule's gating changed ⇒ this constant MUST move with it, or a building already materialized under v13 replays the ungated order forever. NOTE this landed as v13 on its own branch and became v14 on merge: §ARCH_START_TEMPO/M1 (#1323) took v13 concurrently. Two independent gating changes on the same day = two bumps, never a shared one — the whole point of the constant is that a cache entry maps to exactly one algorithm.
                                   // v13 was §ARCH_START_TEMPO / M1 (2026-08-12): the 8-hour crew day. schedule_gate.js place() no longer spends installSecs as continuous 24-h wall clock — a crew gets 8 productive hours per calendar day (24/7 calendar unchanged) and the rest rolls over — so EVERY generated start/end moves and the programme is ~3x longer. A building materialized under v12 replays the old 24-h-shift timeline forever, no matter what code is deployed.
                                   // v12 was §HOSTED_BEFORE_HOST (2026-08-12, #1319): hostGate added to computeSchedule — a hosted element now waits for its host's finish. Missed on first landing (this constant's own v11 comment says "MUST bump on every change to computeSchedule's gating", and #1319 changed exactly that, same day, without bumping it) — a building materialized under v11 kept replaying the pre-fix order regardless of deployed code. This bump is that fix's second half.
                                   // v11 was §MIDAIR_REPAIR (2026-08-12): display times repaired so nothing appears before the first element it touches
                                   // v10 was §DOOR_WINDOW_HOST_WALL (2026-08-11): door/window gated on its host wall's finish (schedule_gate.js openingGate)
                                   // v9 was §TIER_SERIAL (2026-08-11): two-tier display remap (serial backbone + concurrent pool)
                                  // v7 was §4D_BAND_MONOTONIC (2026-08-02): PASS B cross-storey trade gate
  //                                 changes generated ordering for 35,484 non-structure elements.
  //                                 MUST bump: #1123 exists because a stale cache once stopped a
  //                                 sequencing fix reaching a browser, and the user has already been
  //                                 observed running new code against cached old ops.

  function _cacheKey(prefix) {
    var app = A();
    var bld = (app && app.activeBuilding) || 'unknown';
    var v = (prefix === 'gantt') ? ('v' + _GANTT_CACHE_VERSION + ':') : '';
    return prefix + ':' + v + bld;
  }

  // Read JSON from IDB cache. Returns parsed object or null.
  function cacheGet(prefix) {
    return new Promise(function(resolve) {
      var app = A();
      if (!app || !app.openCacheDB) { resolve(null); return; }
      app.openCacheDB().then(function(cacheDb) {
        if (!cacheDb) { resolve(null); return; }
        var key = _cacheKey(prefix);
        var tx = cacheDb.transaction(app.CACHE_STORE, 'readonly');
        var req = tx.objectStore(app.CACHE_STORE).get(key);
        req.onsuccess = function() {
          var val = req.result;
          if (val && typeof val === 'string') {
            try { resolve(JSON.parse(val)); } catch(e) { resolve(null); }
          } else { resolve(null); }
        };
        req.onerror = function() { resolve(null); };
      }).catch(function() { resolve(null); });
    });
  }

  // Write JSON to IDB cache.
  function cachePut(prefix, data) {
    var app = A();
    if (!app || !app.openCacheDB) return;
    app.openCacheDB().then(function(cacheDb) {
      if (!cacheDb) return;
      var key = _cacheKey(prefix);
      var json = JSON.stringify(data);
      var tx = cacheDb.transaction([app.CACHE_STORE, 'timestamps'], 'readwrite');
      tx.objectStore(app.CACHE_STORE).put(json, key);
      tx.objectStore('timestamps').put(Date.now(), key);
      console.log('§CACHE_PUT key=' + key + ' size=' + (json.length / 1024).toFixed(0) + 'KB');
    }).catch(function(e) { console.warn('§CACHE_PUT_ERR ' + e.message); });
  }

  // Delete a cached JSON key (e.g. the stale 'gantt' fast-path) so cacheGet() returns null and activate()
  // recomputes from the live tables. Used by tmRefoldSchedule after an external 4D edit.
  function cacheDel(prefix) {
    var app = A();
    if (!app || !app.openCacheDB) return;
    app.openCacheDB().then(function(cacheDb) {
      if (!cacheDb) return;
      var key = _cacheKey(prefix);
      var tx = cacheDb.transaction(app.CACHE_STORE, 'readwrite');
      tx.objectStore(app.CACHE_STORE).delete(key);
      console.log('§CACHE_DEL key=' + key);
    }).catch(function(e) { console.warn('§CACHE_DEL_ERR ' + e.message); });
  }

  // §TM-REFOLD core: drop the cached schedule so the NEXT activate() re-reads the (possibly just-edited)
  // tasks table via injectGantt's _cap, instead of replaying the stale kernel_ops ELEMENT_PLACE fast-path.
  // Returns the count of place-ops cleared. db is sql.js (app.db); the witness drives the same API.
  function _invalidateSchedule(db) {
    if (!db) return 0;
    var n = 0;
    try {
      var r = db.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'");
      n = (r.length && r[0].values.length) ? r[0].values[0][0] : 0;
      db.run("DELETE FROM kernel_ops WHERE op_type='ELEMENT_PLACE'");
    } catch (e) { /* no kernel_ops table → nothing to invalidate */ }
    return n;
  }

  // §KERNEL_OPS_SCHED_VERSION (2026-08-11): pure predicate, no db/window — placeOps materialized
  // under an OLDER schedule-generation algorithm (missing/mismatched _genVersion stamp) must never
  // be silently reused. currentVersion is _GANTT_CACHE_VERSION, passed in rather than closed over so
  // this stays independently testable (same idiom as _tier1Extents/_tier1Serialize below).
  function _kernelOpsSchedStale(placeOps, currentVersion) {
    return !!(placeOps && placeOps.length && placeOps[0].parameters &&
      placeOps[0].parameters._genVersion !== currentVersion);
  }

  // ── Activate / Deactivate ──
  function setToolbarHighlight(on) {
    var btn = document.getElementById('time-machine-btn');
    if (btn) btn.style.background = on ? '#1a6b8a' : '#444';
  }

  function viewerStatus(msg) {
    var app = A();
    if (app && app.status) app.status.textContent = msg;
  }

  var _s4ActT0 = 0;   // §S4_ACTIVATION_TIMING — shared with _finishActivate below (measure-first, additive only)
  // §CPE_BUILDUP_ACTIVATE_POPS_PANEL (2026-08-25, bim-compiler prompts/CINEMA_PATH_EDITOR.md):
  // silent=true loads the schedule DATA only, never touches the panel DOM — for tmActivateForBake,
  // per G-CPE-SOLE-OWNER ("only a real Play opens Time Machine"). Every other caller passes
  // nothing, so silent is falsy and behavior is byte-identical to before this flag existed.
  function activate(silent) {
    if (_active) return;
    _s4ActT0 = performance.now();
    _lastEdit = null;   // §GANTT_EDIT_UNDO — a stale snapshot from a prior building must never apply here
    _ganttAutoGenAttempted = false;   // §GANTT_EDIT_LOCK — allow one fresh auto-generate attempt
    _ganttSelected = {}; _marquee = null; _groupDrag = null;   // §GANTT_GROUP_MOVE — stale selection from a prior building must never apply here
    // §MERGED_GUID: TM mutates elements individually (setMatrixAt/setVisibleAt per slot), which a
    // merged buffer cannot do — so TM re-streams unmerged. Two corrections to the old trigger:
    //   (1) condition is _mergeActive (are merged meshes ACTUALLY in the scene), not _isMobile.
    //       Since 68bd9a7 killed the merge routing, `_isMobile` re-streamed the WHOLE building on
    //       every mobile TM open for nothing; and with merging now capability-gated rather than
    //       device-gated, a no-multi_draw DESKTOP has merged meshes too and needs the same unmerge.
    //   (2) _forceNoMerge makes the re-stream stick — flipping _isMobile no longer disables merging
    //       (the gate is A._hasMultiDraw), so without this flag the re-stream would just re-merge.
    // ONE-SHOT: if a re-stream somehow still produced merged meshes, activate normally rather than
    // re-streaming forever. Belt-and-braces against the loop described above — a spinning
    // clearStreamed/streamBuilding cycle is a far worse failure than TM opening with merged geometry.
    var app = A();
    if (app && app._mergeActive && !app._tmUnmergeTried) {
      app._tmUnmergeTried = true;
      app._forceNoMerge = true;
      var bld = app.activeBuilding;
      console.log('§TM_UNMERGE re-streaming ' + (bld || '?') + ' without merge (TM needs per-element slots)');
      // §TM_UNMERGE duration (2026-08-12, CPE_4D_PERF_MEM_FINDINGS.md §3c R4 part (c)): this
      // branch re-streams the WHOLE building on the first-Play click path — a cost that scales with
      // building size and, until this line, was invisible in every witness that pre-streams
      // unmerged. Unmeasured, it hides inside "first Play felt slow".
      var _umT0 = performance.now();
      app.clearStreamed();
      if (bld) { app.streamBuilding(bld); }
      // Wait for re-stream to finish, then activate
      var _reWait = setInterval(function() {
        if (app.buildingsRendered && app.buildingsRendered.size > 0 && !app.streaming) {
          clearInterval(_reWait);
          console.log('§TM_UNMERGE done bld=' + (bld || '?') + ' ms=' + (performance.now() - _umT0).toFixed(1));
          activate(silent);
        }
      }, 500);
      return;
    }
    var st = null;
    if (!silent) {
      setToolbarHighlight(true);
      _panel.style.display = 'flex';
      st = document.getElementById('tm-status');
      if (st) st.textContent = 'Loading timeline...';
    }

    // §S260c: Try IDB cache first, then kernel_ops table, then full recompute
    _activateAsync(st, silent).then(function(ok) {
      if (!ok && !silent) { setToolbarHighlight(false); _panel.style.display = 'none'; return; }
    });
    return; // async continuation below
  }

  function _activateAsync(st, silent) {
    return new Promise(function(resolve) {
    var app = A();

    // §S260c: Check IDB for cached Gantt JSON
    cacheGet('gantt').then(async function(cachedOps) {   // §GANTT_REFOLD_HANG: awaits chunked injectGantt
      // §S260e: Only use cache if it has ELEMENT_PLACE ops (not just picks)
      var _hasCachedPlaces = cachedOps && cachedOps.length > 0 &&
        cachedOps.some(function(o) { return o.op_type === 'ELEMENT_PLACE'; });
      // §GANTT_STALE_CACHE (2026-08-08, 4D_SCHEDULE_PERFECTION.md §GANTT_DOUBLE_LOAD warm-open
      // variant, live user log on Terminal): #1237 fixed the COLD path only. A warm open serves
      // cached ops here, but bar editability is a DB join (tasks/task_elements) and the DB is
      // re-fetched fresh every session with no schedule tables in it — so bars resolve editable=0,
      // drawGanttMini's auto-generate fires, and tmRefoldSchedule() throws the entire cached pass
      // away and re-runs the full chain: the exact double load, resurrected through the cache
      // branch, on EVERY warm open until schedule persistence lands. Same cure as #1237: when the
      // DB behind the cache has no schedule, the cache is stale by construction — drop it and take
      // the cold path's single pass (prematerialize → one injectGantt → recache).
      if (_hasCachedPlaces) {
        var _act = null;
        try {
          var _SAx = (typeof window !== 'undefined') && window.ScheduleAuthor;
          _act = (_SAx && _SAx.activeSchedule) ? _SAx.activeSchedule(app.db) : null;
        } catch (e) { _act = null; }
        if (!_act) {
          console.log('§GANTT_STALE_CACHE ops=' + cachedOps.length +
            ' but no schedule in DB — dropping cache, taking the single-pass cold path');
          cacheDel('gantt');
          _hasCachedPlaces = false;
        }
      }
      if (_hasCachedPlaces) {
        // Fast path: inject cached JSON into kernel_ops table
        console.log('§GANTT_CACHE_HIT ops=' + cachedOps.length);
        var db = app.db;
        db.run('CREATE TABLE IF NOT EXISTS kernel_ops (' +
          'id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL,' +
          'op_type TEXT NOT NULL, parameters TEXT NOT NULL,' +
          'input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0)');
        db.run("DELETE FROM kernel_ops WHERE op_type = 'ELEMENT_PLACE'");
        db.run('BEGIN');
        var stmt = db.prepare('INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES(?,?,?,?,?,0)');
        for (var i = 0; i < cachedOps.length; i++) {
          var op = cachedOps[i];
          stmt.run([op.start_ts, op.op_type, JSON.stringify(op.parameters), JSON.stringify(op.input_guids), op.output_guid]);
        }
        stmt.free();
        db.run('COMMIT');
        _ops = loadOps(); _ganttDirty = true;
        if (st) st.textContent = '';
        viewerStatus('Time Machine: ' + _ops.length + ' elements (cached)');
        _finishActivate(app, silent);
        resolve(true);
        return;
      }

      // No cache — try loading existing kernel_ops
      _ops = loadOps(); _ganttDirty = true;
      // §S260e: Only count ELEMENT_PLACE ops — ignore picks/other ops
      var _placeOps = _ops.filter(function(o) { return o.op_type === 'ELEMENT_PLACE'; });
      if (_placeOps.length && !_placeOps[0].parameters._end_ts) {
        try { app.db.run("DELETE FROM kernel_ops WHERE op_type = 'ELEMENT_PLACE'"); } catch(e) {}
        _placeOps = [];
        console.log('§TIME_MACHINE cleared stale unweighted ops — will re-inject');
      }
      // §KERNEL_OPS_SCHED_VERSION (2026-08-11): a building opened before this session's fix to the
      // schedule-generation algorithm (e.g. §TIER2_AFTER_TIER1) has kernel_ops ELEMENT_PLACE rows
      // materialized from the OLD algorithm, cached inside this building's IndexedDB-cached DB blob.
      // _GANTT_CACHE_VERSION already gates the separate 'gantt' JSON cache but never this table, so a
      // fixed schedule algorithm silently never reached an already-opened building — reported live:
      // HHS_Office_Federated still showing MEP Rough-in starting 20.8d before Architecture finished,
      // §TIER_SERIAL's own witness (which reads the freshly-recomputed _disp, not kernel_ops) could
      // not have caught it. Stamp+check closes the same gap _end_ts's check closes for schema shape.
      if (_kernelOpsSchedStale(_placeOps, _GANTT_CACHE_VERSION)) {
        try { app.db.run("DELETE FROM kernel_ops WHERE op_type = 'ELEMENT_PLACE'"); } catch(e) {}
        console.log('§KERNEL_OPS_SCHED_VERSION stale genVersion=' + _placeOps[0].parameters._genVersion +
          ' current=' + _GANTT_CACHE_VERSION + ' — cleared ' + _placeOps.length + ' ops, will re-inject');
        _placeOps = [];
      }
      if (_placeOps.length) { _ops = _placeOps; _ganttDirty = true; }
      console.log('§TM_OPS_CHECK total=' + _ops.length + ' place=' + _placeOps.length);

      if (!_placeOps.length) {
        if (st) st.textContent = 'Setting up 4D construction timeline...';
        viewerStatus('Time Machine: generating construction schedule...');
        // §GANTT_SINGLE_LOAD (4D_SCHEDULE_PERFECTION.md §GANTT_DOUBLE_LOAD): a cold open used to run
        // injectGantt TWICE — pass 1 with no schedule (placeholder dates, task_id-less ops), then
        // drawGanttMini's §GANTT_EDIT_LOCK auto-materialize called tmRefoldSchedule(), which threw
        // pass 1 away (deactivate + cacheDel + re-activate) and ran the ENTIRE chain again. Now the
        // native schedule is materialized FIRST, so the single injectGantt run absorbs it, bars carry
        // real task_ids, and the auto-generate branch never fires. refoldSchedule() itself is
        // untouched — its external-edit caller (4D_SCHED_EDIT in main.js) still needs the round-trip.
        console.log('§S4_ACTIVATION_TIMING_MID beforeMaterializeNative=' + (performance.now() - _s4ActT0).toFixed(0));
        await _load4DTemplate();   // §TPL_WIRED — before the first materialize, not after
        _materializeNativeSchedule(app);
        console.log('§S4_ACTIVATION_TIMING_MID afterMaterializeNative=' + (performance.now() - _s4ActT0).toFixed(0));
        if (!(await injectGantt())) {
          if (st) st.textContent = 'No elements found in database';
          viewerStatus('Time Machine: no elements found');
          console.log('§TIME_MACHINE no ops and no elements — nothing to show');
          resolve(false);
          return;
        }
        console.log('§S4_ACTIVATION_TIMING_MID afterInjectGantt=' + (performance.now() - _s4ActT0).toFixed(0));
        _ops = loadOps(); _ganttDirty = true;
        console.log('§S4_ACTIVATION_TIMING_MID afterLoadOps=' + (performance.now() - _s4ActT0).toFixed(0) + ' n=' + _ops.length);
        if (!_ops.length) { resolve(false); return; }
        // §S260c: Cache the newly computed schedule to IDB
        cachePut('gantt', _ops);
        console.log('§S4_ACTIVATION_TIMING_MID afterCachePut=' + (performance.now() - _s4ActT0).toFixed(0));
        console.log('§GANTT_CACHE_SAVE ops=' + _ops.length);
        viewerStatus('Time Machine: ' + _ops.length + ' elements scheduled');
      }

      _finishActivate(app, silent);
      resolve(true);
    }).catch(async function(e) {   // §GANTT_REFOLD_HANG: awaits chunked injectGantt in the fallback
      // §GANTT_CACHE_ERR_STACK (2026-08-12) — this handler wraps the WHOLE async activate body
      // (cache read, _materializeNativeSchedule, injectGantt, loadOps, cachePut), so a message
      // alone cannot say which. Live user report: "Cannot read properties of undefined (reading
      // '3iM76qwej9Tf9ttHcbQp2z')" — a GUID used as a key on an undefined object, recovered by the
      // fallback below (TM still opened with 63,416 ops) but with no way to locate it. Log the
      // stack and the phase so the next occurrence names its own line.
      console.warn('§GANTT_CACHE_ERR ' + e.message + ' | phase=' + (_ops && _ops.length ? 'post-loadOps' : 'pre-loadOps') +
        ' | stack=' + String(e && e.stack || '(none)').split('\n').slice(0, 4).join(' << '));
      // Fallback: compute without cache
      _ops = loadOps(); _ganttDirty = true;
      if (!_ops.length) { await _load4DTemplate(); _materializeNativeSchedule(A()); await injectGantt(); _ops = loadOps(); _ganttDirty = true; }  // §GANTT_SINGLE_LOAD, same as the main path (await: loadOps must see the chunked writes)
      if (_ops.length) { _finishActivate(app, silent); resolve(true); }
      else resolve(false);
    });
    });
  }

  function _finishActivate(app, silent) {
    // §DLOD_TM_OWNERSHIP (2026-09-04, PHOTOREAL_STILL_RENDER.md §BME.8): dlod.js must hand every
    // instance matrix back (its own hides restored while its refs are still real) BEFORE this
    // module's lazy _savedInstanceMatrices reads them, and stay down until deactivate(). One owner.
    _dlodPausedByTm = false;
    if (app && typeof app.dlodDisable === 'function' && app._dlodEnabled) { app.dlodDisable('time-machine'); _dlodPausedByTm = true; }
    _active = true;
    app._tmOn = true;  // exposed for pill isActive highlight (panels.js 'tm' entry)
    // §TM_GI_AUTO RETIRED (2026-07-18, user: "its up to user to turn Shadow, G and audio"):
    // was auto-engaging Alt+G N8AO on every TM open with no opt-out — the one auto-forced effect
    // among Shadow/GI/Audio (the other two were already correctly user-choice-only, see
    // §TM_SUN_INHERIT/§TM_SHADOW_INHERIT below — "Don't force sun cycle — respect user's
    // shadow/sky choice"). Alt+G is now consistent with that: purely a manual keypress, same as
    // before #836 ever existed. _tmEnabledGI/the matching deactivate() auto-off stay defined
    // (now permanently false/no-op) rather than ripped out — a manual Alt+G press during TM still
    // needs deactivate() to leave it alone exactly like it already does for shadow/sky.
    _tmEnabledGI = false;
    _activeBuildingCount = app.activeBuildingTotal || 0;
    _isLargeBuilding = _activeBuildingCount > LARGE_BUILDING;
    if (_isLargeBuilding) console.log('§S259_TM_LITE elements=' + app.activeBuildingTotal + ' — sparks disabled (>50K)');
    // TM_DLOD_SCALE.md §3: engage gate is size-based — pill only offers itself on large buildings.
    // A building switch below threshold also resets the toggle (never silently carries proxy state
    // into a small building where DLOD_TM_MIN_ELEMENTS wouldn't gate it anyway).
    if (!_isLargeBuilding) _dlodProxyOn = false;
    var _lodBtnGate = document.getElementById('tm-lod');
    if (_lodBtnGate) {
      _lodBtnGate.style.display = _isLargeBuilding ? '' : 'none';
      _lodBtnGate.classList.toggle('tm-active', _dlodProxyOn);
    }
    console.log('§DLOD_TM_GATE bld="' + (app.activeBuilding || '?') + '" elements=' + _activeBuildingCount +
      ' threshold=' + DLOD_TM_MIN_ELEMENTS + ' large=' + _isLargeBuilding);
    // §S280: Don't force sun cycle — respect user's shadow/sky choice
    // User can toggle shadow (H) independently. TM just plays construction.
    console.log('§TM_SUN_INHERIT shadowOn=' + !!app._shadowOn + ' sky=' + !!app._sky + ' sunCycle=user-choice');
    console.log('§TM_SHADOW_INHERIT shadowOn=' + !!app._shadowOn + ' groundVisible=' + (app.ground ? app.ground.visible : 'n/a'));
    // §Z_STACK_XRAY_STAGING — (re)build the support-edge cache on EVERY activation, not only a
    // fresh generate: runs on the §GANTT_CACHE_HIT fast path too (injectGantt never executes
    // there), so this is the ONE place, keyed off the _ops that actually ended up loaded regardless
    // of source (generated fallback or captured IFC 4D — schedMap is read from _ops, not from
    // injectGantt's own locals). Read-only: one SELECT + one pass over _ops, no db writes.
    // §S4_ACTIVATION_TIMING (measure-first, additive only) — the ~10s tail AFTER injectGantt()
    // returns (loadOps/cachePut/_finishActivate) was completely unmeasured before this; bracket it.
    var _s4fa = [];
    function _s4faMark(l) { _s4fa.push(l + '=' + (performance.now() - _s4ActT0).toFixed(0)); }
    _s4faMark('finishActivateStart');
    _tmRebuildXrayCache();
    _s4faMark('xrayCache');
    computeDays();
    _s4faMark('computeDays');
    saveVisibility();
    // §S262: DLOD runs independently — camera distance drives promote/demote, TM drives visibility. No pause needed.
    console.log('§MOBILE_TM_TOGGLE method=setVisibleAt|setMatrixAt mobile=' + !!app._isMobile + ' dlod=' + !!app._useDlodPath);
    _anchorDay = _days.length ? _days[_days.length - 1] : null;
    _anchorHr = 15;
    // §CPE_BUILDUP_ACTIVATE_POPS_PANEL: everything below this line is panel DOM/canvas work — the
    // bake path (silent=true) needs only _ops/_projectStart/_projectEnd, already populated above by
    // computeDays(). Skipping it here means Alt+C's bake never shows, draws into, or fetches for a
    // TM panel the user never asked to see; cinema_maxq drives the real per-frame render itself via
    // tmSetCursor()→renderAtTime(), so the initial renderAtTime(_projectEnd) below would be thrown
    // away by that first frame anyway.
    if (silent) {
      _s4faMark('silentSkipPanel');
      console.log('§TIME_MACHINE ON (silent, bake-owned) — ' + _ops.length + ' ops, ' + _days.length +
        ' days, project: ' + new Date(_projectStart).toLocaleDateString() + ' → ' + new Date(_projectEnd).toLocaleDateString());
      return;
    }
    _panel.style.display = 'flex';
    switchMode('DAY');
    renderAtTime(_projectEnd); // §S260c: initial render so Gantt + status populate immediately
    _s4faMark('renderAtTime');
    updateStatus();
    if (_ganttVisible) drawGanttMini();
    _s4faMark('ganttMini');
    if (_dashVisible) drawDashboard();
    _s4faMark('dashboard');
    console.log('§S4_ACTIVATION_TIMING_FINISH ' + _s4fa.join(' ') + ' totalSinceActivate=' + (performance.now() - _s4ActT0).toFixed(0));
    // §S2 — the ⚖ variance drawer only offers itself when this building HAS a folded twin (a C_Project with the
    // PlannedAmt↔CommittedAmt pair). No twin → no button, no drawer (user: "don't trigger it when no such info").
    _loadTwin().then(function (t) {
      var vb = document.getElementById('tm-var');
      if (vb) vb.style.display = t ? '' : 'none';
      console.log('§TM_VAR_GATE building="' + ((app && app.activeBuilding) || '?') + '" twin=' + (t ? 'yes' : 'no') + ' ⚖=' + (t ? 'shown' : 'hidden'));
    });
    console.log('§TIME_MACHINE ON — ' + _ops.length + ' ops, ' + _days.length + ' days, ' +
      'project: ' + new Date(_projectStart).toLocaleDateString() + ' → ' + new Date(_projectEnd).toLocaleDateString());
  }

  function deactivate() {
    if (!_active) return;
    stopPlayback();
    clearSparks();
    _gspClear();   // §GROUP_SPARK: nothing may survive TM being switched off
    // §TM_OVERLAY_SYNC (see renderAtTime): null = "TM is off". Same contract as _gspClear above —
    // nothing TM imposed on a presentation overlay may survive TM being switched off, otherwise a
    // name plate stays hidden in the finished building because the scrub happened to end early.
    if (window.__tmOverlaySync) { try { window.__tmOverlaySync(null); } catch (e) {} }
    _evMesh = null; _evSig = ''; _incrPrimed = false;   // §PERF_INCR: drop the event index
    _tmXraySolidifyTs = {}; _tmXrayStagedTotal = 0; _tmXraySolidifiedN = 0;  // §Z_STACK_XRAY_STAGING: nothing may survive TM being switched off
    _dlodDisposeBoxes(); _dlodProxyOn = false; _lastProxyEngaged = null; _dlodLastCamSig = null; // §DLOD_TM: nothing may survive TM being switched off
    var _lodBtnOff = document.getElementById('tm-lod'); if (_lodBtnOff) _lodBtnOff.classList.remove('tm-active');
    restoreSky();
    _sunCycle = false;
    _camFollow = false;
    _camAngle = 0;
    _camTarget = null;
    _cineStoryboard = [];
    if (_bgBuildRaf) { cancelAnimationFrame(_bgBuildRaf); _bgBuildRaf = 0; }
    _cineSceneIdx = 0;
    _cineHeroSlowdown = false;
    _cineEstabStart = null; _cineEstabEnd = null;
    restorePeeled();
    // §S260b: Only hide ground if Sunglass shadow was OFF
    var app = A();
    if (app && app.ground && !app._shadowOn) app.ground.visible = false;
    _ganttVisible = false;
    _dashVisible = false;
    _sCurveData = null;
    _shopfloor = null; _shopfloorLoading = false;    // §E2b: invalidate shopfloor cache on building change
    _ganttTasks = [];
    _ganttTasksComputed = false; _ganttRebuildN = 0;   // §S58: ordinal is per building
    _ganttCritical = {}; _cpmPrimed = false;          // §S68: CPM marks are per building too
    _tmCpmLegend(null);                               // §S75: and so is the legend that explains them
    invalidateGanttModel();   // K0: building changed → drop the cached task index + bar rollup
    var ganttBtn = document.getElementById('tm-gantt');
    if (ganttBtn) ganttBtn.classList.remove('tm-active');
    var ganttBox = document.getElementById('tm-gantt-box');
    if (ganttBox) ganttBox.classList.remove('open');
    // §TM-VARIANCE: reset the drawer state on deactivate (the twin cache is kept — it's read-only).
    _varVisible = false; _opsPlanned = null;
    var pin = document.getElementById('tm-pinpoint'); if (pin) pin.style.display = 'none';   // §S3 — clear the pinpoint callout
    var varBtn = document.getElementById('tm-var'); if (varBtn) varBtn.classList.remove('tm-active');
    var varBox = document.getElementById('tm-var-box'); if (varBox) varBox.classList.remove('open');
    toggleDashDOM(false);
    _giCancelConverge();   // §TM_GI_HOLD: stop any in-flight hold-polish RAF/timer before restoring state
    // §TM_GI_RENDER restore: renderAtTime forced N8AO single-pass (accumulate off) for TM's
    // one-frame-then-park render gate. Hand it back to converged-still mode so a plain Alt+G outside
    // Time Machine regains its multi-frame accumulation quality. Reset the once-per-session log latch too.
    if (app && app._giN8aoPass && app._giN8aoPass.configuration) app._giN8aoPass.configuration.accumulate = true;
    renderAtTime._giLogged = false;
    // §TM_GI_AUTO off: only switch Alt+G off if TM itself turned it on — a user who engaged Alt+G
    // manually before/independently of TM keeps it on. Order matters: restore accumulate=true FIRST
    // (above) so the composer is already back in converged mode if it stays on for the manual case.
    if (_tmEnabledGI && app && app._giComposerActive && typeof app.toggleGIPreview === 'function') {
      try { app.toggleGIPreview(false); console.log('§TM_GI_AUTO off (TM-owned)'); } catch (e) {}
    }
    _tmEnabledGI = false;
    _active = false;
    if (app) app._tmOn = false;  // exposed for pill isActive highlight (panels.js 'tm' entry)
    _panel.style.display = 'none';
    setToolbarHighlight(false);
    restoreVisibility(true);  // §TM_CLOSE_RESTORE: force — nothing (incl. xray-staged ghosts) may survive TM going off
    // §DLOD_TM_OWNERSHIP: matrices are real again — dlod.js may take them back (refs rebuilt lazily).
    if (_dlodPausedByTm && app && typeof app.dlodEnable === 'function' && !app._dlodEnabled) { try { app.dlodEnable(); } catch (eD) {} }
    _dlodPausedByTm = false;
    // (§S262's "DLOD runs independently" is retired by §DLOD_TM_OWNERSHIP above — it did not run independently: it fought this module for the same matrices.)
    viewerStatus('');
    console.log('§TIME_MACHINE OFF — restored');
  }

  function toggle() {
    if (_active) deactivate(); else activate();
  }

  // ── Auto-exit on new op ──
  var _origCommit = null;
  function hookCommitOp() {
    if (window.APP && window.APP.kernelOps && window.APP.kernelOps.commitOp) {
      _origCommit = window.APP.kernelOps.commitOp;
      window.APP.kernelOps.commitOp = function() {
        if (_active) deactivate();
        return _origCommit.apply(this, arguments);
      };
    }
  }

  // ── Init ──
  function init() {
    buildPanel();
    // §S3 — listen for a sibling surface's scrub on the shared Connect bus (the modeller already speaks it).
    try { if (window.Connect && window.Connect.subscribe) window.Connect.subscribe('timeline', _applyRemoteTimeline); } catch (e) {}

    // S265: TM button is now in icon pill — no longer injected into overflow
    // var toolbar = document.querySelector('#search-body > div');

    setTimeout(hookCommitOp, 2000);

    // URL param: ?tm=1 (open time machine) · ?tm=play (open + auto-play forward) ·
    //   ?pporder=<id> (PP_ORDER_ZOOM_TM_SPEC §B — deep-link to a manufacturing order's moment; implies tm=1).
    var _sp = new URLSearchParams(location.search);
    var tmParam = _sp.get('tm');
    var ppParam = _sp.get('pporder');
    if (tmParam || ppParam) {
      // Wait for DB to load before activating
      var _tmWait = setInterval(function() {
        var app = A();
        if (app && app.db && app.scene && app.buildingsRendered && app.buildingsRendered.size > 0 && !app.streaming) {
          clearInterval(_tmWait);
          activate();
          if (ppParam) {
            try { window.tmJumpToOrder(ppParam); }                  // straight to the order's construction moment
            catch (e) { console.log('§TM_ORDER_JUMP deeplink-err ' + e); }
          } else if (tmParam === 'play') {
            // Jump to start then play forward
            renderAtTime(_projectStart);
            startPlayback(+1);
          }
        }
      }, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.toggleTimeMachine = toggle;

  // §TM-REFOLD (W-TM-REFOLD): rebuild the 4D from the LIVE tasks table after an external schedule edit
  // (the bim_4d 4D_SCHED_EDIT consumer in main.js). Replaces the old toggle-off → setTimeout(toggle-on, 60ms)
  // dance, which (a) raced the async activate() on a fixed timer and (b) silently REPLAYED the stale cached
  // schedule (cacheGet('gantt') fast-path + reused kernel_ops) so the edit never showed. This invalidates the
  // stale gantt cache + kernel_ops places first, then re-activates off the synchronous deactivate() — no timer.
  // No-op (returns false) if the Time Machine is closed. _expose for the witness too.
  function refoldSchedule() {
    var wasActive = _active;
    if (_active) deactivate();
    cacheDel('gantt');
    var app = A();
    var cleared = (app && app.db) ? _invalidateSchedule(app.db) : 0;
    console.log('§TM_REFOLD wasActive=' + wasActive + ' clearedPlaceOps=' + cleared);
    if (wasActive) activate();   // async; injectGantt re-reads the edited tasks. No fixed-timer race.
    return wasActive;
  }
  window.tmRefoldSchedule = refoldSchedule;
  // §GANTT_RETIME_RESYNC witness hook (double-underscore debug convention, read-only intent):
  // lets witness_gantt_retime_resync.js drive the REAL ruler-shift commit path headlessly.
  window.__tmGanttShift = shiftGanttSchedule;

  // §S2 (TM_4D5D_VARIANCE_LANE) — juncture jump: land the cursor at the START of a named phase's window so the
  // scene is rendered PARTIALLY-BUILT at that moment (the IFC cost panel's "View at this moment"). The phase
  // window comes from TM's own _ops (same axis the cursor scrubs). Opens the ⚖ drawer so the cost story shows.
  // Activates TM first if needed (async). Returns a Promise<bool> (true = landed in the phase window).
  window.tmJumpToPhase = function (phaseName) {
    phaseName = String(phaseName || '');
    function doJump() {
      if (!_ops.length) { console.log('§TM_JUNCTURE skip=no-ops phase="' + phaseName + '"'); return false; }
      var s = Infinity, e = -Infinity;
      for (var i = 0; i < _ops.length; i++) {
        var ph = (_ops[i].parameters || {}).phase || 'Architecture';
        if (ph === phaseName) { if (_ops[i].start_ts < s) s = _ops[i].start_ts; if (_ops[i].end_ts > e) e = _ops[i].end_ts; }
      }
      if (!isFinite(s)) { console.log('§TM_JUNCTURE miss phase="' + phaseName + '" (no ops in that phase)'); return false; }
      renderAtTime(s);
      try { anchorFromCursor(); } catch (x) {}
      try { configSlider(); } catch (x) {}
      // surface the cost story: open the ⚖ variance drawer (reads the twin) if it isn't already open — ONLY when
      // this building actually has a twin (no twin → no drawer; the ⚖ button is hidden anyway).
      if (_twin && !_varVisible) {
        _varVisible = true;
        var vbtn = document.getElementById('tm-var'); if (vbtn) vbtn.classList.add('tm-active');
        var vbox = document.getElementById('tm-var-box'); if (vbox) vbox.classList.add('open');
        drawVariance();
      }
      var pct = Math.round((_cursor - _projectStart) / Math.max(1, _projectEnd - _projectStart) * 100);
      console.log('§TM_JUNCTURE phase="' + phaseName + '" cursor=' + Math.round(_cursor) +
        ' winStart=' + new Date(s).toISOString().slice(0, 10) + ' built~' + pct + '% (partially built)');
      return true;
    }
    if (_active) return Promise.resolve(doJump());
    var p = activate();
    return (p && p.then) ? p.then(function () { return doJump(); }) : Promise.resolve(doJump());
  };

  // §360-IDENTITY — freeze the cursor on the EXACT element the user is looking at (not just its phase).
  // The identity thread: ERP line / Find pick → guid → the op that builds it → its end_ts = the moment it
  // lands. renderAtTime broadcasts (line 1215) so the ERP tab reacts in lockstep. The point of 360 optics is
  // the STOPPED frame on the right item, with 4D (scene) + 5D (⚖ drawer) coupled — not the animation.
  window.tmJumpToElement = function (guid) {
    guid = String(guid || '');
    function doJump() {
      if (!_ops.length) { console.log('§TM_PINPOINT_JUMP skip=no-ops guid="' + guid + '"'); return false; }
      var op = null;
      for (var i = 0; i < _ops.length; i++) {
        var og = _ops[i].output_guid || (_ops[i].input_guids && _ops[i].input_guids.length ? _ops[i].input_guids[0] : null);
        if (og === guid) { op = _ops[i]; break; }
      }
      if (!op) { console.log('§TM_PINPOINT_JUMP miss guid="' + guid + '" (no op builds it)'); return false; }
      renderAtTime(op.end_ts);                   // the instant it lands → present in the scene, the lead frontier
      try { anchorFromCursor(); } catch (x) {}
      try { configSlider(); } catch (x) {}
      if (_twin && !_varVisible) {                // couple the 5D cost story to the frozen frame (same as phase jump)
        _varVisible = true;
        var vb = document.getElementById('tm-var'); if (vb) vb.classList.add('tm-active');
        var vx = document.getElementById('tm-var-box'); if (vx) vx.classList.add('open');
        drawVariance();
      }
      var ph = (op.parameters || {}).phase || '';
      var pct = Math.round((_cursor - _projectStart) / Math.max(1, _projectEnd - _projectStart) * 100);
      console.log('§TM_PINPOINT_JUMP guid="' + guid + '" phase="' + ph + '" cursor=' + Math.round(_cursor) +
        ' at=' + new Date(op.end_ts).toISOString().slice(0, 10) + ' built~' + pct + '% (frozen on the item)');
      return true;
    }
    if (_active) return Promise.resolve(doJump());
    var p = activate();
    return (p && p.then) ? p.then(function () { return doJump(); }) : Promise.resolve(doJump());
  };

  // PP_ORDER_ZOOM_TM_SPEC §B — land the TM at a manufacturing/project order's construction moment. The order
  // reaches us by IDENTITY (?pporder= / ERP Zoom-Across, never a bespoke link): PP_Order → its phase (the
  // Description token "<Phase> — <CREW>", the shared key with the gantt phase windows) → the cursor. The shopfloor
  // S-curve (dashboard) + the ⚖ variance drawer couple to the frozen frame. Honest mode: 'phase' when that phase
  // has ops on the loaded scene's axis; else 'projected' — the order's finish date mapped onto
  // [_projectStart,_projectEnd] by its position in the shopfloor span (labelled, never blurred). Returns
  // Promise<bool>. Whitebox §-log = the proof (the Hospital scene's geom lives in OPFS → live VISUAL deferred).
  window.tmJumpToOrder = function (ppOrderId) {
    ppOrderId = Number(ppOrderId);
    var app = A();
    var SQL = (app && app._SQL) || window.SQL || window._SQL_CACHED;
    function fetchOrder() {
      if (!SQL) { console.log('§TM_ORDER_JUMP skip=no-SQL order=' + ppOrderId); return Promise.resolve(null); }
      return APP.cachedFetch('../erp/ad_seed.db').then(function (buf) {
        var db = new SQL.Database(new Uint8Array(buf));
        var r = db.exec('SELECT Description, DateStartSchedule, DateFinishSchedule, C_Project_ID FROM PP_Order WHERE PP_Order_ID=' + ppOrderId);
        if (!r.length || !r[0].values.length) { db.close(); return null; }
        var row = r[0].values[0], pid = row[3];
        var c = db.exec('SELECT COALESCE(SUM(CumulatedAmt),0) FROM PP_Order_Cost WHERE PP_Order_ID=' + ppOrderId);
        // shopfloor finish-date span (the same orders the S-curve folds) → the projected-mode axis
        var sp = db.exec('SELECT MIN(o.DateFinishSchedule), MAX(o.DateFinishSchedule) FROM PP_Order o' +
          ' JOIN PP_Order_Cost oc ON o.PP_Order_ID=oc.PP_Order_ID WHERE o.C_Project_ID=' + Number(pid));
        db.close();
        return { desc: row[0], start: Date.parse(row[1]), end: Date.parse(row[2]),
                 cost: (c.length && c[0].values.length) ? Number(c[0].values[0][0]) : 0,
                 spanMin: (sp.length && sp[0].values.length) ? Date.parse(sp[0].values[0][0]) : NaN,
                 spanMax: (sp.length && sp[0].values.length) ? Date.parse(sp[0].values[0][1]) : NaN };
      }).catch(function (e) { console.log('§TM_ORDER_JUMP fetch-err ' + e.message); return null; });
    }
    function doJump(info) {
      if (!info) { console.log('§TM_ORDER_JUMP miss order=' + ppOrderId + ' (no PP_Order row)'); return false; }
      if (!_ops.length) { console.log('§TM_ORDER_JUMP skip=no-ops order=' + ppOrderId); return false; }
      var phase = String(info.desc || '').split(' — ')[0].trim();   // — = em-dash, the generator's token sep
      var s = Infinity, e = -Infinity;                                    // mode=phase: this phase's window on the axis
      for (var i = 0; i < _ops.length; i++) {
        var ph = (_ops[i].parameters || {}).phase || 'Architecture';
        if (ph === phase) { if (_ops[i].start_ts < s) s = _ops[i].start_ts; if (_ops[i].end_ts > e) e = _ops[i].end_ts; }
      }
      var mode, _jumpTarget;
      if (isFinite(s)) { _jumpTarget = s; mode = 'phase'; }
      else {                                                             // mode=projected: order finish → axis position
        var frac = 0.5;
        if (isFinite(info.spanMin) && isFinite(info.spanMax) && info.spanMax > info.spanMin && isFinite(info.end))
          frac = Math.max(0, Math.min(1, (info.end - info.spanMin) / (info.spanMax - info.spanMin)));
        _jumpTarget = _projectStart + frac * (_projectEnd - _projectStart);
        mode = 'projected';
      }
      renderAtTime(_jumpTarget);
      try { anchorFromCursor(); } catch (x) {}
      try { configSlider(); } catch (x) {}
      if (_twin && !_varVisible) {                                       // couple the 5D cost story (⚖ drawer)
        _varVisible = true;
        var vb = document.getElementById('tm-var'); if (vb) vb.classList.add('tm-active');
        var vx = document.getElementById('tm-var-box'); if (vx) vx.classList.add('open');
        drawVariance();
      }
      if (!_dashVisible) { _dashVisible = true; try { toggleDashDOM(true); } catch (x) {} }
      try { drawDashboard(); } catch (x) {}                             // drawDashboard lazy-loads the shopfloor S-curve
      var pct = Math.round((_cursor - _projectStart) / Math.max(1, _projectEnd - _projectStart) * 100);
      console.log('§TM_ORDER_JUMP order=' + ppOrderId + ' phase="' + phase + '" mode=' + mode +
        ' cursor=' + Math.round(_cursor) + ' at=' + (isFinite(_cursor) ? new Date(_cursor).toISOString().slice(0, 10) : '—') +
        ' cost=' + Math.round(info.cost) + ' built~' + pct + '%');
      return true;
    }
    function whenReady() {                                              // activate() is async → wait for the op-log
      return new Promise(function (resolve) {
        if (_active && _ops.length) { resolve(); return; }
        if (!_active) activate();
        var n = 0, iv = setInterval(function () { if (_ops.length || ++n > 60) { clearInterval(iv); resolve(); } }, 500);
      });
    }
    return whenReady().then(fetchOrder).then(doJump);
  };

  // S265 Phase 3: Expose TM state for share URL
  window.tmGetState = function() {
    return { active: _active, cursor: _cursor, projectStart: _projectStart, projectEnd: _projectEnd };
  };

  // §TM_OPS_SNAPSHOT (2026-08-30) — read-only, additive. §CPE_RESOURCE_PANEL needs, per calendar
  // day, which trades are working; _ops already carries exactly that (start_ts/_end_ts/resource,
  // written at :4918) and is module-private. Returns a compact copy so no caller can mutate the
  // real timeline. Nothing here derives, re-orders or re-dates anything — that is this file's job
  // and it has one already.
  window.tmOpsSnapshot = function() {
    var out = new Array(_ops.length);
    for (var i = 0; i < _ops.length; i++) {
      // The trade lives in `parameters`, not on the row: loadOps (:102) builds each op as
      // {id,start_ts,op_type,end_ts,parameters,input_guids,output_guid}, and injectGantt writes
      // `resource` INTO that params JSON (:4918). Reading o.resource returned undefined on every
      // op — MEASURED: §CPE_RESOURCE_PANEL withResource=0 of 16,114 on Clinic. `_end_ts` was the
      // same mistake: it is params._end_ts, already resolved into end_ts here.
      var pm = _ops[i].parameters;
      out[i] = { s: _ops[i].start_ts, e: _ops[i].end_ts,
                 r: (pm && pm.resource) || null };
    }
    return out;
  };

  // ══ §MAXQ_TIME / §CPE_BUILDUP — drive the construction state from an external baker ═══════════
  // Spec: bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §MAXQ_TIME (mode D) + prompts/
  // CINEMA_PATH_EDITOR.md §CPE_BUILDUP. User 2026-07-28: "this construction bit is a checkbox to
  // animate its buildup as cam goes along... its giving the impression and not chronologically
  // accurate. But the elements laying on each other according to its part in the 4D is educational."
  //
  // ⚠ WORDING, and it is forced by the data, not a hedge: `Terminal_Hi.db` has NO tasks/task_elements
  // tables and `Hospital_extracted.db` has them EMPTY (tasks=0). What TM synthesises is a DERIVED
  // BUILD ORDER (Z-band + SEQUENCE_RULES), never a construction programme. Say "derived build order"
  // — a BIM audience told "the schedule" will ask for the P6/MSP link, and there isn't one.
  //
  // renderAtTime() is internal by design; this is the ONE public cursor setter it needs. Note the
  // §0a lesson from prompts/TM_INCREMENTAL_RENDER_PERF.md: pass the target cursor as a LOCAL value,
  // never mutate the global `_cursor` first — doing that collapses the delta window to zero width and
  // the incremental path silently skips the whole scene.
  window.tmSetCursor = function(ms) {
    if (!isFinite(ms)) return false;
    renderAtTime(Math.max(_projectStart, Math.min(_projectEnd, ms)));
    return true;
  };

  // A bake needs Time Machine's op-log without the user having pressed the button. Same wait shape
  // as tmJumpToOrder's own whenReady() — activate() is async (it may have to inject the derived
  // timeline first), so poll for the ops rather than assuming they are there on the next line.
  //
  // §CPE_BUILDUP_ARM_GATE (2026-08-12, bim-compiler prompts/CINEMA_PATH_EDITOR.md — Witness:
  // W-ARM-GATE / witness_cpe_buildup_arm_gate.js). This used to poll `_ops.length` alone, which is
  // truthy for ONE stale op. Measured on the user's own Hospital run: at arm time `_ops` held
  // exactly the `BUILDING_OPEN` kernel op (`§TM_OPS_CHECK total=1 place=0`) and the epoch had never
  // been computed (`_projectStart == _projectEnd == 0`), so this resolved true against a zero-span
  // 1970 timeline. The rehearsal then armed on it (`§CPE_PREVIEW_BUILDUP armed ops=1 placed=0`) and
  // every frame's cursor `projectStart + u*(projectEnd-projectStart)` evaluated to the SAME 0 —
  // 497 frames of `§PERF_TRAVERSE span=0h`, camera flying, nothing building. The real 63,415-op
  // timeline finished loading (`§WRITE_LOOP_TIMING rows=63415`) seconds AFTER the flight started.
  // Readiness is "the timeline has a real SPAN", not "the array is non-empty" — the identical bar
  // ghostGroundArm already applied to the same state (`§GHOST_GROUND skip reason=buildup span is 0`)
  // and the only consumer that refused it. This is NOT a new wait: the existing 60x500ms poll now
  // waits for the condition it always meant. A real timeline always has span > 0 (`_projectStart =
  // _ops[0].start_ts - 1`, `_projectEnd` = max end_ts), so this cannot reject a usable state.
  function _bakeTimelineReady() { return !!_ops.length && _projectEnd > _projectStart; }
  // §CPE_BUILDUP_ACTIVATE_POPS_PANEL: true only while THIS bake is the reason TM is _active — a bake
  // that started while a real user Play/TM session was already open must never turn that off underneath
  // them. window.tmDeactivateIfBakeOwned() (below) is the paired cleanup cinema_maxq calls on every
  // bake exit path (normal end, cancel, throw) — same contract as tmRestoreDerivedOrder/_ghostGroundRestore.
  var _bakeOwnsActivation = false;
  // §CPE_BUILDUP_REQUIRE_TM_FIRST (2026-08-25, bim-compiler prompts/CINEMA_PATH_EDITOR.md — user
  // ruling "no auto JSON outside TM"): a plain existence check, read-only, no DB writes, never
  // generates anything. cinema_maxq calls this BEFORE tmActivateForBake so it can refuse with a
  // clear reason instead of silently falling through activate()'s cold-generate path — the FIRST
  // schedule for a building must be born from a real Time Machine open (the one place generation is
  // allowed to run), so the user actually sees the buildup before it gets baked into a movie. Once a
  // schedule exists (cache OR kernel_ops), every later bake reads it silently — a one-time gate, not
  // a per-bake nag (user: "it is only 1 time and good practice").
  window.tmHasExistingSchedule = function() {
    function hasPlace(ops) { return !!ops && ops.some(function(o) { return o.op_type === 'ELEMENT_PLACE'; }); }
    if (_active && hasPlace(_ops)) return Promise.resolve(true);
    return cacheGet('gantt').then(function(cachedOps) {
      if (hasPlace(cachedOps)) return true;
      return hasPlace(loadOps());
    }).catch(function() { return hasPlace(loadOps()); });
  };
  window.tmActivateForBake = function() {
    return new Promise(function(resolve) {
      if (_active && _bakeTimelineReady()) return resolve(true);
      if (!_active) {
        _bakeOwnsActivation = true;
        try { activate(true); } catch (e) { _bakeOwnsActivation = false; console.warn('§MAXQ_TIME_ABORT reason=activate ' + e.message); return resolve(false); }
      }
      var n = 0, iv = setInterval(function() {
        if (_bakeTimelineReady() || ++n > 60) {
          clearInterval(iv);
          var ok = _bakeTimelineReady();
          if (!ok) console.warn('§CPE_BUILDUP_ARM_GATE timeout ops=' + _ops.length +
            ' projectStart=' + _projectStart + ' projectEnd=' + _projectEnd +
            ' — no timeline with a real span after ' + n + ' polls; refusing to arm a cursor that cannot move');
          resolve(ok);
        }
      }, 500);
    });
  };
  // Paired with tmActivateForBake — call once on every bake exit path (normal end, cancel, throw).
  // No-op unless THIS bake was the one that silently turned TM on; a bake that reused an
  // already-open real TM session leaves it exactly as the user had it.
  window.tmDeactivateIfBakeOwned = function() {
    if (_bakeOwnsActivation && _active) deactivate();
    _bakeOwnsActivation = false;
  };

  // ── §TM_WARM (2026-08-12, bim-compiler prompts/CPE_4D_PERF_MEM_FINDINGS.md §3c —
  // Implementing R4(a), user ruling "warm data only, never activate" — Witness: W-XRAY-MEMO #3) ──
  // G-CPE-SOLE-OWNER ("only a real Play opens Time Machine") holds by its LETTER here: this
  // precomputes DERIVED DATA into the memo and nothing else. It does not call activate(), does not
  // set _active, does not touch _ops, does not show the panel, and runs no DB write.
  //
  // Why only the elements half: _ops is NOT warmable and deliberately is not warmed — both load
  // paths in _activateAsync have side effects the ruling forbids (the §GANTT_CACHE_HIT branch
  // DELETEs+INSERTs kernel_ops; the cold branch runs the full injectGantt recompute). So the
  // support-edge pass (which needs _ops for its schedMap) still runs on first Play; §XRAY_CACHE_MEMO
  // is what makes every activation AFTER the first free. Stated plainly so nobody reads this as
  // "first Play is now 0 ms" — it is not.
  //
  // ⚠ BASELINE-PERF GUARD (user directive 2026-08-12: "it is performing very well now! Thus do take
  // care not to disturb that baseline perf"). _buildXrayElements() is ONE synchronous chunk (a
  // SELECT + a map over up to 125k rows) — once started it cannot yield, so an ill-timed warm is a
  // long task = a visible hitch mid-edit. Hence: pure-idle, NO requestIdleCallback timeout (never
  // forced — if the browser never idles, warm never happens and nothing is worse than today), and
  // NO setTimeout fallback (a fallback timer is exactly the "runs at a bad moment" case this guard
  // exists to prevent). Skipped outright while streaming, while TM is active, or if already warm.
  window.tmWarmXrayElements = function() {
    var app = A();
    if (!app || !app.db) return false;
    if (_active) return false;                 // TM already owns this — nothing to warm
    if (app.streaming) return false;           // mirrors _dlodEngaged's !streaming gate
    // The busy flags dlod_nav.js:53 already names as "not idle": Cinema (_cinemaOrbitActive/
    // _maxqActive) and the Photoreal still refine (_stillRefineActive). Extracted from that list
    // rather than invented — there is no _bakeActive on APP.
    if (app._maxqActive || app._cinemaOrbitActive || app._stillRefineActive) return false;
    if (typeof window.requestIdleCallback !== 'function') return false;   // no fallback, by design
    var key = ((app && app.activeBuilding) || '?') + '|' + _xrayMemoGen();
    if (_xrayElemMemo && _xrayElemMemo.key === key) return false;         // already warm
    window.requestIdleCallback(function() {
      var a2 = A();
      // Re-check at fire time: idle may land minutes later, after a Play/bake/stream started.
      if (!a2 || !a2.db || _active || a2.streaming || a2._maxqActive || a2._cinemaOrbitActive || a2._stillRefineActive) {
        console.log('§TM_WARM skipped — state changed before idle fired');
        return;
      }
      var t0 = performance.now();
      var em = _xrayElementsMemoized();
      console.log('§TM_WARM elements=' + ((em.elements && em.elements.length) || 0) +
        ' ms=' + (performance.now() - t0).toFixed(1) + ' memo=' + (em.hit ? 'hit' : 'miss') +
        ' active=' + _active + ' ops=' + _ops.length + ' (TM not activated)');
    });
    return true;
  };

  // Mode D: re-key the derived order so the reveal follows the CAMERA PATH instead of the Z-bands.
  // This adds NO new render path — `renderAtTime` is untouched. It consumes `_ops` purely as "sorted
  // ascending by start_ts, break past the cursor", so re-keying the timestamps IS the feature.
  //
  // The key, and why it is derived rather than tuned:
  //     revealS = (floor(cameraS · frames) + zRank) / frames
  // `cameraS` is where along the flight the camera comes closest to the element — the primary order,
  // which is the user's "construction follows the camera path". `zRank` is the element's place in the
  // DERIVED 4D order, and dividing by `frames` makes it the tie-break WITHIN one frame of camera
  // travel — so a region assembles bottom-up in its own 4D order as the camera passes it, which is
  // the "elements laying on each other according to its part in the 4D" half. The bucket size is the
  // bake's own frame count, not a chosen constant.
  //
  // Install duration is one and a half frames of cursor, deliberately: the playback-derived
  // `lingerMs = tickMs()*3` is ~2.7h in DAY mode while a film steps DAYS per frame, so inheriting it
  // would step clean over every frontier state and the film would read as pop-in rather than
  // assembly (recorded in PHOTOREAL_STILL_RENDER.md §MAXQ_TIME code-read, item 3.2).
  var _bkSaved = null;
  window.tmOrderByCameraPath = function(poseAt, frames, opts) {
    opts = opts || {};
    var t0 = performance.now();
    if (typeof poseAt !== 'function') { console.warn('§MAXQ_TIME_ABORT reason=no-poseAt'); return null; }
    if (!_ops.length) { console.warn('§MAXQ_TIME_ABORT reason=no-ops (Time Machine has no derived order yet)'); return null; }
    var app = A();
    if (!app || !app.db || typeof app.three2ifc !== 'function') {
      console.warn('§MAXQ_TIME_ABORT reason=no-db-or-transform'); return null;
    }
    var nF = Math.max(2, frames | 0);
    // Element positions, in IFC space — the camera path is converted TO ifc rather than every element
    // to three, because there are ~250 path samples and up to 10^5 elements.
    var pos = {}, discOf = {}, nPos = 0;
    try {
      var rows = app.dbQuery('SELECT t.guid, t.center_x, t.center_y, t.center_z, m.discipline ' +
                             'FROM element_transforms t LEFT JOIN elements_meta m ON m.guid = t.guid');
      for (var r = 0; r < rows.length; r++) {
        pos[rows[r][0]] = [rows[r][1], rows[r][2], rows[r][3]];
        discOf[rows[r][0]] = rows[r][4] || '?';
        nPos++;
      }
    } catch (e) { console.warn('§MAXQ_TIME_ABORT reason=' + e.message); return null; }
    if (!nPos) { console.warn('§MAXQ_TIME_ABORT reason=no-element_transforms'); return null; }

    var NS = 256, path = [], k;
    for (k = 0; k < NS; k++) {
      var p = poseAt(k / (NS - 1));
      var q = app.three2ifc(p.x, p.y, p.z);
      path.push([q.ix, q.iy, q.iz]);
    }
    // Save the derived order ONCE so tmRestoreDerivedOrder can put it back exactly, without a
    // re-query (a re-query would also re-run injectGantt's cost for nothing).
    if (!_bkSaved) {
      _bkSaved = { ops: _ops.map(function(o) { return { i: o, s: o.start_ts, e: o.end_ts }; }),
                   ps: _projectStart, pe: _projectEnd };
    }
    var n = _ops.length, span = Math.max(1, _bkSaved.pe - _bkSaved.ps), base = _bkSaved.ps;
    var hit = 0, miss = 0, arc = 0;
    for (var i = 0; i < n; i++) {
      var op = _ops[i];
      var guid = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
      var P = guid ? pos[guid] : null;
      var zRank = n > 1 ? i / (n - 1) : 0;
      var camS;
      if (!P) { camS = zRank; miss++; }          // no geometry: keep its derived place, do not invent one
      else {
        var bestK = 0, bestD = Infinity;
        for (k = 0; k < NS; k++) {
          var dx = path[k][0] - P[0], dy = path[k][1] - P[1], dz = path[k][2] - P[2];
          var d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < bestD) { bestD = d2; bestK = k; }
        }
        camS = bestK / (NS - 1); hit++;
        if (discOf[guid] === 'ARC') arc++;
      }
      var reveal = (Math.floor(camS * nF) + zRank) / nF;
      if (reveal > 1) reveal = 1;
      op.start_ts = base + reveal * span;
      op.end_ts = op.start_ts + (span / nF) * 1.5;
    }
    _ops.sort(function(a, b) { return a.start_ts - b.start_ts; });
    _projectStart = _ops[0].start_ts - 1;
    _projectEnd = Math.max.apply(null, _ops.map(function(o) { return o.end_ts; }));
    // The event index is keyed on _ops; it is now stale in every entry. Drop it and require a fresh
    // full pass before any delta skip can engage again (§PERF_INCR's own invalidation contract).
    _evMesh = null; _evSig = ''; _incrPrimed = false;
    // §Z_STACK_XRAY_STAGING: this re-keys op timestamps to a CAMERA-PATH order ("NOT a construction
    // programme" — see the log line below), not the construction schedule the staging cache was
    // built from, so its cached solidify times no longer correspond to when guids actually reach
    // "placed" under this order. Drop it rather than show a stale/wrong ghost — no rebuild call
    // exists on this path since "support" isn't a meaningful concept for a camera-driven reveal
    // order; elements simply go solid the moment they place, same as before this feature, only in
    // this one non-construction mode.
    _tmXraySolidifyTs = {}; _tmXrayStagedTotal = 0; _tmXraySolidifiedN = 0;
    console.log('§MAXQ_TIME mode=D ops=' + n + ' placed=' + hit + ' noGeom=' + miss +
      ' arc=' + arc + ' frames=' + nF + ' samples=' + NS +
      ' span=' + Math.round(span) + 'ms installFrames=1.5' +
      ' ms=' + (performance.now() - t0).toFixed(0) +
      ' — DERIVED BUILD ORDER re-keyed to the camera path (NOT a construction programme)');
    return { ops: n, placed: hit, noGeom: miss, arc: arc, source: 'derived',
             projectStart: _projectStart, projectEnd: _projectEnd };
  };

  // ── §CPE_BUILDUP_REAL_SCHEDULE §3.1 — is this building's 4D REAL or DERIVED? ────────────────────
  // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_REAL_SCHEDULE §3.1 — Witness: W-SCHED-COVERAGE
  // PURE READ. Must not trigger injectGantt and must not mutate anything.
  //
  // ⚠ MEASURED CORRECTION — `_capActive` ALONE IS THE WRONG TEST, and the witness caught it before
  // this shipped. `_capActive` is set by injectGantt's `_cap` overlay, so it is a RUN-SCOPED SIDE
  // EFFECT, not a property of the data. `activate()` deliberately SKIPS injectGantt when the db
  // already carries usable ELEMENT_PLACE ops with `_end_ts` (the cached/shipped-timeline fast path,
  // ~line 4462) — which is exactly the case for a building whose schedule was authored in an earlier
  // session and persisted. Confirmed on TerminalHi4D.db: all 48,433 ops carry `_captured:1` and
  // `_task:TASK_*`, timestamps spanning the real 2026-01-01..2026-05-30 window, yet `_capActive` was
  // false and this verb reported 'derived' — i.e. the real schedule was there and would still have
  // been thrown away by mode D.
  // So the source is decided by the OPS THEMSELVES: dated leaf tasks must exist AND the loaded ops
  // must actually be keyed to them (`parameters._captured`, the marker `_cap` persists), with
  // `_capActive` accepted as the same-session equivalent. Coverage falls back to the op count for the
  // same reason — `_coveredCount` is only populated on the run where injectGantt executed.
  window.tmScheduleSource = function() {
    var leafTasks = 0, summarySkipped = 0, total = 0;
    var app = A();
    var capOps = 0;
    for (var oi = 0; oi < _ops.length; oi++) {
      if (_ops[oi].parameters && _ops[oi].parameters._captured) capOps++;
    }
    if (app && app.db) {
      try {
        var tr = app.db.exec("SELECT COUNT(*) FROM tasks WHERE schedule_start IS NOT NULL " +
          "AND schedule_finish IS NOT NULL AND (is_summary IS NULL OR is_summary = 0)");
        if (tr.length && tr[0].values.length) leafTasks = tr[0].values[0][0] | 0;
        var sr = app.db.exec("SELECT COUNT(*) FROM tasks WHERE is_summary = 1");
        if (sr.length && sr[0].values.length) summarySkipped = sr[0].values[0][0] | 0;
      } catch (e) { leafTasks = 0; summarySkipped = 0; }   // no tasks table → derived, not an error
      try {
        var er = app.db.exec("SELECT COUNT(*) FROM elements_meta WHERE ifc_class != 'IfcOpeningElement' AND ifc_class != 'IfcSpace'");
        if (er.length && er[0].values.length) total = er[0].values[0][0] | 0;
      } catch (e) { total = 0; }
    }
    // Coverage is counted off the LOADED OPS FIRST, not off `_coveredCount`. `_coveredCount` tallies
    // `_cap`'s UPDATE executions against kernel_ops, so a db carrying duplicate ELEMENT_PLACE rows for
    // a guid inflates it above the element count (measured: 2238 on a 1119-element Duplex after an
    // extra injectGantt pass). `capOps` is what the film actually reveals, so it is the honest number;
    // `_coveredCount` is kept only as the fallback for the window where ops have not been reloaded yet.
    var covered = capOps || _coveredCount;
    return {
      source: (leafTasks > 0 && (_capActive || capOps > 0)) ? 'captured' : 'derived',
      leafTasks: leafTasks, summarySkipped: summarySkipped,
      capOps: capOps, capActive: _capActive,
      covered: covered, total: total, coveredUpdates: _coveredCount,
      pct: total ? Math.min(100, Math.round(covered / total * 100)) : 0,
      projectStart: _projectStart, projectEnd: _projectEnd, ops: _ops.length
    };
  };

  // ── §CPE_BUILDUP_REAL_SCHEDULE §3.2 — the CAPTURED branch of the buildup ───────────────────────
  // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_REAL_SCHEDULE §3.2
  // Witnesses: W-SCHED-REAL-ORDER, W-SCHED-REVERSIBLE
  //
  // ⚠ This verb deliberately WRITES NOTHING, and that is the whole design — not an omission.
  // injectGantt's `_cap` overlay has ALREADY keyed every covered op to its own task's
  // [schedule_start, schedule_finish] window (leaf tasks only — `is_summary` is filtered there), with
  // §PLAYBACK-STAGGER distributing each task's guids bottom-up by center_z WITHIN that window.
  // loadOps() then reads them back ORDER BY timestamp and computeDays() sets _projectStart/_projectEnd
  // to the real project epoch. So "order the reveal by the real schedule" is already true of `_ops`
  // the moment the timeline exists; mode D's re-key is what was DESTROYING it (§2).
  //
  // Returns the SAME shape tmOrderByCameraPath returns, so cinema_maxq.js's per-frame cursor loop
  // needs no change. Because nothing was written, _bkSaved stays null and tmRestoreDerivedOrder() is a
  // genuine no-op — stronger than restoring correctly, since there is nothing to get wrong.
  window.tmOrderBySchedule = function() {
    if (!_ops.length) { console.warn('§CPE_BUILDUP_SOURCE reject reason=no-ops'); return null; }
    var ss = window.tmScheduleSource();
    if (!ss.leafTasks) { console.warn('§CPE_BUILDUP_SOURCE reject reason=no-dated-leaf-tasks'); return null; }
    if (ss.source !== 'captured') { console.warn('§CPE_BUILDUP_SOURCE reject reason=ops-not-keyed-to-tasks'); return null; }
    var capOps = ss.capOps;
    var iso = function(ms) { return isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '?'; };
    console.log('§CPE_BUILDUP_SOURCE source=captured leafTasks=' + ss.leafTasks +
      ' summarySkipped=' + ss.summarySkipped + ' covered=' + ss.covered + '/' + ss.total +
      ' pct=' + ss.pct + '% capOps=' + capOps + '/' + _ops.length +
      ' capActive=' + ss.capActive +
      ' window=' + iso(_projectStart) + '..' + iso(_projectEnd) +
      ' — REAL LINKED SCHEDULE, reveal follows schedule_start (no re-key, no float/logic in this data)');
    return { ops: _ops.length, placed: capOps, noGeom: _ops.length - capOps, arc: 0, source: 'captured',
             leafTasks: ss.leafTasks, covered: ss.covered, total: ss.total, pct: ss.pct,
             projectStart: _projectStart, projectEnd: _projectEnd };
  };

  // ── §CPE_BUILDUP_FOLLOW_TM — the film PLAYS the Time Machine; it does not author a build order ──
  // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_SOURCE_BLIND
  // User, 2026-07-29: "do not bake anything for TM.. as i said, it is user's own plan" /
  // "this practices good separation of tasks" — Time Machine owns the build order, Alt+C owns the
  // camera. The film is a camera over a timeline someone else authored, and nothing about pressing
  // Alt+C may change WHEN anything is built.
  //
  // This is the ONE verb both callers (the bake in cinema_maxq.js and the Preview in
  // cinema_path_editor.js) now use, which is also the fix for those two having chosen the buildup
  // source by different rules — the preview called tmOrderByCameraPath unconditionally while the bake
  // consulted tmScheduleSource(), so on a captured-schedule building the rehearsal and the film could
  // disagree about what they were showing.
  //
  // Like tmOrderBySchedule (which it delegates to for the captured case) it WRITES NOTHING: `_ops`
  // are already in timeline order the moment the timeline exists — loadOps() reads them ORDER BY
  // timestamp and computeDays() sets the real project epoch. So "follow the Time Machine" needs no
  // pass at all, which is why _bkSaved stays null and tmRestoreDerivedOrder() is a genuine no-op.
  //
  // mode S = a captured/linked schedule keyed to dated leaf tasks.
  // mode T = this model's own derived 4D timeline (schedule_gate's geometry-gated, bottom-up order —
  //          real work, but NOT a construction programme; the wording tiers in §5 still apply).
  // There is deliberately no mode D here. tmOrderByCameraPath still exists and is still correct at
  // what it does, but re-keying a timeline to camera proximity is exactly the interference this verb
  // was written to remove.
  window.tmFollowTimeline = function() {
    if (!_ops.length) { console.warn('§CPE_BUILDUP_SOURCE reject reason=no-ops'); return null; }
    // §CPE_BUILDUP_ARM_GATE guard 2 (see tmActivateForBake above for the measured failure): a
    // timeline with no SPAN cannot drive a cursor — `projectStart + u*(projectEnd-projectStart)` is
    // the same value at every u, so the film freezes on frame 0's state and no log says why. Refuse
    // it loudly instead of handing back a bkState the caller will faithfully follow to nowhere. The
    // BAKE (cinema_maxq.js) calls this same verb, so this also stops a film silently recording a
    // static building. ghostGroundArm/dayCounterLiveStart already refuse this exact state.
    if (!(_projectEnd > _projectStart)) {
      console.warn('§CPE_BUILDUP_SOURCE reject reason=zero-span ops=' + _ops.length +
        ' projectStart=' + _projectStart + ' projectEnd=' + _projectEnd +
        ' — every frame would ask for the same cursor; the timeline is not loaded yet');
      return null;
    }
    var ss = window.tmScheduleSource();
    if (ss.source === 'captured' && typeof window.tmOrderBySchedule === 'function') {
      var cap = window.tmOrderBySchedule();
      if (cap) return cap;
      // A degraded captured schedule falls through to the timeline as loaded — still the user's
      // plan, never a re-key.
      console.warn('§CPE_BUILDUP_SOURCE fallthrough reason=captured-but-unusable — following the timeline as loaded');
    }
    // Count what the reveal can actually show, the same way mode D counted `placed`: an op with no
    // geometry still holds its place in the order, it just has nothing to appear.
    var app = A(), placed = 0, noGeom = 0;
    try {
      var have = {};
      var rows = app.dbQuery('SELECT guid FROM element_transforms');
      for (var r = 0; r < rows.length; r++) have[rows[r][0]] = 1;
      for (var i = 0; i < _ops.length; i++) {
        var op = _ops[i];
        var guid = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
        if (guid && have[guid]) placed++; else noGeom++;
      }
    } catch (e) { placed = _ops.length; noGeom = 0; }   // counting failed → do not block the film
    // §CPE_BUILDUP_ARM_GATE guard 2b: `placed` is this function's own count of ops that can actually
    // APPEAR. Zero of them means the reveal has nothing to reveal no matter where the cursor goes —
    // the user's failing run reported exactly `placed=0` and armed anyway. A counting FAILURE above
    // degrades to placed=_ops.length (never 0), so this only ever fires on a real, measured zero.
    if (placed === 0) {
      console.warn('§CPE_BUILDUP_SOURCE reject reason=nothing-placed ops=' + _ops.length +
        ' noGeom=' + noGeom + ' — no op in this timeline maps to geometry; there is nothing to build');
      return null;
    }
    var iso = function(ms) { return isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '?'; };
    console.log('§CPE_BUILDUP_SOURCE mode=T reason=generated-timeline ops=' + _ops.length +
      ' placed=' + placed + ' noGeom=' + noGeom +
      ' leafTasks=' + ss.leafTasks + ' capOps=' + ss.capOps + '/' + _ops.length +
      ' capActive=' + ss.capActive +
      ' window=' + iso(_projectStart) + '..' + iso(_projectEnd) +
      ' — the reveal FOLLOWS this model\'s own 4D timeline, unmodified (no re-key; not a construction programme)');
    return { ops: _ops.length, placed: placed, noGeom: noGeom, arc: 0, source: 'timeline',
             leafTasks: ss.leafTasks, covered: ss.covered, total: ss.total, pct: ss.pct,
             projectStart: _projectStart, projectEnd: _projectEnd };
  };

  // ── §CPE_BUILDUP_REAL_SCHEDULE §4 — the numeric instrument the witnesses read ──────────────────
  // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_REAL_SCHEDULE §4
  // Witnesses: W-SCHED-REAL-ORDER, W-SCHED-REVERSIBLE
  // Read-only, aggregate-only (never 10^5 rows across the bridge). Per dated leaf task it returns the
  // FIRST and LAST reveal timestamp its bound elements actually get in `_ops` — which is what makes
  // "the phases do not interleave" a number instead of an opinion. Works in BOTH branches, so the
  // same instrument reads the captured order and mode D's re-key, and the two can be compared.
  // `checksum` is the exact-reversibility probe: sums over EVERY op, so any single mutated timestamp
  // changes it (W-SCHED-REVERSIBLE), without shipping the op list to the caller.
  window.tmPhaseWindows = function() {
    var app = A(), out = [], byGuid = {};
    var chk = { opCount: _ops.length, sumStart: 0, sumEnd: 0 };
    for (var i = 0; i < _ops.length; i++) { chk.sumStart += _ops[i].start_ts; chk.sumEnd += _ops[i].end_ts; }
    if (!app || !app.db) return { phases: [], checksum: chk };
    var rows;
    try {
      rows = app.db.exec('SELECT te.guid, te.task_id, t.name, t.schedule_start FROM task_elements te ' +
        'JOIN tasks t ON t.task_id = te.task_id ' +
        'WHERE t.schedule_start IS NOT NULL AND t.schedule_finish IS NOT NULL ' +
        'AND (t.is_summary IS NULL OR t.is_summary = 0)');
    } catch (e) { return { phases: [], checksum: chk }; }
    if (!rows.length || !rows[0].values.length) return { phases: [], checksum: chk };
    var meta = {};
    rows[0].values.forEach(function(r) {
      byGuid[r[0]] = r[1];
      if (!meta[r[1]]) meta[r[1]] = { taskId: r[1], name: r[2], scheduleStart: r[3], n: 0,
                                      minStart: Infinity, maxStart: -Infinity, bound: 0 };
      meta[r[1]].bound++;
    });
    for (i = 0; i < _ops.length; i++) {
      var op = _ops[i];
      var g = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
      var tid = g ? byGuid[g] : null;
      if (!tid) continue;
      var m = meta[tid];
      m.n++;
      if (op.start_ts < m.minStart) m.minStart = op.start_ts;
      if (op.start_ts > m.maxStart) m.maxStart = op.start_ts;
    }
    for (var k in meta) if (meta[k].n) out.push(meta[k]);
    out.sort(function(a, b) {
      return (Date.parse(a.scheduleStart) - Date.parse(b.scheduleStart)) ||
             (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0);   // §3.2: stable tie-break only
    });
    return { phases: out, checksum: chk };
  };

  window.tmRestoreDerivedOrder = function() {
    if (!_bkSaved) return false;
    for (var i = 0; i < _bkSaved.ops.length; i++) {
      _bkSaved.ops[i].i.start_ts = _bkSaved.ops[i].s;
      _bkSaved.ops[i].i.end_ts = _bkSaved.ops[i].e;
    }
    _ops.sort(function(a, b) { return a.start_ts - b.start_ts; });
    _projectStart = _bkSaved.ps; _projectEnd = _bkSaved.pe;
    _evMesh = null; _evSig = ''; _incrPrimed = false;
    _bkSaved = null;
    _tmRebuildXrayCache();  // §Z_STACK_XRAY_STAGING: back on the real construction order — the
                              // cache is valid again, rebuild it rather than leave it cleared
    console.log('§MAXQ_TIME restored — derived Z-band order back in force');
    return true;
  };
  // W-BUILDUP-SAMPLE reads this: how many ops are placed at the current cursor. Counting ops rather
  // than meshes keeps the witness independent of the render path it is meant to be checking.
  window.tmPlacedCount = function(ms) {
    var c = isFinite(ms) ? ms : _cursor, n = 0;
    for (var i = 0; i < _ops.length; i++) {
      if (_ops[i].start_ts > c) break;
      if (_ops[i].end_ts <= c) n++;
    }
    return n;
  };

  // §CPE_GHOST_GROUND (CINEMA_PATH_EDITOR.md) — the cursor time at which the buildup first places
  // something that is NOT underground. A buildup film opens on substructure, and substructure sits
  // below the ground plane (§GROUND_Y), so the opening is not empty — it is OCCLUDED. This is the
  // moment the ghosted plane may start returning to opaque.
  //
  // `bottom >= ifcZ - EPS` deliberately COUNTS the ground-floor slab itself (its bottom IS the
  // ground datum, by construction — tools.js picks the plane's height from that very slab). The
  // user's own framing was "until its above slabs appears", and the slab appearing is exactly the
  // moment the ground stops needing to be see-through.
  //
  // One DB read, one pass over the ops, called ONCE per bake/preview — never per frame.
  // Returns null when nothing is ever at or above the datum (a fully-buried model, or no ops), and
  // the caller must treat null as "never ghost" rather than "ghost forever".
  window.tmFirstAboveGroundMs = function(ifcZ) {
    var app = A();
    if (!app || !app.db || !isFinite(ifcZ) || !_ops.length) return null;
    var EPS = 0.05, above = Object.create(null), rows;
    try {
      rows = app.db.exec('SELECT guid, center_z - COALESCE(bbox_z, 0) / 2.0 AS bottom ' +
                         'FROM element_transforms WHERE center_z IS NOT NULL');
    } catch (e) { console.warn('§GHOST_GROUND_TRIGGER_FAIL ' + e.message); return null; }
    if (!rows.length || !rows[0].values.length) return null;
    var vals = rows[0].values, nAbove = 0;
    for (var r = 0; r < vals.length; r++) {
      if (vals[r][1] != null && vals[r][1] >= ifcZ - EPS) { above[vals[r][0]] = 1; nAbove++; }
    }
    // ⚠ MIN over end_ts, NOT the first match in start order. `_ops` is ordered by start_ts, but an
    // element only BECOMES VISIBLE when its op ends — `tmPlacedCount` counts `end_ts <= cursor`, and
    // the ghost has to lift on the same definition or it lifts while the ground is still bare.
    // Measured on Hospital: taking the first start-ordered match gave triggerT=0.0162 while ops with
    // EARLIER end_ts existed further down the list. One extra pass over 63k ops, once per bake.
    var firstMs = null, scanned = 0, matched = 0, belowN = 0, lastBelowMs = null;
    for (var i = 0; i < _ops.length; i++) {
      var op = _ops[i];
      var g = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
      scanned++;
      if (!g || !above[g]) { if (g) { belowN++; if (lastBelowMs == null || op.end_ts > lastBelowMs) lastBelowMs = op.end_ts; } continue; }
      matched++;
      if (firstMs == null || op.end_ts < firstMs) firstMs = op.end_ts;
    }
    console.log('§GHOST_GROUND_TRIGGER groundZ=' + ifcZ.toFixed(2) + ' aboveElems=' + nAbove + '/' + vals.length +
      ' firstAboveMs=' + (firstMs == null ? 'none' : Math.round(firstMs)) +
      ' aboveOps=' + matched + ' belowOps=' + belowN +
      ' lastBelowMs=' + (lastBelowMs == null ? 'none' : Math.round(lastBelowMs)) +
      ' opsScanned=' + scanned + '/' + _ops.length +
      ' span=' + Math.round(_projectStart) + '..' + Math.round(_projectEnd) +
      ' — before this the buildup is entirely below the ground plane');
    return firstMs;
  };

  // §CPE_GHOST_GROUND_RATIO — the SCHEDULE of above-ground placement, not just its first moment.
  // Measured on Hospital: the first at-or-above-ground element lands at t=0.0162 (2.4s of a 147.9s
  // film) while below-ground work continues to t=0.9947 — that model has no clean "substructure
  // window" at all, so a first-element trigger lifts the ghost before the camera has even landed.
  // The generic answer is a RATIO against the model's own above-ground total: the ground solidifies
  // as the building rises, on every building, with no per-model tuning.
  //
  // Returns sorted end_ts for every above-ground op (binary-searchable per frame — never a rescan),
  // plus the counts a caller needs to decide whether ghosting applies to this model at all.
  window.tmGroundSchedule = function(ifcZ) {
    var app = A();
    if (!app || !app.db || !isFinite(ifcZ) || !_ops.length) return null;
    var EPS = 0.05, above = Object.create(null), rows;
    try {
      rows = app.db.exec('SELECT guid, center_z - COALESCE(bbox_z, 0) / 2.0 AS bottom ' +
                         'FROM element_transforms WHERE center_z IS NOT NULL');
    } catch (e) { console.warn('§GHOST_GROUND_TRIGGER_FAIL ' + e.message); return null; }
    if (!rows.length || !rows[0].values.length) return null;
    var vals = rows[0].values, i;
    for (i = 0; i < vals.length; i++) {
      if (vals[i][1] != null && vals[i][1] >= ifcZ - EPS) above[vals[i][0]] = 1;
    }
    var ends = [], belowN = 0;
    for (i = 0; i < _ops.length; i++) {
      var op = _ops[i];
      var g = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
      if (!g) continue;
      if (above[g]) ends.push(op.end_ts); else belowN++;
    }
    ends.sort(function(a, b) { return a - b; });
    var out = { ends: ends, aboveTotal: ends.length, belowTotal: belowN,
                firstAboveMs: ends.length ? ends[0] : null,
                projectStart: _projectStart, projectEnd: _projectEnd };
    console.log('§GHOST_GROUND_SCHEDULE groundZ=' + ifcZ.toFixed(2) +
      ' aboveOps=' + out.aboveTotal + ' belowOps=' + out.belowTotal +
      ' firstAboveMs=' + (out.firstAboveMs == null ? 'none' : Math.round(out.firstAboveMs)) +
      ' — opacity follows the SHARE of above-ground work placed, so it scales to any building');
    return out;
  };

  // §CPE_BUILDUP_WORK_PACED (CINEMA_PATH_EDITOR.md) — the sorted completion times of every op, so a
  // film can advance by WORK instead of by CALENDAR. Measured on the user's own Hospital bakes: at
  // the same film fraction one run had 210/63,421 elements placed and another 15,485/63,416, because
  // the derived 4D order clusters thousands of elements at nearby timestamps and the film was
  // stepping the cursor linearly in days. Stepping it linearly in ELEMENTS makes "10% of the film"
  // mean "10% of the building" on any model.
  //
  // One pass, called ONCE per bake/preview — never per frame. Read-only: nothing here re-keys or
  // reorders the op log (§CPE_BUILDUP_FOLLOW_TM — the film plays the timeline, it does not author one).
  window.tmWorkSchedule = function() {
    if (!_ops.length) return null;
    var ends = new Float64Array(_ops.length), i;
    for (i = 0; i < _ops.length; i++) ends[i] = _ops[i].end_ts;
    ends.sort();
    var out = { ends: ends, total: ends.length, projectStart: _projectStart, projectEnd: _projectEnd };
    // How front-loaded IS this model? The share of work completed in the first 10% of the calendar —
    // 0.10 would mean evenly spread, and anything far above it is exactly the burst the user saw.
    var tenPct = _projectStart + 0.10 * (_projectEnd - _projectStart), n10 = 0;
    for (i = 0; i < ends.length; i++) { if (ends[i] > tenPct) break; n10++; }
    out.workInFirstTenthOfCalendar = ends.length ? n10 / ends.length : 0;
    console.log('§CPE_WORK_SCHEDULE ops=' + out.total +
      ' span=' + Math.round(_projectStart) + '..' + Math.round(_projectEnd) +
      ' workInFirst10%OfCalendar=' + (out.workInFirstTenthOfCalendar * 100).toFixed(1) + '%' +
      ' (10.0% would be evenly spread — anything above it is the burst calendar pacing shows)');
    return out;
  };

  // Per-guid completion time — "is this SPECIFIC element placed by a given cursor", as opposed to
  // "how many ops are done in total" (tmWorkSchedule/tmPlacedCount above). One pass, read-only,
  // same guid-extraction every other _ops reader in this file already uses (tmGroundSchedule,
  // tmOrderByCameraPath) — not a new convention.
  // ORIGIN: §CPE_AIM_DEPTH_BUILDUP candidate 2 (2026-08-13), so §CPE_AIM_DEPTH's candidate-facade
  // search could not pick unbuilt geometry during a buildup bake. THAT CALLER IS GONE
  // (§CPE_AIM_DEPTH_RETIRED, 2026-09-02). This function STAYS: effects.js:4479's glow-lens
  // first-placement gate is a live, independent consumer — checked before writing this note.
  // MIN, not last-write: if a guid is touched by more than one op (uncommon but not assumed absent),
  // it counts as placed from its EARLIEST completion, matching "when does this first become real".
  window.tmGuidEndTs = function() {
    var out = Object.create(null);
    for (var i = 0; i < _ops.length; i++) {
      var op = _ops[i];
      var g = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
      if (!g) continue;
      if (!(g in out) || op.end_ts < out[g]) out[g] = op.end_ts;
    }
    return out;
  };

  // §PHASE_LENS exposure: let other modules (Find panel Phase axis) lazily
  // trigger the REAL timeline generator. Does NOT alter injectGantt's logic —
  // just exposes it. §GANTT_REFOLD_HANG: injectGantt is async now — this returns a
  // Promise<boolean>; callers must treat a thenable as "generating" (see navigate_find.js).
  window.tmGenerateTimeline = function() { return injectGantt(); };

  // §TM_STREAM_RESWEEP: streaming.js has no awareness of Time Machine — new BatchedMesh/
  // InstancedMesh geometry that finishes streaming in AFTER the current cursor's renderAtTime()
  // pass defaults to its normal (fully-visible) state and is never swept to match the active
  // cursor until the NEXT cursor change. On a large building (Hospital: 63K elements) streaming
  // can take 10s+ seconds, so a user sitting at 0Hr (cursor never moves) sees the scene fill back
  // up with fully-visible late-arriving geometry that should still be hidden. Confirmed present
  // on baseline `a13bb0d` too (pre-dates this session — not a regression, a longstanding gap).
  // streaming.js calls this (feature-detected, optional — same pattern as window.__sfxTM) after
  // each flush; no-ops when TM isn't active, so zero cost/behavior change for non-TM viewing.
  window.tmResweep = function() { if (_active) renderAtTime(_cursor); };
  // W-XRAY-MEMO test hook (§XRAY_CACHE_MEMO): read the x-ray staging map + memo state, and drive
  // the memo's key discipline deterministically. Diagnostic only — no production caller, same
  // contract as __tmSnapshotVisible. `map` returns the FULL guid→ms map so the witness can assert
  // byte-identical restore key-by-key rather than trusting a digest.
  window.__tmXrayProbe = function (op, arg) {
    if (op === 'clearMemo') { _xrayElemMemo = null; _xrayCacheMemo = []; }
    else if (op === 'rebuild') { _tmRebuildXrayCache(); }
    else if (op === 'nudge') {   // move one op's end_ts → the key MUST miss
      if (_ops.length) _ops[0].end_ts += (arg || 0);
    }
    else if (op === 'deactivate') { deactivate(); }   // the same verb the panel's close button calls
    var keys = Object.keys(_tmXraySolidifyTs);
    var out = { n: keys.length, staged: _tmXrayStagedTotal, solidified: _tmXraySolidifiedN,
                elemMemo: !!_xrayElemMemo, edgeMemo: _xrayCacheMemo.length,
                active: _active, ops: _ops.length };
    if (op === 'map') { out.map = {}; for (var i = 0; i < keys.length; i++) out.map[keys[i]] = _tmXraySolidifyTs[keys[i]]; }
    return out;
  };
  // Test hook: simulate a playback tick (small cursor advance + roll bump) so a probe can exercise
  // the incremental (delta) path deterministically without the cinema UI. Diagnostic only.
  window.__tmStep = function (dms) { if (!_active) return null; _gspRoll++;
    renderAtTime(Math.min(_projectEnd, _cursor + (dms || 3600000))); return window.__tmTrav; };
  // W-INCR-EQUIV test hook: jump to an ABSOLUTE cursor (clamped to project bounds), for the
  // forward/backward/random-scrub/jump-to-start-end sweep TM_INCREMENTAL_RENDER_PERF.md §5 requires.
  // Diagnostic only, mirrors __tmStep's no-op-if-inactive contract.
  window.__tmSetCursor = function (absMs) {
    if (!_active) return null;
    renderAtTime(Math.max(_projectStart, Math.min(_projectEnd, absMs)));
    return window.__tmTrav;
  };
  // W-INCR-EQUIV test hook: snapshot every visible guid + its slot visibility, for diffing the
  // delta path against the window.__forceFull full-path re-render at the same cursor.
  window.__tmSnapshotVisible = function () {
    if (!_active) return null;
    var app = A();
    var out = { mesh: [], batched: {}, instanced: {} };
    app.scene.traverse(function (obj) {
      if (!obj.userData) return;
      if (obj.userData.guid) { if (obj.visible) out.mesh.push(obj.userData.guid); return; }
      if (obj.isBatchedMesh && app._batchMeta && app._batchMeta[obj.id]) {
        var bmetas = app._batchMeta[obj.id], vis = {};
        for (var bi = 0; bi < bmetas.length; bi++) {
          vis[bmetas[bi].guid] = !!(obj.getVisibleAt ? obj.getVisibleAt(bmetas[bi].slotId) : obj.visible);
        }
        out.batched[obj.id] = vis;
        return;
      }
      if (obj.isInstancedMesh && app._instanceMeta && app._instanceMeta[obj.id]) {
        var metas = app._instanceMeta[obj.id], ivis = {};
        var _snapM4 = window.__tmSnapshotVisible._m4 || (window.__tmSnapshotVisible._m4 = new THREE.Matrix4());
        for (var mi = 0; mi < metas.length; mi++) {
          obj.getMatrixAt(mi, _snapM4);
          ivis[metas[mi].guid] = !(_snapM4.elements[0] === 0 && _snapM4.elements[5] === 0 && _snapM4.elements[10] === 0);
        }
        out.instanced[obj.id] = ivis;
      }
    });
    out.mesh.sort();
    return out;
  };
})();
