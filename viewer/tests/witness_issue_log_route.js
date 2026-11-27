// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-ISSUE-LOG-ROUTE — two gaps a film recording of the real UI found (2026-11-27), Send to HQ / Get from team on a phone.
// Issues this witness proves or disproves (real touch taps, phone profile 412x823, Duplex):
//   I1 a phone user had no route to the Issue Log (it was reachable only through Help, below the fold, with Help left open over it).
//      Now: FAB -> Inspect pill -> real tap on the "Issues" row (#drawer-row-issues) -> #issues-panel is active, it is the TOP element at
//      its own centre and at the centre of #issues-send-hq, the Inspect drawer is closed, EXACTLY ONE sheet is open (the issues panel,
//      through the manager's adapter), and it closes by swipe-down and by Android Back with the matching §SHEET_CLOSE via= line.
//   I2 RED control: the row removed (= origin/main behaviour: no route) -> the same I1 check must FAIL. If it passes, I1 cannot fail.
//   I3 replaying a team walk left the history bar HIDDEN (the user had to find key Z). Now the bar is opened by the bar's own open():
//      tap the real .issue-walk-row -> #universal-hist-btns visible (rect height > 0, inside the viewport) and §HQ_REPLAY ends bar=open;
//      a bar that was ALREADY open stays open (open() is idempotent, no toggle).
//   I3r RED control: HistoryBar.open stubbed to a no-op (= the pre-fix replay) -> the visibility check must FAIL.
//   I4 desktop: tapping the new drawer row logs no §SHEET_ line (manager inactive) and key `i` still opens the Issue Log.
// Verdict is INCONCLUSIVE (never PASS) when the row / the walk row was not reachable. §-log first: READ witness_issue_log_route.log.
// Run:  node viewer/tests/witness_issue_log_route.js
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
      && window.APP.streaming === false && window._mainPillActions && window._mainPillActions.length > 0 && window.HistoryBar)).catch(() => false);
    if (ok) return true;
  }
  return false;
}
async function newPhone(browser, port, query) {
  const ctx = await browser.newContext(PHONE); const page = await ctx.newPage(); const cons = [];
  page.on('console', m => cons.push(m.text()));
  page.on('pageerror', e => S('  [pageerror] ' + String(e.message).slice(0, 200)));
  await page.goto('http://127.0.0.1:' + port + URL_PATH + (query || ''), { waitUntil: 'domcontentloaded' });
  const ready = await waitReady(page);
  return { ctx, page, cons, ready };
}
// a real touch tap on an element's centre (scrolled into view first)
async function tapEl(page, sel) {
  const pt = await page.evaluate(s => { const r = document.querySelector(s); if (!r || !r.offsetWidth) return null; r.scrollIntoView({ block: 'center' });
    const q = r.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }, sel);
  if (!pt) return false; await page.waitForTimeout(150); await page.touchscreen.tap(pt[0], pt[1]); return true;
}
const shown = (page, id) => page.evaluate(i => { const el = document.getElementById(i); if (!el || !el.isConnected || el.offsetWidth === 0) return false;
  const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }, id);
// FAB -> Inspect pill by real taps; then the Issues row by a real tap (returns false when the row does not exist)
async function routeToIssueLog(page) {
  const railUp = await page.evaluate(() => { const p = document.getElementById('pill-inspect'); return !!(p && p.offsetWidth); });   // the FAB toggles: tap it only when the rail is down
  const fab = railUp || await tapEl(page, '#mobile-trigger'); await page.waitForTimeout(500);
  const pill = fab && await tapEl(page, '#pill-inspect'); await page.waitForTimeout(500);
  const row = pill && await tapEl(page, '#drawer-row-issues'); await page.waitForTimeout(1000);
  return { fab, pill, row };
}
// top-element probe at the centre of a selector
const topAt = (page, sel, within) => page.evaluate(([s, w]) => { const b = document.querySelector(s); if (!b || !b.offsetWidth) return { found: false };
  const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, t = document.elementFromPoint(cx, cy), host = document.querySelector(w);
  return { found: true, cx: Math.round(cx), cy: Math.round(cy), onTop: !!(t && host && host.contains(t)), top: t ? (t.id || t.className || t.tagName) : null }; }, [sel, within]);
