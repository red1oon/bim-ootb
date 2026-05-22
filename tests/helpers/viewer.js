// viewer.js — Open BIM OOTB viewer with DB params, wait for streaming
// Usage: const { page, logs } = await openViewer(browser, { db, lib });

const { ConsoleLogs } = require('./console-capture');

const DEFAULTS = {
  db: '/buildings/Duplex_extracted.db',
  lib: '/buildings/Duplex_library.db',
};

/**
 * Open viewer, wait for libraries to load and first building to stream.
 * Returns { page, logs } where logs is a ConsoleLogs instance.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {string} [opts.db]     - extracted DB path (relative to deploy/)
 * @param {string} [opts.lib]    - library DB path (relative to deploy/)
 * @param {string} [opts.diffdb] - optional diff DB path
 * @param {boolean} [opts.waitForStream=true] - wait for streaming to complete
 * @param {number} [opts.streamTimeout=45000] - ms to wait for stream
 */
async function openViewer(page, opts = {}) {
  const db = opts.db || DEFAULTS.db;
  const lib = opts.lib || DEFAULTS.lib;
  const logs = new ConsoleLogs(page);

  // Build URL
  let url = `/dev/index.html?db=${db}&lib=${lib}`;
  if (opts.diffdb) url += `&diffdb=${opts.diffdb}`;

  await page.goto(url);

  // Wait for Three.js canvas visible (loader.js removes overlay)
  await page.waitForSelector('#canvas', { state: 'visible', timeout: 30000 });

  // Wait for APP object to exist
  await page.waitForFunction(() => window.APP && window.APP.scene, { timeout: 20000 });

  if (opts.waitForStream !== false) {
    await waitForStream(page, opts.streamTimeout || 45000);
  }

  return { page, logs };
}

/**
 * Wait for streaming to complete (s-active text ends with "DONE" or turns green).
 */
async function waitForStream(page, timeout = 45000) {
  await page.waitForFunction(
    () => {
      const el = document.getElementById('s-active');
      return el && (el.textContent.includes('DONE') || el.style.color === 'rgb(68, 204, 68)');
    },
    { timeout, polling: 500 }
  );
}

/**
 * Get streaming stats from DOM.
 */
async function getStreamStats(page) {
  return page.evaluate(() => {
    const pInt = (id) => parseInt((document.getElementById(id)?.textContent || '0').replace(/,/g, ''));
    return {
      streamed: pInt('s-streamed'),
      total: pInt('s-building-total'),
      meshes: pInt('s-meshes'),
      active: document.getElementById('s-active')?.textContent || '',
      status: document.getElementById('status')?.textContent || '',
      buildings: pInt('s-buildings'),
      buildingsDone: pInt('s-buildings-done'),
    };
  });
}

module.exports = { openViewer, waitForStream, getStreamStats, DEFAULTS };
