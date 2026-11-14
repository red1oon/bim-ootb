#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — make_ninja_practice.js: writes common/door/samples/Ninja_Practice.xlsx, the small Ninja workbook the Fast Script Guide's practice lines use. READ THE §-LOG after every run.
// Spec: bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.6. Witness: common/door/tests/witness_ninja_exec.js (claim E9 stages this very file).
// The sheets have the shape of a Ninja workbook: 1_RO_ModelHeader (the bundle's name), 2_RO_ModelMaker (one row per table: Master, Name, ColumnSet), then a data sheet named after a table.
//   node common/door/tools/make_ninja_practice.js        write the file (the tables and rows are the ones below; nothing else is added)
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..', '..'), XL = require(path.join(ROOT, 'erp', 'xlsx.mini.min.js'));
const HDR = ['RO_ModelHeader_ID', 'SeqNo', 'WorkflowStructure', 'KanbanBoard', 'Master', 'Name', 'Help', 'ColumnSet'];
const MODEL = [   // Master, Name, Help, ColumnSet (Ninja's tokens: D# date, A# amount, Q# quantity, T# text, Y# yes/no, L#Name=a/b/c a list)
  ['', 'PR_Patient', 'A patient', 'Name,D#DateOfBirth,L#BloodGroup=A/B/AB/O,Y#IsInsured'],
  ['PR_Patient', 'PR_Visit', 'A visit of that patient', 'Name,D#DateVisit,A#Fee,T#Notes'],
  ['PR_Visit', 'PR_Medicine', 'A medicine given at that visit', 'Name,Q#Qty'],
  ['', 'PR_Room', 'A room of the clinic', 'Name,Q#Beds'],
  ['C_BPartner', 'PR_Referral', 'A referral by a business partner: its Master is a table of the system, so it becomes a tab of the Business Partner window', 'Name,D#DateReferred']
];
const wb = XL.utils.book_new(), add = (n, rows) => XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(rows), n);
add('1_RO_ModelHeader', [['Name', 'Version'], ['Practice', '1']]);
add('2_RO_ModelMaker', [HDR].concat(MODEL.map((m, i) => ['Practice', i + 1, 'N', 'N', m[0], m[1], m[2], m[3]])));
add('PR_Patient', [['Name'], ['Aminah'], ['Boon'], ['Chandra']]);
add('PR_Room', [['Name', 'Beds'], ['Ward 1', 4], ['Ward 2', 6]]);
const out = path.join(ROOT, 'common', 'door', 'samples', 'Ninja_Practice.xlsx');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, XL.write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.log('§NINJA_PRACTICE written ' + path.relative(ROOT, out) + ' bytes=' + fs.statSync(out).size + ' tables=' + MODEL.length + ' sheets=' + wb.SheetNames.join(','));
