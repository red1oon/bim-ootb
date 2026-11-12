// capex/tools/film_seq_shots.js — stills for the SEQUEL film (prompts/CAPEX_DASHBOARD.md §5.37). The REAL page, headless Chromium, software rendering (no GPU), 1920x1080 at text scale 1.5.
// Every value a still shows is ALSO read from the DOM (data-flat / data-value) and printed as §FILM_SHOT: the narration's numbers come from these lines, never from the picture.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/film_seq_shots.js <legacy_snapshot.json> <outDir> [projectValue=IFC_ARC] [today=2026-11-11]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const [snapFile, out, PROJECT = 'IFC_ARC', TODAY = '2026-11-11'] = process.argv.slice(2), ROOT = path.join(__dirname, '..', '..'), log = console.log;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.png': 'image/png' };
fs.mkdirSync(out, { recursive: true });
(async () => {
  const server = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u.endsWith('/__snap.json')) { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(fs.readFileSync(snapFile)); }
    fs.readFile(path.join(ROOT, decodeURIComponent(u)), (e, b) => { if (e) { r.writeHead(404); return r.end('404'); } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); });
  });
  await new Promise(r => server.listen(0, r));
  const br = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), cx = await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 }), p = await cx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:' + server.address().port + '/capex/index.html?snapshot=__snap.json&source=legacy&today=' + TODAY + '&project=' + encodeURIComponent(PROJECT), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 30000 });
  await p.selectOption('#fStatus', 'all'); await p.waitForTimeout(600);
  const val = (k) => p.evaluate(k => { const e = document.querySelector('#view [data-flat="' + k + '"]'); return e ? e.getAttribute('data-value') : null; }, k);
  const shot = async (name, sel, keys) => {
    const f = path.join(out, name + '.png'), el = sel ? await p.$(sel) : null;
    if (sel && !el) { log('§FILM_SHOT ' + name + ' MISSING selector ' + sel); return; }
    await (el ? el.screenshot({ path: f }) : p.screenshot({ path: f }));
    // §5.47 F14: the pixels are the page's text; grep that text with the private list (kept outside the repo). Text drawn into a canvas/image is NOT covered (named limit).
    const PGF = process.env.FILM_PRIVATE_GREP_FILE || path.join(process.env.HOME, '.cache/capex_film/private_grep.txt');
    if (!fs.existsSync(PGF)) log('§FILM_PIXEL_PRIVACY ' + name + ' INCONCLUSIVE no private list');
    else { const txt = await p.evaluate(() => document.body.innerText), re = new RegExp(fs.readFileSync(PGF, 'utf8').trim(), 'i'); log('§FILM_PIXEL_PRIVACY ' + name + ' chars=' + txt.length + ' hits=' + (re.test(txt) ? 1 : 0)); }
    const vals = {}; for (const k of keys || []) vals[k] = await val(k);
    log('§FILM_SHOT ' + name + ' -> ' + f + ' values=' + JSON.stringify(vals));
  };
  log('§FILM_SHOT_SELECT project=' + await p.$eval('#fProject', e => e.value) + ' options=' + await p.$$eval('#fProject option', o => o.length));
  await shot('s0_dashboard', null, ['approved_budget', 'actual_cost', 'forecast_cost', 'committed_verified', 'committed_contract', 'bim_documents']);
  await shot('s1_project_selector', '#fProject', []);
  const tiles = [['s2_budget', 'approved_budget', ['approved_budget']], ['s3_actual', 'actual_cost', ['actual_cost', 'actual_cost_pct_of_plan']], ['s4_committed', 'committed_cost', ['committed_cost', 'committed_contract', 'committed_verified']], ['s5_forecast', 'forecast_cost', ['forecast_cost']],
    ['s6_budget_status', 'budget_status', ['budget_status', 'actual_overrun']], ['s7_health', 'health', ['health']], ['s8_schedule', 'schedule', ['schedule', 'avg_delay']], ['s9_physical', 'physical_spent', ['physical', 'spent']], ['s10_stage', 'stage', ['stage']], ['s11_documents', 'bim_documents', ['bim_documents']]];
  for (const [n, k, keys] of tiles) await shot(n, '[data-tile="' + k + '"]', keys);
  log('§FILM_SHOT_ERRORS ' + errs.length + (errs.length ? ' ' + JSON.stringify(errs.slice(0, 2)) : ''));
  await br.close(); server.close();
})().catch(e => { log('§FILM_SHOT_FAIL ' + (e && e.stack || e)); process.exit(1); });
