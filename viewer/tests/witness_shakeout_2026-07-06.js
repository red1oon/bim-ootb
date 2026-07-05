// ⚠ DO NOT REMOVE — Scope guard
// Scope: user report "Alt-Z/X bbxes still comes on for below 50k... Both should shake out of their
// states upon click outside or select again to deselect item." Live-reproduced on HHS_Office_Federated
// (6,830 elements): the AUTO-engaged X-Ray-on-pick already reset correctly on deselect/click-outside
// (not the bug) — the real gap was the MANUALLY-toggled Alt+Z X-Ray/Bbox mode, which previously only
// exited via another explicit Alt+Z press, never via clicking outside or deselecting (by old design,
// see the removed "must not disturb the manual x-ray" comment in navigate_find.js). User confirmed via
// clarifying question that click-outside/deselect should now ALSO exit those modes.
// Fix: A.clearFocusElement (navigate_find.js) now force-exits A.xrayOn/ghostXrayOn after its existing
// _highlightLensReset() call — scoped to clearFocusElement only, not the shared _highlightLensReset
// helper (which keeps its old manual-toggle-preserving behavior for its other unrelated callers).
// Also: picking.js's "no guid resolved" branch (hit lands on the ghost/bbox merged mesh, not a real
// element — happens on almost every click while Bbox mode is active, since solids are hidden) now
// also calls A.clearFocusElement(), since a guid-less hit is functionally "clicked outside" to the user.
// §-log first — READ tests/witness_shakeout_2026-07-06.log before any conclusion.
// Run:  node viewer/tests/witness_shakeout_2026-07-06.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

const log = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function state(page) { return page.evaluate(() => ({ xrayOn: !!window.APP.xrayOn, ghostOn: (typeof window.ghostXrayOn === 'function') ? window.ghostXrayOn() : 'n/a' })); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const cons = [], errs = [];
  page.on('console', m => { log.push('  [console] ' + m.text()); cons.push(m.text()); });
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated', { waitUntil: 'networkidle' });
  let ready = false;
  for (let i = 0; i < 90 && !ready; i++) {
    await page.waitForTimeout(1000);
    try { ready = await page.evaluate(() => !!(window.APP && window.APP.guidMap && Object.keys(window.APP.guidMap).length > 0 && window.APP.streaming === false)); } catch (e) {}
  }
  verdict(ready, 'real model loaded + ready (HHS_Office_Federated)');
  if (!ready) { await page.close(); await browser.close(); server.close(); process.exit(1); }
  await page.evaluate(() => window.APP.loadNavigate());
  await page.waitForTimeout(500);

  // ── Trigger 1: manual Alt+Z into Bbox mode, then click OUTSIDE (empty corner) — must shake out ──
  S('\n── Trigger 1: manual Bbox mode + click outside (empty space) ──');
  await page.keyboard.down('Alt'); await page.keyboard.press('z'); await page.keyboard.up('Alt'); // off->xray
  await page.waitForTimeout(200);
  await page.keyboard.down('Alt'); await page.keyboard.press('z'); await page.keyboard.up('Alt'); // xray->bbox
  await page.waitForTimeout(300);
  let st = await state(page);
  verdict(st.ghostOn === true, 'Bbox/ghost mode is ON after Alt+Z x2', JSON.stringify(st));
  await page.mouse.click(50, 50); // corner — click outside
  await page.waitForTimeout(400);
  st = await state(page);
  verdict(st.ghostOn === false && st.xrayOn === false, 'click-outside fully shook out of Bbox mode', JSON.stringify(st));

  // ── Trigger 2: manual Alt+Z into plain X-Ray, click outside — must shake out ──
  S('\n── Trigger 2: manual X-Ray mode + click outside ──');
  await page.keyboard.down('Alt'); await page.keyboard.press('z'); await page.keyboard.up('Alt'); // off->xray
  await page.waitForTimeout(300);
  st = await state(page);
  verdict(st.xrayOn === true, 'X-Ray is ON after Alt+Z x1', JSON.stringify(st));
  await page.mouse.click(50, 50);
  await page.waitForTimeout(400);
  st = await state(page);
  verdict(st.xrayOn === false, 'click-outside fully shook out of X-Ray mode', JSON.stringify(st));

  // ── Trigger 3: manual Bbox mode + clicking ON the ghost mesh itself (guid-less hit) — must also
  // shake out, since almost every click while Bbox is active hits the ghost, not a real element ──
  S('\n── Trigger 3: manual Bbox mode + clicking the ghost representation (guid-less hit) ──');
  await page.keyboard.down('Alt'); await page.keyboard.press('z'); await page.keyboard.up('Alt'); // xray->bbox (was off, now xray)
  await page.waitForTimeout(200);
  await page.keyboard.down('Alt'); await page.keyboard.press('z'); await page.keyboard.up('Alt'); // ->bbox
  await page.waitForTimeout(300);
  st = await state(page);
  verdict(st.ghostOn === true, 'Bbox/ghost mode is ON again', JSON.stringify(st));
  cons.length = 0;
  await page.mouse.click(700, 450); // center — likely hits the ghost mesh, not a real element
  await page.waitForTimeout(400);
  const noGuidLogged = cons.some(l => l.includes('§PICK no guid'));
  const shakeOutLogged = cons.some(l => l.includes('§SHAKE_OUT ghost'));
  st = await state(page);
  verdict(noGuidLogged, 'center click hit the ghost mesh (no real guid resolved), confirming the repro path', cons.filter(l=>/PICK|SHAKE/.test(l)).join(' | '));
  verdict(shakeOutLogged, '§SHAKE_OUT ghost→off logged from the guid-less-hit branch');
  verdict(st.ghostOn === false, 'clicking the ghost representation itself also shook out of Bbox mode', JSON.stringify(st));

  // ── Trigger 4 (regression guard): the ORIGINAL auto-engage-on-pick + deselect cycle must still
  // work. Driven via the same A.focusElement/clearFocusElement primitives picking.js's real click
  // handler calls (proven identical call sites by code + earlier live testing this session) —
  // avoids a real screen click, whose target mesh depends on camera state left over from Triggers
  // 1-3's Alt+Z/click interactions and isn't the thing under test here. ──
  S('\n── Trigger 4 (regression): plain pick auto-engage + explicit clear still works ──');
  const guid = await page.evaluate(() => Object.keys(window.APP.guidMap)[0]);
  await page.evaluate((g) => window.APP.focusElement(g, { item: true, frame: false }), guid);
  await page.waitForTimeout(300);
  st = await state(page);
  verdict(st.xrayOn === true, 'plain pick still auto-engages X-Ray-dim (unchanged behavior)', JSON.stringify(st));
  await page.evaluate(() => window.APP.clearFocusElement());
  await page.waitForTimeout(300);
  st = await state(page);
  verdict(st.xrayOn === false, 'clearFocusElement still cleanly turns auto-engaged X-Ray back off (unchanged)', JSON.stringify(st));

  verdict(errs.length === 0, '0 page errors', errs.join(' | '));
  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILURE(S)'));
  fs.writeFileSync(path.join(__dirname, 'witness_shakeout_2026-07-06.log'), log.join('\n'));
  await page.close(); await browser.close(); server.close();
  process.exit(fails === 0 ? 0 : 1);
})();
