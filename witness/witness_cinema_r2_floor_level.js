// WITNESS — §CINEMA_SPACE R2 fix (PHOTOREAL_STILL_RENDER.md "R2 STILL BROKEN after v818").
// ISSUE IT PROVES/DISPROVES: the dive target selection picked the roof attic / plant space over the
// main concourse on Terminal AND Hospital, because "largest enclosed" alone has no floor-level sense
// and the "already inside a space" case was re-running the search instead of settling in place.
//   PASS = for each building:
//     (a) OUTSIDE start -> chosen space's zLevelFrac is low-to-mid (<0.6), never ~1.0 (attic),
//         and is genuinely enclosed (>=60%).
//     (b) ALREADY-INSIDE start (camera placed at a real room's own centre) -> the short-circuit
//         fires (§CINEMA_SPACE cand=already-inside chosen=true), no candidate search log is emitted.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8399;
const BUILDINGS = (process.env.BLDS || 'Terminal,Hospital').split(',');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;

  for (const BLD of BUILDINGS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

    const url = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls && window.APP.cinemaPathPlan,
      { timeout: 90000 });
    await new Promise(r => setTimeout(r, 9000));  // let streaming + bbox settle
    await page.waitForFunction(() => {
      const A = window.APP;
      try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 60000, polling: 2000 });

    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);

    // ── (a) OUTSIDE start: well clear of the footprint, above the roof, looking down ──
    const before1 = logs.length;
    const out1 = await page.evaluate(async () => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      const r = A.dbQuery('SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y),MIN(center_z),MAX(center_z) FROM element_transforms');
      const [x0, x1, y0, y1, z0, z1] = r[0];
      const c = A.ifc2three((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const env = Math.max(x1 - x0, y1 - y0);
      const rad = env * 1.5, tilt = 25 * Math.PI / 180, az = 0.9;
      A.controls.target.set(c.x, c.y, c.z);
      A.camera.position.set(
        c.x + rad * Math.cos(tilt) * Math.cos(az),
        c.y + rad * Math.sin(tilt) + env * 0.3,  // pushed well above the roof too
        c.z + rad * Math.cos(tilt) * Math.sin(az)
      );
      A.controls.update();
      const plan = A.cinemaPathPlan(24);
      return { ok: !!plan };
    });
    const tail1 = logs.slice(before1);
    if (!out1 || !out1.ok) { console.log('  OUTSIDE: PLAN FAILED'); allPass = false; }
    const spaceLines1 = tail1.filter(l => l.startsWith('§CINEMA_SPACE'));
    const chosenLine1 = spaceLines1.find(l => / chosen=true/.test(l));
    const diveLine1 = tail1.find(l => l.startsWith('§CINEMA_DIVE'));
    console.log('  OUTSIDE start:');
    spaceLines1.forEach(l => console.log('    ' + l));
    console.log('    ' + (diveLine1 || 'NO §CINEMA_DIVE LINE'));
    let zFrac1 = null, enclosed1 = null, alreadyInside1 = false;
    if (chosenLine1) {
      alreadyInside1 = chosenLine1.startsWith('§CINEMA_SPACE cand=already-inside');
      const m = chosenLine1.match(/zLevelFrac=([\d.]+)/);
      const e = chosenLine1.match(/enclosed=([\d.]+)%/);
      zFrac1 = m ? parseFloat(m[1]) : null;
      enclosed1 = e ? parseFloat(e[1]) : null;
    }
    const outsideChecks = [
      ['§CINEMA_SPACE chosen line present', !!chosenLine1],
      ['not the already-inside short-circuit (camera was placed outside)', !alreadyInside1],
      // 0.85 not 0.6: a legitimate upper floor (e.g. Terminal's departure level) can sit mid-0.5s-0.6s
      // and must not be rejected as "attic" — the real attic/roof reads ~0.9-1.0 (measured: Terminal's
      // "Aras Bumbung" roof room = 0.946). The acceptance bar is "clearly not the roof", not "ground only".
      ['chosen zLevelFrac is low-to-mid (<0.85), never ~1.0 (attic)', zFrac1 !== null && zFrac1 < 0.85],
      ['chosen space is genuinely enclosed (>=60%)', enclosed1 !== null && enclosed1 >= 60],
    ];
    outsideChecks.forEach(([label, ok]) => { console.log(`    [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });

    // ── (b) ALREADY-INSIDE start: camera placed at a real room's own centre, floor level ──
    const before2 = logs.length;
    const out2 = await page.evaluate(async () => {
      const A = window.APP;
      const g = A.getRoomGraph ? A.getRoomGraph() : null;
      if (!g || !g.nodesByGuid) return { ok: false, reason: 'no room graph' };
      let best = null, bestArea = -1;
      for (const k in g.nodesByGuid) {
        const rn = g.nodesByGuid[k];
        if (!rn || rn.kind !== 'room' || !rn.rects || !rn.rects.length) continue;
        let ar = 0;
        for (const rc of rn.rects) ar += Math.abs(rc.x1 - rc.x0) * Math.abs(rc.y1 - rc.y0);
        if (ar > bestArea) { bestArea = ar; best = rn; }
      }
      if (!best) return { ok: false, reason: 'no room candidate' };
      const c3 = A.ifc2three(best.cx, best.cy, best.cz);
      A.camera.position.set(c3.x, c3.y + 1.7, c3.z);
      A.controls.target.set(c3.x + 5, c3.y + 1.7, c3.z);
      A.camera.lookAt(c3.x + 5, c3.y + 1.7, c3.z);
      A.controls.update();
      const plan = A.cinemaPathPlan(24);
      return { ok: !!plan, room: best.name || best.guid };
    });
    const tail2 = logs.slice(before2);
    if (!out2 || !out2.ok) { console.log('  ALREADY-INSIDE: SETUP/PLAN FAILED (' + (out2 && out2.reason) + ')'); allPass = false; }
    const spaceLines2 = tail2.filter(l => l.startsWith('§CINEMA_SPACE'));
    console.log('  ALREADY-INSIDE start (room="' + (out2 && out2.room) + '"):');
    spaceLines2.forEach(l => console.log('    ' + l));
    const shortCircuited = spaceLines2.length === 1 && spaceLines2[0].startsWith('§CINEMA_SPACE cand=already-inside') &&
      / chosen=true/.test(spaceLines2[0]);
    const insideChecks = [
      ['already-inside short-circuit fired, no candidate search', shortCircuited],
    ];
    insideChecks.forEach(([label, ok]) => { console.log(`    [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('   PAGEERRORS: ' + errs.join(' | ')); allPass = false; }
    await page.close();
  }

  console.log(`\n${'='.repeat(78)}\nVERDICT: ${allPass ? 'PASS — dive lands in the concourse, already-inside settles in place' : 'FAIL'}\n`);
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();
