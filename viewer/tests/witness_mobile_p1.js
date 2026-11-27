// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-MOBILE-P1 — bim-compiler prompts/MOBILE_PERF.md §P1 SPEC (owner GO 2026-11-26).
// Issues this witness proves or disproves, each on a real phone-emulated run of the Duplex:
//   I1 five disagreeing `_isMobile` copies  → one owner: `§CAPS phone=true` printed once, A.caps set.
//   I2 wrong-platform pills greyed (opacity .35, dead tap) → none greyed, none rendered.
//   I3 controls that do nothing on a phone (gi-preview row, Palette Still + MaxQ) → not shown.
//   I4 Settings (left:320) and the JSON editor (left:624) opened partly off a 412px phone → every
//      opened panel's rect is inside the viewport.
//   I5 18px close button, backdrop blur on phones → ✕ ≥ 44px, backdrop-filter none.
//   Desktop control: Settings still at left:320, Still/MaxQ/gi-preview still present (desktop unchanged).
//   RED control: the same phone run with A._fitPanelToViewport disabled AND ?sheetpop=0 (no §P6 bottom sheet) MUST fail I4 on Settings.
//   Also MEASURES (does not assume) whether Populate does anything on a phone — §P1_POPULATE.
// Verdict is INCONCLUSIVE, not PASS, when no panel was opened (vacuous).
// §-log first — READ viewer/tests/witness_mobile_p1.log after every run before any conclusion.
// Run:  node viewer/tests/witness_mobile_p1.js
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
const tap = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return false;
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; }, sel);
const rectOf = (page, id) => page.evaluate(i => { const el = document.getElementById(i); if (!el || el.style.display === 'none') return null;
  const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width) }; }, id);
const hide = (page, id) => page.evaluate(i => { const el = document.getElementById(i); if (el) el.style.display = 'none'; }, id);

// Opens Settings, the 3 drawers, Palette and one JSON editor; returns [{id, rect}] for every panel actually opened.
async function openPanels(page) {
  const out = [];
  async function one(pillId, panelId) {
    if (!(await tap(page, '#pill-' + pillId))) { S('   · pill-' + pillId + ' not present'); return; }
    await page.waitForTimeout(500);
    const r = await rectOf(page, panelId); if (r) out.push({ id: panelId, rect: r }); else S('   · ' + panelId + ' did not open');
  }
  await one('settings', 'settings-panel');
  // JSON editor: expand "Edit Project JSON" in Settings, tap its first ✎ row
  const opened = await page.evaluate(() => {
    const p = document.getElementById('settings-panel'); if (!p) return false;
    const hd = [...p.querySelectorAll('span')].find(s => s.textContent === 'Edit Project JSON'); if (!hd) return false;
    hd.closest('div').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const pen = [...p.querySelectorAll('span')].find(s => s.textContent === '✎'); if (!pen) return false;
    pen.parentElement.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true;
  });
  await page.waitForTimeout(2000);
  const jid = await page.evaluate(() => { const e = [...document.querySelectorAll('[id^="json-editor-"]')].find(x => x.style.display !== 'none'); return e ? e.id : null; });
  if (opened && jid) out.push({ id: jid, rect: await rectOf(page, jid) }); else S('   · JSON editor did not open (hub row tapped=' + opened + ')');
  for (const id of [jid, 'settings-panel']) if (id) await hide(page, id);
  for (const d of ['navigate', 'inspect', 'camview']) { await one(d, d + '-drawer-panel'); await hide(page, d + '-drawer-panel'); }
  await one('palette', 'sunglass-slider-panel');
  return out;
}

