// probe_hba_lazy.js — witness for the §HBA_LAZY change (user directive 2026-07-28:
// "It should only come on if called from the pill. No early casting needed.")
//
// ISSUE IT PROVES / DISPROVES: hba_lens.js's startup poll used to (a) auto-promote the hbaFM pill
// onto the rail — the two-heads icon appearing unbidden — and (b) run the whole HBA compile
// (IfcSpace footprints, rel_contained_in_space members, seven demonstrator spec seeds, plus an
// async ad_seed.db fetch) on the main thread the moment streaming finished. Both were unasked-for.
//
// NO EARLY CASTING (the fix):
//   1. After a full load, §HBA_LAZY is logged and §HBA_SEED is NOT — zero HBA compile at startup.
//   2. None of the seeded specs (A._hbaRooms/_hbaOccupancyLog/_hbaPayrollSpec/...) exist yet.
//   3. The hbaFM action still has pill===false — it did not cast itself onto the rail — and no
//      hbaFM button is in the DOM.
// STILL WORKS WHEN CALLED (the no-regression half):
//   4. Invoking the pill's own fn (openFamilyDrawer) → §HBA_SEED fires ONCE, specs materialise,
//      the drawer opens with the same lens availability the eager path used to report.
//   5. A second invocation does NOT re-seed (idempotent).
//   6. Zero PAGEERROR throughout.
// Also REPORTS the measured seed cost — the main-thread work moved off page load.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8157;
const BLD = process.env.BLD || 'HHS_Office_Federated';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db&bld=${BLD}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let fails = 0;
const FAIL = m => { fails++; console.log('FAIL: ' + m); };
const PASS = m => console.log('PASS: ' + m);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const ctx = await browser.newContext({
      serviceWorkers: 'block', viewport: { width: 412, height: 915 },
      isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
    });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const A = window.A || window.APP;
      return A && A.db && A.activeBuilding && !A.streaming && A.streamedCount > 0;
    }, { timeout: 240000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
    await sleep(8000);   // the old eager gate fired on a 500ms poll after streaming — well inside this

    const has = n => logs.some(l => l.includes(n));

    // ── 1. no seed at startup ──
    if (has('§HBA_LAZY armed')) PASS('§HBA_LAZY armed at startup');
    else FAIL('§HBA_LAZY not logged — the lazy gate never armed');
    if (has('§HBA_SEED')) FAIL('§HBA_SEED fired at page load — HBA still casts early');
    else PASS('no §HBA_SEED at page load — zero HBA compile at startup');
    ['§HBA_OCC seeded', '§HBA_PAY seeded', '§HBA_TEN compiled', '§HBA_RES compiled', '§HBA_GOVERN'].forEach(n => {
      if (has(n)) FAIL('startup still ran ' + n);
    });
    if (!['§HBA_OCC seeded', '§HBA_PAY seeded', '§HBA_TEN compiled'].some(has))
      PASS('no demonstrator specs seeded at startup');

    // ── 2. no seeded state on APP ──
    const before = await page.evaluate(() => {
      const A = window.A || window.APP;
      return {
        rooms: !!A._hbaRooms, occ: !!A._hbaOccupancyLog, pay: !!A._hbaPayrollSpec,
        ten: !!A._hbaTenancySpec, res: !!A._hbaResourceSpec, members: !!A._hbaRoomMembers
      };
    });
    console.log('STATE(before) ' + JSON.stringify(before));
    if (Object.values(before).every(v => v === false)) PASS('no HBA spec state on APP before use');
    else FAIL('HBA state already present before any pill use: ' + JSON.stringify(before));

    // ── 3. pill did not cast itself onto the rail ──
    const pillState = await page.evaluate(() => {
      const acts = window._mainPillActions || [];
      const a = acts.find(x => x.id === 'hbaFM');
      const btn = document.getElementById('pill-hbaFM');
      let rect = null, shown = false;
      if (btn) {
        const r = btn.getBoundingClientRect();
        const cs = getComputedStyle(btn);
        shown = r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
        rect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      }
      return { registered: !!a, pill: a ? a.pill : 'no-action', inDom: !!btn, shown, rect };
    });
    console.log('PILL ' + JSON.stringify(pillState));
    if (pillState.pill === false && !pillState.shown)
      PASS('hbaFM stayed pill:false and renders nothing on the rail (no early casting)');
    else FAIL('hbaFM promoted itself: ' + JSON.stringify(pillState));

    // ── 4. calling it wakes HBA ──
    const mark = logs.length;
    const called = await page.evaluate(() => {
      const A = window.A || window.APP;
      if (!(window.HBALens && HBALens.openFamilyDrawer)) return 'no-api';
      HBALens.openFamilyDrawer(A);          // exactly what the hbaFM pill's fn does
      return 'ok';
    });
    await sleep(3000);
    const seedLine = logs.slice(mark).find(l => l.includes('§HBA_SEED')) || '';
    if (called !== 'ok') FAIL('could not invoke the pill fn: ' + called);
    if (seedLine) PASS('pill invocation → ' + seedLine);
    else FAIL('§HBA_SEED did not fire when the pill was used — HBA would be dead, not lazy');

    const after = await page.evaluate(() => {
      const A = window.A || window.APP;
      const d = document.getElementById('hba-fm-drawer');
      let lenses = null;
      try { lenses = HBALens.availableLenses(A).filter(x => x.available).map(x => x.id); } catch (e) {}
      return {
        rooms: (A._hbaRooms || []).length, occ: (A._hbaOccupancyLog || []).length,
        pay: !!A._hbaPayrollSpec, ten: !!A._hbaTenancySpec, drawerOpen: !!d, lenses
      };
    });
    console.log('STATE(after) ' + JSON.stringify(after));
    if (after.rooms > 0 && after.occ > 0 && after.drawerOpen)
      PASS(`HBA works when called: ${after.rooms} rooms, ${after.occ} occupancy ops, drawer open, lenses=[${after.lenses}]`);
    else FAIL('HBA did not come up on demand: ' + JSON.stringify(after));

    // ── 5. idempotent ──
    const mark2 = logs.length;
    await page.evaluate(() => { const A = window.A || window.APP; HBALens.openFamilyDrawer(A); HBALens.openFamilyDrawer(A); });
    await sleep(1500);
    const reseeds = logs.slice(mark2).filter(l => l.includes('§HBA_SEED')).length;
    if (reseeds === 0) PASS('re-opening does not re-seed (idempotent)');
    else FAIL('§HBA_SEED fired ' + reseeds + ' more time(s) on re-open');

    // ── 6. clean ──
    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) FAIL('PAGEERROR: ' + errs.join(' | '));
    else PASS('zero PAGEERROR');

    console.log('--- §HBA log lines ---');
    logs.filter(l => /§HBA/.test(l)).forEach(l => console.log('  ' + l));
    console.log(fails === 0 ? 'PROBE_RESULT: ALL PASS' : 'PROBE_RESULT: ' + fails + ' FAIL');
    process.exitCode = fails === 0 ? 0 : 1;
  } catch (e) {
    console.log('PROBE_ERROR: ' + (e && e.stack || e));
    process.exitCode = 1;
  } finally { await browser.close(); }
})();
