// ══ §SOURCED_LIGHT — surfaces lit by their real sources only (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md
// "§SOURCED_LIGHT — SPEC" + "GATE ADDITIONS" + "BUILD LOG + SPEC CHANGE"; watchdog red1-4b gates) ══
// red1: "light cannot leak through walls in real life except through glass." Every lamp (PointLight) and sky portal
// (SpotLight) is bound to the LIGHT ZONE it sits in (light_zones.js: connected empty space of the voxelised building);
// a fragment is lit by a light only when both are in the same zone. A fragment that does not see the sky (a covered zone
// cell without SKY_BIT, or unknown) has its flat ambient / hemi / IBL sky scaled to uSLParams.z (0 = only real sources);
// open-to-sky and sky-lit cells keep it (§ZONE_OPEN_SKY, light_zones.js).
// install() patches THREE.ShaderChunk ONCE (scene.js, next to §SKY_OCCLUSION), before any material compiles. With
// uSLParams.x = 0 (nav, and every page until an Alt+S stages it) slPass() returns 1: the picture is unchanged.
// &sourced=0 skips the install entirely (today's shaders, for red1's A/B).
(function (global) {
  var MAX_PL = 256, MAX_SL = 64, SOLID = 65535, OUTSIDE = 65534;   // OUTSIDE: a light (or fragment) off the building's zones
  var orig = null, linkFailed = false, glErrFirstFrame = false;
  var installed = false, active = false, prevOBR = null, tex = null, dummy = null, texKey = null, lastLog = '';
  var P = new Float32Array(4), ORG = new Float32Array(4), DIM = new Float32Array(4), SKY = new Float32Array(4);   // uSLSky: x = §SKY_VIEW_FIELD on (1) / off (0)
  var rg = null, rgKey = null, fieldLast = null, luxLast = null;   // §SKY_VIEW_FIELD: the RG16UI texel array (R = zone | SKY_BIT, G = sky-view F x 10000)
  var PZ = new Float32Array(MAX_PL), SZ = new Float32Array(MAX_SL);   // zone per point / spot light, in three's light order

  // ══ §SOURCED_LIGHT_LINK — SPEC (2026-09-25, fix/sl-gl-link) ══
  // CAUSE (measured, not guessed): GLSL ES has no real calls — the compiler inlines every function at each call site.
  // slPass() called slFragZone() (14 texelFetch, two 3-step + one 8-step loop, a mat4 inverse) and three's
  // #pragma unroll_loop pastes the point/spot loop bodies once per light, so a Hospital still (155 point + 19 spot lights)
  // compiled 176 copies of that body per lit program (+4 in slSkyKeep, +1 in the zone-debug override), 93 programs per
  // Alt+S. Measured with the NVIDIA GL driver shader cache off (slprobe, sync LINK_STATUS, default pose): link total
  // 129.8 s, single links up to 23.9 s; today's shaders (&sourced=0): 28.9 s total, 1.9 s max. Mesa Intel (the headless
  // errprobe GPU) never finished: Chrome killed the GPU process ("GPU process exited unexpectedly: exit_code=133" =
  // RESULT_CODE_HUNG, the GPU watchdog) ~2 min after "§SOURCED_LIGHT on"; from then every getProgramParameter(LINK_STATUS)
  // is false with EMPTY info logs on every program, patched or not (MeshDepth, Points, Sky, Output...) — the
  // "VALIDATE_STATUS false" + 1282 storm — and 660 ms later "Context Lost". The RTX 4060 + ANGLE/Vulkan Chrome dies the
  // same way (a slower compiler than NVIDIA GL). The GLSL was never invalid (a fresh context compiles fine after the
  // storm; every captured program links). Texture units (17 of 32), uniform vectors and the R16UI upload were ruled out
  // (upload before=0 after=0). The default pose only differs by how many programs one cube-face render compiles in one
  // blocking burst while the whole building is being drawn (café pose, same shaders: 59.2 s total, 1.95 s max).
  // FIX: the fragment's zone is computed ONCE per fragment (_slFZ, right after `IncidentLight directLight;` in
  // lights_fragment_begin, before the light loops) and slPass()/slSkyKeep()/the debug override read that value: one copy
  // of slFragZone per shader instead of 181. Per-light cost is now two compares. Same call-site text, same semantics.
  // After: 46.4 s total, 1.7 s max (default pose, same probe) — the single-link maximum is back at today's shaders'.
  var PARS = [
    '#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON )',
    'uniform vec4 uSLParams; uniform vec4 uSLOrg; uniform vec4 uSLDim; uniform vec4 uSLSky; uniform highp usampler3D uSLZone;',
    '#if NUM_POINT_LIGHTS > 0', 'uniform vec4 uSLPZ[ ( NUM_POINT_LIGHTS + 3 ) / 4 ];', '#endif',
    '#if NUM_SPOT_LIGHTS > 0', 'uniform vec4 uSLSZ[ ( NUM_SPOT_LIGHTS + 3 ) / 4 ];', '#endif',
    // the fragment's zone, set ONCE by the line §SOURCED_LIGHT_LINK inserts into lights_fragment_begin; -1 = unknown (lit as today)
    'float _slFZ = -1.0;',
    // the fragment's sky class, set with _slFZ: 1 = sees the sky (open cell / sky-lit covered cell / off grid), 0 = covered or unknown
    'float _slSky = 1.0;',
    // §SKY_VIEW_FIELD: the fragment's filtered sky-view F (trilinear over same-zone / open cells, once per fragment with _slFZ)
    'float _slF = 1.0;',
    // raw cell: -1 off grid, 65535 solid, 0 outside, 1.. zone
    'float slZoneAt( vec3 w ) {',
    '  ivec3 c = ivec3( floor( ( w - uSLOrg.xyz ) / uSLParams.y ) );',
    '  if ( any( lessThan( c, ivec3( 0 ) ) ) || any( greaterThanEqual( c, ivec3( uSLDim.xyz ) ) ) ) return -1.0;',
    '  return float( texelFetch( uSLZone, c, 0 ).r );',
    '}',
    // §ZONE_OPEN_SKY fragment zone (CPU mirror: LightZones.surfaceInfo, same order): C0 = the cell of wp + 0.25 m along the
    // eye-facing normal; the nearest non-solid cell CENTRE (from wp) among C0's 27 cells on the eye side of the surface wins
    // (a floor inside a wall's rasterised column takes the room cell beside it, never the void under the slab: red1's bright
    // junction strips, 2026-09-25); none -> walk up C0's column to the first non-solid cell (open above = sky); a fully solid
    // column = -1 unknown (sky off, lamps as today). Open (0) and off-grid -> OUTSIDE 65534 with sky; a zone keeps the sky
    // only with SKY_BIT (0x4000) set by light_zones.js. Called exactly once per fragment (§SOURCED_LIGHT_LINK); sets _slSky.
    'float slFragZone( vec3 posView, vec3 nView ) {',
    '  mat4 vi = inverse( viewMatrix );',
    // IFC meshes often wind inward: face the normal toward the eye first (the side the viewer sees)
    '  vec3 nf = ( dot( nView, - posView ) < 0.0 ) ? - nView : nView;',
    '  vec3 wp = ( vi * vec4( posView, 1.0 ) ).xyz; vec3 wn = normalize( ( vi * vec4( nf, 0.0 ) ).xyz );',
    '  ivec3 c0 = ivec3( floor( ( wp + wn * 0.25 - uSLOrg.xyz ) / uSLParams.y ) ); ivec3 dim = ivec3( uSLDim.xyz );',
    '  if ( any( lessThan( c0, ivec3( 0 ) ) ) || any( greaterThanEqual( c0, dim ) ) ) { _slSky = 1.0; return 65534.0; }',
    '  float best = 1e30; uint bt = 65535u; uint bg = 0u;',
    '  for ( int dz = -1; dz <= 1; dz ++ ) { for ( int dy = -1; dy <= 1; dy ++ ) { for ( int dx = -1; dx <= 1; dx ++ ) {',
    '    ivec3 c = c0 + ivec3( dx, dy, dz );',
    '    if ( any( lessThan( c, ivec3( 0 ) ) ) || any( greaterThanEqual( c, dim ) ) ) continue;',
    '    uvec2 t2 = texelFetch( uSLZone, c, 0 ).rg; uint t = t2.r; if ( t == 65535u ) continue;',
    '    vec3 e = uSLOrg.xyz + ( vec3( c ) + 0.5 ) * uSLParams.y - wp; if ( dot( e, wn ) <= 0.0 ) continue;',
    '    float l = dot( e, e ); if ( l < best ) { best = l; bt = t; bg = t2.g; }',
    '  } } }',
    '  if ( bt == 65535u ) { bt = 0u; bg = 0u; for ( int j = 1; j < 4096; j ++ ) { ivec3 c = c0 + ivec3( 0, j, 0 ); if ( c.y >= dim.y ) break;',
    '    uvec2 t2 = texelFetch( uSLZone, c, 0 ).rg; if ( t2.r != 65535u ) { bt = t2.r; bg = t2.g; break; } if ( c.y == dim.y - 1 ) bt = 65535u; } }',
    '  if ( bt == 65535u ) { _slSky = 0.0; _slF = 0.0; return -1.0; }',
    '  uint z = bt & 0x3FFFu; _slSky = ( z == 0u || ( bt & 0x4000u ) != 0u ) ? 1.0 : 0.0;',
    // §SKY_VIEW_FIELD V5 — irradiance-volume filter (Greger et al. 1998): 8 texels around wp + 0.5 cell along the eye-facing
    // normal, trilinear weights, kept only when not SOLID and in the fragment's zone or open; renormalised; none -> picked cell
    // outside fragments are filtered too (their stencil accepts every non-solid cell), so a surface running from open air
    // under a roof edge has no step where its nearest cell flips from open to covered (SKY_STEP out-zone pairs, 2026-09-25);
    // one solid cell still separates: the stencil reaches at most half a cell past the surface
    '  _slF = 1.0;',
    '  if ( uSLSky.x > 0.5 ) {',
    '    vec3 g = ( wp + wn * 0.5 * uSLParams.y - uSLOrg.xyz ) / uSLParams.y - 0.5; ivec3 b = ivec3( floor( g ) ); vec3 f = g - vec3( b ); float sw = 0.0, sf = 0.0;',
    '    for ( int o = 0; o < 8; o ++ ) { ivec3 d = ivec3( o & 1, ( o >> 1 ) & 1, ( o >> 2 ) & 1 ); ivec3 c = b + d;',
    '      if ( any( lessThan( c, ivec3( 0 ) ) ) || any( greaterThanEqual( c, dim ) ) ) continue;',
    '      uvec2 t2 = texelFetch( uSLZone, c, 0 ).rg; if ( t2.r == 65535u ) continue; uint tz = t2.r & 0x3FFFu; if ( z != 0u && tz != z && tz != 0u ) continue;',
    '      vec3 wv = mix( vec3( 1.0 ) - f, f, vec3( d ) ); float w = wv.x * wv.y * wv.z; sw += w; sf += w * float( t2.g ) / 10000.0; }',
    '    _slF = ( sw > 0.0 ) ? sf / sw : float( bg ) / 10000.0;',
    '  }',
    '  return ( z == 0u ) ? 65534.0 : float( z );',
    '}',
    // a bound light (lz >= 1, OUTSIDE included) reaches only fragments of its own zone; unbound (0) and unknown: as today.
    // posView/nView are kept for the call sites' sake; the zone is the once-computed _slFZ (§SOURCED_LIGHT_LINK)
    'float slPass( float lz, vec3 posView, vec3 nView ) {',
    '  if ( uSLParams.x < 0.5 || lz < 0.5 ) return 1.0;',
    '  return ( _slFZ < -0.5 || abs( _slFZ - lz ) < 0.5 ) ? 1.0 : 0.0;',
    '}',
    'float slSkyKeep( vec3 posView, vec3 nView ) {',
    '  if ( uSLParams.x < 0.5 ) return 1.0;',
    // sky only where the sampled cell sees it (_slSky, §ZONE_OPEN_SKY). Unknown (-1: a fully solid column above) is a building
    // surface too (wall foot, ceiling-panel strip): it loses the sky like a covered one. Left at 1 it took the full hemi, and
    // the §METER's +4-6 stops turned it purple (Clinic/Hospital 2026-09-25)
    // §SKY_VIEW_FIELD on: a zone fragment's sky terms x F_filtered (outside 1; unknown -1 keeps indoorSky as before)
    '  if ( uSLSky.x > 0.5 ) return ( _slFZ < -0.5 ) ? uSLParams.z : _slF;',   // outside: filtered too (1 away from any roof)
    '  return ( _slSky > 0.5 ) ? 1.0 : uSLParams.z;',
    '}',
    '#else',
    'float slPass( float lz, vec3 posView, vec3 nView ) { return 1.0; }',
    'float slSkyKeep( vec3 posView, vec3 nView ) { return 1.0; }',
    '#endif', ''].join('\n');
  // §SOURCED_LIGHT_LINK: the one slFragZone call per fragment, before three's light loops (geometryPosition/geometryNormal
  // are declared at the top of lights_fragment_begin). Staged (x) or zone-debug (w) only: nav pays nothing.
  var ONCE = '\n#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON )\n' +
    '_slFZ = ( uSLParams.x > 0.5 || uSLParams.w > 0.5 ) ? slFragZone( geometryPosition, geometryNormal ) : -1.0;\n#endif\n';

  function install(THREE) {
    if (installed) return;
    if (/[?&]sourced=0/.test(location.search)) { console.log('§SOURCED_LIGHT not installed (&sourced=0 — today\'s shaders)'); return; }
    if (!THREE || !THREE.ShaderChunk) { console.warn('§SOURCED_LIGHT install skipped: THREE.ShaderChunk missing'); return; }
    var C = THREE.ShaderChunk, ok = 0, fb = C.lights_fragment_begin;
    orig = { lights_fragment_begin: C.lights_fragment_begin, lights_fragment_maps: C.lights_fragment_maps, lights_pars_begin: C.lights_pars_begin, dithering_fragment: C.dithering_fragment };
    // §SOURCED_LIGHT_LINK: the once-per-fragment zone, before the point loop (must land, or slPass/slSkyKeep see -1 = as today)
    var d0 = 'IncidentLight directLight;';
    if (fb.indexOf(d0) >= 0) { fb = fb.replace(d0, d0 + ONCE); ok++; } else console.warn('§SOURCED_LIGHT_LINK anchor "IncidentLight directLight;" missing: zones inert');
    var p0 = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
    if (fb.indexOf(p0) >= 0) { fb = fb.replace(p0, p0 + '\n\t\tdirectLight.color *= slPass( uSLPZ[ UNROLLED_LOOP_INDEX / 4 ][ UNROLLED_LOOP_INDEX - ( UNROLLED_LOOP_INDEX / 4 ) * 4 ], geometryPosition, geometryNormal );'); ok++; }
    var s0 = 'getSpotLightInfo( spotLight, geometryPosition, directLight );';
    if (fb.indexOf(s0) >= 0) { fb = fb.replace(s0, s0 + '\n\t\tdirectLight.color *= slPass( uSLSZ[ UNROLLED_LOOP_INDEX / 4 ][ UNROLLED_LOOP_INDEX - ( UNROLLED_LOOP_INDEX / 4 ) * 4 ], geometryPosition, geometryNormal );'); ok++; }
    var a0 = 'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );';
    if (fb.indexOf(a0) >= 0) { fb = fb.replace(a0, 'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor ) * slSkyKeep( geometryPosition, geometryNormal );'); ok++; }
    var h0 = 'irradiance += getHemisphereLightIrradiance(';   // also matches the §SKY_OCCLUSION-patched line
    if (fb.indexOf(h0) >= 0) { fb = fb.replace(h0, 'irradiance += slSkyKeep( geometryPosition, geometryNormal ) * getHemisphereLightIrradiance('); ok++; }
    C.lights_fragment_begin = fb;
    // IBL (scene.environment) is sky light too: its diffuse irradiance and its reflections are gated indoors like the hemi.
    // The white-Lambert §METER cannot see IBL, so ungated it was amplified by the meter's +4-6 stops into a purple cast on
    // every weakly lamp-lit surface (Clinic corridor / Hospital café, 2026-09-25).
    var fm = C.lights_fragment_maps, e0 = 'iblIrradiance += getIBLIrradiance(', r0 = 'radiance += getIBLRadiance(';
    if (fm.indexOf(e0) >= 0) { fm = fm.replace(e0, 'iblIrradiance += slSkyKeep( geometryPosition, geometryNormal ) * getIBLIrradiance('); ok++; }
    if (fm.indexOf(r0) >= 0) { fm = fm.replace(r0, 'radiance += slSkyKeep( geometryPosition, geometryNormal ) * getIBLRadiance('); ok++; }
    C.lights_fragment_maps = fm;
    // §SOURCED_LIGHT_ZONE_DEBUG (witness only): uSLParams.w = 1 writes the fragment's zone as the colour, after every other
    // output chunk (R = zone mod 256, G = zone / 256, B = 1 when unknown / 0.5 when the sky is kept / 0 sky off), so a
    // readback compares shader zones AND sky class with the CPU mirror.
    if (C.dithering_fragment && C.dithering_fragment.indexOf('uSLParams') < 0) {
      C.dithering_fragment = C.dithering_fragment + '\n#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON )\n' +
        'if ( uSLParams.w > 0.5 && uSLParams.w < 1.5 ) { float _dz = _slFZ; float _uz = _dz < -0.5 ? 0.0 : _dz; gl_FragColor = vec4( mod( _uz, 256.0 ) / 255.0, floor( _uz / 256.0 ) / 255.0, _dz < -0.5 ? 1.0 : ( _slSky > 0.5 ? 0.5 : 0.0 ), 1.0 ); }\n' +   // _slFZ: the same slFragZone( - vViewPosition, normal ), computed once (§SOURCED_LIGHT_LINK)
        'if ( uSLParams.w > 5.5 && uSLParams.w < 6.5 ) { gl_FragColor = vec4( _slF, ( _slFZ > 0.5 && _slFZ < 65533.5 ) ? 1.0 : 0.0, _slSky, 1.0 ); }\n' +   // §SKY_VIEW_FIELD SKY_STEP readback: F_filtered
        'else if ( uSLParams.w > 1.5 ) { mat4 _vi = inverse( viewMatrix ); vec3 _wp = ( _vi * vec4( - vViewPosition, 1.0 ) ).xyz; vec3 _wn = normalize( ( _vi * vec4( normal, 0.0 ) ).xyz ); vec3 _q = _wp + _wn * 0.2;\n' +
        '  if ( uSLParams.w < 2.5 ) { float _r = slZoneAt( _q ); float _ur = _r < 0.0 ? 0.0 : _r; gl_FragColor = vec4( mod( _ur, 256.0 ) / 255.0, floor( _ur / 256.0 ) / 255.0, _r < 0.0 ? 1.0 : 0.0, 1.0 ); }\n' +
        '  else if ( uSLParams.w < 3.5 ) { vec3 _g = ( _q - uSLOrg.xyz ) / ( uSLParams.y * uSLDim.xyz ); gl_FragColor = vec4( clamp( _g, 0.0, 1.0 ), 1.0 ); }\n' +
        '  else if ( uSLParams.w > 4.5 ) { gl_FragColor = vec4( clamp( ( - vViewPosition ) / 40.0 + 0.5, 0.0, 1.0 ), 1.0 ); }\n' +
        '  else { gl_FragColor = vec4( length( vViewPosition ) / 10.0, length( _wp - cameraPosition ) / 10.0, clamp( ( _wp.y - uSLOrg.y ) / 20.0, 0.0, 1.0 ), 1.0 ); } }\n#endif\n'; ok++; }
    C.lights_pars_begin = PARS + C.lights_pars_begin;
    dummy = new THREE.Data3DTexture(new Uint16Array(2), 1, 1, 1);
    dummy.format = THREE.RGIntegerFormat; dummy.type = THREE.UnsignedShortType; dummy.internalFormat = 'RG16UI';   // §SOURCED_DAYLIGHT: RG16UI
    dummy.minFilter = dummy.magFilter = THREE.NearestFilter; dummy.generateMipmaps = false; dummy.unpackAlignment = 1; dummy.needsUpdate = true;
    ['standard', 'physical', 'lambert', 'phong', 'toon'].forEach(function (k) {
      var U = THREE.ShaderLib[k] && THREE.ShaderLib[k].uniforms; if (!U) return;
      // typed arrays are shared by reference through UniformsUtils.clone (only Color/Vector/Matrix/Texture are cloned)
      U.uSLParams = { value: P }; U.uSLOrg = { value: ORG }; U.uSLDim = { value: DIM }; U.uSLSky = { value: SKY }; U.uSLZone = { value: dummy };
      U.uSLPZ = { value: PZ }; U.uSLSZ = { value: SZ };
    });
    installed = true;
    // §SOURCED_LIGHT_LINK_FAIL — a patched program that fails to compile/link (e.g. a backend with fewer fragment uniform
    // vectors than §LIGHT_UNIFORM_BUDGET assumed) must not leave a broken scene: restore today's chunks, recompile every
    // material once, and stay off for the rest of the session (logged). Chained to any existing handler.
    global.__slLinkGuard = function (A) {
      if (!A || !A.renderer || !A.renderer.debug || A.renderer.debug.__slGuard) return;
      var prev = A.renderer.debug.onShaderError;
      A.renderer.debug.onShaderError = function (gl, program, vs, fs) {
        var info = ''; try { info = (gl.getProgramInfoLog(program) || '') + ' | ' + (gl.getShaderInfoLog(fs) || '').slice(0, 300); } catch (e) {}
        console.error('§SOURCED_LIGHT_LINK_FAIL ' + info.slice(0, 500) + ' — falling back to today\'s shaders (&sourced=0) for this session');
        fallback(A);
        if (prev) try { prev.apply(this, arguments); } catch (e2) {}
      };
      A.renderer.debug.__slGuard = true;
    };
    console.log('§SOURCED_LIGHT installed patchedLines=' + ok + '/8 (zone-once, point, spot, ambient, hemi, env irradiance, env radiance, zone-debug) — inert until an Alt+S stages it');
  }

  function dial(A, key, name, def, lo, hi) {
    var v = (typeof A[key] === 'number') ? A[key] : null;
    if (v == null) { var m = new RegExp('[?&]' + name + '=([0-9.]+)').exec(location.search); v = m ? parseFloat(m[1]) : def; }
    return Math.max(lo, Math.min(hi, isFinite(v) ? v : def));
  }

  // three's light order (WebGLLights.setup): the render list collects visible lights in scene traversal order, then a
  // stable sort puts shadow-casting (+2) and mapped (+1) lights first; point and spot arrays are filled in that order.
  function lightOrder(A, camera) {
    var L = [];
    (function walk(o) { if (o.visible === false) return; if (o.isLight && (!camera || o.layers.test(camera.layers))) L.push(o); for (var i = 0; i < o.children.length; i++) walk(o.children[i]); })(A.scene);
    L.sort(function (a, b) { return ((b.castShadow ? 2 : 0) + (b.map ? 1 : 0)) - ((a.castShadow ? 2 : 0) + (a.map ? 1 : 0)); });
    var pts = [], spots = []; L.forEach(function (l) { if (l.isPointLight) pts.push(l); else if (l.isSpotLight) spots.push(l); });
    return { pts: pts, spots: spots };
  }

  // light order is re-walked only when the scene's direct children change (lights are added/removed there); the lamp pool
  // moves lights between fixtures without adding any, so positions are re-read every render from the cached lists.
  var ordCache = null, ordKey = '';
  function bindLights(A, camera) {
    var key = A.scene.children.length + ':' + (camera ? camera.layers.mask : 0);
    if (!ordCache || key !== ordKey) { ordCache = lightOrder(A, camera); ordKey = key; }
    var LZ = global.LightZones, ord = ordCache, bp = 0, bs = 0, ub = 0, bo = 0;
    PZ.fill(0); SZ.fill(0);
    ord.pts.forEach(function (l, i) { if (i >= MAX_PL) return; var z = 0;
      if (l.userData && l.userData.sourcedZoneAt && l.userData.sourcedZoneAt.equals(l.position)) z = l.userData.sourcedZone;
      else { var v = LZ.atLamp(l.position); z = (v > 0 && v !== SOLID) ? v : ((v === 0 || v === -1) ? OUTSIDE : 0); l.userData.sourcedZone = z; l.userData.sourcedZoneAt = l.position.clone(); }
      if (l === A._camLight) z = 0;   // the camera fill travels with the eye: unbound (its own 4 m reach)
      PZ[i] = z; if (z > 0) { bp++; if (z === OUTSIDE && l.intensity > 0) bo++; } else if (l.intensity > 0) ub++; });
    ord.spots.forEach(function (l, i) { if (i >= MAX_SL) return; var z = 0;
      // §ZONE_OPEN_SKY: a portal whose cell is open to the sky or off the grid binds to OUTSIDE like a lamp (Clinic corridor
      // 2026-09-25: 4 of 19 portals sat in courtyard cells that the old rule sealed as a zone; unbound they lit the corridor
      // through its walls, the §METER read the leak and the corridor median moved 0.537 -> 0.457). Only a portal whose every
      // lookup is solid stays unbound.
      if (l.userData && l.userData.skyPortal && l.intensity > 0) { var v = LZ.at(l.position); if (v === SOLID) v = LZ.atLamp(l.position); z = (v > 0 && v !== SOLID) ? v : ((v === 0 || v === -1) ? OUTSIDE : 0); }
      SZ[i] = z; if (z > 0) bs++; });
    if (typeof A._slForcePZ === 'number') PZ.fill(A._slForcePZ);   // witness only: force every point light's zone
    A._slLastOrder = ord;
    return { points: ord.pts.length, pointsBound: bp, litOutside: bo, litUnbound: ub, spots: ord.spots.length, spotsBound: bs };
  }

  // §SUN_GLASS_CASTERS fix (gate item (d)): glass casts no sun shadow. Every visible mesh gets castShadow=true (tools.js
  // §S277b, effects.js _reassertPhotoShadowCoverage) and three's shadow pass has no transparency test, so pure-glass meshes
  // (all their materials glassy: the sky_portal.js test) cast a solid shadow: Hospital 3718 m2, Terminal 886 m2 incl. 713 m2
  // of glass roof, Clinic 497 m2 (witness_sun_glass_casters.js, 2026-09-25; 0 mixed glass+frame meshes found — §SURFACE_R10
  // split windows are already exempt). A depth material that discards every fragment keeps castShadow as is (no fight with
  // the reassert) and drops the glass from every shadow map. Alt+S only; restored at teardown. NOT alphaTest: r186's
  // WebGLShadowMap.getDepthMaterial copies the object material's alphaTest onto the depth material on every draw (glass: 0),
  // so an alphaTest discard is undone. This material's vertex shader puts every vertex outside the clip volume instead.
  var glassDepth = null, glassSet = [];
  function glassy(m) { return m && m.transparent && m.opacity < 0.95 && !m.map && m.type !== 'MeshBasicMaterial'; }
  function glassOn(A) {
    var THREE = global.THREE; glassOff(A, true);
    if (!glassDepth) { glassDepth = new THREE.ShaderMaterial({ vertexShader: 'void main() { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); }', fragmentShader: 'void main() { gl_FragColor = vec4( 1.0 ); }' }); glassDepth.userData.slGlassDiscard = true; }   // the fragment must write an output: ANGLE rejects a draw with none (GL_INVALID_OPERATION)
    var n = 0; A.scene.traverse(function (o) {
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.material || (o.userData && o.userData.skyPortal)) return;
      if (A._r10DepthMat && o.customDepthMaterial === A._r10DepthMat) return;
      var mats = Array.isArray(o.material) ? o.material : [o.material]; if (!mats.length || !mats.every(glassy)) return;
      glassSet.push([o, o.customDepthMaterial, o.customDistanceMaterial]); o.customDepthMaterial = glassDepth; o.customDistanceMaterial = glassDepth; n++; });
    if (A.renderer) A.renderer.shadowMap.needsUpdate = true;
    return n;
  }
  function glassOff(A, quiet) {
    if (!glassSet.length) return 0; var n = glassSet.length;
    glassSet.forEach(function (r) { r[0].customDepthMaterial = r[1]; r[0].customDistanceMaterial = r[2]; }); glassSet = [];
    if (A.renderer) A.renderer.shadowMap.needsUpdate = true;
    if (!quiet) console.log('§SUN_GLASS_CASTERS restored meshes=' + n);
    return n;
  }

  function push(A, m) {
    var Pp = A.renderer.properties.get(m), U = Pp && Pp.uniforms; if (!U || !U.uSLParams) return false;
    U.uSLParams.value = P; U.uSLOrg.value = ORG; U.uSLDim.value = DIM; if (U.uSLSky) U.uSLSky.value = SKY; U.uSLZone.value = (active && tex) ? tex : dummy; U.uSLPZ.value = PZ; U.uSLSZ.value = SZ;
    return true;
  }

  // §SOURCED_LIGHT_CAP — before the lamps are born (effects.js staging, right after §LIGHT_UNIFORM_BUDGET): build the zones
  // and read which zone the camera stands in and which zones the frame shows (12x7 ray grid, surface zone per hit). The
  // lamp cap (tools.js) then keeps camera-zone lamps first, then lamps in the visible zones, then the nearest (red1-4b:
  // "once lamps are zone-bound, list order is no longer defensible").
  // a mesh the GPU draws: some material visible, writing colour, not a fully transparent proxy (raycasts must skip pick
  // proxies / invisible helpers — they are never shaded; Clinic 2026-09-25: a 1.4 m hit where the frame shows a wall at 5.6 m)
  function drawnBy(o) { var ms = Array.isArray(o.material) ? o.material : [o.material]; return ms.some(function (m) { return m && m.visible !== false && m.colorWrite !== false && !(m.opacity === 0 && m.transparent); }); }
  function fallback(A) {
    if (linkFailed || !orig) return; linkFailed = true;
    var C = global.THREE.ShaderChunk; Object.keys(orig).forEach(function (k) { C[k] = orig[k]; });
    try { unstage(A, true); } catch (e) {}
    installed = false; P[0] = 0;
    var n = 0; A.scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m && !m.__slRe) { m.__slRe = true; m.needsUpdate = true; n++; } }); });
    if (A.markDirty) A.markDirty();
    console.log('§SOURCED_LIGHT_LINK_FAIL fallback: chunks restored, materials recompiling=' + n + ' (sourced off for this session)');
  }
  function prepare(A) {
    if (global.__slLinkGuard) global.__slLinkGuard(A);
    var THREE = global.THREE, LZ = global.LightZones; A._sourcedCap = null;
    if (!installed || !THREE || !LZ || !A || !A.scene || !A.camera) return;
    var t0 = performance.now(), hit = !!(LZ.get() && LZ.get().bld === A.activeBuilding), Z = LZ.build(A); if (!Z) return;
    var cam = A.camera.position, cz = LZ.at(cam); if (cz === SOLID) cz = LZ.atSurface(cam, { x: 0, y: 1, z: 0 });
    var tg = []; A.scene.traverse(function (o) { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && drawnBy(o) && o !== A._sky && !(o.userData && (o.userData.excludeFromShadow || o.userData.skyPortal))) tg.push(o); });
    var rc = new THREE.Raycaster(), vis = new Map(), M = new THREE.Matrix4(), mi = new THREE.Matrix4(), rays = 0, hits = 0;
    for (var gy = 0; gy < 7; gy++) for (var gx = 0; gx < 12; gx++) {
      rays++; rc.setFromCamera(new THREE.Vector2(-0.917 + gx * (1.833 / 11), -0.857 + gy * (1.714 / 6)), A.camera);
      var h = rc.intersectObjects(tg, false)[0]; if (!h || !h.face) continue; hits++;
      M.copy(h.object.matrixWorld); if (h.object.isInstancedMesh && h.instanceId != null) { h.object.getMatrixAt(h.instanceId, mi); M.multiply(mi); } else if (h.object.isBatchedMesh && h.batchId != null) { h.object.getMatrixAt(h.batchId, mi); M.multiply(mi); }
      var n = h.face.normal.clone().transformDirection(M); if (n.dot(rc.ray.direction) > 0) n.negate();
      var z = LZ.atSurface(h.point, n); if (z > 0 && z !== SOLID) vis.set(z, (vis.get(z) || 0) + 1);
    }
    A._sourcedCap = { camZone: (cz > 0 && cz !== SOLID) ? cz : 0, vis: vis };
    var top = Array.from(vis.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6).map(function (e) { return e[0] + ':' + e[1]; }).join(',');
    console.log('§SOURCED_LIGHT_CAP zonesCache=' + (hit ? 'hit' : 'built') + ' camZone=' + A._sourcedCap.camZone + ' visibleZones=' + vis.size + ' (' + top + ') rays=' + rays + ' hits=' + hits + ' ms=' + (performance.now() - t0).toFixed(0));
  }


  // ══ §SKY_VIEW_FIELD + §LUX_CHECK (bim-compiler PHOTOREAL_STILL_RENDER.md "§SKY_VIEW_FIELD — SPEC", "§LUX_CHECK", build
  // decisions V1-V10). The field is camera-free and cached per building (LightZones.field); G = F x 10000 is uploaded once per
  // building. Alt+S only: stage() never runs for films (A._maxqActive) — there is no film path.
  // V13: no film gate here — the field is BUILD (LightZones.field, per building, camera-free) + DECIDE (one filtered texel read
  // per fragment); the only gate is the staging call site (effects.js runs SourcedLight.stage for !A._maxqActive)
  function fieldOn(A) { return !!(installed && A && A._stillSkyField !== false && !/[?&]skyfield=0/.test(location.search)); }
  var rgFieldKey = null, statsKey = null, fieldStats = null;
  function lum3(c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
  function pct(arr, q) { if (!arr.length) return 0; var tot = arr.reduce(function (s, e) { return s + e[1]; }, 0), acc = 0; for (var i = 0; i < arr.length; i++) { acc += arr[i][1]; if (acc >= q * tot) return arr[i][0]; } return arr[arr.length - 1][0]; }
  // V9: EN 12464-1 Em,r rows quoted from the CEN enquiry draft prEN 12464-1 (July 2019); the 2021 final is not verified
  var EN_ROWS = [
    [/TOILET|\bWC\b|WASH|BATH|SHOWER|LOCKER|CLOAK|DRESS/i, '6.2.4 Cloakroom (area), washrooms, bathrooms, ... toilet areas', 200],
    [/CORRIDOR|CIRCULATION|HALLWAY|PASSAGE/i, '6.1.1 Corridors and circulation', 100],
    [/STAIR/i, '6.1.2 Stairs, escalators', 100],
    [/CANTEEN|CAFE|CAFÉ|BREAK|PANTRY|DINING/i, '6.2.1 Canteens and break areas', 200],
    [/WAITING|\bWAIT\b/i, '6.37.1 Waiting rooms (health care)', 200],
    [/LOUNGE/i, '6.28.3 Lounges', 200],
    [/ENTRANCE|LOBBY|FOYER|VEST/i, '6.28.1 Entrance halls (places of public assembly)', 100],
    [/STAFF OFFICE/i, '6.38.1 Staff office', 500],
    [/OFFICE/i, '6.26.2 Writing, typing, reading, data processing', 500],
    [/MECH|ELEC|PLANT|SWITCH/i, '6.3.1 Plant rooms, switch gear rooms', 200],
    [/ATRIUM/i, 'atrium (no row found)', null]];
  function spaceUses(A, Z) {
    var LZ = global.LightZones, rows = [], byZone = new Map(), src = 'none';
    try { rows = A.dbQuery("SELECT m.element_name, t.center_x, t.center_y, t.center_z FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.ifc_class = 'IfcSpace'") || []; if (rows.length) src = 'elements_meta'; } catch (e) {}
    if (!rows.length) { try { rows = A.dbQuery("SELECT name, center_x, center_y, center_z FROM spatial_structure WHERE type = 'IfcSpace' AND center_x IS NOT NULL") || []; if (rows.length) src = 'spatial_structure'; } catch (e2) {} }
    var mapped = 0; rows.forEach(function (r) { if (!A.ifc2three) return; var c = A.ifc2three(r[1], r[2], r[3]), z = LZ.at(c); if (!(z > 0) || z === LZ.SOLID) return;
      var row = null; for (var i = 0; i < EN_ROWS.length; i++) if (EN_ROWS[i][0].test(r[0] || '')) { row = EN_ROWS[i]; break; }
      var e = byZone.get(z); if (!e) { e = { names: {}, uses: {} }; byZone.set(z, e); } e.names[r[0]] = (e.names[r[0]] || 0) + 1; if (row) { e.uses[row[1]] = (e.uses[row[1]] || 0) + 1; mapped++; } });
    byZone.forEach(function (e) { var best = null, bn = 0; Object.keys(e.uses).forEach(function (k) { if (e.uses[k] > bn) { bn = e.uses[k]; best = k; } });
      e.use = best; e.en = null; if (best) EN_ROWS.forEach(function (r) { if (r[1] === best) e.en = r[2]; }); });
    return { byZone: byZone, spaces: rows.length, mapped: mapped, src: src };
  }
  function computeStats(A, Z, F) {
    var LZ = global.LightZones, nx = Z.nx, ny = Z.ny, nxy = nx * ny, N = Z.zone.length, zone = Z.zone, G = F.G, cl = Z.cell, up = Math.floor(0.8 / cl) * nx, nzn = Z.zones;
    var floorN = new Int32Array(nzn + 1), wpN = new Int32Array(nzn + 1), wpF = new Float64Array(nzn + 1), allF = new Float64Array(nzn + 1), allN = new Int32Array(nzn + 1), samp = [];
    for (var z0 = 0; z0 <= nzn; z0++) samp.push([]);
    for (var c = nx; c < N; c++) { var v = zone[c]; if (v === LZ.SOLID || v === 0) continue; var z = v & LZ.ZONE_MASK; allF[z] += G[c]; allN[z]++;
      if (zone[c - nx] !== LZ.SOLID) continue; floorN[z]++; var w = c + up; if (w < N && zone[w] !== LZ.SOLID && (zone[w] & LZ.ZONE_MASK) === z) { wpN[z]++; wpF[z] += G[w]; samp[z].push(w); } }
    var zones = [];
    for (var zi = 1; zi <= nzn; zi++) { var info = Z.zoneInfo[zi - 1], s = samp[zi], st = Math.max(1, Math.ceil(s.length / 64)), pick = [];
      for (var q = 0; q < s.length; q += st) pick.push(s[q]);
      zones[zi] = { z: zi, floorM2: floorN[zi] * cl * cl, wpCells: wpN[zi], Fwp: wpN[zi] ? wpF[zi] / wpN[zi] / 10000 : 0, Fmean: allN[zi] ? allF[zi] / allN[zi] / 10000 : 0, enclosed: info.apertureM2 === 0, samples: pick }; }
    return { zones: zones, uses: spaceUses(A, Z) };
  }
  function stageField(A, Z) {
    var LZ = global.LightZones, SP = global.SkyPortal, t0 = performance.now();
    if (!fieldOn(A) || !LZ.field) { SKY[0] = 0; console.log('§SKY_VIEW_FIELD off (' + (A._maxqActive ? 'film' : '&skyfield=0 / APP._stillSkyField=false') + ') — binary SKY_BIT path'); return null; }
    var hit = !!Z.field, F = LZ.field(A), key = texKey, uploadMs = 0;
    if (rgFieldKey !== key) { for (var i = 0; i < F.G.length; i++) rg[i * 2 + 1] = F.G[i]; var tU = performance.now(); tex.needsUpdate = true; A.renderer.initTexture(tex); uploadMs = performance.now() - tU; rgFieldKey = key; }
    SKY[0] = 1;
    if (statsKey !== key) { fieldStats = computeStats(A, Z, F); statsKey = key; }
    var S = fieldStats, lit = [], enc = [], maxWp = 0;
    S.zones.forEach(function (r) { if (!r || !(r.Fwp > 0) || !r.floorM2) return; lit.push([r.Fwp, r.floorM2]); if (r.enclosed) enc.push([r.Fwp, r.floorM2]); if (r.Fwp > maxWp) maxWp = r.Fwp; });
    lit.sort(function (a, b) { return a[0] - b[0]; }); enc.sort(function (a, b) { return a[0] - b[0]; });
    var dist = function (a) { return a.length ? 'n=' + a.length + ' p10/p50/p90/max=' + [pct(a, 0.1), pct(a, 0.5), pct(a, 0.9), a[a.length - 1][0]].map(function (v) { return (100 * v).toFixed(2); }).join('/') + '%' : 'n=0'; };
    var gm = (Z.glassMats || []).map(function (g) { return g.name + ':op' + g.opacity + ':T' + g.T + ':' + g.m2.toFixed(0) + 'm2'; });
    console.log('§SKY_VIEW_FIELD on cache=' + (hit ? 'hit' : 'built') + ' dirs=' + F.dirs + ' minElevDeg=' + F.minElevDeg.toFixed(2) + ' (CIE overcast weights, cos x (1+2 sin elev) x dOmega; lowest-weight dir ' + Math.min.apply(null, F.weights) + ') sweepMs=' + F.ms +
      ' activeCells=' + F.active + ' coveredCells=' + F.covered + ' glassCells=' + Z.glassCells + ' maxF=' + F.maxF.toFixed(4) + ' (sky component max ' + F.maxSC.toFixed(4) + ') ' + (F.maxF <= 1 ? 'ASSERT_MAXF_LE_1 PASS' : 'ASSERT_MAXF_LE_1 FAIL') +
      ' irc(zones/median/max)=' + F.irc.zones + '/' + (100 * F.irc.median).toFixed(3) + '%/' + (100 * F.irc.max).toFixed(2) + '% (V12, R 0.5)' +
      ' uploadMs=' + uploadMs.toFixed(0) + ' glassT=[' + gm.join(',') + '] ERC=ground term scaled by F only (externally reflected component not modelled) ms=' + (performance.now() - t0).toFixed(0));
    console.log('§SKY_VIEW_FIELD_DIST (working-plane mean F per lit zone, floor-m2 weighted) all: ' + dist(lit) + ' · enclosed rooms (no open aperture): ' + dist(enc) + ' · maxZoneWpF=' + (100 * maxWp).toFixed(2) + '%');
    // G2 / spec 6: F-weighted mean unoccluded direction per zone (bent normal), LOG ONLY — the largest zones by floor m2 + camera zone
    var cz = (A._sourcedCap && A._sourcedCap.camZone) || 0, order = S.zones.filter(function (r) { return r && r.floorM2 > 0; }).sort(function (a, b) { return b.floorM2 - a.floorM2; }).slice(0, 12);
    if (cz && S.zones[cz] && order.indexOf(S.zones[cz]) < 0) order.push(S.zones[cz]);
    console.log('§SKY_VIEW_FIELD_BENT (log only) [zone:unit dir x,y,z:floorM2] ' + order.map(function (r) { var b = F.bent, x = b[r.z * 3], y = b[r.z * 3 + 1], zz = b[r.z * 3 + 2], m = Math.sqrt(x * x + y * y + zz * zz) || 1;
      return r.z + ':' + [x / m, y / m, zz / m].map(function (v) { return v.toFixed(2); }).join(',') + ':' + r.floorM2.toFixed(0); }).join(' '));
    // spec 8: ADF only as a cross-check per enclosed glazed zone
    try { var D = LZ.daylight(A, new Set(), new Set(), true), rowsA = [];
      D.zs.forEach(function (q, z) { var r = S.zones[z], zi = Z.zoneInfo[z - 1]; if (!r || zi.apertureM2 !== 0 || !(q.vert + q.roof > 0)) return; rowsA.push([z, 100 * r.Fwp, q.DF, r.floorM2]); });
      rowsA.sort(function (a, b) { return b[3] - a[3]; }); var rat = rowsA.filter(function (r) { return r[2] > 0; }).map(function (r) { return r[1] / r[2]; }).sort(function (a, b) { return a - b; });
      console.log('§SKY_VIEW_ADF_CHECK enclosedGlazedZones=' + rowsA.length + ' median(Fwp%/ADF%)=' + (rat.length ? rat[Math.floor(rat.length / 2)].toFixed(3) : '-') + ' (ADF logged only, not used) top [zone:Fwp%:ADF%:floorM2] ' +
        rowsA.slice(0, 10).map(function (r) { return r[0] + ':' + r[1].toFixed(2) + ':' + r[2].toFixed(2) + ':' + r[3].toFixed(0); }).join(' ')); } catch (eA) { console.warn('§SKY_VIEW_ADF_CHECK failed: ' + eA.message); }
    return { F: F, stats: S };
  }
  // §LUX_CHECK — per zone, lux on the working plane: sky (F_wp x the scene's horizontal sky illuminance) + zone-bound lamps (V9)
  function luxCheck(A, Z) {
    if (!fieldLast) return null;
    var S = fieldLast.stats, LZ = global.LightZones, sunI = A._stillCalibSunI, sunLux = A._stillCalibSunLux || 100000;
    if (!(sunI > 0)) { console.log('§LUX_CHECK VACUOUS no calibrated sun (calibSunI=' + sunI + ')'); return null; }
    var luxPer = sunLux / sunI, h = A.hemi, am = A.ambient, EskyU = (h ? lum3(h.color) * h.intensity : 0) + (am ? lum3(am.color) * am.intensity : 0), EskyLux = EskyU * luxPer;
    var lamps = new Map(); A.scene.traverse(function (l) { if (!l.isPointLight || !l.visible || !(l.intensity > 0) || l === A._camLight) return; var z = l.userData && l.userData.sourcedZone; if (!(z > 0)) return; var a = lamps.get(z); if (!a) { a = []; lamps.set(z, a); } a.push(l); });
    var nx = Z.nx, nxy = nx * Z.ny, cl = Z.cell, rows = [], fails = [], counts = { withEN: 0, fail: 0, unknown: 0, unverified: 0 };
    var att = function (d, cut, decay) { var f = 1 / Math.max(Math.pow(d, decay), 0.01); if (cut > 0) { var x = Math.max(0, Math.min(1, 1 - Math.pow(d / cut, 4))); f *= x * x; } return f; };
    S.zones.forEach(function (r) { if (!r || !r.wpCells) return; var L = lamps.get(r.z) || [], El = 0;
      if (L.length && r.samples.length) { r.samples.forEach(function (c) { var px = Z.org.x + (c % nx + 0.5) * cl, py = Z.org.y + ((((c / nx) | 0) % Z.ny) + 0.5) * cl, pz = Z.org.z + (((c / nxy) | 0) + 0.5) * cl;
          L.forEach(function (l) { var dx = l.position.x - px, dy = l.position.y - py, dz = l.position.z - pz, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3; if (dy <= 0) return; El += lum3(l.color) * l.intensity * att(d, l.distance, l.decay) * dy / d; }); });
        El = El / r.samples.length * luxPer; }
      var u = S.uses.byZone.get(r.z), Es = r.Fwp * EskyLux, Et = Es + El, en = u ? u.en : null, verdict = !u || !u.use ? 'unknown' : (en == null ? 'unverified' : (Et < 0.5 * en ? 'FAIL' : 'PASS'));
      if (verdict === 'unknown') counts.unknown++; else if (verdict === 'unverified') counts.unverified++; else { counts.withEN++; if (verdict === 'FAIL') counts.fail++; }
      var row = { z: r.z, floorM2: r.floorM2, Fwp: r.Fwp, Esky: Es, Elamps: El, Etotal: Et, lamps: L.length, use: u ? u.use : null, en: en, verdict: verdict, why: verdict === 'FAIL' ? (Es < 0.5 * en && El < 0.5 * en ? (L.length ? 'lamps under EN and sky share low' : 'no zone lamps, sky share low') : '') : '' };
      rows.push(row); if (verdict === 'FAIL') fails.push(row); });
    var fmt = function (r) { return r.z + ':' + (r.use || 'unknown') + ':EN' + (r.en == null ? '-' : r.en) + (r.en != null ? '(prEN2019)' : '') + ':sky' + r.Esky.toFixed(0) + '+lamps' + r.Elamps.toFixed(0) + '=' + r.Etotal.toFixed(0) + 'lx:F' + (100 * r.Fwp).toFixed(2) + '%:lamps' + r.lamps + ':' + r.floorM2.toFixed(0) + 'm2:' + r.verdict + (r.why ? '(' + r.why + ')' : ''); };
    var byM2 = rows.slice().sort(function (a, b) { return b.floorM2 - a.floorM2; });
    console.log('§LUX_CHECK zones=' + rows.length + ' spaces=' + S.uses.spaces + ' (' + S.uses.src + ', mapped ' + S.uses.mapped + ') withEN=' + counts.withEN + ' FAIL=' + counts.fail + ' unverified=' + counts.unverified + ' unknown=' + counts.unknown +
      ' EskyH=' + EskyLux.toFixed(0) + 'lx (hemi+ambient up, luxPerUnit=' + luxPer.toFixed(1) + ' = ' + sunLux + ' lx / calibSunI ' + sunI.toFixed(3) + ') exposure=' + A.renderer.toneMappingExposure.toFixed(3) +
      (A._meterLast ? ' stops=' + A._meterLast.stops.toFixed(2) : ' stops=0 (meter: outside/off)') + ' largest [' + byM2.slice(0, 8).map(fmt).join(' ') + '] FAILrows [' + fails.slice(0, 20).map(fmt).join(' ') + ']');
    var cz = (A._sourcedCap && A._sourcedCap.camZone) || 0, cr = rows.filter(function (r) { return r.z === cz; })[0];
    console.log('§LUX_CHECK_CAM camZone=' + cz + ' ' + (cr ? fmt(cr) : '(no working-plane cells / camera not in a zone)') + ' exposure=' + A.renderer.toneMappingExposure.toFixed(3) + (A._meterLast ? ' stops=' + A._meterLast.stops.toFixed(2) : ''));
    luxLast = { rows: rows, EskyLux: EskyLux, luxPer: luxPer };
    return luxLast;
  }


  function stage(A) {
    var THREE = global.THREE, LZ = global.LightZones;
    if (!installed || !THREE || !LZ || !A || !A.scene || !A.renderer) { console.log('§SOURCED_LIGHT skipped installed=' + installed + ' zones=' + !!LZ); return; }
    unstage(A, true);
    var t0 = performance.now(), hit = !!(LZ.get() && LZ.get().bld === A.activeBuilding);
    var Z = LZ.build(A); if (!Z) { console.log('§SOURCED_LIGHT skipped (no light zones)'); return; }
    var key = Z.bld + ':' + Z.nx + 'x' + Z.ny + 'x' + Z.nz + ':' + Z.zones;
    if (texKey !== key) {
      if (tex) tex.dispose(); rgFieldKey = null;
      // §SOURCED_DAYLIGHT: RG16UI — R = zone | SKY_BIT (as before), G = the still's daylight fraction x 10000 (0 until daylight())
      if (rgKey !== key) { rg = new Uint16Array(Z.zone.length * 2); for (var ri = 0; ri < Z.zone.length; ri++) rg[ri * 2] = Z.zone[ri]; rgKey = key; }
      tex = new THREE.Data3DTexture(rg, Z.nx, Z.ny, Z.nz);
      tex.format = THREE.RGIntegerFormat; tex.type = THREE.UnsignedShortType; tex.internalFormat = 'RG16UI';
      tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.unpackAlignment = 1; tex.needsUpdate = true; texKey = key;
      // §SOURCED_LIGHT_GLERR — any GL error standing before the upload, raised by the upload, and after the first patched frame
      try { var gl = A.renderer.getContext(), e0 = gl.getError(); A.renderer.initTexture(tex); var e1 = gl.getError();
        console.log('§SOURCED_LIGHT_GLERR upload before=' + e0 + ' after=' + e1 + ' (0 = none; 1282 = INVALID_OPERATION) RG16UI ' + Z.nx + 'x' + Z.ny + 'x' + Z.nz); } catch (eG) { console.warn('§SOURCED_LIGHT_GLERR upload probe failed: ' + eG.message); }
      glErrFirstFrame = true;
    }
    try { fieldLast = stageField(A, Z); } catch (eD) { fieldLast = null; SKY[0] = 0; console.warn('§SKY_VIEW_FIELD failed: ' + eD.message); }
    var keep = dial(A, '_stillIndoorSky', 'indoorsky', 0, 0, 1);   // principle 1: indoors no flat ambient / hemi (0)
    console.log('§SOURCED_LIGHT_DIALS indoorSky=' + keep + ' skyField=' + (SKY[0] > 0.5 ? 'on' : 'off') + ' (&skyfield=0 = the binary SKY_BIT path)');
    P[0] = 1; P[1] = Z.cell; P[2] = keep; P[3] = 0;
    ORG[0] = Z.org.x; ORG[1] = Z.org.y; ORG[2] = Z.org.z; DIM[0] = Z.nx; DIM[1] = Z.ny; DIM[2] = Z.nz;
    active = true;
    var set = new Set(); A.scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m) set.add(m); }); });
    var pushed = 0; set.forEach(function (m) { if (push(A, m)) pushed++; });
    var b = bindLights(A, A.camera);
    var gl = /[?&]glassshadow=1/.test(location.search) ? 0 : glassOn(A);   // &glassshadow=1 = glass casts as before (A/B)
    console.log('§SUN_GLASS_CASTERS fixed pureGlassMeshes=' + gl + ' (depth pass discards them: sun + portal shadows pass through glass)' + (gl ? '' : ' — &glassshadow=1 or none found'));
    prevOBR = A.scene.onBeforeRender; var progN = -2, pushes = 0; ordCache = null;
    var own = function (renderer, scene, camera) {
      if (active) {
        var bb = bindLights(A, camera);
        // re-push only when a program was built (a recompile clones fresh uniforms from ShaderLib; typed arrays stay shared)
        var np = (renderer && renderer.info && renderer.info.programs) ? renderer.info.programs.length : -1;
        if (np !== progN) { progN = np; var seen = new Set(); A.scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m && !seen.has(m)) { seen.add(m); push(A, m); } }); }); pushes++; }
        var line = '§SOURCED_LIGHT_BIND points=' + bb.points + ' bound=' + bb.pointsBound + ' (litOutside=' + bb.litOutside + ') litUnbound=' + bb.litUnbound + ' spots=' + bb.spots + ' portalsBound=' + bb.spotsBound;
        if (line !== lastLog) { lastLog = line; console.log(line); }
      }
      if (prevOBR) prevOBR.apply(this, arguments);
    };
    own._sourced = true; A.scene.onBeforeRender = own;
    var prevOAR = A.scene.onAfterRender;
    A.scene.onAfterRender = function () { if (glErrFirstFrame) { glErrFirstFrame = false; try { console.log('§SOURCED_LIGHT_GLERR firstFrame=' + A.renderer.getContext().getError()); } catch (e) {} }
      A.scene.onAfterRender = prevOAR || function () {}; if (prevOAR) prevOAR.apply(this, arguments); };
    // §METER — inside = the camera stands in a light zone (else effects.js's _stillCamInside answer, passed in A._stillCamInsideNow)
    var inside = (A._sourcedCap && A._sourcedCap.camZone > 0) ? true : !!A._stillCamInsideNow;
    if (!/[?&]meter=0/.test(location.search) && A._stillMeter !== false) { try { A._meterLast = meter(A, inside); } catch (eM) { console.warn('§METER failed: ' + eM.message); } }
    else console.log('§METER off (&meter=0) exposure=' + A.renderer.toneMappingExposure.toFixed(3));
    try { luxCheck(A, Z); } catch (eL) { console.warn('§LUX_CHECK failed: ' + eL.message); }
    if (A.markDirty) A.markDirty();
    console.log('§SOURCED_LIGHT on zonesCache=' + (hit ? 'hit' : 'built') + ' zones=' + Z.zones + ' grid=' + Z.nx + 'x' + Z.ny + 'x' + Z.nz + ' cell=' + Z.cell +
      ' texMB=' + (Z.zone.length * 2 / 1e6).toFixed(1) + ' indoorSky=' + keep + ' mats=' + set.size + ' pushed=' + pushed + ' points=' + b.points + ' bound=' + b.pointsBound + ' (litOutside=' + b.litOutside + ')' +
      ' litUnbound=' + b.litUnbound + ' spots=' + b.spots + ' portalsBound=' + b.spotsBound + ' ms=' + (performance.now() - t0).toFixed(0));
  }

  // ══ §METER — exposure follows the scene's own metered light indoors (watchdog ruling (A), 2026-09-25) ══
  // Physically calibrated lamps (§SOURCED_LIGHT_CALIB) put an interior at 0.5-2% of the sunlit ground; a camera meters and
  // opens up. The meter reads the SOURCED frame's INCIDENT light: one small float render with a white Lambert override
  // (albedo 1, so L = E / pi — three's Lambert), sky / lamp glows / sprites / points / glass hidden; the log-average over
  // the lit surfaces (Reinhard et al. 2002, "Photographic Tone Reproduction for Digital Images", eq. 1: exp(mean(log(delta
  // + x)))) gives Ein. Reference Eout = the scene's own outdoor light on a horizontal surface (sun x sin(elevation) + sky).
  // Albedo cancels: a surface of albedo rho displays ~ exposure * rho * E. PARTIAL adaptation (red1: "you won't see a
  // washed room, just more lighted"): perceived brightness follows Stevens' power law B ~ L^0.33 (S. S. Stevens, "On the
  // psychophysical law", Psychol. Rev. 64, 1957; brightness exponent 0.33), so an interior keeps (Ein/Eout)^0.33 of its
  // ratio to outdoors: exposure = base * (Ein / Eout)^(0.33 - 1). Camera outside: base exactly. (A first cut compared
  // albedo-weighted luminance with a 0.18 middle grey: white rooms metered 4x high and got no boost — replaced.)
  var METER_W = 160, METER_H = 90, STEVENS = 0.33, METER_MAX_STOPS = 10, meterSaved = null, meterMat = null;
  function meterRead(A, opts) {
    var THREE = global.THREE, R = A.renderer, t0 = performance.now(), hidden = [];
    A.scene.traverse(function (o) { if (!o.visible) return;
      var ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : null;
      var glow = o.isSprite || o.isPoints || o.isLine || o === A._sky || (ms && ms.every(function (m) { return !m || m.isMeshBasicMaterial || m.isShaderMaterial || (m.transparent && m.opacity < 0.95); }));
      if (glow && (o.isMesh || o.isSprite || o.isPoints || o.isLine || o.isInstancedMesh || o.isBatchedMesh)) { o.visible = false; hidden.push(o); } });
    var rt = new THREE.WebGLRenderTarget(METER_W, METER_H, { type: THREE.FloatType, depthBuffer: true });
    if (!meterMat) meterMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    var prevRT = R.getRenderTarget(), prevBg = A.scene.background, prevFog = A.scene.fog, prevOv = A.scene.overrideMaterial, cc = new THREE.Color(), ca = R.getClearAlpha(); R.getClearColor(cc);
    var buf = new Float32Array(METER_W * METER_H * 4);
    try { A.scene.background = null; A.scene.fog = null; A.scene.overrideMaterial = meterMat; R.setClearColor(0x000000, 0); R.setRenderTarget(rt);
      // the override material is not in the scene, so the per-render push never reaches it: render once (builds its programs),
      // push the zone texture + uniforms into each built program, render again (Clinic 2026-09-25: unpushed, the meter saw every
      // fragment as OUTSIDE — hemi 0.728 of 0.728, lamps ~0)
      R.clear(true, true, true); R.render(A.scene, A.camera); push(A, meterMat);
      R.clear(true, true, true); R.render(A.scene, A.camera); R.readRenderTargetPixels(rt, 0, 0, METER_W, METER_H, buf); }
    finally { R.setRenderTarget(prevRT); A.scene.background = prevBg; A.scene.fog = prevFog; A.scene.overrideMaterial = prevOv; R.setClearColor(cc, ca); hidden.forEach(function (o) { o.visible = true; }); rt.dispose(); }
    // weights per pixel. 'avg' = every lit pixel alike. 'centre' = CENTRE-WEIGHTED, the default metering mode of real
    // cameras: 75% of the weight inside the centre circle, 25% over the rest; circle 8 mm (default) on a 36 x 24 mm frame
    // (Nikonians Wiki, "C-W (Center-Weighted) Metering"; Wikipedia "Nikon D3500": "75% of the 8mm circle in the center"),
    // i.e. a circle one third of the frame height across. 'zone' = only pixels whose surface is in the
    // camera's own light zone (world position from a second override render -> LightZones.at).
    var mode = opts && opts.mode || 'avg', wz = null;
    if (mode === 'zone' && global.LightZones && global.LightZones.get()) wz = zoneMask(A, hidden, opts.camZone);
    var n = 0, sw = 0, sl = 0, delta = 1e-4, inC = 0, cx = METER_W / 2, cy = METER_H / 2, rC = METER_H / 6;
    for (var i2 = 0; i2 < METER_W * METER_H; i2++) { if (buf[i2 * 4 + 3] >= 0.5) { var px = i2 % METER_W, py = (i2 / METER_W) | 0; if ((px + 0.5 - cx) * (px + 0.5 - cx) + (py + 0.5 - cy) * (py + 0.5 - cy) <= rC * rC) inC++; } }
    var nLit = 0; for (var i3 = 0; i3 < METER_W * METER_H; i3++) if (buf[i3 * 4 + 3] >= 0.5) nLit++;
    for (var i = 0; i < METER_W * METER_H; i++) {
      if (buf[i * 4 + 3] < 0.5) continue; var L = 0.2126 * buf[i * 4] + 0.7152 * buf[i * 4 + 1] + 0.0722 * buf[i * 4 + 2]; if (!isFinite(L)) continue;
      var w = 1;
      if (mode === 'centre') { var qx = i % METER_W, qy = (i / METER_W) | 0, inside = (qx + 0.5 - cx) * (qx + 0.5 - cx) + (qy + 0.5 - cy) * (qy + 0.5 - cy) <= rC * rC;
        w = inside ? 0.75 / Math.max(1, inC) : 0.25 / Math.max(1, nLit - inC); }
      else if (mode === 'zone') { w = wz ? (wz[i] ? 1 : 0) : 1; }
      if (!w) continue; sl += w * Math.log(delta + Math.max(0, L)); sw += w; n++; }
    return { Ein: sw ? Math.PI * Math.exp(sl / sw) : null, pixels: n, mode: mode, hidden: hidden.length, ms: performance.now() - t0 };   // white Lambert: E = pi * L
  }
  // world position per meter pixel (override MeshBasicMaterial writing its world position into the float target), then the
  // light zone at 0.3 m toward the camera; returns a 0/1 mask of pixels in camZone.
  var worldMat = null;
  function zoneMask(A, hidden, camZone) {
    var THREE = global.THREE, R = A.renderer, LZ = global.LightZones;
    if (!worldMat) { worldMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      worldMat.onBeforeCompile = function (sh) {
        sh.vertexShader = 'varying vec3 vSLW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvec4 _slw = vec4( transformed, 1.0 );\n#ifdef USE_BATCHING\n\t_slw = batchingMatrix * _slw;\n#endif\n#ifdef USE_INSTANCING\n\t_slw = instanceMatrix * _slw;\n#endif\n\tvSLW = ( modelMatrix * _slw ).xyz;');
        sh.fragmentShader = 'varying vec3 vSLW;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor = vec4( vSLW, 1.0 );'); };
      worldMat.customProgramCacheKey = function () { return 'slWorldPos'; }; }
    var rt = new THREE.WebGLRenderTarget(METER_W, METER_H, { type: THREE.FloatType, depthBuffer: true }), buf = new Float32Array(METER_W * METER_H * 4);
    var prevRT = R.getRenderTarget(), prevOv = A.scene.overrideMaterial, prevBg = A.scene.background, prevTM = R.toneMapping, cc = new THREE.Color(), ca = R.getClearAlpha(); R.getClearColor(cc);
    hidden.forEach(function (o) { o.visible = false; });
    try { A.scene.overrideMaterial = worldMat; A.scene.background = null; R.toneMapping = THREE.NoToneMapping; R.setClearColor(0x000000, 0); R.setRenderTarget(rt); R.clear(true, true, true); R.render(A.scene, A.camera); R.readRenderTargetPixels(rt, 0, 0, METER_W, METER_H, buf); }
    finally { R.setRenderTarget(prevRT); A.scene.overrideMaterial = prevOv; A.scene.background = prevBg; R.toneMapping = prevTM; R.setClearColor(cc, ca); hidden.forEach(function (o) { o.visible = true; }); rt.dispose(); }
    var cam = A.camera.position, mask = new Uint8Array(METER_W * METER_H), hit = 0;
    for (var i = 0; i < METER_W * METER_H; i++) { if (buf[i * 4 + 3] < 0.5) continue;
      var x = buf[i * 4], y = buf[i * 4 + 1], z = buf[i * 4 + 2], dx = cam.x - x, dy = cam.y - y, dz = cam.z - z, dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var v = LZ.at({ x: x + dx / dl * 0.3, y: y + dy / dl * 0.3, z: z + dz / dl * 0.3 }); if (v === camZone) { mask[i] = 1; hit++; } }
    console.log('§METER zoneMask camZone=' + camZone + ' pixelsInZone=' + hit);
    return mask;
  }
  function outdoorE(A) {
    var sd = A.sun ? A.sun.position.clone().normalize() : null, sinE = sd ? Math.max(0, sd.y) : 0, sunI = A.sun ? A.sun.intensity : 0;
    var skyL = A.hemi ? (0.2126 * A.hemi.color.r + 0.7152 * A.hemi.color.g + 0.0722 * A.hemi.color.b) * A.hemi.intensity : 0;
    var E = sunI * sinE + skyL, note = '';
    if (sinE <= 0.02) { E = sunI * Math.SQRT1_2 + skyL; note = ' (sun below horizon: reference = the same sun at 45 deg)'; }
    return { E: E, sunI: sunI, sinE: sinE, skyL: skyL, note: note };
  }
  function meter(A, inside) {
    var R = A.renderer, base = R.toneMappingExposure;
    if (!inside) { console.log('§METER camera=outside exposure=' + base.toFixed(3) + ' stops=0 (base ' + base.toFixed(3) + ', unchanged outside)'); return null; }
    var mode = (/[?&]metermode=(avg|centre|zone)/.exec(location.search) || [])[1] || A._stillMeterMode || 'avg';   // watchdog 2026-09-25: frame average by default (centre and zone each worse on one reference)
    var m = meterRead(A, { mode: mode, camZone: (A._sourcedCap && A._sourcedCap.camZone) || 0 });
    if (!m.Ein) { console.log('§METER camera=inside VACUOUS no lit surface pixels — exposure unchanged ' + base.toFixed(3)); return null; }
    var o = outdoorE(A), ratio = m.Ein / o.E;
    var exp = base * Math.pow(ratio, STEVENS - 1), stops = Math.log2(exp / base);
    if (stops < 0) { exp = base; stops = 0; } if (stops > METER_MAX_STOPS) { exp = base * Math.pow(2, METER_MAX_STOPS); stops = METER_MAX_STOPS; }
    meterSaved = { exp: base }; R.toneMappingExposure = exp;
    console.log('§METER camera=inside logAvgEin=' + m.Ein.toExponential(3) + ' Eout=' + o.E.toFixed(3) + ' (sun ' + o.sunI.toFixed(2) + ' x sinElev ' + o.sinE.toFixed(3) + ' + sky ' + o.skyL.toFixed(3) + ')' + o.note +
      ' mode=' + m.mode + ' indoor/outdoor=' + ratio.toExponential(3) + ' stevens=' + STEVENS + ' exposure=' + exp.toFixed(3) + ' stops=' + stops.toFixed(2) + ' (base ' + base.toFixed(3) + ') pixels=' + m.pixels + '/' + (METER_W * METER_H) + ' hidden=' + m.hidden + ' ms=' + m.ms.toFixed(0));
    return { exposure: exp, stops: stops, Ein: m.Ein, Eout: o.E };
  }
  function meterOff(A) { if (meterSaved && A.renderer) { A.renderer.toneMappingExposure = meterSaved.exp; console.log('§METER off exposure=' + meterSaved.exp.toFixed(3)); } meterSaved = null; }

  function unstage(A, quiet) {
    if (!quiet) A._sourcedCap = null;
    glassOff(A, quiet); meterOff(A);
    if (!active) return;
    active = false; P[0] = 0;
    if (A.scene.onBeforeRender && A.scene.onBeforeRender._sourced) A.scene.onBeforeRender = prevOBR || function () {};
    prevOBR = null; lastLog = '';
    A.scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m) push(A, m); }); });
    if (A.markDirty) A.markDirty();
    if (!quiet) console.log('§SOURCED_LIGHT off (uSLParams.x=0, zone texture kept for the next press)');
  }

  global.SourcedLight = { fieldOn: fieldOn, field: function () { return fieldLast; }, lux: function () { return luxLast; }, meterRead: meterRead, installed: function () { return installed; }, debugZones: function (on) { P[3] = on === true ? 1 : (+on || 0); }, install: install, prepare: prepare, stage: stage, unstage: unstage, isActive: function () { return active; } };
})(typeof window !== 'undefined' ? window : this);
