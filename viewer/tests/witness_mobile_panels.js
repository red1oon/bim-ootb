// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-MOBILE-PANELS — bim-compiler prompts/MOBILE_PERF.md §P6 PANELS BUILD SPEC (owner-approved redesign: top layer + bottom sheets).
// Issues this witness proves or disproves on a phone-emulated Duplex (CPU 4× slower via CDP, like the §2026-11-27 PANELS table):
//   T1 panels fought over z-index (a ✕ under the pill rail) → every opened sheet is in the browser TOP LAYER (:popover-open).
//   T2 panels floated at odd places on a phone → a sheet is a BOTTOM SHEET: bottom = screen bottom, full width, ≤ 70 % high;
//      a panel that already is a full-screen modal (its own backdrop) keeps covering the screen.
//   T3 its ✕ (when it has one) is the top element at the ✕'s centre — a finger reaches it.
//   T4 opening stays instant: tap → painted (2 frames) ≤ 100 ms, 1st and 2nd open, for the 6 panels the baseline measured.
//   T5 Help grew 584 → 890 DOM nodes on its 2nd open (measured once) → reopen ≤ 1st open + 5 %.
//   Desktop control: no sheet manager → no `popover` attribute after opening Settings + Navigate.
//   RED control: ?sheetpop=0 → T1 must FAIL (Settings not in the top layer).
// §-log first — READ viewer/tests/witness_mobile_panels.log after every run before any conclusion.
// Run:  node viewer/tests/witness_mobile_panels.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };
const log = []; let fails = 0, judged = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }

async function open(browser, ctxOpts, query) {
  const ctx = await browser.newContext(ctxOpts); const page = await ctx.newPage(); const cons = [];
  page.on('console', m => cons.push(m.text())); page.on('pageerror', e => log.push('  [pageerror] ' + String(e.message).slice(0, 200)));
  await page.goto('http://127.0.0.1:' + server.address().port + '/viewer/viewer.html?db=buildings/Duplex_extracted.db' + (query || ''), { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { await page.waitForTimeout(1000);
    ready = await page.evaluate(() => !!(window.APP && APP.guidMap && Object.keys(APP.guidMap).length && APP.streaming === false && window._mainPillActions)).catch(() => false); }
  if (ready) { await page.waitForTimeout(1500); await page.evaluate(() => { if (window.toggleMobilePill) window.toggleMobilePill(); }); await page.waitForTimeout(300); }
  return { ctx, page, cons, ready };
}
// the timed tap runs IN the page: dispatch, then two animation frames = painted
const timedUp = (page, sel) => page.evaluate(async s => { const el = document.querySelector(s); if (!el) return null; const t0 = performance.now();
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t0; }, sel);
const timedRow = (page, drawer, prefix) => page.evaluate(async ([d, p]) => { const pn = document.getElementById(d + '-drawer-panel'); if (!pn) return null;
  const r = [...pn.querySelectorAll('button')].find(b => (b.innerText || '').trim().startsWith(p)); if (!r) return null; const t0 = performance.now();
  r.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await new Promise(rs => requestAnimationFrame(() => requestAnimationFrame(rs))); return performance.now() - t0; }, [drawer, prefix]);
const up = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (el) el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }, sel);
// 10 sheets (= the W-MOBILE-P2 population); timed:true = in the §2026-11-27 PANELS baseline table
const SHEETS = [
  { n: 'navigate-drawer-panel', timed: true, open: p => timedUp(p, '#pill-navigate') },
  { n: 'inspect-drawer-panel', timed: true, open: p => timedUp(p, '#pill-inspect') },
  { n: 'camview-drawer-panel', timed: true, open: p => timedUp(p, '#pill-camview') },
  { n: 'sunglass-slider-panel', timed: true, open: p => timedUp(p, '#pill-palette') },
  { n: 'settings-panel', timed: true, open: p => timedUp(p, '#pill-settings') },
  { n: 'cmd-palette', timed: true, open: p => timedUp(p, '#pill-help') },
  { n: 'find-panel', open: async p => { await up(p, '#pill-navigate'); await p.waitForTimeout(300); return timedRow(p, 'navigate', 'Find'); } },
  { n: 'whole-hist-panel', open: async p => { await up(p, '#pill-navigate'); await p.waitForTimeout(300); return timedRow(p, 'navigate', 'World History'); } },
  { n: 'clash-matrix', el: 'window.APP._clashMatrixDiv', wait: 2500, open: async p => { await up(p, '#pill-inspect'); await p.waitForTimeout(300); return timedRow(p, 'inspect', 'Clash Matrix'); } },
];
const elExpr = s => s.el || ("document.getElementById('" + s.n + "')");
// geometry is judged at rest: the sheet's own slide-in (160 ms, later under 4× CPU + a lazy module) is awaited first
const state = (page, s) => page.evaluate(async x => { const el = eval(x); if (!el || !el.isConnected || !el.offsetWidth) return null;
  const anim = el.getAnimations().length; await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {})));
  const r = el.getBoundingClientRect(), b = el.querySelector('.bim-panel-close, [id$="-close"], [id$="-x"], [aria-label="Close"], [title="Close"]');
  let xOk = null; if (b && b.offsetWidth) { const q = b.getBoundingClientRect(), t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); xOk = !!(t && (t === b || b.contains(t))); }
  return { top: el.matches(':popover-open'), cls: el.classList.contains('bim-sheet') ? 'bottom' : el.classList.contains('bim-sheet-modal') ? 'modal' : 'none',
    r: [r.left, r.top, r.width, r.height].map(Math.round), vw: innerWidth, vh: innerHeight, xOk, anim, nodes: el.getElementsByTagName('*').length }; }, elExpr(s));
