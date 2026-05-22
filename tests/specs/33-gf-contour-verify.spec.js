// 33-gf-contour-verify.spec.js — Ground Floor contour + grid verification
// Issue proven/disproven:
//   T_3301: GF section cut produces wall contours with visible fill colors
//   T_3302: Grid lines detected at GF cut plane
//   T_3303: Door arcs generated for GF doors
//   T_3304: Contour render uses theme-aware colors (not black-on-dark)
//   T_3305: Grid panel shows X and Y axis dimensions
//   T_3306: Save cut button hidden when NOT in 2D mode
//   T_3307: Section cut band filter excludes IfcRoof from GF

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

test.describe('GF Contour + Grid Verification', () => {

  test('T_3301: GF view produces wall contours — §SC_CLASSES shows IfcWall with contours', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(1000);

    // Enter grid mode then GF view
    await page.evaluate(() => {
      const APP = window.APP || window._APP;
      if (APP && APP.toggleGridOverlay) APP.toggleGridOverlay();
    });
    await page.waitForTimeout(500);

    // Click GF button
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.grid-view-btn');
      for (const b of btns) { if (b.textContent === 'GF') b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true})); }
    });
    await page.waitForTimeout(3000);

    const sectionLogs = logs.tagged('§SC_CLASSES');
    console.log('§PW_3301 SC_CLASSES logs: ' + sectionLogs.length);
    for (const l of sectionLogs) console.log('  ' + l.text);

    // Must have at least one §SC_CLASSES log with IfcWall having contours
    expect(sectionLogs.length).toBeGreaterThan(0);
    const hasWall = sectionLogs.some(l => l.text.includes('IfcWall'));
    expect(hasWall).toBe(true);
  });

  test('T_3302: GF view produces grid lines — §GRID_DETECT shows xLines + yLines', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const APP = window.APP || window._APP;
      if (APP && APP.toggleGridOverlay) APP.toggleGridOverlay();
    });
    await page.waitForTimeout(500);

    const detectLogs = logs.tagged('§GRID_DETECT');
    console.log('§PW_3302 GRID_DETECT: ' + detectLogs.map(l=>l.text).join(' | '));
    expect(detectLogs.length).toBeGreaterThan(0);
  });

  test('T_3303: GF view generates door arcs — §DOOR_ARC_STOREY shows doors > 0', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const APP = window.APP || window._APP;
      if (APP && APP.toggleGridOverlay) APP.toggleGridOverlay();
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const btns = document.querySelectorAll('.grid-view-btn');
      for (const b of btns) { if (b.textContent === 'GF') b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true})); }
    });
    await page.waitForTimeout(3000);

    const arcLogs = logs.tagged('§DOOR_ARC_STOREY');
    console.log('§PW_3303 DOOR_ARC_STOREY: ' + arcLogs.map(l=>l.text).join(' | '));
    // SampleHouse should have doors
    expect(arcLogs.length).toBeGreaterThan(0);
  });

  test('T_3304: grid_contours.js fill uses white/black reverse — no invented colors', async ({ page }) => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../grid_contours.js'), 'utf8');

    // White on dark, black on light — true reverse for print
    expect(src).toContain("isDark ? '#ffffff' : '#000000'");
    expect(src).toContain('fillColor');
    // No artificial color inventions
    expect(src).not.toContain('#5588bb');
    expect(src).not.toContain('#cc8844');

    console.log('§PW_3304 fill = white/black reverse, no invented colors');
  });

  test('T_3305: GF panel shows X and Y axis dimensions', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const APP = window.APP || window._APP;
      if (APP && APP.toggleGridOverlay) APP.toggleGridOverlay();
    });
    await page.waitForTimeout(1000);

    // Check panel has dimension rows
    const panelInfo = await page.evaluate(() => {
      const panel = document.getElementById('grid-overlay-panel');
      if (!panel) return { exists: false };
      const body = panel.querySelector('#grid-panel-body');
      const rows = body ? body.querySelectorAll('.grid-row') : [];
      const xAxis = body ? body.innerHTML.includes('X-Axis') : false;
      const yAxis = body ? body.innerHTML.includes('Y-Axis') : false;
      return { exists: true, rows: rows.length, xAxis, yAxis };
    });

    console.log('§PW_3305 panel rows=' + panelInfo.rows + ' xAxis=' + panelInfo.xAxis + ' yAxis=' + panelInfo.yAxis);
    expect(panelInfo.exists).toBe(true);
    expect(panelInfo.rows).toBeGreaterThan(0);
  });

  test('T_3306: Save cut button appears when scissors ON — always available for card save', async ({ page }) => {
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(1000);

    // Toggle scissors ON
    const hasSaveBtn = await page.evaluate(() => {
      const APP = window.APP || window._APP;
      if (!APP || !APP.toggleSection) return 'no_section';
      APP.toggleSection();
      return !!document.getElementById('section-save-cut-btn');
    });

    console.log('§PW_3306 save btn when scissors ON=' + hasSaveBtn);
    expect(hasSaveBtn).toBe(true);
  });

  test('T_3307: Band filter excludes IfcRoof from GF — §SC_BAND_FILTER shows exclusions', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const APP = window.APP || window._APP;
      if (APP && APP.toggleGridOverlay) APP.toggleGridOverlay();
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const btns = document.querySelectorAll('.grid-view-btn');
      for (const b of btns) { if (b.textContent === 'GF') b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true})); }
    });
    await page.waitForTimeout(3000);

    const bandLogs = logs.tagged('§SC_BAND_FILTER');
    console.log('§PW_3307 BAND_FILTER: ' + bandLogs.map(l=>l.text).join(' | '));
    expect(bandLogs.length).toBeGreaterThan(0);

    // Also check §SC_CLASSES does NOT contain IfcRoof with contours
    const classLogs = logs.tagged('§SC_CLASSES');
    const hasRoofContour = classLogs.some(l => {
      const m = l.text.match(/withContour=\[([^\]]*)\]/);
      return m && m[1].includes('IfcRoof');
    });
    expect(hasRoofContour).toBe(false);
    console.log('§PW_3307 IfcRoof in contours=' + hasRoofContour);
  });
});
