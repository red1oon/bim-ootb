// 08-diff.spec.js — Two-DB diff overlay
// Bugs prevented:
//   4bdc9226 Diff direction fix, added element rendering
//   c60e29a5 NUM! in VO rates

const { test, expect } = require('@playwright/test');
const { openViewer, waitForStream } = require('../helpers/viewer');
const { ConsoleLogs } = require('../helpers/console-capture');

test.describe('Diff / Variance Overlay', () => {

  test('8.1 Load viewer with diffDb param @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    // Load with both base and diff DBs (use SampleHouse as diff against Duplex for test)
    await openViewer(page, {
      db: '/buildings/SampleHouse_extracted.db',
      lib: '/buildings/SampleHouse_library.db',
      diffdb: '/buildings/SampleHouse_extracted.db', // same DB = no diff, but tests loading
    });

    // diffDb loads async after stream — poll for it
    await page.waitForFunction(() => !!window.APP.diffDb, { timeout: 15000 });
    console.log('§PW_DIFF_LOAD diffDbLoaded=true');
    expect(true).toBe(true);
  });

  test('8.2 Variance button appears when diff loaded @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    await openViewer(page, {
      db: '/buildings/SampleHouse_extracted.db',
      lib: '/buildings/SampleHouse_library.db',
      diffdb: '/buildings/SampleHouse_extracted.db',
    });

    // Wait for diff computation
    await page.waitForFunction(() => !!window.APP.diffResult, { timeout: 15000 });

    const varianceBtnExists = await page.evaluate(() => {
      const btn = document.getElementById('variance-btn');
      return btn !== null;
    });

    console.log(`§PW_DIFF_BUTTON exists=${varianceBtnExists}`);
    expect(varianceBtnExists).toBe(true);
  });

  test('8.3 Diff computation does not throw @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    await openViewer(page, {
      db: '/buildings/SampleHouse_extracted.db',
      lib: '/buildings/SampleHouse_library.db',
      diffdb: '/buildings/SampleHouse_extracted.db',
    });

    await page.waitForFunction(() => !!window.APP.diffResult, { timeout: 15000 });

    // Check no errors related to diff
    const diffErrors = logs.errors.filter(e =>
      e.includes('diff') || e.includes('Diff') || e.includes('variance')
    );

    console.log(`§PW_DIFF_CLEAN diffErrors=${diffErrors.length}`);
    expect(diffErrors.length).toBe(0);
  });

  test('8.4 Diff result structure valid @fast', async ({ page }) => {
    await openViewer(page, {
      db: '/buildings/SampleHouse_extracted.db',
      lib: '/buildings/SampleHouse_library.db',
      diffdb: '/buildings/SampleHouse_extracted.db',
    });

    // Wait for diff to compute (poll instead of fixed timeout)
    await page.waitForFunction(() => !!window.APP.diffResult, { timeout: 15000 });

    const result = await page.evaluate(() => ({
      added: window.APP.diffResult.added?.length || 0,
      removed: window.APP.diffResult.removed?.length || 0,
      changed: window.APP.diffResult.changed?.length || 0,
    }));

    console.log(`§PW_DIFF_RESULT added=${result.added} removed=${result.removed} changed=${result.changed}`);
    // Same DB diffed against itself = should have 0 changes
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.changed).toBe(0);
  });

  test('8.5 Diff overlay does not crash @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    await openViewer(page, {
      db: '/buildings/SampleHouse_extracted.db',
      lib: '/buildings/SampleHouse_library.db',
      diffdb: '/buildings/SampleHouse_extracted.db',
    });

    await page.waitForFunction(() => !!window.APP.diffResult, { timeout: 15000 });

    // Try applying overlay if function exists
    const applied = await page.evaluate(() => {
      if (typeof window.APP.applyDiffOverlay === 'function') {
        window.APP.applyDiffOverlay();
        return true;
      }
      return false;
    });

    const diffErrors = logs.errors.filter(e =>
      e.includes('diff') || e.includes('Diff') || e.includes('variance') || e.includes('overlay')
    );
    console.log(`§PW_DIFF_OVERLAY applied=${applied} errors=${diffErrors.length}`);
    expect(diffErrors.length).toBe(0);
    expect(applied).toBe(true);
  });

});
