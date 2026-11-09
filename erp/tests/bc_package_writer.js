// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — bc_package_writer.js: TEST HELPER for W-BC-MIGRATE / W-BC-MIGRATE-LIVE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §BC-SPEC). Writes the fixture rows
//   (fixtures/bc_package_contoso/rows.json, Microsoft's demo company) as a Business Central configuration package in BC's own Excel layout (ConfigExcelExchange.Codeunit.al):
//   one sheet per table — the first named by its caption, the others "<id> <caption>" cut to 31 (:816-824, "/" removed :160); row 1 = package code · caption · TABLE ID (:662-684);
//   row 3 = the captions of every Normal field (a package includes all fields by default); data from row 4; Enum = its caption, Boolean = true/false (XML format).
'use strict';
function write(XLSX, MODEL, FX, code) {
  var wb = XLSX.utils.book_new(), first = true;
  function cellOf(f, v) { if (v === undefined || v === null || v === '') return ''; if (v && typeof v === 'object' && v.enumValue !== undefined) { var e = (f.enumValues || []).find(function (x) { return x.name === v.enumValue; }); return e ? e.caption : v.enumValue; }
    if (typeof v === 'boolean') return v ? 'true' : 'false'; return v; }
  Object.keys(FX.rows).forEach(function (id) { var t = MODEL.tables[id]; if (!t) return;
    var fields = t.fields.filter(function (f) { return f.fieldClass !== 'FlowField' && f.fieldClass !== 'FlowFilter' && f.obsolete !== 'Removed' && ['Blob', 'Media', 'MediaSet'].indexOf(f.type) < 0; });
    var aoa = [[code || 'CONTOSO-ALPHA', t.caption, String(t.id)], [], fields.map(function (f) { return f.caption; })];
    FX.rows[id].forEach(function (r) { aoa.push(fields.map(function (f) { return cellOf(f, r[f.name]); })); });
    var nm = first ? t.caption.replace(/\//g, '') : (t.id + ' ' + t.caption.replace(/\//g, '')).slice(0, 31); first = false;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nm); });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
module.exports = { write: write };
