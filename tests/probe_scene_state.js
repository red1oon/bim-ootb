// probe_scene_state.js — §VERIFY scaffold: drive the viewer headless, count ACTUALLY-VISIBLE
// element slots (not a §-log), then test the isolate/hide mechanism directly.
// Issue under test (REVIT_LENS_FIX §B): does A.filterByGuids() visually hide the rest?
// Run: node tests/probe_scene_state.js   (server must serve bim-ootb root on :8137)
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8137;
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Duplex_extracted.db&bld=Duplex`;

// Page-context probe: count visible element slots across regular/instanced/batched meshes.
function sceneStateFn() {
  const A = window.A || window.APP;
  let regVis = 0, regTot = 0, instVis = 0, instTot = 0, batVis = 0, batTot = 0;
  A.scene.traverse(function(o) {
    if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) {
      const meta = A._batchMeta[o.id];
      for (let i = 0; i < meta.length; i++) {
        batTot++;
        // BatchedMesh.getVisibleAt(slotId) — true = drawn
        let v = true;
        try { v = o.getVisibleAt(meta[i].slotId); } catch (e) {}
        if (v && o.visible) batVis++;
      }
    } else if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) {
      const meta = A._instanceMeta[o.id];
      const m = new (window.THREE.Matrix4)();
      for (let i = 0; i < meta.length; i++) {
        instTot++;
        o.getMatrixAt(i, m);
        // zero-scale matrix => hidden. Check element [0] (scale-x proxy).
        const hidden = (m.elements[0] === 0 && m.elements[5] === 0 && m.elements[10] === 0);
        if (!hidden && o.visible) instVis++;
      }
    } else if (o.isMesh && o.userData && o.userData.guid !== undefined) {
      regTot++;
      if (o.visible) regVis++;
    }
  });
  return { regVis, regTot, instVis, instTot, batVis, batTot,
           totVis: regVis + instVis + batVis, totAll: regTot + instTot + batTot };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // Wait for streaming to finish: status text or §STREAM done log; cap 90s.
  try {
    await page.waitForFunction(() => {
      const A = window.A || window.APP;
      if (!A || !A.scene) return false;
      // streamedCount has caught up to queue, and at least some geometry exists
      return A.streamQueue && A.streamedCount >= A.streamQueue.length && A.streamQueue.length > 0;
    }, { timeout: 90000 });
  } catch (e) {
    console.log('WAIT_FAIL: ' + e.message);
  }
  await page.waitForTimeout(1500);

  const ident = await page.evaluate(() => ({
    aIsApp: window.A === window.APP,
    hasA: !!window.A, hasAPP: !!window.APP,
    activeBuilding: (window.A || window.APP || {}).activeBuilding,
    hasFilterByGuids: typeof (window.A || window.APP || {}).filterByGuids,
    streamed: (window.A || window.APP || {}).streamedCount,
    queue: ((window.A || window.APP || {}).streamQueue || []).length,
  }));
  console.log('IDENT: ' + JSON.stringify(ident));

  const before = await page.evaluate(sceneStateFn);
  console.log('VISIBLE_BEFORE: ' + JSON.stringify(before));

  // Pick 10 element guids that actually exist in the scene meta (so guid-keys match).
  const pick = await page.evaluate(() => {
    const A = window.A || window.APP;
    const guids = [];
    A.scene.traverse(function(o) {
      if (guids.length >= 10) return;
      if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) {
        A._batchMeta[o.id].forEach(function(m) { if (guids.length < 10 && m.guid != null) guids.push(m.guid); });
      } else if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) {
        A._instanceMeta[o.id].forEach(function(m) { if (guids.length < 10 && m.guid != null) guids.push(m.guid); });
      }
    });
    return guids;
  });
  console.log('PICKED_GUIDS(' + pick.length + '): ' + JSON.stringify(pick.slice(0, 3)) + '...');

  // Directly exercise the hide mechanism.
  await page.evaluate((guids) => {
    const A = window.A || window.APP;
    A.filterByGuids(new Set(guids));
  }, pick);
  await page.waitForTimeout(800);

  const after = await page.evaluate(sceneStateFn);
  console.log('VISIBLE_AFTER_ISOLATE_10: ' + JSON.stringify(after));
  console.log('DELTA: before.totVis=' + before.totVis + ' after.totVis=' + after.totVis +
    '  (expected after≈' + pick.length + ' if hide works)');

  // Restore, then test the REAL Find path: build the set the way _isolateGuidSet does
  // (from elements_meta SQL) and measure whether the scene actually hides.
  const realPath = await page.evaluate(() => {
    const A = window.A || window.APP;
    A.filterByGuids(null); // restore
    // scene guids set
    const sceneGuids = new Set();
    A.scene.traverse(function(o) {
      if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) A._batchMeta[o.id].forEach(m => m.guid != null && sceneGuids.add(m.guid));
      else if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) A._instanceMeta[o.id].forEach(m => m.guid != null && sceneGuids.add(m.guid));
    });
    const bld = A.activeBuilding || '';
    // exact _isolateGuidSet SQL for Level 2 / IfcWallStandardCase
    const rows = A.dbQuery("SELECT m.guid FROM elements_meta m WHERE 1=1 AND m.building=? AND m.storey=? AND m.ifc_class=?",
      [bld, 'Level 2', 'IfcWallStandardCase']);
    const setGuids = rows.map(r => r[0]);
    const inScene = setGuids.filter(g => sceneGuids.has(g)).length;
    return { bld, sceneGuidCount: sceneGuids.size, sqlSetSize: setGuids.length, intersectInScene: inScene,
             sampleSceneGuid: Array.from(sceneGuids).slice(0,2), sampleSqlGuid: setGuids.slice(0,2) };
  });
  console.log('REAL_PATH_DIAG: ' + JSON.stringify(realPath));

  // Now actually apply that SQL set via filterByGuids and measure
  await page.evaluate(() => {
    const A = window.A || window.APP;
    const rows = A.dbQuery("SELECT m.guid FROM elements_meta m WHERE 1=1 AND m.building=? AND m.storey=? AND m.ifc_class=?",
      [A.activeBuilding||'', 'Level 2', 'IfcWallStandardCase']);
    A.filterByGuids(new Set(rows.map(r => r[0])));
  });
  await page.waitForTimeout(600);
  const afterReal = await page.evaluate(sceneStateFn);
  console.log('VISIBLE_AFTER_SQL_ISOLATE(Level2/Walls,expect~24): ' + JSON.stringify(afterReal));

  console.log('--- last 25 console lines ---');
  console.log(logs.slice(-25).join('\n'));
  await browser.close();
})();
