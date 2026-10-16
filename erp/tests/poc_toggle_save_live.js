// ⚠ DO NOT REMOVE — Scope guard
// Scope: FS-19 (bim-compiler prompts/ERP_FIRST_SETUP_GUIDE.md §FS2q) — THE ISSUE: opening an existing record with the toolbar
//   Grid/Form toggle left Save disabled, so the record could not be saved by that (the visible) path. Proves/disproves, BY
//   VALUE (DOM disabled flag + §CRUD lines), in a headless browser (--disable-gpu) over the served bundle:
//   (1) toggle → form mounted AND toolbar Save enabled; (2) tick Sales Price list → Save → §CRUD validate key=m_pricelist
//   verb=update ok; (3) NEGATIVE CONTROL: toggle back to grid → Save disabled (no form, nothing to save).
// §-log first — read the printed § lines (and tests/poc_toggle_save_live.log) before any conclusion. Exit code is not evidence.
// Run: node tests/poc_toggle_save_live.js   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const REPO = path.join(__dirname, '..', '..'), LOGF = path.join(__dirname, 'poc_toggle_save_live.log');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(REPO, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
const OUT = []; const say = (s) => { OUT.push(s); console.log(s); };
(async () => {
  await new Promise(r => server.listen(0, r)); const base = 'http://localhost:' + server.address().port + '/erp';
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }); const page = await b.newPage();
  const LOG = []; page.on('console', m => LOG.push(m.text())); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const SAVE = '#idmp-toolbar button[title$="(Alt+S)"]';
  const saveDis = () => page.$eval(SAVE, x => x.disabled).catch(() => null);
  let pass = 0, fail = 0, inc = 0; const judge = (id, ok, ev) => { if (ok === null) inc++; else if (ok) pass++; else fail++; say('§W-TOGGLE-SAVE ' + id + ' ' + (ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL') + ' ' + ev); };
  try {
    await page.goto(base + '/idempiere.html?login=GardenAdmin&window=146', { waitUntil: 'load' });
    await page.waitForSelector('#idmp-toolbar [data-tb="toggle"]', { timeout: 30000 }); await page.waitForTimeout(1500);
    const recs = await page.$$eval('.idmp-grid tbody tr[data-ad-record]', e => e.length);
    const d0 = await saveDis();
    await page.click('#idmp-toolbar [data-tb="toggle"]'); await page.waitForTimeout(900);
    const mounted = !!(await page.$('#idmp-inline-mount [data-col]')), d1 = await saveDis();
    const nav = await page.$eval('#idmp-recnav', e => e.textContent).catch(() => '');
    // the redrawn toolbar must keep the record counter (regression caught by W-ERP-I18N "kept": nav went "" after the redraw)
    judge('T1-toggle-enables-save', recs ? (mounted && d0 === true && d1 === false && /\d+\D+\d+/.test(nav)) : null, 'gridRecords=' + recs + ' saveDisabled grid=' + d0 + ' →form=' + d1 + ' formMounted=' + mounted + ' recnav=' + JSON.stringify(nav));
    const cb = '#idmp-inline-mount input[data-col="issopricelist"]'; const was = await page.isChecked(cb);
    await page.click(cb); await page.waitForTimeout(400);
    const n0 = LOG.length; await page.click(SAVE, { timeout: 5000 }).catch(e => LOG.push('CLICKFAIL ' + e.message)); await page.waitForTimeout(1500);
    const v = LOG.slice(n0).filter(l => /§CRUD validate key=m_pricelist /.test(l)).pop() || '';
    judge('T2-save-persists-edit', /verb=update ok/.test(v), 'issopricelist ' + was + '→' + !was + ' ' + (v || 'no §CRUD validate line') + ' ' + (LOG.slice(n0).find(l => /CLICKFAIL/.test(l)) || ''));
    await page.click('#idmp-toolbar [data-tb="toggle"]'); await page.waitForTimeout(900);
    const mounted2 = !!(await page.$('#idmp-inline-mount [data-col]')), d2 = await saveDis();
    judge('T3-neg-grid-disables-save', !mounted2 && d2 === true, 'back to grid: formMounted=' + mounted2 + ' saveDisabled=' + d2);
  } catch (e) { judge('harness', null, e.message.split('\n')[0]); }
  judge('page-errors', errs.length === 0, 'n=' + errs.length + ' ' + errs.slice(0, 2).join(' | '));
  say('§W-TOGGLE-SAVE summary pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + (fail ? ' 🔴 FAIL' : inc ? ' INCONCLUSIVE' : ' 🟢 PASS'));
  fs.writeFileSync(LOGF, OUT.join('\n') + '\n'); await b.close(); server.close(); process.exit(fail || inc ? 1 : 0);
})();
