/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// navigate_engine.js — S233 Section D: Turn-by-turn navigation engine
// Also includes: speak, overrideDriveButton, restoreDriveButton (called from engine)
// Interface: NavigateEngine.init(A, nav)
// Reads from A (NavigateFind): A.findMainEntrance, A.highlightElement, A.friendlyName,
//   A.closeFindPanel
// Reads from A (NavigatePath): A.buildPath
// Reads: A.camera, A.controls, A.ifc2three, A.modelOffset, A.walkModeActive,
//   A.walkStoreyLevels, A.cacheStoreyLevels, A.startDriveThru, A.status,
//   A._walkUnlocked, A.db, A.buildingCentres, A.results
// Acquires DOM: nav-hud, nav-direction-cue, nav-bottom-bar, find-panel
// Exposes on A: startNavigation, stopNavigation, advanceNavStep, navJumpToEnd,
//   goBackStep, resetToStart, _nav, _driveBtn
// Witness: W-NAV

(function() {
  'use strict';

  function init(A, nav) {

    // ══════════════════════════════════════════════════════════════
    // SECTION D: TURN-BY-TURN NAVIGATION ENGINE
    // ══════════════════════════════════════════════════════════════

    var EYE_HEIGHT = 1.6;

    // Re-acquire DOM elements created by NavigateFind.init()
    var navHud = document.getElementById('nav-hud');
    var elCue  = document.getElementById('nav-direction-cue');
    var elBar  = document.getElementById('nav-bottom-bar');
    var panel  = document.getElementById('find-panel');

    // ── Voice output (modality-matched) — used by engine functions ──
    function speak(text) {
      if (!nav.voiceMode) return;
      if (!window.speechSynthesis) return;
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 1.1;
      u.pitch = 1.0;
      window.speechSynthesis.speak(u);
    }

    // ── Drive-thru button override/restore ──
    function overrideDriveButton() {
      var btn = document.getElementById('drive-thru-btn');
      if (!btn) return;

      var newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      A._driveBtn = newBtn;

      var navTap = function(e) {
        e.preventDefault();
        if (nav.active) {
          A.advanceNavStep();
        }
      };
      newBtn.addEventListener('touchstart', navTap, { passive: false });
      newBtn.addEventListener('mousedown', navTap);
      newBtn.addEventListener('touchend', function(e) { e.preventDefault(); });
      newBtn.addEventListener('mouseup', function() {});
    }

    function restoreDriveButton() {
      var btn = document.getElementById('drive-thru-btn');
      if (btn) btn.remove();
      A._driveBtn = null;
      if (A.walkModeActive && typeof A.startDriveThru === 'function') {
        A.startDriveThru();
      }
    }

    function startNavigation(target) {
      console.log('[S233] §NAV_DIAG target="' + (target.element_name||'?') + '" class=' + target.ifc_class +
        ' storey="' + target.storey + '" pos=(' + target.cx.toFixed(1) + ',' + target.cy.toFixed(1) + ',' + target.cz.toFixed(1) + ')' +
        ' walkActive=' + !!A.walkModeActive + ' db=' + !!A.db +
        ' modelOffset=' + (A.modelOffset ? '(' + A.modelOffset.x.toFixed(1) + ',' + A.modelOffset.y.toFixed(1) + ',' + A.modelOffset.z.toFixed(1) + ')' : 'null') +
        ' camera=' + (A.camera ? '(' + A.camera.position.x.toFixed(1) + ',' + A.camera.position.y.toFixed(1) + ',' + A.camera.position.z.toFixed(1) + ')' : 'null') +
        ' bldCentres=' + Object.keys(A.buildingCentres || {}).length +
        ' storeyLevels=' + (A.walkStoreyLevels ? A.walkStoreyLevels.length : 0));

      var startPos;
      var startLabel;
      if (A.walkModeActive && A.camera) {
        var cx = A.camera.position.x + A.modelOffset.x;
        var cy = -(A.camera.position.z) + A.modelOffset.y;
        var cz = A.camera.position.y + A.modelOffset.z;
        startPos = { x: cx, y: cy, z: cz };
        startLabel = 'current position';
      } else {
        startPos = A.findMainEntrance();
        startLabel = 'main entrance';
      }
      if (!startPos) {
        A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_find_no_start||'No start position \u2014 cannot navigate';
        console.log('[S233] §NAV_NO_START db=' + !!A.db + ' bldCentres=' + JSON.stringify(Object.keys(A.buildingCentres || {})));
        return;
      }
      console.log('[S233] §NAV_START_POS from="' + startLabel + '" ifc=(' + startPos.x.toFixed(1) + ',' + startPos.y.toFixed(1) + ',' + (startPos.z||0).toFixed(1) + ')');

      if (typeof A.cacheStoreyLevels === 'function') A.cacheStoreyLevels();

      var wp = A.buildPath(startPos, { x: target.cx, y: target.cy }, target.storey);
      if (!wp || wp.length < 2) {
        A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_find_no_path||'No path found';
        console.log('[S233] §NAV_NO_PATH start=' + JSON.stringify(startPos) + ' target=' + JSON.stringify({ x: target.cx, y: target.cy }) + ' storey=' + target.storey);
        return;
      }
      console.log('[S233] §NAV_PATH waypoints=' + wp.length + ' from=' + startLabel +
        ' start=(' + startPos.x.toFixed(1) + ',' + startPos.y.toFixed(1) + ')' +
        ' target=(' + target.cx.toFixed(1) + ',' + target.cy.toFixed(1) + ')');

      nav.waypoints = wp;
      nav.stepIdx = 0;
      nav.active = true;
      nav.targetName = A.friendlyName(target.element_name, target.ifc_class);
      nav.targetIfc = { x: target.cx, y: target.cy, z: target.cz };
      A.navActive = true;
      A.navCurrentStep = 0;

      var targetThree = A.ifc2three(target.cx, target.cy, target.cz);
      if (A.highlightElement) A.highlightElement(target.guid, new THREE.Vector3(targetThree.x, targetThree.y, targetThree.z));

      if (!A.walkModeActive) {
        A.walkModeActive = true;
        if (A.controls) A.controls.enabled = true;
        if (typeof A.startDriveThru === 'function') A.startDriveThru();
        if (typeof A.cacheStoreyLevels === 'function') A.cacheStoreyLevels();
        var walkBtn = document.getElementById('walk-mode-btn');
        if (walkBtn) walkBtn.classList.add('active');
        var prompt = document.getElementById('walk-anchor-prompt');
        if (prompt) prompt.style.display = 'none';
        console.log('[S233] §NAV_WALK_ACTIVATED minimal (no setWalkAnchor)');
      }

      moveCameraToWaypoint(0, true);

      console.log('[S233] §NAV_WAYPOINTS_DUMP count=' + wp.length + ' [' +
        wp.map(function(w, i) { return i + ':(' + w.x.toFixed(0) + ',' + w.y.toFixed(0) + (w.label ? ',"' + w.label + '"' : '') + ')'; }).join(' → ') + ']');

      if (navHud) navHud.style.display = 'block';
      if (panel) panel.style.display = 'none';
      updateNavHud();

      overrideDriveButton();

      document.addEventListener('keydown', navKeyHandler);

      var totalDist = computeTotalDistance();
      console.log('[S233] §NAV_START target="' + nav.targetName + '" from=' + startLabel + ' waypoints=' + wp.length + ' dist=' + totalDist.toFixed(1) + 'm voice=' + nav.voiceMode);

      speak('Navigate to ' + nav.targetName + ' from ' + startLabel + '. ' + Math.round(totalDist) + ' metres.');
    }

    function stopNavigation() {
      nav.active = false;
      nav.waypoints = [];
      nav.stepIdx = 0;
      A.navActive = false;
      A.navCurrentStep = 0;
      if (navHud) navHud.style.display = 'none';
      // S275: Force-hide direction cue + clear pending timer
      if (nav._cueTimer) { clearTimeout(nav._cueTimer); nav._cueTimer = null; }
      if (elCue) elCue.className = '';

      restoreDriveButton();

      document.removeEventListener('keydown', navKeyHandler);

      if (document.pointerLockElement) document.exitPointerLock();

      A.walkModeActive = false;
      if (A.controls) A.controls.enabled = true;
      if (A.camera) A.camera.rotation.reorder('XYZ');
      var walkBtn = document.getElementById('walk-mode-btn');
      if (walkBtn) walkBtn.classList.remove('active');

      console.log('[S233] §NAV_STOP walk_exited=true');
    }

    A.navJumpToEnd = function() {
      if (!nav.active || nav.waypoints.length === 0) return;
      nav.stepIdx = nav.waypoints.length - 1;
      A.navCurrentStep = nav.stepIdx;
      moveCameraToWaypoint(nav.stepIdx, false);
      onArrival();
    };

    function moveCameraToWaypoint(idx, instant) {
      var wp = nav.waypoints[idx];
      if (!wp) { console.warn('[S233] §NAV_WP_MISSING idx=' + idx); return; }

      var floorZ = wp.z || 0;
      var pos = A.ifc2three(wp.x, wp.y, floorZ + EYE_HEIGHT);
      var targetPos = new THREE.Vector3(pos.x, pos.y, pos.z);

      console.log('[S233] §NAV_MOVE_CAM wp=' + idx + '/' + nav.waypoints.length +
        ' ifc=(' + wp.x.toFixed(1) + ',' + wp.y.toFixed(1) + ',z=' + floorZ.toFixed(1) + ')' +
        ' three=(' + targetPos.x.toFixed(1) + ',' + targetPos.y.toFixed(1) + ',' + targetPos.z.toFixed(1) + ')' +
        ' instant=' + !!instant + (wp.label ? ' label="' + wp.label + '"' : '') +
        ' before_cam=(' + A.camera.position.x.toFixed(1) + ',' + A.camera.position.y.toFixed(1) + ',' + A.camera.position.z.toFixed(1) + ')');

      if (instant) {
        A.camera.position.copy(targetPos);
        console.log('[S233] §NAV_CAM_SNAPPED to=(' + A.camera.position.x.toFixed(1) + ',' + A.camera.position.y.toFixed(1) + ',' + A.camera.position.z.toFixed(1) + ')');
      } else {
        lerpCamera(targetPos, 500);
      }

      var nextIdx = Math.min(idx + 1, nav.waypoints.length - 1);
      if (nextIdx !== idx) {
        var nextWp = nav.waypoints[nextIdx];
        var nextFloorZ = nextWp.z || floorZ;
        var lookPos = A.ifc2three(nextWp.x, nextWp.y, nextFloorZ + EYE_HEIGHT);
        var lookTarget = new THREE.Vector3(lookPos.x, lookPos.y, lookPos.z);
        if (!nav.pointerLocked && !(A.walkModeActive && A._walkUnlocked)) {
          A.camera.lookAt(lookTarget);
        }
      }
    }

    function lerpCamera(target, durationMs) {
      var start = A.camera.position.clone();
      var startTime = performance.now();
      function tick() {
        var t = Math.min(1, (performance.now() - startTime) / durationMs);
        t = t * t * (3 - 2 * t);
        A.camera.position.lerpVectors(start, target, t);
        if (t < 1) requestAnimationFrame(tick);
      }
      tick();
    }

    A.advanceNavStep = function() {
      if (!nav.active) return;

      var wp = nav.waypoints[nav.stepIdx];
      if (wp && A.camera) {
        var camIfc = { x: A.camera.position.x + (A.modelOffset ? A.modelOffset.x : 0),
                       y: -(A.camera.position.z) + (A.modelOffset ? A.modelOffset.y : 0) };
        var dx = camIfc.x - wp.x, dy = camIfc.y - wp.y;
        var offPath = Math.sqrt(dx * dx + dy * dy);
        if (offPath > 8) {
          var target = nav.results[nav.activeIdx];
          if (target) {
            var newWp = A.buildPath(camIfc, { x: target.cx, y: target.cy }, target.storey || wp.storey);
            if (newWp && newWp.length >= 2) {
              nav.waypoints = newWp;
              nav.stepIdx = 0;
              A.navCurrentStep = 0;
              console.log('[S233] §NAV_REPATH off=' + offPath.toFixed(1) + 'm new_waypoints=' + newWp.length);
              speak('Recalculating route');
            }
          }
        }
      }

      if (nav.stepIdx >= nav.waypoints.length - 1) {
        console.log('[S233] §NAV_STEP_ARRIVE final step=' + nav.stepIdx);
        onArrival();
        return;
      }
      nav.stepIdx++;
      A.navCurrentStep = nav.stepIdx;
      console.log('[S233] §NAV_STEP_ADV step=' + nav.stepIdx + '/' + nav.waypoints.length +
        ' wp=(' + nav.waypoints[nav.stepIdx].x.toFixed(1) + ',' + nav.waypoints[nav.stepIdx].y.toFixed(1) + ')' +
        (nav.waypoints[nav.stepIdx].label ? ' label="' + nav.waypoints[nav.stepIdx].label + '"' : ''));
      moveCameraToWaypoint(nav.stepIdx, false);
      updateNavHud();
      showDirectionCue();

      if (nav.voiceMode) {
        var cue = getDirectionCue();
        if (cue.label) speak(cue.label);
      }
    };

    function goBackStep() {
      if (!nav.active || nav.stepIdx <= 0) return;
      nav.stepIdx--;
      A.navCurrentStep = nav.stepIdx;
      moveCameraToWaypoint(nav.stepIdx, false);
      updateNavHud();
    }

    function resetToStart() {
      if (!nav.active) return;
      nav.stepIdx = 0;
      A.navCurrentStep = 0;
      moveCameraToWaypoint(0, false);
      updateNavHud();
      speak('Returning to start');
    }

    function onArrival() {
      var target = nav.results[nav.activeIdx];
      if (target) {
        var pos = A.ifc2three(target.cx, target.cy, target.cz);
        if (A.highlightElement) A.highlightElement(target.guid, new THREE.Vector3(pos.x, pos.y, pos.z));
        if (typeof A.showInfoPanel === 'function') {
          A.showInfoPanel(target.guid);
        } else {
          var ip = document.getElementById('info-panel');
          if (ip) {
            ip.style.display = 'block';
            var elClass = document.getElementById('info-class');
            var elNm = document.getElementById('info-name');
            if (elClass) elClass.textContent = target.ifc_class;
            if (elNm) elNm.textContent = target.element_name || '';
          }
        }
      }
      speak('Arrived at ' + (nav.targetName || 'target'));
      showCue('arrival', 'ARRIVED');
      console.log('[S233] §NAV_ARRIVE step=' + nav.stepIdx + '/' + nav.waypoints.length);

      setTimeout(function() {
        nav.active = false;
        A.navActive = false;
        if (navHud) navHud.style.display = 'none';
        restoreDriveButton();
        document.removeEventListener('keydown', navKeyHandler);
        if (A.status) A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_find_arrived||'Arrived \u2014 walk freely or Find again';
        console.log('[S233] §NAV_CONTINUE_WALK');
      }, 3000);
    }

    function getDirectionCue() {
      if (nav.stepIdx <= 0 || nav.stepIdx >= nav.waypoints.length - 1) {
        return { icon: '\u2191', label: 'Go straight', cls: 'straight' };
      }
      var prev = nav.waypoints[nav.stepIdx - 1];
      var cur = nav.waypoints[nav.stepIdx];
      var next = nav.waypoints[nav.stepIdx + 1];

      if (cur.transition) {
        var upDown = cur.transition === 'up' ? 'Go up' : 'Go down';
        return { icon: cur.transition === 'up' ? '\u2B06' : '\u2B07',
          label: upDown + ' to ' + (cur.transitionName || 'next floor'), cls: cur.transition };
      }

      var b1 = Math.atan2(cur.y - prev.y, cur.x - prev.x);
      var b2 = Math.atan2(next.y - cur.y, next.x - cur.x);
      var delta = ((b2 - b1) * 180 / Math.PI + 360) % 360;
      if (delta > 180) delta -= 360;

      var atLabel = next.label ? ' at ' + next.label : '';

      if (Math.abs(delta) < 15) return { icon: '\u2191', label: 'Go straight' + atLabel, cls: 'straight' };
      if (Math.abs(delta) < 30) return delta > 0 ?
        { icon: '\u2197', label: 'Slight left' + atLabel, cls: 'slight-left' } :
        { icon: '\u2198', label: 'Slight right' + atLabel, cls: 'slight-right' };
      if (Math.abs(delta) < 150) return delta > 0 ?
        { icon: '\u2190', label: 'Turn left' + atLabel, cls: 'left' } :
        { icon: '\u2192', label: 'Turn right' + atLabel, cls: 'right' };
      return { icon: '\u21B0', label: 'U-turn' + atLabel, cls: 'uturn' };
    }

    function showDirectionCue() {
      var cue = getDirectionCue();
      showCue(cue.cls, cue.label, cue.icon);
    }

    function showCue(cls, label, icon) {
      if (!elCue) return;
      elCue.querySelector('.cue-icon').textContent = icon || '';
      elCue.querySelector('.cue-label').textContent = label || '';
      elCue.className = 'visible nav-cue-' + cls;
      clearTimeout(nav._cueTimer);
      nav._cueTimer = setTimeout(function() { elCue.className = ''; }, 2500);
    }

    function updateNavHud() {
      if (!elBar) return;
      var remaining = computeRemainingDistance();
      var direct = computeDirectDistance();
      var total = nav.waypoints.length;
      var step = nav.stepIdx + 1;
      elBar.innerHTML = '<span>' + nav.targetName + '  \u2022  ' + remaining.toFixed(0) + 'm  \u2022  ' + step + '/' + total +
        '</span> <button id="nav-stop-btn" style="background:rgba(255,60,60,0.6);border:none;color:#fff;border-radius:6px;padding:4px 10px;margin-left:8px;cursor:pointer;font-size:12px;font-weight:600;min-width:36px;min-height:36px">\u2715</button>';
      var stopBtn = document.getElementById('nav-stop-btn');
      if (stopBtn) stopBtn.addEventListener('pointerup', function(e) { e.stopPropagation(); stopNavigation(); });
    }

    function computeDirectDistance() {
      if (!nav.targetIfc || nav.stepIdx >= nav.waypoints.length) return 0;
      var cur = nav.waypoints[nav.stepIdx];
      var dx = nav.targetIfc.x - cur.x;
      var dy = nav.targetIfc.y - cur.y;
      var dz = (nav.targetIfc.z || 0) - (cur.z || 0);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    function computeTotalDistance() {
      var d = 0;
      for (var i = 1; i < nav.waypoints.length; i++) {
        var dx = nav.waypoints[i].x - nav.waypoints[i - 1].x;
        var dy = nav.waypoints[i].y - nav.waypoints[i - 1].y;
        d += Math.sqrt(dx * dx + dy * dy);
      }
      return d;
    }

    function computeRemainingDistance() {
      var d = 0;
      for (var i = nav.stepIdx + 1; i < nav.waypoints.length; i++) {
        var dx = nav.waypoints[i].x - nav.waypoints[i - 1].x;
        var dy = nav.waypoints[i].y - nav.waypoints[i - 1].y;
        d += Math.sqrt(dx * dx + dy * dy);
      }
      return d;
    }

    // ── Desktop keyboard handler (also used by navigate_controls.js) ──
    function navKeyHandler(e) {
      if (!nav.active) return;
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': case 'Enter': case ' ':
          e.preventDefault();
          A.advanceNavStep();
          break;
        case 'ArrowDown': case 's': case 'S':
          e.preventDefault();
          goBackStep();
          break;
        case 'Home':
          e.preventDefault();
          resetToStart();
          break;
        case 'Escape':
          e.preventDefault();
          if (A.closeFindPanel) A.closeFindPanel();
          break;
      }
    }

    // ── Expose on A ──
    A.startNavigation = startNavigation;
    A.stopNavigation = stopNavigation;   // update existing (replaces navigate.js stub)
    A.goBackStep = goBackStep;           // called by navigate_controls.js
    A.resetToStart = resetToStart;       // called by navigate_controls.js
    A._nav = nav;                        // expose nav state for tests
  }

  window.NavigateEngine = { init: init };
})();
