// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the W (world-history) long-press drawer PERPENDICULAR auto-layout.
//   The drawer must draw ACROSS the pill strip, never ALONG it — a parallel drawer COVERS the neighbour
//   pills (the regression on idempiere.html: a column drawer over a now-VERTICAL pill strip).
//   PROVES (both orientations, the real geometry — getBoundingClientRect, not a log claim):
//     W-PERP-IDMP  — idempiere.html VERTICAL strip (#idmp-pillbar flex-column) → drawer flex-direction:ROW
//                    + drawer rect does NOT intersect ANY sibling pill button rect (no cover).
//     W-PERP-GB    — glassbowl.html HORIZONTAL strip (#gb-pillbar flex-row) → drawer flex-direction:COLUMN
//                    + drawer rect does NOT intersect ANY sibling pill button rect (no cover).
//   §-log first — READ tests/poc_wdrawer_perp.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_wdrawer_perp.js 2>&1 | tee tests/poc_wdrawer_perp.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// open the drawer on a surface, return { flexDir, chips, hostVertical, overlaps, hit }
async function probe(page, { trigSel, pillSel, drawerSel, listSel }) {
  const trig = await page.$(trigSel);
  if (trig) { await trig.click(); await page.waitForTimeout(300); }   // open the collapsed ⋯ dock
  const w = await page.$(pillSel);
  if (!w) return { err: 'no W pill (' + pillSel + ')' };
  await w.dispatchEvent('pointerdown');                                // long-press → _worldDrawer
  await page.waitForTimeout(650);
  const out = await page.evaluate(({ drawerSel, listSel }) => {
    const d = document.querySelector(drawerSel);
    if (!d) return { err: 'no drawer ' + drawerSel };
    const cs = getComputedStyle(d);
    const dr = d.getBoundingClientRect();
    const list = document.querySelector(listSel);
    const lr = list ? list.getBoundingClientRect() : null;
    const hostVertical = lr ? (lr.height >= lr.width) : null;
    const pills = list ? Array.from(list.querySelectorAll('button')) : [];
    const inter = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    let overlaps = 0; const hit = [];
    pills.forEach(p => { const pr = p.getBoundingClientRect();
      if (pr.width < 2 || pr.height < 2) return;                        // skip hidden buttons
      if (inter(dr, pr)) { overlaps++; hit.push(p.id || p.className); } });
    return { flexDir: cs.flexDirection, chips: d.querySelectorAll('button').length,
      hostVertical, overlaps, hit };
  }, { drawerSel, listSel });
  await w.dispatchEvent('pointerup');
  return out;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  let allPass = true;

  // ── idempiere.html — VERTICAL strip → expect ROW, no overlap ──
  {
    let logs = [], errs = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(`http://localhost:${port}/idempiere.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const mounted = logs.some(l => l.startsWith('§IDMP-PILLS'));
    const r = await probe(page, { trigSel: '#idmp-pill-trigger', pillSel: '#pill-worldhist',
      drawerSel: '#idmp-whist-drawer', listSel: '#idmp-pill' });
    const orientLog = logs.find(l => l.includes('drawer-orient=')) || '(no orient log)';
    const pass = !r.err && mounted && r.flexDir === 'row' && r.chips === 2 &&
      r.hostVertical === true && r.overlaps === 0 && errs.length === 0;
    allPass = allPass && pass;
    console.log('§W-PERP-IDMP mounted=' + mounted + ' flexDir=' + (r.flexDir || r.err) +
      ' chips=' + r.chips + ' hostVertical=' + r.hostVertical + ' overlaps=' + r.overlaps +
      (r.hit && r.hit.length ? ' hit=[' + r.hit.join(',') + ']' : '') + ' err=' + (errs.length ? errs.join('|') : 0));
    console.log('§W-PERP-IDMP orient=' + orientLog);
    console.log('§W-PERP-IDMP-RESULT ' + (pass ? 'PASS' : 'FAIL'));
    await page.close();
  }

  // ── glassbowl.html — HORIZONTAL strip → expect COLUMN, no overlap ──
  {
    let logs = [], errs = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(`http://localhost:${port}/glassbowl.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2800);
    const mounted = logs.some(l => l.startsWith('§GB-PILLS'));
    const r = await probe(page, { trigSel: '#gb-pill-trigger', pillSel: '#pill-worldhist',
      drawerSel: '#gb-whist-drawer', listSel: '#gb-pill' });
    const orientLog = logs.find(l => l.includes('drawer-orient=')) || '(no orient log)';
    const pass = !r.err && mounted && r.flexDir === 'column' && r.chips === 2 &&
      r.hostVertical === false && r.overlaps === 0 && errs.length === 0;
    allPass = allPass && pass;
    console.log('§W-PERP-GB mounted=' + mounted + ' flexDir=' + (r.flexDir || r.err) +
      ' chips=' + r.chips + ' hostVertical=' + r.hostVertical + ' overlaps=' + r.overlaps +
      (r.hit && r.hit.length ? ' hit=[' + r.hit.join(',') + ']' : '') + ' err=' + (errs.length ? errs.join('|') : 0));
    console.log('§W-PERP-GB orient=' + orientLog);
    console.log('§W-PERP-GB-RESULT ' + (pass ? 'PASS' : 'FAIL'));
    await page.close();
  }

  await browser.close();
  server.close();
  console.log('§W-PERP-ALL ' + (allPass ? 'PASS' : 'FAIL'));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error('§W-PERP-FATAL ' + e.message); process.exit(1); });
