// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-MOBILE-DRAWER-ROW — bug found 2026-11-27 on a phone profile: tapping Walk in the Navigate drawer opened the Walk prompt
// UNDER the still-open drawer (SET covered until the drawer was swiped away). Rule (panels.js §SHEET_ROW_PROMPT, generic, no per-row
// code): a drawer row whose action opens its OWN prompt/dialog closes the drawer.
// Issues this witness proves or disproves (real taps, phone profile 412x823, Duplex):
//   R1 tap the real Walk row -> the Navigate drawer is closed AND the Walk prompt is shown AND its SET button is the top element at
//      its own centre (elementFromPoint) AND a tap on it works (prompt hides, walk anchor set).
//   R2 log: `§SHEET_ROW_PROMPT row=drawer-row-walk ...` and `§SHEET_CLOSE id=navigate-drawer-panel via=row-prompt`.
//   R3 sweep: EVERY row of the Navigate / Inspect / Camera-View drawers (safe ones, named skips printed) -> afterwards no prompt that
//      appeared during the row is covered by a sheet (the invariant, over the whole denominator, not Walk alone). Rows that opened a
//      prompt are listed; rows that opened a panel are unchanged (SHEET_REPLACE).
//   R4 RED control: `?sheetrow=0` (rule off) -> the same Walk tap leaves the drawer open and SET covered. If it does not, R1 cannot fail.
//   R5 desktop control: no manager, no §SHEET_ line, Walk is not a desktop row.
// Verdict is INCONCLUSIVE (never PASS) when the Walk row / prompt was not reached. §-log first: READ witness_mobile_drawer_row.log.
// Run:  node viewer/tests/witness_mobile_drawer_row.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
const URL_PATH = '/viewer/viewer.html?db=buildings/Duplex_extracted.db';
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };
const DESKTOP = { viewport: { width: 1400, height: 900 } };
const log = []; let fails = 0, judged = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
async function waitReady(page) {
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(1000);
    const ok = await page.evaluate(() => !!(window.APP && window.APP.guidMap && Object.keys(window.APP.guidMap).length > 0
      && window.APP.streaming === false && window._mainPillActions && window._mainPillActions.length > 0)).catch(() => false);
    if (ok) return true;
  }
  return false;
}
const up = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; }, sel);
const shownEl = (page, id) => page.evaluate(i => { const el = document.getElementById(i); if (!el || !el.isConnected || el.offsetWidth === 0) return false;
  const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }, id);
async function openDrawer(page, d) { await up(page, '#pill-' + d); await page.waitForTimeout(500); }
// real touch tap on a drawer row (scrolled into view first), found by its id
async function tapRow(page, rowId) {
  const pt = await page.evaluate(id => { const r = document.getElementById(id); if (!r) return null; r.scrollIntoView({ block: 'center' });
    const q = r.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }, rowId);
  if (!pt) return false; await page.waitForTimeout(150); await page.touchscreen.tap(pt[0], pt[1]); return true;
}
// where SET sits and what is on top there
const setProbe = page => page.evaluate(() => { const p = document.getElementById('walk-anchor-prompt'); if (!p) return null;
  const b = [...p.querySelectorAll('button')].find(x => !x.classList.contains('cancel')); if (!b) return null;
  const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, t = document.elementFromPoint(cx, cy);
  return { cx, cy, onTop: !!(t && (t === b || b.contains(t))), top: t ? (t.id || t.className || t.tagName) : null }; });

async function phoneArm(browser, port, query, tag) {
  const ctx = await browser.newContext(PHONE); const page = await ctx.newPage(); const cons = [];
  page.on('console', m => cons.push(m.text()));
  page.on('pageerror', e => S('  [pageerror] ' + String(e.message).slice(0, 200)));
  await page.goto('http://127.0.0.1:' + port + URL_PATH + query, { waitUntil: 'domcontentloaded' });
  if (!(await waitReady(page))) { await ctx.close(); return null; }
  await page.evaluate(() => { if (window.toggleMobilePill) window.toggleMobilePill(); }); await page.waitForTimeout(400);
  await openDrawer(page, 'navigate');
  const walkRow = await page.evaluate(() => !!document.getElementById('drawer-row-walk'));
  const mark = cons.length;
  const tapped = walkRow && await tapRow(page, 'drawer-row-walk');
  await page.waitForTimeout(900);
  const drawerShown = await shownEl(page, 'navigate-drawer-panel');
  const promptShown = await shownEl(page, 'walk-anchor-prompt');
  const probe = await setProbe(page);
  const lines = cons.slice(mark).filter(t => /^§(SHEET_(CLOSE|ROW_PROMPT|OPEN|REPLACE)|DRAWER_ROW)/.test(t));
  let tapSet = null;
  if (probe && promptShown && probe.onTop) {
    await page.touchscreen.tap(probe.cx, probe.cy); await page.waitForTimeout(1200);
    tapSet = { promptHidden: !(await shownEl(page, 'walk-anchor-prompt')), walkActive: await page.evaluate(() => !!window.APP.walkModeActive) };
  }
  await ctx.close();
  return { tag, walkRow, tapped, drawerShown, promptShown, probe, lines, tapSet };
}

