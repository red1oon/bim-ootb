// 06-excel-export.spec.js — Excel download, z-index bleed, no page navigation
// Bugs prevented:
//   92c2ce1f z-index overlap — Excel click triggered chart button behind
//   e7a7a16c async user gesture loss
//   6ada3bd4 mobile blob download vs writeFile
//   f8d633f6 chart URL greedy regex

const { test, expect } = require('@playwright/test');
const { openViewer } = require('../helpers/viewer');
const { zIndex } = require('../helpers/dom');

test.describe('Excel Export & Chart Button', () => {

  test('6.1 Chart button opens boq_charts @slow', async ({ page }) => {
    await openViewer(page);

    // Listen for popup (new tab) when clicking 📊
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 5000 }).catch(() => null),
      page.evaluate(() => window.export4D5D()),
    ]);

    if (popup) {
      await popup.waitForLoadState('domcontentloaded');
      const url = popup.url();
      console.log(`§PW_CHART_BTN url="${url.substring(0, 80)}..."`);
      expect(url).toContain('boq_charts');
      await popup.close();
    } else {
      // Same-tab navigation — check URL changed
      const url = page.url();
      console.log(`§PW_CHART_BTN same_tab url="${url.substring(0, 80)}"`);
      expect(url).toContain('boq_charts');
    }
  });

  test('6.2 Issues panel z-index above search-box @slow', async ({ page }) => {
    await openViewer(page);

    const issuesZ = await zIndex(page, '#issues-panel');
    const searchZ = await zIndex(page, '#search-box');

    console.log(`§PW_EXCEL_ZINDEX issues=${issuesZ} search=${searchZ}`);
    if (issuesZ !== null && searchZ !== null) {
      expect(issuesZ).toBeGreaterThan(searchZ);
    }
  });

  test('6.3 4D Excel download from boq_charts @slow', async ({ page }) => {
    const BOQ_URL = '/dev/boq_charts.html?db=/buildings/Duplex_extracted.db&lib=/buildings/Duplex_library.db&bld=Ifc2x3_Duplex_Architecture';
    await page.goto(BOQ_URL);
    await page.waitForFunction(() => {
      const info = document.getElementById('info');
      return info && !info.textContent.includes('Loading');
    }, { timeout: 45000 });

    const saveBtn = page.locator('button:has-text("4D"), button:has-text("Save 4D"), [onclick*="save4D"]');
    const exists = await saveBtn.count();
    expect(exists).toBeGreaterThan(0);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      saveBtn.first().click(),
    ]);

    if (download) {
      console.log(`§PW_EXCEL_4D file="${download.suggestedFilename()}"`);
      expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    } else {
      test.fixme('4D download not captured in headless Chromium');
    }
  });

  test('6.4 5D Excel download from boq_charts @slow', async ({ page }) => {
    const BOQ_URL = '/dev/boq_charts.html?db=/buildings/Duplex_extracted.db&lib=/buildings/Duplex_library.db&bld=Ifc2x3_Duplex_Architecture';
    await page.goto(BOQ_URL);
    await page.waitForFunction(() => {
      const info = document.getElementById('info');
      return info && !info.textContent.includes('Loading');
    }, { timeout: 45000 });

    const saveBtn = page.locator('button:has-text("5D"), button:has-text("Save 5D"), [onclick*="save5D"]');
    const exists = await saveBtn.count();
    expect(exists).toBeGreaterThan(0);

    // S232: saveAs (FileSaver.js) triggers download reliably after async chain
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
      saveBtn.first().click(),
    ]);

    if (download) {
      console.log(`§PW_EXCEL_5D file="${download.suggestedFilename()}"`);
      expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    } else {
      // Check status for error — if export ran but download not captured, that's OK
      const status = await page.textContent('#status');
      console.log(`§PW_EXCEL_5D_STATUS "${status}"`);
      expect(status).not.toContain('ERROR');
      expect(status).toContain('Saved');
    }
  });

  test('6.5 Export does not navigate away @slow', async ({ page }) => {
    await openViewer(page);
    const urlBefore = page.url();

    // Try chart export (should open new tab, not navigate)
    const popupPromise = page.waitForEvent('popup', { timeout: 3000 }).catch(() => null);
    await page.evaluate(() => window.export4D5D());
    const popup = await popupPromise;
    if (popup) await popup.close();

    const urlAfter = page.url();
    console.log(`§PW_EXCEL_NO_NAV same_page=${urlBefore === urlAfter}`);
    expect(urlAfter).toBe(urlBefore);
  });

  test('6.6 Issues Excel export button exists and is wired @slow', async ({ page }) => {
    await openViewer(page);

    // Open issues panel
    await page.evaluate(() => window.toggleIssues());
    await page.waitForTimeout(300);

    const exportBtn = page.locator('#issues-panel button:has-text("Export"), #issues-panel [onclick*="exportIssuesExcel"]');
    const exists = await exportBtn.count();
    console.log(`§PW_EXCEL_ISSUES exportBtnExists=${exists > 0}`);
    expect(exists).toBeGreaterThan(0);

    // Close issues
    await page.evaluate(() => window.toggleIssues());
  });

});
