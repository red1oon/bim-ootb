// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// Scope: headless §-witness for kanban_lens.js (LENS-FAMILY lane-3 F2 — the KANBAN CHROME).
//   THE CLAIM (engine PROVEN in build/erp/poc_kanban.log; this proves the CHROME folds/resolves it):
//     1. §KANBAN-CHROME-FOLD   — the board (columns + cards) FOLDS from real docstatus in
//        glassbowl_data.db via wfmc; handAuthored=0 (no column or card invented).
//     2. §KANBAN-CHROME-DRAG    — a card drag resolves (resolveDrag) to the proven dispatch op, and
//        that op is BYTE-IDENTICAL to the chat-SEND op for the same record+action (SEND==DRAG==VERB).
//     3. §KANBAN-CHROME-LEGALITY — an illegal drag (CO→DR, no wfmc edge) is refused AT THE BOARD
//        (snap-back) AND, if forced, by the ENGINE state-machine — legality is engine-owned.
//   §-log first — READ tests/poc_kanban_chrome.log before any conclusion.
// Run:  node tests/poc_kanban_chrome.js 2>&1 | tee tests/poc_kanban_chrome.log   (cwd = bim-ootb/erp)
'use strict';
var fs = require('fs'), path = require('path');
var initSqlJs = require('sql.js');

var ERP = __dirname + '/..';                                    // bim-ootb/erp
var BIMC = path.join(process.env.HOME, 'bim-compiler');         // bim-compiler (engine + witness home)
var GB = path.join(ERP, 'glassbowl_data.db');
var MANIFEST = path.join(ERP, 'manifest.json');

global.window = global.window || {};                            // kanban_lens.js is a browser IIFE
var KanbanLens = require(path.join(ERP, 'kanban_lens.js'));     // the chrome under test (pure builders)
var K = require(path.join(BIMC, 'scripts', 'erp_kernel.js'));   // the PROVEN engine — reuse, never fork
var wfmc = require(MANIFEST).wfmc;

var fails = 0;
function ok(cond, msg, detail) {
  if (!cond) { fails++; console.log('   🔴 FAIL: ' + msg + (detail ? ' — ' + detail : '')); }
  else console.log('   🟢 ' + msg + (detail ? ' — ' + detail : ''));
}
function rows(db, sql, p) {
  var r = db.exec(sql, p || []);
  if (!r.length) return [];
  return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; });
}

