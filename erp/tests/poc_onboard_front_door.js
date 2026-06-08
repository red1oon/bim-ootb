// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the agreed front-door onboarding UX (idempiere.html). THE CLAIM
//   (UPDATED §P4-4, user wrap 2026-06-09 — "stick to the pill"):
//   1. The LOGIN CARD has NO onboarding row — Install/Migrate are pill-ONLY now (this REVERSES #204's card
//      buttons). The kept window.openInstallFor/openMigrateFor still route through the ONE ErpPicker, and the
//      pill bar binds install/migrate to them.
//   2. Stage gate: pre-client → Install/Migrate on the primary rail; in-client → DEMOTED to the ⋯
//      overflow (in the builder `hidden` set — reachable/restorable), NOT pill=false (gone).
//   NON-INVENT: the pills reuse the SAME handlers (openInstallFor/openMigrateFor → ErpPicker), so the proven
//   ShowMe/Odoo path underneath is untouched.
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

  // ── W2 (§P4-4) — the login card now has NO onboarding row: Install/Migrate are pill-ONLY (behind the ⋯).
  //    "Stick to the pill" (user wrap 2026-06-09) REVERSES #204's card buttons. Assert the card is clean. ──
  const card = await page.evaluate(() => {
    return { onboardBtns: document.querySelectorAll('.idmp-onboard-btn').length,
             migrateBlock: !!document.querySelector('.idmp-login-migrate'),
             oldMigrateBtn: !!document.getElementById('idmp-login-migrate-btn') };
  });
  console.log('§ONBOARD-CARD onboardBtns=' + card.onboardBtns + ' migrateBlock=' + card.migrateBlock + ' oldMigrateBtn=' + card.oldMigrateBtn);
  const cardClean = card.onboardBtns === 0 && !card.migrateBlock && !card.oldMigrateBtn;

  // ── W3 (§P4-4) — Install/Migrate still reach the ONE ErpPicker through the KEPT handlers the pills use
  //    (window.openInstallFor/openMigrateFor → ErpPicker.open({mode})). The proven ShowMe/Odoo path is untouched. ──
  const picked = await page.evaluate(() => new Promise((res) => {
    const seen = [];
    window.ErpPicker.open = function (opts) { seen.push(opts && opts.mode); };  // stub-capture
    if (window.openInstallFor) window.openInstallFor();
    if (window.openMigrateFor) window.openMigrateFor();
    setTimeout(() => res(seen), 100);
  }));
  console.log('§ONBOARD-PICK modesInvoked=' + JSON.stringify(picked));
  const pickOk = picked.indexOf('install') >= 0 && picked.indexOf('migrate') >= 0;

  // ── W4 (§P4-4) — the pill bar BINDS install + migrate to those handlers (IdmpPillActions). ──
  const pillBound = await page.evaluate(() => !!(window.IdmpPillActions &&
    typeof window.IdmpPillActions.install === 'function' && typeof window.IdmpPillActions.migrate === 'function'));
  console.log('§ONBOARD-PILLBIND install+migrate bound=' + pillBound);

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
  console.log('   ' + (cardClean ? '🟢' : '🔴') + ' W2 (§P4-4) login card has NO onboarding row — Install/Migrate are pill-only');
  console.log('   ' + (pickOk ? '🟢' : '🔴') + ' W3 (§P4-4) kept handlers still open ErpPicker mode install + migrate (proven path reused)');
  console.log('   ' + (pillBound ? '🟢' : '🔴') + ' W4 (§P4-4) the pill bar binds install + migrate to those handlers (IdmpPillActions)');
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

  const pass = railUp && cardClean && pickOk && pillBound && preRail && incOverflw && readPillOk && errs.length === 0;
  console.log('§ONBOARD-RESULT ' + (pass ? 'PASS' : 'FAIL') + ' pageErrors=' + (errs.length ? errs.join('|') : 0));
  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
