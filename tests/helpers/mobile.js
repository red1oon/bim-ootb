// mobile.js — Mobile viewport helpers for Playwright
// Usage: await setMobile(page, 'iphone13');

const DEVICES = {
  iphone13:          { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  iphone13_land:     { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  pixel5:            { width: 393, height: 851, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true },
  ipad:              { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ipad_land:         { width: 1024, height: 768, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/**
 * Set viewport to a named mobile device.
 */
async function setMobile(page, device) {
  const d = DEVICES[device];
  if (!d) throw new Error(`Unknown device: ${device}. Available: ${Object.keys(DEVICES).join(', ')}`);
  await page.setViewportSize({ width: d.width, height: d.height });
}

/**
 * Simulate swipe gesture.
 * @param {string} direction - 'left', 'right', 'up', 'down'
 */
async function swipe(page, direction, distance = 200) {
  const cx = page.viewportSize().width / 2;
  const cy = page.viewportSize().height / 2;
  const moves = {
    left:  { sx: cx + distance/2, sy: cy, ex: cx - distance/2, ey: cy },
    right: { sx: cx - distance/2, sy: cy, ex: cx + distance/2, ey: cy },
    up:    { sx: cx, sy: cy + distance/2, ex: cx, ey: cy - distance/2 },
    down:  { sx: cx, sy: cy - distance/2, ex: cx, ey: cy + distance/2 },
  };
  const m = moves[direction];
  if (!m) throw new Error(`Unknown direction: ${direction}`);

  await page.touchscreen.tap(m.sx, m.sy);
  // Playwright doesn't have native swipe, simulate with mouse
  await page.mouse.move(m.sx, m.sy);
  await page.mouse.down();
  await page.mouse.move(m.ex, m.ey, { steps: 10 });
  await page.mouse.up();
}

module.exports = { setMobile, swipe, DEVICES };
