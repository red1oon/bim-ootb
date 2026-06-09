// ⚠ DO NOT REMOVE — Scope guard
// Scope: §-witness for the CROSS-SURFACE pill behavior the user dictated (wrap 2026-06-09):
//   "the pill ⋯ should rest BOTTOM-RIGHT and stay there (not drift to mid on collapse); start COLLAPSED;
//    on click ANIMATE UP to reveal the hidden icons; and NOT collapse (stay open until re-tapped);
//    consistent across ALL pages." Plus the erp.html surgery: dead toast-stubs removed, Install/Migrate
//    added, help = a real HelpGuide card.
//
//   Each claim NAMES the issue it proves (a passing test must reveal whether the behavior is solved):
//   PER ERP SURFACE (erp.html #erp-*, idempiere.html #idmp-*):
//     §C-A  ANCHOR — the ⋯ trigger rect is BOTTOM-RIGHT (right within 32px of viewport right, bottom within
//           48px of viewport bottom). Disproves "drifts to mid-screen".
//     §C-B  COLLAPSED-DEFAULT — at boot the strip is not visible (display:none / offsetParent null).
//     §C-C  REVEAL-UP — tapping ⋯ makes the strip visible, it carries `.pill-revealing` (the rise animation),
//           and its top is ABOVE the trigger (rises UP, not down).
//     §C-D  STAYS-OPEN — after the reveal, a tap on empty page area leaves the strip STILL open (persistent).
//           Disproves the old auto-recollapse.
//     §C-E  RE-TAP-COLLAPSES — a second ⋯ tap hides the strip again (back to the clean ⋯).
//   ERP.HTML SURGERY:
//     §C-F  CURATED — pills == [home,install,migrate,verify,maximize,share,erpdoc,help,idempiere,glassbowl,
//           gravity] (11); the 7 dead stubs [find,read,ledger,graphs,edit,process,settings] are ABSENT.
//     §C-G  HELPGUIDE — tapping help opens a visible #erp-help-guide card; tapping × closes it.
//     §C-H  INSTALL/MIGRATE — both pills exist AND clicking install opens the shared ErpPicker overlay (.ep-*).
//   BIM VIEWER (viewer.html #mobile-*):
//     §C-V  REVEAL-UP — the viewer strip is collapsed by default + rises on ⋯ tap (`.pill-revealing`).
//
//   §-log FIRST — READ poc_pill_consistency.log before any conclusion.
// Run:  node erp/tests/poc_pill_consistency.js 2>&1 | tee erp/tests/poc_pill_consistency.log   (cwd = repo root or erp/)
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');   // repo root — serves both erp/ and viewer/
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.wasm':'application/wasm', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

const VW = 412, VH = 870;
let PASS = 0, FAIL = 0;
function ok(tag, cond, detail) { (cond ? PASS++ : FAIL++); console.log((cond ? '🟢 ' : '🔴 ') + tag + ' ' + (detail || '')); }