(async function () {
  console.log('═══ POC-KANBAN-CHROME — the kanban CHROME folds + resolves the PROVEN engine ═══\n');
  var SQL = await initSqlJs();
  var gb = new SQL.Database(new Uint8Array(fs.readFileSync(GB)));
  function q(db) { return function (s, p) { return K.query(db, s, p); }; }

  // ════════════════════════════════════════════════════════════════════════
  // ISSUE 1 — §KANBAN-CHROME-FOLD: does the BOARD fold from real docstatus (no hand-authoring)?
  //   Issue it proves: the columns/cards are a fold over glassbowl_data.db + wfmc, not a static list.
  // ════════════════════════════════════════════════════════════════════════
  console.log('── §KANBAN-CHROME-FOLD ──');
  // the status-grouped fold of REAL docs — the same COUNT(*) GROUP BY docstatus shape poc_kanban uses.
  var folds = [];
  [['C_Invoice', 'c_invoice'], ['C_Order', 'c_order'], ['C_Payment', 'c_payment']].forEach(function (p) {
    rows(gb, "SELECT docstatus, COUNT(*) AS n FROM " + p[1] + " GROUP BY docstatus").forEach(function (r) {
      folds.push({ table: p[0], doc_status: r.docstatus, count: Number(r.n) });
    });
  });
  var board = KanbanLens.buildBoard(folds, wfmc, { showEmptyStates: false });
  board.columns.forEach(function (c) { console.log('   │ ' + c.label + ' (' + c.status + ') │  ' + c.count + ' cards'); });

  var colStatuses = board.columns.map(function (c) { return c.status; });
  var allColsAreWfmcStates = colStatuses.every(function (s) { return (wfmc.states || []).indexOf(s) >= 0; });
  var foldTotal = folds.reduce(function (a, f) { return a + f.count; }, 0);
  console.log('§KANBAN-CHROME-FOLD columns=[' + colStatuses.join(',') + '] cards=' + board.totalCards +
    ' source=doc_status handAuthored=' + board.handAuthored + ' sparse=' + board.sparse);
  ok(allColsAreWfmcStates && colStatuses.length > 0, 'every column is a wfmc state folded from real docstatus', 'cols=[' + colStatuses.join(',') + ']');
  ok(board.totalCards === foldTotal && foldTotal > 0, 'every card is a real doc grouped by docstatus (count==fold)', 'cards=' + board.totalCards + ' fold=' + foldTotal);
  ok(board.handAuthored === 0, 'NOTHING hand-authored — the board is a pure fold', 'handAuthored=' + board.handAuthored);

  // ════════════════════════════════════════════════════════════════════════
  // ISSUE 2 — §KANBAN-CHROME-DRAG: does a column DRAG resolve to the PROVEN dispatch op, byte-identical
  //   to the chat-SEND op? (The seed is all-CO/CL; a DR→CO drag needs a DR card, so we seed a DR card —
  //   exactly as scripts/poc_kanban.js does — to exercise the Complete edge end-to-end through dispatch.)
  //   Issue it proves: SEND == DRAG == VERB — the lens contributes NOTHING to the emitted op.
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── §KANBAN-CHROME-DRAG ──');
  var INV = 103, docGuid = 'DOC:C_Invoice#' + INV, ACTOR = 'user:clerk', BASE = 5000;

  // the ONE handler both lenses funnel through (same registration as poc_kanban.js): SET_STATUS to ctx.to.
  K.register('C_Invoice', 'CO', function (doc, ctx) {
    return [{ op_type: 'SET_STATUS', table: doc.table, id: doc.id, doc_status: ctx.to, uuid: doc.uuid }];
  });
  function seedDrCard(db) {
    K.initProjection(db);
    K.apply(db, [{ op_type: 'CREATE_DOCUMENT', table: 'C_Invoice', source_id: INV, doc_status: 'DR', uuid: docGuid }],
      { actor: 'user:seed', baseTs: 1000 });
  }
  function setStatusRow(db) {
    return rows(db, "SELECT op_uuid, op_type, parameters, output_guid, user_tag FROM kernel_ops WHERE op_type='SET_STATUS'")[0];
  }

  // a board with the DR card present, so the CHROME's resolveDrag has a card to drag DR→CO.
  var drBoard = KanbanLens.buildBoard(
    [{ table: 'C_Invoice', doc_status: 'DR', count: 1, ids: [INV] }], wfmc, { showEmptyStates: false });
  var cardKey = 'C_Invoice#' + INV;

  // CHROME drag: DR column → CO column. resolveDrag yields the action; dragIntent yields the dispatch payload.
  var dres = KanbanLens.resolveDrag(drBoard, cardKey, 'CO', wfmc);
  var dragInt = KanbanLens.dragIntent(dres);

  // CHAT send: tap "Complete" — the explicit intent for the same record+action.
  var chatInt = { docType: 'C_Invoice', table: 'C_Invoice', id: INV, uuid: docGuid, status: 'DR', action: 'CO' };

  // dispatch BOTH through the SAME engine, from the SAME seeded DR card, with the SAME actor/baseTs.
  var dbChat = new SQL.Database(); seedDrCard(dbChat);
  var rChat = K.dispatch(dbChat, { wfmc: wfmc, guards: [], query: q(dbChat), actor: ACTOR, baseTs: BASE }, chatInt);
  var dbKan = new SQL.Database(); seedDrCard(dbKan);
  var rKan = K.dispatch(dbKan, { wfmc: wfmc, guards: [], query: q(dbKan), actor: ACTOR, baseTs: BASE }, dragInt);

  console.log('   CHROME resolveDrag DR→CO → action=' + dres.action + ' legal=' + dres.legal + ' intent=' + JSON.stringify(dragInt));
  console.log('   CHAT send "Complete"     → intent=' + JSON.stringify(chatInt));
  console.log('   CHAT  op → ' + (rChat.ok ? JSON.stringify(rChat.ops[0]) : rChat.stage + ':' + rChat.reason));
  console.log('   DRAG  op → ' + (rKan.ok ? JSON.stringify(rKan.ops[0]) : rKan.stage + ':' + rKan.reason));

  var opEqual = rChat.ok && rKan.ok && JSON.stringify(rChat.ops[0]) === JSON.stringify(rKan.ops[0]);
  var rowChat = setStatusRow(dbChat), rowKan = setStatusRow(dbKan);
  var rowEqual = rowChat && rowKan && JSON.stringify(rowChat) === JSON.stringify(rowKan);
  var hashChat = K.projectionHash(dbChat), hashKan = K.projectionHash(dbKan);
  console.log('§KANBAN-CHROME-DRAG from=DR to=CO op=' + (dres.action === 'CO' ? 'SET_STATUS' : '??') +
    ' action=' + dres.action + ' dispatchEq=' + (opEqual ? 'Y' : 'N') +
    ' committedRowEq=' + (rowEqual ? 'Y' : 'N') + ' projEq=' + (hashChat === hashKan ? 'Y' : 'N'));
  ok(dres.legal && dres.action === 'CO', 'CHROME drag DR→CO resolves to the Complete action (from the SAME wfmc)', 'action=' + dres.action);
  ok(rKan.ok && rKan.to === 'CO' && rKan.ops[0].op_type === 'SET_STATUS', 'the drag dispatches the proven SET_STATUS verb', rKan.ok ? rKan.ops[0].op_type + '→' + rKan.to : rKan.reason);
  ok(opEqual, 'the emitted op is BYTE-IDENTICAL to the chat-SEND op (SEND==DRAG==VERB)', 'opEqual=' + opEqual);
  ok(rowEqual, 'the COMMITTED kernel_ops row is identical (same op_uuid/payload/actor)', 'rowEqual=' + rowEqual);
  ok(hashChat === hashKan, 'the resulting projection is identical (the lens contributes NOTHING)', hashChat + '==' + hashKan);

  // ════════════════════════════════════════════════════════════════════════
  // ISSUE 3 — §KANBAN-CHROME-LEGALITY: is an illegal drag refused at the board AND by the engine?
  //   Issue it proves: legality is ENGINE-OWNED — the board's snap-back mirrors the same guard the
  //   chat lens funnels through; the lens cannot widen the state machine.
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n── §KANBAN-CHROME-LEGALITY ──');
  // (a) BOARD level: a CO card dragged back to the DR column — there is NO wfmc edge CO→DR ⇒ snap-back.
  var coBoard = KanbanLens.buildBoard(
    [{ table: 'C_Invoice', doc_status: 'CO', count: 1, ids: [INV] }], wfmc, { showEmptyStates: false });
  var illegal = KanbanLens.resolveDrag(coBoard, 'C_Invoice#' + INV, 'DR', wfmc);
  console.log('   CHROME drag CO→DR → legal=' + illegal.legal + ' action=' + illegal.action + ' reason=' + illegal.reason + ' → snap-back');
  // (b) ENGINE level: even if forced (Complete an already-CO doc), the state machine rejects it.
  var dbCO = new SQL.Database(); K.initProjection(dbCO);
  K.apply(dbCO, [{ op_type: 'CREATE_DOCUMENT', table: 'C_Invoice', source_id: INV, doc_status: 'CO', uuid: docGuid }], { actor: 'user:seed', baseTs: 1000 });
  var rIllegal = K.dispatch(dbCO, { wfmc: wfmc, guards: [], query: q(dbCO), actor: ACTOR, baseTs: BASE },
    { docType: 'C_Invoice', table: 'C_Invoice', id: INV, uuid: docGuid, status: 'CO', action: 'CO' });
  console.log('   ENGINE dispatch(status=CO,action=CO) → ' + (rIllegal.ok ? 'APPLIED (unexpected)' : rIllegal.stage + ': ' + rIllegal.reason));

  console.log('§KANBAN-CHROME-LEGALITY illegalDrag(CO→DR)=blocked(' + illegal.reason + ') snapBack=' +
    (!illegal.legal ? 'Y' : 'N') + ' engineRejects=' + (!rIllegal.ok ? 'Y' : 'N') +
    ' engineOwned=Y stage=' + rIllegal.stage);
  ok(!illegal.legal && illegal.action === null && illegal.reason === 'no-edge', 'illegal drag CO→DR refused at the board (no wfmc edge → snap-back)', 'action=' + illegal.action);
  ok(!rIllegal.ok && rIllegal.stage === 'state-machine', 'the engine state-machine rejects the illegal move — same guard both lenses funnel through', rIllegal.stage + ':' + rIllegal.reason);

  console.log('\n═══ ' + (fails === 0 ? '✅ POC-KANBAN-CHROME ALL PASS' : '❌ POC-KANBAN-CHROME ' + fails + ' FAIL') +
    ' — the kanban CHROME folds the board, drag==send==verb, legality is engine-owned ═══');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL: ' + e.stack); process.exit(2); });
