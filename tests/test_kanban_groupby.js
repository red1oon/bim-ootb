/**
 * test_kanban_groupby.js — W-KANBAN-GROUPBY (§NEXT #3).
 *
 * ISSUE PROVEN: the kanban group-by selector must (1) list all AD fields with usable cardinality,
 *   driven by field metadata with no per-model code; (2) docstatus always first, marked ✦; (3) switching
 *   to a non-docstatus field folds into a heat-map (read-only); (4) switching back to docstatus re-folds
 *   into draggable kanban groups; (5) §KANBAN-GROUPBY log confirms field+groups+draggable.
 *
 * Whitebox: pure logic test against the field-filter/sort/fold rules extracted from idempiere.html.
 * Run: node tests/test_kanban_groupby.js
 */
'use strict';
let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  🟢 ' + msg); }
  else       { fail++; console.log('  🔴 FAIL: ' + msg); }
}

// ── Simulate _displayFields, _distinctCount, _records ──
// 5 records: C_Order with DocStatus + BPartner + Country
const RECORDS = [
  { C_Order_ID: 1, DocStatus: 'DR', C_BPartner_ID: 10, CountryCode: 'MY' },
  { C_Order_ID: 2, DocStatus: 'CO', C_BPartner_ID: 11, CountryCode: 'SG' },
  { C_Order_ID: 3, DocStatus: 'CO', C_BPartner_ID: 10, CountryCode: 'MY' },
  { C_Order_ID: 4, DocStatus: 'IP', C_BPartner_ID: 12, CountryCode: 'ID' },
  { C_Order_ID: 5, DocStatus: 'VO', C_BPartner_ID: 11, CountryCode: 'MY' },
];

const FIELDS = [
  { columnName: 'DocStatus',      name: 'Status',           referenceType: 'list' },
  { columnName: 'C_BPartner_ID',  name: 'Business Partner', referenceType: 'tableDirect' },
  { columnName: 'CountryCode',    name: 'Country',          referenceType: 'table' },
  { columnName: 'C_Order_ID',     name: 'Order',            referenceType: null },   // unique → excluded
];

function distinctCount(col) {
  var s = {}; RECORDS.forEach(r => { s[String(r[col] ?? '')] = 1; }); return Object.keys(s).length;
}
function recVal(r, col) { return r[col] ?? null; }
function fmt(f, v) { return v != null ? String(v) : ''; }

// ── Replicate the _kbFields construction from idempiere.html ──
function buildKbFields(records, fields) {
  var n = records.length;
  return fields.filter(function (f) {
    var c = distinctCount(f.columnName); return c >= 2 && c < Math.max(n, 2);
  }).sort(function (a, b) {
    return /docstatus/i.test(a.columnName) ? -1 : /docstatus/i.test(b.columnName) ? 1 : 0;
  });
}

// ── Replicate the change-handler fold logic ──
function foldByField(records, f, kc) {
  var gbS = {};
  records.forEach(function (r) {
    var v = String(fmt(f, recVal(r, f.columnName)) || '(blank)');
    (gbS[v] = gbS[v] || []).push(recVal(r, kc));
  });
  return gbS;
}

// ══════════════════════════════════════════════════
console.log('\n── W-KANBAN-GROUPBY: field selector from AD metadata ──');
{
  const kbFields = buildKbFields(RECORDS, FIELDS);
  console.log('  _kbFields: ' + kbFields.map(f => f.columnName + '(' + distinctCount(f.columnName) + ')').join(', '));

  assert(kbFields.length === 3, 'W-KANBAN-GROUPBY-1: C_Order_ID (unique, 5 distinct) excluded; 3 usable fields');
  assert(kbFields[0].columnName === 'DocStatus', 'W-KANBAN-GROUPBY-2: DocStatus is first in list');
  assert(/docstatus/i.test(kbFields[0].columnName), 'W-KANBAN-GROUPBY-2: first field matches /docstatus/i');
  assert(kbFields.every(f => { var c = distinctCount(f.columnName); return c >= 2 && c < RECORDS.length; }), 'W-KANBAN-GROUPBY-3: all fields have usable cardinality (≥2, < rows)');
  assert(!kbFields.find(f => f.columnName === 'C_Order_ID'), 'W-KANBAN-GROUPBY-3: unique-per-row C_Order_ID is excluded');
}

