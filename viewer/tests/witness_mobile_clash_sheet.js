// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-MOBILE-CLASH-SHEET — bim-compiler prompts/MOBILE_PERF.md §2026-11-28 CHECKS, finding 1 (from the FILM-M1 recording, 2026-11-27):
//   on a phone the pill rail covered the right edge of the clash LIST until the FAB folded the rail; the list was a floating panel,
//   not a sheet (the manager's ADAPTERS held clash-matrix and issues-panel, not A._clashListDiv).
// Issues this witness proves or disproves on a phone-emulated Duplex, pill rail OPEN (the defect's condition):
//   C1 a matrix cell opens the list as a sheet: §SHEET_OPEN id=clash-list … layer=top sheet=bottom
//   C2 one sheet at a time: the list replaces the matrix (§SHEET_REPLACE closed=clash-matrix by=clash-list; the matrix is gone)
//   C3 bottom sheet geometry: full width, bottom = screen bottom, in the browser top layer (:popover-open)
//   C4 nothing covers it: wherever a shown pill overlaps the list, the top element at the overlap's centre belongs to the list (≥ 1 overlap, rail open)
//   C5 a real tap on a clash row still opens its detail (§CLASH_DETAIL) and the list stays open
//   C6 Android Back closes the list (§SHEET_CLOSE id=clash-list via=back), no page error
//   Desktop control: no sheet manager → the list is not a popover and the matrix stays beside it.
//   RED control: ?sheetclashlist=0 (adapter off) → C4 must FAIL (a pill covers the list's right edge), else INCONCLUSIVE.
// §-log first — READ viewer/tests/witness_mobile_clash_sheet.log after every run before any conclusion.
// Run:  node viewer/tests/witness_mobile_clash_sheet.js
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
const DESK = { viewport: { width: 1600, height: 900 } };
const log = []; let fails = 0, judged = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }

async function open(browser, ctxOpts, query, phone) {
  const ctx = await browser.newContext(ctxOpts); const page = await ctx.newPage(); const cons = [], errs = [];
  page.on('console', m => cons.push(m.text())); page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await page.goto('http://127.0.0.1:' + server.address().port + '/viewer/viewer.html?db=buildings/Duplex_extracted.db' + (query || ''), { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { await page.waitForTimeout(1000);
    ready = await page.evaluate(() => !!(window.APP && APP.guidMap && Object.keys(APP.guidMap).length && APP.streaming === false && window._mainPillActions)).catch(() => false); }
  if (ready) { await page.waitForTimeout(1500); if (phone) { await page.evaluate(() => { if (window.toggleMobilePill) window.toggleMobilePill(); }); await page.waitForTimeout(300); } }
  return { ctx, page, cons, errs, ready };
}
// matrix → the MEP|ARC cell (else the first pair cell) → wait for list rows
async function openList(page) {
  await page.evaluate(() => window._shortcuts.c());
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(APP._clashMatrixDiv && APP._clashMatrixDiv.querySelector('[data-pair]')))); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(1500);   // background overlap pass colours the cells
  const pair = await page.evaluate(() => { const m = APP._clashMatrixDiv; if (!m) return null;
    const c = m.querySelector('[data-pair="MEP|ARC"]') || m.querySelector('[data-pair="ARC|MEP"]') || m.querySelector('[data-pair]'); if (!c) return null; c.click(); return c.getAttribute('data-pair'); });
  for (let i = 0; i < 80 && !(await page.evaluate(() => !!(APP._clashListDiv && APP._clashListDiv.querySelector('[data-clash-idx]')))); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(400);
  return pair;
}
// every shown pill that overlaps the list: at the centre of the overlap, is the top element the list (not the pill)?
const edgeHits = page => page.evaluate(() => { const L = APP._clashListDiv; if (!L) return null; const r = L.getBoundingClientRect();
  return [...document.querySelectorAll('[id^="pill-"]')].filter(e => e.offsetWidth && getComputedStyle(e).visibility !== 'hidden').map(p => { const q = p.getBoundingClientRect();
    const x0 = Math.max(r.left, q.left), x1 = Math.min(r.right, q.right), y0 = Math.max(r.top, q.top), y1 = Math.min(r.bottom, q.bottom); if (x1 - x0 < 2 || y1 - y0 < 2) return null;
    const e = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2); return { pill: p.id, inList: !!(e && L.contains(e)), top: e ? (e.id || e.tagName).toString().slice(0, 30) : 'none' }; }).filter(Boolean); });
