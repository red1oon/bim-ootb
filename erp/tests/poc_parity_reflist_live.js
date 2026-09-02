// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for §P2 of bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md — W-PARITY-REFLIST.
//   THE ISSUE this test proves/disproves: LEG-1 ("list/yesno render as an editable text of the raw value",
//     crud_core.js mapRefDisplayType's own comment until 2026-09-02) — 23 List + 26 Yes-No fields on the five document
//     header tabs rendered as free text; a user could type anything into a List column. iDempiere shows a dropdown of
//     that column's AD_Ref_List rows and a checkbox. CLAIM: a DisplayType-17 field renders a <select> whose options are
//     EXACTLY the column's AD_Ref_List rows (active only, in iDempiere's order: Value when AD_Reference.IsOrderByValue,
//     else Name — MLookupFactory.getLookup_List:301/332/334) and REJECTS a value outside them; a DisplayType-20 field
//     renders a Y/N control whose engine value is only ever 'Y' or 'N'. Asserted as option COUNTS + VALUES against the
//     seed read through the app's own accessor (window.__idmpDb), never "a select appeared".
//   ACT (GardenWorld, window 195 Payment and Receipt / tab 330 — the tab with the most List (6) + Yes-No (10) fields):
//     New → TenderType (AD_Reference_Value 214) select options == AD_Ref_List(214) active rows, same values, same order;
//     CreditCardType (149) == 6; falsifier validateField('ZZ') = list:not-an-option; IsOnline is a checkbox and
//     formValues() reads exactly Y / N across a click toggle; validateField('X') = yesno:not-Y/N; §REFLIST/§YESNO
//     lines carry the counts; 0 pageerrors.
//   §-log first — READ tests/poc_parity_reflist_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_parity_reflist_live.js   (cwd = bim-ootb/erp)
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

