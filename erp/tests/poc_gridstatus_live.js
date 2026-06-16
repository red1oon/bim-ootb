// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for USER_JOURNEY_LANE punch-list #2 (DocStatus status-at-a-glance chip).
//   Proves the LIVE idempiere.html Sales Order GRID and mobile CARDS render a coloured DocStatus chip
//   (dot = KanbanLens.statusColor, label = DOCSTATUS_LABEL) so status reads at a glance without opening a record.
//   §-log first — READ tests/poc_gridstatus_live.log before any conclusion.
// Run:  node tests/poc_gridstatus_live.js   (cwd = erp)
'use strict';
const os = require('os');
const { chromium } = require(process.env.PW || (os.homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html'; fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); }); });

async function openSalesOrderGrid(page, port, mobile) {
  await page.goto(`http://localhost:${port}/idempiere.html?client=garden`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  // ?client=garden may still show a user pick — log in as GardenAdmin if present.
  const ga = page.locator('text="GardenAdmin"').first();
  if (await ga.count() && await ga.isVisible().catch(() => false)) { await ga.click(); await page.waitForTimeout(1200);
    const li = page.locator('text="Log In ›"').first(); if (await li.count()) await li.click().catch(() => {}); await page.waitForTimeout(2500); }
  const top = page.locator('input[placeholder*="Search menu" i]').first();
  if (await top.count() && await top.isVisible().catch(() => false)) { await top.click(); await top.fill('Sales Order'); await page.waitForTimeout(1200);
    await page.locator('text=/Sales Order$/i').first().click().catch(() => {}); await page.waitForTimeout(2500); }
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  let pass = 0, fail = 0; const errs = [];
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };
  const browser = await chromium.launch();

  // DESKTOP grid
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  page.on('pageerror', e => errs.push(e.message));
  await openSalesOrderGrid(page, port, false);
  await page.screenshot({ path: path.join(__dirname, 'gridstatus_desktop.png') });

  const grid = await page.evaluate(() => {
    const headers = [...document.querySelectorAll('.idmp-grid thead th')].map(t => t.innerText.trim());
    const chips = [...document.querySelectorAll('.idmp-grid tbody .idmp-stchip')].map(c => ({
      label: c.innerText.trim(), dot: (() => { const d = c.querySelector('.dot'); return d ? getComputedStyle(d).backgroundColor : ''; })()
    }));
    return { headers, chips };
  });
  console.log('   grid headers: ' + JSON.stringify(grid.headers));
  console.log('   grid chips: ' + JSON.stringify(grid.chips));
  ok('grid has a Status column (DocStatus surfaced even though not in the first display fields)', grid.headers.includes('Status'));
  ok('grid renders ≥1 DocStatus chip', grid.chips.length >= 1, 'count=' + grid.chips.length);
  ok('chips show human labels (Completed/Drafted/…), not raw codes (CO/DR)', grid.chips.length > 0 && grid.chips.every(c => !/^[A-Z]{2}$/.test(c.label)), JSON.stringify(grid.chips.map(c => c.label)));
  ok('a Completed chip is green (rgb(39,192,138))', grid.chips.some(c => c.label === 'Completed' && c.dot === 'rgb(39, 192, 138)'), JSON.stringify(grid.chips.filter(c => c.label === 'Completed')));

  // MOBILE cards — the .idmp-cards DOM is built by buildGrid regardless of viewport (CSS hides it on desktop,
  // shows it ≤760px). Assert the chip is in the card header DOM (the same render the mobile skin displays).
  const cardChips = await page.evaluate(() => [...document.querySelectorAll('.idmp-cards .acc .hd .idmp-stchip')].map(c => c.innerText.trim()));
  console.log('   card-skin chips: ' + JSON.stringify(cardChips));
  ok('mobile card skin renders the DocStatus chip in the header', cardChips.length >= 1, 'count=' + cardChips.length);
  // Confirm the card skin actually shows at a 390px viewport (CSS toggle), with the chip visible.
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'gridstatus_mobile.png') });
  const mobileChipVisible = await page.evaluate(() => { const c = document.querySelector('.idmp-cards .acc .hd .idmp-stchip'); if (!c) return false; const r = c.getBoundingClientRect(); return r.width > 1 && r.height > 1; });
  ok('chip visible in the mobile card skin at 390px', mobileChipVisible);

  ok('0 pageerrors', errs.length === 0, errs.slice(0, 5).join(' | '));

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' W-GRIDSTATUS-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); server.close(); process.exit(1); });
