// WITNESS — §PHOTO_SKYLINE_SHADOW_FRUSTUM (2026-08-02, extended 2026-08-03)
// ISSUE IT PROVES/DISPROVES: user report "the silhouette buildings in distance cannot cast
// shadows well now" — the distant skyline ring (_buildPhotoProps, effects.js, radius = envelope *
// PHOTO_SKYLINE_RADIUS_MULT) sat OUTSIDE the shadow-camera's orthographic frustum
// (_enablePhotoShadows, _env sized to the main building's envelope only, 1x) — the ring was
// clipped from the shadow depth pass entirely, before any render, regardless of castShadow being
// set correctly elsewhere. Confirmed via real measured numbers before fixing (not assumption):
// HHS_Office_Federated envelope=68.17m → pre-fix frustum half-width=69m, skyline boxes at
// 139.5-160.4m from center — 36/36 outside. This has been true since the photo-shadow feature's
// OWN introduction (PR #806, 2026-07-16) — the same commit that set the skyline radius multiplier
// never sized this frustum to match; not a later drift-apart regression.
//
// §PART_A (original, PR #1141): reads the REAL THREE.js shadow-camera frustum (A.sun.shadow.camera
// .left/right, the same object the renderer's shadow pass actually uses) and the REAL skyline box
// world positions (A._getPhotoSkyline().children) live from the running app. PASS bar: every
// skyline box's position falls within [-_env,_env] on both X and Z (relative to the shadow
// camera's look-at target), zero page errors.
//
// §PART_B (2026-08-03, follow-up to a user report that skyline shadows STILL weren't visible on
// Hospital even after §PART_A shipped and measurably widened the frustum, env=362 there): §PART_A
// only ever checked whether the BOX's own position clears the frustum in a naive WORLD-SPACE X/Z
// box — never (a) the true LIGHT-SPACE containment (via the shadow camera's own matrixWorldInverse,
// the actual transform the renderer applies) of the box AND the point where its shadow actually
// LANDS on the ground, nor (b) whether that landing point is ever actually inside the CAMERA'S
// FRAME and produces a measurably darker rendered pixel. §PART_B adds both, run on Hospital (the
// building the follow-up report was about) and HHS (the original witness building, for regression
// comparison). Real findings, ruling out re-litigated causes with real numbers:
//   - Ground plane extent: PlaneGeometry(50000,50000) in scene.js — vastly bigger than any shadow
//     frustum (env<=400ish) or skyline radius; not a factor.
//   - Shadow map resolution: mapSize=2048 fixed; texelPerM=2.8 on Hospital (env=362) means ~36cm/
//     texel — a skyline box (18-50m wide) still spans 50-140 texels; not too coarse to register.
//   - Bias/near-far: sunDist is a FIXED constant (5000, scene.js A.updateSky) regardless of
//     building envelope — near/far (250/20000) do not scale with building size, so bias behavior
//     is identical between HHS and Hospital; not a scale-dependent regression.
//   - §SHADOW_GROUND_SWATCH key=off in the user's log: this is the INTERACTIVE Sunglass-panel
//     Shadow+Ground pill state (tools.js A._shadowGroundKey, toggled by the 'h' key) — completely
//     independent of the photoreal-bake path (_enablePhotoShadows/_applyPhotoStaging, triggered by
//     Alt+S), which sets the ground's own texture/visibility directly (_applyGroundTexture('paved'))
//     regardless of that pill's state. It staying 'off' during a bake is normal, not a symptom.
//   - REAL cause found via light-space math + live rendered-pixel readback: all 36/36 Hospital
//     skyline boxes AND their computed shadow-landing points (ray-traced along the real sun->target
//     direction down to groundY) fall INSIDE the shadow camera's true light-space frustum (§PART_A's
//     fix holds, and holds even for the landing point, not just the box — geometrically guaranteed,
//     since a light ray is a line of constant light-space X/Y, only Z(depth) varies along it). The
//     shadow-CASTING mechanism is proven correct: at the 2 (of 36) Hospital landing points that
//     happened to fall inside the CURRENT camera's on-screen frame, the actual rendered pixel
//     (gl.readPixels, preserveDrawingBuffer:true) was measurably darker than a same-distance
//     sun-side control point (luminance deltas +67.0 and +23.0 out of 255 — a strong, real, visible
//     effect). The reason skyline shadows read as "not there" is that PHOTO_SUN_ELEVATION=6°
//     (deliberately low, "longer/more dramatic dusk shadows" per effects.js's own comment) throws a
//     20-80m-tall box's shadow 190-900m across the ground (height/tan(6°) = height*9.51) — 33/36
//     Hospital landing points (92%) and 36/36 HHS landing points (100%) fall OUTSIDE the camera's
//     visible frame at typical framing distance for either building's envelope. This is NOT a
//     frustum-coverage bug (§PART_A already fixed that, and still holds under the stricter
//     light-space check) — it is a shadow-LENGTH-vs-camera-FRAMING mismatch inherent to the
//     deliberately dramatic dusk sun angle, present on BOTH buildings (not exclusive to Hospital's
//     scale), and not fixable without either raising the sun angle (undoing the deliberate dusk
//     look — a stylistic call, not a bug fix) or accepting that skyline shadows are a background
//     atmospheric effect rarely caught in any single frame. Reported, not silently "fixed" — see
//     prompts/PHOTOREAL_STILL_RENDER.md dated 2026-08-03 entry for the full tradeoff writeup.
//
// §PART_B gate design: since 100% on-screen visibility is physically impossible at this sun angle
// (not a target to chase), §PART_B does NOT fail the run on a low on-screen-landing count — it
// reports that count as an informational measurement. What it DOES gate (a real regression guard):
// (1) light-space containment of box+landing stays 0-outside (the §PART_A fix holding under the
// stricter check), and (2) IF any landing point is on-screen with a same-distance control also
// on-screen, the shadow pixel must be measurably darker (delta > 10/255) than the control — proof
// the render pipeline is still actually darkening ground under a skyline-box shadow, not merely
// that the geometry clears the frustum. A future regression that broke shadow rendering while
// leaving the frustum math untouched would flip this gate red; §PART_A alone could not catch that.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8461;
const BLD = process.env.BLD || 'HHS_Office_Federated';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  console.log(`\n${'='.repeat(78)}\n§PHOTO_SKYLINE_SHADOW_FRUSTUM witness — ${BLD}\n${'='.repeat(78)}`);
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls &&
    typeof window.APP.toggleStillRefine === 'function', { timeout: 90000 });
  // Must wait for the DB to be actually loaded (buildingCentres.envelope populated) before
  // triggering Alt+S — an early trigger falls back to the unrelated _env=300 default, which is
  // not the production condition this bug was reported under.
  await page.waitForFunction(() => {
    const bc = window.APP.buildingCentres && Object.values(window.APP.buildingCentres)[0];
    return bc && bc.envelope > 0 && window.APP.dbQuery;
  }, { timeout: 120000, polling: 500 });
  await page.waitForFunction(() => window.APP.streaming === false, { timeout: 60000, polling: 500 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  await page.evaluate(() => { window.APP.toggleStillRefine(); });
  await new Promise(r => setTimeout(r, 5000));

  const nums = await page.evaluate(() => {
    const A = window.APP;
    const bc = Object.values(A.buildingCentres || {})[0];
    const envelope = bc ? bc.envelope : null;
    const _env = A.sun && A.sun.shadow ? A.sun.shadow.camera.right : null;
    const mapSize = A.sun && A.sun.shadow ? A.sun.shadow.mapSize.width : null;
    const skyline = A._getPhotoSkyline ? A._getPhotoSkyline() : null;
    const ctr = A.controls ? A.controls.target : { x: 0, y: 0, z: 0 };
    const boxResults = [];
    // §PART_A (unchanged pass bar): naive world-space X/Z box check, exactly as PR #1141 shipped.
    if (skyline) {
      skyline.children.forEach(function(b) {
        const dx = b.position.x - ctr.x, dz = b.position.z - ctr.z;
        const insideX = Math.abs(dx) <= _env, insideZ = Math.abs(dz) <= _env;
        boxResults.push({ dx: +dx.toFixed(1), dz: +dz.toFixed(1), inside: insideX && insideZ });
      });
    }

    // §PART_B: real light-space containment (box + shadow landing point) + on-screen pixel check.
    let partB = null;
    const cam = A.sun && A.sun.shadow ? A.sun.shadow.camera : null;
    if (skyline && cam && A.sun.target) {
      cam.updateMatrixWorld();
      const groundY = A.ground ? A.ground.position.y : 0;
      const dir = new THREE.Vector3().subVectors(A.sun.target.position, A.sun.position).normalize();
      function localize(v) {
        const p = v.clone().applyMatrix4(cam.matrixWorldInverse);
        const insideXY = p.x >= cam.left && p.x <= cam.right && p.y >= cam.bottom && p.y <= cam.top;
        const insideZ = p.z <= -cam.near && p.z >= -cam.far;
        return insideXY && insideZ;
      }
      const renderer = A.renderer, mainCam = A.camera;
      const gl = renderer ? renderer.getContext() : null;
      const w = renderer ? renderer.domElement.width : 0, h = renderer ? renderer.domElement.height : 0;
      function readPixel(sx, sy) {
        const buf = new Uint8Array(4);
        gl.readPixels(sx, h - sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        return 0.2126 * buf[0] + 0.7152 * buf[1] + 0.0722 * buf[2];
      }
      function project(v) {
        const p = v.clone().project(mainCam);
        const onScreen = p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1 && p.z < 1;
        const sx = Math.round((p.x + 1) / 2 * w), sy = Math.round((1 - p.y) / 2 * h);
        return { onScreen: onScreen && sx >= 0 && sx < w && sy >= 0 && sy < h, sx, sy };
      }
      let boxOutside = 0, landingOutside = 0, onScreenLandings = 0, mechanismSamples = [];
      skyline.children.forEach(function(b) {
        if (!b.geometry || !b.geometry.parameters) return;
        const bh = b.geometry.parameters.height;
        if (!localize(b.position)) boxOutside++;
        const topWorld = b.position.clone(); topWorld.y = b.position.y + bh / 2;
        const t = (groundY - topWorld.y) / dir.y;
        const landing = new THREE.Vector3(topWorld.x + t * dir.x, groundY, topWorld.z + t * dir.z);
        if (!localize(landing)) landingOutside++;
        if (gl) {
          const landingLit = landing.clone(); landingLit.y += 0.05;
          const proj = project(landingLit);
          if (proj.onScreen) {
            onScreenLandings++;
            const control = new THREE.Vector3(topWorld.x - t * dir.x, groundY + 0.05, topWorld.z - t * dir.z);
            const cProj = project(control);
            if (cProj.onScreen) {
              const shadowLum = readPixel(proj.sx, proj.sy), controlLum = readPixel(cProj.sx, cProj.sy);
              mechanismSamples.push({ shadowLum: +shadowLum.toFixed(1), controlLum: +controlLum.toFixed(1), delta: +(controlLum - shadowLum).toFixed(1) });
            }
          }
        }
      });
      partB = { boxCount: skyline.children.length, boxOutside, landingOutside, onScreenLandings, mechanismSamples };
    }

    return { envelope, _env, mapSize, skylineBoxCount: skyline ? skyline.children.length : 0, boxResults, partB };
  });

  const outside = nums.boxResults.filter(b => !b.inside);
  const texelPerM = nums._env ? (nums.mapSize / (2 * nums._env)).toFixed(1) : null;
  console.log('--- §PART_A measured (world-XZ box check, PR #1141 bar) ---');
  console.log('envelope=' + nums.envelope + ' frustum_env(half-width)=' + nums._env +
    ' skylineBoxCount=' + nums.skylineBoxCount + ' outside=' + outside.length + ' texelPerM=' + texelPerM);
  if (outside.length) console.log('outside sample: ' + JSON.stringify(outside.slice(0, 5)));

  let partBPass = true;
  if (nums.partB) {
    const pb = nums.partB;
    console.log('\n--- §PART_B measured (light-space box+landing containment, on-screen pixel mechanism check) ---');
    console.log('boxOutside(light-space)=' + pb.boxOutside + '/' + pb.boxCount +
      ' landingOutside(light-space)=' + pb.landingOutside + '/' + pb.boxCount +
      ' onScreenLandings=' + pb.onScreenLandings + '/' + pb.boxCount +
      ' (informational — 100% is not physically achievable at PHOTO_SUN_ELEVATION=6°, see file header)');
    if (pb.mechanismSamples.length) {
      pb.mechanismSamples.forEach((s, i) => console.log('  mechanism sample [' + i + '] shadowLum=' + s.shadowLum +
        ' controlLum=' + s.controlLum + ' delta=' + s.delta));
      // NOTE: the "control" point is a naive heuristic (mirror of the landing point across the box,
      // same distance, opposite side of the light direction) — it is NOT verified to land on open,
      // otherwise-unshadowed ground (it can land on another skyline box, inside ANOTHER box's own
      // shadow, or off the ground plane entirely). A single low/negative delta from a bad control
      // point is a test-methodology artifact, not proof the render pipeline is broken — so this gate
      // asserts the mechanism is NOT silently dead (at least one strong positive sample when any
      // sample exists), not that every heuristic sample individually clears the bar.
      const strongSamples = pb.mechanismSamples.filter(s => s.delta > 10);
      if (!strongSamples.length) { partBPass = false; console.log('  ❌ zero of ' + pb.mechanismSamples.length + ' sample(s) show delta>10 — shadow-darkening mechanism may be silently broken'); }
      else console.log('  ✅ ' + strongSamples.length + '/' + pb.mechanismSamples.length + ' on-screen sample(s) show delta>10 — shadow mechanism confirmed visually darkening the ground (some low/negative deltas among the rest are expected test-heuristic noise from an unverified control point, not a regression signal)');
    } else {
      console.log('  (no sample where BOTH shadow+control landed on-screen this run — mechanism check skipped, not failed; frustum-containment gate below still applies)');
    }
    if (pb.boxOutside > 0 || pb.landingOutside > 0) { partBPass = false; console.log('  ❌ light-space containment regression — §PART_A fix no longer holds under the stricter check'); }
  }

  const relevant = logs.filter(l => l.includes('§PHOTO_SHADOW') || l.includes('§PHOTO_ADDONS'));
  console.log('\n--- relevant log lines ---');
  relevant.forEach(l => console.log(l));

  const pageErrors = logs.filter(l => l.startsWith('PAGEERROR'));
  console.log('§WITNESS pageErrors=' + pageErrors.length);
  if (pageErrors.length) pageErrors.forEach(l => console.log(l));

  await browser.close();

  const pass = nums.skylineBoxCount > 0 && outside.length === 0 && pageErrors.length === 0 && partBPass;
  console.log('\n' + (pass ? 'PASS' : 'FAIL') + ' — §PHOTO_SKYLINE_SHADOW_FRUSTUM: ' +
    (outside.length === 0
      ? 'all ' + nums.skylineBoxCount + ' skyline boxes fall inside the shadow-camera frustum (env=' + nums._env + '), zero pageerrors, §PART_B mechanism/light-space gates ' + (partBPass ? 'green' : 'RED') + '.'
      : outside.length + '/' + nums.skylineBoxCount + ' skyline boxes fall OUTSIDE the frustum — they cannot cast shadows.'));
  process.exit(pass ? 0 : 1);
})();
