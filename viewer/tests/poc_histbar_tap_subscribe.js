// ⚠ DO NOT REMOVE — browser §-witness for HISTORY_KNOB_SIGNAL_TAP §SESSION (the bar SUBSCRIBES to the §-tap).
// Proves the ONE seam the node witness can't: a §-stream act (no per-feature push) actually PAINTS a
// read-only dot in the REAL bar, AND the two knobs are now one. §-log first — read the .log, not the exit code.
// Run:  node viewer/tests/poc_histbar_tap_subscribe.js 2>&1 | tee viewer/tests/poc_histbar_tap_subscribe.log
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const PASS = [], FAIL = [];
function check(n, c, d) { (c ? PASS : FAIL).push(n); console.log((c ? '✅ ' : '❌ ') + n + (d ? ' — ' + d : '')); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${port}/viewer/tests/histbar_viewer_harness.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.__ready);
  await page.waitForTimeout(300);

  // ONE KNOB: dial the bar → the tap's knob must track (was two independent knobs).
  const knob = await page.evaluate(() => {
    window.UniversalHistory.setEnabled(true);
    window.UniversalHistory.setDepth('high');
    return { bar: window.HistoryBar.getDepth(), tap: window.HistoryTap.getKnob() };
  });
  check('W-LIVE-KNOB-ONE bar→tap synced', knob.bar === 'high' && knob.tap === 'high', 'bar=' + knob.bar + ' tap=' + knob.tap);

  // Open the bar, baseline dot count.
  const before = await page.evaluate(() => { window.UniversalHistory.open(); return document.querySelectorAll('#hist-marks > button').length; });

  // THE GAP ACT: an Alt+X §KBD_ROUTE through the S() sink — NO recordEvent/pushView call. Used to vanish.
  await page.evaluate(() => { window.S('KBD_ROUTE', 'Alt+X → ghost-xray', { ghost: true }); });
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => document.querySelectorAll('#hist-marks > button').length);

  check('W-LIVE-XC-DOT painted from §-stream', after === before + 1, 'dots ' + before + '→' + after);
  check('W-LIVE-XC §HIST_TAP_DOT logged', logs.some(l => /§HIST_TAP_DOT tag=KBD_ROUTE/.test(l)), '(no per-feature wiring)');
  check('W-LIVE-NO-RECORDEVENT (proof X/C never called the recorder)',
    !logs.some(l => /recordEvent/.test(l)) , 'dot came from the tap, not an explicit push');

  // Clicking the new dot re-applies its stamped look (read-only restore via field/_tapApply), op-log untouched.
  await page.evaluate(() => { var b = document.querySelectorAll('#hist-marks > button'); b[b.length - 1].dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await page.waitForTimeout(80);
  check('W-LIVE-XC restore read-only (op-log not mutated)', logs.some(l => /§HIST_VIEWNAV.*opLogMutated=NO/.test(l)), 'click=read-only scrub');

  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log('§W-LIVE SUMMARY pass=' + PASS.length + ' fail=' + FAIL.length);
  await browser.close(); server.close();
  process.exit(FAIL.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
