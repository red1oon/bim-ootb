// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness — Find panel category → › ERP → Project Order, on the CIVIL model (CivilWorks.db).
//   Mirror of poc_find_erp_link_live.js (SampleHouse) with the civil-specific steps:
//     1. wait for streaming COMPLETE (§MERGE_CONTRACT verdict=COMPLETE, streaming.js ~2399) — NOT just "APP.db ready".
//     2. select a category the way a user does: axis toggle → Discipline lens → tap a discipline row (§FIND_MULTISEL).
//     3. › ERP → §PROJ_PUSH_LINK project==record, erp_pushed cue, green "open ↗" → window 130.
//     4. read the created Project Order lines back out of the persisted ERP store, print as § lines.
//     5. negative leg: no selection → reject status + erp_reject cue.
//   INCONCLUSIVE (exit 2) if load never completes or nothing selectable. NEVER PASS when nothing was judged.
//   READ tests/witness_civil_find_erp_push.log before any conclusion (exit code is NOT evidence).
// Needs viewer/buildings/CivilWorks.db (symlink to the user's file; read-only).  DB=buildings/X.db BLD=name override.
// Run:  cd <wt>/viewer && node tests/witness_civil_find_erp_push.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DB = process.env.DB || 'buildings/CivilWorks.db', BLD = process.env.BLD || 'CivilWorks';
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
let fails = 0, inconclusive = null;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? 'OK  ' : 'FAIL') + ' ' + label + (detail ? ' — ' + detail : '')); }
const seen = re => log.some(l => re.test(l));
function finish(browser) {
  const pass = !inconclusive && fails === 0;
  S('\n§W-CIVIL-FIND-ERP ' + (inconclusive ? 'INCONCLUSIVE (' + inconclusive + ')' : pass ? 'PASS' : 'FAIL (fails=' + fails + ')'));
  fs.writeFileSync(path.join(__dirname, 'witness_civil_find_erp_push.log'), log.join('\n'));
  return browser.close().then(() => { server.close(); process.exit(inconclusive ? 2 : pass ? 0 : 1); });
}
(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', m => log.push('  [console] ' + m.text()));
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });
  S('§W-CIVIL-FIND-ERP — Find category › ERP → Project Order (' + DB + ')');
  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=' + DB + '&bld=' + BLD, { waitUntil: 'networkidle' });

  // 1. wait for load COMPLETE
  let ready = false, done = false;
  for (let i = 0; i < 300 && !done; i++) {
    await page.waitForTimeout(1000);
    try { ready = await page.evaluate(() => !!(window.APP && window.APP.db && window.APP.dbQuery && window.ProjFold && window.APP._SQL && window.__sfx)); } catch (e) {}
    done = ready && seen(/§MERGE_CONTRACT .*verdict=COMPLETE/);
    if (!done && ready && seen(/§MERGE_CONTRACT .*verdict=INCOMPLETE/)) break;
  }
  verdict(ready, 'viewer model + ProjFold + sql.js factory + __sfx ready');
  S('   §LOAD ' + (log.filter(l => /§MERGE_CONTRACT/.test(l)).slice(-1)[0] || '(no §MERGE_CONTRACT line)').trim());
  if (!done) { inconclusive = 'load never reached §MERGE_CONTRACT verdict=COMPLETE'; return finish(browser); }
  await page.waitForTimeout(3000);

  // 2. open Find, Discipline lens, pick a category
  await page.evaluate(() => window.APP.openFindPanel());
  await page.waitForTimeout(1500);
  for (let k = 0; k < 6; k++) {
    const ax = await page.evaluate(() => { const b = document.getElementById('find-axis-toggle'); return b && b.getAttribute('data-axis'); });
    if (ax === 'disc') break;
    await page.evaluate(() => { const b = document.getElementById('find-axis-toggle'); if (b) b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
    await page.waitForTimeout(800);
  }
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-find-parent]')).map(r => ({
    v: r.getAttribute('data-find-parent'), n: parseInt((r.lastChild.textContent.match(/\((\d+)\)/) || [0, 0])[1], 10) })));
  S('   §FIND_CATEGORIES ' + JSON.stringify(rows));
  // ── negative leg FIRST (nothing selected yet): reject status + cue
  await page.evaluate(() => { const b = document.getElementById('find-erp-btn'); if (b) b.click(); });
  await page.waitForTimeout(800);
  verdict(seen(/§PROJ_PUSH_AUDIO id=erp_reject/), 'no-selection push → REJECT audio cue');
  const rej = await page.evaluate(() => { const s = document.getElementById('status'); return s ? s.textContent : ''; });
  verdict(/Select something/i.test(rej), 'no-selection push → clear status message', rej);

  const pick = rows.filter(r => r.n > 0 && r.n <= 25000).sort((a, b) => (/pave|light|road/i.test(b.v) ? 1 : 0) - (/pave|light|road/i.test(a.v) ? 1 : 0) || b.n - a.n)[0];
  if (!pick) { inconclusive = 'no selectable discipline category in Find tree'; return finish(browser); }
  S('   §FIND_PICK discipline=' + pick.v + ' elements=' + pick.n);
  // plain-tap the first category, then Ctrl-tap more civil categories (a user's multi-select) → several priced classes/lines
  const extra = ['LIGHTING', 'DRAINAGE', 'SIGNAGE', 'MARKING'].filter(v => rows.some(r => r.v === v && r.n > 0));
  const tap = (v, ctrl) => page.evaluate(([v, ctrl]) => { const r = document.querySelector('[data-find-parent="' + v + '"]');
    r.children[1].dispatchEvent(new PointerEvent('pointerup', { bubbles: true, ctrlKey: ctrl })); }, [v, ctrl]);
  await tap(pick.v, false); await page.waitForTimeout(1500);
  for (const v of extra) { await tap(v, true); await page.waitForTimeout(1500); }
  S('   §FIND_PICK_MULTI ' + [pick.v].concat(extra).join('+'));
  await page.waitForTimeout(2500);
  const selTxt = await page.evaluate(() => { const e = document.getElementById('find-selected-text'); return e ? e.textContent : ''; });
  const cost = await page.evaluate(() => { const e = document.getElementById('find-selected-cost'); return e ? e.textContent : ''; });
  S('   §FIND_SELECTED text="' + selTxt + '" cost="' + cost + '"');
  verdict(seen(/§FIND_MULTISEL mode=disc/), 'category tap registered (§FIND_MULTISEL mode=disc)');

  // 3. push
  await page.evaluate(() => { const b = document.getElementById('find-erp-btn'); if (b) b.click(); });
  for (let i = 0; i < 90 && !seen(/§PROJ_PUSH_LINK|§PROJ_PUSH_DEFER|§PROJ_PUSH_DBERR/); i++) await page.waitForTimeout(1000);
  await page.waitForTimeout(1500);
  S('   §PUSH_STATUS "' + await page.evaluate(() => { const s = document.getElementById('status'); return s ? s.textContent : ''; }) + '"');
  S(log.filter(l => /§PROJ_PUSH|§PROJ_/.test(l)).map(l => '   ' + l.trim()).join('\n'));
  const m = (log.find(l => /§PROJ_PUSH_LINK project=(\d+).*record=(\d+)/.test(l)) || '').match(/§PROJ_PUSH_LINK project=(\d+).*record=(\d+)/);
  verdict(!!m && m[1] === m[2], 'deep-link record= == created C_Project_ID', m ? 'project=' + m[1] + ' record=' + m[2] : 'absent');
  verdict(seen(/§PROJ_PUSH_AUDIO id=erp_pushed/), 'successful push → HAPPY cue (erp_pushed)');
  const link = await page.evaluate(() => { const a = document.getElementById('find-erp-open'); return a ? { vis: getComputedStyle(a).display !== 'none', href: a.getAttribute('href') || '' } : null; });
  verdict(!!link && link.vis && /idempiere\.html\?client=garden&window=130&record=\d+/.test(link.href), 'green "open ↗" VISIBLE + deep-links window 130', link ? link.href : '-');
  const pm = (log.find(l => /§PROJ_PUSH project=/.test(l)) || '').match(/lines=\+(\d+)/);
  verdict(!!pm && +pm[1] > 0, 'fold created Project Order lines', pm ? 'lines=+' + pm[1] : 'no §PROJ_PUSH fold line');

  // 4. read the created order's lines back from the persisted ERP store
  if (m) {
    const out = await page.evaluate(async (pid) => {
      try {
        const st = await window.ProjOrderState.openStore(window.APP._SQL, () => window.APP.cachedFetch('../erp/ad_seed.db'));
        const db = st.db, q = (s, p) => { const r = db.exec(s, p || []); return r.length ? r[0].values : []; };
        const hdr = q('SELECT c_project_id, name FROM c_project WHERE c_project_id=?', [pid]);
        const ords = q('SELECT c_order_id, documentno FROM c_order WHERE c_project_id=?', [pid]);   // none expected: a push folds C_Project > Phase > Task > C_ProjectLine (proj_fold.js:246-260)
        const lines = q('SELECT l.line, COALESCE(p.name,\'\'), l.description, l.plannedqty, l.plannedprice, l.plannedamt FROM c_projectline l LEFT JOIN m_product p ON p.m_product_id=l.m_product_id WHERE l.c_project_id=? ORDER BY l.line', [pid]);
        const nTask = q('SELECT COUNT(*) FROM c_projecttask t JOIN c_projectphase ph ON ph.c_projectphase_id=t.c_projectphase_id WHERE ph.c_project_id=?', [pid]);
        return { hdr, ords, lines, nTask: nTask[0] && nTask[0][0] };
      } catch (e) { return { err: String(e) }; }
    }, +m[1]);
    if (out.err) { verdict(false, 'read created Project Order back', out.err); }
    else {
      S('   §PROJ_ORDER project=' + JSON.stringify(out.hdr[0]) + ' c_order_rows=' + out.ords.length + ' projectlines=' + out.lines.length + ' tasks=' + out.nTask);
      out.lines.slice(0, 12).forEach(l => S('   §PROJ_ORDER_LINE line=' + l[0] + ' name="' + l[1] + '" desc="' + l[2] + '" qty=' + l[3] + ' price=' + l[4] + ' amt=' + l[5]));
      verdict(out.hdr.length === 1 && out.lines.length > 0 && pm && out.lines.length === +pm[1], 'Project Order read back: header + lines == §PROJ_PUSH lines', out.lines.length + ' lines');
    }
  }
  verdict(errs.length === 0, '0 pageerrors', errs.slice(0, 3).join(' | '));
  await finish(browser);
})();
