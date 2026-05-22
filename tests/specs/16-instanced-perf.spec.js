// 16-instanced-perf.spec.js — InstancedMesh performance benchmark
// Issue: S231 — 48K individual THREE.Mesh draw calls replaced by ~7K InstancedMesh
// Measures: stream time, draw calls, FPS after load

const { test, expect } = require('@playwright/test');
const { openViewer, getStreamStats } = require('../helpers/viewer');
const { ConsoleLogs } = require('../helpers/console-capture');

async function benchBuilding(page, bld) {
  const logs = new ConsoleLogs(page);

  const t0 = Date.now();
  await openViewer(page, {
    db: bld.db,
    lib: bld.lib,
    streamTimeout: 120000,
  });
  const tStream = Date.now() - t0;

  const stats = await getStreamStats(page);
  expect(stats.active).toContain('DONE');
  expect(stats.streamed).toBeGreaterThanOrEqual(bld.minEl);

  // Extract S231 flush log if present (instanced path)
  const flushLog = logs.all().find(m => m.includes('§FLUSH'));
  let drawCalls = stats.streamed; // fallback: 1 draw call per element (old path)
  let instancedCount = 0, singleCount = 0;
  if (flushLog) {
    const m = flushLog.match(/drawCalls=(\d+)/);
    if (m) drawCalls = parseInt(m[1]);
    const mi = flushLog.match(/instanced=(\d+)/);
    if (mi) instancedCount = parseInt(mi[1]);
    const ms = flushLog.match(/single=(\d+)/);
    if (ms) singleCount = parseInt(ms[1]);
  }

  // Scene object count (FPS not measurable in headless — rAF doesn't fire reliably)
  const sceneStats = await page.evaluate(() => {
    let meshes = 0, instanced = 0, totalInstances = 0;
    window.APP.scene.traverse(obj => {
      if (obj.isInstancedMesh) { instanced++; totalInstances += obj.count; }
      else if (obj.isMesh && obj !== window.APP.ground) meshes++;
    });
    return { meshes, instanced, totalInstances };
  });

  const reduction = flushLog ? (1 - drawCalls / stats.streamed) : 0;

  console.log([
    `§PERF_${bld.name.toUpperCase()}`,
    `elements=${stats.streamed}`,
    `stream_ms=${tStream}`,
    `draw_calls=${drawCalls}`,
    `scene_meshes=${sceneStats.meshes}`,
    `scene_instanced=${sceneStats.instanced}`,
    `scene_instances=${sceneStats.totalInstances}`,
    `fps=headless`,
    `reduction=${(reduction * 100).toFixed(0)}%`,
    flushLog ? `(instanced=${instancedCount} single=${singleCount})` : '(legacy_path)',
  ].join(' '));

  return { tStream, drawCalls, sceneStats, stats, reduction, flushLog };
}

test.describe('S231 InstancedMesh Performance', () => {
  test.setTimeout(180000);  // 3min per perf test — large DB streaming

  test('16.1 Hospital — baseline (23K elements) @bench', async ({ page }) => {
    const r = await benchBuilding(page, {
      name: 'Hospital', db: '/buildings/Hospital_extracted.db',
      lib: '/buildings/Hospital_library.db', minEl: 20000,
    });
    expect(r.tStream).toBeLessThan(60000);
  });

  test('16.2 Terminal — 48K elements (instancing target) @bench', async ({ page }) => {
    const r = await benchBuilding(page, {
      name: 'Terminal', db: '/buildings/Terminal_extracted.db',
      lib: '/buildings/Terminal_library.db', minEl: 40000,
    });
    expect(r.tStream).toBeLessThan(120000);
    if (r.flushLog) {
      console.log(`§PERF_REDUCTION Terminal ${r.drawCalls}/${r.stats.streamed} = ${(r.reduction * 100).toFixed(0)}% fewer draw calls`);
      expect(r.reduction).toBeGreaterThan(0.5);
    }
  });

  test('16.3 LTU AHouse — 126K elements (scale test) @bench', async ({ page }) => {
    const r = await benchBuilding(page, {
      name: 'LTU_AHouse', db: '/buildings/LTU_AHouse_extracted.db',
      lib: '/buildings/LTU_AHouse_library.db', minEl: 100000,
    });
    expect(r.tStream).toBeLessThan(180000);
  });

});
