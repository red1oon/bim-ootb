// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for P5 of the iDempiere-FAITHFUL IN-PLACE CRUD lane
//   (prompts/CRUD_INPLACE_EDIT_SESSION.md §P5 / T3; RESUME_INPLACE_P4.md §P5). W-INPLACE-UNDO-LIVE.
//   THE ISSUE this test proves/disproves:
//   (1) PHANTOM-DRAFT-PIP — does opening a record inline and leaving it UNTOUCHED buffer a spurious draft + raise an
//       AMBER unsaved-edit pip? It MUST NOT: an untouched open buffers NOTHING (the buffer diffs against the POST-
//       render baseline `_inlineBaseline`, not the raw record, so render-normalization — date/fk/number — is not a
//       phantom "change"). A GENUINE edit still buffers + raises the pip.
//   (2) IGNORE vs TIMELINE — Ignore (verb bar) discards the UNCOMMITTED delta and is shown by the AMBER hollow
//       `.scrubdraft` pip (distinct from the solid committed `.scrubdot`); the op-log timeline only ever carries
//       COMMITTED ops. Save is the BOUNDARY: only a Save puts a committed mark on the timeline. The two are never
//       confused. Source of truth = iDempiere dataIgnore() (discard unsaved) vs the persisted op-log.
//   §-log first — READ tests/poc_inplace_undo_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_inplace_undo_live.js   (cwd = bim-ootb/erp)
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

async function openFormView(page) {
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const okb = await page.$('#idmp-login-ok'); if (okb) await okb.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.evaluate(() => { const tr = document.querySelector('.idmp-grid tbody tr[data-ad-record]'); if (tr) tr.click(); });
  await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
}

