// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness that PERIOD-CLOSE is wired into the live app on the REAL signed op-log
//   (prompts/ERP_SUBSTRATE_INTEGRATION.md Phase 2 slice A — §INTEG-WIRE). THE CLAIM:
//     1. §INTEG-WIRE close — with real double-entry POST ops in the live `glassbowl_kernel_ops` sidecar,
//        window.PeriodClose.close() folds them → ONE signed checkpoint carrying the closing balances
//        (net DR−CR cents), compacts the pre-checkpoint ops, and re-persists the sidecar. signed=Y.
//     2. §PCLOSE-BF-LIVE bootstrap — RELOAD (same context → IDB persists); on boot the app opens from the
//        checkpoint: opening balances == the closing balances brought forward, WITHOUT re-folding genesis.
//   NON-INVENT: the POST ops are the app's real §13.1 shape ({lines:[{account_id,amtacctdr,amtacctcr}]});
//   the post-reload balances come from the persisted signed checkpoint, nowhere else.
//   §-log first — READ poc_period_close_wire.log before any conclusion.
// Run:  node tests/poc_period_close_wire.js 2>&1 | tee tests/poc_period_close_wire.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.wasm':'application/wasm', '.css':'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/glassbowl.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
const ready = (page) => page.waitForFunction(
  () => window.PeriodClose && window.ErpPeriodClose && window.KernelOps && window.ErpSigner && window.__crud,
  { timeout: 25000 });

