// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for ZOOM ACROSS v2 CARRY side (ZOOM_ACROSS_SCOPE_SESSION §SPEC, witness legs 1-3).
//   Drives the REAL registered 'viewer' destination (window.ZoomAcross.destinations()) with REAL seed rows from
//   the live __idmpDb (window.open stubbed to capture the launch URL). PROVES on GardenWorld's baked Hospital
//   BIM project (C_Project 990000, 29 c_projectline rows whose products' Value are real IFC classes):
//     0 — before any BIM visit, the pill is PURE on a non-BIM ctx (available=false).
//     1 — a focused project LINE (product Value=IfcDoor) → launch URL carries &find=IfcDoor (the finer scope).
//     2 — the project HEADER → whole-building scope: bld=Hospital, NO &find token.
//     3 — a blank / non-BIM ctx AFTER a BIM visit → NEAREST/LATEST: reuses the remembered scope (find=IfcDoor)
//         and the pill stays available (memory), never invented.
//   Every value is a real seed row (recVal/_zoomScope fold them). 0 pageerrors. §-log first — READ the .log.
// Run:  cd <repo>/erp && node tests/poc_zoom_scope_live.js   (exit 0 = PASS)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
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
const log = [], errs = []; let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => log.push('  [console] ' + m.text()));
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  S('§W-ZOOM-ACROSS-SCOPE (erp carry) — focus scope → viewer &find (Hospital BIM project, real lines)');

  // login (loads the GardenWorld client db = __idmpDb, with the baked Hospital project)
  await page.goto('http://localhost:' + port + '/idempiere.html?client=garden&window=123&record=118', { waitUntil: 'networkidle' });
  await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)', { timeout: 15000 });
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForSelector('#idmp-login-ok', { timeout: 5000 });
  await page.click('#idmp-login-ok');
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 });
  await page.waitForTimeout(800);

  // confirm the seam + db + real BIM data are present
  const env = await page.evaluate(() => {
    const d = window.ZoomAcross && window.ZoomAcross.destinations().find(x => x.id === 'viewer');
    let proj = 0, line = null;
    try {
      const r1 = window.__idmpDb.exec("SELECT value FROM c_project WHERE c_project_id=990000"); proj = r1.length ? r1[0].values[0][0] : 0;
      const r2 = window.__idmpDb.exec("SELECT pl.*, p.value AS prodval FROM c_projectline pl JOIN m_product p ON p.m_product_id=pl.m_product_id WHERE pl.c_project_id=990000 AND p.value='IfcDoor' LIMIT 1");
      if (r2.length) { const o = {}; r2[0].columns.forEach((c, i) => o[c] = r2[0].values[0][i]); line = o; }
    } catch (e) {}
    return { hasDest: !!d, proj, line };
  });
  verdict(env.hasDest, "'viewer' destination registered on the page");
  verdict(env.proj === 'Hospital', 'seed carries C_Project 990000 = Hospital', String(env.proj));
  verdict(!!env.line && env.line.prodval === 'IfcDoor', 'a real project LINE with product Value=IfcDoor exists', env.line ? ('line=' + env.line.c_projectline_id) : 'absent');

  // helper: stub window.open, run a launch with a given ctx, return the captured url
  async function launch(ctxSpec) {
    return page.evaluate((spec) => {
      window.__opened = [];
      const realOpen = window.open; window.open = (u) => { window.__opened.push(u); return null; };
      const d = window.ZoomAcross.destinations().find(x => x.id === 'viewer');
      let rec = spec.rec;
      if (spec.sql) { const r = window.__idmpDb.exec(spec.sql); rec = {}; if (r.length) r[0].columns.forEach((c, i) => rec[c] = r[0].values[0][i]); }
      const ctx = { tab: { tableName: spec.table }, rec: rec || {}, db: window.__idmpDb };
      const avail = !!d.available(ctx);
      d.launch(ctx);
      window.open = realOpen;
      return { url: window.__opened[0] || '', avail: avail };
    }, ctxSpec);
  }

  // 0 — pure on a non-BIM ctx BEFORE any BIM visit
  const pure = await launch({ table: 'c_bpartner', rec: { C_BPartner_ID: 118 } });
  verdict(pure.avail === false, '0 — pill PURE on non-BIM ctx before any BIM visit (available=false)', 'avail=' + pure.avail);

  // 1 — focused LINE → &find=IfcDoor
  const line = await launch({ table: 'c_projectline', sql: "SELECT pl.* FROM c_projectline pl JOIN m_product p ON p.m_product_id=pl.m_product_id WHERE pl.c_project_id=990000 AND p.value='IfcDoor' LIMIT 1" });
  verdict(/[?&]find=IfcDoor(\b|&|$)/.test(line.url) && /bld=Hospital/.test(line.url), '1 — project LINE carries the finer scope &find=IfcDoor', line.url);

  // 2 — HEADER → whole building, NO find
  const hdr = await launch({ table: 'c_project', sql: "SELECT * FROM c_project WHERE c_project_id=990000" });
  verdict(/bld=Hospital/.test(hdr.url) && !/[?&]find=/.test(hdr.url), '2 — project HEADER = whole building, no finer token', hdr.url);

  // 3 — nearest/latest: a non-BIM ctx AFTER the header visit reuses the LAST real scope.
  // (the header launch above set _lastBimScope to the whole-building Hospital scope: bld=Hospital, find=null)
  const fb = await launch({ table: 'c_bpartner', rec: { C_BPartner_ID: 118 } });
  verdict(fb.avail === true && /bld=Hospital/.test(fb.url), '3 — blank/non-BIM ctx → nearest/latest remembered (pill on, reuses Hospital)', 'avail=' + fb.avail + ' url=' + fb.url);

  verdict(errs.length === 0, '0 pageerrors', errs.length ? errs.slice(0, 3).join(' | ') : 'clean');

  const pass = fails === 0;
  S('\n§W-ZOOM-ACROSS-SCOPE (erp) ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'poc_zoom_scope_live.log'), log.join('\n'));
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
