// §CINEMA_PATH_EDITOR — the simplest fastest tour maker.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md — §CINEMA_PATH_EDITOR_MODEL (data model) and
// §CPE_BANDS (this build). Opens AFTER the Alt+C 10s preview, camera already back at its initial pose.
//
// The model in five lines, because everything else follows from them:
//   1. Three rigid BANDS — settle, exit door, stop. A band is a short STRAIGHT segment: centre,
//      direction, length. Length and straightness never morph.
//   2. Its two ends are a TANGENT. That is why bands beat points: a point carries position only, and
//      tangents are what actually shape a curve.
//   3. End-drag ROTATES the band about its far end. Middle-drag TRANSLATES it. Length is a typed
//      field, never a drag.
//   4. Camera angle is NEVER authored — it is LOS to the next waypoint, so inside a band that means
//      along the band, and at a band's end it means into the next one.
//   5. Three rows, six waypoints, three stored records. The path expands to six at plan time, flies,
//      and discards them.
(function() {
  'use strict';
  // ⚠ BUMP THIS ON EVERY BEHAVIOUR CHANGE — it is how a pasted console answers "which build is this?".
  // Missed for §CPE_DRAG_TELEPORT (#1035): the cache-bust and sw CACHE_VERSION were bumped but this
  // string was not, so v5 named both the with- and without-fix builds and a user asking "am I on the
  // right version?" could not be answered from their own log. That is the whole job of this line.
  var CPE_V = 'v10 (§CPE_DRAG_LAND_FIRST no re-plan during a drag; §CPE_DRAG_SCALE building-derived m/px, camera distance no longer gears the drag; §CPE_UNDO Ctrl+Z/Ctrl+Shift+Z + history-line event; §CPE_DRAG_TELEPORT delta (reach cap removed, G-DRAG-3); §CPE_WALK 2.3m/s; §CPE_PREVIEW_DIVERGENCE plan pinned to open pose; §CPE_BANDS + §CPE_SCREEN_PLANE + §CPE_PANEL_DRAG)';
  console.log('§CPE_LOADED ' + CPE_V);

  var HANDLE_R = 0.30;             // metres
  var GRAB_PX = 18;                // screen-space grab tolerance
  var PULSE_HZ = 12;               // throttled: an every-frame markDirty defeats idle parking
  var FILM_SAMPLES = 240;          // tube resolution along the whole film
  var REPLAN_MS = 120;             // trailing throttle for the live re-derive

  var _state = null;
  // §CPE_PANEL_DRAG: where the user last dragged the panel, remembered for the session only (see
  // the spec's "scope note"). Module scope, not _state — _state dies with each editor session.
  var _panelPos = null;
  function A() { return window.APP; }

  // ══════════════════ scene objects ══════════════════
  // depthTest:false + renderOrder so everything the editor draws SHINES THROUGH WALLS. Load-bearing,
  // not decoration: when the editor opens the camera is outside the building, so a depth-tested
  // handle sitting in a room would simply not be visible.
  function _mkSphere(p, color, scale, opacity) {
    var g = new THREE.SphereGeometry(HANDLE_R * (scale || 1), 12, 10);
    var m = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity == null ? 0.95 : opacity,
                                          depthTest: false, depthWrite: false });
    var o = new THREE.Mesh(g, m);
    o.position.set(p.x, p.y, p.z);
    o.renderOrder = 1004;
    A().scene.add(o);
    return o;
  }

  function _mkLine(points, color, opacity) {
    var geo = new THREE.BufferGeometry();
    var arr = new Float32Array(points.length * 3);
    for (var i = 0; i < points.length; i++) { arr[i * 3] = points[i].x; arr[i * 3 + 1] = points[i].y; arr[i * 3 + 2] = points[i].z; }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    var mat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity == null ? 0.95 : opacity, depthTest: false });
    var l = new THREE.Line(geo, mat);
    l.renderOrder = 1003;
    A().scene.add(l);
    return l;
  }

  // The flight path as a TUBE, not a line (user: "the flight path should a thicker perhaps
  // blue/yellow pipe depending on background colour to contrast"). WebGL ignores
  // LineBasicMaterial.linewidth on nearly every driver, so a "thick line" is not achievable as a
  // line at all — real geometry is the only way to get a readable pipe.
  function _mkTube(points, color, radius) {
    if (points.length < 2) return null;
    var vs = points.map(function(p) { return new THREE.Vector3(p.x, p.y, p.z); });
    var curve = new THREE.CatmullRomCurve3(vs);
    var geo = new THREE.TubeGeometry(curve, Math.min(400, points.length), radius, 8, false);
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.72,
                                            depthTest: false, depthWrite: false });
    var o = new THREE.Mesh(geo, mat);
    o.renderOrder = 1002;
    A().scene.add(o);
    return o;
  }

  // Contrast against whatever the background currently is, re-checked on every redraw so toggling
  // the background (B) doesn't leave the pipe invisible.
  function _pipeColor() {
    var a = A(), lum = 0.1;
    try {
      var bg = a.scene && a.scene.background;
      if (bg && bg.isColor) lum = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b;
      else if (a.renderer && a.renderer.getClearColor) {
        var c = new THREE.Color();
        a.renderer.getClearColor(c);
        lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      }
    } catch (e) {}
    return lum > 0.5 ? 0x1565c0 : 0xffd54f;   // blue on light, yellow on dark
  }

  function _clearScene() {
    if (!_state) return;
    (_state.objs || []).forEach(function(o) {
      if (o.parent) o.parent.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    _state.objs = [];
    _state.handles = [];
  }

  // ══════════════════ band maths ══════════════════
  function _ends(b) {
    var h = b.len / 2;
    return [{ x: b.c.x - b.d.x * h, y: b.c.y - b.d.y * h, z: b.c.z - b.d.z * h },
            { x: b.c.x + b.d.x * h, y: b.c.y + b.d.y * h, z: b.c.z + b.d.z * h }];
  }
  function _norm(v) {
    var L = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / L, y: v.y / L, z: v.z / L };
  }
  // Rotate a band about its FAR end, holding length exactly (§CPE_BANDS rule 2: rigid, never
  // resized). The dragged end is therefore not free — it is placed at exactly `len` from the fixed
  // end along whatever direction the cursor implies.
  function _rotateAbout(b, movingIsB, target) {
    var e = _ends(b);
    var fixed = movingIsB ? e[0] : e[1];
    var dir = _norm({ x: target.x - fixed.x, y: target.y - fixed.y, z: target.z - fixed.z });
    if (!movingIsB) { dir = { x: -dir.x, y: -dir.y, z: -dir.z }; }   // keep d pointing A→B
    var h = b.len / 2;
    var sign = movingIsB ? 1 : -1;
    b.d = dir;
    b.c = { x: fixed.x + dir.x * h * sign, y: fixed.y + dir.y * h * sign, z: fixed.z + dir.z * h * sign };
  }

  // ══════════════════ the film ══════════════════
  // Draw the WHOLE film, not the three anchors (user: "the whole flight path must be visible…
  // dive origin → settle → wp1 → stop → orbit"). Sampled from plan.poseAt, which IS what the bake
  // flies — drawing it any other way would be a second implementation of the path, free to drift
  // from the real one.
  function _replanFilm() {
    var a = A(), t0 = performance.now();
    var ov = _buildOverride();
    // §CPE_PREVIEW_DIVERGENCE: plan from the camera pose the editor OPENED with — the pose the bake
    // will plan from, because finish() restores exactly this before resolving. Without it the film
    // silently re-derived from wherever the user had orbited to, so (a) the baked film differed from
    // the edited one and (b) merely LOOKING at the path from another angle changed it.
    // Attached to a COPY, never to the override itself: _buildOverride() is also what "Save this
    // path" stages and what finish() hands the bake, and a camera basis is session state — pinning a
    // stored path to one session's camera is exactly the bug this fixes, inverted.
    var povr = {}; for (var k in ov) povr[k] = ov[k];
    var cs = _state.camSave;
    if (cs) povr._camBasis = { px: cs.px, py: cs.py, pz: cs.pz, tx: cs.tx, ty: cs.ty, tz: cs.tz };
    // ══ §CPE_HOLDER_INTEGRITY (user, 2026-07-27: "u can persist in a holder, then calc, then apply
    // back to holder" / "or there is something in the canvas code threejs that mutates?").
    // _state.bands IS that holder, and _buildOverride already hands the plan a deep COPY of centre,
    // direction and length — so the calc is separated "but taking its form", as asked. What was
    // never PROVEN is that nothing writes back through some alias (the drawn handles hold `b.c` by
    // reference for the mid zone, and the plan chain runs through cinemaSeedBands/cinemaBandFlow/
    // three.js). So assert it instead of trusting it: snapshot the holder, run the calc, compare.
    // Costs a 3-band string compare per re-plan and turns "is something mutating?" into a log line.
    var _holder0 = JSON.stringify(_state.bands);
    var plan = null;
    try { plan = a.cinemaPathPlan(ov._total, povr); } catch (e) { console.warn('§CPE_REPLAN_FAIL ' + e.message); }
    if (JSON.stringify(_state.bands) !== _holder0) {
      console.warn('§CPE_HOLDER_MUTATED the calc wrote back into the authored bands — ' +
        'before=' + _holder0 + ' after=' + JSON.stringify(_state.bands) +
        ' (the holder must be read-only to the plan; this is a real defect, not a warning to live with)');
    }
    if (!plan) return;
    var pts = [];
    for (var i = 0; i <= FILM_SAMPLES; i++) {
      var p = plan.poseAt(i / FILM_SAMPLES);
      pts.push({ x: p.x, y: p.y, z: p.z });
    }
    _state.filmPts = pts;
    _state.plan = plan;
    _state.replanMs = performance.now() - t0;
    if (_state.replanMs > 250) console.log('§CPE_REPLAN_SLOW ms=' + _state.replanMs.toFixed(0));
  }

  function _scheduleReplan() {
    if (_state._replanTimer) return;
    _state._replanTimer = setTimeout(function() {
      _state._replanTimer = null;
      if (!_state) return;
      _replanFilm();
      _redrawScene();
      _renderClock();
    }, REPLAN_MS);
  }

  function _redrawScene() {
    var a = A();
    _clearScene();
    if (!a.scene || typeof THREE === 'undefined') return;
    var col = _pipeColor();
    var env = (_state.plan && _state.plan.envelope) || 50;
    var rad = Math.max(0.06, Math.min(0.9, env / 300));

    if (_state.filmPts && _state.filmPts.length > 1) {
      var tube = _mkTube(_state.filmPts, col, rad);
      if (tube) _state.objs.push(tube);
    }

    // Bands drawn ON TOP of the pipe, in the contrast colour's opposite, so the three editable
    // stretches are findable along a curve that is otherwise uniform.
    for (var i = 0; i < _state.bands.length; i++) {
      var b = _state.bands[i], e = _ends(b);
      var heldBand = _state.held && _state.held.b === i;
      _state.objs.push(_mkLine([e[0], e[1]], heldBand ? 0xff8c00 : 0xffffff, 1.0));
      var zones = [{ p: e[0], z: 'a' }, { p: b.c, z: 'mid' }, { p: e[1], z: 'b' }];
      for (var k = 0; k < zones.length; k++) {
        var isHeld = heldBand && _state.held.z === zones[k].z;
        var isMid = zones[k].z === 'mid';
        var o = _mkSphere(zones[k].p, isHeld ? 0xff8c00 : isMid ? 0xffffff : 0x4fc3f7,
                          isHeld ? 1.2 : isMid ? 0.9 : 0.75, isHeld ? 1.0 : 0.8);
        _state.objs.push(o);
        _state.handles.push({ b: i, z: zones[k].z, p: zones[k].p, mesh: o });
      }
    }
    if (a.markDirty) a.markDirty();
  }

  function _pulse() {
    var a = A();
    if (!_state || !_state.held) return;
    var myPulse = ++_state.pulseId, t0 = performance.now(), last = 0;
    (function frame() {
      if (!_state || myPulse !== _state.pulseId) return;
      var now = performance.now();
      if (now - last >= 1000 / PULSE_HZ) {
        last = now;
        var k = 0.5 - 0.5 * Math.cos(((now - t0) % 900) / 900 * Math.PI * 2);
        for (var i = 0; i < _state.handles.length; i++) {
          var h = _state.handles[i];
          if (_state.held && h.b === _state.held.b && h.z === _state.held.z) {
            h.mesh.scale.setScalar(1 + k * 0.8);
            h.mesh.material.opacity = 0.7 + k * 0.3;
          }
        }
        if (a.markDirty) a.markDirty();
      }
      requestAnimationFrame(frame);
    })();
  }
  function _stopPulse() { if (_state) { _state.pulseId++; if (A().markDirty) A().markDirty(); } }

  // ══════════════════ timing ══════════════════
  function _flownLength() {
    var a = A();
    var pts = a.cinemaBandFlow ? a.cinemaBandFlow(_state.bands) : [];
    var L = 0;
    for (var i = 1; i < pts.length; i++)
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    return L || 1;
  }
  function _naturalDuration() {
    var s = _state, len = _flownLength(), outSec = len / s.speed;
    return { len: len, outSec: outSec, total: s.baseTotal - s.baseOutSec + outSec };
  }
  function _buildOverride() {
    var s = _state, nat = _naturalDuration();
    var total = s.userTotal != null ? s.userTotal : nat.total;
    var scale = total / Math.max(0.001, nat.total);
    return {
      bands: s.bands.map(function(b) {
        return { c: { x: b.c.x, y: b.c.y, z: b.c.z }, d: { x: b.d.x, y: b.d.y, z: b.d.z }, len: b.len };
      }),
      diveSec: s.baseSec.dive * scale, spinSec: s.baseSec.spin * scale,
      outSec: nat.outSec * scale, riseSec: s.baseSec.rise * scale,
      _total: total, _naturalTotal: nat.total, _scale: scale, _pathLen: nat.len
    };
  }
  function _isEdited() {
    if (!_state || !_state.origBands) return false;
    if (_state.userTotal != null && Math.abs(_state.userTotal - _naturalDuration().total) > 0.05) return true;
    var o = _state.origBands;
    for (var i = 0; i < o.length; i++) {
      var a = _state.bands[i], b = o[i];
      if (Math.abs(a.len - b.len) > 1e-6) return true;
      if (Math.abs(a.c.x - b.c.x) > 1e-6 || Math.abs(a.c.y - b.c.y) > 1e-6 || Math.abs(a.c.z - b.c.z) > 1e-6) return true;
      if (Math.abs(a.d.x - b.d.x) > 1e-6 || Math.abs(a.d.y - b.d.y) > 1e-6 || Math.abs(a.d.z - b.d.z) > 1e-6) return true;
    }
    return false;
  }

  // ══════════════════ panel ══════════════════
  var ROW_LABEL = ['settle', 'exit door', 'stop'];
  var ROW_HELP = ['where the dive lands and the camera looks around',
                  'the door it walks out through — drag it back inside to shape the interior leg',
                  'end of the WALK, not the film; its far end stretches the orbit'];

  function _buildPanel() {
    if (!document.getElementById('cpe-style')) {
      var st = document.createElement('style');
      st.id = 'cpe-style';
      st.textContent =
        '@keyframes cpe-breathe{0%,100%{box-shadow:0 0 4px rgba(255,140,0,0.35)}50%{box-shadow:0 0 16px rgba(255,140,0,0.95)}}' +
        '.cpe-live{animation:cpe-breathe 1.2s ease-in-out infinite}' +
        '#cpe-panel button{transition:background .15s,color .15s,border-color .15s}' +
        '#cpe-panel button:disabled{opacity:.45;cursor:default}' +
        '#cpe-panel input{background:#15181c;border:1px solid #3a3f47;border-radius:3px;padding:2px 4px;' +
        'font-size:11px;font-family:monospace;color:#ddd}';
      document.head.appendChild(st);
    }
    var d = document.createElement('div');
    d.id = 'cpe-panel';
    d.style.cssText = 'position:fixed;top:60px;right:12px;width:412px;max-height:calc(100vh - 96px);' +
      'overflow:auto;background:rgba(20,22,26,0.96);border:1px solid #3a3f47;border-radius:8px;' +
      'z-index:10000;font-family:system-ui,sans-serif;color:#ddd;box-shadow:0 8px 32px rgba(0,0,0,0.6)';
    // §CPE_PANEL_DRAG: the header is the grab handle. Titled with the gesture so it is discoverable
    // without a tooltip hunt — the same "say what the drag does" habit as #cpe-hint below.
    d.innerHTML =
      '<div id="cpe-title" title="drag to move this panel" style="padding:10px 12px;border-bottom:1px solid #3a3f47;' +
        'font-size:13px;font-weight:600;color:#4fc3f7;cursor:move;user-select:none">' +
        'Cinema path <span style="font-weight:400;color:#888;font-size:11px">— 3 bands · drag this bar to move</span></div>' +
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

    // ══ §CPE_PANEL_DRAG (CINEMA_PATH_EDITOR.md) — user 2026-07-27: "can u make the editor panel
    // draggable". The panel sits over exactly the strip of viewport the user orbits the bands into
    // once §CPE_SCREEN_PLANE has them facing the plane they want to drag in.
    // REUSE, not a second implementation: A._makeDraggable (measure.js:13) is this viewer's one
    // panel-drag utility, already carrying ~10 panels. Do not fork it, do not edit it.
    // _dragStrip = 36 pins the grab zone to the header exactly — the rows below carry number inputs
    // whose keyed edits must never fling the panel (gate D3).
    var a = A();
    if (a && typeof a._makeDraggable === 'function') {
      d._dragStrip = 36;
      a._makeDraggable(d);
      if (_panelPos) { d.style.left = _panelPos.left + 'px'; d.style.top = _panelPos.top + 'px'; d.style.right = 'auto'; }
      // Remember where the user put it for the rest of the session (spec §CPE_PANEL_DRAG "scope
      // note"): re-opening for the next bake should not throw the panel back across the screen.
      // Nothing is persisted to the DB — this is not `cinema_path` state.
      // Measured off the element itself rather than off the pointer, so the log is the truth about
      // where the panel ENDED UP, not where the cursor was.
      var _pdRect = null;
      d.addEventListener('pointerdown', function() { _pdRect = d.getBoundingClientRect(); });
      d.addEventListener('pointerup', function() {
        if (!_pdRect) return;
        var r = d.getBoundingClientRect();
        var mx = r.left - _pdRect.left, my = r.top - _pdRect.top;
        _pdRect = null;
        if (Math.abs(mx) + Math.abs(my) < 1) return;   // a tap on the header is not a move
        _panelPos = { left: Math.round(r.left), top: Math.round(r.top) };
        console.log('§CPE_PANEL_MOVED dx=' + mx.toFixed(0) + ' dy=' + my.toFixed(0) +
          ' left=' + _panelPos.left + ' top=' + _panelPos.top + ' (remembered for this session)');
      });
      console.log('§CPE_PANEL_DRAGGABLE handle=cpe-title strip=' + d._dragStrip +
        (_panelPos ? ' restored left=' + _panelPos.left + ' top=' + _panelPos.top : ' at default anchor'));
    } else {
      console.warn('§CPE_PANEL_DRAGGABLE unavailable — A._makeDraggable missing (measure.js not loaded)');
    }
    return d;
  }

  function _num(v) { return (Math.round(v * 100) / 100).toFixed(2); }

  // ══ §CPE_UNDO (user, 2026-07-27: "allow UNDO, Ctl-Z as reflecting in the history line to take
  // effect so a misplaced can be easily reverted"). A misplaced drag is now one keystroke away from
  // being gone, which is what makes direct manipulation safe to experiment with.
  //
  // DELIBERATELY a local snapshot stack, NOT KernelOps/UniversalHistory.undo(): a waypoint edit is
  // TRANSIENT editor state until the user explicitly saves the path (§CPE_BUILT persistence), so it
  // has no signed kernel op to flip. Routing it through the model op-log would mint fake model ops
  // for edits that may never be saved, and Ctrl+Z would then undo the wrong thing once the editor
  // closed. The history LINE still shows it — via UniversalHistory.recordEvent, the existing
  // read-only detail-event channel (universal_history.js, HISTORY_SESSION_EVENTS.md A1) — so the
  // user sees the edit land on the timeline exactly as they asked, without faking a model change.
  var _UNDO_MAX = 50;
  function _cloneBands(bs) {
    return bs.map(function(b) {
      return { c: { x: b.c.x, y: b.c.y, z: b.c.z }, d: { x: b.d.x, y: b.d.y, z: b.d.z }, len: b.len };
    });
  }
  // Call BEFORE mutating, with a label naming the edit. Redo is dropped on a new edit — the standard
  // linear-undo rule, and the same one UniversalHistory itself applies to a new op after a step-back.
  function _undoPush(label) {
    if (!_state) return;
    if (!_state.undo) { _state.undo = []; _state.redo = []; }
    _state.undo.push({ bands: _cloneBands(_state.bands), label: label });
    if (_state.undo.length > _UNDO_MAX) _state.undo.shift();
    _state.redo = [];
  }
  function _histEvent(label) {
    // The history line. recordEvent is the read-only channel, so this never touches kernel_ops.
    try {
      var UH = window.UniversalHistory;
      if (UH && UH.recordEvent) UH.recordEvent('CINEMA_PATH_EDIT', label, null);
    } catch (e) {}
  }
  function _undoApply(fromStack, toStack, dir) {
    if (!_state || !fromStack || !fromStack.length) {
      console.log('§CPE_UNDO ' + dir + ' — nothing to ' + dir);
      return false;
    }
    var snap = fromStack.pop();
    toStack.push({ bands: _cloneBands(_state.bands), label: snap.label });
    _state.bands = _cloneBands(snap.bands);
    _state.staged = false;
    _state.held = null; _state.drag = null;
    console.log('§CPE_UNDO ' + dir + ' "' + snap.label + '" depth=' + fromStack.length +
      ' bands=' + _state.bands.length);
    _histEvent((dir === 'undo' ? 'Undo: ' : 'Redo: ') + snap.label);
    _replanFilm(); _redrawScene(); _renderRows(); _renderClock(); _renderHint(); _syncButtons();
    return true;
  }
  function _undo() { return _undoApply(_state && _state.undo, _state && _state.redo, 'undo'); }
  function _redo() { return _undoApply(_state && _state.redo, _state && _state.undo, 'redo'); }

  function _renderRows() {
    var box = document.getElementById('cpe-rows');
    if (!box) return;
    box.innerHTML = '';
    for (var i = 0; i < _state.bands.length; i++) {
      (function(i) {
        var b = _state.bands[i];
        var sel = _state.held && _state.held.b === i;
        var row = document.createElement('div');
        row.style.cssText = 'padding:5px 12px;font-size:11px;cursor:pointer;' +
          'border-left:3px solid ' + (sel ? '#ff8c00' : 'transparent') + ';' + (sel ? 'background:rgba(255,140,0,0.09);' : '');
        var head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:5px';
        var lbl = document.createElement('span');
        lbl.style.cssText = 'width:62px;color:#888;flex:none';
        lbl.textContent = ROW_LABEL[i] || ('band' + i);
        lbl.title = ROW_HELP[i] || '';
        head.appendChild(lbl);
        ['x', 'z', 'y'].forEach(function(ax) {
          var inp = document.createElement('input');
          inp.type = 'number'; inp.step = '0.1'; inp.value = _num(b.c[ax]);
          inp.title = ax === 'y' ? 'camera height (band centre)' : ax + ' (band centre)';
          inp.style.width = '58px';
          if (ax === 'y') inp.style.color = '#8bc34a';
          inp.addEventListener('change', function() {
            var v = parseFloat(inp.value);
            if (!isFinite(v)) { inp.value = _num(b.c[ax]); return; }
            _undoPush('band ' + i + ' ' + ax);
            b.c[ax] = v;
            console.log('§CPE_KEY band=' + i + ' centre.' + ax + '=' + v.toFixed(2));
            _state.staged = false;
            _replanFilm(); _redrawScene(); _renderClock(); _syncButtons();
          });
          inp.addEventListener('click', function(ev) { ev.stopPropagation(); });
          head.appendChild(inp);
        });
        // Length is a TYPED field, not a drag — §CPE_BANDS rule 4. Dragging an end rotates the band
        // about its far end and cannot change its length, so there is no gesture that could set it.
        var len = document.createElement('input');
        len.type = 'number'; len.step = '0.1'; len.min = '0.1'; len.value = _num(b.len);
        len.title = 'band length (metres) — rigid, so this is the only way to change it';
        len.style.cssText = 'width:52px;color:#ffb74d';
        len.addEventListener('change', function() {
          var v = parseFloat(len.value);
          if (!isFinite(v) || v <= 0.05) { len.value = _num(b.len); return; }
          _undoPush('band ' + i + ' length');
          b.len = v;
          console.log('§CPE_LEN band=' + i + ' len=' + v.toFixed(2) + 'm');
          _state.staged = false;
          _replanFilm(); _redrawScene(); _renderClock(); _syncButtons();
        });
        len.addEventListener('click', function(ev) { ev.stopPropagation(); });
        head.appendChild(len);
        row.appendChild(head);
        var sub = document.createElement('div');
        sub.style.cssText = 'padding:2px 0 0 62px;font-size:9px;color:#666;font-family:monospace';
        var yaw = Math.atan2(b.d.z, b.d.x) * 180 / Math.PI;
        var pitch = Math.atan2(b.d.y, Math.hypot(b.d.x, b.d.z)) * 180 / Math.PI;
        sub.textContent = 'aim ' + Math.round(yaw) + '° / ' + Math.round(pitch) + '°  ·  ' + (ROW_HELP[i] || '');
        row.appendChild(sub);
        row.addEventListener('click', function() { _hold(i, 'mid', true); });
        box.appendChild(row);
      })(i);
    }
  }

  function _renderClock() {
    var el = document.getElementById('cpe-clock');
    if (!el) return;
    var s = _state, nat = _naturalDuration();
    var total = s.userTotal != null ? s.userTotal : nat.total;
    el.innerHTML = '';
    var l1 = document.createElement('div');
    l1.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
    l1.innerHTML = '<span style="color:#888">total</span>';
    var inp = document.createElement('input');
    inp.type = 'number'; inp.step = '1'; inp.min = '4';
    inp.value = (Math.round(total * 10) / 10);
    inp.style.cssText = 'width:64px;color:#4fc3f7';
    inp.title = 'total seconds — scales the WHOLE clip uniformly';
    inp.addEventListener('change', function() {
      var v = parseFloat(inp.value);
      if (!isFinite(v) || v < 1) { inp.value = (Math.round(total * 10) / 10); return; }
      _state.userTotal = v; _state.staged = false;
      console.log('§CPE_TOTAL set=' + v.toFixed(1) + 's natural=' + nat.total.toFixed(1) + 's scale=' + (v / nat.total).toFixed(3));
      _replanFilm(); _redrawScene(); _renderClock(); _syncButtons();
    });
    l1.appendChild(inp);
    var sfx = document.createElement('span');
    sfx.style.color = '#888';
    sfx.innerHTML = 's &nbsp;·&nbsp; <span style="color:#666">' + Math.round(total * (s.fps || 15)) + ' frames to bake</span>';
    l1.appendChild(sfx);
    el.appendChild(l1);
    var l2 = document.createElement('div');
    l2.style.cssText = 'color:#666;font-size:10px;font-family:monospace';
    var d = total - s.baseTotal;
    l2.textContent = 'walk ' + nat.len.toFixed(1) + 'm · ' + s.speed.toFixed(2) + ' m/s · natural ' + nat.total.toFixed(1) + 's' +
      (Math.abs(d) > 0.05 ? '  (' + (d > 0 ? '+' : '') + d.toFixed(1) + 's vs original)' : '') +
      (s.replanMs ? '  · replan ' + s.replanMs.toFixed(0) + 'ms' : '');
    el.appendChild(l2);
  }

  function _renderHint() {
    var el = document.getElementById('cpe-hint');
    if (!el) return;
    el.innerHTML = _state.held
      ? '<b style="color:#ff8c00">' + (ROW_LABEL[_state.held.b] || '') +
        (_state.held.z === 'mid' ? ' — whole band' : ' — end, pivots about the other end') +
        '</b>. It moves in the plane you are <b>facing</b>: orbit first to choose the axes, then drag.'
      : 'Drag a band end to pivot it, its middle to move the whole band. Anywhere else orbits the scene as normal — turn to face the axes you want, since a drag moves in the plane you are looking at.';
  }

  function _syncButtons() {
    var ok = document.getElementById('cpe-ok'), save = document.getElementById('cpe-save'),
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
      note.textContent = _state.staged ? 'Saved — Ctrl+S writes it into the building file.'
        : edited ? 'Edited — ' + total.toFixed(1) + 's film queued. Not saved to the building.'
                 : 'Unedited — OK records exactly the film the preview just showed.';
    }
  }

  // ══════════════════ hold / release ══════════════════
  function _hold(bi, zone, frame) {
    var same = _state.held && _state.held.b === bi && _state.held.z === zone;
    _state.held = { b: bi, z: zone };
    // §CPE_SCREEN_PLANE: the canvas is NEVER frozen. Orbiting is half the editing gesture, so
    // disabling controls would disable the way you choose which axes a drag moves in. Dragging and
    // orbiting are told apart by the hit-test on pointerdown, not by a mode.
    if (!same) console.log('§CPE_SELECT band=' + bi + ' zone=' + zone + ' (canvas stays live)');
    _redrawScene(); _renderRows(); _renderHint(); _syncButtons();
    _pulse();
    if (frame) _frameBand(bi);
  }

  function _release(why) {
    if (!_state || !_state.held) return;
    var was = _state.held;
    _state.held = null;
    _stopPulse();
    console.log('§CPE_DESELECT band=' + was.b + ' zone=' + was.z + ' why=' + why);
    _redrawScene(); _renderRows(); _renderHint(); _syncButtons();
  }

  function _frameBand(bi) {
    var a = A(), p = _state.bands[bi].c, clear = 6;
    try { var f = a.cinemaFan ? a.cinemaFan({ x: p.x, y: p.y, z: p.z }, 8) : null; if (f && isFinite(f.min) && f.min < 59.9) clear = f.min; } catch (e) {}
    var dist = Math.max(6, Math.min(35, clear * 2.5));
    var dir = new THREE.Vector3();
    a.camera.getWorldDirection(dir);
    if (!isFinite(dir.x) || (!dir.x && !dir.z)) dir.set(0, 0, 1);
    var to = { x: p.x - dir.x * dist, y: p.y - dir.y * dist + dist * 0.35, z: p.z - dir.z * dist };
    var from = { x: a.camera.position.x, y: a.camera.position.y, z: a.camera.position.z };
    var tf = { x: a.controls.target.x, y: a.controls.target.y, z: a.controls.target.z };
    var gen = ++_state.flyId, t0 = performance.now();
    (function step() {
      if (!_state || gen !== _state.flyId) return;
      var u = Math.min(1, (performance.now() - t0) / 420), e = 1 - Math.pow(1 - u, 3);
      a.camera.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e, from.z + (to.z - from.z) * e);
      a.controls.target.set(tf.x + (p.x - tf.x) * e, tf.y + (p.y - tf.y) * e, tf.z + (p.z - tf.z) * e);
      a.controls.update();
      if (a.markDirty) a.markDirty();
      if (u < 1) requestAnimationFrame(step);
    })();
  }

  // ══════════════════ canvas interaction ══════════════════
  function _screenOf(p) {
    var a = A();
    var v = new THREE.Vector3(p.x, p.y, p.z).project(a.camera);
    var r = a.canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, behind: v.z > 1 };
  }
  // Screen-space proximity, not a mesh raycast: the handles draw with depthTest:false so they are
  // clickable through walls, and a depth-sorted raycast would disagree with what is actually visible.
  function _hitTest(ev) {
    var best = null, bestD = GRAB_PX;
    for (var i = 0; i < _state.handles.length; i++) {
      var h = _state.handles[i], s = _screenOf(h.p);
      if (s.behind) continue;
      var d = Math.hypot(ev.clientX - s.x, ev.clientY - s.y);
      if (d < bestD) { bestD = d; best = h; }
    }
    return best;
  }
  // ══ §CPE_DRAG_SCALE — FIXED AT THE SOURCE (user, 2026-07-27: "the jumping wypt still happening"
  // → "fix the scale" → "FIX THE SOURCE").
  //
  // The source is the projection itself. The old `_viewPlanePoint` intersected the cursor ray with
  // a plane through the handle, so world-metres-per-pixel was the handle's DISTANCE FROM THE CAMERA
  // divided by the focal length — measured 0.151 m/px on Duplex (handle 91 m out), 0.227 on
  // Terminal (138 m) and 0.453 on Hospital (274 m). Same gesture, three different world speeds; on
  // Hospital a 50 px nudge threw a waypoint 22.7 m, 76% of the whole walk. That is the jump, and no
  // clamp downstream can fix it because the mapping itself is wrong.
  //
  // The fix: the drag rate is a property of the BUILDING, not of where the camera happens to be
  // standing. One screen height = one building envelope, in the camera's own right/up basis (so
  // §CPE_SCREEN_PLANE's "it moves in the plane you are facing" is unchanged — only the SCALE is).
  //     m/px = envelope / canvasHeightPx
  // Derived, not picked: `envelope` is the plan's own max building dimension, already used for the
  // orbit radius and the tube thickness. Every building now drags at the same fraction-of-itself
  // per pixel, and zooming the camera no longer silently changes the gearing.
  function _dragBasis() {
    var a = A(), r = a.canvas.getBoundingClientRect();
    var env = (_state && _state.plan && _state.plan.envelope) || 50;
    var mpp = env / Math.max(1, r.height);
    var right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();
    a.camera.matrixWorld.extractBasis(right, up, fwd);
    return { mpp: mpp, right: right, up: up, env: env, h: r.height };
  }
  // Screen pixels since pointerdown -> a world offset. Pure delta: a zero-pixel drag is a
  // zero-metre move by construction, and returning the cursor returns the waypoint EXACTLY (the
  // invariant §CPE_DRAG_TELEPORT established and G-DRAG-3 proved a reach cap destroys).
  function _dragDelta(ev, d) {
    var B = _dragBasis();
    var dx = (ev.clientX - d.sx0) * B.mpp, dy = -(ev.clientY - d.sy0) * B.mpp;
    return { x: B.right.x * dx + B.up.x * dy,
             y: B.right.y * dx + B.up.y * dy,
             z: B.right.z * dx + B.up.z * dy };
  }

  // ══ §CPE_DRAG_TRACK — the lag, measured in the app, on every real gesture.
  //
  // §CPE_DRAG_SCALE gears the drag to the BUILDING (envelope/canvasHeight), not to the handle's
  // distance from the camera. A constant rate equals the perspective rate at exactly one depth, so
  // everywhere else the handle cannot land under the cursor. Measured by witness_cpe_drag_track.js
  // on 2026-07-27: Duplex 0.071 m/px in force against 0.151 needed at the handle's 91m depth (the
  // band landed 102px behind a 194px gesture), Terminal 0.097 against 0.219 at 132m (108px behind).
  // Consistently 0.44-0.47x.
  //
  // USER RULING, 2026-07-27, shown those numbers — this is NOT a defect and must not be gated:
  //   "I think it is fine.. the slight jump is no longer exagerated, it is in small measures so the
  //    user able to hold and see it coming back quicker than before. I see the effect is the path
  //    only follows after releasing the wypt which may still jump but in small leap which is more of
  //    a feature as user need not drag further on fear of losing to big jump."
  // The under-gearing IS the safety margin: half-speed means an overshoot is small and recoverable,
  // which is the whole reason §CPE_DRAG_TELEPORT's big leaps were frightening in the first place.
  // And the amplification is wanted for a reason cursor-lock cannot serve, user same day:
  //   "the amplification is good in sense the user need not do much dragging as it is hard over
  //    canvas that is overlay to get XY plane"
  // The gesture is made against an overlay, aiming for a plane the camera has to be orbited into
  // first — a long drag there is genuinely awkward. Amplifying band->path buys reach that the hand
  // does not have to supply, which is the OPPOSITE of what a 1:1 cursor-lock would give. Anyone
  // reading the 0.45x figure as a bug to fix should read this paragraph first.
  //
  // So this is a LOG, not a gate. It exists because a rate that drifts from ~0.45x — toward 1.0x
  // (the leaps come back) or toward 0 (the drag stops responding) — is the shape of the next
  // regression, and nothing else in the console would show it. Derived from the gesture's own
  // pixels and the camera frustum, independent of how _dragBasis computed the rate, so it can
  // contradict that code rather than merely echo it.
  function _logDragTrack(d, b, len0) {
    if (d.lx == null) return;                      // a press that never moved: nothing to measure
    var a = A(), r = a.canvas.getBoundingClientRect();
    var pix = Math.hypot(d.lx - d.sx0, d.ly - d.sy0);
    if (pix < 1) return;
    // How far the thing actually travelled. For 'mid' that is the centre; for an end drag the band
    // rotates about its far end, so the moved end is centre +/- half the (rigid) length along dir.
    var s = d.z === 'b' ? 1 : d.z === 'a' ? -1 : 0;
    var now = { x: b.c.x + b.d.x * b.len / 2 * s, y: b.c.y + b.d.y * b.len / 2 * s, z: b.c.z + b.d.z * b.len / 2 * s };
    var world = Math.hypot(now.x - d.p0.x, now.y - d.p0.y, now.z - d.p0.z);
    // The rate that WOULD have kept the handle under the cursor: one pixel subtends
    // 2*D*tan(fov/2)/H metres at the grabbed handle's depth D.
    var D = Math.hypot(d.p0.x - a.camera.position.x, d.p0.y - a.camera.position.y, d.p0.z - a.camera.position.z);
    var need = 2 * D * Math.tan(a.camera.fov * Math.PI / 180 / 2) / Math.max(1, r.height);
    var got = world / pix;
    var ratio = need > 0 ? got / need : 0;
    // ── THE LEVER. User, 2026-07-27, describing what they actually feel: "Its like a lever effect.
    // Move small length, it exagerates bigger but not jump as the path has not react yet until
    // release." That is NOT the cursor->band gearing above (which is under-geared, 0.45x) — it is
    // the SECOND stage: band -> re-derived path. A metre of band moves the walk by more than a
    // metre, because the plan re-routes the whole leg around it. The two stages point opposite
    // ways, which is precisely why the gesture feels safe and the result still feels big, and why
    // measuring only one of them explains neither. Lever = metres of path per metre of band.
    var lever = (len0 != null && _state.plan && world > 0.01)
      ? (_state.plan.pathLen - len0) / world : null;
    console.log('§CPE_DRAG_TRACK zone=' + d.z + ' gesture=' + pix.toFixed(0) + 'px moved=' + world.toFixed(2) +
      'm rate=' + got.toFixed(4) + ' m/px vs cursor-lock ' + need.toFixed(4) + ' m/px at depth ' +
      D.toFixed(0) + 'm — ratio=' + ratio.toFixed(2) + 'x' +
      (d.z === 'mid' ? ' lag=' + (pix * (1 - ratio)).toFixed(0) + 'px' : ' (end drag: rigid length, rotation not translation)') +
      ' — UNDER-GEARED BY DESIGN (user ruling 2026-07-27: small leaps are the feature). Watch for drift toward 1.00x.' +
      ' | LEVER pathLen ' + (len0 == null ? '?' : len0.toFixed(1)) + 'm -> ' +
      (_state.plan ? _state.plan.pathLen.toFixed(1) : '?') + 'm = ' +
      (lever == null ? 'n/a' : (lever >= 0 ? '+' : '') + lever.toFixed(2) + 'm of path per metre of band') +
      ' (the exaggeration; it lands ONCE, after release, never during the gesture)');
  }

  function _wire() {
    var a = A(), c = a.canvas, h = {};
    h.down = function(ev) {
      if (!_state) return;
      var hit = _hitTest(ev);
      if (hit) {
        // Only a hit is claimed. Everything else falls straight through to OrbitControls, so the
        // scene stays fully navigable while the editor is open.
        ev.preventDefault(); ev.stopPropagation();
        _hold(hit.b, hit.z, false);
        // §CPE_UNDO: the snapshot is NOT taken here. A press that never moves must not leave an
        // undo entry behind — G-DRAG-1 gates that a zero-pixel press changes nothing, so an undo
        // step for it would be a Ctrl+Z that visibly does nothing and silently eats the user's real
        // previous edit. Taken on the FIRST actual movement instead (see h.move), which is the
        // moment an edit genuinely begins.
        _state.drag = { b: hit.b, z: hit.z, snapped: false,
                        sx0: ev.clientX, sy0: ev.clientY,     // §CPE_DRAG_SCALE: the gesture is measured in PIXELS now
                        c0: { x: _state.bands[hit.b].c.x, y: _state.bands[hit.b].c.y, z: _state.bands[hit.b].c.z },
                        p0: { x: hit.p.x, y: hit.p.y, z: hit.p.z } };
        var _b0 = _dragBasis();
        console.log('§CPE_DRAG_SCALE grab band=' + hit.b + ' zone=' + hit.z +
          ' rate=' + _b0.mpp.toFixed(3) + ' m/px (envelope ' + _b0.env.toFixed(0) + 'm / ' +
          _b0.h.toFixed(0) + 'px) — camera distance no longer sets the gearing');
      }
    };
    h.move = function(ev) {
      if (!_state || !_state.drag) return;
      ev.preventDefault(); ev.stopPropagation();
      var d = _state.drag, b = _state.bands[d.b];
      var dw = _dragDelta(ev, d);          // §CPE_DRAG_SCALE: pixels x a building-derived rate
      var p = { x: d.p0.x + dw.x, y: d.p0.y + dw.y, z: d.p0.z + dw.z };
      d.lx = ev.clientX; d.ly = ev.clientY;   // §CPE_DRAG_TRACK reads the gesture's own last pixel
      // First real movement of this gesture = the edit is now happening; snapshot the pre-drag
      // state exactly once, before anything below mutates it.
      if (!d.snapped) { d.snapped = true; _undoPush('drag band ' + d.b + ' (' + d.z + ')'); }
      if (d.z === 'mid') {
        // Middle = the whole length moving as one.
        // §CPE_DRAG_TELEPORT (user, Hospital, 2026-07-27: "went off to a spot user didnt put.
        // Draging it back, still flew back"). This USED to assign the projected cursor point
        // absolutely — `b.c = p` — so the band's new centre became whatever the grab ray happened
        // to meet, not the centre plus the gesture. Any depth error in the grab point `p0` therefore
        // became a PERMANENT offset, and every later drag re-anchored its plane at the already-wrong
        // depth — which is exactly "dragging it back still flew back". Measured in their log: band 1
        // centre y=+39.24 against floorY=-15.47 (~55m above the floor), pathLen 32.3m -> 161.7m.
        // DELTA, not absolute: `c0` was already captured on pointerdown for this and was never read
        // — the intent was here all along. A zero-pixel drag is now a zero-metre move by
        // construction, and any p0 depth error cancels out of (p - p0) instead of accumulating.
        // §CPE_DRAG_REACH — REMOVED, and the removal is the finding. A per-gesture cap was tried
        // (limit reach to the building's derived walk length) and G-DRAG-3 measured it BREAKING the
        // very case it was meant to help: at 0.132 m/px a 175px drag wants 23m, the cap granted
        // 12.6m, so the band stopped under a cursor that had moved on — the handle was no longer
        // where the user was pointing, the return drag hit nothing, and out-and-back left a 12.6m
        // residue. Direct manipulation has ONE invariant: the thing you grabbed stays under the
        // cursor. A reach cap cannot hold that invariant by construction. The sensitivity the user
        // felt was the absolute-assignment bug (fixed above), not the 1:1 mapping itself.
        b.c.x = d.c0.x + dw.x;
        b.c.y = d.c0.y + dw.y;
        b.c.z = d.c0.z + dw.z;
      } else {
        // End = pivot about the far end. Length is invariant, so this is pure rotation.
        _rotateAbout(b, d.z === 'b', p);
      }
      _state.staged = false;
      _redrawScene();          // handles track the cursor instantly
      // ══ §CPE_DRAG_LAND_FIRST (user, 2026-07-27: "i think it jumps because of the post calcn.
      // Thus it is to separate the two. Let it land first, persisted." — and their console proves
      // it). The re-plan used to run on a 120ms trailing throttle DURING the gesture, and it is not
      // cheap: their log shows §CPE_REPLAN_SLOW ms=1218 firing repeatedly mid-drag. Each one
      // re-derives the WHOLE plan under the moving cursor — measured in that same log, across one
      // drag: pitch0 -80.5° -> -5.9°, the chosen exit door changed (Double-Flush -> Curtain Wall),
      // orbitDY 0.09m -> -20.79m, pathLen 30 -> 64 -> 106 -> 187m. The following pointermove then
      // resolved against a scene that had moved under it, and the band landed at
      // centre=(-1.32,63.47,-11.49) — y=63.47 IS the camera's own height (cam=(0.5,63.4,-10.6)).
      // The waypoint jumped onto the camera.
      //
      // Dragging and re-deriving are now SEPARATE: the gesture only moves handles (pure, local,
      // instant), and the film re-derives ONCE in h.up after the drag has landed. No throttle to
      // tune, and no plan can change mid-gesture because none runs mid-gesture.
      if (_state._replanTimer) { clearTimeout(_state._replanTimer); _state._replanTimer = null; }
    };
    h.up = function() {
      if (!_state || !_state.drag) return;
      var d = _state.drag, b = _state.bands[d.b];
      _state.drag = null;
      console.log('§CPE_DRAG landed band=' + d.b + ' zone=' + d.z + ' plane=view (re-plan runs NOW, once)' +
        ' centre=(' + b.c.x.toFixed(2) + ',' + b.c.y.toFixed(2) + ',' + b.c.z.toFixed(2) + ')' +
        ' dir=(' + b.d.x.toFixed(2) + ',' + b.d.y.toFixed(2) + ',' + b.d.z.toFixed(2) + ') len=' + b.len.toFixed(2));
      var _len0 = _state.plan ? _state.plan.pathLen : null;   // the path as it stood when you let go
      _replanFilm();
      _logDragTrack(d, b, _len0);
      _redrawScene(); _renderRows(); _renderClock(); _syncButtons();
    };
    // §CPE_UNDO: Ctrl+Z / Ctrl+Shift+Z (and Ctrl+Y) while the editor is OPEN. Same bindings
    // grid_drag.js already uses, and like it this listener is added on open and removed on close, so
    // it cannot shadow any other Ctrl+Z once the editor is gone. Capture phase + preventDefault so
    // the browser's own text-undo never fights it while a number input has focus.
    h.key = function(e) {
      if (!_state) return;
      var k = (e.key || '').toLowerCase();
      if (!e.ctrlKey || (k !== 'z' && k !== 'y')) return;
      e.preventDefault(); e.stopPropagation();
      if (k === 'y' || (k === 'z' && e.shiftKey)) _redo(); else _undo();
    };
    window.addEventListener('keydown', h.key, true);
    c.addEventListener('pointerdown', h.down, true);
    window.addEventListener('pointermove', h.move, true);
    window.addEventListener('pointerup', h.up, true);
    _state.handlers = h;
  }
  function _unwire() {
    var c = A().canvas, h = _state.handlers;
    if (!h) return;
    c.removeEventListener('pointerdown', h.down, true);
    window.removeEventListener('pointermove', h.move, true);
    window.removeEventListener('pointerup', h.up, true);
    if (h.key) window.removeEventListener('keydown', h.key, true);
  }

  // ══════════════════ public API ══════════════════
  function open(ctx) {
    var a = A();
    return new Promise(function(resolve) {
      var plan = ctx.plan;
      if (!plan || !plan.waypoints || plan.waypoints.length < 2 || typeof a.cinemaSeedBands !== 'function') {
        console.warn('§CPE_SKIP no waypoints to seed bands from — proceeding unchanged');
        return resolve({ action: 'ok', override: null, durationSec: ctx.durationSec });
      }
      var seeded = a.cinemaSeedBands(plan.waypoints, plan.pathLen);
      var clone = function(bs) {
        return bs.map(function(b) { return { c: { x: b.c.x, y: b.c.y, z: b.c.z }, d: { x: b.d.x, y: b.d.y, z: b.d.z }, len: b.len }; });
      };
      _state = {
        bands: clone(seeded), origBands: clone(seeded), staged: false, undo: [], redo: [],
        held: null, drag: null, objs: [], handles: [], pulseId: 0, flyId: 0,
        baseSec: { dive: plan.sec.dive, spin: plan.sec.spin, out: plan.sec.out, rise: plan.sec.rise },
        baseOutSec: plan.sec.out, baseTotal: ctx.durationSec, baseLen: plan.pathLen,
        speed: plan.pathLen / Math.max(0.001, plan.sec.out),   // the building's OWN pace, not a constant
        userTotal: null, fps: ctx.fps || 15, filmPts: null, plan: plan,
        camSave: { px: a.camera.position.x, py: a.camera.position.y, pz: a.camera.position.z,
                   tx: a.controls.target.x, ty: a.controls.target.y, tz: a.controls.target.z },
        controlsWere: a.controls ? a.controls.enabled : true
      };
      console.log('§CPE_OPEN bands=' + _state.bands.length + ' waypoints=' + (_state.bands.length * 2) +
        ' bandLen=' + _state.bands[0].len.toFixed(2) + 'm pathLen=' + plan.pathLen.toFixed(1) +
        'm speed=' + _state.speed.toFixed(2) + 'm/s total=' + ctx.durationSec.toFixed(1) + 's');

      var panel = _buildPanel();
      // §CPE_PREVIEW_DIVERGENCE: state the basis every re-plan below is pinned to, once. If a pasted
      // console ever shows the bake's §CINEMA_PIVOT disagreeing with the editor's, this line says
      // which camera the editor was planning from.
      console.log('§CPE_CAM_BASIS cam=(' + _state.camSave.px.toFixed(1) + ',' + _state.camSave.py.toFixed(1) +
        ',' + _state.camSave.pz.toFixed(1) + ') target=(' + _state.camSave.tx.toFixed(1) + ',' +
        _state.camSave.ty.toFixed(1) + ',' + _state.camSave.tz.toFixed(1) + ')' +
        ' — every re-plan uses THIS pose, not the live camera, so orbiting to look cannot change the film');
      _replanFilm();
      _redrawScene(); _renderRows(); _renderClock(); _renderHint(); _syncButtons();
      _wire();

      function finish(action) {
        var ov = (action === 'ok' || action === 'save') ? _buildOverride() : null;
        var edited = ov ? _isEdited() : false;
        _stopPulse(); _release('close'); _unwire(); _clearScene();
        if (_state._replanTimer) { clearTimeout(_state._replanTimer); _state._replanTimer = null; }
        if (panel.parentNode) panel.parentNode.removeChild(panel);
        var total = ov ? ov._total : _state.baseTotal;
        if (a.controls) a.controls.enabled = _state.controlsWere;
        a.camera.position.set(_state.camSave.px, _state.camSave.py, _state.camSave.pz);
        a.controls.target.set(_state.camSave.tx, _state.camSave.ty, _state.camSave.tz);
        a.controls.update();
        if (a.markDirty) a.markDirty();
        console.log('§CPE_CLOSE action=' + action + ' edited=' + edited + ' total=' + total.toFixed(1) + 's');
        _state = null;
        // Guardrail 2: an untouched OK hands back NO override, so the bake re-uses the derived plan
        // object verbatim. "One click costs nothing" is enforced here, not merely intended.
        resolve({ action: action === 'cancel' ? 'cancel' : 'ok', override: edited ? ov : null,
                  saved: action === 'save', durationSec: edited ? total : ctx.durationSec });
      }

      document.getElementById('cpe-ok').addEventListener('click', function() { finish('ok'); });
      document.getElementById('cpe-cancel').addEventListener('click', function() { finish('cancel'); });
      document.getElementById('cpe-save').addEventListener('click', function() {
        if (typeof a.stageCinemaPath === 'function') a.stageCinemaPath(_buildOverride());
        _state.staged = true;
        _syncButtons();   // staging is not closing — keep editing
      });
    });
  }

  var _attach = setInterval(function() {
    if (window.APP) { window.APP.cinemaPathEditor = { open: open, version: CPE_V }; clearInterval(_attach); }
  }, 500);
})();
