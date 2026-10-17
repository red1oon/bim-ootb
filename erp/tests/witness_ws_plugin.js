// ⚠ DO NOT REMOVE — W-WS-PLUGIN (bim-compiler prompts/ERP_WS_API.md S6). READ THE LOG (§WSG lines); exit code is not evidence.
// ISSUE it proves/disproves: the Web Services plugin is installed but OFF by default (legacy ships the bundle with nothing reachable until an admin switches it on); Start gives it a pill and a
//   status panel whose numbers equal the dictionary's; the exported host config is what lets the headless host serve; Stop takes the pill AND the service away again.
//   G1 after a fresh boot the bundle is installed and NOT active, and the tray has no Web Services pill     G2 Start -> state ACTIVE and the pill appears
//   G3 the panel's service-type / grant counts == the browser DB's own COUNT(*)                          G4 Export writes {"state":"ACTIVE"} (a real download)
//   G5 host: no config / STOPPED config -> HTTP 404 on the service path; ACTIVE config -> the service answers      G6 Stop -> state not ACTIVE, pill gone, and the host (config flipped) is dark again
//   Negative control WSG_BREAK=started starts the bundle before G1 -> G1 must turn RED. INCONCLUSIVE if a step could not run.
// Run: [WSG_BREAK=started] node erp/tests/witness_ws_plugin.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), BREAK = process.env.WSG_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.png': 'image/png' };
const server = http.createServer((req, res) => { const fp = path.join(REPO, decodeURIComponent(req.url.split('?')[0])); fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
let fails = 0, judged = 0;
const v = (id, claim, ok, info, inc) => { if (inc) { fails++; console.log('§WSG ' + id + ' INCONCLUSIVE ' + claim); return; } judged++; if (!ok) fails++; console.log('§WSG ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + claim + (ok ? '' : ' ' + JSON.stringify(info))); };
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, acceptDownloads: true }), page = await ctx.newPage();
  const LOG = []; page.on('console', m => LOG.push(m.text())); page.on('pageerror', e => LOG.push('PAGEERR ' + e)); page.on('dialog', async d => { await d.accept(); });
  const hold = (ms) => page.waitForTimeout(ms);
  await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  for (const n of ['erp_cache', 'fold_plugins']) await page.evaluate(x => new Promise(r => { const d = indexedDB.deleteDatabase(x); d.onsuccess = d.onerror = d.onblocked = () => r(); }), n);
  await page.goto(base + '/idempiere.html?login=GardenAdmin&lang=en_US', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.PluginEngine && !!window.__idmpDb && window.APP && window.APP.roleId != null, null, { timeout: 40000 });
  await hold(3500);
  const ID = 'org.idempiere.webservices';
  const st = () => page.evaluate(id => { const x = window.PluginEngine._reg().get(id); return x ? x.state : null; }, ID);
  const pill = async () => { if (!(await page.locator('#pill-webservices').first().isVisible().catch(() => false))) { await page.click('#idmp-pill-trigger').catch(() => {}); await hold(400); } return await page.locator('#pill-webservices').count(); };
  if (BREAK === 'started') await page.evaluate(async id => { await window.PluginEngine._reg().startBundle(id); }, ID);
  const s0 = await st(); await page.click('#idmp-pill-trigger').catch(() => {}); await hold(500); const p0 = await page.locator('#pill-webservices').count();
  v('G1', 'fresh boot: bundle state=' + s0 + ' (installed, NOT active), Web Services pills in the tray=' + p0, s0 != null && s0 !== 'ACTIVE' && p0 === 0, { s0, p0 }, s0 == null);
  await page.evaluate(async id => { await window.PluginEngine._reg().startBundle(id); }, ID); await hold(900);
  if (!(await page.locator('#pill-webservices').first().isVisible().catch(() => false))) { await page.click('#idmp-pill-trigger').catch(() => {}); await hold(500); }
  const s1 = await st(), p1 = await page.locator('#pill-webservices').count();
  v('G2', 'Start: state=' + s1 + ', pill present=' + p1, s1 === 'ACTIVE' && p1 === 1, { s1, p1 });
  await page.click('#pill-webservices'); await page.waitForSelector('#idmp-ws-panel', { timeout: 5000 }).catch(() => {}); await hold(300);
  const panel = await page.evaluate(() => { const g = (k) => { const e = document.querySelector('#idmp-ws-panel [data-ws="' + k + '"]'); return e ? e.textContent : null; }; const q = (s) => window.__idmpDb.exec(s)[0].values[0][0];
    return { types: Number(g('types')), access: Number(g('access')), dbTypes: Number(q("SELECT count(*) FROM ws_webservicetype WHERE isactive='Y'")), dbAccess: Number(q("SELECT count(*) FROM ws_webservicetypeaccess WHERE isactive='Y'")), state: g('state'), warn: g('warn') }; });
  v('G3', 'panel counts equal the DB: types ' + panel.types + '/' + panel.dbTypes + ', grants ' + panel.access + '/' + panel.dbAccess + (panel.warn ? '; warns about stock default credentials' : ''), panel.types === panel.dbTypes && panel.access === panel.dbAccess && panel.types > 0, panel, !panel.dbTypes);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('#idmp-ws-panel [data-ws="export"]')]);
  let cfg = null; if (dl) { const f = await dl.path(); try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {} }
  v('G4', 'Export downloaded ' + (dl ? dl.suggestedFilename() : 'nothing') + ' -> ' + JSON.stringify(cfg), !!cfg && cfg.state === 'ACTIVE' && cfg.plugin === ID, { cfg }, !dl);
  // G5/G6 the host
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wsg-')), cfgFile = path.join(tmp, 'ws_host.json'), PORT = 18200 + Math.floor(Math.random() * 500);
  const host = spawn('node', [path.join(REPO, 'erp', 'ws_server.js'), String(PORT), '--config', cfgFile], { env: Object.assign({}, process.env, { NODE_PATH: os.homedir() + '/bim-ootb/node_modules' }), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 7000));
  const hit = async () => (await fetch('http://localhost:' + PORT + '/ADInterface/services/rest/model_adservice/query_data', { method: 'POST', body: '<x/>' })).status;
  const a = await hit(); fs.writeFileSync(cfgFile, JSON.stringify({ state: 'STOPPED' })); const b = await hit(); fs.writeFileSync(cfgFile, JSON.stringify(cfg || {})); const c = await hit();
  v('G5', 'host: no config -> ' + a + ', STOPPED -> ' + b + ', exported ACTIVE config -> ' + c + ' (404/404/200 = off, off, serving)', a === 404 && b === 404 && c === 200, { a, b, c }, !cfg);
  await page.evaluate(async id => { await window.PluginEngine._reg().stopBundle(id); }, ID); await hold(900);
  const s2 = await st(), p2 = await page.locator('#pill-webservices').count(), pan2 = await page.locator('#idmp-ws-panel').count(); fs.writeFileSync(cfgFile, JSON.stringify({ state: 'STOPPED' })); const d2 = await hit(); host.kill();
  v('G6', 'Stop: state=' + s2 + ', pill=' + p2 + ', panel=' + pan2 + ', host (config STOPPED) -> ' + d2, s2 !== 'ACTIVE' && p2 === 0 && pan2 === 0 && d2 === 404, { s2, p2, pan2, d2 });
  console.log(LOG.filter(l => /§WS-PLUGIN|§PLUGIN-BUILTIN.*webservices|PAGEERR/.test(l)).slice(0, 8).join('\n'));
  console.log('§WSG_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§WSG ERROR ' + e.stack); process.exit(2); });
