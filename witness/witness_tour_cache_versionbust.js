// WITNESS — TOUR_ROUTE_CACHE.md §6 (bust the route cache on a stage-3 version recompile).
// ISSUE IT PROVES/DISPROVES: a persisted Fly-tour route cache (PR #940) survives across room
// recompiles triggered by callers OTHER than Fly itself (dlod_nav's nav-scope toggle, the needle
// button, cinema orbit) — none of those previously told the Fly cache its route was now stale.
// Sequence: (1) build+store a real cache via one Fly toggle, (2) force rooms_meta stale (simulate
// a ROOM_WALKER_V bump after the cache was already stored), (3) call A.ensureRooms({}) directly
// (the non-Fly path) — this must both recompile (§NEEDLE_VERSION_STALE) AND bust the Fly cache
// (§TOUR_CACHE_BUST), (4) toggle Fly again — it must MISS (rebuild), not replay the stale route.
//   PASS = step1 stores a cache; step3 logs both §NEEDLE_VERSION_STALE and §TOUR_CACHE_BUST idb
//   removed>0; step4 is a cache MISS (§TOUR_CACHE store, not hit).
//   FAIL = step3 is missing either log line, or step4 still hits the stale cache.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8933;
const BLD = process.env.BLD || 'HHS_Office_Federated';
const PROFILE = process.env.PPTR_PROFILE ||
  '/tmp/claude-1000/-home-red1-bim-compiler/ba2e75b2-1ea4-4d02-81ea-211b92cd22be/scratchpad/pptr-tour-versionbust-profile';

(async () => {
  const logs = [];
  const rmSync = require('fs').rmSync;
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {} // fresh profile: no leftover cache

  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: PROFILE,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  let pass = false;
  try {
    const url = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls, { timeout: 120000 });
    await page.waitForFunction(() => {
      const A = window.APP;
      try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 180000, polling: 2000 });
    for (let i = 0; i < 600; i++) {
      const st = await page.evaluate(() => ({ s: !!window.APP.streaming })).catch(e => ({ err: e.message }));
      if (st.err) throw new Error('page died: ' + st.err);
      if (!st.s) break;
      await new Promise(r => setTimeout(r, 2000));
    }

    // Step 1: one Fly toggle to build + store a real cached route (current, non-stale rooms).
    let mark = logs.length;
    await page.evaluate(() => { window.toggleFlyAround(); });
    await page.waitForFunction(() => window.APP.walkMode === true, { timeout: 300000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));
    let step1 = logs.slice(mark);
    const step1Store = step1.some(l => l.includes('§TOUR_CACHE store'));
    await page.evaluate(() => { window.toggleFlyAround(); }); // off
    await new Promise(r => setTimeout(r, 1000));
    console.log('STEP1(build-cache): store=' + step1Store);

    // Step 2: force rooms_meta stale — simulate a ROOM_WALKER_V bump that happened AFTER the
    // cache above was already stored (the exact interaction §6 is about).
    const forced = await page.evaluate(() => {
      try {
        window.APP.db.run("UPDATE rooms_meta SET version='fake-stale-v0' WHERE id=1");
        const r = window.APP.dbQuery("SELECT version FROM rooms_meta WHERE id=1");
        return r.length ? r[0][0] : null;
      } catch (e) { return 'ERR:' + e.message; }
    });
    console.log('STEP2(force-stale): rooms_meta.version=' + forced);

    // Step 3: a NON-Fly caller of ensureRooms (dlod_nav/needle/cinema all call A.ensureRooms({})
    // the same way) — must recompile AND bust the Fly cache in the same breath.
    mark = logs.length;
    await page.evaluate(async () => { await window.APP.ensureRooms({}); });
    await new Promise(r => setTimeout(r, 1000));
    const step3 = logs.slice(mark);
    const sawStale = step3.some(l => l.includes('§NEEDLE_VERSION_STALE'));
    const sawBust = step3.some(l => l.includes('§TOUR_CACHE_BUST') && /removed=[1-9]/.test(l));
    console.log('STEP3(non-fly ensureRooms): §NEEDLE_VERSION_STALE=' + sawStale + ' §TOUR_CACHE_BUST(removed>0)=' + sawBust);
    if (!sawStale || !sawBust) console.log('  step3 log tail:\n  ' + step3.join('\n  '));

    // Step 4: Fly again — must MISS (rebuild), not replay the now-stale-rooms cached route.
    mark = logs.length;
    await page.evaluate(() => { window.toggleFlyAround(); });
    await page.waitForFunction(() => window.APP.walkMode === true, { timeout: 300000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));
    const step4 = logs.slice(mark);
    const step4Hit = step4.some(l => l.includes('§TOUR_CACHE hit'));
    const step4Store = step4.some(l => l.includes('§TOUR_CACHE store'));
    console.log('STEP4(fly-after-bust): hit=' + step4Hit + ' store=' + step4Store);

    pass = step1Store && sawStale && sawBust && !step4Hit && step4Store;
    console.log(pass ? 'PASS — non-Fly recompile busted the persisted route cache; next Fly press rebuilt fresh'
                      : 'FAIL — step1Store=' + step1Store + ' sawStale=' + sawStale + ' sawBust=' + sawBust +
                        ' step4Hit=' + step4Hit + ' step4Store=' + step4Store);
    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('PAGE ERRORS:\n' + errs.join('\n')); pass = false; }
  } catch (e) {
    console.log('CRASH: ' + (e.stack || e.message));
    console.log('last 40 page-log lines:\n' + logs.slice(-40).join('\n'));
    pass = false;
  } finally {
    try { await page.close(); } catch (e) {}
    await browser.close();
  }
  process.exit(pass ? 0 : 1);
})();
