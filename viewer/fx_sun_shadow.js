// effects family — part `sun_shadow` (original effects.js lines 2543–4259).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/effects.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as FXS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__effectsParts = (typeof window !== 'undefined' ? window : globalThis).__effectsParts || {};
(typeof window !== 'undefined' ? window : globalThis).__effectsParts.sun_shadow = function* __split_effects_sun_shadow(FXS, A, renderer, scene, camera) {
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  FXS._sunArcStep = _sunArcStep;
  FXS._mirrorOwnApply = _mirrorOwnApply;
  FXS._mirrorOwnRestore = _mirrorOwnRestore;
  FXS._stillLampList = _stillLampList;
  FXS._stillDial = _stillDial;
  FXS._reassertPhotoShadowCoverage = _reassertPhotoShadowCoverage;
  FXS._reassertPhotoEnvMap = _reassertPhotoEnvMap;
  FXS._reassertPhotoMatBoost = _reassertPhotoMatBoost;
  FXS._fitOn = _fitOn;
  FXS._stillFitApply = _stillFitApply;
  FXS._stillCascadeLightsAdd = _stillCascadeLightsAdd;
  FXS._enablePhotoShadows = _enablePhotoShadows;
  FXS._disablePhotoShadows = _disablePhotoShadows;
  FXS._seededRand = _seededRand;
  FXS._buildGroundPuddles = _buildGroundPuddles;
  FXS._wireGroundPuddleShader = _wireGroundPuddleShader;
  FXS._ensureHdriEnvMap = _ensureHdriEnvMap;
  FXS._buildRoomProbe = _buildRoomProbe;
  FXS._stillCamInside = _stillCamInside;
  FXS._groundTexMeanRGB = _groundTexMeanRGB;
  Object.defineProperty(FXS, '_bakeFillCheckLogged', { get: function () { return _bakeFillCheckLogged; }, set: function (v) { _bakeFillCheckLogged = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_HEMI_INTENSITY_SCALE', { get: function () { return PHOTO_HEMI_INTENSITY_SCALE; }, set: function (v) { PHOTO_HEMI_INTENSITY_SCALE = v; }, enumerable: true });
  Object.defineProperty(FXS, 'FILM_FILL_AMBIENT', { get: function () { return FILM_FILL_AMBIENT; }, set: function (v) { FILM_FILL_AMBIENT = v; }, enumerable: true });
  Object.defineProperty(FXS, 'FILM_FILL_HEMI', { get: function () { return FILM_FILL_HEMI; }, set: function (v) { FILM_FILL_HEMI = v; }, enumerable: true });
  Object.defineProperty(FXS, '_filmFillSaved', { get: function () { return _filmFillSaved; }, set: function (v) { _filmFillSaved = v; }, enumerable: true });
  Object.defineProperty(FXS, '_stillBaseSaved', { get: function () { return _stillBaseSaved; }, set: function (v) { _stillBaseSaved = v; }, enumerable: true });
  Object.defineProperty(FXS, '_ghostSuspendedByStill', { get: function () { return _ghostSuspendedByStill; }, set: function (v) { _ghostSuspendedByStill = v; }, enumerable: true });
  Object.defineProperty(FXS, '_albedoSaved', { get: function () { return _albedoSaved; }, set: function (v) { _albedoSaved = v; }, enumerable: true });
  Object.defineProperty(FXS, '_expSaved', { get: function () { return _expSaved; }, set: function (v) { _expSaved = v; }, enumerable: true });
  Object.defineProperty(FXS, 'PHOTO_AMBIENT_INTENSITY_SCALE', { get: function () { return PHOTO_AMBIENT_INTENSITY_SCALE; }, set: function (v) { PHOTO_AMBIENT_INTENSITY_SCALE = v; }, enumerable: true });
  Object.defineProperty(FXS, 'GROUND_TEX_AVG_LUM', { get: function () { return GROUND_TEX_AVG_LUM; }, set: function (v) { GROUND_TEX_AVG_LUM = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoSunPosSaved', { get: function () { return _photoSunPosSaved; }, set: function (v) { _photoSunPosSaved = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoSunTargetSaved', { get: function () { return _photoSunTargetSaved; }, set: function (v) { _photoSunTargetSaved = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoFlarePrevTone', { get: function () { return _photoFlarePrevTone; }, set: function (v) { _photoFlarePrevTone = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoHaloPrevTone', { get: function () { return _photoHaloPrevTone; }, set: function (v) { _photoHaloPrevTone = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoEnvBoostedMats', { get: function () { return _photoEnvBoostedMats; }, set: function (v) { _photoEnvBoostedMats = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoMatBoostActive', { get: function () { return _photoMatBoostActive; }, set: function (v) { _photoMatBoostActive = v; }, enumerable: true });
  Object.defineProperty(FXS, '_sfrTouched', { get: function () { return _sfrTouched; }, set: function (v) { _sfrTouched = v; }, enumerable: true });
  Object.defineProperty(FXS, '_albedoDecSet', { get: function () { return _albedoDecSet; }, set: function (v) { _albedoDecSet = v; }, enumerable: true });
  Object.defineProperty(FXS, '_albedoLateN', { get: function () { return _albedoLateN; }, set: function (v) { _albedoLateN = v; }, enumerable: true });
  Object.defineProperty(FXS, '_fitState', { get: function () { return _fitState; }, set: function (v) { _fitState = v; }, enumerable: true });
  Object.defineProperty(FXS, '_csmLights', { get: function () { return _csmLights; }, set: function (v) { _csmLights = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoNightWasOn', { get: function () { return _photoNightWasOn; }, set: function (v) { _photoNightWasOn = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoSkyWasVisible', { get: function () { return _photoSkyWasVisible; }, set: function (v) { _photoSkyWasVisible = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoDuskMoodApplied', { get: function () { return _photoDuskMoodApplied; }, set: function (v) { _photoDuskMoodApplied = v; }, enumerable: true });
  Object.defineProperty(FXS, '_dlodPausedByStill', { get: function () { return _dlodPausedByStill; }, set: function (v) { _dlodPausedByStill = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoStagingOn', { get: function () { return _photoStagingOn; }, set: function (v) { _photoStagingOn = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoGroundWasVisible', { get: function () { return _photoGroundWasVisible; }, set: function (v) { _photoGroundWasVisible = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoGroundPrevKey', { get: function () { return _photoGroundPrevKey; }, set: function (v) { _photoGroundPrevKey = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoGroundPrevColor', { get: function () { return _photoGroundPrevColor; }, set: function (v) { _photoGroundPrevColor = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoFogColorSaved', { get: function () { return _photoFogColorSaved; }, set: function (v) { _photoFogColorSaved = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoFogDensitySaved', { get: function () { return _photoFogDensitySaved; }, set: function (v) { _photoFogDensitySaved = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoSkyUniSaved', { get: function () { return _photoSkyUniSaved; }, set: function (v) { _photoSkyUniSaved = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoVariationLocked', { get: function () { return _photoVariationLocked; }, set: function (v) { _photoVariationLocked = v; }, enumerable: true });
  Object.defineProperty(FXS, '_puddleCenters', { get: function () { return _puddleCenters; }, set: function (v) { _puddleCenters = v; }, enumerable: true });
  Object.defineProperty(FXS, 'GROUND_WETNESS_STAGE_DEFAULT', { get: function () { return GROUND_WETNESS_STAGE_DEFAULT; }, set: function (v) { GROUND_WETNESS_STAGE_DEFAULT = v; }, enumerable: true });
  Object.defineProperty(FXS, '_groundWetnessUserSet', { get: function () { return _groundWetnessUserSet; }, set: function (v) { _groundWetnessUserSet = v; }, enumerable: true });
  Object.defineProperty(FXS, '_vacGroundWetness', { get: function () { return _vacGroundWetness; }, set: function (v) { _vacGroundWetness = v; }, enumerable: true });
  Object.defineProperty(FXS, '_hdriEnvMap', { get: function () { return _hdriEnvMap; }, set: function (v) { _hdriEnvMap = v; }, enumerable: true });
  Object.defineProperty(FXS, '_photoEnvMapSaved', { get: function () { return _photoEnvMapSaved; }, set: function (v) { _photoEnvMapSaved = v; }, enumerable: true });
  Object.defineProperty(FXS, 'GROUND_TEX_MEAN_LUM', { get: function () { return GROUND_TEX_MEAN_LUM; }, set: function (v) { GROUND_TEX_MEAN_LUM = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order

  function _sunElevationAt(tNorm) {
    var _s = (A.isCivilModel && A.isCivilModel()) ? FXS.CIVIL_SUN_ELEVATION_START : FXS.PHOTO_SUN_ELEVATION_START;
    return _s + (FXS.PHOTO_SUN_ELEVATION_END - _s) * tNorm;
  }
  // updateSky() repositions the sun/sky/fog/lensflare but does NOT touch the shadow map — it has no
  // reason to, every OTHER caller (Time Machine, plain nav) already re-renders continuously. A film
  // with a moving sun does not: shadowMap.autoUpdate is off by default (perf — see streaming.js/
  // effects.js §PHOTO_SHADOW comments), so without this the sky/fog would visibly sweep noon→dusk
  // while every shadow stayed frozen at whatever angle was last baked — worse than not animating at
  // all, since the mismatch reads as a bug rather than a static look. Called every frame the sun
  // moves, right after updateSky(), so no frame captures with a stale shadow angle.
  // §SUN_ONE (red1, 2026-09-19: "to have one correct one, so everything is in synch").
  // There were TWO suns in a frame. This one — the scripted 55°→6° arc at a fixed azimuth of 200 —
  // lit the building and cast every shadow. The sun compass drew the REAL one from the site's
  // lat/long and the 4D date. MEASURED on one Hospital frame: rendered 345° az / 55.0° elev,
  // real 267.3° az / 30.4° elev — 77.7° and 24.6° apart, and diverging differently every frame
  // because the scripted sun never moves in azimuth at all while a real one does.
  //
  // So when the compass is on, the REAL sun drives the light too, and there is one sun.
  //
  // ⚠ GATED ON THE COMPASS FLAG, and the default is untouched. §SUN_ARC_TOPOUT_SNAP REVERTED above
  // records that the linear crawl "was already correct and was never to be touched". It still is,
  // for every bake that does not ask for the compass — this cannot change a film nobody opted in.
  //
  // ⚠ AZIMUTH FRAMES DIFFER AND THE CONVERSION IS NOT OPTIONAL. updateSky takes a SCENE bearing
  // (0 = model north, via setFromSphericalCoords where z = +cos θ); the compass reports a TRUE
  // bearing (0 = true north, and the scene maps z = −cos). So θ = 180 − (trueAz − trueNorthAngle).
  // Verified against the shipped constant: PHOTO_SUN_AZIMUTH 200 is model bearing −20°, and
  // 180 − (−20) = 200. Feeding a true bearing straight in would be wrong by 180° plus true north.
  //
  // ⚠ A REAL SUN GOES DOWN. If the 4D cursor lands after sunset the elevation is negative and the
  // film is dark — that is the correct answer, not a fault, and it is the price of one sun. The
  // scripted arc could never do this, which is exactly why it never agreed with the compass.
  function _realSunForRender() {
    if (!A._sunCompassOn || typeof A.sunCompassInfo !== 'function') return null;
    var info = A.sunCompassInfo();
    if (!info || info.noCursor || info.azimuth == null || info.elevation == null) return null;
    var tn = (typeof window !== 'undefined' && window._trueNorthAngle) || 0;
    return { el: info.elevation, az: (180 - (info.azimuth - tn) % 360 + 360) % 360 };
  }
  function _sunArcStep(tNorm) {
    if (!A.updateSky) return;
    var _real = _realSunForRender();
    if (_real) {
      A.updateSky(_real.el, _real.az);
      if (A.renderer) A.renderer.shadowMap.needsUpdate = true;
      A._sunArcElevationDeg = _real.el;
      console.log('§SUN_ONE tNorm=' + tNorm.toFixed(3) + ' elevation=' + _real.el.toFixed(1) +
        ' skyAzimuth=' + _real.az.toFixed(1) + ' — the REAL sun is lighting the scene, so the ' +
        'shadows and the compass rose agree' + (_real.el <= 0 ? ' (below the horizon: the film is ' +
        'dark here because it really is dark there)' : ''));
      return _real.el;
    }
    var _el = _sunElevationAt(tNorm);
    A.updateSky(_el, FXS.PHOTO_SUN_AZIMUTH);
    if (A.renderer) A.renderer.shadowMap.needsUpdate = true;
    // §SUN_ARC_FILL reads the elevation this step JUST set — stashed here so the fill compensation
    // below cannot drift from the arc by re-deriving it (one elevation, two consumers).
    A._sunArcElevationDeg = _el;
    console.log('§SUN_ARC_STEP tNorm=' + tNorm.toFixed(3) + ' elevation=' + _el.toFixed(1) +
      ' (start=' + ((A.isCivilModel && A.isCivilModel()) ? FXS.CIVIL_SUN_ELEVATION_START + ' civil' : FXS.PHOTO_SUN_ELEVATION_START) + ' end=' + FXS.PHOTO_SUN_ELEVATION_END + ')');
    return _el;
  }
  A._sunArcStep = _sunArcStep;
  // ══ §SUN_ARC_FILL → §BAKE_FILL_PIN (2026-09-05, user: "during fly indoors, it seems it is not as
  // bright as when we do a static alt-s"; RULING, verbatim: "I know shadowed outside walls are
  // darker but indoors we reverse it, letting alt-s normal, and sunlite is brighter... do it."
  // bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md "Second open question"; witness:
  // viewer/tests/witness_sun_arc_fill.js) ══════════════════════════════════════════════════════
  // The bake sweeps the sun 55°→6° per frame (§SUN_ARC above) while the interior FILL — A.ambient,
  // A.hemi, the fixture point-light scale/budget — is staged once at entry. The ruling makes the
  // fill the Alt+S baseline and PINS it, every frame, regardless of the arc: never below it for any
  // reason. Where the sun reaches a surface, A.sun (DirectionalLight + shadow map — untouched by
  // this step) adds on top; a shadowed surface simply sits at the baseline, never darker than Alt+S.
  // (Superseded the same day: a dayT-driven boost curve, measured on a sun-facing Hospital pose and
  // found to have no defect to compensate — OFF-run interior luma noon 65.6 / dusk 62.4, logs in
  // viewer/tests/logs/sun_arc_fill/. The pin replaces it: a flat equality, not a curve.)
  // MECHANISM: after each frame's _sunArcStep, re-assert from the staged snapshots — A._photoFillBase
  // (ambient/hemi exactly as _applyPhotoStaging landed them, §MOVIE_SHADOW_TM), A._nightPLScaleStaged
  // (the §STAGED_PL_CUT value, or 0 in a §CPE_TAIL_LIGHTS_ALL_ONLY slot — a film state, kept), and
  // the still point-light budget + near-fade floor (§NIGHT_STILL_LIGHTS) — then _nightUpdateLights
  // so the frozen §NIGHT_BAKE_POOL takes it before capture. Writes ambient/hemi/_nightPLScale/
  // budget/floor ONLY. Bake-only: cinema_maxq.js gates the call on A._maxqActive. The line it logs
  // names what it CORRECTED (drift=…), so a frame where it changed nothing reads as a NO-OP rather
  // than hiding behind a green line. A dev-only tap may replace A._sunArcFillPin with a no-op to
  // produce the before/after pair the witness compares sun/shadow state across.
  // ══ §PL_TOPOUT_UNPIN (2026-09-06, MEP_CLASH_REVEAL_MOVIE.md; user: "The internal will be livelier with
  // PLs real play seen") — MEASURED on the verified topout-snap bake: at elevation 6.00 the fill is exactly
  // the Alt+S state (ambient 0.386 hemi 0.617) and plScale is 0.5 — A._nightPLScaleStill, the §STAGED_PL_CUT
  // "staging-only intensity cut" — while nav Night Mode runs the same fixtures at 1.0 ("full tuned
  // intensity", the A._nightPLScale = 1.0 write below). That 1.0 is the one sourced value. Past the plan's
  // topout the fixtures ease from the staged cut to it over the sun's own TOPOUT_SNAP_EASE_U window, so they
  // come up as the sun goes down; pre-topout, or with no topout known, this function is byte-identical to
  // the pin. ambient/hemi/budget/floor untouched. A staged 0 (lights-off film state) stays 0.
  var PL_TOPOUT_TARGET = 1.0;
  function _plTopoutWant(plStaged, tNorm, topoutU) {
    if (plStaged == null || !(plStaged > 0) || topoutU == null || !(tNorm > topoutU)) return plStaged;
    var easeEnd = Math.min(1, topoutU + FXS.TOPOUT_SNAP_EASE_U);
    var u = (tNorm >= easeEnd || easeEnd <= topoutU) ? 1 : (tNorm - topoutU) / (easeEnd - topoutU);
    return plStaged + (PL_TOPOUT_TARGET - plStaged) * u;
  }
  var _bakeFillCheckLogged = false;   // §FILM_FILL_CHECK: first frame always logs, later frames only on drift
  function _bakeFillPin(tNorm, topoutU) {
    var base = A._photoFillBase;
    var _el = (A._sunArcElevationDeg != null) ? A._sunArcElevationDeg : _sunElevationAt(tNorm);
    if (!base || !A.ambient || !A.hemi) {
      console.log('§SUN_ARC_FILL_PIN SKIP tNorm=' + (+tNorm).toFixed(3) + ' elevation=' + _el.toFixed(2) +
        ' reason=' + (!base ? 'no staged fill base (photo staging not applied this cycle)' : 'no ambient/hemi light') +
        ' — fill untouched');
      return null;
    }
    var drift = [];
    function pin(label, cur, want) { if (cur !== want) drift.push(label + ':' + cur + '→' + want); return want; }
    // §FILM_LAW S2: a parity film (no restore opt-in) is NOT pinned — ambient/hemi are only CHECKED against the staged still base
    // (§FILM_FILL_CHECK), so a latent writer (stopper S-LAW-8, time_machine.js applySunCycle) shows up instead of being masked.
    var _fillCheckOnly = !!(A._maxqActive && A._filmParity && !A._filmFillRestore);
    if (_fillCheckOnly) {
      var _fcd = [];
      if (A.ambient.intensity !== base.ambI) _fcd.push('ambient:' + base.ambI + '→' + A.ambient.intensity);
      if (A.hemi.intensity !== base.hemiI) _fcd.push('hemi:' + base.hemiI + '→' + A.hemi.intensity);
      if (_fcd.length || !_bakeFillCheckLogged) { _bakeFillCheckLogged = true;
        console.log('§FILM_FILL_CHECK tNorm=' + (+tNorm).toFixed(3) + ' ambient=' + A.ambient.intensity + ' hemi=' + A.hemi.intensity + ' stillBase=' + base.ambI + '/' + base.hemiI +
          ' drift=' + (_fcd.length ? _fcd.join(';') + ' (NOT corrected — a writer other than staging changed the fill)' : 'none') + ' (not pinned, §FILM_LAW S2)'); }
    } else {
      A.ambient.intensity = pin('ambient', A.ambient.intensity, base.ambI);
      A.hemi.intensity = pin('hemi', A.hemi.intensity, base.hemiI);
    }
    var plStaged = (typeof A._nightPLScaleStaged === 'number') ? A._nightPLScaleStaged : null;
    var plWant = _plTopoutWant(plStaged, tNorm, topoutU);   // §PL_TOPOUT_UNPIN — equals plStaged pre-topout / no topout
    var poolLit = 0, poolSum = 0;
    if (plStaged != null && typeof A._nightUpdateLights === 'function') {
      if (A._nightMaxLightsStill != null) A._nightMaxLights = pin('budget', A._nightMaxLights, A._nightMaxLightsStill);
      if (A._nightNearFadeFloorStill != null) A._nightNearFadeFloor = pin('nearFloor', A._nightNearFadeFloor, A._nightNearFadeFloorStill);
      A._nightPLScale = pin('plScale', A._nightPLScale, plWant);
      var _pool = A._nightBakePool || A._nightLights || [], litBefore = 0;
      for (var _pb = 0; _pb < _pool.length; _pb++) if (_pool[_pb].intensity > 0) litBefore++;
      A._nightUpdateLights();
      _pool = A._nightBakePool || A._nightLights || [];
      for (var _pi = 0; _pi < _pool.length; _pi++) if (_pool[_pi].intensity > 0) { poolLit++; poolSum += _pool[_pi].intensity; }
      if (litBefore !== poolLit) drift.push('poolLit:' + litBefore + '→' + poolLit);
    }
    var _sp = A.sun && A.sun.position;
    console.log('§SUN_ARC_FILL_PIN tNorm=' + (+tNorm).toFixed(3) + ' elevation=' + _el.toFixed(2) +
      ' ambient=' + A.ambient.intensity.toFixed(4) + ' hemi=' + A.hemi.intensity.toFixed(4) +
      ' plScale=' + (plStaged == null ? '-' : A._nightPLScale.toFixed(4)) +
      ' plTopout=' + (topoutU == null ? '-' : ('staged ' + plStaged + '→' + PL_TOPOUT_TARGET + ' at u>' + topoutU.toFixed(3) + ' now ' + (plWant == null ? '-' : plWant.toFixed(4)))) +
      ' budget=' + A._nightMaxLights + ' nearFloor=' + A._nightNearFadeFloor +
      ' poolLit=' + poolLit + ' poolSum=' + poolSum.toFixed(3) +
      ' sun=' + (A.sun ? A.sun.intensity.toFixed(4) : '-') +
      ' sunPos=' + (_sp ? _sp.x.toFixed(3) + ',' + _sp.y.toFixed(3) + ',' + _sp.z.toFixed(3) : '-') +
      ' drift=' + (drift.length ? drift.join(';') : 'none') + ' fill=' + (_fillCheckOnly ? 'checked-not-pinned (§FILM_LAW S2)' : 'pinned') +
      ' (pinned to the Alt+S baseline — sun and shadow untouched by this step)');
    if (A.markDirty) A.markDirty();
    return { drift: drift, poolLit: poolLit, poolSum: poolSum, plScale: A._nightPLScale, plStaged: plStaged, plWant: plWant,
      ambient: A.ambient.intensity, hemi: A.hemi.intensity };
  }
  A._sunArcFillPin = _bakeFillPin;
  A._plTopoutWant = _plTopoutWant;   // §PL_TOPOUT_UNPIN — the pure curve, for the witness
  var PHOTO_ENVMAP_BOOST = 2.0;   // multiply each material's existing envMapIntensity — stronger
                                   // glass/metal reflections without changing overall scene exposure
                                   // (history: 2.2 -> 3.2 -> 4.5 -> 3.0 -> 2.0. §PHOTO_REALISM_RETUNE
                                   // (2026-08-27, PHOTOREAL_STILL_RENDER.md, this session): 3.0 was
                                   // tuned BEFORE §MIRROR_ROOM_PROBE (2026-08-16) gave glossy/metal
                                   // materials a real local-scene reflection on top of the sky/HDRI
                                   // env map — with the room probe now doing part of the reflection
                                   // work, 3.0 double-counts and reads "too bright, shiny reflection"
                                   // (user's own words). One controlled step down (not back to the
                                   // pre-room-probe 2.2 floor — same "single controlled increment,
                                   // not guess-and-hope" discipline as §PHOTO_AO_EDGE's 2->4 step),
                                   // verified live via witness_envmap_retune.js on Clinic (real,
                                   // room-probe-applied, apples-to-apples before/after): meanBoostRatio
                                   // 3.0000->2.0000, meanBoostedEnvMapIntensity 1.8000->1.2000 (both
                                   // exactly track the constant, as expected); frame-level meanLuma
                                   // 174.19->178.02, stdLuma 69.65->66.57, clippedWhiteFrac 0.00%
                                   // unchanged — near-flat at the whole-frame level because Clinic has
                                   // only 1 glossy/room-probe-eligible material of 7 in _matCache, so
                                   // the material-level halo shrink is real but diluted by the rest of
                                   // the frame. Hospital not re-verified after this same session hit a
                                   // pre-existing CPE/Hospital environment flakiness (hang, then a
                                   // detached-Frame puppeteer crash on retry, both unrelated to this
                                   // diff) — see prompts/PHOTOREAL_STILL_RENDER.md §PHOTO_REALISM_RETUNE.
                                   // (history predating this line, still true: the 4.5 step, combined
                                   // with the §PHOTO_ENVMAP_STALE fix below finally pointing every
                                   // material at the CORRECT dusk env map, made the glint work for
                                   // the first time — but also overshot: user reported "all shadows
                                   // on building are gone." Root cause of THAT: env-map/IBL
                                   // reflection is NOT shadow-map-occluded in three.js (same class of
                                   // bug as the earlier ground-emissive landmine above) — and the old
                                   // gate below applied the boost to EVERY material, not just
                                   // glass/metal, because `envMapIntensity` defaults to 1.0 (a
                                   // number) on ALL MeshStandardMaterial regardless of roughness, so
                                   // the `typeof m.envMapIntensity !== 'number'` check never actually
                                   // excluded plain concrete/plaster walls. Fixed by gating on
                                   // glossiness below; boost itself also dialed back one notch
                                   // per "glint is slightly too much.")
  var PHOTO_GLOSSY_ROUGHNESS_MAX = 0.5;  // only materials this glossy or better (glass ~0.05-0.08,
                                          // tightened/native metal ~0.3-0.5) get the envMap boost —
                                          // excludes concrete/plaster/wood (STD_MAT rough 0.6-0.95),
                                          // whose shadow-darkened diffuse read must stay untouched.
  // §PHOTO_HOTSPOT (user ask: "tiny bright reflect off any part of the building that is steel or
  // smooth... just like a real scene" — the direct-glint effect you get when the sun is roughly
  // behind the camera, reflecting straight back off any glossy surface). envMapIntensity alone
  // boosts the SOFT ambient reflection; a crisp small "hotspot" specular highlight also needs
  // low roughness. Only touches materials already classed metallic (metalness>0.3 — same threshold
  // streaming.js's own STD_MAT table already uses for "metal" elsewhere), not every surface.
  var PHOTO_METAL_THRESHOLD = 0.3;
  var PHOTO_METAL_ROUGHNESS_SCALE = 0.4;  // tighter/brighter specular highlight (was 0.6)
  // ══ §MIRROR_TRUE_REFLECT (PHOTOREAL_STILL_RENDER.md ▶RESUME item 1) — mirrors are IfcFlowTerminal,
  // and STD_MAT.IfcFlowTerminal carries envInt:0.05 (§HOSPITAL_BLUE_TINT/§PIPE_DUCT_BLUE_TINT — a
  // fix meant to kill a blue-sky-tint on pipes/ducts, applied class-wide). That sets
  // mat.userData._photoEnvExempt=true in streaming.js's _getMaterial(), which is
  // _reassertPhotoMatBoost's very FIRST early-return guard below — mirrors get swept up in a fix
  // meant for a different fixture and never get boosted, never get room-probe-eligible, never get a
  // true-mirror roughness. Confirmed exclusive by direct DB query (Clinic): the 22 real
  // "M_Mirror:Mirror 600mm x 900mm" elements carry material_rgba 0.843,0.843,0.843,1.000 — not
  // shared with any other IfcFlowTerminal fixture in the building (grab bars/lights/exit signs/etc
  // all carry distinct rgba values). streaming.js _getMaterial's cacheKey includes rgba+class, so
  // this is a genuinely exclusive material — excluding it from the exemption cannot leak into
  // diffusers/grilles/any other fixture sharing the class. Lookup uses the same
  // name-keyword-query-via-elements_meta pattern as §PHOTO_EMBER's EMBER_WORDS, cached per building.
  var _mirrorMatSet = null, _mirrorMatBuilding = null, _mirrorMeshList = [], _mirrorOwnSaved = [];
  // §MIRROR_OWN_MAT (bim-compiler PHOTOREAL_STILL_RENDER.md §MIRROR_OWN_MAT, red1 2026-09-30 "exploit [the glass reflection quality] and
  // use the mirror finishing on those IFCs"). MEASURED …720801650: the mirror shared the MEP material (10ad10), which §MIRROR_TRUE_REFLECT
  // mirror-finished for every element on it, and reflected one building-centre probe x the sky-view gate (F 0) -> black. Each mirror mesh
  // (Clinic: 5 meshes holding only the 22 mirrors) gets ONE dedicated material for the still: IFC colour, metal 1, roughness 0.02,
  // env = the §GLASS_ENV capture of this press, SL_MIRROR (sourced_light.js slMirK: no sky gate).
  function _mirrorOwnApply(filmCaptured) {
    // stills; films only once §FILM_GLASS_ENV (A._filmParityStep) has captured the room — without a capture, SL_MIRROR (no sky gate)
    // would show the sky HDRI indoors
    if (A._maxqActive && !filmCaptured) { console.log('§MIRROR_OWN_MAT skipped (film: waits for its first §FILM_GLASS_ENV capture)'); return; }
    _mirrorReflectMats(); if (!_mirrorMeshList.length || _mirrorOwnSaved.length) return;
    var byCol = Object.create(null), mats = [], ok = 0;
    _mirrorMeshList.forEach(function(o) {
      var g = null, rgba = null; for (var k in A.guidMap) if (String(k).split('_')[0] === String(o.id)) { g = A.guidMap[k]; break; }
      try { var r = g && A.dbQuery ? A.dbQuery("SELECT material_rgba FROM elements_meta WHERE guid='" + String(g).replace(/'/g, "''") + "'") : null; rgba = r && r[0] && r[0][0]; } catch (e) {}
      var c = (rgba ? String(rgba).split(',').slice(0, 3).map(Number) : [0.85, 0.85, 0.85]), key = c.join(',');
      var mm = byCol[key]; if (!mm) { mm = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.02, envMapIntensity: 1 }); mm.color.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
        mm.defines = { SL_MIRROR: '' }; mm.userData.slMirror = true; mm.userData._photoEnvExempt = true; mm.envMap = A._envMap || null; byCol[key] = mm; mats.push(mm);
        // §MIRROR_PARALLAX (red1 2026-09-30 "yes"): the capture is one cube at the camera, looked up by DIRECTION (infinite distance) -> in a
        // small room the mirror shows the wrong part of it and does not follow the view. Box projection (the standard local-probe
        // correction): the reflected ray from the fragment's WORLD point is intersected with the capture room's box (glass_fresnel.js
        // capture sets uMirBoxMin/Max/CapPos from the zone grid around the camera); the cube is read toward that hit from the capture point.
        mm.userData.mirU = { uMirBoxMin: { value: new THREE.Vector3() }, uMirBoxMax: { value: new THREE.Vector3() }, uMirCapPos: { value: new THREE.Vector3() }, uMirBoxOn: { value: 0 } };
        mm.onBeforeCompile = function(sh) { var U = this.userData.mirU; for (var u in U) sh.uniforms[u] = U[u];
          if (window.GlassFresnel && window.GlassFresnel.patchShader) window.GlassFresnel.patchShader(sh);   // §GLASS_PLANAR_REFL: a flat mirror reads its plane's mirror render (before the expansion below)
          sh.fragmentShader = sh.fragmentShader.replace('#include <envmap_physical_pars_fragment>', '#include <envmap_physical_pars_fragment>\n' +
            'uniform vec3 uMirBoxMin; uniform vec3 uMirBoxMax; uniform vec3 uMirCapPos; uniform float uMirBoxOn;\n' +
            'vec3 slMirBoxRad( vec3 posView, vec3 viewDir, vec3 normal, float roughness ) {\n#ifdef ENVMAP_TYPE_CUBE_UV\n' +
            '  vec3 r = normalize( transformDirectionByInverseViewMatrix( reflect( - viewDir, normal ), viewMatrix ) );\n' +
            '  if ( uMirBoxOn > 0.5 ) { vec3 wp = ( inverse( viewMatrix ) * vec4( posView, 1.0 ) ).xyz; vec3 rs = sign( r ) * max( abs( r ), vec3( 1e-5 ) ); vec3 tf = max( ( uMirBoxMax - wp ) / rs, ( uMirBoxMin - wp ) / rs );\n' +
            '    float d = min( min( tf.x, tf.y ), tf.z ); if ( d > 0.0 ) r = normalize( wp + r * d - uMirCapPos ); }\n' +
            '  return textureCubeUV( envMap, envMapRotation * r, roughness ).rgb * envMapIntensity;\n#else\n  return vec3( 0.0 );\n#endif\n}\n')
            .replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps.replace('getIBLRadiance( geometryViewDir, geometryNormal, material.roughness )', 'slMirBoxRad( geometryPosition, geometryViewDir, geometryNormal, material.roughness )')); };
        mm.customProgramCacheKey = function() { return 'slMirrorBox2'; }; }
      _mirrorOwnSaved.push([o, o.material]); o.material = Array.isArray(o.material) ? o.material.map(function() { return mm; }) : mm; ok++; });
    A._mirrorOwnMats = mats;
    console.log('§MIRROR_OWN_MAT applied meshes=' + ok + ' materials=' + mats.length + ' colours=[' + Object.keys(byCol).join(' | ') + '] (IFC material_rgba, metal 1, rough 0.02, env = §GLASS_ENV capture, no sky gate)');
  }
  function _mirrorOwnRestore() {
    if (!_mirrorOwnSaved.length) return; _mirrorOwnSaved.forEach(function(s) { s[0].material = s[1]; });
    console.log('§MIRROR_OWN_MAT restored meshes=' + _mirrorOwnSaved.length); _mirrorOwnSaved = []; A._mirrorOwnMats = [];
  }
  function _mirrorReflectMats() {
    if (_mirrorMatSet && _mirrorMatBuilding === A.activeBuilding) return _mirrorMatSet;
    _mirrorMatSet = Object.create(null);
    _mirrorMatBuilding = A.activeBuilding;
    if (typeof A.dbQuery !== 'function' || !A.guidMap || !A.collectMeshes) return _mirrorMatSet;
    var rows;
    try {
      rows = A.dbQuery("SELECT guid FROM elements_meta WHERE ifc_class='IfcFlowTerminal' AND lower(element_name) LIKE '%mirror%'") || [];
    } catch (e) { console.warn('§MIRROR_TRUE_REFLECT query failed: ' + e.message); return _mirrorMatSet; }
    if (!rows.length) { console.log('§MIRROR_TRUE_REFLECT bld=' + A.activeBuilding + ' no mirrors — nothing to fix'); return _mirrorMatSet; }
    var want = Object.create(null);
    for (var i = 0; i < rows.length; i++) want[rows[i][0]] = 1;
    var ids = Object.create(null), hits = 0;
    for (var k in A.guidMap) if (want[A.guidMap[k]]) { ids[parseInt(String(k).split('_')[0], 10)] = 1; hits++; }
    var meshes = 0, mats = 0; _mirrorMeshList = [];
    A.collectMeshes(function(o) { return o.isMesh; }).forEach(function(o) {
      if (!ids[o.id]) return;
      meshes++; _mirrorMeshList.push(o);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m) {
        if (!m) return; mats++;   // §MIRROR_OWN_MAT: the shared material is NOT mirror-finished any more (it also carries grab bars etc.)
      });
    });
    console.log('§MIRROR_TRUE_REFLECT bld=' + A.activeBuilding + ' guids=' + rows.length +
      ' guidMapHits=' + hits + ' meshes=' + meshes + ' materials=' + mats);
    return _mirrorMatSet;
  }
  // §PHOTO_HEMI_FILL (user ask, "Ground still too dark"): re-read _setGroundColor (tools.js) and
  // found the actual bug — when the ground has a texture map (which it does, 'paved'), that
  // function IGNORES whatever hex tint is passed and forces plain WHITE (full brightness, no
  // darkening) as long as the tint's own channel-sum isn't very dark. So the ground was ALREADY
  // rendering at maximum brightness for its given light level — no tint could ever make it
  // brighter than that. The real cause is physical: PHOTO_SUN_ELEVATION=6 degrees is a nearly
  // horizontal ray — a horizontal ground plane's illumination from a directional light scales
  // with sin(elevation) (~10% at 6 degrees), while a VERTICAL facade gets nearly full illumination
  // from the same ray (cos of a near-90-degree incidence) — the dramatic-facade / dim-ground
  // split is real dusk-lighting physics, not a bug. Fix: boost the hemisphere/ambient fill
  // (omnidirectional sky light, doesn't depend on the sun's grazing angle) specifically for the
  // photoshoot, like a photographer's fill card compensating for what direct light can't reach.
  // §PHOTO_CONTRAST_DIALBACK (user reported "Shadows? None on the ground" + roof/ground spotlights
  // not distinctly visible right after 1.6/1.3 shipped): a strong blanket fill flattens the whole
  // scene toward the same brightness, which dilutes the RELATIVE contrast the shadow and the
  // discrete point-light addons depend on to read as distinct. Dialed back — some lift over the
  // raw sin(6 deg) ground darkness, not enough to wash out contrast.
  var PHOTO_HEMI_INTENSITY_SCALE = 1.0;    // was 1.25 — §MOVIE_SHADOW_TM (fill no longer lifted above TM's)
  var FILM_FILL_AMBIENT = 0.785, FILM_FILL_HEMI = 1.257;   // §FILM_FILL_RESTORE — pre-#1601 scene.js values (TM's balance)
  var _filmFillSaved = null;
  var _stillBaseSaved = null;   // §STILL_BASE
  var _ghostSuspendedByStill = false;   // §STILL_GHOST_OWNERSHIP
  var _albedoSaved = [], _expSaved = null;   // §ALBEDO_SRGB
  // §STILL_DIALS — one Alt+S dial: APP[key] if a number, else &name=<num> in the URL, else def; clamped 0..max.
  // §LAMP_UNCAPPED — the still's lamps as the logs need them: the data path's list when it is on, else the pool's point lights
  function _stillLampList() {
    if (A._lampDataOn && A._lampData) return A._lampData.lamps.map(function(q) { return { intensity: q.I, position: new THREE.Vector3(q.x, q.y, q.z), decay: A._lampData.decay, distance: q.range }; });
    return A._nightLights || [];
  }
  function _stillDial(key, name, def, max) {
    var v = (typeof A[key] === 'number') ? A[key] : null;
    if (v == null) { var m = new RegExp('[?&]' + name + '=([0-9.]+)').exec(location.search); v = m ? parseFloat(m[1]) : def; }
    return Math.max(0, Math.min(max, isFinite(v) ? v : def));
  }
  var PHOTO_AMBIENT_INTENSITY_SCALE = 1.0;  // was 1.15 — §MOVIE_SHADOW_TM (fill no longer lifted above TM's)
  // §GROUND_ALBEDO — the multiplicative lever the two paragraphs above never had. Everything they
  // describe is ADDITIVE (emissive add; hemi/ambient fill), which is exactly why both flattened the
  // cast shadow; this one scales lit and shadowed ground by the same factor. The claim that the
  // ground was "ALREADY rendering at maximum brightness… no tint could ever make it brighter" is
  // wrong: _setGroundColor forces WHITE under a map, and white is the multiplicative identity, not
  // a ceiling. Full analysis + the 52:1 arithmetic: PHOTOREAL_STILL_RENDER.md §GROUND_DARK_RETHINK.
  // MEASURED, not assumed: linear-average luminance of viewer/textures/ground/paved_1k.jpg over a
  // 128x128 downsample, sRGB-decoded — the same method textures/materials/NOTICE.txt already uses
  // to derive each TRIPLANAR_MAT normFactor (concrete 0.723, plaster 0.742, metal 0.535).
  var GROUND_TEX_AVG_LUM = 0.155;
  A._photoGroundAlbedoGain = 2.3;   // 2.3 x 0.155 = 0.36 albedo. Console-tunable for A/B.
  var _photoSunPosSaved = null, _photoSunTargetSaved = null;
  var _photoFlarePrevTone = null, _photoHaloPrevTone = null;
  var _photoEnvBoostedMats = [];
  var _photoMatBoostActive = false;
  // §PHOTO_STREAMING_RACE (user ask, continued — "shadows on rooftop still not there"): the
  // original one-shot traverse (both for shadow-casting AND the material envMap/roughness boost)
  // only covers whatever meshes/materials exist in A.scene/A._matCache at the EXACT moment Alt+S
  // fires. Hospital's rooftop content (589 trees, helipad, 567 solar panels — confirmed real via
  // direct DB query, not guessed) may stream/load lazily and not exist yet at that instant — the
  // one-shot push would silently skip them forever, the same class of bug already found+fixed
  // once this session for the triplanar shader uniform (§TRIPLANAR_RECOMPILE_FIX), just not
  // applied here the first time. Fix: re-run both traversals every accumulation frame (idempotent
  // — already-flagged objects/materials are skipped instantly) from startStillRefine's step()
  // loop below, so anything that streams in mid-accumulation still gets caught within the same
  // still-refine, not just at the first instant.
  function _reassertPhotoShadowCoverage(force) {
    if (!_photoShadowSelfEnabled || !A.scene) return;
    var _idx = A.streamIdx || 0, _kids = A.scene.children.length, _vis = A._visibilityGen || 0;
    // §PHOTO_SHADOW_FINALCAPTURE (2026-07-25): the skip-gate below is safe for the accumulation
    // ticks it was built for, but the LAST reassert before a frame is handed off (Alt+S freeze /
    // MaxQ per-frame capture) must never be a skip — a skipped final tick means the captured frame
    // inherits whichever shadow-caster state happened to be cached, not a guaranteed-fresh one.
    // `force` bypasses the gate for exactly that one caller (_finishStillRefine), at the cost of
    // one extra traverse per finished/captured frame, not per tick.
    var _wouldSkip = (_idx === _photoShadowCheckIdx && _kids === _photoShadowCheckKids && _vis === _photoShadowCheckVis);
    if (!force && _wouldSkip) {
      _photoShadowReassertSkips++;
      return;  // nothing streamed, nothing added to the scene, nothing re-filtered — a fresh traverse would find nothing new
    }
    // forcedSaves: how many times THIS SPECIFIC forced call is the only reason a real traverse ran
    // — i.e. the exact case §PHOTO_SHADOW_FINALCAPTURE exists for (a captured frame that would
    // otherwise have inherited a stale/skipped shadow-caster state).
    if (force && _wouldSkip) _photoShadowForcedSaves++;
    _photoShadowCheckIdx = _idx; _photoShadowCheckKids = _kids; _photoShadowCheckVis = _vis;
    _photoShadowReassertRuns++;
    var changed = false, _visMeshes = 0, _flippedOn = 0;
    A.scene.traverse(function(o) {
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible) return;
      if (o.userData && o.userData.excludeFromShadow) return;   // §DATUM_NO_SHADOW — annotation geometry, not a real caster
      _visMeshes++;
      if (!o.castShadow) {
        o.castShadow = true; o.receiveShadow = true; changed = true; _flippedOn++;
      }
    });
    if (changed && A.renderer) A.renderer.shadowMap.needsUpdate = true;
    if (force) console.log('§PHOTO_SHADOW_FORCE_REASSERT visMeshes=' + _visMeshes +
      ' flippedOn=' + _flippedOn + ' (0 flipped = every visible mesh already had castShadow on)');
  }
  // §PHOTO_ENVMAP_STALE (user ask: "sunlight bounce has not occurred even once" — found the real
  // cause, not a tuning miss): streaming.js assigns each material's `.envMap` ONCE, at streaming
  // time, from whatever `A._envMap` was then — Hospital's 63,182 elements finish streaming almost
  // immediately on page load, long before Alt+S, so every material is permanently locked to the
  // DAYTIME env map baked at startup (sun elevation 45°/azimuth 180°, scene.js:225). The dusk
  // photoshoot repositions the real sun + regenerates a fresh env map (`A.updateSky`'s throttled
  // `_pmrem.fromScene`, scene.js:204-212) but never pushes that new texture back onto existing
  // materials — they kept reflecting a sun that isn't where the dusk scene actually put it, so no
  // camera angle could ever catch a correctly-aligned glint. Fix: refresh `.envMap` from the
  // CURRENT `A._envMap` unconditionally, every reassert tick (cheap reference swap) — decoupled
  // from the one-time `_photoBoosted` intensity/roughness flag below, since the fresh dusk texture
  // can arrive (2s-throttled) well after a material was already flagged boosted.
  // §SUN_FILL_RATIO (2026-09-02, PHOTOREAL_STILL_RENDER.md — user, film review: "Wall away from
  // Sun shadow?"). Shared glossiness predicate, so _reassertPhotoEnvMap below and
  // _reassertPhotoMatBoost cannot disagree about which materials are "reflective" — and so the
  // envMap decision does not depend on which of the two ran first this tick.
  function _isPhotoGlossyMat(m) {
    if (!m) return false;
    if (m.userData && m.userData._photoRoomProbeEligible) return true;   // mirror/room-probe set
    if (typeof m.metalness === 'number' && m.metalness > PHOTO_METAL_THRESHOLD) return true;
    return typeof m.roughness === 'number' && m.roughness <= PHOTO_GLOSSY_ROUGHNESS_MAX;
  }
  A._isPhotoGlossyMat = _isPhotoGlossyMat;  // witness reads the SAME predicate, never a copy of it
  A._photoMatteSkyEnv = true;               // §SUN_FILL_RATIO is present in this build
  // §SFR_UNIFORM_NOT_DEFINE — the matte set's staged env contribution. 0 reproduces the map-swap's
  // picture exactly; it is the U-11 dial, not a tuning knob to move casually.
  var SFR_MATTE_ENV_I = 0;
  var _sfrTouched = {};     // materials whose envMapIntensity this pass moved, restored at teardown
  function _reassertPhotoEnvMap() {
    if (!A._matCache || !A._envMap) return;
    Object.keys(A._matCache).forEach(function(k) {
      var m = A._matCache[k];
      if (!m || !('envMap' in m)) return;
      // §MIRROR_ROOM_PROBE: glossy/metal + mirror materials (flagged once by _reassertPhotoMatBoost
      // below) reflect the local room-probe capture instead of the static sky, once it's built —
      // this function already runs every accumulation tick, so it naturally upgrades them from the
      // sky fallback to the real probe the moment _buildRoomProbe() finishes, no separate loop needed.
      //
      // §SUN_FILL_RATIO: MATTE materials stay on the plain-navigation sky env map instead of taking
      // the staged HDRI. This is not a new policy — it is the SAME policy PHOTO_GLOSSY_ROUGHNESS_MAX
      // already states above ("excludes concrete/plaster/wood, whose shadow-darkened diffuse read
      // must stay untouched"), closing the route that bypassed it. That gate limits the INTENSITY
      // multiplier, but staging also swaps the MAP itself to belfast_sunset_puresky_1k.hdr for every
      // material, and IBL is NOT shadow-map-occluded in three.js (the documented root cause of the
      // earlier "all shadows on building are gone" report, see PHOTO_ENVMAP_BOOST's history above).
      // MEASURED on Clinic, real render, scene-linear: on a wall facing AWAY from the live sun the
      // env term is 0.033 of 0.153 total in plain navigation (21%) but 0.440 of 0.582 (76%) once
      // staged — a 13x unshadowed fill that took the away/sun separation from 0.24 to 0.74 and
      // erased §WALL_SIDE_AND_LIGHT_FLOOR's (PR #1601) shipped contrast in the photoreal path.
      // The HDRI stays exactly where it was introduced to work: reflections on glass and metal.
      // Witness: viewer/tests/witness_sun_fill_ratio.js (§SFR_* lines).
      // ══ §SFR_UNIFORM_NOT_DEFINE (2026-09-04, user: "have a proper handling code that nails what
      // u doing and not create the impact") ═══════════════════════════════════════════════════════
      // §SUN_FILL_RATIO expressed "matte surfaces must not take the staged HDRI" by SWAPPING THE MAP,
      // which parks a SECOND texture reference (`_photoEnvMapSaved`) on every matte material for the
      // whole of staging. `A.updateSky()` DISPOSES the previous render target on each regen
      // (scene.js:227 §MEMLEAK_PMREM_DISPOSE), so that parked reference can outlive its GPU
      // resource — per material, intermittently, which is the shape of the user's report: some
      // panels of a curtain wall gone and their neighbours fine, at full build, in a bake that was
      // clean two days earlier.
      // ⚠ HONESTY NOTE, because the first draft of this comment claimed otherwise and the witness
      // disproved it: this is NOT about recompile churn. `envMap` is a DEFINE and a swap does cost a
      // recompile, but MEASURED in witness_sfr_uniform_not_define.js the two-target version actually
      // recompiles FEWER times under a regenerating sky (10 vs 16 over 3 regens), because the matte
      // set is pinned to a stable reference. The defect being closed here is the STALE REFERENCE,
      // not the recompile count. Claim what the instrument says, not what the theory wanted.
      //
      // THE POLICY IS UNCHANGED. What changes is the LEVER: `envMapIntensity` is a UNIFORM, so the
      // same "no staged fill on matte" result costs zero recompiles and creates no second reference
      // that can outlive its texture. This is the codebase's own precedent, not a new idea —
      // §NIGHT_BAKE_POOL froze the point-light COUNT and dims unused slots to intensity 0 for the
      // identical reason ("an intensity is a uniform"), and §CPE_TAIL_LIGHTS_ALL_ONLY follows it too.
      //
      // NOT INVENTED: the matte factor is 0, which is byte-equivalent to what the map swap produced —
      // this fix changes the MECHANISM, not the picture. The interior cost §SUN_FILL_RATIO declared
      // (Hospital retention 0.411 against a 0.70 floor) is UNTOUCHED and remains the open U-11
      // decision; raising this factor is that decision's one dial, and it is the user's to set.
      var target = (m.userData && m.userData._photoRoomProbeEligible && _roomProbeRT)
        ? _roomProbeRT.texture : A._envMap;
      if (m.envMap !== target) { m.envMap = target; m.needsUpdate = true; }
      if (A._photoMatteSkyEnv !== false) {
        var _wantI = _isPhotoGlossyMat(m) ? (m.userData._sfrBaseEnvI != null ? m.userData._sfrBaseEnvI : m.envMapIntensity)
                                          : SFR_MATTE_ENV_I;
        if (m.userData._sfrBaseEnvI == null) m.userData._sfrBaseEnvI = m.envMapIntensity;
        if (m.envMapIntensity !== _wantI) m.envMapIntensity = _wantI;   // uniform — NO needsUpdate
        _sfrTouched[m.uuid] = m;
      }
    });
  }
  // §ZERO Z9 late decode: a material streamed in AFTER staging (the S4 "pushed materials 105->109" class) is decoded on the
  // same per-tick walk, so a still never mixes decoded and raw albedos. Same saved-list / restore as the staging walk.
  var _albedoDecSet = null, _albedoLateN = 0;
  function _albedoLateDecode() {
    if (!_albedoDecSet || !A._matCache || !window.LightLaw || !window.LightLaw.decodeAlbedo) return;
    var gm = A.ground && A.ground.material;
    Object.keys(A._matCache).forEach(function(k) {
      var m = A._matCache[k];
      if (!m || _albedoDecSet.has(m) || !m.color || !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return;
      _albedoDecSet.add(m);
      var sv = [m, m.color.getHex(), m.color.r, m.color.g, m.color.b];
      if (window.LightLaw.decodeAlbedo(m.color, { isGround: m === gm })) { sv[5] = m.color.getHex(); _albedoSaved.push(sv); _albedoLateN++; }
    });
  }
  function _reassertPhotoMatBoost() {
    _albedoLateDecode();
    if (!_photoMatBoostActive || !A._matCache) return;
    var mirrorMats = _mirrorReflectMats();  // §MIRROR_TRUE_REFLECT — cached per building, cheap to call every tick
    Object.keys(A._matCache).forEach(function(k) {
      var m = A._matCache[k];
      if (!m) return;
      var isMirror = !!mirrorMats[m.uuid];  // §MIRROR_TRUE_REFLECT — exclusive material, bypasses the exemption below
      if ((m.userData && (m.userData._photoBoosted || (m.userData._photoEnvExempt && !isMirror))) ||
          typeof m.envMapIntensity !== 'number') return;
      // §PHOTO_ENVMAP_DOUBLE_BOOST_FIX (2026-08-15): _photoEnvExempt (streaming.js's per-class
      // §HOSPITAL_BLUE_TINT envInt override) skips this blanket boost entirely — that override was
      // already hand-tuned to fight the sky's blue PMREM reflection on these specific classes;
      // re-boosting on top of it undid the tuning specifically during Alt+S/Alt+G captures.
      var isMetal = typeof m.metalness === 'number' && m.metalness > PHOTO_METAL_THRESHOLD;
      var isGlossy = isMirror || isMetal || (typeof m.roughness === 'number' && m.roughness <= PHOTO_GLOSSY_ROUGHNESS_MAX);
      if (isGlossy) {
        m.userData._photoOrigEnvMapIntensity = m.envMapIntensity;
        m.envMapIntensity = m.envMapIntensity * PHOTO_ENVMAP_BOOST;
        m.userData._photoRoomProbeEligible = true;  // §MIRROR_ROOM_PROBE — read every tick by _reassertPhotoEnvMap above
      }
      if (isMetal || isMirror) {
        m.userData._photoOrigRoughness = m.roughness;
        // §MIRROR_TRUE_REFLECT: a real mirror is near-perfect specular, not tightened-metal —
        // force near-zero roughness instead of the metal scale-down.
        m.roughness = isMirror ? 0.03 : Math.max(0.05, m.roughness * PHOTO_METAL_ROUGHNESS_SCALE);
      }
      // §MIRROR_TRUE_REFLECT_METALNESS (found live 2026-08-16+1 — the roughness-only fix above
      // shipped but user reported "still not reflection in mirror"): STD_MAT.IfcFlowTerminal's
      // metal:0.30 was never touched by the fix above. MeshStandardMaterial's PBR split is driven
      // by metalness, not roughness — at metalness 0.3 the BRDF still blends ~70% diffuse albedo
      // into the output (diffuseColor = albedo*(1-metalness)), so even a perfectly sharp, boosted
      // envMap reflection reads as a faint sheen on top of a mostly-flat grey surface, not a mirror
      // image. Roughness alone controls how BLURRY a reflection is, not how STRONG it is relative
      // to diffuse — the two are independent PBR parameters, and only one was fixed. Force
      // near-1.0 metalness for mirrors specifically (glass/other glossy classes keep their real
      // metalness — this is mirror-only, gated by the same `isMirror` exclusivity as the rest of
      // this fix).
      if (isMirror) {
        m.userData._photoOrigMetalness = m.metalness;
        m.metalness = 0.95;
      }
      m.userData._photoBoosted = true;
      m.needsUpdate = true;
      if (isGlossy) _photoEnvBoostedMats.push(m);
    });
  }
  // §PHOTO_DUSK_SHADOWS: real shadow-casting at the dusk sun angle (the "long shadow... dramatic
  // Sun at dusk as shown in Time Machine" ask) — reuses time_machine.js's own proven sun-cycle
  // shadow mechanics (real castShadow/receiveShadow traverse + shadow-camera frustum sized to the
  // building envelope), NOT reinvented, just triggered from here instead of the 'h' Shadow pill.
  // If the user's OWN Shadow mode is already on, this leaves it alone entirely — never double-set.
  var _photoShadowSelfEnabled = false;
  var _stillFitBox = null, _shadowRadiusSaved = null;
  var _fitState = null;   // §STILL_SHADOW_FIT — env, centre, building corners; film size hysteresis
  function _fitOn() {
    return !!(_fitState && _photoShadowSelfEnabled && A.sun && A.sun.castShadow && A.camera && A.camera.isPerspectiveCamera &&
      (!A._maxqActive || A._filmParity) && !(A._stillShadowFit === false || /[?&]shadowfit=0/.test(location.search)));
  }
  // The fit. A caster that shades a visible point lies on the sun ray through it and this ortho camera keeps the whole ray
  // (near/far untouched), so the x/y box only has to hold the light-space footprint of what can be SHADED in view:
  //   view footprint (frustum, far clipped at the farthest building corner, or the farthest kept prop)
  //   ∩ bound( building footprint  ∪  each skyline prop whose footprint meets the view footprint )   ∩ ±env.
  // The building's own ground shadow projects inside its footprint; the props' union keeps the distant silhouettes'
  // shadows on far ground (red1's old "silhouette buildings cannot cast shadows"; the #1766 exterior brightening).
  // film=true: size quantised UP to 8 m steps with hysteresis (shrinks only by 2+ steps) and the centre snapped to whole
  // texels, so edges do not crawl frame to frame; every size change is counted and logged.
  function _stillFitApply(film, measureOnly) {
    if (!_fitOn()) return null;
    var env = _fitState.env, sc = A.sun.shadow.camera, cam = A.camera, mz = A.sun.shadow.mapSize.width;
    A.sun.updateMatrixWorld(); A.sun.shadow.updateMatrices(A.sun); cam.updateMatrixWorld();
    var inv = sc.matrixWorldInverse, q = new THREE.Vector3(), fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    function rect() { return { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }; }
    function add(R, x, y, z) { q.set(x, y, z).applyMatrix4(inv); R.x0 = Math.min(R.x0, q.x); R.x1 = Math.max(R.x1, q.x); R.y0 = Math.min(R.y0, q.y); R.y1 = Math.max(R.y1, q.y); }
    var B = rect(), dFar = 0;
    _fitState.corners.forEach(function(c) { dFar = Math.max(dFar, q.set(c.x, c.y, c.z).sub(cam.position).dot(fwd)); add(B, c.x, c.y, c.z); });
    // Props only when the camera is known to be OUTSIDE: indoors the frustum reaches them through walls it cannot see past,
    // and the union blew the box up to the whole site (HHS interior: 334 m, gain 1.08x — measured).
    var outside = A._stillCamInsideNow === false;
    var props = [], sky = outside && FXS._photoSkyline && FXS._photoSkyline.visible ? FXS._photoSkyline : null, bb = new THREE.Box3();
    if (sky) sky.traverse(function(o) { if (!(o.isMesh || o.isInstancedMesh) || !o.visible) return; bb.setFromObject(o); if (bb.isEmpty()) return;
      var R = rect(); R.bb = bb.clone(); for (var k = 0; k < 8; k++) add(R, k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z);
      var far = 0; for (var k2 = 0; k2 < 8; k2++) far = Math.max(far, q.set(k2 & 1 ? bb.max.x : bb.min.x, k2 & 2 ? bb.max.y : bb.min.y, k2 & 4 ? bb.max.z : bb.min.z).sub(cam.position).dot(fwd));
      R.far = far; props.push(R); });
    function viewRect(depth) {
      var V = rect(), k = Math.min(1, Math.max(0, depth) / cam.far);
      [-1, 1].forEach(function(nx) { [-1, 1].forEach(function(ny) {
        var pN = new THREE.Vector3(nx, ny, -1).unproject(cam), pF = new THREE.Vector3(nx, ny, 1).unproject(cam);
        pF.sub(cam.position).multiplyScalar(k).add(cam.position);
        add(V, pN.x, pN.y, pN.z); add(V, pF.x, pF.y, pF.z); }); });
      return V;
    }
    var V = viewRect(dFar), U = { x0: B.x0, x1: B.x1, y0: B.y0, y1: B.y1 }, kept = 0;
    var meets = function(R, S) { return R.x0 < S.x1 && R.x1 > S.x0 && R.y0 < S.y1 && R.y1 > S.y0; };
    var dMax = dFar; props.forEach(function(R) { if (R.far > 0) dMax = Math.max(dMax, R.far); });
    var Vp = props.length ? viewRect(dMax) : V;   // the view out to the props, for the props' own test
    props.forEach(function(R) { if (meets(R, Vp)) { kept++; R.kept = true; U.x0 = Math.min(U.x0, R.x0); U.x1 = Math.max(U.x1, R.x1); U.y0 = Math.min(U.y0, R.y0); U.y1 = Math.max(U.y1, R.y1); } });
    if (kept) V = Vp;
    var M = 2;   // m — PCF taps + TAA jitter
    var l = Math.max(-env, Math.max(V.x0, U.x0) - M), r = Math.min(env, Math.min(V.x1, U.x1) + M),
        b = Math.max(-env, Math.max(V.y0, U.y0) - M), t = Math.min(env, Math.min(V.y1, U.y1) + M);
    if (!(r - l > 1 && t - b > 1)) { l = -env; r = env; b = -env; t = env; }
    var w = r - l, h = t - b, cx = (l + r) / 2, cy = (b + t) / 2, changed = false;
    if (measureOnly) return { w: w, h: h };
    // §FILM_FIT_PER_SHOT (spec v2 item 2): the box size is fixed per SHOT (plan.beats intervals), precomputed from the plan's
    // own poses + that shot's sun before the film; only the centre moves per frame (whole-texel snapped). A frame that
    // still needs more than its shot box (pose approximation) grows that shot once and is counted (shotGrow).
    var shot = film && _fitState.shots ? _fitState.shots.find(function(S) { return A._filmTnNow >= S.a && A._filmTnNow <= S.b; }) : null;
    if (film && shot) {
      if (w > shot.w || h > shot.h) { shot.w = Math.max(shot.w, Math.ceil(w / 8) * 8); shot.h = Math.max(shot.h, Math.ceil(h / 8) * 8); shot.grow = (shot.grow || 0) + 1; changed = true; }
      if (_fitState.shotNow !== shot) { _fitState.shotNow = shot; console.log('§FILM_FIT_SHOT enter shot=' + shot.i + ' [' + shot.a.toFixed(3) + ',' + shot.b.toFixed(3) + '] box=' + shot.w + 'x' + shot.h + 'm texel=' + (Math.max(shot.w, shot.h) / mz).toFixed(4) + ' samples=' + shot.n); }
      w = shot.w; h = shot.h;
      var tx0 = w / mz, ty0 = h / mz; cx = Math.round(cx / tx0) * tx0; cy = Math.round(cy / ty0) * ty0;
      if (changed) _fitState.changes++;
      l = cx - w / 2; r = cx + w / 2; b = cy - h / 2; t = cy + h / 2;
    } else if (film) {
      // §FILM_FIT_GROW_ONLY (2026-09-25, measured: 8 m steps with shrink hysteresis changed size 16x in a 120-frame Hospital
      // clip — the texel changes each time and edges would crawl). Films now GROW only, in 32 m steps, and never shrink
      // inside the film, so the texel can only coarsen a few times and never flickers back and forth.
      var STEP = 32, qw = Math.min(2 * env, Math.ceil(w / STEP) * STEP), qh = Math.min(2 * env, Math.ceil(h / STEP) * STEP);
      if (qw > _fitState.sizeW) { if (_fitState.sizeW) changed = true; _fitState.sizeW = qw; }
      if (qh > _fitState.sizeH) { if (_fitState.sizeH) changed = true; _fitState.sizeH = qh; }
      w = _fitState.sizeW; h = _fitState.sizeH;
      var tx = w / mz, ty = h / mz; cx = Math.round(cx / tx) * tx; cy = Math.round(cy / ty) * ty;   // whole-texel centre
      if (changed) _fitState.changes++;
      l = cx - w / 2; r = cx + w / 2; b = cy - h / 2; t = cy + h / 2;
    }
    sc.left = l; sc.right = r; sc.bottom = b; sc.top = t;
    var texel = Math.max(w, h) / mz;
    A.sun.shadow.normalBias = (window.__noNormalBias ? 0 : 2 * texel);
    var edgeLine = (!film && _edgeOn()) ? _stillEdgeDepth(sc, inv, l, r, b, t, props, texel) : '';
    // §FILM_SHADOW_EDGE (bim-compiler prompts/ALTC_FOUNDATION.md "§FILM_INHERIT" item 2): the same edge rule in films, on the per-shot
    // box. The depth range is held per SHOT and only grows (union of every frame's range in that shot), so near/far — and with them
    // the depth precision — cannot shimmer frame to frame; bias = -1/65536 and normalBias = (R+1.5) texels are constant per shot anyway.
    // &filmshadowedge=0 = the previous film values (2 x texel, sun-distance range).
    if (film && shot && _edgeOn() && !/[?&]filmshadowedge=0/.test(location.search)) {
      var _eLine = _stillEdgeDepth(sc, inv, l, r, b, t, props, texel), _eL = _stillEdgeDepth.last;
      if (_eL) {
        var _grow = !shot.edge || _eL.near < shot.edge.near || _eL.far > shot.edge.far;
        shot.edge = shot.edge ? { near: Math.min(shot.edge.near, _eL.near), far: Math.max(shot.edge.far, _eL.far), grows: shot.edge.grows + (_grow ? 1 : 0) } : { near: _eL.near, far: _eL.far, grows: 0 };
        sc.near = shot.edge.near; sc.far = shot.edge.far;
        if (_grow) console.log('§FILM_SHADOW_EDGE shot=' + shot.i + ' near=' + sc.near.toFixed(1) + ' far=' + sc.far.toFixed(1) + ' range=' + (sc.far - sc.near).toFixed(1) + 'm normalBias=' + A.sun.shadow.normalBias.toFixed(4) +
          ' bias=' + A.sun.shadow.bias.toExponential(3) + ' grows=' + shot.edge.grows + ' (held per shot, grow-only; was the sun-distance range + 2 x texel)');
      } else if (_eLine && !shot.edgeVacuousLogged) { shot.edgeVacuousLogged = true; console.log(_eLine); }
    }
    // §STILL_SHADOW_CASCADE: the union, kept props and this single box are the cascades' inputs (_cascadeFit); with cascades
    // on this single-map edge line is superseded — printed as _SINGLE so one §STILL_SHADOW_EDGE answer exists per cascade
    var csmRun = !film && _csmLights.length && _cascadeOn();
    _fitState.last = { U: U, props: props, kept: kept, inv: inv.clone(), env: env, outside: outside, box: { l: l, r: r, b: b, t: t } };
    if (csmRun && edgeLine) edgeLine = edgeLine.replace(/^§STILL_SHADOW_EDGE /, '§STILL_SHADOW_EDGE_SINGLE (superseded by §STILL_SHADOW_CASCADE) ');
    sc.updateProjectionMatrix();
    if (A.renderer) A.renderer.shadowMap.needsUpdate = true;
    _stillFitBox = { l: l, r: r, b: b, t: t };
    var t0 = 2 * env / mz;
    var line = 'box=' + w.toFixed(1) + 'x' + h.toFixed(1) + 'm texelX=' + (w / mz).toFixed(4) + ' texelY=' + (h / mz).toFixed(4) +
      ' normalBias=' + A.sun.shadow.normalBias.toFixed(3) + ' propsKept=' + kept + '/' + props.length + ' camOutside=' + (outside ? 1 : 0) + (film ? ' sizeChanges=' + _fitState.changes + (changed ? ' CHANGED' : '') + (shot ? ' shot=' + shot.i + ' shotGrow=' + (shot.grow || 0) : '') : '');
    if (!film) console.log('§STILL_SHADOW_FIT env=' + env + ' ' + line + ' (was ' + (2 * env) + ', texel ' + t0.toFixed(4) + ') gain=' + (t0 / texel).toFixed(2) + 'x viewDepth=' + dFar.toFixed(0) +
      ' bldgFootprint=' + (B.x1 - B.x0).toFixed(0) + 'x' + (B.y1 - B.y0).toFixed(0) + ' sunElev=' + THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, A.sun.position.y / 5000)))).toFixed(1) +
      ' view=' + (V.x1 - V.x0).toFixed(0) + 'x' + (V.y1 - V.y0).toFixed(0) + ' union=' + (U.x1 - U.x0).toFixed(0) + 'x' + (U.y1 - U.y0).toFixed(0));
    if (edgeLine) console.log(edgeLine);
    if (csmRun) { try { _stillCascadeApply(); } catch (eC) { console.warn('§STILL_SHADOW_CASCADE failed: ' + eC.message + ' — single map kept'); if (window.ShadowCascade) window.ShadowCascade.off(); } }
    return line;
  }
  // §SHADOW_WIDE_OTHER_CAMERA (2026-10-03, MEASURED Clinic toilet: cascade boxes 1.5x2.1 .. 1.2x1.8 m fitted to the eye's 1.0-2.8 m view;
  // the mirror shows the room BEHIND the eye = outside every box = "no cascade -> lit" = sun speckle on indoor walls, hfStd 9.1 vs
  // 2.3 with &shadowcascade=0). A render from another camera (mirror tiles, the §GLASS_ENV cube) needs a map that holds what IT sees:
  // the sun's box widens to this still's building ∪ kept-props union (the fit's own U, ±env), cascades suspended; restored after.
  var _wideSaved = null;
  A._stillShadowWide = function(on) {
    var sc = A.sun && A.sun.shadow && A.sun.shadow.camera;
    if (on) { if (_wideSaved || !sc || !_fitState || !_fitState.last || !_fitOn() || /[?&]shadowwide=0/.test(location.search)) return false;   // &shadowwide=0 = A/B
      var L = _fitState.last, env = L.env, M = 2, U = L.U, mz = A.sun.shadow.mapSize.width;
      _wideSaved = { l: sc.left, r: sc.right, b: sc.bottom, t: sc.top, nb: A.sun.shadow.normalBias, csm: !!(window.ShadowCascade && window.ShadowCascade.suspend && window.ShadowCascade.suspend()) };
      sc.left = Math.max(-env, U.x0 - M); sc.right = Math.min(env, U.x1 + M); sc.bottom = Math.max(-env, U.y0 - M); sc.top = Math.min(env, U.y1 + M);
      A.sun.shadow.normalBias = 2 * Math.max(sc.right - sc.left, sc.top - sc.bottom) / mz; sc.updateProjectionMatrix(); A.renderer.shadowMap.needsUpdate = true;
      return { w: +(sc.right - sc.left).toFixed(1), h: +(sc.top - sc.bottom).toFixed(1) }; }
    if (!_wideSaved) return false;
    sc.left = _wideSaved.l; sc.right = _wideSaved.r; sc.bottom = _wideSaved.b; sc.top = _wideSaved.t; A.sun.shadow.normalBias = _wideSaved.nb; sc.updateProjectionMatrix();
    if (_wideSaved.csm) window.ShadowCascade.resume(); _wideSaved = null; A.renderer.shadowMap.needsUpdate = true; return false;
  };
  // ══ §STILL_SHADOW_EDGE (bim-compiler PHOTOREAL_STILL_RENDER.md "§STILL_SHADOW_EDGE — SPEC"; watchdog red1-4b/red1-c6) ══
  // red1 on v1337: shadows "jagged and with a base gap". Alt+S only; films keep §STILL_SHADOW_FIT as is. &shadowedge=0 or
  // APP._stillShadowEdge=false = the v1337 values (A/B).
  // (1) DEPTH RANGE: the sun sits at 5000 m and near/far were sunDist x 0.05 .. x 4 = a 19,748 m range for a ~150 m
  //     building. Fitted here to the light-space depth of what can cast or receive inside the fitted x/y box: the building
  //     corners, the kept skyline props, and a slab = the box's 4 corner rays between the ground plane and the building
  //     top (anything up to the building's height inside the box). Pad max(2 m, 2% of the range).
  // (2) BIAS: the base gap is worldBias / tan(elevation). The acne the depth bias used to carry is carried by the normal
  //     offset instead: a PCF tap s texels off, on a surface at elevation e to the light, reads a depth s.texel.cot(e) away,
  //     and a lookup lifted nb along the normal clears nb / sin(e) along the ray — so nb = (R + 1.5) texels (kernel R,
  //     bilinear 1, rasterised texel centre 0.5) clears every tap at every e (nb/sin e >= (R+1.5).texel.cot e since
  //     cos e <= 1). The depth bias is then only the depth format's step, sized for a 16-bit worst case: range / 65536.
  //     Lifting a ground lookup makes no base gap: its sun ray still meets the caster standing on that ground.
  function _edgeOn() { return !(A._stillShadowEdge === false || /[?&]shadowedge=0/.test(location.search)); }
  function _stillEdgeDepth(sc, inv, l, r, b, t, props, texel, sh) {
    sh = sh || A.sun.shadow; _stillEdgeDepth.last = null;
    var q = new THREE.Vector3(), dmin = Infinity, dmax = -Infinity, n = 0;
    function dep(x, y, z) { q.set(x, y, z).applyMatrix4(inv); var d = -q.z; if (isFinite(d)) { dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); n++; } }
    _fitState.corners.forEach(function(c) { dep(c.x, c.y, c.z); });
    var kept = 0; props.forEach(function(R) { if (!R.kept || !R.bb) return; kept++; for (var k = 0; k < 8; k++) dep(k & 1 ? R.bb.max.x : R.bb.min.x, k & 2 ? R.bb.max.y : R.bb.min.y, k & 4 ? R.bb.max.z : R.bb.min.z); });
    var yTop = -Infinity; _fitState.corners.forEach(function(c) { yTop = Math.max(yTop, c.y); });
    var gy = (A.ground && isFinite(A.ground.position.y)) ? A.ground.position.y : null;
    var w0 = new THREE.Vector3(), w1 = new THREE.Vector3(), slab = 0;
    [[l, b], [l, t], [r, b], [r, t]].forEach(function(xy) {
      w0.set(xy[0], xy[1], 0).applyMatrix4(sc.matrixWorld); w1.set(xy[0], xy[1], -1).applyMatrix4(sc.matrixWorld);
      var dy = w1.y - w0.y; if (Math.abs(dy) < 1e-9) return;
      [gy, yTop].forEach(function(yy) { if (yy == null || !isFinite(yy)) return; var s = (yy - w0.y) / dy; if (isFinite(s)) { dmin = Math.min(dmin, s); dmax = Math.max(dmax, s); slab++; } }); });
    var nearWas = sc.near, farWas = sc.far;
    if (!(dmax > dmin)) return '§STILL_SHADOW_EDGE VACUOUS depth extent (points=' + n + ') — range kept ' + (farWas - nearWas).toFixed(0) + 'm';
    var pad = Math.max(2, 0.02 * (dmax - dmin));
    sc.near = Math.max(0.1, dmin - pad); sc.far = dmax + pad;
    var range = sc.far - sc.near, R = sh.radius;
    var worldBias = range / 65536, nb = (R + 1.5) * texel;
    sh.bias = -(worldBias / range); sh.normalBias = window.__noNormalBias ? 0 : nb;
    var gap = function(deg) { return (worldBias / Math.tan(THREE.MathUtils.degToRad(deg))).toFixed(4); };
    _stillEdgeDepth.last = { range: range, worldBias: worldBias, nb: nb, bias: sh.bias, g45: +gap(45), g20: +gap(20), near: sc.near, far: sc.far };
    var el = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, A.sun.position.clone().normalize().y))));
    return '§STILL_SHADOW_EDGE range ' + (farWas - nearWas).toFixed(0) + 'm -> ' + range.toFixed(1) + 'm (near ' + nearWas.toFixed(0) + '->' + sc.near.toFixed(1) +
      ' far ' + farWas.toFixed(0) + '->' + sc.far.toFixed(1) + ', points=' + n + ' propsKept=' + kept + ' slabPts=' + slab + ' groundY=' + (gy == null ? 'n/a' : gy.toFixed(2)) + ' topY=' + yTop.toFixed(1) + ' pad=' + pad.toFixed(1) + ')' +
      ' texel=' + texel.toFixed(4) + ' R=' + R + ' normalBias=' + nb.toFixed(4) + 'm ((R+1.5) texels) worldBias=' + worldBias.toFixed(5) + 'm (range/65536) bias=' + sh.bias.toExponential(3) +
      ' predictedBaseGap45=' + gap(45) + 'm 20deg=' + gap(20) + 'm here(' + el.toFixed(1) + 'deg)=' + gap(Math.max(0.5, el)) + 'm (was 0.305/tan: 45deg=0.305m)' +
      ' thinCasterRisk=' + nb.toFixed(3) + 'm (= normalBias: a caster thinner or lower than this next to its receiver can lose its shadow)';
  }
  // ══ §STILL_SHADOW_CASCADE (bim-compiler PHOTOREAL_STILL_RENDER.md "§STILL_SHADOW_CASCADE — SPEC" + WATCHDOG GATE CONDITIONS
  // C1-C5 + BUILD DECISIONS D1-D7) — Alt+S only (`!A._maxqActive`); films unchanged. &shadowcascade=0 or
  // APP._stillShadowCascade=false = the single §STILL_SHADOW_FIT map (A/B). ══
  // One 8192 map gave texel 0.074-0.085 m on the Hospital exterior (3edd28a8 gate), so thinCasterRisk = 3 texels = 0.22-0.26 m.
  // The fix is smaller texels where the eye looks: split the VISIBLE depth range (SDSM: Lauritzen, Salvi, Lefohn, I3D 2011 —
  // one 160x90 depth readback, the §METER size) by PSSM's practical scheme C_i = 0.5 C_log + 0.5 C_uni (Zhang et al., VRCIA
  // 2006; three's CSM addon default lambda) and fit one map per slice. The sun is cascade 0 (D2); cascades 1..m-1 are
  // shadow-only lights (colour 0). m is FIXED for the session (C1 / ALTC_FOUNDATION F8: a light-count change recompiles
  // every material) — unused cascades keep their light, get no render, and the shader never picks them.
  var CSM_M = 4, CSM_BLEND = 0.1, CSM_LAMBDA = 0.5, CSM_RB_W = 160, CSM_RB_H = 90, CSM_MEM_CAP = 512, CSM_THIN = 0.0167;
  var _csmLights = [], _csmRT = null, _csmDM = null, _csmDMF = null, _csmDMB = null, _csmSidesLast = null, _csmSingleSize = 0;
  function _cascadeOn() {
    return !A._maxqActive && !!(window.ShadowCascade && window.ShadowCascade.installed()) && _edgeOn() &&
      !(A._stillShadowCascade === false || /[?&]shadowcascade=0/.test(location.search)) && !(A._stillShadowFit === false || /[?&]shadowfit=0/.test(location.search));
  }
  function _csmSizeMB(sz) { return sz * sz * 8 / 1048576; }   // D1: RGBA8 colour plane + 32-bit depth texture (the §R17 unit)
  function _releaseShadowMapOf(sh) {   // §R17_SHADOWMAP_RELEASE for any light (same steps as _releaseSunShadowMap)
    if (!sh || !sh.map) return 0;
    var mb = (sh.map.width * sh.map.height * 4 * (sh.map.depthTexture ? 2 : 1)) / 1048576;
    try { if (sh.map.depthTexture) { sh.map.depthTexture.dispose(); sh.map.depthTexture = null; } sh.map.dispose(); sh.map = null; if (sh.mapPass) { sh.mapPass.dispose(); sh.mapPass = null; } }
    catch (e) { console.warn('§SHADOWMAP_RELEASE cascade failed ' + e.message); return 0; }
    return mb;
  }
  // C2: added in the staging step, right after _enablePhotoShadows and BEFORE the first staged render compiles anything, so
  // the still's programs link once with the fixed m directional shadows.
  function _stillCascadeLightsAdd() {
    if (!_cascadeOn() || !A.sun || !A.scene || !_photoShadowSelfEnabled) return;
    var sz = A.sun.shadow.mapSize.width;
    for (var i = _csmLights.length; i < CSM_M - 1; i++) {
      var L = new THREE.DirectionalLight(0x000000, 0); L.name = 'stillShadowCascade' + (i + 1); L.userData.stillCascade = i + 1; _csmLights.push(L);
    }
    _csmLights.forEach(function(L) {
      L.castShadow = true; L.color.setHex(0x000000); L.intensity = 0; L.layers.mask = A.sun.layers.mask; L.userData.csmUsed = false;
      if (L.shadow.map && L.shadow.map.width !== sz) _releaseShadowMapOf(L.shadow);
      // §STILL_SHADOW_CASCADE_MAPS_EXIST (2026-09-25): three creates a light's shadow map only on its first update; a shadow
      // sampler with no map made every staged draw before the fit write nothing (the §METER read 0 lit pixels -> VACUOUS on
      // every indoor press, 0a9950a3). So every cascade map is rendered once here (its default box), before the first staged
      // render; the fit re-renders the used ones.
      L.shadow.mapSize.set(sz, sz); L.shadow.autoUpdate = false; L.shadow.needsUpdate = true;
      L.position.copy(A.sun.position); L.target.position.copy(A.sun.target.position); L.updateMatrixWorld(); L.target.updateMatrixWorld();
      if (L.parent !== A.scene) A.scene.add(L);
    });
    A._stillCascadeExtraUnits = _csmLights.length;
    if (A.renderer) A.renderer.shadowMap.needsUpdate = true;
    console.log('§STILL_SHADOW_CASCADE lights m=' + CSM_M + ' (sun + ' + _csmLights.length + ' shadow-only, colour 0, same direction) mapSize=' + sz +
      ' added before the first staged compile (C2) programs=' + ((A.renderer.info.programs || []).length));
  }
  function _stillCascadeLightsRemove() {
    if (window.ShadowCascade) window.ShadowCascade.off();
    A._stillCascadeExtraUnits = 0;
    if (!_csmLights.length) return;
    var freed = 0, n = 0;
    _csmLights.forEach(function(L) { freed += _releaseShadowMapOf(L.shadow); if (L.parent) { L.parent.remove(L); n++; } L.castShadow = false; L.userData.csmUsed = false; });
    console.log('§STILL_SHADOW_CASCADE teardown removed=' + n + ' freedMB=' + freed.toFixed(1) + ' (§R17; the sun\'s map is released by §SHADOWMAP_RELEASE)');
  }
  // the directional-shadow slot three gives each light: WebGLRenderer.projectObject walks the scene depth-first (visible,
  // camera layers), WebGLLights sorts castShadow first with a stable sort — so a caster's slot is its index among the
  // shadow-casting directional lights in that walk (D2: the shader is told the slot by uniform, never assumes an order)
  function _csmSlots() {
    var out = [], cam = A.camera;
    (function walk(o) { if (o.visible === false) return; if (o.isDirectionalLight && o.castShadow && o.layers.test(cam.layers)) out.push(o); for (var i = 0; i < o.children.length; i++) walk(o.children[i]); })(A.scene);
    return out;
  }
  // D4: one 160x90 depth render of the staged frame (MeshDepthMaterial, RGBA-packed, both faces); sky, glass, basic/shader
  // materials, sprites/lines/points and sky portals hidden; the shadow maps are NOT rendered by it (autoUpdate/needsUpdate
  // held false for the call). Returns the drawn pixels as world points in light space + view depth.
  function _csmReadback(cam, inv) {
    var R = A.renderer, W = CSM_RB_W, H = CSM_RB_H;
    if (!_csmRT) { _csmRT = new THREE.WebGLRenderTarget(W, H); _csmDM = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }); }
    var hidden = [], glassArr = 0;
    A.scene.traverse(function(o) {
      if (!o.visible || !(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return;
      var ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      // §CSM_READBACK_GLASS (2026-09-30, bim-compiler PHOTOREAL_STILL_RENDER.md §DEV RESUME 2026-09-30 PM case 4, Terminal
      // …709411794): this predicate hid an object only when EVERY material was glass, so Terminal's R10 window arrays (opaque
      // frame + transparent pane) were drawn SOLID by the depth override — the readback stopped at the room's glass wall
      // (zMax 6.6 m), every cascade box ended there, and the hall behind it (columns at 16-26 m) sat in no box: the shader's
      // D3 fallback (shadow_cascade.js, no box -> _csmS = 1.0) lit it with the UNSHADOWED sun. Sun-facing hall faces read
      // 252 (raycast: sun blocked by the ceiling at 1.8-4.1 m) and the edge-on concrete column got sun on its normal-mapped
      // fragments only = red1's "column behind glass looks concrete" (Lu 99..180 blotches; 99..107 with &concrete=0).
      // Same `every`-vs-`some` class as ALTS-ALL FIX 9 (gi_still.js): an object with ANY glass group is left out (its frame
      // is a sliver against a pane-sized sheet). Witness: §CSM_READBACK_GLASS glassArr > 0 and zMax past the glass on this pose.
      var anyGlass = ms.some(function(m) { return m && m.transparent && m.opacity < 0.95; });
      var skip = o === A._sky || o.isSprite || o.isPoints || o.isLine || (o.userData && o.userData.skyPortal) || anyGlass ||
        ms.every(function(m) { return !m || m.visible === false || m.isMeshBasicMaterial || m.isShaderMaterial || m.isRawShaderMaterial || (m.transparent && m.opacity < 0.95); });
      if (skip) { o.visible = false; hidden.push(o); if (anyGlass && ms.length > 1) glassArr++; }
    });
    var sm = R.shadowMap, smA = sm.autoUpdate, smN = sm.needsUpdate, prevRT = R.getRenderTarget(), prevOv = A.scene.overrideMaterial,
        prevBg = A.scene.background, prevFog = A.scene.fog, cc = R.getClearColor(new THREE.Color()), ca = R.getClearAlpha(), buf = new Uint8Array(W * H * 4);
    // ### ALTS-ALL FIX 16 (plenum sun leak): the readback must see the faces the still draws. It rendered EVERY mesh DoubleSide, but the
    // beauty draws the §WALL_SIDE closed classes FrontSide — from a camera behind/inside walls (Hospital plenum) the readback's nearest
    // depth was those culled BACK faces (median view depth 0.75 m vs the visible surfaces 2-10 m), the SDSM box clustered on them
    // (cascade 0 box 1.2 x 2.6 m) and 100/101 sun-lit clipped samples fell in no cascade box -> full sun through the slab (22 % clipped;
    // a +-80 m box: dark, = sun off). Two passes into one depth buffer: FrontSide meshes with a FrontSide depth material, then the
    // DoubleSide/BackSide ones with their own side. &csmsides=0 = the old DoubleSide readback.
    var sideOf = function(o) { var m0 = Array.isArray(o.material) ? o.material[0] : o.material; return m0 ? m0.side : THREE.DoubleSide; };
    var twoPass = !/[?&]csmsides=0/.test(location.search), groups = { f: [], o: [] };
    if (twoPass) { if (!_csmDMF) { _csmDMF = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.FrontSide }); _csmDMB = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.BackSide }); }
      A.scene.traverse(function(o) { if (o.visible && o.isMesh) (sideOf(o) === THREE.FrontSide ? groups.f : groups.o).push(o); }); }
    var ac = R.autoClear;
    try {
      sm.autoUpdate = false; sm.needsUpdate = false; A.scene.background = null; A.scene.fog = null;
      R.setRenderTarget(_csmRT); R.setClearColor(0xffffff, 1); R.clear();
      if (!twoPass) { A.scene.overrideMaterial = _csmDM; R.render(A.scene, cam); }
      else { R.autoClear = false;
        groups.o.forEach(function(o) { o.visible = false; }); A.scene.overrideMaterial = _csmDMF; R.render(A.scene, cam); groups.o.forEach(function(o) { o.visible = true; });
        groups.f.forEach(function(o) { o.visible = false; });
        var bk = groups.o.filter(function(o) { return sideOf(o) === THREE.BackSide; }); bk.forEach(function(o) { o.visible = false; }); A.scene.overrideMaterial = _csmDM; R.render(A.scene, cam); bk.forEach(function(o) { o.visible = true; });
        var dbl = groups.o.filter(function(o) { return sideOf(o) !== THREE.BackSide; }); if (bk.length) { dbl.forEach(function(o) { o.visible = false; }); A.scene.overrideMaterial = _csmDMB; R.render(A.scene, cam); dbl.forEach(function(o) { o.visible = true; }); }
        groups.f.forEach(function(o) { o.visible = true; }); }
      R.readRenderTargetPixels(_csmRT, 0, 0, W, H, buf);
    } finally {
      R.autoClear = ac; sm.autoUpdate = smA; sm.needsUpdate = smN; R.setRenderTarget(prevRT); A.scene.overrideMaterial = prevOv; A.scene.background = prevBg; A.scene.fog = prevFog;
      R.setClearColor(cc, ca); hidden.forEach(function(o) { o.visible = true; });
    }
    _csmSidesLast = twoPass ? { front: groups.f.length, other: groups.o.length } : null;
    // three r186 unpackRGBAToDepth: dot(rgba, (255/256, 255/256/256, 255/256/65536, 1/16777216)); all-255 = cleared (packDepthToRGBA(>=1))
    var k0 = 255 / 256 / 255, k1 = k0 / 256, k2 = k1 / 256, k3 = 1 / 16777216 / 255, fwd = cam.getWorldDirection(new THREE.Vector3());
    var v = new THREE.Vector3(), pts = [], zMin = Infinity, zMax = -Infinity, n = 0;
    for (var py = 0; py < H; py++) for (var px = 0; px < W; px++) {
      var i = (py * W + px) * 4; if (buf[i] === 255 && buf[i + 1] === 255 && buf[i + 2] === 255 && buf[i + 3] === 255) continue;
      var d = buf[i] * k0 + buf[i + 1] * k1 + buf[i + 2] * k2 + buf[i + 3] * k3;
      v.set((px + 0.5) / W * 2 - 1, (py + 0.5) / H * 2 - 1, d * 2 - 1).unproject(cam);
      var z = (v.x - cam.position.x) * fwd.x + (v.y - cam.position.y) * fwd.y + (v.z - cam.position.z) * fwd.z;
      if (!(z > 0) || !isFinite(z)) continue;
      v.applyMatrix4(inv); pts.push(v.x, v.y, z); n++; zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
    }
    console.log('§CSM_READBACK_GLASS glassArr=' + glassArr + ' (multi-material objects with a glass group left out of the cascade depth readback; was drawn solid) hidden=' + hidden.length + ' zMax=' + (isFinite(zMax) ? zMax.toFixed(1) : 'NaN') + 'm points=' + n);
    return { pts: pts, n: n, zMin: zMin, zMax: zMax, hidden: hidden.length, glassArr: glassArr };
  }
  // PSSM practical split over [zMin, zMax] (Zhang et al. 2006): C_i = lambda zMin (zMax/zMin)^(i/m) + (1-lambda)(zMin + (zMax-zMin) i/m)
  function _csmSplits(zMin, zMax, m) {
    // §CSM_SPLIT_AB (2026-10-04): &csmlambda=<0..1> overrides CSM_LAMBDA for A/B (1 = pure log splits: every cascade the same far/near
    // ratio, so texel-per-pixel is equal across cascades; MEASURED with 0.5: cascade 0 spans 4.9-22x and carries tpp 2.2-9.9 while
    // cascades 1-3 stay <= 1 — the jagged edges). Default unchanged until red1 rules.
    var _lm = /[?&]csmlambda=([0-9.]+)/.exec(location.search), LAM = _lm ? Math.max(0, Math.min(1, parseFloat(_lm[1]))) : CSM_LAMBDA;
    var C = []; for (var i = 0; i <= m; i++) C.push(LAM * zMin * Math.pow(zMax / zMin, i / m) + (1 - LAM) * (zMin + (zMax - zMin) * i / m));
    return C;
  }
  // THE per-cascade fit (D5) — one function for the still and, later, the film (ALTC_FOUNDATION F2). slice = { a, b (view
  // depth), size (map texels), R (PCF radius), pts (readback), light (null = measure only) }. Box = the frustum slice's
  // light-space rect ∩ the §STILL_SHADOW_FIT union (building ∪ kept props) ∩ ±env ∩ the rect of the readback points in the
  // slice padded by 2 readback-pixel footprints at b; + (R+1) texels; centre snapped to whole texels. Depth, bias and
  // normalBias: the §STILL_SHADOW_EDGE rule (_stillEdgeDepth) on that box.
  function _cascadeFit(slice, film) {
    if (film) return null;   // §FILM_PARITY F2 (bounding-sphere box per shot + per-shot depth union, Valient 2008): not built; films keep §STILL_SHADOW_FIT
    var F = _fitState.last, cam = A.camera, inv = F.inv, env = F.env, U = F.U, q = new THREE.Vector3();
    var S = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    [-1, 1].forEach(function(nx) { [-1, 1].forEach(function(ny) {
      var pF = new THREE.Vector3(nx, ny, 1).unproject(cam).sub(cam.position);   // view depth of the far-plane corner = cam.far
      [slice.a, slice.b].forEach(function(dd) { q.copy(pF).multiplyScalar(dd / cam.far).add(cam.position).applyMatrix4(inv);
        S.x0 = Math.min(S.x0, q.x); S.x1 = Math.max(S.x1, q.x); S.y0 = Math.min(S.y0, q.y); S.y1 = Math.max(S.y1, q.y); }); }); });
    var l = Math.max(S.x0, U.x0, -env), r = Math.min(S.x1, U.x1, env), b = Math.max(S.y0, U.y0, -env), t = Math.min(S.y1, U.y1, env);
    var T = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }, nIn = 0, P = slice.pts;
    for (var i = 0; i < P.length; i += 3) { var z = P[i + 2]; if (z < slice.a || z > slice.b) continue; nIn++;
      if (P[i] < T.x0) T.x0 = P[i]; if (P[i] > T.x1) T.x1 = P[i]; if (P[i + 1] < T.y0) T.y0 = P[i + 1]; if (P[i + 1] > T.y1) T.y1 = P[i + 1]; }
    var th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), rbPix = Math.max(slice.b * 2 * th / CSM_RB_H, slice.b * 2 * th * cam.aspect / CSM_RB_W), pad = 2 * rbPix;
    if (nIn) { l = Math.max(l, T.x0 - pad); r = Math.min(r, T.x1 + pad); b = Math.max(b, T.y0 - pad); t = Math.min(t, T.y1 + pad); }
    var out = { used: r > l && t > b, sa: slice.a, sb: slice.b, nIn: nIn, sdsmPad: pad };
    if (!out.used) return out;
    var sz = slice.size, kx = (slice.R + 1) * (r - l) / sz, ky = (slice.R + 1) * (t - b) / sz;
    l -= kx; r += kx; b -= ky; t += ky;
    var w = r - l, h = t - b, tx = w / sz, ty = h / sz, cx = Math.round((l + r) / 2 / tx) * tx, cy = Math.round((b + t) / 2 / ty) * ty;
    l = cx - w / 2; r = cx + w / 2; b = cy - h / 2; t = cy + h / 2;
    out.l = l; out.r = r; out.b = b; out.t = t; out.w = w; out.h = h; out.texel = Math.max(tx, ty);
    if (!slice.light) return out;
    var L = slice.light, sc = L.shadow.camera;
    L.updateMatrixWorld(); L.shadow.updateMatrices(L);
    sc.left = l; sc.right = r; sc.bottom = b; sc.top = t; L.shadow.radius = slice.R;
    out.line = _stillEdgeDepth(sc, inv, l, r, b, t, F.props, out.texel, L.shadow);
    out.edge = _stillEdgeDepth.last;
    sc.updateProjectionMatrix();
    return out;
  }
  function _stillCascadeSingle(cs, C, sSize, sTexel, worst, zMin, zMax, rb, zEdge, pix, t0) {
    var F = _fitState.last, sun = A.sun, sc = sun.shadow.camera, freed = 0;
    window.ShadowCascade.off();
    _csmLights.forEach(function(L) { L.userData.csmUsed = false; L.shadow.needsUpdate = false; var c = L.shadow.camera; c.left = c.bottom = 0; c.right = c.top = 1e-3; c.updateProjectionMatrix(); });
    if (sun.shadow.mapSize.width !== sSize) { sun.shadow.mapSize.set(sSize, sSize); freed = _releaseShadowMapOf(sun.shadow); }
    sun.updateMatrixWorld(); sun.shadow.updateMatrices(sun);
    sc.left = F.box.l; sc.right = F.box.r; sc.bottom = F.box.b; sc.top = F.box.t;
    var line = _stillEdgeDepth(sc, F.inv, F.box.l, F.box.r, F.box.b, F.box.t, F.props, sTexel), e = _stillEdgeDepth.last || {};
    sc.updateProjectionMatrix(); if (A.renderer) A.renderer.shadowMap.needsUpdate = true;
    var f = function(a, k, d) { return '[' + a.map(function(o) { var v = o[k]; return (v == null || !isFinite(v)) ? 'NaN' : (+v).toFixed(d); }).join(',') + ']'; };
    if (line) console.log(line + ' cascade=single (D8)');
    console.log('§STILL_SHADOW_CASCADE m=' + CSM_M + ' used=1 mode=single(cascade worst texel ' + worst.toFixed(4) + ' > single ' + sTexel.toFixed(4) + ' at ' + sSize + ': D8)' +
      ' splits=[' + zMin.toFixed(2) + ',' + zMax.toFixed(2) + '] texel=[' + sTexel.toFixed(4) + '] normalBias=[' + (+e.nb).toFixed(4) + '] thinCasterRisk=[' + (+e.nb).toFixed(4) + '] bias=[' + (+e.bias).toFixed(7) + ']' +
      ' range=[' + (+e.range).toFixed(1) + '] gap45=[' + (+e.g45).toFixed(4) + '] gap20=[' + (+e.g20).toFixed(4) + '] texelPerPixel=[' + (sTexel / pix(zMin)).toFixed(2) + ']' + ' thinCasterPx=[' + ((+e.nb) / pix(zMin)).toFixed(2) + '] thinCasterLimit=[' + Math.max(0.05, 1.5 * pix(zMin)).toFixed(4) + ']' +
      ' memMB=' + _csmSizeMB(sSize).toFixed(0) + ' size=' + sSize + ' (sun map re-sized, 4096 map freed ' + freed.toFixed(0) + 'MB) textureUnits=+' + _csmLights.length + ' dirShadows=' + _csmSlots().length +
      ' declinedSplits=[' + C.map(function(x) { return x.toFixed(2); }).join(',') + '] declinedTexel=' + f(cs, 'texel', 4) + ' declinedTexelPerPixel=' + f(cs, 'tpp', 2) +
      ' zMin=' + zMin.toFixed(2) + ' zMax=' + zMax.toFixed(1) + ' (readback ' + rb.zMax.toFixed(1) + ', edge clamp ' + zEdge.toFixed(1) + ', points ' + rb.n + ')' +
      ' programs=' + ((A.renderer.info.programs || []).length) + ' ms=' + (performance.now() - t0).toFixed(1));
  }
  function _stillCascadeApply() {
    var t0 = performance.now(), F = _fitState && _fitState.last, cam = A.camera, sun = A.sun;
    A._csmUncovered = null;   // §CSM_NEAR_LEAK: set only on the cascades path below (single / VACUOUS: not judged)
    if (!F || !_csmLights.length) return;
    cam.updateMatrixWorld();
    var rb = _csmReadback(cam, F.inv);
    // C4: zMax clamped to the VIEW depth of the §STILL_SHADOW_EDGE point set (building corners + kept props + the single box's slab)
    var fwd = cam.getWorldDirection(new THREE.Vector3()), zEdge = -Infinity, w0 = new THREE.Vector3(), w1 = new THREE.Vector3(), sc0 = sun.shadow.camera;
    var vd = function(x, y, z) { zEdge = Math.max(zEdge, (x - cam.position.x) * fwd.x + (y - cam.position.y) * fwd.y + (z - cam.position.z) * fwd.z); };
    _fitState.corners.forEach(function(c) { vd(c.x, c.y, c.z); });
    F.props.forEach(function(Rp) { if (Rp.kept && Rp.bb) for (var k = 0; k < 8; k++) vd(k & 1 ? Rp.bb.max.x : Rp.bb.min.x, k & 2 ? Rp.bb.max.y : Rp.bb.min.y, k & 4 ? Rp.bb.max.z : Rp.bb.min.z); });
    var yTop = -Infinity; _fitState.corners.forEach(function(c) { yTop = Math.max(yTop, c.y); });
    var gy = (A.ground && isFinite(A.ground.position.y)) ? A.ground.position.y : null;
    sun.updateMatrixWorld(); sun.shadow.updateMatrices(sun);
    [[F.box.l, F.box.b], [F.box.l, F.box.t], [F.box.r, F.box.b], [F.box.r, F.box.t]].forEach(function(xy) {
      w0.set(xy[0], xy[1], 0).applyMatrix4(sc0.matrixWorld); w1.set(xy[0], xy[1], -1).applyMatrix4(sc0.matrixWorld);
      var dy = w1.y - w0.y; if (Math.abs(dy) < 1e-9) return;
      [gy, yTop].forEach(function(yy) { if (yy == null || !isFinite(yy)) return; var s = (yy - w0.y) / dy; vd(w0.x + (w1.x - w0.x) * s, yy, w0.z + (w1.z - w0.z) * s); }); });
    // zMin floor 1 m (watchdog red1-c6: the Terminal cascade 0 spanned 0.35-3.19 m, a wasted slice) — the floor places the SPLITS only.
    // §CSM_NEAR_LEAK (2026-09-26, S1): cascade 0's BOX is fitted from cam.near (fitsFor below). Fitted from the 1 m floor, every
    // surface nearer than 1 m sat in no cascade box, the shader's D3 fallback lit it, and a wall 0.9 m away took full sun through
    // the roof (Clinic S1 pose: 249/249 sun-facing clipped samples ray-blocked; blown 9.5% -> 0.04% with cascades off).
    var zMin = Math.max(cam.near, 1, rb.zMin), zMax = Math.min(rb.zMax, zEdge);
    var Hpx = A.renderer.domElement.height, th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), pix = function(d) { return d * 2 * th / Hpx; };
    if (!(rb.n > 0 && zMax > zMin * 1.001)) {
      window.ShadowCascade.off();
      console.log('§STILL_SHADOW_CASCADE VACUOUS readback points=' + rb.n + ' zMin=' + zMin + ' zMax=' + zMax + ' (edge clamp ' + zEdge.toFixed(1) + ') — single map kept');
      return;
    }
    var size = sun.shadow.mapSize.width, R = sun.shadow.radius, C = _csmSplits(zMin, zMax, CSM_M);
    _csmLights.forEach(function(L) { L.position.copy(sun.position); L.target.position.copy(sun.target.position); L.target.updateMatrixWorld(); L.shadow.mapSize.set(size, size); L.userData.csmUsed = false; });
    var fitsFor = function(m, light) {
      var CC = m === CSM_M ? C : _csmSplits(zMin, zMax, m), outs = [];
      for (var c = 0; c < m; c++) outs.push(_cascadeFit({ a: c ? CC[c] - CSM_BLEND * (CC[c] - CC[c - 1]) : (A._csmNearFix === false ? CC[0] : Math.min(CC[0], cam.near)), b: CC[c + 1], size: size, R: R, pts: rb.pts, light: light ? (c ? _csmLights[c - 1] : sun) : null }, false));
      outs.forEach(function(o, c) { o.near = CC[c]; o.tpp = o.used ? o.texel / pix(CC[c]) : NaN; });
      return outs;
    };
    var ifM = [2, 3].map(function(m) { return fitsFor(m, false); });
    var cs = fitsFor(CSM_M, true);
    // C3 memory: every used cascade at the sun's size (4096 under cascades); cascade 0 at 8192 only if its fit needs it AND it fits
    var used = cs.filter(function(o) { return o.used; }).length, memMB = used * _csmSizeMB(size), fallback = '';
    while (memMB > CSM_MEM_CAP && used > 1) { cs[used - 1].used = false; used--; memMB = used * _csmSizeMB(size); fallback = ' FALLBACK used=' + used + ' (memMB cap ' + CSM_MEM_CAP + ')'; }
    var c0need = cs[0].used && cs[0].texel > CSM_THIN, c0fits = _csmSizeMB(Math.min(8192, A.renderer.capabilities.maxTextureSize || 4096)) + (used - 1) * _csmSizeMB(size) <= CSM_MEM_CAP;
    var c0at8192 = !c0need ? 'no(not needed)' : (c0fits ? 'no(fits, not applied: D1)' : 'no(budget: ' + (_csmSizeMB(8192) + (used - 1) * _csmSizeMB(size)).toFixed(0) + 'MB > ' + CSM_MEM_CAP + ')');
    // D8: never coarser than the single map — the cascades are used only if every used cascade's texel <= the single map's
    // texel at its own §SHADOW_SIZE_BY_ENVELOPE size (same memory); else the single map is re-applied at that size
    var sSize = _csmSingleSize || size, sTexel = Math.max(F.box.r - F.box.l, F.box.t - F.box.b) / sSize, worst = 0;
    cs.forEach(function(o) { if (o.used) worst = Math.max(worst, o.texel); });
    if (worst > sTexel) { _stillCascadeSingle(cs, C, sSize, sTexel, worst, zMin, zMax, rb, zEdge, pix, t0); return; }
    var slots = _csmSlots(), slotOf = function(L) { return slots.indexOf(L); }, idx = [], nearA = [], farA = [], lastUsed = 0;
    cs.forEach(function(o, c) {
      var L = c ? _csmLights[c - 1] : sun;
      nearA.push(C[c]); farA.push(C[c + 1]);   // splits kept for an unused cascade too: the shader's depth pick walks them in order
      if (!o.used) { if (c) { var sc = L.shadow.camera; sc.left = sc.bottom = 0; sc.right = sc.top = 1e-3; sc.updateProjectionMatrix(); L.shadow.needsUpdate = false; } idx.push(null); return; }
      if (c) { L.userData.csmUsed = true; L.shadow.needsUpdate = true; }
      idx.push(slotOf(L)); lastUsed = c + 1;
    });
    for (var c2 = cs.length; c2 < 4; c2++) { idx.push(null); nearA.push(0); farA.push(0); }
    // §CSM_NEAR_LEAK witness: readback points the shader would light for want of a box — depth cascade D (splits), then the first
    // used cascade k >= D whose box holds the point (shadow_cascade.js D3); none = uncovered = sun leaks. Points outside the §STILL_SHADOW_FIT
    // union (building ∪ kept props = every caster) are skipped. Target 0.
    var unc = 0, P2 = rb.pts, UU = F.U; for (var ip = 0; ip < P2.length; ip += 3) { var pz = P2[ip + 2], D0 = 0; for (var kd = 0; kd < 3; kd++) if (kd + 1 < lastUsed && pz > farA[kd]) D0 = kd + 1;
      var cov = P2[ip] < UU.x0 || P2[ip] > UU.x1 || P2[ip + 1] < UU.y0 || P2[ip + 1] > UU.y1;   // outside the casters' light-space rect: nothing can shadow it, lit is right
      for (var kc = D0; kc < lastUsed && !cov; kc++) { var o2 = cs[kc]; if (o2.used && P2[ip] >= o2.l && P2[ip] <= o2.r && P2[ip + 1] >= o2.b && P2[ip + 1] <= o2.t) cov = true; } if (!cov) unc++; }
    A._csmUncovered = unc;
    window.ShadowCascade.set(true, lastUsed, slotOf(sun), idx, nearA, farA, CSM_BLEND);
    if (A.renderer) A.renderer.shadowMap.needsUpdate = true;
    var f = function(a, k, d) { return '[' + a.map(function(o) { var v = typeof k === 'function' ? k(o) : o[k]; return (v == null || !isFinite(v)) ? 'NaN' : (+v).toFixed(d); }).join(',') + ']'; };
    var E = function(k) { return function(o) { return o.edge ? o.edge[k] : NaN; }; };
    cs.forEach(function(o, c) { if (o.line) console.log(o.line + ' cascade=' + c + ' slice=[' + o.sa.toFixed(2) + ',' + o.sb.toFixed(2) + ']m box=' + o.w.toFixed(1) + 'x' + o.h.toFixed(1) + 'm'); });
    // §CSM_READBACK_GLASS witness record (plain data, survives teardown): the used boxes in light space + the light-space
    // transform, so a probe can say whether a given world point (e.g. a column behind glass) sits in any cascade box.
    A._csmLastFit = { zMin: zMin, zMax: zMax, rbZMax: rb.zMax, glassArr: rb.glassArr, inv: F.inv.toArray(),
      boxes: cs.map(function(o) { return { used: !!o.used, l: o.l, r: o.r, b: o.b, t: o.t, sa: o.sa, sb: o.sb }; }) };
    console.log('§STILL_SHADOW_CASCADE uncovered=' + unc + '/' + (P2.length / 3) + ' readbackSides=' + (_csmSidesLast ? 'asDrawn(front ' + _csmSidesLast.front + ', double/back ' + _csmSidesLast.other + ')' : 'double(&csmsides=0)') + ' m=' + CSM_M + ' used=' + used + ' mode=cascades(worst ' + worst.toFixed(4) + ' <= single ' + sTexel.toFixed(4) + ' at ' + sSize + ') splits=[' + C.map(function(x) { return x.toFixed(2); }).join(',') + ']' +
      ' texel=' + f(cs, 'texel', 4) + ' normalBias=' + f(cs, E('nb'), 4) + ' thinCasterRisk=' + f(cs, E('nb'), 4) + ' bias=' + f(cs, E('bias'), 7) +
      ' range=' + f(cs, E('range'), 1) + ' gap45=' + f(cs, E('g45'), 4) + ' gap20=' + f(cs, E('g20'), 4) + ' texelPerPixel=' + f(cs, 'tpp', 2) +
      // §THIN_PX rule (watchdog red1-c6): thinCasterRisk <= max(0.05 m, 1.5 x the pixel footprint at the cascade's near split)
      ' thinCasterPx=' + f(cs, function(o) { return o.edge ? o.edge.nb / pix(o.near) : NaN; }, 2) + ' thinCasterLimit=' + f(cs, function(o) { return Math.max(0.05, 1.5 * pix(o.near)); }, 4) +
      ' box=[' + cs.map(function(o) { return o.used ? o.w.toFixed(1) + 'x' + o.h.toFixed(1) : '-'; }).join(',') + '] ptsInSlice=' + f(cs, 'nIn', 0) +
      ' memMB=' + memMB.toFixed(0) + ' size=' + size + ' c0at8192=' + c0at8192 + fallback +
      ' textureUnits=+' + _csmLights.length + ' dirShadows=' + slots.length + ' sunSlot=' + slotOf(sun) + ' slots=[' + idx.map(function(x) { return x == null ? '-' : x; }).join(',') + ']' +
      ' zMin=' + zMin.toFixed(2) + ' zMax=' + zMax.toFixed(1) + ' (readback ' + rb.zMax.toFixed(1) + ', edge clamp ' + zEdge.toFixed(1) + ', points ' + rb.n + '/' + (CSM_RB_W * CSM_RB_H) + ', hidden ' + rb.hidden + ')' +
      ' pixelAtSplit=' + f(cs, function(o) { return pix(o.near); }, 4) + ' H=' + Hpx + ' fov=' + cam.fov +
      ' c0texelIf[m2,m3,m4]=[' + ifM.map(function(o) { return o[0].used ? o[0].texel.toFixed(4) : 'NaN'; }).concat([cs[0].texel.toFixed(4)]).join(',') + ']' +
      ' tppIfM2=' + f(ifM[0], 'tpp', 2) + ' tppIfM3=' + f(ifM[1], 'tpp', 2) + ' texelIfM3=' + f(ifM[1], 'texel', 4) +
      ' lambda=' + ((/[?&]csmlambda=([0-9.]+)/.exec(location.search) || [0, CSM_LAMBDA])[1]) + ' blend=' + CSM_BLEND + ' R=' + R + ' programs=' + ((A.renderer.info.programs || []).length) + ' ms=' + (performance.now() - t0).toFixed(1));
    // §ZERO Z12 SUN_PENUMBRA (diagnostic, stills): today's PCF edge = (2R+1) texels per cascade; the sun's 0.53 deg disc gives
    // w = d x tan(0.53 deg). dMatch = the occluder->receiver distance at which they agree (nearer occluders: too soft; farther: too hard).
    if (!A._maxqActive && window.LightLaw && window.LightLaw.penumbra) { var _p1 = window.LightLaw.penumbra(1);
      console.log('§SUN_PENUMBRA discDeg=' + window.LightLaw.SUN.discDeg + ' perMetre=' + _p1.toFixed(5) + ' R=' + R + ' filterM=' + f(cs, function(o) { return o.used ? (2 * R + 1) * o.texel : NaN; }, 4) +
        ' dMatch=' + f(cs, function(o) { return o.used ? (2 * R + 1) * o.texel / _p1 : NaN; }, 2) + 'm (PCSS not built — ### Z12 SPEC)'); }
  }
  A._filmParityShadowFit = function() { return _stillFitApply(true); };
  // §FILM_FIT_PER_SHOT precompute — sampler from cinema_maxq.js: { shots: [[a,b],...], sample(t): sets camera + sun for film
  // time t }. For each shot, K poses + the shot's own sun at each sample, measure the raw fitted box, keep the max, pad 10%
  // and quantise up to 8 m. Runs once, at the first film frame (staging has set the sun camera up by then).
  A._filmFitPrecompute = function(sampler) {
    if (!_fitOn() || !sampler || !sampler.shots || !sampler.shots.length) { console.log('§FILM_FIT_PER_SHOT skipped (' + (!sampler ? 'no sampler' : 'fit off') + ')'); return; }
    var t0 = performance.now(), K = 12, out = [];
    sampler.shots.forEach(function(ab, i) {
      var W = 0, H = 0, n = 0;
      for (var k = 0; k <= K; k++) { var t = ab[0] + (ab[1] - ab[0]) * k / K; try { sampler.sample(t); A._stillCamInsideNow = _stillCamInside().inside; var m = _stillFitApply(true, true); if (m) { W = Math.max(W, m.w); H = Math.max(H, m.h); n++; } } catch (e) {} }
      var env2 = 2 * _fitState.env;
      out.push({ i: i, a: ab[0], b: ab[1], n: n, w: Math.min(env2, Math.ceil(W * 1.1 / 8) * 8), h: Math.min(env2, Math.ceil(H * 1.1 / 8) * 8) });
    });
    _fitState.shots = out;
    console.log('§FILM_FIT_PER_SHOT shots=' + out.length + ' ' + out.map(function(S) { return S.i + ':[' + S.a.toFixed(3) + ',' + S.b.toFixed(3) + '] ' + S.w + 'x' + S.h + 'm texel ' + (Math.max(S.w, S.h) / A.sun.shadow.mapSize.width).toFixed(4); }).join(' · ') + ' ms=' + (performance.now() - t0).toFixed(0));
  };   // §STILL_SHADOW_FIT — this still's fitted box; radius to hand back
  // §R17_SHADOWMAP_RELEASE (2026-09-05, bim-compiler prompts/CPE_4D_PERF_MEM_STUDY.md §R17) — the
  // shadow-map dimensions this staging cycle BORROWED from. Captured at raise time rather than
  // assumed: tools.js §S288 owns the nav number (2048) and the three.js default when shadows were
  // never toggled is 512 — MEASURED `§R17_SHADOWMAP S0_pre_press mapSize=512 realMap=0x0` on a real
  // load, so a hardcoded 2048 restore would silently QUADRUPLE the nav map on that (common) path.
  var _photoShadowMapSizeSaved = null;
  // §PHOTO_SHADOW_SKIP (2026-07-25, borrowing nav-DLOD's change-detection idea — see
  // prompts/PHOTOREAL_STILL_RENDER.md 2026-07-24/2026-07-25 SPEC ONLY sections): the reassert
  // traversal below existed to catch geometry/visibility that changed AFTER the initial
  // _enablePhotoShadows() pass — but it ran an unconditional full-scene traverse every single
  // caller frame regardless of whether anything actually changed. Shared by BOTH Alt+S
  // (step(), up to 16 calls) and Alt+C/MaxQ Cinema orbit (step(), up to CINEMA_N_FRAMES=576
  // calls) since both go through this one function — gating it benefits both automatically.
  // Tracks the same three signals the function's own purpose already depends on: streaming
  // progress (A.streamIdx), new top-level scene content (A.scene.children.length, the same
  // signal §PROGRESSIVE_FLUSH already logs as drawCalls), and discipline/storey/isolate
  // visibility edits (A._visibilityGen, bumped by panels.js's 3 visibility-mutation entry
  // points). If all three are unchanged since the last check, a fresh traverse would find
  // zero new objects — skip it, don't do the redundant O(scene) work.
  var _photoShadowCheckIdx = -1, _photoShadowCheckKids = -1, _photoShadowCheckVis = -1;
  var _photoShadowReassertRuns = 0, _photoShadowReassertSkips = 0, _photoShadowForcedSaves = 0;
  function _enablePhotoShadows() {
    if (A._shadowOn) { _photoShadowSelfEnabled = false; return; }  // user's own Shadow mode active — don't touch
    if (!A.sun || !A.renderer || !A.scene) return;
    _photoShadowSelfEnabled = true;
    _photoShadowCheckIdx = -1; _photoShadowCheckKids = -1; _photoShadowCheckVis = -1;
    _photoShadowReassertRuns = 0; _photoShadowReassertSkips = 0; _photoShadowForcedSaves = 0;
    if (!A._shadowInited) {
      A.renderer.shadowMap.enabled = true;
      A.renderer.shadowMap.type = THREE.PCFShadowMap;
      A.renderer.shadowMap.autoUpdate = (window._shadowAutoUpdate === true);
      A._shadowInited = true;
    }
    A.sun.castShadow = true;
    // §PHOTO_SHADOW_TARGET_CENTRE (2026-08-11, real user report: "no shadow at high noon" on the
    // film's OPENING DIVE beat): was A.controls.target unconditionally — the shadow camera was
    // aimed wherever the VIEW camera currently happens to be looking, not at the building. During
    // an establishing dive the view target drifts far from the building, so the whole shadow
    // frustum (any _env size, any sun angle) could miss the building outright — a DIFFERENT bug
    // from §PHOTO_SUN_SHADOW_REACH above (that one was frustum SIZE; this is frustum POSITION).
    // Same failure shape §CINEMA_PIVOT already found + fixed for the camera orbit pivot itself
    // (this file, _cinemaPathPlan, "WAS: var tgt = A.controls.target; UNCONDITIONALLY") — reusing
    // its proven fix, not reinventing: the real building bbox centre via A.ifc2three(), the
    // established IFC->scene axis transform, not a guessed axis mapping.
    var _ctr = A.controls ? A.controls.target : { x: 0, y: 0, z: 0 };
    var _camTgtForLog = { x: _ctr.x, y: _ctr.y, z: _ctr.z };
    var _shadowBbox = FXS._buildingBBoxArc() || FXS._buildingBBoxIfc();
    var _centreSrc = 'camera-target(FALLBACK, no bbox/ifc2three)';
    if (_shadowBbox && A.ifc2three) {
      var _sLo = A.ifc2three(_shadowBbox.xMin, _shadowBbox.yMin, _shadowBbox.zMin);
      var _sHi = A.ifc2three(_shadowBbox.xMax, _shadowBbox.yMax, _shadowBbox.zMax);
      _ctr = { x: (_sLo.x + _sHi.x) / 2, y: (_sLo.y + _sHi.y) / 2, z: (_sLo.z + _sHi.z) / 2 };
      _centreSrc = 'building-bbox-centre';
    }
    console.log('§PHOTO_SHADOW_TARGET src=' + _centreSrc +
      ' target=(' + _ctr.x.toFixed(1) + ',' + _ctr.y.toFixed(1) + ',' + _ctr.z.toFixed(1) + ')' +
      ' cameraTarget=(' + _camTgtForLog.x.toFixed(1) + ',' + _camTgtForLog.y.toFixed(1) + ',' + _camTgtForLog.z.toFixed(1) + ')' +
      ' drift=' + Math.hypot(_ctr.x - _camTgtForLog.x, _ctr.y - _camTgtForLog.y, _ctr.z - _camTgtForLog.z).toFixed(1));
    A.sun.target.position.copy(_ctr);
    A.sun.target.updateMatrixWorld();
    var _env = 300;
    var _bc = Object.values(A.buildingCentres || {})[0];
    if (_bc && _bc.envelope) _env = Math.ceil(_bc.envelope);
    _env = Math.max(_env, 50);
    // §PHOTO_SKYLINE_SHADOW_FRUSTUM (bug: "the silhouette buildings in distance cannot cast shadows
    // well" — confirmed via real measured numbers, not assumption: HHS_Office_Federated envelope=
    // 68.17m gave a frustum half-width of 69m, but the skyline ring (built in _buildPhotoProps,
    // radius = envelope * PHOTO_SKYLINE_RADIUS_MULT) sits at ~150m — all 36/36 skyline boxes fell
    // entirely outside [-_env,_env] on X and/or Z, so they were clipped from the shadow depth pass
    // before any render, regardless of castShadow. This has been true since the photo-shadow
    // feature's OWN introduction (PR #806, 2026-07-16) — the same commit that set the skyline ring
    // to its current radius multiplier never accounted for it here; not a later drift-apart
    // regression. Recomputed from the SAME real bbox query _buildPhotoProps() itself uses (not read
    // off the built skyline group, which may not exist yet — _enablePhotoShadows() runs BEFORE
    // _buildPhotoProps()/_showPhotoProps(true) in _applyPhotoStaging's call order below, so a
    // group-based read would miss the very first Alt+S press for a building).
    var _skyBbox = FXS._buildingBBoxIfc();
    if (_skyBbox) {
      var _skyEnvelope = Math.max(_skyBbox.xMax - _skyBbox.xMin, _skyBbox.yMax - _skyBbox.yMin, 50);
      var _skyRadius = _skyEnvelope * FXS.PHOTO_SKYLINE_RADIUS_MULT;
      _env = Math.max(_env, Math.ceil(_skyRadius + FXS.PHOTO_SKYLINE_BOX_MARGIN));
    }
    // §PHOTO_SUN_SHADOW_REACH (2026-08-11, real numbers not eyeballed — see
    // prompts/PHOTOREAL_STILL_RENDER.md §SUN_ARC "study the maths" section): the skyline-only
    // _env above sizes the frustum from the building's FOOTPRINT, never from how far a LOW sun
    // throws a shadow. At dusk (elevation=6°) shadow reach = height/tan(6°) ~ 9.5x the building's
    // own height — for HHS_Office_Federated (height~19.8m) that's ~188m, exceeding the ~180m
    // skyline-only _env, so the shadow's own tip fell outside its shadow camera's frustum and was
    // silently clipped (never rendered, not a shading bug). Measured: a real 52-frame bake showed
    // contrast/dynamic-range declining monotonically toward dusk instead of increasing, consistent
    // with this (scratchpad/analyze_hhs_shadow_frames.py, this session's own witness).
    // Elevation read directly from A.sun.position, not passed in (this function has no elevation
    // param) — scene.js updateSky() sets sun.position = direction * 5000 (a fixed constant, not
    // approximated here), so elevation = asin(y/5000) is exact.
    if (_skyBbox) {
      var _bldgHeight = Math.max(1, _skyBbox.zMax - _skyBbox.zMin);
      var _elevRad = Math.asin(Math.max(-1, Math.min(1, A.sun.position.y / 5000)));
      var _elevDeg = THREE.MathUtils.radToDeg(_elevRad);
      if (_elevDeg > 0.5) {  // guard: at/below horizon, tan() blows up to a meaningless frustum
        var _shadowReach = _bldgHeight / Math.tan(_elevRad);
        var _envBefore = _env;
        _env = Math.max(_env, Math.ceil(_shadowReach + FXS.PHOTO_SKYLINE_BOX_MARGIN));
        if (_env !== _envBefore) console.log('§PHOTO_SUN_SHADOW_REACH elevation=' + _elevDeg.toFixed(1) +
          ' bldgHeight=' + _bldgHeight.toFixed(1) + ' shadowReach=' + _shadowReach.toFixed(0) +
          ' env ' + _envBefore + '->' + _env);
      }
    }
    // NOTE: computed AFTER A.updateSky() has already positioned A.sun at the dusk direction (see
    // call order in _applyPhotoStaging below) — using the ORIGINAL toggleShadow() order (frustum
    // math before the sun is repositioned) would size this frustum for the wrong sun distance.
    var _sunDist = A.sun.position.distanceTo(_ctr);
    // §PHOTO_SHADOW_RESOLUTION (2026-08-11, real user report: shadow "has no effect on the top
    // fixtures... not thrown on roof"): §PHOTO_SUN_SHADOW_REACH above correctly widens _env to fit
    // the building's own long shadow at low sun angles, but that widening spreads the SAME fixed
    // texel budget more thinly across a bigger frustum -- small rooftop-scale objects (equipment,
    // fixtures, ~1-2m) end up with only a handful of texels and their shadow washes out under PCF
    // filtering, even though §PHOTO_SHADOW_FRUSTUM_COVERAGE already proves they're geometrically
    // IN the frustum with castShadow=true. Doubling resolution here (2048->4096, 4x memory/render
    // cost for the shadow pass) is deliberately scoped to THIS bake-only path, not A.toggleShadow's
    // own 2048 (tools.js §S288: "quarters the texel cost of every shadow render" -- that number was
    // chosen for a shadow mode active during CONTINUOUS live navigation, a cost/frame every frame;
    // this path only ever runs during a deliberate Alt+S/MaxQ capture, never during normal nav, so
    // the same cost concern does not apply here).
    // §R17_SHADOWMAP_RELEASE — remember what this raise is BORROWING FROM, then make the raise
    // actually take effect. MEASURED (§R17 control arm, HHS_Office_Federated, one Alt+S):
    // `§R17_SHADOWMAP S1c_after_idle6s mapSize=4096 realMap=4096x4096 mapMB=128 castShadow=false`
    // — the 4096 map survived teardown, survived a second full press cycle, and was still resident
    // with NOTHING casting into it. So the paragraph above ("this path only ever runs during a
    // deliberate Alt+S/MaxQ capture, never during normal nav, so the same cost concern does not
    // apply here") was FALSE AS SHIPPED in both halves: the 4x texel cost it rules out for
    // navigation was paid on every navigation frame after the first Alt+S, and 128 MiB of GPU
    // render-target memory was never handed back for the life of the tab.
    if (_photoShadowMapSizeSaved === null) {
      _photoShadowMapSizeSaved = { w: A.sun.shadow.mapSize.width, h: A.sun.shadow.mapSize.height };
    }
    // §SHADOW_SIZE_BY_ENVELOPE (2026-09-24, red1: jagged roof-edge shadows) — the texel budget follows
    // the frustum instead of a fixed 4096. Hospital's env (362) is twice HHS's (180), so a fixed 4096
    // gave it 0.177 m texels against HHS's 0.088 m (texelPerM 5.7 vs 11.4). Capped at the GPU's limit.
    var _maxTex = (A.renderer && A.renderer.capabilities && A.renderer.capabilities.maxTextureSize) || 4096;
    // 8192 only when 4096 would leave texels coarser than 0.12 m (env > ~245): Clinic's env 198 gives
    // 0.097 m at 4096 — already about HHS's 0.088 m — and was being doubled to 512 MB for nothing.
    var _shadowSize = (2 * _env / 4096 > 0.12) ? 8192 : 4096;
    _shadowSize = Math.max(Math.min(4096, _maxTex), Math.min(_shadowSize, _maxTex));
    // §STILL_SHADOW_CASCADE C3/D1: every cascade (the sun = cascade 0) at 4096 = 128 MB, 4 x 128 = 512 MB = today's one 8192 map
    var _csmSize = _cascadeOn() ? Math.min(4096, _maxTex) : 0;
    _csmSingleSize = _shadowSize;   // D8: the single map's size, kept for the never-coarser test
    if (_csmSize) { console.log('§SHADOW_SIZE_BY_ENVELOPE cascades on: per-cascade size ' + _csmSize + ' (was ' + _shadowSize + ' for one map) — §STILL_SHADOW_CASCADE C3'); _shadowSize = _csmSize; }
    A.sun.shadow.mapSize.width = _shadowSize;
    A.sun.shadow.mapSize.height = _shadowSize;
    console.log('§SHADOW_SIZE_BY_ENVELOPE env=' + _env + ' size=' + _shadowSize + ' maxTex=' + _maxTex + ' texel=' + (2 * _env / _shadowSize).toFixed(3) + 'm');
    // A map already allocated at the SMALLER nav size would not be reallocated by three.js on a
    // mapSize change (see _releaseSunShadowMap), so the raise would silently not happen and the
    // shadow render would target a 4096 viewport inside a 2048 framebuffer. Releasing here makes
    // the documented intent above true. No-op when no map exists yet, which is the usual case.
    _releaseSunShadowMap('raise ' + _shadowSize + ' for still');
    A.sun.shadow.camera.near = Math.max(1, _sunDist * 0.05);
    A.sun.shadow.camera.far = _sunDist * 4;
    A.sun.shadow.camera.left = -_env;
    A.sun.shadow.camera.right = _env;
    A.sun.shadow.camera.top = _env;
    A.sun.shadow.camera.bottom = -_env;
    // §PHOTO_SHADOW_BIAS_SCALE (2026-08-12 — the root cause of §MAIN_BUILDING_SHADOW; every number
    // below was MEASURED live this session on HHS_Office_Federated, none guessed).
    // three.js applies shadow.bias in NORMALISED depth, not metres — shadowmap_pars_fragment.glsl
    // does literally `shadowCoord.z += shadowBias` where z spans [0,1] across the shadow camera's
    // near..far. So the world-space peter-panning it produces is bias * (far - near), and the same
    // constant means completely different things on two different shadow cameras:
    //   A.toggleShadow (tools.js, the path the user confirms has ALWAYS worked, and the path this
    //     one was copied from): it repositions the sun to ctr + env*(0.8,2,0.6), measured
    //     sunDist=150 -> near=7.7 far=617.2, range=609.4 m -> -0.0005 = 0.305 m. Fine.
    //   this path: it must NOT reposition the sun (A.sun.position is what updateSky, the Sky shader
    //     and the lensflare all read — it stays at direction*5000), so measured sunDist=5000 ->
    //     near=250 far=19998, range=19,748 m -> the SAME -0.0005 = 9.874 m. 32.4x.
    // A 9.87 m world bias erases every shadow whose caster->receiver separation along the sun ray
    // is under ~10 m. That separation is casterHeight / sin(elevation), so at the film's 55 deg
    // opening nothing under 8.1 m tall cast anything at all: every rooftop fixture, and the near
    // part of the building's own short ground shadow — while the tall skyline silhouette props
    // cleared it easily, which is exactly the differential the user reported ("shadows only hit
    // the other silhouette, not the HHS Office nor its roof"). Proven by paired A/B on a real
    // render: changing ONLY this line's value, same camera/sun/geometry, darkened 1,665 px at the
    // 55 deg opening and 12,095 px at dusk, and brightened 0 px at either
    // (scratchpad witness_shadow_bias_ab.js — the change only ever ADDS shadow).
    // Fix: hold the WORLD-space bias, don't copy the normalised constant. Floor is toggleShadow's
    // own proven 0.305 m; at grazing sun one shadow texel spans texelWorld/tan(elevation) of depth,
    // so the bias must also clear that or the ground self-shadows (acne). The arc's LOWEST
    // elevation is used because _enablePhotoShadows runs once at staging while _sunArcStep sweeps
    // the sun 55->6 deg afterwards without recomputing this camera — so the bias has to be safe at
    // the worst angle the film reaches, not just at the angle staging happened to see.
    // §STILL_SHADOW_FIT — the fitted box is applied by _stillFitApply() at the END of staging (Alt+S: after the skyline
    // props exist, so their shadows can be kept) and per frame in films (§FILM_PARITY). Here: the whole-envelope box,
    // and the building's corners cached for the fit.
    var _boxW = 2 * _env, _boxH = 2 * _env;
    _stillFitBox = null; _fitState = { env: _env, ctr: _ctr, corners: [], sizeW: 0, sizeH: 0, changes: 0 };
    if (_skyBbox && A.ifc2three) {
      for (var _ci = 0; _ci < 8; _ci++) _fitState.corners.push(A.ifc2three(_ci & 1 ? _skyBbox.xMax : _skyBbox.xMin, _ci & 2 ? _skyBbox.yMax : _skyBbox.yMin, _ci & 4 ? _skyBbox.zMax : _skyBbox.zMin));
    } else {
      for (var _bi = 0; _bi < 8; _bi++) _fitState.corners.push({ x: _ctr.x + (_bi & 1 ? _env : -_env), y: _ctr.y + (_bi & 2 ? _env : -_env), z: _ctr.z + (_bi & 4 ? _env : -_env) });
    }
    // Arm 2 — PCF disk radius (r186 samples a Vogel disk scaled by shadow.radius). Default 1 = three's own default.
    if (_shadowRadiusSaved === null) _shadowRadiusSaved = A.sun.shadow.radius;
    if (!A._maxqActive || A._filmParity) {
      var _rm = /[?&]shadowradius=([0-9.]+)/.exec(location.search);
      // §STILL_SHADOW_EDGE: Alt+S default 1.5 texels (edge filtered over 2R = 3 texels + the bilinear 1); films keep 1
      var _rad = (typeof A._stillShadowRadius === 'number') ? A._stillShadowRadius : (_rm ? parseFloat(_rm[1]) : (!A._maxqActive && _edgeOn() ? 1.5 : 1));
      A.sun.shadow.radius = Math.max(0, Math.min(8, _rad));
      console.log('§STILL_SHADOW_RADIUS radius=' + A.sun.shadow.radius);
    }
    var _shadowRange = A.sun.shadow.camera.far - A.sun.shadow.camera.near;
    var _texelWorld = Math.max(_boxW, _boxH) / A.sun.shadow.mapSize.width;
    if (!A._maxqActive && window.LightLaw && window.LightLaw.penumbra) { var _pf = (2 * A.sun.shadow.radius + 1) * _texelWorld;   // §ZERO Z12 SUN_PENUMBRA, single map
      console.log('§SUN_PENUMBRA map=single discDeg=' + window.LightLaw.SUN.discDeg + ' R=' + A.sun.shadow.radius + ' texelM=' + _texelWorld.toFixed(4) + ' filterM=' + _pf.toFixed(4) +
        ' dMatch=' + (_pf / window.LightLaw.penumbra(1)).toFixed(2) + 'm (cascades, if used, log their own)'); }
    // ══ §129.45 (2026-09-19, red1: "all i want is that it is realistic, not cut off at the base of
    // each column") — THE GRAZING TERM IS WHAT CUT THE SHADOWS OFF AT THE BASE. ══════════════════
    // A depth bias is a push ALONG THE LIGHT RAY, so on the ground it moves the shadow away from
    // its caster by worldBias / tan(elevation) — the peter-panning gap. The line below used to be
    //     _worldBias = max(0.305, _texelWorld / tan(PHOTO_SUN_ELEVATION_END))
    // i.e. one frozen value, sized so the GROUND would not self-shadow at the lowest angle the film
    // was ever expected to reach. That is a real problem and the term solved it — but it pays for it
    // in gap at every OTHER angle, and it is computed from PHOTO_SUN_ELEVATION_END, the SCRIPTED
    // arc's 6 deg floor. §SUN_ONE retired that arc: with the compass on, the real sun runs
    // 42.4 -> 1.4 deg (measured, 1969-frame HHS bake, 2026-09-19). MEASURED consequences on HHS
    // (env 180, map 4096, texelWorld 0.0879 m, so the frozen bias is 0.836 m):
    //     42.4 deg -> 0.9 m gap     9 deg -> 5.3 m gap     3 deg -> 16 m     1.4 deg -> 34 m
    // Every column's shadow detached from its own base, by about a metre at the start and by tens
    // of metres by the end. That is exactly what red1 described, and it gets worse through the film.
    //
    // WIDENING THE FRUSTUM WOULD HAVE MADE IT WORSE, which is worth recording because it was the
    // obvious-looking fix: gap scales with texelWorld = 2*env/mapSize, so a bigger env means a
    // bigger gap. The far-tip clipping is a separate fault and must not be paid for here.
    //
    // THE RIGHT TOOL IS normalBias, WHICH THIS VIEWER HAS NEVER USED. three.js offsets the shadow
    // lookup along the SURFACE NORMAL rather than along the light ray, which is what acne actually
    // needs — the ground stops self-shadowing without the shadow sliding away from anything
    // standing on it. So the grazing term moves to normalBias, and the depth bias drops back to
    // toggleShadow's own proven 0.305 m world-space value, the number the interactive path has
    // always worked with (see the measurements above). Gap at 1.4 deg falls from 34 m to 12.5 m
    // and at 42 deg from 0.9 m to 0.33 m, with the acne duty carried by a term that costs no gap.
    // `__noNormalBias` restores the old single-bias behaviour for an A/B.
    var _useNormalBias = !(typeof window !== 'undefined' && window.__noNormalBias);
    var _grazeRad = THREE.MathUtils.degToRad(Math.max(1, FXS.PHOTO_SUN_ELEVATION_END));
    var _worldBias = _useNormalBias ? 0.305 : Math.max(0.305, _texelWorld / Math.tan(_grazeRad));
    // Sized off the real texel, not a taste constant: 2 texels is the usual working range for
    // normalBias, and one texel is the distance over which the depth comparison is ambiguous.
    A.sun.shadow.normalBias = _useNormalBias ? (2 * _texelWorld) : 0;
    A.sun.shadow.bias = -(_worldBias / _shadowRange);
    // §STILL_SHADOW_EDGE: on an Alt+S with the fit on, these staging values are replaced at the end of staging — print that,
    // not a stale predicted gap (watchdog red1-c6: two lines gave two answers)
    if (!A._maxqActive && _edgeOn() && _fitOn()) console.log('§PHOTO_SHADOW_CONTACT staging values (worldBias ' + _worldBias.toFixed(3) + 'm, range ' + _shadowRange.toFixed(0) + 'm) are superseded by §STILL_SHADOW_EDGE — the fitted range, bias, normalBias and predictedBaseGap are printed there');
    else {
    console.log('§PHOTO_SHADOW_CONTACT normalBias=' + A.sun.shadow.normalBias.toFixed(3) + 'm' +
      ' worldBias=' + _worldBias.toFixed(3) + 'm texelWorld=' + _texelWorld.toFixed(4) + 'm' +
      ' predictedBaseGap[42deg=' + (_worldBias / Math.tan(THREE.MathUtils.degToRad(42))).toFixed(2) +
      'm 9deg=' + (_worldBias / Math.tan(THREE.MathUtils.degToRad(9))).toFixed(2) +
      'm 1.4deg=' + (_worldBias / Math.tan(THREE.MathUtils.degToRad(1.4))).toFixed(1) + 'm]' +
      (_useNormalBias ? '' : ' (__noNormalBias control: old single-bias behaviour)') +
      ' — §129.45, the gap is what red1 saw as a cut-off at each column base');
    console.log('§PHOTO_SHADOW_BIAS worldBias=' + _worldBias.toFixed(3) + 'm bias=' + A.sun.shadow.bias.toExponential(3) +
      ' range=' + _shadowRange.toFixed(0) + 'm texel=' + _texelWorld.toFixed(3) + 'm grazeElev=' + FXS.PHOTO_SUN_ELEVATION_END +
      ' (was -0.0005 = ' + (0.0005 * _shadowRange).toFixed(2) + 'm, which erased every caster under ' +
      (0.0005 * _shadowRange * Math.sin(THREE.MathUtils.degToRad(FXS.PHOTO_SUN_ELEVATION_START))).toFixed(1) +
      'm tall at the arc start)');
    }
    A.sun.shadow.camera.updateProjectionMatrix();
    if (A.ground) A.ground.receiveShadow = true;
    var _shadowList = [];
    A.scene.traverse(function(o) {
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return;
      if (o.userData && o.userData.excludeFromShadow) return;   // §DATUM_NO_SHADOW — annotation geometry, not a real caster
      _shadowList.push(o);
    });
    // §PHOTO_SHADOW_FRUSTUM_COVERAGE (2026-08-11, real user ask: "GIGO code witness logging must
    // reveal" -- not another video/frame-extraction round-trip): direct geometric proof of whether
    // the shadow camera can actually SEE the casting geometry, computed from live scene state, no
    // render needed. A.sun.shadow.updateMatrices() forces the shadow camera's position/matrices to
    // reflect the position/target JUST set above -- normally the renderer does this lazily before
    // its own shadow pass, but nothing has rendered yet at this point in the function, so without
    // this call the frustum test below would run against STALE (previous frame's) camera matrices.
    // §PHOTO_SHADOW_FRUSTUM_STALE_LIGHT (2026-08-12): updateMatrices() reads the shadow camera's
    // position out of light.matrixWorld, NOT light.position — and nothing has refreshed matrixWorld
    // since updateSky moved the sun, so without this line the frustum test can run against the sun's
    // PREVIOUS world position and report a coverage gap that does not exist at render time (the
    // renderer's own scene.updateMatrixWorld runs before its shadow pass). Measured: a load that
    // used A.toggleShadow first, then staged, logged inFrustum=2 outsideFrustum=349 here purely
    // from that staleness, while a clean load logged inFrustum=351 outsideFrustum=0 on identical
    // geometry. time_machine.js's applySunCycle already calls sun.updateMatrixWorld() for the same
    // reason; this path had not. Instrumentation correctness — the render was never affected.
    A.sun.updateMatrixWorld();
    A.sun.shadow.updateMatrices(A.sun);
    var _frustum = new THREE.Frustum();
    _frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(
      A.sun.shadow.camera.projectionMatrix, A.sun.shadow.camera.matrixWorldInverse));
    var _inFrustum = 0, _outFrustum = 0;
    _shadowList.forEach(function(o) {
      if (!o.visible) return;
      if (o.geometry && !o.geometry.boundingSphere && o.geometry.computeBoundingSphere) o.geometry.computeBoundingSphere();
      if (_frustum.intersectsObject(o)) _inFrustum++; else _outFrustum++;
    });
    console.log('§PHOTO_SHADOW_FRUSTUM_COVERAGE inFrustum=' + _inFrustum + ' outsideFrustum=' + _outFrustum +
      (_stillFitBox ? ' (§STILL_SHADOW_FIT box: meshes whose sun ray misses the view are outside by design)' : '') +
      ' (outsideFrustum = geometry the shadow camera cannot see right now, regardless of castShadow flags -- ' +
      'nonzero here is a real, unfixed frustum-coverage gap; zero here rules frustum coverage OUT as the cause)');
    var _si = 0;
    (function _chunk() {
      var end = Math.min(_si + 5000, _shadowList.length);
      for (; _si < end; _si++) { var o = _shadowList[_si]; if (o.visible) { o.castShadow = true; o.receiveShadow = true; } }
      A.renderer.shadowMap.needsUpdate = true;
      if (_si < _shadowList.length) setTimeout(_chunk, 0);
      else console.log('§PHOTO_SHADOW enabled casters=' + _shadowList.length + ' sunDist=' + _sunDist.toFixed(0) +
        ' env=' + _env + ' texelPerM=' + (A.sun.shadow.mapSize.width / Math.max(_boxW, _boxH)).toFixed(1) + (_stillFitBox ? ' (fitted box)' : ''));
    })();
  }
  // §R17_SHADOWMAP_RELEASE — three.js allocates `light.shadow.map` ONCE and reallocates it ONLY on a
  // shadow TYPE change. Verified by reading the vendored build, not recalled: WebGLShadowMap does
  // `if (null === c.map || true === f) { ...dispose...; c.map = new I(a.x, a.y, ...) }` where
  // `f = A !== this.type` — a TYPE comparison, with no mapSize term anywhere in the condition.
  // Two consequences, and the second is why this is a function rather than two assignments:
  //   1. writing `shadow.mapSize` back frees NOTHING — the old texture stays resident;
  //   2. it is also WRONG on its own — the renderer sizes the shadow VIEWPORT from mapSize while
  //      the framebuffer keeps its old dimensions, so a mapSize-only restore corrupts the shadow.
  // Disposing and nulling the map is what makes the size change real: three.js rebuilds it at the
  // current mapSize the next time something actually casts, and if nothing does, it simply stays freed.
  function _releaseSunShadowMap(why) {
    var sh = A.sun && A.sun.shadow;
    if (!sh || !sh.map) return 0;
    var w = sh.map.width, h = sh.map.height;
    var mb = (w * h * 4 * (sh.map.depthTexture ? 2 : 1)) / 1048576;   // colour plane + paired depth texture
    try {
      if (sh.map.depthTexture) { sh.map.depthTexture.dispose(); sh.map.depthTexture = null; }
      sh.map.dispose();
      sh.map = null;
      if (sh.mapPass) { sh.mapPass.dispose(); sh.mapPass = null; }   // VSM-only scratch; null under PCF
    } catch (e) { console.warn('§SHADOWMAP_RELEASE failed ' + e.message); return 0; }
    console.log('§SHADOWMAP_RELEASE ' + why + ' was=' + w + 'x' + h + ' freedMB=' + mb.toFixed(1) +
      ' mapSizeNow=' + sh.mapSize.width + ' (three.js rebuilds at mapSizeNow on the next shadow render, or never)');
    return mb;
  }
  function _disablePhotoShadows() {
    if (!_photoShadowSelfEnabled) return;
    _photoShadowSelfEnabled = false;
    A.sun.castShadow = false;
    if (_shadowRadiusSaved !== null) { A.sun.shadow.radius = _shadowRadiusSaved; _shadowRadiusSaved = null; }   // §STILL_SHADOW_RADIUS
    _stillFitBox = null;
    _stillCascadeLightsRemove();   // §STILL_SHADOW_CASCADE: lights out of the scene, their maps released (§R17)
    // §R17_SHADOWMAP_RELEASE — hand the borrowed 4096 map back. Guarded on _photoShadowSelfEnabled
    // by the early return above, which is exactly the "we were the ones who raised it" condition:
    // when the user's own Shadow mode is on, _enablePhotoShadows returns before the raise and this
    // whole function never runs, so a user-owned shadow map is never touched.
    if (_photoShadowMapSizeSaved) {
      A.sun.shadow.mapSize.width = _photoShadowMapSizeSaved.w;
      A.sun.shadow.mapSize.height = _photoShadowMapSizeSaved.h;
      _releaseSunShadowMap('still exit — mapSize back to ' + _photoShadowMapSizeSaved.w);
      _photoShadowMapSizeSaved = null;
    }
    var _unshadowList = [];
    A.scene.traverse(function(o) { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) _unshadowList.push(o); });
    var _ui = 0;
    (function _chunk() {
      var end = Math.min(_ui + 5000, _unshadowList.length);
      for (; _ui < end; _ui++) { _unshadowList[_ui].castShadow = false; _unshadowList[_ui].receiveShadow = false; }
      if (_ui < _unshadowList.length) setTimeout(_chunk, 0);
      else console.log('§PHOTO_SHADOW disabled reassertRuns=' + _photoShadowReassertRuns +
        ' reassertSkips=' + _photoShadowReassertSkips + ' forcedSaves=' + _photoShadowForcedSaves);
    })();
  }
  var _photoNightWasOn = false, _photoSkyWasVisible = false;
  var _photoDuskMoodApplied = false;  // §PHOTO_SUN_SEPARATION: snapshot of A._photoDuskMood at
                                       // staging time, so teardown restores exactly what staging
                                       // actually did even if the flag changes mid-session.
  var _dlodPausedByStill = false;  // §DLOD_STILL_OWNERSHIP — only re-enable dlod.js if photo staging paused it
  var _photoStagingOn = false;  // §PHOTO_DOUBLE_APPLY_GUARD — staging applied once per photo cycle
  A._photoStagingOn = false;    // public mirror — with Stage-2 auto-arm disabled (§AUTO_STAGE2_DISABLED)
                                // soft-park is signalled by kept-alive staging alone, and main.js's
                                // interaction gates (_photoCycleEngaged) need to see it to route a
                                // tap/UI-click to the full teardown.
  var _photoGroundWasVisible = false, _photoGroundPrevKey = null, _photoGroundPrevColor = null;
  var _photoFogColorSaved = null, _photoFogDensitySaved = null;
  var _photoSkyUniSaved = null;
  // §PHOTO_VARIATION (2026-07-16, user spec): "each time it is done first time it returns a diff
  // and once user agrees, press 'cinema' icon, it takes that persisted cache." A single random
  // seed (`A._photoPaintSeed`) drives every randomized presentation touch (ground puddle
  // placement here; surface paint jitter in streaming.js's triplanar shader). Re-rolled on every
  // Alt+S trigger while unlocked (so repeated triggers let the user browse different results);
  // A.startCinemaOrbit() locks it so the capture uses whichever variation was on screen when the
  // user pressed the button, and it stays locked for the rest of the session. No explicit clear-
  // on-close/Home code needed: `A._photoPaintSeed` is plain in-memory JS state and Home navigates
  // via a real `location.href` page reload (panels.js), which destroys it for free — matching
  // "clears each time viewer closes or returns to Home" without any extra plumbing.
  var _photoVariationLocked = false;
  function _seededRand(seed) { var s = Math.sin(seed * 12345.6789) * 43758.5453; return s - Math.floor(s); }
  // §PHOTO_PUDDLE (user ask: "wet ground... selective reflection over selective areas" — not an
  // even wet sheen, real puddles). A small fixed count of randomly-placed circular wet patches
  // (seeded, so reproducible while the variation is locked), each lowering roughness/darkening
  // diffuse ONLY inside its radius via a ground-material onBeforeCompile injection — same gated,
  // still-render-only pattern already proven for the triplanar textures (streaming.js), reusing
  // the EXISTING ground envMapIntensity (scene.js, 0.15) rather than adding a new one: lower
  // roughness alone makes a GGX/IBL reflection read sharper/more visible at the same intensity,
  // so this is real reflective play without re-touching the hemi/ambient landmine already
  // documented earlier in this file.
  var PHOTO_PUDDLE_COUNT = 6;
  var _groundPuddleShaderWired = false;
  var _puddleSeedBuilt = null, _puddleCenters = [], _puddleRadii = [];
  function _buildGroundPuddles(cx, cy) {
    var seed = A._photoPaintSeed || 0;
    if (_puddleSeedBuilt === seed && _puddleCenters.length) return;
    _puddleSeedBuilt = seed;
    _puddleCenters = []; _puddleRadii = [];
    var bbox = FXS._buildingBBoxIfc();
    var envelope = bbox ? Math.max(bbox.xMax - bbox.xMin, bbox.yMax - bbox.yMin, 30) : 40;
    for (var i = 0; i < PHOTO_PUDDLE_COUNT; i++) {
      var rx = _seededRand(seed + i * 0.618034 + 0.11) - 0.5;
      var rz = _seededRand(seed + i * 0.618034 + 0.37) - 0.5;
      var rr = _seededRand(seed + i * 0.618034 + 0.59);
      var pos = A.ifc2three(cx + rx * envelope * 1.4, cy + rz * envelope * 1.4, 0);
      _puddleCenters.push({ x: pos.x, z: pos.z });
      _puddleRadii.push(2 + rr * (envelope * 0.09));
    }
  }
  function _applyPuddleUniforms(shader) {
    var n = Math.min(_puddleCenters.length, 8);
    shader.uniforms.uPuddleCount.value = n;
    for (var i = 0; i < n; i++) {
      shader.uniforms.uPuddleCenters.value[i].set(_puddleCenters[i].x, _puddleCenters[i].z);
      shader.uniforms.uPuddleRadii.value[i] = _puddleRadii[i];
    }
  }
  // §GROUND_WETNESS_OVERRIDE (2026-07-17, user: "we have to contain what we want only within S
  // and J. When S is ON, it is all reflective ground... The J reflect dial will control its effect.
  // When J is off, it persists for the session"): 0 = off, 1 = the whole ground at puddle-strength
  // wetness (roughness 0.08, darkened) uniformly, independent of the small random puddle patches
  // (both can coexist — max() below, whichever reads wetter at a given pixel wins). Contained to
  // Alt+S: staging auto-applies a mid-value default (GROUND_WETNESS_STAGE_DEFAULT below) the FIRST
  // time this session, tunable live via Alt+J's "reflect" dial from there — once the user touches
  // it, their value persists for the rest of the session (across S/J toggling, until page reload),
  // never auto-reset back to the default.
  var GROUND_WETNESS_STAGE_DEFAULT = 0.5;
  var _groundWetnessUserSet = false;
  A._groundWetnessOverride = 0;
  // §VAC V2 / §R14.1 (bim-compiler prompts/CPE_4D_PERF_MEM_STUDY.md): this setter logged
  // unconditionally, including when it re-set the value it already held. Alt+S staging is torn
  // down and rebuilt on EVERY bake frame, so MEASURED on s5_hospital.log it emitted 2,028
  // firings of ONE distinct line — `value=0.5 userSet=false` — a state-change log reporting no
  // state change. Routed through the shared _vacLog below so it gets the SAME run-length reporting
  // (and the same bounded heartbeat) as the other repeated per-frame tags: a run of 2,028 identical
  // NO-OP re-sets that never ends must still say how long it is, or the compression has dropped
  // the signal instead of compressing it.
  // Declared here, next to its only user, rather than beside the other §VAC state further down:
  // `var` hoists but its ASSIGNMENT does not, so keeping it above the setter removes any
  // ordering hazard if this setter is ever called earlier than it is today (it runs from
  // _applyPhotoStaging, i.e. at Alt+S, long after setupEffects returns). `_vacLog` itself is a
  // hoisted function declaration in this same scope, so it is callable from here regardless.
  var _vacGroundWetness = { last: null, n: 0 };
  A._setGroundWetness = function(v, _isUserAction) {
    _wireGroundPuddleShader();  // safe no-op if already wired (Alt+S may have wired it first)
    A._groundWetnessOverride = Math.max(0, Math.min(1, v));
    if (_isUserAction !== false) _groundWetnessUserSet = true;  // default true — only the internal
    // staging auto-default call below passes false, so it never overrides a user's own choice
    FXS._vacLog(_vacGroundWetness,
      '§GROUND_WETNESS_OVERRIDE value=' + A._groundWetnessOverride + ' userSet=' + _groundWetnessUserSet,
      'NO-OP re-sets of the value already held — Alt+S staging rebuilds every frame');
    if (A.markDirty) A.markDirty();
  };
  function _wireGroundPuddleShader() {
    if (_groundPuddleShaderWired || !A.ground) return;
    _groundPuddleShaderWired = true;
    var mat = A.ground.material;
    mat.onBeforeCompile = function(shader) {
      shader.uniforms.uPuddleActive = { value: 0.0 };
      shader.uniforms.uPuddleCount = { value: 0 };
      shader.uniforms.uPuddleCenters = { value: (new Array(8)).fill(null).map(function() { return new THREE.Vector2(); }) };
      shader.uniforms.uPuddleRadii = { value: new Float32Array(8) };
      shader.uniforms.uWetnessOverride = { value: 0.0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorldPos;')
        .replace('#include <worldpos_vertex>', [
          '#include <worldpos_vertex>',
          'vGroundWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        ].join('\n'));
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', [
          '#include <common>',
          'varying vec3 vGroundWorldPos;',
          'uniform float uPuddleActive;',
          'uniform int uPuddleCount;',
          'uniform vec2 uPuddleCenters[8];',
          'uniform float uPuddleRadii[8];',
          'uniform float uWetnessOverride;'
        ].join('\n'))
        .replace('#include <roughnessmap_fragment>', [
          '#include <roughnessmap_fragment>',
          'float uGroundWetness = 0.0;',  // declared OUTSIDE the if (top-level in main()) so the
          // later metalnessmap_fragment injection below — which runs after this chunk in three.js's
          // standard MeshStandardMaterial ordering — can read the same value.
          'if (uPuddleActive > 0.5) {',   // uniform branch — near-zero cost when off (normal nav)
          '  float wetness = uWetnessOverride;',  // full-surface base, small puddles can only add to it
          '  for (int pi = 0; pi < 8; pi++) {',
          '    if (pi >= uPuddleCount) break;',
          '    float d = distance(vGroundWorldPos.xz, uPuddleCenters[pi]);',
          '    float w = 1.0 - smoothstep(uPuddleRadii[pi] * 0.55, uPuddleRadii[pi], d);',
          '    wetness = max(wetness, w);',
          '  }',
          '  uGroundWetness = wetness;',
          '  roughnessFactor = mix(roughnessFactor, 0.08, wetness);',
          '  diffuseColor.rgb *= mix(1.0, 0.72, wetness);',  // wet patches read darker/more saturated
          '}'
        ].join('\n'))
        // §WETNESS_METALNESS (2026-07-17, user: "still not auto reflect"): roughness alone stays
        // subtle on a zero-metalness dielectric (real physics — see #822/#824 investigation). Wet
        // areas now also push metalness up, which is what actually makes a puddle read as
        // reflective rather than just "less matte." metalnessmap_fragment runs after
        // roughnessmap_fragment in three.js's standard chunk order, so uGroundWetness is available.
        .replace('#include <metalnessmap_fragment>', [
          '#include <metalnessmap_fragment>',
          'if (uPuddleActive > 0.5) { metalnessFactor = mix(metalnessFactor, 0.85, uGroundWetness); }'
        ].join('\n'));
      // §TRIPLANAR_CLONE_BOMB (see streaming.js): plain property, never userData — userData is
      // JSON-round-tripped by Material.copy() on every clone.
      mat._puddleShader = shader;
      shader.uniforms.uPuddleActive.value = (A._stillRefineActive || A._groundWetnessOverride > 0) ? 1.0 : 0.0;
      shader.uniforms.uWetnessOverride.value = A._groundWetnessOverride;
      _applyPuddleUniforms(shader);
    };
    // §PHOTO_PUDDLE self-heal: same recompile-resets-uniforms landmine already found+fixed once
    // this session for the triplanar shader (§TRIPLANAR_RECOMPILE_FIX) — re-assert every frame
    // instead of relying on a single push at compile time.
    mat.onBeforeRender = function() {
      var sh = mat._puddleShader;
      if (sh) {
        sh.uniforms.uPuddleActive.value = (A._stillRefineActive || A._groundWetnessOverride > 0) ? 1.0 : 0.0;
        sh.uniforms.uWetnessOverride.value = A._groundWetnessOverride;
        _applyPuddleUniforms(sh);
      }
    };
    mat.needsUpdate = true;
  }
  // §LAYER2_HDRI (2026-07-16, PHOTOREAL_STILL_RENDER.md §LAYER 2 — "best effort:benefit ratio of
  // everything in this spec", finally implemented): swaps the procedural Preetham-sky-derived
  // envMap for a REAL photographed HDRI (Poly Haven, CC0 — "Belfast Sunset, Pure Sky", clear dusk
  // sky matching this staging's own dusk mood, no on-ground foreground objects to leak weird
  // reflections) during the photoshoot only. Improves glass/metal reflection quality directly —
  // the flat-gray-glazing gap already flagged. Lazy-loaded once (real HTTP fetch + PMREM cost,
  // ~1.2MB at 1k res — plenty for a reflection source, never displayed at full resolution
  // directly), cached for every subsequent Alt+S. Reuses the EXISTING _reassertPhotoEnvMap() loop
  // (already runs every accumulation frame, decoupled from when A._envMap last changed) to push
  // this onto materials — no new per-frame code needed, just swap the source texture it reads.
  var _hdriEnvMap = null, _hdriLoading = false, _hdriPmrem = null, _hdriReadyPromise = null;
  var _photoEnvMapSaved = null;
  // §CINEMA_HDRI_RACE (2026-07-24, user: "the scene capture also has some flicker or snapping at
  // the wrong frame, before the Alt-S fully applied"): _applyPhotoStaging() below kicks this load
  // off fire-and-forget — A.startCinemaOrbit's live Alt+C recording used to call it synchronously
  // then start capturing frame 0 immediately, so the HDRI envMap (real photographed reflections)
  // was still mid-fetch/mid-PMREM-generate on the early frames and popped in whenever the promise
  // happened to resolve — a real snap at a non-deterministic frame, not eyeballing. MaxQ's exporter
  // already avoids this with a "warm-up fold, discarded" (cinema_maxq.js §MAXQ warm-up) — this
  // returns a promise so the live path can await the same readiness before recorder.start() rather
  // than duplicating a fold mechanism it doesn't otherwise need. Always resolves (never rejects) —
  // load failure is a legitimate outcome (fall back to the procedural sky envMap), not a capture-
  // blocking error.
  function _ensureHdriEnvMap() {
    if (_hdriEnvMap) return Promise.resolve(_hdriEnvMap);
    if (_hdriReadyPromise) return _hdriReadyPromise;
    _hdriLoading = true;
    _hdriReadyPromise = Promise.all([import('./lib/HDRLoader.js')]).then(function(mods) {
      var _hdrMod = mods[0];
      if (!_hdrMod.HDRLoader) throw new Error('HDRLoader not exported');
      if (!_hdriPmrem) { _hdriPmrem = new THREE.PMREMGenerator(A.renderer); _hdriPmrem.compileEquirectangularShader(); }
      return new Promise(function(resolve) {
        new _hdrMod.HDRLoader().load('textures/hdri/belfast_sunset_puresky_1k.hdr', function(tex) {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          var envRT = _hdriPmrem.fromEquirectangular(tex);
          _hdriEnvMap = envRT.texture;
          tex.dispose();
          _hdriLoading = false;
          console.log('§LAYER2_HDRI_READY belfast_sunset_puresky_1k — real photographed envMap ready');
          // If still mid-photoshoot when the load finally resolves, apply immediately rather than
          // waiting for the next Alt+S — same "don't miss a slow-arriving asset" discipline as the
          // streaming-race fixes elsewhere in this file.
          if (A._stillRefineActive || FXS._autoStageOn) A._envMap = _hdriEnvMap;
          resolve(_hdriEnvMap);
        }, undefined, function(err) {
          _hdriLoading = false;
          console.warn('§LAYER2_HDRI_FAIL ' + (err && err.message ? err.message : err));
          resolve(null);
        });
      });
    }).catch(function(e) {
      _hdriLoading = false;
      console.warn('§LAYER2_HDRI_FAIL ' + e.message);
      return null;
    });
    return _hdriReadyPromise;
  }
  // §MIRROR_ROOM_PROBE (2026-08-16, user: "what does it take for mirrors to truly reflect... you
  // may try the single room-representative probe first"): glossy/metal materials only ever
  // reflected the static sky/HDRI env map (A._envMap) — no local reflection of the actual scene
  // existed anywhere (grepped: no CubeCamera/Reflector/WebGLCubeRenderTarget before this). One
  // CubeCamera capture at a representative interior point — same "35% up from the lowest point"
  // heuristic _cinemaPathPlan's own pivot already uses to land inside the building rather than at
  // its exact geometric bbox centre (often void/roof) — 6 renders, ONE-TIME per staging session
  // (this is a frozen still, not real-time navigation), used as envMap for the isGlossy set
  // (_reassertPhotoMatBoost) in place of the sky.
  //
  // A per-element "real mirror" boost (name-keyword vocabulary, e.g. Clinic's own
  // IfcFlowTerminal "M_Mirror:Mirror 600mm x 900mm" — IFC class is inconsistent, not a distinct
  // mirror class) was ATTEMPTED and DROPPED, not shipped: A._matCache (what this whole boost/
  // envmap system reads) only holds materials for INSTANCED/MERGED-tracked elements. Clinic's 22
  // mirror elements render via the BATCHED path instead (confirmed live — the user's own pasted
  // console log shows `§BATCHED_PICK batchId=2`), which shares ONE vertex-coloured material per
  // batch and never registers a `color|class|discipline` entry in _matCache at all — so a
  // per-element mirror boost has NOTHING to attach to for THIS class of element, regardless of how
  // the guid lookup is written. Fixing that needs a batched-mesh-aware boost path, a materially
  // bigger change than "try the room probe first" — named here, not built. Generic glossy/metal
  // materials (pipes, railings, ducts) are NOT affected by this gap in the common case: they're
  // typically large-count/merged/instanced and DO show up in A._matCache normally (verified live
  // on Terminal's real pipe classes — see §MIRROR_ROOM_PROBE_PIPE_CHECK below).
  // §MIRROR_ROOM_PROBE_REUSE (2026-08-16, real bug found+fixed via a headless bisection — dispose+
  // rebuild every Alt+S cycle leaked +1 texture/cycle, compounding: measured C1/C2/C3 exit deltas
  // 25,1,1. Isolating a bare `new WebGLCubeRenderTarget().dispose()` loop OUTSIDE the real staging
  // pipeline showed NO growth (stable), so the leak is specific to disposing the RT while it's
  // real staged materials' active envMap — most likely a material still holding the (about to be
  // disposed) texture reference across a stray render triggers three.js to silently re-upload a
  // fresh GL texture no code then tracks/disposes. Disabling just the build call made the leak
  // disappear entirely (confirms the RT lifecycle, not the material-boost logic, is the cause).
  // Fix: never dispose+rebuild on a normal Alt+S cycle — build ONCE, keep it alive, just re-render
  // its 6 faces on each staging press (same "created once, reused across sessions" discipline this
  // file already uses for A._camLight). Only disposed on a real building switch.
  var _roomProbeRT = null, _roomProbeCam = null, _roomProbeBuilding = null;
  function _buildRoomProbe() {
    // §GHOST_PROBE (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §GHOST_PROBE, user 2026-10-06: "still persist hovering above as a faint
    // but exact mirror reflection"): the probe is an INTERIOR heuristic (35 % up the building bbox). On a 2.1 km road it sat at y=-5.0,
    // inside the road's own height band (ROAD -7.6..20.6), capturing the model; 6 glossy materials (bridge deck slabs r=0.35, pipes
    // r=0.30) then mirrored that capture. A road has no room: civil models keep glossy surfaces on the sky env map. Buildings unchanged.
    if (A.isCivilModel && A.isCivilModel()) { if (_roomProbeRT) _disposeRoomProbe(); console.log('§MIRROR_ROOM_PROBE skipped (road model — no room; glossy materials reflect the sky)'); return; }
    var bbox = FXS._buildingBBoxIfc();
    if (!bbox || !A.ifc2three || !A.renderer || !A.scene) return;
    if (_roomProbeRT && _roomProbeBuilding !== A.activeBuilding) _disposeRoomProbe();
    var lo = A.ifc2three(bbox.xMin, bbox.yMin, bbox.zMin);
    var hi = A.ifc2three(bbox.xMax, bbox.yMax, bbox.zMax);
    var pos = {
      x: (lo.x + hi.x) / 2,
      y: Math.min(lo.y, hi.y) + Math.abs(hi.y - lo.y) * 0.35,
      z: (lo.z + hi.z) / 2
    };
    var envelope = Math.max(Math.abs(hi.x - lo.x), Math.abs(hi.z - lo.z), 50);
    var isNew = !_roomProbeRT;
    if (isNew) {
      _roomProbeRT = new THREE.WebGLCubeRenderTarget(128);
      _roomProbeCam = new THREE.CubeCamera(0.5, envelope * 3, _roomProbeRT);
      _roomProbeBuilding = A.activeBuilding;
    }
    _roomProbeCam.position.set(pos.x, pos.y, pos.z);
    _roomProbeCam.update(A.renderer, A.scene);
    console.log('§MIRROR_ROOM_PROBE ' + (isNew ? 'built' : 'reused') + ' pos=(' + pos.x.toFixed(1) +
      ',' + pos.y.toFixed(1) + ',' + pos.z.toFixed(1) + ') envelope=' + envelope.toFixed(1) + ' size=128');
  }
  function _disposeRoomProbe() {
    if (!_roomProbeRT) return;
    _roomProbeRT.dispose();
    _roomProbeRT = null;
    _roomProbeCam = null;
    _roomProbeBuilding = null;
  }
  // §STILL_GLOW camera inside/outside — the EXISTING room index first (RoomWalker.buildCameraRoomIndex, the same
  // point-in-room test dlod_nav.js uses for its room leg; IFC coords via the inverse of A.ifc2three). Rooms are
  // compiled lazily, so when there are none yet a NEW fallback is used and named in the log: a ray straight up
  // from the camera — building geometry within 80 m above = inside (under a roof or slab).
  var _camRoomIdx = null, _camRoomIdxBld = null;
  function _stillCamInside() {
    var c = A.camera && A.camera.position; if (!c) return { inside: null, src: 'no camera' };
    var _roomMiss = '';
    try {
      if ((_camRoomIdxBld !== A.activeBuilding || !_camRoomIdx) && window.RoomWalker && window.RoomWalker.buildCameraRoomIndex && A.db) {
        try { _camRoomIdx = window.RoomWalker.buildCameraRoomIndex(A.db); } catch (e) { _camRoomIdx = null; }
        _camRoomIdxBld = (_camRoomIdx && _camRoomIdx.rects) ? A.activeBuilding : null;   // never cache "no rooms yet"
      }
      var off = A.modelOffset;
      if (_camRoomIdx && _camRoomIdx.rects && off) {
        var room = _camRoomIdx.roomAt(c.x + off.x, -c.z + off.y, c.y + off.z);
        A._stillCamSrc = A._stillCamSrc || { rooms: 0, ray: 0 }; A._stillCamSrc.rooms++;
        // §STILL_CAMINSIDE_SPARSE (watcher, 2026-09-24): a room HIT proves inside; a MISS proves nothing — Hospital's
        // index holds 2 rects for the whole building, so a camera 6 m inside L1 read roomAt=none and the lamps went
        // off indoors. A miss now falls through to the up-ray: a point under the building's own slab is inside.
        if (room != null) return { inside: true, src: 'rooms roomAt=' + room + ' rects=' + _camRoomIdx.rects + ' uses=' + JSON.stringify(A._stillCamSrc) };
        _roomMiss = 'rooms roomAt=none rects=' + _camRoomIdx.rects + ' -> ';
      }
    } catch (e) {}
    var rc = new THREE.Raycaster(c.clone(), new THREE.Vector3(0, 1, 0), 0.05, 80), hit = null;
    try {
      var targets = []; A.scene.traverse(function(o) { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && !(o.userData && o.userData.excludeFromShadow) && o !== A.ground && o !== A._sky) targets.push(o); });
      var hits = rc.intersectObjects(targets, false); hit = hits.length ? hits[0] : null;
    } catch (e) { return { inside: null, src: 'up-ray failed: ' + e.message }; }
    A._stillCamSrc = A._stillCamSrc || { rooms: 0, ray: 0 }; A._stillCamSrc.ray++;
    return { inside: !!hit, src: _roomMiss + 'up-ray fallback (an overhang can fool it) hit=' + (hit ? hit.distance.toFixed(1) + 'm' : 'none') + ' uses=' + JSON.stringify(A._stillCamSrc) };
  }
  // ══ §ZERO Z12 GROUND HALF (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "### Z12 SPEC"; witness viewer/tests/witness_z12_ground_penumbra.js)
  // The hemi's ground half = the light the ground itself reflects: groundColor x hemiI = rho_g x (sun x sinE x f + E_sky) (L2).
  // rho_g = the ground AS SHOWN: the map's mean linear RGB (measured now, 32x32, sRGB-decoded) x the §GROUND_ALBEDO gain; table grey
  // fallback (earth 0.1599 / paved 0.155 — the measured means quoted in §GROUND_ALBEDO) when the image cannot be read. Stills only.
  var GROUND_TEX_MEAN_LUM = { earth: 0.1599, paved: GROUND_TEX_AVG_LUM };
  function _groundTexMeanRGB(map) {
    var img = map && map.image; if (!img || !(img.width > 0)) return null;
    var c = document.createElement('canvas'); c.width = 32; c.height = 32; var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 32, 32); var d = x.getImageData(0, 0, 32, 32).data, sum = [0, 0, 0], LL = window.LightLaw;
    var dec = LL && LL.srgbToLinear ? LL.srgbToLinear : function(v) { return v < 0.04045 ? 0.0773993808 * v : Math.pow(0.9478672986 * v + 0.0521327014, 2.4); };
    for (var i = 0; i < d.length; i += 4) { sum[0] += dec(d[i] / 255); sum[1] += dec(d[i + 1] / 255); sum[2] += dec(d[i + 2] / 255); }
    return sum.map(function(v) { return v / 1024; });
  }
};