async function phoneRun(browser, port, redControl) {
  const ctx = await browser.newContext(PHONE); const page = await ctx.newPage(); const cons = [];
  page.on('console', m => { cons.push(m.text()); if (/§(CAPS|PANEL_FIT|PILL_HIDDEN|MAXQ_FAIL|P1_)/.test(m.text())) log.push('  [console] ' + m.text()); });
  page.on('pageerror', e => log.push('  [pageerror] ' + String(e.message).slice(0, 200)));
  // red: BOTH on-screen protections off — the P1 fitter AND the §P6 bottom sheet (?sheetpop=0), else I4 cannot fail
  await page.goto('http://127.0.0.1:' + port + URL_PATH + (redControl ? '&sheetpop=0' : ''), { waitUntil: 'domcontentloaded' });
  const ready = await waitReady(page);
  verdict(ready, 'Duplex loaded + pills built on the phone viewport');
  let res = null;
  if (ready) {
    if (redControl) await page.evaluate(() => { window.APP._fitPanelToViewport = function() {}; });
    await page.evaluate(() => { if (window.toggleMobilePill) window.toggleMobilePill(); });
    await page.waitForTimeout(300);
    const pills = await page.evaluate(() => [...document.querySelectorAll('button[id^="pill-"]')].map(b => ({ id: b.id.slice(5), grey: b.style.opacity === '0.35' })));
    // camview drawer rows (gi-preview must be absent): open, read row labels, close
    await tap(page, '#pill-camview'); await page.waitForTimeout(400);
    const camRows = await page.evaluate(() => { const p = document.getElementById('camview-drawer-panel'); return p ? p.innerText : ''; });
    await hide(page, 'camview-drawer-panel');
    const panels = await openPanels(page);
    // Palette's cinema row: which of Still / Populate / MaxQ are in the DOM
    const cinema = await page.evaluate(() => { const p = document.getElementById('sunglass-slider-panel'); if (!p) return null;
      const on = id => !!(document.getElementById(id) && p.contains(document.getElementById(id)));
      return { still: on('pal-still'), populate: on('pal-populate'), maxq: on('pal-maxq'), row: !!p.querySelector('.bim-slider-row') }; });
    const chrome = await page.evaluate(() => { const p = document.getElementById('sunglass-slider-panel') || document.querySelector('.bim-panel');
      const x = p && p.querySelector('.bim-panel-close'); const r = x ? x.getBoundingClientRect() : null; const cs = p ? getComputedStyle(p) : null;
      return { closeW: r ? Math.round(r.width) : null, closeH: r ? Math.round(r.height) : null, blur: cs ? (cs.backdropFilter || cs.webkitBackdropFilter) : null, panel: p ? p.id : null }; });
    // Populate evidence on the phone: its function must not exist (effects parts never built) — the reason it is hidden
    const pop = await page.evaluate(() => ({ togglePopulate: typeof window.APP.togglePopulate, composer: !!window.APP._composer }));
    S('   §P1_POPULATE phone togglePopulate=' + pop.togglePopulate + ' composer=' + pop.composer);
    res = { pills, camRows, panels, cinema, chrome, pop, caps: cons.filter(c => /^§CAPS /.test(c)), maxqFail: cons.filter(c => /§MAXQ_FAIL/.test(c)).length,
      vw: PHONE.viewport.width, vh: PHONE.viewport.height, appCaps: await page.evaluate(() => !!(window.APP.caps && window.APP.caps.phone)) };
  }
  await ctx.close();
  return res;
}
const inside = (r, vw, vh) => r && r.left >= 0 && r.right <= vw && r.top >= 0 && r.w > 0;

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  S('── PHONE 412×823 touch, Duplex ──');
  const ph = await phoneRun(browser, port, false);
  if (ph) {
    verdict(ph.caps.length === 1 && /phone=true/.test(ph.caps[0]) && ph.appCaps, 'I1 one capability owner', JSON.stringify(ph.caps) + ' A.caps.phone=' + ph.appCaps);
    const grey = ph.pills.filter(p => p.grey);
    verdict(ph.pills.length > 0 && grey.length === 0, 'I2 no greyed pills', 'shown=' + ph.pills.map(p => p.id).join(',') + ' greyed=' + grey.map(p => p.id).join(','));
    verdict(ph.camRows.length > 0 && !/GI Preview/.test(ph.camRows), 'I3 gi-preview row absent from Camera/View drawer', JSON.stringify(ph.camRows.replace(/\s+/g, ' ').slice(0, 160)));
    verdict(!!ph.cinema && !ph.cinema.still && !ph.cinema.maxq && !ph.cinema.populate, 'I3 Palette Still + Populate + MaxQ not shown', JSON.stringify(ph.cinema));
    verdict(ph.pop && ph.pop.togglePopulate === 'undefined', 'I3 evidence: Populate cannot run on a phone', JSON.stringify(ph.pop));
    if (ph.panels.length === 0) S('   ⚪ I4 INCONCLUSIVE — no panel opened');
    ph.panels.forEach(p => verdict(inside(p.rect, ph.vw, ph.vh), 'I4 ' + p.id + ' inside the viewport', JSON.stringify(p.rect) + ' vw=' + ph.vw));
    verdict(ph.panels.some(p => p.id === 'settings-panel') && ph.panels.some(p => /^json-editor-/.test(p.id)), 'I4 population includes Settings + JSON editor', ph.panels.map(p => p.id).join(','));
    verdict(ph.chrome.closeW >= 44 && ph.chrome.closeH >= 44, 'I5 close button ≥ 44px', JSON.stringify(ph.chrome));
    verdict(ph.chrome.blur === 'none' || ph.chrome.blur === '' , 'I5 no backdrop blur on phone panels', 'backdrop-filter=' + ph.chrome.blur);
  }

  S('\n── DESKTOP 1400×900 control (must be unchanged) ──');
  { const ctx = await browser.newContext(DESKTOP); const page = await ctx.newPage(); const dcons = [];
    page.on('console', m => dcons.push(m.text()));
    await page.goto('http://127.0.0.1:' + port + URL_PATH, { waitUntil: 'domcontentloaded' });
    const ready = await waitReady(page); verdict(ready, 'Duplex loaded on desktop');
    if (ready) {
      await tap(page, '#pill-settings'); await page.waitForTimeout(500);
      const r = await rectOf(page, 'settings-panel'); await hide(page, 'settings-panel');
      verdict(!!r && inside(r, 1400, 900) && dcons.filter(c => /§PANEL_FIT/.test(c)).length === 0 && dcons.some(c => /^§CAPS phone=false/.test(c)),
        'desktop: phone fit never runs (A._placePanel still owns placement), Settings on screen', JSON.stringify(r) + ' panel_fit=' + dcons.filter(c => /§PANEL_FIT/.test(c)).length);
      await tap(page, '#pill-camview'); await page.waitForTimeout(400);
      const rows = await page.evaluate(() => { const p = document.getElementById('camview-drawer-panel'); return p ? p.innerText : ''; });
      verdict(/GI Preview/.test(rows), 'desktop gi-preview row present');
      await hide(page, 'camview-drawer-panel');
      await tap(page, '#pill-palette'); await page.waitForTimeout(400);
      const c = await page.evaluate(() => { const p = document.getElementById('sunglass-slider-panel'); const on = id => !!(document.getElementById(id) && p.contains(document.getElementById(id)));
        return { still: on('pal-still'), populate: on('pal-populate'), maxq: on('pal-maxq') }; });
      verdict(c.still && c.maxq && c.populate, 'desktop Palette Still + Populate + MaxQ present', JSON.stringify(c));
      await page.evaluate(() => document.getElementById('pal-populate').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
      for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); if (!(await page.evaluate(() => !!window.APP._populateBusy))) break; }
      const dp = await page.evaluate(() => { const A = window.APP; return { active: !!(A.populateActive && A.populateActive()), busy: !!A._populateBusy, status: A.status ? A.status.textContent : '' }; });
      verdict(dp.active, 'desktop Populate runs', JSON.stringify(dp)); S('   §P1_POPULATE desktop active=' + dp.active + ' busy=' + dp.busy + ' status="' + dp.status + '"');
      const blur = await page.evaluate(() => getComputedStyle(document.getElementById('sunglass-slider-panel')).backdropFilter);
      verdict(blur && blur !== 'none', 'desktop panels keep backdrop blur', blur);
    }
    await ctx.close(); }

  S('\n── RED CONTROL: phone with A._fitPanelToViewport disabled + ?sheetpop=0 — Settings MUST be off-screen ──');
  const before = fails;
  const red = await phoneRun(browser, port, true);
  const st = red && red.panels.find(p => p.id === 'settings-panel');
  const redFired = !!st && !inside(st.rect, red.vw, red.vh);
  S('   ' + (redFired ? '🟢 red control went RED as required' : '🔴 red control did NOT go red — I4 cannot fail, witness is blind') + ' — settings=' + JSON.stringify(st && st.rect));
  fails = before + (redFired ? 0 : 1);   // the red run's own verdicts are expected failures, not counted
  judged++;

  await browser.close(); server.close();
  const outcome = judged <= 1 ? 'INCONCLUSIVE' : (fails === 0 ? 'PASS' : 'FAIL');
  S('\n§WITNESS_MOBILE_P1 ' + outcome + ' judged=' + judged + ' fails=' + fails);
  fs.writeFileSync(path.join(__dirname, 'witness_mobile_p1.log'), log.join('\n') + '\n');
  process.exit(outcome === 'PASS' ? 0 : 1);
})();
