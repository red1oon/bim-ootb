// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-MOBILE-P2 — bim-compiler prompts/MOBILE_PERF.md §P2 SPEC (owner GO 2026-11-27 "Proceed").
// Issues this witness proves or disproves on a real phone-emulated run of the Duplex:
//   J1 drawers / panels on a phone closed ONLY by a small ✕ → every sheet closes by Android Back, a tap on the model,
//      a swipe down, and its ✕ (each where the sheet supports it), with the matching `§SHEET_CLOSE via=` line.
//   J2 Android Back left the viewer while a panel was open → Back closes the sheet and the page stays.
//   J3 a tap on the model that closes a sheet must NOT also select (no info card) — judged only on points where a
//      second tap with no sheet open DOES select (else the sample is VACUOUS and says so).
//   J4 panels piled up (7 systems, no manager) → opening one sheet closes the other (`§SHEET_REPLACE`).
//   J5 history leak: after every close `history.state` is not our `bimSheet` entry.
//   Desktop control: no manager — two panels stay open together, a canvas tap leaves them, no `§SHEET_` line.
//   RED control: phone with A.sheets.disable() — Back must FAIL to close Settings.
// Population = the 10 sheets measured by the §P2 survey (MOBILE_PERF.md §P2 SPEC table). INCONCLUSIVE if none opened.
// §-log first — READ viewer/tests/witness_mobile_p2.log after every run before any conclusion.
// Run:  node viewer/tests/witness_mobile_p2.js
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

const log = []; let fails = 0, judged = 0, vacuous = 0;
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
const row = (page, drawer, prefix) => page.evaluate(([d, p]) => { const pn = document.getElementById(d + '-drawer-panel'); if (!pn) return false;
  const r = [...pn.querySelectorAll('button')].find(b => (b.innerText || '').trim().startsWith(p)); if (!r) return false;
  r.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; }, [drawer, prefix]);
// the element a sheet name refers to (adapter names → their element)
const ELQ = { 'cmd-palette': "document.getElementById('cmd-palette')", 'whole-hist-panel': "document.getElementById('whole-hist-panel')",
  'clash-matrix': 'window.APP._clashMatrixDiv' };
const elExpr = n => ELQ[n] || ("document.getElementById('" + n + "')");
const shown = (page, n) => page.evaluate(x => { const el = eval(x); if (!el || !el.isConnected || el.offsetWidth === 0) return false;
  const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }, elExpr(n));

// how to open each sheet on a phone (from the §P2 survey); returns the sheet's name as §SHEET_ logs it
const OPENERS = {
  'navigate-drawer-panel': async p => up(p, '#pill-navigate'),
  'inspect-drawer-panel': async p => up(p, '#pill-inspect'),
  'camview-drawer-panel': async p => up(p, '#pill-camview'),
  'sunglass-slider-panel': async p => up(p, '#pill-palette'),
  'settings-panel': async p => up(p, '#pill-settings'),
  'find-panel': async p => { await up(p, '#pill-navigate'); await p.waitForTimeout(300); return row(p, 'navigate', 'Find'); },
  'whole-hist-panel': async p => { await up(p, '#pill-navigate'); await p.waitForTimeout(300); return row(p, 'navigate', 'World History'); },
  'clash-matrix': async p => { await up(p, '#pill-inspect'); await p.waitForTimeout(300); return row(p, 'inspect', 'Clash Matrix'); },
  'cmd-palette': async p => up(p, '#pill-help'),
  'json-editor-*': async p => { await up(p, '#pill-settings'); await p.waitForTimeout(400);
    return p.evaluate(() => { const s = document.getElementById('settings-panel'); if (!s) return false;
      const hd = [...s.querySelectorAll('span')].find(x => x.textContent === 'Edit Project JSON'); if (!hd) return false;
      hd.closest('div').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      const pen = [...s.querySelectorAll('span')].find(x => x.textContent === '✎'); if (!pen) return false;
      pen.parentElement.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; }); },
};
async function resolveName(page, key) {
  if (key !== 'json-editor-*') return key;
  return page.evaluate(() => { const e = [...document.querySelectorAll('[id^="json-editor-"]')].find(x => x.style.display !== 'none'); return e ? e.id : 'json-editor-?'; });
}
async function clearAll(page) {
  await page.evaluate(() => { if (window.APP.sheets && window.APP.sheets.active) { let n = 0; while (window.APP.sheets.open.length && n++ < 5) window.APP.sheets.closeTop('other'); } });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const ip = document.getElementById('info-panel'); if (ip) ip.style.display = 'none'; });
}
const PTS = []; for (let y = 160; y <= 760; y += 60) for (let x = 40; x <= 380; x += 60) PTS.push([x, y]);   // 11×6 grid
async function canvasPoint(page, pts) {   // a viewport point where the canvas (not a panel) is on top
  return page.evaluate(pts => { const c = window.APP.canvas; return pts.find(([x, y]) => document.elementFromPoint(x, y) === c) || null; }, pts || PTS);
}
async function swipePoint(page, n) {   // a non-control point inside the sheet, near its top
  return page.evaluate(x => { const el = eval(x); const r = el.getBoundingClientRect();
    for (const dy of [14, 24, 36, 50, 70]) for (const fx of [0.5, 0.3, 0.7, 0.15]) {
      const px = r.left + r.width * fx, py = r.top + dy, t = document.elementFromPoint(px, py);
      if (t && el.contains(t) && !t.closest('button,input,select,textarea,a,[role=slider]')) return [px, py]; }
    return null; }, elExpr(n));
}

