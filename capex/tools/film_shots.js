// capex/tools/film_shots.js — stills for the add-on film (prompts/CAPEX_DASHBOARD.md §15). The REAL page, headless Chromium with software GL (no GPU lock), 1920x1080.
// Every value a still shows is ALSO read from the DOM and printed as §FILM_SHOT (the narration's numbers come from these lines, never from the picture).
// Usage (from the repo root, a static server on :PORT serving it): NODE_PATH=<bim-ootb>/node_modules node capex/tools/film_shots.js <outDir> <port>
//   expects capex/__film/{hhs_before.db,hhs_after.db,legacy_before.json,legacy_after.json} (git-ignored scratch copies) and capex/__film/cards/*.html
const fs = require('fs'), path = require('path'), puppeteer = require(path.join(process.env.HOME, 'bim-compiler/node_modules/puppeteer'));   // as capex/tests/witness_capex.js
const [out, port = '8766'] = process.argv.slice(2), BASE = 'http://localhost:' + port, TODAY = '2026-11-02', PROJECT = 'HHS_Office_Federated';   // one project, both sources (§15.1)
fs.mkdirSync(out, { recursive: true });
const log = (...a) => console.log(...a);
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--disable-gpu-sandbox'] });
  async function open(db, snap, src, hash) {
    const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });   // 1920x1080 pixels, text 1.5x for a film
    page.on('console', m => { const t = m.text(); if (/^§DASH_(SOURCE|TODAY)/.test(t)) log('  ' + t.slice(0, 200)); });
    await page.goto(`${BASE}/capex/index.html?today=${TODAY}&db=${encodeURIComponent(db)}&snapshot=${encodeURIComponent(snap)}${src ? '&project=' + PROJECT : ''}${hash || ''}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => (window.__capex && window.__capex.rendered) || document.querySelector('.nodata'), { timeout: 30000 }).catch(() => {});
    if (src) { await page.evaluate(s => { const e = document.getElementById('src'); e.value = s; e.dispatchEvent(new Event('change')); }, src); await new Promise(r => setTimeout(r, 1500)); }
    return page;
  }
  const tileText = (page, k) => page.evaluate(k => { const e = document.querySelector('[data-tile="' + k + '"]'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, k);
  async function shot(page, name, sel) {
    const f = path.join(out, name + '.png');
    if (sel) { const el = await page.$(sel); if (!el) { log('§FILM_SHOT ' + name + ' MISSING selector ' + sel); return; } await el.screenshot({ path: f }); } else await page.screenshot({ path: f });
    log('§FILM_SHOT ' + name + ' -> ' + f);
  }
  const F = '/capex/__film/';
  // 1 — no source: the page says so (no zeros, no green)
  let p = await open(F + 'none.db', F + 'none.json', null, '#dashboard'); log('§FILM_SHOT nodata view="' + (await p.evaluate(() => document.getElementById('view').textContent.replace(/\s+/g, ' ').trim().slice(0, 80))) + '"'); await shot(p, '01_nodata'); await p.close();
  // 3 — the dashboard from the test server (Source B), before the progress step; one tile close-up with its formula
  p = await open(F + 'hhs_before.db', F + 'legacy_before.json', 'legacy', '#dashboard');
  for (const k of ['total_projects', 'approved_budget', 'physical_spent', 'schedule']) log('§FILM_SHOT legacy_before ' + k + ' = ' + (await tileText(p, k)).slice(0, 220));
  await shot(p, '03_dashboard_legacy'); await shot(p, '03b_tile_budget', '[data-tile="approved_budget"]'); await p.close();
  // 5 — the HHS row in the Projects list, both sources
  for (const [src, tag] of [['sqlite', 'A'], ['legacy', 'B']]) {
    p = await open(F + 'hhs_before.db', F + 'legacy_before.json', src, '#projects');
    const row = await p.evaluate(() => { const r = [...document.querySelectorAll('tr')].find(t => /HHS_Office_Federated/.test(t.textContent)); if (!r) return null; r.id = '__hhsrow'; r.style.outline = '3px solid #2b6cb0'; return r.textContent.replace(/\s+/g, ' ').trim(); });
    log('§FILM_SHOT projects_' + tag + ' HHS row = ' + row);
    await shot(p, '05_projects_' + tag, 'table[data-tile]'); await p.close();   // the table only: the sidebar badge is system-wide, not this project
  }
  // 7 — Physical vs Spent, before and after the phase is completed, both sources
  for (const [db, snap, st] of [['hhs_before.db', 'legacy_before.json', 'before'], ['hhs_after.db', 'legacy_after.json', 'after']]) for (const [src, tag] of [['sqlite', 'A'], ['legacy', 'B']]) {
    p = await open(F + db, F + snap, src, '#dashboard');
    log('§FILM_SHOT physical_' + st + '_' + tag + ' = ' + (await tileText(p, 'physical_spent')).slice(0, 200));
    await shot(p, '07_physical_' + st + '_' + tag, '[data-tile="physical_spent"]'); await p.close();
  }
  // 2, 6, 8 — the cards
  for (const c of ['02_addon', '06_check', '08_end']) { p = await browser.newPage(); await p.setViewport({ width: 1920, height: 1080 }); await p.goto(`${BASE}/capex/tools/film_cards/${c}.html`, { waitUntil: 'networkidle0' }); await shot(p, c); await p.close(); }
  await browser.close();
  log('§FILM_SHOTS_DONE ' + fs.readdirSync(out).filter(f => f.endsWith('.png')).length + ' stills');
})().catch(e => { console.log('§FILM_SHOTS FAIL ' + (e && e.stack || e)); process.exit(1); });
