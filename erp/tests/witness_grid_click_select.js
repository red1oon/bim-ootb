// ⚠ DO NOT REMOVE — W-GRID-CLICK (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §GRID-CLICK). READ THE LOG after every run: the §WGC lines carry the evidence, exit code is not.
// THE ISSUE it proves/disproves: legacy GridView.java:1031-1072 ON_CLICK - a click on a row that is NOT the current row only SELECTS it (GridTab.navigate: toolbar, Zoom Across, lens
//   act on it); a click on the CURRENT row enters edit mode. The twin opened the inline editor on any row and left the current record on row 0 (W-FRIENDLY-OPS F8: a click on order
//   80001's row, then Zoom Across reported PP_Order_ID=9900000).
//   C1 click an editable cell of the 2nd row -> NO editor opens, still grid view, Zoom Across reports the 2nd row's key, `§GRID-SELECT row=1`
//   C2 click the same cell again (now the current row) -> the inline editor opens on the 2nd row (Escape reverts, nothing written)
//   C3 the 2nd row's <tr> carries idmp-grid-cur, the 1st does not
// Run: node erp/tests/witness_grid_click_select.js > <log>   (RED on main before §GRID-CLICK, GREEN after)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); }); });
let fails = 0, judged = 0;
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { fails++; console.log('§WGC ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info)); return; }
  judged++; if (!cond) fails++; console.log('§WGC ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + (cond ? '' : ' ' + JSON.stringify(info))); };
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const logs = [], errs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => errs.push(e.message));
  try {
    await page.goto('http://localhost:' + server.address().port + '/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=123', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {   // same entry as W-INPLACE-GRID-LIVE: pick the login user when the URL did not log in
      const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)'); if (u) { await u.click(); const okb = await page.$('#idmp-login-ok'); if (okb) await okb.click(); }
      await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {}); });   // rows appear only after the legacy Find step (showAllRows)
    await require('./legacy_open.js').showAllRows(page);
    await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 15000 }); await page.waitForTimeout(700);
    // the 2nd row's first editable text cell
    const pick = await page.evaluate(() => { const rows = Array.from(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]')); if (rows.length < 2) return { rows: rows.length };
      const pref = ['Name', 'Value', 'Description', 'Name2']; const tds = Array.from(rows[1].querySelectorAll('td.idmp-gcell[data-ad-col]'));
      const td = pref.map(c => tds.find(t => t.getAttribute('data-ad-col') === c)).find(Boolean) || tds[0];
      return { rows: rows.length, col: td ? td.getAttribute('data-ad-col') : null, key0: rows[0].getAttribute('data-ad-record'), key1: rows[1].getAttribute('data-ad-record') }; });
    console.log('§WGC grid ' + JSON.stringify(pick));
    if (!pick.col) { verdict('C1', 'a grid with >= 2 rows and an editable cell', false, pick, true); throw new Error('no fixture'); }
    const cell = (k) => page.evaluate(({ k, col }) => { const td = document.querySelector('.idmp-grid tbody tr[data-ad-record="' + k + '"] td[data-ad-col="' + col + '"]'); return { editing: !!(td && td.classList.contains('idmp-cell-edit')), input: !!(td && td.querySelector('input.cfi, select.cfi')), grid: !!document.querySelector('.idmp-grid tbody tr[data-ad-record]') }; }, { k, col: pick.col });
    const click = (k) => page.evaluate(({ k, col }) => { const td = document.querySelector('.idmp-grid tbody tr[data-ad-record="' + k + '"] td[data-ad-col="' + col + '"]'); if (td) td.click(); return !!td; }, { k, col: pick.col });
    const zoomKey = async () => { const n = logs.length; await page.locator('#idmp-toolbar [data-tb="zoomacross"]').first().click(); await page.waitForTimeout(800); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      const l = logs.slice(n).find(x => /§ZOOM-ACROSS table=/.test(x)) || ''; const m = / key=\w+=(\S+)/.exec(l); return m ? m[1] : null; };
    // C1
    let n0 = logs.length; await click(pick.key1); await page.waitForTimeout(900);
    const c1 = await cell(pick.key1), sel = logs.slice(n0).find(x => /^§GRID-SELECT /.test(x)) || null, z1 = await zoomKey();
    verdict('C1', 'a click on the 2nd row (' + pick.col + ') selects it: editor ' + c1.editing + ', grid view ' + c1.grid + ', Zoom Across key ' + z1 + ' (row 2 = ' + pick.key1 + ', row 1 = ' + pick.key0 + '), ' + (sel || 'no §GRID-SELECT'),
      !c1.editing && c1.grid && String(z1) === String(pick.key1) && !!sel && / row=1 /.test(sel), { c1, z1, sel });
    // C3
    const cur = await page.evaluate(({ k0, k1 }) => ({ r0: !!document.querySelector('.idmp-grid tbody tr[data-ad-record="' + k0 + '"].idmp-grid-cur'), r1: !!document.querySelector('.idmp-grid tbody tr[data-ad-record="' + k1 + '"].idmp-grid-cur') }), { k0: pick.key0, k1: pick.key1 });
    verdict('C3', 'current-row mark: row 2 ' + cur.r1 + ', row 1 ' + cur.r0, cur.r1 && !cur.r0, cur);
    // C2
    await click(pick.key1); await page.waitForTimeout(900);
    const c2 = await cell(pick.key1);
    verdict('C2', 'a second click on the now-current row opens the inline editor: editing ' + c2.editing + ', input ' + c2.input, c2.editing && c2.input, c2);
    await page.keyboard.press('Escape');
  } catch (e) { if (!/no fixture/.test(e.message)) { fails++; console.log('§WGC ERROR ' + (e.stack || e)); } }
  console.log('§WGC page errors ' + errs.length + (errs.length ? ' ' + JSON.stringify(errs.slice(0, 3)) : ''));
  if (errs.length) fails++;
  console.log('§WGC VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + fails);
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
