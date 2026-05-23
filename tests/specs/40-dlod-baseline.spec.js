// 40-dlod-baseline.spec.js — Measure DLOD effectiveness: grid cells, BatchedMesh slots, renderer.info
// Issue proven/disproven:
//   T_4001: DLOD grid indexes individual meshes (or not) — proves grid is empty on BatchedMesh-only scenes
//   T_4002: renderer.info.render.triangles baseline — how many triangles GPU draws per frame
//   T_4003: BatchedMesh slot count vs total elements — proves batching ratio
//   T_4004: Per-slot setVisibleAt works — hiding 50% of slots halves triangle count

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');
const fs = require('fs');
const path = require('path');

// Terminal (48K) — large enough for DLOD, fast enough to test
const TERMINAL_DB = path.join(__dirname, '../../../bim-compiler/deploy/dev/buildings/Terminal_extracted.db');
const TERMINAL_GEO = path.join(__dirname, '../../../bim-compiler/deploy/dev/buildings/Terminal_geo.db');
const HAS_TERMINAL = fs.existsSync(TERMINAL_DB) && fs.existsSync(TERMINAL_GEO);
const TERMINAL_URL = '/bim-ootb/viewer/viewer.html?db=/bim-compiler/deploy/dev/buildings/Terminal_extracted.db&lib=/bim-compiler/deploy/dev/buildings/Terminal_geo.db&bld=Terminal';

// Hospital (63K) — mid-range stress test
const HOSPITAL_DB = path.join(__dirname, '../../../bim-compiler/deploy/buildings/Hospital_extracted.db');
const HOSPITAL_GEO = path.join(__dirname, '../../../bim-compiler/deploy/buildings/Hospital_geo.db');
const HAS_HOSPITAL = fs.existsSync(HOSPITAL_DB) && fs.existsSync(HOSPITAL_GEO);
const HOSPITAL_URL = '/bim-ootb/viewer/viewer.html?db=/bim-compiler/deploy/buildings/Hospital_extracted.db&lib=/bim-compiler/deploy/buildings/Hospital_geo.db&bld=Hospital';

// LTU (122K) — the real stress test
const LTU_DB = path.join(__dirname, '../../../bim-compiler/deploy/dev/buildings/LTU_AHouse_extracted.db');
const LTU_GEO = path.join(__dirname, '../../../bim-compiler/deploy/dev/buildings/LTU_AHouse_geo.db');
const HAS_LTU = fs.existsSync(LTU_DB) && fs.existsSync(LTU_GEO);
const LTU_URL = '/bim-ootb/viewer/viewer.html?db=/bim-compiler/deploy/dev/buildings/LTU_AHouse_extracted.db&lib=/bim-compiler/deploy/dev/buildings/LTU_AHouse_geo.db&bld=LTU_AHouse';

function waitForViewer(page) {
  return page.waitForFunction(() => {
    const s = document.getElementById('status');
    return s && (s.textContent.includes('DONE') || s.textContent.includes('rendered'));
  }, { timeout: 180000 });
}

