// capex/tools/film_dash_twin_shots.js — stills + FACTS for the DASHBOARD-ONLY film on the TWIN's own store (prompts/CAPEX_DASHBOARD.md §5.62 storyboard). Source A only: the page opens the exported store (?db=), no legacy.
// Every value a still shows is ALSO read from the DOM / the shipped page log and printed (§FILM_DASH_SHOT); the narration's numbers come from these lines, never from the picture. Each shot's page text is grepped with the private list (§FILM_PIXEL_PRIVACY).
// Stills are for the owner to read, never evidence (witness numbers are). Software rendering, no GPU. Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/film_dash_twin_shots.js <store.db> <outDir> [today=2026-11-12]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const [dbFile, out, TODAY = '2026-11-12'] = process.argv.slice(2), ROOT = path.join(__dirname, '..', '..'), log = console.log, T = require('../tiles.js'), AD = require('../adapters.js'), initSqlJs = require('sql.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
fs.mkdirSync(out, { recursive: true });
(async () => {
  const SQL = await initSqlJs(), data = AD.fromSqlite(new SQL.Database(fs.readFileSync(dbFile)), {});
  const detail = data.projects.map(p => T.projectDetail(data, { today: TODAY }, p.C_Project_ID)).filter(Boolean), pick = f => detail.filter(f)[0] || null;
  const BRIDGE = pick(d => d.Value === 'TD_BRIDGE'), BASIS = pick(d => d.forecast && d.forecast.basisDiffers), AMBER = pick(d => d.health === 'amber'), RED = pick(d => d.health === 'red');
  log('§FILM_DASH_PICK bridge=' + (BRIDGE && BRIDGE.Value) + ' basisDiffers=' + (BASIS && BASIS.Value) + ' amber=' + (AMBER && AMBER.Value) + ' red=' + (RED && RED.Value));
  const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); if (u === '/__twin.db') { r.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return r.end(fs.readFileSync(dbFile)); }
    fs.readFile(path.join(ROOT, u), (e, b) => { if (e) { r.writeHead(404); return r.end('404'); } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise(r => server.listen(0, r));
  const br = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), cx = await br.newContext({ viewport: { width: 1500, height: 844 }, deviceScaleFactor: 1.28 }), p = await cx.newPage(), errs = [], logs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => logs.push(m.text()));
  const base = 'http://localhost:' + server.address().port + '/capex/index.html?db=/__twin.db&today=' + TODAY, wait = async () => { await p.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 30000 }); await p.waitForTimeout(600); };
  await p.goto(base, { waitUntil: 'load' }); await wait();
  const PGF = process.env.FILM_PRIVATE_GREP_FILE || path.join(process.env.HOME, '.cache/capex_film/private_grep.txt'), RE = fs.existsSync(PGF) ? new RegExp(fs.readFileSync(PGF, 'utf8').trim(), 'i') : null;
  const val = k => p.evaluate(k => { const e = document.querySelector('#view [data-flat="' + k + '"]'); return e ? e.getAttribute('data-value') : null; }, k);
  const shot = async (name, keys, extra) => { const f = path.join(out, name + '.png'); await p.screenshot({ path: f }); const vals = {}; for (const k of keys || []) vals[k] = await val(k);
    log('§FILM_DASH_SHOT ' + name + ' -> ' + f + ' values=' + JSON.stringify(vals) + (extra ? ' ' + extra : '')); const txt = await p.evaluate(() => document.body.innerText); log('§FILM_PIXEL_PRIVACY ' + name + (RE ? ' chars=' + txt.length + ' hits=' + (RE.test(txt) ? 1 : 0) : ' INCONCLUSIVE no private list')); };
  const drill = async key => { await p.evaluate(k => document.querySelector('#view [data-drill="' + k + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true })), key); await p.waitForTimeout(450); return p.$eval('#drill', d => d.hidden ? -1 : d.querySelectorAll('tbody tr').length); };
  const close = async () => { await p.evaluate(() => { document.getElementById('drill').hidden = true; }); await p.waitForTimeout(200); };
  const hash = async h => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(600); };
  // the film opens in the Executive layout, light skin (the map and Needs attention exist there); Classic and Dark are the theme beat at the end
  await p.selectOption('#fTheme', 'executive'); await p.selectOption('#fSkin', 'light'); await p.waitForTimeout(600); log('§FILM_DASH_LAYOUT start layout=executive skin=light');
  // 1 the glance
  await shot('b02_glance', ['total_projects', 'active_projects', 'approved_budget', 'actual_cost', 'forecast_cost', 'health', 'schedule', 'budget_status']);
  // 3-4, 6 tiles that open their rows
  for (const [name, key] of [['b03_drill_approved', 'approved_budget'], ['b04_drill_spent', 'actual_cost'], ['b06_drill_amber', 'health:amber']]) { const n = await drill(key); await shot(name, [], 'drill=' + key + ' rows=' + n); await close(); }
  // 5 the forecast and its basis warning (a project whose spent and done are not on one basis)
  if (BASIS) { await hash('#project/' + BASIS.id + '/overview'); await shot('b05_forecast_basis', [], 'project=' + BASIS.Value + ' basisDiffers=true cpiBasis=' + JSON.stringify(BASIS.money && { done: BASIS.money.done, spent: BASIS.money.spent })); } else log('§FILM_DASH_SHOT b05_forecast_basis MISSING no project in this store has a differing basis');
  await hash('#dashboard');
  // 7 the portfolio map: hover then open one project; 8 needs attention
  const bub = await p.$('#view [data-open-project]'); if (bub) { await bub.hover(); await p.waitForTimeout(300); const nm = await bub.getAttribute('data-open-project'); await shot('b07_map_hover', [], 'project=' + nm); await bub.click(); await p.waitForTimeout(500); await shot('b07_map_open', [], 'opened=' + nm + ' drill=' + (await p.$eval('#drill', d => !d.hidden))); await close(); } else log('§FILM_DASH_SHOT b07_map MISSING no map element');
  const att = await p.$$eval('#view .att-row', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 90))); await shot('b08_attention', [], 'rows=' + att.length + ' first=' + JSON.stringify(att[0] || ''));
  // 9 the six menu items
  for (const [name, h, keys] of [['b09_m1_projects', 'projects', []], ['b09_m2_budget', 'budget', []], ['b09_m3_procurement', 'procurement', ['proc_openpo', 'proc_overcommitted', 'proc_nopo']], ['b09_m4_approvals', 'approvals', ['approvals']], ['b09_m5_handover', 'handover', ['handover_ready', 'handover_done']]]) {
    await hash('#' + h); await shot(name, keys, 'view=' + h + ' lead=' + JSON.stringify(await p.$eval('#view .lead', e => e.textContent).catch(() => ''))); }
  // 10 the project page, five tabs (the BRIDGE project: dated tasks, a chain at invoiced, a draft order)
  if (BRIDGE) for (const t of ['overview', 'schedule', 'cost', 'procurement', 'documents']) { await hash('#project/' + BRIDGE.id + '/' + t);
    const extra = t === 'schedule' ? 'taskBars=' + (await p.$$eval('#view rect.tbar', e => e.length)) + ' phaseBars=' + (await p.$$eval('#view rect.pbar', e => e.length)) : t === 'procurement' ? 'chainStages=' + JSON.stringify(await p.$$eval('#view [data-chain] tr[data-order]', e => e.map(x => x.getAttribute('data-stage')))) + ' strip=' + (await p.$$eval('#view [data-chain] [data-strip]', e => e.map(x => x.getAttribute('data-strip') + '=' + x.getAttribute('data-count')))).join(',') : '';
    await shot('b10_page_' + t, [], 'project=' + BRIDGE.Value + ' tab=' + t + ' ' + extra); }
  // 11 the formula marker, then the themes (Layout x Skin): the data underneath is the same, only the look changes
  await hash('#dashboard'); await p.evaluate(() => { document.querySelectorAll('#view details.note').forEach((d, i) => { if (i === 2) d.open = true; }); }); await p.waitForTimeout(250); await shot('b11_formula', ['approved_budget']);
  const layouts = await p.$$eval('#fTheme option', e => e.map(x => x.value)), skins = await p.$$eval('#fSkin option', e => e.map(x => x.value)); log('§FILM_DASH_THEMES layouts=' + layouts.join(',') + ' skins=' + skins.join(','));
  for (const [lay, sk] of [['classic', 'light'], ['executive', 'light'], ['executive', 'dark']]) { await p.selectOption('#fTheme', lay); await p.selectOption('#fSkin', sk); await p.waitForTimeout(500); await shot('b11_theme_' + lay + '_' + sk, ['approved_budget', 'actual_cost', 'health'], 'layout=' + lay + ' skin=' + sk); }
  log('§FILM_DASH_SHOT_ERRORS ' + errs.length + (errs.length ? ' ' + errs[0].slice(0, 120) : ''));
  const tiles = logs.filter(l => /^§DASH_TILE source=sqlite tile=(total_projects|approved_budget|actual_cost|health|schedule|budget_status|proc_openpo|forecast_cost) /.test(l)); const seen = {}; tiles.reverse().forEach(l => { const k = l.split(' ')[2]; if (!seen[k]) { seen[k] = 1; log(l); } });
  await br.close(); server.close();
})();