// the app's REAL §13.1 POST shape — a sales invoice (AR/Revenue) + its payment (Cash/AR).
const POSTS = [
  { table: 'C_Invoice', id: 109, lines: [ { account_id: '101', amtacctdr: 434.13, amtacctcr: 0 }, { account_id: '400', amtacctdr: 0, amtacctcr: 434.13 } ] },
  { table: 'C_Payment', id: 77,  lines: [ { account_id: '108', amtacctdr: 434.13, amtacctcr: 0 }, { account_id: '101', amtacctdr: 0, amtacctcr: 434.13 } ] },
];
const EXPECT = { '101': 0, '400': -43413, '108': 43413 };   // net DR−CR cents (AR settles to 0)

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const url = `http://localhost:${port}/glassbowl.html`;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const context = await browser.newContext();   // ONE context → IDB persists across the reload
  const page = await context.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  // ── session 1: seed real POST ops into the live sidecar, then close the period ──
  await page.goto(url, { waitUntil: 'networkidle' });
  const wired = await ready(page).then(() => true).catch(() => false);
  const hasRender = await page.evaluate(() => typeof window.PeriodClose.renderInto === 'function');
  // PeriodClose.boot lazily loads sql.js + builds the sidecar; wait for it before seeding.
  const sidecarUp = await page.waitForFunction(
    () => typeof window.initSqlJs === 'function' && window.__crud && window.__crud.kernelDb && window.__crud.kernelDb() != null,
    { timeout: 25000 }).then(() => true).catch(() => false);
  console.log('§WIRE-SIDECAR initSqlJs+sidecar-built=' + sidecarUp);

  const seeded = await page.evaluate((posts) => new Promise((res) => {
    window.__crud.withSidecar((db) => {
      try {
        posts.forEach(p => window.KernelOps.commitOp(db, 'POST', p));
        window.__crud.persist();
        setTimeout(() => res({ ok: true, n: posts.length }), 300);
      } catch (e) { res({ ok: false, err: String(e && e.message || e) }); }
    });
  }), POSTS);
  console.log('§WIRE-SEED ops=' + (seeded && seeded.n) + ' ok=' + (seeded && seeded.ok) + (seeded && seeded.err ? ' err=' + seeded.err : ''));

  const closeRes = await page.evaluate(() => window.PeriodClose.close({ period: 1, ts: 9000 })
    .then(r => ({ ok: true, r })).catch(e => ({ ok: false, err: String(e && e.message || e) })));
  const r = closeRes && closeRes.r;
  console.log('§WIRE-CLOSE ok=' + (closeRes && closeRes.ok) + (closeRes && closeRes.err ? ' err=' + closeRes.err : '') +
    (r ? ' period=' + r.period + ' archived=' + r.archived + ' liveLen=' + r.liveLen + ' signed=' + (r.sig ? 'Y' : 'N') +
         ' closing=' + JSON.stringify(r.closing_balances) : ''));

  // ── session 2: RELOAD (same context → IDB survives) — boot must open from the checkpoint (b/f) ──
  logs.length = 0;
  await page.reload({ waitUntil: 'networkidle' });
  await ready(page).catch(() => {});
  await page.waitForFunction(() => window.__pcloseBfSeen === true ||
    (window.performance && true), { timeout: 1000 }).catch(() => {});
  await page.waitForTimeout(1200);   // PeriodClose.boot runs ~300ms after DOMContentLoaded
  const bfLog = logs.find(l => l.includes('§PCLOSE-BF-LIVE')) || '(no bootstrap log)';
  console.log('§WIRE-RELOAD ' + bfLog);

  // independent read of the persisted opening balances after reload
  const afterBoot = await page.evaluate(() => new Promise((res) => {
    window.__crud.withSidecar((db) => {
      try {
        const bf = window.ErpPeriodClose.bootstrapFromCheckpoint(db, window.KernelOps);
        res({ fromCk: !!bf.fromCheckpoint, period: bf.period, bal: bf.balances || bf.current || bf.bal || {} });
      } catch (e) { res({ err: String(e && e.message || e) }); }
    });
  }));
  console.log('§WIRE-BF afterReload fromCheckpoint=' + (afterBoot && afterBoot.fromCk) +
    ' period=' + (afterBoot && afterBoot.period) + ' balances=' + JSON.stringify(afterBoot && afterBoot.bal));

  // ── verdict ──
  function balEq(a, b) { const ks = {}; let max = 0; for (const k in a) ks[k] = 1; for (const k in b) ks[k] = 1;
    for (const k in ks) max = Math.max(max, Math.abs((a[k] | 0) - (b[k] | 0))); return max; }
  const closingOk = !!(r && balEq(r.closing_balances, EXPECT) === 0 && Object.keys(r.closing_balances).length === 3);
  const signedOk  = !!(r && r.sig);
  const compactOk = !!(r && r.archived >= POSTS.length && r.liveLen === 1);
  const bfOk      = !!(afterBoot && afterBoot.fromCk && balEq(afterBoot.bal, EXPECT) === 0);
  const bfLogOk   = /fromCheckpoint=Y/.test(bfLog);

  console.log('   ' + (wired ? '🟢' : '🔴') + ' W1 substrate wired into app (PeriodClose/ErpPeriodClose/KernelOps/ErpSigner/__crud) renderInto=' + hasRender);
  console.log('   ' + (closingOk ? '🟢' : '🔴') + ' W2 close folds real POST ops → closing balances == expected net DR−CR (AR settles to 0)');
  console.log('   ' + (signedOk ? '🟢' : '🔴') + ' W3 checkpoint signed by the app edge signer (signed=Y)');
  console.log('   ' + (compactOk ? '🟢' : '🔴') + ' W4 compaction: pre-checkpoint ops archived, live log = 1 (checkpoint anchor)');
  console.log('   ' + (bfOk ? '🟢' : '🔴') + ' W5 RELOAD bootstraps from checkpoint — opening balances == balance b/f (no genesis re-fold)');
  console.log('   ' + (bfLogOk ? '🟢' : '🔴') + ' W6 boot emitted §PCLOSE-BF-LIVE fromCheckpoint=Y');

  const pass = wired && hasRender && closingOk && signedOk && compactOk && bfOk && bfLogOk && errs.length === 0;
  console.log('§INTEG-WIRE-RESULT ' + (pass ? 'PASS' : 'FAIL') + ' pageErrors=' + (errs.length ? errs.join('|') : 0));

  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
