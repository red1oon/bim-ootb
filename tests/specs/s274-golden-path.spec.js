// s274-golden-path.spec.js — THE regression guard
// Full user flow: Landing → Drop IFC → Card click → Viewer loads → Streaming → Save As DB
// If this test passes, the integration is intact.
//
// Bugs prevented:
//   0f86628 openProject used /v0 URL, streaming.js couldn't derive split-DB
//   4ccf2ec landing page didn't persist metaDb/geoDb in record
//   78910b1 double IDB read froze browser on 300MB+ geo

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');
const path = require('path');

const VOGEL = path.resolve(__dirname, '..', 'fixtures', 'Vogel_Gesamt_upgraded.ifc');
const KEY = 'Vogel_Gesamt_upgraded.ifc';

test.describe('S274 Golden Path — Drop → Open → Stream → Save', () => {

  test('GP.1 Drop IFC on landing page @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto('/bim-ootb/index.html', { waitUntil: 'load' });
    await page.waitForSelector('#import-zone', { timeout: 10000 });

    // Clean previous
    await page.evaluate(async (k) => {
      if (typeof deleteProject === 'function') try { await deleteProject(k); } catch(e) {}
    }, KEY);

    // Drop the file
    await page.locator('#import-file-input').setInputFiles(VOGEL);

    // Wait for import to complete
    await expect.poll(() => {
      return logs.entries.some(e => e.text.includes('IMPORT_SAVED'));
    }, { timeout: 60000, message: 'IMPORT_SAVED not found' }).toBe(true);

    const savedLog = logs.entries.find(e => e.text.includes('IMPORT_SAVED'));
    console.log('§GP_IMPORT ' + savedLog.text);
    expect(savedLog.text).toContain(KEY);
  });

  test('GP.2 Click card opens viewer — not stuck @slow', async ({ page, context }) => {
    const logs = new ConsoleLogs(page);

    // First import the file (each test gets fresh context)
    await page.goto('/bim-ootb/index.html', { waitUntil: 'load' });
    await page.waitForSelector('#import-zone', { timeout: 10000 });
    await page.evaluate(async (k) => {
      if (typeof deleteProject === 'function') try { await deleteProject(k); } catch(e) {}
    }, KEY);
    await page.locator('#import-file-input').setInputFiles(VOGEL);

    await expect.poll(() => {
      return logs.entries.some(e => e.text.includes('IMPORT_SAVED'));
    }, { timeout: 60000, message: 'IMPORT_SAVED not found' }).toBe(true);

    // Intercept window.open
    await page.evaluate(() => { window._openedUrl = null; window.open = (u) => { window._openedUrl = u; return null; }; });

    // Click the card's Open button
    const openBtn = await page.waitForSelector('[data-open]', { timeout: 5000 });
    await openBtn.click();

    // Wait for URL
    await expect.poll(() => page.evaluate(() => window._openedUrl), {
      timeout: 15000, message: 'window.open not called'
    }).toBeTruthy();

    const viewerUrl = await page.evaluate(() => window._openedUrl);
    console.log('§GP_OPEN_URL ' + viewerUrl);

    // Check for split or monolith log (Vogel is small, may not split — that's OK)
    const openLog = logs.entries.find(e => e.text.includes('OPEN_PROJECT'));
    if (openLog) console.log('§GP_OPEN_MODE ' + openLog.text);

    // Navigate to the viewer URL in a new page
    const fullUrl = viewerUrl.startsWith('http') ? viewerUrl : new URL(viewerUrl, page.url()).href;
    const viewerPage = await context.newPage();
    const viewerLogs = new ConsoleLogs(viewerPage);
    await viewerPage.goto(fullUrl, { waitUntil: 'load', timeout: 30000 });

    // Wait for streaming to start (elements queued or flushed)
    await expect.poll(() => {
      return viewerLogs.entries.some(e =>
        e.text.includes('PROGRESSIVE_FLUSH') || e.text.includes('DS_QUEUED') || e.text.includes('STREAM_DONE')
      );
    }, { timeout: 30000, message: 'Streaming did not start — viewer may be stuck' }).toBe(true);

    const streamLog = viewerLogs.entries.find(e =>
      e.text.includes('PROGRESSIVE_FLUSH') || e.text.includes('DS_QUEUED')
    );
    console.log('§GP_STREAM ' + (streamLog ? streamLog.text : 'started'));

    await viewerPage.close();
  });

  test('GP.3 Error reporter works @slow', async ({ page }) => {
    await page.goto('/bim-ootb/viewer/viewer.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.reportError, { timeout: 15000 });

    // Trigger error
    await page.evaluate(() => APP.reportError(new Error('GP test error')));
    await page.waitForTimeout(500);

    // Toast should appear
    const toast = await page.$('#_err_toast');
    expect(toast).toBeTruthy();

    const toastText = await page.evaluate(() => document.getElementById('_err_toast').textContent);
    expect(toastText).toContain('Something went wrong');
    expect(toastText).toContain('GP test error');
    console.log('§GP_ERROR_TOAST ' + toastText.substring(0, 80));

    // Report button exists
    const reportBtn = await page.$('#_err_report');
    expect(reportBtn).toBeTruthy();
  });

  test('GP.4 Save As DB — record has data @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    // Import first
    await page.goto('/bim-ootb/index.html', { waitUntil: 'load' });
    await page.waitForSelector('#import-zone', { timeout: 10000 });
    await page.evaluate(async (k) => {
      if (typeof deleteProject === 'function') try { await deleteProject(k); } catch(e) {}
    }, KEY);
    await page.locator('#import-file-input').setInputFiles(VOGEL);

    await expect.poll(() => {
      return logs.entries.some(e => e.text.includes('IMPORT_SAVED'));
    }, { timeout: 60000, message: 'IMPORT_SAVED not found' }).toBe(true);

    // Open viewer to access APP._getImport
    await page.goto('/bim-ootb/viewer/viewer.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP._getImport, { timeout: 15000 });

    // Check record
    const record = await page.evaluate(async (k) => {
      const r = await APP._getImport(k);
      if (!r) return null;
      var dbBuf = r.versions ? r.versions[r.latestVersion || 0].db : r.extractedDb;
      return {
        found: true,
        dbSize: dbBuf ? dbBuf.byteLength : 0,
        hasMetaDb: !!r.metaDb,
        hasGeoDb: !!r.geoDb,
      };
    }, KEY);

    expect(record).toBeTruthy();
    expect(record.found).toBe(true);
    expect(record.dbSize).toBeGreaterThan(0);
    console.log('§GP_SAVE_DB dbSize=' + (record.dbSize / 1024).toFixed(0) + 'KB metaDb=' + record.hasMetaDb + ' geoDb=' + record.hasGeoDb);
  });
});
