#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ERP-SIGN + W-ERP-FOLD (teams/ROADMAP.md §S1, Phase A — zero impact).
//   Proves the Teams core can READ a LIVE erp/ kernel_ops log through teams/erp/erp_bridge.js with
//   ZERO edits to erp/ (read-only). Drives the REAL erp/ runtime modules (kernel_ops.js, erp_kernel.js,
//   erp_signer.js) over an in-node sql.js projection — no modeller, no browser. Read the log after every run.
//     §ERP-SIGN-SEAL   — a real ERP op chain seals + signs through the bridge.
//     §ERP-SIGN-OK     — verifyChain() over that chain returns ok (verifies THROUGH the bridge).
//     §ERP-SIGN-WRAP   — the per-op sign(op_hash) wrap produces a sig the signer verifies; a forged hash → false.
//     §ERP-SIGN-TAMPER — flip one op's parameters byte → verifyChain FAILS at exactly that op (rejected).
//     §ERP-FOLD-REPLAY — replay×2 → identical projection hash (deterministic event-sourced World).
//     §ERP-FOLD-WORLD  — bridge.world() hash == direct replay hash (the bridge folds the same World).
//     §ERP-FOLD-BLAME  — last `actor` per doc (alice/bob), a pure projection of the signed log.
//     §ERP-FOLD-NOMINT — zero edgeMint calls across replay (identity re-read, never re-computed = NON-INVENT).
//     §ERP-BIND        — goLiveErp() rebinds connectors.verifyChain → ERP chain (the connector seam, additive).
//   Run: node teams/tests/poc_teams_erp_bridge.js 2>&1 | tee teams/teams_erp_bridge.log — then READ the log.
'use strict';
var path = require('path');

// ── node host shim — the ERP runtime modules are browser-shaped (window globals, WebCrypto). ──
//   The witness supplies the host so the bridge stays decoupled (browser passes window.* instead).
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
function reqSql() {                          // resolve sql.js from wherever the suite runs
  var tries = ['sql.js', '/home/red1/bim-ootb/node_modules/sql.js',
               path.join(__dirname, '..', '..', 'node_modules', 'sql.js'),
               path.join(__dirname, '..', '..', 'tests', 'node_modules', 'sql.js')];
  for (var i = 0; i < tries.length; i++) { try { return require(tries[i]); } catch (e) {} }
  throw new Error('sql.js not resolvable — install it or run from a checkout that has it');
}
var ERP = path.join(__dirname, '..', '..', 'erp');
require(path.join(ERP, 'kernel_ops.js'));    // → window.KernelOps
require(path.join(ERP, 'erp_signer.js'));    // → window.ErpSigner
var ERPKernel = require(path.join(ERP, 'erp_kernel.js'));
var Bridge = require(path.join(__dirname, '..', 'erp', 'erp_bridge.js'));
var Connectors = require(path.join(__dirname, '..', 'connectors.js'));
var HOST = { KernelOps: global.window.KernelOps, ErpSigner: global.window.ErpSigner, ERPKernel: ERPKernel };

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

