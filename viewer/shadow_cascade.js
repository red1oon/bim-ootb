// ══ §STILL_SHADOW_CASCADE — the sun's shadow term from m cascaded maps (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md
// "§STILL_SHADOW_CASCADE — SPEC" + WATCHDOG GATE CONDITIONS C1-C5 + BUILD DECISIONS D1-D7) ══
// A.sun stays the ONE lit directional light; cascades 1..m-1 are shadow-only DirectionalLights (colour 0) that effects.js
// adds for an Alt+S still. This file only patches three's lights_fragment_begin ONCE at load (scene.js, after
// §SOURCED_LIGHT — different anchors, so the order does not matter) and owns the four shared uniforms:
//   uCsm     x = on (1) / off (0: every directional shadow exactly as three's own loop), y = cascades used,
//            z = the SUN's slot in three's directional-shadow list, w = blend fraction (0.1 = last 10% of a split)
//   uCsmIdx  the directional-shadow slot of cascade 0..3 (-1 = none); cascade 0 is the sun (D2)
//   uCsmNear / uCsmFar  each cascade's split [C_c, C_c+1] in view depth (m)
// Per fragment, ONCE (§SOURCED_LIGHT_LINK lesson — no per-light inlined heavy code): the depth cascade, the first cascade
// from there whose map box holds the fragment (D3), the blend weight; then one getShadow per directional shadow light —
// the same count three's own loop compiles — taken only where its weight is > 0. In three's loop the sun's shadow line
// reads that result and every other directional shadow light reads its own precomputed lookup (cascade lights add no
// light: colour 0). With uCsm.x = 0 (nav, films, &shadowcascade=0) the result is three's own, lookup for lookup.
(function (global) {
  var CSM = new Float32Array([0, 0, -1, 0.1]), IDX = new Float32Array([-1, -1, -1, -1]);
  var NEAR = new Float32Array(4), FAR = new Float32Array(4);
  var installed = false;
  var PARS = [
    '#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 )',
    'uniform vec4 uCsm; uniform vec4 uCsmIdx; uniform vec4 uCsmNear; uniform vec4 uCsmFar;',
    // inside this map's box (xy in [0,1], not beyond its far plane) — the same test getShadow makes before its taps
    'float csmInBox( vec4 c ) { vec3 s = c.xyz / c.w; return ( s.x >= 0.0 && s.x <= 1.0 && s.y >= 0.0 && s.y <= 1.0 && s.z <= 1.0 ) ? 1.0 : 0.0; }',
    '#endif', ''].join('\n');
  var PRE = [
    '#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 ) && ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
    '\tfloat _csmSh[ NUM_DIR_LIGHT_SHADOWS ];',
    '\tfloat _csmS = 1.0;',
    '\t{',
    '\t\tvec4 _csmIn = vec4( 0.0 );',
    '\t\t#pragma unroll_loop_start',
    '\t\tfor ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {',
    '\t\t\t_csmSh[ i ] = 1.0;',
    '\t\t\t_csmIn += csmInBox( vDirectionalShadowCoord[ i ] ) * vec4( equal( vec4( float( UNROLLED_LOOP_INDEX ) ), uCsmIdx ) );',
    '\t\t}',
    '\t\t#pragma unroll_loop_end',
    '\t\tfloat _csmZ = - geometryPosition.z;',
    '\t\tint _csmD = 0;',
    '\t\tfor ( int k = 0; k < 3; k ++ ) { if ( float( k + 1 ) < uCsm.y && _csmZ > uCsmFar[ k ] ) _csmD = k + 1; }',
    '\t\tint _csmC = -1;',
    '\t\tfor ( int k = 0; k < 4; k ++ ) { if ( _csmC < 0 && k >= _csmD && float( k ) < uCsm.y && _csmIn[ k ] > 0.5 ) _csmC = k; }',
    '\t\tvec4 _csmW = vec4( 0.0 );',
    '\t\tif ( _csmC >= 0 ) {',
    '\t\t\tfloat _csmB = 0.0;',
    '\t\t\tif ( _csmC == _csmD && float( _csmC + 1 ) < uCsm.y ) {',
    '\t\t\t\tif ( _csmIn[ _csmC + 1 ] > 0.5 ) { float _csmL = uCsm.w * ( uCsmFar[ _csmC ] - uCsmNear[ _csmC ] ); _csmB = clamp( ( _csmZ - ( uCsmFar[ _csmC ] - _csmL ) ) / max( _csmL, 1e-4 ), 0.0, 1.0 ); }',
    '\t\t\t}',
    '\t\t\t_csmW[ _csmC ] = 1.0 - _csmB;',
    '\t\t\tif ( _csmB > 0.0 ) _csmW[ _csmC + 1 ] = _csmB;',
    '\t\t}',
    '\t\tfloat _csmAcc = 0.0, _csmWi = 0.0, _csmT = 1.0; vec4 _csmSel; bool _csmIsC;',
    '\t\tDirectionalLightShadow _csmDLS;',
    '\t\t#pragma unroll_loop_start',
    '\t\tfor ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {',
    '\t\t\t_csmDLS = directionalLightShadows[ i ];',
    '\t\t\t_csmSel = vec4( equal( vec4( float( UNROLLED_LOOP_INDEX ) ), uCsmIdx ) );',
    '\t\t\t_csmIsC = uCsm.x > 0.5 && dot( _csmSel, _csmSel ) > 0.5;',
    '\t\t\t_csmWi = _csmIsC ? dot( _csmW, _csmSel ) : 0.0;',
    '\t\t\tif ( receiveShadow && ( ! _csmIsC || _csmWi > 0.0 ) ) {',
    '\t\t\t\t_csmT = getShadow( directionalShadowMap[ i ], _csmDLS.shadowMapSize, _csmDLS.shadowIntensity, _csmDLS.shadowBias, _csmDLS.shadowRadius, vDirectionalShadowCoord[ i ] );',
    '\t\t\t\tif ( _csmIsC ) _csmAcc += _csmWi * _csmT; else _csmSh[ i ] = _csmT;',
    '\t\t\t}',
    '\t\t}',
    '\t\t#pragma unroll_loop_end',
    // no cascade holds the fragment -> lit, as today outside the fitted box (D3)
    '\t\t_csmS = receiveShadow ? _csmAcc + ( 1.0 - ( _csmW.x + _csmW.y + _csmW.z + _csmW.w ) ) : 1.0;',
    '\t}',
    '#endif', ''].join('\n');
  var DIR_BLOCK = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
  var DIR_SHADOW = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
  var DIR_NEW = 'directLight.color *= ( uCsm.x > 0.5 && float( UNROLLED_LOOP_INDEX ) == uCsm.z ) ? _csmS : _csmSh[ i ];';

  function install(THREE) {
    if (installed) return;
    if (!THREE || !THREE.ShaderChunk) { console.warn('§STILL_SHADOW_CASCADE install skipped: THREE.ShaderChunk missing'); return; }
    var C = THREE.ShaderChunk, fb = C.lights_fragment_begin;
    var nDir = fb.split(DIR_BLOCK).length - 1, nSh = fb.split(DIR_SHADOW).length - 1;
    if (nDir !== 1 || nSh !== 1) { console.warn('§STILL_SHADOW_CASCADE install skipped: anchors dirBlock=' + nDir + ' dirShadowLine=' + nSh + ' (need 1/1; three changed?) — single map only'); return; }
    fb = fb.replace(DIR_BLOCK, PRE + DIR_BLOCK).replace(DIR_SHADOW, DIR_NEW);
    C.lights_fragment_begin = fb;
    C.lights_pars_begin = PARS + C.lights_pars_begin;
    ['standard', 'physical', 'lambert', 'phong', 'toon'].forEach(function (k) {
      var U = THREE.ShaderLib[k] && THREE.ShaderLib[k].uniforms; if (!U) return;
      // typed arrays are shared by reference through UniformsUtils.clone: one write reaches every program
      U.uCsm = { value: CSM }; U.uCsmIdx = { value: IDX }; U.uCsmNear = { value: NEAR }; U.uCsmFar = { value: FAR };
    });
    installed = true;
    console.log('§STILL_SHADOW_CASCADE installed (lights_fragment_begin: once-per-fragment cascade choice + the sun\'s shadow line) — inert until an Alt+S sets uCsm');
  }
  // set by effects.js at the fit; off() at teardown
  function set(on, used, sunSlot, slots, near, far, blend) {
    CSM[0] = on ? 1 : 0; CSM[1] = used; CSM[2] = sunSlot; CSM[3] = blend;
    for (var i = 0; i < 4; i++) { IDX[i] = (slots[i] == null) ? -1 : slots[i]; NEAR[i] = near[i] || 0; FAR[i] = far[i] || 0; }
  }
  function off() { CSM[0] = 0; CSM[1] = 0; CSM[2] = -1; for (var i = 0; i < 4; i++) { IDX[i] = -1; NEAR[i] = 0; FAR[i] = 0; } }
  global.ShadowCascade = { install: install, installed: function () { return installed; }, set: set, off: off,
    state: function () { return { csm: Array.from(CSM), idx: Array.from(IDX), near: Array.from(NEAR), far: Array.from(FAR) }; } };
})(typeof window !== 'undefined' ? window : this);
