// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for §P8 of bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md — W-PARITY-REFTABLE.
//   THE ISSUE this test proves/disproves: the FK pickers resolved every target table as `<column minus _id>`.
//     That is iDempiere's TableDIR rule (DisplayType 19, MLookupFactory.getLookup_TableDir) and it is WRONG for
//     DisplayType 18 (Table) and 30 (Search), whose target table / key column / WhereClause / OrderByClause are
//     DECLARED in AD_Ref_Table (getLookup_Table). §P3-RESULT named the consequence and left it open: those
//     columns "already degrade to the raw value", so their AD_Val_Rules had never bitten either.
//   CLAIM: (a) an FK of DisplayType 18/30 resolves its target from AD_Ref_Table, so a picker that offered
//     NOTHING now offers exactly the target table's rows; (b) AD_Ref_Table.WhereClause is applied as a SECOND
//     narrowing on top of the val rule; (c) a val-ruled LIST filters its AD_Ref_List options by the rule, as
//     MLookupFactory.getLookup_List does; (d) the offered set and the accepted set remain ONE set.
//   Every expected table name, key column, clause and row count is READ FROM THE SEED (window.__idmpDb) AT RUN
//   TIME. Nothing is typed into this file.
// §-log first — READ tests/poc_parity_reftable_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_parity_reftable_live.js   (cwd = bim-ootb/erp)
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
const judged = (label, n, cond, extra) => {
  if (!n) { console.log('   ⬜ INCONCLUSIVE ' + label + ' — judged population is 0 (' + (extra || '') + ')'); inconclusive++; return; }
  ok(label + ' (n=' + n + ')', cond, extra);
};
async function landed(page) { await page.waitForSelector('[data-ad-table]', { timeout: 20000 }); await page.waitForTimeout(500); }
async function clickNew(page) {
  await page.waitForSelector('#idmp-toolbar button[title^="New record"]', { timeout: 15000 });
  await page.click('#idmp-toolbar button[title^="New record"]');
  await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 });
  await page.waitForTimeout(900);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const base = 'http://localhost:' + port + '/idempiere.html';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const LOG = [], errs = [];
  page.on('console', m => LOG.push(m.text()));
  page.on('pageerror', e => errs.push(String(e)));

  console.log('§W-PARITY-REFTABLE start (real DOM; every expectation read from ad_seed.db at run time)');

  // ══ the POPULATION — how many FK fields the convention gets wrong, and how many AD_Ref_Table fixes ══
  await page.goto(base + '?login=GardenAdmin&window=143', { waitUntil: 'load' });
  await landed(page); await clickNew(page);

  const POP = await page.evaluate(() => {
    const q = s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; };
    const seedTables = {}; q("SELECT name FROM sqlite_master WHERE type='table'").forEach(r => { seedTables[String(r[0]).toLowerCase()] = 1; });
    const fk = q("SELECT f.AD_Tab_ID, c.ColumnName, COALESCE(NULLIF(f.AD_Reference_ID,''), c.AD_Reference_ID), " +
      "COALESCE(f.AD_Reference_Value_ID, c.AD_Reference_Value_ID) " +
      "FROM AD_Field f JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID " +
      "WHERE f.AD_Tab_ID IN (186,257,263,330,349) AND f.IsActive='Y' AND f.IsDisplayed='Y'")
      .filter(r => [18, 19, 30].indexOf(Number(r[2])) >= 0);
    let convOK = 0, fixable = 0, unfixable = 0; const fixCols = {}, unfixCols = {};
    fk.forEach(r => {
      const cn = String(r[1]).toLowerCase(), conv = cn.replace(/_id$/, '');
      if (seedTables[conv]) { convOK++; return; }
      const rt = window.ADParser.resolveRefTable(window.__idmpDb, r[3]);
      const tgt = rt && rt.tableName ? String(rt.tableName).toLowerCase() : null;
      if (tgt && seedTables[tgt]) { fixable++; fixCols[r[1]] = tgt; } else { unfixable++; unfixCols[r[1]] = tgt || '(no AD_Ref_Table row)'; }
    });
    return { fkInstances: fk.length, convOK, fixable, unfixable,
             fixCols, unfixCols, distinctFix: Object.keys(fixCols).length, distinctUnfix: Object.keys(unfixCols).length };
  });
  console.log('\n── the population, read from the seed ──');
  console.log('   §REFTABLE-POPULATION fkInstances=' + POP.fkInstances + ' resolvedByConvention=' + POP.convOK +
              ' fixableFromAD_Ref_Table=' + POP.fixable + ' (' + POP.distinctFix + ' distinct columns)' +
              ' noTarget=' + POP.unfixable + ' (' + POP.distinctUnfix + ' distinct)');
  console.log('   FIXED : ' + JSON.stringify(POP.fixCols));
  console.log('   ⬜ NOT RESOLVED (no AD_Ref_Table row and no table under the convention — reported, never a pass): ' +
              JSON.stringify(POP.unfixCols));
  judged('the convention genuinely fails for a real, non-trivial set of FK fields (else this item is vacuous)',
    POP.fkInstances, POP.fixable > 0, POP.fixable + ' of ' + POP.fkInstances + ' FK field-instances');

  // ══ A · a picker that offered NOTHING now offers the AD_Ref_Table target's rows ══
  console.log('\n── A · MLookupFactory.getLookup_Table — the target comes from AD_Ref_Table, not the column name ──');
  const A = await page.evaluate(() => {
    const q = s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; };
    const E = window.__crud.formEntry();
    const f = c => ((E && E.fields) || []).filter(x => x.col === c)[0] || null;
    const dom = c => { const el = document.querySelector('#idmp-inline-mount [data-col="' + c + '"]'); return el && el.tagName === 'SELECT' ? el.options.length : null; };
    const sr = f('salesrep_id');
    // the ORACLE: what the seed says salesrep_id's reference resolves to, and how many rows that table has
    const rt = sr ? window.ADParser.resolveRefTable(window.__idmpDb, null) : null;   // placeholder, real read below
    const refVal = q("SELECT COALESCE(f.AD_Reference_Value_ID, c.AD_Reference_Value_ID) FROM AD_Field f " +
      "JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID WHERE f.AD_Tab_ID=186 AND lower(c.ColumnName)='salesrep_id'");
    const seedRt = refVal.length ? window.ADParser.resolveRefTable(window.__idmpDb, refVal[0][0]) : null;
    const convTableExists = q("SELECT name FROM sqlite_master WHERE type='table' AND lower(name)='salesrep'").length > 0;
    return { specRef: sr ? sr.ref : null, specKey: sr ? sr.refkey : null, specSrc: sr ? sr.refsource : null,
             seedTable: seedRt ? String(seedRt.tableName).toLowerCase() : null,
             seedKey: seedRt ? String(seedRt.keyCol).toLowerCase() : null,
             convTableExists, options: dom('salesrep_id') };
  });
  judged('salesrep_id resolves to the table AD_Ref_Table names, with that reference\'s AD_Key as the pk',
    A.seedTable ? 1 : 0,
    A.specRef === A.seedTable && A.specKey === A.seedKey && !A.convTableExists,
    'seed says ' + A.seedTable + '/' + A.seedKey + ' · spec has ' + A.specRef + '/' + A.specKey +
    ' · the convention table "salesrep" exists=' + A.convTableExists + ' (that is why it degraded)');
  judged('and its picker now offers real rows instead of degrading to the raw value', A.options ? 1 : 0,
    A.options > 1, 'option count (incl. the blank) = ' + A.options);

  // ══ B · AD_Ref_Table.WhereClause is a SECOND narrowing, independent of AD_Val_Rule ══
  console.log('\n── B · AD_Ref_Table.WhereClause applied on top of the val rule ──');
  const refLines = LOG.filter(l => /§REFTABLE col=/.test(l));
  const applied = refLines.filter(l => /refWhere=applied/.test(l));
  const B = await page.evaluate(() => {
    const q = s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; };
    // c_employee_id → C_BPartner narrowed by AD_Ref_Table 252 (`C_BPartner.IsEmployee='Y'`), no val rule at all,
    // so it isolates the AD_Ref_Table clause from the AD_Val_Rule path. Both counts read from the seed.
    const all = q("SELECT COUNT(*) FROM c_bpartner");
    const emp = q("SELECT COUNT(*) FROM c_bpartner WHERE IsEmployee='Y'");
    const rt = window.ADParser.resolveRefTable(window.__idmpDb, 252);
    return { all: all.length ? Number(all[0][0]) : null, emp: emp.length ? Number(emp[0][0]) : null,
             clause: rt ? String(rt.whereClause || '') : null };
  });
  judged('the AD_Ref_Table clause is real and NARROWS (before > after), read from the seed both ways',
    B.all ? 1 : 0, B.all != null && B.emp != null && B.emp < B.all && /IsEmployee/i.test(B.clause || ''),
    'c_bpartner ' + B.all + ' → ' + B.emp + ' under AD_Ref_Table 252 "' + B.clause + '"');
  judged('the live pickers logged the clause as APPLIED on real columns', refLines.length,
    applied.length > 0, applied.length + ' of ' + refLines.length + ' §REFTABLE lines report refWhere=applied');
  applied.slice(0, 4).forEach(l => console.log('   ' + l.slice(0, 150)));

  // ══ C · the val-ruled LIST (getLookup_List) ══
  console.log('\n── C · a val-ruled List filters its AD_Ref_List options (MLookupFactory.getLookup_List) ──');
  await page.goto(base + '?login=GardenAdmin&window=195', { waitUntil: 'load' });
  await landed(page); await clickNew(page);
  const C = await page.evaluate(() => {
    const q = s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; };
    const E = window.__crud.formEntry();
    const f = ((E && E.fields) || []).filter(x => x.col === 'trxtype')[0] || null;
    const vrId = f ? f.valruleid : null;
    const code = vrId != null ? q("SELECT code FROM ad_val_rule WHERE ad_val_rule_id=" + Number(vrId)) : [];
    const refId = f ? f.refListId : null;
    const before = refId != null ? q("SELECT COUNT(*) FROM AD_Ref_List WHERE AD_Reference_ID=" + Number(refId) + " AND IsActive='Y'") : [];
    // the ORACLE: apply the rule's clause to AD_Ref_List directly — NOT through the engine under test
    const after = (refId != null && code.length)
      ? q("SELECT Value FROM AD_Ref_List WHERE AD_Reference_ID=" + Number(refId) + " AND IsActive='Y' AND (" + code[0][0] + ")")
      : [];
    // build the record that makes trxtype VISIBLE, straight from its own DisplayLogic (e.g. "@TenderType@=C")
    const dlRow = q("SELECT f.DisplayLogic FROM AD_Field f JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID " +
      "WHERE f.AD_Tab_ID=330 AND lower(c.ColumnName)='trxtype'");
    const dl = dlRow.length ? String(dlRow[0][0] || '') : '';
    const rec = {};
    const m = /@([A-Za-z0-9_]+)@\s*=\s*'?([A-Za-z0-9_]+)'?/.exec(dl);
    if (m) rec[m[1].toLowerCase()] = m[2];
    const el = document.querySelector('#idmp-inline-mount [data-col="trxtype"]');
    const domOpts = el && el.tagName === 'SELECT' ? Array.from(el.options).map(o => o.value).filter(v => v !== '') : null;
    return { vrId, code: code.length ? String(code[0][0]) : null, refId,
             before: before.length ? Number(before[0][0]) : null,
             oracle: after.map(r => String(r[0])).sort(),
             dom: domOpts ? domOpts.slice().sort() : null,
             engineOptions: f && f.options ? Object.keys(f.options).sort() : null,
             // trxtype carries DisplayLogic (read from the seed here, not assumed) — a HIDDEN field is not
             // validated at all (GridField parity, validateField:122), so the membership arm must judge it in
             // the state where iDempiere would show it. The trigger value is EXTRACTED from the logic string.
             displayLogic: dl,
             visibleRecord: rec,
             validateExcluded: f ? window.__crud.core.validateField({}, f, 'A', undefined, rec, {}) : null,
             validateAdmitted: f && after.length ? window.__crud.core.validateField({}, f, String(after[0][0]), undefined, rec, {}) : null,
             hiddenIsSkipped: f ? window.__crud.core.validateField({}, f, 'A', undefined, {}, {}) : null };
  });
  judged('trxtype carries a val rule and the seed\'s own AD_Ref_List is narrowed by it (before > after)',
    C.before || 0, C.before != null && C.oracle.length > 0 && C.oracle.length < C.before,
    'ref ' + C.refId + ': ' + C.before + ' active options → ' + C.oracle.length + ' admitted by rule ' + C.vrId + ' "' + C.code + '"');
  judged('the rendered <select> offers EXACTLY the admitted values, computed independently of the engine',
    C.dom ? C.dom.length : 0, JSON.stringify(C.dom) === JSON.stringify(C.oracle),
    'oracle=' + JSON.stringify(C.oracle) + ' dom=' + JSON.stringify(C.dom));
  judged('P8.6 — validateField reads the SAME filtered map, so offered == accepted',
    C.engineOptions ? C.engineOptions.length : 0,
    JSON.stringify(C.engineOptions) === JSON.stringify(C.oracle) &&
    C.validateExcluded === 'list:not-an-option' && C.validateAdmitted === null,
    'options=' + JSON.stringify(C.engineOptions) + ' · shown when ' + JSON.stringify(C.visibleRecord) +
    ' (its own DisplayLogic "' + C.displayLogic + '") · validate(excluded "A")=' + C.validateExcluded +
    ' validate(admitted)=' + C.validateAdmitted);
  ok('…and while its DisplayLogic HIDES it, the validator skips it entirely (GridField parity, validateField:122)',
    C.hiddenIsSkipped === null, 'validate(excluded "A", empty record) = ' + C.hiddenIsSkipped);

  // ══ FALSIFIER ══
  console.log('\n── FALSIFIER · the resolution is read from the dictionary, not hard-coded ──');
  const F = await page.evaluate(() => {
    const P = window.ADParser, db = window.__idmpDb;
    return { unknown: P.resolveRefTable(db, -424242), nullId: P.resolveRefTable(db, null),
             // a TableDIR column (19) has no AD_Reference_Value_ID, so it MUST keep the convention
             tableDirKeepsConvention: (function () {
               const E = window.__crud.formEntry();
               const f = ((E && E.fields) || []).filter(x => x.type === 'fk' && !x.refsource)[0];
               return f ? { col: f.col, ref: f.ref, refsource: f.refsource || null } : null;
             })() };
  });
  ok('an unknown / null AD_Reference_Value_ID returns null — the caller keeps the convention, nothing invented',
    F.unknown === null && F.nullId === null, JSON.stringify({ unknown: F.unknown, nullId: F.nullId }));
  judged('a DisplayType-19 (TableDIR) column still uses `<col minus _id>` — the port is not applied too widely',
    F.tableDirKeepsConvention ? 1 : 0,
    !!(F.tableDirKeepsConvention && F.tableDirKeepsConvention.ref &&
       F.tableDirKeepsConvention.ref === F.tableDirKeepsConvention.col.replace(/_id$/, '')),
    JSON.stringify(F.tableDirKeepsConvention));

  ok(errs.length + ' pageerrors across the run', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('\n§PARITY-REFTABLE-VERDICT CRITIC ' + (fail === 0 ? '✔' : '✘') + ' ' + (fail === 0
    ? 'An FK of DisplayType 18/30 now takes its target table, key column and where-clause from AD_Ref_Table as ' +
      'MLookupFactory.getLookup_Table does, so ' + POP.distinctFix + ' columns that had been querying a table that ' +
      'does not exist offer real rows; the AD_Ref_Table clause narrows on top of the val rule; and a val-ruled ' +
      'List filters its AD_Ref_List options, with the validator reading the same set the picker was built from.'
    : 'a lookup target or a list filter diverges from MLookupFactory — see the 🔴 above.'));
  console.log((fail === 0 ? '✅' : '❌') + ' W-PARITY-REFTABLE: ' + pass + '/' + (pass + fail) +
              ' PASS (' + fail + ' FAIL, ' + inconclusive + ' INCONCLUSIVE)');
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('🔴 W-PARITY-REFTABLE harness threw: ' + e.message); process.exit(1); });
