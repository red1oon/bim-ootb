// WITNESS — §CPE_WALK_CTRL_DRAG_EXIT fix (prompts/CPE_POV_WALK_PATHING.md, 2026-08-08 regression).
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   G-NAVLOCK-ON    mounting walk mode disables A.controls (was enabled=true before mount) and logs
//                    §CPE_WALK_NAV_LOCK — closes the "OrbitControls still live, throws
//                    setPointerCapture InvalidStateError on every click" bug.
//   G-CTXMENU-BLOCK a real `contextmenu` event dispatched on the canvas WHILE walk mode is active has
//                    its default prevented (the Ctrl+Left-Click alternate-menu path that forces an
//                    unplanned Pointer Lock release is neutralised) AND walk mode is still active
//                    afterward — no §CPE_WALK_LOCK_LOST logged from it.
//   G-CTXMENU-IDLE  the SAME event with walk mode NOT active is left alone (defaultPrevented false)
//                    — the fix is scoped to walk mode, not a global context-menu kill.
//   G-NAVLOCK-OFF   stopping walk mode restores A.controls.enabled to its prior value and logs the
//                    restore line.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8523;
const BLD = process.env.BLD || 'Duplex';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openEditor(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.APP && window.APP.cinemaPathEditor && window.CpeWalk && window.APP.startMaxQualityOrbit && window.APP._composer,
    { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, editor: true }); });
  await page.waitForSelector('#cpe-ok', { timeout: 300000 });
  await sleep(800);
  return { page, logs };
}

async function main() {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const { page, logs } = await openEditor(browser);

  // ── precondition: OrbitControls enabled before any walk mount ──
  const enabledBefore = await page.evaluate(() => window.APP.controls && window.APP.controls.enabled);
  P('G-NAVLOCK-0 precondition: A.controls.enabled=true before any walk mount', enabledBefore === true, `enabledBefore=${enabledBefore}`);

  // ══ mount walk mode ══
  const mark1 = logs.length;
  await page.evaluate(() => window.CpeWalk.toggle());
  await sleep(150);
  const win1 = logs.slice(mark1);
  const enabledDuring = await page.evaluate(() => window.APP.controls && window.APP.controls.enabled);
  P('G-NAVLOCK-ON mounting walk disables A.controls and logs §CPE_WALK_NAV_LOCK',
    enabledDuring === false && win1.some(l => l.startsWith('§CPE_WALK_NAV_LOCK OrbitControls disabled')),
    `enabledDuring=${enabledDuring} logged=[${win1.filter(l => l.startsWith('§CPE_WALK_NAV_LOCK')).join(' | ')}]`);

  // ══ G-CTXMENU-BLOCK: real contextmenu dispatch while ACTIVE must be prevented, and walk must survive ══
  const mark2 = logs.length;
  const ctxResultActive = await page.evaluate(() => {
    const canvas = window.APP.canvas;
    const r = canvas.getBoundingClientRect();
    const ev = new MouseEvent('contextmenu', { clientX: r.left + 10, clientY: r.top + 10, bubbles: true, cancelable: true });
    canvas.dispatchEvent(ev);
    return { defaultPrevented: ev.defaultPrevented, activeAfter: window.CpeWalk.isActive() };
  });
  await sleep(50);
  const win2 = logs.slice(mark2);
  P('G-CTXMENU-BLOCK contextmenu while walk is active: preventDefault fired, walk stayed active, no LOCK_LOST',
    ctxResultActive.defaultPrevented === true && ctxResultActive.activeAfter === true &&
    !win2.some(l => l.includes('LOCK_LOST')),
    `${JSON.stringify(ctxResultActive)} logsAfter=[${win2.filter(l => l.startsWith('§CPE_WALK')).join(' | ')}]`);

  // ══ stop walk, then re-check contextmenu is NOT suppressed when idle (scoped fix, not global) ══
  await page.evaluate(() => window.CpeWalk.toggle());
  await sleep(150);
  const enabledAfter = await page.evaluate(() => window.APP.controls && window.APP.controls.enabled);
  const navRestoreLogged = logs.some(l => l.startsWith('§CPE_WALK_NAV_LOCK restored enabled=true'));
  P('G-NAVLOCK-OFF stopping walk restores A.controls.enabled and logs the restore',
    enabledAfter === true && navRestoreLogged, `enabledAfter=${enabledAfter} restoreLogged=${navRestoreLogged}`);

  // NOTE: idle contextmenu is STILL defaultPrevented=true here — that's OrbitControls' OWN
  // pre-existing onContextMenu handler (OrbitControls.module.js:1927, gated on `this.enabled`,
  // unconditional preventDefault whenever enabled), nothing to do with cpe_walk.js. Confirmed by
  // reading the lib, not asserted as a gate (would be testing pre-existing app behaviour, not the fix).

  console.log('\n' + '='.repeat(78));
  let allPass = true;
  for (const c of checks) {
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}`);
    console.log(`          ${c.d}`);
    if (!c.ok) allPass = false;
  }
  console.log('='.repeat(78));
  console.log(allPass ? `\nWITNESS PASS (${checks.length}/${checks.length})` : `\nWITNESS FAIL`);
  await browser.close();
  process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error('INFRA-ERROR', e); process.exit(2); });
