// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// Scope: LENS lane-3 F1 — the §-WITNESS for the CHAT CHROME (chat_lens.js PURE view-model builder).
//   THE CLAIM: the chat chrome is a FAITHFUL FOLD over the REAL op-log — every bubble traces to a
//   real op (handAuthored=0); dismiss/restore + pill flips are VIEW-ONLY (the op-log row count is
//   NEVER mutated); the verified tick FOLDS from the op's seal/sign state (fabricated=0); and the
//   view-model EXPOSES the mobile reflow fields; REPLAY is a REAL progressive reveal (flipReplay step
//   LIMITS the visible bubbles, never a hollow flip); and the COVERAGE degrade is carried IN the lens
//   (client-level books balance from real fact_acct, per-doc labelled 'partial', fabricated=0 — never
//   an invented per-doc journal). If any of these is false, the chat lens is a skin, not a fold —
//   that is the issue each test below NAMES and proves/disproves.
//
//   The ops are built THE PROVEN WAY (scripts/erp_kernel.js Kernel.apply over glassbowl_data.db,
//   exactly as scripts/poc_chat.js does — REUSE, no fork, no new verb). They are then READ BACK as
//   the engine seam (docs/ENGINE_CONTRACT.md `read`) would return them, and fed to the PURE builder.
//
//   §-log first: run, then READ tests/poc_chat_chrome.log BEFORE concluding anything.
// Run (cwd = bim-ootb/erp): node tests/poc_chat_chrome.js 2>&1 | tee tests/poc_chat_chrome.log
'use strict';

var fs = require('fs'), path = require('path');
var initSqlJs = require('sql.js');
global.window = global.window || {};                          // chat_lens.js is a browser IIFE (window.ChatLens)
delete global.window;                                         // run the builder in pure-node mode (no UserNames/FeedFold)

var K = require('/home/red1/bim-compiler/scripts/erp_kernel.js');   // proven kernel (read-only backend) — REUSE
var ChatLens = require(path.join(__dirname, '..', 'chat_lens.js'));  // the file under test

