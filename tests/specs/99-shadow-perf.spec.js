// 99-shadow-perf.spec.js — §S288 STATIC-SHADOW GATE witness
// Issue proven: shadowMap.autoUpdate default(true) re-rendered the 4096² shadow map
// every awake frame (a full extra geometry pass → CPU/GPU fan). Fix: autoUpdate=false,
// so the shadow pass fires ONLY on needsUpdate (toggle-on / TM sun-move), not per-frame.
//
// Mechanism (THREE r184 WebGLShadowMap.render): skips when autoUpdate===false &&
// needsUpdate===false, and clears needsUpdate after rendering. So:
//   frame A = render with needsUpdate set  → shadow pass fires (high calls/tris)
//   frame B = render again, no needsUpdate  → FIX skips shadow pass; BASELINE still fires
// PASS (fix):      B.calls << A.calls   — shadow pass absent on the steady frame
// PASS (baseline): B.calls ≈  A.calls   — shadow pass present on every frame
// The (A−B) gap is exactly the per-frame GPU work the fix removes during orbit/idle-awake.

const { test, expect } = require('@playwright/test');

const VIEWER = '/bim-ootb/viewer/viewer.html';
const DB  = '/bim-ootb/viewer/buildings/Duplex_extracted.db';
const LIB = '/bim-ootb/viewer/buildings/Duplex_library.db';

async function loadShadowMeasure(page, baseline) {
  page.on('console', (m) => {
    const t = m.text();
    if (/§SHADOW_INIT|§SHADOW_TRAVERSE/.test(t)) console.log('  [page] ' + t);
  });
  if (baseline) await page.addInitScript(() => { window._shadowAutoUpdate = true; });

  await page.goto(`${VIEWER}?db=${DB}&lib=${LIB}`);
  await page.waitForSelector('#canvas', { state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => window.APP && window.APP.scene, { timeout: 20000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('s-active');
    return el && el.textContent.includes('DONE');
  }, { timeout: 45000, polling: 500 });

  // shadows ON — then wait for the chunked caster-traverse to finish so casters exist
  await page.evaluate(() => window.APP.toggleShadow());
  await page.waitForFunction(
    () => window.APP && window.APP._shadowOn &&
          window.APP.sun && window.APP.sun.castShadow === true,
    { timeout: 15000 }
  );
  await page.waitForTimeout(800); // let the 5000-mesh chunk(s) tag casters + set needsUpdate

  // Deterministic probe: count binds of the 4096² shadow render-target per frame.
  // THREE renders the shadow map by binding sun.shadow.map (a WebGLRenderTarget whose
  // dims == shadow.mapSize) before the main pass. If the shadow pass is skipped, that
  // target is never bound. Counting binds directly observes the per-frame shadow render —
  // unlike renderer.info.render.calls, which (empirically) excludes the shadow pass.
  // Direct R.render() bypasses the SSAO composer; screen-sized SSAO/Outline RTs can't
  // collide with the 4096² match.
  return page.evaluate(() => {
    const A = window.APP, R = A.renderer, sm = R.shadowMap;
    const SHW = A.sun.shadow.mapSize.width, SHH = A.sun.shadow.mapSize.height;
    let binds = 0;
    const orig = R.setRenderTarget.bind(R);
    R.setRenderTarget = function (rt) { if (rt && rt.width === SHW && rt.height === SHH) binds++; return orig.apply(R, arguments); };
    const frame = (setDirty) => { if (setDirty) sm.needsUpdate = true; const b0 = binds; R.render(A.scene, A.camera); return binds - b0; };
    const refresh = frame(true);    // needsUpdate set → shadow MUST render
    const steady1 = frame(false);   // FIX skips; BASELINE re-renders
    const steady2 = frame(false);
    R.setRenderTarget = orig;
    return { autoUpdate: sm.autoUpdate, shadowMapPx: SHW, refresh, steady1, steady2 };
  });
}

test('§S288 fix: autoUpdate=false skips per-frame shadow render @fast', async ({ page }) => {
  test.setTimeout(90000);
  const r = await loadShadowMeasure(page, false);
  console.log(`§SHADOW_PERF_FIX autoUpdate=${r.autoUpdate} shadowMap=${r.shadowMapPx}px ` +
    `binds/frame refresh=${r.refresh} steady1=${r.steady1} steady2=${r.steady2}`);
  expect(r.autoUpdate).toBe(false);
  expect(r.refresh).toBeGreaterThan(0);   // needsUpdate frame renders the shadow map
  expect(r.steady1).toBe(0);              // steady frames DON'T — the fan-driver is gone
  expect(r.steady2).toBe(0);
});

test('§S288 baseline: autoUpdate=true renders shadow map every frame @fast', async ({ page }) => {
  test.setTimeout(90000);
  const r = await loadShadowMeasure(page, true);
  console.log(`§SHADOW_PERF_BASE autoUpdate=${r.autoUpdate} shadowMap=${r.shadowMapPx}px ` +
    `binds/frame refresh=${r.refresh} steady1=${r.steady1} steady2=${r.steady2}`);
  expect(r.autoUpdate).toBe(true);
  expect(r.refresh).toBeGreaterThan(0);
  expect(r.steady1).toBeGreaterThan(0);   // baseline re-renders the 4096² map EVERY frame
  expect(r.steady2).toBeGreaterThan(0);
});
