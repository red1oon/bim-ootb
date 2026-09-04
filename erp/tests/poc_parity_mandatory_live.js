// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for §P7 of bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md —
//   W-PARITY-MANDATORY-CREATE.
//   THE ISSUE this test proves/disproves: the inline CREATE path validated against its POST-RENDER BASELINE, so an
//     UNTOUCHED empty mandatory field read "unchanged" (crud_core.js validateField's update rule) and its `required`
//     check NEVER FIRED — an inline New saved a Sales Order with no Business Partner. §IMPL-RESULT named it OPEN and
//     "not a pass". CLAIM: a CREATE now validates the WHOLE new row (validateField's own create contract,
//     orig===undefined), exactly as iDempiere's GridTable.dataSave:1647-1653 → getMandatory:1973-2001 runs over a row
//     that dataNew's defaults and the callouts already filled — and it does so WITHOUT weakening the validator,
//     because three New-time behaviours were ported faithfully first:
//       P7.1  GridField.isMandatory(boolean):377-385 — in a WINDOW, DocumentNo / Value / M_AttributeSetInstance_ID /
//             Created* / Updated* / a key *_ID are NEVER mandatory whatever AD_Column.IsMandatory says.
//       P7.2  GridField.defaultFromDatatype():1022-1051 — Button non-_ID→'N', YesNo→'N', *_ID→null, numeric→'0',
//             IN THAT ORDER (so no *_ID ever gets 0), and '0'/'N' are NOT empty at GridTable.java:1985.
//       P7.3  DisplayType 37 CostPrice is numeric (DisplayType.java:329-333) — it fell through to `string` here.
//       P7.7  GridField.defaultFromExpression():875-913 — a @token@ DefaultValue resolved from the WINDOW context,
//             which on a DETAIL tab is the PARENT row (Env's "WindowNo|TabNo|Column"→"WindowNo|Column" fallback).
//   Every expected value — IsMandatory, DisplayType, the parent row's own column — is READ FROM THE SEED through the
//   app's own accessor (window.__idmpDb) AT RUN TIME. Nothing is typed into this file.
// §-log first — READ tests/poc_parity_mandatory_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_parity_mandatory_live.js   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
let pass = 0, fail = 0, inconclusive = 0;
const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };
// PRIMAL LAW §4 — a check whose judged population is EMPTY prints INCONCLUSIVE, never PASS.
const judged = (label, n, cond, extra) => {
  if (!n) { console.log('   ⬜ INCONCLUSIVE ' + label + ' — judged population is 0 (' + (extra || '') + ')'); inconclusive++; return; }
  ok(label + ' (n=' + n + ')', cond, extra);
};