// R3 sweep: every row of one drawer; a row is skipped only if its name says it would open a native file picker / destroy state
const IS_P = "window.__isP = el => !el.classList.contains('bim-panel') && !el.hasAttribute('popover') && el.offsetWidth > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).position === 'fixed' && !!el.querySelector('button,input,select,textarea,a[href]')";
const SKIP = /open|save|import|export|clear|delete|new\b|upload|download|share|print|record|capture|screenshot|bake|film/i;
async function sweep(browser, port, drawer) {
  let ctx = null, page = null, cons = [];
  async function fresh() {   // a new page; a row that navigates away (reload, link) costs one reload, not the sweep
    if (ctx) await ctx.close().catch(() => {});
    ctx = await browser.newContext(PHONE); page = await ctx.newPage(); cons = [];
    page.on('console', m => cons.push(m.text())); page.on('pageerror', () => {});
    await page.goto('http://127.0.0.1:' + port + URL_PATH, { waitUntil: 'domcontentloaded' });
    if (!(await waitReady(page))) return false;
    await page.evaluate(() => { if (window.toggleMobilePill) window.toggleMobilePill(); }); await page.waitForTimeout(400);
    return true;
  }
  if (!(await fresh())) { await ctx.close(); return null; }
  await openDrawer(page, drawer);
  const rows = await page.evaluate(d => [...document.getElementById(d + '-drawer-panel').querySelectorAll('.bim-drawer-row')].map(r => ({ id: r.id, name: (r.innerText || r.title || '').trim().split('\n')[0] })), drawer);
  const out = [];
  for (const r of rows) {
    if (!r.id || SKIP.test(r.name)) { out.push({ row: r.id || r.name, skipped: true, name: r.name }); continue; }
    const alive = await page.evaluate(() => !!(window.APP && window.APP.sheets)).catch(() => false);
    if (!alive && !(await fresh())) { out.push({ row: r.id, skipped: true, name: r.name + ' (page could not be restored)' }); continue; }
    // reset: close everything, hide stray prompts, reopen the drawer
    await page.evaluate(() => { const s = window.APP.sheets; let n = 0; while (s.open.length && n++ < 5) s.closeTop('other'); const wp = document.getElementById('walk-anchor-prompt'); if (wp) wp.style.display = 'none'; });
    await page.waitForTimeout(300); await openDrawer(page, drawer);
    await page.evaluate(IS_P + ';window.__pre = new Set(); [...document.body.children].filter(window.__isP).forEach(e => window.__pre.add(e));');
    const mark = cons.length;
    const ok = await tapRow(page, r.id); await page.waitForTimeout(1600);
    const res = await page.evaluate(IS_P + `;(() => { const pre = window.__pre || new Set(); const fresh = [...document.body.children].filter(e => window.__isP(e) && !pre.has(e));
      const covered = fresh.filter(p => { const q = p.getBoundingClientRect(), t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !(t && p.contains(t)); }).map(p => p.id || p.tagName);
      return { fresh: fresh.map(p => p.id || p.tagName), covered, drawerOpen: window.APP.sheets.open.map(s => s.el.id || (s.adapter && s.adapter.id)) }; })()`).catch(e => ({ fresh: [], covered: [], drawerOpen: [], navigated: true }));
    const ll = cons.slice(mark).filter(t => /^§SHEET_(ROW_PROMPT|REPLACE|CLOSE)/.test(t));
    out.push(Object.assign({ row: r.id, tapped: ok, lines: ll }, res));
  }
  await ctx.close(); return out;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--disable-gpu'] });
  let walkReached = false;

  S('── R1/R2: phone, Navigate drawer, tap the real Walk row ──');
  const a = await phoneArm(browser, port, '', 'fix');
  if (!a || !a.walkRow || !a.tapped) S('   ⚪ INCONCLUSIVE — Walk row not reachable: ' + JSON.stringify(a));
  else {
    walkReached = true; S('   · ' + JSON.stringify(a));
    verdict(!a.drawerShown, 'R1a Navigate drawer is closed after tapping Walk');
    verdict(a.promptShown, 'R1b Walk prompt is shown');
    verdict(!!(a.probe && a.probe.onTop), 'R1c SET is the top element at its own centre', JSON.stringify(a.probe));
    verdict(!!(a.tapSet && a.tapSet.promptHidden && a.tapSet.walkActive), 'R1d tapping SET works (prompt hides, walk mode active)', JSON.stringify(a.tapSet));
    verdict(a.lines.some(t => /^§SHEET_ROW_PROMPT row=drawer-row-walk prompt=walk-anchor-prompt closes=navigate-drawer-panel/.test(t)) &&
      a.lines.some(t => t === '§SHEET_CLOSE id=navigate-drawer-panel via=row-prompt'), 'R2 §SHEET_ROW_PROMPT + §SHEET_CLOSE via=row-prompt logged', JSON.stringify(a.lines));
  }

  S('\n── R4 RED control: ?sheetrow=0 (rule off) — the defect must be visible ──');
  const red = await phoneArm(browser, port, '&sheetrow=0', 'red');
  if (!red || !red.tapped) S('   ⚪ INCONCLUSIVE — red arm did not reach the Walk row');
  else {
    const reproduced = red.drawerShown && red.promptShown && red.probe && !red.probe.onTop;
    judged++; if (!reproduced) fails++;
    S('   ' + (reproduced ? '🟢 red control reproduced the defect (drawer open, SET covered by ' + red.probe.top + ')' : '🔴 red control did NOT reproduce the defect — R1 cannot fail') + ' — ' + JSON.stringify(red));
  }

  S('\n── R3: every row of the Navigate / Inspect / Camera-View drawers ──');
  let swept = 0;
  for (const d of ['navigate', 'inspect', 'camview']) {
    const rows = await sweep(browser, port, d);
    if (!rows) { S('   ⚪ ' + d + ' not swept (viewer not ready)'); continue; }
    for (const r of rows) {
      if (r.skipped) { S('   ⚪ ' + d + ' · ' + r.row + ' skipped (' + r.name + ')'); continue; }
      if (!r.tapped) { S('   ⚪ ' + d + ' · ' + r.row + ' not tappable'); continue; }
      swept++;
      verdict(r.covered.length === 0, 'R3 ' + d + ' · ' + r.row + ': no new prompt left under a sheet', 'fresh=' + JSON.stringify(r.fresh) + ' covered=' + JSON.stringify(r.covered) + (r.navigated ? ' (row navigated the page away)' : '') + ' open_after=' + JSON.stringify(r.drawerOpen) + ' log=' + JSON.stringify(r.lines));
    }
  }
  if (swept === 0) S('   ⚪ INCONCLUSIVE — no row swept');

  S('\n── R5 desktop control ──');
  { const ctx = await browser.newContext(DESKTOP); const page = await ctx.newPage(); const cons = [];
    page.on('console', m => cons.push(m.text()));
    await page.goto('http://127.0.0.1:' + port + URL_PATH, { waitUntil: 'domcontentloaded' });
    if (!(await waitReady(page))) S('   ⚪ INCONCLUSIVE — desktop not ready');
    else {
      await page.click('#mobile-trigger', { timeout: 5000 }).catch(() => {});
      await openDrawer(page, 'navigate');
      const rowIds = await page.evaluate(() => [...document.querySelectorAll('#navigate-drawer-panel .bim-drawer-row')].map(r => r.id));
      const fRow = rowIds.find(i => /find/.test(i));
      if (fRow) await page.evaluate(i => document.getElementById(i).dispatchEvent(new PointerEvent('pointerup', { bubbles: true })), fRow);
      await page.waitForTimeout(800);
      verdict(!!fRow && !cons.some(t => /^§SHEET_/.test(t) && !/^§SHEET_(TOPLAYER|READY)/.test(t)) && (await page.evaluate(() => window.APP.sheets.active === false)) && !rowIds.includes('drawer-row-walk'),
        'R5 desktop: manager inactive, a drawer row tap logs no §SHEET_ line, Walk is not a desktop row', 'rows=' + rowIds.length + ' tapped=' + fRow);
    }
    await ctx.close(); }

  await browser.close(); server.close();
  const outcome = !walkReached || judged <= 1 ? 'INCONCLUSIVE' : (fails === 0 ? 'PASS' : 'FAIL');
  S('\n§WITNESS_MOBILE_DRAWER_ROW ' + outcome + ' judged=' + judged + ' fails=' + fails + ' swept_rows=' + swept);
  fs.writeFileSync(path.join(__dirname, 'witness_mobile_drawer_row.log'), log.join('\n') + '\n');
  process.exit(outcome === 'PASS' ? 0 : 1);
})();
