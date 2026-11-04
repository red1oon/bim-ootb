// Probe §MD-UPSTREAM: Project 990001 → Task Line under VARIANT conditions. Log only. usage: node probe_md_upstream.js <variant> [seedOverride]
const { chromium } = require(require('os').homedir() + '/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '../..'), VARIANT = process.argv[2] || 'base', SEED = process.argv[3] || null, PORT = 8440 + Math.floor(Math.random() * 50);
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); const f = (SEED && /\/ad_seed\.db$/.test(p)) ? SEED : path.join(ROOT, p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': ({'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css'})[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'mdup-'));
  const ctx = await chromium.launchPersistentContext(prof, {});
  const page = await ctx.newPage(); const log = [];
  page.on('console', m => { const t = m.text(); if (/§(GT-OPEN-FAIL|IDEMPIERE-MD|IDEMPIERE tab=|IDEMPIERE boot|AD_DATA readRecords table=C_ProjectLine)/.test(t)) log.push(t.slice(0, 300)); });
  page.on('pageerror', e => log.push('PAGEERROR ' + e.message));
  const login = async () => { for (let i = 0; i < 60; i++) { await page.waitForTimeout(2500);
    const si = await page.evaluate(() => { const vis = e => e && e.getBoundingClientRect().width > 0;
      const s2 = document.getElementById('idmp-login-step2'), ok = document.getElementById('idmp-login-ok');
      if (s2 && s2.style.display !== 'none' && vis(ok)) { ok.click(); return 1; }
      const u = Array.from(document.querySelectorAll('.idmp-login-user')).filter(vis).find(r => /GardenAdmin/.test(r.textContent)); if (u) { u.click(); return 1; }
      return document.querySelectorAll('.idmp-adtab').length ? 2 : 0; });
    if (si === 2) break; } await page.waitForTimeout(2500); };
  const tab = async n => { await page.evaluate((n) => { const t = Array.from(document.querySelectorAll('.idmp-adtab')).find(e => e.textContent.trim() === n); t && t.click(); }, n); await page.waitForTimeout(2500); };
  log.push('--- VARIANT ' + VARIANT);
  await page.goto('http://127.0.0.1:' + PORT + '/erp/idempiere.html?client=garden&window=130&record=990001');
  await login();
  log.push('--- direct jump to Task Line'); await tab('Task Line');
  log.push('--- reload (IDB-cached seed) then Task Line');
  await page.goto('http://127.0.0.1:' + PORT + '/erp/idempiere.html?client=garden&window=130&record=990001'); await login(); await tab('Task Line');
  const out = path.join(__dirname, '_out', 'md_upstream_' + VARIANT + '.log'); fs.writeFileSync(out, log.join('\n')); console.log(log.join('\n'));
  await ctx.close(); server.close();
})();