// Geometry/visibility probe for one ERP-style bar (ids parameterised).
async function probeErpBar(page, ids, label) {
  const { bar, strip, trig } = ids;
  // §C-A anchor
  const anchor = await page.evaluate((trig) => {
    const t = document.querySelector(trig); if (!t) return null;
    const r = t.getBoundingClientRect();
    return { right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight };
  }, trig);
  ok(`§C-A-${label}`, anchor && (anchor.vw - anchor.right) < 32 && (anchor.vh - anchor.bottom) < 48,
     anchor ? `right_gap=${(anchor.vw-anchor.right).toFixed(0)} bottom_gap=${(anchor.vh-anchor.bottom).toFixed(0)}` : 'no trigger');
  // §C-B collapsed default
  const collapsed = await page.evaluate((strip) => {
    const s = document.querySelector(strip); if (!s) return null;
    return { vis: s.offsetParent !== null && getComputedStyle(s).display !== 'none' };
  }, strip);
  ok(`§C-B-${label}`, collapsed && collapsed.vis === false, collapsed ? `stripVisible=${collapsed.vis}` : 'no strip');
  // §C-C reveal-up: tap the ⋯
  await page.click(trig);
  await page.waitForTimeout(120);
  const revealed = await page.evaluate((o) => {
    const s = document.querySelector(o.strip), t = document.querySelector(o.trig);
    const sr = s.getBoundingClientRect(), tr = t.getBoundingClientRect();
    return { vis: s.offsetParent !== null && getComputedStyle(s).display !== 'none',
             rising: s.classList.contains('pill-revealing'), above: sr.top < tr.top };
  }, ids);
  ok(`§C-C-${label}`, revealed.vis && revealed.rising && revealed.above,
     `visible=${revealed.vis} pill-revealing=${revealed.rising} risesAbove=${revealed.above}`);
  // §C-D stays open after an outside tap
  await page.mouse.click(20, Math.floor(VH / 2));   // empty area, away from the bottom-right bar
  await page.waitForTimeout(120);
  const stays = await page.evaluate((strip) => {
    const s = document.querySelector(strip);
    return s.offsetParent !== null && getComputedStyle(s).display !== 'none';
  }, strip);
  ok(`§C-D-${label}`, stays === true, `stillOpen=${stays}`);
  // §C-E re-tap collapses
  await page.click(trig);
  await page.waitForTimeout(120);
  const recollapsed = await page.evaluate((strip) => {
    const s = document.querySelector(strip);
    return s.offsetParent === null || getComputedStyle(s).display === 'none';
  }, strip);
  ok(`§C-E-${label}`, recollapsed === true, `collapsedAgain=${recollapsed}`);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  // ───────────────────────── idempiere.html ─────────────────────────
  await page.goto(`http://localhost:${port}/erp/idempiere.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.IdmpPills && window.IdmpPills.builder, { timeout: 20000 }).catch(() => {});
  // settle the boot ⋯ bob, force pre-client (front-door)
  await page.evaluate(() => { const lg = document.getElementById('idmp-login'); if (lg) lg.style.display = 'flex'; window.IdmpPills.setStage('pre-client'); });
  await page.waitForTimeout(400);
  await probeErpBar(page, { bar: '#idmp-pillbar', strip: '#idmp-pill', trig: '#idmp-pill-trigger' }, 'IDMP');

  // ───────────────────────── erp.html ─────────────────────────
  await page.goto(`http://localhost:${port}/erp/erp.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.ErpPills, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(400);
  await probeErpBar(page, { bar: '#erp-pillbar', strip: '#erp-pill', trig: '#erp-pill-trigger' }, 'ERP');

  // §C-F curated set — open the strip and read the rendered pill ids
  await page.click('#erp-pill-trigger'); await page.waitForTimeout(120);
  const ids = await page.evaluate(() => Array.from(document.querySelectorAll('#erp-pill button[id^="pill-"]')).map(b => b.id.replace('pill-', '')));
  const EXPECT = ['home','install','migrate','verify','maximize','share','erpdoc','help','idempiere','glassbowl','gravity'];
  const DEAD = ['find','read','ledger','graphs','edit','process','settings'];
  const hasAll = EXPECT.every(id => ids.includes(id));
  const noDead = DEAD.every(id => !ids.includes(id));
  ok('§C-F-CURATED', hasAll && noDead && ids.length === 11, `count=${ids.length} hasAll=${hasAll} noDead=${noDead} ids=[${ids.join(',')}]`);

  // §C-G HelpGuide card (BEFORE install — the picker overlay would otherwise cover #pill-help). Strip is open.
  await page.click('#pill-help'); await page.waitForTimeout(150);
  const helpOpen = await page.evaluate(() => { const c = document.getElementById('erp-help-guide'); return !!c && getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().height > 0; });
  await page.evaluate(() => { const x = document.getElementById('erp-help-x'); if (x) x.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await page.waitForTimeout(120);
  const helpClosed = await page.evaluate(() => !document.getElementById('erp-help-guide'));
  ok('§C-G-HELPGUIDE', helpOpen && helpClosed, `opened=${helpOpen} closedOnX=${helpClosed}`);

  // §C-H install/migrate present + opens the shared ErpPicker overlay (#ep-overlay) — do this LAST.
  const hasIM = ids.includes('install') && ids.includes('migrate');
  await page.evaluate(() => { if (!window.ErpPills.isOpen()) window.ErpPills.toggle(); });
  await page.waitForTimeout(80);
  await page.click('#pill-install'); await page.waitForTimeout(250);
  const pickerOpen = await page.evaluate(() => !!document.getElementById('ep-overlay'));
  ok('§C-H-INSTALL_MIGRATE', hasIM && pickerOpen, `install&migrate=${hasIM} pickerOpened=${pickerOpen}`);
  await page.evaluate(() => { const o = document.getElementById('ep-overlay'); if (o) o.remove(); });

  // ───────────────────────── viewer.html ─────────────────────────
  await page.goto(`http://localhost:${port}/viewer/viewer.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#mobile-trigger', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  // NOTE: #mobile-pill is position:fixed → offsetParent is ALWAYS null even when visible. Use display+rect.
  const vCollapsed = await page.evaluate(() => { const s = document.getElementById('mobile-pill'); return s && getComputedStyle(s).display === 'none'; });
  await page.click('#mobile-trigger').catch(() => {});
  await page.waitForTimeout(150);
  const vRevealed = await page.evaluate(() => { const s = document.getElementById('mobile-pill'); return s && getComputedStyle(s).display !== 'none' && s.classList.contains('pill-revealing') && s.getBoundingClientRect().height > 0; });
  ok('§C-V-VIEWER', vCollapsed && vRevealed, `collapsedDefault=${vCollapsed} risesOnTap=${vRevealed}`);

  // screenshots for the visual record (log ≠ visual proof)
  await page.goto(`http://localhost:${port}/erp/erp.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.ErpPills, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'poc_pill_consistency_collapsed.png') });
  await page.click('#erp-pill-trigger'); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'poc_pill_consistency_revealed.png') });

  console.log(`§PILL-CONSISTENCY RESULT pass=${PASS} fail=${FAIL} pageErrors=${errs.length}` + (errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close(); server.close();
  process.exit(FAIL === 0 ? 0 : 1);
})().catch(e => { console.error('§PILL-CONSISTENCY THREW ' + e.message); process.exit(1); });