(async function () {
  console.log('\n═══ W-ERP-SIGN + W-ERP-FOLD — Teams reads a LIVE erp/ log through the read-bridge (zero erp/ edits) ═══\n');
  var SQL = await reqSql()();
  var bridge = Bridge.makeBridge(HOST);

  // ── arrange: a real ERP kernel_ops log — two docs, two actors (last-writer differs per doc). ──
  //   uuid supplied = the edge-minted New-doc seam (§0.21 identity-as-input) so both ops hit the SAME doc.
  var db = new SQL.Database();
  ERPKernel.initProjection(db);
  ERPKernel.apply(db, [{ op_type: 'CREATE_DOCUMENT', uuid: 'DOC:SO-1', table: 'C_Order', source_id: 1, doc_status: 'DR' }], { actor: 'alice', baseTs: 1000 });
  ERPKernel.apply(db, [{ op_type: 'CREATE_DOCUMENT', uuid: 'DOC:SO-2', table: 'C_Order', source_id: 2, doc_status: 'DR' }], { actor: 'bob',   baseTs: 2000 });
  ERPKernel.apply(db, [{ op_type: 'SET_STATUS',      uuid: 'DOC:SO-1', table: 'C_Order', id: 1, doc_status: 'CO' }],       { actor: 'bob',   baseTs: 3000 });
  ERPKernel.apply(db, [{ op_type: 'SET_STATUS',      uuid: 'DOC:SO-2', table: 'C_Order', id: 2, doc_status: 'CO' }],       { actor: 'alice', baseTs: 4000 });

  // ════ W-ERP-SIGN ════
  // §ERP-SIGN-WRAP — the per-op signer wrap (install once, sign an op_hash hex, verify it).
  var kp = await HOST.ErpSigner.mintKeypair();
  bridge.installSigner(kp);
  var sampleHash = HOST.KernelOps ? 'a'.repeat(64) : null;
  var sig = await bridge.sign(sampleHash);
  var sigOk = await bridge.verifySig(sampleHash, sig);
  var forgeOk = await bridge.verifySig('b'.repeat(64), sig);   // wrong hash, same sig → must reject
  verdict(sigOk && !forgeOk, '§ERP-SIGN-WRAP  per-op sign(op_hash) wrap', 'real sig verifies, forged hash rejected');

  // §ERP-SIGN-SEAL — seal+sign the whole chain through the bridge.
  var seal = await bridge.seal(db);
  verdict(seal.sealed === 4, '§ERP-SIGN-SEAL  real ERP chain seals through bridge', 'sealed=' + seal.sealed + ' tip=' + seal.tip.slice(0, 12) + '…');

  // §ERP-SIGN-OK — verifyChain verifies THROUGH the bridge (signed chain).
  var v1 = await bridge.verifyChain(db);
  verdict(v1.ok && v1.len === 4, '§ERP-SIGN-OK  verifyChain ok through bridge', 'ok=' + v1.ok + ' len=' + v1.len);

  // ════ W-ERP-FOLD ════ (do FOLD before tamper — the World must read the intact log)
  // §ERP-FOLD-REPLAY — deterministic World: replay×2 → identical projection hash.
  ERPKernel._stats.edgeMintCalls = 0;                       // reset the white-box re-mint counter
  var r1 = ERPKernel.replay(db, new SQL.Database());
  var r2 = ERPKernel.replay(db, new SQL.Database());
  verdict(r1.hash === r2.hash, '§ERP-FOLD-REPLAY  replay×2 identical projection hash', r1.hash + ' == ' + r2.hash);

  // §ERP-FOLD-WORLD — bridge.world() folds the SAME World as a direct replay.
  var w = bridge.world(db, function () { return new SQL.Database(); });
  verdict(w.hash === r1.hash && w.ops === 4, '§ERP-FOLD-WORLD  bridge.world() == direct replay', 'ops=' + w.ops + ' hash=' + w.hash);

  // §ERP-FOLD-NOMINT — NON-INVENT: zero edgeMint across the three replays (identity re-read, never re-minted).
  verdict(ERPKernel._stats.edgeMintCalls === 0, '§ERP-FOLD-NOMINT  zero re-mint on replay', 'edgeMintCalls=' + ERPKernel._stats.edgeMintCalls);

  // §ERP-FOLD-BLAME — last actor per doc (a pure projection of the signed log).
  var blame = bridge.blame(db);
  verdict(blame['DOC:SO-1'] === 'bob' && blame['DOC:SO-2'] === 'alice',
    '§ERP-FOLD-BLAME  last actor per doc', 'SO-1=' + blame['DOC:SO-1'] + ' (alice→bob), SO-2=' + blame['DOC:SO-2'] + ' (bob→alice)');

  // ════ W-ERP-SIGN (tamper) ════
  // §ERP-SIGN-TAMPER — corrupt one op's parameters byte → verifyChain fails at exactly that op.
  var tid = db.exec('SELECT id FROM kernel_ops ORDER BY id LIMIT 1')[0].values[0][0];
  db.run("UPDATE kernel_ops SET parameters = parameters || 'X' WHERE id = ?", [tid]);
  var v2 = await bridge.verifyChain(db);
  verdict(!v2.ok && v2.brokeAt === tid, '§ERP-SIGN-TAMPER  tamper rejected at exact op', 'ok=' + v2.ok + ' brokeAt=' + v2.brokeAt + ' why=' + v2.why);

  // §ERP-BIND — goLiveErp rebinds the connector seam (additive; reversible; existing stub untouched until called).
  var beforeBind = Connectors._bindings && Connectors._bindings.verifyChain;
  Bridge.goLiveErp(Connectors, HOST);
  verdict(Connectors._bindings.verifyChain === 'erp' && beforeBind !== 'erp',
    '§ERP-BIND  goLiveErp rebinds connectors.verifyChain → ERP', 'was=' + beforeBind + ' now=' + Connectors._bindings.verifyChain);

  var n = 9;
  console.log('\n' + (fails === 0 ? '✅ W-ERP-SIGN + W-ERP-FOLD ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 THREW ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });
