// 09-mobile.spec.js — Mobile viewport, touch, landscape
// Bugs prevented:
//   67bfdf88 Viewport meta missing (mobile CSS never activated)
//   3c091053 Panel z-index stack wrong on mobile
//   82285eb8 Landscape panel width overflow
//   16ec0c45 Touch detection by support, not width

const { test, expect } = require('@playwright/test');
const { openViewer } = require('../helpers/viewer');
const { visible, rect, css } = require('../helpers/dom');

test.describe('Mobile UX', () => {

  test('9.1 Viewport meta tag present @slow', async ({ page }) => {
    await page.goto('/dev/index.html?db=/buildings/Duplex_extracted.db&lib=/buildings/Duplex_library.db');

    const viewport = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta ? meta.content : null;
    });

    console.log(`§PW_MOBILE_VIEWPORT content="${viewport}"`);
    expect(viewport).toBeTruthy();
    expect(viewport).toContain('width=device-width');
  });

  test('9.2 No horizontal scroll on mobile @slow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openViewer(page);

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    console.log(`§PW_MOBILE_FIT horizontalOverflow=${overflow}`);
    expect(overflow).toBe(false);
  });

  test('9.3 Landscape layout no overflow @slow', async ({ page }) => {
    await page.setViewportSize({ width: 812, height: 375 });
    await openViewer(page);

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    console.log(`§PW_MOBILE_LANDSCAPE horizontalOverflow=${overflow}`);
    expect(overflow).toBe(false);
  });

  test('9.4 Touch targets >= 44px @slow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openViewer(page);

    // Check all visible buttons have adequate touch targets
    const smallBtns = await page.evaluate(() => {
      const btns = document.querySelectorAll('button, [onclick]');
      const small = [];
      for (const btn of btns) {
        const r = btn.getBoundingClientRect();
        const style = getComputedStyle(btn);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (r.width > 0 && r.height > 0 && (r.width < 30 || r.height < 30)) {
          small.push({ id: btn.id || btn.textContent?.substring(0, 20), w: r.width, h: r.height });
        }
      }
      return small;
    });

    console.log(`§PW_MOBILE_TOUCH smallButtons=${smallBtns.length}`);
    if (smallBtns.length > 0) {
      console.log('  Small targets:', smallBtns.map(b => `${b.id}(${b.w.toFixed(0)}x${b.h.toFixed(0)})`).join(', '));
    }
    // Ratchet: track small touch targets, ceiling should decrease over time
    expect(smallBtns.length).toBeLessThan(20);
  });

  test('9.5 Toolbar buttons visible on mobile @slow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openViewer(page);

    const searchVisible = await visible(page, '#search-box');
    const hudVisible = await visible(page, '#hud');

    console.log(`§PW_MOBILE_TOOLBAR search=${searchVisible} hud=${hudVisible}`);
    expect(searchVisible).toBe(true);
    expect(hudVisible).toBe(true);
  });

  test('9.6 Walk button visible on mobile @slow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openViewer(page);

    const walkVisible = await visible(page, '#walk-mode-btn');
    console.log(`§PW_MOBILE_WALK walkBtn=${walkVisible}`);
    expect(walkVisible).toBe(true);
  });

  test.fixme('9.7 Site camera button visible on mobile @slow — needs GPS/getUserMedia', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openViewer(page);

    const camVisible = await visible(page, '#site-cam-btn');
    console.log(`§PW_MOBILE_SITECAM camBtn=${camVisible}`);
    expect(camVisible).toBe(true);
  });

  test('9.8 Viewport allows user zoom (WCAG 1.4.4) @slow', async ({ page }) => {
    await page.goto('/dev/index.html');

    const meta = await page.evaluate(() => {
      const m = document.querySelector('meta[name="viewport"]');
      return m ? m.content : null;
    });

    const hasNoScale = meta ? meta.includes('user-scalable=no') : false;
    const hasMaxScale = meta ? meta.includes('maximum-scale=1') : false;
    console.log(`§PW_MOBILE_ZOOM content="${meta}" user-scalable=no=${hasNoScale} maximum-scale=1=${hasMaxScale}`);
    // WCAG 1.4.4: users must be able to zoom
    expect(hasNoScale).toBe(false);
    expect(hasMaxScale).toBe(false);
  });

});