var GB = process.env.ERP_GLASSBOWL || path.join(__dirname, '..', 'glassbowl_data.db');  // resident mock DataSource
var fails = 0;
function ok(cond, label, detail) { if (!cond) fails++; console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  var SQL = await initSqlJs();
  // ── load the resident mock DataSource (document data: c_invoice, c_invoiceline, c_bpartner, …) ──
  var src = new SQL.Database(new Uint8Array(fs.readFileSync(GB)));
  function one(sql, params) { var r = src.exec(sql, params || []); if (!r.length) return null; var o = {}; r[0].columns.forEach(function (c, i) { o[c] = r[0].values[0][i]; }); return o; }
  function all(sql, params) { var r = src.exec(sql, params || []); if (!r.length) return []; return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); }

  console.log('═══ POC-CHAT-CHROME — chat_lens.js folds the REAL op-log into a mobile thread view-model ═══\n');

  // ── source a REAL document (C_Invoice#103) + lines + bpartner — non-invent (every value from a row) ──
  var INV = 103;
  var inv = one('SELECT * FROM c_invoice WHERE c_invoice_id=$id', { $id: INV });
  var bp = one('SELECT name FROM c_bpartner WHERE c_bpartner_id=$id', { $id: inv.c_bpartner_id });
  var lines = all('SELECT * FROM c_invoiceline WHERE c_invoice_id=$id ORDER BY line', { $id: INV });
  var bpName = bp ? bp.name : ('BPartner#' + inv.c_bpartner_id);
  console.log('── source: C_Invoice#' + INV + ' ' + inv.documentno + ' · ' + bpName + ' · ' + inv.grandtotal + ' · ' + lines.length + ' lines · createdby=' + inv.createdby + ' updatedby=' + inv.updatedby + ' ──\n');

  // ── build the lifecycle THE PROVEN WAY (scripts/poc_chat.js): CREATE_DOCUMENT, CREATE_LINE×3, SET_STATUS DR→CO.
  //    The op-log is ENGINE-BUILT from these rows via Kernel.apply (deterministic pre-stamped uuids). No invent. ──
  var proj = new SQL.Database();
  K.initProjection(proj);
  var docGuid = 'DOC:C_Invoice#' + INV;
  var createOps = [{ op_type: 'CREATE_DOCUMENT', table: 'C_Invoice', source_id: INV, doc_status: 'DR', uuid: docGuid, documentno: inv.documentno, grandtotal: inv.grandtotal, bpartner: bpName, dateinvoiced: inv.dateinvoiced }];
  lines.forEach(function (l) { createOps.push({ op_type: 'CREATE_LINE', table: 'C_InvoiceLine', source_line_id: l.c_invoiceline_id, line_no: l.line, uuid: 'LINE:C_InvoiceLine#' + l.c_invoiceline_id, product: l.m_product_id, linenetamt: l.linenetamt }); });
  var completeOps = [{ op_type: 'SET_STATUS', table: 'C_Invoice', id: INV, doc_status: 'CO', uuid: docGuid }];
  K.apply(proj, createOps, { actor: 'user:' + inv.createdby, baseTs: 1000 });
  K.apply(proj, completeOps, { actor: 'user:' + inv.updatedby, baseTs: 2000 });

  // ── READ BACK as the engine seam `read` would (ENGINE_CONTRACT §1) — the UI gets ROWS, not the log internals ──
  var ops = K.query(proj, 'SELECT op_uuid, timestamp, op_type, parameters, output_guid, user_tag FROM kernel_ops ORDER BY rowid');
  var humanTime = { CREATE_DOCUMENT: inv.created, CREATE_LINE: inv.created, SET_STATUS: inv.updated };
  var srcLabels = { doc: docGuid, invoiceNo: inv.documentno, bpartner: bpName, grandtotal: inv.grandtotal, lines: lines.length, humanTime: humanTime };

  // ════════════════════════════════════════════════════════════════════════════
  // ISSUE 1 — §CHAT-CHROME-THREAD: does every chat bubble FOLD from a real op? (skin vs fold)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('── §CHAT-CHROME-THREAD ──');
  var vm = ChatLens.buildThreadVM(ops, srcLabels);
  vm.bubbles.forEach(function (b) { console.log('   [' + b.senderName + ' · ' + b.time + '] ' + b.tick + ' ' + b.body + '   (' + b.id + ')'); });
  var opUuids = ops.map(function (o) { return o.op_uuid; });
  var everyBubbleIsRealOp = vm.bubbles.every(function (b, i) { return b.id === opUuids[i] && b.sender === ops[i].user_tag && b.verb === ops[i].op_type; });
  console.log('§CHAT-CHROME-THREAD doc=C_Invoice#' + INV + ' bubbles=' + vm.bubbles.length + ' source=op-log handAuthored=' + vm.handAuthored);
  ok(vm.bubbles.length === ops.length && vm.bubbles.length === (1 + lines.length + 1), 'bubble count == op-log == 1 create + ' + lines.length + ' lines + 1 status', 'bubbles=' + vm.bubbles.length + ' ops=' + ops.length);
  ok(everyBubbleIsRealOp, 'every bubble traces to a real op (id=op_uuid, sender=user_tag, verb=op_type)', 'mismatches=' + vm.bubbles.filter(function (b, i) { return b.id !== opUuids[i]; }).length);
  ok(vm.handAuthored === 0, 'handAuthored=0 (no fabricated bubble)', 'handAuthored=' + vm.handAuthored);

  // ════════════════════════════════════════════════════════════════════════════
  // ISSUE 2 — §CHAT-CHROME-DISMISS: is swipe-off a VIEW filter that NEVER touches the op-log?
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n── §CHAT-CHROME-DISMISS ──');
  var N = vm.bubbles.length;
  var logRowsBefore = K.query(proj, 'SELECT COUNT(*) AS c FROM kernel_ops')[0].c;
  ChatLens.dismiss(vm, vm.bubbles[1].id);                       // swipe off 2 line-bubbles (view-only)
  ChatLens.dismiss(vm, vm.bubbles[2].id);
  var swiped = Object.keys(vm.dismissed).length;
  var visibleAfterSwipe = ChatLens.visibleBubbles(vm).length;
  ChatLens.flipRecentChanges(vm);                              // a pill flip restores all
  var visibleAfterFlip = ChatLens.visibleBubbles(vm).length;
  var logRowsAfter = K.query(proj, 'SELECT COUNT(*) AS c FROM kernel_ops')[0].c;
  console.log('§CHAT-CHROME-DISMISS swiped=' + swiped + ' visible=' + visibleAfterSwipe + ' flip→visible=' + visibleAfterFlip + ' restored=' + (visibleAfterFlip === N ? 'Y' : 'N') + ' logRows=' + logRowsAfter + ' unchanged=' + (logRowsBefore === logRowsAfter && vm.logRows === N ? 'Y' : 'N'));
  ok(visibleAfterSwipe === N - swiped, 'swipe hides at the VIEW (visible = N − swiped)', 'visible=' + visibleAfterSwipe + ' N-swiped=' + (N - swiped));
  ok(visibleAfterFlip === N, 'a pill flip restores every dismissed bubble', 'restored=' + visibleAfterFlip + '/' + N);
  ok(logRowsBefore === logRowsAfter && vm.logRows === N, 'the op-log row count is NEVER mutated by a view action', 'rows ' + logRowsBefore + '→' + logRowsAfter + ' vm.logRows=' + vm.logRows);

  // ════════════════════════════════════════════════════════════════════════════
  // ISSUE 3 — §CHAT-CHROME-PILLS: are the pills VIEW flips (not chrome rebuild / log mutation)?
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n── §CHAT-CHROME-PILLS ──');
  var vm2 = ChatLens.buildThreadVM(ops, srcLabels);
  var logRowsP0 = K.query(proj, 'SELECT COUNT(*) AS c FROM kernel_ops')[0].c;
  var flips = [];
  ChatLens.flipRecentChanges(vm2); flips.push('RecentChanges:' + vm2.view);
  ChatLens.flipReplay(vm2, null);  flips.push('Replay:' + vm2.view + '(step=' + vm2.replayStep + ')');
  // anchor fold is ENGINE-supplied (read over FKs) — non-invent; the renderer only lines it up.
  var anchorFold = { entity: bpName, relatedDocs: [docGuid], lastAction: 'SET_STATUS@' + inv.updated, outstanding: 1 };
  ChatLens.flipAnchor(vm2, anchorFold); flips.push('Anchor:' + vm2.view);
  var logRowsP1 = K.query(proj, 'SELECT COUNT(*) AS c FROM kernel_ops')[0].c;
  var bubblesUntouched = vm2.bubbles.length === N && vm2.logRows === N;
  console.log('§CHAT-CHROME-PILLS flips=[' + ['RecentChanges', 'Replay', 'Anchor'].join(',') + '] viewOnly=' + (bubblesUntouched && vm2.anchor.entity === bpName ? 'Y' : 'N') + ' logMutated=' + (logRowsP1 - logRowsP0));
  ok(logRowsP1 === logRowsP0, 'NO pill flip mutates the op-log', 'logRows ' + logRowsP0 + '→' + logRowsP1);
  ok(vm2.view === 'anchor' && vm2.anchor.entity === bpName, 'each pill toggles the view-model only (view flips, anchor lines up the engine fold)', 'view=' + vm2.view + ' anchor=' + vm2.anchor.entity);
  ok(bubblesUntouched, 'the op-log fold (bubbles/logRows) is unchanged across all flips', 'bubbles=' + vm2.bubbles.length + ' logRows=' + vm2.logRows);

  // ════════════════════════════════════════════════════════════════════════════
  // ISSUE 4 — §CHAT-CHROME-TICK: does the verified tick FOLD from sign/seal (never fabricated)?
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n── §CHAT-CHROME-TICK ──');
  // The proven kernel records identity (op_uuid + output_guid) at commit; the hash-chain seal/sig
  // (kernel_ops.js op_hash/sig) is applied at the persistence seam and is ABSENT in this projection.
  // So the HONEST fold is: tick source = 'identity' for every bubble; NONE claim a seal/sig they lack.
  var tickFromState = vm.bubbles.every(function (b) {
    var expectSealed = ops.find(function (o) { return o.op_uuid === b.id; }).op_hash != null;
    var expectSigned = ops.find(function (o) { return o.op_uuid === b.id; }).sig != null;
    return b.sealed === expectSealed && b.signed === expectSigned;   // tick mirrors the op's actual state
  });
  var fabricated = vm.bubbles.filter(function (b) { return (b.signed && !ops.find(function (o) { return o.op_uuid === b.id; }).sig) || (b.sealed && !ops.find(function (o) { return o.op_uuid === b.id; }).op_hash); }).length;
  var signedBubbles = vm.bubbles.filter(function (b) { return b.signed; }).length;
  var sealedBubbles = vm.bubbles.filter(function (b) { return b.sealed; }).length;
  var identityBubbles = vm.bubbles.filter(function (b) { return b.tickSource === 'identity'; }).length;
  var tickSrc = signedBubbles ? 'sign' : (sealedBubbles ? 'seal' : 'identity');
  console.log('   tick states: signed=' + signedBubbles + ' sealed=' + sealedBubbles + ' identity-stamped=' + identityBubbles + ' (seal/sig absent in this projection — labelled, not fabricated)');
  console.log('§CHAT-CHROME-TICK signedBubbles=' + signedBubbles + ' tickSource=' + tickSrc + ' fabricated=' + fabricated);
  ok(tickFromState, 'every tick mirrors the op\'s actual sign/seal state (no tick the op does not carry)', 'mismatch=' + (tickFromState ? 0 : 'Y'));
  ok(fabricated === 0, 'fabricated=0 — no invented tick', 'fabricated=' + fabricated);
  ok(identityBubbles === vm.bubbles.length, 'absent seal/sig honestly labelled (tickSource=identity), never faked as ✓/🔒', 'identity=' + identityBubbles + '/' + vm.bubbles.length);

  // ════════════════════════════════════════════════════════════════════════════
  // ISSUE 5 — §CHAT-CHROME-REFLOW: does the view-model EXPOSE the mobile layout fields?
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n── §CHAT-CHROME-REFLOW ──');
  var m = vm.mobile || {};
  var threadListOk = m.threadList === true && Array.isArray(vm.threadList) && vm.threadList.length >= 1;
  var bubblesOk = m.bubbles === true && vm.bubbles.length > 0;
  console.log('§CHAT-CHROME-REFLOW viewport=' + m.viewport + ' threadList=' + (threadListOk ? 'Y' : 'N') + ' bubbles=' + (bubblesOk ? 'Y' : 'N'));
  ok(m.viewport === 'mobile', 'view-model is mobile-first (viewport=mobile)', 'viewport=' + m.viewport);
  ok(threadListOk, 'view-model exposes a thread-list (inbox) for the phone', 'threadList rows=' + vm.threadList.length);
  ok(bubblesOk, 'view-model exposes reflowable bubbles for the phone', 'bubbles=' + vm.bubbles.length + ' layout=' + m.layout + ' maxW%=' + m.bubbleMaxWidthPct);

  // ════════════════════════════════════════════════════════════════════════════
  // ISSUE 6 — §CHAT-CHROME-REPLAY: is Replay a REAL PROGRESSIVE REVEAL, or a hollow flip?
  //   THE ISSUE (review CONCERN-1): flipReplay sets vm.replayStep but if visibleBubbles ignores it,
  //   the scrub reveals NOTHING (it behaves like Recent Changes). This test FALSIFIES that: it asserts
  //   flipReplay(vm,2) → exactly 2 visible bubbles, flipReplay(vm,5) → all 5, while the op-log row
  //   count stays untouched (the reveal is a PURE view-op, never a slice of the log). A pass here ONLY
  //   means something if step actually LIMITS the rendered bubbles — that is what it proves.
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n── §CHAT-CHROME-REPLAY ──');
  var vm3 = ChatLens.buildThreadVM(ops, srcLabels);
  var Nr = vm3.bubbles.length;
  var logRowsR0 = K.query(proj, 'SELECT COUNT(*) AS c FROM kernel_ops')[0].c;
  ChatLens.flipReplay(vm3, 2);
  var visAt2 = ChatLens.visibleBubbles(vm3).length;
  ChatLens.flipReplay(vm3, 5);
  var visAt5 = ChatLens.visibleBubbles(vm3).length;
  var logRowsR1 = K.query(proj, 'SELECT COUNT(*) AS c FROM kernel_ops')[0].c;
  var logUnchangedR = logRowsR0 === logRowsR1 && vm3.bubbles.length === Nr && vm3.logRows === Nr;
  console.log('§CHAT-CHROME-REPLAY step=2 visible=' + visAt2 + ' step=5 visible=' + visAt5 + ' logRows=' + logRowsR1 + ' unchanged=' + (logUnchangedR ? 'Y' : 'N'));
  ok(visAt2 === 2, 'flipReplay(vm,2) reveals EXACTLY the first 2 bubbles (progressive reveal, not hollow)', 'visible=' + visAt2 + ' expected=2');
  ok(visAt5 === Nr && Nr === 5, 'flipReplay(vm,5) reveals all 5 (the full thread restored at end of scrub)', 'visible=' + visAt5 + ' N=' + Nr);
  ok(logUnchangedR, 'the reveal is a PURE view-op — op-log row count + bubbles fold untouched', 'rows ' + logRowsR0 + '→' + logRowsR1 + ' bubbles=' + vm3.bubbles.length + ' logRows=' + vm3.logRows);

  // ════════════════════════════════════════════════════════════════════════════
  // ISSUE 7 — §CHAT-CHROME-COVERAGE: does the lens carry the COVERAGE degrade, folded the proven way?
  //   THE ISSUE (review CONCERN-2): the spec (MOBILE_CHAT_LENS.md:104-109) wants the posted-message
  //   degrade shown IN the lens — books balanced at CLIENT level (ΣDr=ΣCr from REAL fact_acct), per-doc
  //   posting labelled 'partial', fabricated=0; NEVER an invented per-doc journal. This test FALSIFIES
  //   a fabricated coverage: it reads fact_acct the PROVEN way (mirror scripts/poc_chat.js), folds it
  //   into the VM, and asserts the VM carries the LABELLED coverage, balanced, nothing fabricated.
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n── §CHAT-CHROME-COVERAGE ──');
  // read the client-level books the PROVEN way (poc_chat.js:145-147): per-doc link present ONLY if
  // fact_acct carries record_id + ad_table_id; otherwise coverage degrades to 'partial'. No invent.
  var faCols = all('PRAGMA table_info(fact_acct)').map(function (c) { return String(c.name).toLowerCase(); });
  var docLinkable = faCols.indexOf('record_id') >= 0 && faCols.indexOf('ad_table_id') >= 0;
  var fa = one('SELECT COUNT(*) AS c, ROUND(SUM(amtacctdr),2) AS dr, ROUND(SUM(amtacctcr),2) AS cr FROM fact_acct');
  var covLabels = { doc: docGuid, invoiceNo: inv.documentno, bpartner: bpName, grandtotal: inv.grandtotal, lines: lines.length, humanTime: humanTime,
    factAcct: { rows: fa.c, dr: fa.dr, cr: fa.cr, docLinkable: docLinkable } };
  var vmCov = ChatLens.buildThreadVM(ops, covLabels);
  var cov = vmCov.coverage;
  console.log('   books (client): ' + fa.c + ' fact_acct rows · Dr ' + cov.clientDr + ' / Cr ' + cov.clientCr + ' · balanced=' + (cov.balanced ? 'Y' : 'N') + ' · per-doc=' + cov.coverage);
  console.log('§CHAT-CHROME-COVERAGE source=' + cov.source + ' coverage=' + cov.coverage + ' clientDr=' + cov.clientDr + ' clientCr=' + cov.clientCr + ' balanced=' + (cov.balanced ? 'Y' : 'N') + ' fabricated=' + cov.fabricated);
  ok(cov.source === 'fact_acct' && cov.coverage === 'partial', 'the VM carries the LABELLED coverage from fact_acct (per-doc=partial, not fabricated)', 'source=' + cov.source + ' coverage=' + cov.coverage);
  ok(cov.balanced === true && cov.clientDr === cov.clientCr, 'client-level books BALANCE (ΣDr=ΣCr from real fact_acct)', 'Dr=' + cov.clientDr + ' Cr=' + cov.clientCr);
  ok(cov.fabricated === 0, 'fabricated=0 — NO invented per-doc journal (the degrade is labelled, not faked)', 'fabricated=' + cov.fabricated);

  console.log('\n═══ ' + (fails === 0 ? '✅ POC-CHAT-CHROME ALL PASS' : '❌ POC-CHAT-CHROME ' + fails + ' FAIL') + ' — the chat chrome is a faithful, view-only, sign/seal-honest, mobile fold ═══');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e); process.exit(2); });
