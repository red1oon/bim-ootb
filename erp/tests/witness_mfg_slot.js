#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MFG-SLOT (Milestone 2; spec ~/Projects/Mfg/MILESTONE_2_SPEC.md). READ THE LOG after every run: verdict = §MFG-SLOT-VERDICT.
// THE ISSUE it proves/disproves: every manufacturing table lands in the 5-table slot the layers table says, by the rule that really decides it
//   (ad_table_map.js OVERRIDES else the PV heuristic fed with DICTIONARY facts — built exactly as scripts/test_bridge.js builds them), and that result
//   is not vacuous: removing the override / the DocStatus fact flips the slot.  Deliberate breaks: MFG_BREAK=override|facts.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var BREAK = process.env.MFG_BREAK || '', fails = 0, judged = 0, inconclusive = 0;
function check(name, ok, info) { judged++; if (!ok) fails++; console.log('  §MFG-SLOT ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
// layers table of Manufacturing Model Milestones and Contracts.md (slots as the doc states them); MP rows = the measured correction (see spec)
var WANT = {
  PP_Product_BOM: 'items', PP_Product_BOMLine: 'items', PP_WF_Node_Product: 'items', PP_WF_Node_Asset: 'items',
  S_ResourceType: 'items', S_Resource: 'items', S_ResourceAssignment: 'items', S_ResourceUnAvailable: 'items',
  PP_Product_Planning: 'items', PP_MRP: 'documents', M_Forecast: 'items', PP_Order: 'documents',
  PP_Order_BOM: 'document_lines', PP_Order_BOMLine: 'document_lines', PP_Order_Workflow: 'documents', PP_Order_Node: 'documents',
  PP_Cost_Collector: 'documents', PP_Cost_CollectorMA: 'document_lines',
  PP_Order_NodeNext: 'document_lines', PP_Order_Node_Asset: 'document_lines', PP_Order_Node_Product: 'document_lines',
  PP_Order_Cost: 'document_lines', M_Cost: 'items', M_CostElement: 'items', M_ChangeNotice: 'items' };
var WANT_MP = { MP_Maintain: 'documents', MP_OT: 'documents', MP_OT_Request: 'documents', MP_Maintain_Task: 'document_lines', MP_Maintain_Resource: 'document_lines',
  MP_OT_Task: 'document_lines', MP_OT_Resource: 'document_lines' };
(async function () {
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) });
  var db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));   // dictionary only: no patch needed, no physical table needed
  function q(sql) { var r = db.exec(sql); return r.length ? r[0].values : []; }
  var isDoc = {}; q("SELECT DISTINCT t.TableName FROM AD_Column c JOIN AD_Table t ON c.AD_Table_ID=t.AD_Table_ID WHERE c.ColumnName='DocStatus'").forEach(function (r) { isDoc[r[0]] = 1; });
  var contain = {}, byWin = {};
  q("SELECT t.AD_Window_ID,t.SeqNo,t.TabLevel,tb.TableName FROM AD_Tab t JOIN AD_Table tb ON t.AD_Table_ID=tb.AD_Table_ID WHERE t.IsActive='Y' ORDER BY t.AD_Window_ID,t.SeqNo").forEach(function (r) { (byWin[r[0]] = byWin[r[0]] || []).push(r); });
  Object.keys(byWin).forEach(function (w) { var st = {}; byWin[w].forEach(function (r) { st[r[2]] = r[3]; if (r[2] > 0 && st[r[2] - 1] && st[r[2] - 1] !== r[3]) contain[r[3] + '>' + st[r[2] - 1]] = 1; }); });
  var M = require(path.join(ERP, 'ad_table_map.js'));
  var facts = { isDoc: isDoc, contain: contain };
  if (BREAK === 'override') delete M.OVERRIDES.PP_Order_BOM;
  if (BREAK === 'facts') facts = { isDoc: {}, contain: contain };
  console.log('§MFG-SLOT-LOAD overrides=' + Object.keys(M.OVERRIDES).length + ' docTables=' + Object.keys(isDoc).length + ' contain=' + Object.keys(contain).length + ' break=' + (BREAK || 'none'));

  // S1 the layers table
  var diff = [], names = Object.keys(WANT);
  names.forEach(function (t) { var got = M.slotOf(t, facts); if (got !== WANT[t]) diff.push(t + ': want ' + WANT[t] + ' got ' + got); });
  console.log('§MFG-SLOT-S1 judged=' + names.length + ' diff=' + diff.length);
  check('S1 every layers-table table resolves to its slot', diff.length === 0, { diff: diff });

  // S2 dictionary population (denominator from AD_Table, never a hand list)
  var pop = q("SELECT TableName FROM AD_Table WHERE TableName LIKE 'PP\\_%' ESCAPE '\\' OR TableName LIKE 'MP\\_%' ESCAPE '\\' OR TableName LIKE 'S\\_Resource%' ESCAPE '\\' OR TableName LIKE 'M\\_Forecast%' ESCAPE '\\' ORDER BY 1").map(function (r) { return r[0]; });
  var bySlot = {}, unlisted = [];
  pop.forEach(function (t) { var s = M.slotOf(t, facts); bySlot[s] = (bySlot[s] || 0) + 1; if (!WANT[t] && !WANT_MP[t]) unlisted.push(t + '=' + s); });
  console.log('§MFG-SLOT-S2 population=' + pop.length + ' bySlot=' + JSON.stringify(bySlot) + ' unlisted=' + unlisted.length);
  console.log('§MFG-SLOT-UNLISTED ' + unlisted.join(' '));
  if (!pop.length) { inconclusive++; console.log('§MFG-SLOT-S2 INCONCLUSIVE — empty dictionary population'); }
  else check('S2 every dictionary PP/MP/S_Resource/M_Forecast table resolves to a slot', pop.every(function (t) { return !!M.slotOf(t, facts); }), {});

  // S3 the measured Maintenance rows
  var d3 = Object.keys(WANT_MP).filter(function (t) { return M.slotOf(t, facts) !== WANT_MP[t]; }).map(function (t) { return t + ': want ' + WANT_MP[t] + ' got ' + M.slotOf(t, facts); });
  check('S3 Maintenance headers=documents, tasks/resources=document_lines', d3.length === 0, { diff: d3 });

  // S4 non-vacuity: what each pinned slot really depends on (computed on the REAL map, then the dependency removed)
  var onlyFacts = names.filter(function (t) { return WANT[t] === 'documents' && M.slotOf(t, { isDoc: {}, contain: contain }) !== 'documents'; });
  var onlyOverride = names.filter(function (t) { return M.OVERRIDES[t] && WANT[t] === M.OVERRIDES[t].slot; });
  console.log('§MFG-SLOT-S4 fact-dependent(no override, documents only via DocStatus)=' + onlyFacts.join(',') + ' | override-pinned=' + onlyOverride.length);
  check('S4 pinned slots are rule-produced (fact-dependent tables flip to items without facts)', onlyFacts.length >= 3 && onlyFacts.every(function (t) { return !M.OVERRIDES[t]; }), { onlyFacts: onlyFacts });

  var verdict = fails ? 'FAIL' : (inconclusive ? 'INCONCLUSIVE' : 'PASS');
  console.log('§MFG-SLOT-VERDICT ' + verdict + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§MFG-SLOT-VERDICT FAIL harness error: ' + e.message); process.exit(2); });
