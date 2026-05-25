/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// walk.js — Walk Mode (GPS blue dot, step detection, wall X-ray)
var _walkDir; // §S278: cached — reused per step (lazy-init)
function setupWalk(A) {
  _walkDir = new THREE.Vector3();
  // Walk Mode compass/tilt state
  A.walkCompassReadings = [];
  A.walkLockedHeading = null;
  A.walkLiveTilt = 0;
  A.walkOrientationHandler = null;

  // No-op until setWalkAnchor initializes the real one (navigate.js may set walkModeActive before anchor)
  A.walkOrientTick = A.walkOrientTick || function() {};

  // Step detection state
  A.walkStepHandler = null;
  A.walkLastAccelZ = 0;
  A.walkStepCooldown = 0;
  A.walkStepCount = 0;

  A.toggleWalkMode = function() {
    if (A.walkModeActive) {
      A.stopWalkMode();
      return;
    }
    document.getElementById('walk-anchor-prompt').style.display = 'block';
  };

  A.cancelWalkAnchor = function() {
    document.getElementById('walk-anchor-prompt').style.display = 'none';
  };

  A.setWalkAnchor = function() {
    document.getElementById('walk-anchor-prompt').style.display = 'none';

    A.walkAnchorIFC = A.findNearestDoorPosition();
    if (!A.walkAnchorIFC) {
      const bld = Object.values(A.buildingCentres)[0];
      if (bld) {
        A.walkAnchorIFC = { x: bld.ix, y: bld.iy, z: bld.iz };
      } else {
        A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_walk_no_data||'Walk Mode: No building data';
        return;
      }
    }

    const anchorThree = A.ifc2three(A.walkAnchorIFC.x, A.walkAnchorIFC.y, A.walkAnchorIFC.z);
    const bldCentre = Object.values(A.buildingCentres)[0];

    // Offset camera 3m outside the door (away from building centre)
    if (bldCentre) {
      const bc = A.ifc2three(bldCentre.ix, bldCentre.iy, bldCentre.iz);
      const dx = anchorThree.x - bc.x, dz = anchorThree.z - bc.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const offset = 3; // metres outside door
      A.camera.position.set(anchorThree.x + dx / len * offset, anchorThree.y + A.WALK_EYE_HEIGHT, anchorThree.z + dz / len * offset);
      // Look toward the door (into the building)
      A.controls.target.set(anchorThree.x, anchorThree.y + A.WALK_EYE_HEIGHT, anchorThree.z);
    } else {
      A.camera.position.set(anchorThree.x, anchorThree.y + A.WALK_EYE_HEIGHT, anchorThree.z);
    }
    A.controls.update();

    // Lock walk mode IMMEDIATELY — prevents render loop controls.update() from
    // overwriting the door-facing camera quaternion before device orientation kicks in
    A.walkModeActive = true;
    A.controls.enabled = false;
    console.log('[S210] §WALK_LOCK controls.enabled=false before orientation setup');

    // Clean up any lingering orientation listeners from sitecam or legacy walk
    if (A._camOrientHandler) {
      window.removeEventListener('deviceorientation', A._camOrientHandler, true);
      A._camOrientHandler = null;
    }
    if (A.walkOrientationHandler) {
      window.removeEventListener('deviceorientation', A.walkOrientationHandler);
      A.walkOrientationHandler = null;
    }

    // A-Frame pattern: reorder rotation before device orientation work
    A.camera.rotation.reorder('YXZ');

    // Record initial camera quaternion (facing the door)
    A._walkQDoor = A.camera.quaternion.clone();
    A._walkQBaseline = null; // captured on first device orientation event
    const _initDir = new THREE.Vector3(0, 0, -1).applyQuaternion(A._walkQDoor);
    console.log(`[S208] §WALK_INIT pos=(${A.camera.position.x.toFixed(1)},${A.camera.position.y.toFixed(1)},${A.camera.position.z.toFixed(1)}) dir=(${_initDir.x.toFixed(3)},${_initDir.y.toFixed(3)},${_initDir.z.toFixed(3)}) q=(${A._walkQDoor.x.toFixed(3)},${A._walkQDoor.y.toFixed(3)},${A._walkQDoor.z.toFixed(3)},${A._walkQDoor.w.toFixed(3)})`);

    // A-Frame pattern: listener caches event, render loop does math
    const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
    const _zee = new THREE.Vector3(0, 0, 1);
    A._walkAlphaOffset = 0;
    A._walkFirstUpdate = true;
    A._walkScreenOrientation = window.orientation || 0;
    A._walkDeviceEvent = null;  // cached event
    A._walkSmoothedAlpha = null; // EMA smoothed alpha (radians)

    const onScreenChange = () => { A._walkScreenOrientation = window.orientation || 0; };
    window.addEventListener('orientationchange', onScreenChange);

    // Listener ONLY caches — no quaternion work here
    A._walkOrientListener = function(e) {
      A._walkDeviceEvent = e;
    };

    // Called from render loop (main.js animate) — this is where quaternion is set
    A._walkBaselineAlpha = null; // first alpha reading — used to detect deliberate movement
    A._walkUnlocked = false;    // true once user moves phone >5° from initial position
    const UNLOCK_THRESHOLD_DEG = 5; // degrees of movement before camera follows device

    A.walkOrientTick = function() {
      if (!A.walkModeActive || !A._walkDeviceEvent) return;
      const e = A._walkDeviceEvent;
      if (!e.alpha) return;

      const deg2rad = THREE.MathUtils.degToRad;

      // Capture baseline alpha on first event (phone's resting orientation)
      if (A._walkBaselineAlpha === null) {
        A._walkBaselineAlpha = e.alpha;
        // Compute alphaOffset so that when unlocked, camera aligns to door
        const tempAlpha = deg2rad(e.alpha);
        const tempBeta = e.beta ? deg2rad(e.beta) : 0;
        const tempGamma = e.gamma ? deg2rad(e.gamma) : 0;
        const tempOrient = A._walkScreenOrientation ? deg2rad(A._walkScreenOrientation) : 0;
        const tempEuler = new THREE.Euler(tempBeta, tempAlpha, -tempGamma, 'YXZ');
        const tempQ = new THREE.Quaternion().setFromEuler(tempEuler);
        tempQ.multiply(_q1.clone());
        tempQ.multiply(new THREE.Quaternion().setFromAxisAngle(_zee, -tempOrient));
        const devDir = new THREE.Vector3(0, 0, -1).applyQuaternion(tempQ);
        const devYaw = Math.atan2(devDir.x, devDir.z);
        const doorDir = new THREE.Vector3(0, 0, -1).applyQuaternion(A._walkQDoor);
        const doorYaw = Math.atan2(doorDir.x, doorDir.z);
        A._walkAlphaOffset = doorYaw - devYaw;
        console.log('[S210] §WALK_BASELINE alpha=' + e.alpha.toFixed(1) + ' offset=' + THREE.MathUtils.radToDeg(A._walkAlphaOffset).toFixed(1) + '° — camera frozen at door');
        return; // Stay frozen on door view
      }

      // Stay frozen until user moves phone beyond threshold
      if (!A._walkUnlocked) {
        let delta = Math.abs(e.alpha - A._walkBaselineAlpha);
        if (delta > 180) delta = 360 - delta; // wrap-around
        if (delta < UNLOCK_THRESHOLD_DEG) return; // still frozen
        A._walkUnlocked = true;
        console.log('[S210] §WALK_UNLOCK delta=' + delta.toFixed(1) + '° — camera now follows device');
      }

      const alpha = deg2rad(e.alpha) + A._walkAlphaOffset;
      const beta = e.beta ? deg2rad(e.beta) : 0;
      const gamma = e.gamma ? deg2rad(e.gamma) : 0;
      const orient = A._walkScreenOrientation ? deg2rad(A._walkScreenOrientation) : 0;

      // Standard Three.js setObjectQuaternion — clean 1:1, no smoothing, no amplification
      const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
      A.camera.quaternion.setFromEuler(euler);
      A.camera.quaternion.multiply(_q1.clone());
      A.camera.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(_zee, -orient));
    };

    A._walkCleanupScreen = onScreenChange;
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(r => {
        if (r === 'granted') window.addEventListener('deviceorientation', A._walkOrientListener);
      }).catch(() => {});
    } else {
      window.addEventListener('deviceorientation', A._walkOrientListener);
    }
    // Legacy startWalkOrientation() removed — redundant listeners caused jitter

    if (navigator.geolocation) {
      A.walkAnchorGPS = null;
      navigator.geolocation.getCurrentPosition(
        pos => {
          A.walkAnchorGPS = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          A.startWalkGpsTracking();
          console.log(`[S207] §WALK_GPS anchored (${A.walkAnchorGPS.lat.toFixed(6)},${A.walkAnchorGPS.lng.toFixed(6)})`);
        },
        () => { A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_walk_no_gps||'Walk Mode: No GPS \u2014 orientation only'; },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    // walkModeActive + controls.enabled already set at line 59-60 (early lock)
    A.walkGpsFollowCam = false;
    document.getElementById('walk-mode-btn').classList.add('active');
    var _pw = document.getElementById('pill-walk'); if (_pw) _pw.classList.add('active');
    A.cacheStoreyLevels();
    // Drive-Thru replaces shake-to-walk — no startStepDetection()
    A.startDriveThru();

    A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_drivethru_hint||'Drive-Thru: Tap to walk, hold to glide';
    console.log(`[S207] §WALK_MODE_START anchor IFC=(${A.walkAnchorIFC.x.toFixed(1)},${A.walkAnchorIFC.y.toFixed(1)},${A.walkAnchorIFC.z.toFixed(1)})`);
  };

  A.findNearestDoorPosition = function() {
    if (!A.db) return null;
    const bld = Object.values(A.buildingCentres)[0];
    if (!bld) return null;
    try {
      // Get lowest storey that has doors (ground floor entrance)
      const stRows = A.dbQuery(`
        SELECT m.storey, MIN(t.center_z) as min_z
        FROM elements_meta m
        JOIN element_transforms t ON m.guid = t.guid
        WHERE m.ifc_class IN ('IfcDoor', 'IfcDoorStandardCase')
        GROUP BY m.storey
        ORDER BY min_z ASC
        LIMIT 1
      `);
      const lowestStorey = stRows.length > 0 ? stRows[0][0] : null;

      // Get all doors on that storey, pick the one furthest from building centre (exterior door)
      let query = `
        SELECT t.center_x, t.center_y, t.center_z
        FROM elements_meta m
        JOIN element_transforms t ON m.guid = t.guid
        WHERE m.ifc_class IN ('IfcDoor', 'IfcDoorStandardCase')
      `;
      var stParams = [];
      if (lowestStorey) { query += ` AND m.storey = ?`; stParams.push(lowestStorey); }

      const rows = A.dbQuery(query, stParams);
      if (!rows.length) return null;

      // Pick ground-floor door nearest to current camera position
      const camIfc = { x: A.camera.position.x + A.modelOffset.x, y: -(A.camera.position.z) + A.modelOffset.y };
      let best = null, bestDist = Infinity;
      for (const [x, y, z] of rows) {
        const dx = x - camIfc.x, dy = y - camIfc.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; best = { x, y, z }; }
      }
      console.log(`[S208] §WALK_DOOR picked (${best.x.toFixed(1)},${best.y.toFixed(1)},${best.z.toFixed(1)}) dist=${Math.sqrt(bestDist).toFixed(1)}m from ${rows.length} doors`);
      return best;
    } catch(e) { /* no doors */ }
    return null;
  };

  A.cacheStoreyLevels = function() {
    A.walkStoreyLevels = [];
    if (!A.db) return;
    try {
      const rows = A.dbQuery(`
        SELECT DISTINCT storey, MIN(center_z) as floor_z
        FROM elements_meta JOIN element_transforms USING(guid)
        WHERE storey IS NOT NULL
        GROUP BY storey ORDER BY floor_z
      `);
      if (rows.length > 0) {
        A.walkStoreyLevels = rows.map(r => ({ storey: r[0], floorZ: r[1] }));
        console.log(`[S205] §WALK_STOREYS ${A.walkStoreyLevels.length} levels cached`);
      }
    } catch(e) { /* no storey data */ }
  };

  A.startWalkGpsTracking = function() {
    if (A.walkGpsWatchId !== null) {
      navigator.geolocation.clearWatch(A.walkGpsWatchId);
    }
    A.walkGpsWatchId = navigator.geolocation.watchPosition(
      pos => {
        if (!A.walkModeActive || !A.walkAnchorGPS || !A.walkAnchorIFC || !A.walkBlueDot) return;

        const dLat = pos.coords.latitude - A.walkAnchorGPS.lat;
        const dLng = pos.coords.longitude - A.walkAnchorGPS.lng;

        const cosLat = Math.cos(A.walkAnchorGPS.lat * Math.PI / 180);
        const dx = dLng * 111320 * cosLat;
        const dy = dLat * 111320;

        const angle = (window._trueNorthAngle || 0) * Math.PI / 180;
        const mx = dx * Math.cos(angle) - dy * Math.sin(angle);
        const my = dx * Math.sin(angle) + dy * Math.cos(angle);

        const ifcX = A.walkAnchorIFC.x + mx;
        const ifcY = A.walkAnchorIFC.y + my;
        let ifcZ = A.walkAnchorIFC.z;

        if (A.walkStoreyLevels.length > 1 && pos.coords.altitude != null) {
          const altDelta = pos.coords.altitude - (A.walkAnchorGPS.alt || pos.coords.altitude);
          const targetZ = A.walkAnchorIFC.z + altDelta;
          let bestStorey = A.walkStoreyLevels[0];
          let bestDist = Math.abs(targetZ - bestStorey.floorZ);
          for (const sl of A.walkStoreyLevels) {
            const d = Math.abs(targetZ - sl.floorZ);
            if (d < bestDist) { bestDist = d; bestStorey = sl; }
          }
          ifcZ = bestStorey.floorZ;
        }

        const tp = A.ifc2three(ifcX, ifcY, ifcZ);
        A.walkBlueDot.position.set(tp.x, tp.y + A.WALK_EYE_HEIGHT * 0.3, tp.z);

        if (!A.walkAnchorGPS.alt && pos.coords.altitude != null) {
          A.walkAnchorGPS.alt = pos.coords.altitude;
        }
      },
      err => {
        console.warn('[S205] §WALK_GPS_ERR', err.message);
      },
      { enableHighAccuracy: true }
    );
  };

  // walkModeGpsTick is now handled by _walkOrientListener (quaternion-based)
  A.walkModeGpsTick = function() {
    // GPS blue dot position update only — orientation is event-driven
    if (!A.walkModeActive) return;
  };

  A.stopWalkMode = function() {
    A.walkModeActive = false;
    A.walkGpsFollowCam = false;
    if (A._walkOrientListener) {
      window.removeEventListener('deviceorientation', A._walkOrientListener);
      A._walkOrientListener = null;
    }
    if (A._walkCleanupScreen) {
      window.removeEventListener('orientationchange', A._walkCleanupScreen);
      A._walkCleanupScreen = null;
    }
    if (A.walkGpsWatchId !== null) {
      navigator.geolocation.clearWatch(A.walkGpsWatchId);
      A.walkGpsWatchId = null;
    }
    if (A.walkBlueDot) {
      A.scene.remove(A.walkBlueDot);
      A.walkBlueDot = null;
    }
    if (A.walkOrientationHandler) {
      window.removeEventListener('deviceorientation', A.walkOrientationHandler);
      A.walkOrientationHandler = null;
    }
    A.stopStepDetection();
    A.stopDriveThru();
    A.controls.enabled = true; // Restore OrbitControls
    A.walkLockedHeading = null;
    A.walkCompassReadings = [];
    const snagRow = document.getElementById('snag-btn-row');
    if (snagRow) snagRow.style.display = 'none';
    document.getElementById('walk-mode-btn').classList.remove('active');
    var _pw = document.getElementById('pill-walk'); if (_pw) _pw.classList.remove('active');
    // Fly back to building overview so OrbitControls has a sensible target
    if (A.activeBuilding && A.flyTo) A.flyTo(A.activeBuilding);
    A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_walk_stopped||'Walk Mode stopped.';
    console.log('[S207] §WALK_MODE_STOP');
  };

  // Step Detection
  A.startStepDetection = function() {
    if (A.walkStepHandler) return;
    const requestMotion = typeof DeviceMotionEvent?.requestPermission === 'function';
    const attach = () => {
      A.walkStepHandler = (e) => {
        if (!A.walkModeActive) return;
        const acc = e.accelerationIncludingGravity;
        if (!acc || acc.z == null) return;

        const now = performance.now();
        const deltaZ = Math.abs(acc.z - A.walkLastAccelZ);
        A.walkLastAccelZ = acc.z;

        if (deltaZ > A.WALK_STEP_THRESHOLD && now - A.walkStepCooldown > A.WALK_STEP_COOLDOWN_MS) {
          A.walkStepCooldown = now;
          A.walkStepCount++;
          A.advanceWalkStep();
        }
      };
      window.addEventListener('devicemotion', A.walkStepHandler);
      console.log('[S207b] §STEP_DETECT started threshold=' + A.WALK_STEP_THRESHOLD + 'm/s²');
    };
    if (requestMotion) {
      DeviceMotionEvent.requestPermission().then(r => { if (r === 'granted') attach(); }).catch(() => {});
    } else {
      attach();
    }
  };

  A.stopStepDetection = function() {
    if (A.walkStepHandler) {
      window.removeEventListener('devicemotion', A.walkStepHandler);
      A.walkStepHandler = null;
    }
    if (A.walkStepCount > 0) {
      console.log(`[S207b] §STEP_DETECT stopped steps=${A.walkStepCount} dist=${(A.walkStepCount * A.WALK_STEP_DISTANCE).toFixed(1)}m`);
    }
    A.walkStepCount = 0;
  };

  // ── Drive-Thru: tap = 1 step, hold = continuous glide ──

  A.startDriveThru = function() {
    if (A._driveBtn) return;

    const btn = document.createElement('div');
    btn.id = 'drive-thru-btn';
    btn.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:80px;height:80px;border-radius:50%;background:rgba(33,150,243,0.7);border:3px solid #4fc3f7;z-index:9999;display:flex;align-items:center;justify-content:center;font-size:28px;color:#fff;user-select:none;-webkit-user-select:none;touch-action:none;cursor:pointer;';
    btn.textContent = '⬆';
    document.body.appendChild(btn);
    A._driveBtn = btn;
    A._driveHoldInterval = null;
    A._driveHoldCount = 0;

    // Tap = 1 step. Hold (>300ms) = continuous glide
    const startDrive = (e) => {
      e.preventDefault();
      if (!A.walkModeActive) return;
      A.walkStepCount++;
      A.advanceWalkStep();
      btn.style.background = 'rgba(33,150,243,1.0)';
      btn.style.transform = 'translateX(-50%) scale(0.9)';
      A._driveHoldCount = 0;
      A._driveHoldInterval = setInterval(() => {
        if (!A.walkModeActive) { stopDrive(); return; }
        A._driveHoldCount++;
        A.walkStepCount++;
        A.advanceWalkStep();
        // Accelerate: after 5 ticks, double step distance
        if (A._driveHoldCount > 10) {
          A.advanceWalkStep(); // extra step = 2x speed
        }
      }, 150);
    };

    const stopDrive = () => {
      if (A._driveHoldInterval) {
        clearInterval(A._driveHoldInterval);
        A._driveHoldInterval = null;
      }
      btn.style.background = 'rgba(33,150,243,0.7)';
      btn.style.transform = 'translateX(-50%) scale(1)';
    };

    btn.addEventListener('touchstart', startDrive, { passive: false });
    btn.addEventListener('touchend', stopDrive);
    btn.addEventListener('touchcancel', stopDrive);
    // Mouse fallback for desktop testing
    btn.addEventListener('mousedown', startDrive);
    btn.addEventListener('mouseup', stopDrive);
    btn.addEventListener('mouseleave', stopDrive);
  };

  A.stopDriveThru = function() {
    if (A._driveHoldInterval) {
      clearInterval(A._driveHoldInterval);
      A._driveHoldInterval = null;
    }
    if (A._driveBtn) {
      A._driveBtn.remove();
      A._driveBtn = null;
    }
  };

  A.advanceWalkStep = function() {
    var dir = _walkDir;
    A.camera.getWorldDirection(dir);
    // Keep full direction including Y — tilt phone up to climb, down to descend
    dir.normalize();
    dir.multiplyScalar(A.WALK_STEP_DISTANCE);
    A.camera.position.add(dir);

    const dist = (A.walkStepCount * A.WALK_STEP_DISTANCE).toFixed(1);
    A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_drivethru_status||'Drive-Thru: {n} steps ({d}m)').replace('{n}', A.walkStepCount).replace('{d}', dist);
  };

  // No floor/stair snap — camera moves in the direction you point the phone.
  // Tilt up to climb stairs, tilt down to descend. Simple and intuitive.

  // Wall X-Ray
  A.handleWallXray = function(hitObject, hitPoint, hitFaceNormal) {
    if (!A.walkModeActive) return false;

    const guid = A.guidMap[hitObject.id];
    if (!guid) return false;

    try {
      const rows = A.dbQuery(`
        SELECT ifc_class, storey, element_name
        FROM elements_meta WHERE guid = ?
      `, [guid]);
      if (!rows.length) return false;
      const [ifcClass, storey, elemName] = rows[0];

      if (!ifcClass || (!ifcClass.includes('Wall') && !ifcClass.includes('wall'))) return false;

      A.restoreWallXray();

      console.log(`[S205] §WALL_XRAY class=${ifcClass} storey=${storey} name=${elemName}`);

      const wallRows = A.dbQuery(`
        SELECT center_x, center_y, center_z
        FROM element_transforms WHERE guid = ?
      `, [guid]);
      if (!wallRows.length) return false;
      const [wallX, wallY, wallZ] = wallRows[0];

      A.wallXrayActive = true;
      const mat = hitObject.material;
      A.wallXrayOriginals.push({
        mesh: hitObject,
        origOpacity: mat.opacity,
        origTransparent: mat.transparent,
        origSide: mat.side
      });
      mat.transparent = true;
      mat.opacity = 0.15;
      mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;

      const mepRows = A.dbQuery(`
        SELECT m.guid, m.ifc_class, m.element_name, m.discipline,
               t.center_x, t.center_y, t.center_z
        FROM elements_meta m
        JOIN element_transforms t ON m.guid = t.guid
        WHERE m.discipline IN ('MEP','ELEC','PLB','ACMV','FP','HVAC','MEC')
          AND m.storey = ?
          AND ABS(t.center_x - ?) < 2.0
          AND ABS(t.center_y - ?) < 2.0
      `, [storey, wallX, wallY]);

      if (mepRows.length > 0) {
        console.log(`[S205] §WALL_MEP found=${mepRows.length} near wall`);

        const mepGuids = new Set(mepRows.map(r => r[0]));
        let highlighted = 0;

        A.collectMeshes(o => o.isMesh && o.userData.guid && mepGuids.has(o.userData.guid))
          .forEach(obj => {
            A.wallXrayOriginals.push({
              mesh: obj,
              origOpacity: obj.material.opacity,
              origTransparent: obj.material.transparent,
              origSide: obj.material.side,
              origColor: obj.material.color.clone(),
              origEmissive: obj.material.emissive ? obj.material.emissive.clone() : null
            });
            obj.material.emissive = new THREE.Color(0x00ff44);
            obj.material.emissiveIntensity = 0.6;
            obj.material.transparent = false;
            obj.material.opacity = 1.0;
            obj.material.needsUpdate = true;
            highlighted++;
          });

        for (const [mGuid, mClass, mName, mDisc, mCx, mCy, mCz] of mepRows) {
          if (!highlighted || !A.findMeshByGuid(mGuid)) {
            const tp = A.ifc2three(mCx, mCy, mCz);
            const markerGeo = new THREE.SphereGeometry(0.15, 8, 8);
            const isElec = mDisc === 'ELEC' || mDisc === 'FP';
            const markerMat = new THREE.MeshBasicMaterial({
              color: isElec ? 0xff8800 : 0x00ff44
            });
            const marker = new THREE.Mesh(markerGeo, markerMat);
            marker.position.set(tp.x, tp.y, tp.z);
            marker.userData._wallXrayMarker = true;
            A.scene.add(marker);
            A.wallXrayMepHighlights.push(marker);
          }
        }

        A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_xray_found||'Wall X-Ray: {n} MEP elements behind {name}').replace('{n}', mepRows[0].values.length).replace('{name}', elemName || ifcClass);
      } else {
        A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_xray_none||'Wall X-Ray: No MEP elements found behind {name}').replace('{name}', elemName || ifcClass);
      }

      return true;
    } catch(e) {
      console.warn('[S205] §WALL_XRAY_ERR', e.message);
      return false;
    }
  };

  A.findMeshByGuid = function(guid) {
    return A.collectMeshes(o => o.isMesh && o.userData.guid === guid)[0] || null;
  };

  A.restoreWallXray = function() {
    if (!A.wallXrayActive) return;

    for (const entry of A.wallXrayOriginals) {
      const mat = entry.mesh.material;
      mat.opacity = entry.origOpacity;
      mat.transparent = entry.origTransparent;
      mat.side = entry.origSide;
      if (entry.origColor) mat.color.copy(entry.origColor);
      if (entry.origEmissive !== undefined) {
        mat.emissive = entry.origEmissive || new THREE.Color(0, 0, 0);
        mat.emissiveIntensity = 0;
      }
      mat.needsUpdate = true;
    }
    A.wallXrayOriginals = [];

    for (const marker of A.wallXrayMepHighlights) {
      A.scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
    }
    A.wallXrayMepHighlights = [];

    A.wallXrayActive = false;
  };
}
