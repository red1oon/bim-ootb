// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the pill ⋯ trigger UX (v597), two user-requested changes:
//   (a) FLAT (horizontal) kebab on ALL pill surfaces (erp.html + idempiere.html) so OUR ⋯ differs from
//       Android's own vertical ⋮ system menu — the trigger's 3 dots must share ONE cy (horizontal row).
//   (b) On the iDempiere MOBILE bottom dock, the ⋯ holds a CONSTANT position when the pills collapse
//       (was justify-content:center → the lone trigger re-centred, x≈15→179, out from under the finger).
//       Fix: order:-1 + justify-content:flex-start pins it to the right edge. Assert |Δx| is tiny.
//   §-log first — READ tests/poc_pill_trigger.log before any conclusion.
// Run:  node tests/poc_pill_trigger.js 2>&1 | tee tests/poc_pill_trigger.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
let DEFAULT = '/idempiere.html';
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = DEFAULT;
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

// flat = the 3 kebab dots share one cy (horizontal). vertical kebab would have cy 5/12/19.
async function isFlat(page, trigSel) {
  const cys = await page.$$eval(trigSel + ' svg circle', cs => cs.map(c => c.getAttribute('cy'))).catch(() => []);
  return { cys, flat: cys.length === 3 && cys.every(v => v === cys[0]) };
}
const xOf = (page, sel) => page.$eval(sel, el => Math.round(el.getBoundingClientRect().x)).catch(() => null);
const dispOf = (page, sel) => page.$eval(sel, el => getComputedStyle(el).display).catch(() => 'absent');

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  // (a) FLAT glyph — erp.html
  DEFAULT = '/erp.html';
  await page.goto(`http://localhost:${port}/erp.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const erpFlat = await isFlat(page, '#erp-pill-trigger');
  console.log('§PILL-TRIGGER surface=erp.html flat=' + (erpFlat.flat ? 'Y' : 'N') + ' cy=' + JSON.stringify(erpFlat.cys));

  // (a) FLAT glyph + (b) position stability — idempiere.html mobile dock
  DEFAULT = '/idempiere.html';
  await page.goto(`http://localhost:${port}/idempiere.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const idmpFlat = await isFlat(page, '#idmp-pill-trigger');
  const xExpanded = await xOf(page, '#idmp-pill-trigger');
  // collapse the dock (tap ⋯), capped at 3 taps
  let disp = await dispOf(page, '#idmp-pill'), taps = 0;
  while (disp !== 'none' && taps < 3) { await page.tap('#idmp-pill-trigger'); await page.waitForTimeout(250); disp = await dispOf(page, '#idmp-pill'); taps++; }
  const xCollapsed = await xOf(page, '#idmp-pill-trigger');
  const dx = (xExpanded != null && xCollapsed != null) ? Math.abs(xExpanded - xCollapsed) : 999;
  const stable = dx <= 4;
  console.log('§PILL-TRIGGER surface=idempiere.html flat=' + (idmpFlat.flat ? 'Y' : 'N') + ' cy=' + JSON.stringify(idmpFlat.cys) +
    ' xExpanded=' + xExpanded + ' xCollapsed=' + xCollapsed + ' dx=' + dx + ' anchored=' + (stable ? 'Y' : 'N') + ' (collapsedDisplay=' + disp + ')');

  await page.screenshot({ path: path.join(__dirname, 'pill_trigger_390.png') });

  const pass = erpFlat.flat && idmpFlat.flat && stable && disp === 'none' && errs.length === 0;
  console.log('§PILL-TRIGGER-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' flatAll=' + (erpFlat.flat && idmpFlat.flat) + ' anchored=' + stable + ' dx=' + dx +
    ' pageErrors=' + (errs.length ? errs.join('|') : 0));

  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); try { server.close(); } catch (x) {} process.exit(2); });
