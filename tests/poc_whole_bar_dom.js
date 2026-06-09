// poc_whole_bar_dom.js — DOM smoke (Playwright, WIRING check) for W2: proves the SHARED
// common/whole_history.js actually renders in a real browser — launcher mounts, panel opens, the
// aggregate rows render (page-tagged), the WHOLE|THIS toggle filters, and clicking a FOREIGN row
// writes the read-only restore handoff to localStorage. Logic is already proven in poc_whole_bar.js;
// this is the render-path wiring witness. Run: node tests/poc_whole_bar_dom.js
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8166;
const { spawn } = require('child_process');

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: require('path').join(__dirname, '..') });
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  let pass = false;
  try {
    const page = await browser.newPage();
    const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('PAGEERR: ' + e.message));
    await page.goto('http://localhost:' + PORT + '/tests/_blank.html', { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ url: '/common/whole_history.js' });
    const r = await page.evaluate(() => {
      const WH = window.WholeHistory;
      WH.clear();
      [ { page: 'gravity', ts: 4000, label: 'lens · $', kind: 'view', ref: { lens: 'aging' } },
        { page: 'viewer', ts: 1000, label: 'Opened Duplex', kind: 'op', ref: { building: 'Duplex' } },
        { page: 'idempiere', ts: 3000, label: 'Sales Order 1023', kind: 'nav', ref: { window: 143, recordId: 1023 } },
        { page: 'glassbowl', ts: 2000, label: 'orbit', kind: 'view', ref: { yaw: 0.4 } }
      ].forEach(e => WH.record(e));
      WH.mount({ page: 'idempiere', rootPrefix: '../' });
      const launch = !!document.getElementById('whole-hist-launch');
      WH.setMode('whole'); WH.open();
      const panelShown = document.getElementById('whole-hist-panel').classList.contains('show');
      const rowsWhole = document.querySelectorAll('#whole-hist-body .whole-row').length;
      // a foreign row (glassbowl) — find it by its badge text
      const rows = Array.prototype.slice.call(document.querySelectorAll('#whole-hist-body .whole-row'));
      const gRow = rows.find(r => /Glassbowl/.test(r.textContent));
      // stub navigation so the click doesn't actually leave the page
      try { Object.defineProperty(window, 'location', { value: { href: '' }, writable: true }); } catch (e) {}
      gRow && gRow.click();
      const handoff = JSON.parse(localStorage.getItem('bim.wholeRestore') || 'null');
      // THIS-page filter
      WH.setMode('this');
      const rowsThis = document.querySelectorAll('#whole-hist-body .whole-row').length;
      return { launch, panelShown, rowsWhole, rowsThis, handoff };
    });
    console.log('DOM result: ' + JSON.stringify(r));
    pass = r.launch && r.panelShown && r.rowsWhole === 4 && r.rowsThis === 1 &&
      r.handoff && r.handoff.page === 'glassbowl' && r.handoff.ref && r.handoff.ref.yaw === 0.4;
    console.log('§WHOLE-BAR-DOM launcher=' + r.launch + ' panel=' + r.panelShown + ' rowsWhole=' + r.rowsWhole +
      ' rowsThis=' + r.rowsThis + ' foreignHandoff=' + (r.handoff && r.handoff.page === 'glassbowl' ? 'ok' : 'FAIL') +
      ' => ' + (pass ? 'PASS' : 'FAIL'));
    const errs = logs.filter(l => l.startsWith('PAGEERR'));
    if (errs.length) console.log('PAGEERRORS:\n' + errs.join('\n'));
  } finally { await browser.close(); try { srv.kill(); } catch (e) {} }
  if (!pass) process.exit(1);
})();
