// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for P4 of the iDempiere-FAITHFUL IN-PLACE CRUD lane
//   (prompts/CRUD_INPLACE_EDIT_SESSION.md §P4 / T5; RESUME_INPLACE_P4.md). W-INPLACE-GRID-LIVE.
//   THE ISSUE this test proves/disproves: does a GRID data cell edit in place — click a cell → a WEditor-equivalent
//     inline input (GridView/GridTabRowRenderer parity) → commit ONE SIGNED CRUD_UPDATE row-wise on that row's pk
//     (the SAME signed write the form uses), the grid cell then shows the new value, it SURVIVES a reload, with NO
//     modal and the Glass/Gravity ring NEVER fanning? And does Escape / an unchanged cell revert (commit nothing),
//     and a click NOT navigate to the form (the cell edits in place)? Source of truth = iDempiere ZK GridView.java +
//     GridTabRowRenderer.java (the grid renders a per-cell editor; both surfaces are always-editable).
//
//   ACT (GardenWorld Business Partner, window 123 — the editable tenant): stay in GRID view → click an editable
//     data cell → assert the inline editor mounted (§INPLACE-CELL-OPEN, td.idmp-cell-edit > input.cfi), NO modal,
//     view still grid; press Escape → the cell reverts (commit nothing); click again, type a new value, Enter →
//     assert a SIGNED CRUD_UPDATE persisted (§INPLACE-CELL + §CRUD-PERSIST op=CRUD_UPDATE verifyChain=ok) with NO
//     ring fan; the grid cell shows the new value; reload → the cell SURVIVES (op-log tip folds onto the bundle).
//     0 pageerrors.
//   §-log first — READ tests/poc_inplace_grid_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_inplace_grid_live.js   (cwd = bim-ootb/erp)
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

let pass = 0, fail = 0;
const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

// land in GRID view with rows loaded (do NOT click a row — the grid IS the editable surface)
async function openGrid(page) {
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const okb = await page.$('#idmp-login-ok'); if (okb) await okb.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
}

// pick an editable text cell in the FIRST data row (a known text column), return its col + current text + pk
const findCell = (page) => page.evaluate(() => {
  const pref = ['name', 'value', 'description', 'taxid', 'duns'];
  const tds = Array.from(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record] td.idmp-gcell[data-ad-col]'));
  let pick = null;
  for (const c of pref) { const t = tds.find(td => (td.getAttribute('data-ad-col') || '').toLowerCase() === c); if (t) { pick = t; break; } }
  if (!pick && tds.length) pick = tds[0];
  if (!pick) return null;
  const tr = pick.closest('tr');
  return { col: pick.getAttribute('data-ad-col'), text: pick.textContent, pk: tr ? tr.getAttribute('data-ad-record') : null };
});

const clickCell = (page, col) => page.evaluate((col) => {
  const td = document.querySelector('.idmp-grid tbody tr[data-ad-record] td.idmp-gcell[data-ad-col="' + col + '"]');
  if (td) { td.click(); return true; } return false;
}, col);

const probeEdit = (page, col) => page.evaluate((col) => {
  const td = document.querySelector('.idmp-grid tbody tr[data-ad-record] td[data-ad-col="' + col + '"]');
  const inp = td ? td.querySelector('input.cfi, select.cfi') : null;
  return { editing: !!(td && td.classList.contains('idmp-cell-edit')), hasInput: !!inp,
    val: inp ? inp.value : null, modal: !!document.querySelector('#crudForm.open') };
}, col);

const sendKey = (page, col, key) => page.evaluate(({ col, key }) => {
  const td = document.querySelector('.idmp-grid tbody tr[data-ad-record] td.idmp-cell-edit[data-ad-col="' + col + '"]');
  const inp = td ? td.querySelector('input.cfi') : null;
  if (!inp) return false;
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
  return true;
}, { col, key });

const typeEnter = (page, col, v) => page.evaluate(({ col, v }) => {
  const td = document.querySelector('.idmp-grid tbody tr[data-ad-record] td.idmp-cell-edit[data-ad-col="' + col + '"]');
  const inp = td ? td.querySelector('input.cfi') : null;
  if (!inp) return false;
  inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return true;
}, { col, v });

const cellText = (page, col) => page.evaluate((col) => {
  const td = document.querySelector('.idmp-grid tbody tr[data-ad-record] td[data-ad-col="' + col + '"]');
  return td ? td.textContent : null;
}, col);

