// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

/**
 * S252: Verify Revit IFC4 colour extraction via IFCINDEXEDCOLOURMAP
 * Issue: web-ifc 0.0.77 returns white for IFC4 Revit files
 * Fix: walk IFCINDEXEDCOLOURMAP → face set → shape rep → product def → element
 */

const DEV_URL = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-dev/o/index.html';
const IFC_FILE = path.resolve(__dirname, '../../../../DAGCompiler/lib/input/IFC/UNMERGED/Ifc4_Revit_ARC.ifc');

test('S252: Revit IFC4 imports with real colours from IFCINDEXEDCOLOURMAP', async ({ page }) => {
  test.setTimeout(120000);

  // Collect console logs
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));

  // Step 1: Go to landing page and clear all storage
  await page.goto(DEV_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    // Clear IndexedDB
    return indexedDB.databases().then(dbs => {
      return Promise.all(dbs.map(db => {
        return new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(db.name);
          req.onsuccess = resolve;
          req.onerror = resolve;
        });
      }));
    });
  });
  await page.evaluate(() => {
    // Clear caches and service workers
    return Promise.all([
      caches.keys().then(k => Promise.all(k.map(n => caches.delete(n)))),
      navigator.serviceWorker.getRegistrations().then(r => Promise.all(r.map(sw => sw.unregister())))
    ]);
  });

  // Reload after clearing
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Step 2: Drop IFC file
  console.log('§TEST dropping ' + path.basename(IFC_FILE));
  const fileBuffer = fs.readFileSync(IFC_FILE);
  const dataTransfer = await page.evaluateHandle((data) => {
    const dt = new DataTransfer();
    const file = new File([new Uint8Array(data)], 'Ifc4_Revit_ARC.ifc', { type: '' });
    dt.items.add(file);
    return dt;
  }, [...fileBuffer]);

  // Find drop zone
  const dropZone = page.locator('#import-drop-zone').first();
  if (await dropZone.count() === 0) {
    // Try the main body as drop target
    await page.dispatchEvent('body', 'drop', { dataTransfer });
  } else {
    await dropZone.dispatchEvent('drop', { dataTransfer });
  }

  // Step 3: Wait for import to complete (look for §IMPORT_SAVED or §DB_BUILD)
  console.log('§TEST waiting for import...');
  await page.waitForFunction(() => {
    // Check if import is done via the UI
    const cards = document.querySelectorAll('.project-card, [data-key]');
    return cards.length > 0;
  }, { timeout: 90000 }).catch(() => {});

  // Wait extra for worker to finish
  await page.waitForTimeout(15000);

  // Step 4: Check logs
  const s252Logs = logs.filter(l => l.includes('[S252]'));
  const workerLogs = logs.filter(l => l.includes('[S220]'));
  const importLogs = logs.filter(l => l.includes('§IMPORT_SAVED') || l.includes('§DB_BUILD'));

  console.log('\n=== S252 Logs ===');
  s252Logs.forEach(l => console.log(l));
  console.log('\n=== Worker Logs ===');
  workerLogs.forEach(l => console.log(l));
  console.log('\n=== Import Logs ===');
  importLogs.forEach(l => console.log(l));

  // Verify S252 ran
  const icmLog = s252Logs.find(l => l.includes('§ICM faceSet'));
  const elemLog = s252Logs.find(l => l.includes('§ELEM_COLORS'));

  if (!icmLog && !elemLog) {
    // Worker might not have run - check if cache hit
    const cacheHit = logs.find(l => l.includes('§CACHE_HIT'));
    if (cacheHit) {
      console.log('§TEST CACHE_HIT detected — clearing and retrying...');
      // The cache wasn't fully cleared. Print all logs for debugging.
      console.log('\n=== ALL LOGS ===');
      logs.forEach(l => console.log(l));
    }
  }

  expect(workerLogs.length, 'Worker should have started').toBeGreaterThan(0);
  expect(s252Logs.length, 'S252 colour extraction should have run').toBeGreaterThan(0);

  // Check that some elements got colours
  if (elemLog) {
    const match = elemLog.match(/icm_mapped=(\d+)/);
    const mapped = match ? parseInt(match[1]) : 0;
    console.log('§TEST elements with ICM colour: ' + mapped);
    expect(mapped, 'Some elements should have ICM colours').toBeGreaterThan(0);
  }

  // Check materials count
  const geomLog = workerLogs.find(l => l.includes('§GEOM_DONE'));
  if (geomLog) {
    const matMatch = geomLog.match(/withMaterial=(\d+)/);
    const mats = matMatch ? parseInt(matMatch[1]) : 0;
    console.log('§TEST elements with material: ' + mats);
  }
});
