// WITNESS — §BBOX_GHOST_STUCK_RESET + §BBOX_GHOST_RAYCAST_FILTER (2026-07-20 user report).
// ISSUE IT PROVES/DISPROVES: "when it accidentally turned to bbxes mode, during rendering it does
// not check back to solid" (the merged-ghost bbox shell auto-enabled by _drillSelect() on a large
// building's Storey/Discipline drill was never reset by _setTreeMode() when leaving that axis), and
// the downstream consequence "the orbit still goes to attic" (Cinema Orbit's BVH fan and the
// staffage clearance fan could raycast against the coarse ghost boxes instead of real geometry
// while stuck in that state).
//   PASS =
//   (a) forcing the exact lens-owned-ghost precondition _drillSelect() creates, then switching axis
//       via _setTreeMode(), leaves BOTH _mgLensOwned=false AND the ghost group invisible — the
//       "does not check back to solid" defect, negated.
//   (b) NEGATIVE: with the ghost forced visible and solids hidden (the real bug precondition),
//       _cinemaFanMeshesDebug()/A._solidMeshes() contain ZERO ghost meshes.
//   (c) POSITIVE, in a FRESH page (see note below): with the ghost visible ALONGSIDE real solids,
//       the real solids all SURVIVE the filter and the ghost is still excluded — proves the filter
//       excludes ONLY ghost geometry, not real geometry too (an over-broad filter would silently
//       zero everything and (b) alone would not catch that).
// NOTE: (b) and (c) each get their OWN fresh page/building session. _cinemaFanMeshes() caches its
// result per A.activeBuilding (pre-existing behavior, unrelated to this fix) — calling it once with
// solids hidden then again after restoring them, in the SAME session, returns the first (stale)
// answer instead of re-scanning. That is a real, separate caching characteristic worth knowing about
// but is not what's being tested here, so each case gets an uncontaminated cache.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8399;
// Duplex, not Terminal: the positive case needs REAL solid geometry to have finished streaming
// (Terminal's 63k elements never fully stream in headless SwiftShader within any reasonable test
// budget — confirmed this session, its "solids" at any wait are actually bbox placeholders, which
// this fix correctly excludes too, but that makes Terminal useless for proving the POSITIVE case:
// real geometry surviving the filter). Duplex fully streams (~1119 elements) well within the wait.
const BLD = process.env.BLD || 'Duplex';

