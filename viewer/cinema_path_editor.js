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
  // §CPE_CLICK_SLOP — how far the pointer may travel and still count as a CLICK on the pipe (a stick),
  // rather than a drag (a hose bend). 4px is standard click slop; at Hospital's 0.192 m/px that is
  // 0.77m, comfortably below any intentional bend and comfortably above hand tremor.
  var CLICK_SLOP_PX = 4;
  // §CPE_REOPEN_NODE — the colour a user-dropped node is drawn in when it is NOT selected. Dark
  // enough to separate from the seeder's light blue (0x4fc3f7) and the white bar/mid at a glance,
  // and already this file's contrast colour on a light scene (see _contrastColour below).
  var CPE_STICK_BLUE = 0x1565c0;
  // §CPE_STICK_RED_BAR (user, 2026-07-31, after flying the all-blue v17: "the stick is not well
  // colored ie if red with blue dots in it will help"). All-dark-blue read as one dim smudge against
  // the white bars; a RED bar carrying BLUE dots separates the two things a stick is — the segment
  // you drag and the handles you grab — and reads at a glance on a 63K-element scene.
  var CPE_STICK_RED = 0xe53935;
  var CPE_STICK_TEXT = '#64b5f6';   // the same hue, readable as text on the dark panel
  // §CPE_STICK_HOLD — CORRECTED 2026-08-02 (user): "of course not as default is zero." The earlier
  // reading of "putting hold at 1 sec (put that as default)" over-generalised a one-path instruction
  // into a seeded default, and the user then observed an unexplained 1s pause at a settle stick they
  // never set. An unset hold means 0 — a hold exists ONLY when the user types one.
  var CPE_HOLD_DEFAULT_SEC = 0;
  // §CPE_SCRUB — the scrub bar's own height, and its click-vs-drag slop (reuses CLICK_SLOP_PX's
  // 4px reasoning above, not a second number). Not measured against any building — it is a fixed
  // UI-chrome dimension, same status as HANDLE_R/GRAB_PX below. Flagged in the spec report as an
  // unconfirmed default, not a settled constant.
  var SCRUB_H = 26;                // px — the track's own height
  var SCRUB_TICK_W = 3;            // px — a stick's tick-mark width on the bar
  // §CPE_VIEWFINDER — B panel defaults. None of these are in the spec (Part B leaves size/position
  // open); picked to be small enough not to swallow the main viewport and clear of the cpe-panel's
  // own default top-right anchor. Unconfirmed defaults — see the spec DONE block.
  var VF_DEFAULT_W = 300, VF_DEFAULT_H = 190;   // px
  var VF_MIN_W = 160, VF_MIN_H = 100;           // px — floor a resize cannot cross
  var VF_MARGIN = 16;                            // px from the viewport edge for the first-open position
  var VF_RESIZE_HANDLE_PX = 16;                  // px — the corner grab square's hit size
  // §CPE_SCRUB_STANDALONE (2026-08-04) — the scrub bar's own panel, no longer nested under B. Default
  // width matches B's so the two stack cleanly; default position is directly below B's own default
  // rect (user: "outside on its own or below the POV") — independent of whether B is actually open.
  var SCRUB_PANEL_W = VF_DEFAULT_W;              // px
  var SCRUB_PANEL_GAP = 8;                       // px between B's default rect and the scrub panel
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // CPE_V — the pasted-console-answers-"which build is this?" string (comment at file top explains
  // why this exists and must be bumped on every behaviour change). Reorganized 2026-08-04 into one
  // clause per line, NEWEST FIRST, purely for human readability — every §TAG below is preserved
  // verbatim from the pre-reorg blob, nothing dropped. A NEW SESSION: read the newest few lines
  // here for a fast fix on current behaviour, then `prompts/CINEMA_PATH_EDITOR.md`'s own DONE
  // blocks (search `§CPE_SCRUB`, `§CPE_VIEWFINDER`, `§CPE_AIM_PIN`) for the full history/reasoning —
  // this string is a manifest, not a substitute for the spec doc.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  var CPE_V = 'v24 (' +
    // ── 2026-08-05, same day, one connected batch — read together, supersedes the v23 entries below ──
    '§CPE_SCRUB_STANDALONE the timeline is now its own draggable panel (#cpe-scrub-panel), default ' +
      'position directly below B\'s default rect — resolves the v23 §CPE_SCRUB_BAR_GATED OPEN ' +
      'QUESTION ("standalone widget vs docked under B"); built/torn down with the editor itself, ' +
      'no longer coupled to B\'s toggle; B stays display-only (user: "pov box is purely display for ' +
      'user bearing" — no drop/raycast interaction on it, this panel is the interactive one); ' +
    '§CPE_SCRUB_VF_LIVE a scrub drag drives B\'s inset camera (vfCam) again — this is the mid-fix cut ' +
      'that was written+witnessed then reverted before the v23 #1177 landing; restored now that B is ' +
      'a stable, separate concern from the main-canvas invariant #1177 actually protects (main camera/ ' +
      'controls are still NEVER touched by any scrub, drag or click); ' +
    '§CPE_SCRUB_READONLY the bar no longer spawns or selects sticks on click (retires the old click- ' +
      'to-spawn path) — sticks show as read-only BLUE tick lines only; editing (add/select/move/ ' +
      'remove) happens the original way, via the canvas pipe or the row list, never the scrub bar; ' +
    '§CPE_STICK_TIME_SYNC_F1 the readout is mm:ss / total film length, not a bare percentage; ' +
    '§CPE_SCRUB_PLAY a play/pause transport button in the scrub panel, reusing _previewFly()\'s own ' +
      'pose source with new pause/resume support (_state._flyPauseAt/_flyResume) — additive only, ' +
      'the existing #cpe-preview button in #cpe-panel is untouched; ' +
    '§CPE_VF_EYE_SPRITES (PR bim-ootb#1179, undocumented here until now) the #cpe-vf-toggle icon uses ' +
      'real open/shut eyelid PNG sprites (viewer/icons/eye_open.png, eye_closed.png) — NOT the Lucide ' +
      'slashed-eye pair, which read as "eye with a line through it" rather than an actual shut eyelid; ' +
      'ICONS.eyeOpen/eyeOff were removed from panels.js as dead code once this landed; ' +
    // ── 2026-08-04, v23 — HISTORICAL, superseded by the entries above; kept for the reader tracing ' +
    //    how this evolved, not current behaviour ──
    '§CPE_SCRUB_MAIN_CAM_REGRESSION (v23) scrubbing the timeline used to move the MAIN canvas ' +
      'camera (a.camera/a.controls) — wrong, caught live by the user. Scrubbing was made VISUAL-ONLY, ' +
      'touching no camera at all — since refined by §CPE_SCRUB_VF_LIVE above: B\'s inset camera is ' +
      'driven again, the main canvas invariant this entry actually protects still holds; ' +
    '§CPE_SCRUB_BAR_GATED (v23) the scrub bar\'s existence was gated to B — superseded by ' +
      '§CPE_SCRUB_STANDALONE above; ' +
    '§CPE_VIEWFINDER_EYE_ICON (v23) the #cpe-vf-toggle icon swapped open/slashed with vfOn, reading ' +
      'panels.js ICONS.eyeOpen/eyeOff — superseded by §CPE_VF_EYE_SPRITES above; ' +
    // ── 2026-08-04, Part C ──
    '§CPE_AIM_PIN click an object/room in the canvas with a band selected to pin its look direction ' +
      'there (rotation only, never position); the pin wins outright inside its own band\'s Voronoi ' +
      'zone of the walk (by band-centre arc-fraction), LOS/§CPE_AIM_DENSITY resume immediately in ' +
      'neighbouring bands with no bleed; ' +
    // ── 2026-08-04, Parts A/B (original ship — the scrub-driving claim below is HISTORICAL, see ' +
    //    the FIXED entry at the top of this string for what changed) ──
    '§CPE_SCRUB timeline scrub bar with stick tick-marks (original ship note — since corrected: see ' +
      '§CPE_SCRUB_MAIN_CAM_REGRESSION above, scrub no longer drives any camera-move code); ' +
    '§CPE_VIEWFINDER a synced second-camera POV sub-panel, one renderer via setScissorTest, ' +
      'eye-icon toggle OFF by default, scoped to rehearsal only, never wired into the MaxQ bake loop; ' +
    // ── 2026-07-31 and earlier — unchanged, kept verbatim ──
    '§CPE_HOSE_LENGTH_BLIND the clock costs the HOSED curve — a hose pull used to buy speed instead ' +
      'of time (user record: 107.55m costed, 173.53m flown); ' +
    '§CPE_STICK_RED_BAR an unselected stick is a RED bar with BLUE dots, not an all-blue smudge; ' +
    '§CPE_REOPEN_NODE an edited OK STAGES the path so the next Alt+C re-opens it authored — the ' +
      'added node survives; provenance travels in the override instead of being guessed from the ' +
      'index; an unselected stick draws dark blue in the pipe and blue-tinted in the list; ' +
    '§CPE_CLICK_SLOP a 4px click on the pipe spawns a stick again, no threshold existed; ' +
    '§CPE_BUILDUP_FOLLOW_TM the reveal follows the Time Machine as-is, no camera-path re-key; ' +
    '§CPE_PREVIEW_AFTER_RETIRED OK records without a rehearsal; ' +
    '§CPE_REOPEN_DOUBLE re-open ADOPTS the authored bands instead of re-seeding them, N no longer ' +
      'doubles; ' +
    '§CPE_STICK_ANCHOR author raw + draw through the hose so a bar stays on the line; ' +
    '§CPE_HOSE_REANCHOR pulls re-project by world anchor; ' +
    '§CPE_IDB_PATH_STORE named plans save/open/delete; ' +
    '§CPE_STICK click the pipe to spawn a band, N bands not 3, removable; walk drawn fat = the ' +
      'authorable stretch; ' +
    '§CPE_PREVIEW drives the buildup; ' +
    '§CPE_HOSE whole-path arc-length falloff drag; ' +
    '§CPE_CLIP in/out markers; ' +
    '§CPE_BUILDUP checkbox; ' +
    '§CPE_PREVIEW_BUTTON with stale marker; ' +
    '§CPE_AIM_DENSITY in effects.js; ' +
    '§CPE_DRAG_LAND_FIRST no re-plan during a drag; ' +
    '§CPE_DRAG_SCALE building-derived m/px, camera distance no longer gears the drag; ' +
    '§CPE_UNDO Ctrl+Z/Ctrl+Shift+Z + history-line event; ' +
    '§CPE_DRAG_TELEPORT delta (reach cap removed, G-DRAG-3); ' +
    '§CPE_WALK 2.3m/s; ' +
    '§CPE_PREVIEW_DIVERGENCE plan pinned to open pose; ' +
    '§CPE_BANDS + §CPE_SCREEN_PLANE + §CPE_PANEL_DRAG)';
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
  // §CPE_VIEWFINDER: where the user last dragged/resized B, remembered for the session only — same
  // scope note as `_panelPos` above (module scope, not `_state`; a fresh Alt+C still opens B at the
  // default rect if the browser tab reloads).
  var _vfRect = null;
  // §CPE_VIEWFINDER G-PERF-1 accumulator — module scope so it survives across the several
  // `_vfRender()` calls a single rehearsal makes; reset by `_vfPerfReset()` at the top of each
  // `_previewFly()` run.
  var _vfPerf = { n: 0, sum: 0, max: 0 };
  // §CPE_SCRUB_STANDALONE (2026-08-04) — where the user last dragged the standalone scrub panel,
  // same session-only scope as `_panelPos`/`_vfRect` above.
  var _scrubRect = null;
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
    _state.bars = [];
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
  // §CPE_HOSE: keep the canonical/deformed walk polylines in step. Cheap (no plan, no BVH) so it can
  // run on every pointermove — that is what makes the pipe track the cursor while §CPE_DRAG_LAND_FIRST
  // keeps the expensive re-plan on release.
  // ══ §CPE_STICK — spawn a rigid band at an arbitrary point on the walk ═══════════════════════
  // Seeded exactly the way _cinemaSeedBands seeds the original three: centre ON the curve, direction
  // = the LOCAL TANGENT there, length = the length the other bands already carry. So the moment it
  // appears it is a no-op — the path does not move until the user moves the stick, which is the same
  // "first render is a no-op-looking curve rather than a scrambled one" property the seeder has.
  //
  // Insertion is ORDERED BY ARC POSITION, not appended: `_ops`-style order is what the flow expects
  // (band i connects to band i+1), so a stick dropped between settle and stop must land between them
  // in the array too, or the walk would fold back on itself.
  function _bandArcS(bi) {
    var pts = _state.flowRaw, frac = _state.flowFrac;   // authored space — the band's own space
    if (!pts || !pts.length) return null;
    var c = _state.bands[bi].c, best = 0, bd = Infinity;
    for (var i = 0; i < pts.length; i++) {
      var d = (pts[i].x - c.x) * (pts[i].x - c.x) + (pts[i].y - c.y) * (pts[i].y - c.y) + (pts[i].z - c.z) * (pts[i].z - c.z);
      if (d < bd) { bd = d; best = i; }
    }
    return frac[best];
  }
  // ══ §CPE_STICK_ANCHOR — author in RAW space, DRAW in hosed space ════════════════════════════
  // User, 2026-07-28: *"that new bar suddenly got disengaged from hose line"*. It is not a seeding
  // bug — it is two authorities over the same stretch of curve, and the witness is what proved that
  // seeding alone cannot resolve it (my first fix measured WORSE than the thing it replaced). The
  // final curve is bandFlow THEN hose, so for a band inside a pull's influence:
  //   • author it at the clicked point   → the hose then displaces the curve past it → bar off the line
  //   • author it at clicked − displacement → the curve lands on the click, but the bar, drawn at the
  //     authored centre, sits a displacement away from the curve → bar off the line again
  // Neither placement satisfies both: the band says "the curve passes HERE", the hose says "and then
  // move it by d". The resolution is to stop pretending the bar lives in authored space. The CURVE is
  // drawn through the hose; the bar must be too. Author raw (what the plan consumes), draw displaced
  // (what the eye checks). Then a bar dropped on the pipe stays on the pipe, wherever the pull takes it.
  function _hoseDispAt(p) {
    var raw = _state.flowRaw, hos = _state.flowHosed;
    if (!raw || !hos || raw.length !== hos.length || !_state.hose.length) return null;
    var best = 0, bd = Infinity;
    for (var i = 0; i < raw.length; i++) {
      var d = (raw[i].x - p.x) * (raw[i].x - p.x) + (raw[i].y - p.y) * (raw[i].y - p.y) +
              (raw[i].z - p.z) * (raw[i].z - p.z);
      if (d < bd) { bd = d; best = i; }
    }
    var dx = hos[best].x - raw[best].x, dy = hos[best].y - raw[best].y, dz = hos[best].z - raw[best].z;
    return (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-9) ? null : { x: dx, y: dy, z: dz };
  }
  function _drawn(p) {
    var d = _hoseDispAt(p);
    return d ? { x: p.x + d.x, y: p.y + d.y, z: p.z + d.z } : p;
  }
  function _spawnStick(hit) {
    // Seeded from the RAW curve: `flowRaw[i]` is `flowHosed[i]` minus the displacement at i,
    // index-for-index (the hose displaces points, never adds or drops one), so the band lands where
    // the curve WILL be once the hose is re-applied on top of it.
    var a = A(), pts = _state.flowRaw;
    if (!pts || pts.length < 2 || typeof a.cinemaSeedStick !== 'function') return false;
    var len = _state.bands.length ? _state.bands[0].len : 2;
    var nb = a.cinemaSeedStick(pts, hit.i, len);      // the SHIPPED seeder — see effects.js
    if (!nb) return false;
    nb._s = hit.s; nb._stick = true;
    // Where does it belong in the chain? After the last band whose own arc position precedes it.
    var at = _state.bands.length - 1;   // never before `settle`, never after `stop`
    for (var k = 1; k < _state.bands.length; k++) {
      var s = _bandArcS(k);
      if (s != null && s > hit.s) { at = k; break; }
    }
    at = Math.max(1, Math.min(_state.bands.length - 1, at));
    _undoPush('add stick at ' + Math.round(hit.s * 100) + '%');
    _state.bands.splice(at, 0, nb);
    _state.staged = false;
    console.log('§CPE_STICK added s=' + hit.s.toFixed(3) + ' at index=' + at + '/' + _state.bands.length +
      ' centre=(' + nb.c.x.toFixed(2) + ',' + nb.c.y.toFixed(2) + ',' + nb.c.z.toFixed(2) + ')' +
      ' dir=(' + nb.d.x.toFixed(2) + ',' + nb.d.y.toFixed(2) + ',' + nb.d.z.toFixed(2) + ') len=' + len.toFixed(2) +
      ' — seeded ON the curve with the LOCAL TANGENT, so the path does not move until you move it');
    _markPreviewStale();
    _refreshFlow(); _replanFilm();
    _redrawScene(); _renderRows(); _renderClock(); _renderWhole(); _syncButtons();
    return true;
  }
  function _removeStick(bi) {
    if (bi <= 0 || bi >= _state.bands.length - 1) return false;   // settle and stop are not removable
    _undoPush('remove ' + _labelOf(bi));
    _state.bands.splice(bi, 1);
    _state.held = null; _state.staged = false;
    console.log('§CPE_STICK removed index=' + bi + ' remaining=' + _state.bands.length);
    _markPreviewStale();
    _refreshFlow(); _replanFilm();
    _redrawScene(); _renderRows(); _renderClock(); _renderWhole(); _syncButtons();
    return true;
  }
  // §CPE_GHOST_PULL — a hose pull is removable exactly as a stick is. Before this existed a pull
  // could only be undone (Ctrl+Z, and only while it was still the newest edit); once buried under a
  // later edit it was permanent AND invisible. That is the whole "ghost" the user reported.
  function _removeHosePull(hi) {
    if (!_state || !_state.hose || hi < 0 || hi >= _state.hose.length) return false;
    _undoPush('remove pull at ' + Math.round((_state.hose[hi].s || 0) * 100) + '%');
    _state.hose.splice(hi, 1);
    _state.staged = false;
    console.log('§CPE_GHOST_PULL removed index=' + hi + ' remaining=' + _state.hose.length);
    _markPreviewStale();
    _refreshFlow(); _replanFilm();
    _redrawScene(); _renderRows(); _renderClock(); _renderWhole(); _syncButtons();
    return true;
  }
  function _refreshFlow() {
    if (!_state) return;
    _state.flowRaw = _flowRaw();
    _state.flowFrac = _arcFractions(_state.flowRaw);
    _reanchorHose();
    _state.flowHosed = _flowHosed(_state.flowRaw);
  }
  // ⚠ THE DEFECT BEHIND THE DEFECT — pulls drift when the BANDS change.
  // An op's `s` is a fraction of the walk's arc length, and adding or moving a band changes both the
  // length and the shape of that walk. The user's own log shows it: the same two ops reporting
  // `deformed=57` → `65` → `72` across successive band edits — the bulge sliding along the path
  // while nobody touched it. So each op also carries the WORLD point it was authored at, and every
  // rebuild re-projects it. Shipped maths lives in effects.js (A.cinemaHoseReanchor) so the witness
  // exercises the same function the app does.
  function _reanchorHose() {
    var a = A(), pts = _state.flowRaw, frac = _state.flowFrac;
    if (!pts || pts.length < 2 || !_state.hose.length || typeof a.cinemaHoseReanchor !== 'function') return;
    var skip = _state.drag && _state.drag.op;   // the pull under the hand must not move under it
    var n = a.cinemaHoseReanchor(_state.hose, pts, frac, skip);
    if (n) console.log('§CPE_HOSE_REANCHOR ops=' + n + '/' + _state.hose.length +
      ' — the walk changed shape, so each pull was re-projected onto it by WORLD anchor; a bend stays where it was put');
  }
  // §CPE_PREVIEW_BUTTON: any edit invalidates "you have seen this version". Tracked as a counter
  // rather than a boolean so the button can say WHICH edit you last previewed.
  function _markPreviewStale() {
    if (!_state) return;
    _state.edits++;
  }
  function _replanFilm() {
    var a = A(), t0 = performance.now();
    if (!_state.flowRaw) _refreshFlow();
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
      // §CPE_STICK — SHOW WHICH STRETCH IS AUTHORABLE. The user reported "I cannot do the intended
      // any part of hose"; their own log said why: the pipe draws the WHOLE film (dive → settle →
      // walk → pull-back → orbit) while only the WALK carries bands, so on JKR they were dragging on
      // a curve that was ~15% grabbable (walk 18.4 m against a 67.6 m dive) with no way to tell
      // which 15%. An affordance you cannot see is not an affordance. The walk is drawn as a second,
      // fatter tube over the top; the rest stays the thin pipe it always was.
      // Dive and orbit remain underivable-from-bands (§CPE_BANDS "still open" — bands 4 and 5), so
      // this makes an existing limit VISIBLE rather than pretending it is gone.
      var bts = _state.plan && _state.plan.beats;
      if (bts && isFinite(bts.spin) && isFinite(bts.out) && bts.out > bts.spin) {
        var last = _state.filmPts.length - 1;
        var wa = Math.max(0, Math.round(bts.spin * last)), wb = Math.min(last, Math.round(bts.out * last));
        if (wb - wa > 1) {
          var wtube = _mkTube(_state.filmPts.slice(wa, wb + 1), col, rad * 1.9);
          if (wtube) { wtube.material.opacity = 0.55; wtube.material.transparent = true; _state.objs.push(wtube); }
        }
      }
    }

    // §CPE_HOSE: mark where the path has been pulled, so an edit is findable again on a curve that
    // is otherwise uniform — and so "how many pulls am I looking at" is answerable without the panel.
    if (_state.hose.length && _state.flowHosed && _state.flowHosed.length) {
      for (var hi = 0; hi < _state.hose.length; hi++) {
        var op = _state.hose[hi];
        var idx = Math.max(0, Math.min(_state.flowHosed.length - 1, Math.round(op.s * (_state.flowHosed.length - 1))));
        _state.objs.push(_mkSphere(_state.flowHosed[idx], 0x9ccc65, 0.7, 0.85));
      }
    }
    // §CPE_CLIP: in/out markers sit on the FILM curve (they cut the film, not the walk), drawn as a
    // pair so the clip window reads as a window rather than as two unrelated dots.
    if (_state.filmPts && _state.filmPts.length > 1 && (_state.clipIn > 0 || _state.clipOut < 1)) {
      var lastF = _state.filmPts.length - 1;
      var iIn = Math.round(_state.clipIn * lastF), iOut = Math.round(_state.clipOut * lastF);
      _state.objs.push(_mkSphere(_state.filmPts[iIn], 0x66bb6a, 1.1, 1.0));
      _state.objs.push(_mkSphere(_state.filmPts[iOut], 0xef5350, 1.1, 1.0));
      var seg = _state.filmPts.slice(Math.min(iIn, iOut), Math.max(iIn, iOut) + 1);
      if (seg.length > 1) _state.objs.push(_mkLine(seg, 0xffee58, 1.0));
    }

    // Bands drawn ON TOP of the pipe, in the contrast colour's opposite, so the three editable
    // stretches are findable along a curve that is otherwise uniform.
    for (var i = 0; i < _state.bands.length; i++) {
      var b = _state.bands[i], e0 = _ends(b);
      // §CPE_STICK_ANCHOR: drawn THROUGH the hose, exactly as the curve is — see _hoseDispAt.
      // Hit-testing reads these same drawn positions, so what you grab is what you see.
      var e = [_drawn(e0[0]), _drawn(e0[1])];
      var heldBand = _state.held && _state.held.b === i;
      // §CPE_REOPEN_NODE (user: "the new nodes has to be darker blue when not selected to stand
      // out"): a band the USER dropped used to be drawn pixel-identically to one the seeder
      // produced — same white bar, same white mid, same light-blue ends — so the only way to find
      // your own node again was to remember where you put it. §CPE_STICK_RED_BAR: an unheld stick
      // draws a RED bar with BLUE dots — the bar you drag and the handles you grab stay
      // distinguishable, which all-blue lost. Radii are untouched, so mid-vs-end still reads by size,
      // and held-orange still wins over everything (selection must stay the loudest state).
      var isStick = !!b._stick;
      var bar = _mkLine([e[0], e[1]], heldBand ? 0xff8c00 : isStick ? CPE_STICK_RED : 0xffffff, 1.0);
      _state.objs.push(bar);
      _state.bars.push({ b: i, stick: isStick, mesh: bar });
      var zones = [{ p: e[0], z: 'a' }, { p: _drawn(b.c), z: 'mid' }, { p: e[1], z: 'b' }];
      for (var k = 0; k < zones.length; k++) {
        var isHeld = heldBand && _state.held.z === zones[k].z;
        var isMid = zones[k].z === 'mid';
        var col = isHeld ? 0xff8c00 : isStick ? CPE_STICK_BLUE : isMid ? 0xffffff : 0x4fc3f7;
        var o = _mkSphere(zones[k].p, col, isHeld ? 1.2 : isMid ? 0.9 : 0.75, isHeld ? 1.0 : 0.8);
        _state.objs.push(o);
        _state.handles.push({ b: i, z: zones[k].z, p: zones[k].p, mesh: o, stick: isStick, col: col });
      }
    }
    if (a.markDirty) a.markDirty();
    // §CPE_SCRUB: every path change that redraws the 3D pipe redraws the timeline bar too — one
    // call site covers every mutation path (drag, stick add/remove, undo/redo, clip mark, load).
    _renderScrub();
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
  // §CPE_HOSE_LENGTH_BLIND (2026-07-31) — this used to measure `cinemaBandFlow(bands)`, the RAW band
  // flow with the hose NEVER applied, while the bake measures the DEFORMED curve
  // (effects.js:4936 `_cinemaHoseApply(_cinemaBandFlow(_cpeBands), _cpeHose)` -> :5004 `totalLen`).
  // Measured on the user's own saved record: 107.5 m here vs 173.5 m there, +61%, same bands and
  // same 7 ops. The number was the small half of it — `_naturalDuration()` divides this length by
  // the walk speed and `_buildOverride` stores it as `_total`, which the bake honours as an
  // OVERRIDE, so their film ran `natural=145.0s ... override=true running=92.4s`: 1.57x faster than
  // the 2.3 m/s walk pace it claims to be flying. Every hose pull silently bought SPEED instead of
  // time. The editor already draws and hit-tests against the deformed curve (§CPE_STICK_ANCHOR,
  // "what you grab is what you see") — the length maths simply never got the same treatment.
  function _flownLength() {
    var a = A();
    var pts = (_state.flowHosed && _state.flowHosed.length > 1) ? _state.flowHosed
              : (a.cinemaBandFlow ? _flowHosed(a.cinemaBandFlow(_state.bands)) : []);
    var L = 0;
    for (var i = 1; i < pts.length; i++)
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    return L || 1;
  }
  function _naturalDuration() {
    var s = _state, len = _flownLength(), outSec = len / s.speed;
    // §CPE_STICK_HOLD — the panel's clock must cost the holds too, or "total" here disagrees with the
    // film effects.js actually plans (_natSec.out carries + _holdTotal). §CPE_HOSE_LENGTH_BLIND was
    // exactly this defect in the other direction — the editor costing a curve that is never flown —
    // so the two numbers are kept in step at the moment the field is introduced, not after a report.
    // Added AFTER the pace division for the same reason effects.js adds it outside the noise
    // multiplier: a hold is authored seconds, not distance to be priced.
    var holdSec = 0;
    for (var i = 0; i < s.bands.length; i++) holdSec += +(s.bands[i].hold || 0);
    return { len: len, outSec: outSec + holdSec, holdSec: holdSec,
             total: s.baseTotal - s.baseOutSec + outSec + holdSec };
  }
  function _buildOverride() {
    var s = _state, nat = _naturalDuration();
    var total = s.userTotal != null ? s.userTotal : nat.total;
    var scale = total / Math.max(0.001, nat.total);
    return {
      // §CPE_REOPEN_NODE: `_stick`/`_s` travel WITH the band. They used to be dropped here, so both
      // readers (_pathsApply, open()'s clone) had to GUESS provenance from position — "every middle
      // band is a stick" — which was survivable while the only per-stick affordance was the × button
      // and is not survivable now that colour depends on it (a dark-blue seeded band is a lie).
      bands: s.bands.map(function(b) {
        // §CPE_AIM_PIN: `lookAt` rides the same seam `_stick`/`_s`/`hold` already do — no second
        // table (guardrail 4), and the plan/Save/bake all read this one override.
        return { c: { x: b.c.x, y: b.c.y, z: b.c.z }, d: { x: b.d.x, y: b.d.y, z: b.d.z }, len: b.len,
                 hold: +(b.hold || 0), _stick: !!b._stick, _s: b._s,
                 lookAt: b.lookAt ? { x: b.lookAt.x, y: b.lookAt.y, z: b.lookAt.z } : null };
      }),
      // §CPE_HOSE: the ops ride the same override the plan, Save and the bake already consume — a
      // deep copy, same treatment as the bands, so nothing downstream can write back into the holder
      // (§CPE_HOLDER_INTEGRITY).
      hose: s.hose.map(function(o) {
        return { s: o.s, r: o.r, d: { x: o.d.x, y: o.d.y, z: o.d.z },
                 a: o.a ? { x: o.a.x, y: o.a.y, z: o.a.z } : null };
      }),
      // §CPE_CLIP: null means the whole film; the bake remaps poseAt into [in,out] when set.
      clip: (s.clipIn > 0 || s.clipOut < 1) ? { in: s.clipIn, out: s.clipOut } : null,
      buildup: !!s.buildup,
      roomTitle: !!s.roomTitle,
      dayCounter: s.dayCounter || 'tr',
      diveSec: s.baseSec.dive * scale, spinSec: s.baseSec.spin * scale,
      // §CPE_STICK_HOLD: the TRAVEL part of the walk scales with the user's total, the authored hold
      // does NOT — a typed "1 s" must stay 1 s whatever the film is re-timed to, or the panel field
      // lies about itself. This also keeps effects.js's `_holdTravelSec = _useSec.out - _holdTotal`
      // exactly true, which is what lets the hold's cost identity (∫dip == authored seconds) hold.
      outSec: (nat.outSec - nat.holdSec) * scale + nat.holdSec, riseSec: s.baseSec.rise * scale,
      _total: total, _naturalTotal: nat.total, _scale: scale, _pathLen: nat.len
    };
  }
  // ══ §CPE_HOSE — the walk polyline, undeformed and deformed.
  // The ops are parameterised on the UNDEFORMED polyline's arc length, so that is what `s` is
  // measured against; the deformed copy is what the user sees and grabs. Both arrays are
  // index-aligned by construction (_cinemaHoseApply displaces points, it never adds or drops one),
  // which is what lets a grab on the visible curve resolve to a stable `s` on the canonical one.
  function _flowRaw() {
    var a = A();
    return (a.cinemaBandFlow ? a.cinemaBandFlow(_state.bands) : []) || [];
  }
  function _flowHosed(raw) {
    var a = A();
    return (a.cinemaHoseApply ? a.cinemaHoseApply(raw, _state.hose) : raw) || raw;
  }
  function _arcFractions(pts) {
    var cum = [0], L = 0, i;
    for (i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
      cum.push(L);
    }
    if (L > 1e-6) for (i = 0; i < cum.length; i++) cum[i] /= L;
    return cum;
  }
  function _isEdited() {
    if (!_state || !_state.origBands) return false;
    // §CPE_HOSE / §CPE_CLIP / §CPE_BUILDUP are edits in their own right: a path that was ONLY hosed,
    // clipped or check-boxed must still hand back an override, or Guardrail 2's "untouched OK costs
    // nothing" would silently discard the whole edit.
    if (_state.hose.length) return true;
    if (_state.clipIn > 0 || _state.clipOut < 1) return true;
    if (_state.buildup) return true;
    if (_state.roomTitle) return true;
    if (_state.userTotal != null && Math.abs(_state.userTotal - _naturalDuration().total) > 0.05) return true;
    // §CPE_STICK: the band COUNT is now a thing that can change, and it must count as an edit before
    // the per-band comparison below (which indexes both arrays in lockstep and would otherwise miss
    // an added stick entirely, handing the bake an override-free "nothing changed").
    if (_state.bands.length !== _state.origBands.length) return true;
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
  // ══ §CPE_STICK — bands are no longer exactly three ═══════════════════════════════════════════
  // User, 2026-07-28, after flying the hose: *"I cannot do the intended any part of hose to get
  // arbitrary stick"*, against their original ask *"clicking any point will open an aribitary '3
  // point band'"*. The hose shipped the deformation half of that sentence and not the spawn half.
  //
  // §CPE_BANDS rule 1 ("three bands, no bands added or removed") is the ONE rule of that spec this
  // supersedes, and deliberately: everything else it settled — rigid length, end=rotate/mid=translate,
  // tangent authoring, store bands not points — is what makes a spawned stick worth having. The count
  // becomes N; nothing else about a band changes. `_cinemaBandWaypoints` and `_cinemaBandFlow` were
  // already written as loops over `bands.length`, so the plan side needs no change at all.
  //
  // First and last keep their meaning (the dive lands on the first, the orbit stretches off the last).
  // Everything between is an authored stick, labelled by where it sits along the walk.
  function _labelOf(i) {
    if (i === 0) return 'settle';
    if (i === _state.bands.length - 1) return 'stop';
    var b = _state.bands[i];
    // §CPE_REOPEN_NODE: only a band the USER dropped is called a stick. §CPE_STICK's blanket "every
    // middle is a stick" was true when the count was 3 and a stick was the only way to get a fourth,
    // but it renamed the DERIVED exit-door anchor too — so a list with one added node read
    // `settle | stick @ 15% | stick | stop` and the user's own node was one of two identical words.
    // Provenance is carried now (see _buildOverride), so the label can tell the truth.
    if (!b._stick) return ROW_LABEL[1];
    return 'stick' + (b._s != null ? ' @ ' + Math.round(b._s * 100) + '%' : '');
  }
  function _helpOf(i) {
    if (i === 0) return ROW_HELP[0];
    if (i === _state.bands.length - 1) return ROW_HELP[2];
    if (!_state.bands[i]._stick) return ROW_HELP[1];
    return 'a stick you added — drag its middle to move it, an end to twist the curve through it';
  }
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
        'font-size:13px;font-weight:600;color:#4fc3f7;cursor:move;user-select:none;display:flex;align-items:center;justify-content:space-between;gap:6px">' +
        '<span>Cinema path <span id="cpe-title-count" style="font-weight:400;color:#888;font-size:11px">— 3 bands · drag this bar to move</span></span>' +
        // §CPE_VIEWFINDER launcher (spec Part B point 7, user 2026-08-04 correction: eye icon, not
        // binoculars) — icon-only, OFF by default, so it does not clutter the header. Matches the
        // action-row button convention (~L664-667) at a smaller icon-only footprint.
        // OFF by default (spec) — the shut eye is the correct starting icon; _toggleViewfinder
        // swaps it in place, never rebuilding the button.
        '<button id="cpe-vf-toggle" title="turn on the POV viewfinder (B) — shows the exact camera pose the rehearsal is at" ' +
          'style="flex:none;padding:3px 8px;font-size:13px;line-height:1;background:#2a2e34;color:#888;' +
          'border:1px solid #4a4f57;border-radius:4px;cursor:pointer;display:flex;align-items:center">' + _eyeIconSvg(false) + '</button></div>' +
      '<div id="cpe-hint" style="padding:6px 12px;font-size:10px;color:#888;border-bottom:1px solid #2a2e34;line-height:1.5"></div>' +
      '<div id="cpe-rows" style="padding:4px 0"></div>' +
      // ══ §CPE_HOSE / §CPE_CLIP / §CPE_BUILDUP — the whole-path controls, one strip.
      // Reach is a PERSISTENT editor setting, not a per-drag one: spec open question 2, resolved by
      // the file's own "simplest fastest tour maker" scope guardrail — one control the user sets once
      // beats a modifier they have to remember on every gesture.
      '<div style="padding:8px 12px;border-top:1px solid #3a3f47;font-size:11px;line-height:1.9">' +
        '<div style="color:#4fc3f7;font-weight:600;margin-bottom:4px">Whole path</div>' +
        '<div>reach <input id="cpe-reach" type="number" min="1" max="100" step="1" style="width:52px">% ' +
          '<span style="color:#666">of the walk — how far a drag on the pipe carries</span></div>' +
        '<div id="cpe-hose-n" style="color:#666"></div>' +
        '<div style="margin-top:6px">clip <span id="cpe-clip-txt" style="font-family:monospace;color:#ddd"></span> ' +
          '<button id="cpe-mark-in" style="padding:1px 6px;font-size:10px;background:#2a2e34;color:#ddd;border:1px solid #4a4f57;border-radius:3px;cursor:pointer">mark in</button> ' +
          '<button id="cpe-mark-out" style="padding:1px 6px;font-size:10px;background:#2a2e34;color:#ddd;border:1px solid #4a4f57;border-radius:3px;cursor:pointer">mark out</button> ' +
          '<button id="cpe-clip-clear" style="padding:1px 6px;font-size:10px;background:#2a2e34;color:#888;border:1px solid #4a4f57;border-radius:3px;cursor:pointer">whole film</button></div>' +
        '<div style="margin-top:4px"><label style="cursor:pointer"><input id="cpe-buildup" type="checkbox" checked> ' +
          'build the model as the film plays</label> <span style="color:#666">(follows the Time Machine, not a programme)</span></div>' +
        '<div style="margin-top:4px"><label style="cursor:pointer"><input id="cpe-room-title" type="checkbox"> ' +
          'room titles</label> <span style="color:#666">(name card as the camera enters each room)</span></div>' +
        // §CPE_DAY_COUNTER_POS — user 2026-08-02: "the movie maker panel puts the Day # counter top
        // right display option". Top right is the DEFAULT so an existing plan re-bakes identically.
        // Only meaningful with the buildup on (there is no day to show without one), which the hint
        // says out loud rather than leaving the user to discover by baking.
        '<div style="margin-top:4px">Day # counter ' +
          '<select id="cpe-day-counter" style="background:#15181c;color:#ddd;border:1px solid #3a3f47;' +
            'border-radius:3px;font-size:10px;padding:1px 2px">' +
            '<option value="tr">top right</option>' +
            '<option value="tl">top left</option>' +
            '<option value="br">bottom right</option>' +
            '<option value="bl">bottom left</option>' +
            '<option value="off">off</option>' +
          '</select> <span style="color:#666">(needs the buildup — it counts the days it is showing)</span></div>' +
        // §CPE_IDB_PATH_STORE — saved plans for THIS building.
        '<div style="margin-top:6px">saved <select id="cpe-plans" style="max-width:150px;background:#15181c;color:#ddd;' +
          'border:1px solid #3a3f47;border-radius:3px;font-size:10px;padding:1px 2px"></select> ' +
          '<button id="cpe-plan-open" style="padding:1px 6px;font-size:10px;background:#2a2e34;color:#ddd;border:1px solid #4a4f57;border-radius:3px;cursor:pointer">open</button> ' +
          '<button id="cpe-plan-del" style="padding:1px 6px;font-size:10px;background:#2a2e34;color:#888;border:1px solid #4a4f57;border-radius:3px;cursor:pointer">delete</button></div>' +
        '<div id="cpe-plan-meta" style="color:#666;font-size:10px"></div>' +
      '</div>' +
      '<div style="padding:8px 12px;border-top:1px solid #3a3f47;font-size:11px" id="cpe-clock"></div>' +
      '<div id="cpe-state" style="padding:0 12px 6px;font-size:10px;color:#666"></div>' +
      '<div style="padding:10px 12px;border-top:1px solid #3a3f47;display:flex;gap:8px;justify-content:flex-end">' +
        // §CPE_SCRUB_PLAY (user, 2026-08-05, one-time named exception to the protect-#cpe-panel
        // rule): "the Preview button" is redundant now that the scrub panel's own play/pause
        // covers it via the POV box. Hidden, not deleted — witness_cpe_room_title_live.js and
        // witness_cpe_room_title_timing.js (pre-existing, not this lane's) still click it by id;
        // removing the element would regress them for a purely visual redundancy fix.
        '<button id="cpe-preview" style="display:none" aria-hidden="true">Preview</button>' +
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
      // §CPE_STICK: `_s`/`_stick` are editor-side provenance (where it was dropped, and that it was
      // dropped rather than seeded) and must survive undo/redo, or a restored stick loses its label
      // and its removability. They are stripped in _buildOverride — the plan never sees them.
      return { c: { x: b.c.x, y: b.c.y, z: b.c.z }, d: { x: b.d.x, y: b.d.y, z: b.d.z }, len: b.len,
               hold: +(b.hold || 0), _s: b._s, _stick: b._stick,
               // §CPE_AIM_PIN: must survive undo/redo the same way, or Ctrl+Z after a pin click
               // silently un-pins whatever the pointer landed on next.
               lookAt: b.lookAt ? { x: b.lookAt.x, y: b.lookAt.y, z: b.lookAt.z } : null };
    });
  }
  // §CPE_HOSE/§CPE_CLIP: the snapshot has to carry EVERY authored quantity, not just the bands.
  // Undo that restored bands while leaving a hose pull in place would be an undo that visibly does
  // not undo — the exact failure the zero-pixel-press rule above was written to avoid.
  function _cloneHose(hs) {
    return (hs || []).map(function(o) {
      return { s: o.s, r: o.r, d: { x: o.d.x, y: o.d.y, z: o.d.z },
               a: o.a ? { x: o.a.x, y: o.a.y, z: o.a.z } : null };   // the world anchor rides along
    });
  }
  function _snapshot(label) {
    return { bands: _cloneBands(_state.bands), hose: _cloneHose(_state.hose),
             clipIn: _state.clipIn, clipOut: _state.clipOut, label: label };
  }
  // Call BEFORE mutating, with a label naming the edit. Redo is dropped on a new edit — the standard
  // linear-undo rule, and the same one UniversalHistory itself applies to a new op after a step-back.
  function _undoPush(label) {
    if (!_state) return;
    if (!_state.undo) { _state.undo = []; _state.redo = []; }
    _state.undo.push(_snapshot(label));
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
    toStack.push(_snapshot(snap.label));
    _state.bands = _cloneBands(snap.bands);
    _state.hose = _cloneHose(snap.hose);
    if (snap.clipIn != null) { _state.clipIn = snap.clipIn; _state.clipOut = snap.clipOut; }
    _state.staged = false;
    _state.held = null; _state.drag = null;
    console.log('§CPE_UNDO ' + dir + ' "' + snap.label + '" depth=' + fromStack.length +
      ' bands=' + _state.bands.length + ' hoseOps=' + _state.hose.length);
    _histEvent((dir === 'undo' ? 'Undo: ' : 'Redo: ') + snap.label);
    _markPreviewStale();
    _refreshFlow();
    _replanFilm(); _redrawScene(); _renderRows(); _renderClock(); _renderHint(); _renderWhole(); _syncButtons();
    return true;
  }
  function _undo() { return _undoApply(_state && _state.undo, _state && _state.redo, 'undo'); }
  function _redo() { return _undoApply(_state && _state.redo, _state && _state.undo, 'redo'); }

  function _renderRows() {
    var box = document.getElementById('cpe-rows');
    if (!box) return;
    // §CPE_TITLE_BAND_COUNT (2026-07-31): the title's "N bands" was hardcoded to "3" at panel-build
    // time and never touched again — so opening a stored path with more bands (§CPE_STICK, or a
    // loaded plan via §CPE_IDB_PATH_STORE) left the header claiming 3 regardless of the true count.
    // Live, reflects _state.bands.length every time the row list itself is rebuilt (adds, removes,
    // loads, re-opens — every path that changes the count already calls _renderRows()).
    var titleCount = document.getElementById('cpe-title-count');
    if (titleCount) {
      titleCount.textContent = '— ' + _state.bands.length + ' band' + (_state.bands.length === 1 ? '' : 's') +
        ' · drag this bar to move';
    }
    box.innerHTML = '';
    for (var i = 0; i < _state.bands.length; i++) {
      (function(i) {
        var b = _state.bands[i];
        var sel = _state.held && _state.held.b === i;
        var row = document.createElement('div');
        // §CPE_GHOST_PULL made #cpe-rows a MIXED list (band rows + pull rows), so every row now
        // declares its kind. witness_cpe_click_slop.js counts bands off this attribute — without it
        // a pull row would silently inflate the band count and turn a green gate red for no reason.
        row.setAttribute('data-cpe-row', 'band');
        // §CPE_REOPEN_NODE: the list carries the SAME cue as the pipe — a node you dropped is blue
        // in both places, so "which row is my node" and "which bar is my node" are one question.
        var stickRow = !!b._stick && i > 0 && i < _state.bands.length - 1;
        row.style.cssText = 'padding:5px 12px;font-size:11px;cursor:pointer;' +
          'border-left:3px solid ' + (sel ? '#ff8c00' : stickRow ? '#1565c0' : 'transparent') + ';' +
          (sel ? 'background:rgba(255,140,0,0.09);' : stickRow ? 'background:rgba(21,101,192,0.10);' : '');
        var head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:5px';
        var lbl = document.createElement('span');
        lbl.style.cssText = 'width:62px;color:' + (stickRow ? CPE_STICK_TEXT : '#888') + ';flex:none';
        lbl.textContent = _labelOf(i);
        lbl.title = _helpOf(i);
        head.appendChild(lbl);
        // §CPE_STICK: a spawned stick is removable; settle and stop are not (the dive lands on one
        // and the orbit stretches off the other — removing either would change what the beats mean).
        if (b._stick && i > 0 && i < _state.bands.length - 1) {
          var del = document.createElement('button');
          del.textContent = '×';
          del.title = 'remove this stick';
          del.style.cssText = 'flex:none;width:16px;height:16px;line-height:1;padding:0;font-size:12px;' +
            'background:#2a2e34;color:#888;border:1px solid #4a4f57;border-radius:3px;cursor:pointer';
          del.addEventListener('click', function(e) { e.stopPropagation(); _removeStick(i); });
          head.appendChild(del);
        }
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
        // §CPE_STICK_HOLD (2026-08-01, user): "putting hold at 1 sec (put that as default for the
        // last stick) will teach them 'ah, it slows a sec stop a sec, then ease out while the cam is
        // turning to the building'". Seconds the camera dwells at this band's midpoint. 0 = no hold.
        var hold = document.createElement('input');
        hold.type = 'number'; hold.step = '0.5'; hold.min = '0';
        hold.value = _num(b.hold || 0);
        hold.title = 'hold (seconds) — the camera eases to a stop at this band\'s midpoint and away ' +
                     'again, which is the time the gaze uses to turn onto the building. 0 = no hold.';
        hold.style.cssText = 'width:44px;color:#ce93d8';
        hold.addEventListener('change', function() {
          var v = parseFloat(hold.value);
          if (!isFinite(v) || v < 0) { hold.value = _num(b.hold || 0); return; }
          _undoPush('band ' + i + ' hold');
          b.hold = v;
          console.log('§CPE_HOLD band=' + i + ' hold=' + v.toFixed(2) + 's');
          _state.staged = false;
          _replanFilm(); _redrawScene(); _renderClock(); _syncButtons();
        });
        hold.addEventListener('click', function(ev) { ev.stopPropagation(); });
        head.appendChild(hold);
        // §CPE_AIM_PIN: a small removable badge — "an affordance you cannot see is not an
        // affordance" (§CPE_STICK's own doctrine). Click-to-pin has no other UI surface, so this is
        // the only place a pin is visible or removable outside re-clicking on top of it.
        if (b.lookAt) {
          var pin = document.createElement('button');
          pin.textContent = '📌×';
          pin.title = 'pinned — click to unpin (rotation reverts to LOS/§CPE_AIM_DENSITY here)';
          pin.style.cssText = 'flex:none;padding:0 4px;height:16px;line-height:16px;font-size:10px;' +
            'background:#2a2e34;color:#ffd54f;border:1px solid #4a4f57;border-radius:3px;cursor:pointer';
          pin.addEventListener('click', function(e) { e.stopPropagation(); _unpinBand(i); });
          head.appendChild(pin);
        }
        row.appendChild(head);
        var sub = document.createElement('div');
        sub.style.cssText = 'padding:2px 0 0 62px;font-size:9px;color:#666;font-family:monospace';
        var yaw = Math.atan2(b.d.z, b.d.x) * 180 / Math.PI;
        var pitch = Math.atan2(b.d.y, Math.hypot(b.d.x, b.d.z)) * 180 / Math.PI;
        sub.textContent = b.lookAt
          ? 'pinned → (' + _num(b.lookAt.x) + ',' + _num(b.lookAt.y) + ',' + _num(b.lookAt.z) + ')  ·  ' + _helpOf(i)
          : 'aim ' + Math.round(yaw) + '° / ' + Math.round(pitch) + '°  ·  ' + _helpOf(i);
        if (b.lookAt) sub.style.color = '#ffd54f';
        row.appendChild(sub);
        row.addEventListener('click', function() { _hold(i, 'mid', true); });
        box.appendChild(row);
      })(i);
    }
    _renderHoseRows(box);
  }

  // ══ §CPE_GHOST_PULL — every hose pull gets a ROW ══════════════════════════════════════════════
  // User, 2026-08-02: "when adding a stick should click on the part and wait till the stick row
  // appears before dragging. Click and drag right away does not get registered and it ends up as a
  // working but ghost stick".
  //
  // THE DIAGNOSIS, and it is not a race — _spawnStick is fully synchronous, so there is no window to
  // lose a click in. §CPE_STICK splits ONE grab by what the hand does: release without moving past
  // CLICK_SLOP_PX and you get a STICK; move first and you get a HOSE PULL (h.up: `if (!d.op)
  // _spawnStick`). Press-and-drag in one motion is therefore a PULL, by design — the existing
  // comment defends that split ("one gesture doing two things"), and it is a reasonable rule.
  //
  // The actual defect is downstream of it: _renderRows iterated `_state.bands` ONLY, and a pull
  // lives in `_state.hose`. So the pull bent the path for real, survived to the bake, and had NO
  // representation in the panel — it could not be seen, selected, or deleted. "Working but ghost"
  // is an exact description. This is the same family as §CPE_CLICK_SLOP (user, 2026-07-29: "when i
  // made a new node in the pipe, it does not show up in the alt-c panel list"), which fixed the
  // accidental case; this fixes the DELIBERATE one.
  //
  // Fix is additive and does not touch the gesture: nothing a user creates on the pipe is invisible.
  function _renderHoseRows(box) {
    if (!box || !_state || !_state.hose || !_state.hose.length) return;
    var hd = document.createElement('div');
    hd.setAttribute('data-cpe-row', 'pull-header');
    hd.style.cssText = 'padding:4px 12px;margin-top:4px;border-top:1px solid #333;color:#888;font-size:10px';
    hd.textContent = _state.hose.length + ' pull' + (_state.hose.length === 1 ? '' : 's') +
      ' — a drag on the pipe bends it without adding a stick';
    box.appendChild(hd);
    for (var h = 0; h < _state.hose.length; h++) {
      (function(h) {
        var op = _state.hose[h];
        var mag = Math.hypot(op.d.x, op.d.y, op.d.z);
        var row = document.createElement('div');
        row.setAttribute('data-cpe-row', 'pull');
        row.style.cssText = 'padding:4px 12px;font-size:11px;display:flex;align-items:center;gap:6px;' +
          'border-left:3px solid #7e57c2;background:rgba(126,87,194,0.10)';
        var lbl = document.createElement('span');
        lbl.style.cssText = 'width:62px;color:#b39ddb;flex:none';
        lbl.textContent = 'pull ' + (h + 1);
        lbl.title = 'a bend you dragged into the pipe at ' + Math.round((op.s || 0) * 100) + '% along the walk';
        row.appendChild(lbl);
        var info = document.createElement('span');
        info.style.cssText = 'color:#888;font-family:monospace;flex:1';
        info.textContent = Math.round((op.s || 0) * 100) + '% · ' + mag.toFixed(2) + 'm · reach ' + (op.r || 0).toFixed(1);
        row.appendChild(info);
        var del = document.createElement('button');
        del.textContent = '×';
        del.title = 'remove this pull — the path springs back';
        del.style.cssText = 'flex:none;width:16px;height:16px;line-height:1;padding:0;font-size:12px;' +
          'background:#2a2e34;color:#888;border:1px solid #4a4f57;border-radius:3px;cursor:pointer';
        del.addEventListener('click', function(e) { e.stopPropagation(); _removeHosePull(h); });
        row.appendChild(del);
        box.appendChild(row);
      })(h);
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
      ? '<b style="color:#ff8c00">' + _labelOf(_state.held.b) +
        (_state.held.z === 'mid' ? ' — whole band' : ' — end, pivots about the other end') +
        '</b>. It moves in the plane you are <b>facing</b>: orbit first to choose the axes, then drag.'
      : '<b>Click the fat pipe</b> to drop a stick there · <b>drag it</b> to bend the path · drag a stick end to pivot it, its middle to move it. ' +
        'Only the fat stretch (the walk) is authorable — the thin dive and orbit are derived. Anywhere else orbits the scene as normal; a drag moves in the plane you are facing.';
  }

  // ══════════════════ §CPE_SCRUB — timeline scrub bar with stick markers ═════════════════════════
  // Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md Part A. Playhead = tNorm 0..1 over
  // `_state.plan` (the WHOLE film — dive, settle-spin, walk, turn-rise, orbit — not just the walk).
  // Tick marks = the sticks (`_state.bands` with `._stick`), so the bar answers "where along the
  // whole film does each authored node sit" at a glance, which the row list (arc-fraction ALONG
  // THE WALK ONLY, via `_labelOf`'s "@ NN%") cannot show on its own.
  function _walkWindow() {
    var bts = _state && _state.plan && _state.plan.beats;
    return (bts && isFinite(bts.spin) && isFinite(bts.out) && bts.out > bts.spin) ? bts : null;
  }
  // A band's position on the FILM timeline, found the same nearest-point way `_bandArcS` finds a
  // band's position on the WALK (arc-length, not a linear beat-fraction guess through the walk's own
  // easing/hold/turn remap — see effects.js poseAt's Beat 3, which is NOT linear in tNorm). filmPts
  // IS the sampled curve the tube is drawn from (`plan.poseAt(i/FILM_SAMPLES)`), so matching against
  // it is matching against the pipe's own placement, exactly as the spec asks ("derived the same
  // arc-length way the pipe already places bands").
  function _bandTNorm(bi) {
    var pts = _state.filmPts;
    if (!pts || pts.length < 2) return null;
    var c = _drawn(_state.bands[bi].c), best = 0, bd = Infinity;
    for (var i = 0; i < pts.length; i++) {
      var d = (pts[i].x - c.x) * (pts[i].x - c.x) + (pts[i].y - c.y) * (pts[i].y - c.y) + (pts[i].z - c.z) * (pts[i].z - c.z);
      if (d < bd) { bd = d; best = i; }
    }
    return best / (pts.length - 1);
  }
  function _fmtMMSS(sec) {
    sec = Math.max(0, sec || 0);
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  // §CPE_SCRUB_STANDALONE (2026-08-04) — the scrub bar's own panel, no longer nested under B and no
  // longer touching #cpe-panel at all. Resolves the OPEN QUESTION this file's own DONE block left
  // ("standalone widget vs docked under B" — user: "that timeline was supposed to be standalone
  // widget panel... independent"). Built alongside #cpe-panel at editor-open time (see open()), torn
  // down alongside it in finish() — never gated to B's toggle, so it now exists whenever the editor
  // is open and B is purely display/bearing (user, 2026-08-04: "pov box is purely display for user
  // bearing" — no drop/raycast interaction on it; this panel is the interactive one). Default
  // position sits directly below B's own default rect so the two read as one cluster even though
  // they are separate panels.
  function _buildScrubPanel() {
    var a = A();
    var vfDefaultTop = (a.canvas ? a.canvas.clientHeight : window.innerHeight) - VF_DEFAULT_H - VF_MARGIN - 40;
    // §CPE_PANEL_CLEAR (2026-08-05, user: "place those new panels away from present alt-c panel
    // so not hidden by each other") — #cpe-panel defaults to top:60,RIGHT:12,width:412 (near
    // full-height, right-anchored). B's old default (canvasWidth-VF_DEFAULT_W-MARGIN) landed
    // inside that same right-hand column. Anchored to the LEFT edge instead — clear of it.
    var rect = _scrubRect || {
      left: VF_MARGIN,
      top: vfDefaultTop + VF_DEFAULT_H + SCRUB_PANEL_GAP
    };
    var d = document.createElement('div');
    d.id = 'cpe-scrub-panel';
    // z-index above #cpe-panel's 10000 (user: "the scrub timeline should be above all as it got
    // tucked in bottom right") — was 9997, the most-buried of the three CPE panels.
    d.style.cssText = 'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + SCRUB_PANEL_W + 'px;' +
      'z-index:10001;background:rgba(20,22,26,0.96);border:1px solid #3a3f47;border-radius:6px;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.5);font-family:system-ui,sans-serif';
    d.innerHTML =
      '<div id="cpe-scrub-title" title="drag to move the timeline" style="padding:4px 8px;cursor:move;' +
        'user-select:none;display:flex;align-items:center;justify-content:space-between;' +
        'border-bottom:1px solid #3a3f47">' +
        '<span style="font:600 10px system-ui,sans-serif;color:#4fc3f7">Timeline</span>' +
        '<span id="cpe-scrub-tn" style="color:#888;font:400 10px monospace"></span></div>' +
      '<div style="padding:6px 8px 8px;display:flex;align-items:center;gap:6px">' +
        // §CPE_SCRUB_PLAY (task #8) — play/pause the rehearsal from here, reusing _previewFly's own
        // pose source. Additive only: the existing #cpe-preview button in #cpe-panel is untouched.
        '<button id="cpe-scrub-play" title="play the rehearsal from here" style="flex:none;width:22px;height:22px;' +
          'padding:0;font-size:11px;background:#2a2e34;color:#ddd;border:1px solid #4a4f57;border-radius:4px;' +
          'cursor:pointer;display:flex;align-items:center;justify-content:center">▶</button>' +
        '<div id="cpe-scrub-track" style="position:relative;flex:1;height:' + SCRUB_H + 'px;background:#15181c;' +
          'border:1px solid #3a3f47;border-radius:3px;cursor:pointer;user-select:none"></div>' +
      '</div>';
    document.body.appendChild(d);
    d._dragStrip = 26;
    if (a && typeof a._makeDraggable === 'function') a._makeDraggable(d);
    var save = function() {
      var r = d.getBoundingClientRect();
      _scrubRect = { left: Math.round(r.left), top: Math.round(r.top) };
    };
    d.addEventListener('pointerup', save);
    return d;
  }

  function _renderScrub() {
    var track = document.getElementById('cpe-scrub-track');
    if (!track || !_state) return;
    track.innerHTML = '';
    // Hoisted once per render (not per-tick/per-drag-frame) — _buildOverride() deep-copies bands/hose.
    var _filmTotal = _buildOverride()._total;
    // Clip window shading — reuses `s.clipIn`/`s.clipOut` directly (spec point 5), not a new range.
    if (_state.clipIn > 0 || _state.clipOut < 1) {
      var clipEl = document.createElement('div');
      clipEl.style.cssText = 'position:absolute;top:0;bottom:0;left:' + (_state.clipIn * 100) + '%;' +
        'width:' + ((_state.clipOut - _state.clipIn) * 100) + '%;background:rgba(255,238,88,0.14);pointer-events:none';
      track.appendChild(clipEl);
    }
    // The authorable stretch — same walk window §CPE_STICK's fat-tube overlay shades in the 3D view.
    var win = _walkWindow();
    if (win) {
      var walkEl = document.createElement('div');
      walkEl.style.cssText = 'position:absolute;top:0;bottom:0;left:' + (win.spin * 100) + '%;' +
        'width:' + ((win.out - win.spin) * 100) + '%;background:rgba(255,255,255,0.06);pointer-events:none';
      track.appendChild(walkEl);
    }
    // Tick marks — one per stick, spec point 3.
    for (var i = 0; i < _state.bands.length; i++) {
      if (!_state.bands[i]._stick) continue;
      var tn = _bandTNorm(i);
      if (tn == null) continue;
      // Blue lines only (user, 2026-08-04: "let the scrubber shows where the sticks are as blue
      // lines"). Read-only reflection of selection state set elsewhere (canvas/row) — the bar itself
      // has no click reaction on a tick, see _wireScrub below.
      var sel = _state.held && _state.held.b === i;
      var tick = document.createElement('div');
      tick.title = _labelOf(i) + ' — ' + _fmtMMSS(tn * _filmTotal) + ' into the film';
      tick.style.cssText = 'position:absolute;top:2px;bottom:2px;width:' + SCRUB_TICK_W + 'px;' +
        'left:calc(' + (tn * 100) + '% - ' + (SCRUB_TICK_W / 2) + 'px);' +
        'background:' + (sel ? '#ff8c00' : '#' + CPE_STICK_BLUE.toString(16).padStart(6, '0')) +
        ';border-radius:1px;pointer-events:none';
      track.appendChild(tick);
    }
    // Playhead.
    var tnP = _state.scrubTn == null ? 0 : _state.scrubTn;
    var head = document.createElement('div');
    head.id = 'cpe-scrub-head';
    head.style.cssText = 'position:absolute;top:-2px;bottom:-2px;width:2px;left:calc(' + (tnP * 100) + '% - 1px);' +
      'background:#4fc3f7;pointer-events:none;box-shadow:0 0 4px rgba(79,195,247,0.9)';
    track.appendChild(head);
    // §CPE_STICK_TIME_SYNC F1 (spec Part F1) — mm:ss / total, not a bare %. `_total` is the same
    // real film duration §CPE_ROOM_TITLE already reads for its own live caption, not a second clock.
    var lbl = document.getElementById('cpe-scrub-tn');
    if (lbl) lbl.textContent = _fmtMMSS(tnP * _filmTotal) + ' / ' + _fmtMMSS(_filmTotal);
  }

  // §CPE_SCRUB_VF_LIVE (restored 2026-08-04) — a scrub drag drives ONLY B's inset camera (`vfCam`),
  // never the main canvas camera/controls. This is the mid-fix cut that was written, witnessed, then
  // reverted before #1177 landed in favour of a simpler visual-only cut — the spec doc's own OPEN
  // QUESTION named this "deliberately DEFERRED future work", not dropped. Restoring it now: the
  // #1177 regression's actual invariant (main camera/controls untouched by any scrub) is preserved —
  // this only ever writes `_state.vfCam`, which #1177 never touched in the first place.
  // §CPE_SCRUB_POV_ONLY — extracted from _scrubTo so the scrub-play button can drive ONLY B
  // (never the main camera), same invariant _scrubTo's own drag path already honours.
  function _applyVFPose(tn) {
    var p = (_state && _state.plan && typeof _state.plan.poseAt === 'function') ? _state.plan.poseAt(tn) : null;
    if (p && _state.vfOn && _state.vfCam) {
      _state.vfCam.position.set(p.x, p.y, p.z);
      _state.vfCam.lookAt(p.tx, p.ty, p.tz);
      var a = A();
      if (a.markDirty) a.markDirty();
    }
    return p;
  }

  function _scrubTo(tn) {
    if (!_state) return null;
    tn = Math.max(0, Math.min(1, tn));
    _state.scrubTn = tn;
    _renderScrub();
    return _applyVFPose(tn);
  }

  function _wireScrub(track) {
    var drag = null;
    track.addEventListener('pointerdown', function(ev) {
      ev.preventDefault();
      var r = track.getBoundingClientRect();
      drag = { sx0: ev.clientX, sy0: ev.clientY, moved: false, r: r };
      try { track.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    track.addEventListener('pointermove', function(ev) {
      if (!drag) return;
      if (!drag.moved && Math.hypot(ev.clientX - drag.sx0, ev.clientY - drag.sy0) < CLICK_SLOP_PX) return;
      drag.moved = true;
      var tn = (ev.clientX - drag.r.left) / Math.max(1, drag.r.width);
      _scrubTo(tn);
    });
    track.addEventListener('pointerup', function(ev) {
      if (!drag) return;
      var d = drag; drag = null;
      try { track.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (d.moved) {
        console.log('§CPE_SCRUB dragged tn=' + (_state.scrubTn || 0).toFixed(3) + ' — same pose as a normal rehearsal at this instant');
        return;
      }
      // §CPE_SCRUB_READONLY (2026-08-04) — a click (no drag) just scrubs to that point, same as a
      // drag would. The bar no longer spawns or selects sticks on click (user: "clicking on them
      // has no reaction, user has to do edits the original way on canvas... or the alt-c panel row
      // rows"). Retires the old click-to-spawn path (formerly G-SCRUB-SPAWN) — stick creation/
      // selection/removal happens only via the canvas pipe or the row list, never the scrub bar.
      var tn = (ev.clientX - d.r.left) / Math.max(1, d.r.width);
      _scrubTo(tn);
    });
  }

  // ══════════════════ §CPE_VIEWFINDER — synced POV sub-panel (B) ═════════════════════════════════
  // Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md Part B. NOT a second WebGLRenderer/GL context —
  // one renderer (`A().renderer`), a second `THREE.PerspectiveCamera` sharing the same scene graph,
  // drawn into a sub-rectangle of the SAME canvas via the standard three.js multi-viewport technique
  // (setScissorTest + per-pane setViewport/setScissor). B's on-screen "panel" is therefore an HTML
  // frame (draggable via the shared A._makeDraggable, resizable via a new corner handle) that marks
  // WHERE on the main canvas the scissor rect sits — it does not itself contain a <canvas>.
  function _vfPerfReset() { _vfPerf.n = 0; _vfPerf.sum = 0; _vfPerf.max = 0; }
  function _vfPerfLog() {
    var avg = _vfPerf.n ? _vfPerf.sum / _vfPerf.n : 0;
    console.log('§CPE_VF_PERF G-PERF-1 frames=' + _vfPerf.n + ' avgMs=' + avg.toFixed(3) +
      ' maxMs=' + _vfPerf.max.toFixed(3) + ' — cost of B\'s OWN scissor render pass only, measured ' +
      'around the extra a.renderer.render() call in _vfRender, not the whole frame');
  }
  function _vfEnsureCam() {
    var a = A();
    if (_state.vfCam || !a.camera) return _state.vfCam;
    _state.vfCam = new THREE.PerspectiveCamera(a.camera.fov, 1, a.camera.near, a.camera.far);
    return _state.vfCam;
  }
  // Reads the SAME Time Machine cursor `_previewFly()`'s step() already set that frame via
  // `window.tmSetCursor` — never a second call (spec Part B point 4). Blank when no rehearsal with
  // buildup is driving the cursor (plain scrubbing does not touch Time Machine at all).
  function _vfUpdateReadout() {
    var el = document.getElementById('cpe-vf-clock');
    if (!el) return;
    var ms = null;
    try { if (typeof window.tmGetState === 'function') { var tm = window.tmGetState(); if (tm && tm.active) ms = tm.cursor; } } catch (e) {}
    el.textContent = ms != null ? new Date(ms).toISOString().slice(0, 10) : '';
  }
  function _buildVFPanel() {
    var a = A();
    var rect = _vfRect || {
      left: Math.max(VF_MARGIN, (a.canvas ? a.canvas.clientWidth : window.innerWidth) - VF_DEFAULT_W - VF_MARGIN),
      top: (a.canvas ? a.canvas.clientHeight : window.innerHeight) - VF_DEFAULT_H - VF_MARGIN - 40,
      width: VF_DEFAULT_W, height: VF_DEFAULT_H
    };
    var d = document.createElement('div');
    d.id = 'cpe-vf-panel';
    d.style.cssText = 'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;' +
      'width:' + rect.width + 'px;height:' + rect.height + 'px;z-index:9998;' +
      'border:2px solid #4fc3f7;border-radius:4px;box-shadow:0 4px 20px rgba(0,0,0,0.5);' +
      'background:transparent;pointer-events:none';
    d.innerHTML =
      '<div id="cpe-vf-title" title="drag to move the viewfinder" style="pointer-events:auto;position:absolute;top:0;left:0;right:0;' +
        'height:22px;background:rgba(20,22,26,0.85);color:#4fc3f7;font:600 10px system-ui,sans-serif;' +
        'padding:2px 6px;cursor:move;display:flex;align-items:center;justify-content:space-between;' +
        'border-bottom:1px solid #4fc3f7;user-select:none">' +
        '<span>POV <span id="cpe-vf-clock" style="color:#888;font-family:monospace;font-weight:400"></span></span></div>' +
      '<div id="cpe-vf-resize" title="drag to resize" style="pointer-events:auto;position:absolute;right:0;bottom:0;' +
        'width:' + VF_RESIZE_HANDLE_PX + 'px;height:' + VF_RESIZE_HANDLE_PX + 'px;cursor:nwse-resize;' +
        'background:linear-gradient(135deg,transparent 50%,#4fc3f7 50%);border-bottom-right-radius:2px"></div>';
    document.body.appendChild(d);
    d._dragStrip = 22;
    if (a && typeof a._makeDraggable === 'function') a._makeDraggable(d);
    var save = function() {
      var r = d.getBoundingClientRect();
      _vfRect = { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
      // §CPE_VF_ALIGN_DIAG_V2: re-arm the one-shot diagnostic so the NEXT _vfRender() frame logs
      // fresh numbers for this new drag/resize pose — a misalignment report is more likely to
      // follow a reposition than the untouched default.
      if (_state) _state._vfDiagLogged = false;
    };
    d.addEventListener('pointerup', save);
    // Corner resize — new (spec point 5: "Resize does NOT exist on any panel yet — net-new, small: a
    // corner handle resizing the scissor rect's pixel size, no relayout of scene geometry involved").
    var rh = document.getElementById('cpe-vf-resize'), rdrag = null;
    rh.addEventListener('pointerdown', function(ev) {
      ev.preventDefault(); ev.stopPropagation();
      var r = d.getBoundingClientRect();
      rdrag = { sx0: ev.clientX, sy0: ev.clientY, w0: r.width, h0: r.height };
      try { rh.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    rh.addEventListener('pointermove', function(ev) {
      if (!rdrag) return;
      var w = Math.max(VF_MIN_W, rdrag.w0 + (ev.clientX - rdrag.sx0));
      var h = Math.max(VF_MIN_H, rdrag.h0 + (ev.clientY - rdrag.sy0));
      d.style.width = w + 'px'; d.style.height = h + 'px';
    });
    rh.addEventListener('pointerup', function(ev) {
      if (!rdrag) return;
      rdrag = null;
      try { rh.releasePointerCapture(ev.pointerId); } catch (e) {}
      save();
      console.log('§CPE_VF_RESIZE w=' + Math.round(d.getBoundingClientRect().width) + ' h=' + Math.round(d.getBoundingClientRect().height));
    });
    return d;
  }
  // The scissor render pass — installed as `A()._cpeViewfinderRender` and called by main.js's own
  // animate() loop right after the main scene render (spec point 1: one renderer). Guarded so it is
  // a single property check when B is off, and it is UNSET entirely on close — see finish()/
  // _vfTeardown — so the MaxQ bake, which never sets this hook, can never reach this function
  // (statically verifiable: cinema_maxq.js has zero references to `_cpeViewfinderRender`).
  function _vfRender() {
    if (!_state || !_state.vfOn || !_state.vfCam) return;
    var a = A(), panel = document.getElementById('cpe-vf-panel');
    if (!a.renderer || !a.scene || !a.canvas || !panel) return;
    var t0 = performance.now();
    var canvasR = a.canvas.getBoundingClientRect(), panelR = panel.getBoundingClientRect();
    var pr = (a.renderer.getPixelRatio && a.renderer.getPixelRatio()) || 1;
    var w = Math.max(1, Math.round(panelR.width * pr)), h = Math.max(1, Math.round(panelR.height * pr));
    var x = Math.round((panelR.left - canvasR.left) * pr);
    var yTop = Math.round((panelR.top - canvasR.top) * pr);
    var canvasH = Math.round(canvasR.height * pr);
    var y = canvasH - yTop - h;   // three.js scissor/viewport origin is bottom-left
    // §CPE_VF_ALIGN_DIAG (2026-08-05, user-reported: rendered content sits right of the panel
    // border) — one-shot per toggle-on, not every frame. Prints every number the scissor math
    // depends on PLUS the renderer's actual backing-buffer size (ground truth — canvasR.width*pr
    // is an ASSUMPTION this log can disprove) and the panel's own box-sizing/border, so the next
    // repro gives real numbers instead of a screenshot guess. See CLAUDE.md FUNDAMENTAL LAW.
    // §CPE_VF_ALIGN_DIAG_V2 (2026-08-05) — the v1 numbers above (still logged) already proved the
    // scissor rect ITSELF is correctly placed within the real backing buffer (renderer.domElement,
    // ground truth — not derived), canvas===renderer.domElement (no aliasing), no CSS transform on
    // the canvas, box-sizing:border-box confirmed. That rules out hypothesis (b) — the BOX is not
    // misplaced. What's left is hypothesis (a): the CONTENT inside a correctly-placed box is framed
    // off-center, i.e. vfCam's own orientation state has drifted from what plan.poseAt(tn) intends
    // or from the main camera's — not a coordinate bug in this function at all. Compares vfCam
    // against a FRESH poseAt sample and against the main camera at the SAME instant.
    // Re-armed on every drag/resize `save()` (search _vfDiagLogged in _buildVFPanel), not just
    // toggle-on — a misalignment report is more likely to follow a user reposition than the
    // untouched default pose, and the v1-only one-shot could have logged an entirely different
    // instant than the one in the reported screenshot.
    if (w < 2 || h < 2) return;   // panel dragged fully off-canvas — nothing to draw
    _state.vfCam.aspect = w / h;
    _state.vfCam.updateProjectionMatrix();
    // §CPE_VF_ALIGN_DIAG / _V2 diagnostics moved to AFTER the aspect fix-up above (a real bug in
    // the diagnostic itself, caught by re-running it: logging vfCam.aspect BEFORE this line reads
    // the STALE value from _vfEnsureCam()'s creation-time aspect=1, not what this frame actually
    // renders with — e.g. one live capture showed vfCam_aspect=1.0000 vs box_aspect=1.5789 purely
    // from that ordering, not a real per-frame distortion). Logging here reports the exact values
    // used for THIS frame's renderer.render() call below, not a pre-fixup snapshot.
    if (!_state._vfDiagLogged) {
      _state._vfDiagLogged = true;
      var cs = window.getComputedStyle(panel);
      var mc = a.camera;
      var freshP = (_state.plan && typeof _state.plan.poseAt === 'function' && _state.scrubTn != null)
        ? _state.plan.poseAt(_state.scrubTn) : null;
      console.log('§CPE_VF_ALIGN_DIAG panelR=' + JSON.stringify({left:panelR.left,top:panelR.top,width:panelR.width,height:panelR.height}) +
        ' canvasR=' + JSON.stringify({left:canvasR.left,top:canvasR.top,width:canvasR.width,height:canvasR.height}) +
        ' pr=' + pr + ' computed_x=' + x + ' computed_y=' + y + ' computed_w=' + w + ' computed_h=' + h +
        ' canvasBackingBuffer=' + a.renderer.domElement.width + 'x' + a.renderer.domElement.height +
        ' rendererGetSize=' + JSON.stringify((function(){var s=new THREE.Vector2();a.renderer.getSize(s);return {w:s.x,h:s.y};})()) +
        ' boxSizing=' + cs.boxSizing + ' borderWidth=' + cs.borderLeftWidth + '/' + cs.borderTopWidth +
        ' xPlusW=' + (x+w) + ' backingBufferW=' + a.renderer.domElement.width + ' overflowRight=' + ((x+w) - a.renderer.domElement.width));
      console.log('§CPE_VF_ALIGN_DIAG_V2 vfCam_fov=' + _state.vfCam.fov + ' main_fov=' + mc.fov +
        ' vfCam_aspect=' + _state.vfCam.aspect.toFixed(4) + ' box_aspect=' + (w / h).toFixed(4) +
        ' vfCam_up=' + JSON.stringify({x:+_state.vfCam.up.x.toFixed(4), y:+_state.vfCam.up.y.toFixed(4), z:+_state.vfCam.up.z.toFixed(4)}) +
        ' main_up=' + JSON.stringify({x:+mc.up.x.toFixed(4), y:+mc.up.y.toFixed(4), z:+mc.up.z.toFixed(4)}) +
        ' vfCam_pos=' + JSON.stringify({x:+_state.vfCam.position.x.toFixed(3), y:+_state.vfCam.position.y.toFixed(3), z:+_state.vfCam.position.z.toFixed(3)}) +
        ' freshPose_pos=' + (freshP ? JSON.stringify({x:+freshP.x.toFixed(3), y:+freshP.y.toFixed(3), z:+freshP.z.toFixed(3)}) : 'n/a') +
        ' scrubTn=' + _state.scrubTn);
    }
    a.renderer.setScissorTest(true);
    a.renderer.setViewport(x, y, w, h);
    a.renderer.setScissor(x, y, w, h);
    a.renderer.render(a.scene, _state.vfCam);
    // Restore full-canvas state so nothing else in the render pipeline inherits a stale scissor —
    // every other renderer.render() call in this codebase (clash_snag.js, print_sheet.js, tools.js,
    // sitecam.js…) assumes a full viewport.
    a.renderer.setScissorTest(false);
    a.renderer.setViewport(0, 0, Math.round(canvasR.width * pr), canvasH);
    var ms = performance.now() - t0;
    _vfPerf.n++; _vfPerf.sum += ms; if (ms > _vfPerf.max) _vfPerf.max = ms;
  }
  // §CPE_VIEWFINDER on/off icon — open eye = ON/visible, shut eye = OFF/hidden (user, 2026-08-04: the
  // Lucide slashed-eye glyph read as "eye with a line through it", not an actual shut eyelid — swapped
  // for the user's own sprites, viewer/icons/eye_open.png / eye_closed.png, white-on-transparent so
  // they read against the panel's dark header).
  function _eyeIconSvg(on) {
    return '<img src="icons/eye_' + (on ? 'open' : 'closed') + '.png" width="14" height="14" alt="">';
  }
  function _toggleViewfinder(btn) {
    if (!_state) return;
    _state.vfOn = !_state.vfOn;
    var a = A();
    if (btn) {
      btn.innerHTML = _eyeIconSvg(_state.vfOn);
      btn.title = _state.vfOn
        ? 'turn off the POV viewfinder (B) — shows the exact camera pose the rehearsal is at'
        : 'turn on the POV viewfinder (B) — shows the exact camera pose the rehearsal is at';
    }
    if (_state.vfOn) {
      _vfEnsureCam();
      _buildVFPanel();
      a._cpeViewfinderRender = _vfRender;
      if (btn) { btn.style.color = '#4fc3f7'; btn.style.borderColor = '#4fc3f7'; }
      // Prime it once immediately, rather than waiting for the next scrub/preview frame, so toggling
      // ON shows the current pose right away.
      var p = _state.plan ? _state.plan.poseAt(_state.scrubTn || 0) : null;
      if (p) { _state.vfCam.position.set(p.x, p.y, p.z); _state.vfCam.lookAt(p.tx, p.ty, p.tz); }
      if (a.markDirty) a.markDirty();
      console.log('§CPE_VF on — one renderer, scissor sub-viewport, camera pose from the same plan.poseAt() the main view samples; display-only, no drop interaction — see §CPE_SCRUB_STANDALONE for the interactive timeline');
    } else {
      var panel = document.getElementById('cpe-vf-panel');
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      if (a._cpeViewfinderRender === _vfRender) delete a._cpeViewfinderRender;
      if (btn) { btn.style.color = '#888'; btn.style.borderColor = '#4a4f57'; }
      if (a.markDirty) a.markDirty();
      console.log('§CPE_VF off — panel removed, render hook cleared, zero per-frame cost (timeline stays open — see §CPE_SCRUB_STANDALONE)');
    }
  }
  function _vfTeardown() {
    var a = A();
    var panel = document.getElementById('cpe-vf-panel');
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    if (a && a._cpeViewfinderRender === _vfRender) delete a._cpeViewfinderRender;
  }
  // §CPE_SCRUB_STANDALONE teardown — mirrors _vfTeardown's shape, called from finish() alongside it.
  function _scrubPanelTeardown() {
    var panel = document.getElementById('cpe-scrub-panel');
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  }
  function _wireViewfinderToggle() {
    var btn = document.getElementById('cpe-vf-toggle');
    if (!btn) return;
    // Must not let the panel's own drag listener (bound to #cpe-panel, dragStrip covers this whole
    // header row) claim this click — see _makeDraggable's pointerdown, which does not exclude a
    // plain <button> the way it excludes INPUT/close/export elements.
    btn.addEventListener('pointerdown', function(ev) { ev.stopPropagation(); });
    btn.addEventListener('click', function(ev) { ev.stopPropagation(); _toggleViewfinder(btn); });
  }

  // ══ §CPE_HOSE / §CPE_CLIP / §CPE_BUILDUP — the whole-path strip.
  function _renderWhole() {
    if (!_state) return;
    var n = document.getElementById('cpe-hose-n');
    if (n) n.textContent = _state.hose.length
      ? _state.hose.length + ' pull' + (_state.hose.length === 1 ? '' : 's') + ' on the pipe (Ctrl+Z undoes the last)'
      : 'drag the pipe anywhere between the bands to bend it';
    var ct = document.getElementById('cpe-clip-txt');
    if (ct) ct.textContent = (_state.clipIn > 0 || _state.clipOut < 1)
      ? (_state.clipIn * 100).toFixed(0) + '% → ' + (_state.clipOut * 100).toFixed(0) + '%  (' +
        ((_state.clipOut - _state.clipIn) * _naturalDuration().total).toFixed(1) + 's)'
      : 'whole film';
    var pv = document.getElementById('cpe-preview');
    if (pv) {
      var stale = _state.edits !== _state.previewedAt;
      pv.textContent = _state.flying ? 'Previewing…' : (stale ? 'Preview ●' : 'Preview');
      pv.style.color = stale ? '#ffee58' : '#ddd';
      pv.style.borderColor = stale ? '#7a6f27' : '#4a4f57';
      pv.title = stale ? 'the path changed since the last preview' : 'you have seen this version';
      pv.disabled = !!_state.flying;
    }
    // §CPE_SCRUB_PLAY (task #8) — the scrub panel's own transport button, additive to #cpe-preview
    // above, never replacing it. Reflects the SAME _state.flying/flyPaused this function already
    // drives #cpe-preview from, no second state.
    var sp = document.getElementById('cpe-scrub-play');
    if (sp) {
      sp.textContent = _state.flying ? (_state.flyPaused ? '▶' : '⏸') : '▶';
      sp.title = _state.flying ? (_state.flyPaused ? 'resume the rehearsal' : 'pause the rehearsal') : 'play the rehearsal from here';
    }
  }
  // §CPE_SCRUB_PLAY — the play/pause button's click handler. Starting reuses _previewFly() exactly
  // (same pose source, same buildup/room-title/ghost-ground wiring); pause/resume use the hooks
  // _previewFly() exposes on _state (_flyPauseAt/_flyResume) while a rehearsal is in flight.
  function _wireScrubPlay() {
    var btn = document.getElementById('cpe-scrub-play');
    if (!btn) return;
    btn.addEventListener('click', function() {
      if (!_state) return;
      if (_state.flying && !_state.flyPaused) {
        if (_state._flyPauseAt) _state._flyPauseAt();
        console.log('§CPE_SCRUB_PLAY paused u=' + (_state.flyPausedU || 0).toFixed(3));
      } else if (_state.flying && _state.flyPaused) {
        if (_state._flyResume) _state._flyResume();
        console.log('§CPE_SCRUB_PLAY resumed');
      } else {
        console.log('§CPE_SCRUB_PLAY started');
        _previewFly(true);   // §CPE_SCRUB_POV_ONLY — B only, main canvas stays parked
        return;   // _previewFly's own _renderWhole() calls already sync the button
      }
      _renderWhole();
    });
  }
  // ══ §CPE_IDB_PATH_STORE — named plans, in IndexedDB, per building ═══════════════════════════
  // Specced 2026-07-27 ("later should be its own in IndexDB first separate table of saved
  // waypoints"), asked for 2026-07-28: *"can u make the save to do so in a json settings file in the
  // IndexDB for the building to be saved along when user saves to DB on disk. That also got open to
  // look back saved hose plans."*
  //
  // BOTH stores, and the split is the point:
  //   • IndexedDB `bim_ootb_cinema_paths` = the WORKING store. Many named plans per building,
  //     browsable, deletable, free to write — where the alternative is rewriting a 260 MB binary to
  //     save a dozen numbers, and a read-only OCI building cannot be written at all.
  //   • the building DB's `cinema_path` table = the PORTABLE format, still written on Save via the
  //     existing A.stageCinemaPath, so the plan travels with the file when it is saved to disk.
  // The stored value is exactly `_buildOverride()` — the same object the plan, the bake and Save
  // already consume — plus provenance. No second schema to drift from the first.
  var PATHS_DB = 'bim_ootb_cinema_paths', PATHS_STORE = 'paths';
  function _bldKey() {
    var a = A();
    return (a && (a.activeBuilding || a.buildingName)) || 'building';
  }
  function _pathsOpen() {
    return new Promise(function(res, rej) {
      var rq;
      try { rq = indexedDB.open(PATHS_DB, 1); } catch (e) { return rej(e); }
      rq.onupgradeneeded = function() {
        var db = rq.result;
        if (!db.objectStoreNames.contains(PATHS_STORE)) db.createObjectStore(PATHS_STORE, { keyPath: 'key' });
      };
      rq.onsuccess = function() { res(rq.result); };
      rq.onerror = function() { rej(rq.error || new Error('idb-open-failed')); };
      setTimeout(function() { rej(new Error('idb-open-timeout')); }, 5000);
    });
  }
  function _pathsTx(mode, fn) {
    return _pathsOpen().then(function(db) {
      return new Promise(function(res, rej) {
        var tx = db.transaction(PATHS_STORE, mode), rq = fn(tx.objectStore(PATHS_STORE));
        tx.oncomplete = function() { db.close(); res(rq && rq.result); };
        tx.onerror = function() { db.close(); rej(tx.error || new Error('idb-tx-failed')); };
      });
    });
  }
  function _pathsList() {
    var bld = _bldKey();
    return _pathsTx('readonly', function(st) { return st.getAll(); }).then(function(rows) {
      return (rows || []).filter(function(r) { return r.building === bld; })
        .sort(function(x, y) { return (y.savedAt || 0) - (x.savedAt || 0); });
    });
  }
  // ══ §CPE_PANEL_STATE — the save carries the PANEL CONTEXT the path was recorded under, so a
  // reopened plan restores the full session, not just the geometry. Three captured facts:
  //   • checkboxes — every checkbox the CPE panel has (#cpe-buildup → _state.buildup,
  //     #cpe-room-title → _state.roomTitle; the panel's full checkbox census, panels.js has none),
  //     plus the #cpe-day-counter corner select (§CPE_DAY_COUNTER_POS) — name → value.
  //   • total time — the Time Machine's project span, from its own public accessor
  //     window.tmGetState() (time_machine.js): projectEnd − projectStart, stored as tmSpanMs with
  //     both endpoints kept for provenance. There is NO setter for the span (it is derived from the
  //     op-log), so on restore it is a drift check, never a write.
  //   • day-counter position — the live cursor (`_cursor` inside time_machine.js, read via
  //     tmGetState().cursor): "what day the counter currently shows."
  function _capturePanelState(ov) {
    var tm = null;
    try { tm = (typeof window.tmGetState === 'function') ? window.tmGetState() : null; } catch (e) {}
    return {
      checkboxes: { buildup: !!ov.buildup, roomTitle: !!ov.roomTitle },
      dayCounter: ov.dayCounter || 'tr',
      tmActive: tm ? !!tm.active : false,
      tmCursor: tm ? tm.cursor : null,
      tmProjectStart: tm ? tm.projectStart : null,
      tmProjectEnd: tm ? tm.projectEnd : null,
      tmSpanMs: tm ? (tm.projectEnd - tm.projectStart) : null
    };
  }
  function _pathsSave(name) {
    var ov = _buildOverride(), bld = _bldKey();
    var rec = {
      key: bld + '|' + name, building: bld, name: name, savedAt: Date.now(),
      // Provenance, so a plan can be READ without loading it — what it contains and what it was
      // authored against. A plan whose building was re-extracted since is still openable; this is
      // what lets the user see that before they open it.
      meta: { bands: ov.bands.length, hoseOps: ov.hose.length,
              clip: ov.clip ? [ov.clip.in, ov.clip.out] : null, buildup: !!ov.buildup,
              totalSec: ov._total, pathLen: ov._pathLen, cpe: CPE_V.split(' ')[0] },
      override: ov,
      panelState: _capturePanelState(ov)
    };
    return _pathsTx('readwrite', function(st) { return st.put(rec); }).then(function() {
      var ps = rec.panelState;
      console.log('§CPE_PATH_SAVED name="' + name + '" building=' + bld +
        ' bands=' + rec.meta.bands + ' hoseOps=' + rec.meta.hoseOps +
        ' clip=' + (rec.meta.clip ? rec.meta.clip[0].toFixed(2) + '→' + rec.meta.clip[1].toFixed(2) : 'whole') +
        ' buildup=' + (rec.meta.buildup ? 1 : 0) + ' total=' + rec.meta.totalSec.toFixed(1) + 's' +
        ' — IndexedDB working store; cinema_path TABLE written separately so it travels with the .db');
      console.log('§CPE_PANEL_STATE saved buildup=' + (ps.checkboxes.buildup ? 1 : 0) +
        ' roomTitle=' + (ps.checkboxes.roomTitle ? 1 : 0) + ' dayCounter=' + ps.dayCounter +
        ' tmActive=' + (ps.tmActive ? 1 : 0) +
        ' tmCursor=' + (ps.tmCursor != null ? ps.tmCursor : 'n/a') +
        ' tmSpanMs=' + (ps.tmSpanMs != null ? ps.tmSpanMs : 'n/a'));
      return rec;
    });
  }
  function _pathsDelete(key) {
    return _pathsTx('readwrite', function(st) { return st.delete(key); }).then(function() {
      console.log('§CPE_PATH_DELETED key="' + key + '"');
    });
  }
  // §CPE_PANEL_STATE restore — drive the panel's own controls through their OWN change handlers
  // (the same mechanism a user's click uses: panels.js:552 is the dispatchEvent precedent), never a
  // bare DOM mutation the rest of the app cannot see. The dayEl seeding at wiring time already did
  // this for the select; the sibling checkboxes never got it — this closes that gap.
  function _syncPanelControls() {
    [['cpe-buildup', !!_state.buildup], ['cpe-room-title', !!_state.roomTitle]].forEach(function(p) {
      var el = document.getElementById(p[0]);
      if (el && el.checked !== p[1]) { el.checked = p[1]; el.dispatchEvent(new Event('change')); }
    });
    var dayEl = document.getElementById('cpe-day-counter'), want = _state.dayCounter || 'tr';
    if (dayEl && dayEl.value !== want) { dayEl.value = want; dayEl.dispatchEvent(new Event('change')); }
  }
  function _applyPanelState(ps) {
    if (!ps) {
      // Old record, saved before panelState existed — skip, exactly today's behaviour, never throw.
      console.log('§CPE_PANEL_STATE none on record (pre-panelState save) — panel-state restore skipped');
      return;
    }
    if (ps.checkboxes) {
      _state.buildup = !!ps.checkboxes.buildup;
      _state.roomTitle = !!ps.checkboxes.roomTitle;
    }
    if (ps.dayCounter) _state.dayCounter = ps.dayCounter;
    _syncPanelControls();
    // Day-counter position (= Time Machine cursor): restored through the ONE public cursor setter,
    // window.tmSetCursor (time_machine.js — "renderAtTime() is internal by design; this is the ONE
    // public cursor setter"). The span has no setter (derived from the op-log), so a saved-vs-now
    // mismatch is REPORTED, not written.
    var cursorNote = 'skipped';
    if (ps.tmCursor != null && typeof window.tmGetState === 'function' && typeof window.tmSetCursor === 'function') {
      var tm = window.tmGetState();
      if (tm.active) {
        var span = tm.projectEnd - tm.projectStart;
        if (ps.tmSpanMs != null && Math.abs(span - ps.tmSpanMs) > 1)
          console.warn('§CPE_PANEL_STATE span drift saved=' + ps.tmSpanMs + 'ms now=' + span +
            'ms — the schedule changed since this plan was saved');
        cursorNote = window.tmSetCursor(ps.tmCursor) ? 'restored ms=' + ps.tmCursor : 'setter-refused';
      } else {
        cursorNote = ps.tmActive ? 'tm-inactive-now (activate Time Machine to see the saved day)' : 'tm-was-inactive';
      }
    }
    console.log('§CPE_PANEL_STATE restored buildup=' + (_state.buildup ? 1 : 0) +
      ' roomTitle=' + (_state.roomTitle ? 1 : 0) + ' dayCounter=' + (_state.dayCounter || 'tr') +
      ' tmCursor=' + cursorNote + ' tmSpanMs=' + (ps.tmSpanMs != null ? ps.tmSpanMs : 'n/a'));
  }
  // Loading REPLACES the authored state, and only when asked — never on open. The spec left that as
  // an open question; the user's own words answer it: *"open to look back saved hose plans"*. Looking
  // is a choice, not a side effect. Ctrl+Z restores what was there before the load.
  function _pathsApply(rec) {
    var ov = rec && rec.override;
    if (!ov || !ov.bands || ov.bands.length < 2) { console.warn('§CPE_PATH_LOAD_FAIL empty or malformed record'); return false; }
    _undoPush('load "' + rec.name + '"');
    _state.bands = ov.bands.map(function(b, i) {
      // §CPE_REOPEN_NODE: prefer the STORED flag; the index rule is the fallback for records saved
      // before _buildOverride carried it, so an old plan keeps its × affordance.
      return { c: { x: b.c.x, y: b.c.y, z: b.c.z }, d: { x: b.d.x, y: b.d.y, z: b.d.z }, len: b.len,
               hold: +(b.hold || 0),
               _stick: b._stick != null ? !!b._stick : (i > 0 && i < ov.bands.length - 1), _s: b._s,
               // §CPE_AIM_PIN: `null`/missing on any record saved before this shipped — same
               // graceful-old-record treatment as `_stick`'s own fallback above.
               lookAt: b.lookAt ? { x: b.lookAt.x, y: b.lookAt.y, z: b.lookAt.z } : null };
    });
    _state.hose = (ov.hose || []).map(function(o) {
      return { s: o.s, r: o.r, d: { x: o.d.x, y: o.d.y, z: o.d.z },
               a: o.a ? { x: o.a.x, y: o.a.y, z: o.a.z } : null };
    });
    _state.clipIn = ov.clip ? ov.clip.in : 0;
    _state.clipOut = ov.clip ? ov.clip.out : 1;
    _state.buildup = !!ov.buildup;
    _state.roomTitle = !!ov.roomTitle;
    _state.dayCounter = ov.dayCounter || 'tr';   // older saved plans predate the choice — top right
    _state.userTotal = ov._total;
    _state.held = null;
    // §CPE_PANEL_STATE — restore the panel context the plan was recorded under (or skip loudly for
    // records that predate it). Runs BEFORE staging so the staged override reflects the final state.
    _applyPanelState(rec.panelState);
    // §CPE_PATH_NOT_PORTABLE fix, part 1 (prompts/CINEMA_PATH_EDITOR.md): opening a named plan used
    // to leave `_state.staged = false` and never call `A.stageCinemaPath` — so after any reload,
    // `A._cinemaPathEdit` stayed null and Ctrl+S's `_writeCinemaPathTable` guard returned silently,
    // even though the plan is authored data the user explicitly opened. Re-stage HERE, the same call
    // the "Save this path" button already makes (`_buildOverride()` reads the `_state` just set
    // above), so the just-opened plan is what Ctrl+S actually writes, and the panel's OK/Save buttons
    // read `staged=true` immediately rather than implying the open plan is unstaged.
    var _a = A();
    if (typeof _a.stageCinemaPath === 'function') _a.stageCinemaPath(_buildOverride());
    _state.staged = true;
    console.log('§CPE_PATH_LOADED name="' + rec.name + '" bands=' + _state.bands.length +
      ' hoseOps=' + _state.hose.length + ' clip=' + _state.clipIn.toFixed(2) + '→' + _state.clipOut.toFixed(2) +
      ' buildup=' + (_state.buildup ? 1 : 0) + ' roomTitle=' + (_state.roomTitle ? 1 : 0) +
      ' dayCounter=' + (_state.dayCounter || 'tr') +
      ' savedAt=' + new Date(rec.savedAt).toISOString().slice(0, 16) +
      ' — re-staged (§CPE_PATH_NOT_PORTABLE): Ctrl+S now writes this path; Ctrl+Z restores what you had before loading');
    _markPreviewStale();
    _refreshFlow(); _replanFilm();
    _redrawScene(); _renderRows(); _renderClock(); _renderWhole(); _syncButtons();
    return true;
  }

  // ══ §CPE_VIEWFINDER — THE ONE PLACE A POSE IS APPLIED TO THE LIVE MAIN CAMERA ══════════════════
  // Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_PREVIEW_DIVERGENCE doctrine — "cannot
  // become a second notion of the path". Used by `_previewFly()`'s rehearsal step() ONLY.
  //
  // §CPE_SCRUB correction (2026-08-04, caught live by the user in their own browser, NOT the same
  // claude-in-chrome instability seen elsewhere this session — a genuine behavioural defect, then
  // simplified further rather than fixed in place): this function used to ALSO be called by the
  // scrub-bar drag handler, which meant dragging the Part A timeline moved the MAIN canvas — wrong,
  // per the user: "the main canvas... supposed to remain as was where user still does traditional
  // editing dragging the pipe etc." The scrub-driving call was removed outright (see `_scrubTo`,
  // now visual-only) rather than rerouted to drive `_state.vfCam` instead — "scrub drives B's
  // camera" is DEFERRED, explicitly left for a future session (see this file's own DONE block in
  // the spec doc), not rebuilt here.
  function _applyCameraPose(tn) {
    var a = A();
    if (!_state || !_state.plan || typeof _state.plan.poseAt !== 'function') return null;
    var p = _state.plan.poseAt(tn);
    a.camera.position.set(p.x, p.y, p.z);
    a.controls.target.set(p.tx, p.ty, p.tz);
    a.controls.update();
    // §CPE_VIEWFINDER point 2: "B's camera pose is set from the SAME plan.poseAt(tn) the main
    // rehearsal camera uses at that instant" — literally the same sample just taken above, not a
    // second poseAt call. B tracking the main camera 1:1 while `_previewFly()` flies it is exactly
    // the "exact POV" ask; this path is unaffected by the 2026-08-04 scrub correction.
    if (_state.vfOn && _state.vfCam) {
      _state.vfCam.position.set(p.x, p.y, p.z);
      _state.vfCam.lookAt(p.tx, p.ty, p.tz);
      // §CPE_VIEWFINDER point 4: the readout is NOT refreshed here. Inside a rehearsal step, this
      // function runs BEFORE that frame's `window.tmSetCursor` call (see step() below) — reading the
      // clock here would show LAST frame's cursor for one frame every frame, a small but real
      // staleness the "no second clock" doctrine exists to catch. step() refreshes it AFTER its own
      // tmSetCursor block instead.
    }
    if (a.markDirty) a.markDirty();
    return p;
  }

  // §CPE_PREVIEW_BUTTON — fly the CURRENT edit, on demand, never automatically.
  // Driven by `_state.plan.poseAt`: the same plan object the tube is sampled from and the same one
  // finish() hands the bake, so this cannot become a second notion of the path (§CPE_PREVIEW_DIVERGENCE).
  // Honours the clip window — previewing a clip should show the clip, not the film it was cut from.
  // §CPE_SCRUB_POV_ONLY (2026-08-05) — povOnly: true drives ONLY B (vfCam), leaving the main
  // canvas camera/controls untouched throughout, same invariant §CPE_SCRUB_VF_LIVE's drag path
  // already honours. #cpe-preview's own wiring calls this with no argument — unaffected.
  function _previewFly(povOnly) {
    if (!_state || _state.flying || !_state.plan || typeof _state.plan.poseAt !== 'function') return;
    var a = A(), s = _state;
    var t0N = s.clipIn, t1N = s.clipOut;
    var dur = Math.max(1000, (t1N - t0N) * 10000);   // 10s for the whole film, pro-rata for a clip
    console.log('§CPE_PREVIEW click stale=' + (s.edits !== s.previewedAt ? 1 : 0) + ' edits=' + s.edits +
      ' window=' + t0N.toFixed(2) + '→' + t1N.toFixed(2) + ' durMs=' + dur.toFixed(0) +
      ' hoseOps=' + s.hose.length + ' buildup=' + (s.buildup ? 1 : 0) + ' povOnly=' + (povOnly ? 1 : 0));
    var save = povOnly ? null : { px: a.camera.position.x, py: a.camera.position.y, pz: a.camera.position.z,
                 tx: a.controls.target.x, ty: a.controls.target.y, tz: a.controls.target.z };
    s.flying = true; s.previewedAt = s.edits; _renderWhole();

    // §CPE_ROOM_TITLE — live preview overlay, built ONCE per rehearsal against the film's real
    // duration in seconds (poseAt's tNorm domain is 0..1 over the WHOLE plan; `dur` above is just
    // this rehearsal's playback speed, not the film's real length).
    var _titleTotalSec = s.roomTitle ? _buildOverride()._total : 0;
    if (s.roomTitle && a.roomTitleLiveStart) a.roomTitleLiveStart(s.plan, _titleTotalSec);
    // §CPE_DAY_COUNTER_POS — cpe_day_counter.js has carried dayCounterLiveStart/Tick/Stop since it
    // shipped and NOTHING called them: the counter only ever existed in the exported bytes, so the
    // user could not see their own choice until a 20-minute bake finished. Wired here so the corner
    // is checkable in the rehearsal, through the same draw routine the bake uses.
    var _dayPos = s.dayCounter || 'tr', _dayOn = (_dayPos !== 'off');

    // ══ §CPE_BUILDUP in the PREVIEW — measured before it was assumed expensive ═════════════════
    // User, 2026-07-28: "i dont expect buildup preview can be done as it be heavy engine work...
    // I would expect maybe meshed batch or some occlusion happening". Pushed back, with numbers:
    // NO new engine work exists here. Time Machine already drives per-element visibility through
    // BatchedMesh `setVisibleAt` / InstancedMesh zero-scale matrices — that is what its playback
    // does today at ~2/sec on 122k-element buildings. The preview just moves the same cursor.
    // Costs, measured, not guessed: the mode-D re-key is a ONE-OFF 12-14 ms (1,120 ops) / one pass
    // over 63,415 ops on Hospital_3; per frame it is `renderAtTime`, measured in
    // TM_INCREMENTAL_RENDER_PERF.md at 2.0 ms on the delta path and ~23 ms full at 16k objects.
    // A 10 s preview steps the cursor by span/600 per frame, far under `_INCR_MAX_SPAN_MS` (7 days),
    // so the delta path engages and this is a few ms a frame. The one case that pays full price is
    // DLOD engaged (`_dlodCamMoved` forces a full traverse whenever the camera moves) on a very
    // large building — the preview then runs slower, which for a 10 s rehearsal is acceptable and,
    // more to the point, VISIBLE in §CPE_PREVIEW_BUILDUP's own ms rather than a mystery.
    var bkPrev = null;
    // §CPE_VIEWFINDER's G-PERF-1: reset the per-rehearsal accumulator so the exit log below reports
    // THIS run's cost, not a running total across preview clicks.
    if (_state.vfOn) _vfPerfReset();
    s.flyPaused = false;
    var startFly = function() {
      var myFly = ++s.flyId, t0 = performance.now(), frames = 0;
      // §CPE_SCRUB_PLAY (task #8) — pause/resume hooks, same shape as tour.js's own §TOUR_TIMELINE_
      // SCRUB "pause HOLDS the pose: nothing writes the camera while paused" (tour.js:1527). Pausing
      // just stops step() from scheduling its next rAF — no cleanup runs, nothing is restored, since
      // this is not completion. Resuming re-anchors t0 so u continues exactly where it left off.
      s._flyPauseAt = function() {
        if (myFly !== s.flyId || s.flyPaused) return;
        s.flyPausedU = Math.min(1, (performance.now() - t0) / dur);
        s.flyPaused = true;
      };
      s._flyResume = function() {
        if (myFly !== s.flyId || !s.flyPaused) return;
        t0 = performance.now() - (s.flyPausedU || 0) * dur;
        s.flyPaused = false;
        requestAnimationFrame(step);
      };
      // §CPE_SCRUB_PLAY: named-function-expression `step` was only visible to ITSELF (for the
      // recursive rAF call below), not to `_flyResume` above in the enclosing closure — caught live
      // by the witness (ReferenceError on the first real pause/resume). Bound to `var step` instead
      // so both closures resolve the same function.
      var step = function step() {
        if (!_state || myFly !== _state.flyId) return;
        if (s.flyPaused) return;   // _flyResume() re-kicks the chain; nothing to do meanwhile
        var u = Math.min(1, (performance.now() - t0) / dur);
        var tn = t0N + (t1N - t0N) * u;
        // §CPE_SCRUB/§CPE_VIEWFINDER: the ONE place a pose is applied to the live camera — see
        // _applyCameraPose above. Was inlined here; extracted so scrubbing and B share it exactly.
        // §CPE_SCRUB_POV_ONLY: povOnly skips the main camera entirely, applying to B alone.
        if (povOnly) { _applyVFPose(tn); } else { _applyCameraPose(tn); }
        if (s.roomTitle && a.roomTitleLiveTick) a.roomTitleLiveTick(tn * _titleTotalSec);
        if (bkPrev && window.tmSetCursor) {
          // §CPE_BUILDUP_WORK_PACED: the rehearsal asks for the SAME cursor the bake will ask for at
          // this film fraction — paced by elements placed, not by days elapsed. Falls back to the
          // old linear-calendar expression if cinema_maxq is an older cached copy.
          // §CPE_BUILDUP_TOPOUT: the same remap the bake applies — construction completes at the
          // closing-orbit boundary, so the rehearsal's ending shows the finished building too.
          var bkTn = a.buildupTAt ? a.buildupTAt(tn, _state.plan) : tn;
          // §GHOST_GROUND_LIVE_TRIGGER: compute the cursor ONCE and reuse it for tmSetCursor,
          // ghostGroundAt and dayCounterLiveTick — previously each call re-derived it inline
          // (harmless when they agreed, but the ghost-ground trigger now needs the EXACT same
          // cursor value tmSetCursor just used, not a separately-recomputed one).
          var bkMs = a.buildupCursorAt ? a.buildupCursorAt(bkTn, bkPrev)
            : (bkPrev.projectStart + bkTn * (bkPrev.projectEnd - bkPrev.projectStart));
          window.tmSetCursor(bkMs);
          // §CPE_GHOST_GROUND: the rehearsal shows what the bake will show. The fade is expressed in
          // FILM fraction, so the 10 s preview and the full bake trace the identical curve even
          // though the wall-clock speeds differ by 15x. `bkMs` is the real cursor — §GHOST_GROUND_
          // LIVE_TRIGGER compares it directly to `firstAboveMs`, never a converted fraction.
          if (a.ghostGroundAt) a.ghostGroundAt(bkTn, _titleTotalSec || dur / 1000, bkPrev, bkMs);
          // Same cursor the buildup was just set to — never a second, separately-interpolated clock.
          if (_dayOn && a.dayCounterLiveTick) a.dayCounterLiveTick(bkMs);
        }
        // §CPE_VIEWFINDER: refresh B's readout AFTER this frame's tmSetCursor above, not inside
        // _applyCameraPose (which runs before it) — see that function's comment. Reads the value
        // step() itself just finished setting; never a second, independently-timed clock.
        if (_state.vfOn) _vfUpdateReadout();
        frames++;
        if (a.markDirty) a.markDirty();
        if (u < 1) return requestAnimationFrame(step);
        var msPerFrame = (performance.now() - t0) / Math.max(1, frames);
        if (!povOnly) {
          a.camera.position.set(save.px, save.py, save.pz);
          a.controls.target.set(save.tx, save.ty, save.tz);
          a.controls.update();
          if (a.markDirty) a.markDirty();
        }
        // Hand Time Machine back exactly as it was — the preview must never leave the user's
        // timeline re-ordered, same contract the bake honours on every exit path.
        if (bkPrev && window.tmRestoreDerivedOrder) { window.tmRestoreDerivedOrder(); bkPrev = null; }
        // §CPE_GHOST_GROUND: same exit contract as the Time Machine restore above — the rehearsal
        // must not leave the ground see-through for the editing session that follows it.
        if (a.ghostGroundRestore) a.ghostGroundRestore();
        if (a.buildupPacingReset) a.buildupPacingReset();
        if (a.roomTitleLiveStop) a.roomTitleLiveStop();
        if (a.dayCounterLiveStop) a.dayCounterLiveStop();
        _state.flying = false;
        // §CPE_SCRUB_PLAY: natural completion — clear the pause hooks, this run is over, not paused.
        s._flyPauseAt = null; s._flyResume = null; s.flyPaused = false;
        console.log('§CPE_PREVIEW done frames=' + frames + ' msPerFrame=' + msPerFrame.toFixed(1) +
          ' buildup=' + (s.buildup ? 1 : 0) + ' — camera restored to the editing pose');
        // §CPE_VIEWFINDER G-PERF-1: measured (not guessed) ms/frame B's OWN scissor render pass
        // added during this rehearsal — see _vfRender's timing. Zero calls logged means B never ran
        // (off, or torn down mid-flight), which is itself the "zero cost when off" claim made numeric.
        if (_state.vfOn) _vfPerfLog();
        _renderWhole();
      };
      step();
    };
    // §CPE_BUILDUP_FOLLOW_TM — this used to call tmOrderByCameraPath UNCONDITIONALLY, with no
    // tmScheduleSource() consultation at all: the whole source-selection branch existed only in
    // cinema_maxq.js, so on a captured-schedule building the rehearsal showed one build order and the
    // film recorded another. Both callers now go through the single verb, so preview and bake cannot
    // disagree — and neither of them re-keys anything.
    if (!s.buildup || typeof window.tmFollowTimeline !== 'function') { startFly(); return; }
    (async function() {
      try {
        var t0b = performance.now();
        var ok = await window.tmActivateForBake();
        if (ok) bkPrev = window.tmFollowTimeline();
        // §CPE_GHOST_GROUND: armed from the SAME bkState the bake arms from, right after the
        // timeline becomes real — the trigger is a cursor timestamp and cannot exist before that.
        if (bkPrev && a.ghostGroundArm) a.ghostGroundArm(bkPrev);
        // §CPE_DAY_COUNTER_POS — armed from the same bkState, for the same reason: the span it
        // counts over does not exist until the timeline is real.
        if (bkPrev && _dayOn && a.dayCounterLiveStart) a.dayCounterLiveStart(bkPrev, _dayPos);
        console.log('§CPE_PREVIEW_BUILDUP ' + (bkPrev ? 'armed mode=' + (bkPrev.source === 'captured' ? 'S' : 'T') +
            ' ops=' + bkPrev.ops + ' placed=' + bkPrev.placed : 'UNAVAILABLE (no timeline to follow)') +
          ' setupMs=' + (performance.now() - t0b).toFixed(0) +
          ' — the same cursor Time Machine drives at playback, no new visibility mechanism');
        if (bkPrev && a.buildupTopoutU) {
          var _tp = a.buildupTopoutU(_state.plan);
          console.log('§CPE_BUILDUP_TOPOUT topoutU=' + _tp.u.toFixed(3) + ' src=' + _tp.src +
            ' (rehearsal, same remap as the bake)');
        }
      } catch (e) { console.warn('§CPE_PREVIEW_BUILDUP failed ' + e.message); bkPrev = null; }
      startFly();
    })();
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
    // §CPE_SCRUB_BEARING (2026-08-05, user: "the scrubber and pov correlates which stick the user
    // selects, they indicate so user gets perfect bearing") — selecting a stick, from EITHER the
    // canvas (line ~2255) or the row list (line ~1034), moves the playhead (and B's camera, if on)
    // to that stick's own film position. Reuses _scrubTo verbatim — same pose source, same B-live
    // wiring §CPE_SCRUB_VF_LIVE already established, no second path.
    if (!same && _state.bands[bi] && _state.bands[bi]._stick) {
      var bearTn = _bandTNorm(bi);
      if (bearTn != null) _scrubTo(bearTn);
    }
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

  // ══ §CPE_AIM_PIN — click-to-pin explicit look-target (Part C) ═══════════════════════════════════
  // Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md Part C. "With a stick selected, clicking an
  // object/room in the canvas sets that stick's lookAt; B updates live." Read as: whichever band is
  // currently SELECTED (`_state.held.b`) — settle/exit-door/stop included, not only a user-dropped
  // `_stick` — since the mechanism (rotation-only override) is identical for every band and nothing
  // in the spec's own wording restricts it further; flagged in the DONE block as an interpretation,
  // not a re-litigation of §CPE_STICK's own narrower "stick" vocabulary.
  //
  // Position is NEVER touched here (spec point 1: "sets ROTATION only") — this writes `lookAt` on
  // the band and nothing else; the existing end/mid drag handles remain the only way to move a band.
  //
  // Reuses the SAME raycast pattern measure.js's own click-to-pick already uses (`A.raycaster`/
  // `A.mouse`, canvas-rect-relative NDC, scene meshes minus ground) — not a second picking system.
  // The editor's OWN overlay meshes (`_state.objs` — the tube, bars, handle spheres) are excluded,
  // or a pin click could hit the pipe/handle geometry instead of the building it draws over.
  function _tryPinClick(bi, ev) {
    var a = A();
    if (!a.raycaster || !a.camera || !a.scene || !a.canvas || !_state || bi == null || !_state.bands[bi]) return;
    var rect = a.canvas.getBoundingClientRect();
    a.mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    a.mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    a.raycaster.setFromCamera(a.mouse, a.camera);
    var meshes = [];
    a.scene.traverse(function(o) {
      if (o.isMesh && o.visible && o !== a.ground && _state.objs.indexOf(o) === -1) meshes.push(o);
    });
    var hits = a.raycaster.intersectObjects(meshes, false);
    if (!hits.length) {
      console.log('§CPE_AIM_PIN click band=' + bi + ' — no mesh under the pointer, nothing pinned');
      return;
    }
    var mesh = hits[0].object;
    _setPin(bi, hits[0].point, 'class=' + (mesh.userData && mesh.userData.ifcClass || mesh.type));
  }
  // The actual mutation, factored out of the raycast above so a witness can drive it with a KNOWN
  // world point (deterministic — no dependency on a screen pixel happening to land on real
  // geometry, same reasoning §CPE_SCRUB's `_scrubTo` probe already established) while still
  // exercising the real undo/replan/redraw pipeline, not a re-implementation of it.
  function _setPin(bi, p, srcNote) {
    if (!_state || !_state.bands[bi]) return false;
    _undoPush('pin band ' + bi);
    _state.bands[bi].lookAt = { x: p.x, y: p.y, z: p.z };
    _state.staged = false;
    console.log('§CPE_AIM_PIN band=' + bi + ' lookAt=(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2) + ')' +
      (srcNote ? ' ' + srcNote : '') +
      ' — rotation only, position untouched; wins locally at this band, LOS/density resume at the next one');
    _markPreviewStale();
    _replanFilm(); _redrawScene(); _renderRows(); _renderClock(); _syncButtons();
    return true;
  }
  // The reciprocal — spec names no removal gesture, but a pin with no way off it is a trap (same
  // "an affordance you cannot see is not an affordance" doctrine §CPE_STICK's own history records).
  // Wired to a small × next to the row's pin indicator, same convention as a stick's own × (_renderRows).
  function _unpinBand(bi) {
    if (!_state || !_state.bands[bi] || !_state.bands[bi].lookAt) return false;
    _undoPush('unpin band ' + bi);
    _state.bands[bi].lookAt = null;
    _state.staged = false;
    console.log('§CPE_AIM_PIN unpin band=' + bi + ' — reverts to LOS/§CPE_AIM_DENSITY at this band');
    _markPreviewStale();
    _replanFilm(); _redrawScene(); _renderRows(); _renderClock(); _syncButtons();
    return true;
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
  // ══ §CPE_HOSE — grab the PIPE itself, anywhere along the walk.
  // Screen-space nearest-point, same reasoning as _hitTest above (the pipe draws depthTest:false, so
  // a raycast would disagree with what is visible). Band handles win ties — they are the precise
  // control, the hose is the coarse one, and a grab inside a handle's radius means the handle.
  // Returns the grabbed point plus its arc-length fraction on the CANONICAL (undeformed) polyline.
  function _hitTestPath(ev) {
    if (!_state.flowHosed || _state.flowHosed.length < 2) return null;
    var pts = _state.flowHosed, frac = _state.flowFrac, best = -1, bestD = GRAB_PX;
    for (var i = 0; i < pts.length; i++) {
      var s = _screenOf(pts[i]);
      if (s.behind) continue;
      var d = Math.hypot(ev.clientX - s.x, ev.clientY - s.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return null;
    return { i: best, s: frac[best], p: { x: pts[best].x, y: pts[best].y, z: pts[best].z } };
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
      if (!hit) {
        // §CPE_HOSE: no band handle under the cursor — try the pipe. A miss on BOTH still falls
        // through to OrbitControls untouched, so the scene stays navigable exactly as before.
        var ph = _hitTestPath(ev);
        if (ph) {
          ev.preventDefault(); ev.stopPropagation();
          // §CPE_STICK vs §CPE_HOSE — ONE grab, split by what the hand does, not by a modifier:
          // let go without moving and you get a stick; move and you bend the pipe. `hit` carries
          // the whole grab so pointerup can decide after the fact.
          _state.drag = { hose: true, s: ph.s, snapped: false, hit: ph,
                          sx0: ev.clientX, sy0: ev.clientY,
                          p0: { x: ph.p.x, y: ph.p.y, z: ph.p.z }, op: null };
          var _bh = _dragBasis();
          console.log('§CPE_HOSE grab s=' + ph.s.toFixed(3) + ' reach=' + (_state.reach * 100).toFixed(0) +
            '% point=' + ph.i + '/' + _state.flowHosed.length +
            ' rate=' + _bh.mpp.toFixed(3) + ' m/px — falloff is ARC-LENGTH, the return leg of an out-and-back cannot move');
          return;
        }
        // ══ §CPE_AIM_PIN (Part C) — neither a handle nor the pipe. If a band is currently
        // selected, this MIGHT be a click-to-pin (confirmed on release, see h.up, only if the
        // pointer barely moved AND a real building mesh is under it). Recorded WITHOUT preventDefault
        // or stopPropagation, and WITHOUT touching `_state.drag` — OrbitControls still owns this
        // gesture exactly as it does today, so orbiting the scene with a band selected is unchanged.
        if (_state.held) {
          _state._pinCandidate = { sx0: ev.clientX, sy0: ev.clientY, b: _state.held.b };
        }
        return;
      }
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
      var d = _state.drag;
      if (d.hose) {
        // §CPE_HOSE: one op per gesture, mutated live — not one op per pointermove, which would
        // stack hundreds of ops for a single drag and make the stored path grow with the gesture
        // rather than with the edit.
        // §CPE_CLICK_SLOP (prompts/CINEMA_PATH_EDITOR.md; user 2026-07-29: "when i made a new node in
        // the pipe, it does not show up in the alt-c panel list"). §CPE_STICK's rule is one grab split
        // by what the hand does — let go without moving and you get a stick. h.up implements that
        // correctly (`if (!d.op) _spawnStick`), but this branch used to create the op on the FIRST
        // pointermove of ANY size, so the stick branch was unreachable in practice: a physical click
        // emits 1-2px of movement almost every time. The `mag < 1e-4` cancel in h.up does not catch it
        // either — at Hospital's 0.192 m/px one pixel is 0.19m, four orders of magnitude above it — so
        // the click landed as a real recorded hose pull. Confirmed in the user's console: five
        // §CPE_HOSE grab/landed pairs, zero §CPE_STICK, bands=3 unchanged throughout.
        // Below the slop the grab stays a CANDIDATE CLICK: no op, no deform, no undo entry.
        if (!d.snapped && Math.hypot(ev.clientX - d.sx0, ev.clientY - d.sy0) < CLICK_SLOP_PX) return;
        var dwh = _dragDelta(ev, d);
        d.lx = ev.clientX; d.ly = ev.clientY;
        if (!d.snapped) {
          d.snapped = true;
          _undoPush('hose at ' + (d.s * 100).toFixed(0) + '%');
          // `a` = the WORLD point on the RAW curve this pull is anchored to (see _reanchorHose).
          var _an = _state.flowRaw && _state.flowRaw[d.hit ? d.hit.i : 0];
          d.op = { s: d.s, r: _state.reach, d: { x: 0, y: 0, z: 0 },
                   a: _an ? { x: _an.x, y: _an.y, z: _an.z } : null };
          _state.hose.push(d.op);
        }
        d.op.d.x = dwh.x; d.op.d.y = dwh.y; d.op.d.z = dwh.z;
        _state.staged = false;
        _refreshFlow();          // the pipe follows the cursor; the FILM re-derives on release only
        _redrawScene();
        if (_state._replanTimer) { clearTimeout(_state._replanTimer); _state._replanTimer = null; }
        return;
      }
      var b = _state.bands[d.b];
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
    h.up = function(ev) {
      if (!_state) return;
      // §CPE_AIM_PIN: resolved independently of `_state.drag` (which stays untouched by the
      // candidate above) — a genuine click-to-pin never claimed the gesture, so it must not be
      // gated behind "was something being dragged".
      var pc = _state._pinCandidate;
      if (pc) {
        _state._pinCandidate = null;
        if (ev && Math.hypot(ev.clientX - pc.sx0, ev.clientY - pc.sy0) < CLICK_SLOP_PX) _tryPinClick(pc.b, ev);
      }
      if (!_state.drag) return;
      var d = _state.drag;
      if (d.hose) {
        _state.drag = null;
        // A press that never moved is a CLICK, and a click on the pipe drops a stick there — the
        // user's own original gesture ("clicking any point will open an aribitary '3 point band'").
        // Nothing is created by a press that also dragged: that gesture already said "bend", and
        // leaving a stick behind as well would mean one gesture doing two things.
        if (!d.op) { if (d.hit) _spawnStick(d.hit); return; }
        var mag = Math.hypot(d.op.d.x, d.op.d.y, d.op.d.z);
        if (mag < 1e-4) { _state.hose.pop(); _undo(); return; }
        console.log('§CPE_HOSE landed s=' + d.op.s.toFixed(3) + ' reach=' + d.op.r.toFixed(3) +
          ' disp=' + mag.toFixed(2) + 'm ops=' + _state.hose.length + ' (re-plan runs NOW, once)');
        _refreshFlow(); _replanFilm();
        _markPreviewStale(); _redrawScene(); _renderRows(); _renderClock(); _renderWhole(); _syncButtons();
        return;
      }
      var b = _state.bands[d.b];
      _state.drag = null;
      console.log('§CPE_DRAG landed band=' + d.b + ' zone=' + d.z + ' plane=view (re-plan runs NOW, once)' +
        ' centre=(' + b.c.x.toFixed(2) + ',' + b.c.y.toFixed(2) + ',' + b.c.z.toFixed(2) + ')' +
        ' dir=(' + b.d.x.toFixed(2) + ',' + b.d.y.toFixed(2) + ',' + b.d.z.toFixed(2) + ') len=' + b.len.toFixed(2));
      var _len0 = _state.plan ? _state.plan.pathLen : null;   // the path as it stood when you let go
      _refreshFlow();            // §CPE_HOSE: the band moved, so the curve the ops ride moved with it
      _replanFilm();
      _logDragTrack(d, b, _len0);
      _markPreviewStale();
      _redrawScene(); _renderRows(); _renderClock(); _renderWhole(); _syncButtons();
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
      // §CPE_REOPEN_DOUBLE (CINEMA_PATH_EDITOR.md — user: "it seems to dupe more bars upon alt-c
      // cancel and resume"). ADOPT the authored bands when the plan was built from them; only SEED
      // when there are none. The two functions have reciprocal fan-out — _cinemaSeedBands emits one
      // band per waypoint, _cinemaBandWaypoints emits two waypoints per band — so re-seeding an
      // authored plan's waypoints DOUBLED the count on every open (N → 2N → 4N), and any save taken
      // after a re-open stored a band list the user never authored. Cancel was never implicated: it
      // is the staged override (A._cinemaPathEdit) that feeds the doubled plan back in.
      // A derived plan carries `bands: null`, so the first open of an unauthored building still runs
      // the seeder and is byte-identical to before.
      var authored = !!(plan.bands && plan.bands.length >= 2);
      var seeded = authored ? plan.bands : a.cinemaSeedBands(plan.waypoints, plan.pathLen);
      var clone = function(bs) {
        return bs.map(function(b, i) {
          var o = { c: { x: b.c.x, y: b.c.y, z: b.c.z }, d: { x: b.d.x, y: b.d.y, z: b.d.z }, len: b.len };
          // §CPE_REOPEN_NODE: the plan now carries provenance (OK stages the override, _buildOverride
          // keeps `_stick`/`_s`), so read it. The index rule stays as the fallback for a plan that
          // predates that — same reciprocal treatment as _pathsApply.
          if (authored) {
            o._stick = b._stick != null ? !!b._stick : (i > 0 && i < bs.length - 1);
            o._s = b._s;
            // §CPE_AIM_PIN: a freshly-seeded band never has a pin (there is nothing to pin YET) —
            // only an authored reopen can carry one forward.
            o.lookAt = b.lookAt ? { x: b.lookAt.x, y: b.lookAt.y, z: b.lookAt.z } : null;
          }
          // §CPE_STICK_HOLD — the teaching default. User: "put that as default for the last stick",
          // so the beat (slow → stop → ease out while the gaze turns onto the building) shows itself
          // on first open instead of waiting to be discovered in a field nobody typed into.
          // Only on a FRESHLY SEEDED path: an authored one carries whatever the user actually set,
          // including a deliberate 0, and re-imposing the default would overwrite their edit every
          // time they re-opened the panel.
          // ⚠ CORRECTED 2026-08-02 (user): CPE_HOLD_DEFAULT_SEC is now 0 — an unset hold is no
          // hold. The seeding shape is kept (it still applies the constant to the LAST band, per
          // the 2026-08-01 exit-not-middle correction) so a future non-zero default, if ever ruled
          // again, lands in the right place — but today it seeds 0 everywhere.
          o.hold = authored ? +(b.hold || 0)
                            : ((bs.length >= 2 && i === bs.length - 1) ? CPE_HOLD_DEFAULT_SEC : 0);
          return o;
        });
      };
      _state = {
        bands: clone(seeded), origBands: clone(seeded), staged: false, undo: [], redo: [],
        held: null, drag: null, objs: [], handles: [], bars: [], pulseId: 0, flyId: 0,
        baseSec: { dive: plan.sec.dive, spin: plan.sec.spin, out: plan.sec.out, rise: plan.sec.rise },
        baseOutSec: plan.sec.out, baseTotal: ctx.durationSec, baseLen: plan.pathLen,
        speed: plan.pathLen / Math.max(0.001, plan.sec.out),   // the building's OWN pace, not a constant
        // §CPE_HOSE: ops, and the reach they are created with. 15% of the walk is the seed — a band
        // is 10% (CINEMA_BAND_FRAC), so the default hose pull is deliberately WIDER than a band:
        // the two controls should not feel like the same tool at the same scale.
        hose: [], reach: 0.15, flowRaw: null, flowFrac: null, flowHosed: null,
        // §CPE_CLIP: the whole film until marked.
        clipIn: 0, clipOut: 1,
        // §CPE_BUILDUP_DEFAULT_ON (2026-08-02, user ruling — reverses the original "off by
        // default" call below): ON by default — build-as-it-plays is the expected reading now,
        // not a deliberate opt-in. A fresh session's checkbox and _state must agree (HTML
        // `checked` attribute at the render site above) or the panel would show checked while
        // the first bake silently ran unbuilt.
        buildup: true,
        // §CPE_ROOM_TITLE: off by default, same reasoning — a captioned film is a deliberate choice
        // (RESUME_CPE_ROOM_TITLE.md).
        roomTitle: false,
        dayCounter: 'tr',        // §CPE_DAY_COUNTER_POS — the shipped position, unchanged by default
        // §CPE_PREVIEW_BUTTON: edits counts every landed change; previewedAt is the edit the user
        // has actually seen. Equal = "you have seen this version".
        edits: 0, previewedAt: 0, flying: false,
        // §CPE_SCRUB_PLAY (task #8): pause/resume state for the scrub panel's transport button.
        flyPaused: false, flyPausedU: 0, _flyPauseAt: null, _flyResume: null,
        userTotal: null, fps: ctx.fps || 15, filmPts: null, plan: plan,
        camSave: { px: a.camera.position.x, py: a.camera.position.y, pz: a.camera.position.z,
                   tx: a.controls.target.x, ty: a.controls.target.y, tz: a.controls.target.z },
        controlsWere: a.controls ? a.controls.enabled : true,
        // §CPE_VIEWFINDER: OFF by default (user, 2026-08-04: "so it is not cluttered") — see the
        // eye-icon toggle in _buildPanel. `vfCam` is created lazily on first toggle-on, not here.
        vfOn: false, vfCam: null
      };
      console.log('§CPE_OPEN src=' + (authored ? 'authored' : 'seeded') +
        ' bands=' + _state.bands.length + ' waypoints=' + (_state.bands.length * 2) +
        ' bandLen=' + _state.bands[0].len.toFixed(2) + 'm pathLen=' + plan.pathLen.toFixed(1) +
        'm speed=' + _state.speed.toFixed(2) + 'm/s total=' + ctx.durationSec.toFixed(1) + 's');

      var panel = _buildPanel();
      // §CPE_SCRUB_STANDALONE — built unconditionally alongside #cpe-panel, independent of B's
      // toggle (resolves the OPEN QUESTION the #1177 fix left open). _renderScrub() itself is
      // already invoked from every mutation path via _redrawScene() (see that function's own
      // §CPE_SCRUB comment) — nothing extra to wire for refresh, only initial build.
      _state.scrubTn = 0;
      _buildScrubPanel();
      _wireScrub(document.getElementById('cpe-scrub-track'));
      _wireScrubPlay();
      // §CPE_VIEWFINDER: the eye-icon toggle button lives in the panel's title row (_buildPanel).
      _wireViewfinderToggle();
      // §CPE_PREVIEW_DIVERGENCE: state the basis every re-plan below is pinned to, once. If a pasted
      // console ever shows the bake's §CINEMA_PIVOT disagreeing with the editor's, this line says
      // which camera the editor was planning from.
      console.log('§CPE_CAM_BASIS cam=(' + _state.camSave.px.toFixed(1) + ',' + _state.camSave.py.toFixed(1) +
        ',' + _state.camSave.pz.toFixed(1) + ') target=(' + _state.camSave.tx.toFixed(1) + ',' +
        _state.camSave.ty.toFixed(1) + ',' + _state.camSave.tz.toFixed(1) + ')' +
        ' — every re-plan uses THIS pose, not the live camera, so orbiting to look cannot change the film');
      _refreshFlow();
      _replanFilm();
      _redrawScene(); _renderRows(); _renderClock(); _renderHint(); _renderWhole(); _syncButtons();
      _wire();

      // ══ §CPE_HOSE / §CPE_CLIP / §CPE_BUILDUP / §CPE_PREVIEW_BUTTON — the whole-path controls.
      var reachEl = document.getElementById('cpe-reach');
      reachEl.value = Math.round(_state.reach * 100);
      reachEl.addEventListener('change', function() {
        var v = parseFloat(reachEl.value);
        if (!isFinite(v)) { reachEl.value = Math.round(_state.reach * 100); return; }
        _state.reach = Math.max(0.01, Math.min(1, v / 100));
        reachEl.value = Math.round(_state.reach * 100);
        // Existing ops keep the reach they were MADE with — this sets the reach of the NEXT pull.
        // Retro-fitting every op would silently rewrite edits the user already accepted.
        console.log('§CPE_HOSE reach=' + _state.reach.toFixed(2) + ' (applies to the next pull; existing ops keep theirs)');
      });
      function _markClip(which) {
        // Marked at the CENTRE of the current preview window if one is flying, else at the point the
        // camera is nearest on the film curve — so "mark in" means "here", where the user is looking,
        // with no extra gesture to learn.
        var f = _state.filmPts;
        if (!f || !f.length) return;
        var best = 0, bd = Infinity, cam = A().camera.position;
        for (var i = 0; i < f.length; i++) {
          var dd = (f[i].x - cam.x) * (f[i].x - cam.x) + (f[i].y - cam.y) * (f[i].y - cam.y) + (f[i].z - cam.z) * (f[i].z - cam.z);
          if (dd < bd) { bd = dd; best = i; }
        }
        var t = best / (f.length - 1);
        if (which === 'in') _state.clipIn = Math.min(t, _state.clipOut - 0.01);
        else _state.clipOut = Math.max(t, _state.clipIn + 0.01);
        _state.clipIn = Math.max(0, Math.min(1, _state.clipIn));
        _state.clipOut = Math.max(0, Math.min(1, _state.clipOut));
        _markPreviewStale();
        console.log('§CPE_CLIP mark=' + which + ' t=' + t.toFixed(3) + ' window=' +
          _state.clipIn.toFixed(3) + '→' + _state.clipOut.toFixed(3) +
          ' span=' + ((_state.clipOut - _state.clipIn) * 100).toFixed(0) + '% of the film');
        _redrawScene(); _renderWhole(); _syncButtons();
      }
      document.getElementById('cpe-mark-in').addEventListener('click', function() { _markClip('in'); });
      document.getElementById('cpe-mark-out').addEventListener('click', function() { _markClip('out'); });
      document.getElementById('cpe-clip-clear').addEventListener('click', function() {
        _state.clipIn = 0; _state.clipOut = 1; _markPreviewStale();
        console.log('§CPE_CLIP cleared — whole film');
        _redrawScene(); _renderWhole(); _syncButtons();
      });
      document.getElementById('cpe-buildup').addEventListener('change', function(e) {
        _state.buildup = !!e.target.checked;
        _markPreviewStale();
        // §CPE_BUILDUP_FOLLOW_TM — the reveal is the Time Machine's own timeline, unmodified. The
        // mode (S = linked schedule, T = this model's derived 4D) is decided and logged by
        // tmFollowTimeline() at preview/bake time, because it is a property of the DATA, not of
        // this checkbox.
        console.log('§CPE_BUILDUP ' + (_state.buildup ? 'ON' : 'off') +
          ' — reveal FOLLOWS the Time Machine timeline as-is (no re-key; the camera does not author the build order)');
        _renderWhole(); _syncButtons();
      });
      document.getElementById('cpe-room-title').addEventListener('change', function(e) {
        _state.roomTitle = !!e.target.checked;
        _markPreviewStale();
        console.log('§CPE_ROOM_TITLE ' + (_state.roomTitle ? 'ON' : 'off'));
        // a.friendlyName/a.getRoomGraph live in the lazy Navigate bundle — same load-on-first-use
        // as §HOVER_NAME (HOVER_NAME.md).
        var _a = A();
        if (_state.roomTitle && typeof _a.friendlyName !== 'function' && typeof _a.loadNavigate === 'function') _a.loadNavigate();
        if (!_state.roomTitle && _a.roomTitleLiveStop) _a.roomTitleLiveStop();
        _renderWhole(); _syncButtons();
      });
      // Seeded from state, not left on the markup's first <option>: a plan re-opened from
      // §CPE_IDB_PATH_STORE carries its own corner and the control must show it (the sibling
      // checkboxes do NOT do this — see §CPE_DAY_COUNTER_POS note in prompts/CINEMA_PATH_EDITOR.md).
      var dayEl = document.getElementById('cpe-day-counter');
      dayEl.value = _state.dayCounter || 'tr';
      dayEl.addEventListener('change', function(e) {
        _state.dayCounter = e.target.value || 'tr';
        _markPreviewStale();
        console.log('§CPE_DAY_COUNTER_POS ' + _state.dayCounter +
          (_state.buildup ? '' : ' — NOTE: buildup is off, so no day is being counted yet'));
        var _a2 = A();
        if (_state.dayCounter === 'off' && _a2.dayCounterLiveStop) _a2.dayCounterLiveStop();
        _renderWhole(); _syncButtons();
      });
      document.getElementById('cpe-preview').addEventListener('click', _previewFly);

      // ══ §CPE_IDB_PATH_STORE wiring ═══════════════════════════════════════════════════════════
      var selEl = document.getElementById('cpe-plans'), metaEl = document.getElementById('cpe-plan-meta');
      var _plans = [];
      function _renderPlanMeta() {
        var r = _plans[parseInt(selEl.value, 10)];
        if (!r) { metaEl.textContent = '"Save this path" names and stores a plan here'; return; }
        var m = r.meta || {};
        metaEl.textContent = (m.bands || '?') + ' bands · ' + (m.hoseOps || 0) + ' pulls · ' +
          (m.clip ? 'clip ' + Math.round(m.clip[0] * 100) + '–' + Math.round(m.clip[1] * 100) + '%' : 'whole film') +
          (m.buildup ? ' · buildup' : '') + (m.totalSec ? ' · ' + m.totalSec.toFixed(0) + 's' : '') +
          ' · ' + new Date(r.savedAt).toISOString().slice(0, 16).replace('T', ' ');
      }
      function _renderPlans() {
        return _pathsList().then(function(rows) {
          _plans = rows;
          selEl.innerHTML = rows.length
            ? rows.map(function(r, i) { return '<option value="' + i + '">' + r.name + '</option>'; }).join('')
            : '<option value="">— none yet —</option>';
          _renderPlanMeta();
        }).catch(function(e) {
          selEl.innerHTML = '<option value="">— unavailable —</option>';
          console.warn('§CPE_PATH_LIST_FAIL ' + e.message);
        });
      }
      selEl.addEventListener('change', _renderPlanMeta);
      document.getElementById('cpe-plan-open').addEventListener('click', function() {
        var r = _plans[parseInt(selEl.value, 10)];
        if (!r) { console.log('§CPE_PATH_OPEN none selected'); return; }
        _pathsApply(r);
      });
      document.getElementById('cpe-plan-del').addEventListener('click', function() {
        var r = _plans[parseInt(selEl.value, 10)];
        if (!r) return;
        _pathsDelete(r.key).then(_renderPlans);
      });
      _renderPlans();

      function finish(action) {
        var ov = (action === 'ok' || action === 'save') ? _buildOverride() : null;
        var edited = ov ? _isEdited() : false;
        _stopPulse(); _release('close'); _unwire(); _clearScene();
        if (_state._replanTimer) { clearTimeout(_state._replanTimer); _state._replanTimer = null; }
        // §CPE_VIEWFINDER: B's DOM panel and the main.js render hook must not outlive the editor —
        // an un-torn-down hook is exactly the "wired into the bake" risk the spec calls out, even
        // though the bake itself never sets or calls this function.
        _vfTeardown();
        // §CPE_SCRUB_STANDALONE: same lifecycle rule — the timeline panel is independent of B but
        // must not outlive the editor either.
        _scrubPanelTeardown();
        if (panel.parentNode) panel.parentNode.removeChild(panel);
        var total = ov ? ov._total : _state.baseTotal;
        if (a.controls) a.controls.enabled = _state.controlsWere;
        a.camera.position.set(_state.camSave.px, _state.camSave.py, _state.camSave.pz);
        a.controls.target.set(_state.camSave.tx, _state.camSave.ty, _state.camSave.tz);
        a.controls.update();
        if (a.markDirty) a.markDirty();
        console.log('§CPE_CLOSE action=' + action + ' edited=' + edited + ' total=' + total.toFixed(1) + 's');
        // §CPE_REOPEN_NODE (user: "i can hardly pick out the extra node without been listed") — an
        // edited OK STAGES the path, so the next Alt+C re-opens what was authored instead of
        // re-seeding the derived three. Before this line the override was handed to the bake
        // (cinema_maxq.js:624) and then dropped: the next open planned with no override at all
        // (:494 -> effects.js:6466 -> A._cinemaPathEdit === null -> plan.bands === null), `authored`
        // was false, and the user's stick was GONE — the list was not hiding it, it no longer
        // existed. Guardrail 2 is why this is gated on `edited`: an untouched OK must stage nothing
        // and stay byte-identical. Cancel stages nothing. In-memory only — the cinema_path TABLE is
        // still written solely by Ctrl+S Save Building.
        if (edited && action === 'ok' && typeof a.stageCinemaPath === 'function') {
          a.stageCinemaPath(ov);
          console.log('§CPE_OK_STAGED bands=' + ov.bands.length +
            ' sticks=' + ov.bands.filter(function(b) { return b._stick; }).length +
            ' — the next Alt+C re-opens THIS path (src=authored), not the derived seed');
        }
        _state = null;
        // Guardrail 2: an untouched OK hands back NO override, so the bake re-uses the derived plan
        // object verbatim. "One click costs nothing" is enforced here, not merely intended.
        resolve({ action: action === 'cancel' ? 'cancel' : 'ok', override: edited ? ov : null,
                  saved: action === 'save', durationSec: edited ? total : ctx.durationSec });
      }

      document.getElementById('cpe-ok').addEventListener('click', function() { finish('ok'); });
      document.getElementById('cpe-cancel').addEventListener('click', function() { finish('cancel'); });
      document.getElementById('cpe-save').addEventListener('click', function() {
        // §CPE_IDB_PATH_STORE: BOTH stores, one click. The DB staging is unchanged — that is what
        // makes the plan travel with the .db when the user saves it to disk. The IndexedDB record is
        // the named, browsable copy, and the one that survives a read-only building.
        if (typeof a.stageCinemaPath === 'function') a.stageCinemaPath(_buildOverride());
        _state.staged = true;
        _syncButtons();   // staging is not closing — keep editing
        var suggested = 'plan ' + new Date().toISOString().slice(5, 16).replace('T', ' ');
        var name = window.prompt('Name this path (saved for ' + _bldKey() + ')', suggested);
        if (name === null) {                       // cancelled: the DB staging above still stands
          console.log('§CPE_PATH_SAVE_CANCELLED — staged to the building DB, not named in IndexedDB');
          return;
        }
        name = (name || suggested).trim() || suggested;
        _pathsSave(name).then(_renderPlans).catch(function(e) {
          console.warn('§CPE_PATH_SAVE_FAIL ' + e.message + ' — the DB staging above is unaffected');
        });
      });
    });
  }

  var _attach = setInterval(function() {
    // `_probePipe` is a READ-ONLY whitebox hook for witnesses (§CPE_CLICK_SLOP's W-CLICK-STICK): it
    // answers "does this screen pixel land on the fat walk pipe?" using the editor's OWN hit test, so
    // a witness never guesses a coordinate or asserts against a re-implementation. Same precedent as
    // effects.js's `A.cinemaPathPlanDerived`. It mutates nothing and is not part of the UI.
    if (window.APP) {
      window.APP.cinemaPathEditor = {
        open: open, version: CPE_V,
        // §DLOD_VF_CAMGUARD (2026-08-05, cross-session finding — see 4D_SCHEDULE_PERFECTION.md and
        // this file's own SESSION HANDOFF): time_machine.js's buildup-visibility DLOD gate was
        // hardcoded to the main camera even while the POV panel scrubs `vfCam` independently. This
        // is the clean read surface for that fix — returns the live POV camera object ONLY while
        // the viewfinder is actually on, else null, so a caller elsewhere never needs to know about
        // `_state` at all.
        activePOVCamera: function() { return (_state && _state.vfOn && _state.vfCam) ? _state.vfCam : null; },
        // §CPE_STICK_HOLD — the teaching default, exposed so the witness asserts against the
        // constant the seeding actually uses rather than a copy of the number (G-SH-7).
        holdDefaultSec: CPE_HOLD_DEFAULT_SEC,
        // The hold each band would be seeded with on a fresh open, so the "last stick only" rule is
        // checkable without driving the panel UI.
        _seedHolds: function(n) {
          var o = [];
          for (var i = 0; i < n; i++) o.push((n >= 2 && i === n - 1) ? CPE_HOLD_DEFAULT_SEC : 0);
          return o;
        },
        _probePipe: function(clientX, clientY) {
          if (!_state) return null;
          var h = _hitTestPath({ clientX: clientX, clientY: clientY });
          return h ? { s: h.s, i: h.i } : null;
        },
        // The screen pixel of a point at `frac` along the WALK, through the editor's own projection.
        // A witness sweeping the canvas for the pipe is a lottery on a small building (measured: a
        // 42px grid missed Duplex's walk entirely); this hands it the answer the hit test would give.
        _pipePixel: function(frac) {
          if (!_state || !_state.flowHosed || _state.flowHosed.length < 2) return null;
          var pts = _state.flowHosed;
          var i = Math.max(0, Math.min(pts.length - 1, Math.round((frac || 0.5) * (pts.length - 1))));
          var s = _screenOf(pts[i]);
          return s.behind ? null : { x: Math.round(s.x), y: Math.round(s.y), i: i };
        },
        // §CPE_REOPEN_NODE's G-RN-4. Colour is geometry state, not a look — so it is asserted off the
        // REAL handle meshes the scene is drawing (CLAUDE.md FUNDAMENTAL LAW: numbers, never a
        // screenshot). Read-only, mutates nothing, same precedent as _probePipe.
        _probeHandles: function() {
          if (!_state) return null;
          return _state.handles.map(function(h) {
            var s = _screenOf(h.p);
            return { b: h.b, z: h.z, stick: !!h.stick,
                     x: h.p.x, y: h.p.y, z3: h.p.z,
                     hex: '0x' + (h.mesh && h.mesh.material ? h.mesh.material.color.getHex() : h.col)
                            .toString(16).padStart(6, '0'),
                     px: s.behind ? null : Math.round(s.x), py: s.behind ? null : Math.round(s.y) };
          });
        },
        // §CPE_HOSE_LENGTH_BLIND's G-HL gates. Read-only: `_probeLengths` measures the two curves and
        // reports what the clock actually costed; `_probeOverride` hands the witness the SAME object
        // the bake receives, so the witness can plan it itself rather than take the editor's word for
        // what the bake would measure (the module must not grade its own homework here — the whole
        // defect was two functions disagreeing about which curve is real).
        _probeLengths: function() {
          if (!_state) return null;
          var raw = _flowRaw(), hosed = _flowHosed(raw), len = function(p) {
            var L = 0; for (var i = 1; i < p.length; i++)
              L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y, p[i].z - p[i - 1].z);
            return L;
          };
          return { raw: len(raw), hosed: len(hosed), natural: _naturalDuration().len,
                   ops: _state.hose.length, total: _naturalDuration().total,
                   speed: _state.speed, baseTotal: _state.baseTotal, baseOutSec: _state.baseOutSec };
        },
        _probeOverride: function() { return _state ? _buildOverride() : null; },
        // §CPE_STICK_RED_BAR's G-RN-4c: the BAR is a separate mesh from the handles, so it needs its
        // own read-only probe or "red bar, blue dots" is asserted on half the evidence.
        _probeBars: function() {
          if (!_state) return null;
          return _state.bars.map(function(r) {
            return { b: r.b, stick: !!r.stick,
                     hex: '0x' + r.mesh.material.color.getHex().toString(16).padStart(6, '0') };
          });
        },
        // ══ §CPE_SCRUB witness hooks. Read-only where possible; `_scrubTo` IS the real drag
        // handler's own function (a witness exercises the product path, not a re-implementation) —
        // simplified 2026-08-04 (caught live in the browser, then simplified further rather than
        // fixed in place — see `_scrubTo`'s own comment): it is VISUAL-ONLY now, touching no camera
        // at all, main or B's. `_probeVF().mainPose`/`mainTarget` below is the ground truth for
        // proving the main camera stays untouched across a scrub drag.
        _scrubTo: function(tn) { return _scrubTo(tn); },
        // G-VF-1's witness hook: the real rehearsal-only pose function `_previewFly()`'s step() uses
        // — the ONE remaining caller of `_applyCameraPose` after the 2026-08-04 scrub correction.
        // Exposed the same way `_scrubTo` is (the real internal function, not a re-implementation),
        // so G-VF-1 can prove B tracks the main camera during a REHEARSAL-style pose application
        // without needing to run and wait out a full real Preview flight.
        _applyCameraPoseForTest: function(tn) { return _applyCameraPose(tn); },
        _bandTNorm: function(bi) { return _state ? _bandTNorm(bi) : null; },
        // §CPE_SCRUB_PLAY (task #8) witness hooks — real pause/resume, not a re-implementation.
        _flyPause: function() { return _state && _state._flyPauseAt ? (_state._flyPauseAt(), true) : false; },
        _flyResume: function() { return _state && _state._flyResume ? (_state._flyResume(), true) : false; },
        // `hasHooks` — true only once startFly() has actually run (myFly/t0 established, so
        // _flyPauseAt/_flyResume are real, not a stale reference). `flying` alone goes true at
        // the TOP of _previewFly(), before the buildup async arm even starts — pausing before
        // hasHooks is true would call a not-yet-existent hook.
        _flyState: function() { return _state ? { flying: _state.flying, paused: _state.flyPaused, u: _state.flyPausedU, hasHooks: !!_state._flyPauseAt } : null; },
        // Ground truth for G-SCRUB-1/G-VF-1 — the SAME `_state.plan.poseAt` every render (tube,
        // scrub, B) samples, called directly and read-only (mutates nothing), same precedent as
        // `_probeOverride`/`_probeLengths` above.
        _probePoseAt: function(tn) { return (_state && _state.plan) ? _state.plan.poseAt(tn) : null; },
        _probeScrub: function() {
          if (!_state) return null;
          return {
            scrubTn: _state.scrubTn, walkWindow: _walkWindow(),
            sticks: _state.bands.map(function(b, i) { return b._stick ? { i: i, tNorm: _bandTNorm(i) } : null; })
                      .filter(function(x) { return x; }),
            clipIn: _state.clipIn, clipOut: _state.clipOut
          };
        },
        // ══ §CPE_VIEWFINDER witness hooks — G-VF-1/2, G-PERF-1.
        _vfToggle: function() { var btn = document.getElementById('cpe-vf-toggle'); _toggleViewfinder(btn); return _state ? _state.vfOn : null; },
        _vfPerf: function() { return { n: _vfPerf.n, avgMs: _vfPerf.n ? _vfPerf.sum / _vfPerf.n : 0, maxMs: _vfPerf.max }; },
        _probeVF: function() {
          var a = A();
          if (!_state) return null;
          var panel = document.getElementById('cpe-vf-panel');
          var r = panel ? panel.getBoundingClientRect() : null;
          return {
            on: !!_state.vfOn,
            hookInstalled: a._cpeViewfinderRender === _vfRender,
            camPose: _state.vfCam ? { x: _state.vfCam.position.x, y: _state.vfCam.position.y, z: _state.vfCam.position.z } : null,
            mainPose: { x: a.camera.position.x, y: a.camera.position.y, z: a.camera.position.z },
            // §CPE_SCRUB correction ground truth: the main canvas's ORBIT TARGET, not just its
            // position — a scrub-caused main-camera move could show up as a target drift alone
            // (e.g. controls.update() re-deriving something) even with position untouched.
            mainTarget: { x: a.controls.target.x, y: a.controls.target.y, z: a.controls.target.z },
            rect: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null,
            tmCursorReadout: document.getElementById('cpe-vf-clock') ? document.getElementById('cpe-vf-clock').textContent : null
          };
        },
        // ══ §CPE_AIM_PIN witness hooks — G-PIN-1. `_setPin`/`_unpinBand` drive the REAL mutation
        // function a canvas click resolves to (the raycast itself is UI-only and not what G-PIN-1 is
        // about) — deterministic against a known world point, same precedent as `_scrubTo`.
        _setPin: function(bi, p) { return _setPin(bi, p, 'src=witness'); },
        _unpinBand: function(bi) { return _unpinBand(bi); },
        // §CPE_SCRUB_BEARING witness hook — the real selection entry point both the canvas and the
        // row list already call, not a re-implementation.
        _holdForTest: function(bi, zone) { return _hold(bi, zone, false); },
        // Deterministic spawn for buildings whose seeded path has no middle sticks — calls the real
        // `_spawnStick` mutation with a hit built from the walk's own arc-fraction array, same
        // precedent as `_setPin` bypassing the UI raycast for a known input.
        _spawnStickForTest: function(frac) {
          if (!_state || !_state.flowRaw || !_state.flowFrac) return false;
          var idx = Math.max(0, Math.min(_state.flowFrac.length - 1, Math.round(_state.flowFrac.length * frac)));
          return _spawnStick({ i: idx, s: _state.flowFrac[idx] });
        }
      };
      clearInterval(_attach);
    }
  }, 500);
})();
