// ⚠ DO NOT REMOVE — Scope guard
// Scope: HEADLESS engine witness for S2B AD-FOLDED CRUD GENERALITY (W-AD-FOLDED-CRUD) + §P2/§P1 parity engine arms
//   (W-PARITY-REFLIST / W-PARITY-FIELDSET engine halves, bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §IMPL). Proves CORE.foldCrudSpec
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
// §P2 (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §IMPL P2.3, W-PARITY-REFLIST) — LEG-1 RETIRED 2026-09-02: a Yes-No
//   is a Y/N control ('yesno'), a List is an AD_Ref_List select ('list'). This assertion used to PIN the leg ("folds to STRING").
ok('Yes-No (AD_Reference_ID=20) folds to YESNO (a Y/N control) — not fk, and no longer string (LEG-1 retired)', upd.fields.find(f => f.col === 'iscustomer').type === 'yesno', upd.fields.find(f => f.col === 'iscustomer').type);
ok('Yes-No literal AD default kept verbatim (IsCustomer=N)', upd.fields.find(f => f.col === 'iscustomer').default === 'N');

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
ok('mapRefType: integer/quantity→number, date/datetime→date, table/search→fk, list→list, yesno→yesno (LEG-1 retired)',
  m('integer') === 'number' && m('quantity') === 'number' && m('date') === 'date' && m('datetime') === 'date' &&
  m('table') === 'fk' && m('search') === 'fk' && m('list') === 'list' && m('yesno') === 'yesno');
ok('mapRefDisplayType: 17→list, 20→yesno, 10→string, 19→fk', CORE.mapRefDisplayType(17) === 'list' && CORE.mapRefDisplayType(20) === 'yesno' && CORE.mapRefDisplayType(10) === 'string' && CORE.mapRefDisplayType(19) === 'fk');

// 7 — §P2 (W-PARITY-REFLIST): a List column folds its AD_Ref_List set through the host resolver, ORDER PRESERVED.
//   PriorityRule-shaped values ('7','5','3' in Name order) would be re-ordered by a plain object ('3','5','7' — JS
//   integer-key ordering); optionList is the ordered form the editor renders, options the validator's map.
const REF_154 = [{ value: '7', name: 'High' }, { value: '5', name: 'Medium' }, { value: '3', name: 'Low' }];
const seen = [];
const lst = CORE.foldCrudSpec([
  { columnName: 'PriorityRule', name: 'Priority', isDisplayed: true, isMandatory: true, isUpdateable: true, referenceId: 17, referenceValueId: 154, defaultValue: '5',
    readOnlyLogic: '@IsApproved@=Y', mandatoryLogic: '@IsDropShip@=Y', seqNo: 210 },
  { columnName: 'Note', name: 'Note', isDisplayed: true, referenceId: 17, referenceValueId: 999 }   // resolver returns nothing → still a list, no options
], { key: 'c_order', forVerb: 'create', refList: id => { seen.push(id); return id === 154 ? REF_154 : null; } });
const pr = lst.fields.find(f => f.col === 'priorityrule'), note = lst.fields.find(f => f.col === 'note');
ok('List (17) folds to type list with refListId = AD_Reference_Value_ID; resolver called with it', pr && pr.type === 'list' && pr.refListId === 154 && seen.indexOf(154) >= 0, JSON.stringify(seen));
ok('optionList keeps the resolver ORDER (7,5,3), options is the membership map', pr && JSON.stringify(pr.optionList.map(o => o.value)) === '["7","5","3"]' && pr.options['5'] === 'Medium' && Object.keys(pr.options).length === 3, pr && JSON.stringify(pr.optionList));
ok('listOptions(optionList) renders in that same order (a map would give 3,5,7)', JSON.stringify(CORE.listOptions(pr.optionList, '5').map(o => o.value)) === '["7","5","3"]' && CORE.listOptions(pr.optionList, '5').find(o => o.selected).value === '5' && JSON.stringify(Object.keys(pr.options)) === '["3","5","7"]');
ok('ReadOnlyLogic / MandatoryLogic / SeqNo now ride the fold (P2.1 → effectiveFlags)', pr && pr.readonlylogic === '@IsApproved@=Y' && pr.mandatorylogic === '@IsDropShip@=Y' && pr.seq === 210);
ok('a List whose resolver returns nothing is still a list (raw-value select), no options map', note && note.type === 'list' && !note.options && !note.optionList);
ok('validateField: a value outside the AD_Ref_List set → list:not-an-option; a member → ok', CORE.validateField({}, pr, 'ZZ') === 'list:not-an-option' && CORE.validateField({}, pr, '3') === null);
const yn = upd.fields.find(f => f.col === 'iscustomer');
ok('validateField: a Yes-No may only be Y or N', CORE.validateField({}, yn, 'X') === 'yesno:not-Y/N' && CORE.validateField({}, yn, 'Y') === null && CORE.validateField({}, yn, 'N') === null);

