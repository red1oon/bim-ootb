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
  var _ganttTasks = [];  // computed task groups for click detection
  var _sCurveData = null;  // cached S-curve points (computed once)

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
        obj.material.transparent = obj._cinePeelTransparent;
        obj.material.opacity = obj._cinePeelOpacity;
        obj.material.needsUpdate = true;
        delete obj._cinePeeled;
        delete obj._cinePeelOpacity;
        delete obj._cinePeelTransparent;
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
  var _tmEdgeGeo = null;  // §S260f: shared 3m EdgesGeometry for frontier boxes
  var _tmEdgeCyan = null; // §S260f: shared cyan material
  var _tmEdgeOrange = null; // §S260f: shared orange material
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

  function renderAtTime(cursorMs) {
    var app = A();
    if (!app || !app.scene) return;
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
      }
    }

    // §S260d: Whitebox material state logger — module-level counter persists across ticks
    function _wbMat(tag, obj) {
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

    app.scene.traverse(function(obj) {
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
        var _bmM4 = new THREE.Matrix4();
        var _bmPos = new THREE.Vector3();
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
              if (_camFollow) {
                _frontierPositions.push(_bmPos.clone());
                _guidPosMap[bg] = _bmPos.clone();
              }
              // §S260f: Edge box at frontier position — 3m, cyan/orange, depthTest:false
              // §S260f: Shared geometry + shared materials — no allocation per tick
              if (!_isMobileTM) {
                if (!_tmEdgeGeo) _tmEdgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(3, 3, 3));
                if (!_tmEdgeCyan) _tmEdgeCyan = new THREE.LineBasicMaterial({ color: 0x44ffff, depthTest: false });
                if (!_tmEdgeOrange) _tmEdgeOrange = new THREE.LineBasicMaterial({ color: 0xff8c00, depthTest: false });
                var _ft = frontier[bg].t;
                var _el = new THREE.LineSegments(_tmEdgeGeo, _ft < 0.15 ? _tmEdgeCyan : _tmEdgeOrange);
                _el.position.copy(_bmPos);
                _el.renderOrder = 10;
                _el.userData._isTmFrontier = true;
                app.scene.add(_el);
                _outlineMeshes.push(_el);
              }
            } else if (_camFollow && _previewGuids && _previewGuids[bg]) {
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
            if (frontier[ig]) anyFrontier = true;
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

    // ── Shadow promotion pass: nearby placed meshes → castShadow (cap 500) ──
    // §S260b: Only when Sunglass shadow is ON
    if (app._shadowOn && _frontierCentroids.length && _shadowCasters < 500) {
      var maxExtra = 500 - _shadowCasters;
      var stride = Math.max(1, Math.floor(_placedMeshes.length / 1000));
      for (var spi = 0; spi < _placedMeshes.length && maxExtra > 0; spi += stride) {
        var sobj = _placedMeshes[spi];
        var sowp = new THREE.Vector3();
        sobj.getWorldPosition(sowp);
        for (var si = 0; si < _frontierCentroids.length; si++) {
          if (sowp.distanceToSquared(_frontierCentroids[si]) < 400) {
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
        var ray = new THREE.Raycaster();
        var dir = new THREE.Vector3().subVectors(tgtPos, camPos).normalize();
        var dist = camPos.distanceTo(tgtPos);
        ray.set(camPos, dir);
        ray.far = dist * 0.9; // only hide things between cam and 90% of target
        var meshes = [];
        app.scene.traverse(function(o) { if (o.isMesh && o.visible) meshes.push(o); });
        var hits = ray.intersectObjects(meshes, false);
        // Hide up to 5 obstructing meshes (walls, slabs blocking the view)
        for (var hi = 0; hi < Math.min(hits.length, 5); hi++) {
          var obj = hits[hi].object;
          if (obj.userData && obj.userData.guid) {
            obj._cinePeeled = true;
            obj._cinePeelOpacity = obj.material.opacity;
            obj._cinePeelTransparent = obj.material.transparent;
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
          var openOff = new THREE.Vector3().subVectors(_cineOpenStart, _cineOpenTarget);
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
              var pushDir = new THREE.Vector3().subVectors(app.camera.position, target).normalize();
              app.camera.position.copy(target).addScaledVector(pushDir, minDist);
              camDist = minDist;
            }
            var diff = camDist - desiredDist;
            if (Math.abs(diff) > 0.5) {
              var spd = diff > 0 ? 0.08 : 0.04;
              var dir = new THREE.Vector3().subVectors(target, app.camera.position).normalize();
              app.camera.position.addScaledVector(dir, diff * spd);
            }
          }

          // Slow orbit
          if (_playing && _userIdle) {
            var orbitSpd = sc.type === 'hero' ? (Math.PI * 2 / _BEAT_CLOSEUP) : 0.006;
            _camAngle += orbitSpd;
            var camOff = new THREE.Vector3().subVectors(app.camera.position, target);
            var dist2D = Math.sqrt(camOff.x * camOff.x + camOff.z * camOff.z);
            var curAz = Math.atan2(camOff.z, camOff.x);
            camOff.x = Math.cos(curAz + orbitSpd) * dist2D;
            camOff.z = Math.sin(curAz + orbitSpd) * dist2D;
            app.camera.position.copy(target).add(camOff);
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
        var bldCenter = new THREE.Vector3(0, 10, 0);
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
          var dir = new THREE.Vector3().subVectors(app.camera.position, target).normalize();
          app.camera.position.addScaledVector(dir, (wideDesired - camDist) * 0.04);
        }
        if (_playing && (nowPerf - _camUserInteracted > 2000)) {
          _camAngle += 0.012;
          var camOff = new THREE.Vector3().subVectors(app.camera.position, target);
          var dist2D = Math.sqrt(camOff.x * camOff.x + camOff.z * camOff.z);
          var curAz = Math.atan2(camOff.z, camOff.x);
          camOff.x = Math.cos(curAz + 0.012) * dist2D;
          camOff.z = Math.sin(curAz + 0.012) * dist2D;
          app.camera.position.copy(target).add(camOff);
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

    applySunCycle(cursorMs);
    if (_ganttVisible) drawGanttMini();
    if (_dashVisible) drawDashboard();

    if (app.markDirty) app.markDirty();
    // Force immediate render — mobile browsers defer rAF until touch
    if (app.renderer && app.scene && app.camera) app.renderer.render(app.scene, app.camera);
    updateStatus();
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

    // Save original sky color once
    if (_savedClearColor === null && app.renderer) {
      _savedClearColor = app.renderer.getClearColor(new THREE.Color()).getHex();
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
    var azDeg = (azimuth * 0.5 + 0.5) * 360;
    // Always move sun — shadows must track every tick
    var phi = (90 - elDeg) * Math.PI / 180;
    var theta = azDeg * Math.PI / 180;
    var sx = Math.sin(phi) * Math.cos(theta);
    var sy = Math.cos(phi);
    var sz = Math.sin(phi) * Math.sin(theta);
    app.sun.position.set(sx * 5000, sy * 5000, sz * 5000);
    // Sky shader visual — throttled
    if (!applySunCycle._count) applySunCycle._count = 0;
    applySunCycle._count++;
    if (app._sky && app._sky.visible && applySunCycle._count % 10 === 0) {
      app._sky.material.uniforms['sunPosition'].value.set(sx, sy, sz);
    }

    // Smooth lighting — intensity follows day/night
    app.sun.intensity = 0.05 + dayFactor * 4.4;
    if (app.ambient) app.ambient.intensity = 0.15 + dayFactor * 0.6;
    if (app.hemi) app.hemi.intensity = 0.1 + dayFactor * 1.1;
  }

  function restoreSky() {
    var app = A();
    if (!app) return;
    // §S276b: Hide Sky and restore default state
    app._sunCycleActive = false;
    if (app._sky && !app._shadowOn) app._sky.visible = false;  // keep sky if shadows still on
    if (app.updateSky) app.updateSky(45, 180);
    if (app.renderer && _savedClearColor !== null) {
      app.renderer.setClearColor(_savedClearColor);
    }
    _savedClearColor = null;
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
    // §S260c v2: Cinematic slowdown during close-up — each element gets visible screen time
    // Outline forms, dust/sparks play out (~1.2s per element at 80ms/tick = 15 ticks)
    // §S260e: Opening = construction plays while camera orbits wide for context
    // §S260f: DAY/HR/MIN mode always respected — drone uses same speed as manual playback
    if (_mode === 'DAY') return 3600000;  // 1 hour per tick (24 ticks = 1 day)
    if (_mode === 'HR') return 60000;     // 1 minute per tick (60 ticks = 1 hour)
    return 10000;                         // 10 seconds per tick (fine grain)
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
      // Save InstancedMesh state (visibility + all matrices)
      if (obj.isInstancedMesh && app._instanceMeta && app._instanceMeta[obj.id]) {
        var metas = app._instanceMeta[obj.id];
        var matrices = {};
        var tmpM = new THREE.Matrix4();
        for (var i = 0; i < metas.length; i++) {
          obj.getMatrixAt(i, tmpM);
          matrices[i] = tmpM.clone();
        }
        _savedInstanceState[obj.id] = { vis: obj.visible, matrices: matrices, obj: obj };
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
    // Restore InstancedMesh matrices and visibility from saved state
    for (var meshId in _savedInstanceState) {
      var state = _savedInstanceState[meshId];
      var obj = state.obj;
      for (var idx in state.matrices) {
        obj.setMatrixAt(parseInt(idx), state.matrices[idx]);
      }
      obj.instanceMatrix.needsUpdate = true;
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
      'width:340px;user-select:none;touch-action:none;';

    _panel.innerHTML =
      '<div style="display:flex;align-items:center;width:100%;cursor:grab" class="tm-drag">' +
        '<button id="tm-share" style="font-size:9px;padding:2px 6px" title="Copy shareable link">&#x1F517; Share</button>' +
        '<button id="tm-sun" style="font-size:14px;padding:4px 8px;min-width:32px;min-height:32px" title="Day/night cycle"><span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:linear-gradient(90deg,#fff 50%,#222 50%);vertical-align:middle"></span></button>' +
        '<button id="tm-eye" style="padding:2px 6px;min-width:36px;min-height:36px;background:#888" title="Drone Pilot — cinematic camera"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2"/><circle cx="12" cy="12" r="3"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M12 2v4"/><path d="M12 18v4"/></svg></button>' +
        '<button id="tm-gantt" style="font-size:12px;padding:2px 6px" title="Gantt chart">&#x1F4CA;</button>' +
        '<button id="tm-dash" style="font-size:12px;padding:2px 6px" title="Dashboard">&#x1F4CB;</button>' +
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
    document.getElementById('tm-share').addEventListener('pointerup', function(e) {
      e.stopPropagation();
      var url = new URL(location.href);
      url.searchParams.set('tm', 'play');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url.toString());
        var sb = document.getElementById('tm-share');
        if (sb) { sb.textContent = 'Copied!'; setTimeout(function(){ sb.innerHTML = '&#x1F517; Share'; }, 1500); }
      }
      viewerStatus('4D playback link copied to clipboard');
      console.log('§TIME_MACHINE share URL: ' + url.toString());
    });
    document.getElementById('tm-sun').addEventListener('pointerup', function(e) {
      e.stopPropagation();
      var app = A();
      if (!app) return;
      _sunCycle = !_sunCycle;
      var btn = document.getElementById('tm-sun');
      if (btn) btn.classList.toggle('tm-active', _sunCycle);
      if (_sunCycle) applySunCycle(_cursor);
      else restoreSky();
      var app = A();
      if (app && app.renderer && app.scene && app.camera) app.renderer.render(app.scene, app.camera);
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
        tip.textContent = bar.storey + ' \u2014 ' + bar.phase + ' (' + bar.count + ' elements, Day ' + dayStart + '\u2013' + dayEnd + ')';
        tip.style.left = Math.min(e.offsetX + 8, e.target.clientWidth - 200) + 'px';
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
  function TICK_MS() { return _isLargeBuilding ? 600 : 240; }  // §S276b: 3x slower — sun/shadow needs time to be visible

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
    var rb = document.getElementById('tm-rev-btn');
    var fb = document.getElementById('tm-fwd-btn');
    if (rb) { rb.textContent = '\u25C0'; rb.classList.remove('tm-active'); }
    if (fb) { fb.textContent = '\u25B6'; fb.classList.remove('tm-active'); }
    anchorFromCursor();
    configSlider();
  }

  function playTick() {
    if (!_playing) return;

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
        'COALESCE(t.center_z, 0) as cz ' +
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
    var storeyZvals = {};  // storey name → [cz, cz, ...]
    r[0].values.forEach(function(row) {
      var storey = row[3] || '_UNKNOWN';
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

    // ── Build elements with storey-aware overrides ──
    var roofOverrides = 0;
    var elements = r[0].values.map(function(row) {
      var cls = row[1], storey = row[3] || '_UNKNOWN', cz = row[5] || 0;
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
        seq: seq, phase: phase,
        resource: rule.resource || '_DEFAULT',
        installSecs: getInstallSecs(cls)
      };
    });
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
    var baseMs = startDate.getTime();

    // ── Schedule ──
    var resourceCursor = {};  // "resource|band" → next ms
    var bandSeqDone    = {};  // "band|seq"      → end ms
    var bandDone       = {};  // band (int)      → end ms (structural seq 1-4)
    var count = 0;

    // §S260c v2: TWO-PASS scheduling — structural first (all bands), then non-structural.
    // This ensures bandDone[] is fully populated before any MEP/finishes are scheduled.
    // Pass 1: structural (seq 1-4) = foundations, columns, beams, slabs
    // Pass 2: non-structural (seq > 4) = MEP, architecture, finishes
    var structuralElements = elements.filter(function(el) { return el.seq <= 4; });
    var nonStructuralElements = elements.filter(function(el) { return el.seq > 4; });

    // Pass 1: Schedule all structural
    structuralElements.forEach(function(el) {
      var rcKey = el.resource + '|' + el.band;
      var earliest = resourceCursor[rcKey] || baseMs;

      // Phase dependency within band
      for (var ps = 1; ps < el.seq; ps++) {
        var pk = el.band + '|' + ps;
        if (bandSeqDone[pk] && bandSeqDone[pk] > earliest) earliest = bandSeqDone[pk];
      }

      // Z dependency: structural on band N waits for structural on band N-1
      if (el.band > 0) {
        var belowDone = bandDone[el.band - 1];
        if (belowDone && belowDone > earliest) earliest = belowDone;
      }

      var durMs = Math.round(el.installSecs * scaleFactor * 1000);
      var endMs = earliest + durMs;

      db.run(
        'INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES(?,?,?,?,?,0)',
        [earliest, 'ELEMENT_PLACE',
         JSON.stringify({phase:el.phase, cls:el.cls, name:el.name, storey:el.storey,
           resource:el.resource, _end_ts:endMs}),
         JSON.stringify([el.guid]), el.guid]
      );
      count++;

      resourceCursor[rcKey] = endMs;
      var seqKey = el.band + '|' + el.seq;
      if (!bandSeqDone[seqKey] || endMs > bandSeqDone[seqKey]) bandSeqDone[seqKey] = endMs;
      if (!bandDone[el.band] || endMs > bandDone[el.band]) bandDone[el.band] = endMs;
    });

    // §S260c: Compute earliest structural completion across ANY band.
    // Non-structural on bands with no structural must still wait for at least ONE
    // storey's frame to be erected before MEP can start anywhere.
    var earliestStructDone = Infinity;
    for (var bdk in bandDone) {
      if (bandDone[bdk] < earliestStructDone) earliestStructDone = bandDone[bdk];
    }
    if (earliestStructDone === Infinity) earliestStructDone = baseMs; // no structural at all
    console.log('§GANTT_PASS1 structural=' + structuralElements.length +
      ' bandDone_keys=' + Object.keys(bandDone).length +
      ' earliestStructDone=day' + Math.round((earliestStructDone - baseMs) / 86400000));

    // Pass 2: Schedule non-structural (MEP, Architecture, Finishes)
    // Now bandDone[] is fully populated — non-structural waits for its band's structural.
    nonStructuralElements.forEach(function(el) {
      var rcKey = el.resource + '|' + el.band;
      var earliest = resourceCursor[rcKey] || baseMs;

      // Phase dependency within band
      for (var ps = 1; ps < el.seq; ps++) {
        var pk = el.band + '|' + ps;
        if (bandSeqDone[pk] && bandSeqDone[pk] > earliest) earliest = bandSeqDone[pk];
      }

      // Must wait for structural on same band or nearest lower band.
      // If no bandDone found walking down, use earliestStructDone (any band).
      var foundStruct = false;
      for (var wb = el.band; wb >= 0; wb--) {
        if (bandDone[wb]) {
          if (bandDone[wb] > earliest) earliest = bandDone[wb];
          foundStruct = true;
          break;
        }
      }
      if (!foundStruct && earliestStructDone > earliest) {
        earliest = earliestStructDone; // wait for at least ONE band's structural
      }

      var durMs = Math.round(el.installSecs * scaleFactor * 1000);
      var endMs = earliest + durMs;

      db.run(
        'INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES(?,?,?,?,?,0)',
        [earliest, 'ELEMENT_PLACE',
         JSON.stringify({phase:el.phase, cls:el.cls, name:el.name, storey:el.storey,
           resource:el.resource, _end_ts:endMs}),
         JSON.stringify([el.guid]), el.guid]
      );
      count++;

      resourceCursor[rcKey] = endMs;
      var seqKey = el.band + '|' + el.seq;
      if (!bandSeqDone[seqKey] || endMs > bandSeqDone[seqKey]) bandSeqDone[seqKey] = endMs;
    });

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
      if (!groups[key]) groups[key] = { storey: storey, phase: phase, startTs: op.start_ts, endTs: op.end_ts, count: 0 };
      var g = groups[key];
      if (op.start_ts < g.startTs) g.startTs = op.start_ts;
      if (op.end_ts > g.endTs) g.endTs = op.end_ts;
      g.count++;
    }

    // Convert to array and sort by start time
    _ganttTasks = [];
    for (var k in groups) _ganttTasks.push(groups[k]);
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

  function computeSCurve() {
    if (!_ops.length) { _sCurveData = []; return; }
    var totalDays = Math.max(1, Math.round((_projectEnd - _projectStart) / 86400000));
    var points = [];
    var step = Math.max(1, Math.floor(totalDays / 50));
    for (var d = 0; d <= totalDays; d += step) {
      var ts = _projectStart + d * 86400000;
      var done = 0;
      for (var i = 0; i < _ops.length; i++) { if (_ops[i].end_ts <= ts) done++; }
      points.push({ day: d, pct: done / _ops.length * 100 });
    }
    _sCurveData = points;
  }

  function drawSCurve() {
    var canvas = document.getElementById('tm-dash-scurve');
    if (!canvas || !_sCurveData || !_sCurveData.length) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    var totalDays = Math.max(1, _sCurveData[_sCurveData.length - 1].day);

    // Draw curve
    ctx.beginPath();
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 2;
    for (var i = 0; i < _sCurveData.length; i++) {
      var pt = _sCurveData[i];
      var x = pt.day / totalDays * w;
      var y = h - (pt.pct / 100 * h);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(79,195,247,0.1)';
    ctx.fill();

    // Current position dot
    var curDay = Math.max(0, (_cursor - _projectStart) / 86400000);
    var curDone = 0;
    for (var ci = 0; ci < _ops.length; ci++) { if (_ops[ci].end_ts <= _cursor) curDone++; }
    var curPct = curDone / _ops.length * 100;
    var dx = curDay / totalDays * w;
    var dy = h - (curPct / 100 * h);
    ctx.beginPath();
    ctx.arc(dx, dy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff8c00';
    ctx.fill();
  }

  // ══════════════════════════════════════════════════════════════════
  // §S260c: JSON CACHE — persist Gantt schedule + Movie Script in IDB
  // Keys: "gantt:{building}" and "movie:{building}"
  // Same IDB store as DB file cache. Tiny (100-500KB) vs DB files (10-170MB).
  // Clear Cache on landing deletes entire IDB → next session recomputes.
  // ══════════════════════════════════════════════════════════════════

  function _cacheKey(prefix) {
    var app = A();
    var bld = (app && app.activeBuilding) || 'unknown';
    return prefix + ':' + bld;
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
    _isLargeBuilding = (app.activeBuildingTotal || 0) > LARGE_BUILDING;
    if (_isLargeBuilding) console.log('§S259_TM_LITE elements=' + app.activeBuildingTotal + ' — sparks/sunCycle disabled (>50K)');
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
    console.log('§TIME_MACHINE ON — ' + _ops.length + ' ops, ' + _days.length + ' days, ' +
      'project: ' + new Date(_projectStart).toLocaleDateString() + ' → ' + new Date(_projectEnd).toLocaleDateString());
  }

  function deactivate() {
    if (!_active) return;
    stopPlayback();
    clearSparks();
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
    _ganttTasks = [];
    _ganttTasksComputed = false;
    var ganttBtn = document.getElementById('tm-gantt');
    if (ganttBtn) ganttBtn.classList.remove('tm-active');
    var ganttBox = document.getElementById('tm-gantt-box');
    if (ganttBox) ganttBox.classList.remove('open');
    toggleDashDOM(false);
    _active = false;
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

    // S265: TM button is now in icon pill — no longer injected into overflow
    // var toolbar = document.querySelector('#search-body > div');

    setTimeout(hookCommitOp, 2000);

    // URL param: ?tm=1 (open time machine) or ?tm=play (open + auto-play forward)
    var tmParam = new URLSearchParams(location.search).get('tm');
    if (tmParam) {
      // Wait for DB to load before activating
      var _tmWait = setInterval(function() {
        var app = A();
        if (app && app.db && app.scene && app.buildingsRendered && app.buildingsRendered.size > 0 && !app.streaming) {
          clearInterval(_tmWait);
          activate();
          if (tmParam === 'play') {
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

  // S265 Phase 3: Expose TM state for share URL
  window.tmGetState = function() {
    return { active: _active, cursor: _cursor };
  };
})();
