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
  var _days = [];          // distinct day start timestamps
  var _anchorDay = null;
  var _anchorHr = null;
  var _savedVisibility = [];
  var _highlightMeshes = [];
  var _ganttVisible = false;
  var _dashVisible = false;
  // §TM-VARIANCE (GW_HOSPITAL_SHOWCASE_SPEC §ACTUAL): planned = TM's own generated timeline; actual = a
  // deterministic over-run VARIANT computed live on it. No shipped schedule data — a variant ON what's there.
  var _varVisible = false;
  var _opsPlanned = null;   // snapshot of the planned _ops phase windows (taken when variance first opens)
  var _ganttTasks = [];  // computed task groups for click detection
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

  function computeDays() {
    var seen = {};
    _ops.forEach(function(op) {
      var d = new Date(op.start_ts);
      var key = d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
      if (!seen[key]) seen[key] = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    });
    _days = Object.values(seen).sort(function(a,b){ return a - b; });
    if (_ops.length) {
      // projectStart = 1ms BEFORE first op so ⏪ = truly empty (no frontier)
      _projectStart = _ops[0].start_ts - 1;
      _projectEnd = Math.max.apply(null, _ops.map(function(o){ return o.end_ts; }));
    }
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
  function _giHoldCamSig(app) {
    if (!app || !app.camera) return '';
    var p = app.camera.position, q = app.camera.quaternion;
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
  var _gspRoll = 0;            // re-roll index — advances once per playback tick
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
    // #866 ship believing it was verified).
    if (_gspRoll % 10 === 0) {
      console.log('§GROUP_SPARK_TICK playing=' + !!isPlaying + ' cand=' + (_gspCand.length / 3) +
                  ' (frontier=' + _gspFrontierN + ' recent=' + _gspRecentN + ')' +
                  ' roll=' + _gspRoll + ' decay=' + _gspDecay.toFixed(2));
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
    var _sfxPhases = null; // §SFX: phase set at the frontier this tick (built only when sfx.js present)
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
        // §SFX seam (sfx.js): collect the construction phase(s) at the frontier. No-op
        // when sfx.js absent or audio OFF — sfx decides whether/what to play (SoC).
        if (window.__sfxTM && p.phase) { if (!_sfxPhases) _sfxPhases = {}; _sfxPhases[p.phase] = (_sfxPhases[p.phase] || 0) + 1; }
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

    // §PERF_INCR: decide delta vs full for THIS tick.
    // Full is required (not merely allowed) when: index missing/stale, no previous cursor, the
    // shadow pass needs the complete _placedMeshes list, or the jump is large enough that skipping
    // saves nothing. A long scrub legitimately changes tens of thousands of elements -- forcing
    // delta there would be SLOWER than the full path, which is the failure this guard prevents.
    var _sig = _tmSceneSig(app);
    if (!_evMesh || _sig !== _evSig) _tmBuildEventIndex(app, lingerMs);
    var _dLo = Math.min(_prevCursor, cursorMs), _dHi = Math.max(_prevCursor, cursorMs);
    var _incrOK = !!_evMesh && _prevCursor != null && !app._shadowOn &&
                  (_dHi - _dLo) <= _INCR_MAX_SPAN_MS && _incrPrimed;
    // W-INCR-EQUIV hook: the verification harness sets window.__forceFull to re-render the SAME
    // cursor via the full path, so the two results can be diffed. Test-only; no production effect.
    if (window.__forceFull) { _incrOK = false; window.__forceFull = false; }
    if (_incrOK) _incrStats.delta++; else _incrStats.full++;

    var _perfT0 = performance.now(), _perfObjs = 0, _perfSkipped = 0;
    app.scene.traverse(function(obj) {
      _perfObjs++;
      if (!obj.userData) return;

      // ── Single mesh (has userData.guid) ──
      if (obj.userData.guid) {
        var g = obj.userData.guid;
        var isFrontier = !!frontier[g];
        var isPlaced = !!placed[g];
        var isRecent = recent[g] !== undefined;

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
        } else if (isRecent || isPlaced) {
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
          } else if (isPlaced || isRecent) {
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
        var bmetas = app._batchMeta[obj.id];
        var anyVis = false;
        var _bmHasFrontier = false;
        var _bmM4 = _tmM4;
        var _bmPos = _tmV1;
        for (var bi = 0; bi < bmetas.length; bi++) {
          var bg = bmetas[bi].guid;
          var sid = bmetas[bi].slotId;
          if (placed[bg] || frontier[bg] || recent[bg] !== undefined) {
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
          if (placed[ig] || frontier[ig] || recent[ig] !== undefined) {
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
    _incrPrimed = true;   // a full pass has now established slot state for every mesh
    // §GROUP_SPARK: emit AFTER the traverse — capping and per-group random selection need the
    // whole candidate set, which spawn-as-you-find (the reverted #866 shape) cannot provide.
    // `_playing` gates it: sparks during playback only, never on scrub.
    _gspEmit(_playing);

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
    _shadowLogTick++;
    if (_shadowLogTick >= 60) {
      _shadowLogTick = 0;
      console.log('§SHADOW_FRONTIER casters=' + _shadowCasters + ' receivers=' + _shadowReceivers);
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
    if (window.__sfxTM) {
      // most-active phase first (by element count) — stable dominant, not alphabetical flicker
      var _sfxArr = _sfxPhases ? Object.keys(_sfxPhases).sort(function (a, b) { return _sfxPhases[b] - _sfxPhases[a]; }) : [];
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
    try { _cursor = Math.max(_projectStart, Math.min(_projectEnd, c)); renderAtTime(_cursor); try { anchorFromCursor(); configSlider(); } catch (e) {} }
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

  function clearHighlight() {
    for (var i = _highlightMeshes.length - 1; i >= 0; i--) {
      restoreMaterial(_highlightMeshes[i]);
    }
    _highlightMeshes = [];
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

  function restoreVisibility() {
    clearHighlight();
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
        '<button id="tm-author" style="font-size:12px;padding:2px 6px" title="Author 4D schedule — build phases up, assign elements, tune dates">&#9998;</button>' +
        '<button id="tm-whatif" style="font-size:12px;padding:2px 6px" title="What-if: slip a phase, watch the chain re-fold in blue">&#9094;</button>' +
        '<button id="tm-editor" style="font-size:11px;padding:2px 6px" title="Open the full Schedule Editor in a new tab — expandable WBS, dependencies, critical path (CPM) and interactive drag-Gantt">&#8599; Editor</button>' +
        '<button id="tm-dash" style="font-size:12px;padding:2px 6px" title="Dashboard">&#x1F4CB;</button>' +
        '<button id="tm-var" style="font-size:13px;padding:2px 6px;display:none" title="Budget vs Actual variance">&#x2696;</button>' +
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
        '<button id="tm-touched" style="flex:1;font-size:9px">Copy Touched</button>' +
        '<button id="tm-new" style="flex:1;font-size:9px">Copy New</button>' +
      '</div>' +
      '<div id="tm-gantt-box" class="tm-drawer-bottom">' +
        '<div id="tm-gantt-legend" style="display:flex;flex-wrap:wrap;gap:2px 8px;padding:2px 4px 2px 64px;font-size:10px;color:#ccc;min-height:14px"></div>' +
        '<div style="position:relative">' +
          '<canvas id="tm-gantt-canvas" style="width:100%;cursor:pointer"></canvas>' +
          '<div id="tm-gantt-hair" style="position:absolute;top:0;width:2px;height:100%;background:#ff8c00;pointer-events:none;z-index:1;display:none"></div>' +
          '<div id="tm-gantt-tip" style="position:absolute;top:4px;left:0;background:rgba(20,20,40,0.92);color:#ff8c00;font-size:10px;padding:3px 8px;border-radius:3px;border:1px solid rgba(255,140,0,0.3);pointer-events:none;z-index:2;display:none;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis"></div>' +
        '</div>' +
      '</div>' +
      '<div id="tm-var-box" class="tm-drawer-bottom">' +
        '<div id="tm-var-head" style="padding:4px 6px 2px;font-size:11px;color:#e0e0e0;line-height:1.5"></div>' +
        '<canvas id="tm-var-canvas" style="width:100%;cursor:default"></canvas>' +
        '<div id="tm-var-list" style="padding:2px 6px 4px;font-size:10px;color:#ccc"></div>' +
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
      '</div>';
    document.body.appendChild(_panel);

    var style = document.createElement('style');
    style.textContent =
      '#time-machine-panel{transition:width 200ms ease-out}' +
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
    // §SE-C: open the full Schedule Editor (WBS · dependencies · CPM · drag-Gantt) in its own tab,
    // carrying the current building's DB so it edits the SAME model. The TM is the schedule hub; the
    // power tool lives on a separate surface (front visual stays light).
    var _editor = document.getElementById('tm-editor');
    if (_editor) _editor.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      var a = A();
      var dburl = (a && a.DB_URL) ? a.DB_URL : (new URL(location.href)).searchParams.get('db');
      var u = new URL('schedule_editor.html', location.href);
      if (dburl) u.searchParams.set('db', dburl);
      window.open(u.toString(), '_blank');
      var s = document.getElementById('tm-status'); if (s) s.textContent = 'Schedule Editor opened in a new tab';
      console.log('§TIME_MACHINE open schedule_editor db=' + (dburl || '(default)'));
    });

    // Transport buttons
    document.getElementById('tm-start-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); stopPlayback(); _cursor = _projectStart; renderAtTime(_cursor); anchorFromCursor(); configSlider();
    });
    document.getElementById('tm-end-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); stopPlayback(); _cursor = _projectEnd; renderAtTime(_cursor); anchorFromCursor(); configSlider();
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

    document.getElementById('tm-touched').addEventListener('pointerup', function(e) {
      e.stopPropagation(); copyGuids(false);
    });
    document.getElementById('tm-new').addEventListener('pointerup', function(e) {
      e.stopPropagation(); copyGuids(true);
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
      if (_ganttVisible) drawGanttMini();
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
      _cursor = p.winStart;
      renderAtTime(_cursor);
      anchorFromCursor();
      configSlider();
      console.log('§TM_VARIANCE_JUMP phase="' + p.phase + '" cursor=' + Math.round(_cursor) + ' committed=' + p.aCost);
    });
    document.getElementById('tm-gantt-canvas').addEventListener('pointerup', function(e) {
      if (!_active || !_ops.length) return;
      var rect = e.target.getBoundingClientRect();
      var x = (e.clientX - rect.left - 60) / (rect.width - 60);  // account for storey label margin
      if (x < 0) x = 0;
      var pct = Math.min(1, Math.max(0, x));
      var ts = _projectStart + pct * (_projectEnd - _projectStart);
      var bar = findBarAtClick(e);
      _cursor = ts;
      renderAtTime(_cursor);
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
    if (dir < 0 && _cursor <= _projectStart) _cursor = _projectEnd;
    // §S260e: Opening = construction starts from empty, camera orbits for context
    var _willOpen = _camFollow && dir > 0 && _cineStoryboard.length &&
      (_cursor >= _projectEnd || _cursor <= _projectStart + 1);
    if (dir > 0 && _cursor >= _projectEnd) _cursor = _projectStart;

    if (_willOpen) {
      _cursor = _projectStart; // start empty — construction builds while camera orbits
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
    _cursor += _playDir * tickMs();
    _cursor = Math.max(_projectStart, Math.min(_cursor, _projectEnd));

    renderAtTime(_cursor);

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
  // Z-DRIVEN CONSTRUCTION SCHEDULE
  // ══════════════════════════════════════════════════════════════════
  //
  // One abstract rule: lower Z finishes before higher Z starts.
  // Within same Z-band (storey): seq from SEQUENCE_RULES for phase order.
  // Same resource on same storey = sequential. Different resource = parallel.
  // Always re-inject on activate — never use stale cached ops.

  function injectGantt() {
    var app = A();
    if (!app || !app.db) return false;
    var db = app.db;

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

    function matchRule(cls) {
      if (!cls) return SD;
      var bestKey = null, bestLen = 0;
      for (var key in SR) {
        if (cls.indexOf(key) >= 0 && key.length > bestLen) { bestKey = key; bestLen = key.length; }
      }
      return bestKey ? SR[bestKey] : SD;
    }
    function getInstallSecs(cls) {
      var rule = matchRule(cls);
      var resource = rule.resource;
      if (!resource || !LR[resource]) return 120;
      var labor = LR[resource], bestPk = null, bestLen = 0;
      for (var pk in labor.productivity) {
        if (cls.indexOf(pk) >= 0 && pk.length > bestLen) { bestPk = pk; bestLen = pk.length; }
      }
      var prod = bestPk ? labor.productivity[bestPk] : 0;
      return prod > 0 ? Math.round(28800 / prod) : 120;
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
        "WHERE m.ifc_class != 'IfcOpeningElement' " +
        'ORDER BY cz, COALESCE(t.center_x, 0), COALESCE(t.center_y, 0)'
      );
    } catch(e) { console.log('§GANTT table error: ' + e.message); return false; }
    if (!r.length || !r[0].values.length) return false;

    var totalDbElements = r[0].values.length;

    // ── Storey bands: group by storey name, rank by MEDIAN Z (bottom-up) ──
    // §S260c BUG5: Use median center_z per storey instead of min.
    // Min Z is unreliable — a column extending down from an upper storey gives it a low minZ,
    // causing upper elements to appear before lower storeys finish.
    // Median Z represents the typical floor level of that storey.
    var storeyZvals = {};  // REAL (non-Unknown) storey name → [cz, cz, ...] — the §STOREY-Z anchor basis
    r[0].values.forEach(function(row) {
      var storey = row[3] || '_UNKNOWN';
      if (storey === '_UNKNOWN' || /^unknown$/i.test(storey)) return;
      var cz = row[5] || 0;
      if (!storeyZvals[storey]) storeyZvals[storey] = [];
      storeyZvals[storey].push(cz);
    });
    // Compute median Z per storey
    var storeyMedianZ = {};
    for (var sk in storeyZvals) {
      var vals = storeyZvals[sk].sort(function(a, b) { return a - b; });
      var mid = Math.floor(vals.length / 2);
      storeyMedianZ[sk] = vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
    }
    // Sort storeys by median Z → assign band index
    var storeyNames = Object.keys(storeyMedianZ).sort(function(a, b) {
      return storeyMedianZ[a] - storeyMedianZ[b];
    });
    var storeyBand = {};
    for (var si = 0; si < storeyNames.length; si++) storeyBand[storeyNames[si]] = si;

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
      if (storey !== '_UNKNOWN' && !/^unknown$/i.test(storey)) return storey;
      if (!storeyNames.length) return storey;
      var best = storeyNames[0], bd = Infinity;
      for (var ai = 0; ai < storeyNames.length; ai++) {
        var d = Math.abs(cz - storeyMedianZ[storeyNames[ai]]);
        if (d < bd) { bd = d; best = storeyNames[ai]; }
      }
      unknownReassigned++;
      return best;
    }

    // ── Build elements with storey-aware overrides ──
    var roofOverrides = 0;
    var elements = r[0].values.map(function(row) {
      var cls = row[1], rawStorey = row[3] || '_UNKNOWN', cz = row[5] || 0, bz = row[6] || 0;
      var cx = row[7] || 0, cy = row[8] || 0, bx = row[9] || 0, by = row[10] || 0;
      var storey = assignStoreyByZ(rawStorey, cz);  // §STOREY-Z
      var rule = matchRule(cls);
      var seq = rule.sequence, phase = rule.phase;

      // §A.1 Storey-aware override: slabs on "Roof" storey → Architecture/Roof seq 8
      if (/roof/i.test(storey) && cls === 'IfcSlab' && seq < 8) {
        seq = 8; phase = 'Architecture';
        roofOverrides++;
      }

      return {
        guid: row[0], cls: cls, name: row[2] || '', storey: storey,
        cz: cz, band: Math.floor(cz / 3),  // §S260e: Z-quantized band (3m = ~one floor)
        base_z: cz - bz / 2, top_z: cz + bz / 2,  // §gate: Z geometry (base = underside, top = where it tops out)
        x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2,  // §gate: XY footprint for the support gate
        seq: seq, phase: phase,
        resource: rule.resource || '_DEFAULT',
        installSecs: getInstallSecs(cls)
      };
    });
    if (unknownReassigned) console.log('§GANTT_STOREY_Z reassigned=' + unknownReassigned + ' no-storey elements to nearest real storey by median Z');
    if (roofOverrides) console.log('§GANTT_OVERRIDE ' + roofOverrides + ' roof slabs overridden to seq=8');

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
    // Round the clock — 24/7, no weekends
    var fullDayMs = 24 * 3600000;
    var rawDays = rawMs / fullDayMs;
    var scaleFactor = rawDays < 10 ? (10 * fullDayMs) / rawMs : 1;

    var projectDays = Math.max(10, Math.ceil(rawDays * scaleFactor));
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
    var _maxCrews = {};
    for (var _mcRes in LR) if (LR[_mcRes].max_crews) _maxCrews[_mcRes] = LR[_mcRes].max_crews;
    var _sched = (typeof ScheduleGate !== 'undefined' && ScheduleGate.computeSchedule)
      ? ScheduleGate.computeSchedule(elements, baseMs, scaleFactor, _maxCrews) : null;
    if (!_sched) { console.warn('§SUPPORT_CHECK ScheduleGate.js not loaded — generated 4D aborted'); return false; }

    // §S280h: ONE transaction + prepared statement (batched INSERTs — avoids the multi-second freeze).
    db.run('BEGIN');
    var _gStmt = db.prepare('INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES(?,?,?,?,?,0)');
    var _projEnd = baseMs;
    elements.forEach(function(el) {
      var s = _sched[el.guid] || { start: baseMs, end: baseMs + 60000 };
      _gStmt.run([s.start, 'ELEMENT_PLACE',
         JSON.stringify({phase:el.phase, cls:el.cls, name:el.name, storey:el.storey,
           resource:el.resource, _end_ts:s.end}),
         JSON.stringify([el.guid]), el.guid]);
      count++;
      if (s.end > _projEnd) _projEnd = s.end;
    });
    _gStmt.free();
    db.run('COMMIT');
    resourceCursor['_end'] = _projEnd;   // feed the endDate computation below (Math.max over values)

    // §SUPPORT_CHECK: independent XY-aware audit — NOTHING (beam/member/slab/furniture/MEP/wall)
    // may start before the structure UNDER its XY footprint finishes. 0 ⇒ nothing floats. Pre-fix
    // (Hospital): 84 beams + 765 members floated (Z-only) and 133 furniture + 1980 flow + 1156 walls
    // (ε=0.5 skipped the slab they sit on). Two-pass + ε=0.05 → 0.
    var _audit = function(e){ return e.cls === 'IfcBeam' || e.cls === 'IfcMember' || e.cls === 'IfcSlab' ||
      e.cls.indexOf('Furni') >= 0 || e.cls.indexOf('Wall') >= 0; };
    var _auditN = 0; for (var _bi = 0; _bi < elements.length; _bi++) if (_audit(elements[_bi])) _auditN++;
    var _float = ScheduleGate.auditFloating(elements, _sched, _audit);
    console.log('§SUPPORT_CHECK floating=' + _float + '/' + _auditN + ' (struct+furniture+walls over their XY support) gated=' + elements.length + ' (0=solved)');

    // §S260c BUG5: Log first 20 ops to verify bottom-up storey ordering
    var _first20 = [];
    try {
      var f20r = db.exec('SELECT timestamp, parameters FROM kernel_ops WHERE undone=0 ORDER BY timestamp LIMIT 20');
      if (f20r.length) {
        f20r[0].values.forEach(function(row) {
          var p = JSON.parse(row[1]);
          _first20.push(p.storey + '|band=' + storeyBand[p.storey || '_UNKNOWN'] + '|seq=' + (matchRule(p.cls).sequence) + '|' + p.cls);
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
    console.log('§GANTT injected=' + count + ' dbElements=' + totalDbElements +
      ' sceneMeshGUIDs=' + sceneGuids +
      ', bands=' + storeyNames.length + ', ' + projectDays + ' days, scale=' + scaleFactor.toFixed(2) +
      ', start=' + startDate.toLocaleDateString() + ' end=' + endDate.toLocaleDateString());

    // ── T3 §3.1/§3.3: overlay captured REAL dates + task names onto covered elements ──
    // The generative pass above already laid every element on the real-start epoch (baseMs).
    // Now patch the covered subset to their exact captured task window + real name, and flag
    // them _captured=1. Uncovered elements keep their generated timing (honest estimate).
    //
    // §PLAYBACK-STAGGER (2026-07-19, prompts/HOSPITAL_4D_SUPERSTRUCTURE_DURATION_ANOMALY.md
    // Item 8): assigning the task's window VERBATIM to every covered element made EVERY floor's
    // bar for a phase byte-identical — confirmed live (Hospital, all 8 Levels' Superstructure
    // showed 2026-01-31..2026-03-02) — "the gantt chart bars are the SAME", and during actual
    // playback the WHOLE phase pops into existence at once instead of an orderly, gradual reveal.
    // Real per-element Z data already exists (elements[], built above, same array the generative
    // pass sorts bottom-up) — bucket covered guids by task, sort each bucket bottom-up by cz (same
    // discipline as the generative pass), and linearly distribute them across the task's OWN
    // [w.s, w.e] window instead of collapsing them onto it. The phase's overall date range
    // (editable in the Schedule Author wizard, `tasks.schedule_start/finish`) is UNCHANGED — only
    // the per-element position WITHIN that window is now real-Z-ordered, not identical.
    _capActive = false; _coveredCount = 0; _coveragePct = 0;
    if (_cap) {
      var _covered = 0;
      var _elByGuid = {};
      elements.forEach(function(el) { _elByGuid[el.guid] = el; });
      var _byTask = {};
      var _allOps = db.exec("SELECT output_guid, parameters FROM kernel_ops WHERE op_type='ELEMENT_PLACE'");
      if (_allOps.length && _allOps[0].values.length) {
        _allOps[0].values.forEach(function(row) {
          var g = row[0], tid = _cap.guidTask[g];
          if (!tid) return;                         // uncovered → keep generative timing
          if (!_byTask[tid]) _byTask[tid] = [];
          _byTask[tid].push({ guid: g, params: row[1], cz: _elByGuid[g] ? _elByGuid[g].cz : 0 });
        });
      }
      db.run('BEGIN');
      var _upd = db.prepare("UPDATE kernel_ops SET timestamp = ?, parameters = ? " +
        "WHERE op_type = 'ELEMENT_PLACE' AND output_guid = ?");
      for (var _tid in _byTask) {
        var w = _cap.win[_tid];
        var _bucket = _byTask[_tid];
        _bucket.sort(function(a, b) { return a.cz - b.cz; });   // bottom-up, same discipline as generative pass
        var _n = _bucket.length, _span = Math.max(1, w.e - w.s);
        _bucket.forEach(function(item, i) {
          var s_i = w.s + Math.floor((i / _n) * _span);
          var e_i = (i + 1 < _n) ? (w.s + Math.floor(((i + 1) / _n) * _span)) : w.e;
          if (e_i <= s_i) e_i = s_i + 60000;   // never zero/negative duration
          var p; try { p = JSON.parse(item.params); } catch (e) { p = {}; }
          p.phase = w.name;                         // real task name → shows in mini-Gantt
          p._end_ts = e_i;
          p._captured = 1;                          // visual distinction + coverage flag
          p._task = _tid;
          _upd.run([s_i, JSON.stringify(p), item.guid]);
          _covered++;
        });
      }
      _upd.free();
      db.run('COMMIT');
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
  var _ganttTasksComputed = false; // log once flag

  var PHASE_COLORS = {
    'Substructure': '#7a8a8e',
    'Superstructure': '#5b7fa5',
    'MEP Rough-in': '#8bc34a',
    'Architecture': '#c07a4a',
    'MEP Final': '#ab47bc',
    'Finishes': '#26a69a'
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
    var building = (app && app.activeBuilding) || 'Hospital';
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
    var building = (app && app.activeBuilding) || 'Hospital';
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

  function drawGanttMini() {
    if (!_ops.length) return;
    var canvas = document.getElementById('tm-gantt-canvas');
    var box = document.getElementById('tm-gantt-box');
    if (!canvas || !box) return;

    // Group ops by storey|phase
    var groups = {};
    for (var i = 0; i < _ops.length; i++) {
      var op = _ops[i];
      var p = op.parameters || {};
      var storey = p.storey || '_UNKNOWN';
      var phase = p.phase || 'Architecture';
      var key = storey + '|' + phase;
      if (!groups[key]) groups[key] = { storey: storey, phase: phase, starts: [], ends: [], count: 0, cap: 0 };
      var g = groups[key];
      g.starts.push(op.start_ts);
      g.ends.push(op.end_ts);
      g.count++;
      if (p._captured) g.cap++;   // §gate: captured = preset IFC 4D (verbatim) — drives the yellow frame
    }

    // §GANTT_MINI_TRIM (2026-07-18, prompts/HOSPITAL_4D_SUPERSTRUCTURE_DURATION_ANOMALY.md Item 6
    // postscript 2): the bar's displayed span used to be the true min/max of every element in the
    // group. A small number of elements per floor (confirmed live on Hospital: ~0.5-1% of a given
    // storey's MEP Rough-in group) carry a real, present storey TAG that disagrees sharply with
    // their own extracted Z position (e.g. an IfcPipeFitting tagged "Level 5" but physically near
    // Z~164m, well below even Level 1's median 168.9 — most likely a riser/connector whose IFC
    // "Level" property reflects which floor's system it serves, not where it physically sits).
    // schedule_gate.js correctly gates these by their REAL geometric position, so they schedule
    // (correctly) to start almost immediately — but true min/max let that handful of outliers drag
    // the WHOLE floor's displayed bar down to "starts at day 0", making every floor's MEP bar look
    // like it starts at the same point even though the bulk of the work (Hospital Level 5: 99%+ of
    // 7,627 elements, median start day 258) is genuinely gradual and correctly staggered by floor.
    // Trim to the 2nd–98th percentile of REAL per-element start/end times for the bar's drawn span
    // — still real extracted data, just excluding the extreme 2% each side so a few mistagged
    // elements can't single-handedly define what the whole floor's bar looks like. Tiny groups
    // (n<=20) keep true min/max — percentile trimming is meaningless at that sample size.
    _ganttTasks = [];
    for (var k in groups) {
      var g = groups[k];
      g.starts.sort(function(a, b) { return a - b; });
      g.ends.sort(function(a, b) { return a - b; });
      var n = g.starts.length;
      if (n > 20) {
        var loI = Math.floor(n * 0.02), hiI = Math.min(n - 1, Math.ceil(n * 0.98) - 1);
        g.startTs = g.starts[loI];
        g.endTs = g.ends[hiI];
      } else {
        g.startTs = g.starts[0];
        g.endTs = g.ends[n - 1];
      }
      delete g.starts; delete g.ends;
      _ganttTasks.push(g);
    }

    // Sort by start time
    _ganttTasks.sort(function(a, b) { return a.startTs - b.startTs; });

    if (!_ganttTasksComputed) {
      console.log('§GANTT_MINI tasks=' + _ganttTasks.length);
      _ganttTasksComputed = true;
    }

    // Phase legend strip
    var legend = document.getElementById('tm-gantt-legend');
    if (legend && !legend.childElementCount) {
      var seenPhases = {};
      for (var li = 0; li < _ganttTasks.length; li++) {
        var lp = _ganttTasks[li].phase;
        if (!seenPhases[lp]) {
          seenPhases[lp] = true;
          var sp = document.createElement('span');
          sp.style.cssText = 'display:inline-flex;align-items:center;gap:2px';
          sp.innerHTML = '<span style="width:8px;height:8px;border-radius:1px;background:' +
            (PHASE_COLORS[lp] || '#888') + ';display:inline-block"></span>' + lp;
          legend.appendChild(sp);
        }
      }
    }

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

    var range = Math.max(1, _projectEnd - _projectStart);
    var prevStorey = '';

    // Draw bars
    for (var ti = 0; ti < numTasks; ti++) {
      var task = _ganttTasks[ti];
      var x = marginL + (task.startTs - _projectStart) / range * barW;
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

      ctx.globalAlpha = 0.8;
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

      // Label: first 3 chars of phase, only if bar wide enough
      if (w > 40) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(task.phase.substring(0, 3), x + w - 3, y + barH / 2);
      }
    }

    // Hairline cursor
    ctx.globalAlpha = 1;
    var hx = marginL + (_cursor - _projectStart) / range * barW;
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
    var range = Math.max(1, _projectEnd - _projectStart);
    var marginL = 60;
    var barW = cW - marginL;
    for (var i = 0; i < _ganttTasks.length; i++) {
      var task = _ganttTasks[i];
      var bx = marginL + (task.startTs - _projectStart) / range * barW;
      var bw = (task.endTs - task.startTs) / range * barW;
      if (bw < 2) bw = 2;
      var by = i * rowH + 2;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + barH) return task;
    }
    return null;
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
      var dailyRate = lr ? lr.rate_per_day * (lr.crew_size || 1) : 95;
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
  var _GANTT_CACHE_VERSION = 4;

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

  // ── Activate / Deactivate ──
  function setToolbarHighlight(on) {
    var btn = document.getElementById('time-machine-btn');
    if (btn) btn.style.background = on ? '#1a6b8a' : '#444';
  }

  function viewerStatus(msg) {
    var app = A();
    if (app && app.status) app.status.textContent = msg;
  }

  function activate() {
    if (_active) return;
    // Mobile merged meshes have no guid — re-stream as individual meshes
    var app = A();
    if (app && app._isMobile) {
      app._isMobile = false;
      var bld = app.activeBuilding;
      app.clearStreamed();
      if (bld) { app.streamBuilding(bld); }
      // Wait for re-stream to finish, then activate
      var _reWait = setInterval(function() {
        if (app.buildingsRendered && app.buildingsRendered.size > 0 && !app.streaming) {
          clearInterval(_reWait);
          activate();
        }
      }, 500);
      return;
    }
    setToolbarHighlight(true);
    _panel.style.display = 'flex';
    var st = document.getElementById('tm-status');
    if (st) st.textContent = 'Loading timeline...';

    // §S260c: Try IDB cache first, then kernel_ops table, then full recompute
    _activateAsync(st).then(function(ok) {
      if (!ok) { setToolbarHighlight(false); _panel.style.display = 'none'; return; }
    });
    return; // async continuation below
  }

  function _activateAsync(st) {
    return new Promise(function(resolve) {
    var app = A();

    // §S260c: Check IDB for cached Gantt JSON
    cacheGet('gantt').then(function(cachedOps) {
      // §S260e: Only use cache if it has ELEMENT_PLACE ops (not just picks)
      var _hasCachedPlaces = cachedOps && cachedOps.length > 0 &&
        cachedOps.some(function(o) { return o.op_type === 'ELEMENT_PLACE'; });
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
        _ops = loadOps();
        if (st) st.textContent = '';
        viewerStatus('Time Machine: ' + _ops.length + ' elements (cached)');
        _finishActivate(app);
        resolve(true);
        return;
      }

      // No cache — try loading existing kernel_ops
      _ops = loadOps();
      // §S260e: Only count ELEMENT_PLACE ops — ignore picks/other ops
      var _placeOps = _ops.filter(function(o) { return o.op_type === 'ELEMENT_PLACE'; });
      if (_placeOps.length && !_placeOps[0].parameters._end_ts) {
        try { app.db.run("DELETE FROM kernel_ops WHERE op_type = 'ELEMENT_PLACE'"); } catch(e) {}
        _placeOps = [];
        console.log('§TIME_MACHINE cleared stale unweighted ops — will re-inject');
      }
      if (_placeOps.length) { _ops = _placeOps; }
      console.log('§TM_OPS_CHECK total=' + _ops.length + ' place=' + _placeOps.length);

      if (!_placeOps.length) {
        if (st) st.textContent = 'Setting up 4D construction timeline...';
        viewerStatus('Time Machine: generating construction schedule...');
        if (!injectGantt()) {
          if (st) st.textContent = 'No elements found in database';
          viewerStatus('Time Machine: no elements found');
          console.log('§TIME_MACHINE no ops and no elements — nothing to show');
          resolve(false);
          return;
        }
        _ops = loadOps();
        if (!_ops.length) { resolve(false); return; }
        // §S260c: Cache the newly computed schedule to IDB
        cachePut('gantt', _ops);
        console.log('§GANTT_CACHE_SAVE ops=' + _ops.length);
        viewerStatus('Time Machine: ' + _ops.length + ' elements scheduled');
      }

      _finishActivate(app);
      resolve(true);
    }).catch(function(e) {
      console.warn('§GANTT_CACHE_ERR ' + e.message);
      // Fallback: compute without cache
      _ops = loadOps();
      if (!_ops.length) { injectGantt(); _ops = loadOps(); }
      if (_ops.length) { _finishActivate(app); resolve(true); }
      else resolve(false);
    });
    });
  }

  function _finishActivate(app) {
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
    // §S280: Don't force sun cycle — respect user's shadow/sky choice
    // User can toggle shadow (H) independently. TM just plays construction.
    console.log('§TM_SUN_INHERIT shadowOn=' + !!app._shadowOn + ' sky=' + !!app._sky + ' sunCycle=user-choice');
    console.log('§TM_SHADOW_INHERIT shadowOn=' + !!app._shadowOn + ' groundVisible=' + (app.ground ? app.ground.visible : 'n/a'));
    computeDays();
    saveVisibility();
    // §S262: DLOD runs independently — camera distance drives promote/demote, TM drives visibility. No pause needed.
    console.log('§MOBILE_TM_TOGGLE method=setVisibleAt|setMatrixAt mobile=' + !!app._isMobile + ' dlod=' + !!app._useDlodPath);
    _cursor = _projectEnd;
    _anchorDay = _days.length ? _days[_days.length - 1] : null;
    _anchorHr = 15;
    _panel.style.display = 'flex';
    switchMode('DAY');
    renderAtTime(_cursor); // §S260c: initial render so Gantt + status populate immediately
    updateStatus();
    if (_ganttVisible) drawGanttMini();
    if (_dashVisible) drawDashboard();
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
    _evMesh = null; _evSig = ''; _incrPrimed = false;   // §PERF_INCR: drop the event index
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
    _ganttTasksComputed = false;
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
    restoreVisibility();
    // §S262: DLOD runs independently — no pause/resume needed
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
            _cursor = _projectStart;
            renderAtTime(_cursor);
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
      _cursor = s;
      renderAtTime(_cursor);
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
      _cursor = op.end_ts;                       // the instant it lands → present in the scene, the lead frontier
      renderAtTime(_cursor);
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
      var mode;
      if (isFinite(s)) { _cursor = s; mode = 'phase'; }
      else {                                                             // mode=projected: order finish → axis position
        var frac = 0.5;
        if (isFinite(info.spanMin) && isFinite(info.spanMax) && info.spanMax > info.spanMin && isFinite(info.end))
          frac = Math.max(0, Math.min(1, (info.end - info.spanMin) / (info.spanMax - info.spanMin)));
        _cursor = _projectStart + frac * (_projectEnd - _projectStart);
        mode = 'projected';
      }
      renderAtTime(_cursor);
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
    return { active: _active, cursor: _cursor };
  };

  // §PHASE_LENS exposure: let other modules (Find panel Phase axis) lazily
  // trigger the REAL timeline generator. Does NOT alter injectGantt's logic —
  // just exposes it. Returns its boolean (count>0 / false); callers cache.
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
  // Test hook: simulate a playback tick (small cursor advance + roll bump) so a probe can exercise
  // the incremental (delta) path deterministically without the cinema UI. Diagnostic only.
  window.__tmStep = function (dms) { if (!_active) return null; _gspRoll++;
    renderAtTime(Math.min(_projectEnd, _cursor + (dms || 3600000))); return window.__tmTrav; };
})();
