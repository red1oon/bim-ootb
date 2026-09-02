// Targeted witness for §OFFLINE-GATEWAY-LEAK fix.
// Cleaner claim under test: once sfx.json is precached, the network layer must NEVER be touched
// for it again — proven by aborting any actual network attempt for it via context.route() and
// confirming the route handler is never invoked (i.e. the SW served it purely from Cache API,
// never called fetch() internally). page.on('request') is NOT reliable for this (it also fires
// for requests fully answered by a Service Worker's cache, so counting those over-reports "leaks").
const { chromium } = require('../node_modules/playwright');

const BASE = process.env.WITNESS_BASE_URL || 'http://localhost:8080/bim-ootb/viewer';
const VIEWER_URL = `${BASE}/viewer.html?db=/buildings/Duplex_extracted.db&lib=/buildings/Duplex_library.db`;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', msg => console.log('[console] ' + msg.text()));
  page.on('pageerror', e => console.log('[pageerror] ' + e.message));

  // ── Pass 1: online, cold — populate SW cache (install event precaches sfx.json now) ──
  await page.goto(VIEWER_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.APP && window.APP.scene, { timeout: 20000 });
  await page.waitForTimeout(3000); // let SW install/precache settle
  console.log('§WITNESS PASS1_ONLINE_LOAD done');

  // ── Pass 2: block the actual network layer for sfx.json entirely, then reload online ──
  // If the route handler NEVER fires, the SW never attempted a real fetch() for it (cache-first
  // served straight from Cache API) — that's the fix. If it fires, the old network-first leak
  // is still present.
  let sfxNetworkTouched = false;
  await context.route('**/sfx.json', route => { sfxNetworkTouched = true; route.abort(); });

  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.APP && window.APP.scene, { timeout: 20000 });
  await page.waitForTimeout(3000);
  console.log('§WITNESS PASS2_SFX_NETWORK_TOUCHED=' + sfxNetworkTouched + ' (must be false — the old code ALWAYS touched network here)');
  console.log('§WITNESS PASS2_PAGE_ERRORS=' + pageErrors.length + (pageErrors.length ? ' ' + JSON.stringify(pageErrors) : ''));

  // ── Pass 3: true offline — context.setOffline(true), reload, building must still render ──
  await context.unroute('**/sfx.json');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' }).catch(e => console.log('§WITNESS PASS3_RELOAD_NAV_ERR ' + e.message));
  const rendered = await page.waitForFunction(() => window.APP && window.APP.scene && window.APP.db, { timeout: 20000 })
    .then(() => true).catch(() => false);
  if (!rendered) {
    const statusText = await page.evaluate(() => (document.getElementById('status') || {}).textContent || '(no #status)').catch(() => '(eval failed)');
    console.log('§WITNESS PASS3_STATUS_TEXT=' + statusText);
  }
  console.log('§WITNESS PASS3_OFFLINE_RENDERED=' + rendered);

  await browser.close();
  const pass = !sfxNetworkTouched && rendered;
  console.log('§WITNESS DONE sfxLeakFixed=' + (!sfxNetworkTouched) + ' offlineWorks=' + rendered);
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§WITNESS FATAL ' + e.stack); process.exit(1); });