async function landed(page) {
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const okb = await page.$('#idmp-login-ok'); if (okb) await okb.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForTimeout(500);
}
async function clickNew(page) {
  await page.waitForSelector('#idmp-toolbar button[title^="New record"]', { timeout: 15000 });
  await page.click('#idmp-toolbar button[title^="New record"]');
  await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 });
  await page.waitForTimeout(700);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const base = 'http://localhost:' + port + '/idempiere.html';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const LOG = []; const errs = [];
  page.on('console', m => LOG.push(m.text()));
  page.on('pageerror', e => errs.push(String(e)));

  console.log('§W-PARITY-MANDATORY-CREATE start (real DOM; every expectation read from ad_seed.db at run time)');

  // ══ ARM A — the defect is GONE: an untouched empty mandatory field is required-checked on a CREATE ══
  console.log('\n── A · §PARITY-MANDATORY-CREATE: a New typed with ONLY DocumentNo is REJECTED ──');
  await page.goto(base + '?login=GardenAdmin&window=143', { waitUntil: 'load' });
  await landed(page); await clickNew(page);

  // the oracle: which columns tab 186 itself declares mandatory, displayed and not exempt — read from the seed.
  const seedMand = await page.evaluate(() => {
    const q = s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; };
    const rows = q("SELECT c.ColumnName, COALESCE(NULLIF(f.IsMandatory,''), c.IsMandatory) " +
      "FROM AD_Field f JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID " +
      "WHERE f.AD_Tab_ID=186 AND f.IsActive='Y' AND f.IsDisplayed='Y' AND c.IsKey='N'");
    return rows.filter(r => r[1] === 'Y').map(r => String(r[0]));
  });
  const bpMandatory = seedMand.some(c => c.toLowerCase() === 'c_bpartner_id');
  judged('the seed itself declares C_BPartner_ID mandatory+displayed on tab 186 (so arm A is not vacuous)',
    seedMand.length, bpMandatory, seedMand.length + ' mandatory displayed columns on 186');

  const beforeN = LOG.length;
  await page.fill('#idmp-inline-mount [data-col="documentno"]', String(Date.now()));
  await page.locator('#idmp-inline-mount [data-col="documentno"]').first().blur().catch(() => {});
  await page.waitForTimeout(200);
  // Save the way a user does on this surface: the toolbar Save (the sibling witnesses' proven gesture) — the
  // inline bar's Save is the same handler but sits below the fold of a 56-row form, tripping actionability.
  const tb = await page.$('#idmp-toolbar button[title^="Save"]');
  if (tb) await tb.click();
  else await page.evaluate(() => { const b = document.querySelector('#idmp-inline-mount .ic-vb[data-v="save"]'); if (b) b.click(); });
  await page.waitForTimeout(1100);
  const after = LOG.slice(beforeN);
  const rej = after.filter(l => /§CRUD validate key=c_order verb=create REJECT/.test(l)).pop() || '';
  const persisted = after.some(l => /§CRUD-PERSIST/.test(l));
  const mandLine = after.filter(l => /§PARITY-MANDATORY key=c_order verb=create/.test(l)).pop() || '';
  ok('a c_order New carrying ONLY DocumentNo is REJECTED, not saved', !!rej && !persisted,
    rej ? rej.slice(0, 170) : ('no REJECT line; persisted=' + persisted));
  ok('the reject names C_BPartner_ID as `required` (the column the seed declares mandatory)',
    /"col":"c_bpartner_id","why":"required"/.test(rej), rej.slice(0, 170));
  console.log('   §PARITY-MANDATORY ' + (mandLine ? mandLine.slice(mandLine.indexOf('required=')) : '(absent)').slice(0, 260));

  // ══ ARM C — the P7.1 exemption, asserted as a CONTRAST against the seed's own IsMandatory ══
  console.log('\n── C · GridField.isMandatory:377-385 — DocumentNo / M_AttributeSetInstance_ID are exempt IN A WINDOW ──');
  const exempt = await page.evaluate(() => {
    const q = s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; };
    const CORE = window.__crud.core;
    const seedSays = c => {
      const r = q("SELECT c.IsMandatory FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID " +
        "WHERE lower(t.TableName)='" + c.t + "' AND lower(c.ColumnName)='" + c.c + "'");
      return r.length ? String(r[0][0]) : null;
    };
    const e = window.__crud.formEntry();     // the OPEN c_order New form's merged entry (read-only seam)
    const dn = ((e && e.fields) || []).filter(f => f.col === 'documentno')[0] || null;
    return {
      docnoSeed: seedSays({ t: 'c_order', c: 'documentno' }),
      asiSeed: seedSays({ t: 'c_orderline', c: 'm_attributesetinstance_id' }),
      // the PURE engine is the oracle for the port itself — it is exported for exactly this
      docnoExempt: CORE.gridFieldMandatoryExempt('DocumentNo', false),
      asiExempt: CORE.gridFieldMandatoryExempt('M_AttributeSetInstance_ID', false),
      keyExempt: CORE.gridFieldMandatoryExempt('C_Order_ID', true),
      createdExempt: CORE.gridFieldMandatoryExempt('CreatedBy', false),
      // a column iDempiere does NOT exempt must come back null — the port must not be wider than the Java
      bpNotExempt: CORE.gridFieldMandatoryExempt('C_BPartner_ID', false),
      whNotExempt: CORE.gridFieldMandatoryExempt('M_Warehouse_ID', false),
      curatedDocnoStillPinned: dn ? !!dn.required : null
    };
  });
  judged('the seed says DocumentNo IS AD-mandatory, yet the window exempts it (the whole point of the port)',
    exempt.docnoSeed ? 1 : 0, exempt.docnoSeed === 'Y' && exempt.docnoExempt === 'DocumentNo',
    'seed IsMandatory=' + exempt.docnoSeed + ' exempt=' + exempt.docnoExempt);
  judged('the seed says C_OrderLine.M_AttributeSetInstance_ID IS AD-mandatory, yet the window exempts it ("0 is valid")',
    exempt.asiSeed ? 1 : 0, exempt.asiSeed === 'Y' && exempt.asiExempt === 'M_AttributeSetInstance_ID',
    'seed IsMandatory=' + exempt.asiSeed + ' exempt=' + exempt.asiExempt);
  ok('the other three shapes the Java lists are exempt too (key *_ID, Created*)',
    exempt.keyExempt === 'key_id' && exempt.createdExempt === 'Created*',
    JSON.stringify({ key: exempt.keyExempt, created: exempt.createdExempt }));
  ok('FALSIFIER-2a — the port is NOT wider than the Java: C_BPartner_ID / M_Warehouse_ID are NOT exempt',
    exempt.bpNotExempt === null && exempt.whNotExempt === null,
    JSON.stringify({ bp: exempt.bpNotExempt, wh: exempt.whNotExempt }));
  ok('§IMPL F3 respected — the CURATED documentno pin keeps its own `required` (the fold exemption is AD-side only)',
    exempt.curatedDocnoStillPinned === true, 'curated documentno.required=' + exempt.curatedDocnoStillPinned);

  // ══ ARM D — the P7.2/P7.3 data-type defaults, asserted against each column's DisplayType in the seed ══
  console.log('\n── D · GridField.defaultFromDatatype:1022-1051 — YesNo→N, numeric→0, *_ID→null (in that order) ──');
  const dt = await page.evaluate(() => {
    const q = s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; };
    const ref = (t, c) => {
      const r = q("SELECT COALESCE(NULLIF(f.AD_Reference_ID,''), c.AD_Reference_ID) FROM AD_Field f " +
        "JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID JOIN AD_Table tt ON tt.AD_Table_ID=c.AD_Table_ID " +
        "WHERE lower(tt.TableName)='" + t + "' AND lower(c.ColumnName)='" + c + "' AND f.IsDisplayed='Y' LIMIT 1");
      return r.length ? Number(r[0][0]) : null;
    };
    const dom = c => { const el = document.querySelector('#idmp-inline-mount [data-col="' + c + '"]'); return el ? (el.type === 'checkbox' ? (el.checked ? 'Y' : 'N') : el.value) : null; };
    const CORE = window.__crud.core;
    return {
      freightRef: ref('c_order', 'freightamt'), freightVal: dom('freightamt'),
      discRef: ref('c_order', 'isdiscountprinted'), discVal: dom('isdiscountprinted'),
      priceListRef: ref('c_orderline', 'pricelist'),
      // the pure port, so the *_ID-before-numeric ORDER is judged, not just the outcome
      idBeatsNumeric: CORE.gridFieldDatatypeDefault('M_AttributeSetInstance_ID', 11, 'number'),
      yesno: CORE.gridFieldDatatypeDefault('IsDiscountPrinted', 20, 'yesno'),
      numeric: CORE.gridFieldDatatypeDefault('FreightAmt', 12, 'number'),
      costPriceIsNumber: CORE.mapRefDisplayType(37)
    };
  });
  judged('a DisplayType-' + dt.freightRef + ' (numeric) mandatory column renders 0, not empty', dt.freightRef ? 1 : 0,
    String(dt.freightVal) === '0', 'freightamt="' + dt.freightVal + '"');
  judged('a DisplayType-' + dt.discRef + ' (Yes-No) mandatory column reads N, not empty', dt.discRef ? 1 : 0,
    String(dt.discVal) === 'N', 'isdiscountprinted="' + dt.discVal + '"');
  judged('DisplayType ' + dt.priceListRef + ' (C_OrderLine.PriceList) maps to `number` — DisplayType.isNumeric includes CostPrice 37',
    dt.priceListRef ? 1 : 0, Number(dt.priceListRef) === 37 && dt.costPriceIsNumber === 'number',
    'seed ref=' + dt.priceListRef + ' → ' + dt.costPriceIsNumber);
  ok('ORDER is faithful — the *_ID test precedes the numeric test, so an *_ID never gets 0',
    dt.idBeatsNumeric === null && dt.yesno === 'N' && dt.numeric === '0',
    JSON.stringify({ id: dt.idBeatsNumeric, yesno: dt.yesno, numeric: dt.numeric }));

  // ══ ARM E — P7.7: a DETAIL tab's @token@ DefaultValue resolves from the PARENT row ══
  console.log('\n── E · GridField.defaultFromExpression:875-913 — a line defaults from its header (window context) ──');
  await page.goto(base + '?login=GardenAdmin&window=181', { waitUntil: 'load' });
  await landed(page);
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 15000 });
  await page.evaluate(() => { const tr = document.querySelector('.idmp-grid tbody tr[data-ad-record]'); if (tr) tr.click(); });
  await page.waitForTimeout(700);
  await page.click('#idmp-tabstrip >> text=PO Line', { timeout: 8000 });
  await page.waitForTimeout(800);
  const mdLine = LOG.filter(l => /§IDEMPIERE-MD tab=PO Line/.test(l)).pop() || '';
  const parentId = (/C_Order_ID=(\d+)/.exec(mdLine) || [])[1] || null;
  await clickNew(page);
  const expr = await page.evaluate((pid) => {
    const q = s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; };
    const adDefault = q("SELECT c.DefaultValue FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID " +
      "WHERE lower(t.TableName)='c_orderline' AND lower(c.ColumnName)='c_bpartner_location_id'");
    const parent = pid ? q("SELECT C_BPartner_Location_ID FROM c_order WHERE C_Order_ID=" + Number(pid)) : [];
    const el = document.querySelector('#idmp-inline-mount [data-col="c_bpartner_location_id"]');
    return { adDefault: adDefault.length ? String(adDefault[0][0]) : null,
             parentVal: parent.length ? String(parent[0][0]) : null,
             rendered: el ? String(el.value) : null };
  }, parentId);
  judged('the AD default for C_OrderLine.C_BPartner_Location_ID IS a @token@ expression (arm E is not vacuous)',
    expr.adDefault ? 1 : 0, /^@[A-Za-z_]+@$/.test(String(expr.adDefault)), 'DefaultValue=' + expr.adDefault);
  judged('a PO Line New pre-fills it from its PARENT order\'s own column, read from the seed',
    expr.parentVal ? 1 : 0, expr.rendered === expr.parentVal,
    'parent C_Order_ID=' + parentId + ' → ' + expr.parentVal + ' · rendered=' + expr.rendered);
  const exprLog = LOG.filter(l => /§GRIDFIELD-EXPR-DEFAULT key=c_orderline/.test(l)).pop() || '';
  console.log('   ' + (exprLog || '§GRIDFIELD-EXPR-DEFAULT (absent)').slice(0, 260));

  // ══ FALSIFIERS — through the PURE engine, so they judge the rule, not the render ══
  console.log('\n── FALSIFIER · the validator is intact, and the exemption is load-bearing in BOTH directions ──');
  const fal = await page.evaluate(() => {
    const CORE = window.__crud.core;
    const e = window.__crud.formEntry();      // the OPEN PO-Line New form's entry (ARM E left it mounted)
    const key = e ? String(e.key || '') : '';
    const asi = ((e && e.fields) || []).filter(f => f.col === 'm_attributesetinstance_id')[0] || null;
    const mk = (f, over) => { const o = {}; for (const k in f) o[k] = f[k]; for (const k in (over || {})) o[k] = over[k]; return o; };
    const bp = { col: 'c_bpartner_id', type: 'fk', required: true };
    return {
      // FALSIFIER-1 — an AD-mandatory column with no default and no derivation still REJECTS on a NEW row
      reqEmpty: CORE.validateField({}, bp, '', undefined, {}, {}),
      reqFilled: CORE.validateField({}, bp, '112', undefined, {}, {}),
      formKey: key,
      asiFoldedRequired: asi ? !!asi.required : null,
      asiExemptTag: asi ? (asi.mandatoryexempt || null) : null,
      // FALSIFIER-2b — re-mark the SAME field mandatory and the SAME empty value is rejected: the ONLY thing
      // keeping it out of the reject set is the port, so a port that ever stops firing shows up here.
      asiIfNotExempt: asi ? CORE.validateField({}, mk(asi, { required: true }), '', undefined, {}, {}) : null,
      asiAsShipped: asi ? CORE.validateField({}, asi, '', undefined, {}, {}) : null
    };
  });
  ok('FALSIFIER-1 — an empty AD-mandatory fk on a NEW row → `required`; a filled one → ok (validator not weakened)',
    fal.reqEmpty === 'required' && fal.reqFilled === null, JSON.stringify({ empty: fal.reqEmpty, filled: fal.reqFilled }));
  judged('C_OrderLine.M_AttributeSetInstance_ID folds required=false with its exemption tag recorded',
    fal.asiFoldedRequired === null ? 0 : 1,
    fal.asiFoldedRequired === false && fal.asiExemptTag === 'M_AttributeSetInstance_ID',
    'openForm=' + fal.formKey + ' required=' + fal.asiFoldedRequired + ' tag=' + fal.asiExemptTag);
  judged('FALSIFIER-2b — the SAME field marked mandatory rejects the SAME empty value; as shipped it does not',
    fal.asiFoldedRequired === null ? 0 : 1,
    fal.asiIfNotExempt === 'required' && fal.asiAsShipped === null,
    JSON.stringify({ ifMandatory: fal.asiIfNotExempt, asShipped: fal.asiAsShipped }));

  ok(errs.length + ' pageerrors across the run', errs.length === 0, errs.slice(0, 2).join(' | '));

  const exemptLogs = LOG.filter(l => /§GRIDFIELD-EXEMPT/.test(l));
  const dtLogs = LOG.filter(l => /§GRIDFIELD-DATATYPE-DEFAULT/.test(l));
  console.log('\n§PARITY-MANDATORY-CREATE-LOGS §GRIDFIELD-EXEMPT=' + exemptLogs.length +
              ' §GRIDFIELD-DATATYPE-DEFAULT=' + dtLogs.length +
              ' §GRIDFIELD-EXPR-DEFAULT=' + LOG.filter(l => /§GRIDFIELD-EXPR-DEFAULT/.test(l)).length);
  if (exemptLogs.length) console.log('   ' + exemptLogs[exemptLogs.length - 1].slice(0, 200));
  if (dtLogs.length) console.log('   ' + dtLogs[dtLogs.length - 1].slice(0, 200));

  console.log('\n§PARITY-MANDATORY-VERDICT CRITIC ' + (fail === 0 ? '✔' : '✘') + ' ' + (fail === 0
    ? 'The create path validates the WHOLE new row, as iDempiere does: an untouched empty mandatory field is finally rejected, while DocumentNo and M_AttributeSetInstance_ID are exempt and YesNo/numeric columns carry their data-type defaults — all four ports faithful to GridField, and the validator itself unchanged.'
    : 'a create-time mandatory behaviour diverges from GridField/GridTable — see the 🔴 above.'));
  console.log((fail === 0 ? '✅' : '❌') + ' W-PARITY-MANDATORY-CREATE: ' + pass + '/' + (pass + fail) +
              ' PASS (' + fail + ' FAIL, ' + inconclusive + ' INCONCLUSIVE)');
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('🔴 W-PARITY-MANDATORY-CREATE harness threw: ' + e.message); process.exit(1); });
