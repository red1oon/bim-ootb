// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the agreed front-door onboarding UX (idempiere.html). THE CLAIM:
//   1. The LOGIN CARD carries Install + Migrate as first-class buttons, BOTH routed through the one
//      ErpPicker (mode:install / mode:migrate) — the lone direct-ShowMe card button is gone.
//   2. Stage gate: pre-client → Install/Migrate on the primary rail; in-client → DEMOTED to the ⋯
//      overflow (in the builder `hidden` set — reachable/restorable), NOT pill=false (gone).
//   NON-INVENT: the card buttons reuse the SAME handlers as the rail pills (openInstallFor/openMigrateFor
//   → ErpPicker), so the proven ShowMe/Odoo path underneath is untouched.
//   §-log first — READ poc_onboard_front_door.log before any conclusion.
// Run:  node tests/poc_onboard_front_door.js 2>&1 | tee tests/poc_onboard_front_door.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.wasm':'application/wasm', '.css':'text/css', '.png':'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const url = `http://localhost:${port}/idempiere.html`;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  const railUp = await page.waitForFunction(
    () => window.IdmpPills && window.IdmpPills.builder && window.ErpPicker && window.openInstallFor && window.openMigrateFor,
    { timeout: 20000 }).then(() => true).catch(() => false);

  // ── W1/W2 — the login card onboarding buttons (and the old direct-ShowMe button is gone) ──
  const card = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.idmp-onboard-btn')).map(b => b.textContent.trim());
    return { btns, oldShowMe: !!document.getElementById('idmp-login-migrate-btn') };
  });
  const hasInstall = card.btns.some(t => /Install/i.test(t));
  const hasMigrate = card.btns.some(t => /Migrate/i.test(t));
  console.log('§ONBOARD-CARD buttons=' + JSON.stringify(card.btns) + ' oldShowMeButton=' + card.oldShowMe);

  // ── W3 — clicking the card buttons opens ErpPicker with the right mode (stub to capture) ──
  const picked = await page.evaluate(() => new Promise((res) => {
    const seen = [];
    window.ErpPicker.open = function (opts) { seen.push(opts && opts.mode); };  // stub-capture
    document.getElementById('idmp-login').style.display = 'flex';                // ensure card visible
    const btns = Array.from(document.querySelectorAll('.idmp-onboard-btn'));
    const inB = btns.find(b => /Install/i.test(b.textContent)), miB = btns.find(b => /Migrate/i.test(b.textContent));
    if (inB) inB.click(); if (miB) miB.click();
    setTimeout(() => res(seen), 100);
  }));
  console.log('§ONBOARD-PICK modesInvoked=' + JSON.stringify(picked));
  const pickOk = picked.indexOf('install') >= 0 && picked.indexOf('migrate') >= 0;

  // ── W4/W5 — stage gate: pre-client = rail, in-client = ⋯ overflow (hidden, not gone) ──
  async function stageProbe(stage) {
    logs.length = 0;
    return page.evaluate((s) => {
      window.IdmpPills.setStage(s);
      var cfg = window.IdmpPills.builder.getConfig();
      var ids = (window.IdmpPills.builder.getConfig().order || []);
      return { hidden: cfg.hidden || [], hasInstallAction: ids.indexOf('install') >= 0 || true };
    }, stage).then(r => ({ ...r, log: logs.find(l => l.includes('§IDMP-LIFECYCLE')) || '' }));
  }
  // force a clean stage transition each way (setStage no-ops if unchanged)
  await page.evaluate(() => window.IdmpPills.setStage('in-client'));
  const pre = await stageProbe('pre-client');
  const inc = await stageProbe('in-client');
  console.log('§ONBOARD-STAGE pre-client hidden=' + JSON.stringify(pre.hidden) + ' | ' + pre.log);
  console.log('§ONBOARD-STAGE in-client hidden=' + JSON.stringify(inc.hidden) + ' | ' + inc.log);
  const preRail   = pre.hidden.indexOf('install') < 0 && pre.hidden.indexOf('migrate') < 0 && /install=rail/.test(pre.log);
  const incOverflw = inc.hidden.indexOf('install') >= 0 && inc.hidden.indexOf('migrate') >= 0 && /install=overflow/.test(inc.log);

  // ── verdict ──
  console.log('   ' + (railUp ? '🟢' : '🔴') + ' W1 idempiere onboarding wired (IdmpPills/ErpPicker/openInstallFor/openMigrateFor present)');
  console.log('   ' + (hasInstall && hasMigrate ? '🟢' : '🔴') + ' W2 login card has Install + Migrate first-class buttons');
  console.log('   ' + (!card.oldShowMe ? '🟢' : '🔴') + ' W3 the lone direct-ShowMe card button is removed (single ErpPicker path)');
  console.log('   ' + (pickOk ? '🟢' : '🔴') + ' W4 card buttons open ErpPicker with mode install + migrate (proven path reused)');
  console.log('   ' + (preRail ? '🟢' : '🔴') + ' W5 pre-client: Install/Migrate on the primary rail (front door)');
  console.log('   ' + (incOverflw ? '🟢' : '🔴') + ' W6 in-client: Install/Migrate DEMOTED to ⋯ overflow (hidden-set, restorable — not gone)');

  // ── W7 — the 'Read / Compare' paper is now a (lightbulb) PILL on iDempiere, wired to openReadCompare ──
  const erpdoc = await page.evaluate(() => {
    var cfg = window.IdmpPills.builder.getConfig();
    return { inOrder: (cfg.order || []).indexOf('erpdoc') >= 0,
             handler: !!(window.IdmpPillActions && typeof window.IdmpPillActions.erpdoc === 'function') };
  });
  // pre-client rail should include erpdoc (never stage-gated)
  await page.evaluate(() => window.IdmpPills.setStage('pre-client'));
  const erpdocShown = await page.evaluate(() => {
    var b = window.IdmpPills.builder, cfg = b.getConfig();
    return (cfg.hidden || []).indexOf('erpdoc') < 0 && (cfg.order || []).indexOf('erpdoc') >= 0;
  });
  console.log('§ONBOARD-READPILL inOrder=' + erpdoc.inOrder + ' handler=' + erpdoc.handler + ' shownPreClient=' + erpdocShown);
  const readPillOk = erpdoc.inOrder && erpdoc.handler && erpdocShown;
  console.log('   ' + (readPillOk ? '🟢' : '🔴') + ' W7 Read/Compare lives in a pill (id=erpdoc) wired to openReadCompare — not a stray link');

  const pass = railUp && hasInstall && hasMigrate && !card.oldShowMe && pickOk && preRail && incOverflw && readPillOk && errs.length === 0;
  console.log('§ONBOARD-RESULT ' + (pass ? 'PASS' : 'FAIL') + ' pageErrors=' + (errs.length ? errs.join('|') : 0));
  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
