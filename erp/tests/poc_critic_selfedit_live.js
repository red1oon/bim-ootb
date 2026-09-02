// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for ERP_CRITIC_UX_LANE.md P3 / S4 — LIVE MODEL SELF-EDIT, fanned across all 5
//   migrated tenants. W-CRITIC-SELFEDIT. The thesis: editing the DICTIONARY (a signed CRUD_UPDATE on
//   AD_Field.IsDisplayed) repaints the open window ON THE SPOT — the renderer RE-READS AD, it does not
//   recompile — and the SAME mechanism works identically on Odoo/iDempiere/SAP/Oracle/Dynamics, five
//   differently-sourced datasets, zero per-tenant code. That cross-tenant repetition IS the proof the
//   live model-edit is a SUBSTRATE INVARIANT, not a per-tenant happy path. In iDempiere I would edit the
//   Application Dictionary then 2Pack / re-login for the change to take; here a signed dictionary edit
//   refolds the live window with no reload, and the edit lives in the signed op-log (the served bundle is
//   never mutated — re-read, not recompile).
//
//   ACT A — UNIVERSAL (per tenant, ×5): enter the tenant, open its window, pick a DISPLAYED non-key field of
//     the active tab, and drive ONE signed dictionary edit through the production seam (window.__crud.applyOp
//     → commitCrud → commitGroup → verifyChain → overlay:committed → host refold). Assert: the write is SIGNED
//     (§CRUD-PERSIST verifyChain=ok), the host re-folds (§AD-SELFEDIT-LIVE), the column VANISHES from the live
//     grid (header count −1, the field's name gone) — same code path, five tenants. 0 pageerrors.
//
//   ACT B — RE-READ NOT RECOMPILE (the falsifier, the doc-complete tenant Odoo 12): (1) hide a field (Y→N) →
//     it vanishes; (2) the BUNDLE AD_Field row is STILL IsDisplayed='Y' (window.__idmpDb) — the served db is
//     never touched, the edit is only in the signed op-log; (3) a SECOND signed edit (N→Y) brings the field
//     BACK — bidirectional, latest-wins, purely from the dictionary. Together: the repaint is a re-FOLD of AD,
//     not a recompiled model. If the field could not return, or the bundle had been mutated, this is a recompile
//     masquerading as a re-read — the critic's bar fails. It does not.
//
//   The critic's bar: "Can I change the MODEL and watch the form follow, with no restart — on EVERY tenant, not
//   one wired demo? And is it honestly a re-read (the source untouched, reversible) rather than a rewrite I can
//   never take back? In iDempiere this is a dictionary edit + 2Pack/re-login; here it is live and signed."
//   §-log first — READ tests/poc_critic_selfedit_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_critic_selfedit_live.js   (cwd = bim-ootb/erp)
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

const TENANTS = [
  { key:'odoo',      shard:'12-odoo.db',      client:12, login:'12000',   window:143, docComplete:true,  label:'Odoo' },
  { key:'idempiere', shard:'13-idempiere.db', client:13, login:'1300101', window:143, docComplete:true,  label:'iDempiere' },
  { key:'sap',       shard:'14-sap.db',       client:14, login:'14000',   window:123, docComplete:false, label:'SAP Flights' },
  { key:'oracle',    shard:'15-oracle.db',    client:15, login:'15000',   window:123, docComplete:false, label:'Oracle Scott' },
  { key:'dynamics',  shard:'16-dynamics.db',  client:16, login:'16000',   window:123, docComplete:false, label:'Dynamics Cronus' },
];

let pass = 0, fail = 0;
const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

async function gotoTenant(page, t, port) {
  const url = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=${t.shard}&login=${t.login}&window=${t.window}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const okb = await page.$('#idmp-login-ok'); if (okb) await okb.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForSelector('.idmp-grid th', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1100);
}

// the live grid's non-empty header labels = the displayed columns folded from AD_Field of the active tab.
const headerNames = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('.idmp-grid th')).map(t => (t.textContent || '').trim()).filter(Boolean));

