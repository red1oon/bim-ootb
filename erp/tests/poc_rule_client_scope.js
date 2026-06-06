// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for RULE_EDIT_SPEC §11 (client-scoping bug fix, 2026-06-06).
//   ISSUE IT PROVES: "the ⚖ Rule pill was hard-bound to Odoo (AD_Client_ID=12)" — on any non-Odoo
//   login it queried Odoo's rows and lied `tenant=Odoo(12) FAIL no-population`. The fix: fold over the
//   LOGGED-IN client (window.__idmpClient, set by idempiere.html applySession), honest tenant label +
//   honest-disable when the client has no population.
//   PROVES:
//     (A) REGRESSION — login Odoo(12) w/ the 12-odoo shard: premium gesture STILL §RULE-GESTURE PASS,
//         tenant=Odoo(12), population=35 (the fix didn't break the original path).
//     (B) THE FIX — login GardenWorld(11), NO Odoo shard: §RULE-OPEN tenant=GardenWorld(11) (NOT Odoo);
//         §RULE-SCOPE premium population=114 (client 11's real products, NOT 0, NOT 35) corroborated by
//         the rendered badge DOM; maycomplete (0 DR/IP orders) → §RULE-DISABLE + ▶ Run disabled (honest).
//   §-log first — READ tests/poc_rule_client_scope.log before any conclusion.
// Run:  node tests/poc_rule_client_scope.js 2>&1 | tee tests/poc_rule_client_scope.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

// open the ⚖ Rule pill after a login auto-completes (fallback: confirm the role step if it stalls there)
async function openRulePill(page) {
  await page.waitForSelector('.idmp-pill[title="Rule"]', { timeout: 20000 }).catch(async () => {
    const ok = await page.$('#idmp-login-ok'); if (ok) await ok.click();
    await page.waitForSelector('.idmp-pill[title="Rule"]', { timeout: 15000 });
  });
  await page.click('.idmp-pill[title="Rule"]');
  await page.waitForSelector('#rule-run', { timeout: 8000 });
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const result = { A: {}, B: {} };

  // ── (A) REGRESSION: Odoo(12) login with the 12-odoo shard — premium gesture must still PASS ──
  {
    const logsA = [], errsA = [];
    const page = await browser.newPage();
    page.on('console', m => logsA.push(m.text()));
    page.on('pageerror', e => errsA.push(e.message));
    await page.goto(`http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=140`,
      { waitUntil: 'networkidle' });
    await openRulePill(page);
    await page.click('[data-rule="premium"]');
    await page.waitForTimeout(300);
    await page.click('#rule-run');
    for (let i = 0; i < 80 && !logsA.find(l => l.startsWith('§RULE-GESTURE layer=L2 rule=premium')); i++) await page.waitForTimeout(250);
    await page.close();

    const find = re => logsA.find(l => re.test(l)) || '';
    const gest = find(/^§RULE-GESTURE layer=L2 rule=premium /);
    const edit = find(/^§RULE-EDIT layer=L2 rule=premium /);
    [gest, edit].forEach(l => console.log(l || '(missing A §-line)'));
    result.A.gestPass = /\bPASS\b/.test(gest) && /signed=Y/.test(gest);
    result.A.pop35    = /N=35\b/.test(gest);
    result.A.tenant   = /tenant=Odoo\(12\)/.test(edit);
    result.A.errs     = errsA.length;
    console.log(`§RULE-A-REGRESS gestPass=${result.A.gestPass} pop35=${result.A.pop35} tenant=Odoo(12)?${result.A.tenant} pageerr=${result.A.errs}`);
  }

  // ── (B) THE FIX: GardenWorld(11) login, NO shard — scoped to client 11, maycomplete honest-disabled ──
  {
    const logsB = [], errsB = [];
    const page = await browser.newPage();
    page.on('console', m => logsB.push(m.text()));
    page.on('pageerror', e => errsB.push(e.message));
    await page.goto(`http://localhost:${port}/idempiere.html?seed=ad_seed.db&login=GardenAdmin`,
      { waitUntil: 'networkidle' });
    await openRulePill(page);          // open() defaults to premium → §RULE-OPEN + §RULE-SCOPE premium
    await page.waitForTimeout(400);
    // corroborate population via the rendered badge DOM (not just the §-log)
    const badge = await page.evaluate(() => (document.body.textContent || '').match(/PREMIUM:\s*(\d+)\s+of\s+(\d+)/));
    result.B.badgeN = badge ? Number(badge[2]) : NaN;
    // switch to maycomplete → must honest-disable (0 DR/IP orders in GardenWorld)
    await page.click('[data-rule="maycomplete"]');
    await page.waitForTimeout(400);
    result.B.runDisabled = await page.$eval('#rule-run', b => b.disabled).catch(() => false);
    await page.close();

    const find = re => logsB.find(l => re.test(l)) || '';
    const open  = find(/^§RULE-OPEN /);
    const scP   = find(/^§RULE-SCOPE rule=premium /);
    const scM   = find(/^§RULE-SCOPE rule=maycomplete /);
    const disab = find(/^§RULE-DISABLE rule=maycomplete /);
    [open, scP, scM, disab].forEach(l => console.log(l || '(missing B §-line)'));
    result.B.tenantGW   = /tenant=GardenWorld\(11\)/.test(open);
    result.B.notOdoo    = !/Odoo\(12\)/.test(open) && !/Odoo\(12\)/.test(scP);
    result.B.pop114     = /population=114\b/.test(scP);
    result.B.mayZero    = /population=0\b/.test(scM);
    result.B.disabled   = /reason=no-population/.test(disab) && result.B.runDisabled;
    result.B.errs       = errsB.length;
    console.log(`§RULE-B-FIX tenantGW=${result.B.tenantGW} notOdoo=${result.B.notOdoo} pop114=${result.B.pop114} badgeN=${result.B.badgeN} mayZero=${result.B.mayZero} disabled=${result.B.disabled} pageerr=${result.B.errs}`);
  }

  await browser.close(); server.close();

  const aOk = result.A.gestPass && result.A.pop35 && result.A.tenant && result.A.errs === 0;
  const bOk = result.B.tenantGW && result.B.notOdoo && result.B.pop114 && result.B.badgeN === 114 &&
              result.B.mayZero && result.B.disabled && result.B.errs === 0;
  const pass = aOk && bOk;
  console.log(`§RULE-CLIENT-SCOPE ${pass ? 'PASS' : 'FAIL'} premium.tenant=GardenWorld(11) premium.pop=114 maycomplete=${result.B.disabled ? 'disabled' : 'NOT-disabled'} odooRegress=${aOk ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); try { server.close(); } catch (x) {} process.exit(2); });