async function i1check(page) {
  const o = await page.evaluate(() => ({ active: document.getElementById('issues-panel').classList.contains('active'),
    openSheets: window.APP.sheets.open.map(s => s.el.id || (s.adapter && s.adapter.id)) }));
  const drawer = await shown(page, 'inspect-drawer-panel');
  const self = await topAt(page, '#issues-panel', '#issues-panel'), send = await topAt(page, '#issues-send-hq', '#issues-send-hq');
  return { active: o.active, openSheets: o.openSheets, drawerOpen: drawer, self, send,
    ok: o.active && !drawer && o.openSheets.length === 1 && o.openSheets[0] === 'issues-panel' && self.onTop && send.onTop };
}

// the team walk is written straight into the HQ browser's own store (the record hq_view builds through the folder relay): one paired
// device + cfg + viewer_walks, exactly the keys A._renderTeamRows / A.replayTeamWalk read
const KID = 'a1b2c3d4e5f60718', CODE = 'A1B2-C3D4';
const seedWalk = page => page.evaluate(([kid, code]) => new Promise((res, rej) => { const r = indexedDB.open('comm_phone', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'), st = t.objectStore('kv');
    st.put({ kid: kid }, 'device'); st.put({ space: 'witness-space' }, 'cfg');
    const walk = []; for (let k = 0; k < 5; k++) walk.push({ label: 'step ' + (k + 1), ref: { step: k + 1 }, viewState: { cam: { p: [k, 2, 1.6], t: [k, 3, 1.6] } } });
    const o = {}; o[kid] = { code: code, made_at: Date.now(), drop: 'witness-drop-1', building: 'Duplex', walk: walk }; st.put(o, 'viewer_walks');
    t.oncomplete = res; t.onerror = rej; }; r.onerror = rej; }), [KID, CODE]);
const barState = page => page.evaluate(() => { const b = document.getElementById('universal-hist-btns');
  if (!b) return { exists: false, visible: false };
  const r = b.getBoundingClientRect(), cs = getComputedStyle(b), vw = innerWidth, vh = innerHeight;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2, t = document.elementFromPoint(cx, cy);
  return { exists: true, display: cs.display, h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top), bottom: Math.round(r.bottom),
    inViewport: r.height > 0 && r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw,
    visible: cs.display !== 'none' && r.height > 0 && r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw,
    onTop: !!(t && b.contains(t)), coveredBy: t && !b.contains(t) ? (t.id || t.className || t.tagName) : null }; });