test.describe('DLOD Baseline — Grid + BatchedMesh + Renderer Stats', () => {

  test('T_4001: Terminal DLOD grid cell count + mesh breakdown', async ({ page }) => {
    test.skip(!HAS_TERMINAL, 'Terminal DB not available locally');
    test.setTimeout(180000);
    const logs = new ConsoleLogs(page);
    await page.goto(TERMINAL_URL);
    await waitForViewer(page);
    await page.waitForTimeout(3000); // let DLOD build grid

    // §DLOD_GRID log tells us cells, meshes, batched, instanced
    const gridLogs = logs.tagged('§DLOD_GRID');
    console.log('§PW_4001 DLOD_GRID: ' + gridLogs.map(l => l.text).join(' | '));
    expect(gridLogs.length).toBeGreaterThan(0);

    // Parse: cells=N meshes=M batched=B instanced=I
    const gridText = gridLogs[0].text;
    const cells = parseInt((gridText.match(/cells=(\d+)/) || [, '0'])[1]);
    const meshes = parseInt((gridText.match(/meshes=(\d+)/) || [, '0'])[1]);
    const batched = parseInt((gridText.match(/batched=(\d+)/) || [, '0'])[1]);
    const instanced = parseInt((gridText.match(/instanced=(\d+)/) || [, '0'])[1]);

    console.log(`§PW_4001 PARSED cells=${cells} individual_meshes=${meshes} batched=${batched} instanced=${instanced}`);

    // §BATCHED_FLUSH tells us the instanced/batched element split
    const flushLogs = logs.tagged('§BATCHED_FLUSH');
    console.log('§PW_4001 BATCHED_FLUSH: ' + flushLogs.map(l => l.text).join(' | '));

    // §DLOD_ENABLE or §DLOD_SKIP
    const enableLogs = logs.tagged('§DLOD_ENABLE').concat(logs.tagged('§DLOD_SKIP'));
    console.log('§PW_4001 DLOD_STATUS: ' + enableLogs.map(l => l.text).join(' | '));
  });

  test('T_4002: Terminal renderer.info — triangle count baseline', async ({ page }) => {
    test.skip(!HAS_TERMINAL, 'Terminal DB not available locally');
    test.setTimeout(180000);
    const logs = new ConsoleLogs(page);
    await page.goto(TERMINAL_URL);
    await waitForViewer(page);
    await page.waitForTimeout(3000);

    // Read renderer.info.render from inside the page
    const stats = await page.evaluate(() => {
      const APP = window.APP;
      if (!APP || !APP.renderer) return null;
      const info = APP.renderer.info;
      return {
        triangles: info.render.triangles,
        calls: info.render.calls,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs ? info.programs.length : 0
      };
    });

    console.log('§PW_4002 RENDERER_INFO ' + JSON.stringify(stats));
    expect(stats).not.toBeNull();
    expect(stats.triangles).toBeGreaterThan(0);
    expect(stats.calls).toBeGreaterThan(0);

    // Also count BatchedMesh objects and their slot totals
    const bmStats = await page.evaluate(() => {
      const APP = window.APP;
      if (!APP || !APP._batchMeta) return null;
      let bmCount = 0, totalSlots = 0;
      for (const bmId in APP._batchMeta) {
        bmCount++;
        totalSlots += APP._batchMeta[bmId].length;
      }
      let imCount = 0, totalInstances = 0;
      for (const imId in APP._instanceMeta) {
        imCount++;
        totalInstances += APP._instanceMeta[imId].length;
      }
      return { bmCount, totalSlots, imCount, totalInstances, streamedCount: APP.streamedCount };
    });

    console.log('§PW_4002 BATCH_STATS ' + JSON.stringify(bmStats));
    expect(bmStats).not.toBeNull();
    console.log(`§PW_4002 SUMMARY: ${bmStats.streamedCount} elements → ${bmStats.bmCount} BatchedMesh (${bmStats.totalSlots} slots) + ${bmStats.imCount} InstancedMesh (${bmStats.totalInstances} instances) = ${bmStats.bmCount + bmStats.imCount} draw calls`);
    console.log(`§PW_4002 GPU: ${stats.triangles.toLocaleString()} triangles in ${stats.calls} draw calls`);
  });

  test('T_4003: setVisibleAt hides slots and reduces triangle count', async ({ page }) => {
    test.skip(!HAS_TERMINAL, 'Terminal DB not available locally');
    test.setTimeout(180000);
    const logs = new ConsoleLogs(page);
    await page.goto(TERMINAL_URL);
    await waitForViewer(page);
    await page.waitForTimeout(3000);

    // Baseline triangle count
    const baseline = await page.evaluate(() => {
      const APP = window.APP;
      // Force a render to get fresh info
      APP.renderer.render(APP.scene, APP.camera);
      return APP.renderer.info.render.triangles;
    });

    console.log(`§PW_4003 BASELINE triangles=${baseline.toLocaleString()}`);

    // Hide 50% of all BatchedMesh slots via setVisibleAt
    const hideResult = await page.evaluate(() => {
      const APP = window.APP;
      let hidden = 0, total = 0;
      for (const bmId in APP._batchMeta) {
        const meta = APP._batchMeta[bmId];
        // Find the actual BatchedMesh object
        let bmObj = null;
        APP.scene.traverse(obj => {
          if (obj.isBatchedMesh && String(obj.id) === bmId) bmObj = obj;
        });
        if (!bmObj) continue;

        for (let i = 0; i < meta.length; i++) {
          total++;
          if (i % 2 === 0) {  // hide every other slot
            bmObj.setVisibleAt(meta[i].slotId, false);
            hidden++;
          }
        }
      }
      // Force render to update info
      APP.renderer.render(APP.scene, APP.camera);
      return {
        hidden,
        total,
        trianglesAfter: APP.renderer.info.render.triangles,
        callsAfter: APP.renderer.info.render.calls
      };
    });

    console.log(`§PW_4003 AFTER_HIDE hidden=${hideResult.hidden}/${hideResult.total} slots`);
    console.log(`§PW_4003 TRIANGLES before=${baseline.toLocaleString()} after=${hideResult.trianglesAfter.toLocaleString()} reduction=${((1 - hideResult.trianglesAfter / baseline) * 100).toFixed(1)}%`);

    // Restore — unhide all
    await page.evaluate(() => {
      const APP = window.APP;
      for (const bmId in APP._batchMeta) {
        const meta = APP._batchMeta[bmId];
        let bmObj = null;
        APP.scene.traverse(obj => {
          if (obj.isBatchedMesh && String(obj.id) === bmId) bmObj = obj;
        });
        if (!bmObj) continue;
        for (let i = 0; i < meta.length; i++) {
          bmObj.setVisibleAt(meta[i].slotId, true);
        }
      }
    });

    // Key assertion: hiding 50% of slots should reduce triangles significantly
    // If triangles didn't change, setVisibleAt doesn't actually help GPU
    expect(hideResult.trianglesAfter).toBeLessThan(baseline);
    const reduction = (1 - hideResult.trianglesAfter / baseline) * 100;
    console.log(`§PW_4003 VERDICT: setVisibleAt ${reduction > 10 ? 'EFFECTIVE' : 'INEFFECTIVE'} — ${reduction.toFixed(1)}% triangle reduction`);
  });

  test('T_4005: Hospital 63K — baseline stats + setVisibleAt proof', async ({ page }) => {
    test.skip(!HAS_HOSPITAL, 'Hospital DB not available locally');
    test.setTimeout(240000);
    const logs = new ConsoleLogs(page);
    await page.goto(HOSPITAL_URL);
    await waitForViewer(page);
    await page.waitForTimeout(4000);

    const gridLogs = logs.tagged('§DLOD_GRID');
    console.log('§PW_4005 DLOD_GRID: ' + gridLogs.map(l => l.text).join(' | '));

    const flushLogs = logs.tagged('§BATCHED_FLUSH');
    console.log('§PW_4005 BATCHED_FLUSH: ' + flushLogs.map(l => l.text).join(' | '));

    const enableLogs = logs.tagged('§DLOD_ENABLE').concat(logs.tagged('§DLOD_SKIP'));
    console.log('§PW_4005 DLOD_STATUS: ' + enableLogs.map(l => l.text).join(' | '));

    // Renderer baseline
    const baseline = await page.evaluate(() => {
      const APP = window.APP;
      if (!APP || !APP.renderer) return null;
      APP.renderer.render(APP.scene, APP.camera);
      const info = APP.renderer.info;
      let bmCount = 0, totalSlots = 0;
      for (const bmId in APP._batchMeta) { bmCount++; totalSlots += APP._batchMeta[bmId].length; }
      let imCount = 0, totalInstances = 0;
      for (const imId in APP._instanceMeta) { imCount++; totalInstances += APP._instanceMeta[imId].length; }
      return {
        triangles: info.render.triangles,
        calls: info.render.calls,
        bmCount, totalSlots, imCount, totalInstances,
        streamedCount: APP.streamedCount
      };
    });

    console.log('§PW_4005 BASELINE ' + JSON.stringify(baseline));
    if (baseline) {
      console.log(`§PW_4005 SUMMARY: ${baseline.streamedCount} elements → ${baseline.bmCount} BM (${baseline.totalSlots} slots) + ${baseline.imCount} IM (${baseline.totalInstances} inst) = ${baseline.calls} draw calls, ${baseline.triangles.toLocaleString()} triangles`);
    }

    // Hide 50% test
    const hideResult = await page.evaluate(() => {
      const APP = window.APP;
      let hidden = 0, total = 0;
      for (const bmId in APP._batchMeta) {
        const meta = APP._batchMeta[bmId];
        let bmObj = null;
        APP.scene.traverse(obj => {
          if (obj.isBatchedMesh && String(obj.id) === bmId) bmObj = obj;
        });
        if (!bmObj) continue;
        for (let i = 0; i < meta.length; i++) {
          total++;
          if (i % 2 === 0) { bmObj.setVisibleAt(meta[i].slotId, false); hidden++; }
        }
      }
      APP.renderer.render(APP.scene, APP.camera);
      return { hidden, total, trianglesAfter: APP.renderer.info.render.triangles };
    });

    const reduction = baseline ? ((1 - hideResult.trianglesAfter / baseline.triangles) * 100).toFixed(1) : '?';
    console.log(`§PW_4005 HIDE50 hidden=${hideResult.hidden}/${hideResult.total} triangles=${hideResult.trianglesAfter.toLocaleString()} reduction=${reduction}%`);

    // Restore
    await page.evaluate(() => {
      const APP = window.APP;
      for (const bmId in APP._batchMeta) {
        const meta = APP._batchMeta[bmId];
        let bmObj = null;
        APP.scene.traverse(obj => { if (obj.isBatchedMesh && String(obj.id) === bmId) bmObj = obj; });
        if (!bmObj) continue;
        for (let i = 0; i < meta.length; i++) bmObj.setVisibleAt(meta[i].slotId, true);
      }
    });

    expect(hideResult.trianglesAfter).toBeLessThan(baseline.triangles);
  });

  test('T_4004: LTU 122K — DLOD grid is empty (all BatchedMesh)', async ({ page }) => {
    test.skip(!HAS_LTU, 'LTU DB not available locally');
    test.setTimeout(300000);  // 5 min — LTU is huge
    const logs = new ConsoleLogs(page);
    await page.goto(LTU_URL);
    await waitForViewer(page);
    await page.waitForTimeout(5000);

    const gridLogs = logs.tagged('§DLOD_GRID');
    console.log('§PW_4004 DLOD_GRID: ' + gridLogs.map(l => l.text).join(' | '));

    const flushLogs = logs.tagged('§BATCHED_FLUSH');
    console.log('§PW_4004 BATCHED_FLUSH: ' + flushLogs.map(l => l.text).join(' | '));

    // Parse grid meshes — expect 0 or very low for LTU
    if (gridLogs.length > 0) {
      const meshes = parseInt((gridLogs[0].text.match(/meshes=(\d+)/) || [, '0'])[1]);
      const batched = parseInt((gridLogs[0].text.match(/batched=(\d+)/) || [, '0'])[1]);
      console.log(`§PW_4004 VERDICT: grid has ${meshes} individual meshes — ${meshes === 0 ? 'EMPTY as predicted' : meshes + ' meshes in grid'}`);
      console.log(`§PW_4004 BatchedMesh objects: ${batched}`);
    }

    // Renderer stats
    const stats = await page.evaluate(() => {
      const APP = window.APP;
      if (!APP || !APP.renderer) return null;
      APP.renderer.render(APP.scene, APP.camera);
      const info = APP.renderer.info;
      let bmCount = 0, totalSlots = 0;
      for (const bmId in APP._batchMeta) { bmCount++; totalSlots += APP._batchMeta[bmId].length; }
      let imCount = 0, totalInstances = 0;
      for (const imId in APP._instanceMeta) { imCount++; totalInstances += APP._instanceMeta[imId].length; }
      return {
        triangles: info.render.triangles,
        calls: info.render.calls,
        bmCount, totalSlots, imCount, totalInstances,
        streamedCount: APP.streamedCount
      };
    });

    console.log('§PW_4004 RENDERER ' + JSON.stringify(stats));
    if (stats) {
      console.log(`§PW_4004 SUMMARY: ${stats.streamedCount} elements → ${stats.bmCount} BM (${stats.totalSlots} slots) + ${stats.imCount} IM (${stats.totalInstances} inst) = ${stats.calls} draw calls, ${stats.triangles.toLocaleString()} triangles`);
    }
  });

});
