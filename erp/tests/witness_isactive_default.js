#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ISACTIVE-DEFAULT (found by the Libero intro film). READ THE LOG: §ISACT lines.
// THE ISSUE it proves/disproves: GridField.getDefault stage 1 (defaultForSpecialCase -> defaultForActiveField, GridField.java:777-785): a column named IsActive ALWAYS defaults to 'Y'. Libero's EE01 columns carry NO DefaultValue, so the twin's
//   form-spec fold left IsActive unchecked on New and §GT.7 then made every other field of the new record read-only (a New Manufacturing Order could not be typed). Neg-controls: a column that is not IsActive keeps its (absent) default;
//   an explicit IsActive default of 'N' is still overridden to 'Y' by the special case (stage 1 wins over the dictionary).
'use strict';
var path = require('path'), ERP = path.join(__dirname, '..'), CORE = require(path.join(ERP, 'crud_core.js')), log = console.log, fails = 0, judged = 0;
function check(n, ok, i) { judged++; if (!ok) fails++; log('  §ISACT ' + n + ' ' + (ok ? 'OK' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(i))); }
function fld(col, extra) { return Object.assign({ columnName: col, name: col, isDisplayed: true, referenceId: col === 'IsActive' ? 20 : 10, isMandatory: false }, extra || {}); }
var spec = CORE.foldCrudSpec([fld('IsActive'), fld('Name'), fld('Description')], { forVerb: 'create' });
var by = function (c) { return spec.fields.filter(function (f) { return f.col === c; })[0]; };
log('§ISACT fields=' + spec.fields.map(function (f) { return f.col + '=' + JSON.stringify(f.default); }).join(' '));
check('I1 IsActive without a DefaultValue defaults to Y (the Libero case)', by('isactive').default === 'Y', by('isactive'));
check('I2 defaultsFor(entry) hands the New form isactive=Y', CORE.defaultsFor(spec, '2026-10-15').isactive === 'Y', CORE.defaultsFor(spec, '2026-10-15'));
check('I3 NEG: other columns keep their absent default', by('name').default === undefined && by('description').default === undefined, [by('name').default, by('description').default]);
var spec2 = CORE.foldCrudSpec([fld('IsActive', { defaultValue: 'N' })], { forVerb: 'create' });
check('I4 stage 1 wins over a dictionary DefaultValue of N (defaultForActiveField is "Always Active")', spec2.fields[0].default === 'Y', spec2.fields[0].default);
var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§ISACT-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : 1);
