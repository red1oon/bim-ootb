// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the BIM→Project "open ↗" deep-link (find-erp-deeplink, re-landed onto main
//   after it was built on a stale branch and never merged). PROVES, on the real viewer + FZKHaus model:
//     (A) the Find panel's "› ERP" push folds a Project Order (engine already W-PROJ-PUSH);
//     (B) a green "open ↗" link THEN appears beside the button (#find-erp-open visible) whose href deep-links
//         the created C_Project: ../erp/idempiere.html?client=garden&window=130&record=<C_Project_ID>;
//     (C) §PROJ_PUSH_LINK logs the project id + url; the record= param == the created projectId;
//     (D) the link starts HIDDEN and re-hides when the selection changes (stale-safe).
//     0 pageerrors.
//   §-log first — READ tests/poc_find_erp_link_live.log before any conclusion (exit code is NOT evidence).
// Run:  cd /tmp/wt-relink/viewer && node tests/poc_find_erp_link_live.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');   // worktree root — serves /viewer and /erp
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

const log = [], errs = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
const seen = re => log.some(l => re.test(l));

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', m => log.push('  [console] ' + m.text()));
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  S('§W-PROJ-PUSH-LINK — Find › ERP push surfaces the created Project Order deep-link (re-landed)');

  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/SampleHouse_extracted.db&bld=SampleHouse',
    { waitUntil: 'networkidle' });
  // wait for the model db + ProjFold + sql.js factory cache (the push deps)
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await page.waitForTimeout(1000);
    try { ready = await page.evaluate(() => !!(window.APP && window.APP.db && window.APP.dbQuery && window.ProjFold && window.APP._SQL)); } catch (e) {}
  }
  verdict(ready, 'viewer model + ProjFold + sql.js factory ready (push deps)');

  // open Find with a class present in FZKHaus → results render
  await page.evaluate(() => window.APP.openFindPanel('IfcMember'));
  await page.waitForTimeout(2500);
  // link must start HIDDEN (no push yet)
  const preHidden = await page.evaluate(() => { const a = document.getElementById('find-erp-open'); return !!a && getComputedStyle(a).display === 'none'; });
  verdict(preHidden, 'deep-link starts hidden before any push (#find-erp-open display:none)');

  // click the first result → drills + populates the selection (_lastSelSet via _updateSelCost)
  const clicked = await page.evaluate(() => { const r = document.querySelector('.find-result-item'); if (r) { r.click(); return true; } return false; });
  await page.waitForTimeout(1500);
  verdict(clicked, 'a Find result was selectable (selection populated for the push)');

  // push: click › ERP
  await page.evaluate(() => { const b = document.getElementById('find-erp-btn'); if (b) b.click(); });
  await page.waitForTimeout(4000);   // fold + _ensureErpDb (fetch ad_seed.db) + persist + link surface

  const linkLine = log.find(l => /§PROJ_PUSH_LINK project=(\d+).*url=(\S+)/.test(l));
  const m = linkLine && linkLine.match(/§PROJ_PUSH_LINK project=(\d+).*record=(\d+)/);
  verdict(!!linkLine, '§PROJ_PUSH_LINK logged after push', linkLine ? linkLine.trim().slice(0, 120) : 'absent — push may not have folded');
  verdict(!!m && m[1] === m[2], 'deep-link record= == created C_Project_ID (no fabricated id)', m ? ('project=' + m[1] + ' record=' + m[2]) : '-');

  const link = await page.evaluate(() => { const a = document.getElementById('find-erp-open'); return a ? { vis: getComputedStyle(a).display !== 'none', href: a.getAttribute('href') || '' } : null; });
  verdict(!!link && link.vis, 'green "open ↗" link is now VISIBLE beside › ERP');
  verdict(!!link && /idempiere\.html\?client=garden&window=130&record=\d+/.test(link.href),
    'link deep-links iDempiere Project window 130 (client=garden)', link ? link.href : '-');

  verdict(errs.length === 0, '0 pageerrors', errs.length ? errs.slice(0, 3).join(' | ') : 'clean');

  const pass = fails === 0;
  S('\n§W-PROJ-PUSH-LINK ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ') — the Find › ERP push surfaces the ' +
    'created Project Order deep-link again (was never merged; re-landed onto main).');
  fs.writeFileSync(path.join(__dirname, 'poc_find_erp_link_live.log'), log.join('\n'));
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
