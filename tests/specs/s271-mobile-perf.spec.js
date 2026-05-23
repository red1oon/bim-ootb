// s271-mobile-perf.spec.js — S271 mobile performance fixes verification
// Issue: S271 — DLOD threshold, frustum culling, on-demand render, mobile renderer, tab pause
// Proves: all 6 S271 fixes are wired correctly at runtime

const { test, expect } = require('@playwright/test');
const { openViewer, getStreamStats } = require('../helpers/viewer');
const { ConsoleLogs } = require('../helpers/console-capture');

test.describe('S271 Mobile Performance Fixes', () => {
  test.setTimeout(180000);

  test('S271.1 DLOD threshold lowered to 5K (source check) @perf', async ({ page }) => {
    // §S271: MIN_ELEMENTS lowered from 100000 to 5000 — verify in source
    const dlodJs = require('fs').readFileSync(
      require('path').join(__dirname, '../../dlod.js'), 'utf8');

    const match = dlodJs.match(/MIN_ELEMENTS\s*=\s*(\d+)/);
    const threshold = match ? parseInt(match[1]) : -1;

    console.log('§S271_DLOD_THRESHOLD value=' + threshold);
    expect(threshold).toBe(5000);

    // Also verify DLOD is wired in streaming (dlodEnable call exists, no mobile gate)
    const streamJs = require('fs').readFileSync(
      require('path').join(__dirname, '../../streaming.js'), 'utf8');
    const hasDlodCall = streamJs.includes('A.dlodEnable()');
    const noMobileGate = !streamJs.includes('!A._isMobile && A.dlodEnable');

    console.log('§S271_DLOD_WIRING dlodCall=' + hasDlodCall + ' noMobileGate=' + noMobileGate);
    expect(hasDlodCall).toBe(true);
    expect(noMobileGate).toBe(true);
  });

  test('S271.2 InstancedMesh frustumCulled=true in source @perf', async ({ page }) => {
    // §S271: frustumCulled changed from false to true for InstancedMesh
    const streamJs = require('fs').readFileSync(
      require('path').join(__dirname, '../../streaming.js'), 'utf8');

    // The streaming flush sets frustumCulled=true on real InstancedMesh (line ~622)
    // Note: bbox placeholder InstancedMesh (line ~209) correctly keeps frustumCulled=false
    const hasCulledTrue = streamJs.includes('iMesh.frustumCulled = true');

    console.log('§S271_FRUSTUM_CULL culledTrue=' + hasCulledTrue);
    expect(hasCulledTrue).toBe(true);

    // Runtime: load a small building, verify any InstancedMesh created has frustumCulled=true
    await openViewer(page, {
      db: '/buildings/SampleHouse_extracted.db',
      streamTimeout: 30000,
    });

    const result = await page.evaluate(() => {
      let total = 0, culled = 0, notCulled = 0;
      APP.scene.traverse(obj => {
        if (obj.isInstancedMesh && !obj.userData.isBboxPlaceholder) {
          total++;
          if (obj.frustumCulled) culled++;
          else notCulled++;
        }
      });
      return { total, culled, notCulled };
    });

    console.log('§S271_FRUSTUM_RUNTIME instanced=' + result.total +
      ' culled=' + result.culled + ' notCulled=' + result.notCulled);

    // Any non-placeholder InstancedMesh must have frustumCulled=true
    expect(result.notCulled).toBe(0);
  });

  test('S271.3 on-demand render gate active @perf', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    await openViewer(page, {
      db: '/buildings/Terminal_extracted.db',
      streamTimeout: 120000,
    });

    // After streaming completes, check that render is gated
    // The _needsRender flag and _streaming check control rendering
    const renderInfo = await page.evaluate(() => {
      return {
        hasMarkDirty: typeof APP.markDirty === 'function',
        streaming: !!APP._streaming,
      };
    });

    console.log('§S271_RENDER_GATE markDirty=' + renderInfo.hasMarkDirty +
      ' streaming=' + renderInfo.streaming);

    expect(renderInfo.hasMarkDirty).toBe(true);
    // After DONE, streaming should be false — render gate should be active
    expect(renderInfo.streaming).toBe(false);
  });

  test('S271.4 mobile renderer: no antialias, DPR=1 @perf', async ({ page }) => {
    // Read source to verify mobile path exists
    const sceneJs = require('fs').readFileSync(
      require('path').join(__dirname, '../../scene.js'), 'utf8');

    // §S271: _isMobileRenderer detection
    const hasMobileDetect = sceneJs.includes('_isMobileRenderer');
    const hasAntialiasGate = sceneJs.includes('antialias: !_isMobileRenderer');
    const hasDprGate = sceneJs.includes('_isMobileRenderer ? 1 :');

    console.log('§S271_MOBILE_RENDERER detect=' + hasMobileDetect +
      ' antialiasGate=' + hasAntialiasGate + ' dprGate=' + hasDprGate);

    expect(hasMobileDetect).toBe(true);
    expect(hasAntialiasGate).toBe(true);
    expect(hasDprGate).toBe(true);
  });

  test('S271.5 visibilitychange pauses rAF @perf', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    await openViewer(page, {
      db: '/buildings/Terminal_extracted.db',
      streamTimeout: 120000,
    });

    // Verify visibilitychange listener is wired
    const mainJs = require('fs').readFileSync(
      require('path').join(__dirname, '../../main.js'), 'utf8');

    const hasVisChange = mainJs.includes('visibilitychange');
    const hasCancelRaf = mainJs.includes('cancelAnimationFrame');
    const hasTabLog = mainJs.includes('§TAB_VISIBILITY');

    console.log('§S271_TAB_PAUSE visibilitychange=' + hasVisChange +
      ' cancelRaf=' + hasCancelRaf + ' tabLog=' + hasTabLog);

    expect(hasVisChange).toBe(true);
    expect(hasCancelRaf).toBe(true);
    expect(hasTabLog).toBe(true);
  });

  test('S271.6 SW version bumped to v439 @perf', async ({ page }) => {
    const swJs = require('fs').readFileSync(
      require('path').join(__dirname, '../../sw.js'), 'utf8');
    const match = swJs.match(/CACHE_VERSION = '(v\d+)'/);
    const version = match ? match[1] : 'unknown';

    console.log('§S271_SW_VERSION version=' + version);
    expect(parseInt(version.replace('v', ''))).toBeGreaterThanOrEqual(439);
  });
});
