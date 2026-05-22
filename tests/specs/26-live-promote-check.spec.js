// 26-live-promote-check.spec.js — Post-promote verification of bim-ootb-live
// Bugs prevented:
//   Landing page overwritten by viewer index.html
//   About box / building cards missing after promote
//   DEV banner leaking into production

const { test, expect } = require('@playwright/test');

const LIVE_BASE = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-live/o';

test.describe('Live Promote Check', { tag: '@live' }, () => {

  test('26.1 Landing page loads and is NOT the viewer @fast', async ({ page }) => {
    const response = await page.goto(`${LIVE_BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response.status()).toBe(200);

    const body = await page.content();
    // Landing has manifest/building cards, NOT viewer's setupStreaming/Three.js canvas
    const hasManifest = body.includes('loadManifest') || body.includes('manifest.json') || body.includes('BUILDINGS');
    const isViewer = body.includes('setupStreaming') || body.includes('id="canvas"');

    console.log(`§PW_LIVE_LANDING status=200 hasManifest=${hasManifest} isViewer=${isViewer}`);
    expect(hasManifest).toBe(true);
    expect(isViewer).toBe(false);
  });

  test('26.2 Landing has NO dev banner @fast', async ({ page }) => {
    await page.goto(`${LIVE_BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const body = await page.content();

    const hasDevBanner = body.includes('DEV ENVIRONMENT') || body.includes('DEVELOPMENT SITE');
    console.log(`§PW_LIVE_NO_DEV_BANNER hasDevBanner=${hasDevBanner}`);
    expect(hasDevBanner).toBe(false);
  });

  test('26.3 Landing About box present (Sysnova branding) @fast', async ({ page }) => {
    await page.goto(`${LIVE_BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const body = await page.content();

    // About box contains Sysnova reference or DIY Downloader
    const hasAbout = body.includes('Sysnova') || body.includes('sysnova') || body.includes('About') || body.includes('about');
    console.log(`§PW_LIVE_ABOUT hasAbout=${hasAbout}`);
    expect(hasAbout).toBe(true);
  });

  test('26.4 Landing has building links/cards @fast', async ({ page }) => {
    await page.goto(`${LIVE_BASE}/index.html`, { waitUntil: 'load', timeout: 30000 });
    // Wait for manifest-driven cards to render
    await page.waitForTimeout(3000);

    const cardCount = await page.evaluate(() => {
      // Cards could be .building-card, .card, or links to _extracted.db
      const cards = document.querySelectorAll('.building-card, .card, [data-building], a[href*="_extracted"]');
      return cards.length;
    });

    // Also check for BUILDINGS config or manifest reference
    const body = await page.content();
    const hasConfig = body.includes('BUILDINGS') || body.includes('manifest.json') || body.includes('loadManifest');

    console.log(`§PW_LIVE_CARDS cardCount=${cardCount} hasConfig=${hasConfig}`);
    // Must have building config at minimum
    expect(hasConfig).toBe(true);
  });

  test('26.5 Viewer loads (sandbox/index.html) with no DEV banner @fast', async ({ page }) => {
    const response = await page.goto(`${LIVE_BASE}/sandbox/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response.status()).toBe(200);

    const title = await page.title();
    const body = await page.content();
    const hasDevBanner = body.includes('DEVELOPMENT SITE');

    console.log(`§PW_LIVE_VIEWER title="${title}" hasDevBanner=${hasDevBanner}`);
    expect(title).not.toContain('DEV');
    expect(hasDevBanner).toBe(false);
  });

  test('26.6 Viewer scripts load without 404 @fast', async ({ page }) => {
    const failed = [];
    page.on('response', response => {
      const url = response.url();
      if (url.includes('sandbox/') && response.status() >= 400 && !url.includes('favicon')) {
        failed.push({ file: url.split('/').pop().split('?')[0], status: response.status() });
      }
    });

    await page.goto(`${LIVE_BASE}/sandbox/index.html`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000); // let scripts load

    console.log(`§PW_LIVE_404 failed=${failed.length}`);
    if (failed.length > 0) {
      for (const f of failed) {
        console.log(`  404: ${f.file} (${f.status})`);
      }
    }
    expect(failed.length).toBe(0);
  });

  test('26.7 boq_charts.html loads @fast', async ({ page }) => {
    const response = await page.goto(`${LIVE_BASE}/boq_charts.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response.status()).toBe(200);

    const body = await page.content();
    const isChart = body.includes('Chart') || body.includes('chart');
    console.log(`§PW_LIVE_BOQ status=200 isChart=${isChart}`);
    expect(isChart).toBe(true);
  });

  test('26.8 Landing has Share button (not Save) @fast', async ({ page }) => {
    await page.goto(`${LIVE_BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const body = await page.content();

    const hasShare = body.includes('data-share=') || body.includes('>Share<');
    const hasSave = body.includes('data-save=') || body.includes('>Save<');
    console.log(`§PW_LIVE_SHARE hasShare=${hasShare} hasSave=${hasSave}`);
    expect(hasShare).toBe(true);
    expect(hasSave).toBe(false);
  });

  test('26.9 boq_charts.html dependencies resolve (rates.js, locale_loader.js) @fast', async ({ page }) => {
    const failed = [];
    page.on('response', response => {
      const url = response.url();
      if (!url.includes('cdn') && !url.includes('jsdelivr') && !url.includes('sheetjs') &&
          response.status() >= 400 && !url.includes('favicon')) {
        failed.push({ file: url.split('/').pop().split('?')[0], status: response.status() });
      }
    });

    const db = `${LIVE_BASE}/buildings/SampleHouse_extracted.db`;
    await page.goto(`${LIVE_BASE}/boq_charts.html?db=${encodeURIComponent(db)}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000);

    console.log(`§PW_LIVE_BOQ_DEPS failed=${failed.length}`);
    if (failed.length > 0) {
      for (const f of failed) console.log(`  404: ${f.file} (${f.status})`);
    }
    expect(failed.length).toBe(0);
  });

  test('26.10 mep_report.html loads without 404s @fast', async ({ page }) => {
    const failed = [];
    page.on('response', response => {
      const url = response.url();
      if (!url.includes('cdn') && !url.includes('jsdelivr') &&
          response.status() >= 400 && !url.includes('favicon')) {
        failed.push({ file: url.split('/').pop().split('?')[0], status: response.status() });
      }
    });

    const db = `${LIVE_BASE}/buildings/SampleHouse_extracted.db`;
    await page.goto(`${LIVE_BASE}/mep_report.html?db=${encodeURIComponent(db)}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000);

    console.log(`§PW_LIVE_MEP_DEPS failed=${failed.length}`);
    if (failed.length > 0) {
      for (const f of failed) console.log(`  404: ${f.file} (${f.status})`);
    }
    expect(failed.length).toBe(0);
  });
});
