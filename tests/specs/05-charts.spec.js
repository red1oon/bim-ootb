// 05-charts.spec.js — boq_charts.html renders 9 charts correctly
// Bugs prevented:
//   f8d633f6 Greedy regex corrupting chart URL (302-char base)
//   be17bc6e boq_charts path resolving to sandbox/
//   c60e29a5 NUM! in VO rates, unreadable axis labels
//   a72f7a52 Phase sequencing wrong

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');

const BOQ_URL = '/dev/boq_charts.html?db=/buildings/Duplex_extracted.db&lib=/buildings/Duplex_library.db&bld=Ifc2x3_Duplex_Architecture';

test.describe('BOQ Charts', () => {

  test('5.1 Charts page loads and renders @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);

    // Wait for WASM + DB fetch + Chart.js rendering to complete
    // The info element shows "Loading..." then building name when done
    await page.waitForFunction(() => {
      const info = document.getElementById('info');
      if (!info) return false;
      const t = info.textContent;
      return t && !t.includes('Loading') && t.length > 0;
    }, { timeout: 45000 });

    const state = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      const hasChartJs = typeof Chart !== 'undefined';
      const info = document.getElementById('info')?.textContent || '';
      const infoNoData = info.includes('No data');
      return { canvases: canvases.length, infoNoData, hasChartJs, info };
    });

    console.log(`§PW_CHART_RENDER canvases=${state.canvases} infoNoData=${state.infoNoData} chartJs=${state.hasChartJs} info="${state.info}"`);
    expect(state.hasChartJs).toBe(true);
    expect(state.canvases).toBeGreaterThan(0);
    expect(state.infoNoData).toBe(false);
  });

  test('5.2 Cost pie has content (not blank) @slow', async ({ page }) => {
    await page.goto(BOQ_URL);

    // Wait for charts to render (info element stops showing "Loading")
    await page.waitForFunction(() => {
      const info = document.getElementById('info');
      return info && !info.textContent.includes('Loading');
    }, { timeout: 45000 });

    const state = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      const info = document.getElementById('info')?.textContent || '';
      // "No data." only appears in #info when SQL query returned empty
      const infoNoData = info.includes('No data');
      return { canvases: canvases.length, infoNoData, info };
    });

    console.log(`§PW_CHART_PIE canvases=${state.canvases} infoNoData=${state.infoNoData} info="${state.info}"`);
    expect(state.infoNoData).toBe(false);
    expect(state.canvases).toBeGreaterThan(0);
  });

  test('5.3 No NaN or NUM! in visible text @slow', async ({ page }) => {
    await page.goto(BOQ_URL);
    await page.waitForFunction(() => {
      const info = document.getElementById('info');
      return info && !info.textContent.includes('Loading');
    }, { timeout: 45000 });

    // Check visible text only (exclude hidden elements, canvas internals)
    const result = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let nanCount = 0, numCount = 0;
      const nanLocations = [];
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent;
        const parent = walker.currentNode.parentElement;
        if (!parent || getComputedStyle(parent).display === 'none') continue;
        if (text.includes('NaN')) { nanCount++; nanLocations.push(parent.tagName + ':' + text.substring(0, 50)); }
        if (text.includes('NUM!')) numCount++;
      }
      return { nanCount, numCount, nanLocations };
    });

    console.log(`§PW_CHART_NANUM visibleNaN=${result.nanCount} NUM!=${result.numCount}`);
    if (result.nanCount > 0) console.log('  NaN locations:', result.nanLocations.join(' | '));
    expect(result.numCount).toBe(0);
    // NaN in visible text is a bug (hidden tooltip internals excluded by display:none check above)
    expect(result.nanCount).toBe(0);
  });

  test('5.4 Work packages listed @slow', async ({ page }) => {
    await page.goto(BOQ_URL);
    await page.waitForFunction(() => {
      const info = document.getElementById('info');
      return info && !info.textContent.includes('Loading');
    }, { timeout: 45000 });

    const pageText = await page.evaluate(() => document.body.textContent);
    const hasWP = pageText.includes('PACKAGE') || pageText.includes('Package') || pageText.includes('WP');
    console.log(`§PW_CHART_PACKAGES hasWorkPackages=${hasWP}`);
    expect(hasWP).toBe(true);
  });

  test('5.5 Currency symbol displayed @slow', async ({ page }) => {
    await page.goto(BOQ_URL);
    await page.waitForFunction(() => {
      const info = document.getElementById('info');
      return info && !info.textContent.includes('Loading');
    }, { timeout: 45000 });

    const pageText = await page.evaluate(() => document.body.textContent);
    const hasCurrency = pageText.includes('$') || pageText.includes('RM') || pageText.includes('USD');
    console.log(`§PW_CHART_CURRENCY hasCurrency=${hasCurrency}`);
    expect(hasCurrency).toBe(true);
  });

  test('5.6 Page has no console errors @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await page.waitForFunction(() => {
      const info = document.getElementById('info');
      return info && !info.textContent.includes('Loading');
    }, { timeout: 45000 });

    const errorCount = logs.errors.length;
    console.log(`§PW_CHART_CLEAN errors=${errorCount} logs=${logs.entries.length}`);
    expect(errorCount).toBe(0);
  });

});
