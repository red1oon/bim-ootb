// ⚠ DO NOT REMOVE — Scope guard
// Scope: HEADLESS engine witness for S2B AD-FOLDED CRUD GENERALITY (W-AD-FOLDED-CRUD). Proves CORE.foldCrudSpec
//   derives a crud_ops-shaped entry FROM THE DICTIONARY (the renderer's getFields field shape) — general, not a
//   curated allow-list. ISSUE it proves: "are all tables editable per their own AD?" — today only the curated 5
//   were; this shows the fold produces create/update/delete verbs + typed fields for any editable table, [] for a
//   VIEW, and applies the IsUpdateable='N' = display-only-on-Edit / settable-on-New rule + context-default resolve.
// §-log first — READ tests/poc_ad_folded_crud.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_ad_folded_crud.js   (cwd = bim-ootb/erp)
'use strict';
const CORE = require('../crud_overlay.js');
let pass = 0, fail = 0;
const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

// A faithful slice of ADParser.getFields() over C_BPartner's header tab (window 123 / tab 220) — the real shape:
// AD_Client_ID/AD_Org_ID are mandatory + IsUpdateable='N' with @#…@ context defaults; Value/Name are string;
// C_BP_Group_ID is tableDirect (fk); SO_CreditLimit is amount (number); the PK + a Button are dropped.
// referenceId = the AUTHORITATIVE iDempiere DisplayType id (13 ID, 19 TableDir, 10 String, 20 Yes-No, 12 Amount,
//   28 Button, 14 Text) — the fold maps from this, not the renderer's coarse string. IsCustomer is reference 20
//   (Yes-No), which must fold to a string text input, NOT an FK (the bug a coarse map would introduce).
const BP_FIELDS = [
  { columnName: 'C_BPartner_ID', name: 'BP', isKey: true, isDisplayed: true, referenceId: 13 },
  { columnName: 'AD_Client_ID', name: 'Client', isDisplayed: true, isMandatory: true, isUpdateable: false, referenceId: 19, defaultValue: '@#AD_Client_ID@' },
  { columnName: 'AD_Org_ID', name: 'Org', isDisplayed: true, isMandatory: true, isUpdateable: false, referenceId: 19, defaultValue: '@#AD_Org_ID@' },
  { columnName: 'Value', name: 'Search Key', isDisplayed: true, isMandatory: true, isUpdateable: true, referenceId: 10 },
  { columnName: 'Name', name: 'Name', isDisplayed: true, isMandatory: true, isUpdateable: true, referenceId: 10 },
  { columnName: 'C_BP_Group_ID', name: 'BP Group', isDisplayed: true, isMandatory: true, isUpdateable: true, referenceId: 19 },
  { columnName: 'IsCustomer', name: 'Customer', isDisplayed: true, isMandatory: true, isUpdateable: true, referenceId: 20, defaultValue: 'N' },
  { columnName: 'SO_CreditLimit', name: 'Credit', isDisplayed: true, isUpdateable: true, referenceId: 12, defaultValue: '0' },
  { columnName: 'AD_PrintFormat_ID', name: 'Btn', isDisplayed: true, referenceId: 28 },
  { columnName: 'Help', name: 'Comment', isDisplayed: false, referenceId: 14 }   // not displayed → dropped
];
const CTX = { clientId: 11, orgId: 12, today: '2026-06-17' };

console.log('§W-AD-FOLDED-CRUD start');

// 1 — an editable (non-view) table folds to a full CRUD spec
const upd = CORE.foldCrudSpec(BP_FIELDS, { key: 'c_bpartner', title: 'Business Partner', isView: false, isReadOnly: false, forVerb: 'update', ctx: CTX });
ok('editable table → verbs create/update/delete', JSON.stringify(upd.verbs) === JSON.stringify(['create', 'update', 'delete']), JSON.stringify(upd.verbs));
const cols = upd.fields.map(f => f.col);
ok('PK + Button + non-displayed dropped; data cols kept', !cols.includes('c_bpartner_id') && !cols.includes('ad_printformat_id') && !cols.includes('help') && cols.includes('value') && cols.includes('name'), JSON.stringify(cols));

