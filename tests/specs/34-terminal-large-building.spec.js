// 34-terminal-large-building.spec.js — Large building (Terminal 48K elements) GF verification
// Issue proven/disproven:
//   T_3401: Terminal GF section cut produces wall contours (walls visible at overview zoom)
//   T_3402: Grid lines detected on Terminal
//   T_3403: Band filter band height >= 2m (not crushed by metadata storeys)
//   T_3404: Contour render has ribbon outline (minOutlineW for large buildings)
//   T_3405: Door arcs detected on Terminal GF

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');
const fs = require('fs');
const path = require('path');

const TERMINAL_DB = path.join(__dirname, '../../buildings/Terminal_extracted.db');
const VIEWER_URL = '/dev/index.html?db=/buildings/Terminal_extracted.db&bld=Terminal';

// Skip if Terminal DB not available locally
const HAS_DB = fs.existsSync(TERMINAL_DB);

function waitForViewer(page) {
  return page.waitForFunction(() => {
    const s = document.getElementById('status');
    return s && (s.textContent.includes('ready') || s.textContent.includes('complete') ||
                 s.textContent.includes('Grid') || s.textContent.includes('loaded') ||
                 s.textContent.includes('rendered') || s.textContent.includes('DONE'));
  }, { timeout: 120000 });
}

test.describe('Terminal Large Building — GF Contour Verification', () => {

  test('T_3401: Terminal GF produces wall contours — §SC_CLASSES shows IfcWall', async ({ page }) => {
    test.skip(!HAS_DB, 'Terminal DB not available locally');
    test.setTimeout(180000);
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(2000);

    // Enter grid mode
    await page.evaluate(() => {
      const APP = window.APP || window._APP;
      if (APP && APP.toggleGridOverlay) APP.toggleGridOverlay();
    });
    await page.waitForTimeout(1000);

    // Click GF
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.grid-view-btn');
      for (const b of btns) { if (b.textContent === 'GF') b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true})); }
    });
    await page.waitForTimeout(30000); // 48K elements needs time for section cut

    const classLogs = logs.tagged('§SC_CLASSES');
    console.log('§PW_3401 SC_CLASSES: ' + classLogs.map(l=>l.text).join(' | '));
    expect(classLogs.length).toBeGreaterThan(0);
    const hasWall = classLogs.some(l => l.text.includes('IfcWall'));
    expect(hasWall).toBe(true);

    // Take screenshot for visual verification
    await page.screenshot({ path: path.join(__dirname, '../test-results/terminal-gf.png') });
  });

  test('T_3402: Terminal grid detection finds structural lines', async ({ page }) => {
    test.skip(!HAS_DB, 'Terminal DB not available locally');
    test.setTimeout(120000);
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const APP = window.APP || window._APP;
      if (APP && APP.toggleGridOverlay) APP.toggleGridOverlay();
    });
    await page.waitForTimeout(1000);

    const detectLogs = logs.tagged('§GRID_DETECT');
    console.log('§PW_3402 GRID_DETECT: ' + detectLogs.map(l=>l.text).join(' | '));
    expect(detectLogs.length).toBeGreaterThan(0);
  });

  test('T_3403: Band filter band height >= 2m — not crushed', async ({ page }) => {
    test.skip(!HAS_DB, 'Terminal DB not available locally');
    test.setTimeout(180000);
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const APP = window.APP || window._APP;
      if (APP && APP.toggleGridOverlay) APP.toggleGridOverlay();
    });
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const btns = document.querySelectorAll('.grid-view-btn');
      for (const b of btns) { if (b.textContent === 'GF') b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true})); }
    });
    await page.waitForTimeout(10000);

    const bandLogs = logs.tagged('§SC_BAND_FILTER');
    console.log('§PW_3403 BAND_FILTER: ' + bandLogs.map(l=>l.text).join(' | '));
    expect(bandLogs.length).toBeGreaterThan(0);

    // Parse bandMin and bandMax to verify band height >= 2m
    const bandText = bandLogs[0].text;
    const minMatch = bandText.match(/bandMin=([-\d.]+)/);
    const maxMatch = bandText.match(/bandMax=([-\d.]+)/);
    if (minMatch && maxMatch) {
      const bandHeight = parseFloat(maxMatch[1]) - parseFloat(minMatch[1]);
      console.log('§PW_3403 band height=' + bandHeight.toFixed(2) + 'm');
      expect(bandHeight).toBeGreaterThanOrEqual(2.0);
    }
  });

  test('T_3404: grid_contours.js buildRibbon uses minOutlineW for large buildings', async ({ page }) => {
    const src = fs.readFileSync(path.join(__dirname, '../../viewer/grid_contours.js'), 'utf8');
    expect(src).toContain('minOutlineW');
    expect(src).toContain('MIN_WALL_SCREEN_PX');
    expect(src).toContain('buildRibbon');
    // Ribbon color must come from outlineMap, not hardcoded
    expect(src).toContain('ribbonColor');
    console.log('§PW_3404 buildRibbon + minOutlineW + ribbonColor wired');
  });

  test('T_3405: Terminal GF produces door arcs', async ({ page }) => {
    test.skip(!HAS_DB, 'Terminal DB not available locally');
    test.setTimeout(180000);
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const APP = window.APP || window._APP;
      if (APP && APP.toggleGridOverlay) APP.toggleGridOverlay();
    });
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const btns = document.querySelectorAll('.grid-view-btn');
      for (const b of btns) { if (b.textContent === 'GF') b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true})); }
    });
    await page.waitForTimeout(10000);

    const arcLogs = logs.tagged('§DOOR_ARC');
    console.log('§PW_3405 DOOR_ARC logs=' + arcLogs.length);
    for (const l of arcLogs.slice(0, 5)) console.log('  ' + l.text);
    // Terminal should have doors
    expect(arcLogs.length).toBeGreaterThan(0);
  });
});
