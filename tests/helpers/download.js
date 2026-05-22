// download.js — Intercept file downloads in Playwright
// Usage: const file = await waitForDownload(page, () => page.click('#save-btn'));

/**
 * Wait for a download triggered by an action.
 * Returns { name, buffer, size } of the downloaded file.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Function} action - async function that triggers the download
 * @param {number} [timeout=15000]
 */
async function waitForDownload(page, action, timeout = 15000) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout }),
    action(),
  ]);
  const name = download.suggestedFilename();
  const path = await download.path();
  const fs = require('fs');
  const buffer = fs.readFileSync(path);
  return { name, buffer, size: buffer.length };
}

module.exports = { waitForDownload };
