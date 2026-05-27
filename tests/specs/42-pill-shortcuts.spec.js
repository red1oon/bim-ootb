// 42-pill-shortcuts.spec.js — §S281 input-event suite (registry-level, NOT effect-level).
// Verifies the registry RECEIVES and ROUTES raw input events. Per user scope: we only need
// to know the key press / focus / Tab / arrow REGISTERED — not that the handler does the
// right thing. Each case asserts purely on the dispatcher's §-signal.
//
// Signals (already emitted by scene.js dispatcher + input_registry.js):
//   keypress      → §SHORTCUT_FIRE key=X  /  §KBD_SEQ_FIRE
//   panel focus   → §PANEL_FOCUS id=X
//   Tab           → §KBD_ROUTE tab  →  §PANEL_TAB
//   arrow in panel→ §KBD_ROUTE panel=X key=ArrowDown

const { test, expect } = require('@playwright/test');
const { openViewer } = require('../helpers/viewer');

function capture(page, logs) {
  page.on('console', m => { const t = m.text(); if (t.includes('§')) logs.push(t); });
}
async function ready(page) {
  await openViewer(page);
  await page.waitForFunction(() => window._shortcuts && Object.keys(window._shortcuts).length > 0, { timeout: 30000 });
}

test.describe('Input events — registry receives & routes', () => {

  test('42.1 keypress: every shortcut fires (no NO_FIRE) @fast', async ({ page }) => {
    const logs = []; capture(page, logs);
    await ready(page);
    const keys = await page.evaluate(() => Object.keys(window._shortcuts));
    for (const k of keys) {
      await page.evaluate((key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })), k);
      await page.waitForTimeout(80);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(400);
    const fired = new Set(logs.filter(l => /§SHORTCUT_FIRE|§KBD_SEQ_FIRE/.test(l))
      .map(l => (l.match(/key=(\S+)|seq=(\S+)/) || [])[1]).filter(Boolean));
    const notFired = keys.filter(k => !fired.has(k));
    console.log('§PW_KEYPRESS total=' + keys.length + ' fired=' + fired.size + ' notFired=' + notFired.join(','));
    expect(notFired, 'every key press registered').toEqual([]);
  });

  test('42.2 Tab routes to panel focus @fast', async ({ page }) => {
    const logs = []; capture(page, logs);
    await ready(page);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    const tab = logs.some(l => l.includes('§KBD_ROUTE tab') || l.includes('§PANEL_TAB'));
    console.log('§PW_TAB routed=' + tab);
    expect(tab, 'Tab produced a routing signal').toBe(true);
  });

  test('42.3 panel focus emits §PANEL_FOCUS @fast', async ({ page }) => {
    const logs = []; capture(page, logs);
    await ready(page);
    // cycle a couple of times to land focus on a visible panel
    await page.keyboard.press('Tab'); await page.waitForTimeout(150);
    await page.keyboard.press('Tab'); await page.waitForTimeout(150);
    const focus = logs.some(l => l.startsWith('§PANEL_FOCUS') && !l.includes('FAIL'));
    console.log('§PW_FOCUS focused=' + focus);
    expect(focus, 'a panel received focus').toBe(true);
  });

  test('42.4 arrow keys route within focused panel @fast', async ({ page }) => {
    const logs = []; capture(page, logs);
    await ready(page);
    await page.keyboard.press('Tab'); await page.waitForTimeout(150);
    await page.keyboard.press('Tab'); await page.waitForTimeout(150);
    // traverse: arrow down a few times through the panel's rows
    for (let n = 0; n < 4; n++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80); }
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(80);
    const arrows = logs.filter(l => /§KBD_ROUTE panel=.*key=Arrow/.test(l));
    console.log('§PW_ARROW routedCount=' + arrows.length);
    expect(arrows.length, 'arrow keys routed into a focused panel').toBeGreaterThan(0);
  });
});
