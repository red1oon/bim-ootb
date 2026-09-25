// ══ §SOURCED_LIGHT — surfaces lit by their real sources only (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md
// "§SOURCED_LIGHT — SPEC" + "GATE ADDITIONS" + "BUILD LOG + SPEC CHANGE"; watchdog red1-4b gates) ══
// red1: "light cannot leak through walls in real life except through glass." Every lamp (PointLight) and sky portal
// (SpotLight) is bound to the LIGHT ZONE it sits in (light_zones.js: connected empty space of the voxelised building);
// a fragment is lit by a light only when both are in the same zone. Indoors (fragment in a zone > 0) the flat ambient
// and the hemi sky are scaled to uSLParams.z (0 = only real sources). Outside and unknown cells: unchanged.
// install() patches THREE.ShaderChunk ONCE (scene.js, next to §SKY_OCCLUSION), before any material compiles. With
// uSLParams.x = 0 (nav, and every page until an Alt+S stages it) slPass() returns 1: the picture is unchanged.
// &sourced=0 skips the install entirely (today's shaders, for red1's A/B).
(function (global) {
  var MAX_PL = 256, MAX_SL = 64, SOLID = 65535, OUTSIDE = 65534;   // OUTSIDE: a light (or fragment) off the building's zones
  var installed = false, active = false, prevOBR = null, tex = null, dummy = null, texKey = null, lastLog = '';
  var P = new Float32Array(4), ORG = new Float32Array(4), DIM = new Float32Array(4);
  var PZ = new Float32Array(MAX_PL), SZ = new Float32Array(MAX_SL);   // zone per point / spot light, in three's light order

  var PARS = [
    '#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON )',
    'uniform vec4 uSLParams; uniform vec4 uSLOrg; uniform vec4 uSLDim; uniform highp usampler3D uSLZone;',
    '#if NUM_POINT_LIGHTS > 0', 'uniform vec4 uSLPZ[ ( NUM_POINT_LIGHTS + 3 ) / 4 ];', '#endif',
    '#if NUM_SPOT_LIGHTS > 0', 'uniform vec4 uSLSZ[ ( NUM_SPOT_LIGHTS + 3 ) / 4 ];', '#endif',
    'float _slFZ = -2.0;',
    // raw cell: -1 off grid, 65535 solid, 0 outside, 1.. zone
    'float slZoneAt( vec3 w ) {',
    '  ivec3 c = ivec3( floor( ( w - uSLOrg.xyz ) / uSLParams.y ) );',
    '  if ( any( lessThan( c, ivec3( 0 ) ) ) || any( greaterThanEqual( c, ivec3( uSLDim.xyz ) ) ) ) return -1.0;',
    '  return float( texelFetch( uSLZone, c, 0 ).r );',
    '}',
    // fragment zone: step +0.2/+0.5/+0.8 m along the normal, first non-solid cell. Outside (0) and off the grid -> OUTSIDE
    // (65534); all three solid -> -1 = unknown (lit as today)
    'float slFragZone( vec3 posView, vec3 nView ) {',
    '  if ( _slFZ > -1.5 ) return _slFZ;',
    '  mat4 vi = inverse( viewMatrix );',
    // IFC meshes often wind inward: face the normal toward the eye first (the side the viewer sees), then try the far side
    '  vec3 nf = ( dot( nView, - posView ) < 0.0 ) ? - nView : nView;',
    '  vec3 wp = ( vi * vec4( posView, 1.0 ) ).xyz; vec3 wn = normalize( ( vi * vec4( nf, 0.0 ) ).xyz );',
    '  float z = 65535.0;',
    '  for ( int s = 0; s < 3; s ++ ) { z = slZoneAt( wp + wn * ( 0.2 + 0.3 * float( s ) ) ); if ( z != 65535.0 ) break; }',
    '  if ( z == 65535.0 ) { for ( int s = 0; s < 3; s ++ ) { z = slZoneAt( wp - wn * ( 0.2 + 0.3 * float( s ) ) ); if ( z != 65535.0 ) break; } }',
    // same fallback as LightZones.atSurface: 0.5 m / 1 m along the surface's two tangents at +0.5 m along the normal (a wall
    // strip under a ceiling panel sits in the panel's solid 0.5 m cell layer: Clinic corridor, 2026-09-25, 70 of 71 leaks)
    '  if ( z == 65535.0 ) {',
    '    vec3 t1 = ( abs( wn.y ) > 0.7 ) ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 );',
    '    vec3 t2 = ( abs( wn.y ) > 0.7 ) ? vec3( 0.0, 0.0, 1.0 ) : normalize( vec3( - wn.z, 0.0, wn.x ) );',
    '    for ( int k = 0; k < 8; k ++ ) {',
    '      float r = ( k < 4 ) ? 0.5 : 1.0; int a = k - ( k / 4 ) * 4;',
    '      vec3 e = ( a == 0 ) ? t1 : ( ( a == 1 ) ? - t1 : ( ( a == 2 ) ? t2 : - t2 ) );',
    '      z = slZoneAt( wp + wn * 0.5 + e * r ); if ( z != 65535.0 ) break;',
    '    }',
    '  }',
    '  _slFZ = ( z == 65535.0 ) ? -1.0 : ( ( z < 0.5 ) ? 65534.0 : z );',
    '  return _slFZ;',
    '}',
    // a bound light (lz >= 1, OUTSIDE included) reaches only fragments of its own zone; unbound (0) and unknown: as today
    'float slPass( float lz, vec3 posView, vec3 nView ) {',
    '  if ( uSLParams.x < 0.5 || lz < 0.5 ) return 1.0;',
    '  float fz = slFragZone( posView, nView );',
    '  return ( fz < -0.5 || abs( fz - lz ) < 0.5 ) ? 1.0 : 0.0;',
    '}',
    'float slSkyKeep( vec3 posView, vec3 nView ) {',
    '  if ( uSLParams.x < 0.5 ) return 1.0;',
    '  float fz = slFragZone( posView, nView );',
    '  return ( fz > 0.5 && fz < 65533.5 ) ? uSLParams.z : 1.0;',
    '}',
    '#else',
    'float slPass( float lz, vec3 posView, vec3 nView ) { return 1.0; }',
    'float slSkyKeep( vec3 posView, vec3 nView ) { return 1.0; }',
    '#endif', ''].join('\n');

  function install(THREE) {
    if (installed) return;
    if (/[?&]sourced=0/.test(location.search)) { console.log('§SOURCED_LIGHT not installed (&sourced=0 — today\'s shaders)'); return; }
    if (!THREE || !THREE.ShaderChunk) { console.warn('§SOURCED_LIGHT install skipped: THREE.ShaderChunk missing'); return; }
    var C = THREE.ShaderChunk, ok = 0, fb = C.lights_fragment_begin;
    var p0 = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
    if (fb.indexOf(p0) >= 0) { fb = fb.replace(p0, p0 + '\n\t\tdirectLight.color *= slPass( uSLPZ[ UNROLLED_LOOP_INDEX / 4 ][ UNROLLED_LOOP_INDEX - ( UNROLLED_LOOP_INDEX / 4 ) * 4 ], geometryPosition, geometryNormal );'); ok++; }
    var s0 = 'getSpotLightInfo( spotLight, geometryPosition, directLight );';
    if (fb.indexOf(s0) >= 0) { fb = fb.replace(s0, s0 + '\n\t\tdirectLight.color *= slPass( uSLSZ[ UNROLLED_LOOP_INDEX / 4 ][ UNROLLED_LOOP_INDEX - ( UNROLLED_LOOP_INDEX / 4 ) * 4 ], geometryPosition, geometryNormal );'); ok++; }
    var a0 = 'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );';
    if (fb.indexOf(a0) >= 0) { fb = fb.replace(a0, 'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor ) * slSkyKeep( geometryPosition, geometryNormal );'); ok++; }
    var h0 = 'irradiance += getHemisphereLightIrradiance(';   // also matches the §SKY_OCCLUSION-patched line
    if (fb.indexOf(h0) >= 0) { fb = fb.replace(h0, 'irradiance += slSkyKeep( geometryPosition, geometryNormal ) * getHemisphereLightIrradiance('); ok++; }
    C.lights_fragment_begin = fb;
    // §SOURCED_LIGHT_ZONE_DEBUG (witness only): uSLParams.w = 1 writes the fragment's zone as the colour, after every other
    // output chunk (R = zone mod 256, G = zone / 256, B = 1 when unknown), so a readback compares shader zones with the CPU.
    if (C.dithering_fragment && C.dithering_fragment.indexOf('uSLParams') < 0) {
      C.dithering_fragment = C.dithering_fragment + '\n#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON )\n' +
        'if ( uSLParams.w > 0.5 && uSLParams.w < 1.5 ) { float _dz = slFragZone( - vViewPosition, normal ); float _uz = _dz < -0.5 ? 0.0 : _dz; gl_FragColor = vec4( mod( _uz, 256.0 ) / 255.0, floor( _uz / 256.0 ) / 255.0, _dz < -0.5 ? 1.0 : 0.0, 1.0 ); }\n' +
        'if ( uSLParams.w > 1.5 ) { mat4 _vi = inverse( viewMatrix ); vec3 _wp = ( _vi * vec4( - vViewPosition, 1.0 ) ).xyz; vec3 _wn = normalize( ( _vi * vec4( normal, 0.0 ) ).xyz ); vec3 _q = _wp + _wn * 0.2;\n' +
        '  if ( uSLParams.w < 2.5 ) { float _r = slZoneAt( _q ); float _ur = _r < 0.0 ? 0.0 : _r; gl_FragColor = vec4( mod( _ur, 256.0 ) / 255.0, floor( _ur / 256.0 ) / 255.0, _r < 0.0 ? 1.0 : 0.0, 1.0 ); }\n' +
        '  else if ( uSLParams.w < 3.5 ) { vec3 _g = ( _q - uSLOrg.xyz ) / ( uSLParams.y * uSLDim.xyz ); gl_FragColor = vec4( clamp( _g, 0.0, 1.0 ), 1.0 ); }\n' +
        '  else if ( uSLParams.w > 4.5 ) { gl_FragColor = vec4( clamp( ( - vViewPosition ) / 40.0 + 0.5, 0.0, 1.0 ), 1.0 ); }\n' +
        '  else { gl_FragColor = vec4( length( vViewPosition ) / 10.0, length( _wp - cameraPosition ) / 10.0, clamp( ( _wp.y - uSLOrg.y ) / 20.0, 0.0, 1.0 ), 1.0 ); } }\n#endif\n'; ok++; }
    C.lights_pars_begin = PARS + C.lights_pars_begin;
    dummy = new THREE.Data3DTexture(new Uint16Array(1), 1, 1, 1);
    dummy.format = THREE.RedIntegerFormat; dummy.type = THREE.UnsignedShortType; dummy.internalFormat = 'R16UI';
    dummy.minFilter = dummy.magFilter = THREE.NearestFilter; dummy.generateMipmaps = false; dummy.unpackAlignment = 1; dummy.needsUpdate = true;
    ['standard', 'physical', 'lambert', 'phong', 'toon'].forEach(function (k) {
      var U = THREE.ShaderLib[k] && THREE.ShaderLib[k].uniforms; if (!U) return;
      // typed arrays are shared by reference through UniformsUtils.clone (only Color/Vector/Matrix/Texture are cloned)
      U.uSLParams = { value: P }; U.uSLOrg = { value: ORG }; U.uSLDim = { value: DIM }; U.uSLZone = { value: dummy };
      U.uSLPZ = { value: PZ }; U.uSLSZ = { value: SZ };
    });
    installed = true;
    console.log('§SOURCED_LIGHT installed patchedLines=' + ok + '/5 (point, spot, ambient, hemi, zone-debug) — inert until an Alt+S stages it');
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
      if (l.userData && l.userData.skyPortal && l.intensity > 0) { var v = LZ.at(l.position); if (v === SOLID) v = LZ.atLamp(l.position); z = (v > 0 && v !== SOLID) ? v : 0; }   // a portal outside the zones stays unbound
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
    if (!glassDepth) { glassDepth = new THREE.ShaderMaterial({ vertexShader: 'void main() { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); }', fragmentShader: 'void main() { discard; }' }); glassDepth.userData.slGlassDiscard = true; }
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
    U.uSLParams.value = P; U.uSLOrg.value = ORG; U.uSLDim.value = DIM; U.uSLZone.value = (active && tex) ? tex : dummy; U.uSLPZ.value = PZ; U.uSLSZ.value = SZ;
    return true;
  }

  // §SOURCED_LIGHT_CAP — before the lamps are born (effects.js staging, right after §LIGHT_UNIFORM_BUDGET): build the zones
  // and read which zone the camera stands in and which zones the frame shows (12x7 ray grid, surface zone per hit). The
  // lamp cap (tools.js) then keeps camera-zone lamps first, then lamps in the visible zones, then the nearest (red1-4b:
  // "once lamps are zone-bound, list order is no longer defensible").
  // a mesh the GPU draws: some material visible, writing colour, not a fully transparent proxy (raycasts must skip pick
  // proxies / invisible helpers — they are never shaded; Clinic 2026-09-25: a 1.4 m hit where the frame shows a wall at 5.6 m)
  function drawnBy(o) { var ms = Array.isArray(o.material) ? o.material : [o.material]; return ms.some(function (m) { return m && m.visible !== false && m.colorWrite !== false && !(m.opacity === 0 && m.transparent); }); }
  function prepare(A) {
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

  function stage(A) {
    var THREE = global.THREE, LZ = global.LightZones;
    if (!installed || !THREE || !LZ || !A || !A.scene || !A.renderer) { console.log('§SOURCED_LIGHT skipped installed=' + installed + ' zones=' + !!LZ); return; }
    unstage(A, true);
    var t0 = performance.now(), hit = !!(LZ.get() && LZ.get().bld === A.activeBuilding);
    var Z = LZ.build(A); if (!Z) { console.log('§SOURCED_LIGHT skipped (no light zones)'); return; }
    var key = Z.bld + ':' + Z.nx + 'x' + Z.ny + 'x' + Z.nz + ':' + Z.zones;
    if (texKey !== key) {
      if (tex) tex.dispose();
      tex = new THREE.Data3DTexture(Z.zone, Z.nx, Z.ny, Z.nz);
      tex.format = THREE.RedIntegerFormat; tex.type = THREE.UnsignedShortType; tex.internalFormat = 'R16UI';
      tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.unpackAlignment = 1; tex.needsUpdate = true; texKey = key;
    }
    var keep = dial(A, '_stillIndoorSky', 'indoorsky', 0, 0, 1);   // principle 1: indoors no flat ambient / hemi (0)
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
    if (A.markDirty) A.markDirty();
    console.log('§SOURCED_LIGHT on zonesCache=' + (hit ? 'hit' : 'built') + ' zones=' + Z.zones + ' grid=' + Z.nx + 'x' + Z.ny + 'x' + Z.nz + ' cell=' + Z.cell +
      ' texMB=' + (Z.zone.length * 2 / 1e6).toFixed(1) + ' indoorSky=' + keep + ' mats=' + set.size + ' pushed=' + pushed + ' points=' + b.points + ' bound=' + b.pointsBound + ' (litOutside=' + b.litOutside + ')' +
      ' litUnbound=' + b.litUnbound + ' spots=' + b.spots + ' portalsBound=' + b.spotsBound + ' ms=' + (performance.now() - t0).toFixed(0));
  }

  function unstage(A, quiet) {
    if (!quiet) A._sourcedCap = null;
    glassOff(A, quiet);
    if (!active) return;
    active = false; P[0] = 0;
    if (A.scene.onBeforeRender && A.scene.onBeforeRender._sourced) A.scene.onBeforeRender = prevOBR || function () {};
    prevOBR = null; lastLog = '';
    A.scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m) push(A, m); }); });
    if (A.markDirty) A.markDirty();
    if (!quiet) console.log('§SOURCED_LIGHT off (uSLParams.x=0, zone texture kept for the next press)');
  }

  global.SourcedLight = { debugZones: function (on) { P[3] = on === true ? 1 : (+on || 0); }, install: install, prepare: prepare, stage: stage, unstage: unstage, isActive: function () { return active; } };
})(typeof window !== 'undefined' ? window : this);