async function replayArm(browser, port, mode) {   // mode: 'fix' | 'already' | 'red'
  const base = await newPhone(browser, port, '&pipe=' + encodeURIComponent('http://127.0.0.1:' + port + '/pipe'));
  if (!base.ready) { await base.ctx.close(); return null; }
  const { page, cons } = base;
  await seedWalk(page);
  if (mode === 'red') await page.evaluate(() => { window.HistoryBar.open = function () { /* pre-fix: replay never opens the bar */ }; });
  if (mode === 'already') await page.evaluate(() => { window.UniversalHistory.open(); });
  await page.waitForTimeout(300);
  const before = await barState(page);
  // open the Issue Log the way a phone user does, then tap the real walk row
  const route = await routeToIssueLog(page);
  const mark = cons.length;
  const rowTapped = await tapEl(page, '#issues-list .issue-walk-row[data-kid="' + KID + '"]');
  let line = ''; for (let i = 0; i < 30 && !line; i++) { await page.waitForTimeout(250); line = cons.slice(mark).find(t => /^§HQ_REPLAY /.test(t)) || ''; }
  await page.waitForTimeout(500);
  const after = await barState(page);
  const entries = await page.evaluate(code => window.UniversalHistory.list().filter(e => String(e.label).indexOf(code + ' · ') === 0).length, CODE);
  const sheets = await page.evaluate(() => window.APP.sheets.open.map(s => s.el.id || (s.adapter && s.adapter.id)));
  await base.ctx.close();
  return { mode, before, route, rowTapped, line, after, entries, sheets };
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--disable-gpu'] });
  let reached = false, replayReached = false;

  S('── I1: phone, FAB -> Inspect -> tap the real Issues row ──');
  const a = await newPhone(browser, port);
  if (!a.ready) S('   ⚪ INCONCLUSIVE — phone viewer not ready');
  else {
    const mark = a.cons.length, route = await routeToIssueLog(a.page);
    const c = await i1check(a.page);
    const lines = a.cons.slice(mark).filter(t => /^§(SHEET_(OPEN|CLOSE|REPLACE|ROW_PROMPT|HIST)|DRAWER_ROW)/.test(t));
    S('   · route=' + JSON.stringify(route) + ' check=' + JSON.stringify(c) + ' log=' + JSON.stringify(lines));
    if (!route.row) S('   ⚪ INCONCLUSIVE — the Issues row is not reachable by taps: ' + JSON.stringify(route));
    else {
      reached = true;
      verdict(c.ok, 'I1a Issue Log is the ONE open sheet, on top at its own centre and at #issues-send-hq, drawer closed', JSON.stringify(c));
      verdict(lines.some(t => t === '§DRAWER_ROW action=issues') && lines.some(t => /^§SHEET_OPEN id=issues-panel /.test(t)), 'I1b §DRAWER_ROW action=issues + §SHEET_OPEN id=issues-panel logged', JSON.stringify(lines));
      // swipe down from the sheet's free strip (P2's approach: real pointer, 110 px down)
      const sp = await a.page.evaluate(() => { const el = document.getElementById('issues-panel'), r = el.getBoundingClientRect();
        for (const dy of [14, 24, 36, 50]) for (const fx of [0.5, 0.3, 0.7, 0.15]) { const px = r.left + r.width * fx, py = r.top + dy, t = document.elementFromPoint(px, py);
          if (t && el.contains(t) && !t.closest('button,input,select,textarea,a')) return [px, py]; } return null; });
      const m2 = a.cons.length;
      if (!sp) verdict(false, 'I1c swipe-down closes the Issue Log', 'no free swipe strip found');
      else {
        await a.page.mouse.move(sp[0], sp[1]); await a.page.mouse.down(); await a.page.mouse.move(sp[0], sp[1] + 50, { steps: 4 });
        await a.page.mouse.move(sp[0], sp[1] + 110, { steps: 4 }); await a.page.mouse.up(); await a.page.waitForTimeout(900);
        const l2 = a.cons.slice(m2).filter(t => /^§SHEET_CLOSE id=issues-panel /.test(t));
        verdict(!(await shown(a.page, 'issues-panel')) && l2.some(t => /via=swipe/.test(t)), 'I1c swipe-down closes the Issue Log (§SHEET_CLOSE via=swipe)', JSON.stringify(l2));
      }
      // Android Back: open again through the same row, then history back
      const route2 = await routeToIssueLog(a.page); const m3 = a.cons.length;
      const c2 = await i1check(a.page);
      await a.page.goBack({ timeout: 3000 }).catch(() => {}); await a.page.waitForTimeout(900);
      const l3 = a.cons.slice(m3).filter(t => /^§SHEET_CLOSE id=issues-panel /.test(t));
      verdict(route2.row && c2.ok && !(await shown(a.page, 'issues-panel')) && l3.some(t => /via=back/.test(t)), 'I1d reopened by the row, Android Back closes it (§SHEET_CLOSE via=back)', JSON.stringify({ route2, ok: c2.ok, l3 }));
    }
  }
  if (a.ctx) await a.ctx.close();

  S('\n── I2 RED control: row removed (= origin/main: no route) — the I1 check must FAIL ──');
  const b = await newPhone(browser, port);
  if (!b.ready) S('   ⚪ INCONCLUSIVE — red arm not ready');
  else {
    await b.page.evaluate(() => { const r = document.getElementById('drawer-row-issues'); if (r) r.remove(); });   // no-op until the drawer is built; removed again after it opens
    await tapEl(b.page, '#mobile-trigger'); await b.page.waitForTimeout(500); await tapEl(b.page, '#pill-inspect'); await b.page.waitForTimeout(500);
    const had = await b.page.evaluate(() => { const r = document.getElementById('drawer-row-issues'); if (r) r.remove(); return !!r; });
    const row = await tapEl(b.page, '#drawer-row-issues'); await b.page.waitForTimeout(900);
    const c = await i1check(b.page);
    judged++; const red = !row && !c.ok; if (!red) fails++;
    S('   ' + (red ? '🟢 red control went RED as required (no row, Issue Log not opened, check FAILED)' : '🔴 red control did NOT go red — I1 cannot fail') + ' — row_was_there=' + had + ' tapped=' + row + ' ' + JSON.stringify(c));
    await b.ctx.close();
  }

  S('\n── I3: HQ phone replays a team walk: the history bar must be open ──');
  const fix = await replayArm(browser, port, 'fix');
  if (!fix || !fix.rowTapped) S('   ⚪ INCONCLUSIVE — walk row not reachable: ' + JSON.stringify(fix));
  else {
    replayReached = true; S('   · ' + JSON.stringify(fix));
    verdict(fix.before.exists === false || !fix.before.visible, 'I3a before the tap the bar is NOT visible (the defect precondition)', JSON.stringify(fix.before));
    verdict(fix.after.visible && fix.after.h > 0 && /^§HQ_REPLAY kid=\S+ points=5 from=A1B2-C3D4 bar=open$/.test(fix.line), 'I3b after the tap the bar is visible inside the viewport and the log ends bar=open', JSON.stringify(fix.after) + ' ' + fix.line);
    verdict(fix.after.onTop && fix.sheets.length === 0, 'I3c the bar is not covered: the Issue Log sheet stepped aside (top element at the bar\'s centre is the bar, no sheet open)', JSON.stringify(fix.after) + ' sheets=' + JSON.stringify(fix.sheets));
    verdict(fix.entries === 5, 'I3d the 5 walk points are on the bar', 'entries=' + fix.entries);
  }
  const already = await replayArm(browser, port, 'already');
  if (!already || !already.rowTapped) S('   ⚪ INCONCLUSIVE — already-open arm: walk row not reachable');
  else verdict(already.before.visible && already.after.visible && / bar=open$/.test(already.line), 'I3e a bar that was already open stays open (not toggled shut)', 'before=' + JSON.stringify(already.before) + ' after=' + JSON.stringify(already.after) + ' ' + already.line);
  const red3 = await replayArm(browser, port, 'red');
  if (!red3 || !red3.rowTapped) S('   ⚪ INCONCLUSIVE — I3r red arm: walk row not reachable');
  else { judged++; const red = !red3.after.visible && !/ bar=open$/.test(red3.line); if (!red) fails++;
    S('   ' + (red ? '🟢 I3r red control went RED as required (open() no-op -> bar stays hidden, log not bar=open)' : '🔴 I3r red control did NOT go red — I3b cannot fail') + ' — ' + JSON.stringify(red3.after) + ' ' + red3.line); }

  S('\n── I4 desktop ──');
  { const ctx = await browser.newContext(DESKTOP); const page = await ctx.newPage(); const cons = [];
    page.on('console', m => cons.push(m.text()));
    await page.goto('http://127.0.0.1:' + port + URL_PATH, { waitUntil: 'domcontentloaded' });
    if (!(await waitReady(page))) S('   ⚪ INCONCLUSIVE — desktop not ready');
    else {
      await page.keyboard.press('i'); await page.waitForTimeout(600);
      const keyOpen = await page.evaluate(() => document.getElementById('issues-panel').classList.contains('active'));
      await page.keyboard.press('i'); await page.waitForTimeout(400);
      await page.click('#mobile-trigger', { timeout: 5000 }).catch(() => {});
      await page.evaluate(() => document.querySelector('#pill-inspect').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))); await page.waitForTimeout(500);
      const hasRow = await page.evaluate(() => !!document.getElementById('drawer-row-issues'));
      const mark = cons.length;
      if (hasRow) await page.evaluate(() => document.getElementById('drawer-row-issues').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
      await page.waitForTimeout(700);
      const rowOpen = await page.evaluate(() => document.getElementById('issues-panel').classList.contains('active'));
      const sheetLines = cons.slice(mark).filter(t => /^§SHEET_/.test(t));
      verdict(keyOpen && sheetLines.length === 0 && (await page.evaluate(() => window.APP.sheets.active === false)), 'I4 desktop: key i opens the Issue Log; manager inactive; a row tap logs no §SHEET_ line',
        'key_i_opens=' + keyOpen + ' desktop_row_present=' + hasRow + ' row_opens=' + rowOpen + ' sheet_lines=' + JSON.stringify(sheetLines)); }
    await ctx.close(); }

  await browser.close(); server.close();
  const outcome = !reached || !replayReached || judged <= 1 ? 'INCONCLUSIVE' : (fails === 0 ? 'PASS' : 'FAIL');
  S('\n§WITNESS_ISSUE_LOG_ROUTE ' + outcome + ' judged=' + judged + ' fails=' + fails);
  fs.writeFileSync(path.join(__dirname, 'witness_issue_log_route.log'), log.join('\n') + '\n');
  process.exit(outcome === 'PASS' ? 0 : 1);
})();