async function phoneRun(browser, port, red) {
  const ctx = await browser.newContext(PHONE); const page = await ctx.newPage(); const cons = [];
  page.on('console', m => { const t = m.text(); cons.push(t); if (/§(SHEET|CAPS)/.test(t) && !/^§SHEET_(OPEN|HIST)/.test(t)) log.push('  [console] ' + t); });
  page.on('pageerror', e => log.push('  [pageerror] ' + String(e.message).slice(0, 200) + ' @ ' + String(e.stack || '').split('\n').slice(1, 4).join(' | ').slice(0, 400)));
  await page.goto('http://127.0.0.1:' + port + URL_PATH, { waitUntil: 'domcontentloaded' });
  const ready = await waitReady(page);
  verdict(ready, (red ? '[red] ' : '') + 'Duplex loaded on the phone viewport');
  if (!ready) { await ctx.close(); return null; }
  await page.evaluate(() => { if (window.toggleMobilePill) window.toggleMobilePill(); });
  await page.waitForTimeout(300);
  const lines = from => cons.slice(from).filter(t => /^§SHEET_/.test(t));
  const modelPts = [];
  if (!red) { for (const [x, y] of PTS) { if (modelPts.length >= 12) break; const mk = cons.length; await page.mouse.click(x, y); await page.waitForTimeout(500);
    if (cons.slice(mk).some(t => /^§PICK hits=[1-9]/.test(t))) modelPts.push([x, y]); await page.evaluate(() => { const ip = document.getElementById('info-panel'); if (ip) ip.style.display = 'none'; }); }
    S('   · model points (a tap there selects): ' + JSON.stringify(modelPts)); }
  const pageUrl = page.url();

  if (red) {
    await page.evaluate(() => window.APP.sheets.disable());
    await OPENERS['settings-panel'](page); await page.waitForTimeout(500);
    await page.goBack({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(600);
    const stayed = page.url() === pageUrl, closed = stayed && !(await shown(page, 'settings-panel').catch(() => true));
    await ctx.close();
    return { redBackWorked: stayed && closed };
  }

  // J1/J2/J3/J5 — every sheet × every closer it supports
  let opened = 0;
  for (const key of Object.keys(OPENERS)) {
    for (const closer of ['back', 'canvas', 'swipe', 'x']) {
      await clearAll(page);
      const mark = cons.length;
      await OPENERS[key](page); await page.waitForTimeout(key === 'clash-matrix' ? 2500 : 700);
      const n = await resolveName(page, key);
      if (!(await shown(page, n))) { S('   ⚪ ' + n + ' did not open (' + closer + ') — not judged'); continue; }
      opened++;
      const pushed = await page.evaluate(() => !!(history.state && history.state.bimSheet));
      let how = closer, pt = null;
      if (closer === 'back') { await page.goBack({ timeout: 3000 }).catch(() => {}); }
      else if (closer === 'canvas') {
        pt = await canvasPoint(page, modelPts.concat(PTS));
        if (!pt) { S('   ⚪ ' + n + ' covers the whole canvas — canvas tap N/A'); continue; }
        await page.mouse.click(pt[0], pt[1]);
      } else if (closer === 'swipe') {
        const sp = await swipePoint(page, n);
        if (!sp) { S('   ⚪ ' + n + ' has no free top area to swipe — swipe N/A'); continue; }
        await page.mouse.move(sp[0], sp[1]); await page.mouse.down(); await page.mouse.move(sp[0], sp[1] + 50, { steps: 4 });
        await page.mouse.move(sp[0], sp[1] + 110, { steps: 4 }); await page.mouse.up();
      } else {
        const xr = await page.evaluate(x => { const el = eval(x); const b = el && el.querySelector('.bim-panel-close, [id$="-close"], [aria-label="Close"], [title="Close"]');
          if (!b) return null; const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, t = document.elementFromPoint(cx, cy);
          return [cx, cy, !!(t && (t === b || b.contains(t))), t ? (t.id || t.tagName) : null]; }, elExpr(n));
        if (!xr) { S('   ⚪ ' + n + ' has no close control — ✕ N/A (Back/canvas/swipe still judged)'); continue; }
        verdict(xr[2], 'J6 ' + n + ': its ✕ is on top (a finger can reach it)', 'topmost_at_x=' + xr[3]);
        await page.mouse.click(xr[0], xr[1]);   // a real tap: pointerup AND click, as a finger gives
      }
      await page.waitForTimeout(1000);
      const still = await shown(page, n), stayed = page.url() === pageUrl;
      const diag = await page.evaluate(() => JSON.stringify({ open: window.APP.sheets.open.map(s => s.el.id || (s.adapter && s.adapter.id)) })).catch(() => '');
      const hist = await page.evaluate(() => !!(history.state && history.state.bimSheet));
      const want = closer === 'x' ? 'other' : closer;
      const got = lines(mark).filter(t => t.startsWith('§SHEET_CLOSE id=' + n + ' '));
      verdict(pushed && !still && stayed && !hist && got.some(t => t.endsWith('via=' + want)),
        'J1 ' + n + ' closes by ' + how, 'pushed=' + pushed + ' still=' + still + ' stayed=' + stayed + ' hist_left=' + hist + ' log=' + JSON.stringify(got) + (got.length ? '' : ' diag=' + diag + ' all=' + JSON.stringify(lines(mark))));
      if (closer === 'canvas') {
        const hitLines = from => cons.slice(from).filter(t => /^§PICK hits=[1-9]/.test(t)).length;
        const picked = hitLines(mark) > 0;
        // control: the same point with no sheet open must pick something, else J3 is vacuous here
        const m2 = cons.length; await page.mouse.click(pt[0], pt[1]); await page.waitForTimeout(900);
        const ctl = hitLines(m2) > 0;
        if (!ctl) { vacuous++; S('   ⚪ J3 VACUOUS at ' + pt + ' for ' + n + ' — a tap there picks nothing even without a sheet'); }
        else verdict(!picked, 'J3 ' + n + ': the closing tap did not pick', 'pick_on_closing_tap=' + picked + ' control_tap_picks=' + ctl);
      }
    }
  }
  if (opened === 0) S('   ⚪ INCONCLUSIVE — no sheet opened');

  // J4 — one at a time
  await clearAll(page);
  let mark = cons.length;
  await OPENERS['settings-panel'](page); await page.waitForTimeout(600);
  await OPENERS['navigate-drawer-panel'](page); await page.waitForTimeout(700);
  verdict(!(await shown(page, 'settings-panel')) && (await shown(page, 'navigate-drawer-panel')) &&
    lines(mark).some(t => t.startsWith('§SHEET_REPLACE closed=settings-panel by=navigate-drawer-panel')),
    'J4 opening Navigate closes Settings', JSON.stringify(lines(mark)));
  await clearAll(page);
  verdict(!(await page.evaluate(() => !!(history.state && history.state.bimSheet))), 'J5 no history entry left after the run');
  await ctx.close();
  return { opened };
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  S('── PHONE 412×823 touch, Duplex — every sheet × every closer ──');
  await phoneRun(browser, port, false);

  S('\n── DESKTOP 1400×900 control (no manager) ──');
  { const ctx = await browser.newContext(DESKTOP); const page = await ctx.newPage(); const cons = [];
    page.on('console', m => cons.push(m.text()));
    await page.goto('http://127.0.0.1:' + port + URL_PATH, { waitUntil: 'domcontentloaded' });
    const ready = await waitReady(page); verdict(ready, 'Duplex loaded on desktop');
    if (ready) {
      await page.click('#mobile-trigger', { timeout: 5000 }).catch(() => {});
      await up(page, '#pill-settings'); await page.waitForTimeout(500); await up(page, '#pill-navigate'); await page.waitForTimeout(500);
      const both = (await shown(page, 'settings-panel')) && (await shown(page, 'navigate-drawer-panel'));
      verdict(both, 'desktop: Settings and Navigate stay open together');
      const pt = await canvasPoint(page);
      if (pt) { await page.mouse.click(pt[0], pt[1]); await page.waitForTimeout(600); }
      verdict(!!pt && (await shown(page, 'settings-panel')) && (await shown(page, 'navigate-drawer-panel')), 'desktop: a canvas tap leaves them open', 'pt=' + pt);
      verdict(!cons.some(t => /^§SHEET_(OPEN|CLOSE|REPLACE|HIST)/.test(t)) && (await page.evaluate(() => window.APP.sheets && window.APP.sheets.active === false)),
        'desktop: sheet manager inactive (no §SHEET_ line)');
    }
    await ctx.close(); }

  S('\n── RED CONTROL: phone with A.sheets.disable() — Back must NOT close Settings ──');
  const before = fails, jb = judged;
  const red = await phoneRun(browser, port, true);
  fails = before; judged = jb;   // the red run's own verdicts are expected, not counted
  const redFired = !!red && red.redBackWorked === false;
  judged++; if (!redFired) fails++;
  S('   ' + (redFired ? '🟢 red control went RED as required (Back did not close Settings)' : '🔴 red control did NOT go red — J2 cannot fail, witness is blind') + ' — ' + JSON.stringify(red));

  await browser.close(); server.close();
  const outcome = judged <= 1 ? 'INCONCLUSIVE' : (fails === 0 ? 'PASS' : 'FAIL');
  S('\n§WITNESS_MOBILE_P2 ' + outcome + ' judged=' + judged + ' fails=' + fails + ' vacuous=' + vacuous);
  fs.writeFileSync(path.join(__dirname, 'witness_mobile_p2.log'), log.join('\n') + '\n');
  process.exit(outcome === 'PASS' ? 0 : 1);
})();