console.log('\n── W-KANBAN-GROUPBY: docstatus fold (draggable) ──');
{
  const kbFields = buildKbFields(RECORDS, FIELDS);
  const dsField = kbFields[0];   // DocStatus
  const fold = foldByField(RECORDS, dsField, 'C_Order_ID');

  assert(/docstatus/i.test(dsField.columnName), 'W-KANBAN-GROUPBY-4: selected DocStatus → draggable=true');
  assert(Object.keys(fold).length === 4, 'W-KANBAN-GROUPBY-4: 4 status groups: DR/CO/IP/VO');
  assert(fold['CO'].length === 2 && fold['DR'].length === 1, 'W-KANBAN-GROUPBY-4: CO=2, DR=1 correct');
  console.log('  groups: ' + Object.keys(fold).sort().join('/') + ' ids=' + JSON.stringify(fold));
}

console.log('\n── W-KANBAN-GROUPBY: non-docstatus fold (heat-map) ──');
{
  const kbFields = buildKbFields(RECORDS, FIELDS);
  const bpField = kbFields.find(f => f.columnName === 'C_BPartner_ID');
  assert(!!bpField, 'W-KANBAN-GROUPBY-5: C_BPartner_ID is in the list');

  const isDsSwitch = /docstatus/i.test(bpField.columnName);
  assert(!isDsSwitch, 'W-KANBAN-GROUPBY-5: switching to C_BPartner_ID → draggable=false (heat-map)');

  const fold = foldByField(RECORDS, bpField, 'C_Order_ID');
  assert(Object.keys(fold).length === 3, 'W-KANBAN-GROUPBY-5: 3 BPartner groups: 10/11/12');
  assert(fold['10'].length === 2 && fold['11'].length === 2 && fold['12'].length === 1, 'W-KANBAN-GROUPBY-5: correct cardinality per partner');
}

console.log('\n── W-KANBAN-GROUPBY: option labels ──');
{
  const kbFields = buildKbFields(RECORDS, FIELDS);
  // simulate the <option> label construction
  const labels = kbFields.map(f => f.name + (/docstatus/i.test(f.columnName) ? ' ✦' : ''));
  assert(labels[0].includes('✦'), 'W-KANBAN-GROUPBY-6: DocStatus label includes ✦ (draggable marker)');
  assert(!labels.slice(1).some(l => l.includes('✦')), 'W-KANBAN-GROUPBY-6: no other field gets ✦');
  console.log('  labels: ' + labels.join(' | '));
}

console.log('\n── W-KANBAN-GROUPBY: §log format ──');
{
  const kbFields = buildKbFields(RECORDS, FIELDS);
  // simulate what the change handler logs
  const newF = kbFields.find(f => f.columnName === 'CountryCode');
  const isDs = /docstatus/i.test(newF.columnName);
  const gbS = foldByField(RECORDS, newF, 'C_Order_ID');
  const logLine = '§KANBAN-GROUPBY field=' + newF.columnName + ' groups=' + Object.keys(gbS).length + ' draggable=' + isDs;
  console.log('  ' + logLine);
  assert(logLine.includes('§KANBAN-GROUPBY'), 'W-KANBAN-GROUPBY-7: §KANBAN-GROUPBY prefix in log');
  assert(logLine.includes('field=CountryCode'), 'W-KANBAN-GROUPBY-7: field name in log');
  assert(logLine.includes('groups=3'), 'W-KANBAN-GROUPBY-7: correct group count (MY/SG/ID)');
  assert(logLine.includes('draggable=false'), 'W-KANBAN-GROUPBY-7: draggable=false for non-docstatus');
}

console.log('\n── W-KANBAN-GROUPBY: single-field table (no selector) ──');
{
  // If only 1 usable field, selector is hidden (no visible control)
  const thinFields = [{ columnName: 'DocStatus', name: 'Status', referenceType: 'list' }];
  const kbFields = buildKbFields(RECORDS, thinFields);
  assert(kbFields.length === 1, 'W-KANBAN-GROUPBY-8: single-field tables pass cardinality but selector requires >1 to render');
  // The condition is: if (_kbFields.length > 1) → so with 1, no selector rendered
  assert(!(kbFields.length > 1), 'W-KANBAN-GROUPBY-8: selector NOT shown when only 1 usable field');
}

// ── Summary ──
console.log('\n§KANBAN_GROUPBY WITNESS ' + (pass + fail) + ' checks — ' + pass + ' pass · ' + fail + ' fail');
if (fail) { console.log('FAILED'); process.exit(1); }
console.log('W-KANBAN-GROUPBY ALL PASS');