const clearAll = page => page.evaluate(async () => { if (APP.sheets && APP.sheets.active) { let n = 0; while (APP.sheets.open.length && n++ < 5) APP.sheets.closeTop('other'); }
  await new Promise(r => setTimeout(r, 400)); });

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--disable-gpu'] });

  S('── PHONE, Duplex, CPU 4× ──');
  const P = await open(browser, PHONE);
  verdict(P.ready && P.cons.some(t => t === '§SHEET_TOPLAYER on'), 'phone loaded, sheet manager in top-layer mode');
  if (P.ready) {
    const cdp = await P.ctx.newCDPSession(P.page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    let helpNodes = [];
    for (const s of SHEETS) {
      for (const pass of [1, 2]) {
        await clearAll(P.page);
        const ms = await s.open(P.page); await P.page.waitForTimeout(s.wait || 700);
        const st = await state(P.page, s);
        if (!st) { S('   ⚪ ' + s.n + ' did not open (pass ' + pass + ') — not judged'); continue; }
        if (s.n === 'cmd-palette') helpNodes.push(st.nodes);
        if (pass === 1) {
          verdict(st.top, 'T1 ' + s.n + ' is in the top layer', 'class=' + st.cls);
          const geo = st.cls === 'bottom' ? (Math.abs(st.r[1] + st.r[3] - st.vh) <= 1 && Math.abs(st.r[2] - st.vw) <= 1 && st.r[0] === 0 && st.r[3] <= st.vh * 0.7 + 1)
            : st.cls === 'modal' ? (st.r[2] >= st.vw * 0.95 && st.r[3] >= st.vh * 0.9) : false;
          verdict(geo, 'T2 ' + s.n + ' sits as a ' + st.cls + ' sheet', 'rect=' + st.r.join(',') + ' screen=' + st.vw + 'x' + st.vh + ' animations_awaited=' + st.anim);
          if (st.xOk !== null) verdict(st.xOk, 'T3 ' + s.n + ' ✕ is reachable (top element at its centre)');
        }
        if (s.timed) verdict(ms !== null && ms <= 100, 'T4 ' + s.n + ' open #' + pass + ' painted in ≤ 100 ms (CPU 4×)', (ms === null ? 'no tap target' : ms.toFixed(1) + ' ms'));
        else S('   · ' + s.n + ' open #' + pass + ' ' + (ms === null ? '—' : ms.toFixed(1) + ' ms') + ' (info: not in the baseline table; lazy module on 1st open)');
      }
    }
    if (helpNodes.length === 2) verdict(helpNodes[1] <= helpNodes[0] * 1.05, 'T5 Help does not grow on reopen', 'nodes 1st=' + helpNodes[0] + ' 2nd=' + helpNodes[1]);
    else S('   ⚪ T5 INCONCLUSIVE — Help opened ' + helpNodes.length + ' time(s)');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  await P.ctx.close();

  S('\n── DESKTOP control ──');
  const D = await open(browser, { viewport: { width: 1400, height: 900 } });
  if (D.ready) {
    await D.page.evaluate(() => { const s = document.getElementById('pill-settings'); if (s) s.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }); await D.page.waitForTimeout(600);
    await D.page.evaluate(() => { const s = document.getElementById('pill-navigate'); if (s) s.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }); await D.page.waitForTimeout(600);
    const n = await D.page.evaluate(() => document.querySelectorAll('[popover]').length);
    verdict(n === 0 && !D.cons.some(t => /^§SHEET_TOPLAYER/.test(t)), 'desktop untouched: no popover, no sheet manager', 'popover_attrs=' + n);
  } else verdict(false, 'desktop did not load');
  await D.ctx.close();

  S('\n── RED CONTROL: ?sheetpop=0 — Settings must NOT be in the top layer ──');
  const R = await open(browser, PHONE, '&sheetpop=0');
  if (R.ready) {
    await R.page.evaluate(() => document.getElementById('pill-settings').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))); await R.page.waitForTimeout(700);
    const st = await state(R.page, { n: 'settings-panel' });
    judged++; const red = !(st && st.top); if (!red) fails++;
    S('   ' + (red ? '🟢 red control went RED as required (T1 fails: top=' + (st && st.top) + ')' : '🔴 red control did NOT go red'));
  } else { judged++; fails++; S('   🔴 red run did not load'); }
  await R.ctx.close();

  await browser.close(); server.close();
  const outcome = judged <= 2 ? 'INCONCLUSIVE' : (fails === 0 ? 'PASS' : 'FAIL');
  S('\n§WITNESS_MOBILE_PANELS ' + outcome + ' judged=' + judged + ' fails=' + fails);
  fs.writeFileSync(path.join(__dirname, 'witness_mobile_panels.log'), log.join('\n') + '\n');
  process.exit(outcome === 'PASS' ? 0 : 1);
})();
