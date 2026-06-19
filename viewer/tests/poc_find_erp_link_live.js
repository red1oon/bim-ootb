// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the BIM→Project "open ↗" deep-link + push AUDIO/STATUS feedback.
//   PROVES, on the real viewer + SampleHouse model:
//     (FAIL leg)  click › ERP with NO selection → clear status ('Select something…') + a REJECT cue
//                 (§PROJ_PUSH_AUDIO id=erp_reject) — no longer a silent no-op.
//     (OK leg)    select a costable result → push folds a Project Order → green "open ↗" deep-link appears
//                 (../erp/idempiere.html?client=garden&window=130&record=<C_Project_ID>, record== created id)
//                 AND a HAPPY cue fires (§PROJ_PUSH_AUDIO id=erp_pushed). §PROJ_PUSH_LINK logged.
//     0 pageerrors. (Audio is OFF by default → the call is wired/§-logged 'played'; actual sound needs SFX on.)
//   §-log first — READ tests/poc_find_erp_link_live.log before any conclusion (exit code is NOT evidence).
// Run:  cd /tmp/wt-sfx/viewer && node tests/poc_find_erp_link_live.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
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

  S('§W-PROJ-PUSH-LINK — Find › ERP deep-link + push audio/status feedback (SampleHouse)');

  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/SampleHouse_extracted.db&bld=SampleHouse',
    { waitUntil: 'networkidle' });
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await page.waitForTimeout(1000);
    try { ready = await page.evaluate(() => !!(window.APP && window.APP.db && window.APP.dbQuery && window.ProjFold && window.APP._SQL && window.__sfx)); } catch (e) {}
  }
  verdict(ready, 'viewer model + ProjFold + sql.js factory + __sfx ready (push deps)');

  await page.evaluate(() => window.APP.openFindPanel('IfcMember'));
  await page.waitForTimeout(2500);

  // ── FAIL leg: push with NO selection → reject status + reject cue ─────────────
  await page.evaluate(() => { const b = document.getElementById('find-erp-btn'); if (b) b.click(); });
  await page.waitForTimeout(800);
  verdict(seen(/§PROJ_PUSH_AUDIO id=erp_reject/), 'no-selection push → REJECT audio cue (not a silent no-op)');
  const rejStatus = await page.evaluate(() => { var s = document.getElementById('status'); return s ? s.textContent : ''; });
  verdict(/Select something/i.test(rejStatus), 'no-selection push → clear status message', rejStatus);

  // ── OK leg: select a costable result → push → deep-link + happy cue ───────────
  const clicked = await page.evaluate(() => { const r = document.querySelector('.find-result-item'); if (r) { r.click(); return true; } return false; });
  await page.waitForTimeout(1500);
  verdict(clicked, 'a Find result was selectable (selection populated)');

  await page.evaluate(() => { const b = document.getElementById('find-erp-btn'); if (b) b.click(); });
  await page.waitForTimeout(4500);

  const linkLine = log.find(l => /§PROJ_PUSH_LINK project=(\d+).*record=(\d+)/.test(l));
  const m = linkLine && linkLine.match(/§PROJ_PUSH_LINK project=(\d+).*record=(\d+)/);
  verdict(!!m && m[1] === m[2], 'push folded → deep-link record= == created C_Project_ID', m ? ('project=' + m[1] + ' record=' + m[2]) : 'absent');
  verdict(seen(/§PROJ_PUSH_AUDIO id=erp_pushed/), 'successful push → HAPPY audio cue (erp_pushed)');
  const link = await page.evaluate(() => { const a = document.getElementById('find-erp-open'); return a ? { vis: getComputedStyle(a).display !== 'none', href: a.getAttribute('href') || '' } : null; });
  verdict(!!link && link.vis && /idempiere\.html\?client=garden&window=130&record=\d+/.test(link.href),
    'green "open ↗" link VISIBLE + deep-links Project window 130', link ? link.href : '-');

  verdict(errs.length === 0, '0 pageerrors', errs.length ? errs.slice(0, 3).join(' | ') : 'clean');

  const pass = fails === 0;
  S('\n§W-PROJ-PUSH-LINK ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ') — deep-link re-landed; push now ' +
    'gives a clear status + audio on both reject and success.');
  fs.writeFileSync(path.join(__dirname, 'poc_find_erp_link_live.log'), log.join('\n'));
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
