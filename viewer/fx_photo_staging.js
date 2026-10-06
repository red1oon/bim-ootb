// effects family — part `photo_staging` (original effects.js lines 4260–5166).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/effects.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as FXS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__effectsParts = (typeof window !== 'undefined' ? window : globalThis).__effectsParts || {};
(typeof window !== 'undefined' ? window : globalThis).__effectsParts.photo_staging = function* __split_effects_photo_staging(FXS, A, renderer, scene, camera) {
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  FXS._applyPhotoStaging = _applyPhotoStaging;
  FXS._stillShadowRendersReport = _stillShadowRendersReport;
  FXS._teardownPhotoStaging = _teardownPhotoStaging;
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order

  function _groundHalfLaw() {
    var LL = window.LightLaw;
    if (/[?&]groundlaw=0/.test(location.search) || A._stillGroundLaw === false || !LL || !LL.groundIrradiance || !A.hemi || !A.sun) {
      console.log('§GROUND_HALF off (' + (!LL || !LL.groundIrradiance ? 'LightLaw.groundIrradiance missing' : '&groundlaw=0') + ') groundColor=0x' + (A.hemi ? A.hemi.groundColor.getHexString() : '-')); return; }
    var key = A._groundTexKey, gain = A._groundAlbedoGain || 1, map = A.ground && A.ground.material && A.ground.material.map, rho = null, src = 'texture';
    if (key && key !== 'none') { var m = null; try { m = FXS._groundTexMeanRGB(map); } catch (eT) { m = null; }
      if (m) rho = m.map(function(v) { return v * gain; });
      else { var l = FXS.GROUND_TEX_MEAN_LUM[key] != null ? FXS.GROUND_TEX_MEAN_LUM[key] : FXS.GROUND_TEX_AVG_LUM; rho = [l * gain, l * gain, l * gain]; src = 'table(' + key + ')'; } }
    else if (A.ground && A.ground.material && A.ground.material.color) { var gc = A.ground.material.color; rho = [gc.r, gc.g, gc.b]; src = 'solid'; }
    if (!rho) { console.log('§GROUND_HALF VACUOUS no ground — hemi ground kept'); return; }
    var sp = A.sun.position, st = A.sun.target ? A.sun.target.position : { x: 0, y: 0, z: 0 };
    var dx = sp.x - st.x, dy = sp.y - st.y, dz = sp.z - st.z, dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, sinE = dy / dl;
    var sky = A.hemi.color, skyE = (0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b) * A.hemi.intensity;
    var f = LL.GROUND.sunlitFraction, Eg = LL.groundIrradiance(1, A.sun.intensity, sinE, skyE, f), gcol = LL.groundColor(rho, Eg, A.hemi.intensity);
    if (!gcol) { console.log('§GROUND_HALF VACUOUS hemi intensity 0 — hemi ground kept'); return; }
    var was = A.hemi.groundColor, wasUp = (0.2126 * was.r + 0.7152 * was.g + 0.0722 * was.b) * A.hemi.intensity;
    FXS._stillBaseSaved.ground = [was.r, was.g, was.b];
    var wasHex = was.getHexString();
    A.hemi.groundColor.setRGB(gcol[0], gcol[1], gcol[2]);
    var up = (0.2126 * rho[0] + 0.7152 * rho[1] + 0.0722 * rho[2]) * Eg;
    console.log('§GROUND_HALF rho=[' + rho.map(function(v) { return v.toFixed(3); }).join(',') + '] rhoSrc=' + src + ' gain=' + gain + ' sunI=' + A.sun.intensity.toFixed(3) +
      ' sinE=' + sinE.toFixed(4) + ' skyE=' + skyE.toFixed(3) + ' f=' + f + ' Eg=' + Eg.toFixed(3) + ' upward=' + up.toFixed(3) + 'u (' + Math.round(up * (A._stillCalibSunLux || 100000) / (A._stillCalibSunI || 4.4)) + ' lx)' +
      ' groundColor=[' + gcol.map(function(v) { return v.toFixed(3); }).join(',') + '] was=0x' + wasHex + ' (upward ' + wasUp.toFixed(3) + 'u) ratio=' + (wasUp > 0 ? (up / wasUp).toFixed(2) : 'inf'));
  }
  function _applyPhotoStaging() {
    // §STILL_STAGE_MS (watchdog red1-c6, 2026-09-25: a Terminal press took ~120 s vs ~13 s, cause not guessed) — where the
    // staging time goes, one line per press; the first frame after staging (program link) is timed by a one-shot render wrap.
    var _stT0 = performance.now(), _stMs = { zoneBuild: 0, skySweep: 0, audit: 0, zoneCap: 0, portals: 0, sourcedStage: 0, shadowFit: 0 };
    // §GROUND_WETNESS_REFIRE_FIX (2026-07-17, live user repro: worked once, then "cannot
    // replicate" on another building, back on the original — still couldn't, "but bit slightly"):
    // this MUST run on every Alt+S press, including a refire — unlike the fog/sun/night-glow
    // staging below, it's cheap, idempotent, and building-independent-safe. It used to sit AFTER
    // the _photoStagingOn early-return, which only fires once per true staging cycle; once staging
    // gets kept alive across a soft-park/building-switch (the guard below's own "Stage-2 refire"
    // case), EVERY later Alt+S — on ANY building — hit that early return and this line never ran
    // again for the rest of the session. Moved above the guard so it's independent of refire state.
    if (!FXS._groundWetnessUserSet) A._setGroundWetness(FXS.GROUND_WETNESS_STAGE_DEFAULT, false);
    // §PHOTO_DOUBLE_APPLY_GUARD (2026-07-16, found live during the ghosting-fix verification):
    // a Stage-2 auto-refire calls startStillRefine → here while the soft-park KEPT staging alive —
    // the re-apply then saved the ALREADY-STAGED values (dusk fog/sun/night-glow) as the "original"
    // baseline (log fingerprint: `§PHOTO_STAGING on nightWasOn=true`), so the eventual full
    // teardown "restored" the scene to dusk instead of daytime — staging leaked permanently after
    // exit. Staging is applied once per photo-mode CYCLE; a refire only restarts the TAA polish.
    if (FXS._photoStagingOn) { console.log('§PHOTO_STAGING already on — skip re-apply (Stage-2 refire)'); return; }
    FXS._photoStagingOn = true;
    A._photoStagingOn = true;
    // §FILM_PARITY (2026-09-24, red1: "the Alt+S to Alt+C ad verbatim is the objective") — a film stages the approved Alt+S
    // look. Off switch for the control clip: &filmparity=0 / APP._filmParityOff (cli --film-parity 0). Fill: see below
    // (restore is the default; cli --film-fill alts / &filmfill=alts for ambient 0).
    A._filmParity = !!A._maxqActive && !(A._filmParityOff === true || /[?&]filmparity=0/.test(location.search));
    // Film fill default = RESTORE (watchdog for red1, 2026-09-25): in current films the interior lamps are off for most interior
    // shots (§116 window) while an Alt+S interior has them on; ambient 0 gives the gloomy film interiors red1 rejected
    // ("restored is better"). Parity matches the LOOK, not the ambient number. &filmfill=alts / APP._filmFillRestore=false = ambient 0.
    // §FILM_LAW S2 (bim-compiler ALTC_SHOWSTOPPERS.md §FILM_LAW; stopper S-LAW-3; §LIGHT_ONE_SCALE L1, R3) — SUPERSEDES the restore
    // default above: the restored 0.785 ambient is a sourceless light (audit #24 = 0). A parity film now takes the §STILL_BASE
    // result exactly as Alt+S (ambient x &base 0, hemi x &sky 2); a dark interior is answered by the §FILM_EXPOSURE meter (S1),
    // not by added light. Back-compat opt-in only: &filmfill=restore / APP._filmFillRestore = true / cli --film-fill restore.
    A._filmFillRestore = A._filmFillRestore === true || /[?&]filmfill=restore/.test(location.search);
    _filmExposureReset(false);   // §FILM_LAW S1 — each film staging meters its own first frame
    if (A._maxqActive) console.log('§FILM_PARITY ' + (A._filmParity ? 'on' : 'off (control)') + ' fill=' + (!A._filmParity ? 'restore 0.785/1.257 (control)' : A._filmFillRestore ? 'restore 0.785/1.257 (opt-in, NOT the law)' : 'alt-s (ambient 0, §FILM_LAW S2)'));
    // §DLOD_STILL_OWNERSHIP (2026-09-24, red1: sun shafts through the Terminal roof on Alt+S) — dlod.js
    // zero-scales instances outside the view frustum, and a zero-scaled roof casts no shadow. Pause it
    // for the whole staging cycle, same ownership rule as §DLOD_TM_OWNERSHIP: only re-enable in
    // teardown if THIS paused it (a user's own DLOD-off, or TM's pause during a bake, is not ours).
    FXS._dlodPausedByStill = false;
    A._dlodStillHold = true; A._dlodStillWanted = false;
    if (typeof A.dlodDisable === 'function' && A._dlodEnabled) { A.dlodDisable('photo-still'); FXS._dlodPausedByStill = true; }
    console.log('§DLOD_STILL_OWNERSHIP paused=' + (FXS._dlodPausedByStill ? 1 : 0) + ' dlodEnabledNow=' + (A._dlodEnabled ? 1 : 0) +
      ' tmOn=' + (A._tmOn ? 1 : 0));
    // §STILL_GHOST_OWNERSHIP (2026-09-24): Alt+S owns the display mode the way it owns DLOD — a shown ghost/x-ray shell
    // (navigate_find's merged ghost: boxes instead of the solid model) is switched off for the still and back on at teardown.
    FXS._ghostSuspendedByStill = false;
    try { if (typeof window.ghostXrayOn === 'function' && window.ghostXrayOn() && typeof window.toggleGhostXray === 'function') { window.toggleGhostXray(); FXS._ghostSuspendedByStill = true; } } catch (eG) {}
    console.log('§STILL_GHOST_OWNERSHIP suspended=' + (FXS._ghostSuspendedByStill ? 1 : 0) + ' ghostOnNow=' + (typeof window.ghostXrayOn === 'function' && window.ghostXrayOn() ? 1 : 0));
    // §PHOTO_VARIATION: roll (or keep locked) the shared seed before anything below reads it.
    var _pinSeed = /[?&]photoseed=([0-9.]+)/.exec(location.search);   // ### ALTS-ALL FIX 17: witness-only pin (same variation every press)
    if (_pinSeed) { A._photoPaintSeed = parseFloat(_pinSeed[1]); FXS._photoVariationLocked = true; }
    else if (!FXS._photoVariationLocked || A._photoPaintSeed == null) A._photoPaintSeed = Math.random();
    FXS._wireGroundPuddleShader();
    var _pbbox = FXS._buildingBBoxIfc();
    if (_pbbox) FXS._buildGroundPuddles((_pbbox.xMin + _pbbox.xMax) / 2, (_pbbox.yMin + _pbbox.yMax) / 2);
    console.log('§PHOTO_PAINT_SEED seed=' + A._photoPaintSeed.toFixed(4) + ' locked=' + FXS._photoVariationLocked + (_pinSeed ? ' pinned=url' : '') +
      ' puddles=' + FXS._puddleCenters.length);
    FXS._photoGroundWasVisible = !!(A.ground && A.ground.visible);
    FXS._photoGroundPrevKey = A._groundTexKey || null;
    FXS._photoGroundPrevColor = A._groundSolidColor;
    if (A.ground && A._applyGroundTexture && A._calcGroundY) {
      A.ground.visible = true;
      A._calcGroundY();
      // §PHOTO_GROUND_LIT (user ask, "It is almost black"): was 'earth' + a dark 0x6a5238 tint —
      // too dark once the evening exposure/ambient cuts also apply on top of it. Switched to
      // 'paved' (same real asset Shadow mode already uses — concrete look, per user's own
      // suggestion) with a much brighter warm tint.
      // §GROUND_EARTH_DEFAULT (2026-08-16, user: "more realistic even surface feel" — 'paved'
      // carries concrete_floor_01's rectangular slab-joint relief, which is what the §GROUND_DETAIL
      // normal map (#1388) was amplifying through lighting; 'earth' has no such hard rectangular
      // structure). Back to 'earth' for the movie/still bake default — the ORIGINAL "too dark"
      // complaint this section's own §GROUND_ALBEDO gain already fixed (earth's measured mean
      // 0.1599 vs paved's 0.155 GROUND_TEX_AVG_LUM below — near-identical, so the same gain still
      // lands at the same real-dry-ground target albedo, no recalibration needed).
      // §GROUND_ALBEDO (2026-07-28, user: "the Alt+S evening ground is too dark… albedo, try it") —
      // Witness: W-GROUND-ALBEDO. Set BEFORE _applyGroundTexture, because that function calls
      // _setGroundColor itself (with the remembered solid colour) as soon as the texture lands.
      // 2.3 x the map's measured 0.155 average puts the ground at ~0.36 albedo — real dry concrete
      // (0.25-0.40), not the asphalt (0.05-0.12) it renders as today. Live-tunable from the console
      // for the A/B the user asked for: APP._photoGroundAlbedoGain = 1.0 (default look) / 2.3 / 3.5,
      // then Alt+S again. See tools.js §GROUND_ALBEDO for why a gain and not more fill light.
      A._groundAlbedoGain = A._photoGroundAlbedoGain;
      // §ALTC_V3_GRASS (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_V3, user 2026-10-06: "a ground map that has vegetation"):
      // a road runs through countryside — civil models take the shipped CC0 'grass' map (Poly Haven aerial_grass_rock, ground_config.json)
      // under a neutral tint so its green reads; buildings keep 'earth' + the warm concrete tone.
      var _civGround = !!(A.isCivilModel && A.isCivilModel());
      A._applyGroundTexture(_civGround ? 'grass' : 'earth');
      if (A._setGroundColor) A._setGroundColor(_civGround ? 0xe6ead8 : 0xd9c39a);  // civil: neutral (green shows) · building: warm sunlit-concrete
      if (_civGround) console.log('§ALTC_V3_GRASS ground=grass tint=0xe6ead8 (road film)');
      console.log('§GROUND_ALBEDO gain=' + A._groundAlbedoGain.toFixed(2) + ' texAvgLum=' +
        FXS.GROUND_TEX_AVG_LUM.toFixed(3) + ' effAlbedo=' + (FXS.GROUND_TEX_AVG_LUM * A._groundAlbedoGain).toFixed(3) +
        ' color=' + (A.ground.material.color ? A.ground.material.color.r.toFixed(2) : 'n/a') +
        ' map=' + (A.ground.material.map ? 'paved' : 'none'));
      // §PHOTO_GROUND_WHITE_REVERTED (user reported "Shadows? None on the ground" right after
      // this shipped): a flat emissive add is NOT shadow-map-occluded at all in three.js — it
      // washes out relative contrast between the sun's shadowed and lit ground patches, which is
      // likely exactly what killed shadow visibility. Reverted; ground brightness now comes ONLY
      // from real texture + hemi/ambient (both of which DO preserve shadow contrast, since they
      // light shadowed/unshadowed ground unequally) + fog haze at distance (see PHOTO_FOG below).
    }
    // §PHOTO_FOG (user ask: "ground goes dark in distance too much.. can be bright and foggy in
    // the distance"): the scene's default fog (scene.js) is a dark blue-purple (0x1a1a2e) — at
    // Hospital's scale that DARKENS the distant ground further, the opposite of what's wanted.
    // Override with a warm hazy tone matching the dusk horizon for the photoshoot only. Save the
    // ORIGINAL color/density here (before any of this function's changes) so teardown restores the
    // true pre-photoshoot state — the actual override is applied AFTER A.updateSky() below, see
    // §PHOTO_FOG_ORDER_FIX.
    if (A.scene && A.scene.fog) {
      FXS._photoFogColorSaved = A.scene.fog.color.getHex();
      FXS._photoFogDensitySaved = A.scene.fog.density;
    }
    // §LAYER2_HDRI: save whatever envMap was active (the procedural sky-derived one), swap to the
    // real HDRI if already loaded, or kick off the (one-time, cached) load if not yet ready —
    // _ensureHdriEnvMap applies it itself once resolved, per the mid-photoshoot check inside it.
    FXS._photoEnvMapSaved = A._envMap;
    // §ALT_FRAME_LUMINANCE: HDRI is now the authoritative envMap for the whole staged session —
    // tell scene.js's updateSky() (called on the next line, and again every subsequent Alt+S/
    // Alt+C frame while staging stays on) not to silently overwrite it with a procedural PMREM
    // regen from its own 2s-throttled setTimeout — see that guard for the full race explanation.
    A._envMapHdriActive = true;
    if (FXS._hdriEnvMap) A._envMap = FXS._hdriEnvMap; else FXS._ensureHdriEnvMap();
    FXS._photoSkyWasVisible = !!(A._sky && A._sky.visible);
    if (A.sun) {
      FXS._photoSunPosSaved = A.sun.position.clone();
      FXS._photoSunTargetSaved = A.sun.target.position.clone();
    }
    // §PHOTO_SUN_SEPARATION (2026-08-15, user: "Sun should be a separation of concern" — the sun's
    // position/colour/intensity is no longer FORCED by staging by default. Alt+S used to always
    // hard-reset the sun to a fixed 6°-elevation dusk (PHOTO_SUN_ELEVATION/PHOTO_SUN_AZIMUTH,
    // still used by the Alt+C movie sun-arc — untouched, see §SUN_ARC above) on every press,
    // regardless of whatever real time-of-day/sun position was already active — the
    // saved/restored _photoSunPosSaved/_photoSunTargetSaved below is proof a real prior position
    // always existed, it was just being thrown away. NEW DEFAULT: leave A.sun exactly where it
    // already is (plain daylight look). User asked to keep the OLD dusk-mood look reachable for
    // A/B comparison, not deleted — set `APP._photoDuskMood = true` before pressing Alt+S to get
    // the old forced-dusk sun + reddish sky drama + amber night-glow package back; leave it
    // false/unset (the default) for plain daylight. Toggle, re-press Alt+S, compare.
    var _duskMood = !!A._photoDuskMood || /[?&]dusk=1/.test(location.search);   // §STILL_DUSK_URL (red1 2026-10-01): &dusk=1 = the same dusk package from a link
    // §PHOTO_SUN_SEPARATION_FIX (2026-08-16): a direct A.sun.position->sunPosition uniform sync
    // was attempted here to fix a sky/shadow mismatch, but shipped WITHOUT live verification and
    // caused a real regression (sky rendered fully black in production) — REVERTED. The mismatch
    // this was trying to fix is still real and still open; the fix needs to be re-derived and
    // actually tested live before shipping again, not guessed at under time pressure. Do not
    // re-add a raw position->uniform copy without checking what Sky.js's sunPosition uniform
    // actually expects (scene.js's own updateSky() builds it via
    // setFromSphericalCoords(1,...), not by normalizing A.sun.position — those may not be
    // equivalent depending on whether A.sun.position carries any offset beyond a pure direction).
    if (A._sky) { A._sky.visible = true; }
    if (_duskMood && A.updateSky) { A.updateSky(FXS.PHOTO_SUN_ELEVATION, FXS.PHOTO_SUN_AZIMUTH); }
    // §PHOTO_SKY_DRAMA (user ask: "more dramatic sky... reddish clouds in the distance"): Preetham
    // (Sky.js) is a clear-sky atmospheric-scattering model — push turbidity/rayleigh/mie further
    // for the photoshoot only. Dusk-mood only — see §PHOTO_SUN_SEPARATION above.
    if (_duskMood && A._sky) {
      var _su = A._sky.material.uniforms;
      FXS._photoSkyUniSaved = {
        turbidity: _su['turbidity'].value, rayleigh: _su['rayleigh'].value,
        mieCoefficient: _su['mieCoefficient'].value, mieDirectionalG: _su['mieDirectionalG'].value
      };
      _su['turbidity'].value = 8;
      _su['rayleigh'].value = 3.2;
      _su['mieCoefficient'].value = 0.012;
      _su['mieDirectionalG'].value = 0.9;
    }
    // §PHOTO_SUN_REFLECTION fix 2: keep the lensflare's own brightness independent of the
    // photoshoot's exposure cut (see comment above PHOTO_SUN_ELEVATION).
    if (A._lensflare) {
      FXS._photoFlarePrevTone = A._lensflare.material.toneMapped;
      A._lensflare.material.toneMapped = false;
      A._lensflare.material.needsUpdate = true;
      if (A._lensflare.userData._halo) {
        FXS._photoHaloPrevTone = A._lensflare.userData._halo.material.toneMapped;
        A._lensflare.userData._halo.material.toneMapped = false;
        A._lensflare.userData._halo.material.needsUpdate = true;
      }
    }
    // §PHOTO_SUN_REFLECTION fix 3: boost existing per-material envMapIntensity — stronger
    // glass/metal glint, same free PBR mechanism, no new shader work. Re-asserted every
    // accumulation frame (see _reassertPhotoMatBoost) so streamed-in materials aren't missed.
    FXS._photoEnvBoostedMats = [];
    FXS._photoMatBoostActive = true;
    FXS._reassertPhotoMatBoost();
    FXS._mirrorOwnApply();   // §MIRROR_OWN_MAT
    FXS._enablePhotoShadows();  // real/current sun position (unless _duskMood) — see §PHOTO_SUN_SEPARATION
    FXS._stillCascadeLightsAdd();   // §STILL_SHADOW_CASCADE C2: before the first staged compile (boxes are fitted at the end of staging)
    // §PHOTO_SUN_SEPARATION_FIX (2026-08-16, user: beam/railing went dark/no-sheen after the
    // separation shipped — "we switched something else off?"). Root cause: toggleNightMode()
    // isn't only a colour toggle, it also loads ~200 supplementary point lights (fixture glow) —
    // real illumination that specular-lit beam/railing (envInt:0, so they get ZERO reflection
    // contribution by design — see the earlier §HOSPITAL_BLUE_TINT fix — and were leaning on these
    // point lights for their visible sheen). Dropping the whole toggle call to kill the WARM TINT
    // also silently killed that illumination. Fix: split the two concerns apart. The point-light
    // toggle + intensity/exposure restore run UNCONDITIONALLY (real illumination, not mood) — only
    // the COLOUR override (the actual warm-dusk tint) stays dusk-mood-only.
    FXS._photoNightWasOn = !!A._nightMode;
    FXS._photoDuskMoodApplied = _duskMood;  // teardown reads this snapshot, not the live flag
    // §STAGED_PL_CUT — set BEFORE toggleNightMode builds the ~200 fixture point lights, so they
    // are born at the cut intensity (the §NIGHT_STILL_LIGHTS boost branch alone was proven to not
    // fire on this path — witness 2026-08-16). Reset unconditionally in _removePhotoStaging.
    A._nightPLScale = A._nightPLScaleStill || 1;
    A._nightPLScaleStaged = A._nightPLScale;   // §SUN_ARC_FILL — the staged base the bake scales FROM
    // §STILL_DIALS — Alt+S lamp strength + fall-off, read at every press, set BEFORE the lamps are born below.
    if (!A._maxqActive || A._filmParity) {
      A._stillLampDecayNow = FXS._stillDial('_stillLampDecay', 'lampdecay', 1.5, 2);   // §FLOOR_WASH pick: 1.5 (was 0.8)
      // §SOURCED_LIGHT_CALIB (red1 2026-09-25 via red1-4b: "it is simply very bright indoors" -> indoor sources in the SAME
      // units as the sun). Real ratio: a lamp's floor illuminance under one fixture vs the sun on a surface facing it —
      // office lighting 500 lx (EN 12464-1 office value; Wikipedia "Lux" table 320-500 lx) vs direct sunlight 100,000 lx
      // (Wikipedia "Lux", after Schlyter, upper bound = clear sky) = 0.005. The day sun here is A.sun.intensity (normal
      // incidence); one fixture at CALIB_H m directly above a floor point gives base * mul / CALIB_H^decay (no angle term,
      // straight down). Solve mul so that equals 0.005 * sun. Replaces the §FLOOR_WASH lamps=16 for Alt+S when §SOURCED_LIGHT
      // is on; &lamps= / APP._stillLamps still override (red1's live dial). &sourced=0 keeps 16 (today's look).
      var CALIB_LAMP_LUX = window.LightLaw.CALIB.lampLux, CALIB_SUN_LUX = window.LightLaw.CALIB.sunLux, CALIB_H = window.LightLaw.CALIB.refH;   // §LIGHT_LAW_MODULE
      var _calibSunI = (A._nightMode && A._nightSaved) ? A._nightSaved.sunI * FXS.PHOTO_SUN_INTENSITY_SCALE : (A.sun ? A.sun.intensity * FXS.PHOTO_SUN_INTENSITY_SCALE : 0);
      // PAUSED (watchdog red1-4b, 2026-09-25: step 1 first — zone binding + no sourceless sky may be all the washout is):
      // calibration, the camera-fill cut, physical portals and the §METER run only with &calib=1 / APP._stillCalib=true.
      // RESUMED (watchdog, 2026-09-25: Clinic's washout is its own lamps, 99.8% at 3.4x sunlit ground): on by default, &calib=0 off.
      A._stillCalibOn = A._stillCalib !== false && !/[?&]calib=0/.test(location.search);
      A._stillCalibSunI = _calibSunI; A._stillCalibSunLux = CALIB_SUN_LUX;   // §LUX_CHECK: the scene sun = CALIB_SUN_LUX lx
      var _calibOn = A._stillCalibOn && !!(window.SourcedLight && window.SourcedLight.installed && window.SourcedLight.installed()) && _calibSunI > 0;
      if (!A._stillCalibOn) A._stillMeter = false; else if (A._stillMeter === false) A._stillMeter = undefined;
      var _calibMul = _calibOn ? (CALIB_LAMP_LUX / CALIB_SUN_LUX) * _calibSunI * Math.pow(CALIB_H, A._stillLampDecayNow) / (A.NIGHT_LIGHT_INTENSITY_BASE || 2) : 16;
      A._stillLampMul = FXS._stillDial('_stillLamps', 'lamps', _calibMul, 20);   // §FLOOR_WASH was 16 (red1 13:4x "internal points of light should hit stronger")
      console.log('§SOURCED_LIGHT_CALIB ' + (_calibOn ? 'on' : 'off (§SOURCED_LIGHT not installed or no sun)') + ' lampLux=' + CALIB_LAMP_LUX + ' sunLux=' + CALIB_SUN_LUX +
        ' ratio=' + (CALIB_LAMP_LUX / CALIB_SUN_LUX) + ' sunI=' + _calibSunI.toFixed(3) + ' refH=' + CALIB_H + 'm decay=' + A._stillLampDecayNow + ' base=' + (A.NIGHT_LIGHT_INTENSITY_BASE || 2) +
        ' lampMul old 16 -> new ' + _calibMul.toFixed(4) + ' (fixture intensity ' + ((A.NIGHT_LIGHT_INTENSITY_BASE || 2) * _calibMul).toFixed(4) + ', floor E at ' + CALIB_H + ' m = ' +
        ((A.NIGHT_LIGHT_INTENSITY_BASE || 2) * _calibMul / Math.pow(CALIB_H, A._stillLampDecayNow)).toFixed(4) + ' vs sun ' + _calibSunI.toFixed(3) + ') applied=' + A._stillLampMul.toFixed(4) +
        (A._stillLampMul !== _calibMul ? ' (&lamps= override)' : ''));
      A._stillLampRangeNow = FXS._stillDial('_stillLampRange', 'lamprange', 25, 100);   // §FLOOR_WASH pick: 25 m reach (0 = infinite, the old stack)
      // §LIGHT_UNIFORM_BUDGET — caps the lamps BEFORE toggleNightMode builds them; portals then fit in the rest. One light
      // count for the whole still = one shader compile.
      if (window.SkyPortal) { try { window.SkyPortal.budget(A); } catch (eB) { console.warn('§LIGHT_UNIFORM_BUDGET failed: ' + eB.message); } }   // red1: throw further (nav keeps NIGHT_LIGHT_DECAY)
      if (!A._maxqActive && window.SourcedLight) { var _stZ0 = window.LightZones && window.LightZones.get(), _stP = performance.now(); try { window.SourcedLight.prepare(A); } catch (eSLP) { console.warn('§SOURCED_LIGHT_CAP failed: ' + eSLP.message); }
        var _stZ1 = window.LightZones && window.LightZones.get(), _stPms = performance.now() - _stP;
        if (_stZ1 && _stZ1 !== _stZ0 && _stZ1.stats) { _stMs.zoneBuild = (_stZ1.stats.ms || 0) + ((_stZ1.stats.glare && _stZ1.stats.glare.ms) || 0); _stMs.skySweep = _stZ1.stats.skyMs || 0; _stMs.audit = (_stZ1.stats.glare && _stZ1.stats.glare.ms) || 0; }
        _stMs.zoneCap = Math.max(0, _stPms - _stMs.zoneBuild); }   // zones + camera/visible zones before the lamps are born
      // §LAMP_UNCAPPED — decided before the lamps are born (toggleNightMode below, startStillRefine's update): every placed
      // fixture as DATA (sourced_light.js), no point lights, no cap. Needs this building's zones (prepare just built/restored them).
      A._lampDataOn = !!(window.SourcedLight && window.SourcedLight.lampWanted && window.SourcedLight.lampWanted(A));
      console.log('§LAMP_UNCAPPED decide dataPath=' + (A._lampDataOn ? 1 : 0) + (A._lampDataOn ? '' : ' (capped pool: &lampdata=0 / film / no zones / sourced off)'));
      // §LAMP_SHAPE_COLOUR — round fixtures soft amber, rectangular white (red1). &lampshape=0 switches it off.
      A._stillShapeColour = FXS._stillDial('_stillLampShape', 'lampshape', 1, 1) > 0;
      if (A._stillShapeColour && typeof A._nightFixtureWorldPositions === 'function' && A.nightFixtureShape) {
        var _shN = { round: 0, rect: 0, ambiguous: 0, nomesh: 0, exit: 0 };
        A._nightFixtureWorldPositions().forEach(function(p) { if (p.__exit) _shN.exit++; else _shN[A.nightFixtureShape(p)]++; });
        var _bld = (/[?&]db=[^&]*\/([^\/&]+?)(_extracted)?\.db/.exec(location.search) || [])[1] || '?';
        console.log('§LAMP_SHAPE_COLOUR bld=' + _bld + ' round=' + _shN.round + ' rect=' + _shN.rect + ' ambiguous=' + _shN.ambiguous +
          ' noMesh=' + _shN.nomesh + ' exit=' + _shN.exit + ' (round -> NIGHT_WARM 0xffdca8, rect -> 0xffffff, rest keep the mix colour)');
      }
    }
    if (!FXS._photoNightWasOn && A.toggleNightMode) {
      A.toggleNightMode();  // amber fixture glow (synthetic fallback) + window glow — real light sources
      if (A._nightSaved) {  // always undo the moonlight override (dark intensities) — never mood
        A.sun.intensity = A._nightSaved.sunI * FXS.PHOTO_SUN_INTENSITY_SCALE;
        A.ambient.intensity = A._nightSaved.ambI * FXS.PHOTO_AMBIENT_INTENSITY_SCALE;
        A.hemi.intensity = A._nightSaved.hemiI * FXS.PHOTO_HEMI_INTENSITY_SCALE;
        A.renderer.toneMappingExposure = A._nightSaved.exposure * FXS.PHOTO_EXPOSURE_SCALE * FXS.PHOTO_EXPOSURE_LIFT;
        // Colour is the actual mood — warm dusk tint only with the flag on; real pre-toggle
        // colours (not PHOTO_*_COLOR) otherwise, so plain-daylight stays plain-daylight-coloured.
        if (_duskMood) {
          A.sun.color.setHex(FXS.PHOTO_SUN_COLOR);
          A.ambient.color.setHex(FXS.PHOTO_AMBIENT_COLOR);
          A.hemi.color.setHex(FXS.PHOTO_HEMI_SKY_COLOR);
        } else {
          A.sun.color.setHex(A._nightSaved.sunColor);
          A.ambient.color.setHex(A._nightSaved.ambColor);
          A.hemi.color.setHex(A._nightSaved.hemiSky);
        }
        var _fill = A.ambient.intensity + A.hemi.intensity;
        console.log('§MOVIE_SHADOW_TM sun=' + A.sun.intensity.toFixed(3) +
          ' ambient=' + A.ambient.intensity.toFixed(3) + ' hemi=' + A.hemi.intensity.toFixed(3) +
          ' fill=' + _fill.toFixed(3) + ' sunFillRatio=' + (_fill ? (A.sun.intensity / _fill).toFixed(3) : 'inf') +
          ' (TM native ratio 2.155 — equal means the bake matches TM shadow strength)');
      }
    }
    // §SUN_ARC_FILL — snapshot the staged fill ONCE, here, after the block above has landed it (or,
    // with night mode already on, whatever the fill is at this point): the bake's per-frame
    // compensation multiplies THIS base every frame, so it can never compound frame over frame.
    // Cleared in _removePhotoStaging with the rest of the staging state.
    // §STILL_GLOW (2026-09-24, red1 ruling: "window glow OFF in daylight Alt+S stills") — the glazing emissive
    // (night mode's 0xfff8ec x 0.55) is not dimmed by shadow, so it hid the wing shadows on the Hospital courtyard
    // facades. Daylight = the app's own dusk test: dusk mood off AND sun above PHOTO_SUN_ELEVATION (the dusk
    // elevation). Alt+S only: a film (A._maxqActive) passes through dusk on its sun arc and keeps its glow.
    // Glazing only; fixture point lights and their emissive are untouched. Teardown restores the glow values.
    if ((!A._maxqActive || A._filmParity) && A._nightGlowMats && A.sun) {
      var _gs = A.sun.position.clone(); if (A.sun.target) _gs.sub(A.sun.target.position); _gs.normalize();
      var _gElev = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, _gs.y))));
      var _gDay = !_duskMood && _gElev > FXS.PHOTO_SUN_ELEVATION;
      var _gN = 0, _gLampMats = 0;
      // red1 (refined): indoor lights are on by day. Lamps go OFF only for a daylight still whose camera is
      // OUTSIDE; inside, they stay on. Window glow is off in daylight either way.
      var _gIn = _gDay ? FXS._stillCamInside() : { inside: null, src: 'not-needed (dusk)' };
      if (_gIn.inside != null) A._stillCamInsideNow = _gIn.inside;   // §METER's fallback inside test when the camera is in no light zone
      A._stillCamInsideNow = _gIn.inside;   // §STILL_SHADOW_FIT reads it (props only when outside)
      if (_gDay) {
        A._stillWindowGlowOff = true;
        if (A._civilGlowSync) A._civilGlowSync('still');   // §GLOW_DAY
        // §STILL_LAMPS_OUTSIDE (red1 2026-09-24: seen through the glass, interiors look drab — "no light source falls
        // thru and internal are not playing their role"). &lampsout=1 keeps the lamps on for an outside daylight still
        // so interiors seen through windows are lit. Default 1 since red1 picked it 2026-09-26 ("good to have them on and bright
        // so outside view can be impressive"; lamps keep their calibrated intensity, no boost). &lampsout=0 = the old ruling.
        var _lampsOut = FXS._stillDial('_stillLampsOut', 'lampsout', 1, 1) > 0;
        A._stillLampsOff = (_gIn.inside === false) && !_lampsOut;
        A._nightGlowMats.forEach(function(g) {
          if (!g.mat) return;
          if (g.win) { g.mat.emissiveIntensity = 0; if (!A._maxqActive) g.mat.needsUpdate = true; _gN++; }
          else if (A._stillLampsOff) { g.mat.emissiveIntensity = 0; if (!A._maxqActive) g.mat.needsUpdate = true; _gLampMats++; }   // the lamp's own glowing fixture
        });
      }
      console.log('§STILL_GLOW daylight=' + (_gDay ? 1 : 0) + ' sunElev=' + _gElev.toFixed(1) + ' duskMood=' + (_duskMood ? 1 : 0) +
        ' threshold=' + FXS.PHOTO_SUN_ELEVATION + ' camInside=' + (_gIn.inside == null ? '-' : (_gIn.inside ? 1 : 0)) + ' (' + _gIn.src + ')' +
        ' glowMats=' + _gN + ' emissive->' + (_gDay ? '0' : 'kept') +
        ' lamps=' + (A._stillLampsOff ? '0 (fixture emissive ' + _gLampMats + ' mats -> 0)' : (FXS._stillLampList().length + ' on' + (A._lampDataOn ? ' (lamp data)' : ''))) +
        (_gDay && _gIn.inside === false ? ' lampsout=' + (_lampsOut ? 1 : 0) : ''));
    }
    // §STILL_BASE (2026-09-24, red1: switch the EVEN base light off and let the real sources carry the picture —
    // sun + shadows, lamps indoors, bounce, sky reflections — then tune by eye). Alt+S stills only (films keep the
    // restored fill; nav unchanged). §STILL_DIALS (red1 13:1x: "too dark ... not enough sky ambient light"): split
    // into two dials, read at every press — &sky= scales the hemi (sky from above; default 2.0 x #1601's Alt+S hemi, red1)
    // and &base= scales the flat ambient only (default 0, red1). Console overrides APP._stillSky / APP._stillBaseScale.
    // Teardown restores.
    if ((!A._maxqActive || A._filmParity) && A.ambient && A.hemi) {
      var _bs = FXS._stillDial('_stillBaseScale', 'base', 0, 2);   // red1 13:3x LOOK ruling: base as low as possible, 0
      var _sk = FXS._stillDial('_stillSky', 'sky', 2.0, 3);   // red1 13:4x: "hit it now", sky 2.0, range 0..3
      FXS._stillBaseSaved = { ambI: A.ambient.intensity, hemiI: A.hemi.intensity };
      A.ambient.intensity = FXS._stillBaseSaved.ambI * _bs; A.hemi.intensity = FXS._stillBaseSaved.hemiI * _sk;
      var _lampSum = 0, _lampOn = 0;
      var _sll = FXS._stillLampList(); _sll.forEach(function(l) { _lampSum += l.intensity; if (l.intensity > 0) _lampOn++; });
      console.log('§STILL_BASE sky=' + _sk + ' base=' + _bs + ' lamps=' + A._stillLampMul + ' decay=' + A._stillLampDecayNow +
        ' range=' + (A._stillLampRangeNow ? A._stillLampRangeNow + 'm' : '0(inf)') + ' hemi=' + A.hemi.intensity.toFixed(3) + ' ambient=' + A.ambient.intensity.toFixed(3) +
        ' (from ' + FXS._stillBaseSaved.hemiI.toFixed(3) + '/' + FXS._stillBaseSaved.ambI.toFixed(3) + ') camInside=' +
        (typeof _gIn !== 'undefined' && _gIn && _gIn.inside != null ? (_gIn.inside ? 1 : 0) : '-') +
        ' lampsOn=' + (A._stillLampsOff ? '0 (daylight, outside)' : _lampOn + '/' + _sll.length) + (A._lampDataOn ? ' (lamp data)' : '') +
        ' lampSum=' + _lampSum.toFixed(3) + ' (at staging; §STILL_DIALS_LAMPS logs the refined set)');
      if (!A._maxqActive) { try { _groundHalfLaw(); } catch (eGH) { console.warn('§GROUND_HALF failed: ' + eGH.message + ' — hemi ground kept'); } }   // §ZERO Z12
    }
    if (A._concreteStrength) { var _r3 = (A._triplanarMaterials || []).filter(function(m) { return m && m.userData && m.userData.triRow === 'R3'; }).length;
      console.log('§CONCRETE_TONE strength=' + A._concreteStrength() + ' contrast=' + (1.1 * A._concreteStrength()).toFixed(3) + ' (R3 was 1.1)' +
        ' normalScale=' + A._concreteStrength() + ' tile=' + A._concreteTile() + 'm (was 2.5) r3Mats=' + _r3); }
    // §SKY_PORTAL — window panes as sky light sources (sky_portal.js), after the sky dial so it reads the staged hemi.
    // §ALBEDO_SRGB (watcher/red1 wash investigation, 2026-09-24). FACT from source: THREE.ColorManagement.enabled=false
    // (loader.js) and streaming.js builds colours with new THREE.Color(r,g,b) from the AUTHORED (sRGB) values, while
    // renderer.outputColorSpace = SRGBColorSpace encodes the output: every albedo is used as if it were linear, i.e.
    // brighter than authored (0.92 -> used 0.92 where 0.83 is right; a mid 0.5 used where 0.21 is right). Alt+S arms,
    // restored at teardown (a colour is a uniform: no recompile): &srgbfix=1 converts each lit material's colour
    // sRGB->linear; &albedocap=<v> then scales any colour whose max channel exceeds v (a PBR guard); &stillexp=<m>
    // multiplies the still's tone-mapping exposure. Defaults: all off (red1/watcher pick from the sheet).
    if (!A._maxqActive) {
      FXS._albedoSaved = [];
      // §ZERO Z9 (PHOTOREAL_STILL_RENDER.md "### Z9 SPEC"; witness viewer/tests/witness_z9_albedo_srgb.js): default ON from the law
      // (LightLaw.ALBEDO.decode). The 2026-09-24 "darkened the exterior refs" objection predates §METER_EV: the eye meter runs inside
      // SourcedLight.stage AFTER this block and meters the real (decoded) materials, so the law re-exposes. Off: &srgbfix=0 / APP._stillSrgbFix=false.
      var _lawDec = !!(window.LightLaw && window.LightLaw.ALBEDO && window.LightLaw.ALBEDO.decode && window.LightLaw.decodeAlbedo);
      var _fix = (typeof A._stillSrgbFix === 'boolean') ? A._stillSrgbFix : (/[?&]srgbfix=0/.test(location.search) ? false : (/[?&]srgbfix=1/.test(location.search) || _lawDec));
      var _nSkipG = 0, _nSkipGain = 0, _lumB = 0, _lumA = 0, _groundMat = A.ground && A.ground.material;
      var _capM = /[?&]albedocap=([0-9.]+)/.exec(location.search), _cap = (typeof A._stillAlbedoCap === 'number') ? A._stillAlbedoCap : (_capM ? parseFloat(_capM[1]) : null);
      var _nConv = 0, _nCap = 0, _wallBefore = null, _wallAfter = null;
      FXS._albedoDecSet = (_fix && _lawDec) ? new Set() : null; FXS._albedoLateN = 0;
      if (_fix || _cap != null) {
        var _seen = new Set();
        A.scene.traverse(function(o) {
          if (!o.material || !(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return;
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m) {
            if (!m || _seen.has(m) || !m.color || !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return;
            _seen.add(m); if (_fix && _lawDec) FXS._albedoDecSet.add(m); var _sv = [m, m.color.getHex(), m.color.r, m.color.g, m.color.b], _chg = false;   // Z9: saved only if changed (the ground/gains are never touched, so never "restored")
            var isWall = !_wallBefore && o.userData && o.userData.ifcClass === 'IfcWallStandardCase';
            if (isWall) _wallBefore = m.color.r.toFixed(3) + ',' + m.color.g.toFixed(3) + ',' + m.color.b.toFixed(3);
            if (_fix) {
              var _lb = 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b;
              var _dec = _lawDec ? window.LightLaw.decodeAlbedo(m.color, { isGround: m === _groundMat }) : (m.color.convertSRGBToLinear(), true);
              if (_dec) { _chg = true; _nConv++; _lumB += _lb; _lumA += 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b; }
              else if (m === _groundMat) _nSkipG++; else _nSkipGain++;
            }
            if (_cap != null) { var mx = Math.max(m.color.r, m.color.g, m.color.b); if (mx > _cap) { m.color.multiplyScalar(_cap / mx); _nCap++; _chg = true; } }
            if (_chg) { _sv[5] = m.color.getHex(); FXS._albedoSaved.push(_sv); }   // [5] = the staged colour, to detect a foreign change at restore
            if (isWall) _wallAfter = m.color.r.toFixed(3) + ',' + m.color.g.toFixed(3) + ',' + m.color.b.toFixed(3);
          });
        });
      }
      var _em = /[?&]stillexp=([0-9.]+)/.exec(location.search), _eMul = (typeof A._stillExpMul === 'number') ? A._stillExpMul : (_em ? parseFloat(_em[1]) : 1);
      FXS._expSaved = A.renderer.toneMappingExposure; if (_eMul !== 1) A.renderer.toneMappingExposure = FXS._expSaved * _eMul;
      console.log('§ALBEDO_SRGB srgbfix=' + (_fix ? 1 : 0) + ' decode=' + (_lawDec ? 'law' : 'three') + ' converted=' + _nConv + ' skippedGround=' + _nSkipG +
        ' skippedGain=' + _nSkipGain + ' meanLumBefore=' + (_nConv ? (_lumB / _nConv).toFixed(4) : 'n/a') + ' meanLumAfter=' + (_nConv ? (_lumA / _nConv).toFixed(4) : 'n/a') + ' albedoCap=' + (_cap == null ? 'off' : _cap) + ' capped=' + _nCap +
        ' wallColour(IfcWallStandardCase) before=' + _wallBefore + ' after=' + _wallAfter + ' exposure=' + A.renderer.toneMappingExposure.toFixed(3) +
        ' (x' + _eMul + ') lampRange=' + (A._stillLampRangeNow == null ? '0(inf)' : A._stillLampRangeNow) + ' lampDecay=' + A._stillLampDecayNow);
    }
    if (!A._maxqActive && window.SkyOcc) { try { window.SkyOcc.stage(A); } catch (eSO) { console.warn('§SKY_OCCLUSION failed: ' + eSO.message); } }   // §SKY_OCCLUSION
    var _stS = performance.now();
    if ((!A._maxqActive || A._filmParity) && window.SkyPortal) { try { window.SkyPortal.stage(A); } catch (eSP) { console.warn('§SKY_PORTAL failed: ' + eSP.message); } }
    _stMs.portals = performance.now() - _stS; _stS = performance.now();   // after the lamps; budget set before them
    // ### ALTS-ALL FIX 14 (F11): zero-length vertex normals -> NaN fragments (normalize(0)) that the §GLASS_ENV capture spreads over every
    // glass pixel. Repaired at staging (O(triangles) on affected meshes only; a clean scene = one scan). &normrepair=0 = off.
    if (!A._maxqActive && A._repairDegenerateNormals && !/[?&]normrepair=0/.test(location.search)) { try { A._repairDegenerateNormals(); } catch (eNR) { console.warn('§NORMAL_REPAIR failed: ' + eNR.message); } }
    else if (!A._maxqActive && /[?&]normrepair=0/.test(location.search)) console.log('§NORMAL_REPAIR off (&normrepair=0)');
    if ((!A._maxqActive || A._filmParity) && window.GlassFresnel) { try { window.GlassFresnel.stage(A); } catch (eGF) { console.warn('§GLASS_FRESNEL failed: ' + eGF.message); } }   // §GLASS_FRESNEL
    if (!A._maxqActive) { try { _camTorchStage(false); } catch (eT) { console.warn('§CAM_TORCH failed: ' + eT.message); } }   // §ALTS_ALL: torch in the scene before the stage meter
    // §FILM_INHERIT (bim-compiler prompts/ALTC_FOUNDATION.md "§FILM_INHERIT"; ALTC_SHOWSTOPPERS S2): parity films stage the SAME
    // SourcedLight as Alt+S (zone grid, sky-view field, ground field — restored from the baked sidecar). Per frame the film only
    // gates it (A._filmParityStep -> SourcedLight.filmGate): on while the whole building stands, off during build-up / storey cuts.
    if ((!A._maxqActive || A._filmParity) && window.SourcedLight) { try { window.SourcedLight.stage(A); } catch (eSL) { console.warn('§SOURCED_LIGHT failed: ' + eSL.message); } }
    _stMs.sourcedStage = performance.now() - _stS;   // §SOURCED_LIGHT — after lamps + portals
    // §FILM_FILL_RESTORE (2026-09-24, red1 on the HHS + Hospital interior A/B pairs: "restored is better")
    // — films only. PR #1601 halved the fill in scene.js (ambient 0.785->0.386, hemi 1.257->0.617) for the
    // nav/still wall-side contrast; in the bake that doubled the shadow contrast (sunFillRatio 4.387 vs
    // Time Machine's 2.155) and made interiors gloomy. While a film records (A._maxqActive), stage the
    // pre-#1601 fill; Alt+S stills and navigation keep #1601's values. Set HERE, before the snapshot
    // below, so the per-frame §SUN_ARC_FILL_PIN holds it on every frame. Restored in teardown.
    if (A._maxqActive && (!A._filmParity || A._filmFillRestore) && A.ambient && A.hemi) {
      if (!FXS._filmFillSaved) FXS._filmFillSaved = { ambI: A.ambient.intensity, hemiI: A.hemi.intensity };
      A.ambient.intensity = FXS.FILM_FILL_AMBIENT; A.hemi.intensity = FXS.FILM_FILL_HEMI;
      console.log('§FILM_FILL_RESTORE ambient ' + FXS._filmFillSaved.ambI + '->' + FXS.FILM_FILL_AMBIENT +
        ' hemi ' + FXS._filmFillSaved.hemiI + '->' + FXS.FILM_FILL_HEMI + ' sunFillRatio=' +
        (A.sun ? (A.sun.intensity / (FXS.FILM_FILL_AMBIENT + FXS.FILM_FILL_HEMI)).toFixed(3) : '?') + ' (films only)');
    }
    A._photoFillBase = { ambI: A.ambient.intensity, hemiI: A.hemi.intensity };
    console.log('§SUN_ARC_FILL_BASE ambient=' + A._photoFillBase.ambI.toFixed(4) +
      ' hemi=' + A._photoFillBase.hemiI.toFixed(4) + ' plScaleStaged=' + A._nightPLScaleStaged +
      ' nightWasOn=' + FXS._photoNightWasOn);
    // §PHOTO_FOG_ORDER_FIX (2026-07-16, RESUME BRIEF ADDENDUM item 2 — "sky/ground darkness, one
    // root cause?"): confirmed YES, one root cause, and it's a real bug, not just physical dusk
    // dimness. TWO things clobber the warm §PHOTO_FOG color if it's applied any earlier in this
    // function: (1) A.updateSky() (scene.js) sets scene.fog.color itself from a dim elevation-
    // derived blend ("dayT" — at PHOTO_SUN_ELEVATION's low dusk angle, dayT≈0.3, giving a dim
    // blue-grey); (2) A.toggleNightMode() (tools.js §S277c), called just above for its amber-glow
    // mechanism, ALSO sets fog to a near-black moonlight blue as its own side effect — the same
    // side effect this block already undoes for sun/ambient/hemi/exposure ("undo the moonlight
    // override, land on a deliberate warm evening tint") just never included fog. Both run BEFORE
    // this point, so applying the warm override HERE (after both) is the one place it actually
    // sticks — confirmed the fog the user saw was neither dim-blend nor moonlight-blue-corrected,
    // it was whichever of the two ran last. Since fog is the one shared medium touching both the
    // sky's tone and any distant ground pixel, this single clobber explains BOTH "sky too dark"
    // and "ground reflecting off that also" as ONE bug, not two.
    if (A.scene && A.scene.fog) {
      A.scene.fog.color.setHex(0xc9a878);
      A.scene.fog.density = Math.min(A.scene.fog.density, 0.00006);  // lighter haze, not a wall of fog
    }
    // §GROUND_COLOR_ORDER_FIX (2026-07-28, found by W-GROUND-ALBEDO, not by reading) — the SAME
    // clobber §PHOTO_FOG_ORDER_FIX above documents, on the SAME call, missed for the ground.
    // A.toggleNightMode() (line ~2694, called for its amber-glow mechanism) also does
    // _setGroundColor(0x0a0a15) (tools.js §S277c) as a side effect. The photo ground colour is set
    // ~78 lines EARLIER, so night's moonlight dim always won: 0x0a0a15's channel sum is 41, under
    // the 0x60 night-dim threshold, so the ground rendered at 0x555566 = 0.333 instead of the
    // intended photo-true 1.0. **The evening ground has been rendering at ONE THIRD of the
    // brightness this file thought it set, since §PHOTO_GROUND_LIT shipped — the 0xd9c39a "bright
    // warm sunlit-concrete tone" never reached the material at all.**
    // MEASURED, same run: §GROUND_ALBEDO logged color=2.30 at staging, and the material read 0.333
    // nine seconds later. Re-asserted HERE, after both clobbering calls, exactly like the fog.
    if (A.ground && A._setGroundColor) {
      A._setGroundColor(0xd9c39a);
      console.log('§GROUND_COLOR_ORDER_FIX reasserted color=' + A.ground.material.color.r.toFixed(2) +
        ' gain=' + A._groundAlbedoGain.toFixed(2));
    }
    // §CAM_LIGHT: created once, reused across staging sessions (cheap: one PointLight, no geometry).
    if (!A._camLight) {
      A._camLight = new THREE.PointLight(FXS.CAM_LIGHT_COLOR, FXS.CAM_LIGHT_INTENSITY, FXS.CAM_LIGHT_DISTANCE, FXS.CAM_LIGHT_DECAY);
      // A shadow-casting light riding the camera would need its shadow map rebuilt every frame —
      // exactly the per-frame cost this feature must not add (see §CAM_LIGHT note above).
      A._camLight.castShadow = false;
    }
    A.scene.add(A._camLight);
    // §SOURCED_LIGHT principle 1 (only real sources): the eye-riding fill is not a source. Off for Alt+S when §SOURCED_LIGHT
    // is installed (Clinic corridor, 2026-09-25: at 2 m it gave ~0.75 of the 0.73 metered incident light, the lamps ~0.02).
    var _camSourcedOff = !A._maxqActive && !!A._stillCalibOn && !!(window.SourcedLight && window.SourcedLight.installed && window.SourcedLight.installed());
    // §FILM_LAW S3 (bim-compiler ALTC_SHOWSTOPPERS.md §FILM_LAW; stopper S-LAW-6, D4; §LIGHT_ONE_SCALE L1a — the cove is the only
    // added source): a parity film turns the eye-riding fill off as Alt+S does, on the film's own calibration switch (&calib=0 keeps it).
    // §FILM_CAM_LIGHT (red1 2026-10-01: "that cam light was obviously not showing during going thru wall, it used to show its
    // reflection clearly"): bim-ootb 118dd73f (2026-09-27, §FILM_LAW S3) switched the eye light off in parity films; the 450 lm torch
    // that replaced it is ~23 cd/m2 on a wall 2 m away = ~1% of mid-grey at a daylight exposure (invisible). Films keep the eye light
    // again: 3 units ~ 68,000 cd at the film's calibration (sun 4.4 = 100 klux), 4 m reach -> ~2,700 cd/m2 at 2 m. &filmcamlight=0 = off.
    var _camFilmOff = !!A._maxqActive && !!A._filmParity && !!A._stillCalibOn && /[?&]filmcamlight=0/.test(location.search);
    A._camLight.intensity = (_camSourcedOff || _camFilmOff) ? 0 : FXS.CAM_LIGHT_INTENSITY;
    console.log('§CAM_LIGHT ' + (_camSourcedOff ? 'off (§SOURCED_LIGHT: not a real source)' : _camFilmOff ? 'off (film, L1a: not a real source)' : 'on') + ' intensity=' + A._camLight.intensity + ' distance=' + FXS.CAM_LIGHT_DISTANCE +
      ' decay=' + FXS.CAM_LIGHT_DECAY + ' forwardOffset=' + FXS.CAM_LIGHT_FORWARD_OFFSET);
    // §CAM_TORCH — Alt+S, and (§FILM_LAW Z17 film part, L1b) parity films under the SAME gate as S3 (_camFilmOff): the film gets
    // the Alt+S torch instead of a plain CAM_LIGHT off. Created once, added once per staging (constant light count => no program
    // recompiles across frames); cinema_maxq.js moves it per frame via A._updateCamTorch. Control clip unchanged. &torch=0 = off.
    var _torchFilm = !!A._maxqActive && _camFilmOff;
    if (_torchFilm) _camTorchStage(true);   // stills staged it before SourcedLight.stage (see _camTorchStage)
    FXS._showPhotoProps(true);
    // §MIRROR_ROOM_PROBE: built LAST, after ground/lights/props are all in their staged state, so
    // the capture reflects the real staged look. The FIRST _reassertPhotoMatBoost() call above (at
    // the top of this function) already ran before this exists — those materials fall back to the
    // sky env map for one tick, then upgrade to this probe on the next accumulation frame via
    // _reassertPhotoEnvMap (which runs every tick regardless of the once-only boost flag).
    // §MEP_SMOOTH_NORMALS — curved MEP reads faceted because the shipped normals are hard
    // per-face on every class (§SHADE_PROBE: splitNormal 96-100%). Class-gated + crease-limited,
    // rewriting normal VALUES in place only, so nothing downstream that reads the vertex layout is
    // disturbed. Runs ONCE per staging, not per frame — idempotent, so a re-stage costs a no-op
    // pass rather than a second smoothing.
    if (!A._mepSmoothDone && A.mepSmoothNormals) { A.mepSmoothNormals(); A._mepSmoothDone = true; }
    FXS._buildRoomProbe();
    _stS = performance.now();
    if (!A._maxqActive) { if (FXS._fitOn()) FXS._stillFitApply(false); else if (FXS._fitState) console.log('§STILL_SHADOW_FIT off (&shadowfit=0, APP._stillShadowFit=false, or the user\'s own Shadow mode) env=' + FXS._fitState.env); }
    _stMs.shadowFit = performance.now() - _stS;
    console.log('§PHOTO_STAGING on nightWasOn=' + FXS._photoNightWasOn);
    try { var _stTot = performance.now() - _stT0; A._stillStageMsLast = _stTot; var _stR = A.renderer, _stProg0 = (_stR && _stR.info && _stR.info.programs) ? _stR.info.programs.length : -1, _stRender = _stR && _stR.render;
      var _stLine = '§STILL_STAGE_MS zoneBuild=' + Math.round(_stMs.zoneBuild) + ' skySweep=' + Math.round(_stMs.skySweep) + ' audit=' + Math.round(_stMs.audit) + ' zoneCap=' + Math.round(_stMs.zoneCap) +
        ' portals=' + Math.round(_stMs.portals) + ' sourcedStage=' + Math.round(_stMs.sourcedStage) + ' shadowFit=' + Math.round(_stMs.shadowFit) + ' other=' + Math.round(_stTot - _stMs.zoneBuild - _stMs.zoneCap - _stMs.portals - _stMs.sourcedStage - _stMs.shadowFit) + ' (staging steps not named above) stagingTotal=' + Math.round(_stTot);
      if (_stRender && !_stR.__stageMsWrap) { _stR.__stageMsWrap = true;   // link = the first render after staging (programs compile + link synchronously inside it)
        _stR.render = function() { _stR.render = _stRender; _stR.__stageMsWrap = false; var t = performance.now(); var ret = _stRender.apply(this, arguments); var n1 = (_stR.info && _stR.info.programs) ? _stR.info.programs.length : -1;
          console.log(_stLine + ' link=' + Math.round(performance.now() - t) + ' (first frame, newPrograms=' + (n1 - _stProg0) + ') total=' + Math.round(_stTot + performance.now() - t)); return ret; }; }
      else console.log(_stLine + ' link=? total=' + Math.round(_stTot)); } catch (eSt) { console.warn('§STILL_STAGE_MS failed: ' + eSt.message); }
    // §STILL_POSE (2026-09-24, watcher: red1's stills carry no pose) — one line per staging with everything
    // needed to reproduce the frame headless: camera, target, fov, sun, DB, window size.
    // §STILL_POSE_HOST (watchdog red1-c6, 2026-09-26: red1's PNGs did not say which tree/port they came from): the served
    // sw.js CACHE_VERSION, read once per page (async; S5 2026-09-26: it lands after the first press's pose is built, so it patches that pose — the PNG is
    // written at save time and reads the patched object; only the §STILL_POSE console line of the first press can still say null)
    if (A._swVersion === undefined) { A._swVersion = null; try { fetch('sw.js', { cache: 'no-store' }).then(function(r) { return r.text(); }).then(function(t) { var m = /CACHE_VERSION = '([^']+)'/.exec(t); A._swVersion = m ? m[1] : null; if (A._stillPoseLast && !A._stillPoseLast.sw) A._stillPoseLast.sw = A._swVersion; }).catch(function() {}); } catch (eSw) {} }
    try {
      var _c = A.camera, _t = A.controls ? A.controls.target : null, _s = A.sun;
      var _f = function(v) { return v ? [v.x, v.y, v.z].map(function(n) { return +n.toFixed(3); }) : null; };
      A._stillPoseLast = { cam: _f(_c && _c.position), tgt: _f(_t), fov: _c && _c.fov,
        aspect: _c && +_c.aspect.toFixed(4), sun: _f(_s && _s.position), sunTgt: _f(_s && _s.target && _s.target.position),
        sunI: _s && +_s.intensity.toFixed(3), db: (location.search.match(/db=([^&]+)/) || [])[1] || null,
        w: window.innerWidth, h: window.innerHeight, film: !!A._maxqActive, url: location.search,
        host: location.host, sw: A._swVersion || null };   // §STILL_POSE_PNG writes it into the saved PNG; §STILL_POSE_HOST: host + sw name the tree
      console.log('§STILL_POSE ' + JSON.stringify(A._stillPoseLast));
    } catch (eP) { console.warn('§STILL_POSE failed: ' + eP.message); }
    _stillShadowRendersArm();
  }
  // §STILL_SHADOW_RENDERS — how many times the sun/portal shadow maps are really re-rendered during one still. three's
  // WebGLShadowMap.render returns at once unless autoUpdate or needsUpdate is set; only those entries are counted.
  var _shRenders = 0, _shCounting = false;
  function _stillShadowRendersArm() {
    var sm = A.renderer && A.renderer.shadowMap; if (!sm) return;
    if (!sm._stillCountWrapped) {
      var orig = sm.render;
      sm.render = function() {
        if (this.enabled && (this.autoUpdate || this.needsUpdate)) {
          if (_shCounting) _shRenders++;
          // §STILL_SHADOW_CASCADE: a used cascade re-renders exactly when the sun's map does (the §PHOTO_SHADOW caster chunks
          // switch castShadow on after staging and re-arm needsUpdate), never on its own
          for (var i = 0; i < FXS._csmLights.length; i++) if (FXS._csmLights[i].userData.csmUsed && FXS._csmLights[i].parent) FXS._csmLights[i].shadow.needsUpdate = true;
        }
        return orig.apply(this, arguments); };
      sm._stillCountWrapped = true;
    }
    _shRenders = 0; _shCounting = !A._maxqActive;
  }
  function _stillShadowRendersReport(ms) {
    if (!_shCounting) return;
    console.log('§STILL_SHADOW_RENDERS n=' + _shRenders + ' refineMs=' + ms + ' autoUpdate=' + (A.renderer.shadowMap.autoUpdate ? 1 : 0));
    _shCounting = false;
  }
  // §FILM_PARITY per-frame step — called by cinema_maxq.js every frame after _sunArcStep (this frame's sun) and before
  // the fill pin. Staging is kept for the whole film (§MAXQ_STAGE_KEEP), so what Alt+S decides once per press is
  // re-decided here per frame, with uniforms only (no recompile, no light-count change):
  //   §STILL_GLOW — daylight test on the moving sun; window glow off by day; lamps off only when the camera is outside
  //   (the _stillLampsOff flag, which tools.js multiplies in, so the fill pin cannot write it back).
  var _fpLast = null;
  A._filmParityStep = function(frameIdx, tnFilm, sampler) {
    if (!A._filmParity || !A._maxqActive) return null;
    A._filmTnNow = tnFilm;
    if (sampler && FXS._fitState && !FXS._fitState.shots && !FXS._fitState.precomputeTried) { FXS._fitState.precomputeTried = true; A._filmFitPrecompute(sampler); sampler.restore(); if (A._sunArcStep) A._sunArcStep(tnFilm); }   // this frame's sun back
    var t0 = performance.now(), out = { f: frameIdx };
    if (A._nightGlowMats && A.sun) {
      var gs = A.sun.position.clone(); if (A.sun.target) gs.sub(A.sun.target.position); gs.normalize();
      var el = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, gs.y))));
      var day = !FXS._photoDuskMoodApplied && el > FXS.PHOTO_SUN_ELEVATION;
      var inside = FXS._stillCamInside().inside; A._stillCamInsideNow = inside;
      var lampsOut = FXS._stillDial('_stillLampsOut', 'lampsout', 1, 1) > 0;   // §STILL_LAMPS_OUTSIDE default 1 (red1 2026-09-26), same as the still
      var lampsOff = day && inside === false && !lampsOut;
      A._stillWindowGlowOff = day; A._stillLampsOff = lampsOff;
      if (A._civilGlowSync) A._civilGlowSync('film');   // §GLOW_DAY
      A._nightGlowMats.forEach(function(g) {
        if (!g.mat) return;
        var want = g.win ? (day ? 0 : g.glowEI) : (lampsOff ? 0 : g.glowEI);
        if (g.mat.emissiveIntensity !== want) g.mat.emissiveIntensity = want;   // a uniform: no needsUpdate
      });
      out.elev = +el.toFixed(1); out.day = day ? 1 : 0; out.inside = inside == null ? '-' : (inside ? 1 : 0); out.lampsOff = lampsOff ? 1 : 0;
    }
    if (typeof A._filmParityShadowFit === 'function') out.fit = A._filmParityShadowFit();
    // §FILM_INHERIT gate: the zone grid + field describe the FINISHED building (ALTC_SHOWSTOPPERS S3), so they are on only while
    // the film shows the whole building (A._filmGeomWhole, cinema_maxq.js); then the portals park, exactly as Alt+S retires them
    // under the field. Off (build-up, storey cut) = the film's previous model (portals, no field). Uniforms only: no recompile.
    var _slOk = !!(window.SourcedLight && window.SourcedLight.isActive && window.SourcedLight.isActive() && window.SourcedLight.filmGate);
    A._filmFieldOn = _slOk && A._filmGeomWhole !== false && !(A._filmInheritOff === true || /[?&]filminherit=0/.test(location.search));
    if (_slOk) out.sl = window.SourcedLight.filmGate(A._filmFieldOn, frameIdx);
    // §FILM_GATE_EXPOSURE_SNAP (2026-10-01, Hospital full bake f=2352, the "flash" at 2:36.8): the gate switches the lighting model in one
    // frame (shader reads it as on/off), the meter target moved 16.45 -> 15.64 EV and the 4-EV/s ease took 3 frames — the picture dipped to
    // luma 87.8 and overshot to 110. On the switch frame only, exposure goes straight to its target (the first-frame rule), so brightness stays
    // continuous across the model change. Logged; &gatesnap=0 = the eased behaviour (control).
    if (_slOk && out.sl !== A._filmGateLastSl) { if (A._filmGateLastSl != null && !/[?&]gatesnap=0/.test(location.search)) A._filmExpSnapAt = frameIdx; A._filmGateLastSl = out.sl; }
    if (window.SkyPortal && typeof window.SkyPortal.frame === 'function') { try { out.portal = window.SkyPortal.frame(A); } catch (eP) { out.portal = 'err ' + eP.message; } }
    // §FILM_GLASS_ENV (bim-compiler prompts/ALTC_FOUNDATION.md "§FILM_INHERIT" item 4): the still's room capture (GlassFresnel.capture:
    // 6-face cube at the camera + §MIRROR_PARALLAX box) once per SHOT while the new lighting is on — on the first such frame and at every
    // shot change (_fitState.shotNow, set by the fit above). Mirrors get their own finish after the first capture (§MIRROR_OWN_MAT).
    // &filmglassenv=0 = off (panes keep the sky HDRI, mirrors stay plain).
    if (A._filmFieldOn && window.GlassFresnel && window.GlassFresnel.capture && !/[?&]filmglassenv=0/.test(location.search)) {
      var _envShot = (FXS._fitState && FXS._fitState.shotNow) ? FXS._fitState.shotNow.i : -1;
      if (A._filmEnvShot !== _envShot) {
        A._filmEnvShot = _envShot; var _eT = performance.now();
        try { window.GlassFresnel.capture(A); A._filmEnvCaptures = (A._filmEnvCaptures || 0) + 1;
          if (!A._filmMirrorOn) { A._filmMirrorOn = true; FXS._mirrorOwnApply(true); }
          console.log('§FILM_GLASS_ENV f=' + frameIdx + ' shot=' + _envShot + ' capture#' + A._filmEnvCaptures + ' ms=' + Math.round(performance.now() - _eT) + ' (once per shot while the new lighting is on)'); }
        catch (eGE) { console.warn('§FILM_GLASS_ENV failed: ' + (eGE && eGE.message)); }
      }
    }
    out.ms = +(performance.now() - t0).toFixed(1);
    var key = JSON.stringify([out.day, out.inside, out.lampsOff]);
    if (key !== _fpLast || frameIdx % 24 === 0) { _fpLast = key;
      console.log('§FILM_PARITY_FRAME f=' + frameIdx + ' sunElev=' + out.elev + ' daylight=' + out.day + ' camInside=' + out.inside + ' lampsOff=' + out.lampsOff +
        (out.fit ? ' fit=' + out.fit : '') + (out.portal ? ' portal=' + out.portal : '') + ' sourced=' + (out.sl || 'not-staged') +
        // §FILM_LAMP_DATA witness: lamps in the data path vs pool slots lit on the PREVIOUS frame (the pool updates after this step);
        // on a whole-building frame poolLitPrev must be 0 once the data path has taken over (no lamp counted twice).
        ' lampData=' + (A._filmFieldOn ? (A._filmLampDataN || 0) : 'off') + ' poolLitPrev=' + (A._nightBakePool ? A._nightBakePool.filter(function (l) { return l.intensity > 0; }).length : '-') + ' ms=' + out.ms); }
    return out;
  };
  // ══ §FILM_EXPOSURE — §FILM_LAW S1 (bim-compiler prompts/ALTC_SHOWSTOPPERS.md §FILM_LAW; ALT+C R1; §LIGHT_ONE_SCALE L3 via
  // §METER_EV). Implementing §FILM_LAW S1 — Witness: viewer/tests/witness_film_exposure_unit.js (node) + the §FILM_LAW GPU witness.
  // A film meters every frame with the SAME chain as the still (SourcedLight.meterRead 160x90 -> cd/m2 via luxPer -> EV100) and
  // eases toward it at the engine adaptation speeds (LightLaw.ADAPT, frame clock dt = 1/fps, first frame = its target). Parity
  // films only; &filmexp=0 / APP._filmExpOff = the fixed staging exposure (control). Exposure only — nothing drawn changes.
  var _fe = null;   // { ev, base, n } — per film staging
  A._filmExposureStep = function(frameIdx, fps) {
    if (!A._filmParity || !A._maxqActive || !A.renderer) return null;
    var LL = window.LightLaw, SL = window.SourcedLight, R = A.renderer;
    if (A._filmExpOff === true || /[?&]filmexp=0/.test(location.search)) {
      if (!_fe) { _fe = { ev: null, base: null, n: 0, off: true }; console.log('§FILM_EXPOSURE off (control: &filmexp=0) exposure=' + R.toneMappingExposure.toFixed(4) + ' fixed'); }
      return null;
    }
    if (!_fe || _fe.off) _fe = { ev: null, base: R.toneMappingExposure, n: 0 };
    var t0 = performance.now(), lp = LL && LL.luxPer(A._stillCalibSunLux, A._stillCalibSunI);
    if (!lp || !SL || !SL.meterRead || !LL.adaptEv) {
      console.log('§FILM_EXPOSURE VACUOUS f=' + frameIdx + ' reason=' + (!lp ? 'no lux calibration (calibSunI=' + A._stillCalibSunI + ')' : 'no meter/LightLaw.adaptEv') +
        ' exposure=' + R.toneMappingExposure.toFixed(4) + ' held');
      return null;
    }
    var mode = (/[?&]metermode=(avg|centre|zone|hist)/.exec(location.search) || [])[1] || A._stillMeterMode || 'hist';   // same rule as the still's meter()
    // §SPEED_AB S-B (ALTC_FOUNDATION.md §SPEED_AB): &metereach=N meters every Nth frame (and on a gate snap); between, the last reading is
    // reused and exposure keeps easing toward it. Default N=1 = every frame (unchanged).
    var _mEach = +((/[?&]metereach=(\d+)/.exec(location.search) || [])[1] || 1), _metered = 1;
    var m;
    if (_mEach > 1 && _fe.mLast && frameIdx % _mEach !== 0 && A._filmExpSnapAt !== frameIdx) { m = _fe.mLast; _metered = 0; }
    else { m = SL.meterRead(A, { mode: mode, quiet: true, camZone: 0 }); if (m && m.L > 0) _fe.mLast = m; }
    if (!(m && m.L > 0)) {
      console.log('§FILM_EXPOSURE VACUOUS f=' + frameIdx + ' reason=no luminance read (pixels=' + (m ? m.pixels : '-') + ') exposure=' + R.toneMappingExposure.toFixed(4) + ' held');
      return null;
    }
    var _snap = (A._filmExpSnapAt === frameIdx);
    var Lcd = m.L * lp, tEv = LL.ev100(Lcd), dt = 1 / (fps > 0 ? fps : 15), a = LL.adaptEv(_snap ? null : _fe.ev, tEv, dt);
    if (_snap) console.log('§FILM_GATE_EXPOSURE_SNAP f=' + frameIdx + ' evWas=' + (_fe.ev != null ? _fe.ev.toFixed(3) : '-') + ' -> target ' + tEv.toFixed(3) + ' (lighting model switched this frame: exposure jumps with it, no ease)');
    var exp = LL.exposureFromEv(a.ev, lp, LL.acesDiv(R, THREE));
    _fe.ev = a.ev; _fe.n++; R.toneMappingExposure = exp;
    A._meterLast = { exposure: exp, stops: Math.log2(exp / _fe.base), ev100: a.ev, Lcd: Lcd, targetEv100: tEv, film: true };
    console.log('§FILM_EXPOSURE f=' + frameIdx + ' metered=' + _metered + ' targetEV=' + tEv.toFixed(3) + ' EV=' + a.ev.toFixed(3) + ' exposure=' + exp.toFixed(5) + ' Lcd=' + Lcd.toFixed(1) +
      ' first=' + (a.first ? 1 : 0) + ' capped=' + (a.capped || '-') + ' dt=' + dt.toFixed(4) + ' mode=' + m.mode + ' skyPx=' + m.skyPx +
      ' cam=[' + (A.camera ? [A.camera.position.x, A.camera.position.y, A.camera.position.z].map(function(v) { return v.toFixed(3); }).join(',') : '-') + ']' +
      ' tgt=[' + (A.controls && A.controls.target ? [A.controls.target.x, A.controls.target.y, A.controls.target.z].map(function(v) { return v.toFixed(3); }).join(',') : '-') + ']' +
      ' sunI=' + (A.sun ? A.sun.intensity.toFixed(3) : '-') + ' ambient=' + (A.ambient ? A.ambient.intensity.toFixed(3) : '-') + ' hemi=' + (A.hemi ? A.hemi.intensity.toFixed(3) : '-') +
      ' camLight=' + (A._camLight ? A._camLight.intensity : '-') + ' torch=' + (A._camTorch && A._camTorch.parent ? A._camTorch.intensity.toExponential(6) : 'off') + ' programs=' + (R.info && R.info.programs ? R.info.programs.length : '-') + ' ms=' + (performance.now() - t0).toFixed(1));
    if (a.first || frameIdx % 24 === 0) { try { LL.log(A, a.first ? 'film-first' : 'film'); } catch (eLL) { console.warn('§LIGHT_LAW log failed: ' + eLL.message); } }
    return { f: frameIdx, targetEv: tEv, ev: a.ev, exposure: exp, first: a.first, capped: a.capped };
  };
  function _filmExposureReset(restore) {
    if (_fe && restore && _fe.base != null && A.renderer) { A.renderer.toneMappingExposure = _fe.base; console.log('§FILM_EXPOSURE end frames=' + _fe.n + ' exposure restored ' + _fe.base.toFixed(4)); }
    if (restore && A._meterLast && A._meterLast.film) A._meterLast = null;   // a later still must not read the film's meter
    _fe = null; FXS._bakeFillCheckLogged = false;   // §FILM_FILL_CHECK logs the first frame of each film
  }
  // §CAM_TORCH staging (moved into a function by §ALTS_ALL: stills call it before SourcedLight.stage so ONE meter sees the torch)
  function _camTorchStage(_torchFilm) {
    if ((!A._maxqActive || _torchFilm) && window.LightLaw && window.LightLaw.TORCH && A._stillTorch !== false && !/[?&]torch=0/.test(location.search)) {
    var _TL = window.LightLaw.TORCH, _lp = window.LightLaw.luxPer(A._stillCalibSunLux, A._stillCalibSunI);
    if (_lp) {
      if (!A._camTorch) { A._camTorch = new THREE.SpotLight(_TL.color, 0, 0, _TL.halfAngleDeg * Math.PI / 180, _TL.penumbra || 0, 2);
        A._camTorch.castShadow = true; A._camTorch.shadow.mapSize.set(_TL.shadowMap, _TL.shadowMap); A._camTorch.shadow.camera.near = 0.05; A._camTorch.shadow.camera.far = 60;
        A._camTorch.name = 'cam_torch'; }
      A._camTorch.intensity = _TL.peakCd / _lp; A._camTorch.angle = _TL.halfAngleDeg * Math.PI / 180; A._camTorch.penumbra = _TL.penumbra || 0;   // re-applied every staging (the light is reused)
      A.scene.add(A._camTorch); A.scene.add(A._camTorch.target);
      var _tg = A.controls && A.controls.target ? A.controls.target : new THREE.Vector3().copy(A.camera.position).add(A.camera.getWorldDirection(new THREE.Vector3()));
      FXS._updateCamTorch(_tg.x, _tg.y, _tg.z);
      console.log('§CAM_TORCH on peakCd=' + _TL.peakCd + ' (' + _TL.lm + ' lm, FL1 ' + _TL.beamDistM + ' m) halfAngle=' + _TL.halfAngleDeg + ' offset R' + _TL.offsetRightM + '/U' + _TL.offsetUpM +
        ' m intensityUnits=' + A._camTorch.intensity.toExponential(3) + ' (cd / luxPer ' + _lp.toFixed(1) + ') shadow=' + _TL.shadowMap);
      if (_torchFilm) console.log('§CAM_TORCH film on intensityUnits=' + A._camTorch.intensity.toExponential(6) + ' peakCd=' + _TL.peakCd + ' lawHash=' + window.LightLaw.hash(window.LightLaw.LAW) +
        ' (once per bake; moved per frame by A._updateCamTorch; the film meter S1 reads it every frame)');
      // §ALTS_ALL (torch remeter VACUOUS, §ALTS_COMBINED RESULT: it read skyPx=pixels at every pose): a still stages the torch BEFORE
      // SourcedLight.stage, so the stage meter (and the lamp remeter) already see it — no separate torch remeter. Films: §FILM_EXPOSURE (S1).
    } else console.log('§CAM_TORCH VACUOUS no lux calibration — off');
  }
  }
  function _teardownPhotoStaging() {
    if (!FXS._photoStagingOn) return;  // §PHOTO_DOUBLE_APPLY_GUARD: nothing staged, nothing to revert
    FXS._photoStagingOn = false;
    A._photoStagingOn = false;
    // §STILL_GLOW — give every glazing material its glow value back BEFORE night mode's own teardown runs (which
    // then restores the pre-glow originals if staging had switched night mode on). Nothing stays changed.
    if (A._stillWindowGlowOff) {
      var _lampsWereOff = !!A._stillLampsOff;
      A._stillWindowGlowOff = false; A._stillLampsOff = false;
      if (A._civilGlowSync) A._civilGlowSync('teardown');   // §GLOW_DAY
      var _gr = 0, _lr = 0;
      (A._nightGlowMats || []).forEach(function(g) {
        if (!g.mat) return;
        if (g.win || _lampsWereOff) { g.mat.emissive.setHex(g.glowE); g.mat.emissiveIntensity = g.glowEI; g.mat.needsUpdate = true; if (g.win) _gr++; else _lr++; }
      });
      console.log('§STILL_GLOW restored glowMats=' + _gr + ' lampMats=' + _lr + ' (lamp intensity: _nightPLScale reset below)');
    }
    _shCounting = false;
    // §DLOD_STILL_OWNERSHIP — release the hold; re-enable only if staging paused it, or if a re-enable
    // was asked for (and deferred) while the hold was on.
    A._dlodStillHold = false;
    var _dlodRestore = (FXS._dlodPausedByStill || A._dlodStillWanted) && typeof A.dlodEnable === 'function' && !A._dlodEnabled;
    if (_dlodRestore) { try { A.dlodEnable(); } catch (eD) {} }
    console.log('§DLOD_STILL_OWNERSHIP restored=' + (_dlodRestore ? 1 : 0) + ' pausedByStill=' + (FXS._dlodPausedByStill ? 1 : 0) +
      ' deferredEnable=' + (A._dlodStillWanted ? 1 : 0) + ' dlodEnabledNow=' + (A._dlodEnabled ? 1 : 0));
    FXS._dlodPausedByStill = false; A._dlodStillWanted = false;
    if (FXS._ghostSuspendedByStill) { try { if (typeof window.ghostXrayOn === 'function' && !window.ghostXrayOn()) window.toggleGhostXray(); } catch (eG2) {}
      console.log('§STILL_GHOST_OWNERSHIP restored=1 ghostOnNow=' + (window.ghostXrayOn && window.ghostXrayOn() ? 1 : 0)); FXS._ghostSuspendedByStill = false; }
    // §STILL_DIALS — lamp strength/fall-off back to nav values.
    if (typeof A._stillLampMul === 'number' || typeof A._stillLampDecayNow === 'number') {
      A._stillLampMul = null; A._stillLampDecayNow = null; A._stillShapeColour = false;
      (A._nightLights || []).forEach(function(l) { l.decay = A._nightLightDecayDefault; });
      if (A._nightLightByPos && A.nightFixtureColor) A._nightLightByPos.forEach(function(l, pos) { l.color.set(A.nightFixtureColor(pos)); });
    }
    if (window.SkyPortal) { try { window.SkyPortal.unstage(A); } catch (eSU) {} }   // §SKY_PORTAL
    if (window.GlassFresnel) { try { window.GlassFresnel.unstage(A); } catch (eGU) {} }   // §GLASS_FRESNEL
    if (FXS._albedoSaved.length) { var _nMoved = 0; FXS._albedoSaved.forEach(function(r) { if (r[5] != null && r[0].color.getHex() !== r[5]) _nMoved++; r[0].color.setRGB(r[2], r[3], r[4]); });
      console.log('§ALBEDO_SRGB restored mats=' + FXS._albedoSaved.length + ' lateDecoded=' + FXS._albedoLateN + ' changedDuringStill=' + _nMoved); FXS._albedoSaved = []; }
    FXS._albedoDecSet = null;
    _filmExposureReset(true);   // §FILM_LAW S1 — the staging exposure back before the still/night restores below
    if (FXS._expSaved != null && A.renderer) { A.renderer.toneMappingExposure = FXS._expSaved; FXS._expSaved = null; }
    A._stillLampRangeNow = null;
    if (typeof A._nightSyncPads === 'function') { try { A._nightSyncPads(); } catch (ePad) {} }   // §STILL_LIGHT_PAD — pads go with the still
    if (window.SkyOcc) { try { window.SkyOcc.unstage(A); } catch (eSOU) {} }   // §SKY_OCCLUSION
    if (window.SourcedLight) { try { window.SourcedLight.unstage(A); } catch (eSLU) {} }   // §SOURCED_LIGHT
    // §STILL_BASE — hand navigation its own base light back.
    if (FXS._stillBaseSaved && A.ambient && A.hemi) {
      A.ambient.intensity = FXS._stillBaseSaved.ambI; A.hemi.intensity = FXS._stillBaseSaved.hemiI;
      if (FXS._stillBaseSaved.ground) { A.hemi.groundColor.setRGB(FXS._stillBaseSaved.ground[0], FXS._stillBaseSaved.ground[1], FXS._stillBaseSaved.ground[2]); console.log('§GROUND_HALF restored groundColor=0x' + A.hemi.groundColor.getHexString()); }   // §ZERO Z12
      console.log('§STILL_BASE restored ambient=' + FXS._stillBaseSaved.ambI.toFixed(3) + ' hemi=' + FXS._stillBaseSaved.hemiI.toFixed(3));
      FXS._stillBaseSaved = null;
    }
    // §FILM_FILL_RESTORE — hand navigation its own fill back (the night-mode restore below only covers
    // the case where staging toggled night mode itself).
    if (FXS._filmFillSaved && A.ambient && A.hemi) {
      A.ambient.intensity = FXS._filmFillSaved.ambI; A.hemi.intensity = FXS._filmFillSaved.hemiI;
      console.log('§FILM_FILL_RESTORE off — ambient ' + FXS._filmFillSaved.ambI + ' hemi ' + FXS._filmFillSaved.hemiI + ' restored');
      FXS._filmFillSaved = null;
    }
    // §CAM_LIGHT: pull it back out of the scene — normal navigation never carries it.
    if (A._camLight) { A.scene.remove(A._camLight); console.log('§CAM_LIGHT off'); }
    if (A._camTorch && A._camTorch.parent) { A.scene.remove(A._camTorch); A.scene.remove(A._camTorch.target); console.log('§CAM_TORCH off'); }
    // §LAYER2_HDRI: restore the procedural envMap — the real HDRI is still cached for next time,
    // only the active pointer reverts (normal navigation keeps its existing sky-derived look).
    if (FXS._photoEnvMapSaved !== null) { A._envMap = FXS._photoEnvMapSaved; FXS._photoEnvMapSaved = null; }
    // §SFR_UNIFORM_NOT_DEFINE — hand every material its own pre-staging envMapIntensity back. Keyed
    // per material (userData._sfrBaseEnvI, captured the first time this pass touched it) rather than
    // one global default, because materials do not all start from the same value. No needsUpdate
    // here either: restoring a uniform is as free as setting it was.
    var _sfrRestored = 0;
    Object.keys(FXS._sfrTouched).forEach(function(k) {
      var mm = FXS._sfrTouched[k];
      if (mm && mm.userData && mm.userData._sfrBaseEnvI != null) {
        mm.envMapIntensity = mm.userData._sfrBaseEnvI;
        delete mm.userData._sfrBaseEnvI;
        _sfrRestored++;
      }
    });
    FXS._sfrTouched = {};
    if (_sfrRestored) console.log('§SFR_UNIFORM_NOT_DEFINE teardown envMapIntensity restored on ' +
      _sfrRestored + ' material(s) — the map itself never moved, so nothing holds a disposed target');
    A._envMapHdriActive = false;  // §ALT_FRAME_LUMINANCE: scene.js's throttled regen is safe again
    // §PHOTO_SUN_SEPARATION: only undo the night-mode force-on if THIS staging cycle actually
    // applied dusk mood (snapshot, not the live flag — the user may have flipped it mid-session).
    // §PHOTO_SUN_SEPARATION_FIX: night mode is force-toggled on UNCONDITIONALLY now (point lights
    // are real illumination, not mood) — teardown must undo it unconditionally too, or it sticks
    // on after every Alt+S exit outside dusk mode.
    if (!FXS._photoNightWasOn && A.toggleNightMode) A.toggleNightMode();
    // §STAGED_PL_CUT — unconditional reset (the boost-branch reset alone was proven unreachable
    // on this path); if night mode stays on (user had it on pre-staging), rebuild at nav intensity.
    A._nightPLScale = 1.0;
    A._nightPLScaleStaged = null;   // §SUN_ARC_FILL — staging base gone with the staging
    A._photoFillBase = null;
    if (FXS._photoNightWasOn && typeof A._nightUpdateLights === 'function' && ((A._nightLights && A._nightLights.length) || A._lampDataUsed)) A._nightUpdateLights();   // §LAMP_UNCAPPED: the still left no point lights; nav rebuilds its pool
    A._lampDataUsed = false;
    FXS._photoDuskMoodApplied = false;
    if (!FXS._photoSkyWasVisible && A._sky) A._sky.visible = false;
    if (A.sun && FXS._photoSunPosSaved) {
      A.sun.position.copy(FXS._photoSunPosSaved);
      A.sun.target.position.copy(FXS._photoSunTargetSaved);
      A.sun.target.updateMatrixWorld();
      FXS._photoSunPosSaved = null; FXS._photoSunTargetSaved = null;
    }
    if (A._lensflare) {
      A._lensflare.material.toneMapped = FXS._photoFlarePrevTone;
      A._lensflare.material.needsUpdate = true;
      if (A._lensflare.userData._halo) {
        A._lensflare.userData._halo.material.toneMapped = FXS._photoHaloPrevTone;
        A._lensflare.userData._halo.material.needsUpdate = true;
      }
    }
    FXS._photoMatBoostActive = false;
    FXS._mirrorOwnRestore();   // §MIRROR_OWN_MAT
    FXS._photoEnvBoostedMats.forEach(function(m) {
      m.envMapIntensity = m.userData._photoOrigEnvMapIntensity;
      delete m.userData._photoOrigEnvMapIntensity;
      if (m.userData._photoOrigRoughness !== undefined) {
        m.roughness = m.userData._photoOrigRoughness;
        delete m.userData._photoOrigRoughness;
      }
      // §MIRROR_TRUE_REFLECT_METALNESS: undo the forced near-1.0 metalness, same restore
      // discipline as roughness/envMapIntensity above.
      if (m.userData._photoOrigMetalness !== undefined) {
        m.metalness = m.userData._photoOrigMetalness;
        delete m.userData._photoOrigMetalness;
      }
      delete m.userData._photoBoosted;
      // §MIRROR_ROOM_PROBE: drop back to the sky env map — same "restore what you borrowed" rule
      // as everything else here. The probe's RT itself is DELIBERATELY NOT disposed here (see
      // §MIRROR_ROOM_PROBE_REUSE above) — it stays alive, reused on the next Alt+S press, only
      // freed by _buildRoomProbe() itself on a real building switch.
      delete m.userData._photoRoomProbeEligible;
      if (A._envMap) m.envMap = A._envMap;
      m.needsUpdate = true;
    });
    FXS._photoEnvBoostedMats = [];
    // §SUN_FILL_RATIO (2026-09-02): matte materials were held on the PRE-STAGING sky env map, not
    // the HDRI, so they are not in the boosted list above and would keep a reference to it after
    // teardown. A later A.updateSky() regen DISPOSES the previous render target
    // (§MEMLEAK_PMREM_DISPOSE, scene.js:227), so that reference must not outlive staging. One pass
    // points every cached material back at the live A._envMap — the same thing the loop above
    // already does for the boosted set, extended to the rest. (It also closes a pre-existing leak:
    // before this change matte materials kept the staged HDRI as their envMap after Alt+S exited.)
    // The same pass clears `_photoBoosted`. _reassertPhotoMatBoost sets that flag on EVERY material
    // it visits, but only the glossy ones land in _photoEnvBoostedMats — so matte materials kept a
    // stale `_photoBoosted:true` for the rest of the session and were skipped by the early-return on
    // every later Alt+S. Harmless today (nothing is applied to them) but it is a lie in the state,
    // and the witness teardown census reads it: measured 11 of 53 stale on Clinic before this line.
    if (A._envMap && A._matCache) {
      var _mattePut = 0, _flagClr = 0;
      Object.keys(A._matCache).forEach(function(k) {
        var m = A._matCache[k];
        if (!m) return;
        if ('envMap' in m && m.envMap !== A._envMap) { m.envMap = A._envMap; m.needsUpdate = true; _mattePut++; }
        if (m.userData && m.userData._photoBoosted) { delete m.userData._photoBoosted; _flagClr++; }
      });
      if (_mattePut || _flagClr) console.log('§SUN_FILL_RATIO teardown envMap restored on ' + _mattePut +
        ' material(s), stale _photoBoosted cleared on ' + _flagClr);
    }
    FXS._disablePhotoShadows();
    if (A.ground && A._applyGroundTexture) {
      // §GROUND_ALBEDO: hand the gain back BEFORE restoring, or the lift follows the user out of
      // the photoshoot into normal navigation — the same "restore what you borrowed" rule
      // A._nightMaxLightsStill already has (NIGHT_AND_FIXTURE_LIGHTING.md §constants).
      A._groundAlbedoGain = 1.0;
      A._applyGroundTexture(FXS._photoGroundPrevKey);  // null → clears map, restores flat color
      if (FXS._photoGroundPrevColor != null && A._setGroundColor) A._setGroundColor(FXS._photoGroundPrevColor);
      A.ground.visible = FXS._photoGroundWasVisible;
      console.log('§GROUND_ALBEDO restored gain=' + A._groundAlbedoGain.toFixed(2) +
        ' color=' + (A.ground.material.color ? A.ground.material.color.r.toFixed(2) : 'n/a'));
    }
    if (A.scene && A.scene.fog && FXS._photoFogColorSaved != null) {
      A.scene.fog.color.setHex(FXS._photoFogColorSaved);
      A.scene.fog.density = FXS._photoFogDensitySaved;
      FXS._photoFogColorSaved = null; FXS._photoFogDensitySaved = null;
    }
    if (A._sky && FXS._photoSkyUniSaved) {
      var _su2 = A._sky.material.uniforms;
      _su2['turbidity'].value = FXS._photoSkyUniSaved.turbidity;
      _su2['rayleigh'].value = FXS._photoSkyUniSaved.rayleigh;
      _su2['mieCoefficient'].value = FXS._photoSkyUniSaved.mieCoefficient;
      _su2['mieDirectionalG'].value = FXS._photoSkyUniSaved.mieDirectionalG;
      FXS._photoSkyUniSaved = null;
    }
    // §ALTS_MEM_HOG (2026-08-16, measured via headless probe — prompts/PHOTOREAL_STILL_RENDER.md
    // ▶RESUME item 3): was `_showPhotoProps(false)`, which only sets .visible=false on
    // _photoUplights/_photoSkyline/_photoSkylineLights and does nothing at all for _photoSparkles
    // (they stay exactly as the last accumulation frame's sun-glint test left them — up to a few
    // visibly ON in normal daylight nav). Neither path disposes anything — the whole photo-prop
    // tree (up to ~30 PointLights, 40 skyline-box meshes, 1 window-sparkle Points cloud, ~24 glint
    // sprites) stays allocated forever after a REAL Alt+S exit, only freed later by a building
    // switch (_showPhotoProps(true)'s own rebuild guard). Measured on HHS_Office_Federated,
    // headless: renderer.info after startStillRefine()->stopStillRefine(true,false) never returned
    // to baseline — textures +22, geometries +52, programs +36, scene.children +42 net, all
    // surviving the "real exit" path (this function only runs when keepStaging is NOT set — a
    // camera-move soft-park skips it entirely, so this is never the reuse-for-perf case).
    // _disposePhotoProps() is the exact function _showPhotoProps(true) already calls to rebuild on
    // a building switch — reusing it here on real exit correctly frees the GPU resources AND fixes
    // the stray-visible-sparkle bug, at the cost of a rebuild on the next Alt+S press (cheap: a
    // handful of dbQuery calls + <50 objects, not the streaming-heavy path).
    FXS._disposePhotoProps();
    console.log('§PHOTO_STAGING off');
  }
};
