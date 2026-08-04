// WITNESS — TOUR_ROUTE_CACHE.md §4 (W-TOUR-CACHE-EVICT).
// ISSUE IT PROVES/DISPROVES: once localStorage's real per-origin quota is exhausted, EVERY future
// `§TOUR_CACHE store` attempt failed silently forever (`store-skip The quota has been exceeded.`),
// live-reported on LTU. The fix should self-heal: on a quota error, evict other tmTourCache keys
// and retry once — the very NEXT Fly press must succeed, not just a hand-cleared profile.
//   PASS = with localStorage pre-filled to quota with junk tmTourCache: keys, calling
//   A._startFlyTour() logs §TOUR_CACHE_EVICT (removed>0) followed by §TOUR_CACHE store (not a
//   second store-skip), and A.walkMode becomes true with the expected action count.
//   FAIL = store-skip with no successful retry, or an uncaught exception.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8931;

function serve() {
  return http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found: ' + p); return; }
      res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'application/javascript' : 'text/html' });
      res.end(data);
    });
  }).listen(PORT);
}

(async () => {
  const server = serve();
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  // --- Part A: stale-version prune fires unconditionally at module setup, no error needed ---
  const pageA = await browser.newPage();
  const logsA = [];
  pageA.on('console', m => logsA.push(m.text()));
  await pageA.evaluateOnNewDocument(() => {
    localStorage.setItem('tmTourCache:OldBld:v9:1-1-1:1', '{"stale":true}');   // dead version
    localStorage.setItem('tmTourCache:OldBld:v11:1-1-1:1', '{"stale":true}'); // dead version
    localStorage.setItem('tmTourCache:OldBld:v12:1-1-1:1', '{"live":true}');  // current version — must survive
  });
  await pageA.goto(`http://localhost:${PORT}/witness_tour_cache_evict.html`, { waitUntil: 'load' });
  const afterPrune = await pageA.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    return keys;
  });
  const pruneLogged = logsA.some(l => l.includes('§TOUR_CACHE_PRUNE stale-version removed=2'));
  const staleGone = !afterPrune.includes('tmTourCache:OldBld:v9:1-1-1:1') && !afterPrune.includes('tmTourCache:OldBld:v11:1-1-1:1');
  const liveSurvived = afterPrune.includes('tmTourCache:OldBld:v12:1-1-1:1');
  const prunePass = pruneLogged && staleGone && liveSurvived;
  console.log('PART A (stale-version prune): ' + (prunePass ? 'PASS' : 'FAIL') +
    ' — pruneLogged=' + pruneLogged + ' staleGone=' + staleGone + ' liveSurvived=' + liveSurvived +
    ' remainingKeys=' + JSON.stringify(afterPrune));
  await pageA.close();

  // --- Part B: quota-exceeded self-heal (eviction + retry) ---
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  await page.goto(`http://localhost:${PORT}/witness_tour_cache_evict.html`, { waitUntil: 'load' });

  // Fill localStorage to real quota with junk tmTourCache: keys — reproduces the live LTU state
  // (many stale building/version entries accumulated over a testing history) without needing
  // months of real usage.
  const fillResult = await page.evaluate(() => {
    let i = 0, lastErr = null;
    // Coarse pass: 200KB chunks until the first failure (fast).
    try {
      while (i < 200) {
        localStorage.setItem('tmTourCache:JunkBld' + i + ':v1:1-1-1:1', 'x'.repeat(200000));
        i++;
      }
    } catch (e) { lastErr = e.message; }
    // Fine pass: shrink the chunk size geometrically to top off remaining headroom so even a
    // TINY future write (like the ~80-byte real tour JSON) also fails — the actual live LTU
    // state, not just "one big write didn't fit."
    let size = 100000, fineWrites = 0;
    while (size >= 8) {
      try {
        localStorage.setItem('tmTourCache:JunkFine' + i + '_' + size, 'x'.repeat(size));
        i++; fineWrites++;
      } catch (e) { lastErr = e.message; size = Math.floor(size / 2); }
    }
    // Confirm true exhaustion: even a 1-byte write must now fail.
    let trulyFull = false;
    try { localStorage.setItem('tmTourCache:__probe__', 'x'); localStorage.removeItem('tmTourCache:__probe__'); }
    catch (e) { trulyFull = true; }
    return { keysWritten: i, fineWrites, lastErr, totalKeys: localStorage.length, trulyFull };
  });
  console.log('FILL: wrote ' + fillResult.keysWritten + ' junk keys (' + fillResult.fineWrites +
    ' in the fine pass), localStorage now has ' + fillResult.totalKeys + ' keys, trulyFull=' +
    fillResult.trulyFull);

  if (!fillResult.trulyFull) {
    console.log('FAIL: could not reproduce true quota exhaustion (even a 1-byte write still fit)');
    await browser.close(); server.close(); process.exit(1);
  }

  // Now call _startFlyTour directly — same call the live Fly-button press makes after prepare.
  const result = await page.evaluate(() => window.__runTest());
  await browser.close(); server.close();

  console.log('--- console log ---');
  logs.forEach(l => console.log(l));
  console.log('--- result ---', JSON.stringify(result));

  const sawEvict = logs.some(l => l.includes('§TOUR_CACHE_EVICT'));
  const sawStoreSuccess = logs.some(l => /§TOUR_CACHE store actions=/.test(l));
  const sawPostEvictSkip = logs.some(l => l.includes('store-skip (post-evict)'));
  const partBPass = sawEvict && sawStoreSuccess && !sawPostEvictSkip && result.walkMode === true && result.actions === 3;
  console.log('PART B (quota-exceeded self-heal): ' + (partBPass ? 'PASS' : 'FAIL') +
    ' — evict=' + sawEvict + ' storeOk=' + sawStoreSuccess + ' postEvictSkip=' + sawPostEvictSkip + ' walkMode=' + result.walkMode);

  const pass = prunePass && partBPass;
  console.log(pass ? 'OVERALL PASS' : 'OVERALL FAIL');
  process.exit(pass ? 0 : 1);
})();
