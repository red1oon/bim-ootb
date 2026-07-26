// §CINEMA_PATH_EDITOR — the simplest fastest tour maker.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CINEMA_PATH_EDITOR_MODEL (settled with the user
// 2026-07-26). Opens AFTER the Alt+C 10s preview, with the camera already back at its initial pose.
//
// The whole model in four lines, because everything else here follows from them:
//   1. Waypoints are the ONLY authored data — position + camera height. Nothing else is stored.
//   2. Camera angle is NEVER authored. It is LOS toward the next waypoint. That is why the table
//      carries one extra final row: the stopping waypoint exists to give the last leg something to
//      look at, and dragging waypoint n+1 IS how you change waypoint n's camera angle.
//   3. Waypoints are CONTROL points, not corners — effects.js `_cinemaRoundCorners` cuts inside
//      every corner, bounded by measured clearance, so a sharp corner cannot occur.
//   4. Constant speed: path length sets the clock. The total is then editable and scales the whole
//      film uniformly.
(function() {
  'use strict';
  var CPE_V = 'v1 (§CINEMA_PATH_EDITOR_MODEL — LOS aim, clearance-bounded corners, constant speed)';
  console.log('§CPE_LOADED ' + CPE_V);

  // Held-point verbs mirror the viewer's own navigation verbs (user: "isn't that intuitive?").
  // drag = horizontal (x,z) · ctrl+drag = vertical (camera height) · wheel = still scene zoom.
  var DRAG_VERT_M_PER_PX = 0.02;   // ctrl+drag pixels → metres of height
  var MARKER_R = 0.35;             // metres; hit radius is scaled up separately for easy grabbing
  var GRAB_PX = 18;                // screen-space grab tolerance around a marker

  var _A = null, _state = null;

  function A() { return window.APP; }

  // ── §SELECT-PULSE reuse (navigate_find.js:2160-2227): generation counter + rAF + markDirty, and
  // depthTest:false/renderOrder so the marker SHINES THROUGH WALLS. That last property is
  // load-bearing, not decoration — when the editor opens the camera is outside the building, so a
  // depth-tested marker sitting in a room would simply not be visible at all.
  function _mkMarker(p, color, scale, opacity) {
    var a = A();
    var geo = new THREE.SphereGeometry(MARKER_R * (scale == null ? 1 : scale), 12, 10);
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true,
                                            opacity: (opacity == null ? 0.9 : opacity),
                                            depthTest: false, depthWrite: false });
    var m = new THREE.Mesh(geo, mat);
    m.position.set(p.x, p.y, p.z);
    m.renderOrder = 1003;
    m.userData._cpeMarker = true;
    a.scene.add(m);
    return m;
  }

  function _mkLine(points, color, width) {
    var a = A();
    var geo = new THREE.BufferGeometry();
    var arr = new Float32Array(points.length * 3);
    for (var i = 0; i < points.length; i++) { arr[i * 3] = points[i].x; arr[i * 3 + 1] = points[i].y; arr[i * 3 + 2] = points[i].z; }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    var mat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.95, depthTest: false });
    var l = new THREE.Line(geo, mat);
    l.renderOrder = 1002;
    l.userData._cpeMarker = true;
    a.scene.add(l);
    return l;
  }

  function _clearScene() {
    var a = A();
    if (!_state) return;
    (_state.objs || []).forEach(function(o) {
      if (o.parent) o.parent.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    _state.objs = [];
    _state.markers = [];
    if (a && a.markDirty) a.markDirty();
  }

  // ── The flown curve, drawn from the SAME function the plan flies (effects.js
  // `_cinemaRoundCorners`). Drawing it any other way would make the picture a second, drifting
  // implementation of the path — the exact thing the prime rule forbids.
  function _redrawScene() {
    var a = A();
    _clearScene();
    if (!a.scene || typeof THREE === 'undefined') return;
    var wp = _state.wp;
    var flown = (typeof a.cinemaRoundCorners === 'function') ? a.cinemaRoundCorners(wp) : wp;
    _state.objs.push(_mkLine(flown, 0x4fc3f7, 2));
    for (var i = 0; i < wp.length; i++) {
      var held = (i === _state.held);
      // Blue = a waypoint you have not picked up; ORANGE and breathing = the one you are holding.
      // The blue ones stay clearly visible (they ARE the rest of the path, not decoration) but read
      // as secondary, so at a glance it is obvious which single point your drag will move.
      var m = _mkMarker(wp[i], held ? 0xff8c00 : 0x4fc3f7, held ? 1 : 0.7, held ? 0.95 : 0.75);
      m.userData._cpeIndex = i;
      _state.objs.push(m);
      _state.markers.push(m);
    }
    if (a.markDirty) a.markDirty();
  }

  // CONTINUOUS pulse while a point is held, not a one-shot settle (user, 2026-07-27: "status
  // feedback, the buttons should pulse louder perhaps some orange"). A held point freezes the
  // canvas, so its marker has to stay visibly alive the whole time it is held — a pulse that
  // finishes after 300ms leaves a frozen scene with a static dot, which is exactly the state that
  // reads as a hang.
  // Throttled to PULSE_HZ: every frame would markDirty() continuously and stop the renderer's idle
  // parking for as long as a point is held — on Hospital that is 63k elements re-rendering at full
  // rate while the user types in a text box. 12Hz still reads as a smooth breath.
  var PULSE_HZ = 12;
  function _pulse(idx) {
    var a = A();
    if (!_state || !_state.markers[idx]) return;
    var m = _state.markers[idx];
    var myPulse = ++_state.pulseId;
    var t0 = performance.now(), lastPaint = 0;
    (function frame() {
      if (!_state || myPulse !== _state.pulseId || !m.parent) return;
      var now = performance.now();
      if (now - lastPaint >= 1000 / PULSE_HZ) {
        lastPaint = now;
        var phase = ((now - t0) % 900) / 900;              // 0.9s breath
        var k = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2); // smooth 0→1→0
        m.scale.setScalar(1 + k * 0.9);
        m.material.opacity = 0.65 + k * 0.35;
        if (a.markDirty) a.markDirty();
      }
      requestAnimationFrame(frame);
    })();
  }
  function _stopPulse() {
    if (!_state) return;
    _state.pulseId++;
    if (A().markDirty) A().markDirty();
  }

  // ── Frame a waypoint: back the camera up so the point is genuinely in view and grabbable
  // (§CINEMA_PATH_EDITOR_MODEL item 13). Distance comes from MEASURED clearance where available —
  // in a tight room you must be close or the walls fill the frame; in a hall you want to be back
  // far enough to see the neighbouring legs.
  function _frameWaypoint(idx) {
    var a = A();
    var p = _state.wp[idx];
    var clear = 6;
    try { var f = a.cinemaFan ? a.cinemaFan({ x: p.x, y: p.y, z: p.z }, 8) : null; if (f && isFinite(f.min)) clear = f.min; } catch (e) {}
    var dist = Math.max(5, Math.min(30, clear * 2.5));
    var dir = new THREE.Vector3();
    a.camera.getWorldDirection(dir);
    if (!isFinite(dir.x) || (!dir.x && !dir.z)) dir.set(0, 0, 1);
    var to = { x: p.x - dir.x * dist, y: p.y - dir.y * dist + dist * 0.35, z: p.z - dir.z * dist };
    var from = { x: a.camera.position.x, y: a.camera.position.y, z: a.camera.position.z };
    var tFrom = { x: a.controls.target.x, y: a.controls.target.y, z: a.controls.target.z };
    var gen = ++_state.flyId, t0 = performance.now(), DUR = 420;
    (function step() {
      if (!_state || gen !== _state.flyId) return;
      var u = Math.min(1, (performance.now() - t0) / DUR);
      var e = 1 - Math.pow(1 - u, 3);
      a.camera.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e, from.z + (to.z - from.z) * e);
      a.controls.target.set(tFrom.x + (p.x - tFrom.x) * e, tFrom.y + (p.y - tFrom.y) * e, tFrom.z + (p.z - tFrom.z) * e);
      a.controls.update();
      if (a.markDirty) a.markDirty();
      if (u < 1) requestAnimationFrame(step);
    })();
  }

  // ══ Timing — §CINEMA_PATH_EDITOR_MODEL items 9-11. Constant speed: the metres-per-second implied
  // by the ORIGINAL derived path at its original out-beat duration. Not a guessed m/s constant —
  // it is read off the plan the building itself produced, so every building keeps its own pace.
  function _naturalDuration() {
    var s = _state;
    var len = _flownLength(_state.wp);
    var outSec = len / s.speed;
    return { len: len, outSec: outSec, total: s.baseTotal - s.baseOutSec + outSec };
  }

  function _flownLength(wp) {
    var a = A();
    var pts = (typeof a.cinemaRoundCorners === 'function') ? a.cinemaRoundCorners(wp) : wp;
    var L = 0;
    for (var i = 1; i < pts.length; i++)
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    return L || 1;
  }

  // The override object handed back to A.cinemaPathPlan. `scale` is the uniform speed-up/slow-down
  // the user asks for by keying a different total (item 10) — it multiplies EVERY beat, so the film
  // keeps its proportions and only its pace changes.
  function _buildOverride() {
    var s = _state, nat = _naturalDuration();
    var total = s.userTotal != null ? s.userTotal : nat.total;
    var scale = total / Math.max(0.001, nat.total);
    return {
      waypoints: s.wp.map(function(w) { return { x: w.x, y: w.y, z: w.z }; }),
      diveSec: s.baseSec.dive * scale,
      spinSec: s.baseSec.spin * scale,
      outSec: nat.outSec * scale,
      riseSec: s.baseSec.rise * scale,
      _total: total, _naturalTotal: nat.total, _scale: scale, _pathLen: nat.len
    };
  }

  // ── LOS aim, item 2: the look direction at waypoint n is toward waypoint n+1. Shown in the table
  // read-only, because it is derived — there is nothing here for the user to set.
  function _aimOf(i) {
    var wp = _state.wp;
    if (i >= wp.length - 1) return null;
    var dx = wp[i + 1].x - wp[i].x, dy = wp[i + 1].y - wp[i].y, dz = wp[i + 1].z - wp[i].z;
    var h = Math.hypot(dx, dz);
    return { yaw: Math.atan2(dz, dx) * 180 / Math.PI, pitch: Math.atan2(dy, h || 1e-6) * 180 / Math.PI };
  }

  // ══════════════════ panel ══════════════════
  function _buildPanel() {
    var d = document.createElement('div');
    d.id = 'cpe-panel';
    d.style.cssText = 'position:fixed;top:60px;right:12px;width:396px;max-height:calc(100vh - 96px);' +
      'overflow:auto;background:rgba(20,22,26,0.96);border:1px solid #3a3f47;border-radius:8px;' +
      'z-index:10000;font-family:system-ui,sans-serif;color:#ddd;box-shadow:0 8px 32px rgba(0,0,0,0.6)';
    // Orange breathing glow, same language as the held marker in the canvas — one visual idea for
    // "this is live / this wants your attention", not two unrelated ones.
    if (!document.getElementById('cpe-style')) {
      var st = document.createElement('style');
      st.id = 'cpe-style';
      st.textContent =
        '@keyframes cpe-breathe{0%,100%{box-shadow:0 0 4px rgba(255,140,0,0.35)}50%{box-shadow:0 0 16px rgba(255,140,0,0.95)}}' +
        '.cpe-live{animation:cpe-breathe 1.2s ease-in-out infinite}' +
        '#cpe-panel button{transition:background .15s,color .15s,border-color .15s}' +
        '#cpe-panel button:disabled{opacity:.45;cursor:default}';
      document.head.appendChild(st);
    }
    d.innerHTML =
      '<div style="padding:10px 12px;border-bottom:1px solid #3a3f47;font-size:13px;font-weight:600;color:#4fc3f7">' +
        'Cinema path <span style="font-weight:400;color:#888;font-size:11px">— edit before recording</span></div>' +
      '<div id="cpe-hint" style="padding:6px 12px;font-size:10px;color:#888;border-bottom:1px solid #2a2e34;line-height:1.5"></div>' +
      '<div id="cpe-rows" style="padding:4px 0"></div>' +
      '<div style="padding:8px 12px;border-top:1px solid #3a3f47;font-size:11px" id="cpe-clock"></div>' +
      '<div id="cpe-state" style="padding:0 12px 6px;font-size:10px;color:#666"></div>' +
      '<div style="padding:10px 12px;border-top:1px solid #3a3f47;display:flex;gap:8px;justify-content:flex-end">' +
        '<button id="cpe-cancel" style="padding:6px 12px;font-size:12px;background:#2a2e34;color:#ddd;border:1px solid #4a4f57;border-radius:4px;cursor:pointer">Cancel</button>' +
        '<button id="cpe-save" style="padding:6px 12px;font-size:12px;background:#2a2e34;color:#ddd;border:1px solid #4a4f57;border-radius:4px;cursor:pointer">Save this path</button>' +
        '<button id="cpe-ok" style="padding:6px 14px;font-size:12px;background:#4fc3f7;color:#0b0d10;border:none;border-radius:4px;font-weight:600;cursor:pointer">OK</button>' +
      '</div>';
    document.body.appendChild(d);
    return d;
  }

  function _num(v) { return (Math.round(v * 100) / 100).toFixed(2); }

  function _renderRows() {
    var box = document.getElementById('cpe-rows');
    if (!box) return;
    box.innerHTML = '';
    var wp = _state.wp;
    for (var i = 0; i < wp.length; i++) {
      (function(i) {
        var last = (i === wp.length - 1);
        var aim = _aimOf(i);
        var row = document.createElement('div');
        var isSel = (i === _state.sel), isHeld = (i === _state.held);
        row.style.cssText = 'padding:5px 12px;font-size:11px;display:flex;align-items:center;gap:5px;cursor:pointer;' +
          'border-left:3px solid ' + (isHeld ? '#ffcc00' : isSel ? '#4fc3f7' : 'transparent') + ';' +
          (isSel || isHeld ? 'background:rgba(79,195,247,0.10);' : '');
        var lbl = document.createElement('span');
        lbl.style.cssText = 'width:64px;color:' + (last ? '#ffb74d' : '#888') + ';flex:none';
        // The final row is the STOPPING waypoint (item 2) — labelled so its purpose is obvious
        // rather than looking like a stray extra point.
        lbl.textContent = last ? 'stop' : (i === 0 ? 'settle' : 'wp' + i);
        lbl.title = last ? 'the stopping waypoint — it exists to give the last leg its look direction' : '';
        row.appendChild(lbl);
        ['x', 'z', 'y'].forEach(function(ax) {
          var inp = document.createElement('input');
          inp.type = 'number'; inp.step = '0.1';
          inp.value = _num(wp[i][ax]);
          inp.title = ax === 'y' ? 'camera height' : ax;
          inp.style.cssText = 'width:62px;background:#15181c;border:1px solid #3a3f47;color:' +
            (ax === 'y' ? '#8bc34a' : '#ddd') + ';border-radius:3px;padding:2px 4px;font-size:11px;font-family:monospace';
          // Two-way binding (item 19): keying a number moves the canvas immediately.
          inp.addEventListener('change', function() {
            var v = parseFloat(inp.value);
            if (!isFinite(v)) { inp.value = _num(wp[i][ax]); return; }
            wp[i][ax] = v;
            console.log('§CPE_KEY i=' + i + ' ' + ax + '=' + v.toFixed(2));
            _state.staged = false;   // the staged path no longer matches what is on screen
            _redrawScene(); _renderClock(); _syncButtons();
          });
          inp.addEventListener('click', function(ev) { ev.stopPropagation(); });
          row.appendChild(inp);
        });
        var aimEl = document.createElement('span');
        aimEl.style.cssText = 'flex:1;text-align:right;color:#666;font-size:10px;font-family:monospace';
        // Derived, never editable — moving the NEXT point is how this changes (item 3).
        aimEl.textContent = aim ? (Math.round(aim.yaw) + '° / ' + Math.round(aim.pitch) + '°') : '—';
        aimEl.title = aim ? 'LOS aim toward the next waypoint (derived — drag the next point to change it)'
                          : 'stopping waypoint: nothing after it to look at';
        row.appendChild(aimEl);
        row.addEventListener('click', function() { _select(i, true); });
        box.appendChild(row);
      })(i);
    }
  }

  function _renderClock() {
    var el = document.getElementById('cpe-clock');
    if (!el) return;
    var s = _state, nat = _naturalDuration();
    var total = s.userTotal != null ? s.userTotal : nat.total;
    var fps = s.fps || 15;
    el.innerHTML = '';
    var line1 = document.createElement('div');
    line1.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
    line1.innerHTML = '<span style="color:#888">total</span>';
    var inp = document.createElement('input');
    inp.type = 'number'; inp.step = '1'; inp.min = '4';
    inp.value = (Math.round(total * 10) / 10);
    inp.style.cssText = 'width:64px;background:#15181c;border:1px solid #3a3f47;color:#4fc3f7;border-radius:3px;padding:2px 4px;font-size:11px;font-family:monospace';
    inp.title = 'total seconds — changing this speeds up or slows down the WHOLE clip uniformly';
    inp.addEventListener('change', function() {
      var v = parseFloat(inp.value);
      if (!isFinite(v) || v < 1) { inp.value = (Math.round(total * 10) / 10); return; }
      _state.userTotal = v;
      console.log('§CPE_TOTAL set=' + v.toFixed(1) + 's natural=' + nat.total.toFixed(1) + 's scale=' + (v / nat.total).toFixed(3));
      _state.staged = false;
      _renderClock(); _syncButtons();
    });
    line1.appendChild(inp);
    var sfx = document.createElement('span');
    sfx.style.cssText = 'color:#888';
    // Item 11 — the render cost behind that field, surfaced rather than hidden.
    sfx.innerHTML = 's &nbsp;·&nbsp; <span style="color:#666">' + Math.round(total * fps) + ' frames to bake</span>';
    line1.appendChild(sfx);
    el.appendChild(line1);
    var line2 = document.createElement('div');
    line2.style.cssText = 'color:#666;font-size:10px;font-family:monospace';
    var dTot = total - s.baseTotal;
    line2.textContent = 'path ' + nat.len.toFixed(1) + 'm · ' + s.speed.toFixed(2) + ' m/s · natural ' +
      nat.total.toFixed(1) + 's' + (Math.abs(dTot) > 0.05 ? '  (' + (dTot > 0 ? '+' : '') + dTot.toFixed(1) + 's vs original)' : '');
    el.appendChild(line2);
  }

  function _renderHint() {
    var el = document.getElementById('cpe-hint');
    if (!el) return;
    // Item 17: a frozen canvas with no explanation reads as a hang, so the held state is always
    // spelled out in words as well as colour.
    el.innerHTML = _state.held != null
      ? '<b style="color:#ffcc00">Holding ' + (_state.held === _state.wp.length - 1 ? 'stop' : _state.held === 0 ? 'settle' : 'wp' + _state.held) +
        '</b> — drag to move, ctrl+drag for height, wheel still zooms. <b>Double-click empty space to release.</b>'
      : 'Click a row or a point to hold it. Camera angle is always toward the next point, so move a point to aim the one before it.';
  }

  function _select(i, frame) {
    var was = _state.held;
    _state.sel = i;
    _state.held = i;
    if (A().controls) A().controls.enabled = false;   // item 13 — same pattern as grid_drag.js
    // Only log a CHANGE of hold. Re-clicking the same row is common and logged it every time
    // (observed 4-5 identical lines in a row, live Hospital 2026-07-27).
    if (was !== i) console.log('§CPE_HOLD i=' + i + ' controls.enabled=false');
    _redrawScene(); _renderRows(); _renderHint(); _syncButtons();
    _pulse(i);
    if (frame) _frameWaypoint(i);
  }

  function _release(why) {
    if (_state.held == null) return;
    var was = _state.held;
    _state.held = null;
    _stopPulse();
    if (A().controls) A().controls.enabled = true;
    console.log('§CPE_RELEASE i=' + was + ' why=' + why + ' controls.enabled=true');
    _redrawScene(); _renderRows(); _renderHint(); _syncButtons();
  }

  // ══ Button status feedback (user, 2026-07-27: "status feedback, the buttons should pulse louder
  // perhaps some orange"). The buttons carry the answer to "what happens if I stop now?":
  //   nothing edited → OK is the plain default, Save is disabled (there is nothing to save)
  //   edited        → OK turns ORANGE and breathes (a different film is queued), Save lights up
  //   saved         → Save goes quiet and says so, because the edit is now staged
  // Same orange, same breath as the held marker in the canvas — one idea, two places.
  function _syncButtons() {
    var ok = document.getElementById('cpe-ok'),
        save = document.getElementById('cpe-save'),
        note = document.getElementById('cpe-state');
    if (!ok || !save) return;
    var edited = _isEdited();
    ok.classList.toggle('cpe-live', edited);
    ok.style.background = edited ? '#ff8c00' : '#4fc3f7';
    ok.textContent = edited ? 'OK — record this' : 'OK';
    save.disabled = !edited || _state.staged;
    save.classList.toggle('cpe-live', edited && !_state.staged);
    save.style.borderColor = (edited && !_state.staged) ? '#ff8c00' : '#4a4f57';
    save.style.color = (edited && !_state.staged) ? '#ffb74d' : '#ddd';
    save.textContent = _state.staged ? 'Path saved' : 'Save this path';
    if (note) {
      var nat = _naturalDuration();
      var total = _state.userTotal != null ? _state.userTotal : nat.total;
      note.style.color = edited ? '#ffb74d' : '#666';
      note.textContent = _state.staged
        ? 'Saved — Ctrl+S writes it into the building file.'
        : edited
          ? 'Edited — ' + total.toFixed(1) + 's film queued. Not saved to the building.'
          : 'Unedited — OK records exactly the film the preview just showed.';
    }
  }

  function _isEdited() {
    if (!_state || !_state.origWp) return false;
    if (_state.userTotal != null && Math.abs(_state.userTotal - _naturalDuration().total) > 0.05) return true;
    var b = _state.origWp;
    if (_state.wp.length !== b.length) return true;
    for (var i = 0; i < b.length; i++)
      if (Math.abs(_state.wp[i].x - b[i].x) > 1e-6 || Math.abs(_state.wp[i].y - b[i].y) > 1e-6 ||
          Math.abs(_state.wp[i].z - b[i].z) > 1e-6) return true;
    return false;
  }

  // ══════════════════ canvas interaction ══════════════════
  function _screenOf(p) {
    var a = A();
    var v = new THREE.Vector3(p.x, p.y, p.z).project(a.camera);
    var r = a.canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, behind: v.z > 1 };
  }

  function _hitTest(ev) {
    // Screen-space proximity rather than a mesh raycast: the markers draw with depthTest:false so
    // they are clickable through walls, and a depth-sorted raycast would disagree with what the
    // user can actually see.
    var best = -1, bestD = GRAB_PX;
    for (var i = 0; i < _state.wp.length; i++) {
      var s = _screenOf(_state.wp[i]);
      if (s.behind) continue;
      var d = Math.hypot(ev.clientX - s.x, ev.clientY - s.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Horizontal drag: intersect the pointer ray with the horizontal plane through the point's own
  // height, so the point tracks the cursor exactly instead of sliding at a camera-dependent rate.
  function _planePoint(ev, height) {
    var a = A();
    var r = a.canvas.getBoundingClientRect();
    var ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    var rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, a.camera);
    var dir = rc.ray.direction, org = rc.ray.origin;
    if (Math.abs(dir.y) < 1e-5) return null;
    var t = (height - org.y) / dir.y;
    if (t <= 0) return null;
    return { x: org.x + dir.x * t, z: org.z + dir.z * t };
  }

  function _wire() {
    var a = A(), c = a.canvas;
    var h = {};

    h.down = function(ev) {
      if (!_state) return;
      var i = _hitTest(ev);
      if (i >= 0) {
        ev.preventDefault(); ev.stopPropagation();
        _select(i, false);
        _state.drag = { i: i, ctrl: !!ev.ctrlKey, y0: ev.clientY, h0: _state.wp[i].y };
        return;
      }
      // Item 16: while a point is held, a stray click must not run element picking and select the
      // wall behind the waypoint.
      if (_state.held != null) { ev.preventDefault(); ev.stopPropagation(); }
    };

    h.move = function(ev) {
      if (!_state || !_state.drag) return;
      ev.preventDefault(); ev.stopPropagation();
      var d = _state.drag, w = _state.wp[d.i];
      if (d.ctrl || ev.ctrlKey) {
        // ctrl+drag → camera height (item 14). Up on screen = up in the world.
        w.y = d.h0 + (d.y0 - ev.clientY) * DRAG_VERT_M_PER_PX;
      } else {
        var p = _planePoint(ev, w.y);
        if (p) { w.x = p.x; w.z = p.z; }
      }
      _state.staged = false;
      _redrawScene(); _renderRows(); _renderClock(); _syncButtons();
    };

    h.up = function(ev) {
      if (!_state || !_state.drag) return;
      var d = _state.drag, w = _state.wp[d.i];
      _state.drag = null;
      console.log('§CPE_DRAG i=' + d.i + ' axis=' + (d.ctrl ? 'height' : 'xz') +
        ' → (' + w.x.toFixed(2) + ',' + w.y.toFixed(2) + ',' + w.z.toFixed(2) + ')');
      _renderClock();
    };

    // Item 15 — double-click empty canvas releases. Single click was rejected by the user as too
    // easy to trigger and lose the point.
    h.dbl = function(ev) {
      if (!_state) return;
      if (_hitTest(ev) >= 0) return;
      ev.preventDefault(); ev.stopPropagation();
      _release('dblclick');
    };

    // Touch has no dblclick — same 350ms double-tap window picking.js:174 already uses for measure
    // mode, reused rather than reinvented.
    h.touchTap = function(ev) {
      if (!_state) return;
      var t = ev.changedTouches && ev.changedTouches[0];
      if (!t) return;
      var fake = { clientX: t.clientX, clientY: t.clientY };
      if (_hitTest(fake) >= 0) return;
      var now = Date.now();
      if (_state.lastTap && (now - _state.lastTap) < 350) { _state.lastTap = 0; _release('double-tap'); }
      else _state.lastTap = now;
    };

    c.addEventListener('pointerdown', h.down, true);
    window.addEventListener('pointermove', h.move, true);
    window.addEventListener('pointerup', h.up, true);
    c.addEventListener('dblclick', h.dbl, true);
    c.addEventListener('touchend', h.touchTap, true);
    _state.handlers = h;
  }

  function _unwire() {
    var a = A(), c = a.canvas, h = _state.handlers;
    if (!h) return;
    c.removeEventListener('pointerdown', h.down, true);
    window.removeEventListener('pointermove', h.move, true);
    window.removeEventListener('pointerup', h.up, true);
    c.removeEventListener('dblclick', h.dbl, true);
    c.removeEventListener('touchend', h.touchTap, true);
  }

  // ══════════════════ public API ══════════════════
  // open({plan, durationSec, fps}) → Promise<{action:'ok'|'cancel', override, durationSec}>
  function open(ctx) {
    var a = A();
    return new Promise(function(resolve) {
      var plan = ctx.plan;
      if (!plan || !plan.waypoints || plan.waypoints.length < 2) {
        console.warn('§CPE_SKIP plan has no waypoints — nothing to edit, proceeding unchanged');
        return resolve({ action: 'ok', override: null, durationSec: ctx.durationSec });
      }
      _state = {
        wp: plan.waypoints.map(function(w) { return { x: w.x, y: w.y, z: w.z }; }),
        // Pristine copy — "edited" is measured against what the plan derived, so a value typed and
        // typed back does not count as an edit and guardrail 2 still holds.
        origWp: plan.waypoints.map(function(w) { return { x: w.x, y: w.y, z: w.z }; }),
        staged: false,
        sel: null, held: null, drag: null, objs: [], markers: [], pulseId: 0, flyId: 0,
        baseSec: { dive: plan.sec.dive, spin: plan.sec.spin, out: plan.sec.out, rise: plan.sec.rise },
        baseOutSec: plan.sec.out,
        baseTotal: ctx.durationSec,
        baseLen: plan.pathLen,
        // Constant speed, read off the building's OWN derived plan — never a guessed m/s.
        speed: plan.pathLen / Math.max(0.001, plan.sec.out),
        userTotal: null,
        fps: ctx.fps || 15,
        camSave: { px: a.camera.position.x, py: a.camera.position.y, pz: a.camera.position.z,
                   tx: a.controls.target.x, ty: a.controls.target.y, tz: a.controls.target.z },
        controlsWere: a.controls ? a.controls.enabled : true
      };
      console.log('§CPE_OPEN waypoints=' + _state.wp.length + ' pathLen=' + plan.pathLen.toFixed(1) +
        'm outSec=' + plan.sec.out.toFixed(1) + ' speed=' + _state.speed.toFixed(2) + 'm/s total=' +
        ctx.durationSec.toFixed(1) + 's');

      var panel = _buildPanel();
      _state.panel = panel;
      _redrawScene(); _renderRows(); _renderClock(); _renderHint(); _syncButtons();
      _wire();

      function finish(action) {
        var ov = (action === 'ok' || action === 'save') ? _buildOverride() : null;
        var edited = ov ? _isEdited() : false;
        _stopPulse();
        _release('close');
        _unwire();
        _clearScene();
        if (panel.parentNode) panel.parentNode.removeChild(panel);
        if (a.controls) a.controls.enabled = _state.controlsWere;
        // Always hand the camera back exactly as the editor found it — the bake starts from the
        // same pose whether or not anything was edited.
        a.camera.position.set(_state.camSave.px, _state.camSave.py, _state.camSave.pz);
        a.controls.target.set(_state.camSave.tx, _state.camSave.ty, _state.camSave.tz);
        a.controls.update();
        if (a.markDirty) a.markDirty();
        var total = ov ? ov._total : _state.baseTotal;
        console.log('§CPE_CLOSE action=' + action + ' edited=' + edited + ' total=' + total.toFixed(1) + 's');
        _state = null;
        // Guardrail 2: an untouched OK hands back NO override at all, so the bake re-uses the
        // derived plan verbatim. "One click costs nothing" is enforced here, not merely intended.
        resolve({ action: action === 'cancel' ? 'cancel' : 'ok',
                  override: edited ? ov : null,
                  saved: action === 'save',
                  durationSec: edited ? total : ctx.durationSec });
      }

      document.getElementById('cpe-ok').addEventListener('click', function() { finish('ok'); });
      document.getElementById('cpe-cancel').addEventListener('click', function() { finish('cancel'); });
      document.getElementById('cpe-save').addEventListener('click', function() {
        // Explicit persistence (guardrail 5): stage into the in-memory DB; the user's normal Ctrl+S
        // carries it to the file, exactly as staffage does. Never auto-persist on adjust.
        var ov = _buildOverride();
        if (typeof a.stageCinemaPath === 'function') a.stageCinemaPath(ov);
        // Staging is not closing: the user said "save this path", not "record it now". Keep the
        // editor open so they can carry on adjusting, and let the buttons say what happened.
        _state.staged = true;
        _syncButtons();
      });
    });
  }

  var _attach = setInterval(function() {
    if (window.APP) {
      window.APP.cinemaPathEditor = { open: open, version: CPE_V };
      clearInterval(_attach);
    }
  }, 500);
})();
