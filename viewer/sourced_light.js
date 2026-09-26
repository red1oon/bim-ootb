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
  // §GROUND_VIEW_FIELD: a second 3D texture, R16UI over light_zones' own Gd array (no interleaved copy: nothing to drop, §ZONE_TEX_CPU_DROP)
  var gtex = null, gKey = null, dGround = null;
  function groundTex3D(THREE, data, w, h, d) { var t = new THREE.Data3DTexture(data, w, h, d); t.format = THREE.RedIntegerFormat; t.type = THREE.UnsignedShortType; t.internalFormat = 'R16UI'; t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true; return t; }
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
    // §GROUND_VIEW_FIELD: R16UI, Gd x 10000 per cell (light_zones.js groundBuild); uSLSky.y = 1 when staged with the ground field
    'uniform highp usampler3D uSLGround;',
    '#if NUM_POINT_LIGHTS > 0', 'uniform vec4 uSLPZ[ ( NUM_POINT_LIGHTS + 3 ) / 4 ];', '#endif',
    '#if NUM_SPOT_LIGHTS > 0', 'uniform vec4 uSLSZ[ ( NUM_SPOT_LIGHTS + 3 ) / 4 ];', '#endif',
    // the fragment's zone, set ONCE by the line §SOURCED_LIGHT_LINK inserts into lights_fragment_begin; -1 = unknown (lit as today)
    'float _slFZ = -1.0;',
    // the fragment's sky class, set with _slFZ: 1 = sees the sky (open cell / sky-lit covered cell / off grid), 0 = covered or unknown
    'float _slSky = 1.0;',
    // §SKY_VIEW_FIELD: the fragment's filtered sky-view F (trilinear over same-zone / open cells, once per fragment with _slFZ)
    'float _slF = 1.0;',
    // §GROUND_VIEW_FIELD: the fragment's filtered ground-view Gd (the same 8-texel filter and zone rule as _slF, once per fragment)
    'float _slGd = 1.0;',
    // §LAMP_UNCAPPED: every lamp as data (uSLLampT: 2 texels per lamp), clustered over the zone grid (uSLClu: offset/count per
    // cluster, uSLLIdx: the flat lamp index list); _slWP = the fragment's world position, set by slFragZone
    'uniform vec4 uSLLamp; uniform vec4 uSLCluDim; uniform highp sampler2D uSLLampT; uniform highp usampler2D uSLLIdx; uniform highp usampler3D uSLClu;',
    // §COVE_LIGHT: per-cell cove irradiance, TWO Lambert lobes in one RGBA8UI texel (log-8 magnitudes, per-build range in
    // uSLCoveQ.xy): R = |V| (the DOWN lobe: the ceiling patches the strips wash, re-radiating toward floor and walls — Arvo's
    // irradiance vector, its direction octahedral in G|B<<8) and A = U (the UP lobe: the strips' own upward emission reaching
    // downward-facing surfaces — the ceiling, duct undersides). Read through the same 8-texel stencil as _slF; the fragment's
    // term is max( 0, N . V ) + U x max( 0, -N.y ): directional, cell-varying, 0 outside cove zones / in nav / unknown zone.
    // uSLCoveP.rgb = the cove colour (0xffe4b5, luminance-normalised), .w = 1 on / 0 off; uSLCoveQ = ( lnMin, lnRange, 0, 0 ).
    'uniform vec4 uSLCoveP; uniform vec4 uSLCoveQ; uniform highp usampler3D uSLCove;',
    'float _slCove = 0.0;',
    'float slLog8( uint c ) { return ( c == 0u ) ? 0.0 : exp( uSLCoveQ.x + uSLCoveQ.y * float( c - 1u ) / 254.0 ); }',
    'vec3 slOctDec( uint g ) { vec2 e = vec2( float( g & 255u ), float( ( g >> 8u ) & 255u ) ) / 255.0 * 2.0 - 1.0; vec3 v = vec3( e.x, 1.0 - abs( e.x ) - abs( e.y ), e.y );',
    '  float t = max( - v.y, 0.0 ); v.x += ( v.x >= 0.0 ) ? - t : t; v.z += ( v.z >= 0.0 ) ? - t : t; return normalize( v ); }',
    'vec3 _slWP = vec3( 0.0 );',
    'float _slLN = -1.0; float _slLNP = 0.0;',   // §LAMP_UNCAPPED_COST readback: the fragment's list length / lamps passing the zone test
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
    '  vec3 wp = ( vi * vec4( posView, 1.0 ) ).xyz; vec3 wn = normalize( ( vi * vec4( nf, 0.0 ) ).xyz ); _slWP = wp;',
    '  ivec3 c0 = ivec3( floor( ( wp + wn * 0.25 - uSLOrg.xyz ) / uSLParams.y ) ); ivec3 dim = ivec3( uSLDim.xyz );',
    '  if ( any( lessThan( c0, ivec3( 0 ) ) ) || any( greaterThanEqual( c0, dim ) ) ) { _slSky = 1.0; return 65534.0; }',
    '  float best = 1e30; uint bt = 65535u; uint bg = 0u; ivec3 bcc = c0;',
    '  for ( int dz = -1; dz <= 1; dz ++ ) { for ( int dy = -1; dy <= 1; dy ++ ) { for ( int dx = -1; dx <= 1; dx ++ ) {',
    '    ivec3 c = c0 + ivec3( dx, dy, dz );',
    '    if ( any( lessThan( c, ivec3( 0 ) ) ) || any( greaterThanEqual( c, dim ) ) ) continue;',
    '    uvec2 t2 = texelFetch( uSLZone, c, 0 ).rg; uint t = t2.r; if ( t == 65535u ) continue;',
    '    vec3 e = uSLOrg.xyz + ( vec3( c ) + 0.5 ) * uSLParams.y - wp; if ( dot( e, wn ) <= 0.0 ) continue;',
    '    float l = dot( e, e ); if ( l < best ) { best = l; bt = t; bg = t2.g; bcc = c; }',
    '  } } }',
    '  if ( bt == 65535u ) { bt = 0u; bg = 0u; for ( int j = 1; j < 4096; j ++ ) { ivec3 c = c0 + ivec3( 0, j, 0 ); if ( c.y >= dim.y ) break;',
    '    uvec2 t2 = texelFetch( uSLZone, c, 0 ).rg; if ( t2.r != 65535u ) { bt = t2.r; bg = t2.g; bcc = c; break; } if ( c.y == dim.y - 1 ) bt = 65535u; } }',
    '  if ( bt == 65535u ) { _slSky = 0.0; _slF = 0.0; _slGd = 0.0; return -1.0; }',
    '  uint z = bt & 0x3FFFu; _slSky = ( z == 0u || ( bt & 0x4000u ) != 0u ) ? 1.0 : 0.0;',
    // §SKY_VIEW_FIELD V5 — irradiance-volume filter (Greger et al. 1998): 8 texels around wp + 0.5 cell along the eye-facing
    // normal, trilinear weights, kept only when not SOLID and in the fragment's zone or open; renormalised; none -> picked cell
    // outside fragments are filtered too (their stencil accepts every non-solid cell), so a surface running from open air
    // under a roof edge has no step where its nearest cell flips from open to covered (SKY_STEP out-zone pairs, 2026-09-25);
    // one solid cell still separates: the stencil reaches at most half a cell past the surface
    '  _slF = 1.0; _slCove = 0.0;',
    '  if ( uSLSky.x > 0.5 || uSLCoveP.w > 0.5 ) {',   // §COVE_LIGHT rides the same stencil (a cove without the sky field, &skyfield=0, still reads)
    '    vec3 g = ( wp + wn * 0.5 * uSLParams.y - uSLOrg.xyz ) / uSLParams.y - 0.5; ivec3 b = ivec3( floor( g ) ); vec3 f = g - vec3( b ); float sw = 0.0, sf = 0.0, sg = 0.0; bool gv = uSLSky.y > 0.5; bool cv = uSLCoveP.w > 0.5; vec3 sc = vec3( 0.0 ); float su = 0.0;',
    '    for ( int o = 0; o < 8; o ++ ) { ivec3 d = ivec3( o & 1, ( o >> 1 ) & 1, ( o >> 2 ) & 1 ); ivec3 c = b + d;',
    '      if ( any( lessThan( c, ivec3( 0 ) ) ) || any( greaterThanEqual( c, dim ) ) ) continue;',
    '      uvec2 t2 = texelFetch( uSLZone, c, 0 ).rg; if ( t2.r == 65535u ) continue; uint tz = t2.r & 0x3FFFu; if ( z != 0u && tz != z && tz != 0u ) continue;',
    '      vec3 wv = mix( vec3( 1.0 ) - f, f, vec3( d ) ); float w = wv.x * wv.y * wv.z; sw += w; sf += w * float( t2.g ) / 10000.0;',
    '      if ( gv ) sg += w * float( texelFetch( uSLGround, c, 0 ).r ) / 10000.0;',   // §GROUND_VIEW_FIELD: the same stencil, same weights
    '      if ( cv ) { uvec4 c4 = texelFetch( uSLCove, c, 0 ); if ( c4.r > 0u ) sc += w * slLog8( c4.r ) * slOctDec( c4.g | ( c4.b << 8u ) ); su += w * slLog8( c4.a ); } }',   // §COVE_LIGHT: both lobes, filtered
    '    if ( uSLSky.x > 0.5 ) { _slF = ( sw > 0.0 ) ? sf / sw : float( bg ) / 10000.0;',
    '      if ( gv ) _slGd = ( sw > 0.0 ) ? sg / sw : float( texelFetch( uSLGround, bcc, 0 ).r ) / 10000.0; }',
    '    if ( cv && sw > 0.0 ) _slCove = max( 0.0, dot( wn, sc / sw ) ) + ( su / sw ) * max( 0.0, - wn.y );',   // Lambert on the eye-facing normal, both lobes; cell-varying, directional
    '  }',
    '  return ( z == 0u ) ? 65534.0 : float( z );',
    '}',
    // a bound light (lz >= 1, OUTSIDE included) reaches only fragments of its own zone; unbound (0) and unknown: as today.
    // posView/nView are kept for the call sites' sake; the zone is the once-computed _slFZ (§SOURCED_LIGHT_LINK)
    'float slPass( float lz, vec3 posView, vec3 nView ) {',
    '  if ( uSLParams.x < 0.5 || lz < 0.5 ) return 1.0;',
    '  return ( _slFZ < -0.5 || abs( _slFZ - lz ) < 0.5 ) ? 1.0 : 0.0;',
    '}',
    'float _slSpec = -1.0;',
    'uniform vec4 uSLIrP; uniform highp sampler2D uSLIr;',   // §IRC_MAX v2: per-zone interreflected irradiance (lamps + daylight), x = on, y = scale   // §GLASS_SPEC_GATE readback: the reflection gate slSpecKeep returned
    'float slSkyKeep( vec3 posView, vec3 nView ) {',
    '  if ( uSLParams.x < 0.5 ) return 1.0;',
    // sky only where the sampled cell sees it (_slSky, §ZONE_OPEN_SKY). Unknown (-1: a fully solid column above) is a building
    // surface too (wall foot, ceiling-panel strip): it loses the sky like a covered one. Left at 1 it took the full hemi, and
    // the §METER's +4-6 stops turned it purple (Clinic/Hospital 2026-09-25)
    // §SKY_VIEW_FIELD on: a zone fragment's sky terms x F_filtered (outside 1; unknown -1 keeps indoorSky as before)
    '  if ( uSLSky.x > 0.5 ) return ( _slFZ < -0.5 ) ? uSLParams.z : _slF;',   // outside: filtered too (1 away from any roof)
    '  return ( _slSky > 0.5 ) ? 1.0 : uSLParams.z;',
    '}',
    // §GROUND_VIEW_FIELD — the hemisphere light, split the way three itself splits it (getHemisphereLightIrradiance:
    // mix( groundColor, skyColor, 0.5 * dot( n, dir ) + 0.5 ) = skyColor * w + groundColor * ( 1 - w )): the sky part x F
    // (slSkyKeep, as before), the ground part x Gd (the lower-hemisphere escape). Unknown-zone fragments (_slFZ < -0.5),
    // nav (uSLParams.x = 0), the binary path (uSLSky.x = 0) and &groundview=0 (uSLSky.y = 0) keep today's whole-hemi x
    // slSkyKeep. Ambient and IBL keep F as today (the call sites below are unchanged).
    'vec3 slHemi( vec3 sky, vec3 ground, vec3 dir, vec3 posView, vec3 nView ) {',
    '  float w = 0.5 * dot( nView, dir ) + 0.5; float k = slSkyKeep( posView, nView );',
    '  float kg = ( uSLParams.x < 0.5 || uSLSky.x < 0.5 || uSLSky.y < 0.5 || _slFZ < -0.5 ) ? k : _slGd;',
    '  return k * sky * w + kg * ground * ( 1.0 - w );',
    '}',
    // §GLASS_SPEC_GATE (red1 2026-09-26: "Clinic from outside glasses still black"; state at …385774229: 73 of 80 glass hits have
    // a COVERED eye-side cell — the window reveal under the lintel — and F < 0.3 on 65, so slSkyKeep scaled the pane's sky
    // REFLECTION to ~0). F is a diffuse, cosine-weighted sky fraction; a mirror reflection sees the sky only along its mirror
    // direction. So the IBL radiance gets its own gate: march the mirror ray through the zone grid (0.25 m steps, 8 m) from the
    // surface; leaving the grid or reaching an OPEN cell = it sees the sky (1); a SOLID cell first = as before (slSkyKeep). The
    // first 1 m may cross the surface's own solid cells (a pane rasterises 1-3 cells thick). Indoors the mirror ray meets the
    // room's walls: unchanged. CPU mirror: LightZones.specVis.
    'float slSpecKeep( vec3 posView, vec3 nView, vec3 viewDir ) {',
    '  float base = slSkyKeep( posView, nView ); _slSpec = base;',
    '  if ( uSLParams.x < 0.5 || uSLSky.x < 0.5 || base >= 0.999 || _slFZ < -0.5 ) return base;',
    '  vec3 nf = ( dot( nView, viewDir ) < 0.0 ) ? - nView : nView;',
    '  vec3 rw = normalize( ( vec4( reflect( - viewDir, nf ), 0.0 ) * viewMatrix ).xyz ); vec3 nw = normalize( ( vec4( nf, 0.0 ) * viewMatrix ).xyz );',
    '  float st = 0.5 * uSLParams.y; vec3 q = _slWP + nw * st; ivec3 dim = ivec3( uSLDim.xyz );',
    '  for ( int k = 0; k < 32; k ++ ) {',
    '    ivec3 c = ivec3( floor( ( q - uSLOrg.xyz ) / uSLParams.y ) );',
    '    if ( any( lessThan( c, ivec3( 0 ) ) ) || any( greaterThanEqual( c, dim ) ) ) { _slSpec = 1.0; return 1.0; }',
    '    uint t = texelFetch( uSLZone, c, 0 ).r;',
    '    if ( t == 65535u ) { if ( k >= 4 ) return base; }',
    '    else if ( ( t & 0x3FFFu ) == 0u ) { _slSpec = 1.0; return 1.0; }',
    '    q += rw * st;',
    '  }',
    '  return base;',
    '}',
    // §IRC_MAX v2: the fragment's zone interreflected irradiance (4096 zones per texture row); staged zone fragments only
    'vec3 slIr() {',
    '  if ( uSLIrP.x < 0.5 || uSLParams.x < 0.5 || _slFZ < 0.5 || _slFZ > 65533.5 ) return vec3( 0.0 );',
    '  int z = int( _slFZ + 0.5 ); return texelFetch( uSLIr, ivec2( z - ( z / 4096 ) * 4096, z / 4096 ), 0 ).rgb * uSLIrP.y;',
    '}',
    // §COVE_LIGHT: the cove irradiance of this fragment (colour in uSLCoveP.rgb, magnitudes already decoded); staged zone fragments only
    'vec3 slCove() { return ( uSLCoveP.w < 0.5 || uSLParams.x < 0.5 || _slFZ < 0.5 || _slFZ > 65533.5 ) ? vec3( 0.0 ) : uSLCoveP.rgb * _slCove; }',
    '#else',
    'vec3 slCove() { return vec3( 0.0 ); }',
    'vec3 slIr() { return vec3( 0.0 ); }',
    'float slSpecKeep( vec3 posView, vec3 nView, vec3 viewDir ) { return 1.0; }',
    'float slPass( float lz, vec3 posView, vec3 nView ) { return 1.0; }',
    'float slSkyKeep( vec3 posView, vec3 nView ) { return 1.0; }',
    'vec3 slHemi( vec3 sky, vec3 ground, vec3 dir, vec3 posView, vec3 nView ) { return mix( ground, sky, 0.5 * dot( nView, dir ) + 0.5 ); }',   // three's own formula
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
    // §LAMP_LOOP (red1 2026-09-26: Alt+S "hangs each time"; measured Hospital over Vulkan: the first staged frame took 157 s with
    // 200 lamps, 6.5 s with &lampcap=0). three.js UNROLLS the point-light loop, so every lit program carried 200 copies of the
    // lamp body and the compile blocked Chrome. When no point light casts a shadow (the lamps never do), the loop is now a real
    // GLSL loop — one body, the same per-lamp maths (dynamic uniform indexing, WebGL2). &lamploop=0 keeps the unrolled loop.
    if (!/[?&]lamploop=0/.test(location.search)) {
      var la = fb.indexOf('PointLight pointLight;'), ls = la >= 0 ? fb.indexOf('#pragma unroll_loop_start', la) : -1, le = ls >= 0 ? fb.indexOf('#pragma unroll_loop_end', ls) : -1;
      var reDirect = ls >= 0 && le > ls ? (/RE_Direct\( directLight,[^;]*;/.exec(fb.slice(ls, le)) || [])[0] : null;
      if (reDirect) {
        var blockEnd = le + '#pragma unroll_loop_end'.length;
        fb = fb.slice(0, ls) + '#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0\n\t' + fb.slice(ls, blockEnd) + '\n\t#else\n' +
          '\tfor ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {\n\t\tpointLight = pointLights[ i ];\n\t\tgetPointLightInfo( pointLight, geometryPosition, directLight );\n' +
          '\t\tdirectLight.color *= slPass( uSLPZ[ i / 4 ][ i - ( i / 4 ) * 4 ], geometryPosition, geometryNormal );\n\t\t' + reDirect + '\n\t}\n\t#endif' + fb.slice(blockEnd);
        console.log('§LAMP_LOOP dynamic (point lights: one loop body per program, not one per lamp; &lamploop=0 = unrolled)');
      } else console.warn('§LAMP_LOOP anchor missing — point-light loop stays unrolled');
    }
    // §LAMP_UNCAPPED — the lamp loop over the fragment's cluster list, before the spot section. Same maths as three's point
    // light (getPointLightInfo: direction, getDistanceAttenuation(d, range, decay); RE_Direct: the material's own BRDF) and
    // the same zone rule as slPass (unbound 0 / unknown fragment pass; else lamp zone == fragment zone). The lists are built
    // on the CPU per zone, so a lamp behind a wall is not even in the list. uSLLamp.x = 0 (nav, films, &lampdata=0): skipped.
    var sp = '#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )';
    if (fb.indexOf(sp) >= 0) {
      fb = fb.replace(sp, '#if defined( RE_Direct ) && ( defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON ) )\n' +
        'if ( uSLLamp.x > 0.5 && uSLParams.x > 0.5 ) {\n' +
        '\tivec3 _cc = ivec3( floor( ( _slWP - uSLOrg.xyz ) / ( uSLParams.y * uSLLamp.z ) ) );\n' +
        '\tif ( all( greaterThanEqual( _cc, ivec3( 0 ) ) ) && all( lessThan( _cc, ivec3( uSLCluDim.xyz ) ) ) ) {\n' +
        '\t\tuvec2 _oc = texelFetch( uSLClu, _cc, 0 ).rg; uint _iw = uint( uSLLamp.w ); _slLN = float( _oc.y );\n' +
        '\t\tfor ( uint _k = 0u; _k < _oc.y; _k ++ ) {\n' +
        '\t\t\tuint _g = _oc.x + _k; int _li = int( texelFetch( uSLLIdx, ivec2( int( _g % _iw ), int( _g / _iw ) ), 0 ).r );\n' +
        '\t\t\tvec4 _la = texelFetch( uSLLampT, ivec2( 0, _li ), 0 ); vec4 _lb = texelFetch( uSLLampT, ivec2( 1, _li ), 0 );\n' +
        '\t\t\tif ( !( _slFZ < -0.5 || _la.w < 0.5 || abs( _slFZ - _la.w ) < 0.5 ) ) continue; _slLNP += 1.0;\n' +
        '\t\t\tvec3 _lv = ( viewMatrix * vec4( _la.xyz, 1.0 ) ).xyz - geometryPosition; float _ld = length( _lv );\n' +
        '\t\t\tdirectLight.direction = _lv / max( _ld, 1e-6 ); directLight.color = _lb.rgb * getDistanceAttenuation( _ld, _lb.w, uSLLamp.y ); directLight.visible = true;\n' +
        '\t\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n' +
        '\t\t}\n\t}\n}\n#endif\n' + sp);
      ok++;
    } else console.warn('§LAMP_UNCAPPED anchor missing (spot section) — lamp data path inert, the pool path stays');
    var s0 = 'getSpotLightInfo( spotLight, geometryPosition, directLight );';
    if (fb.indexOf(s0) >= 0) { fb = fb.replace(s0, s0 + '\n\t\tdirectLight.color *= slPass( uSLSZ[ UNROLLED_LOOP_INDEX / 4 ][ UNROLLED_LOOP_INDEX - ( UNROLLED_LOOP_INDEX / 4 ) * 4 ], geometryPosition, geometryNormal );'); ok++; }
    var a0 = 'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );';
    if (fb.indexOf(a0) >= 0) { fb = fb.replace(a0, 'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor ) * slSkyKeep( geometryPosition, geometryNormal ); irradiance += slIr() + slCove();'); ok++; }   // §IRC_MAX v2 + §COVE_LIGHT
    // §GROUND_VIEW_FIELD: the whole call is replaced by slHemi (sky half x F, ground half x Gd); a §SKY_OCCLUSION-patched line keeps
    // its trailing `* skyOccVis( geometryNormal )`
    var h0 = 'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal )';
    if (fb.indexOf(h0) >= 0) { fb = fb.replace(h0, 'irradiance += slHemi( hemisphereLights[ i ].skyColor, hemisphereLights[ i ].groundColor, hemisphereLights[ i ].direction, geometryPosition, geometryNormal )'); ok++; }
    else console.warn('§GROUND_VIEW_FIELD anchor "getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal )" missing: hemi ungated');
    C.lights_fragment_begin = fb;
    // IBL (scene.environment) is sky light too: its diffuse irradiance and its reflections are gated indoors like the hemi.
    // The white-Lambert §METER cannot see IBL, so ungated it was amplified by the meter's +4-6 stops into a purple cast on
    // every weakly lamp-lit surface (Clinic corridor / Hospital café, 2026-09-25).
    var fm = C.lights_fragment_maps, e0 = 'iblIrradiance += getIBLIrradiance(', r0 = 'radiance += getIBLRadiance(';
    if (fm.indexOf(e0) >= 0) { fm = fm.replace(e0, 'iblIrradiance += slSkyKeep( geometryPosition, geometryNormal ) * getIBLIrradiance('); ok++; }
    if (fm.indexOf(r0) >= 0) { fm = fm.replace(r0, 'radiance += slSpecKeep( geometryPosition, geometryNormal, geometryViewDir ) * getIBLRadiance('); ok++; }   // §GLASS_SPEC_GATE
    C.lights_fragment_maps = fm;
    // §SOURCED_LIGHT_ZONE_DEBUG (witness only): uSLParams.w = 1 writes the fragment's zone as the colour, after every other
    // output chunk (R = zone mod 256, G = zone / 256, B = 1 when unknown / 0.5 when the sky is kept / 0 sky off), so a
    // readback compares shader zones AND sky class with the CPU mirror.
    if (C.dithering_fragment && C.dithering_fragment.indexOf('uSLParams') < 0) {
      C.dithering_fragment = C.dithering_fragment + '\n#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON )\n' +
        'if ( uSLParams.w > 0.5 && uSLParams.w < 1.5 ) { float _dz = _slFZ; float _uz = _dz < -0.5 ? 0.0 : _dz; gl_FragColor = vec4( mod( _uz, 256.0 ) / 255.0, floor( _uz / 256.0 ) / 255.0, _dz < -0.5 ? 1.0 : ( _slSky > 0.5 ? 0.5 : 0.0 ), 1.0 ); }\n' +   // _slFZ: the same slFragZone( - vViewPosition, normal ), computed once (§SOURCED_LIGHT_LINK)
        'if ( uSLParams.w > 11.5 && uSLParams.w < 12.5 ) { mat4 _vn = inverse( viewMatrix ); vec3 _nn = normalize( ( _vn * vec4( ( dot( normal, vViewPosition ) < 0.0 ) ? - normal : normal, 0.0 ) ).xyz ); gl_FragColor = vec4( _nn * 0.5 + 0.5, 1.0 ); }\n' +   // §COVE_LIGHT witness readback: eye-facing world normal
        'else if ( uSLParams.w > 10.5 && uSLParams.w < 11.5 ) { gl_FragColor = vec4( _slCove * uSLCoveP.w, ( _slFZ > 0.5 && _slFZ < 65533.5 ) ? _slFZ : 0.0, 0.75, 1.0 ); }\n' +   // §COVE_LIGHT readback (float target): R = cove Lambert term (texel units), G = zone, B = 0.75 marker
        'else if ( uSLParams.w > 9.5 && uSLParams.w < 10.5 ) { gl_FragColor = vec4( _slGd, _slF, 0.75, 1.0 ); }\n' +   // §GROUND_VIEW_FIELD readback (float target): R = _slGd, G = _slF, B = 0.75 marker
        'else if ( uSLParams.w > 8.5 && uSLParams.w < 9.5 ) { gl_FragColor = vec4( slIr() * BRDF_Lambert( material.diffuseColor ), 0.75 ); }\n' +   // §IRC_MAX v2 readback: IR radiance (linear)
        'else if ( uSLParams.w > 7.5 && uSLParams.w < 8.5 ) { gl_FragColor = vec4( _slSpec, _slF, 0.25, 1.0 ); }\n' +   // §GLASS_SPEC_GATE readback
        'else if ( uSLParams.w > 6.5 && uSLParams.w < 7.5 ) { gl_FragColor = vec4( _slLN, _slLNP, 0.5, 1.0 ); }\n' +   // §LAMP_UNCAPPED_COST readback (float target)
        'else if ( uSLParams.w > 5.5 && uSLParams.w < 6.5 ) { gl_FragColor = vec4( _slF, ( _slFZ > 0.5 && _slFZ < 65533.5 ) ? 1.0 : 0.0, _slSky, 1.0 ); }\n' +   // §SKY_VIEW_FIELD SKY_STEP readback: F_filtered
        'else if ( uSLParams.w > 1.5 ) { mat4 _vi = inverse( viewMatrix ); vec3 _wp = ( _vi * vec4( - vViewPosition, 1.0 ) ).xyz; vec3 _wn = normalize( ( _vi * vec4( normal, 0.0 ) ).xyz ); vec3 _q = _wp + _wn * 0.2;\n' +
        '  if ( uSLParams.w < 2.5 ) { float _r = slZoneAt( _q ); float _ur = _r < 0.0 ? 0.0 : _r; gl_FragColor = vec4( mod( _ur, 256.0 ) / 255.0, floor( _ur / 256.0 ) / 255.0, _r < 0.0 ? 1.0 : 0.0, 1.0 ); }\n' +
        '  else if ( uSLParams.w < 3.5 ) { vec3 _g = ( _q - uSLOrg.xyz ) / ( uSLParams.y * uSLDim.xyz ); gl_FragColor = vec4( clamp( _g, 0.0, 1.0 ), 1.0 ); }\n' +
        '  else if ( uSLParams.w > 4.5 ) { gl_FragColor = vec4( clamp( ( - vViewPosition ) / 40.0 + 0.5, 0.0, 1.0 ), 1.0 ); }\n' +
        '  else { gl_FragColor = vec4( length( vViewPosition ) / 10.0, length( _wp - cameraPosition ) / 10.0, clamp( ( _wp.y - uSLOrg.y ) / 20.0, 0.0, 1.0 ), 1.0 ); } }\n#endif\n'; ok++; }
    C.lights_pars_begin = PARS + C.lights_pars_begin;
    dummy = new THREE.Data3DTexture(new Uint16Array(2), 1, 1, 1);
    dummy.format = THREE.RGIntegerFormat; dummy.type = THREE.UnsignedShortType; dummy.internalFormat = 'RG16UI';   // §SOURCED_DAYLIGHT: RG16UI
    dummy.minFilter = dummy.magFilter = THREE.NearestFilter; dummy.generateMipmaps = false; dummy.unpackAlignment = 1; dummy.needsUpdate = true;
    dGround = groundTex3D(THREE, new Uint16Array(1), 1, 1, 1);   // §GROUND_VIEW_FIELD dummy (an integer sampler needs an integer texture on its unit)
    // §LAMP_UNCAPPED dummies: every declared sampler must see a texture of its own kind (an integer sampler on a float unit is
    // GL_INVALID_OPERATION at draw time), same reason as `dummy` above
    dIr = lampTex2D(THREE, new Float32Array(4), 1, 1);   // §IRC_MAX v2 dummy
    dCove = coveTex3D(THREE, new Uint8Array(4), 1, 1, 1);   // §COVE_LIGHT dummy (RGBA8UI: an integer sampler needs an integer texture on its unit)
    dLamp = lampTex2D(THREE, new Float32Array(8), 2, 1); dIdx = idxTex2D(THREE, new Uint16Array(1), 1, 1); dClu = cluTex3D(THREE, new Uint32Array(2), 1, 1, 1);
    ['standard', 'physical', 'lambert', 'phong', 'toon'].forEach(function (k) {
      var U = THREE.ShaderLib[k] && THREE.ShaderLib[k].uniforms; if (!U) return;
      // typed arrays are shared by reference through UniformsUtils.clone (only Color/Vector/Matrix/Texture are cloned)
      U.uSLParams = { value: P }; U.uSLOrg = { value: ORG }; U.uSLDim = { value: DIM }; U.uSLSky = { value: SKY }; U.uSLZone = { value: dummy }; U.uSLGround = { value: dGround };
      U.uSLPZ = { value: PZ }; U.uSLSZ = { value: SZ };
      U.uSLIrP = { value: IRP }; U.uSLIr = { value: dIr };
      U.uSLCoveP = { value: COVEP }; U.uSLCoveQ = { value: COVEQ }; U.uSLCove = { value: dCove };   // §COVE_LIGHT (RGBA8UI dummy)
      U.uSLLamp = { value: LAMP }; U.uSLCluDim = { value: CDIM }; U.uSLLampT = { value: dLamp }; U.uSLLIdx = { value: dIdx }; U.uSLClu = { value: dClu };
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
    console.log('§SOURCED_LIGHT installed patchedLines=' + ok + '/9 (zone-once, point, lamp-data, spot, ambient, hemi, env irradiance, env radiance, zone-debug) — inert until an Alt+S stages it');
  }

  function dial(A, key, name, def, lo, hi) {
    var v = (typeof A[key] === 'number') ? A[key] : null;
    if (v == null) { var m = new RegExp('[?&]' + name + '=([0-9.]+)').exec(location.search); v = m ? parseFloat(m[1]) : def; }
    return Math.max(lo, Math.min(hi, isFinite(v) ? v : def));
  }

  // ══ §LAMP_UNCAPPED (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "§LAMP_UNCAPPED — SPEC", b00ea663e; red1 2026-09-26:
  // "the far off corner looks dark but when near lites up" / "one angle lited, the other dark") ══
  // The uniform budget capped a still at 160-200 point lights picked around the CAMERA (Terminal: 861 fixtures; at red1's two
  // poses on one target the 421 lamps within 25 m of it were lit 132 vs 91). Clustered forward shading (Olsson, Billeter,
  // Assarsson, "Clustered Deferred and Forward Shading", HPG 2012) over our own zone grid: every placed lamp is DATA (tools.js
  // fills A._lampData with the pool's own colour x intensity, range, decay); BUILD (per lamp set, camera-free): per 2 m
  // cluster (zone grid / CLU) the lamps whose range sphere reaches it AND whose zone is in it (cells dilated by 1: the
  // fragment's zone comes from its 27 neighbours); SHADER: one loop over the fragment's cluster list. No point lights, no cap,
  // no camera in the pick. Stills only (films keep the pool: A._maxqActive); &lampdata=0 = the capped pool.
  var LAMP = new Float32Array(4), CDIM = new Float32Array(4), CLU = 4, IDX_W = 4096, lampTex = null, idxTex = null, cluTex = null, dLamp = null, dIdx = null, dClu = null;
  var lampVer = -1, lampListKey = null, lampLast = null, lampPushAll = false;
  function lampTex2D(THREE, data, w, h) { var t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; }
  function idxTex2D(THREE, data, w, h) { var t = new THREE.DataTexture(data, w, h, THREE.RedIntegerFormat, THREE.UnsignedShortType); t.internalFormat = 'R16UI'; t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true; return t; }
  function cluTex3D(THREE, data, w, h, d) { var t = new THREE.Data3DTexture(data, w, h, d); t.format = THREE.RGIntegerFormat; t.type = THREE.UnsignedIntType; t.internalFormat = 'RG32UI'; t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true; return t; }
  // effects.js asks before the lamps are born: the data path needs the patched chunks, this building's zones, and a still
  function lampWanted(A) {
    var LZ = global.LightZones, Z = LZ && LZ.get();
    return !!(installed && !linkFailed && orig && Z && Z.bld === A.activeBuilding && !A._maxqActive && A._stillLampData !== false && !/[?&]lampdata=0/.test(location.search));
  }
  function lampZone(LZ, p) { var v = LZ.atLamp(p); return (v > 0 && v !== SOLID) ? v : ((v === 0 || v === -1) ? OUTSIDE : 0); }
  // BUILD — returns the stats (logged §LAMP_UNCAPPED); lists rebuilt only when the lamp SET changes, the lamp texture on every
  // new A._lampData version (an intensity change: §STAGED_PL_CUT, §STILL_GLOW's lamps-off scale)
  function lampBuild(A) {
    var THREE = global.THREE, LZ = global.LightZones, Z = LZ && LZ.get(), D = A._lampData;
    if (!Z || !D || !A._lampDataOn) { LAMP[0] = 0; return null; }
    if (D.ver === lampVer && lampTex) return lampLast;
    if (!D.enDone) { D.enDone = true; if (enOn(A)) { try { D.en = enApply(A, Z, D); } catch (eEN) { console.warn('§LAMP_EN failed: ' + eEN.message + ' — lamps unscaled'); } } else console.log('§LAMP_EN off (&lampen=0)'); }
    var t0 = performance.now(), L = D.lamps, n = L.length, R = D.range > 0 ? D.range : Z.cell * Math.max(Z.nx, Z.ny, Z.nz);
    if (n >= 65535) { console.warn('§LAMP_UNCAPPED FAIL lamps=' + n + ' >= 65535 (R16UI index) — pool path kept'); return lampFail(A, 'too many lamps'); }
    var ld = new Float32Array(Math.max(1, n) * 8), lz = new Uint16Array(n), ph = 0, lit = 0, sumI = 0, byZ = [0, 0, 0];
    for (var i = 0; i < n; i++) { var q = L[i], z = lampZone(LZ, q); lz[i] = z;
      ld.set([q.x, q.y, q.z, z, q.r, q.g, q.b, q.range > 0 ? q.range : 0], i * 8); ph += q.x * 1.3 + q.y * 1.7 + q.z * 1.9;
      if (q.I > 0) { lit++; sumI += q.I; } byZ[z === 0 ? 0 : (z === OUTSIDE ? 2 : 1)]++; }
    if (lampTex) lampTex.dispose(); lampTex = lampTex2D(THREE, ld, 2, Math.max(1, n));
    var key = Z.bld + ':' + Z.nx + 'x' + Z.ny + 'x' + Z.nz + ':' + n + ':' + R + ':' + ph.toFixed(3), tl = performance.now(), S = lampLast && lampLast.lists;
    if (key !== lampListKey || !idxTex) {
      var nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny, zone = Z.zone, C = CLU, cx = Math.ceil(nx / C), cy = Math.ceil(ny / C), cz = Math.ceil(nz / C), NC = cx * cy * cz, cs = Z.cell * C;
      // zones per cluster (CSR): the cluster's cells dilated by one cell; zone 0 (open to the sky) -> the open flag
      var zS = new Int32Array(NC + 1), zA = [], open = new Uint8Array(NC), tmp = [];
      for (var ck = 0; ck < cz; ck++) for (var cj = 0; cj < cy; cj++) for (var ci = 0; ci < cx; ci++) { var c = ci + cj * cx + ck * cx * cy; tmp.length = 0;
        var i0 = Math.max(0, ci * C - 1), i1 = Math.min(nx - 1, ci * C + C), j0 = Math.max(0, cj * C - 1), j1 = Math.min(ny - 1, cj * C + C), k0 = Math.max(0, ck * C - 1), k1 = Math.min(nz - 1, ck * C + C);
        for (var k = k0; k <= k1; k++) for (var j = j0; j <= j1; j++) { var b = j * nx + k * nxy; for (var ii = i0; ii <= i1; ii++) { var v = zone[b + ii]; if (v === SOLID) continue; var zz = v & 0x3FFF;
          if (zz === 0) { open[c] = 1; continue; } if (tmp.indexOf(zz) < 0) tmp.push(zz); } }
        zS[c] = zA.length; for (var t = 0; t < tmp.length; t++) zA.push(tmp[t]); }
      zS[NC] = zA.length;
      var zArr = Int32Array.from(zA); zA = null;
      var R2 = R * R, ox = Z.org.x, oy = Z.org.y, oz = Z.org.z, cnt = new Uint32Array(NC);
      function each(li, f) { var p = L[li], z = lz[li];
        var a0 = Math.max(0, Math.floor((p.x - R - ox) / cs)), a1 = Math.min(cx - 1, Math.floor((p.x + R - ox) / cs)), b0 = Math.max(0, Math.floor((p.y - R - oy) / cs)), b1 = Math.min(cy - 1, Math.floor((p.y + R - oy) / cs)),
            e0 = Math.max(0, Math.floor((p.z - R - oz) / cs)), e1 = Math.min(cz - 1, Math.floor((p.z + R - oz) / cs));
        for (var kk = e0; kk <= e1; kk++) { var mz = oz + kk * cs, dz = p.z < mz ? mz - p.z : (p.z > mz + cs ? p.z - mz - cs : 0);
          for (var jj = b0; jj <= b1; jj++) { var my = oy + jj * cs, dy = p.y < my ? my - p.y : (p.y > my + cs ? p.y - my - cs : 0), dyz = dy * dy + dz * dz; if (dyz > R2) continue;
            for (var i2 = a0; i2 <= a1; i2++) { var mx = ox + i2 * cs, dx = p.x < mx ? mx - p.x : (p.x > mx + cs ? p.x - mx - cs : 0); if (dx * dx + dyz > R2) continue;
              var cc = i2 + jj * cx + kk * cx * cy, okz = z === 0 || (z === OUTSIDE ? open[cc] === 1 : false);
              if (!okz && z !== OUTSIDE) for (var w = zS[cc]; w < zS[cc + 1]; w++) if (zArr[w] === z) { okz = true; break; }
              if (okz) f(cc); } } } }
      for (var l1 = 0; l1 < n; l1++) each(l1, function (cc) { cnt[cc]++; });
      var off = new Uint32Array(NC), tot = 0, nonEmpty = 0, maxL = 0;
      for (var c2 = 0; c2 < NC; c2++) { off[c2] = tot; tot += cnt[c2]; if (cnt[c2]) { nonEmpty++; if (cnt[c2] > maxL) maxL = cnt[c2]; } }
      var H = Math.max(1, Math.ceil(tot / IDX_W)), maxTex = A.renderer.capabilities.maxTextureSize || 4096;
      if (H > maxTex) { console.warn('§LAMP_UNCAPPED FAIL index list ' + tot + ' entries needs ' + H + ' rows > maxTextureSize ' + maxTex + ' — pool path kept'); return lampFail(A, 'index list too long'); }
      var idx = new Uint16Array(H * IDX_W), fill = new Uint32Array(NC);
      for (var l2 = 0; l2 < n; l2++) each(l2, function (cc) { idx[off[cc] + fill[cc]++] = l2; });
      var cl = new Uint32Array(NC * 2); for (var c3 = 0; c3 < NC; c3++) { cl[c3 * 2] = off[c3]; cl[c3 * 2 + 1] = cnt[c3]; }
      if (idxTex) idxTex.dispose(); if (cluTex) cluTex.dispose();
      idxTex = idxTex2D(THREE, idx, IDX_W, H); cluTex = cluTex3D(THREE, cl, cx, cy, cz);
      CDIM[0] = cx; CDIM[1] = cy; CDIM[2] = cz; CDIM[3] = 0; lampListKey = key;
      S = { clusters: NC, grid: cx + 'x' + cy + 'x' + cz, clusterM: cs, nonEmpty: nonEmpty, entries: tot, maxPerCluster: maxL, meanPerNonEmpty: nonEmpty ? +(tot / nonEmpty).toFixed(1) : 0,
        MB: +((idx.byteLength + cl.byteLength + ld.byteLength) / 1e6).toFixed(1), zoneEntries: zArr.length, openClusters: open.reduce(function (s2, v2) { return s2 + v2; }, 0), ms: Math.round(performance.now() - tl) };
    }
    try { A.renderer.initTexture(lampTex); A.renderer.initTexture(idxTex); A.renderer.initTexture(cluTex); } catch (eU) { console.warn('§LAMP_UNCAPPED upload failed: ' + eU.message); return lampFail(A, 'upload'); }
    LAMP[0] = 1; LAMP[1] = D.decay; LAMP[2] = CLU; LAMP[3] = IDX_W; lampVer = D.ver; lampPushAll = true;
    lampLast = { lamps: n, lit: lit, sumI: +sumI.toFixed(3), unbound: byZ[0], zoned: byZ[1], outside: byZ[2], range: R, decay: D.decay, lists: S, ms: Math.round(performance.now() - t0) };
    console.log('§LAMP_UNCAPPED on lamps=' + n + ' lit=' + lit + ' sumI=' + lampLast.sumI + ' (zoned ' + byZ[1] + ', outside ' + byZ[2] + ', unbound ' + byZ[0] + ') range=' + R + 'm decay=' + D.decay +
      ' clusters=' + S.grid + ' (' + S.clusterM + ' m) nonEmpty=' + S.nonEmpty + '/' + S.clusters + ' entries=' + S.entries + ' perCluster max/mean=' + S.maxPerCluster + '/' + S.meanPerNonEmpty +
      ' MB=' + S.MB + ' listMs=' + S.ms + ' ms=' + lampLast.ms + ' ver=' + D.ver + ' (no point lights, no cap, camera-free)');
    return lampLast;
  }
  // §LAMP_UNCAPPED_COST — the per-fragment loop the shader really ran: one float render of the scene's own materials in the
  // readback mode (w = 7: R = list length, G = lamps passing the zone test, B = 0.5 marker), METER_W x METER_H.
  function lampCost(A) {
    var THREE = global.THREE, R = A.renderer; if (!(LAMP[0] > 0.5) || !R) return null;
    var t0 = performance.now(), W = 160, H = 90, rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, depthBuffer: true }), buf = new Float32Array(W * H * 4);
    var prevRT = R.getRenderTarget(), prevBg = A.scene.background, w0 = P[3], cc = new THREE.Color(), ca = R.getClearAlpha(); R.getClearColor(cc);
    try { P[3] = 7; A.scene.background = null; R.setClearColor(0x000000, 0); R.setRenderTarget(rt); R.clear(true, true, true); R.render(A.scene, A.camera); R.readRenderTargetPixels(rt, 0, 0, W, H, buf); }
    finally { P[3] = w0; R.setRenderTarget(prevRT); A.scene.background = prevBg; R.setClearColor(cc, ca); rt.dispose(); }
    var n = 0, noList = 0, sum = 0, sumP = 0, max = 0, maxP = 0, vals = [];
    for (var i = 0; i < W * H; i++) { if (Math.abs(buf[i * 4 + 2] - 0.5) > 1e-6) continue; var ln = buf[i * 4], lp = buf[i * 4 + 1]; if (ln < 0) { noList++; continue; }
      n++; sum += ln; sumP += lp; vals.push(ln); if (ln > max) max = ln; if (lp > maxP) maxP = lp; }
    vals.sort(function (a, b) { return a - b; });
    var r = { pixels: n, noCluster: noList, meanList: n ? +(sum / n).toFixed(1) : 0, p95List: vals.length ? vals[Math.floor(vals.length * 0.95)] : 0, maxList: max, meanLit: n ? +(sumP / n).toFixed(1) : 0, maxLit: maxP, ms: Math.round(performance.now() - t0) };
    console.log('§LAMP_UNCAPPED_COST ' + (n ? '' : 'VACUOUS ') + 'pixels=' + n + ' offClusterGrid=' + noList + ' list mean/p95/max=' + r.meanList + '/' + r.p95List + '/' + r.maxList + ' zonePass mean/max=' + r.meanLit + '/' + r.maxLit + ' (lamps evaluated per fragment) ms=' + r.ms);
    return r;
  }
  // witness accessor: the lamp indices in the cluster holding world point p (the CPU copy the textures were made from)
  function lampsAt(p) {
    var Z = global.LightZones && global.LightZones.get(); if (!(LAMP[0] > 0.5) || !Z || !cluTex || !idxTex) return null;
    var cs = Z.cell * CLU, i = Math.floor((p.x - Z.org.x) / cs), j = Math.floor((p.y - Z.org.y) / cs), k = Math.floor((p.z - Z.org.z) / cs);
    if (i < 0 || j < 0 || k < 0 || i >= CDIM[0] || j >= CDIM[1] || k >= CDIM[2]) return [];
    var c = i + j * CDIM[0] + k * CDIM[0] * CDIM[1], cl = cluTex.image.data, ix = idxTex.image.data, o = cl[c * 2], n = cl[c * 2 + 1], out = [];
    for (var q = 0; q < n; q++) out.push(ix[o + q]);
    return out;
  }
  // ══ §IRC_MAX v2 (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "§IRC_MAX v2 (lamps + daylight) — SPEC") ══
  // Per zone E_ir = R/(1-R) x mean DIRECT irradiance over the zone's own surfaces (Sumpner flux balance, the V12 relation).
  // Lamps: three's point-light term att(d, range, decay) x cos from the zone's lamps (+ unbound) over zone-grid surface faces
  // (zone cell faces against SOLID, <= IR_FACES per zone, even stride). Daylight: V12 irc_z (LightZones.field ircAll) x the hemi
  // sky irradiance. One RGBA32F texel per zone. &ir=0 = off.
  var irLampZ = null;   // per zone lamp-IR luminance (three units), §LUX_CHECK / §LAMP_EN
  var IRP = new Float32Array(4), irTex = null, dIr = null, irKey = null, irFaces = null, irLast = null, IR_FACES = 4000, IR_R = 0.5;
  function irOn(A) { return !(A._stillIr === false || /[?&]ir=0/.test(location.search)); }
  function irFacesOf(Z) {   // camera-free, per zone grid: sampled surface faces [x, y, z, nx, ny, nz] per zone
    if (irFaces && irFaces.Z === Z) return irFaces;
    var t0 = performance.now(), nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny, N = nx * ny * nz, zone = Z.zone, cnt = new Int32Array(Z.zones + 1), D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    function each(f) { for (var c = 0; c < N; c++) { var v = zone[c]; if (v === SOLID) continue; var z = v & 0x3FFF; if (!z) continue; var i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0;
      for (var d = 0; d < 6; d++) { var ii = i + D6[d][0], jj = j + D6[d][1], kk = k + D6[d][2]; if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue; if (zone[ii + jj * nx + kk * nxy] !== SOLID) continue; f(z, i, j, k, d); } } }
    each(function (z) { cnt[z]++; });
    var stride = new Int32Array(Z.zones + 1), seen = new Int32Array(Z.zones + 1), out = new Array(Z.zones + 1), cl = Z.cell;
    for (var z0 = 1; z0 <= Z.zones; z0++) { stride[z0] = Math.max(1, Math.ceil(cnt[z0] / IR_FACES)); out[z0] = []; }
    each(function (z, i, j, k, d) { if ((seen[z]++ % stride[z]) !== 0) return; var D = D6[d];
      out[z].push(Z.org.x + (i + 0.5 + D[0] * 0.49) * cl, Z.org.y + (j + 0.5 + D[1] * 0.49) * cl, Z.org.z + (k + 0.5 + D[2] * 0.49) * cl, -D[0], -D[1], -D[2]); });
    irFaces = { Z: Z, faces: out, count: cnt, ms: Math.round(performance.now() - t0) };
    return irFaces;
  }
  function irBuild(A) {
    var THREE = global.THREE, LZ = global.LightZones, Z = LZ && LZ.get(); IRP[0] = 0;
    if (!Z || !irOn(A)) return null;
    var D = A._lampDataOn ? A._lampData : null, F = Z.field, hemi = A.hemi, hc = hemi ? [hemi.color.r * hemi.intensity, hemi.color.g * hemi.intensity, hemi.color.b * hemi.intensity] : [0, 0, 0];
    var key = (Z.bld + ':' + Z.zones) + '|' + (D ? D.ver + ':' + D.lamps.length : 'nolamps') + '|' + hc.map(function (v) { return v.toFixed(5); }).join(',') + '|' + (F ? 1 : 0);
    if (key === irKey && irTex) { IRP[0] = 1; return irLast; }   // IRP[1] (scale) is left alone: the meter zeroes it for its own render
    var t0 = performance.now(), fc = irFacesOf(Z), nzn = Z.zones, W = 4096, H = Math.ceil((nzn + 1) / W), buf = new Float32Array(W * H * 4), k2 = IR_R / (1 - IR_R);
    var byZ = new Map(), unb = [], lampN = 0, zl = 0, zd = 0, maxL = 0, maxD = 0; irLampZ = new Float32Array(nzn + 1);   // §LAMP_EN reads the lamp part
    if (D) D.lamps.forEach(function (q) { if (!(q.I > 0)) return; lampN++; var z = lampZone(LZ, q); if (z === 0) unb.push(q); else if (z !== OUTSIDE) { var a = byZ.get(z); if (!a) byZ.set(z, a = []); a.push(q); } });
    var dec = D ? D.decay : 2;
    for (var z = 1; z <= nzn; z++) {
      var er = 0, eg = 0, eb = 0, f = fc.faces[z], nf = f ? f.length / 6 : 0, Ls = (byZ.get(z) || []).concat(unb);
      if (nf && Ls.length) { for (var fi = 0; fi < f.length; fi += 6) { var px = f[fi], py = f[fi + 1], pz = f[fi + 2], nx2 = f[fi + 3], ny2 = f[fi + 4], nz2 = f[fi + 5];
          for (var li = 0; li < Ls.length; li++) { var q = Ls[li], lx = q.x - px, ly = q.y - py, lzz = q.z - pz, d = Math.sqrt(lx * lx + ly * ly + lzz * lzz); if (!(d > 1e-4)) continue;
            var cs = (lx * nx2 + ly * ny2 + lzz * nz2) / d; if (cs <= 0) continue; var R2 = q.range, att = 1 / Math.max(Math.pow(d, dec), 0.01);
            if (R2 > 0) { if (d >= R2) continue; var w = 1 - Math.pow(d / R2, 4); att *= w * w; } er += q.r * att * cs; eg += q.g * att * cs; eb += q.b * att * cs; } }
        er = k2 * er / nf; eg = k2 * eg / nf; eb = k2 * eb / nf; if (er + eg + eb > 0) zl++; irLampZ[z] = 0.2126 * er + 0.7152 * eg + 0.0722 * eb; maxL = Math.max(maxL, (er + eg + eb) / 3); }
      var ic = F && F.ircAll ? F.ircAll[z] : 0;
      if (ic > 0) { zd++; maxD = Math.max(maxD, ic * (hc[0] + hc[1] + hc[2]) / 3); er += ic * hc[0]; eg += ic * hc[1]; eb += ic * hc[2]; }
      buf[z * 4] = er; buf[z * 4 + 1] = eg; buf[z * 4 + 2] = eb; buf[z * 4 + 3] = 1;
    }
    if (irTex) irTex.dispose(); irTex = lampTex2D(THREE, buf, W, H);
    try { A.renderer.initTexture(irTex); } catch (eI) { console.warn('§IRC_MAX upload failed: ' + eI.message); return null; }
    IRP[0] = 1; IRP[1] = 1; irKey = key; lampPushAll = true;
    irLast = { zones: nzn, zonesLamp: zl, zonesDay: zd, lamps: lampN, unbound: unb.length, maxLampE: +maxL.toFixed(5), maxDayE: +maxD.toFixed(5), hemi: hc.map(function (v) { return +v.toFixed(3); }), facesMs: fc.ms, ms: Math.round(performance.now() - t0) };
    console.log('§IRC_MAX build zones=' + nzn + ' withLampIR=' + zl + ' withDayIR=' + zd + ' lamps=' + lampN + ' (unbound ' + unb.length + ') maxE lamp/day=' + irLast.maxLampE + '/' + irLast.maxDayE +
      ' R=' + IR_R + ' facesPerZone<=' + IR_FACES + ' facesMs=' + fc.ms + ' ms=' + irLast.ms + ' (E_ir = R/(1-R) x mean direct E over the zone surfaces; day = V12 irc x hemi)');
    return irLast;
  }
  // share of each pixel's linear radiance that is the IR term (for gi_still's max rule): two linear renders at w x h, rows top-down
  function irShare(A, w, h) {
    var THREE = global.THREE, R = A.renderer; if (!(IRP[0] > 0.5) || !active || !R) return null;
    var t0 = performance.now(), rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: true }), L = new Float32Array(w * h * 4), I = new Float32Array(w * h * 4), w0 = P[3], prev = R.getRenderTarget(), bg = A.scene.background;
    try { A.scene.background = null; R.setRenderTarget(rt); R.clear(); R.render(A.scene, A.camera); R.readRenderTargetPixels(rt, 0, 0, w, h, L);
      P[3] = 9; R.clear(); R.render(A.scene, A.camera); R.readRenderTargetPixels(rt, 0, 0, w, h, I); }
    finally { P[3] = w0; R.setRenderTarget(prev); A.scene.background = bg; rt.dispose(); }
    var out = new Uint8ClampedArray(w * h * 4), n = 0, sum = 0, over = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var s = (y * w + x) * 4, d = ((h - 1 - y) * w + x) * 4, sh = 0;
      if (Math.abs(I[s + 3] - 0.75) < 1e-4) { var li = 0.2126 * I[s] + 0.7152 * I[s + 1] + 0.0722 * I[s + 2], lt = 0.2126 * L[s] + 0.7152 * L[s + 1] + 0.0722 * L[s + 2]; sh = lt > 1e-9 ? Math.min(1, Math.max(0, li / lt)) : 0; }
      var v = Math.round(sh * 255); out[d] = v; out[d + 1] = v; out[d + 2] = v; out[d + 3] = 255; if (sh > 0) { n++; sum += sh; if (sh > 0.5) over++; } }
    var r = { data: out, pixels: n, meanShare: n ? +(sum / n).toFixed(3) : 0, shareOver50: over, ms: Math.round(performance.now() - t0) };
    console.log('§IRC_MAX share ' + w + 'x' + h + ' pixelsWithIR=' + n + ' meanShare=' + r.meanShare + ' pixelsIRover50%=' + over + ' ms=' + r.ms + ' (share = IR radiance / total, linear; applied to the tone-mapped app colour = approximation)');
    return r;
  }
  // ══ §LAMP_EN (red1 2026-09-26: "lamp strength should be commensurate with indoor space, a standard governs it"; "Set a standard
  // table for them") — each ROOM's lamps are scaled so its 0.8 m working plane (lamp direct + zone interreflection, as EN's
  // maintained illuminance includes reflected light) meets the EN 12464-1 Em,r row of its category. Rooms and categories are the
  // viewer's own (A.allRoomVolumes: the Find-panel room injection — corridor/utilities from geometry, restroom/kitchen/bedroom from
  // the room name, else habitable). Rows quoted from prEN 12464-1 (July 2019, as EN_ROWS above; 2021 final not verified).
  // A lamp in no room keeps scale 1 (logged). &lampen=0 = off.
  var EN_TABLE = {
    corridor: ['6.1.1 Corridors and circulation', 100], restroom: ['6.2.4 Toilets / washrooms', 200], kitchen: ['6.2.1 Canteens, pantries', 200],
    utilities: ['6.3.1 Plant rooms, switch gear rooms', 200], bedroom: ['6.37.1 Waiting rooms (health care) — default', 200], habitable: ['6.37.1 Waiting rooms (health care) — default', 200] };
  // §SPACE_USES — the building's lamp -> room USE sidecar (buildings/space_uses/<Building>.json, viewer/tests/extract_space_uses.py:
  // IFC IfcRelContainedInSpatialStructure lamp -> IfcSpace LongName, by GUID). Fetched once per building before staging.
  var spaceUsesCache = {};
  function primeSpaceUses(A) {
    var bld = A && A.activeBuilding; if (!bld || Object.prototype.hasOwnProperty.call(spaceUsesCache, bld)) return Promise.resolve(spaceUsesCache[bld] || null);
    var url = new URL('../buildings/space_uses/' + encodeURIComponent(bld) + '.json', location.href).href;
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { spaceUsesCache[bld] = j && j.lamps ? j : null;
      console.log('§SPACE_USES bld=' + bld + ' ' + (j && j.lamps ? 'loaded lamps=' + Object.keys(j.lamps).length + ' from ' + (j.sources || []).map(function (q) { return q.ifc; }).join('+') : 'none (' + url + ')')); return spaceUsesCache[bld]; })
      .catch(function () { spaceUsesCache[bld] = null; console.log('§SPACE_USES bld=' + bld + ' none (fetch failed)'); return null; });
  }
  function enRowForUse(name) { for (var i = 0; i < EN_ROWS.length; i++) if (EN_ROWS[i][2] != null && EN_ROWS[i][0].test(name || '')) return [EN_ROWS[i][1], EN_ROWS[i][2]]; return null; }
  function enOn(A) { return !(A._stillLampEn === false || /[?&]lampen=0/.test(location.search)); }
  function enApply(A, Z, D) {
    var LZ = global.LightZones, t0 = performance.now(), vols = [];
    try { vols = A.allRoomVolumes ? (A.allRoomVolumes() || []) : []; } catch (eV) { vols = []; }
    var sunI = A._stillCalibSunI, luxPer = sunI > 0 ? (A._stillCalibSunLux || 100000) / sunI : 0;
    if (!vols.length || !(luxPer > 0)) { console.log('§LAMP_EN VACUOUS rooms=' + vols.length + ' luxPerUnit=' + luxPer + ' — lamps unscaled'); return null; }
    var L = D.lamps, n = L.length, room = new Int32Array(n).fill(-1), lzs = new Int32Array(n), dec = D.decay;
    for (var i = 0; i < n; i++) { lzs[i] = lampZone(LZ, L[i]); L[i].__r0 = L[i].r; L[i].__g0 = L[i].g; L[i].__b0 = L[i].b; L[i].__I0 = L[i].I; }
    var R = vols.map(function (v, k) { var c = v.center, sz = v.size, x0 = c.x - sz.x / 2, x1 = c.x + sz.x / 2, y0 = c.y - sz.y / 2, y1 = c.y + sz.y / 2, z0 = c.z - sz.z / 2, z1 = c.z + sz.z / 2;
      var row = EN_TABLE[v.category] || EN_TABLE.habitable, samp = [], nxs = Math.max(1, Math.min(8, Math.round(sz.x))), nzs = Math.max(1, Math.min(8, Math.round(sz.z)));
      for (var a = 0; a < nxs; a++) for (var b = 0; b < nzs; b++) { var p = { x: x0 + (a + 0.5) * sz.x / nxs, y: y0 + 0.8, z: z0 + (b + 0.5) * sz.z / nzs }, zz = LZ.at(p); if (zz > 0 && zz !== LZ.SOLID) samp.push([p, zz]); }
      return { k: k, cat: v.category, row: row, box: [x0, x1, y0, y1 + 0.6, z0, z1], samp: samp, s: 1, lamps: [] }; });
    // §SPACE_USES first: lamps with a real room use are grouped by (zone, use); the group's working plane = its zone's 0.8 m cells
    // (§SKY_VIEW_FIELD stats samples) within 2 m (horizontal) of any of its lamps; row = EN_ROWS by the use name, else the default
    var SU = spaceUsesCache[A.activeBuilding], suN = 0, suRows = {}, suUnmatched = {}, FS0 = fieldLast && fieldLast.stats;
    if (SU && FS0) { var grp = new Map();
      for (var ls = 0; ls < n; ls++) { var use = L[ls].guid && SU.lamps[L[ls].guid]; if (!use || !(lzs[ls] > 0) || lzs[ls] === OUTSIDE) continue; var key = lzs[ls] + '|' + use, g = grp.get(key); if (!g) grp.set(key, g = { z: lzs[ls], use: use, lamps: [] }); g.lamps.push(ls); }
      grp.forEach(function (g) { var zr = FS0.zones[g.z]; if (!zr || !zr.samples || !zr.samples.length) return; var samp = [];
        zr.samples.forEach(function (c) { var p = { x: Z.org.x + (c % Z.nx + 0.5) * Z.cell, y: Z.org.y + ((((c / Z.nx) | 0) % Z.ny) + 0.5) * Z.cell, z: Z.org.z + (((c / (Z.nx * Z.ny)) | 0) + 0.5) * Z.cell };
          for (var gi = 0; gi < g.lamps.length; gi++) { var q0 = L[g.lamps[gi]]; if ((q0.x - p.x) * (q0.x - p.x) + (q0.z - p.z) * (q0.z - p.z) <= 4) { samp.push([p, g.z]); break; } } });
        if (!samp.length) return; var row = enRowForUse(g.use); if (row) suRows[row[0].split(' ')[0]] = (suRows[row[0].split(' ')[0]] || 0) + g.lamps.length; else suUnmatched[g.use] = (suUnmatched[g.use] || 0) + g.lamps.length;
        var idx = R.length; R.push({ k: idx, cat: 'use:' + g.use, row: row || EN_TABLE.habitable, box: null, samp: samp, s: 1, lamps: g.lamps.slice() }); g.lamps.forEach(function (li0) { room[li0] = idx; suN++; }); }); }
    for (var li = 0; li < n; li++) { var q = L[li]; if (room[li] >= 0) continue; for (var ri = 0; ri < R.length; ri++) { if (!R[ri].box) continue; var bx = R[ri].box; if (q.x >= bx[0] && q.x <= bx[1] && q.y >= bx[2] && q.y <= bx[3] && q.z >= bx[4] && q.z <= bx[5]) { room[li] = ri; R[ri].lamps.push(li); break; } } }
    var byZ = new Map(); for (var l2 = 0; l2 < n; l2++) { var z2 = lzs[l2]; if (z2 === OUTSIDE) continue; var a2 = byZ.get(z2); if (!a2) byZ.set(z2, a2 = []); a2.push(l2); }
    var unb = byZ.get(0) || [], k2 = IR_R / (1 - IR_R), fc = irFacesOf(Z), scale = new Float32Array(n).fill(1);
    function Edir(p, zz) { var Ls = (byZ.get(zz) || []).concat(unb), e = 0; for (var j = 0; j < Ls.length; j++) { var q2 = L[Ls[j]], dx = q2.x - p.x, dy = q2.y - p.y, dz = q2.z - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3; if (dy <= 0) continue;
      var at = 1 / Math.max(Math.pow(d, dec), 0.01); if (q2.range > 0) { if (d >= q2.range) continue; var w = 1 - Math.pow(d / q2.range, 4); at *= w * w; } e += (0.2126 * q2.__r0 + 0.7152 * q2.__g0 + 0.0722 * q2.__b0) * scale[Ls[j]] * at * dy / d; } return e; }
    function irZ(zz) { var f = fc.faces[zz], Ls = (byZ.get(zz) || []).concat(unb); if (!f || !f.length || !Ls.length) return 0; var e = 0, nf = f.length / 6, st = Math.max(1, Math.floor(nf / 400)), cnt = 0;
      for (var fi = 0; fi < nf; fi += st) { var o = fi * 6; cnt++; for (var j = 0; j < Ls.length; j++) { var q3 = L[Ls[j]], lx = q3.x - f[o], ly = q3.y - f[o + 1], lz2 = q3.z - f[o + 2], d = Math.sqrt(lx * lx + ly * ly + lz2 * lz2); if (!(d > 1e-4)) continue;
        var cs = (lx * f[o + 3] + ly * f[o + 4] + lz2 * f[o + 5]) / d; if (cs <= 0) continue; var at = 1 / Math.max(Math.pow(d, dec), 0.01); if (q3.range > 0) { if (d >= q3.range) continue; var w = 1 - Math.pow(d / q3.range, 4); at *= w * w; }
        e += (0.2126 * q3.__r0 + 0.7152 * q3.__g0 + 0.0722 * q3.__b0) * scale[Ls[j]] * at * cs; } } return k2 * e / Math.max(1, cnt); }
    var judged = R.filter(function (r) { return r.lamps.length && r.samp.length; }), achieved = [];
    for (var it = 0; it < 3; it++) {
      var irc = new Map(); judged.forEach(function (r) { var e = 0; r.samp.forEach(function (sp) { if (!irc.has(sp[1])) irc.set(sp[1], irZ(sp[1])); e += Edir(sp[0], sp[1]) + irc.get(sp[1]); }); r.E = e / r.samp.length * luxPer; });
      judged.forEach(function (r) { if (r.E > 0) { var f2 = r.row[1] / r.E; r.s *= f2; r.lamps.forEach(function (li2) { scale[li2] = r.s; }); } });
    }
    // "fairly lit by size" (red1): a room whose lamps barely reach it asks for an absurd boost (Clinic max x75,798) — its scale is
    // capped at the building's p90 room scale; a lamp in no room box takes the building's median room scale (both data-derived)
    var s0 = judged.map(function (r) { return r.s; }).sort(function (a, b) { return a - b; }), sMed = s0.length ? s0[s0.length >> 1] : 1, sP90 = s0.length ? s0[Math.floor(s0.length * 0.9)] : 1, capped = 0;
    judged.forEach(function (r) { if (r.s > sP90) { r.s = sP90; capped++; r.lamps.forEach(function (li2) { scale[li2] = sP90; }); } });
    // §LAMP_EN_ZONE (red1 "Go", 2026-09-26): a lamp in no room box (Hospital: 1270 of 1274 — only 8 rooms injected) is scaled per
    // LIGHT ZONE instead of taking the median: the zone's own 0.8 m working-plane cells (the §SKY_VIEW_FIELD stats samples) meet
    // the default row (habitable, EN_TABLE) from all its lamps + its IR, 3 passes, same p90 cap over the zone scales; a zone with
    // no working-plane cells keeps the median room scale
    var zU = new Map(); for (var l5 = 0; l5 < n; l5++) if (room[l5] < 0) { scale[l5] = sMed; var zz5 = lzs[l5]; if (zz5 > 0 && zz5 !== OUTSIDE) { var a5 = zU.get(zz5); if (!a5) zU.set(zz5, a5 = []); a5.push(l5); } }
    var FS = fieldLast && fieldLast.stats, zj = [], nxz = Z.nx, nxyz = Z.nx * Z.ny, clz = Z.cell, tgt = EN_TABLE.habitable[1];
    zU.forEach(function (ls, zz6) { var zr = FS && FS.zones[zz6]; if (!zr || !zr.samples || !zr.samples.length) return;
      var sp = zr.samples.map(function (c) { return [{ x: Z.org.x + (c % nxz + 0.5) * clz, y: Z.org.y + ((((c / nxz) | 0) % Z.ny) + 0.5) * clz, z: Z.org.z + (((c / nxyz) | 0) + 0.5) * clz }, zz6]; });
      zj.push({ z: zz6, lamps: ls, samp: sp, s: sMed }); });
    for (var it2 = 0; it2 < 3; it2++) { var irz = new Map();
      zj.forEach(function (r) { var e = 0; r.samp.forEach(function (sp2) { if (!irz.has(sp2[1])) irz.set(sp2[1], irZ(sp2[1])); e += Edir(sp2[0], sp2[1]) + irz.get(sp2[1]); }); r.E = e / r.samp.length * luxPer; });
      zj.forEach(function (r) { if (r.E > 0) { r.s *= tgt / r.E; r.lamps.forEach(function (li3) { scale[li3] = r.s; }); } }); }
    var zs0 = zj.map(function (r) { return r.s; }).sort(function (a, b) { return a - b; }), zP90 = zs0.length ? zs0[Math.floor(zs0.length * 0.9)] : sMed, zCapped = 0;
    zj.forEach(function (r) { if (r.s > zP90) { r.s = zP90; zCapped++; r.lamps.forEach(function (li4) { scale[li4] = zP90; }); } });
    var zAch = []; { var irz2 = new Map(); zj.forEach(function (r) { var e = 0; r.samp.forEach(function (sp3) { if (!irz2.has(sp3[1])) irz2.set(sp3[1], irZ(sp3[1])); e += Edir(sp3[0], sp3[1]) + irz2.get(sp3[1]); }); zAch.push(e / r.samp.length * luxPer / tgt); }); }
    zAch.sort(function (a, b) { return a - b; });
    var zLamps = zj.reduce(function (t, r) { return t + r.lamps.length; }, 0);
    console.log('§LAMP_EN_ZONE zones=' + zj.length + ' lamps=' + zLamps + ' (of ' + unassignedCount() + ' in no room) target=' + tgt + 'lx scale p10/p50/p90=' + (zs0.length ? [zs0[Math.floor(zs0.length * 0.1)], zs0[zs0.length >> 1], zP90].map(function (v) { return v.toFixed(3); }).join('/') : '-') +
      ' cappedAtP90=' + zCapped + ' achieved E/EN p10/p50/p90=' + (zAch.length ? [zAch[Math.floor(zAch.length * 0.1)], zAch[zAch.length >> 1], zAch[Math.floor(zAch.length * 0.9)]].map(function (v) { return v.toFixed(2); }).join('/') : '-'));
    function unassignedCount() { var u = 0; for (var q6 = 0; q6 < n; q6++) if (room[q6] < 0) u++; return u; }
    { var irc2 = new Map(); judged.forEach(function (r) { var e = 0; r.samp.forEach(function (sp) { if (!irc2.has(sp[1])) irc2.set(sp[1], irZ(sp[1])); e += Edir(sp[0], sp[1]) + irc2.get(sp[1]); }); r.E = e / r.samp.length * luxPer; }); }
    judged.forEach(function (r) { achieved.push(r.E / r.row[1]); });
    for (var l3 = 0; l3 < n; l3++) { var q4 = L[l3], sc = scale[l3]; q4.r = q4.__r0 * sc; q4.g = q4.__g0 * sc; q4.b = q4.__b0 * sc; q4.I = q4.__I0 * sc; q4.en = sc; }
    var ss = judged.map(function (r) { return r.s; }).sort(function (a, b) { return a - b; }), ac = achieved.sort(function (a, b) { return a - b; }), pq = function (a, f) { return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))].toFixed(2) : '-'; };
    var cats = {}; judged.forEach(function (r) { var ck = r.cat.indexOf('use:') === 0 ? 'realUse' : r.cat; cats[ck] = (cats[ck] || 0) + 1; });
    if (SU) console.log('§SPACE_USES applied lampsByRealUse=' + suN + ' byEnRow ' + JSON.stringify(suRows) + ' default(200 lx, no EN row for the name) ' + JSON.stringify(suUnmatched));
    var unassigned = 0; for (var l4 = 0; l4 < n; l4++) if (room[l4] < 0) unassigned++;
    var out = { rooms: R.length, judged: judged.length, lampsInRooms: n - unassigned, unassigned: unassigned, s: [pq(ss, 0.1), pq(ss, 0.5), pq(ss, 0.9), ss.length ? ss[0].toFixed(2) : '-', ss.length ? ss[ss.length - 1].toFixed(2) : '-'], achieved: [pq(ac, 0.1), pq(ac, 0.5), pq(ac, 0.9)], ms: Math.round(performance.now() - t0) };
    console.log('§LAMP_EN applied rooms=' + out.rooms + ' judged(lamps+wp)=' + out.judged + ' ' + JSON.stringify(cats) + ' lampsInRooms=' + out.lampsInRooms + ' unassigned(-> median ' + sMed.toFixed(3) + ')=' + unassigned + ' cappedAtP90(' + sP90.toFixed(3) + ')=' + capped +
      ' scale p10/p50/p90/min/max=' + out.s.join('/') + ' achieved E/EN p10/p50/p90=' + out.achieved.join('/') + ' (3 passes; direct + zone IR on the 0.8 m plane) table=' +
      Object.keys(EN_TABLE).map(function (k) { return k + ':' + EN_TABLE[k][1]; }).join(',') + ' ms=' + out.ms);
    return out;
  }
  // a data path that cannot run must not leave the still without lamps: back to the capped pool, logged
  function lampFail(A, why) {
    LAMP[0] = 0; A._lampDataOn = false; A._lampData = null; lampVer = -1;
    console.warn('§LAMP_UNCAPPED fallback (' + why + '): A._lampDataOn=false, the capped point-light pool rebuilds');
    try { if (typeof A._nightUpdateLights === 'function') A._nightUpdateLights(); } catch (e) {}
    return null;
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
    if (U.uSLGround) U.uSLGround.value = (active && gtex && SKY[1] > 0.5) ? gtex : dGround;
    if (U.uSLIrP) { U.uSLIrP.value = IRP; U.uSLIr.value = (active && IRP[0] > 0.5 && irTex) ? irTex : dIr; }
    if (U.uSLCoveP) { U.uSLCoveP.value = COVEP; U.uSLCoveQ.value = COVEQ; U.uSLCove.value = (active && COVEP[3] > 0.5 && coveTex) ? coveTex : dCove; }   // §COVE_LIGHT
    if (U.uSLLamp) { var lo = active && LAMP[0] > 0.5 && lampTex; U.uSLLamp.value = LAMP; U.uSLCluDim.value = CDIM; U.uSLLampT.value = lo ? lampTex : dLamp; U.uSLLIdx.value = lo ? idxTex : dIdx; U.uSLClu.value = lo ? cluTex : dClu; }
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
    installed = false; P[0] = 0; LAMP[0] = 0;
    if (A._lampDataOn) { A._lampDataOn = false; A._lampData = null; try { if (typeof A._nightUpdateLights === 'function') A._nightUpdateLights(); } catch (eF) {} }
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
  var ctxHooked = false;
  // the RG16UI texel array: R = zone | SKY_BIT, G = 0 (stageField fills the sky-view F)
  function zoneRG(Z) { var a = new Uint16Array(Z.zone.length * 2); for (var ri = 0; ri < Z.zone.length; ri++) a[ri * 2] = Z.zone[ri]; return a; }
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
    if (!fieldOn(A) || !LZ.field) { SKY[0] = 0; SKY[1] = 0; console.log('§SKY_VIEW_FIELD off (' + (A._maxqActive ? 'film' : '&skyfield=0 / APP._stillSkyField=false') + ') — binary SKY_BIT path'); return null; }
    var hit = !!Z.field, ghit = !!(Z.field && Z.field.Gd && Z.field.ground && Z.field.ground.mode === LZ.groundMode(A)), F = LZ.field(A), key = texKey, uploadMs = 0;
    if (rgFieldKey !== key) { if (!rg) { rg = zoneRG(Z); tex.image.data = rg; } for (var i = 0; i < F.G.length; i++) rg[i * 2 + 1] = F.G[i]; var tU = performance.now(); tex.needsUpdate = true; A.renderer.initTexture(tex); uploadMs = performance.now() - tU; rgFieldKey = key; }
    SKY[0] = 1;
    // §GROUND_VIEW_FIELD: Gd uploaded as its own R16UI texture (the array is light_zones' Gd itself: the CPU mirror + the IDB
    // record read the same bytes, no copy to drop); uSLSky.y tells the shader to split the hemi
    var gOn = !!(LZ.groundOn(A) && F.Gd), gUp = 0, gs = F.ground;
    if (gOn) { if (gKey !== key || !gtex) { if (gtex) gtex.dispose(); gtex = groundTex3D(global.THREE, F.Gd, Z.nx, Z.ny, Z.nz); var tG = performance.now(); A.renderer.initTexture(gtex); gUp = performance.now() - tG; gKey = key; } SKY[1] = 1; }
    else SKY[1] = 0;
    console.log('§GROUND_VIEW_FIELD ' + (gOn ? 'on' : 'off (' + (F.Gd ? 'APP._stillGroundView=false / &groundview=0' : 'no ground field built') + ' — hemi ground half x F as before)') +
      (gs ? ' mode=' + gs.mode + ' cache=' + (ghit ? 'hit' : 'built') + ' buildMs=' + gs.ms + ' dirs=' + gs.dirs + ' coveredCells=' + gs.covered + ' nonZero=' + gs.nonZero + ' Gd p10/p50/p90/max=' + gs.p10 + '/' + gs.p50 + '/' + gs.p90 + '/' + gs.max + ' uploadMs=' + gUp.toFixed(0) + ' texMB=' + (F.Gd.byteLength / 1e6).toFixed(1) : '') +
      ' (hemi = F x sky half + Gd x ground half; ambient + IBL x F as before)');
    if (statsKey !== key) { fieldStats = computeStats(A, Z, F); statsKey = key; }
    var S = fieldStats, lit = [], enc = [], maxWp = 0;
    S.zones.forEach(function (r) { if (!r || !(r.Fwp > 0) || !r.floorM2) return; lit.push([r.Fwp, r.floorM2]); if (r.enclosed) enc.push([r.Fwp, r.floorM2]); if (r.Fwp > maxWp) maxWp = r.Fwp; });
    lit.sort(function (a, b) { return a[0] - b[0]; }); enc.sort(function (a, b) { return a[0] - b[0]; });
    var dist = function (a) { return a.length ? 'n=' + a.length + ' p10/p50/p90/max=' + [pct(a, 0.1), pct(a, 0.5), pct(a, 0.9), a[a.length - 1][0]].map(function (v) { return (100 * v).toFixed(2); }).join('/') + '%' : 'n=0'; };
    var gm = (Z.glassMats || []).map(function (g) { return g.name + ':op' + g.opacity + ':T' + g.T + ':' + g.m2.toFixed(0) + 'm2'; });
    console.log('§SKY_VIEW_FIELD on cache=' + (hit ? 'hit' : 'built') + ' dirs=' + F.dirs + ' minElevDeg=' + F.minElevDeg.toFixed(2) + ' (CIE overcast weights, cos x (1+2 sin elev) x dOmega; lowest-weight dir ' + Math.min.apply(null, F.weights) + ') sweepMs=' + F.ms +
      ' activeCells=' + F.active + ' coveredCells=' + F.covered + ' glassCells=' + Z.glassCells + ' maxF=' + F.maxF.toFixed(4) + ' (sky component max ' + F.maxSC.toFixed(4) + ') ' + (F.maxF <= 1 ? 'ASSERT_MAXF_LE_1 PASS' : 'ASSERT_MAXF_LE_1 FAIL') +
      ' irc=' + (F.irc.on ? 'ON (&irc=1, A/B)' : 'off (default: the GI bounce carries it)') + ' irc(zones/median/max)=' + F.irc.zones + '/' + (100 * F.irc.median).toFixed(3) + '%/' + (100 * F.irc.max).toFixed(2) + '% (V12, R 0.5)' +
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
  // §LUX_CHECK per-zone relation (owner of "existing E on the working plane"; §COVE_LIGHT reads it for the deficit): sky
  // (F_wp x the scene's horizontal sky illuminance) + zone-bound lamps direct (V9) + lamp interreflection. A zone with no
  // working-plane cells (a plenum / crevice thinner than 0.8 m) has no direct lamp term: its sky = mean-F x EskyH, lamps = IR.
  // Returns null when the sun is not calibrated (no lux scale).
  function luxRows(A, Z) {
    if (!fieldLast) return null;
    var S = fieldLast.stats, LZ = global.LightZones, sunI = A._stillCalibSunI, sunLux = A._stillCalibSunLux || 100000;
    if (!(sunI > 0)) return null;
    var luxPer = sunLux / sunI, h = A.hemi, am = A.ambient, EskyU = (h ? lum3(h.color) * h.intensity : 0) + (am ? lum3(am.color) * am.intensity : 0), EskyLux = EskyU * luxPer;
    var lamps = new Map(), lampSrc = 'point lights';
    // §LAMP_UNCAPPED data path: the still has no lamp point lights — read A._lampData (colour already x intensity) so this check
    // is not silently lamp-blind (it read lamps=0 in every zone after 524c3db1)
    if (A._lampDataOn && A._lampData && LAMP[0] > 0.5) { lampSrc = 'lamp data'; A._lampData.lamps.forEach(function (q) { if (!(q.I > 0)) return; var z = lampZone(LZ, q); if (!(z > 0) || z === OUTSIDE) return;
        var a = lamps.get(z); if (!a) { a = []; lamps.set(z, a); } a.push({ position: { x: q.x, y: q.y, z: q.z }, color: { r: q.r, g: q.g, b: q.b }, intensity: 1, distance: q.range, decay: A._lampData.decay }); }); }
    else A.scene.traverse(function (l) { if (!l.isPointLight || !l.visible || !(l.intensity > 0) || l === A._camLight) return; var z = l.userData && l.userData.sourcedZone; if (!(z > 0)) return; var a = lamps.get(z); if (!a) { a = []; lamps.set(z, a); } a.push(l); });
    var nx = Z.nx, nxy = nx * Z.ny, cl = Z.cell, rows = [], nzn = Z.zones, existing = new Float32Array(nzn + 1), en = new Array(nzn + 1), use = new Array(nzn + 1);
    var att = function (d, cut, decay) { var f = 1 / Math.max(Math.pow(d, decay), 0.01); if (cut > 0) { var x = Math.max(0, Math.min(1, 1 - Math.pow(d / cut, 4))); f *= x * x; } return f; };
    for (var z = 1; z <= nzn; z++) { var r = S.zones[z], L = lamps.get(z) || [], El = 0, wp = !!(r && r.wpCells);
      if (wp && L.length && r.samples.length) { r.samples.forEach(function (c) { var px = Z.org.x + (c % nx + 0.5) * cl, py = Z.org.y + ((((c / nx) | 0) % Z.ny) + 0.5) * cl, pz = Z.org.z + (((c / nxy) | 0) + 0.5) * cl;
          L.forEach(function (l) { var dx = l.position.x - px, dy = l.position.y - py, dz = l.position.z - pz, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3; if (dy <= 0) return; El += lum3(l.color) * l.intensity * att(d, l.distance, l.decay) * dy / d; }); });
        El = El / r.samples.length * luxPer; }
      var Eir = (irLampZ && IRP[0] > 0.5 && L.length) ? irLampZ[z] * luxPer : 0; El += Eir;   // EN maintained illuminance includes interreflection
      var u = S.uses.byZone.get(z), Es = (r ? (wp ? r.Fwp : r.Fmean) : 0) * EskyLux;
      existing[z] = Es + El; en[z] = u ? u.en : null; use[z] = u ? u.use : null;
      if (wp) rows.push({ z: z, floorM2: r.floorM2, Fwp: r.Fwp, Esky: Es, Elamps: El, Ecove: 0, Etotal: Es + El, lamps: L.length, use: use[z], en: en[z] }); }
    return { rows: rows, existing: existing, en: en, use: use, EskyLux: EskyLux, luxPer: luxPer, lampSrc: lampSrc, sunI: sunI, sunLux: sunLux, S: S };
  }
  // §LUX_CHECK — per zone, lux on the working plane: sky + zone-bound lamps (+ IR) + the §COVE_LIGHT cove; verdict vs the EN row
  function luxCheck(A, Z) {
    if (!fieldLast) return null;
    var X = luxRows(A, Z);
    if (!X) { console.log('§LUX_CHECK VACUOUS no calibrated sun (calibSunI=' + A._stillCalibSunI + ')'); return null; }
    var S = X.S, rows = X.rows, fails = [], counts = { withEN: 0, fail: 0, unknown: 0, unverified: 0 }, EskyLux = X.EskyLux, luxPer = X.luxPer, lampSrc = X.lampSrc, CW = coveLast && coveLast.wpE;
    rows.forEach(function (r) { r.Ecove = CW ? CW[r.z] : 0; r.Etotal = r.Esky + r.Elamps + r.Ecove; var Et = r.Etotal, en = r.en, u = r.use;
      r.verdict = !u ? 'unknown' : (en == null ? 'unverified' : (Et < 0.5 * en ? 'FAIL' : 'PASS'));
      if (r.verdict === 'unknown') counts.unknown++; else if (r.verdict === 'unverified') counts.unverified++; else { counts.withEN++; if (r.verdict === 'FAIL') counts.fail++; }
      r.why = r.verdict === 'FAIL' ? (r.Esky < 0.5 * en && r.Elamps < 0.5 * en ? (r.lamps ? 'lamps under EN and sky share low' : 'no zone lamps, sky share low') : '') : '';
      if (r.verdict === 'FAIL') fails.push(r); });
    var fmt = function (r) { return r.z + ':' + (r.use || 'unknown') + ':EN' + (r.en == null ? '-' : r.en) + (r.en != null ? '(prEN2019)' : '') + ':sky' + r.Esky.toFixed(0) + '+lamps' + r.Elamps.toFixed(0) + (r.Ecove > 0 ? '+cove' + r.Ecove.toFixed(0) : '') + '=' + r.Etotal.toFixed(0) + 'lx:F' + (100 * r.Fwp).toFixed(2) + '%:lamps' + r.lamps + ':' + r.floorM2.toFixed(0) + 'm2:' + r.verdict + (r.why ? '(' + r.why + ')' : ''); };
    var byM2 = rows.slice().sort(function (a, b) { return b.floorM2 - a.floorM2; });
    console.log('§LUX_CHECK zones=' + rows.length + ' spaces=' + S.uses.spaces + ' (' + S.uses.src + ', mapped ' + S.uses.mapped + ') withEN=' + counts.withEN + ' FAIL=' + counts.fail + ' unverified=' + counts.unverified + ' unknown=' + counts.unknown +
      ' EskyH=' + EskyLux.toFixed(0) + 'lx (hemi+ambient up, luxPerUnit=' + luxPer.toFixed(1) + ' = ' + X.sunLux + ' lx / calibSunI ' + X.sunI.toFixed(3) + ') exposure=' + A.renderer.toneMappingExposure.toFixed(3) +
      (A._meterLast ? ' stops=' + A._meterLast.stops.toFixed(2) : ' stops=0 (meter: outside/off)') + ' largest [' + byM2.slice(0, 8).map(fmt).join(' ') + '] FAILrows [' + fails.slice(0, 20).map(fmt).join(' ') + ']');
    // §COVE_LIGHT gate: per cove zone (working-plane cells) the total meets its LEVEL (deficit + existing) within 10 %
    if (coveLast && coveLast.zones) { var cj = 0, ok = 0, worst = null; rows.forEach(function (r) { var cz = coveLast.zones[r.z]; if (!cz) return; cj++; var rel = Math.abs(r.Etotal - cz.level) / cz.level; if (rel <= 0.1) ok++; if (!worst || rel > worst.rel) worst = { z: r.z, rel: rel, Etotal: r.Etotal, level: cz.level }; });
      console.log('§COVE_LIGHT LUXCHECK ' + (cj ? '' : 'VACUOUS ') + 'coveZonesWithWp=' + cj + ' within10pct=' + ok + (worst ? ' worst z' + worst.z + ' Etotal=' + worst.Etotal.toFixed(1) + ' level=' + worst.level + ' rel=' + (100 * worst.rel).toFixed(1) + '%' : '') + ' (identity by construction; a miss = quantisation / stride)'); }
    // §LAMP_EN (dry run, red1 2026-09-26: "lamp strength should be commensurate with indoor space, a standard governs it"): per zone
    // with an EN 12464-1 row, the scale s = Em / (lamp direct + lamp interreflection on the 0.8 m working plane) that would make
    // its lamps meet the row; nothing is applied yet
    (function () { var sc = [], noLamp = 0, noLampM2 = 0, enM2 = 0, unkM2 = 0, totM2 = 0, byUse = {};
      rows.forEach(function (r) { totM2 += r.floorM2; if (r.en == null) { unkM2 += r.floorM2; return; } enM2 += r.floorM2; var El2 = r.Elamps; if (!(El2 > 0)) { noLamp++; noLampM2 += r.floorM2; return; }
        var sv = r.en / El2; sc.push([sv, r.floorM2]); var k = r.use.split(' ')[0]; (byUse[k] = byUse[k] || []).push(sv); });
      sc.sort(function (a, b) { return a[0] - b[0]; });
      var q = function (f) { return sc.length ? pct(sc, f).toFixed(2) : '-'; };
      console.log('§LAMP_EN dry-run lampSource=' + lampSrc + ' zonesWithEN=' + (sc.length + noLamp) + ' (' + enM2.toFixed(0) + ' m2 of ' + totM2.toFixed(0) + ' floor; unknown use ' + unkM2.toFixed(0) + ' m2)' +
        ' scale s=EN/Elamps floor-m2 p10/p50/p90=' + q(0.1) + '/' + q(0.5) + '/' + q(0.9) + ' min/max=' + (sc.length ? sc[0][0].toFixed(2) + '/' + sc[sc.length - 1][0].toFixed(2) : '-') +
        ' EN-zones with no lamp=' + noLamp + ' (' + noLampM2.toFixed(0) + ' m2) byUse median s ' + Object.keys(byUse).map(function (k) { var a = byUse[k].sort(function (x, y) { return x - y; }); return k + ':' + a[a.length >> 1].toFixed(2) + '(n' + a.length + ')'; }).join(' '));
    })();
    var cz = (A._sourcedCap && A._sourcedCap.camZone) || 0, cr = rows.filter(function (r) { return r.z === cz; })[0];
    console.log('§LUX_CHECK_CAM camZone=' + cz + ' ' + (cr ? fmt(cr) : '(no working-plane cells / camera not in a zone)') + ' exposure=' + A.renderer.toneMappingExposure.toFixed(3) + (A._meterLast ? ' stops=' + A._meterLast.stops.toFixed(2) : ''));
    luxLast = { rows: rows, EskyLux: EskyLux, luxPer: luxPer };
    return luxLast;
  }


  // ══ §COVE_LIGHT (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "§COVE_LIGHT — SPEC (2026-09-25…)" + WATCHDOG GATE + RED1
  // AMENDMENT; red1: "a dark place just gets a ceiling-perimeter back glow" / "there are crevices where MEP goes through, so
  // ALL compartments must have trim lighting") ══
  // BUILD per building + lamp set (camera-free, keyed, cached), DECIDE per frame = the one filtered texel read in slFragZone.
  // 1. ZONE TYPE (amendment b), from the grid per light zone: shaft = vertical extent > 2 x the largest horizontal bbox side
  //    (tested first); room = walkable floor (floor cells with >= 2.0 m clear headroom, UK AD K) of >= 4 cells = 1 m2 (a 1-3 cell
  //    pocket is not a floor — a choice, the spec is silent); else headroom < 2.0 m: crevice when the footprint bbox aspect
  //    (long/short) >= 4, void otherwise.
  // 2. LEVEL: room -> its EN 12464-1 row (the §LUX_CHECK IfcSpace-name mapping, EN_ROWS), or with no known use the circulation
  //    row COVE_UNKNOWN_LUX = 100 lx (spec 3: "unknown use -> the circulation row"); void / crevice / shaft -> TRIM_LUX_VOID =
  //    100 lx (amendment c, DECIDED by the watchdog: the EN 12464-1 circulation row via secondary summaries; the primary
  //    standard was not consulted; swappable here).
  // 3. DEFICIT (watchdog gate): coveE = max(0, level - existingE); existingE = luxRows (lamps direct + lamp IR + sky on the
  //    0.8 m plane — the owned §LUX_CHECK relation). The cove output is set so the zone's MEAN working-plane E from the cove
  //    equals the deficit (spec 3's analytic calibration, on the §SKY_VIEW_FIELD stats samples of the zone); a zone with no
  //    working-plane cell (thinner than 0.8 m) is calibrated on the mean |V| over all its cells instead (stated).
  // 4. EMITTERS (spec 2, amendment d): ceiling-edge cells = zone cells with SOLID directly above AND SOLID on a horizontal side;
  //    one emitter per cell (every 0.5 m), 0.1 m below the ceiling, 0.15 m off each solid side. A zone ONE cell tall gets one
  //    line along its long axis at mid-height; a shaft only the cells within its top two layers. More than COVE_MAX_EMIT
  //    emitters -> every s-th carries weight s (density kept).
  // 5. FIELD (spec 4), two Lambert lobes per cell, both from the same calibrated strip output:
  //    DOWN lobe — the indirect cove: the strip washes the ceiling patch above it, which re-radiates; the source is a Lambertian
  //    patch at the ceiling plane over each emitter (axis -y). Per zone cell the irradiance VECTOR V = sum_e w_e cos_e / d^2 x
  //    unit(e - c) (Arvo); the fragment takes max(0, N . V): floors, walls, duct tops.
  //    UP lobe — the strip's own upward emission (axis +y, from COVE_LEDGE under the ceiling, see the constant) onto
  //    downward-facing receivers: U = sum_e w_e cos_e cos_r / d^2; the fragment takes U x max(0, -N.y): the ceiling band, duct
  //    and slab undersides (without it every ceiling of a cove zone stayed black — the down lobe cannot reach them).
  //    Visibility for both is marched through the zone's own cells (SOLID or another zone blocks); emitters farther than COVE_R
  //    are ignored. Storage: one RGBA8UI 3D texture of its own (uSLCove; 4 B/cell = the spec's RGBA16UI B/A channel budget) —
  //    R = |V| log-8, G|B = octahedral dir of V, A = U log-8 (range 2^COVE_LOG_RANGE under the building's max, uSLCoveQ); kept
  //    separate from the RG16UI zone texture so its reads and §ZONE_TEX_CPU_DROP stay untouched (the §GROUND_VIEW_FIELD pattern).
  //    Read through the same 8-texel stencil as _slF; the term is directional, varies cell to cell, is exactly 0 outside cove
  //    zones. Zero lights, zero program keys, two vec4 uniforms (colour + on, log range).
  // 6. STRIP (spec: "a VISIBLE thin emissive strip"): one merged MeshBasicMaterial mesh per building, 0.04 m bars along the
  //    emitter lines, colour 0xffe4b5 (tools.js NIGHT_AMBER), excludeFromShadow, Alt+S only (added in stage, removed in unstage;
  //    films never call stage). &cove=0 / APP._stillCove=false = off. Budget: a zone whose cells x emitters x steps exceed
  //    COVE_BUDGET is computed on a cell stride (2..4) and filled from the nearest computed cell (logged).
  var COVEP = new Float32Array(4), COVEQ = new Float32Array(4), coveTex = null, dCove = null, coveKey = null, coveLast = null, coveMesh = null;
  var TRIM_LUX_VOID = 100, COVE_UNKNOWN_LUX = 100, COVE_R = 15, COVE_MAX_EMIT = 512, COVE_BUDGET = 30e6, COVE_COLOUR = 0xffe4b5, COVE_TYPES = ['', 'room', 'void', 'crevice', 'shaft'];
  // COVE_LEDGE: the UP lobe's strip height below the ceiling for the FIELD = one cell (0.5 m). The visible strip sits at the
  // spec's 0.1 m, but a source 0.1 m under the ceiling lies ABOVE every cell centre of the 0.5 m lattice (the top layer's centres
  // are 0.25 m down), so its upward Lambert lobe reached no cell and every ceiling stayed black (measured: Hospital plenum pose
  // 22 % black with the down lobe alone). One cell is the smallest offset the grid resolves; stated, not tuned.
  var COVE_LEDGE = 0.5, COVE_LOG_RANGE = 12;   // log-8 codes span 2^12 = 4096:1 below the building's maximum
  function coveTex3D(THREE, data, w, h, d) { var t = new THREE.Data3DTexture(data, w, h, d); t.format = THREE.RGBAIntegerFormat; t.type = THREE.UnsignedByteType; t.internalFormat = 'RGBA8UI'; t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true; return t; }
  function coveOn(A) { return !(A._stillCove === false || /[?&]cove=0/.test(location.search)); }
  function octEnc(x, y, z) { var l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1; x /= l; y /= l; z /= l; var u = x, v = z;
    if (y < 0) { u = (1 - Math.abs(z)) * (x >= 0 ? 1 : -1); v = (1 - Math.abs(x)) * (z >= 0 ? 1 : -1); }
    return Math.round((u * 0.5 + 0.5) * 255) | (Math.round((v * 0.5 + 0.5) * 255) << 8); }
  // zone types + per-zone sorted cell lists + bboxes (one grid pass), cached on the zone cache
  function coveTypes(Z) {
    if (Z.coveT) return Z.coveT;
    var t0 = performance.now(), nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny, N = nx * ny * nz, zone = Z.zone, nzn = Z.zones;
    var cnt = new Int32Array(nzn + 2), bb = new Int32Array((nzn + 1) * 6), walk = new Int32Array(nzn + 1), hmax = new Int32Array(nzn + 1), floorN = new Int32Array(nzn + 1);
    for (var z0 = 1; z0 <= nzn; z0++) { bb[z0 * 6] = nx; bb[z0 * 6 + 1] = ny; bb[z0 * 6 + 2] = nz; bb[z0 * 6 + 3] = -1; bb[z0 * 6 + 4] = -1; bb[z0 * 6 + 5] = -1; }
    for (var c = 0; c < N; c++) { var v = zone[c]; if (v === SOLID) continue; var z = v & 0x3FFF; if (!z) continue; cnt[z]++;
      var i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0, o = z * 6;
      if (i < bb[o]) bb[o] = i; if (j < bb[o + 1]) bb[o + 1] = j; if (k < bb[o + 2]) bb[o + 2] = k; if (i > bb[o + 3]) bb[o + 3] = i; if (j > bb[o + 4]) bb[o + 4] = j; if (k > bb[o + 5]) bb[o + 5] = k;
      if (j === 0 || zone[c - nx] === SOLID) { floorN[z]++; var h = 1; while (j + h < ny && zone[c + h * nx] !== SOLID) h++; if (h > hmax[z]) hmax[z] = h; if (h >= 4) walk[z]++; } }
    var off = new Int32Array(nzn + 2); for (var z1 = 1; z1 <= nzn; z1++) off[z1 + 1] = off[z1] + cnt[z1];
    var cells = new Int32Array(off[nzn + 1]), fill = new Int32Array(nzn + 2);
    for (var c2 = 0; c2 < N; c2++) { var v2 = zone[c2]; if (v2 === SOLID) continue; var z2 = v2 & 0x3FFF; if (!z2) continue; cells[off[z2] + fill[z2]++] = c2; }   // ascending cell index per zone
    var type = new Uint8Array(nzn + 1), by = { room: 0, void: 0, crevice: 0, shaft: 0 };
    for (var z3 = 1; z3 <= nzn; z3++) { var o3 = z3 * 6, dx = bb[o3 + 3] - bb[o3] + 1, dy = bb[o3 + 4] - bb[o3 + 1] + 1, dz = bb[o3 + 5] - bb[o3 + 2] + 1, t;
      if (dy > 2 * Math.max(dx, dz)) t = 4; else if (walk[z3] >= 4) t = 1; else t = (Math.max(dx, dz) / Math.max(1, Math.min(dx, dz)) >= 4) ? 3 : 2;
      type[z3] = t; by[COVE_TYPES[t]]++; }
    Z.coveT = { type: type, by: by, bb: bb, cells: cells, off: off, walk: walk, hmax: hmax, floorN: floorN, ms: Math.round(performance.now() - t0) };
    return Z.coveT;
  }
  // emitters of one zone: e = [sx, sy(ceiling plane), sz, weight] x n (the field's sources), strip = [x, y, z, axis(0 along x, 1 along z)] (the visible bars)
  function coveEmitters(Z, T, z) {
    var nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny, zone = Z.zone, cl = Z.cell, o = z * 6, bb = T.bb, cells = T.cells, thin = (bb[o + 4] - bb[o + 1] + 1) < 2, shaft = T.type[z] === 4, out = [], strip = [];
    if (thin) {   // amendment d: one line along the long axis, mid-height — per long-axis slice the middle cell of the slice
      var alongX = (bb[o + 3] - bb[o]) >= (bb[o + 5] - bb[o + 2]), sl = new Map();
      for (var q = T.off[z]; q < T.off[z + 1]; q++) { var c = cells[q], i = c % nx, k = (c / nxy) | 0, a = alongX ? i : k, b = alongX ? k : i; var arr = sl.get(a); if (!arr) sl.set(a, arr = []); arr.push([b, c]); }
      sl.forEach(function (arr) { arr.sort(function (p, q2) { return p[0] - q2[0]; }); var c = arr[arr.length >> 1][1], i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0;
        var x = Z.org.x + (i + 0.5) * cl, zz = Z.org.z + (k + 0.5) * cl; out.push(x, Z.org.y + (j + 1) * cl, zz, 1); strip.push(x, Z.org.y + (j + 0.5) * cl, zz, alongX ? 0 : 1); });
    } else {
      var jTop = bb[o + 4];
      for (var q2 = T.off[z]; q2 < T.off[z + 1]; q2++) { var c2 = cells[q2], i2 = c2 % nx, j2 = ((c2 / nx) | 0) % ny, k2 = (c2 / nxy) | 0;
        if (!(j2 + 1 >= ny || zone[c2 + nx] === SOLID)) continue; if (shaft && j2 < jTop - 1) continue;
        var sxm = i2 === 0 || zone[c2 - 1] === SOLID, sxp = i2 === nx - 1 || zone[c2 + 1] === SOLID, szm = k2 === 0 || zone[c2 - nxy] === SOLID, szp = k2 === nz - 1 || zone[c2 + nxy] === SOLID;
        if (!(sxm || sxp || szm || szp)) continue;
        var x2 = Z.org.x + (i2 + 0.5) * cl + (sxm ? 0.15 : 0) - (sxp ? 0.15 : 0), z2 = Z.org.z + (k2 + 0.5) * cl + (szm ? 0.15 : 0) - (szp ? 0.15 : 0), yc = Z.org.y + (j2 + 1) * cl;
        out.push(x2, yc, z2, 1);
        if (sxm || sxp) strip.push(x2, yc - 0.1, z2, 1); if (szm || szp) strip.push(x2, yc - 0.1, z2, 0); }
    }
    var n = out.length / 4, s = 1;
    if (n > COVE_MAX_EMIT) { s = Math.ceil(n / COVE_MAX_EMIT); var o2 = []; for (var e = 0; e < n; e += s) o2.push(out[e * 4], out[e * 4 + 1], out[e * 4 + 2], s); out = o2; }
    return { e: Float32Array.from(out), strip: strip, perimM: n * cl, n: n, stride: s };
  }
  // per zone cell for unit output (weights in e): V = the down lobe's irradiance vector (ceiling patches at e), U = the up lobe
  // (the strip COVE_LEDGE under the ceiling emitting up, onto a downward-facing receiver at the cell centre); cells whose grid
  // coords are multiples of `st` only; returns the march work
  function coveField(Z, T, z, E, st, V, U) {
    var nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny, zone = Z.zone, cl = Z.cell, cells = T.cells, o0 = T.off[z], n = T.off[z + 1] - o0, e = E.e, ne = e.length / 4, R2 = COVE_R * COVE_R, ox = Z.org.x, oy = Z.org.y, oz = Z.org.z, ic = 1 / cl, work = 0;
    for (var q = 0; q < n; q++) { var c = cells[o0 + q], i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0; if (st > 1 && (i % st || j % st || k % st)) continue;
      var cx = ox + (i + 0.5) * cl, cy = oy + (j + 0.5) * cl, cz = oz + (k + 0.5) * cl, vx = 0, vy = 0, vz = 0, uu = 0;
      for (var m = 0; m < ne; m++) { var dx = e[m * 4] - cx, dy = e[m * 4 + 1] - cy, dz = e[m * 4 + 2] - cz, dh2 = dx * dx + dz * dz; if (dh2 > R2) continue;
        // DOWN lobe: the ceiling patch at e (axis -y) seen from the cell centre
        if (dy > 0) { var d2 = dh2 + dy * dy; if (d2 <= R2 && d2 >= 1e-4) { var d = Math.sqrt(d2), steps = Math.floor((d - 0.3) / cl), vis = true;   // stop 0.3 m short: the source sits on the ceiling face of its own (zone) cell
          for (var s = 1; s <= steps; s++) { var t = s * cl / d, ci = Math.floor((cx + dx * t - ox) * ic), cj = Math.floor((cy + dy * t - oy) * ic), ck = Math.floor((cz + dz * t - oz) * ic);
            if (ci < 0 || cj < 0 || ck < 0 || ci >= nx || cj >= ny || ck >= nz) { vis = false; break; } var vv = zone[ci + cj * nx + ck * nxy]; if (vv === SOLID || (vv & 0x3FFF) !== z) { vis = false; break; } }
          work += steps + 1; if (vis) { var g = e[m * 4 + 3] * (dy / d) / d2 / d; vx += g * dx; vy += g * dy; vz += g * dz; } } }   // Lambertian ceiling patch: cos_e = dy / d
        // UP lobe: the strip COVE_LEDGE under the ceiling (axis +y) onto a downward-facing receiver at the cell centre: cos_e = cos_r = dyu / d
        var dyu = cy - (e[m * 4 + 1] - COVE_LEDGE); if (dyu > 0) { var d2u = dh2 + dyu * dyu; if (d2u <= R2 && d2u >= 1e-4) { var du = Math.sqrt(d2u), stepsU = Math.floor((du - 0.3) / cl), visU = true;
          for (var s2 = 1; s2 <= stepsU; s2++) { var t2 = s2 * cl / du, ci2 = Math.floor((cx + dx * t2 - ox) * ic), cj2 = Math.floor((cy - dyu * t2 - oy) * ic), ck2 = Math.floor((cz + dz * t2 - oz) * ic);
            if (ci2 < 0 || cj2 < 0 || ck2 < 0 || ci2 >= nx || cj2 >= ny || ck2 >= nz) { visU = false; break; } var vv2 = zone[ci2 + cj2 * nx + ck2 * nxy]; if (vv2 === SOLID || (vv2 & 0x3FFF) !== z) { visU = false; break; } }
          work += stepsU + 1; if (visU) uu += e[m * 4 + 3] * (dyu / du) * (dyu / du) / d2u; } } }
      V[q * 3] = vx; V[q * 3 + 1] = vy; V[q * 3 + 2] = vz; U[q] = uu; }
    if (st > 1) {   // fill the skipped cells from the stride-floored cell of the same zone (binary search in the sorted list)
      for (var q3 = 0; q3 < n; q3++) { var c3 = cells[o0 + q3], i3 = c3 % nx, j3 = ((c3 / nx) | 0) % ny, k3 = (c3 / nxy) | 0; if (!(i3 % st || j3 % st || k3 % st)) continue;
        var tc = (i3 - i3 % st) + (j3 - j3 % st) * nx + (k3 - k3 % st) * nxy, lo = 0, hi = n - 1, f = -1; while (lo <= hi) { var mid = (lo + hi) >> 1, cm = cells[o0 + mid]; if (cm === tc) { f = mid; break; } if (cm < tc) lo = mid + 1; else hi = mid - 1; }
        if (f >= 0) { V[q3 * 3] = V[f * 3]; V[q3 * 3 + 1] = V[f * 3 + 1]; V[q3 * 3 + 2] = V[f * 3 + 2]; U[q3] = U[f]; } } }
    return work;
  }
  function coveBuild(A, Z) {
    var THREE = global.THREE; COVEP[3] = 0;
    if (!coveOn(A)) { console.log('§COVE_LIGHT off (&cove=0 / APP._stillCove=false)'); coveLast = null; return null; }
    var X = luxRows(A, Z);
    if (!X) { console.log('§COVE_LIGHT VACUOUS no lux calibration (calibSunI=' + A._stillCalibSunI + ') — no zone judged'); coveLast = null; return null; }
    var D = A._lampDataOn ? A._lampData : null, key = texKey + '|' + (D ? D.ver : 'nolamps') + '|' + X.EskyLux.toFixed(3) + '|' + X.luxPer.toFixed(3) + '|' + (IRP[0] > 0.5 ? irKey : 'noir');
    if (key === coveKey && coveTex) { COVEP[3] = 1; coveStrip(A); return coveLast; }
    coveStripOff(A); if (coveLast && coveLast.geom) coveLast.geom.dispose();   // a rebuild (lamp set / level changed) replaces the strip too
    var t0 = performance.now(), T = coveTypes(Z), nzn = Z.zones, S = X.S, nx = Z.nx, nxy = nx * Z.ny, N = Z.zone.length, luxPer = X.luxPer;
    var zones = new Array(nzn + 1), wpE = new Float32Array(nzn + 1), qual = [], byQ = { room: 0, void: 0, crevice: 0, shaft: 0 }, defs = [], noEmit = 0, emitters = 0, perimM = 0, cellsN = 0, work = 0, strided = 0, strip = [], vs = [], fieldBuilt = 0;
    var CF = Z.coveF || (Z.coveF = new Map());
    for (var z = 1; z <= nzn; z++) { var t = T.type[z], lv = t === 1 ? (X.en[z] != null ? X.en[z] : COVE_UNKNOWN_LUX) : TRIM_LUX_VOID, ex = X.existing[z], df = Math.max(0, lv - ex);
      if (!(df > 0.5)) continue;
      // the unit-output field of a zone depends on the grid only: cached on the zone cache (Z.coveF) so a lamp-set change
      // (the §LAMP_EN ver bump in the first staged frame) re-scales and re-encodes without marching again
      var F0 = CF.get(z);
      if (!F0) { var E = coveEmitters(Z, T, z); if (!E.n) { CF.set(z, null); noEmit++; continue; }
        var n0 = T.off[z + 1] - T.off[z], est = n0 * (E.e.length / 4) * (COVE_R / 2 / Z.cell), st0 = est > COVE_BUDGET ? Math.min(4, Math.ceil(Math.cbrt(est / COVE_BUDGET))) : 1;
        var V0 = new Float32Array(n0 * 3), U0 = new Float32Array(n0), wk = coveField(Z, T, z, E, st0, V0, U0);
        // calibration base: mean working-plane E (up-facing, the zone's 0.8 m sample cells) for unit output
        var r = S.zones[z], e10 = 0, ns0 = 0, o00 = T.off[z], cells0 = T.cells;
        if (r && r.samples && r.samples.length) r.samples.forEach(function (c) { var lo = 0, hi = n0 - 1, f = -1; while (lo <= hi) { var mid = (lo + hi) >> 1, cm = cells0[o00 + mid]; if (cm === c) { f = mid; break; } if (cm < c) lo = mid + 1; else hi = mid - 1; } if (f >= 0) { e10 += Math.max(0, V0[f * 3 + 1]); ns0++; } });
        var calib0 = 'wp'; if (!(ns0 > 0 && e10 > 0)) { calib0 = 'meanV'; e10 = 0; ns0 = 0; for (var q0 = 0; q0 < n0; q0++) { var m0 = Math.sqrt(V0[q0 * 3] * V0[q0 * 3] + V0[q0 * 3 + 1] * V0[q0 * 3 + 1] + V0[q0 * 3 + 2] * V0[q0 * 3 + 2]); if (m0 > 0) { e10 += m0; ns0++; } } }
        F0 = { E: E, st: st0, V: V0, U: U0, e1: e10, ns: ns0, calib: calib0, work: wk, n: n0 }; CF.set(z, F0); work += wk; fieldBuilt++; }
      else if (F0 === null) { noEmit++; continue; }
      var E = F0.E, n = F0.n, st = F0.st, V = F0.V, U = F0.U, e1 = F0.e1, ns = F0.ns, calib = F0.calib; if (st > 1) strided++;
      if (!(ns > 0 && e1 > 0)) { noEmit++; continue; }
      var scale = (df / luxPer) / (e1 / ns), sum = 0, sq = 0, nz0 = 0, mx = 0, upN = 0, upMx = 0;
      for (var q2 = 0; q2 < n; q2++) { var mv = scale * Math.sqrt(V[q2 * 3] * V[q2 * 3] + V[q2 * 3 + 1] * V[q2 * 3 + 1] + V[q2 * 3 + 2] * V[q2 * 3 + 2]); sum += mv; sq += mv * mv; if (mv > 0) nz0++; if (mv > mx) mx = mv; var uv = scale * U[q2]; if (uv > 0) upN++; if (uv > upMx) upMx = uv; }
      var mean = sum / n, cvv = mean > 0 ? Math.sqrt(Math.max(0, sq / n - mean * mean)) / mean : 0;
      wpE[z] = calib === 'wp' ? df : 0;   // the working-plane cove E (lux) the §LUX_CHECK rows add; zones without a plane report 0 there
      qual.push(z); byQ[COVE_TYPES[t]]++; defs.push(df); emitters += E.e.length / 4; perimM += E.perimM; cellsN += n; for (var s0 = 0; s0 < E.strip.length; s0++) strip.push(E.strip[s0]);
      zones[z] = { z: z, type: COVE_TYPES[t], existingE: +ex.toFixed(1), level: lv, deficit: +df.toFixed(1), coveE: +(calib === 'wp' ? df : mean * luxPer).toFixed(1), calib: calib, emitters: E.e.length / 4, perimeterM: +E.perimM.toFixed(1), cells: n, litCells: nz0, upCells: upN, cv: +cvv.toFixed(3), maxE: +(mx * luxPer).toFixed(1), maxUpE: +(upMx * luxPer).toFixed(1), stride: st, m3: Z.zoneInfo[z - 1].m3 };
      vs.push([z, V, scale, Math.max(mx, upMx), U]); }
    var tf = performance.now(), maxAll = 0; vs.forEach(function (v) { if (v[3] > maxAll) maxAll = v[3]; });
    if (!qual.length || !(maxAll > 0)) { coveLast = { key: key, zones: null, wpE: wpE, qualified: 0 }; coveKey = key;
      console.log('§COVE_LIGHT VACUOUS bld=' + Z.bld + ' zones=' + nzn + ' qualified=0 (no zone below its level' + (noEmit ? '; ' + noEmit + ' below level but without a ceiling edge' : '') + ') types ' + JSON.stringify(T.by) + ' ms=' + Math.round(performance.now() - t0)); return coveLast; }
    // log-8 codes: 0 = none, 1..255 over [max / 2^COVE_LOG_RANGE, max] (values under the floor take code 1)
    var lnMax = Math.log(maxAll), lnMin = lnMax - COVE_LOG_RANGE * Math.LN2, lnR = lnMax - lnMin, arr = new Uint8Array(N * 4), outsideNZ = 0, QC = 255 / maxAll;
    var enc8 = function (v) { if (!(v > 0)) return 0; return Math.max(1, Math.min(255, Math.round(1 + 254 * (Math.log(v) - lnMin) / lnR))); };
    vs.forEach(function (v) { var z = v[0], V = v[1], sc = v[2], U = v[4], o0 = T.off[z], n = T.off[z + 1] - o0;
      for (var q = 0; q < n; q++) { var x = V[q * 3], y = V[q * 3 + 1], w = V[q * 3 + 2], m = Math.sqrt(x * x + y * y + w * w), u = U[q] * sc; if (!(m > 0) && !(u > 0)) continue; var c = T.cells[o0 + q], od = octEnc(x, y, w);
        arr[c * 4] = enc8(m * sc); arr[c * 4 + 1] = od & 255; arr[c * 4 + 2] = od >> 8; arr[c * 4 + 3] = enc8(u); } });
    // NO FLAT FILL assertions on the texel array: cove term 0 in every cell of a non-cove zone; per cove zone cv > 0
    var qset = new Uint8Array(nzn + 1); qual.forEach(function (z) { qset[z] = 1; });
    for (var c4 = 0; c4 < N; c4++) { if (!arr[c4 * 4] && !arr[c4 * 4 + 3]) continue; var v4 = Z.zone[c4]; if (v4 === SOLID || !qset[v4 & 0x3FFF]) outsideNZ++; }
    var cvZeroZ = qual.filter(function (z) { return zones[z].litCells >= 3 && !(zones[z].cv > 0); }), cvZero = cvZeroZ.length, cvVac = qual.filter(function (z) { return zones[z].litCells < 3; }).length;   // 1-2 cells have no cell-to-cell variation to judge (a 2-cell zone with one emitter per cell is symmetric: cv 0 by geometry, Hospital z916)
    if (coveTex) coveTex.dispose();
    coveTex = coveTex3D(THREE, arr, Z.nx, Z.ny, Z.nz);
    var tu = performance.now(); try { A.renderer.initTexture(coveTex); } catch (eU) { console.warn('§COVE_LIGHT upload failed: ' + eU.message + ' — cove off'); coveTex.dispose(); coveTex = null; coveLast = null; return null; }
    var upMs = performance.now() - tu; coveTex.image.data = null;   // §ZONE_TEX_CPU_DROP: the GPU has it; a rebuild re-creates the array
    var col = new THREE.Color(COVE_COLOUR), lum = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
    COVEP[0] = col.r / lum; COVEP[1] = col.g / lum; COVEP[2] = col.b / lum; COVEP[3] = 1; COVEQ[0] = lnMin; COVEQ[1] = lnR; coveKey = key; lampPushAll = true;
    defs.sort(function (a, b) { return a - b; }); var pq = function (f) { return defs[Math.min(defs.length - 1, Math.floor(defs.length * f))].toFixed(0); };
    coveLast = { key: key, zones: zones, wpE: wpE, qualified: qual.length, byType: byQ, strip: strip, geom: null, stats: { emitters: emitters, perimeterM: +perimM.toFixed(1), cells: cellsN, strided: strided, noEdge: noEmit, work: work, memMB: +(arr.byteLength / 1e6).toFixed(1), QC: QC, maxE: +(maxAll * luxPer).toFixed(1), buildMs: Math.round(tf - t0), texMs: Math.round(performance.now() - tf), typesMs: T.ms } };
    console.log('§COVE_LIGHT build bld=' + Z.bld + ' zones=' + nzn + ' types ' + JSON.stringify(T.by) + ' qualified=' + qual.length + ' byType ' + JSON.stringify(byQ) + ' deficit lx p10/p50/p90/max=' + pq(0.1) + '/' + pq(0.5) + '/' + pq(0.9) + '/' + defs[defs.length - 1].toFixed(0) +
      ' emitters=' + emitters + ' perimeterM=' + perimM.toFixed(1) + ' cells=' + cellsN + ' (strided zones ' + strided + ', below level but no ceiling edge ' + noEmit + ') fieldsMarched=' + fieldBuilt + ' (cached ' + (qual.length - fieldBuilt) + ') marchSteps=' + work + ' memMB=' + coveLast.stats.memMB + ' (RGBA8UI log-8, range 2^' + COVE_LOG_RANGE + ', maxE=' + coveLast.stats.maxE + ' lx) buildMs=' + coveLast.stats.buildMs + ' (types ' + T.ms + ') texMs=' + coveLast.stats.texMs + ' uploadMs=' + upMs.toFixed(0) +
      ' level: room=EN row | unknown use ' + COVE_UNKNOWN_LUX + ' lx (6.1.1 circulation) | void/crevice/shaft TRIM_LUX_VOID=' + TRIM_LUX_VOID + ' lx (EN 12464-1 circulation row via secondary summaries, primary not consulted) colour=0x' + COVE_COLOUR.toString(16) + ' R=' + COVE_R + 'm');
    console.log('§COVE_LIGHT NOFLAT ' + (outsideNZ === 0 && cvZero === 0 ? 'PASS' : 'FAIL') + ' texelsOutsideCoveZones=' + outsideNZ + ' coveZonesWithCv0=' + cvZero + '/' + (qual.length - cvVac) + ' judged (' + cvVac + ' zones of 1-2 cells not judged)' + (cvZero ? ' cv0 zones [' + cvZeroZ.slice(0, 5).map(function (z) { var r = zones[z]; return z + ':' + r.type + ':' + r.cells + 'cells:' + r.emitters + 'em'; }).join(' ') + ']' : '') + ' (cell-to-cell coefficient of variation of |V| per zone; directional term, never a flat fill)');
    var top = qual.slice().sort(function (a, b) { return zones[b].cells * zones[b].deficit - zones[a].cells * zones[a].deficit; }).slice(0, 8), cz = (A._sourcedCap && A._sourcedCap.camZone) || 0; if (cz && zones[cz] && top.indexOf(cz) < 0) top.push(cz);
    console.log('§COVE_LIGHT_ZONE [z:type:existingE+cove=level lx:emitters:perimM:cells:litCells/upCells:cv:calib:stride:m3] ' + top.map(function (z) { var r = zones[z]; return z + ':' + r.type + ':' + r.existingE + '+' + r.coveE + '=' + r.level + ':' + r.emitters + ':' + r.perimeterM + ':' + r.cells + ':' + r.litCells + '/' + r.upCells + ':' + r.cv + ':' + r.calib + ':' + r.stride + ':' + r.m3; }).join(' ') + (cz ? ' camZone=' + cz + (zones[cz] ? '' : ' (no cove: existingE=' + X.existing[cz].toFixed(1) + ' lx >= level)') : ''));
    coveStrip(A);
    return coveLast;
  }
  // the visible strip: one merged mesh of 0.04 m bars, half a cell long, along the emitter lines (built once per cove key)
  function coveStrip(A) {
    var THREE = global.THREE; if (!coveLast || !coveLast.strip || !coveLast.strip.length || coveMesh) return;
    if (!coveLast.geom) { var s = coveLast.strip, nb = s.length / 4, pos = new Float32Array(nb * 8 * 3), idx = new Uint32Array(nb * 36), cl = (global.LightZones.get() || { cell: 0.5 }).cell, hl = cl / 2, hw = 0.02;
      var BI = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0];
      for (var b = 0; b < nb; b++) { var x = s[b * 4], y = s[b * 4 + 1], z = s[b * 4 + 2], ax = s[b * 4 + 3], dx = ax === 0 ? hl : hw, dz = ax === 1 ? hl : hw, o = b * 24;
        var P8 = [[-dx, -hw, -dz], [dx, -hw, -dz], [dx, -hw, dz], [-dx, -hw, dz], [-dx, hw, -dz], [dx, hw, -dz], [dx, hw, dz], [-dx, hw, dz]];
        for (var v = 0; v < 8; v++) { pos[o + v * 3] = x + P8[v][0]; pos[o + v * 3 + 1] = y + P8[v][1]; pos[o + v * 3 + 2] = z + P8[v][2]; }
        for (var i = 0; i < 36; i++) idx[b * 36 + i] = b * 8 + BI[i]; }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); coveLast.geom = g; coveLast.strip = null; }
    coveMesh = new THREE.Mesh(coveLast.geom, new THREE.MeshBasicMaterial({ color: COVE_COLOUR, side: THREE.DoubleSide }));
    coveMesh.name = 'cove_strip'; coveMesh.userData.excludeFromShadow = true; coveMesh.userData.coveStrip = true; coveMesh.castShadow = false; coveMesh.receiveShadow = false; coveMesh.frustumCulled = true; coveMesh.renderOrder = 1;
    A.scene.add(coveMesh);
    console.log('§COVE_LIGHT strip mesh bars=' + (coveLast.geom.index.count / 36) + ' tris=' + (coveLast.geom.index.count / 3) + ' colour=0x' + COVE_COLOUR.toString(16) + ' (MeshBasicMaterial, excludeFromShadow, Alt+S only)');
  }
  function coveStripOff(A) { if (!coveMesh) return; A.scene.remove(coveMesh); coveMesh.material.dispose(); coveMesh = null; }
  function stage(A) {
    var THREE = global.THREE, LZ = global.LightZones;
    if (!installed || !THREE || !LZ || !A || !A.scene || !A.renderer) { console.log('§SOURCED_LIGHT skipped installed=' + installed + ' zones=' + !!LZ); return; }
    unstage(A, true);
    var t0 = performance.now(), hit = !!(LZ.get() && LZ.get().bld === A.activeBuilding);
    var Z = LZ.build(A); if (!Z) { console.log('§SOURCED_LIGHT skipped (no light zones)'); return; }
    var key = Z.bld + ':' + Z.nx + 'x' + Z.ny + 'x' + Z.nz + ':' + Z.zones;
    if (texKey !== key) {
      if (tex) tex.dispose(); rgFieldKey = null;
      if (gtex) { gtex.dispose(); gtex = null; } gKey = null;   // §GROUND_VIEW_FIELD: its texture follows the zone texture's key
      // §SOURCED_DAYLIGHT: RG16UI — R = zone | SKY_BIT (as before), G = the still's daylight fraction x 10000 (0 until daylight())
      rg = zoneRG(Z); rgKey = key;
      tex = new THREE.Data3DTexture(rg, Z.nx, Z.ny, Z.nz);
      tex.format = THREE.RGIntegerFormat; tex.type = THREE.UnsignedShortType; tex.internalFormat = 'RG16UI';
      tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.unpackAlignment = 1; tex.needsUpdate = true; texKey = key;
      // §SOURCED_LIGHT_GLERR — any GL error standing before the upload, raised by the upload, and after the first patched frame
      try { var gl = A.renderer.getContext(), e0 = gl.getError(); A.renderer.initTexture(tex); var e1 = gl.getError();
        console.log('§SOURCED_LIGHT_GLERR upload before=' + e0 + ' after=' + e1 + ' (0 = none; 1282 = INVALID_OPERATION) RG16UI ' + Z.nx + 'x' + Z.ny + 'x' + Z.nz); } catch (eG) { console.warn('§SOURCED_LIGHT_GLERR upload probe failed: ' + eG.message); }
      glErrFirstFrame = true;
    }
    try { fieldLast = stageField(A, Z); } catch (eD) { fieldLast = null; SKY[0] = 0; console.warn('§SKY_VIEW_FIELD failed: ' + eD.message); }
    // §ZONE_TEX_CPU_DROP (leak audit 2026-09-26): once the GPU has the texture, the CPU copy is only Z.zone + F.G interleaved
    // (Hospital 41 MB). Drop it; stageField rebuilds it from those two when the field must be written again, and a restored
    // WebGL context re-stages from scratch (texKey cleared below).
    if (rg && tex && (rgFieldKey === texKey || !SKY[0])) { rg = null; rgKey = null; tex.image.data = null; }
    if (!ctxHooked && A.renderer.domElement) { ctxHooked = true; A.renderer.domElement.addEventListener('webglcontextrestored', function () { texKey = null; rgFieldKey = null; gKey = null; coveKey = null; }); }
    var keep = dial(A, '_stillIndoorSky', 'indoorsky', 0, 0, 1);   // principle 1: indoors no flat ambient / hemi (0)
    console.log('§SOURCED_LIGHT_DIALS indoorSky=' + keep + ' skyField=' + (SKY[0] > 0.5 ? 'on' : 'off') + ' (&skyfield=0 = the binary SKY_BIT path)');
    P[0] = 1; P[1] = Z.cell; P[2] = keep; P[3] = 0;
    ORG[0] = Z.org.x; ORG[1] = Z.org.y; ORG[2] = Z.org.z; DIM[0] = Z.nx; DIM[1] = Z.ny; DIM[2] = Z.nz;
    active = true;
    try { lampBuild(A); } catch (eLB) { console.warn('§LAMP_UNCAPPED build failed: ' + eLB.message); lampFail(A, 'build threw'); }
    try { irBuild(A); } catch (eIR) { IRP[0] = 0; console.warn('§IRC_MAX build failed: ' + eIR.message); }
    try { coveBuild(A, Z); } catch (eCV) { COVEP[3] = 0; coveLast = null; console.warn('§COVE_LIGHT build failed: ' + eCV.message + ' — cove off'); }   // §COVE_LIGHT: after lamps + IR (the deficit reads them), before the meter (it must see the cove)
    var set = new Set(); A.scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m) set.add(m); }); });
    var pushed = 0; set.forEach(function (m) { if (push(A, m)) pushed++; });
    var b = bindLights(A, A.camera);
    var gl = /[?&]glassshadow=1/.test(location.search) ? 0 : glassOn(A);   // &glassshadow=1 = glass casts as before (A/B)
    console.log('§SUN_GLASS_CASTERS fixed pureGlassMeshes=' + gl + ' (depth pass discards them: sun + portal shadows pass through glass)' + (gl ? '' : ' — &glassshadow=1 or none found'));
    prevOBR = A.scene.onBeforeRender; var progN = -2, pushes = 0; ordCache = null;
    var own = function (renderer, scene, camera) {
      if (active) {
        if (A._lampDataOn && A._lampData && A._lampData.ver !== lampVer) { try { lampBuild(A); } catch (eLB2) { console.warn('§LAMP_UNCAPPED build failed: ' + eLB2.message); lampFail(A, 'build threw'); }
          try { irBuild(A); coveBuild(A, LZ.get()); } catch (eCV2) { COVEP[3] = 0; console.warn('§COVE_LIGHT rebuild failed: ' + eCV2.message); } }   // §COVE_LIGHT: a lamp change moves the deficit
        else if (!A._lampDataOn && LAMP[0] > 0.5) { LAMP[0] = 0; lampPushAll = true; }
        try { irBuild(A); } catch (eIR2) { IRP[0] = 0; }   // cheap when nothing changed (key compare)
        var bb = bindLights(A, camera);
        if (lampPushAll) { lampPushAll = false; progN = -3; }
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
      ' texMB=' + (Z.zone.length * 2 / 1e6).toFixed(1) + ' indoorSky=' + keep + ' groundView=' + (SKY[1] > 0.5 ? 'on' : 'off') + ' mats=' + set.size + ' pushed=' + pushed + ' points=' + b.points + ' bound=' + b.pointsBound + ' (litOutside=' + b.litOutside + ')' +
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
    // §IRC_MAX v2: the meter reads ALL the light a camera would see, the zone interreflection included (decided 2026-09-26: the
    // physically consistent meter; red1 delegated: "darker is realistic"). Refs: Clinic corridor 77.7 -> 72.2, Hospital indoor
    // 83.5 -> 72.3 composite mean. (Direct-only metering read 97.7 / 107.4.)
    var irs = IRP[1];
    try { A.scene.background = null; A.scene.fog = null; A.scene.overrideMaterial = meterMat; R.setClearColor(0x000000, 0); R.setRenderTarget(rt);
      // the override material is not in the scene, so the per-render push never reaches it: render once (builds its programs),
      // push the zone texture + uniforms into each built program, render again (Clinic 2026-09-25: unpushed, the meter saw every
      // fragment as OUTSIDE — hemi 0.728 of 0.728, lamps ~0)
      R.clear(true, true, true); R.render(A.scene, A.camera); push(A, meterMat);
      R.clear(true, true, true); R.render(A.scene, A.camera); R.readRenderTargetPixels(rt, 0, 0, METER_W, METER_H, buf); }
    finally { IRP[1] = irs; R.setRenderTarget(prevRT); A.scene.background = prevBg; A.scene.fog = prevFog; A.scene.overrideMaterial = prevOv; R.setClearColor(cc, ca); hidden.forEach(function (o) { o.visible = true; }); rt.dispose(); }
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
    // §METER_ADAPT (red1 2026-09-26: "Make it a dynamic lever derived from such data"): the degree of adaptation is no longer the
    // fixed Stevens 0.33 but CIECAM02's D (CIE 159:2004, eq. 7.4; F = 1.0 average surround): D = F [1 - (1/3.6) e^((-LA - 42) / 92)],
    // LA = adapting luminance = 20% of the white luminance of the metered scene (CIECAM02 convention), white L = E / pi for the
    // metered incident light E in lux (the §SOURCED_LIGHT_CALIB scale: calibSunLux / calibSunI lux per unit). exposure =
    // base x ratio^(-D): D -> 1 full adaptation (bright interiors, EN-lit rooms), smaller in dim spaces. &adapt=stevens = old rule.
    var sunIc = A._stillCalibSunI, luxPerU = sunIc > 0 ? (A._stillCalibSunLux || 100000) / sunIc : null, adapt = 'stevens', Dd = 1 - STEVENS, Elx = null, LA = null;
    if (luxPerU && !/[?&]adapt=stevens/.test(location.search)) { Elx = m.Ein * luxPerU; LA = 0.2 * Elx / Math.PI; Dd = Math.max(0, Math.min(1, 1 - (1 / 3.6) * Math.exp((-LA - 42) / 92))); adapt = 'ciecam02'; }
    var exp = base * Math.pow(ratio, -Dd), stops = Math.log2(exp / base);
    if (stops < 0) { exp = base; stops = 0; } if (stops > METER_MAX_STOPS) { exp = base * Math.pow(2, METER_MAX_STOPS); stops = METER_MAX_STOPS; }
    meterSaved = { exp: base }; R.toneMappingExposure = exp;
    console.log('§METER camera=inside logAvgEin=' + m.Ein.toExponential(3) + ' Eout=' + o.E.toFixed(3) + ' (sun ' + o.sunI.toFixed(2) + ' x sinElev ' + o.sinE.toFixed(3) + ' + sky ' + o.skyL.toFixed(3) + ')' + o.note +
      ' mode=' + m.mode + ' indoor/outdoor=' + ratio.toExponential(3) + ' adapt=' + adapt + ' D=' + Dd.toFixed(3) + (Elx != null ? ' Ein=' + Elx.toFixed(1) + 'lx LA=' + LA.toFixed(2) + 'cd/m2' : '') + ' exposure=' + exp.toFixed(3) + ' stops=' + stops.toFixed(2) + ' (base ' + base.toFixed(3) + ') pixels=' + m.pixels + '/' + (METER_W * METER_H) + ' hidden=' + m.hidden + ' ms=' + m.ms.toFixed(0));
    return { exposure: exp, stops: stops, Ein: m.Ein, Eout: o.E };
  }
  function meterOff(A) { if (meterSaved && A.renderer) { A.renderer.toneMappingExposure = meterSaved.exp; console.log('§METER off exposure=' + meterSaved.exp.toFixed(3)); } meterSaved = null; }

  function unstage(A, quiet) {
    if (!quiet) A._sourcedCap = null;
    glassOff(A, quiet); meterOff(A);
    if (!active) return;
    active = false; P[0] = 0; LAMP[0] = 0; lampVer = -1; IRP[0] = 0; irKey = null;
    COVEP[3] = 0; coveStripOff(A);   // §COVE_LIGHT: the texture is kept for the next press (key compare), the strip leaves with the still
    if (!quiet) { A._lampDataOn = false; A._lampData = null; }
    if (A.scene.onBeforeRender && A.scene.onBeforeRender._sourced) A.scene.onBeforeRender = prevOBR || function () {};
    prevOBR = null; lastLog = '';
    A.scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m) push(A, m); }); });
    if (A.markDirty) A.markDirty();
    if (!quiet) console.log('§SOURCED_LIGHT off (uSLParams.x=0, zone texture kept for the next press)');
  }

  global.SourcedLight = { coveStats: function () { return coveLast; }, coveOn: function () { return COVEP[3] > 0.5; }, primeSpaceUses: primeSpaceUses, irShare: irShare, irStats: function () { return IRP[0] > 0.5 ? irLast : null; }, lampCost: lampCost, lampsAt: lampsAt, lampWanted: lampWanted, lampStats: function () { return LAMP[0] > 0.5 ? lampLast : null; }, fieldOn: fieldOn, field: function () { return fieldLast; }, lux: function () { return luxLast; }, meterRead: meterRead, installed: function () { return installed; }, debugZones: function (on) { P[3] = on === true ? 1 : (+on || 0); }, install: install, prepare: prepare, stage: stage, unstage: unstage, isActive: function () { return active; } };
})(typeof window !== 'undefined' ? window : this);
