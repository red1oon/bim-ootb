// poc_whole_time_dom.js — DOM smoke (Playwright, WIRING) for W3: the time scroller renders in a real
// browser — a day axis with one marker per populated day, a working ‹day back control that jumps the
// selection a DAY back, and a STRETCH strip that is horizontally SCROLLABLE (overflow-x:auto, scrollWidth
// > clientWidth when crowded). Logic proven in poc_whole_time.js; this is the render-path witness.
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8167;
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: path.join(__dirname, '..') });
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  let pass = false;
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 420, height: 720 });
    const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('PAGEERR: ' + e.message));
    await page.goto('http://localhost:' + PORT + '/tests/_blank.html', { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ url: '/common/whole_history.js' });
    const r = await page.evaluate(() => {
      const WH = window.WholeHistory; WH.clear();
      const DAY = 86400000, BASE = 1700000000000, NOON = 12 * 3600000;
      const seed = [];
      // day A: 6 entries (to overflow the strip horizontally) · day B: 1 · day C: 1
      for (let i = 0; i < 6; i++) seed.push({ page: ['viewer', 'glassbowl', 'gravity', 'idempiere'][i % 4], ts: BASE + NOON + i * 1000, label: 'moment ' + i + ' xxxxxxxxxx', kind: 'view', ref: { i } });
      seed.push({ page: 'idempiere', ts: BASE + DAY + NOON, label: 'Order 1023', kind: 'nav', ref: { recordId: 1023 } });
      seed.push({ page: 'gravity', ts: BASE + 2 * DAY + NOON, label: 'lens', kind: 'view', ref: {} });
      seed.forEach(e => WH.record(e));
      WH.mount({ page: 'idempiere', rootPrefix: '../' });
      WH.setMode('whole'); WH.open();
      const dayBtns = document.querySelectorAll('#whole-hist-body .whole-daybtn').length;
      const selBefore = (document.querySelector('.whole-daybtn.on') || {}).textContent;
      // tap the ‹day back control → selection should jump one day earlier
      const back = document.querySelector('.whole-dayback');
      back.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      back.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      const selAfter = (document.querySelector('.whole-daybtn.on') || {}).textContent;
      // after stepping back from day C we are on day B (1 chip); step back again → day A (6 chips, overflowing)
      back.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      back.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      const strip = document.getElementById('whole-stretch');
      const chips = strip.querySelectorAll('.whole-chip').length;
      const overflowX = getComputedStyle(strip).overflowX;
      const scrollable = strip.scrollWidth > strip.clientWidth;
      return { dayBtns, selBefore, selAfter, chips, overflowX, scrollable };
    });
    console.log('DOM W3: ' + JSON.stringify(r));
    pass = r.dayBtns === 3 && r.selBefore !== r.selAfter && r.chips === 6 &&
      r.overflowX === 'auto' && r.scrollable === true;
    console.log('§WHOLE-TIME-DOM dayBtns=' + r.dayBtns + ' dayJumped=' + (r.selBefore !== r.selAfter ? 'Y' : 'N') +
      ' stretchChips=' + r.chips + ' overflowX=' + r.overflowX + ' scrollable=' + r.scrollable +
      ' => ' + (pass ? 'PASS' : 'FAIL'));
    const errs = logs.filter(l => l.startsWith('PAGEERR')); if (errs.length) console.log('PAGEERRORS:\n' + errs.join('\n'));
  } finally { await browser.close(); try { srv.kill(); } catch (e) {} }
  if (!pass) process.exit(1);
})();
