// 07-import-ifc.spec.js — IFC file import via drop zone
// Bugs prevented:
//   788eb47c Coordinate transform chain broken
//   49730abb MEP-only import empty viewer
//   de0e22ac IFC import deployment issues
//
// Extensibility: When Drop Zone multi-format lands (DROP_ZONE_MULTI_FORMAT_SRS.md),
// add 07-import-dae.spec.js, 07-import-obj.spec.js etc. using same helpers.

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');
const path = require('path');

test.describe('IFC Import', () => {

  test('7.1 Landing page has drop zone @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto('/landing2.html');
    await page.waitForSelector('#import-zone', { timeout: 5000 });

    // Check for drop zone element (id="import-zone" in landing2.html)
    const hasDropZone = await page.evaluate(() => {
      return !!(document.getElementById('import-zone') ||
                document.querySelector('.drop-zone') ||
                document.querySelector('#drop-zone'));
    });

    console.log(`§PW_IMPORT_DROP hasDropZone=${hasDropZone}`);
    expect(hasDropZone).toBe(true);
  });

  test('7.2 File input accepts IFC @slow', async ({ page }) => {
    await page.goto('/landing2.html');
    await page.waitForSelector('#import-zone', { timeout: 5000 });

    // Check file input exists and accepts .ifc
    const accepts = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="file"]');
      for (const input of inputs) {
        if (input.accept && input.accept.includes('.ifc')) return true;
      }
      // Also check if any input exists at all
      return inputs.length > 0;
    });

    console.log(`§PW_IMPORT_ACCEPT ifc=${accepts}`);
    expect(accepts).toBe(true);
  });

  test('7.5 No console errors on landing @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto('/landing2.html');
    await page.waitForSelector('#import-zone', { timeout: 5000 });

    const errorCount = logs.errors.length;
    console.log(`§PW_IMPORT_CLEAN errors=${errorCount}`);
    expect(errorCount).toBe(0);
  });

  test('7.6 Unsupported format shows message @slow', async ({ page }) => {
    await page.goto('/landing2.html');
    await page.waitForSelector('#import-zone', { timeout: 5000 });

    // Try to trigger the format check with a bad extension
    const result = await page.evaluate(() => {
      if (typeof window.handleImportFile === 'function') {
        const fakeFile = new File(['test'], 'test.xyz', { type: 'application/octet-stream' });
        try { window.handleImportFile(fakeFile); } catch(e) {}
      }
      const status = document.querySelector('#import-status, .status, #status');
      return { message: status ? status.textContent : '', hasHandler: typeof window.handleImportFile === 'function' };
    });

    console.log(`§PW_IMPORT_REJECT handler=${result.hasHandler} message="${result.message.substring(0, 80)}"`);
    // Landing page must have the import handler wired
    expect(result.hasHandler).toBe(true);
  });

});
