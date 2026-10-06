// effects family — part `cinema_orbit` (original effects.js lines 10600–11142).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/effects.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as FXS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__effectsParts = (typeof window !== 'undefined' ? window : globalThis).__effectsParts || {};
(typeof window !== 'undefined' ? window : globalThis).__effectsParts.cinema_orbit = function* __split_effects_cinema_orbit(FXS, A, renderer, scene, camera) {
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  FXS._civilTopoutU = _civilTopoutU;
  FXS._civilFilmOv = _civilFilmOv;
  Object.defineProperty(FXS, 'CIVIL_DIVE_MAX_M', { get: function () { return CIVIL_DIVE_MAX_M; }, set: function (v) { CIVIL_DIVE_MAX_M = v; }, enumerable: true });
  Object.defineProperty(FXS, 'CIVIL_FILM_SPEED', { get: function () { return CIVIL_FILM_SPEED; }, set: function (v) { CIVIL_FILM_SPEED = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order

  function _cpeGet(name) {
    return name === 'CINEMA_DIVE_SEC' ? FXS.CINEMA_DIVE_SEC : name === 'CINEMA_SPIN_SEC' ? FXS.CINEMA_SPIN_SEC :
           name === 'CINEMA_OUT_SEC' ? FXS.CINEMA_OUT_SEC : name === 'CINEMA_RISE_SEC' ? FXS.CINEMA_RISE_SEC :
           name === 'CINEMA_EYE_M' ? FXS.CINEMA_EYE_M : FXS.CINEMA_LOOKDOWN_DEG;
  }
  // ── §CINEMA_PATH_EDITOR persistence, read side. Restored LAZILY at first plan rather than at load:
  // the plan is the only consumer, so there is no window in which a stored path could be missed, and
  // it needs no hook in the load path at all. (This is deliberately NOT the staffage bug the spec
  // lists — staffage restores on first Alt+P, which is a *user action* and therefore genuinely too
  // late; a plan-time restore happens before the first thing that could observe it.)
  var _cpeLoaded = false;
  function _cpeLoadFromDb() {
    if (_cpeLoaded) return;
    _cpeLoaded = true;
    try {
      if (!A.dbQuery) return;
      var has = A.dbQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='cinema_path'");
      if (!has || !has.length) { console.log('§CINEMA_PATH_RESTORE none (no cinema_path table) — derived path'); return; }
      // §CPE_STICK_HOLD: hold_sec was appended after §CPE_PATH_NOT_PORTABLE shipped, so a .db saved
      // by an older build simply does not have the column and SELECTing it would throw — taking the
      // WHOLE path down over an optional field. Probe the table's own columns first and only ask for
      // what is there. Missing column == every hold 0, which is the documented default anyway.
      // §CPE_FLAGS_PORTABLE (2026-09-04): buildup/room_title/reveal/day_counter were appended after
      // hold_sec, so the same one-probe-per-optional-column rule applies — a .db written by any
      // earlier build simply has neither, and asking for them would take the WHOLE path down over
      // fields whose absence has a documented default (every flag off, dayCounter unset).
      // §CPE_FLAGS_PORTABLE_2 (2026-09-14): clash/measure/storey_reveal were appended after
      // day_counter, so they get their own probe — a .db written between the two revisions has the
      // first four flags and not these three, and must still open.
      var _hasHold = false, _hasFlags = false, _hasFlags2 = false, _hasFlags3 = false;
      try {
        var ti = A.dbQuery("PRAGMA table_info(cinema_path)");
        for (var _ti = 0; _ti < (ti || []).length; _ti++) {
          if (ti[_ti][1] === 'hold_sec') _hasHold = true;
          if (ti[_ti][1] === 'buildup') _hasFlags = true;
          if (ti[_ti][1] === 'storey_reveal') _hasFlags2 = true;
          if (ti[_ti][1] === 'film_bounce') _hasFlags3 = true;   // §CPE_CHECKBOX_SAVE — all 8 appended together
        }
      } catch (eTi) {}
      var rows = A.dbQuery("SELECT seq,ifc_x,ifc_y,ifc_z,dir_x,dir_y,dir_z,len," +
        "total_sec,dive_sec,spin_sec,out_sec,rise_sec," +
        (_hasHold ? "hold_sec" : "0 AS hold_sec") + "," +
        (_hasFlags ? "buildup,room_title,reveal,day_counter"
                   : "0 AS buildup,0 AS room_title,0 AS reveal,NULL AS day_counter") + "," +
        (_hasFlags2 ? "clash,measure,storey_reveal"
                    : "NULL AS clash,NULL AS measure,NULL AS storey_reveal") + "," +
        (_hasFlags3 ? "load_path,visual_panel,audio_panel,escape_route,sun_compass,sun_date,bake_res,film_bounce"
                    : "NULL AS load_path,NULL AS visual_panel,NULL AS audio_panel,NULL AS escape_route,NULL AS sun_compass,NULL AS sun_date,NULL AS bake_res,NULL AS film_bounce") +
        " FROM cinema_path ORDER BY seq");
      if (!rows || rows.length < 2) { console.log('§CINEMA_PATH_RESTORE none (0 rows) — derived path'); return; }
      // §CPE_BANDS: rebuilt as bands, so the rigid-straight invariant is restored with the data
      // rather than re-imposed by convention.
      var bands = rows.map(function(r) {
        var p = A.ifc2three(r[1], r[2], r[3]);
        var d = A.ifc2threeDir(r[4], r[5], r[6]);
        var L = Math.hypot(d.x, d.y, d.z) || 1;
        return { c: { x: p.x, y: p.y, z: p.z }, d: { x: d.x / L, y: d.y / L, z: d.z / L }, len: r[7],
                 hold: +(r[13] || 0) };
      });
      A._cinemaPathEdit = { bands: bands, diveSec: rows[0][9], spinSec: rows[0][10],
                            outSec: rows[0][11], riseSec: rows[0][12], _total: rows[0][8] };
      // §CPE_FLAGS_PORTABLE — constant across rows by construction (written from one override), so
      // row 0 is the value, exactly as the beat seconds above are read. Only SET when the columns
      // are actually there: an older .db must keep the pre-existing behaviour of leaving these
      // undefined, so whatever default the consumer already applies still applies.
      if (_hasFlags) {
        A._cinemaPathEdit.buildup = !!rows[0][14];
        A._cinemaPathEdit.roomTitle = !!rows[0][15];
        A._cinemaPathEdit.reveal = !!rows[0][16];
        if (rows[0][17] != null && rows[0][17] !== '') A._cinemaPathEdit.dayCounter = String(rows[0][17]);
      }
      // §CPE_FLAGS_PORTABLE_2 — NULL means "this .db predates the columns", which is not the same as
      // "off": leave them undefined so the consumer's existing default still applies, exactly as
      // §CPE_FLAGS_PORTABLE does for an older file.
      if (_hasFlags2) {
        if (rows[0][18] != null) A._cinemaPathEdit.clash = !!rows[0][18];
        if (rows[0][19] != null) A._cinemaPathEdit.measure = !!rows[0][19];
        if (rows[0][20] != null) A._cinemaPathEdit.storeyReveal = !!rows[0][20];
      }
      // §CPE_CHECKBOX_SAVE — NULL (column absent) leaves the key UNDEFINED, so loadPath still falls back to Measure
      // (cinema_maxq.js `_loadPath`) and the others to their off defaults, exactly as for a pre-column .db.
      if (_hasFlags3) {
        var _c3 = A._cinemaPathEdit, _r0 = rows[0];
        if (_r0[21] != null) _c3.loadPath = !!_r0[21];
        if (_r0[22] != null) _c3.visualPanel = !!_r0[22];
        if (_r0[23] != null) _c3.audioPanel = !!_r0[23];
        if (_r0[24] != null) _c3.escapeRoute = !!_r0[24];
        if (_r0[25] != null) _c3.sunCompass = !!_r0[25];
        if (_r0[26] != null && _r0[26] !== '') _c3.sunDate = String(_r0[26]);
        if (_r0[27] != null && _r0[27] !== '') _c3.bakeRes = String(_r0[27]);
        if (_r0[28] != null) _c3.filmBounce = !!_r0[28];
      }
      if (_hasFlags3) console.log('§CPE_FLAGS_RESTORE3 loadPath=' + (A._cinemaPathEdit.loadPath === undefined ? '-' : (A._cinemaPathEdit.loadPath ? 1 : 0)) +
        ' visualPanel=' + (A._cinemaPathEdit.visualPanel ? 1 : 0) + ' audioPanel=' + (A._cinemaPathEdit.audioPanel ? 1 : 0) +
        ' escapeRoute=' + (A._cinemaPathEdit.escapeRoute ? 1 : 0) + ' sunCompass=' + (A._cinemaPathEdit.sunCompass ? 1 : 0) +
        ' sunDate=' + (A._cinemaPathEdit.sunDate || '-') + ' bakeRes=' + (A._cinemaPathEdit.bakeRes || '-') +
        ' filmBounce=' + (A._cinemaPathEdit.filmBounce === undefined ? '-' : (A._cinemaPathEdit.filmBounce ? 1 : 0)) + ' (§CPE_CHECKBOX_SAVE)');
      console.log('§CPE_FLAGS_RESTORE hasFlags=' + (_hasFlags ? 1 : 0) + ' hasFlags2=' + (_hasFlags2 ? 1 : 0) +
        ' buildup=' + (A._cinemaPathEdit.buildup === undefined ? '-' : (A._cinemaPathEdit.buildup ? 1 : 0)) +
        ' roomTitle=' + (A._cinemaPathEdit.roomTitle === undefined ? '-' : (A._cinemaPathEdit.roomTitle ? 1 : 0)) +
        ' reveal=' + (A._cinemaPathEdit.reveal === undefined ? '-' : (A._cinemaPathEdit.reveal ? 1 : 0)) +
        ' clash=' + (A._cinemaPathEdit.clash === undefined ? '-' : (A._cinemaPathEdit.clash ? 1 : 0)) +
        ' measure=' + (A._cinemaPathEdit.measure === undefined ? '-' : (A._cinemaPathEdit.measure ? 1 : 0)) +
        ' storeyReveal=' + (A._cinemaPathEdit.storeyReveal === undefined ? '-' : (A._cinemaPathEdit.storeyReveal ? 1 : 0)) +
        " (§CPE_FLAGS_PORTABLE_2 — '-' means the column is absent in this .db, so the consumer default applies)");
      console.log('§CINEMA_PATH_RESTORE bands=' + bands.length + ' total=' + rows[0][8].toFixed(1) +
        's holdCol=' + _hasHold + ' holds=' + bands.filter(function(b) { return b.hold > 0.01; }).length +
        ' flagCol=' + _hasFlags +
        (_hasFlags ? ' buildup=' + (rows[0][14] ? 1 : 0) + ' roomTitle=' + (rows[0][15] ? 1 : 0) +
                     ' reveal=' + (rows[0][16] ? 1 : 0) + ' dayCounter=' + (rows[0][17] || 'unset')
                   : ' — §CPE_FLAGS_PORTABLE: this .db predates the flag columns, so every film flag' +
                     ' stays at its consumer default (all off); the path itself is unaffected') +
        ' — authored path in force');
    } catch (e) { console.warn('§CINEMA_PATH_RESTORE_FAIL ' + e.message); }
  }
  // Staged by the editor's "Save this path"; read by scene.js `_writeCinemaPathTable` at export.
  A.stageCinemaPath = function(ov) {
    A._cinemaPathEdit = ov;
    // Same stale-field species as §CPE_OK_CRASH (cinema_maxq.js:507), caught while answering the
    // user's "how do I open a saved path?": §CPE_BANDS made the override carry `bands`, so this line
    // printed a flat `waypoints=0` for every save — guarded, so it never threw, and therefore never
    // got noticed. A log that lies about the thing it is reporting is worse than no log.
    console.log('§CINEMA_PATH_STAGE bands=' + (ov && ov.bands ? ov.bands.length : 0) +
      ' waypoints=' + (ov && ov.bands ? ov.bands.length * 2 : (ov && ov.waypoints ? ov.waypoints.length : 0)) +
      ' total=' + (ov && ov._total ? ov._total.toFixed(1) : '?') + 's' +
      ' — STAGED ONLY; Ctrl+S (Save Building) writes the cinema_path table into the .db');
  };
  A._getCinemaPathEdit = function() { return A._cinemaPathEdit || null; };
  A.clearCinemaPath = function() { A._cinemaPathEdit = null; console.log('§CINEMA_PATH_CLEAR authored path dropped'); };

  // ══ §CPE_PREVIEW_DIVERGENCE (CINEMA_PATH_EDITOR.md) — the plan reads A.camera.position and
  // A.controls.target directly, so it silently depends on WHERE THE USER IS LOOKING FROM at the
  // moment it is called. Measured live (user, Hospital, 2026-07-27): while editing, the orbited-in
  // camera gave targetOffCam=16.7 — under envelope*0.25=36.9, so §CINEMA_PIVOT stayed
  // `arc-bbox-centre` (dive 14.2m, spin 0.0deg). On OK the editor restores the camera it captured at
  // open, targetOffCam became 54.0 — over the threshold, so the SAME building planned
  // `controls-target(plausible)` at the origin: dive 77.2m, spin 118.1deg, facingDot 0.980 -> -0.471.
  // The user previewed a film with no spin and baked one that turns 118 degrees at the start.
  // FIX: an explicit camera basis. Same "set, call the untouched plan, restore in finally" pattern
  // the beat-second overrides above already use — the plan function itself stays untouched.
  // Nothing here moves the camera as far as any renderer is concerned: the swap and the restore
  // happen inside one synchronous call with no frame in between.
  // §CPE_BASIS_HALF_PIN (user's Hospital console, 2026-07-27 — "drag still jumps"). This pinned the
  // camera's POSITION and the orbit TARGET but never re-aimed the camera, and yaw0/pitch0 are read
  // from A.camera.getWorldDirection() — the camera's ROTATION, which this left untouched. So every
  // editor re-plan ran with the pinned position and whatever rotation the user had orbited to,
  // while the bake (finish() sets position + target + controls.update(), which DOES re-aim) ran
  // with the real basis. MEASURED in their log, same session, same edit:
  //     editing: yaw0=-88.9 pitch0=-16.9  exit facingDot=+0.456  spin -35.3 deg
  //     baking : yaw0=+91.5 pitch0=-81.0  exit facingDot=-0.450  spin 504.3 deg class=behind(full-lap)
  // A DIFFERENT exit door and a full extra lap of spin — the film they authored was not the film
  // that baked, which is the very thing §CPE_PREVIEW_DIVERGENCE was supposed to have closed. It was
  // only half closed: half a pin is not a pin.
  function _withCamBasis(basis, fn) {
    if (!basis) return fn();
    var c = A.camera, t = A.controls.target;
    var sp = { x: c.position.x, y: c.position.y, z: c.position.z };
    var st = { x: t.x, y: t.y, z: t.z };
    var sq = c.quaternion.clone();
    c.position.set(basis.px, basis.py, basis.pz);
    t.set(basis.tx, basis.ty, basis.tz);
    // The half that was missing: re-aim at the pinned target so getWorldDirection() reports the
    // basis being pinned, not the live orbit. updateMatrixWorld because the plan reads world state
    // within this same task, before any render tick would have refreshed it.
    c.lookAt(basis.tx, basis.ty, basis.tz);
    c.updateMatrixWorld(true);
    try { return fn(); }
    finally {
      c.position.set(sp.x, sp.y, sp.z); t.set(st.x, st.y, st.z);
      c.quaternion.copy(sq); c.updateMatrixWorld(true);
    }
  }

  // §CPE_REPLAN_LAZY — the "re-derive entry" control (the spec's own ask: re-deriving the entry is
  // a real thing the user may WANT — a different room to dive into, a different exit door — it just
  // must not happen eight times by accident while dragging a stick).
  A.cinemaPrefixInvalidate = function(reason) {
    FXS._cinemaPrefixCache = null;
    console.log('§CPE_REPLAN_LAZY invalidated reason=' + (reason || 'manual'));
  };

  // ══ §FLYAROUND_ARC (bim-compiler prompts/ALTC_FOUNDATION.md §1 SPEC 2026-10-04) — an ad-hoc slow fly-around between two
  // camera poses A and B (three.js world, as viewer/share.js writes cam=/tgt=) around their targets, for a film with no beats.
  // Built HERE so the bake and the CLI pose check (both call A.cinemaPathPlan) fly and verify the same poseAt.
  function _arcPlan(durationSec, arc) {
    var V = function (p) { return { x: +p[0], y: +p[1], z: +p[2] }; };
    var cA = V(arc.a.cam), tA = V(arc.a.tgt), cB = V(arc.b.cam), tB = V(arc.b.tgt);
    var cyl = function (c, t) { var dx = c.x - t.x, dz = c.z - t.z; return { r: Math.hypot(dx, dz), h: c.y - t.y, az: Math.atan2(dz, dx) }; };
    var PA = cyl(cA, tA), PB = cyl(cB, tB), TAU = Math.PI * 2;
    var d = PB.az - PA.az; d = ((d % TAU) + TAU) % TAU;                      // 0..2pi, counter-clockwise from A to B
    if (arc.dir === 'cw' || (arc.dir !== 'ccw' && d > Math.PI)) d -= TAU;    // 'short' (default) = the smaller signed angle
    var sg = d < 0 ? -1 : 1, ov = (isFinite(arc.overshootDeg) ? +arc.overshootDeg : 15) * Math.PI / 180;
    var az0 = PA.az - sg * ov, az1 = PA.az + d + sg * ov, L = function (a, b, s) { return a + (b - a) * s; };
    function at(t) {
      var u = (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2, az = L(az0, az1, u);
      var s = d === 0 ? 0 : Math.max(0, Math.min(1, (az - PA.az) / d));
      var tx = L(tA.x, tB.x, s), ty = L(tA.y, tB.y, s), tz = L(tA.z, tB.z, s), r = L(PA.r, PB.r, s), h = L(PA.h, PB.h, s);
      return { x: tx + r * Math.cos(az), y: ty + h, z: tz + r * Math.sin(az), tx: tx, ty: ty, tz: tz };
    }
    var sweep = Math.abs(az1 - az0), uA = ov / sweep, uB = 1 - uA, tOf = function (u) { return Math.acos(1 - 2 * u) / Math.PI; };
    var pA = at(tOf(uA)), pB = at(tOf(uB)), err = function (p, c) { return Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z); };
    var eA = err(pA, cA), eB = err(pB, cB), n = Math.max(2, Math.round(durationSec * 24)), step = 0, q = at(0);
    for (var i = 1; i < n; i++) { var p2 = at(i / (n - 1)); step = Math.max(step, err(p2, q)); q = p2; }
    console.log('§FLYAROUND_ARC azA=' + (PA.az * 180 / Math.PI).toFixed(1) + ' azB=' + (PB.az * 180 / Math.PI).toFixed(1) + ' sweepDeg=' + (sweep * 180 / Math.PI).toFixed(1) +
      ' dir=' + (sg < 0 ? 'cw' : 'ccw') + ' rA=' + PA.r.toFixed(2) + ' rB=' + PB.r.toFixed(2) + ' hA=' + PA.h.toFixed(2) + ' hB=' + PB.h.toFixed(2) +
      ' sec=' + durationSec.toFixed(1) + ' errA=' + eA.toFixed(4) + 'm errB=' + eB.toFixed(4) + 'm maxStep24fps=' + step.toFixed(3) + 'm => ' + (eA < 0.01 && eB < 0.01 ? 'PASS' : 'FAIL'));
    // naturalTotal = arc.sec: cinema_maxq.js's override probe adopts it as the film length (an explicit --frames still wins there)
    return { poseAt: at, durationSec: durationSec, naturalTotal: (isFinite(arc.sec) && arc.sec > 0) ? +arc.sec : durationSec, arc: true,
             beats: { dive: 0, spin: 0, out: 0, pullout: 0, flyback: 0, reveal: 0, rise: 0 },
             reveal: { discs: [], pulloutSec: 0, roundSec: 0, tailSec: 0, riseSec: 0, qtyCost: {} },
             storeyReveal: { on: false, windowFrac: 0 }, sec: {}, waypoints: [], pathLen: 0 };
  }
  // §ALTC_HIGHWAY route: a civil model with no authored/stored path gets the ROAD as its waypoints (tour.js A.civilRoutePath —
  // the same smoothed route Fly flies): Beats 1-2 settle on its first point, the walk-out drives it, the last point is the
  // orbit's elastic control point. Paced like Fly (25 m/s) via _walkMps/_pullMps in the plan. Without it the plan dives to the bbox centre of a
  // 2 km road and exits through a "facade" (effects.js §CINEMA_SPACE fallback) — no road at all. Explicit null (G5 control)
  // and any authored edit still win; buildings return null here → derived plan unchanged.
  // §ALTC_ONEWAY (CIVIL_HIGHWAY_JELAPANG.md 2g): 25 → 35 m/s so the road film lands under 3 min (bake under ~3 h at the measured
  // 2-3 s/frame). The noise law (CINEMA_PACE_SWING) still slows busy stretches — quiet straights cruise, junctions ease.
  var CIVIL_DIVE_MAX_M = 280;   // presentation: §ALTC_V3 road approach budget (280 m @ 35 m/s = 8 s)
  var CIVIL_FILM_SPEED = 35;   // presentation: m/s along the road (the Fly tour keeps its own 25, tour.js SPEED)
  // §ALTC_V2 V5: the road build-up tops out by the drive's midpoint AND before the film's half-way point (user 2026-10-05:
  // "buildup finishes early before half way point.. the rest is discipline reveal") — whichever comes first, never before
  // the drive starts. CIVIL_TOPOUT_MAX_U = the film's half-way point.
  var CIVIL_TOPOUT_MAX_U = 0.5;
  function _civilTopoutU(tS, tO) {
    var mid = (tS + tO) / 2;
    return (mid > CIVIL_TOPOUT_MAX_U && tS < CIVIL_TOPOUT_MAX_U) ? CIVIL_TOPOUT_MAX_U : mid;
  }
  function _civilFilmOv() {
    if (!(A.isCivilModel && A.isCivilModel()) || typeof A.civilRoutePath !== 'function') return null;
    if (A._civilFilmOvDb === A.db) return A._civilFilmOvC;   // route is per model — the plan is re-asked many times
    A._civilFilmOvDb = A.db; A._civilFilmOvC = null;
    var R = null; try { R = A.civilRoutePath(); } catch (e) { console.warn('§ALTC_HIGHWAY route failed: ' + e.message); }
    if (!R || !R.path || R.path.length < 2) { console.log('§ALTC_HIGHWAY VACUOUS — civil model but no route'); return null; }
    console.log('§ALTC_HIGHWAY route=' + R.src + ' waypoints=' + R.path.length + ' lenM=' + R.lenM.toFixed(0) +
      ' paceMps=' + CIVIL_FILM_SPEED + ' junctions=' + R.stops.length);
    // §ALTC_V2 V1: drive TOWARDS the junction with the most signal heads, so the film's only orbit (V4) closes on it.
    var _big = null; (R.stops || []).forEach(function(j) { if (!_big || j.n > _big.n) _big = j; });
    var _rev = !!(_big && _big.at < (R.path.length - 1) / 2);
    var _pts = R.path.map(function(p) { return { x: p.x, y: p.y, z: p.z }; });
    if (_rev) _pts.reverse();
    console.log('§ALTC_V2 seed reversed=' + _rev + ' bigJunction heads=' + (_big ? _big.n : 0) + ' at=' + (_big ? _big.at : -1) + ' of ' + R.path.length);
    A._civilFilmOvC = { waypoints: _pts,
      junctions: (R.stops || []).map(function(j) { return { x: j.x, y: j.y, z: j.z, r: j.r, n: j.n }; }) };
    return A._civilFilmOvC;
  }
  // §CHAINAGE_V2: ONE owner for the road film's DRIVE route (seeded direction, §ALTC_V2 V1) — time_machine's chainage
  // build order reads it so the build-up runs the same way the camera drives. Civil only; null on a building.
  A.civilDriveRoute = function() { var o = _civilFilmOv(); return (o && o.waypoints) ? o.waypoints : null; };
  A.cinemaPathPlan = function(durationSec, ov) {
    // `undefined` means "use whatever is stored/staged"; an explicit null means "derived, ignore any
    // stored edit" — the G5 control path needs that distinction to be expressible.
    if (ov === undefined) { _cpeLoadFromDb(); ov = A._cinemaPathEdit || null; if (!ov) ov = _civilFilmOv(); }
    if (ov && ov.arc && ov.arc.a && ov.arc.b) return _arcPlan(durationSec, ov.arc);
    if (!ov) return FXS._cinemaPathPlan(durationSec);
    if (ov._camBasis) return _withCamBasis(ov._camBasis, function() {
      var o = {}; for (var q in ov) if (q !== '_camBasis') o[q] = ov[q];
      return A.cinemaPathPlan(durationSec, o);
    });
    var saved = [], i, savedSecOv = FXS._cpeSecOverride;
    FXS._cpeSecOverride = ['diveSec', 'spinSec', 'outSec', 'riseSec']
      .some(function(k) { return ov[k] != null && isFinite(ov[k]); });
    for (i = 0; i < FXS._CPE_KEYS.length; i++) {
      var k = FXS._CPE_KEYS[i][0], g = FXS._CPE_KEYS[i][1];
      saved.push(_cpeGet(g));
      if (ov[k] != null && isFinite(ov[k])) FXS._cpeSet(g, ov[k]);
    }
    var savedWp = FXS._cpeWp, savedBands = FXS._cpeBands, savedHose = FXS._cpeHose, savedReveal = FXS._cpeReveal,
        savedCorr = FXS._cpeCorrections, savedStoreyReveal = FXS._cpeStoreyReveal;
    // §CPE_HOSE: ops ride the same override object the editor already stages and saves, so a hosed
    // path travels through Save / reload / bake by the existing seam — no second persistence path.
    FXS._cpeHose = (ov.hose && ov.hose.length) ? ov.hose : null;
    if (ov.waypoints && ov.waypoints.length >= 2) FXS._cpeWp = ov.waypoints;
    // §CPE_BANDS takes precedence: bands EXPAND to waypoints inside the plan, so passing both would
    // be ambiguous. Bands win because they carry the rigidity constraint that loose points cannot.
    if (ov.bands && ov.bands.length >= 2) { FXS._cpeBands = ov.bands; FXS._cpeWp = null; }
    FXS._cpeReveal = !!ov.reveal;
    // §STOREY_HIGHLIGHT_REVEAL: same wrapper pattern as _cpeReveal directly above.
    FXS._cpeStoreyReveal = !!ov.storeyReveal;
    // §CPE_CONE_ORIENT_ADJUST: same wrapper pattern as hose/reveal above — a plain array of plain
    // correction objects, no rigidity/expansion concept like bands, so no precedence rule is needed.
    FXS._cpeCorrections = (ov.aimCorrections && ov.aimCorrections.length) ? ov.aimCorrections : null;
    try {
      return FXS._cinemaPathPlan(durationSec);
    } finally {
      for (i = 0; i < FXS._CPE_KEYS.length; i++) FXS._cpeSet(FXS._CPE_KEYS[i][1], saved[i]);
      FXS._cpeWp = savedWp; FXS._cpeBands = savedBands; FXS._cpeHose = savedHose; FXS._cpeSecOverride = savedSecOv;
      FXS._cpeReveal = savedReveal; FXS._cpeCorrections = savedCorr; FXS._cpeStoreyReveal = savedStoreyReveal;
    }
  };
  A.cinemaPathPlanDerived = FXS._cinemaPathPlan;   // unwrapped, for G1's byte-identity comparison
  // §INTERIOR_PACING (FLY_TOUR_CORRIDOR_GRAPH.md, 2026-07-25): exposes the SAME BVH raycast fan
  // §CINEMA_SPACE already trusts as "the ONLY where-is-open-space source" (see the file-header
  // comment above _cinemaFanMeshes) to tour.js's flight-pacing — real measured clearance-to-
  // nearest-surface, not a second invented proximity system. tour.js is the only outside caller.
  A.cinemaFan = FXS._cinemaFan;
  // §INTERIOR_PACING_LOS (2026-07-26, user: "Measure by LOS - what is in front of the middle in
  // the frame, if it is far, fast. Near, slow" — courtyard traversal was still measuring slow
  // because `_cinemaFan`'s min-of-8-rays fires on ANYTHING close in ANY direction, e.g. a low
  // wall or piece of furniture off to the side, even when what's actually ahead in view is wide
  // open). Single forward raycast, same mesh set/raycaster the fan already uses — not a second
  // invented proximity system, just the one ray that matters for pacing: where the camera is
  // heading, not everything around it.
  function _cinemaLookDist(pos, dirX, dirZ) {
    var meshes = FXS._cinemaFanMeshes();
    if (!meshes.length) return FXS.CINEMA_FAN_FAR;
    if (!FXS._cineFanRay) { FXS._cineFanRay = new THREE.Raycaster(); FXS._cineFanRay.firstHitOnly = true; }
    var len = Math.hypot(dirX, dirZ);
    if (len < 1e-6) return FXS.CINEMA_FAN_FAR;
    FXS._cineFanRay.set(new THREE.Vector3(pos.x, pos.y, pos.z), new THREE.Vector3(dirX / len, 0, dirZ / len));
    FXS._cineFanRay.far = FXS.CINEMA_FAN_FAR;
    var hits = null;
    try { hits = FXS._cineFanRay.intersectObjects(meshes, true); } catch (e) { return FXS.CINEMA_FAN_FAR; }
    return (hits && hits.length) ? hits[0].distance : FXS.CINEMA_FAN_FAR;
  }
  A.cinemaLookDist = _cinemaLookDist;
  // §CINEMA_HDRI_RACE (2026-07-24): exposed so cinema_maxq.js's warm-up (the REAL Alt+C entry
  // point — scene.js's §KBD_ROUTE always finds A.startMaxQualityOrbit and never falls through to
  // A.startCinemaOrbit below) can await the same HDRI readiness this file's own dead-code capture
  // path already does. MaxQ's own warm-up fold (_waitFoldDone) polls the TAA/AO accumulate-fold's
  // busy flag only — a SEPARATE async load from the HDRI texture fetch+PMREM-generate, so the fold
  // can report "done" while the HDRI is still loading, live-confirmed via a real user's own pasted
  // console log (§STILL_REFINE done fired ~2.2s in, §LAYER2_HDRI_READY only later).
  A.ensureHdriEnvMapReady = FXS._ensureHdriEnvMap;
  A.startCinemaOrbit = async function() {
    if (FXS._cinemaActive || A._stillRefineActive || !A.camera || !A.controls || !A.renderer) return;
    if (!A.renderer.domElement.captureStream || typeof MediaRecorder === 'undefined') {
      console.warn('§CINEMA_FAIL captureStream/MediaRecorder unsupported in this browser');
      return;
    }
    FXS._cinemaActive = true;  // claim BEFORE the await below — a second Alt+C during the import tick must not double-start
    // §CINEMA_GHOST_RESET (2026-07-21): same fix as cinema_maxq.js's live Alt+C path — see
    // navigate_find.js §CINEMA_GHOST_RESET. This function is currently dead code (scene.js's
    // §KBD_ROUTE always finds A.startMaxQualityOrbit defined and never falls through here), kept in
    // sync for consistency in case that routing ever changes.
    if (typeof A.resetCinemaGhostLens === 'function') A.resetCinemaGhostLens();
    // §CINEMA_SSAA lazy-load: the module is already in the browser's module map on any load where
    // A._composer exists (TAARenderPass.js imports it), so this resolves from cache in a microtask
    // — no network fetch, works offline.
    if (!FXS._cinemaSsaaPass && !FXS._cinemaSsaaImportFailed && A._composer) {
      try {
        var _ssaaMod = await import('./lib/SSAARenderPass.js');
        FXS._cinemaSsaaPass = new _ssaaMod.SSAARenderPass(A.scene, A.camera);
        FXS._cinemaSsaaPass.sampleLevel = FXS.CINEMA_SSAA_LEVEL;
      } catch (e) {
        FXS._cinemaSsaaImportFailed = true;
        console.warn('§CINEMA_SSAA_FAIL import: ' + e.message + ' — recording continues without SSAA');
      }
    }
    // §PHOTO_VARIATION: lock whichever random paint/puddle variation is currently on screen —
    // "once user agrees, press cinema icon, it takes that persisted cache" — so the capture
    // doesn't re-roll mid-recording, and stays locked for the rest of the session.
    FXS._photoVariationLocked = true;
    // §CINEMA_ROOMS — the plan is SYNCHRONOUS but its two best data sources (A.getRoomGraph for
    // the largest interior space, and the 'exit' door nodes §CINEMA_EXIT chooses from) live in the
    // LAZY navigate bundle, which a session that never opened Find has not loaded. Warm it here,
    // where we are already async, so the film gets real rooms + real doors instead of silently
    // falling back to the bbox centre and the facade. Failure is non-fatal — the plan's fallbacks
    // (DB IfcDoor query, then nearest facade) still produce a film.
    if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) {
      A._navLoadedBy = 'cinema';   // M2: the ghost=1 auto-shell must not arm from this load
      try { await A.loadNavigate(); } catch (eN) { console.warn('§CINEMA_ROOMS loadNavigate failed: ' + eN.message); }
    }
    if (typeof A.ensureRooms === 'function') {
      try { await A.ensureRooms({}); } catch (eR) { console.warn('§CINEMA_ROOMS ensureRooms failed: ' + eR.message); }
    }
    var plan = FXS._cinemaPathPlan(FXS.CINEMA_N_FRAMES / FXS.CINEMA_FPS);
    var base = plan.base, envelope = plan.envelope;

    // Reuse the exact still-refine staging setup (ground/shadow/sky/sun/fog/addons/sparkle), minus
    // its own TAA-accumulate rAF loop — this function drives its own render loop for the moving
    // camera (accumulating supersamples across motion would just blur/ghost, not help).
    A._stillRefineActive = true;
    A._composerEnabled = true;   // teardown recomputes from SSAO/Outline state (§GI_HANDOFF_GHOST_FIX)
    if (A._taaPass) { A._taaPass.accumulate = false; A._taaPass.accumulateIndex = -1; }
    // §CINEMA_SSAA attach: swap the composer's HEAD pass to spatial supersampling for the length
    // of the recording. SSAA jitters the camera sub-pixel N times WITHIN each frame and averages —
    // the correct quality lever for a continuously moving camera. (Alt+S's TAA accumulates ACROSS
    // frames — under motion that ghosts, which is why accumulate stays hard-off above; settled
    // design, do not re-litigate — bim-compiler prompts/PHOTOREAL_STILL_RENDER.md 2026-07-18.)
    // GI path excluded: N8AO already needs a reduced preset just to be recordable
    // (§GI_CINEMA_PRESET below) — a 4x scene-render multiplier on top would be a slideshow.
    var _cinemaSsaaAttached = false;
    function _cinemaSsaaDetach() {
      if (!_cinemaSsaaAttached) return;
      _cinemaSsaaAttached = false;
      A._composer.removePass(FXS._cinemaSsaaPass);
      if (A._taaPass) A._taaPass.enabled = true;
      console.log('§CINEMA_SSAA off (TAA-as-plain-RenderPass head restored)');
    }
    if (FXS._cinemaSsaaPass && A._composer && !A._giComposerActive) {
      FXS._cinemaSsaaPass.scene = A.scene; FXS._cinemaSsaaPass.camera = A.camera;  // track any rebuild between runs
      var _rt1 = A._composer.renderTarget1;
      if (_rt1) FXS._cinemaSsaaPass.setSize(_rt1.width, _rt1.height);  // window may have resized since last run
      A._composer.insertPass(FXS._cinemaSsaaPass, 0);
      if (A._taaPass) A._taaPass.enabled = false;  // SSAA replaces the head — never render the scene twice
      _cinemaSsaaAttached = true;
      console.log('§CINEMA_SSAA on level=' + FXS.CINEMA_SSAA_LEVEL + ' (' + Math.pow(2, FXS.CINEMA_SSAA_LEVEL) +
        ' spatial samples/frame, composer head swapped for recording)');
    } else if (A._giComposerActive) {
      console.log('§CINEMA_SSAA skipped — GI composer is the recorded path, §GI_CINEMA_PRESET governs its quality');
    } else {
      console.log('§CINEMA_SSAA unavailable composer=' + !!A._composer + ' importFailed=' + FXS._cinemaSsaaImportFailed);
    }
    FXS._stillRefineStartMs = performance.now();
    var _triCount = FXS._setTriplanarActive(true);
    FXS._applyPhotoStaging();
    // §CINEMA_HDRI_RACE (2026-07-24): wait for the HDRI envMap _applyPhotoStaging() just kicked off
    // (or already-cached, in which case this resolves on the next microtask) so frame 0 doesn't
    // record the OLD procedural-sky envMap and then snap to the real HDRI mid-recording once the
    // fetch/PMREM-generate finishes — the exact "flicker/snapping... before Alt-S fully applied"
    // report. 5s cap (vs MaxQ's 30s) — this is the interactive live-capture path, a slow/broken
    // network should degrade to the procedural envMap rather than stall the recording indefinitely.
    var _hdriWaitMs = 0, _hdriWaitT0 = performance.now();
    await Promise.race([
      FXS._ensureHdriEnvMap(),
      new Promise(function(res) { setTimeout(res, 5000); })
    ]);
    _hdriWaitMs = performance.now() - _hdriWaitT0;
    console.log('§CINEMA_HDRI_RACE waitedMs=' + _hdriWaitMs.toFixed(0) + ' ready=' + !!FXS._hdriEnvMap);
    // §CINEMA_DAMPING_BLEED (2026-07-26, user: "a slight twitch at the first second of the movie,
    // where the screen size is adjusted slightly narrower. Tested on two buildings it is so").
    // A recording is a FULLY AUTHORED camera — cinemaPathPlan owns every pose. But step() below does
    // camera.position.set(pose) → controls.update(), and OrbitControls.update() recomputes the
    // position from its OWN spherical state with the dampened deltas applied, OVERWRITING the pose
    // that was just authored. With scene.js's enableDamping/dampingFactor=0.08, the residual left by
    // whatever navigation the user did immediately before pressing Alt+C bleeds into the film:
    // measured 1.637% of the look distance at frame 0, decaying by exactly 0.92 = 1 - dampingFactor
    // per frame, i.e. ~1-2s to become invisible. That is the reported twitch.
    // Damping is an INTERACTION affordance; it has no business editing an authored pose. Hold it off
    // for the run and flush the residual here, BEFORE frame 0. update() is still called every frame
    // (it has other duties) — with damping off it applies zeroed deltas and preserves the pose
    // exactly. Restored on every exit path below, next to the SSAA detach.
    var _dampSaved = A.controls.enableDamping, _dampHeld = false;
    function _cinemaDampRelease() {
      if (!_dampHeld) return;
      _dampHeld = false; A.controls.enableDamping = _dampSaved;
      console.log('§CINEMA_DAMPING_BLEED released (enableDamping restored to ' + _dampSaved + ')');
    }
    A.controls.enableDamping = false; _dampHeld = true;
    // One-off flush: with damping off, update() applies the ENTIRE remaining delta at once instead
    // of 8% of it per frame (measured 13.3m on a fresh drag). That is exactly what we want, and it
    // is harmless here — it lands BEFORE the first authored pose, which overwrites the position
    // outright. Doing it after frame 0 would put that whole jump INSIDE the film.
    A.controls.update();
    console.log('§CINEMA_DAMPING_BLEED held (enableDamping ' + _dampSaved + ' -> false for the recording)');

    console.log('§CINEMA_ORBIT start envelope=' + envelope.toFixed(1) + ' arcOnly=' + plan.arcOnly +
      ' fillDistance=' + plan.fillDistance.toFixed(1) + ' pushInRadius=' + plan.pushInRadius.toFixed(1) +
      ' radiusBand=[' + plan.radiusMin.toFixed(1) + ',' + plan.radiusMax.toFixed(1) + '] triplanarMaterials=' + _triCount);

    // §GI_CINEMA_PRESET (2026-07-16, Task 2): N8AO at full-res costs ~317ms/frame on a RTX 4060
    // (measured) — a recording with GI active would be a ~3fps slideshow. While the recording
    // runs WITH GI on, drop N8AO to halfRes + reduced samples/denoise (the recording is motion —
    // per-frame AO fidelity reads far less than in a still), restore the exact prior values when
    // the recording stops. No GI active = nothing saved, nothing touched.
    var _giCinemaSaved = null;
    function _giCinemaPresetRestore() {
      if (!_giCinemaSaved || !A._giN8aoPass) return;
      var cfg = A._giN8aoPass.configuration;
      cfg.halfRes = _giCinemaSaved.halfRes; cfg.aoSamples = _giCinemaSaved.aoSamples;
      cfg.denoiseSamples = _giCinemaSaved.denoiseSamples; cfg.denoiseRadius = _giCinemaSaved.denoiseRadius;
      _giCinemaSaved = null;
      if (typeof A._giN8aoPass.firstFrame === 'function') A._giN8aoPass.firstFrame();
      console.log('§GI_CINEMA_PRESET off (restored halfRes=' + cfg.halfRes + ' aoSamples=' + cfg.aoSamples +
        ' denoiseSamples=' + cfg.denoiseSamples + ' denoiseRadius=' + cfg.denoiseRadius + ')');
    }
    if (A._giComposerActive && A._giN8aoPass) {
      var _giCfg = A._giN8aoPass.configuration;
      _giCinemaSaved = { halfRes: _giCfg.halfRes, aoSamples: _giCfg.aoSamples,
                         denoiseSamples: _giCfg.denoiseSamples, denoiseRadius: _giCfg.denoiseRadius };
      _giCfg.halfRes = true; _giCfg.aoSamples = 4; _giCfg.denoiseSamples = 2; _giCfg.denoiseRadius = 3;
      if (typeof A._giN8aoPass.firstFrame === 'function') A._giN8aoPass.firstFrame();
      console.log('§GI_CINEMA_PRESET on halfRes=true aoSamples=4 denoiseSamples=2 denoiseRadius=3');
    }
    var stream = A.renderer.domElement.captureStream(FXS.CINEMA_FPS);
    var chunks = [];
    var mimeType = (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9'))
      ? 'video/webm;codecs=vp9' : 'video/webm';
    var recorder;
    try { recorder = new MediaRecorder(stream, { mimeType: mimeType }); }
    catch (e) { console.warn('§CINEMA_FAIL MediaRecorder ctor: ' + e.message); _cinemaDampRelease(); _cinemaSsaaDetach(); FXS._teardownStillRefine('cinema-fail'); FXS._cinemaActive = false; return; }
    recorder.ondataavailable = function(e) { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = function() {
      var blob = new Blob(chunks, { type: mimeType });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'BIM_Cinema_' + (A.activeBuilding || 'building') + '_' + Date.now() + '.webm';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
      console.log('§CINEMA_ORBIT saved size=' + blob.size + ' type=' + mimeType);
      _cinemaDampRelease();      // §CINEMA_DAMPING_BLEED: recording over — user's damping back
      _cinemaSsaaDetach();       // §CINEMA_SSAA: recording over — plain head pass back
      _giCinemaPresetRestore();  // §GI_CINEMA_PRESET: recording over — full-quality GI settings back
      FXS._teardownStillRefine('cinema-orbit-done');
      FXS._cinemaActive = false;
    };
    recorder.start();

    var startMs = performance.now();
    var durationMs = (FXS.CINEMA_N_FRAMES / FXS.CINEMA_FPS) * 1000;
    var _cinePerfN = 0, _cinePerfMs = 0, _cinePrevFrameMs = 0;  // §CINEMA_PERF frame-time telemetry
    function step() {
      if (!FXS._cinemaActive) { _giCinemaPresetRestore(); _cinemaDampRelease(); _cinemaSsaaDetach(); return; }  // early abort (stopCinemaOrbit) — restore GI + head pass + damping too
      var tNorm = Math.min(1, (performance.now() - startMs) / durationMs);
      // §CINEMA_PATH: pose from the shared plan (§CINEMA_SIMPLE's one routine — dive → spin →
      // out → rise → orbit) — the SAME path the MaxQ exporter flies.
      var pose = plan.poseAt(tNorm);
      A.camera.position.set(pose.x, pose.y, pose.z);
      A.controls.target.set(pose.tx, pose.ty, pose.tz);
      A.controls.update();
      FXS._updateCamLight(pose.tx, pose.ty, pose.tz);
      FXS._updateCamTorch(pose.tx, pose.ty, pose.tz);   // §CAM_TORCH — no-op unless the torch is staged
      FXS._sunArcStep(tNorm);
      FXS._reassertPhotoShadowCoverage();
      FXS._reassertPhotoMatBoost();
      FXS._reassertPhotoEnvMap();
      FXS._reassertPhotoSparkles();
      FXS._reassertPhotoGlow();
      // §GI_CINEMA_PRESET: when GI is active, the GI composer is what the user is seeing (main
      // loop prefers it) — render THAT for the recording; rendering A._composer here as well
      // would have the two composers alternating on the canvas mid-recording (flicker).
      if (A._giComposerActive && A._giComposer) A._giComposer.render();
      else if (A._composer) A._composer.render();
      // §CINEMA_PERF: real frame-time telemetry, logged every 75 frames — the whole point of the
      // preset is recording smoothness, so measure it where it happens, not in a synthetic bench.
      var _nowMs = performance.now();
      if (_cinePrevFrameMs) {
        _cinePerfN++; _cinePerfMs += _nowMs - _cinePrevFrameMs;
        if (_cinePerfN % 75 === 0) {
          console.log('§CINEMA_PERF frames=' + _cinePerfN + ' avgFrameMs=' + (_cinePerfMs / _cinePerfN).toFixed(1) +
            ' gi=' + !!A._giComposerActive + ' preset=' + !!_giCinemaSaved +
            ' ssaa=' + (_cinemaSsaaAttached ? FXS.CINEMA_SSAA_LEVEL : 0));
        }
      }
      _cinePrevFrameMs = _nowMs;
      if (tNorm >= 1) { recorder.stop(); return; }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };
  A.stopCinemaOrbit = function() { FXS._cinemaActive = false; };  // early-abort hook, e.g. a Stop button

  // §STILL_REFINE cancellation lives in main.js, on the actual pointerdown/wheel/controls-start
  // signals — NOT here on markDirty. Confirmed live (2026-07-15, real user) that markDirty fires
  // from far more than "user touched the canvas" (e.g. the history bar's own event-sniffer
  // refreshing itself right after logging the very Alt+S keypress that started the refine),
  // which self-cancelled the refine within the same keypress. Precise interaction signals only.
};