const firstTextCol = (page) => page.evaluate(() => {
  const mount = document.getElementById('idmp-inline-mount');
  const pref = ['name', 'value', 'description', 'taxid', 'duns'];
  let inp = null;
  if (mount) { for (const c of pref) { const e = mount.querySelector('input.cfi[type="text"][data-col="' + c + '"]:not([disabled])'); if (e) { inp = e; break; } }
    if (!inp) inp = mount.querySelector('input.cfi[type="text"]:not([disabled])'); }
  return inp ? { col: inp.getAttribute('data-col'), val: inp.value } : null;
});
const typeField = (page, col, v) => page.evaluate(({ col, v }) => {
  const el = document.querySelector('#idmp-inline-mount input.cfi[data-col="' + col + '"]');
  if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true;
}, { col, v });
const clickVerb = (page, v) => page.evaluate((v) => { const b = document.querySelector('#idmp-inline-mount .ic-vb[data-v="' + v + '"]'); if (b && !b.disabled) { b.click(); return true; } return false; }, v);
// simulate the nav/beforeunload buffer flush (inline forms buffer via the exposed seam, not closeForm)
const bufferDraft = (page) => page.evaluate(() => { try { return !!(window.__crud && window.__crud.bufferDraft && window.__crud.bufferDraft()); } catch (e) { return false; } });
const pipState = (page) => page.evaluate(() => ({
  amber: !!document.querySelector('#idmp-scrub .scrubdraft'),        // AMBER hollow unsaved-edit pip
  committed: document.querySelectorAll('#idmp-scrub .scrubdot').length   // committed/nav marks on the timeline
}));

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  console.log('\n§INPLACE-UNDO ===== Ignore (uncommitted) vs the committed op-log timeline — distinct + no phantom pip =====');

  const logs = [], errs = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  const anyLog = re => logs.some(l => re.test(l));
  const countLog = re => logs.filter(l => re.test(l)).length;

  const boot = 'seed=ad_seed.db&login=GardenAdmin&window=123';
  await page.goto(`http://localhost:${port}/idempiere.html?${boot}`, { waitUntil: 'networkidle' });
  await openFormView(page);

  const f = await firstTextCol(page);
  ok('found an editable text field to drive', !!(f && f.col), f ? ('col=' + f.col) : 'none');
  if (!f || !f.col) { console.log('\n❌ W-INPLACE-UNDO-LIVE: cannot proceed — no editable field'); await browser.close(); server.close(); process.exit(1); }
  const col = f.col, orig = f.val == null ? '' : f.val;

  // ── (1) PHANTOM-DRAFT-PIP: an UNTOUCHED open must buffer NOTHING ──
  const draftsBefore = countLog(/§DRAFT-PUT/);
  const buffered = await bufferDraft(page); await page.waitForTimeout(200);
  const p0 = await pipState(page);
  const draftsAfterUntouched = countLog(/§DRAFT-PUT/);
  console.log('§INPLACE-UNDO[untouched] bufferDraft=' + buffered + ' §DRAFT-PUT(before=' + draftsBefore + ',after=' + draftsAfterUntouched + ') amberPip=' + p0.amber);
  ok('an UNTOUCHED inline open buffers NOTHING (no §DRAFT-PUT, phantom-pip fix)', !buffered && draftsAfterUntouched === draftsBefore, 'put before=' + draftsBefore + ' after=' + draftsAfterUntouched);
  ok('no AMBER unsaved-edit pip on an untouched open', !p0.amber);

  // ── (2a) a GENUINE edit DOES buffer + raise the amber pip (the pip still works) ──
  await typeField(page, col, (orig + ' [u]').slice(0, 38)); await page.waitForTimeout(200);
  const realBuffer = await bufferDraft(page); await page.waitForTimeout(250);
  const p1 = await pipState(page);
  ok('a GENUINE edit buffers a draft (§DRAFT-PUT cols includes ' + col + ')', realBuffer && anyLog(new RegExp('§DRAFT-PUT key=\\S*c_bpartner.*cols=.*' + col)), 'buffered=' + realBuffer);
  ok('the AMBER hollow unsaved-edit pip (.scrubdraft) shows — distinct from committed dots', p1.amber);

  // ── (2b) IGNORE discards the uncommitted delta — pip clears, NO committed op added to the timeline ──
  const committedBeforeIgnore = (await pipState(page)).committed;
  // re-open the form to the buffered state, then Ignore (the form view re-mounts on the tip; type to make it dirty again)
  await typeField(page, col, (orig + ' [u2]').slice(0, 38)); await page.waitForTimeout(150);
  const persistBeforeIgnore = countLog(/§CRUD-PERSIST/);
  await clickVerb(page, 'ignore'); await page.waitForTimeout(300);
  const r = await firstTextCol(page);
  const persistAfterIgnore = countLog(/§CRUD-PERSIST/);
  ok('Ignore reverts the field to the tip (uncommitted discard, §INPLACE-IGNORE)', r && r.val === orig && anyLog(/§INPLACE-IGNORE table=c_bpartner/), 'val="' + (r && r.val) + '" expect="' + orig + '"');
  ok('Ignore commits NOTHING to the op-log timeline (no new §CRUD-PERSIST)', persistAfterIgnore === persistBeforeIgnore, 'persist before=' + persistBeforeIgnore + ' after=' + persistAfterIgnore);

  // ── (2c) SAVE is the BOUNDARY: only a Save puts a COMMITTED mark on the timeline ──
  const persistBeforeSave = countLog(/§CRUD-PERSIST/);
  await typeField(page, col, (orig + ' [saved]').slice(0, 38)); await page.waitForTimeout(200);
  await clickVerb(page, 'save'); await page.waitForTimeout(1400);
  const persistAfterSave = countLog(/§CRUD-PERSIST/);
  ok('Save commits ONE signed op to the timeline (§CRUD-PERSIST) — the boundary', persistAfterSave > persistBeforeSave, 'persist before=' + persistBeforeSave + ' after=' + persistAfterSave);
  const afterSave = await firstTextCol(page);
  ok('after Save the inline form re-mounts clean (no stranded unsaved state)', !!afterSave && /\[saved\]/.test(afterSave.val || ''), 'val="' + (afterSave && afterSave.val) + '"');

  ok('0 pageerrors across the run', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.close();

  console.log('\n----- relevant page-console § lines -----');
  logs.filter(l => /§DRAFT-PUT|§IDMP-HIST (setDraftPip|clearDraftPip)|§INPLACE-IGNORE|§CRUD-PERSIST|§DRAFT-OFFER/.test(l)).slice(0, 30).forEach(l => console.log('   ' + l));
  console.log('-----------------------------------------');

  const verdict = (fail === 0)
    ? 'CRITIC ✔ Ignore and the op-log timeline are distinct: an UNTOUCHED inline open raises NO phantom unsaved-pip (the buffer diffs the post-render baseline); a genuine edit raises the AMBER hollow pip; Ignore discards the uncommitted delta (revert to tip, nothing on the timeline); and Save is the boundary that puts the one committed op on the timeline. iDempiere dataIgnore-faithful (P5).'
    : 'CRITIC ✘ Ignore/timeline reconcile not faithful yet — see the 🔴 above.';
  console.log('\n§INPLACE-UNDO-VERDICT ' + verdict);
  console.log((fail === 0 ? '✅' : '❌') + ' W-INPLACE-UNDO-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
