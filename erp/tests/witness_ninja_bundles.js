// ⚠ DO NOT REMOVE — W-NINJA-BUNDLES (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §27, slice E). READ THE LOG after every run: the §WNB lines carry the evidence, exit code is not.
// THE ISSUE it proves/disproves: both Ninjas are real plugin bundles - built in (installed + started once per browser), each showing itself through ONE pill it contributes
//   (icon + label + action: own image, else a named host icon, else a letter box), the pill gone on Stop and back on Start, a stopped/uninstalled builtin never brought back.
//   N1 fresh profile: both bundles ACTIVE after boot; rail buttons pill-ninja (named Lucide grid) and pill-ninjacreate (letter box "N"); §PILL-CONTRIB add x2; ninja before ninjacreate
//   N2 Excel Report opens the NinjaExcel panel (#np-drop); Ninja opens the Plugin Engine on its Create face (#pe-create-body visible)
//   N3 Stop Excel Report: button gone (§PILL-CONTRIB remove); reload: still not ACTIVE, no button; Start: the button is back
//   N4 Stop Ninja: button gone and the Plugin Engine shows no Create tab
//   N5 Uninstall a builtin, reload: not re-installed
//   N6 a test bundle's pill with an img draws <img src>; with an unknown icon name and no img, the letter box; Stop removes it
// Run: node erp/tests/witness_ninja_bundles.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const REPO = process.env.REPO || path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.zip': 'application/zip', '.svg': 'image/svg+xml', '.png': 'image/png', '.xlsx': 'application/octet-stream' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
let fails = 0, judged = 0;
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { fails++; console.log('§WNB ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info).slice(0, 900)); return; }
  judged++; if (!cond) fails++; console.log('§WNB ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + (cond ? '' : ' ' + JSON.stringify(info).slice(0, 1500))); };
const EX = 'org.idempiere.ninja.excel', NC = 'org.idempiere.ninja.create';
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const LOG = [];
  page.on('console', m => LOG.push(m.text())); page.on('pageerror', e => LOG.push('PAGEERR ' + e));
  const ready = () => page.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && !!window.PluginEngine._reg() && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0 && !!document.getElementById('idmp-pill'), null, { timeout: 60000 });
  const load = async () => { await page.reload({ waitUntil: 'networkidle' }); await ready(); await page.waitForTimeout(800); };
  const since = (n, re) => LOG.slice(n).filter(l => re.test(l));
  const rail = () => page.evaluate(() => Array.from(document.querySelectorAll('#idmp-pill button[id^="pill-"]')).map(b => ({ id: b.id.slice(5), img: !!b.querySelector('img'), svg: b.querySelector('svg') ? b.querySelector('svg').innerHTML : '' })));
  const state = (id) => page.evaluate((id) => { const r = window.PluginEngine._reg().get(id); return r ? r.state : null; }, id);
  const tap = (id) => page.evaluate((id) => { const b = document.getElementById('pill-' + id); if (!b) return false; b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; }, id);
  const reg = (fn, arg) => page.evaluate(async ({ fn, arg }) => { const r = window.PluginEngine._reg(); try { await r[fn](arg); await window.PluginEngine.persist(); return null; } catch (e) { return e.message; } }, { fn, arg });
  try {
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    for (const n of ['erp_cache', 'fold_plugins']) await page.evaluate(x => new Promise(r => { const d = indexedDB.deleteDatabase(x); d.onsuccess = d.onerror = d.onblocked = () => r(); }), n);
    await page.evaluate(() => { try { localStorage.removeItem('idmp_pill_config'); } catch (e) {} });
    let n0 = LOG.length; await load();
    // ── N1 ──
    const r1 = await rail(), s1 = { ex: await state(EX), nc: await state(NC) }, add1 = since(n0, /^§PILL-CONTRIB add /), bi = since(n0, /^§PLUGIN-BUILTIN /);
    const iN = r1.findIndex(b => b.id === 'ninja'), iC = r1.findIndex(b => b.id === 'ninjacreate');
    const letterN = iC >= 0 && /<rect/.test(r1[iC].svg) && />N<\/text>/.test(r1[iC].svg), gridIcon = iN >= 0 && !r1[iN].img && r1[iN].svg.length > 20 && !/<text/.test(r1[iN].svg);
    console.log('§WNB N1 rail=' + JSON.stringify(r1.map(b => b.id)) + ' states=' + JSON.stringify(s1) + ' ' + JSON.stringify(bi) + ' ' + JSON.stringify(add1));
    verdict('N1', 'fresh profile: Excel Report ' + s1.ex + ', Ninja ' + s1.nc + '; rail has pill-ninja (named icon ' + gridIcon + ') at ' + iN + ' and pill-ninjacreate (letter box N ' + letterN + ') at ' + iC + '; ' + add1.length + ' §PILL-CONTRIB add',
      s1.ex === 'ACTIVE' && s1.nc === 'ACTIVE' && iN >= 0 && iC > iN && gridIcon && letterN && add1.length >= 2, { r1, s1, add1, bi });
    // ── N2 (NinjaExcel needs a tenant db: log in) ──
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible');
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible'); await page.click('#idmp-login-ok');
    await page.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0, null, { timeout: 30000 }); await page.waitForTimeout(1000);
    await tap('ninja'); await page.waitForTimeout(800);
    const np = await page.evaluate(() => !!document.getElementById('np-drop')); await page.evaluate(() => { const c = document.getElementById('np-close'); if (c) c.click(); });
    await tap('ninjacreate'); await page.waitForTimeout(1200);
    const pe = await page.evaluate(() => { const b = document.getElementById('pe-create-body'), t = document.getElementById('pe-tab-create'); return { ov: !!document.getElementById('pe-ov'), create: !!b && b.style.display !== 'none', tab: !!t && t.style.display !== 'none' }; });
    await page.evaluate(() => { const c = document.getElementById('pe-close'); if (c) c.click(); });
    verdict('N2', 'Excel Report opens the NinjaExcel panel (' + np + '); Ninja opens the Plugin Engine (' + pe.ov + ') on the Create face (' + pe.create + ')', np && pe.ov && pe.create, { np, pe });
    // ── N3 ──
    n0 = LOG.length; const e3 = await reg('stopBundle', EX); const r3 = await rail(), rm3 = since(n0, /^§PILL-CONTRIB remove id=ninja /);
    await load(); const r3b = await rail(), s3b = await state(EX);
    const e3s = await reg('startBundle', EX); const r3c = await rail();
    verdict('N3', 'Stop Excel Report: button gone (' + !r3.some(b => b.id === 'ninja') + ', ' + rm3.length + ' remove); after reload state ' + s3b + ', button ' + r3b.some(b => b.id === 'ninja') + '; Start: button back (' + r3c.some(b => b.id === 'ninja') + ')',
      !e3 && !r3.some(b => b.id === 'ninja') && rm3.length === 1 && s3b !== 'ACTIVE' && s3b != null && !r3b.some(b => b.id === 'ninja') && !e3s && r3c.some(b => b.id === 'ninja'), { e3, e3s, s3b, r3, r3b, r3c });
    // ── N4 ──
    const e4 = await reg('stopBundle', NC); const r4 = await rail();
    await page.evaluate(() => window.IdmpPillActions.plugin({ face: 'create' })); await page.waitForTimeout(1000);
    const pe4 = await page.evaluate(() => { const t = document.getElementById('pe-tab-create'), b = document.getElementById('pe-create-body'); return { ov: !!document.getElementById('pe-ov'), tab: !!t && t.style.display !== 'none', create: !!b && b.style.display !== 'none' }; });
    await page.evaluate(() => { const c = document.getElementById('pe-close'); if (c) c.click(); });
    verdict('N4', 'Stop Ninja: button gone (' + !r4.some(b => b.id === 'ninjacreate') + '), Plugin Engine open (' + pe4.ov + ') with no Create tab (tab ' + pe4.tab + ', face ' + pe4.create + ')', !e4 && !r4.some(b => b.id === 'ninjacreate') && pe4.ov && !pe4.tab && !pe4.create, { e4, r4, pe4 });
    // ── N5 ──
    const e5 = await reg('uninstallBundle', NC); n0 = LOG.length; await load();
    const s5 = await state(NC), bi5 = since(n0, /^§PLUGIN-BUILTIN /), r5 = await rail();
    verdict('N5', 'Uninstall Ninja, reload: state ' + s5 + ' (not re-installed), ' + bi5.length + ' §PLUGIN-BUILTIN, no button (' + !r5.some(b => b.id === 'ninjacreate') + ')', !e5 && s5 == null && bi5.length === 0 && !r5.some(b => b.id === 'ninjacreate'), { e5, s5, bi5 });
    // ── N6 ──
    const r6 = await page.evaluate(async (img) => { const r = window.PluginEngine._reg(); const out = {};
      await r.installBundle({ manifest: { id: 'wnb.img', name: 'WNB img', version: '1.0.0', engineVersion: '*' }, activate: async (c) => { c.pill.register('wnbimg', { name: 'Picture', img: img, order: 9, action: () => {} }); } });
      await r.installBundle({ manifest: { id: 'wnb.letter', name: 'WNB letter', version: '1.0.0', engineVersion: '*' }, activate: async (c) => { c.pill.register('wnbletter', { name: 'quarry', icon: 'noSuchIcon', order: 9.1, action: () => {} }); } });
      await r.startBundle('wnb.img'); await r.startBundle('wnb.letter');
      const b1 = document.getElementById('pill-wnbimg'), b2 = document.getElementById('pill-wnbletter');
      out.img = b1 && b1.querySelector('img') ? b1.querySelector('img').getAttribute('src') : null; out.letter = b2 && b2.querySelector('svg') ? b2.querySelector('svg').innerHTML : null;
      await r.stopBundle('wnb.img'); await r.stopBundle('wnb.letter'); out.after = !!document.getElementById('pill-wnbimg') || !!document.getElementById('pill-wnbletter');
      await r.uninstallBundle('wnb.img'); await r.uninstallBundle('wnb.letter'); return out; }, base + '/redpill.png');
    verdict('N6', 'img pill draws <img src=' + r6.img + '>; unknown icon + no img -> letter box (' + /<rect/.test(r6.letter || '') + ', Q ' + />Q<\/text>/.test(r6.letter || '') + '); after Stop present=' + r6.after,
      r6.img === base + '/redpill.png' && /<rect/.test(r6.letter || '') && />Q<\/text>/.test(r6.letter || '') && !r6.after, r6);
  } catch (e) { fails++; console.log('§WNB ERROR ' + (e.stack || e)); }
  const perr = LOG.filter(l => /^PAGEERR/.test(l)); console.log('§WNB page errors ' + perr.length + (perr.length ? ' ' + JSON.stringify(perr.slice(0, 4)) : '')); if (perr.length) fails++;
  console.log('§WNB VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + fails);
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
