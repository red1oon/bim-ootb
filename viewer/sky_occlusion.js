// ══ §SKY_OCCLUSION — covered surfaces do not see the open sky (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md
// "§SKY_OCCLUSION spec") ══ red1, 2026-09-24: "indoor floor too bright, not taking in shadows". The hemi sky and the
// env map light every up-facing floor as if it stood under open sky. At Alt+S one top-down depth map says what is
// covered; the hemi irradiance, env irradiance and env radiance of a covered fragment are scaled to `keep`.
// install() patches THREE.ShaderChunk ONCE, right after three loads (loader.js), before any material compiles; with
// uSkyOcc = 0 (nav, films) skyOccVis() returns 1 and the picture is unchanged.
(function (global) {
  var MAP_SIZE = 2048, LOOKUP_OFF = 0.5, BIAS_M = 0.3;
  var installed = false, rt = null, cam = null, active = false, vals = null, mats = [], prevOBR = null;

  var PARS = [
    '#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON )',
    'uniform float uSkyOcc; uniform sampler2D uSkyOccMap; uniform mat4 uSkyOccMat;',
    'uniform float uSkyOccKeep; uniform float uSkyOccBias; uniform float uSkyOccTexel;',
    'float _skyOccCache = -1.0;',
    'float skyOccVis( vec3 nView ) {',
    '  if ( uSkyOcc < 0.5 ) return 1.0;',
    '  if ( _skyOccCache >= 0.0 ) return _skyOccCache;',
    '  mat4 vi = inverse( viewMatrix );',
    '  vec3 wp = ( vi * vec4( - vViewPosition, 1.0 ) ).xyz;',
    '  vec3 wn = normalize( ( vi * vec4( nView, 0.0 ) ).xyz );',
    '  vec4 c = uSkyOccMat * vec4( wp + wn * ' + LOOKUP_OFF.toFixed(2) + ', 1.0 );',
    '  vec3 q = c.xyz / c.w * 0.5 + 0.5;',
    '  if ( q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0 ) { _skyOccCache = 1.0; return 1.0; }',
    '  float cov = 0.0;',
    '  for ( int i = -1; i <= 1; i ++ ) for ( int j = -1; j <= 1; j ++ ) {',
    '    float d = texture2D( uSkyOccMap, q.xy + vec2( float( i ), float( j ) ) * uSkyOccTexel ).r;',
    '    cov += ( d < q.z - uSkyOccBias ) ? 1.0 : 0.0;',
    '  }',
    '  _skyOccCache = mix( 1.0, uSkyOccKeep, cov / 9.0 );',
    '  return _skyOccCache;',
    '}',
    '#else',
    'float skyOccVis( vec3 nView ) { return 1.0; }',
    '#endif', ''].join('\n');

  function install(THREE) {
    if (installed) return;
    // OPT-IN (2026-09-24, measured): on by default it (a) left the lamp-lit floor as bright as before, (b) turned
    // ceilings black, (c) slowed refine 8 s -> 26-80 s, and its uniforms add to a light-uniform budget already at the
    // limit. Installed only when the URL carries &skyocc=, so without it no shader changes at all.
    if (!/[?&]skyocc=/.test(location.search)) { console.log('§SKY_OCCLUSION not installed (opt-in: add &skyocc=0.15)'); return; }
    if (!THREE || !THREE.ShaderChunk) { console.warn('§SKY_OCCLUSION install skipped: THREE.ShaderChunk missing'); return; }
    var C = THREE.ShaderChunk, ok = 0;
    var h0 = 'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );';
    if (C.lights_fragment_begin.indexOf(h0) >= 0) { C.lights_fragment_begin = C.lights_fragment_begin.replace(h0,
      'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * skyOccVis( geometryNormal );'); ok++; }
    var e0 = 'iblIrradiance += getIBLIrradiance( geometryNormal );';
    if (C.lights_fragment_maps.indexOf(e0) >= 0) { C.lights_fragment_maps = C.lights_fragment_maps.replace(e0,
      'iblIrradiance += getIBLIrradiance( geometryNormal ) * skyOccVis( geometryNormal );'); ok++; }
    var r0 = 'radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );';
    if (C.lights_fragment_maps.indexOf(r0) >= 0) { C.lights_fragment_maps = C.lights_fragment_maps.replace(r0,
      'radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness ) * skyOccVis( geometryNormal );'); ok++; }
    C.lights_pars_begin = PARS + C.lights_pars_begin;
    ['standard', 'physical', 'lambert', 'phong', 'toon'].forEach(function (k) {
      var U = THREE.ShaderLib[k] && THREE.ShaderLib[k].uniforms; if (!U) return;
      U.uSkyOcc = { value: 0 }; U.uSkyOccMap = { value: null }; U.uSkyOccMat = { value: new THREE.Matrix4() };
      U.uSkyOccKeep = { value: 0.15 }; U.uSkyOccBias = { value: 0 }; U.uSkyOccTexel = { value: 1 / MAP_SIZE };
    });
    installed = true;
    console.log('§SKY_OCCLUSION installed patchedLines=' + ok + '/3 (hemi, env irradiance, env radiance) — inert until an Alt+S sets uSkyOcc');
  }

  function dial(A) {
    var v = (typeof A._stillSkyOcc === 'number') ? A._stillSkyOcc : null;
    if (v == null) { var m = /[?&]skyocc=([0-9.]+)/.exec(location.search); v = m ? parseFloat(m[1]) : 0.15; }
    return Math.max(0, Math.min(1, isFinite(v) ? v : 0.15));
  }

  // Push the current values into one material's live program uniforms (a recompile re-clones them from ShaderLib).
  function push(A, m) {
    var P = A.renderer.properties.get(m), U = P && P.uniforms; if (!U || !U.uSkyOcc) return false;
    U.uSkyOcc.value = active ? 1 : 0;
    if (active) { U.uSkyOccMap.value = vals.map; U.uSkyOccMat.value.copy(vals.mat); U.uSkyOccKeep.value = vals.keep; U.uSkyOccBias.value = vals.bias; U.uSkyOccTexel.value = vals.texel; }
    return true;
  }

  function stage(A) {
    var THREE = global.THREE; if (!installed || !THREE || !A || !A.scene || !A.renderer) { console.log('§SKY_OCCLUSION skipped installed=' + installed); return; }
    unstage(A);
    var t0 = performance.now(), keep = dial(A);
    if (keep >= 1) { console.log('§SKY_OCCLUSION off skyocc=1 (keep everything)'); return; }
    // Envelope: every visible opaque mesh's world bounds.
    var box = new THREE.Box3(), hidden = [], ob = new THREE.Box3(), badBoxes = 0;
    A.scene.traverse(function (o) {
      if (!o.visible) return;
      var ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : null;
      var glassOnly = ms && ms.every(function (m) { return m && m.transparent && m.opacity < 0.95; });
      if (o.isSprite || o.isLine || o.isPoints || o === A._sky || o === A.ground || (o.isMesh && glassOnly) || (o.userData && o.userData.skyPortal)) {
        if (o.isMesh || o.isSprite || o.isLine || o.isPoints) { o.visible = false; hidden.push(o); }
        return;
      }
      if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.geometry) {
        if (o.isInstancedMesh || o.isBatchedMesh) { if (o.computeBoundingBox) { o.computeBoundingBox(); if (o.boundingBox) ob.copy(o.boundingBox).applyMatrix4(o.matrixWorld); else ob.makeEmpty(); } }
        else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); ob.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); }
        // a zero-scaled / empty batch gives a NaN or infinite box: never let it poison the envelope
        if (!ob.isEmpty() && isFinite(ob.min.x + ob.min.y + ob.min.z + ob.max.x + ob.max.y + ob.max.z)) box.union(ob); else badBoxes++;
      }
    });
    if (box.isEmpty()) { hidden.forEach(function (o) { o.visible = true; }); console.log('§SKY_OCCLUSION skipped (empty envelope)'); return; }
    var ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), half = Math.max(sz.x, sz.z) / 2 + 2;
    cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, sz.y + 20);
    cam.position.set(ctr.x, box.max.y + 10, ctr.z); cam.up.set(0, 0, -1); cam.lookAt(ctr.x, box.min.y - 10, ctr.z);
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    rt = new THREE.WebGLRenderTarget(MAP_SIZE, MAP_SIZE, { depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(MAP_SIZE, MAP_SIZE); rt.depthTexture.type = THREE.FloatType;
    var R = A.renderer, prevRT = R.getRenderTarget(), prevOv = A.scene.overrideMaterial, prevBg = A.scene.background, prevSU = R.shadowMap.needsUpdate, prevAuto = R.shadowMap.autoUpdate;
    var depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    try {
      R.shadowMap.autoUpdate = false; R.shadowMap.needsUpdate = false;
      A.scene.overrideMaterial = depthMat; A.scene.background = null;
      R.setRenderTarget(rt); R.clear(true, true, true); R.render(A.scene, cam);
    } finally {
      R.setRenderTarget(prevRT); A.scene.overrideMaterial = prevOv; A.scene.background = prevBg;
      R.shadowMap.autoUpdate = prevAuto; R.shadowMap.needsUpdate = prevSU;
      hidden.forEach(function (o) { o.visible = true; });
      depthMat.dispose();
    }
    vals = { map: rt.depthTexture, mat: new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
      keep: keep, bias: BIAS_M / (cam.far - cam.near), texel: 1 / MAP_SIZE };   // ortho depth is linear 0..1 over near..far
    // Every material in the scene; values pushed now and before every render (scene.onBeforeRender).
    var set = new Set(); A.scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m) set.add(m); }); });
    mats = Array.from(set); active = true;
    var pushed = 0; mats.forEach(function (m) { if (push(A, m)) pushed++; });
    prevOBR = A.scene.onBeforeRender;
    // Every render: every material now in the scene (lamps, R10 and triplanar variants can appear after staging).
    A.scene.onBeforeRender = function () {
      if (active) { var seen = new Set(); A.scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m && !seen.has(m)) { seen.add(m); push(A, m); } }); }); mats = Array.from(seen); }
      if (prevOBR) prevOBR.apply(this, arguments);
    };
    // coveredFrac: of a 64x64 grid of plan points on the envelope's floor level, how many have geometry above them.
    var cf = coveredFrac(A, THREE, R);
    if (A.markDirty) A.markDirty();
    console.log('§SKY_OCCLUSION map=' + MAP_SIZE + ' texel=' + (2 * half / MAP_SIZE).toFixed(3) + 'm span=' + (2 * half).toFixed(0) + 'm height=' + sz.y.toFixed(0) +
      'm keep=' + keep + ' hiddenInPass=' + hidden.length + ' mats=' + mats.length + ' pushedNow=' + pushed + ' badBoxesSkipped=' + badBoxes + ' coveredFrac=' + cf + ' ms=' + (performance.now() - t0).toFixed(0));
  }

  // Share of the envelope's plan that is covered (depth at that texel is above the lowest level + 3 m). Read back once.
  function coveredFrac(A, THREE, R) {
    try {
      var N = 64, buf = new Float32Array(4), cov = 0, tot = 0, low = cam.position.y - (cam.far - cam.near);
      var rt2 = new THREE.WebGLRenderTarget(N, N, { type: THREE.FloatType });
      var mat = new THREE.ShaderMaterial({ uniforms: { tDepth: { value: rt.depthTexture } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D tDepth; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tDepth, vUv).r, 0.0, 0.0, 1.0); }' });
      var q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), sc = new THREE.Scene(); sc.add(q);
      var prev = R.getRenderTarget(); R.setRenderTarget(rt2); R.render(sc, cam); R.setRenderTarget(prev);
      var px = new Float32Array(N * N * 4); R.readRenderTargetPixels(rt2, 0, 0, N, N, px);
      for (var i = 0; i < N * N; i++) { var d = px[i * 4]; if (d >= 1) continue; tot++; var y = cam.position.y - (cam.near + d * (cam.far - cam.near)); if (y > low + 13) cov++; }
      rt2.dispose(); mat.dispose(); q.geometry.dispose();
      return tot ? (cov / tot).toFixed(3) + ' (of ' + tot + ' built plan cells, top surface > 3 m above the lowest level)' : 'n/a';
    } catch (e) { return 'n/a (' + e.message + ')'; }
  }

  function unstage(A) {
    if (!active && !rt) return;
    active = false;
    mats.forEach(function (m) { push(A, m); });
    if (prevOBR !== null || A.scene.onBeforeRender) A.scene.onBeforeRender = prevOBR || function () {};
    prevOBR = null; mats = [];
    if (rt) { rt.depthTexture.dispose(); rt.dispose(); rt = null; }
    vals = null; cam = null;
    if (A.markDirty) A.markDirty();
    console.log('§SKY_OCCLUSION off (materials back to uSkyOcc=0, map disposed)');
  }

  global.SkyOcc = { install: install, stage: stage, unstage: unstage };
})(typeof window !== 'undefined' ? window : this);