// pick a DISPLAYED, non-key, non-identifier field of the open window whose Name is a visible grid header,
// so the edit targets the ACTIVE tab (the one being rendered). Returns its AD_Field_ID + Name + ColumnName.
async function pickTargetField(page, t) {
  const heads = await headerNames(page);
  return page.evaluate((args) => {
    const { winId, heads } = args;
    const db = window.__idmpDb; if (!db) return { err: 'no __idmpDb' };
    let r;
    try {
      r = db.exec(
        "SELECT f.AD_Field_ID, f.Name, c.ColumnName FROM AD_Field f " +
        "JOIN AD_Column c ON f.AD_Column_ID = c.AD_Column_ID " +
        "JOIN AD_Tab t ON f.AD_Tab_ID = t.AD_Tab_ID " +
        "WHERE t.AD_Window_ID = " + winId + " AND f.IsActive='Y' AND f.IsDisplayed='Y' " +
        "AND COALESCE(c.IsKey,'N')='N' AND COALESCE(c.IsIdentifier,'N')='N' AND f.Name IS NOT NULL");
    } catch (e) { return { err: e.message }; }
    const cands = r && r.length ? r[0].values.map(v => ({ id: v[0], name: v[1], col: v[2] })) : [];
    const pick = cands.find(c => heads.indexOf(c.name) >= 0) || null;
    return { pick, candCount: cands.length, heads };
  }, { winId: t.window, heads });
}

