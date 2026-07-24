// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// tour.js — Fly around, cinematic tour, walk-through engine, path building
function setupTour(A) {
  // FLY_TOUR_CORRIDOR_GRAPH.md — build banner: proves which tour build a tab is running.
  console.log('[TOUR] §TOUR_VERSION v12 (occupant-graph corridors/stairs — FLY_TOUR_CORRIDOR_GRAPH.md)');

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
  var TOUR_CACHE_VER = 'v12'; // keep in lockstep with the §TOUR_VERSION banner above
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
        document.getElementById('walk-speed-btn').style.display = '';
        document.getElementById('walk-speed-btn').textContent = '1x';
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
    const byStorey = {}, stZSum = {}, stN = {};
    for (const n of g.nodes) {
      const lbl = String(n.label || '');
      let area = 0;
      for (const rc of (n.rects || [])) area += Math.max(0, rc.x1 - rc.x0) * Math.max(0, rc.y1 - rc.y0);
      if (!byStorey[n.storey]) byStorey[n.storey] = { corridors: [], rooms: [] };
      const rec = { guid: n.guid, node: n, area };
      if (lbl.indexOf('Hall / Corridor') >= 0 || lbl.indexOf('SUSPECT_ELONGATED') >= 0) byStorey[n.storey].corridors.push(rec);
      else if (lbl.indexOf('SUSPECT_') < 0) byStorey[n.storey].rooms.push(rec);
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

    // §S3 — the largest room actually PICKED per storey gets the pause + look-around beat
    // (§R6: dedupe/budget may drop the storey's largest room; corridors keep moving, no beat).
    const pauseGuids = {};
    const pausedStorey = {};
    for (const s of stops) {
      const st = s.node.storey;
      if (pausedStorey[st]) continue;
      if (byStorey[st].corridors.indexOf(s) >= 0) continue;
      pauseGuids[s.guid] = true;
      pausedStorey[st] = true;
    }

    // Chain the stops through the graph (Dijkstra, legalized — see room_graph.js).
    // A stop the graph cannot reach (room island — real on sparse federated models, measured
    // HHS) is SKIPPED, never straight-hopped: an occupant can't walk there, and this route
    // invents nothing. EXTRACT ONLY.
    const pathGuids = [];
    let skipped = 0, visitedStops = 0;
    let curGuid = entrance ? entrance.guid : stops[0].guid;
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
                 pause: pauseGuids[pg] ? 'room' : (storeyArrival ? 'storey' : null) });
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
    actions.push({type:'moveTo', x:ep.x, y:ep.y, z:ep.z, name:'Entrance', speedMul: 2});

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
      const splits = pauseIdx.filter((v, i, arr) => v.i > 1 && v.i < flyPts.length - 2 &&
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
          // room beat = full survey; storey arrival = shorter heads-up sweep of the open spaces.
          actions.push({type:'pause', seconds: 0.4});
          actions.push({type:'lookAround', degrees: segments[sI].beat === 'storey' ? 180 : 270});
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

  // Action-based walkTick
  A.walkTick = function() {
    if (!A.walkMode || !A.walkActions || A.walkActions.length === 0) return;
    if (A.walkActionIdx >= A.walkActions.length) {
      A.walkMode = false;
      A.flyActive = false;
      A.walkActionIdx = 0;
      A.walkActionT = 0;
      A.walkPanAngle = 0;
      const btn = document.getElementById('fly-btn');
      if (btn) btn.classList.remove('active');
      A.status.textContent = 'Tour complete.';
      A.wlog('Tour complete');
      return;
    }

    const now = performance.now();
    const dt = A.walkLastTime > 0 ? Math.min((now - A.walkLastTime) / 1000, 0.1) : 0.016;
    A.walkLastTime = now;

    const act = A.walkActions[A.walkActionIdx];
    const spd = A.walkSpeedMult;

    // Save pre-action state for global smoothing
    const _prevCamPos = A.camera.position.clone();
    const _prevTarget = A.controls.target.clone();

    if (act.type === 'moveTo') {
      if (A.walkActionT === 0) {
        act._startPos = A.camera.position.clone();
        act._startTarget = A.controls.target.clone();
        act._dist = A.camera.position.distanceTo(new THREE.Vector3(act.x, act.y + A.WALK_EYE_HEIGHT, act.z));
        const speed = act._dist > 5 ? Math.max(A.WALK_SPEED, act._dist / 3.0) : A.WALK_SPEED;
        // §INTERIOR_PACING: speedMul is opt-in per action (only the entrance zoom-in sets it) —
        // every other moveTo (finale bird's-eye/centre/final) is speedMul-less and unaffected.
        act._duration = Math.max(act._dist / (speed * spd * (act.speedMul || 1)), 0.3);
        if (act.speedMul) A.wlog(`§INTERIOR_PACING moveTo "${act.name}" speedMul=${act.speedMul} dur=${act._duration.toFixed(1)}s`);
        // Pre-compute final look direction: if next action has lookAtX/Z, face that way on arrival
        const nextAct = A.walkActions[A.walkActionIdx + 1];
        if (nextAct && nextAct.lookAtX !== undefined && nextAct.lookAtZ !== undefined) {
          act._endLookX = nextAct.lookAtX;
          act._endLookZ = nextAct.lookAtZ;
        }
      }
      A.walkActionT += dt;
      const t = Math.min(A.walkActionT / act._duration, 1.0);
      const s = t * t * (3 - 2 * t);
      const dest = new THREE.Vector3(act.x, act.y + A.WALK_EYE_HEIGHT, act.z);
      A.camera.position.lerpVectors(act._startPos, dest, s);
      // Smoothly orient toward the next lookAround target in the last 40% of travel
      let endTarget;
      if (act._endLookX !== undefined) {
        const lookDist = 3.0;
        const dx = act._endLookX - act.x, dz = act._endLookZ - act.z;
        const len = Math.hypot(dx, dz) || 1;
        endTarget = new THREE.Vector3(act.x + dx/len * lookDist, act.y + A.WALK_EYE_HEIGHT, act.z + dz/len * lookDist);
      } else {
        endTarget = dest.clone(); endTarget.z += 0.1;
      }
      // Blend: first 60% look ahead (toward destination), last 40% turn toward endTarget
      const blendStart = 0.6;
      if (t < blendStart) {
        const aheadTarget = dest.clone(); aheadTarget.z += 0.1;
        A.controls.target.lerpVectors(act._startTarget, aheadTarget, s);
      } else {
        const aheadTarget = dest.clone(); aheadTarget.z += 0.1;
        const midTarget = new THREE.Vector3().lerpVectors(act._startTarget, aheadTarget, t * t * (3 - 2 * t));
        const turnT = (t - blendStart) / (1 - blendStart);
        const turnS = turnT * turnT * (3 - 2 * turnT);
        A.controls.target.lerpVectors(midTarget, endTarget, turnS);
      }
      A.controls.update();
      A.status.textContent = `${act.name || 'Walking...'} [${spd}x] camY=${A.camera.position.y.toFixed(1)}`;
      if (t >= 1.0) {
        A.walkActionIdx++;
        A.walkActionT = 0;
        if (act.name) A.wlog(`Arrived: ${act.name} camY=${A.camera.position.y.toFixed(2)}`);
      }

    } else if (act.type === 'lookAround') {
      const degreesPerSec = A.PAN_SPEED * spd;
      const totalDeg = act.degrees || 360;
      if (A.walkPanAngle === 0 && A.walkActionT === 0) {
        // If lookAtX/Z given, center sweep on "face inward" direction
        if (act.lookAtX !== undefined && act.lookAtZ !== undefined) {
          const dx = act.lookAtX - A.camera.position.x;
          const dz = act.lookAtZ - A.camera.position.z;
          const inwardRad = Math.atan2(dx, dz);
          act._startRad = inwardRad - totalDeg / 2 * Math.PI / 180;
        } else {
          const dx = A.controls.target.x - A.camera.position.x;
          const dz = A.controls.target.z - A.camera.position.z;
          act._startRad = Math.atan2(dx, dz);
        }
      }
      A.walkPanAngle += degreesPerSec * dt;
      // Ease-in first 15% and ease-out last 15% for smooth start/stop
      const progress = Math.min(A.walkPanAngle / totalDeg, 1.0);
      let easedProgress;
      if (progress < 0.15) {
        const p = progress / 0.15;
        easedProgress = 0.15 * (p * p * (3 - 2 * p));
      } else if (progress > 0.85) {
        const p = (progress - 0.85) / 0.15;
        easedProgress = 0.85 + 0.15 * (p * p * (3 - 2 * p));
      } else {
        easedProgress = progress;
      }
      const rad = (act._startRad || 0) + easedProgress * totalDeg * Math.PI / 180;
      const lookDist = 3.0;
      A.controls.target.x = A.camera.position.x + lookDist * Math.sin(rad);
      A.controls.target.z = A.camera.position.z + lookDist * Math.cos(rad);
      // §ENDING: an explicit lookAtY tilts the gaze (ground-level facade shot); default stays level.
      A.controls.target.y = (act.lookAtY !== undefined) ? act.lookAtY : A.camera.position.y;
      A.controls.update();
      A.status.textContent = `Looking around ${(A.walkPanAngle).toFixed(0)}° [${spd}x]`;
      if (A.walkPanAngle >= totalDeg) {
        A.walkActionIdx++;
        A.walkActionT = 0;
        A.walkPanAngle = 0;
      }

    } else if (act.type === 'rise') {
      const targetY = act.targetY + A.WALK_EYE_HEIGHT;
      const dy = targetY - A.camera.position.y;
      if (Math.abs(dy) < 0.05) {
        A.camera.position.y = targetY;
        A.walkActionIdx++;
        A.walkActionT = 0;
        A.wlog(`Rise done: camY=${A.camera.position.y.toFixed(2)}`);
      } else {
        const step = Math.sign(dy) * Math.min(1.0 * spd * dt, Math.abs(dy));
        A.camera.position.y += step;
        A.controls.target.y += step;
      }
      A.controls.update();
      A.status.textContent = `${act.name || 'Rising...'} camY=${A.camera.position.y.toFixed(1)} → ${targetY.toFixed(1)}`;

    } else if (act.type === 'pause') {
      A.walkActionT += dt;
      if (A.walkActionT >= (act.seconds || 1)) {
        A.walkActionIdx++;
        A.walkActionT = 0;
      }

    } else if (act.type === 'orbit') {
      const tiltRad = (act.tiltDeg || 40) * Math.PI / 180;
      const duration = act.duration || 8;
      const totalRad = act.fullCircle ? Math.PI * 2 : Math.PI;
      if (A.walkActionT === 0) {
        A.walkOrbitAngle = Math.atan2(A.camera.position.z - act.cz, A.camera.position.x - act.cx);
        act._startAngle = A.walkOrbitAngle;
        act._startY = A.camera.position.y;
        act._groundY = act.cy + A.WALK_EYE_HEIGHT;
        act._startTarget = A.controls.target.clone();
        act._startPos = A.camera.position.clone();
        A.wlog(`Orbit: r=${act.radius?.toFixed(0)} from ${(A.walkOrbitAngle*180/Math.PI).toFixed(0)}°`);
      }
      A.walkActionT += dt;
      const t = Math.min(A.walkActionT / duration, 1.0);
      const smooth = t * t * (3 - 2 * t);
      A.walkOrbitAngle = act._startAngle + totalRad * smooth;
      const orbitH = act.cy + act.radius * Math.sin(tiltRad);
      let camY;
      if (t < 0.2) {
        const ht = t / 0.2;
        const hs = ht * ht * (3 - 2 * ht);
        camY = act._startY + (orbitH - act._startY) * hs;
      } else if (t < 0.6) {
        camY = orbitH;
      } else {
        const dt2 = (t - 0.6) / 0.4;
        const ds = dt2 * dt2 * (3 - 2 * dt2);
        camY = orbitH + (act._groundY - orbitH) * ds;
      }
      const descentProgress = t > 0.6 ? (t - 0.6) / 0.4 : 0;
      const effectiveTilt = tiltRad * (1 - descentProgress * descentProgress);
      const camX = act.cx + Math.cos(A.walkOrbitAngle) * act.radius * Math.cos(effectiveTilt);
      const camZ = act.cz + Math.sin(A.walkOrbitAngle) * act.radius * Math.cos(effectiveTilt);
      // Blend from previous position/look in first 20% for smooth entry
      const wantPos = new THREE.Vector3(camX, camY, camZ);
      const lookY = act.cy + (camY - act.cy) * descentProgress;
      const wantTarget = new THREE.Vector3(act.cx, lookY, act.cz);
      if (t < 0.2) {
        const bt = t / 0.2;
        const bs = bt * bt * (3 - 2 * bt);
        A.camera.position.lerpVectors(act._startPos, wantPos, bs);
        A.controls.target.lerpVectors(act._startTarget, wantTarget, bs);
      } else {
        A.camera.position.copy(wantPos);
        A.controls.target.copy(wantTarget);
      }
      A.controls.update();
      A.status.textContent = `Aerial sweep ${(t * 100).toFixed(0)}% [${spd}x]`;
      if (t >= 1.0) {
        A.walkActionIdx++;
        A.walkActionT = 0;
        A.wlog('Orbit complete');
      }

    } else if (act.type === 'riseAndTilt') {
      const targetY = act.targetY;
      if (A.walkActionT === 0) {
        act._startY = A.camera.position.y;
        act._startX = A.camera.position.x;
        act._startZ = A.camera.position.z;
        act._startTarget = A.controls.target.clone();
      }
      const totalDist = Math.abs(targetY - act._startY);
      if (totalDist < 0.1) { A.walkActionIdx++; A.walkActionT = 0; return; }
      const duration = 5.0;
      A.walkActionT += dt;
      const t = Math.min(A.walkActionT / duration, 1.0);
      const smooth = t * t * (3 - 2 * t);
      A.camera.position.y = act._startY + (targetY - act._startY) * smooth;
      const tiltRad = (act.tiltDeg || 80) * Math.PI / 180 * smooth;
      const lookDist = 5.0;
      const wantTarget = new THREE.Vector3(
        act._startX,
        A.camera.position.y - lookDist * Math.sin(tiltRad),
        act._startZ + lookDist * Math.cos(tiltRad) * 0.1
      );
      // Blend from previous look direction to avoid snap
      A.controls.target.lerpVectors(act._startTarget, wantTarget, smooth);
      A.controls.update();
      A.status.textContent = `${act.name || "Bird's eye"} ${(t * 100).toFixed(0)}% [${spd}x]`;
      if (t >= 1.0) {
        A.walkActionIdx++;
        A.walkActionT = 0;
        A.wlog(`RiseAndTilt done: camY=${A.camera.position.y.toFixed(2)}`);
      }

    } else if (act.type === 'flyPath') {
      // Catmull-Rom spline flythrough — smooth continuous flight
      if (A.walkActionT === 0) {
        try {
          const rawPts = act.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
          const camPos = A.camera.position.clone();
          const distToFirst = camPos.distanceTo(rawPts[0]);
          const pts3 = distToFirst > 3 ? [camPos, ...rawPts] : rawPts;
          act._curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.5);
          act._totalLen = act._curve.getLength();
          act._prevLook = A.controls.target.clone();
          console.log(`[TOUR] §FLYPATH_INIT pts=${pts3.length} len=${act._totalLen.toFixed(1)} dur=${act.duration} first=(${rawPts[0].x.toFixed(1)},${rawPts[0].y.toFixed(1)},${rawPts[0].z.toFixed(1)}) cam=(${camPos.x.toFixed(1)},${camPos.y.toFixed(1)},${camPos.z.toFixed(1)})`);
          // Bail if curve is degenerate
          if (!act._totalLen || act._totalLen < 1) {
            console.warn('[TOUR] §FLYPATH_SKIP degenerate curve len=' + act._totalLen);
            A.walkActionIdx++; A.walkActionT = 0; return;
          }
          // §TIGHT_TURN_PACING (FLY_TOUR_CORRIDOR_GRAPH.md §INTERIOR_PACING_NOT_A_SPEED_FACTOR,
          // user 2026-07-25: "even slower when too close to object or spaces as they will simply
          // flash by meaninglessly"). Real path geometry, not a flat multiplier: at each original
          // waypoint, measure the turn angle between the incoming/outgoing legs AND how short
          // those legs are (a dead-end spur — fly in, reverse, fly out — is both a sharp turn and
          // a short leg; a corridor cruise is neither). Build a monotonic time→u remap so MORE of
          // the segment's fixed duration (set by INTERIOR_PACE_FACTOR above) is spent near tight
          // vertices and less on straight stretches — total duration is unchanged, only its
          // distribution along the curve is. u stays real curve parameter fed to getPointAt, so
          // camera position itself is untouched — only pacing (speed) varies.
          const rawU = [0]; // cumulative straight-line length fraction at each pts3 vertex
          let cumLen = 0;
          const segLens = [];
          for (let i = 1; i < pts3.length; i++) {
            const L = pts3[i].distanceTo(pts3[i - 1]);
            segLens.push(L); cumLen += L; rawU.push(cumLen);
          }
          for (let i = 0; i < rawU.length; i++) rawU[i] = cumLen > 0 ? rawU[i] / cumLen : 0;
          const tight = new Array(pts3.length).fill(0); // 0=straight/open .. 1=sharp/tight
          for (let i = 1; i < pts3.length - 1; i++) {
            const l1 = segLens[i - 1], l2 = segLens[i];
            let turnDeg = 0;
            if (l1 > 0.01 && l2 > 0.01) {
              const v1 = new THREE.Vector3().subVectors(pts3[i], pts3[i - 1]).normalize();
              const v2 = new THREE.Vector3().subVectors(pts3[i + 1], pts3[i]).normalize();
              turnDeg = Math.acos(THREE.MathUtils.clamp(v1.dot(v2), -1, 1)) * 180 / Math.PI;
            }
            const shortness = Math.max(0, 1 - Math.min(l1, l2) / 4); // legs <4m start reading "close"
            tight[i] = Math.max(turnDeg / 180, shortness);
          }
          // Per-segment pace factor (>=1, higher = slower) from the tighter of its two endpoints;
          // PACE_K bounds the extra slowdown a single sharp/short vertex can add (4x floor).
          const PACE_K = 3;
          const paceFactor = [];
          for (let i = 1; i < pts3.length; i++) paceFactor.push(1 + PACE_K * Math.max(tight[i - 1], tight[i]));
          let wTotal = 0;
          const wCum = [0];
          for (let i = 0; i < segLens.length; i++) { wTotal += segLens[i] * paceFactor[i]; wCum.push(wTotal); }
          act._paceU = rawU;
          act._paceT = wCum.map(w => wTotal > 0 ? w / wTotal : 0); // time-fraction at each rawU
          const maxTight = Math.max(...tight);
          console.log(`[TOUR] §TIGHT_TURN_PACING verts=${pts3.length} maxTightness=${maxTight.toFixed(2)} paceKFactorRange=[${Math.min(...paceFactor).toFixed(2)},${Math.max(...paceFactor).toFixed(2)}]`);
        } catch(e) {
          console.error('[TOUR] §FLYPATH_CRASH', e.message);
          A.walkActionIdx++; A.walkActionT = 0; return;
        }
      }
      const duration = (act.duration || 30) / spd;
      A.walkActionT += dt;
      const tLinear = Math.min(A.walkActionT / duration, 1.0);
      // §TIGHT_TURN_PACING: remap linear elapsed-time fraction to the curve's own u parameter via
      // the weighted table built above — u advances slower through tight/short legs.
      let t = tLinear;
      if (act._paceT && act._paceT.length > 1) {
        const pt = act._paceT, pu = act._paceU;
        let lo = 0, hi = pt.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pt[mid] <= tLinear) lo = mid; else hi = mid; }
        const span = pt[hi] - pt[lo];
        const f = span > 1e-6 ? (tLinear - pt[lo]) / span : 0;
        t = pu[lo] + (pu[hi] - pu[lo]) * f;
      }
      const pos = act._curve.getPointAt(t);
      A.camera.position.copy(pos);
      // §SOFTEN (user 2026-07-16: "soften the sudden switch to new track"): look further ahead
      // (0.05 vs 0.03) and pan the gaze more gently (lerp 0.08 vs 0.15) — spur-room reversals
      // (walk in, walk out) sweep instead of whip.
      const lookT = Math.min(t + 0.05, 0.999);
      const lookPt = act._curve.getPointAt(lookT);
      if (!act._prevLook) act._prevLook = lookPt.clone();
      act._prevLook.lerp(lookPt, 0.08);
      A.controls.target.copy(act._prevLook);
      A.controls.update();
      // Find nearest named point for status
      const nameIdx = Math.round(t * (act.names.length - 1));
      let label = '';
      for (let ni = nameIdx; ni >= 0; ni--) { if (act.names[ni]) { label = act.names[ni]; break; } }
      A.status.textContent = `${label || 'Flying...'} ${(t * 100).toFixed(0)}% [${spd}x]`;
      if (t >= 1.0) {
        A.walkActionIdx++;
        A.walkActionT = 0;
        A.wlog('FlyPath complete');
      }

    } else {
      A.walkActionIdx++;
      A.walkActionT = 0;
    }

    // ── Adaptive smoothing: heavy on sudden jumps, light on steady motion ──
    const posDelta = _prevCamPos.distanceTo(A.camera.position);
    const tgtDelta = _prevTarget.distanceTo(A.controls.target);
    const maxDelta = Math.max(posDelta, tgtDelta);
    // Steady (<0.5m/frame): track closely. Sudden (>2m/frame): dampen hard.
    const SMOOTH = maxDelta < 0.5 ? 0.6 : maxDelta > 2 ? 0.12 : 0.3;
    A.camera.position.lerpVectors(_prevCamPos, A.camera.position, SMOOTH);
    A.controls.target.lerpVectors(_prevTarget, A.controls.target, SMOOTH);
    A.controls.update();
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