// 2 — type mapping: amount→number, tableDirect→fk(ref=col minus _id), string→string
const credit = upd.fields.find(f => f.col === 'so_creditlimit');
const grp = upd.fields.find(f => f.col === 'c_bp_group_id');
ok('amount → number', credit && credit.type === 'number', credit && credit.type);
ok('tableDirect → fk with ref = column minus _id', grp && grp.type === 'fk' && grp.ref === 'c_bp_group', grp && (grp.type + '/' + grp.ref));
ok('string → string + required carried from IsMandatory', upd.fields.find(f => f.col === 'value').type === 'string' && upd.fields.find(f => f.col === 'value').required === true);
ok('Yes-No (AD_Reference_ID=20) folds to STRING, NOT fk (authoritative id, not the coarse map)', upd.fields.find(f => f.col === 'iscustomer').type === 'string', upd.fields.find(f => f.col === 'iscustomer').type);

// 3 — IsUpdateable='N' = display-only on EDIT, settable on NEW
const cre = CORE.foldCrudSpec(BP_FIELDS, { key: 'c_bpartner', forVerb: 'create', ctx: CTX });
const orgUpd = upd.fields.find(f => f.col === 'ad_org_id'), orgCre = cre.fields.find(f => f.col === 'ad_org_id');
ok('IsUpdateable=N → readonly on EDIT', orgUpd && orgUpd.readonly === true);
ok('IsUpdateable=N → settable (not readonly) on NEW', orgCre && orgCre.readonly === false);

// 4 — context defaults resolved from session Env (so a mandatory system col doesn't block New); @SQL/unknown dropped
ok('@#AD_Client_ID@ resolved from ctx on New', cre.fields.find(f => f.col === 'ad_client_id').default === 11, String(cre.fields.find(f => f.col === 'ad_client_id').default));
ok('@#AD_Org_ID@ resolved from ctx on New', cre.fields.find(f => f.col === 'ad_org_id').default === 12);
ok('plain literal default kept (SO_CreditLimit=0)', cre.fields.find(f => f.col === 'so_creditlimit').default === '0');

// 5 — a VIEW (or read-only tab) folds to a read-only spec: no verbs
const view = CORE.foldCrudSpec(BP_FIELDS, { key: 'rv_unposted', isView: true });
const roTab = CORE.foldCrudSpec(BP_FIELDS, { key: 'c_bpartner', isReadOnly: true });
ok('AD_Table.IsView=Y → read-only (no verbs)', view.verbs.length === 0 && view.isView === true, JSON.stringify(view.verbs));
ok('AD_Tab.IsReadOnly=Y → read-only (no verbs)', roTab.verbs.length === 0, JSON.stringify(roTab.verbs));

// 6 — mapRefType coverage (the AD_Reference vocab → form type)
const m = CORE.mapRefType;
ok('mapRefType: integer/quantity→number, date/datetime→date, table/search→fk, list/yesno→string',
  m('integer') === 'number' && m('quantity') === 'number' && m('date') === 'date' && m('datetime') === 'date' &&
  m('table') === 'fk' && m('search') === 'fk' && m('list') === 'string' && m('yesno') === 'string');

const verdict = fail === 0;
console.log('\n§W-AD-FOLDED-CRUD ' + (verdict ? '✅' : '🔴') + ' — foldCrudSpec derives editability FROM THE AD: every'
  + ' non-view table yields create/update/delete + typed fields, a view yields none, IsUpdateable=N is display-only'
  + ' on Edit but settable on New, and Env context defaults resolve so mandatory system columns never block New.');
console.log((verdict ? '✅' : '❌') + ' W-AD-FOLDED-CRUD: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
process.exit(fail > 0 ? 1 : 0);