// 8 — §P1 (W-PARITY-FIELDSET): mergeCuratedWithFold — the AD fold is the FIELD SET, the curated entry keeps verbs/
//   docAction and the PIN ORDER of its own columns; a pinned column keeps its curated type/required/readonly/default
//   (§IMPL F3) but inherits the AD sibling's logic strings; everything else appends in AD (fold) order.
const BP_WITH_LOGIC = BP_FIELDS.map(f => f.columnName === 'Name' ? Object.assign({}, f, { displayLogic: '@IsActive@=Y', seqNo: 40 }) : f);
const fold = CORE.foldCrudSpec(BP_WITH_LOGIC, { key: 'c_bpartner', forVerb: 'update', ctx: CTX });
const curated = { verbs: ['update'], docAction: { action: 'CO' }, ownerGated: true, fields: [
  { col: 'so_creditlimit', label: 'Credit (curated)', type: 'string', required: true },   // AD says amount→number; curated wins on a pin
  { col: 'name', label: 'Name', type: 'string', required: true },
  { col: 'not_in_ad', label: 'Curated only', type: 'string' } ] };
const mg = CORE.mergeCuratedWithFold(curated, fold);
const mcols = mg.fields.map(f => f.col);
ok('merged field SET = curated pins first (in curated order) + every AD field not pinned, in AD order', mg.merged === true && mg.pinned === 3 && mg.appended === fold.fields.length - 2 && mcols.slice(0, 3).join(',') === 'so_creditlimit,name,not_in_ad' && mcols.length === fold.fields.length + 1, mcols.join(','));
ok('appended fields keep AD (fold) order', JSON.stringify(mcols.slice(3)) === JSON.stringify(fold.fields.map(f => f.col).filter(c => c !== 'so_creditlimit' && c !== 'name')));
ok('a pinned column keeps its curated type/required (F3), and inherits the AD sibling\'s logic + seq', mg.fields[0].type === 'string' && mg.fields[0].required === true && mg.fields[1].displaylogic === '@IsActive@=Y' && mg.fields[1].seq === 40);
ok('verbs/docAction/ownerGated come from the curated entry, not the fold', JSON.stringify(mg.verbs) === '["update"]' && mg.docAction.action === 'CO' && mg.ownerGated === true);
ok('merge is a no-op without a fold, and returns the fold without a curated entry', CORE.mergeCuratedWithFold(curated, null) === curated && CORE.mergeCuratedWithFold(null, fold) === fold);

const verdict = fail === 0;
console.log('\n§W-AD-FOLDED-CRUD ' + (verdict ? '✅' : '🔴') + ' — foldCrudSpec derives editability FROM THE AD: every'
  + ' non-view table yields create/update/delete + typed fields, a view yields none, IsUpdateable=N is display-only'
  + ' on Edit but settable on New, and Env context defaults resolve so mandatory system columns never block New.');
console.log((verdict ? '✅' : '❌') + ' W-AD-FOLDED-CRUD: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
process.exit(fail > 0 ? 1 : 0);
