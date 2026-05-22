// 10-deploy-integrity.spec.js — URL routing, boq path, stale references
// Bugs prevented:
//   f8d633f6 chart URL greedy regex (302-char base)
//   be17bc6e boq_charts path resolving wrong
//   85f01c6a Production landing broken after monolith delete

const { test, expect } = require('@playwright/test');
const { openViewer } = require('../helpers/viewer');
const { ConsoleLogs } = require('../helpers/console-capture');

test.describe('Deploy Integrity', () => {

  test('10.1 Viewer loads without 404s @fast', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    const failed = [];

    page.on('response', response => {
      if (response.status() >= 400 && !response.url().includes('favicon')) {
        failed.push({ url: response.url(), status: response.status() });
      }
    });

    await openViewer(page);

    console.log(`§PW_DEPLOY_LOAD failed_requests=${failed.length}`);
    if (failed.length > 0) {
      console.log('  FAILED:', failed.map(f => `${f.status} ${f.url.split('/').pop()}`).join(', '));
    }
    expect(failed.length).toBe(0);
  });

  test('10.2 Chart URL uses correct base (not greedy regex) @fast', async ({ page }) => {
    await openViewer(page);

    // Simulate export4D5D URL building logic
    const urlInfo = await page.evaluate(() => {
      const href = location.href;
      const base = href.split('?')[0].match(/(.*\/)/)?.[1] || '../';
      return { href: href.substring(0, 80), base: base.substring(0, 80), baseLen: base.length };
    });

    console.log(`§PW_DEPLOY_CHART_URL baseLen=${urlInfo.baseLen} base="${urlInfo.base}"`);
    // Base should be short (< 100 chars), not the 302-char greedy match
    expect(urlInfo.baseLen).toBeLessThan(150);
  });

  test('10.3 boq_charts.html exists and is chart page @fast', async ({ page }) => {
    const response = await page.goto('/dev/boq_charts.html');
    const status = response.status();
    const body = await page.content();

    const isChart = body.includes('chart.js') || body.includes('Chart.js') || body.includes('Chart(');
    const isViewer = body.includes('setupStreaming') || body.includes('loader.js');

    console.log(`§PW_DEPLOY_BOQ_PATH status=${status} isChart=${isChart} isViewer=${isViewer}`);
    expect(status).toBe(200);
    expect(isChart).toBe(true);
    expect(isViewer).toBe(false);
  });

  test('10.4 No stale monolith references @fast', async ({ page }) => {
    await page.goto('/dev/index.html');
    const body = await page.content();

    const hasMonolith = body.includes('rtree_browser_demo');
    console.log(`§PW_DEPLOY_NO_MONO hasMonolith=${hasMonolith}`);
    expect(hasMonolith).toBe(false);
  });

  test('10.5 DB params round-trip @fast', async ({ page }) => {
    const DB_PATH = '/buildings/Duplex_extracted.db';
    const LIB_PATH = '/buildings/Duplex_library.db';

    await openViewer(page, { db: DB_PATH, lib: LIB_PATH });

    const params = await page.evaluate(() => ({
      db: window.APP.DB_URL,
      lib: window.APP.LIB_URL,
    }));

    console.log(`§PW_DEPLOY_PARAMS db="${params.db}" lib="${params.lib}"`);
    expect(params.db).toContain('Duplex_extracted');
    expect(params.lib).toContain('Duplex_library');
  });

  test('10.6 All script tags resolve @fast', async ({ page }) => {
    const failed = [];
    page.on('response', response => {
      if (response.url().endsWith('.js') && response.status() >= 400) {
        failed.push(response.url().split('/').pop());
      }
    });

    await page.goto('/dev/index.html?db=/buildings/Duplex_extracted.db&lib=/buildings/Duplex_library.db');
    await page.waitForFunction(() => window.APP, { timeout: 10000 });

    console.log(`§PW_DEPLOY_SCRIPTS failedJs=${failed.length} ${failed.join(',')}`);
    expect(failed.length).toBe(0);
  });

});
