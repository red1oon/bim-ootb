// 13-oci-sop.spec.js — Verify OCI deploy SOP covers all referenced files
// Issue: wizard.js, mesh_import_worker.js etc. missing from OCI upload → 404 on live dev
// Bugs prevented:
//   S229 wizard panel not appearing on OCI (script not uploaded)
//   S228 mesh import failing on OCI (worker not uploaded)
//   Any future dev/ file added to landing but forgotten in OCI_SETUP.md

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const DEPLOY_ROOT = path.resolve(__dirname, '..', '..', '..');
const LANDING_PATH = path.join(DEPLOY_ROOT, 'landing2.html');
const OCI_SETUP_PATH = path.join(DEPLOY_ROOT, '..', 'internal', 'OCI_SETUP.md');

test.describe('OCI Deploy SOP', () => {

  test('13.1 Landing page scripts all resolve locally @fast', async ({ page }) => {
    const failed = [];
    page.on('response', response => {
      const url = response.url();
      if ((url.endsWith('.js') || url.endsWith('.html')) &&
          !url.includes('sql.js.org') && !url.includes('cdn') && !url.includes('unpkg') &&
          !url.includes('goatcounter') && !url.includes('gc.zgo.at') &&
          response.status() >= 400) {
        failed.push({ file: url.split('/').pop().split('?')[0], status: response.status(), url });
      }
    });

    await page.goto('/landing2.html');
    // Wait for manifest load attempt and import cards render
    await page.waitForTimeout(3000);

    console.log(`§PW_OCI_LANDING_SCRIPTS failedJs=${failed.length}`);
    if (failed.length > 0) {
      for (const f of failed) {
        console.log(`  404: ${f.file} (${f.status}) ${f.url}`);
      }
    }
    expect(failed.length).toBe(0);
  });

  test('13.2 All landing <script src> files exist on disk @fast', async () => {
    const landing = fs.readFileSync(LANDING_PATH, 'utf-8');

    // Extract all <script src="..."> paths (exclude CDN/external)
    const srcPattern = /<script[^>]+src="([^"]+)"/g;
    let match;
    const localScripts = [];
    while ((match = srcPattern.exec(landing)) !== null) {
      const src = match[1];
      if (src.startsWith('http') || src.includes('goatcounter') || src.includes('gc.zgo.at')) continue;
      localScripts.push(src);
    }

    console.log(`§PW_OCI_SCRIPTS found=${localScripts.length}: ${localScripts.join(', ')}`);

    const missing = [];
    for (const src of localScripts) {
      const fullPath = path.join(DEPLOY_ROOT, src);
      if (!fs.existsSync(fullPath)) {
        missing.push(src);
      }
    }

    if (missing.length > 0) {
      console.log(`  MISSING on disk: ${missing.join(', ')}`);
    }
    expect(missing).toEqual([]);
  });

  test('13.3 All landing script refs are in OCI_SETUP upload commands @fast', async () => {
    const landing = fs.readFileSync(LANDING_PATH, 'utf-8');
    const ociSetup = fs.readFileSync(OCI_SETUP_PATH, 'utf-8');

    // Extract local script src paths from landing
    const srcPattern = /<script[^>]+src="([^"]+)"/g;
    let match;
    const localScripts = [];
    while ((match = srcPattern.exec(landing)) !== null) {
      const src = match[1];
      if (src.startsWith('http') || src.includes('goatcounter') || src.includes('gc.zgo.at')) continue;
      localScripts.push(src);
    }

    // Extract Worker URLs from JS code in landing
    const workerPattern = /new Worker\(['"]([^'"?]+)/g;
    while ((match = workerPattern.exec(landing)) !== null) {
      localScripts.push(match[1]);
    }

    // Also extract importScripts paths from mesh_import_worker.js
    // (these are relative to the worker's location)
    const workerPath = path.join(DEPLOY_ROOT, 'dev', 'mesh_import_worker.js');
    if (fs.existsSync(workerPath)) {
      const workerSrc = fs.readFileSync(workerPath, 'utf-8');
      const importPattern = /importScripts\(['"]([^'"]+)['"]\)/g;
      while ((match = importPattern.exec(workerSrc)) !== null) {
        const imp = match[1];
        // Skip CDN imports
        if (imp.startsWith('http')) continue;
        // Resolve relative to worker's dir (dev/)
        localScripts.push('dev/' + imp);
      }
    }

    // Deduplicate
    const uniqueScripts = [...new Set(localScripts)];

    // For each script, check it appears in OCI_SETUP.md upload commands
    // OCI_SETUP uses: --name "sandbox/foo.js" or --name "dev/foo.js" or --name "foo.js"
    const notInSOP = [];
    for (const src of uniqueScripts) {
      // The OCI object name is the src path as-is (relative to bucket root)
      // Check for: --name "src" or --name src or basename in a for-loop
      const basename = path.basename(src, '.js');
      const objName = src.replace(/\?.*$/, '');  // strip query params

      // Direct match: --name "objName" or --name objName
      const directMatch = ociSetup.includes('--name ' + objName) ||
                          ociSetup.includes('--name "' + objName + '"') ||
                          ociSetup.includes("--name '" + objName + "'");

      // For-loop match: basename appears in a `for f in ... ; do` line
      // that uploads to the matching directory
      const dir = path.dirname(objName);  // e.g. "sandbox" or "dev" or "."
      const forLoopPattern = new RegExp('for f in [^;]*\\b' + basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
      const forMatch = forLoopPattern.test(ociSetup);

      // Landing itself is uploaded as index.html
      const isLanding = src === 'landing2.html';

      if (!directMatch && !forMatch && !isLanding) {
        notInSOP.push(objName);
      }
    }

    console.log(`§PW_OCI_SOP_CHECK scripts=${uniqueScripts.length} missing_from_sop=${notInSOP.length}`);
    if (notInSOP.length > 0) {
      for (const f of notInSOP) {
        console.log(`  NOT IN OCI_SETUP: ${f}`);
      }
    }
    expect(notInSOP).toEqual([]);
  });

  test('13.4 Worker importScripts files exist on disk @fast', async () => {
    const workerPath = path.join(DEPLOY_ROOT, 'dev', 'mesh_import_worker.js');
    if (!fs.existsSync(workerPath)) {
      console.log('§PW_OCI_WORKER_DEPS ABSENT — mesh_import_worker.js not found');
      return;
    }

    const workerSrc = fs.readFileSync(workerPath, 'utf-8');
    const importPattern = /importScripts\(['"]([^'"]+)['"]\)/g;
    let match;
    const missing = [];

    while ((match = importPattern.exec(workerSrc)) !== null) {
      const imp = match[1];
      if (imp.startsWith('http')) continue;  // CDN — skip
      const fullPath = path.join(DEPLOY_ROOT, 'dev', imp);
      if (!fs.existsSync(fullPath)) {
        missing.push(imp);
      }
    }

    console.log(`§PW_OCI_WORKER_DEPS missing=${missing.length}`);
    if (missing.length > 0) {

      console.log(`  MISSING: ${missing.join(', ')}`);
    }
    expect(missing).toEqual([]);
  });

  // ── Live OCI smoke tests ──
  // Run with: TARGET=oci npx playwright test specs/13-oci-sop.spec.js --project=desktop
  // Skip with: npx playwright test (default — TARGET not set → skips OCI tests)
  const OCI_BASE = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-dev/o/';
  const TARGET = process.env.TARGET || 'local';
  const ociTest = TARGET === 'oci' ? test : test.skip;

  ociTest('13.5 OCI DEV landing loads without script 404s @fast', async ({ page }) => {
    const failed = [];
    page.on('response', response => {
      const url = response.url();
      if (url.includes('bim-ootb-dev') && response.status() >= 400) {
        failed.push({ file: url.split('/o/').pop(), status: response.status() });
      }
    });

    await page.goto(OCI_BASE + 'index.html', { timeout: 30000 });
    // Wait for scripts to load
    await page.waitForTimeout(3000);

    console.log(`§PW_OCI_LIVE_LANDING failedOci=${failed.length}`);
    if (failed.length > 0) {
      for (const f of failed) console.log(`  404: ${f.file} (${f.status})`);
    }
    expect(failed.length).toBe(0);
  });

  ociTest('13.6 OCI DEV viewer loads with wizard param @fast', async ({ page }) => {
    const failed = [];
    const consoleLogs = [];
    page.on('response', response => {
      const url = response.url();
      if (url.includes('bim-ootb-dev') && response.status() >= 400 && !url.includes('manifest')) {
        failed.push({ file: url.split('/o/').pop(), status: response.status() });
      }
    });
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('WIZARD') || text.includes('§')) consoleLogs.push(text);
    });

    // Use Duplex DB from the full bucket (always available)
    const fullBase = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-live/o/buildings/';
    const db = fullBase + 'Duplex_extracted.db';
    const lib = fullBase + 'Duplex_library.db';
    const viewerUrl = OCI_BASE + 'sandbox/index.html?db=' + encodeURIComponent(db) +
      '&lib=' + encodeURIComponent(lib) + '&wizard=1&wizardKey=oci_test';

    await page.goto(viewerUrl, { timeout: 60000 });

    // Wait for wizard panel (DB must load first, then wizard.js, then analyse)
    try {
      await page.waitForSelector('#wizard-panel', { timeout: 60000 });
    } catch(e) {
      console.log(`§PW_OCI_LIVE_WIZARD TIMEOUT — panel not found`);
      console.log(`  404s: ${failed.map(f => f.file).join(', ') || 'none'}`);
      console.log(`  logs: ${consoleLogs.slice(-10).join(' | ')}`);
      throw e;
    }

    const panelInfo = await page.evaluate(() => {
      const panel = document.getElementById('wizard-panel');
      if (!panel) return { exists: false };
      return {
        exists: true,
        question: panel.querySelector('#wizard-question')?.textContent || '',
        dots: panel.querySelectorAll('#wizard-progress .dot').length,
      };
    });

    console.log(`§PW_OCI_LIVE_WIZARD exists=${panelInfo.exists} question="${panelInfo.question}" dots=${panelInfo.dots}`);
    console.log(`  404s: ${failed.map(f => f.file).join(', ') || 'none'}`);
    console.log(`  logs: ${consoleLogs.filter(l => l.includes('WIZARD')).join(' | ')}`);

    expect(panelInfo.exists).toBe(true);
    expect(panelInfo.question).toContain('upright');
    expect(panelInfo.dots).toBeGreaterThanOrEqual(2);
  });

});