const viewMode = (page) => page.evaluate(() => !!document.querySelector('.idmp-grid tbody tr[data-ad-record]'));

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  console.log('\n§INPLACE-CELL ===== a GRID data cell edits IN PLACE → ONE signed CRUD_UPDATE row-wise (GridView parity) =====');

  const logs = [], errs = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  const anyLog = re => logs.some(l => re.test(l));

  const boot = 'seed=ad_seed.db&login=GardenAdmin&window=123';
  await page.goto(`http://localhost:${port}/idempiere.html?${boot}`, { waitUntil: 'networkidle' });
  await openGrid(page);

  const c = await findCell(page);
  ok('found an editable text cell in the grid (a data-ad-col cell on row 1)', !!(c && c.col), c ? ('col=' + c.col + ' pk=' + c.pk) : 'none');
  if (!c || !c.col) {
    console.log('\n❌ W-INPLACE-GRID-LIVE: cannot proceed — no editable grid cell found');
    await browser.close(); server.close(); process.exit(1);
  }
  const col = c.col, orig = (c.text == null ? '' : c.text);

  // ── click the cell → an inline editor mounts in place; NO modal; still in grid (no form nav) ──
  await clickCell(page, col); await page.waitForTimeout(700);
  let e = await probeEdit(page, col);
  console.log('§INPLACE-CELL[open] col=' + col + ' editing=' + e.editing + ' input=' + e.hasInput + ' val="' + e.val + '" modal=' + e.modal + ' grid=' + (await viewMode(page)));
  ok('clicking a cell mounts an inline editor in place (§INPLACE-CELL-OPEN, td.idmp-cell-edit > input.cfi)', e.editing && e.hasInput && anyLog(/§INPLACE-CELL-OPEN table=c_bpartner/), 'editing=' + e.editing + ' input=' + e.hasInput);
  ok('NO #crudForm modal opens for a grid cell edit', !e.modal);
  ok('a cell click EDITS in place — it does NOT navigate to the form view (still grid)', await viewMode(page));

  // ── Escape reverts (commit nothing) ──
  await sendKey(page, col, 'Escape'); await page.waitForTimeout(400);
  let r0 = await probeEdit(page, col);
  ok('Escape reverts the cell (no editor, no commit)', !r0.editing && !r0.hasInput && (await cellText(page, col)) === orig, 'text="' + (await cellText(page, col)) + '"');

  // ── click again → type a new value → Enter → SIGNED CRUD_UPDATE, no ring fan ──
  const edited = (orig.replace(/\s*\[g\d*\]$/, '') + ' [g]').slice(0, 60);
  await clickCell(page, col); await page.waitForTimeout(600);
  await typeEnter(page, col, edited); await page.waitForTimeout(1500);
  const cellCommit = anyLog(new RegExp('§INPLACE-CELL table=c_bpartner.*col=' + col.toLowerCase() + '.*commit=signed-CRUD_UPDATE', 'i'));
  const persisted = anyLog(/§CRUD-PERSIST .*op=CRUD_UPDATE .*verifyChain=ok/) || anyLog(/§CRUD-COMMIT-LIVE .*op=CRUD_UPDATE/);
  const ringFan = anyLog(/§CRUD ring .*view=on/) || anyLog(/§CRUD-IDMP-OPEN/);
  ok('Enter commits ONE signed CRUD_UPDATE row-wise (§INPLACE-CELL commit=signed-CRUD_UPDATE)', cellCommit);
  ok('the write took the SAME signed path (§CRUD-PERSIST op=CRUD_UPDATE verifyChain=ok)', persisted);
  ok('the Glass/Gravity ring NEVER fans on this surface (signed seam, no ring)', !ringFan);

  // ── the grid cell shows the new value (overlay:committed → renderBody repaints) ──
  let shown = await cellText(page, col);
  ok('the grid cell shows the new value after commit (renderBody repaint)', shown === edited, 'cell="' + shown + '" expect="' + edited + '"');

  // ── reload → the edit SURVIVES (op-log tip folds onto the immutable bundle) ──
  await page.goto(`http://localhost:${port}/idempiere.html?${boot}`, { waitUntil: 'networkidle' });
  await openGrid(page);
  let reloaded = await cellText(page, col);
  console.log('§INPLACE-CELL[reload] col=' + col + ' cell="' + reloaded + '" expect="' + edited + '"');
  ok('the cell edit SURVIVES a reload (the signed CRUD_UPDATE persisted)', reloaded === edited, 'cell="' + reloaded + '"');

  ok('0 pageerrors across the run', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.close();

  // §-log first — surface the relevant page-console § lines into THIS logfile (the read-the-log evidence trail)
  console.log('\n----- relevant page-console § lines -----');
  logs.filter(l => /§INPLACE-CELL|§CRUD-PERSIST|§CRUD-COMMIT-LIVE|§LIST-TIP|§CRUD-TIP|REJECT|§CRUD ring/.test(l)).forEach(l => console.log('   ' + l));
  console.log('-----------------------------------------');

  const verdict = (fail === 0)
    ? 'CRITIC ✔ A GardenWorld grid cell edits IN PLACE — click → inline WEditor → Enter commits ONE signed CRUD_UPDATE row-wise (the SAME signed write the form uses), the grid cell shows the new value and it survives a reload; Escape reverts; the click never opens a modal and the Glass/Gravity ring never fans. iDempiere GridView-faithful in-place CRUD (P4).'
    : 'CRITIC ✘ the grid in-place cell edit is not faithful yet — see the 🔴 above.';
  console.log('\n§INPLACE-CELL-VERDICT ' + verdict);
  console.log((fail === 0 ? '✅' : '❌') + ' W-INPLACE-GRID-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
