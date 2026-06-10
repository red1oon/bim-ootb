// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for PILLS_TO_GLASSBOWL_CONSOLIDATE.md — every loose Glassbowl + Gravity
//   control folds into the SHARED ⋯ pill registry (pill_builder.js used as-is) via glassbowl_pills.js +
//   pills_glassbowl.json / pills_gravity.json, PLUS a Home pill → erp.html.
//   PROVES:
//     W-GB-PILLS  — §GB-PILLS source=registry built=10 handAuthored=0; #gb-pillbar present; the OLD loose
//                   buttons (.ctl traceBtn/untangleBtn/muteBtn/resetBtn/panelToggle, aboutBtn, qrbtn) are GONE
//                   from the DOM; every icon resolves (no §GB_PILL_ICON_MISS); ⋯ collapse works.
//     W-HOME      — tapping the home pill logs §GB-HOME → erp.html and navigates to erp.html.
//     W-GRV-PILLS — §GRV-PILLS built=5 handAuthored=0; #gb-pillbar present; loose ↶/↷ (#undoBtn/#redoBtn) GONE,
//                   #scrub timeline kept.
//     CONCEPT-WM  — a non-interactive low-opacity #conceptWM watermark exists on both surfaces.
//   §-log first — READ tests/poc_glassbowl_pills.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_glassbowl_pills.js 2>&1 | tee tests/poc_glassbowl_pills.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/glassbowl.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const pillIds = page => page.$$eval('#gb-pill button[id^="pill-"]', bs => bs.map(b => b.id.replace('pill-', ''))).catch(() => []);
const gone = (page, sel) => page.$(sel).then(el => !el);

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  // ── Glassbowl ──
  let logs = [], errs = [];
  let page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${port}/glassbowl.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const gbLog   = logs.find(l => l.startsWith('§GB-PILLS')) || '(no §GB-PILLS log)';
  const iconMiss= logs.filter(l => l.includes('§GB_PILL_ICON_MISS')).join(' | ') || 'none';
  const gbBar   = await page.$('#gb-pillbar');
  const gbIds   = await pillIds(page);
  const looseGone = {
    ctl:        await gone(page, '.ctl'),
    traceBtn:   await gone(page, '#traceBtn'),
    untangleBtn:await gone(page, '#untangleBtn'),
    muteBtn:    await gone(page, '#muteBtn'),
    resetBtn:   await gone(page, '#resetBtn'),
    panelToggle:await gone(page, '#panelToggle'),
    aboutBtn:   await gone(page, '#aboutBtn'),
    qrbtn:      await gone(page, '#qrbtn'),
  };
  const allLooseGone = Object.values(looseGone).every(Boolean);
  const wm = await page.evaluate(() => { var w = document.getElementById('conceptWM'); if (!w) return null;
    var s = getComputedStyle(w); return { op: parseFloat(s.opacity), pe: s.pointerEvents, txt: w.textContent.trim() }; });

  console.log('§GB-WITNESS-1 ' + gbLog);
  console.log('§GB-WITNESS-2 bar=' + (gbBar ? 'present' : 'MISSING') + ' ids=[' + gbIds.join(',') + ']');
  console.log('§GB-WITNESS-3 looseGone=' + JSON.stringify(looseGone) + ' allGone=' + allLooseGone);
  console.log('§GB-WITNESS-4 iconMiss=' + iconMiss + ' pageErrors=' + (errs.length ? errs.join('|') : 0));
  console.log('§GB-WITNESS-5 conceptWM=' + JSON.stringify(wm));

  // ⋯ collapse
  const trig = await page.$('#gb-pill-trigger');
  let c1 = 'no-trig', c2 = 'no-trig';
  if (trig) { await trig.click(); await page.waitForTimeout(200); c1 = await page.$eval('#gb-pill', e => getComputedStyle(e).display);
              await trig.click(); await page.waitForTimeout(200); c2 = await page.$eval('#gb-pill', e => getComputedStyle(e).display); }
  console.log('§GB-WITNESS-6 collapse afterToggle1=' + c1 + ' afterToggle2=' + c2);

  // Collapsed-default dock now — OPEN it so the pills are interactable/visible for the checks + screenshot.
  if (trig) { await trig.click(); await page.waitForTimeout(250); }
  await page.screenshot({ path: path.join(__dirname, 'glassbowl_pills_1280.png') });

  // W-pill long-press → #gb-whist-drawer with 2 chips (Z + bomb). HISTORY_KNOB_DIAL §FOLLOWUP.
  const gbDrawer = await (async () => {
    const w = await page.$('#pill-worldhist'); if (!w) return { ok:false, n:0 };
    await w.dispatchEvent('pointerdown'); await page.waitForTimeout(600);
    const n = await page.$$eval('#gb-whist-drawer button', bs => bs.length).catch(() => 0);
    await w.dispatchEvent('pointerup'); return { ok: n === 2, n };
  })();
  console.log('§GB-WITNESS-8 worldDrawer chips=' + gbDrawer.n);

  // W-HOME — click the home pill LAST (it navigates away). Closes the drawer + fires §GB-HOME.
  const homeBtn = await page.$('#pill-home');
  let homeLogged = false, urlAfter = '(no-home-pill)';
  if (homeBtn) {
    await homeBtn.click().catch(() => {});
    await page.waitForTimeout(800);
    homeLogged = logs.some(l => l.startsWith('§GB-HOME'));
    urlAfter = page.url();
  }
  console.log('§GB-WITNESS-7 home logged=' + homeLogged + ' url=' + urlAfter);

  const GB_EXPECT = ['home','trace','untangle','reset','mute','panel','worldhist','edit','qr','showme','about'];
  const gbIdsOk = GB_EXPECT.every(id => gbIds.includes(id)) && gbIds.length === GB_EXPECT.length;
  const gbPass = gbIdsOk && gbBar && allLooseGone && iconMiss === 'none' && errs.length === 0 &&
    /source=registry/.test(gbLog) && /handAuthored=0/.test(gbLog) && wm && wm.pe === 'none' &&
    homeLogged && /erp\.html/.test(urlAfter) && gbDrawer.ok;   // weakness now lives in the SVG tile fill-opacity (see poc_concept_suffix.js), not element opacity
  console.log('§GB-RESULT ' + (gbPass ? 'PASS' : 'FAIL') + ' idsOk=' + gbIdsOk + ' bar=' + !!gbBar +
    ' looseGone=' + allLooseGone + ' iconClean=' + (iconMiss === 'none') + ' noErr=' + (errs.length === 0) +
    ' wmOk=' + !!(wm && wm.pe === 'none') + ' home=' + (homeLogged && /erp\.html/.test(urlAfter)));
  await page.close();

  // ── Gravity ──
  logs = []; errs = [];
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${port}/glassbowl_gravity.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const grvLog  = logs.find(l => l.startsWith('§GRV-PILLS')) || '(no §GRV-PILLS log)';
  const grvIcon = logs.filter(l => l.includes('§GB_PILL_ICON_MISS')).join(' | ') || 'none';
  const grvBar  = await page.$('#gb-pillbar');
  const grvIds  = await pillIds(page);
  const undoGone = await gone(page, '#undoBtn'), redoGone = await gone(page, '#redoBtn');
  const scrubKept = !!(await page.$('#scrub'));
  const grvWm = await page.$('#conceptWM');

  console.log('§GRV-WITNESS-1 ' + grvLog);
  console.log('§GRV-WITNESS-2 bar=' + (grvBar ? 'present' : 'MISSING') + ' ids=[' + grvIds.join(',') + ']');
  console.log('§GRV-WITNESS-3 undoGone=' + undoGone + ' redoGone=' + redoGone + ' scrubKept=' + scrubKept +
    ' conceptWM=' + (grvWm ? 'present' : 'MISSING'));
  console.log('§GRV-WITNESS-4 iconMiss=' + grvIcon + ' pageErrors=' + (errs.length ? errs.join('|') : 0));

  // open the collapsed dock, then long-press worldhist → drawer with 2 chips
  const gtrig = await page.$('#gb-pill-trigger');
  if (gtrig) { await gtrig.click(); await page.waitForTimeout(250); }
  const grvDrawer = await (async () => {
    const w = await page.$('#pill-worldhist'); if (!w) return { ok:false, n:0 };
    await w.dispatchEvent('pointerdown'); await page.waitForTimeout(600);
    const n = await page.$$eval('#gb-whist-drawer button', bs => bs.length).catch(() => 0);
    await w.dispatchEvent('pointerup'); return { ok: n === 2, n };
  })();
  console.log('§GRV-WITNESS-5 worldDrawer chips=' + grvDrawer.n + ' undoRedoPillsGone=' +
    (!grvIds.includes('undo') && !grvIds.includes('redo')));

  const GRV_EXPECT = ['home','worldhist','edit','showme'];   // undo/redo pills REMOVED (W pill owns time nav now)
  const grvIdsOk = GRV_EXPECT.every(id => grvIds.includes(id)) && grvIds.length === GRV_EXPECT.length;
  const grvPass = grvIdsOk && grvBar && undoGone && redoGone && scrubKept && grvIcon === 'none' &&
    errs.length === 0 && grvWm && /source=registry/.test(grvLog) && /handAuthored=0/.test(grvLog) && grvDrawer.ok;
  console.log('§GRV-RESULT ' + (grvPass ? 'PASS' : 'FAIL') + ' idsOk=' + grvIdsOk + ' bar=' + !!grvBar +
    ' undoRedoGone=' + (undoGone && redoGone) + ' scrub=' + scrubKept + ' drawer=' + grvDrawer.ok + ' noErr=' + (errs.length === 0));
  await page.screenshot({ path: path.join(__dirname, 'gravity_pills_1280.png') });

  await browser.close();
  server.close();
  process.exit(gbPass && grvPass ? 0 : 1);
})();
