// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// tour.js — Fly around, cinematic tour, walk-through engine, path building
function setupTour(A) {
  // FLY_TOUR_CORRIDOR_GRAPH.md — build banner: proves which tour build a tab is running.
  console.log('[TOUR] §TOUR_VERSION v17 (timeline-scrub + highlight-first + SUSPECT_OPEN + wall-legal room-spine bridge — FLY_TOUR_CORRIDOR_GRAPH.md)');

  A.toggleFlyAround = function() {
    const btn = document.getElementById('fly-btn');  // §S280: may be null (pill removed button)

    if (A.walkMode) {
      A.walkMode = false;
      A.walkLastTime = 0;
      A.flyActive = false;
      if (btn) btn.classList.remove('active');
      A.status.textContent = `Walk paused at action ${A.walkActionIdx}/${A.walkActions.length} — tap ✈ to resume`;
      A.wlog(`PAUSED at action ${A.walkActionIdx}`);
      return;
    }

    if (A.walkActions && A.walkActions.length > 0 && A.walkActionIdx > 0) {
      A.walkMode = true;
      A.flyActive = true;
      A.walkLastTime = 0;
      if (A.markDirty) A.markDirty(); // §IDLE-PARK: revive the rAF chain on programmatic resume
      if (btn) btn.classList.add('active');
      var _speedBtn = document.getElementById('walk-speed-btn');
      if (_speedBtn) _speedBtn.style.display = '';
      A.status.textContent = `Walk resumed at action ${A.walkActionIdx}/${A.walkActions.length}`;
      A.wlog(`RESUMED at action ${A.walkActionIdx}`);
      return;
    }

    A.flyActive = !A.flyActive;
    if (btn) btn.classList.toggle('active', A.flyActive);
    if (A.flyActive && A.markDirty) A.markDirty(); // §IDLE-PARK: revive the rAF chain (a parked
    // loop only wakes on input events — a programmatic toggle would otherwise never tick)

    if (A.flyActive) {
      // FLY_TOUR_CORRIDOR_GRAPH.md §S1 — async prepare BEFORE building the tour: lazy-load the
      // navigate stack (RoomGraph + HallwayBackbone + navigate_find's ensureRooms/getRoomGraph)
      // and auto-inject compiled rooms when the building has none. Falls through to the legacy
      // centroid tour on any failure — never blocks the fly button.
      if (A._flyPreparing) return;
      A._flyPreparing = true;
      A.status.textContent = 'Preparing tour…';
      // §TOUR_CACHE fast path (TOUR_ROUTE_CACHE.md): a cached route makes the whole prepare —
      // loadNavigate + ensureRooms + the §THIN-GRAPH-RECURE probe (which runs the FULL route
      // builder every activation, the actual repeat-click cost on LTU) — unnecessary: the
      // finished action array is already stored. Only §STREAM-FIRST still applies (touring
      // mid-stream tours placeholder bboxes and starves the promote pipeline — user doctrine
      // 2026-07-16). Cache-key mismatch or parse failure falls through to the full prepare.
      var _ckPeek = null;
      try { _ckPeek = _tourCacheKey(); } catch (e) {}
      var _decide = function(json) {
        var cachedTour = null;
        if (json) { try { cachedTour = JSON.parse(json); } catch (e) { cachedTour = null; } }
        if (Array.isArray(cachedTour) && cachedTour.length >= 1) {
          (async function() {
            let _sw = 0;
            while (A.streaming && A.flyActive) { await new Promise(function(r) { setTimeout(r, 500); }); _sw += 500; }
            if (_sw) console.log('[TOUR] §FLY_STREAM_WAIT ms=' + _sw);
            A._flyPreparing = false;
            if (!A.flyActive) return; // user toggled off while waiting
            console.log('[TOUR] §TOUR_CACHE fast-path (prepare skipped)');
            A._tourCachedRoute = { key: _ckPeek, tour: cachedTour }; // consumed by _startFlyTour
            A._startFlyTour(btn);
          })();
        } else {
          A._prepareGraphTour().then(function() {
            A._flyPreparing = false;
            if (!A.flyActive) return; // user toggled off while preparing
            A._startFlyTour(btn);
          });
        }
      };
      if (_ckPeek) _tourCacheFetch(_ckPeek).then(_decide, function() { _decide(null); });
      else _decide(null);
      return;
    } else {
      A.status.textContent = 'Fly stopped.';
      document.getElementById('walk-speed-btn').style.display = 'none';
      if (A._scrubHide) A._scrubHide();   // §TOUR_TIMELINE_SCRUB — bar lives exactly as long as the tour
    }
  };

  // §S1 — the awaited pre-step. Never throws; §FLY_INJECT logs what happened.
  A._prepareGraphTour = async function() {
    try {
      // §STREAM-FIRST (user 2026-07-16: tour "switching to Alt-X bbxes"): those are streaming
      // placeholder bboxes — elements not yet promoted to real geometry. Flying mid-stream tours
      // a box model and starves the promote pipeline. Wait for streaming to drain first (the
      // status bar keeps showing live progress; toggling fly off aborts the wait).
      let _streamWaited = 0;
      while (A.streaming && A.flyActive) {
        await new Promise(function(r) { setTimeout(r, 500); });
        _streamWaited += 500;
      }
      if (_streamWaited) console.log('[TOUR] §FLY_STREAM_WAIT ms=' + _streamWaited);
      if (!A.flyActive) return;
      if (A.loadNavigate) await A.loadNavigate();
      if (A.ensureRooms) {
        const res = await A.ensureRooms();
        console.log('[TOUR] §FLY_INJECT bld=' + (A.activeBuilding || '') +
          ' status=' + (res && res.status) + ' source=' + ((res && res.source) || 'none') +
          ' rooms=' + (res && res.rooms != null ? res.rooms : '-'));
      }
      // §THIN-GRAPH-RECURE (2026-07-17, third independent live report): rooms can be present,
      // in-frame AND compiler-owned yet still route-thin — a stale weak compile persisted in
      // IDB that neither the presence check nor §PATCH-FRAME-GUARD can fault. Probe the route
      // once; if it rejects and EVERY room is compiler-owned (RM_ prefix — real IfcSpace
      // extractions are never touched), re-cure with the current walker (skipPatch: the patch
      // is what produced these rooms) and let buildTour rebuild on the fresh set. One attempt,
      // no loop — the inject mechanism exists to cure poor data (user doctrine).
      try {
        if (A.flyActive && A.ensureRooms && A.getRoomGraph && window.RoomGraph) {
          let probe = null;
          try { probe = A._buildGraphRoute(A._tourStoreyZ()); } catch (ep) { probe = null; } // §FLY_PLAN_DEDUPE: same key as buildTour → its pass reuses this one
          if (!probe) {
            let compiledOnly = false;
            try {
              const r = A.db.exec("SELECT COUNT(*), COUNT(CASE WHEN guid LIKE 'RM\\_%' ESCAPE '\\' THEN 1 END)" +
                " FROM spatial_structure WHERE type='IfcSpace'");
              const t = r.length ? r[0].values[0][0] : 0, c = r.length ? r[0].values[0][1] : 0;
              compiledOnly = t > 0 && t === c;
            } catch (ec) { /* compiledOnly stays false */ }
            if (compiledOnly) {
              const rc = await A.ensureRooms({ force: true, skipPatch: true });
              console.log('[TOUR] §FLY_RECURE status=' + (rc && rc.status) +
                ' source=' + ((rc && rc.source) || '-') +
                ' rooms=' + (rc && rc.rooms != null ? rc.rooms : '-'));
              if (A._tourCacheBust) A._tourCacheBust(); // §TOUR_CACHE: recompiled rooms invalidate any cached route
            }
          }
        }
      } catch (er) { console.warn('[TOUR] §FLY_RECURE_ERR ' + (er && er.message)); }
    } catch (e) {
      console.warn('[TOUR] §FLY_PREP_ERR ' + (e && e.message));
    }
  };

  // §TOUR_CACHE (prompts/TOUR_ROUTE_CACHE.md): the graph route + door-legality pass is the slow
  // part of Fly Tour on big buildings (minutes on LTU 122k). The finished action array is plain
  // JSON (coords + durations, no live object refs), so cache it per building. Key carries:
  // §TOUR_VERSION (route algorithm changes bust it), element/door/room counts from the DB (a new
  // extraction or a room recompile busts it), and the rendered-building-set size (city tours append
  // extra orbit actions — a different set must not replay a single-building route).
  // ⚠ LOCKSTEP WITH §TOUR_VERSION — bumping the banner without bumping THIS silently replays the
  // OLD route from IDB for every user who toured that building before the deploy. Missed on the
  // §HL-FIRST ship (banner → v13, this stayed v12); the user's live Hospital log caught it
  // (§TOUR_CACHE store … key=…:v12:…). The key's other components are DB counts — they bust on a
  // re-extraction or room recompile, never on a code change. This constant is the ONLY thing that
  // invalidates a cached route when the routing ALGORITHM changes.
  var TOUR_CACHE_VER = 'v16'; // keep in lockstep with the §TOUR_VERSION banner above
  function _tourCacheKey() {
    try {
      var r = A.db.exec(
        "SELECT (SELECT COUNT(*) FROM elements_meta)," +
        " (SELECT COUNT(*) FROM elements_meta WHERE ifc_class IN ('IfcDoor','IfcDoorStandardCase'))," +
        " (SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace')");
      var v = r.length ? r[0].values[0] : [];
      // max(1,…): the rendered-set populates async during load — sizes 0 and 1 are both
      // "single building" semantics and must produce the SAME key (witnessed miss, 2026-07-20).
      return 'tmTourCache:' + (A.activeBuilding || '') + ':' + TOUR_CACHE_VER + ':' +
        v.join('-') + ':' + Math.max(1, A.buildingsRendered.size);
    } catch (e) { return null; }
  }
  // §TOUR_CACHE_IDB (TOUR_ROUTE_CACHE.md §5, 2026-07-21): localStorage on the shared github.io
  // origin is quota-starved by OTHER apps' keys (op-logs etc.) — §4's evict only reclaims tour
  // keys (observed live: removed=0) so on a full origin the cache NEVER stored and Fly re-planned
  // every press. IndexedDB has a per-origin quota orders of magnitude larger and survives page
  // refresh; localStorage is now READ-ONLY legacy (a hit migrates to IDB and frees the LS key).
  var _tourIdbP = null;
  function _tourIdb() {
    if (_tourIdbP) return _tourIdbP;
    _tourIdbP = new Promise(function(resolve) {
      try {
        var rq = indexedDB.open('bim-tour-routes', 1);
        rq.onupgradeneeded = function() { rq.result.createObjectStore('routes'); };
        rq.onsuccess = function() { resolve(rq.result); };
        rq.onerror = function() { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return _tourIdbP;
  }
  function _tourIdbGet(key) {
    return _tourIdb().then(function(db) {
      if (!db) return null;
      return new Promise(function(resolve) {
        try {
          var rq = db.transaction('routes').objectStore('routes').get(key);
          rq.onsuccess = function() { resolve(rq.result || null); };
          rq.onerror = function() { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }
  function _tourIdbPut(key, json) {
    return _tourIdb().then(function(db) {
      if (!db) return false;
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction('routes', 'readwrite');
          tx.objectStore('routes').put(json, key);
          tx.oncomplete = function() { resolve(true); };
          tx.onerror = function() { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }
  function _tourIdbDeletePrefix(prefix, keepVer) {
    return _tourIdb().then(function(db) {
      if (!db) return 0;
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction('routes', 'readwrite'), st = tx.objectStore('routes');
          var rq = st.getAllKeys(), removed = 0;
          rq.onsuccess = function() {
            (rq.result || []).forEach(function(k) {
              if (typeof k !== 'string' || k.indexOf(prefix) !== 0) return;
              if (keepVer && k.indexOf(':' + keepVer + ':') !== -1) return;
              st.delete(k); removed++;
            });
          };
          tx.oncomplete = function() { resolve(removed); };
          tx.onerror = function() { resolve(removed); };
        } catch (e) { resolve(0); }
      });
    });
  }
  // Unified async lookup: legacy localStorage first (migrate + free origin quota), then IDB.
  function _tourCacheFetch(key) {
    var ls = null;
    try { ls = localStorage.getItem(key); } catch (e) {}
    if (ls) {
      _tourIdbPut(key, ls).then(function(ok) {
        if (ok) { try { localStorage.removeItem(key); console.log('[TOUR] §TOUR_CACHE_MIGRATE ls→idb key=' + key); } catch (e) {} }
      });
      return Promise.resolve(ls);
    }
    return _tourIdbGet(key);
  }
  A._tourCacheBust = function() { // §FLY_RECURE recompiles rooms — a cached route may now be illegal
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf('tmTourCache:' + (A.activeBuilding || '') + ':') === 0) localStorage.removeItem(k);
      }
    } catch (e) {}
    _tourIdbDeletePrefix('tmTourCache:' + (A.activeBuilding || '') + ':').then(function(n) {
      if (n) console.log('[TOUR] §TOUR_CACHE_BUST idb removed=' + n);
    });
    A._grMemo = null; // §FLY_PLAN_DEDUPE: recompiled rooms invalidate the memoized route
  };
  // §TOUR_CACHE_EVICT (TOUR_ROUTE_CACHE.md §4, 2026-07-20): nothing else ever removed a
  // tmTourCache key — old TOUR_CACHE_VER generations, other buildings, other DB-recompile counts
  // all coexist forever and can fill the origin's real localStorage quota, after which EVERY
  // future store silently fails (never a crash, but the 41×-faster cache never engages again).
  // Two-part self-heal: (1) drop stale-version keys unconditionally, cheap, no error needed to
  // trigger it; (2) on an actual quota error, drop every OTHER tmTourCache key and retry once —
  // makes the very next Fly press benefit, not just a hand-cleared profile.
  function _tourCachePruneStale() {
    var removed = 0;
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf('tmTourCache:') === 0 && k.indexOf(':' + TOUR_CACHE_VER + ':') === -1) {
          localStorage.removeItem(k); removed++;
        }
      }
    } catch (e) {}
    if (removed) console.log('[TOUR] §TOUR_CACHE_PRUNE stale-version removed=' + removed);
  }
  _tourCachePruneStale(); // once per module setup (page load) — cheap, unconditional
  _tourIdbDeletePrefix('tmTourCache:', TOUR_CACHE_VER).then(function(n) {
    if (n) console.log('[TOUR] §TOUR_CACHE_PRUNE idb stale-version removed=' + n);
  });
  // _tourCacheEvictAndRetry RETIRED (TOUR_ROUTE_CACHE.md §5): it could only evict tmTourCache
  // keys, proven impotent on a quota-full shared origin (removed=0 live). Store path is IDB now.

  // The original fly-start body (tour build + orbit fallback), unchanged except for extraction.
  A._startFlyTour = function(btn) {
    {
      var _ck = _tourCacheKey(), tour = null, _fromCache = false;
      // §TOUR_CACHE_IDB: the async fast-path pre-fetched the route (IDB or legacy LS) and stashed
      // it — a sync localStorage read here can no longer be the source of truth.
      if (_ck && A._tourCachedRoute && A._tourCachedRoute.key === _ck &&
          Array.isArray(A._tourCachedRoute.tour) && A._tourCachedRoute.tour.length >= 1) {
        tour = A._tourCachedRoute.tour;
        _fromCache = true;
      }
      A._tourCachedRoute = null;
      if (_fromCache) {
        console.log('[TOUR] §TOUR_CACHE hit actions=' + tour.length + ' key=' + _ck);
      } else {
        tour = A.buildTour();
      }
      if (tour && tour.length >= 1) {
        if (!_fromCache && A.buildingsRendered.size > 1) {
          const primaryName = Object.keys(A.buildingCentres)[0];
          for (const name of A.buildingsRendered) {
            if (name === primaryName) continue;
            const bc = A.buildingCentres[name];
            if (!bc) continue;
            const ctr = A.ifc2three(bc.ix, bc.iy, bc.iz);
            const orbitR = Math.max(30, (bc.envelope || 80) * 0.75);
            tour.push({type:'orbit', cx:ctr.x, cy:ctr.y, cz:ctr.z, radius:orbitR, tiltDeg:40, duration:8});
            tour.push({type:'riseAndTilt', targetY:ctr.y + 20, tiltDeg:80, name:`${name} bird's eye`});
            tour.push({type:'pause', seconds:3});
            A.wlog(`City: added ${name}`);
          }
        }
        if (!_fromCache && _ck) {
          var _json = JSON.stringify(tour);
          if (_json.length < 8000000) { // sanity guard only — IDB per-origin quota is ample
            var _nAct = tour.length;
            _tourIdbPut(_ck, _json).then(function(ok) {
              if (ok) console.log('[TOUR] §TOUR_CACHE store idb actions=' + _nAct + ' bytes=' + _json.length + ' key=' + _ck);
              else console.log('[TOUR] §TOUR_CACHE store-skip idb-unavailable');
            });
          }
        }
        A.walkMode = true;
        A.walkActions = tour;
        A.walkActionIdx = 0;
        A.walkActionT = 0;
        A.walkPanAngle = 0;
        A.walkOrbitAngle = 0;
        A.walkLastTime = 0;
        A.walkSpeedMult = 1;
        A.tourScrubSpeed = 1;
        A._tourPaused = false;
        document.getElementById('walk-speed-btn').style.display = '';
        document.getElementById('walk-speed-btn').textContent = '1x';
        // §TOUR_TIMELINE_SCRUB — chain every action's end pose into the next one's start NOW, so the
        // whole tour is a deterministic pose = f(T) before a single frame plays. Deliberately after
        // the §TOUR_CACHE store above: the cached JSON must stay free of the runtime remaps.
        A._tourPrepare();
        A._scrubShow();
        A.wlog(`START cinematic tour: ${tour.length} actions`);
        A.status.textContent = `Cinematic tour: ${tour.length} actions`;
        // §IDLE-PARK: _startFlyTour runs after an async route-planning gap (buildTour/room-graph),
        // during which an idle loop can self-park again — the caller's markDirty() (toggleFlyAround)
        // fired BEFORE that gap and is stale by the time walkMode actually goes true here. Without
        // this, a chain that re-parked during planning never restarts: walkMode sits true, unread,
        // and walkTick() (which drives the camera) never runs a single frame. Confirmed live on
        // LTU_AHouse (TOUR_WALKMODE_IDLE_PARK_STUCK.md) — log showed "START cinematic tour" then
        // §IDLE_GATE park, then silence, camera never moving despite a fully-built 25-action tour.
        if (A.markDirty) A.markDirty();
        return;
      }

      A.status.textContent = 'No walk data — using orbit fly';
      A.walkMode = false;
      A.flyTargets = [];
      for (const name of A.buildingsRendered) {
        const bc = A.buildingCentres[name];
        if (!bc) continue;
        const t = A.ifc2three(bc.ix, bc.iy, bc.iz);
        const radius = Math.max(80, (bc.envelope || Math.sqrt(bc.count) * 2) * 1.2);
        A.flyTargets.push({ x: t.x, y: t.y, z: t.z, radius, name });
      }
      if (A.flyTargets.length === 0) { A.flyActive = false; if (btn) btn.classList.remove('active'); return; }
      A.flyTargetIdx = 0;
      A.flyAngle = 0;
      A.flyTransitioning = false;
      A.status.textContent = `Flying around ${A.flyTargets[0].name}...`;
      if (A.markDirty) A.markDirty(); // same async-gap risk as the walkMode path above
    }
  };

  A.flyTick = function() {
    if (!A.flyActive || A.flyTargets.length === 0) return;

    const ft = A.flyTargets[A.flyTargetIdx];

    if (A.flyTransitioning) {
      const elapsed = (performance.now() - A.flyTransitionStart) / 1500;
      if (elapsed >= 1.0) {
        A.flyTransitioning = false;
        A.flyAngle = Math.atan2(A.camera.position.z - ft.z, A.camera.position.x - ft.x);
        A.status.textContent = `Flying around ${ft.name}...`;
      } else {
        const t = elapsed * elapsed * (3 - 2 * elapsed);
        A.camera.position.lerpVectors(A.flyFromPos, new THREE.Vector3(
          ft.x + ft.radius, ft.y + ft.radius * 0.6, ft.z + ft.radius
        ), t);
        A.controls.target.lerpVectors(A.flyFromTarget, new THREE.Vector3(ft.x, ft.y, ft.z), t);
        A.controls.update();
      }
      return;
    }

    A.flyAngle += 0.012;
    const camX = ft.x + Math.cos(A.flyAngle) * ft.radius;
    const camZ = ft.z + Math.sin(A.flyAngle) * ft.radius;
    const camY = ft.y + ft.radius * 0.6;
    A.camera.position.set(camX, camY, camZ);
    A.controls.target.set(ft.x, ft.y, ft.z);
    A.controls.update();

    if (A.flyAngle >= Math.PI * 2) {
      A.flyAngle = 0;
      if (A.flyTargets.length > 1) {
        A.flyFromPos = A.camera.position.clone();
        A.flyFromTarget = A.controls.target.clone();
        A.flyTargetIdx = (A.flyTargetIdx + 1) % A.flyTargets.length;
        A.flyTransitioning = true;
        A.flyTransitionStart = performance.now();
        A.status.textContent = `Flying to ${A.flyTargets[A.flyTargetIdx].name}...`;
      }
    }
  };

  // ═══ FLY_TOUR_CORRIDOR_GRAPH.md §S2 — occupant-graph itinerary ═══
  // Route = entrance exit-node → per storey (lowest→highest): corridor cruise stop + top-K rooms
  // NN-chained through RoomGraph.shortestPath (wall-legal, rides doors/corridor junctions) →
  // stairwell climbs via real stairwp nodes → descent back to the exit, preferring a stair the
  // ascent did not use (edge-filtered graph view — RoomGraph API untouched). EXTRACT ONLY:
  // every waypoint is a measured node position from the graph; nothing invented.
  // §FLY_PLAN_DEDUPE (TOUR_ROUTE_CACHE.md §5, 2026-07-21 user "hangs the browser during
  // calculating"): the §THIN-GRAPH-RECURE probe ran the FULL route builder, then buildTour ran
  // it AGAIN — two multi-second-to-minutes planning passes per first press. The door-floor-z
  // input is one cheap GROUP BY (extracted here so probe and buildTour share it), and the route
  // result is memoized on (graph identity, storeyZ signature) — the second pass is now a lookup.
  A._tourStoreyZ = function() {
    const storeyZ = {};
    try {
      const sz = A.db.exec(`
        SELECT m.storey, MIN(t.center_z) as floor_z
        FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid
        WHERE m.ifc_class IN ('IfcDoor','IfcDoorStandardCase')
        GROUP BY m.storey ORDER BY floor_z
      `);
      if (sz.length) for (const [st, z] of sz[0].values) storeyZ[st] = z;
    } catch(e) {}
    return storeyZ;
  };
  A._grMemo = null; // { g, zsig, result } — g identity changes on room recompile (auto-invalidates)
  A._buildGraphRoute = function(storeyZ) {
    const _g0 = (A.getRoomGraph && window.RoomGraph) ? A.getRoomGraph() : null;
    const _zsig = JSON.stringify(storeyZ || {});
    if (A._grMemo && A._grMemo.g === _g0 && A._grMemo.zsig === _zsig) {
      console.log('[TOUR] §FLY_PLAN_DEDUPE memo-hit');
      return A._grMemo.result;
    }
    const _res = A._buildGraphRouteInner(storeyZ);
    if (_g0) A._grMemo = { g: _g0, zsig: _zsig, result: _res };
    return _res;
  };
  A._buildGraphRouteInner = function(storeyZ) {
    const RG = window.RoomGraph;
    if (!RG || !A.getRoomGraph) return null;
    const g = A.getRoomGraph();
    if (!g || !g.nodes || g.nodes.length < 2) return null;

    // Bucket rooms by storey. Corridors (backprop 'Hall / Corridor' nodes + compiled
    // SUSPECT_ELONGATED — a real corridor is usually one of these, see spec §R4) become cruise
    // stops; other SUSPECT_* rooms are never destinations (§ROOM-FORM: review candidates).
    // §SUSPECT-OPEN-ELIGIBLE (OCCUPANT_PATHFINDER.md §G3-FINAL, user live report "still does not
    // show large space", 2026-07-25): SUSPECT_OPEN is the ONE exception. It is a room-DETECTION
    // confidence flag meaning "enclosure fraction below SUSPECT_OPEN_ENCLOSURE" — i.e. the space is
    // OPEN — which is precisely what a hall or atrium IS. Measured on the user's saved live Hospital
    // (~/Projects/BIM_DB/Hospital.db, an exact repro of the live console): the building's LARGEST
    // room is 315.7 m² and carries SUSPECT_OPEN, so the old blanket exclusion hid it and the tour
    // fell back to a 219 m² × 3.3m corridor. 62 of 214 rooms were excluded this way.
    // SUSPECT_NO_DOOR stays excluded — that one is a genuine reachability doubt, not a shape.
    const byStorey = {}, stZSum = {}, stN = {};
    let suspectOpenAdmitted = 0;
    for (const n of g.nodes) {
      const lbl = String(n.label || '');
      let area = 0;
      for (const rc of (n.rects || [])) area += Math.max(0, rc.x1 - rc.x0) * Math.max(0, rc.y1 - rc.y0);
      if (!byStorey[n.storey]) byStorey[n.storey] = { corridors: [], rooms: [] };
      const rec = { guid: n.guid, node: n, area };
      if (lbl.indexOf('Hall / Corridor') >= 0 || lbl.indexOf('SUSPECT_ELONGATED') >= 0) byStorey[n.storey].corridors.push(rec);
      else if (lbl.indexOf('SUSPECT_') < 0 || lbl.indexOf('SUSPECT_OPEN') >= 0) {
        if (lbl.indexOf('SUSPECT_OPEN') >= 0) suspectOpenAdmitted++;
        byStorey[n.storey].rooms.push(rec);
      }
      stZSum[n.storey] = (stZSum[n.storey] || 0) + n.cz;
      stN[n.storey] = (stN[n.storey] || 0) + 1;
    }
    const storeys = Object.keys(byStorey).sort((a, b) => stZSum[a] / stN[a] - stZSum[b] / stN[b]);
    // §R6-BUDGET (Hospital live-report: "lingers too long on first floor"): rooms per storey
    // scale DOWN as storey count grows — tall buildings get a tighter, corridor-dominant tour.
    const K = storeys.length >= 4 ? 2 : storeys.length === 3 ? 3 : 4;

    // Entrance: the lowest exit node (E4 — a real non-room door), when the building has one.
    let entrance = null;
    for (const k in g.nodesByGuid) {
      const n = g.nodesByGuid[k];
      if (n.kind === 'exit' && (entrance === null || n.cz < entrance.cz)) entrance = n;
    }

    // Itinerary: per storey, LARGEST spaces first (user 2026-07-16: "go for the great
    // opportunities from large hallways or entrance to large areas first") — the corridor cruise
    // leads, then rooms in descending measured area. Drama over travel economy: the legs between
    // stops are still graph-shortest, so the route stays wall-legal either way.
    // §CONNECTED-STOPS (LTU live-report 2026-07-16: "same route, nothing major change" — LTU has
    // 0 exit nodes, and its largest corridor node carries no edges, so the route anchored on an
    // isolated node, every leg failed, pts=1 → permanent legacy fallback): a stop must appear in
    // the edge set to be routable AT ALL; isolated nodes are dropped up front.
    const edgeGuids = {};
    for (const e of g.edges) { edgeGuids[e.a] = true; edgeGuids[e.b] = true; }
    // §R6-TYPE-DEDUPE (user: "not go to same type of rooms"): real IfcSpace names carry the
    // room's function (Ward, WC, Office…) — visit the FIRST of each name-type only, tour-wide.
    // Compiled rooms (object_type COMPILED, names like "R28") carry no semantic type → exempt.
    const seenType = {};
    function typeToken(n) {
      if (String(n.label || '').indexOf('COMPILED') >= 0) return null;
      const t = String(n.name || '').toLowerCase().replace(/[0-9]+/g, ' ')
        .replace(/[^a-zÀ-￿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
      return t.length >= 2 ? t : null;
    }
    let isolatedDropped = 0, typeDeduped = 0;
    const stops = [];
    for (const st of storeys) {
      const b = byStorey[st];
      b.corridors.sort((a, c) => c.area - a.area);
      b.rooms.sort((a, c) => c.area - a.area);
      // §R6-CORRIDOR-SPINE (user: "stick more to long corridors and hallways"): corridors are
      // the tour's spine — up to 3 cruise stops per storey (was 1), rooms are brief detours.
      const picks = b.corridors.slice(0, 3);
      let roomsTaken = 0;
      for (const r of b.rooms) {
        if (roomsTaken >= K) break;
        const tok = typeToken(r.node);
        if (tok && seenType[tok]) { typeDeduped++; continue; }
        if (tok) seenType[tok] = true;
        picks.push(r);
        roomsTaken++;
      }
      for (const r of picks) {
        if (edgeGuids[r.guid]) stops.push(r);
        else isolatedDropped++;
      }
    }
    if (isolatedDropped || typeDeduped) console.log('[TOUR] §FLY_ROUTE_ISOLATED dropped=' +
      isolatedDropped + ' typeDeduped=' + typeDeduped);
    if (!stops.length) { console.log('[TOUR] §FLY_ROUTE_REJECT reason=no-stops → legacy tour'); return null; }

    // ═══ §HL-FIRST (FLY_TOUR_CORRIDOR_GRAPH.md §HIGHLIGHTS_FIRST_ROUTING, RESOLVED 2026-07-25 —
    // user: "explore main hall/space first.. climb stairs, main highlights to capture initial user
    // impression") — stop ORDER only. Selection, budgets (§R6-BUDGET), type-dedupe, corridor spine
    // and every legality gate below are UNTOUCHED: the same stops fly, in an impression-first order.
    // The main hall is the largest MEASURED space in the whole building (corridor-class nodes
    // included — a real "main hall" often is one, §R4); the second highlight is the largest stop on
    // a HIGHER storey, which is what pulls the stair climb into the opening block instead of
    // leaving it to the storey sweep. EXTRACT ONLY: rect area from the graph, no invented ranking.
    const HL_EXTRA = 1;  // highlights beyond mainHall+ascent — the opening stays a beat, not the tour
    const storeyZOf = st => stZSum[st] / stN[st];
    let mainHallGuid = null;
    // §HL-ORIGIN: buildings with no graph exit node (measured: HHS federated, Clinic) start the
    // walk at stops[0], which UNDER THE OLD storey-sequential order was implicitly the lowest
    // storey's first pick. Reordering stops would have moved that origin to the main hall — on HHS
    // the tour then began on Level 3 and walked DOWN (first climb slipped 0.224 → 0.432 of the
    // route). Capture the pre-reorder origin so the walk still STARTS low and CLIMBS to the
    // highlight, which is the whole point of the user's "climb stairs" ask.
    const seqOriginGuid = stops[0].guid;
    {
      const byArea = stops.slice().sort((a, c) => c.area - a.area);
      const mainHall = byArea[0];
      const taken = {}; taken[mainHall.guid] = true;
      const picked = [mainHall];
      const mhZ = storeyZOf(mainHall.node.storey);
      let ascent = null;
      for (const s of byArea) {
        if (taken[s.guid]) continue;
        // "higher storey" = a DIFFERENT storey whose own measured mean z is above the hall's.
        // No metre threshold: storey identity comes from the data, and the comparison is between
        // two measured means — nothing to tune, nothing building-specific.
        if (s.node.storey !== mainHall.node.storey && storeyZOf(s.node.storey) > mhZ) { ascent = s; break; }
      }
      if (ascent) { picked.push(ascent); taken[ascent.guid] = true; }
      for (const s of byArea) {
        if (picked.length >= (ascent ? 2 : 1) + HL_EXTRA) break;
        if (taken[s.guid]) continue;
        picked.push(s); taken[s.guid] = true;
      }
      const rest = stops.filter(s => !taken[s.guid]);  // today's storey-sequential order, minus the highlights
      stops.length = 0;
      for (const s of picked) stops.push(s);
      for (const s of rest) stops.push(s);
      mainHallGuid = mainHall.guid;
      console.log('[TOUR] §FLY_HL_FIRST mainHall="' + (mainHall.node.name || mainHall.guid) + '" area=' +
        mainHall.area.toFixed(1) + ' storey=' + mainHall.node.storey +
        ' ascent=' + (ascent ? '"' + (ascent.node.name || ascent.guid) + '"/' + ascent.node.storey : '-') +
        ' extras=' + (picked.length - (ascent ? 2 : 1)) + ' stops=' + stops.length +
        ' suspectOpenAdmitted=' + suspectOpenAdmitted);  // §SUSPECT-OPEN-ELIGIBLE
    }

    // §S3 — the largest room actually PICKED per storey gets the pause + look-around beat
    // (§R6: dedupe/budget may drop the storey's largest room; corridors keep moving, no beat).
    // §HL-FIRST item 4: the main hall ALWAYS gets a beat, and a fuller one — kind 'hall' → a 360°
    // turn-around ("turn around in them"), reusing §S3's own beat machinery, not a new grammar.
    // It counts as its storey's beat, so no storey is double-beaten.
    const pauseKind = {};
    const pausedStorey = {};
    if (mainHallGuid && g.nodesByGuid[mainHallGuid]) {
      pauseKind[mainHallGuid] = 'hall';
      pausedStorey[g.nodesByGuid[mainHallGuid].storey] = true;
    }
    for (const s of stops) {
      const st = s.node.storey;
      if (pausedStorey[st]) continue;
      if (byStorey[st].corridors.indexOf(s) >= 0) continue;
      pauseKind[s.guid] = 'room';
      pausedStorey[st] = true;
    }

    // Chain the stops through the graph (Dijkstra, legalized — see room_graph.js).
    // A stop the graph cannot reach (room island — real on sparse federated models, measured
    // HHS) is SKIPPED, never straight-hopped: an occupant can't walk there, and this route
    // invents nothing. EXTRACT ONLY.
    const pathGuids = [];
    let skipped = 0, visitedStops = 0;
    let curGuid = entrance ? entrance.guid : seqOriginGuid;  // §HL-ORIGIN — start low, climb to the highlight
    pathGuids.push(curGuid);
    for (const s of stops) {
      if (s.guid === curGuid) { visitedStops++; continue; }
      const sp = RG.shortestPath(g, curGuid, s.guid);
      if (sp && sp.path && sp.path.length > 1) {
        for (let i = 1; i < sp.path.length; i++) pathGuids.push(sp.path[i]);
        visitedStops++;
        curGuid = s.guid;
      } else { skipped++; }
    }

    const usedStairs = {};
    for (const pg of pathGuids) {
      const n = g.nodesByGuid[pg];
      if (n && n.kind === 'stairwp') usedStairs[pg] = true;
    }
    const stairUp = Object.keys(usedStairs)[0] || null;

    // §S2.5 — descent finale back to the entrance, preferring a stair the ascent did NOT use:
    // same graph minus the used stairwps' edges (plain filtered view), full graph as fallback.
    let stairDown = null;
    if (entrance && curGuid !== entrance.guid) {
      let spBack = null;
      if (Object.keys(usedStairs).length) {
        const filtered = Object.assign({}, g, { edges: g.edges.filter(e => !usedStairs[e.a] && !usedStairs[e.b]) });
        spBack = RG.shortestPath(filtered, curGuid, entrance.guid);
      }
      if (!spBack || !spBack.path || spBack.path.length < 2) spBack = RG.shortestPath(g, curGuid, entrance.guid);
      if (spBack && spBack.path && spBack.path.length > 1) {
        for (let i = 1; i < spBack.path.length; i++) {
          pathGuids.push(spBack.path[i]);
          const n = g.nodesByGuid[spBack.path[i]];
          if (!stairDown && n && n.kind === 'stairwp') stairDown = spBack.path[i];
        }
      }
    }

    // Guids → real points. Rooms/exits ride each storey's door-derived floor z (same convention
    // as the legacy tour); stairwps keep their OWN measured z ends — that IS the climb/descent.
    const pts = [];
    const ifcTrail = [];
    let circWps = 0;
    let prevPg = null, prevN = null;
    for (const pg of pathGuids) {
      const n = g.nodesByGuid[pg];
      if (!n || n.cx === undefined) continue;
      const fz = (n.kind === 'stairwp') ? n.cz : (storeyZ[n.storey] !== undefined ? storeyZ[n.storey] : n.cz);
      const tp = A.ifc2three(n.cx, n.cy, fz);
      // §R6-STAIR-FLIGHT (user: "really go up stairs"): a lo↔hi hop on the SAME stair gets a
      // mid-flight point (halfway along the flight's own measured run), so the camera tracks
      // base → landing → top instead of one smoothed diagonal. Both endpoints are real stairwp
      // node positions; the midpoint is their measured interpolation, nothing invented.
      if (n.kind === 'stairwp' && prevN && prevN.kind === 'stairwp' &&
          String(pg).replace(/::(lo|hi)$/, '') === String(prevPg).replace(/::(lo|hi)$/, '')) {
        const mtp = A.ifc2three((prevN.cx + n.cx) / 2, (prevN.cy + n.cy) / 2, (prevN.cz + n.cz) / 2);
        pts.push({ x: mtp.x, y: mtp.y + A.WALK_EYE_HEIGHT, z: mtp.z, name: '', pause: null });
        ifcTrail.push({ storey: n.storey, cx: (prevN.cx + n.cx) / 2, cy: (prevN.cy + n.cy) / 2, vertical: true });
      }
      prevPg = pg; prevN = n;
      if (n.kind === 'doorwp' || n.kind === 'circ' || n.kind === 'spine') circWps++;
      // §HEADS-UP (user 2026-07-16: "moving across storeys, having heads up where are the open
      // spaces"): arriving on a NEW storey up a stair gets a 'storey' look-around beat before
      // flying it. Ascent only — descent stays continuous.
      const py = tp.y + A.WALK_EYE_HEIGHT;
      const prevPt = pts[pts.length - 1];
      const storeyArrival = n.kind === 'stairwp' && prevPt && (py - prevPt.y) > 1;
      pts.push({ x: tp.x, y: py, z: tp.z,
                 name: (n.kind === 'room' || n.kind === 'exit' || n.kind === 'stairwp') ? n.name : '',
                 pause: pauseKind[pg] || (storeyArrival ? 'storey' : null) });
      ifcTrail.push({ storey: n.storey, cx: n.cx, cy: n.cy, vertical: n.kind === 'stairwp' });
    }
    if (pts.length < 3) { console.log('[TOUR] §FLY_ROUTE_REJECT reason=thin-path pts=' + pts.length + ' → legacy tour'); return null; }

    // §S4 witness — every same-storey chord must be walk-legal (0 chords with illegal samples).
    let illegalChords = 0, checkedChords = 0;
    if (typeof RG.chordIllegalCount === 'function') {
      for (let i = 1; i < ifcTrail.length; i++) {
        const a = ifcTrail[i - 1], b = ifcTrail[i];
        if (a.storey !== b.storey || a.vertical || b.vertical) continue;
        checkedChords++;
        if (RG.chordIllegalCount(g, a.storey, a.cx, a.cy, b.cx, b.cy) > 0) illegalChords++;
      }
    }
    const corridorStops = stops.filter(s => byStorey[s.node.storey].corridors.indexOf(s) >= 0).length;
    console.log('[TOUR] §FLY_ROUTE storeys=' + storeys.length + ' stops=' + visitedStops + '/' + stops.length +
      ' skipped=' + skipped + ' corridorStops=' + corridorStops + ' circWps=' + circWps +
      ' stairUp=' + (stairUp || '-') + ' stairDown=' + (stairDown || '-') +
      ' pts=' + pts.length + ' illegalChords=' + illegalChords + '/' + checkedChords);
    // §S5 QUALITY GATE — every flown leg is graph-connected by construction (unreachable stops
    // are skipped above, never hopped). Chords inside a shortestPath result are the engine's OWN
    // legalized best-effort (_legalizePath keeps a chord when no detour exists — identical to
    // what PATH mode draws for users), so `illegalChords` is reported, not gated (measured:
    // Terminal 10/89 residual, HHS 0/50). What IS gated: a route that barely exists — a thin
    // graph (this local Duplex snapshot: 5 approx nodes, 3 edges, most stops unreachable) must
    // fall back to the legacy tour, not ship a worse flight.
    // §MAJORITY-LEGAL (2026-07-17, Duplex regression witness): a route whose chords are MOSTLY
    // wall-illegal is junk data passing the coverage gate (Duplex: 2/2 = 100% illegal on a
    // 3-pt route after v2 walker connected its 2 approx rooms). Engine residual stays welcome
    // (Terminal 10/89≈11%, HHS 0/50); majority-illegal rejects.
    if (!g.edges.length || visitedStops < 2 || visitedStops < stops.length * 0.5 ||
        (checkedChords > 0 && illegalChords * 2 > checkedChords)) {
      console.log('[TOUR] §FLY_ROUTE_REJECT edges=' + g.edges.length + ' visited=' + visitedStops +
        '/' + stops.length + ' illegalChords=' + illegalChords + ' → legacy tour');
      return null;
    }
    A.wlog(`GraphRoute: ${stops.length} stops, ${pts.length} pts, stairs ${stairUp ? '↑' : '-'}${stairDown ? '↓' : ''}`);
    return { pts, entrance, stats: { illegalChords, checkedChords, circWps, corridorStops } };
  };

  // S206: Cinematic building tour — nearest-neighbor choreography
  A.buildTour = function() {
    try { return A._buildTourInner(); } catch(e) {
      console.error('[TOUR] buildTour crashed:', e.message, e.stack);
      A.wlog('TOUR CRASH: ' + e.message);
      return null;
    }
  };
  A._buildTourInner = function() {
    // ── Helpers ──
    function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
    // Sort points in nearest-neighbor order starting from `start`
    function nnSort(pts, start) {
      if (pts.length <= 1) return pts;
      const out = [], used = new Set();
      let cur = start;
      while (out.length < pts.length) {
        let bestI = -1, bestD = Infinity;
        for (let i = 0; i < pts.length; i++) {
          if (used.has(i)) continue;
          const d = dist2(cur, pts[i]);
          if (d < bestD) { bestD = d; bestI = i; }
        }
        if (bestI < 0) break;
        used.add(bestI);
        out.push(pts[bestI]);
        cur = pts[bestI];
      }
      return out;
    }

    // ── Query data ──
    let doorsByStorey = {};
    try {
      const dr = A.db.exec(`
        SELECT m.guid, t.center_x, t.center_y, t.center_z, m.storey, m.element_name
        FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid
        WHERE m.ifc_class IN ('IfcDoor','IfcDoorStandardCase')
        ORDER BY m.storey, t.center_x
      `);
      if (dr.length) for (const [g, cx, cy, cz, st, nm] of dr[0].values) {
        if (!doorsByStorey[st]) doorsByStorey[st] = [];
        doorsByStorey[st].push({x: cx, y: cy, z: cz, name: nm, guid: g});
      }
    } catch(e) {}

    let stairs = [];
    try {
      const st = A.db.exec(`
        SELECT t.center_x, t.center_y, t.center_z, m.storey
        FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid
        WHERE m.ifc_class IN ('IfcStair','IfcStairFlight')
        ORDER BY t.center_z
      `);
      if (st.length) stairs = st[0].values.map(([x,y,z,s]) => ({x,y,z,storey:s}));
    } catch(e) {}

    let storeyZ = A._tourStoreyZ(); // §FLY_PLAN_DEDUPE: shared with the recure probe

    let roomsByStorey = {};
    try {
      const rq = A.db.exec(`
        SELECT s.storey, s.name, AVG(t.center_x) cx, AVG(t.center_y) cy, AVG(t.center_z) cz, COUNT(*) cnt
        FROM rel_contained_in_space r
        JOIN spatial_structure s ON r.space_guid = s.guid
        JOIN element_transforms t ON r.element_guid = t.guid
        WHERE s.type = 'IfcSpace'
        GROUP BY r.space_guid
        ORDER BY cnt DESC
      `);
      if (rq.length) for (const [st, nm, cx, cy, cz, cnt] of rq[0].values) {
        if (!roomsByStorey[st]) roomsByStorey[st] = [];
        roomsByStorey[st].push({name: nm, cx, cy, cz, count: cnt});
      }
    } catch(e) {}

    // Sort storeys by elevation, not alphabetically
    const storeys = Object.keys(storeyZ).sort((a,b) => storeyZ[a] - storeyZ[b]);
    // Fallback: if storeyZ empty, try doorsByStorey keys
    if (storeys.length === 0) {
      const fallback = Object.keys(doorsByStorey).sort();
      if (fallback.length === 0) return null;
      storeys.push(...fallback);
    }

    const actions = [];
    const bc0 = Object.values(A.buildingCentres)[0];
    let bldgCtr = null;
    if (bc0) bldgCtr = A.ifc2three(bc0.ix, bc0.iy, bc0.iz);
    const envelope = bc0 ? (bc0.envelope || 40) : 40;

    const firstDoor = doorsByStorey[storeys[0]]?.[0];
    if (!firstDoor && !bldgCtr) return null;
    const ep = firstDoor ? A.ifc2three(firstDoor.x, firstDoor.y, firstDoor.z) : bldgCtr;
    if (!bldgCtr) bldgCtr = {x: ep.x, y: ep.y, z: ep.z};
    const cx = bldgCtr.x, cz = bldgCtr.z;

    // FLY_TOUR_CORRIDOR_GRAPH.md §S2 — try the occupant-graph route first (computed before
    // PART 2 so the approach + finale aim at the graph's real entrance door). Null ⇒ S5 fallback
    // to the legacy centroid collection below, unchanged.
    let graphRoute = null;
    try { graphRoute = A._buildGraphRoute(storeyZ); } catch (e) { console.warn('[TOUR] §FLY_ROUTE_ERR ' + (e && e.message)); }
    if (graphRoute && graphRoute.entrance && ep !== bldgCtr) {
      const etp = A.ifc2three(graphRoute.entrance.cx, graphRoute.entrance.cy, graphRoute.entrance.cz);
      ep.x = etp.x; ep.y = etp.y; ep.z = etp.z;
    }

    // ═══ PART 1: ORBIT — scaled to building ═══
    // User 2026-07-16: "Initial should fly around at least near full circle from outside" —
    // fullCircle at the same angular speed (duration ×2 vs the old half-circle).
    const orbitR = Math.max(15, envelope * 0.6);
    const orbitDur = (envelope > 30 ? 6 : 4) * 2;
    actions.push({type:'orbit', cx:bldgCtr.x, cy:bldgCtr.y, cz:bldgCtr.z,
                  radius:orbitR, tiltDeg:35, duration:orbitDur, fullCircle:true});

    // ═══ PART 2: APPROACH — fly to entrance (separate action) ═══
    // §INTERIOR_PACING — user 2026-07-25: "zoom into building can hasten up 2X". speedMul only
    // affects this one moveTo (the outside→entrance zoom); the finale moveTo actions (PART 5,
    // bird's-eye/centre/final) stay at their existing pace, unaffected — see the moveTo handler.
    actions.push({type:'moveTo', x:ep.x, y:ep.y, z:ep.z, name:'Entrance', speedMul: 2, dynamicPace: true});

    // ═══ PART 3: INTERIOR PATH (spline flyPath) ═══
    // Collect waypoints per storey, nearest-neighbor sorted
    const flyPts = [];
    const flyNames = [];
    const visited = [];
    const MIN_SEP = envelope > 30 ? 5 : 1;  // tighter dedup for small buildings
    let lastPos = {x: ep.x, y: ep.y, z: ep.z};

    // Push entrance as first spline point
    flyPts.push({x: ep.x, y: ep.y + A.WALK_EYE_HEIGHT, z: ep.z});
    flyNames.push('Entrance');

    // §S2 — occupant-graph waypoints (corridors/doors/stairwells), already wall-legal;
    // pauseIdx marks the look-around beats (§S3). Legacy loop below runs only without a route.
    const pauseIdx = [];  // {i, kind:'room'|'storey'} — look-around beats (§S3 + §HEADS-UP)
    if (graphRoute) {
      for (const p of graphRoute.pts) {
        const last = flyPts[flyPts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) < 0.3) {
          if (p.pause) pauseIdx.push({i: flyPts.length - 1, kind: p.pause});
          continue;
        }
        flyPts.push({x: p.x, y: p.y, z: p.z});
        flyNames.push(p.name || '');
        if (p.pause) pauseIdx.push({i: flyPts.length - 1, kind: p.pause});
      }
    }

    if (!graphRoute) for (let si = 0; si < storeys.length; si++) {
      const storey = storeys[si];
      const floorY = A.ifc2three(0, 0, storeyZ[storey] || 0).y + A.WALK_EYE_HEIGHT;

      // Stair transition: nearest stair
      if (si > 0 && stairs.length > 0) {
        let bestStair = stairs[0], bestSD = Infinity;
        for (const s of stairs) {
          const sp = A.ifc2three(s.x, s.y, s.z);
          const d = dist2(lastPos, sp);
          if (d < bestSD) { bestSD = d; bestStair = s; }
        }
        const sp = A.ifc2three(bestStair.x, bestStair.y, bestStair.z);
        flyPts.push({x: sp.x, y: lastPos.y || floorY, z: sp.z});
        flyNames.push('Stairs');
        flyPts.push({x: sp.x, y: floorY, z: sp.z});
        flyNames.push(storey);
        lastPos = {x: sp.x, y: floorY, z: sp.z};
      }

      // Collect rooms or doors
      const rooms = roomsByStorey[storey];
      let waypoints = [];
      if (rooms && rooms.length > 0) {
        for (const r of rooms.slice(0, Math.min(rooms.length, 5))) {
          const rp = A.ifc2three(r.cx, r.cy, r.cz);
          waypoints.push({x: rp.x, y: floorY, z: rp.z, name: r.name || 'Room'});
        }
      } else {
        const doors = doorsByStorey[storey] || [];
        let sCtrX = 0, sCtrZ = 0, sN = 0;
        for (const d of doors) { const dp = A.ifc2three(d.x, d.y, d.z); sCtrX += dp.x; sCtrZ += dp.z; sN++; }
        if (sN) { sCtrX /= sN; sCtrZ /= sN; }
        for (let di = 0; di < Math.min(doors.length, 5); di++) {
          const d = doors[di];
          const dp = A.ifc2three(d.x, d.y, d.z);
          if (sN) {
            const dx = sCtrX - dp.x, dz = sCtrZ - dp.z;
            const len = Math.hypot(dx, dz);
            if (len > 0.1) { dp.x += (dx / len) * 2; dp.z += (dz / len) * 2; }
          }
          waypoints.push({x: dp.x, y: floorY, z: dp.z, name: d.name?.split(':')[0] || storey});
        }
      }
      waypoints = nnSort(waypoints, lastPos);
      for (const wp of waypoints) {
        if (visited.some(v => dist2(v, wp) < MIN_SEP)) continue;
        flyPts.push({x: wp.x, y: wp.y, z: wp.z});
        flyNames.push(wp.name);
        visited.push(wp);
        lastPos = wp;
      }
    }

    // Only add flyPath if enough interior content
    let pathLen = 0;
    for (let i = 1; i < flyPts.length; i++)
      pathLen += Math.hypot(flyPts[i].x-flyPts[i-1].x, flyPts[i].y-flyPts[i-1].y, flyPts[i].z-flyPts[i-1].z);

    if (pathLen > 30) {
      // ═══ Big building: full interior flyPath + finale ═══
      // §S3 — split the spline at each storey's largest room for a pause + look-around beat;
      // no pause marks (legacy route) ⇒ one flyPath exactly as before.
      // §R6-PACE: flat 3.5 m/s makes a long hospital path a multi-minute crawl — beyond 300m of
      // interior path, pace up to 4.5 m/s (still walking-film speed, ~22% shorter).
      // §INTERIOR_PACING (FLY_TOUR_CORRIDOR_GRAPH.md §INTERIOR_PACING_NOT_A_SPEED_FACTOR, user
      // 2026-07-25: "within building X0.3 and even slower when too close to object or spaces").
      // INTERIOR_PACE_FACTOR is the baseline interior cruise slowdown; EXTRA slowdown at tight
      // turns/short legs (dead-end spurs, close corners — "flash by meaninglessly") is layered on
      // top per-segment inside the flyPath action itself (§TIGHT_TURN_PACING below), derived from
      // the real path's own point geometry — not a second flat multiplier. Exterior orbit (PART 1,
      // untouched) and the entrance zoom-in (PART 2, sped up separately) never see this factor —
      // it only multiplies flySpd, which only feeds flyPath durations.
      const INTERIOR_PACE_FACTOR = 0.3;
      const flySpd = (pathLen > 300 ? 4.5 : 3.5) * INTERIOR_PACE_FACTOR;
      // §HL-FIRST: `> 0` (was `> 1`) — when the main hall IS the route's first interior stop
      // (measured: Clinic, a building with no graph exit node, mainHall lands at flyPts[1]), the
      // old bound silently dropped its 360° turn-around beat. flyPts[0] is always the entrance
      // point, so index 1 is a real 2-point approach segment, not a degenerate one.
      const splits = pauseIdx.filter((v, i, arr) => v.i > 0 && v.i < flyPts.length - 2 &&
        arr.findIndex(w => w.i === v.i) === i).sort((a, b) => a.i - b.i);
      const segments = [];
      let segFrom = 0;
      for (const sv of splits) { if (sv.i > segFrom) { segments.push({from: segFrom, to: sv.i, beat: sv.kind}); segFrom = sv.i; } }
      segments.push({from: segFrom, to: flyPts.length - 1, beat: null});
      for (let sI = 0; sI < segments.length; sI++) {
        const pts = flyPts.slice(segments[sI].from, segments[sI].to + 1);
        if (pts.length < 2) continue;
        let segLen = 0;
        for (let i = 1; i < pts.length; i++)
          segLen += Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y, pts[i].z-pts[i-1].z);
        actions.push({type:'flyPath', points: pts, names: flyNames.slice(segments[sI].from, segments[sI].to + 1),
                      duration: Math.max(segLen / flySpd, segments.length === 1 ? 8 : 3)});
        if (sI < segments.length - 1 && segments[sI].beat) {
          // room beat = full survey; storey arrival = shorter heads-up sweep of the open spaces;
          // §HL-FIRST 'hall' = a full 360° turn-around in the building's main space (user: "turn
          // around in them") — same lookAround action, fuller sweep, no new camera grammar.
          actions.push({type:'pause', seconds: segments[sI].beat === 'hall' ? 0.8 : 0.4});
          actions.push({type:'lookAround',
            degrees: segments[sI].beat === 'storey' ? 180 : segments[sI].beat === 'hall' ? 360 : 270});
        }
      }
      A.wlog(`FlyPath: ${flyPts.length} pts, ${pathLen.toFixed(0)}m, ${segments.length} seg(s)`);
      // Finale: fly outside+above, pause, land
      const topZ = Math.max(...Object.values(storeyZ), 0);
      const topY = A.ifc2three(0, 0, topZ).y;
      const riseH = Math.max(5, Math.min(25, envelope * 0.3));
      actions.push({type:'moveTo', x:cx + orbitR*0.6, y:topY + riseH - A.WALK_EYE_HEIGHT, z:cz + orbitR*0.6, name:"Bird's eye"});
    } else {
      // ═══ Small building: go to middle at floor level, look around ═══
      actions.push({type:'moveTo', x:cx, y:ep.y - A.WALK_EYE_HEIGHT, z:cz, name:'Centre'});
      actions.push({type:'lookAround', degrees: 360});
    }

    // ═══ ENDING (both paths): outside at orbit distance, eye level, building centred ═══
    const endDx = ep.x - cx, endDz = ep.z - cz;
    const endLen = Math.hypot(endDx, endDz) || 1;
    const endX = cx + (endDx / endLen) * orbitR;
    const endZ = cz + (endDz / endLen) * orbitR;
    actions.push({type:'moveTo', x:endX, y:ep.y, z:endZ, name:'Final'});
    // User 2026-07-16: "Ending should be outside looking at it from ground level" — camera at
    // ground (entrance height), slow 90° pan centred on the facade, gaze tilted UP to 40% of the
    // building's measured top (storeyZ max), so the tour closes on the building, not the horizon.
    const _endTopZ = Object.values(storeyZ).length ? Math.max(...Object.values(storeyZ)) : 0;
    const _endTopY = A.ifc2three(0, 0, _endTopZ).y;
    actions.push({type:'lookAround', degrees:90, lookAtX:cx, lookAtZ:cz,
                  lookAtY: ep.y + Math.max(3, (_endTopY - ep.y) * 0.4)});
    actions.push({type:'pause', seconds:1});

    // §TOUR_PATH — dump full path as JSON for inspection
    console.log('[TOUR] §TOUR_PATH', JSON.stringify({
      actions: actions.map(a => ({type:a.type, name:a.name, pts: a.points?.length, dur:a.duration})),
      flyPts: flyPts.map((p,i) => ({i, x:+p.x.toFixed(1), y:+p.y.toFixed(1), z:+p.z.toFixed(1), name:flyNames[i]||''})),
      envelope, MIN_SEP, storeys: storeys.length
    }, null, 0));
    A.wlog(`Tour: ${actions.length} actions, ${storeys.length} storeys, ${flyPts.length} interior pts`);
    window._walkStrategy = `${graphRoute ? 'CINE-GRAPH' : 'CINE'}(${actions.length}acts,${flyPts.length}pts)`;
    return actions;
  };

  A.cycleWalkSpeed = function() {
    const speeds = [1, 2, 4];
    const idx = speeds.indexOf(A.walkSpeedMult);
    A.walkSpeedMult = speeds[(idx + 1) % speeds.length];
    document.getElementById('walk-speed-btn').textContent = A.walkSpeedMult + 'x';
    A.wlog(`Speed: ${A.walkSpeedMult}x`);
  };

  // §INTERIOR_PACING (FLY_TOUR_CORRIDOR_GRAPH.md §INTERIOR_PACING_NOT_A_SPEED_FACTOR, user
  // 2026-07-25/26: "when things far off, hasten... when really close slow down... its a simple
  // inverse formula" — "the inverse distance speed law is not proper... it is a simple maths, no
  // overthink". Corrected from the first pass, which used a HORIZONTAL-only BVH ray fan for the
  // orbit/approach too — live LTU log showed `orbit clearancePace min=0.35 max=0.35` (flat, no
  // effect at all): a mostly-VERTICAL descent never registers on a horizontal fan, so it measured
  // nothing was ever near and stayed pinned at "fully open." Fixed by using the actual known
  // geometry directly instead of raycasting for the two actions that already know exactly what
  // they're approaching: orbit paces off real height-above-ground (`camY - groundY`), moveTo
  // paces off real remaining distance-to-destination. Only flyPath (interior — no single known
  // target) keeps the BVH clearance fan, and no longer multiplies it by a separate turn-angle
  // term (that stacking produced the other live bug — `combinedFactorRange=[0.35,16.00]`, a
  // runaway 16x local slowdown): clearance alone already reads as "tight" for a dead-end spur
  // (walls close on every side) without a second signal compounding on top of it.
  // §PACE_SWING (2026-07-26, user: "why can't there be a simple inverse dynamic but a single knob
  // variable... every edit, it is just a single number change") — the clamp had been two separately
  // hand-tuned numbers (0.35/4.0, then 0.5/2.0, then 0.6/1.6 across three live-review rounds), which
  // is why every tamper needed touching both. Collapsed to ONE knob: PACE_SWING is how far the pace
  // is allowed to swing from neutral (1.0) in EITHER direction, symmetric in ratio terms (2x too
  // fast is the mirror of 2x too slow) — MIN=1/PACE_SWING, MAX=PACE_SWING, derived, never edited
  // directly. Current value (1.6) reproduces the just-tested 0.6-1.6 near-exactly (1/1.6=0.625).
  // Future re-tuning ("still too slow/fast") is ONE number: raise PACE_SWING for more range, lower
  // it for gentler. The inverse formula itself (_invPace below) and its direction (far=fast,
  // near=slow) are untouched — this only ever adjusted how far it's allowed to swing.
  const PACE_SWING = 1.6;
  const PACE_FACTOR_MIN = 1 / PACE_SWING;  // fastest allowed (far/open)
  const PACE_FACTOR_MAX = PACE_SWING;      // slowest allowed (right up against a surface/target)
  const LOOKAHEAD_M = 5;             // §TARGET_BOUNDED_LOOKAHEAD — absolute gaze-ahead distance for
                                      // flyPath, same scale as the clearance/LOS reference distances
                                      // above; independent of total path length (see the flyPath init
                                      // block below for why the old fixed-fraction version broke on
                                      // long multi-room routes).
  function _invPace(distance, refDistance, minDistance) {
    const d = Math.max(distance, minDistance);
    const factor = refDistance / d; // the "simple inverse formula": far => small factor (fast), close => large factor (slow)
    return Math.max(PACE_FACTOR_MIN, Math.min(PACE_FACTOR_MAX, factor));
  }
  // §INTERIOR_PACING_LOS (user 2026-07-26: "Measure by LOS - what is in front of the middle in
  // the frame, if it is far, fast. Near, slow" — a courtyard traversal was still reading slow
  // under the omnidirectional fan-min because SOMETHING nearby in SOME direction (a low wall,
  // furniture, staffage off to the side) triggered it even though what's actually ahead in view
  // was wide open). Single forward raycast toward the NEXT waypoint (or, at the last point, the
  // same heading the final incoming leg already has) — real line-of-sight, not "closest thing in
  // any direction." `pts` is the same real point array the remap is being built over.
  function _losPace(pts, i) {
    if (typeof A.cinemaLookDist !== 'function') return 1;
    let dx, dz;
    if (i < pts.length - 1) { dx = pts[i + 1].x - pts[i].x; dz = pts[i + 1].z - pts[i].z; }
    else { dx = pts[i].x - pts[i - 1].x; dz = pts[i].z - pts[i - 1].z; }
    let d;
    try { d = A.cinemaLookDist(pts[i], dx, dz); } catch (e) { return 1; }
    return _invPace(d, 3.0, 0.6); // REF=3m ahead reads as neutral pace, same scale a normal room aisle gives
  }
  // Builds a monotonic time-fraction<->position-fraction remap from real sample points + a
  // per-point pace factor (>1 slower, <1 faster than neutral). Two effects, both from the SAME
  // table: (1) `meanFactor` rescales the action's OWN total duration — a genuinely open whole
  // path (LTU courtyard) gets a shorter total duration outright, not just a bigger internal SHARE
  // of a duration that was already fixed small; (2) per-frame lookup (`_paceLookup`) redistributes
  // WHERE in that (possibly rescaled) duration the time is spent, so a close/tight moment within
  // an otherwise-open path still gets its own real slowdown. Shared by orbit/moveTo/flyPath.
  function _paceBuildRemap(pts, paceOf) {
    const n = pts.length;
    if (n < 2) return null;
    const segLens = [], rawU = [0]; let cum = 0;
    for (let i = 1; i < n; i++) { const L = pts[i].distanceTo(pts[i - 1]); segLens.push(L); cum += L; rawU.push(cum); }
    for (let i = 0; i < rawU.length; i++) rawU[i] = cum > 0 ? rawU[i] / cum : 0;
    const factors = pts.map(paceOf);
    const wCum = [0]; let wTotal = 0;
    for (let i = 0; i < segLens.length; i++) { wTotal += segLens[i] * Math.max(factors[i], factors[i + 1]); wCum.push(wTotal); }
    return { u: rawU, t: wCum.map(w => wTotal > 0 ? w / wTotal : 0),
             maxFactor: Math.max(...factors), minFactor: Math.min(...factors),
             meanFactor: cum > 0 ? wTotal / cum : 1 };
  }
  function _paceLookup(remap, tLinear) {
    if (!remap) return tLinear;
    const pt = remap.t, pu = remap.u;
    let lo = 0, hi = pt.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pt[mid] <= tLinear) lo = mid; else hi = mid; }
    const span = pt[hi] - pt[lo];
    const f = span > 1e-6 ? (tLinear - pt[lo]) / span : 0;
    return pu[lo] + (pu[hi] - pu[lo]) * f;
  }

  // ═══════════ §TOUR_TIMELINE_SCRUB — the tour as a TIMELINE, pose = f(T) ═══════════
  // Implementing FLY_TOUR_CORRIDOR_GRAPH.md §TOUR_TIMELINE_SCRUB (verdict 2026-07-25: "bespoke seek
  // in tour.js; borrow TM's DOCTRINE and VISUAL LANGUAGE, not its code").
  // Witnesses: W-SCRUB-DETERMINISM, W-SCRUB-HOLD, W-SCRUB-BEAT, W-SCRUB-OVERLAY.
  //
  // THE ONE ARCHITECTURAL MOVE (spec's own words): once the action list is known, walk it ONCE and
  // have each action report its END pose, chaining into the next action's START pose. Every action
  // is then eagerly inited with a STATIC start (no live-camera capture at action entry, no lazy
  // init at walkActionT===0) and the whole tour becomes a deterministic pose = f(T) — a TIMELINE,
  // not a playback side-effect. This is what makes random-access seeking legal at all.
  //
  // Why LIVE-REPLAY and not a baked video (spec §"ours quite on the fly"): cinema_maxq.js's export
  // pipes the canvas through MediaRecorder/captureStream() to a real .webm — pre-render time, then
  // a fixed-size frame lookup. This is the opposite: every seek recomputes the LIVE 3D scene at
  // that exact pose, any window size, still respecting whatever is toggled on screen (night mode /
  // Alt+G GI preview / DLOD nav) because it is a real render, not a video frame.
  function _v3s(v) { return v.x.toFixed(4) + ',' + v.y.toFixed(4) + ',' + v.z.toFixed(4); }
  function _smooth(t) { return t * t * (3 - 2 * t); }

  // _actInit — the SAME init code forward playback always used, with the live-camera reads replaced
  // by the chained (sPos, sTgt) start pose. Idempotent via act._inited: a re-prepare must never
  // re-apply flyPath's meanFactor rescale of act.duration twice.
  function _actInit(act, sPos, sTgt, nextAct) {
    if (act._inited) return;
    act._inited = true;
    act._startPos = sPos.clone();
    act._startTarget = sTgt.clone();
    act._duration = 0;

    if (act.type === 'moveTo') {
      var dest = new THREE.Vector3(act.x, act.y + A.WALK_EYE_HEIGHT, act.z);
      act._dist = sPos.distanceTo(dest);
      var speed = act._dist > 5 ? Math.max(A.WALK_SPEED, act._dist / 3.0) : A.WALK_SPEED;
      // §TOUR_TIMELINE_SCRUB: speed multipliers are NO LONGER baked into duration — they are a dt
      // multiplier in walkTick, so _tourTotal is a stable constant the mm:ss readout can cite.
      act._duration = Math.max(act._dist / (speed * (act.speedMul || 1)), 0.3);
      if (act.speedMul) A.wlog('§INTERIOR_PACING moveTo "' + act.name + '" speedMul=' + act.speedMul + ' dur=' + act._duration.toFixed(1) + 's');
      if (act.dynamicPace) {
        var PACE_SAMPLES = 8, samplePts = [];
        for (var si = 0; si < PACE_SAMPLES; si++) samplePts.push(act._startPos.clone().lerp(dest, si / (PACE_SAMPLES - 1)));
        act._paceRemap = _paceBuildRemap(samplePts, function(p) { return _invPace(p.distanceTo(dest), 10, 1); });
        if (act._paceRemap) {
          act._duration = Math.max(act._duration * act._paceRemap.meanFactor, 0.3);
          A.wlog('§INTERIOR_PACING moveTo "' + act.name + '" distPace min=' + act._paceRemap.minFactor.toFixed(2) + ' max=' + act._paceRemap.maxFactor.toFixed(2) + ' mean=' + act._paceRemap.meanFactor.toFixed(2) + ' dur=' + act._duration.toFixed(1) + 's');
        }
      }
      if (nextAct && nextAct.lookAtX !== undefined && nextAct.lookAtZ !== undefined) {
        act._endLookX = nextAct.lookAtX;
        act._endLookZ = nextAct.lookAtZ;
      }

    } else if (act.type === 'lookAround') {
      var totalDeg = act.degrees || 360;
      if (act.lookAtX !== undefined && act.lookAtZ !== undefined) {
        act._startRad = Math.atan2(act.lookAtX - sPos.x, act.lookAtZ - sPos.z) - totalDeg / 2 * Math.PI / 180;
      } else {
        act._startRad = Math.atan2(sTgt.x - sPos.x, sTgt.z - sPos.z);
      }
      // Exact conversion of the old walkPanAngle accumulator: it integrated a CONSTANT rate
      // (PAN_SPEED deg/s), so elapsed-time/duration is the identical progress, now pure-from-t.
      act._duration = Math.max(totalDeg / A.PAN_SPEED, 0.1);

    } else if (act.type === 'rise') {
      act._targetY = act.targetY + A.WALK_EYE_HEIGHT;
      act._dy = act._targetY - sPos.y;
      // Old form stepped a constant 1.0 m/s until |dy| < 0.05 — linear, so t-form is exact.
      act._duration = Math.abs(act._dy) / 1.0;
      if (act._duration < 0.05) act._duration = 0;

    } else if (act.type === 'pause') {
      act._duration = act.seconds || 1;

    } else if (act.type === 'orbit') {
      var tiltRad = (act.tiltDeg || 40) * Math.PI / 180;
      var totalRad = act.fullCircle ? Math.PI * 2 : Math.PI;
      act._startAngle = Math.atan2(sPos.z - act.cz, sPos.x - act.cx);
      act._startY = sPos.y;
      act._groundY = act.cy + A.WALK_EYE_HEIGHT;
      var orbitHInit = act.cy + act.radius * Math.sin(tiltRad);
      var oPts = [], OP = 10;
      for (var oi = 0; oi < OP; oi++) {
        var tt = oi / (OP - 1), smoothTt = _smooth(tt);
        var angTt = act._startAngle + totalRad * smoothTt, camYtt;
        if (tt < 0.2) { var ht = tt / 0.2; camYtt = act._startY + (orbitHInit - act._startY) * _smooth(ht); }
        else if (tt < 0.6) camYtt = orbitHInit;
        else { var dt2 = (tt - 0.6) / 0.4; camYtt = orbitHInit + (act._groundY - orbitHInit) * _smooth(dt2); }
        var descTt = tt > 0.6 ? (tt - 0.6) / 0.4 : 0;
        var tiltTt = tiltRad * (1 - descTt * descTt);
        oPts.push(new THREE.Vector3(act.cx + Math.cos(angTt) * act.radius * Math.cos(tiltTt), camYtt,
                                    act.cz + Math.sin(angTt) * act.radius * Math.cos(tiltTt)));
      }
      act._paceRemap = _paceBuildRemap(oPts, function(p) { return _invPace(Math.abs(p.y - act._groundY), 15, 1); });
      if (act._paceRemap) {
        act._duration = Math.max((act.duration || 8) * act._paceRemap.meanFactor, 2);
        A.wlog('§INTERIOR_PACING orbit heightPace min=' + act._paceRemap.minFactor.toFixed(2) + ' max=' + act._paceRemap.maxFactor.toFixed(2) + ' mean=' + act._paceRemap.meanFactor.toFixed(2) + ' dur=' + act._duration.toFixed(1) + 's');
      } else {
        act._duration = act.duration || 8;
      }

    } else if (act.type === 'riseAndTilt') {
      act._startY = sPos.y; act._startX = sPos.x; act._startZ = sPos.z;
      act._duration = Math.abs(act.targetY - act._startY) < 0.1 ? 0 : 5.0;

    } else if (act.type === 'flyPath') {
      try {
        var rawPts = act.points.map(function(p) { return new THREE.Vector3(p.x, p.y, p.z); });
        var distToFirst = sPos.distanceTo(rawPts[0]);
        var pts3 = distToFirst > 3 ? [sPos.clone()].concat(rawPts) : rawPts;
        act._curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.5);
        act._totalLen = act._curve.getLength();
        act._prevLook = sTgt.clone();
        console.log('[TOUR] §FLYPATH_INIT pts=' + pts3.length + ' len=' + act._totalLen.toFixed(1) + ' dur=' + act.duration + ' first=(' + rawPts[0].x.toFixed(1) + ',' + rawPts[0].y.toFixed(1) + ',' + rawPts[0].z.toFixed(1) + ') start=(' + sPos.x.toFixed(1) + ',' + sPos.y.toFixed(1) + ',' + sPos.z.toFixed(1) + ')');
        if (!act._totalLen || act._totalLen < 1) {
          console.warn('[TOUR] §FLYPATH_SKIP degenerate curve len=' + act._totalLen);
          act._degenerate = true; act._duration = 0; return;
        }
        act._paceRemap = _paceBuildRemap(pts3, function(p, i) { return _losPace(pts3, i); });
        if (act._paceRemap) {
          act.duration = Math.max((act.duration || 30) * act._paceRemap.meanFactor, 3);
          console.log('[TOUR] §TIGHT_TURN_PACING verts=' + pts3.length + ' losRange=[' + act._paceRemap.minFactor.toFixed(2) + ',' + act._paceRemap.maxFactor.toFixed(2) + '] mean=' + act._paceRemap.meanFactor.toFixed(2) + ' dur=' + act.duration.toFixed(1) + 's');
        }
        act._lookAheadFrac = act._totalLen > 0 ? Math.min(0.05, LOOKAHEAD_M / act._totalLen) : 0.05;
        console.log('[TOUR] §TARGET_BOUNDED_LOOKAHEAD totalLen=' + act._totalLen.toFixed(1) + ' lookAheadM=' + LOOKAHEAD_M + ' frac=' + act._lookAheadFrac.toFixed(4));
        act._duration = act.duration || 30;
      } catch (e) {
        console.error('[TOUR] §FLYPATH_CRASH', e.message);
        act._degenerate = true; act._duration = 0;
      }
    }
    if (!(act._duration >= 0)) act._duration = 0;
  }
  // _actPose — PURE: given an inited action and a LINEAR time fraction, return {pos, tgt}. No live
  // camera reads, no frame history, no side effects. Identical math to the per-frame code it
  // replaced; the pace remaps are applied here exactly where walkTick applied them before.
  // flyPath's tgt is the RAW look point — the _prevLook lerp is frame-history and lives in walkTick
  // (playback) / tourSeek (snap-on-jump), never here.
  function _actPose(act, tLinear) {
    var t = Math.max(0, Math.min(tLinear, 1));
    var pos = act._startPos.clone(), tgt = act._startTarget.clone();

    if (act.type === 'moveTo') {
      var s = _smooth(t);
      if (act._paceRemap) s = _paceLookup(act._paceRemap, s);
      var dest = new THREE.Vector3(act.x, act.y + A.WALK_EYE_HEIGHT, act.z);
      pos.lerpVectors(act._startPos, dest, s);
      var endTarget;
      if (act._endLookX !== undefined) {
        var dx = act._endLookX - act.x, dz = act._endLookZ - act.z;
        var len = Math.hypot(dx, dz) || 1;
        endTarget = new THREE.Vector3(act.x + dx / len * 3.0, act.y + A.WALK_EYE_HEIGHT, act.z + dz / len * 3.0);
      } else { endTarget = dest.clone(); endTarget.z += 0.1; }
      var aheadTarget = dest.clone(); aheadTarget.z += 0.1;
      if (t < 0.6) {
        tgt.lerpVectors(act._startTarget, aheadTarget, s);
      } else {
        var midTarget = new THREE.Vector3().lerpVectors(act._startTarget, aheadTarget, _smooth(t));
        var turnT = (t - 0.6) / 0.4;
        tgt.lerpVectors(midTarget, endTarget, _smooth(turnT));
      }

    } else if (act.type === 'lookAround') {
      var totalDeg = act.degrees || 360, eased;
      if (t < 0.15) { var p1 = t / 0.15; eased = 0.15 * _smooth(p1); }
      else if (t > 0.85) { var p2 = (t - 0.85) / 0.15; eased = 0.85 + 0.15 * _smooth(p2); }
      else eased = t;
      var rad = (act._startRad || 0) + eased * totalDeg * Math.PI / 180;
      tgt.set(pos.x + 3.0 * Math.sin(rad),
              (act.lookAtY !== undefined) ? act.lookAtY : pos.y,
              pos.z + 3.0 * Math.cos(rad));

    } else if (act.type === 'rise') {
      pos.y = act._startPos.y + act._dy * t;
      tgt.y = act._startTarget.y + act._dy * t;

    } else if (act.type === 'pause') {
      /* pose held — this is the zero-drift beat by construction */

    } else if (act.type === 'orbit') {
      var tiltRad = (act.tiltDeg || 40) * Math.PI / 180;
      var totalRad = act.fullCircle ? Math.PI * 2 : Math.PI;
      var to = act._paceRemap ? _paceLookup(act._paceRemap, t) : t;
      var smooth = _smooth(to);
      var ang = act._startAngle + totalRad * smooth;
      var orbitH = act.cy + act.radius * Math.sin(tiltRad), camY;
      if (to < 0.2) camY = act._startY + (orbitH - act._startY) * _smooth(to / 0.2);
      else if (to < 0.6) camY = orbitH;
      else camY = orbitH + (act._groundY - orbitH) * _smooth((to - 0.6) / 0.4);
      var descentProgress = to > 0.6 ? (to - 0.6) / 0.4 : 0;
      var effectiveTilt = tiltRad * (1 - descentProgress * descentProgress);
      var wantPos = new THREE.Vector3(act.cx + Math.cos(ang) * act.radius * Math.cos(effectiveTilt), camY,
                                      act.cz + Math.sin(ang) * act.radius * Math.cos(effectiveTilt));
      var wantTarget = new THREE.Vector3(act.cx, act.cy + (camY - act.cy) * descentProgress, act.cz);
      if (to < 0.2) {
        var bs = _smooth(to / 0.2);
        pos.lerpVectors(act._startPos, wantPos, bs);
        tgt.lerpVectors(act._startTarget, wantTarget, bs);
      } else { pos.copy(wantPos); tgt.copy(wantTarget); }
      act._lastAngle = ang;

    } else if (act.type === 'riseAndTilt') {
      var sm = _smooth(t);
      pos.set(act._startX, act._startY + (act.targetY - act._startY) * sm, act._startZ);
      var tr = (act.tiltDeg || 80) * Math.PI / 180 * sm;
      var wt = new THREE.Vector3(act._startX, pos.y - 5.0 * Math.sin(tr), act._startZ + 5.0 * Math.cos(tr) * 0.1);
      tgt.lerpVectors(act._startTarget, wt, sm);

    } else if (act.type === 'flyPath') {
      if (act._degenerate) return { pos: pos, tgt: tgt };
      var tf = act._paceRemap ? _paceLookup(act._paceRemap, t) : t;
      pos.copy(act._curve.getPointAt(tf));
      tgt.copy(act._curve.getPointAt(Math.min(tf + (act._lookAheadFrac || 0.05), 0.999)));
    }
    return { pos: pos, tgt: tgt };
  }

  // A._tourPrepare — the build-time chain. Runs ONCE per tour activation, after walkActions is set.
  // NOTE (deviation from the spec's literal "at the end of buildTour()"): the §TOUR_CACHE fast path
  // (_startFlyTour, the A._tourCachedRoute branch) never calls buildTour at all — a cached route is
  // plain JSON. Preparing at the walkActions assignment point covers BOTH paths, and it must also
  // run AFTER the cache store so the stored JSON stays free of the runtime remaps.
  A._tourPrepare = function() {
    var acts = A.walkActions;
    if (!acts || !acts.length) return;
    var t0 = performance.now();
    var pos = A.camera.position.clone(), tgt = A.controls.target.clone();
    A._tourStarts = [];
    var cum = 0;
    for (var i = 0; i < acts.length; i++) {
      var act = acts[i];
      act._inited = false;
      _actInit(act, pos, tgt, acts[i + 1]);
      var end = _actPose(act, 1.0);
      A._tourStarts.push(cum);
      cum += act._duration;
      pos = end.pos; tgt = end.tgt;
    }
    A._tourTotal = cum;
    A._tourT = 0;
    var brk = [];
    for (var j = 0; j < acts.length; j++) brk.push(acts[j].type + ':' + acts[j]._duration.toFixed(2));
    console.log('[TOUR] §SCRUB_PREPARE actions=' + acts.length + ' total=' + cum.toFixed(3) + 's prepMs=' + (performance.now() - t0).toFixed(1) + ' endPose=' + _v3s(pos));
    console.log('[TOUR] §SCRUB_BEATS ' + brk.join(' | '));
  };

  // A.tourSeek — absolute random-access seek. Single writer of (walkActionIdx, walkActionT, _tourT).
  // soft=true keeps the flyPath gaze lerp (small in-place drag deltas, the user's "smooth to play
  // forward backward"); every other seek SNAPS _prevLook to the raw target so the pose is pure
  // f(T) — that is what makes re-seeking the same T land on the identical frame.
  A.tourSeek = function(T, soft) {
    if (!A.walkActions || !A.walkActions.length || !A._tourStarts) return null;
    T = Math.max(0, Math.min(T, A._tourTotal));
    var lo = 0, hi = A._tourStarts.length - 1, idx = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (A._tourStarts[mid] <= T) { idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    var act = A.walkActions[idx];
    if (!act._inited) _actInit(act, A.camera.position.clone(), A.controls.target.clone(), A.walkActions[idx + 1]);
    A.walkActionIdx = idx;
    A.walkActionT = T - A._tourStarts[idx];
    var t = act._duration > 0 ? Math.min(A.walkActionT / act._duration, 1) : 0;
    var p = _actPose(act, t);
    A.camera.position.copy(p.pos);
    if (act.type === 'flyPath' && !act._degenerate) {
      if (!act._prevLook) act._prevLook = p.tgt.clone();
      if (soft) act._prevLook.lerp(p.tgt, 0.35); else act._prevLook.copy(p.tgt);
      A.controls.target.copy(act._prevLook);
    } else {
      A.controls.target.copy(p.tgt);
    }
    A.walkPanAngle = (act.type === 'lookAround') ? t * (act.degrees || 360) : 0;
    if (act.type === 'orbit' && act._lastAngle !== undefined) A.walkOrbitAngle = act._lastAngle;
    A.controls.update();
    A._tourT = T;
    A.walkLastTime = 0;               // next played frame must not integrate the scrub gap
    if (A.markDirty) A.markDirty();
    console.log('[TOUR] §SCRUB_SEEK T=' + T.toFixed(4) + ' idx=' + idx + ' t=' + t.toFixed(6) +
                ' mode=' + (soft ? 'soft' : 'hard') + ' pos=' + _v3s(A.camera.position) + ' tgt=' + _v3s(A.controls.target));
    return { T: T, idx: idx, t: t, pos: A.camera.position.clone(), tgt: A.controls.target.clone() };
  };

  // A.tourStepBeat — EXACT action-boundary jump (spec §4: "the reason beat boundaries must be
  // exact, not approximate scrub positions"). dir<0 = nearest boundary strictly before the cursor.
  A.tourStepBeat = function(dir) {
    if (!A._tourStarts) return null;
    var cur = A._tourT || 0, EPS = 1e-4, target = null, i;
    if (dir < 0) {
      for (i = A._tourStarts.length - 1; i >= 0; i--) {
        if (A._tourStarts[i] < cur - EPS) { target = A._tourStarts[i]; break; }
      }
      if (target === null) target = 0;
    } else {
      for (i = 0; i < A._tourStarts.length; i++) {
        if (A._tourStarts[i] > cur + EPS) { target = A._tourStarts[i]; break; }
      }
      if (target === null) target = A._tourTotal;
    }
    var r = A.tourSeek(target, false);
    console.log('[TOUR] §SCRUB_BEAT dir=' + (dir < 0 ? 'prev' : 'next') + ' from=' + cur.toFixed(4) + ' to=' + target.toFixed(4) + ' idx=' + A.walkActionIdx);
    _scrubAfterJump();
    return r;
  };
  function _statusFor(act, t, spd) {
    var s;
    if (act.type === 'moveTo') s = (act.name || 'Walking...') + ' [' + spd + 'x] camY=' + A.camera.position.y.toFixed(1);
    else if (act.type === 'lookAround') s = 'Looking around ' + (t * (act.degrees || 360)).toFixed(0) + '° [' + spd + 'x]';
    else if (act.type === 'rise') s = (act.name || 'Rising...') + ' camY=' + A.camera.position.y.toFixed(1) + ' → ' + act._targetY.toFixed(1);
    else if (act.type === 'orbit') s = 'Aerial sweep ' + (t * 100).toFixed(0) + '% [' + spd + 'x]';
    else if (act.type === 'riseAndTilt') s = (act.name || "Bird's eye") + ' ' + (t * 100).toFixed(0) + '% [' + spd + 'x]';
    else if (act.type === 'flyPath') {
      var label = '';
      if (act.names && act.names.length) {
        for (var ni = Math.round(t * (act.names.length - 1)); ni >= 0; ni--) { if (act.names[ni]) { label = act.names[ni]; break; } }
      }
      s = (label || 'Flying...') + ' ' + (t * 100).toFixed(0) + '% [' + spd + 'x]';
    } else return;
    A.status.textContent = s;
  }

  function _wlogDone(act) {
    if (act.type === 'moveTo' && act.name) A.wlog('Arrived: ' + act.name + ' camY=' + A.camera.position.y.toFixed(2));
    else if (act.type === 'rise') A.wlog('Rise done: camY=' + A.camera.position.y.toFixed(2));
    else if (act.type === 'orbit') A.wlog('Orbit complete');
    else if (act.type === 'riseAndTilt') A.wlog('RiseAndTilt done: camY=' + A.camera.position.y.toFixed(2));
    else if (act.type === 'flyPath') A.wlog('FlyPath complete');
  }

  // Action-based walkTick — now a THIN driver over the pose = f(T) timeline above: advance the
  // cursor by dt, evaluate, apply. Every per-action formula lives in _actInit/_actPose so playback
  // and scrub-seek can never diverge (the spec's "reusing the SAME init code forward playback uses").
  A.walkTick = function() {
    if (!A.walkMode || !A.walkActions || A.walkActions.length === 0) return;

    // §TOUR_TIMELINE_SCRUB knob 3 — pause HOLDS the pose: nothing writes the camera while paused,
    // so a presenter can hold a frame indefinitely with zero drift (W-SCRUB-HOLD).
    if (A._tourPaused) { _scrubSync(); return; }

    if (A.walkActionIdx >= A.walkActions.length) {
      A.walkMode = false;
      A.flyActive = false;
      A.walkActionIdx = 0;
      A.walkActionT = 0;
      A.walkPanAngle = 0;
      var btnE = document.getElementById('fly-btn');
      if (btnE) btnE.classList.remove('active');
      A.status.textContent = 'Tour complete.';
      A.wlog('Tour complete');
      if (A._scrubHide) A._scrubHide();
      return;
    }

    var now = performance.now();
    var dt = A.walkLastTime > 0 ? Math.min((now - A.walkLastTime) / 1000, 0.1) : 0.016;
    A.walkLastTime = now;

    // §TOUR_TIMELINE_SCRUB knob 4 — speed is a pure dt multiplier (narration pacing: 0.5x for a
    // presenter talking over a beat, 2x to skip ahead). Durations stay baked at 1x so _tourTotal
    // and the mm:ss readout are stable regardless of playback speed.
    var spd = (A.walkSpeedMult || 1) * (A.tourScrubSpeed || 1);
    dt *= spd;

    var act = A.walkActions[A.walkActionIdx];
    if (!act._inited) _actInit(act, A.camera.position.clone(), A.controls.target.clone(), A.walkActions[A.walkActionIdx + 1]);

    var _prevCamPos = A.camera.position.clone();
    var _prevTarget = A.controls.target.clone();

    if (!(act._duration > 0)) {           // degenerate/zero-length beat — nothing to play
      A.walkActionIdx++; A.walkActionT = 0;
      A._tourT = A._tourStarts ? A._tourStarts[Math.min(A.walkActionIdx, A._tourStarts.length - 1)] : 0;
      return;
    }

    A.walkActionT += dt;
    var t = Math.min(A.walkActionT / act._duration, 1.0);
    var p = _actPose(act, t);
    A.camera.position.copy(p.pos);
    if (act.type === 'flyPath' && !act._degenerate) {
      // §SOFTEN (user 2026-07-16) — gaze smoothing stays exactly as shipped for PLAYBACK; it is
      // frame-history dependent, which is why tourSeek snaps it instead of inheriting it.
      if (!act._prevLook) act._prevLook = p.tgt.clone();
      act._prevLook.lerp(p.tgt, 0.08);
      A.controls.target.copy(act._prevLook);
    } else {
      A.controls.target.copy(p.tgt);
    }
    A.controls.update();
    if (act.type === 'lookAround') A.walkPanAngle = t * (act.degrees || 360);
    _statusFor(act, t, spd);
    A._tourT = (A._tourStarts ? A._tourStarts[A.walkActionIdx] : 0) + A.walkActionT;

    if (t >= 1.0) {
      _wlogDone(act);
      A.walkActionIdx++;
      A.walkActionT = 0;
      A.walkPanAngle = 0;
    }
    _scrubSync();

    // ── Adaptive smoothing: dampens SUDDEN jumps only (action transitions/reversals) — unchanged
    // from before §TOUR_TIMELINE_SCRUB. It is PLAYBACK-only: tourSeek writes the pure pose directly
    // and never runs this, which is what keeps a re-seek bit-identical.
    var posDelta = _prevCamPos.distanceTo(A.camera.position);
    var tgtDelta = _prevTarget.distanceTo(A.controls.target);
    var maxDelta = Math.max(posDelta, tgtDelta);
    if (maxDelta >= 0.5) {
      var SMOOTH = maxDelta > 2 ? 0.12 : 0.3;
      A.camera.position.lerpVectors(_prevCamPos, A.camera.position, SMOOTH);
      A.controls.target.lerpVectors(_prevTarget, A.controls.target, SMOOTH);
      A.controls.update();
    }
  };
  // ═══════════ §TOUR_TIMELINE_SCRUB — UI ═══════════
  // Visual doctrine borrowed from time_machine.js's panel (376px glass, #4fc3f7 accent, native
  // <input type=range> thumb, 3px progress bar with transition:width 0.2s) — the LOOK, not the code
  // (TM's slider is mode-relative DAY/HR/MIN, nothing to reuse for a playhead).
  // 🚫 NOT a rotary dial: common/history_knob.js (PR #230) was rejected outright ("hard to control,
  // orange halo useless, no hover") and deleted. Linear bar + draggable thumb only.
  // The bar simply APPEARS when the tour begins (user 2026-07-25, TM-style) — no reveal icon, no
  // hidden state; the superseded record-dot design is deliberately not built.
  var SCRUB_RES = 1000;
  var _scrubPanel = null, _scrubSlider = null, _scrubDragging = false;
  var _scrubLastSyncMs = 0, _scrubDragT = -1;

  function _fmtMS(s) {
    if (!(s >= 0)) s = 0;
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function _beatName(act, i) {
    if (act.name) return act.name;
    if (act.type === 'flyPath' && act.names) {
      for (var k = 0; k < act.names.length; k++) if (act.names[k]) return act.names[k];
    }
    var m = { orbit: 'Aerial sweep', moveTo: 'Approach', lookAround: 'Look around', rise: 'Rise',
              riseAndTilt: "Bird's eye", pause: 'Hold', flyPath: 'Corridor' };
    return (m[act.type] || act.type) + ' ' + (i + 1);
  }
  // Re-evaluate DLOD ONCE, on scrub RELEASE — never per `input` event (per-event re-eval janks the
  // drag; time_machine.js has no debounce at all on its own input path, :2595 — explicitly not
  // copied). dlodTick self-throttles on a frame counter, so force this one call through.
  function _scrubAfterJump() {
    if (A.dlodTick) { A._dlodFrame = -1; try { A.dlodTick(); } catch (e) {} }
    _scrubSync(true);
  }

  function _scrubBuild() {
    if (_scrubPanel) return;
    _scrubPanel = document.createElement('div');
    _scrubPanel.id = 'tour-scrub-panel';
    var tmp = document.getElementById('time-machine-panel');
    var bottom = (tmp && tmp.style.display && tmp.style.display !== 'none') ? '260px' : '80px';
    _scrubPanel.style.cssText =
      'position:fixed;bottom:' + bottom + ';left:50%;transform:translateX(-50%);z-index:250;' +
      'display:none;flex-direction:column;gap:6px;padding:10px 16px;' +
      'background:rgba(20,20,40,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(79,195,247,0.3);border-radius:12px;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.5);color:#e0e0e0;font-family:sans-serif;' +
      'width:376px;user-select:none;touch-action:none;';
    _scrubPanel.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;width:100%">' +
        '<span id="tour-scrub-label" style="flex:1;color:#4fc3f7;font-weight:bold;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Fly Tour</span>' +
        '<span id="tour-scrub-time" style="font-size:13px;color:#ccc;font-variant-numeric:tabular-nums">0:00 / 0:00</span>' +
      '</div>' +
      '<div id="tour-scrub-ticks" style="position:relative;width:100%;height:10px"></div>' +
      '<input id="tour-scrub-slider" type="range" min="0" max="' + SCRUB_RES + '" step="1" value="0" style="width:100%;accent-color:#4fc3f7">' +
      '<div style="width:100%;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">' +
        '<div id="tour-scrub-progress" style="height:100%;width:0%;background:#4fc3f7;transition:width 0.2s"></div>' +
      '</div>' +
      '<div style="display:flex;gap:4px;width:100%;height:30px;align-items:stretch">' +
        '<button id="tour-scrub-restart" style="width:34px;font-size:13px" title="Restart tour from the beginning">&#x21BA;</button>' +
        '<button id="tour-scrub-prev" style="width:38px;font-size:13px" title="Previous beat (exact action boundary)">&#x25C0;&#x25C0;</button>' +
        '<button id="tour-scrub-play" style="width:38px;font-size:14px" title="Play / pause">&#x23F8;</button>' +
        '<button id="tour-scrub-next" style="width:38px;font-size:13px" title="Next beat (exact action boundary)">&#x25B6;&#x25B6;</button>' +
        '<span style="flex:1"></span>' +
        '<button class="tour-scrub-spd" data-spd="0.5" style="width:38px;font-size:11px" title="Half speed — narration pacing">0.5x</button>' +
        '<button class="tour-scrub-spd" data-spd="1" style="width:34px;font-size:11px" title="Normal speed">1x</button>' +
        '<button class="tour-scrub-spd" data-spd="2" style="width:34px;font-size:11px" title="Double speed — skip ahead">2x</button>' +
      '</div>';
    document.body.appendChild(_scrubPanel);
    // The panel is a fixed overlay, not a canvas child — picking.js's tour-abort listener is bound
    // to A.canvas, so panel pointers never reach it. stopPropagation is belt-and-braces.
    _scrubPanel.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
    _scrubWireDrag();

    _scrubSlider = document.getElementById('tour-scrub-slider');
    _scrubSlider.addEventListener('pointerdown', function() { _scrubDragging = true; _scrubDragT = A._tourT || 0; });
    _scrubSlider.addEventListener('input', function() {
      var T = (parseFloat(_scrubSlider.value) / SCRUB_RES) * (A._tourTotal || 0);
      var prevIdx = A.walkActionIdx;
      A.tourSeek(T, false);
      // Keep the gaze lerp only for SMALL in-place drag deltas within one beat; a big jump or a
      // beat change snaps (tourSeek already snapped above — re-apply softly when it was small).
      var small = _scrubDragging && Math.abs(T - _scrubDragT) < 0.5 && prevIdx === A.walkActionIdx;
      if (small) A.tourSeek(T, true);
      _scrubDragT = T;
      _scrubSync(true);
    });
    var release = function() {
      if (!_scrubDragging) return;
      _scrubDragging = false;
      var T = (parseFloat(_scrubSlider.value) / SCRUB_RES) * (A._tourTotal || 0);
      A.tourSeek(T, false);               // final HARD seek: the resting pose after a drag is pure f(T)
      console.log('[TOUR] §SCRUB_RELEASE T=' + T.toFixed(4) + ' idx=' + A.walkActionIdx + ' pos=' + _v3s(A.camera.position));
      _scrubAfterJump();
    };
    _scrubSlider.addEventListener('change', release);
    _scrubSlider.addEventListener('pointerup', release);
    _scrubSlider.addEventListener('touchend', release);

    document.getElementById('tour-scrub-restart').onclick = function() { A.tourSeek(0, false); _scrubAfterJump(); console.log('[TOUR] §SCRUB_RESTART'); };
    document.getElementById('tour-scrub-prev').onclick = function() { A.tourStepBeat(-1); };
    document.getElementById('tour-scrub-next').onclick = function() { A.tourStepBeat(1); };
    document.getElementById('tour-scrub-play').onclick = function() { A.tourTogglePause(); };
    var spds = _scrubPanel.querySelectorAll('.tour-scrub-spd');
    for (var i = 0; i < spds.length; i++) {
      spds[i].onclick = function() { A.tourSetSpeed(parseFloat(this.getAttribute('data-spd'))); };
    }
  }

  // ═══════════ §SCRUB_PANEL_DRAG — movable panel (FLY_TOUR_CORRIDOR_GRAPH.md §SCRUB_PANEL_DRAG) ═══
  // WHY: §2 item 2 of the usage review asked whether the always-on bar competes with the cinematic
  // view. Moving it answers that WITHOUT reopening the rejected hidden/reveal-icon design — the
  // presenter parks it off whatever they are showing, and it stays put across beats and reloads.
  // The panel is the ONLY thing that moves: a panel drag must never write the timeline (W-SCRUB-
  // PANEL-DRAG asserts A._tourT and the camera pose are byte-identical across a drag).
  var SCRUB_POS_KEY = 'bim.tourScrub.pos';
  var _scrubDragPan = null;            // {dx, dy, id} while a panel drag is live, else null

  // Clamp fully on-screen — a drag aimed off-viewport parks at the edge, the panel is never lost.
  function _scrubClampPos(left, top) {
    var w = _scrubPanel.offsetWidth, h = _scrubPanel.offsetHeight;
    return { left: Math.max(0, Math.min(left, window.innerWidth - w)),
             top:  Math.max(0, Math.min(top,  window.innerHeight - h)) };
  }
  // Shipped default is bottom-centre via left:50% + translateX(-50%). Freeze that into explicit
  // left/top px measured from the CURRENT rect, so the first grab cannot shift under the cursor.
  function _scrubFreezePos() {
    if (_scrubPanel.style.transform === 'none') return;
    var r = _scrubPanel.getBoundingClientRect();
    _scrubPanel.style.transform = 'none';
    _scrubPanel.style.bottom = 'auto';
    _scrubPanel.style.left = r.left + 'px';
    _scrubPanel.style.top = r.top + 'px';
  }
  function _scrubApplyPos(left, top, why) {
    _scrubFreezePos();
    var c = _scrubClampPos(left, top);
    var clamped = (c.left !== left || c.top !== top);
    _scrubPanel.style.left = c.left + 'px';
    _scrubPanel.style.top = c.top + 'px';
    if (why) console.log('[TOUR] §SCRUB_PANEL_POS ' + why + ' left=' + c.left.toFixed(1) +
                         ' top=' + c.top.toFixed(1) + ' clamped=' + clamped);
    return c;
  }
  function _scrubSavePos() {
    try {
      var r = _scrubPanel.getBoundingClientRect();
      localStorage.setItem(SCRUB_POS_KEY, JSON.stringify({ left: r.left, top: r.top }));
    } catch (e) {}
  }
  // Restore on every show — re-clamped, because the viewport may have resized since it was stored.
  function _scrubRestorePos() {
    var raw = null;
    try { raw = localStorage.getItem(SCRUB_POS_KEY); } catch (e) {}
    if (!raw) return false;
    var p; try { p = JSON.parse(raw); } catch (e) { return false; }
    if (!p || !isFinite(p.left) || !isFinite(p.top)) return false;
    _scrubApplyPos(p.left, p.top, 'restore');
    return true;
  }
  function _scrubResetPos() {
    try { localStorage.removeItem(SCRUB_POS_KEY); } catch (e) {}
    var tmp = document.getElementById('time-machine-panel');
    _scrubPanel.style.bottom = (tmp && tmp.style.display && tmp.style.display !== 'none') ? '260px' : '80px';
    _scrubPanel.style.top = 'auto';
    _scrubPanel.style.left = '50%';
    _scrubPanel.style.transform = 'translateX(-50%)';
    console.log('[TOUR] §SCRUB_PANEL_POS reset left=50% (bottom-centre default restored)');
  }

  function _scrubWireDrag() {
    // Handle = the panel BACKGROUND only. The slider, the four knob groups and the clickable
    // chapter ticks keep their exact shipped behaviour — a pointerdown on any of them is not a drag.
    _scrubPanel.addEventListener('pointerdown', function(e) {
      if (e.target.closest && e.target.closest('input,button,#tour-scrub-ticks')) return;
      _scrubFreezePos();
      var r = _scrubPanel.getBoundingClientRect();
      _scrubDragPan = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId,
                        from: { left: r.left, top: r.top } };
      try { _scrubPanel.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    _scrubPanel.addEventListener('pointermove', function(e) {
      if (!_scrubDragPan || e.pointerId !== _scrubDragPan.id) return;
      _scrubApplyPos(e.clientX - _scrubDragPan.dx, e.clientY - _scrubDragPan.dy, null);
      e.preventDefault();
    });
    var end = function(e) {
      if (!_scrubDragPan || (e.pointerId !== undefined && e.pointerId !== _scrubDragPan.id)) return;
      var f = _scrubDragPan.from;
      _scrubDragPan = null;
      try { _scrubPanel.releasePointerCapture(e.pointerId); } catch (err) {}
      var r = _scrubPanel.getBoundingClientRect();
      _scrubSavePos();
      console.log('[TOUR] §SCRUB_PANEL_DRAG from=' + f.left.toFixed(1) + ',' + f.top.toFixed(1) +
                  ' to=' + r.left.toFixed(1) + ',' + r.top.toFixed(1) +
                  ' T=' + (A._tourT || 0).toFixed(4) + ' (timeline untouched)');
    };
    _scrubPanel.addEventListener('pointerup', end);
    _scrubPanel.addEventListener('pointercancel', end);
    // Double-click the background → back to the shipped bottom-centre default.
    _scrubPanel.addEventListener('dblclick', function(e) {
      if (e.target.closest && e.target.closest('input,button,#tour-scrub-ticks')) return;
      _scrubResetPos();
    });
  }

  A.tourTogglePause = function(force) {
    A._tourPaused = (force === undefined) ? !A._tourPaused : !!force;
    if (!A._tourPaused) { A.walkLastTime = 0; if (A.markDirty) A.markDirty(); }
    var b = document.getElementById('tour-scrub-play');
    if (b) b.innerHTML = A._tourPaused ? '&#x25B6;' : '&#x23F8;';
    console.log('[TOUR] §SCRUB_PAUSE paused=' + A._tourPaused + ' T=' + (A._tourT || 0).toFixed(4) + ' pos=' + _v3s(A.camera.position));
    return A._tourPaused;
  };

  A.tourSetSpeed = function(mult) {
    A.tourScrubSpeed = mult;
    var spds = _scrubPanel ? _scrubPanel.querySelectorAll('.tour-scrub-spd') : [];
    for (var i = 0; i < spds.length; i++) {
      var on = parseFloat(spds[i].getAttribute('data-spd')) === mult;
      spds[i].style.background = on ? '#4fc3f7' : '';
      spds[i].style.color = on ? '#06121a' : '';
    }
    console.log('[TOUR] §SCRUB_SPEED mult=' + mult + 'x totalUnchanged=' + (A._tourTotal || 0).toFixed(2) + 's');
  };

  // Chapter ticks — one mark per action boundary, LABELLED from walkActions[] (orbit / approach /
  // corridor / stair / room beat) via title, and clickable straight to that beat.
  function _scrubBuildTicks() {
    var box = document.getElementById('tour-scrub-ticks');
    if (!box || !A._tourStarts) return;
    box.innerHTML = '';
    var total = A._tourTotal || 1, n = 0;
    for (var i = 0; i < A.walkActions.length; i++) {
      if (!(A.walkActions[i]._duration > 0)) continue;
      var st = A._tourStarts[i];
      var d = document.createElement('div');
      d.title = _beatName(A.walkActions[i], i) + ' @ ' + _fmtMS(st);
      d.setAttribute('data-t', st);
      d.style.cssText = 'position:absolute;top:0;left:' + ((st / total) * 100).toFixed(3) + '%;' +
        'width:2px;height:10px;background:rgba(79,195,247,0.75);border-radius:1px;cursor:pointer;transform:translateX(-1px)';
      box.appendChild(d); n++;
    }
    box.onclick = function(ev) {
      var raw = ev.target && ev.target.getAttribute ? ev.target.getAttribute('data-t') : null;
      var tt = raw === null ? NaN : parseFloat(raw);
      if (isFinite(tt)) { A.tourSeek(tt, false); console.log('[TOUR] §SCRUB_TICK T=' + tt.toFixed(4)); _scrubAfterJump(); }
    };
    console.log('[TOUR] §SCRUB_TICKS n=' + n + ' total=' + total.toFixed(2) + 's');
  }

  function _scrubSync(force) {
    if (!_scrubPanel || _scrubPanel.style.display === 'none') return;
    var now = performance.now();
    if (!force && now - _scrubLastSyncMs < 100) return;   // 10Hz DOM writes, not 60
    _scrubLastSyncMs = now;
    var total = A._tourTotal || 0, T = A._tourT || 0;
    var frac = total > 0 ? T / total : 0;
    if (!_scrubDragging) _scrubSlider.value = Math.round(frac * SCRUB_RES);
    var pb = document.getElementById('tour-scrub-progress');
    if (pb) pb.style.width = (frac * 100).toFixed(2) + '%';
    var lb = document.getElementById('tour-scrub-label');
    var act = A.walkActions[Math.min(A.walkActionIdx, A.walkActions.length - 1)];
    if (lb && act) lb.textContent = _beatName(act, A.walkActionIdx) + '  (' + (A.walkActionIdx + 1) + '/' + A.walkActions.length + ')';
    var tv = document.getElementById('tour-scrub-time');
    if (tv) tv.textContent = _fmtMS(T) + ' / ' + _fmtMS(total);
  }

  A._scrubShow = function() {
    _scrubBuild();
    _scrubBuildTicks();
    A.tourSetSpeed(A.tourScrubSpeed || 1);
    A.tourTogglePause(false);
    _scrubPanel.style.display = 'flex';
    _scrubRestorePos();          // §SCRUB_PANEL_DRAG — survives tour stop/restart and reload
    _scrubSync(true);
    console.log('[TOUR] §SCRUB_UI show actions=' + A.walkActions.length + ' total=' + (A._tourTotal || 0).toFixed(2) + 's bar=linear-thumb dial=none');
  };
  A._scrubHide = function() {
    if (_scrubPanel) _scrubPanel.style.display = 'none';
    A._tourPaused = false;
  };

  // ── Legacy path builders (kept for fallback) ──
  A.queryWalkPath = function() {
    if (!A.db) return null;
    let waypoints = [];

    let stairs = [];
    try {
      const st = A.db.exec(`
        SELECT t.center_x, t.center_y, t.center_z, m.storey
        FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid
        WHERE m.ifc_class IN ('IfcStair','IfcStairFlight')
        ORDER BY t.center_z
      `);
      if (st.length > 0) stairs = st[0].values;
    } catch(e) {}

    let allDoors = [];
    const interiorDoorGuids = new Set();
    try {
      const ig = A.db.exec(`SELECT DISTINCT via_door_guid FROM walk_graph`);
      if (ig.length) ig[0].values.forEach(([g]) => interiorDoorGuids.add(g));
    } catch(e) {}
    try {
      const ad = A.db.exec(`
        SELECT m.guid, t.center_x, t.center_y, t.center_z, m.storey
        FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid
        WHERE m.ifc_class IN ('IfcDoor','IfcDoorStandardCase')
        ORDER BY m.storey, t.center_z
      `);
      if (ad.length > 0) {
        allDoors = ad[0].values.map(([g, cx, cy, cz, st]) =>
          [g, cx, cy, cz, st, interiorDoorGuids.has(g) ? 1 : 0]
        );
      }
    } catch(e) {}

    // Strategy 1: walk_graph table
    try {
      const wg = A.db.exec(`
        SELECT from_space_guid, to_space_guid, via_door_guid,
               door_x, door_y, door_z, storey
        FROM walk_graph ORDER BY storey, rowid
      `);
      if (wg.length > 0 && wg[0].values.length > 0) {
        console.log(`[S205] §WALK_GRAPH found ${wg[0].values.length} edges, ${stairs.length} stairs, ${allDoors.length} total doors`);
        window._walkStrategy = `GRAPH(${wg[0].values.length}edges,${stairs.length}stairs)`;
        A.wlog(`Strategy: GRAPH ${wg[0].values.length}edges ${stairs.length}stairs ${allDoors.length}doors`);
        const gResult = A.buildWalkGraphPath(wg[0].values, stairs, allDoors);
        if (gResult) gResult.forEach((w,i) => A.wlog(`  wp[${i}] ${w.name} y=${w.y.toFixed(2)}`));
        return gResult;
      }
    } catch(e) { console.warn('[S205] walk_graph strategy failed:', e.message); }

    // Strategy 2: IfcSpace centroids
    try {
      const sp = A.db.exec(`
        SELECT s.guid, s.name, t.center_x, t.center_y, t.center_z, m.storey
        FROM spatial_structure s
        JOIN element_transforms t ON s.guid = t.guid
        JOIN elements_meta m ON s.guid = m.guid
        WHERE s.type = 'IfcSpace'
        ORDER BY m.storey, t.center_x, t.center_y
      `);
      if (sp.length > 0 && sp[0].values.length >= 2) {
        console.log(`[S205] §WALK_SPACES found ${sp[0].values.length} IfcSpaces`);
        window._walkStrategy = `SPACES(${sp[0].values.length})`;
        A.wlog(`Strategy: SPACES ${sp[0].values.length}`);
        const sResult = A.buildSpacePath(sp[0].values, stairs, allDoors);
        if (sResult) sResult.forEach((w,i) => A.wlog(`  wp[${i}] ${w.name} y=${w.y.toFixed(2)}`));
        return sResult;
      }
    } catch(e) { console.warn('[S205] space strategy failed:', e.message); }

    // Strategy 3: IfcDoor positions (fallback)
    try {
      const dr = A.db.exec(`
        SELECT m.guid, m.element_name, t.center_x, t.center_y, t.center_z, m.storey
        FROM elements_meta m
        JOIN element_transforms t ON m.guid = t.guid
        WHERE m.ifc_class IN ('IfcDoor', 'IfcDoorStandardCase')
        ORDER BY m.storey, t.center_x, t.center_y
      `);
      if (dr.length > 0 && dr[0].values.length >= 2) {
        console.log(`[S205] §WALK_DOORS found ${dr[0].values.length} IfcDoors (fallback)`);
        window._walkStrategy = `DOORS(${dr[0].values.length})`;
        A.wlog(`Strategy: DOORS ${dr[0].values.length}`);
        const dResult = A.buildDoorPath(dr[0].values, stairs, allDoors);
        if (dResult) dResult.forEach((w,i) => A.wlog(`  wp[${i}] ${w.name} y=${w.y.toFixed(2)}`));
        return dResult;
      }
    } catch(e) { console.warn('[S205] door strategy failed:', e.message); }

    return null;
  };

  A.buildWalkGraphPath = function(edges, stairs, allDoors) {
    const spaceNames = {};
    try {
      const sn = A.db.exec("SELECT guid, name FROM spatial_structure WHERE type='IfcSpace'");
      if (sn.length) sn[0].values.forEach(([g,n]) => spaceNames[g] = n);
    } catch(e) {}

    const adj = new Map();
    const spaceSt = new Map();
    for (const [fromG, toG, viaG, dx, dy, dz, storey] of edges) {
      if (!adj.has(fromG)) adj.set(fromG, []);
      if (!adj.has(toG)) adj.set(toG, []);
      adj.get(fromG).push({ x: dx, y: dy, z: dz, target: toG });
      adj.get(toG).push({ x: dx, y: dy, z: dz, target: fromG });
      spaceSt.set(fromG, storey);
      spaceSt.set(toG, storey);
    }

    const stairPts = (stairs || []).map(([sx, sy, sz]) => {
      const tp = A.ifc2three(sx, sy, sz);
      return { x: tp.x, y: tp.y, z: tp.z };
    });

    let frontDoorIFC = null;
    if (allDoors && allDoors.length > 0) {
      const exterior = allDoors.filter(d => d[5] === 0);
      if (exterior.length > 0) {
        exterior.sort((a, b) => (a[4] || '').localeCompare(b[4] || ''));
        frontDoorIFC = { x: exterior[0][1], y: exterior[0][2], z: exterior[0][3] };
      }
    }

    const byStorey = new Map();
    for (const [guid, st] of spaceSt) {
      if (!byStorey.has(st)) byStorey.set(st, []);
      byStorey.get(st).push(guid);
    }
    const storeys = [...byStorey.keys()].sort();

    const waypoints = [];
    const visited = new Set();

    if (frontDoorIFC) {
      const tp = A.ifc2three(frontDoorIFC.x, frontDoorIFC.y, frontDoorIFC.z);
      waypoints.push({ x: tp.x, y: tp.y, z: tp.z, name: 'Entrance' });
    }

    for (let si = 0; si < storeys.length; si++) {
      const storey = storeys[si];
      const storeySpaces = byStorey.get(storey);

      if (si > 0 && stairPts.length > 0 && waypoints.length > 0) {
        const last = waypoints[waypoints.length - 1];
        let bestStair = stairPts[0], bestSD = Infinity;
        for (const s of stairPts) {
          const d = Math.hypot(s.x - last.x, s.z - last.z);
          if (d < bestSD) { bestSD = d; bestStair = s; }
        }
        waypoints.push({ x: bestStair.x, y: last.y, z: bestStair.z, name: 'Stairs' });
        waypoints.push({ x: bestStair.x, y: bestStair.y, z: bestStair.z, name: 'Climbing...' });
        const nd = adj.get(storeySpaces[0])?.[0];
        if (nd) {
          const ntp = A.ifc2three(nd.x, nd.y, nd.z);
          waypoints.push({ x: bestStair.x, y: ntp.y, z: bestStair.z, name: storey });
        }
      }

      while (true) {
        let current = null;
        if (waypoints.length > 0) {
          const last = waypoints[waypoints.length - 1];
          let bestD = Infinity;
          for (const g of storeySpaces) {
            if (visited.has(g)) continue;
            for (const d of adj.get(g) || []) {
              const tp = A.ifc2three(d.x, d.y, d.z);
              const dist = Math.hypot(tp.x - last.x, tp.z - last.z);
              if (dist < bestD) { bestD = dist; current = g; }
            }
          }
        }
        if (!current) current = storeySpaces.find(g => !visited.has(g));
        if (!current) break;
        visited.add(current);

        const firstD = adj.get(current)?.[0];
        if (firstD) {
          const tp = A.ifc2three(firstD.x, firstD.y, firstD.z);
          waypoints.push({ x: tp.x, y: tp.y, z: tp.z, name: spaceNames[current] || current });
        }

        while (true) {
          let bestDoor = null, bestDist = Infinity, bestTarget = null;
          for (const d of adj.get(current) || []) {
            if (visited.has(d.target)) continue;
            const tp = A.ifc2three(d.x, d.y, d.z);
            const last = waypoints[waypoints.length - 1] || tp;
            const dist = Math.hypot(tp.x - last.x, tp.z - last.z);
            if (dist < bestDist) { bestDist = dist; bestDoor = d; bestTarget = d.target; }
          }
          if (!bestDoor) break;
          const tp = A.ifc2three(bestDoor.x, bestDoor.y, bestDoor.z);
          waypoints.push({ x: tp.x, y: tp.y, z: tp.z, name: spaceNames[bestTarget] || bestTarget });
          visited.add(bestTarget);
          current = bestTarget;
        }
      }
    }

    if (frontDoorIFC) {
      const tp = A.ifc2three(frontDoorIFC.x, frontDoorIFC.y, frontDoorIFC.z);
      waypoints.push({ x: tp.x, y: tp.y, z: tp.z, name: 'Exit' });
    }

    console.log(`[S205] §WALK_PATH ${waypoints.length} waypoints (${stairPts.length} stairs, ${storeys.length} storeys: ${storeys.join(',')})`);
    waypoints.forEach((wp, i) => console.log(`  [${i}] ${wp.name} y=${wp.y.toFixed(2)}`));
    return waypoints.length >= 2 ? waypoints : null;
  };

  A.buildPointPath = function(points, stairs, allDoors) {
    const stairPts = (stairs || []).map(([sx,sy,sz]) => A.ifc2three(sx,sy,sz));

    let frontDoorIFC = null;
    if (allDoors && allDoors.length > 0) {
      const exterior = allDoors.filter(d => d[5] === 0);
      if (exterior.length > 0) {
        exterior.sort((a,b) => (a[4]||'').localeCompare(b[4]||''));
        frontDoorIFC = { x: exterior[0][1], y: exterior[0][2], z: exterior[0][3] };
      }
    }

    const byStorey = {};
    for (const p of points) {
      const st = p.storey || '';
      if (!byStorey[st]) byStorey[st] = [];
      byStorey[st].push(p);
    }
    const storeyOrder = Object.keys(byStorey).sort();

    const waypoints = [];

    if (frontDoorIFC) {
      const tp = A.ifc2three(frontDoorIFC.x, frontDoorIFC.y, frontDoorIFC.z);
      waypoints.push({ x: tp.x, y: tp.y, z: tp.z, name: 'Entrance' });
    }

    for (let si = 0; si < storeyOrder.length; si++) {
      const st = storeyOrder[si];
      const stPoints = byStorey[st];

      if (si > 0 && stairPts.length > 0 && waypoints.length > 0) {
        const last = waypoints[waypoints.length - 1];
        let bestStair = stairPts[0], bestSD = Infinity;
        for (const s of stairPts) {
          const d = Math.hypot(s.x - last.x, s.z - last.z);
          if (d < bestSD) { bestSD = d; bestStair = s; }
        }
        waypoints.push({ x: bestStair.x, y: last.y, z: bestStair.z, name: 'Stairs' });
        waypoints.push({ x: bestStair.x, y: bestStair.y, z: bestStair.z, name: 'Climbing...' });
        const firstNext = stPoints[0];
        const ntp = A.ifc2three(firstNext.x, firstNext.y, firstNext.z);
        waypoints.push({ x: bestStair.x, y: ntp.y, z: bestStair.z, name: st });
      }

      const visited = new Set();
      let startIdx = 0;
      if (waypoints.length > 0) {
        const last = waypoints[waypoints.length - 1];
        let bestD = Infinity;
        for (let j = 0; j < stPoints.length; j++) {
          const tp = A.ifc2three(stPoints[j].x, stPoints[j].y, stPoints[j].z);
          const d = Math.hypot(tp.x - last.x, tp.z - last.z);
          if (d < bestD) { bestD = d; startIdx = j; }
        }
      }
      let current = stPoints[startIdx];
      visited.add(startIdx);
      const tp0 = A.ifc2three(current.x, current.y, current.z);
      waypoints.push({ x: tp0.x, y: tp0.y, z: tp0.z, name: current.name });

      for (let i = 1; i < stPoints.length; i++) {
        let bestIdx = -1, bestDist = Infinity;
        for (let j = 0; j < stPoints.length; j++) {
          if (visited.has(j)) continue;
          const dx = stPoints[j].x - current.x;
          const dy = stPoints[j].y - current.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < bestDist) { bestDist = d; bestIdx = j; }
        }
        if (bestIdx >= 0) {
          visited.add(bestIdx);
          current = stPoints[bestIdx];
          const tp = A.ifc2three(current.x, current.y, current.z);
          waypoints.push({ x: tp.x, y: tp.y, z: tp.z, name: current.name });
        }
      }
    }

    if (frontDoorIFC) {
      const tp = A.ifc2three(frontDoorIFC.x, frontDoorIFC.y, frontDoorIFC.z);
      waypoints.push({ x: tp.x, y: tp.y, z: tp.z, name: 'Exit' });
    }

    return waypoints.length >= 2 ? waypoints : null;
  };

  A.buildSpacePath = function(rows, stairs, allDoors) {
    const points = rows.map(r => ({ name: r[1]||'Space', x: r[2], y: r[3], z: r[4], storey: r[5]||'' }));
    return A.buildPointPath(points, stairs, allDoors);
  };

  A.buildDoorPath = function(rows, stairs, allDoors) {
    const points = rows.map(r => ({ name: r[1]||'Door', x: r[2], y: r[3], z: r[4], storey: r[5]||'' }));
    return A.buildPointPath(points, stairs, allDoors);
  };

  A.computePathLength = function(path) {
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i-1].x;
      const dy = path[i].y - path[i-1].y;
      const dz = path[i].z - path[i-1].z;
      total += Math.sqrt(dx*dx + dy*dy + dz*dz);
    }
    return total;
  };

  A.interpolateWalkPath = function(path, t) {
    if (path.length < 2) return path[0] || { x: 0, y: 0, z: 0, name: '' };
    const totalLen = A.computePathLength(path);
    let targetDist = t * totalLen;
    let accum = 0;

    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i-1].x;
      const dy = path[i].y - path[i-1].y;
      const dz = path[i].z - path[i-1].z;
      const segLen = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (accum + segLen >= targetDist) {
        const f = segLen > 0.001 ? (targetDist - accum) / segLen : 0;
        return {
          x: path[i-1].x + dx * f,
          y: path[i-1].y + dy * f,
          z: path[i-1].z + dz * f,
          name: path[i].name || path[i-1].name || ''
        };
      }
      accum += segLen;
    }
    return path[path.length - 1];
  };
}
