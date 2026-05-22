// landing.js — Open landing page and interact with drop zone
// Usage: const { page, logs } = await openLanding(page);

const { ConsoleLogs } = require('./console-capture');

/**
 * Open the dev landing page and wait for drop zone ready.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openLanding(page) {
  const logs = new ConsoleLogs(page);
  await page.goto('/landing2.html');
  // Wait for drop zone to be interactive
  await page.waitForSelector('#import-zone', { timeout: 10000 });
  return { page, logs };
}

/**
 * Simulate file drop on the landing page drop zone.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} filePath - absolute path to file
 */
async function dropFile(page, filePath) {
  const fs = require('fs');
  const path = require('path');
  const buffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  // Create DataTransfer in page context
  await page.evaluate(async ({ name, data }) => {
    const buf = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const file = new File([buf], name, { type: 'application/octet-stream' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const dropZone = document.getElementById('import-zone');
    if (!dropZone) throw new Error('Drop zone #import-zone not found');
    dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  }, { name: fileName, data: buffer.toString('base64') });
}

module.exports = { openLanding, dropFile };