async function openBuilding(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.cinemaPathPlan, { timeout: 90000 });
  await page.waitForFunction(() => {
    const A = window.APP;
    try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 90000, polling: 2000 });
  await new Promise(r => setTimeout(r, 45000));  // let real geometry (not just placeholders) fully stream
  return { page, logs };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 300000,
  });
  let allPass = true;
  console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);

  // ── (a) the reset itself + (b) NEGATIVE raycast case — one page, ghost stays lens-owned+visible ──
  {
    const { page, logs } = await openBuilding(browser);
    const before1 = logs.length;
    const out1 = await page.evaluate(async () => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (!A._debugForceGhostLensOwned || !A._setTreeMode || !A._debugGhostLensOwned) return { err: 'debug hooks missing' };
      const forced = A._debugForceGhostLensOwned();
      const stateBefore = A._debugGhostLensOwned();
      A._setTreeMode('phase');   // switch to a DIFFERENT axis — this is where the reset must fire
      const stateAfter = A._debugGhostLensOwned();
      return { forced, stateBefore, stateAfter };
    });
    const tail1 = logs.slice(before1);
    console.log('  (a) forced precondition: ' + JSON.stringify(out1.forced));
    console.log('  (a) state before axis switch: ' + JSON.stringify(out1.stateBefore));
    console.log('  (a) state after axis switch:  ' + JSON.stringify(out1.stateAfter));
    tail1.filter(l => l.includes('BBOX_GHOST') || l.includes('GHOST_XRAY')).forEach(l => console.log('    | ' + l));
    const checksA = [
      ['debug hooks present (no err)', !out1.err],
      ['ghost successfully built+shown as lens-owned', out1.forced && out1.forced.built && out1.forced.mgLensOwned && out1.forced.ghostVisible],
      ['precondition confirmed: lens-owned+visible BEFORE axis switch', out1.stateBefore && out1.stateBefore.mgLensOwned && out1.stateBefore.ghostVisible],
      ['mgLensOwned=false AFTER switching axis (the fix)', out1.stateAfter && out1.stateAfter.mgLensOwned === false],
      ['ghost invisible AFTER switching axis (the fix)', out1.stateAfter && out1.stateAfter.ghostVisible === false],
    ];
    checksA.forEach(([label, ok]) => { console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });

    const outNeg = await page.evaluate(() => {
      const A = window.APP;
      if (!A._debugForceGhostLensOwned || !A._cinemaFanMeshesDebug || !A._solidMeshes) return { err: 'debug hooks missing' };
      const forced = A._debugForceGhostLensOwned();   // re-force: axis switch above turned it off
      const fanMeshes = A._cinemaFanMeshesDebug();     // FIRST and only fan call this session
      const solidMeshes = A._solidMeshes();
      const isGhost = (o) => !!(o.userData && o.userData.isBboxPlaceholder) ||
        !!(o.parent && o.parent.userData && o.parent.userData._mergedGhost);
      return { forced, fanGhostCount: fanMeshes.filter(isGhost).length, solidGhostCount: solidMeshes.filter(isGhost).length };
    });
    console.log('  (b) NEGATIVE case (ghost visible, solids hidden): ' + JSON.stringify(outNeg));
    const checksNeg = [
      ['debug hooks present (no err)', !outNeg.err],
      ['ghost is visible for this check', outNeg.forced && outNeg.forced.ghostVisible],
      ['ghost excluded when solids hidden (fan)', outNeg.fanGhostCount === 0],
      ['ghost excluded when solids hidden (solidMeshes)', outNeg.solidGhostCount === 0],
    ];
    checksNeg.forEach(([label, ok]) => { console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('  PAGEERRORS: ' + errs.join(' | ')); allPass = false; }
    await page.close();
  }

  // ── (c) POSITIVE raycast case — a FRESH page/building session, uncontaminated fan cache ──
  {
    const { page, logs } = await openBuilding(browser);
    const outPos = await page.evaluate(async () => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (!A._debugForceGhostLensOwned || !A._cinemaFanMeshesDebug || !A._solidMeshes) return { err: 'debug hooks missing' };
      const solidsBaseline = A._solidMeshes().length;   // BEFORE any ghost exists — the true real-geometry count
      const forced = A._debugForceGhostLensOwned();     // builds+shows ghost, hides solids via filterByGuids
      if (A.filterByGuids) A.filterByGuids(null);       // restore real solids' visibility, ghost STAYS visible
      const fanMeshes = A._cinemaFanMeshesDebug();       // FIRST and only fan call this session — sees BOTH
      const solidMeshes = A._solidMeshes();
      const isGhost = (o) => !!(o.userData && o.userData.isBboxPlaceholder) ||
        !!(o.parent && o.parent.userData && o.parent.userData._mergedGhost);
      return {
        solidsBaseline, forced,
        fanTotal: fanMeshes.length, fanGhostCount: fanMeshes.filter(isGhost).length,
        solidTotal: solidMeshes.length, solidGhostCount: solidMeshes.filter(isGhost).length,
      };
    });
    console.log('  (c) POSITIVE case (ghost visible ALONGSIDE real solids): ' + JSON.stringify(outPos));
    const checksPos = [
      ['debug hooks present (no err)', !outPos.err],
      ['ghost is visible for this check', outPos.forced && outPos.forced.ghostVisible],
      ['real solids from baseline SURVIVE the filter alongside the ghost (fan)',
        outPos.solidsBaseline > 0 && outPos.fanTotal === outPos.solidsBaseline],
      ['real solids from baseline SURVIVE the filter alongside the ghost (solidMeshes)',
        outPos.solidsBaseline > 0 && outPos.solidTotal === outPos.solidsBaseline],
      ['ghost still ZERO among the survivors (fan)', outPos.fanGhostCount === 0],
      ['ghost still ZERO among the survivors (solidMeshes)', outPos.solidGhostCount === 0],
    ];
    checksPos.forEach(([label, ok]) => { console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('  PAGEERRORS: ' + errs.join(' | ')); allPass = false; }
    await page.close();
  }

  console.log(`\n${'='.repeat(78)}\nVERDICT: ${allPass ? 'PASS — ghost resets on axis switch, raycasts never see ghost geometry' : 'FAIL'}\n`);
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();