// drive ONE signed dictionary edit through the PRODUCTION seam (the same applyOp funnel iDempiere's own pills
// use) and resolve once the commit's overlay:committed announces — then the host refold has run.
async function signedFieldEdit(page, fieldId, oldV, newV) {
  return page.evaluate((args) => new Promise((resolve) => {
    const { id, oldV, newV } = args;
    let done = false;
    const h = (e) => { if (done) return; done = true; window.removeEventListener('overlay:committed', h); resolve({ fired: true, detail: e.detail }); };
    window.addEventListener('overlay:committed', h);
    try {
      window.__crud.applyOp({ key: 'ad_field', table: 'AD_Field', verb: 'update', ownerGated: false,
        op_type: 'CRUD_UPDATE', id: id, changes: { IsDisplayed: { old: oldV, new: newV } }, actor: 100 });
    } catch (e) { if (!done) { done = true; resolve({ fired: false, err: e.message }); } }
    setTimeout(() => { if (!done) { done = true; resolve({ fired: false }); } }, 5000);
  }), { id: fieldId, oldV, newV });
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  // ───────────────────────── ACT A — UNIVERSAL: the live model-edit repaints, same code, five tenants ─────────────────────────
  console.log('\n§CRITIC-SELFEDIT ===== ACT A : a signed dictionary edit re-folds the live window — five tenants, one mechanism =====');
  for (const t of TENANTS) {
    const logs = [], errs = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => errs.push(e.message));
    const lastLog = re => { for (let i = logs.length - 1; i >= 0; i--) if (re.test(logs[i])) return logs[i]; return ''; };
    await gotoTenant(page, t, port);

    const before = await headerNames(page);
    const tgt = await pickTargetField(page, t);
    const pick = tgt.pick;
    let edit = { fired: false }, after = before, persistLog = '', refoldLog = '';
    if (pick) {
      edit = await signedFieldEdit(page, pick.id, 'Y', 'N');
      await page.waitForTimeout(900);                       // let the host overlay:committed handler re-open the window
      await page.waitForSelector('.idmp-grid th', { timeout: 8000 }).catch(() => {});
      after = await headerNames(page);
      persistLog = lastLog(/§CRUD-PERSIST .*op=CRUD_UPDATE.*verifyChain=ok/);
      refoldLog = lastLog(/§AD-SELFEDIT-LIVE refold table=AD_Field/);
    }
    // the live grid caps the displayed columns (renderBody _displayFields.slice(0,7)), so hiding a field pulls
    // the next into the slot — the PROOF of the repaint is that the EDITED field's column is gone, not a count delta.
    const wasShown = !!pick && before.indexOf(pick.name) >= 0;
    const vanished = wasShown && after.indexOf(pick.name) < 0;
    console.log('§CRITIC-SELFEDIT[' + t.key + '] field="' + (pick ? pick.name : '?') + '"(id=' + (pick ? pick.id : '?')
      + ' col=' + (pick ? pick.col : '?') + ') shown-before=' + wasShown + ' gone-after=' + vanished
      + ' verifyChain=' + (/verifyChain=ok/.test(persistLog) ? 'ok' : '—') + ' refold=' + (refoldLog ? 'Y' : 'N'));
    ok('[' + t.key + '] a displayed non-key field of the open window was found to edit', wasShown, 'cands=' + tgt.candCount);
    ok('[' + t.key + '] the dictionary edit is a SIGNED CRUD_UPDATE on AD_Field (verifyChain=ok)', /op=CRUD_UPDATE.*verifyChain=ok/.test(persistLog), persistLog.slice(0, 110));
    ok('[' + t.key + '] the host RE-FOLDS the window on the signed edit (§AD-SELFEDIT-LIVE — re-read, not recompile)', !!refoldLog, refoldLog.slice(0, 90));
    ok('[' + t.key + '] the edited column VANISHES from the live grid on the spot (no reload)', vanished, 'name "' + (pick ? pick.name : '?') + '" present-after=' + (pick ? (after.indexOf(pick.name) >= 0) : 'n/a'));
    ok('[' + t.key + '] 0 pageerrors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  // ───────────────────────── ACT B — RE-READ NOT RECOMPILE (falsifier, Odoo 12) ─────────────────────────
  console.log('\n§CRITIC-SELFEDIT ===== ACT B : the repaint is a RE-FOLD of AD (source untouched, reversible) — not a recompile =====');
  {
    const logs = [], errs = [];
    const odoo = TENANTS[0];
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => errs.push(e.message));
    const lastLog = re => { for (let i = logs.length - 1; i >= 0; i--) if (re.test(logs[i])) return logs[i]; return ''; };
    await gotoTenant(page, odoo, port);

    const before = await headerNames(page);
    const tgt = await pickTargetField(page, odoo);
    const pick = tgt.pick;

    // (1) hide the field (Y→N) → it must vanish
    await signedFieldEdit(page, pick.id, 'Y', 'N');
    await page.waitForTimeout(900);
    await page.waitForSelector('.idmp-grid th', { timeout: 8000 }).catch(() => {});
    const hidden = await headerNames(page);
    const didVanish = before.indexOf(pick.name) >= 0 && hidden.indexOf(pick.name) < 0;

    // (2) the served BUNDLE row is STILL IsDisplayed='Y' (the edit lives only in the signed op-log)
    const bundle = await page.evaluate((id) => {
      try { const r = window.__idmpDb.exec("SELECT IsDisplayed FROM AD_Field WHERE AD_Field_ID=" + id);
        return r.length && r[0].values.length ? r[0].values[0][0] : null; } catch (e) { return 'ERR ' + e.message; }
    }, pick.id);

    // (3) a second signed edit (N→Y) brings the field BACK — bidirectional, latest-wins, from the dictionary
    await signedFieldEdit(page, pick.id, 'N', 'Y');
    await page.waitForTimeout(900);
    await page.waitForSelector('.idmp-grid th', { timeout: 8000 }).catch(() => {});
    const restored = await headerNames(page);
    const cameBack = restored.indexOf(pick.name) >= 0;
    const persistN = lastLog(/§CRUD-PERSIST .*op=CRUD_UPDATE.*verifyChain=ok/);

    console.log('§CRITIC-SELFEDIT[B] field="' + pick.name + '" headerN base=' + before.length + ' hidden=' + hidden.length
      + ' restored=' + restored.length + ' bundleIsDisplayed=' + bundle);
    ok('[B] the signed Y→N edit hides the column live', didVanish, 'hidden.has=' + (hidden.indexOf(pick.name) >= 0));
    ok('[B] the served BUNDLE AD_Field row is UNTOUCHED — still IsDisplayed=Y (the edit is only in the op-log)', bundle === 'Y', 'bundle=' + bundle);
    ok('[B] a second signed N→Y edit brings the column BACK (bidirectional re-read, latest-wins)', cameBack, 'restored.has=' + (restored.indexOf(pick.name) >= 0) + ' n=' + restored.length);
    ok('[B] both edits are SIGNED (verifyChain=ok)', /verifyChain=ok/.test(persistN), persistN.slice(0, 110));
    ok('[B] 0 pageerrors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  const verdict = (fail === 0)
    ? 'CRITIC ✔ Live model self-edit is a SUBSTRATE INVARIANT here — the SAME signed dictionary edit refolded the open window on all five migrated tenants (Odoo/iDempiere/SAP/Oracle/Dynamics) with zero per-tenant code: edit AD_Field.IsDisplayed and the column follows on the spot, no reload. And it is honestly a RE-READ: the served bundle is never mutated (still IsDisplayed=Y), the change lives in the signed op-log, and a reverse edit brings the field back — bidirectional, latest-wins. In iDempiere this is a dictionary edit + 2Pack/re-login; here it is live, signed and reversible. This genuinely surpasses the incumbents.'
    : 'CRITIC ✘ a leg dead-ended — see the 🔴 above; NOT pickable over the incumbents until fixed.';
  console.log('\n§CRITIC-VERDICT(P3/S4-SELFEDIT) ' + verdict);
  console.log((fail === 0 ? '✅' : '❌') + ' W-CRITIC-SELFEDIT-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
