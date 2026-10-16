// Probe: Project (deeplink 990001) → Task Line DIRECTLY (skip Phase/Task) — does the detail filter by parent? Log only.
const { chromium } = require(require('os').homedir() + '/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/tmp/wt-erp-clip';
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': ({'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css'})[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => server.listen(8433, '127.0.0.1', r));
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, 'erp_clip_profile'), {});
  const page = await ctx.newPage(); const log = [];
  page.on('console', m => { const t = m.text(); if (/§(GT-OPEN-FAIL|IDEMPIERE-MD|IDEMPIERE tab=|AD_DATA readRecords table=C_Project|ZOOM-ACROSS launch)/.test(t)) log.push(t.slice(0, 260)); });
  await page.goto('http://127.0.0.1:8433/erp/idempiere.html?client=garden&window=130&record=990001');
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(3000);
    const si = await page.evaluate(() => { const vis = e => e && e.getBoundingClientRect().width > 0;
      const s2 = document.getElementById('idmp-login-step2'), ok = document.getElementById('idmp-login-ok');
      if (s2 && s2.style.display !== 'none' && vis(ok)) { ok.click(); return 1; }
      const u = Array.from(document.querySelectorAll('.idmp-login-user')).filter(vis).find(r => /GardenAdmin/.test(r.textContent)); if (u) { u.click(); return 1; }
      return document.querySelectorAll('.idmp-adtab').length ? 2 : 0; });
    if (si === 2) break; }
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const t = Array.from(document.querySelectorAll('.idmp-adtab')).find(e => e.textContent.trim() === 'Task Line'); t && t.click(); });
  await page.waitForTimeout(3000);
  log.push('--- CASE B: Phase → Task → Task Line');
  for (const n of ['Phase','Task','Task Line']) { await page.evaluate((n) => { const t = Array.from(document.querySelectorAll('.idmp-adtab')).find(e => e.textContent.trim() === n); t && t.click(); }, n); await page.waitForTimeout(2500); }
  log.push('--- CASE C: GridTab model forced to fail (window re-opened), Task Line');
  await page.evaluate(() => { const o = window.AdGridTab.open; window.AdGridTab.open = function (d, tabs, i) { if (tabs[i] && tabs[i].tabLevel > 0) throw new Error('forced'); return o.apply(this, arguments); }; });
  await page.goto('http://127.0.0.1:8433/erp/idempiere.html?client=garden&window=130&record=990001');
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(3000);
    const si = await page.evaluate(() => { const vis = e => e && e.getBoundingClientRect().width > 0;
      const s2 = document.getElementById('idmp-login-step2'), ok = document.getElementById('idmp-login-ok');
      if (s2 && s2.style.display !== 'none' && vis(ok)) { ok.click(); return 1; }
      const u = Array.from(document.querySelectorAll('.idmp-login-user')).filter(vis).find(r => /GardenAdmin/.test(r.textContent)); if (u) { u.click(); return 1; }
      return document.querySelectorAll('.idmp-adtab').length ? 2 : 0; });
    if (si === 2) break; }
  await page.evaluate(() => { const o = window.AdGridTab.open; window.AdGridTab.open = function (d, tabs, i) { if (tabs[i] && tabs[i].tabLevel > 0) throw new Error('forced'); return o.apply(this, arguments); }; });
  await page.evaluate(() => { const t = Array.from(document.querySelectorAll('.idmp-adtab')).find(e => e.textContent.trim() === 'Task Line'); t && t.click(); });
  await page.waitForTimeout(3000);
  fs.writeFileSync(path.join(__dirname, 'erp_md_probe.log'), log.join('\n')); console.log(log.join('\n'));
  await ctx.close(); server.close();
})();
