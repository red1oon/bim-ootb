// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for §MOBILE-VIEW (prompts/MOBILE_CARDS.md) — the AD record LIST renders as
//   stacked .acc CARDS at ≤760px INSTEAD of the desktop multi-column <table class="idmp-grid">, and the desktop
//   grid is unchanged >760px. PROVES (issue: "list is a desktop spreadsheet squeezed onto the phone — side-
//   scrolling, Name column off-screen, pill rail overlaps rows"):
//     1. @390px: cards rendered (N>0), the <table class="idmp-grid"> is display:none, .idmp-cards is shown,
//        the pill rail is docked along the BOTTOM (not the right edge over the records).
//     2. @1280px (desktop): the <table class="idmp-grid"> still renders (cards hidden) — desktop EXACTLY as-is.
//     3. 0 pageerrors at both viewports.
//   NON-INVENT: cards show the SAME _displayFields(tab) the grid uses, read from the loaded ad_seed/12-odoo db.
//   §-log first — READ tests/poc_mobile_cards.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_mobile_cards.js 2>&1 | tee tests/poc_mobile_cards.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/idempiere.html'; fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });

// read the §MOBILE-VIEW line + measure the table/cards/pill-rail in the live DOM at the current viewport.
function probe(pg) {
  return pg.evaluate(() => {
    var host = document.getElementById('idmp-content');
    var tbl = host ? host.querySelector('.idmp-grid') : null;
    var cds = host ? host.querySelector('.idmp-cards') : null;
    var rail = document.getElementById('idmp-pillrail');
    var vh = document.documentElement.clientHeight;
    var railBottomDocked = false;
    if (rail) { var rb = rail.getBoundingClientRect(); railBottomDocked = (rb.bottom >= vh - 2 && rb.left <= 2); }
    return {
      cards: cds ? cds.querySelectorAll('.acc').length : 0,
      tableExists: !!tbl,
      tableHidden: tbl ? getComputedStyle(tbl).display === 'none' : true,
      cardsShown: cds ? getComputedStyle(cds).display !== 'none' : false,
      railBottomDocked: railBottomDocked
    };
  });
}

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await chromium.launch();

  // ── PHONE 390x844 ──
  const errsM = [], logsM = [];
  const pgM = await br.newPage(); await pgM.setViewportSize({ width: 390, height: 844 });
  pgM.on('pageerror', e => errsM.push(e.message)); pgM.on('console', m => logsM.push(m.text()));
  // before screenshot: the bare load (placeholder) at 390px
  await pgM.goto(`http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=140`, { waitUntil: 'networkidle' });
  await pgM.screenshot({ path: path.join(__dirname, 'mobile_cards_before_390.png') });
  await pgM.waitForFunction(() => !!document.querySelector('#idmp-content .idmp-cards .acc'), { timeout: 15000 }).catch(() => {});
  await pgM.waitForTimeout(400);
  const m = await probe(pgM);
  await pgM.screenshot({ path: path.join(__dirname, 'mobile_cards_after_390.png') });
  const mvLine = logsM.filter(l => l.startsWith('§MOBILE-VIEW')).pop() || '(no §MOBILE-VIEW line)';
  console.log('390px ' + mvLine);
  console.log('390px probe cards=' + m.cards + ' tableHidden=' + m.tableHidden + ' cardsShown=' + m.cardsShown + ' railBottomDocked=' + m.railBottomDocked + ' pageErrors=' + (errsM.length ? errsM.join('|') : 0));
  await pgM.close();

  // ── DESKTOP 1280x900 ──
  const errsD = [], logsD = [];
  const pgD = await br.newPage(); await pgD.setViewportSize({ width: 1280, height: 900 });
  pgD.on('pageerror', e => errsD.push(e.message)); pgD.on('console', m2 => logsD.push(m2.text()));
  await pgD.goto(`http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=140`, { waitUntil: 'networkidle' });
  await pgD.waitForFunction(() => !!document.querySelector('#idmp-content .idmp-grid tbody tr'), { timeout: 15000 }).catch(() => {});
  await pgD.waitForTimeout(400);
  const d = await probe(pgD);
  await pgD.screenshot({ path: path.join(__dirname, 'mobile_cards_desktop_1280.png') });
  console.log('1280px probe tableExists=' + d.tableExists + ' tableHidden=' + d.tableHidden + ' cardsShown=' + d.cardsShown + ' pageErrors=' + (errsD.length ? errsD.join('|') : 0));
  await pgD.close();

  // ── Verdict ──
  var mobileOk  = m.cards > 0 && m.tableHidden === true && m.cardsShown === true && m.railBottomDocked === true && errsM.length === 0;
  var desktopOk = d.tableExists === true && d.tableHidden === false && d.cardsShown === false && errsD.length === 0;
  var pass = mobileOk && desktopOk;
  console.log('§MOBILE-VIEW cards=' + m.cards + ' tableHidden@≤760=' + (m.tableHidden ? 'Y' : 'N') +
    ' cardsShown@≤760=' + (m.cardsShown ? 'Y' : 'N') + ' pillRail=bottom@≤760:' + (m.railBottomDocked ? 'Y' : 'N') +
    ' desktopTable=' + (desktopOk ? 'Y' : 'N') + ' mobileOk=' + mobileOk + ' desktopOk=' + desktopOk);
  console.log('§MOBILE-VIEW ' + (pass ? 'PASS' : 'FAIL'));
  await br.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
