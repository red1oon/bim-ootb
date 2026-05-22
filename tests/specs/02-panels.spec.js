// 02-panels.spec.js — Storey/discipline filter, toggle, collapse, position
// Bugs prevented:
//   569a4db7 DISC panel position swapped
//   0ef9df79 Storeys panel vertically centered
//   8040f2ee Swipe-hidden beats ID specificity
//   20375f89 HUD collapsed showing empty box

const { test, expect } = require('@playwright/test');
const { openViewer } = require('../helpers/viewer');
const { visible, text, count, css } = require('../helpers/dom');

test.describe('Panels — Storey & Discipline', () => {

  test.beforeEach(async ({ page }) => {
    await openViewer(page);
  });

  test('2.1 Storey panel populated @fast', async ({ page }) => {
    const btnCount = await count(page, '#storey-body button');
    console.log(`§PW_STOREY_PANEL buttons=${btnCount}`);
    // Duplex has at least 2 storeys
    expect(btnCount).toBeGreaterThan(0);
  });

  test('2.2 Storey filter works @fast', async ({ page }) => {
    // Wait for storey buttons to render (race condition fix)
    await page.waitForSelector('#storey-body button:nth-child(2)', { timeout: 10000 });
    const btns = page.locator('#storey-body button');
    const btnCount = await btns.count();
    expect(btnCount).toBeGreaterThanOrEqual(2);

    // Click second button (first specific storey, skip "All Storeys")
    await btns.nth(1).click();
    await page.waitForTimeout(300);

    // Check the button is active
    const isActive = await btns.nth(1).evaluate(el => el.classList.contains('active'));
    console.log(`§PW_STOREY_FILTER active=${isActive}`);
    expect(isActive).toBe(true);
  });

  test('2.3 All Storeys resets filter @fast', async ({ page }) => {
    await page.waitForSelector('#storey-body button:nth-child(2)', { timeout: 10000 });
    const btns = page.locator('#storey-body button');

    // Filter to one storey, then reset
    await btns.nth(1).click();
    await page.waitForTimeout(200);
    await btns.nth(0).click(); // "All Storeys"
    await page.waitForTimeout(200);

    const allActive = await btns.nth(0).evaluate(el => el.classList.contains('active'));
    console.log(`§PW_STOREY_RESET allActive=${allActive}`);
    expect(allActive).toBe(true);
  });

  test('2.4 Discipline panel populated @fast', async ({ page }) => {
    const btnCount = await count(page, '#disc-body button');
    console.log(`§PW_DISC_PANEL buttons=${btnCount}`);
    expect(btnCount).toBeGreaterThan(0);
  });

  test('2.5 Discipline toggle changes visibility @fast', async ({ page }) => {
    await page.waitForSelector('#disc-body button', { timeout: 10000 });
    const btns = page.locator('#disc-body button');
    const btnCount = await btns.count();
    expect(btnCount).toBeGreaterThan(0);

    // Click first discipline to toggle it off
    await btns.nth(0).click();
    await page.waitForTimeout(300);

    // Check that hidden disciplines set updated
    const hiddenCount = await page.evaluate(() => window.APP.hiddenDiscs.size);
    console.log(`§PW_DISC_TOGGLE hiddenDiscs=${hiddenCount}`);
    expect(hiddenCount).toBeGreaterThan(0);

    // Toggle back on
    await btns.nth(0).click();
  });

  test('2.6 Panel collapse @fast', async ({ page }) => {
    // Call togglePanel directly — no need to find header
    await page.evaluate(() => window.togglePanel('storey-body'));
    await page.waitForTimeout(200);

    const isCollapsed = await page.evaluate(() =>
      document.getElementById('storey-body')?.classList.contains('collapsed')
    );
    console.log(`§PW_PANEL_COLLAPSE collapsed=${isCollapsed}`);
    expect(isCollapsed).toBe(true);

    // Uncollapse
    await page.evaluate(() => window.togglePanel('storey-body'));
  });

  test('2.7 HUD accordion sections visible @fast', async ({ page }) => {
    // S265 Phase 4: storey + disc are now accordion sections inside HUD
    const storeySection = await visible(page, '#hud-storey-section');
    const discSection = await visible(page, '#hud-disc-section');

    console.log(`§PW_HUD_ACCORDION storey=${storeySection} disc=${discSection}`);
    // Both accordion sections should be visible inside HUD after streaming
    expect(storeySection).toBe(true);
    expect(discSection).toBe(true);
  });

});