const pillsShown = page => page.evaluate(() => [...document.querySelectorAll('[id^="pill-"]')].filter(e => e.offsetWidth && getComputedStyle(e).visibility !== 'hidden').length);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  S('§W-MOBILE-CLASH-SHEET start port=' + server.address().port);
  // ── phone, rail open
  const P = await open(browser, PHONE, '', true);
  if (!P.ready) { verdict(false, 'phone page ready'); } else {
    const c0 = P.cons.length, pair = await openList(P.page), cs = P.cons.slice(c0);
    S('   pair=' + pair + ' lines: ' + cs.filter(t => /§SHEET_(OPEN|REPLACE|CLOSE)/.test(t)).join(' | '));
    verdict(cs.some(t => /^§SHEET_OPEN id=clash-list n=1 layer=top sheet=bottom/.test(t)), 'C1 the list opens as a bottom sheet in the top layer');
    const mat = await P.page.evaluate(() => !!APP._clashMatrixDiv);
    verdict(cs.some(t => /^§SHEET_REPLACE closed=clash-matrix by=clash-list/.test(t)) && !mat, 'C2 the list replaces the matrix (one sheet at a time)', 'matrix_present=' + mat);
    const g = await P.page.evaluate(() => { const L = APP._clashListDiv, r = L.getBoundingClientRect(); return { pop: L.matches(':popover-open'), l: Math.round(r.left), w: Math.round(r.width), b: Math.round(r.bottom), W: innerWidth, H: innerHeight }; });
    verdict(g.pop && g.l === 0 && g.w === g.W && Math.abs(g.b - g.H) <= 1, 'C3 full width, at the screen bottom, :popover-open', JSON.stringify(g));
    const pills = await pillsShown(P.page), hits = await edgeHits(P.page);
    verdict(pills > 0 && !!hits && hits.length > 0 && hits.every(h => h.inList), 'C4 where a shown pill overlaps the list, the list is on top (rail open; ≥ 1 overlap, else vacuous)', 'pills_shown=' + pills + ' ' + JSON.stringify(hits));
    const rowPt = await P.page.evaluate(() => { const e = APP._clashListDiv && APP._clashListDiv.querySelector('[data-clash-idx]'); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left + Math.min(40, r.width / 2)), Math.round(r.top + r.height / 2)]; });
    const c1 = P.cons.length; if (rowPt) await P.page.touchscreen.tap(rowPt[0], rowPt[1]); await P.page.waitForTimeout(1200);
    const det = P.cons.slice(c1).find(t => /^§CLASH_DETAIL /.test(t)), still = await P.page.evaluate(() => !!(APP._clashListDiv && APP._clashListDiv.isConnected));
    verdict(!!det && still, 'C5 a real tap on a clash row opens its detail; the list stays', (det || 'no §CLASH_DETAIL').slice(0, 90) + ' list_open=' + still);
    const c2 = P.cons.length; await P.page.goBack().catch(() => {}); await P.page.waitForTimeout(800);
    const back = P.cons.slice(c2).find(t => /^§SHEET_CLOSE id=clash-list via=back/.test(t)), gone = await P.page.evaluate(() => !APP._clashListDiv);
    verdict(!!back && gone && P.errs.length === 0, 'C6 Back closes the list, no page error', (back || 'no close line') + ' list_gone=' + gone + ' pageerrors=' + JSON.stringify(P.errs));
  }
  await P.ctx.close();
  // ── desktop control
  const D = await open(browser, DESK, '', false);
  if (D.ready) { await openList(D.page);
    const d = await D.page.evaluate(() => ({ list: !!APP._clashListDiv, pop: !!(APP._clashListDiv && APP._clashListDiv.hasAttribute('popover')), matrix: !!APP._clashMatrixDiv }));
    verdict(d.list && !d.pop && d.matrix, 'desktop control: list beside the matrix, no popover (desktop unchanged)', JSON.stringify(d));
  } else verdict(false, 'desktop page ready');
  await D.ctx.close();
  // ── RED control: adapter off
  const R = await open(browser, PHONE, '&sheetclashlist=0', true); let redOk = false;
  if (R.ready) { await openList(R.page); const pills = await pillsShown(R.page), hits = await edgeHits(R.page);
    redOk = pills > 0 && !!hits && hits.some(h => !h.inList);   // the rc3 defect: a pill on top of the list
    S('§W-MOBILE-CLASH-SHEET RED ?sheetclashlist=0 → C4 ' + (redOk ? 'FAILS as required' : 'still passes (control not detected)') + ' pills_shown=' + pills + ' ' + JSON.stringify(hits)); }
  await R.ctx.close();
  await browser.close(); server.close();
  const v = !redOk ? (fails ? 'FAIL' : 'INCONCLUSIVE') : fails ? 'FAIL' : 'PASS';
  S(`§WITNESS_MOBILE_CLASH_SHEET ${v} judged=${judged} fails=${fails} red_control=${redOk ? 'detected' : 'not detected'}`);
  fs.writeFileSync(path.join(__dirname, 'witness_mobile_clash_sheet.log'), log.join('\n') + '\n');
  process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { S('§WITNESS_MOBILE_CLASH_SHEET FAIL fatal=' + (e && e.stack || e)); fs.writeFileSync(path.join(__dirname, 'witness_mobile_clash_sheet.log'), log.join('\n') + '\n'); process.exit(1); });