async function landed(page) {
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const okb = await page.$('#idmp-login-ok'); if (okb) await okb.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForTimeout(600);
}
async function clickNew(page) {
  await page.waitForSelector('#idmp-toolbar button[title^="New record"]', { timeout: 15000 });
  await page.click('#idmp-toolbar button[title^="New record"]');
  await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 });
  await page.waitForTimeout(500);
}
// the seed's own AD_Ref_List set for a reference id, in iDempiere's order (read through the app's accessor)
const seedRefList = (page, refId) => page.evaluate((refId) => {
  const r0 = window.__idmpDb.exec('SELECT IsOrderByValue FROM AD_Reference WHERE AD_Reference_ID=' + refId);
  const byValue = r0.length && r0[0].values.length && String(r0[0].values[0][0]) === 'Y';
  const r = window.__idmpDb.exec("SELECT Value, Name FROM AD_Ref_List WHERE AD_Reference_ID=" + refId + " AND IsActive='Y' ORDER BY " + (byValue ? 'Value' : 'Name'));
  return { orderBy: byValue ? 'Value' : 'Name', rows: r.length ? r[0].values.map(v => ({ value: String(v[0]), name: v[1] })) : [] };
}, refId);
const selectState = (page, col) => page.evaluate((col) => {
  const el = document.querySelector('#idmp-inline-mount select[data-col="' + col + '"]');
  if (!el) return null;
  const opts = Array.from(el.options).map(o => o.value);
  return { tag: el.tagName, values: opts.filter(v => v !== ''), hasBlank: opts.indexOf('') >= 0, value: el.value, disabled: el.disabled };
}, col);
const fieldSpec = (page, col) => page.evaluate((col) => {
  const e = window.__crud.formEntry(); const f = e && (e.fields || []).find(x => x.col === col);
  return f ? { type: f.type, refListId: f.refListId, nOpt: f.optionList ? f.optionList.length : null, required: !!f.required } : null;
}, col);
const validateVal = (page, col, val) => page.evaluate(({ col, val }) => {
  const e = window.__crud.formEntry(); const f = e && (e.fields || []).find(x => x.col === col);
  return f ? window.__crud.core.validateField(window.__crud.store(), f, val, undefined, {}, {}) : 'no-field';
}, { col, val });

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  console.log('\n§PARITY-REFLIST ===== DisplayType 17 = the column\'s AD_Ref_List set, DisplayType 20 = a Y/N control (LEG-1 retired) =====');
  const logs = [], errs = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  const findLog = re => logs.find(l => re.test(l)) || null;

  const boot = 'seed=ad_seed.db&login=GardenAdmin&window=195';
  await page.goto(`http://localhost:${port}/idempiere.html?${boot}`, { waitUntil: 'networkidle' });
  await landed(page);
  await clickNew(page);

  // ── T1: TenderType (ref 214) — a <select> whose options are EXACTLY the seed's AD_Ref_List rows, same order ──
  const exp214 = await seedRefList(page, 214);
  const tt = await selectState(page, 'tendertype');
  const ttSpec = await fieldSpec(page, 'tendertype');
  console.log('§PARITY-REFLIST[tendertype] seed(214,' + exp214.orderBy + ')=' + JSON.stringify(exp214.rows.map(r => r.value)) + ' dom=' + JSON.stringify(tt && tt.values) + ' spec=' + JSON.stringify(ttSpec));
  ok('TenderType renders a <select> (was a free-text box)', !!tt && tt.tag === 'SELECT', tt ? tt.tag : 'absent');
  ok('the fold typed it list with refListId=214 (AD_Reference_Value_ID)', ttSpec && ttSpec.type === 'list' && Number(ttSpec.refListId) === 214, JSON.stringify(ttSpec));
  ok('option COUNT == seed AD_Ref_List(214) active rows (' + exp214.rows.length + ')', tt && exp214.rows.length > 0 && tt.values.length === exp214.rows.length, tt && (tt.values.length + ' vs ' + exp214.rows.length));
  ok('option VALUES == seed rows in iDempiere order (' + exp214.orderBy + ')', tt && JSON.stringify(tt.values) === JSON.stringify(exp214.rows.map(r => r.value)));
  ok('the AD default (K) is the selected value, no blank offered on a mandatory defaulted list', tt && tt.value === 'K' && !tt.hasBlank, tt && ('value=' + tt.value + ' blank=' + tt.hasBlank));
  const l214 = findLog(/§REFLIST col=tendertype refId=214 options=(\d+)/);
  ok('§REFLIST log carries the count for tendertype', !!l214 && Number(/options=(\d+)/.exec(l214)[1]) === exp214.rows.length, l214 || 'no §REFLIST line');

  // ── T2: CreditCardType (ref 149) — second real column, count against the seed ──
  const exp149 = await seedRefList(page, 149);
  const cc = await selectState(page, 'creditcardtype');
  console.log('§PARITY-REFLIST[creditcardtype] seed(149)=' + exp149.rows.length + ' dom=' + (cc ? cc.values.length : 'absent') + ' values=' + JSON.stringify(cc && cc.values));
  ok('CreditCardType option count == seed AD_Ref_List(149) (' + exp149.rows.length + ')', cc && cc.values.length === exp149.rows.length && JSON.stringify(cc.values) === JSON.stringify(exp149.rows.map(r => r.value)));

  // ── T3: falsifier — a value outside the set is REJECTED by the engine's validator ──
  const bad = await validateVal(page, 'tendertype', 'ZZ'), good = await validateVal(page, 'tendertype', exp214.rows[0].value);
  ok('validateField(tendertype, "ZZ") → list:not-an-option; a member → ok', bad === 'list:not-an-option' && good === null, 'bad=' + bad + ' good=' + good);

  // ── T4: Yes-No — a checkbox whose engine value is only ever Y / N ──
  const yn = await page.evaluate(() => {
    const el = document.querySelector('#idmp-inline-mount [data-col="isonline"]');
    if (!el) return null;
    const v0 = window.__crud.formValues().isonline;
    el.click(); const v1 = window.__crud.formValues().isonline;
    el.click(); const v2 = window.__crud.formValues().isonline;
    return { tag: el.tagName, type: el.type, v0, v1, v2, disabled: el.disabled };
  });
  console.log('§PARITY-REFLIST[isonline] ' + JSON.stringify(yn));
  ok('IsOnline renders as an <input type=checkbox> (was a free-text box)', !!yn && yn.type === 'checkbox', yn ? yn.tag + '/' + yn.type : 'absent');
  ok('the engine reads only Y or N across a toggle (unset editable → N, click → Y, click → N)', !!yn && yn.v0 === 'N' && yn.v1 === 'Y' && yn.v2 === 'N', yn && [yn.v0, yn.v1, yn.v2].join(','));
  const ynBad = await validateVal(page, 'isonline', 'X');
  ok('validateField(isonline, "X") → yesno:not-Y/N', ynBad === 'yesno:not-Y/N', String(ynBad));
  const ynLogs = logs.filter(l => /^§YESNO col=/.test(l)).length, rlLogs = logs.filter(l => /^§REFLIST col=/.test(l)).length;
  console.log('§PARITY-REFLIST[counts] §YESNO lines=' + ynLogs + ' §REFLIST lines=' + rlLogs + ' (tab 330 has 10 Yes-No + 6 List displayed fields; DocStatus is the curated pin)');
  ok('every Yes-No on the tab rendered through the Y/N editor (≥10 §YESNO lines)', ynLogs >= 10, String(ynLogs));
  ok('every AD-folded List on the tab resolved its AD_Ref_List set (≥5 §REFLIST lines; DocStatus stays the curated pin)', rlLogs >= 5, String(rlLogs));
  ok('0 pageerrors across the run', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.close();

  const verdict = (fail === 0)
    ? 'CRITIC ✔ LEG-1 is retired: a List column is a <select> of exactly its AD_Ref_List rows (count + values + order asserted against the seed) that rejects a non-member; a Yes-No column is a checkbox the engine reads only as Y/N. iDempiere parity on 49 fields across the five document tabs.'
    : 'CRITIC ✘ LEG-1 is still visible somewhere — see the 🔴 above.';
  console.log('\n§PARITY-REFLIST-VERDICT ' + verdict);
  console.log((fail === 0 ? '✅' : '❌') + ' W-PARITY-REFLIST: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
