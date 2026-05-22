// 28-grid-overlay-init.spec.js — 2D_025 init wiring
// Issue proven/disproven:
//   T_INIT_01: APP.toggleGridOverlay is attached after viewer init
//             (proves/disproves the else-if bug in main.js line 73)
//   T_INIT_02: open2DPlans() calls toggleGridOverlay, NOT fallback 2d.html
//   T_INIT_03: §INIT_WARN is NOT logged (no fallback triggered)
//   T_INIT_04: §2D_OPEN fallback warning is NOT in console on button click

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');

const VIEWER_URL = '/dev/index.html?db=/buildings/SampleHouse_extracted.db&bld=Ifc4_SampleHouse';

function waitForViewer(page) {
  return page.waitForFunction(() => {
    const s = document.getElementById('status');
    return s && (s.textContent.includes('ready') || s.textContent.includes('complete') ||
                 s.textContent.includes('Grid') || s.textContent.includes('loaded') ||
                 s.textContent.includes('rendered') || s.textContent.includes('DONE'));
  }, { timeout: 60000 });
}

test.describe('2D grid overlay init wiring (main.js §INIT_DIAG)', () => {

  test('T_INIT_01: APP.toggleGridOverlay is a function after viewer init @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(1000);

    const diag = await page.evaluate(() => {
      const APP = window.APP || window._APP;
      return {
        hasToggle: typeof (APP && APP.toggleGridOverlay) === 'function',
        hasAssembler: typeof window.GridAssembler !== 'undefined',
        hasSetup: typeof window.setupGridOverlay === 'function'
      };
    });

    // Log §-lines for whitebox verification
    const initDiag = logs.all().find(l => l.includes('§INIT_DIAG'));
    const initWarn = logs.all().find(l => l.includes('§INIT_WARN'));
    console.log('§PW_INIT_DIAG ' + (initDiag || 'not found'));
    console.log('§PW_INIT_ALERT ' + (initWarn || 'none'));
    console.log('§PW_INIT_STATE GridAssembler=' + diag.hasAssembler +
      ' setupGridOverlay=' + diag.hasSetup + ' toggleGridOverlay=' + diag.hasToggle);

    // This test FAILS when the else-if bug is present (GridAssembler blocks setupGridOverlay)
    expect(diag.hasToggle).toBe(true);
  });

  test('T_INIT_02: open2DPlans() does not fall back to 2d.html @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(1000);

    // Block window.open so fallback is detectable without actually opening a tab
    await page.evaluate(() => {
      window._fallbackOpened = false;
      var origOpen = window.open;
      window.open = function(url) {
        if (url && url.includes('2d.html')) window._fallbackOpened = true;
        else origOpen.apply(this, arguments);
      };
    });

    await page.evaluate(() => {
      if (typeof window.open2DPlans === 'function') window.open2DPlans();
    });
    await page.waitForTimeout(800);

    const fallback = await page.evaluate(() => window._fallbackOpened);
    const warn = logs.all().find(l => l.includes('§2D_OPEN'));
    console.log('§PW_INIT_FALLBACK opened=' + fallback + ' warn=' + (warn || 'none'));

    // FAILS if 2d.html fallback triggered
    expect(fallback).toBe(false);
  });

  test('T_INIT_03: §INIT_WARN not logged when init is correct @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(1000);

    const warn = logs.all().find(l => l.includes('§INIT_WARN'));
    console.log('§PW_INIT_ALERT_CHECK ' + (warn ? 'PRESENT — bug active' : 'absent — init OK'));

    // FAILS while the else-if bug exists
    expect(warn).toBeUndefined();
  });

  test('T_INIT_04: §2D_OPEN fallback not triggered on 2D button click @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(1000);

    await page.evaluate(() => { if (typeof window.open2DPlans === 'function') window.open2DPlans(); });
    await page.waitForTimeout(800);

    const fallbackLog = logs.all().find(l => l.includes('§2D_OPEN') && l.includes('falling back'));
    console.log('§PW_2D_OPEN_FALLBACK ' + (fallbackLog ? 'TRIGGERED — bug confirmed' : 'not triggered'));

    // FAILS while the else-if bug exists
    expect(fallbackLog).toBeUndefined();
  });

});
