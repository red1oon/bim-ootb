// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// erp_period_close.js — ERP.md §0.20 contract-freeze / HolyGrail §"hard parts" (compaction = period-close).
// Witness: W-PCLOSE (scripts/test_kernel_period_close.js). Spec: prompts/PERIOD_CLOSE_FOLD_POC.md §Spec.
//
// Lifts the ALREADY-GREEN abstract proof scripts/poc_showstopper.js §SHOW-CKPT onto the REAL kernel_ops log:
// a closed accounting period collapses to ONE signed checkpoint op carrying the closing balances (integer
// cents) + the prior chain-head fingerprint; pre-checkpoint ops are dropped from the LIVE log; the next
// period folds FROM the checkpoint balances (balance brought forward). Re-folding [checkpoint + post-ckpt]
// is byte/cent-identical to folding the full genesis history — so compaction loses nothing — and the
// checkpoint is tamper-evident (hash chain + controller signature over the new tip).
//
// This module COMPOSES on the kernel (commitOp / sealChain / verifyChain / replayOps) — it does NOT bloat
// kernel_ops.js. The signature reuses erp_snapshot_sign (ECDSA P-256, pinned controller key). Determinism:
// the fold reads account/cents ONLY (never timestamp/id/uuid); closePeriod re-stamps the checkpoint op to a
// RECORDED ts (an INPUT) — NO Date.now()/Math.random() on any fold/replay path.
(function () {
  'use strict';

  var CKPT_TYPE   = 'PERIOD_CLOSE';
  var REOPEN_TYPE = 'PERIOD_REOPEN';

  // ── the accounting fold (deterministic, integer cents) ──────────────────────────────────────────
  // TWO posting shapes fold here, both deterministic in integer cents; document ops (orders/ships/
  // invoices) carry neither → skipped; CKPT/REOPEN are control ops, never postings. `opening` is the
  // balance brought forward (default empty). The closing balance of an account = net cents.
  //   (1) SYNTHETIC (poc_showstopper / test_kernel_period_close): `{account:string, cents:int}`.
  //   (2) REAL — the LIVE app's §13.1 POST verb (~/bim-ootb/erp/erp_kernel.js applyOne): double-entry
  //       `{lines:[{account_id, amtacctdr, amtacctcr}]}`, ΣDR==ΣCR. Per-account b/f = Σ(DR)−Σ(CR) cents.
  //       Implementing prompts/ERP_SUBSTRATE_INTEGRATION.md §INTEG-POSTINGS-RECONCILE — Witness:
  //       W-POSTINGS-RECONCILE. Additive: the synthetic path is byte-identical when no `lines` present.
  function _isPosting(p) {
    return p && typeof p.account === 'string' && typeof p.cents === 'number' && (p.cents | 0) === p.cents;
  }
  // cents() mirrors ~/bim-ootb/erp/erp_postings.js exactly (the app's own DR/CR→cents) for an identical
  // fold; amounts are 2-dp Fact_Acct values so Math.round is deterministic (no Number drift at 2 places).
  function _cents(n) { return Math.round(Number(n || 0) * 100); }
  function foldBalances(ops, opening) {
    var bal = {}, a;
    if (opening) { for (a in opening) if (Object.prototype.hasOwnProperty.call(opening, a)) bal[a] = opening[a]; }
    (ops || []).forEach(function (op) {
      if (op.op_type === CKPT_TYPE || op.op_type === REOPEN_TYPE) return;   // control ops, not postings
      var p = op.parameters;                                                // replayOps already JSON-parses
      if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return; } }
      if (!p) return;
      if (Array.isArray(p.lines)) {                                         // (2) real double-entry POST op
        p.lines.forEach(function (l) {
          var acct = String(l.account_id);
          bal[acct] = (bal[acct] || 0) + _cents(l.amtacctdr) - _cents(l.amtacctcr);
        });
        return;
      }
      if (!_isPosting(p)) return;                                           // (1) synthetic posting
      bal[p.account] = (bal[p.account] || 0) + p.cents;
    });
    return { bal: bal };
  }

  function balSum(bal) { var s = 0; for (var a in bal) s += bal[a]; return s; }   // double-entry: 0 when balanced
  // balEqual — max absolute per-account difference in cents (0 ⇒ cent-identical). The falsifier metric.
  function balEqual(x, y) {
    var keys = {}, k, max = 0;
    for (k in x) keys[k] = 1; for (k in y) keys[k] = 1;
    for (k in keys) max = Math.max(max, Math.abs((x[k] || 0) - (y[k] || 0)));
    return { equal: max === 0, maxDiffCents: max };
  }

  function _maxId(db) {
    var r = db.exec('SELECT MAX(id) FROM kernel_ops');
    if (!r.length || r[0].values[0][0] == null) return 0;
    return Number(r[0].values[0][0]);
  }

  // ── _snapshotLog — the full signed pre-close rows as a self-describing cold-archive array.
  //    Every mutating + chain column travels so the archive is independently verifiable AND re-foldable
  //    (foldBalances reads op_type + parameters). This is what the DELETE is about to destroy.
  function _snapshotLog(db, beforeId) {
    var sql = 'SELECT id, op_uuid, timestamp, op_type, parameters, input_guids, output_guid, prev_hash, op_hash, sig, gid, branch_id FROM kernel_ops';
    if (beforeId != null) sql += ' WHERE id < ' + Number(beforeId);
    sql += ' ORDER BY id';
    var r = db.exec(sql);
    if (!r.length) return [];
    return r[0].values.map(function (v) {
      return { id: v[0], op_uuid: v[1], timestamp: v[2], op_type: v[3], parameters: v[4],
               input_guids: v[5], output_guid: v[6], prev_hash: v[7], op_hash: v[8], sig: v[9],
               gid: v[10], branch_id: v[11] };
    });
  }

  // ── closePeriod — fold the live log → closing balances → ONE signed checkpoint → (gated) compact ──
  // signer = { signTip: async(tipHex)->sigHex, signed_by?:string }.
  // periodMeta = { period, ts, archiveSink? }:
  //   archiveSink(signedArray) -> Promise<{ok:boolean, ref?:string}> — a CONFIRMED cold-archive write
  //   (CAS put / signed .log.json the operator confirmed). T3 (prompts/KERNEL_HARDENING_BATCH1_SPEC.md):
  //   the destructive compaction DELETE fires ONLY after the archive is CONFIRMED (res.ok). If the sink
  //   rejects → THROW, delete nothing. If NO sink is supplied → DO NOT compact (retain the full live log,
  //   compacted:false) — the default can never silently lose signed history. The audit's T3 timebomb was
  //   exactly this DELETE firing unconditionally with a "caller keeps the archive" comment no caller honoured.
  // ts is a RECORDED close timestamp (an INPUT), so the checkpoint op — hence the new tip — is deterministic.
  async function closePeriod(db, kernel, signer, periodMeta) {
    periodMeta = periodMeta || {};
    var period = (periodMeta.period != null) ? periodMeta.period : 1;
    var ts     = (periodMeta.ts != null) ? periodMeta.ts : 0;
    var archiveSink = (typeof periodMeta.archiveSink === 'function') ? periodMeta.archiveSink : null;

    // 1. seal + verify the period being closed; capture its chain-head fingerprint (prev_tip).
    await kernel.sealChain(db);
    var pre = await kernel.verifyChain(db);
    if (!pre.ok) throw new Error('closePeriod: pre-close chain does not verify (brokeAt=' + pre.brokeAt + ' ' + pre.why + ')');
    var prevTip = pre.tip, archived = pre.len;

    // §PCLOSE-RACE (feedback_toctou_race_scrutiny_pattern.md, same shape as erp_shard.js §T7-RACE):
    // pin the compaction boundary HERE, synchronously, BEFORE the archiveSink await below — never
    // derive it from ckptId (minted AFTER that await). A concurrent commit landing during the await
    // (e.g. a POS sale mid period-close) gets id > baseTipId: it was not in the archived snapshot, so
    // it must NOT be deleted either — it rides the hot log across the boundary, uncompacted, and is
    // picked up whole by the next fold. Witness: erp/tests/witness_pclose_race.js (pre-fix: FAIL, the
    // racing op vanished — archived nowhere, deleted anyway).
    var baseTipId = _maxId(db);

    // 2. fold the live ops → closing balances (integer cents).
    var live = kernel.replayOps(db);
    var closing = foldBalances(live, null).bal;

    // 3. ARCHIVE-FIRST GATE (T3) — before ANY mutation, hand the full pre-close log to the sink and REQUIRE
    //    a confirmation. No sink ⇒ no compaction (retain history). Sink rejects ⇒ THROW (destroy nothing).
    var willCompact = false, archiveRef = null;
    if (archiveSink) {
      var snapshot = _snapshotLog(db, baseTipId + 1);        // the live log up to the PINNED boundary
      var res = await archiveSink(snapshot);
      if (!res || !res.ok) {
        throw new Error('closePeriod: archive NOT confirmed (' + ((res && res.reason) || 'sink returned !ok') +
                        ') — compaction ABORTED, zero rows deleted (T3 gate)');
      }
      archiveRef = (res.ref != null) ? res.ref : null;
      willCompact = true;
    } else {
      console.log('§PCLOSE-NOARCHIVE compaction SKIPPED (no archiveSink) — LIVE log retains ' + archived +
                  ' pre-close ops; pass periodMeta.archiveSink to compact (T3: never delete history unconfirmed)');
    }

    // 4. commit ONE checkpoint op carrying the deterministic payload (+ the archive ref); re-stamp to ts.
    var ckptId = kernel.commitOp(db, CKPT_TYPE,
      { period: period, closing_balances: closing, prev_tip: prevTip, archive_ref: archiveRef, base_tip_id: baseTipId });
    db.run('UPDATE kernel_ops SET timestamp=? WHERE id=?', [ts, ckptId]);

    // 5. compact ONLY when the archive was confirmed: drop the ARCHIVED prefix ONLY (id <= baseTipId —
    //    a §PCLOSE-RACE survivor, id > baseTipId, keeps its row and is never touched here).
    if (willCompact) db.run('DELETE FROM kernel_ops WHERE id <= ?', [baseTipId]);

    // 6. re-seal the (possibly compacted) live log; the new tip is the fingerprint of [PERIOD_CLOSE].
    var sealRes = await kernel.sealChain(db);
    var post = await kernel.verifyChain(db);
    if (!post.ok) throw new Error('closePeriod: post-close chain does not verify');
    var tip = post.tip;

    // 7. the controller signs the NEW tip (the signed checkpoint = chain-head fingerprint signed).
    var sig = null;
    if (signer && typeof signer.signTip === 'function') sig = await signer.signTip(tip);

    console.log('§PCLOSE-FOLD period=' + period + ' archived=' + archived + ' closing=' + JSON.stringify(closing) +
                ' balSum=' + balSum(closing) + ' prevTip=' + (prevTip || '').slice(0, 12) + '…');
    console.log('§PCLOSE-COMPACT compacted=' + willCompact + ' archiveRef=' + (archiveRef || 'none') +
                ' liveLen=' + post.len + ' (was ' + archived + ') newTip=' + (tip || '').slice(0, 12) +
                '… verifyLive=' + (post.ok ? 'ok' : 'FAIL') + ' sealed=' + sealRes.sealed);
    console.log('§PCLOSE-SIGN tip=' + (tip || '').slice(0, 12) + '… signed=' + (sig ? 'Y' : 'N') +
                ' by=' + (signer && signer.signed_by || 'controller'));

    return { period: period, closing_balances: closing, prev_tip: prevTip, tip: tip, sig: sig,
             signed_by: (signer && signer.signed_by) || 'controller', archived: archived, liveLen: post.len,
             compacted: willCompact, archive_ref: archiveRef };
  }

  // ── bootstrapFromCheckpoint — opening = latest checkpoint's closing balances; fold post-ckpt forward ──
  function _latestCheckpoint(db) {
    var r = db.exec("SELECT id, parameters FROM kernel_ops WHERE op_type='" + CKPT_TYPE + "' ORDER BY id DESC LIMIT 1");
    if (!r.length || !r[0].values.length) return null;
    return { id: r[0].values[0][0], params: JSON.parse(r[0].values[0][1]) };
  }
  function bootstrapFromCheckpoint(db, kernel) {
    var ck = _latestCheckpoint(db);
    var opening = ck ? ck.params.closing_balances : {};
    var period  = ck ? ck.params.period : 0;
    // post-checkpoint ops only (id > ckptId); the checkpoint op itself is a control op, skipped by the fold.
    var live = kernel.replayOps(db);
    var post = ck ? live.filter(function (o) { return o.id > ck.id; }) : live;
    var current = foldBalances(post, opening).bal;
    console.log('§PCLOSE-BF fromCheckpoint=' + (ck ? 'Y(period=' + period + ')' : 'N') +
                ' opening=' + JSON.stringify(opening) + ' postCount=' + post.length +
                ' current=' + JSON.stringify(current));
    return { period: period, opening: opening, current: current, postCount: post.length, fromCheckpoint: !!ck };
  }

  // ── reopenPeriod (optional §PCLOSE-REOPEN) — a SUPERSEDE op re-chained onto the head; the original
  //    PERIOD_CLOSE stays in the chain (audit), never edited in place (the iDempiere reopen wrinkle). ──
  async function reopenPeriod(db, kernel, signer, meta) {
    meta = meta || {};
    var ck = _latestCheckpoint(db);
    if (!ck) throw new Error('reopenPeriod: no checkpoint to reopen');
    var ts = (meta.ts != null) ? meta.ts : 0;
    var id = kernel.commitOp(db, REOPEN_TYPE, { period: ck.params.period, supersedes_ckpt_id: ck.id, reason: meta.reason || 'reopen' });
    db.run('UPDATE kernel_ops SET timestamp=? WHERE id=?', [ts, id]);
    var sealRes = await kernel.sealChain(db);
    var v = await kernel.verifyChain(db);
    var sig = (signer && typeof signer.signTip === 'function') ? await signer.signTip(v.tip) : null;
    // the original checkpoint must still be present + the chain must still verify through it.
    var still = db.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='" + CKPT_TYPE + "'");
    var ckptCount = Number(still[0].values[0][0]);
    console.log('§PCLOSE-REOPEN supersedes=ckpt#' + ck.id + ' reopenOp=' + id + ' origCkptStillInChain=' +
                (ckptCount >= 1 ? 'Y' : 'N') + ' verify=' + (v.ok ? 'ok' : 'FAIL') + ' tip=' + (v.tip || '').slice(0, 12) + '…');
    return { period: ck.params.period, reopenId: id, tip: v.tip, sig: sig, verify: v.ok, ckptCount: ckptCount, sealed: sealRes.sealed };
  }

  var _api = {
    foldBalances: foldBalances,
    balSum: balSum,
    balEqual: balEqual,
    closePeriod: closePeriod,
    bootstrapFromCheckpoint: bootstrapFromCheckpoint,
    reopenPeriod: reopenPeriod,
    CKPT_TYPE: CKPT_TYPE,
    REOPEN_TYPE: REOPEN_TYPE
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
  if (typeof window !== 'undefined') { window.ErpPeriodClose = _api; }
  if (typeof console !== 'undefined') { console.log('§PCLOSE_LOADED v1 (period-close fold = signed checkpoint = balance b/f)'); }
})();
