// ⚠ DO NOT REMOVE — Scope guard
// Scope: deploy-boundary FRESHNESS witness for the init-bubble stale-while-revalidate change (PR #188,
//   ERP_INIT_BUBBLE_INSTANT.md). SWR buys an instant warm first paint — but the question the closing session
//   flagged: does a FRESH DEPLOY reach a returning user IN ONE RELOAD, or does the old SW serve stale HTML
//   first? This WITNESSES it (don't assert — characterise): simulate a deploy by flipping the served
//   erp.html build marker + bumping the served sw.js CACHE_VERSION, then count reloads until the user SEES
//   the new build. PROVES/DISPROVES: "SWR converges a deploy to a returning user within one (auto-)reload."
//   The mitigation under test = a page-side `controllerchange → location.reload()` one-shot, so when the new
//   SW claims the page the browser refreshes once onto the fresh shell.
// Run:  node tests/poc_init_deploy_fresh.js 2>&1 | tee tests/poc_init_deploy_fresh.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png' };

let BUILD = 'A';   // flipped to 'B' to simulate a deploy (new HTML + new SW version)

// Serve the erp tree, but: inject a build marker into erp.html, and rewrite sw.js's CACHE_VERSION to a
// per-BUILD value so a "deploy" produces genuinely new sw.js bytes → the browser installs a new SW.
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/erp.html';
  fs.readFile(path.join(ROOT, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    let body = b;
    if (p.endsWith('erp.html')) {
      body = Buffer.from(b.toString('utf8').replace('<head>', '<head><script>window.__BUILD=' + JSON.stringify(BUILD) + ';</script>'));
    } else if (p.endsWith('sw.js')) {
      body = Buffer.from(b.toString('utf8').replace(/const CACHE_VERSION = '[^']*'/, "const CACHE_VERSION = 'swtest-" + BUILD + "'"));
    }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    r.end(body);
  });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function loadAndRead(pg, port) {
  await pg.goto(`http://localhost:${port}/erp.html`, { waitUntil: 'commit' });
  // wait for the bubble shell so the page is genuinely up, then read the build marker the user is served.
  await pg.waitForFunction(() => { const l = document.getElementById('loading'); return (!l || getComputedStyle(l).display === 'none') && typeof window.__BUILD !== 'undefined'; }, { timeout: 20000 }).catch(()=>{});
  return pg.evaluate(() => window.__BUILD);
}

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await chromium.launch();
  const ctx = await br.newContext();
  const pg = await ctx.newPage();
  const errs = [], logs = []; pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { const t = m.text(); if (/§SW_|§SW_UPDATE|controllerchange/.test(t)) logs.push(t); });

  // ── prime: returning user on build A (SW-A installs, controls, precaches html-A) ──
  await loadAndRead(pg, port);                 // load 1: SW-A registers
  await sleep(800);
  const warmA = await loadAndRead(pg, port);   // load 2: warm, controlled by SW-A → serves A
  console.log('§INIT-DEPLOY-FRESH prime build=' + warmA + ' (warm, SW-A controlling)');

  // ── DEPLOY: flip the server to build B (new html + new sw.js version) ──
  BUILD = 'B';
  console.log('§INIT-DEPLOY-FRESH ▶ deployed build=B (server now serves html-B + sw swtest-B)');

  // reload 1 after deploy. With the controllerchange→reload mitigation, the new SW claiming the page
  // triggers ONE automatic refresh onto the fresh shell — so a single user reload converges to B.
  const r1 = await loadAndRead(pg, port);
  await sleep(2500);                            // allow SW-B install/activate/claim + any auto-reload
  let r1Settled; try { r1Settled = await pg.evaluate(() => window.__BUILD); } catch (e) { await sleep(500); r1Settled = await pg.evaluate(() => window.__BUILD); }
  const reg = await pg.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? { active: r.active && r.active.state, waiting: !!r.waiting, installing: !!r.installing } : null; });
  console.log('§INIT-DEPLOY-FRESH swState=' + JSON.stringify(reg) + ' swLogs=[' + logs.join(' | ') + ']');
  // reload 2 (a second manual reload) — the unconditional convergence backstop.
  const r2 = await loadAndRead(pg, port);

  console.log('§INIT-DEPLOY-FRESH afterDeploy reload1=' + r1 + ' reload1Settled=' + r1Settled + ' reload2=' + r2 + ' pageErrors=' + (errs.length ? errs.join('|') : 0));
  const oneReload = (r1Settled === 'B');        // did ONE user reload (incl. any auto-reload) reach B?
  const converged = (r2 === 'B');               // converged within two reloads at the latest
  console.log('§INIT-DEPLOY-FRESH oneReloadConverges=' + (oneReload ? 'Y' : 'N') + ' convergedBy2=' + (converged ? 'Y' : 'N'));

  await br.close(); server.close();
  const pass = converged && errs.length === 0;
  console.log('§INIT-DEPLOY-FRESH-RESULT ' + (pass ? 'PASS' : 'FAIL') + ' — fresh deploy reaches returning user: ' + (oneReload ? 'in ONE reload' : (converged ? 'in TWO reloads (no auto-refresh)' : 'NEVER (stuck stale)')));
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('FATAL ' + e.message); process.exit(2); });
